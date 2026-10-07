// Local browser fixture only: every external request is intercepted; no production writes.
// SXF_PLAYWRIGHT_MODULE=<installed playwright path> node tools/test-registration-entries-browser.cjs
const {chromium}=require(process.env.SXF_PLAYWRIGHT_MODULE),assert=require('node:assert/strict');
require('node:fs').mkdirSync('.codex-artifacts',{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1500,height:1100}});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='127.0.0.1')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data:{}})});
  if(url.pathname.endsWith('/visualQaFixtures.js')){
   const r=await route.fetch();let s=await r.text();
   s=s.replace(/if \(action === ['"]callFunction['"]\) \{/,match=>match+`\nif(data.functionName==='tournamentRegistrationFlow' && data.functionParams?.action==='createTargetedRegistrationLink')return {handled:true,result:window.__registrationInviteFail?{success:false,message:'测试：链接生成失败'}:{success:true,data:{envVersion:'release',urlLink:'https://fixture.invalid/public-invite'}}};`);
   s+='\ndivisions.forEach(d=>d.expectedTeams=64);\n';return route.fulfill({response:r,body:s});
  }return route.continue();
 });
 for(const division of ['qa-division-u8','qa-division-u16']){
  await page.goto('http://127.0.0.1:5200/admin/#/tournaments/qa-tournament-2026/registration?divisionId='+division+'&visualQa=1');
  await page.getByRole('heading',{name:'报名管理',exact:true}).waitFor();
  const actions=page.locator('.heading-actions');assert.equal(await actions.getByRole('button').count(),2);
  assert.equal(await page.getByRole('button',{name:'生成报名海报',exact:true}).count(),0);assert.equal(await page.getByRole('tab',{name:'宣传物料'}).count(),0);
  await actions.getByRole('button',{name:'邀请球队',exact:true}).click();
  await page.getByRole('textbox',{name:'公开邀约链接'}).waitFor();assert.equal(await page.getByRole('textbox',{name:'公开邀约链接'}).inputValue(),'https://fixture.invalid/public-invite');
  await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
  await actions.getByRole('button',{name:'添加球队',exact:true}).click();await page.getByRole('menuitem',{name:'快速添加',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByPlaceholder('输入球队名称').waitFor();
  assert.equal(await dialog.locator('.el-form-item').count(),2);assert.equal(await dialog.getByText('球队负责人',{exact:true}).count(),0);
  if(division==='qa-division-u8')await dialog.screenshot({path:'.codex-artifacts/registration-quick-add-20261007.png'});
  const name='本地名称队徽快添-'+division;await dialog.getByPlaceholder('输入球队名称').fill(name);await dialog.getByRole('button',{name:'添加球队',exact:true}).click();
  await dialog.waitFor({state:'hidden'});
  const created=await page.evaluate(name=>window.__sxfVisualQaSnapshot.teams.find(t=>t.name===name),name);
  assert(created);assert.equal(created.ownerPhone,'');assert.equal(created.contactPhone,'');assert.equal(created.claimStatus,'pending_claim');
  await actions.getByRole('button',{name:'添加球队',exact:true}).click();await page.getByRole('menuitem',{name:'上传资料、名单',exact:true}).click();
  await page.getByRole('dialog').getByText('选择Word文件',{exact:false}).first().waitFor({state:'visible',timeout:5000}).catch(()=>{});
  assert.equal(await page.getByRole('dialog').locator('input[type=file]').count()>0,true);
  await page.getByRole('dialog').locator('.el-dialog__headerbtn').click();
 }
 await page.evaluate(()=>window.__registrationInviteFail=true);await page.locator('.heading-actions').getByRole('button',{name:'邀请球队',exact:true}).click();await page.getByRole('dialog').getByText('测试：链接生成失败',{exact:true}).waitFor();assert.equal(await page.getByRole('dialog').getByRole('button',{name:'重试',exact:true}).count(),1);
 console.log('PASS: two actions; public link/error; two-field quick add in both modes; no owner binding; upload importer reachable; fixture only');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
