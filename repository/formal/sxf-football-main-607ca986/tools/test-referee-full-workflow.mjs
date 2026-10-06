import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'
import crypto from 'node:crypto'

const require = createRequire(import.meta.url)
let activeOpenId = 'open-main'
process.env.SXF_MATCH_PASS_SECRET = 'isolated-test-match-pass-secret'
let sequence = 1
const store = new Map()
const clone = value => value == null ? value : structuredClone(value)
const rows = name => { if (!store.has(name)) store.set(name, new Map()); return store.get(name) }

const command = {
  or: conditions => ({ __op:'or', conditions }),
  in: values => ({ __op:'in', values }),
  gt: value => ({ __op:'gt', value }),
  gte: value => ({ __op:'gte', value }),
  lt: value => ({ __op:'lt', value }),
  lte: value => ({ __op:'lte', value })
}
function time(value) { return value instanceof Date ? value.getTime() : new Date(value).getTime() }
function fieldMatch(actual, expected) {
  if (expected && expected.__op === 'in') return expected.values.map(String).includes(String(actual))
  if (expected && expected.__op === 'gt') return time(actual) > time(expected.value)
  if (expected && expected.__op === 'gte') return time(actual) >= time(expected.value)
  if (expected && expected.__op === 'lt') return time(actual) < time(expected.value)
  if (expected && expected.__op === 'lte') return time(actual) <= time(expected.value)
  return String(actual) === String(expected)
}
function matches(row, where) {
  if (!where) return true
  if (where.__op === 'or') return where.conditions.some(condition => matches(row, condition))
  return Object.entries(where).every(([key, expected]) => fieldMatch(row[key], expected))
}
function collection(name) {
  const source = rows(name)
  const query = where => ({
    limit: count => ({ get: async () => ({ data:[...source.values()].filter(row => matches(row, where)).slice(0,count).map(clone) }) }),
    get: async () => ({ data:[...source.values()].filter(row => matches(row, where)).map(clone) })
  })
  return {
    where: query,
    limit: count => ({ get:async () => ({ data:[...source.values()].slice(0,count).map(clone) }) }),
    get: async () => ({ data:[...source.values()].map(clone) }),
    add: async ({ data }) => { const id = `${name}-${sequence++}`; source.set(id, { _id:id, ...clone(data) }); return { _id:id } },
    doc: id => ({
      get: async () => ({ data:source.has(String(id)) ? clone(source.get(String(id))) : null }),
      set: async ({ data }) => { source.set(String(id), { _id:String(id), ...clone(data) }); return { stats:{ created:1 } } },
      update: async ({ data }) => { const current=source.get(String(id)); if (!current) throw new Error(`missing ${name}/${id}`); source.set(String(id), { ...current, ...clone(data) }); return { stats:{ updated:1 } } },
      remove: async () => { source.delete(String(id)); return { stats:{ removed:1 } } }
    })
  }
}

let updateMatchModule = null
const cloudStub = {
  DYNAMIC_CURRENT_ENV:'test',
  init() {},
  getWXContext:() => ({ OPENID:activeOpenId }),
  database:() => ({ collection, command, serverDate:() => new Date(), createCollection:async name => { rows(name); return {} },runTransaction:async callback => callback({collection}) }),
  callFunction:async ({name,data}) => {
    if(name==='updateMatch'&&updateMatchModule)return {result:await updateMatchModule.main(data)}
    throw new Error(`unsupported cloud function ${name}`)
  }
}
const originalLoad = Module._load
Module._load = function(request, parent, isMain) { if (request === 'wx-server-sdk') return cloudStub; return originalLoad.call(this, request, parent, isMain) }
const workflow = require('../cloudfunctions/serviceMatchWorkflow/index.js')
updateMatchModule = require('../cloudfunctions/updateMatch/index.js')
Module._load = originalLoad

