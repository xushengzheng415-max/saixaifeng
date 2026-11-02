'use strict';
const { app, BrowserWindow, Menu, dialog, shell, session, clipboard, nativeImage, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { ORIGIN, isSite, isNavigationAllowed, isExternalAllowed, isPopupAllowed, safeFilename } = require('./policy.cjs');
const { createConnection } = require('./connection.cjs');
const { installLoginBranding } = require('./login-branding.cjs');
const { createUpdater, verifyUpdateFile } = require('./updates.cjs');
const { refreshPlan } = require('./refresh.cjs');

const preview = process.argv.includes('--preview');
const home = `${ORIGIN}/${preview ? 'preview/admin' : 'admin'}/`;
const offline = pathToFileURL(path.join(__dirname, 'offline.html')).href;
const smokeOutput = process.env.SXF_DESKTOP_SMOKE_DIR;
// Test runs never reuse a person's login profile.
app.setPath('userData', smokeOutput ? path.join(path.resolve(smokeOutput), 'profile')
  : path.join(app.getPath('appData'), preview ? 'SxfFootball-Preview' : 'SxfFootball'));
app.setName('赛小蜂足球');
let mainWindow;
let connection;
let updater;
let updateDialogOpen = false;
let installPromptedVersion = '';
// idle | downloading | ready | failed — 本地下载进度，与清单检查状态分开。
let updatePackage = { status: 'idle', version: '', path: '', url: '' };
const securePreferences = { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, spellcheck: false };

function visibleUpdateStatus(state = updater?.snapshot() || { status: 'idle' }) {
  if (updatePackage.status === 'ready' && updatePackage.version) return { status: 'ready', version: updatePackage.version, url: updatePackage.url || null };
  if (updatePackage.status === 'downloading' && updatePackage.version) return { status: 'downloading', version: updatePackage.version, url: updatePackage.url || null };
  const available = state.status === 'available';
  return { status: state.status, version: state.release?.version, url: available ? state.release.url : null };
}

function publishUpdateUi(state = updater?.snapshot() || { status: 'idle' }) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const visible = visibleUpdateStatus(state);
  const item = Menu.getApplicationMenu()?.getMenuItemById('desktop-update');
  if (item) {
    item.label = visible.status === 'ready' ? `重启更新 v${visible.version}`
      : visible.status === 'downloading' ? `正在下载 v${visible.version}…`
      : visible.status === 'available' ? `可更新 v${visible.version}`
      : '检查更新';
  }
  const badged = visible.status === 'available' || visible.status === 'downloading' || visible.status === 'ready';
  mainWindow.setOverlayIcon(badged ? nativeImage.createFromPath(path.join(__dirname, '../assets/update-badge.png')) : null,
    badged ? `发现新版本 ${visible.version || ''}` : '');
  if (isSite(mainWindow.webContents.getURL())) {
    void mainWindow.webContents.executeJavaScript(`window.__sxfDesktopUpdate=${JSON.stringify(visible)};window.dispatchEvent(new Event('sxf:desktop-update'));`).catch(() => {});
  }
}

function startBackgroundUpdateDownload(release) {
  if (smokeOutput || !mainWindow || mainWindow.isDestroyed() || !release?.url || !release.version) return;
  if (updatePackage.version === release.version && (updatePackage.status === 'downloading' || updatePackage.status === 'ready')) return;
  updatePackage = { status: 'downloading', version: release.version, path: '', url: release.url };
  publishUpdateUi();
  mainWindow.webContents.downloadURL(release.url);
}

function renderUpdateState(state) {
  publishUpdateUi(state);
  // 发现新版本后直接后台下载，不先打断用户；烟测不下载。
  if (!smokeOutput && state.status === 'available' && state.release) startBackgroundUpdateDownload(state.release);
}

async function promptInstallReady(filePath, version) {
  if (!mainWindow || mainWindow.isDestroyed() || updateDialogOpen) return;
  if (version && version === installPromptedVersion) return;
  updateDialogOpen = true;
  if (version) installPromptedVersion = version;
  try {
    const { response } = await dialog.showMessageBox(mainWindow, {
      title: '更新已准备就绪',
      message: `赛小蜂足球 v${version || ''} 已在后台下载完成`,
      detail: `当前版本 v${app.getVersion()}\n\n无需再走安装向导。点「立即重启更新」后客户端会关闭，在后台静默完成更新并自动重新打开。`,
      buttons: ['稍后', '立即重启更新'], defaultId: 1, cancelId: 0, noLink: true
    });
    if (response === 1) runUpdateInstaller(filePath);
  } finally {
    updateDialogOpen = false;
  }
}

