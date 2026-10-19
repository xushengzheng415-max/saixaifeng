'use strict'
const crypto = require('crypto')
const https = require('https')
const { readAll, readByIds } = require('./data-center/reader.cjs')
const text = value => typeof value === 'string' ? value.trim() : ''
const unique = values => [...new Set(values.map(text).filter(Boolean))]
const fail = (code, error) => ({ success:false, code, error })

// Read-only personal outlet. Never trust a browser supplied account, phone or org.
module.exports = function createServicePrivate({ cloud, config, hashSessionToken, dateValue, httpsGet, createSession }) {
  const db = cloud.database(), _ = db.command
  const read = (name, where, fields) => readAll(db,name,where,{ fields, maxRows:5000 })
  const byIds = (name, ids, fields) => readByIds(db,name,'_id',ids,{ fields, maxRows:5000 })
  async function oauthUrl(event) {
    if (!config.APP_ID || !config.APP_SECRET) return fail('SERVICE_ACCOUNT_NOT_CONFIGURED','微信授权暂不可用，请稍后重试')
    const allowedReturns=['https://www.sxffootball.cn/service-account-h5/registration-resume.html','https://www.sxffootball.cn/preview/service-account-h5/me.html']
    const redirectUri = allowedReturns.includes(event.returnUrl) ? event.returnUrl : 'https://www.sxffootball.cn/service-account-h5/me.html'
    const state = crypto.randomBytes(20).toString('hex')
    await db.collection('referee_oauth_states').doc(state).set({ data:{ state, purpose:'service_private', redirectUri, used:false, expiresAt:new Date(Date.now()+10*60*1000), createTime:db.serverDate() } })
    return { success:true, authorizeUrl:'https://open.weixin.qq.com/connect/oauth2/authorize?appid='+encodeURIComponent(config.APP_ID)+'&redirect_uri='+encodeURIComponent(redirectUri)+'&response_type=code&scope=snsapi_base&state='+state+'#wechat_redirect' }
  }
  async function oauth(event) {
    if (!/^[a-f0-9]{40}$/.test(text(event.state)) || !text(event.code)) return fail('SERVICE_PRIVATE_OAUTH_INVALID','微信授权已失效，请重新打开')
    let result
    try { result = await db.collection('referee_oauth_states').doc(event.state).get() }
    catch(error) {
      if(/document.*(?:not exist|not found)/i.test(String(error.message||'')))return fail('SERVICE_PRIVATE_OAUTH_INVALID','微信授权已失效，请重新打开')
      throw error
    }
    const record = Array.isArray(result.data) ? result.data[0] : result.data
    if (!record || record.purpose !== 'service_private' || record.used || dateValue(record.expiresAt)<=Date.now()) return fail('SERVICE_PRIVATE_OAUTH_INVALID','微信授权已失效，请重新打开')
    if (!config.APP_ID || !config.APP_SECRET) return fail('SERVICE_ACCOUNT_NOT_CONFIGURED','微信授权暂不可用，请稍后重试')
    await db.collection('referee_oauth_states').doc(event.state).update({ data:{ used:true, usedAt:db.serverDate() } })
    const wx = await httpsGet('https://api.weixin.qq.com/sns/oauth2/access_token?appid='+encodeURIComponent(config.APP_ID)+'&secret='+encodeURIComponent(config.APP_SECRET)+'&code='+encodeURIComponent(event.code)+'&grant_type=authorization_code')
    if (!wx || !text(wx.openid) || wx.errcode) return fail('SERVICE_PRIVATE_OAUTH_FAILED','微信授权失败，请重新打开')
    const session = await createSession(wx.openid,wx.unionid || '')
    return { success:true, refereeSessionToken:session.token, expiresAt:session.expiresAt }
  }
  async function authenticate(event) {
    const token = text(event.serviceSessionToken)
    if (!/^[a-f0-9]{64}$/.test(token)) return fail('SERVICE_PRIVATE_AUTH_REQUIRED','请重新连接微信')
    const sessions = (await db.collection('referee_h5_sessions').where({ tokenHash:hashSessionToken(token), active:true, expiresAt:_.gt(new Date()) }).limit(2).get()).data || []
    if (sessions.length!==1 || !text(sessions[0].serviceAccountOpenId)) return fail('SERVICE_PRIVATE_AUTH_REQUIRED','请重新连接微信')
    const session = sessions[0], openId = text(session.serviceAccountOpenId)
    const allBindings = await read('service_account_bindings',{ sport:'football', officialOpenId:openId },{ userId:true,status:true,active:true,disabled:true })
    // Subscription controls message delivery, not ownership of an OAuth-verified account.
    const bindings = allBindings.filter(row=>row.active!==false&&row.disabled!==true&&!['revoked','replaced','deleted','unbound','disabled'].includes(text(row.status)))
    const boundIds = unique(bindings.map(row=>row.userId))
    if (boundIds.length>1) return fail('SERVICE_PRIVATE_ACCOUNT_CONFLICT','微信绑定存在冲突，请联系管理员核对')
    const userFields={phone:true,phoneNumber:true,phoneVerified:true,status:true,disabled:true}
    let users = boundIds.length ? await byIds('users',boundIds,userFields) : []
    // Existing referee verification is an independent, verified phone binding.
    if (!boundIds.length && !allBindings.length) {
      const identities = await read('service_identities',{ serviceAccountOpenId:openId },{ phone:true, phoneVerified:true })
      if (identities.length>1) return fail('SERVICE_PRIVATE_ACCOUNT_CONFLICT','微信绑定存在冲突，请联系管理员核对')
      const identity=identities[0]
      if (identity && identity.phoneVerified===true && /^1[3-9]\d{9}$/.test(text(identity.phone))) users = await read('users',_.or([{phone:identity.phone},{phoneNumber:identity.phone}]),userFields)
    }
    if (!users.length) return { success:true, needsBinding:true }
    if (users.length!==1) return fail('SERVICE_PRIVATE_ACCOUNT_CONFLICT','手机号存在重复账号，请联系管理员核对')
    const user=users[0], uid=text(user._id), phone=text(user.phone || user.phoneNumber)
    if (user.phoneVerified!==true || !/^1[3-9]\d{9}$/.test(phone)) return {success:true,needsBinding:true}
    const canonical=await read('users',_.or([{phone},{phoneNumber:phone}]),{phone:true,phoneNumber:true})
    if (canonical.length!==1 || canonical[0]._id!==uid || (text(user.phone)&&text(user.phoneNumber)&&user.phone!==user.phoneNumber)) return fail('SERVICE_PRIVATE_ACCOUNT_CONFLICT','手机号存在重复账号，请联系管理员核对')
    if (['deleted','disabled','banned'].includes(text(user.status)) || user.disabled===true) return fail('SERVICE_PRIVATE_ACCOUNT_UNAVAILABLE','账号暂不可用，请联系管理员')
    return { user, session }
  }
  async function personal(action,event) {
    const context=await authenticate(event)
    if(!context.user)return context
    if(['servicePrivateRegistrationList','servicePrivateResumeRegistration'].includes(action)){
      const recovery=require('./serviceRegistrationRecovery.cjs'),actor={userId:text(context.user._id),openId:text(context.session.serviceAccountOpenId),phone:text(context.user.phone||context.user.phoneNumber)}
      return action==='servicePrivateRegistrationList'?recovery.list(db,actor):recovery.resume(db,actor,event.registrationId)
    }
    if(action==='servicePrivateAccountData')return require('./servicePersonalAccount.cjs')({db,user:context.user,session:context.session})
    if(action==='serviceFeedbackSubmit')return feedback(event,context)
    if(action==='servicePrivateFeedbackList')return feedbackList(context)
    return require('./servicePersonalData.cjs')({cloud,db,user:context.user}).handle(action,event)
  }
  // 客服反馈：仅记录，不承诺处理时效；微信号必填（客服通过企业微信添加用户沟通），账号手机号脱敏仅作内部核对
  const FEEDBACK_TYPES=['data_error','binding','feature','other']
const FEEDBACK_TYPE_LABELS={data_error:'数据问题',binding:'绑定问题',feature:'功能建议',other:'其他'}
// 反馈提醒双通道：企微自建应用消息（SERVICE_WECOM_*）与群机器人 webhook（SERVICE_FEEDBACK_WEBHOOK）可任配或同配，均未配置时静默跳过、不影响提交
// access_token 模块级缓存：同一云函数实例热启动期间复用；有效期 7200s，提前 5 分钟刷新
const wecomTokenCache={token:'',expiresAt:0}
// 企微 API 出口：默认直连 qyapi.weixin.qq.com；配置 SERVICE_WECOM_API_BASE 时改走自有服务器中转
// （企微自建应用可信IP不接受云厂商出口IP，60020，须以自有固定IP服务器转发；中转用 x-relay-token 防滥用）
function wecomApiBase(){const base=text(process.env.SERVICE_WECOM_API_BASE);return (base?base:'https://qyapi.weixin.qq.com').replace(/\/+$/,'')}
function relayHeaders(){const token=text(process.env.SERVICE_WECOM_RELAY_TOKEN);return token?{'x-relay-token':token}:{}}
function postJson(url,payload,extraHeaders){
  return new Promise((resolve,reject)=>{
    let target
    try{target=new URL(url)}catch(error){return reject(error)}
    const body=JSON.stringify(payload)
    const headers={'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}
    if(extraHeaders)Object.assign(headers,extraHeaders)
    const request=https.request({hostname:target.hostname,path:target.pathname+target.search,method:'POST',headers,timeout:4000},response=>{
      let raw=''
      response.on('data',chunk=>{raw+=chunk})
      response.on('end',()=>{try{resolve(JSON.parse(raw))}catch(error){resolve(null)}})
    })
    request.on('timeout',()=>{request.destroy();reject(new Error('request timeout'))})
    request.on('error',reject)
    request.write(body)
    request.end()
  })
}
async function wecomAccessToken(corpId,secret){
  if(wecomTokenCache.token&&wecomTokenCache.expiresAt>Date.now()+5*60*1000)return wecomTokenCache.token
  const result=await httpsGet(wecomApiBase()+'/cgi-bin/gettoken?corpid='+encodeURIComponent(corpId)+'&corpsecret='+encodeURIComponent(secret),relayHeaders())
  if(!result||result.errcode||!result.access_token)throw new Error('企微gettoken失败:'+(result?('errcode '+result.errcode+' '+(result.errmsg||'')):'响应异常'))
  wecomTokenCache.token=result.access_token
  wecomTokenCache.expiresAt=Date.now()+((Number(result.expires_in)||7200)-300)*1000
  return wecomTokenCache.token
}
async function notifyFeedback(doc){
  const label=FEEDBACK_TYPE_LABELS[doc.type]||'其他'
  const summary=String(doc.content||'').slice(0,300).replace(/[\r\n]+/g,'\n')
  const time=new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})
  const link='https://www.sxffootball.cn/admin/#/tournament-center-admin?section=feedback'
  const tasks=[]
  const webhook=text(process.env.SERVICE_FEEDBACK_WEBHOOK)
  if(webhook)tasks.push(postJson(webhook,{msgtype:'markdown',markdown:{content:['**服务号反馈｜'+label+'**','> '+summary.split('\n').join('\n> '),'微信号：'+(doc.contact||'未填写')+' · 手机号 '+(doc.phoneMasked||'未绑定'),'时间：'+time,'[去后台处理]('+link+')'].join('\n')}}).then(result=>{if(result&&result.errcode)throw new Error('机器人推送失败:errcode '+result.errcode)}))
  const corpId=text(process.env.SERVICE_WECOM_CORP_ID),agentId=text(process.env.SERVICE_WECOM_AGENT_ID),secret=text(process.env.SERVICE_WECOM_SECRET)
  if(corpId&&agentId&&secret)tasks.push((async()=>{
    // 应用消息用 text 类型：markdown 在微信插件（个人微信）中不展示
    const token=await wecomAccessToken(corpId,secret)
    const content=['【服务号反馈】'+label,summary,'微信号：'+(doc.contact||'未填写')+' · 手机号 '+(doc.phoneMasked||'未绑定'),'时间：'+time,'后台处理：'+link].join('\n')
    const result=await postJson(wecomApiBase()+'/cgi-bin/message/send?access_token='+encodeURIComponent(token),{touser:text(process.env.SERVICE_WECOM_TOUSER)||'@all',msgtype:'text',agentid:Number(agentId),text:{content}},relayHeaders())
    if(!result||result.errcode)throw new Error('企微应用消息推送失败:'+(result?('errcode '+result.errcode+' '+(result.errmsg||'')):'响应异常'))
  })())
  if(!tasks.length)return
  const settled=await Promise.allSettled(tasks)
  const errors=settled.filter(item=>item.status==='rejected').map(item=>(item.reason&&item.reason.message)||String(item.reason))
  if(errors.length)console.warn('[servicePrivate] feedback notify failed:',errors.join('; '))
}
  async function feedback(event,context){
    const type=FEEDBACK_TYPES.includes(text(event.type))?text(event.type):'other'
    const content=text(event.content)
    if(content.length<10)return fail('SERVICE_PRIVATE_FEEDBACK_TOO_SHORT','请至少填写10个字，方便客服定位问题')
    if(content.length>500)return fail('SERVICE_PRIVATE_FEEDBACK_TOO_LONG','内容过长，请精简到500字以内')
    const contact=text(event.contact)
    if(!/^[a-zA-Z][a-zA-Z0-9_-]{5,19}$/.test(contact))return fail('SERVICE_PRIVATE_FEEDBACK_CONTACT_INVALID','请填写正确的微信号（6-20位，字母开头）')
    const recent=await db.collection('service_feedback').where({userId:text(context.user._id),createTime:_.gt(new Date(Date.now()-60*1000))}).limit(1).get()
    if((recent.data||[]).length)return fail('SERVICE_PRIVATE_FEEDBACK_TOO_FREQUENT','提交太频繁，请一分钟后再试')
    const phone=text(context.user.phone||context.user.phoneNumber)
    const doc={type,content,contact,userId:text(context.user._id),serviceAccountOpenId:text(context.session&&context.session.serviceAccountOpenId),phoneMasked:phone.slice(0,3)+'****'+phone.slice(-4),status:'pending',source:'service-account-h5/me',createTime:db.serverDate()}
    const added=await db.collection('service_feedback').add({data:doc})
    try{await notifyFeedback(doc)}catch(error){console.warn('[servicePrivate] feedback webhook failed:',error.message)}
    return {success:true,feedbackId:added._id}
  }
  async function feedbackList(context){
    const rows=(await db.collection('service_feedback').where({userId:text(context.user._id)}).orderBy('createTime','desc').limit(50).get()).data||[]
    return {success:true,rows:rows.map(row=>({
      feedbackId:String(row._id||''),
      type:String(row.type||'other'),
      typeLabel:FEEDBACK_TYPE_LABELS[row.type]||'其他',
      content:String(row.content||''),
      status:String(row.status||'pending'),
      reply:String(row.reply||''),
      replyAt:row.replyAt||null,
      createTime:row.createTime||null
    }))}
  }
  return async function handle(action,event={}) {
    try {
      if(action==='servicePrivateOAuthUrl')return await oauthUrl(event)
      if(action==='servicePrivateOAuth')return await oauth(event)
      if(['servicePrivateOverview','servicePrivatePlayerData','servicePrivateRefereeData','servicePrivateAccountData','serviceFeedbackSubmit','servicePrivateFeedbackList','servicePrivateRegistrationList','servicePrivateResumeRegistration'].includes(action))return await personal(action,event)
      return fail('SERVICE_PRIVATE_ACTION_INVALID','操作不可用，请重新打开')
    } catch(error){if(['REGISTRATION_RESUME_INVALID','REGISTRATION_RESUME_CHANGED'].includes(error.code))return fail(error.code,error.message);return fail(error.code==='DATA_SCOPE_TOO_LARGE'?error.code:'SERVICE_PRIVATE_READ_FAILED','暂时无法读取，请稍后重新加载')}
  }
}
