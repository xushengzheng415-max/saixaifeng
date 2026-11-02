'use strict'
const crypto = require('node:crypto')
const COLLECTION = 'web_phone_login'
const hash = value => crypto.createHash('sha256').update(String(value || '')).digest('hex')
const time = value => new Date(value && value.$date ? value.$date : value).getTime()
const fail = (code, error, extra = {}) => ({ success: false, code, error, ...extra })
const phoneValid = value => typeof value === 'string' && /^1[3-9]\d{9}$/.test(value)
function accountAllowed(user, phone) {
  if (!user || !user._id || user.deleted || user.isDeleted || user.disabled || user.banned || user.isBanned) return false
  if (['deleted','disabled','banned','suspended'].includes(String(user.status || '').toLowerCase())) return false
  const values = [user.phone,user.phoneNumber].map(value => String(value || '').trim()).filter(Boolean)
  return values.length > 0 && values.every(value => value === phone)
}
function validChallenge(record, phoneHash, now) {
  return Boolean(record && record.recordType === 'phone_login_challenge' && record.phoneHash === phoneHash && record.userId && record.status === 'pending' && record.used !== true && Number(record.expiresAtMs) > now && Number(record.attempts || 0) < 5)
}
function publicUser(user, phone) {
  return { _id: user._id, phone, phoneNumber: phone, nickname: String(user.nickname || user.userName || '').slice(0,80), headimgurl: String(user.headimgurl || user.avatarUrl || '').slice(0,500), email: String(user.email || '').slice(0,254), role: user.role || '', isPlatformOwner: user.isPlatformOwner === true }
}
function createPhoneCodeLogin({ store, sendSms, issueSession, now = Date.now, token = () => crypto.randomBytes(32).toString('hex') }) {
  return {
    async options() {
      try { return { success: true, enabled: await store.ready(), existingAccountsOnly: true } }
      catch { return { success: true, enabled: false, existingAccountsOnly: true } }
    },
    async send(input, clientKey) {
      const phone = String(input.phoneNumber || '').trim()
      if (!phoneValid(phone)) return fail('PHONE_INVALID','请输入正确的11位手机号')
      try {
        const stamp = now(), phoneHash = hash(phone), ipHash = hash(clientKey || 'shared-unknown-client')
        const reservation = await store.reserve({ phoneHash, ipHash, now: stamp })
        if (!reservation.success) return reservation
        const users = await store.findUsers(phone)
        if (users.length > 1) return fail('PHONE_ACCOUNT_CONFLICT','手机号关联多个账号，请联系管理员')
        if (!accountAllowed(users[0],phone)) return fail('PHONE_ACCOUNT_UNAVAILABLE','请核对手机号，或先使用微信扫码登录')
        const loginChallenge = token(), challengeId = hash(loginChallenge)
        await store.put(challengeId,{recordType:'phone_login_challenge',phoneHash,userId:users[0]._id,status:'sending',used:false,attempts:0,createdAtMs:stamp,expiresAtMs:stamp+5*60*1000,expiresAt:new Date(stamp+5*60*1000)})
        const sent = await sendSms({ phoneNumber:phone, loginChallengeId:challengeId })
        if (!sent || sent.success !== true) {
          await store.update(challengeId,{status:'failed'})
          return fail('SMS_SEND_FAILED','验证码发送失败，请稍后重试')
        }
        await store.update(challengeId,{status:'pending'})
        return { success:true, loginChallenge, retryAfter:60, expiresIn:300 }
      } catch { return fail('PHONE_LOGIN_UNAVAILABLE','短信登录暂不可用，请稍后重试或微信扫码') }
    },
    async complete(input) {
      const phone = String(input.phoneNumber || '').trim(), code = String(input.smsCode || '').trim(), loginChallenge = String(input.loginChallenge || '')
      if (!phoneValid(phone) || !/^\d{6}$/.test(code) || !/^[a-f0-9]{64}$/i.test(loginChallenge)) return fail('PHONE_CODE_INVALID','请填写正确的手机号和6位验证码')
      try {
        const consumed = await store.consume({ phone, phoneHash:hash(phone), code, challengeId:hash(loginChallenge), now:now() })
        if (!consumed.success) return consumed
        try {
          const session = await issueSession(consumed.user._id, phone)
          if (!session || !session.authToken) throw new Error('SESSION_MISSING')
          return { success:true, user:publicUser(consumed.user,phone), ...session }
        } catch { return fail('PHONE_SESSION_FAILED','登录会话创建失败，请重新获取验证码') }
      } catch { return fail('PHONE_LOGIN_UNAVAILABLE','短信登录暂不可用，请稍后重试或微信扫码') }
    }
  }
}
async function readDoc(database, collection, id) {
  try {
    const result = await database.collection(collection).doc(id).get()
    return Array.isArray(result.data) ? result.data[0] || null : result.data || null
  } catch (error) {
    const message = String(error.message || error.errMsg || '')
    if (/document.*(?:does not exist|not exist|not found|不存在)/i.test(message)) return null
    throw error
  }
}
function createCloudStore(db, limits = {}) {
  const dailyMax = Math.max(1,Number(limits.dailyMax) || 10), hourlyIpMax = Math.max(1,Number(limits.hourlyIpMax) || 50)
  const globalHourlyMax = Math.max(1,Number(limits.globalHourlyMax) || 200), globalDailyMax = Math.max(1,Number(limits.globalDailyMax) || 1000)
  const findUsers = async phone => (await db.collection('users').where(db.command.or([{phone},{phoneNumber:phone}])).limit(2).get()).data || []
  return {
    async ready() { await db.collection(COLLECTION).limit(1).get(); return true },
    findUsers,
    async put(id, data) { await db.collection(COLLECTION).doc(id).set({data}) },
    async update(id, data) { await db.collection(COLLECTION).doc(id).update({data}) },
    async reserve({phoneHash,ipHash,now}) {
      const day = new Date(now+8*60*60*1000).toISOString().slice(0,10), hour = Math.floor(now/3600000)
      const ids = {cooldown:'cooldown-'+phoneHash,daily:'day-'+day+'-'+phoneHash,ip:'hour-'+hour+'-'+ipHash,globalHour:'global-hour-'+hour,globalDay:'global-day-'+day}
      return db.runTransaction(async tx => {
        const cooldown = await readDoc(tx,COLLECTION,ids.cooldown), daily = await readDoc(tx,COLLECTION,ids.daily), ip = await readDoc(tx,COLLECTION,ids.ip)
        const globalHour = await readDoc(tx,COLLECTION,ids.globalHour), globalDay = await readDoc(tx,COLLECTION,ids.globalDay)
        if (cooldown && Number(cooldown.nextAllowedAt)>now) return fail('SMS_COOLDOWN','发送过于频繁，请稍后重试',{retryAfter:Math.ceil((cooldown.nextAllowedAt-now)/1000)})
        if (Number(daily?.attempts || 0)>=dailyMax) return fail('SMS_DAILY_LIMIT','该手机号今日请求较多，请明日重试')
        if (Number(ip?.attempts || 0)>=hourlyIpMax) return fail('SMS_CLIENT_LIMIT','当前网络请求较多，请稍后重试')
        if (Number(globalHour?.attempts || 0)>=globalHourlyMax || Number(globalDay?.attempts || 0)>=globalDailyMax) return fail('SMS_SERVICE_LIMIT','当前短信请求较多，请稍后重试或微信扫码')
        await tx.collection(COLLECTION).doc(ids.cooldown).set({data:{recordType:'phone_login_cooldown',nextAllowedAt:now+60000,expiresAt:new Date(now+600000)}})
        await tx.collection(COLLECTION).doc(ids.daily).set({data:{recordType:'phone_login_rate',attempts:Number(daily?.attempts || 0)+1,expiresAt:new Date(now+26*3600000)}})
        await tx.collection(COLLECTION).doc(ids.ip).set({data:{recordType:'phone_login_rate',attempts:Number(ip?.attempts || 0)+1,expiresAt:new Date(now+2*3600000)}})
        await tx.collection(COLLECTION).doc(ids.globalHour).set({data:{recordType:'phone_login_rate',attempts:Number(globalHour?.attempts || 0)+1,expiresAt:new Date(now+2*3600000)}})
        await tx.collection(COLLECTION).doc(ids.globalDay).set({data:{recordType:'phone_login_rate',attempts:Number(globalDay?.attempts || 0)+1,expiresAt:new Date(now+26*3600000)}})
        return {success:true}
      })
    },
    async consume({phone,phoneHash,code,challengeId,now}) {
      const initial = await readDoc(db,COLLECTION,challengeId)
      if (!validChallenge(initial,phoneHash,now)) return fail('PHONE_CHALLENGE_EXPIRED','验证码已失效，请重新获取')
      const users = await findUsers(phone)
      if (users.length>1) return fail('PHONE_ACCOUNT_CONFLICT','手机号关联多个账号，请联系管理员')
      if (users.length!==1 || users[0]._id!==initial.userId) return fail('PHONE_ACCOUNT_CHANGED','账号资料已变化，请重新获取验证码')
      const candidates = (await db.collection('sms_codes').where({phoneNumber:phone,loginChallengeId:challengeId}).limit(2).get()).data || []
      return db.runTransaction(async tx => {
        const challenge = await readDoc(tx,COLLECTION,challengeId)
        if (!validChallenge(challenge,phoneHash,now)) return fail('PHONE_CHALLENGE_EXPIRED','验证码已失效，请重新获取')
        const user = await readDoc(tx,'users',challenge.userId)
        if (!accountAllowed(user,phone) || user._id!==users[0]._id) return fail('PHONE_ACCOUNT_CHANGED','账号资料已变化，请重新获取验证码')
        const sms = candidates.length===1 ? await readDoc(tx,'sms_codes',candidates[0]._id) : null
        const matches = sms && sms.phoneNumber===phone && sms.loginChallengeId===challengeId && sms.used===false && time(sms.expireAt)>now && /^\d{6}$/.test(String(sms.code || '')) && crypto.timingSafeEqual(Buffer.from(String(sms.code)),Buffer.from(code))
        if (!matches) {
          const attempts=Number(challenge.attempts || 0)+1
          await tx.collection(COLLECTION).doc(challengeId).update({data:{attempts,status:attempts>=5?'locked':'pending'}})
          return fail(attempts>=5?'PHONE_CODE_LOCKED':'PHONE_CODE_MISMATCH',attempts>=5?'错误次数较多，请重新获取验证码':'验证码不正确，请重新输入')
        }
        await tx.collection('sms_codes').doc(sms._id).update({data:{used:true,usedAt:new Date(now)}})
        await tx.collection(COLLECTION).doc(challengeId).update({data:{used:true,status:'used',usedAt:new Date(now)}})
        await tx.collection('users').doc(user._id).update({data:{phoneVerified:true,lastLoginTime:new Date(now),lastLoginType:'phone_code'}})
        return {success:true,user:{...user,phoneVerified:true}}
      })
    }
  }
}
module.exports={COLLECTION,hash,accountAllowed,validChallenge,createPhoneCodeLogin,createCloudStore}
