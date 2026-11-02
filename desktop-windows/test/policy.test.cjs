'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isSite, isNavigationAllowed, isExternalAllowed, isPopupAllowed, safeFilename } = require('../src/policy.cjs');
test('only the official HTTPS origin is privileged', () => {
  assert.ok(isSite('https://www.sxffootball.cn/admin/#/login'));
  for (const url of ['http://www.sxffootball.cn/admin/', 'https://www.sxffootball.cn.evil.test/', 'https://user:pass@www.sxffootball.cn/', 'file:///C:/Windows/system.ini', 'javascript:alert(1)', 'bad']) assert.equal(isSite(url), false, url);
});
test('WeChat OAuth navigation is permitted without accepting arbitrary sites', () => {
  assert.ok(isNavigationAllowed('https://open.weixin.qq.com/connect/qrconnect?appid=test'));
  assert.equal(isNavigationAllowed('https://open.weixin.qq.com.evil.test/connect/qrconnect'), false);
  assert.equal(isNavigationAllowed('https://evil.test/'), false);
  assert.equal(isExternalAllowed('ms-settings:test'), false);
  assert.equal(isExternalAllowed('file:///tmp/test'), false);
  assert.ok(isExternalAllowed('https://example.org/'));
});
test('exports and print popups require a trusted opener', () => {
  const origin = 'https://www.sxffootball.cn/admin/';
  assert.ok(isPopupAllowed('about:blank', origin));
  assert.ok(isPopupAllowed('blob:https://www.sxffootball.cn/id', origin));
  assert.equal(isPopupAllowed('blob:https://evil.test/id', origin), false);
  assert.equal(isPopupAllowed('about:blank', 'https://evil.test/'), false);
  assert.equal(isPopupAllowed('https://example.org/', origin), false);
});
test('Windows download filenames cannot escape the selected directory', () => {
  assert.equal(safeFilename('../../赛程.xlsx'), '赛程.xlsx');
  assert.equal(safeFilename('C:\\tmp\\名单.pdf'), '名单.pdf');
  assert.equal(safeFilename('CON.txt'), '下载-CON.txt');
  assert.equal(safeFilename('赛程?.xlsx '), '赛程_.xlsx');
});
