(function(){
 'use strict'
 var API='https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi',KEY='sxf_referee_h5_session',app=document.getElementById('app')
 var PAGE_VERSION='v2.3'
 var MOCK=false
 var state={overview:null,view:'player',playerId:'',detail:null,epoch:0},oauthPending=false
 function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
 // 本地预览（?mock=1）：假数据直出，不请求微信与业务接口
 function mockResponse(p){
  if(p.action==='servicePrivatePlayerData')return Promise.resolve({success:true,data:{player:state.overview.players.filter(function(x){return x.id===p.playerId})[0]||state.overview.players[0],metrics:{appearances:12,goals:8,assists:5,starts:9,yellowCards:2,redCards:0},coverage:{goals:'complete'},matches:[{id:'m1',tournamentName:'2026郑州市青少年足球邀请赛',homeName:'郑州青少队',awayName:'洛阳金茂队',status:'finished',homeScore:3,awayScore:1,matchDate:'2026-10-12',matchTime:'15:00',venue:'郑州市体育中心'},{id:'m2',tournamentName:'2026郑州市青少年足球邀请赛',homeName:'开封铁路队',awayName:'郑州青少队',status:'upcoming',homeScore:null,awayScore:null,matchDate:'2026-10-19',matchTime:'10:00',venue:'开封体育场'}],events:[{matchId:'m1',type:'goal',minute:23,counted:true},{matchId:'m1',type:'assist',minute:56,counted:true}]}})
  if(p.action==='servicePrivateRefereeData')return Promise.resolve({success:true,data:{referee:state.overview.referee,summary:{total:18,completed:14,upcoming:4},matches:[{id:'r1',tournamentName:'2026郑州市青少年足球邀请赛',homeName:'郑州青少队',awayName:'洛阳金茂队',status:'finished',homeScore:3,awayScore:1,matchDate:'2026-10-12',matchTime:'15:00',venue:'郑州市体育中心',roles:['主裁判']}],workbenchUrl:'./?entry=workbench'}})
  if(p.action==='serviceFeedbackSubmit')return Promise.resolve({success:true,feedbackId:'mockfb'+Date.now().toString().slice(-6)})
  return Promise.reject(Error('mock 不支持的动作'))
 }
 function api(p){if(MOCK)return mockResponse(p);p.serviceSessionToken=localStorage.getItem(KEY)||'';return fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)}).then(function(r){return r.json()}).then(function(r){if(typeof r.body==='string')r=JSON.parse(r.body);if(!r.success){if(r.code==='SERVICE_PRIVATE_AUTH_REQUIRED'&&!oauthPending){localStorage.removeItem(KEY);oauth()}throw Error(r.error||'读取失败，请重试')}return r})}
 function loading(){return '<div class="personal-loading" role="status">正在读取数据…</div>'}
 function error(message,retry){app.innerHTML='<section class="personal-state"><h1>暂时无法读取</h1><p>'+esc(message)+'</p><button id="retryButton" class="personal-primary">重新加载</button></section>';document.getElementById('retryButton').onclick=retry}
 function oauth(){oauthPending=true;state.epoch++;app.innerHTML=loading();api({action:'servicePrivateOAuthUrl',returnUrl:location.origin+location.pathname}).then(function(r){location.replace(r.authorizeUrl)}).catch(function(e){oauthPending=false;error(e.message,oauth)})}
 function complete(code,oauthState){app.innerHTML=loading();api({action:'servicePrivateOAuth',code:code,state:oauthState}).then(function(r){localStorage.setItem(KEY,r.refereeSessionToken);history.replaceState({},document.title,location.pathname);overview()}).catch(function(e){error(e.message,oauth)})}
 function portrait(url,name){return url?'<span class="personal-portrait"><img src="'+esc(url)+'" alt="'+esc(name)+'" onerror="this.parentElement.hidden=true"></span>':''}
 function status(v){return({finished:'已结束',completed:'已结束',ended:'已结束',ongoing:'进行中',live:'进行中',playing:'进行中',upcoming:'待开始',scheduled:'待开始',not_started:'待开始',pending:'待开始',postponed:'延期'})[v]||'状态待确认'}
 function value(v){return v==null?'—':esc(v)}
 function metric(label,v){return '<div><strong>'+value(v)+'</strong><span>'+label+'</span></div>'}
 // ============ 我的（主页） ============
 function relationLabel(p){return p.relation==='guardian'?'监护球员':'本人'}
 function identityText(){var d=state.overview,labels=[]
  if(d.players&&d.players.length)labels.push(d.players.length+' 名球员')
  if(d.hasReferee)labels.push('注册裁判')
  return labels.length?labels.join(' · '):'暂未绑定业务关系'
 }
 function menuRow(icon,title,note,action){return '<button class="me-row" data-action="'+esc(action)+'">'+(icon?'<span class="me-row-icon" aria-hidden="true">'+icon+'</span>':'')+'<span class="me-row-text"><text>'+esc(title)+'</text>'+(note?'<small>'+esc(note)+'</small>':'')+'</span><span class="me-row-arrow" aria-hidden="true">›</span></button>'}
 function homeIcon(name){return '<img class="me-home-icon" src="./assets/icons/'+name+'.svg" alt="">'}
 function homeMenu(icon,title,action){return '<button class="me-home-row" data-action="'+action+'">'+homeIcon(icon)+'<span>'+title+'</span><i aria-hidden="true">›</i></button>'}
 function renderHome(){
  var d=state.overview,players=d.players||[],ref=d.referee||null
  state.epoch++;state.detail=null
  if(!players.length)state.view='referee';else if(!d.hasReferee)state.view='player'
  var p=players.filter(function(x){return x.id===state.playerId})[0]||players[0]||null
  if(p)state.playerId=p.id
  var current=state.view==='referee'?ref:p,name=current&&current.name||'微信用户'
  var relation=state.view==='referee'?[ref&&ref.level?'注册裁判 · '+ref.level:'注册裁判']:[p&&p.teamName,p&&p.jerseyNumber?p.jerseyNumber+'号':'',p&&p.relation==='guardian'?'监护球员':'']
  app.innerHTML='<div class="me-home-root"><header class="me-home-header"><h2>我的</h2><img src="./assets/logo-saixiaofeng-football.png" alt="赛小蜂足球"></header><main class="me-body me-home-body">'+
   '<section class="me-usercard me-home-profile" aria-label="当前资料">'+portrait(current&&current.avatar,name)+'<div><h1>'+esc(name)+'</h1><p>'+esc(d.phoneMasked||'')+'</p></div><button data-action="homeProfile">个人资料 ›</button></section>'+
   '<nav class="me-home-roles" aria-label="切换身份"><button data-home-role="player" aria-pressed="'+(state.view==='player')+'" '+(!players.length?'disabled':'')+'>球员身份</button><button data-home-role="referee" aria-pressed="'+(state.view==='referee')+'" '+(!d.hasReferee?'disabled':'')+'>裁判身份</button></nav>'+
   '<div class="me-home-context"><span>'+esc(relation.filter(Boolean).join(' · ')||'尚未绑定业务身份')+'</span>'+(state.view==='player'&&players.length>1?'<button data-action="homePlayers">切换球员 ›</button>':'')+'</div>'+
   '<section class="me-home-wallet" aria-label="我的蜂蜜"><div class="wallet-head"><strong>我的蜂蜜</strong><button data-action="honeyLedger">收支明细 ›</button></div><div class="wallet-body"><div class="amount"><strong id="homeHoneyBalance">—</strong><span>滴</span></div><button class="recharge" data-action="honeyRecharge">充值</button></div><div id="homeHoneyStatus" class="wallet-foot">正在读取蜂蜜余额…</div></section>'+
   '<section class="me-home-data"><button class="me-home-data-head" data-action="goData"><strong>'+(state.view==='player'?'我的比赛数据':'我的执裁数据')+'</strong><span>全部记录 ›</span></button><div id="homeMetrics" class="me-home-metrics">'+homeMetrics(null)+'</div>'+homeMenu(state.view==='player'?'shield':'event',state.view==='player'?'我的球员卡':'裁判任务',state.view==='player'?'homePlayerCards':'homeRefereeTasks')+'</section>'+
   '<h2 class="me-home-label">账号与服务</h2><section class="me-home-menu">'+homeMenu('list','继续球员登记','homeRegistrationResume')+homeMenu('lock','账号与安全','homeSecurity')+homeMenu('list','绑定管理','showBindings')+homeMenu('bell','消息通知','homeMessages')+homeMenu('event','充值订单','honeyOrders')+homeMenu('shield','客服中心','support')+homeMenu('event','我的反馈','myFeedback')+'</section>'+
   '<div class="me-home-footer"><button data-action="openTournament">赛事中心</button><span>·</span><button data-action="about">关于赛小蜂</button><span>·</span><button data-action="logout">退出登录</button></div></main></div>'
  updateHomeWallet();loadHomeStats();loadHomeAccount(false)
 }
 function homeMetrics(data){var m=state.view==='player'?(data&&data.metrics||{}):(data&&data.summary||{}),pairs=state.view==='player'?[['出场',m.appearances],['进球',m.goals],['助攻',m.assists]]:[['执裁场次',m.total],['已完成',m.completed],['未结束',m.upcoming]];return pairs.map(function(p){return '<div><strong>'+value(p[1])+'</strong><span>'+p[0]+'</span></div>'}).join('')}
 function loadHomeStats(){var epoch=state.epoch,view=state.view,id=state.playerId,token=localStorage.getItem(KEY)||''
  if(view==='player'&&!(state.overview.players||[]).length||view==='referee'&&!state.overview.hasReferee)return
  api(view==='player'?{action:'servicePrivatePlayerData',playerId:id}:{action:'servicePrivateRefereeData'}).then(function(r){if(epoch!==state.epoch||token!==(localStorage.getItem(KEY)||''))return;var n=document.getElementById('homeMetrics');if(n)n.innerHTML=homeMetrics(r.data)}).catch(function(){if(epoch!==state.epoch)return;var n=document.getElementById('homeMetrics');if(n)n.innerHTML='<button data-action="retryHomeStats">数据暂不可用，重新加载</button>'})
 }
 function updateHomeWallet(){var n=document.getElementById('homeHoneyBalance'),note=document.getElementById('homeHoneyStatus');if(!n||!note)return
  var w=homeAccount&&homeAccount.wallet;n.textContent=w&&w.status==='ready'?w.balance.toLocaleString('en-US'):'—'
  note.textContent=!w?'正在读取蜂蜜余额…':w.status==='ready'?'账号通用余额 · 切换身份不影响蜂蜜':w.status==='not_open'?'尚未开通蜂蜜账户':w.status==='conflict'||w.status==='reconciliation'?'蜂蜜余额待核对，请稍后刷新':'余额暂不可用，请稍后刷新'
 }
 var homeAccount=null,homeAccountAt=0,homeAccountPromise=null,homeAccountGeneration=0,homeModal=''
 function loadHomeAccount(force){if(homeAccountPromise)return homeAccountPromise;if(!force&&homeAccount&&Date.now()-homeAccountAt<30000)return Promise.resolve(homeAccount)
  var generation=homeAccountGeneration,token=localStorage.getItem(KEY)||''
  var promise=api({action:'servicePrivateAccountData'}).then(function(r){if(generation!==homeAccountGeneration||token!==(localStorage.getItem(KEY)||''))return null;homeAccount=r.data;homeAccountAt=Date.now();updateHomeWallet();return r.data}).catch(function(error){if(generation!==homeAccountGeneration||token!==(localStorage.getItem(KEY)||''))return null;homeAccount={wallet:{status:'unavailable',balance:null,entries:[]},messages:{status:'unavailable',entries:[]}};updateHomeWallet();return homeAccount}).then(function(result){if(homeAccountPromise===promise)homeAccountPromise=null;return result})
  homeAccountPromise=promise;return promise
 }
 function homeTime(t){return t?new Date(t).toLocaleString('zh-CN',{hour12:false}):'时间未记录'}
 function showHomeAccount(kind){modal(kind==='ledger'?'蜂蜜收支':'消息通知','<p class="me-modal-text">正在读取…</p>');homeModal=kind;loadHomeAccount(true).then(function(data){if(!data||homeModal!==kind||!app.querySelector('.me-modal-mask'))return
  var result=kind==='ledger'?data.wallet:data.messages,entries=result&&result.entries||[],html=''
  if(!result||result.status!=='ready')html='<p class="me-modal-text">'+(kind==='ledger'&&result&&result.status==='not_open'?'尚未开通蜂蜜账户':kind==='ledger'?'蜂蜜余额暂不可核定，请稍后刷新':'消息暂不可用，请稍后刷新')+'</p>'
  else html=entries.length?'<div class="me-account-entries">'+entries.map(function(row){return '<div class="me-account-entry"><div><strong>'+esc(kind==='ledger'?row.label:row.title)+'</strong><small>'+esc(homeTime(row.time))+'</small>'+(kind==='ledger'?'':'<p>'+esc(row.content)+'</p>')+'</div>'+(kind==='ledger'?'<b>'+esc((row.delta>0?'+':'')+row.delta)+' 滴</b>':'')+'</div>'}).join('')+'</div>':'<p class="me-modal-text">'+(kind==='ledger'?'暂无收支记录':'暂无发给本人账号的消息')+'</p>'
  modal(kind==='ledger'?'蜂蜜收支':'消息通知',html)
 })}
 function homeAction(action){
  if(action==='homeRegistrationResume'){location.href='./registration-resume.html';return true}
  if(action==='honeyRecharge'||action==='honeyOrders'){modal(action==='honeyRecharge'?'蜂蜜充值':'充值订单','<p class="me-modal-text">充值暂未开放</p><p class="me-modal-text">当前不会创建订单或扣款。</p>');return true}
  if(action==='honeyLedger'||action==='homeMessages'){showHomeAccount(action==='honeyLedger'?'ledger':'messages');return true}
  if(action==='homePlayerCards'){location.href='./player-cards.html';return true}
  if(action==='homeRefereeTasks'){location.href='./?entry=workbench';return true}
  if(action==='retryHomeStats'){loadHomeStats();return true}
  if(action==='homePlayers'){var rows=(state.overview.players||[]).map(function(p){return '<button class="me-home-player-option" data-home-player="'+esc(p.id)+'">'+esc(p.name)+'<small>'+esc(p.teamName)+'</small></button>'}).join('');modal('切换球员',rows);return true}
  if(action==='homeProfile'){var p=state.view==='referee'?state.overview.referee:(state.overview.players||[]).filter(function(x){return x.id===state.playerId})[0];modal('个人资料','<p class="me-modal-text">'+esc(p&&p.name||'微信用户')+'</p><p class="me-modal-text">'+esc(state.view==='referee'?p&&p.level:p&&p.teamName)+'</p><p class="me-modal-text">账号手机号：'+esc(state.overview.phoneMasked||'已绑定')+'</p>');return true}
  if(action==='homeSecurity'){modal('账号与安全','<p class="me-modal-text">账号手机号：'+esc(state.overview.phoneMasked||'已绑定')+'</p><p class="me-modal-text">微信身份已验证。如需更换绑定，请联系客服核对。</p>');return true}
  if(action==='myFeedback'){showMyFeedback();return true}
  return false
 }
 function fbStatus(v){return({pending:'待处理',processing:'处理中',done:'已处理'})[v]||'待处理'}
 function showMyFeedback(){
  modal('我的反馈','<p class="me-modal-text">正在读取反馈记录…</p>')
  api({action:'servicePrivateFeedbackList'}).then(function(r){
    var rows=(r&&r.rows)||[]
    if(!app.querySelector('.me-modal-mask'))return
    if(!rows.length){modal('我的反馈','<p class="me-modal-text">暂无反馈记录</p><p class="me-modal-text">遇到问题可在「客服中心」提交反馈，客服回复后会通过服务号通知你。</p>');return}
    var html=rows.map(function(row){
      var reply=row.reply?('<div class="me-fb-reply"><strong>客服回复</strong><small>'+esc(homeTime(row.replyAt))+'</small><p>'+esc(row.reply)+'</p></div>'):''
      return '<div class="me-fb-item"><div class="me-fb-item-head"><span class="me-fb-type">'+esc(row.typeLabel||'其他')+'</span><span class="me-fb-status">'+esc(fbStatus(row.status))+'</span><small>'+esc(homeTime(row.createTime))+'</small></div><p class="me-fb-content">'+esc(row.content)+'</p>'+reply+'</div>'
    }).join('')
    modal('我的反馈',html)
  }).catch(function(e){if(app.querySelector('.me-modal-mask'))modal('我的反馈','<p class="me-modal-text">读取失败：'+esc(e.message||'请稍后重试')+'</p>')})
 }

 function showBindings(){var d=state.overview,players=d.players||[],ref=d.referee||null,rows=''
  players.forEach(function(p){rows+='<div class="me-binding"><span class="me-binding-name">'+esc(p.name)+'</span><span class="me-binding-meta">'+esc([p.teamName,p.jerseyNumber?p.jerseyNumber+'号':'',relationLabel(p)].filter(Boolean).join(' · '))+'</span></div>'})
  if(ref)rows+='<div class="me-binding"><span class="me-binding-name">'+esc(ref.name)+'</span><span class="me-binding-meta">'+esc(['注册裁判',ref.level].filter(Boolean).join(' · '))+'</span></div>'
  modal('绑定关系',rows||'<p class="me-modal-text">尚未绑定球员或裁判。球员从球队资料邀请完成绑定；裁判从本人任务验证手机号。</p>')}
 function modal(title,body,hideClose){homeModal='';app.querySelector('.me-modal-mask')&&app.querySelector('.me-modal-mask').remove();var mask=document.createElement('div');mask.className='me-modal-mask';mask.innerHTML='<div class="me-modal" role="dialog" aria-label="'+esc(title)+'"><div class="me-modal-handle"></div><h2 class="me-modal-title">'+esc(title)+'</h2><div class="me-modal-body">'+body+'</div>'+(hideClose?'':'<button class="me-modal-close">知道了</button>')+'</div>';app.appendChild(mask);mask.addEventListener('click',function(e){if(e.target===mask||e.target.closest('.me-modal-close')||e.target.closest('.me-modal-cancel'))mask.remove()})}
 // ============ 数据子页（球员 / 执裁） ============
 function shell(){var d=state.overview,players=d.players||[],tabs='',list=''
  if(players.length&&d.hasReferee)tabs='<nav class="personal-tabs" aria-label="数据类型"><button data-view="player" aria-selected="'+(state.view==='player')+'">球员数据</button><button data-view="referee" aria-selected="'+(state.view==='referee')+'">执裁数据</button></nav>'
  if(state.view==='player'&&players.length>1)list='<div class="personal-selector">'+players.map(function(p){return '<button data-player="'+esc(p.id)+'" aria-pressed="'+(p.id===state.playerId)+'">'+esc(p.name)+'<small>'+esc(p.teamName)+'</small></button>'}).join('')+'</div>'
  app.innerHTML='<main class="me-body me-body-data"><button class="personal-back" data-home="true">‹ 返回我的</button>'+tabs+list+'<div id="personalContent">'+loading()+'</div></main>'
 }
 function matchRows(matches){if(!matches.length)return '<div class="personal-empty">暂无比赛记录</div>';return '<div class="personal-matches">'+matches.map(function(m){var show=['finished','completed','ended','ongoing','live','playing'].indexOf(m.status)>=0;return '<button class="personal-match" data-match="'+esc(m.id)+'"><span class="personal-match-meta"><span>'+esc(m.tournamentName||'比赛')+'</span><b>'+status(m.status)+'</b></span><span class="personal-score"><span>'+esc(m.homeName)+'</span><strong>'+(show?value(m.homeScore)+' : '+value(m.awayScore):'VS')+'</strong><span>'+esc(m.awayName)+'</span></span><span class="personal-match-meta"><span>'+esc([m.matchDate,m.matchTime,m.venue].filter(Boolean).join(' · '))+'</span><span>'+(state.view==='referee'?esc((m.roles||[]).join(' / ')):'查看数据')+' ›</span></span></button>'}).join('')+'</div>'}
 function render(d){var html=''
  if(state.view==='player'){var p=d.player,m=d.metrics||{};html='<div class="personal-person">'+portrait(p.avatar,p.name)+'<div><h1>'+esc(p.name)+'</h1><p>'+esc([p.teamName,p.jerseyNumber?p.jerseyNumber+'号':'',p.relation==='guardian'?'监护球员':'本人'].filter(Boolean).join(' · '))+'</p></div></div><section class="personal-metrics" aria-label="正式比赛统计">'+metric('出场',m.appearances)+metric('进球',m.goals)+metric('助攻',m.assists)+metric('首发',m.starts)+metric('黄牌',m.yellowCards)+metric('红牌',m.redCards)+'</section>';if(Object.keys(d.coverage||{}).some(function(k){return d.coverage[k]!=='complete'}))html+='<p class="personal-notice">部分比赛数据未完整记录，未知项显示“—”</p>'}
  else{var r=d.referee,s=d.summary;html='<div class="personal-person">'+portrait(state.overview.referee&&state.overview.referee.avatar,r.name)+'<div><h1>'+esc(r.name)+'</h1><p>'+esc(r.level)+'</p></div><a class="personal-workbench" href="./?entry=workbench">裁判任务 ›</a></div><section class="personal-metrics">'+metric('执裁场次',s.total)+metric('已结束',s.completed)+metric('未结束',s.upcoming)+'</section>'}
  document.getElementById('personalContent').innerHTML=html+'<section class="personal-history"><h2>'+(state.view==='player'?'逐场数据':'执裁记录')+'</h2>'+matchRows(d.matches||[])+'</section>'
 }
 function select(view,id){state.view=view;state.playerId=id||state.playerId;state.detail=null;var epoch=++state.epoch;shell();api(view==='player'?{action:'servicePrivatePlayerData',playerId:state.playerId}:{action:'servicePrivateRefereeData'}).then(function(r){if(epoch!==state.epoch)return;state.detail=r.data;render(r.data)}).catch(function(e){if(epoch!==state.epoch)return;document.getElementById('personalContent').innerHTML='<section class="personal-state"><p>'+esc(e.message)+'</p><button data-retry="true" class="personal-primary">重新加载</button></section>'})}
 function openMatch(id){if(!state.detail)return;var match=(state.detail.matches||[]).find(function(m){return m.id===id});if(!match)return
  var labels={goal:'进球',penalty_goal:'点球进球',own_goal:'乌龙球',assist:'助攻',yellow_card:'黄牌',red_card:'红牌',second_yellow:'两黄变一红',substitution_in:'换上',substitution_out:'换下'},events=(state.detail.events||[]).filter(function(e){return e.matchId===id})
  document.getElementById('personalContent').innerHTML='<button class="personal-back" data-back="true">‹ 返回记录</button><h1 class="personal-match-title">'+esc(match.homeName)+' VS '+esc(match.awayName)+'</h1><p class="personal-subtitle">'+esc([match.tournamentName,match.matchDate,match.matchTime,match.venue].filter(Boolean).join(' · '))+'</p><div class="personal-detail-score">'+value(match.homeScore)+' : '+value(match.awayScore)+'<small>'+status(match.status)+'</small></div>'+(state.view==='referee'?'<div class="personal-role">执裁岗位：'+esc((match.roles||[]).join(' / '))+'</div><a class="personal-primary personal-task-link" href="./?entry=workbench">进入裁判任务</a>':'<h2>本场个人记录</h2>'+(events.length?'<ul class="personal-events">'+events.map(function(e){return '<li><strong>'+(e.minute==null?'分钟未记录':esc(e.minute)+'′')+'</strong><span>'+esc(labels[e.type]||'比赛事件')+'</span></li>'}).join('')+'</ul>':'<p class="personal-empty">暂无已采集的个人事件</p>'))
 }
 // ============ 客服中心 ============
 var FAQ=[
  {q:'比赛数据不对或看不到记录，怎么办？',a:'正式比赛统计以赛事主办方录入并发布的数据为准。部分场次未采集的事件会显示“—”。如发现缺漏，请先在下方提交反馈，或联系所属机构管理员核对。'},
  {q:'球员数据是怎么绑定的？',a:'球员档案由球队资料邀请完成绑定，绑定关系由管理员维护。如需增减绑定的球员，请联系机构管理员，本页不做解绑操作。'},
  {q:'裁判任务入口在哪里？',a:'在服务号菜单或首页“裁判任务”入口进入，裁判需完成本人任务手机号验证后才能看到执裁数据。'},
  {q:'为什么看不到执裁数据？',a:'执裁数据需要裁判档案审核通过且与当前微信账号匹配。如已认证仍看不到，请通过下方反馈联系客服。'},
  {q:'手机号能自己更换吗？',a:'账号由微信授权关系自动匹配，手机号变更请联系机构管理员核对后再打开本页。'}
 ]
 function toast(msg){var old=document.querySelector('.me-toast');old&&old.remove();var t=document.createElement('div');t.className='me-toast';t.textContent=msg;document.body.appendChild(t);setTimeout(function(){t.classList.add('show')},10);setTimeout(function(){t.remove()},2600)}
 function faqItem(i,item){return '<div class="me-faq-item"><button class="me-faq-q" data-faq="'+i+'"><span>'+esc(item.q)+'</span><i aria-hidden="true">+</i></button><div class="me-faq-a">'+esc(item.a)+'</div></div>'}
 function renderSupport(){
  app.innerHTML='<main class="me-body me-body-support">'+
   '<button class="personal-back" data-home="true">‹ 返回我的</button>'+
   '<section class="me-card me-support-qr"><h2 class="me-support-title">微信扫码咨询客服</h2><div class="me-support-qr-box"><img src="./assets/customer-service-qr.png" alt="微信扫码咨询客服"></div><p class="me-support-note">工作时间：周一至周五 9:00–18:00<br>赛事咨询、数据核对、账号问题均可扫码联系</p></section>'+
   '<h2 class="me-group-title">常见问题</h2>'+
   '<section class="me-card me-faq">'+FAQ.map(function(item,i){return faqItem(i,item)}).join('')+'</section>'+
   '<h2 class="me-group-title">意见反馈</h2>'+
   '<section class="me-card me-feedback" id="feedbackCard">'+
    '<div class="me-fb-types" role="radiogroup" aria-label="问题类型">'+
     '<button class="me-fb-type" data-type="data_error" aria-pressed="true">数据异常</button>'+
     '<button class="me-fb-type" data-type="binding" aria-pressed="false">绑定问题</button>'+
     '<button class="me-fb-type" data-type="feature" aria-pressed="false">功能建议</button>'+
     '<button class="me-fb-type" data-type="other" aria-pressed="false">其他</button>'+
    '</div>'+
    '<textarea class="me-fb-input" id="fbContent" maxlength="500" rows="5" placeholder="请描述你遇到的问题或建议（至少10个字）"></textarea>'+
    '<div class="me-fb-count"><span id="fbCount">0</span>/500</div>'+
    '<input class="me-fb-input" id="fbContact" type="text" maxlength="20" placeholder="微信号（必填，便于客服添加你沟通）">'+
    '<button class="me-fb-submit" data-action="submitFeedback">提交反馈</button>'+
    '<p class="me-fb-note">提交即表示同意客服就本问题与你联系；微信号仅用于客服添加沟通，不会用于其他用途。</p>'+
   '</section>'+
   '<p class="me-version">客服中心由赛小蜂足球提供技术支持</p>'+
  '</main>'
  var ta=document.getElementById('fbContent'),count=document.getElementById('fbCount')
  ta.addEventListener('input',function(){count.textContent=String(ta.value.length)})
  document.querySelectorAll('.me-faq-q').forEach(function(btn){btn.addEventListener('click',function(){btn.parentElement.classList.toggle('open')})})
  document.querySelectorAll('.me-fb-type').forEach(function(btn){btn.addEventListener('click',function(){document.querySelectorAll('.me-fb-type').forEach(function(b){b.setAttribute('aria-pressed',String(b===btn))})})})
 }
 function submitFeedback(){
  var card=document.getElementById('feedbackCard');if(!card||card.dataset.busy==='1')return
  var type=document.querySelector('.me-fb-type[aria-pressed=true]'),content=document.getElementById('fbContent').value.trim(),contact=document.getElementById('fbContact').value.trim()
  if(content.length<10){toast('请至少填写10个字，方便客服定位问题');return}
  if(content.length>500){toast('内容过长，请精简到500字以内');return}
  if(!/^[a-zA-Z][a-zA-Z0-9_-]{5,19}$/.test(contact)){toast('请填写正确的微信号（6-20位，字母开头，可含数字、下划线、减号）');return}
  card.dataset.busy='1'
  var btn=card.querySelector('.me-fb-submit');btn.disabled=true;btn.textContent='提交中…'
  api({action:'serviceFeedbackSubmit',type:type?type.dataset.type:'other',content:content,contact:contact}).then(function(r){
   card.innerHTML='<div class="me-fb-done"><strong>已收到，谢谢反馈</strong><p>反馈编号 '+(r.feedbackId||'').slice(-6)+'，客服会按提交顺序处理，并通过你填写的微信号添加你沟通。</p><button class="me-fb-again" data-action="againFeedback">再提交一条</button></div>'
  }).catch(function(e){card.dataset.busy='';btn.disabled=false;btn.textContent='提交反馈';toast(e.message||'提交失败，请稍后重试')})
 }

 // ============ 账号动作 ============
 function logout(){modal('退出登录','<p class="me-modal-text">退出后将清理本设备的微信授权缓存，下次打开需重新微信授权。确定继续吗？</p><div class="me-modal-actions"><button class="me-modal-confirm" data-action="doLogout">退出登录</button><button class="me-modal-cancel">取消</button></div>',true)}
 function doLogout(){homeAccountGeneration++;homeAccount=null;homeAccountAt=0;homeAccountPromise=null;localStorage.removeItem(KEY);oauth()}
 app.addEventListener('click',function(e){var t=e.target.closest('button,a');if(!t)return
  var action=t.dataset.action
  if(homeAction(action))return
  if(t.dataset.homeRole){if(t.disabled)return;state.view=t.dataset.homeRole;renderHome()}
  else if(t.dataset.homePlayer){state.playerId=t.dataset.homePlayer;renderHome()}
  else if(t.dataset.home)renderHome()
  else if(action==='goData'){var d=state.overview;if(!d.players.length&&!d.hasReferee)return showBindings();select(state.view,state.playerId)}
  else if(action==='logout')logout()
  else if(action==='doLogout')doLogout()
  else if(action==='openTournament')location.href='./tournament-center.html'
  else if(action==='openHome')location.href='./index.html'
  else if(action==='showBindings')showBindings()
  else if(action==='support')renderSupport()
  else if(action==='submitFeedback')submitFeedback()
  else if(action==='againFeedback')renderSupport()
  else if(action==='help')modal('帮助与反馈','<p class="me-modal-text">数据异常、绑定问题或使用建议，请通过机构管理员提交，或反馈给赛小蜂客服。反馈时请说明页面、时间和问题现象，便于定位。</p>')
  else if(action==='about')modal('关于赛小蜂','<p class="me-modal-text">赛小蜂足球为赛事组织、球队协作和赛场执行提供统一服务。本页仅展示你本人账号下的球员与执裁数据。</p><p class="me-modal-text">个人中心 '+PAGE_VERSION+'</p>')
  else if(action==='noopPhone'||action==='noopWechat')modal(action==='noopPhone'?'手机号':'微信授权',action==='noopPhone'?'<p class="me-modal-text">当前手机号由微信授权关系自动匹配，用于确认你的业务账号。如需更换，请联系机构管理员核对后再打开本页。</p>':'<p class="me-modal-text">本页通过微信服务号授权登录，仅读取与当前微信绑定的业务数据，不获取昵称和头像。</p>')
  else if(t.dataset.view)select(t.dataset.view,state.playerId)
  else if(t.dataset.player)select('player',t.dataset.player)
  else if(t.dataset.match)openMatch(t.dataset.match)
  else if(t.dataset.back&&state.detail)render(state.detail)
  else if(t.dataset.back)renderHome()
  else if(t.dataset.retry)select(state.view,state.playerId)
 })
 // ============ 入口 ============
 function overview(){homeAccountGeneration++;homeAccount=null;homeAccountAt=0;homeAccountPromise=null;state.epoch++;app.innerHTML=loading();api({action:'servicePrivateOverview'}).then(function(r){if(r.needsBinding){app.innerHTML='<section class="personal-state"><h1>尚未绑定球员或裁判</h1><p>球员从球队资料邀请完成绑定；裁判从本人任务验证手机号。</p><a class="personal-primary personal-task-link" href="./?entry=workbench">裁判任务</a></section>';return}state.overview=r.data;renderHome()}).catch(function(e){if(!oauthPending)error(e.message,overview)})}
 // 本地预览：me.html?mock=1 使用假数据渲染，不请求微信
 function mockOverview(){state.overview={schemaVersion:'service-personal/2',phoneMasked:'138****1663',hasReferee:true,referee:{name:'郑旭升',level:'国家二级裁判',avatar:''},players:[{id:'p1',name:'郑旭升',teamName:'郑州青少队',jerseyNumber:'7',relation:'self',avatar:''},{id:'p2',name:'郑晓峰',teamName:'郑州青少队',jerseyNumber:'10',relation:'guardian',avatar:''}]};renderHome()}
 var q=new URLSearchParams(location.search);if(q.get('code')&&q.get('state'))complete(q.get('code'),q.get('state'));else if(MOCK){mockOverview();var mview=new URLSearchParams(location.search).get('view');if(mview==='data'){var dd=state.overview;select(dd.players.length?'player':'referee',dd.players[0]?dd.players[0].id:'')}else if(mview==='support')renderSupport()}else if(localStorage.getItem(KEY))overview();else oauth()
})()
