// pages/tournament-center/tournament-center.js
// 赛小蜂 - 赛事中心（双模式：主办方Web风格卡片 / 教练球队参赛列表）
// v3 — 防重入锁 + 全路径安全停止

Page({
  data: {
    loading: false,
    isOrganizer: false,
    activeFilter: 'all',
    tournaments: [],
    filteredTournaments: [],
    teamInfo: null,
    showEmptyTeam: false,
    teamTournaments: [],
    upcomingMatches: [],
    matchStats: { total: 0, upcoming: 0, completed: 0 }
  },

  // ★ 防重入锁
  _loadingLock: false,

  _updateLens: function() {
    var d = this.data
    var ft = d.filteredTournaments ? d.filteredTournaments.length : 0
    if (d.TournamentsLen !== ft) { this.setData({ 'TournamentsLen': ft }) }
    var tt = d.teamTournaments ? d.teamTournaments.length : 0
    if (d.TeamTournamentsLen !== tt) { this.setData({ 'TeamTournamentsLen': tt }) }
    var um = d.upcomingMatches ? d.upcomingMatches.length : 0
    if (d.UpcomingMatchesLen !== um) { this.setData({ 'UpcomingMatchesLen': um }) }
  },

  onLoad: function() {
    try { wx.cloud.init({ env: 'cloud1-7g8ckb3c7815a011', traceUser: false }) } catch(e) {}
    this._startLoad()
  },

  onShow: function() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().syncSelected()
    }
    this._startLoad()
  },

  onPullDownRefresh: function() {
    var that = this
    that._loadingLock = false
    that.setData({ loading: true })
    that._doCheckRole()
    setTimeout(function() { wx.stopPullDownRefresh() }, 1500)
  },

  // ★ 统一入口：带防重入锁
  _startLoad: function() {
    if (this._loadingLock) return
    this._doCheckRole()
  },

  _doCheckRole: function() {
    var role = (wx.getStorageSync('currentRole') || 'organizer').toLowerCase()
    console.log('[tc] 角色:', role)

    // ★ 已有数据时，不显示转圈（避免切换 tab 时闪烁）
    var hasData = (this.data.tournaments && this.data.tournaments.length > 0) ||
                  (this.data.teamTournaments && this.data.teamTournaments.length > 0)

    this.setData({
      isOrganizer: role === 'organizer',
      loading: !hasData,  // ← 有数据就不转圈，后台静默刷新
      activeFilter: 'all'
    })
    this._loadingLock = true

    if (role === 'organizer') {
      this._loadAllTournaments()
    } else {
      this._loadCoachData()
    }
  },

  // ========== 主办方模式 ==========
  _loadAllTournaments: function() {
    var that = this
    try { wx.cloud.init({ env: 'cloud1-7g8ckb3c7815a011', traceUser: false }) } catch(e) {}

    setTimeout(function() {
      var db
      try {
        db = wx.cloud.database()
      } catch(e) {
        console.error('[tc] database init failed:', e)
        that._doneLoading([], [])
        return
      }

      db.collection('tournaments').orderBy('createTime', 'desc').limit(50).get({
        success: function(res) {
          var list = res.data || []
          console.log('[tc] 查到赛事:', list.length, '条 → 调用 _doneLoading')
          var formatted = that.formatForCards(list)
          that.applyFilter(formatted)
          that.setData({ tournaments: formatted })
          that._doneLoading(formatted, formatted)
        },
        fail: function(err) {
          console.warn('[tc] 查询失败:', err && err.message, '→ 调用 _doneLoading 空数组')
          that._doneLoading([], [])
        }
      })
    }, 200)
  },

  // ★ 安全停止加载（所有路径最终都走这里）
  _doneLoading: function(tournaments, filtered) {
    // ★★★ 第一件事：无条件停止转圈！★★★
    this.setData({ loading: false })
    this._loadingLock = false
    console.log('[tc] _doneLoading ✓ loading已停止, 赛事数:', (filtered || []).length)
    this.setData({ filteredTournaments: filtered || [] })
    this._updateLens()
  },

  formatForCards: function(rawList) {
    var result = []
    for (var i = 0; i < rawList.length; i++) {
      var item = rawList[i]
      var status = item.status || 'unknown'
      var typeLabel = ''
      if (item.type === 'league') typeLabel = '联赛制'
      else if (item.type === 'cup') typeLabel = '杯赛制'
      else if (item.format) typeLabel = item.format

      var dateRange = ''
      if (item.startDate) {
        dateRange = String(item.startDate).substring(5, 10).replace('-', '.')
        if (item.endDate) dateRange += '~' + String(item.endDate).substring(5, 10).replace('-', '.')
      }

      var regTeams = item.registeredTeamCount ||
        (item.registeredTeams ? item.registeredTeams.length : 0) || item.teamCount || 0
      var maxT = item.maxTeams || 16

      result.push({
        _id: item._id, name: item.name || '未命名赛事',
        coverImage: item.coverImage || item.logo || item.logoUrl || '',
        status: status, statusLabel: this.mapStatus(status), statusCls: status,
        isHot: item.isHot || false,
        bannerClass: status === 'ongoing' ? 'banner-ongoing' : 'banner-default',
        typeLabel: typeLabel, dateRange: dateRange, location: item.location || '',
        registeredTeams: regTeams, maxTeams: maxT,
        teamProgressPercent: maxT > 0 ? Math.min(Math.round((regTeams / maxT) * 100), 100) : 0
      })
    }
    return result
  },

  onFilterTap: function(e) {
    var f = e.currentTarget.dataset.filter
    this.setData({ activeFilter: f })
    this.applyFilter(this.data.tournaments)
  },

  applyFilter: function(allList) {
    var f = this.data.activeFilter
    var filtered = f === 'all' ? allList : []
    if (f !== 'all') {
      for (var i = 0; i < allList.length; i++) {
        if (allList[i].status === f) filtered.push(allList[i])
      }
    }
    this.setData({ filteredTournaments: filtered })
    this._updateLens()
  },

  goCreateTournament: function() {
    wx.navigateTo({ url: '/pages/tournament/create/create' })
  },

  // ========== 教练/裁判模式 ==========
  _loadCoachData: function() {
    var that = this
    var teamInfo = wx.getStorageSync('teamInfo') || {}
    var teams = wx.getStorageSync('myTeams') || []
    var idx = wx.getStorageSync('currentTeamIndex') || 0
    var ct = teams && teams[idx] || (teamInfo.teamCode || teamInfo._id ? teamInfo : null)

    if (!ct) {
      that.setData({
        loading: false,
        teamInfo: null,
        showEmptyTeam: true,
        teamTournaments: [],
        upcomingMatches: [],
        matchStats: { total: 0, upcoming: 0, completed: 0 }
      })
      that._loadingLock = false
      return
    }

    var tid = ct._id || ct.teamId || ''
    that.setData({ teamInfo: ct, showEmptyTeam: false })

    // ★ 安全网：3秒后强制停止
    that._safetyTimer && clearTimeout(that._safetyTimer)
    that._safetyTimer = setTimeout(function() {
      if (that.data.loading) {
        console.warn('[tc] 安全网超时(3s)，强制停止')
        that._loadingLock = false
        that.setData({ loading: false, teamTournaments: [], upcomingMatches: [] })
        that._updateLens()
      }
    }, 3000)

    that._loadTeamTournaments(tid)
    that._loadUpcomingMatches(tid)
  },

  _loadTeamTournaments: function(teamId) {
    var that = this
    var db
    try { db = wx.cloud.database() } catch(e) {
      that._coachDone([]); return
    }

    db.collection('tournament_teams').where({ teamId: teamId }).orderBy('joinTime','desc').limit(20).get({
      success: function(res) {
        var entries = res.data || []
        if (entries.length > 0) that._resolveDetails(entries, teamId)
        else that._loadDirect(teamId)
      },
      fail: function(err) {
        console.warn('[tc] tournament_teams 不存在:', err && err.message)
        that._loadDirect(teamId)
      }
    })
  },

  _resolveDetails: function(entries, teamId) {
    var that = this
    var db
    try { db = wx.cloud.database() } catch(e) {
      that._coachDone(that.formatFromEntriesOnly(entries)); return
    }

    var tids = [], emap = {}
    for (var i = 0; i < entries.length; i++) {
      var tId = entries[i].tournamentId
      if (tId) { tids.push(tId); emap[tId] = entries[i] }
    }
    if (!tids.length) { that._coachDone([]); return }

    db.collection('tournaments').where({ _id: db.command.in(tids) }).get({
      success: function(r) {
        that._loadMatchStats(teamId)
        that._coachDone(that.formatTournamentList(r.data||[], emap))
      },
      fail: function() {
        that._coachDone(that.formatFromEntriesOnly(entries))
      }
    })
  },

  _loadDirect: function(teamId) {
    var that = this
    var db
    try { db = wx.cloud.database() } catch(e) {
      that._coachDone([]); return
    }

    db.collection('tournaments')
      .where({ status: db.command.in(['registering','ongoing','completed']) })
      .limit(20).get({
      success: function(res) {
        var all=res.data||[], matched=[]
        for(var i=0;i<all.length;i++){
          var t=all[i], tids=t.registeredTeamIds||t.teamIds||[]
          ,tls=t.teams||t.registeredTeams||[],h=false
          for(var j=0;j<tids.length;j++){
            if(tids[j]===teamId||(tids[j]&&tids[j]._id===teamId)){h=true;break}
          }
          if(!h){
            for(var k=0;k<tls.length;k++){
              var tid2=(tls[k].teamId||tls[k]._id||'');if(tid2===teamId){h=true;break}
            }
          }
          if(h) matched.push(t)
        }
        that._loadMatchStats(teamId)
        that._coachDone(that.formatTournamentList(matched,{}))
      },
      fail:function(err){
        console.warn('[tc] tournaments 查询也失败:', err && err.message)
        that._coachDone([])
      }
    })
  },

  _coachDone: function(list) {
    this._safetyTimer && clearTimeout(this._safetyTimer)
    // ★★★ 第一件事：无条件停止转圈 ★★★
    this.setData({ loading: false })
    this._loadingLock = false
    console.log('[tc] _coachDone ✓ loading已停止, 赛事数:', (list || []).length)
    this.setData({ teamTournaments: list || [] })
    this._updateLens()
  },

  formatFromEntriesOnly: function(entries) {
    var r = []
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i]
      r.push({
        _id:e.tournamentId, name:e.tournamentName||'', status:e.status||'',
        statusLabel:this.mapStatus(e.status), statusCls:e.status||'',
        rosterStatus:e.rosterStatus||'not_submitted',
        rosterStatusLabel:this.mapRosterStatus(e.rosterStatus),
        dateRange:'',location:'', registeredTeams:0,maxTeams:0,matchCount:0,type:'league'
      })
    }
    return r
  },

  formatTournamentList: function(rawList, emap) {
    var r=[],that=this
    for(var i=0;i<rawList.length;i++){
      var it=rawList[i],em=emap[it._id]||{},st=it.status||em.status||''
      var dr=''
      if(it.startDate){dr=that.formatDateShort(it.startDate);if(it.endDate)dr+=' ~ '+that.formatDateShort(it.endDate)}
      var rs=em.rosterStatus||it.rosterStatus||'not_submitted'
      var subm=(rs==='submitted'||rs==='approved'||rs==='confirmed')
      r.push({
        _id:it._id,name:it.name||'',coverImage:it.coverImage||'',status:st,
        statusLabel:that.mapStatus(st),statusCls:st,
        rosterStatus:rs,rosterSubmitted:subm,rosterStatusLabel:that.mapRosterStatus(rs),
        dateRange:dr,location:it.location||'',
        registeredTeams:(it.registeredTeams&&it.registeredTeams.length)||it.teamCount||em.registeredTeamCount||0,
        maxTeams:it.maxTeams||0,matchCount:em.matchCount||0,type:it.type||'league'
      })
    }
    return r
  },

  mapStatus:function(s){
    var m={'registering':'报名中','ongoing':'进行中','completed':'已结束','cancelled':'已取消',
      'pending':'待审核','approved':'已通过','unknown':'未知'}
    return m[s]||s
  },

  mapRosterStatus:function(s){
    var m={'not_submitted':'未提交','drafting':'编辑中','submitted':'待审核','pending_approval':'审核中',
      'approved':'已确认','confirmed':'已锁定','modification_requested':'需修改','rejected':'被退回'}
    return m[s]||'未提交'
  },

  _loadUpcomingMatches: function(teamId) {
    var t=this,db
    try { db=wx.cloud.database() } catch(e) { return }
    db.collection('matches').where(db.command.or([{homeTeamId:teamId},{awayTeamId:teamId}])).orderBy('matchTime','asc').limit(5).get({
      success:function(res){var ms=res.data||[],fm=[]
        for(var i=0;i<ms.length;i++){var m=ms[i];fm.push({_id:m._id,
          homeTeam:m.homeTeamName||'',awayTeam:m.awayTeamName||'',
          homeLogo:m.homeTeamLogo||'',awayLogo:m.awayLogo||'',
          score:(m.homeScore!==undefined&&m.awayScore!==undefined)?m.homeScore+':'+m.awayScore:'',
          matchTime:t.formatMatchTime(m.matchTime||m.date),venue:m.venue||'待定',status:m.status||''})}
        t.setData({upcomingMatches:fm})
      },
      fail:function(){t.setData({upcomingMatches:[]})}
    })
  },

  _loadMatchStats: function(tid) {
    var t=this,db
    try { db=wx.cloud.database() } catch(e) { return }
    db.collection('matches').where(db.command.or([{homeTeamId:tid},{awayTeamId:tid}])).count({
      success:function(c){t.setData({'matchStats.total':c.total||0})},
      fail:function(){t.setData({'matchStats.total':0})}
    })
  },

  formatDateShort: function(d) {
    return d ? String(d).substring(0,10).replace(/-/g,'.') : ''
  },

  formatMatchTime: function(tv) {
    if (!tv) return '待定'
    if (typeof tv==='object' && tv instanceof Date) {
      return (tv.getMonth()+1)+'月'+tv.getDate()+'日 '+('0'+tv.getHours()).slice(-2)+':'+('0'+tv.getMinutes()).slice(-2)
    }
    if (typeof tv==='string') return tv.substring(5,16).replace(/-/g,'.')||tv
    return '待定'
  },

  onViewTournament: function(e) {
    wx.navigateTo({ url:'/pages/tournament/detail/detail?id='+e.currentTarget.dataset.id })
  },
  onViewMatch: function(e) {
    wx.navigateTo({ url:'/pages/match/detail/detail?matchId='+e.currentTarget.dataset.id })
  },
  viewAllMatches: function() {
    wx.switchTab({ url:'/pages/home/home' })
  }
})
