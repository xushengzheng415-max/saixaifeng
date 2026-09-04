<template>
  <main class="qa-hub">
    <header class="qa-header">
      <div>
        <span class="eyebrow">仅本地开发环境</span>
        <h1>赛小蜂足球 · PC 原型验收台</h1>
        <p>按正式画板阶段打开页面。所有样例数据都在当前浏览器内隔离，不调用生产写接口。</p>
      </div>
      <div class="qa-summary">
        <strong>{{ pageCount }}</strong>
        <span>个 PC 节点入口</span>
      </div>
    </header>

    <el-alert
      title="本验收台只解决本地登录和空数据阻塞；页面仍须按原型目标视口截图并完成叠图对比，不能据此直接标记 visual-1:1。"
      type="warning"
      :closable="false"
      show-icon
    />
    <p class="fixture-status" :class="fixtureReady ? 'ready' : 'blocked'">{{ fixtureStatus }}</p>

    <section v-for="group in groups" :key="group.code" class="qa-group">
      <div class="group-heading">
        <div><span>{{ group.code }}</span><h2>{{ group.title }}</h2></div>
        <small>{{ group.pages.length }} 个入口</small>
      </div>
      <div class="page-grid">
        <button v-for="page in group.pages" :key="page.path" type="button" @click="openPage(page.path)">
          <span>{{ page.name }}</span>
          <small>{{ page.note }}</small>
          <b>打开页面 →</b>
        </button>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { queryById } from '../../utils/cloud'

const router = useRouter()
const route = useRoute()
const fixtureReady = ref(false)
const fixtureStatus = ref('正在校验本地样例数据…')
const tournament = 'qa-tournament-2026'
const simpleDivision = 'qa-division-u8'
const proDivision = 'qa-division-u16'
const team = 'qa-team-zhengzhou'