function seed(name, id, data) { rows(name).set(id, { _id:id, ...clone(data) }) }
const officials = [
  ['main','open-main','13800000001','mainReferee',false],
  ['a1','open-a1','13800000002','assistant1',false],
  ['a2','open-a2','13800000003','assistant2',false],
  ['fourth','open-fourth','13800000004','fourthOfficial',true]
]
for (const [id, openId, phone, role, canOperate] of officials) {
  seed('service_identities', `identity-${id}`, { openId, phone, phoneVerified:true })
  seed('referees', `ref-${id}`, { phone, status:'approved', name:id })
  seed('match_referees', `assignment-${id}`, { matchId:'match-1', refereeId:`ref-${id}`, role, roleLabel:role, canOperate, isRecordKeeper:canOperate })
}
seed('teams','team-home',{name:'主队'}); seed('teams','team-away',{name:'客队'})
seed('tournaments','t-1',{name:'测试赛事'}); seed('divisions','d-1',{name:'U12组',participantType:'youth',rulesLocked:true,rulesVersion:'fixture-v1',rulesSnapshot:{periodMode:'halves',matchMinutes:30},substitutionMode:'free',substitutionReentryAllowed:true})
const player = (id,name,number) => ({ _id:id, id, playerId:id, name, jerseyNumber:number, photoUrl:`/${id}.png`, identityStatus:'verified', identityVerificationLabel:'人证核验通过' })
seed('matches','match-1',{
  tournamentId:'t-1',divisionId:'d-1',status:'scheduled',homeTeamId:'team-home',awayTeamId:'team-away',homeTeamName:'主队',awayTeamName:'客队',
  refereeCrew:{mainReferee:'ref-main',assistant1:'ref-a1',assistant2:'ref-a2',fourthOfficial:'ref-fourth'},
  preMatchState:{teamArrivals:{home:{confirmedAt:new Date()},away:{confirmedAt:new Date()}},checklist:{}},
  homeLineup:{teamId:'team-home',status:'submitted',submitted:true,version:1,starters:[player('home-1','主队首发',1)],substitutes:[player('home-sub','主队替补',12)],confirmations:{},identityChecks:{}},homeLineupStatus:'submitted',
  awayLineup:{teamId:'team-away',status:'submitted',submitted:true,version:1,starters:[player('away-1','客队首发',1)],substitutes:[player('away-sub','客队替补',12)],confirmations:{},identityChecks:{}},awayLineupStatus:'submitted',
  homeScore:0,awayScore:0,events:[],lineupsLocked:false,refereeReportStatus:'not_submitted'
})

async function call(openId, action, data={}) {
  activeOpenId=openId
  const result=await workflow.main({ action, ...data })
  assert.equal(result.success, true, `${action} failed: ${result.message || result.code}`)
  return result
}

await call('open-main','updatePreMatchState',{matchId:'match-1',operation:'confirm_referee_arrival'})
for (const itemKey of ['match_ball','goal_and_net','field_markings','medical_contact']) await call('open-main','updatePreMatchState',{matchId:'match-1',operation:'toggle_checklist',itemKey})
await call('open-main','updatePreMatchState',{matchId:'match-1',operation:'complete_pre_match'})
for (const side of ['home','away']) await call('open-fourth','confirmLineupStage',{matchId:'match-1',side,stage:'fourth',decision:'approved'})
for (const side of ['home','away']) await call('open-main','confirmLineupStage',{matchId:'match-1',side,stage:'main',decision:'approved'})
await call('open-a1','verifyLineupPlayer',{matchId:'match-1',side:'home',playerId:'home-1',decision:'passed',method:'visual'})
await call('open-a2','verifyLineupPlayer',{matchId:'match-1',side:'away',playerId:'away-1',decision:'passed',method:'visual'})
assert.equal(rows('matches').get('match-1').lineupsLocked,true)
await call('open-main','startRefereeMatch',{matchId:'match-1'})
assert.equal(rows('matches').get('match-1').durationRulesSnapshot?.totalMinutes,60)
rows('divisions').get('d-1').rulesSnapshot.matchMinutes=36
await call('open-main','startRefereeMatch',{matchId:'match-1'})
assert.equal(rows('matches').get('match-1').durationRulesSnapshot.totalMinutes,60)
await call('open-fourth','verifySubstituteIdentity',{matchId:'match-1',side:'home',playerId:'home-sub',decision:'passed',method:'visual'})
await call('open-fourth','addRefereeEvent',{matchId:'match-1',type:'substitution',minute:15,teamSide:'home',playerName:'主队替补',assistName:'主队首发'})
await call('open-fourth','addRefereeEvent',{matchId:'match-1',type:'goal',minute:20,teamSide:'home',playerName:'主队替补'})
await call('open-main','finishRefereeMatch',{matchId:'match-1',homeScore:1,awayScore:0})
const sections={sportsmanship:{status:'normal'},discipline:{status:'normal'},injury:{status:'normal'},venue:{status:'normal'},interruption:{status:'normal'},other:{status:'normal'}}
await call('open-main','saveRefereeReportDraft',{matchId:'match-1',conclusion:'normal',sections})
await call('open-main','submitSignedRefereeRecord',{matchId:'match-1',signature:{strokes:[[{x:1,y:1},{x:2,y:2},{x:3,y:2},{x:4,y:3},{x:5,y:4},{x:6,y:5},{x:7,y:6},{x:8,y:6},{x:9,y:7}]]}})
const finalMatch=rows('matches').get('match-1')
assert.equal(finalMatch.status,'completed')
assert.equal(finalMatch.refereeRecordLocked,true)
assert.equal(finalMatch.events.length,2)
assert.equal(finalMatch.refereeSignature.pointCount >= 8,true)

