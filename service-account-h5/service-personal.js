(function(){
 'use strict'
 var API='https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi',KEY='sxf_referee_h5_session',app=document.getElementById('app')
 var PAGE_VERSION='v2.8'
 // 本地预览（?mock=1）：只在 file:// 或本机地址生效，避免线上被加参数后展示假会员与假余额
 var MOCK=/[?&]mock=1(?:&|$)/.test(location.search)&&(/^(file:|http:\/\/localhost|http:\/\/127\.0\.0\.1)/.test(location.protocol+location.host))
 var state={overview:null,view:'player',playerId:'',detail:null,epoch:0},oauthPending=false
 function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
 // 本地预览（?mock=1）：假数据直出，不请求微信与业务接口
 // 会员本地预览（仅 me.html?mock=1，可加 &member=active 看已开通态）：
 // 只为核对会员卡、会员中心、档位与订单样式，不发起真实订单或支付；真实价格与资格一律以服务端返回为准。
 function mockMemberActive(){return /[?&]member=active/.test(location.search)}
 function mockMemberPlans(){
  return [
   {code:'basic',name:'基础会员',firstPriceCents:990,renewPriceCents:1990,yearlyPriceCents:19900,grantDrops:200,portraitDiscount:0.95,portraitDiscountLabel:'9.5 折',visible:true,order:1},
   {code:'plus',name:'进阶会员',firstPriceCents:1990,renewPriceCents:2990,yearlyPriceCents:29900,grantDrops:500,portraitDiscount:0.9,portraitDiscountLabel:'9 折',visible:true,order:2},
   {code:'pro',name:'专业会员',firstPriceCents:3990,renewPriceCents:4990,yearlyPriceCents:49900,grantDrops:1000,portraitDiscount:0.8,portraitDiscountLabel:'8 折',visible:true,order:3}
  ]
 }
 function mockMemberSub(){
  var now=Date.now()
  return {levelCode:'plus',levelName:'进阶会员',status:'active',startedAt:now-10*86400000,expiresAt:now+20*86400000,daysLeft:20,expiresSoon:false,autoRenew:false,badgeText:'进阶会员',portraitDiscount:0.9}
 }
 function mockMembershipCard(){
  var active=mockMemberActive()
  return {status:'ready',subscription:active?mockMemberSub():null,isFirstMonthAvailable:!active,purchaseEnabled:true,reason:'',plans:mockMemberPlans(),lowestFirstPriceCents:990,lowestRenewPriceCents:1990,balance:1200}
 }
 function mockMembershipStatus(){
  var active=mockMemberActive(),plans=mockMemberPlans()
  var rights=[{code:'grant',label:'每月赠滴',open:true,detail:active?'每期赠 500 滴':'每期赠 200 滴'},{code:'badge',label:'会员徽章',open:true},{code:'portrait',label:'AI 定妆照折扣',open:true,detail:active?'定妆照享 9 折':'会员生效后享定妆照折扣'},{code:'backgrounds',label:'卡面背景库',open:false},{code:'export',label:'数据长图导出',open:false},{code:'cards',label:'多套卡面保存',open:false},{code:'report',label:'赛季报告',open:false}]
  return {plans:plans.concat([{code:'family',name:'家庭会员',firstPriceCents:5990,renewPriceCents:6990,yearlyPriceCents:69900,grantDrops:2000,portraitDiscount:0.8,portraitDiscountLabel:'8 折',visible:false,order:4}]),sellablePlans:plans,subscription:active?mockMemberSub():null,isFirstMonthAvailable:!active,purchaseEnabled:true,reason:'',rights:rights,balance:1200}
 }
 function mockMembershipOrders(){
  var now=Date.now()
  return [
   {outTradeNo:'MT20261029000000ABCDEF1234',planCode:'plus',planName:'进阶会员',priceCents:1990,priceYuan:19.9,grantDrops:500,priceTier:'first',months:1,status:'paid',statusLabel:'已支付',ledgerState:'granted',createdAt:now-86400000,paidAt:now-86400000,closedAt:0},
   {outTradeNo:'MT20261029111111ABCDEF5678',planCode:'basic',planName:'基础会员',priceCents:1990,priceYuan:19.9,grantDrops:200,priceTier:'renew',months:1,status:'pending',statusLabel:'待支付',ledgerState:'pending',createdAt:now,paidAt:0,closedAt:0}
  ]
 }
 function mockResponse(p){
  if(p.action==='servicePrivatePlayerData')return Promise.resolve({success:true,data:{player:state.overview.players.filter(function(x){return x.id===p.playerId})[0]||state.overview.players[0],metrics:{appearances:12,goals:8,assists:5,starts:9,yellowCards:2,redCards:0},coverage:{goals:'complete'},matches:[{id:'m1',tournamentName:'2026郑州市青少年足球邀请赛',homeName:'郑州青少队',awayName:'洛阳金茂队',status:'finished',homeScore:3,awayScore:1,matchDate:'2026-10-12',matchTime:'15:00',venue:'郑州市体育中心'},{id:'m2',tournamentName:'2026郑州市青少年足球邀请赛',homeName:'开封铁路队',awayName:'郑州青少队',status:'upcoming',homeScore:null,awayScore:null,matchDate:'2026-10-19',matchTime:'10:00',venue:'开封体育场'}],events:[{matchId:'m1',type:'goal',minute:23,counted:true},{matchId:'m1',type:'assist',minute:56,counted:true}]}})
  if(p.action==='servicePrivateRefereeData')return Promise.resolve({success:true,data:{referee:state.overview.referee,summary:{total:18,completed:14,upcoming:4},matches:[{id:'r1',tournamentName:'2026郑州市青少年足球邀请赛',homeName:'郑州青少队',awayName:'洛阳金茂队',status:'finished',homeScore:3,awayScore:1,matchDate:'2026-10-12',matchTime:'15:00',venue:'郑州市体育中心',roles:['主裁判']}],workbenchUrl:'./?entry=workbench'}})
  if(p.action==='servicePrivateAccountData')return Promise.resolve({success:true,data:{wallet:{status:'ready',balance:1200,entries:[{label:'会员赠滴',delta:500,time:Date.now()-86400000},{label:'AI 定妆照',delta:-95,time:Date.now()}]},messages:{status:'ready',entries:[]},membership:mockMembershipCard()}})
  if(p.action==='servicePrivateMembershipStatus')return Promise.resolve(Object.assign({success:true},mockMembershipStatus()))
  if(p.action==='servicePrivateMembershipOrders')return Promise.resolve({success:true,rows:mockMembershipOrders(),subscription:mockMemberActive()?mockMemberSub():null,purchaseEnabled:true})
  if(p.action==='servicePrivateMembershipOrderStatus')return Promise.resolve({success:true,order:mockMembershipOrders()[0],subscription:mockMemberActive()?mockMemberSub():null,balance:1200})
  if(p.action==='servicePrivateMembershipSubscribe')return Promise.reject(Error('本地预览不发起真实支付，请用真实微信打开'))
  if(p.action==='serviceFeedbackSubmit')return Promise.resolve({success:true,feedbackId:'mockfb'+Date.now().toString().slice(-6)})
  return Promise.reject(Error('mock 不支持的动作'))
 }
 function api(p){if(MOCK)return mockResponse(p);p.serviceSessionToken=localStorage.getItem(KEY)||'';return fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)}).then(function(r){return r.json()}).then(function(r){if(typeof r.body==='string')r=JSON.parse(r.body);if(!r.success){if(r.code==='SERVICE_PRIVATE_AUTH_REQUIRED'&&!oauthPending){localStorage.removeItem(KEY);oauth()}throw Error(r.error||'读取失败，请重试')}return r})}
 function loading(){return '<div class="personal-loading" role="status">正在读取数据…</div>'}
 function error(message,retry){app.innerHTML='<section class="personal-state"><h1>暂时无法读取</h1><p>'+esc(message)+'</p><button id="retryButton" class="personal-primary">重新加载</button></section>';document.getElementById('retryButton').onclick=retry}
 function oauth(){oauthPending=true;state.epoch++;app.innerHTML=loading();api({action:'servicePrivateOAuthUrl',returnUrl:location.origin+location.pathname+(deepFeedback?'?deep=myFeedback':'')}).then(function(r){location.replace(r.authorizeUrl)}).catch(function(e){oauthPending=false;error(e.message,oauth)})}
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
   homeMemberCard()+'<section class="me-home-wallet" aria-label="我的蜂蜜"><div class="wallet-head"><strong>我的蜂蜜</strong><button data-action="honeyLedger">收支明细 ›</button></div><div class="wallet-body"><div class="amount"><strong id="homeHoneyBalance">—</strong><span>滴</span></div>'+homeRechargeEntry()+'</div><div id="homeHoneyStatus" class="wallet-foot">正在读取蜂蜜余额…</div></section>'+
   '<section class="me-home-game" aria-label="球员卡玩法"><button class="me-home-game-entry" data-action="homeCardGame"><span class="game-entry-text"><strong>球员卡玩法</strong><small>送出卡片 · 收集图鉴 · 组建阵容 · 阵容对战</small></span><i aria-hidden="true">›</i></button></section>'+
   '<section class="me-home-data"><button class="me-home-data-head" data-action="goData"><strong>'+(state.view==='player'?'我的比赛数据':'我的执裁数据')+'</strong><span>全部记录 ›</span></button><div id="homeMetrics" class="me-home-metrics">'+homeMetrics(null)+'</div>'+homeMenu(state.view==='player'?'shield':'event',state.view==='player'?'我的球员卡':'裁判任务',state.view==='player'?'homePlayerCards':'homeRefereeTasks')+'</section>'+
   '<h2 class="me-home-label">账号与服务</h2><section class="me-home-menu">'+homeMenu('list','继续球员登记','homeRegistrationResume')+homeMenu('lock','账号与安全','homeSecurity')+homeMenu('list','绑定管理','showBindings')+homeMenu('bell','消息通知','homeMessages')+homeMenu('event','会员订单','membershipOrders')+homeMenu('event','充值订单','honeyOrders')+homeMenu('shield','客服中心','support')+homeMenu('event','我的反馈','myFeedback')+'</section>'+
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
  var promise=api({action:'servicePrivateAccountData'}).then(function(r){if(generation!==homeAccountGeneration||token!==(localStorage.getItem(KEY)||''))return null;homeAccount=r.data;homeAccountAt=Date.now();updateHomeWallet();updateHomeMember();return r.data}).catch(function(error){if(generation!==homeAccountGeneration||token!==(localStorage.getItem(KEY)||''))return null;homeAccount={wallet:{status:'unavailable',balance:null,entries:[]},messages:{status:'unavailable',entries:[]}};updateHomeWallet();updateHomeMember();return homeAccount}).then(function(result){if(homeAccountPromise===promise)homeAccountPromise=null;return result})
  homeAccountPromise=promise;return promise
 }
 function homeTime(t){return t?new Date(t).toLocaleString('zh-CN',{hour12:false}):'时间未记录'}
 function showHomeAccount(kind){modal(kind==='ledger'?'蜂蜜收支':'消息通知','<p class="me-modal-text">正在读取…</p>');homeModal=kind;loadHomeAccount(true).then(function(data){if(!data||homeModal!==kind||!app.querySelector('.me-modal-mask'))return
  var result=kind==='ledger'?data.wallet:data.messages,entries=result&&result.entries||[],html=''
  if(!result||result.status!=='ready')html='<p class="me-modal-text">'+(kind==='ledger'&&result&&result.status==='not_open'?'尚未开通蜂蜜账户':kind==='ledger'?'蜂蜜余额暂不可核定，请稍后刷新':'消息暂不可用，请稍后刷新')+'</p>'
  else html=entries.length?'<div class="me-account-entries">'+entries.map(function(row){return '<div class="me-account-entry"><div><strong>'+esc(kind==='ledger'?row.label:row.title)+'</strong><small>'+esc(homeTime(row.time))+'</small>'+(kind==='ledger'?'':'<p>'+esc(row.content)+'</p>')+'</div>'+(kind==='ledger'?'<b>'+esc((row.delta>0?'+':'')+row.delta)+' 滴</b>':'')+'</div>'}).join('')+'</div>':'<p class="me-modal-text">'+(kind==='ledger'?'暂无收支记录':'暂无发给本人账号的消息')+'</p>'
  modal(kind==='ledger'?'蜂蜜收支':'消息通知',html)
 })}
 // 蜂蜜充值：单价与档位全部来自服务端（1 元 = 10 滴，档位未配置或支付未开通时不开放）。
 // 页面只负责展示与拉起收银台；是否到账一律以服务端订单状态为准，前端「支付成功」提示不加余额。
 state.honeyPack=0
 state.honeyBusy=false
 // 服务端查单失败时会回 queryError（含面向用户的 message 与 retryable）。
 // 页面必须把原因说出来，不能让「刷新状态」看起来像没反应。
 state.honeyQueryError=null
 function payQueryHint(kind){
  var e=state.honeyQueryError&&state.honeyQueryError.message
  if(e)return e
  return kind==='member'?'支付结果待确认（如已扣款不会重复扣费），请到「会员订单」刷新状态':'支付结果待确认（如已扣款不会重复扣费），请到「充值订单」刷新状态'
 }
 function isIosClient(){return /iPad|iPhone|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)}
 function isWechatClient(){return /micromessenger/i.test(navigator.userAgent)}
 function honeyWallet(){var w=homeAccount&&homeAccount.wallet;return w&&w.status==='ready'?w:null}
 function honeyBalance(){var w=honeyWallet();return w?w.balance:null}
 function honeyPacks(){var w=honeyWallet();return w&&Array.isArray(w.packs)?w.packs:[]}
 function honeyRechargeState(){var w=honeyWallet(),reason=isIosClient()?'IOS_VIRTUAL_PAYMENT_RESTRICTED':(w&&w.rechargeReason||''),available=!!(w&&w.rechargeAvailable===true)&&!isIosClient();return{available:available,reason:reason,packs:available?honeyPacks():[]}}
 function honeyReasonText(reason){return({PAYMENT_NOT_CONFIGURED:'微信支付待开通',PRICE_NOT_CONFIGURED:'充值档位待确认',PRICE_CONFIG_INVALID:'充值档位配置异常，暂不开放',PRICE_RATE_MISMATCH:'充值档位未按统一单价配置，暂不开放',PRICE_BONUS_UNCONFIRMED:'赠送滴数待确认，暂不开放',IOS_VIRTUAL_PAYMENT_RESTRICTED:'iOS 暂不支持购买蜂蜜滴',HONEY_ACCOUNT_NOT_OPEN:'请先完成服务号注册',HONEY_ACCOUNT_CONFLICT:'蜂蜜账户存在重复记录，请联系客服',HONEY_RECONCILING:'蜂蜜余额待核对，请稍后重试',HONEY_LEDGER_INVALID:'蜂蜜账本异常，请联系客服',NOT_WECHAT:'请在微信中打开后再支付',WECHAT_NOT_READY:'微信支付加载失败，请重新打开本页'})[reason]||'充值暂不可用，请稍后重试'}
 function yuanText(cents){var n=Number(cents)/100;return Number.isFinite(n)?(n%1===0?String(n):n.toFixed(2)):'—'}
 function homeRechargeEntry(){return isIosClient()?'<button class="recharge" disabled aria-label="iOS 暂不支持购买蜂蜜">iOS 暂不支持</button>':'<button class="recharge" data-action="honeyRecharge">充值</button>'}
 function renderHoneyPanel(){
  var recharge=honeyRechargeState(),packs=recharge.packs,balance=honeyBalance()
  if(!packs.length)state.honeyPack=0;else if(state.honeyPack>=packs.length)state.honeyPack=packs.length-1;else if(state.honeyPack<0)state.honeyPack=0
  var selected=packs[state.honeyPack]||null
  var packHtml=packs.map(function(item,index){
   return '<button class="me-honey-pack'+(index===state.honeyPack?' selected':'')+'" data-honey-pack="'+index+'" aria-pressed="'+(index===state.honeyPack)+'"><strong>'+item.totalDrops+'<span>滴</span></strong><small>'+yuanText(item.priceCents)+' 元</small>'+(item.bonusDrops?'<em>多送 '+item.bonusDrops+' 滴</em>':'')+'</button>'
  }).join('')
  var payable=!!(recharge.available&&selected&&!state.honeyBusy)
  var payLabel=state.honeyBusy?'支付处理中…':(payable?'微信支付 '+yuanText(selected.priceCents)+' 元':'微信支付待开通')
  var note=recharge.available?'支付结果以服务端确认到账为准，重复回调只入账一次；到账后可在这里的「收支明细」核对。':(honeyReasonText(recharge.reason)+'。当前不会创建订单，也不会扣款。')
  modal('蜂蜜充值',
   '<div class="me-honey-top"><span>当前余额</span><strong>'+(balance==null?'—':balance.toLocaleString('en-US'))+'<small> 滴</small></strong></div>'+
   (packHtml?'<div class="me-honey-packs" role="radiogroup" aria-label="选择充值档位">'+packHtml+'</div>':'')+
   (selected?'<div class="me-honey-summary"><span>支付 '+yuanText(selected.priceCents)+' 元</span><strong>到账 '+selected.totalDrops+' 滴</strong></div>':'')+
   '<button class="me-honey-pay" data-action="honeyPay" '+(payable?'':'disabled')+'>'+esc(payLabel)+'</button>'+
   '<p class="me-honey-note">'+esc(note)+'</p>')
 }
 // 微信 JSAPI 的 err_msg 在官方文档与不同客户端里写法不一致（get_brand_wcpay_request:ok 与
 // getBrandWCPayRequest:ok 都出现过）。只按某一种字面值比较，会把真实支付成功判成失败，
 // 于是出现「已经扣款却提示支付未完成」。这里统一去掉非字母字符并转小写后看结尾，
 // 无法识别的结果一律当作「待核实」，交给服务端主动查单定论，不提示用户重复支付。
 function invokeWechatPay(pay){
  return new Promise(function(resolve,reject){
   if(!pay||!pay['package'])return reject(Error('支付参数异常，请重新打开本页'))
   var done=false,finish=function(result,error){if(done)return;done=true;if(error)reject(error);else resolve(result)}
   function readResult(res){
    var msg=String(res&&res.err_msg||'').replace(/[^a-zA-Z]/g,'').toLowerCase()
    if(/ok$/.test(msg))return 'ok'
    if(/cancel/.test(msg))return 'cancel'
    return 'unknown'
   }
   function run(){
    try{
     WeixinJSBridge.invoke('getBrandWCPayRequest',{appId:pay.appId,timeStamp:pay.timeStamp,nonceStr:pay.nonceStr,'package':pay['package'],signType:pay.signType,paySign:pay.paySign},function(res){
      finish(readResult(res))
     })
    }catch(error){finish('unknown')}
   }
   if(typeof WeixinJSBridge!=='undefined'&&WeixinJSBridge.invoke)return run()
   if(document.addEventListener){document.addEventListener('WeixinJSBridgeReady',run,false);setTimeout(function(){if(typeof WeixinJSBridge==='undefined')finish('',Error(honeyReasonText('WECHAT_NOT_READY')))},3000);return}
   finish('',Error(honeyReasonText('WECHAT_NOT_READY')))
  })
 }
 // 支付成功后只轮询服务端订单状态；任何「支付成功」回调都不直接加余额
 function pollHoneyOrder(outTradeNo,attempt){
  attempt=attempt||0
  return api({action:'servicePrivateHoneyOrderStatus',outTradeNo:outTradeNo}).then(function(r){
   var order=r&&r.order
   if(r&&r.queryError)state.honeyQueryError=r.queryError
   if(order&&order.status==='paid'){state.honeyQueryError=null;return order}
   var wait=[1200,2000,3000,4000,6000][attempt]
   if(!wait||(r&&r.queryError&&r.queryError.retryable===false))return order||null
   return new Promise(function(resolve){setTimeout(resolve,wait)}).then(function(){return pollHoneyOrder(outTradeNo,attempt+1)})
  }).catch(function(){var wait=[1200,2000,3000,4000,6000][attempt];if(!wait)return null;return new Promise(function(resolve){setTimeout(resolve,wait)}).then(function(){return pollHoneyOrder(outTradeNo,attempt+1)})})
 }
 function honeyPay(){
  if(state.honeyBusy)return
  var recharge=honeyRechargeState(),pack=recharge.packs[state.honeyPack]
  if(!recharge.available||!pack){toast(honeyReasonText(recharge.reason));return}
  if(!isWechatClient()){toast(honeyReasonText('NOT_WECHAT'));return}
  state.honeyBusy=true;state.honeyQueryError=null;renderHoneyPanel()
  api({action:'servicePrivateHoneyRecharge',packId:pack.id,clientPlatform:isIosClient()?'ios':'wechat-h5'}).then(function(r){
   return invokeWechatPay(r.payParams).then(function(result){
    state.honeyBusy=false
    if(result==='cancel'){renderHoneyPanel();toast('已取消支付');return null}
    toast(result==='ok'?'支付已提交，正在确认到账…':'正在向微信核对支付结果…')
    return pollHoneyOrder(r.order.outTradeNo).then(function(order){
     if(order&&order.status==='paid'){loadHomeAccount(true);modal('充值成功','<p class="me-modal-text">已到账 '+order.totalDrops+' 滴，可在「收支明细」核对。</p><p class="me-modal-text">订单号 '+esc(order.outTradeNo)+'</p>');return}
     renderHoneyPanel();toast(payQueryHint('honey'))
    })
   })
  }).catch(function(e){state.honeyBusy=false;renderHoneyPanel();toast(e.message||'支付发起失败，请稍后重试')})
 }
 function renderHoneyOrders(){
  modal('充值订单','<p class="me-modal-text">正在读取…</p>')
  api({action:'servicePrivateHoneyOrders'}).then(function(r){
   if(!app.querySelector('.me-modal-mask'))return
   var rows=(r&&r.rows)||[]
   var html=rows.length?'<div class="me-account-entries">'+rows.map(function(order){
    var check=order.status==='pending'?'<div class="me-modal-actions"><button class="me-modal-cancel" data-honey-order="'+esc(order.outTradeNo)+'">我已完成支付，刷新状态</button></div>':''
    return '<div class="me-account-entry"><div><strong>'+esc(order.totalDrops)+' 滴 · '+yuanText(order.priceCents)+' 元</strong><small>'+esc(homeTime(order.createdAt))+' · '+esc(order.outTradeNo)+'</small>'+check+'</div><b>'+esc(order.statusLabel)+'</b></div>'
   }).join('')+'</div>':'<p class="me-modal-text">暂无充值订单</p>'
   modal('充值订单',html+(rows.length?'<p class="me-honey-note">未到账的订单不会增加余额；支付完成后由服务端主动查单确认，重复回调只入账一次。</p>':''))
  }).catch(function(e){if(app.querySelector('.me-modal-mask'))modal('充值订单','<p class="me-modal-text">读取失败：'+esc(e.message||'请稍后重试')+'</p>')})
 }
 function checkHoneyOrder(outTradeNo){
  toast('正在确认支付结果…')
  api({action:'servicePrivateHoneyOrderStatus',outTradeNo:outTradeNo}).then(function(r){
   var order=r&&r.order
   if(r&&r.queryError)state.honeyQueryError=r.queryError
   if(order&&order.status==='paid'){state.honeyQueryError=null;toast('已到账 '+order.totalDrops+' 滴');loadHomeAccount(true)}
   else toast(payQueryHint('honey'))
   renderHoneyOrders()
  }).catch(function(e){toast(e.message||'查询失败，请稍后重试')})
 }
 // ============ 会员（一期 A：30 天单次、不自动续费） ============
 // 档位、价格、首月资格、赠滴数全部来自服务端；页面不写死价格，也不自行判定资格。
 state.memberBusy=false
 function memberSummary(){var m=homeAccount&&homeAccount.membership;return m&&m.status==='ready'?m:null}
 function memberReasonText(reason){return({PAYMENT_NOT_CONFIGURED:'微信支付待开通',MEMBERSHIP_PLAN_NOT_CONFIGURED:'会员档位待配置',MEMBERSHIP_PLAN_INVALID:'会员档位配置异常，暂未开放',MEMBERSHIP_PLAN_NOT_OPEN:'该档位暂未开放',MEMBERSHIP_YEARLY_NOT_OPEN:'年付暂未开放',MEMBERSHIP_UNAVAILABLE:'会员信息暂不可用',IOS_VIRTUAL_PAYMENT_RESTRICTED:'iOS 暂不支持购买会员',HONEY_ACCOUNT_NOT_OPEN:'请先完成服务号注册',HONEY_ACCOUNT_CONFLICT:'蜂蜜账户存在重复记录，请联系客服',HONEY_RECONCILING:'蜂蜜余额待核对，请稍后重试',NOT_WECHAT:'请在微信中打开后再支付',WECHAT_NOT_READY:'微信支付加载失败，请重新打开本页'})[reason]||'会员暂不可用，请稍后重试'}
 function memberDate(ms){return ms?new Date(ms).toLocaleDateString('zh-CN'):'—'}
 function homeMemberCard(){
  var m=memberSummary()
  if(!m)return '<section class="me-home-member" id="homeMemberCard" aria-label="赛小蜂会员"><button class="me-member-entry" data-action="membershipCenter"><span class="me-member-text"><strong>赛小蜂会员</strong><small>正在读取会员信息…</small></span><i aria-hidden="true">›</i></button></section>'
  var sub=m.subscription,plans=m.plans||[],plan=plans[0]||null
  if(sub&&sub.status==='active'){
   var tail=sub.expiresSoon?'即将到期':'剩余 '+sub.daysLeft+' 天'
   return '<section class="me-home-member active" id="homeMemberCard" aria-label="赛小蜂会员"><button class="me-member-entry" data-action="membershipCenter"><span class="me-member-badge">'+esc(sub.levelName||sub.badgeText||'会员')+'</span><span class="me-member-text"><strong>'+esc((sub.levelName||'会员')+' · '+tail)+'</strong><small>有效期至 '+esc(memberDate(sub.expiresAt))+' · 到期不自动续费</small></span><i aria-hidden="true">›</i></button></section>'
  }
  if(sub&&sub.status==='expired'){
   return '<section class="me-home-member" id="homeMemberCard" aria-label="赛小蜂会员"><button class="me-member-entry" data-action="membershipCenter"><span class="me-member-text"><strong>会员已到期</strong><small>'+esc(memberDate(sub.expiresAt))+' 到期 · 续费恢复赠滴与折扣</small></span><span class="me-member-cta">续费</span></button></section>'
  }
  var price=m.lowestFirstPriceCents>0?yuanText(m.lowestFirstPriceCents)+' 元':'会员权益'
  var grant=plan?'每月赠 '+plan.grantDrops+' 滴':'每月赠滴'
  return '<section class="me-home-member" id="homeMemberCard" aria-label="赛小蜂会员"><button class="me-member-entry" data-action="membershipCenter"><span class="me-member-text"><strong>开通会员 · 首月 '+esc(price)+'起</strong><small>'+esc(grant)+' · 定妆照折扣 · 会员徽章</small></span><span class="me-member-cta">立即开通</span></button></section>'
 }
 function updateHomeMember(){var n=document.getElementById('homeMemberCard');if(!n)return;var holder=document.createElement('div');holder.innerHTML=homeMemberCard();var fresh=holder.firstChild;if(fresh)n.parentNode.replaceChild(fresh,n)}
 // 会员中心：整屏订阅页（会员卡头图 + 权益宫格 + 档位精选 + 吸底开通条），不再是普通弹层。
 // 版式参考公开定价页通用结构（头部品牌 + 权益 + 档位对比 + 吸附 CTA），样式与文案按本项目自写。
 var memberRightsIcon={grant:'gift',badge:'crown',portrait:'camera',backgrounds:'gallery',export:'chart',cards:'list',report:'event'}
 function memberIcon(code){return './assets/icons/'+(memberRightsIcon[code]||'shield')+'.svg'}
 function renderMembershipCenter(){
  state.memberStatus=null;state.memberPlan=''
  openMemberPage('<div class="mp-loading">正在读取会员信息…</div>')
  api({action:'servicePrivateMembershipStatus'}).then(function(r){
   if(!document.getElementById('memberPage'))return
   state.memberStatus=r||{};paintMemberPage()
  }).catch(function(e){
   if(!document.getElementById('memberPage'))return
   openMemberPage('<div class="mp-blocked"><strong>会员信息读取失败</strong><small>'+esc(e.message||'请稍后重试')+'</small></div>')
  })
 }
 function openMemberPage(inner){
  var page=document.getElementById('memberPage')
  if(!page){
   page=document.createElement('div');page.id='memberPage';page.className='mp-mask'
   page.innerHTML='<div class="mp-sheet" role="dialog" aria-label="赛小蜂会员"><header class="mp-nav"><button class="mp-back" data-member-close="1" aria-label="返回">‹</button><strong>赛小蜂会员</strong><span class="mp-nav-note">30 天单次 · 不自动续费</span></header><div class="mp-body"></div></div>'
   page.addEventListener('click',function(e){if(e.target===page)closeMemberPage()})
   app.appendChild(page)
  }
  page.querySelector('.mp-body').innerHTML=inner
 }
 function closeMemberPage(){var page=document.getElementById('memberPage');if(page)page.remove()}
 function paintMemberPage(){if(!state.memberStatus)return;openMemberPage(membershipCenterHtml(state.memberStatus))}
 function chooseMemberPlan(code){if(!code||code===state.memberPlan)return;state.memberPlan=code;paintMemberPage()}
 function membershipCenterHtml(r){
  var m=r||{},sub=m.subscription,plans=m.sellablePlans||[],open=!!(sub&&sub.status==='active'),ios=isIosClient()
  var first=m.isFirstMonthAvailable===true
  var currentIndex=-1
  if(open)plans.forEach(function(plan,index){if(plan.code===sub.levelCode)currentIndex=index})
  var selected=''
  plans.forEach(function(plan){if(plan.code===state.memberPlan)selected=plan.code})
  if(!selected){var fallback=open&&currentIndex>=0?plans[currentIndex]:(plans[1]||plans[0]);selected=fallback?fallback.code:''}
  state.memberPlan=selected
  var selectedPlan=null
  plans.forEach(function(plan){if(plan.code===selected)selectedPlan=plan})
  var hero='<div class="mp-hero"><div class="mp-hero-top"><span class="mp-crest">赛小蜂会员</span><span class="mp-pill">FAN CLUB</span></div>'+
   '<strong class="mp-hero-title">'+esc(open?(sub.levelName||'会员')+' · 剩余 '+sub.daysLeft+' 天':(sub?'会员已到期':'尚未开通会员'))+'</strong>'+
   '<small class="mp-hero-note">'+esc(sub?'有效期至 '+memberDate(sub.expiresAt)+' · 到期不自动续费':'首次开通享首月价，之后按同档续费价')+'</small></div>'
  var rights=(m.rights||[]).map(function(item){
   return '<li'+(item.open?'':' class="pending"')+'><img src="'+memberIcon(item.code)+'" alt=""><span><strong>'+esc(item.label)+'</strong><small>'+esc(item.open?(item.detail||'已开放'):'即将开放')+'</small></span></li>'
  }).join('')
  var rightsPanel=rights?'<section class="mp-panel"><h3 class="mp-title">会员权益<small>'+esc(open?'本档已生效':'开通后立即生效')+'</small></h3><ul class="mp-rights">'+rights+'</ul></section>':''
  var planHtml=''
  if(ios)planHtml='<div class="mp-blocked"><strong>iOS 暂不支持购买会员</strong><small>请在安卓或电脑微信中打开本页完成开通。</small></div>'
  else if(!m.purchaseEnabled)planHtml='<div class="mp-blocked"><strong>'+esc(memberReasonText(m.reason||'MEMBERSHIP_UNAVAILABLE'))+'</strong><small>当前不会创建订单，也不会扣款。</small></div>'
  else planHtml='<div class="mp-plans" role="radiogroup" aria-label="选择会员档位">'+plans.map(function(plan,index){
   var price=first?plan.firstPriceCents:plan.renewPriceCents
   var lower=open&&currentIndex>=0&&index<currentIndex
   var isCurrent=open&&plan.code===sub.levelCode
   var isSelected=plan.code===selected
   var flag=lower?'':(isCurrent?'正在使用':(open?'':(index===1?'推荐':'')))
   return '<button class="me-member-plan'+(isCurrent?' current':'')+(isSelected?' selected':'')+'" data-member-plan="'+esc(plan.code)+'" data-price-cents="'+esc(price)+'" data-price-tier="'+(first?'first':'renew')+'" aria-pressed="'+(isSelected?'true':'false')+'"'+(lower?' disabled':'')+'>'+
    (flag?'<span class="plan-flag">'+esc(flag)+'</span>':'')+
    '<strong class="plan-name">'+esc(plan.name)+'</strong>'+
    '<span class="plan-price"><i>¥</i><b>'+esc(yuanText(price))+'</b><em>'+(first?'首月价':'续费价')+'</em></span>'+
    '<span class="plan-line">每月赠 '+esc(plan.grantDrops)+' 滴</span>'+
    '<span class="plan-line dim">'+(lower?'当前档位更高，暂不支持降档':'定妆照'+esc(plan.portraitDiscountLabel))+'</span>'+
   '</button>'
  }).join('')+'</div>'
  var planPanel='<section class="mp-panel"><h3 class="mp-title">选择档位<small>'+(open?'续费在现有有效期上叠加 30 天':'首月价仅限首次开通')+'</small></h3>'+planHtml+'</section>'
  var payPrice=selectedPlan?(first?selectedPlan.firstPriceCents:selectedPlan.renewPriceCents):0
  var bar=selectedPlan&&!ios&&m.purchaseEnabled?'<div class="mp-bar"><div class="mp-bar-price"><small>'+(open?'续费':'实付')+'</small><strong>¥'+esc(yuanText(payPrice))+'</strong><em>'+(first?'首月价':'到期不自动续费')+'</em></div><button class="mp-buy" data-member-buy="'+esc(selectedPlan.code)+'">'+(open?'立即续费':'立即开通')+'</button></div>':''
  var note='<p class="mp-note">会员不会自动续费，到期需手动续费；已发放的滴不回收，可继续用于定妆照与卡面。<br>只买蜂蜜：<button class="mp-link" data-action="honeyRecharge">买蜂蜜（1 元 = 10 滴）</button></p>'
  return hero+rightsPanel+planPanel+note+bar
 }
 function membershipBuy(code){
  if(state.memberBusy)return
  if(!isWechatClient()){toast(memberReasonText('NOT_WECHAT'));return}
  if(!code){toast('请选择会员档位');return}
  state.memberBusy=true;state.honeyQueryError=null;toast('正在发起支付…')
  api({action:'servicePrivateMembershipSubscribe',planCode:code,clientPlatform:isIosClient()?'ios':'wechat-h5'}).then(function(r){
   return invokeWechatPay(r.payParams).then(function(result){
    state.memberBusy=false
    if(result==='cancel'){paintMemberPage();toast('已取消支付');return null}
    toast(result==='ok'?'支付已提交，正在确认会员…':'正在向微信核对支付结果…')
    return pollMembershipOrder(r.order.outTradeNo).then(function(res){
     if(res&&res.order&&res.order.status==='paid'){closeMemberPage();loadHomeAccount(true);var s=res.subscription||{};modal('会员开通成功','<p class="me-modal-text">已赠 '+esc(res.order.grantDrops)+' 滴，可在「蜂蜜收支」核对。</p><p class="me-modal-text">'+esc((s.levelName||'会员')+' · 有效期至 '+memberDate(s.expiresAt))+'</p><p class="me-modal-text">订单号 '+esc(res.order.outTradeNo)+'</p>');return}
     renderMembershipCenter();toast(payQueryHint('member'))
    })
   })
  }).catch(function(e){state.memberBusy=false;paintMemberPage();toast(e.message||'支付发起失败，请稍后重试')})
 }
 // 支付成功后只轮询服务端订单状态；会员与赠滴是否到账只看服务端结论
 function pollMembershipOrder(outTradeNo,attempt){
  attempt=attempt||0
  return api({action:'servicePrivateMembershipOrderStatus',outTradeNo:outTradeNo}).then(function(r){
   var order=r&&r.order
   if(r&&r.queryError)state.honeyQueryError=r.queryError
   if(order&&order.status==='paid'){state.honeyQueryError=null;return r}
   var wait=[1200,2000,3000,4000,6000][attempt]
   if(!wait||(r&&r.queryError&&r.queryError.retryable===false))return r
   return new Promise(function(resolve){setTimeout(resolve,wait)}).then(function(){return pollMembershipOrder(outTradeNo,attempt+1)})
  }).catch(function(){var wait=[1200,2000,3000,4000,6000][attempt];if(!wait)return null;return new Promise(function(resolve){setTimeout(resolve,wait)}).then(function(){return pollMembershipOrder(outTradeNo,attempt+1)})})
 }
 function renderMembershipOrders(){
  modal('会员订单','<p class="me-modal-text">正在读取…</p>')
  api({action:'servicePrivateMembershipOrders'}).then(function(r){
   if(!app.querySelector('.me-modal-mask'))return
   var rows=(r&&r.rows)||[]
   var html=rows.length?'<div class="me-account-entries">'+rows.map(function(order){
    var check=order.status==='pending'?'<div class="me-modal-actions"><button class="me-modal-cancel" data-member-order="'+esc(order.outTradeNo)+'">我已完成支付，刷新状态</button></div>':''
    return '<div class="me-account-entry"><div><strong>'+esc(order.planName||'会员')+' · '+yuanText(order.priceCents)+' 元</strong><small>'+esc(homeTime(order.createdAt))+' · 赠 '+esc(order.grantDrops)+' 滴 · '+esc(order.outTradeNo)+'</small>'+check+'</div><b>'+esc(order.statusLabel)+'</b></div>'
   }).join('')+'</div>':'<p class="me-modal-text">暂无会员订单</p>'
   modal('会员订单',html+'<p class="me-honey-note">未到账的订单不会开通会员；支付完成后由服务端主动查单确认，重复回调只发放一次。</p>')
  }).catch(function(e){if(app.querySelector('.me-modal-mask'))modal('会员订单','<p class="me-modal-text">读取失败：'+esc(e.message||'请稍后重试')+'</p>')})
 }
 function checkMembershipOrder(outTradeNo){
  toast('正在确认支付结果…')
  api({action:'servicePrivateMembershipOrderStatus',outTradeNo:outTradeNo}).then(function(r){
   var order=r&&r.order
   if(r&&r.queryError)state.honeyQueryError=r.queryError
   if(order&&order.status==='paid'){state.honeyQueryError=null;toast('会员已开通，赠滴已到账');loadHomeAccount(true)}
   else toast(payQueryHint('member'))
   renderMembershipOrders()
  }).catch(function(e){toast(e.message||'查询失败，请稍后重试')})
 }

 function homeAction(action){
  if(action==='homeRegistrationResume'){location.href='./registration-resume.html';return true}
  if(action==='membershipCenter'){renderMembershipCenter();return true}
  if(action==='membershipOrders'){renderMembershipOrders();return true}
  if(action==='honeyRecharge'){if(isIosClient()){toast(honeyReasonText('IOS_VIRTUAL_PAYMENT_RESTRICTED'));return true}state.honeyPack=0;renderHoneyPanel();loadHomeAccount(false).then(function(){if(app.querySelector('.me-modal'))renderHoneyPanel()});return true}
  if(action==='honeyOrders'){renderHoneyOrders();return true}
  if(action==='honeyPay'){honeyPay();return true}
  if(action==='honeyLedger'||action==='homeMessages'){showHomeAccount(action==='honeyLedger'?'ledger':'messages');return true}
  if(action==='homePlayerCards'){location.href='./player-cards.html';return true}
  if(action==='homeCardGame'){location.href='./player-card-game.html';return true}
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
  else if(t.dataset.memberBuy){membershipBuy(t.dataset.memberBuy)}
  else if(t.dataset.memberPlan){if(!t.disabled)chooseMemberPlan(t.dataset.memberPlan)}
  else if(t.dataset.memberClose)closeMemberPage()
  else if(t.dataset.memberOrder){checkMembershipOrder(t.dataset.memberOrder)}
  else if(t.dataset.honeyPack!=null){state.honeyPack=Number(t.dataset.honeyPack)||0;renderHoneyPanel()}
  else if(t.dataset.honeyOrder){checkHoneyOrder(t.dataset.honeyOrder)}
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
 function overview(){homeAccountGeneration++;homeAccount=null;homeAccountAt=0;homeAccountPromise=null;state.epoch++;app.innerHTML=loading();api({action:'servicePrivateOverview'}).then(function(r){if(r.needsBinding){app.innerHTML='<section class="personal-state"><h1>尚未绑定球员或裁判</h1><p>球员从球队资料邀请完成绑定；裁判从本人任务验证手机号。</p><a class="personal-primary personal-task-link" href="./?entry=workbench">裁判任务</a></section>';return}state.overview=r.data;renderHome();if(deepFeedback){deepFeedback=false;showMyFeedback()}}).catch(function(e){if(!oauthPending)error(e.message,overview)})}
 // 本地预览：me.html?mock=1 使用假数据渲染，不请求微信
 function mockOverview(){state.overview={schemaVersion:'service-personal/2',phoneMasked:'138****1663',hasReferee:true,referee:{name:'郑旭升',level:'国家二级裁判',avatar:''},players:[{id:'p1',name:'郑旭升',teamName:'郑州青少队',jerseyNumber:'7',relation:'self',avatar:''},{id:'p2',name:'郑晓峰',teamName:'郑州青少队',jerseyNumber:'10',relation:'guardian',avatar:''}]};renderHome()}
 var deepFeedback=location.hash.indexOf('myFeedback')>=0||new URLSearchParams(location.search).get('deep')==='myFeedback'
 var q=new URLSearchParams(location.search);if(q.get('code')&&q.get('state'))complete(q.get('code'),q.get('state'));else if(MOCK){mockOverview();var mview=new URLSearchParams(location.search).get('view');if(mview==='data'){var dd=state.overview;select(dd.players.length?'player':'referee',dd.players[0]?dd.players[0].id:'')}else if(mview==='support')renderSupport()}else if(localStorage.getItem(KEY))overview();else oauth()
})()