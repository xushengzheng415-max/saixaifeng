'use strict'
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const text = value => String(value == null ? '' : value).trim()
const one = result => Array.isArray(result && result.data) ? result.data[0] : result && result.data
const hash = value => crypto.createHash('sha256').update(text(value)).digest('hex')
const time = value => value ? new Date(value.$date || value._date || value).getTime() || 0 : 0
const fail = (code, message) => ({ success:false, code, error:message })
const base = 'https://www.sxffootball.cn/service-account-h5/'
const appId = () => text(process.env.SERVICE_ACCOUNT_APP_ID)
const appSecret = () => text(process.env.SERVICE_ACCOUNT_APP_SECRET)
const sessions = db.collection('service_entry_sessions')

async function document(collection,id) {
  try { return one(await db.collection(collection).doc(id).get()) }
  catch(error) { if (/getfail|not exist|not found/i.test(text(error.message))) return null; throw error }
}
async function getJson(url) {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok || data.errcode) throw new Error('微信授权暂不可用，请重新打开服务号链接')
  return data
}
async function gateByKey(entryKey) {
  if (!/^[A-Za-z0-9_-]{12,80}$/.test(text(entryKey))) throw new Error('登记入口无效，请重新扫码')
  const rows = (await db.collection('service_follow_gates').where({ sport:'football', entryKey:text(entryKey) }).limit(2).get()).data || []
  if (rows.length !== 1 || !['team_claim_entry','player_invite_entry'].includes(text(rows[0].purpose)) || text(rows[0].status) !== 'active' || time(rows[0].expiresAt) <= Date.now()) throw new Error('登记入口已过期，请重新扫码')
  return rows[0]
}
async function scanFor(gate, officialOpenId, proof) {
  const scanId = hash(text(gate._id) + ':' + officialOpenId)
  const scan = await document('service_entry_scans',scanId)
  if (!scan || text(scan.gateId) !== text(gate._id) || scan.subscribed !== true || time(scan.expiresAt) <= Date.now() || text(scan.proofHash) !== hash(proof)) throw new Error('请先扫描邀请二维码并关注服务号，再点击登记链接')
  return scan
}
async function sessionFor(event) {
  const token = text(event.serviceEntrySession)
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error('登记会话已失效，请从服务号重新打开')
  const rows = (await sessions.where({ tokenHash:hash(token), active:true }).limit(2).get()).data || []
  if (rows.length !== 1 || time(rows[0].expiresAt) <= Date.now()) throw new Error('登记会话已失效，请从服务号重新打开')
  const gate = await gateByKey(rows[0].entryKey)
  if (text(gate._id) !== text(rows[0].gateId)) throw new Error('登记入口已变化，请重新扫码')
  const scanId = hash(text(gate._id) + ':' + text(rows[0].officialOpenId))
  const scan = await document('service_entry_scans',scanId)
  if (!scan || scan.subscribed !== true) throw new Error('请先关注服务号，再继续登记')
  return { session:rows[0], gate }
}
async function ensureEntryCollections() {
  for (const name of ['service_entry_oauth_states','service_entry_sessions']) {
    try { await db.createCollection(name) }
    catch(error) { if (!/exist|already|duplicate|已存在/i.test(text(error.message))) throw error }
  }
}
async function oauthUrl(event) {
  const gate = await gateByKey(event.entry)
  const proof = text(event.proof)
  if (!/^[a-f0-9]{48}$/i.test(proof)) return fail('ENTRY_PROOF_REQUIRED','请从服务号回复的链接进入')
  if (!appId() || !appSecret()) return fail('SERVICE_ACCOUNT_NOT_CONFIGURED','服务号网页授权尚未配置')
  await ensureEntryCollections()
  const state = crypto.randomBytes(20).toString('hex')
  const path = gate.purpose === 'team_claim_entry' ? 'claim-team.html' : 'join-player.html'
  const redirectUri = base + path + '?entry=' + encodeURIComponent(gate.entryKey)
  await db.collection('service_entry_oauth_states').doc(state).set({ data:{ gateId:text(gate._id), entryKey:text(gate.entryKey), proofHash:hash(proof), status:'issued', expiresAt:new Date(Date.now()+10*60*1000), createTime:db.serverDate() } })
  return { success:true, authorizeUrl:'https://open.weixin.qq.com/connect/oauth2/authorize?appid=' + encodeURIComponent(appId()) + '&redirect_uri=' + encodeURIComponent(redirectUri) + '&response_type=code&scope=snsapi_base&state=' + encodeURIComponent(state) + '#wechat_redirect' }
}
async function completeOAuth(event) {
  const state = text(event.state), code = text(event.code), proof = text(event.proof)
  if (!/^[a-f0-9]{40}$/i.test(state) || !code || !/^[a-f0-9]{48}$/i.test(proof)) return fail('OAUTH_INVALID','微信授权参数已失效，请从服务号重新打开')
  const record = await document('service_entry_oauth_states',state)
  if (!record || record.status !== 'issued' || time(record.expiresAt) <= Date.now() || text(record.proofHash) !== hash(proof)) return fail('OAUTH_EXPIRED','微信授权已失效，请从服务号重新打开')
  const gate = await gateByKey(record.entryKey)
  if (text(gate._id) !== text(record.gateId)) return fail('ENTRY_CHANGED','登记入口已变化，请重新扫码')
  const oauth = await getJson('https://api.weixin.qq.com/sns/oauth2/access_token?appid=' + encodeURIComponent(appId()) + '&secret=' + encodeURIComponent(appSecret()) + '&code=' + encodeURIComponent(code) + '&grant_type=authorization_code')
  if (!oauth.openid) return fail('OAUTH_FAILED','未能确认当前微信，请重新打开')
  await scanFor(gate, oauth.openid, proof)
  await db.collection('service_entry_oauth_states').doc(state).update({ data:{ status:'used', usedAt:db.serverDate() } })
  const bindings = (await db.collection('service_account_bindings').where({ sport:'football', officialOpenId:text(oauth.openid), subscribed:true }).limit(21).get()).data || []
  const boundUsers = Array.from(new Set(bindings.map(item=>text(item.userId)).filter(Boolean)))
  let verifiedUser = null
  if (bindings.length < 21 && boundUsers.length === 1) {
    const user = await document('users',boundUsers[0])
    const phone = text(user && (user.phone || user.phoneNumber)).replace(/\D/g,'')
    if (user && user.phoneVerified === true && /^1[3-9]\d{9}$/.test(phone) && user.pcServiceRebindRequired !== true) {
      verifiedUser = { id:text(user._id), phone }
    }
  }
  const token = crypto.randomBytes(32).toString('hex')
  await sessions.add({ data:{ tokenHash:hash(token), gateId:text(gate._id), entryKey:text(gate.entryKey), purpose:text(gate.purpose), officialOpenId:text(oauth.openid), unionId:text(oauth.unionid), active:true, phoneVerified:Boolean(verifiedUser), userId:verifiedUser?verifiedUser.id:'', phone:verifiedUser?verifiedUser.phone:'', expiresAt:new Date(Date.now()+12*60*60*1000), createTime:db.serverDate(), updateTime:db.serverDate() } })
  return { success:true, serviceEntrySession:token, purpose:gate.purpose, phoneVerified:Boolean(verifiedUser) }
}
async function sendSms(event) {
  const loaded = await sessionFor(event)
  const phone = text(event.phone)
  if (!/^1[3-9]\d{9}$/.test(phone)) return fail('PHONE_INVALID','请输入正确的手机号')
  if (time(loaded.session.lastSmsAt) > Date.now()-30000) return fail('SMS_TOO_FREQUENT','请30秒后重试')
  const recent = (await db.collection('sms_codes').where({ phoneNumber:phone, loginChallengeId:text(loaded.session.tokenHash) }).limit(20).get()).data || []
  if (recent.filter(item => time(item.createdAt) > Date.now()-60*60*1000).length >= 6) return fail('SMS_LIMIT','验证码发送过多，请稍后再试')
  const sent = await cloud.callFunction({ name:'sendSms', data:{ phoneNumber:phone, loginChallengeId:text(loaded.session.tokenHash) } })
  const result = sent && sent.result || sent
  if (!result || result.success !== true) return fail('SMS_FAILED',text(result && result.error) || '验证码发送失败')
  await sessions.doc(loaded.session._id).update({ data:{ lastSmsAt:db.serverDate(), smsPhone:phone, updateTime:db.serverDate() } })
  return { success:true }
}
async function verifySms(event) {
  const loaded = await sessionFor(event), session = loaded.session
  const phone = text(event.phone), code = text(event.code)
  if (phone !== text(session.smsPhone) || !/^1[3-9]\d{9}$/.test(phone) || !/^\d{6}$/.test(code)) return fail('SMS_INVALID','手机号或验证码错误')
  const found = (await db.collection('sms_codes').where({ phoneNumber:phone, code, loginChallengeId:text(session.tokenHash), used:false, expireAt:_.gt(new Date()) }).limit(2).get()).data || []
  if (found.length !== 1) return fail('SMS_EXPIRED','验证码错误或已过期')
  const users = (await db.collection('users').where(_.or([{ phone },{ phoneNumber:phone }])).limit(3).get()).data || []
  const uniqueUsers = Array.from(new Map(users.map(item => [text(item._id),item])).values())
  if (uniqueUsers.length > 1) return fail('ACCOUNT_CONFLICT','手机号存在重复账号，请联系管理员核对')
  const openId = text(session.officialOpenId)
  const bound = (await db.collection('service_account_bindings').where({ sport:'football', officialOpenId:openId, subscribed:true }).limit(3).get()).data || []
  if (bound.some(item => item.userId && (!uniqueUsers[0] || text(item.userId) !== text(uniqueUsers[0]._id)))) return fail('WECHAT_ACCOUNT_CONFLICT','此微信已绑定其他账号，请联系管理员核对')
  let user = uniqueUsers[0]
  if (!user) {
    const created = await db.collection('users').add({ data:{ phone, phoneNumber:phone, phoneVerified:true, role:'user', createTime:db.serverDate(), updateTime:db.serverDate() } })
    user = { _id:created._id, phone, phoneNumber:phone }
  }
  const key = 'football:user:' + text(user._id)
  const existing = (await db.collection('service_account_bindings').where({ uniqueKey:key }).limit(2).get()).data || []
  if (existing.length > 1 || existing[0] && existing[0].subscribed === true && text(existing[0].officialOpenId) !== openId) return fail('USER_BINDING_CONFLICT','账号已绑定其他服务号微信，请联系管理员核对')
  const binding = { sport:'football', uniqueKey:key, userId:text(user._id), officialOpenId:openId, subscribed:true, status:'subscribed', updateTime:db.serverDate() }
  if (existing[0]) await db.collection('service_account_bindings').doc(existing[0]._id).update({ data:binding })
  else await db.collection('service_account_bindings').add({ data:{ ...binding, createTime:db.serverDate() } })
  await db.collection('sms_codes').doc(found[0]._id).update({ data:{ used:true, usedAt:db.serverDate() } })
  await db.collection('users').doc(user._id).update({ data:{ phoneVerified:true, updateTime:db.serverDate() } })
  await sessions.doc(session._id).update({ data:{ phoneVerified:true, phone, userId:text(user._id), phoneVerifiedAt:db.serverDate(), updateTime:db.serverDate() } })
  return { success:true, phoneMasked:phone.slice(0,3)+'****'+phone.slice(7) }
}
async function context(event) {
  const loaded = await sessionFor(event), gate = loaded.gate, session = loaded.session
  if (gate.purpose === 'team_claim_entry') {
    if (!gate.targetedInviteId) {
      const rows = (await db.collection('tournament_invites').where({ inviteKey:text(gate.entryKey), inviteType:'tournament_claim_code', status:'active' }).limit(2).get()).data || []
      const claimCode = rows[0]
      if (rows.length !== 1 || time(claimCode.expireAt) <= Date.now() || text(claimCode.tournamentId) !== text(gate.tournamentId)) throw new Error('赛事认领码已失效，请联系主办方')
    }
    const tournament = await document('tournaments',gate.tournamentId)
    if (!tournament) throw new Error('赛事已下线，请联系主办方')
    const teams = []
    if (session.phoneVerified === true) {
      const pages = []
      if (gate.targetedInviteId) {
        const targeted = await document('team_invitations',gate.targetedInviteId)
        if (!targeted || text(targeted._id)!==text(gate.entryKey) || text(targeted.tournamentId)!==text(gate.tournamentId)) throw new Error('逐队邀请已失效，请联系主办方')
        pages.push([targeted])
      } else {
        for (let offset=0; offset<500; offset+=100) {
          const page = (await db.collection('team_invitations').where({ tournamentId:text(gate.tournamentId), type:'prebuilt_tournament_team' }).skip(offset).limit(100).get()).data || []
          pages.push(page)
          if (page.length<100) break
          if (offset===400) throw new Error('本赛事待认领球队较多，请联系主办方分批处理')
        }
      }
      for (const page of pages) for (const invite of page) {
        if (text(invite.type)!=='prebuilt_tournament_team' || !['pending','review_approved','accepted'].includes(text(invite.status))) continue
        const inviteExpiry=time(invite.inviteExpireAt || invite.expiresAt)
        if (inviteExpiry && inviteExpiry<=Date.now()) continue
        const phones = (Array.isArray(invite.allowedClaimPhones) ? invite.allowedClaimPhones : []).concat([invite.targetPhone,invite.inviteePhone,gate.targetedInviteId?invite.managerPhone:'']).map(v=>text(v).replace(/\D/g,'')).filter(Boolean)
        if (!phones.includes(text(session.phone))) continue
        const team = await document('teams',invite.teamId)
        if (!team) continue
        if (text(invite.status)==='accepted' && text(invite.acceptedUserId)!==text(session.userId)) continue
        teams.push({ inviteId:text(invite._id), teamId:text(team._id), teamName:text(team.name||team.teamName), divisionName:text(invite.divisionName), managerName:text(invite.managerName||team.contactName), city:text(team.city||team.cityName), status:text(invite.status)==='accepted'?'已认领':(team.ownerId||team.claimedByUserId?(text(team.ownerId||team.claimedByUserId)===text(session.userId)?'待确认':'需人工核验'):'待认领') })
      }
    }
    return { success:true, purpose:gate.purpose, tournamentName:text(tournament.name), phoneVerified:session.phoneVerified===true, phoneMasked:session.phoneVerified ? text(session.phone).slice(0,3)+'****'+text(session.phone).slice(7) : '', teams }
  }
  const invite = await document('team_invitations',gate.inviteId)
  if (!invite || text(invite.type)!=='team_player' || !['active','pending'].includes(text(invite.status)) || time(invite.expiresAt)<=Date.now() || text(invite.token)!==text(gate.entryKey)) throw new Error('球员入队邀请已失效，请联系球队')
  const team = await document('teams',invite.teamId)
  if (!team || text(team._id)!==text(gate.teamId)) throw new Error('球队已变化，请重新扫码')
  return { success:true, purpose:gate.purpose, teamName:text(team.name||team.teamName), participantMode:text(invite.participantMode), phoneVerified:session.phoneVerified===true, phoneMasked:session.phoneVerified ? text(session.phone).slice(0,3)+'****'+text(session.phone).slice(7) : '' }
}
async function claimTeam(event) {
  const current=await context(event)
  if (!current.phoneVerified || current.purpose!=='team_claim_entry') return fail('CLAIM_AUTH_REQUIRED','请先验证报名表登记的手机号')
  if (event.disclaimerAgreed!==true) return fail('DISCLAIMER_REQUIRED','请先阅读并同意参赛免责声明')
  const row=current.teams.find(item=>item.inviteId===text(event.inviteId))
  if (!row) return fail('CLAIM_NOT_ALLOWED','当前手机号不能认领这支球队')
  if (row.status==='需人工核验') return fail('CLAIM_REVIEW_REQUIRED','球队已有负责人，请联系主办方核验归属')
  const invoked=await cloud.callFunction({ name:'getMiniWorkspace', data:{
    action:'acceptServiceTeamClaim', serviceEntrySession:text(event.serviceEntrySession),
    inviteId:text(event.inviteId), disclaimerAgreed:true
  } })
  const result=invoked&&invoked.result||{}
  return result.success?result:fail(text(result.code)||'CLAIM_FAILED',text(result.message)||'球队认领失败，请重试')
}
async function joinPlayer(event) {
  const current=await context(event)
  if (!current.phoneVerified || current.purpose!=='player_invite_entry') return fail('PLAYER_AUTH_REQUIRED','请先验证手机号')
  const invoked=await cloud.callFunction({ name:'getMiniWorkspace', data:{
    action:'acceptServiceTeamPlayer', serviceEntrySession:text(event.serviceEntrySession),
    name:text(event.name), birthDate:text(event.birthDate),
    guardianRelation:text(event.guardianRelation),
    authorizationAgreed:event.authorizationAgreed===true
  } })
  const result=invoked&&invoked.result||{}
  if (!result.success) return fail(text(result.code)||'PLAYER_JOIN_FAILED',text(result.message)||'球员登记失败，请重试')
  if (!result.parentProfileUrl) return fail('PLAYER_PROFILE_PENDING','球员已关联，但资料入口暂不可用，请联系球队负责人')
  return result
}
module.exports = async function handleServiceEntry(action,event) {
  try {
    if (action==='serviceEntryOAuthUrl') return await oauthUrl(event)
    if (action==='completeServiceEntryOAuth') return await completeOAuth(event)
    if (action==='serviceEntrySendSms') return await sendSms(event)
    if (action==='serviceEntryVerifySms') return await verifySms(event)
    if (action==='serviceEntryContext') return await context(event)
    if (action==='serviceEntryClaimTeam') return await claimTeam(event)
    if (action==='serviceEntryJoinPlayer') return await joinPlayer(event)
    return fail('ENTRY_ACTION_INVALID','不支持的登记操作')
  } catch(error) { return fail(text(error.code)||'SERVICE_ENTRY_FAILED',text(error.message)||'登记暂不可用，请稍后重试') }
}
