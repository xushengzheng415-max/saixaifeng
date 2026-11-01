// Isolated synthetic browser regression. Start the /admin/ dev server on 5197.
// Set SXF_PLAYWRIGHT_MODULE when Playwright is installed outside this repository.
const fs=require('node:fs'),path=require('node:path');
const fixturePath=path.resolve('web-admin-vue/team-avatar-qa.html');
const fixtureHtml="<!DOCTYPE html><html lang=\"zh-CN\"><meta charset=\"UTF-8\"><div id=\"app\"></div><script type=\"module\">\nimport {createApp,ref,h} from 'vue';import PlayerAvatar from './src/components/common/PlayerAvatar.vue';\nconst rows=ref(Array.from({length:46},(_,i)=>({_id:'fixture-'+i,name:'隔离球员'+(i+1),photoUrl:i<44?'cloud://fixture/portrait-'+i+'.png':'',photoFileID:i<44?'cloud://fixture/portrait-'+i+'.png':''})));window.avatarRows=rows;createApp({setup:()=>()=>h('div',rows.value.map(row=>h('div',{class:'player-row',style:'display:flex;gap:16px;align-items:center;min-height:52px'},[h(PlayerAvatar,{key:row._id,player:row}),h('span',row.name)])))}).mount('#app');\n</script></html>";
const {chromium}=require(process.env.SXF_PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{
if(fs.existsSync(fixturePath))throw new Error('QA fixture already exists; preserve it before running this regression');
fs.writeFileSync(fixturePath,fixtureHtml);let browser;
try {
browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const page=await browser.newPage({viewport:{width:1400,height:1000}});const errors=[];page.setDefaultTimeout(20000);page.on('console',m=>console.log('browser:',m.text()));page.on('pageerror',e=>console.log('PAGE ERROR',e.message));page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.avatarResolverCalls=[];window.avatarResolved=false;window.avatarFault='';window.avatarWaiters=[];window.avatarRelease=()=>{window.avatarResolved=true;for(const fn of window.avatarWaiters.splice(0))fn()}});
await page.route('**/src/utils/cloud*',route=>route.fulfill({contentType:'application/javascript',body:`export async function getFileUrl(id){window.avatarResolverCalls.push(id);if(!window.avatarResolved)await new Promise(r=>window.avatarWaiters.push(r));return id===window.avatarFault?id:'/admin/images/player-card-layers/preview-portrait.png'}`}));
await page.goto('http://127.0.0.1:5197/admin/team-avatar-qa.html');await page.locator('.player-row').last().waitFor();
assert.equal(await page.locator('.player-row').count(),46);assert.equal(await page.locator('img[src^="cloud:"]').count(),0);assert.equal(await page.locator('.player-avatar[data-avatar-status="loading"]').count(),44);assert.equal(await page.locator('.player-avatar[data-avatar-status="missing"]').count(),2);
await page.evaluate(()=>window.avatarRelease());await page.waitForFunction(()=>Array.from(document.querySelectorAll('.player-avatar img')).filter(img=>img.complete && img.naturalWidth>0).length===44);
assert.equal(await page.locator('.player-avatar img').count(),44);assert.equal(await page.locator('.player-avatar[data-avatar-status="missing"]').count(),2);
const styles=await page.locator('.player-avatar img').first().evaluate(el=>{const s=getComputedStyle(el);return {fit:s.objectFit,radius:s.borderRadius,background:s.backgroundColor}});assert.equal(styles.fit,'contain');assert.equal(styles.radius,'0px');assert.equal(styles.background,'rgba(0, 0, 0, 0)');
// HTTP failure exposes retry; retry of the same cached URL creates a new img.
await page.locator('.player-avatar img').first().dispatchEvent('error');assert.equal(await page.getByRole('button',{name:'重试加载照片',exact:true}).count(),1);await page.getByRole('button',{name:'重试加载照片',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.player-avatar img').length===44);
// Cloud resolution may fail without returning a usable browser URL, and can recover.
await page.evaluate(()=>{window.avatarFault='cloud://fixture/retry.png';window.avatarRows.value[0].photoUrl=window.avatarFault;window.avatarRows.value[0].photoFileID=window.avatarFault});await page.getByRole('button',{name:'重试加载照片',exact:true}).waitFor();assert.equal(await page.locator('img[src^="cloud:"]').count(),0);await page.evaluate(()=>window.avatarFault='');await page.getByRole('button',{name:'重试加载照片',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.player-avatar img').length===44);
// A removed image's late error must not poison a different URL.
const old=await page.locator('.player-avatar img').first().elementHandle();await page.evaluate(()=>{window.avatarRows.value[0].photoUrl='/admin/images/player-card-layers/preview-portrait.png?replacement=1'});await page.waitForFunction(()=>document.querySelector('.player-avatar img').src.includes('replacement=1'));await old.dispatchEvent('error');assert.equal(await page.locator('.player-avatar img').count(),44);
assert.deepEqual(errors,[]);console.log('PASS: 46-row first paint does not wait for photos; 44 cloud portraits resolve and display, 2 missing remain missing; raw cloud IDs never reach img; HTTP/resolver retries recover; stale errors do not hide new URLs; transparent contain rendering');
}finally{if(browser)await browser.close();fs.unlinkSync(fixturePath)}
})().catch(e=>{console.error(e);process.exit(1)});