for (const [id, openId, phone, role, canOperate] of officials) seed('match_referees', `assignment-2-${id}`, { matchId:'match-2', refereeId:`ref-${id}`, role, roleLabel:role, canOperate, isRecordKeeper:canOperate })
seed('matches','match-2',{
  tournamentId:'t-1',divisionId:'d-1',status:'checked_in',homeTeamId:'team-home',awayTeamId:'team-away',homeTeamName:'主队',awayTeamName:'客队',
  refereeCrew:{mainReferee:'ref-main',assistant1:'ref-a1',assistant2:'ref-a2',fourthOfficial:'ref-fourth'},
  preMatchState:{refereeArrival:{confirmedAt:new Date()},teamArrivals:{home:{confirmedAt:new Date()},away:{confirmedAt:new Date()}},checklist:{match_ball:{checked:true},goal_and_net:{checked:true},field_markings:{checked:true},medical_contact:{checked:true}},completedAt:new Date()},
  homeLineup:{teamId:'team-home',status:'submitted',submitted:true,version:1,starters:[player('home-bad','异常首发',8)],substitutes:[player('home-good','替补接替',18)],confirmations:{},identityChecks:{}},homeLineupStatus:'submitted',
  awayLineup:{teamId:'team-away',status:'submitted',submitted:true,version:1,starters:[player('away-ok','客队首发二',9)],substitutes:[],confirmations:{},identityChecks:{}},awayLineupStatus:'submitted',lineupsLocked:false
})
for (const side of ['home','away']) await call('open-fourth','confirmLineupStage',{matchId:'match-2',side,stage:'fourth',decision:'approved'})
for (const side of ['home','away']) await call('open-main','confirmLineupStage',{matchId:'match-2',side,stage:'main',decision:'approved'})
await call('open-a1','verifyLineupPlayer',{matchId:'match-2',side:'home',playerId:'home-bad',decision:'exception',method:'visual',reason:'照片与本人不符'})
await call('open-fourth','replaceFailedStarter',{matchId:'match-2',side:'home',failedPlayerId:'home-bad',substitutePlayerId:'home-good'})
assert.equal(rows('matches').get('match-2').homeLineup.preMatchRevisionHistory[0].noSubstitutionQuota,true)
await call('open-main','confirmLineupStage',{matchId:'match-2',side:'home',stage:'main',decision:'approved'})
await call('open-a1','verifyLineupPlayer',{matchId:'match-2',side:'home',playerId:'home-good',decision:'passed',method:'visual'})
await call('open-a2','verifyLineupPlayer',{matchId:'match-2',side:'away',playerId:'away-ok',decision:'passed',method:'visual'})
assert.equal(rows('matches').get('match-2').lineupsLocked,true)

for (const [id, openId, phone, role, canOperate] of officials) seed('match_referees', `assignment-3-${id}`, { matchId:'match-3', refereeId:`ref-${id}`, role, roleLabel:role, canOperate, isRecordKeeper:canOperate })
seed('divisions','d-adult',{name:'成人公开组',participantType:'adult'})
const adult=player('adult-1','成人球员',10)
seed('matches','match-3',{tournamentId:'t-1',divisionId:'d-adult',status:'checked_in',homeTeamId:'team-home',awayTeamId:'team-away',homeTeamName:'主队',awayTeamName:'客队',homeLineup:{status:'identity_check',submitted:true,version:1,starters:[adult],substitutes:[],confirmations:{fourthOfficial:{status:'approved'},mainReferee:{status:'approved'}},identityChecks:{}},homeLineupStatus:'identity_check',awayLineup:{status:'locked',submitted:true,version:1,starters:[player('adult-away','客队成人',11)],substitutes:[],confirmations:{fourthOfficial:{status:'approved'},mainReferee:{status:'approved'}},identityChecks:{'adult-away':{status:'passed'}}},awayLineupStatus:'locked'})
const adultPassId='adultpass1'
seed('adult_match_passes',adultPassId,{matchId:'match-3',playerId:'adult-1',teamId:'team-home',side:'home',status:'active',expiresAt:new Date(Date.now()+3600000)})
const signature=crypto.createHmac('sha256',process.env.SXF_MATCH_PASS_SECRET).update('football:adult-match-pass:'+adultPassId).digest('base64url').slice(0,32)
const token=`SXFMP1.${adultPassId}.${signature}`
await call('open-a1','previewAdultMatchPass',{matchId:'match-3',passToken:token})
await call('open-a1','verifyLineupPlayer',{matchId:'match-3',side:'home',playerId:'adult-1',decision:'passed',method:'adult_qr',passToken:token})
activeOpenId='open-a1'
const tampered=await workflow.main({action:'previewAdultMatchPass',matchId:'match-3',passToken:`SXFMP1.${adultPassId}.${'x'.repeat(32)}`})
assert.equal(tampered.success,false)