const groups = [
  { code: 'P1', title: '入口、赛事空间与主控制台', pages: [
    { name: 'PC 登录入口', note: '本地不跳正式广告页', path: '/login' },
    { name: '赛事空间', note: '赛事卡片与创建入口', path: '/tournament-space' },
    { name: '创建赛事 · 基础信息', note: '正式创建表单', path: '/tournaments/create' },
    { name: '赛事主控制台', note: '赛事全局状态与功能入口', path: `/tournaments/${tournament}` }
  ] },
  { code: 'P2', title: '竞赛管理 · 简易版与专业版规则', pages: [
    { name: '5 个组别总览', note: '组别卡片和菜单', path: `/tournaments/${tournament}/competition` },
    { name: '添加组别', note: '基础创建', path: `/tournaments/${tournament}/competition/create` },
    { name: '模式对比', note: '简易版与专业版', path: `/tournaments/${tournament}/competition/create?view=mode-compare` },
    { name: '简易 · 赛制设置', note: '步骤 1', path: `/tournaments/${tournament}/competition/rules?divisionId=${simpleDivision}&step=format` },
    { name: '简易 · 基础规则', note: '步骤 2', path: `/tournaments/${tournament}/competition/rules?divisionId=${simpleDivision}&step=rules` },
    { name: '简易 · 规则定版', note: '步骤 3', path: `/tournaments/${tournament}/competition/rules?divisionId=${simpleDivision}&step=finalize` },
    { name: '简易 · 规则生效', note: '完成状态', path: `/tournaments/${tournament}/competition/rules?divisionId=${simpleDivision}&step=effective` },
    { name: '专业 · 赛制结构', note: '步骤 1', path: `/tournaments/${tournament}/competition/rules?divisionId=${proDivision}&step=format` },
    { name: '专业 · 参赛资格', note: '步骤 2', path: `/tournaments/${tournament}/competition/rules?divisionId=${proDivision}&step=eligibility` },
    { name: '专业 · 比赛执行', note: '步骤 3', path: `/tournaments/${tournament}/competition/rules?divisionId=${proDivision}&step=execution` },
    { name: '专业 · 积分排名', note: '步骤 4', path: `/tournaments/${tournament}/competition/rules?divisionId=${proDivision}&step=ranking` },
    { name: '专业 · 晋级规则', note: '步骤 5', path: `/tournaments/${tournament}/competition/rules?divisionId=${proDivision}&step=advancement` },
    { name: '专业 · 规则定版', note: '步骤 6', path: `/tournaments/${tournament}/competition/rules?divisionId=${proDivision}&step=finalize` },
    { name: '专业 · 规则生效', note: '完成状态', path: `/tournaments/${tournament}/competition/rules?divisionId=${proDivision}&step=effective` }
  ] },
  { code: 'P3', title: '球队管理与正式名单', pages: [
    { name: '简易版参赛球队', note: '球队列表', path: `/tournaments/${tournament}/teams?divisionId=${simpleDivision}` },
    { name: '专业版参赛球队', note: '球队列表', path: `/tournaments/${tournament}/teams?divisionId=${proDivision}&mode=professional` },
    { name: '生成球队邀请', note: '邀请弹窗', path: `/tournaments/${tournament}/teams?divisionId=${proDivision}&mode=professional&action=invite` },
    { name: '快速添加球队', note: '预建参赛占位', path: `/tournaments/${tournament}/teams?divisionId=${proDivision}&mode=professional&action=quick-add` },
  { name: '球队详情', note: '赛事球队视角', path: `/tournaments/${tournament}/teams/${team}?divisionId=${proDivision}&mode=professional` },
    { name: '加入申请', note: '待处理队列', path: `/tournaments/${tournament}/teams?divisionId=${proDivision}&mode=professional&tab=pending` },
    { name: '参赛名单', note: '名单总览', path: `/tournaments/${tournament}/teams?divisionId=${proDivision}&mode=professional&tab=roster` },
    { name: '查看正式名单', note: '球队名单快照', path: `/tournaments/${tournament}/teams/${team}/roster?divisionId=${proDivision}` },
    { name: '名单异常处理', note: '异常与待补资料', path: `/tournaments/${tournament}/roster-exceptions?divisionId=${proDivision}` },
    { name: '名单变更', note: '审核留痕', path: `/tournaments/${tournament}/roster-changes?divisionId=${proDivision}&mode=professional` }
  ] },
  { code: 'P4', title: '抽签、分组与赛程管理', pages: [
    { name: '抽签模式选择', note: '简易 / 专业入口', path: `/tournaments/${tournament}/draw?divisionId=${proDivision}` },
    { name: '快速分组设置', note: '简易模式', path: `/tournaments/${tournament}/draw?divisionId=${simpleDivision}&mode=quick&view=config` },
    { name: '快速分组操作台', note: '混合制', path: `/tournaments/${tournament}/draw?divisionId=${simpleDivision}&mode=quick&format=hybrid&view=console` },
    { name: '专业 · 抽签设置', note: '步骤 1', path: `/tournaments/${tournament}/draw?divisionId=${proDivision}&mode=professional&step=setup` },
    { name: '专业 · 球队池', note: '步骤 2，含下一步', path: `/tournaments/${tournament}/draw?divisionId=${proDivision}&mode=professional&step=pool` },
    { name: '专业 · 大屏设置', note: '步骤 3', path: `/tournaments/${tournament}/draw?divisionId=${proDivision}&mode=professional&step=screen` },
    { name: '专业 · 抽签操作台', note: '步骤 4', path: `/tournaments/${tournament}/draw?divisionId=${proDivision}&mode=professional&step=console` },
    { name: '专业 · 分组结果', note: '步骤 5', path: `/tournaments/${tournament}/draw?divisionId=${proDivision}&mode=professional&step=result` },
    { name: '赛程总览', note: '生成与编排状态', path: `/tournaments/${tournament}/schedule?divisionId=${proDivision}` },
    { name: '赛程基础设置', note: '生成器入口', path: `/tournaments/${tournament}/schedule?divisionId=${proDivision}&view=editor&generator=basic` },
    { name: '场地与时间', note: '编排工作台', path: `/tournaments/${tournament}/schedule?divisionId=${proDivision}&view=editor` },
    { name: '冲突检测', note: '冲突面板', path: `/tournaments/${tournament}/schedule?divisionId=${proDivision}&view=editor&panel=conflicts` },
    { name: '手动修改场次', note: '指定场次编辑', path: `/tournaments/${tournament}/schedule?divisionId=${proDivision}&view=editor&editMatchId=qa-match-upcoming` }
  ] },
  { code: 'P5', title: '比赛管理、复核归档与裁判', pages: [
    { name: '比赛管理 · 选择组别', note: '组别入口', path: `/tournaments/${tournament}/matches` },
    { name: 'U8 比赛列表', note: '简易版', path: `/tournaments/${tournament}/matches?divisionId=${simpleDivision}` },
    { name: 'U16 比赛列表', note: '专业版', path: `/tournaments/${tournament}/matches?divisionId=${proDivision}` },
    { name: '赛中只读监控', note: '专业比赛现场状态', path: `/tournaments/${tournament}/match/qa-match-u16-013/monitor` },
    { name: '赛后资料接收', note: '主办方补充', path: `/tournaments/${tournament}/match/qa-match-u8-012/post-match` },
    { name: '赛果复核', note: '受控审核', path: `/tournaments/${tournament}/match/qa-match-u16-013/review` },
    { name: '比赛归档详情', note: '只读记录', path: `/tournaments/${tournament}/match/qa-match-u16-013/archive` },
    { name: '裁判管理', note: '裁判库与四人组分配', path: `/referee/head-referee?tournamentId=${tournament}` }
  ] }
]

