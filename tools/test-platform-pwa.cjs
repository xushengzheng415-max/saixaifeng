'use strict';
/*
 * 平台运营中心可安装客户端（PWA）验证：
 * 1. 清单、主题色、图标齐全且可解析；
 * 2. Service Worker 注册生效并接管页面；
 * 3. 缓存只包含本站外壳与静态资源，不包含任何跨域接口；
 * 4. 断网后仍能打开应用外壳；
 * 5. 电脑（安装引导）、iPad（添加到主屏幕）入口与已安装隐藏逻辑正确。
 */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('./lib/load-playwright.cjs');
const root = path.resolve(__dirname, '..');
const projectRoot = path.join(root, 'platform-admin-vue');
const output = path.join(root, 'output/platform-pwa-20261028');
const baseUrl = 'http://127.0.0.1:4187';
const cloudHostPattern = /cloud1-7g8ckb3c7815a011-1419431905\.ap-shanghai\.app\.tcloudbase\.com/;

function jsonResult(bodyText) {
  let body = {};
  try { body = JSON.parse(bodyText || '{}'); } catch { body = {}; }
  if (body.action !== 'callFunction') return { success: true, data: [] };
  const functionName = String(body.functionName || '');
  const params = body.functionParams || {};
  if (functionName === 'platformOwner' && params.action === 'status') return { success: true, isPlatformOwner: true };
  if (functionName === 'manageTournamentCenterContent' && params.action === 'overview') {
    return { success: true, data: { banners: [], tournaments: [], organizers: [], accounts: [], teams: [], supportRequests: [], stats: {} } };
  }
  if (functionName === 'manageTournamentCenterContent' && params.action === 'refreshTournamentStatuses') return { success: true, data: { startedTournamentIds: [] } };
  if (functionName === 'platformOwner' && params.action === 'listRequests') return { success: true, requests: [] };
  if (functionName === 'platformOwner' && params.action === 'honeyOrdersOverview') return { success: true, overview: { available: false, totals: null, byDay: [], byPack: [] } };
  if (functionName === 'platformOwner' && params.action === 'honeyOrderList') return { success: true, list: { rows: [], total: 0, scanned: 0, page: 1, pageSize: 10 } };
  return { success: true, data: {}, rows: [], items: [], requests: [], list: { rows: [], total: 0, scanned: 0, page: 1, pageSize: 10 } };
}

async function createContext(browser, options) {
  const context = await browser.newContext(options);
  await context.addInitScript(session => {
    localStorage.setItem('platformAuthToken', 'qa-platform-token');
    localStorage.setItem('platformSession', JSON.stringify(session));
    sessionStorage.setItem('sxfPlatformAuthContext', 'platform');
  }, { userId: 'platform-owner', userName: '平台负责人', user: { _id: 'platform-owner', userName: '平台负责人' }, loginAt: Date.now() });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (cloudHostPattern.test(url.hostname)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(jsonResult(route.request().postData())) });
    }
    return route.continue();
  });
  return context;
}

