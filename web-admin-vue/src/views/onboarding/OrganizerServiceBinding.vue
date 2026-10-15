<template>
  <main class="binding-page">
    <section class="binding-shell">
      <div class="brand"><img :src="logoUrl" alt="赛小蜂足球" /><div><strong>赛小蜂足球</strong><span>赛事通知服务</span></div></div>
      <div class="content">
        <section class="guide">
          <span class="required-badge">资料已保存</span>
          <h1>关注赛小蜂足球助手</h1>

          <div class="steps"><div><b>1</b><span><strong>微信扫码</strong><small>使用常用微信扫描右侧二维码</small></span></div><div><b>2</b><span><strong>关注并完成绑定</strong><small>已关注用户扫码后会直接完成账号绑定</small></span></div><div><b>3</b><span><strong>进入赛事空间</strong><small>关注确认后进入赛事空间</small></span></div></div>
          <div class="security">同一服务号微信不能静默绑定到多个手机号账号；发现冲突时必须由平台人工核验。</div>
        </section>
        <section class="qr-card">
          <div class="qr-title"><span>微</span><div><h2>微信扫码关注并绑定</h2><p>{{ statusText }}</p></div></div>
          <div v-if="accountReady" class="account-identity" role="status"><div><span>当前登录账号</span><strong><template v-if="accountName">{{ accountName }} · </template>手机号尾号 {{ phoneTail }}</strong></div><button type="button" :disabled="switching" @click="switchAccount">切换账号</button></div>
          <div v-else-if="accountError" class="account-identity account-identity-error"><span>{{ accountError }}</span><button type="button" :disabled="switching" @click="switchAccount">切换账号</button></div>
          <p v-if="accountReady" class="account-instruction">请使用登录此账号的微信扫码关注</p>
          <div class="qr-box">
            <img v-if="followUrl" :src="followUrl" alt="赛小蜂足球助手绑定二维码" />
            <div v-else-if="loading" class="loading-state"><i></i><span>正在生成专属二维码…</span></div>
            <div v-else class="error-state"><strong>二维码暂未生成</strong><span>{{ errorMessage || '请检查网络后重试' }}</span></div>
          </div>
          <button v-if="organizationConflict" type="button" @click="router.replace('/tournament-staff')">查看账号邀请</button>
          <button v-else type="button" :disabled="loading" @click="createGate">{{ loading ? '正在处理…' : '刷新专属二维码' }}</button>
          <p>{{ organizationConflict ? '没有待接受邀请时，请联系平台核验机构关系。' : '二维码与当前登录账号一一对应，请勿转发给他人。' }}</p>
        </section>
      </div>
    </section>
  </main>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { callFunction, logout } from '@/utils/cloud'

const router = useRouter()
const logoUrl = import.meta.env.BASE_URL + 'logo-saixiaofeng.png'
const followUrl = ref('')
const gateId = ref('')
const loading = ref(false)
const errorMessage = ref('')
const organizationConflict = ref(false)
const statusText = ref('正在确认登录账号')
const accountName = ref('')
const phoneTail = ref('')
const accountReady = ref(false)
const accountError = ref('')
const switching = ref(false)
let confirmedSession = ''
let disposed = false
let continuationTimer = null
let timer = null
function sessionKey(){return [localStorage.getItem('authToken') || '',localStorage.getItem('userId') || ''].join('|')}
async function loadAccount(){
  const before=sessionKey(),result=await callFunction('getCurrentAccountProfile')
  if(disposed || switching.value || before!==sessionKey())throw new Error('登录账号已变化，请重新确认')
  if(!result?.success)throw new Error('无法确认当前登录账号，请切换账号后重试')
  const user=result.user || {};let stored={};try{stored=JSON.parse(localStorage.getItem('userInfo') || '{}')}catch{}
  const storedId=String(stored._id || stored.uid || stored.id || localStorage.getItem('userId') || '')
  if(!user._id || storedId && storedId!==String(user._id))throw new Error('登录账号已变化，请切换账号后重试')
  const phone=String(user.phone || user.phoneNumber || '').trim(),masked=String(user.phoneMasked || '')
  if(user.phoneVerified!==true || !(/^1[3-9]\d{9}$/.test(phone) || /^\d{3}\*{4}\d{4}$/.test(masked)))throw new Error('当前账号未验证手机号，请重新扫码登录')
  phoneTail.value=(/^1[3-9]\d{9}$/.test(phone)?phone:masked).slice(-4)
  const name=storedId===String(user._id)?String(stored.nickname || stored.nickName || stored.userName || stored.name || '').trim():''
  accountName.value=/^1[3-9]\d{9}$/.test(name)?'':name
  confirmedSession=before;accountReady.value=true;accountError.value=''
}
async function switchAccount(){
  if(switching.value)return;switching.value=true;followUrl.value='';gateId.value='';accountReady.value=false
  if(timer)clearInterval(timer);if(continuationTimer)clearTimeout(continuationTimer)
  sessionStorage.removeItem('sxfServiceBoundCheck');sessionStorage.removeItem('sxfAfterServiceBinding')
  try{await logout(false);await router.replace('/login')}catch{switching.value=false;accountError.value='退出失败，请重试'}
}

