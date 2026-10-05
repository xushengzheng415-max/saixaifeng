<template>
  <main class="result-page">
    <header><h1>补录成绩</h1><span>{{ tournamentName }}</span></header>
    <el-alert v-if="error" type="error" :title="error" :closable="false"><el-button link @click="load">重试</el-button></el-alert>
    <div v-if="loading" class="state">加载中…</div>
    <template v-else><div v-if="!matches.length" class="state">暂无比赛</div><div v-for="match in matches" :key="match.id" class="row"><span><strong class="match-teams"><span class="match-team"><img v-if="match.homeLogo" :src="match.homeLogo" :alt="match.homeName" /><i v-else>{{ teamInitial(match.homeName) }}</i>{{ match.homeName }}</span><em>{{ score(match) }}</em><span class="match-team"><img v-if="match.awayLogo" :src="match.awayLogo" :alt="match.awayName" /><i v-else>{{ teamInitial(match.awayName) }}</i>{{ match.awayName }}</span></strong><small>{{ match.date }} {{ match.time }} · {{ match.divisionName }} · {{ status(match) }}</small></span><el-button v-if="canSupplement(match)" type="primary" plain @click="open(match)">补录</el-button></div></template>
    <el-dialog v-model="dialog" title="补录成绩" width="520px" :close-on-click-modal="false">
      <div v-if="selected" class="form"><strong>{{ selected.homeName }} 对 {{ selected.awayName }}</strong><div class="scores"><el-input v-model="homeScore" type="number" min="0" max="99" :placeholder="selected.homeName" /><span>:</span><el-input v-model="awayScore" type="number" min="0" max="99" :placeholder="selected.awayName" /></div><template v-if="knockout && homeScore !== '' && awayScore !== '' && Number(homeScore) === Number(awayScore)"><el-select v-model="resolution" placeholder="决胜方式"><el-option label="点球大战" value="penalties" /><el-option label="加时赛" value="extra_time" /></el-select><el-select v-model="winnerTeamId" placeholder="晋级球队"><el-option :label="selected.homeName" :value="selected.homeTeamId" /><el-option :label="selected.awayName" :value="selected.awayTeamId" /></el-select></template><label>纸质比赛记录（1–2 张）<input type="file" accept="image/*" multiple @change="chooseEvidence" /></label><div v-for="(file, index) in evidence" :key="file.fileId" class="file">{{ file.name }}<el-button link @click="evidence.splice(index, 1)">移除</el-button></div><el-input v-model="note" type="textarea" maxlength="300" placeholder="备注（选填）" /></div>
      <template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" :loading="saving" @click="submit">确认并归档</el-button></template>
    </el-dialog>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { callFunction, uploadImageViaWebApi } from '@/utils/cloud'