seed('service_identities','identity-temp',{openId:'service:official-temp',serviceWorkflowOpenId:'service:official-temp',serviceAccountOpenId:'official-temp',phone:'13800000009',phoneVerified:true})
seed('referees','ref-temp',{tournamentId:'t-1',orgId:'org-1',name:'临时裁判',realName:'临时裁判',phone:'13800000009',temporaryReferee:true,eventScoped:true,status:'pending_claim',temporaryClaimStatus:'waiting_claim',canOperate:false})
seed('referee_invitations','invite-temp',{token:'temp-token',status:'active',tournamentId:'t-1',targetRefereeId:'ref-temp',targetRefereeName:'临时裁判',targetRefereePhone:'13800000009',claimMode:'temporary_no_certificate',followRequired:true,followStatus:'subscribed',officialOpenId:'official-temp',stagedAvatarFileId:'cloud://avatar-temp'})
await call('service:official-temp','acceptRefereeInvitation',{inviteToken:'temp-token',name:'临时裁判',phone:'13800000009',avatarPreviewDataUrl:'data:image/png;base64,'+Buffer.from('avatar').toString('base64')})
assert.equal(rows('referees').get('ref-temp').temporaryClaimStatus,'claimed_pending_review')
assert.equal(rows('referees').get('ref-temp').credentialStatus,'not_submitted')
assert.equal(rows('referees').get('ref-temp').canOperate,false)

seed('referee_invitations','invite-standard',{token:'standard-token',status:'active',tournamentId:'t-1',followRequired:false,stagedAvatarFileId:'cloud://avatar-standard'})
activeOpenId='open-main'
const missingCertificate=await workflow.main({action:'acceptRefereeInvitation',inviteToken:'standard-token',name:'main',phone:'13800000001',level:'一级',qualification:'CERT-1',issuingAuthority:'测试足协',avatarPreviewDataUrl:'data:image/png;base64,'+Buffer.from('avatar').toString('base64')})
assert.equal(missingCertificate.success,false)
assert.equal(missingCertificate.code,'REFEREE_ASSET_NOT_READY')

rows('tournaments').get('t-1').orgId='org-1'
for(const [id] of officials){rows('referees').get(`ref-${id}`).orgId='org-1';rows('referees').get(`ref-${id}`).canOperate=true}
seed('tournament_referees','head-relation',{tournamentId:'t-1',orgId:'org-1',refereeId:'ref-main',isHeadReferee:true})
const headSchedule=await call('open-main','getHeadRefereeSchedule',{tournamentId:'t-1'})
assert.equal(headSchedule.data.tournaments[0].id,'t-1')
assert.equal(headSchedule.data.referees.some(item=>item.id==='ref-temp'),false)
const headSessionToken='head-referee-session'
seed('referee_h5_sessions','head-session',{tokenHash:crypto.createHash('sha256').update(headSessionToken).digest('hex'),workflowOpenId:'open-main',active:true,expiresAt:new Date(Date.now()+3600000)})
const assignedByHead=await workflow.main({action:'assignHeadRefereeCrew',__refereeSessionToken:headSessionToken,matchId:'match-2',refereeCrew:{mainReferee:'ref-main',assistant1:'ref-a1',assistant2:'ref-a2',fourthOfficial:'ref-fourth'}})
assert.equal(assignedByHead.success,true,assignedByHead.message)
assert.equal(rows('matches').get('match-2').updatedByHeadReferee,true)
assert.equal(rows('registration_audit_logs').get([...rows('registration_audit_logs').keys()].pop()).action,'head_referee_assignment_saved')
console.log('PASS referee full workflow: check-in -> lineup -> fourth -> main -> assistants -> replacement -> start -> events -> substitute -> report -> mobile signature')
