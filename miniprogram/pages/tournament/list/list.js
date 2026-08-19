// 赛事列表页
const workspace = require('../../../utils/workspace')

Page({


  _updateLens: function() {
    var data = this.data;
    var _tn = data.tournaments ? data.tournaments.length : 0;
    if (this.data.TournamentsLen !== _tn) { this.setData({ 'TournamentsLen': _tn}); }
  },

  data: {
    tournaments: [],
    loading: true,
    currentTab: 'all',
    searchText: ''
  },

  onLoad() {
    this.loadTournaments()
  },

  onShow() {
    // 每次显示时刷新列表
    this.loadTournaments()
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadTournaments().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 切换 Tab
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
    this.loadTournaments()
  },

  // 搜索
  onSearch(e) {
    const searchText = e.detail.value
    this.setData({ searchText })
    this.loadTournaments()
  },

  // 加载赛事列表（含凭证错误重试）
  async loadTournaments(retryCount) {
    if (typeof retryCount === 'undefined') retryCount = 0
    this.setData({ loading: true })

    try {
      const db = wx.cloud.database()
      const _ = db.command

      // 构建查询条件
      let query = {}

      if (this.data.currentTab !== 'all') {
        query.status = this.data.currentTab
      }

      // 搜索名称
      if (this.data.searchText) {
        query.name = db.RegExp({
          regexp: this.data.searchText,
          options: 'i'
        })
      }

      const res = await db.collection('tournaments')
        .where(query)
        .orderBy('createTime', 'desc')
        .limit(50)
        .get()

      // 格式化数据
      const tournaments = res.data.map(item => this.formatTournament(item))

      this.setData({
        tournaments,
        loading: false
      })
      this._updateLens()
    } catch (err) {
      console.error('加载赛事列表失败:', err ? err.message || err : 'unknown')
      // ★ 凭证错误自动重试
      if (err && (err.message || '').indexOf('credential') !== -1 && retryCount < 1) {
        console.warn('[list] 凭证错误，重新初始化云环境...')
        try { wx.cloud.init({ env: 'cloud1-7g8ckb3c7815a011', traceUser: false }) } catch(e) {}
        setTimeout(() => this.loadTournaments(retryCount + 1), 800)
        return
      }
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
      this.setData({ loading: false })
      this._updateLens()
    }
  },

  // 格式化赛事数据
  formatTournament(tournament) {
    // 状态映射
    const statusMap = {
      'registering': '报名中',
      'ongoing': '进行中',
      'completed': '已结束'
    }

    // 日期范围
    let dateRange = ''
    if (tournament.startDate) {
      const start = this.formatDate(tournament.startDate)
      if (tournament.endDate) {
        const end = this.formatDate(tournament.endDate)
        dateRange = `${start} - ${end}`
      } else {
        dateRange = start
      }
    }

    return {
      ...tournament,
      statusLabel: statusMap[tournament.status] || '未知',
      dateRange
    }
  },

  // 格式化日期
  formatDate(dateStr) {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const month = date.getMonth() + 1
    const day = date.getDate()
    return `${month}月${day}日`
  },

  // 查看赛事详情
  onViewTournament(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/tournament/detail/detail?id=${id}`
    })
  },

  // 创建赛事
  onCreateTournament() {
    // 检查权限（只有赛事主办方可以创建）
    if (!workspace.hasPermission('event.manage')) {
      wx.showToast({
        title: '当前机构未授予赛事管理权限',
        icon: 'none',
        duration: 2000
      })
      return
    }

    wx.navigateTo({
      url: '/pages/tournament/create/create'
    })
  }
})
