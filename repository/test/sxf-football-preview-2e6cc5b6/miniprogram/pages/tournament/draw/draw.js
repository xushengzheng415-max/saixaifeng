const db = wx.cloud.database()

function normalizeTeam(team) {
  return {
    teamName: (team && (team.teamName || team.name)) || ''
  }
}

function buildDrawState(source, fallbackType) {
  var scheduleType = (source && source.scheduleType) || fallbackType || ''
  var groups = (source && source.groups) || []
  var allTeams = (source && source.allTeams) || []
  var leagueConfig = (source && source.leagueConfig) || {}
  var combinedConfig = (source && source.combinedConfig) || {}

  var groupList = groups.map(function(g) {
    var teams = (g.teams || []).map(normalizeTeam)
    return {
      groupName: g.groupName || g.name || '',
      teams: teams,
      teamsLen: teams.length
    }
  }).filter(function(g) {
    return g.groupName || g.teamsLen > 0
  })

  var upper = []
  var lower = []
  if (scheduleType === 'cup') {
    var halfIndex = Math.ceil(allTeams.length / 2)
    upper = allTeams.slice(0, halfIndex).map(normalizeTeam)
    lower = allTeams.slice(halfIndex).map(normalizeTeam)
  } else {
    upper = ((source && source.upperHalf) || []).map(normalizeTeam)
    lower = ((source && source.lowerHalf) || []).map(normalizeTeam)
  }

  var leagueLoopType = ''
  if (source && source.leagueLoopType) {
    leagueLoopType = source.leagueLoopType
  } else if (leagueConfig.loopType) {
    leagueLoopType = leagueConfig.loopType
  } else if (combinedConfig.leagueLoopType) {
    leagueLoopType = combinedConfig.leagueLoopType
  }

  var leagueText = ''
  if (leagueLoopType === 'single') {
    leagueText = '单循环'
  } else if (leagueLoopType === 'double') {
    leagueText = '双循环'
  }

  var teamsLen = 0
  if (Array.isArray(source && source.teams) && source.teams.length > 0) {
    teamsLen = source.teams.length
  } else if (allTeams.length > 0) {
    teamsLen = allTeams.length
  } else if (groupList.length > 0) {
    teamsLen = groupList.reduce(function(sum, group) { return sum + group.teamsLen }, 0)
  }

  var hasGroups = groupList.length > 0
  var isCup = scheduleType === 'cup'
  var isLeague = scheduleType === 'league'
  var noData = !hasGroups && upper.length === 0 && lower.length === 0 && !isLeague

  return {
    scheduleInfo: source || null,
    hasGroups: hasGroups,
    groupList: groupList,
    groupListLen: groupList.length,
    isCup: isCup,
    cupUpperHalf: upper,
    cupLowerHalf: lower,
    upperHalfLen: upper.length,
    lowerHalfLen: lower.length,
    isLeague: isLeague,
    leagueText: leagueText,
    teamsLen: teamsLen,
    loading: false,
    errorMsg: '',
    noData: noData
  }
}

Page({
  data: {
    tournamentId: '',
    tournamentName: '',
    tournamentType: '',
    typeText: '',
    scheduleInfo: null,
    hasGroups: false,
    groupList: [],
    groupListLen: 0,
    isCup: false,
    cupUpperHalf: [],
    cupLowerHalf: [],
    upperHalfLen: 0,
    lowerHalfLen: 0,
    isLeague: false,
    leagueText: '',
    teamsLen: 0,
    loading: true,
    errorMsg: '',
    noData: false
  },

  onLoad(options) {
    if (options && options.id) {
      this.setData({ tournamentId: options.id })
      this.loadData()
    }
  },

  loadData() {
    var that = this
    that.setData({ loading: true, errorMsg: '', noData: false })
    try { wx.cloud.init({ env: 'cloud1-7g8ckb3c7815a011', traceUser: false }) } catch(e) {}

    db.collection('tournaments').doc(that.data.tournamentId).get({
      success(res) {
        var t = res.data || {}
        var typeNames = { tournament: '赛会制', cup: '杯赛制', league: '联赛制', combined: '复合制' }
        that.setData({
          tournamentName: t.name || '',
          tournamentType: t.type || '',
          typeText: typeNames[t.type] || t.type || ''
        })
      },
      fail() {
        that.setData({ loading: false, errorMsg: '加载赛事信息失败' })
      }
    })

    db.collection('tournament_groups')
      .where({ tournamentId: that.data.tournamentId })
      .get({
        success(res) {
          var list = res.data || []
          var summary = null
          for (var i = 0; i < list.length; i++) {
            var item = list[i]
            if (item.scheduleType || (Array.isArray(item.groups) && item.groups.length > 0) || (Array.isArray(item.allTeams) && item.allTeams.length > 0)) {
              summary = item
              break
            }
          }

          if (summary) {
            that.setData(buildDrawState(summary, that.data.tournamentType))
            return
          }

          var groupItems = list.filter(function(item) {
            return (item.groupName || item.groupCode) && Array.isArray(item.teams) && item.teams.length > 0
          })

          if (groupItems.length > 0) {
            var legacySummary = {
              scheduleType: that.data.tournamentType || 'tournament',
              groups: groupItems.map(function(item) {
                return {
                  groupName: item.groupName || item.groupCode + '组',
                  teams: item.teams || []
                }
              })
            }
            that.setData(buildDrawState(legacySummary, that.data.tournamentType))
            return
          }

          db.collection('schedule_info')
            .where({ tournamentId: that.data.tournamentId })
            .limit(1)
            .get({
              success(oldRes) {
                if (oldRes.data && oldRes.data.length > 0) {
                  that.setData(buildDrawState(oldRes.data[0], that.data.tournamentType))
                } else {
                  that.setData({ loading: false, noData: true, errorMsg: '' })
                }
              },
              fail() {
                that.setData({ loading: false, errorMsg: '加载失败' })
              }
            })
        },
        fail() {
          db.collection('schedule_info')
            .where({ tournamentId: that.data.tournamentId })
            .limit(1)
            .get({
              success(oldRes) {
                if (oldRes.data && oldRes.data.length > 0) {
                  that.setData(buildDrawState(oldRes.data[0], that.data.tournamentType))
                } else {
                  that.setData({ loading: false, noData: true, errorMsg: '' })
                }
              },
              fail() {
                that.setData({ loading: false, errorMsg: '加载失败' })
              }
            })
        }
      })

    setTimeout(function() {
      db.collection('tournament_teams')
        .where({ tournamentId: that.data.tournamentId, status: 'approved' })
        .count({
          success: function(res) {
            if (!that.data.teamsLen) {
              that.setData({ teamsLen: res.total || 0 })
            }
          }
        })
    }, 100)
  }
})
