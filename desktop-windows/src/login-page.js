function decorateDesktopLogin(config) {
  if (window.__sxfDesktopLoginInstalled) return;
  window.__sxfDesktopLoginInstalled = true;
  let currentFrame;
  let loadingTimer;
  let expiryTimer;
  function updateIndicator() {
    const footer = document.querySelector('.sxf-desktop-footer'); if (!footer) return;
    let indicator = footer.querySelector('.sxf-desktop-update');
    if (!indicator) {
      indicator = document.createElement('a'); indicator.className = 'sxf-desktop-update'; footer.appendChild(indicator);
    }
    const update = window.__sxfDesktopUpdate || {};
    indicator.href = update.url || 'https://www.sxffootball.cn/desktop/windows/check-update';
    indicator.textContent = update.status === 'ready' ? `重启更新 v${update.version}`
      : update.status === 'downloading' ? `正在下载 v${update.version}…`
      : update.status === 'available' ? `可更新 v${update.version}`
      : update.status === 'checking' ? '正在检查更新…'
      : '检查更新';
    indicator.dataset.available = String(['available', 'downloading', 'ready'].includes(update.status));
  }
  function status(state) {
    const box = document.querySelector('.sxf-desktop-qr-status');
    if (!box) return;
    box.hidden = state === 'ready';
    box.dataset.state = state;
    box.replaceChildren();
    if (state !== 'ready') {
      const text = document.createElement('p');
      text.textContent = ({ loading: '正在加载二维码…', error: '二维码加载失败，请重试', expired: '请刷新二维码后扫码' })[state];
      box.appendChild(text);
      if (state !== 'loading') {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = '刷新二维码';
        // 旧版登录页把「刷新二维码」放在卡片直属位置，新版放在登录面板内，统一按后代查找。
        button.addEventListener('click', () => document.querySelector('.login-card .retry')?.click());
        box.appendChild(button);
      }
    }
  }
  function watchFrame(frame) {
    clearTimeout(loadingTimer); clearTimeout(expiryTimer);
    currentFrame = frame;
    status('loading');
    loadingTimer = setTimeout(() => { if (currentFrame?.isConnected) status('error'); }, 23000);
  }
  function decorate() {
    const card = document.querySelector('.login-overlay .login-card') || document.querySelector('.login-card');
    if (!card) { currentFrame = null; clearTimeout(loadingTimer); clearTimeout(expiryTimer); return; }
    // 装饰状态用外壳自己的标记：网页即使写死 data-desktop-login 也不会让注入被跳过。
    if (card.dataset.sxfDesktopDecorated !== 'true') {
      card.dataset.sxfDesktopDecorated = 'true'; card.dataset.desktopLogin = 'true';
      card.setAttribute('role', 'region'); card.removeAttribute('aria-modal');
      // 新版登录页自带品牌栏（.login-brand）时不再插入外壳品牌，避免两套品牌重复。
      if (!card.querySelector('.login-brand') && !card.querySelector('.sxf-desktop-brand')) {
        const brand = document.createElement('aside'); brand.className = 'sxf-desktop-brand';
        const image = document.createElement('img'); image.src = config.icon; image.alt = ''; image.width = 236;
        const name = document.createElement('h1'); name.textContent = '赛小蜂足球';
        const platform = document.createElement('p'); platform.textContent = 'Windows 客户端';
        brand.append(image, name, platform); card.prepend(brand);
      }
      // 新版页面已有「微信扫码 / 手机号登录」选项卡，不再补标题和提示，避免与页面文案重复。
      const panel = card.querySelector('.qr-panel') || card.querySelector('.wechat-login-panel') || card.querySelector('.login-auth');
      if (panel && !card.querySelector('.login-tabs')) {
        const heading = document.createElement('h2'); heading.className = 'sxf-desktop-login-heading'; heading.textContent = '微信扫码登录'; panel.prepend(heading);
        const hint = document.createElement('p'); hint.className = 'sxf-desktop-login-hint'; hint.textContent = '首次登录需验证手机号'; panel.appendChild(hint);
      }
      const shell = card.querySelector('.qr-shell');
      if (shell && !card.querySelector('.sxf-desktop-qr-status')) {
        const state = document.createElement('div'); state.className = 'sxf-desktop-qr-status'; state.setAttribute('role', 'status'); shell.appendChild(state);
      }
      const tutorial = card.querySelector('a[href*="tutorials"]'); if (tutorial) tutorial.classList.add('sxf-desktop-tutorial');
      const overlay = card.closest('.login-overlay') || card.parentElement;
      if (overlay && !overlay.querySelector('.sxf-desktop-footer')) {
        const footer = document.createElement('footer'); footer.className = 'sxf-desktop-footer';
        footer.textContent = `${config.preview ? '测试版 · 共用正式服务' : 'www.sxffootball.cn'}  ·  v${config.version}`;
        overlay.appendChild(footer);
      }
      updateIndicator();
    }
    const frame = card.querySelector('iframe');
    if (frame && (frame !== currentFrame || frame.src !== frame.dataset.desktopWatchedSrc)) {
      frame.dataset.desktopWatchedSrc = frame.src; watchFrame(frame);
    }
  }
  window.addEventListener('sxf:qr-status', event => {
    if (!currentFrame || currentFrame.src !== event.detail?.url) return;
    clearTimeout(loadingTimer); clearTimeout(expiryTimer); status(event.detail.state);
    if (event.detail.state === 'ready') expiryTimer = setTimeout(() => { if (currentFrame?.isConnected) status('expired'); }, 180000);
  });
  window.addEventListener('sxf:desktop-update', updateIndicator);
  new MutationObserver(decorate).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  decorate();
}
