const {chromium}=require('./lib/load-playwright.cjs')
const {createDivisionExecutionRules}=require('../cloudfunctions/webLoginApi/divisionExecutionRules.cjs')
const {buildStaffEventScope,recordBelongsToStaffEvent}=require('../cloudfunctions/webLoginApi/staffEventScope.cjs')
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
async function main(){
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),requests=[],writes=[],errors=[],organizationCalls=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',async route=>{
  if(route.request().url().startsWith('http://127.0.0.1:5190/'))return route.continue()
  if(!route.request().url().includes('/webLoginApi'))return route.abort()
  const body=route.request().postDataJSON();let response={success:true,data:{}}
  if(body.action==='updateDivisionExecutionRules'){
   requests.push(body)
    const before={_id:body.divisionId,tournamentId:'qa-tournament-2026',orgId:'qa-org',rulesLocked:true,rulesVersion:body.expectedRulesVersion,activeRulesVersion:body.expectedRulesVersion,regulationDetails:{benchTotalLimit:15,benchOfficialLimit:5},activeRulesSnapshot:{matchMinutes:30,pointsWin:3,regulationDetails:{benchPlayerLimit:null,benchTotalLimit:15,benchOfficialLimit:5}}}
    const tables={divisions:[before],tournaments:[{_id:'qa-tournament-2026',orgId:'qa-org'}]}
    const db={runTransaction:fn=>fn(db),collection(name){return{
      doc:id=>({get:async()=>({data:(tables[name]||[]).find(x=>x._id===id)||null}),update:async({data})=>{assert.equal(name,'divisions');writes.push(data)}}),
      where:where=>{let skip=0,limit=100;const q={skip(n){skip=n;return q},limit(n){limit=n;return q},async get(){return{data:(tables[name]||[]).filter(x=>Object.entries(where).every(([k,v])=>x[k]===v)).slice(skip,skip+limit)}}};return q}
    }}}
    const handler=createDivisionExecutionRules({cloud:{database:()=>db},authenticateWebSession:async()=>({success:true,userId:'fixture-shared',orgId:'qa-org',user:{_id:'fixture-shared',orgId:'other-default-org'}}),buildOrganizerScope:async()=>{organizationCalls.push(true);throw new Error('不应切回本人默认机构')},buildStaffEventScope,organizerRecordAllowed:(collection,row,scope)=>recordBelongsToStaffEvent(collection,row,scope),staffPolicy:{isStaff:async()=>true,owner:async()=>false,hasRight:async()=>true}})
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
  await page.evaluate(()=>{sessionStorage.setItem('sxfTournamentStaff','1');sessionStorage.setItem('sxfStaffTournamentId','qa-tournament-2026')})
  assert.equal(await dialog.getByText('球队官员人数',{exact:true}).count(),0)
  assert.equal(await dialog.getByText('替补席总人数',{exact:true}).count(),0)
  await dialog.locator('.el-form-item').filter({hasText:'替补球员人数'}).getByRole('spinbutton').fill('10')
  await dialog.getByRole('button',{name:'保存',exact:true}).click()
  await dialog.waitFor({state:'hidden'})
  assert.equal(requests.length,1)
  assert.deepEqual(requests[0].regulationDetails,{benchPlayerLimit:10})
  assert.equal(requests[0].staffTournamentId,'qa-tournament-2026')
  assert.equal(organizationCalls.length,0)
  assert.equal(writes.length,1)
  assert.equal(writes[0].activeRulesSnapshot.matchMinutes,30)
  assert.equal(writes[0].rulesHistory[0].snapshot.regulationDetails.benchPlayerLimit,null)
  assert.equal(writes[0].regulationDetails.benchOfficialLimit,5)
  assert.equal(writes[0].regulationDetails.benchTotalLimit,15)
  await page.getByRole('button',{name:'调整比赛规则',exact:true}).first().click()
  await page.waitForTimeout(350)
  assert.equal(await dialog.locator('.el-form-item').filter({hasText:'替补球员人数'}).getByRole('spinbutton').inputValue(),'10')
  const out=path.resolve(__dirname,'../output/division-execution-20261104');fs.mkdirSync(out,{recursive:true})
  await page.screenshot({path:path.join(out,'dialog-desktop.png'),fullPage:true})
  await page.setViewportSize({width:390,height:844})
  await page.waitForTimeout(350)
  assert(await dialog.evaluate(el=>el.getBoundingClientRect().width<=390))
  assert(await dialog.getByRole('button',{name:'保存',exact:true}).evaluate(el=>el.getBoundingClientRect().bottom<=844))
  await page.screenshot({path:path.join(out,'dialog-mobile.png')})
  assert.equal(errors.length,0,errors.join('\n'))
  console.log('实际共享账号规则页→生产赛事范围→保存→回显10名球员通过；官员/总数不展示不改写，历史保留，无云端写入')
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