function requireCurrentAccount(){
  if(disposed || switching.value || !accountReady.value || confirmedSession!==sessionKey()){
    followUrl.value='';accountReady.value=false;if(timer)clearInterval(timer)
    if(!disposed && !switching.value)accountError.value='登录账号已变化，请刷新二维码或切换账号'
    throw new Error('登录账号已变化，请重新确认')
  }
}
async function requestBinding(action, payload = {}) {
  requireCurrentAccount()
  const result = await callFunction('tournamentRegistrationFlow', { action, ...payload })
  requireCurrentAccount()
  if (!result || !result.success) {
    const error = new Error(result && (result.message || result.error) || '服务号绑定服务不可用')
    error.code = result?.code || ''
    throw error
  }
  return result.data || {}
}
function continueToBackend() {
  if(disposed || switching.value || confirmedSession!==sessionKey())return
  sessionStorage.setItem('sxfServiceBoundCheck', JSON.stringify({ subscribed: true, checkedAt: Date.now() }))
  const target = sessionStorage.getItem('sxfAfterServiceBinding') || '/tournament-space'
  sessionStorage.removeItem('sxfAfterServiceBinding')
  router.replace(/^\/(?!\/)/.test(target) && !['/service-account-binding','/organization-onboarding'].includes(target) ? target : '/tournament-space')
}
async function checkStatus() {
  try {
    const data = await requestBinding('getOrganizerServiceBindingStatus', { gateId: gateId.value })
    if (data.subscribed) {
      statusText.value = '绑定成功，正在进入后台…'
      if (timer) clearInterval(timer)
      continuationTimer=setTimeout(continueToBackend, 500)
    } else if (data.status === 'identity_conflict') {
      statusText.value = '微信身份存在冲突'
      errorMessage.value = '该服务号微信已关联其他账号，请联系平台人工核验'
    } else {
      statusText.value = '等待扫码'
    }
  } catch (error) {
    errorMessage.value = error.message
  }
}
async function createGate() {
  if (loading.value || switching.value || disposed) return
  loading.value = true
  errorMessage.value = ''
  organizationConflict.value = false
  followUrl.value='';accountReady.value=false;accountError.value='';statusText.value='正在确认登录账号'
  if(timer)clearInterval(timer)
  try {
    await loadAccount()
    const data = await requestBinding('createOrganizerServiceGate')
    if (data.subscribed) {
      continueToBackend()
      return
    }
    gateId.value = data.gateId || ''
    followUrl.value = data.followUrl || ''
    statusText.value = '等待扫码'
    if (!followUrl.value) throw new Error('服务号专属二维码尚未配置')
    if (timer) clearInterval(timer)
    timer = setInterval(checkStatus, 2500)
  } catch (error) {
    if(disposed || switching.value)return
    if(!accountReady.value)accountError.value=error.message || '无法确认当前登录账号'
    errorMessage.value = error.message || '生成绑定二维码失败'
    organizationConflict.value = error.code === 'ORG_CONFLICT'
    statusText.value = '等待重新生成'
  } finally {
    loading.value = false
  }
}
onMounted(() => {
  document.title = '关注赛小蜂足球助手'
  createGate()
})
onUnmounted(() => { disposed=true;if(timer)clearInterval(timer);if(continuationTimer)clearTimeout(continuationTimer) })
</script>

