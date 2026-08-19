// custom-tab-bar/index.js
// 赛小蜂 - 机构工作空间五中心导航
var WORKSPACE_TABS = [
  { id: 'home', text: '首页', icon: '/images/icons/tab-home.svg', activeIcon: '/images/icons/tab-home-active.svg', path: '/pages/home/home' },
  { id: 'event', text: '赛事', icon: '/images/icons/tab-event.svg', activeIcon: '/images/icons/tab-event-active.svg', path: '/pages/event/index' },
  { id: 'team', text: '球队', icon: '/images/icons/tab-team.svg', activeIcon: '/images/icons/tab-team-active.svg', path: '/pages/teams/index' },
  { id: 'training', text: '青训', icon: '/images/icons/tab-training.svg', activeIcon: '/images/icons/tab-training-active.svg', path: '/pages/training/index' },
  { id: 'profile', text: '我的', icon: '/images/icons/tab-me.svg', activeIcon: '/images/icons/tab-me-active.svg', path: '/pages/profile/profile' }
]
function buildTabs(selectedIndex) {
  var tabs = WORKSPACE_TABS
  var sel = selectedIndex !== undefined ? selectedIndex : 0
  return tabs.map(function(tab, idx) {
    var active = idx === sel
    return {
      id: tab.id,
      text: tab.text,
      icon: active ? tab.activeIcon : tab.icon,
      activeIcon: tab.activeIcon,
      inactiveIcon: tab.icon,
      path: tab.path,
      activeClass: active ? 'active' : ''
    }
  })
}

Component({
  data: {
    selected: 0,
    tabs: [],
    ready: false
  },

  methods: {
    // 切换 tab
    switchTab: function(e) {
      var index = e.currentTarget.dataset.index
      var tab = this.data.tabs[index]
      if (!tab) return
      wx.switchTab({ url: tab.path })
    },

    // 由页面 onShow 调用，同步选中状态。
    syncFromPage: function(selectedIndex) {
      var that = this
      if (selectedIndex !== undefined && selectedIndex !== that.data.selected) {
        that._updateTabActive(selectedIndex)
        return
      }
      that.syncSelected()
    },
    _updateTabActive: function(selectedIndex) {
      var tabs = this.data.tabs
      var changed = false
      for (var i = 0; i < tabs.length; i++) {
        var newClass = i === selectedIndex ? 'active' : ''
        if (tabs[i].activeClass !== newClass) {
          tabs[i].activeClass = newClass
          tabs[i].icon = newClass === 'active' ? tabs[i].activeIcon : tabs[i].inactiveIcon
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
      that.setData({
        ready: true,
        tabs: buildTabs(0)
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
      }, 50)
    }
  }
})
