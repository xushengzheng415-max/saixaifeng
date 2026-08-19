<template>
  <section class="quick-console" v-loading="loading">
    <header class="event-header">
      <div class="event-copy">
        <el-button text @click="backConfig">← 返回分组设置</el-button>
        <div class="event-line">
          <span class="event-mark">赛</span>
          <div>
            <h1>{{ tournament.name || '2026 赛小蜂青少年足球邀请赛' }}</h1>
            <p>{{ eventMeta }}</p>
          </div>
        </div>
      </div>
      <label class="division-picker"><span>当前组别</span><el-select v-model="divisionId" @change="load"><el-option v-for="item in divisionOptions" :key="item.id" :label="item.name" :value="item.id" /></el-select></label>
    </header>

    <nav class="steps">
      <button @click="backConfig"><i>1</i><span>分组设置</span></button>
      <button class="active"><i>2</i><span>分组操作台</span></button>
      <button @click="goResult"><i>3</i><span>分组结果</span></button>
    </nav>

    <div class="format-tabs">
      <strong>赛制选择</strong>
      <button @click="goFormat('tournament')">小组赛</button>
      <button :class="{ active: isCup }" @click="goFormat('cup')">淘汰赛</button>
      <button :class="{ active: isLeague }" @click="goFormat('league')">联赛制</button>
      <button :class="{ active: isHybrid }" @click="goFormat('hybrid')">混合制</button>
    </div>

    <main v-if="isLeague" :key="renderVersion" class="league-board">
      <section class="panel pool">
        <header><div><h2>参赛队伍</h2><p>已审核通过 {{ teams.length }} 支</p></div><span>{{ teams.length }}</span></header>
        <el-input v-model="keyword" placeholder="搜索球队名称" clearable>
          <template #prefix>⌕</template>
        </el-input>
        <ol>
          <li v-for="team in filteredTeams" :key="team.id" :class="{ added: orderedTeamIds.has(team.id) }" @click="appendTeam(team)">
            <img v-if="team.logo" :src="team.logo" alt="" />
            <span v-else class="crest">{{ team.name.slice(0, 1) }}</span>
            <b>{{ team.name }}</b>
            <small>{{ orderedTeamIds.has(team.id) ? '已排序' : '+ 加入' }}</small>
          </li>
        </ol>
      </section>

      <section class="panel ranking">
        <header><div><h2>联赛队伍排序</h2><p>拖拽或使用箭头调整轮转顺序</p></div><el-tag type="success" effect="light">联赛组 1</el-tag></header>
        <div class="ranking-tip"><span>i</span> 当前顺序将用于生成单循环赛程草稿，共 {{ leagueRounds.length }} 轮。</div>
        <ol>
          <li v-for="(team, index) in orderedTeams" :key="team.id" draggable="true" @dragstart="dragIndex = index" @dragover.prevent @drop="dropAt(index)">
            <b>{{ index + 1 }}</b>
            <img v-if="team.logo" :src="team.logo" alt="" />
            <span v-else class="crest">{{ team.name.slice(0, 1) }}</span>
            <strong>{{ team.name }}</strong>
            <div class="row-actions">
              <button aria-label="上移" :disabled="index === 0" @click="move(team.id, -1)">↑</button>
              <button aria-label="下移" :disabled="index === orderedTeams.length - 1" @click="move(team.id, 1)">↓</button>
              <span aria-hidden="true">⠿</span>
            </div>
          </li>
          <li v-if="!orderedTeams.length" class="empty-order"><span>尚未安排球队</span><small>从左侧点击球队加入排序</small></li>
        </ol>
      </section>

      <section class="panel preview">
        <header><div><h2>轮次预览</h2><p>按当前排序实时生成对阵</p></div><span>{{ leagueMatchCount }} 场</span></header>
        <div class="round-tabs">
          <button v-for="(_, index) in previewRounds" :key="index" :class="{ active: activeRound === index }" @click="activeRound = index">第 {{ index + 1 }} 轮</button>
        </div>
        <div class="round-list">
          <article v-for="(match, index) in activeMatches.slice(0, 5)" :key="`${activeRound}-${index}`">
            <span class="match-team home"><i class="mini-crest">{{ match.home.name.slice(0, 1) }}</i>{{ match.home.name }}</span>
            <b><small>第 {{ index + 1 }} 场</small>VS</b>
            <span class="match-team"><i class="mini-crest">{{ match.away.name.slice(0, 1) }}</i>{{ match.away.name }}</span>
          </article>
          <p v-if="activeMatches.length > 5" class="more-match">本轮另有 {{ activeMatches.length - 5 }} 场对阵，将一并写入赛程草稿</p>
          <div v-if="!activeMatches.length" class="empty-preview">完成左侧队伍排序后生成轮次预览</div>
        </div>
      </section>
    </main>

    <main v-else-if="isCup" :key="renderVersion" class="cup-board">
      <section class="panel cup-pool">
        <header><div><h2>待排队伍</h2><p>当前组别已审核 {{ teams.length }} 支</p></div><span>{{ cupAssignedCount }}/{{ teams.length }}</span></header>
        <el-input v-model="keyword" placeholder="搜索球队名称" clearable />
        <ol>
          <li v-for="team in filteredTeams" :key="team.id" :class="{ assigned: cupAssignedIds.has(team.id) }" draggable="true" @dragstart="cupDraggingTeam = team" @click="placeCupTeam(team)">
            <img v-if="team.logo" :src="team.logo" alt="" />
            <span v-else class="crest">{{ team.name.slice(0, 1) }}</span>
            <b>{{ team.name }}</b>
            <small>{{ cupAssignedIds.has(team.id) ? '已入签位' : '点击入位' }}</small>
            <el-icon><Rank /></el-icon>
          </li>
        </ol>
        <p class="pool-help">拖拽或点击球队进入空签位；同一球队不能重复。</p>
      </section>

      <section class="panel cup-stage">
        <header><div><h2>淘汰赛签位</h2><p>左右半区 · 16 个第一轮签位 · 胜者逐轮晋级</p></div><el-tag type="success" effect="light">{{ cupAssignedCount }} 支已入位</el-tag></header>
        <div class="bracket-shell">
          <div class="bracket-side left">
            <div v-for="pair in 4" :key="`left-${pair}`" class="seed-pair">
              <button v-for="offset in 2" :key="offset" class="seed-slot" :class="{ filled: cupSlots[(pair - 1) * 2 + offset - 1] }" @dragover.prevent @drop="dropCupTeam((pair - 1) * 2 + offset - 1)" @click="clearCupSlot((pair - 1) * 2 + offset - 1)">
                <b>A{{ (pair - 1) * 2 + offset }}</b>
                <span><template v-if="cupSlots[(pair - 1) * 2 + offset - 1]"><i class="crest">{{ cupSlots[(pair - 1) * 2 + offset - 1].name.slice(0, 1) }}</i>{{ cupSlots[(pair - 1) * 2 + offset - 1].name }}</template><em v-else>拖入球队</em></span>
              </button>
            </div>
          </div>
          <div class="advance-column left-advance"><span v-for="n in 4" :key="n">胜者</span></div>
          <div class="semifinal-column left-semi"><span v-for="n in 2" :key="n">胜者</span></div>
          <div class="final-center"><el-icon><Trophy /></el-icon><strong>决赛</strong><small>冠军待定</small></div>
          <div class="semifinal-column right-semi"><span v-for="n in 2" :key="n">胜者</span></div>
          <div class="advance-column right-advance"><span v-for="n in 4" :key="n">胜者</span></div>
          <div class="bracket-side right">
            <div v-for="pair in 4" :key="`right-${pair}`" class="seed-pair">
              <button v-for="offset in 2" :key="offset" class="seed-slot" :class="{ filled: cupSlots[8 + (pair - 1) * 2 + offset - 1] }" @dragover.prevent @drop="dropCupTeam(8 + (pair - 1) * 2 + offset - 1)" @click="clearCupSlot(8 + (pair - 1) * 2 + offset - 1)">
                <span><template v-if="cupSlots[8 + (pair - 1) * 2 + offset - 1]"><i class="crest">{{ cupSlots[8 + (pair - 1) * 2 + offset - 1].name.slice(0, 1) }}</i>{{ cupSlots[8 + (pair - 1) * 2 + offset - 1].name }}</template><em v-else>拖入球队</em></span>
                <b>B{{ (pair - 1) * 2 + offset }}</b>
              </button>
            </div>
          </div>
        </div>
        <div class="cup-note"><span>i</span>确认后只生成当前组别的淘汰赛对阵草稿；空签位按轮空处理，后续轮次由赛果推进。</div>
      </section>
    </main>

    <main v-else :key="renderVersion" class="hybrid-board">
      <section class="panel hybrid-pool pool">
        <header><div><h2>参赛队伍</h2><p>拖拽队伍可调整联赛阶段排序</p></div><span>{{ teams.length }}</span></header>
        <el-input v-model="keyword" placeholder="搜索球队名称" clearable />
        <ol>
          <li v-for="team in filteredTeams" :key="team.id" draggable="true" @dragstart="hybridDraggingTeam = team" @click="appendTeam(team)">
            <img v-if="team.logo" :src="team.logo" alt="" /><span v-else class="crest">{{ team.name.slice(0, 1) }}</span><b>{{ team.name }}</b><el-icon><Rank /></el-icon>
          </li>
        </ol>
      </section>

      <section class="panel hybrid-ranking">
        <header><div><h2>联赛阶段排序</h2><p>排序决定晋级种子位</p></div><div class="hybrid-badges"><el-tag type="success" effect="light"><el-icon><Trophy /></el-icon> 晋级前 {{ advanceCount }} 名</el-tag><el-tag effect="plain">淘汰赛单淘</el-tag></div></header>
        <div class="advance-control"><span>晋级名额</span><div class="advance-options"><button v-for="count in [2,4,8]" :key="count" :class="{ active: advanceCount === count }" @click="setAdvanceCount(count)">{{ count }} 名</button></div><small>须为 2、4 或 8，且不超过参赛队数</small></div>
        <ol>
          <li v-for="(team,index) in orderedTeams" :key="team.id" :class="{ advancing: index < advanceCount }" draggable="true" @dragstart="dragIndex = index" @dragover.prevent @drop="dropAt(index)">
            <b>{{ index + 1 }}</b><img v-if="team.logo" :src="team.logo" alt="" /><span v-else class="crest">{{ team.name.slice(0, 1) }}</span><strong>{{ team.name }}</strong><em v-if="index < advanceCount">晋级</em><div class="row-actions"><button :disabled="index===0" @click="move(team.id,-1)">↑</button><button :disabled="index===orderedTeams.length-1" @click="move(team.id,1)">↓</button><span>⠿</span></div>
          </li>
          <li v-if="!orderedTeams.length" class="empty-order"><span>尚未安排联赛阶段排序</span><small>从左侧点击球队加入</small></li>
        </ol>
      </section>

      <section class="panel hybrid-preview">
        <header><div><h2>晋级淘汰赛签位预览</h2><p>联赛前 {{ advanceCount }} 名进入淘汰赛</p></div><span>{{ hybridValid ? '可生成' : '待校验' }}</span></header>
        <div class="hybrid-tree" :class="`seeds-${advanceCount}`">
          <div class="hybrid-seeds">
            <article v-for="seed in hybridSeedOrder" :key="seed"><i>?</i><span>第 {{ seed }} 名</span></article>
          </div>
          <div class="hybrid-lines"><span v-for="n in hybridSemiCount" :key="n"><i>?</i><b>{{ advanceCount === 2 ? '决赛' : '半决赛' }}<br>待定</b></span></div>
          <div v-if="advanceCount > 2" class="hybrid-champion"><i>?</i><b>决赛<br>待定</b></div>
        </div>
        <div class="hybrid-note"><span>i</span>此处只预览种子位；球队将在联赛阶段结束并锁定排名后进入淘汰赛。</div>
      </section>
    </main>

    <footer class="action-bar">
      <div class="checks">
        <span :class="uniqueValid ? 'ok' : 'bad'">队伍无重复</span>
        <span :class="currentValid ? 'ok' : 'bad'">{{ isLeague ? '轮次可生成' : (isCup ? '队伍已全部进入签位' : '晋级名额已设置') }}</span>
        <span :class="currentValid ? 'ok' : 'bad'">{{ isLeague ? '主客场待赛程中设置' : (isCup ? '可继续调整' : '淘汰赛签位可生成') }}</span>
      </div>
      <div class="actions">
        <el-button @click="clearOrder">{{ isHybrid ? '清空排序' : '清空签位' }}</el-button>
        <el-button @click="randomize">{{ isHybrid ? '一键随机排序' : '一键随机排位' }}</el-button>
        <el-button type="success" :disabled="!currentValid" :loading="saving" @click="confirm">{{ isLeague ? '确认联赛排序' : (isCup ? '确认淘汰赛签位' : '确认混合制分组') }}</el-button>
      </div>
    </footer>
  </section>