async function showUpdates(knownState) {
  if (!mainWindow || mainWindow.isDestroyed() || updateDialogOpen) return;
  if (updatePackage.status === 'ready' && updatePackage.path) {
    installPromptedVersion = '';
    return promptInstallReady(updatePackage.path, updatePackage.version);
  }
  if (updatePackage.status === 'downloading') {
    return dialog.showMessageBox(mainWindow, {
      title: '正在后台更新',
      message: `正在下载 v${updatePackage.version}…`,
      detail: '下载与校验在后台进行，完成后会提示重启更新，无需重新运行安装向导。'
    });
  }
  updateDialogOpen = true;
  try {
    const state = knownState?.status === 'available'
      ? knownState
      : (updater.snapshot().status === 'available' ? updater.snapshot() : await updater.check());
    if (state.status !== 'available') {
      return dialog.showMessageBox(mainWindow, { title: '检查更新', message: state.status === 'current' ? `当前已是最新版 v${app.getVersion()}` : '暂时无法检查更新，请稍后重试。' });
    }
    startBackgroundUpdateDownload(state.release);
    await dialog.showMessageBox(mainWindow, {
      title: '发现新版本',
      message: `赛小蜂足球 v${state.release.version}`,
      detail: `当前版本 v${app.getVersion()}\n\n${(state.release.notes || []).join('\n')}\n\n已开始后台下载。完成后会提示重启，在后台静默更新，不必手动重装。`
    });
  } finally {
    updateDialogOpen = false;
  }
  // 下载若在提示框打开期间完成，这里补一次重启确认。
  if (updatePackage.status === 'ready' && updatePackage.path) {
    installPromptedVersion = '';
    return promptInstallReady(updatePackage.path, updatePackage.version);
  }
}

// 更新包放在应用自己的目录，不再弹保存对话框，也不落到用户的下载文件夹。
function updateDownloadTarget(filename) {
  const dir = path.join(app.getPath('userData'), 'updates');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, filename);
}

// NSIS 静默安装：当前安装器为 perMachine:false + asInvoker，不需要管理员权限。
// 安装器会结束仍在运行的实例并覆盖文件，安装完成后自动启动新版本。
function runUpdateInstaller(file) {
  try { spawn(file, ['/S'], { detached: true, stdio: 'ignore' }).unref(); } catch { /* 安装器启动失败时保持客户端可用 */ }
  app.quit();
}


