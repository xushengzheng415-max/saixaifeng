// 赛事报名页
Page({


  data: {
    tournamentId: '',
    divisionOptions: [],
    showDivisionTabs: false,
    activeDivisionId: 'default',
    activeDivisionName: '默认组',
    fromShare: false,
    tournament: null,
    team: null,
    loading: true,
    submitting: false,
    regulationsRead: false,
    disclaimerAgreed: false,
    showFullDisclaimer: false,
    defaultDisclaimer: '参赛免责声明书\n\n本人（以下简称"参赛者"）已充分了解参加本次赛事的风险，现就参赛相关事宜作出如下声明与承诺：\n\n第1条  风险知晓\n本人完全知晓足球运动具有较高的身体对抗性和受伤风险，包括但不限于扭伤、拉伤、骨折、关节脱位、韧带撕裂、皮肤擦伤及因剧烈运动可能引发的心脑血管意外等。本人对上述风险已有充分认识，并自愿承担参加本次赛事可能带来的一切身体风险。\n\n第2条  健康状况\n本人确认身体健康状况良好，适合参加足球竞技运动。本人已在三级甲等医院进行体检，体检结果证明本人身体健康，不存在心脏病、高血压、癫痫、严重颈椎/腰椎疾病以及其他不适宜剧烈运动的疾病或隐患。如因本人隐瞒病史、健康状况不佳或服用违禁药物导致在赛事中发生任何身体损害，后果由本人自行承担。\n\n第3条  保险责任\n本人已购买赛事期间有效的人身意外伤害保险。本人确认保险合同真实有效，并同意将保险凭证复印件作为报名材料一并提交组委会。赛事期间因意外受伤产生的医疗费用，由本人通过保险渠道进行理赔，主办方不承担相关费用。\n\n第4条  安全义务\n本人在赛事期间承诺遵守以下安全义务：\n（一）严格遵守赛事规程、竞赛规则及组委会各项通知和规定；\n（二）服从裁判员、比赛监督及现场工作人员的管理和指挥；\n（三）使用符合标准的运动装备参赛，包括但不限于佩戴护腿板、穿着非金属底足球鞋；\n（四）比赛前进行充分热身，赛后进行适当放松恢复；\n（五）如感身体不适或出现伤病征兆，主动停止比赛并及时向队医或赛事医疗保障人员报告；\n（六）不酒后参赛，不使用任何违禁药物或兴奋剂。\n\n第5条  免责条款\n本人在此不可撤销地声明：赛事期间（包括但不限于比赛、训练、往返赛场途中及赛事相关活动期间），如因本人自身身体原因、个人过失、违规操作或不可预见因素导致本人受到人身伤害或财产损失，本人自愿承担全部责任。\n本人同时放弃对以下单位和个人的追偿权利，并承诺不以任何理由向其主张赔偿或提起诉讼：\n（一）赛事主办方；（二）赛事承办单位、协办单位及运营单位；（三）赛事赞助单位；（四）赛事组委会及其工作人员；（五）比赛监督、裁判员及其他竞赛官员；（六）比赛场馆及场地提供方；（七）其他参赛队伍及运动员；（八）赛事期间提供医疗服务的医疗机构及其医护人员。\n\n第6条  赛风赛纪\n本人承诺在赛事期间遵守赛风赛纪，文明参赛，尊重裁判、尊重对手、尊重观众。本人不会发生以下行为，如有违反，愿意接受赛事组委会依据规程及相关纪律准则作出的任何处罚：\n（一）推搡、谩骂、殴打裁判员、比赛监督或对方球员；（二）打架斗殴、恶意犯规、报复性伤害；（三）冒名顶替、弄虚作假、伪造身份参赛；（四）罢赛、弃权、中途退赛；（五）其他违反竞赛规程和体育道德的行为。\n\n第7条  肖像权及宣传\n本人同意赛事主办方及媒体在赛事期间对本人进行拍摄、录像及采访，并授权主办方将本人的肖像、姓名及参赛相关信息用于赛事宣传、报道、网络发布等非商业用途，且无需向本人支付报酬。\n\n第8条  平台免责\n本人知悉并同意：本次赛事报名及信息管理服务由"54足球赛事管理系统"（以下简称"赛事平台"）提供，赛事平台仅为本次赛事提供信息技术服务支持，不属于赛事主办方、承办方或组织者。\n就赛事平台服务，本人特此确认并同意：\n（一）赛事平台仅作为信息展示与报名工具，不承担赛事组织、安全保障、医疗救护、现场管理等任何赛事执行责任；\n（二）因网络延迟、系统故障、数据错误、黑客攻击、服务器宕机等信息技术原因导致报名失败、信息丢失或赛事信息错误的，赛事平台不承担任何赔偿责任；\n（三）本人在赛事平台填写、上传的所有个人信息（包括但不限于姓名、身份证号、体检证明、保险凭证等），由本人保证其真实性、合法性，赛事平台不对上述信息的真实性进行审核或承担任何责任；\n（四）赛事平台对赛事期间发生的任何人身伤害、财产损失及其他意外事件不承担任何赔偿或连带责任；\n（五）本人同意赛事平台将本人填写的报名信息及本免责声明内容用于赛事报名审核、身份核验及赛事组织相关的必要用途，平台承诺对本人个人信息予以保密，除法律法规要求外不向第三方泄露；\n（六）本人通过赛事平台完成线上签署的，即视为本人已认真阅读并完全理解本免责声明全部条款，线上签署与纸质签字具有同等法律效力。\n\n第9条  法律效力\n（一）本声明书自本人签字（或线上确认）之日起生效，效力覆盖本人参加本次赛事的全部期间及赛事相关活动。\n（二）本人已认真阅读本声明书全部内容，理解并同意其中所有条款的含义及法律后果。本人签字（或线上确认）即表示完全自愿接受本声明书各项条款的约束。\n（三）本声明书一式两份，本人留存一份，组委会备案一份，两份具有同等法律效力。\n（四）本声明书的解释和争议解决适用中华人民共和国法律。\n\n—— 线上签署说明 ——\n本免责声明在"54足球赛事管理系统"平台以线上方式签署。参赛者在平台报名流程中勾选"已阅读并同意免责声明"并完成提交，即视为已完成有效签署，与纸质签字具有同等法律效力。'
  },

  onLoad(options) {
    // 支持直接传参和扫码场景参数
    let tournamentId = options.id
    if (options.scene) {
      // scene 格式：id=xxx 或 xxx（纯ID）
      const sceneStr = decodeURIComponent(options.scene)
      if (sceneStr.includes('id=')) {
        tournamentId = sceneStr.split('id=')[1]
      } else {
        tournamentId = sceneStr
      }
    }
    if (tournamentId) {
      this.setData({ tournamentId, activeDivisionId: (options && options.divisionId) || 'default', fromShare: options && options.from === 'share' })
      this.loadData()
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
        wx.showToast({
          title: '赛事不存在',
          icon: 'none'
        })
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }

      const rawTournament = tournamentRes.data
      const divisions = Array.isArray(rawTournament.divisions) && rawTournament.divisions.length
        ? rawTournament.divisions
        : [{ id: 'default', name: '默认组', maxTeams: rawTournament.maxTeams, maxPlayersPerTeam: rawTournament.maxPlayersPerTeam || rawTournament.maxPlayers }]
      const preferred = this.data.activeDivisionId !== 'default' ? this.data.activeDivisionId : (rawTournament.defaultDivisionId || divisions[0].id)
      const activeDivision = divisions.find(item => item.id === preferred) || divisions[0]
      const allSignupsRes = await db.collection('tournament_teams').where({ tournamentId: this.data.tournamentId }).get()
      const registeredTeams = (allSignupsRes.data || []).filter(item => (item.divisionId || 'default') === activeDivision.id && item.status !== 'cancelled' && item.status !== 'withdrawn').length
      const tournament = this.formatTournament({
        ...rawTournament,
        maxTeams: Number(activeDivision.maxTeams || rawTournament.maxTeams || 0),
        maxPlayers: Number(activeDivision.maxPlayersPerTeam || rawTournament.maxPlayersPerTeam || rawTournament.maxPlayers || 0),
        registeredTeams
      })
      const displayDivisions = divisions.map(item => ({
        ...item,
        tabClass: item.id === activeDivision.id ? 'active' : ''
      }))
      this.setData({
        divisionOptions: displayDivisions,
        showDivisionTabs: displayDivisions.length > 1,
        activeDivisionId: activeDivision.id,
        activeDivisionName: activeDivision.name
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

        const alreadySigned = (signupRes.data || []).some(item => (item.divisionId || 'default') === this.data.activeDivisionId)
        if (alreadySigned) {
          wx.showToast({
            title: '您的球队已报名',
            icon: 'none'
          })
          setTimeout(() => wx.navigateBack(), 1500)
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

  onDivisionTap(e) {
    const id = e.currentTarget.dataset.id
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
    const signupPath = '/pages/tournament/signup/signup?id=' + this.data.tournamentId + '&divisionId=' + encodeURIComponent(this.data.activeDivisionId) + '&from=share'
    const redirect = encodeURIComponent(signupPath)
    wx.setStorageSync('loginRedirectUrl', signupPath)
    wx.redirectTo({ url: '/pages/login/login?redirect=' + redirect })
  },

  async resolveSignupTeam(db) {
    const ids = this.getLoginIdentifiers()
    if (!ids.phone && !ids.openId && !ids.userId) {
      this.goLoginForSignup()
      return null
    }

    const cachedTeamId = wx.getStorageSync('currentTeamId') || ''
    const cachedTeamInfo = wx.getStorageSync('teamInfo') || null

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
        wx.setStorageSync('currentTeamIndex', 0)
        return this.cacheCurrentTeam(teams[0])
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

    wx.showModal({
      title: '\u63d0\u793a',
      content: '\u5f53\u524d\u8d26\u53f7\u672a\u5173\u8054\u7403\u961f\uff0c\u8bf7\u5148\u521b\u5efa\u6216\u52a0\u5165\u7403\u961f',
      showCancel: false,
      success: () => {
        wx.switchTab({ url: '/pages/team/team' })
      }
    })
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
    const canSubmit = regulationsOk && disclaimerOk
    const submitBtnText = canSubmit ? '确认报名' : (needRegulations && !this.data.regulationsRead) ? '请先阅读竞赛规程' : '请同意免责声明'
    this.setData({ canSubmit, submitBtnText })
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

  // 提交报名
  async onSubmit() {
    if (this.data.submitting) return

    const tournament = this.data.tournament

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

      // 创建报名记录
      const response = await wx.cloud.callFunction({
        name: 'applyTournament',
        timeout: 20000,
        data: {
          tournamentId: this.data.tournamentId,
          teamId: teamId,
          divisionId: this.data.activeDivisionId,
          disclaimerAgreed: true,
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

      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (err) {
      console.error('报名失败:', err)
      wx.showToast({
        title: '报名失败',
        icon: 'none'
      })
    }

    this.setData({ submitting: false })
  }
})