</template>

<script setup>
import { computed, getCurrentInstance, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Rank, Trophy } from '@element-plus/icons-vue'
import { addRecord, deleteRecord, queryById, queryList } from '../../utils/cloud'
import { getVisualQaSnapshot } from '../../utils/visualQaFixtures'

const props = defineProps({ tournamentId: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const componentInstance = getCurrentInstance()
const tournamentId = props.tournamentId
const visualQa = typeof window !== 'undefined' && window.location.hostname === '127.0.0.1' && window.location.href.includes('visualQa=1')
const qaSnapshot = visualQa ? (window.__sxfVisualQaSnapshot || getVisualQaSnapshot()) : null
const qaNames = ['郑州绿城', '洛阳龙门', '开封未来', '新乡雄鹰', '许昌天行', '南阳小将', '平顶山启航', '焦作山阳', '信阳追风', '周口星辰', '商丘雏鹰', '驻马店逐梦']
const suffix = computed(() => divisionId.value.includes('u14') ? 'U14' : divisionId.value.includes('u10') ? 'U10' : divisionId.value.includes('u8') ? 'U8' : 'U12')
const loading = ref(false)
const saving = ref(false)
const divisionId = ref(String(route.query.divisionId || 'default'))
const initialSuffix = divisionId.value.includes('u14') ? 'U14' : divisionId.value.includes('u8') ? 'U8' : divisionId.value.includes('u10') ? 'U10' : 'U12'
const initialQaCount = route.query.format === 'cup' ? 8 : 12
const initialQaTeams = visualQa ? qaNames.slice(0, initialQaCount).map((name, index) => ({ id: `qa-${route.query.format || 'quick'}-${index + 1}`, name: `${name}${initialSuffix}`, logo: '' })) : []
const tournament = ref(visualQa ? { name: '2026 赛小蜂青少年足球邀请赛', startDate: '2026-08-18', endDate: '2026-08-24', location: '郑州足球公园', divisions: [{ id: divisionId.value, name: `${initialSuffix}组` }] } : {})
const teams = ref(initialQaTeams)
const orderedTeams = ref([...initialQaTeams])
const keyword = ref('')
const activeRound = ref(0)
const dragIndex = ref(-1)
const renderVersion = ref(0)
const advanceCount = ref(8)
const hybridDraggingTeam = ref(null)
const initialCupSlots = Array(16).fill(null)
if (route.query.format === 'cup') {
  initialQaTeams.forEach((team, index) => { initialCupSlots[[0, 2, 4, 6, 8, 10, 12, 14][index]] = team })
}
const cupSlots = ref(initialCupSlots)
const cupDraggingTeam = ref(null)

const isLeague = computed(() => route.query.format === 'league')
const isCup = computed(() => route.query.format === 'cup')
const isHybrid = computed(() => !isLeague.value && !isCup.value)
const workflowType = computed(() => isLeague.value ? 'league' : isCup.value ? 'cup' : 'hybrid')
const divisionOptions = computed(() => Array.isArray(tournament.value.divisions) && tournament.value.divisions.length ? tournament.value.divisions : [{ id: divisionId.value, name: `${suffix.value}组` }])
const divisionName = computed(() => divisionOptions.value.find(item => String(item.id) === divisionId.value)?.name || `${suffix.value}组`)
const eventMeta = computed(() => `${tournament.value.startDate || '2026-08-18'} 至 ${tournament.value.endDate || '2026-08-24'} · ${tournament.value.location || '郑州足球公园'}`)
const filteredTeams = computed(() => teams.value.filter(team => !keyword.value || team.name.toLowerCase().includes(keyword.value.toLowerCase())))
const orderedTeamIds = computed(() => new Set(orderedTeams.value.map(team => team.id)))
const uniqueValid = computed(() => orderedTeamIds.value.size === orderedTeams.value.length)
const orderValid = computed(() => orderedTeams.value.length === teams.value.length && orderedTeams.value.length >= 2 && uniqueValid.value)
const cupAssignedTeams = computed(() => cupSlots.value.filter(Boolean))
const cupAssignedIds = computed(() => new Set(cupAssignedTeams.value.map(team => team.id)))
const cupAssignedCount = computed(() => cupAssignedTeams.value.length)
const cupValid = computed(() => teams.value.length >= 2 && teams.value.length <= 16 && cupAssignedCount.value === teams.value.length && cupAssignedIds.value.size === cupAssignedCount.value)
const hybridValid = computed(() => [2, 4, 8].includes(Number(advanceCount.value)) && Number(advanceCount.value) <= orderedTeams.value.length && orderValid.value)
const currentValid = computed(() => isCup.value ? cupValid.value : isHybrid.value ? hybridValid.value : orderValid.value)
const hybridSeedOrder = computed(() => {
  const count = Number(advanceCount.value)
  if (count === 2) return [1, 2]
  if (count === 4) return [1, 4, 2, 3]
  return [1, 8, 4, 5, 2, 7, 3, 6]
})
const hybridSemiCount = computed(() => Number(advanceCount.value) === 8 ? 4 : Number(advanceCount.value) === 4 ? 2 : 1)

const leagueRounds = computed(() => {
  if (orderedTeams.value.length < 2) return []
  const rotating = [...orderedTeams.value]
  if (rotating.length % 2) rotating.push({ id: '__bye__', name: '轮空' })
  const rounds = []
  for (let round = 0; round < rotating.length - 1; round += 1) {
    const matches = []
    for (let index = 0; index < rotating.length / 2; index += 1) {
      const home = rotating[index]
      const away = rotating[rotating.length - 1 - index]
      if (home.id !== '__bye__' && away.id !== '__bye__') matches.push(round % 2 ? { home: away, away: home } : { home, away })
    }
    rounds.push(matches)
    rotating.splice(1, 0, rotating.pop())
  }
  return rounds
})
const previewRounds = computed(() => leagueRounds.value.slice(0, 3))
const activeMatches = computed(() => previewRounds.value[activeRound.value] || [])
const leagueMatchCount = computed(() => leagueRounds.value.reduce((total, round) => total + round.length, 0))

function qaTeamRows() { const count = isCup.value ? 8 : 12; return qaNames.slice(0, count).map((name, index) => ({ id: `qa-${workflowType.value}-${index + 1}`, name: `${name}${suffix.value}`, logo: '' })) }
function buildCupSlots(rows) {
  const slots = Array(16).fill(null)
  const preferred = rows.length <= 8 ? [0, 2, 4, 6, 8, 10, 12, 14] : Array.from({ length: 16 }, (_, index) => index)
  rows.slice(0, 16).forEach((team, index) => { slots[preferred[index]] = team })
  return slots
}
function teamRow(registration, detail) { return { id: String(registration.teamId || detail?._id), name: String(detail?.name || detail?.teamName || registration.teamName || '未命名球队'), logo: String(detail?.logoTransparentUrl || detail?.logoUrl || detail?.logo || registration.teamLogo || '') } }

async function load() {
  loading.value = true
  activeRound.value = 0
  try {
    if (qaSnapshot) {
      tournament.value = { ...qaSnapshot.tournament, name: '2026 赛小蜂青少年足球邀请赛', startDate: '2026-08-18', endDate: '2026-08-24', location: '郑州足球公园', divisions: [{ id: divisionId.value, name: `${suffix.value}组` }] }
      teams.value = qaTeamRows()
      orderedTeams.value = [...teams.value]
      advanceCount.value = 8
      cupSlots.value = isCup.value ? buildCupSlots(teams.value) : Array(16).fill(null)
      return
    }
    const [event, registrations] = await Promise.all([queryById('tournaments', tournamentId), queryList('tournament_teams', { where: { tournamentId, status: 'approved' }, limit: 1000 })])
    tournament.value = Array.isArray(event) ? event[0] || {} : event || {}
    const scoped = registrations.filter(item => String(item.divisionId || 'default') === divisionId.value)
    const ids = scoped.map(item => item.teamId).filter(Boolean)
    const details = ids.length ? await queryList('teams', { where: { _id: { $in: ids } }, limit: 1000 }) : []
    const lookup = new Map(details.map(item => [String(item._id), item]))
    teams.value = scoped.map(item => teamRow(item, lookup.get(String(item.teamId))))
    const collection = isCup.value ? 'tournament_bracket' : 'tournament_league_tables'
    const existing = await queryList(collection, { where: { tournamentId }, limit: 1000 })
    const saved = existing.find(item => String(item.divisionId || 'default') === divisionId.value && item.type === workflowType.value && item.status !== 'archived')
    const order = Array.isArray(saved?.teams) ? saved.teams.map(item => String(item.teamId)).filter(Boolean) : []
    const map = new Map(teams.value.map(item => [item.id, item]))
    orderedTeams.value = [...order.map(id => map.get(id)).filter(Boolean), ...teams.value.filter(item => !order.includes(item.id))]
    if (isHybrid.value) advanceCount.value = Number(saved?.advanceCount || Math.min(8, teams.value.length >= 8 ? 8 : teams.value.length >= 4 ? 4 : 2))
    if (isCup.value) {
      const savedSlots = Array.isArray(saved?.slots) ? saved.slots : []
      cupSlots.value = savedSlots.length === 16 ? savedSlots.map(slot => map.get(String(slot?.teamId || '')) || null) : buildCupSlots(teams.value)
    }
  } catch (error) {
    teams.value = []
    orderedTeams.value = []
    ElMessage.error(error.message || '加载分组数据失败')
  } finally {
    loading.value = false
    renderVersion.value += 1
    componentInstance?.update?.()
  }
}

function move(id, offset) {
  const index = orderedTeams.value.findIndex(item => item.id === id)
  const target = index + offset
  if (index < 0 || target < 0 || target >= orderedTeams.value.length) return
  const next = [...orderedTeams.value]
  ;[next[index], next[target]] = [next[target], next[index]]
  orderedTeams.value = next
  renderVersion.value += 1
  recordDraftAction('move')
}
function dropAt(index) {
  if (dragIndex.value < 0 || dragIndex.value === index) return
  const next = [...orderedTeams.value]
  const [item] = next.splice(dragIndex.value, 1)
  next.splice(index, 0, item)
  orderedTeams.value = next
  dragIndex.value = -1
  renderVersion.value += 1
  recordDraftAction('drag')
}
function appendTeam(team) {
  if (orderedTeamIds.value.has(team.id)) return
  orderedTeams.value = [...orderedTeams.value, team]
  renderVersion.value += 1
  recordDraftAction('append')
}
function setAdvanceCount(count) {
  advanceCount.value = count
  renderVersion.value += 1
  recordDraftAction('advance-count')
}
function placeHybridTeam(team) {
  if (!isHybrid.value) return
  const current = orderedTeams.value.findIndex(item => item.id === team.id)
  if (current >= 0) return
  orderedTeams.value = [...orderedTeams.value, team]
  renderVersion.value += 1
  recordDraftAction('append')
}
function placeCupTeam(team) {
  if (cupAssignedIds.value.has(team.id)) return
  const index = cupSlots.value.findIndex(slot => !slot)
  if (index < 0) return
  const next = [...cupSlots.value]
  next[index] = team
  cupSlots.value = next
  renderVersion.value += 1
  recordDraftAction('place')
}
function dropCupTeam(index) {
  const team = cupDraggingTeam.value
  cupDraggingTeam.value = null
  if (!team) return
  const next = cupSlots.value.map(slot => slot?.id === team.id ? null : slot)
  next[index] = team
  cupSlots.value = next
  renderVersion.value += 1
  recordDraftAction('drag')
}
function clearCupSlot(index) {
  if (!cupSlots.value[index]) return
  const next = [...cupSlots.value]
  next[index] = null
  cupSlots.value = next
  renderVersion.value += 1
  recordDraftAction('remove')
}
function randomize() {
  const next = [...teams.value]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[target]] = [next[target], next[index]]
  }
  orderedTeams.value = next
  if (isCup.value) cupSlots.value = buildCupSlots(next)
  activeRound.value = 0
  renderVersion.value += 1
  recordDraftAction('randomize')
}
function clearOrder() {
  orderedTeams.value = []
  if (isCup.value) cupSlots.value = Array(16).fill(null)
  activeRound.value = 0
  renderVersion.value += 1
  recordDraftAction('clear')
}
function recordDraftAction(action) {
  componentInstance?.update?.()
  if (!visualQa) return
  const scope = { action, tournamentId, divisionId: divisionId.value, type: workflowType.value, teamCount: isCup.value ? cupAssignedCount.value : orderedTeams.value.length, cloudWrite: false, draftOnly: true }
  window.__sxfQuickLeagueInteraction = scope
  if (isCup.value) window.__sxfQuickCupInteraction = scope
  if (isHybrid.value) window.__sxfQuickHybridInteraction = scope
}
function goFormat(format) { router.push({ path: `/tournaments/${tournamentId}/draw`, query: { divisionId: divisionId.value, mode: 'quick', view: 'console', format, ...(visualQa ? { visualQa: '1' } : {}) } }) }
function backConfig() { router.push({ path: `/tournaments/${tournamentId}/draw`, query: { divisionId: divisionId.value, mode: 'quick', view: 'config', ...(visualQa ? { visualQa: '1' } : {}) } }) }
function goResult() { router.push({ path: `/tournaments/${tournamentId}/draw`, query: { divisionId: divisionId.value, mode: 'quick', view: 'result', format: workflowType.value, ...(visualQa ? { visualQa: '1' } : {}) } }) }

