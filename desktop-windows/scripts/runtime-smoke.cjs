'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { once } = require('node:events');
async function until(check, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('Timed out waiting for runtime state');
}
exports.run = async ({ app, win, home, retry, connection, updater, output }) => {
  const result = { channel: home.includes('/preview/') ? 'preview' : 'production', version: app.getVersion(), checks: [] };
  try {
    // Keep hidden test windows painting so screenshots reflect the current DOM.
    win.webContents.setBackgroundThrottling(false);
    await fs.mkdir(output, { recursive: true });
    await until(async () => win.webContents.getURL().startsWith('https://www.sxffootball.cn/') &&
      await win.webContents.executeJavaScript('document.readyState !== "loading"'));
    await until(() => win.webContents.executeJavaScript('Array.from(document.querySelectorAll("iframe")).some(frame => frame.src.startsWith("https://open.weixin.qq.com/"))'));
    await until(async () => {
      const qr = win.webContents.mainFrame.frames.find(frame => frame.url.startsWith('https://open.weixin.qq.com/'));
      return qr && await qr.executeJavaScript('Array.from(document.images).some(img => img.complete && img.naturalWidth > 100)').catch(() => false);
    }, 45000);
    const prefs = win.webContents.getLastWebPreferences();
    assert.equal(prefs.nodeIntegration, false);
    assert.equal(prefs.contextIsolation, true);
    assert.equal(prefs.sandbox, true);
    assert.equal(await win.webContents.executeJavaScript('typeof window.require'), 'undefined');
    result.checks.push('live login page and WeChat QR iframe loaded', 'sandbox enabled; renderer has no Node API');
    result.entry = home;
    await until(() => win.webContents.executeJavaScript('!!document.querySelector("[data-desktop-login]") && !!document.querySelector(".sxf-desktop-qr-status[hidden]")'));
    assert.ok(await win.webContents.executeJavaScript('(function(){const footer=document.querySelector(".sxf-desktop-footer");return !!footer && footer.textContent.includes("v") && !!footer.querySelector(".sxf-desktop-update")})()'));
    // 新版网页自带品牌栏，外壳不再重复插入品牌；两套来源都算通过。
    assert.ok(await win.webContents.executeJavaScript('(function(){const own=document.querySelector(".sxf-desktop-brand h1");if(own)return own.textContent==="赛小蜂足球";const host=document.querySelector(".login-brand");const img=host&&host.querySelector("img");return !!img&&(img.getAttribute("alt")||"").includes("赛小蜂足球")})()'));
    win.setSize(1439, 960);
    await new Promise(resolve => setTimeout(resolve, 250));
    win.setSize(1440, 960);
    await new Promise(resolve => setTimeout(resolve, 250));
    await fs.writeFile(path.join(output, 'login.png'), (await win.webContents.capturePage()).toPNG());
    const futureParts = app.getVersion().split('.').map(Number); futureParts[2] += 1;
    const futureVersion = futureParts.join('.');
    updater.acceptManifest({ version: futureVersion, url: `https://www.sxffootball.cn/desktop/windows/SxfFootball-Setup-${futureVersion}-x64.exe`, sha256: 'a'.repeat(64), bytes: 120000000, notes: ['仅供本地标识验证，不会下载或发布'] });
    await until(() => win.webContents.executeJavaScript(`document.querySelector('.sxf-desktop-update')?.textContent.includes(${JSON.stringify('可更新 v' + futureVersion)})`));
    assert.ok(require('electron').Menu.getApplicationMenu().getMenuItemById('desktop-update').label.includes(futureVersion));
    win.setSize(1439,960); await new Promise(resolve => setTimeout(resolve,200)); win.setSize(1440,960);
    await new Promise(resolve => setTimeout(resolve,200));
    await fs.writeFile(path.join(output, 'update-preview-fixture.png'), (await win.webContents.capturePage()).toPNG());
    result.checks.push('validated newer-version fixture shows native menu and in-page update badge');
    const oldQr = await win.webContents.executeJavaScript('document.querySelector(".qr-shell iframe").src');
    await win.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('sxf:qr-status', { detail: { url: ${JSON.stringify(oldQr)}, state:'expired' } }));`);
    assert.ok(await win.webContents.executeJavaScript('document.querySelector(".sxf-desktop-qr-status").textContent.includes("请刷新二维码后扫码")'));
    await win.webContents.executeJavaScript('document.querySelector(".sxf-desktop-qr-status button").click(); undefined');
    await until(async () => await win.webContents.executeJavaScript('document.querySelector(".qr-shell iframe").src') !== oldQr);
    await until(() => win.webContents.executeJavaScript('!!document.querySelector(".sxf-desktop-qr-status[hidden]")'), 45000);
    result.checks.push('QR expiry feedback and refresh obtain a new live QR');
    // Regression: same-document routing used to arm a timer that never cleared.
    connection.setTimeoutMs(900);
    await win.webContents.executeJavaScript('location.hash = "/login?desktop_route_check=1"; undefined');
    await new Promise(resolve => setTimeout(resolve, 1200));
    assert.ok(win.webContents.getURL().startsWith('https://www.sxffootball.cn/'));
    assert.equal(connection.snapshot().failed, false);
    connection.setTimeoutMs(30000);
    win.setSize(1024, 720);
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(await win.webContents.executeJavaScript('document.documentElement.scrollWidth > innerWidth'), false);
    await fs.writeFile(path.join(output, 'login-1024.png'), (await win.webContents.capturePage()).toPNG());
    win.setSize(1440, 960);
    result.checks.push('branded login, 1024px layout, and SPA route timeout regression verified');
    // Export a synthetic local file. No business writes or account data are involved.
    const downloadDone = new Promise(resolve => win.webContents.session.once('will-download', (_event, item) => {
      item.once('done', (_done, state) => resolve({ state, file: item.getSavePath() }));
    }));
    await win.webContents.executeJavaScript(`(() => {
      const url = URL.createObjectURL(new Blob(['SXF desktop synthetic download'], {type:'text/plain'}));
      const link = document.createElement('a'); link.href = url; link.download = 'desktop-smoke.txt';
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    })()`);
    const download = await Promise.race([downloadDone, new Promise((_, reject) => setTimeout(() => reject(new Error('Download timeout')), 15000))]);
    assert.equal(download.state, 'completed');
    assert.equal(await fs.readFile(download.file, 'utf8'), 'SXF desktop synthetic download');
    result.checks.push('blob export saved and content verified');
    const childCreated = once(win.webContents, 'did-create-window');
    await win.webContents.executeJavaScript('void window.open("about:blank", "desktop-smoke-print")');
    const [child] = await childCreated;
    assert.equal(child.webContents.getLastWebPreferences().nodeIntegration, false);
    assert.equal(child.webContents.getLastWebPreferences().sandbox, true);
    await child.webContents.executeJavaScript('document.body.textContent = "SXF synthetic print verification"');
    const pdf = await child.webContents.printToPDF({});
    assert.ok(pdf.length > 500);
    await fs.writeFile(path.join(output, 'print.pdf'), pdf);
    child.close();
    result.checks.push('print popup sandbox and PDF rendering verified');
    win.webContents.session.webRequest.onBeforeRequest({ urls: [home + '*'] }, (_details, callback) => callback({ cancel: true }));
    // ERR_BLOCKED_BY_CLIENT exercises the same did-fail-load path as network loss.
    await win.loadURL(home).catch(() => {});
    await until(() => win.webContents.getURL().startsWith('file:') && !win.webContents.isLoading());
    assert.ok(await win.webContents.executeJavaScript('document.body.innerText.includes("暂时无法连接")'));
    await fs.writeFile(path.join(output, 'offline.png'), (await win.webContents.capturePage()).toPNG());
    win.webContents.session.webRequest.onBeforeRequest(null);
    await retry();
    await until(() => win.webContents.getURL().startsWith('https://www.sxffootball.cn/') && !win.webContents.isLoading());
    result.checks.push('connection error page and retry recovery verified');
    result.status = 'passed';
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    app.exit(0);
  } catch (error) {
    result.status = 'failed'; result.error = error.message;
    await fs.writeFile(path.join(output, 'failure.png'), (await win.webContents.capturePage()).toPNG()).catch(() => {});
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.error(JSON.stringify(result)); app.exit(1);
  }
};
