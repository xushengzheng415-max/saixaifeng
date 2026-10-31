Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    card: {
      type: Object,
      value: {}
    },
    quotaText: {
      type: String,
      value: ''
    },
    cityText: {
      type: String,
      value: ''
    }
  },

  data: {
    backUrl: '/assets/card/card-back.jpg',
    revealed: false,
    revealedClass: ''
  },

  observers: {
    visible: function (visible) {
      if (visible) {
        this.resetReveal()
      } else {
        this.clearTimer()
      }
    }
  },

  lifetimes: {
    detached: function () {
      this.clearTimer()
    }
  },

  methods: {
    clearTimer: function () {
      if (this._timer) {
        clearTimeout(this._timer)
        this._timer = null
      }
    },

    resetReveal: function () {
      var self = this
      this.clearTimer()
      this.setData({ revealed: false, revealedClass: '' })
      this._timer = setTimeout(function () {
        self._timer = null
        self.revealNow()
      }, 700)
    },

    revealNow: function () {
      if (this.data.revealed) return
      this.clearTimer()
      this.setData({ revealed: true, revealedClass: 'is-revealed' })
    },

    onTapCard: function () {
      this.revealNow()
    },

    onClose: function () {
      this.triggerEvent('close')
    },

    onLineup: function () {
      this.triggerEvent('lineup')
    },

    onAgain: function () {
      this.triggerEvent('again')
    }
  }
})