const failures = [];
const notes = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const vitePath = path.join(projectRoot, 'node_modules/vite/dist/node/index.js');
  const { preview } = await import(pathToFileURL(vitePath));
  const server = await preview({
    root: projectRoot,
    configFile: path.join(projectRoot, 'vite.config.js'),
    preview: { host: '127.0.0.1', port: 4187, strictPort: true }
  });
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const report = {};

  try {
    const context = await createContext(browser, { viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto(`${baseUrl}/#/tournament-center-admin`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('.platform-console .workspace').waitFor({ timeout: 30000 });
    await page.waitForTimeout(800);

    const head = await page.evaluate(() => ({
      manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href') || '',
      themeColor: document.querySelector('meta[name=theme-color]')?.getAttribute('content') || '',
      appleCapable: document.querySelector('meta[name=apple-mobile-web-app-capable]')?.getAttribute('content') || '',
      appleIcon: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href') || '',
      viewport: document.querySelector('meta[name=viewport]')?.getAttribute('content') || ''
    }));
    report.head = head;
    check(head.manifest === '/manifest.webmanifest', '缺少 manifest 链接');
    check(head.themeColor === '#1B5E20', '主题色未设置');
    check(head.appleCapable === 'yes', '未声明 iOS 可安装');
    check(head.appleIcon === '/apple-touch-icon.png', '缺少 apple-touch-icon');
    check(head.viewport.includes('viewport-fit=cover'), 'viewport 未适配刘海屏');

    const manifest = await page.evaluate(async () => {
      const response = await fetch('/manifest.webmanifest');
      return { ok: response.ok, type: response.headers.get('content-type') || '', json: await response.json() };
    });
    report.manifest = { ok: manifest.ok, type: manifest.type, name: manifest.json.name, short: manifest.json.short_name, start: manifest.json.start_url, display: manifest.json.display, icons: manifest.json.icons?.map(icon => `${icon.sizes} ${icon.purpose || 'any'}`) };
    check(manifest.ok, 'manifest 无法访问');
    check(manifest.json.display === 'standalone', 'manifest display 不是 standalone');
    check(String(manifest.json.start_url).includes('tournament-center-admin'), 'manifest 启动页不是平台运营中心');
    check((manifest.json.icons || []).length >= 3, 'manifest 图标数量不足');

    const icons = await page.evaluate(async () => {
      const list = ['/pwa-192.png', '/pwa-512.png', '/pwa-maskable-512.png', '/apple-touch-icon.png'];
      const result = [];
      for (const src of list) {
        const image = new Image();
        const loaded = await new Promise(resolve => {
          image.onload = () => resolve(true);
          image.onerror = () => resolve(false);
          image.src = src;
        });
        result.push({ src, loaded, width: image.naturalWidth, height: image.naturalHeight });
      }
      return result;
    });
    report.icons = icons;
    const expectedSizes = { '/pwa-192.png': 192, '/pwa-512.png': 512, '/pwa-maskable-512.png': 512, '/apple-touch-icon.png': 180 };
    for (const icon of icons) {
      check(icon.loaded && icon.width === expectedSizes[icon.src] && icon.height === expectedSizes[icon.src], `图标尺寸或加载异常：${icon.src}`);
    }

    const installEntry = await page.locator('.platform-install-entry').first();
    const installText = (await installEntry.textContent())?.trim() || '';
    report.installEntry = installText;
    check(installText.includes('安装'), '电脑安装入口未显示');
    await installEntry.click();
    await page.locator('.platform-install-guide').waitFor({ state: 'visible', timeout: 8000 });
    await page.waitForTimeout(500);
    const guideText = (await page.locator('.platform-install-guide').textContent()) || '';
    report.guideText = guideText.slice(0, 200);
    check(/安装|主屏幕/.test(guideText), '安装引导内容异常');
    await page.screenshot({ path: path.join(output, 'desktop-install-guide.png') });
    await page.locator('.platform-install-guide .el-dialog__footer .el-button').click();
    await page.waitForTimeout(400);

    const registration = await page.evaluate(async () => {
      const registered = await Promise.race([
        navigator.serviceWorker.ready.then(result => ({ scope: result.scope, state: result.active && result.active.state })),
        new Promise(resolve => setTimeout(() => resolve(null), 12000))
      ]);
      return registered;
    });
    report.registration = registration;
    check(Boolean(registration), 'Service Worker 未在 12 秒内就绪');
    check(registration && registration.scope.endsWith('/'), 'Service Worker 作用域不是站点根');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.platform-console .workspace').waitFor({ timeout: 30000 });
    await page.waitForTimeout(600);
    const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
    report.controlled = controlled;
    check(controlled, '刷新后页面未被 Service Worker 接管');

    const cacheState = await page.evaluate(async () => {
      const keys = await caches.keys();
      const entries = [];
      for (const key of keys) {
        const cache = await caches.open(key);
        for (const request of await cache.keys()) entries.push(request.url);
      }
      return { keys, entries };
    });
    report.caches = cacheState;
    check(cacheState.keys.length > 0, '未创建离线缓存');
    check(cacheState.entries.some(url => url.endsWith('/index.html')), '离线缓存缺少应用外壳 index.html');
    check(cacheState.entries.some(url => url.includes('/assets/')), '离线缓存缺少构建静态资源');
    check(!cacheState.entries.some(url => /cloudbase|webLoginApi/.test(url)), '缓存中混入了云函数接口地址');

    await page.screenshot({ path: path.join(output, 'desktop-online.png') });

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    const offline = await page.evaluate(() => ({
      appChildren: document.querySelector('#app')?.children.length || 0,
      consoleVisible: Boolean(document.querySelector('.platform-console')),
      loginVisible: Boolean(document.querySelector('.platform-login')),
      hash: location.hash
    }));
    report.offline = offline;
    check(offline.appChildren > 0, '断网后应用未渲染');
    check(offline.consoleVisible || offline.loginVisible, '断网后既没有控制台也没有登录页');
    await page.screenshot({ path: path.join(output, 'desktop-offline.png') });
    await context.setOffline(false);
    await context.close();

    const loginContext = await createContext(browser, { viewport: { width: 1440, height: 900 } });
    const loginPage = await loginContext.newPage();
    await loginPage.goto(`${baseUrl}/#/platform-login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await loginPage.locator('.platform-login .form-card').waitFor({ timeout: 30000 });
    await loginPage.waitForTimeout(600);
    const loginEntry = loginPage.locator('.platform-login .platform-install-entry').first();
    const loginEntryText = (await loginEntry.textContent())?.trim() || '';
    report.loginEntry = loginEntryText;
    check(loginEntryText.includes('安装'), '登录页未显示安装入口');
    await loginPage.screenshot({ path: path.join(output, 'desktop-login.png') });
    await loginEntry.click();
    await loginPage.locator('.platform-install-guide').waitFor({ state: 'visible', timeout: 8000 });
    await loginPage.waitForTimeout(500);
    const loginGuide = (await loginPage.locator('.platform-install-guide').textContent()) || '';
    report.loginGuide = loginGuide.slice(0, 120);
    check(/安装|主屏幕/.test(loginGuide), '登录页安装引导内容异常');
    await loginPage.screenshot({ path: path.join(output, 'desktop-login-install.png') });
    await loginContext.close();

    const iosContext = await createContext(browser, {
      viewport: { width: 768, height: 1024 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
    });
    const iosPage = await iosContext.newPage();
    await iosPage.goto(`${baseUrl}/#/tournament-center-admin`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await iosPage.locator('.platform-console .workspace').waitFor({ timeout: 30000 });
    await iosPage.waitForTimeout(700);
    const iosEntry = (await iosPage.locator('.platform-install-entry').first().textContent())?.trim() || '';
    report.iosEntry = iosEntry;
    check(iosEntry.includes('主屏幕'), 'iPad 未显示添加到主屏幕入口');
    await iosPage.locator('.platform-install-entry').first().click();
    await iosPage.locator('.platform-install-guide').waitFor({ state: 'visible', timeout: 8000 });
    await iosPage.waitForTimeout(500);
    const iosGuide = (await iosPage.locator('.platform-install-guide').textContent()) || '';
    check(iosGuide.includes('添加到主屏幕'), 'iPad 引导文案未包含添加到主屏幕');
    await iosPage.screenshot({ path: path.join(output, 'ipad-portrait-install-guide.png') });
    await iosPage.goto(`${baseUrl}/#/platform-login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await iosPage.locator('.platform-login .form-card').waitFor({ timeout: 30000 });
    await iosPage.waitForTimeout(500);
    const iosLoginEntry = (await iosPage.locator('.platform-login .platform-install-entry').first().textContent())?.trim() || '';
    report.iosLoginEntry = iosLoginEntry;
    check(iosLoginEntry.includes('主屏幕'), 'iPad 登录页未显示添加到主屏幕入口');
    await iosPage.screenshot({ path: path.join(output, 'ipad-login.png') });
    await iosContext.close();

    const standaloneContext = await createContext(browser, { viewport: { width: 1180, height: 820 }, isMobile: false });
    await standaloneContext.addInitScript(() => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = query => (query.includes('display-mode: standalone') ? { matches: true, media: query, addEventListener() {}, removeEventListener() {} } : original(query));
    });
    const standalonePage = await standaloneContext.newPage();
    await standalonePage.goto(`${baseUrl}/#/tournament-center-admin`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await standalonePage.locator('.platform-console .workspace').waitFor({ timeout: 30000 });
    await standalonePage.waitForTimeout(600);
    report.standaloneEntryCount = await standalonePage.locator('.platform-install-entry').count();
    check(report.standaloneEntryCount === 0, '已安装（独立窗口）仍显示安装入口');
    await standalonePage.screenshot({ path: path.join(output, 'standalone-1180.png') });
    await standaloneContext.close();

    if (pageErrors.length) failures.push(...pageErrors.map(message => `页面异常：${message}`));
  } catch (error) {
    failures.push(`执行异常：${error.message}`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.httpServer.close(resolve));
  }

  const result = { status: failures.length ? 'failed' : 'passed', failures, notes, report };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: result.status, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
})();
