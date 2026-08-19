<template>
  <main class="referee-workbench" v-loading="loading">
    <header v-if="tournament" class="event-context">
      <div class="event-main">
        <span class="event-mark"><el-icon><Trophy /></el-icon></span>
        <strong>{{ tournament.name || tournament.tournamentName }}</strong>
        <el-tag effect="plain" type="primary">{{ divisionCount }} 个组别</el-tag>
        <el-tag effect="plain" type="success">进行中</el-tag>
        <span><el-icon><Calendar /></el-icon>{{ eventDates }}</span>
        <span><el-icon><Location /></el-icon>{{ tournament.province || tournament.location || '举办地待定' }}</span>
      </div>
      <el-button plain @click="router.push('/tournament-space')"><el-icon><SwitchButton /></el-icon>退出赛事空间</el-button>
    </header>

    <section class="work-area">
      <div class="title-row">
        <div><h1>裁判管理</h1><p>统一管理裁判资料、执裁资格、可用状态与赛事指派。</p></div>
        <div class="title-actions"><el-button plain type="success" @click="exportList"><el-icon><Download /></el-icon>导出裁判名单</el-button><el-button type="success" @click="addDialog = true"><el-icon><Plus /></el-icon>添加裁判</el-button></div>
      </div>

      <el-alert class="qualification-note" type="success" :closable="false" show-icon title="仅通过资格审核且处于可用状态的裁判，可被指派至赛事场次。" />

      <section class="stats">
        <article><el-icon><UserFilled /></el-icon><div>全部裁判<strong>{{ referees.length }}</strong></div></article>
        <article><el-icon><Aim /></el-icon><div>可执裁<strong>{{ availableCount }}</strong></div></article>
        <article><el-icon><Calendar /></el-icon><div>已指派场次<strong>{{ assignedMatchCount }}</strong></div></article>
        <article class="pending"><el-icon><DocumentChecked /></el-icon><div>待审核<strong>{{ pendingCount }}</strong></div></article>
      </section>

      <section class="toolbar">
        <el-radio-group v-model="statusFilter"><el-radio-button label="all">全部　{{ referees.length }}</el-radio-button><el-radio-button label="available">可执裁　{{ availableCount }}</el-radio-button><el-radio-button label="assigned">已指派　{{ assignedCount }}</el-radio-button><el-radio-button label="pending">待审核　{{ pendingCount }}</el-radio-button></el-radio-group>
        <el-select v-model="levelFilter" clearable placeholder="裁判等级"><el-option v-for="level in levels" :key="level" :label="level" :value="level" /></el-select>
        <el-select v-model="availabilityFilter" clearable placeholder="可用状态"><el-option label="可执裁" value="available" /><el-option label="已指派" value="assigned" /><el-option label="待审核" value="pending" /></el-select>
        <el-input v-model="keyword" clearable placeholder="搜索姓名或手机号"><template #prefix><el-icon><Search /></el-icon></template></el-input>
        <el-button plain type="success" @click="openBatch"><el-icon><Calendar /></el-icon>批量指派赛事</el-button>
      </section>

      <section class="table-panel">
        <table><thead><tr><th></th><th>裁判</th><th>等级 / 资格</th><th>可用时间</th><th>本届执裁</th><th>当前状态</th><th>已指派赛事</th><th>操作</th></tr></thead>
          <tbody><tr v-for="referee in filteredReferees" :key="referee._id">
            <td><el-checkbox :model-value="selectedIds.includes(referee._id)" @change="toggleSelected(referee._id, $event)" /></td>
            <td><div class="person"><el-avatar :src="referee.avatarUrl"><el-icon><UserFilled /></el-icon></el-avatar><span><strong>{{ referee.name || referee.realName }}</strong><small>{{ maskPhone(referee.phone || referee.phoneNumber) }}</small></span></div></td>
            <td><strong>{{ referee.level || referee.refereeLevel || '未定级' }}</strong><small>{{ referee.qualification || referee.certificateName || '资格资料待补充' }}</small></td>
            <td><span>{{ tournament?.startDate || '未设置' }}</span><small>～ {{ tournament?.endDate || '未设置' }}</small></td>
            <td>{{ assignmentCount(referee) }} 场</td><td><span class="state" :class="stateOf(referee)"><i />{{ stateLabel(stateOf(referee)) }}</span></td><td>{{ assignmentCount(referee) }} 场比赛</td>
            <td class="row-actions"><el-button @click="showProfile(referee)">查看资料</el-button><el-button v-if="stateOf(referee) === 'pending'" type="warning" plain @click="approve(referee)">审核资格</el-button><el-button v-else type="success" plain @click="openAssign(referee)">指派场次</el-button></td>
          </tr></tbody>
        </table>
      </section>
      <el-alert class="bottom-note" type="success" :closable="false" show-icon title="赛事指派后，裁判将在移动端收到待执行场次；临近开赛时支持替补裁判调度。" />
    </section>

    <div v-if="assignDialog || route.query.assignment" class="modal-mask" @click.self="closeAssign"><section class="work-modal assignment-modal"><header><strong>{{ batchMode ? '批量指派赛事' : '指派裁判场次' }}</strong><button type="button" aria-label="关闭" @click="closeAssign">×</button></header><p class="modal-hint">请选择同一赛制的场次并完整安排四人裁判组；已锁定电子记录的场次不会被覆盖。</p><div class="match-pick-list"><label v-for="match in assignableMatches" :key="match._id" :class="{ locked: match.refereeRecordLocked }"><input v-model="selectedMatches" type="checkbox" :value="match" :disabled="match.refereeRecordLocked" /><span><strong>{{ match.matchSequence }}</strong>　{{ match.homeTeamName || '待定' }} vs {{ match.awayTeamName || '待定' }}</span><small>{{ match.matchDate }} {{ match.matchTime }} · {{ match.refereeRecordLocked ? '记录已锁定' : '可指派' }}</small></label></div><div class="assign-form"><label v-for="role in roles" :key="role.key">{{ role.label }}<el-select v-model="crew[role.key]" filterable clearable :placeholder="`请选择${role.label}`"><el-option v-for="referee in approvedReferees" :key="referee._id" :label="`${referee.name || referee.realName} · ${referee.level || referee.refereeLevel || '未定级'}`" :value="referee._id" /></el-select></label></div><footer><el-button @click="closeAssign">取消</el-button><el-button type="success" :loading="saving" @click="saveAssignment">确认指派</el-button></footer></section></div>
    <div v-if="profileDialog" class="modal-mask" @click.self="profileDialog = false"><section class="work-modal compact-modal"><header><strong>裁判资料</strong><button type="button" aria-label="关闭" @click="profileDialog = false">×</button></header><dl><dt>姓名</dt><dd>{{ activeReferee.name || activeReferee.realName }}</dd><dt>手机</dt><dd>{{ activeReferee.phone || activeReferee.phoneNumber || '未填写' }}</dd><dt>裁判等级</dt><dd>{{ activeReferee.level || activeReferee.refereeLevel || '未定级' }}</dd><dt>资格证书</dt><dd>{{ activeReferee.qualification || activeReferee.certificateName || '待补充' }}</dd></dl></section></div>
    <div v-if="addDialog" class="modal-mask" @click.self="addDialog = false"><section class="work-modal compact-modal"><header><strong>添加裁判</strong><button type="button" aria-label="关闭" @click="addDialog = false">×</button></header><div class="add-form"><label>姓名<el-input v-model="newReferee.name" /></label><label>手机号<el-input v-model="newReferee.phone" maxlength="11" /></label><label>裁判等级<el-select v-model="newReferee.level"><el-option v-for="level in levels" :key="level" :label="level" :value="level" /></el-select></label><label>资格证书<el-input v-model="newReferee.qualification" /></label></div><footer><el-button @click="addDialog = false">取消</el-button><el-button type="success" :loading="saving" @click="createReferee">保存并进入待审核</el-button></footer></section></div>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Aim, Calendar, DocumentChecked, Download, Location, Plus, Search, SwitchButton, Trophy, UserFilled } from '@element-plus/icons-vue'
