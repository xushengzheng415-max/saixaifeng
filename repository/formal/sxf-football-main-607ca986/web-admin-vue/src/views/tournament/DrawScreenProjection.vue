<template>
  <main class="draw-screen" :class="[`theme-${state.screen?.theme || 'emerald'}`, `size-${state.screen?.fontSize || 'standard'}`]">
    <div class="screen-noise"></div>
    <header>
      <div class="brand-mark"><span>赛</span><strong>赛小蜂足球</strong></div>
      <div v-if="state.screen?.showTournament !== false" class="event-title">{{ state.tournamentName || '足球赛事' }} · {{ state.divisionName || '抽签仪式' }}</div>
      <div class="live-state"><i></i>{{ stageLabel }}</div>
    </header>

    <section v-if="state.stage === 'intro'" class="hero-state">
      <p class="eyebrow">DRAW CEREMONY</p><h1>抽签仪式</h1>
      <p class="hero-subtitle">{{ state.showRules ? '按已确认的抽签规则进行现场分组' : '现场抽签即将开始' }}</p>
      <div class="intro-rule-grid"><span>参赛球队<strong>{{ state.teams.length }}</strong></span><span>抽签方式<strong>{{ state.drawMode || '分组抽签' }}</strong></span><span>状态<strong>准备开始</strong></span></div>
    </section>

    <section v-else-if="state.stage === 'teams'" class="teams-state">
      <div class="section-heading"><p class="eyebrow">TEAM POOL</p><h1>参赛球队</h1><span>{{ state.teams.length }} 支球队已就绪</span></div>
      <div class="team-grid"><article v-for="team in state.teams" :key="team.id"><img v-if="state.screen?.showCrest !== false && team.logo" :src="team.logo" :alt="team.name"><b v-else>{{ (team.name || '队')[0] }}</b><strong>{{ team.name }}</strong></article></div>
    </section>

    <section v-else-if="state.stage === 'drawing'" class="drawing-state">
      <div class="section-heading"><p class="eyebrow">DRAWING</p><h1>正在抽签</h1><span>{{ state.assignedCount }}/{{ state.teams.length }} 支球队已分配</span></div>
      <div class="drawing-focus"><div class="draw-orb">{{ state.currentTeam?.code || '抽签' }}</div><p>当前球队</p><strong>{{ state.currentTeam?.name || '等待抽取' }}</strong><em v-if="state.currentGroup">进入 {{ state.currentGroup }}</em></div>
      <div v-if="state.screen?.showProgress !== false" class="progress-track"><i :style="{ width: `${progress}%` }"></i></div>
    </section>

    <section v-else class="result-state">
      <div class="section-heading"><p class="eyebrow">DRAW RESULT</p><h1>抽签结果</h1><span>场序已确认 · 比赛时间待后续编排</span></div>
      <div class="group-grid"><article v-for="group in groups" :key="group.name"><header><strong>{{ group.name }}</strong><span>{{ group.teams.length }} 支</span></header><ol><li v-for="(team,index) in group.teams" :key="team.id || `${group.name}-${index}`"><b>{{ index + 1 }}</b><span>{{ team.name }}</span></li></ol></article></div>
    </section>

    <footer><span>抽签结果以主办方确认版本为准</span><span v-if="state.screen?.showOperationLog">实时同步 · {{ lastUpdated }}</span><span v-else>{{ lastUpdated }}</span></footer>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const channelName = `sxf-draw-screen-${String(route.query.tournamentId || route.params.id || '')}-${String(route.query.divisionId || 'default')}`
const state = ref({ stage: 'intro', teams: [], assignments: [], screen: {}, tournamentName: '', divisionName: '', assignedCount: 0, updatedAt: '' })
const lastUpdated = computed(() => state.value.updatedAt ? new Date(state.value.updatedAt).toLocaleTimeString('zh-CN', { hour12: false }) : '等待主控同步')
const stageLabel = computed(() => ({ intro: '准备中', teams: '球队展示', drawing: '抽签进行中', result: '结果已确认' }[state.value.stage] || '等待同步'))
const progress = computed(() => state.value.teams.length ? Math.min(100, Math.round(Number(state.value.assignedCount || 0) / state.value.teams.length * 100)) : 0)
const groups = computed(() => {
  const map = new Map()
  ;(state.value.assignments || []).forEach(item => {
    const name = `${String.fromCharCode(65 + Number(item.groupIndex || 0))}组`
    const team = state.value.teams.find(row => String(row.id) === String(item.teamId)) || { id: item.teamId, name: item.teamName || '待定' }
    const list = map.get(name) || []
    list.push({ ...team, position: Number(item.position || list.length + 1) })
    map.set(name, list)
  })
  return [...map.entries()].sort().map(([name, teams]) => ({ name, teams: teams.sort((a, b) => a.position - b.position) }))
})
let channel
function apply(next) { if (next && typeof next === 'object') state.value = { ...state.value, ...next, teams: Array.isArray(next.teams) ? next.teams : state.value.teams, assignments: Array.isArray(next.assignments) ? next.assignments : state.value.assignments } }
function readInitial() { try { const raw = localStorage.getItem(channelName); if (raw) apply(JSON.parse(raw)) } catch {} }
onMounted(() => { readInitial(); if ('BroadcastChannel' in window) { channel = new BroadcastChannel(channelName); channel.onmessage = event => apply(event.data) } window.addEventListener('storage', readInitial); document.documentElement.requestFullscreen?.().catch(() => {}) })
onBeforeUnmount(() => { channel?.close(); window.removeEventListener('storage', readInitial) })
</script>

