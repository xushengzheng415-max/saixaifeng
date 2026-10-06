/**
 * painter-palette.js
 * Painter 2.0 球员卡模板配置
 * 
 * 使用方法：
 * 1. 在小程序中引入 painter 组件
 * 2. 将此 JSON 作为 palette 传入 painter 组件
 * 3. 配合云函数 generatePlayerCard 生成的头像使用
 * 
 * 模板基于：金卡数据.png（1696x2528像素）
 * 单位换算：原图/2 = 848x1264（rpx单位）
 */

module.exports = {
  // 画布尺寸（rpx）
  width: 846,
  height: 1264,

  // 背景层（卡片底图，云存储地址）
  background: '{{backgroundUrl}}',

  // ===== 所有元素层 =====
  views: [
    // ===== 1. 球员头像（右侧区域，抠图后） =====
    {
      type: 'image',
      url: '{{avatarUrl}}',  // 云函数处理后的透明背景头像
      css: {
        width: '340px',
        height: '440px',
        top: '100px',
        left: '425px'
      }
    },

    // ===== 2. 队徽（左侧中上部） =====
    {
      type: 'image',
      url: '{{teamLogoUrl}}',  // 球队logo
      css: {
        width: '110px',
        height: '110px',
        top: '470px',
        left: '50px'
      }
    },

    // ===== 3. 国旗（下方偏左） =====
    {
      type: 'image',
      url: '{{flagUrl}}',  // 国旗图片URL
      css: {
        width: '80px',
        height: '56px',
        top: '625px',
        left: '50px'
      }
    },

    // ===== 4. 号码（左侧超大字号） =====
    {
      type: 'text',
      text: '{{jerseyNumber}}',
      css: {
        fontSize: '200px',
        fontWeight: 'bold',
        color: '#FFFFFF',
        top: '90px',
        left: '35px',
        fontFamily: 'Microsoft YaHei'
      }
    },

    // ===== 5. 位置（号码下方） =====
    {
      type: 'text',
      text: '{{position}}',
      css: {
        fontSize: '52px',
        fontWeight: 'bold',
        color: '#FFFFFF',
        top: '310px',
        left: '50px',
        fontFamily: 'Microsoft YaHei'
      }
    },

    // ===== 6. 球员姓名（中间大字） =====
    {
      type: 'text',
      text: '{{playerName}}',
      css: {
        fontSize: '90px',
        fontWeight: 'bold',
        color: '#FFFFFF',
        top: '390px',
        left: '50px',
        fontFamily: 'Microsoft YaHei',
        maxWidth: '360px'
      }
    },

    // ===== 7. 球衣名（姓名下方） =====
    {
      type: 'text',
      text: '{{jerseyName}}',
      css: {
        fontSize: '42px',
        color: '#FFFFFF',
        top: '490px',
        left: '50px',
        fontFamily: 'Microsoft YaHei',
        opacity: 0.9
      }
    },

    // ===== 8. 国籍文字 =====
    {
      type: 'text',
      text: '{{nationality}}',
      css: {
        fontSize: '42px',
        color: '#FFFFFF',
        top: '690px',
        left: '140px',
        fontFamily: 'Microsoft YaHei'
      }
    },

    // ===== 9. 身高 =====
    {
      type: 'text',
      text: '{{height}}',
      css: {
        fontSize: '38px',
        color: '#FFFFFF',
        top: '755px',
        left: '50px',
        fontFamily: 'Microsoft YaHei'
      }
    },

    // ===== 10. 体重 =====
    {
      type: 'text',
      text: '{{weight}}',
      css: {
        fontSize: '38px',
        color: '#FFFFFF',
        top: '810px',
        left: '50px',
        fontFamily: 'Microsoft YaHei'
      }
    },

    // ===== 11. 籍贯 =====
    {
      type: 'text',
      text: '{{nativePlace}}',
      css: {
        fontSize: '30px',
        color: '#FFFFFF',
        top: '865px',
        left: '50px',
        fontFamily: 'Microsoft YaHei',
        opacity: 0.8
      }
    }
  ]
}

/**
 * 使用示例（小程序端）：
 * 
 * // 1. 在 wxml 中引入 painter
 * <painter palette="{{painterData}}" bind:imgOK="onPainterSuccess" />
 * 
 * // 2. 在 js 中调用云函数获取模板和数据
 * async generateCard() {
 *   wx.showLoading({ title: '生成中...' })
 *   
 *   // 调用云函数
 *   const res = await wx.cloud.callFunction({
 *     name: 'generatePlayerCard',
 *     data: { playerId: this.data.playerId }
 *   })
 *   
 *   if (res.result.success) {
 *     // 获取卡片背景URL（需先上传卡片模板到云存储）
 *     const backgroundUrl = await this.getCardBackgroundUrl(res.result.tier)
 *     
 *     // 填充模板
 *     this.setData({
 *       painterData: {
 *         ...res.result.palette,
 *         background: backgroundUrl,
 *         avatarUrl: res.result.processedAvatarUrl
 *       }
 *     })
 *   }
 *   
 *   wx.hideLoading()
 * }
 * 
 * // 3. 绑定成功回调，保存生成的图片
 * onPainterSuccess(e) {
 *   const imgPath = e.detail.path
 *   // 上传到云存储
 *   wx.cloud.uploadFile({
 *     cloudPath: `player-cards/${this.data.playerId}.png`,
 *     filePath: imgPath
 *   }).then(res => {
 *     // 更新数据库
 *     wx.cloud.database().collection('players').doc(this.data.playerId).update({
 *       data: { cardImageUrl: res.fileID }
 *     })
 *     wx.showToast({ title: '球员卡生成成功' })
 *   })
 * }
 */
