'use strict';
const statusParams = new URLSearchParams(window.location.search);
const statusCode = statusParams.get('code') || '';
if (/^(?:-\d+|TIMEOUT|RENDERER)$/.test(statusCode)) {
  document.getElementById('connection-detail').textContent = `${statusParams.get('channel') === 'preview' ? '测试入口' : '正式入口'} · 错误码 ${statusCode}`;
}
