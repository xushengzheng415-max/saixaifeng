// pages/identity/identity.js
// 球员身份卡展示页 - 完整布局 + Canvas纯色背景抠图

Page({

  data: {
    // 头像相关
    avatarUrl: '/images/default-avatar.png',
    defaultAvatar: '/images/default-avatar.png',
    
    // 其他数据
    cards: [],
    currentCard: null,
    cardBgUrl: '',
    nationalityFlagUrl: '',
    nativePlace: '河南省郑州中原'
  },

  onLoad() {
    this.loadCards()
  },

  onShow() {
    this.loadCards()
  },

  // ========== 头像上传与 Canvas 抠图核心功能 ==========
  
  /**
   * 点击头像 - 触发上传流程
   */
  async onUploadAvatar() {
    try {
      // 1. 选择图片
      const tempFile = await this.chooseImage()
      if (!tempFile) return

      // 2. 显示加载提示
      wx.showLoading({ 
        title: '智能抠图中...',
        mask: true
      })

      // 3. 使用 Canvas 进行纯色背景抠图
      const transparentUrl = await this.removeBackgroundWithCanvas(tempFile)
      
      // 4. 上传透明 PNG 到云存储
      const fileID = await this.uploadTransparentImage(transparentUrl)
      
      // 5. 获取云存储的临时 URL
      const cloudUrl = await this.getTempUrl(fileID)
      
      // 6. 更新头像显示
      this.setData({
        avatarUrl: cloudUrl
      })

      // 7. 保存到数据库
      await this.saveAvatarToDatabase(cloudUrl)

      wx.showToast({
        title: '抠图成功！',
        icon: 'success'
      })

    } catch (error) {
      console.error('头像上传/抠图失败:', error)
      wx.showToast({
        title: error.message || '处理失败，请重试',
        icon: 'none',
        duration: 2000
      })
    } finally {
      wx.hideLoading()
    }
  },

  /**
   * 步骤1：从相册选择图片
   */
  chooseImage() {
    return new Promise((resolve, reject) => {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const tempFilePath = res.tempFiles[0].tempFilePath
          resolve(tempFilePath)
        },
        fail: (err) => {
          if (err.errMsg && err.errMsg.includes('cancel')) {
            resolve(null)
          } else {
            reject(new Error('选择图片失败'))
          }
        }
      })
    })
  },

  /**
   * 步骤2：Canvas 纯色背景抠图
   * 自动检测背景色并去除（使用固定尺寸避免真机问题）
   */
  removeBackgroundWithCanvas(tempFilePath) {
    return new Promise((resolve, reject) => {
      const ctx = wx.createCanvasContext('bgRemoveCanvas')
      
      // 获取图片信息
      wx.getImageInfo({
        src: tempFilePath,
        success: (imgInfo) => {
          // 限制处理尺寸，避免真机性能问题
          const MAX_SIZE = 800
          let srcWidth = imgInfo.width
          let srcHeight = imgInfo.height
          
          // 计算缩放比例
          let scale = 1
          if (srcWidth > MAX_SIZE || srcHeight > MAX_SIZE) {
            scale = Math.min(MAX_SIZE / srcWidth, MAX_SIZE / srcHeight)
          }
          
          const width = Math.floor(srcWidth * scale)
          const height = Math.floor(srcHeight * scale)
          
          console.log('原图尺寸:', srcWidth, 'x', srcHeight, '处理尺寸:', width, 'x', height)
          
          const canvasId = 'bgRemoveCanvas'
          
          // 绘制原图到 Canvas（自动缩放）
          ctx.drawImage(tempFilePath, 0, 0, width, height)
          ctx.draw(false, () => {
            // 延迟一下确保绘制完成
            setTimeout(() => {
              // 获取图片像素数据
              wx.canvasGetImageData({
                canvasId: canvasId,
                x: 0,
                y: 0,
                width: width,
                height: height,
                success: (res) => {
                  const data = res.data
                  
                  // 自动检测背景色（取四个角的像素平均值）
                  const bgColor = this.detectBackgroundColor(data, width, height)
                  console.log('检测到背景色:', bgColor)
                  
                  // 容差值（越大去除范围越大）
                  const tolerance = 40
                  
                  // 遍历像素，去除背景色
                  for (let i = 0; i < data.length; i += 4) {
                    const r = data[i]
                    const g = data[i + 1]
                    const b = data[i + 2]
                    
                    // 计算与背景色的差异
                    const diff = Math.abs(r - bgColor.r) + 
                                 Math.abs(g - bgColor.g) + 
                                 Math.abs(b - bgColor.b)
                    
                    // 如果接近背景色，设为透明
                    if (diff < tolerance * 3) {
                      data[i + 3] = 0 // Alpha = 0
                    }
                  }
                  
                  // 将处理后的像素数据写回 Canvas
                  wx.canvasPutImageData({
                    canvasId: canvasId,
                    x: 0,
                    y: 0,
                    width: width,
                    height: height,
                    data: data,
                    success: () => {
                      // 延迟一下确保写入完成
                      setTimeout(() => {
                        // 导出为临时 PNG 文件
                        wx.canvasToTempFilePath({
                          canvasId: canvasId,
                          x: 0,
                          y: 0,
                          width: width,
                          height: height,
                          destWidth: width,
                          destHeight: height,
                          fileType: 'png',
                          quality: 1,
                          success: (fileRes) => {
                            console.log('抠图完成:', fileRes.tempFilePath)
                            resolve(fileRes.tempFilePath)
                          },
                          fail: (err) => {
                            console.error('导出图片失败:', err)
                            reject(new Error('导出图片失败'))
                          }
                        })
                      }, 100)
                    },
                    fail: (err) => {
                      console.error('写入像素失败:', err)
                      reject(new Error('图片处理失败'))
                    }
                  })
                },
                fail: (err) => {
                  console.error('获取像素失败:', err)
                  reject(new Error('读取图片失败'))
                }
              })
            }, 100)
          })
        },
        fail: reject
      })
    })
  },

  /**
   * 自动检测背景色
   * 取图片四个角的像素平均值
   */
  detectBackgroundColor(data, width, height) {
    const corners = [
      { x: 0, y: 0 },                           // 左上角
      { x: width - 1, y: 0 },                   // 右上角
      { x: 0, y: height - 1 },                  // 左下角
      { x: width - 1, y: height - 1 }           // 右下角
    ]
    
    let totalR = 0, totalG = 0, totalB = 0
    
    corners.forEach(point => {
      const index = (point.y * width + point.x) * 4
      totalR += data[index]
      totalG += data[index + 1]
      totalB += data[index + 2]
    })
    
    return {
      r: Math.round(totalR / 4),
      g: Math.round(totalG / 4),
      b: Math.round(totalB / 4)
    }
  },

  /**
   * 步骤3：上传透明 PNG 到云存储
   */
  uploadTransparentImage(tempFilePath) {
    return new Promise((resolve, reject) => {
      const timestamp = Date.now()
      const randomStr = Math.random().toString(36).substring(2, 8)
      const cloudPath = `avatars/transparent/${timestamp}_${randomStr}.png`

      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: tempFilePath,
        success: (res) => {
          console.log('透明图上传成功，fileID:', res.fileID)
          resolve(res.fileID)
        },
        fail: (err) => {
          console.error('上传失败:', err)
          reject(new Error('图片上传失败'))
        }
      })
    })
  },

  /**
   * 辅助：将云存储 fileID 转为临时 URL
   */
  getTempUrl(fileID) {
    return new Promise((resolve, reject) => {
      wx.cloud.getTempFileURL({
        fileList: [fileID],
        success: (res) => {
          if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
            resolve(res.fileList[0].tempFileURL)
          } else {
            reject(new Error('获取图片链接失败'))
          }
        },
        fail: reject
      })
    })
  },

  /**
   * 可选：保存头像到数据库
   */
  async saveAvatarToDatabase(avatarUrl) {
    try {
      const db = wx.cloud.database()
      const currentCardId = this.data.currentCard && this.data.currentCard._id
      
      if (!currentCardId) return

      await db.collection('identity_cards').doc(currentCardId).update({
        data: {
          avatarUrl: avatarUrl,
          updateTime: db.serverDate()
        }
      })
      
      console.log('头像已保存到数据库')
    } catch (err) {
      console.error('保存到数据库失败:', err)
    }
  },

  // ========== 原有功能 ==========

  async loadCards() {
    try {
      wx.showLoading({ title: '加载中...' })
      
      const db = wx.cloud.database()
      const res = await db.collection('identity_cards')
        .orderBy('createTime', 'desc')
        .get()

      if (res.data.length > 0) {
        const bgMap = {
          bronze: '../../images/cards/bronze-card.png',
          silver: '../../images/cards/silver-card.png',
          gold: '../../images/cards/gold-card.png'
        }

        const cards = res.data.map(card => {
          const points = card.participationPoints || 0
          let tier = 'bronze'
          if (points >= 1000) tier = 'gold'
          else if (points >= 500) tier = 'silver'
          
          return {
            ...card,
            tier,
            tierName: tier === 'gold' ? '黄金' : tier === 'silver' ? '白银' : '青铜',
            cardBg: bgMap[tier]
          }
        })

        const currentCardId = wx.getStorageSync('currentCardId')
        let currentCard = cards.find(c => c._id === currentCardId) || cards[0]

        this.setData({
          cards,
          currentCard,
          cardBgUrl: currentCard.cardBg,
          avatarUrl: currentCard.avatarUrl || '/images/default-avatar.png'
        })
      } else {
        this.setData({
          cards: [],
          currentCard: null
        })
      }
    } catch (err) {
      console.error('加载失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
    wx.hideLoading()
  },

  editCard() {
    wx.showToast({ title: '编辑功能开发中', icon: 'none' })
  },

  previewCard() {
    if (this.data.currentCard) {
      wx.navigateTo({
        url: `/pages/card-preview/card-preview?identityCardId=${this.data.currentCard._id}`
      })
    }
  },

  createCard() {
    wx.showToast({ title: '创建身份卡功能开发中', icon: 'none' })
  }
})
