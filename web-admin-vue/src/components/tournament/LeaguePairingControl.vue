<template><div class="league-pairing-control"><span>首轮对阵</span><el-radio-group :model-value="modelValue" :disabled="disabled" @update:model-value="value=>emit('update:modelValue',value)"><el-radio v-for="item in LEAGUE_PAIRING_MODES" :key="item.value" :value="item.value" :label="item.value">{{ item.label }}<small>{{ item.example }}</small></el-radio></el-radio-group><small v-if="disabled">已确认，方式已锁定</small></div></template>
<script setup>
import {LEAGUE_PAIRING_MODES} from '../../utils/leaguePairings.js'
defineProps({modelValue:{type:String,default:'adjacent'},disabled:Boolean})
const emit=defineEmits(['update:modelValue'])
</script>
<style scoped>.league-pairing-control{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 0;border-bottom:1px solid #e4ebe6}.league-pairing-control>span{font-size:13px;font-weight:600}.league-pairing-control :deep(.el-radio-group){display:flex;gap:8px 18px;flex-wrap:wrap}.league-pairing-control :deep(.el-radio){height:auto;min-height:36px;margin:0}.league-pairing-control small{display:block;font-size:11px;line-height:18px;color:#718077}.league-pairing-control>small{font-size:12px}</style>
