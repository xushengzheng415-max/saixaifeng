(() => {
  'use strict'
  const API = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
  const KEY = 'sxf-self-register-session-v1'
  const query = new URLSearchParams(location.search)
  const wechatEntryUrl = location.href.split('#')[0]
  const status = document.getElementById('status')
  const content = document.getElementById('content')
  const POSITIONS = ['门将', '后卫', '中场', '前锋']
  const RELATIONS = ['父亲', '母亲', '其他监护人']
  let smsTimer = null
  let context = null
  let registeredPlayer = null
  let teamRequest = 0
  let wxReadyPromise = null

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char])
  }
  function say(message, error) {
    status.textContent = message || ''
    status.className = error ? 'error' : ''
  }
  function token() {
    try { return sessionStorage.getItem(KEY) || '' } catch (error) { return '' }
  }
  function saveToken(value) {
    try { sessionStorage.setItem(KEY, value) } catch (error) {}
  }
  function requestId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID()
    return 'req-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12)
  }
  function api(action, data) {
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ action }, data || {})) })
      .then(response => response.json())
      .then(body => {
        const result = body && typeof body.body === 'string' ? JSON.parse(body.body) : body
        if (!result || result.success !== true) {
          const error = new Error(result && (result.error || result.message) || '服务暂不可用，请重试')
          error.code = result && result.code
          throw error
        }
        return result
      })
  }
  function ageOf(birthDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return 0
    const birth = new Date(birthDate + 'T00:00:00Z'), today = new Date()
    let age = today.getUTCFullYear() - birth.getUTCFullYear()
    if (today.getUTCMonth() < birth.getUTCMonth() || (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate())) age -= 1
    return age
  }

  // 公众号文章/菜单直达：先完成服务号网页授权，再回来建档。
  function startOAuth() {
    const height = Number(query.get('h')), weight = Number(query.get('w'))
    say('正在进入服务号授权…')
    api('selfRegisterOAuthUrl', {
      sid: query.get('sid') || '',
      height: Number.isFinite(height) ? height : 0,
      weight: Number.isFinite(weight) ? weight : 0,
      position: query.get('pos') || '',
      referer: location.href
    }).then(result => { location.replace(result.authorizeUrl) })
      .catch(error => { say(error.message, true); renderRetry() })
  }
  function exchange() {
    say('正在确认微信身份…')
    api('selfRegisterSession', { state: query.get('state') || '', code: query.get('code') || '' })
      .then(result => {
        saveToken(result.selfRegisterSession)
        try { history.replaceState(null, '', location.pathname) } catch (error) {}
        load(result)
      })
      .catch(error => { say(error.message, true); renderRetry() })
  }
  function load(sessionResult) {
    if (sessionResult && sessionResult.phoneVerified === false) { showPhone(); return }
    api('selfRegisterContext', { selfRegisterSession: token() })
      .then(result => { context = result; showProfile() })
      .catch(error => {
        if (error.code === 'PHONE_AUTH_REQUIRED') { showPhone(); return }
        say(error.message, true); renderRetry()
      })
  }
  function renderRetry() {
    content.hidden = false
    content.innerHTML = '<button id="retry" class="wide" type="button">重新进入登记</button>'
    document.getElementById('retry').onclick = () => { try { sessionStorage.removeItem(KEY) } catch (error) {}; startOAuth() }
  }

  function showPhone() {
    say('请验证登记手机号')
    content.hidden = false
    content.innerHTML = '<p class="self-register-intro">手机号是赛小蜂足球的账号凭证。未成年球员由监护人手机号登记。</p>' +
      '<div class="row"><label for="phone">手机号</label><input id="phone" type="tel" inputmode="numeric" maxlength="11" autocomplete="tel"></div>' +
      '<div class="row"><label for="code">验证码</label><div class="actions"><input id="code" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code"><button id="send" type="button" class="secondary">获取验证码</button></div></div>' +
      '<button id="verify" class="wide" type="button">验证并继续</button>'
    const send = document.getElementById('send'), verify = document.getElementById('verify')
    send.onclick = () => {
      const phone = document.getElementById('phone').value.trim()
      if (!/^1[3-9]\d{9}$/.test(phone)) return say('请输入正确的手机号', true)
      send.disabled = true; send.textContent = '发送中…'
      api('selfRegisterSendSms', { selfRegisterSession: token(), phone })
        .then(() => { say('验证码已发送'); countdown(send) })
        .catch(error => { send.disabled = false; send.textContent = '获取验证码'; say(error.message, true) })
    }
    verify.onclick = () => {
      verify.disabled = true; verify.textContent = '验证中…'
      api('selfRegisterVerifySms', { selfRegisterSession: token(), phone: document.getElementById('phone').value.trim(), code: document.getElementById('code').value.trim() })
        .then(() => { if (smsTimer) clearInterval(smsTimer); load() })
        .catch(error => { verify.disabled = false; verify.textContent = '验证并继续'; say(error.message, true) })
    }
  }
  function countdown(button) {
    if (smsTimer) clearInterval(smsTimer)
    let remaining = 30
    button.disabled = true
    button.textContent = '已发送 ' + remaining + '秒'
    smsTimer = setInterval(() => {
      remaining -= 1
      if (remaining > 0) { button.textContent = '已发送 ' + remaining + '秒'; return }
      clearInterval(smsTimer); smsTimer = null; button.disabled = false; button.textContent = '重新发送'
    }, 1000)
  }

  function showProfile() {
    const prefill = context && context.prefill || {}
    if (context && context.self) { showExisting(context.self); return }
    say('已验手机号 ' + (context.phoneMasked || '') + '，请填写球员资料')
    content.hidden = false
    content.innerHTML =
      '<p class="self-register-intro">登记后是可继续完善、可认领球员卡的球员档案；参加比赛产生的记录经核实才进入正式身价评估。</p>' +
      '<div class="row"><label for="name">姓名</label><input id="name" maxlength="30" autocomplete="off"></div>' +
      '<div class="row"><label for="birthDate">出生日期</label><input id="birthDate" type="date" max="' + new Date().toISOString().slice(0, 10) + '"></div>' +
      '<div class="row" id="relation-row" hidden><label for="guardianRelation">监护关系</label><select id="guardianRelation"><option value="">请选择</option>' + RELATIONS.map(item => '<option value="' + esc(item) + '">' + esc(item) + '</option>').join('') + '</select><span class="field-hint" style="color:#627369">未成年球员必须由监护人手机号登记</span></div>' +
      '<div class="two-columns"><div class="row"><label for="height">身高（cm）</label><input id="height" type="number" inputmode="numeric" min="100" max="230"></div><div class="row"><label for="weight">体重（kg）</label><input id="weight" type="number" inputmode="numeric" min="20" max="200"></div></div>' +
      '<div class="row"><label for="position">位置</label><select id="position"><option value="">请选择</option>' + POSITIONS.map(item => '<option value="' + esc(item) + '">' + esc(item) + '</option>').join('') + '</select></div>' +
      '<label class="check"><input id="agreed" type="checkbox">我确认以上资料为本人（未成年由监护人）登记，并同意在赛小蜂足球保存球员档案</label>' +
      '<button id="submit" class="wide" type="button" style="margin-top:20px">完成登记</button>' +
      (context && context.claimable && context.claimable.length ? renderClaimable(context.claimable) : '')
    if (prefill.height) document.getElementById('height').value = prefill.height
    if (prefill.weight) document.getElementById('weight').value = prefill.weight
    if (prefill.position) document.getElementById('position').value = prefill.position
    document.getElementById('birthDate').onchange = toggleRelation
    document.getElementById('submit').onclick = submit
    const claimList = document.getElementById('claim-list')
    if (claimList) claimList.addEventListener('click', event => {
      const button = event.target.closest('button[data-player]')
      if (button) claim(button)
    })
  }
  function toggleRelation() {
    const age = ageOf(document.getElementById('birthDate').value)
    document.getElementById('relation-row').hidden = !(age > 0 && age < 18)
  }
  function renderClaimable(rows) {
    return '<h2 class="search-heading">也可能是你已有的档案</h2><p class="self-register-intro">这些历史档案与当前手机号一致但还没有归属。核对后可以认领，不用重复登记。</p><div id="claim-list">' +
      rows.map(row => '<div class="candidate"><div><strong>' + esc(row.maskedName) + '</strong><small>' + [row.birthYear ? row.birthYear + '年' : '', row.position, row.teamId ? '已有球队' : ''].filter(Boolean).join(' · ') + '</small></div><button type="button" class="secondary" data-player="' + esc(row.id) + '">认领这条档案</button></div>').join('') +
      '</div>'
  }
  function claim(button) {
    button.disabled = true
    api('selfRegisterClaim', { selfRegisterSession: token(), playerId: button.getAttribute('data-player'), requestId: requestId(), marketingSessionId: (context && context.sid) || '' })
      .then(result => showDone(result.player || {}))
      .catch(error => { button.disabled = false; say(error.message, true) })
  }
  function submit() {
    const name = document.getElementById('name').value.trim()
    const birthDate = document.getElementById('birthDate').value
    const position = document.getElementById('position').value
    const height = Number(document.getElementById('height').value), weight = Number(document.getElementById('weight').value)
    const guardianRelation = document.getElementById('guardianRelation').value
    if (name.length < 2) return say('请填写至少两个字的姓名', true)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return say('请选择出生日期', true)
    if (!POSITIONS.includes(position)) return say('请选择场上位置', true)
    if (!Number.isFinite(height) || height < 100 || height > 230) return say('请填写 100-230 之间的身高', true)
    if (!Number.isFinite(weight) || weight < 20 || weight > 200) return say('请填写 20-200 之间的体重', true)
    const age = ageOf(birthDate)
    if (age < 6) return say('赛小蜂足球面向 6 岁以上球员', true)
    if (age < 18 && !RELATIONS.includes(guardianRelation)) return say('未成年球员请选择监护关系', true)
    if (!document.getElementById('agreed').checked) return say('请先确认资料登记与保存授权', true)
    if (!name || !birthDate) return say('请完整填写球员资料', true)
    const button = document.getElementById('submit')
    button.disabled = true; button.textContent = '提交中…'
    api('selfRegisterSubmit', {
      selfRegisterSession: token(), name, birthDate, position, height, weight,
      guardianRelation: age < 18 ? guardianRelation : '',
      agreed: true, requestId: requestId(), marketingSessionId: (context && context.sid) || ''
    }).then(result => showDone(result.player || {}))
      .catch(error => {
        button.disabled = false; button.textContent = '完成登记'
        say(error.message, true)
        if (error.code === 'SELF_PLAYER_REVIEW_REQUIRED' || error.code === 'SELF_PLAYER_CONFLICT') refreshClaims()
      })
  }
  function refreshClaims() {
    api('selfRegisterContext', { selfRegisterSession: token() }).then(result => { context = result; showProfile() }).catch(() => {})
  }

  function showExisting(self) {
    showTeamNext(self, '已有球员档案，无需重复登记')
  }
  function showDone(player) {
    if (smsTimer) clearInterval(smsTimer)
    showTeamNext(player, '登记完成')
  }

  function showTeamNext(player, message) {
    registeredPlayer = player
    say(message)
    content.hidden = false
    content.innerHTML = '<div class="self-register-summary"><strong>' + esc(player.name || '球员档案') + '</strong><span>档案已保存' + (player.teamId ? ' · 已有球队归属' : ' · 请选择球队继续') + '</span></div>' +
      '<h2 class="search-heading">我的球队</h2><div id="my-teams" aria-live="polite">正在查询…</div>' +
      '<h2 class="search-heading">搜索已有球队</h2><form id="team-search" class="actions"><input id="team-keyword" aria-label="球队名称" placeholder="输入队名关键词，至少2个字" maxlength="30"><button type="submit">搜索</button></form>' +
      '<p class="field-hint">可用部分队名搜索，先核对地区，避免重复建队。</p><div id="team-results" aria-live="polite"></div><div id="create-team" hidden></div>' +
      '<a class="entry-return-link" href="./me.html">查看我的资料</a>'
    loadMyTeams()
    document.getElementById('team-search').onsubmit = event => { event.preventDefault(); searchTeams(0, false) }
    document.getElementById('team-keyword').oninput = () => { teamRequest += 1; document.getElementById('create-team').hidden = true; document.getElementById('team-results').replaceChildren() }
  }
  function loadMyTeams() {
    const target = document.getElementById('my-teams')
    api('selfRegisterTeams', { selfRegisterSession: token() }).then(result => {
      if (!target.isConnected) return
      target.replaceChildren()
      if (!result.teams.length) { target.textContent = '当前手机号下没有已管理的球队'; return }
      result.teams.forEach(team => renderTeam(target, team, true))
    }).catch(error => {
      if (!target.isConnected) return
      target.textContent = error.message
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'secondary'; retry.textContent = '重新查询'; retry.onclick = loadMyTeams; target.append(retry)
    })
  }
  function renderTeam(target, team, managed) {
    const row = document.createElement('div'); row.className = 'candidate'
    row.innerHTML = '<div><strong>' + esc(team.name) + '</strong><small>' + esc([team.city || '地区未填写', team.division].filter(Boolean).join(' · ')) + '</small></div>'
    const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'secondary'; choose.textContent = '选择此队'
    choose.onclick = () => {
      if (!window.confirm('申请加入“' + team.name + '”？资料将交给球队负责人确认，确认前不会入队。')) return
      choose.disabled = true; choose.textContent = '提交中…'
      api('selfRegisterRequestTeamJoin', { selfRegisterSession: token(), playerId: registeredPlayer.id || registeredPlayer._id, teamId: team.id, agreed: true }).then(result => {
        say('已申请加入' + result.teamName + '，等待球队负责人确认')
        choose.textContent = '待球队确认'
      }).catch(error => { choose.disabled = false; choose.textContent = '选择此队'; say(error.message, true) })
    }
    row.append(choose); target.append(row)
    if (managed) {
      const slot = document.createElement('div'); slot.className = 'mini-launch-slot'; target.append(slot)
      mountLaunch(slot, 'pages/team/player-invite/player-invite.html?teamId=' + encodeURIComponent(team.id) + '&workspaceId=' + encodeURIComponent('team:' + team.id), '邀请队友入队')
    }
  }
  function searchTeams(offset, append) {
    const keyword = document.getElementById('team-keyword').value.trim()
    if (keyword.length < 2) return say('请输入至少2个字的球队名称', true)
    const sequence = ++teamRequest, target = document.getElementById('team-results'), create = document.getElementById('create-team')
    create.hidden = true
    if (!append) target.textContent = '正在搜索…'
    const button = document.querySelector('#team-search button'); button.disabled = true
    api('selfRegisterSearchTeams', { selfRegisterSession: token(), keyword, offset }).then(result => {
      if (sequence !== teamRequest || !target.isConnected) return
      say('')
      if (!append) target.replaceChildren()
      const oldMore = target.querySelector('[data-more]'); if (oldMore) oldMore.remove()
      result.teams.forEach(team => renderTeam(target, team, team.canManage))
      if (result.hasMore) {
        const more = document.createElement('button'); more.type = 'button'; more.className = 'secondary'; more.dataset.more = '1'; more.textContent = '查看更多'; more.onclick = () => { more.disabled = true; searchTeams(result.nextOffset, true) }; target.append(more)
      } else {
        if (!target.children.length) target.textContent = '没有找到匹配的球队，可换个关键词再搜。'
        create.hidden = false
        create.innerHTML = '<label class="check" style="margin-top:20px"><input id="confirm-new-team" type="checkbox">以上没有我要找的球队</label><div id="new-team-slot" class="mini-launch-slot" hidden></div>'
        document.getElementById('confirm-new-team').onchange = event => {
          const slot = document.getElementById('new-team-slot'); slot.hidden = !event.target.checked
          if (event.target.checked) mountLaunch(slot)
        }
      }
    }).catch(error => {
      if (sequence !== teamRequest) return
      say(error.message, true)
      const oldMore = target.querySelector('[data-more]'); if (oldMore) oldMore.disabled = false
      if (!append) target.textContent = '搜索未完成，请重试；暂不开放新建入口。'
    }).finally(() => { if (button.isConnected) button.disabled = false })
  }

  // 开放标签只能打开已发布版本的小程序；未发布时保底提示，不用点击假装成功。
  function mountLaunch(slot, path, label) {
    if (!slot) return
    const inWechat = /MicroMessenger/i.test(navigator.userAgent)
    if (!inWechat || !window.wx) { slot.innerHTML = '<p>请在微信中打开本页，进入“赛小蜂足球”小程序' + esc(label || '新建球队') + '。</p>'; return }
    if (!wxReadyPromise) wxReadyPromise = api('marketingSelfTestWxConfig', { url: wechatEntryUrl }).then(result => new Promise((resolve, reject) => {
      wx.ready(resolve)
      wx.error(() => reject(new Error('微信入口初始化失败')))
      wx.config(Object.assign({}, result.jsConfig, { debug: false, jsApiList: [], openTagList: ['wx-open-launch-weapp'] }))
    })).catch(error => { wxReadyPromise = null; throw error })
    wxReadyPromise.then(() => {
        if (!slot.isConnected) return
        slot.replaceChildren()
        const launch = document.createElement('wx-open-launch-weapp')
        launch.setAttribute('username', 'gh_d58816f3de7c')
        launch.setAttribute('path', path || 'pages/onboarding/onboarding.html?step=team&from=selftest')
        launch.innerHTML = '<template><style>button{display:block;width:100%;height:48px;border:0;border-radius:8px;background:#087344;color:#fff;font:700 17px sans-serif}</style><button>' + esc(label || '新建球队') + '</button></template>'
        launch.addEventListener('error', () => { slot.innerHTML = '<p>打开失败，请在微信搜索“赛小蜂足球”小程序。</p>' })
        slot.append(launch)
    }).catch(() => { slot.innerHTML = '<p>暂时无法唤起小程序，请在微信搜索“赛小蜂足球”。</p>' })
  }

  if (token()) load()
  else if (query.get('state') && query.get('code')) exchange()
  else startOAuth()
})();
