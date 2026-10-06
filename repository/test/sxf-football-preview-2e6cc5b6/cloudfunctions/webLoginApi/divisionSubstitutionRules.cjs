'use strict'
const number = value => value !== '' && value != null && Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null

function buildSubstitutionRuleUpdate(before, input, actor, now = new Date()) {
  if (!['limited','free'].includes(input.substitutionMode)) throw Object.assign(new Error('请选择限定或无限换人'),{code:'SUB_RULE_MODE_INVALID'})
  const free = input.substitutionMode === 'free'
  const limit = free ? null : number(input.substitutionLimit), windows = free ? null : number(input.substitutionWindows)
  if (!free && (limit == null || windows == null || limit > 100 || windows > 100)) throw Object.assign(new Error('请填写0至100的换人人数和窗口数'),{code:'SUB_RULE_LIMIT_INVALID'})
  const reentry = input.substitutionReentryAllowed === true
  const changes = { substitutionMode:input.substitutionMode, substitutionLimit:limit, substitutionWindows:windows, substitutionReentryAllowed:reentry }
  const active=before.activeRulesSnapshot || before.rulesSnapshot || {}
  const details = { ...(active.regulationDetails || before.regulationDetails || {}), substitutionReentryForbidden:!reentry }
  if(free)Object.assign(details,{firstHalfSubstitutionWindows:null,secondHalfSubstitutionWindows:null,halftimeSubstitutionWindows:null,unlimitedPlayersPerWindow:true})
  else { Object.assign(details,{firstHalfSubstitutionWindows:null,secondHalfSubstitutionWindows:null,halftimeSubstitutionWindows:null}) }
  changes.regulationDetails={...(before.regulationDetails || details),firstHalfSubstitutionWindows:null,secondHalfSubstitutionWindows:null,halftimeSubstitutionWindows:null,substitutionReentryForbidden:!reentry,...(free?{unlimitedPlayersPerWindow:true}:{})}
  const oldVersion=String(before.activeRulesVersion || before.rulesVersion || 'V1.0'),version=oldVersion+'-SUB-'+now.getTime()
  const snapshot={...active,...changes,regulationDetails:details}
  const history=[...(before.rulesHistory || []),{version:oldVersion,snapshot:active,finalizedAt:before.finalizedAt || null,finalizedBy:before.finalizedBy || '',finalizedByName:before.finalizedByName || '',revisionReason:'调整换人规则',revisedAt:now,revisedBy:String(actor.id || ''),revisedByType:actor.type || 'organizer'}]
  return {...changes,rulesVersion:version,rulesSnapshot:snapshot,activeRulesVersion:version,activeRulesSnapshot:snapshot,rulesHistory:history,
    ...(before.rulesRevisionPending?{rulesRevisionOf:version,rulesVersionDraft:version+'-R'+history.length}:{}),
    substitutionRulesUpdatedAt:now,substitutionRulesUpdatedBy:String(actor.id || ''),substitutionRulesUpdateReason:'调整换人规则',updateTime:now}
}

function createDivisionSubstitutionRules({cloud,authenticateWebSession,buildOrganizerScope,organizerRecordAllowed}) {
  return async event => {
    try {
      const auth=await authenticateWebSession(event)
      if(!auth.success)return auth
      if(event.assistanceGrantId)return {success:false,code:'ASSISTANCE_OPERATION_DENIED',error:'协助模式不能修改竞赛规则'}
      const id=String(event.divisionId || '').trim()
      if(!id || id.length>100)throw new Error('请选择竞赛组别')
      const db=cloud.database(),owner=auth.principalType==='platform_owner'&&auth.user?.isPlatformOwner===true
      const scope=owner?null:await buildOrganizerScope(db,auth.user)
      if(!owner&&(!scope?.orgId || scope.organizationConflict))return {success:false,code:'DIVISION_SCOPE_DENIED',error:'当前账号没有组别管理权限'}
      let result
      await db.runTransaction(async transaction=>{
        const response=await transaction.collection('divisions').doc(id).get(),before=Array.isArray(response.data)?response.data[0]:response.data
        if(!before || !owner&&!organizerRecordAllowed('divisions',before,scope))throw Object.assign(new Error('无权修改该组别规则'),{code:'DIVISION_SCOPE_DENIED'})
        if(String(event.expectedRulesVersion || '')!==String(before.rulesVersion || 'V1.0'))throw Object.assign(new Error('规则已更新，请刷新后重新修改'),{code:'DIVISION_RULE_VERSION_CHANGED'})
        if(before.rulesLocked!==true&&!before.activeRulesVersion)throw Object.assign(new Error('请在规则草稿中修改换人设置'),{code:'DIVISION_RULE_NOT_FINALIZED'})
        if(before.substitutionMode===event.substitutionMode && before.substitutionReentryAllowed===(event.substitutionReentryAllowed===true) && before.substitutionLimit===(event.substitutionMode==='free'?null:Number(event.substitutionLimit)) && before.substitutionWindows===(event.substitutionMode==='free'?null:Number(event.substitutionWindows)) && before.regulationDetails?.substitutionReentryForbidden===!(event.substitutionReentryAllowed===true) && (event.substitutionMode!=='free' || before.regulationDetails?.unlimitedPlayersPerWindow===true)) {
          result={...before,alreadyCurrent:true};return
        }
        const update=buildSubstitutionRuleUpdate(before,event,{id:auth.userId || auth.user?._id || '',type:owner?'platform_owner':'organizer'})
        await transaction.collection('divisions').doc(id).update({data:update})
        result={...before,...update}
      })
      return {success:true,data:result,rulesVersion:result.rulesVersion,message:'换人规则已更新'}
    }catch(error){return {success:false,code:error.code || 'DIVISION_RULE_UPDATE_FAILED',error:error.message || '规则修改失败，请重试'}}
  }
}
module.exports={createDivisionSubstitutionRules,buildSubstitutionRuleUpdate}
