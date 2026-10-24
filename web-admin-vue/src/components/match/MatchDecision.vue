<template><small v-if="value.isShootout" class="match-decision" :title="value.winnerName ? `${value.winnerName}点球获胜` : value.label">{{ value.label }}</small></template>
<script setup>
import { computed } from 'vue'
import matchScore from '../../../../cloudfunctions/dataCenter/shared/match-score.cjs'
const props = defineProps({ match: { type: Object, default: () => ({}) } })
const value = computed(() => matchScore.decision(props.match))
</script>
<style scoped>
.match-decision{display:block;max-width:100%;margin-top:5px;font-size:11px;line-height:1.4;font-weight:600;font-style:normal;white-space:normal;overflow-wrap:anywhere;color:#10773d;text-align:center}
</style>
