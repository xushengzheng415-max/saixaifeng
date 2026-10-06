// pages/match/create/create.js
const workspace = require('../../../utils/workspace')

Page({
  data: {
    submitting: false,
    minDate: '',
    
    // 表单数据
    formData: {
      name: '',
      type: '',
      typeName: '',
      location: '',
      logo: '', // 赛事LOGO
      titleSponsor: '', // 冠名商
      sponsors: [], // 赞助商列表 [{type: 'text/image', value: ''}]
      startDate: '',
      endDate: '',
      deadline: '',
      maxTeams: 8,
      maxPlayers: 20,
      description: ''
    },

    // 赛制选项（4种专业赛制）
    typeOptions: [
      { value: 'tournament', label: '赛会制', icon: '🏟️', desc: '小组赛 + 淘汰赛，分组循环后交叉淘汰' },
      { value: 'cup', label: '杯赛制', icon: '🏆', desc: '单场淘汰，32/16/8强抽签对决' },
      { value: 'league', label: '联赛制', icon: '📊', desc: '单循环或双循环积分赛' },
      { value: 'combined', label: '复合制', icon: '⚽', desc: '联赛阶段 + 杯赛阶段，灵活配置' }
    ],
    typeIndex: -1
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    // 设置最小日期为今天
    const today = new Date()
    const minDate = this.formatDate(today)
    this.setData({ minDate })
  },

  // 格式化日期
  formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  // 输入框变化
  onInputChange(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      [`formData.${field}`]: value
    })
  },

  // 步进器变化
  onStepperChange(e) {
    const field = e.currentTarget.dataset.field
    const action = e.currentTarget.dataset.action
    let value = this.data.formData[field]

    if (action === 'plus') {
      value++
    } else if (action === 'minus') {
      value--
    }

    // 限制范围
    if (field === 'maxTeams') {
      value = Math.max(2, Math.min(64, value))
    } else if (field === 'maxPlayers') {
      value = Math.max(5, Math.min(50, value))
    }

    this.setData({
      [`formData.${field}`]: value
    })
  },

  // 赛制选择
  onTypeSelect(e) {
    var type = e.currentTarget.dataset.type
    var index = e.currentTarget.dataset.index
    var option = this.data.typeOptions[index]

    this.setData({
      typeIndex: index,
      'formData.type': option.value,
      'formData.typeName': option.label
    })
  },

  // 开始日期选择
  onStartDateChange(e) {
    const startDate = e.detail.value
    this.setData({
      'formData.startDate': startDate
    })

    // 如果结束日期早于开始日期，清空结束日期
    if (this.data.formData.endDate && this.data.formData.endDate < startDate) {
      this.setData({
        'formData.endDate': ''
      })
    }

    // 如果报名截止日期晚于开始日期，清空报名截止日期
    if (this.data.formData.deadline && this.data.formData.deadline > startDate) {
      this.setData({
        'formData.deadline': ''
      })
    }
  },

  // 结束日期选择
  onEndDateChange(e) {
    this.setData({
      'formData.endDate': e.detail.value
    })
  },

  // 报名截止日期选择
  onDeadlineChange(e) {
    this.setData({
      'formData.deadline': e.detail.value
    })
  },

  // 选择赛事LOGO
  onChooseLogo() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        // 上传到云存储
        this.uploadImage(tempFilePath, 'logo')
      }
    })
  },

  // 删除赛事LOGO
  onDeleteLogo() {
    this.setData({
      'formData.logo': ''
    })
  },

  // 添加文字赞助商
  onAddTextSponsor() {
    wx.showModal({
      title: '添加赞助商',
      editable: true,
      placeholderText: '请输入赞助商名称',
      success: (res) => {
        if (res.confirm && res.content) {
          const sponsors = this.data.formData.sponsors
          sponsors.push({
            type: 'text',
            value: res.content.trim()
          })
          this.setData({
            'formData.sponsors': sponsors
          })
        }
      }
    })
  },

  // 添加图片赞助商
  onAddImageSponsor() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        this.uploadImage(tempFilePath, 'sponsor')
      }
    })
  },

  // 删除赞助商
  onDeleteSponsor(e) {
    const index = e.currentTarget.dataset.index
    const sponsors = this.data.formData.sponsors
    sponsors.splice(index, 1)
    this.setData({
      'formData.sponsors': sponsors
    })
  },

  // 上传图片到云存储
  async uploadImage(tempFilePath, type) {
    wx.showLoading({ title: '上传中...' })
    
    try {
      const cloudPath = `tournament-images/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`
      const res = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: tempFilePath
      })
      
      wx.hideLoading()
      
      if (type === 'logo') {
        this.setData({
          'formData.logo': res.fileID
        })
      } else if (type === 'sponsor') {
        const sponsors = this.data.formData.sponsors
        sponsors.push({
          type: 'image',
          value: res.fileID
        })
        this.setData({
          'formData.sponsors': sponsors
        })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('上传图片失败:', err)
      wx.showToast({
        title: '上传失败',
        icon: 'none'
      })
    }
  },

  // 表单验证
  validateForm() {
    const { formData } = this.data
    const errors = []

    if (!formData.name.trim()) {
      errors.push('请输入赛事名称')
    }

    if (!formData.type) {
      errors.push('请选择赛事赛制')
    }

    if (!formData.location.trim()) {
      errors.push('请输入比赛地点')
    }

    if (!formData.startDate) {
      errors.push('请选择开始日期')
    }

    if (!formData.endDate) {
      errors.push('请选择结束日期')
    }

    if (!formData.deadline) {
      errors.push('请选择报名截止日期')
    }

    if (formData.endDate && formData.startDate && formData.endDate < formData.startDate) {
      errors.push('结束日期不能早于开始日期')
    }

    if (formData.deadline && formData.startDate && formData.deadline > formData.startDate) {
      errors.push('报名截止日期不能晚于开始日期')
    }

    return errors
  },

  // 提交表单
  async onSubmit() {
    // 验证表单
    const errors = this.validateForm()
    if (errors.length > 0) {
      wx.showToast({
        title: errors[0],
        icon: 'none'
      })
      return
    }

    // 检查权限
    if (!workspace.hasPermission('event.manage')) {
      wx.showToast({
        title: '当前机构未授予赛事管理权限',
        icon: 'none'
      })
      return
    }

    this.setData({ submitting: true })

    try {
      const db = wx.cloud.database()
      const { formData } = this.data

      // 创建赛事数据
      const tournamentData = {
        name: formData.name.trim(),
        type: formData.type,
        typeName: formData.typeName,
        location: formData.location.trim(),
        logo: formData.logo,
        titleSponsor: formData.titleSponsor.trim(),
        sponsors: formData.sponsors,
        startDate: formData.startDate,
        endDate: formData.endDate,
        deadline: formData.deadline,
        maxTeams: formData.maxTeams,
        maxPlayers: formData.maxPlayers,
        description: formData.description.trim(),
        status: 'registering', // 默认为报名中
        registeredTeams: 0,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }

      // 保存到数据库
      const res = await db.collection('tournaments').add({
        data: tournamentData
      })

      wx.showToast({
        title: '创建成功',
        icon: 'success'
      })

      // 返回上一页
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)

    } catch (err) {
      console.error('创建赛事失败:', err)
      wx.showToast({
        title: '创建失败，请重试',
        icon: 'none'
      })
    } finally {
      this.setData({ submitting: false })
    }
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  }
})
