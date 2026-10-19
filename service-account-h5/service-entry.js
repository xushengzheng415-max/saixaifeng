(function () {
  'use strict'
  var mode = window.SXF_SERVICE_ENTRY_MODE
  var apiUrl = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
  var query = new URLSearchParams(location.search)
  var entry = query.get('entry') || ''
  var proof = query.get('proof') || sessionStorage.getItem('sxf_entry_proof_' + entry) || ''
  var key = 'sxf_entry_session_' + entry
  var status = document.getElementById('status')
  var content = document.getElementById('content')
  var smsTimer = null
  var playerContext = null
  var persistActiveDraft=null,draftTimer=null
  function readStored(storage,name){try{return storage.getItem(name)||''}catch(error){return ''}}
  function writeStored(storage,name,value){try{if(value)storage.setItem(name,value);else storage.removeItem(name)}catch(error){}}
  function rememberSession(token){writeStored(sessionStorage,key,token);writeStored(localStorage,key,JSON.stringify({token:token,proof:proof,expiresAt:Date.now()+12*60*60*1000}))}
  function savedSession(){try{var saved=JSON.parse(readStored(localStorage,key)||'null');if(saved&&saved.expiresAt>Date.now()){if(!proof)proof=saved.proof||'';return saved.token||''}writeStored(localStorage,key,'')}catch(error){}return ''}
  if (proof) sessionStorage.setItem('sxf_entry_proof_' + entry, proof)

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"]/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]
    })
  }
  function say(message, error) {
    status.textContent = message || ''
    status.className = error ? 'error' : ''
  }
  function api(action, data) {
    var milliseconds=action==='serviceEntryCheckPlayerNumber'?12000:(action==='serviceEntryUploadPhoto'||action==='serviceEntryPlayerCard'?60000:action==='serviceEntryContext'?15000:0)
    var controller=milliseconds&&typeof AbortController==='function'?new AbortController():null,timer=null
    var request=fetch(apiUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({action:action},data||{})),keepalive:action==='serviceEntrySavePlayerDraft',signal:controller?controller.signal:undefined}).then(function(response){return response.json()}).then(function(response){
      var result=response&&typeof response.body==='string'?JSON.parse(response.body):response
      if(!result||!result.success){var error=new Error(result&&(result.error||result.message)||'服务暂不可用');error.code=result&&result.code;throw error}
      return result
    })
    if(!milliseconds)return request
    var timeout=new Promise(function(resolve,reject){timer=setTimeout(function(){var error=new Error(action==='serviceEntryCheckPlayerNumber'?'号码校验超时，请重试':action==='serviceEntryContext'?'连接超时，请重新连接':'处理超时，请重试');error.code='REQUEST_TIMEOUT';reject(error);if(controller)controller.abort()},milliseconds)})
    return Promise.race([request,timeout]).finally(function(){clearTimeout(timer)})
  }

  function session() { var token=readStored(sessionStorage,key);if(token){if(!readStored(localStorage,key))rememberSession(token);return token}return savedSession() }
  function stopSmsTimer() {
    if (smsTimer) clearInterval(smsTimer)
    smsTimer = null
  }
  function beginSmsCountdown(button) {
    stopSmsTimer()
    var remaining = 30
    button.disabled = true
    button.textContent = '已发送 ' + remaining + '秒'
    smsTimer = setInterval(function () {
      remaining -= 1
      if (remaining > 0) {
        button.textContent = '已发送 ' + remaining + '秒'
      } else {
        stopSmsTimer()
        button.disabled = false
        button.textContent = '重新发送'
      }
    }, 1000)
  }

  function showPhone() {
    stopSmsTimer()
    say('请验证登记手机号')
    content.hidden = false
    content.innerHTML =
      '<div class="row"><label for="phone">手机号</label><input id="phone" type="tel" inputmode="numeric" maxlength="11" autocomplete="tel"></div>' +
      '<div class="row"><label for="code">验证码</label><div class="actions"><input id="code" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code"><button id="send" type="button" class="secondary">获取验证码</button></div></div>' +
      '<button id="verify" class="wide" type="button">验证并继续</button>'
    var send = document.getElementById('send')
    var verify = document.getElementById('verify')
    send.onclick = function () {
      var phone = document.getElementById('phone').value.trim()
      if (!/^1[3-9]\d{9}$/.test(phone)) return say('请输入正确的手机号', true)
      send.disabled = true
      send.textContent = '发送中…'
      api('serviceEntrySendSms', { serviceEntrySession: session(), phone: phone }).then(function () {
        say('验证码已发送')
        beginSmsCountdown(send)
      }).catch(function (error) {
        send.disabled = false
        send.textContent = '获取验证码'
        say(error.message, true)
      })
    }
    verify.onclick = function () {
      verify.disabled = true
      verify.textContent = '验证中…'
      api('serviceEntryVerifySms', {
        serviceEntrySession: session(),
        phone: document.getElementById('phone').value.trim(),
        code: document.getElementById('code').value.trim()
      }).then(function () {
        stopSmsTimer()
        load()
      }).catch(function (error) {
        verify.disabled = false
        verify.textContent = '验证并继续'
        say(error.message, true)
      })
    }
  }

  function showClaim(data) {
    stopSmsTimer()
    say(data.teams.length ? '核对球队后确认认领' : '该手机号没有待认领球队，请联系主办方核对报名表')
    content.hidden = false
    content.innerHTML =
      '<h2>' + esc(data.tournamentName) + '</h2>' +
      '<label class="check"><input id="disclaimer" type="checkbox">我已阅读并同意参赛免责声明</label>' +
      data.teams.map(function (team) {
        var detail = [team.city, team.managerName].filter(Boolean).join(' · ')
        return '<section class="team"><strong>' + esc(team.teamName) + '</strong>' +
          '<small>' + esc(team.divisionName) + ' · ' + esc(team.status) + '</small>' +
          (detail ? '<small>' + esc(detail) + '</small>' : '') +
          '<button class="wide" data-invite="' + esc(team.inviteId) + '"' +
          (team.status === '需人工核验' ? ' disabled' : '') + '>' +
          (team.status === '已认领' ? '查看认领结果' : '确认认领') +
          '</button></section>'
      }).join('')
    Array.prototype.forEach.call(content.querySelectorAll('button[data-invite]'), function (button) {
      button.onclick = function () {
        if (!document.getElementById('disclaimer').checked) return say('请先阅读并同意参赛免责声明', true)
        button.disabled = true
        api('serviceEntryClaimTeam', {
          serviceEntrySession: session(),
          inviteId: button.getAttribute('data-invite'),
          disclaimerAgreed: true
        }).then(function (result) {
          say('球队已认领')
          content.innerHTML = '<h2>' + esc(result.teamName || '球队') + '</h2><p>认领完成，可返回微信继续。</p>'
        }).catch(function (error) {
          button.disabled = false
          say(error.message, true)
        })
      }
    })
  }

  function showPlayerSearch(data) {
    playerContext = data
    stopSmsTimer()
    say('先查找本队已有球员')
    content.hidden = false
    content.innerHTML = '<h2>'+esc(data.teamName)+'</h2><form id="searchForm"><div class="row"><label for="playerQuery">身份证号或姓名</label><input id="playerQuery" maxlength="30" autocomplete="off" required></div><button class="wide" id="searchPlayers" type="submit">查找球员</button></form><div id="playerCandidates"></div>'
    var queryInput=document.getElementById('playerQuery'), list=document.getElementById('playerCandidates')
    function select(mode,playerId,button) {
      var identity=document.getElementById('claimIdentity')
      var idCard=identity?identity.value.trim().toUpperCase():queryInput.value.trim().toUpperCase()
      button.disabled=true
      api('serviceEntrySelectPlayer',{serviceEntrySession:session(),mode:mode,playerId:playerId||'',idCard:idCard}).then(function(result){
        if(mode==='restore')return showRestoreConfirm(Object.assign({},data,{selection:result}))
        showPlayer(Object.assign({},data,{selection:result,idCard:/^\d{17}[\dX]$/.test(idCard)?idCard:'',initialName:mode==='new'&&!/^\d/.test(queryInput.value)?queryInput.value.trim():''}))
      }).catch(function(error){button.disabled=false;say(error.message,true)})
    }
    document.getElementById('searchForm').onsubmit=function(event){
      event.preventDefault()
      var button=document.getElementById('searchPlayers');button.disabled=true;list.innerHTML=''
      api('serviceEntrySearchPlayers',{serviceEntrySession:session(),query:queryInput.value.trim()}).then(function(result){
        var players=result.players||[], restorable=result.restorable
        list.innerHTML='<h3 class="search-heading">'+(players.length?'选择球员档案':restorable?'找到本人历史档案':'未找到本队档案')+'</h3>'+
          players.map(function(player){return '<section class="candidate"><div><strong>'+esc(player.name)+'</strong><small>'+esc([player.birthYear?player.birthYear+'年生':'',player.jerseyNumber!==''?player.jerseyNumber+'号':'',player.idCardMasked].filter(Boolean).join(' · '))+'</small></div><button type="button" data-player="'+esc(player.id)+'">认领</button></section>'}).join('')+
          (restorable?'<section class="candidate"><div><strong>'+esc(restorable.name)+'</strong><small>'+esc([restorable.birthYear?restorable.birthYear+'年生':'',restorable.jerseyNumber!==''?restorable.jerseyNumber+'号':'',restorable.idCardMasked,restorable.transfer?'目前在'+(restorable.fromTeamName||'其他球队'):'此前已离开球队'].filter(Boolean).join(' · '))+'</small></div><button type="button" data-restore="'+esc(restorable.id)+'">'+(restorable.transfer?'转入本队':'恢复入队')+'</button></section>':'')+
          (players.length?'<div class="row"><label for="claimIdentity">核对球员身份证号</label><input id="claimIdentity" maxlength="18" autocomplete="off" value="'+esc(/^\d{17}[\dX]$/.test(queryInput.value.trim().toUpperCase())?queryInput.value.trim().toUpperCase():'')+'"></div>':'')+
          (result.targeted?'':'<button id="createPlayer" type="button" class="wide secondary">'+(players.length||restorable?'都不是本人，新建球员':'新建球员')+'</button>')
        Array.prototype.forEach.call(list.querySelectorAll('[data-player]'),function(b){b.onclick=function(){select('claim',b.getAttribute('data-player'),b)}})
        Array.prototype.forEach.call(list.querySelectorAll('[data-restore]'),function(b){b.onclick=function(){select('restore',b.getAttribute('data-restore'),b)}})
        var create=document.getElementById('createPlayer');if(create)create.onclick=function(){select('new','',create)}
        say(players.length?'请核对档案后选择认领':restorable?'请确认是否本人档案':'未找到，可新建球员')
      }).catch(function(error){say(error.message,true)}).finally(function(){button.disabled=false})
    }
    if(data.targetedPlayer){queryInput.required=false;document.getElementById('searchForm').dispatchEvent(new Event('submit',{cancelable:true}))}
  }
  // 递卡确认（2026-10-18 新模型）：个人资料只读，被占球衣号可改、形象照可换，确认即恢复在队关系。
  function showRestoreConfirm(data) {
    stopSmsTimer()
    say('确认本人球员档案')
    var player=data.selection.player||{}, positionText={GK:'守门员',DF:'后卫',MF:'中场',FW:'前锋'}[player.position]||''
    content.hidden=false
    content.innerHTML='<h2>'+esc(data.teamName)+'</h2><button class="text-action" id="backToSearch" type="button">重新查找</button>'+
      (player.transfer?'<p class="field-hint muted">该球员目前在 '+esc(player.fromTeamName||'其他球队')+'，确认后将转出并加入本队</p>':'')+
      '<section class="candidate"><div><strong>'+esc(player.name||'球员')+'</strong><small>'+esc([player.birthDate||'',player.idCardMasked||'',positionText].filter(Boolean).join(' · '))+'</small></div></section>'+
      '<form id="restoreForm">'+
      '<div class="row"><label for="restoreNumber">球衣号码</label><input id="restoreNumber" required type="number" inputmode="numeric" min="0" max="99" placeholder="0-99" value="'+esc(player.jerseyNumber||'')+'"><small id="restoreNumberError" class="field-error" role="alert" hidden></small></div>'+
      '<div class="row"><label>形象照<small class="muted">（'+(player.hasPhoto?'可保留原照或更换':'需上传')+'）</small></label>'+
      '<div class="photo-picker"><img id="restorePhotoPreview" alt="形象照预览" hidden><div class="photo-side">'+
      '<input id="restorePhoto" type="file" accept="image/*" hidden><input id="restorePhotoCamera" type="file" accept="image/*" capture="user" hidden>'+
      '<div class="photo-actions"><button id="restorePhotoTake" type="button">拍摄形象照</button><button id="restorePhotoPick" type="button" class="secondary">相册上传</button></div>'+
      '<small id="restorePhotoState" class="muted">'+(player.hasPhoto?'暂不上传则保留原照':'尚未拍摄或上传')+'</small></div></div></div>'+
      '<div class="row"><label class="check"><input id="restoreAgree" type="checkbox">本人或监护人确认资料使用授权</label></div>'+
      '<button class="wide" type="submit">'+(player.transfer?'确认转入':'确认恢复入队')+'</button></form>'
    var formElement=document.getElementById('restoreForm')
    function activeForm(){return document.getElementById('restoreForm')===formElement}
    document.getElementById('backToSearch').onclick=function(){showPlayerSearch(data)}
    var jerseyField=document.getElementById('restoreNumber'), jerseyError=document.getElementById('restoreNumberError'), numberSerial=0, numberTimer=null
    function numberError(message){if(!activeForm())return;jerseyError.textContent=message||'';jerseyError.hidden=!message}
    function checkNumber(){
      if(!activeForm())return
      var value=jerseyField.value.trim(),request=++numberSerial
      if(!value){numberError('请填写球衣号码');return}
      if(!/^\d{1,3}$/.test(value)||Number(value)>99){numberError('球衣号码请填写0至99');return}
      api('serviceEntryCheckPlayerNumber',{serviceEntrySession:session(),choiceToken:data.selection.choiceToken,jerseyNumber:value}).then(function(result){if(activeForm()&&request===numberSerial&&jerseyField.value.trim()===value)numberError(result.available?'':result.message)}).catch(function(error){if(activeForm()&&request===numberSerial)numberError(error.code?error.message:'号码校验失败，请重试')})
    }
    jerseyField.addEventListener('input',function(){numberSerial++;numberError('');clearTimeout(numberTimer);numberTimer=setTimeout(checkNumber,400)})
    jerseyField.addEventListener('blur',function(){var value=jerseyField.value.trim();if(/^\d{1,3}$/.test(value)&&Number(value)<=99)jerseyField.value=String(Number(value));clearTimeout(numberTimer);checkNumber()})
    var portraitId='', photoPending=false
    var photoInput=document.getElementById('restorePhoto'), photoCamera=document.getElementById('restorePhotoCamera')
    var photoPreview=document.getElementById('restorePhotoPreview'), photoState=document.getElementById('restorePhotoState')
    document.getElementById('restorePhotoPick').onclick=function(){if(!photoPending)photoInput.click()}
    document.getElementById('restorePhotoTake').onclick=function(){if(!photoPending)photoCamera.click()}
    function readAsDataURL(file){return new Promise(function(resolve,reject){var reader=new FileReader();reader.onerror=function(){reject(new Error('图片读取失败，请重试'))};reader.onload=function(){resolve(reader.result)};reader.readAsDataURL(file)})}
    function compressImage(dataUrl){return new Promise(function(resolve,reject){var image=new Image();image.onerror=function(){reject(new Error('图片无法识别，请换一张'))};image.onload=function(){var maxSide=800,scale=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',0.85))};image.src=dataUrl})}
    function handlePhotoFile(file,sourceInput){
      if(!file)return
      if(!/^image\//.test(file.type)){sourceInput.value='';return say('请选择图片文件',true)}
      photoPending=true;photoState.textContent='正在上传并抠图…';photoState.className='muted'
      readAsDataURL(file).then(compressImage).then(function(dataUrl){photoPreview.src=dataUrl;photoPreview.hidden=false;return api('serviceEntryUploadPhoto',{serviceEntrySession:session(),base64Data:dataUrl})}).then(function(result){
        if(!activeForm())return
        portraitId=result.portraitId||'';photoPreview.src=result.transparentPreview;photoPreview.hidden=false
        photoState.textContent='照片已处理，确认后使用新照';photoState.className='success'
      }).catch(function(error){if(activeForm()){photoState.textContent=portraitId?'更换失败，已保留原照':'抠图失败，请重试';photoState.className='muted';say(error.message,true)}}).finally(function(){photoPending=false;photoInput.value='';photoCamera.value=''})
    }
    photoInput.onchange=function(){handlePhotoFile(photoInput.files&&photoInput.files[0],photoInput)}
    photoCamera.onchange=function(){handlePhotoFile(photoCamera.files&&photoCamera.files[0],photoCamera)}
    formElement.onsubmit=function(event){
      event.preventDefault()
      if(jerseyError.textContent){jerseyField.focus();return}
      if(!player.hasPhoto&&!portraitId){say('请先拍摄或上传形象照',true);return}
      var button=formElement.querySelector('button[type="submit"]');button.disabled=true
      api('serviceEntryConfirmRestore',{serviceEntrySession:session(),choiceToken:data.selection.choiceToken,jerseyNumber:jerseyField.value.trim(),portraitId:portraitId,authorizationAgreed:document.getElementById('restoreAgree').checked}).then(function(){
        content.innerHTML='<h2>'+(player.transfer?'已转入本队':'已恢复入队')+'</h2><p class="field-hint muted">'+esc(player.name||'球员')+' 的档案已恢复在本队的在队关系，球队负责人将收到入队通知。</p><a class="entry-return-link" href="./me.html">查看我的球员卡</a>'
        say('操作成功')
      }).catch(function(error){button.disabled=false;if(error.code==='PLAYER_JERSEY_CONFLICT'||error.code==='JERSEY_INVALID')numberError(error.message);say(error.message,true)})
    }
    checkNumber()
  }
  function showRegistrationCard(completed,receipt) {
    say('球员资料已保存')
    content.hidden=false
    content.innerHTML='<h2>球员卡预览</h2><div class="card-stage"><img id="registrationCard" alt="球员卡预览" hidden><span id="cardState">正在生成球员卡…</span></div><div class="crop-controls"><label for="cropZoom">人像大小</label><input id="cropZoom" type="range" min="1" max="4" step="0.02" value="1"><label for="cropX">左右位置</label><input id="cropX" type="range" min="-1" max="1" step="0.01" value="0"><label for="cropY">上下位置</label><input id="cropY" type="range" min="-1" max="1" step="0.01" value="0"></div><div class="actions"><button id="retryCard" class="secondary" type="button">重新预览</button><button id="saveCard" type="button" disabled>保存位置</button></div><button id="addAnother" class="text-action wide" type="button">登记其他球员</button>'
    var img=document.getElementById('registrationCard'),state=document.getElementById('cardState'),save=document.getElementById('saveCard'),retry=document.getElementById('retryCard'),snapshot=null,serial=0,localSerial=0,resources=null
    var liveCanvas=document.createElement('canvas');liveCanvas.hidden=true;img.after(liveCanvas)
    function drawCard(){
      if(!snapshot||!snapshot.cardScene)return
      var request=++localSerial;save.disabled=true;save.textContent='保存位置'
      window.SxfDynamicCard.web(Object.assign({},snapshot.cardScene,{crop:crop()}),resources||(resources=window.SxfDynamicCard.createWebResources())).then(function(canvas){if(request!==localSerial||!content.contains(liveCanvas))return;liveCanvas.width=canvas.width;liveCanvas.height=canvas.height;liveCanvas.getContext('2d').drawImage(canvas,0,0);liveCanvas.hidden=false;img.hidden=true;save.disabled=false}).catch(function(error){if(request===localSerial)say(error.message,true)})
    }
    function crop(){return {zoom:Number(document.getElementById('cropZoom').value),x:Number(document.getElementById('cropX').value),y:Number(document.getElementById('cropY').value)}}
    function preview(initial){
      var request=++serial;save.disabled=true;retry.disabled=true;state.hidden=false;state.textContent='正在生成球员卡…'
      api('serviceEntryPlayerCard',Object.assign({serviceEntrySession:session(),editorScene:true},initial?{}:{crop:crop()})).then(function(result){
        if(request!==serial)return
        snapshot=result;img.src=result.imageData;img.hidden=false;state.hidden=true;save.disabled=false
        document.getElementById('cropZoom').value=result.crop.zoom;document.getElementById('cropX').value=result.crop.x;document.getElementById('cropY').value=result.crop.y
        if(result.cardScene)drawCard()
        say(completed ? '' : '可调整人像大小和位置')
      }).catch(function(error){if(request===serial){state.textContent=error.message;say(error.message,true)}}).finally(function(){if(request===serial)retry.disabled=false})
    }
    ;['cropZoom','cropX','cropY'].forEach(function(id){var input=document.getElementById(id);input.oninput=drawCard})
    retry.onclick=function(){preview(false)}
    save.onclick=function(){
      if(!snapshot)return
      save.disabled=true;save.textContent='保存中…'
      api('serviceEntryPlayerCard',{serviceEntrySession:session(),save:true,crop:crop(),expectedVersion:snapshot.version,expectedTemplateId:snapshot.templateId,expectedTemplateVersion:snapshot.templateVersion}).then(function(result){snapshot.version=result.version;save.textContent='已保存';say('球员卡位置已保存')}).catch(function(error){save.disabled=false;save.textContent='保存位置';say(error.message,true)})
    }
    var another=document.getElementById('addAnother');another.hidden=Boolean(playerContext&&playerContext.targetedPlayer);another.onclick=function(){showPlayerSearch(playerContext||{})}
    if(completed){var pendingConfirm=Boolean(receipt&&receipt.pendingTeamConfirm);content.querySelector('h2').textContent=pendingConfirm?'已提交球队确认':'登记成功';content.querySelector('.crop-controls').hidden=true;save.hidden=true;retry.hidden=true;if(pendingConfirm)say('球队负责人确认后正式入队')}
    preview(true)
  }
  function pad(value) { return String(value).padStart(2, '0') }
  function showPlayer(data) {
    stopSmsTimer()
    say(data.selection.mode === 'claim' ? '补齐球员资料' : '填写球员资料')
    content.hidden = false
    content.innerHTML =
      '<h2>' + esc(data.teamName) + '</h2><button class="text-action" id="backToSearch" type="button">重新选择球员</button><form id="form">' +
      '<div class="row"><label for="name">球员姓名</label><input id="name" maxlength="30" required></div>' +
      ((data.cardContexts||[]).length>1?'<div class="row"><label for="cardTournamentId">制卡赛事</label><select id="cardTournamentId" required><option value="">请选择赛事</option>'+data.cardContexts.map(function(item){return '<option value="'+esc(item.tournamentId)+'">'+esc(item.name)+'</option>'}).join('')+'</select></div>':'')+
      '<div class="row"><label for="jerseyName">球衣名<small class="muted">（按姓名自动识别拼音，可修改）</small></label><input id="jerseyName" maxlength="20" autocomplete="off" placeholder="如 ZHENG X.S."></div>' +
      '<div class="row"><label for="idCard">球员身份证号<small class="muted">（自动识别出生日期）</small></label><input id="idCard" required maxlength="18" inputmode="text" autocomplete="off" aria-describedby="idCardHint" placeholder="18 位身份证号"><small id="idCardHint" class="field-hint muted" role="status" hidden></small></div>' +
      '<div class="row"><label>出生日期</label><div class="birth-columns">' +
      '<select id="birthYear" aria-label="出生年份" required><option value="">年</option></select>' +
      '<select id="birthMonth" aria-label="出生月份" required><option value="">月</option></select>' +
      '<select id="birthDay" aria-label="出生日期" required disabled><option value="">日</option></select>' +
      '</div></div>' +
      '<div class="row two-columns"><div><label for="jerseyNumber">球衣号码</label><input id="jerseyNumber" required aria-describedby="jerseyNumberError" type="number" inputmode="numeric" min="0" max="99" placeholder="0-99"><small id="jerseyNumberError" class="field-error" role="alert" hidden></small></div>' +
      '<div><label for="position">场上位置</label><select id="position" required><option value="">请选择</option><option value="GK">守门员</option><option value="DF">后卫</option><option value="MF">中场</option><option value="FW">前锋</option></select></div></div>' +
      '<div class="row two-columns"><div><label for="height">身高 cm</label><input id="height" required type="number" inputmode="numeric" min="50" max="250" placeholder="如 175"></div>' +
      '<div><label for="weight">体重 kg</label><input id="weight" required step="0.1" type="number" inputmode="numeric" min="10" max="200" placeholder="如 65"></div></div>' +
      '<div class="row"><label>形象照<small class="muted">（必填，用于球员卡）</small></label>' +
      '<div class="photo-guide"><img class="photo-example" src="./assets/portrait-example.jpg" alt="形象照示例"><ul class="photo-tips"><li>正面免冠，露出面部和双肩</li><li>光线均匀，背景简洁纯色</li><li>穿球队服或纯色上衣</li></ul></div>' +
      '<div class="photo-picker"><img id="photoPreview" alt="形象照预览" hidden><div class="photo-side">' +
      '<input id="photo" type="file" accept="image/*" hidden>' +
      '<input id="photoCamera" type="file" accept="image/*" capture="user" hidden>' +
      '<div class="photo-actions"><button id="photoTake" type="button">拍摄形象照</button><button id="photoPick" type="button" class="secondary">相册上传</button></div>' +
      '<small id="photoState" class="muted">尚未拍摄或上传</small><button id="editRegistrationCard" type="button" class="text-action" hidden>生成球员卡</button><button id="keepExisting" type="button" class="text-action" hidden>保留原照</button></div></div></div>' +
      '<div id="confirmedRegistrationCard" class="registration-final-card" hidden><img id="confirmedRegistrationCardImage" alt="已确认的完整球员卡"></div>' +
      '<div class="row" id="guardianRow" hidden><label for="guardianRelation">监护关系</label><select id="guardianRelation"><option value="other">其他监护人</option><option value="father">父亲</option><option value="mother">母亲</option></select></div>' +
      '<div class="row"><label class="check"><input id="agree" type="checkbox">本人或监护人确认资料使用授权</label></div>' +
      '<button class="wide" type="submit">'+(data.selection.mode==='claim'?'确认认领':'确认新建')+'</button></form>'
    var formElement=document.getElementById('form')
    function activeForm(){return document.getElementById('form')===formElement}
    document.getElementById('backToSearch').onclick=function(){if(editor)editor.dispose();showPlayerSearch(data)}
    var year = document.getElementById('birthYear')
    var month = document.getElementById('birthMonth')
    var day = document.getElementById('birthDay')
    var guardianRow = document.getElementById('guardianRow')
    var currentYear = new Date().getFullYear()
    var years = ['<option value="">年</option>']
    for (var y = currentYear; y >= 1900; y--) years.push('<option value="' + y + '">' + y + '年</option>')
    year.innerHTML = years.join('')
    var months = ['<option value="">月</option>']
    for (var m = 1; m <= 12; m++) months.push('<option value="' + m + '">' + m + '月</option>')
    month.innerHTML = months.join('')

    function birthDate() {
      var y = Number(year.value), m = Number(month.value), d = Number(day.value)
      if (!y || !m || !d) return ''
      return String(y) + '-' + pad(m) + '-' + pad(d)
    }
    function refreshGuardian() {
      var value = birthDate()
      if (!value) { guardianRow.hidden = true; return }
      var born = new Date(value + 'T00:00:00')
      var now = new Date()
      var age = now.getFullYear() - born.getFullYear()
      if (now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())) age--
      guardianRow.hidden = age >= 18
    }
    function refreshDays() {
      var previous = day.value
      var y = Number(year.value), m = Number(month.value)
      day.innerHTML = '<option value="">日</option>'
      day.disabled = !y || !m
      if (day.disabled) return refreshGuardian()
      var count = new Date(y, m, 0).getDate()
      var days = ['<option value="">日</option>']
      for (var d = 1; d <= count; d++) days.push('<option value="' + d + '">' + d + '日</option>')
      day.innerHTML = days.join('')
      day.value = previous && Number(previous) <= count ? previous : ''
      refreshGuardian()
    }
    year.onchange = refreshDays
    month.onchange = refreshDays
    day.onchange = refreshGuardian

    var idCardInput = document.getElementById('idCard')
    function validateIdentity(finished) {
      var value = idCardInput.value.trim().toUpperCase()
      idCardInput.value = value
      var hint=document.getElementById('idCardHint'),message='',invalid=false,valid=false
      if(!value){message=finished?'请填写18位身份证号':'';invalid=finished}
      else if(!/^\d{0,17}[\dX]?$/.test(value)||value.indexOf('X')!==-1&&value.length!==18){message='前17位须为数字，末位可为数字或X';invalid=true}
      else if(value.length<18){message='已输入'+value.length+'位，还差'+(18-value.length)+'位';invalid=finished}
      else {
        var birth=value.slice(6,10)+'-'+value.slice(10,12)+'-'+value.slice(12,14),date=new Date(birth+'T00:00:00+08:00')
        if(!Number.isFinite(+date)||+date>Date.now()||new Date(+date+8*3600000).toISOString().slice(0,10)!==birth||Number(value.slice(6,10))<1900){message='身份证出生日期不正确，请核对';invalid=true}
        else {
          var weights=[7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2],sum=0
          for(var i=0;i<17;i++)sum+=Number(value[i])*weights[i]
          if('10X98765432'[sum%11]!==value[17]){message='身份证校验不通过，请核对号码';invalid=true}
          else {message='格式校验通过';valid=true}
        }
      }
      hint.textContent=message;hint.hidden=!message;hint.className='field-hint '+(invalid?'field-error':valid?'success':'muted')
      idCardInput.setCustomValidity(valid||!value?'':message||'请填写18位身份证号')
      if(invalid)idCardInput.setAttribute('aria-invalid','true');else idCardInput.removeAttribute('aria-invalid')
      if(!valid)return false
      var y = Number(value.slice(6, 10)), m = Number(value.slice(10, 12)), d = Number(value.slice(12, 14))
      year.value = String(y)
      refreshDays()
      month.value = String(m)
      refreshDays()
      day.value = String(d)
      refreshGuardian()
      return true
    }
    idCardInput.oninput=function(){validateIdentity(false)}
    idCardInput.onchange=function(){validateIdentity(true)}
    idCardInput.onblur=function(){validateIdentity(true)}

    var nameInput = document.getElementById('name')
    var jerseyNameInput = document.getElementById('jerseyName')
    var jerseyNameDirty = false
    // 球衣名自动识别（用户 2026-10-17 确认格式）：二字名→ZHENG S.，三字名→ZHENG S.S.。
    // 词库与 PC 端一致：vendor/tiny-pinyin.js（web-admin-vue 同款 tiny-pinyin）；不支持 Intl.Collator 的老浏览器退回常用字表。
    var tinyPinyinOk = !!(window.tinyPinyin && window.tinyPinyin.isSupported())
    var COMPOUND_SURNAMES = ['司马', '上官', '欧阳', '夏侯', '诸葛', '闻人', '东方', '赫连', '皇甫', '尉迟', '公羊', '澹台', '公冶', '宗政', '濮阳', '淳于', '单于', '太叔', '申屠', '公孙', '仲孙', '轩辕', '令狐', '钟离', '宇文', '长孙', '慕容', '鲜于', '闾丘', '司徒', '司空', '亓官', '司寇', '子车', '颛孙', '端木', '巫马', '公西', '漆雕', '乐正', '壤驷', '公良', '拓跋', '夹谷', '宰父', '谷梁', '段干', '百里', '东郭', '南门', '呼延', '羊舌', '微生', '梁丘', '左丘', '东门', '西门', '第五']
    var pinyinMap = {
      '郑': 'ZHENG', '旭': 'XU', '升': 'SHENG',
      '李': 'LI', '王': 'WANG', '张': 'ZHANG', '刘': 'LIU',
      '陈': 'CHEN', '杨': 'YANG', '赵': 'ZHAO', '黄': 'HUANG',
      '周': 'ZHOU', '吴': 'WU', '徐': 'XU', '孙': 'SUN',
      '马': 'MA', '朱': 'ZHU', '胡': 'HU', '郭': 'GUO',
      '林': 'LIN', '何': 'HE', '高': 'GAO', '罗': 'LUO',
      '梁': 'LIANG', '宋': 'SONG', '谢': 'XIE',
      '韩': 'HAN', '唐': 'TANG', '冯': 'FENG', '于': 'YU',
      '董': 'DONG', '萧': 'XIAO', '程': 'CHENG', '曹': 'CAO',
      '袁': 'YUAN', '邓': 'DENG', '许': 'XU', '傅': 'FU',
      '沈': 'SHEN', '曾': 'ZENG', '彭': 'PENG', '吕': 'LV',
      '苏': 'SU', '卢': 'LU', '蒋': 'JIANG', '蔡': 'CAI',
      '贾': 'JIA', '丁': 'DING', '魏': 'WEI', '薛': 'XUE',
      '叶': 'YE', '阎': 'YAN', '余': 'YU', '潘': 'PAN',
      '杜': 'DU', '戴': 'DAI', '夏': 'XIA', '钟': 'ZHONG',
      '汪': 'WANG', '田': 'TIAN', '任': 'REN', '姜': 'JIANG',
      '范': 'FAN', '方': 'FANG', '石': 'SHI', '姚': 'YAO',
      '谭': 'TAN', '廖': 'LIAO', '邹': 'ZOU', '熊': 'XIONG',
      '金': 'JIN', '陆': 'LU', '郝': 'HAO', '孔': 'KONG',
      '白': 'BAI', '崔': 'CUI', '康': 'KANG', '毛': 'MAO',
      '邱': 'QIU', '秦': 'QIN', '江': 'JIANG', '史': 'SHI',
      '顾': 'GU', '侯': 'HOU', '邵': 'SHAO', '孟': 'MENG',
      '龙': 'LONG', '万': 'WAN', '段': 'DUAN', '雷': 'LEI',
      '钱': 'QIAN', '汤': 'TANG', '尹': 'YIN', '易': 'YI',
      '黎': 'LI', '向': 'XIANG', '乔': 'QIAO', '文': 'WEN',
      '祁': 'QI', '狄': 'DI', '米': 'MI', '安': 'AN',
      '耿': 'GENG', '关': 'GUAN', '温': 'WEN', '鲁': 'LU'
    }
    function toPinyinChar(ch) {
      if (tinyPinyinOk) {
        var py = window.tinyPinyin.convertToPinyin(ch, '')
        return py ? py.toUpperCase() : ch
      }
      return pinyinMap[ch] || ch
    }
    function autoJerseyName(value) {
      var name = String(value || '').replace(/\s/g, '')
      if (name.length < 2) return ''
      var surname = name.charAt(0)
      var given = name.substring(1)
      var firstTwo = name.substring(0, 2)
      if (COMPOUND_SURNAMES.indexOf(firstTwo) >= 0 && name.length > 2) {
        surname = firstTwo
        given = name.substring(2)
      }
      var sur = ''
      for (var i = 0; i < surname.length; i++) sur += toPinyinChar(surname.charAt(i))
      var initials = []
      for (var j = 0; j < given.length; j++) {
        var py = toPinyinChar(given.charAt(j))
        if (py) initials.push(py.charAt(0) + '.')
      }
      var suffix = initials.join('')
      return (suffix ? sur + ' ' + suffix : sur).toUpperCase()
    }
    nameInput.oninput = function () {
      if (!jerseyNameDirty) jerseyNameInput.value = autoJerseyName(nameInput.value)
    }
    jerseyNameInput.oninput = function () {
      jerseyNameDirty = true
      jerseyNameInput.value = jerseyNameInput.value.toUpperCase()
    }

    var photoFileID = '', portraitId = '', photoPending = false, pendingSubmit = false, numberSerial = 0, numberTimer = null
    var photoInput = document.getElementById('photo')
    var photoCamera = document.getElementById('photoCamera')
    var photoPick = document.getElementById('photoPick')
    var photoTake = document.getElementById('photoTake')
    var photoPreview = document.getElementById('photoPreview')
    var photoState = document.getElementById('photoState')
    var editCardButton=document.getElementById('editRegistrationCard')
    var jerseyField=document.getElementById('jerseyNumber'), jerseyError=document.getElementById('jerseyNumberError')
    function numberError(message) {
      if(!activeForm())return
      jerseyError.textContent=message||'';jerseyError.hidden=!message
      if(message)jerseyField.setAttribute('aria-invalid','true');else jerseyField.removeAttribute('aria-invalid')
    }
    function showNumberError(error){if(error.code==='PLAYER_JERSEY_CONFLICT'||error.code==='JERSEY_INVALID')numberError(error.message)}
    function getPayload(){
      if(!activeForm())throw new Error('登记页面已变化')
      return {serviceEntrySession:session(),choiceToken:data.selection.choiceToken,name:nameInput.value.trim(),birthDate:birthDate(),idCard:idCardInput.value.trim().toUpperCase(),jerseyName:jerseyNameInput.value.trim().toUpperCase(),jerseyNumber:jerseyField.value.trim(),position:document.getElementById('position').value,height:document.getElementById('height').value.trim(),weight:document.getElementById('weight').value.trim(),photoUrl:photoFileID,portraitId:portraitId,guardianRelation:document.getElementById('guardianRelation').value,cardTournamentId:document.getElementById('cardTournamentId')?document.getElementById('cardTournamentId').value:(data.cardContexts||[]).length===1?data.cardContexts[0].tournamentId:'',crop:editor&&editor.crop()||data.resume&&data.resume.crop||undefined,authorizationAgreed:document.getElementById('agree').checked}
    }
    function markDirty(){if(activeForm()&&portraitId){photoState.textContent='球员卡待确认';editCardButton.hidden=false;editCardButton.textContent='生成球员卡';document.getElementById('confirmedRegistrationCard').hidden=true}}
    var editor=window.SxfRegistrationCardModal({api:api,getPayload:getPayload,isActive:activeForm,onDirty:markDirty,onCrop:function(){saveSoon()},onPhoto:function(kind){if(!photoPending)(kind==='camera'?photoCamera:photoInput).click()},onError:function(error){showNumberError(error);if(activeForm()&&editor&&!editor.isOpen()&&error.code!=='PLAYER_JERSEY_CONFLICT')photoState.textContent=error.message},confirmText:function(){return pendingSubmit?'确认登记':'确认使用'},onClosed:function(reason){if(reason!=='confirmed')pendingSubmit=false;saveSoon()},onConfirmed:function(result){
      if(!activeForm())return
      photoState.textContent='球员卡已确认';photoState.className='success';editCardButton.hidden=false;editCardButton.textContent='调整球员卡'
      document.getElementById('confirmedRegistrationCardImage').src=result.imageData;document.getElementById('confirmedRegistrationCard').hidden=false
      saveSoon()
      if(pendingSubmit){pendingSubmit=false;submitRegistration()}
    }})
    function checkNumber(){
      if(!activeForm())return
      var value=jerseyField.value.trim(),request=++numberSerial
      if(!value){numberError('请填写球衣号码');return}
      if(!/^\d{1,3}$/.test(value)||Number(value)>99){numberError('球衣号码请填写0至99');return}
      api('serviceEntryCheckPlayerNumber',{serviceEntrySession:session(),choiceToken:data.selection.choiceToken,jerseyNumber:value}).then(function(result){if(activeForm()&&request===numberSerial&&jerseyField.value.trim()===value)numberError(result.available?'':result.message)}).catch(function(error){if(activeForm()&&request===numberSerial)numberError(error.code?error.message:'号码校验失败，请重试')})
    }
    jerseyField.addEventListener('input',function(){numberSerial++;numberError('');clearTimeout(numberTimer);numberTimer=setTimeout(checkNumber,400)})
    jerseyField.addEventListener('blur',function(){var value=jerseyField.value.trim();if(/^\d{1,3}$/.test(value)&&Number(value)<=99)jerseyField.value=String(Number(value));clearTimeout(numberTimer);checkNumber()})
    ;['name','idCard','birthYear','birthMonth','birthDay','jerseyName','jerseyNumber','position','height','weight'].forEach(function(id){document.getElementById(id).addEventListener('input',function(){pendingSubmit=false;editor.invalidate()});document.getElementById(id).addEventListener('change',function(){pendingSubmit=false;editor.invalidate()})})
    function basicReady(){
      if(jerseyError.textContent){jerseyField.focus();return false}
      return formElement.reportValidity()
    }
    editCardButton.onclick=function(){if(!photoPending&&basicReady())editor.generate()}
    photoPick.onclick = function () { if(basicReady())photoInput.click() }
    photoTake.onclick = function () { if(basicReady())photoCamera.click() }
    function readAsDataURL(file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader()
        reader.onerror = function () { reject(new Error('图片读取失败，请重试')) }
        reader.onload = function () { resolve(reader.result) }
        reader.readAsDataURL(file)
      })
    }
    function compressImage(dataUrl) {
      return new Promise(function (resolve, reject) {
        var image = new Image()
        image.onerror = function () { reject(new Error('图片无法识别，请换一张')) }
        image.onload = function () {
          var maxSide = 800
          var scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
          var canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', 0.85))
        }
        image.src = dataUrl
      })
    }
    function handlePhotoFile(file, sourceInput) {
      if (!file) return
      if (!/^image\//.test(file.type)) { sourceInput.value = ''; return say('请选择图片文件', true) }
      var previousPreview=photoPreview.src
      pendingSubmit=false;editor.begin('正在处理照片…')
      photoPending = true
      photoPick.disabled = true
      photoTake.disabled = true
      photoState.textContent = '已选择，正在处理…'
      photoState.className = 'muted'
      readAsDataURL(file).then(compressImage).then(function (dataUrl) {
        photoPreview.src = dataUrl
        photoPreview.hidden = false
        photoState.textContent = '正在上传并抠图…'
        return api('serviceEntryUploadPhoto', { serviceEntrySession: session(), base64Data: dataUrl })
      }).then(function (result) {
        if(!activeForm())return
        photoFileID = result.fileID || ''; portraitId = result.portraitId || ''
        saveSoon()
        photoPreview.src=result.transparentPreview;photoPreview.hidden=false
        photoState.textContent = '照片已处理，正在生成球员卡…'
        photoState.className = 'success'
        editCardButton.hidden=false;if(editor.isOpen())editor.generate();else markDirty()
      }).catch(function (error) {
        if(!activeForm())return
        photoPreview.src=previousPreview;photoPreview.hidden=!portraitId
        photoState.textContent = portraitId?'更换失败，已保留原照':'抠图失败，请重试'
        photoState.className = 'muted'
        say(error.message, true);editor.fail(error)
      }).finally(function () {
        photoPending = false
        photoPick.disabled = false
        photoTake.disabled = false
        photoInput.value = ''
        photoCamera.value = ''
      })
    }
    photoInput.onchange = function () { handlePhotoFile(photoInput.files && photoInput.files[0], photoInput) }
    photoCamera.onchange = function () { handlePhotoFile(photoCamera.files && photoCamera.files[0], photoCamera) }

    var selected=data.selection.player||{}
    ;['name','jerseyName','jerseyNumber','position','height','weight'].forEach(function(id){var value=selected[id];if(value!==undefined&&value!==null)document.getElementById(id).value=value})
    if(!nameInput.value)nameInput.value=data.initialName||''
    if(!jerseyNameInput.value)jerseyNameInput.value=autoJerseyName(nameInput.value)
    if(data.idCard){idCardInput.value=data.idCard;idCardInput.onchange()}
    if(!data.idCard&&selected.birthDate){year.value=String(Number(selected.birthDate.slice(0,4)));month.value=String(Number(selected.birthDate.slice(5,7)));refreshDays();day.value=String(Number(selected.birthDate.slice(8,10)));refreshGuardian()}
    if(data.resume){
      var values=data.resume.values||{}
      ;['name','jerseyName','idCard','jerseyNumber','position','height','weight','guardianRelation','cardTournamentId'].forEach(function(id){var field=document.getElementById(id);if(field&&values[id]!==undefined)field.value=values[id]})
      if(values.birthDate){year.value=String(Number(values.birthDate.slice(0,4)));month.value=String(Number(values.birthDate.slice(5,7)));refreshDays();day.value=String(Number(values.birthDate.slice(8,10)));refreshGuardian()}
      if(values.idCard)validateIdentity(false)
      if(data.resume.portraitId){photoFileID=data.resume.photoUrl;portraitId=data.resume.portraitId;photoPreview.src=data.resume.photoPreview;photoPreview.hidden=false;photoState.textContent='照片已恢复，球员卡待确认';editCardButton.hidden=false}
      if(data.resume.confirmedCard&&portraitId){photoState.textContent='正在恢复球员卡…';editor.restore(data.resume.confirmedCard)}
      say('已恢复上次填写内容')
    }
    var draftRevision=Number(data.resume&&data.resume.revision||0),draftInFlight=false
    function saveDraft(){
      clearTimeout(draftTimer);if(!activeForm()||draftInFlight)return Promise.resolve()
      draftInFlight=true
      draftRevision=Math.max(draftRevision+1,Date.now())
      return api('serviceEntrySavePlayerDraft',Object.assign({},getPayload(),{draftRevision:draftRevision}))
        .catch(function(){/* Keep the form and retry on the next input or visibility change. */})
        .then(function(){draftInFlight=false})
    }
    function saveSoon(){clearTimeout(draftTimer);draftTimer=setTimeout(saveDraft,900)}
    persistActiveDraft=saveDraft
    formElement.addEventListener('input',saveSoon);formElement.addEventListener('change',saveSoon)
    var eventSelect=document.getElementById('cardTournamentId');if(eventSelect)eventSelect.addEventListener('change',function(){editor.invalidate()})
    saveSoon()
    var keepExisting=document.getElementById('keepExisting')
    function processExisting(automatic){
      if(!automatic&&!basicReady())return
      if(!automatic){pendingSubmit=false;editor.begin('正在处理原形象照…')}
      photoPending=true;photoPick.disabled=true;photoTake.disabled=true;keepExisting.disabled=true;photoState.textContent='正在处理原形象照…'
      api('serviceEntryUploadPhoto',{serviceEntrySession:session(),keepExisting:true}).then(function(result){
        if(!activeForm())return
        photoFileID=result.fileID;portraitId=result.portraitId;photoPreview.src=result.transparentPreview;photoPreview.hidden=false;photoState.textContent='已保留原照，球员卡待确认';editCardButton.hidden=false
        if(!automatic&&editor.isOpen())editor.generate()
      }).catch(function(error){if(!activeForm())return;say(error.message,true);photoState.textContent='原照处理失败，可重试或上传';if(!automatic)editor.fail(error)}).finally(function(){photoPending=false;photoPick.disabled=false;photoTake.disabled=false;keepExisting.disabled=false})
    }
    if(selected.hasPhoto){keepExisting.hidden=false;keepExisting.onclick=function(){processExisting(false)};if(!portraitId)processExisting(true)}
    function submitRegistration(){
      if(!activeForm()||!editor.isConfirmed())return
      var button=content.querySelector('button[type=submit]');if(button.disabled)return;button.disabled=true;button.textContent='提交中…'
      api('serviceEntryJoinPlayer',Object.assign({},getPayload(),{cardPreviewRequired:true,cardPreviewToken:editor.token()})).then(function(result){editor.dispose();showRegistrationCard(true,result)}).catch(function(error){
        if(!activeForm())return
        button.disabled=false;button.textContent=data.selection.mode==='claim'?'确认认领':'确认新建'
        showNumberError(error)
        if(error.code==='PLAYER_JERSEY_CONFLICT'){jerseyField.focus();jerseyField.scrollIntoView({block:'center',behavior:'smooth'})}
        if(error.code==='PLAYER_CARD_CONFIRM_REQUIRED'||error.code==='PLAYER_CARD_TEMPLATE_CHANGED'){pendingSubmit=true;editor.generate(true)}
        if(error.code!=='PLAYER_JERSEY_CONFLICT'&&error.code!=='JERSEY_INVALID')say(error.message,true)
      })
    }
    formElement.onsubmit = function(event){
      event.preventDefault()
      if(!basicReady())return
      if(photoPending)return say('照片仍在处理中，请稍候',true)
      if(!portraitId)return say('请先拍摄或上传形象照',true)
      if(!document.getElementById('agree').checked)return say('请确认本人或监护人资料授权',true)
      if(!editor.isConfirmed()){pendingSubmit=true;editor.generate();return}
      submitRegistration()
    }
  }


  function load() {
    api('serviceEntryContext', { serviceEntrySession: session() }).then(function (data) {
      if (!data.phoneVerified) return showPhone()
      if (mode === 'team' && data.purpose === 'team_claim_entry') return showClaim(data)
      if (mode === 'player' && data.purpose === 'player_invite_entry') {playerContext=data;if(data.registrationResume)return showPlayer(Object.assign({},data,{selection:data.registrationResume.selection,resume:data.registrationResume}));return data.registeredPlayerId ? showRegistrationCard() : showPlayerSearch(data)}
      throw new Error('扫码入口与登记页面不一致')
    }).catch(function (error) {
      say(error.message, true)
      if(!document.getElementById('form')){content.hidden=false;content.innerHTML='<button class="secondary wide" type="button" id="retryEntry">重新连接</button><a class="entry-return-link" href="./registration-resume.html">继续球员登记</a>';document.getElementById('retryEntry').onclick=function(){if(/会话.*失效/.test(error.message)){writeStored(sessionStorage,key,'');writeStored(localStorage,key,'')}start()}}
    })
  }
  function start() {
    if(query.get('proof')){try{var stored=JSON.parse(readStored(localStorage,key)||'null');if(!stored||stored.proof!==query.get('proof')){writeStored(sessionStorage,key,'');writeStored(localStorage,key,'')}}catch(error){writeStored(sessionStorage,key,'');writeStored(localStorage,key,'')}}
    var code = query.get('code'), state = query.get('state')
    if (code && state) {
      api('completeServiceEntryOAuth', { code: code, state: state, proof: proof }).then(function (result) {
        rememberSession(result.serviceEntrySession)
        history.replaceState({}, document.title, location.pathname + '?entry=' + encodeURIComponent(entry))
        query=new URLSearchParams(location.search)
        load()
      }).catch(function (error) { say(error.message, true) })
      return
    }
    if (session()) return load()
    if (!entry || !proof) return say('请从服务号回复的登记链接进入', true)
    api('serviceEntryOAuthUrl', { entry: entry, proof: proof }).then(function (result) {
      location.replace(result.authorizeUrl)
    }).catch(function (error) { say(error.message, true) })
  }
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden'&&persistActiveDraft)persistActiveDraft()})
  window.addEventListener('pagehide',function(){if(persistActiveDraft)persistActiveDraft()})
  start()
})()
