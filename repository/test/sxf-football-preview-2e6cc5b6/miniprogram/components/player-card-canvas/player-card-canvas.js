// miniprogram/components/player-card-canvas/player-card-canvas.js
// Canvas 手绘球员卡组件 - 替代 Painter 方案
// 直接在微信小程序 Canvas 上绘制卡片，无需 npm 依赖

Component({
  properties: {
    // 球员数据
    playerData: {
      type: Object,
      value: {}
    },
    // 卡片等级
    tier: {
      type: String,
      value: 'bronze'  // bronze | silver | gold
    },
    // 卡片背景（云存储地址）
    backgroundUrl: {
      type: String,
      value: ''
    },
    // 头像（云存储地址）
    avatarUrl: {
      type: String,
      value: ''
    },
    // 队徽（云存储地址）
    teamLogoUrl: {
      type: String,
      value: ''
    }
  },

  data: {
    canvasWidth: 846,   // rpx -> px (375基准)
    canvasHeight: 1264,
    ready: false,
    renderedImagePath: ''
  },

  lifetimes: {
    attached() {
      this.initCanvas()
    }
  },

  methods: {
    // 初始化画布
    initCanvas() {
      const info = wx.getSystemInfoSync()
      const screenWidth = info.windowWidth
      const scale = screenWidth / 750  // 750rpx 基准

      this.setData({
        canvasWidth: Math.floor(423 * scale * 2),   // 423rpx -> px
        canvasHeight: Math.floor(632 * scale * 2)
      })

      // 延迟确保组件渲染完成
      setTimeout(() => {
        this.renderCard()
      }, 100)
    },

    // 渲染卡片
    async renderCard() {
      const { playerData, tier, backgroundUrl, avatarUrl, teamLogoUrl } = this.data

      wx.showLoading({ title: '生成中...' })

      try {
        // 1. 创建离屏 Canvas
        const ctx = wx.createCanvasContext('playerCardCanvas', this)

        // 2. 绘制背景
        if (backgroundUrl) {
          await this.drawBackground(ctx, backgroundUrl)
        } else {
          // 无背景时绘制渐变底色
          this.drawGradientBackground(ctx, tier)
        }

        // 3. 绘制球员头像（抠图效果用遮罩模拟）
        if (avatarUrl) {
          await this.drawAvatar(ctx, avatarUrl)
        }

        // 4. 绘制队徽
        if (teamLogoUrl) {
          await this.drawTeamLogo(ctx, teamLogoUrl)
        }

        // 5. 绘制文字
        this.drawTexts(ctx, playerData, tier)

        // 6. 绘制国旗
        this.drawFlag(ctx, playerData.nationality || '中国')

        ctx.draw()

        // 7. 导出图片
        setTimeout(() => {
          this.exportImage()
        }, 300)

      } catch (err) {
        console.error('渲染失败:', err)
        wx.hideLoading()
        wx.showToast({ title: '生成失败', icon: 'none' })
      }
    },

    // 绘制渐变背景
    drawGradientBackground(ctx, tier) {
      const colors = {
        bronze: ['#8B4513', '#CD7F32', '#DEB887'],
        silver: ['#696969', '#A9A9A9', '#C0C0C0'],
        gold: ['#B8860B', '#FFD700', '#FFA500']
      }
      const c = colors[tier] || colors.bronze

      const w = this.data.canvasWidth
      const h = this.data.canvasHeight

      // 渐变
      ctx.beginPath()
      const gradient = ctx.createLinearGradient(0, 0, w, h)
      gradient.addColorStop(0, c[0])
      gradient.addColorStop(0.5, c[1])
      gradient.addColorStop(1, c[2])
      ctx.setFillStyle(gradient)
      ctx.fillRect(0, 0, w, h)
    },

    // 绘制背景图片
    drawBackground(ctx, url) {
      return new Promise((resolve, reject) => {
        ctx.drawImage(url, 0, 0, this.data.canvasWidth, this.data.canvasHeight, {
          success: resolve,
          fail: reject
        })
      })
    },

    // 绘制球员头像
    drawAvatar(ctx, url) {
      return new Promise((resolve) => {
        const w = this.data.canvasWidth
        const h = this.data.canvasHeight

        // 头像位置和大小（基于1696x2528模板比例）
        const avatarW = Math.floor(w * 0.4)
        const avatarH = Math.floor(avatarW * 1.3)
        const avatarX = Math.floor(w * 0.5)
        const avatarY = Math.floor(h * 0.08)

        ctx.save()
        ctx.beginPath()
        ctx.rect(avatarX, avatarY, avatarW, avatarH)
        ctx.clip()
        ctx.drawImage(url, avatarX, avatarY, avatarW, avatarH, {
          success: () => { ctx.restore(); resolve() },
          fail: () => { ctx.restore(); resolve() }
        })
      })
    },

    // 绘制队徽
    drawTeamLogo(ctx, url) {
      return new Promise((resolve) => {
        const w = this.data.canvasWidth
        const h = this.data.canvasHeight

        const logoSize = Math.floor(w * 0.13)
        const logoX = Math.floor(w * 0.06)
        const logoY = Math.floor(h * 0.37)

        ctx.drawImage(url, logoX, logoY, logoSize, logoSize, {
          success: resolve,
          fail: resolve
        })
      })
    },

    // 绘制国旗
    drawFlag(ctx, country) {
      const w = this.data.canvasWidth
      const h = this.data.canvasHeight

      const flagW = Math.floor(w * 0.09)
      const flagH = Math.floor(flagW * 0.67)
      const flagX = Math.floor(w * 0.06)
      const flagY = Math.floor(h * 0.49)

      // 国旗底色
      ctx.setFillStyle('#E53935') // 中国红
      ctx.fillRect(flagX, flagY, flagW, flagH)

      // 五角星（简化版）
      ctx.setFillStyle('#FFEB3B') // 黄色
      const starSize = flagW * 0.15
      this.drawStar(ctx, flagX + starSize * 1.5, flagY + starSize * 1.5, starSize)
    },

    // 画五角星
    drawStar(ctx, cx, cy, size) {
      ctx.beginPath()
      for (let i = 0; i < 5; i++) {
        const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2
        const x = cx + size * Math.cos(angle)
        const y = cy + size * Math.sin(angle)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.setFillStyle('#FFEB3B')
      ctx.fill()
    },

    // 绘制文字
    drawTexts(ctx, player, tier) {
      const w = this.data.canvasWidth
      const h = this.data.canvasHeight

      // 文字颜色（根据卡片等级）
      const textColor = '#FFFFFF'
      const accentColor = tier === 'gold' ? '#FFD700' : '#FFFFFF'

      // 号码（超大）
      ctx.setFontSize(200)
      ctx.setFillStyle(textColor)
      ctx.setTextAlign('left')
      const number = player.jerseyNumber || player.number || ''
      ctx.fillText(String(number), w * 0.04, h * 0.12)

      // 位置
      ctx.setFontSize(52)
      ctx.fillText(player.position || '', w * 0.06, h * 0.26)

      // 球员姓名（大字）
      ctx.setFontSize(90)
      ctx.setFillStyle(textColor)
      ctx.fillText(player.name || '', w * 0.06, h * 0.33)

      // 球衣名
      ctx.setFontSize(42)
      ctx.setFillStyle('rgba(255,255,255,0.85)')
      ctx.fillText(player.jerseyName || '', w * 0.06, h * 0.40)

      // 国籍
      ctx.setFontSize(42)
      ctx.setFillStyle(textColor)
      ctx.fillText(player.nationality || '中国', w * 0.17, h * 0.54)

      // 身高
      ctx.setFontSize(38)
      ctx.fillText(`身高: ${player.height || '--'}cm`, w * 0.06, h * 0.60)

      // 体重
      ctx.fillText(`体重: ${player.weight || '--'}kg`, w * 0.06, h * 0.64)

      // 籍贯
      ctx.setFontSize(30)
      ctx.setFillStyle('rgba(255,255,255,0.7)')
      const nativePlace = player.nativePlace || [player.province, player.city, player.district].filter(Boolean).join('')
      ctx.fillText(nativePlace || '', w * 0.06, h * 0.68)
    },

    // 导出图片
    exportImage() {
      wx.canvasToTempFilePath({
        canvasId: 'playerCardCanvas',
        canvasType: '2d',
        success: (res) => {
          this.setData({ renderedImagePath: res.tempFilePath })
          this.triggerEvent('success', { path: res.tempFilePath })
          wx.hideLoading()
        },
        fail: (err) => {
          console.error('导出失败:', err)
          wx.hideLoading()
          wx.showToast({ title: '导出失败', icon: 'none' })
        }
      }, this)
    },

    // 外部调用：重新渲染
    rerender() {
      this.renderCard()
    }
  }
})
