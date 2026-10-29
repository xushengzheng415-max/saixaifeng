(function () {
  'use strict'
  window.SxfRegistrationCardModal = function (options) {
    var dialog = null, open = false, dead = false, busy = false, confirming = false, queued = false, epoch = 0, crop = null, snapshot = null, confirmed = null, lastPortrait = '', timer = null, oldOverflow = '', previousFocus = null
    var scene=null,resources=null,drawing=false,redraw=false,drawnCrop='',frame=0
    function active() { return !dead && (!options.isActive || options.isActive()) }
    function key() {
      var p = options.getPayload()
      return JSON.stringify([p.choiceToken,p.portraitId,p.name,p.idCard,p.birthDate,p.jerseyName,p.jerseyNumber,p.position,p.height,p.weight])
    }
    function node(id) { return dialog.querySelector('[data-card="' + id + '"]') }
    function close(reason) {
      if (!dialog) return
      open = false; epoch++; clearTimeout(timer); cancelAnimationFrame(frame); queued = false; redraw=false
      dialog.remove(); dialog = null; document.body.style.overflow = oldOverflow
      if (previousFocus && document.contains(previousFocus)) previousFocus.focus()
      if(options.onClosed)options.onClosed(reason||'cancel')
    }
    function begin(message) {
      if (!active()) return
      epoch++
      if (!dialog) {
        previousFocus = document.activeElement; oldOverflow = document.body.style.overflow
        dialog = document.createElement('div'); dialog.className = 'registration-card-overlay'
        dialog.innerHTML = '<section class="registration-card-dialog" role="dialog" aria-modal="true" aria-labelledby="registrationCardTitle"><h2 id="registrationCardTitle" tabindex="-1">初始球员卡</h2><div class="registration-card-body"><div class="registration-card-stage" data-card="stage" aria-busy="true"><div class="card-generation-motion" data-card="motion"><div class="card-generation-outline"><i></i><i></i><i></i></div><span></span></div><img data-card="image" alt="球员卡完整预览" hidden></div><p class="registration-card-status" data-card="status" role="status"></p><div class="registration-card-controls" data-card="controls" hidden><label for="registrationCardZoom">人像大小</label><input id="registrationCardZoom" data-card="zoom" type="range" min="1" max="4" step="0.02" value="1"><div class="card-direction-pad" aria-label="调整人像位置"><button class="secondary direction-up" type="button" data-shift="up" aria-label="人像向上">上</button><button class="secondary direction-left" type="button" data-shift="left" aria-label="人像向左">左</button><button class="secondary direction-reset" type="button" data-shift="reset">复位</button><button class="secondary direction-right" type="button" data-shift="right" aria-label="人像向右">右</button><button class="secondary direction-down" type="button" data-shift="down" aria-label="人像向下">下</button></div></div><button class="text-action wide" type="button" data-card="retry" hidden>重新生成</button></div><div class="registration-card-actions"><button class="secondary" type="button" data-card="back">返回修改</button><button type="button" data-card="confirm" disabled>确认使用</button></div></section>'
        document.body.appendChild(dialog); document.body.style.overflow = 'hidden'; open = true
        dialog.querySelector('h2').textContent='球员卡预览'
        var canvas=document.createElement('canvas');canvas.setAttribute('data-card','canvas');canvas.setAttribute('aria-label','球员卡实时预览');canvas.hidden=true;node('stage').appendChild(canvas)
        var photoTools=document.createElement('div');photoTools.className='registration-photo-tools';photoTools.innerHTML='<button class="text-action" type="button" data-card="replace">更换图片</button><button class="text-action" type="button" data-card="camera">重新拍摄</button>';node('retry').before(photoTools)
        node('replace').onclick=function(){if(!busy&&!confirming&&options.onPhoto)options.onPhoto('album')}
        node('camera').onclick=function(){if(!busy&&!confirming&&options.onPhoto)options.onPhoto('camera')}
        node('back').onclick = function(){close('cancel')}
        node('retry').onclick = function () { generate(true) }
        node('zoom').oninput = function () { if(confirming)return;crop.zoom = Number(this.value); changed() }
        node('zoom').onchange = function () { changed() }
        Array.prototype.forEach.call(dialog.querySelectorAll('[data-shift]'), function (button) {
          button.onclick = function () {
            if (!crop || confirming) return
            var direction = button.getAttribute('data-shift')
            if (direction === 'reset') crop = { zoom:1,x:0,y:0 }
            else if (direction === 'up') crop.y = Math.max(-1, Math.round((crop.y - 0.03) * 1000) / 1000)
            else if (direction === 'down') crop.y = Math.min(1, Math.round((crop.y + 0.03) * 1000) / 1000)
            else if (direction === 'left') crop.x = Math.max(-1, Math.round((crop.x - 0.03) * 1000) / 1000)
            else if (direction === 'right') crop.x = Math.min(1, Math.round((crop.x + 0.03) * 1000) / 1000)
            node('zoom').value = crop.zoom; changed()
          }
        })
        node('confirm').onclick = confirm
        dialog.onkeydown = function (event) {
          if (event.key === 'Escape') { event.preventDefault(); if(!confirming)close('cancel'); return }
          if (event.key !== 'Tab') return
          var controls = Array.prototype.filter.call(dialog.querySelectorAll('button:not([disabled]):not([hidden]),input:not([disabled])'),function(item){return item.getClientRects().length}), first = controls[0], last = controls[controls.length - 1]
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
        }
        dialog.querySelector('h2').focus()
      }
      if (message) {
        node('status').textContent = message; node('motion').hidden = false
        node('image').hidden = true; node('controls').hidden = true; node('confirm').disabled = true; node('retry').hidden = true
        node('canvas').hidden=true;scene=null;drawnCrop='';redraw=false;node('stage').setAttribute('aria-busy','true');node('replace').disabled=true;node('camera').disabled=true
        node('confirm').textContent=options.confirmText?options.confirmText():'确认使用'
      }
    }
    function fail(error) {
      if (!open || !active()) return
      node('motion').hidden = true; node('stage').setAttribute('aria-busy','false'); node('confirm').disabled = true
      node('replace').disabled=false;node('camera').disabled=false
      node('retry').hidden = !options.getPayload().portraitId
      node('status').textContent = error.message || '生成失败，请重试'
      if (options.onError) options.onError(error)
    }
    function changed() {
      confirmed = null; node('confirm').disabled = true
      redraw=true;if(!frame)frame=requestAnimationFrame(drawLocal)
      if (options.onDirty) options.onDirty()
      if(options.onCrop)options.onCrop(crop)
    }
    function drawLocal(){
      frame=0;if(!open||!active()||!scene)return
      if(drawing){redraw=true;return}
      drawing=true;redraw=false
      var generation=epoch,pose=JSON.stringify(crop),current=Object.assign({},scene,{crop:Object.assign({},crop)})
      window.SxfDynamicCard.web(current,resources).then(function(canvas){
        if(!open||!active()||generation!==epoch)return
        if(pose!==JSON.stringify(crop)){redraw=true;return}
        var target=node('canvas');target.width=canvas.width;target.height=canvas.height;target.getContext('2d').drawImage(canvas,0,0)
        target.hidden=false;node('image').hidden=true;node('motion').hidden=true;node('controls').hidden=false;node('zoom').value=crop.zoom
        drawnCrop=pose;node('confirm').disabled=confirming;node('replace').disabled=confirming;node('camera').disabled=confirming;node('stage').setAttribute('aria-busy','false');node('status').textContent=(snapshot.tournamentName?snapshot.tournamentName+' · ':'')+'调整人像后确认'
      }).catch(function(error){if(generation===epoch)fail(error)}).finally(function(){drawing=false;if(redraw&&open&&active())frame=requestAnimationFrame(drawLocal)})
    }
    function pump(refresh) {
      if (!open || !active() || busy) { queued = true; return }
      queued = false; busy = true; confirmed = null
      node('confirm').disabled = true; node('retry').hidden = true; node('stage').setAttribute('aria-busy','true')
      var payload = options.getPayload(), requestEpoch = epoch, requestKey = key(), requestCrop = crop ? {zoom:crop.zoom,x:crop.x,y:crop.y} : null
      var start = Date.now(), initial = node('image').hidden
      options.api('serviceEntryPlayerCard', Object.assign({}, payload, {draft:true,editorScene:true,refreshScore:refresh===true}, requestCrop?{crop:requestCrop}:{})).then(function (result) {
        return new Promise(function (resolve,reject) {
          if(result.cardScene){setTimeout(function(){resolve(result)},initial?Math.max(0,400-(Date.now()-start)):0);return}
          var picture = new Image()
          picture.onload = function () { setTimeout(function () { resolve(result) },initial?Math.max(0,500-(Date.now()-start)):0) }
          picture.onerror = function () { reject(new Error('卡片图片加载失败，请重新生成')) }
          picture.src = result.imageData
        })
      }).then(function (result) {
        if (!open || !active() || requestEpoch!==epoch) return
        if (requestKey !== key()) {queued=true;return}
        if (queued || requestCrop && JSON.stringify(requestCrop) !== JSON.stringify(crop)) return
        snapshot = result; crop = result.crop;lastPortrait=payload.portraitId
        if(!result.cardScene||!window.SxfDynamicCard)throw new Error('实时预览未就绪，请刷新后重试')
        scene=result.cardScene;resources=resources||window.SxfDynamicCard.createWebResources();redraw=true;drawLocal()
      }).catch(function(error){if(requestEpoch===epoch)fail(error)}).finally(function () {
        busy = false
        if (queued && open && active()) pump()
      })
    }
    function generate(refresh) {
      if (!active()) return
      var retained = confirmed && confirmed.key === key() ? confirmed.crop : lastPortrait===options.getPayload().portraitId?crop:options.getPayload().crop||null
      if(lastPortrait&&lastPortrait!==options.getPayload().portraitId){retained=null;resources=null}
      begin('正在生成初始球员卡…'); crop = retained; snapshot = null; confirmed = null
      if (options.onDirty) options.onDirty()
      pump(refresh)
    }
    function confirm() {
      if (!snapshot || busy || confirming || queued || drawing || redraw || drawnCrop!==JSON.stringify(crop) || !open || !active()) return
      confirming=true;node('back').disabled=true
      node('replace').disabled=true;node('camera').disabled=true
      Array.prototype.forEach.call(node('controls').querySelectorAll('button,input'),function(item){item.disabled=true})
      var payloadKey = key(), confirmEpoch = epoch, button = node('confirm'); button.disabled = true; button.textContent = '确认中…'
      options.api('serviceEntryPlayerCard', Object.assign({},options.getPayload(),{draft:true,confirm:true,previewToken:snapshot.previewToken,crop:crop})).then(function (result) {
        if (!active() || epoch!==confirmEpoch || key() !== payloadKey) throw new Error('资料已变化，请重新生成后确认')
        confirmed = {token:result.previewToken,key:payloadKey,crop:result.crop,imageData:result.imageData||snapshot.imageData}
        close('confirmed'); if (options.onConfirmed) options.onConfirmed(confirmed)
      }).catch(function(error){fail(error);if(dialog)node('confirm').textContent=options.confirmText?options.confirmText():'确认使用'}).finally(function(){confirming=false;if(dialog){node('back').disabled=false;Array.prototype.forEach.call(node('controls').querySelectorAll('button,input'),function(item){item.disabled=false})}})
    }
    function restore(previous){
      if(!active()||!previous||!previous.previewToken)return
      var payloadKey=key(),generation=epoch
      options.api('serviceEntryPlayerCard',Object.assign({},options.getPayload(),{draft:true,confirm:true,restore:true,previewToken:previous.previewToken,crop:previous.crop})).then(function(result){
        if(!active()||generation!==epoch||payloadKey!==key())return
        crop=result.crop;lastPortrait=options.getPayload().portraitId;confirmed={token:result.previewToken,key:payloadKey,crop:result.crop,imageData:result.imageData}
        if(options.onConfirmed)options.onConfirmed(confirmed)
      }).catch(function(error){if(active()&&generation===epoch){if(options.onDirty)options.onDirty();if(options.onError)options.onError(error)}})
    }
    return {begin:begin,generate:generate,fail:fail,close:close,restore:restore,isOpen:function(){return open},dispose:function(){dead=true;close()},invalidate:function(){confirmed=null;if(options.onDirty)options.onDirty()},crop:function(){return crop},isConfirmed:function(){try{return Boolean(confirmed&&confirmed.key===key())}catch(error){return false}},token:function(){return confirmed?confirmed.token:''}}
  }
})()