<style scoped>
.binding-page{min-height:100vh;display:grid;place-items:center;padding:38px;background:#071b14;background-image:radial-gradient(circle at 10% 15%,rgba(34,151,91,.18),transparent 30%),radial-gradient(circle at 88% 86%,rgba(26,116,74,.2),transparent 32%);box-sizing:border-box}.binding-shell{width:min(1080px,96vw);overflow:hidden;border:1px solid rgba(116,190,149,.24);border-radius:25px;background:#fff;box-shadow:0 34px 100px rgba(0,0,0,.38)}.brand{display:flex;align-items:center;gap:12px;padding:24px 30px;border-bottom:1px solid #e4ebe7}.brand img{width:48px;height:48px;padding:4px;object-fit:contain;border-radius:13px;background:#fff;border:1px solid #dce7e0}.brand div{display:flex;flex-direction:column;gap:4px}.brand strong{color:#163124;font-size:17px}.brand span{color:#7b8a81;font-size:11px}.content{display:grid;grid-template-columns:1.1fr .9fr}.guide{padding:56px 62px;color:#fff;background:linear-gradient(145deg,#0a4a31,#073522 72%,#062c1d)}.required-badge{display:inline-flex;padding:6px 11px;color:#8ce4b2;border:1px solid rgba(116,227,164,.3);border-radius:999px;background:rgba(49,169,101,.14);font-size:11px}.guide h1{margin:20px 0 14px;font-size:34px}.guide>p{margin:0;color:rgba(255,255,255,.65);font-size:14px;line-height:1.9}.steps{display:flex;flex-direction:column;gap:22px;margin-top:42px}.steps>div{display:flex;align-items:center;gap:14px}.steps b{width:34px;height:34px;display:grid;place-items:center;flex:0 0 auto;color:#83dda9;border:1px solid rgba(111,220,158,.24);border-radius:10px;background:rgba(255,255,255,.05);font-size:11px}.steps span{display:flex;flex-direction:column;gap:5px}.steps strong{font-size:13px}.steps small{color:rgba(255,255,255,.47);font-size:11px}.security{margin-top:40px;padding:13px;color:rgba(255,255,255,.5);border-radius:10px;background:rgba(255,255,255,.05);font-size:11px;line-height:1.7}.qr-card{display:flex;flex-direction:column;align-items:center;padding:58px 48px 42px}.qr-title{width:330px;display:flex;align-items:center;gap:12px;margin-bottom:18px}.qr-title>span{width:42px;height:42px;display:grid;place-items:center;color:#fff;border-radius:12px;background:#1aad19;font-weight:700}.qr-title h2{margin:0;color:#1d2e24;font-size:19px}.qr-title p{margin:5px 0 0;color:#839087;font-size:11px}.qr-box{width:330px;height:330px;display:grid;place-items:center;overflow:hidden;border:1px solid #dbe5df;border-radius:16px;background:#fff;box-shadow:0 12px 34px rgba(22,86,54,.08)}.qr-box img{width:100%;height:100%;object-fit:contain}.loading-state,.error-state{display:flex;flex-direction:column;align-items:center;gap:12px;color:#76847c;font-size:12px}.loading-state i{width:30px;height:30px;border:3px solid #dce9e1;border-top-color:#1b8752;border-radius:50%;animation:spin .8s linear infinite}.error-state strong{color:#b44b43}.error-state span{max-width:230px;text-align:center;line-height:1.6}.qr-card>button{width:330px;height:44px;margin-top:16px;color:#176f45;border:1px solid #c6dbce;border-radius:10px;background:#f2faf5;cursor:pointer}.qr-card>button:disabled{opacity:.6}.qr-card>p{width:330px;margin:12px 0 0;color:#929d96;font-size:10px;text-align:center}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:800px){.binding-page{padding:16px}.content{grid-template-columns:1fr}.guide{padding:35px 30px}.steps{margin-top:26px}.qr-card{padding:35px 25px}.qr-title,.qr-box,.qr-card>button,.qr-card>p{width:min(330px,80vw)}.qr-box{height:min(330px,80vw)}}
</style>

<style scoped>
.account-identity{width:330px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 14px;margin-bottom:10px;border:1px solid #c7dfcf;border-radius:10px;background:#f3faf5}.account-identity>div{min-width:0}.account-identity span{display:block;color:#718277;font-size:12px}.account-identity strong{display:block;margin-top:5px;color:#183c29;font-size:14px;line-height:1.5;overflow-wrap:anywhere}.account-identity button{flex:0 0 auto;border:0;padding:6px 0;background:transparent;color:#137a47;font-size:12px;cursor:pointer}.account-identity-error{border-color:#e2cbbf;background:#fff7ef}.qr-card>.account-instruction{margin:0 0 16px;color:#52715e;font-size:12px;line-height:1.6}@media(max-width:800px){.account-identity{width:min(330px,80vw)}}
</style>