async function confirm() {
  const type = workflowType.value
  const label = isLeague.value ? '联赛排序' : isCup.value ? '淘汰赛签位' : '混合制分组'
  try {
    const generatedMatches = isLeague.value ? leagueMatchCount.value : isCup.value ? 8 : Number(advanceCount.value) - 1
    if (visualQa) {
      const scope = { phase: 'confirmation-opened', tournamentId, divisionId: divisionId.value, type, teamCount: isCup.value ? cupAssignedCount.value : orderedTeams.value.length, generatedMatches, targetStatus: 'draft', published: false, deletedPublished: false, deletedCompleted: false, deletedArchived: false, deletedOtherDivisions: false, deletedOtherTypes: false }
      window.__sxfQuickLeagueAction = scope
      if (isCup.value) window.__sxfQuickCupAction = scope
      if (isHybrid.value) window.__sxfQuickHybridAction = scope
    }
    if (!visualQa) await ElMessageBox.confirm(`确认后将为当前组别保存${label}，并生成可继续编辑的赛程草稿；不会覆盖已发布或已完赛赛程。`, `确认${label}`, { type: 'warning', confirmButtonText: '确认生成草稿', cancelButtonText: '取消' })
    saving.value = true
    if (visualQa) {
      window.__sxfQuickLeagueAction = { ...window.__sxfQuickLeagueAction, phase: 'confirmed', cloudWrite: false }
      if (isCup.value) window.__sxfQuickCupAction = { ...window.__sxfQuickCupAction, phase: 'confirmed', cloudWrite: false }
      if (isHybrid.value) window.__sxfQuickHybridAction = { ...window.__sxfQuickHybridAction, phase: 'confirmed', cloudWrite: false }
      ElMessage.success(`${label}草稿已生成`)
      goResult()
      return
    }
    const now = new Date()
    const tables = await queryList('tournament_league_tables', { where: { tournamentId }, limit: 1000 })
    const replaceableTables = tables.filter(row => String(row.divisionId || 'default') === divisionId.value && row.type === type && !['published', 'archived'].includes(row.status))
    for (const item of replaceableTables) await deleteRecord('tournament_league_tables', item._id)
    if (isCup.value) {
      const brackets = await queryList('tournament_bracket', { where: { tournamentId }, limit: 1000 })
      const replaceableBrackets = brackets.filter(row => String(row.divisionId || 'default') === divisionId.value && row.type === 'cup' && row.source === 'quick-cup-draft' && !['published', 'archived'].includes(row.status))
      for (const item of replaceableBrackets) await deleteRecord('tournament_bracket', item._id)
    }
    const matches = await queryList('matches', { where: { tournamentId }, limit: 1000 })
    const replaceableMatches = matches.filter(row => String(row.divisionId || 'default') === divisionId.value && row.source === `quick-${type}-draft` && !['published', 'completed', 'in_progress'].includes(row.status))
    for (const item of replaceableMatches) await deleteRecord('matches', item._id)
    const ranked = orderedTeams.value.map((team, index) => ({ teamId: team.id, teamName: team.name, position: index + 1, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }))
    if (!isCup.value) await addRecord('tournament_league_tables', { tournamentId, divisionId: divisionId.value, divisionName: divisionName.value, tableName: isLeague.value ? '快速联赛排序' : '混合制联赛阶段', tableCode: isLeague.value ? 'LEAGUE' : 'HYBRID', teams: ranked, teamCount: ranked.length, advanceCount: isHybrid.value ? Number(advanceCount.value) : undefined, type, loopType: 'single', status: 'draft', source: `quick-${type}-draft`, createTime: now, updateTime: now })
    if (isCup.value) await addRecord('tournament_bracket', { tournamentId, divisionId: divisionId.value, divisionName: divisionName.value, type: 'cup', name: '快速淘汰赛签位', round: 1, capacity: 16, teamCount: cupAssignedCount.value, slots: cupSlots.value.map((team, index) => ({ slotCode: `${index < 8 ? 'A' : 'B'}${index < 8 ? index + 1 : index - 7}`, teamId: team?.id || '', teamName: team?.name || '', bye: !team })), matches: Array.from({ length: 8 }, (_, index) => ({ matchId: `cup-r1-${index + 1}`, round: 1, slot1: cupSlots.value[index * 2] ? { teamId: cupSlots.value[index * 2].id, teamName: cupSlots.value[index * 2].name } : null, slot2: cupSlots.value[index * 2 + 1] ? { teamId: cupSlots.value[index * 2 + 1].id, teamName: cupSlots.value[index * 2 + 1].name } : null, winner: null })), status: 'draft', confirmed: false, source: 'quick-cup-draft', createTime: now, updateTime: now })
    if (isHybrid.value) {
      const brackets = await queryList('tournament_bracket', { where: { tournamentId }, limit: 1000 })
      const replaceableBrackets = brackets.filter(row => String(row.divisionId || 'default') === divisionId.value && row.type === 'hybrid' && row.source === 'quick-hybrid-draft' && !['published', 'archived'].includes(row.status))
      for (const item of replaceableBrackets) await deleteRecord('tournament_bracket', item._id)
      const seeds = hybridSeedOrder.value
      await addRecord('tournament_bracket', { tournamentId, divisionId: divisionId.value, divisionName: divisionName.value, type: 'hybrid', name: '混合制晋级淘汰赛', round: 1, capacity: Number(advanceCount.value), advanceCount: Number(advanceCount.value), seedRule: seeds, slots: seeds.map((seed, index) => ({ slotCode: `S${index + 1}`, sourceRank: seed, teamId: '', teamName: `联赛第${seed}名`, pendingLeagueResult: true })), matches: Array.from({ length: Number(advanceCount.value) / 2 }, (_, index) => ({ matchId: `hybrid-r1-${index + 1}`, round: 1, slot1: { sourceRank: seeds[index * 2] }, slot2: { sourceRank: seeds[index * 2 + 1] }, winner: null })), status: 'draft', confirmed: false, source: 'quick-hybrid-draft', createTime: now, updateTime: now })
    }
    if (isLeague.value) {
      for (let roundIndex = 0; roundIndex < leagueRounds.value.length; roundIndex += 1) {
        for (let matchIndex = 0; matchIndex < leagueRounds.value[roundIndex].length; matchIndex += 1) {
          const match = leagueRounds.value[roundIndex][matchIndex]
          await addRecord('matches', { tournamentId, divisionId: divisionId.value, divisionName: divisionName.value, round: roundIndex + 1, matchNo: matchIndex + 1, homeTeamId: match.home.id, homeTeamName: match.home.name, awayTeamId: match.away.id, awayTeamName: match.away.name, formatType: 'league', status: 'draft', source: 'quick-league-draft', createTime: now, updateTime: now })
        }
      }
    }
    ElMessage.success(`${label}草稿已生成`)
    goResult()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(error.message || '确认失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.quick-console{min-height:100%;padding:18px 28px 92px;background:#f7f9f8;color:#26352c}.event-header{display:flex;align-items:center;justify-content:space-between;margin:-18px -28px 0;padding:16px 28px 15px;border-bottom:1px solid #e1e7e3;background:#fff}.event-copy>.el-button{margin-left:-14px;color:#65736a}.event-line{display:flex;align-items:center;gap:13px;margin-top:5px}.event-mark{display:grid;place-items:center;width:42px;height:42px;border-radius:9px;background:#078348;color:#fff;font-weight:800}.event-header h1{margin:0 0 5px;font-size:23px;line-height:1.2}.event-header p{margin:0;color:#78847c;font-size:13px}.division-picker{display:flex;align-items:center;gap:11px;color:#65736a;font-size:13px}.division-picker :deep(.el-select){width:154px}.steps{display:flex;align-items:center;justify-content:center;height:61px;margin:0 -28px;border-bottom:1px solid #e4e9e6;background:#fff}.steps button{position:relative;display:flex;align-items:center;gap:8px;height:61px;padding:0 50px;border:0;background:transparent;color:#879189;cursor:pointer}.steps button:after{position:absolute;right:-4px;content:'›';color:#bdc5bf;font-size:23px}.steps button:last-child:after{display:none}.steps i{display:grid;place-items:center;width:23px;height:23px;border-radius:50%;background:#e9eeeb;color:#6d7971;font-style:normal;font-size:12px}.steps .active{color:#087f46;font-weight:700}.steps .active:before{position:absolute;right:38px;bottom:0;left:38px;height:3px;background:#078348;content:''}.steps .active i{background:#078348;color:#fff}.format-tabs{display:flex;align-items:center;gap:9px;height:58px}.format-tabs strong{margin-right:6px;font-size:14px}.format-tabs button{min-width:82px;padding:8px 16px;border:1px solid #dce4df;border-radius:5px;background:#fff;color:#59665e;cursor:pointer}.format-tabs button.active{border-color:#078348;background:#078348;color:#fff}.league-board{display:grid;grid-template-columns:270px minmax(390px,.95fr) minmax(440px,1.1fr);gap:14px}.panel{height:556px;box-sizing:border-box;padding:15px;border:1px solid #dfe6e1;border-radius:8px;background:#fff;box-shadow:0 2px 6px rgba(28,65,43,.03)}.panel>header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px}.panel h2{margin:0 0 4px;font-size:16px}.panel header p{margin:0;color:#8a958e;font-size:12px}.panel>header>span{display:grid;place-items:center;min-width:28px;height:24px;padding:0 7px;border-radius:12px;background:#edf6f0;color:#087f46;font-size:12px}.pool ol,.ranking ol,.legacy-stage ol{margin:10px -4px 0;padding:0;list-style:none}.pool ol{height:443px;overflow:auto}.pool li{display:flex;align-items:center;gap:8px;height:35px;padding:0 7px;border-bottom:1px solid #edf1ee;cursor:pointer}.pool li:hover{background:#f6faf7}.pool li.added small{color:#9aa49d}.pool li b{flex:1;overflow:hidden;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.pool li small{color:#078348;font-size:11px}.crest,.mini-crest{display:grid;flex:none;place-items:center;width:23px;height:23px;border-radius:50%;background:linear-gradient(135deg,#12884d,#65b880);color:#fff;font-size:10px;font-weight:700}.ranking-tip{display:flex;align-items:center;gap:7px;margin-bottom:8px;padding:7px 9px;border-radius:5px;background:#f1f7f3;color:#597066;font-size:11px}.ranking-tip span{display:grid;place-items:center;width:16px;height:16px;border:1px solid #6aa082;border-radius:50%;color:#087f46;font-size:10px}.ranking ol{height:445px;overflow:auto}.ranking li{display:flex;align-items:center;gap:8px;height:34px;padding:0 6px;border-bottom:1px solid #edf1ee}.ranking li>b{display:grid;place-items:center;width:22px;height:22px;border-radius:4px;background:#eef5f0;color:#087f46;font-size:11px}.ranking li>strong{flex:1;overflow:hidden;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.row-actions{display:flex;align-items:center;gap:1px}.row-actions button{width:20px;height:23px;padding:0;border:0;background:transparent;color:#77837b;cursor:pointer}.row-actions button:disabled{color:#ccd2ce;cursor:default}.row-actions span{margin-left:3px;color:#a5aea8;cursor:grab}.ranking .empty-order{display:flex;height:390px;flex-direction:column;justify-content:center;border:1px dashed #d8e1db;border-radius:6px;color:#7c8880}.ranking .empty-order span{font-size:14px}.ranking .empty-order small{margin-top:7px}.round-tabs{display:flex;gap:7px;border-bottom:1px solid #e7ece9}.round-tabs button{padding:7px 15px 9px;border:0;border-bottom:2px solid transparent;background:transparent;color:#7a867e;cursor:pointer}.round-tabs button.active{border-bottom-color:#078348;color:#078348;font-weight:700}.round-list{padding-top:11px}.round-list article{display:grid;grid-template-columns:1fr 48px 1fr;align-items:center;height:62px;margin-bottom:7px;border:1px solid #e1e7e3;border-radius:6px;background:#fcfdfc}.match-team{display:flex;align-items:center;gap:8px;padding:0 12px;font-size:12px}.match-team.home{justify-content:flex-end;text-align:right}.round-list article>b{display:flex;flex-direction:column;align-items:center;color:#238052;font-size:13px}.round-list article>b small{margin-bottom:2px;color:#a0aaa3;font-size:9px;font-weight:400}.mini-crest{width:25px;height:25px}.more-match{margin:6px 0 0;text-align:center;color:#7e8a82;font-size:11px}.empty-preview{display:grid;place-items:center;height:360px;border:1px dashed #d8e1db;border-radius:6px;color:#89938c;font-size:13px}.legacy-board{display:grid;grid-template-columns:280px 1fr;gap:14px}.legacy-stage ol{display:grid;grid-template-columns:1fr 1fr;gap:8px}.legacy-stage li{display:flex;align-items:center;gap:10px;min-height:42px;padding:0 10px;border:1px solid #e2e8e4;border-radius:5px}.legacy-stage li strong{flex:1}.legacy-stage li button{border:0;background:transparent;color:#087f46}.action-bar{position:fixed;right:0;bottom:0;left:220px;z-index:5;display:flex;align-items:center;justify-content:space-between;min-height:72px;padding:0 30px;border-top:1px solid #dce4df;background:#fff;box-shadow:0 -4px 14px rgba(35,65,46,.06)}.checks{display:flex;gap:24px}.checks span{font-size:12px}.checks span:before{display:inline-block;width:17px;height:17px;margin-right:6px;border-radius:50%;content:'✓';text-align:center;line-height:17px}.checks .ok{color:#13864b}.checks .ok:before{background:#e5f4e9}.checks .bad{color:#d45d45}.checks .bad:before{background:#fbece8;content:'!'}.actions{display:flex;gap:8px}@media(max-width:1200px){.league-board{grid-template-columns:245px 1fr}.preview{grid-column:1/-1}.panel.preview{height:auto}.action-bar{left:0}}@media(max-width:760px){.event-header,.action-bar{align-items:stretch;flex-direction:column}.steps button{padding:0 12px}.league-board,.legacy-board{grid-template-columns:1fr}.panel{height:auto}.action-bar{position:static;margin:16px -28px -92px;padding:16px}.checks{flex-wrap:wrap}}
.cup-board{display:grid;grid-template-columns:245px minmax(0,1fr);gap:14px}.cup-pool ol{height:395px;margin:10px -4px 0;padding:0;overflow:auto;list-style:none}.cup-pool li{display:flex;align-items:center;gap:8px;height:43px;padding:0 8px;border:1px solid #e5eae7;border-radius:5px;margin-bottom:6px;cursor:pointer}.cup-pool li.assigned{background:#f7faf8;color:#77837b}.cup-pool li b{flex:1;overflow:hidden;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.cup-pool li small{font-size:10px;color:#87928b}.cup-pool li .el-icon{color:#9aa49e}.pool-help{margin:8px 0 0;color:#8a958e;font-size:10px;line-height:1.5}.cup-stage{overflow:hidden}.bracket-shell{position:relative;display:grid;grid-template-columns:184px 102px 102px 76px 102px 102px 184px;align-items:center;justify-content:center;gap:10px;height:420px;margin:2px -4px 8px;border:1px solid #edf1ee;border-radius:7px;background:linear-gradient(90deg,#fbfdfb,#fff 48%,#fbfdfb)}.bracket-side{display:grid;gap:11px;z-index:2}.seed-pair{position:relative;display:grid;gap:4px}.seed-pair:after{position:absolute;top:23px;right:-20px;width:20px;height:34px;border-top:1px solid #16874d;border-right:1px solid #16874d;border-bottom:1px solid #16874d;content:''}.bracket-side.right .seed-pair:after{right:auto;left:-20px;border-right:0;border-left:1px solid #16874d}.seed-slot{display:grid;grid-template-columns:34px minmax(0,1fr);align-items:center;width:100%;height:34px;padding:0;border:1px solid #dfe6e1;border-radius:5px;background:#fff;color:#8b958f;cursor:pointer}.bracket-side.right .seed-slot{grid-template-columns:minmax(0,1fr) 34px}.seed-slot>b{display:grid;place-items:center;align-self:stretch;border-right:1px solid #dfe6e1;color:#334139;font-size:12px}.bracket-side.right .seed-slot>b{border-right:0;border-left:1px solid #dfe6e1}.seed-slot>span{display:flex;align-items:center;gap:6px;overflow:hidden;padding:0 7px;font-size:11px;white-space:nowrap}.seed-slot>span em{width:100%;color:#b0b8b3;font-style:normal;text-align:center}.seed-slot.filled>span{color:#26362c;font-weight:600}.seed-slot .crest{width:22px;height:22px}.advance-column,.semifinal-column{position:relative;display:grid;align-content:center;z-index:1}.advance-column{gap:54px}.semifinal-column{gap:148px}.advance-column span,.semifinal-column span{position:relative;display:grid;place-items:center;height:40px;border:1px solid #dfe6e1;border-radius:5px;background:#fff;color:#a0aaa4;font-size:11px}.advance-column span:before,.advance-column span:after,.semifinal-column span:before,.semifinal-column span:after{position:absolute;top:50%;width:12px;border-top:1px solid #16874d;content:''}.advance-column span:before,.semifinal-column span:before{left:-12px}.advance-column span:after,.semifinal-column span:after{right:-12px}.final-center{display:grid;place-items:center;gap:3px;color:#28362d}.final-center .el-icon{font-size:47px;color:#d59a16}.final-center strong{font-size:14px}.final-center small{font-size:10px;color:#909a94}.cup-note{display:flex;align-items:center;gap:7px;padding:7px 10px;border-radius:5px;background:#f1f7f3;color:#61756a;font-size:11px}.cup-note>span{display:grid;place-items:center;width:16px;height:16px;border:1px solid #6aa082;border-radius:50%;color:#087f46}.hybrid-board{display:grid;grid-template-columns:255px minmax(390px,.95fr) minmax(455px,1.15fr);gap:14px}.hybrid-pool ol{height:443px}.hybrid-pool li .el-icon{margin-left:auto;color:#9ca69f}.hybrid-ranking ol{height:400px;margin:8px -4px 0;padding:0;overflow:auto;list-style:none}.hybrid-ranking li{display:flex;align-items:center;gap:8px;height:31px;padding:0 7px;border-bottom:1px solid #edf1ee}.hybrid-ranking li>b{width:22px;color:#24342a;font-size:12px;text-align:center}.hybrid-ranking li.advancing>b{color:#078348}.hybrid-ranking li strong{flex:1;overflow:hidden;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.hybrid-ranking li em{padding:2px 5px;border-radius:8px;background:#e8f5ec;color:#078348;font-size:9px;font-style:normal}.hybrid-badges{display:flex;gap:5px}.hybrid-badges .el-icon{margin-right:3px}.advance-control{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:5px;background:#f3f7f4;font-size:11px}.advance-control :deep(.el-select){width:82px}.advance-control small{color:#8a958e}.hybrid-preview{overflow:hidden}.hybrid-tree{display:grid;grid-template-columns:155px 140px 110px;align-items:center;gap:28px;min-height:390px;padding:0 18px}.hybrid-seeds{display:grid;gap:8px}.hybrid-seeds article,.hybrid-lines span,.hybrid-champion{display:flex;align-items:center;gap:10px;min-height:41px;padding:0 10px;border:1px solid #dfe6e1;border-radius:5px;background:#fff;color:#536058;font-size:12px}.hybrid-seeds article{position:relative}.hybrid-seeds article:after{position:absolute;right:-29px;width:29px;border-top:1px solid #b8c2bc;content:''}.hybrid-tree i{display:grid;place-items:center;width:24px;height:24px;border:1px solid #ccd4cf;border-radius:50%;background:#f1f3f2;color:#727d76;font-style:normal}.hybrid-lines{display:grid;align-content:center;gap:48px}.hybrid-lines span{position:relative;min-height:51px}.hybrid-lines span:before,.hybrid-lines span:after{position:absolute;width:28px;border-top:1px solid #b8c2bc;content:''}.hybrid-lines span:before{left:-29px}.hybrid-lines span:after{right:-29px}.hybrid-lines b,.hybrid-champion b{font-weight:500;line-height:1.35}.hybrid-champion{position:relative;min-height:55px}.hybrid-champion:before{position:absolute;left:-29px;width:29px;border-top:1px solid #b8c2bc;content:''}.hybrid-tree.seeds-4 .hybrid-seeds{gap:40px}.hybrid-tree.seeds-4 .hybrid-lines{gap:86px}.hybrid-tree.seeds-2{grid-template-columns:170px 150px}.hybrid-tree.seeds-2 .hybrid-champion{display:none}.hybrid-note{display:flex;align-items:center;gap:7px;padding:7px 10px;border-radius:5px;background:#f1f7f3;color:#61756a;font-size:11px}.hybrid-note>span{display:grid;place-items:center;width:16px;height:16px;border:1px solid #6aa082;border-radius:50%;color:#087f46}@media(max-width:1200px){.cup-board{grid-template-columns:220px minmax(900px,1fr);overflow:auto}.bracket-shell{grid-template-columns:170px 88px 88px 70px 88px 88px 170px}.hybrid-board{grid-template-columns:240px minmax(390px,1fr)}.hybrid-preview{grid-column:1/-1}}
.advance-options{display:flex;gap:3px}.advance-options button{height:25px;padding:0 9px;border:1px solid #d8e1db;border-radius:4px;background:#fff;color:#5b685f;font-size:11px;cursor:pointer}.advance-options button.active{border-color:#078348;background:#078348;color:#fff}
</style>
