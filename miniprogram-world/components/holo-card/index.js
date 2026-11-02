var TILT = 16
var IDLE_SHINE = 0.26
var IDLE_GLARE = 0.4
var ACTIVE_SHINE = 0.54
var ACTIVE_GLARE = 0.56
var COSMOS_MIDDLE = '/assets/card/cosmos/cosmos-middle-trans.jpg'

/* 空闲时清空内联 transform，交回 CSS 的 holoSway 轻摆动画（对齐 H5 cosmos-idle-tilt） */
var IDLE_TILT = ''

Component({
  properties: {
    cardUrl: {
      type: String,
      value: ''
    },
    ariaLabel: {
      type: String,
      value: '球员卡'
    },
    tipText: {
      type: String,
      value: '轻彩箔光已默认循环 · 按住卡面滑动略加强'
    }
  },

  data: {
    tiltStyle: IDLE_TILT,
    shineStyle: '',
    glareStyle: '',
    grabbingClass: ''
  },

  lifetimes: {
    attached: function () {
      this.syncIdleStyles()
    },
    ready: function () {
      this.syncIdleStyles()
      this.measure()
    }
  },

  observers: {
    cardUrl: function () {
      this.syncIdleStyles()
    }
  },

  methods: {
    /** 用卡面图本身做遮罩，箔光只落在卡形内（对齐 H5 的 --card-mask） */
    maskStyle: function () {
      var url = this.data.cardUrl || ''
      if (!url) return ''
      return (
        '-webkit-mask-image: url("' + url + '");' +
        '-webkit-mask-size: 100% 100%;' +
        '-webkit-mask-repeat: no-repeat;' +
        '-webkit-mask-position: center 50%;' +
        'mask-image: url("' + url + '");' +
        'mask-size: 100% 100%;' +
        'mask-repeat: no-repeat;' +
        'mask-position: center 50%;'
      )
    },

    glareBackground: function (x, y) {
      return (
        'background-image: url("' + COSMOS_MIDDLE + '"), radial-gradient(circle at ' + x + '% ' + y + '%, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0) 60%);' +
        'background-size: 100% 100%, 100% 100%;' +
        'background-position: 50% 50%, ' + x + '% ' + y + '%;' +
        'background-repeat: no-repeat, no-repeat;'
      )
    },

    syncIdleStyles: function () {
      var mask = this.maskStyle()
      this.setData({
        shineStyle: 'opacity: ' + IDLE_SHINE + ';' + mask,
        glareStyle: this.glareBackground(50, 38) + 'opacity: ' + IDLE_GLARE + ';' + mask
      })
    },

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
      this.setData({ grabbingClass: 'is-grabbing' })
      this.applyPoint(e)
    },

    onTouchMove: function (e) {
      var now = Date.now()
      if (now - (this._lastApply || 0) < 32) return
      this._lastApply = now
      this.applyPoint(e)
    },

    onTouchEnd: function () {
      if (!this._touching) return
      this._touching = false
      var mask = this.maskStyle()
      this.setData({
        grabbingClass: '',
        tiltStyle: IDLE_TILT,
        shineStyle: 'opacity: ' + IDLE_SHINE + ';' + mask,
        glareStyle: this.glareBackground(50, 38) + 'opacity: ' + IDLE_GLARE + ';' + mask
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

      var rotateY = (px - 0.5) * TILT * 2
      var rotateX = (0.5 - py) * TILT * 2
      var x = Math.round(px * 100)
      var y = Math.round(py * 100)
      var mask = this.maskStyle()

      this.setData({
        tiltStyle: 'transform: rotateX(' + rotateX.toFixed(2) + 'deg) rotateY(' + rotateY.toFixed(2) + 'deg);',
        shineStyle: 'opacity: ' + ACTIVE_SHINE + '; background-position: 50% 50%, 50% 50%, ' + x + '% ' + y + '%;' + mask,
        glareStyle: this.glareBackground(x, y) + 'opacity: ' + ACTIVE_GLARE + ';' + mask
      })
    }
  }
})
