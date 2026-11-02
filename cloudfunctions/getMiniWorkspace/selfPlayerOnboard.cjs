'use strict'
const crypto=require('node:crypto')
const clean=value=>String(value==null?'':value).trim()
const fail=(code,message)=>({success:false,code,message})
const positions=new Set(['门将','后卫','中场','前锋'])
const marketingSession=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const READ_PAGE=100
// 数据中心基准：查询超出读取预算必须明确报错，禁止静默截断成前几条。
const READ_CAP_DEFAULT=2000
const scopeTooLarge=()=>Object.assign(new Error('关联球员档案超出读取上限'),{code:'SELF_PLAYER_SCOPE_TOO_LARGE'})
function digest(value){return crypto.createHash('sha256').update(value).digest('hex')}
const live=rows=>rows.filter(row=>row.isDeleted!==true&&row.status!=='deleted')
// 候选列表按标准脱敏：只留首字，长姓名保留末字，便于本人核对而不外泄完整姓名。
function maskName(name){
  const value=clean(name)
  if(value.length<=1)return value?'*':'待补姓名'
  if(value.length===2)return value[0]+'*'
  return value[0]+'*'.repeat(value.length-2)+value[value.length-1]
}
const ownerFields=['linkedUserId','playerUserId','linkedOpenId','playerOpenId','guardianUserId','guardianOpenId']
function ownersOf(row){return ownerFields.map(field=>clean(row[field])).filter(Boolean)}
function boundTo(row,userId){return [clean(row.linkedUserId),clean(row.playerUserId),clean(row.guardianUserId)].filter(Boolean).indexOf(userId)>=0}
function birthYearOf(row){const value=clean(row.birthDate||row.birthday);return /^\d{4}-\d{2}-\d{2}$/.test(value)?value.slice(0,4):''}
async function readAll(db,query,cap=READ_CAP_DEFAULT){
  const rows=[]
  for(;;){
    const page=(await db.collection('players').where(query).skip(rows.length).limit(READ_PAGE).get()).data||[]
    rows.push(...page)
    if(page.length<READ_PAGE)return rows
    if(rows.length>cap)throw scopeTooLarge()
  }
}
async function recordRegistration(db,sessionId){
  if(!marketingSession.test(sessionId))return
  const day=new Date(Date.now()+8*3600000).toISOString().slice(0,10),campaign='valuation-20261024',event='register_success'
  const hash=crypto.createHash('sha256').update(`${campaign}|${day}|${sessionId}|${event}`).digest('hex').slice(0,40)
  await db.collection('marketing_selftest_events').doc(`selftest-${day}-${hash}`).set({data:{schemaVersion:'marketing-selftest/1',campaign,day,event,createdAt:new Date(),sessionHash:crypto.createHash('sha256').update(sessionId).digest('hex').slice(0,32)}})
}
function validBirthday(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false
  const date=new Date(value+'T00:00:00Z')
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value&&date.getTime()<=Date.now()
}
function ageOf(value){const birth=new Date(value+'T00:00:00Z'),today=new Date();let age=today.getUTCFullYear()-birth.getUTCFullYear();if(today.getUTCMonth()<birth.getUTCMonth()||(today.getUTCMonth()===birth.getUTCMonth()&&today.getUTCDate()<birth.getUTCDate()))age--;return age}
// 同一归属人使用稳定文档 ID：不同 requestId 的并发登记落在同一档案上，不再重复建档。
function stablePlayerId(userId,isMinor,name,birthDate){
  return 'free-'+digest(isMinor?`guardian|${userId}|${name}|${birthDate}`:`account|${userId}`).slice(0,32)
}
// 历史档案认领候选：只列出与本机已验证手机号一致、且完全无归属的档案。
// 已绑定其他账号的档案不在此列，也不做任何自动合并时推断。
async function claimableFor(db,userId,phone){
  const rows=live([...(await readAll(db,{playerPhone:phone},1000)),...(await readAll(db,{guardianPhone:phone},1000))])
  const unique=new Map()
  rows.forEach(row=>{const id=clean(row._id);if(id&&!unique.has(id))unique.set(id,row)})
  return [...unique.values()].filter(row=>ownersOf(row).length===0&&!boundTo(row,userId)).map(row=>({
    id:clean(row._id),
    maskedName:maskName(row.name),
    birthYear:birthYearOf(row),
    position:clean(row.position),
    teamId:clean(row.teamId),
    guardianArchive:clean(row.guardianPhone)===phone&&clean(row.playerPhone)!==phone
  }))
}
async function run(db,identity,event){
  const action=clean(event.action),userId=clean(identity?.user?._id),phone=clean(identity?.phone)
  if(!userId||!/^1[3-9]\d{9}$/.test(phone))return fail('PHONE_AUTH_REQUIRED','请先完成小程序手机号登录')
  try{
    if(action==='selfPlayerProfile'){
      const mine=live(await readAll(db,{linkedUserId:userId},10))
      if(mine.length>1)return fail('SELF_PLAYER_CONFLICT','当前账号关联了多份本人球员档案，请联系平台核对')
      const guarded=live(await readAll(db,{guardianUserId:userId},200))
      if(guarded.length>100)return fail('SELF_PLAYER_SCOPE_TOO_LARGE','监护球员过多，请联系平台核对')
      return{success:true,self:mine[0]?{id:clean(mine[0]._id),name:clean(mine[0].name),teamId:clean(mine[0].teamId),profileStatus:clean(mine[0].profileStatus)}:null,guarded:guarded.map(row=>({id:clean(row._id),name:clean(row.name),teamId:clean(row.teamId),profileStatus:clean(row.profileStatus)})),claimable:await claimableFor(db,userId,phone)}
    }
    if(action==='claimSelfPlayer'){
      const playerId=clean(event.playerId),requestId=clean(event.requestId)
      if(!playerId)return fail('SELF_PLAYER_CLAIM_REQUIRED','请选择要认领的球员档案')
      if(!/^[a-zA-Z0-9_-]{12,80}$/.test(requestId))return fail('REQUEST_ID_INVALID','请重新打开登记页')
      const readPlayer=async client=>{const result=await client.collection('players').doc(playerId).get();const data=result&&result.data;return Array.isArray(data)?(data[0]||null):(data||null)}
      const row=await readPlayer(db)
      if(!row||row.isDeleted===true||clean(row.status)==='deleted')return fail('SELF_PLAYER_CLAIM_NOT_FOUND','球员档案不存在或已归档')
      if(boundTo(row,userId))return{success:true,player:{id:playerId,name:clean(row.name),teamId:clean(row.teamId),status:clean(row.profileStatus)||'pending'},reused:true}
      // 已绑定其他账号的档案不做任何自动换绑或合并，转人工核对。
      if(ownersOf(row).length)return fail('SELF_PLAYER_REVIEW_REQUIRED','该档案已关联其他账号，请先联系平台核对')
      const matchesSelf=clean(row.playerPhone)===phone,matchesGuardian=clean(row.guardianPhone)===phone
      if(!matchesSelf&&!matchesGuardian)return fail('SELF_PLAYER_CLAIM_PHONE_MISMATCH','该档案登记的手机号与当前验证手机号不一致，请联系原球队或平台核对')
      const asGuardian=!matchesSelf||ageOf(clean(row.birthDate||row.birthday))<18
      if(asGuardian&&!matchesGuardian)return fail('SELF_PLAYER_CLAIM_PHONE_MISMATCH','该未成年球员档案没有登记当前手机号为监护人，请联系原球队或平台核对')
      if(!asGuardian&&live(await readAll(db,{linkedUserId:userId},10)).length)return fail('SELF_PLAYER_CONFLICT','当前账号已有本人球员档案，请先核对再认领')
      const now=db.serverDate()
      const update={claimSource:'self_onboard_claim',claimRequestId:requestId,claimedAt:now,updateTime:now}
      if(asGuardian)Object.assign(update,{guardianUserId:userId,guardianPhone:phone})
      else Object.assign(update,{linkedUserId:userId,linkedOpenId:clean(identity.openId),playerPhone:phone})
      // 认领只补归属，不改姓名、生日、球队、历史、资料核验与卡片等级。
      await db.runTransaction(async tx=>{
        const current=await readPlayer(tx)
        if(!current||current.isDeleted===true||clean(current.status)==='deleted')throw Object.assign(new Error('球员档案不存在或已归档'),{code:'SELF_PLAYER_CLAIM_NOT_FOUND'})
        if(ownersOf(current).length&&!boundTo(current,userId))throw Object.assign(new Error('该档案已关联其他账号，请先联系平台核对'),{code:'SELF_PLAYER_REVIEW_REQUIRED'})
        await tx.collection('players').doc(playerId).update({data:update})
      })
      try{await recordRegistration(db,clean(event.marketingSessionId))}catch(error){console.warn('[selfPlayerOnboard] campaign metric deferred:',error?.message||'unknown')}
      return{success:true,player:{id:playerId,name:clean(row.name),teamId:clean(row.teamId),status:clean(row.profileStatus)||'pending'},claimed:true,role:asGuardian?'guardian':'self'}
    }
    if(action!=='registerSelfPlayer')return fail('SELF_PLAYER_ACTION_INVALID','操作无效')
    if(event.agreed!==true)return fail('CONSENT_REQUIRED','请先确认本人或监护人登记')
    const name=clean(event.name),birthDate=clean(event.birthDate),position=clean(event.position)
    const height=Number(event.height),weight=Number(event.weight),age=ageOf(birthDate)
    if(name.length<2||name.length>30||!validBirthday(birthDate)||age<6||age>90||!positions.has(position)||!Number.isFinite(height)||height<100||height>230||!Number.isFinite(weight)||weight<20||weight>200)return fail('SELF_PLAYER_PROFILE_INVALID','请核对姓名、出生日期、位置、身高和体重')
    const isMinor=age<18
    const guardianRelation=clean(event.guardianRelation)
    if(isMinor&&!['父亲','母亲','其他监护人'].includes(guardianRelation))return fail('GUARDIAN_RELATION_REQUIRED','未成年球员请填写监护关系')
    const requestId=clean(event.requestId)
    if(!/^[a-zA-Z0-9_-]{12,80}$/.test(requestId))return fail('REQUEST_ID_INVALID','请重新打开登记页')
    const playerId=stablePlayerId(userId,isMinor,name,birthDate)
    const ownerField=isMinor?'guardianUserId':'linkedUserId'
    const existing=(await readAll(db,{_id:playerId},1))[0]
    if(existing){
      if(!live([existing]).length)return fail('SELF_PLAYER_REVIEW_REQUIRED','该登记档案已归档，请联系平台核对')
      return clean(existing[ownerField])===userId?{success:true,player:{id:playerId,name:clean(existing.name),status:clean(existing.profileStatus)||'pending'},reused:true}:fail('SELF_PLAYER_ID_CONFLICT','登记请求已被占用，请联系平台核对')
    }
    const own=live(await readAll(db,{[ownerField]:userId},10))
    if(own.length>1)return fail('SELF_PLAYER_CONFLICT','当前账号关联了多份本人球员档案，请联系平台核对')
    if(own.length){
      if(!isMinor)return{success:true,player:{id:clean(own[0]._id),name:clean(own[0].name),status:clean(own[0].profileStatus)||'pending'},reused:true}
      if(own.some(row=>clean(row.name)===name&&clean(row.birthDate||row.birthday)===birthDate))return fail('SELF_PLAYER_REVIEW_REQUIRED','可能已有这名孩子的档案，请先核对，避免重复登记')
    }
    const phoneCandidates=live(await readAll(db,isMinor?{guardianPhone:phone}:{playerPhone:phone},1000))
    const samePerson=phoneCandidates.filter(row=>clean(row.name)===name&&clean(row.birthDate||row.birthday)===birthDate)
    if(samePerson.some(row=>clean(row[ownerField])&&clean(row[ownerField])!==userId))return fail('SELF_PLAYER_REVIEW_REQUIRED','该球员档案已关联其他账号，请先核对认领')
    if(samePerson.length)return fail('SELF_PLAYER_REVIEW_REQUIRED','已有同手机号的球员档案，请先在上方核对认领，不要重复登记')
    const now=db.serverDate(),profile={sport:'football',name,birthDate,birthday:birthDate,position,height,weight,teamId:'',teamCode:'',orgId:'',profileStatus:'pending',identityStatus:'not_verified',identityVerificationLabel:'待核验',identityVerificationRequired:false,source:'self_registered_free_agent',isTest:false,creatorId:userId,onboardRequestId:requestId,createTime:now,updateTime:now}
    if(isMinor)Object.assign(profile,{guardianUserId:userId,guardianPhone:phone,guardianRelation})
    else Object.assign(profile,{linkedUserId:userId,linkedOpenId:clean(identity.openId),playerPhone:phone})
    await db.collection('players').doc(playerId).set({data:profile})
    // 统一编号：无籍贯地区时保持待补齐，不把已成功的建档误报为失败。
    await require('./data-center/numbering.cjs').afterWrite(db,'players',playerId)
    try{await recordRegistration(db,clean(event.marketingSessionId))}catch(error){console.warn('[selfPlayerOnboard] campaign metric deferred:',error?.message||'unknown')}
    return{success:true,player:{id:playerId,name,status:'pending'},created:true,minor:isMinor}
  }catch(error){
    if(error&&error.code==='SELF_PLAYER_SCOPE_TOO_LARGE')return fail('SELF_PLAYER_SCOPE_TOO_LARGE','关联球员档案过多，请联系平台核对')
    throw error
  }
}
module.exports={run,ageOf,validBirthday}
