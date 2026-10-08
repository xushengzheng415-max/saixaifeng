<template>
  <div class="report-image-magnifier">
    <div ref="viewport" class="image-viewport" @scroll="refreshLens">
      <img ref="image" :src="src" :alt="alt" draggable="false" @pointerenter="moveLens" @pointermove="moveLens" @pointerleave="hideLens" @load="hideLens" />
    </div>
    <div class="magnifier-controls">
      <label :for="controlId">放大倍数</label>
      <input :id="controlId" v-model.number="zoom" type="range" min="1.5" max="6" step="0.5" aria-label="放大倍数" />
      <output :for="controlId">{{ zoom.toFixed(1) }}×</output>
    </div>
    <Teleport to="body">
      <div v-if="active" class="report-magnifier-lens" :style="lensStyle" aria-hidden="true" />
    </Teleport>
  </div>
</template>

<script setup>
import {ref,computed,watch,onMounted,onBeforeUnmount} from 'vue'
const props=defineProps({src:{type:String,required:true},alt:{type:String,default:'裁判表原图'}})
const image=ref(null),viewport=ref(null),active=ref(false),zoom=ref(3)
const diameter=200,controlId=`report-magnifier-${Math.random().toString(36).slice(2)}`
const point=ref({x:0,y:0,left:0,top:0,width:0,height:0})
let lastPointer=null
function hideLens(){active.value=false;lastPointer=null}
function moveLens(event){
  if(event.pointerType==='touch'||!image.value?.naturalWidth)return hideLens()
  const rect=image.value.getBoundingClientRect(),view=viewport.value.getBoundingClientRect()
  const x=event.clientX-rect.left,y=event.clientY-rect.top
  if(x<0||y<0||x>rect.width||y>rect.height||event.clientX<view.left||event.clientX>view.right||event.clientY<view.top||event.clientY>view.bottom)return hideLens()
  lastPointer={clientX:event.clientX,clientY:event.clientY,pointerType:'mouse'}
  const left=Math.max(8,Math.min(event.clientX-diameter/2,window.innerWidth-diameter-8))
  const top=Math.max(8,Math.min(event.clientY-diameter/2,window.innerHeight-diameter-8))
  point.value={x,y,left,top,width:rect.width,height:rect.height};active.value=true
}
function refreshLens(){if(lastPointer)moveLens(lastPointer)}
const lensStyle=computed(()=>({
  left:`${point.value.left}px`,top:`${point.value.top}px`,width:`${diameter}px`,height:`${diameter}px`,
  backgroundImage:`url(${JSON.stringify(props.src)})`,
  backgroundSize:`${point.value.width*zoom.value}px ${point.value.height*zoom.value}px`,
  backgroundPosition:`${diameter/2-point.value.x*zoom.value}px ${diameter/2-point.value.y*zoom.value}px`
}))
watch(()=>props.src,hideLens)
onMounted(()=>window.addEventListener('resize',hideLens))
onBeforeUnmount(()=>window.removeEventListener('resize',hideLens))
</script>

<style scoped>
.image-viewport{max-height:calc(70vh - 48px);overflow:auto;background:#f4f7f5}.image-viewport img{display:block;width:100%;height:auto;cursor:crosshair;user-select:none}
.magnifier-controls{display:flex;align-items:center;gap:12px;padding:12px 10px;background:#fff;border-top:1px solid #e3e9e5;font-size:13px;color:#42564c}.magnifier-controls label{white-space:nowrap}.magnifier-controls input{min-width:60px;flex:1;margin:0;accent-color:var(--el-color-primary,#078747)}.magnifier-controls output{min-width:42px;text-align:right;font-variant-numeric:tabular-nums}
.report-magnifier-lens{position:fixed;z-index:6000;pointer-events:none;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px #1c4538,0 5px 18px #0004;background-color:#f4f7f5;background-repeat:no-repeat;box-sizing:border-box}
@media(max-width:900px){.image-viewport{max-height:260px}.image-viewport img{width:100%;max-height:none}}
</style>
