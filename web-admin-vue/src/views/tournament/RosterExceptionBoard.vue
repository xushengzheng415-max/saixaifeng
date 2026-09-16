<template>
  <div class="roster-exception-board" v-loading="loading">
    <section class="hero">
      <div>
        <el-button text class="back" @click="backTeams">← 返回参赛球队</el-button>

        <h1>实名与名单异常看板</h1>
        <p>{{ tournament.name || '当前赛事' }} · 仅展示已参赛球队的正式名单快照</p>
      </div>
      <div class="hero-actions">
        <el-button type="success" plain @click="router.push('/identity-reviews')">人证复核</el-button>
        <el-select v-model="activeDivisionId" clearable placeholder="全部组别" @change="loadBoard">
          <el-option v-for="item in divisions" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-button @click="loadBoard">刷新数据</el-button>
      </div>
    </section>

    <section class="stat-grid">
      <article class="stat-card primary"><span>参赛球队</span><strong>{{ rosterTeams }}</strong><small>当前赛事范围内的参赛关系</small></article>
      <article class="stat-card danger"><span>资料异常</span><strong>{{ counts.exception }}</strong><small>需核验或重新提交</small></article>
      <article class="stat-card warning"><span>待家长补充</span><strong>{{ counts.pending }}</strong><small>尚未满足正式名单条件</small></article>
      <article class="stat-card primary"><span>受影响名单</span><strong>{{ counts.affectedRosters }}</strong><small>当前赛事快照，不修改球队历史资料</small></article>
    </section>

    <section class="exception-workspace"><div class="exception-main"><section class="toolbar">
      <el-radio-group v-model="statusFilter">
        <el-radio-button value="all">全部 {{ rows.length }}</el-radio-button>
        <el-radio-button value="exception">资料异常 {{ counts.exception }}</el-radio-button>
        <el-radio-button value="pending">待补充 {{ counts.pending }}</el-radio-button>
      </el-radio-group>
      <el-input v-model="keyword" clearable placeholder="搜索球队或球员" class="search" />
    </section>

    <section class="table-card"><table v-if="filteredRows.length" class="exception-table"><thead><tr><th>球员</th><th>球队</th><th>组别</th><th>异常类型</th><th>系统判断</th><th>提交来源</th><th>处理</th></tr></thead><tbody><tr v-for="row in filteredRows" :key="row.id" @click="openDetail(row)"><td><b>{{ row.playerName }}</b><small v-if="row.jerseyNumber">证件尾号 {{ row.jerseyNumber }}</small></td><td><div class="team-cell"><img v-if="row.teamLogo" :src="row.teamLogo" alt="" /><span v-else class="crest">队</span><div><b>{{ row.teamName }}</b></div></div></td><td>{{ row.divisionName }}</td><td><el-tag v-for="item in row.missingItems" :key="item" size="small" effect="plain" class="issue">{{ item }}</el-tag></td><td>{{ row.statusText }}</td><td>家长</td><td><el-button type="success" plain size="small" @click.stop="openDetail(row)">查看处理</el-button></td></tr></tbody></table><el-empty v-else-if="!loading" description="当前筛选下没有名单资料异常" /></section></div>
    <aside class="exception-detail" v-if="activeRow"><div class="detail-title"><b>异常详情</b><button type="button" @click="selected=null">×</button></div><dl><dt>球员</dt><dd>{{ activeRow.playerName }}</dd><dt>球队</dt><dd>{{ activeRow.teamName }}</dd><dt>异常类型</dt><dd>{{ activeRow.missingItems.join('、') }}</dd><dt>系统判断</dt><dd>{{ activeRow.statusText }}</dd><dt>提交来源</dt><dd>家长</dd></dl><div class="detail-divider"></div><b>处理操作</b><el-radio-group v-model="handlingMode" class="handling-options"><el-radio value="return">退回至家长</el-radio><el-radio value="review">查看球队名单</el-radio></el-radio-group><el-input v-if="handlingMode === 'return'" v-model="returnReason" type="textarea" :rows="3" maxlength="100" show-word-limit placeholder="请输入退回原因（必填）" /><el-button type="success" class="confirm-handling" :loading="returning" @click="confirmHandling">确认处理</el-button></aside></section>

    <el-drawer v-model="drawerVisible" size="470px" :with-header="false">
      <div v-if="selected" class="drawer">
        <h2>{{ selected.playerName }}</h2><p class="muted">{{ selected.teamName }} · {{ selected.divisionName }}</p>
        <div class="detail-status"><el-tag :type="selected.profileStatus === 'exception' ? 'danger' : 'warning'">{{ selected.statusText }}</el-tag><span>{{ rosterStatusText(selected.rosterStatus) }}</span></div>
        <h3>需要处理</h3><div class="issue-list"><span v-for="item in selected.missingItems" :key="item">{{ item }}</span></div>
        <el-alert v-if="selected.returnReason" type="info" :closable="false" :title="`上次退回：${selected.returnReason}`" />
        <p class="explain">退回只改变本赛事这份正式名单快照，不会覆盖球队日常球员资料；球队可在小程序补齐资料后重新提交。</p>
        <el-button v-if="selected.rosterStatus === 'submitted'" type="danger" plain @click="openReturnDialog">退回整份名单</el-button>
        <el-button v-else @click="goTeam">查看球队名单</el-button>
      </div>
    </el-drawer>

    <el-dialog v-model="returnVisible" title="退回正式名单" width="480px">
      <p>将退回 {{ selected?.teamName }} 的本赛事正式名单，请说明球队需要补齐或修正的内容。</p>
      <el-input v-model="returnReason" type="textarea" :rows="4" maxlength="300" show-word-limit placeholder="例如：请补齐缺失球员的实名资料和标准形象照" />
      <template #footer><el-button @click="returnVisible = false">取消</el-button><el-button type="danger" :loading="returning" @click="returnRoster">确认退回</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { rosterExceptionBoard } from '../../utils/cloud'
