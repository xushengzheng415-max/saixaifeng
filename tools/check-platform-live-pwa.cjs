'use strict';
/*
 * 线上（pingtai.sxffootball.cn）可安装能力核查：
 * 只读页面与浏览器安装判定，不改动线上数据。
 * 1. 登录页是否显示安装入口与说明；
 * 2. manifest 可解析、start_url 与图标数量正确；
 * 3. Service Worker 已激活并接管页面；
 * 4. 浏览器安装判定结果（无痕/无头模式会返回 in-incognito，属预期）；
 * 5. 安卓设备的 APK 下载入口、弹窗分支，以及线上 APK 大小/摘要与更新清单一致；
 * 6. release.json 发布清单可读，线上包包含更新探测（新版本可一键刷新，无需重装）。
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('./lib/load-playwright.cjs');
const output = path.join(path.resolve(__dirname, '..'), 'output/platform-pwa-live-20261028');
const site = 'https://pingtai.sxffootball.cn';

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const report = {};

  await page.goto(`${site}/#/platform-login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.locator('.platform-login .form-card').waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);

  report.head = await page.evaluate(() => ({
    title: document.title,
    manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href') || '',
    theme: document.querySelector('meta[name=theme-color]')?.getAttribute('content') || '',
    colorScheme: document.querySelector('meta[name=color-scheme]')?.getAttribute('content') || '',
    appleCapable: document.querySelector('meta[name=apple-mobile-web-app-capable]')?.getAttribute('content') || '',
    appleIcon: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href') || '',
    installEntry: document.querySelector('.platform-login .platform-install-entry')?.textContent?.trim() || '',
    installNote: document.querySelector('.platform-login .install-note')?.textContent?.trim() || ''
  }));

  report.manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel=manifest]').getAttribute('href');
    const response = await fetch(href, { cache: 'no-store' });
    let json = null;
    try { json = await response.json(); } catch { json = null; }
    return { href, status: response.status, type: response.headers.get('content-type'), display: json?.display, displayOverride: json?.display_override, start: json?.start_url, icons: json?.icons?.length || 0 };
  });

  report.serviceWorker = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const registration = await Promise.race([
      navigator.serviceWorker.ready.then(result => ({ scope: result.scope, state: result.active?.state })),
      new Promise(resolve => setTimeout(() => resolve(null), 15000))
    ]);
    return { supported: true, registration, controlled: Boolean(navigator.serviceWorker.controller) };
  });

  report.titlebar = await page.evaluate(async () => {
    const hrefs = Array.from(document.querySelectorAll('link[rel=stylesheet]')).map(link => link.getAttribute('href')).filter(Boolean);
    const wcoChunks = [];
    for (const href of hrefs) {
      const text = await fetch(href, { cache: 'no-store' }).then(response => response.text()).catch(() => '');
      if (text.includes('window-controls-overlay')) wcoChunks.push(href);
    }
    return { present: Boolean(document.querySelector('.platform-titlebar')), stylesheets: hrefs.length, wcoChunks };
  });

  // 更新可刷新能力：发布清单可读，且线上包确实带更新探测事件。
  report.updateCheck = await page.evaluate(async () => {
    const releaseResponse = await fetch(`/release.json?t=${Date.now()}`, { cache: 'no-store' });
    let release = null;
    try { release = await releaseResponse.json(); } catch { release = null; }
    const scripts = Array.from(document.scripts).map(script => script.src).filter(Boolean);
    const texts = await Promise.all(scripts.map(src => fetch(src, { cache: 'no-store' }).then(response => response.text()).catch(() => '')));
    return {
      status: releaseResponse.status,
      release: release?.release || '',
      branch: release?.branch || '',
      scripts: scripts.length,
      hasUpdateWatch: texts.some(text => text.includes('sxf-platform-check-update'))
    };
  });

  const cdp = await context.newCDPSession(page);
  // 浏览器是否真的解析了 manifest：MIME 不对（例如 application/octet-stream）时会直接忽略，
  // display_override 也就永远不生效，桌面应用窗口只能退回浏览器自绘的浅底白字标题条。
  try {
    const appManifest = await cdp.send('Page.getAppManifest');
    let parsed = null;
    try { parsed = JSON.parse(appManifest.data || ''); } catch { parsed = null; }
    report.appManifest = {
      url: appManifest.url || '',
      name: parsed?.name || '',
      shortName: parsed?.short_name || '',
      errors: (appManifest.errors || []).map(item => item.message || item.critical || String(item)),
      manifestErrors: (appManifest.manifestErrors || []).map(item => item.message || String(item)),
      displayOverride: parsed?.display_override || null,
      themeColor: parsed?.theme_color || ''
    };
  } catch (error) {
    report.appManifest = { error: error.message };
  }
  try {
    report.installability = await cdp.send('Page.getInstallabilityErrors');
  } catch (error) {
    report.installability = { error: error.message };
  }

  report.pageErrors = pageErrors;
  await page.screenshot({ path: path.join(output, 'live-login.png') });

  // 线上行为核查：拦截 /release.json 模拟一次“新发布”，确认提示出现且“立即刷新”真的重载页面。
  const noticeContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const noticePage = await noticeContext.newPage();
  let fakeRelease = 'qa-live-baseline-0001';
  await noticePage.route('**/release.json*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ app: 'sxf-platform-ops', branch: 'codex/platform-ops', commit: 'qa', release: fakeRelease, source: 'qa' })
  }));
  await noticePage.goto(`${site}/#/platform-login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await noticePage.locator('.platform-login .form-card').waitFor({ timeout: 60000 });
  await noticePage.waitForTimeout(2500);
  report.updateNotice = { before: await noticePage.locator('.platform-update-notice').count() };
  fakeRelease = 'qa-live-changed-0002';
  await noticePage.evaluate(() => window.dispatchEvent(new Event('sxf-platform-check-update')));
  try {
    await noticePage.locator('.platform-update-notice').waitFor({ state: 'visible', timeout: 20000 });
    report.updateNotice.type = await noticePage.locator('.platform-update-notice').getAttribute('data-type');
    report.updateNotice.text = (await noticePage.locator('.platform-update-notice').textContent()).replace(/\s+/g, ' ').trim();
    await noticePage.screenshot({ path: path.join(output, 'live-update-notice.png') });
    const reloaded = noticePage.waitForEvent('load', { timeout: 30000 }).then(() => true).catch(() => false);
    await noticePage.locator('.platform-update-notice .el-button--primary').click();
    report.updateNotice.refreshed = await reloaded;
  } catch (error) {
    report.updateNotice.error = error.message;
  }
  await noticeContext.close();

  // 安卓设备读到的是 APK 下载入口；用独立 UA 上下文核查，避免影响桌面判定。
  const androidContext = await browser.newContext({
    viewport: { width: 800, height: 1280 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  });
  const androidPage = await androidContext.newPage();
  await androidPage.goto(`${site}/#/platform-login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await androidPage.locator('.platform-login .form-card').waitFor({ timeout: 60000 });
  await androidPage.waitForTimeout(1200);
  report.android = {
    entry: (await androidPage.locator('.platform-login .platform-install-entry').first().textContent())?.trim() || '',
    note: (await androidPage.locator('.platform-login .install-note').textContent())?.trim() || ''
  };
  await androidPage.locator('.platform-login .platform-install-entry').first().click();
  await androidPage.locator('.platform-install-guide').waitFor({ state: 'visible', timeout: 15000 });
  await androidPage.waitForTimeout(500);
  report.android.guideMode = await androidPage.locator('.platform-install-guide').getAttribute('data-mode');
  report.android.downloadButton = (await androidPage.locator('.platform-install-guide .el-dialog__footer .el-button--primary').textContent())?.trim() || '';
  await androidPage.screenshot({ path: path.join(output, 'live-android-install.png') });
  await androidContext.close();

  // 安装包与更新清单真实下载核查，不只信上传成功。
  const crypto = require('node:crypto');
  const apkBase = 'https://www.sxffootball.cn/desktop/platform/android';
  try {
    const manifestResponse = await fetch(`${apkBase}/latest.json?t=${Date.now()}`, { headers: { Connection: 'close' } });
    const apkManifest = await manifestResponse.json();
    const apkResponse = await fetch(apkManifest.downloadUrl, { headers: { Connection: 'close' } });
    const apkBytes = Buffer.from(await apkResponse.arrayBuffer());
    report.androidPackage = {
      manifestStatus: manifestResponse.status,
      manifestType: manifestResponse.headers.get('content-type'),
      version: apkManifest.version,
      versionCode: apkManifest.versionCode,
      downloadUrl: apkManifest.downloadUrl,
      status: apkResponse.status,
      type: apkResponse.headers.get('content-type'),
      size: apkBytes.length,
      expectedSize: apkManifest.size,
      sha256: crypto.createHash('sha256').update(apkBytes).digest('hex'),
      expectedSha256: apkManifest.sha256
    };
  } catch (error) {
    report.androidPackage = { error: error.message };
  }

  const failures = [];
  if (report.head.installEntry && !/安装|主屏幕/.test(report.head.installEntry)) failures.push('登录页安装入口文案异常');
  if (!report.head.installEntry) failures.push('登录页未显示安装入口');
  if (!report.manifest.status || report.manifest.display !== 'standalone') failures.push('manifest 未正确解析');
  if (!Array.isArray(report.manifest.displayOverride) || report.manifest.displayOverride[0] !== 'window-controls-overlay') failures.push('线上 manifest 未首选 window-controls-overlay（桌面应用窗口标题条会回到浅底白字）');
  if (report.head.theme !== '#E9F1EC') failures.push(`线上主题色不是浅色 #E9F1EC（当前 ${report.head.theme}），浏览器会把窗口标题画成白字`);
  if (report.head.colorScheme !== 'light') failures.push('线上未固定 color-scheme: light，深色系统下窗口标题文字可能看不清');
  const appManifest = report.appManifest || {};
  if (appManifest.error) failures.push(`浏览器未取到 manifest：${appManifest.error}`);
  if ((appManifest.errors || []).length) failures.push(`manifest 解析告警：${appManifest.errors.join('；')}`);
  if (appManifest.manifestErrors?.length) failures.push(`manifest 字段错误：${appManifest.manifestErrors.join('；')}`);
  if (!Array.isArray(appManifest.displayOverride) || appManifest.displayOverride[0] !== 'window-controls-overlay') failures.push('浏览器未把 manifest 解析成 display_override 首选 window-controls-overlay');
  if (String(appManifest.themeColor).toUpperCase() !== '#E9F1EC') failures.push(`浏览器解析到的主题色不是 #E9F1EC（${appManifest.themeColor}）`);
  // 安装版窗口标题 = 应用名称 + ' - ' + 页面标题；页面标题里再写品牌就会出现
  // “赛小蜂足球 · 平台运营中心 - 赛小蜂足球 - 平台运营中心”。线上必须保持无重复。
  const liveAppName = String(appManifest.name || '赛小蜂足球 · 平台运营中心');
  if (String(report.head.title).includes(liveAppName)) failures.push(`线上页面标题重复应用名，安装版窗口会重复显示：${report.head.title}`);
  if (!String(report.head.title).includes('赛小蜂足球')) failures.push(`线上页面标题缺少品牌：${report.head.title}`);
  if (!report.titlebar?.present) failures.push('线上页面缺少自绘标题条节点');
  if (!report.titlebar?.wcoChunks?.length) failures.push('线上样式缺少 window-controls-overlay 标题条规则');
  if (!report.serviceWorker.registration) failures.push('Service Worker 未就绪');
  if (!report.serviceWorker.controlled) failures.push('页面未被 Service Worker 接管');
  if (report.updateCheck?.status !== 200 || !report.updateCheck?.release) failures.push('线上缺少 release.json 发布清单，更新检测无法判断新版本');
  if (!report.updateCheck?.hasUpdateWatch) failures.push('线上包未包含更新探测，旧版本不会提示刷新');
  if (report.updateCheck?.branch && report.updateCheck.branch !== 'codex/platform-ops') failures.push('线上发布清单分支不是 codex/platform-ops');
  const updateNotice = report.updateNotice || {};
  if (updateNotice.error) failures.push(`更新提示线上核查失败：${updateNotice.error}`);
  if (updateNotice.before !== 0) failures.push('基线状态就弹出了更新提示');
  if (updateNotice.type !== 'release') failures.push('发布清单变化后未提示“平台已发布新版本”');
  if (!String(updateNotice.text).includes('不需要重新安装')) failures.push('更新提示未说明无需重新安装');
  if (updateNotice.refreshed !== true) failures.push('点击“立即刷新”未重新加载页面');
  if (!String(report.head.installNote).includes('APK')) failures.push('登录页说明未提到安卓 APK 安装包');
  if (!String(report.android.entry).includes('安卓安装包')) failures.push('安卓设备登录页未显示 APK 下载入口');
  if (report.android.guideMode !== 'apk') failures.push('安卓安装引导未进入 APK 分支');
  if (!String(report.android.downloadButton).includes('下载安装包')) failures.push('安卓安装引导缺少下载按钮');
  const androidPackage = report.androidPackage;
  if (!androidPackage || androidPackage.error) failures.push(`安卓安装包读取失败：${androidPackage?.error || '无结果'}`);
  else {
    if (androidPackage.manifestStatus !== 200) failures.push('更新清单不是 HTTP200');
    if (androidPackage.status !== 200) failures.push('APK 下载不是 HTTP200');
    if (androidPackage.size !== androidPackage.expectedSize) failures.push('线上 APK 大小与清单不一致');
    if (androidPackage.sha256 !== androidPackage.expectedSha256) failures.push('线上 APK 摘要与清单不一致');
  }
  if (pageErrors.length) failures.push(...pageErrors.map(message => `页面异常：${message}`));

  report.status = failures.length ? 'failed' : 'passed';
  report.failures = failures;
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, failures, installEntry: report.head.installEntry, manifest: report.manifest, appManifest: report.appManifest, titlebar: report.titlebar, serviceWorker: report.serviceWorker, updateCheck: report.updateCheck, updateNotice: report.updateNotice, installability: report.installability, android: report.android, androidPackage: report.androidPackage }, null, 2));
  if (failures.length) process.exitCode = 1;
  await browser.close();
})();
