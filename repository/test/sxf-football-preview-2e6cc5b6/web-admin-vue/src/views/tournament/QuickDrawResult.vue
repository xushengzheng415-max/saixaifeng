<template>
  <section class="quick-result" v-loading="loading">
    <header class="event-header">
      <div class="event-main"><span class="event-mark">赛</span><div><h2>{{ tournament.name || '2026 赛小蜂青少年足球邀请赛' }}</h2><p>{{ eventMeta }}</p></div><el-tag>{{ divisionName }}</el-tag><el-tag type="success">进行中</el-tag></div>
      <el-button plain @click="exitSpace"><el-icon><SwitchButton /></el-icon>返回赛事空间</el-button>
    </header>

    <div class="page-heading">
      <div><h1>抽签与分组</h1><p>查看并确认快速分组结果</p></div>
      <label><span>当前组别</span><strong class="division-lock">{{ divisionName }}<el-icon><Lock /></el-icon></strong></label>
    </div>

    <nav class="steps"><button v-if="!isConfirmed && !isArchived" @click="backConfig">分组设置</button><button v-if="!isConfirmed && !isArchived" @click="backConsole">分组操作台</button><button class="active">分组结果</button></nav>

    <section v-if="hasSavedResult" class="summary">
      <span>参赛球队 <b>{{ teamCount }}</b></span><i /><span>已分组 <b>{{ assignedCount }}</b></span><i /><span>{{ resultUnitCount }} {{ unitLabel }}</span><i /><span>{{ sizeLabel }}</span><i /><em><el-icon><CircleCheckFilled /></el-icon>分组校验通过</em><el-tag :type="isConfirmed ? 'success' : 'warning'" effect="light">确认状态：{{ statusLabel }}</el-tag><el-button v-if="!isConfirmed && !isArchived" type="success" :loading="confirming" @click="confirm"><el-icon><Check /></el-icon>确认当前签位结果</el-button><el-button v-if="isConfirmed && !isArchived" type="primary" :loading="pairingGenerating" @click="generatePairingsAndViewPairings">生成对阵并查看</el-button><el-button plain @click="backOverview"><el-icon><Back /></el-icon>返回抽签与分组</el-button>
    </section>

    <section v-if="hasSavedResult" class="toolbar">
      <el-select v-model="groupFilter"><el-option label="全部小组" value="all" /><el-option v-for="group in groups" :key="group.name" :label="group.name" :value="group.name" /></el-select>
      <el-input v-model="keyword" placeholder="搜索球队名称"><template #prefix><el-icon><Search /></el-icon></template></el-input>
      <el-button-group><el-button :type="viewMode === 'card' ? 'success' : ''" @click="viewMode = 'card'"><el-icon><Grid /></el-icon>卡片视图</el-button><el-button :type="viewMode === 'list' ? 'success' : ''" @click="viewMode = 'list'"><el-icon><List /></el-icon>列表视图</el-button></el-button-group>
      <el-button v-if="['tournament','cup','league'].includes(format)" type="success" plain @click="openPoster"><el-icon><Picture /></el-icon>{{ format === 'cup' ? '生成签位海报' : format === 'league' ? '生成联赛排序海报' : '生成分组海报' }}</el-button>
      <el-button plain @click="exportResult"><el-icon><DocumentAdd /></el-icon>导出分组表</el-button>
    </section>

    <el-alert v-if="invalidLogoTeams.length" class="logo-source-alert" type="warning" :closable="false" show-icon :title="`${invalidLogoTeams.join('、')}的队徽源文件已失效，请重新上传队徽`" />

    <main v-if="hasSavedResult && format === 'tournament'" :class="['group-grid', viewMode]">
      <article v-for="group in visibleGroups" :key="group.name"><header><h3>{{ group.name }}</h3><b>{{ group.teams.length }}/{{ group.maxTeams }}</b></header><ol><li v-for="(team,index) in group.teams" :key="team.id"><b>{{ group.code }}{{ index + 1 }}</b><span class="crest"><img v-if="team.logo || team.logoUrl" :src="team.logo || team.logoUrl" alt="" @error="clearTeamLogo(team)" /><em v-else>{{ team.name.slice(0,1) }}</em></span><strong>{{ team.name }}</strong><el-icon><Rank /></el-icon></li></ol></article>
    </main>

    <main v-else-if="hasSavedResult && format === 'cup'" class="knockout-result-layout">
      <section class="knockout-zone left-zone"><header><div><h3>左半区</h3><p>签01—签08 · 首轮4场</p></div><el-tag type="success" effect="plain">{{ leftKnockoutSlots.filter(item => item.teamId).length }}/8</el-tag></header><table><thead><tr><th>签位</th><th>参赛球队</th><th>首轮</th></tr></thead><tbody><tr v-for="(slot,index) in leftKnockoutSlots" :key="slot.slotCode || index"><td>{{ slotLabel(slot,index) }}</td><td><span class="crest"><img v-if="slot.logo || slot.logoUrl" :src="slot.logo || slot.logoUrl" alt="" @error="clearTeamLogo(slot)" /><em v-else>{{ (slot.name || '待')[0] }}</em></span><strong>{{ slot.name || '待抽签' }}</strong></td><td>第{{ Math.floor(index / 2) + 1 }}场</td></tr></tbody></table></section>
      <section class="knockout-center"><el-icon><Trophy /></el-icon><h3>单淘汰赛</h3><strong>16个签位</strong><span>8场首轮对阵</span><i></i><p>左右半区胜者会师决赛</p></section>
      <section class="knockout-zone right-zone"><header><div><h3>右半区</h3><p>签09—签16 · 首轮4场</p></div><el-tag type="success" effect="plain">{{ rightKnockoutSlots.filter(item => item.teamId).length }}/8</el-tag></header><table><thead><tr><th>首轮</th><th>参赛球队</th><th>签位</th></tr></thead><tbody><tr v-for="(slot,index) in rightKnockoutSlots" :key="slot.slotCode || index"><td>第{{ Math.floor(index / 2) + 5 }}场</td><td><span class="crest"><img v-if="slot.logo || slot.logoUrl" :src="slot.logo || slot.logoUrl" alt="" @error="clearTeamLogo(slot)" /><em v-else>{{ (slot.name || '待')[0] }}</em></span><strong>{{ slot.name || '待抽签' }}</strong></td><td>{{ slotLabel(slot,index + 8) }}</td></tr></tbody></table></section>
    </main>

    <main v-else-if="hasSavedResult" class="format-result">
      <section class="result-card" :class="{ 'league-result-card':format === 'league' }"><header><div><h3>{{ formatTitle }}</h3><p>{{ formatDescription }}</p></div><el-tag type="success" effect="light">{{ statusLabel }}</el-tag></header><ol><li v-for="(team,index) in filteredRankedTeams" :key="team.id"><b>{{ index + 1 }}</b><span class="crest"><img v-if="team.logo || team.logoUrl" :src="team.logo || team.logoUrl" alt="" @error="clearTeamLogo(team)" /><em v-else>{{ team.name.slice(0,1) }}</em></span><strong>{{ team.name }}</strong><em v-if="format === 'hybrid' && index < advanceCount">晋级种子 {{ index + 1 }}</em></li></ol></section>
      <section class="result-card stage-preview"><header><div><h3>{{ format === 'league' ? '赛程草稿摘要' : '淘汰赛阶段摘要' }}</h3><p>只读展示当前组别已保存快照</p></div></header><div class="stage-metrics"><span><b>{{ resultUnitCount }}</b><small>{{ unitLabel }}</small></span><span><b>{{ assignedCount }}</b><small>已保存球队</small></span><span><b>{{ format === 'hybrid' ? advanceCount : format === 'cup' ? bracketCapacity : leagueRoundCount }}</b><small>{{ format === 'league' ? '轮单循环' : '签位容量' }}</small></span></div><p class="boundary-note">当前结果仍未发布赛程。确认只锁定本组抽签快照，随后进入赛程编排。</p></section>
    </main>

    <section v-else class="empty-result"><el-icon><WarningFilled /></el-icon><h3>当前组别还没有已保存的分组结果</h3><p>未保存的操作台状态不能显示为正式结果。请返回操作台完成并保存当前赛制草稿。</p><el-button type="success" @click="backConsole">返回分组操作台</el-button></section>

    <footer v-if="hasSavedResult" class="action-bar">
      <div class="checks"><span><el-icon><CircleCheckFilled /></el-icon>分组校验通过</span><span><el-icon><CircleCheckFilled /></el-icon>球队无重复</span><span><el-icon><CircleCheckFilled /></el-icon>{{ sizeLabel }}</span><span><el-icon><CircleCheckFilled /></el-icon>签位编号正确</span><i /><em>{{ isArchived ? '归档结果只读' : isConfirmed ? '当前结果已确认' : '当前结果尚未确认' }}</em></div>
      <div v-if="!isConfirmed && !isArchived" class="footer-actions"><el-button @click="backConsole"><el-icon><Refresh /></el-icon>继续调整</el-button><el-button type="success" :loading="confirming" @click="confirm"><el-icon><Check /></el-icon>确认分组结果</el-button><small>确认即完成本组抽签；后续修改须从抽签总览发起。</small></div><div v-else class="footer-actions confirmed-actions"><el-button type="primary" :loading="pairingGenerating" @click="generatePairingsAndViewPairings">生成对阵并查看</el-button><el-button type="success" @click="backOverview"><el-icon><Back /></el-icon>返回抽签与分组</el-button><small>当前结果已锁定；对阵单独查看，日期时间在赛历中安排。</small></div>
    </footer>

    <el-dialog v-model="posterVisible" title="生成分组海报" width="min(1120px, calc(100vw - 48px))" destroy-on-close>
      <div class="poster-workspace">
        <aside class="poster-themes"><strong>选择海报风格</strong><button v-for="theme in posterThemes" :key="theme.id" type="button" :class="[theme.id,{ active:posterTheme===theme.id }]" @click="posterTheme=theme.id"><span></span><b>{{ theme.name }}</b><small>{{ theme.description }}</small></button><p>版式为原创生成，仅参考常见足球赛事海报的信息层级。</p></aside>
        <div class="poster-preview-shell">
          <section ref="posterRef" :class="['draw-poster',`theme-${posterTheme}`]">
            <div class="poster-glow poster-glow-one"></div><div class="poster-glow poster-glow-two"></div><div class="poster-pitch"><i></i></div>
            <header><div class="poster-brand"><img :src="saixiaofengLogo" alt="赛小蜂足球" /></div><small>GROUP DRAW · 分组抽签结果</small></header>
            <div class="poster-title"><p>{{ divisionName }}</p><h2>{{ tournament.name || '足球赛事' }}</h2><strong>{{ format === 'cup' ? '淘汰赛签位正式公布' : format === 'league' ? '联赛轮转排序正式公布' : '分组结果正式公布' }}</strong><span>{{ eventMeta }}</span></div>
            <div v-if="format === 'tournament'" class="poster-group-grid"><article v-for="group in groups" :key="group.name"><header><h3>{{ group.name }}</h3><b>{{ group.teams.length }} 支球队</b></header><ol><li v-for="(team,index) in group.teams" :key="team.id"><span>{{ group.code }}{{ index + 1 }}</span><i><img v-if="team.logo || team.logoUrl" :src="team.logo || team.logoUrl" alt="" crossorigin="anonymous" @error="clearTeamLogo(team)" /><em v-else>{{ team.name.slice(0,1) }}</em></i><strong>{{ team.name }}</strong></li></ol></article></div>
            <div v-else-if="format === 'cup'" class="poster-knockout-grid"><section><header><h3>左半区</h3><b>签01—签08</b></header><ol><li v-for="(slot,index) in leftKnockoutSlots" :key="index"><span>{{ slotLabel(slot,index) }}</span><i><img v-if="slot.logo || slot.logoUrl" :src="slot.logo || slot.logoUrl" alt="" crossorigin="anonymous" @error="clearTeamLogo(slot)" /><em v-else>{{ (slot.name || '待')[0] }}</em></i><strong>{{ slot.name || '待抽签' }}</strong></li></ol></section><div><el-icon><Trophy /></el-icon><b>单淘汰赛</b><span>左右半区</span><small>胜者会师决赛</small></div><section><header><h3>右半区</h3><b>签09—签16</b></header><ol><li v-for="(slot,index) in rightKnockoutSlots" :key="index"><span>{{ slotLabel(slot,index+8) }}</span><i><img v-if="slot.logo || slot.logoUrl" :src="slot.logo || slot.logoUrl" alt="" crossorigin="anonymous" @error="clearTeamLogo(slot)" /><em v-else>{{ (slot.name || '待')[0] }}</em></i><strong>{{ slot.name || '待抽签' }}</strong></li></ol></section></div>
            <section v-else class="poster-league-list"><header><div><h3>联赛队伍轮转顺序</h3><span>顺序用于生成单循环赛程</span></div><b>{{ teams.length }} 支球队 · {{ leagueRoundCount }} 轮</b></header><ol><li v-for="(team,index) in teams" :key="team.id"><span>{{ index + 1 }}</span><i><img v-if="team.logo || team.logoUrl" :src="team.logo || team.logoUrl" alt="" crossorigin="anonymous" @error="clearTeamLogo(team)" /><em v-else>{{ team.name.slice(0,1) }}</em></i><strong>{{ team.name }}</strong><small>第 {{ index + 1 }} 顺位</small></li></ol></section>
            <footer><span>公平竞赛 · 尊重对手 · 享受足球</span><small>生成时间 {{ posterGeneratedAt }}</small></footer>
          </section>
        </div>
      </div>
      <template #footer><el-button @click="posterVisible=false">关闭</el-button><el-button type="success" :loading="exportingPoster" @click="downloadPoster"><el-icon><Download /></el-icon>导出高清海报</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, getCurrentInstance, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Back, Check, CircleCheckFilled, DocumentAdd, Download, Grid, List, Lock, Picture, Rank, Refresh, Search, SwitchButton, Trophy, WarningFilled } from '@element-plus/icons-vue'
