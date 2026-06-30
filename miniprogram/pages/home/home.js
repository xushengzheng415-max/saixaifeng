// pages/home/home.js
Page({
  data: {
    loading: true,
    currentRole: '',
    isCoachMode: false,
    isRefereeMode: false,
    isOrganizerMode: false,
    isSpectatorMode: false,
    isLoggedIn: false,
    userInfo: null,
    teams: [],
    currentTeamIndex: 0,
    teamInfo: {},
    playerCount: 0,
    matchCount: 0,
    winCount: 0,
    matches: [],
    albums: [],
    refereeStats: {
      totalMatches: 0,
      thisMonth: 0,
      rating: 0
    },
    upcomingMatches: [],
    organizerStats: {
      totalTournaments: 0,
      ongoing: 0,
      totalTeams: 0
    },
    myTournaments: [],
    pendingItems: [],
    hotTournaments: [],
    highlights: [],
    AlbumsLen: 0,
    MyTournamentsLen: 0,
    UpcomingMatchesLen: 0,
    TeamsLen: 0,
    MatchesLen: 0,
    HighlightsLen: 0,
    PendingItemsLen: 0,
    HotTournamentsLen: 0
  },

  syncLengths: function () {
    var data = this.data;
    this.setData({
      AlbumsLen: (data.albums || []).length,
      MyTournamentsLen: (data.myTournaments || []).length,
      UpcomingMatchesLen: (data.upcomingMatches || []).length,
      TeamsLen: (data.teams || []).length,
      MatchesLen: (data.matches || []).length,
      HighlightsLen: (data.highlights || []).length,
      PendingItemsLen: (data.pendingItems || []).length,
      HotTournamentsLen: (data.hotTournaments || []).length
    });
  },

  onLoad: function (options) {
    try {
      if (wx.cloud) {
        wx.cloud.init({ env: 'cloud1-7g8ckb3c7815a011', traceUser: false });
      }
    } catch (e) {}

    if (options && options.scene) {
      var scene = decodeURIComponent(options.scene);
      if (scene) {
        wx.navigateTo({ url: '/packageA/pages/signature/signature?matchId=' + scene });
        return;
      }
    }

    this.loadData();
  },

  onShow: function () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().syncSelected();
    }
    this.loadData();
  },

  loadData: function () {
    var currentRole = wx.getStorageSync('currentRole') || 'spectator';
    var userInfo = wx.getStorageSync('userInfo') || {};
    var roleLower = (currentRole || '').toLowerCase();

    this.setData({
      loading: true,
      currentRole: currentRole,
      userInfo: userInfo,
      isCoachMode: roleLower === 'coach',
      isRefereeMode: roleLower === 'referee',
      isOrganizerMode: roleLower === 'organizer',
      isSpectatorMode: roleLower === 'spectator',
      isLoggedIn: !!userInfo && !!userInfo._id
    });

    if (roleLower === 'coach') {
      this.loadCoachData();
      return;
    }
    if (roleLower === 'referee') {
      this.loadRefereeData();
      return;
    }
    if (roleLower === 'organizer') {
      this.loadOrganizerData();
      return;
    }
    if (roleLower === 'spectator') {
      this.loadSpectatorData();
      return;
    }

    this.setData({ loading: false });
    this.syncLengths();
  },

  loadCoachData: function () {
    var teams = wx.getStorageSync('myTeams') || [];
    var currentIndex = wx.getStorageSync('currentTeamIndex') || 0;

    if (teams.length > 0) {
      var currentTeam = teams[currentIndex] || teams[0];
      this.setData({
        teams: teams,
        currentTeamIndex: currentIndex,
        teamInfo: currentTeam,
        loading: false
      });
      this.syncLengths();
      this.loadTeamStats(currentTeam);
      this.loadCoachMatches(currentTeam);
      this.loadTeamFromDatabase();
      return;
    }

    this.loadTeamFromDatabase();
  },

  switchTeam: function (e) {
    var index = Number(e.currentTarget.dataset.index || 0);
    var teams = this.data.teams || [];
    if (index < 0 || index >= teams.length) return;

    var currentTeam = teams[index];
    wx.setStorageSync('currentTeamIndex', index);
    wx.setStorageSync('teamInfo', currentTeam);

    this.setData({
      currentTeamIndex: index,
      teamInfo: currentTeam,
      loading: true
    });

    this.loadTeamStats(currentTeam);
    this.loadCoachMatches(currentTeam);
  },

  loadTeamStats: function (teamInfo) {
    var that = this;
    var teamCode = teamInfo && (teamInfo.teamCode || '');
    var teamId = teamInfo && (teamInfo._id || teamInfo.teamId || '');

    if (!teamCode && !teamId) {
      that.setData({ playerCount: 0 });
      return;
    }

    var db = wx.cloud.database();
    var _ = db.command;
    var playerWhere = teamCode && teamId
      ? _.or([{ teamCode: teamCode }, { teamId: teamId }])
      : (teamId
          ? _.or([{ teamId: teamId }, { teamCode: teamCode || teamId }])
          : { teamCode: teamCode });

    db.collection('players').where(playerWhere).count({
      success: function (res) {
        that.setData({ playerCount: res.total || 0 });
      },
      fail: function () {
        that.setData({ playerCount: 0 });
      }
    });
  },

  loadTeamFromDatabase: function () {
    var that = this;
    var userInfo = wx.getStorageSync('userInfo') || {};
    var phoneNumber = wx.getStorageSync('phoneNumber') || userInfo.phoneNumber || userInfo.phone || '';
    var openId = wx.getStorageSync('openId') || wx.getStorageSync('openid') || userInfo.openId || '';
    var userId = wx.getStorageSync('userId') || userInfo._id || '';

    if (!phoneNumber && !openId && !userId) {
      that.setData({ loading: false });
      that.syncLengths();
      return;
    }

    wx.cloud.callFunction({
      name: 'getMyTeams',
      timeout: 15000,
      data: {
        phone: phoneNumber,
        userId: userId,
        openId: openId,
        role: 'coach'
      },
      success: function (res) {
        var result = res.result || {};
        if (result.success && Array.isArray(result.teams) && result.teams.length > 0) {
          var rawTeams = result.teams;
          var teams = [];
          for (var i = 0; i < rawTeams.length; i++) {
            var t = rawTeams[i];
            teams.push({
              _id: t._id,
              teamId: t.teamId || t._id,
              teamName: t.teamName || t.name || '未命名球队',
              teamLogo: t.logoUrl || t.logo || '',
              teamCode: t.teamCode || t._id,
              contactName: t.contactName || t.coachName || '',
              contactPhone: t.contactPhone || t.ownerPhone || t.creatorPhone || t.phoneNumber || t.phone || ''
            });
          }

          var storedIndex = wx.getStorageSync('currentTeamIndex') || 0;
          var currentIndex = (storedIndex >= 0 && storedIndex < teams.length) ? storedIndex : 0;
          var currentTeam = teams[currentIndex];

          wx.setStorageSync('myTeams', teams);
          wx.setStorageSync('currentTeamIndex', currentIndex);
          wx.setStorageSync('teamInfo', currentTeam);

          that.setData({
            teams: teams,
            currentTeamIndex: currentIndex,
            teamInfo: currentTeam
          });
          that.syncLengths();
          that.loadTeamStats(currentTeam);
          that.loadCoachMatches(currentTeam);
        } else {
          that.setData({
            teams: [],
            currentTeamIndex: 0,
            teamInfo: {},
            playerCount: 0,
            matchCount: 0,
            winCount: 0,
            loading: false
          });
          that.syncLengths();
        }
      },
      fail: function (err) {
        console.error('[home] getMyTeams 调用失败（保留现有数据）:', err);
        that.setData({ loading: false });
        that.syncLengths();
      }
    });
  },

  loadCoachMatches: function (teamInfo) {
    var that = this;
    var db = wx.cloud.database();
    var teamId = teamInfo && (teamInfo._id || teamInfo.teamId || '');

    if (!teamId) {
      that.setData({ matchCount: 0, winCount: 0, matches: [], loading: false });
      that.syncLengths();
      return;
    }

    db.collection('matches')
      .where(db.command.or([
        { homeTeamId: teamId },
        { awayTeamId: teamId }
      ]))
      .orderBy('matchTime', 'desc')
      .limit(20)
      .get({
        success: function (res) {
          var matches = res.data || [];
          var teamIdSet = {};
          for (var i = 0; i < matches.length; i++) {
            if (matches[i].homeTeamId) teamIdSet[matches[i].homeTeamId] = true;
            if (matches[i].awayTeamId) teamIdSet[matches[i].awayTeamId] = true;
          }
          var teamIds = Object.keys(teamIdSet);

          var formatMatches = function (teamMap) {
            var formattedMatches = [];
            var winCount = 0;
            for (var i = 0; i < matches.length; i++) {
              var m = matches[i];
              var statusText = '未开始';
              var statusClass = 'upcoming';
              if (m.status === 'ongoing') {
                statusText = '进行中';
                statusClass = 'live';
              } else if (m.status === 'completed') {
                statusText = '已结束';
                statusClass = 'finished';
                if (teamId && m.homeScore !== undefined && m.awayScore !== undefined) {
                  if ((m.homeTeamId === teamId && Number(m.homeScore) > Number(m.awayScore)) ||
                      (m.awayTeamId === teamId && Number(m.awayScore) > Number(m.homeScore))) {
                    winCount += 1;
                  }
                }
              }

              var homeTeam = teamMap[m.homeTeamId] || {};
              var awayTeam = teamMap[m.awayTeamId] || {};
              formattedMatches.push({
                id: m._id,
                matchName: (m.tournamentName || '比赛') + ' ' + (m.round || ''),
                homeTeam: m.homeTeamName || homeTeam.teamName || homeTeam.name || '主队',
                awayTeam: m.awayTeamName || awayTeam.teamName || awayTeam.name || '客队',
                homeLogo: homeTeam.logoUrl || homeTeam.logo || m.homeTeamLogo || '',
                awayLogo: awayTeam.logoUrl || awayTeam.logo || m.awayTeamLogo || '',
                score: (m.homeScore !== undefined && m.awayScore !== undefined) ? (m.homeScore + ' : ' + m.awayScore) : '',
                statusText: statusText,
                statusClass: statusClass,
                location: m.venue || '待定',
                date: that.formatDate(m.matchTime || m.date || m.startTime || m.matchDate)
              });
            }

            that.setData({
              matchCount: formattedMatches.length,
              winCount: winCount,
              matches: formattedMatches,
              loading: false
            });
            that.syncLengths();
          };

          if (teamIds.length > 0) {
            db.collection('teams').where({ _id: db.command.in(teamIds) }).get({
              success: function (teamRes) {
                var teamMap = {};
                (teamRes.data || []).forEach(function (item) {
                  teamMap[item._id] = item;
                });
                formatMatches(teamMap);
              },
              fail: function () {
                formatMatches({});
              }
            });
          } else {
            formatMatches({});
          }
        },
        fail: function () {
          that.setData({ matchCount: 0, winCount: 0, matches: [], loading: false });
          that.syncLengths();
        }
      });
  },

  loadRefereeData: function () {
    var that = this;
    var userInfo = wx.getStorageSync('userInfo') || {};
    var phone = wx.getStorageSync('phoneNumber') || userInfo.phoneNumber || userInfo.phone || '';
    var openId = wx.getStorageSync('openId') || userInfo.openId || '';
    var db = wx.cloud.database();
    var _ = db.command;

    db.collection('matches').where(_.or([
      { refereePhone: phone },
      { assignedRefereePhone: phone },
      { refereeOpenId: openId },
      { assignedRefereeOpenId: openId }
    ])).get({
      success: function (res) {
        var matches = res.data || [];
        var upcoming = [];
        for (var i = 0; i < matches.length && upcoming.length < 5; i++) {
          var m = matches[i];
          upcoming.push({
            id: m._id,
            matchName: (m.tournamentName || '比赛') + ' ' + (m.round || ''),
            homeTeam: m.homeTeamName || '主队',
            awayTeam: m.awayTeamName || '客队',
            location: m.venue || '待定',
            time: that.formatDate(m.matchTime || m.date || m.startTime || m.matchDate)
          });
        }

        that.setData({
          refereeStats: {
            totalMatches: matches.length,
            thisMonth: matches.length,
            rating: matches.length > 0 ? 100 : 0
          },
          upcomingMatches: upcoming,
          loading: false
        });
        that.syncLengths();
      },
      fail: function () {
        that.setData({
          refereeStats: { totalMatches: 0, thisMonth: 0, rating: 0 },
          upcomingMatches: [],
          loading: false
        });
        that.syncLengths();
      }
    });
  },

  loadOrganizerData: function () {
    var that = this;
    var db = wx.cloud.database();
    var userInfo = wx.getStorageSync('userInfo') || {};
    var phone = wx.getStorageSync('phoneNumber') || userInfo.phoneNumber || userInfo.phone || '';
    var openId = wx.getStorageSync('openId') || userInfo.openId || '';
    var userId = wx.getStorageSync('userId') || userInfo._id || '';
    var _ = db.command;

    var stats = { totalTournaments: 0, ongoing: 0, totalTeams: 0 };

    db.collection('tournaments').count({
      success: function (res) {
        stats.totalTournaments = res.total || 0;
        that.setData({ organizerStats: stats });
      }
    });

    db.collection('tournaments').where({ status: 'ongoing' }).count({
      success: function (res) {
        stats.ongoing = res.total || 0;
        that.setData({ organizerStats: stats });
      }
    });

    db.collection('teams').count({
      success: function (res) {
        stats.totalTeams = res.total || 0;
        that.setData({ organizerStats: stats });
      }
    });

    db.collection('tournaments').where(_.or([
      { creatorId: userId },
      { creatorPhone: phone },
      { phoneNumber: phone },
      { openId: openId },
      { wechatOpenId: openId }
    ])).orderBy('createTime', 'desc').limit(10).get({
      success: function (res) {
        var items = [];
        (res.data || []).forEach(function (t) {
          items.push({
            _id: t._id,
            name: t.name || '未命名赛事',
            status: t.status || 'draft',
            statusLabel: t.statusLabel || (t.status === 'ongoing' ? '进行中' : (t.status === 'finished' ? '已结束' : '草稿')),
            dateRange: that.formatDate(t.startDate || t.createTime) + ' - ' + that.formatDate(t.endDate || t.startDate || t.createTime),
            registeredTeams: t.registeredTeams || 0,
            maxTeams: t.maxTeams || 0
          });
        });
        that.setData({ myTournaments: items, loading: false });
        that.syncLengths();
      },
      fail: function () {
        that.setData({ myTournaments: [], loading: false });
        that.syncLengths();
      }
    });

    that.setData({ pendingItems: [] });
    that.syncLengths();
  },

  loadSpectatorData: function () {
    var that = this;
    var db = wx.cloud.database();

    db.collection('tournaments').orderBy('createTime', 'desc').limit(5).get({
      success: function (res) {
        var hot = [];
        (res.data || []).forEach(function (t) {
          hot.push({
            _id: t._id,
            name: t.name || '未命名赛事',
            status: t.status || 'draft',
            statusLabel: t.statusLabel || (t.status === 'ongoing' ? '进行中' : '热门'),
            dateRange: that.formatDate(t.startDate || t.createTime) + ' - ' + that.formatDate(t.endDate || t.startDate || t.createTime),
            registeredTeams: t.registeredTeams || 0,
            maxTeams: t.maxTeams || 0
          });
        });

        db.collection('matches').orderBy('matchTime', 'desc').limit(4).get({
          success: function (matchRes) {
            var highlights = [];
            (matchRes.data || []).forEach(function (m) {
              highlights.push({
                _id: m._id,
                title: m.tournamentName || '精彩比赛',
                desc: (m.homeTeamName || '主队') + ' vs ' + (m.awayTeamName || '客队'),
                cover: m.cover || m.poster || m.homeTeamLogo || '/images/app-logo.png'
              });
            });
            that.setData({ hotTournaments: hot, highlights: highlights, loading: false });
            that.syncLengths();
          },
          fail: function () {
            that.setData({ hotTournaments: hot, highlights: [], loading: false });
            that.syncLengths();
          }
        });
      },
      fail: function () {
        that.setData({ hotTournaments: [], highlights: [], loading: false });
        that.syncLengths();
      }
    });
  },

  formatDate: function (value) {
    if (!value) return '待定';
    var date = new Date(value);
    if (isNaN(date.getTime())) return String(value).slice(0, 10) || '待定';
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  },

  manageTeam: function () {
    wx.navigateTo({ url: '/pages/team/team' });
  },

  goToMatches: function () {
    wx.navigateTo({ url: '/pages/tournament/list/list' });
  },

  viewMatchData: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id) {
      wx.navigateTo({ url: '/pages/match/detail/detail?id=' + id });
    }
  },

  goToAlbum: function () {
    wx.showToast({ title: '相册功能开发中', icon: 'none' });
  },

  viewPhoto: function () {
    wx.showToast({ title: '相册功能开发中', icon: 'none' });
  },

  addPhoto: function () {
    wx.showToast({ title: '相册功能开发中', icon: 'none' });
  },

  createTournament: function () {
    wx.navigateTo({ url: '/pages/tournament/create/create' });
  },

  goToTournamentManage: function () {
    wx.navigateTo({ url: '/pages/manage/manage' });
  },

  goToRefereeManage: function () {
    wx.navigateTo({ url: '/pages/referee/index' });
  },

  onPendingItemTap: function () {
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  goToTournaments: function () {
    wx.navigateTo({ url: '/pages/tournament/list/list' });
  },

  viewTournament: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id) {
      wx.navigateTo({ url: '/pages/tournament/detail/detail?id=' + id });
    }
  },

  goToLogin: function () {
    wx.reLaunch({ url: '/pages/login/login' });
  }
});