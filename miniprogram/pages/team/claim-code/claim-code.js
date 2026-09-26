// 赛事级球队认领码落地页。
// 与逐队认领邀请（pages/team/prebuilt-invite）的区别：本页不带逐队 token，
// 只带赛事级邀请码，必须由服务端按「本人已验证手机号」列出可认领球队。
// 授权判定全部在 getMiniWorkspace 内完成，本页不做任何手机号匹配或过滤。
var workspace = require('../../../utils/workspace')
Page({
  data: {
    inviteKey: '',
    loading: true,
    errorText: '',
    needsPhone: false,
    binding: false,
    tournamentName: '',
    organizerName: '',
    deadlineText: '',
    expiresAtText: '',
    teams: [],
    hasTeams: false,
    selectedInviteId: '',
    selectedTeamName: '',
    disclaimerAgreed: false,
    checkboxClass: '',
    acceptDisabled: true,
    accepting: false,
    autoEnteringClaimed: false
  },

  onLoad: function (options) {
    var query = options || {}
    var raw = String(query.c || query.inviteKey || query.scene || '')
    var inviteKey = decodeURIComponent(raw)
    // 小程序码 scene 形如 c=<inviteKey>，直接扫链接时也用同一参数名。
    if (inviteKey.indexOf('c=') === 0) inviteKey = inviteKey.slice(2)
    if (!inviteKey) {
      this.setData({ loading: false, errorText: '认领码无效，请重新扫码进入' })
      return
    }
    this.setData({ inviteKey: inviteKey })
    this.loadContext()
  },

  call: function (action, data) {
    var payload = Object.assign({ action: action }, data || {})
    return wx.cloud.callFunction({ name: 'getMiniWorkspace', data: payload })
  },

  loadContext: function () {
    var self = this
    this.setData({ loading: true, errorText: '' })
    this.call('claimCodeContext', { inviteKey: this.data.inviteKey }).then(function (res) {
      var result = res.result || {}
      if (!result.success) {
        // 未完成手机号验证的账号会在服务端被统一拦截，这里据此切换到授权引导。
        if (result.code === 'PHONE_AUTH_REQUIRED') {
          self.setData({ loading: false, needsPhone: true })
          return
        }
        self.setData({ loading: false, errorText: result.message || '认领码加载失败' })
        return
      }
      var tournament = result.tournament || {}
      var code = result.code || {}
      self.setData({
        loading: false,
        needsPhone: Boolean(result.needsPhone),
        tournamentName: tournament.name || '',
        organizerName: tournament.organizerName || '',
        deadlineText: tournament.registrationDeadlineText || '',
        expiresAtText: code.expiresAtText || ''
      })
      self.loadTeams()
    }).catch(function (error) {
      self.setData({ loading: false, errorText: (error && error.message) || '网络异常，请重试' })
    })
  },

  loadTeams: function () {
    var self = this
    this.call('claimableTeams', { inviteKey: this.data.inviteKey }).then(function (res) {
      var result = res.result || {}
      if (!result.success) {
        if (result.code === 'PHONE_AUTH_REQUIRED') {
          self.setData({ needsPhone: true })
          return
        }
        self.setData({ errorText: result.message || '球队列表加载失败' })
        return
      }
      var teams = (result.teams || []).map(function (item) {
        var row = Object.assign({}, item)
        row.className = item.alreadyClaimed ? 'team-row team-row-claimed' : 'team-row'
        return row
      })
      var autoClaimed = teams.length === 1 && teams[0].alreadyClaimed === true
      self.setData({ teams: teams, hasTeams: teams.length > 0, needsPhone: Boolean(result.needsPhone) }, function() {
        if (!autoClaimed || self.data.autoEnteringClaimed) return
        self.setData({ autoEnteringClaimed:true })
        self.enterClaimedTeam(teams[0])
      })
    }).catch(function (error) {
      self.setData({ errorText: (error && error.message) || '网络异常，请重试' })
    })
  },

  onGetPhoneNumber: function (event) {
    var code = event && event.detail && event.detail.code
    if (!code) {
      wx.showToast({ title: '需要手机号授权才能认领', icon: 'none' })
      return
    }
    if (this.data.binding) return
    var self = this
    this.setData({ binding: true })
    // 与 pages/login 相同：先取 openId，再用 checkUserByOpenId 解码微信手机号并写入账号。
    wx.cloud.callFunction({ name: 'getOpenId', data: {} }).then(function (res) {
      var result = res.result || {}
      var openId = result.openId || result.OPENID || ''
      if (!openId) throw new Error('无法识别当前微信账号，请重新进入小程序')
      return wx.cloud.callFunction({
        name: 'checkUserByOpenId',
        data: { openId: openId, phoneCode: code, nickName: '用户', avatarUrl: '' }
      })
    }).then(function (res) {
      var result = res.result || {}
      if (!result.success) throw new Error(result.message || '手机号验证失败')
      self.setData({ binding: false, needsPhone: false })
      self.loadContext()
    }).catch(function (error) {
      self.setData({ binding: false })
      wx.showModal({ title: '手机号验证失败', content: (error && error.message) || '请重试', showCancel: false })
    })
  },

  chooseTeam: function (event) {
    var id = String(event.currentTarget.dataset.id || '')
    var name = String(event.currentTarget.dataset.name || '')
    var selected = this.data.teams.filter(function(item) { return item.inviteId === id })[0] || {}
    if (selected.ownershipTransfer) {
      this.acceptOwnerTransfer(selected)
      return
    }
    if (selected.alreadyClaimed) {
      this.enterClaimedTeam(selected)
      return
    }
    if (event.currentTarget.dataset.review === true) {
      this.openConflict(id)
      return
    }
    var teams = this.data.teams.map(function (item) {
      var row = Object.assign({}, item)
      row.className = item.inviteId === id ? 'team-row team-row-selected' : 'team-row'
      return row
    })
    this.setData({ teams: teams, selectedInviteId: id, selectedTeamName: name }, this.refreshActionState)
  },

  enterClaimedTeam: function (team) {
    this.enterTeamWorkspace(team.teamId, team.teamName, team.workspaceId)
  },

  enterTeamWorkspace: function (teamId, teamName, workspaceId) {
    var self = this
    var targetTeamId = String(teamId || '')
    if (!targetTeamId) return wx.showToast({ title: '球队信息不完整，请稍后重试', icon: 'none' })
    wx.setStorageSync('teamInfo', { _id: targetTeamId, teamId: targetTeamId, teamName: teamName || '' })
    var switchPromise = workspaceId ? workspace.switchWorkspace(workspaceId) : Promise.resolve()
    switchPromise.then(function () {
      wx.navigateTo({ url: '/pages/team/team?teamId=' + encodeURIComponent(targetTeamId) })
    }).catch(function (error) {
      self.setData({ autoEnteringClaimed:false })
      wx.showToast({ title: (error && error.message) || '球队空间切换失败', icon: 'none' })
    })
  },

  acceptOwnerTransfer: function (team) {
    if (this.data.accepting) return
    var self = this
    wx.showModal({
      title:'接收球队主账号',
      content:'确认后你将成为“' + String(team.teamName || '当前球队') + '”的主账号，原负责人保留为协作成员。',
      confirmText:'确认接收',
      success:function(modal) {
        if (!modal.confirm) return
        self.setData({ accepting:true })
        self.call('acceptTeamOwnerTransfer', { transferId:team.transferId || team.inviteId }).then(function(res) {
          var result = res.result || {}
          if (!result.success) throw new Error(result.message || '主账号接收失败')
          wx.showToast({ title:'主账号已转移', icon:'success' })
          self.enterTeamWorkspace(result.teamId || team.teamId, team.teamName, result.workspaceId || '')
        }).catch(function(error) {
          wx.showModal({ title:'接收失败', content:(error && error.message) || '请稍后重试', showCancel:false })
        }).finally(function() { self.setData({ accepting:false }) })
      }
    })
  },

  toggleDisclaimer: function () {
    this.setData({ disclaimerAgreed: !this.data.disclaimerAgreed }, this.refreshActionState)
  },

  refreshActionState: function () {
    this.setData({
      checkboxClass: this.data.disclaimerAgreed ? 'checked' : '',
      acceptDisabled: this.data.accepting || !this.data.disclaimerAgreed || !this.data.selectedInviteId
    })
  },

  openConflict: function (inviteId) {
    var row = this.data.teams.filter(function (item) { return item.inviteId === inviteId })[0] || {}
    wx.redirectTo({
      url: '/pages/team/claim-conflict/claim-conflict?inviteId=' + encodeURIComponent(inviteId) +
        '&teamName=' + encodeURIComponent(row.teamName || '') +
        '&tournamentName=' + encodeURIComponent(this.data.tournamentName || '') +
        '&divisionName=' + encodeURIComponent(row.divisionName || '')
    })
  },

  acceptClaim: function () {
    if (this.data.accepting) return
    if (!this.data.selectedInviteId) {
      wx.showToast({ title: '请选择要认领的球队', icon: 'none' })
      return
    }
    if (!this.data.disclaimerAgreed) {
      wx.showToast({ title: '请先同意参赛免责声明', icon: 'none' })
      return
    }
    var self = this
    this.setData({ accepting: true }, this.refreshActionState)
    this.call('acceptPrebuiltTeamInvite', {
      inviteId: this.data.selectedInviteId,
      choice: 'prebuilt',
      existingTeamId: '',
      disclaimerAgreed: true
    }).then(function (res) {
      var result = res.result || {}
      if (!result.success) throw new Error(result.message || '认领失败')
      if (result.reviewRequired) {
        self.openConflict(self.data.selectedInviteId)
        return
      }
      // 认领成功后进入目标球队实际可用的工作空间。账号原有机构关系不变，
      // 这里只切换本机当前上下文，不扩大目标机构权限。
      var switchPromise = result.workspaceId
        ? workspace.switchWorkspace(result.workspaceId)
        : Promise.resolve()
      wx.showToast({ title: '球队已认领', icon: 'success' })
      var target = Number(result.pendingPlayerDraftCount || 0) > 0
        ? '/pages/team/imported-player-review/imported-player-review?teamId='
        : '/pages/team/team?teamId='
      switchPromise.then(function () {
        wx.redirectTo({ url: target + encodeURIComponent(result.teamId) })
      }).catch(function () {
        wx.redirectTo({ url: target + encodeURIComponent(result.teamId) })
      })
    }).catch(function (error) {
      wx.showModal({ title: '认领失败', content: (error && error.message) || '请重试', showCancel: false })
    }).finally(function () {
      self.setData({ accepting: false }, self.refreshActionState)
    })
  },

  back: function () {
    wx.navigateBack()
  }
})
