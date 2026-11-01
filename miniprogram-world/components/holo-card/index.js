Component({
  properties: {
    cardUrl: {
      type: String,
      value: ''
    },
    ariaLabel: {
      type: String,
      value: '球员卡'
    }
  },

  data: {
    tiltStyle: 'transform: rotateX(0deg) rotateY(0deg);',
    glareStyle: 'background: radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.10), rgba(255, 255, 255, 0) 62%);',
    foilStyle: 'background-position: 50% 50%, 50% 50%;',
    touchingClass: ''
  },

  lifetimes: {
    ready: function () {
      this.measure()
    }
  },

  methods: {
    measure: function () {
      var self = this
      wx.createSelectorQuery()
        .in(this)
        .select('.holo')
        .boundingClientRect(function (rect) {
          if (rect && rect.width && rect.height) self._rect = rect
        })
        .exec()
    },

    onTouchStart: function (e) {
      this._touching = true
      this.measure()
      this.setData({ touchingClass: 'is-touching' })
      this.applyPoint(e)
    },

    onTouchMove: function (e) {
      var now = Date.now()
      if (now - (this._lastApply || 0) < 40) return
      this._lastApply = now
      this.applyPoint(e)
    },

    onTouchEnd: function () {
      if (!this._touching) return
      this._touching = false
      this.setData({
        touchingClass: '',
        tiltStyle: 'transform: rotateX(0deg) rotateY(0deg);',
        foilStyle: 'background-position: 50% 50%, 50% 50%;',
        glareStyle: 'background: radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.10), rgba(255, 255, 255, 0) 62%);'
      })
    },

    applyPoint: function (e) {
      var rect = this._rect
      var touch = e && e.touches && e.touches[0]
      if (!rect || !touch) return
      var px = (touch.clientX - rect.left) / rect.width
      var py = (touch.clientY - rect.top) / rect.height
      px = Math.max(0, Math.min(1, px))
      py = Math.max(0, Math.min(1, py))

      var rotateY = (px - 0.5) * 16
      var rotateX = (0.5 - py) * 16
      var x = Math.round(px * 100)
      var y = Math.round(py * 100)

      this.setData({
        tiltStyle: 'transform: rotateX(' + rotateX.toFixed(2) + 'deg) rotateY(' + rotateY.toFixed(2) + 'deg);',
        glareStyle: 'background: radial-gradient(circle at ' + x + '% ' + y + '%, rgba(255, 255, 255, 0.45), rgba(255, 255, 255, 0) 58%);',
        foilStyle: 'background-position: ' + x + '% ' + y + '%, ' + (100 - y) + '% ' + (100 - x) + '%;'
      })
    }
  }
})
