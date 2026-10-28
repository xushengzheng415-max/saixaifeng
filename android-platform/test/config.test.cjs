'use strict';
/*
 * Android 客户端配置检查：不联网、不需要设备，只核对源码里的固定约定。
 * 防止误改域名、放开明文流量或把启动页指向非平台地址。
 * 用法：node test/config.test.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const manifest = fs.readFileSync(path.join(root, 'app/src/main/AndroidManifest.xml'), 'utf8');
const activity = fs.readFileSync(path.join(root, 'app/src/main/java/cn/sxffootball/platform/MainActivity.java'), 'utf8');
const appGradle = fs.readFileSync(path.join(root, 'app/build.gradle'), 'utf8');

const checks = [];
function check(name, fn) {
  fn();
  checks.push(name);
}

check('清单声明联网权限', () => assert.match(manifest, /android\.permission\.INTERNET/));
check('清单禁止明文流量', () => assert.match(manifest, /android:usesCleartextTraffic="false"/));
check('启动 Activity 已导出', () => assert.match(manifest, /android:name="\.MainActivity"[\s\S]*?android:exported="true"/));
check('启动页为平台正式域名', () => {
  assert.match(activity, /START_URL = "https:\/\/pingtai\.sxffootball\.cn\/#\/platform-login"/);
});
check('站内白名单只有平台域名', () => {
  assert.match(activity, /PLATFORM_HOST = "pingtai\.sxffootball\.cn"/);
  assert.equal((activity.match(/sxffootball\.cn/g) || []).length >= 2, true);
  assert.doesNotMatch(activity, /"www\.sxffootball\.cn"/);
});
check('不允许明文或 http 启动', () => assert.doesNotMatch(activity, /START_URL = "http:/));
check('保留导出下载桥接', () => {
  assert.match(activity, /@JavascriptInterface/);
  assert.match(activity, /saveBase64/);
});
check('编译与目标版本固定', () => {
  assert.match(appGradle, /compileSdk 34/);
  assert.match(appGradle, /targetSdk 34/);
  assert.match(appGradle, /minSdk 24/);
});
check('签名只从环境变量读取', () => {
  assert.match(appGradle, /System\.getenv\('SXF_ANDROID_KEYSTORE'\)/);
  assert.doesNotMatch(appGradle, /storePassword\s+['"][^'"]+['"]/);
});

console.log(JSON.stringify({ status: 'passed', checks }, null, 2));
