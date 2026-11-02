'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateManifest } = require('../src/updates.cjs');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const name = `SxfFootball-Setup-${version}-x64.exe`;
const data = fs.readFileSync(path.join(root, 'release', name));
const verified = JSON.parse(fs.readFileSync(path.join(root, 'release/RELEASE-MANIFEST.json'), 'utf8'));
const installerHash = crypto.createHash('sha256').update(data).digest('hex');
if (verified.version !== version || verified.artifacts[0]?.sha256 !== installerHash || verified.tests.length !== 2 || verified.tests.some(test => test.status !== 'passed' || !test.packaged)) throw new Error('先完成当前版本打包后的正式/测试验证与摘要登记');
const latest = validateManifest({ version, url: `https://www.sxffootball.cn/desktop/windows/${name}`, bytes: data.length,
  sha256: installerHash,
  notes: ['发现新版本后自动后台下载，不必先点「检查更新」', '下载校验完成后提示重启，后台静默安装，无需再走安装向导', '「页面 → 刷新」继续支持测试频道整页强制重载'] });
const destination = path.join(root, 'release', `publish-${version}`);
fs.mkdirSync(destination, { recursive: true });
fs.copyFileSync(path.join(root, 'release', name), path.join(destination, name));
fs.writeFileSync(path.join(destination, 'latest.json'), JSON.stringify(latest, null, 2));
console.log(JSON.stringify({ status: 'prepared_not_published', directory: destination, version, sha256: latest.sha256 }));
