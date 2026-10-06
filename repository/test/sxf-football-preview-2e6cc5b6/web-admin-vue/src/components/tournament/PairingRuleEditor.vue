<template>
  <section class="pairing-rule-editor">
    <header>
      <div>
        <h3>对阵规则</h3>
        <p>抽签确认后按此规则生成待排比赛，不包含日期、时间和场地。</p>
      </div>
      <el-tag type="success" effect="plain">以本届竞赛规程为准</el-tag>
    </header>

    <div class="pairing-rule-main">
      <div class="pairing-rule-controls">
        <label>编排方式</label>
        <el-radio-group v-model="mode" @change="resetPatterns">
          <el-radio-button value="standard">标准轮转（推荐）</el-radio-button>
          <el-radio-button value="custom">自定义轮次</el-radio-button>
        </el-radio-group>
        <label>循环方式</label>
        <el-radio-group v-model="loopType" @change="resetPatterns">
          <el-radio-button value="single">单循环</el-radio-button>
          <el-radio-button value="double">双循环</el-radio-button>
        </el-radio-group>
      </div>

      <nav v-if="groupCodes.length > 1" class="pairing-group-tabs">
        <button v-for="code in groupCodes" :key="code" type="button" :class="{ active: activeGroup === code }" @click="activeGroup = code">
          {{ code }}组 <small>{{ groupSize(code) }}支</small>
        </button>
      </nav>

      <div class="pairing-rounds">
        <article v-for="(round, roundIndex) in activeRounds" :key="`${activeGroup}-${roundIndex}`">
          <header><strong>第{{ roundIndex + 1 }}轮</strong><button v-if="mode === 'custom'" type="button" @click="removeRound(roundIndex)">删除轮次</button></header>
          <div class="pairing-match-row" v-for="(pair, pairIndex) in round" :key="pairIndex">
            <select v-model.number="pair[0]" :disabled="mode === 'standard'">
              <option v-for="seed in groupSize(activeGroup)" :key="seed" :value="seed">{{ activeGroup }}{{ seed }}</option>
            </select>
            <b>VS</b>
            <select v-model.number="pair[1]" :disabled="mode === 'standard'">
              <option v-for="seed in groupSize(activeGroup)" :key="seed" :value="seed">{{ activeGroup }}{{ seed }}</option>
            </select>
            <button v-if="mode === 'custom'" type="button" @click="swapPair(roundIndex, pairIndex)">主客互换</button>
            <button v-if="mode === 'custom'" type="button" @click="removePair(roundIndex, pairIndex)">删除</button>
          </div>
          <button v-if="mode === 'custom'" class="pairing-add" type="button" @click="addPair(roundIndex)">＋ 增加对阵</button>
        </article>
      </div>

      <button v-if="mode === 'custom'" class="pairing-add-round" type="button" @click="addRound">＋ 增加轮次</button>
      <p v-if="validationMessage" class="pairing-validation is-error">{{ validationMessage }}</p>
      <p v-else class="pairing-validation">共 {{ totalMatches }} 场；每轮每队最多一场，奇数球队自动轮空。</p>
    </div>

    <footer>
      <span>标准轮转是通用编排方法，不代表 FIFA 规定唯一轮次。</span>
      <el-button type="success" :loading="saving" :disabled="Boolean(validationMessage) || disabled" @click="save">保存对阵规则</el-button>
    </footer>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { callFunction } from '../../utils/cloud'

const props = defineProps({
  tournamentId: { type: String, required: true },
  division: { type: Object, required: true },
  groupCount: { type: Number, default: 1 },
  teamsPerGroup: { type: Number, default: 4 },
  groupSizes: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false }
})

const mode = ref(props.division?.pairingTemplate?.mode === 'custom' ? 'custom' : 'standard')
const loopType = ref(props.division?.pairingTemplate?.loopType === 'double' ? 'double' : 'single')
const patterns = ref({})
const activeGroup = ref('A')
const saving = ref(false)

