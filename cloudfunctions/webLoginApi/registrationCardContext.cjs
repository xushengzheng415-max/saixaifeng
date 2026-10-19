'use strict'
const suite=require('./playerCardSuite.cjs')
const preload=require('./playerCardPreload.cjs')
const text=v=>String(v==null?'':v).trim()
const fail=(code,message)=>{throw Object.assign(new Error(message),{code})}
const validRegistration=r=>['approved','confirmed','active','locked','accepted'].includes(text(r.status))
async function contexts(db,gate){
  const rows=await preload.readAll(db,'tournament_teams',{teamId:text(gate.teamId)})
  const ids=[...new Set(rows.filter(validRegistration).map(r=>text(r.tournamentId)).filter(Boolean))]
  const explicit=text(gate.tournamentId)
  if(explicit&&!ids.includes(explicit))fail('PLAYER_CARD_EVENT_INVALID','球队参赛关系已变化，请重新进入')
  const choices=[]
  for(const id of explicit?[explicit]:ids){
    const tournament=await suite.document(db,'tournaments',id)
    if(!tournament||['deleted','cancelled','archived'].includes(text(tournament.status)))continue
    choices.push({tournamentId:id,name:text(tournament.name||tournament.tournamentName)||'未命名赛事',registrationIds:rows.filter(r=>validRegistration(r)&&text(r.tournamentId)===id).map(r=>text(r._id))})
  }
  if(explicit&&!choices.length)fail('PLAYER_CARD_EVENT_INVALID','赛事已失效，请联系球队')
  return choices
}
async function resolve(db,gate,tier,event={}){
  const choices=await contexts(db,gate),explicit=text(gate.tournamentId),requested=text(event.cardTournamentId)
  if(explicit&&requested&&explicit!==requested)fail('PLAYER_CARD_EVENT_INVALID','不能更换本次邀请的赛事')
  const id=explicit||requested||(choices.length===1?choices[0].tournamentId:'')
  if(!id){
    if(choices.length>1)fail('PLAYER_CARD_EVENT_REQUIRED','请选择制卡赛事')
    return {template:await suite.activeTemplate(db,tier),stateId:tier,tournamentId:'',tournamentName:''}
  }
  const choice=choices.find(c=>c.tournamentId===id)
  if(!choice)fail('PLAYER_CARD_EVENT_INVALID','本队没有该赛事的有效参赛关系')
  // Use published immutable snapshots, never mutable template drafts or names.
  const states=await preload.readAll(db,'player_card_template_states',{})
  const candidates=[]
  for(const state of states){
    if(!state.active?.templateId)continue
    const snapshot=await suite.document(db,suite.VERSIONS, suite.versionId(state.active.templateId,state.active.version))
    if(!snapshot||text(snapshot.cardTypeId||snapshot.tier)!==tier)continue
    if(snapshot.preload?.type!=='tournament'||text(snapshot.preload.targetId)!==id)continue
    const scope=preload.normalizePreload(snapshot.preload)
    if(scope.type!=='tournament'||scope.targetId!==id)continue
    if(snapshot.setId){
      const set=await suite.document(db,'player_card_sets',snapshot.setId)
      if(!set||set.status!=='published'||text(set.published?.members?.[tier]?.templateId)!==text(snapshot.templateId)||Number(set.published?.members?.[tier]?.version)!==Number(snapshot.version))continue
    }
    candidates.push({template:snapshot,stateId:text(state._id),tournamentId:id,tournamentName:choice.name,registrationIds:choice.registrationIds})
  }
  if(candidates.length!==1)fail('PLAYER_CARD_TEMPLATE_UNAVAILABLE',candidates.length?'赛事存在多套活动卡，请联系平台确认':'本赛事球员卡尚未发布，请联系主办方')
  return candidates[0]
}
module.exports={contexts,resolve}
