var workspace = require('../../../utils/workspace')

function eventLabel(type) {
  return ({ goal: '进球', yellow_card: '黄牌', red_card: '红牌', substitution: '换人', penalty: '点球', own_goal: '乌龙球' })[type] || '比赛事件'
}

Page({
  data: { loading: true, errorText: '', denied: false, matchId: '', tournamentId: '', match: {}, events: [], hasEvents: false, normalText: '比赛正常进行', hasRefereePhone: false, visualQa: false },
  onLoad: function (options) { if (workspace.isVisualQaEnabled(options)) { this.loadVisualFixture(); return } this.setData({ matchId: (options && (options.matchId || options.id)) || '', tournamentId: (options && options.tournamentId) || '' }); this.loadMonitor() },
  onShow: function () { if (this.data.matchId && !this.data.visualQa) this.loadMonitor(true) },
  onPullDownRefresh: function () { var that = this; this.loadMonitor(true).finally(function () { wx.stopPullDownRefresh() }) },
  loadMonitor: function (silent) {
    var that = this
    if (!this.data.matchId) { this.setData({ loading: false, errorText: '缺少比赛参数' }); return Promise.resolve() }
    if (!silent) this.setData({ loading: true, errorText: '' })
    var context = workspace.readContext() || {}; var id = this.data.tournamentId
    var known = (context.tournaments || []).filter(function (item) { return !id || item.id === id || item._id === id })
    if (id && !known.length) { this.setData({ loading: false, denied: true }); return Promise.resolve() }
    return new Promise(function (resolve, reject) { wx.cloud.database().collection('matches').doc(that.data.matchId).get({ success: resolve, fail: reject }) }).then(function (response) {
      var raw = response.data || {}
      var events = (raw.events || []).map(function (item, index) { return { id: String(item._id || index), minuteText: String(item.minute || item.time || '--') + "'", typeText: eventLabel(item.type), playerText: item.playerName || item.player || '球员', teamText: item.teamName || '', scoreText: item.scoreText || '' } })
      var status = String(raw.status || 'upcoming'); var live = status === 'ongoing' || status === 'live'
      that.setData({ loading: false, errorText: '', match: { divisionText: raw.divisionName || raw.division || '当前组别', roundText: raw.roundName || raw.round || '比赛', statusText: live ? '进行中' : (status === 'finished' || status === 'completed' ? '已结束' : '待开始'), homeName: raw.homeTeamName || '主队', awayName: raw.awayTeamName || '客队', homeLogo: raw.homeTeamLogo || raw.homeLogo || '', awayLogo: raw.awayTeamLogo || raw.awayLogo || '', homeScore: String(raw.homeScore || 0), awayScore: String(raw.awayScore || 0), venueText: raw.venue || raw.location || '场地待定', refereeName: raw.refereeName || raw.referee || '待指派', refereePhone: raw.refereePhone || '', arrivalText: raw.arrivalStatus || '状态待同步' }, events: events, hasEvents: events.length > 0, hasRefereePhone: !!raw.refereePhone, normalText: raw.abnormalStatus ? '存在待跟进异常' : '比赛正常进行' })
    }).catch(function (error) { that.setData({ loading: false, errorText: error.message || '监控数据加载失败' }) })
  },
  onCallReferee: function () { var phone = this.data.match.refereePhone; if (phone) { wx.makePhoneCall({ phoneNumber: phone }); return } wx.showModal({ title: '暂无联系电话', content: '请通过赛事通讯录联系本场裁判。', showCancel: false }) },
  onAbnormal: function () { wx.navigateTo({ url: '/pages/tournament/exception/exception?matchId=' + this.data.matchId + '&tournamentId=' + this.data.tournamentId }) },
  onBackTap: function () { wx.navigateBack() },
  loadVisualFixture: function () { this.setData({ loading:false, visualQa:true, matchId:'visual-match', tournamentId:'visual-pro', match:{divisionText:'U12组',roundText:'小组赛 第3轮',statusText:'进行中 68′',homeName:'赛小蜂 U12',awayName:'洛阳龙门 U12',homeScore:'2',awayScore:'1',venueText:'1号场',refereeName:'张裁判',refereePhone:'',arrivalText:'裁判端持续同步'},events:[{id:'e1',minuteText:"23'",typeText:'进球',playerText:'张子墨',teamText:'赛小蜂 U12',scoreText:'1 : 0'},{id:'e2',minuteText:"51'",typeText:'进球',playerText:'李文博',teamText:'洛阳龙门 U12',scoreText:'1 : 1'},{id:'e3',minuteText:"66'",typeText:'进球',playerText:'陈宇',teamText:'赛小蜂 U12',scoreText:'2 : 1'}],hasEvents:true,normalText:'比赛正常进行，暂无需升级的异常' }) }
})
