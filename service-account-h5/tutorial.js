(function () {
  'use strict'
  var root = document.getElementById('tutorial'), epoch = 0
  var API = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
  function node(tag, value, cls) { var n = document.createElement(tag); if (value) n.textContent = value; if (cls) n.className = cls; return n }
  function safeImage(url) { try { return new URL(url).protocol === 'https:' } catch (_) { return false } }
  function photo(url) {
    if (!safeImage(url)) return node('p', '截图暂不可用，请联系客服', 'image-error')
    var img = node('img'); img.src = url; img.alt = '操作步骤截图'; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'
    img.addEventListener('error', function () { img.replaceWith(node('p', '截图加载失败，请刷新重试', 'image-error')) })
    img.addEventListener('click', function () { var dialog = node('dialog'), full = node('img'), close = node('button', '关闭'); full.src = url; full.alt = img.alt; close.onclick = function () { dialog.close() }; dialog.append(full, close); dialog.addEventListener('close', function () { dialog.remove() }); document.body.append(dialog); dialog.showModal() })
    return img
  }
  function render(a) {
    root.replaceChildren(); document.title = a.title + '｜赛小蜂足球'
    var back = node('a', '返回我的反馈', 'back'); back.href = './me.html?deep=myFeedback'; root.append(back, node('h1', a.title))
    var meta = [a.category, a.audience].filter(Boolean)
    var date = new Date(a.updatedAt && a.updatedAt.$date || a.updatedAt)
    if (!isNaN(date.getTime())) meta.push('更新于 ' + date.toLocaleDateString('zh-CN'))
    root.append(node('div', meta.join(' · '), 'meta'))
    if (a.intro) root.append(node('p', a.intro, 'intro'))
    ;(a.steps || []).forEach(function (s, i) { var section = node('section', '', 'step'); section.append(node('h2', (i + 1) + '. ' + s.title), node('p', s.text)); if (s.image) section.append(photo(s.image)); else if (s.imageError) section.append(node('p', '截图暂不可用，请联系客服', 'image-error')); root.append(section) })
    var footer = node('div', '', 'footer'), help = node('a', '仍需帮助'); help.href = './me.html?deep=myFeedback'; footer.append(help); root.append(footer)
  }
  async function load() {
    var request = ++epoch, controller = new AbortController(), timer = setTimeout(function () { controller.abort() }, 20000)
    root.replaceChildren(node('p', '正在加载教程…', 'state'))
    try {
      var r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'serviceTutorialGet', id: new URLSearchParams(location.search).get('id') || '' }), signal: controller.signal })
      if (!r.ok) throw new Error('教程加载失败，请重试')
      var result = await r.json(); if (!result.success || !result.article) throw new Error(result.error || '教程暂不可用，请联系客服')
      if (request === epoch) render(result.article)
    } catch (e) {
      if (request !== epoch) return
      var box = node('div', '', 'error'), retry = node('button', '重新加载'), help = node('a', '联系客服'); retry.onclick = load; help.href = './me.html?deep=myFeedback'; box.append(node('p', e.name === 'AbortError' ? '加载超时，请重试' : e.message, 'state'), retry, node('p'), help); root.replaceChildren(box)
    } finally { clearTimeout(timer) }
  }
  load()
})()
