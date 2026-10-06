// 赛事报名页
var workspace = require('../../../utils/workspace')
var signupDraft = require('../../../utils/signup-draft')

async function loadAllTournamentTeams(db, tournamentId) {
  var rows = []
  for (var offset = 0; offset < 2000; offset += 20) {
    var page = await db.collection('tournament_teams').where({ tournamentId: tournamentId }).skip(offset).limit(20).get()
    var data = page.data || []
    rows = rows.concat(data)
    if (data.length < 20) break
  }
  return rows
}

function divisionCapacity(division, tournament) {
  var candidates = [division && division.expectedTeams, division && division.requiredTeams, division && division.teamRequirement, division && division.participantTeams, division && division.maxTeams, division && division.teamLimit, tournament && tournament.maxTeams]
  for (var index = 0; index < candidates.length; index += 1) {
    var value = Number(candidates[index])
    if (isFinite(value) && value > 0) return value
  }
  return 0
}

Page({


  data: {
    tournamentId: '',
    inviteKey: '',
    inviteType: 'public_registration',
    intendedTeamName: '',
    inviteDivisions: [],
    miniSubscribeTemplateId: '',
    miniSubscriptionAccepted: false,
    serviceFollowGateId: '',
    serviceFollowUrl: '',
    serviceBindingConfigured: false,
    serviceBindingStatus: 'unbound',
    serviceBindingStatusText: '尚未准备绑定',
    serviceBindingButtonText: '准备/刷新绑定',
    serviceBindingReady: false,
    showServiceFollowQr: false,
    showServiceFollowModal: false,
    serviceBindingPreparing: false,
    serviceBindingRefreshing: false,
    divisionOptions: [],
    showDivisionTabs: false,
    activeDivisionId: 'default',
    activeDivisionName: '默认组',
    activeDivisionSelectable: false,
    noSelectableDivision: false,
    requestedTeamId: '',
    fromShare: false,
    tournament: null,
    team: null,
    loading: true,
    submitting: false,
    regulationsRead: false,
    disclaimerAgreed: false,
    regulationsCheckboxClass: '',
    regulationsTextClass: '',
    disclaimerCheckboxClass: '',
    disclaimerTextClass: '',
    canSubmit: false,
    submitDisabled: true,
    submitButtonClass: 'disabled',
    submitBtnText: '请同意免责声明',
    showFullDisclaimer: false,
    defaultDisclaimer: '参赛免责声明书\n\n本人（以下简称"参赛者"）已充分了解参加本次赛事的风险，现就参赛相关事宜作出如下声明与承诺：\n\n第1条  风险知晓\n本人完全知晓足球运动具有较高的身体对抗性和受伤风险，包括但不限于扭伤、拉伤、骨折、关节脱位、韧带撕裂、皮肤擦伤及因剧烈运动可能引发的心脑血管意外等。本人对上述风险已有充分认识，并自愿承担参加本次赛事可能带来的一切身体风险。\n\n第2条  健康状况\n本人确认身体健康状况良好，适合参加足球竞技运动。本人已在三级甲等医院进行体检，体检结果证明本人身体健康，不存在心脏病、高血压、癫痫、严重颈椎/腰椎疾病以及其他不适宜剧烈运动的疾病或隐患。如因本人隐瞒病史、健康状况不佳或服用违禁药物导致在赛事中发生任何身体损害，后果由本人自行承担。\n\n第3条  保险责任\n本人已购买赛事期间有效的人身意外伤害保险。本人确认保险合同真实有效，并同意将保险凭证复印件作为报名材料一并提交组委会。赛事期间因意外受伤产生的医疗费用，由本人通过保险渠道进行理赔，主办方不承担相关费用。\n\n第4条  安全义务\n本人在赛事期间承诺遵守以下安全义务：\n（一）严格遵守赛事规程、竞赛规则及组委会各项通知和规定；\n（二）服从裁判员、比赛监督及现场工作人员的管理和指挥；\n（三）使用符合标准的运动装备参赛，包括但不限于佩戴护腿板、穿着非金属底足球鞋；\n（四）比赛前进行充分热身，赛后进行适当放松恢复；\n（五）如感身体不适或出现伤病征兆，主动停止比赛并及时向队医或赛事医疗保障人员报告；\n（六）不酒后参赛，不使用任何违禁药物或兴奋剂。\n\n第5条  免责条款\n本人在此不可撤销地声明：赛事期间（包括但不限于比赛、训练、往返赛场途中及赛事相关活动期间），如因本人自身身体原因、个人过失、违规操作或不可预见因素导致本人受到人身伤害或财产损失，本人自愿承担全部责任。\n本人同时放弃对以下单位和个人的追偿权利，并承诺不以任何理由向其主张赔偿或提起诉讼：\n（一）赛事主办方；（二）赛事承办单位、协办单位及运营单位；（三）赛事赞助单位；（四）赛事组委会及其工作人员；（五）比赛监督、裁判员及其他竞赛官员；（六）比赛场馆及场地提供方；（七）其他参赛队伍及运动员；（八）赛事期间提供医疗服务的医疗机构及其医护人员。\n\n第6条  赛风赛纪\n本人承诺在赛事期间遵守赛风赛纪，文明参赛，尊重裁判、尊重对手、尊重观众。本人不会发生以下行为，如有违反，愿意接受赛事组委会依据规程及相关纪律准则作出的任何处罚：\n（一）推搡、谩骂、殴打裁判员、比赛监督或对方球员；（二）打架斗殴、恶意犯规、报复性伤害；（三）冒名顶替、弄虚作假、伪造身份参赛；（四）罢赛、弃权、中途退赛；（五）其他违反竞赛规程和体育道德的行为。\n\n第7条  肖像权及宣传\n本人同意赛事主办方及媒体在赛事期间对本人进行拍摄、录像及采访，并授权主办方将本人的肖像、姓名及参赛相关信息用于赛事宣传、报道、网络发布等非商业用途，且无需向本人支付报酬。\n\n第8条  平台免责\n本人知悉并同意：本次赛事报名及信息管理服务由"54足球赛事管理系统"（以下简称"赛事平台"）提供，赛事平台仅为本次赛事提供信息技术服务支持，不属于赛事主办方、承办方或组织者。\n就赛事平台服务，本人特此确认并同意：\n（一）赛事平台仅作为信息展示与报名工具，不承担赛事组织、安全保障、医疗救护、现场管理等任何赛事执行责任；\n（二）因网络延迟、系统故障、数据错误、黑客攻击、服务器宕机等信息技术原因导致报名失败、信息丢失或赛事信息错误的，赛事平台不承担任何赔偿责任；\n（三）本人在赛事平台填写、上传的所有个人信息（包括但不限于姓名、身份证号、体检证明、保险凭证等），由本人保证其真实性、合法性，赛事平台不对上述信息的真实性进行审核或承担任何责任；\n（四）赛事平台对赛事期间发生的任何人身伤害、财产损失及其他意外事件不承担任何赔偿或连带责任；\n（五）本人同意赛事平台将本人填写的报名信息及本免责声明内容用于赛事报名审核、身份核验及赛事组织相关的必要用途，平台承诺对本人个人信息予以保密，除法律法规要求外不向第三方泄露；\n（六）本人通过赛事平台完成线上签署的，即视为本人已认真阅读并完全理解本免责声明全部条款，线上签署与纸质签字具有同等法律效力。\n\n第9条  法律效力\n（一）本声明书自本人签字（或线上确认）之日起生效，效力覆盖本人参加本次赛事的全部期间及赛事相关活动。\n（二）本人已认真阅读本声明书全部内容，理解并同意其中所有条款的含义及法律后果。本人签字（或线上确认）即表示完全自愿接受本声明书各项条款的约束。\n（三）本声明书一式两份，本人留存一份，组委会备案一份，两份具有同等法律效力。\n（四）本声明书的解释和争议解决适用中华人民共和国法律。\n\n—— 线上签署说明 ——\n本免责声明在"54足球赛事管理系统"平台以线上方式签署。参赛者在平台报名流程中勾选"已阅读并同意免责声明"并完成提交，即视为已完成有效签署，与纸质签字具有同等法律效力。'
  },

  onLoad(options) {
    // 支持直接传参和扫码场景参数
    let tournamentId = options.id
    let inviteKey = options.inviteKey || ''
    if (options.scene) {
      const sceneStr = decodeURIComponent(options.scene)
      if (sceneStr.indexOf('i=') === 0) {
        inviteKey = sceneStr.slice(2)
      } else if (sceneStr.includes('id=')) {
        tournamentId = sceneStr.split('id=')[1]
      } else {
        tournamentId = sceneStr
      }
    }
    if (inviteKey) {
      this.setData({ inviteKey, requestedTeamId: (options && options.teamId) || '', activeDivisionId: (options && options.divisionId) || 'default' })
      this.loadInvitation()
    } else if (tournamentId) {
      this.setData({ tournamentId, requestedTeamId: (options && options.teamId) || '', activeDivisionId: (options && options.divisionId) || 'default', fromShare: options && options.from === 'share' })
      this.loadData()
    }
  },

  onShow() {
    if (this.data.serviceFollowGateId || this.data.serviceBindingStatus === 'waiting') {
      this.refreshServiceBinding({ silent: true })
    }
  },

  async loadInvitation() {
    this.setData({ loading: true })
    try {
      const response = await wx.cloud.callFunction({ name: 'tournamentRegistrationFlow', timeout: 15000, data: { action: 'getInvitation', inviteKey: this.data.inviteKey } })
      const result = response.result || {}
      if (!result.success) throw new Error(result.message || '报名邀请无效')
      const data = result.data || {}
      const selectedDivisionId = this.data.activeDivisionId !== 'default' ? this.data.activeDivisionId : (data.defaultDivisionId || 'default')
      this.setData({ tournamentId: data.tournamentId, activeDivisionId:selectedDivisionId, inviteDivisions: data.divisions || [], inviteType:data.inviteType || 'public_registration', intendedTeamName:data.intendedTeamName || '', miniSubscribeTemplateId: data.miniSubscribeTemplateId || '', serviceBindingConfigured: data.serviceBindingConfigured === true })
      this.loadData()
    } catch (error) {
      wx.showModal({ title: '无法进入报名', content: error.message || '报名邀请无效', showCancel: false, success: () => wx.navigateBack() })
      this.setData({ loading: false })
    }
  },

  // 加载数据
  async loadData() {
    this.setData({ loading: true })

    try {
      const db = wx.cloud.database()

      // 获取赛事信息
      const tournamentRes = await db.collection('tournaments')
        .doc(this.data.tournamentId)
        .get()

      if (!tournamentRes.data) {
        this.setData({ loading: false })
        wx.showToast({
          title: '赛事不存在',
          icon: 'none'
        })
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }

      const rawTournament = tournamentRes.data
      let storedDivisions = []
      if (!this.data.inviteDivisions.length) {
        try {
          const divisionRes = await db.collection('divisions').where({ tournamentId: this.data.tournamentId }).limit(100).get()
          storedDivisions = divisionRes.data || []
        } catch (divisionError) {
          console.warn('[signup] 当前组别状态读取失败，使用赛事内嵌组别:', divisionError)
        }
      }
      const divisions = this.data.inviteDivisions.length
        ? this.data.inviteDivisions
        : storedDivisions.length
          ? storedDivisions
          : Array.isArray(rawTournament.divisions) && rawTournament.divisions.length
            ? rawTournament.divisions
            : [{ id: 'default', name: '默认组', maxTeams: rawTournament.maxTeams, maxPlayersPerTeam: rawTournament.maxPlayersPerTeam || rawTournament.maxPlayers }]
      const divisionsFromInvitation = this.data.inviteDivisions.length > 0
      const allSignupRows = divisionsFromInvitation ? [] : await loadAllTournamentTeams(db, this.data.tournamentId)
      const capacityCounts = allSignupRows.reduce((counts, item) => {
        const status = String(item.status || '').toLowerCase()
        if (status !== 'approved' && status !== 'invited') return counts
        const divisionId = String(item.divisionId || item.division || 'default')
        counts[divisionId] = Number(counts[divisionId] || 0) + 1
        return counts
      }, {})
      const tournamentStatus = String(rawTournament.status || '').toLowerCase()
      const displayDivisions = divisions.map((item, order) => {
        const id = String(item.id || item._id || item.divisionId || 'default')
        const maxTeams = divisionCapacity(item, rawTournament)
        const registeredTeams = divisionsFromInvitation
          ? Number(item.registeredTeams || 0)
          : Number(capacityCounts[id] || item.registeredTeams || 0)
        const registrationOpen = typeof item.registrationOpen === 'boolean'
          ? item.registrationOpen
          : divisionsFromInvitation && typeof item.registrationEnabled !== 'boolean'
            ? true
            : rawTournament.registrationEnabled !== false && item.registrationEnabled === true && (tournamentStatus === 'registering' || tournamentStatus === 'upcoming')
        const allowedByInvite = item.allowedByInvite !== false
        const isFull = maxTeams > 0 && registeredTeams >= maxTeams
        const selectable = allowedByInvite && registrationOpen && !isFull
        let statusText = ''
        if (!allowedByInvite) statusText = '非本次邀请'
        else if (isFull) statusText = '已满'
        else if (!registrationOpen) statusText = '已关闭'
        return {
          ...item,
          id,
          name: item.name || item.divisionName || '未命名组别',
          maxTeams,
          registeredTeams,
          registrationOpen,
          allowedByInvite,
          isFull,
          selectable,
          disabled: !selectable,
          statusText,
          order
        }
      }).sort((a, b) => Number(b.selectable) - Number(a.selectable) || a.order - b.order)
      const preferred = this.data.activeDivisionId !== 'default' ? this.data.activeDivisionId : (rawTournament.defaultDivisionId || '')
      const preferredDivision = displayDivisions.find(item => item.id === preferred)
      const firstSelectable = displayDivisions.find(item => item.selectable)
      const activeDivision = preferredDivision && preferredDivision.selectable
        ? preferredDivision
        : firstSelectable || preferredDivision || displayDivisions[0]
      if (!activeDivision) throw new Error('当前赛事尚未配置竞赛组别')
      displayDivisions.forEach(item => {
        item.tabClass = item.id === activeDivision.id
          ? (item.selectable ? 'active' : 'disabled')
          : (item.selectable ? 'available' : 'disabled')
      })
      const tournament = this.formatTournament({
        ...rawTournament,
        maxTeams: Number(activeDivision.maxTeams || rawTournament.maxTeams || 0),
        maxPlayers: Number(activeDivision.maxPlayersPerTeam || rawTournament.maxPlayersPerTeam || rawTournament.maxPlayers || 0),
        registeredTeams: Number(activeDivision.registeredTeams || 0)
      })
      this.setData({
        divisionOptions: displayDivisions,
        showDivisionTabs: displayDivisions.length > 0,
        activeDivisionId: activeDivision.id,
        activeDivisionName: activeDivision.name,
        activeDivisionSelectable: activeDivision.selectable === true,
        noSelectableDivision: !firstSelectable
      })

      // 分享进入时先按当前登录账号自动识别球队，避免本地缓存为空时误判
      const team = await this.resolveSignupTeam(db)
      if (!team) return
      const teamId = team._id || team.teamId || ''

      // 预计算用于 WXML 显示的字段
      const teamName = team.name || team.teamName || '未知球队'
      const teamLogoUrl = team.logo || team.teamLogo || team.logoUrl || ''
      const teamFirstChar = teamName.charAt(0)
      const teamCity = team.city || ''
      const teamPlayerCount = team.playerCount || 0

      // 检查是否已报名
      if (teamId) {
        const signupRes = await db.collection('tournament_teams')
          .where({
            tournamentId: this.data.tournamentId,
            teamId: teamId
          })
          .get()

        const existingRegistration = (signupRes.data || []).find(item => {
          const status = String(item.status || '').toLowerCase()
          const inactive = ['cancelled', 'withdrawn', 'rejected', 'replaced'].indexOf(status) >= 0
          return !inactive && (item.divisionId || 'default') === this.data.activeDivisionId
        })
        if (existingRegistration) {
          signupDraft.clear()
          wx.cloud.callFunction({ name: 'tournamentRegistrationFlow', data: { action: 'completeRegistrationDraft', tournamentId: this.data.tournamentId, teamId } }).catch(function() {})
          wx.removeStorageSync('loginRedirectUrl')
          wx.removeStorageSync('teamOnboardingReturnUrl')
          this.setData({ loading: false })
          wx.showToast({
            title: '该组别已报名，正在进入报名情况',
            icon: 'none'
          })
          this.openExistingRegistration(teamId, existingRegistration)
          return
        }
      }

      this.setData({
        tournament,
        team,
        teamName,
        teamLogoUrl,
        teamFirstChar,
        teamCity,
        teamPlayerCount,
        loading: false
      }, () => {
        this.updateSubmitStatus()
        this.persistSignupDraft()
        this.prepareServiceBinding({ auto: true })
      })
    } catch (err) {
      console.error('加载数据失败:', err)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
      this.setData({ loading: false })
    }
  },

  openExistingRegistration(teamId, registration) {
    const tournamentId = this.data.tournamentId
    const divisionId = (registration && registration.divisionId) || this.data.activeDivisionId || 'default'
    const detailUrl = '/pages/tournament/detail/detail?id=' + encodeURIComponent(tournamentId) +
      '&teamId=' + encodeURIComponent(teamId) +
      '&divisionId=' + encodeURIComponent(divisionId)
    const participationUrl = '/pages/team/participation/participation?teamId=' + encodeURIComponent(teamId)

    wx.redirectTo({
      url: detailUrl,
      fail: function (error) {
        console.warn('[signup] 已报名详情跳转失败，回退参赛管理:', error)
        wx.redirectTo({
          url: participationUrl,
          fail: function () { wx.switchTab({ url: '/pages/teams/index' }) }
        })
      }
    })
  },

  onDivisionTap(e) {
    const id = e.currentTarget.dataset.id
    const division = this.data.divisionOptions.find(item => item.id === id)
    if (!division || division.disabled) {
      wx.showToast({ title: division && division.statusText ? division.statusText : '该组别暂不可报名', icon: 'none' })
      return
    }
    if (!id || id === this.data.activeDivisionId) return
    this.setData({ activeDivisionId: id, regulationsRead: false, disclaimerAgreed: false, loading: true })
    this.loadData()
  },

  getLoginIdentifiers() {
    const userInfo = wx.getStorageSync('userInfo') || {}
    return {
      phone: wx.getStorageSync('phoneNumber') || userInfo.phoneNumber || userInfo.phone || '',
      openId: wx.getStorageSync('openId') || wx.getStorageSync('openid') || userInfo.openId || userInfo.wechatOpenId || '',
      userId: wx.getStorageSync('userId') || userInfo._id || userInfo.userId || ''
    }
  },

  normalizeTeam(team) {
    if (!team) return null
    return {
      _id: team._id || team.teamId || '',
      teamId: team.teamId || team._id || '',
      name: team.name || team.teamName || '\u672a\u547d\u540d\u7403\u961f',
      teamName: team.teamName || team.name || '\u672a\u547d\u540d\u7403\u961f',
      logo: team.logo || team.logoUrl || team.teamLogo || '',
      teamLogo: team.teamLogo || team.logo || team.logoUrl || '',
      city: team.city || team.cityName || '',
      teamCode: team.teamCode || team._id || team.teamId || '',
      playerCount: team.playerCount || 0,
      ownerPhone: team.ownerPhone || team.creatorPhone || team.phoneNumber || team.phone || team.contactPhone || team.mobile || '',
      creatorPhone: team.creatorPhone || '',
      phoneNumber: team.phoneNumber || team.phone || '',
      phone: team.phone || team.phoneNumber || '',
      contactPhone: team.contactPhone || '',
      mobile: team.mobile || '',
      creatorId: team.creatorId || '',
      ownerId: team.ownerId || '',
      userId: team.userId || '',
      openId: team.openId || '',
      wechatOpenId: team.wechatOpenId || '',
      _openid: team._openid || ''
    }
  },

  teamMatchesCurrentLogin(team, ids) {
    if (!team || !ids) return false
    const phone = ids.phone || ''
    const userId = ids.userId || ''
    const openId = ids.openId || ''
    const phones = [
      team.ownerPhone, team.creatorPhone, team.phoneNumber,
      team.phone, team.contactPhone, team.mobile
    ].filter(Boolean)
    const userIds = [team.creatorId, team.ownerId, team.userId].filter(Boolean)
    const openIds = [team.openId, team.wechatOpenId, team._openid].filter(Boolean)

    if (phone && phones.indexOf(phone) >= 0) return true
    if (userId && userIds.indexOf(userId) >= 0) return true
    if (!phone && !userId && openId && openIds.indexOf(openId) >= 0) return true
    return false
  },

  cacheCurrentTeam(team) {
    const normalized = this.normalizeTeam(team)
    if (!normalized) return null
    wx.setStorageSync('teamInfo', normalized)
    wx.setStorageSync('currentTeamId', normalized._id || normalized.teamId)
    wx.setStorageSync('currentTeam', normalized)
    const teams = wx.getStorageSync('myTeams') || []
    if (!teams || teams.length === 0) {
      wx.setStorageSync('myTeams', [normalized])
      wx.setStorageSync('currentTeamIndex', 0)
    }
    return normalized
  },

  goLoginForSignup() {
    const invitePart = this.data.inviteKey ? '&inviteKey=' + encodeURIComponent(this.data.inviteKey) : ''
    const signupPath = '/pages/tournament/signup/signup?id=' + this.data.tournamentId + '&divisionId=' + encodeURIComponent(this.data.activeDivisionId) + invitePart + '&from=share'
    const redirect = encodeURIComponent(signupPath)
    wx.setStorageSync('loginRedirectUrl', signupPath)
    wx.redirectTo({ url: '/pages/login/login?redirect=' + redirect })
  },

  goCreateTeamForSignup() {
    const invitePart = this.data.inviteKey ? '&inviteKey=' + encodeURIComponent(this.data.inviteKey) : ''
    const signupPath = '/pages/tournament/signup/signup?id=' + this.data.tournamentId + '&divisionId=' + encodeURIComponent(this.data.activeDivisionId) + invitePart + '&from=share'
    wx.setStorageSync('loginRedirectUrl', signupPath)
    wx.setStorageSync('teamOnboardingReturnUrl', signupPath)
    wx.redirectTo({
      url: '/pages/onboarding/onboarding?scene=team&step=team&fromTournamentSignup=1&returnUrl=' + encodeURIComponent(signupPath)
    })
  },

  async resolveSignupTeam(db) {
    const ids = this.getLoginIdentifiers()
    if (!ids.phone && !ids.openId && !ids.userId) {
      this.goLoginForSignup()
      return null
    }

    const cachedTeamId = wx.getStorageSync('currentTeamId') || ''
    const cachedTeamInfo = wx.getStorageSync('teamInfo') || null

    if (this.data.requestedTeamId) {
      try {
        const requested = await db.collection('teams').doc(this.data.requestedTeamId).get()
        if (requested.data && this.teamMatchesCurrentLogin(requested.data, ids)) return this.cacheCurrentTeam(requested.data)
      } catch (error) {
        console.warn('[signup] requested team unavailable:', error)
      }
    }

    if (cachedTeamId) {
      try {
        const teamRes = await db.collection('teams').doc(cachedTeamId).get()
        if (teamRes.data && this.teamMatchesCurrentLogin(teamRes.data, ids)) {
          return this.cacheCurrentTeam(teamRes.data)
        }
      } catch (e) {
        if (cachedTeamInfo && this.teamMatchesCurrentLogin(cachedTeamInfo, ids)) {
          return this.cacheCurrentTeam(cachedTeamInfo)
        }
      }
    }

    if (cachedTeamInfo && this.teamMatchesCurrentLogin(cachedTeamInfo, ids) && (cachedTeamInfo._id || cachedTeamInfo.teamId || cachedTeamInfo.teamName || cachedTeamInfo.name)) {
      return this.cacheCurrentTeam(cachedTeamInfo)
    }

    try {
      const teamRes = await wx.cloud.callFunction({
        name: 'getMyTeams',
        timeout: 15000,
        data: {
          phone: ids.phone,
          userId: ids.userId,
          openId: ids.openId
        }
      })
      const result = teamRes.result || {}
      if (result.success && Array.isArray(result.teams) && result.teams.length > 0) {
        const teams = result.teams.map(t => this.normalizeTeam(t))
        wx.setStorageSync('myTeams', teams)
        const selectedIndex = this.data.requestedTeamId ? teams.findIndex(item => (item._id || item.teamId) === this.data.requestedTeamId) : 0
        const safeIndex = selectedIndex >= 0 ? selectedIndex : 0
        wx.setStorageSync('currentTeamIndex', safeIndex)
        return this.cacheCurrentTeam(teams[safeIndex])
      }
    } catch (err) {
      console.error('[signup] resolve team failed:', err)
    }

    try {
      const phoneConditions = []
      const idConditions = []
      function make(field, value) {
        if (!value) return null
        const item = {}
        item[field] = value
        return item
      }
      ;['ownerPhone', 'creatorPhone', 'phoneNumber', 'phone', 'contactPhone', 'mobile'].forEach(field => {
        const item = make(field, ids.phone)
        if (item) phoneConditions.push(item)
      })
      ;['creatorId', 'ownerId', 'userId'].forEach(field => {
        const item = make(field, ids.userId)
        if (item) idConditions.push(item)
      })
      if (!ids.phone && !ids.userId) {
        ;['openId', 'wechatOpenId', '_openid'].forEach(field => {
          const item = make(field, ids.openId)
          if (item) idConditions.push(item)
        })
      }

      const groups = [phoneConditions, idConditions].filter(group => group.length > 0)
      for (let i = 0; i < groups.length; i++) {
        const conditions = groups[i]
        const where = conditions.length === 1 ? conditions[0] : db.command.or(conditions)
        const directRes = await db.collection('teams').where(where).limit(10).get()
        if (directRes.data && directRes.data.length > 0) {
          const teams = directRes.data.map(t => this.normalizeTeam(t))
          wx.setStorageSync('myTeams', teams)
          wx.setStorageSync('currentTeamIndex', 0)
          return this.cacheCurrentTeam(teams[0])
        }
      }
    } catch (err2) {
      console.error('[signup] fallback team query failed:', err2)
    }

    this.goCreateTeamForSignup()
    return null
  },
  // 格式化赛事数据
  formatTournament(tournament) {
    let dateRange = ''
    if (tournament.startDate) {
      const start = this.formatDate(tournament.startDate)
      if (tournament.endDate) {
        const end = this.formatDate(tournament.endDate)
        dateRange = start + ' - ' + end
      } else {
        dateRange = start
      }
    }

    const rawRules = tournament.rules
    let rulesText = ''
    if (typeof rawRules === 'string') {
      const trimmed = rawRules.trim()
      if (trimmed && trimmed !== '[object Object]') rulesText = trimmed
    } else if (rawRules && typeof rawRules === 'object') {
      const maybeText = rawRules.text || rawRules.content || rawRules.html || rawRules.description || ''
      if (typeof maybeText === 'string' && maybeText.trim()) rulesText = maybeText.trim()
    }

    const rawFileId = tournament.regulationsFileId || tournament.regulationsFile || ''
    const regulationsFileId = typeof rawFileId === 'string' ? rawFileId : ''
    const hasRulesText = !!rulesText
    const hasRegulationsFile = !!regulationsFileId
    const hasRegulations = hasRulesText || hasRegulationsFile

    return {
      ...tournament,
      dateRange,
      rulesText,
      hasRulesText,
      regulationsFileId,
      hasRegulationsFile,
      hasRegulations,
      regulationsRequired: hasRegulations,
      regulationsStatusText: hasRegulations ? '' : '\u672a\u4e0a\u4f20'
    }
  },

  formatDate(dateStr) {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const month = date.getMonth() + 1
    const day = date.getDate()
    return `${month}月${day}日`
  },

  // 更新提交按钮状态
  updateSubmitStatus() {
    const tournament = this.data.tournament
    const needRegulations = tournament && tournament.hasRegulations
    const regulationsOk = needRegulations ? this.data.regulationsRead : true
    const disclaimerOk = this.data.disclaimerAgreed
    const serviceBindingOk = this.data.serviceBindingReady
    const divisionOk = this.data.activeDivisionSelectable === true
    const canSubmit = regulationsOk && disclaimerOk && serviceBindingOk && divisionOk
    let submitBtnText = '确认报名'
    if (!divisionOk) submitBtnText = '当前没有可报名组别'
    else if (needRegulations && !this.data.regulationsRead) submitBtnText = '请先阅读竞赛规程'
    else if (!this.data.disclaimerAgreed) submitBtnText = '请同意免责声明'
    else if (!serviceBindingOk) submitBtnText = '请先关注服务号'
    this.setData({
      canSubmit,
      submitDisabled: !canSubmit,
      submitButtonClass: canSubmit ? '' : 'disabled',
      submitBtnText,
      regulationsCheckboxClass: this.data.regulationsRead ? 'checked' : '',
      regulationsTextClass: this.data.regulationsRead ? 'active' : '',
      disclaimerCheckboxClass: this.data.disclaimerAgreed ? 'checked' : '',
      disclaimerTextClass: this.data.disclaimerAgreed ? 'active' : ''
    })
  },

  // 切换竞赛规程阅读状态
  toggleRegulationsRead() {
    const tournament = this.data.tournament
    // 如果没有规程文件也没有rules内容，不需要勾选
    if (!tournament.hasRegulations) {
      return
    }
    this.setData({
      regulationsRead: !this.data.regulationsRead
    }, () => {
      this.updateSubmitStatus()
    })
  },

  // 切换免责声明同意状态
  toggleDisclaimerAgree() {
    this.setData({
      disclaimerAgreed: !this.data.disclaimerAgreed
    }, () => {
      this.updateSubmitStatus()
    })
  },

  // 查看完整免责声明（全屏）
  viewFullDisclaimer() {
    this.setData({ showFullDisclaimer: true })
  },

  // 关闭免责声明全屏查看
  closeFullDisclaimer() {
    this.setData({ showFullDisclaimer: false })
  },

  // 查看竞赛规程
  viewRegulations() {
    const tournament = this.data.tournament
    if (!tournament.regulationsFileId) return

    wx.cloud.downloadFile({
      fileID: tournament.regulationsFileId,
      success: res => {
        const filePath = res.tempFilePath
        wx.openDocument({
          filePath: filePath,
          fileType: tournament.regulationsFileName ?
            tournament.regulationsFileName.split('.').pop().toLowerCase() : 'docx',
          success: () => {
            console.log('打开文档成功')
          },
          fail: err => {
            console.error('打开文档失败:', err)
            wx.showToast({ title: '打开文档失败', icon: 'none' })
          }
        })
      },
      fail: err => {
        console.error('下载文档失败:', err)
        wx.showToast({ title: '下载文档失败', icon: 'none' })
      }
    })
  },

  // 取消
  onCancel() {
    wx.navigateBack()
  },

  persistSignupDraft() {
    const team = this.data.team || {}
    const tournament = this.data.tournament || {}
    const teamId = team._id || team.teamId || wx.getStorageSync('currentTeamId') || ''
    if (!this.data.tournamentId || !teamId) return
    const draft = signupDraft.save({
      tournamentId: this.data.tournamentId,
      tournamentName: tournament.name || '赛事报名',
      divisionId: this.data.activeDivisionId,
      divisionName: this.data.activeDivisionName,
      inviteKey: this.data.inviteKey,
      teamId,
      teamName: team.name || team.teamName || '',
      stage: this.data.serviceBindingReady ? 'confirm' : 'service_follow'
    })
    wx.cloud.callFunction({
      name: 'tournamentRegistrationFlow',
      data: { action: 'saveRegistrationDraft', ...draft }
    }).catch(function(error) { console.warn('[signup] cloud draft save skipped:', error) })
  },

  closeServiceFollowModal() {
    this.setData({ showServiceFollowModal: false })
  },

  async refreshServiceBindingFromModal() {
    this.setData({ serviceBindingRefreshing: true })
    const subscribed = await this.refreshServiceBinding({ silent: false })
    this.setData({ serviceBindingRefreshing: false, showServiceFollowModal: !subscribed })
    if (subscribed) this.persistSignupDraft()
  },

  async prepareServiceBinding(options) {
    if (!this.data.inviteKey && !this.data.tournamentId) return false
    if (this.data.serviceBindingPreparing) return false
    this.setData({ serviceBindingPreparing: true, serviceBindingStatus: 'preparing', serviceBindingStatusText: '正在生成关注二维码…', serviceBindingButtonText: '请稍候' })
    try {
      const response = await wx.cloud.callFunction({ name: 'tournamentRegistrationFlow', timeout: 15000, data: { action: 'createFollowGate', inviteKey: this.data.inviteKey, tournamentId: this.data.tournamentId } })
      const result = response.result || {}
      if (!result.success) throw new Error(result.message || '服务号绑定准备失败')
      const data = result.data || {}
      this.setData({ serviceFollowGateId: data.gateId || '', serviceFollowUrl: data.followUrl || '', showServiceFollowQr: Boolean(data.followUrl && !data.subscribed), showServiceFollowModal: Boolean(data.followUrl && !data.subscribed), serviceBindingConfigured: data.configured === true, serviceBindingStatus: data.subscribed ? 'subscribed' : (data.configured ? 'waiting' : 'configuration_required'), serviceBindingStatusText: data.subscribed ? '已完成服务号绑定' : (data.configured ? '请长按二维码关注，完成后点刷新' : '服务号通道待平台配置'), serviceBindingButtonText: data.subscribed ? '已绑定' : '刷新状态', serviceBindingReady: data.subscribed === true }, () => {
        this.updateSubmitStatus()
        this.persistSignupDraft()
      })
      if (!data.followUrl && !data.subscribed && !(options && options.auto)) wx.showToast({ title: '服务号通道待配置', icon: 'none' })
      return data.subscribed === true
    } catch (error) {
      this.setData({ serviceBindingStatus: 'failed', serviceBindingStatusText: error.message || '二维码生成失败，请重试', serviceBindingButtonText: '重试生成二维码' })
      if (!(options && options.auto)) wx.showModal({ title: '服务号绑定暂不可用', content: error.message || '绑定准备失败，请联系赛事主办方', showCancel: false })
      return false
    } finally {
      this.setData({ serviceBindingPreparing: false })
    }
  },

  previewServiceQr() {
    if (!this.data.serviceFollowUrl) return
    wx.previewImage({ current: this.data.serviceFollowUrl, urls: [this.data.serviceFollowUrl] })
  },

  async refreshServiceBinding(options) {
    const silent = options && options.silent === true
    if (!this.data.serviceFollowGateId && !silent) return this.prepareServiceBinding()
    try {
      const response = await wx.cloud.callFunction({ name: 'tournamentRegistrationFlow', data: { action: 'getFollowGateStatus', gateId: this.data.serviceFollowGateId, tournamentId: this.data.tournamentId } })
      const result = response.result || {}
      if (!result.success) throw new Error(result.message || '刷新失败')
      const subscribed = result.data && result.data.subscribed === true
      this.setData({ serviceBindingStatus: subscribed ? 'subscribed' : 'waiting', serviceBindingStatusText: subscribed ? '已完成服务号绑定' : '尚未检测到关注，请完成后刷新', serviceBindingButtonText: subscribed ? '已绑定' : '刷新状态', serviceBindingReady: subscribed, showServiceFollowQr: !subscribed && Boolean(this.data.serviceFollowUrl), showServiceFollowModal: subscribed ? false : this.data.showServiceFollowModal }, () => {
        this.updateSubmitStatus()
        this.persistSignupDraft()
      })
      if (!silent) wx.showToast({ title: subscribed ? '绑定成功' : '尚未完成绑定', icon: subscribed ? 'success' : 'none' })
      return subscribed
    } catch (error) {
      if (!silent) wx.showToast({ title: error.message || '刷新失败', icon: 'none' })
      return false
    }
  },

  // 提交报名
  async onSubmit() {
    if (this.data.submitting) return

    const tournament = this.data.tournament

    if (!this.data.activeDivisionSelectable) {
      wx.showToast({ title: '当前组别已满或未开放报名', icon: 'none' })
      return
    }

    // 检查竞赛规程阅读（如果有的话）
    if (tournament.hasRegulations && !this.data.regulationsRead) {
      wx.showToast({
        title: '请先阅读竞赛规程',
        icon: 'none'
      })
      return
    }

    // 检查免责声明同意
    if (!this.data.disclaimerAgreed) {
      wx.showToast({
        title: '请同意免责声明',
        icon: 'none'
      })
      return
    }

    // 邀请报名以球队绑定为准：当前账号能识别到球队即可提交报名
    if (!this.data.team || !(this.data.team._id || this.data.team.teamId)) {
      wx.showToast({
        title: '未识别到球队',
        icon: 'none'
      })
      return
    }

    // 检查是否已满
    if (this.data.tournament.registeredTeams >= this.data.tournament.maxTeams) {
      wx.showToast({
        title: '报名已满',
        icon: 'none'
      })
      return
    }

    this.setData({ submitting: true })

    try {
      const team = this.data.team
      const teamId = team._id || team.teamId || wx.getStorageSync('currentTeamId')

      let miniSubscriptionAccepted = false
      if (this.data.miniSubscribeTemplateId) {
        try {
          const subscription = await wx.requestSubscribeMessage({ tmplIds: [this.data.miniSubscribeTemplateId] })
          miniSubscriptionAccepted = subscription[this.data.miniSubscribeTemplateId] === 'accept'
        } catch (subscriptionError) {
          console.warn('订阅消息授权未完成:', subscriptionError)
        }
      }
      // 创建报名记录
      const response = await wx.cloud.callFunction({
        name: 'applyTournament',
        timeout: 20000,
        data: {
          tournamentId: this.data.tournamentId,
          teamId: teamId,
          divisionId: this.data.activeDivisionId,
          inviteKey: this.data.inviteKey,
          disclaimerAgreed: true,
          miniSubscriptionAccepted,
          serviceFollowGateId: this.data.serviceFollowGateId,
          message: ''
        }
      })
      const result = response.result || {}
      if (!result.success) throw new Error(result.message || '报名提交失败')

      wx.showToast({
        title: '报名申请已提交',
        icon: 'success',
        duration: 2000
      })

      workspace.selectWorkspace('team:' + teamId)
      wx.setStorageSync('currentTeamId', teamId)
      signupDraft.clear()
      wx.cloud.callFunction({ name: 'tournamentRegistrationFlow', data: { action: 'completeRegistrationDraft', tournamentId: this.data.tournamentId, teamId } }).catch(function() {})
      wx.removeStorageSync('loginRedirectUrl')
      wx.removeStorageSync('teamOnboardingReturnUrl')
      setTimeout(() => {
        wx.reLaunch({
          url: '/pages/teams/index',
          fail: () => {
            this.setData({ submitting: false })
            wx.showToast({ title: '报名成功，请从球队页进入', icon: 'none' })
          }
        })
      }, 800)
      return
    } catch (err) {
      console.error('报名失败:', err)
      wx.showToast({
        title: err.message || '报名失败',
        icon: 'none'
      })
    }

    this.setData({ submitting: false })
  }
})
