Page({
  data: { mode: 'player', isPlayer: true, title: '球队球员参赛全链路', subtitle: '资料、名单与阵容分别保存，按赛事授权完成交接。', steps: [], primaryText: '进入球队中心', primaryUrl: '/pages/team/team' },
  onLoad: function (options) { this.applyMode(String((options || {}).mode || 'player')) },
  applyMode: function (mode) {
    var isMatch = mode === 'match'
    var steps = isMatch
      ? [{ index: '01', role: '主办方与球队', title: '赛前准备', desc: '主办方确认赛程，球队提交经审核的名单与单场阵容。', state: '进入赛事中心', url: '/pages/event/index' }, { index: '02', role: '裁判服务号', title: '赛中记录', desc: '裁判核验到场、记录比分与事件；主办方端保持只读。', state: '进入裁判任务', url: '/pages/referee/index' }, { index: '03', role: '主办方 PC', title: '赛后复核', desc: '主办方依据裁判原始记录复核赛果，归档后形成赛事快照。', state: '查看赛事', url: '/pages/tournament/list/list' }]
      : [{ index: '01', role: '球队小程序', title: '维护长期球队与球员资料', desc: '球队资料与球员库是长期资产，不能被赛事名单覆盖。', state: '进入球队中心', url: '/pages/team/team' }, { index: '02', role: '家长服务号', title: '补充实名与标准形象照', desc: '资料由家长授权提交并进入审核，不直接改写历史参赛快照。', state: '查看球员资料', url: '/pages/team/profile-progress/profile-progress' }, { index: '03', role: '主办方与球队', title: '形成赛事正式名单与单场阵容', desc: '正式名单和阵容均绑定赛事与场次，审核或完赛后保留可追溯版本。', state: '进入赛事中心', url: '/pages/event/index' }]
    var first = steps[0]
    this.setData({ mode: isMatch ? 'match' : 'player', isPlayer: !isMatch, title: isMatch ? '比赛执行责任交接' : '球队球员参赛全链路', subtitle: isMatch ? '赛前准备、赛中裁判写入、赛后主办复核，各端职责不越界。' : '资料、名单与阵容分别保存，按赛事授权完成交接。', steps: steps, primaryText: first.state, primaryUrl: first.url })
  },
  onStepTap: function (event) { var url = event.currentTarget.dataset.url; if (url) wx.navigateTo({ url: url }) },
  onPrimary: function () { wx.navigateTo({ url: this.data.primaryUrl }) },
  onBack: function () { var pages = getCurrentPages(); if (pages.length > 1) wx.navigateBack(); else wx.switchTab({ url: '/pages/event/index' }) }
})
