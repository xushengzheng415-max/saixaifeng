'use strict'
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const crypto=require('node:crypto')
const Module=require('node:module')
const vm=require('node:vm')
const {pathToFileURL}=require('node:url')
const root=path.resolve(__dirname,'..')
const analysis=require('../cloudfunctions/webLoginApi/refereeReportAnalysis.cjs')
const draft=require('../miniprogram/utils/refereeReportDraft.js')
const mini=require('../cloudfunctions/webLoginApi/miniPaperReportSession.cjs')
const scope=require('../cloudfunctions/updateMatch/miniSharedRecording.cjs')
function clone(value){if(value==null||typeof value!=='object')return value;if(value instanceof Date)return new Date(value);if(Array.isArray(value))return value.map(clone);return Object.fromEntries(Object.keys(value).sort().map(key=>[key,clone(value[key])]))}
let next=1,ocrCalls=0,mutateBeforeSave=null
const store=new Map(),log=[]
const rows=name=>{if(!store.has(name))store.set(name,new Map());return store.get(name)}
const seed=(name,id,data)=>rows(name).set(id,{...clone(data),_id:id})
const command={gt:value=>({op:'gt',value}),in:value=>({op:'in',value}),or:value=>({op:'or',value}),and:value=>({op:'and',value})}
function matches(row,where){if(where.op==='or')return where.value.some(part=>matches(row,part));if(where.op==='and')return where.value.every(part=>matches(row,part));return Object.entries(where).every(([key,value])=>value && value.op==='in'?value.value.includes(row[key]):value && value.op==='gt'?(row[key] instanceof Date?row[key].getTime()>new Date(value.value).getTime():row[key]>value.value):row[key]===value)}
const db={command,serverDate:()=>new Date(),async runTransaction(callback){if(mutateBeforeSave){const change=mutateBeforeSave;mutateBeforeSave=null;change()}return callback(db)},collection(name){
  function query(where={}){let skip=0,limit=100,sort=false;const q={where(value){where=value;return q},skip(value){skip=value;return q},limit(value){limit=value;return q},orderBy(){sort=true;return q},field(){return q},async count(){return {total:[...rows(name).values()].filter(row=>matches(row,where)).length}},async get(){let all=[...rows(name).values()].filter(row=>matches(row,where));if(sort)all.sort((a,b)=>a._id.localeCompare(b._id));return {data:all.slice(skip,skip+limit).map(clone)}}};return q}
  return {...query(),doc(id){return {async get(){return {data:clone(rows(name).get(String(id)) || null)}},async update({data}){if(!rows(name).has(id))throw new Error('document does not exist');Object.assign(rows(name).get(id),clone(data));log.push([name,'update',id]);return {stats:{updated:1}}},async remove(){rows(name).delete(id)}}},async add({data}){const id='isolated-'+next++;seed(name,id,data);return {_id:id}}}
}}
const cloud={SYMBOL_CURRENT_ENV:'isolated',DYNAMIC_CURRENT_ENV:'isolated',init(){},database:()=>db,getWXContext:()=>({OPENID:'isolated'}),async downloadFile(){return {fileContent:Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(300)])}},async callFunction({name,data}){data=clone(data);if(name==='webLoginApi')return {result:clone(await paper(data,data.action==='confirmRefereeReport'))};if(name==='updateMatch')return {result:clone(await update.main(data))};throw new Error('Unexpected cloud call '+name)}}
const previousLoad=Module._load
Module._load=function(name,parent,isMain){if(name==='wx-server-sdk')return cloud;return previousLoad.call(this,name,parent,isMain)}
const update=require('../cloudfunctions/updateMatch/index.js')
Module._load=previousLoad
const ocr=require('../cloudfunctions/webLoginApi/refereeReportOcr.cjs')
process.env.BAIDU_REFEREE_OCR_SECRET_KEY='isolated-ocr-secret'
process.env.SXF_PAPER_REPORT_SECRET='isolated-paper-secret'
const recognition={teams:{home:[{name:'测试甲',number:'8',role:'starter',goals:'29',on:'',off:'',yellow:'',red:''}],away:[{name:'测试乙',number:'9',role:'starter',goals:'',on:'',off:'',yellow:'',red:''}]},score:{home:1,away:0},imageHash:'a'.repeat(64),analysisVersion:'isolated',warnings:[]}
ocr.recognize=async()=>{ocrCalls++;return clone(recognition)}
async function authenticate(event){const hash=crypto.createHash('sha256').update(event.authToken || '').digest('hex');const session=[...rows('auth_sessions').values()].find(row=>row.tokenHash===hash&&row.active&&row.expiresAt>new Date());if(!session)return {success:false,error:'unauthorized'};return mini.authenticate(db,event,session,rows('users').get(session.userId))}
const source=fs.readFileSync(path.join(root,'cloudfunctions/webLoginApi/index.js'),'utf8')
const handler=source.slice(source.indexOf('async function handlePaperRefereeReport('),source.indexOf('\nasync function handleDbQuery(',source.indexOf('async function handlePaperRefereeReport('))).replace("await import('./data-center/match-events.mjs')",'await loadEvents()')
const pcRequire=Module.createRequire(path.join(root,'cloudfunctions/webLoginApi/index.js'))
const paper=new Function('authenticateWebSession','handleDbQuery','staffPolicy','cloud','readDocumentOrNull','handleRosterExceptionBoard','handleCallFunction','crypto','require','loadEvents',handler+'\nreturn handlePaperRefereeReport')(
  authenticate,async event=>({success:true,data:clone(rows('matches').get(event.id))}),{isStaff:async()=>true,owner:async()=>false,hasRight:async(db,user,org,tournament,right)=>rows('tournament_staff_grants').get('grant').permissions.includes(right)},cloud,
  async(db,name,id)=>clone(rows(name).get(id) || null),async event=>({success:true,snapshot:{status:'approved'},rows:[...rows('players').values()].filter(row=>row.teamId===event.teamId).map(clone)}),
  async(event,verified)=>{assert.equal(verified,true);const identity=await authenticate(event);assert.equal(identity.success,true);return mini.relayImport(db,cloud,identity,event.functionParams)},crypto,pcRequire,()=>import(pathToFileURL(path.join(root,'cloudfunctions/webLoginApi/data-center/match-events.mjs')).href))
