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
    var matchId = (options.matchId || options.id || '')
    console.log('[matchDetail] onLoad, matchId:', matchId)
    if (!matchId) {
      this.setData({ loading: false, errorMsg: '缺少比赛ID参数' })
      return
    }
    this.setData({ matchId: matchId })
    this.loadMatchDetail()
  },

  onShow: function() {
    if (this.data.matchId) {
      this.loadMatchDetail()
    }
  },

  loadMatchDetail: function() {
    var that = this
    that.setData({ loading: true, errorMsg: '' })

    var db = wx.cloud.database()

    db.collection('matches').doc(that.data.matchId).get({
      success: function(res) {
        if (!res.data) {
          that.setData({
            loading: false,
            errorMsg: '比赛不存在或已被删除',
            match: null,
            displayMatch: null
          })
          return
        }

        var raw = res.data
        console.log('[matchDetail] 原始数据:', JSON.stringify(raw).substring(0, 500))

        // 球队操作权来自当前工作空间，不再依赖永久角色。
        var accessibleTeamIds = workspace.getAccessibleTeamIds()
        var isHomeCoach = accessibleTeamIds.indexOf(raw.homeTeamId || raw.homeTeam) >= 0
        var isAwayCoach = accessibleTeamIds.indexOf(raw.awayTeamId || raw.awayTeam) >= 0

        // 格式化日期（兼容 Date 对象、时间戳、ISO 字符串）
        var matchTimeStr = that.formatMatchTime(raw.matchTime || raw.date || raw.startTime || raw.matchDate)

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
          matchTime: matchTimeStr,
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
          homeScoreText: (raw.homeScore !== undefined && raw.homeScore !== null) ? String(raw.homeScore) : '0',
          awayScoreText: (raw.awayScore !== undefined && raw.awayScore !== null) ? String(raw.awayScore) : '0'
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
          isHomeCoach: isHomeCoach,
          isAwayCoach: isAwayCoach,
          homeLineupSubmitted: !!(homeLineup && homeLineup.submitted),
          awayLineupSubmitted: !!(awayLineup && awayLineup.submitted),
          showLineupTip: !isHomeCoach && !isAwayCoach,
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

        console.log('[matchDetail] 展示数据:', displayMatch)
      },
      fail: function(err) {
        console.error('[matchDetail] 加载失败:', err)
        that.setData({
          loading: false,
          errorMsg: '加载失败：' + (err.errMsg || '网络异常'),
          match: null,
          displayMatch: null
        })
      }
    })
  },

  // 格式化比赛时间（兼容多种格式）
  formatMatchTime: function(timeVal) {
    if (!timeVal) return '待定'
    var d = timeVal
    // 如果是 Date 对象（云数据库返回的可能是这个）
    if (typeof d === 'object' && d instanceof Date) {
      return that.formatDateObj(d)
    }
    // 如果是数字（秒级或毫秒级时间戳）
    if (typeof d === 'number') {
      d = new Date(d > 1e12 ? d : d * 1000)
      return that.formatDateObj(d)
    }
    // 如果是字符串
    if (typeof d === 'string') {
      // ISO 格式
      var parsed = new Date(d)
      if (!isNaN(parsed.getTime())) {
        return that.formatDateObj(parsed)
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