const normalizedSizes = computed(() => {
  const count = Math.max(1, Number(props.groupCount || 1))
  const supplied = Array.isArray(props.groupSizes) ? props.groupSizes.map(Number).filter(value => value >= 2).slice(0, count) : []
  return supplied.length === count ? supplied : Array.from({ length: count }, () => Math.max(2, Number(props.teamsPerGroup || 4)))
})
const groupCodes = computed(() => normalizedSizes.value.map((_, index) => String.fromCharCode(65 + index)))
const activeRounds = computed(() => patterns.value[activeGroup.value] || [])
const totalMatches = computed(() => Object.values(patterns.value).reduce((sum, rounds) => sum + rounds.reduce((roundSum, round) => roundSum + round.length, 0), 0))

function groupSize(code) { return normalizedSizes.value[groupCodes.value.indexOf(code)] || normalizedSizes.value[0] || 2 }
function standardRounds(size, type) {
  let entries = Array.from({ length:size }, (_, index) => index + 1)
  if (entries.length % 2) entries.push(null)
  const rounds = []
  for (let roundIndex = 0; roundIndex < entries.length - 1; roundIndex += 1) {
    const pairs = []
    for (let pairIndex = 0; pairIndex < entries.length / 2; pairIndex += 1) {
      let home = entries[pairIndex], away = entries[entries.length - 1 - pairIndex]
      if (!home || !away) continue
      if ((roundIndex + pairIndex) % 2) [home, away] = [away, home]
      pairs.push([home, away])
    }
    rounds.push(pairs)
    entries = [entries[0], entries.at(-1), ...entries.slice(1, -1)]
  }
  return type === 'double' ? [...rounds, ...rounds.map(round => round.map(([home, away]) => [away, home]))] : rounds
}
function resetPatterns() {
  patterns.value = Object.fromEntries(groupCodes.value.map(code => [code, standardRounds(groupSize(code), loopType.value)]))
  if (!groupCodes.value.includes(activeGroup.value)) activeGroup.value = groupCodes.value[0] || 'A'
}
function parseExistingTemplate() {
  const template = props.division?.pairingTemplate
  if (!template?.stages?.length) return false
  const parsed = {}
  for (const stage of template.stages) {
    const code = String(stage.group || '').match(/^([A-Z])/)?.[1]
    if (!code) continue
    const roundIndex = Math.max(0, Number(stage.round || 1) - 1)
    parsed[code] ||= []
    parsed[code][roundIndex] ||= []
    for (const match of stage.matches || []) {
      const home = Number(String(match.home || '').match(/(\d+)$/)?.[1])
      const away = Number(String(match.away || '').match(/(\d+)$/)?.[1])
      if (home && away) parsed[code][roundIndex].push([home, away])
    }
  }
  if (!Object.keys(parsed).length) return false
  patterns.value = parsed
  return true
}
function swapPair(roundIndex, pairIndex) { const pair = activeRounds.value[roundIndex][pairIndex]; activeRounds.value[roundIndex][pairIndex] = [pair[1], pair[0]] }
function removePair(roundIndex, pairIndex) { activeRounds.value[roundIndex].splice(pairIndex, 1) }
function addPair(roundIndex) { activeRounds.value[roundIndex].push([1, Math.min(2, groupSize(activeGroup.value))]) }
function addRound() { patterns.value[activeGroup.value].push([[1, Math.min(2, groupSize(activeGroup.value))]]) }
function removeRound(roundIndex) { patterns.value[activeGroup.value].splice(roundIndex, 1) }

const validationMessage = computed(() => {
  for (const code of groupCodes.value) {
    const size = groupSize(code), rounds = patterns.value[code] || []
    if (!rounds.length) return `${code}组没有对阵轮次`
    const pairCounts = new Map()
    for (let roundIndex = 0; roundIndex < rounds.length; roundIndex += 1) {
      const used = new Set()
      for (const pair of rounds[roundIndex]) {
        const [home, away] = pair.map(Number)
        if (!home || !away || home > size || away > size) return `${code}组第${roundIndex + 1}轮存在无效签位`
        if (home === away) return `${code}组第${roundIndex + 1}轮存在自我对阵`
        if (used.has(home) || used.has(away)) return `${code}组第${roundIndex + 1}轮同一球队被安排多次`
        used.add(home); used.add(away)
        const key = [home, away].sort((a,b) => a-b).join('-')
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1)
      }
    }
    const expected = loopType.value === 'double' ? 2 : 1
    for (let home = 1; home <= size; home += 1) for (let away = home + 1; away <= size; away += 1) if ((pairCounts.get(`${home}-${away}`) || 0) !== expected) return `${code}组对阵不完整：${code}${home} 与 ${code}${away} 应交手${expected}次`
  }
  return ''
})

