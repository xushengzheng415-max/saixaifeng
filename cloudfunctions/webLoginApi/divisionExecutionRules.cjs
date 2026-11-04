'use strict'
const benchFields={benchTotalLimit:30,benchPlayerLimit:30,benchOfficialLimit:20}
const metadata=new Set(['action','authToken','dynamicCardProtocol','assistanceGrantId','staffTournamentId','staffModule','divisionId','expectedRulesVersion'])
const editable=new Set(['substitutionMode','substitutionLimit','substitutionWindows','substitutionReentryAllowed','regulationDetails'])
const integer=value=>value!=null&&['number','string'].includes(typeof value)&&String(value).trim()!==''&&Number.isInteger(Number(value))&&Number(value)>=0?Number(value):null
function fail(code,message){throw Object.assign(new Error(message),{code})}
function buildDivisionExecutionUpdate(before,input,actor,now=new Date()){
  if(Object.keys(input).some(key=>!metadata.has(key)&&!editable.has(key)))fail('EXEC_RULE_FIELDS_LOCKED','包含已锁定的比赛规则，请刷新后重试')
  if(!['limited','free'].includes(input.substitutionMode))fail('SUB_RULE_MODE_INVALID','请选择限定或无限换人')
  const free=input.substitutionMode==='free',limit=free?null:integer(input.substitutionLimit),windows=free?null:integer(input.substitutionWindows)
  if(!free&&(limit==null||windows==null||limit>100||windows>100))fail('SUB_RULE_LIMIT_INVALID','请填写0至100的换人人数和窗口数')
  const bench={}
  if(input.regulationDetails!==undefined){
    if(!input.regulationDetails||typeof input.regulationDetails!=='object'||Array.isArray(input.regulationDetails))fail('BENCH_RULE_INVALID','替补席设置格式不正确')
    for(const [field,value] of Object.entries(input.regulationDetails)){
      if(!Object.hasOwn(benchFields,field))fail('EXEC_RULE_FIELDS_LOCKED','仅可调整换人和替补席人数')
      if(value==null||typeof value==='string'&&!value.trim()){bench[field]=null;continue}
      const count=integer(value)
      if(count==null||count>benchFields[field])fail('BENCH_RULE_INVALID','替补席人数超出允许范围')
      bench[field]=count
    }
  }
  const reentry=input.substitutionReentryAllowed===true,stored=before.activeRulesSnapshot||before.rulesSnapshot||{}
  const active={...stored,regulationDetails:{...(before.regulationDetails||{}),...(stored.regulationDetails||{})}}
  const detailChanges={firstHalfSubstitutionWindows:null,secondHalfSubstitutionWindows:null,halftimeSubstitutionWindows:null,substitutionReentryForbidden:!reentry,unlimitedPlayersPerWindow:free,...bench}
  const details={...(active.regulationDetails||before.regulationDetails||{}),...detailChanges}
  const changes={substitutionMode:input.substitutionMode,substitutionLimit:limit,substitutionWindows:windows,substitutionReentryAllowed:reentry,regulationDetails:{...(before.regulationDetails||active.regulationDetails||{}),...detailChanges}}
  const version=String(before.activeRulesVersion||before.rulesVersion||'V1.0')+'-EXEC-'+now.getTime()
  const snapshot={...active,...changes,regulationDetails:details}
  const history=[...(before.rulesHistory||[]),{version:String(before.activeRulesVersion||before.rulesVersion||'V1.0'),snapshot:active,finalizedAt:before.finalizedAt||null,finalizedBy:before.finalizedBy||'',finalizedByName:before.finalizedByName||'',revisionReason:'调整比赛规则',revisedAt:now,revisedBy:String(actor.id||''),revisedByType:actor.type||'organizer'}]
  return {...changes,rulesVersion:version,rulesSnapshot:snapshot,activeRulesVersion:version,activeRulesSnapshot:snapshot,rulesHistory:history,
    ...(before.rulesRevisionPending?{rulesRevisionOf:version,rulesVersionDraft:version+'-R'+history.length}:{}),
    substitutionRulesUpdatedAt:now,substitutionRulesUpdatedBy:String(actor.id||''),substitutionRulesUpdateReason:'调整比赛规则',updateTime:now}
}
function createDivisionExecutionRules({cloud,authenticateWebSession,buildOrganizerScope,organizerRecordAllowed,staffPolicy=require('./staffPolicy.cjs')}){
  return async event=>{
    try{
      const auth=await authenticateWebSession(event);if(!auth.success)return auth
      if(event.assistanceGrantId)return {success:false,code:'ASSISTANCE_OPERATION_DENIED',error:'协助模式不能修改竞赛规则'}
      const id=String(event.divisionId||'').trim();if(!id||id.length>100)fail('DIVISION_REQUIRED','请选择竞赛组别')
      const db=cloud.database(),owner=auth.principalType==='platform_owner'&&auth.user?.isPlatformOwner===true
      const scope=owner?null:await buildOrganizerScope(db,{...auth.user,orgId:auth.orgId||auth.user?.orgId})
      if(!owner&&(!scope?.orgId||scope.organizationConflict))fail('DIVISION_SCOPE_DENIED','当前账号没有组别管理权限')
      let result
      await db.runTransaction(async transaction=>{
        const response=await transaction.collection('divisions').doc(id).get(),before=Array.isArray(response.data)?response.data[0]:response.data
        if(!before||!owner&&!organizerRecordAllowed('divisions',before,scope))fail('DIVISION_SCOPE_DENIED','无权修改该组别规则')
        if(!owner&&await staffPolicy.isStaff(db,auth.userId,scope.orgId)&&!await staffPolicy.owner(db,auth.userId,scope.orgId)){
          if(String(event.staffTournamentId||'')!==String(before.tournamentId)||!await staffPolicy.hasRight(db,auth.userId,scope.orgId,before.tournamentId,'event.competition'))fail('DIVISION_SCOPE_DENIED','当前赛事没有竞赛规则修改权限')
        }
        if(String(event.expectedRulesVersion||'')!==String(before.rulesVersion||'V1.0'))fail('DIVISION_RULE_VERSION_CHANGED','规则已更新，请刷新后重新修改')
        if(before.rulesLocked!==true&&!before.activeRulesVersion)fail('DIVISION_RULE_NOT_FINALIZED','请在规则草稿中修改比赛设置')
        const update=buildDivisionExecutionUpdate(before,event,{id:auth.userId||auth.user?._id,type:owner?'platform_owner':'organizer'})
        const detailKeys=['firstHalfSubstitutionWindows','secondHalfSubstitutionWindows','halftimeSubstitutionWindows','substitutionReentryForbidden','unlimitedPlayersPerWindow',...Object.keys(benchFields)]
        const ruleKeys=['substitutionMode','substitutionLimit','substitutionWindows','substitutionReentryAllowed']
        const prior=before.activeRulesSnapshot||before.rulesSnapshot||{},priorDetails=prior.regulationDetails||{}
        const same=ruleKeys.every(key=>before[key]===update[key]&&(!Object.hasOwn(prior,key)||prior[key]===update[key]))
          &&detailKeys.every(key=>(before.regulationDetails?.[key]??null)===(update.regulationDetails[key]??null)
            &&(Object.hasOwn(priorDetails,key)?priorDetails[key]:before.regulationDetails?.[key]??null)===(update.activeRulesSnapshot.regulationDetails[key]??null))
        if(same){result={...before,alreadyCurrent:true};return}
        await transaction.collection('divisions').doc(id).update({data:update});result={...before,...update}
      })
      return {success:true,data:result,rulesVersion:result.rulesVersion,message:'比赛规则已更新'}
    }catch(error){return {success:false,code:error.code||'DIVISION_RULE_UPDATE_FAILED',error:error.message||'规则修改失败，请重试'}}
  }
}
module.exports={createDivisionExecutionRules,buildDivisionExecutionUpdate,createDivisionSubstitutionRules:createDivisionExecutionRules,buildSubstitutionRuleUpdate:buildDivisionExecutionUpdate}