import { addRecord, callFunction, queryList, updateRecord } from '../../utils/cloud'
import { getVisualQaSnapshot, visualQaActive } from '../../utils/visualQaFixtures'

const route = useRoute(), router = useRouter()
const qaSnapshot = import.meta.env.DEV && visualQaActive() ? getVisualQaSnapshot() : null
const tournaments = ref(qaSnapshot?.tournament ? [qaSnapshot.tournament] : []), referees = ref(qaSnapshot?.referees || []), matches = ref(qaSnapshot?.matches || []), selectedTournamentId = ref(String(route.query.tournamentId || qaSnapshot?.tournament?._id || ''))
const loading = ref(false), saving = ref(false), keyword = ref(''), statusFilter = ref('all'), levelFilter = ref(''), availabilityFilter = ref('')
const selectedIds = ref([]), selectedMatches = ref([]), assignDialog = ref(false), profileDialog = ref(false), addDialog = ref(false), batchMode = ref(false), activeReferee = ref({})
const crew = ref({ mainReferee: '', assistant1: '', assistant2: '', fourthOfficial: '' }), newReferee = ref({ name: '', phone: '', level: '', qualification: '' })
const levels = ['国家级', '国家一级', '国家二级', '一级', '二级', '三级']
const roles = [{ key: 'mainReferee', label: '主裁判' }, { key: 'assistant1', label: '第一助理裁判' }, { key: 'assistant2', label: '第二助理裁判' }, { key: 'fourthOfficial', label: '第四官员' }]
const tournament = computed(() => tournaments.value.find(item => item._id === selectedTournamentId.value) || tournaments.value[0] || null)
const divisionCount = computed(() => tournament.value?.divisions?.length || 1)
const eventDates = computed(() => [tournament.value?.startDate, tournament.value?.endDate].filter(Boolean).join('—') || '日期待定')
const assignedRefereeIds = computed(() => new Set(matches.value.flatMap(match => Object.values(match.refereeCrew || {}).map(person => typeof person === 'string' ? person : person?._id)).filter(Boolean)))
  const stateOf = referee => referee.status === 'pending' || referee.auditStatus === 'pending' ? 'pending' : referee.availabilityStatus || (assignedRefereeIds.value.has(referee._id) ? 'assigned' : 'available')
