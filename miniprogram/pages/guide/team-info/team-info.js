var workspace = require('../../../utils/workspace')

function isDevtools() { try { return wx.getSystemInfoSync().platform === 'devtools' } catch (error) { return false } }

Page({
  data: {
    teamName: '', shortName: '', divisionText: 'U12', divisionOptions: ['U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16'], city: '郑州市', ownerText: '', organizationName: '',
    crestPreview: '', hasCrest: false, originalLogo: '', transparentLogo: '', crestBusy: false, crestStateText: '', tempCrestPath: '', cropVisible: false, cropScale: 1, cropOffsetX: 0, cropOffsetY: 0, cropTouchX: 0, cropTouchY: 0, crestTransform: 'translate(0px, 0px) scale(1)', errorText: '', isSubmitting: false, localVisualQa: false
  },
  onLoad: function(options) {
    if (isDevtools() && options && options.visualQa === '1') {
      this.setData({ localVisualQa: true, teamName: '赛小蜂 U12 竞技队', shortName: '赛小蜂U12', divisionText: 'U12', city: '郑州市', ownerText: '许老师', organizationName: '赛小蜂足球俱乐部' })
      return
    }
    var context = workspace.readContext() || {}
    var current = context.currentWorkspace || {}
    var user = context.user || {}
    var draft = wx.getStorageSync('teamCreateDraft') || {}
    this.setData({ teamName: draft.teamName || '', shortName: draft.shortName || '', divisionText: draft.divisionText || 'U12', city: draft.city || '', crestPreview: draft.crestPreview || '', hasCrest: Boolean(draft.crestPreview), ownerText: user.nickName || '', organizationName: current.name || '' })
  },
  onNameInput: function(e) { this.setData({ teamName: String(e.detail.value || '').trim(), errorText: '' }) },
  onBack: function() {
    var pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
      return
    }
    wx.switchTab({ url: '/pages/teams/index' })
  },
  onShortNameInput: function(e) { this.setData({ shortName: String(e.detail.value || '').trim(), errorText: '' }) },
  onDivisionChange: function(e) { this.setData({ divisionText: this.data.divisionOptions[Number(e.detail.value || 4)] || 'U12', errorText: '' }) },
  onCityChange: function(e) { var values = e.detail.value || []; this.setData({ city: values[1] || '', errorText: '' }) },
  chooseCrest: function() {
    var that = this
    if (this.data.crestBusy) return
    wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: function(result) { var path = (result.tempFilePaths || [])[0]; if (path) that.setData({ tempCrestPath: path, cropVisible: true, cropScale: 1, cropOffsetX: 0, cropOffsetY: 0, crestTransform: 'translate(0px, 0px) scale(1)' }) } })
  },
  onCropScaleChange: function(event) { var scale = Number(event.detail.value || 100) / 100; this.setData({ cropScale: scale, crestTransform: 'translate(' + this.data.cropOffsetX + 'px, ' + this.data.cropOffsetY + 'px) scale(' + scale + ')' }) },
  onCropTouchStart: function(event) { var touch = (event.touches || [])[0] || {}; this.setData({ cropTouchX: touch.clientX || 0, cropTouchY: touch.clientY || 0 }) },
  onCropTouchMove: function(event) { var touch = (event.touches || [])[0] || {}; var x = Math.max(-96 * this.data.cropScale, Math.min(96 * this.data.cropScale, this.data.cropOffsetX + (touch.clientX || 0) - this.data.cropTouchX)); var y = Math.max(-96 * this.data.cropScale, Math.min(96 * this.data.cropScale, this.data.cropOffsetY + (touch.clientY || 0) - this.data.cropTouchY)); this.setData({ cropTouchX: touch.clientX || 0, cropTouchY: touch.clientY || 0, cropOffsetX: x, cropOffsetY: y, crestTransform: 'translate(' + x + 'px, ' + y + 'px) scale(' + this.data.cropScale + ')' }) },
  closeCrop: function() { this.setData({ cropVisible: false, tempCrestPath: '' }) },
  confirmCrop: function() {
    var that = this; var source = this.data.tempCrestPath; if (!source) return
    this.setData({ crestBusy: true, cropVisible: false, crestStateText: '正在裁剪并上传…' })
    wx.getImageInfo({ src: source, success: function(info) { var scale = Math.max(1, Number(that.data.cropScale || 1)); var side = Math.max(1, Math.floor(Math.min(info.width, info.height) / scale)); var shiftX = Math.floor((that.data.cropOffsetX || 0) * side / 250); var shiftY = Math.floor((that.data.cropOffsetY || 0) * side / 250); var sx = Math.max(0, Math.min(info.width - side, Math.floor((info.width - side) / 2) - shiftX)); var sy = Math.max(0, Math.min(info.height - side, Math.floor((info.height - side) / 2) - shiftY)); var context = wx.createCanvasContext('teamCrestCropCanvas', that); context.clearRect(0, 0, 600, 600); context.drawImage(source, sx, sy, side, side, 0, 0, 600, 600); context.draw(false, function() { wx.canvasToTempFilePath({ canvasId: 'teamCrestCropCanvas', width: 600, height: 600, destWidth: 600, destHeight: 600, fileType: 'png', quality: 1, success: function(cropped) { that.uploadAndProcessCrest(cropped.tempFilePath) }, fail: function() { that.uploadAndProcessCrest(source) } }, that) }) }, fail: function() { that.uploadAndProcessCrest(source) } })
  },
  uploadAndProcessCrest: function(path) {
    var that = this; var cloudPath = 'team-logos/original/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.png'
    wx.cloud.uploadFile({ cloudPath: cloudPath, filePath: path, success: function(uploaded) { var original = uploaded.fileID || ''; that.setData({ originalLogo: original, crestPreview: path, hasCrest: true, crestStateText: '正在生成透明队徽…' }); wx.cloud.callFunction({ name: 'imageProcess', data: { action: 'removeBackground', imageUrl: original }, success: function(response) { var result = response.result || {}; var transparent = result.success && result.processedUrl && result.processedUrl !== original ? result.processedUrl : ''; that.setData({ transparentLogo: transparent, crestStateText: transparent ? '已完成裁剪与透明抠图' : '裁剪完成，将保留原图' }) }, fail: function() { that.setData({ crestStateText: '裁剪完成，将保留原图' }) }, complete: function() { that.setData({ crestBusy: false }) } }) }, fail: function() { that.setData({ crestBusy: false, crestStateText: '队徽上传失败，请重新选择' }) } })
  },
  saveDraftAndContinue: function() {
    if (this.data.teamName.length < 2) return this.setData({ errorText: '请输入 2—30 个字的球队名称' })
    if (!this.data.shortName) return this.setData({ errorText: '请输入球队简称' })
    if (!this.data.city) return this.setData({ errorText: '请选择所在城市' })
    if (this.data.crestBusy) return this.setData({ errorText: '队徽正在处理，请稍候' })
    wx.setStorageSync('teamCreateDraft', { teamName: this.data.teamName, shortName: this.data.shortName, divisionText: this.data.divisionText, city: this.data.city, crestPreview: this.data.crestPreview, originalLogo: this.data.originalLogo, transparentLogo: this.data.transparentLogo })
    wx.navigateTo({ url: '/pages/onboarding/onboarding?scene=team&step=team&fromTeamDraft=1' })
  }
})
