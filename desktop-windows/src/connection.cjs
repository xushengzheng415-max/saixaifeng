'use strict';
const { isSite } = require('./policy.cjs');

function retryTarget(url, home) {
  if (!isSite(url)) return home;
  const parsed = new URL(url);
  // OAuth codes are single-use. A failed callback must restart at the login entry.
  return parsed.searchParams.has('code') || /wechat-callback|(?:[?&])code=/.test(parsed.hash) ? home : url;
}
function createConnection({ home, timeoutMs = 30000, setTimer = setTimeout, clearTimer = clearTimeout, onFailure }) {
  let timer;
  let lastPage = home;
  let failed = false;
  let lastError = null;
  function clear() { if (timer !== undefined) clearTimer(timer); timer = undefined; }
  function fail(code, url) {
    clear(); failed = true;
    const parsed = new URL(isSite(url) ? url : home);
    lastError = { code, origin: parsed.origin, path: parsed.pathname };
    onFailure(lastError);
  }
  return {
    start(url, isInPlace, isMainFrame) {
      // Vue hash/history transitions do not create a document or emit dom-ready.
      if (!isMainFrame || isInPlace || !isSite(url)) return false;
      clear(); lastPage = url;
      timer = setTimer(() => fail('TIMEOUT', url), timeoutMs);
      return true;
    },
    ready() { clear(); failed = false; },
    error(code, url, isMainFrame) {
      if (!isMainFrame || code === -3 || !isSite(url)) return false;
      fail(code, url); return true;
    },
    target(current) { return retryTarget(failed ? lastPage : current, home); },
    snapshot() { return { failed, lastError }; },
    setTimeoutMs(value) { timeoutMs = value; },
    dispose: clear
  };
}
module.exports = { createConnection, retryTarget };
