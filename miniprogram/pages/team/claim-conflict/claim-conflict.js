const workspace = require('../../../utils/workspace')

Page({
  data: {
    tournamentName: '2026 河南青少年足球冠军联赛',
    divisionName: 'U12组',
    teamName: '维鹰 U10 队',
    inviteId: '',
    manager: '尾号 1663',
    applicant: '尾号 9213',
    matchRecord: '共 24 场，胜 16 场，平 5 场，负 3 场',
    conflictReasons: [
      '提交的负责人手机号与现任负责人不一致',
      '该球队已有负责人绑定，无法自动认领',
      '球队名称相似，系统无法自动合并归属'
    ],
    proofItems: [
      { id: 'authorization', icon: '/images/runtime/icons/brand-v2-12.png', title: '负责人授权书', desc: '负责人签字授权', className: 'claim-proof claim-proof-selected' },
      { id: 'club_certificate', icon: '/images/runtime/icons/brand-v2-09.png', title: '俱乐部证明', desc: '加盖俱乐部公章', className: 'claim-proof' },
      { id: 'tournament_invite', icon: '/images/runtime/icons/brand-v2-13.png', title: '赛事邀请/参赛证明', desc: '官方邀请或参赛凭证', className: 'claim-proof' }
    ],
    activeProofType: 'authorization',
    activeProofLabel: '负责人授权书',
    proofMaterials: [],
    proofMaterialCountText: '0/3',
    hasProofMaterials: false,
    submitted: false,
    submitting: false,
    loading: false,
    visualQa: false,
    reviewRequestId: '',
    submitLabel: '提交人工审核'
  },
  onLoad(options) {
    const opts = options || {}
    const visualQa = workspace.isVisualQaEnabled(opts)
    const inviteId = String(opts.inviteId || '')
    this.setData({
      inviteId,
      visualQa,
      teamName: decodeURIComponent(opts.teamName || (visualQa ? '维鹰 U10 队' : '预建球队')),
      tournamentName: decodeURIComponent(opts.tournamentName || (visualQa ? '2026 河南青少年足球冠军联赛' : '当前赛事')),
      divisionName: decodeURIComponent(opts.divisionName || (visualQa ? 'U10组' : '当前组别'))
    })
    if (!visualQa && inviteId) this.loadInvite()
  },
  loadInvite() {
    wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'prebuiltTeamInvite', inviteId: this.data.inviteId } }).then(res => {
      const result = res.result || {}
      if (!result.success) throw new Error(result.message || '邀请加载失败')
      this.setData({
        teamName: (result.prebuiltTeam || {}).name || this.data.teamName,
        tournamentName: (result.tournament || {}).name || this.data.tournamentName,
        divisionName: (result.invite || {}).divisionName || this.data.divisionName,
        manager: (result.invite || {}).managerPhoneMasked || this.data.manager
      })
    }).catch(error => wx.showToast({ title: error.message || '邀请加载失败', icon: 'none' }))
  },
  onBack() { wx.navigateBack() },
  onTeamCenter() { wx.reLaunch({ url: '/pages/teams/index' }) },
  onSelectProofType(event) {
    if (this.data.submitting || this.data.submitted) return
    const id = String((event.currentTarget.dataset || {}).id || '')
    const item = this.data.proofItems.find(row => row.id === id)
    if (!item) return
    this.setData({
      activeProofType: id,
      activeProofLabel: item.title,
      proofItems: this.data.proofItems.map(row => ({ ...row, className: row.id === id ? 'claim-proof claim-proof-selected' : 'claim-proof' }))
    })
  },
  onChooseProof() {
    if (this.data.visualQa) { wx.showToast({ title: '视觉验收状态不上传材料', icon: 'none' }); return }
    if (this.data.submitting || this.data.submitted || !this.data.inviteId) return
    const remaining = 3 - this.data.proofMaterials.length
    if (remaining <= 0) { wx.showToast({ title: '最多上传 3 项材料', icon: 'none' }); return }
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: result => {
        const files = result.tempFiles || []
        if (!files.length) return
        wx.showLoading({ title: '上传材料中', mask: true })
        Promise.all(files.map((file, index) => {
          const suffix = String((file.tempFilePath || '').split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg'
          const cloudPath = 'claim-review-proofs/' + this.data.inviteId + '/' + Date.now() + '-' + index + '.' + suffix
          return wx.cloud.uploadFile({ cloudPath, filePath: file.tempFilePath }).then(uploaded => ({
            fileId: uploaded.fileID,
            proofType: this.data.activeProofType,
            fileName: String(file.name || (file.tempFilePath || '').split('/').pop() || '证明材料').slice(-120),
            size: Number(file.size || 0),
            mimeType: 'image/*'
          }))
        })).then(materials => {
          const proofMaterials = this.data.proofMaterials.concat(materials).slice(0, 3)
          this.setData({ proofMaterials, proofMaterialCountText: proofMaterials.length + '/3', hasProofMaterials: proofMaterials.length > 0 })
        }).catch(error => wx.showToast({ title: error.message || '材料上传失败，请重试', icon: 'none' })).finally(() => wx.hideLoading())
      },
      fail: error => { if (error && error.errMsg && error.errMsg.indexOf('cancel') < 0) wx.showToast({ title: '未选择材料', icon: 'none' }) }
    })
  },
  onRemoveProof(event) {
    if (this.data.submitting || this.data.submitted) return
    const index = Number((event.currentTarget.dataset || {}).index)
    if (!Number.isInteger(index)) return
    const removed = this.data.proofMaterials[index]
    const proofMaterials = this.data.proofMaterials.filter((item, itemIndex) => itemIndex !== index)
    this.setData({ proofMaterials, proofMaterialCountText: proofMaterials.length + '/3', hasProofMaterials: proofMaterials.length > 0 })
    if (removed && removed.fileId && wx.cloud && wx.cloud.deleteFile) wx.cloud.deleteFile({ fileList: [removed.fileId] }).catch(() => {})
  },
  onSubmitReview() {
    if (this.data.submitting || this.data.submitted || !this.data.inviteId) return
    if (!this.data.proofMaterials.length) { wx.showToast({ title: '请先上传至少一项证明材料', icon: 'none' }); return }
    this.setData({ submitting: true, submitLabel: '正在提交…' })
    wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: { action: 'requestPrebuiltTeamClaimReview', inviteId: this.data.inviteId, reason: 'ownership_conflict', proofMaterials: this.data.proofMaterials }
    }).then(res => {
      const result = res.result || {}
      if (!result.success) throw new Error(result.message || '提交人工审核失败')
      this.setData({ submitted: true, submitting: false, reviewRequestId: String(result.requestId || ''), submitLabel: '已提交人工审核' })
      wx.showModal({ title: '已提交人工审核', content: '主办方已收到归属核验请求和证明材料。审核前不会自动认领、合并或修改任何球队长期资料。', showCancel: false })
    }).catch(error => {
      this.setData({ submitting: false, submitLabel: '重新提交人工审核' })
      wx.showToast({ title: error.message || '提交失败，请稍后重试', icon: 'none' })
    })
  }
})
