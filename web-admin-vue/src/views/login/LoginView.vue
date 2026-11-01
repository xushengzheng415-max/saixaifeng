<template>
  <main class="login-overlay modern-login">
    <section class="login-card" data-modern-login="true" aria-label="登录赛小蜂足球">
      <aside class="login-brand"><img :src="verticalLogo" alt="赛小蜂足球" /></aside>
      <button class="close" type="button" aria-label="返回官网" @click="goHome">×</button>
      <section class="login-auth">
        <div class="login-tabs" role="tablist" aria-label="登录方式">
          <button type="button" role="tab" :aria-selected="mode === 'wechat'" aria-controls="wechat-login-panel" @click="openWechatLogin">微信扫码</button>
          <button type="button" role="tab" :aria-selected="mode === 'phone'" aria-controls="phone-login-panel" @click="openPhoneLogin">手机号登录</button>
        </div>
        <div id="wechat-login-panel" v-show="mode === 'wechat'" class="wechat-login-panel" role="tabpanel">
          <div class="qr-shell">
            <div v-if="isLocalPreview" class="qr-preview" aria-label="本地视觉验收二维码占位"><span>微信扫码授权</span></div>
            <iframe v-else-if="mode === 'wechat' && qrUrl" :src="qrUrl" title="微信扫码登录二维码" scrolling="no" frameborder="0" />
            <div v-else class="qr-loading" role="status">正在加载二维码…</div>
          </div>
          <button v-if="!isLocalPreview" class="retry" type="button" @click="refreshQr">刷新二维码</button>
        </div>
        <div id="phone-login-panel" v-show="mode === 'phone'" class="phone-login-panel" role="tabpanel">
          <form @submit.prevent="submitPhoneLogin">
            <label for="login-phone">手机号</label>
            <input id="login-phone" v-model.trim="phone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="11" placeholder="11位大陆手机号" :disabled="sending || submitting" />
            <label for="login-code">验证码</label>
            <div class="phone-code-row">
              <input id="login-code" v-model.trim="smsCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6位数字" :disabled="sending || submitting" />
              <button type="button" :disabled="!canSend" @click="sendCode">{{ sending ? '发送中…' : countdown ? `${countdown}秒后重发` : '获取验证码' }}</button>
            </div>
            <p v-if="phoneReady === false" class="phone-availability" role="status">短信登录暂不可用，可先微信扫码。<button type="button" :disabled="checking" @click="checkPhoneOptions">{{ checking ? '检查中…' : '重新检查' }}</button></p>
            <p v-if="message" class="login-feedback" :class="{error: messageIsError}" role="status" aria-live="polite">{{ message }}</p>
            <button class="phone-submit" type="submit" :disabled="!canSubmit">{{ submitting ? '登录中…' : '登录' }}</button>
          </form>
        </div>
        <RouterLink class="login-tutorial" to="/tutorials">操作教程</RouterLink>
      </section>
    </section>
  </main>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import verticalLogo from '../../assets/images/brand-logo-vertical.png'