const tournamentId = String(useRoute().params.id || '')
const tournamentName = ref(''), orgId = ref(''), matches = ref([]), loading = ref(true), saving = ref(false), error = ref(''), dialog = ref(false), selected = ref(null)
const homeScore = ref(''), awayScore = ref(''), resolution = ref(''), winnerTeamId = ref(''), note = ref(''), evidence = ref([])
const knockout = computed(() => /knockout|elimination|淘汰/i.test(selected.value?.phase || ''))
const canSupplement = match => ['finished', 'completed', 'ended', 'pending_result', 'pending_review'].includes(String(match.status).toLowerCase()) && !match.hasRefereeRecord && !match.hasResult
const status = match => match.hasResult ? '已有赛果' : match.hasRefereeRecord ? '待复核' : canSupplement(match) ? '待补录' : '待比赛'
const score = match => match.homeScore == null || match.awayScore == null ? '— : —' : `${match.homeScore} : ${match.awayScore}`
const teamInitial = name => String(name || '队').trim().slice(0, 1) || '队'
async function load() {
  loading.value = true; error.value = ''
  try { const result = await callFunction('resultCenter', { action: 'staffMatches', tournamentId }); if (!result?.success) throw new Error(result?.message || '加载失败'); matches.value = result.matches || []; orgId.value = result.orgId || ''; tournamentName.value = result.tournament?.name || '' }
  catch (cause) { error.value = cause.message || '加载失败' }
  finally { loading.value = false }
}
function open(match) { selected.value = match; homeScore.value = ''; awayScore.value = ''; resolution.value = ''; winnerTeamId.value = ''; note.value = ''; evidence.value = []; dialog.value = true }
async function chooseEvidence(event) {
  const files = Array.from(event.target.files || []).slice(0, 2 - evidence.value.length)
  event.target.value = ''
  for (const file of files) {
    if (file.size > 8 * 1024 * 1024) { ElMessage.error('图片不能超过 8MB'); continue }
    try { const response = await uploadImageViaWebApi(`match-result-evidence/${orgId.value}/${selected.value.id}`, file, tournamentId); evidence.value.push({ fileId: response.fileId, name: file.name }) }
    catch (cause) { ElMessage.error(cause.message || '上传失败') }
  }
}
async function submit() {
  if (!selected.value || saving.value) return
  const scores = [homeScore.value, awayScore.value].map(Number)
  if ([homeScore.value, awayScore.value].some(value => value === '') || scores.some(value => !Number.isInteger(value) || value < 0 || value > 99)) return ElMessage.error('请输入 0 至 99 的整数比分')
  if (evidence.value.length < 1 || evidence.value.length > 2) return ElMessage.error('请上传 1 至 2 张纸质比赛记录')
  if (knockout.value && scores[0] === scores[1] && (!resolution.value || !winnerTeamId.value)) return ElMessage.error('请选择决胜方式和晋级球队')
  try {
    await ElMessageBox.confirm(`${selected.value.homeName} ${scores[0]} : ${scores[1]} ${selected.value.awayName}。确认后成为正式赛果。`, '确认归档', { type: 'warning' })
    saving.value = true
    const result = await callFunction('resultCenter', { action: 'supplementResult', tournamentId, matchId: selected.value.id, homeScore: scores[0], awayScore: scores[1], evidenceFileIds: evidence.value.map(file => file.fileId), note: note.value, resolution: resolution.value, winnerTeamId: winnerTeamId.value })
    if (!result?.success) throw new Error(result?.message || '归档失败')
    dialog.value = false; ElMessage.success('赛果已归档'); await load()
  } catch (cause) { if (cause !== 'cancel' && cause !== 'close') ElMessage.error(cause.message || '归档失败') }
  finally { saving.value = false }
}
onMounted(load)
</script>

<style scoped>
.result-page{max-width:1080px;margin:0 auto;padding:28px;color:#203027}.result-page header{display:flex;align-items:baseline;gap:18px;border-bottom:1px solid #dfe7e1;padding-bottom:18px}.result-page h1{font-size:24px;margin:0}.result-page header span,.row small{color:#6c7b70}.row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px 0;border-bottom:1px solid #e6ece7}.row>span{display:grid;gap:8px}.state{padding:36px 0;color:#748078}.form{display:grid;gap:16px}.scores{display:flex;align-items:center;gap:12px}.form label{display:grid;gap:8px}.file{display:flex;align-items:center;justify-content:space-between}.result-page :deep(.el-button){display:inline-flex;align-items:center;justify-content:center}@media(max-width:720px){.result-page{padding:18px}}
.match-teams{display:flex;align-items:center;gap:10px;font-size:14px}.match-team{display:inline-flex;align-items:center;gap:7px}.match-team img,.match-team i{width:26px;height:26px;object-fit:contain}.match-team i{display:grid;place-items:center;border-radius:50%;color:#168447;font-size:12px;font-style:normal;background:#e7f4eb}.match-teams em{color:#647269;font-size:13px;font-style:normal;white-space:nowrap}
</style>
