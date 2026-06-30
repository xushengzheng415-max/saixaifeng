// pages/team/team.js
Page({
  _updateLens: function() {
    var data = this.data;
    var _fwd = data.forwards ? data.forwards.length : 0;
    if (this.data.ForwardsLen !== _fwd) { this.setData({ 'ForwardsLen': _fwd}); }
    var _gk = data.goalkeepers ? data.goalkeepers.length : 0;
    if (this.data.GoalkeepersLen !== _gk) { this.setData({ 'GoalkeepersLen': _gk}); }
    var _mgmt = data.managementList ? data.managementList.length : 0;
    if (this.data.ManagementListLen !== _mgmt) { this.setData({ 'ManagementListLen': _mgmt}); }
    var _def = data.defenders ? data.defenders.length : 0;
    if (this.data.DefendersLen !== _def) { this.setData({ 'DefendersLen': _def}); }
    var _mid = data.midfielders ? data.midfielders.length : 0;
    if (this.data.MidfieldersLen !== _mid) { this.setData({ 'MidfieldersLen': _mid}); }
  },

  data: {
    // 褰撳墠婵€娲荤殑Tab
    activeTab: 'squad',

    // 鐞冮槦淇℃伅
    teamInfo: {
      teamName: '',
      shortName: '',
      teamLogo: '',
      teamCode: '',
      teamNameEn: '',
      homeCourt: ''
    },

    // 缁熻鏁版嵁
    playerCount: 0,
    managementCount: 0,
    teamMatches: 0,
    teamWins: 0,

    // 瀹樺憳鍚嶅崟
    managementList: [],

    // 鐞冨憳鍚嶅崟 - 鎸変綅缃垎缁?
    goalkeepers: [],    // 瀹堥棬鍛?
    defenders: [],      // 鍚庡崼
    midfielders: [],    // 涓満
    forwards: [],       // 鍓嶉攱
  },

  onLoad() {
    this.loadTeamInfo()
    this.loadDataFromCloud()
  },

  onShow: function() {
    // 鍚屾鑷畾涔?tabBar 閫変腑鐘舵€?
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().syncSelected()
    }
    this.loadTeamInfo()
    this.loadDataFromCloud()
  },

  // 鍔犺浇鐞冮槦淇℃伅
  loadTeamInfo() {
    const teamInfo = wx.getStorageSync('teamInfo')
    if (teamInfo) {
      // 濡傛灉娌℃湁鐞冮槦浠ｇ爜锛岀敓鎴愪竴涓?
      if (!teamInfo.teamCode) {
        teamInfo.teamCode = this.generateTeamCode()
        wx.setStorageSync('teamInfo', teamInfo)
      }
      if (!teamInfo.shortName) teamInfo.shortName = teamInfo.teamName || ''
      this.setData({ teamInfo })
    }
  },

  // 鐢熸垚鐞冮槦浠ｇ爜
  generateTeamCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
  },

  // 浠庝簯鏁版嵁搴撳姞杞芥暟鎹?
  loadDataFromCloud() {
    const db = wx.cloud.database()
    const teamCode = this.data.teamInfo.teamCode
    const teamId = this.data.teamInfo._id || this.data.teamInfo.teamId

    if (!teamCode && !teamId) return

    // 瑙掕壊鏄犲皠琛紙缁熶竴鐢?coaches 闆嗗悎鐨?type 瀛楁锛?
    const typeMap = {
      'head_coach': '主教练',
      'coach': '主教练',
      'assistant_coach': '鍔╃悊鏁欑粌',
      'goalkeeper_coach': '守门员教练',
      'team_leader': '棰嗛槦',
      'physical_trainer': '浣撹兘鏁欑粌',
      'doctor': '闃熷尰',
      'other': '鍏朵粬'
    }

    // 鍔犺浇鏁欑粌缁勬暟鎹細浼樺厛鏌?coaches锛堜笌Web绔粺涓€锛夛紝鍐嶅吋瀹?management锛堟棫鏁版嵁锛?
    const loadFromCoaches = () => {
      if (!teamId) return Promise.resolve([])
      return db.collection('coaches').where({ teamId }).get().then(res => res.data)
    }

    const loadFromManagement = () => {
      if (!teamCode) return Promise.resolve([])
      return db.collection('management').where({ teamCode }).get().then(res => res.data)
    }

    Promise.all([loadFromCoaches(), loadFromManagement()])
      .then(([coachesData, mgmtData]) => {
        // 鍚堝苟鏁版嵁锛?coaches 浼樺厛
        const mergedMap = new Map()

        // 鍏堝姞鍏?coaches 鏁版嵁锛堟柊鏁版嵁锛屼笌Web绔粺涓€锛?
        coachesData.forEach(item => {
          mergedMap.set(item._id, {
            ...item,
            _source: 'coaches',
            typeLabel: typeMap[item.type] || item.type || '鍏朵粬',
            photoUrl: item.photoUrl || item.avatarUrl || ''
          })
        })

        // 鍐嶅姞鍏?management 鏁版嵁锛堟棫鏁版嵁锛屽吋瀹癸級
        mgmtData.forEach(item => {
          if (!mergedMap.has(item._id)) {
            mergedMap.set(item._id, {
              ...item,
              _source: 'management',
              type: item.position || 'other',
              typeLabel: typeMap[item.position] || item.position || '鍏朵粬',
              photoUrl: item.avatarUrl || ''
            })
          }
        })

        const managementList = Array.from(mergedMap.values())
        this.setData({
          managementList,
          managementCount: managementList.length
        })
      })
      .catch(err => {
        console.error('鍔犺浇鏁欑粌缁勬暟鎹け璐?', err)
      })

    // 鍔犺浇鐞冨憳鏁版嵁锛堝吋瀹?teamCode 鍜?teamId锛?
    const _ = db.command
    var playerWhere = {}
    if (teamCode && teamId) {
      playerWhere = _.or([
        { teamCode: teamCode },
        { teamId: teamId }
      ])
    } else if (teamId) {
      playerWhere = _.or([
        { teamId: teamId },
        { teamCode: teamCode || teamId }
      ])
    } else {
      playerWhere = { teamCode: teamCode }
    }

    db.collection('players')
      .where(playerWhere)
      .get()
      .then(res => {
        const allPlayers = (res.data || []).map(item => ({
          ...item,
          photoUrl: item.photoUrl || item.photo || '',
          photo: item.photo || item.photoUrl || '',
          birthday: item.birthday || item.birthDate || '',
          birthDate: item.birthDate || item.birthday || '',
          teamId: item.teamId || item.teamCode || '',
          teamCode: item.teamCode || item.teamId || '',
          teamName: item.teamName || teamName || '',
          age: this.calculateAge(item.birthday || item.birthDate)
        }))

        // 鎸変綅缃垎缁?
        const goalkeepers = []
        const defenders = []
        const midfielders = []
        const forwards = []

        allPlayers.forEach(player => {
          switch (player.position) {
            case 'GK':
              goalkeepers.push(player)
              break
            case 'DF':
              defenders.push(player)
              break
            case 'MF':
              midfielders.push(player)
              break
            case 'FW':
              forwards.push(player)
              break
          }
        })

        this.setData({
          goalkeepers,
          defenders,
          midfielders,
          forwards,
          playerCount: allPlayers.length
        })
      })
      .catch(err => {
        console.error('鍔犺浇鐞冨憳鏁版嵁澶辫触:', err)
      })
  },

  // 璁＄畻骞撮緞
  calculateAge(birthday) {
    if (!birthday) return ''
    const birth = new Date(birthday)
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--
    }
    return age > 0 ? age : ''
  },

  // 鍒囨崲Tab
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
  },

  // 鍒涘缓鐞冮槦
  onCreateTeam() {
    wx.navigateTo({
      url: '/pages/guide/team-info/team-info'
    })
  },

  // 缂栬緫鐞冮槦
  onEditTeam() {
    wx.navigateTo({
      url: '/pages/guide/team-info/team-info'
    })
  },

  // 鏌ョ湅鐓х墖
  onViewPhotos() {
    wx.showToast({
      title: '鐩稿唽鍔熻兘寮€鍙戜腑',
      icon: 'none'
    })
  },

  // 鏌ョ湅鐞冨憳璇︽儏
  onViewPlayer(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/team/player-detail/player-detail?id=${id}`
    })
  },

  // 鏌ョ湅瀹樺憳璇︽儏
  onViewManagement(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/team/management-detail/management-detail?id=${id}`
    })
  },

  // 娣诲姞鏁欑粌缁勬垚鍛?
  onAddManagement() {
    const { _id, teamId, teamCode, teamName } = this.data.teamInfo
    const realTeamId = _id || teamId || ''
    wx.navigateTo({
      url: `/pages/team/management-add/management-add?teamId=${realTeamId}&teamCode=${teamCode || ''}&teamName=${teamName || ''}`
    })
  },

  // 缂栬緫鏁欑粌缁勬垚鍛?
  onEditManagement(e) {
    const id = e.currentTarget.dataset.id
    const { _id, teamId, teamCode, teamName } = this.data.teamInfo
    const realTeamId = _id || teamId || ''
    wx.navigateTo({
      url: `/pages/team/management-add/management-add?teamId=${realTeamId}&teamCode=${teamCode || ''}&teamName=${teamName || ''}&id=${id}&mode=edit`
    })
  },

  // 鍒犻櫎鏁欑粌缁勬垚鍛?
  onDeleteManagement(e) {
    const id = e.currentTarget.dataset.id
    const source = e.currentTarget.dataset.source
    wx.showModal({
      title: '纭鍒犻櫎',
      content: '纭畾瑕佸垹闄よ繖涓暀缁冪粍鎴愬憳鍚楋紵',
      confirmColor: '#F44336',
      success: (res) => {
        if (res.confirm) {
          const db = wx.cloud.database()
          // 浼樺厛浠?coaches 鍒犻櫎锛堟柊鏁版嵁锛夛紝鍏舵浠?management 鍒犻櫎锛堟棫鏁版嵁鍏煎锛?
          const collectionName = source === 'coaches' ? 'coaches' : 'management'
          db.collection(collectionName).doc(id).remove()
            .then(() => {
              wx.showToast({ title: '鍒犻櫎鎴愬姛', icon: 'success' })
              this.loadDataFromCloud()
            })
            .catch(() => {
              wx.showToast({ title: '鍒犻櫎澶辫触', icon: 'none' })
            })
        }
      }
    })
  },

  // 娣诲姞鐞冨憳
  onAddPlayer() {
    const { teamCode, teamName } = this.data.teamInfo
    wx.navigateTo({
      url: `/pages/team/player-add/player-add?teamId=${teamCode}&teamName=${teamName}`
    })
  },

  // 缂栬緫鐞冨憳
  onEditPlayer(e) {
    const id = e.currentTarget.dataset.id
    const { teamCode, teamName } = this.data.teamInfo
    wx.navigateTo({
      url: `/pages/team/player-add/player-add?teamId=${teamCode}&teamName=${teamName}&id=${id}&mode=edit`
    })
  },

  // 鍒犻櫎鐞冨憳
  onDeletePlayer(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '纭鍒犻櫎',
      content: '确定要删除这个球员吗？',
      confirmColor: '#F44336',
      success: (res) => {
        if (res.confirm) {
          const db = wx.cloud.database()
          db.collection('players').doc(id).remove()
            .then(() => {
              wx.showToast({ title: '鍒犻櫎鎴愬姛', icon: 'success' })
              this.loadDataFromCloud()
            })
            .catch(() => {
              wx.showToast({ title: '鍒犻櫎澶辫触', icon: 'none' })
            })
        }
      }
    })
  }
})


