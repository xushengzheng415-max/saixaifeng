<template>
  <span class="schedule-team-crest" :title="statusTitle">
    <img v-if="source" :key="source" :src="source" :alt="`${name}队徽`" draggable="false" @load="loading=false" @error="nextSource" />
    <span v-else class="crest-placeholder" :aria-label="statusTitle">{{ loading ? '…' : '—' }}</span>
  </span>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getFileUrl } from '../../utils/cloud'

const props=defineProps({ sources:{type:Array,default:()=>[]},name:{type:String,default:'球队'} })
const source=ref(''),loading=ref(false),failed=ref(false)
let version=0,queue=[],tried=new Set()
const statusTitle=computed(()=>source.value ? `${props.name}队徽` : loading.value ? '队徽加载中' : failed.value ? '队徽暂未加载，请刷新重试' : '暂无队徽')
async function nextSource() {
  const currentVersion=version
  source.value='';loading.value=true
  while(queue.length) {
    const raw=queue.shift()
    let url=raw
    try { if(raw.startsWith('cloud://'))url=await getFileUrl(raw) } catch { url='' }
    if(currentVersion!==version)return
    // A failed cloud URL resolver can return the original file ID; browsers
    // cannot render that ID, so continue to the next saved source.
    if(!url || url.startsWith('cloud://') || tried.has(url))continue
    tried.add(url);source.value=url;return
  }
  loading.value=false;failed.value=props.sources.length>0
}
watch(()=>JSON.stringify(props.sources),()=>{
  const values=props.sources
  version++;queue=[...new Set(values.filter(value=>typeof value==='string').map(value=>value.trim()).filter(Boolean))]
  tried=new Set();failed.value=false;nextSource()
},{immediate:true,deep:true})
onBeforeUnmount(()=>{version++})
</script>

<style scoped>
.schedule-team-crest{display:grid;place-items:center;box-sizing:border-box;width:38px;height:38px;flex:0 0 38px;overflow:visible;background:transparent;border:0;border-radius:0}
.schedule-team-crest img{display:block;box-sizing:border-box;width:100%;height:100%;object-fit:contain;object-position:center;border:0;border-radius:0;background:transparent}
.crest-placeholder{display:grid;place-items:center;width:100%;height:100%;color:#77847c;font-size:14px;font-style:normal}
</style>
