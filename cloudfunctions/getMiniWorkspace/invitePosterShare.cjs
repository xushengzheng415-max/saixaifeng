'use strict'
const crypto=require('crypto')
const text=value=>String(value==null?'':value).trim()
const hash=value=>crypto.createHash('sha256').update(text(value)).digest('hex')
const keyFor=openId=>hash(openId)
const time=value=>value?new Date(value.$date||value._date||value).getTime():0
const currentBinding=row=>!!text(row.officialOpenId)&&!['revoked','replaced','deleted','unbound','disabled'].includes(text(row.status).toLowerCase())
function shouldSuppress(gate,openId,eventType,eventSeconds,now=Date.now()){
  if(gate.purpose!=='player_invite_entry'||eventType!=='scan'||!openId)return false
  const window=(gate.posterShareWindows||{})[keyFor(openId)]
  if(!window||!Number.isFinite(window.openedAt)||!Number.isFinite(window.expiresAt)||window.expiresAt<now)return false
  const at=Number(eventSeconds)*1000
  if(!Number.isFinite(at)||at<=0)return false
  const end=window.endedAt?Math.ceil(window.endedAt/1000)*1000:window.expiresAt
  return at>=Math.floor(window.openedAt/1000)*1000&&at<=end
}
async function manage(deps,event,identity){
  const {db,findWorkspaceForAction,loadTeams,readDataRows}=deps
  const scoped=await findWorkspaceForAction(identity.user,identity.openId,event.workspaceId)
  if(!(scoped.workspace.permissions||[]).includes('team.manage'))throw new Error('当前身份没有分享球队邀请的权限')
  const teamId=text(event.teamId),inviteId=text(event.inviteId)
  if(!teamId||!inviteId)throw new Error('缺少球队或邀请信息')
  const teams=await loadTeams(scoped.workspace,identity.user,identity.openId)
  if(!teams.some(row=>text(row._id)===teamId))throw new Error('球队不属于当前工作空间')
  const invite=(await readDataRows(db,'team_invitations',{_id:inviteId}))[0]
  if(!invite||invite.type!=='team_player'||text(invite.teamId)!==teamId||!['active','pending'].includes(text(invite.status)))throw new Error('球员邀请已失效，请重新生成')
  if(invite.expiresAt&&time(invite.expiresAt)<=Date.now())throw new Error('球员邀请已过期，请重新生成')
  const gates=(await readDataRows(db,'service_follow_gates',{sport:'football',purpose:'player_invite_entry',inviteId})).filter(g=>text(g.teamId)===teamId&&g.status==='active'&&time(g.expiresAt)>Date.now())
  if(gates.length!==1)throw new Error('服务号邀请入口不唯一，请重新生成')
  const gate=gates[0],bindings=await readDataRows(db,'service_account_bindings',{sport:'football',userId:text(identity.user._id)})
  const ids=[...new Set(bindings.filter(currentBinding).map(row=>text(row.officialOpenId)).filter(Boolean))]
  if(ids.length>1)throw new Error('服务号账号关联冲突，请核对绑定')
  if(!ids.length)return {success:true,shareToken:''}
  const associated=(await readDataRows(db,'service_account_bindings',{sport:'football',officialOpenId:ids[0]})).filter(row=>currentBinding(row)&&text(row.userId))
  if(associated.some(row=>text(row.userId)!==text(identity.user._id)))throw new Error('服务号账号关联冲突，请核对绑定')
  const key=keyFor(ids[0]),existing=(gate.posterShareWindows||{})[key],now=Date.now()
  if(event.action==='endInvitePosterShare'){
    if(!existing||hash(event.shareToken)!==existing.tokenHash)return {success:true,stale:true}
    await db.collection('service_follow_gates').doc(text(gate._id)).update({data:{['posterShareWindows.'+key]:{...existing,endedAt:now,expiresAt:Math.min(existing.expiresAt,now+15000)}}})
    return {success:true}
  }
  if(event.action!=='beginInvitePosterShare')throw new Error('不支持的分享操作')
  const shareToken=crypto.randomBytes(24).toString('hex')
  await db.collection('service_follow_gates').doc(text(gate._id)).update({data:{['posterShareWindows.'+key]:{tokenHash:hash(shareToken),openedAt:now,endedAt:0,expiresAt:now+90000}}})
  return {success:true,shareToken}
}
async function refreshSubscription(db,officialOpenId){
  const rows=[]
  for(let offset=0;;offset+=100){
    let query=db.collection('service_account_bindings').where({sport:'football',officialOpenId:text(officialOpenId)})
    if(offset)query=query.skip(offset)
    const result=await query.limit(100).get(),page=Array.isArray(result.data)?result.data:[]
    rows.push(...page)
    if(page.length<100)break
  }
  const linked=rows.filter(row=>currentBinding(row)&&text(row.userId))
  if(new Set(linked.map(row=>text(row.userId))).size>1)throw new Error('服务号关联账号存在冲突')
  const outdated=linked.filter(row=>row.subscribed!==true||row.status==='unsubscribed')
  for(const row of outdated)await db.collection('service_account_bindings').doc(text(row._id)).update({data:{subscribed:true,status:'subscribed',updateTime:db.serverDate()}})
  return outdated.length
}
module.exports={shouldSuppress,manage,keyFor,refreshSubscription}
