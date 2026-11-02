const API_URL = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
const ACTIONS = new Set(['phoneCodeLoginOptions','sendPhoneCodeLoginSms','completePhoneCodeLogin'])

export async function phoneLoginRequest(action, data = {}, fetcher = globalThis.fetch) {
  if (!ACTIONS.has(action)) throw new Error('登录操作无效')
  const payload = { action }
  for (const key of ['phoneNumber','smsCode','loginChallenge']) if (typeof data[key] === 'string') payload[key] = data[key]
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetcher(API_URL, { method:'POST', credentials:'omit', redirect:'error', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), signal:controller.signal })
    if (!response.ok) throw new Error('登录服务暂不可用，请稍后重试')
    let result = await response.json()
    if (result && typeof result.body === 'string') result = JSON.parse(result.body)
    if (!result || typeof result !== 'object') throw new Error('登录服务响应异常，请重试')
    return result
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('连接超时，请检查网络后重试')
    if (error instanceof SyntaxError) throw new Error('登录服务响应异常，请稍后重试')
    if (error instanceof TypeError) throw new Error('网络连接失败，请重试或微信扫码')
    throw error
  } finally { clearTimeout(timer) }
}

const LOCAL_KEYS = ['isLoggedIn','authToken','authSessionVersion','userId','userInfo','currentUser','role','currentRole','loginType','phone','phoneNumber','userPhone','openid','unionid','wechatTemp','organizationInfo','currentOrganization','currentOrg','assistanceContext','needBindPhone','needSetPassword','needBindEmail','needSelectRole','wx_login_state','dev_mode']
const SESSION_KEYS = ['sxfPlatformAuthContext','sxfTournamentStaff','sxfStaffPermissions','sxfStaffTournamentId','sxfStaffInvitationPrompted','sxfServiceBoundCheck','sxfAfterServiceBinding','wechat_login_challenge','wechat_login_profile','wechat_login_state','sxfTournamentDemoMode','sxfTournamentDemoId','sxfDemoWorkspaceV2','sxfTournamentDemoPoolDataset']

export function commitPhoneLoginSession(result, { local = globalThis.localStorage, session = globalThis.sessionStorage, onReset = () => {} } = {}) {
  const user = result?.user
  if (!result?.success || typeof user?._id !== 'string' || !user._id.trim() || !/^[a-f0-9]{64}$/i.test(String(result.authToken || ''))) throw new Error('登录会话不完整，请重新登录')
  const clear = () => { LOCAL_KEYS.forEach(key => local.removeItem(key)); SESSION_KEYS.forEach(key => session.removeItem(key)) }
  const phone = String(user.phone || user.phoneNumber || '')
  const info = { _id:user._id, uid:user._id, userName:user.nickname || user.userName || '主办方管理员', avatarUrl:user.headimgurl || user.avatarUrl || '', phone, email:user.email || '', isPlatformOwner:user.isPlatformOwner === true }
  clear()
  try {
    onReset()
    const values = { userId:user._id, userInfo:JSON.stringify(info), role:'organizer', currentRole:'organizer', loginType:'phone', phone, phoneNumber:phone, authSessionVersion:'phone-canonical-web-v1', authToken:result.authToken }
    Object.entries(values).forEach(([key,value]) => local.setItem(key,value))
    // Commit marker is last; a storage failure never leaves a partially logged-in account.
    local.setItem('isLoggedIn','true')
  } catch {
    clear()
    throw new Error('登录信息保存失败，请允许本机存储后重试')
  }
  return info
}