const stateLabel = state => ({ available: '可执裁', assigned: '已指派', pending: '待审核' })[state] || state
const assignmentCount = referee => matches.value.filter(match => Object.values(match.refereeCrew || {}).some(person => (typeof person === 'string' ? person : person?._id) === referee._id)).length
const availableCount = computed(() => referees.value.filter(item => stateOf(item) === 'available').length)
const assignedCount = computed(() => referees.value.filter(item => stateOf(item) === 'assigned').length)
const pendingCount = computed(() => referees.value.filter(item => stateOf(item) === 'pending').length)
const assignedMatchCount = computed(() => matches.value.filter(match => Object.keys(match.refereeCrew || {}).length > 0).length)
const approvedReferees = computed(() => referees.value.filter(item => stateOf(item) !== 'pending'))
const assignableMatches = computed(() => matches.value.filter(match => !['finished', 'completed', 'cancelled'].includes(match.status)))
const filteredReferees = computed(() => referees.value.filter(item => { const state = stateOf(item); const text = `${item.name || item.realName || ''}${item.phone || item.phoneNumber || ''}`; return (statusFilter.value === 'all' || state === statusFilter.value) && (!availabilityFilter.value || state === availabilityFilter.value) && (!levelFilter.value || (item.level || item.refereeLevel) === levelFilter.value) && (!keyword.value || text.includes(keyword.value.trim())) }))
function maskPhone(phone) { const value = String(phone || ''); return value.length === 11 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value || '未填写' }
function toggleSelected(id, checked) { selectedIds.value = checked ? [...new Set([...selectedIds.value, id])] : selectedIds.value.filter(item => item !== id) }
function showProfile(referee) { activeReferee.value = referee; profileDialog.value = true }
function openAssign(referee) { batchMode.value = false; selectedMatches.value = []; crew.value = { mainReferee: referee._id, assistant1: '', assistant2: '', fourthOfficial: '' }; assignDialog.value = true; router.replace({ query: { ...route.query, assignment: referee._id } }) }
function openBatch() { const selected = referees.value.filter(item => selectedIds.value.includes(item._id)); if (!selected.length) return ElMessage.warning('请先勾选需要指派的裁判'); batchMode.value = true; selectedMatches.value = []; crew.value = { mainReferee: selected[0]?._id || '', assistant1: selected[1]?._id || '', assistant2: selected[2]?._id || '', fourthOfficial: selected[3]?._id || '' }; assignDialog.value = true; router.replace({ query: { ...route.query, assignment: 'batch' } }) }
  async function closeAssign() { assignDialog.value = false; const { assignment, ...query } = route.query; await router.replace({ query }) }
