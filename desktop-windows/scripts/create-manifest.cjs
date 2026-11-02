'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const archive = path.join(root, 'release/win-unpacked/resources/app.asar');
const version = require('../package.json').version;
const sources = fs.readdirSync(path.join(root, 'src')).map(file => `src/${file}`).concat(['scripts/runtime-smoke.cjs', 'assets/icon.png', 'assets/brand-vertical.png', 'assets/update-badge.png']);
for (const file of sources) {
  if (hash(fs.readFileSync(path.join(root, file))) !== hash(asar.extractFile(archive, file))) throw new Error(`Packaged source mismatch: ${file}`);
}
const artifacts = [`SxfFootball-Setup-${version}-x64.exe`, 'win-unpacked/SxfFootball.exe', 'win-unpacked/resources/app.asar'].map(file => {
  const data = fs.readFileSync(path.join(root, 'release', file));
  return { file, bytes: data.length, sha256: hash(data) };
});
const tests = ['production', 'preview'].map(channel => {
  const report = JSON.parse(fs.readFileSync(path.join(root, 'test-output', channel, 'result.json'), 'utf8'));
  if (report.status !== 'passed' || !report.packaged || report.executableSha256 !== artifacts[1].sha256) throw new Error(`Packaged test failed or stale: ${channel}`);
  return report;
});
const manifest = { product: '赛小蜂足球', version, target: 'Windows x64', builtAt: new Date().toISOString(),
  signed: false, requiresNetwork: true, automaticShellUpdates: false, backendDeployment: false,
  artifacts, packagedSourcesVerified: sources, tests,
  pending: ['真人扫码和手机号验证', '账号切换及跨机构权限验收', '真实赛事上传/导出', '实体打印机', '安装向导交互验收'] };
fs.writeFileSync(path.join(root, 'release/RELEASE-MANIFEST.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ status: 'verified', artifacts, tests: tests.map(test => ({ channel: test.channel, status: test.status })) }));
