'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { webFrameMain } = require('electron');
const { isSite } = require('./policy.cjs');

function installLoginBranding(win, options) {
  const css = fs.readFileSync(path.join(__dirname, 'login.css'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, 'login-page.js'), 'utf8');
  const config = { ...options, icon: `data:image/png;base64,${fs.readFileSync(path.join(__dirname, '../assets/brand-vertical.png')).toString('base64')}` };
  const allowed = () => isSite(win.webContents.getURL()) && /^\/(?:preview\/)?admin\//.test(new URL(win.webContents.getURL()).pathname);
  win.webContents.on('dom-ready', async () => {
    if (!allowed()) return;
    try {
      await win.webContents.insertCSS(css);
      await win.webContents.executeJavaScript(`(${script})(${JSON.stringify(config)})`);
    } catch { /* A navigating document will be decorated on its next dom-ready. */ }
  });
  win.webContents.on('did-frame-finish-load', async (_event, main, processId, routingId) => {
    if (main || !allowed()) return;
    const frame = webFrameMain.fromId(processId, routingId);
    if (!frame || !frame.url.startsWith('https://open.weixin.qq.com/connect/qrconnect')) return;
    const url = frame.url;
    try {
      const ready = await frame.executeJavaScript(`(async () => {
        const style = document.createElement('style');
        style.textContent = '.impowerBox .title{display:none!important}.impowerBox{width:280px!important}.impowerBox .qrcode{width:224px!important;height:224px!important;margin-top:0!important;border:0!important}.impowerBox .wrp_code{margin-top:0!important}body{margin:0!important;background:#fff!important}';
        document.head.appendChild(style);
        for (let attempt=0;attempt<100;attempt++) {
          if (Array.from(document.images).some(img => img.complete && img.naturalWidth>100)) return true;
          await new Promise(resolve => setTimeout(resolve,200));
        }
        return false;
      })()`);
      if (allowed()) await win.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('sxf:qr-status', { detail: ${JSON.stringify({ url, state: ready ? 'ready' : 'error' })} }));`);
    } catch { /* Frame navigation or OAuth completion needs no local intervention. */ }
  });
}
module.exports = { installLoginBranding };
