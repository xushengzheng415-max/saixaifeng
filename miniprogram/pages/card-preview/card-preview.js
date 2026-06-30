// pages/card-preview/card-preview.js
// 深色精美球员卡预览
Page({
  data: {
    playerData: {},
    backgroundUrl: '',
    avatarUrl: '',
    teamLogoUrl: '',
    cardImagePath: '',
    tier: 'bronze',
    tierName: '青铜'
  },

  onLoad(options) {
    if (options.identityCardId) {
      this.loadFromIdentityCard(options.identityCardId)
    }
  },

  async loadFromIdentityCard(cardId) {
    wx.showLoading({ title: '加载中...' })
    try {
      const db = wx.cloud.database()
      const res = await db.collection('identity_cards').doc(cardId).get()
      const card = res.data

      const points = card.participationPoints || 0
      const tier = points >= 1000 ? 'gold' : points >= 500 ? 'silver' : 'bronze'
      const tierNames = { gold: '黄金', silver: '白银', bronze: '青铜' }

      this.setData({
        playerData: {
          number: String(card.jerseyNumber || ''),
          name: card.nickname || '',
          jerseyName: card.jerseyName || '',
          position: card.position || '',
          height: card.height ? card.height + 'cm' : '',
          weight: card.weight ? card.weight + 'kg' : '',
          nationality: card.nationality || '中国'
        },
        avatarUrl: card.avatarUrl || '',
        teamLogoUrl: card.teamLogo || '',
        tier,
        tierName: tierNames[tier],
        _cardId: cardId
      })
    } catch (err) {
      console.error('加载失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
    wx.hideLoading()
  },

  // 生成卡片图片
  async generateCard() {
    wx.showLoading({ title: '生成中...' })
    try {
      const ctx = wx.createCanvasContext('playerCard')
      const { playerData, tier } = this.data

      // 绘制深色渐变背景
      this.drawDarkGradient(ctx, tier)

      // 绘制头像（如果有）
      if (this.data.avatarUrl) {
        try {
          const info = await this.getLocalPath(this.data.avatarUrl)
          if (info) {
            ctx.save()
            ctx.beginPath()
            ctx.arc(300, 220, 80, 0, 2 * Math.PI)
            ctx.closePath()
            ctx.clip()
            ctx.drawImage(info, 220, 140, 160, 160)
            ctx.restore()
          }
        } catch (e) {}
      }

      // 绘制文字
      ctx.setTextAlign('center')

      // 等级徽章
      const tierColors = { gold: '#FFD700', silver: '#C0C0C0', bronze: '#CD7F32' }
      ctx.setFillStyle(tierColors[tier] || tierColors.bronze)
      ctx.setFontSize(24)
      ctx.fillText(this.data.tierName, 300, 360)

      // 姓名
      if (playerData.name) {
        ctx.setFontSize(44)
        ctx.setFillStyle('#FFFFFF')
        ctx.fillText(playerData.name, 300, 420)
      }

      // 角色/位置
      if (playerData.position) {
        ctx.setFontSize(26)
        ctx.setFillStyle('rgba(255,255,255,0.7)')
        ctx.fillText(playerData.position, 300, 460)
      }

      // 号码
      if (playerData.number) {
        ctx.setFontSize(36)
        ctx.setFillStyle('#FFD700')
        ctx.fillText('#' + playerData.number, 300, 510)
      }

      // 数据网格
      ctx.setFontSize(22)
      ctx.setFillStyle('rgba(255,255,255,0.6)')

      const items = [
        { label: '球衣名', value: playerData.jerseyName || '-', x: 100, y: 570 },
        { label: '国籍', value: playerData.nationality || '中国', x: 300, y: 570 },
        { label: '身高', value: playerData.height || '-', x: 100, y: 610 },
        { label: '体重', value: playerData.weight || '-', x: 300, y: 610 }
      ]

      items.forEach(item => {
        ctx.setFillStyle('rgba(255,255,255,0.5)')
        ctx.fillText(item.label, item.x, item.y)
        ctx.setFillStyle('#FFFFFF')
        ctx.font = 'bold 22px sans-serif'
        ctx.fillText(item.value, item.x, item.y + 24)
        ctx.font = '22px sans-serif'
      })

      ctx.draw()

      setTimeout(() => {
        wx.canvasToTempFilePath({
          canvasId: 'playerCard',
          success: (res) => {
            this.setData({ cardImagePath: res.tempFilePath })
            wx.hideLoading()
            wx.showToast({ title: '生成成功', icon: 'success' })
          },
          fail: () => {
            wx.hideLoading()
            wx.showToast({ title: '生成失败', icon: 'none' })
          }
        })
      }, 500)

    } catch (err) {
      console.error('生成失败:', err)
      wx.hideLoading()
    }
  },

  // 绘制深色渐变背景
  drawDarkGradient(ctx, tier) {
    const colors = {
      gold: { start: '#1a1a2e', mid: '#2d2d5e', end: '#4a3a1e' },
      silver: { start: '#1a1a2e', mid: '#2d3d4e', end: '#4a5a6e' },
      bronze: { start: '#1a1a2e', mid: '#2e2420', end: '#4e3e2e' }
    }
    const c = colors[tier] || colors.bronze

    ctx.setFillStyle(c.start)
    ctx.fillRect(0, 0, 600, 700)

    // 简单模拟渐变
    ctx.setFillStyle(c.mid)
    ctx.fillRect(0, 200, 600, 300)

    ctx.setFillStyle(c.end)
    ctx.fillRect(0, 450, 600, 250)
  },

  // 获取本地图片路径
  getLocalPath(url) {
    return new Promise((resolve) => {
      if (!url) { resolve(null); return }
      if (url.startsWith('cloud://')) {
        wx.cloud.getTempFileURL({
          fileList: [url],
          success: (res) => {
            if (res.fileList[0].tempFileURL) {
              resolve(res.fileList[0].tempFileURL)
            } else { resolve(null) }
          },
          fail: () => resolve(null)
        })
      } else {
        resolve(url)
      }
    })
  },

  // 保存到相册
  saveCard() {
    if (!this.data.cardImagePath) {
      wx.showToast({ title: '请先生成卡片', icon: 'none' })
      return
    }
    wx.saveImageToPhotosAlbum({
      filePath: this.data.cardImagePath,
      success: () => wx.showToast({ title: '保存成功', icon: 'success' }),
      fail: () => wx.showToast({ title: '保存失败', icon: 'none' })
    })
  }
})
