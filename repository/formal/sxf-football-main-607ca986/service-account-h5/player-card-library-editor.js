(function (root) {
  'use strict'
  function open(options) {
    var detail = options.detail, crop = Object.assign({}, detail.crop), initial = Object.assign({}, crop)
    var overlay = document.createElement('div'), previousOverflow = document.body.style.overflow, previousFocus = document.activeElement
    var requestId = 0, timer, closed = false, saving = false, ready = false
    overlay.className = 'pc-editor'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', '编辑预装卡')
    overlay.innerHTML = '<section class="pc-sheet"><header class="pc-header"><button type="button" data-lib="close" aria-label="关闭编辑">×</button><h1></h1></header><main class="pc-main"><div class="pc-workspace"><div class="pc-preview"><img data-lib="preview" alt="球员卡预览"></div><div class="pc-controls"><label class="library-adjust">人物大小<input data-lib="zoom" type="range" min="100" max="400" step="5"><output data-lib="percent"></output></label><label class="library-adjust">横向位置<input data-lib="x" type="range" min="-1" max="1" step="0.02"></label><label class="library-adjust">纵向位置<input data-lib="y" type="range" min="-1" max="1" step="0.02"></label><button type="button" data-lib="reset">恢复位置</button><p class="pc-status" data-lib="status" role="status" aria-live="polite"></p><button type="button" data-lib="retry" hidden>重新预览</button></div></div></main><footer class="pc-footer"><button type="button" data-lib="save" disabled>保存此卡</button></footer></section>'
    var $ = function (key) { return overlay.querySelector('[data-lib="' + key + '"]') }
    overlay.querySelector('h1').textContent = detail.card.title
    document.body.appendChild(overlay); document.body.style.overflow = 'hidden'; $('close').focus()
    function payload() { return { playerId: detail.player.id, templateId: detail.card.templateId, templateVersion: detail.card.templateVersion, crop: Object.assign({}, crop) } }
    function status(message, error) { $('status').textContent = message; $('status').classList.toggle('is-error', Boolean(error)) }
    function controls() { $('zoom').value = String(Math.round(crop.zoom * 100)); $('percent').textContent = $('zoom').value + '%'; $('x').value = crop.x; $('y').value = crop.y }
    function preview() {
      clearTimeout(timer); var id = ++requestId; ready = false; $('save').disabled = true; $('retry').hidden = true; status('正在生成预览…')
      return options.api('previewMyPreloadedPlayerCard', payload()).then(function (result) {
        if (closed || id !== requestId) return
        var image = new Image()
        image.onload = function () { if (!closed && id === requestId) { $('preview').src = result.imageData; ready = true; $('save').disabled = saving; status(''); } }
        image.onerror = function () { if (!closed && id === requestId) { status('预览读取失败，请重试', true); $('retry').hidden = false } }
        image.src = result.imageData
      }).catch(function (error) { if (!closed && id === requestId) { status(error.message || '预览失败，请重试', true); $('retry').hidden = false } })
    }
    ;['zoom', 'x', 'y'].forEach(function (key) { $(key).oninput = function () {
      crop[key] = Number($(key).value) / (key === 'zoom' ? 100 : 1); controls(); ready = false; $('save').disabled = true
      requestId++; clearTimeout(timer); timer = setTimeout(preview, 300)
    } })
    $('reset').onclick = function () { crop = Object.assign({}, initial); controls(); preview() }; $('retry').onclick = preview
    function close() { if (saving) return; closed = true; clearTimeout(timer); requestId++; overlay.remove(); document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKey); if (previousFocus && previousFocus.focus) previousFocus.focus() }
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); close() }
      if (event.key === 'Tab') {
        var nodes = Array.prototype.slice.call(overlay.querySelectorAll('button:not(:disabled):not([hidden]),input:not(:disabled)')), first = nodes[0], last = nodes[nodes.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    $('close').onclick = close; document.addEventListener('keydown', onKey)
    $('save').onclick = function () {
      if (!ready || saving) return
      saving = true; $('save').disabled = true; ['zoom','x','y','reset','retry'].forEach(function (key) { $(key).disabled = true }); status('正在保存此卡…')
      options.api('saveMyPreloadedPlayerCard', Object.assign(payload(), { expectedRevision: detail.card.revision })).then(function () {
        saving = false; close(); options.onSaved()
      }).catch(function (error) { saving = false; $('save').disabled = false; ['zoom','x','y','reset','retry'].forEach(function (key) { $(key).disabled = false }); status(error.message || '保存失败，请重试', true) })
    }
    controls(); preview(); return {close:close}
  }
  root.SxfPlayerCardLibraryEditor = {open:open}
})(window)
