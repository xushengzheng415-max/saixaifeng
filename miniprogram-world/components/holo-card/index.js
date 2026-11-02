var TILT = 16
var SHINE_IDLE = 0.3
var SHINE_ACTIVE = 0.62
var GLARE_IDLE = 0.42
var GLARE_ACTIVE = 0.62
var SWEEP_MS = 3600
var SWEEP_STEP = 70

function clamp01(n) {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function tiltStyle(rotateX, rotateY) {
  return 'transform: rotateX(' + rotateX.toFixed(2) + 'deg) rotateY(' + rotateY.toFixed(2) + 'deg);'
}

function glareStyle(x, y, opacity) {
  return (
    'background-image: radial-gradient(circle at ' + x + '% ' + y + '%, ' +
    'rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0.18) 34%, rgba(255, 255, 255, 0) 64%);' +
    'background-size: 100% 100%;' +
    'background-repeat: no-repeat;' +
    'opacity: ' + opacity + ';'
  )
}

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
      value: '全息箔光循环扫过 · 按住卡面滑动可带动光斑'
    }
  },

  data: {
    tiltStyle: '',
    shineStyle: 'opacity: ' + SHINE_IDLE + ';',
    rainStyle: '',
    glareStyle: glareStyle(50, 38, GLARE_IDLE),
    activeClass: ''
  },

  lifetimes: {
    attached: function () {
      this.toIdle()
    },
    ready: function () {
      var self = this
      this.toIdle()
      this.measure(function () {
        self.showcase()
      })
    },
    detached: function () {
      if (this._loopTimer) {
        clearInterval(this._loopTimer)
        this._loopTimer = null
      }
    }
  },

  methods: {
    measure: function (done) {
      var self = this
      wx.createSelectorQuery()
        .in(this)
        .select('.holo')
        .boundingClientRect(function (rect) {
          if (rect && rect.width && rect.height) self._rect = rect
          if (typeof done === 'function') done()
        })
        .exec()
    },

    /** 回到空闲：清空内联 transform 交回 CSS 轻摆，箔光与扫光继续循环 */
    toIdle: function () {
      this.setData({
        activeClass: '',
        tiltStyle: '',
        shineStyle: 'opacity: ' + SHINE_IDLE + ';',
        rainStyle: '',
        glareStyle: glareStyle(50, 38, GLARE_IDLE)
      })
    },

    /** 按归一化坐标落点：倾斜 + 箔光增强 + 彩虹与镜面光跟随 */
    paint: function (nx, ny) {
      var rotateY = (nx - 0.5) * TILT * 2
      var rotateX = (0.5 - ny) * TILT * 2
      var x = Math.round(nx * 100)
      var y = Math.round(ny * 100)
      this.setData({
        activeClass: 'is-active',
        tiltStyle: tiltStyle(rotateX, rotateY),
        shineStyle: 'opacity: ' + SHINE_ACTIVE + ';',
        rainStyle: 'background-position: ' + x + '% ' + y + '%;',
        glareStyle: glareStyle(x, y, GLARE_ACTIVE)
      })
    },

    /** 进页面时自动扫一遍（对齐 H5 showcase），端上一定能看到动效 */
    showcase: function () {
      var self = this
      if (!this._rect) return
      if (this._loopTimer) clearInterval(this._loopTimer)
      var start = Date.now()
      this._loopTimer = setInterval(function () {
        var p = (Date.now() - start) / SWEEP_MS
        if (p >= 1) {
          clearInterval(self._loopTimer)
          self._loopTimer = null
          self.toIdle()
          return
        }
        var ang = p * Math.PI * 4
        self.paint(
          clamp01(0.5 + Math.cos(ang) * 0.42),
          clamp01(0.5 + Math.sin(ang * 0.85) * 0.36)
        )
      }, SWEEP_STEP)
    },

    stopShowcase: function () {
      if (this._loopTimer) {
        clearInterval(this._loopTimer)
        this._loopTimer = null
      }
    },

    onTouchStart: function (e) {
      this._touching = true
      this.stopShowcase()
      this.measure()
      this.applyFromEvent(e)
    },

    onTouchMove: function (e) {
      var now = Date.now()
      if (now - (this._lastApply || 0) < 32) return
      this._lastApply = now
      this.applyFromEvent(e)
    },

    onTouchEnd: function () {
      if (!this._touching) return
      this._touching = false
      this.toIdle()
    },

    applyFromEvent: function (e) {
      var rect = this._rect
      var touch = e && e.touches && e.touches[0]
      if (!rect || !touch) return
      this.paint(
        clamp01((touch.clientX - rect.left) / rect.width),
        clamp01((touch.clientY - rect.top) / rect.height)
      )
    }
  }
})
