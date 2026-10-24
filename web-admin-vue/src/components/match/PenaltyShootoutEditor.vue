<template>
  <section class="shootout-editor">
    <div class="shootout-heading"><strong>点球轮次</strong><span>{{ outcome.home }} : {{ outcome.away }}</span></div>
    <label class="first-kicker">先罚球队<select :value="firstSide" @change="emit('update:firstSide', $event.target.value)"><option value="" disabled>请选择</option><option value="home">{{ homeName }}</option><option value="away">{{ awayName }}</option></select></label>
    <div class="shootout-grid heading"><span>轮次</span><span :title="homeName">{{ homeName }}</span><span :title="awayName">{{ awayName }}</span></div>
    <div v-for="(row, index) in modelValue" :key="index" class="shootout-grid">
      <span>第{{ index + 1 }}轮</span>
      <div v-for="side in ['home', 'away']" :key="side" class="kick-choices">
        <button v-for="choice in choices" :key="choice.value" type="button" :class="{ active: row[side] === choice.value }" :aria-label="`第${index + 1}轮${side === 'home' ? homeName : awayName}${choice.label}`" @click="setKick(index, side, choice.value)">{{ choice.label }}</button>
      </div>
    </div>
    <div class="shootout-footer">
      <span v-if="outcome.complete">点球胜者：{{ outcome.winnerSide === 'home' ? homeName : awayName }}</span>
      <span v-else>{{ outcome.reason }}</span>
      <button v-if="canAddRound" type="button" @click="addRound">增加一轮</button>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { evaluatePenaltyShootout } from '../../../../cloudfunctions/dataCenter/shared/penalty-shootout.mjs'

const props = defineProps({ modelValue: { type: Array, required: true }, firstSide: { type: String, default: '' }, homeName: { type: String, default: '主队' }, awayName: { type: String, default: '客队' } })
const emit = defineEmits(['update:modelValue', 'update:firstSide'])
const choices = [{ value: '', label: '—' }, { value: 'scored', label: '进' }, { value: 'missed', label: '未进' }]
const outcome = computed(() => evaluatePenaltyShootout(props.modelValue, props.firstSide))
const canAddRound = computed(() => outcome.value.canAddRound)
function setKick(index, side, value) { const rows = props.modelValue.map(row => ({ ...row })); rows[index][side] = value; emit('update:modelValue', rows) }
function addRound() { emit('update:modelValue', [...props.modelValue, { round: props.modelValue.length + 1, home: '', away: '' }]) }
</script>

<style scoped>
.first-kicker{display:flex;align-items:center;gap:12px;margin:4px 0 10px;font-size:12px;text-align:left}.first-kicker select{min-width:0;max-width:240px;flex:1;padding:6px 8px;border:1px solid #d5dfd8;border-radius:4px;background:#fff;color:#25352b}
.shootout-editor{width:100%;max-width:520px;margin:14px auto;color:#25352b}.shootout-heading,.shootout-footer{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0}.shootout-heading span{font-weight:700;font-size:18px}.shootout-grid{display:grid;grid-template-columns:72px minmax(0,1fr) minmax(0,1fr);align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #e4e9e5}.shootout-grid.heading{font-size:12px;color:#65756a}.shootout-grid.heading span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kick-choices{display:flex;gap:3px}.kick-choices button,.shootout-footer button{border:1px solid #d5dfd8;background:#fff;color:#415b49;border-radius:4px;padding:5px 8px;cursor:pointer;white-space:nowrap}.kick-choices button.active{border-color:#24874c;background:#e9f6ed;color:#126c38;font-weight:700}.shootout-footer{font-size:12px;color:#56675c}.shootout-footer button{color:#128044;border-color:#add6bb}@media(max-width:520px){.shootout-grid{grid-template-columns:48px minmax(0,1fr) minmax(0,1fr);gap:4px}.kick-choices button{padding:5px 4px;font-size:11px}}
</style>
