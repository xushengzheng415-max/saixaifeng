'use strict';
const { isSite } = require('./policy.cjs');

const NO_CACHE_HEADERS = 'pragma: no-cache\nCache-Control: no-cache\n';

// 同文档地址（含 Vue hash 路由）再 loadURL 往往无刷新反应；
// 站内同址用忽略缓存重载，离线页/OAuth 回退仍走带 no-cache 的入口导航。
function refreshPlan(currentUrl, targetUrl) {
  if (isSite(currentUrl) && currentUrl === targetUrl) {
    return { mode: 'reload-ignoring-cache' };
  }
  return { mode: 'load', url: targetUrl, extraHeaders: NO_CACHE_HEADERS };
}

module.exports = { refreshPlan, NO_CACHE_HEADERS };