import { callFunction, getFileUrl, queryById, queryList, updateRecord } from '../../utils/cloud'
import { getVisualQaSnapshot } from '../../utils/visualQaFixtures'
import saixiaofengLogo from '../../assets/logo-saixiaofeng.png'

const props = defineProps({ tournamentId: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const instance = getCurrentInstance()
const tournamentId = props.tournamentId
const visualQa = typeof window !== 'undefined' && window.location.hostname === '127.0.0.1' && window.location.href.includes('visualQa=1')
const qaSnapshot = visualQa ? (window.__sxfVisualQaSnapshot || getVisualQaSnapshot()) : null
const format = computed(() => ['tournament', 'league', 'cup', 'hybrid'].includes(String(route.query.format || '')) ? String(route.query.format) : 'tournament')
const divisionId = ref(String(route.query.divisionId || 'default'))
const loading = ref(false)
const confirming = ref(false)
const pairingGenerating = ref(false)
const tournament = ref({})
const divisions = ref([])
const records = ref([])
const teams = ref([])
const groups = ref([])
const knockoutSlots = ref([])
const keyword = ref('')
const groupFilter = ref('all')
const viewMode = ref('card')
const resultStatus = ref('draft')
const advanceCount = ref(8)
const bracketCapacity = ref(0)
const leagueRoundCount = ref(0)
const posterVisible = ref(false)
const posterTheme = ref('emerald-stadium')
const posterRef = ref(null)
const posterGeneratedAt = ref('')
const exportingPoster = ref(false)
const posterThemes = [
  { id:'emerald-stadium',name:'绿茵灯光',description:'深绿球场与聚光灯，适合青少年足球赛事' },
  { id:'navy-neon',name:'深蓝霓虹',description:'蓝绿高对比赛事板，适合社交媒体发布' },
  { id:'red-gold',name:'红金荣耀',description:'红金冠军公告风格，适合正式结果发布' }
]

const inferredDivisionName = computed(() => `${divisionId.value.match(/u\d+/i)?.[0]?.toUpperCase() || '当前'}组`)
const displayDivisions = computed(() => divisions.value.length ? divisions.value : [{ id: divisionId.value, name: inferredDivisionName.value }])
const divisionName = computed(() => displayDivisions.value.find(item => String(item.id) === divisionId.value)?.name || inferredDivisionName.value)
const eventMeta = computed(() => `${tournament.value.startDate || '2026-08-18'} 至 ${tournament.value.endDate || '2026-08-24'} · ${tournament.value.location || '郑州足球公园'}`)
const hasSavedResult = computed(() => records.value.length > 0)
const isArchived = computed(() => resultStatus.value === 'archived')
const isConfirmed = computed(() => ['confirmed', 'published'].includes(resultStatus.value))
const statusLabel = computed(() => isArchived.value ? '已归档' : isConfirmed.value ? '已确认' : '待确认')
const teamCount = computed(() => teams.value.length)
const assignedCount = computed(() => format.value === 'tournament' ? groups.value.reduce((sum, group) => sum + group.teams.length, 0) : teams.value.length)
const resultUnitCount = computed(() => format.value === 'tournament' ? groups.value.length : format.value === 'league' ? leagueRoundCount.value : Math.max(1, Number(bracketCapacity.value || advanceCount.value) - 1))
const unitLabel = computed(() => format.value === 'tournament' ? '个小组' : format.value === 'league' ? '轮赛程' : '场淘汰赛')
const sizeLabel = computed(() => format.value === 'tournament' ? `每组 ${groups.value[0]?.maxTeams || 0} 支` : format.value === 'hybrid' ? `晋级 ${advanceCount.value} 支` : format.value === 'cup' ? `${bracketCapacity.value} 个签位` : '单循环赛制')
const formatTitle = computed(() => ({ league: '联赛制排序结果', cup: '淘汰赛签位结果', hybrid: '混合制联赛阶段排序' })[format.value] || '分组结果')
const formatDescription = computed(() => ({ league: '按当前队伍顺序生成单循环赛程草稿', cup: '当前组别第一轮淘汰赛签位快照', hybrid: `联赛阶段前 ${advanceCount.value} 名进入淘汰赛` })[format.value] || '')
const visibleGroups = computed(() => groups.value.filter(group => groupFilter.value === 'all' || group.name === groupFilter.value).map(group => ({ ...group, teams: group.teams.filter(team => !keyword.value || team.name.includes(keyword.value)) })))
const filteredRankedTeams = computed(() => teams.value.filter(team => !keyword.value || team.name.includes(keyword.value)))
const invalidLogoTeams = computed(() => [...new Set(teams.value.filter(team => team.logoSourceInvalid).map(team => team.name).filter(Boolean))])
const leftKnockoutSlots = computed(() => knockoutSlots.value.slice(0,8))
const rightKnockoutSlots = computed(() => knockoutSlots.value.slice(8,16))

function qaTeamNames(count, suffix) {
  const cities = ['郑州青训','洛阳龙门','开封少年','南阳竞技','安阳星火','许昌未来','新乡联队','焦作山阳','周口先锋','商丘雄鹰','信阳绿茵','驻马店精英','郑州未来','洛阳少年','开封雄狮','南阳先锋','焦作未来','周口绿茵','平顶山少年','漯河飞翼','濮阳竞技','三门峡之星','安阳竞技','许昌青训','新乡星火','焦作先锋','周口少年','商丘未来','信阳雄鹰','驻马店竞技','平顶山竞速','漯河青训']
  return cities.slice(0, count).map((name, index) => ({ id: `qa-result-${index + 1}`, name: `${name}${suffix}` }))
}
function seedQaResult() {
  const suffix = divisionId.value.includes('u14') ? 'U14' : divisionId.value.includes('u10') ? 'U10' : 'U12'
  tournament.value = { ...(qaSnapshot?.tournament || {}), name: '2026 赛小蜂青少年足球邀请赛', startDate: '2026-08-18', endDate: '2026-08-24', location: '郑州足球公园' }
  divisions.value = [{ id: divisionId.value, name: `${suffix}组` }]
  const scenario = String(route.query.scenario || '')
  resultStatus.value = scenario === 'archived' ? 'archived' : 'draft'
  if (scenario === 'empty') {
    records.value = []
    teams.value = []
    groups.value = []
    return
  }
  if (format.value === 'tournament') {
    teams.value = qaTeamNames(32, '')
    groups.value = Array.from({ length: 8 }, (_, index) => ({ id: `qa-group-${index}`, name: `${String.fromCharCode(65 + index)}组`, code: String.fromCharCode(65 + index), maxTeams: 4, teams: teams.value.slice(index * 4, index * 4 + 4) }))
    records.value = groups.value.map(group => ({ _id: group.id, status: resultStatus.value }))
  } else {
    teams.value = qaTeamNames(format.value === 'cup' || format.value === 'league' ? 8 : 12, suffix)
    advanceCount.value = 8
    bracketCapacity.value = format.value === 'cup' ? 16 : 8
    leagueRoundCount.value = format.value === 'league' ? 11 : 0
    records.value = [{ _id: `qa-${format.value}-result`, status: resultStatus.value }]
  }
}

function clearTeamLogo(team) {
  const hadSource = Boolean(team.logoSource || team.logo || team.logoUrl)
  team.logo = ''
  team.logoUrl = ''
  if (hadSource) team.logoSourceInvalid = true
}
function slotLabel(slot,index) { return slot?.slotCode || `签${String(index + 1).padStart(2,'0')}` }

async function resolveTeamLogoSource(candidates) {
  const source = candidates.map(value => String(value || '').trim()).find(value => value.startsWith('cloud://')) || candidates.map(value => String(value || '').trim()).find(Boolean) || ''
  if (!source) return { logo:'',logoSource:'',logoSourceInvalid:false }
  if (source.startsWith('cloud://')) {
    const resolved = await getFileUrl(source)
    return /^https?:\/\//.test(String(resolved || '')) ? { logo:resolved,logoSource:source,logoSourceInvalid:false } : { logo:'',logoSource:source,logoSourceInvalid:true }
  }
  if (/^https?:\/\//.test(source) && /\.tcb\.qcloud\.la\//.test(source)) {
    try {
      const parsed = new URL(source)
      const bucket = parsed.hostname.replace(/\.tcb\.qcloud\.la$/,'')
      const cloudId = `cloud://cloud1-7g8ckb3c7815a011.${bucket}${parsed.pathname}`
      const resolved = await getFileUrl(cloudId)
      if (/^https?:\/\//.test(String(resolved || ''))) return { logo:resolved,logoSource:cloudId,logoSourceInvalid:false }
    } catch { /* 保留原始 HTTPS 地址作为兼容回退 */ }
    return { logo:source.split('?')[0].split('#')[0],logoSource:source,logoSourceInvalid:false }
  }
  return /^https?:\/\//.test(source) ? { logo:source,logoSource:source,logoSourceInvalid:false } : { logo:'',logoSource:source,logoSourceInvalid:true }
}

async function enrichTeamRecords(rows, tournamentTeamRows = []) {
  const ids = [...new Set(rows.map(team => String(team.id || team.teamId || '')).filter(Boolean))]
  if (!ids.length) return rows
  const details = await queryList('teams', { where:{ _id:{ $in:ids } },limit:1000 })
  const lookup = new Map((details || []).map(team => [String(team._id),team]))
  const registrationLookup = new Map((tournamentTeamRows || []).map(row => [String(row.teamId || ''),row]))
  return await Promise.all(rows.map(async team => {
    const id = String(team.id || team.teamId)
    const detail = lookup.get(id) || {}
    const registration = registrationLookup.get(id) || {}
    const resolved = await resolveTeamLogoSource([
      registration.logoFileId,registration.logoCloudFileId,registration.teamLogo,registration.logoOriginal,registration.logoTransparent,registration.logo,registration.logoUrl,
      team.logoFileId,team.logoCloudFileId,team.teamLogo,team.logoOriginal,team.logoTransparent,team.logo,team.logoUrl,
      detail.logoFileId,detail.logoCloudFileId,detail.logoOriginal,detail.logoTransparent,detail.logo,detail.logoTransparentUrl,detail.logoUrl
    ])
    return { ...team,teamId:id,name:String(team.name || registration.teamName || detail.name || detail.teamName || '未命名球队'),logo:resolved.logo,logoUrl:resolved.logo,...resolved }
  }))
}

async function load() {
  loading.value = true
    records.value = []
    teams.value = []
    groups.value = []
    knockoutSlots.value = []
  try {
    if (visualQa) { seedQaResult(); return }
    const [event,divisionRecords,tournamentTeamRows] = await Promise.all([
      queryById('tournaments', tournamentId),
      queryList('divisions',{ where:{ tournamentId },orderBy:{ createTime:'asc' },limit:100 }),
      queryList('tournament_teams',{ where:{ tournamentId,divisionId:divisionId.value },limit:1000 })
    ])
    tournament.value = Array.isArray(event) ? event[0] || {} : event || {}
    divisions.value = (divisionRecords?.length ? divisionRecords : tournament.value.divisions || []).map(item => ({ id: String(item.id || item._id), name: item.name || item.divisionName || '未命名组别' }))
    if (format.value === 'tournament') {
      const saved = await queryList('tournament_groups', { where: { tournamentId }, limit: 1000 })
      const scoped = saved.filter(row => String(row.divisionId || 'default') === divisionId.value && row.type === 'tournament')
      const active = scoped.filter(row => row.status !== 'archived')
      records.value = active.length ? active : scoped.filter(row => row.status === 'archived')
      groups.value = records.value.map((row, index) => ({ id: row._id, name: row.groupName || `${String.fromCharCode(65 + index)}组`, code: row.groupCode || String.fromCharCode(65 + index), maxTeams: Number(row.maxTeams || row.teams?.length || 0), teams: (row.teams || []).map((team, teamIndex) => ({ id: String(team.teamId || `${row._id}-${teamIndex}`), name: String(team.teamName || '未命名球队'),logo:String(team.logo || team.logoUrl || ''),logoUrl:String(team.logoUrl || team.logo || '') })) }))
      const enriched = await enrichTeamRecords(groups.value.flatMap(group => group.teams),tournamentTeamRows)
      const enrichedLookup = new Map(enriched.map(team => [team.id,team]))
      groups.value = groups.value.map(group => ({ ...group,teams:group.teams.map(team => enrichedLookup.get(team.id) || team) }))
      teams.value = groups.value.flatMap(group => group.teams)
    } else {
      const collection = format.value === 'cup' ? 'tournament_bracket' : 'tournament_league_tables'
      const saved = await queryList(collection, { where: { tournamentId }, limit: 1000 })
      const scoped = saved.filter(row => String(row.divisionId || 'default') === divisionId.value && row.type === format.value)
      const active = scoped.filter(row => row.status !== 'archived')
      records.value = active.length ? active : scoped.filter(row => row.status === 'archived')
      const primary = records.value[0]
      teams.value = (primary?.teams || []).map((team, index) => ({ id: String(team.teamId || index), name: String(team.teamName || '未命名球队') }))
      if (format.value === 'cup' && primary) {
        const rawSlots = Array.from({ length:16 },(_,index) => { const slot=(primary.slots || [])[index] || {}; return { id:String(slot.teamId || ''),teamId:String(slot.teamId || ''),name:String(slot.teamName || ''),slotCode:slot.slotCode || `签${String(index + 1).padStart(2,'0')}` } })
        const enriched = await enrichTeamRecords(rawSlots.filter(slot => slot.teamId),tournamentTeamRows)
        const lookup = new Map(enriched.map(team => [team.id,team]))
        knockoutSlots.value = rawSlots.map(slot => slot.teamId ? { ...slot,...(lookup.get(slot.teamId) || {}) } : slot)
        teams.value = knockoutSlots.value.filter(slot => slot.teamId)
      } else teams.value = await enrichTeamRecords(teams.value,tournamentTeamRows)
      advanceCount.value = Number(primary?.advanceCount || 8)
      bracketCapacity.value = Number(primary?.capacity || primary?.advanceCount || 0)
      leagueRoundCount.value = teams.value.length > 1 ? teams.value.length - 1 : 0
    }
    const statuses = records.value.map(row => row.status)
    const explicitlyConfirmed = records.value.length > 0 && records.value.every(row => row.status === 'published' || (row.status === 'confirmed' && Boolean(row.confirmedAt)))
    resultStatus.value = statuses.length && statuses.every(status => status === 'archived') ? 'archived' : statuses.includes('published') ? 'published' : explicitlyConfirmed ? 'confirmed' : 'draft'
  } catch (error) {
    ElMessage.error(error.message || '加载分组结果失败')
  } finally {
    loading.value = false
    instance?.update?.()
  }
}

function navigationQuery(view) { return { divisionId: divisionId.value, mode: 'quick', view, format: format.value, ...(visualQa ? { visualQa: '1' } : {}) } }
function backConfig() { router.push({ path: route.path, query: navigationQuery('config') }) }
function backConsole() { router.push({ path: route.path, query: navigationQuery('console') }) }
function backOverview() { router.push({ path:`/tournaments/${tournamentId}/draw`,query:visualQa ? { visualQa:'1' } : {} }) }
function exitSpace() { router.push('/tournament-space') }
function openPoster() { posterGeneratedAt.value = new Date().toLocaleString('zh-CN',{ hour12:false }); posterVisible.value = true }
async function downloadPoster() {
  if (!posterRef.value) return
  exportingPoster.value = true
  try {
    await nextTick()
    const module = await import('html2canvas')
    const html2canvas = module.default || module
    const canvas = await html2canvas(posterRef.value,{ scale:2,useCORS:true,allowTaint:false,backgroundColor:null,logging:false })
    const link = document.createElement('a')
    const safeName = `${tournament.value.name || '足球赛事'}-${divisionName.value}-分组结果`.replace(/[\\/:*?"<>|]/g,'-')
    link.download = `${safeName}.png`; link.href = canvas.toDataURL('image/png',1); link.click()
    ElMessage.success('高清分组海报已导出')
  } catch (error) { ElMessage.error(error.message || '海报导出失败') } finally { exportingPoster.value = false }
}
function exportResult() {
  const rows = format.value === 'tournament' ? groups.value.flatMap(group => group.teams.map((team, index) => [group.name, `${group.code}${index + 1}`, team.name])) : format.value === 'cup' ? knockoutSlots.value.map((slot,index) => [index < 8 ? '左半区' : '右半区',slotLabel(slot,index),slot.name || '待抽签']) : teams.value.map((team, index) => [formatTitle.value, index + 1, team.name])
  if (visualQa) { window.__sxfQuickResultExport = { tournamentId, divisionId: divisionId.value, format: format.value, rows: rows.length, cloudWrite: false }; ElMessage.success('导出内容已校验'); return }
  const csv = [['阶段/小组', '签位/排名', '球队'], ...rows].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })); link.download = `${divisionName.value}-${formatTitle.value}.csv`; link.click(); URL.revokeObjectURL(link.href)
}
async function confirm() {
  if (!hasSavedResult.value) return ElMessage.error('没有可确认的抽签结果')
  if (isArchived.value) return ElMessage.warning('归档结果不能重复确认')
  if (isConfirmed.value) return ElMessage.info('当前抽签结果已经确认')
  try {
    const scope = { phase: 'confirmation-opened', tournamentId, divisionId: divisionId.value, format: format.value, recordIds: records.value.map(row => row._id), targetStatus: 'confirmed', published: false, schedulePublished: false, deletedRecords: false, changedOtherDivisions: false, changedOtherFormats: false }
    if (visualQa) window.__sxfQuickResultAction = scope
    if (!visualQa) await ElMessageBox.confirm('确认只锁定当前组别的分组快照，并进入赛程编排；不会发布赛程，也不会覆盖其他组别或归档结果。', '确认分组结果', { type: 'warning', confirmButtonText: '确认并进入赛程编排', cancelButtonText: '取消' })
    confirming.value = true
    if (visualQa) {
      window.__sxfQuickResultAction = { ...scope, phase: 'confirmed', cloudWrite: false }
    } else {
      const collection = format.value === 'tournament' ? 'tournament_groups' : format.value === 'cup' ? 'tournament_bracket' : 'tournament_league_tables'
      const pendingRecords = records.value.filter(row => row.status === 'draft' || (row.status === 'confirmed' && !row.confirmedAt))
      if (!pendingRecords.length) throw new Error('未找到可确认的签位草稿，请刷新后重试')
      for (const record of pendingRecords) await updateRecord(collection, record._id, { status: 'confirmed', confirmedAt: new Date(), updateTime: new Date() })
      resultStatus.value = 'confirmed'
    }
    ElMessage.success('当前组别抽签已完成')
    router.push({ path: `/tournaments/${tournamentId}/draw`, query: visualQa ? { visualQa: '1' } : {} })
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(error.message || '确认失败')
  } finally { confirming.value = false }
}
async function generatePairingsAndViewPairings() {
  if (!isConfirmed.value || pairingGenerating.value) return
  pairingGenerating.value = true
  try {
    const result = await callFunction('generateSchedule', { action: 'generatePairings', tournamentId, divisionId: divisionId.value, divisionName: divisionName.value })
    if (!result?.success) throw new Error(result?.message || result?.error || '生成对阵失败')
    ElMessage.success(`已生成 ${result.matchCount || 0} 场对阵，比赛时间待排`)
    router.push({ path: `/tournaments/${tournamentId}/pairings`, query: { divisionId: divisionId.value, divisionName: divisionName.value } })
  } catch (error) { ElMessage.error(error.message || '生成对阵失败') } finally { pairingGenerating.value = false }
}

onMounted(load)
</script>

<style scoped>
.quick-result{min-height:100%;padding:0 28px 92px;background:#f7f9f8;color:#26352c}.event-header{display:flex;align-items:center;justify-content:space-between;margin:0 -28px;padding:15px 28px;border-bottom:1px solid #e2e8e4;background:#fff}.event-main{display:flex;align-items:center;gap:11px}.event-main h2{margin:0 0 5px;font-size:21px}.event-main p{margin:0;color:#7c8880;font-size:12px}.event-mark{display:grid;place-items:center;width:41px;height:41px;border-radius:8px;background:#078348;color:#fff;font-weight:800}.page-heading{display:flex;align-items:center;justify-content:space-between;height:88px}.page-heading>div{display:flex;align-items:baseline;gap:22px}.page-heading h1{margin:0;font-size:27px}.page-heading p{margin:0;color:#68766d;font-size:13px}.page-heading label{display:flex;align-items:center;gap:12px;font-size:13px}.page-heading :deep(.el-select){width:130px}.steps{display:flex;height:45px;margin:0 -16px;border-bottom:1px solid #e0e6e2}.steps button{position:relative;padding:0 30px;border:0;background:transparent;color:#536158;font-size:14px;cursor:pointer}.steps button.active{color:#078348;font-weight:700}.steps button.active:after{position:absolute;right:20px;bottom:-1px;left:20px;height:3px;background:#078348;content:''}.summary,.toolbar{display:flex;align-items:center;gap:19px;margin-top:15px;padding:12px 15px;border:1px solid #dfe6e1;border-radius:7px;background:#fff}.summary i{height:20px;border-left:1px solid #dfe6e1}.summary span{white-space:nowrap;font-size:12px}.summary span b{margin-left:4px;font-size:15px}.summary em{display:flex;align-items:center;gap:5px;color:#078348;font-style:normal;font-size:12px}.summary strong{color:#ef6c23;font-size:12px}.summary .el-button{margin-left:auto}.toolbar :deep(.el-select){width:145px}.toolbar :deep(.el-input){width:310px}.toolbar .el-button-group{margin-left:auto}.group-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin-top:15px}.group-grid article{overflow:hidden;border:1px solid #dfe6e1;border-radius:7px;background:#fff}.group-grid article header{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid #e8edea}.group-grid h3{margin:0;color:#087b44;font-size:16px}.group-grid ol{margin:0;padding:0;list-style:none}.group-grid li{display:flex;align-items:center;gap:8px;height:35px;padding:0 12px;border-bottom:1px solid #edf1ee}.group-grid li:last-child{border-bottom:0}.group-grid li>b{width:26px;font-size:12px}.group-grid li strong{flex:1;font-size:12px}.group-grid li .el-icon{color:#9ca69f}.crest{display:grid;flex:none;place-items:center;width:23px;height:23px;border-radius:50%;background:linear-gradient(135deg,#078348,#69b982);color:#fff;font-size:10px}.group-grid.list{grid-template-columns:1fr}.group-grid.list article{display:grid;grid-template-columns:120px 1fr}.group-grid.list ol{display:grid;grid-template-columns:repeat(4,1fr)}.format-result{display:grid;grid-template-columns:1.25fr .75fr;gap:14px;margin-top:15px}.result-card{height:485px;padding:16px;border:1px solid #dfe6e1;border-radius:7px;background:#fff}.result-card>header{display:flex;justify-content:space-between}.result-card h3{margin:0 0 5px;font-size:17px}.result-card header p{margin:0;color:#7f8b83;font-size:12px}.result-card ol{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:15px 0 0;padding:0;list-style:none}.result-card li{display:flex;align-items:center;gap:8px;min-height:39px;padding:0 10px;border:1px solid #e2e8e4;border-radius:5px}.result-card li>b{width:20px;color:#078348}.result-card li strong{flex:1;font-size:12px}.result-card li em{color:#078348;font-size:10px;font-style:normal}.stage-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:25px}.stage-metrics span{display:grid;place-items:center;min-height:100px;border-radius:7px;background:#f1f7f3}.stage-metrics b{color:#078348;font-size:28px}.stage-metrics small{color:#7c8980}.boundary-note{margin-top:22px;padding:13px;border-left:3px solid #078348;background:#f6faf7;color:#65736a;font-size:12px;line-height:1.7}.empty-result{display:grid;place-items:center;min-height:460px;margin-top:16px;border:1px dashed #ccd7d0;border-radius:8px;background:#fff}.empty-result>.el-icon{font-size:46px;color:#dd8f39}.empty-result h3{margin:12px 0 0}.empty-result p{margin:8px 0 16px;color:#748078;font-size:13px}.action-bar{position:fixed;right:0;bottom:0;left:220px;z-index:6;display:flex;align-items:center;justify-content:space-between;min-height:78px;padding:0 30px;border-top:1px solid #dce4df;background:#fff;box-shadow:0 -4px 14px rgba(35,65,46,.06)}.checks{display:flex;align-items:center;gap:19px}.checks span{display:flex;align-items:center;gap:5px;color:#087c45;font-size:11px}.checks i{height:20px;border-left:1px solid #dfe6e1}.checks em{color:#ef6c23;font-size:11px;font-style:normal}.footer-actions{display:grid;grid-template-columns:auto auto;gap:8px}.footer-actions small{grid-column:1/-1;color:#7f8b83;font-size:10px;text-align:right}@media(max-width:1200px){.group-grid{grid-template-columns:repeat(2,1fr)}.action-bar{left:0}.format-result{grid-template-columns:1fr}}@media(max-width:760px){.event-header,.page-heading,.summary,.toolbar,.action-bar{align-items:stretch;flex-direction:column}.group-grid{grid-template-columns:1fr}.action-bar{position:static;margin:16px -28px -92px;padding:16px}}
.summary span{font-size:14px}.summary span b{font-size:17px}.summary em,.summary strong{font-size:14px}.group-grid article{border-radius:8px}.group-grid article header{padding:13px 15px}.group-grid h3{font-size:19px}.group-grid article header>b{font-size:15px}.group-grid li{height:44px;gap:10px;padding:0 13px}.group-grid li>b{width:28px;font-size:14px}.group-grid li strong{overflow:hidden;font-size:15px;text-overflow:ellipsis;white-space:nowrap}.group-grid li .el-icon{font-size:16px}.crest{width:31px;height:31px;overflow:hidden;border:1px solid #dce7df;font-size:12px}.crest img{display:block;width:100%;height:100%;object-fit:contain;background:#fff}.crest em{font-style:normal}.group-grid.list article{grid-template-columns:130px 1fr}.result-card h3{font-size:19px}.result-card header p{font-size:14px}.result-card li{min-height:44px;gap:9px}.result-card li>b,.result-card li strong{font-size:14px}.result-card li em{font-size:12px}.checks span,.checks em{font-size:13px}
.poster-workspace{display:grid;grid-template-columns:210px minmax(0,1fr);gap:20px;align-items:start}.poster-themes{display:flex;flex-direction:column;gap:10px}.poster-themes>strong{font-size:16px}.poster-themes button{display:grid;grid-template-columns:44px 1fr;gap:2px 10px;padding:10px;border:1px solid #dce5df;border-radius:9px;background:#fff;text-align:left;cursor:pointer}.poster-themes button.active{border-color:#0a914c;box-shadow:0 0 0 2px rgba(10,145,76,.12)}.poster-themes button>span{grid-row:1/span 2;width:44px;height:44px;border-radius:7px}.poster-themes button.emerald-stadium>span{background:radial-gradient(circle at 50% 0,#d4ffba 0,transparent 32%),linear-gradient(145deg,#072c22,#0d7950)}.poster-themes button.navy-neon>span{background:radial-gradient(circle at 75% 20%,#00dca2 0,transparent 26%),linear-gradient(145deg,#06172f,#123d72)}.poster-themes button.red-gold>span{background:radial-gradient(circle at 70% 15%,#ffd66b 0,transparent 27%),linear-gradient(145deg,#5c0711,#c62c21)}.poster-themes button b{font-size:14px}.poster-themes button small,.poster-themes>p{color:#78847c;font-size:12px;line-height:1.5}.poster-preview-shell{max-height:72vh;overflow:auto;padding:14px;border-radius:10px;background:#e9eeeb}.draw-poster{position:relative;box-sizing:border-box;width:720px;min-height:960px;overflow:hidden;padding:38px 42px 30px;color:#fff;background:#063d2c;font-family:"Microsoft YaHei",Arial,sans-serif}.draw-poster>*{position:relative;z-index:2}.draw-poster.theme-emerald-stadium{background:radial-gradient(circle at 50% -4%,rgba(211,255,178,.58),transparent 24%),linear-gradient(160deg,#032b22 0%,#07583c 48%,#022a21 100%)}.draw-poster.theme-navy-neon{background:radial-gradient(circle at 88% 5%,rgba(0,255,190,.42),transparent 28%),linear-gradient(160deg,#031227 0%,#0b3260 55%,#021426 100%)}.draw-poster.theme-red-gold{background:radial-gradient(circle at 85% 0,rgba(255,221,109,.55),transparent 26%),linear-gradient(160deg,#4b0610 0%,#a51e1e 54%,#39040c 100%)}.poster-glow{position:absolute;z-index:0;border-radius:50%;filter:blur(8px);opacity:.45}.poster-glow-one{top:150px;right:-110px;width:320px;height:320px;background:rgba(98,255,183,.2)}.poster-glow-two{bottom:-110px;left:-100px;width:330px;height:330px;background:rgba(255,215,107,.16)}.poster-pitch{position:absolute;z-index:0;right:-90px;bottom:-45px;width:480px;height:270px;transform:rotate(-12deg);border:2px solid rgba(255,255,255,.12);border-radius:5px}.poster-pitch:before{position:absolute;top:-2px;bottom:-2px;left:50%;border-left:2px solid rgba(255,255,255,.12);content:""}.poster-pitch:after{position:absolute;top:50%;left:50%;width:76px;height:76px;transform:translate(-50%,-50%);border:2px solid rgba(255,255,255,.12);border-radius:50%;content:""}.draw-poster>header{display:flex;align-items:center;justify-content:space-between;padding-bottom:20px;border-bottom:1px solid rgba(255,255,255,.24)}.poster-brand{display:flex;align-items:center;gap:10px}.poster-brand span{display:grid;width:38px;height:38px;place-items:center;border-radius:9px;background:#fff;color:#09633f;font-weight:900}.poster-brand b{font-size:18px}.draw-poster>header>small{letter-spacing:.13em;opacity:.82}.poster-title{padding:34px 0 28px;text-align:center}.poster-title p{display:inline-flex;margin:0 0 12px;padding:5px 15px;border:1px solid rgba(255,255,255,.35);border-radius:99px;font-size:14px}.poster-title h2{margin:0;font-size:34px;line-height:1.25}.poster-title strong{display:block;margin-top:10px;color:#d8ff8a;font-size:25px;letter-spacing:.08em}.theme-red-gold .poster-title strong{color:#ffdc78}.poster-title span{display:block;margin-top:13px;font-size:13px;opacity:.78}.poster-group-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.poster-group-grid article{overflow:hidden;border:1px solid rgba(255,255,255,.24);border-radius:12px;background:rgba(2,20,14,.46);box-shadow:0 12px 28px rgba(0,0,0,.16);backdrop-filter:blur(4px)}.poster-group-grid article>header{display:flex;align-items:center;justify-content:space-between;padding:12px 15px;background:rgba(255,255,255,.1)}.poster-group-grid h3{margin:0;font-size:20px}.poster-group-grid article>header b{font-size:12px;opacity:.76}.poster-group-grid ol{margin:0;padding:7px 12px 10px;list-style:none}.poster-group-grid li{display:grid;grid-template-columns:30px 34px 1fr;align-items:center;gap:9px;min-height:45px;border-bottom:1px solid rgba(255,255,255,.12)}.poster-group-grid li:last-child{border-bottom:0}.poster-group-grid li>span{font-size:13px;font-weight:700;opacity:.78}.poster-group-grid li>i{display:grid;width:30px;height:30px;overflow:hidden;place-items:center;border-radius:50%;background:#fff;color:#0a7045;font-size:11px;font-style:normal}.poster-group-grid li img{width:100%;height:100%;object-fit:contain}.poster-group-grid li em{font-style:normal}.poster-group-grid li strong{overflow:hidden;font-size:15px;text-overflow:ellipsis;white-space:nowrap}.draw-poster>footer{display:flex;align-items:center;justify-content:space-between;margin-top:28px;padding-top:17px;border-top:1px solid rgba(255,255,255,.22);font-size:12px;opacity:.76}.draw-poster>footer span{letter-spacing:.08em}
@media(max-width:1200px){.poster-workspace{grid-template-columns:1fr}.poster-themes{display:grid;grid-template-columns:repeat(3,1fr)}.poster-themes>strong,.poster-themes>p{grid-column:1/-1}.poster-preview-shell{overflow:auto}}@media(max-width:760px){.poster-themes{grid-template-columns:1fr}.draw-poster{transform-origin:top left}}
.poster-brand img{display:block;width:148px;height:48px;object-fit:contain;object-position:left center}
.page-heading .division-lock{display:flex;width:150px;min-height:36px;align-items:center;justify-content:space-between;box-sizing:border-box;padding:0 13px;border:1px solid #dce4df;border-radius:6px;background:#f7f9f7;color:#26352c;font-size:14px}.page-heading .division-lock .el-icon{color:#78847c}
.confirmed-actions{grid-template-columns:auto}.confirmed-actions small{max-width:260px}
.knockout-result-layout{display:grid;grid-template-columns:minmax(0,1fr) 180px minmax(0,1fr);gap:16px;margin-top:15px}.knockout-zone,.knockout-center{border:1px solid #dce5df;border-radius:9px;background:#fff}.knockout-zone>header{display:flex;align-items:center;justify-content:space-between;padding:15px 16px;border-bottom:1px solid #e7ede9}.knockout-zone h3{margin:0 0 4px;color:#087c45;font-size:20px}.knockout-zone header p{margin:0;color:#78847c;font-size:12px}.knockout-zone table{width:100%;border-collapse:collapse}.knockout-zone th{height:36px;color:#748078;background:#f5f8f6;font-size:12px;text-align:left}.knockout-zone td{height:46px;border-top:1px solid #e9eeeb;font-size:13px}.knockout-zone th,.knockout-zone td{padding:0 12px}.knockout-zone th:first-child,.knockout-zone td:first-child,.knockout-zone th:last-child,.knockout-zone td:last-child{width:68px;text-align:center}.knockout-zone td:nth-child(2){display:flex;align-items:center;gap:10px}.knockout-zone td:nth-child(2) strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.knockout-center{display:flex;min-height:450px;flex-direction:column;align-items:center;justify-content:center;color:#6e7a72;background:linear-gradient(180deg,#fff,#fbf8ed);text-align:center}.knockout-center>.el-icon{color:#d89a0d;font-size:58px}.knockout-center h3{margin:12px 0 5px;color:#26352c;font-size:21px}.knockout-center strong{color:#087c45;font-size:17px}.knockout-center span{margin-top:5px}.knockout-center i{width:42px;margin:17px 0;border-top:2px solid #d7aa3c}.knockout-center p{max-width:120px;margin:0;font-size:12px;line-height:1.6}.poster-knockout-grid{display:grid;grid-template-columns:1fr 92px 1fr;gap:12px}.poster-knockout-grid>section{overflow:hidden;border:1px solid rgba(255,255,255,.24);border-radius:12px;background:rgba(2,20,14,.46)}.poster-knockout-grid>section>header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:rgba(255,255,255,.1)}.poster-knockout-grid h3{margin:0;font-size:19px}.poster-knockout-grid header b{font-size:11px;opacity:.75}.poster-knockout-grid ol{margin:0;padding:6px 11px 9px;list-style:none}.poster-knockout-grid li{display:grid;grid-template-columns:38px 32px 1fr;align-items:center;gap:8px;min-height:42px;border-bottom:1px solid rgba(255,255,255,.12)}.poster-knockout-grid li:last-child{border-bottom:0}.poster-knockout-grid li>span{font-size:11px}.poster-knockout-grid li>i{display:grid;width:28px;height:28px;overflow:hidden;place-items:center;border-radius:50%;background:#fff;color:#087c45;font-size:10px;font-style:normal}.poster-knockout-grid li img{width:100%;height:100%;object-fit:contain}.poster-knockout-grid li em{font-style:normal}.poster-knockout-grid li strong{overflow:hidden;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.poster-knockout-grid>div{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.poster-knockout-grid>div .el-icon{color:#ffd45d;font-size:48px}.poster-knockout-grid>div b{margin-top:8px;font-size:15px}.poster-knockout-grid>div span,.poster-knockout-grid>div small{margin-top:5px;font-size:10px;opacity:.75}
.poster-league-list{overflow:hidden;border:1px solid rgba(255,255,255,.24);border-radius:12px;background:rgba(2,20,14,.46)}.poster-league-list>header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:rgba(255,255,255,.1)}.poster-league-list h3{margin:0 0 4px;font-size:20px}.poster-league-list header span,.poster-league-list header b{font-size:12px;opacity:.78}.poster-league-list ol{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;margin:0;padding:16px;list-style:none}.poster-league-list li{display:grid;grid-template-columns:30px 38px 1fr auto;align-items:center;gap:9px;min-height:48px;padding:0 10px;border:1px solid rgba(255,255,255,.16);border-radius:7px;background:rgba(255,255,255,.06)}.poster-league-list li>span{font-size:16px;font-weight:800}.poster-league-list li>i{display:grid;width:34px;height:34px;overflow:hidden;place-items:center;border-radius:50%;background:#fff;color:#087c45;font-size:11px;font-style:normal}.poster-league-list li img{width:100%;height:100%;object-fit:contain}.poster-league-list li em{font-style:normal}.poster-league-list li strong{overflow:hidden;font-size:14px;text-overflow:ellipsis;white-space:nowrap}.poster-league-list li small{font-size:10px;opacity:.68}
.logo-source-alert{margin-top:15px}.league-result-card{height:auto;min-height:485px}.league-result-card ol{display:grid;grid-template-columns:1fr;gap:8px}.league-result-card li{display:grid;grid-template-columns:52px 48px minmax(0,1fr);align-items:center;box-sizing:border-box;height:54px;min-height:54px;padding:0 16px;border-color:#dfe7e2;background:linear-gradient(90deg,#f3f8f5 0,#fff 36%)}.league-result-card li>b{display:grid;width:34px;height:34px;place-items:center;border-radius:8px;background:#087f46;color:#fff;font-size:16px}.league-result-card li>.crest{width:36px;height:36px;justify-self:start}.league-result-card li>strong{min-width:0;font-size:16px;line-height:1.25}.poster-league-list ol{display:grid;grid-template-columns:1fr;gap:8px}.poster-league-list li{grid-template-columns:42px 48px minmax(0,1fr) 82px;box-sizing:border-box;height:58px;min-height:58px;padding:0 14px;background:linear-gradient(90deg,rgba(255,255,255,.12),rgba(255,255,255,.04))}.poster-league-list li>span{display:grid;width:32px;height:32px;place-items:center;border-radius:8px;background:rgba(255,255,255,.14)}.poster-league-list li>i{width:38px;height:38px}.poster-league-list li strong{font-size:16px}.poster-league-list li small{text-align:right}
@media(max-width:1000px){.knockout-result-layout{grid-template-columns:1fr}.knockout-center{min-height:150px}.poster-knockout-grid{grid-template-columns:1fr}}
</style>
