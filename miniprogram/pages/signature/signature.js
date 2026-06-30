// pages/signature/signature.js
const app = getApp()
let canvasCtx = null
let canvasWidth = 0
let canvasHeight = 0
let isDrawing = false
let lastX = 0
let lastY = 0

Page({
  data: {
    matchId: '',
    userId: '',
    matchInfo: null,
    signatureData: '',   // 预览图片 base64
    hasSigned: false,
    submitting: false,
    submitted: false
  },

  onLoad(options) {
    let matchId = ''
    let userId = ''

    // 正常跳转：options 直接带参数
    if (options.matchId) {
      matchId = options.matchId
      userId = options.userId || ''
    }
    // 扫码启动：参数在 scene 里，格式 "mid=xxx&uid=xxx"
    else if (options.scene) {
      const sceneStr = decodeURIComponent(options.scene)
      const params = {}
      sceneStr.split('&').forEach(pair => {
        const [k, v] = pair.split('=')
        params[k] = v
      })
      matchId = params.mid || ''
      userId = params.uid || ''
    }

    this.setData({ matchId, userId })
    if (matchId) {
      this.loadMatchInfo(matchId)
    }
  },

  onReady() {
    this.initCanvas()
  },

  // 初始化 Canvas 2D
  initCanvas() {
    const query = wx.createSelectorQuery()
    query.select('#signatureCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0]) return
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getWindowInfo().pixelRatio
        canvas.width = res[0].width * dpr
        canvas.height = res[0].height * dpr
        ctx.scale(dpr, dpr)
        // 白色背景
        ctx.fillStyle = '#fafafa'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        // 虚线提示
        ctx.setLineDash([6, 4])
        ctx.strokeStyle = '#ccc'
        ctx.lineWidth = 1
        ctx.beginPath()
        const midY = (res[0].height * dpr) / 2
        ctx.moveTo(40, midY)
        ctx.lineTo(res[0].width * dpr - 40, midY)
        ctx.stroke()
        ctx.setLineDash([])
        canvasCtx = ctx
        canvasWidth = res[0].width
        canvasHeight = res[0].height
        this._canvas = canvas
      })
  },

  // 加载比赛信息
  async loadMatchInfo(matchId) {
    const db = wx.cloud.database()
    try {
      const res = await db.collection('matches').doc(matchId).get()
      const match = res.data
      // 获取赛事名称
      let tournamentName = ''
      if (match.tournamentId) {
        const tRes = await db.collection('tournaments').doc(match.tournamentId).get()
        tournamentName = tRes.data.name || ''
      }
      this.setData({
        matchInfo: {
          homeTeam: match.homeTeamName || '',
          awayTeam: match.awayTeamName || '',
          tournamentName: tournamentName,
          round: match.round || ''
        }
      })
    } catch (err) {
      console.error('加载比赛信息失败', err)
    }
  },

  // 触摸开始
  onTouchStart(e) {
    if (this.data.submitted) return
    const touch = e.touches[0]
    isDrawing = true
    lastX = touch.x
    lastY = touch.y
    this.setData({ hasSigned: true })
  },

  // 触摸移动
  onTouchMove(e) {
    if (!isDrawing || !canvasCtx) return
    const touch = e.touches[0]
    canvasCtx.strokeStyle = '#1B5E20'
    canvasCtx.lineWidth = 3
    canvasCtx.lineCap = 'round'
    canvasCtx.lineJoin = 'round'
    canvasCtx.beginPath()
    canvasCtx.moveTo(lastX, lastY)
    canvasCtx.lineTo(touch.x, touch.y)
    canvasCtx.stroke()
    lastX = touch.x
    lastY = touch.y
  },

  // 触摸结束
  onTouchEnd() {
    isDrawing = false
  },

  // 清除签名
  clearSignature() {
    if (!canvasCtx || !this._canvas) return
    const dpr = wx.getWindowInfo().pixelRatio
    canvasCtx.fillStyle = '#fafafa'
    canvasCtx.fillRect(0, 0, this._canvas.width, this._canvas.height)
    // 重绘虚线
    canvasCtx.setLineDash([6, 4])
    canvasCtx.strokeStyle = '#ccc'
    canvasCtx.lineWidth = 1
    canvasCtx.beginPath()
    const midY = canvasHeight * dpr / 2
    canvasCtx.moveTo(40, midY)
    canvasCtx.lineTo(canvasWidth * dpr - 40, midY)
    canvasCtx.stroke()
    canvasCtx.setLineDash([])
    this.setData({ hasSigned: false, signatureData: '' })
  },

  // 提交签名
  async submitSignature() {
    if (!this.data.hasSigned) {
      wx.showToast({ title: '请先签字', icon: 'none' })
      return
    }
    if (this.data.submitting) return
    this.setData({ submitting: true })

    try {
      // 1. 导出 canvas 为临时图片
      const tempFilePath = await this.canvasToTempFile()
      if (!tempFilePath) {
        wx.showToast({ title: '生成签名失败', icon: 'none' })
        this.setData({ submitting: false })
        return
      }

      // 2. 上传到云存储
      const cloudPath = `signatures/${this.data.matchId}_${Date.now()}.png`
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: tempFilePath
      })

      // 3. 调用云函数保存签名记录
      await wx.cloud.callFunction({
        name: 'saveSignature',
        data: {
          matchId: this.data.matchId,
          userId: this.data.userId,
          signatureFileID: uploadRes.fileID,
          signTime: new Date()
        }
      })

      this.setData({ submitted: true, submitting: false })
      wx.showToast({ title: '签字成功', icon: 'success' })

      // 3秒后自动关闭
      setTimeout(() => {
        wx.navigateBack({ delta: 1 })
      }, 3000)
    } catch (err) {
      console.error('提交签名失败', err)
      wx.showToast({ title: '提交失败: ' + (err.errMsg || err.message), icon: 'none' })
      this.setData({ submitting: false })
    }
  },

  // Canvas 导出为临时文件
  canvasToTempFile() {
    return new Promise((resolve, reject) => {
      if (!this._canvas) {
        reject(new Error('Canvas not ready'))
        return
      }
      wx.canvasToTempFilePath({
        canvas: this._canvas,
        fileType: 'png',
        quality: 1,
        success: (res) => resolve(res.tempFilePath),
        fail: (err) => reject(err)
      })
    })
  }
})
