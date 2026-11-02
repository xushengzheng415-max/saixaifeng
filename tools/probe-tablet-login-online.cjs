'use strict';
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.SXF_PLAYWRIGHT_MODULE||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
async function waitForWechatFrame(page){
  return page.frames().find(frame=>frame.url().startsWith('https://open.weixin.qq.com/')) || await page.waitForEvent('framenavigated',{predicate:frame=>frame.url().startsWith('https://open.weixin.qq.com/'),timeout:30000});
}
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1032,height:600},deviceScaleFactor:3,isMobile:true,hasTouch:true});
    const page=await context.newPage();
    await page.goto('https://www.sxffootball.cn/preview/admin/?layout=20261028b#/login',{waitUntil:'domcontentloaded'});
    await page.locator('.login-brand img:visible').waitFor({timeout:30000});
    await page.waitForFunction(()=>{const image=document.querySelector('.login-brand img');return image?.complete&&image.naturalWidth>500});
    let frame=await waitForWechatFrame(page);
    await frame.waitForFunction(()=>{const qr=document.querySelector('img.qrcode');return qr?.complete&&qr.naturalWidth>100},null,{timeout:30000});
    const state=await page.evaluate(()=>{
      const image=document.querySelector('.login-brand img'),logo=image.getBoundingClientRect(),qr=document.querySelector('.qr-shell').getBoundingClientRect(),refresh=document.querySelector('.retry').getBoundingClientRect();
      return{logoWidth:image.naturalWidth,logoOnLeft:logo.right<qr.left,qrInViewport:qr.right<=innerWidth&&qr.bottom<=innerHeight,refreshHeight:refresh.height,overflow:document.documentElement.scrollWidth>innerWidth+1};
    });
    if(!state.logoOnLeft||!state.qrInViewport||state.refreshHeight<44||state.overflow)throw Error(JSON.stringify(state));
    const old=await page.locator('iframe').getAttribute('src');
    await page.locator('.retry').tap();
    await page.waitForFunction(old=>document.querySelector('iframe')?.src!==old,old);
    frame=await waitForWechatFrame(page);
    await frame.waitForFunction(()=>{const qr=document.querySelector('img.qrcode');return qr?.complete&&qr.naturalWidth>100},null,{timeout:30000});
    const output=path.resolve('output/tablet-landscape-20261028');
    await page.screenshot({path:path.join(output,'scroll-login-live.png')});
    const report={status:'passed',viewport:'1032x600',...state,realWeChatQrLoaded:true,refreshChangesQr:true};
    fs.writeFileSync(path.join(output,'scroll-login-live.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  }finally{await browser.close()}
})().catch(error=>{console.error(error.stack);process.exitCode=1});
