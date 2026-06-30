// 赛小蜂官网登录逻辑
// 云开发 Web SDK 初始化
const CLOUD_ENV = 'cloud1-7g8ckb3c7815a011'; // 云开发环境 ID

let cloudbaseApp = null;
let currentUser = null;

// 初始化云开发
async function initCloudbase() {
  if (cloudbaseApp) return cloudbaseApp;
  try {
    cloudbaseApp = cloudbase.init({ env: CLOUD_ENV });
    // 匿名登录（这样才能调云函数）
    await cloudbaseApp.auth().signInAnonymously();
    console.log('[login] 云开发初始化成功');
    return cloudbaseApp;
  } catch (err) {
    console.error('[login] 云开发初始化失败:', err);
    throw err;
  }
}

// ===== Tab 切换 =====
function switchTab(tabName) {
  // 所有 tab 按钮取消激活
  ['wechat', 'email', 'phone', 'account'].forEach(name => {
    const btn = document.getElementById('tab-' + name);
    const panel = document.getElementById('panel-' + name);
    if (btn) {
      btn.classList.remove('bg-bee-main', 'text-white', 'shadow-sm');
      btn.classList.add('text-white/60');
    }
    if (panel) {
      panel.classList.add('hidden');
    }
  });

  // 激活当前 tab
  const activeBtn = document.getElementById('tab-' + tabName);
  const activePanel = document.getElementById('panel-' + tabName);
  if (activeBtn) {
    activeBtn.classList.add('bg-bee-main', 'text-white', 'shadow-sm');
    activeBtn.classList.remove('text-white/60');
  }
  if (activePanel) {
    activePanel.classList.remove('hidden');
  }
}

// ===== 微信扫码登录（占位）=====
// 微信扫码登录需要微信 OAuth，纯静态页面无法实现
// 这里只做一个 UI 提示
document.addEventListener('DOMContentLoaded', () => {
  const wechatPanel = document.getElementById('panel-wechat');
  if (wechatPanel) {
    const refreshBtn = wechatPanel.querySelector('p:nth-child(3)');
    if (refreshBtn) {
      refreshBtn.style.cursor = 'pointer';
      refreshBtn.addEventListener('click', () => {
        alert('微信扫码登录需要在微信中打开，或配置网站域名后使用');
      });
    }
  }
});

// ===== 邮箱登录 =====
let emailCountdown = 0;
let emailTimer = null;

async function sendEmailCode() {
  const email = document.getElementById('email-input')?.value?.trim();
  if (!email) {
    alert('请输入邮箱');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert('邮箱格式不正确');
    return;
  }

  const btn = document.getElementById('email-send-btn');
  btn.disabled = true;
  btn.textContent = '发送中...';

  try {
    await initCloudbase();
    const result = await cloudbaseApp.callFunction({
      name: 'emailLogin',
      data: { email, action: 'sendCode' }
    });

    if (result.result && result.result.success) {
      alert('验证码已发送到邮箱');
      emailCountdown = 60;
      emailTimer = setInterval(() => {
        emailCountdown--;
        btn.textContent = emailCountdown + '秒后重发';
        if (emailCountdown <= 0) {
          clearInterval(emailTimer);
          btn.disabled = false;
          btn.textContent = '获取验证码';
        }
      }, 1000);
    } else {
      alert('发送失败：' + (result.result?.error || '未知错误'));
      btn.disabled = false;
      btn.textContent = '获取验证码';
    }
  } catch (err) {
    alert('发送失败：' + err.message);
    btn.disabled = false;
    btn.textContent = '获取验证码';
  }
}

async function handleEmailLogin() {
  const email = document.getElementById('email-input')?.value?.trim();
  const code = document.getElementById('email-code-input')?.value?.trim();

  if (!email || !code) {
    alert('请填写完整信息');
    return;
  }

  try {
    await initCloudbase();
    const result = await cloudbaseApp.callFunction({
      name: 'emailLogin',
      data: { email, code, action: 'verifyCode' }
    });

    if (result.result && result.result.success) {
      // 登录成功，保存登录态
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('loginType', 'email');
      localStorage.setItem('role', result.result.role || 'ORGANIZER');
      localStorage.setItem('currentRole', result.result.role || 'ORGANIZER');
      localStorage.setItem('userInfo', JSON.stringify({
        uid: result.result.user?._id || '',
        email: email,
        userName: email,
        avatarUrl: ''
      }));
      // 跳转到管理后台
      window.location.href = '/tournaments';
    } else {
      alert('登录失败：' + (result.result?.error || '验证码错误或已过期'));
    }
  } catch (err) {
    alert('登录失败：' + err.message);
  }
}

