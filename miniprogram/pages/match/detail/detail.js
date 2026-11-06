// pages/match/detail/detail.js
// 比赛详情页 - 增强版（修复空白 + 完善字段映射）
var workspace = require('../../../utils/workspace')

// 辅助函数：事件类型文本映射
function getEventTypeText(type) {
  var map = { goal: '进球', score: '进球', assist: '助攻', yellow_card: '黄牌', red_card: '红牌', substitution: '换人', penalty: '点球', penalty_scored: '点球', penalty_missed: '点球未进', penalty_miss: '点球未进', own_goal: '乌龙球', second_yellow: '两黄变红', second_yellow_red: '两黄变红' }
  return map[type] || type || ''
}

function getEventTypeIcon(type) {
  var map = { goal: '⚽', score: '⚽', assist: '🎯', yellow_card: '🟨', red_card: '🟥', substitution: '🔄', penalty: '🥅', penalty_scored: '🥅', penalty_missed: '🥅', penalty_miss: '🥅', own_goal: '💥', second_yellow: '🟥', second_yellow_red: '🟥' }
  return map[type] || '📌'
}

function scoreText(value) { return (typeof value==='number' || typeof value==='string' && value.trim()!=='') && Number.isInteger(Number(value)) && Number(value)>=0 ? String(Number(value)) : '—' }

