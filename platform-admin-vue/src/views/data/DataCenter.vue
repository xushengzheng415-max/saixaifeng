<template><section class="data-station"><el-tabs v-model="active"><el-tab-pane label="球队数据" name="teams"/><el-tab-pane label="球员数据" name="players"/><el-tab-pane label="数据治理" name="governance"/></el-tabs><DataCenterTools v-if="active==='governance'" :key="auditId" embedded :initial-player-id="auditId" ref="tools"/><DataHub v-else :kind="active" ref="hub" @audit="openAudit"/></section></template>
<script setup>
import {computed,ref} from 'vue'
import DataHub from './DataHub.vue'
import DataCenterTools from './DataCenterTools.vue'
const props=defineProps({embedded:Boolean,initialPlayerId:{type:String,default:''}})
const active=ref(props.initialPlayerId?'governance':'teams'),auditId=ref(props.initialPlayerId),hub=ref(null),tools=ref(null)
const loading=computed(()=>active.value==='governance'?Boolean(tools.value?.loading):Boolean(hub.value?.loading))
function openAudit(id){auditId.value=id;active.value='governance'}
const refresh=()=>active.value==='governance'?tools.value?.refresh():hub.value?.refresh()
defineExpose({refresh,loading})
</script>
<style scoped>.data-station{padding:4px 0}.data-station :deep(.data-center){padding:8px 0}</style>
