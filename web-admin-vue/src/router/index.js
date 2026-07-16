import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/login/LoginView.vue'),
    meta: { requiresAuth: false }
  },
  // 微信扫码回调页面（从 index.html 跳转过来，用 Vue 的 cloud.js 处理登录）
  {
    path: '/wechat-callback',
    name: 'WechatCallback',
    component: () => import('../views/login/WechatCallbackView.vue'),
    meta: { requiresAuth: false, skipAuthCheck: true }
  },
  // 公开赛事中心页面（无需登录）
  {
    path: '/tournament-center',
    name: 'TournamentCenter',
    component: () => import('../views/tournament/TournamentCenter.vue'),
    meta: { requiresAuth: false, title: '赛事中心' }
  },
  // 赛事中心独立登录页面
  {
    path: '/tournament-center-login',
    name: 'TournamentCenterLogin',
    component: () => import('../views/tournament-center/TournamentCenterLogin.vue'),
    meta: { requiresAuth: false, title: '赛事中心登录' }
  },
  // ===== 门户（赛事中心门户，无需登录）P0 新增 =====
  {
    path: '/portal',
    component: () => import('../views/portal/layout/PortalLayout.vue'),
    meta: { requiresAuth: false, title: '赛事中心' },
    children: [
      // 默认重定向到首页
      { path: '', redirect: '/portal/home' },
      // 首页
      {
        path: 'home',
        name: 'PortalHome',
        component: () => import('../views/portal/home/HomePage.vue'),
        meta: { requiresAuth: false, title: '首页' }
      },
      // 赛事列表
      {
        path: 'tournament',
        redirect: '/portal/tournaments'
      },
      {
        path: 'tournaments',
        name: 'PortalTournaments',
        component: () => import('../views/portal/tournament/TournamentListPage.vue'),
        meta: { requiresAuth: false, title: '赛事列表' }
      },
      // 赛事详情
      {
        path: 'tournament/:id',
        name: 'PortalTournamentDetail',
        component: () => import('../views/portal/tournament/TournamentDetailPage.vue'),
        meta: { requiresAuth: false, title: '赛事详情' }
      },
      // 赛况 Tab
      {
        path: 'tournament/:id/matches',
        name: 'PortalTournamentMatches',
        component: () => import('../views/portal/tournament/TournamentDetailPage.vue'),
        meta: { requiresAuth: false, title: '赛况' }
      },
      // 阵容 Tab
      {
        path: 'tournament/:id/squads',
        name: 'PortalTournamentSquads',
        component: () => import('../views/portal/tournament/TournamentDetailPage.vue'),
        meta: { requiresAuth: false, title: '阵容' }
      },
      // 榜单 Tab
      {
        path: 'tournament/:id/rankings',
        name: 'PortalTournamentRankings',
        component: () => import('../views/portal/tournament/TournamentDetailPage.vue'),
        meta: { requiresAuth: false, title: '榜单' }
      },
      // 竞猜 Tab
      {
        path: 'tournament/:id/guess',
        name: 'PortalTournamentGuess',
        component: () => import('../views/portal/tournament/TournamentDetailPage.vue'),
        meta: { requiresAuth: false, title: '竞猜' }
      },
      // 比赛详情
      {
        path: 'match/:id',
        name: 'PortalMatchDetail',
        component: () => import('../views/portal/match/MatchDetailPage.vue'),
        meta: { requiresAuth: false, title: '比赛详情' }
      },
      // 侃球
      {
        path: 'chat',
        name: 'PortalChat',
        component: () => import('../views/portal/chat/ChatPage.vue'),
        meta: { requiresAuth: false, title: '球队' }
      },
      // 我的（个人中心）
      {
        path: 'profile',
        name: 'PortalProfile',
        component: () => import('../views/portal/profile/ProfilePage.vue'),
        meta: { requiresAuth: false, title: '我的' }
      }
    ]
  },
  // 根路径由 beforeEach 守卫根据登录状态和角色动态跳转
  // （已登录→角色首页，未登录→赛事中心/登录页）
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '数据概览' },
    children: [
      {
        path: '',
        component: () => import('../views/dashboard/DashboardView.vue')
      }
    ]
  },
  {
    path: '/teams',
    name: 'Teams',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '球队管理' },
    children: [
      {
        path: '',
        component: () => import('../views/team/TeamList.vue')
      }
    ]
  },
  {
    path: '/teams/:id',
    name: 'TeamDetail',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '球队详情' },
    children: [
      {
        path: '',
        component: () => import('../views/team/TeamDetail.vue')
      }
    ]
  },
  {
    path: '/players',
    name: 'Players',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '球员管理' },
    children: [
      {
        path: '',
        component: () => import('../views/player/PlayerList.vue')
      }
    ]
  },
  {
    path: '/players/:id',
    name: 'PlayerDetail',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '球员详情' },
    children: [
      {
        path: '',
        component: () => import('../views/player/PlayerDetail.vue')
      }
    ]
  },
  {
    path: '/referees',
    name: 'Referees',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '裁判管理' },
    children: [
      {
        path: '',
        component: () => import('../views/referee/RefereeList.vue')
      }
    ]
  },
  // 裁判后台 - 我的比赛
  {
    path: '/referee/my-matches',
    name: 'RefereeMyMatches',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '我的比赛' },
    children: [
      {
        path: '',
        component: () => import('../views/referee/RefereeMyMatches.vue')
      }
    ]
  },
  // 裁判后台 - 比赛详情（裁判视角）
  {
    path: '/referee/match/:id',
    name: 'RefereeMatchDetail',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '比赛详情' },
    children: [
      {
        path: '',
        component: () => import('../views/referee/RefereeMatchDetail.vue')
      }
    ]
  },
  // 裁判长管理 - 分配裁判
  {
    path: '/referee/head-referee',
    name: 'HeadRefereeManagement',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '裁判长管理' },
    children: [
      {
        path: '',
        component: () => import('../views/referee/HeadRefereeManagement.vue')
      }
    ]
  },
  {
    path: '/coaches',
    name: 'Coaches',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '教练组管理' },
    children: [
      {
        path: '',
        component: () => import('../views/coach/CoachList.vue')
      }
    ]
  },
  {
    path: '/tournaments',
    name: 'Tournaments',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '赛事管理', parent: 'tournaments' },
    children: [
      {
        path: '',
        component: () => import('../views/tournament/TournamentList.vue')
      }
    ]
  },
  // 我的赛事页面
  {
    path: '/my-tournaments',
    name: 'MyTournaments',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '我的赛事' },
    children: [
      {
        path: '',
        component: () => import('../views/tournament/MyTournaments.vue')
      }
    ]
  },
  // 赛事中心管理后台（独立登录系统，不使用 LayoutView 包装）
  {
    path: '/tournament-center-admin',
    name: 'TournamentCenterAdmin',
    component: () => import('../views/tournament-center/TournamentCenterAdmin.vue'),
    meta: { requiresAuth: false, title: '赛小蜂足球赛事中心-管理后台', tcAuth: true }
  },
  // 管理后台 - 赛事列表（查看所有赛事）
  {
    path: '/admin/tournaments',
    name: 'AdminTournaments',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '赛事列表' },
    children: [
      {
        path: '',
        component: () => import('../views/tournament/TournamentList.vue')
      }
    ]
  },
  // 管理后台 - 球队列表（查看所有球队）
  {
    path: '/admin/teams',
    name: 'AdminTeams',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '球队列表' },
    children: [
      {
        path: '',
        component: () => import('../views/team/TeamList.vue')
      }
    ]
  },
  // 赛事详情页
  {
    path: '/tournaments/:id',
    name: 'TournamentDetail',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '赛事详情', parent: 'tournaments' },
    children: [
      {
        path: '',
        component: () => import('../views/tournament/TournamentDetail.vue')
      }
    ]
  },
  // 赛事子路由 - 参赛球队管理
  {
    path: '/tournaments/:id/teams',
    name: 'TournamentTeams',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '参赛球队', parent: 'tournaments' },
    children: [
      {
        path: '',
        component: () => import('../views/tournament/TournamentTeams.vue')
      }
    ]
  },
  // 赛事子路由 - 球员（在赛事/球队下）
  {
    path: '/tournaments/:id/teams/:teamId/players',
    name: 'TournamentTeamPlayers',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '球队球员', parent: 'tournaments' },
    children: [
      {
        path: '',
        component: () => import('../views/player/PlayerList.vue')
      }
    ]
  },
  {
    path: '/tournaments/:id/draw',
    name: 'TournamentDraw',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '抽签分组' },
    children: [
      {
        path: '',
        component: () => import('../views/tournament/TournamentDraw.vue')
      }
    ]
  },
  {
    path: '/tournaments/:id/schedule',
    name: 'TournamentSchedule',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '赛程管理' },
    children: [
      {
        path: '',
        component: () => import('../views/tournament/TournamentSchedule.vue')
      }
    ]
  },
  // 比赛详情页
  {
    path: '/tournaments/:id/match/:matchId',
    name: 'MatchDetail',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '比赛详情' },
    children: [
      {
        path: '',
        component: () => import('../views/tournament/MatchDetail.vue')
      }
    ]
  },
  {
    path: '/tournaments/create',
    name: 'TournamentCreate',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '创建赛事' },
    children: [
      {
        path: '',
        component: () => import('../views/tournament/TournamentCreate.vue')
      }
    ]
  },
  // 编辑赛事
  {
    path: '/tournaments/:id/edit',
    name: 'TournamentEdit',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '编辑赛事' },
    children: [
      {
        path: '',
        component: () => import('../views/tournament/TournamentEdit.vue')
      }
    ]
  },
  {
    path: '/tournaments/:id/signups',
    name: 'TournamentSignups',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '报名审核' },
    children: [
      {
        path: '',
        component: () => import('../views/tournament/TournamentSignups.vue')
      }
    ]
  },
  // ★ 换人申请审核页（T04 新增）
  {
    path: '/tournaments/:id/roster-changes',
    name: 'RosterChangeReview',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '换人审核', parent: 'tournaments' },
    children: [
      {
        path: '',
        component: () => import('../views/tournament/RosterChangeReview.vue')
      }
    ]
  },
  // 赛事官网（对外展示，无需登录）
  {
    path: '/t/:id',
    name: 'TournamentWebsite',
    component: () => import('../views/tournament/TournamentWebsite.vue'),
    meta: { requiresAuth: false, title: '赛事官网' }
  },
  // 签字页面（H5，扫码进入，无需登录）
  {
    path: '/sign',
    name: 'Signature',
    component: () => import('../views/signature/SignatureView.vue'),
    meta: { requiresAuth: false, title: '比赛监督签字' }
  },
  {
    path: '/test',
    name: 'TestData',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '测试数据' },
    children: [
      {
        path: '',
        component: () => import('../views/test/TestDataView.vue')
      }
    ]
  },
  {
    path: '/test/removebg',
    name: 'RemoveBgDemo',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '抠图功能测试' },
    children: [
      {
        path: '',
        component: () => import('../views/test/RemoveBgDemo.vue')
      }
    ]
  },
  // 海报编辑器
  {
    path: '/poster/editor',
    name: 'PosterEditor',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '海报编辑器' },
    children: [
      {
        path: '',
        component: () => import('../views/poster/PosterEditor.vue')
      }
    ]
  },
  {
    path: '/poster/editor/:tournamentId',
    name: 'PosterEditorTournament',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '赛事海报编辑' },
    children: [
      {
        path: '',
        component: () => import('../views/poster/PosterEditor.vue')
      }
    ]
  },
  // 系统管理
  {
    path: '/system',
    name: 'SystemAdmin',
    component: () => import('../views/layout/LayoutView.vue'),
    meta: { requiresAuth: true, title: '系统管理' },
    children: [
      {
        path: '',
        component: () => import('../views/system/SystemAdmin.vue')
      }
    ]
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// 当前后台只有主办方登录身份，默认进入赛事管理。
function getDefaultPathByRole() {
  return '/tournaments'
}

function hasOrganizerSession() {
  const role = localStorage.getItem('currentRole') || localStorage.getItem('role') || ''
  const version = localStorage.getItem('authSessionVersion') || ''
  const loginType = localStorage.getItem('loginType') || ''
  return role.toLowerCase() === 'organizer' && version === 'wechat-only-v1' && loginType === 'wechat'
}

function clearInvalidSession() {
  ['isLoggedIn', 'loginType', 'role', 'currentRole', 'userId', 'userInfo',
    'needSelectRole', 'needBindPhone', 'needSetPassword', 'needBindEmail',
    'wechatTemp', 'phone', 'phoneNumber', 'openid', 'unionid', 'authSessionVersion']
    .forEach(key => localStorage.removeItem(key))
}

// 路由守卫
router.beforeEach(async (to, from, next) => {
  // 跳过认证检查的页面（如绑定手机号，用户已通过微信扫码但还没绑手机号）
  if (to.meta.skipAuthCheck) {
    next()
    return
  }

  // ★ 赛事中心独立登录系统鉴权
  if (to.meta.tcAuth) {
    const tcIsLoggedIn = localStorage.getItem('tc_isLoggedIn')
    if (tcIsLoggedIn !== 'true') {
      next('/tournament-center-login')
      return
    }
    // 已登录，放行
    next()
    return
  }

  // 不需要认证的页面直接放行
  if (to.meta.requiresAuth === false) {
    const isLoggedIn = localStorage.getItem('isLoggedIn')
    if (isLoggedIn === 'true') {
      if (!hasOrganizerSession()) {
        clearInvalidSession()
        if (to.path === '/login') next()
        else next('/login')
        return
      }
      // 已登录状态访问登录页，根据角色跳转对应首页
      if (to.path === '/login') {
        next(getDefaultPathByRole())
        return
      }
      // 已登录用户访问赛事中心 → 根据角色跳转首页
      // （赛事中心是面向未登录访客的公共页面，已登录用户应直接进入管理后台）
      if (to.path === '/tournament-center') {
        next(getDefaultPathByRole())
        return
      }
    }
    next()
    return
  }

  // 检查是否已登录（localStorage 快速检查）
  const isLoggedIn = localStorage.getItem('isLoggedIn')
  const loginType = localStorage.getItem('loginType') || ''
  if (isLoggedIn === 'true') {
    if (!hasOrganizerSession()) {
      clearInvalidSession()
      next('/login')
      return
    }
    // 纯微信会话已通过版本与主办方角色校验。
    // 访问根路径时，根据角色跳转对应首页
    if (to.path === '/' || to.path === '/dashboard') {
      next(getDefaultPathByRole())
      return
    }
    next()
  } else {
    // 尝试恢复云开发登录态（刷新页面场景）
    // 动态导入避免循环依赖
    const { checkAuth } = await import('../utils/cloud')
    const isAuth = await checkAuth()
    if (isAuth) {
      localStorage.setItem('isLoggedIn', 'true')
      if (!hasOrganizerSession()) {
        clearInvalidSession()
        next('/login')
        return
      }
      // 访问根路径时，根据角色跳转对应首页
      if (to.path === '/' || to.path === '/dashboard') {
        next(getDefaultPathByRole())
        return
      }
      next()
    } else {
      next('/login')
    }
  }
})

export default router
