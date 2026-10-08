// Browser fixture only. External requests are intercepted; synthetic account and event data.
// Run with SXF_PLAYWRIGHT_MODULE and the local preview-base dev server on port 5202.
const {chromium}=require(process.env.SXF_PLAYWRIGHT_MODULE),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1500,height:1000}});let fail=false;const calls=[];
 const eventId='fixture-real-event',user={_id:'fixture-user',orgId:'fixture-org',organizationName:'测试机构',phone:'13800000000'};
 const divisions=['青年组','中年组','老年组'].map((name,i)=>({_id:'division-'+i,id:'division-'+i,tournamentId:eventId,name,mode:'simple',matchFormat:'8side',expectedTeams:12}));
 const teams=Array.from({length:9},(_,i)=>({_id:'team-'+i,orgId:'fixture-shared-org',name:'真实读取样例队'+(i+1),playerCount:16}));
 const relations=teams.map((t,i)=>({_id:'relation-'+i,teamId:t._id,teamName:t.name,tournamentId:eventId,divisionId:'division-0',status:'approved',claimStatus:'claimed',participationStatus:'confirmed'}));
 const tournament={_id:eventId,name:'真实赛事读取测试',orgId:'fixture-shared-org',creatorId:'fixture-organizer',status:'ongoing',divisions:[]};const tables={tournaments:[tournament],divisions,tournament_teams:relations,teams,players:[]};
 await page.addInitScript(user=>{localStorage.setItem('authToken','fixture-token');localStorage.setItem('userInfo',JSON.stringify(user));for(const[k,v]of Object.entries({isLoggedIn:'true',loginType:'wechat',authSessionVersion:'phone-canonical-web-v1',role:'organizer',currentRole:'organizer',userId:user._id}))localStorage.setItem(k,v);sessionStorage.setItem('sxfTournamentDemoMode','1');},user);
 await page.route('**/*',route=>{
  if(new URL(route.request().url()).hostname==='127.0.0.1')return route.continue();
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'},body:''});const p=route.request().postDataJSON();if(!p)return route.abort();calls.push(p);let result={success:true,data:{}};
  if(p.action==='callFunction'&&p.functionName==='tournamentStaffAccess')result={success:true,isOwner:false,isStaff:true,activeOrgId:'fixture-shared-org',grants:[{id:'fixture-grant',orgId:'fixture-shared-org',tournamentId:eventId,permissions:['event.teams'],status:'active'}],invitations:[]};
  else if(p.action==='callFunction'&&p.functionName==='onboardingWorkspace')result={success:true,organization:{id:'fixture-org',name:'测试机构',capabilities:['event']},requiresOnboarding:false};
  else if(p.action==='callFunction'&&p.functionName==='tournamentRegistrationFlow')result={success:true,data:{subscribed:true}};
  else if(p.action==='getCurrentAccountProfile')result={success:true,data:{user,phone:user.phone}};
  else if(p.action==='dbQuery'){
   if(fail&&p.collection==='divisions')result={success:false,code:'DATA_READ_FAILED',error:'测试：组别读取失败'};
   else{let rows=tables[p.collection]||[];if(p.operation==='get')result={success:true,data:rows.find(r=>r._id===p.id)||null};else{rows=rows.filter(r=>Object.entries(p.where||{}).every(([k,v])=>v&&typeof v==='object'&&v.$in?v.$in.includes(r[k]):r[k]===v));result={success:true,data:rows.slice(p.skip||0,(p.skip||0)+(p.limit||100))};}}
  }return route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify(result)});
 });
 const url='http://127.0.0.1:5202/preview/admin/#/tournaments/'+eventId+'/teams';await page.goto(url);await page.getByRole('heading',{name:'球队管理',exact:true}).waitFor();await page.waitForTimeout(500);if(await page.locator('.team-load-error').count())await page.locator('.team-load-error').getByRole('button',{name:'重新加载'}).click();
 await page.locator('.team-overview-card').first().waitFor();assert.equal(await page.locator('.team-overview-card').count(),9);assert.equal(await page.locator('.division-tab-button').count(),3);assert.equal(await page.evaluate(()=>sessionStorage.getItem('sxfTournamentDemoMode')),null);assert(calls.some(p=>p.collection==='tournament_teams'));
 fail=true;await page.reload();await page.locator('.team-load-error').waitFor();assert.equal(await page.getByText('待创建组别',{exact:true}).count(),0);assert.equal(await page.locator('.team-overview-card').count(),0);assert.equal(await page.getByText('当前组别暂无已审核球队',{exact:false}).count(),0);
 fail=false;await page.locator('.team-load-error').getByRole('button',{name:'重新加载'}).click();await page.locator('.team-overview-card').first().waitFor();assert.equal(await page.locator('.team-overview-card').count(),9);
 console.log('PASS: stale flag + shared real route loads 3 divisions and 9 teams; failed read shows error not fake empty state; retry restores fixture data; all requests mocked');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