import { getVisualQaSnapshot, visualQaActive } from '../../utils/visualQaFixtures'

const route = useRoute(), router = useRouter(), tournamentId = String(route.params.id || '')
const visualQaSnapshot = typeof window !== 'undefined' && window.location.hostname === '127.0.0.1' && visualQaActive() ? getVisualQaSnapshot() : null
const qaRows = (visualQaSnapshot?.players || []).filter(player => player.profileStatus !== 'complete').map((player, index) => ({ id: `qa-exception-${player._id}`, snapshotId: 'qa-roster-snapshot', teamId: 'qa-team-zhengzhou', teamName: '郑州劲风U16', teamLogo: '/admin/logo-saixiaofeng.png', divisionId: 'qa-division-u16', divisionName: 'U16组', playerName: player.name, jerseyNumber: player.jerseyNumber, position: player.position, missingItems: index === 0 ? ['证件照片不清晰', '实名核验失败'] : ['标准形象照待补充'], profileStatus: player.profileStatus, statusText: player.profileStatus === 'exception' ? '资料异常' : '待补充', rosterStatus: 'submitted', rosterVersion: 3 }))
const loading = ref(false), returning = ref(false), rows = ref(qaRows), divisions = ref(visualQaSnapshot?.divisions || []), activeDivisionId = ref(String(route.query.divisionId || ''))
const counts = ref(visualQaSnapshot ? { exception: qaRows.filter(row => row.profileStatus === 'exception').length, pending: qaRows.filter(row => row.profileStatus === 'pending').length, affectedRosters: 1 } : { exception: 0, pending: 0, affectedRosters: 0 }), tournament = ref(visualQaSnapshot?.tournament || {}), statusFilter = ref('all'), keyword = ref('')
const drawerVisible = ref(false), returnVisible = ref(false), selected = ref(qaRows[0] || null), returnReason = ref(''), handlingMode = ref('return')
const activeRow = computed(() => selected.value || filteredRows.value[0] || null)
const rosterTeams = computed(() => new Set(rows.value.map(row => row.teamId)).size)
const filteredRows = computed(() => rows.value.filter(row => {
  const matchesStatus = statusFilter.value === 'all' || row.profileStatus === statusFilter.value
  const text = `${row.teamName} ${row.playerName} ${row.divisionName}`.toLowerCase()
  return matchesStatus && (!keyword.value || text.includes(keyword.value.trim().toLowerCase()))
}))
function rosterStatusText(status) { return ({ submitted: '待审核', returned: '已退回', approved: '已通过', locked: '已锁定', draft: '草稿' })[status] || status || '草稿' }
function openDetail(row) { selected.value = row }
function openReturnDialog() {
  if (!returnReason.value.trim()) return ElMessage.warning('请填写明确的退回原因')
  returnVisible.value = true
}
function confirmHandling() {
  if (handlingMode.value === 'review') return goTeam()
  openReturnDialog()
}
function backTeams() { router.push({ path: `/tournaments/${tournamentId}/teams`, query: { ...(activeDivisionId.value ? { divisionId: activeDivisionId.value } : {}), mode: 'professional' } }) }
function goTeam() { if (selected.value) router.push({ path: `/tournaments/${tournamentId}/teams/${selected.value.teamId}/players`, query: { ...(activeDivisionId.value ? { divisionId: activeDivisionId.value } : {}), mode: 'professional' } }) }
async function loadBoard() {
  loading.value = true
  try {
    const result = await rosterExceptionBoard({ tournamentId, divisionId: activeDivisionId.value, rosterAction: 'list' })
    if (!result?.success) throw new Error(result?.error || '加载名单异常失败')
    rows.value = result.rows || []; counts.value = result.counts || counts.value; tournament.value = result.tournament || {}; divisions.value = result.divisions || []
  } catch (error) { rows.value = []; ElMessage.error(error.message || '加载失败') } finally { loading.value = false }
}
async function returnRoster() {
  if (!returnReason.value.trim() || !selected.value) return ElMessage.warning('请填写明确的退回原因')
  returning.value = true
  try {
    const result = await rosterExceptionBoard({ tournamentId, rosterAction: 'returnRoster', snapshotId: selected.value.snapshotId, reason: returnReason.value })
    if (!result?.success) throw new Error(result?.error || '退回失败')
    ElMessage.success(result.message || '名单已退回'); returnVisible.value = false; drawerVisible.value = false; await loadBoard()
  } catch (error) { ElMessage.error(error.message || '退回失败') } finally { returning.value = false }
}
onMounted(loadBoard)
</script>

