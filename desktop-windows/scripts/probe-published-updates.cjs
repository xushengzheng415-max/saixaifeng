'use strict';
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const result = require('node:child_process').spawnSync(require('electron'), [__filename, ...process.argv.slice(2)], { env, windowsHide: true, stdio: 'inherit', timeout: 60000 });
  process.exit(result.status === 0 ? 0 : 1);
}
const { app, net } = require('electron');
const channel = process.argv.includes('--preview') ? 'preview' : 'production';
const output = path.join(root, 'test-output');
app.setPath('userData', path.join(output, `published-probe-${channel}-profile`));
app.whenReady().then(async () => {
  const archive = path.join(root, 'release/win-unpacked/resources/app.asar');
  const { createUpdater, verifyUpdateFile } = require(path.join(archive, 'src/updates.cjs'));
  const version = require(path.join(archive, 'package.json')).version;
  const expectedFeed = process.argv.find(arg => arg.startsWith('--expect-feed='))?.slice('--expect-feed='.length) || version;
  const fetcher = async (...args) => {
    try {
      const response = await net.fetch(...args);
      console.log(JSON.stringify({ http: response.status, contentType: response.headers.get('content-type'), responseUrl: response.url, streamReader: typeof response.body?.getReader }));
      return response;
    } catch (error) { console.log(JSON.stringify({ fetchError: error.message })); throw error; }
  };
  const current = await createUpdater({ version, fetcher }).check();
  const older = await createUpdater({ version: '0.2.1', fetcher }).check();
  if (current.status !== 'current' || older.status !== 'available' || current.release?.version !== expectedFeed) {
    console.log(JSON.stringify({ current, older, version }));
    throw new Error('Published feed did not produce expected version states');
  }
  const file = path.join(output, 'published-installer.exe');
  const checksum = await verifyUpdateFile(file, current.release.sha256);
  if (!checksum || fs.statSync(file).size !== current.release.bytes) throw new Error('Downloaded public installer checksum/size mismatch');
  const result = { status: 'passed', channel, version, currentStatus: current.status,
    olderVersionSimulation: { version: '0.2.1', status: older.status, note: 'Runs the new checker with an older version number; the actual old application has no checker.' },
    feedVersion: current.release.version, installerSha256: current.release.sha256,
    publicInstallerChecksumVerified: checksum, checkedAt: new Date().toISOString() };
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, `published-updates-${channel}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result)); app.exit(0);
}).catch(error => { console.error(error.message); app.exit(1); });
