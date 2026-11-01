Component({
  properties: {
    current: {
      type: String,
      value: 'main'
    }
  },

  data: {
    tabs: []
  },

  observers: {
    current: function () {
      this.buildTabs()
    }
  },

  lifetimes: {
    attached: function () {
      this.buildTabs()
    }
  },

  methods: {
    buildTabs: function () {
      var current = this.data.current
      var defs = [
        {
          id: 'main',
          text: '主卡',
          url: '/pages/card/main/main',
          icon: '/assets/icons/tab-card.svg',
          activeIcon: '/assets/icons/tab-card-active.svg'
        },
        {
          id: 'album',
          text: '卡册',
          url: '/pages/card/album-sign/album-sign',
          icon: '/assets/icons/tab-album.svg',
          activeIcon: '/assets/icons/tab-album-active.svg'
        },
        {
          id: 'lineup',
          text: '组阵',
          url: '/pages/card/lineup/lineup',
          icon: '/assets/icons/tab-pitch.svg',
          activeIcon: '/assets/icons/tab-pitch-active.svg'
        }
      ]
      var tabs = defs.map(function (item) {
        var active = item.id === current
        return {
          id: item.id,
          text: item.text,
          url: item.url,
          icon: active ? item.activeIcon : item.icon,
          activeClass: active ? 'is-active' : ''
        }
      })
      this.setData({ tabs: tabs })
    },

    onTap: function (e) {
      var id = e.currentTarget.dataset.id
      var url = e.currentTarget.dataset.url
      if (!url || id === this.data.current) return
      wx.redirectTo({ url: url })
    }
  }
})
