// custom-tab-bar/index.js
// 赛小蜂 - 主办方小程序底部导航
var ORGANIZER_TABS = [
  { id: 'home', text: '首页', iconText: '🏠', path: '/pages/home/home' },
  { id: 'tournament', text: '赛事', iconText: '🏆', path: '/pages/tournament-center/tournament-center' },
  { id: 'match', text: '裁判', iconText: '📋', path: '/pages/referee/index' },
  { id: 'profile', text: '我的', iconText: '👤', path: '/pages/profile/profile' }
]
function buildTabs(role, selectedIndex) {
  var tabs = ORGANIZER_TABS
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
      var role = (wx.getStorageSync('currentRole') || 'organizer').toLowerCase()
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
      var role = (wx.getStorageSync('currentRole') || 'organizer').toLowerCase()
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
        var role = (wx.getStorageSync('currentRole') || 'organizer').toLowerCase()
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
