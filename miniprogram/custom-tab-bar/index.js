// custom-tab-bar/index.js
// 赛小蜂 - 自定义底部导航（按角色动态渲染）

// 角色对应的 tab 配置
var ROLE_TAB_MAP = {
  // 教练：首页、球队、赛事、我的
  coach: [
    { id: 'home',    text: '首页', iconText: '🏠', path: '/pages/home/home' },
    { id: 'team',    text: '球队', iconText: '⚽', path: '/pages/team/team' },
    { id: 'match',   text: '赛事', iconText: '📋', path: '/pages/tournament-center/tournament-center' },
    { id: 'profile', text: '我的', iconText: '👤', path: '/pages/profile/profile' }
  ],
  // 主办方：首页、赛事、裁判、我的
  organizer: [
    { id: 'home',     text: '首页', iconText: '🏠',  path: '/pages/home/home' },
    { id: 'tournament',text: '赛事', iconText: '🏆', path: '/pages/tournament-center/tournament-center' },
    { id: 'match',    text: '裁判', iconText: '📋', path: '/pages/referee/index' },
    { id: 'profile',  text: '我的', iconText: '👤', path: '/pages/profile/profile' }
  ],
  // 裁判：首页、赛事、我的（赛事页可查看已分配的比赛）
  referee: [
    { id: 'home',   text: '首页', iconText: '🏠', path: '/pages/home/home' },
    { id: 'match',  text: '赛事', iconText: '📋', path: '/pages/tournament-center/tournament-center' },
    { id: 'profile',text: '我的', iconText: '👤', path: '/pages/profile/profile' }
  ]
}
function buildTabs(role, selectedIndex) {
  var tabs = ROLE_TAB_MAP[role] || ROLE_TAB_MAP.coach
  var sel = selectedIndex !== undefined ? selectedIndex : 0
  return tabs.map(function(tab, idx) {
    return {
      id: tab.id,
      text: tab.text,
      iconText: tab.iconText,
      path: tab.path,
      activeClass: idx === sel ? 'active' : ''
    }
  })
}

Component({
  data: {
    selected: 0,
    tabs: [],
    currentRole: ''
  },

  methods: {
    // 切换 tab
    switchTab: function(e) {
      var index = e.currentTarget.dataset.index
      var tab = this.data.tabs[index]
      if (!tab) return
      if (tab.path === "/pages/team/team") {
        var pages = getCurrentPages()
        var currentPath = pages && pages.length > 0 ? "/" + pages[pages.length - 1].route : ""
        if (currentPath !== tab.path) {
          wx.navigateTo({ url: tab.path })
        }
        return
      }
      wx.switchTab({ url: tab.path })
    },

    // ★ 由页面 onShow 调用，同步选中状态 + 刷新角色
    syncFromPage: function(selectedIndex) {
      var that = this
      var role = (wx.getStorageSync('currentRole') || 'coach').toLowerCase()
      var tabs = buildTabs(role, selectedIndex)

      if (role !== that.data.currentRole) {
        that.setData({
          currentRole: role,
          tabs: tabs
        })
        var pages = getCurrentPages()
        if (pages && pages.length > 0) {
          var currentPath = '/' + pages[pages.length - 1].route
          for (var i = 0; i < tabs.length; i++) {
            if (tabs[i].path === currentPath) {
              that._updateTabActive(i)
              return
            }
          }
          that._updateTabActive(0)
        }
      } else {
        if (selectedIndex !== undefined && selectedIndex !== that.data.selected) {
          that._updateTabActive(selectedIndex)
        }
      }
    },
    _updateTabActive: function(selectedIndex) {
      var tabs = this.data.tabs
      var changed = false
      for (var i = 0; i < tabs.length; i++) {
        var newClass = i === selectedIndex ? 'active' : ''
        if (tabs[i].activeClass !== newClass) {
          tabs[i].activeClass = newClass
          changed = true
        }
      }
      if (changed) {
        this.setData({ selected: selectedIndex, tabs: tabs })
      } else {
        this.setData({ selected: selectedIndex })
      }
    },

    // 根据当前页面路径同步选中状态
    syncSelected: function() {
      var pages = getCurrentPages()
      if (!pages || pages.length === 0) return
      var currentPath = '/' + pages[pages.length - 1].route
      var tabs = this.data.tabs
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].path === currentPath) {
          this._updateTabActive(i)
          break
        }
      }
    }
  },

  lifetimes: {
    attached: function() {
      var that = this
      var role = (wx.getStorageSync('currentRole') || 'coach').toLowerCase()
      that.setData({
        currentRole: role,
        tabs: buildTabs(role, 0)
      })
      setTimeout(function() {
        that.syncSelected()
      }, 100)
    }
  },

  pageLifetimes: {
    show: function() {
      var that = this
      setTimeout(function() {
        that.syncSelected()
        var role = (wx.getStorageSync('currentRole') || 'coach').toLowerCase()
        if (role !== that.data.currentRole) {
          that.setData({
            currentRole: role,
            tabs: buildTabs(role, that.data.selected)
          })
          that.syncSelected()
        }
      }, 50)
    }
  }
})
