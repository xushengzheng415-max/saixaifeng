// Local explanatory content only. No business identities, permissions or saved records.
var roles = [
  { id:'team', label:'球队管理', heading:'管球队、看数据、约球参赛', icon:'/images/runtime/icons/brand-v1-tab-team.png',
    steps:['建立球队','维护球员','报名参赛'],
    features:[
      {id:'players',title:'球队与成员管理',summary:'队徽、队员、教练一起管',icon:'players',device:'小程序',
        detail:'维护队徽、队名及球队资料，管理球员和教练工作人员；邀请球员补充号码、照片与个人资料。',
        previewTitle:'球员资料',previewLabel:'球队球员库',previewKind:'people',
        rows:[{name:'个人资料',value:'姓名 / 号码 / 位置',tone:''},{name:'标准形象照',value:'完整展示',tone:''},{name:'资料状态',value:'待补充 / 已完善',tone:'muted'}],
        process:['创建球队并维护队徽、队名','管理球员、教练及工作人员','发送球员邀请，持续完善档案'],note:'加入球员库，不等于取得赛事参赛资格。'},
      {id:'roster',title:'本届参赛名单',summary:'选人报名，查看审核',icon:'shield',device:'小程序',
        detail:'从球队球员库选择本届参赛人员，按组委会要求补齐资料、提交审核。',
        previewTitle:'本届参赛名单',previewLabel:'参赛事项',previewKind:'checklist',
        rows:[{name:'选择参赛球员',value:'从本队球员库选择',tone:''},{name:'提交组委会',value:'待审核',tone:'muted'},{name:'审核通过',value:'成为本届正式名单',tone:''}],
        process:['进入本队参加的赛事与组别','选择本届球员并补齐资料','提交审核，查看结果与退回原因'],note:'已审核名单和已完赛记录保留赛事快照。'},
      {id:'lineup',title:'阵容与赛程',summary:'看对手、排首发、查排名',icon:'event',device:'小程序',
        detail:'按球队和参赛组别查看比赛安排、比分与排名，为单场比赛安排首发和替补。',
        previewTitle:'单场比赛阵容',previewLabel:'本队赛程',previewKind:'pitch',
        rows:[{name:'赛前',value:'首发与替补',tone:''},{name:'赛后',value:'比分与所在小组排名',tone:''}],
        process:['进入对应球队的参赛事项','查看本队赛程并选择比赛','安排阵容，赛后查看比赛结果'],note:'正式比赛的现场记录由获授权裁判完成。'},
      {id:'poster',title:'球员卡大名单',summary:'生成本届名单海报',icon:'team',device:'小程序',
        detail:'以本届参赛名单生成球队海报，展示队徽、球员卡及教练工作人员头像，支持预览与保存。',
        previewTitle:'球队大名单',previewLabel:'名单海报',previewKind:'poster',
        rows:[{name:'教练与工作人员',value:'头像与职务',tone:''},{name:'本届球员',value:'统一球员卡展示',tone:''}],
        process:['打开赛事中的正式名单','进入生成海报','预览后保存，与队员分享'],note:'球员卡沿用平台模板，页面不重新判定卡级。'},
      {id:'teamdata',title:'本队比赛数据',summary:'查赛果、看排名、回看比赛',icon:'list',device:'小程序',
        detail:'进入本队参加的赛事，查看本队赛程、比分、比赛记录和所在小组排名，多支球队、多项赛事分别查看。',
        previewTitle:'本队比赛记录',previewLabel:'球队数据',previewKind:'flow',
        rows:[{name:'比赛记录',value:'对手 / 时间 / 比分',tone:''},{name:'参赛表现',value:'场次 / 积分 / 小组排名',tone:''},{name:'查看范围',value:'对应球队与赛事组别',tone:''}],
        process:['选择自己管理的球队','进入该队参赛的赛事与组别','查看赛程赛果、排名与比赛详情'],note:'按已登记的比赛记录展示，未采集数据不当作零。'},
      {id:'friendly',title:'线下约球',summary:'发邀约、约时间、记友谊赛',icon:'event',device:'小程序 · 发现',
        detail:'在发现页的约球栏发起约球邀约，填写时间和场地，将邀约海报转发给队员；线下比赛后可记录友谊赛结果。',
        previewTitle:'约一场球',previewLabel:'线下约球',previewKind:'flow',
        rows:[{name:'发起邀约',value:'时间 / 场地 / 报名安排',tone:''},{name:'分享海报',value:'队员扫码报名',tone:''},{name:'比赛记录',value:'友谊赛单独标记',tone:''}],
        process:['在发现页的约球栏创建约球邀约','分享海报，组织队员报名到场','使用轻记录保存本场比赛结果'],note:'友谊赛与正式比赛分开，不混入正式赛事排名。'},
      {id:'annual',title:'球队年度回顾',summary:'一年正式赛与友谊赛汇总',icon:'team',device:'规划中',availability:'规划中',
        detail:'计划按年度汇总本队已登记的正式比赛与友谊赛，回看全年参赛场次、赛果与球队表现。',
        previewTitle:'球队年度回顾',previewLabel:'年度数据规划',previewKind:'flow',
        rows:[{name:'年度范围',value:'所选年份的本队记录',tone:''},{name:'正式比赛',value:'正式赛事记录单列',tone:''},{name:'友谊赛',value:'线下约球记录单列',tone:''}],
        process:['选择年份与球队','分别查看正式比赛与友谊赛','回顾全年参赛及球队表现'],note:'年度汇总入口尚未开放；仅汇总已登记、有依据的数据。'}
    ]
  },
  { id:'organizer', label:'赛事组织', heading:'看比赛进度，把赛果变成赛报',icon:'/images/runtime/icons/brand-v2-01.png',
    steps:['创建赛事','审核与编排','复核归档'],
    features:[
      {id:'registration',title:'建赛与报名',summary:'创建赛事，邀请球队',icon:'event',device:'小程序 + 电脑',
        detail:'手机先创建赛事基础信息，再到电脑配置竞赛组别、报名要求与完整办赛安排。',
        previewTitle:'创建与参赛',previewLabel:'赛事准备',previewKind:'flow',
        rows:[{name:'手机发起',value:'赛事名称 / 日期 / 地区',tone:''},{name:'电脑配置',value:'组别 / 报名要求',tone:''},{name:'邀请球队',value:'球队提交报名',tone:''}],
        process:['小程序填写主办机构与赛事信息','同手机号登录电脑管理后台','配置参赛要求并邀请球队'],note:'创建可先跳过，登录后也可从赛事列表发起。'},
      {id:'review',title:'报名与名单审核',summary:'核对资料，退回可追踪',icon:'shield',device:'小程序 + 电脑',
        detail:'按赛事与组别检查球队报名和人员资料，查看待审核项，通过或说明原因退回。',
        previewTitle:'报名审核',previewLabel:'赛前检查',previewKind:'checklist',
        rows:[{name:'球队报名',value:'待审核',tone:'muted'},{name:'人员资料',value:'按赛事要求核对',tone:''},{name:'审核结果',value:'通过 / 退回补充',tone:''}],
        process:['查看报名与名单待办','按赛事要求核对提交资料','通过审核，或填写退回原因'],note:'共享管理者仅处理被授权的赛事模块。'},
      {id:'schedule',title:'分组与赛程编排',summary:'电脑编排，手机查场次',icon:'list',device:'电脑编排 · 手机查看',
        detail:'在电脑端完成分组、抽签及复杂赛程编排；手机按组别与比赛状态查看已排比赛。',
        previewTitle:'比赛管理',previewLabel:'赛程安排',previewKind:'schedule',
        rows:[{name:'组别',value:'全部组别',tone:''},{name:'比赛筛选',value:'未踢的比赛',tone:''},{name:'场次信息',value:'时间 / 对阵 / 场地',tone:''}],
        process:['电脑配置赛制并完成抽签编排','检查比赛日期、时间和场地','手机查看比赛进度与待赛场次'],note:'小程序辅助现场协作，复杂编排在电脑端完成。'},
      {id:'results',title:'赛果复核与归档',summary:'保留记录，复核后归档',icon:'check',device:'小程序 + 电脑',
        detail:'裁判提交正式比赛记录，主办方核对比分与事件；需要修正时退回，确认后归档。',
        previewTitle:'赛果处理',previewLabel:'赛后复核',previewKind:'flow',
        rows:[{name:'裁判提交',value:'原始比赛记录',tone:''},{name:'主办方复核',value:'待复核 / 已退回',tone:'muted'},{name:'确认归档',value:'保留赛事记录',tone:''}],
        process:['裁判记录并提交比分和比赛事件','主办方查看记录、核对赛果','确认归档，或说明原因退回'],note:'主办方复核与裁判现场记录分工独立。'},
      {id:'live',title:'赛事数据总览',summary:'实时查看比分与比赛进度',icon:'list',device:'小程序 + 电脑',
        detail:'按赛事和组别查看已同步的比赛状态、比分、事件及赛程进度，了解哪些比赛待开始、进行中或已结束。',
        previewTitle:'赛事数据',previewLabel:'实时查看',previewKind:'flow',
        rows:[{name:'比赛进度',value:'未开始 / 进行中 / 已结束',tone:''},{name:'比赛记录',value:'已同步比分与事件',tone:''},{name:'赛事表现',value:'赛果与排名',tone:''}],
        process:['进入有权限管理的赛事','按组别与状态查看比赛','回看比分、事件与赛事排名'],note:'以现场已同步记录为准，进行中的正式比赛只读查看。'},
      {id:'supplement',title:'比分与时间补录',summary:'核对缺失记录，补齐赛果',icon:'check',device:'电脑端 · 按权限',
        detail:'对允许补录的比赛，依据原始记录补齐比分、比赛时间或事件分钟；核对后保存，保留后续复核与归档流程。',
        previewTitle:'赛后记录补齐',previewLabel:'比赛补录',previewKind:'checklist',
        rows:[{name:'赛果',value:'主队比分 / 客队比分',tone:''},{name:'时间记录',value:'比赛时间 / 事件分钟',tone:''},{name:'核对依据',value:'原始比赛记录',tone:''}],
        process:['在电脑端打开允许补录的比赛','对照原始记录补齐比分和时间','核对保存，按流程复核归档'],note:'受比赛状态、权限与电子记录锁定约束，不能改写已锁定裁判记录。'},
      {id:'news',title:'赛报发布',summary:'新闻中心发布到赛事中心',icon:'event',device:'电脑端 · 新闻中心',
        detail:'在新闻中心整理比赛赛报和赛事动态，关联对应赛事，发布后可在公开赛事中心展示。',
        previewTitle:'赛事赛报',previewLabel:'新闻中心',previewKind:'flow',
        rows:[{name:'编辑赛报',value:'标题 / 正文 / 配图',tone:''},{name:'关联赛事',value:'对应比赛与赛事',tone:''},{name:'公开展示',value:'赛事中心',tone:''}],
        process:['在新闻中心编辑赛报与配图','核对赛事关联和公开内容','发布后到赛事中心查看'],note:'仅发布允许公开的比赛内容，不公开球员证件与私人资料。'}
    ]
  }
]
var imageRoot='/images/runtime/guest-experience-v1/'
var effectImages={players:'team-management',roster:'tournament-roster',lineup:'tactical-lineup',poster:'team-cards',teamdata:'team-data',friendly:'friendly',annual:'annual-season',registration:'event-create',review:'registration-audit',schedule:'organizer-live',results:'organizer-review',live:'live-scoreboard',supplement:'score-supplement',news:'newsroom'}
function select(roleId,featureId) {
  var role=roles.filter(function(r){return r.id===roleId})[0] || roles[0]
  var feature=role.features.filter(function(f){return f.id===featureId})[0] || role.features[0]
  return {
    roleId:role.id,roleHeading:role.heading,roleIcon:role.icon,roleHero:imageRoot+(role.id==='team'?'friendly':'organizer-live')+'.jpg',effectImage:imageRoot+effectImages[feature.id]+'.jpg',
    roleTabs:roles.map(function(r){return {id:r.id,label:r.label,selected:r.id===role.id,itemClass:r.id===role.id?'selected':''}}),
    journey:role.steps.map(function(label,i){return {number:'0'+(i+1),label:label}}),
    features:role.features.map(function(f){return {id:f.id,title:f.title,summary:f.summary,cover:imageRoot+effectImages[f.id]+'.jpg',availability:f.availability || '',hasAvailability:!!f.availability,icon:'/images/icons/'+f.icon+'.svg',selected:f.id===feature.id,itemClass:f.id===feature.id?'selected':''}}),
    feature:feature,
    previewPeople:feature.previewKind==='people',previewChecklist:feature.previewKind==='checklist',previewPitch:feature.previewKind==='pitch',previewPoster:feature.previewKind==='poster',previewSchedule:feature.previewKind==='schedule',previewFlow:feature.previewKind==='flow',
    process:feature.process.map(function(label,i){return {number:i+1,label:label}}),
    figures:[{number:'01'},{number:'08'},{number:'10'}]
  }
}
module.exports={select:select}
