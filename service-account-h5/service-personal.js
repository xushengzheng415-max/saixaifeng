(function(){
 'use strict'
 var API='https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi',KEY='sxf_referee_h5_session',app=document.getElementById('app')
 var PAGE_VERSION='v2.14'
 // 本地预览（?mock=1）：只在 file://、本机或局域网私网地址生效，避免线上被加参数后展示假会员与假余额
 var MOCK=/[?&]mock=1(?:&|$)/.test(location.search)&&(/^file:/.test(location.protocol)||/^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(location.origin)||/^http:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(?::\d+)?$/i.test(location.origin))
 var state={overview:null,view:'player',playerId:'',detail:null,participation:null,participationKind:'profile',passFilter:'all',presentPassId:'',epoch:0},oauthPending=false
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
 function mockParticipation(){
  var BUY='https://anlan-dplatform-h5.cn-anlan.com/?channelCode=100998&goodsId=170&promotionId=144&tenantFrom=ba&thirdOrderNo=100998_261606&thirdOrderNoType=1&flag=aquarius'
  function materials(name,birth,idMasked,jersey,verified,photoOk,insState){
   return [
    {key:'name',label:'姓名',value:name,state:'ok'},
    {key:'birthDate',label:'出生日期',value:birth,state:'ok'},
    {key:'identity',label:'证件信息',value:idMasked,state:'ok'},
    {key:'photo',label:'形象照',value:photoOk?'已上传':'待补',state:photoOk?'ok':'warn'},
    {key:'jersey',label:'球衣号',value:String(jersey),state:'ok'},
    {key:'identityCheck',label:'人证核验',value:verified?'已通过':'审核中',state:verified?'ok':'pending'},
    {key:'insurance',label:'保险资料',value:insState==='pending'?'待提交':insState==='not_required'?'未要求':'已提交',state:insState==='pending'?'warn':insState==='not_required'?'muted':'ok',actionable:insState==='pending'}
   ]
  }
  return [
   {id:'p1|e1|t1|d1',playerId:'p1',playerName:'郑旭升',relation:'self',photoUrl:'',gender:'男',birthDate:'2008-06-18',identityMasked:'410***********1234',jerseyNumber:'7',position:'前锋',tournamentId:'e1',tournamentName:'2026郑州市青少年足球邀请赛',eventStatus:'ongoing',startDate:'2026-10-10',endDate:'2026-10-20',venue:'郑州市体育中心',divisionId:'d1',divisionName:'U17 男子组',teamId:'t1',teamName:'郑州青少队',registrationStatus:'approved',registrationStatusText:'报名已通过',rosterStatus:'approved',rosterStatusText:'名单已审核',rosterVersion:2,state:'approved',stateText:'已进入正式名单',stateTone:'ok',reason:'',materials:materials('郑旭升','2008-06-18','410***********1234',7,true,true,'submitted'),teamLogoUrl:'./assets/logo-saixiaofeng-football.png',insurance:{required:true,ready:true,canUpload:false,state:'submitted',text:'保险资料已提交',tone:'ok',productType:'人身意外伤害保险',purchaseUrl:BUY,purchaseLabel:'去购买保险',uploaderHint:'请由球员本人上传保单 PDF'},pass:{eligible:true,stateText:'可出示 · 现场按照片核验',mode:'adult',number:'SXF-20261030-K7F2X',issuedAt:null,note:'成人电子参赛证；进入正式名单后可随时刷新动态签名二维码，供助理裁判现场扫码做资格审查，扫码后仍须当面核对照片。',qr:{status:'ready',reason:'点击即可刷新，供助理裁判现场扫码',matches:[{matchId:'m-ready',teamsText:'郑州青少队 vs 洛阳金茂队',timeText:'2026-10-30 15:00'}]}}},
   {id:'p2|e1|t1|d2',playerId:'p2',playerName:'郑晓峰',relation:'guardian',photoUrl:'',gender:'男',birthDate:'2018-03-12',identityMasked:'410***********5678',jerseyNumber:'10',position:'中场',tournamentId:'e1',tournamentName:'2026郑州市青少年足球邀请赛',eventStatus:'ongoing',startDate:'2026-10-10',endDate:'2026-10-20',venue:'郑州市体育中心',divisionId:'d2',divisionName:'U9 男子组',teamId:'t1',teamName:'郑州青少队',registrationStatus:'approved',registrationStatusText:'报名已通过',rosterStatus:'approved',rosterStatusText:'名单已审核',rosterVersion:2,state:'approved',stateText:'已进入正式名单',stateTone:'ok',reason:'',materials:materials('郑晓峰','2018-03-12','410***********5678',10,true,true,'pending'),teamLogoUrl:'./assets/logo-saixiaofeng-football.png',insurance:{required:true,ready:false,canUpload:true,state:'pending',text:'保险资料待提交',tone:'warn',productType:'',purchaseUrl:BUY,purchaseLabel:'去购买保险',uploaderHint:'请由监护人上传保单 PDF',disclaimer:'平台仅核验保单文字与赛事要求，不替代保险公司承保确认。'},pass:{eligible:false,stateText:'需先提交本赛事保险资料',mode:'youth',number:'',issuedAt:null,note:'本组别要求保险；确认提交保单后方可出示参赛证。青少年现场不扫码，由助理裁判按照片核验。',qr:{status:'locked',reason:'需先提交本赛事保险资料',matches:[]}}},
   {id:'p2|e2|t1|d3',playerId:'p2',playerName:'郑晓峰',relation:'guardian',photoUrl:'',gender:'男',birthDate:'2018-03-12',identityMasked:'410***********5678',jerseyNumber:'10',position:'中场',tournamentId:'e2',tournamentName:'2026开封周末联赛秋季赛',eventStatus:'registering',startDate:'2026-11-01',endDate:'2026-11-15',venue:'开封体育场',divisionId:'d3',divisionName:'U9 男子组',teamId:'t1',teamName:'郑州青少队',registrationStatus:'approved',registrationStatusText:'报名已通过',rosterStatus:'submitted',rosterStatusText:'名单待审核',rosterVersion:1,state:'reviewing',stateText:'名单待主办方审核',stateTone:'pending',reason:'',materials:[{key:'name',label:'姓名',value:'郑晓峰',state:'ok'},{key:'birthDate',label:'出生日期',value:'2018-03-12',state:'ok'},{key:'identity',label:'证件信息',value:'410***********5678',state:'ok'},{key:'photo',label:'形象照',value:'待补',state:'warn'},{key:'jersey',label:'球衣号',value:'10',state:'ok'},{key:'identityCheck',label:'人证核验',value:'未要求',state:'muted'},{key:'insurance',label:'保险资料',value:'未要求',state:'muted'}],teamLogoUrl:'./assets/logo-saixiaofeng-football.png',insurance:{required:false,ready:false,canUpload:false,state:'not_required',text:'本赛事未要求保险',tone:'muted',purchaseUrl:'',purchaseLabel:''},pass:{eligible:false,stateText:'正式名单通过后可出示',mode:'youth',number:'',issuedAt:null,note:'青少年现场不扫码，由助理裁判按照片逐人核验。',qr:{status:'locked',reason:'正式名单通过后可出示',matches:[]}}}
  ]
 }
 function mockResponse(p){
  if(p.action==='servicePrivatePlayerData')return Promise.resolve({success:true,data:{player:state.overview.players.filter(function(x){return x.id===p.playerId})[0]||state.overview.players[0],metrics:{appearances:12,goals:8,assists:5,starts:9,yellowCards:2,redCards:0},coverage:{goals:'complete'},matches:[{id:'m1',tournamentName:'2026郑州市青少年足球邀请赛',homeName:'郑州青少队',awayName:'洛阳金茂队',status:'finished',homeScore:3,awayScore:1,matchDate:'2026-10-12',matchTime:'15:00',venue:'郑州市体育中心'},{id:'m2',tournamentName:'2026郑州市青少年足球邀请赛',homeName:'开封铁路队',awayName:'郑州青少队',status:'upcoming',homeScore:null,awayScore:null,matchDate:'2026-10-19',matchTime:'10:00',venue:'开封体育场'}],events:[{matchId:'m1',type:'goal',minute:23,counted:true},{matchId:'m1',type:'assist',minute:56,counted:true}]}})
  if(p.action==='servicePrivateRefereeData')return Promise.resolve({success:true,data:{referee:state.overview.referee,summary:{total:18,completed:14,upcoming:4},matches:[{id:'r1',tournamentName:'2026郑州市青少年足球邀请赛',homeName:'郑州青少队',awayName:'洛阳金茂队',status:'finished',homeScore:3,awayScore:1,matchDate:'2026-10-12',matchTime:'15:00',venue:'郑州市体育中心',roles:['主裁判']}],workbenchUrl:'./?entry=workbench'}})
  if(p.action==='servicePrivateAccountData')return Promise.resolve({success:true,data:{wallet:{status:'ready',balance:1200,entries:[{label:'会员赠滴',delta:500,time:Date.now()-86400000},{label:'AI 定妆照',delta:-95,time:Date.now()}]},messages:{status:'ready',entries:[]},membership:mockMembershipCard()}})
  if(p.action==='servicePrivateParticipation')return Promise.resolve({success:true,data:{schemaVersion:'service-personal/4',items:mockParticipation()}})
  if(p.action==='servicePrivateAdultMatchPass'){var svg='data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><rect width="240" height="240" fill="#fff"/><rect x="16" y="16" width="48" height="48" fill="#083d27"/><rect x="176" y="16" width="48" height="48" fill="#083d27"/><rect x="16" y="176" width="48" height="48" fill="#083d27"/><rect x="80" y="80" width="80" height="80" fill="#083d27"/><rect x="96" y="96" width="48" height="48" fill="#fff"/><text x="120" y="228" text-anchor="middle" font-size="12" fill="#083d27">MOCK QR</text></svg>');return Promise.resolve({success:true,data:{certificate:{id:'c1',number:'SXF-20261030-K7F2X'},matchPass:{id:'pass1',expiresAt:Date.now()+2*60*60*1000,qrUrl:svg},match:{id:p.matchId||'m-ready',teamsText:'郑州青少队 vs 洛阳金茂队',timeText:'2026-10-30 15:00'},player:{id:p.playerId||'p1',name:'郑旭升',jerseyNumber:'7'}}})}
  if(p.action==='servicePrivateMembershipStatus')return Promise.resolve(Object.assign({success:true},mockMembershipStatus()))
  if(p.action==='servicePrivateMembershipOrders')return Promise.resolve({success:true,rows:mockMembershipOrders(),subscription:mockMemberActive()?mockMemberSub():null,purchaseEnabled:true})
  if(p.action==='servicePrivateMembershipOrderStatus')return Promise.resolve({success:true,order:mockMembershipOrders()[0],subscription:mockMemberActive()?mockMemberSub():null,balance:1200})
  if(p.action==='servicePrivateMembershipSubscribe')return Promise.reject(Error('本地预览不发起真实支付，请用真实微信打开'))
  if(p.action==='serviceFeedbackSubmit')return Promise.resolve({success:true,feedbackId:'mockfb'+Date.now().toString().slice(-6)})
  if(p.action==='servicePrivateInsurancePurchaseClick')return Promise.resolve({success:true,recorded:true})
  if(p.action==='servicePrivateInsuranceUpload'||p.action==='servicePrivateInsuranceRecognize'){
   return Promise.resolve({success:true,draft:{draftId:'mock-draft-1',playerId:p.playerId||'p2',tournamentId:p.tournamentId||'e1',divisionId:p.divisionId||'d2',status:'recognized',insuredName:'郑晓峰',coverStart:'2026-10-01',coverEnd:'2026-10-31',policyNo:'MOCK20261030',productType:'人身意外伤害保险',matchResult:'matched',reviewFlag:'auto_matched',message:'姓名与保障期核对一致（本地预览假数据）',disclaimer:'平台仅核验保单文字与赛事要求，不替代保险公司承保确认。'}})
  }
  if(p.action==='servicePrivateInsuranceConfirm'){
   return Promise.resolve({success:true,qualificationId:'mock-qual-1',insurance:{required:true,ready:true,canUpload:false,state:'submitted',text:'保险资料已提交',tone:'ok',matchResult:'matched',reviewFlag:'auto_matched',policyNo:'MOCK20261030',productType:'人身意外伤害保险',coverStart:'2026-10-01',coverEnd:'2026-10-31',message:'姓名与保障期核对一致（本地预览假数据）',disclaimer:'平台仅核验保单文字与赛事要求，不替代保险公司承保确认。'}})
  }
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
   '<section class="me-usercard me-home-profile" aria-label="当前资料">'+portrait(current&&current.avatar,name)+'<div><h1>'+esc(name)+'<span class="me-name-mark" id="homeNameMark" aria-label="会员标识"></span></h1><p>'+esc(d.phoneMasked||'')+'</p></div><button data-action="homeProfile">个人资料 ›</button></section>'+
   '<nav class="me-home-roles" aria-label="切换身份"><button data-home-role="player" aria-pressed="'+(state.view==='player')+'" '+(!players.length?'disabled':'')+'>球员身份</button><button data-home-role="referee" aria-pressed="'+(state.view==='referee')+'" '+(!d.hasReferee?'disabled':'')+'>裁判身份</button></nav>'+
   '<div class="me-home-context"><span>'+esc(relation.filter(Boolean).join(' · ')||'尚未绑定业务身份')+'</span>'+(state.view==='player'&&players.length>1?'<button data-action="homePlayers">切换球员 ›</button>':'')+'</div>'+
   homeMemberCard()+'<section class="me-home-wallet" aria-label="我的蜂蜜"><div class="wallet-head"><strong>我的蜂蜜</strong><button data-action="honeyLedger">收支明细 ›</button></div><div class="wallet-body"><div class="amount"><strong id="homeHoneyBalance">—</strong><span>滴</span></div>'+homeRechargeEntry()+'</div><div id="homeHoneyStatus" class="wallet-foot">正在读取蜂蜜余额…</div></section>'+
   '<section class="me-home-game" aria-label="球员卡玩法"><button class="me-home-game-entry" data-action="homeCardGame"><span class="game-entry-text"><strong>球员卡玩法</strong><small>送出卡片 · 收集图鉴 · 组建阵容 · 阵容对战</small></span><i aria-hidden="true">›</i></button></section>'+
   '<section class="me-home-data"><button class="me-home-data-head" data-action="goData"><strong>'+(state.view==='player'?'我的比赛数据':'我的执裁数据')+'</strong><span>全部记录 ›</span></button><div id="homeMetrics" class="me-home-metrics">'+homeMetrics(null)+'</div>'+homeMenu(state.view==='player'?'shield':'event',state.view==='player'?'卡世界':'裁判任务',state.view==='player'?'homePlayerCards':'homeRefereeTasks')+'</section>'+
   (state.view==='player'?participationHome():'')+
   '<h2 class="me-home-label">账号与服务</h2><section class="me-home-menu">'+homeMenu('list','继续球员登记','homeRegistrationResume')+homeMenu('lock','账号与安全','homeSecurity')+homeMenu('list','绑定管理','showBindings')+homeMenu('bell','消息通知','homeMessages')+homeMenu('event','会员订单','membershipOrders')+homeMenu('event','充值订单','honeyOrders')+homeMenu('shield','客服中心','support')+homeMenu('event','我的反馈','myFeedback')+'</section>'+
   '<div class="me-home-footer"><button data-action="openTournament">赛事中心</button><span>·</span><button data-action="about">关于赛小蜂</button><span>·</span><button data-action="logout">退出登录</button></div></main></div>'
  updateHomeWallet();loadHomeStats();loadHomeAccount(false);loadParticipation(false)
 }
 var participationAt=0,participationPromise=null,participationGeneration=0
 function participationHome(){
  return '<section class="me-home-participation" aria-label="我的参赛"><div class="me-home-participation-head"><strong>我的参赛</strong><span id="homeParticipationSummary">正在读取…</span></div><div class="me-pp-entries">'+
   '<button class="me-pp-entry" data-action="homeParticipationProfile">'+homeIcon('list')+'<span class="me-pp-entry-text"><strong>我的参赛资料</strong><small id="ppProfileNote">赛事 · 组别 · 球队 · 号码</small></span><i aria-hidden="true">›</i></button>'+
   '<button class="me-pp-entry" data-action="homeParticipationPass">'+homeIcon('shield')+'<span class="me-pp-entry-text"><strong>我的电子参赛证</strong><small id="ppPassNote">正式名单通过后可出示</small></span><i aria-hidden="true">›</i></button>'+
   '<button class="me-pp-entry" data-action="homeParticipationInsurance">'+homeIcon('event')+'<span class="me-pp-entry-text"><strong>赛事保险资料</strong><small id="ppInsuranceNote">保单上传 · 可选购买引导</small></span><i aria-hidden="true">›</i></button>'+
  '</div><p class="me-pp-foot">只显示本人或监护球员的参赛关系，结果以主办方审核的正式名单为准</p></section>'
 }
 function loadParticipation(force){
  if(state.view!=='player')return Promise.resolve(null)
  if(participationGeneration===0)participationGeneration++
  var generation=participationGeneration,token=localStorage.getItem(KEY)||''
  if(!force&&state.participation&&Date.now()-participationAt<60000){paintParticipationHome();return Promise.resolve(state.participation)}
  if(participationPromise)return participationPromise
  var promise=api({action:'servicePrivateParticipation'}).then(function(r){if(generation!==participationGeneration||token!==(localStorage.getItem(KEY)||''))return null;state.participation=r.data||{items:[]};participationAt=Date.now();paintParticipationHome();return state.participation}).catch(function(){if(generation!==participationGeneration)return null;state.participation=null;participationAt=Date.now();paintParticipationHome(true);return null}).then(function(result){if(participationPromise===promise)participationPromise=null;return result})
  participationPromise=promise;return promise
 }
 function participationItems(){return (state.participation&&state.participation.items)||[]}
 function playerParticipation(){return participationItems().filter(function(item){return item.playerId===state.playerId})}
 function paintParticipationHome(failed){
  var summary=document.getElementById('homeParticipationSummary'),profileNote=document.getElementById('ppProfileNote'),passNote=document.getElementById('ppPassNote'),insNote=document.getElementById('ppInsuranceNote')
  if(!summary||!profileNote||!passNote)return
  var items=playerParticipation(),latest=items[0]||null,eligible=items.filter(function(item){return item.pass&&item.pass.eligible}),pendingIns=items.filter(function(item){return item.insurance&&item.insurance.canUpload})
  summary.textContent=failed?'暂不可用':items.length?items.length+' 项参赛':'暂无参赛'
  profileNote.textContent=failed?'参赛资料暂不可用':latest?latest.tournamentName+' · '+latest.stateText:'报名通过后在此查看参赛资料'
  passNote.textContent=failed?'参赛证暂不可用':eligible.length?eligible.length+' 张可出示':items.length?'正式名单通过后可出示':'暂无可用参赛证'
  if(insNote)insNote.textContent=failed?'保险资料暂不可用':pendingIns.length?pendingIns.length+' 项待上传保单':items.some(function(item){return item.insurance&&item.insurance.required})?'保单已齐或待核对':'本赛事未要求保险'
 }
 function participationTone(value){return ['ok','pending','warn','muted'].indexOf(value)>=0?value:'muted'}
 function participationFact(label,value){return '<div><span>'+esc(label)+'</span><b>'+esc(value||'—')+'</b></div>'}
 function participationWhen(item){return [item.startDate?'比赛日期 '+item.startDate+(item.endDate?' 至 '+item.endDate:''):'',item.venue].filter(Boolean).join(' · ')}
 function participationProfileCard(item){
  var materials=(item.materials||[]).map(function(row){
   var insurance=item.insurance||{}
   var canUpload=row.key==='insurance'&&(row.actionable===true||insurance.canUpload===true)
   var canBuy=row.key==='insurance'&&!!insurance.purchaseUrl
   var cls=participationTone(row.state)+(row.key==='identity'||row.key==='insurance'?' wide':'')+(canUpload||canBuy?' actionable':'')
   if(canUpload||canBuy){
    var actions=(canBuy?'<button type="button" class="pp-mat-chip buy" data-insurance-buy="'+esc(item.id)+'">'+esc(insurance.purchaseLabel||'去购买')+'</button>':'')+(canUpload?'<button type="button" class="pp-mat-chip upload" data-insurance-upload="'+esc(item.id)+'">上传保单</button>':'')
    return '<li class="'+cls+' pp-mat-ins"><div class="pp-mat-ins-row"><span>'+esc(row.label)+'</span><b class="pp-mat-ins-status">'+esc(row.value)+'</b></div><div class="pp-mat-ins-actions">'+actions+'</div></li>'
   }
   return '<li class="'+cls+'"><span>'+esc(row.label)+'</span><b>'+esc(row.value)+'</b></li>'
  }).join('')
  var when=participationWhen(item)
  var insuranceTip=(item.insurance&&item.insurance.required&&item.insurance.canUpload)?'<p class="pp-tip">'+esc(item.insurance.uploaderHint||'请上传意外险保单 PDF')+'。外链购买仅作引导；平台只核验保单文字中的姓名与保障期，不替代保险公司承保确认。</p>':''
  return '<article class="pp-card"><div class="pp-card-head"><div><strong>'+esc(item.tournamentName)+'</strong><small>'+esc([item.divisionName,item.teamName].filter(Boolean).join(' · '))+'</small></div><span class="pp-state '+participationTone(item.stateTone)+'">'+esc(item.stateText)+'</span></div>'+
   '<div class="pp-facts">'+participationFact('球员',item.playerName)+participationFact('球衣号',item.jerseyNumber?item.jerseyNumber+'号':'待定')+participationFact('位置',item.position)+participationFact('报名状态',item.registrationStatusText)+'</div>'+
   (when?'<p class="pp-when">'+esc(when)+'</p>':'')+
   '<h3 class="pp-sub">参赛资料</h3><ul class="pp-materials">'+materials+'</ul>'+
   insuranceTip+
   (item.reason?'<p class="pp-reason">'+esc(item.reason)+'</p>':'')+
   (item.state!=='approved'?'<p class="pp-tip">'+esc(item.rosterStatusText)+'；资料修改请联系球队管理员在球队端更新后重新提交。</p>':'')+
  '</article>'
 }
 function passNumberText(item){
  var pass=item.pass||{},mode=pass.mode
  if(pass.number)return pass.number
  if(mode==='youth')return '按名单核验'
  if(pass.eligible)return '证号待生成'
  return '—'
 }
 function passModeLabel(mode){
  return mode==='adult'?'成人电子参赛证':mode==='youth'?'青少年电子参赛证':'电子参赛证'
 }
 function passVerifyLabel(mode){
  return mode==='adult'?'现场当面核对照片':mode==='youth'?'现场按名单核验':'资料待完善'
 }
 function passInsuranceBanner(item){
  var info=item.insurance||{},tone=participationTone(info.tone||'muted')
  var actions=[]
  if(info.purchaseUrl)actions.push('<button type="button" class="pp-ins-buy" data-insurance-buy="'+esc(item.id)+'">'+esc(info.purchaseLabel||'去购买保险')+'</button>')
  if(info.canUpload)actions.push('<button type="button" class="pp-ins-upload" data-insurance-upload="'+esc(item.id)+'">上传保单</button>')
  return '<div class="pp-pass-insurance '+tone+'"><div class="pp-pass-insurance-main"><span>保险</span><b>'+esc(info.text||'保险信息待确认')+'</b>'+(info.productType?'<small>'+esc(info.productType)+'</small>':'')+'</div>'+(actions.length?'<div class="pp-pass-insurance-actions">'+actions.join('')+'</div>':'')+'</div>'
 }
 function passQrPanel(item,opts){
  opts=opts||{}
  var pass=item.pass||{},qr=pass.qr||{},mode=pass.mode,cache=(state.passQrCache&&state.passQrCache[item.id])||null
  if(mode==='youth'||qr.status==='not_applicable'){
   return '<div class="pp-pass-qr youth"><strong>现场核验</strong><p>青少年不使用二维码，助理裁判按名单与形象照逐人确认。</p></div>'
  }
  if(!pass.eligible||qr.status==='locked'){
   return '<div class="pp-pass-qr locked"><strong>动态二维码</strong><p>'+esc(qr.reason||'正式名单通过后可出示动态码')+'</p></div>'
  }
  if(qr.status==='waiting_schedule'){
   return '<div class="pp-pass-qr waiting"><strong>动态二维码</strong><p>'+esc(qr.reason||'赛程公布后可生成')+'</p><small>有本队赛程后即可随时点开刷新，供助理裁判扫码。</small></div>'
  }
  var matches=qr.matches||[],match=cache&&cache.match||matches[0]||null
  if(cache&&cache.qrUrl){
   return '<div class="pp-pass-qr ready live"><button type="button" class="pp-pass-qr-hit" data-pass-qr="'+esc(item.id)+'" data-match-id="'+esc((cache.match&&cache.match.id)||(match&&match.matchId)||'')+'" aria-label="刷新动态二维码"><img src="'+esc(cache.qrUrl)+'" alt="本场动态二维码"><span>点击刷新</span></button><div class="pp-pass-qr-meta"><strong>动态核验码</strong><span>'+esc((cache.match&&cache.match.teamsText)||(match&&match.teamsText)||'')+'</span><small>'+esc(cache.expiresText||'点击可刷新')+' · 供助理裁判扫码</small></div></div>'
  }
  return '<div class="pp-pass-qr ready"><button type="button" class="pp-pass-qr-hit empty" data-pass-qr="'+esc(item.id)+'" data-match-id="'+esc(match&&match.matchId||'')+'" aria-label="显示动态二维码"><span>点击显示</span></button><div class="pp-pass-qr-meta"><strong>动态核验码</strong><span>'+esc(match?match.teamsText:'可签发')+'</span><small>'+esc(qr.reason||'随时点击查看与刷新')+'</small></div></div>'
 }
 function participationPassCard(item,opts){
  opts=opts||{}
  var pass=item.pass||{},mode=pass.mode==='adult'?'adult':pass.mode==='youth'?'youth':'unknown'
  var eligible=!!pass.eligible,disabled=eligible?'':' disabled',present=opts.present?' present':''
  var jersey=item.jerseyNumber?String(item.jerseyNumber):'—'
  var photo=item.photoUrl
   ?'<img class="pp-pass-photo" src="'+esc(item.photoUrl)+'" alt="'+esc(item.playerName)+'" onerror="this.hidden=true">'
   :'<span class="pp-pass-photo empty">'+esc((item.playerName||'球').slice(0,1))+'</span>'
  var crest=item.teamLogoUrl?'<img class="pp-pass-crest" src="'+esc(item.teamLogoUrl)+'" alt="" aria-hidden="true" onerror="this.hidden=true">':''
  var when=[item.startDate?(item.startDate+(item.endDate?' — '+item.endDate:'')):'',item.venue].filter(Boolean).join(' · ')
  var actions=eligible&&!opts.present
   ?'<div class="pp-pass-actions"><button type="button" class="pp-pass-show" data-pass-present="'+esc(item.id)+'">出示证件</button></div>'
   :''
  return '<article class="pp-pass '+mode+disabled+present+'" data-pass-id="'+esc(item.id)+'">'+
   '<div class="pp-pass-glow" aria-hidden="true"></div>'+
   '<div class="pp-pass-pitch" aria-hidden="true"></div>'+
   crest+
   '<div class="pp-pass-head"><div class="pp-pass-brand"><img src="./assets/logo-saixiaofeng-football.png" alt=""><span>赛小蜂足球</span></div><b>'+passModeLabel(mode)+'</b></div>'+
   '<div class="pp-pass-main">'+
    '<div class="pp-pass-photo-wrap">'+photo+'<em class="pp-pass-jersey" aria-label="球衣号">'+esc(jersey)+'</em></div>'+
    '<div class="pp-pass-identity"><strong>'+esc(item.playerName)+'</strong><span>'+esc(item.teamName||'球队待定')+'</span><small>'+esc(item.position||'位置待定')+(item.gender?' · '+item.gender:'')+'</small><i>'+esc(passVerifyLabel(mode))+'</i></div>'+
   '</div>'+
   '<div class="pp-pass-meta">'+
    '<div><span>赛事</span><b>'+esc(item.tournamentName||'—')+'</b></div>'+
    '<div><span>组别</span><b>'+esc(item.divisionName||'—')+'</b></div>'+
    (when?'<div class="wide"><span>赛期 / 场地</span><b>'+esc(when)+'</b></div>':'')+
   '</div>'+
   passInsuranceBanner(item)+
   '<div class="pp-pass-credential"><span>'+(mode==='youth'?'核验方式':'参赛证号')+'</span><b>'+esc(passNumberText(item))+'</b></div>'+
   passQrPanel(item,opts)+
   '<div class="pp-pass-foot"><span class="pp-state '+participationTone(eligible?'ok':item.stateTone)+'">'+esc(pass.stateText||item.stateText)+'</span>'+(eligible?'<span class="pp-pass-stamp">正式名单</span>':'')+'</div>'+
   '<p class="pp-pass-note">'+esc(pass.note||'')+'</p>'+
   actions+
  '</article>'
 }
 function passExpiresText(value){
  var date=new Date(value||'')
  if(isNaN(date.getTime()))return '本场有效'
  function two(n){return String(n).padStart(2,'0')}
  return two(date.getMonth()+1)+'-'+two(date.getDate())+' '+two(date.getHours())+':'+two(date.getMinutes())+' 前有效'
 }
 function loadAdultPassQr(itemId,matchId,opts){
  opts=opts||{}
  var item=playerParticipation().filter(function(row){return row.id===itemId})[0]
  if(!item||!(item.pass&&item.pass.eligible)){if(!opts.silent)toast('当前参赛证暂不可出示');return Promise.resolve(null)}
  if((item.pass.mode||'')==='youth'){if(!opts.silent)toast('青少年现场按名单核验，无需二维码');return Promise.resolve(null)}
  var match=matchId||((item.pass.qr&&item.pass.qr.matches&&item.pass.qr.matches[0]&&item.pass.qr.matches[0].matchId)||'')
  if(!match){if(!opts.silent)toast((item.pass.qr&&item.pass.qr.reason)||'本队暂无进行中的赛程');return Promise.resolve(null)}
  if(!opts.silent)toast('正在刷新动态码…')
  return api({action:'servicePrivateAdultMatchPass',matchId:match,playerId:item.playerId}).then(function(r){
   var data=r.data||{}
   if(!state.passQrCache)state.passQrCache={}
   state.passQrCache[itemId]={qrUrl:data.matchPass&&data.matchPass.qrUrl||'',expiresText:passExpiresText(data.matchPass&&data.matchPass.expiresAt),match:{id:data.match&&data.match.id||match,teamsText:data.match&&data.match.teamsText||'',timeText:data.match&&data.match.timeText||''},certificate:data.certificate||{}}
   if(data.certificate&&data.certificate.number)item.pass.number=data.certificate.number
   if(opts.present||state.presentPassId===itemId)openPassPresent(itemId)
   else paintParticipation()
   if(!opts.silent)toast('动态码已刷新')
   return state.passQrCache[itemId]
  }).catch(function(e){if(!opts.silent)toast(e.message||'动态码生成失败');return null})
 }
 function closePassPresent(){
  state.presentPassId=''
  try{if(navigator.wakeLock&&state._passWake){state._passWake.release();state._passWake=null}}catch(e){}
  var layer=document.getElementById('ppPassPresent')
  if(layer)layer.remove()
  document.body.classList.remove('pp-pass-presenting')
 }
 function openPassPresent(id){
  var item=playerParticipation().filter(function(row){return row.id===id})[0]
  if(!item||!(item.pass&&item.pass.eligible)){toast('当前参赛证暂不可出示');return}
  closePassPresent()
  state.presentPassId=id
  document.body.classList.add('pp-pass-presenting')
  var layer=document.createElement('div')
  layer.id='ppPassPresent'
  layer.className='pp-pass-present-layer'
  layer.innerHTML='<div class="pp-pass-present-shell"><button type="button" class="pp-pass-present-close" data-pass-close="1">关闭出示</button>'+participationPassCard(item,{present:true})+'<p class="pp-pass-present-tip">请将屏幕亮度调高，交助理裁判扫码并当面核对照片'+(item.pass&&item.pass.mode==='adult'?'；可随时点击二维码刷新。':'。')+'</p></div>'
  document.body.appendChild(layer)
  if(navigator.wakeLock&&navigator.wakeLock.request){
   navigator.wakeLock.request('screen').then(function(lock){state._passWake=lock}).catch(function(){})
  }
  var qr=item.pass&&item.pass.qr||{}
  if(item.pass&&item.pass.mode==='adult'&&qr.status==='ready'&&!(state.passQrCache&&state.passQrCache[id]&&state.passQrCache[id].qrUrl)){
   loadAdultPassQr(id,(qr.matches&&qr.matches[0]&&qr.matches[0].matchId)||'',{present:true})
  }
 }
 function insuranceListCard(item){
  var info=item.insurance||{},tone=participationTone(info.tone||'muted')
  var cover=(info.coverStart||info.coverEnd)?((info.coverStart||'?')+' — '+(info.coverEnd||'?')):'待上传后识别'
  var actions=[]
  if(info.purchaseUrl)actions.push('<button type="button" class="pp-ins-cta buy" data-insurance-buy="'+esc(item.id)+'">'+esc(info.purchaseLabel||'去购买保险')+'</button>')
  if(info.canUpload)actions.push('<button type="button" class="pp-ins-cta upload" data-insurance-upload="'+esc(item.id)+'">上传保单 PDF</button>')
  return '<article class="pp-ins-sheet '+tone+'">'+
   '<div class="pp-ins-sheet-top"><span class="pp-ins-mark">赛事保险</span><span class="pp-state '+tone+'">'+esc(info.text||'保险信息待确认')+'</span></div>'+
   '<h3 class="pp-ins-name">'+esc(item.playerName)+'</h3>'+
   '<p class="pp-ins-event">'+esc([item.tournamentName,item.divisionName].filter(Boolean).join(' · '))+'</p>'+
   '<div class="pp-ins-grid">'+
    '<div><span>球队</span><b>'+esc(item.teamName||'—')+'</b></div>'+
    '<div><span>险种</span><b>'+esc(info.productType||'待识别')+'</b></div>'+
    '<div><span>保单号</span><b>'+esc(info.policyNo||'—')+'</b></div>'+
    '<div><span>保障期</span><b>'+esc(cover)+'</b></div>'+
   '</div>'+
   (info.uploaderHint?'<p class="pp-ins-note">'+esc(info.uploaderHint)+'</p>':'')+
   (info.message?'<p class="pp-ins-msg">'+esc(info.message)+'</p>':'')+
   (info.purchaseUrl&&info.canUpload?'<p class="pp-ins-guide">外链购买仅作投保引导，买成后请回到本页上传 PDF。</p>':'')+
   (actions.length?'<div class="pp-ins-actions">'+actions.join('')+'</div>':'')+
  '</article>'
 }
 function paintParticipation(){
  closePassPresent()
  var players=state.overview.players||[],items=playerParticipation(),kind=state.participationKind,isPass=kind==='pass',isIns=kind==='insurance'
  var selector=players.length>1?'<div class="pp-players">'+players.map(function(p){return '<button data-pp-player="'+esc(p.id)+'" aria-pressed="'+(p.id===state.playerId)+'">'+esc(p.name)+'<small>'+esc(p.teamName)+'</small></button>'}).join('')+'</div>':''
  var body=''
  if(!items.length){
   body='<section class="pp-empty"><strong>'+(isPass?'暂无可出示的参赛证':isIns?'暂无保险资料':'暂无参赛资料')+'</strong><p>球队报名并通过正式名单审核后，这里会显示参赛资料、电子参赛证与保险补件。</p></section>'
  }else if(isIns){
   body=items.map(insuranceListCard).join('')
  }else if(isPass){
   var eligible=items.filter(function(item){return item.pass&&item.pass.eligible})
   var waiting=items.filter(function(item){return !(item.pass&&item.pass.eligible)})
   var filter=state.passFilter==='ready'?'ready':'all'
   var shown=filter==='ready'?eligible:items
   var filterBar='<div class="pp-pass-filter" role="tablist" aria-label="参赛证筛选">'+
    '<button type="button" data-pass-filter="all" aria-pressed="'+(filter==='all')+'">全部 '+(items.length)+'</button>'+
    '<button type="button" data-pass-filter="ready" aria-pressed="'+(filter==='ready')+'">可出示 '+(eligible.length)+'</button>'+
   '</div>'
   if(!shown.length){
    body=filterBar+'<section class="pp-empty"><strong>暂无可以出示的参赛证</strong><p>正式名单审核通过'+(waiting.length?'后，置灰证件会自动亮起':'')+'。</p></section>'
   }else{
    var readyHtml=shown.filter(function(item){return item.pass&&item.pass.eligible}).map(function(item){return participationPassCard(item)}).join('')
    var waitHtml=shown.filter(function(item){return !(item.pass&&item.pass.eligible)}).map(function(item){return participationPassCard(item)}).join('')
    body=filterBar+(readyHtml?(filter==='all'&&waitHtml?'<h3 class="pp-pass-section">可出示</h3>':'')+readyHtml:'')+(waitHtml?(filter==='all'&&readyHtml?'<h3 class="pp-pass-section">待生效</h3>':'')+waitHtml:'')
   }
  }else{
   body=items.map(participationProfileCard).join('')
  }
  app.innerHTML='<main class="me-body me-body-participation'+(isIns?' me-body-insurance':'')+'"><button class="personal-back" data-home="true">‹ 返回我的</button><header class="pp-head'+(isIns?' pp-head-ins':'')+'">'+(isIns?'<span class="pp-head-kicker">个人投保凭证</span>':'')+'<h1>'+(isPass?'我的电子参赛证':isIns?'赛事保险资料':'我的参赛资料')+'</h1><p>'+(isPass?'正式名单通过后可出示。青少年现场按名单核验、不扫码；成人可随时点开刷新动态签名二维码，供第二/第三助理裁判现场扫码做资格审查。':isIns?'成人本人上传保单，青少年由监护人代传。外链购买仅作引导，买成后须回传 PDF。':'报名、名单和资料状态均以主办方审核结果为准，本页只读。')+'</p></header>'+selector+body+'<p class="pp-foot-note">资料修改请联系球队管理员在球队端更新后重新提交；有疑问请通过客服中心反馈。</p></main>'
  if(isPass){
   items.filter(function(item){return item.pass&&item.pass.eligible&&item.pass.mode==='adult'&&item.pass.qr&&item.pass.qr.status==='ready'&&!(state.passQrCache&&state.passQrCache[item.id]&&state.passQrCache[item.id].qrUrl)}).slice(0,2).forEach(function(item){
    loadAdultPassQr(item.id,(item.pass.qr.matches&&item.pass.qr.matches[0]&&item.pass.qr.matches[0].matchId)||'',{silent:true})
   })
  }
 }
 function openParticipation(kind){
  state.participationKind=kind
  if(kind==='pass'&&!state.passFilter)state.passFilter='all'
  closePassPresent()
  if(state.participation){paintParticipation();return}
  app.innerHTML='<main class="me-body me-body-participation"><button class="personal-back" data-home="true">‹ 返回我的</button>'+loading()+'</main>'
  loadParticipation(true).then(function(data){if(data)paintParticipation();else if(app.querySelector('.me-body-participation'))app.innerHTML='<main class="me-body me-body-participation"><button class="personal-back" data-home="true">‹ 返回我的</button><section class="personal-state"><p>参赛资料暂时无法读取，请稍后重试</p><button class="personal-primary" data-action="retryParticipation">重新加载</button></section></main>'})
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
  var promise=api({action:'servicePrivateAccountData'}).then(function(r){if(generation!==homeAccountGeneration||token!==(localStorage.getItem(KEY)||''))return null;homeAccount=r.data;homeAccountAt=Date.now();updateHomeWallet();updateHomeMember();updateNameMark();return r.data}).catch(function(error){if(generation!==homeAccountGeneration||token!==(localStorage.getItem(KEY)||''))return null;homeAccount={wallet:{status:'unavailable',balance:null,entries:[]},messages:{status:'unavailable',entries:[]}};updateHomeWallet();updateHomeMember();updateNameMark();return homeAccount}).then(function(result){if(homeAccountPromise===promise)homeAccountPromise=null;return result})
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
   return '<section class="me-home-member active" id="homeMemberCard" aria-label="赛小蜂会员"><button class="me-member-entry" data-action="membershipCenter"><span class="me-member-badge">'+memberMarkImg(96)+esc(sub.levelName||sub.badgeText||'会员')+'</span><span class="me-member-text"><strong>'+esc((sub.levelName||'会员')+' · '+tail)+'</strong><small>有效期至 '+esc(memberDate(sub.expiresAt))+' · 到期不自动续费</small></span><i aria-hidden="true">›</i></button></section>'
  }
  if(sub&&sub.status==='expired'){
   return '<section class="me-home-member" id="homeMemberCard" aria-label="赛小蜂会员"><button class="me-member-entry" data-action="membershipCenter"><span class="me-member-text"><strong>会员已到期</strong><small>'+esc(memberDate(sub.expiresAt))+' 到期 · 续费恢复赠滴与折扣</small></span><span class="me-member-cta">续费</span></button></section>'
  }
  var price=m.lowestFirstPriceCents>0?yuanText(m.lowestFirstPriceCents)+' 元':'会员权益'
  var grant=plan?'每月赠 '+plan.grantDrops+' 滴':'每月赠滴'
  return '<section class="me-home-member" id="homeMemberCard" aria-label="赛小蜂会员"><button class="me-member-entry" data-action="membershipCenter"><span class="me-member-text"><strong>开通会员 · 首月 '+esc(price)+'起</strong><small>'+esc(grant)+' · 定妆照折扣 · 会员徽章</small></span><span class="me-member-cta">立即开通</span></button></section>'
 }
 function updateHomeMember(){var n=document.getElementById('homeMemberCard');if(!n)return;var holder=document.createElement('div');holder.innerHTML=homeMemberCard();var fresh=holder.firstChild;if(fresh)n.parentNode.replaceChild(fresh,n)}
 // 会员标识（2026-10-31 用户确认）：徽章跟昵称一起显示，只在会员有效期内出现，纯展示不替代档位文字。
 function memberMarkImg(size){return '<img class="me-member-mark" src="./assets/membership/member-badge-'+size+'.png" alt="赛小蜂会员" width="'+size+'" height="'+size+'">'}
 function updateNameMark(){var n=document.getElementById('homeNameMark');if(!n)return;var m=memberSummary(),sub=m&&m.subscription;n.innerHTML=(sub&&sub.status==='active')?memberMarkImg(96):''}
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
   '<strong class="mp-hero-title">'+(open?memberMarkImg(96):'')+esc(open?(sub.levelName||'会员')+' · 剩余 '+sub.daysLeft+' 天':(sub?'会员已到期':'尚未开通会员'))+'</strong>'+
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
  if(action==='homeParticipationProfile'){openParticipation('profile');return true}
  if(action==='homeParticipationPass'){openParticipation('pass');return true}
  if(action==='homeParticipationInsurance'){openParticipation('insurance');return true}
  if(action==='retryParticipation'){state.participation=null;openParticipation(state.participationKind);return true}
  if(action==='homeRegistrationResume'){location.href='./registration-resume.html';return true}
  if(action==='membershipCenter'){renderMembershipCenter();return true}
  if(action==='membershipOrders'){renderMembershipOrders();return true}
  if(action==='honeyRecharge'){if(isIosClient()){toast(honeyReasonText('IOS_VIRTUAL_PAYMENT_RESTRICTED'));return true}state.honeyPack=0;renderHoneyPanel();loadHomeAccount(false).then(function(){if(app.querySelector('.me-modal'))renderHoneyPanel()});return true}
  if(action==='honeyOrders'){renderHoneyOrders();return true}
  if(action==='honeyPay'){honeyPay();return true}
  if(action==='honeyLedger'||action==='homeMessages'){showHomeAccount(action==='honeyLedger'?'ledger':'messages');return true}
  if(action==='homePlayerCards'){location.href='./my-main-card.html';return true}
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
  {q:'裁判任务入口在哪里？',a:'服务号底部菜单进「我的」，切换到裁判身份后，在数据区点「裁判任务」。裁判需完成本人任务手机号验证后才能看到执裁数据。'},
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

 // ============ 个人保单 PDF ============
 state.insuranceBusy=false
 state.insuranceDraft=null
 state.insuranceItemId=''
 function insuranceItemById(id){return playerParticipation().filter(function(row){return row.id===id})[0]||null}
 function insuranceMatchLabel(code){return({matched:'核对一致',name_mismatch:'姓名未匹配',coverage_gap:'保障期未覆盖赛事',unclear:'识别不完整'})[code]||'待确认'}
 function openInsuranceBuy(itemId){
  var item=insuranceItemById(itemId)
  var info=item&&item.insurance||{}
  if(!(info&&info.purchaseUrl)){toast('暂未配置购买链接');return}
  api({action:'servicePrivateInsurancePurchaseClick',playerId:item.playerId,tournamentId:item.tournamentId,divisionId:item.divisionId||'default',purchaseUrl:info.purchaseUrl,source:'h5_me'}).catch(function(){})
  window.location.href=info.purchaseUrl
 }
 function openInsuranceUpload(itemId){
  var item=insuranceItemById(itemId)
  if(!item){toast('参赛资料已失效，请返回刷新');return}
  var info=item.insurance||{}
  if(!info.required){toast('本赛事未要求保险资料');return}
  if(!info.canUpload&&info.ready){toast('保险资料已提交');return}
  state.insuranceItemId=itemId;state.insuranceDraft=null;state.insuranceBusy=false
  var buy=info.purchaseUrl?'<button type="button" class="pp-ins-cta buy ghost" data-insurance-buy="'+esc(itemId)+'">'+esc(info.purchaseLabel||'去购买保险')+'</button>':''
  modal('上传保单 PDF','<div class="pp-ins" id="insurancePanel">'+
   '<div class="pp-ins-hero"><strong>'+esc(item.playerName)+'</strong><span>'+esc([item.tournamentName,item.divisionName].filter(Boolean).join(' · '))+'</span></div>'+
   '<p class="me-modal-text">'+esc(info.uploaderHint||'请上传已购买的意外险保单 PDF（小于 3MB）')+'。识别后请核对姓名与保障期，再确认提交。</p>'+
   (buy?'<div class="pp-ins-modal-buy">'+buy+'<small>外链引导，买成后请回传 PDF</small></div>':'')+
   '<label class="pp-ins-pick"><input id="insurancePdfInput" type="file" accept="application/pdf,.pdf" hidden><em aria-hidden="true">PDF</em><span>选择 PDF 保单</span><small>小于 3MB · 自动识别姓名与保障期</small></label>'+
   '<p class="me-modal-text muted">平台只核验保单文字与赛事要求，不替代保险公司承保确认。</p>'+
   '<div id="insuranceResult" class="pp-ins-result" hidden></div>'+
   '<div class="me-modal-actions" id="insuranceActions" hidden><button class="me-modal-confirm pp-ins-confirm" data-insurance-confirm="1">确认提交</button><button class="me-modal-cancel">取消</button></div>'+
  '</div>',true)
  var input=document.getElementById('insurancePdfInput')
  if(input)input.addEventListener('change',function(){if(input.files&&input.files[0])uploadInsurancePdf(input.files[0])})
 }
 function paintInsuranceResult(draft){
  var box=document.getElementById('insuranceResult'),actions=document.getElementById('insuranceActions')
  if(!box)return
  if(!draft){box.hidden=true;if(actions)actions.hidden=true;return}
  box.hidden=false
  var match=draft.matchResult||'unclear'
  var tone=match==='matched'?'ok':(match==='unclear'?'pending':'warn')
  box.innerHTML='<div class="pp-ins-ocr '+tone+'"><div class="pp-ins-ocr-head"><span class="pp-ins-ocr-badge">'+esc(insuranceMatchLabel(match))+'</span></div>'+
   '<p>'+esc(draft.message||'')+'</p>'+
   '<ul><li><span>姓名</span><b>'+esc(draft.insuredName||'未识别')+'</b></li>'+
   '<li><span>保障起</span><b>'+esc(draft.coverStart||'—')+'</b></li>'+
   '<li><span>保障止</span><b>'+esc(draft.coverEnd||'—')+'</b></li>'+
   '<li><span>险种</span><b>'+esc(draft.productType||'未识别险种')+'</b></li>'+
   (draft.insurer?'<li><span>承保</span><b>'+esc(draft.insurer)+'</b></li>':'')+
   '<li><span>保单号</span><b>'+esc(draft.policyNo||'—')+'</b></li></ul>'+
   '<small>'+esc(draft.disclaimer||'')+'</small></div>'
  if(actions)actions.hidden=false
 }
 function readPdfAsDataUrl(file){
  return new Promise(function(resolve,reject){
   if(!file)return reject(new Error('请选择 PDF 文件'))
   if(file.type&&file.type!=='application/pdf'&&!/\.pdf$/i.test(file.name||''))return reject(new Error('请上传 PDF 格式保单'))
   if(file.size>3*1024*1024)return reject(new Error('保单 PDF 须小于 3MB'))
   var reader=new FileReader()
   reader.onload=function(){resolve(String(reader.result||''))}
   reader.onerror=function(){reject(new Error('读取文件失败'))}
   reader.readAsDataURL(file)
  })
 }
 function uploadInsurancePdf(file){
  if(state.insuranceBusy)return
  var item=insuranceItemById(state.insuranceItemId)
  if(!item){toast('参赛资料已失效，请返回刷新');return}
  state.insuranceBusy=true;state.insuranceDraft=null;paintInsuranceResult(null);toast('正在上传并识别…')
  readPdfAsDataUrl(file).then(function(dataUrl){
   return api({action:'servicePrivateInsuranceUpload',playerId:item.playerId,tournamentId:item.tournamentId,divisionId:item.divisionId||'default',base64Data:dataUrl})
  }).then(function(r){
   state.insuranceBusy=false
   state.insuranceDraft=r&&r.draft||null
   paintInsuranceResult(state.insuranceDraft)
   toast(state.insuranceDraft&&state.insuranceDraft.matchResult==='matched'?'识别完成，请确认后提交':'识别完成，请核对后提交')
  }).catch(function(e){state.insuranceBusy=false;toast(e.message||'上传失败，请稍后重试')})
 }
 function confirmInsuranceUpload(){
  if(state.insuranceBusy||!state.insuranceDraft||!state.insuranceDraft.draftId){toast('请先上传并识别保单');return}
  var draft=state.insuranceDraft
  var needWarn=draft.reviewFlag==='needs_manual_review'
  var proceed=function(){
   state.insuranceBusy=true;toast('正在提交…')
   api({action:'servicePrivateInsuranceConfirm',draftId:draft.draftId}).then(function(){
    state.insuranceBusy=false;state.insuranceDraft=null
    var mask=app.querySelector('.me-modal-mask');if(mask)mask.remove()
    toast(needWarn?'已提交，待人工核对':'保险资料已提交')
    loadParticipation(true).then(function(){paintParticipation()})
   }).catch(function(e){state.insuranceBusy=false;toast(e.message||'提交失败，请稍后重试')})
  }
  if(!needWarn){proceed();return}
  if(window.confirm('识别结果与球员/赛事要求不完全一致，确认后将进入人工核对。是否继续提交？'))proceed()
 }
 // ============ 账号动作 ============
 function logout(){modal('退出登录','<p class="me-modal-text">退出后将清理本设备的微信授权缓存，下次打开需重新微信授权。确定继续吗？</p><div class="me-modal-actions"><button class="me-modal-confirm" data-action="doLogout">退出登录</button><button class="me-modal-cancel">取消</button></div>',true)}
 function doLogout(){homeAccountGeneration++;homeAccount=null;homeAccountAt=0;homeAccountPromise=null;participationGeneration++;state.participation=null;participationAt=0;participationPromise=null;localStorage.removeItem(KEY);oauth()}
 app.addEventListener('click',function(e){var t=e.target.closest('button,a');if(!t)return
  var action=t.dataset.action
  if(homeAction(action))return
  if(t.dataset.homeRole){if(t.disabled)return;state.view=t.dataset.homeRole;renderHome()}
  else if(t.dataset.ppPlayer){if(t.dataset.ppPlayer===state.playerId)return;state.playerId=t.dataset.ppPlayer;paintParticipation()}
  else if(t.dataset.passFilter){if(state.passFilter===t.dataset.passFilter)return;state.passFilter=t.dataset.passFilter;paintParticipation()}
  else if(t.dataset.passPresent){openPassPresent(t.dataset.passPresent)}
  else if(t.dataset.passQr){loadAdultPassQr(t.dataset.passQr,t.dataset.matchId||'')}
  else if(t.dataset.insuranceBuy){openInsuranceBuy(t.dataset.insuranceBuy)}
  else if(t.dataset.insuranceUpload){openInsuranceUpload(t.dataset.insuranceUpload)}
  else if(t.dataset.insuranceConfirm){confirmInsuranceUpload()}
  else if(t.dataset.passClose){closePassPresent()}
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
 var q=new URLSearchParams(location.search);if(q.get('code')&&q.get('state'))complete(q.get('code'),q.get('state'));else if(MOCK){mockOverview();var mview=new URLSearchParams(location.search).get('view');if(mview==='data'){var dd=state.overview;select(dd.players.length?'player':'referee',dd.players[0]?dd.players[0].id:'')}else if(mview==='support')renderSupport();else if(mview==='pass'||mview==='profile'||mview==='insurance'){var mp=new URLSearchParams(location.search).get('player');if(mp)state.playerId=mp;openParticipation(mview==='pass'?'pass':mview==='insurance'?'insurance':'profile')}}else if(localStorage.getItem(KEY))overview();else oauth()
})()