<style scoped>
:global(html),:global(body),:global(#app){margin:0;width:100%;height:100%;overflow:hidden;background:#031b14}
.draw-screen{position:relative;box-sizing:border-box;width:100vw;height:100vh;overflow:hidden;padding:clamp(26px,4vw,72px) clamp(32px,6vw,120px) 28px;color:#f6fff8;background:radial-gradient(circle at 50% -15%,rgba(75,221,140,.34),transparent 34%),linear-gradient(145deg,#021c14,#07593d 54%,#021810);font-family:"Microsoft YaHei",Arial,sans-serif}.draw-screen.theme-stadium{background:radial-gradient(circle at 75% 8%,rgba(22,135,218,.35),transparent 30%),linear-gradient(145deg,#041326,#0b3761 55%,#020d1a)}.draw-screen.theme-light{color:#173328;background:linear-gradient(145deg,#f6fbf7,#dcefe3)}.screen-noise{position:absolute;inset:0;pointer-events:none;opacity:.16;background-image:linear-gradient(115deg,transparent 45%,rgba(255,255,255,.08) 46%,transparent 47%)}header,footer,.hero-state,.teams-state,.drawing-state,.result-state{position:relative;z-index:1}.draw-screen>header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.22);padding-bottom:18px}.theme-light>header{border-color:rgba(23,51,40,.16)}.brand-mark{display:flex;align-items:center;gap:12px;font-size:clamp(14px,1.4vw,24px)}.brand-mark span{display:grid;place-items:center;width:clamp(32px,3vw,52px);height:clamp(32px,3vw,52px);border-radius:12px;color:#0b5f3c;background:#e9fff0;font-weight:900}.event-title{font-size:clamp(15px,1.4vw,25px);font-weight:700;letter-spacing:.05em}.live-state{display:flex;align-items:center;gap:8px;color:#bdf5ce;font-size:clamp(12px,1vw,18px)}.live-state i{width:9px;height:9px;border-radius:50%;background:#64f38d;box-shadow:0 0 16px #64f38d}.theme-light .live-state{color:#087943}.hero-state,.drawing-state{display:grid;place-items:center;align-content:center;min-height:calc(100vh - 190px);text-align:center}.eyebrow{margin:0 0 14px;color:#9deab4;font-size:clamp(11px,1vw,17px);letter-spacing:.3em}.theme-light .eyebrow{color:#17804a}.hero-state h1,.drawing-state h1,.section-heading h1{margin:0;font-size:clamp(48px,7vw,126px);line-height:1.05;letter-spacing:.08em}.hero-subtitle{margin:24px 0 46px;font-size:clamp(16px,1.6vw,28px);opacity:.82}.intro-rule-grid{display:flex;gap:clamp(16px,4vw,80px);padding:20px 38px;border:1px solid rgba(255,255,255,.22);border-radius:16px;background:rgba(0,20,13,.22)}.intro-rule-grid span{display:flex;flex-direction:column;gap:8px;min-width:140px;color:#b9d9c2}.intro-rule-grid strong{color:inherit;font-size:clamp(20px,1.8vw,32px)}.teams-state,.result-state{min-height:calc(100vh - 190px);padding-top:5vh}.section-heading{text-align:center}.section-heading span{display:block;margin-top:16px;opacity:.76;font-size:clamp(14px,1.2vw,21px)}.team-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin:5vh auto 0;max-width:1500px}.team-grid article{display:flex;align-items:center;gap:12px;min-height:70px;padding:12px 14px;border:1px solid rgba(255,255,255,.2);border-radius:12px;background:rgba(0,25,16,.3)}.team-grid img,.team-grid b{display:grid;place-items:center;flex:none;width:42px;height:42px;border-radius:50%;object-fit:contain;background:#fff;color:#087943}.team-grid strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.drawing-focus{display:grid;place-items:center;margin-top:4vh;text-align:center}.draw-orb{display:grid;place-items:center;width:clamp(150px,18vw,300px);height:clamp(150px,18vw,300px);border:2px solid rgba(202,255,214,.65);border-radius:50%;box-shadow:0 0 50px rgba(103,255,155,.35),inset 0 0 40px rgba(103,255,155,.18);font-size:clamp(28px,4vw,70px);font-weight:900}.drawing-focus p{margin:18px 0 7px;opacity:.7}.drawing-focus strong{font-size:clamp(24px,2.8vw,50px)}.drawing-focus em{margin-top:12px;color:#d5ff92;font-style:normal;font-size:clamp(15px,1.5vw,26px)}.progress-track{width:min(760px,70vw);height:8px;margin:34px auto 0;border-radius:99px;background:rgba(255,255,255,.2)}.progress-track i{display:block;height:100%;border-radius:inherit;background:#8ef2a9;transition:width .4s ease}.group-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;max-width:1500px;margin:5vh auto 0}.group-grid article{overflow:hidden;border:1px solid rgba(255,255,255,.22);border-radius:12px;background:rgba(0,25,16,.32)}.group-grid header{display:flex;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.15);font-size:18px}.group-grid header span{opacity:.7;font-size:13px}.group-grid ol{margin:0;padding:8px 16px 12px;list-style:none}.group-grid li{display:grid;grid-template-columns:28px 1fr;gap:8px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.12)}.group-grid li:last-child{border:0}.group-grid li b{color:#aaf4bc}.draw-screen>footer{display:flex;justify-content:space-between;padding-top:16px;border-top:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.62);font-size:12px}.theme-light>footer{border-color:rgba(23,51,40,.16);color:#60796d}@media(max-width:1000px){.team-grid{grid-template-columns:repeat(3,1fr)}.group-grid{grid-template-columns:repeat(2,1fr)}}
</style>
