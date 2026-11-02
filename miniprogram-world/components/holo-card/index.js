var TILT = 16
var SHOWCASE_MS = 2600
var GLARE_IDLE = 'transform: translate(-12%, 8%);'

function clamp01(n) {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function tiltStyle(rotateX, rotateY) {
  return 'transform: rotateX(' + rotateX.toFixed(2) + 'deg) rotateY(' + rotateY.toFixed(2) + 'deg);'
}

/* glare-dot 是 200% 尺寸的圆盘，位移百分比作用在自身宽度上，所以 50 系数即可把光斑中心落到卡面坐标 */
function glareStyle(nx, ny) {
  var tx = (nx - 0.5) * 50
  var ty = (ny - 0.5) * 50
  return 'transform: translate(' + tx.toFixed(1) + '%, ' + ty.toFixed(1) + '%);'
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
    stateClass: '',
    tiltStyle: '',
    glareStyle: GLARE_IDLE
  },

  lifetimes: {
    attached: function () {
      this.setData({ stateClass: '', tiltStyle: '', glareStyle: GLARE_IDLE })
    },
    ready: function () {
      var self = this
      this.ensureRect(function () {
        self.showcase()
      })
    },
    detached: function () {
      this.cancelShowcase()
    }
  },

  pageLifetimes: {
    show: function () {
      this.ensureRect()
    }
  },

  methods: {
    rectValid: function () {
      return !!this._rect && this._rect.width > 4 && this._rect.height > 4
    },

    /** 取卡片位置；ready 时可能还没排好版，失败就短间隔重试，避免首次触摸没反应 */
    ensureRect: function (done, retries) {
      var self = this
      var left = typeof retries === 'number' ? retries : 2
      wx.createSelectorQuery()
        .in(this)
        .select('.holo')
        .boundingClientRect(function (rect) {
          if (rect && rect.width > 4 && rect.height > 4) {
            self._rect = rect
            if (typeof done === 'function') done()
            return
          }
          if (left > 0) {
            setTimeout(function () {
              self.ensureRect(done, left - 1)
            }, 120)
          }
        })
        .exec()
    },

    /** 按归一化坐标落点：倾斜 + 高光跟随（只写 transform，交给合成层） */
    paint: function (nx, ny) {
      var rotateY = (nx - 0.5) * TILT * 2
      var rotateX = (0.5 - ny) * TILT * 2
      this.setData({
        stateClass: 'is-active',
        tiltStyle: tiltStyle(rotateX, rotateY),
        glareStyle: glareStyle(nx, ny)
      })
    },

    applyTouch: function (touch) {
      if (!this.rectValid() || !touch) return
      var rect = this._rect
      this.paint(
        clamp01((touch.clientX - rect.left) / rect.width),
        clamp01((touch.clientY - rect.top) / rect.height)
      )
    },

    /** 进页面自动巡游一遍（对齐 H5 showcase）；高光巡游交给 CSS 动画，只切换一个类 */
    showcase: function () {
      var self = this
      if (this._showcased || this._touching) return
      this._showcased = true
      this.setData({ stateClass: 'is-showcase', tiltStyle: '', glareStyle: GLARE_IDLE })
      this._showcaseTimer = setTimeout(function () {
        self._showcaseTimer = null
        if (self._touching) return
        self.setData({ stateClass: '', tiltStyle: '', glareStyle: GLARE_IDLE })
      }, SHOWCASE_MS)
    },

    cancelShowcase: function () {
      if (this._showcaseTimer) {
        clearTimeout(this._showcaseTimer)
        this._showcaseTimer = null
      }
    },

    onTouchStart: function (e) {
      var self = this
      var touch = e && e.touches && e.touches[0]
      this._touching = true
      this.cancelShowcase()
      if (this.rectValid()) {
        this.applyTouch(touch)
        this.ensureRect()
        return
      }
      /* 还没拿到卡片位置：先给提亮反馈，拿到坐标后立即补倾斜 */
      this.setData({ stateClass: 'is-active' })
      this.ensureRect(function () {
        if (self._touching) self.applyTouch(touch)
      })
    },

    onTouchMove: function (e) {
      var touch = e && e.touches && e.touches[0]
      var now = Date.now()
      if (now - (this._lastApply || 0) < 40) return
      this._lastApply = now
      if (this.rectValid()) {
        this.applyTouch(touch)
        return
      }
      var self = this
      this.ensureRect(function () {
        self.applyTouch(touch)
      })
    },

    onTouchEnd: function () {
      if (!this._touching) return
      this._touching = false
      this.setData({ stateClass: '', tiltStyle: '', glareStyle: GLARE_IDLE })
    }
  }
})
