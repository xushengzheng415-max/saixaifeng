// pages/guide/referee-info.js
Page({
  _updateLens: function() {
    var data = this.data;
    var _exp = data.experience ? data.experience.length : 0;
    if (this.data.ExperienceLen !== _exp) { this.setData({ 'ExperienceLen': _exp}); }
  },

  data: {
    name: '',
    refereeLevelIndex: -1,
    refereeLevels: ['国家级', '一级', '二级', '三级', '助理裁判'],
    refereeId: '',
    phone: '',
    experience: '',
    region: '',
    avatarUrl: '',
    isSubmitting: false,
    errors: {
      name: '',
      refereeLevel: '',
      refereeId: '',
      phone: '',
      experience: '',
      region: '',
      avatar: ''
    }
  },

  onLoad() {
    // 检查是否已有裁判信息
    const refereeInfo = wx.getStorageSync('refereeInfo')
    if (refereeInfo) {
      this.setData(refereeInfo)
    }
  },

  // 姓名输入
  onNameInput(e) {
    const name = e.detail.value.trim()
    this.setData({ 
      name,
      'errors.name': ''
    })
    
    if (name.length > 50) {
      this.setData({ 'errors.name': '姓名不能超过50个字符' })
    }
  },

  // 裁判等级选择
  onRefereeLevelChange(e) {
    this.setData({ 
      refereeLevelIndex: parseInt(e.detail.value),
      'errors.refereeLevel': ''
    })
  },

  // 裁判编号输入
  onRefereeIdInput(e) {
    const refereeId = e.detail.value.trim()
    this.setData({ 
      refereeId,
      'errors.refereeId': ''
    })
    
    if (refereeId.length > 20) {
      this.setData({ 'errors.refereeId': '裁判编号不能超过20个字符' })
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

  // 执裁经验输入
  onExperienceInput(e) {
    const experience = e.detail.value.trim()
    this.setData({ 
      experience,
      'errors.experience': ''
    })
    
    if (experience.length > 200) {
      this.setData({ 'errors.experience': '执裁经验不能超过200个字符' })
    }
  },

  // 所在地区输入
  onRegionInput(e) {
    const region = e.detail.value.trim()
    this.setData({ 
      region,
      'errors.region': ''
    })
    
    if (region.length > 100) {
      this.setData({ 'errors.region': '所在地区不能超过100个字符' })
    }
  },

  // 选择头像
  chooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.uploadAvatar(tempFilePath)
      },
      fail: () => {
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        })
      }
    })
  },

  // 上传头像
  uploadAvatar(tempFilePath) {
    wx.showLoading({ title: '上传中...' })
    
    const timestamp = Date.now()
    const cloudPath = `referee-avatars/${timestamp}.png`
    
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: tempFilePath,
      success: (res) => {
        this.getAvatarUrl(res.fileID)
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

  // 获取头像URL
  getAvatarUrl(fileID) {
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success: (res) => {
        if (res.fileList && res.fileList[0]) {
          this.setData({
            avatarUrl: res.fileList[0].tempFileURL
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
    const { name, refereeLevelIndex, refereeId, phone, experience, region, errors } = this.data
    
    // 验证表单
    if (!name) {
      this.setData({ 'errors.name': '请输入姓名' })
      return
    }
    
    if (errors.name) {
      return
    }
    
    if (refereeLevelIndex < 0) {
      this.setData({ 'errors.refereeLevel': '请选择裁判等级' })
      return
    }
    
    if (!refereeId) {
      this.setData({ 'errors.refereeId': '请输入裁判编号' })
      return
    }
    
    if (errors.refereeId) {
      return
    }
    
    if (!phone) {
      this.setData({ 'errors.phone': '请输入联系电话' })
      return
    }
    
    if (errors.phone) {
      return
    }
    
    if (!region) {
      this.setData({ 'errors.region': '请输入所在地区' })
      return
    }
    
    if (errors.region) {
      return
    }
    
    this.setData({ isSubmitting: true })
    
    // 模拟提交请求
    setTimeout(() => {
      const refereeInfo = {
        name: this.data.name,
        refereeLevelIndex: this.data.refereeLevelIndex,
        refereeLevel: this.data.refereeLevels[this.data.refereeLevelIndex],
        refereeId: this.data.refereeId,
        phone: this.data.phone,
        experience: this.data.experience,
        region: this.data.region,
        avatarUrl: this.data.avatarUrl
      }
      
      // 保存裁判信息
      wx.setStorageSync('refereeInfo', refereeInfo)
      
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