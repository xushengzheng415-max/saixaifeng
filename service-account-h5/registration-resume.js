(function(){
 'use strict'
 var API='https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi',KEY='sxf_referee_h5_session',GATE_KEY='sxf_resume_gate',status=document.getElementById('status'),content=document.getElementById('content'),authorizing=false
 function esc(v){return String(v==null?'':v).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
 function stored(){try{return localStorage.getItem(KEY)||''}catch(e){return ''}}
 // 驳回通知带的 gate 参数在微信授权跳转中会丢失（授权回跳只带回 code/state），
 // 所以先进会话存储，授权完成后再按它定位被驳回的那条登记。
 function gateStored(){try{return sessionStorage.getItem(GATE_KEY)||''}catch(e){return ''}}
 function gateSave(value){try{if(value)sessionStorage.setItem(GATE_KEY,value);else sessionStorage.removeItem(GATE_KEY)}catch(e){}}
 function api(action,data){
  var controller=typeof AbortController==='function'?new AbortController():null,timer
  var request=fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({action:action,serviceSessionToken:stored()},data||{})),signal:controller?controller.signal:undefined}).then(function(r){return r.json()}).then(function(r){if(typeof r.body==='string')r=JSON.parse(r.body);if(!r.success){var e=new Error(r.error||r.message||'读取失败，请重试');e.code=r.code;throw e}return r})
  return Promise.race([request,new Promise(function(resolve,reject){timer=setTimeout(function(){if(controller)controller.abort();reject(new Error('连接超时，请重试'))},20000)})]).finally(function(){clearTimeout(timer)})
 }
 function error(e,retry){status.textContent=e.message||'连接失败，请重试';status.className='error';content.hidden=false;content.innerHTML='<button id="retryResume" class="secondary wide" type="button">重新连接</button>';document.getElementById('retryResume').onclick=retry||load}
 function oauth(){
  if(authorizing)return
  authorizing=true;status.textContent='正在连接微信…'
  api('servicePrivateOAuthUrl',{returnUrl:location.origin+location.pathname}).then(function(r){location.replace(r.authorizeUrl)}).catch(function(e){authorizing=false;error(e,oauth)})
 }
 function openEntry(id,button){
  button.disabled=true;button.textContent='正在打开…'
  api('servicePrivateResumeRegistration',{registrationId:id}).then(function(r){
   var key='sxf_entry_session_'+r.entry
   try{localStorage.setItem(key,JSON.stringify({token:r.serviceEntrySession,proof:'',expiresAt:new Date(r.expiresAt).getTime()}))}catch(e){}
   try{sessionStorage.setItem(key,r.serviceEntrySession)}catch(e){}
   location.assign('./join-player.html?entry='+encodeURIComponent(r.entry)+'&v=20261103-memberpay1')
  }).catch(function(e){if(e.code==='SERVICE_PRIVATE_AUTH_REQUIRED')return oauth();error(e,load)})
 }
 function statusLabel(row){return row.status==='registered'?'已登记':(row.status==='rejected'?'资料被驳回':'待提交')}
 // 被驳回的那条也要成卡片：驳回时服务端已清空草稿，只留驳回印记，
 // 必须让球员在落地页就能看到「被哪支队驳回、什么原因、可以重新填写」。
 function entryHtml(row,index){
  var name=esc(row.playerName||row.teamName||'球员登记'),team=esc(row.teamName||'')
  var subtitle=(row.playerName&&team?team+' · ':'')+statusLabel(row)
  var reason=row.rejectReason?'<p class="resume-reject">驳回原因：'+esc(row.rejectReason)+'</p>':''
  var action=row.status==='registered'?'查看球员卡':(row.status==='rejected'?'重新填写':'继续填写')
  return '<section class="resume-entry'+(row.status==='rejected'?' is-rejected':'')+'"><h2>'+name+'</h2><p>'+subtitle+'</p>'+reason+'<button class="wide" type="button" data-resume="'+index+'">'+action+'</button></section>'
 }
 function load(){
  var gate=gateStored()
  status.className='';status.textContent='正在读取登记记录…';content.hidden=true
  api('servicePrivateRegistrationList',{gate:gate}).then(function(r){
   if(r.needsBinding){status.textContent='请先从球队邀请验证手机号';return}
   var rows=r.entries||[];gateSave('')
   status.textContent=rows.length?'':(gate?'该登记已结束或不可继续，请重新扫码':'暂无可继续的登记')
   content.hidden=false
   content.innerHTML=rows.map(entryHtml).join('')
   Array.prototype.forEach.call(content.querySelectorAll('[data-resume]'),function(button){button.onclick=function(){openEntry(rows[Number(button.getAttribute('data-resume'))].id,button)}})
  }).catch(function(e){if(e.code==='SERVICE_PRIVATE_AUTH_REQUIRED')return oauth();error(e,load)})
 }
 var query=new URLSearchParams(location.search)
 if(/^[a-f0-9]{32}$/.test(query.get('gate')||''))gateSave(query.get('gate'))
 if(query.get('code')&&query.get('state')){
  api('servicePrivateOAuth',{code:query.get('code'),state:query.get('state')}).then(function(r){localStorage.setItem(KEY,r.refereeSessionToken);history.replaceState({},document.title,location.pathname);load()}).catch(function(e){error(e,oauth)})
 }else if(stored())load();else oauth()
})()
