<template>
  <span class="player-avatar" :data-avatar-status="status" :aria-busy="status === 'loading'">
    <img v-if="displayUrl" :key="displayUrl" :src="displayUrl" alt="头像" @error="onImageError" />
    <button v-else-if="status === 'failed'" type="button" title="照片加载失败，点击重试" aria-label="重试加载照片" @click.stop="retry">重试</button>
    <span v-else :title="status === 'loading' ? '头像加载中' : '未上传照片'" role="img" :aria-label="status === 'loading' ? '头像加载中' : '未上传照片'">{{ status === 'loading' ? '…' : '—' }}</span>
  </span>
</template>
<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { getFileUrl } from '../../utils/cloud'
const props=defineProps({player:{type:Object,required:true}})
const displayUrl=ref(''),status=ref('missing')
const displayable=value=>/^(https?:\/\/|data:image\/|blob:|\/)/i.test(String(value || '').trim())
const values=()=>[props.player.photoUrl,props.player.photoFileID,props.player.photoFileId,props.player._exportPhotoFileId,props.player.photo].map(value=>String(value || '').trim()).filter(Boolean)
const source=()=>values().find(displayable) || values().find(value=>value.startsWith('cloud://')) || ''
let generation=0,active=true
async function resolveSource(preferCloud=false){
  if(!active)return
  const request=++generation
  const selected=(preferCloud && values().find(value=>value.startsWith('cloud://'))) || source()
  displayUrl.value=''
  if(!selected){status.value='missing';return}
  if(displayable(selected)){displayUrl.value=selected;status.value='ready';return}
  status.value='loading'
  try {
    const url=await getFileUrl(selected)
    if(!active || request!==generation)return
    if(!displayable(url)){status.value='failed';return}
    displayUrl.value=url;status.value='ready'
  }catch{
    if(active && request===generation)status.value='failed'
  }
}
function onImageError(event){
  // A late error from a removed image must not hide its replacement.
  if(event.currentTarget?.getAttribute('src')!==displayUrl.value)return
  displayUrl.value='';status.value='failed'
}
async function retry(){
  ++generation;displayUrl.value='';status.value='loading'
  await nextTick()
  await resolveSource(true)
}
watch(source,()=>void resolveSource(),{immediate:true})
onBeforeUnmount(()=>{active=false;++generation})
</script>
<style scoped>
.player-avatar{display:inline-flex;width:36px;height:48px;align-items:center;justify-content:center;vertical-align:middle;background:transparent;color:#8b9890;font-size:12px;line-height:1.4}.player-avatar img{display:block;width:100%;height:100%;object-fit:contain;border:0;border-radius:0;background:transparent}.player-avatar button{padding:0;border:0;background:transparent;color:#087a48;font:inherit;cursor:pointer}.player-avatar button:focus-visible{outline:2px solid #087a48;outline-offset:3px}
</style>
