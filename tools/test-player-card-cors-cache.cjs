const assert=require('node:assert/strict'),http=require('node:http')
const {PNG}=require('../cloudfunctions/webLoginApi/node_modules/pngjs')
const {chromium}=require('C:/Users/15043/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const png=new PNG({width:300,height:430});png.data.fill(255)
const bytes=PNG.sync.write(png),requests=[]
const app=http.createServer((req,res)=>res.end('<main></main>'))
let origin
const media=http.createServer((req,res)=>{
 requests.push({url:req.url,origin:req.headers.origin||'',cache:req.headers['cache-control']||''})
 res.setHeader('Cache-Control','public, max-age=3600')
 res.setHeader('Content-Type','image/png')
 // Deliberately omit Vary: Origin, matching the cache fault on the real logo.
 if(req.headers.origin&& !req.url.startsWith('/denied'))res.setHeader('Access-Control-Allow-Origin',origin)
 if(req.url.startsWith('/slow'))return setTimeout(()=>res.end(bytes),200)
 res.end(bytes)
})
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const stop=server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()})
;(async()=>{
 await listen(app);await listen(media);origin='http://127.0.0.1:'+app.address().port
 const base='http://127.0.0.1:'+media.address().port,logo=base+'/shared.png?sign=unchanged&expires=123'
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{
  const page=await browser.newPage();await page.goto(origin)
  await page.addScriptTag({path:'shared/player-card/draw.js'})
  const result=await page.evaluate(async({logo,base})=>{
   const warm=new Image();await new Promise((resolve,reject)=>{warm.onload=resolve;warm.onerror=reject;warm.src=logo})
   const rawCors=await new Promise(resolve=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>resolve(true);i.onerror=()=>resolve(false);i.src=logo})
   const source='data:image/png;base64,'+await fetch(base+'/source.png').then(r=>r.blob()).then(blob=>new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(blob)}))
   let made=0,revoked=0;const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL)
   URL.createObjectURL=blob=>{made++;return create(blob)};URL.revokeObjectURL=url=>{revoked++;return revoke(url)}
   const rows=Array.from({length:24},(_,n)=>({playerId:'player-'+n,teamId:n%2?'team-two':'team-one',name:'Player '+n,status:'ready',cardScene:{protocolVersion:'player-card-dynamic/1',assets:{background:source,mask:source,portrait:source,teamLogo:logo},photo:{x:150,y:100,scale:100},layout:{},badges:{},values:{},fonts:[]}}))
   await SxfDynamicCard.hydrate({cards:rows})
   const noAccess=await SxfDynamicCard.createWebResources().loadImage(base+'/denied.png').then(()=>false,()=>true)
   const timedOut=await SxfDynamicCard.createWebResources({imageTimeout:20}).loadImage(base+'/slow.png').then(()=>'',e=>e.code)
   return {rawCors,ready:rows.filter(r=>r.cardUrl?.startsWith('data:image/png')).length,ids:rows.map(r=>[r.playerId,r.teamId]),noAccess,timedOut,made,revoked}
  },{logo,base})
  assert.equal(result.rawCors,false,'must reproduce ordinary-thumbnail cache poisoning before testing recovery')
  assert.equal(result.ready,24);assert.equal(result.noAccess,true,'a genuine CORS denial must still fail')
  assert.equal(result.timedOut,'CARD_ASSET_TIMEOUT');assert.equal(result.made,1);assert.equal(result.revoked,1,'release temporary blob URL after decode')
  assert.deepEqual(result.ids,Array.from({length:24},(_,n)=>['player-'+n,n%2?'team-two':'team-one']))
  const shared=requests.filter(r=>r.url.startsWith('/shared'))
  assert.equal(shared.length,2,'one ordinary cached thumbnail plus one shared fresh CORS request for 24 cards')
  assert.equal(shared[1].origin,origin);assert.ok(shared.every(r=>r.url==='/shared.png?sign=unchanged&expires=123'),'preserve signed path and query exactly')
  console.log('PASS: real HTTP thumbnail cache reproduces CORS failure; 24 cards across two teams share one recovered logo; IDs and signed URL stay unchanged; genuine denial/timeout still fail; blob URL released')
 }finally{await browser.close();await stop(app);await stop(media)}
})().catch(e=>{console.error(e);process.exitCode=1})
