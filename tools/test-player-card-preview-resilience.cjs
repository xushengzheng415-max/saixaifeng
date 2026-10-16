const assert=require('node:assert/strict'),fs=require('node:fs'),{PNG}=require('../cloudfunctions/webLoginApi/node_modules/pngjs')
const {chromium}=require('C:/Users/15043/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const {createAssetResolver,mapLimit}=require('../cloudfunctions/webLoginApi/playerCardPreviewAssets.cjs')
async function serverTest(){
 let calls=[],active=0,peak=0;const cloud={async getTempFileURL({fileList}){calls.push(fileList);return {fileList:fileList.map(fileID=>({fileID,tempFileURL:fileID==='missing'||fileID==='temporary'&&calls.length===1?'':'https://fixture/'+fileID}))}}}
 const resolve=createAssetResolver(cloud);const first=await Promise.all(Array.from({length:24},(_,i)=>resolve(['background','mask','teamLogo','photo'+i,'temporary'])))
 assert.ok(first.every(map=>map.get('background')&&map.get('temporary')));assert.equal(calls.length,2);assert.deepEqual(calls[1],['temporary']);assert.equal(calls[0].filter(id=>id==='background').length,1)
 assert.equal((await resolve(['missing'])).get('missing'),'');assert.equal((await resolve(['missing'])).get('missing'),'');assert.equal(calls.length,6,'failed lookup is evicted and can retry')
 const values=await mapLimit(Array.from({length:24},(_,i)=>i),4,async n=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));active--;return n});assert.deepEqual(values,Array.from({length:24},(_,i)=>i));assert.equal(peak,4)
}
async function browserTest(){
 const browser=await chromium.launch({headless:true,channel:'msedge'});try{
  const p=await browser.newPage();let active=0,peak=0,counts={},blocked=true;const bytes={}
  for(const [name,gray]of [['background',90],['mask',255],['portrait',120]]){const png=new PNG({width:300,height:430});for(let i=0;i<png.data.length;i+=4){png.data[i]=png.data[i+1]=png.data[i+2]=gray;png.data[i+3]=255}bytes[name]=PNG.sync.write(png)}
  await p.route('https://fixture.invalid/**',async route=>{const key=new URL(route.request().url()).pathname.slice(1);counts[key]=(counts[key]||0)+1;active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,20));active--;if(key==='photo0'&&counts[key]===1||key==='badphoto'&&blocked)return route.abort();return route.fulfill({body:bytes[key==='background'?'background':key==='mask'?'mask':'portrait'],contentType:'image/png',headers:{'Access-Control-Allow-Origin':'*'}})})
  await p.setContent('<main></main>');await p.addScriptTag({path:'shared/player-card/draw.js'})
  const result=await p.evaluate(async()=>{const make=id=>({playerId:id,status:'ready',cardScene:{protocolVersion:'player-card-dynamic/1',assets:{background:'https://fixture.invalid/background',mask:'https://fixture.invalid/mask',portrait:'https://fixture.invalid/photo'+id,teamLogo:'https://fixture.invalid/logo'},photo:{x:150,y:100,scale:100},layout:{},badges:{},values:{},fonts:[]}});const payload={cards:Array.from({length:24},(_,i)=>make(String(i)))};payload.cards[1].cardScene.assets.portrait='https://fixture.invalid/badphoto';await SxfDynamicCard.hydrate(payload);window.retryCard=payload.cards[1];return payload.cards.map(row=>({id:row.playerId,status:row.status,hasImage:row.cardUrl.startsWith('data:image/png'),error:row.cardError,code:row.cardErrorCode,asset:row.cardAsset}))})
  assert.equal(result.filter(row=>row.hasImage).length,23);assert.equal(result[1].error,'球员照片读取失败，请重试预览');assert.equal(result[1].asset,'portrait');assert.equal(counts.background,1);assert.equal(counts.mask,1);assert.equal(counts.logo,1);assert.equal(counts.photo0,2);assert.equal(counts.badphoto,2);assert.ok(peak<=5,'shared assets and only two concurrent scenes bound network requests')
  blocked=false;const retry=await p.evaluate(async()=>{await SxfDynamicCard.hydrate(window.retryCard);return {status:retryCard.status,error:retryCard.cardError,image:!!retryCard.cardUrl}});assert.equal(retry.status,'ready');assert.equal(retry.error,'');assert.equal(retry.image,true)
  const locked=await p.evaluate(async()=>{const row={status:'locked',cardScene:{}};await SxfDynamicCard.hydrate(row);return row.status});assert.equal(locked,'locked')
  console.log('PASS: 24-card browser batch shares background/mask/logo, transient image recovers, persistent failure names portrait, failed cache evicts, retry recovers without loss; server coalesces 28+ file lookups and retries missing URL only; owner-read state unchanged')
 }finally{await browser.close()}
}
;(async()=>{await serverTest();await browserTest()})().catch(e=>{console.error(e);process.exitCode=1})