<style scoped>
.roster-exception-board{min-height:100%;padding:22px 28px 38px;background:#fff;color:#1e2b3b}.hero{min-height:auto;padding:8px 2px 18px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e6ece7;background:#fff;color:#1e2b3b;box-shadow:none}.hero h1{margin:6px 0;font-size:30px}.hero p{margin:0;color:#718075}.eyebrow{margin:0;color:#16834b;font-size:12px;letter-spacing:1.5px;font-weight:700}.back{padding:0;color:#16834b}.hero-actions{display:flex;gap:10px}.stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:18px 0}.stat-card{padding:16px 22px;border:1px solid #e2e8e3;border-radius:9px;background:#fff;box-shadow:none}.stat-card span,.stat-card small{display:block;color:#708092}.stat-card strong{display:block;margin:4px 0;font-size:28px;color:#16834b}.stat-card.danger strong{color:#e98a16}.stat-card.warning strong{color:#d98d24}.exception-workspace{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:16px;align-items:start}.toolbar{display:flex;justify-content:space-between;align-items:center;margin:0 0 12px}.search{width:250px}.table-card{background:#fff;border:1px solid #e4ebe6;border-radius:8px;overflow:auto;box-shadow:none}.exception-table{width:100%;min-width:900px;border-collapse:collapse}.exception-table th{height:46px;padding:0 14px;background:#f8faf8;color:#526071;text-align:left;font-size:13px}.exception-table td{height:64px;padding:0 14px;border-top:1px solid #edf0ed;font-size:13px;vertical-align:middle}.exception-table tbody tr{cursor:pointer}.exception-table tbody tr:hover td{background:#f7fcf9}.team-cell{display:flex;align-items:center;gap:8px}.team-cell img,.crest{width:32px;height:32px;object-fit:contain;border-radius:50%;background:#e8f5f4}.team-cell small,.exception-table small{display:block;margin-top:3px;color:#80909d;font-size:12px}.issue{margin:2px}.exception-detail{padding:18px;border:1px solid #e4ebe6;border-radius:8px;background:#fff}.detail-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.detail-title button{border:0;background:transparent;color:#8b968e;font-size:22px;cursor:pointer}.exception-detail dl{display:grid;grid-template-columns:72px 1fr;gap:11px;margin:0;font-size:13px}.exception-detail dt{color:#849087}.exception-detail dd{margin:0;color:#344238;line-height:1.45}.detail-divider{height:1px;margin:18px 0;background:#e8ece9}.handling-options{display:grid;gap:10px;margin:14px 0}.confirm-handling{width:100%;margin-top:14px}.drawer{padding:18px 12px}.drawer h2{margin:8px 0 2px}.muted{color:#778595}.detail-status{display:flex;gap:10px;align-items:center;margin:24px 0}.drawer h3{font-size:15px}.issue-list{display:flex;flex-wrap:wrap;gap:8px}.issue-list span{padding:6px 10px;border-radius:8px;background:#fff1e8;color:#bc6523;font-size:13px}.explain{margin:24px 0;color:#687789;line-height:1.7;font-size:13px}@media(max-width:1100px){.exception-workspace{grid-template-columns:1fr}.stat-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:900px){.hero{align-items:flex-start;gap:20px;flex-direction:column}.stat-grid{grid-template-columns:1fr}.toolbar{align-items:flex-start;gap:12px;flex-direction:column}.search{width:100%}}
</style>
