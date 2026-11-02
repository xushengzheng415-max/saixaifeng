var workspace = require('../../utils/workspace')
var logoCutout = require('../../utils/logo-cutout')

function isDevtools() {
  try { return wx.getSystemInfoSync().platform === 'devtools' } catch (error) { return false }
}

Page({
  data: {
    pageTitle: '开始使用赛小蜂',
    isSceneStep: true,
    isTeamProfileStep: false,
    isTeamSuccessStep: false,
    isEventProfileStep: false,
    isEventSuccessStep: false,
    isTrainingServiceStep: false,
    isTrainingProfileStep: false,
    isTrainingSuccessStep: false,
    isTrainingDemoStep: false,
    showSteps: true,
    selectedScene: 'team',
    sceneEventClass: '',
    sceneTeamClass: 'is-selected',
    sceneTrainingClass: '',
    stepOneClass: 'is-current',
    stepTwoClass: '',
    stepThreeClass: '',
    primaryText: '下一步',
    isSubmitting: false,
    statusText: '',
    teamName: '',
    crestPreview: '',
    originalLogo: '',
    transparentLogo: '',
    crestStateText: '建议使用清晰正方形图片',
    crestBusy: false,
    cropVisible: false,
    tempCrestPath: '',
    crestTransform: 'translate(0px, 0px) scale(1)',
    cropScale: 1,
    cropOffsetX: 0,
    cropOffsetY: 0,
    cropTouchX: 0,
    cropTouchY: 0,
    createdTeam: {},
    createdTeamName: '',
    createdTeamLogo: '',
    hasCreatedTeamLogo: false,
    tournamentInviteId: '',
    teamShortName: '',
    teamDivision: '',
    teamCity: '',
    isTeamDraftConfirmation: false,
    teamSuccessForTournament: false,
    selfJoinText: '把我的球员档案加入本队',
    selfJoinClass: '',
    selfJoinDisabled: false,
    selfJoinPlayerId: '',
    isTournamentSignupFlow: false,
    teamOnboardingReturnUrl: '',
    teamProfileSubtitle: '只需两项，其他资料以后再补充。',
    teamSuccessTitle: '球队创建成功',
    successSubtitle: '',
    eventName: '', eventCity: '', createdEvent: {}, createdEventName: '', createdEventLogo: '', hasCreatedEventLogo: false,
    trainingStatus: 'inactive',
    trainingStatusText: '尚未开户',
    trainingStatusClass: 'service-status-inactive',
    trainingCanCreate: false,
    consultationText: '联系客户咨询',
    trainingOrgName: '',
    createdTraining: {},
    createdTrainingName: '',
    createdTrainingLogo: '',
    hasCreatedTrainingLogo: false,
    errorVisible: false,
    errorText: ''
  },

  onLoad: function(options) {
    if (isDevtools() && options && options.visualQa === '1' && options.state === 'team-success') {
      this.showTeamSuccess({ id: 'visual-qa-team', name: '赛小蜂 U12 竞技队', logo: '' }, null)
      return
    }
    if (isDevtools() && options && options.visualQa === '1' && options.state === 'event-success') {
      this.showEventSuccess({ id: 'visual-qa-event', name: '2026 少年足球邀请赛', logo: '' })
      return
    }
    if (isDevtools() && options && options.visualQa === '1' && options.state === 'training-success') {
      this.showTrainingSuccess({ id: 'visual-qa-training', name: '绿城足球青训中心', logo: '' }, 'visual-qa-training-workspace')
      return
    }
    var requestedStep = options && options.step
    var requestedScene = options && options.scene
    var tournamentInviteId = options && (options.tournamentInviteId || options.inviteId)
    var tournamentSignupFlow = options && options.fromTournamentSignup === '1'
    var teamOnboardingReturnUrl = options && options.returnUrl
      ? decodeURIComponent(options.returnUrl)
      : (wx.getStorageSync('teamOnboardingReturnUrl') || '')
    if (tournamentSignupFlow && teamOnboardingReturnUrl) {
      wx.setStorageSync('teamOnboardingReturnUrl', teamOnboardingReturnUrl)
      this.setData({
        isTournamentSignupFlow: true,
        teamOnboardingReturnUrl: teamOnboardingReturnUrl,
        selectedScene: 'team',
        sceneEventClass: '',
        sceneTeamClass: 'is-selected',
        sceneTrainingClass: '',
        teamProfileSubtitle: '填写球队名称和队徽后，继续选择报名组别并确认参赛。',
        teamSuccessTitle: '球队资料已保存'
      })
    }
    if (tournamentInviteId) this.setData({ tournamentInviteId: String(tournamentInviteId) })
    // 登记页可选择把本人或某名孩子档案入队，建队成功后按所选档案明确入队。
    if (options && options.joinPlayerId) this.setData({ selfJoinPlayerId: decodeURIComponent(String(options.joinPlayerId)) })
    if (['event', 'team', 'training'].indexOf(requestedScene) >= 0) {
      this.selectScene({ currentTarget: { dataset: { scene: requestedScene } } })
      // 服务号卡片/分享进入：球队与赛事场景跳过场景选择，直接落到创建表单；失败时停留本页可手动下一步
      if (requestedScene === 'team' || requestedScene === 'event') this.saveSceneAndContinue()
    }
    if (requestedStep === 'team') this.showTeamProfile()
    if (options && options.fromTeamDraft === '1') {
      var teamDraft = wx.getStorageSync('teamCreateDraft') || {}
      this.setData({ teamName: teamDraft.teamName || '', teamShortName: teamDraft.shortName || '', teamDivision: teamDraft.divisionText || '', teamCity: teamDraft.city || '', crestPreview: teamDraft.crestPreview || '', originalLogo: teamDraft.originalLogo || '', transparentLogo: teamDraft.transparentLogo || '', isTeamDraftConfirmation: true })
    }
    if (isDevtools() && options && options.visualQa === '1' && requestedStep === 'event') this.showEventProfile()
    if (isDevtools() && options && options.visualQa === '1' && requestedStep === 'training-service') this.showTrainingService({ status: 'inactive', hasBackendProvision: false })
    if (isDevtools() && options && options.visualQa === '1' && requestedStep === 'training-active') this.showTrainingService({ status: 'active', hasBackendProvision: true })
    if (isDevtools() && options && options.visualQa === '1' && requestedStep === 'training-demo') this.showTrainingDemo()
    if (isDevtools() && options && options.visualQa === '1' && requestedStep === 'training-profile') {
      this.setData({ trainingCanCreate: true, trainingOrgName: '绿城足球青训中心' }, function() {
        this.showTrainingProfile()
      })
    }
    if (!requestedStep && !requestedScene && !tournamentInviteId && !(options && options.fromTeamDraft === '1')) {
      this.redirectExistingWorkspace()
    }
  },

  redirectExistingWorkspace: function() {
    workspace.loadContext({ skipRestrictedRedirect: true }).then(function(context) {
      if (!context || !context.currentWorkspace) return
      wx.switchTab({ url: '/pages/home/home' })
    }).catch(function() {
      // 没有可用工作空间时保留首次创建页，不向新用户展示技术错误。
    })
  },

  selectScene: function(event) {
    var scene = event.currentTarget.dataset.scene || ''
    if (['event', 'team', 'training'].indexOf(scene) < 0) return
    this.setData({
      selectedScene: scene,
      sceneEventClass: scene === 'event' ? 'is-selected' : '',
      sceneTeamClass: scene === 'team' ? 'is-selected' : '',
      sceneTrainingClass: scene === 'training' ? 'is-selected' : '',
      errorVisible: false,
      errorText: ''
    })
  },

  saveSceneAndContinue: function() {
    var that = this
    if (this.data.isSubmitting || this.data.crestBusy) return
    this.setData({ isSubmitting: true, primaryText: '正在保存…', errorVisible: false })
    wx.cloud.callFunction({
      name: 'onboardingWorkspace',
      data: { action: 'saveScene', scene: this.data.selectedScene },
      success: function(response) {
        var result = response.result || {}
        if (!result.success) {
          that.showError(result.message || '场景保存失败，请重试')
          return
        }
        if (that.data.selectedScene === 'team') {
          that.showTeamProfile()
          return
        }
        if (that.data.selectedScene === 'event') {
          that.showEventProfile()
          return
        }
        that.loadTrainingState()
      },
      fail: function() { that.showError('网络异常，暂未保存你的选择') },
      complete: function() {
        if (that.data.isSceneStep) that.setData({ isSubmitting: false, primaryText: '下一步' })
      }
    })
  },

  showTeamProfile: function() {
    this.setData({
      pageTitle: this.data.isTournamentSignupFlow ? '填写球队资料' : '创建球队',
      isSceneStep: false,
      isTeamProfileStep: true,
      isTeamSuccessStep: false,
      isEventProfileStep: false,
      isEventSuccessStep: false,
      isTrainingServiceStep: false,
      isTrainingProfileStep: false,
      isTrainingSuccessStep: false,
      isTrainingDemoStep: false,
      showSteps: true,
      stepOneClass: 'is-complete',
      stepTwoClass: 'is-current',
      stepThreeClass: '',
      primaryText: this.data.isTournamentSignupFlow ? '保存球队并继续报名' : (this.data.isTeamDraftConfirmation ? '确认创建球队' : '创建并继续'),
      isSubmitting: false,
      errorVisible: false,
      errorText: ''
    })
  },

  showEventProfile: function() {
    this.setData({ pageTitle: '创建赛事', isSceneStep: false, isTeamProfileStep: false, isTeamSuccessStep: false, isEventProfileStep: true, isEventSuccessStep: false, isTrainingServiceStep: false, isTrainingProfileStep: false, isTrainingSuccessStep: false, isTrainingDemoStep: false, showSteps: true, stepOneClass: 'is-complete', stepTwoClass: 'is-current', stepThreeClass: '', primaryText: '创建并继续', isSubmitting: false, errorVisible: false, errorText: '' })
  },
  onEventNameInput: function(event) { this.setData({ eventName: String(event.detail.value || '').trim(), errorVisible: false }) },
  onEventCityInput: function(event) { this.setData({ eventCity: String(event.detail.value || '').trim(), errorVisible: false }) },

  loadTrainingState: function() {
    var that = this
    this.setData({ isSubmitting: true, errorVisible: false })
    wx.cloud.callFunction({
      name: 'onboardingWorkspace',
      data: { action: 'state' },
      success: function(response) {
        var result = response.result || {}
        if (!result.success) {
          that.showError(result.message || '青训开户状态暂时无法读取')
          return
        }
        that.showTrainingService(result.training || {})
      },
      fail: function() { that.showError('网络异常，暂时无法读取青训开户状态') },
      complete: function() { that.setData({ isSubmitting: false }) }
    })
  },

  showTrainingService: function(training) {
    var status = String(training.status || 'inactive')
    var canCreate = !!training.hasBackendProvision && ['active', 'enabled', 'paid', 'trial'].indexOf(status) >= 0
    this.setData({
      pageTitle: '青训教务',
      isSceneStep: false,
      isTeamProfileStep: false,
      isTeamSuccessStep: false,
      isEventProfileStep: false,
      isEventSuccessStep: false,
      isTrainingServiceStep: true,
      isTrainingProfileStep: false,
      isTrainingSuccessStep: false,
      isTrainingDemoStep: false,
      showSteps: false,
      trainingStatus: status,
      trainingStatusText: canCreate ? '已完成开户' : '尚未开户',
      trainingStatusClass: canCreate ? 'service-status-active' : 'service-status-inactive',
      trainingCanCreate: canCreate,
      consultationText: '联系客户咨询',
      errorVisible: false,
      errorText: ''
    })
  },

  backToSceneSelection: function() {
    this.setData({
      pageTitle: '开始使用赛小蜂',
      isSceneStep: true,
      isTeamProfileStep: false,
      isTeamSuccessStep: false,
      isEventProfileStep: false,
      isEventSuccessStep: false,
      isTrainingServiceStep: false,
      isTrainingProfileStep: false,
      isTrainingSuccessStep: false,
      isTrainingDemoStep: false,
      showSteps: true,
      stepOneClass: 'is-current',
      stepTwoClass: '',
      stepThreeClass: '',
      primaryText: '下一步',
      isSubmitting: false,
      errorVisible: false,
      errorText: ''
    })
  },

  refreshTrainingStatus: function() {
    this.loadTrainingState()
  },

  requestTrainingConsultation: function() {
    var that = this
    if (this.data.isSubmitting) return
    this.setData({ isSubmitting: true, consultationText: '正在提交…', errorVisible: false })
    wx.cloud.callFunction({
      name: 'onboardingWorkspace',
      data: { action: 'createTrainingConsultation' },
      success: function(response) {
        var result = response.result || {}
        if (!result.success) {
          that.showError(result.message || '咨询请求提交失败，请稍后重试')
          return
        }
        that.setData({ consultationText: result.duplicate ? '咨询请求处理中' : '已提交咨询请求' })
        wx.showToast({ title: result.duplicate ? '请求处理中' : '已提交咨询', icon: 'success' })
      },
      fail: function() { that.showError('网络异常，咨询请求未提交') },
      complete: function() { that.setData({ isSubmitting: false }) }
    })
  },

  showTrainingProfile: function() {
    if (!this.data.trainingCanCreate) {
      this.showError('当前机构尚未完成有效开户，无法创建青训空间')
      return
    }
    this.setData({
      pageTitle: '创建青训机构',
      isSceneStep: false,
      isTeamProfileStep: false,
      isTeamSuccessStep: false,
      isEventProfileStep: false,
      isEventSuccessStep: false,
      isTrainingServiceStep: false,
      isTrainingProfileStep: true,
      isTrainingSuccessStep: false,
      isTrainingDemoStep: false,
      showSteps: true,
      stepOneClass: 'is-complete',
      stepTwoClass: 'is-current',
      stepThreeClass: '',
      primaryText: '创建并继续',
      errorVisible: false,
      errorText: ''
    })
  },

  onTrainingOrgNameInput: function(event) {
    this.setData({ trainingOrgName: String(event.detail.value || '').trim(), errorVisible: false, errorText: '' })
  },

  createTrainingWorkspace: function() {
    var that = this
    if (this.data.trainingOrgName.length < 2) {
      this.showError('请输入 2–50 个字的机构名称')
      return
    }
    if (this.data.isSubmitting) return
    this.setData({ isSubmitting: true, primaryText: '正在创建…', errorVisible: false })
    wx.cloud.callFunction({
      name: 'onboardingWorkspace',
      data: {
        action: 'createTrainingWorkspace',
        name: this.data.trainingOrgName,
        originalLogo: this.data.originalLogo,
        transparentLogo: this.data.transparentLogo
      },
      success: function(response) {
        var result = response.result || {}
        if (!result.success || !result.organization) {
          that.showError(result.message || '青训机构创建失败，请重试')
          return
        }
        that.showTrainingSuccess(result.organization, result.workspaceId)
      },
      fail: function() { that.showError('网络异常，青训机构暂未创建') },
      complete: function() {
        if (that.data.isTrainingProfileStep) that.setData({ isSubmitting: false, primaryText: '创建并继续' })
      }
    })
  },

  showTrainingSuccess: function(organization, workspaceId) {
    this.setData({
      pageTitle: '创建完成',
      isSceneStep: false,
      isTeamProfileStep: false,
      isTeamSuccessStep: false,
      isEventProfileStep: false,
      isEventSuccessStep: false,
      isTrainingServiceStep: false,
      isTrainingProfileStep: false,
      isTrainingSuccessStep: true,
      isTrainingDemoStep: false,
      showSteps: true,
      stepOneClass: 'is-complete',
      stepTwoClass: 'is-complete',
      stepThreeClass: 'is-current',
      createdTraining: { id: organization.id, workspaceId: workspaceId },
      createdTrainingName: organization.name,
      createdTrainingLogo: organization.logo || '',
      hasCreatedTrainingLogo: Boolean(organization.logo),
      successSubtitle: '你的青训工作空间已准备好',
      primaryText: '进入青训首页'
    })
  },

  enterTrainingHome: function() {
    var training = this.data.createdTraining || {}
    if (!training.workspaceId) return this.showError('工作空间信息缺失，请返回后重试')
    var that = this
    this.setData({ isSubmitting: true, primaryText: '正在进入…' })
    workspace.switchWorkspace(training.workspaceId).then(function() {
      wx.navigateTo({ url: '/pages/training/index' })
    }).catch(function() {
      that.showError('机构已创建，但工作空间加载失败，请在“我的”中重试')
    }).finally(function() {
      that.setData({ isSubmitting: false, primaryText: '进入青训首页' })
    })
  },

  showTrainingDemo: function() {
    this.setData({
      pageTitle: '青训功能演示',
      isSceneStep: false,
      isTeamProfileStep: false,
      isTeamSuccessStep: false,
      isEventProfileStep: false,
      isEventSuccessStep: false,
      isTrainingServiceStep: false,
      isTrainingProfileStep: false,
      isTrainingSuccessStep: false,
      isTrainingDemoStep: true,
      showSteps: false,
      errorVisible: false,
      errorText: ''
    })
  },

  returnTrainingService: function() {
    this.loadTrainingState()
  },

  onTeamNameInput: function(event) {
    this.setData({ teamName: String(event.detail.value || '').trim(), errorVisible: false, errorText: '' })
  },

  chooseCrest: function() {
    var that = this
    if (this.data.crestBusy) return
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function(result) {
        var filePath = (result.tempFilePaths || [])[0]
        if (!filePath) return
        that.setData({
          tempCrestPath: filePath,
          cropVisible: true,
          cropScale: 1,
          cropOffsetX: 0,
          cropOffsetY: 0,
          crestTransform: 'translate(0px, 0px) scale(1)'
        })
      }
    })
  },

  onCropScaleChange: function(event) {
    var scale = Number(event.detail.value || 100) / 100
    this.setData({ cropScale: scale, crestTransform: 'translate(' + this.data.cropOffsetX + 'px, ' + this.data.cropOffsetY + 'px) scale(' + scale + ')' })
  },

  onCropTouchStart: function(event) {
    var touch = (event.touches || [])[0] || {}
    this.setData({ cropTouchX: touch.clientX || 0, cropTouchY: touch.clientY || 0 })
  },

  onCropTouchMove: function(event) {
    var touch = (event.touches || [])[0] || {}
    var nextX = touch.clientX || 0
    var nextY = touch.clientY || 0
    var offsetX = this.data.cropOffsetX + nextX - this.data.cropTouchX
    var offsetY = this.data.cropOffsetY + nextY - this.data.cropTouchY
    var limit = 96 * this.data.cropScale
    offsetX = Math.max(-limit, Math.min(limit, offsetX))
    offsetY = Math.max(-limit, Math.min(limit, offsetY))
    this.setData({
      cropTouchX: nextX,
      cropTouchY: nextY,
      cropOffsetX: offsetX,
      cropOffsetY: offsetY,
      crestTransform: 'translate(' + offsetX + 'px, ' + offsetY + 'px) scale(' + this.data.cropScale + ')'
    })
  },

  closeCrop: function() {
    this.setData({ cropVisible: false, tempCrestPath: '' })
  },

  confirmCrop: function() {
    var that = this
    var source = this.data.tempCrestPath
    if (!source) return
    this.setData({ crestBusy: true, cropVisible: false, crestStateText: '正在裁剪并去背景…' })
    // 裁剪与去背景由 utils/logo-cutout 统一完成，和 PC 端、其他小程序入口同一套规则
    logoCutout.process({ owner: this, canvasId: 'crestCropCanvas', filePath: source, crop: { scale: this.data.cropScale, offsetX: this.data.cropOffsetX, offsetY: this.data.cropOffsetY } }).catch(function() {
      // 旧基础库没有 Canvas 2D 或取像素失败时退回原图直传，至少保证能提交队徽
      return { path: source, cutoutPath: '', cutout: false }
    }).then(function(crest) {
      return logoCutout.uploadCrest({ path: crest.path, cutoutPath: crest.cutoutPath, requestId: String(Date.now()) }).then(function(uploaded) {
        return { crest: crest, uploaded: uploaded }
      })
    }).then(function(result) {
      var hasCutout = Boolean(result.uploaded.transparentLogo)
      that.setData({
        crestPreview: result.crest.cutoutPath || result.crest.path,
        originalLogo: result.uploaded.originalLogo,
        transparentLogo: result.uploaded.transparentLogo,
        crestBusy: false,
        crestStateText: hasCutout ? '已完成裁剪与去背景' : '裁剪完成；未识别出背景，将保留原图'
      })
    }).catch(function(error) {
      that.setData({ crestBusy: false, crestStateText: error.message || '队徽处理失败，请重新选择' })
    })
  },
  createTeam: function() {
    var that = this
    var name = String(this.data.teamName || '').trim()
    if (name.length < 2) {
      this.showError('请输入 2—30 个字的球队名称')
      return
    }
    if (this.data.isSubmitting) return
    if (this.data.crestBusy) {
      wx.showToast({ title: '队徽正在处理，请稍候', icon: 'none' })
      return
    }
    this.setData({ isSubmitting: true, primaryText: '正在创建…', errorVisible: false })
    wx.cloud.callFunction({
      name: 'onboardingWorkspace',
      data: { action: 'createTeam', name: name, shortName: this.data.teamShortName, division: this.data.teamDivision, city: this.data.teamCity, originalLogo: this.data.originalLogo, transparentLogo: this.data.transparentLogo, tournamentInviteId: this.data.tournamentInviteId },
      success: function(response) {
        var result = response.result || {}
        if (!result.success || !result.team) {
          that.showError(result.message || '球队创建失败，请重试')
          return
        }
        that.cacheCreatedTeam(result.team)
        if (that.data.isTournamentSignupFlow && that.data.teamOnboardingReturnUrl) {
          wx.removeStorageSync('teamOnboardingReturnUrl')
          wx.redirectTo({
            url: that.data.teamOnboardingReturnUrl,
            fail: function() {
              that.showTeamSuccess(result.team, result.registration)
              that.showError('球队已创建，请点击下方按钮继续报名')
            }
          })
          return
        }
        that.showTeamSuccess(result.team, result.registration)
      },
      fail: function() { that.showError('网络异常，球队暂未创建') },
      complete: function() {
        if (that.data.isTeamProfileStep) that.setData({ isSubmitting: false, primaryText: that.data.isTournamentSignupFlow ? '保存球队并继续报名' : (that.data.isTeamDraftConfirmation ? '确认创建球队' : '创建并继续') })
      }
    })
  },

  showTeamSuccess: function(team, registration) {
    this.setData({
      pageTitle: '创建完成',
      isSceneStep: false,
      isTeamProfileStep: false,
      isTeamSuccessStep: true,
      stepOneClass: 'is-complete',
      stepTwoClass: 'is-complete',
      stepThreeClass: 'is-current',
      createdTeam: team,
      createdTeamName: team.name,
      createdTeamLogo: team.logo || '',
      hasCreatedTeamLogo: Boolean(team.logo),
      teamSuccessForTournament: Boolean(registration),
      selfJoinText: '把我的球员档案加入本队',
      selfJoinClass: '',
      selfJoinDisabled: false,
      successSubtitle: this.data.isTournamentSignupFlow ? '球队资料已保存，请继续选择组别并确认报名' : (registration ? '球队已创建，并已建立本届赛事参赛关系' : '你的球队工作空间已准备好'),
      primaryText: this.data.isTournamentSignupFlow ? '继续完成报名' : '进入球队首页'
    })
  },

  inviteTeamPlayers: function() {
    var team = this.data.createdTeam || {}
    if (!team.id) return this.showError('球队信息缺失，请返回后重试')
    if (this.data.isSubmitting) return
    this.cacheCreatedTeam(team)
    wx.navigateTo({
      url: '/pages/team/player-invite/player-invite?teamId=' + encodeURIComponent(team.id),
      fail: () => this.showError('邀请页面暂时无法打开，请重试')
    })
  },

  joinSelfTeam: function() {
    var that = this
    var team = this.data.createdTeam || {}
    if (!team.id) return this.showError('球队信息缺失，请返回后重试')
    if (this.data.selfJoinDisabled) return
    this.cacheCreatedTeam(team)
    this.setData({ selfJoinDisabled: true, selfJoinText: '正在加入…' })
    var payload = { action: 'selfPlayerJoinTeam', teamId: team.id, workspaceId: 'team:' + team.id }
    if (this.data.selfJoinPlayerId) payload.playerId = this.data.selfJoinPlayerId
    wx.cloud.callFunction({ name: 'getMiniWorkspace', data: payload }).then(function(response) {
      var result = (response && response.result) || {}
      if (!result.success) {
        that.setData({ selfJoinDisabled: false, selfJoinText: result.message || '暂未加入，可在球员库中重试' })
        return
      }
      that.setData({ selfJoinDisabled: true, selfJoinClass: 'is-joined', selfJoinText: result.alreadyJoined ? '你已在本队球员库中' : '已加入本队球员库' })
    }).catch(function() {
      that.setData({ selfJoinDisabled: false, selfJoinText: '网络异常，请重试' })
    })
  },

  cacheCreatedTeam: function(team) {
    team = team || {}
    if (!team.id) return
    var userId = wx.getStorageSync('userId') || ''
    var openId = wx.getStorageSync('openId') || ''
    var cachedTeam = {
      _id: team.id,
      teamId: team.id,
      name: team.name || '',
      teamName: team.name || '',
      logo: team.logo || '',
      teamLogo: team.logo || '',
      creatorId: userId,
      ownerId: userId,
      userId: userId,
      openId: openId
    }
    workspace.selectWorkspace('team:' + team.id)
    wx.setStorageSync('currentTeamId', team.id)
    wx.setStorageSync('teamInfo', cachedTeam)
    wx.setStorageSync('currentTeam', cachedTeam)
    wx.setStorageSync('myTeams', [cachedTeam])
    wx.setStorageSync('currentTeamIndex', 0)
  },

  createEventSpace: function() {
    var that = this
    if (this.data.eventName.length < 2) return this.showError('请输入 2—50 个字的赛事名称')
    if (!this.data.eventCity) return this.showError('请输入举办城市')
    if (this.data.isSubmitting || this.data.crestBusy) return
    this.setData({ isSubmitting: true, primaryText: '正在创建…', errorVisible: false })
    wx.cloud.callFunction({ name: 'onboardingWorkspace', data: { action: 'createEventSpace', name: this.data.eventName, city: this.data.eventCity, originalLogo: this.data.originalLogo, transparentLogo: this.data.transparentLogo }, success: function(response) { var result = response.result || {}; if (!result.success || !result.tournament) { that.showError(result.message || '赛事空间创建失败，请重试'); return }; that.showEventSuccess(result.tournament) }, fail: function() { that.showError('网络异常，赛事空间暂未创建') }, complete: function() { if (that.data.isEventProfileStep) that.setData({ isSubmitting: false, primaryText: '创建并继续' }) } })
  },
  showEventSuccess: function(tournament) {
    this.setData({ pageTitle: '创建完成', isSceneStep: false, isTeamProfileStep: false, isTeamSuccessStep: false, isEventProfileStep: false, isEventSuccessStep: true, stepOneClass: 'is-complete', stepTwoClass: 'is-complete', stepThreeClass: 'is-current', createdEvent: tournament, createdEventName: tournament.name, createdEventLogo: tournament.logo || '', hasCreatedEventLogo: Boolean(tournament.logo), successSubtitle: '你的赛事工作空间已准备好', primaryText: '进入赛事空间' })
  },
  enterEventSpace: function() { var tournament = this.data.createdEvent || {}; if (!tournament.id) return this.showError('赛事信息缺失，请返回后重试'); wx.navigateTo({ url: '/pages/tournament/detail/detail?tournamentId=' + tournament.id }) },

  copyEventPcLink: function() {
    wx.setClipboardData({
      data: 'https://www.sxffootball.cn/admin/',
      success: function() { wx.showToast({ title: '网址已复制', icon: 'success' }) }
    })
  },

  openTutorial: function() {
    wx.navigateTo({ url: '/pages/common/official-webview?url=' + encodeURIComponent('https://www.sxffootball.cn/admin/tutorials') })
  },

  enterTeamHome: function() {
    var team = this.data.createdTeam || {}
    if (!team.id) return this.showError('球队信息缺失，请返回后重试')
    if (this.data.isSubmitting) return
    if (this.data.isTournamentSignupFlow && this.data.teamOnboardingReturnUrl) {
      this.setData({ isSubmitting: true, primaryText: '正在进入报名…' })
      wx.redirectTo({
        url: this.data.teamOnboardingReturnUrl,
        fail: () => this.showError('报名页面暂时无法打开，请重试')
      })
      return
    }
    var that = this
    this.setData({ isSubmitting: true, primaryText: '正在进入…' })
    this.cacheCreatedTeam(team)
    wx.reLaunch({
      url: '/pages/teams/index',
      fail: function() {
        that.showError('球队首页暂时无法打开，请重试')
      },
      complete: function(result) {
        if (result && result.errMsg && result.errMsg.indexOf(':ok') >= 0) return
        that.setData({ isSubmitting: false, primaryText: '进入球队首页' })
      }
    })
  },

  showError: function(message) {
    this.setData({ isSubmitting: false, errorVisible: true, errorText: message || '操作失败，请重试' })
  }
})
