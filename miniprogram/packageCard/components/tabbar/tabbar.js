Component({
  properties: {
    active: { type: String, value: 'main' }
  },
  data: {
    mainOn: 'is-on',
    albumOn: '',
    lineupOn: ''
  },
  observers: {
    active: function (v) {
      this.setData({
        mainOn: v === 'main' ? 'is-on' : '',
        albumOn: v === 'album' ? 'is-on' : '',
        lineupOn: v === 'lineup' ? 'is-on' : ''
      })
    }
  },
  methods: {
    go: function (e) {
      var tab = e.currentTarget.dataset.tab
      if (!tab || tab === this.data.active) return
      var map = {
        main: '/packageCard/pages/main/main',
        album: '/packageCard/pages/album-sign/album-sign',
        lineup: '/packageCard/pages/lineup/lineup'
      }
      wx.redirectTo({ url: map[tab] })
    }
  }
})
