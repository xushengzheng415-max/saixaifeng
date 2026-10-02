<template>
  <div class="player-card-container">
    <div v-if="card.status === 'ready' && card.cardUrl" class="player-card" :data-template-version="card.publishedVersion"><img :src="card.cardUrl" :alt="`${player.name || '球员'}的球员卡`" class="published-card" @error="imageFailed" /></div>
    <div v-else class="player-card player-card-state" :class="{ 'is-loading': ['loading', 'pending'].includes(card.status) }"><img v-if="portraitUrl && !portraitFailed" :src="portraitUrl" :alt="`${player.name || '球员'}的照片`" class="player-portrait" @error="portraitFailed = true" /><strong>{{ player.name || '球员' }}</strong><span v-if="stateText">{{ stateText }}</span><button v-if="card.status === 'failed' || portraitFailed" type="button" @click="retry">重新加载</button></div>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { readPlayerCard } from '@/utils/playerCard'
import { useReadCacheRefresh } from '@/utils/useReadCacheRefresh.js'
const props = defineProps({ player:{type:Object,required:true}, teamLogo:{type:String,default:''} })
const card = ref({status:'pending',cardUrl:''})
const portraitFailed=ref(false)
const portraitUrl=computed(()=>card.value.status==='forbidden'?'':(card.value.portraitUrl || [props.player?.photoUrl,props.player?.avatarUrl].find(value=>/^https:\/\//.test(String(value||''))) || ''))
let requestVersion = 0
const stateText = computed(()=>{
  if(card.value.status==='forbidden')return '无权查看'
  if(portraitFailed.value)return '图片加载异常，请重试'
  if(portraitUrl.value)return card.value.status==='pending'?'成卡更新中':''
  if(card.value.status==='failed')return '加载异常，请重试'
  return ['loading','pending'].includes(card.value.status)?'读取卡库…':card.value.portraitStatus==='failed'?'图片加载异常，请重试':'资料待补充'
})
async function load(forceRefresh = false) {
  const playerId = String(props.player?._id || props.player?.id || props.player?.playerId || '')
  if (!playerId) { card.value={status:'unavailable',cardUrl:''}; return }
  const version = ++requestVersion
  if (!card.value.cardUrl) card.value={status:'loading',cardUrl:''}
  try { const result=await readPlayerCard(playerId, { cache: forceRefresh ? 'reload' : undefined }); if(version !== requestVersion)return;card.value=result?.success ? result : {status:'failed',cardUrl:''} }
  catch { if(version === requestVersion)card.value={status:'failed',cardUrl:''} }
}
function imageFailed(){card.value={...card.value,status:'failed',cardUrl:''}}
function retry(){portraitFailed.value=false;void load(true)}
function visible(){if(document.visibilityState==='visible')void load()}
function versionChanged(event){if(event.key==='sxfPlayerCardTemplateUpdate' && document.visibilityState==='visible')void load(true)}
watch(()=>[props.player?._id,props.player?.id,props.player?.playerId],()=>{portraitFailed.value=false;card.value={status:'loading',cardUrl:''};void load()},{immediate:true})
useReadCacheRefresh({ tags: ['playerCards'], refresh: () => load(), clear: () => { requestVersion++; card.value={status:'forbidden',cardUrl:''} } })
onMounted(()=>{document.addEventListener('visibilitychange',visible);window.addEventListener('storage',versionChanged)})
onBeforeUnmount(()=>{requestVersion++;document.removeEventListener('visibilitychange',visible);window.removeEventListener('storage',versionChanged)})
</script>
<style scoped>
.player-card-container{width:100%;max-width:300px;margin:auto}.player-card{width:100%;aspect-ratio:30/43;overflow:hidden}.published-card{display:block;width:100%;height:100%;object-fit:contain}.player-card-state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#f2f6f3;color:#617167;border:1px solid #e1e8e3;font-size:13px}.player-card-state.is-loading{background:rgba(7,45,25,.18);border:1px dashed rgba(255,255,255,.28);color:rgba(255,255,255,.82)}.player-card-state strong{color:#26362d;font-size:16px}.player-card-state.is-loading strong{color:#fff}.player-card-state button{border:0;background:transparent;color:#087744;cursor:pointer}
.player-portrait{display:block;width:100%;height:75%;object-fit:contain}.player-card-state:has(.player-portrait){background:transparent;border:0}
</style>
