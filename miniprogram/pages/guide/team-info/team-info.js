// pages/guide/team-info.js
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

  // 省份名称->代码映射
  provinceNameCodeMap: {
    '上海市': '101', '天津': '102', '天津市': '102', '重庆': '103', '重庆市': '103',
    '北京': '104', '北京市': '104',
    '安徽省': '201', '福建省': '202', '甘肃省': '203', '广东省': '204', '广西': '205',
    '广西壮族自治区': '205', '贵州省': '206', '海南省': '207', '河北省': '208',
    '黑龙江省': '209', '湖北省': '210', '湖南省': '211', '吉林省': '212',
    '江苏省': '213', '辽宁省': '214', '江西省': '215', '内蒙古': '216',
    '内蒙古自治区': '216', '宁夏': '217', '宁夏回族自治区': '217',
    '青海省': '218', '山东省': '219', '山西省': '220', '陕西省': '221',
    '四川省': '222', '新疆': '223', '新疆维吾尔自治区': '223',
    '云南省': '224', '浙江省': '225', '河南省': '226'
  },

  // 城市名称->字母映射（从现有的cityLetterMap提取）
  cityNameLetterMap: {
    '上海': 'A', '上海浦东': 'B', '上海郊区': 'C', '上海崇明': 'D',
    '天津': 'A', '天津滨海': 'B', '天津郊区': 'C',
    '重庆': 'A', '重庆涪陵': 'B', '重庆万州': 'C',
    '北京': 'A', '北京城区': 'B', '北京郊区': 'C', '北京延庆': 'Y',
    '广州': 'A', '广州市': 'A', '深圳': 'B', '深圳市': 'B', '珠海': 'C', '珠海市': 'C',
    '汕头': 'D', '汕头市': 'D', '佛山': 'E', '佛山市': 'E', '韶关': 'F', '韶关市': 'F',
    '湛江': 'G', '湛江市': 'G', '肇庆': 'H', '肇庆市': 'H', '江门': 'J', '江门市': 'J',
    '茂名': 'K', '茂名市': 'K', '惠州': 'L', '惠州市': 'L', '梅州': 'M', '梅州市': 'M',
    '汕尾': 'N', '汕尾市': 'N', '河源': 'P', '河源市': 'P', '阳江': 'Q', '阳江市': 'Q',
    '清远': 'R', '清远市': 'R', '东莞': 'S', '东莞市': 'S', '中山': 'T', '中山市': 'T',
    '潮州': 'U', '潮州市': 'U', '揭阳': 'V', '揭阳市': 'V', '云浮': 'W', '云浮市': 'W',
    '石家庄': 'A', '石家庄市': 'A', '唐山': 'B', '唐山市': 'B', '秦皇岛': 'C', '秦皇岛市': 'C',
    '邯郸': 'D', '邯郸市': 'D', '邢台': 'E', '邢台市': 'E', '保定': 'F', '保定市': 'F',
    '张家口': 'G', '张家口市': 'G', '承德': 'H', '承德市': 'H', '沧州': 'J', '沧州市': 'J',
    '廊坊': 'K', '廊坊市': 'K', '衡水': 'L', '衡水市': 'L',
    '武汉': 'A', '武汉市': 'A', '黄石': 'B', '黄石市': 'B', '十堰': 'C', '十堰市': 'C',
    '荆州': 'D', '荆州市': 'D', '宜昌': 'E', '宜昌市': 'E', '襄阳': 'F', '襄阳市': 'F',
    '鄂州': 'G', '鄂州市': 'G', '荆门': 'H', '荆门市': 'H', '黄冈': 'J', '黄冈市': 'J',
    '孝感': 'K', '孝感市': 'K', '咸宁': 'L', '咸宁市': 'L', '仙桃': 'M', '仙桃市': 'M',
    '潜江': 'N', '潜江市': 'N', '神农架': 'P', '恩施': 'Q',
    '长沙': 'A', '长沙市': 'A', '株洲': 'B', '株洲市': 'B', '湘潭': 'C', '湘潭市': 'C',
    '衡阳': 'D', '衡阳市': 'D', '邵阳': 'E', '邵阳市': 'E', '岳阳': 'F', '岳阳市': 'F',
    '常德': 'G', '常德市': 'G', '益阳': 'H', '益阳市': 'H', '娄底': 'J', '娄底市': 'J',
    '郴州': 'K', '郴州市': 'K', '永州': 'L', '永州市': 'L', '怀化': 'M', '怀化市': 'M',
    '湘西': 'N',
    '南京': 'A', '南京市': 'A', '无锡': 'B', '无锡市': 'B', '徐州': 'C', '徐州市': 'C',
    '常州': 'D', '常州市': 'D', '苏州': 'E', '苏州市': 'E', '南通': 'F', '南通市': 'F',
    '连云港': 'G', '连云港市': 'G', '淮安': 'H', '淮安市': 'H', '盐城': 'J', '盐城市': 'J',
    '扬州': 'K', '扬州市': 'K', '镇江': 'L', '镇江市': 'L', '泰州': 'M', '泰州市': 'M',
    '宿迁': 'N', '宿迁市': 'N',
    '济南': 'A', '济南市': 'A', '青岛': 'B', '青岛市': 'B', '淄博': 'C', '淄博市': 'C',
    '枣庄': 'D', '枣庄市': 'D', '东营': 'E', '东营市': 'E', '烟台': 'F', '烟台市': 'F',
    '潍坊': 'G', '潍坊市': 'G', '济宁': 'H', '济宁市': 'H', '泰安': 'J', '泰安市': 'J',
    '威海': 'K', '威海市': 'K', '日照': 'L', '日照市': 'L',
    '郑州': 'A', '郑州市': 'A', '开封': 'B', '开封市': 'B', '洛阳': 'C', '洛阳市': 'C',
    '平顶山': 'D', '平顶山市': 'D', '安阳': 'E', '安阳市': 'E', '鹤壁': 'F', '鹤壁市': 'F',
    '新乡': 'G', '新乡市': 'G', '焦作': 'H', '焦作市': 'H', '濮阳': 'J', '濮阳市': 'J',
    '许昌': 'K', '许昌市': 'K', '漯河': 'L', '漯河市': 'L', '三门峡': 'M', '三门峡市': 'M',
    '商丘': 'N', '商丘市': 'N', '周口': 'P', '周口市': 'P', '驻马店': 'Q', '驻马店市': 'Q',
    '南阳': 'R', '南阳市': 'R', '信阳': 'S', '信阳市': 'S', '济源': 'U', '济源市': 'U'
  },

  // 页面加载时获取已有的球队信息
  onLoad() {
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
    var provinceCode = this.data.provinceNameCodeMap[provinceName] || ''

    // 查找城市字母：先精确匹配城市名，再去除"市"后缀匹配
    var cityLetter = this.data.cityNameLetterMap[cityName] || ''
    if (!cityLetter) {
      // 尝试去掉"市"再匹配
      var shortCity = cityName.replace(/市$/, '')
      cityLetter = this.data.cityNameLetterMap[shortCity] || ''
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
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({ 
          teamLogo: res.tempFilePaths[0],
          'errors.logo': ''
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
      
      // 检查是否已有球队
      const currentTeamId = wx.getStorageSync('currentTeamId')
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
        ownerPhone: ownerPhone,              // ★ 唯一归属手机号
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
  }
})
