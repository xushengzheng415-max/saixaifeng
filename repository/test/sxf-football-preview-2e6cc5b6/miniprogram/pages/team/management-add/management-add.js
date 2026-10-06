// pages/team/management-add/management-add.js
// 官员添加页面 - 青训版本

Page({
  data: {
    // 表单数据
    form: {
      name: '',
      phone: '',
      email: '',
      position: '',
      idCard: '',
      gender: 'male',
      birthDate: '',
      address: '',
      contactName: '',
      contactPhone: ''
    },
    
    // 照片
    avatarUrl: '',
    
    // 选择器显示用
    genderLabel: '男',
    genderIndex: 0,
    positionLabel: '',
    positionIndex: -1,
    
    // 选项
    genderOptions: [
      { value: 'male', label: '男' },
      { value: 'female', label: '女' }
    ],
    positionOptions: [
      { value: 'coach', label: '主教练' },
      { value: 'assistant_coach', label: '助理教练' },
      { value: 'goalkeeper_coach', label: '守门员教练' },
      { value: 'team_leader', label: '领队' },
      { value: 'physical_trainer', label: '体能教练' },
      { value: 'doctor', label: '队医' },
      { value: 'other', label: '其他' }
    ],
    
    // 页面状态
    teamId: '',
    teamName: '',
    isSubmitting: false
  },

  onLoad(options) {
    const teamId = options.teamId || ''       // 球队 _id（用于 coaches 集合）
    const teamCode = options.teamCode || ''   // 球队代码（兼容旧数据）
    const teamName = options.teamName || ''
    const id = options.id || ''
    const mode = options.mode || 'add'

    this.setData({
      teamId,
      teamCode,
      teamName,
      id,
      mode
    })

    // 编辑模式：加载现有数据
    if (mode === 'edit' && id) {
      this.loadManagementData(id)
    }
  },

  // 加载教练组成员数据（编辑模式）
  async loadManagementData(id) {
    try {
      wx.showLoading({ title: '加载中...' })
      const db = wx.cloud.database()

      // 优先查 coaches（与Web端统一），再兼容 management（旧数据）
      let data = null
      let source = ''
      try {
        const res = await db.collection('coaches').doc(id).get()
        if (res.data) {
          data = res.data
          source = 'coaches'
        }
      } catch (e) {
        // coaches 查不到，试 management
      }

      if (!data) {
        try {
          const res = await db.collection('management').doc(id).get()
          if (res.data) {
            data = res.data
            source = 'management'
          }
        } catch (e) {
          // 也查不到
        }
      }

      if (data) {
        // 统一字段：coaches 用 type，management 用 position
        const positionValue = data.type || data.position || ''

        // 找到职位对应的索引
        const positionIndex = this.data.positionOptions.findIndex(opt => opt.value === positionValue)
        const positionLabel = positionIndex >= 0 ? this.data.positionOptions[positionIndex].label : ''

        // 找到性别对应的索引
        const genderIndex = this.data.genderOptions.findIndex(opt => opt.value === data.gender)
        const genderLabel = genderIndex >= 0 ? this.data.genderOptions[genderIndex].label : '男'

        this.setData({
          form: {
            name: data.name || '',
            phone: data.phone || '',
            email: data.email || '',
            position: positionValue,
            idCard: data.idCard || '',
            gender: data.gender || 'male',
            birthDate: data.birthDate || '',
            address: data.address || '',
            contactName: data.contactName || '',
            contactPhone: data.contactPhone || ''
          },
          avatarUrl: data.photoUrl || data.avatarUrl || '',
          _source: source,
          positionIndex: positionIndex >= 0 ? positionIndex : -1,
          positionLabel,
          genderIndex: genderIndex >= 0 ? genderIndex : 0,
          genderLabel
        })
      }
      wx.hideLoading()
    } catch (err) {
      wx.hideLoading()
      console.error('加载数据失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // ========== 表单输入处理 ==========
  
  onNameInput(e) {
    this.setData({ 'form.name': e.detail.value })
  },

  onPhoneInput(e) {
    this.setData({ 'form.phone': e.detail.value })
  },

  onEmailInput(e) {
    this.setData({ 'form.email': e.detail.value })
  },

  onPositionChange(e) {
    const index = e.detail.value
    const option = this.data.positionOptions[index]
    this.setData({
      'form.position': option.value,
      positionLabel: option.label,
      positionIndex: index
    })
  },

  onIdCardInput(e) {
    this.setData({ 'form.idCard': e.detail.value })
  },

  onGenderChange(e) {
    const index = e.detail.value
    const option = this.data.genderOptions[index]
    this.setData({
      'form.gender': option.value,
      genderLabel: option.label,
      genderIndex: index
    })
  },

  onBirthDateChange(e) {
    this.setData({ 'form.birthDate': e.detail.value })
  },

  onAddressInput(e) {
    this.setData({ 'form.address': e.detail.value })
  },

  onContactNameInput(e) {
    this.setData({ 'form.contactName': e.detail.value })
  },

  onContactPhoneInput(e) {
    this.setData({ 'form.contactPhone': e.detail.value })
  },

  // ========== 头像上传 ==========
  
  onUploadAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.uploadAvatarToCloud(tempFilePath)
      }
    })
  },

  uploadAvatarToCloud(tempFilePath) {
    wx.showLoading({ title: '上传中...' })
    
    const timestamp = Date.now()
    const cloudPath = `management/avatars/${timestamp}.jpg`
    
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: tempFilePath,
      success: (res) => {
        this.getAvatarUrl(res.fileID)
      },
      fail: (err) => {
        console.error('上传失败:', err)
        wx.showToast({ title: '上传失败', icon: 'none' })
        wx.hideLoading()
      }
    })
  },

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

  // ========== 表单验证 ==========
  
  validateForm() {
    const { form, avatarUrl } = this.data
    
    if (!form.name.trim()) {
      wx.showToast({ title: '请输入姓名', icon: 'none' })
      return false
    }
    if (!form.phone.trim()) {
      wx.showToast({ title: '请输入联系电话', icon: 'none' })
      return false
    }
    if (!/^1[3-9]\d{9}$/.test(form.phone.trim())) {
      wx.showToast({ title: '请输入有效的手机号', icon: 'none' })
      return false
    }
    if (!form.position) {
      wx.showToast({ title: '请选择职位', icon: 'none' })
      return false
    }
    if (!avatarUrl) {
      wx.showToast({ title: '请上传头像', icon: 'none' })
      return false
    }
    
    return true
  },

  // ========== 表单提交 ==========

  onSubmit() {
    if (this.data.isSubmitting) return

    if (!this.validateForm()) {
      return
    }

    this.setData({ isSubmitting: true })
    wx.showLoading({ title: '保存中...', mask: true })

    const db = wx.cloud.database()
    const { mode, id, _source, teamId, teamCode, teamName } = this.data

    // 角色映射：小程序的 position → Web 端 coaches 的 type
    const positionToType = {
      'coach': 'head_coach',
      'assistant_coach': 'assistant_coach',
      'goalkeeper_coach': 'goalkeeper_coach',
      'team_leader': 'team_leader',
      'physical_trainer': 'physical_trainer',
      'doctor': 'doctor',
      'other': 'other'
    }

    const coachData = {
      teamId: teamId || teamCode || '',
      teamName: teamName || '',
      name: this.data.form.name.trim(),
      phone: this.data.form.phone.trim(),
      type: positionToType[this.data.form.position] || this.data.form.position || 'other',
      photoUrl: this.data.avatarUrl,
      description: this.data.form.email || this.data.form.address || '',
      updateTime: db.serverDate()
    }

    // 编辑模式：根据数据来源选择集合
    if (mode === 'edit' && id) {
      const collectionName = _source === 'management' ? 'management' : 'coaches'

      // 如果是 management 旧数据，同时保留原有字段格式
      const updateData = collectionName === 'management'
        ? {
            teamCode: teamCode || teamId || '',
            name: this.data.form.name.trim(),
            phone: this.data.form.phone.trim(),
            email: this.data.form.email.trim(),
            position: this.data.form.position,
            idCard: this.data.form.idCard.trim(),
            gender: this.data.form.gender,
            birthDate: this.data.form.birthDate,
            address: this.data.form.address.trim(),
            contactName: this.data.form.contactName.trim(),
            contactPhone: this.data.form.contactPhone.trim(),
            avatarUrl: this.data.avatarUrl,
            updateTime: db.serverDate()
          }
        : coachData

      db.collection(collectionName).doc(id).update({
        data: updateData,
        success: (res) => {
          wx.hideLoading()
          wx.showToast({
            title: '更新成功',
            icon: 'success',
            duration: 1500,
            success: () => {
              setTimeout(() => {
                wx.navigateBack()
              }, 1500)
            }
          })
        },
        fail: (err) => {
          console.error('更新失败:', err)
          wx.hideLoading()
          wx.showToast({ title: '更新失败，请重试', icon: 'none' })
          this.setData({ isSubmitting: false })
        }
      })
    } else {
      // 新增模式：保存到 coaches（与Web端统一）
      db.collection('coaches').add({
        data: {
          ...coachData,
          createTime: db.serverDate()
        },
        success: (res) => {
          wx.hideLoading()
          wx.showToast({
            title: '添加成功',
            icon: 'success',
            duration: 1500,
            success: () => {
              setTimeout(() => {
                wx.navigateBack()
              }, 1500)
            }
          })
        },
        fail: (err) => {
          console.error('保存失败:', err)
          wx.hideLoading()
          wx.showToast({ title: '保存失败，请重试', icon: 'none' })
          this.setData({ isSubmitting: false })
        }
      })
    }
  },

  onCancel() {
    wx.navigateBack()
  }
})