// ===== 手机号登录 =====
let phoneCountdown = 0;
let phoneTimer = null;

async function sendPhoneCode() {
  const phone = document.getElementById('phone-input')?.value?.trim();
  if (!phone) {
    alert('请输入手机号');
    return;
  }
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    alert('手机号格式不正确');
    return;
  }

  const btn = document.getElementById('phone-send-btn');
  btn.disabled = true;
  btn.textContent = '发送中...';

  try {
    await initCloudbase();
    const result = await cloudbaseApp.callFunction({
      name: 'sendSms',
      data: { phoneNumber: phone }
    });

    if (result.result && result.result.success) {
      alert('验证码已发送');
      phoneCountdown = 60;
      phoneTimer = setInterval(() => {
        phoneCountdown--;
        btn.textContent = phoneCountdown + '秒后重发';
        if (phoneCountdown <= 0) {
          clearInterval(phoneTimer);
          btn.disabled = false;
          btn.textContent = '获取验证码';
        }
      }, 1000);
    } else {
      alert('发送失败：' + (result.result?.error || '未知错误'));
      btn.disabled = false;
      btn.textContent = '获取验证码';
    }
  } catch (err) {
    alert('发送失败：' + err.message);
    btn.disabled = false;
    btn.textContent = '获取验证码';
  }
}

async function handlePhoneLogin() {
  const phone = document.getElementById('phone-input')?.value?.trim();
  const code = document.getElementById('phone-code-input')?.value?.trim();

  if (!phone || !code) {
    alert('请填写完整信息');
    return;
  }

  try {
    await initCloudbase();
    const result = await cloudbaseApp.callFunction({
      name: 'verifySmsCode',
      data: { phoneNumber: phone, code, bindToUser: false }
    });

    if (result.result && result.result.success) {
      // 登录成功，保存登录态
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('loginType', 'phone');
      localStorage.setItem('role', result.result.role || 'ORGANIZER');
      localStorage.setItem('currentRole', result.result.role || 'ORGANIZER');
      localStorage.setItem('userInfo', JSON.stringify({
        uid: result.result.user?._id || '',
        phone: phone,
        userName: phone,
        avatarUrl: ''
      }));
      // 跳转到管理后台
      window.location.href = '/tournaments';
    } else {
      alert('登录失败：' + (result.result?.error || '验证码错误或已过期'));
    }
  } catch (err) {
    alert('登录失败：' + err.message);
  }
}

// ===== 账号密码登录 =====
async function handleAccountLogin() {
  const account = document.getElementById('account-input')?.value?.trim();
  const password = document.getElementById('password-input')?.value?.trim();

  if (!account || !password) {
    alert('请填写完整信息');
    return;
  }

  try {
    await initCloudbase();
    const result = await cloudbaseApp.callFunction({
      name: 'verifyPassword',
      data: { account, password }
    });

    if (result.result && result.result.success) {
      // 登录成功，保存登录态
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('loginType', 'password');
      localStorage.setItem('role', result.result.role || 'ORGANIZER');
      localStorage.setItem('currentRole', result.result.role || 'ORGANIZER');
      localStorage.setItem('userInfo', JSON.stringify({
        uid: result.result.user?._id || '',
        email: result.result.user?.email || '',
        phone: result.result.user?.phone || '',
        userName: result.result.user?.name || account,
        avatarUrl: result.result.user?.avatarUrl || ''
      }));
      // 跳转到管理后台
      window.location.href = '/tournaments';
    } else {
      alert('登录失败：' + (result.result?.error || '账号或密码错误'));
    }
  } catch (err) {
    alert('登录失败：' + err.message);
  }
}

// 暴露函数到全局（给 HTML onclick 调用）
window.switchTab = switchTab;
window.sendEmailCode = sendEmailCode;
window.handleEmailLogin = handleEmailLogin;
window.sendPhoneCode = sendPhoneCode;
window.handlePhoneLogin = handlePhoneLogin;
window.handleAccountLogin = handleAccountLogin;
