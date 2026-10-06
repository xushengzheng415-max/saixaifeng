(function(root){
  'use strict'
  var TIER_NAMES={bronze:'铜卡',silver:'银卡',gold:'金卡'}
  function html(v){return String(v||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function clamp(v,a,b){return Math.max(a,Math.min(b,Number(v)||0))}
  function open(options){
    options=options||{};var player=options.player||{},templates=options.templates||{},draft=options.draft||{},tier=player.cardTier||'',backgroundId=draft.backgroundId||player.backgroundId||tier
    var crop=Object.assign({zoom:1,x:0,y:0},draft.crop||options.initialCrop||{}),baseCrop=Object.assign({},crop),busy=false,closed=false,requestId=0,previewId=0,preview=null,timer=null,drag=null
    var overflow=document.body.style.overflow,previousFocus=document.activeElement
    var overlay=document.createElement('div');overlay.className='pc-editor';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','编辑球员卡')
    overlay.innerHTML='<section class="pc-sheet"><header class="pc-header"><button data-pc="close" type="button" aria-label="返回">‹</button><h1>编辑球员卡</h1><span>'+html(player.name)+'</span></header><main class="pc-main"><div class="pc-grade"><b>'+html(TIER_NAMES[tier]||'等级待核定')+'</b></div><div class="pc-workspace"><div class="pc-preview"><img data-pc="image" alt="服务端球员卡预览" hidden></div><div class="pc-controls"><label>人物大小 <input data-pc="zoom" type="range" min="100" max="400" step="1"></label><label>横向位置 <input data-pc="x" type="number" min="-2" max="2" step="0.02"></label><label>纵向位置 <input data-pc="y" type="number" min="-2" max="2" step="0.02"></label><label>卡片背景 <select data-pc="background"></select></label><button data-pc="reset" type="button">恢复构图</button><p data-pc="status" class="pc-status" role="status"></p></div></div><footer class="pc-footer"><button data-pc="export" type="button" disabled>查看大图</button><button data-pc="save" type="button" class="pc-save" disabled>'+html(options.saveText||'保存球员卡')+'</button></footer></main></section>'
    document.body.appendChild(overlay);document.body.style.overflow='hidden';var $=function(k){return overlay.querySelector('[data-pc="'+k+'"]')}
    var select=$('background');Object.keys(templates).forEach(function(type){if(TIER_NAMES[type]){var opt=document.createElement('option');opt.value=type;opt.textContent=templates[type].title||TIER_NAMES[type];select.appendChild(opt)}});select.value=backgroundId;select.disabled=player.playerCard?.canChangeBackground!==true
    function status(message,error){$('status').textContent=message||'';$('status').classList.toggle('error',!!error)}
    function values(){return {mode:'portrait',tier:tier,backgroundId:backgroundId,crop:Object.assign({},crop),layout:{},expectedTemplateId:templates[backgroundId]?.templateId,expectedTemplateVersion:templates[backgroundId]?.version}}
    function controls(){crop.zoom=clamp(crop.zoom,1,4);crop.x=clamp(crop.x,-2,2);crop.y=clamp(crop.y,-2,2);$('zoom').value=Math.round(crop.zoom*100);$('x').value=crop.x.toFixed(2);$('y').value=crop.y.toFixed(2);$('save').disabled=busy||previewId!==requestId||!preview;$('export').disabled=previewId!==requestId||!preview}
    function schedule(){requestId++;preview=null;controls();clearTimeout(timer);timer=setTimeout(render,350)}
    function render(){
      var id=requestId;status('正在生成预览…')
      if(!tier||!templates[backgroundId]||!options.onPreview){status('此卡种尚未发布或等级待核定',true);return}
      Promise.resolve().then(function(){return options.onPreview(values())}).then(function(result){
        if(closed||id!==requestId)return;if(!result?.success||!result.imageData)throw new Error(result?.error||'预览读取失败')
        preview=result;previewId=id;$('image').src=result.imageData;$('image').hidden=false;status('拖动卡面可调整人物位置');controls()
      }).catch(function(error){if(!closed&&id===requestId){status(error.message||'预览失败，请重试',true);controls()}})
    }
    function close(){if(closed)return;closed=true;requestId++;clearTimeout(timer);endDrag();document.removeEventListener('keydown',onKey);overlay.remove();document.body.style.overflow=overflow;if(previousFocus?.focus)previousFocus.focus();if(options.onClose)options.onClose()}
    function onKey(event){if(event.key==='Escape'&&!busy)close();if(event.key==='Tab'){var nodes=Array.from(overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)'));if(event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes[nodes.length-1]?.focus()}else if(!event.shiftKey&&document.activeElement===nodes[nodes.length-1]){event.preventDefault();nodes[0]?.focus()}}}
    $('close').onclick=function(){if(!busy)close()};document.addEventListener('keydown',onKey);$('close').focus()
    $('zoom').oninput=function(){crop.zoom=Number($('zoom').value)/100;schedule()};['x','y'].forEach(function(k){$(k).onchange=function(){crop[k]=Number($(k).value);schedule()}})
    select.onchange=function(){if(select.disabled)return;backgroundId=select.value;schedule()};$('reset').onclick=function(){crop=Object.assign({},baseCrop);schedule()}
    function move(event){if(!drag||busy)return;crop.x=drag.x+(event.clientX-drag.cx)/(drag.width*264/300);crop.y=drag.y+(event.clientY-drag.cy)/(drag.height*300/430);schedule()}
    function endDrag(){drag=null;window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',endDrag);window.removeEventListener('pointercancel',endDrag)}
    $('image').onpointerdown=function(event){if(busy)return;event.preventDefault();var rect=$('image').getBoundingClientRect();drag={cx:event.clientX,cy:event.clientY,x:crop.x,y:crop.y,width:rect.width,height:rect.height};window.addEventListener('pointermove',move);window.addEventListener('pointerup',endDrag);window.addEventListener('pointercancel',endDrag)}
    $('export').onclick=function(){if(!preview)return;var viewer=document.createElement('div');viewer.className='pc-full-preview';var image=new Image();image.src=preview.imageData;image.alt='完整球员卡';var back=document.createElement('button');back.textContent='返回编辑';viewer.appendChild(image);viewer.appendChild(back);overlay.appendChild(viewer);back.onclick=function(){viewer.remove()};back.focus()}
    $('save').onclick=function(){if(busy||!preview||previewId!==requestId)return;busy=true;controls();status('正在保存…');var payload=values();payload.expectedTemplateId=preview.templateId;payload.expectedTemplateVersion=preview.publishedVersion;payload.cardData=preview.imageData
      Promise.resolve().then(function(){return options.onSave?.(payload)}).then(function(){busy=false;close()}).catch(function(error){busy=false;controls();status(error.message||'保存失败，请重试',true)})}
    schedule();return {close:close}
  }
  root.SxfPlayerCardEditor={open:open}
})(typeof window!=='undefined'?window:globalThis)