Page({
  data: {
    matchId: '',
    match: null,
    loading: true,
    errorMsg: '',
    isHomeCoach: false,
    isAwayCoach: false,
    showLineupTip: true,
    currentTeamId: '',
    homeLineupSubmitted: false,
    awayLineupSubmitted: false,
    // 格式化后的展示数据
    displayMatch: null
  },

  onLoad: function(options) {
    options = options || {}
    var matchId = (options.matchId || options.id || '')
    if (!matchId) {
      this.setData({ loading: false, errorMsg: '缺少比赛ID参数' })
      return
    }
    this.setData({ matchId: matchId, currentTeamId:String(options.teamId || '') })
  },

  onShow: function() {
    if (this.data.matchId) {
      this.loadMatchDetail()
    }
  },

  loadMatchDetail: function() {
    var that = this
    if (that._request) return that._request
    that.setData({ loading: true, errorMsg: '', match:null, displayMatch:null })
    var epoch = (that._epoch || 0) + 1
    that._epoch = epoch
    var context = workspace.readContext() || {}, userId = String((wx.getStorageSync('userInfo') || {})._id || '')
    var timer
    var timeout = new Promise(function(resolve,reject) { timer=setTimeout(function(){reject(new Error('加载超时，请重试'))},12000) })
    var request = Promise.resolve().then(function() {
      if (that.data.currentTeamId) return wx.cloud.callFunction({name:'getMiniWorkspace',data:{action:'teamMatchDetail',workspaceId:(context.currentWorkspace || {}).id || '',teamId:that.data.currentTeamId,matchId:that.data.matchId}}).then(function(response) {
        var result=response.result || {}
        if (!result.success) throw new Error(result.message || '比赛读取失败，请重试')
        return {data:result.match}
      })
      return wx.cloud.database().collection('matches').doc(that.data.matchId).get()
    })
    that._request = Promise.race([request,timeout]).then(function(res) {
        if (epoch!==that._epoch || String((wx.getStorageSync('userInfo') || {})._id || '')!==userId) return
        if (!res.data) throw new Error('比赛不存在或已被删除')
        var raw = res.data
        // 球队操作权来自当前工作空间，不再依赖永久角色。
        var accessibleTeamIds = workspace.getAccessibleTeamIds()
        if (that.data.currentTeamId && [String(raw.homeTeamId || ''),String(raw.awayTeamId || '')].indexOf(String(that.data.currentTeamId)) < 0) {
          that.setData({loading:false,errorMsg:'该比赛不属于当前球队',match:null,displayMatch:null});return
        }
        var isHomeCoach = accessibleTeamIds.indexOf(raw.homeTeamId || raw.homeTeam) >= 0
        var isAwayCoach = accessibleTeamIds.indexOf(raw.awayTeamId || raw.awayTeam) >= 0
        var currentTeamId = accessibleTeamIds.indexOf(that.data.currentTeamId) >= 0 ? that.data.currentTeamId : (isHomeCoach ? raw.homeTeamId || raw.homeTeam : isAwayCoach ? raw.awayTeamId || raw.awayTeam : '')

        // 格式化日期（兼容 Date 对象、时间戳、ISO 字符串）
        var dateText = raw.matchDate || raw.date || '', timeText = raw.matchTime || raw.time || ''
        var matchTimeStr = typeof dateText==='string' && /^\d{4}-\d{2}-\d{2}/.test(dateText) && /^\d{1,2}:\d{2}$/.test(String(timeText)) ? dateText.slice(0,10)+' '+timeText : that.formatMatchTime(raw.startTime || raw.kickoffAt || raw.matchTime || dateText)

        // 构建展示用的数据对象（统一字段名）
        var displayMatch = {
          tournamentName: raw.tournamentName || raw.tournament || raw.competitionName || '赛事',
          homeTeamName: raw.homeTeamName || raw.homeTeam || raw.teamA || '主队',
          awayTeamName: raw.awayTeamName || raw.awayTeam || raw.teamB || '客队',
          homeLogo: raw.homeTeamLogo || raw.homeLogo || '',
          awayLogo: raw.awayTeamLogo || raw.awayLogo || '',
          homeScore: raw.homeScore !== undefined ? raw.homeScore : (raw.scoreHome !== undefined ? raw.scoreHome : ''),
          awayScore: raw.awayScore !== undefined ? raw.awayScore : (raw.scoreAway !== undefined ? raw.scoreAway : ''),
          venue: raw.venue || raw.location || raw.stadium || '待定',
          matchTime: raw.matchTimeText || matchTimeStr,
          round: raw.round || raw.stage || '',
          status: raw.status || 'unknown',
          // 状态文字映射
          statusText: that.mapStatus(raw.status),
          refereeName: raw.refereeName || raw.referee || '',
          assistantReferee1: raw.assistantReferee1 || raw.linesman1 || '',
          assistantReferee2: raw.assistantReferee2 || raw.linesman2 || '',
          fourthOfficial: raw.fourthOfficial || '',
          // 球服颜色
          homeKitJersey: (raw.kitColors && raw.kitColors.home && raw.kitColors.home.jersey) || '',
          homeKitShorts: (raw.kitColors && raw.kitColors.home && raw.kitColors.home.shorts) || '',
          homeKitSocks: (raw.kitColors && raw.kitColors.home && raw.kitColors.home.socks) || '',
          awayKitJersey: (raw.kitColors && raw.kitColors.away && raw.kitColors.away.jersey) || '',
          awayKitShorts: (raw.kitColors && raw.kitColors.away && raw.kitColors.away.shorts) || '',
          awayKitSocks: (raw.kitColors && raw.kitColors.away && raw.kitColors.away.socks) || '',
          hasKitColors: !!(raw.kitColors && (raw.kitColors.home || raw.kitColors.away)),
          // 比赛事件
          events: Array.isArray(raw.events) ? raw.events.map(function(ev) {
            return {
              minute: ev.minute || ev.time || '',
              type: ev.type || '',
              typeText: getEventTypeText(ev.type),
              typeIcon: getEventTypeIcon(ev.type),
              playerName: ev.playerName || ev.player || '',
              assistName: ev.assistName || ev.assist || '',
              team: ev.team || ev.teamId || ''
            }
          }) : [],
          hasEvents: Array.isArray(raw.events) && raw.events.length > 0,
          // 预计算比分文本
          homeScoreText: scoreText(raw.homeScore == null ? raw.scoreHome : raw.homeScore),
          awayScoreText: scoreText(raw.awayScore == null ? raw.scoreAway : raw.awayScore)
        }

        // 检查首发阵容状态
        var homeLineup = raw.homeLineup || raw.lineupHome || {}
        var awayLineup = raw.awayLineup || raw.lineupAway || {}

        that.setData({
          match: raw,
          displayMatch: displayMatch,
          loading: false,
          errorMsg: '',
          currentTeamId: currentTeamId,
          isHomeCoach: isHomeCoach && ['upcoming','scheduled','not_started','pending'].indexOf(String(raw.status))>=0,
          isAwayCoach: isAwayCoach && ['upcoming','scheduled','not_started','pending'].indexOf(String(raw.status))>=0,
          homeLineupSubmitted: !!(homeLineup && homeLineup.submitted),
          awayLineupSubmitted: !!(awayLineup && awayLineup.submitted),
          showLineupTip: false,
          events: displayMatch.events,
          hasEvents: displayMatch.hasEvents,
          homeKitJersey: displayMatch.homeKitJersey,
          homeKitShorts: displayMatch.homeKitShorts,
          homeKitSocks: displayMatch.homeKitSocks,
          awayKitJersey: displayMatch.awayKitJersey,
          awayKitShorts: displayMatch.awayKitShorts,
          awayKitSocks: displayMatch.awayKitSocks,
          hasKitColors: displayMatch.hasKitColors
        })

    }).catch(function(error) {
      if (epoch!==that._epoch) return
      that.setData({loading:false,errorMsg:error.message || error.errMsg || '加载失败，请重试',match:null,displayMatch:null})
    }).finally(function() {
      clearTimeout(timer)
      if (epoch===that._epoch) {that._request=null;that.setData({loading:false});wx.stopPullDownRefresh()}
    })
    return that._request
  },

  onUnload: function() { this._epoch=(this._epoch || 0)+1;this._request=null },

  // 格式化比赛时间（兼容多种格式）
  formatMatchTime: function(timeVal) {
    if (!timeVal) return '待定'
    var d = timeVal
    // 如果是 Date 对象（云数据库返回的可能是这个）
    if (typeof d === 'object' && d instanceof Date) {
      return this.formatDateObj(d)
    }
    // 如果是数字（秒级或毫秒级时间戳）
    if (typeof d === 'number') {
      d = new Date(d > 1e12 ? d : d * 1000)
      return this.formatDateObj(d)
    }
    // 如果是字符串
    if (typeof d === 'string') {
      // ISO 格式
      var parsed = new Date(d)
      if (!isNaN(parsed.getTime())) {
        return this.formatDateObj(parsed)
      }
      return d // 直接返回原始字符串
    }
    return '待定'
  },

  formatDateObj: function(d) {
    if (!d || isNaN(d.getTime())) return '待定'
    var y = d.getFullYear()
    var m = d.getMonth() + 1
    var day = d.getDate()
    var h = d.getHours()
    var min = d.getMinutes()
    var pad = function(n) { return n < 10 ? '0' + n : '' + n }
    return y + '-' + pad(m) + '-' + pad(day) + ' ' + pad(h) + ':' + pad(min)
  },

  // 状态码→文字映射
  mapStatus: function(status) {
    var map = {
      '0': '未开始',
      '1': '未开始',
      'upcoming': '未开始',
      'pending': '未开始',
      'ongoing': '进行中',
      'live': '进行中',
      '2': '进行中',
      'completed': '已结束',
      'finished': '已结束',
      '3': '已结束',
      'cancelled': '已取消',
      'postponed': '延期'
    }
    return map[status] || map[String(status)] || status || '未知'
  },

  // 提交首发阵容
  onSubmitLineup: function(e) {
    var isHome = e.currentTarget.dataset.home === 'true'
    var match = this.data.match
    if (!match) return

    var teamId = isHome ? match.homeTeamId : match.awayTeamId
    var teamName = isHome ? (this.data.displayMatch.homeTeamName || '主队') : (this.data.displayMatch.awayTeamName || '客队')

    if (!teamId) {
      wx.showToast({ title: '球队信息不完整', icon: 'none' })
      return
    }

    wx.navigateTo({
      url: '/packageA/pages/lineup/lineup?matchId=' + this.data.matchId +
           '&teamId=' + teamId +
           '&isHome=' + isHome +
           '&teamName=' + encodeURIComponent(teamName)
    })
  },

  // 下拉刷新
  onPullDownRefresh: function() {
    this.loadMatchDetail()
    wx.stopPullDownRefresh()
  }
})
