// pages/guide/team-info.js
const { provinceNameCodeMap, cityNameLetterMap, normalizeCityName } = require('../../../utils/teamCodeRegions')
Page({
  _updateLens: function() {
    var data = this.data;
    var _desc = data.description ? data.description.length : 0;
    if (this.data.DescriptionLen !== _desc) { this.setData({ 'DescriptionLen': _desc}); }
  },

  data: {
    fullName: '',
    shortName: '',
    teamTypeIndex: 0,
    teamTypeCode: '01',
    teamTypeOptions: [
      { label: '一线队', code: '01' },
      { label: '二线队', code: '02' },
      { label: 'U8', code: '08' },
      { label: 'U9', code: '09' },
      { label: 'U10', code: '10' },
      { label: 'U11', code: '11' },
      { label: 'U12', code: '12' },
      { label: 'U13', code: '13' },
      { label: 'U14', code: '14' },
      { label: 'U15', code: '15' },
      { label: 'U16', code: '16' },
      { label: 'U17', code: '17' },
      { label: 'U18', code: '18' }
    ],
    selectedTeamTypeText: '一线队',
    city: '',
    provinceCode: '',
    cityLetter: '',
    foundedDate: '',
    description: '',
    teamLogo: '', // 统一字段名称
    isSubmitting: false,
    errors: {
      fullName: '',
      shortName: '',
      teamType: '',
      city: '',
      foundedDate: '',
      description: '',
      logo: ''
    }
  },


  // 页面加载时获取已有的球队信息
  onLoad(options) {
    const fromSharedCreate = options && (options.inviteCreateTeam === '1' || options.fromShare === '1')
    if (fromSharedCreate) {
      this.setData({ shareMode: 'createTeam' })
      return
    }

    const teamInfo = wx.getStorageSync('teamInfo')
    if (teamInfo) {
      // 尝试从已有teamTypeCode找到对应的index
      var typeIndex = 0
      var typeOptions = this.data.teamTypeOptions
      if (teamInfo.teamTypeCode) {
        for (var i = 0; i < typeOptions.length; i++) {
          if (typeOptions[i].code === teamInfo.teamTypeCode) {
            typeIndex = i
            break
          }
        }
      }
      this.setData({
        fullName: teamInfo.teamName || teamInfo.fullName || '',
        shortName: teamInfo.shortName || '',
        teamLogo: teamInfo.teamLogo || '',
        city: teamInfo.city || '',
        foundedDate: teamInfo.foundedDate || '',
        description: teamInfo.description || '',
        teamTypeIndex: typeIndex,
        teamTypeCode: teamInfo.teamTypeCode || '01',
        selectedTeamTypeText: typeOptions[typeIndex].label
      })
    }
  },

  // 球队全称输入
  onFullNameInput(e) {
    var val = e.detail.value.trim()
    this.setData({ fullName: val, 'errors.fullName': '' })
    if (val.length < 2 || val.length > 20) {
      this.setData({ 'errors.fullName': '全称应在2-20个字之间' })
    }
  },

  // 球队简称输入
  onShortNameInput(e) {
    var val = e.detail.value.trim()
    this.setData({ shortName: val, 'errors.shortName': '' })
    if (val.length < 1 || val.length > 10) {
      this.setData({ 'errors.shortName': '简称应在1-10个字之间' })
    }
  },

  // 球队类型选择
  onTeamTypeChange(e) {
    const idx = parseInt(e.detail.value)
    var option = this.data.teamTypeOptions[idx]
    this.setData({
      teamTypeIndex: idx,
      teamTypeCode: option.code,
      selectedTeamTypeText: option.label,
      'errors.teamType': ''
    })
  },

  // 城市选择
  onCityChange(e) {
    var region = e.detail.value
    var provinceName = region[0] || ''
    var cityName = region[1] || ''
    var districtName = region[2] || ''

    // 查找省份代码
    var provinceCode = provinceNameCodeMap[provinceName] || ''

    // 查找城市字母：先精确匹配城市名，再去除"市"后缀匹配
    var cityLetter = cityNameLetterMap[cityName] || ''
    if (!cityLetter) {
      // 尝试去掉"市"再匹配
      var shortCity = cityName.replace(/市$/, '')
      cityLetter = cityNameLetterMap[shortCity] || ''
    }

    this.setData({ 
      city: cityName,
      provinceCode: provinceCode,
      cityLetter: cityLetter,
      'errors.city': ''
    })
  },

  // 成立时间选择
  onFoundedDateChange(e) {
    this.setData({ 
      foundedDate: e.detail.value,
      'errors.foundedDate': ''
    })
  },

  // 球队简介输入
  onDescriptionInput(e) {
    const description = e.detail.value.trim()
    this.setData({ 
      description: description,
      'errors.description': ''
    })
    
    if (description.length > 200) {
      this.setData({ 'errors.description': '球队简介最多200字' })
    }
  },

  // 选择图片
  chooseImage() {
    const that = this
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const filePath = res.tempFilePaths && res.tempFilePaths[0]
        if (filePath) that.compressAndUploadTeamLogo(filePath)
      },
      fail: () => {
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        })
      }
    })
  },

  // 上传前压缩，数据库只保存可长期使用的云文件 ID
  compressAndUploadTeamLogo(filePath) {
    const that = this
    wx.showLoading({ title: '压缩上传中...' })
    wx.compressImage({
      src: filePath,
      quality: 70,
      compressedWidth: 640,
      compressedHeight: 640,
      success(compressed) {
        const cloudPath = 'team-logos/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg'
        wx.cloud.uploadFile({
          cloudPath,
          filePath: compressed.tempFilePath,
          success(uploaded) {
            that.setData({
              teamLogo: uploaded.fileID,
              'errors.logo': ''
            })
            wx.showToast({ title: 'Logo上传成功', icon: 'success' })
          },
          fail(err) {
            console.error('球队Logo上传失败:', err)
            wx.showToast({ title: 'Logo上传失败', icon: 'none' })
          },
          complete() {
            wx.hideLoading()
          }
        })
      },
      fail(err) {
        wx.hideLoading()
        console.error('球队Logo压缩失败:', err)
        wx.showToast({ title: '图片压缩失败', icon: 'none' })
      }
    })
  },

  // 生成球队编号（新格式：[省份3位][城市1位][序号3位][类型2位]）
  async generateTeamCode(provinceCode, cityLetter, teamTypeCode) {
    var prefix = provinceCode + cityLetter
    var maxSeq = 0

    try {
      var db = wx.cloud.database()
      // 查询所有球队，在客户端过滤（小程序云数据库regex支持有限）
      var res = await db.collection('teams').limit(500).get()
      if (res.data && res.data.length > 0) {
        res.data.forEach(function(t) {
          if (t.teamCode && t.teamCode.length >= 7 && t.teamCode.substring(0, 4) === prefix) {
            var num = parseInt(t.teamCode.substring(4, 7), 10)
            if (!isNaN(num) && num > maxSeq) maxSeq = num
          }
        })
      }
    } catch (err) {
      console.warn('查询球队编号序列失败:', err)
      // 查询失败时默认为001
    }

    var nextNum = (maxSeq + 1).toString()
    while (nextNum.length < 3) { nextNum = '0' + nextNum }
    return prefix + nextNum + teamTypeCode
  },

  // 提交表单
  async handleSubmit() {
    const { fullName, shortName, city, provinceCode, cityLetter, teamTypeCode, foundedDate, description, teamLogo, errors } = this.data
    
    // 验证表单
    if (!fullName) {
      this.setData({ 'errors.fullName': '请输入球队全称' })
      return
    }
    
    if (errors.fullName) {
      return
    }
    
    if (!shortName) {
      this.setData({ 'errors.shortName': '请输入球队简称' })
      return
    }
    
    if (errors.shortName) {
      return
    }
    
    if (!city) {
      this.setData({ 'errors.city': '请输入城市名称' })
      return
    }
    
    if (!foundedDate) {
      this.setData({ 'errors.foundedDate': '请选择成立时间' })
      return
    }
    
    this.setData({ isSubmitting: true })
    
    try {
      const db = wx.cloud.database()
      const currentUser = wx.getStorageSync('userInfo') || {}
      const ownerPhone = currentUser.phoneNumber || currentUser.phone || wx.getStorageSync('phoneNumber') || ''
      const creatorId = currentUser._id || wx.getStorageSync('userId') || ''
      const openId = currentUser.openId || currentUser.openid || wx.getStorageSync('openid') || ''
      
      // 检查是否已有球队
      const currentTeamId = this.data.shareMode === 'createTeam' ? '' : wx.getStorageSync('currentTeamId')
      let teamId = currentTeamId
      
      // 使用新格式生成球队编号
      var genCode = provinceCode && cityLetter
        ? await this.generateTeamCode(provinceCode, cityLetter, teamTypeCode)
        : ''
      
      const teamData = {
        // 核心字段
        name: fullName,
        shortName: shortName,
        provinceCode: provinceCode,
        cityCode: cityLetter,
        cityName: city,
        teamType: teamTypeCode,
        teamCode: genCode,
        ownerPhone: ownerPhone,
        creatorPhone: ownerPhone,
        contactPhone: ownerPhone,
        phoneNumber: ownerPhone,
        phone: ownerPhone,
        mobile: ownerPhone,
        openId: openId,
        wechatOpenId: openId,              // ★ 唯一归属手机号
        source: 'miniprogram',               // ★ 创建来源
        createTime: db.serverDate(),
        updateTime: db.serverDate(),
        // 可选字段
        establishedDate: foundedDate,
        logo: teamLogo,
        description: description || '',
        home: city ? city + '市体育中心' : '',
        // 管理字段
        creatorId: creatorId,
        claimStatus: ownerPhone ? 'claimed' : 'unclaimed'
      }
      
      if (currentTeamId) {
        // 更新现有球队
        await db.collection('teams').doc(currentTeamId).update({
          data: teamData
        })
      } else {
        // 创建新球队
        teamData.createTime = db.serverDate()
        const res = await db.collection('teams').add({ data: teamData })
        teamId = res._id
      }
      
      // 保存到本地存储
      const teamInfo = {
        teamId: teamId,
        teamName: fullName,
        fullName: fullName,
        shortName: shortName,
        teamTypeCode: teamTypeCode,
        city: city,
        foundedDate: foundedDate,
        description: description,
        teamLogo: teamLogo,
        teamCode: genCode,
        ownerPhone: ownerPhone,
        creatorPhone: ownerPhone,
        contactPhone: ownerPhone,
        phoneNumber: ownerPhone,
        phone: ownerPhone,
        mobile: ownerPhone,
        creatorId: creatorId,
        openId: openId,
        wechatOpenId: openId,
        claimStatus: ownerPhone ? 'claimed' : 'unclaimed'
      }
      wx.setStorageSync('teamInfo', teamInfo)
      wx.setStorageSync('currentTeamId', teamId)
      
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })
      
      setTimeout(() => {
        wx.switchTab({ url: '/pages/team/team' })
      }, 1500)
    } catch (err) {
      console.error('保存球队失败:', err)
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
      this.setData({ isSubmitting: false })
    }
  },

  // 跳过
  skip() {
    wx.switchTab({ url: '/pages/home/home' })
  },

  onShareAppMessage() {
    return {
      title: '邀请你创建球队资料',
      path: '/pages/guide/team-info/team-info?inviteCreateTeam=1&fromShare=1',
      imageUrl: '/images/logo.png'
    }
  },

  onShareTimeline() {
    return {
      title: '创建球队资料',
      query: 'inviteCreateTeam=1&fromShare=1',
      imageUrl: '/images/logo.png'
    }
  }
})
