<template>
  <div class="player-card-container" :class="{ 'on-pitch': appearance === 'pitch' }">
    <div v-if="card.status === 'ready' && card.cardUrl" class="player-card" :data-template-version="card.publishedVersion"><img :src="card.cardUrl" :alt="`${player.name || '球员'}的球员卡`" class="published-card" @error="imageFailed" /></div>
    <div v-else class="player-card player-card-state" role="status" :aria-busy="isLoading"><img v-if="portraitUrl && !portraitFailed" :src="portraitUrl" :alt="`${player.name || '球员'}的照片`" class="player-portrait" @error="portraitFailed = true" /><i v-else-if="isLoading" class="card-loading-ring" aria-hidden="true" /><strong>{{ player.name || '球员' }}</strong><span v-if="stateText">{{ stateText }}</span><button v-if="card.status === 'failed' || portraitFailed" type="button" :aria-label="`重新加载${player.name || '球员'}的球员卡`" @click.stop="retry">重试</button></div>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { readPlayerCard, getCachedPlayerCard } from '@/utils/playerCard'
import { useReadCacheRefresh } from '@/utils/useReadCacheRefresh.js'
const props = defineProps({ player:{type:Object,required:true}, teamLogo:{type:String,default:''}, playerCard:{type:Object,default:()=>({})}, appearance:{type:String,default:'default'} })
const card = ref({status:'pending',cardUrl:''})
const portraitFailed=ref(false)
const portraitUrl=computed(()=>card.value.status==='forbidden'?'':(card.value.portraitUrl || [props.player?.photoUrl,props.player?.avatarUrl].find(value=>/^https:\/\//.test(String(value||''))) || ''))
let requestVersion = 0, timer = null, fetching = false
const isLoading = computed(()=>['loading','pending'].includes(card.value.status) && !portraitFailed.value)
const stateText = computed(()=>{
  if(card.value.status==='forbidden')return '无权查看'
  if(portraitFailed.value)return '图片加载异常，请重试'
  if(portraitUrl.value)return card.value.status==='pending'?'成卡更新中':''
  if(card.value.status==='failed')return '加载异常，请重试'
  return ['loading','pending'].includes(card.value.status)?'正在加载…':card.value.portraitStatus==='failed'?'图片加载异常，请重试':'资料待补充'
})
async function load(forceRefresh = false) {
  const playerId = String(props.player?._id || props.player?.id || props.player?.playerId || '')
  if (!playerId) { card.value={status:'unavailable',cardUrl:''}; return }
  const version = ++requestVersion
  fetching = true
  if (!card.value.cardUrl) card.value={status:'loading',cardUrl:''}
  try { const result=await readPlayerCard(playerId, { cache: forceRefresh ? 'reload' : undefined }); if(version !== requestVersion)return;card.value=result?.success ? result : {status:'failed',cardUrl:''} }
  catch { if(version === requestVersion)card.value={status:'failed',cardUrl:''} }
  finally { if(version === requestVersion)fetching=false }
}
function imageFailed(){card.value={...card.value,status:'failed',cardUrl:''}}
function retry(){portraitFailed.value=false;void load(true)}
function visible(){if(document.visibilityState==='visible' && !fetching)void load()}
function versionChanged(event){if(event.key==='sxfPlayerCardTemplateUpdate' && document.visibilityState==='visible')void load(true)}
watch(()=>String(props.player?._id || props.player?.id || props.player?.playerId || ''), playerId=>{portraitFailed.value=false;card.value=getCachedPlayerCard(playerId) || {status:'loading',cardUrl:''};void load()},{immediate:true})
useReadCacheRefresh({ tags: ['playerCards'], refresh: () => load(), clear: () => { requestVersion++; card.value={status:'forbidden',cardUrl:''} } })
onMounted(()=>{document.addEventListener('visibilitychange',visible);window.addEventListener('storage',versionChanged);timer=window.setInterval(visible,60000)})
onBeforeUnmount(()=>{requestVersion++;window.clearInterval(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('storage',versionChanged)})
</script>
<style scoped>
.player-card-container{width:100%;max-width:300px;margin:auto}.player-card{width:100%;aspect-ratio:30/43;overflow:hidden}.published-card{display:block;width:100%;height:100%;object-fit:contain}.player-card-state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#f2f6f3;color:#617167;border:1px solid #e1e8e3;font-size:13px}.player-card-state strong{color:#26362d;font-size:16px}.player-card-state button{border:0;background:transparent;color:#087744;cursor:pointer}
.player-portrait{display:block;width:100%;height:75%;object-fit:contain}.player-card-state:has(.player-portrait){background:transparent;border:0}
.card-loading-ring{width:18px;height:18px;border:2px solid #d6e5dc;border-top-color:#16824b;border-radius:50%;animation:card-loading-spin 1s linear infinite}
.on-pitch .player-card-state{box-sizing:border-box;gap:9px;padding:12px 8px;border:1px solid #d5eee13b;border-radius:10px;background:#0c3025c9;color:#bdd2c7;font-size:11px}
.on-pitch .player-card-state strong{max-width:100%;color:#edf6f1;font-size:13px;line-height:1.4;overflow-wrap:anywhere}
.on-pitch .card-loading-ring{width:20px;height:20px;border-color:#d5eee126;border-top-color:#c0dfce}
.on-pitch .player-card-state button{padding:4px 10px;border:1px solid #bddaca66;border-radius:5px;color:#e2f0e8;background:#d7efe10d;font:inherit;cursor:pointer}
.on-pitch .player-card-state button:hover{border-color:#d5eee1;background:#d7efe124}
.player-card-state button:focus-visible{outline:2px solid #7bc49c;outline-offset:3px}
.on-pitch .player-card-state:has(.player-portrait){background:transparent;border:0;padding:0}
@keyframes card-loading-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.card-loading-ring{animation:none}}
</style>
