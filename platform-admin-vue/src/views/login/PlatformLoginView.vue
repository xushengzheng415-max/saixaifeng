<template>
  <main class="platform-login">
    <section class="login-shell">
      <button class="home-link" type="button" @click="goHome"><span>←</span> 返回官方网站</button>
      <section class="intro-panel">
        <div class="brand"><img :src="logoUrl" alt="赛小蜂足球" /><div><strong>赛小蜂足球</strong><span>SAIXIAOFENG FOOTBALL</span></div></div>
        <div class="intro-copy"><span class="platform-badge">平台管理专用</span><h1>平台运营管理后台</h1></div>
        <div class="capabilities">
          <div><span>01</span><p><strong>全平台运营总览</strong><small>查看主办方、赛事、球队和待跟进事项</small></p></div>
          <div><span>02</span><p><strong>主办方联系与服务</strong><small>核对创建人联系方式并跟进实际问题</small></p></div>
          <div><span>03</span><p><strong>授权后安全协助</strong><small>用户确认协助码后才能进入其工作空间</small></p></div>
        </div>
        <p class="security-note">平台权限由服务端再次校验，普通主办方账号无法进入。</p>
      </section>
      <section class="form-panel">
        <div class="form-card">
          <div class="form-heading"><span class="admin-mark">管</span><div><h2>平台管理员登录</h2></div></div>
          <form @submit.prevent="submitLogin">
            <label for="platform-account">管理员账号</label>
            <div class="input-shell"><span class="input-icon">A</span><input id="platform-account" v-model.trim="form.account" name="username" type="text" autocomplete="username" maxlength="64" placeholder="请输入平台管理员账号" :disabled="submitting" /></div>
            <label for="platform-password">登录密码</label>
            <div class="input-shell"><span class="input-icon lock">●</span><input id="platform-password" v-model="form.password" name="password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" maxlength="128" placeholder="请输入登录密码" :disabled="submitting" /><button type="button" class="show-password" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click="showPassword = !showPassword">{{ showPassword ? '隐藏' : '显示' }}</button></div>
            <label class="remember-row"><input v-model="rememberCredentials" type="checkbox" :disabled="submitting" /><span>记住账号密码</span></label>
            <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
            <button class="submit-button" type="submit" :disabled="submitting"><span v-if="submitting" class="spinner"></span>{{ submitting ? '正在验证平台权限…' : '登录平台运营中心' }}</button>
          </form>
          <div class="permission-tip"><strong>安全说明</strong><span>密码由浏览器管理，本站不保存明文密码。</span></div>
        </div>
      </section>
    </section>
    <footer>© 2026 赛小蜂足球 · 平台运营管理系统</footer>
  </main>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { PLATFORM_CONSOLE_PATH, storePlatformSession } from '@/utils/platformSession'

const API_URL = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
const REMEMBER_ACCOUNT_KEY = 'sxfPlatformRememberedAccount'
const REMEMBER_CREDENTIALS_KEY = 'sxfPlatformRememberCredentials'
const router = useRouter()
const logoUrl = import.meta.env.BASE_URL + 'logo-saixiaofeng.png'
const rememberCredentials = ref(localStorage.getItem(REMEMBER_CREDENTIALS_KEY) === '1')
const form = reactive({ account: rememberCredentials.value ? (localStorage.getItem(REMEMBER_ACCOUNT_KEY) || '') : '', password: '' })
const submitting = ref(false)
const showPassword = ref(false)
const errorMessage = ref('')
function offerBrowserPasswordSave(account, password) {
  if (typeof window.PasswordCredential !== 'function' || !navigator.credentials?.store) return
  try {
    const credential = new window.PasswordCredential({ id: account, password })
    void navigator.credentials.store(credential).catch(() => {})
  } catch { /* 浏览器不支持时仍保留标准表单自动填充 */ }
}
async function submitLogin() {
  if (submitting.value) return
  errorMessage.value = ''
  if (!form.account || !form.password) { errorMessage.value = '请输入管理员账号和密码'; return }
  submitting.value = true
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'platformPasswordLogin', account: form.account, password: form.password })
    })
    let result = await response.json()
    if (result && typeof result.body === 'string') {
      try { result = JSON.parse(result.body) } catch { /* 使用统一错误提示 */ }
    }
    if (!result || !result.success || !result.authToken || !result.user) throw new Error(result && (result.error || result.message) || '登录失败')
    if (!storePlatformSession(result)) throw new Error('平台登录会话写入失败，请重试')
    if (rememberCredentials.value) {
      localStorage.setItem(REMEMBER_ACCOUNT_KEY, form.account)
      localStorage.setItem(REMEMBER_CREDENTIALS_KEY, '1')
      offerBrowserPasswordSave(form.account, form.password)
    } else {
      localStorage.removeItem(REMEMBER_ACCOUNT_KEY)
      localStorage.removeItem(REMEMBER_CREDENTIALS_KEY)
    }
    form.password = ''
    await router.replace(PLATFORM_CONSOLE_PATH)
  } catch (error) {
    form.password = ''
    errorMessage.value = error.message || '账号、密码或平台权限不正确'
  } finally {
    submitting.value = false
  }
}
function goHome() { window.location.href = 'https://www.sxffootball.cn/' }
onMounted(() => { document.title = '赛小蜂足球平台管理员登录'; sessionStorage.removeItem('sxfPostLoginRedirect') })
</script>

