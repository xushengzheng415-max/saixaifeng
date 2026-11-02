'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const run = require('node:child_process').spawnSync(require('electron'), [__filename, ...process.argv.slice(2)], { env, stdio: 'inherit', windowsHide: true, timeout: 90000 });
  process.exit(run.status === 0 ? 0 : 1);
}
const { app, BrowserWindow, session } = require('electron');
const live = process.argv.includes('--live');
const output = path.join(root, 'test-output');
app.setPath('userData', path.join(output, live ? 'home-live-profile' : 'home-local-profile'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  let server;
  let url = 'https://www.sxffootball.cn/';
  if (!live) {
    server = require('node:http').createServer((request, response) => {
      const files = { '/': [path.join(root, '../index.html'), 'text/html; charset=utf-8'], '/logo-saixiaofeng.png': [path.join(root, '../logo-saixiaofeng.png'), 'image/png'], '/desktop/windows/latest.json': [path.join(root, 'release/publish-0.2.3/latest.json'), 'application/json'] };
      const file = files[request.url];
      if (!file) { response.writeHead(404); response.end(); return; }
      response.writeHead(200, { 'Content-Type': file[1] }); response.end(fs.readFileSync(file[0]));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); url = `http://127.0.0.1:${server.address().port}/`;
  }
  const win = new BrowserWindow({ show: false, width: 1440, height: 960, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  await win.loadURL(url);
  const end = Date.now() + 20000;
  while (!await win.webContents.executeJavaScript('Array.from(document.querySelectorAll("[data-client-download]")).every(link => link.dataset.clientVersion === "0.2.3")')) {
    if (Date.now() > end) throw new Error('Latest download resolution failed'); await sleep(150);
  }
  const checks = [];
  for (const [width, mobile] of [[1440,false],[390,true]]) {
    win.setContentSize(width, 850); await sleep(450);
    const state = await win.webContents.executeJavaScript(`(() => {
      const links=Array.from(document.querySelectorAll('#navbar [data-client-download]'));
      const link=links.find(item=>item.getBoundingClientRect().width>0); const rect=link.getBoundingClientRect();
      return {text:link.textContent.trim(),href:link.href,left:rect.left,right:rect.right,width:innerWidth};
    })()`);
    if (state.text !== (mobile ? 'Windows 下载' : '客户端下载') || state.left<0 || state.right>state.width) throw new Error('Navigation visibility/overflow failed');
    checks.push({ width, ...state });
    await fs.promises.writeFile(path.join(output, `home-${live?'live':'local'}-${width}.png`), (await win.webContents.capturePage({x:0,y:0,width,height:140})).toPNG());
  }
  const downloaded = new Promise(resolve => session.defaultSession.once('will-download', (event,item) => { const target=item.getURL(); event.preventDefault(); resolve(target); }));
  await win.webContents.executeJavaScript('Array.from(document.querySelectorAll("#navbar [data-client-download]")).find(link=>link.getBoundingClientRect().width>0).click();undefined', true);
  const target = await Promise.race([downloaded,sleep(20000).then(()=>{throw new Error('Download did not start');})]);
  if(target!=='https://www.sxffootball.cn/desktop/windows/SxfFootball-Setup-0.2.3-x64.exe') throw new Error('Wrong installer');
  const result={status:'passed',live,checks,downloadRequestVerified:true,downloadCancelledBeforeSaving:true};
  fs.writeFileSync(path.join(output,`home-${live?'live':'local'}-navigation.json`),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result)); server?.close(); app.exit(0);
}).catch(error=>{console.error(error.message);app.exit(1);});
