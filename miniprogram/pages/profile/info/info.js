const app = getApp()

Page({
  data: {
    form: {
      nickName: '',
      avatarUrl: ''
    },
    currentPhone: '',
    currentRoleName: ''
  },

  onLoad() {
    this.loadUserInfo()
  },

  loadUserInfo() {
    var userInfo = wx.getStorageSync('userInfo') || {}
    var currentRole = wx.getStorageSync('currentRole') || ''
    var roleNameMap = {
      organizer: '主办方',
      coach: '教练',
      referee: '裁判'
    }

    this.setData({
      form: {
        nickName: userInfo.nickName || '',
        avatarUrl: userInfo.avatarUrl || ''
      },
      currentPhone: wx.getStorageSync('phoneNumber') || '',
      currentRoleName: roleNameMap[currentRole] || currentRole || ''
    })
  },

  onNickNameInput(e) {
    this.setData({ 'form.nickName': e.detail.value })
  },

  chooseAvatar() {
    var that = this
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success(res) {
        var file = (((res || {}).tempFiles || [])[0] || {}).tempFilePath || ''
        if (file) {
          that.setData({ 'form.avatarUrl': file })
        }
      }
    })
  },

  useWechatProfile() {
    var that = this
    if (!wx.getUserProfile) {
      wx.showToast({ title: '当前环境不支持微信授权', icon: 'none' })
      return
    }

    wx.getUserProfile({
      desc: '用于同步微信头像和昵称',
      success(res) {
        var userInfo = res.userInfo || {}
        that.setData({
          'form.nickName': userInfo.nickName || that.data.form.nickName,
          'form.avatarUrl': userInfo.avatarUrl || that.data.form.avatarUrl
        })
      },
      fail() {
        wx.showToast({ title: '未获取到微信资料', icon: 'none' })
      }
    })
  },

  saveProfile() {
    var userInfo = wx.getStorageSync('userInfo') || {}
    var nickName = (this.data.form.nickName || '').trim()
    var avatarUrl = this.data.form.avatarUrl || ''

    if (!nickName) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    var nextUserInfo = Object.assign({}, userInfo, {
      nickName: nickName,
      avatarUrl: avatarUrl
    })

    if (app && typeof app.updateUserInfo === 'function') {
      app.updateUserInfo(nextUserInfo)
    } else {
      wx.setStorageSync('userInfo', nextUserInfo)
    }

    wx.showToast({ title: '保存成功', icon: 'success' })
    setTimeout(function() {
      wx.navigateBack()
    }, 600)
  }
})
