'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createConnection, retryTarget } = require('../src/connection.cjs');
const home = 'https://www.sxffootball.cn/preview/admin/';
function harness() {
  let next = 0; const timers = new Map(); const failures = [];
  const connection = createConnection({ home, setTimer: fn => { timers.set(++next, fn); return next; },
    clearTimer: id => timers.delete(id), onFailure: error => failures.push(error) });
  return { connection, timers, failures, tick: () => [...timers.values()].forEach(fn => fn()) };
}
test('login and SPA route transitions never arm the document timeout', () => {
  const h = harness();
  h.connection.start(home, false, true); h.connection.ready();
  for (const route of ['#/login', '#/tournament-space', '#/login?next=1']) {
    assert.equal(h.connection.start(home + route, true, true), false);
    h.tick(); assert.equal(h.timers.size, 0); assert.equal(h.failures.length, 0);
  }
});
test('iframe errors and cancelled requests do not replace a healthy page', () => {
  const h = harness();
  assert.equal(h.connection.error(-105, home, false), false);
  assert.equal(h.connection.error(-3, home, true), false);
  assert.equal(h.connection.start('https://open.weixin.qq.com/connect/qrconnect', false, false), false);
  assert.equal(h.failures.length, 0);
});
test('a genuine document timeout reports only sanitized connection details', () => {
  const h = harness();
  h.connection.start(home + '?sensitive=hidden#/login', false, true); h.tick();
  assert.deepEqual(h.failures, [{ code: 'TIMEOUT', origin: 'https://www.sxffootball.cn', path: '/preview/admin/' }]);
  assert.equal(h.connection.snapshot().failed, true);
  h.connection.ready(); assert.equal(h.connection.snapshot().failed, false);
});
test('refresh preserves the active test channel and never replays an OAuth code', () => {
  const h = harness();
  h.connection.start(home + '#/login', false, true); h.connection.error(-105, home, true);
  assert.equal(h.connection.target('file:///error.html'), home + '#/login');
  assert.equal(retryTarget(home + '#/wechat-callback?code=single-use&state=secret', home), home);
  assert.equal(retryTarget(home + '?code=single-use', home), home);
  assert.equal(retryTarget('file:///error.html', home), home);
});
