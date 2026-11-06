Component({
  properties: {
    visible: { type: Boolean, value: false }
  },
  data: {
    step: 0,
    steps: [
      {
        icon: '⚽',
        title: '记一场',
        desc: '现场即时记分，60 秒记完一场，支持换人、红黄牌、点球'
      },
      {
        icon: '📋',
        title: '发起比赛',
        desc: '报名 + 签到 + 战报一条龙，对手扫码直接进小程序报名'
      },
      {
        icon: '🏟️',
        title: '我的主场',
        desc: '保存常用球场和定位，发起邀约时自动带入，对手一键导航'
      }
    ]
  },
  observers: {
    'visible': function (visible) {
      if (visible) this.setData({ step: 0 })
    }
  },
  methods: {
    next: function () {
      var step = this.data.step + 1
      if (step >= this.data.steps.length) this.close()
      else this.setData({ step: step })
    },
    close: function () {
      this.setData({ step: 0 })
      this.triggerEvent('close')
    }
  }
})
