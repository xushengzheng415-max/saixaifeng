// pages/match/share/share.js
// 棣栧彂闃靛鍒嗕韩椤甸潰 - 鏀寔鍒嗕韩閾炬帴銆佷簩缁寸爜銆佷笅杞?

Page({
  _updateLens: function() {
    var data = this.data;
    var _hs = data.homeStarting ? data.homeStarting.length : 0;
    if (this.data.HomeStartingLen !== _hs) { this.setData({ 'HomeStartingLen': _hs}); }
  },

  data: {
    matchId: '',
    match: null,
    homeTeam: {},
    awayTeam: {},
    homeStarting: [],        // 涓婚槦棣栧彂
    homeStartingByPosition: { GK: [], DF: [], MF: [], FW: [] },
    formatText: '11浜哄埗',
    loading: true,
    shareLink: '',          // 鍒嗕韩閾炬帴
    qrcodeUrl: '',         // 浜岀淮鐮佸浘鐗嘦RL
    generating: false,
    showGenerateQrcode: true,     // 鏄惁姝ｅ湪鐢熸垚浜岀淮鐮?
    canvasImagePath: ''     // 鐢熸垚鐨勫浘鐗囪矾寰?
  },

  onLoad(options) {
    const matchId = options.matchId || ''
    this.setData({ matchId })
    
    if (matchId) {
      this.loadMatchData(matchId)
    }
  },

  // 鍔犺浇姣旇禌鏁版嵁
  async loadMatchData(matchId) {
    try {
      const db = wx.cloud.database()
      
      // 鍔犺浇姣旇禌淇℃伅
      const matchRes = await db.collection('matches').doc(matchId).get()
      if (!matchRes.data) {
        wx.showToast({ title: '比赛不存在', icon: 'none' })
        return
      }
      
      const match = matchRes.data
      const minPlayers = match.minPlayers || 11
      const formatText = this.getFormatText(minPlayers)
      
      // 鍔犺浇涓婚槦淇℃伅
      let homeTeam = {}
      if (match.homeTeamId) {
        const homeRes = await db.collection('teams').doc(match.homeTeamId).get()
        homeTeam = homeRes.data || {}
      }
      
      // 鍔犺浇瀹㈤槦淇℃伅
      let awayTeam = {}
      if (match.awayTeamId) {
        const awayRes = await db.collection('teams').doc(match.awayTeamId).get()
        awayTeam = awayRes.data || {}
      }
      
      // 鍔犺浇涓婚槦棣栧彂闃靛
      const squadRes = await db.collection('squads')
        .where({ matchId, teamId: match.homeTeamId })
        .get()
      
      let homeStarting = []
      if (squadRes.data && squadRes.data.length > 0) {
        const playerIds = squadRes.data[0].playerIds || []
        
        // 鍔犺浇鐞冨憳璇︽儏
        if (playerIds.length > 0) {
          const playersRes = await db.collection('players')
            .where({ _id: db.command.in(playerIds) })
            .get()
          homeStarting = playersRes.data || []
          
          // 鎸変綅缃垎缁?
          this.updateStartingByPosition(homeStarting)
        }
      }
      
      // 鐢熸垚鍒嗕韩閾炬帴
      const shareLink = this.generateShareLink(matchId)
      
      this.setData({
        match,
        homeTeam,
        awayTeam,
        homeStarting,
        formatText,
        shareLink,
        loading: false
      })
      
    } catch (err) {
      console.error('鍔犺浇鏁版嵁澶辫触:', err)
      wx.showToast({ title: '鍔犺浇澶辫触', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  // 鏇存柊鎸変綅缃垎缁勭殑棣栧彂鐞冨憳
  updateStartingByPosition(players) {
    const homeStartingByPosition = { GK: [], DF: [], MF: [], FW: [] }
    
    players.forEach(player => {
      const pos = player.position || 'FW'
      if (homeStartingByPosition[pos]) {
        homeStartingByPosition[pos].push(player)
      }
    })
    
    this.setData({ homeStartingByPosition })
  },

  // 鐢熸垚鍒嗕韩閾炬帴
  generateShareLink(matchId) {
    // 灏忕▼搴忓垎浜矾寰?
    const path = `/pages/match/share/share?matchId=${matchId}`
    
    // 濡傛灉鏈塇5椤甸潰锛屽彲浠ヨ繑鍥濰5閾炬帴
    // const h5Link = `https://your-domain.com/share/match/${matchId}`
    
    return path
  },

  // 澶嶅埗鍒嗕韩閾炬帴
  onCopyLink() {
    wx.setClipboardData({
      data: this.data.shareLink,
      success: () => {
        wx.showToast({ title: '链接已复制', icon: 'success' })
      }
    })
  },

  // 鐢熸垚浜岀淮鐮侊紙灏忕▼搴忕爜锛?
  async onGenerateQRCode() {
    if (!this.data.matchId) {
      wx.showToast({ title: '缂哄皯姣旇禌ID', icon: 'none' })
      return
    }

    this.setData({ generating: true, showGenerateQrcode: false })

    try {
      // 璋冪敤浜戝嚱鏁扮敓鎴愬皬绋嬪簭鐮?
      const res = await wx.cloud.callFunction({
        name: 'generateQRCode',
        data: {
          matchId: this.data.matchId,
          path: 'pages/match/share/share',
          width: 430
        }
      })

      if (res.result && res.result.success && res.result.data) {
        // 浣跨敤杩斿洖鐨勪复鏃禪RL
        this.setData({
          qrcodeUrl: res.result.data.tempUrl,
          generating: false,
          showGenerateQrcode: false
        })
        wx.showToast({ title: '二维码生成成功', icon: 'success' })
      } else {
        throw new Error((res.result && res.result.message) || '鐢熸垚澶辫触')
      }

    } catch (err) {
      console.error('鐢熸垚浜岀淮鐮佸け璐?', err)
      wx.showToast({ title: '鐢熸垚澶辫触: ' + (err.message || '鏈煡閿欒'), icon: 'none' })
      this.setData({ generating: false, showGenerateQrcode: true })
    }
  },

  // 涓嬭浇闃靛鍥剧墖
  async onDownloadImage() {
    wx.showLoading({ title: '鐢熸垚鍥剧墖涓?..' })
    
    try {
      // 浣跨敤canvas缁樺埗闃靛鍥剧墖
      const ctx = wx.createCanvasContext('shareCanvas')
      const width = 750
      const height = 1334
      
      // 缁樺埗鑳屾櫙
      ctx.setFillStyle('#FFFFFF')
      ctx.fillRect(0, 0, width, height)
      
      // 缁樺埗鏍囬
      ctx.setFontSize(36)
      ctx.setFillStyle('#1B5E20')
      ctx.setTextAlign('center')
      ctx.fillText(this.data.match.name, width / 2, 60)
      
      // 缁樺埗鐞冮槦鍚?
      ctx.setFontSize(24)
      ctx.setFillStyle('#666666')
      ctx.fillText(
        `${this.data.homeTeam.name} 棣栧彂闃靛`, 
        width / 2, 
        100
      )
      
      // 缁樺埗鐞冨憳鍗＄墖锛堢畝鍖栫増锛?
      const players = this.data.homeStarting
      const cardWidth = 160
      const cardHeight = 200
      const cols = 4
      const startX = 40
      const startY = 150
      
      for (let i = 0; i < players.length; i++) {
        const player = players[i]
        const row = Math.floor(i / cols)
        const col = i % cols
        const x = startX + col * (cardWidth + 20)
        const y = startY + row * (cardHeight + 20)
        
        // 缁樺埗鍗＄墖鑳屾櫙
        ctx.setFillStyle('#F5F5F5')
        ctx.fillRect(x, y, cardWidth, cardHeight)
        
        // 缁樺埗鐞冨憳淇℃伅
        ctx.setFontSize(20)
        ctx.setFillStyle('#333333')
        ctx.setTextAlign('left')
        ctx.fillText(`#${player.jerseyNumber}`, x + 10, y + 30)
        ctx.fillText(player.name, x + 10, y + 60)
        ctx.setFontSize(16)
        ctx.setFillStyle('#666666')
        ctx.fillText(player.position || '', x + 10, y + 90)
      }
      
      // 缁樺埗搴曢儴淇℃伅
      ctx.setFontSize(18)
      ctx.setFillStyle('#999999')
      ctx.setTextAlign('center')
      ctx.fillText('楹﹂儴瓒崇悆璧涗簨绯荤粺', width / 2, height - 40)
      
      ctx.draw(false, () => {
        // 瀵煎嚭鍥剧墖
        setTimeout(() => {
          wx.canvasToTempFilePath({
            canvasId: 'shareCanvas',
            success: (res) => {
              this.setData({ canvasImagePath: res.tempFilePath })
              this.saveImageToAlbum(res.tempFilePath)
            },
            fail: (err) => {
              console.error('瀵煎嚭鍥剧墖澶辫触:', err)
              wx.showToast({ title: '鐢熸垚澶辫触', icon: 'none' })
              wx.hideLoading()
            }
          })
        }, 500)
      })
      
    } catch (err) {
      console.error('鐢熸垚鍥剧墖澶辫触:', err)
      wx.showToast({ title: '鐢熸垚澶辫触', icon: 'none' })
      wx.hideLoading()
    }
  },

  // 淇濆瓨鍥剧墖鍒扮浉鍐?
  saveImageToAlbum(filePath) {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: () => {
        wx.hideLoading()
        wx.showToast({ title: '宸蹭繚瀛樺埌鐩稿唽', icon: 'success' })
      },
      fail: (err) => {
        wx.hideLoading()
        if (err.errMsg.indexOf('auth deny') !== -1) {
          // 鎺堟潈琚嫆缁?
          wx.showModal({
            title: '鎻愮ず',
            content: '需要您授权保存图片到相册',
            success: (res) => {
              if (res.confirm) {
                wx.openSetting()
              }
            }
          })
        } else {
          wx.showToast({ title: '淇濆瓨澶辫触', icon: 'none' })
        }
      }
    })
  },

  // 涓嬭浇PDF鏂囨。
  async onDownloadPDF() {
    wx.showLoading({ title: '鐢熸垚PDF涓?..' })
    
    try {
      // 璋冪敤浜戝嚱鏁扮敓鎴怭DF
      const res = await wx.cloud.callFunction({
        name: 'generatePDF',
        data: {
          matchId: this.data.matchId,
          type: 'starting lineup'
        }
      })
      
      if (res.result && res.result.fileID) {
        // 涓嬭浇鏂囦欢
        const fileRes = await wx.cloud.downloadFile({
          fileID: res.result.fileID
        })
        
        // 鎵撳紑鏂囦欢
        wx.openDocument({
          filePath: fileRes.tempFilePath,
          showMenu: true,  // 鏄剧ず鍒嗕韩鑿滃崟锛屽彲浠ヨ浆鍙戙€佷繚瀛樼瓑
          success: () => {
            wx.hideLoading()
          },
          fail: () => {
            wx.hideLoading()
            wx.showToast({ title: '鎵撳紑澶辫触', icon: 'none' })
          }
        })
      } else {
        throw new Error('鐢熸垚澶辫触')
      }
      
    } catch (err) {
      console.error('鐢熸垚PDF澶辫触:', err)
      wx.hideLoading()
      wx.showToast({ title: '鐢熸垚澶辫触', icon: 'none' })
    }
  },

  // 鍒嗕韩缁欏ソ鍙?
  onShareAppMessage() {
    return {
      title: `${this.data.homeTeam.name} 棣栧彂闃靛 - ${this.data.match.name}`,
      path: this.data.shareLink,
      imageUrl: this.data.canvasImagePath || ''
    }
  },

  // 鍒嗕韩鍒版湅鍙嬪湀
  onShareTimeline() {
    return {
      title: `${this.data.homeTeam.name} 棣栧彂闃靛`,
      query: `matchId=${this.data.matchId}`
    }
  },

  // 鏍规嵁浜烘暟鑾峰彇璧涘埗鏂囨湰
  getFormatText(minPlayers) {
    const formatMap = {
      5: '5浜哄埗',
      7: '7浜哄埗',
      8: '8浜哄埗',
      11: '11浜哄埗'
    }
    return formatMap[minPlayers] || `${minPlayers}浜哄埗`
  }
})

