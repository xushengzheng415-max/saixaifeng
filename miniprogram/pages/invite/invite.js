// pages/invite/invite.js
const app = getApp()

Page({

  data: {
    inviteInfo: null,
    isLoggedIn: false,
    submitSuccess: false,
    showInviteForm: false,
    submitResult: {},
    certLevels: ['无', 'D级', 'C级', 'B级', 'A级', '亚足联B级', '亚足联A级', '职业级'],
    certIndex: 0,
    form: {
      name: '',
      phone: '',
      idNumber: '',
      avatarUrl: '',
      specialty: '',
      certLevel: ''
    }
  },

  onLoad(options) {
    // 扫描小程序码场景：scene = inviteId
    if (options && options.scene) {
      const inviteId = decodeURIComponent(options.scene)
      this.loadInviteFromScene(inviteId)
      return
    }

    // 普通链接场景
    if (options && options.teamId) {
      this.setData({
        inviteInfo: {
          type: options.type || 'coach',
          teamId: options.teamId,
          teamName: decodeURIComponent(options.teamName || ''),
          role: decodeURIComponent(options.role || '教练')
        }
      })
      const userInfo = wx.getStorageSync('userInfo')
      if (userInfo && userInfo._id) {
        this.setData({ isLoggedIn: true, showInviteForm: !this.data.submitSuccess })
        this.prefillForm(userInfo)
      }
    } else {
      wx.showToast({ title: '邀请参数错误', icon: 'none' })
    }
  },

  // 通过 scene（小程序码）加载邀请信息
  async loadInviteFromScene(inviteId) {
    wx.showLoading({ title: '加载中...' })
    try {
      const db = wx.cloud.database()
      const res = await db.collection('invite_records').doc(inviteId).get()
      if (res.data) {
        const info = res.data
        this.setData({
          inviteInfo: {
            type: info.type || 'coach',
            teamId: info.teamId,
            teamName: info.teamName || '',
            role: info.role || '教练'
          }
        })
        const userInfo = wx.getStorageSync('userInfo')
        if (userInfo && userInfo._id) {
          this.setData({ isLoggedIn: true, showInviteForm: !this.data.submitSuccess })
          this.prefillForm(userInfo)
        }
      } else {
        wx.showToast({ title: '邀请已过期', icon: 'none' })
      }
    } catch (err) {
      console.error('加载邀请信息失败:', err)
      wx.showToast({ title: '邀请信息加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  handleWechatLogin() {
    wx.getUserProfile({
      desc: '用于绑定邀请资料',
      success: (res) => {
        const userInfo = res.userInfo
        if (userInfo.avatarUrl) {
          this.uploadAvatar(userInfo.avatarUrl, (url) => {
            userInfo.avatarUrl = url
            wx.setStorageSync('userInfo', userInfo)
            this.setData({ isLoggedIn: true, showInviteForm: !this.data.submitSuccess, 'form.avatarUrl': url })
            this.prefillForm(userInfo)
          })
        } else {
          wx.setStorageSync('userInfo', userInfo)
          this.setData({ isLoggedIn: true, showInviteForm: !this.data.submitSuccess })
          this.prefillForm(userInfo)
        }
      },
      fail: () => {
        wx.showToast({ title: '需要授权登录', icon: 'none' })
      }
    })
  },

  uploadAvatar(filePath, callback) {
    const timestamp = new Date().getTime()
    const random = Math.random().toString(36).slice(2)
    wx.cloud.uploadFile({
      cloudPath: 'avatars/' + timestamp + '_' + random + '.jpg',
      filePath: filePath,
      success: (res) => callback(res.fileID),
      fail: () => callback(filePath)
    })
  },

  handleChooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        this.uploadAvatar(tempPath, (url) => {
          this.setData({ 'form.avatarUrl': url })
        })
      }
    })
  },

  prefillForm(userInfo) {
    if (userInfo) {
      this.setData({
        'form.name': userInfo.nickName || userInfo.name || '',
        'form.avatarUrl': userInfo.avatarUrl || ''
      })
    }
  },

  handleInputChange(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ ['form.' + field]: e.detail.value })
  },

  handleCertChange(e) {
    const idx = e.detail.value
    this.setData({
      certIndex: idx,
      'form.certLevel': this.data.certLevels[idx]
    })
  },

  async handleSubmit() {
    const { form, inviteInfo } = this.data
    if (!form.name.trim()) return wx.showToast({ title: '请输入姓名', icon: 'none' })
    if (!form.phone || form.phone.length !== 11) return wx.showToast({ title: '请输入正确手机号', icon: 'none' })

    wx.showLoading({ title: '提交中...' })
    try {
      const db = wx.cloud.database()
      const _ = db.command

      const existRes = await db.collection('coach_library').where({ phone: form.phone }).get()
      let coachId

      if (existRes.data.length > 0) {
        coachId = existRes.data[0]._id
        await db.collection('coach_library').doc(coachId).update({
          data: {
            name: form.name,
            avatarUrl: form.avatarUrl,
            idNumber: form.idNumber,
            specialty: form.specialty,
            certLevel: form.certLevel,
            updateTime: db.serverDate()
          }
        })
      } else {
        const addRes = await db.collection('coach_library').add({
          data: {
            name: form.name,
            phone: form.phone,
            avatarUrl: form.avatarUrl,
            idNumber: form.idNumber,
            specialty: form.specialty,
            certLevel: form.certLevel,
            createTime: db.serverDate(),
            updateTime: db.serverDate()
          }
        })
        coachId = addRes._id
      }

      await db.collection('coach_assignments').add({
        data: {
          coachId: coachId,
          teamId: inviteInfo.teamId,
          role: inviteInfo.role || '教练',
          type: inviteInfo.type || 'coach',
          status: 'active',
          createTime: db.serverDate()
        }
      })

      const userInfo = wx.getStorageSync('userInfo') || {}
      const userRes = await db.collection('users').where({ openId: userInfo.openId || '' }).get()
      if (userRes.data.length > 0) {
        await db.collection('users').doc(userRes.data[0]._id).update({
          data: {
            name: form.name,
            phone: form.phone,
            avatarUrl: form.avatarUrl,
            relatedTeams: _.addToSet(inviteInfo.teamId),
            roles: _.addToSet(inviteInfo.type === 'coach' ? 'coach' : 'player'),
            updateTime: db.serverDate()
          }
        })
      } else {
        await db.collection('users').add({
          data: {
            openId: userInfo.openId || '',
            name: form.name,
            phone: form.phone,
            avatarUrl: form.avatarUrl,
            relatedTeams: [inviteInfo.teamId],
            roles: [inviteInfo.type === 'coach' ? 'coach' : 'player'],
            createTime: db.serverDate(),
            updateTime: db.serverDate()
          }
        })
      }

      wx.hideLoading()
      this.setData({
        submitSuccess: true,
        showInviteForm: false,
        submitResult: { role: inviteInfo.role, teamName: inviteInfo.teamName }
      })
    } catch (err) {
      wx.hideLoading()
      console.error('提交失败', err)
      wx.showToast({ title: '提交失败，请重试', icon: 'none' })
    }
  },

  handleBackToHome() {
    wx.switchTab({ url: '/pages/home/home' })
  }
})
