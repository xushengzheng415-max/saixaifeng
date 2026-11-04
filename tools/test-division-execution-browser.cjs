const {chromium}=require('./lib/load-playwright.cjs')
const {createDivisionExecutionRules}=require('../cloudfunctions/webLoginApi/divisionExecutionRules.cjs')
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
async function main(){
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),requests=[],writes=[],errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',async route=>{
  if(route.request().url().startsWith('http://127.0.0.1:5190/'))return route.continue()
  if(!route.request().url().includes('/webLoginApi'))return route.abort()
  const body=route.request().postDataJSON();let response={success:true,data:{}}
  if(body.action==='updateDivisionExecutionRules'){
   requests.push(body)
   const before={_id:body.divisionId,tournamentId:'qa-tournament-2026',orgId:'qa-org',rulesLocked:true,rulesVersion:body.expectedRulesVersion,activeRulesVersion:body.expectedRulesVersion,activeRulesSnapshot:{matchMinutes:30,pointsWin:3,regulationDetails:{benchTotalLimit:null}}}
   const db={runTransaction:fn=>fn(db),collection(name){assert.equal(name,'divisions');return{doc:()=>({get:async()=>({data:before}),update:async({data})=>writes.push(data)})}}}
   const handler=createDivisionExecutionRules({cloud:{database:()=>db},authenticateWebSession:async()=>({success:true,userId:'fixture-organizer',orgId:'qa-org',user:{_id:'fixture-organizer'}}),buildOrganizerScope:async()=>({orgId:'qa-org'}),organizerRecordAllowed:()=>true,staffPolicy:{isStaff:async()=>false}})
   response=await handler(body)
  }
  return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(response)})
 })
 try{
  await page.goto('http://127.0.0.1:5190/admin/?visualQa=1#/tournaments/qa-tournament-2026/competition/rules?divisionId=qa-division-u8&step=effective&visualQa=1')
  await page.getByRole('button',{name:'调整比赛规则',exact:true}).first().click()
  await page.waitForTimeout(350)
  const dialog=page.getByRole('dialog',{name:'调整比赛规则'})
  await dialog.waitFor()
  for(const [label,count] of [['替补席总人数','12'],['替补球员人数','9'],['球队官员人数','3']])await dialog.locator('.el-form-item').filter({hasText:label}).getByRole('spinbutton').fill(count)
  await dialog.getByRole('button',{name:'保存',exact:true}).click()
  await dialog.waitFor({state:'hidden'})
  assert.equal(requests.length,1)
  assert.deepEqual(requests[0].regulationDetails,{benchTotalLimit:12,benchPlayerLimit:9,benchOfficialLimit:3})
  assert.equal(writes.length,1)
  assert.equal(writes[0].activeRulesSnapshot.matchMinutes,30)
  assert.equal(writes[0].rulesHistory[0].snapshot.regulationDetails.benchTotalLimit,null)
  await page.getByRole('button',{name:'调整比赛规则',exact:true}).first().click()
  await page.waitForTimeout(350)
  assert.equal(await dialog.locator('.el-form-item').filter({hasText:'替补席总人数'}).getByRole('spinbutton').inputValue(),'12')
  const out=path.resolve(__dirname,'../output/division-execution-20261104');fs.mkdirSync(out,{recursive:true})
  await page.screenshot({path:path.join(out,'dialog-desktop.png'),fullPage:true})
  await page.setViewportSize({width:390,height:844})
  await page.waitForTimeout(350)
  assert(await dialog.evaluate(el=>el.getBoundingClientRect().width<=390))
  assert(await dialog.getByRole('button',{name:'保存',exact:true}).evaluate(el=>el.getBoundingClientRect().bottom<=844))
  await page.screenshot({path:path.join(out,'dialog-mobile.png')})
  assert.equal(errors.length,0,errors.join('\n'))
  console.log('实际规则页→受控后端模块→版本回显：三项替补席保存/历史保留/桌面与390px布局通过；未写云端')
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
