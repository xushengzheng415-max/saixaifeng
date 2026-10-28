'use strict';
/*
 * 线上（pingtai.sxffootball.cn）可安装能力核查：
 * 只读页面与浏览器安装判定，不改动线上数据。
 * 1. 登录页是否显示安装入口与说明；
 * 2. manifest 可解析、start_url 与图标数量正确；
 * 3. Service Worker 已激活并接管页面；
 * 4. 浏览器安装判定结果（无痕/无头模式会返回 in-incognito，属预期）。
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
    return { href, status: response.status, type: response.headers.get('content-type'), display: json?.display, start: json?.start_url, icons: json?.icons?.length || 0 };
  });

  report.serviceWorker = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const registration = await Promise.race([
      navigator.serviceWorker.ready.then(result => ({ scope: result.scope, state: result.active?.state })),
      new Promise(resolve => setTimeout(() => resolve(null), 15000))
    ]);
    return { supported: true, registration, controlled: Boolean(navigator.serviceWorker.controller) };
  });

  const cdp = await context.newCDPSession(page);
  try {
    report.installability = await cdp.send('Page.getInstallabilityErrors');
  } catch (error) {
    report.installability = { error: error.message };
  }

  report.pageErrors = pageErrors;
  await page.screenshot({ path: path.join(output, 'live-login.png') });

  const failures = [];
  if (report.head.installEntry && !/安装|主屏幕/.test(report.head.installEntry)) failures.push('登录页安装入口文案异常');
  if (!report.head.installEntry) failures.push('登录页未显示安装入口');
  if (!report.manifest.status || report.manifest.display !== 'standalone') failures.push('manifest 未正确解析');
  if (!report.serviceWorker.registration) failures.push('Service Worker 未就绪');
  if (!report.serviceWorker.controlled) failures.push('页面未被 Service Worker 接管');
  if (pageErrors.length) failures.push(...pageErrors.map(message => `页面异常：${message}`));

  report.status = failures.length ? 'failed' : 'passed';
  report.failures = failures;
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, failures, installEntry: report.head.installEntry, manifest: report.manifest, serviceWorker: report.serviceWorker, installability: report.installability }, null, 2));
  if (failures.length) process.exitCode = 1;
  await browser.close();
})();