function buildTemplate() {
  const stages = []
  for (const code of groupCodes.value) {
    ;(patterns.value[code] || []).forEach((round, roundIndex) => stages.push({
      name: `小组赛 ${code}组 · 第${roundIndex + 1}轮`, stageName:'小组赛阶段', stageOrder:1, phase:'group', group:`${code}组`, round:roundIndex + 1,
      matches:round.map(([home, away], index) => ({ code:`${code}-R${roundIndex + 1}-${index + 1}`,home:`${code}${home}`,away:`${code}${away}`,roundName:`小组赛 ${code}组第${roundIndex + 1}轮`,stageName:'小组赛阶段',stageOrder:1 }))
    }))
  }
  return { version:`${mode.value === 'standard' ? 'standard-rotation' : 'custom'}-${loopType.value}-${Date.now()}`,source:mode.value === 'standard' ? '标准循环赛轮转法' : '主办方自定义对阵',mode:mode.value === 'standard' ? 'standard_rotation' : 'custom',loopType:loopType.value,groupSizes:normalizedSizes.value,stages }
}
async function save() {
  if (validationMessage.value) return ElMessage.error(validationMessage.value)
  saving.value = true
  try {
    const result = await callFunction('generateSchedule', { action:'savePairingTemplate',tournamentId:props.tournamentId,divisionId:String(props.division?._id || props.division?.id || ''),pairingTemplate:buildTemplate() })
    if (!result?.success) throw new Error(result?.message || '保存失败')
    ElMessage.success(result.message || '对阵规则已保存')
  } catch (error) { ElMessage.error(error.message || '对阵规则保存失败') } finally { saving.value = false }
}

watch(() => [props.groupCount, props.teamsPerGroup, JSON.stringify(props.groupSizes)], () => resetPatterns(), { immediate:true })
if (parseExistingTemplate()) mode.value = props.division?.pairingTemplate?.mode === 'custom' ? 'custom' : 'standard'
</script>

<style scoped>
.pairing-rule-editor{border:1px solid #dce6df;border-radius:10px;background:#fff}.pairing-rule-editor>header,.pairing-rule-editor>footer{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 18px}.pairing-rule-editor>header{border-bottom:1px solid #e6ece8}.pairing-rule-editor h3{margin:0;font-size:18px}.pairing-rule-editor p{margin:5px 0 0;color:#6b776f;font-size:13px}.pairing-rule-main{padding:16px 18px}.pairing-rule-controls{display:grid;grid-template-columns:90px 1fr 90px 1fr;align-items:center;gap:10px}.pairing-rule-controls>label{font-weight:650}.pairing-group-tabs{display:flex;gap:8px;margin:16px 0 10px}.pairing-group-tabs button{padding:8px 14px;border:1px solid #d8e2dc;border-radius:6px;background:#fff;cursor:pointer}.pairing-group-tabs button.active{border-color:#087b43;color:#087b43;background:#edf7f1}.pairing-group-tabs small{margin-left:5px;color:#77847c}.pairing-rounds{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}.pairing-rounds article{padding:12px;border:1px solid #e0e8e3;border-radius:8px;background:#f8faf9}.pairing-rounds article>header{display:flex;justify-content:space-between;margin-bottom:8px}.pairing-rounds button,.pairing-add-round{border:0;color:#087b43;background:transparent;cursor:pointer}.pairing-match-row{display:grid;grid-template-columns:1fr 34px 1fr auto auto;align-items:center;gap:6px;margin-top:7px}.pairing-match-row select{height:34px;border:1px solid #d7e0da;border-radius:5px;background:#fff}.pairing-match-row b{text-align:center;font-size:11px}.pairing-add{margin-top:9px}.pairing-add-round{margin-top:12px;padding:8px 0}.pairing-validation{padding:10px 12px;border-radius:6px;color:#087b43;background:#eef8f1}.pairing-validation.is-error{color:#b42318;background:#fff1f0}.pairing-rule-editor>footer{border-top:1px solid #e6ece8;color:#6c7870;font-size:12px}@media(max-width:900px){.pairing-rule-controls{grid-template-columns:1fr}.pairing-rounds{grid-template-columns:1fr}}
</style>
