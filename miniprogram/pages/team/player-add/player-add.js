// pages/team/player-add/player-add.js
Page({
  data: {
    form: {
      name: '',
      gender: 'male',
      birthDate: '',
      idCard: '',
      nationality: '中国',
      nativePlace: '',
      jerseyNumber: '',
      position: '',
      jerseyName: '',
      contactName: '',
      contactPhone: '',
      clothingSize: ''
    },
    photoUrl: '',
    photoFileId: '',
    positionLabel: '',
    genderLabel: '男',
    clothingSizeLabel: '',
    genderIndex: 0,
    positionIndex: -1,
    clothingSizeIndex: -1,
    genderOptions: [
      { value: 'male', label: '男' },
      { value: 'female', label: '女' }
    ],
    positionOptions: [
      { value: 'GK', label: '守门员' },
      { value: 'DF', label: '后卫' },
      { value: 'MF', label: '中场' },
      { value: 'FW', label: '前锋' }
    ],
    clothingSizeOptions: [
      { value: 'S', label: 'S' },
      { value: 'M', label: 'M' },
      { value: 'L', label: 'L' },
      { value: 'XL', label: 'XL' },
      { value: 'XXL', label: 'XXL' },
      { value: 'XXXL', label: 'XXXL' }
    ],
    teamId: '',
    teamCode: '',
    teamName: '',
    isSubmitting: false,
    id: '',
    mode: 'add',
    cropper: {
      visible: false,
      imagePath: '',
      sourceWidth: 0,
      sourceHeight: 0,
      cropWidth: 0,
      cropHeight: 0,
      fitWidth: 0,
      fitHeight: 0,
      renderWidth: 0,
      renderHeight: 0,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      sliderValue: 100,
      minSlider: 100,
      maxSlider: 280
    }
  },

  onLoad(options) {
    const teamId = options.teamId || ''
    const teamCode = options.teamCode || options.teamId || ''
    const teamName = options.teamName || ''
    const id = options.id || ''
    const mode = options.mode || 'add'

    this.setData({
      teamId,
      teamCode,
      teamName,
      id,
      mode,
      genderIndex: 0,
      genderLabel: this.data.genderOptions[0].label
    })

    if (mode === 'edit' && id) {
      this.loadPlayerData(id)
    }
  },

  async loadPlayerData(id) {
    try {
      wx.showLoading({ title: '加载中...' })
      const db = wx.cloud.database()
      const res = await db.collection('players').doc(id).get()
      const data = res.data || {}
      const genderIndex = this.data.genderOptions.findIndex((item) => item.value === (data.gender || 'male'))
      const positionIndex = this.data.positionOptions.findIndex((item) => item.value === (data.position || ''))
      const clothingSizeIndex = this.data.clothingSizeOptions.findIndex((item) => item.value === (data.clothingSize || ''))

      this.setData({
        form: {
          name: data.name || '',
          gender: data.gender || 'male',
          birthDate: data.birthDate || data.birthday || '',
          idCard: data.idCard || '',
          nationality: data.nationality || '中国',
          nativePlace: data.nativePlace || '',
          jerseyNumber: data.jerseyNumber || '',
          position: data.position || '',
          jerseyName: data.jerseyName || '',
          contactName: data.contactName || '',
          contactPhone: data.contactPhone || '',
          clothingSize: data.clothingSize || ''
        },
        photoUrl: data.photoUrl || data.photo || '',
        photoFileId: data.photoFileId || '',
        genderIndex: genderIndex >= 0 ? genderIndex : 0,
        genderLabel: genderIndex >= 0 ? this.data.genderOptions[genderIndex].label : this.data.genderOptions[0].label,
        positionIndex,
        positionLabel: positionIndex >= 0 ? this.data.positionOptions[positionIndex].label : '',
        clothingSizeIndex,
        clothingSizeLabel: clothingSizeIndex >= 0 ? this.data.clothingSizeOptions[clothingSizeIndex].label : ''
      })
      wx.hideLoading()
    } catch (err) {
      wx.hideLoading()
      console.error('加载球员失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  onNameInput(e) {
    const name = e.detail.value || ''
    this.setData({
      'form.name': name,
      'form.jerseyName': this.generateJerseyName(name)
    })
  },

  onGenderChange(e) {
    const index = Number(e.detail.value || 0)
    const option = this.data.genderOptions[index] || this.data.genderOptions[0]
    this.setData({
      'form.gender': option.value,
      genderIndex: index,
      genderLabel: option.label
    })
  },

  onBirthDateChange(e) {
    this.setData({ 'form.birthDate': e.detail.value })
  },

  onIdCardInput(e) {
    const idCard = e.detail.value || ''
    this.setData({ 'form.idCard': idCard })
    if (idCard.length === 18) {
      this.parseIdCard(idCard)
    }
  },

  onNationalityInput(e) {
    this.setData({ 'form.nationality': e.detail.value || '' })
  },

  onNativePlaceInput(e) {
    this.setData({ 'form.nativePlace': e.detail.value || '' })
  },

  onJerseyNumberInput(e) {
    this.setData({ 'form.jerseyNumber': e.detail.value || '' })
  },

  onPositionChange(e) {
    const index = Number(e.detail.value || -1)
    const option = this.data.positionOptions[index]
    if (!option) return
    this.setData({
      'form.position': option.value,
      positionIndex: index,
      positionLabel: option.label
    })
  },

  onClothingSizeChange(e) {
    const index = Number(e.detail.value || -1)
    const option = this.data.clothingSizeOptions[index]
    if (!option) return
    this.setData({
      'form.clothingSize': option.value,
      clothingSizeIndex: index,
      clothingSizeLabel: option.label
    })
  },

  onContactNameInput(e) {
    this.setData({ 'form.contactName': e.detail.value || '' })
  },

  onContactPhoneInput(e) {
    this.setData({ 'form.contactPhone': e.detail.value || '' })
  },

  parseIdCard(idCard) {
    const birthDateStr = idCard.substring(6, 14)
    if (birthDateStr.length === 8) {
      const birthDate = birthDateStr.substring(0, 4) + '-' + birthDateStr.substring(4, 6) + '-' + birthDateStr.substring(6, 8)
      this.setData({ 'form.birthDate': birthDate })
    }

    const genderCode = parseInt(idCard.substring(16, 17), 10)
    const gender = genderCode % 2 === 1 ? 'male' : 'female'
    const genderIndex = this.data.genderOptions.findIndex((item) => item.value === gender)
    this.setData({
      'form.gender': gender,
      genderIndex: genderIndex >= 0 ? genderIndex : 0,
      genderLabel: genderIndex >= 0 ? this.data.genderOptions[genderIndex].label : this.data.genderOptions[0].label
    })
  },

  async onUploadPhoto() {
    try {
      const tempFilePath = await this.chooseImage()
      if (!tempFilePath) return
      await this.openCropper(tempFilePath)
    } catch (err) {
      console.error('选择照片失败:', err)
      wx.showToast({ title: err.message || '选择照片失败', icon: 'none' })
    }
  },

  chooseImage() {
    return new Promise((resolve, reject) => {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const file = res.tempFiles && res.tempFiles[0]
          resolve(file ? file.tempFilePath : '')
        },
        fail: (err) => {
          if (err && err.errMsg && err.errMsg.indexOf('cancel') !== -1) {
            resolve('')
            return
          }
          reject(new Error('选择照片失败'))
        }
      })
    })
  },

  openCropper(tempFilePath) {
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src: tempFilePath,
        success: (imgInfo) => {
          const systemInfo = wx.getSystemInfoSync()
          const cropWidth = Math.min(systemInfo.windowWidth - 56, 280)
          const cropHeight = Math.round(cropWidth * 4 / 3)
          const baseScale = Math.max(cropWidth / imgInfo.width, cropHeight / imgInfo.height)
          const fitWidth = imgInfo.width * baseScale
          const fitHeight = imgInfo.height * baseScale

          this.setData({
            cropper: {
              visible: true,
              imagePath: tempFilePath,
              sourceWidth: imgInfo.width,
              sourceHeight: imgInfo.height,
              cropWidth,
              cropHeight,
              fitWidth,
              fitHeight,
              renderWidth: fitWidth,
              renderHeight: fitHeight,
              offsetX: (cropWidth - fitWidth) / 2,
              offsetY: (cropHeight - fitHeight) / 2,
              scale: 1,
              sliderValue: 100,
              minSlider: 100,
              maxSlider: 280
            }
          })
          resolve()
        },
        fail: () => reject(new Error('读取图片失败'))
      })
    })
  },

  onCropTouchStart(e) {
    const touch = e.touches && e.touches[0]
    if (!touch || !this.data.cropper.visible) return
    this.dragState = {
      startX: touch.clientX,
      startY: touch.clientY,
      offsetX: this.data.cropper.offsetX,
      offsetY: this.data.cropper.offsetY
    }
  },

  onCropTouchMove(e) {
    const touch = e.touches && e.touches[0]
    if (!touch || !this.dragState || !this.data.cropper.visible) return
    const deltaX = touch.clientX - this.dragState.startX
    const deltaY = touch.clientY - this.dragState.startY
    const cropper = this.data.cropper
    const nextOffsetX = this.dragState.offsetX + deltaX
    const nextOffsetY = this.dragState.offsetY + deltaY
    const clamped = this.clampOffsets(nextOffsetX, nextOffsetY, cropper.renderWidth, cropper.renderHeight, cropper.cropWidth, cropper.cropHeight)

    this.setData({
      'cropper.offsetX': clamped.x,
      'cropper.offsetY': clamped.y
    })
  },

  onCropTouchEnd() {
    this.dragState = null
  },

  onCropScaleChange(e) {
    const sliderValue = Number(e.detail.value || 100)
    this.applyCropScale(sliderValue / 100, sliderValue)
  },

  applyCropScale(scale, sliderValue) {
    const cropper = this.data.cropper
    if (!cropper.visible) return

    const renderWidth = cropper.fitWidth * scale
    const renderHeight = cropper.fitHeight * scale
    const oldCenterX = cropper.offsetX + cropper.renderWidth / 2
    const oldCenterY = cropper.offsetY + cropper.renderHeight / 2
    const nextOffsetX = oldCenterX - renderWidth / 2
    const nextOffsetY = oldCenterY - renderHeight / 2
    const clamped = this.clampOffsets(nextOffsetX, nextOffsetY, renderWidth, renderHeight, cropper.cropWidth, cropper.cropHeight)

    this.setData({
      'cropper.scale': scale,
      'cropper.sliderValue': sliderValue,
      'cropper.renderWidth': renderWidth,
      'cropper.renderHeight': renderHeight,
      'cropper.offsetX': clamped.x,
      'cropper.offsetY': clamped.y
    })
  },

  clampOffsets(offsetX, offsetY, renderWidth, renderHeight, cropWidth, cropHeight) {
    const minX = Math.min(0, cropWidth - renderWidth)
    const minY = Math.min(0, cropHeight - renderHeight)
    return {
      x: Math.min(0, Math.max(minX, offsetX)),
      y: Math.min(0, Math.max(minY, offsetY))
    }
  },

  onCancelCropper() {
    this.dragState = null
    this.setData({
      cropper: {
        visible: false,
        imagePath: '',
        sourceWidth: 0,
        sourceHeight: 0,
        cropWidth: 0,
        cropHeight: 0,
        fitWidth: 0,
        fitHeight: 0,
        renderWidth: 0,
        renderHeight: 0,
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        sliderValue: 100,
        minSlider: 100,
        maxSlider: 280
      }
    })
  },

  noop() {},

  async onConfirmCrop() {
    try {
      wx.showLoading({ title: '处理中...', mask: true })
      const croppedTempPath = await this.exportCroppedPhoto()
      const transparentBase64 = await this.removeBackgroundWithBaidu(croppedTempPath)
      const uploadResult = await this.uploadPhotoBase64(transparentBase64)

      this.setData({
        photoUrl: uploadResult.tempUrl || '',
        photoFileId: uploadResult.fileID || ''
      })
      this.onCancelCropper()
      wx.hideLoading()
      wx.showToast({ title: '照片已更新', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      console.error('处理照片失败:', err)
      wx.showToast({ title: err.message || '处理照片失败', icon: 'none', duration: 2200 })
    }
  },

  exportCroppedPhoto() {
    return new Promise((resolve, reject) => {
      const cropper = this.data.cropper
      const scale = cropper.renderWidth / cropper.sourceWidth
      const sourceX = Math.max(0, -cropper.offsetX / scale)
      const sourceY = Math.max(0, -cropper.offsetY / scale)
      const sourceWidth = Math.min(cropper.sourceWidth - sourceX, cropper.cropWidth / scale)
      const sourceHeight = Math.min(cropper.sourceHeight - sourceY, cropper.cropHeight / scale)
      const destWidth = 300
      const destHeight = 400
      const ctx = wx.createCanvasContext('photoProcessCanvas', this)

      ctx.clearRect(0, 0, destWidth, destHeight)
      ctx.drawImage(cropper.imagePath, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, destWidth, destHeight)
      ctx.draw(false, () => {
        setTimeout(() => {
          wx.canvasToTempFilePath({
            canvasId: 'photoProcessCanvas',
            x: 0,
            y: 0,
            width: destWidth,
            height: destHeight,
            destWidth,
            destHeight,
            fileType: 'jpg',
            quality: 0.9,
            success: (res) => resolve(res.tempFilePath),
            fail: () => reject(new Error('裁剪导出失败'))
          }, this)
        }, 80)
      })
    })
  },

  readFileAsBase64(filePath) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath,
        encoding: 'base64',
        success: (res) => resolve(res.data),
        fail: () => reject(new Error('读取图片数据失败'))
      })
    })
  },

  async removeBackgroundWithBaidu(tempFilePath) {
    const imageBase64 = await this.readFileAsBase64(tempFilePath)
    const res = await wx.cloud.callFunction({
      name: 'baiduRemoveBg',
      data: {
        action: 'removeBackground',
        imageBase64
      }
    })
    const result = res.result || {}
    if (!result.success || !result.data) {
      throw new Error(result.message || '百度抠图失败')
    }
    return 'data:image/png;base64,' + result.data
  },

  async uploadPhotoBase64(base64Data) {
    const res = await wx.cloud.callFunction({
      name: 'uploadFile',
      data: {
        action: 'uploadBase64',
        base64Data,
        folder: 'players/photos'
      }
    })
    const result = res.result || {}
    if (!result.success || !result.fileID) {
      throw new Error(result.message || '上传照片失败')
    }
    if (!result.tempUrl) {
      const tempUrl = await this.getTempFileURL(result.fileID)
      result.tempUrl = tempUrl
    }
    return result
  },

  getTempFileURL(fileID) {
    return new Promise((resolve, reject) => {
      wx.cloud.getTempFileURL({
        fileList: [fileID],
        success: (res) => {
          const file = res.fileList && res.fileList[0]
          if (file && file.tempFileURL) {
            resolve(file.tempFileURL)
            return
          }
          reject(new Error('获取图片地址失败'))
        },
        fail: () => reject(new Error('获取图片地址失败'))
      })
    })
  },

  generateJerseyName(name) {
    if (!name) return ''
    const compact = String(name).replace(/\s+/g, '')
    const latin = compact.replace(/[^a-zA-Z]/g, '').toUpperCase()
    if (latin) {
      return latin.slice(0, 12)
    }
    return compact.slice(0, 6)
  },

  async onSubmit() {
    if (this.data.isSubmitting) return

    const { form, photoUrl, photoFileId, teamId, teamCode, teamName, mode, id } = this.data
    if (!form.name.trim()) return wx.showToast({ title: '请输入球员姓名', icon: 'none' })
    if (!form.idCard.trim()) return wx.showToast({ title: '请输入身份证号', icon: 'none' })
    if (!form.birthDate) return wx.showToast({ title: '请选择出生日期', icon: 'none' })
    if (!form.position) return wx.showToast({ title: '请选择场上位置', icon: 'none' })
    if (!form.jerseyNumber) return wx.showToast({ title: '请输入球衣号码', icon: 'none' })
    if (!photoUrl) return wx.showToast({ title: '请上传证件照片', icon: 'none' })

    this.setData({ isSubmitting: true })
    wx.showLoading({ title: '保存中...', mask: true })

    const db = wx.cloud.database()
    const currentUser = wx.getStorageSync('userInfo') || {}
    const bindTeamId = teamId || teamCode || ''
    const bindTeamCode = teamCode || teamId || ''
    const currentPhone = currentUser.phoneNumber || currentUser.phone || wx.getStorageSync('phoneNumber') || ''

    const formData = {
      teamId: bindTeamId,
      teamCode: bindTeamCode,
      teamName: teamName || '',
      name: form.name.trim(),
      gender: form.gender,
      birthDate: form.birthDate,
      birthday: form.birthDate,
      idCard: form.idCard.trim(),
      photo: photoUrl,
      photoUrl,
      photoFileId: photoFileId || '',
      nationality: form.nationality || '中国',
      nativePlace: form.nativePlace.trim(),
      jerseyNumber: parseInt(form.jerseyNumber, 10) || form.jerseyNumber,
      position: form.position,
      jerseyName: form.jerseyName,
      contactName: form.contactName.trim(),
      contactPhone: form.contactPhone.trim(),
      clothingSize: form.clothingSize,
      updateTime: db.serverDate(),
      creatorPhone: currentPhone,
      creatorId: currentUser._id || wx.getStorageSync('userId') || '',
      source: 'mini_program',
      isBound: true,
      status: 'active'
    }

    try {
      if (mode === 'edit' && id) {
        await db.collection('players').doc(id).update({ data: formData })
      } else {
        await db.collection('players').add({
          data: {
            ...formData,
            creatorOpenId: wx.getStorageSync('openid') || '',
            createTime: db.serverDate()
          }
        })
      }
      wx.hideLoading()
      wx.showToast({
        title: mode === 'edit' ? '更新成功' : '添加成功',
        icon: 'success',
        duration: 1200
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1200)
    } catch (err) {
      wx.hideLoading()
      console.error('保存球员失败:', err)
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
      this.setData({ isSubmitting: false })
      return
    }

    this.setData({ isSubmitting: false })
  },

  onCancel() {
    if (this.data.cropper.visible) {
      this.onCancelCropper()
      return
    }
    wx.navigateBack()
  }
})