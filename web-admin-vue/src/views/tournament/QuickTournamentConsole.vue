<template>
  <section v-if="isScreen" class="draw-screen" :class="`theme-${screenConfig.theme}`">
    <header><strong>{{ screenConfig.title || tournament.name || '赛事抽签大屏' }}</strong><span>{{ divisionName }} · 抽签分组</span></header>
    <main>
      <h1>抽签分组</h1>
      <p v-if="screenConfig.showProgress" class="screen-progress">已分配 {{ screenGroups.flatMap(group => group.slots).filter(Boolean).length }} / {{ screenGroups.flatMap(group => group.slots).length }} 个签位</p>
      <div class="screen-groups">
        <article v-for="group in screenGroups" :key="group.code"><h2>{{ group.name }} <small v-if="screenConfig.showProgress">{{ group.slots.filter(Boolean).length }}/{{ group.slots.length }}</small></h2><ol><li v-for="(team,index) in group.slots" :key="index"><b v-if="screenConfig.showSlotNumber">{{ group.code }}{{ index + 1 }}</b><span v-if="team">{{ team.name }}</span><em v-else>待抽取</em></li></ol></article>
      </div>
    </main>
  </section>
  <section v-else class="quick-tournament">
    <header class="event-context">
      <div class="event-context-main">
        <span class="event-crest"><el-icon><Trophy /></el-icon></span>
        <strong>{{ tournament.name || '当前赛事' }}</strong>
        <el-tag type="primary" effect="light">{{ divisionName }}</el-tag>
        <el-tag type="success" effect="light">进行中</el-tag>
        <span class="event-meta"><el-icon><Calendar /></el-icon>{{ dateRange }}</span>
        <span class="event-meta"><el-icon><Location /></el-icon>{{ eventLocation }}</span>
      </div>
      <el-button plain @click="router.push('/tournament-space')"><el-icon><SwitchButton /></el-icon>返回赛事空间</el-button>
    </header>

    <div class="console-body">
      <div class="page-heading">
        <div><h1>抽签与分组</h1></div>
        <label>当前组别<span class="division-lock">{{ divisionName }}<el-icon><Lock /></el-icon></span></label>
      </div>
      <nav class="flow-tabs"><button type="button" @click="back">分组设置</button><strong>分组操作台</strong><button type="button" @click="result">分组结果</button></nav>

      <div :key="`summary-${renderVersion}`" class="summary">
        <span>参赛球队 <b>{{ teams.length }}</b></span><i />
        <span>已分配 <b>{{ assigned }}</b></span><i />
        <span>待分配 <em>{{ pool.length }}</em></span><i />
        <span>{{ groupCount }}组</span><i />
        <span>签位 {{ groupSizes.join(' + ') }}</span><i />
        <el-button plain @click="back"><el-icon><Back /></el-icon>返回分组设置</el-button>
      </div>

      <main :key="`console-${renderVersion}`">
        <aside class="team-pool">
          <h2>待分配球队 <em>{{ pool.length }}</em></h2>
          <p>拖拽球队至右侧空签位</p>
          <el-button v-if="availableByeCount > 0" class="bye-button" size="small" type="warning" plain @click="addBye">添加轮空（{{ availableByeCount }}）</el-button>
          <el-input v-model="keyword" :prefix-icon="Search" placeholder="搜索球队名称" />
          <small>{{ pool.length }}/{{ teams.length }} 待分配</small>
          <ol>
            <li v-for="team in visiblePool" :key="team.id" role="button" tabindex="0" draggable="true" @dragstart="startDrag(team)" @click="place(team)" @keydown.enter.prevent="place(team)" @keydown.space.prevent="place(team)">
              <span class="team-crest"><img v-if="team.logo || team.logoUrl || team.logoTransparentUrl" :src="team.logo || team.logoUrl || team.logoTransparentUrl" alt="" @error="team.logo='';team.logoUrl='';team.logoTransparentUrl=''" /><em v-else>{{ team.name.slice(0, 1) }}</em></span><b>{{ team.name }}</b><small>{{ team.region }}</small><el-icon><Grid /></el-icon>
            </li>
          </ol>
          <button v-if="filteredPool.length > poolDisplayLimit" type="button" @click="poolExpanded = !poolExpanded">{{ poolExpanded ? '收起球队' : `还有 ${filteredPool.length - poolDisplayLimit} 支，向下滚动查看更多` }}<el-icon><ArrowDown /></el-icon></button>
        </aside>

        <section class="groups-panel">
          <header>
            <div><h2>分组情况</h2><p>{{ assigned }}/{{ teams.length }} 已分配 · {{ groupSizes.join(' + ') }} 签位</p></div>
            <div class="console-actions">
              <el-select v-model="visibleGroupFilter"><el-option label="全部小组" value="all" /><el-option v-for="group in groups" :key="group.code" :label="group.name" :value="group.code" /></el-select>
              <el-button plain @click="screenConfigVisible = true"><el-icon><Setting /></el-icon>大屏配置</el-button>
              <el-button plain @click="projectScreen"><el-icon><Monitor /></el-icon>投大屏</el-button>
              <el-button plain @click="copyScreenLink">复制大屏链接</el-button>
              <el-button plain><el-icon><Setting /></el-icon>签位编号设置</el-button>
              <el-button plain :disabled="!undoStack.length" @click="undo"><el-icon><Back /></el-icon>撤销一步</el-button>
              <el-button plain @click="clearGroups"><el-icon><Delete /></el-icon>清空分组</el-button>
              <el-button type="success" @click="randomize"><el-icon><Refresh /></el-icon>一键随机分组</el-button>
            </div>
          </header>
          <div class="avoidance">同地区规避 <b>{{ avoidSameRegion ? '已开启' : '已关闭' }}</b><el-switch v-model="avoidSameRegion" /></div>
          <div class="groups-grid" :class="{ filtered: visibleGroupFilter !== 'all' }">
            <article v-for="group in visibleGroups" :key="group.code">
                <header><h3>{{ group.name }}</h3><b>{{ group.slots.filter(Boolean).length }}/{{ group.slots.length }}</b></header>
              <ol>
                <li v-for="(team,index) in group.slots" :key="index" :class="{ empty: !team }" @dragover.prevent @drop="dropInto(group,index)" @click="team && remove(team)">
                  <b>{{ group.code }}{{ index + 1 }}</b>
                  <template v-if="team"><span class="team-crest"><img v-if="team.logo || team.logoUrl || team.logoTransparentUrl" :src="team.logo || team.logoUrl || team.logoTransparentUrl" alt="" @error="team.logo='';team.logoUrl='';team.logoTransparentUrl=''" /><em v-else>{{ team.name.slice(0,1) }}</em></span><strong>{{ team.name }}</strong><el-icon><Grid /></el-icon></template>
                  <template v-else><el-icon><Trophy /></el-icon><em>拖入球队</em></template>
                </li>
              </ol>
            </article>
          </div>
        </section>
      </main>

      <footer :key="`validation-${renderVersion}`" class="validation-footer">
        <div><span><el-icon><CircleCheckFilled /></el-icon>球队无重复</span><span><el-icon><CircleCheckFilled /></el-icon>签位编号正确</span><em v-if="pool.length"><el-icon><WarningFilled /></el-icon>尚有 {{ pool.length }} 支球队未分配</em><span v-else><el-icon><CircleCheckFilled /></el-icon>已完成全部分组</span></div>
        <div><el-button :loading="saving" @click="saveDraft">保存草稿</el-button><el-button type="success" :disabled="Boolean(pool.length || availableByeCount)" :loading="confirming" @click="proceedToResult"><el-icon><Check /></el-icon>完成抽签并查看结果</el-button><small>{{ pool.length ? '完成全部签位后方可进入结果确认' : (availableByeCount ? '请添加轮空签' : '下一步在分组结果页正式确认') }}</small></div>
      </footer>
    </div>
  </section>
  <el-dialog v-model="screenConfigVisible" title="大屏配置" width="520px" :close-on-click-modal="false">
    <el-form label-position="left" label-width="110px">
      <el-form-item label="大屏标题"><el-input v-model="screenConfig.title" placeholder="默认使用赛事名称" /></el-form-item>
      <el-form-item label="主题"><el-radio-group v-model="screenConfig.theme"><el-radio-button value="dark">深色</el-radio-button><el-radio-button value="light">浅色</el-radio-button></el-radio-group></el-form-item>
      <el-form-item label="显示进度"><el-switch v-model="screenConfig.showProgress" /></el-form-item>
      <el-form-item label="显示签位编号"><el-switch v-model="screenConfig.showSlotNumber" /></el-form-item>
    </el-form>
    <template #footer><el-button @click="screenConfigVisible = false">取消</el-button><el-button type="success" @click="saveScreenConfig">保存配置</el-button></template>
  </el-dialog>
