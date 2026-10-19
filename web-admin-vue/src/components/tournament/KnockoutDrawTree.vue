<template>
  <div class="knockout-tree" :class="{ 'knockout-tree--screen':screen }" :style="{ '--tree-columns':columnSizes }" :aria-label="`${slots.length}签淘汰赛对阵`">
    <section v-for="column in columns" :key="column.key" class="tree-column" :class="{ 'tree-column--seeds':column.positions, 'tree-column--final':column.final }">
      <h3>{{ column.title }}</h3>
      <div v-if="column.final" class="tree-final"><el-icon><Trophy /></el-icon><strong>决赛</strong><span>冠军待定</span></div>
      <ol v-else class="tree-nodes">
        <template v-if="column.positions">
          <li v-for="index in column.positions" :key="index" :class="{ 'tree-pair-start':index % 2 === 0 }">
            <button type="button" :disabled="!editable" class="tree-slot" :class="{ filled:slots[index] }" @dragover.prevent @drop.prevent="editable && $emit('drop',index)" @click="editable && $emit('remove',index)">
              <b>{{ `签${String(index + 1).padStart(2,'0')}` }}</b>
              <img v-if="showCrest && slots[index]?.logo" :src="slots[index].logo" alt="" />
              <strong v-if="slots[index]" :title="slots[index].name">{{ slots[index].name }}</strong><span v-else>{{ byesResolved ? '轮空' : '待抽签' }}</span>
            </button>
          </li>
        </template>
        <li v-for="index in column.positions ? 0 : column.count" :key="`future-${index}`" class="tree-future">晋级待定</li>
      </ol>
    </section>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { Trophy } from '@element-plus/icons-vue'
import { knockoutColumns } from '../../utils/knockoutDraw.mjs'
const props=defineProps({ slots:{type:Array,default:()=>[]},editable:Boolean,screen:Boolean,byesResolved:Boolean,showCrest:{type:Boolean,default:true} })
defineEmits(['drop','remove'])
const columns=computed(()=>knockoutColumns(Math.max(2,props.slots.length)))
const columnSizes=computed(()=>columns.value.map(column=>column.positions?'minmax(180px,1.8fr)':column.final?'minmax(80px,.7fr)':'minmax(100px,1fr)').join(' '))
</script>
<style scoped>
.knockout-tree{--tree-text:#243c2d;--tree-muted:#7b8d81;--tree-border:#d9e5dc;--tree-bg:#fff;--tree-heading:#edf5ef;display:grid;grid-template-columns:var(--tree-columns);gap:12px;min-height:400px;overflow-x:auto;color:var(--tree-text)}.tree-column{display:flex;min-width:0;flex-direction:column;border-top:1px solid var(--tree-border)}.tree-column h3{margin:0;padding:12px 6px;background:var(--tree-heading);font-size:13px;text-align:center}.tree-nodes{display:flex;flex:1;flex-direction:column;justify-content:space-around;gap:8px;margin:0;padding:12px 0;list-style:none}.tree-nodes li{min-width:0}.tree-slot{display:flex;align-items:center;gap:8px;box-sizing:border-box;width:100%;min-height:44px;padding:8px;border:1px solid var(--tree-border);border-radius:5px;background:var(--tree-bg);color:var(--tree-text);text-align:left;cursor:pointer}.tree-slot:disabled{cursor:default;opacity:1}.tree-slot.filled{border-color:#66b78a}.tree-slot b{flex:none;color:#13844c;font-size:11px}.tree-slot img{width:26px;height:26px;object-fit:contain}.tree-slot strong{overflow:hidden;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.tree-slot>span,.tree-future{color:var(--tree-muted);font-size:12px}.tree-future{display:grid;min-height:44px;place-items:center;border:1px solid var(--tree-border);border-radius:5px;background:var(--tree-bg)}.tree-final{display:grid;flex:1;align-content:center;justify-items:center;gap:14px}.tree-final .el-icon{color:#dca600;font-size:40px}.tree-final strong{font-size:18px}.tree-final span{color:var(--tree-muted);font-size:12px}.knockout-tree--screen{--tree-text:#effff5;--tree-muted:#b7d9c3;--tree-border:rgba(167,241,191,.32);--tree-bg:rgba(0,33,20,.45);--tree-heading:rgba(158,255,192,.10);min-height:55vh;gap:20px}.knockout-tree--screen .tree-column h3{font-size:clamp(15px,1.2vw,22px)}.knockout-tree--screen .tree-slot{min-height:62px;padding:12px}.knockout-tree--screen .tree-slot b{color:#9be5b5;font-size:15px}.knockout-tree--screen .tree-slot strong{font-size:clamp(16px,1.3vw,25px)}.knockout-tree--screen .tree-slot img{width:36px;height:36px}.knockout-tree--screen .tree-future{min-height:62px;font-size:17px}.knockout-tree--screen .tree-final strong{font-size:26px}.knockout-tree--screen .tree-final span{font-size:17px}
</style>
