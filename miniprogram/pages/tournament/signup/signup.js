// 赛事报名页
var workspace = require('../../../utils/workspace')
var signupDraft = require('../../../utils/signup-draft')

// 与 PC 报名表导入、球队详情共用同一套比赛服颜色，避免各端出现不同色板。
var KIT_COLOR_OPTIONS = [
  { label: '纯白', value: '#FFFFFF' },
  { label: '炭黑', value: '#161A18' },
  { label: '深灰', value: '#59615D' },
  { label: '银灰', value: '#A8B0AC' },
  { label: '正红', value: '#D72631' },
  { label: '酒红', value: '#7E1731' },
  { label: '亮橙', value: '#F47A1F' },
  { label: '比赛黄', value: '#F5C518' },
  { label: '荧光黄', value: '#D7F300' },
  { label: '草地绿', value: '#138A4B' },
  { label: '深绿', value: '#075B35' },
  { label: '天蓝', value: '#47A9E8' },
  { label: '皇家蓝', value: '#1455B5' },
  { label: '海军蓝', value: '#14264A' },
  { label: '藏青', value: '#1F3A6E' },
  { label: '竞技紫', value: '#6B3FA0' },
  { label: '亮粉', value: '#E64A8A' }
]

// 报名记录的组别标识：与 getMiniWorkspace.teamTournamentDetail 保持一致，
// 兼容历史数据只写 division 字段的情况，避免同一份报名在小程序端被判成“未报名”。
function registrationDivisionId(row) {
  if (!row) return ''
  return String(row.divisionId || row.division || 'default')
}

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

// 公开报名页优先由云函数返回组别，避免小程序端直连 divisions 因权限或单次查询条数限制
// 静默回落到“默认组”，导致后台显示报名中、小程序却全部显示已关闭。
async function loadSignupDivisions(db, tournamentId) {
  try {
    var response = await wx.cloud.callFunction({ name: 'tournamentRegistrationFlow', timeout: 15000, data: { action: 'getPublicSignupDivisions', tournamentId: tournamentId } })
    var result = response.result || {}
    if (result.success && result.data && Array.isArray(result.data.divisions)) return result.data.divisions
  } catch (error) {
    console.warn('[signup] 服务端组别读取失败，回退小程序端读取:', error)
  }
  var rows = []
  for (var offset = 0; offset < 200; offset += 20) {
    var page = await db.collection('divisions').where({ tournamentId: tournamentId }).skip(offset).limit(20).get()
    var data = page.data || []
    rows = rows.concat(data)
    if (data.length < 20) break
  }
  return rows
}

