// custom-tab-bar/index.js
// 赛小蜂 - 机构工作空间五中心导航
var workspace = require('../utils/workspace')
function isOrganizerView() {
  return workspace.hasAuthenticatedUser() && workspace.getPortalRole(workspace.readContext()) === 'organizer'
}
var WORKSPACE_TABS = [
  { id: 'home', text: '首页', icon: '/images/runtime/icons/brand-v1-tab-home.png', activeIcon: '/images/runtime/icons/brand-v1-tab-home.png', path: '/pages/home/home' },
  { id: 'event', text: '赛事', icon: '/images/runtime/icons/brand-v1-tab-event.png', activeIcon: '/images/runtime/icons/brand-v1-tab-event.png', path: '/pages/event/index' },
  { id: 'team', text: '球队', icon: '/images/runtime/icons/brand-v1-tab-team.png', activeIcon: '/images/runtime/icons/brand-v1-tab-team.png', path: '/pages/teams/index' },
  { id: 'discover', text: '发现', icon: '/images/runtime/icons/brand-v1-tab-discover.png', activeIcon: '/images/runtime/icons/brand-v1-tab-discover.png', path: '/pages/discover/discover' },
  { id: 'profile', text: '我的', icon: '/images/runtime/icons/brand-v1-tab-profile.png', activeIcon: '/images/runtime/icons/brand-v1-tab-profile.png', path: '/pages/profile/profile' }
]
function buildTabs(selectedIndex) {
  var tabs = WORKSPACE_TABS
  var sel = selectedIndex !== undefined ? selectedIndex : 0
  var organizer = isOrganizerView()
  return tabs.map(function(tab, idx) {
    var disabled = tab.id === 'team' && organizer
    var active = idx === sel && !disabled
    return {
      id: tab.id,
      text: tab.text,
      icon: active ? tab.activeIcon : tab.icon,
      activeIcon: tab.activeIcon,
      inactiveIcon: tab.icon,
      path: tab.path,
      activeClass: active ? 'active' : '',
      disabled: disabled,
      disabledClass: disabled ? 'disabled' : ''
    }
  })
}

Component({
  data: {
    selected: 0,
    tabs: [],
    ready: false,
    overlayHidden: false,
    visible: false
  },

  methods: {
    setOverlayHidden: function(hidden) {
      this.setData({ overlayHidden: Boolean(hidden), visible: this.data.ready && !hidden })
    },
    // 切换 tab
    switchTab: function(e) {
      var index = e.currentTarget.dataset.index
      var tab = this.data.tabs[index]
      if (!tab) return
      if (tab.id === 'team' && isOrganizerView()) {
        this.syncSelected()
        wx.showToast({ title: '请在“我的”切换球队身份', icon: 'none' })
        return
      }
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
      var tabs = buildTabs(selectedIndex)
      if (selectedIndex !== this.data.selected || JSON.stringify(tabs) !== JSON.stringify(this.data.tabs)) this.setData({ selected: selectedIndex, tabs: tabs })
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
        visible: !that.data.overlayHidden,
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
