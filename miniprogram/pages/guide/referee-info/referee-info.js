// pages/guide/referee-info.js
Page({
  _updateLens: function() {
    var data = this.data;
    var _et = data.experienceText ? data.experienceText.length : 0;
    if (this.data.ExperienceTextLen !== _et) { this.setData({ 'ExperienceTextLen': _et}); }
  },

  data: {
    name: '',
    level: 0,
    levels: ['国家级', '一级', '二级', '三级', '预备级'],
    selectedLevelText: '国家级',
    certNo: '',
    experience: 0,
    experiences: ['无经验', '1-5场', '6-20场', '21-50场', '51场以上'],
    selectedExperienceText: '无经验',
    specialty: '',
    experienceText: '',
    photoUrl: '',
    isSubmitting: false,
    errors: {
      name: '',
      level: '',
      certNo: '',
      experience: '',
      specialty: '',
      experienceText: '',
      photo: ''
    }
  },

  // 姓名输入
  onNameInput(e) {
    const name = e.detail.value.trim()
    this.setData({ 
      name: name,
      'errors.name': ''
    })
    
    if (!/^[\u4e00-\u9fa5]{2,10}$/.test(name)) {
      this.setData({ 'errors.name': '请输入真实姓名（2-10个汉字）' })
    }
  },

  // 裁判级别选择
  onLevelChange(e) {
    const idx = parseInt(e.detail.value)
    this.setData({
      level: idx,
      selectedLevelText: this.data.levels[idx],
      'errors.level': ''
    })
  },

  // 裁判证号输入
  onCertNoInput(e) {
    const certNo = e.detail.value.trim()
    this.setData({ 
      certNo: certNo,
      'errors.certNo': ''
    })
    
    if (!certNo) {
      this.setData({ 'errors.certNo': '请输入裁判证号' })
    }
  },

  // 执裁经验选择
  onExperienceChange(e) {
    const idx = parseInt(e.detail.value)
    this.setData({
      experience: idx,
      selectedExperienceText: this.data.experiences[idx],
      'errors.experience': ''
    })
  },

  // 擅长项目输入
  onSpecialtyInput(e) {
    const specialty = e.detail.value.trim()
    this.setData({ 
      specialty: specialty,
      'errors.specialty': ''
    })
  },

  // 执裁经历输入
  onExperienceInput(e) {
    const experienceText = e.detail.value.trim()
    this.setData({ 
      experienceText: experienceText,
      'errors.experienceText': ''
    })
    
    if (experienceText.length > 200) {
      this.setData({ 'errors.experienceText': '执裁经历最多200字' })
    }
  },

  // 选择图片
  chooseImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({ 
          photoUrl: res.tempFilePaths[0],
          'errors.photo': ''
        })
      },
      fail: () => {
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        })
      }
    })
  },

  // 提交表单
  handleSubmit() {
    const { name, certNo, specialty, experienceText, photoUrl, errors } = this.data
    
    // 验证表单
    if (!name) {
      this.setData({ 'errors.name': '请输入裁判姓名' })
      return
    }
    
    if (errors.name) {
      return
    }
    
    if (!certNo) {
      this.setData({ 'errors.certNo': '请输入裁判证号' })
      return
    }
    
    if (!specialty) {
      this.setData({ 'errors.specialty': '请输入擅长项目' })
      return
    }
    
    this.setData({ isSubmitting: true })
    
    // 模拟提交请求
    setTimeout(() => {
      // 保存裁判信息到本地存储（临时）
      const refereeInfo = {
        name: name,
        level: this.data.levels[this.data.level],
        certNo: certNo,
        experience: this.data.experiences[this.data.experience],
        specialty: specialty,
        experienceText: experienceText,
        photoUrl: photoUrl
      }
      wx.setStorageSync('refereeInfo', refereeInfo)
      
      wx.showToast({
        title: '注册成功',
        icon: 'success'
      })
      
      setTimeout(() => {
        wx.switchTab({ url: '/pages/home/home' })
      }, 1500)
    }, 1500)
  },

  // 跳过
  skip() {
    wx.switchTab({ url: '/pages/home/home' })
  }
})