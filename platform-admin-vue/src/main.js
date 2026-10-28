import {createApp,h} from 'vue'
import {createRouter,createWebHashHistory,RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import './assets/global.css'
import './assets/portal.css'
import './assets/platform-tablet.css'
import {activatePlatformContext,getPlatformAuthToken} from './utils/platformSession'
import {registerPlatformServiceWorker} from './utils/serviceWorker'
import PlatformTitlebar from './components/PlatformTitlebar.vue'
const router=createRouter({history:createWebHashHistory(),routes:[
  {path:'/platform-login',component:()=>import('./views/login/PlatformLoginView.vue')},
  {path:'/tournament-center-admin',component:()=>import('./views/tournament-center/TournamentCenterAdmin.vue'),meta:{platform:true}},
  {path:'/system',component:()=>import('./views/system/SystemAdmin.vue'),meta:{platform:true}},
  {path:'/',redirect:()=>window.location.pathname.includes('tournament-center-admin')?'/tournament-center-admin':'/platform-login'},
  {path:'/:pathMatch(.*)*',redirect:'/tournament-center-admin'}
]})
router.beforeEach(to=>{activatePlatformContext();return to.meta.platform&&!getPlatformAuthToken()?'/platform-login':true})
createApp({render:()=>h('div',{class:'platform-app-frame'},[h(PlatformTitlebar),h(RouterView)])}).use(router).use(ElementPlus,{locale:zhCn}).mount('#app')
registerPlatformServiceWorker()
