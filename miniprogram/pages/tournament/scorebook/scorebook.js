const workspace = require('../../../utils/workspace')

Page({
  data: {
    tournamentId: '',
    tournamentName: '',
    ready: false,
    heroTagClass: 'pending',
    shared: false,
    readyText: '',
    pendingText: '',
    hasPending: false,
    totalMatches: 0,
    submittedMatches: 0,
    loading: true,
    errorText: '',
    overallMvpName: '',
    overallMvpMeta: '',
    overallScorerName: '',
    overallScorerMeta: '',
    hasOverall: false,
    divisions: [],
    rules: []
  },

  onLoad(options) {
    this.setData({
      tournamentId: (options && options.id) || '',
      tournamentName: decodeURIComponent((options && options.name) || ''),
      shared: options && options.shared === '1'
    })
    this.loadData()
  },

  onShow() { if (this._loaded) this.loadData() },
  onUnload() { this._revision = (this._revision || 0) + 1 },
  loadData() {
    var that = this
    var revision = (this._revision || 0) + 1; this._revision = revision
    var context = workspace.readContext() || {}
    this.setData({ loading: true, errorText: '' })
    return wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: { action: this.data.shared ? 'sharedTournamentData' : 'tournamentData', workspaceId: (context.currentWorkspace || {}).id || '', tournamentId: this.data.tournamentId }
    }).then(function(reply) {
      var result = reply.result || {}
      if (revision !== that._revision) return
      if (((workspace.readContext() || {}).currentWorkspace || {}).id !== (context.currentWorkspace || {}).id) return
      if (!result.success || !result.awards) {
        that.setData({ loading: false, errorText: result.message || '成绩册暂不可用，请重试' })
        return
      }
      that._loaded = true; that.applyAwards(result.awards, result.tournament || {})
    }).catch(function(err) {
      console.warn('成绩册加载失败', err)
      if (revision === that._revision) that.setData({ loading: false, errorText: '加载失败，请稍后重试' })
    })
  },

  applyAwards(awards, tournament) {
    var divisions = (awards.divisions || []).map(function(division) {
      var xi = (division.bestXI || []).map(function(slot) {
        return {
          key: slot.slot + (slot.playerId || slot.name || ''),
          slot: slot.slot,
          name: slot.name || '待评定',
          teamName: slot.teamName || '',
          filledNote: slot.filled ? '补位' : '',
          manualNote: slot.manual ? '手动调整' : ''
        }
      })
      var teamAwards = (division.teamAwards || []).map(function(award) {
        return { key: award.key, title: award.title, teamName: award.teamName, note: award.note || '' }
      })
      var groups = (division.standings || []).map(function(group) {
        return {
          key: division.divisionId + '-' + group.groupName,
          groupName: group.groupName,
          rows: (group.rows || []).map(function(row) {
            return {
              key: group.groupName + '-' + row.rank,
              rank: row.rank,
              teamName: row.teamName,
              played: row.played,
              wins: row.wins,
              draws: row.draws,
              losses: row.losses,
              goalsFor: row.goalsFor,
              goalsAgainst: row.goalsAgainst,
              goalDifferenceText: row.goalDifference > 0 ? '+' + row.goalDifference : String(row.goalDifference),
              points: row.points
            }
          })
        }
      })
      return {
        divisionId: division.divisionId,
        divisionName: division.divisionName,
        summaryText: division.matchCount + ' 场 · ' + division.teamCount + ' 支球队',
        championText: division.champion ? division.champion.teamName : '—',
        runnerUpText: division.runnerUp ? division.runnerUp.teamName : '—',
        scorerName: division.topScorer ? division.topScorer.name : '待评定',
        scorerTeam: division.topScorer ? division.topScorer.teamName : '',
        scorerStat: division.topScorer ? '进球 ' + division.topScorer.goals + ' · 助攻 ' + (division.topScorer.assists || 0) : '暂无进球记录',
        mvpName: division.mvp ? division.mvp.name : '待评定',
        mvpTeam: division.mvp ? division.mvp.teamName : '',
        mvpStat: division.mvp ? '贡献分 ' + division.mvp.contribution : '暂无可评球员',
        keeperName: division.goalkeeper ? division.goalkeeper.name : '待评定',
        keeperTeam: division.goalkeeper ? division.goalkeeper.teamName : '',
        keeperStat: division.goalkeeper ? '零封 ' + (division.goalkeeper.cleanSheets || 0) + ' 场 · 失球 ' + (division.goalkeeper.gkConceded || 0) : '未记录门将首发',
        bestXI: xi,
        hasBestXI: xi.length > 0,
        teamAwards: teamAwards,
        groups: groups
      }
    })
    var overall = awards.overall || {}
    var pending = Math.max(0, (awards.totalMatches || 0) - (awards.submittedMatches || 0))
    var overallMvp = overall.mvp
    var overallScorer = overall.topScorer
    this.setData({
      loading: false,
      ready: awards.ready === true,
      heroTagClass: awards.ready === true ? 'ok' : 'pending',
      readyText: awards.ready === true ? '已具备正式发布条件' : awards.totalMatches ? '还有 ' + pending + ' 场待归档' : '暂无已排比赛',
      pendingText: pending > 0 ? '全部比赛归档后可发布正式成绩册' : '',
      hasPending: pending > 0,
      totalMatches: awards.totalMatches || 0,
      submittedMatches: awards.submittedMatches || 0,
      overallMvpName: overallMvp ? overallMvp.name : '待评定',
      overallMvpMeta: overallMvp ? (overallMvp.teamName || '') + (overallMvp.divisionName ? ' · ' + overallMvp.divisionName : '') : '',
      overallScorerName: overallScorer ? overallScorer.name : '待评定',
      overallScorerMeta: overallScorer ? (overallScorer.teamName || '') + ' · ' + overallScorer.goals + ' 球' : '',
      hasOverall: Boolean(overallMvp || overallScorer),
      divisions: divisions,
      rules: (awards.rules || []).map(function(text,index){return {key:index+1,text:text}}),
      tournamentName: this.data.tournamentName || tournament.name || ''
    })
  },

  onShareAppMessage() {
    return {
      title: (this.data.tournamentName || '赛事') + ' 成绩册',
      path: '/pages/tournament/scorebook/scorebook?id=' + this.data.tournamentId + '&shared=' + (this.data.shared ? '1' : '0')
    }
  },

  onShareTimeline() {
    return { title: (this.data.tournamentName || '赛事') + ' 成绩册' }
  }
})