</template>

<script setup>
import { computed, getCurrentInstance, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Back, Calendar, Check, CircleCheckFilled, Delete, Grid, Location, Lock, Monitor, Refresh, Search, Setting, SwitchButton, Trophy, WarningFilled } from '@element-plus/icons-vue'
import { addRecord, deleteRecord, getFileUrl, queryById, queryList } from '../../utils/cloud'
import { getVisualQaSnapshot } from '../../utils/visualQaFixtures'

const props = defineProps({ tournamentId: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const componentInstance = getCurrentInstance()
const divisionId = ref(String(route.query.divisionId || 'default'))
const isScreen = computed(() => route.query.display === 'screen')
const savedGroupCount = ref(0)
const savedTeamsPerGroup = ref(0)
const configuredGroupSizes = ref([])
const groupCount = computed(() => Math.max(2, Math.min(16, Number(route.query.groupCount) || savedGroupCount.value || 4)))
const teamsPerGroup = computed(() => Math.max(2, Math.min(8, Number(route.query.teamsPerGroup) || savedTeamsPerGroup.value || 4)))
const visualQa = import.meta.env.DEV && typeof window !== 'undefined' && window.location.hostname === '127.0.0.1' && window.location.href.includes('visualQa=1')
const qaCompleteScenario = visualQa && route.query.scenario === 'complete'
const qaSnapshot = visualQa ? (window.__sxfVisualQaSnapshot || getVisualQaSnapshot()) : null
const qaNames = ['洛阳龙门U10','许昌未来U10','商丘雄狮U10','新乡联队U10','驻马店精英U10','三门峡之星U10','漯河天骄U10','安阳少年U10','郑州青训U10','周口先锋U10','南阳竞技U10','焦作山阳U10','郑州未来U10','开封雄鹰U10','信阳雄鹰U10','平顶山竞投U10','濮阳飞跃U10','济源劲旅U10','鹤壁晨光U10','开封少年U10','洛阳星火U10','南阳小将U10','安阳红旗U10','信阳追风U10','许昌天行U10','周口星辰U10','商丘雏阳U10','驻马店逐梦U10','新乡雄鹰U10','平顶山启航U10','焦作未来U10','漯河蓝鹰U10']
const tournament = ref(qaSnapshot ? qaSnapshot.tournament : {})
const divisionOptions = ref(qaSnapshot ? qaSnapshot.divisions.map(item => ({ id:String(item.id || item._id),name:item.name || '竞赛组别' })) : [])
const teams = ref(visualQa ? qaNames.map((name,index) => ({ id:`qa-quick-team-${index + 1}`, name, region:name.slice(0,2) })) : [])
const groupSizes = computed(() => {
  let querySizes = []
  try { const parsed = JSON.parse(String(route.query.groupSizes || '[]')); if (Array.isArray(parsed)) querySizes = parsed.map(Number) } catch {}
  const source = querySizes.length ? querySizes : configuredGroupSizes.value
  if (source.length === groupCount.value && source.every(value => value > 0)) return source
  const total = Math.max(teams.value.length, teamsPerGroup.value * groupCount.value)
  const base = Math.floor(total / groupCount.value)
  const remainder = total % groupCount.value
  return Array.from({ length: groupCount.value }, (_, index) => base + (index < remainder ? 1 : 0))
})
const divisionName = computed(() => divisionOptions.value.find(item => item.id === divisionId.value)?.name || tournament.value.divisions?.find(item => String(item.id || item._id) === divisionId.value)?.name || (visualQa ? 'U10组' : '当前组别'))
const dateRange = computed(() => {
  const start = String(tournament.value.startDate || '').replaceAll('-', '.')
  const end = String(tournament.value.endDate || '').replaceAll('-', '.')
  return start && end ? `${start}—${end}` : '时间待定'
})
const eventLocation = computed(() => tournament.value.province || tournament.value.city || tournament.value.location || '地点待定')
const keyword = ref('')
const groups = ref(makeGroups())
const screenGroups = ref([])
const screenConfigVisible = ref(false)
const screenConfig = ref({ title: '', theme: 'dark', showProgress: true, showSlotNumber: true })
const avoidSameRegion = ref(route.query.avoidSameRegion !== '0')
const visibleGroupFilter = ref('all')
const poolExpanded = ref(false)
const poolDisplayLimit = 8
const draggedTeam = ref(null)
const undoStack = ref([])
const saving = ref(false)
const confirming = ref(false)
const renderVersion = ref(0)
let drawChannel = null

function drawChannelKey() { return `sxf-draw-screen:${props.tournamentId}:${divisionId.value}` }
function screenConfigKey() { return `${drawChannelKey()}:config` }
const screenAddress = computed(() => {
  const params = new URLSearchParams({ divisionId: divisionId.value, divisionName: divisionName.value, tournamentLogo: tournament.value.logoTransparentUrl || tournament.value.logoUrl || tournament.value.logo || '', mode: 'quick', format: 'group', theme: screenConfig.value.theme, showProgress: screenConfig.value.showProgress ? '1' : '0', showSlotNumber: screenConfig.value.showSlotNumber ? '1' : '0' })
  if (screenConfig.value.title) params.set('title', screenConfig.value.title)
  return `https://screen.sxffootball.cn/draw/${encodeURIComponent(props.tournamentId)}?${params.toString()}`
})
function loadScreenConfig() { try { const saved = JSON.parse(localStorage.getItem(screenConfigKey()) || 'null'); if (saved) screenConfig.value = { ...screenConfig.value, ...saved } } catch {} }
function saveScreenConfig() { try { localStorage.setItem(screenConfigKey(), JSON.stringify(screenConfig.value)) } catch {}; screenConfigVisible.value = false; publishScreenState(); ElMessage.success('大屏配置已保存') }
async function copyScreenLink() { try { await navigator.clipboard.writeText(screenAddress.value); ElMessage.success('大屏链接已复制') } catch { ElMessage.warning(`请手动复制：${screenAddress.value}`) } }
async function publishScreenState() {
  const state = { title: screenConfig.value.title || tournament.value.name || '赛事抽签', tournamentLogo: tournament.value.logoTransparentUrl || tournament.value.logoUrl || tournament.value.logo || '', divisionName: divisionName.value, status: groups.value.flatMap(group => group.slots).filter(Boolean).length ? '抽签进行中' : '等待抽签开始', groups: groups.value.map(group => ({ name: group.name, code: group.code, slots: group.slots.map(team => team ? { id: team.id, name: team.name, logo: team.logo || team.logoUrl || team.logoTransparentUrl || '' } : null) })), updatedAt: Date.now() }
  screenGroups.value = state.groups
  try { localStorage.setItem(drawChannelKey(), JSON.stringify(state)); drawChannel?.postMessage(state) } catch {}
  try { const authToken = localStorage.getItem('authToken') || ''; if (authToken) await fetch('https://screen.sxffootball.cn/screen-api/state', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` }, body: JSON.stringify(state), keepalive: true }) } catch {}
}
function projectScreen() {
  loadScreenConfig()
  const opened = window.open(screenAddress.value, '_blank', 'noopener,noreferrer')
  if (!opened) ElMessage.warning('浏览器阻止了大屏窗口，请允许弹窗后重试')
  publishScreenState()
}


function makeGroups(){
  return Array.from({ length: groupCount.value }, (_,index) => ({ name:`${String.fromCharCode(65 + index)}组`, code:String.fromCharCode(65 + index), slots:Array(groupSizes.value[index] || teamsPerGroup.value).fill(null) }))
}
function seedVisualQaGroups(){
  groups.value = makeGroups()
  const seededTeams = qaCompleteScenario ? teams.value : teams.value.slice(12,32)
  seededTeams.forEach((team,index) => {
    const groupIndex = index % groupCount.value
    const slotIndex = Math.floor(index / groupCount.value)
    groups.value[groupIndex].slots[slotIndex] = team
  })
}
function snapshot(){ return groups.value.map(group => ({ ...group, slots:[...group.slots] })) }
function remember(){ undoStack.value.push(snapshot()); if(undoStack.value.length > 20) undoStack.value.shift() }
function restore(value){ groups.value = value.map(group => ({ ...group, slots:[...group.slots] })) }
function commitGroups(){
  groups.value = groups.value.map(group => ({ ...group, slots:[...group.slots] }))
  renderVersion.value += 1
  componentInstance?.update?.()
  nextTick(() => componentInstance?.update?.())
  publishScreenState()
}
const assigned = computed(() => groups.value.flatMap(group => group.slots).filter(Boolean).length)
const pool = computed(() => teams.value.filter(team => !groups.value.some(group => group.slots.some(slot => slot?.id === team.id))))
const filteredPool = computed(() => pool.value.filter(team => !keyword.value || team.name.includes(keyword.value)))
const visiblePool = computed(() => poolExpanded.value ? filteredPool.value : filteredPool.value.slice(0,poolDisplayLimit))
const visibleGroups = computed(() => visibleGroupFilter.value === 'all' ? groups.value : groups.value.filter(group => group.code === visibleGroupFilter.value))
const totalSlots = computed(() => groups.value.reduce((sum, group) => sum + group.slots.length, 0))
const byeCount = computed(() => groups.value.flatMap(group => group.slots).filter(team => team?.isBye).length)
const availableByeCount = computed(() => Math.max(0, totalSlots.value - teams.value.length - byeCount.value))

function place(team){
  for(const group of groups.value){ const index = group.slots.findIndex(slot => !slot); if(index >= 0){ remember(); group.slots[index] = team; commitGroups(); if(visualQa) window.__sxfQuickDrawInteraction = { action:'place-team',teamId:team.id,tournamentId:props.tournamentId,divisionId:divisionId.value,slot:`${group.code}${index + 1}`,published:false }; return } }
}
function addBye(){
  const target = groups.value.find(group => group.slots.some(slot => !slot))
  if (!target) return ElMessage.warning('没有可用签位')
  remember()
  const index = target.slots.findIndex(slot => !slot)
  target.slots[index] = { id:`bye-${Date.now()}`, name:'轮空', teamName:'轮空', isBye:true }
  commitGroups()
  ElMessage.success(`${target.name}已添加轮空签`)
}
function remove(team){ remember(); groups.value.forEach(group => { const index = group.slots.findIndex(slot => slot?.id === team.id); if(index >= 0) group.slots[index] = null }); commitGroups() }
function startDrag(team){ draggedTeam.value = team }
function dropInto(group,index){
  const team = draggedTeam.value
  if(!team) return
  remember()
  groups.value.forEach(item => { const old = item.slots.findIndex(slot => slot?.id === team.id); if(old >= 0) item.slots[old] = null })
  if(group.slots[index]){ const displaced = group.slots[index]; group.slots[index] = team; place(displaced) } else group.slots[index] = team
  commitGroups()
  draggedTeam.value = null
}
function clearGroups(){ remember(); groups.value = makeGroups(); commitGroups(); if(visualQa) window.__sxfQuickDrawInteraction = { action:'clear-draft',tournamentId:props.tournamentId,divisionId:divisionId.value,assigned:0,published:false,cloudWrite:false } }
function randomize(){
  remember()
  groups.value = makeGroups()
  const shuffled = [...teams.value].sort(() => Math.random() - .5)
  shuffled.forEach((team,index) => { const groupIndex = index % groupCount.value; const slotIndex = Math.floor(index / groupCount.value); if(slotIndex < teamsPerGroup.value) groups.value[groupIndex].slots[slotIndex] = team })
  commitGroups()
  if(visualQa) window.__sxfQuickDrawInteraction = { action:'randomize-draft',tournamentId:props.tournamentId,divisionId:divisionId.value,assigned:assigned.value,published:false,cloudWrite:false }
}
function undo(){ const previous = undoStack.value.pop(); if(previous) restore(previous) }
function back(){ router.push({ path:route.path, query:{ divisionId:divisionId.value, mode:'quick', view:'config' } }) }
function result(){ router.push({ path:route.path, query:{ divisionId:divisionId.value, mode:'quick', view:'result', format:'tournament' } }) }
async function load(){
  if(visualQa){ seedVisualQaGroups(); return }
  try{
    const [tournamentRecord,divisionRecords] = await Promise.all([
      queryById('tournaments',props.tournamentId),
      queryList('divisions',{ where:{ tournamentId:props.tournamentId },orderBy:{ createTime:'asc' },limit:100 })
    ])
    tournament.value = tournamentRecord
    divisionOptions.value = (divisionRecords || []).map(item => ({ id:String(item.id || item._id),name:item.name || '竞赛组别' }))
    if(!divisionOptions.value.some(item => item.id === divisionId.value) && divisionOptions.value.length) divisionId.value = divisionOptions.value[0].id
    const registrations = await queryList('tournament_teams',{ where:{ tournamentId:props.tournamentId,status:'approved' },limit:1000 })
    const scoped = registrations.filter(row => String(row.divisionId || 'default') === divisionId.value)
    const ids = scoped.map(row => row.teamId).filter(Boolean)
    const details = ids.length ? await queryList('teams',{ where:{ _id:{ $in:ids } },limit:1000 }) : []
    const lookup = new Map(details.map(row => [String(row._id),row]))
    teams.value = await Promise.all(scoped.map(async row => { const team=lookup.get(String(row.teamId)); const logoRef=String(team?.logoTransparentUrl || team?.logoTransparent || team?.logoUrl || team?.logo || team?.teamLogo || team?.logoFileId || team?.logoFileID || team?.avatarUrl || row.logoTransparentUrl || row.logoTransparent || row.logoUrl || row.logo || row.teamLogo || row.logoFileId || row.logoFileID || row.teamLogoFileId || ''); const logo=logoRef && !/^https?:\/\//i.test(logoRef) ? await getFileUrl(logoRef) : logoRef; return { id:String(row.teamId),name:String(team?.name || team?.teamName || row.teamName || '未命名球队'),region:String(team?.city || team?.region || ''),logo,logoUrl:logo,logoTransparentUrl:logo } }))
    const saved = await queryList('tournament_groups',{ where:{ tournamentId:props.tournamentId },limit:1000 })
    const current = saved.filter(row => String(row.divisionId || 'default') === divisionId.value && row.type === 'tournament' && row.status !== 'archived')
    if(current.length){ savedGroupCount.value=current.length; configuredGroupSizes.value=current.map(row => Number(row.maxTeams || row.teams?.length || 0)).filter(Boolean); savedTeamsPerGroup.value=Math.max(...configuredGroupSizes.value,4) }
    const byId = new Map(teams.value.map(team => [team.id,team]))
    groups.value = makeGroups().map(group => { const source=current.find(row => String(row.groupCode || '') === group.code); const capacity = Number(source?.maxTeams || group.slots.length || teamsPerGroup.value); const slots=Array.isArray(source?.teams) ? source.teams.map(item => item.teamId?.startsWith('bye-') ? { id:item.teamId, name:'轮空', teamName:'轮空', isBye:true } : byId.get(String(item.teamId)) || null).slice(0,capacity) : []; return { ...group,slots:[...slots,...Array(Math.max(0,capacity-slots.length)).fill(null)] } })
    publishScreenState()
  }catch(error){ teams.value=[]; groups.value=makeGroups(); ElMessage.error(error.message || '加载赛会制分组数据失败') }
}
async function persistGroups(status){
  if(visualQa){ window.__sxfQuickDrawAction = { action:status === 'confirmed' ? 'confirm' : 'save-draft',tournamentId:props.tournamentId,divisionId:divisionId.value,type:'tournament',groupCount:groupCount.value,teamsPerGroup:teamsPerGroup.value,assigned:assigned.value,published:false,deletedArchived:false,deletedOtherTypes:false }; return }
  const old = await queryList('tournament_groups',{ where:{ tournamentId:props.tournamentId },limit:1000 })
  const replaceable = old.filter(row => String(row.divisionId || 'default') === divisionId.value && row.type === 'tournament' && row.status !== 'archived')
  for(const row of replaceable) await deleteRecord('tournament_groups',row._id)
  const editKey = `sxf-draw-edit:${props.tournamentId}:${divisionId.value}`
  const modificationReason = sessionStorage.getItem(editKey) || ''
  for(const group of groups.value) await addRecord('tournament_groups',{ tournamentId:props.tournamentId,divisionId:divisionId.value,groupName:group.name,groupCode:group.code,maxTeams:teamsPerGroup.value,type:'tournament',status,teams:group.slots.filter(Boolean).map((team,index) => ({ teamId:team.id,teamName:team.name,seedOrder:index+1 })),modifiedFromConfirmed:Boolean(modificationReason),modificationReason,modificationSavedAt:modificationReason ? new Date() : null })
  if (modificationReason) sessionStorage.removeItem(editKey)
}
async function saveDraft(){
  saving.value = true
  try{ await persistGroups('draft'); ElMessage.success('当前组别分组草稿已保存') }catch(error){ ElMessage.error(error.message || '保存草稿失败') }finally{ saving.value=false }
}
async function proceedToResult(){
  if(pool.value.length) return
  if (availableByeCount.value) return ElMessage.warning(`还需添加 ${availableByeCount.value} 个轮空签`)
  try{
    if(visualQa) window.__sxfQuickDrawAction = { phase:'result-review-opened',action:'save-draft-for-review',tournamentId:props.tournamentId,divisionId:divisionId.value,type:'tournament',groupCount:groupCount.value,teamsPerGroup:teamsPerGroup.value,assigned:assigned.value,published:false,deletedArchived:false,deletedOtherTypes:false }
    await ElMessageBox.confirm('完成本轮抽签并保存为待确认结果吗？进入结果页后仍需再次点击“确认分组结果”。','进入分组结果',{type:'warning',confirmButtonText:'保存并查看结果',cancelButtonText:'继续调整'})
    confirming.value=true
    await persistGroups('draft')
    ElMessage.success('抽签结果已保存，等待最终确认')
    result()
  }catch(error){ if(error !== 'cancel') ElMessage.error(error.message || '保存抽签结果失败') }finally{ confirming.value=false }
}
if(visualQa) seedVisualQaGroups()
onMounted(() => {
  loadScreenConfig()
  if (typeof BroadcastChannel !== 'undefined') { drawChannel = new BroadcastChannel(drawChannelKey()); drawChannel.onmessage = event => { if (isScreen.value && event.data?.groups) screenGroups.value = event.data.groups } }
  window.addEventListener('storage', event => { if (isScreen.value && event.key === drawChannelKey()) { try { const state = JSON.parse(event.newValue || 'null'); if (state?.groups) screenGroups.value = state.groups } catch {} } })
  try { const saved = JSON.parse(localStorage.getItem(drawChannelKey()) || 'null'); if (saved?.groups) screenGroups.value = saved.groups } catch {}
  load().then(() => { if (!isScreen.value) publishScreenState() })
})
</script>

<style scoped>
.draw-screen{min-height:100vh;color:#eef8f1;background:radial-gradient(circle at top,#145c3a,#061d13 68%)}.draw-screen.theme-light{color:#17392a;background:linear-gradient(145deg,#f7fbf8,#dceee3)}.draw-screen>header{display:flex;align-items:center;justify-content:space-between;padding:28px 54px;border-bottom:1px solid rgba(255,255,255,.15)}.draw-screen.theme-light>header{border-bottom-color:#c3ddd0}.draw-screen>header strong{font-size:28px}.draw-screen>header span{color:#b8d8c5}.draw-screen.theme-light>header span{color:#4e7561}.draw-screen>main{width:min(1400px,calc(100% - 80px));margin:0 auto;padding:46px 0}.draw-screen h1{margin:0 0 8px;font-size:42px}.screen-progress{margin:0 0 28px;color:#b8d8c5}.theme-light .screen-progress{color:#4e7561}.screen-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}.screen-groups article{padding:20px;border:1px solid rgba(255,255,255,.18);border-radius:14px;background:rgba(255,255,255,.08)}.theme-light .screen-groups article{border-color:#b9d8c8;background:rgba(255,255,255,.58)}.screen-groups h2{display:flex;justify-content:space-between;margin:0 0 14px;color:#9df0bb}.theme-light .screen-groups h2{color:#08783c}.screen-groups h2 small{color:#d2e7d9;font-size:14px;font-weight:500}.theme-light .screen-groups h2 small{color:#4e7561}.screen-groups ol{margin:0;padding:0;list-style:none}.screen-groups li{display:flex;align-items:center;gap:12px;min-height:48px;border-top:1px solid rgba(255,255,255,.1)}.theme-light .screen-groups li{border-top-color:#d2e7dc}.screen-groups li b{width:36px;color:#9fcab0}.theme-light .screen-groups li b{color:#3d8960}.screen-groups li span{font-size:17px}.screen-groups li em{color:#88a494;font-style:normal}
.quick-tournament{min-height:100%;color:#18211b;background:#fafcfb}.event-context{display:flex;min-height:76px;align-items:center;justify-content:space-between;padding:0 30px;border-bottom:1px solid #e1e6e2;background:#fff}.event-context-main{display:flex;min-width:0;align-items:center;gap:13px}.event-context-main>strong{max-width:355px;overflow:hidden;font-size:21px;text-overflow:ellipsis;white-space:nowrap}.event-crest{display:grid;width:43px;height:50px;place-items:center;border:2px solid #183f2d;border-radius:13px 13px 18px 18px;color:#183f2d;background:#f3f8f4;font-size:22px}.event-meta{display:flex;align-items:center;gap:8px;padding-left:18px;border-left:1px solid #e1e6e2;color:#48534b;white-space:nowrap}.console-body{width:min(1340px,calc(100% - 48px));margin:0 auto;padding:20px 0 18px}.page-heading{display:flex;min-height:62px;align-items:center;justify-content:space-between}.page-heading>div{display:flex;align-items:baseline;gap:28px}.page-heading h1{margin:0;font-size:29px}.page-heading p{margin:0;color:#555f58;font-size:15px}.page-heading label{display:flex;align-items:center;gap:13px;font-size:15px;font-weight:650}.division-lock{display:flex;width:170px;min-height:38px;align-items:center;justify-content:space-between;box-sizing:border-box;padding:0 14px;border:1px solid #dce3de;border-radius:6px;background:#f7f9f7;color:#26352c;font-weight:600}.division-lock .el-icon{color:#748078}.flow-tabs{display:flex;height:52px;align-items:flex-end;gap:35px;border-bottom:1px solid #dce3de}.flow-tabs button,.flow-tabs strong{display:flex;height:52px;align-items:center;padding:0 24px;border:0;border-bottom:3px solid transparent;background:transparent;font-size:17px;cursor:pointer}.flow-tabs strong{border-bottom-color:#08783c;color:#08783c}.summary{display:flex;min-height:46px;align-items:center;gap:18px;margin-top:13px;padding:0 16px;border:1px solid #dfe5e1;border-radius:7px;background:#fff;font-size:14px}.summary span{white-space:nowrap}.summary i{height:18px;border-left:1px solid #dfe5e1}.summary em{color:#e56f16;font-style:normal}.summary .on{color:#08783c}.summary .el-button{margin-left:auto}.quick-tournament main{display:grid;grid-template-columns:270px 1fr;gap:12px;margin-top:12px}.team-pool,.groups-panel{height:516px;border:1px solid #dde4df;border-radius:8px;background:#fff}.team-pool{padding:14px}.team-pool h2,.groups-panel h2{margin:0;color:#08783c;font-size:22px}.team-pool h2 em{color:#08783c;font-style:normal}.team-pool>p{margin:4px 0 10px;color:#68736b;font-size:14px}.team-pool>small{display:block;margin:10px 0 6px;color:#68736b;font-size:13px}.team-pool ol,.groups-panel ol{margin:0;padding:0;list-style:none}.team-pool li{display:grid;grid-template-columns:32px 1fr 42px 18px;min-height:44px;align-items:center;gap:8px;border-bottom:1px solid #edf1ee;cursor:grab}.team-pool li b{overflow:hidden;font-size:14px;text-overflow:ellipsis;white-space:nowrap}.team-pool li small{overflow:hidden;color:#727c75;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.team-crest{display:grid;width:30px;height:30px;overflow:hidden;place-items:center;border:1px solid #dce7df;border-radius:50%;color:#08783c;background:#eaf4ec;font-size:12px}.team-crest img{display:block;width:100%;height:100%;object-fit:contain;background:#fff}.team-crest em{font-style:normal}.team-pool>button{display:flex;width:100%;align-items:center;justify-content:center;gap:5px;margin-top:7px;border:0;color:#606b63;background:transparent;font-size:13px;cursor:pointer}.groups-panel{position:relative;padding:15px}.groups-panel>header{display:flex;align-items:flex-start;justify-content:space-between}.groups-panel>header p{margin:7px 0 0;color:#667169;font-size:14px}.console-actions{display:flex;gap:8px}.console-actions .el-select{width:120px}.avoidance{display:flex;height:36px;align-items:center;justify-content:flex-end;gap:9px;color:#414c44;font-size:14px}.avoidance b{color:#08783c}.groups-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.groups-grid.filtered{grid-template-columns:minmax(280px,380px)}.groups-grid article{padding:10px 11px 6px;border:1px solid #dde4df;border-radius:7px}.groups-grid article>header{display:flex;align-items:center;justify-content:space-between}.groups-grid h3{margin:0;color:#08783c;font-size:17px}.groups-grid article>header>b{font-size:15px}.groups-grid li{display:flex;min-height:42px;align-items:center;gap:8px;border-bottom:1px solid #edf1ee;cursor:pointer}.groups-grid li>b{width:28px;font-size:14px}.groups-grid li strong{flex:1;overflow:hidden;font-size:14px;text-overflow:ellipsis;white-space:nowrap}.groups-grid li.empty{color:#98a29b}.groups-grid li.empty em{font-size:14px;font-style:normal}.validation-footer{display:flex;min-height:68px;align-items:center;justify-content:space-between;margin-top:12px;padding:0 16px;border:1px solid #dfe5e1;border-radius:8px;background:#fff;font-size:14px}.validation-footer>div{display:flex;align-items:center;gap:22px}.validation-footer span,.validation-footer em{display:flex;align-items:center;gap:7px;color:#08783c;font-style:normal}.validation-footer em{color:#e56f16}.validation-footer>div:last-child{position:relative}.validation-footer small{position:absolute;right:0;top:41px;width:230px;color:#747e77;text-align:center}
.summary{gap:12px;overflow:hidden}.groups-panel>header{flex-wrap:wrap;gap:10px}.groups-panel>header>div:first-child{min-width:180px}.groups-panel>header>div:first-child p{white-space:nowrap}.console-actions{flex:1;flex-wrap:wrap;justify-content:flex-end}.console-actions .el-button{white-space:nowrap}.console-actions .el-select{width:112px}@media(max-width:1200px){.console-actions{justify-content:flex-start}.summary{flex-wrap:wrap;padding-block:8px}.summary .el-button{margin-left:auto}}
.team-pool{overflow:hidden}.team-pool ol{max-height:350px;overflow-y:auto;padding-right:4px}.groups-grid li{min-height:58px;font-size:17px}.groups-grid li .team-crest{width:42px;height:42px}.groups-grid li strong{font-size:16px}.groups-grid li .team-crest img{width:100%;height:100%;object-fit:contain}@media(min-width:1400px){.groups-grid li{min-height:64px}.groups-grid li .team-crest{width:48px;height:48px}.groups-grid li strong{font-size:18px}}
</style>
