const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {chromium}=require('C:/Users/15043/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844}})
 // Use the production class structure and existing CSS, then apply only the fix.
 const css=fs.readFileSync('work/card-reading-20261016/h5-tournament-center-player-card-pc.css','utf8')+fs.readFileSync('work/card-reading-20261016/h5-tournament-center-player-detail-layout.css','utf8')
 await page.setContent('<style>body{margin:0}.fan-player-detail{position:fixed;inset:0;overflow:auto;background:white}'+css+'</style><div class="fan-player-detail"><div class="fan-player-detail-content"><div class="fan-pc-card-host"></div></div></div>')
 const image='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1290"><rect x="3" y="3" width="894" height="1284" fill="#113c29" stroke="#d49a4d" stroke-width="6"/><text x="450" y="80" fill="white" font-size="50" text-anchor="middle">FULL CARD</text><text x="450" y="1220" fill="white" font-size="50" text-anchor="middle">BOTTOM EDGE</text></svg>').toString('base64')
 await page.evaluate(src=>{const i=new Image();i.className='published-player-card';i.src=src;document.querySelector('.fan-pc-card-host').append(i)},image)
 const before=await page.locator('.published-player-card').evaluate(i=>({w:i.getBoundingClientRect().width,h:i.getBoundingClientRect().height}))
 assert.equal(before.w,900,'reproduce missing full-card sizing rather than testing a synthetic unrelated container')
 await page.addStyleTag({path:'service-account-h5/tournament-center-card-fit.css'})
 for(const width of [320,390,768]){await page.setViewportSize({width,height:844});const box=await page.locator('.published-player-card').evaluate(i=>{const b=i.getBoundingClientRect();return {w:b.width,h:b.height,x:b.x,fit:getComputedStyle(i).objectFit,screen:innerWidth}});assert.ok(box.w<=300&&box.x>=0&&box.x+box.w<=box.screen);assert.ok(Math.abs(box.h/box.w-430/300)<.01);assert.equal(box.fit,'contain')}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'work/card-display-paths-20261016/card-fit-mobile.png'})
 console.log('PASS: actual production selectors reproduce natural 900px overflow; fixed full-card ratio fits 320/390/768 viewports without cropping or portrait transforms')
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1})
