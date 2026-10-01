<template>
  <div class="player-card-container">
    <div v-if="card.status === 'ready' && card.cardUrl" class="player-card" :data-template-version="card.publishedVersion"><img :src="card.cardUrl" :alt="`${player.name || '球员'}的球员卡`" class="published-card" @error="imageFailed" /></div>
    <div v-else class="player-card player-card-state"><strong>{{ player.name || '球员' }}</strong><span>{{ stateText }}</span><button v-if="card.status === 'failed'" type="button" @click="load">重新加载</button></div>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { readPlayerCard } from '@/utils/playerCard'
const props = defineProps({ player:{type:Object,required:true}, teamLogo:{type:String,default:''}, playerCard:{type:Object,default:()=>({})} })
const card = ref({status:'pending',cardUrl:''})
let requestVersion = 0, timer = null, fetching = false
const stateText = computed(()=>({pending:'成卡更新中',loading:'正在读取成卡…',unavailable:'尚未制作球员卡',forbidden:'无权查看球员卡',failed:'球员卡读取失败'}[card.value.status] || '尚未制作球员卡'))
async function load() {
  const playerId = String(props.player?._id || props.player?.id || props.player?.playerId || '')
  if (!playerId) { card.value={status:'unavailable',cardUrl:''}; return }
  const version = ++requestVersion
  fetching = true
  if (!card.value.cardUrl) card.value={status:'loading',cardUrl:''}
  try { const result=await readPlayerCard(playerId); if(version !== requestVersion)return;card.value=result?.success ? result : {status:'failed',cardUrl:''} }
  catch { if(version === requestVersion)card.value={status:'failed',cardUrl:''} }
  finally { if(version === requestVersion)fetching=false }
}
function imageFailed(){card.value={...card.value,status:'failed',cardUrl:''}}
function visible(){if(document.visibilityState==='visible' && !fetching)void load()}
function versionChanged(event){if(event.key==='sxfPlayerCardTemplateUpdate')visible()}
watch(()=>[props.player?._id,props.player?.id,props.player?.playerId],load,{immediate:true})
onMounted(()=>{document.addEventListener('visibilitychange',visible);window.addEventListener('storage',versionChanged);timer=window.setInterval(visible,60000)})
onBeforeUnmount(()=>{requestVersion++;window.clearInterval(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('storage',versionChanged)})
</script>
<style scoped>
.player-card-container{width:100%;max-width:300px;margin:auto}.player-card{width:100%;aspect-ratio:30/43;overflow:hidden}.published-card{display:block;width:100%;height:100%;object-fit:contain}.player-card-state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#f2f6f3;color:#617167;border:1px solid #e1e8e3;font-size:13px}.player-card-state strong{color:#26362d;font-size:16px}.player-card-state button{border:0;background:transparent;color:#087744;cursor:pointer}
</style>