const pageCount = computed(() => groups.reduce((sum, group) => sum + group.pages.length, 0))

onMounted(async () => {
  if (!import.meta.env.DEV) router.replace('/login')
  sessionStorage.setItem('sxfVisualQa', '1')
  localStorage.setItem('sxfVisualQa', '1')
  try {
    const record = await queryById('tournaments', tournament)
    fixtureReady.value = Boolean(record?._id)
    fixtureStatus.value = fixtureReady.value ? `本地样例已就绪：${record.name}` : '本地样例未加载，页面将显示空状态。'
    if (fixtureReady.value && typeof route.query.target === 'string' && route.query.target.startsWith('/')) {
      const target = route.query.target.includes('?') ? `${route.query.target}&visualQa=1` : `${route.query.target}?visualQa=1`
      await router.replace(target)
    }
  } catch (error) {
    fixtureStatus.value = `本地样例校验失败：${error.message}`
  }
})

function openPage(path) {
  sessionStorage.setItem('sxfVisualQa', '1')
  localStorage.setItem('sxfVisualQa', '1')
  router.push(path)
}
</script>

<style scoped>
.fixture-status{max-width:1480px;margin:12px auto 0;padding:10px 14px;border-radius:8px;font-size:13px}.fixture-status.ready{color:#12663d;background:#e8f6ed}.fixture-status.blocked{color:#a43f24;background:#fff0eb}
.qa-hub{min-height:100vh;padding:42px clamp(24px,5vw,84px) 80px;color:#183426;background:#f3f7f4}.qa-header{display:flex;align-items:flex-end;justify-content:space-between;gap:32px;margin:0 auto 24px;max-width:1480px;padding:32px 38px;color:#fff;background:linear-gradient(115deg,#073d23,#0d6b3b 68%,#169457);border-radius:18px;box-shadow:0 18px 50px rgba(7,61,35,.16)}.eyebrow{display:inline-block;margin-bottom:8px;color:#bde8cb;font-size:13px;font-weight:700;letter-spacing:.12em}.qa-header h1{margin:0;font-size:34px}.qa-header p{margin:10px 0 0;color:#d9eee1}.qa-summary{min-width:150px;padding:18px 22px;text-align:center;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);border-radius:14px}.qa-summary strong,.qa-summary span{display:block}.qa-summary strong{font-size:36px}.qa-summary span{margin-top:2px;color:#d4e8da;font-size:13px}.qa-hub>.el-alert,.qa-group{max-width:1480px;margin-left:auto;margin-right:auto}.qa-group{margin-top:24px;padding:26px 28px 30px;background:#fff;border:1px solid #dfe9e2;border-radius:16px}.group-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}.group-heading>div{display:flex;align-items:center;gap:12px}.group-heading span{display:grid;place-items:center;width:42px;height:30px;color:#fff;font-weight:800;background:#127648;border-radius:8px}.group-heading h2{margin:0;font-size:21px}.group-heading small{color:#7b8a81}.page-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px}.page-grid button{display:flex;min-height:116px;padding:17px;flex-direction:column;align-items:flex-start;text-align:left;color:#213c2e;background:#f8fbf9;border:1px solid #dce8df;border-radius:11px;cursor:pointer;transition:.16s ease}.page-grid button:hover{transform:translateY(-2px);border-color:#2b8b5a;box-shadow:0 8px 20px rgba(16,95,55,.1)}.page-grid span{font-size:15px;font-weight:750}.page-grid small{margin-top:7px;color:#78877e;line-height:1.45}.page-grid b{margin-top:auto;color:#0f7544;font-size:12px}@media(max-width:1100px){.page-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:760px){.qa-header{align-items:flex-start;flex-direction:column}.page-grid{grid-template-columns:1fr 1fr}}@media(max-width:520px){.page-grid{grid-template-columns:1fr}.qa-header h1{font-size:26px}}
</style>
