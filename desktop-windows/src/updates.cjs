'use strict';
const { ORIGIN } = require('./policy.cjs');
const fs = require('node:fs');
const crypto = require('node:crypto');
const FEED_URL = `${ORIGIN}/desktop/windows/latest.json`;
function versionParts(value) {
  if (typeof value !== 'string' || !/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(value)) throw new Error('更新版本号无效');
  return value.split('.').map(Number);
}
function compareVersions(a, b) {
  const left = versionParts(a), right = versionParts(b);
  for (let i=0;i<3;i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}
function validateManifest(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('更新清单无效');
  versionParts(raw.version);
  const expected = `${ORIGIN}/desktop/windows/SxfFootball-Setup-${raw.version}-x64.exe`;
  if (raw.url !== expected) throw new Error('更新下载地址无效');
  if (typeof raw.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(raw.sha256)) throw new Error('更新包校验值无效');
  if (!Number.isSafeInteger(raw.bytes) || raw.bytes <= 0 || raw.bytes > 600*1024*1024) throw new Error('更新包大小无效');
  if (!Array.isArray(raw.notes) || raw.notes.length > 8 || raw.notes.some(note => typeof note !== 'string' || note.length > 160)) throw new Error('更新说明无效');
  return { version: raw.version, url: expected, sha256: raw.sha256.toLowerCase(), bytes: raw.bytes, notes: [...raw.notes] };
}
async function fetchManifest(fetcher) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    // Electron net.fetch may leave Response.url empty. Use the fixed HTTPS
    // endpoint with redirects forbidden, and additionally check URL when present.
    const response = await fetcher(FEED_URL, { cache: 'no-store', redirect: 'error', credentials: 'omit', signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json') || (response.url && new URL(response.url).origin !== ORIGIN)) throw new Error('更新服务暂不可用');
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 65536) { await reader.cancel(); throw new Error('更新清单过大'); }
      chunks.push(Buffer.from(value));
    }
    return validateManifest(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } finally { clearTimeout(timer); }
}
function createUpdater({ version, fetcher, onChange = () => {} }) {
  let state = { status: 'idle', currentVersion: version, release: null };
  let interval;
  let pending;
  function emit() { onChange({ ...state }); return { ...state }; }
  function acceptManifest(raw) {
    const release = validateManifest(raw);
    state = { ...state, status: compareVersions(release.version, version) > 0 ? 'available' : 'current', release };
    return emit();
  }
  return {
    snapshot: () => ({ ...state }), acceptManifest,
    check() {
      if (pending) return pending;
      state = { ...state, status: state.status === 'available' ? 'available' : 'checking' }; emit();
      pending = fetchManifest(fetcher).then(acceptManifest).catch(() => {
        state = { ...state, status: state.status === 'available' ? 'available' : 'unavailable' }; return emit();
      }).finally(() => { pending = undefined; });
      return pending;
    },
    start() { void this.check(); interval = setInterval(() => void this.check(), 6*60*60*1000); interval.unref?.(); },
    dispose() { clearInterval(interval); }
  };
}
async function verifyUpdateFile(file, expected) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex') === expected;
}
module.exports = { FEED_URL, compareVersions, validateManifest, createUpdater, verifyUpdateFile };