async function external(url, parent) {
  if (!isExternalAllowed(url)) return;
  const target = new URL(url);
  const { response } = await dialog.showMessageBox(parent, {
    type: 'question', title: '打开外部网站', message: `在浏览器中打开 ${target.hostname}？`,
    buttons: ['取消', '打开'], defaultId: 0, cancelId: 0, noLink: true
  });
  if (response === 1) await shell.openExternal(url);
}
function load(url = home, options) {
  return mainWindow.loadURL(url, options).catch(() => {});
}
// 站点部署在 CDN 上，普通同址 loadURL（尤其 Vue hash 路由）常常无刷新反应。
// 站内同址改用忽略缓存整页重载；离线页/OAuth 回退仍带 no-cache 导航入口。
function retry() {
  if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve();
  const current = mainWindow.webContents.getURL();
  const target = connection.target(current);
  const plan = refreshPlan(current, target);
  if (plan.mode === 'reload-ignoring-cache') {
    mainWindow.webContents.reloadIgnoringCache();
    return Promise.resolve();
  }
  return load(plan.url, { extraHeaders: plan.extraHeaders });
}
function harden(win) {
  const contents = win.webContents;
  contents.setWindowOpenHandler(({ url }) => {
    if (isPopupAllowed(url, contents.getURL())) return {
      action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { ...securePreferences } }
    };
    void external(url, win);
    return { action: 'deny' };
  });
  contents.on('did-create-window', child => harden(child));
  const guard = (event, url) => {
    const release = updater?.snapshot();
    const updateUrl = updatePackage.url || (release?.status === 'available' ? release.release.url : '');
    if (url === `${ORIGIN}/desktop/windows/check-update` || (updateUrl && url === updateUrl)) {
      event.preventDefault(); void showUpdates(); return;
    }
    if (isNavigationAllowed(url)) return;
    event.preventDefault();
    void external(url, win);
  };
  contents.on('will-navigate', guard);
  contents.on('will-redirect', (event, url, _inPlace, isMainFrame) => { if (isMainFrame) guard(event, url); });
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.on('page-title-updated', event => { event.preventDefault(); win.setTitle(`赛小蜂足球 v${app.getVersion()}${preview ? ' · 测试版' : ''}`); });
}
function configureSession() {
  const current = session.defaultSession;
  current.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  current.setPermissionCheckHandler(() => false);
  current.on('will-download', (_event, item, contents) => {
    const owner = BrowserWindow.fromWebContents(contents) || mainWindow;
    const filename = safeFilename(item.getFilename());
    const updateState = updater?.snapshot();
    const expected = updateState?.status === 'available' && item.getURL() === updateState.release.url ? updateState.release.sha256 : null;
    if (smokeOutput) item.setSavePath(path.join(path.resolve(smokeOutput), filename));
    // 更新包由客户端自己接管：固定存到应用目录，不弹保存对话框，也不落到用户的下载文件夹。
    else if (expected) item.setSavePath(updateDownloadTarget(filename));
    else item.setSaveDialogOptions({ title: '保存文件', defaultPath: path.join(app.getPath('downloads'), filename) });
    item.on('updated', (_updateEvent, state) => {
      if (!expected || smokeOutput || !mainWindow || mainWindow.isDestroyed() || state !== 'progressing') return;
      const total = item.getTotalBytes();
      mainWindow.setProgressBar(total > 0 ? item.getReceivedBytes() / total : -1);
    });
    item.once('done', async (_doneEvent, state) => {
      if (expected && !smokeOutput && mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(-1);
      if (state === 'completed' && expected && !smokeOutput) {
        try {
          if (!await verifyUpdateFile(item.getSavePath(), expected)) throw new Error('checksum');
          updatePackage = {
            status: 'ready',
            version: updateState.release.version,
            path: item.getSavePath(),
            url: updateState.release.url
          };
          publishUpdateUi(updateState);
          await promptInstallReady(item.getSavePath(), updateState.release.version);
        } catch {
          updatePackage = { status: 'failed', version: updateState.release?.version || '', path: '', url: updateState.release?.url || '' };
          publishUpdateUi(updateState);
          void dialog.showMessageBox(owner, { type: 'error', message: '更新包校验未通过', detail: '请重新检查更新后再试，暂勿运行该文件。' });
        }
      } else if (expected && !smokeOutput && state !== 'completed') {
        updatePackage = { status: 'failed', version: updateState.release?.version || '', path: '', url: updateState.release?.url || '' };
        publishUpdateUi(updateState);
        if (state !== 'cancelled') {
          void dialog.showMessageBox(owner, { type: 'error', title: '更新下载未完成', message: '请检查网络后，从菜单或登录页再次检查更新。' });
        }
      } else if (state !== 'completed' && state !== 'cancelled' && !smokeOutput) {
        void dialog.showMessageBox(owner, { type: 'error', title: '下载未完成', message: '请检查网络后重新导出或下载。' });
      }
    });
  });
}
function menu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { id: 'desktop-update', label: '检查更新', click: () => void showUpdates() },
    { label: '赛小蜂足球', submenu: [
      { label: '返回首页', accelerator: 'Alt+Home', click: () => void load() },
      { label: preview ? '切换正式版' : '切换测试版', click: async () => {
        const { response } = await dialog.showMessageBox(mainWindow, { type: 'question',
          message: preview ? '重启并切换正式版？' : '重启并切换测试版？测试版也连接正式后端，请使用测试数据。',
          buttons: ['取消', '切换'], defaultId: 0, cancelId: 0 });
        if (response === 1) {
          const args = process.argv.slice(1).filter(arg => arg !== '--preview');
          if (!preview) args.push('--preview');
          app.relaunch({ args }); app.quit();
        }
      } },
      { type: 'separator' }, { role: 'quit', label: '退出' }
    ] },
    { label: '页面', submenu: [
      { label: '后退', accelerator: 'Alt+Left', click: () => { const h = mainWindow.webContents.navigationHistory; if (h.canGoBack()) h.goBack(); } },
      { label: '前进', accelerator: 'Alt+Right', click: () => { const h = mainWindow.webContents.navigationHistory; if (h.canGoForward()) h.goForward(); } },
      { label: '刷新', accelerator: 'CmdOrCtrl+R', click: () => void retry() },
      { type: 'separator' }, { role: 'resetZoom', label: '实际大小' }, { role: 'zoomIn', label: '放大' }, { role: 'zoomOut', label: '缩小' },
      { role: 'togglefullscreen', label: '全屏' },
      { label: '打印', accelerator: 'CmdOrCtrl+P', click: () => mainWindow.webContents.print({}, (success, reason) => {
        if (!success && reason !== 'cancelled') void dialog.showMessageBox(mainWindow, { type: 'info', message: '打印未完成，请检查打印机或重新选择打印。' });
      }) }
    ] },
    { label: '编辑', submenu: [{ role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' }, { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }] },
    { label: '帮助', submenu: [
      { label: '复制连接诊断', click: () => {
        clipboard.writeText(JSON.stringify({ version: app.getVersion(), channel: preview ? 'preview' : 'production', ...connection.snapshot() }, null, 2));
        void dialog.showMessageBox(mainWindow, { message: '连接诊断已复制', detail: '只包含版本、入口与错误码，不包含登录凭据。' });
      } },
      { label: '打开下载目录', click: () => void shell.openPath(app.getPath('downloads')) },
      { label: '在浏览器中打开', click: () => void shell.openExternal(isSite(mainWindow.webContents.getURL()) ? mainWindow.webContents.getURL() : home) },
      { label: '关于', click: () => void dialog.showMessageBox(mainWindow, { title: '关于赛小蜂足球', message: `赛小蜂足球 ${app.getVersion()}`, detail: `Windows 联网客户端 · ${preview ? '测试版' : '正式站入口'}\n网页功能联网更新，客户端外壳通过新安装包更新。\n测试版与正式版登录资料分开保存，均连接现有云端服务。` }) }
    ] }
  ]));
}
async function createWindow() {
  configureSession();
  mainWindow = new BrowserWindow({ width: 1440, height: 960, minWidth: 1024, minHeight: 700,
    show: false, title: `赛小蜂足球 v${app.getVersion()}`, backgroundColor: '#f6f8f7',
    icon: path.join(__dirname, '../assets/icon.png'), webPreferences: { ...securePreferences } });
  harden(mainWindow);
  installLoginBranding(mainWindow, { preview, version: app.getVersion() });
  mainWindow.once('ready-to-show', () => { if (!smokeOutput) mainWindow.show(); });
  connection = createConnection({ home, onFailure: error => {
    try {
      const file = path.join(app.getPath('userData'), 'connection.log');
      const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-49) : [];
      previous.push(JSON.stringify({ time: new Date().toISOString(), ...error }));
      fs.writeFileSync(file, previous.join('\n') + '\n');
    } catch { /* Diagnostics must never prevent recovery. */ }
    mainWindow.webContents.stop();
    void mainWindow.loadFile(path.join(__dirname, 'offline.html'), { query: { code: String(error.code), channel: preview ? 'preview' : 'production' } });
  } });
  mainWindow.webContents.on('did-start-navigation', (_event, url, isInPlace, isMainFrame) => {
    connection.start(url, isInPlace, isMainFrame);
  });
  mainWindow.webContents.on('dom-ready', () => {
    if (isSite(mainWindow.webContents.getURL())) connection.ready();
    renderUpdateState(updater.snapshot());
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
    connection.error(code, url, isMainFrame);
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (mainWindow.webContents.getURL().startsWith(offline) && isSite(url)) {
      event.preventDefault(); void retry();
    }
  });
  mainWindow.webContents.on('render-process-gone', () => {
    connection.error('RENDERER', home, true);
  });
  mainWindow.on('closed', () => connection.dispose());
  menu();
  await mainWindow.loadFile(path.join(__dirname, 'loading.html'));
  void load();
  return mainWindow;
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
  app.whenReady().then(async () => {
    app.setAppUserModelId('cn.sxffootball.desktop');
    updater = createUpdater({ version: app.getVersion(), fetcher: (...args) => net.fetch(...args), onChange: renderUpdateState });
    const win = await createWindow();
    if (smokeOutput) await require('../scripts/runtime-smoke.cjs').run({ app, win, home, retry, connection, updater, output: smokeOutput });
    else updater.start();
  }).catch(() => { dialog.showErrorBox('客户端无法启动', '请重新打开客户端；若仍无法启动，请重新安装。'); app.exit(1); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => updater?.dispose());
}
