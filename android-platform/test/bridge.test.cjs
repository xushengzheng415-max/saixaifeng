'use strict';
/*
 * blob 导出桥接验证：不联网、不需要安卓设备。
 * 1. 从 MainActivity.java 抽出 BRIDGE_JS 原文（含 MAX_BRIDGE_BYTES 常量替换）；
 * 2. 在真实浏览器里注入两遍，验证只注册一次；
 * 3. 点击 blob 下载链接时应阻止默认行为，并把文件名与 base64 交给 SxfApp.saveBase64；
 * 4. 非 blob 链接不拦截，交给系统下载；
 * 5. 超过 32MB 时只提示、不写文件。
 * 用法：node android-platform/test/bridge.test.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('../../tools/lib/load-playwright.cjs');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app/src/main/java/cn/sxffootball/platform/MainActivity.java'), 'utf8');
const MAX_BRIDGE_BYTES = 32 * 1024 * 1024;

function extractBridgeJs(code) {
  const start = code.indexOf('private static final String BRIDGE_JS =');
  assert.ok(start > 0, '未找到 BRIDGE_JS 定义');
  const lastFragment = code.indexOf('+ "})();"', start);
  assert.ok(lastFragment > start, '未找到 BRIDGE_JS 结束片段');
  // 结束片段本身包含分号，必须越过它再找语句结尾，否则会截断字面量。
  const end = code.indexOf(';', lastFragment + '+ "})();"'.length);
  assert.ok(end > lastFragment, '未找到 BRIDGE_JS 结束位置');
  const block = code.slice(start, end);
  // 按出现顺序拼接 Java 字符串片段，并把数值常量还原成字面量。
  const parts = [];
  const pattern = /"(?:[^"\\]|\\.)*"|MAX_BRIDGE_BYTES/g;
  let match;
  while ((match = pattern.exec(block)) !== null) {
    parts.push(match[0] === 'MAX_BRIDGE_BYTES' ? String(MAX_BRIDGE_BYTES) : JSON.parse(match[0]));
  }
  assert.ok(parts.length > 5, 'BRIDGE_JS 片段数量异常');
  return parts.join('');
}

const bridgeJs = extractBridgeJs(source);
const checks = [];

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  // 用可路由的 HTTPS 源承载测试页：blob 与下载行为与真实站点一致，且不会真的访问外网。
  await page.route('https://bridge.test/**', route => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><html><body><button id="probe">probe</button></body></html>'
  }));
  await page.goto('https://bridge.test/index.html', { waitUntil: 'domcontentloaded' });

  // 注入两遍：验证 __sxfBridgeReady 幂等，避免重复保存。
  const injection = await page.evaluate(code => {
    window.__sxfCalls = [];
    window.SxfApp = {
      showToast(message) { window.__sxfCalls.push({ type: 'toast', message }); },
      saveBase64(name, base64) { window.__sxfCalls.push({ type: 'save', name, base64 }); }
    };
    eval(code);
    eval(code);
    return { ready: window.__sxfBridgeReady === true, callType: typeof window.SxfApp.saveBase64 };
  }, bridgeJs);
  assert.equal(injection.ready, true, 'BRIDGE_JS 未标记就绪');
  assert.equal(injection.callType, 'function', '原生桥接接口未暴露给页面');
  checks.push('BRIDGE_JS 可从源码抽出并重复注入');

  // 正常 blob 导出：内容与文件名原样交给原生保存。
  const exported = await page.evaluate(async () => {
    const text = '编号,姓名\n1,张三\n2,李四\n';
    const bytes = new TextEncoder().encode(text);
    const blob = new Blob([bytes], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = '班级名单.csv';
    anchor.textContent = '导出';
    document.body.appendChild(anchor);
    let prevented = null;
    document.addEventListener('click', event => { prevented = event.defaultPrevented; }, { once: true });
    anchor.click();
    await new Promise(resolve => setTimeout(resolve, 400));
    URL.revokeObjectURL(url);
    const save = window.__sxfCalls.find(call => call.type === 'save');
    if (!save) return { saved: false, calls: window.__sxfCalls, prevented };
    // base64 -> 原始字节（浏览器内解码，避免 Node 与页面编码差异）
    const binary = atob(save.base64);
    const decoded = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) decoded[i] = binary.charCodeAt(i);
    return {
      saved: true,
      name: save.name,
      prevented,
      matches: new TextDecoder().decode(decoded) === text,
      saveCount: window.__sxfCalls.filter(call => call.type === 'save').length,
      calls: window.__sxfCalls.length
    };
  });
  assert.equal(exported.saved, true, 'blob 链接未触发原生保存');
  assert.equal(exported.name, '班级名单.csv', '导出文件名未原样传递');
  assert.equal(exported.matches, true, '导出内容与原始字节不一致');
  assert.equal(exported.prevented, true, '未阻止 WebView 自行处理 blob 链接');
  assert.equal(exported.saveCount, 1, '重复注入导致重复保存');
  checks.push('blob 导出在浏览器内完成取数、base64 与文件名传递');

  // 非 blob 链接不拦截，仍交给系统下载。
  const passthrough = await page.evaluate(() => {
    window.__sxfCalls = [];
    const anchor = document.createElement('a');
    anchor.href = 'https://example.com/report.csv';
    anchor.download = 'report.csv';
    anchor.textContent = '下载';
    document.body.appendChild(anchor);
    let prevented = null;
    // 记录桥接是否拦下事件，再由测试自身取消默认行为，避免真的跳转到外站。
    document.addEventListener('click', event => { prevented = event.defaultPrevented; event.preventDefault(); }, { once: true });
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return { prevented, saves: window.__sxfCalls.filter(call => call.type === 'save').length };
  });
  assert.equal(passthrough.prevented, false, '非 blob 链接被错误拦截');
  assert.equal(passthrough.saves, 0, '非 blob 链接被错误转交原生保存');
  checks.push('非 blob 下载链接保持原有系统下载');

  // 超过 32MB 只提示，不写文件。
  const oversized = await page.evaluate(async () => {
    window.__sxfCalls = [];
    const blob = new Blob([new Uint8Array(33 * 1024 * 1024)]);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'oversize.pdf';
    document.body.appendChild(anchor);
    anchor.click();
    await new Promise(resolve => setTimeout(resolve, 800));
    URL.revokeObjectURL(url);
    return { calls: window.__sxfCalls };
  });
  assert.equal(oversized.calls.filter(call => call.type === 'save').length, 0, '超大文件仍被保存');
  assert.ok(oversized.calls.some(call => call.type === 'toast' && call.message.includes('32MB')), '超大文件未提示改用浏览器');
  checks.push('超过 32MB 时提示改用浏览器');

  await browser.close();
  assert.deepEqual(pageErrors, [], `页面异常：${pageErrors.join('; ')}`);

  console.log(JSON.stringify({ status: 'passed', checks }, null, 2));
})().catch(error => {
  console.error(JSON.stringify({ status: 'failed', message: error.message }, null, 2));
  process.exitCode = 1;
});