import { phoneLoginRequest, commitPhoneLoginSession } from '../../utils/phoneCodeLogin'
import { setDemoMode } from '../../utils/demoMode'
import { clearSessionReadCaches } from '../../utils/sessionReadCache'
const router = useRouter()
const mode = ref('wechat'), qrUrl = ref(''), phone = ref(''), smsCode = ref(''), challenge = ref('')
const phoneReady = ref(null), checking = ref(false), sending = ref(false), submitting = ref(false)
const countdown = ref(0), message = ref(''), messageIsError = ref(false)
let timer, mounted = true
const validPhone = computed(() => /^1[3-9]\d{9}$/.test(phone.value))
const canSend = computed(() => validPhone.value && phoneReady.value === true && !checking.value && !sending.value && !submitting.value && !countdown.value)
const canSubmit = computed(() => validPhone.value && /^\d{6}$/.test(smsCode.value) && challenge.value && phoneReady.value === true && !sending.value && !submitting.value)
const isLocalPreview = computed(() => import.meta.env.DEV || ['127.0.0.1', 'localhost'].includes(window.location.hostname))
function feedback(text, error = true) { message.value = text; messageIsError.value = error }
function startCountdown(value) { clearInterval(timer); countdown.value = Math.max(0, Math.min(60, Number(value) || 60)); timer = setInterval(() => { if(countdown.value > 0)countdown.value--; else clearInterval(timer) }, 1000) }
function refreshQr() {
  const state = crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : String(Date.now())
  sessionStorage.setItem('wechat_login_state', state)
  const redirect = `${window.location.protocol}//${window.location.host}${import.meta.env.BASE_URL}#/wechat-callback`
  qrUrl.value = `https://open.weixin.qq.com/connect/qrconnect?appid=wx5a42aae0e5d0669c&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=snsapi_login&state=${encodeURIComponent(state)}#wechat_redirect`
}
async function checkPhoneOptions() {
  if(checking.value)return
  checking.value=true
  try { const result=await phoneLoginRequest('phoneCodeLoginOptions'); if(mounted)phoneReady.value=result.success===true && result.enabled===true }
  catch { if(mounted)phoneReady.value=false }
  finally { if(mounted)checking.value=false }
}
function openPhoneLogin() { mode.value='phone';qrUrl.value='';sessionStorage.removeItem('wechat_login_state');if(phoneReady.value!==true)void checkPhoneOptions() }
function openWechatLogin() { mode.value='wechat';refreshQr() }
async function sendCode() {
  if(!canSend.value)return
  sending.value=true; message.value=''; const target=phone.value
  try {
    const result=await phoneLoginRequest('sendPhoneCodeLoginSms',{phoneNumber:target})
    if(!mounted || phone.value!==target)return
    if(!result.success){if(result.retryAfter)startCountdown(result.retryAfter);feedback(result.error || '验证码发送失败，请稍后重试');return}
    if(!/^[a-f0-9]{64}$/i.test(result.loginChallenge || '')){feedback('验证码发送结果异常，请稍后重试');return}
    challenge.value=result.loginChallenge; startCountdown(result.retryAfter);feedback('验证码已发送',false)
  } catch(error){if(mounted)feedback(error.message || '发送失败，请检查网络后重试')}
  finally {if(mounted)sending.value=false}
}
async function submitPhoneLogin() {
  if(!canSubmit.value)return
  submitting.value=true;message.value=''
  try {
    const result=await phoneLoginRequest('completePhoneCodeLogin',{phoneNumber:phone.value,smsCode:smsCode.value,loginChallenge:challenge.value})
    if(!mounted)return
    if(!result.success){if(['PHONE_CHALLENGE_EXPIRED','PHONE_CODE_LOCKED','PHONE_ACCOUNT_CHANGED','PHONE_SESSION_FAILED'].includes(result.code)){challenge.value='';smsCode.value=''}feedback(result.error || '登录未完成，请重试');return}
    commitPhoneLoginSession(result,{onReset:()=>{setDemoMode(false);clearSessionReadCaches('identity')}})
    await router.replace('/organization-onboarding')
  } catch(error){if(mounted)feedback(error.message || '登录失败，请检查网络后重试')}
  finally {if(mounted)submitting.value=false}
}
watch(phone,()=>{challenge.value='';smsCode.value='';message.value='';clearInterval(timer);countdown.value=0})
function goHome(){window.location.href='https://www.sxffootball.cn/'}
onMounted(()=>{refreshQr();void checkPhoneOptions()})
onUnmounted(()=>{mounted=false;clearInterval(timer)})
</script>