<style scoped>
.platform-login{min-height:100vh;display:grid;place-items:center;align-content:center;gap:24px;padding:42px;background:#071b14;background-image:radial-gradient(circle at 8% 12%,rgba(38,160,99,.17),transparent 29%),radial-gradient(circle at 90% 84%,rgba(25,111,72,.18),transparent 30%);box-sizing:border-box;color:#16221b}.login-shell{position:relative;width:min(1080px,96vw);min-height:650px;display:grid;grid-template-columns:1.08fr .92fr;overflow:hidden;border:1px solid rgba(116,190,149,.24);border-radius:26px;background:#f7faf8;box-shadow:0 34px 100px rgba(0,0,0,.42)}.home-link{position:absolute;z-index:3;top:24px;right:28px;display:flex;align-items:center;gap:7px;padding:8px 12px;color:#708078;border:0;background:transparent;cursor:pointer}.home-link:hover{color:#176a43}.intro-panel{position:relative;display:flex;flex-direction:column;padding:52px 58px;color:#fff;background:linear-gradient(145deg,#0a4a31,#073522 72%,#062c1d);box-sizing:border-box}.intro-panel:after{content:"";position:absolute;right:-100px;bottom:-120px;width:330px;height:330px;border:70px solid rgba(255,255,255,.025);border-radius:50%}.brand{display:flex;align-items:center;gap:13px}.brand img{width:58px;height:58px;padding:5px;border-radius:15px;background:#fff;object-fit:contain;box-sizing:border-box}.brand div{display:flex;flex-direction:column;gap:4px}.brand strong{font-size:19px}.brand span{color:rgba(255,255,255,.48);font-size:9px;letter-spacing:.13em}.intro-copy{margin-top:78px}.platform-badge{display:inline-flex;padding:6px 11px;border:1px solid rgba(116,227,164,.3);border-radius:999px;color:#8ce4b2;background:rgba(49,169,101,.14);font-size:12px}.intro-copy h1{margin:20px 0 14px;font-size:40px}.intro-copy p{max-width:470px;margin:0;color:rgba(255,255,255,.63);font-size:15px;line-height:1.9}.capabilities{display:flex;flex-direction:column;gap:20px;margin-top:48px}.capabilities>div{display:flex;align-items:center;gap:15px}.capabilities>div>span{width:34px;height:34px;display:grid;place-items:center;flex:0 0 auto;border:1px solid rgba(111,220,158,.24);border-radius:10px;color:#7de0a8;background:rgba(255,255,255,.04);font-size:11px}.capabilities p{display:flex;flex-direction:column;gap:5px;margin:0}.capabilities strong{font-size:14px}.capabilities small{color:rgba(255,255,255,.48);font-size:11px}.security-note{margin:auto 0 0;color:rgba(255,255,255,.38);font-size:11px}.form-panel{display:grid;place-items:center;padding:80px 48px 46px;background:#fff;box-sizing:border-box}.form-card{width:min(350px,100%)}.form-heading{display:flex;align-items:center;gap:13px;margin-bottom:38px}.admin-mark{width:44px;height:44px;display:grid;place-items:center;color:#fff;border-radius:12px;background:#176f45;font-size:16px;font-weight:700}.form-heading h2{margin:0;font-size:23px}.form-heading p{margin:5px 0 0;color:#829087;font-size:12px}.form-card form{display:flex;flex-direction:column}.form-card label{margin:0 0 8px;color:#425149;font-size:12px;font-weight:650}.input-shell{height:48px;display:flex;align-items:center;margin-bottom:20px;border:1px solid #d6e0da;border-radius:10px;background:#fbfdfc;transition:.2s}.input-shell:focus-within{border-color:#258557;box-shadow:0 0 0 3px rgba(37,133,87,.1);background:#fff}.input-icon{width:43px;color:#4a8062;font-size:12px;font-weight:700;text-align:center}.input-icon.lock{font-size:9px}.input-shell input{min-width:0;flex:1;height:100%;padding:0;border:0;outline:0;background:transparent;color:#18241d;font-size:14px}.input-shell input::placeholder{color:#a4ada8}.show-password{padding:0 13px;color:#668073;border:0;background:transparent;font-size:11px;cursor:pointer}.error-message{margin:-8px 0 13px;padding:9px 11px;color:#b8423a;border-radius:8px;background:#fff2f1;font-size:11px;line-height:1.5}.submit-button{height:50px;display:flex;align-items:center;justify-content:center;gap:9px;margin-top:5px;color:#fff;border:0;border-radius:10px;background:linear-gradient(135deg,#1b8a54,#116a40);font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 10px 23px rgba(24,123,75,.2)}.submit-button:hover{background:linear-gradient(135deg,#20965e,#0f6039)}.submit-button:disabled{cursor:wait;opacity:.72}.spinner{width:14px;height:14px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite}.permission-tip{display:flex;gap:10px;margin-top:26px;padding:13px 14px;border:1px solid #e6ddd0;border-radius:10px;background:#fffbf5}.permission-tip strong{flex:0 0 auto;color:#a66b24;font-size:11px}.permission-tip span{color:#8d8172;font-size:11px;line-height:1.6}.platform-login footer{color:rgba(255,255,255,.35);font-size:11px}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:850px){.platform-login{padding:18px}.login-shell{grid-template-columns:1fr;min-height:620px}.intro-panel{display:none}.form-panel{padding:82px 30px 45px}.home-link{top:20px;right:20px}}
.remember-row{display:flex!important;align-items:center;gap:8px;margin:-6px 0 14px!important;font-size:12px;font-weight:500!important;cursor:pointer}.remember-row input{width:15px;height:15px;margin:0;accent-color:#176f45;cursor:pointer}.remember-row input:disabled{cursor:wait}
</style>
