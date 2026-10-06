// pages/guide/team-info.js
Page({
  _updateLens: function() {
    var data = this.data;
    var _desc = data.description ? data.description.length : 0;
    if (this.data.DescriptionLen !== _desc) { this.setData({ 'DescriptionLen': _desc}); }
  },

  data: {
    teamName: '',
    establishmentDate: '',
    description: '',
    region: '',
    phone: '',
    logoUrl: '',
    isSubmitting: false,
    errors: {
      teamName: '',
      establishmentDate: '',
      description: '',
      region: '',
      phone: '',
      logo: ''
    }
  },

  onLoad() {
    // 检查是否已有球队信息
    const teamInfo = wx.getStorageSync('teamInfo')
    if (teamInfo) {
      this.setData(teamInfo)
    }
  },

  // 球队名称输入
  onTeamNameInput(e) {
    const teamName = e.detail.value.trim()
    this.setData({ 
      teamName,
      'errors.teamName': ''
    })
    
    if (teamName.length > 50) {
      this.setData({ 'errors.teamName': '球队名称不能超过50个字符' })
    }
  },

  // 成立时间选择
  onEstablishmentDateChange(e) {
    this.setData({ 
      establishmentDate: e.detail.value,
      'errors.establishmentDate': ''
    })
  },

  // 球队简介输入
  onDescriptionInput(e) {
    const description = e.detail.value.trim()
    this.setData({ 
      description,
      'errors.description': ''
    })
    
    if (description.length > 200) {
      this.setData({ 'errors.description': '球队简介不能超过200个字符' })
    }
  },

  // 所属地区输入
  onRegionInput(e) {
    const region = e.detail.value.trim()
    this.setData({ 
      region,
      'errors.region': ''
    })
    
    if (region.length > 100) {
      this.setData({ 'errors.region': '所属地区不能超过100个字符' })
    }
  },

  // 联系电话输入
  onPhoneInput(e) {
    const phone = e.detail.value.trim()
    this.setData({ 
      phone,
      'errors.phone': ''
    })
    
    if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
      this.setData({ 'errors.phone': '请输入有效的联系电话' })
    }
  },

  // 选择队徽
  chooseLogo() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.uploadLogo(tempFilePath)
      },
      fail: () => {
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        })
      }
    })
  },

  // 上传队徽
  uploadLogo(tempFilePath) {
    wx.showLoading({ title: '上传中...' })
    
    const timestamp = Date.now()
    const cloudPath = `team-logos/${timestamp}.png`
    
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: tempFilePath,
      success: (res) => {
        this.getLogoUrl(res.fileID)
      },
      fail: (err) => {
        console.error('上传失败:', err)
        wx.hideLoading()
        wx.showToast({
          title: '上传失败，请重试',
          icon: 'none'
        })
      }
    })
  },

  // 获取队徽URL
  getLogoUrl(fileID) {
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success: (res) => {
        if (res.fileList && res.fileList[0]) {
          this.setData({
            logoUrl: res.fileList[0].tempFileURL
          })
        }
        wx.hideLoading()
      },
      fail: () => {
        wx.hideLoading()
      }
    })
  },

  // 处理提交
  handleSubmit() {
    const { teamName, establishmentDate, description, region, phone, errors } = this.data
    
    // 验证表单
    if (!teamName) {
      this.setData({ 'errors.teamName': '请输入球队名称' })
      return
    }
    
    if (errors.teamName) {
      return
    }
    
    if (!establishmentDate) {
      this.setData({ 'errors.establishmentDate': '请选择球队成立时间' })
      return
    }
    
    if (!region) {
      this.setData({ 'errors.region': '请输入所属地区' })
      return
    }
    
    if (errors.region) {
      return
    }
    
    if (!phone) {
      this.setData({ 'errors.phone': '请输入联系电话' })
      return
    }
    
    if (errors.phone) {
      return
    }
    
    this.setData({ isSubmitting: true })
    
    // 模拟提交请求
    setTimeout(() => {
      const teamInfo = {
        teamName: this.data.teamName,
        establishmentDate: this.data.establishmentDate,
        description: this.data.description,
        region: this.data.region,
        phone: this.data.phone,
        logoUrl: this.data.logoUrl
      }
      
      // 保存球队信息
      wx.setStorageSync('teamInfo', teamInfo)
      
      // 跳转到首页
      wx.switchTab({ url: '/pages/home/home' })
      
      wx.showToast({
        title: '引导完成',
        icon: 'success'
      })
    }, 1500)
  },

  // 跳过引导
  skipGuide() {
    wx.showModal({
      title: '提示',
      content: '跳过引导将无法使用完整功能，是否继续？',
      success: (res) => {
        if (res.confirm) {
          wx.switchTab({ url: '/pages/home/home' })
        }
      }
    })
  }
})