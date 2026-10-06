var workspace = require('../../../utils/workspace')

Page({
  data: { inviteId: '', loading: true, tournament: {}, invite: {}, errorText: '', isDevtools: false },
  onLoad: function (options) { var query = options || {}; var qa = workspace.isVisualQaEnabled(query); this.setData({ inviteId: decodeURIComponent(String(query.inviteId || query.scene || '')), isDevtools: qa }); if (qa) { this.setData({ loading: false, tournament: { name: '2026 河南青少年足球冠军联赛' }, invite: { divisionName: 'U12组' } }); return } this.load() },
  load: function () { var self = this; wx.cloud.callFunction({ name: 'onboardingWorkspace', data: { action: 'previewTournamentCreateTeamInvite', inviteId: this.data.inviteId } }).then(function (res) { var result = res.result || {}; if (!result.success) throw new Error(result.message || '邀请加载失败'); self.setData({ loading: false, tournament: result.tournament || {}, invite: result.invite || {} }) }).catch(function (error) { self.setData({ loading: false, errorText: error.message || '邀请加载失败' }) }) },
  create: function () { wx.navigateTo({ url: '/pages/onboarding/onboarding?scene=team&step=team&tournamentInviteId=' + encodeURIComponent(this.data.inviteId) }) },
  later: function () { wx.navigateBack() },
  back: function () { wx.navigateBack() }
})
