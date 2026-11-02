'use strict'
// 建队后本人入队（2026-10-24）：账号拥有球队管理权不等于其自助登记的球员档案已入队。
// 只有本人明确操作，才把本人（或本人监护，需明确 playerId）的自由球员档案加入自己管理的球队；
// 不自动入队、不按姓名匹配、不迁移已属其他球队的档案，也不改写资料核验或球员卡状态。
const text=value=>(value===undefined||value===null?'':String(value).trim())
const fail=(code,message)=>({success:false,code,message})
const notFound=error=>/DOCUMENT_NOT_EXIST|DATABASE_DOCUMENT_NOT_EXIST|document.*(?:not exist|not found)|文档不存在/i.test(String(error&&error.code||'')+' '+String(error&&error.message||error&&error.errMsg||''))
async function readDoc(client,collection,id){
  try{
    const value=(await client.collection(collection).doc(id).get()).data
    return Array.isArray(value)?value[0]||null:value||null
  }catch(error){if(notFound(error))return null;throw error}
}
const readPlayer=(client,id)=>readDoc(client,'players',id)
module.exports=function createSelfPlayerTeam(deps){
  const{db,findWorkspaceForAction,loadTeams,workspaceError}=deps
  async function run(identity,event){
    const userId=text(identity?.user?._id)
    const teamId=text(event.teamId)
    if(!userId)return fail('SELF_PLAYER_FORBIDDEN','请先完成小程序登录')
    if(!teamId)return fail('TEAM_REQUIRED','请选择要加入的球队')
    const{workspace}=await findWorkspaceForAction(identity.user,identity.openId,event.workspaceId)
    if((workspace.permissions||[]).indexOf('team.manage')<0)return fail('TEAM_MANAGE_REQUIRED','当前身份没有管理球队的权限')
    const team=(await loadTeams(workspace,identity.user,identity.openId)).find(item=>text(item._id)===teamId)
    if(!team)return fail('TEAM_SCOPE_DENIED','球队不存在或不属于当前工作空间')
    const requestedId=text(event.playerId)
    let player=null
    if(requestedId){
      player=await readPlayer(db,requestedId)
      if(!player||player.isDeleted===true)return fail('SELF_PLAYER_FORBIDDEN','球员档案不存在或已归档')
      const mine=text(player.linkedUserId)===userId,guarded=text(player.guardianUserId)===userId
      if(!mine&&!guarded)return fail('SELF_PLAYER_FORBIDDEN','只能加入本人或本人监护的球员档案')
    }else{
      const rows=(await db.collection('players').where({linkedUserId:userId}).limit(2).get()).data||[]
      const live=rows.filter(row=>row.isDeleted!==true)
      if(live.length>1)return fail('SELF_PLAYER_CONFLICT','当前账号关联了多份本人球员档案，请联系平台核对')
      player=live[0]||null
      if(!player)return fail('SELF_PLAYER_REQUIRED','请先在小程序登记本人的球员档案，再把它加入球队')
    }
    const playerId=text(player._id)
    if(text(player.teamId)===teamId)return{success:true,playerId,teamId,status:'joined',alreadyJoined:true,playerName:text(player.name)}
    if(text(player.teamId))return fail('PLAYER_TEAM_CONFLICT','该球员档案已属于其他球队，转入请走原球队流程')
    if(text(player.pendingJoinTeamId)&&text(player.pendingJoinTeamId)!==teamId)return fail('PLAYER_JOIN_STATE_CHANGED','该档案还有未处理的入队申请，请刷新后重试')
    const orgId=text(team.orgId||team.organizationId||player.orgId)
    const historyId='ph_'+playerId+'_selfjoin_'+teamId
    await db.runTransaction(async tx=>{
      const current=await readPlayer(tx,playerId)
      if(!current||current.isDeleted===true)throw workspaceError('SELF_PLAYER_FORBIDDEN','球员档案不存在或已归档')
      if(text(current.teamId)===teamId)return
      if(text(current.teamId))throw workspaceError('PLAYER_TEAM_CONFLICT','该球员档案已属于其他球队，转入请走原球队流程')
      const currentTeam=await readDoc(tx,'teams',teamId)
      if(!currentTeam)throw workspaceError('TEAM_SCOPE_DENIED','球队不存在或不属于当前工作空间')
      const now=db.serverDate()
      await tx.collection('player_team_history').doc(historyId).set({data:{playerId,teamId,orgId,teamName:text(currentTeam.name||currentTeam.teamName),joinedAt:now,leftAt:null,joinSource:'self_created_team',actorUserId:userId,approvedByUserId:userId,createTime:now,updateTime:now}})
      await tx.collection('players').doc(playerId).update({data:{teamId,orgId,currentHistoryId:historyId,registeredAt:now,pendingJoinStatus:text(current.pendingJoinTeamId)===teamId?'approved':'',pendingJoinApprovedAt:text(current.pendingJoinTeamId)===teamId?now:'',pendingJoinApprovedBy:text(current.pendingJoinTeamId)===teamId?userId:'',updateTime:now}})
      await tx.collection('teams').doc(teamId).update({data:{playerRegistrationRevision:Number(currentTeam.playerRegistrationRevision||0)+1,rosterCountStatus:'needs_refresh',updateTime:now}})
    })
    return{success:true,playerId,teamId,status:'joined',playerName:text(player.name)}
  }
  return{run}
}