<style>
#app .modern-login{display:grid!important;min-height:100dvh!important;padding:16px!important;place-items:center!important;background:#f4f7f5!important;background-image:none!important;backdrop-filter:none!important;color:#20392b;font-family:"Microsoft YaHei","PingFang SC",sans-serif}
#app .modern-login .login-card{position:relative!important;display:grid!important;grid-template-columns:minmax(260px,.9fr) minmax(340px,1.1fr)!important;grid-template-rows:auto!important;width:min(840px,calc(100vw - 32px))!important;height:auto!important;min-height:546px!important;padding:0!important;border:1px solid #dce6df!important;border-radius:12px!important;overflow:hidden!important;background:#fff!important;box-shadow:none!important}
#app .modern-login .login-brand{display:flex;align-items:center;justify-content:center;padding:32px;background:#eaf4ed;border-right:1px solid #e0e9e3}
#app .modern-login .login-brand img{display:block;width:min(236px,100%);height:auto;object-fit:contain}
#app .modern-login .login-auth{display:flex;min-width:0;flex-direction:column;padding:16px 24px 12px;background:#fff}
#app .modern-login .close{position:absolute;top:10px;right:10px;z-index:3;width:44px;height:44px;border:1px solid #dce6df;border-radius:50%;background:#fff;color:#536d5e;font-size:25px;cursor:pointer}
#app .modern-login .login-tabs{display:flex;justify-content:center;gap:22px;min-height:44px;padding-right:24px;border-bottom:1px solid #edf1ee}
#app .modern-login .login-tabs button{min-height:44px;padding:8px 3px;border:0;border-bottom:2px solid transparent;background:transparent;color:#6b7b71;font:inherit;font-size:14px;cursor:pointer}
#app .modern-login .login-tabs button[aria-selected=true]{border-bottom-color:#087a48;color:#087a48;font-weight:600}
#app .modern-login .wechat-login-panel{flex:1}
#app .modern-login .qr-shell{position:relative;display:grid!important;place-items:center!important;width:280px!important;height:390px!important;margin:0 auto!important;overflow:hidden!important;background:#fff!important}
#app .modern-login .qr-shell iframe{width:280px!important;height:390px!important;border:0}
#app .modern-login .qr-preview{display:grid;place-items:center;width:244px;height:244px;background:repeating-conic-gradient(#075438 0 25%,#fff 0 50%) 50%/20px 20px}
#app .modern-login .qr-preview span{padding:8px 12px;background:#fff;color:#075438;font-size:13px}
#app .modern-login .qr-loading{color:#61796b;font-size:14px}
#app .modern-login .retry{position:static!important;display:block;width:140px;height:44px;margin:0 auto;padding:8px 14px!important;border:1px solid #c9dacf!important;border-radius:6px!important;background:#fff!important;color:#087a48!important;font:inherit;cursor:pointer}
#app .modern-login .login-tutorial{display:flex;min-height:40px;align-items:center;justify-content:center;margin-top:auto;color:#536d5e;text-decoration:none;font-size:12px}
#app .modern-login .phone-login-panel{display:flex;flex:1;align-items:center;min-height:390px;padding:24px 10px}
#app .modern-login .phone-login-panel[style*="display: none"],#app .modern-login .wechat-login-panel[style*="display: none"]{display:none!important}
#app .modern-login form{width:100%;text-align:left}
#app .modern-login label{display:block;margin:0 0 8px;font-size:14px;font-weight:600;color:#304c3a}
#app .modern-login input{width:100%;min-width:0;height:46px;margin:0 0 20px;padding:10px 12px;border:1px solid #ceddd3;border-radius:6px;background:#fff;color:#20392b;font:inherit;font-size:16px;outline:none}
#app .modern-login input:focus{border-color:#087a48;box-shadow:0 0 0 2px #087a4818}
#app .modern-login .phone-code-row{display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:10px}
#app .modern-login .phone-code-row button{height:46px;border:1px solid #c9dacf;border-radius:6px;background:#f0f7f2;color:#087a48;font:inherit;font-size:13px;cursor:pointer}
#app .modern-login .phone-submit{width:100%;min-height:46px;margin-top:8px;border:0;border-radius:6px;background:#087a48;color:#fff;font:inherit;font-weight:600;cursor:pointer}
#app .modern-login button:disabled{opacity:.5;cursor:not-allowed}
#app .modern-login .login-feedback{min-height:20px;margin:0 0 8px;color:#087a48;font-size:13px;line-height:1.6}
#app .modern-login .login-feedback.error{color:#b64132}
#app .modern-login .phone-availability{margin:0 0 12px;color:#6e7f74;font-size:12px;line-height:1.8}
#app .modern-login .phone-availability button{padding:0 4px;border:0;background:none;color:#087a48;font:inherit;text-decoration:underline;cursor:pointer}
#app .modern-login button:focus-visible,#app .modern-login a:focus-visible{outline:2px solid #087a48;outline-offset:3px}
@media(max-width:720px){#app .modern-login .login-card{display:block!important;width:min(420px,calc(100vw - 32px))!important}#app .modern-login .login-brand{display:none}#app .modern-login .login-auth{min-height:546px}}
</style>
