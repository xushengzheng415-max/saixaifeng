(function (global) {
  'use strict'

  var API = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
  var LANG_KEY = 'sxf_h5_lang'
  var CACHE_KEY = 'sxf_h5_i18n_en_v2'
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt']
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1 }
  var FIXED = (global.SXF_I18N_FIXED_EN && typeof global.SXF_I18N_FIXED_EN === 'object') ? global.SXF_I18N_FIXED_EN : {}
  var memory = Object.create(null)
  var pending = Object.create(null)
  var queue = null
  var observer = null
  var translating = false
  var originalLang = document.documentElement.lang || 'zh-CN'

  function resolve(source) {
    if (Object.prototype.hasOwnProperty.call(FIXED, source)) return FIXED[source]
    return memory[source] || ''
  }

  function seedFixedIntoMemory() {
    Object.keys(FIXED).forEach(function (source) {
      memory[source] = FIXED[source]
    })
  }

  function currentLang() {
    try {
      return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'zh'
    } catch (_) {
      return 'zh'
    }
  }

  function setLang(lang) {
    var next = lang === 'en' ? 'en' : 'zh'
    try { localStorage.setItem(LANG_KEY, next) } catch (_) {}
    document.documentElement.lang = next === 'en' ? 'en' : originalLang
    updateToggle()
    if (next === 'en') translatePage()
    else restorePage()
  }

  function loadMemory() {
    try {
      var raw = localStorage.getItem(CACHE_KEY)
      if (!raw) return
      var parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') memory = parsed
    } catch (_) {}
  }

  function saveMemory() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(memory))
    } catch (_) {}
  }

  function hasChinese(value) {
    return /[\u4e00-\u9fff]/.test(String(value || ''))
  }

  function skipNode(node) {
    if (!node) return true
    if (node.nodeType === 1) {
      if (SKIP_TAGS[node.tagName]) return true
      if (node.hasAttribute && (node.hasAttribute('data-i18n-skip') || node.closest && node.closest('[data-i18n-skip]'))) return true
      // Never machine-translate personal/team identity labels that sit beside UI chrome.
      if (node.closest && node.closest('.me-display-name,.me-jersey-name,.me-binding-name,.personal-person h1,.me-home-player-option,.pp-players button')) return true
      if (node.isContentEditable) return true
      return false
    }
    if (node.nodeType === 3) {
      var parent = node.parentElement
      return !parent || skipNode(parent)
    }
    return true
  }

  function ensureOriginal(el, attr, value) {
    var key = attr ? 'data-i18n-o-' + attr : 'data-i18n-o-text'
    if (!el.hasAttribute(key)) el.setAttribute(key, value)
    return el.getAttribute(key)
  }

  function collect() {
    var map = Object.create(null)
    function add(text) {
      var source = String(text || '').replace(/\s+/g, ' ').trim()
      if (!source || !hasChinese(source) || source.length > 120) return
      map[source] = 1
    }
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null)
    var node
    while ((node = walker.nextNode())) {
      if (skipNode(node)) continue
      add(node.nodeValue)
    }
    var els = document.body.querySelectorAll('*')
    for (var i = 0; i < els.length; i++) {
      var el = els[i]
      if (skipNode(el)) continue
      for (var a = 0; a < ATTRS.length; a++) {
        var attr = ATTRS[a]
        if (el.hasAttribute(attr)) add(el.getAttribute(attr))
      }
      if (el.tagName === 'OPTION') add(el.textContent)
    }
    if (document.title) add(document.title)
    return Object.keys(map)
  }

  function applyOne(source, translated) {
    if (!translated) return
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null)
    var node
    while ((node = walker.nextNode())) {
      if (skipNode(node)) continue
      var raw = String(node.nodeValue || '')
      var trimmed = raw.replace(/\s+/g, ' ').trim()
      if (trimmed !== source) continue
      var parent = node.parentElement
      if (!parent) continue
      ensureOriginal(parent, '', trimmed)
      var leading = raw.match(/^\s*/)[0]
      var trailing = raw.match(/\s*$/)[0]
      node.nodeValue = leading + translated + trailing
    }
    var els = document.body.querySelectorAll('*')
    for (var i = 0; i < els.length; i++) {
      var el = els[i]
      if (skipNode(el)) continue
      for (var a = 0; a < ATTRS.length; a++) {
        var attr = ATTRS[a]
        if (!el.hasAttribute(attr)) continue
        var value = String(el.getAttribute(attr) || '').trim()
        if (value !== source) continue
        ensureOriginal(el, attr, value)
        el.setAttribute(attr, translated)
      }
      if (el.tagName === 'OPTION') {
        var opt = String(el.textContent || '').replace(/\s+/g, ' ').trim()
        if (opt === source) {
          ensureOriginal(el, '', opt)
          el.textContent = translated
        }
      }
    }
    if (String(document.title || '').trim() === source) {
      if (!document.documentElement.getAttribute('data-i18n-o-title')) {
        document.documentElement.setAttribute('data-i18n-o-title', document.title)
      }
      document.title = translated
    }
  }

  function restorePage() {
    var els = document.body.querySelectorAll('[data-i18n-o-text]')
    for (var i = 0; i < els.length; i++) {
      var el = els[i]
      var original = el.getAttribute('data-i18n-o-text')
      if (el.tagName === 'OPTION') {
        el.textContent = original
        continue
      }
      // h1 often contains name text + badge span; restore the first direct text node.
      var restored = false
      for (var n = 0; n < el.childNodes.length; n++) {
        if (el.childNodes[n].nodeType === 3) {
          el.childNodes[n].nodeValue = original
          restored = true
          break
        }
      }
      if (!restored) {
        for (var d = 0; d < el.childNodes.length; d++) {
          var child = el.childNodes[d]
          if (child.nodeType === 1 && child.childNodes.length === 1 && child.childNodes[0].nodeType === 3 && !child.hasAttribute('data-i18n-skip')) {
            child.childNodes[0].nodeValue = original
            restored = true
            break
          }
        }
      }
    }
    for (var a = 0; a < ATTRS.length; a++) {
      var attr = ATTRS[a]
      var marked = document.body.querySelectorAll('[data-i18n-o-' + attr + ']')
      for (var j = 0; j < marked.length; j++) {
        marked[j].setAttribute(attr, marked[j].getAttribute('data-i18n-o-' + attr))
      }
    }
    var title = document.documentElement.getAttribute('data-i18n-o-title')
    if (title) document.title = title
  }

  function apiTranslate(texts) {
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'translateUi', from: 'zh', to: 'en', texts: texts })
    }).then(function (r) { return r.json() }).then(function (result) {
      if (result && typeof result.body === 'string') result = JSON.parse(result.body)
      if (!result || !result.success) throw new Error((result && (result.error || result.code)) || 'translate failed')
      return result.translations || {}
    })
  }

  function queueFlush() {
    queue = null
    if (currentLang() !== 'en' || translating) return
    seedFixedIntoMemory()
    var collected = collect()
    // Apply fixed menu/chrome first; never send those to Baidu.
    collected.forEach(function (source) {
      if (Object.prototype.hasOwnProperty.call(FIXED, source)) applyOne(source, FIXED[source])
    })
    var need = collected.filter(function (source) {
      return !Object.prototype.hasOwnProperty.call(FIXED, source) && !memory[source] && !pending[source]
    })
    if (!need.length) {
      applyCached()
      saveMemory()
      return
    }
    need.forEach(function (source) { pending[source] = 1 })
    translating = true
    updateToggle(true)
    var batches = []
    for (var i = 0; i < need.length; i += 40) batches.push(need.slice(i, i + 40))
    var chain = Promise.resolve()
    batches.forEach(function (batch) {
      chain = chain.then(function () {
        return apiTranslate(batch).then(function (map) {
          Object.keys(map).forEach(function (source) {
            if (Object.prototype.hasOwnProperty.call(FIXED, source)) return
            memory[source] = map[source]
            delete pending[source]
            applyOne(source, map[source])
          })
          saveMemory()
        })
      })
    })
    chain.then(function () {
      translating = false
      updateToggle(false)
      applyCached()
    }).catch(function () {
      translating = false
      need.forEach(function (source) { delete pending[source] })
      updateToggle(false)
    })
  }

  function schedule() {
    if (currentLang() !== 'en') return
    if (queue) clearTimeout(queue)
    queue = setTimeout(queueFlush, 120)
  }

  function applyCached() {
    seedFixedIntoMemory()
    Object.keys(FIXED).forEach(function (source) {
      applyOne(source, FIXED[source])
    })
    Object.keys(memory).forEach(function (source) {
      if (Object.prototype.hasOwnProperty.call(FIXED, source)) return
      applyOne(source, memory[source])
    })
  }

  function translatePage() {
    applyCached()
    schedule()
  }

  function ensureToggle() {
    if (document.getElementById('sxf-i18n-toggle')) return
    var btn = document.createElement('button')
    btn.id = 'sxf-i18n-toggle'
    btn.type = 'button'
    btn.setAttribute('aria-label', 'Language')
    btn.style.cssText = [
      'position:fixed', 'right:12px', 'bottom:calc(12px + env(safe-area-inset-bottom,0px))',
      'z-index:99999', 'min-width:52px', 'height:36px', 'padding:0 12px',
      'border:0', 'border-radius:999px', 'background:#0b3d2e', 'color:#fff',
      'font:600 13px/36px system-ui,-apple-system,sans-serif',
      'box-shadow:0 6px 18px rgba(0,0,0,.22)', 'cursor:pointer'
    ].join(';')
    btn.addEventListener('click', function () {
      setLang(currentLang() === 'en' ? 'zh' : 'en')
    })
    document.body.appendChild(btn)
    updateToggle()
  }

  function updateToggle(busy) {
    var btn = document.getElementById('sxf-i18n-toggle')
    if (!btn) return
    if (busy) {
      btn.textContent = '…'
      btn.disabled = true
      return
    }
    btn.disabled = false
    btn.textContent = currentLang() === 'en' ? '中文' : 'EN'
  }

  function watch() {
    if (observer) return
    observer = new MutationObserver(function () {
      if (currentLang() === 'en') schedule()
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  }

  function t(source) {
    var text = String(source == null ? '' : source)
    if (currentLang() !== 'en' || !hasChinese(text)) return text
    var hit = resolve(text)
    if (hit) return hit
    pending[text] = 1
    schedule()
    return text
  }

  function boot() {
    loadMemory()
    seedFixedIntoMemory()
    ensureToggle()
    watch()
    if (currentLang() === 'en') {
      document.documentElement.lang = 'en'
      translatePage()
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()

  global.SxfI18n = {
    t: t,
    getLang: currentLang,
    setLang: setLang,
    translatePage: translatePage,
    fixed: FIXED
  }
})(window)