async function load() { if (qaSnapshot) return; loading.value = true; try { const [events, people] = await Promise.all([queryList('tournaments', { orderBy: { createTime: 'desc' }, limit: 100 }), queryList('referees', { orderBy: { createTime: 'desc' }, limit: 500 })]); tournaments.value = events || []; if (!selectedTournamentId.value) selectedTournamentId.value = tournaments.value[0]?._id || ''; matches.value = selectedTournamentId.value ? await queryList('matches', { where: { tournamentId: selectedTournamentId.value }, orderBy: { matchDate: 'asc', matchTime: 'asc' }, limit: 500 }) : []; referees.value = people || [] } finally { loading.value = false } }
  async function saveAssignment() { if (!selectedMatches.value.length) return ElMessage.warning('请选择需要指派的场次'); if (!crew.value.mainReferee) return ElMessage.warning('请至少指定主裁判'); saving.value = true; try { const selected = Object.fromEntries(Object.entries(crew.value).filter(([, id]) => id).map(([role, id]) => { const referee = referees.value.find(item => item._id === id); return [role, { _id: id, name: referee?.name || referee?.realName || '' }] })); for (const match of selectedMatches.value) await callFunction('updateMatch', { matchId: match._id, data: { tournamentId: selectedTournamentId.value, refereeCrew: selected } }); await load(); await closeAssign(); ElMessage.success('裁判指派已保存') } catch (error) { ElMessage.error(error.message || '指派保存失败') } finally { saving.value = false } }
async function approve(referee) { saving.value = true; try { await updateRecord('referees', referee._id, { status: 'approved', auditStatus: 'approved' }); await load(); ElMessage.success('资格审核已通过') } catch (error) { ElMessage.error(error.message || '审核失败') } finally { saving.value = false } }
async function createReferee() { if (!newReferee.value.name || !newReferee.value.phone) return ElMessage.warning('请填写姓名和手机号'); saving.value = true; try { await addRecord('referees', { ...newReferee.value, status: 'pending', auditStatus: 'pending', tournamentId: selectedTournamentId.value }); newReferee.value = { name: '', phone: '', level: '', qualification: '' }; addDialog.value = false; await load(); ElMessage.success('裁判已加入待审核列表') } catch (error) { ElMessage.error(error.message || '添加失败') } finally { saving.value = false } }
function exportList() { ElMessage.info('导出名单已准备，正式导出将按当前赛事与筛选范围生成') }
onMounted(load)
</script>