const operations=require('../cloudfunctions/getMiniWorkspace/sharedOperations.cjs')
const call=params=>operations.run(db,cloud,{user:{_id:'user'}},{action:'sharedEventOperation',tournamentId:'event',mode:'matches',id:'match',...params})
function fixtures(){
  store.clear();log.length=0
  seed('users','user',{phone:'13800000000'})
  seed('organizations','org',{ownerId:'other-owner'})
  seed('tournaments','event',{orgId:'org',matchFormat:'5side'})
  seed('tournament_staff_grants','grant',{status:'active',orgId:'org',userId:'user',tournamentId:'event',permissions:mini.RIGHTS.slice()})
  seed('matches','match',{orgId:'org',tournamentId:'event',divisionId:'division',status:'scheduled',homeTeamId:'home',awayTeamId:'away',matchFormat:'5side',matchEventRevision:0,events:[]})
  seed('divisions','division',{tournamentId:'event',matchFormat:'5side',periodMode:'halves',matchMinutes:30,substitutionRuleMode:'free',substitutionReentryAllowed:true})
  seed('players','p-home',{teamId:'home',name:'测试甲',jerseyNumber:'8'});seed('players','p-away',{teamId:'away',name:'测试乙',jerseyNumber:'9'})
}
async function recognized(){const ticket=await call({operation:'reportTicket'});const result=await call({operation:'recognizeReport',draftId:ticket.id,fileId:'cloud://isolated.bucket/'+ticket.path});return {ticket,result}}
async function run(){
  assert.equal(analysis.normalizeMinute('①29′②45′',{totalMinutes:60},'off').value,'29,45')
  assert.equal(analysis.normalizeMinute('①',{},'goals').value,'?')
  assert.equal(analysis.normalizeMinute('(1)29 (2)45',{},'on').value,'29,45')
  assert.deepEqual(require('../cloudfunctions/webLoginApi/refereeReportNotes.cjs').explicitEvents('主队29′换上55号'),[{field:'on',minute:29}])
  // Recreate the photographed sheet's combined mark column. Fields must not shift.
  const headers=['序号','队员姓名','号码','说明','身份','换上','换下','进球','黄牌','红牌']
  const cells=[],words=[]
  for(let row=0;row<2;row++)for(let col=0;col<headers.length;col++){
    const value=row===0?headers[col]:['1','测试甲','8','√','GK','','①29↓②45↑','18','',''][col],x=col*70,y=row*60
    cells.push({row_start:row,col_start:col,col_end:col+1,words:value,cell_location:[{x,y},{x:x+70,y},{x:x+70,y:y+60},{x,y:y+60}]})
    if(value)words.push({words:value,location:{left:x+8,top:y+10,width:50,height:18}})
  }
  const parsed=analysis.parseTables({tables_result:[{body:cells}]},{words_result:words},{halfMinutes:30,totalMinutes:60})
  assert.equal(parsed.teams.home[0].role,'starter')
  assert.equal(parsed.teams.home[0].goalkeeper,true)
  assert.equal(parsed.teams.home[0].goals,'18')
  assert.equal(parsed.teams.home[0].off,'29')
  assert.equal(parsed.teams.home[0].on,'45')
  assert.ok(parsed.annotations.length)
  const wideHeaders=['序号','队员姓名','号码','说明','身份','换上','换下','进球1','进球2','进球3','黄牌','红牌'],wideCells=[],wideWords=[]
  for(let row=0;row<2;row++)for(let col=0;col<wideHeaders.length;col++){
    const value=row===0?wideHeaders[col]:['1','测试甲','8','√','GK','','','18','29','45','50',''][col],x=col*70,y=row*60
    wideCells.push({row_start:row,col_start:col,col_end:col+1,words:value,cell_location:[{x,y},{x:x+70,y},{x:x+70,y:y+60},{x,y:y+60}]})
    if(value)wideWords.push({words:value,location:{left:x+8,top:y+10,width:50,height:18}})
  }
  const wide=analysis.parseTables({tables_result:[{body:wideCells}]},{words_result:wideWords},{halfMinutes:30,totalMinutes:60})
  assert.equal(wide.teams.home[0].goals,'18,29,45');assert.equal(wide.teams.home[0].yellow,'50')
  const blankCells=cells.map(cell=>cell.row_start===1&&cell.col_start===3?{...cell,words:''}:cell)
  const blankWords=words.filter(row=>row.words!=='√')
  const parseBlank=options=>analysis.parseTables({tables_result:[{body:blankCells}]},{words_result:blankWords},{halfMinutes:30,totalMinutes:60},null,options)
  assert.equal(parseBlank({}).teams.home[0].role,'unknown')
  assert.equal(parseBlank({blankRoleAsBench:true}).teams.home[0].role,'substitute')
  assert.equal(parseBlank({blankRoleAsBench:true}).teams.home[0].roleSource,'blank_as_substitute')
  const absentCells=cells.map(cell=>cell.row_start===1&&cell.col_start===3?{...cell,words:'×'}:cell)
  assert.equal(analysis.parseTables({tables_result:[{body:absentCells}]},{words_result:blankWords},{},null,{blankRoleAsBench:true}).teams.home[0].role,'absent')
  assert.deepEqual(analysis.scoreFromLocations({words_result:[{words:'比赛结果',location:{left:0,top:0,width:80,height:20}},{words:'2:5',location:{left:90,top:0,width:40,height:20}}]}),{home:2,away:5})
  assert.deepEqual(analysis.scoreFromLocations({words_result:[{words:'比赛结果2:5'},{words:'比赛结果2:6'}]}),{home:null,away:null})
  const free=analysis.parseTables({},{words_result:[{words:'主队98号测试丙 首发 进球29分'}]},{})
  assert.equal(free.teams.home[0].number,'98');assert.equal(free.teams.home[0].goals,'29');assert.ok(free.teams.home[0].reviewNotes.length)

  const players=[{id:'p-home',teamSide:'home',jerseyNumber:'8',name:'测试甲'},{id:'p-away',teamSide:'away',jerseyNumber:'9',name:'测试乙'}]
  const teams=draft.prepare(recognition,players),payload=draft.payload(teams,{home:'1',away:'0'},false)
  assert.equal(payload.teams.home[0].playerId,'p-home')
  const mismatch=draft.prepare({...recognition,teams:{...recognition.teams,home:[{...recognition.teams.home[0],name:'其他姓名'}]}},players)
  assert.equal(mismatch.home[0].playerId,'')
  assert.throws(()=>draft.payload(mismatch,{home:'1',away:'0'},false),/球员/)
  teams.home[0].reviewNotes=['圈号候选'];assert.throws(()=>draft.payload(teams,{home:'1',away:'0'},false),/待核对/)
  teams.home[0].reviewConfirmedFingerprint=draft.fingerprint(teams.home[0]);draft.payload(teams,{home:'1',away:'0'},false)
  teams.home[0].goals='30';assert.throws(()=>draft.payload(teams,{home:'1',away:'0'},false),/待核对/)

  fixtures()
  const {ticket,result}=await recognized()
  assert.equal(result.data.score.home,1)
  assert.equal(rows('matches').get('match').status,'scheduled')
  assert.equal([...rows('auth_sessions').values()].length,0)
  assert.equal(log.filter(row=>row[0]==='matches').length,0)
  const saved=await call({operation:'confirmReport',draftId:ticket.id,...payload})
  assert.equal(saved.success,true,saved.message || saved.error)
  assert.equal(rows('matches').get('match').status,'finished')
  assert.equal(rows('matches').get('match').homeScore,1)
  assert.equal(rows('matches').get('match').events.length,1)
  assert.equal(rows('matches').get('match').paperReportImports.length,1)
  assert.equal([...rows('auth_sessions').values()].length,0)
  const repeated=await call({operation:'confirmReport',draftId:ticket.id,...payload})
  assert.equal(repeated.alreadyImported,true);assert.equal(rows('matches').get('match').events.length,1)

  // A paper report must not erase a PC's saved tactical layout for unchanged starters.
  fixtures();const originalTeams=clone(recognition.teams),tacticalTeams={home:[],away:[]},savedTactics={}
  for(const side of ['home','away']){
    const positions=require('../shared/lineup/formation-data.json')['5人制'].formations['2-2'].positions
    recognition.teams[side]=positions.map((slot,i)=>{const id=i?'p-'+side+'-'+i:'p-'+side,name=i?'测试球员'+i:side==='home'?'测试甲':'测试乙',number=String(i+8);seed('players',id,{teamId:side,name,jerseyNumber:number});tacticalTeams[side].push({playerId:id,role:'starter',goals:side==='home'&&!i?'29':''});return {name,number,role:'starter',goals:side==='home'&&!i?'29':''}})
    savedTactics[side]={formation:'2-2',players:positions.map((slot,i)=>({id:i?'p-'+side+'-'+i:'p-'+side,role:slot.role}))}
  }
  rows('matches').get('match').lineups=savedTactics
  const tacticalTask=await recognized(),tacticalResult=await call({operation:'confirmReport',draftId:tacticalTask.ticket.id,teams:tacticalTeams,score:{home:1,away:0},substitutions:[]})
  assert.equal(tacticalResult.success,true);assert.equal(rows('matches').get('match').lineups.home.formation,'2-2');assert.equal(rows('matches').get('match').lineups.home.players.find(p=>p.id==='p-home').role,'GK')
  recognition.teams=originalTeams

  // Existing mobile drafts predate canonical evidence signatures. Database and
  // function transports reorder keys above, while the old signature stays intact.
  fixtures();let oldTask=await recognized();let savedDraft=rows('match_report_imports').get(oldTask.ticket.id),wireEvidence=savedDraft.recognition.evidence
  const oldEvidence={matchId:wireEvidence.matchId,fileId:wireEvidence.fileId,imageHash:wireEvidence.imageHash,analysisVersion:wireEvidence.analysisVersion,timing:{halfMinutes:wireEvidence.timing.halfMinutes,totalMinutes:wireEvidence.timing.totalMinutes,source:wireEvidence.timing.source,needsReview:wireEvidence.timing.needsReview,ruleVersion:wireEvidence.timing.ruleVersion}}
  savedDraft.recognition.proof=crypto.createHmac('sha256',process.env.BAIDU_REFEREE_OCR_SECRET_KEY).update(JSON.stringify(oldEvidence)).digest('hex')
  const legacySaved=await call({operation:'confirmReport',draftId:oldTask.ticket.id,...payload});assert.equal(legacySaved.success,true);assert.equal(rows('matches').get('match').events.length,1)
  fixtures();oldTask=await recognized();savedDraft=rows('match_report_imports').get(oldTask.ticket.id);savedDraft.recognition.evidence.imageHash='b'.repeat(64)
  await assert.rejects(call({operation:'confirmReport',draftId:oldTask.ticket.id,...payload}),/凭证/);assert.equal(rows('matches').get('match').status,'scheduled')

  fixtures();let task=await recognized();rows('matches').get('match').matchEventRevision=1
  await assert.rejects(call({operation:'confirmReport',draftId:task.ticket.id,...payload}),/已变化/)
  fixtures();task=await recognized();rows('tournament_staff_grants').get('grant').permissions=['event.matches']
  await assert.rejects(call({operation:'confirmReport',draftId:task.ticket.id,...payload}),/未授权/)
  fixtures();const taskTicket=await call({operation:'reportTicket'})
  const oldOcr=ocrCalls
  await assert.rejects(call({operation:'recognizeReport',draftId:taskTicket.id,fileId:'cloud://isolated.bucket/match-reports/other/x.jpg'}),/不属于/)
  assert.equal(ocrCalls,oldOcr)
  fixtures();task=await recognized();rows('matches').get('match').refereeRecordLocked=true
  await assert.rejects(call({operation:'confirmReport',draftId:task.ticket.id,...payload}),/锁定/)
  fixtures();task=await recognized();mutateBeforeSave=()=>{rows('tournament_staff_grants').get('grant').status='disabled'}
  await assert.rejects(call({operation:'confirmReport',draftId:task.ticket.id,...payload}),/停用|变化/)
  assert.equal(rows('matches').get('match').status,'scheduled')
  assert.equal([...rows('auth_sessions').values()].length,0)

  const session={source:'mini_shared_operation',allowedFunction:'webLoginApi',allowedAction:'recognizeRefereeReport',targetMatchId:'match',tournamentId:'event',grantId:'grant',activeOrgId:'org',userId:'user'}
  fixtures()
  assert.equal((await mini.authenticate(db,{action:'dbQuery',matchId:'match',staffTournamentId:'event'},session,{_id:'user'})).success,false)
  assert.equal((await mini.authenticate(db,{action:'recognizeRefereeReport',matchId:'foreign',staffTournamentId:'event'},session,{_id:'user'})).success,false)
  const actor={miniScope:{operation:'paperImport',tournamentId:'event',recordRevision:'bad'}}
  assert.throws(()=>scope.assert(actor,{action:'importPaperReport',data:{status:'finished'}},rows('matches').get('match')),/首发状态/)
  // Drive the actual component through upload, recognition and duplicate save clicks.
  fixtures()
  let definition,uploads=0,confirmCalls=0,savedEvents=0,failFirstSave=true
  const wx={chooseMedia({success,complete,sizeType}){assert.deepEqual(Array.from(sizeType),['original']);success({tempFiles:[{tempFilePath:'isolated-photo.jpg',size:500}]});if(complete)complete()},getImageInfo({success}){success({width:1080,height:1920,type:'jpg'})},showToast(){},showModal({success}){success({confirm:true})},cloud:{uploadFile({success}){uploads++;success({fileID:'cloud://isolated.bucket/'+[...rows('match_report_imports').values()].slice(-1)[0].path});return {onProgressUpdate(){}}},async callFunction({data}){if(data.operation==='confirmReport'){confirmCalls++;if(failFirstSave){failFirstSave=false;return {result:{success:false,error:'识别凭证未通过校验，请重试'}}}}return {result:await call(data)}}}}
  const componentPath=path.join(root,'miniprogram/components/referee-report-import/index.js')
  vm.runInNewContext(fs.readFileSync(componentPath,'utf8'),{Component:value=>{definition=value},wx,require:Module.createRequire(componentPath),console})
  const component={...definition.methods,properties:{tournamentId:'event',match:{id:'match',homeName:'主队',awayName:'客队',recordRevision:require('../cloudfunctions/getMiniWorkspace/sharedRecording.cjs').revision(rows('matches').get('match'))},players,canLineup:true,canResult:true},data:clone(definition.data),setData(patch){Object.assign(this.data,patch)},triggerEvent(name){if(name==='saved')savedEvents++}}
  component.uploadReport()
  for(let i=0;i<20&&component.data.busy;i++)await new Promise(setImmediate)
  assert.equal(component.data.hasDraft,true,component.data.errorText)
  assert.equal(component.data.blankRoleAsBench,true)
  assert.equal(uploads,1)
  const checkedBefore=JSON.stringify(component.teams)
  component.confirm();component.confirm()
  for(let i=0;i<20&&component.data.busy;i++)await new Promise(setImmediate)
  assert.equal(confirmCalls,1)
  assert.equal(component.data.saveRetry,true);assert.equal(component.data.open,true);assert.equal(component.data.hasDraft,true);assert.equal(JSON.stringify(component.teams),checkedBefore);assert.equal(rows('matches').get('match').status,'scheduled')
  component.retrySave();component.retrySave()
  for(let i=0;i<20&&component.data.busy;i++)await new Promise(setImmediate)
  assert.equal(confirmCalls,2);assert.equal(component.data.saveRetry,false);assert.equal(uploads,1)
  assert.equal(savedEvents,1)
  assert.equal(rows('matches').get('match').status,'finished')
  const lineupOnly=draft.prepare({...recognition,teams:{...recognition.teams,home:[{...recognition.teams.home[0],goals:'?',reviewNotes:['进球分钟不清楚']}] }},players)
  assert.deepEqual(draft.payload(lineupOnly,{home:'',away:''},true).starters.home,['p-home'])
  assert.throws(()=>draft.payload(lineupOnly,{home:'',away:''},false),/分钟/)
  for(const file of ['miniprogram/pages/tournament/shared/manage.wxml','miniprogram/components/referee-report-import/index.wxml'])for(const match of fs.readFileSync(path.join(root,file),'utf8').matchAll(/\{\{([\s\S]*?)\}\}/g))assert.doesNotMatch(match[1],/===|!==|==|!=|\?|\[|\]|\(|\)|&&|[<>]/)
  console.log('PASS: 合并说明栏语义定位、圈号与箭头旁注、非表格文字候选、稳定球员匹配/候选确认、PC同源识别确认、读取不改比赛、完整赛果入库、幂等、过期版本/撤权/锁定/跨场与事务撤权、服务端会话清理、WXML限制；仅内存隔离数据')
}
run().catch(error=>{console.error(error);process.exitCode=1})
