<template>
  <div class="outcome-rules">
    <section v-if="showStandings">
      <h4>同分排名顺序</h4>
      <ol aria-label="同分排名顺序">
        <li v-for="(key,index) in tieBreakers" :key="key">
          <span>{{ RANKING_LABELS[key] || key }}</span>
          <div v-if="key !== 'drawingLots'" class="order-actions">
            <el-button size="small" :disabled="index === 0" :aria-label="'上移'+RANKING_LABELS[key]" @click="move(index,-1)">上移</el-button>
            <el-button size="small" :disabled="index >= tieBreakers.length-2" :aria-label="'下移'+RANKING_LABELS[key]" @click="move(index,1)">下移</el-button>
            <el-button size="small" text type="danger" :aria-label="'移除'+RANKING_LABELS[key]" @click="remove(index)">移除</el-button>
          </div>
        </li>
      </ol>
      <el-select v-if="remaining.length" :model-value="''" placeholder="添加比较项" aria-label="添加同分比较项" @change="add"><el-option v-for="key in remaining" :key="key" :value="key" :label="RANKING_LABELS[key]" /></el-select>
      <small>积分相同后依次比较；抽签由组委会线下确认。</small>
    </section>
    <el-form v-if="showKnockout" label-position="top">
      <el-form-item label="淘汰赛平局"><el-select :model-value="knockoutTieBreak" aria-label="淘汰赛平局处理" @update:model-value="emit('update:knockoutTieBreak',$event)"><el-option label="加时赛后点球决胜" value="extra-penalties" /><el-option label="直接点球决胜" value="penalties" /></el-select></el-form-item>
    </el-form>
  </div>
</template>
<script setup>
import {computed} from 'vue'
import {RANKING_LABELS,DEFAULT_TIE_BREAKERS} from '../../utils/divisionOutcomeRules'
const props=defineProps({tieBreakers:{type:Array,required:true},knockoutTieBreak:{type:String,default:'extra-penalties'},showStandings:{type:Boolean,default:true},showKnockout:{type:Boolean,default:true}})
const emit=defineEmits(['update:tieBreakers','update:knockoutTieBreak'])
const remaining=computed(()=>DEFAULT_TIE_BREAKERS.filter(key=>key!=='drawingLots'&&!props.tieBreakers.includes(key)))
function move(index,delta){const next=[...props.tieBreakers],target=index+delta;if(target<0||target>=next.length||next[target]==='drawingLots')return;[next[index],next[target]]=[next[target],next[index]];emit('update:tieBreakers',next)}
function remove(index){emit('update:tieBreakers',props.tieBreakers.filter((_,i)=>i!==index))}
function add(key){if(!remaining.value.includes(key))return;emit('update:tieBreakers',[...props.tieBreakers.filter(value=>value!=='drawingLots'),key,'drawingLots'])}
</script>
<style scoped>
.outcome-rules h4{margin:0 0 10px;font-size:14px;color:#293f32}.outcome-rules ol{padding:0;margin:0 0 10px;list-style:none;counter-reset:order}.outcome-rules li{counter-increment:order;display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #edf1ee;font-size:12px}.outcome-rules li::before{content:counter(order);width:15px;color:#758178}.outcome-rules li>span{flex:1;min-width:0}.order-actions{display:flex;gap:3px}.order-actions :deep(.el-button){margin:0;padding:3px 5px;font-size:11px;height:24px}.outcome-rules :deep(.el-select){width:100%}.outcome-rules small{display:block;line-height:1.5;color:#748077;font-size:11px;margin:9px 0 15px}.outcome-rules :deep(.el-form-item){margin-bottom:0}
</style>