<style scoped>
.referee-workbench{min-height:100%;background:#f7f9f8;color:#17211c}.event-context{height:90px;padding:0 36px;display:flex;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #e5e9e7}.event-main{display:flex;align-items:center;gap:16px;min-width:0}.event-mark{width:42px;height:48px;display:grid;place-items:center;border-radius:8px;background:#edf6ee;color:#087b45;font-size:25px}.event-main strong{font-size:21px;white-space:nowrap}.event-main>span:not(.event-mark){display:flex;align-items:center;gap:6px;color:#66736b}.work-area{padding:28px 36px 26px}.title-row{display:flex;justify-content:space-between;align-items:center}.title-row h1{margin:0;font-size:32px;line-height:1.15}.title-row p{margin:9px 0 0;color:#66736b;font-size:16px}.title-actions{display:flex;gap:14px}.qualification-note{margin-top:22px}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:26px;margin:25px 0}.stats article{height:100px;padding:0 28px;display:flex;align-items:center;gap:26px;background:#fff;border:1px solid #dce4df;border-radius:8px}.stats .el-icon{font-size:39px;color:#087b45}.stats article>div{display:flex;flex-direction:column;font-size:16px}.stats strong{margin-top:4px;color:#111;font-size:31px;line-height:1}.stats .pending{border-color:#f0bd72}.stats .pending .el-icon{color:#f1a129}.toolbar{display:grid;grid-template-columns:auto 150px 150px 235px 166px;gap:16px;align-items:center;margin-bottom:20px}.table-panel{overflow:hidden;border:1px solid #efd3a7;border-radius:8px;background:#fff}.table-panel table{width:100%;border-collapse:collapse;table-layout:fixed}.table-panel th{height:50px;padding:0 14px;background:#fffaf4;color:#26342b;font-size:15px;text-align:left}.table-panel td{height:62px;padding:9px 14px;border-top:1px solid #edf0ee;font-size:14px;vertical-align:middle}.table-panel th:first-child,.table-panel td:first-child{width:46px;padding:0;text-align:center}.table-panel th:nth-child(2){width:15%}.table-panel th:nth-child(3){width:16%}.table-panel th:nth-child(4){width:14%}.table-panel th:nth-child(5){width:8%}.table-panel th:nth-child(6){width:10%}.table-panel th:nth-child(7){width:10%}.table-panel th:nth-child(8){width:18%}.person{display:flex;align-items:center;gap:12px}.person span{display:flex;flex-direction:column;gap:4px}.person small,.table-panel td small{display:block;margin-top:4px;color:#6c7871}.state{display:flex;align-items:center;gap:8px}.state i{width:8px;height:8px;border-radius:50%;background:#0a8243}.state.assigned{color:#1472d0}.state.assigned i{background:#1472d0}.state.pending{color:#eb8618}.state.pending i{background:#eb8618}.row-actions{white-space:nowrap}.row-actions .el-button+.el-button{margin-left:7px}.bottom-note{margin-top:18px}.modal-mask{position:fixed;z-index:3000;inset:0;display:grid;place-items:center;padding:32px;background:rgba(12,27,19,.48)}.work-modal{width:min(820px,100%);max-height:calc(100vh - 64px);overflow:auto;border-radius:12px;background:#fff;box-shadow:0 24px 64px rgba(0,31,19,.28)}.work-modal>header{height:64px;padding:0 24px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e6ebe8;font-size:19px}.work-modal>header button{border:0;background:none;color:#718078;font-size:28px;cursor:pointer}.modal-hint{margin:18px 22px;padding:12px 14px;border-radius:6px;background:#edf8ee;color:#377a4d;font-size:13px}.match-pick-list{margin:0 22px;border:1px solid #e5ebe7;border-radius:8px;overflow:auto;max-height:200px}.match-pick-list label{display:grid;grid-template-columns:24px 1fr auto;gap:10px;align-items:center;min-height:48px;padding:8px 12px;border-bottom:1px solid #edf1ee;cursor:pointer}.match-pick-list label:last-child{border:0}.match-pick-list label.locked{color:#9aa49f;background:#f7f8f7;cursor:not-allowed}.match-pick-list small{color:#708078}.assign-form,.add-form{display:grid;grid-template-columns:1fr 1fr;gap:16px 18px;padding:20px 22px}.assign-form label,.add-form label{display:grid;gap:7px;color:#48564e;font-size:14px}.assign-form .el-select,.add-form .el-select{width:100%}.work-modal footer{display:flex;justify-content:flex-end;gap:12px;padding:16px 22px;border-top:1px solid #e6ebe8}.compact-modal{width:min(520px,100%)}.compact-modal dl{display:grid;grid-template-columns:104px 1fr;gap:0;margin:20px 22px;border:1px solid #e6ebe8;border-radius:8px;overflow:hidden}.compact-modal dt,.compact-modal dd{margin:0;padding:12px 14px;border-bottom:1px solid #e6ebe8}.compact-modal dt{background:#f8faf8;color:#6d7972}.compact-modal dd:nth-last-child(-n+1),.compact-modal dt:nth-last-child(-n+2){border-bottom:0}@media(max-width:1280px){.stats{gap:14px}.toolbar{grid-template-columns:1fr 1fr 1fr}.toolbar .el-radio-group{grid-column:1/-1}.event-main>span:not(.event-mark){display:none}}
</style>
