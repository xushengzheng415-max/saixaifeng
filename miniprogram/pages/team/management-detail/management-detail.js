// pages/team/management-detail/management-detail.js
// 教练组成员详情页 - 统一 coaches 集合

Page({
  data: {
    loading: true,
    management: {},
    teamInfo: {},
    _source: ''  // 数据来源：coaches 或 management
  },

  onLoad(options) {
    const { id } = options
    if (id) {
      this.loadManagementData(id)
    }
    this.loadTeamInfo()
  },

  onShow() {
    // 页面显示时刷新数据
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    const { id } = currentPage.options
    if (id && this.data.management._id) {
      this.loadManagementData(id)
    }
  },

  // 加载球队信息
  loadTeamInfo() {
    const teamInfo = wx.getStorageSync('teamInfo') || {}
    this.setData({ teamInfo })
  },

  // 加载教练组成员数据（优先 coaches，兼容 management）
  loadManagementData(id) {
    this.setData({ loading: true })

    const db = wx.cloud.database()

    // 角色映射（统一 coaches 集合的 type 字段）
    const typeMap = {
      'head_coach': '主教练',
      'coach': '主教练',
      'assistant_coach': '助理教练',
      'goalkeeper_coach': '守门员教练',
      'team_leader': '领队',
      'physical_trainer': '体能教练',
      'doctor': '队医',
      'other': '其他'
    }

    // 性别映射
    const genderMap = {
      'male': '男',
      'female': '女',
      '男': '男',
      '女': '女'
    }

    // 优先查 coaches（与Web端统一）
    db.collection('coaches').doc(id).get()
      .then(res => {
        const data = res.data
        const management = {
          ...data,
          _source: 'coaches',
          positionLabel: typeMap[data.type] || data.type || '其他',
          genderLabel: genderMap[data.gender] || data.gender || '',
          avatarUrl: data.photoUrl || data.avatarUrl || ''
        }

        this.setData({
          management,
          _source: 'coaches',
          loading: false
        })

        wx.setNavigationBarTitle({
          title: management.name || '教练组成员详情'
        })
      })
      .catch(err => {
        // coaches 查不到，试 management（旧数据兼容）
        db.collection('management').doc(id).get()
          .then(res => {
            const data = res.data
            const management = {
              ...data,
              _source: 'management',
              positionLabel: typeMap[data.position] || data.position || '其他',
              genderLabel: genderMap[data.gender] || data.gender || ''
            }

            this.setData({
              management,
              _source: 'management',
              loading: false
            })

            wx.setNavigationBarTitle({
              title: management.name || '教练组成员详情'
            })
          })
          .catch(err2 => {
            console.error('加载教练组成员数据失败:', err2)
            wx.showToast({ title: '加载失败', icon: 'none' })
            this.setData({ loading: false })
          })
      })
  },

  // 预览头像
  previewImage() {
    const url = this.data.management.photoUrl || this.data.management.avatarUrl
    if (url) {
      wx.previewImage({
        current: url,
        urls: [url]
      })
    }
  },

  // 拨打电话
  callPhone() {
    const phone = this.data.management.phone
    if (phone) {
      wx.makePhoneCall({ phoneNumber: phone, fail: () => {} })
    }
  },

  // 编辑
  onEdit() {
    const { _id, teamId, teamCode } = this.data.management
    const { teamInfo } = this.data
    const realTeamId = teamId || teamInfo._id || teamInfo.teamId || ''
    const realTeamCode = teamCode || teamInfo.teamCode || ''
    const realTeamName = this.data.management.teamName || teamInfo.teamName || ''

    wx.navigateTo({
      url: `/pages/team/management-add/management-add?id=${_id}&teamId=${realTeamId}&teamCode=${realTeamCode}&teamName=${realTeamName}&mode=edit`
    })
  },

  // 删除
  onDelete() {
    wx.showModal({
      title: '确认删除',
      content: `确定要删除「${this.data.management.name}」吗？此操作不可恢复。`,
      confirmText: '删除',
      confirmColor: '#F44336',
      success: (res) => {
        if (res.confirm) {
          this.deleteManagement()
        }
      }
    })
  },

  // 执行删除
  deleteManagement() {
    const db = wx.cloud.database()
    const collectionName = this.data._source === 'management' ? 'management' : 'coaches'

    wx.showLoading({ title: '删除中...' })

    db.collection(collectionName).doc(this.data.management._id).remove()
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: '删除成功', icon: 'success' })
        setTimeout(() => { wx.navigateBack() }, 1500)
      })
      .catch(err => {
        wx.hideLoading()
        console.error('删除失败:', err)
        wx.showToast({ title: '删除失败', icon: 'none' })
      })
  }
})