function legacyDefaultDivision(tournament) {
  if (!tournament) return null
  var maxTeams = Number(tournament.maxTeams)
  var maxPlayers = Number(tournament.maxPlayersPerTeam || tournament.maxPlayers)
  if (!(maxTeams > 0) && !(maxPlayers > 0)) return null
  return {
    id: 'default',
    name: tournament.divisionName || '默认组',
    maxTeams: maxTeams,
    maxPlayersPerTeam: maxPlayers,
    registrationEnabled: tournament.registrationEnabled === true
  }
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
    canSwitchTeam: false,
    contactName: '',
    contactPhone: '',
    kitColorLabels: KIT_COLOR_OPTIONS.map(item => item.label),
    kitPrimaryIndex: 0,
    kitSecondaryIndex: 0,
    kitPrimaryColor: '',
    kitSecondaryColor: '',
    kitPrimaryLabel: '',
    kitSecondaryLabel: '',
    submitDisabled: true,
    submitButtonClass: 'disabled',
    submitBtnText: '请同意免责声明',
    showFullDisclaimer: false,
    defaultDisclaimer: '参赛免责声明书\n\n本人（以下简称"参赛者"）已充分了解参加本次赛事的风险，现就参赛相关事宜作出如下声明与承诺：\n\n第1条  风险知晓\n本人完全知晓足球运动具有较高的身体对抗性和受伤风险，包括但不限于扭伤、拉伤、骨折、关节脱位、韧带撕裂、皮肤擦伤及因剧烈运动可能引发的心脑血管意外等。本人对上述风险已有充分认识，并自愿承担参加本次赛事可能带来的一切身体风险。\n\n第2条  健康状况\n本人确认身体健康状况良好，适合参加足球竞技运动。本人已在三级甲等医院进行体检，体检结果证明本人身体健康，不存在心脏病、高血压、癫痫、严重颈椎/腰椎疾病以及其他不适宜剧烈运动的疾病或隐患。如因本人隐瞒病史、健康状况不佳或服用违禁药物导致在赛事中发生任何身体损害，后果由本人自行承担。\n\n第3条  保险责任\n本人已购买赛事期间有效的人身意外伤害保险。本人确认保险合同真实有效，并同意将保险凭证复印件作为报名材料一并提交组委会。赛事期间因意外受伤产生的医疗费用，由本人通过保险渠道进行理赔，主办方不承担相关费用。\n\n第4条  安全义务\n本人在赛事期间承诺遵守以下安全义务：\n（一）严格遵守赛事规程、竞赛规则及组委会各项通知和规定；\n（二）服从裁判员、比赛监督及现场工作人员的管理和指挥；\n（三）使用符合标准的运动装备参赛，包括但不限于佩戴护腿板、穿着非金属底足球鞋；\n（四）比赛前进行充分热身，赛后进行适当放松恢复；\n（五）如感身体不适或出现伤病征兆，主动停止比赛并及时向队医或赛事医疗保障人员报告；\n（六）不酒后参赛，不使用任何违禁药物或兴奋剂。\n\n第5条  免责条款\n本人在此不可撤销地声明：赛事期间（包括但不限于比赛、训练、往返赛场途中及赛事相关活动期间），如因本人自身身体原因、个人过失、违规操作或不可预见因素导致本人受到人身伤害或财产损失，本人自愿承担全部责任。\n本人同时放弃对以下单位和个人的追偿权利，并承诺不以任何理由向其主张赔偿或提起诉讼：\n（一）赛事主办方；（二）赛事承办单位、协办单位及运营单位；（三）赛事赞助单位；（四）赛事组委会及其工作人员；（五）比赛监督、裁判员及其他竞赛官员；（六）比赛场馆及场地提供方；（七）其他参赛队伍及运动员；（八）赛事期间提供医疗服务的医疗机构及其医护人员。\n\n第6条  赛风赛纪\n本人承诺在赛事期间遵守赛风赛纪，文明参赛，尊重裁判、尊重对手、尊重观众。本人不会发生以下行为，如有违反，愿意接受赛事组委会依据规程及相关纪律准则作出的任何处罚：\n（一）推搡、谩骂、殴打裁判员、比赛监督或对方球员；（二）打架斗殴、恶意犯规、报复性伤害；（三）冒名顶替、弄虚作假、伪造身份参赛；（四）罢赛、弃权、中途退赛；（五）其他违反竞赛规程和体育道德的行为。\n\n第7条  肖像权及宣传\n本人同意赛事主办方、赛事平台及媒体在赛事期间及赛事相关活动中对本人进行拍摄、录像及采访，并授权上述主体将本人的肖像、姓名、参赛信息及比赛画面用于赛事宣传、报道、网络发布、赛事回顾等非商业用途，且无需向本人支付报酬。\n本人同时授权赛事平台在本平台的产品介绍、功能演示、赛事案例展示及平台自有渠道推广中，使用赛事期间拍摄的含本人肖像的赛事照片、视频片段及赛事数据，无需向本人支付报酬。赛事平台不得将本人肖像单独用于与赛事无关的商业广告，不得向第三方出售、出租或以其他方式提供本人肖像用于商业用途。\n本人或本人监护人可随时通过赛事平台客服渠道申请撤回上述肖像使用授权；撤回后，赛事平台停止新增使用，已发布、已存档的历史内容不受影响。参赛者为未成年人的，本条由监护人代为同意。\n\n第8条  平台免责\n本人知悉并同意：本次赛事报名及信息管理服务由"赛小蜂足球"（以下简称"赛事平台"）提供，赛事平台仅为本次赛事提供信息技术服务支持，不属于赛事主办方、承办方或组织者。\n就赛事平台服务，本人特此确认并同意：\n（一）赛事平台仅作为信息展示与报名工具，不承担赛事组织、安全保障、医疗救护、现场管理等任何赛事执行责任；\n（二）因网络延迟、系统故障、数据错误、黑客攻击、服务器宕机等信息技术原因导致报名失败、信息丢失或赛事信息错误的，赛事平台不承担任何赔偿责任；\n（三）本人在赛事平台填写、上传的所有个人信息（包括但不限于姓名、身份证号、体检证明、保险凭证等），由本人保证其真实性、合法性，赛事平台不对上述信息的真实性进行审核或承担任何责任；\n（四）赛事平台对赛事期间发生的任何人身伤害、财产损失及其他意外事件不承担任何赔偿或连带责任；\n（五）本人同意赛事平台按照本声明书第9条的规定收集、使用和保护本人个人信息，相关用途以赛事报名审核、身份核验及赛事组织为限；\n（六）本人通过赛事平台完成线上签署的，即视为本人已认真阅读并完全理解本免责声明全部条款，线上签署与纸质签字具有同等法律效力。\n\n第9条  个人信息与隐私保护\n本人知悉并同意，赛事平台为提供报名、审核、赛程、成绩及通知等信息技术服务，将收集并使用本人在平台填写和上传的个人信息，包括姓名、性别、出生日期、证件号码、手机号码、所属球队、体检证明、保险凭证、紧急联系人及赛事照片等。\n赛事平台承诺：\n（一）仅在本声明书约定的赛事服务目的和必要范围内收集、使用上述信息，不采集与赛事无关的个人信息；\n（二）采取加密存储、访问权限控制等合理安全措施保护个人信息，防止信息被未授权访问、泄露、篡改或丢失；\n（三）除法律法规要求、司法机关依法调取，或为完成赛事组织确有必要向赛事主办方提供外，不向任何第三方出售、出租或披露本人个人信息；\n（四）赛事服务目的实现或法律法规规定的保存期限届满后，按平台规则删除或匿名化处理相关信息；\n（五）本人有权向赛事平台查询、更正、删除本人个人信息，或撤回对个人信息处理的同意；撤回同意后平台停止相应处理，但不影响撤回前已进行的处理，以及赛事组织必需的历史记录留存；\n（六）参赛者为未成年人的，其个人信息由监护人同意并提供，监护人可代为行使上述权利。\n本人可通过赛事平台提供的客服渠道提出上述请求，赛事平台将在核实身份后按法律法规要求的时限处理并反馈。\n\n第10条  法律效力\n（一）本声明书自本人签字（或线上确认）之日起生效，效力覆盖本人参加本次赛事的全部期间及赛事相关活动。\n（二）本人已认真阅读本声明书全部内容，理解并同意其中所有条款的含义及法律后果。本人签字（或线上确认）即表示完全自愿接受本声明书各项条款的约束。\n（三）本声明书一式两份，本人留存一份，组委会备案一份，两份具有同等法律效力。\n（四）本声明书的解释和争议解决适用中华人民共和国法律。\n\n—— 线上签署说明 ——\n本免责声明在"赛小蜂足球"平台以线上方式签署。参赛者在平台报名流程中勾选"已阅读并同意免责声明"并完成提交，即视为已完成有效签署，与纸质签字具有同等法律效力。'
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
    // 负责人与联系电话默认取当前登录账号，允许修改；这是本次参赛关系的联系资料。
    const storedUser = wx.getStorageSync('userInfo') || {}
    const storedPhone = wx.getStorageSync('phoneNumber') || storedUser.phoneNumber || storedUser.phone || ''
    this.setData({
      contactName: String(storedUser.realName || storedUser.name || '').trim(),
      contactPhone: String(storedPhone || '').replace(/\D/g, '').slice(0, 11)
    })
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
    this.setTeamChoices(wx.getStorageSync('myTeams') || [])

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
          storedDivisions = await loadSignupDivisions(db, this.data.tournamentId)
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
            : [legacyDefaultDivision(rawTournament)].filter(Boolean)
      if (!divisions.length) throw new Error('当前赛事尚未配置竞赛组别')
      const divisionsFromInvitation = this.data.inviteDivisions.length > 0
      let allSignupRows = []
      if (!divisionsFromInvitation) {
        try {
          allSignupRows = await loadAllTournamentTeams(db, this.data.tournamentId)
        } catch (teamError) {
          console.warn('[signup] 已报名球队数量读取失败，使用服务端组别统计:', teamError)
        }
      }
      const capacityCounts = allSignupRows.reduce((counts, item) => {
        const status = String(item.status || '').toLowerCase()
        if (status !== 'approved' && status !== 'invited') return counts
        const divisionId = String(item.divisionId || item.division || 'default')
        counts[divisionId] = Number(counts[divisionId] || 0) + 1
        return counts
      }, {})
      const tournamentStatus = String(rawTournament.status || '').toLowerCase()
      const terminalStatuses = ['completed', 'finished', 'ended', 'cancelled', 'canceled', 'archived']
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
            : rawTournament.registrationEnabled !== false && item.registrationEnabled === true && terminalStatuses.indexOf(tournamentStatus) < 0
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
          return !inactive && registrationDivisionId(item) === this.data.activeDivisionId
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
    // 组别标识必须与 teamTournamentDetail 的取法一致（divisionId → division → default），
    // 否则只有 division 字段的历史记录会跳到无匹配组别，页面报“参赛信息暂不可用”。
    const divisionId = registrationDivisionId(registration) || this.data.activeDivisionId || 'default'
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

  // 报名球队从“我的球队”中选择。同一支球队可分别报名不同组别，球员库仍是同一份；
  // 只有确实没有球队时才需要新建，避免为参加第二个组别重复建队导致球员档案分裂。
  setTeamChoices(teams) {
    const list = (teams || []).filter(Boolean)
    // 候选队只有一支时也要能换队/新建：切换账号或退出原球队后需要在这里改选或重新建队，
    // 不能用“只有一支”把入口锁死。
    this.setData({ canSwitchTeam: list.length > 0 && !this.data.requestedTeamId })
  },

  switchTeam() {
    const teams = wx.getStorageSync('myTeams') || []
    if (!teams.length) {
      wx.showToast({ title: '暂无可选择的球队，请先新建球队', icon: 'none' })
      return
    }
    const items = teams.map(team => team.name || team.teamName || '未命名球队')
    items.push('＋ 新建球队')
    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        if (res.tapIndex === teams.length) {
          this.goCreateTeamForSignup()
          return
        }
        this.applyTeamSelection(res.tapIndex)
      },
      fail: () => {}
    })
  },

  applyTeamSelection(index) {
    const teams = wx.getStorageSync('myTeams') || []
    const team = teams[index]
    if (!team) return
    wx.setStorageSync('currentTeamIndex', index)
    this.cacheCurrentTeam(team)
    this.setData({ loading: true })
    this.loadData()
  },

  createTeamForSignup() {
    this.goCreateTeamForSignup()
  },

  onContactNameInput(e) {
    this.setData({ contactName: e.detail.value })
    this.updateSubmitStatus()
  },

  onContactPhoneInput(e) {
    this.setData({ contactPhone: String(e.detail.value || '').replace(/\D/g, '').slice(0, 11) })
    this.updateSubmitStatus()
  },

  // 主、备用比赛服上衣颜色，报名时必填；短裤和球袜由主办方在 PC 端补录。
  onKitColorChange(e) {
    const setKey = e.currentTarget.dataset.set
    const index = Number(e.detail.value)
    const option = KIT_COLOR_OPTIONS[index]
    if (!option) return
    if (setKey === 'secondary') {
      this.setData({ kitSecondaryIndex: index, kitSecondaryColor: option.value, kitSecondaryLabel: option.label })
    } else {
      this.setData({ kitPrimaryIndex: index, kitPrimaryColor: option.value, kitPrimaryLabel: option.label })
    }
    this.updateSubmitStatus()
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

  // 不再根据手机号或联系人字段判断“这支队是不是我的”。
  // 报名球队一律以工作空间（与「我的球队」同一口径）为准，联系方式只是参赛联系资料。

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

  // 报名球队只认账号当前工作空间里真实可管理的球队，与「我的球队」同一数据源。
  // 早期实现把 ownerPhone/contactPhone 等“联系资料”字段当成管理权，在客户端直查 teams，
  // 导致别人把联系电话填成本账号手机号的球队被当成“我的球队”：既没有管理权，也没有退出入口。
  async resolveSignupTeam(db) {
    const ids = this.getLoginIdentifiers()
    if (!ids.phone && !ids.openId && !ids.userId) {
      this.goLoginForSignup()
      return null
    }
    if (typeof workspace.hasAuthenticatedUser === 'function' && !workspace.hasAuthenticatedUser()) {
      this.goLoginForSignup()
      return null
    }

    const loaded = await this.loadWorkspaceTeams()
    if (!loaded.ok) {
      wx.showToast({ title: '球队信息加载失败，请重试', icon: 'none' })
      this.setData({ loading: false })
      return null
    }
    const candidates = await this.enrichTeams(db, loaded.teams)
    const requestedTeamId = this.data.requestedTeamId
    const cachedTeamId = wx.getStorageSync('currentTeamId') || ''

    this.persistWorkspaceTeams(candidates)

    // 分享链接指定的球队必须在账号已授权球队里，否则明确提示无权限，不再静默套用
    if (requestedTeamId) {
      const requested = candidates.find(item => item._id === requestedTeamId)
      if (requested) return this.cacheCurrentTeam(requested)
      wx.showToast({ title: '当前账号没有该球队的报名权限', icon: 'none' })
      this.setData({ requestedTeamId: '' })
    }

    if (candidates.length === 0) {
      // 账号下没有可管理的球队时只走建队，绝不猜测球队
      this.goCreateTeamForSignup()
      return null
    }

    const preferred = candidates.find(item => item._id === cachedTeamId) || candidates[0]
    wx.setStorageSync('currentTeamIndex', candidates.indexOf(preferred))
    return this.cacheCurrentTeam(preferred)
  },

  async loadWorkspaceTeams() {
    try {
      const context = await workspace.loadContext()
      return { ok: true, teams: this.workspaceTeamList(context) }
    } catch (error) {
      const message = String((error && error.message) || '')
      // 新注册账号还没有任何工作空间不算故障：交给建队流程，不能停在“加载失败”。
      if (message.indexOf('尚未建立可用工作空间') >= 0 || (error && error.code === 'WORKSPACE_NOT_FOUND')) {
        return { ok: true, teams: [] }
      }
      console.warn('[signup] 读取工作空间球队失败:', message)
      return { ok: false, teams: [] }
    }
  },

  // 工作空间只给球队身份和卡片摘要；城市、球员数等展示信息仍从球队档案按 id 补取，
  // 只为已授权球队补字段，不构成任何归属判断。读取失败就沿用工作空间数据。
  async enrichTeams(db, teams) {
    const list = (teams || []).filter(item => item && item._id)
    if (!list.length) return teams || []
    try {
      const ids = list.map(item => item._id).slice(0, 20)
      const rows = await db.collection('teams')
        .where({ _id: db.command.in(ids) })
        .limit(20)
        .get()
      const byId = {}
      (rows.data || []).forEach(row => { byId[String((row && row._id) || '')] = row })
      return list.map(item => {
        const row = byId[String(item._id)] || {}
        return this.normalizeTeam({
          _id: item._id,
          name: item.name || row.name || row.teamName,
          logo: item.logo || row.logo || row.logoUrl || row.teamLogo,
          city: row.city || row.cityName || item.city,
          playerCount: Number(row.playerCount || 0) || item.playerCount || 0,
          teamCode: item.teamCode || row.teamCode
        })
      })
    } catch (error) {
      console.warn('[signup] 球队展示信息补充失败，使用工作空间数据:', error && error.message)
      return list
    }
  },

  // 与「我的球队」页同一口径：homeEntries 的球队卡片 + context.teams，按 id 去重
  workspaceTeamList(context) {
    if (!context) return []
    const byId = {}
    const push = (id, name, logo, teamCode) => {
      const key = String(id || '')
      if (!key || byId[key]) return
      byId[key] = this.normalizeTeam({ _id: key, name: name, logo: logo, teamCode: teamCode })
    }
    ;(context.homeEntries || []).forEach(item => {
      if (!item || item.type !== 'team') return
      push(item.id, item.name, item.logo, item.teamCode)
    })
    ;(context.teams || []).forEach(team => {
      if (!team) return
      push(team.id || team._id, team.name || team.teamName, team.logo, team.teamCode)
    })
    return Object.keys(byId).map(key => byId[key])
  },

  persistWorkspaceTeams(teams) {
    wx.setStorageSync('myTeams', teams)
    this.setTeamChoices(teams)
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
    // 负责人与联系电话是赛事资料的必要项，主办方需要能联系到球队，缺一不可提交。
    const contactOk = Boolean(String(this.data.contactName || '').trim()) && /^1[3-9]\d{9}$/.test(String(this.data.contactPhone || ''))
    // 主、备用比赛服上衣颜色用于赛前撞色提醒，主办方需要报名时就能拿到，缺一不可提交。
    const kitOk = Boolean(this.data.kitPrimaryColor) && Boolean(this.data.kitSecondaryColor)
    const canSubmit = regulationsOk && disclaimerOk && serviceBindingOk && divisionOk && contactOk && kitOk
    let submitBtnText = '确认报名'
    if (!divisionOk) submitBtnText = '当前没有可报名组别'
    else if (needRegulations && !this.data.regulationsRead) submitBtnText = '请先阅读竞赛规程'
    else if (!this.data.disclaimerAgreed) submitBtnText = '请同意免责声明'
    else if (!serviceBindingOk) submitBtnText = '请先关注服务号'
    else if (!contactOk) submitBtnText = '请填写负责人和联系电话'
    else if (!kitOk) submitBtnText = '请选择主、备用比赛服颜色'
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
          contactName: String(this.data.contactName || '').trim(),
          contactPhone: String(this.data.contactPhone || '').replace(/\D/g, ''),
          kitColors: {
            primary: { jersey: this.data.kitPrimaryColor },
            secondary: { jersey: this.data.kitSecondaryColor }
          },
          kitColorLabels: {
            primary: { jersey: this.data.kitPrimaryLabel },
            secondary: { jersey: this.data.kitSecondaryLabel }
          },
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
