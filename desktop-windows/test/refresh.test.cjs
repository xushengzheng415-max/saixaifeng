'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { refreshPlan } = require('../src/refresh.cjs');

const home = 'https://www.sxffootball.cn/preview/admin/';
const teams = `${home}#/tournament/abc/teams`;

test('same site hash route uses hard reload so Page > Refresh always reacts', () => {
  assert.deepEqual(refreshPlan(teams, teams), { mode: 'reload-ignoring-cache' });
  assert.deepEqual(refreshPlan(home, home), { mode: 'reload-ignoring-cache' });
});

test('offline page and oauth fallback still navigate with no-cache headers', () => {
  const offline = refreshPlan('file:///offline.html', home);
  assert.equal(offline.mode, 'load');
  assert.equal(offline.url, home);
  assert.match(offline.extraHeaders, /Cache-Control: no-cache/);

  const oauthTarget = home;
  const oauthCurrent = `${home}#/wechat-callback?code=single-use`;
  const plan = refreshPlan(oauthCurrent, oauthTarget);
  assert.equal(plan.mode, 'load');
  assert.equal(plan.url, home);
});
