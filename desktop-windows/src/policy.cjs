'use strict';
const ORIGIN = 'https://www.sxffootball.cn';
function parse(value) { try { return new URL(value); } catch { return null; } }
function isSite(value) {
  const url = parse(value);
  return !!url && url.origin === ORIGIN && !url.username && !url.password;
}
function isNavigationAllowed(value) {
  if (isSite(value)) return true;
  const url = parse(value);
  return !!url && url.protocol === 'https:' && url.hostname === 'open.weixin.qq.com'
    && !url.username && !url.password && url.pathname.startsWith('/connect/');
}
function isExternalAllowed(value) {
  const url = parse(value);
  return !!url && url.protocol === 'https:' && !url.username && !url.password;
}
function isPopupAllowed(value, opener) {
  if (!isSite(opener)) return false;
  return isSite(value) || value === 'about:blank' || value.startsWith(`blob:${ORIGIN}/`);
}
function safeFilename(value) {
  const name = String(value || '下载文件').split(/[\\/]/).pop()
    .replace(/[<>:"|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 180);
  return !name || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name) ? `下载-${name || '文件'}` : name;
}
module.exports = { ORIGIN, isSite, isNavigationAllowed, isExternalAllowed, isPopupAllowed, safeFilename };
