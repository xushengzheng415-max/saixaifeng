'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compareVersions, validateManifest, createUpdater } = require('../src/updates.cjs');
const release = { version: '0.2.3', url: 'https://www.sxffootball.cn/desktop/windows/SxfFootball-Setup-0.2.3-x64.exe', sha256: 'a'.repeat(64), bytes: 120000000, notes: ['更新测试'] };
test('version comparison is numeric', () => {
  assert.equal(compareVersions('0.2.10', '0.2.9'), 1);
  assert.equal(compareVersions('0.2.2', '0.2.2'), 0);
  assert.equal(compareVersions('0.1.9', '0.2.2'), -1);
  assert.throws(() => compareVersions('new', '0.2.2'));
});
test('update manifests accept only the exact official Windows package and checksum', () => {
  assert.equal(validateManifest(release).version, '0.2.3');
  for (const extra of [{ url: 'https://evil.test/app.exe' }, { url: 'file:///C:/test.exe' }, { sha256: 'wrong' }, { bytes: -1 }, { notes: ['x'.repeat(161)] }]) assert.throws(() => validateManifest({ ...release, ...extra }));
});
test('a genuine newer version marks updates; same or older versions do not', () => {
  const updater = createUpdater({ version: '0.2.2' });
  assert.equal(updater.acceptManifest(release).status, 'available');
  assert.equal(updater.acceptManifest({ ...release, version: '0.2.2', url: release.url.replace('0.2.3', '0.2.2') }).status, 'current');
});
test('network failure is never reported as already up to date', async () => {
  const updater = createUpdater({ version: '0.2.2', fetcher: async () => { throw new Error('offline'); } });
  assert.equal((await updater.check()).status, 'unavailable');
  updater.acceptManifest(release);
  assert.equal((await updater.check()).status, 'available');
});
test('a valid public JSON feed enables the update marker', async () => {
  const updater = createUpdater({ version: '0.2.2', fetcher: async () => ({ ok: true,
    url: 'https://www.sxffootball.cn/desktop/windows/latest.json',
    headers: new Headers({ 'content-type': 'application/json' }), body: new Response(JSON.stringify(release)).body }) });
  assert.equal((await updater.check()).status, 'available');
});
test('Electron empty Response.url works with fixed endpoint and redirects forbidden', async () => {
  const updater = createUpdater({ version: '0.2.2', fetcher: async (url, options) => {
    assert.equal(url, 'https://www.sxffootball.cn/desktop/windows/latest.json');
    assert.equal(options.redirect, 'error');
    return { ok: true, url: '', headers: new Headers({ 'content-type': 'application/json' }), body: new Response(JSON.stringify(release)).body };
  } });
  assert.equal((await updater.check()).status, 'available');
});
test('installer checksum verification detects modified files', async () => {
  const fs = require('node:fs/promises');
  const path = require('node:path');
  const file = path.join(require('node:os').tmpdir(), `sxf-update-${require('node:crypto').randomUUID()}.txt`);
  try {
    await fs.writeFile(file, 'abc');
    const verify = require('../src/updates.cjs').verifyUpdateFile;
    assert.equal(await verify(file, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'), true);
    await fs.writeFile(file, 'changed');
    assert.equal(await verify(file, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'), false);
  } finally { await fs.unlink(file); }
});
