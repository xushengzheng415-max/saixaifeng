<template>
  <el-dialog :model-value="modelValue" title="邀请球队" width="min(860px, calc(100vw - 32px))" @update:model-value="$emit('update:modelValue', $event)" @closed="cancelRender">
    <img v-if="demo" :src="demoImage" class="invitation-preview" alt="球队邀请示例" />
    <el-alert v-else-if="error" :title="error" type="error" :closable="false" />
    <div v-else class="invitation-layout" v-loading="loading">
      <section class="invitation-preview-box" v-loading="rendering">
        <img v-if="posters.invitation" :src="posters.invitation" class="invitation-preview" alt="赛事球队邀请海报" />
        <el-empty v-else-if="posterError" :description="posterError"><el-button @click="$emit('retry')">重新生成</el-button></el-empty>
        <span v-else role="status">正在生成邀请海报…</span>
      </section>
      <section class="invitation-detail">
        <h3>海报样式</h3>
        <div class="poster-style-options" role="group" aria-label="海报样式"><button v-for="theme in POSTER_TEMPLATES" :key="theme.id" type="button" :class="{selected:templateId===theme.id}" :aria-pressed="templateId===theme.id" @click="templateId=theme.id"><i :style="{background:theme.ink}"></i>{{ theme.name }}</button></div>
        <h3>球队如何入驻</h3>
        <ol><li v-for="step in TEAM_ENTRY_STEPS" :key="step">{{ step }}</li></ol>
        <label v-if="result?.urlLink" class="invitation-link"><span>小程序邀请链接</span><el-input :model-value="result.urlLink" readonly /></label>
      </section>
    </div>
    <template #footer><div class="invitation-footer">
      <el-button @click="$emit('update:modelValue', false)">关闭</el-button>
      <el-button v-if="error" :loading="loading" @click="$emit('retry')">重试</el-button>
      <el-button :disabled="!result?.urlLink" @click="$emit('copy')">复制链接</el-button>
      <el-button :disabled="!posters.guide || rendering" @click="download('guide')">下载入驻指引</el-button>
      <el-button type="primary" :disabled="!posters.invitation || rendering" @click="download('invitation')">下载邀请海报</el-button>
    </div></template>
  </el-dialog>
</template>
<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { TEAM_ENTRY_STEPS, POSTER_TEMPLATES, renderTeamInvitationPosters } from '../../utils/teamInvitationPoster.js'
const props = defineProps({ modelValue:Boolean, tournament:{ type:Object, default:()=>({}) }, result:Object, loading:Boolean, error:String, demo:Boolean, demoImage:String })
defineEmits(['update:modelValue','retry','copy'])
const posters=ref({}),rendering=ref(false),posterError=ref('')
const templateId=ref('emerald')
let sequence=0
function cancelRender(){ sequence++; posters.value={}; rendering.value=false }
async function generate(){
  const current=++sequence; posters.value={}; posterError.value='';rendering.value=false
  if(!props.modelValue || props.demo)return
  if(!props.result?.qrCodeUrl){if(props.result)posterError.value='邀请未返回二维码，请重新生成';return}
  rendering.value=true
  try { const result=await renderTeamInvitationPosters({tournament:props.tournament,invitation:props.result,templateId:templateId.value});if(current===sequence)posters.value=result }
  catch(error){if(current===sequence)posterError.value=error.message || '海报生成失败，请重试'}
  finally{if(current===sequence)rendering.value=false}
}
function download(kind){
  if(!posters.value[kind])return
  const theme=POSTER_TEMPLATES.find(item=>item.id===posters.value.templateId)
  const link=document.createElement('a');link.href=posters.value[kind];link.download=`${props.tournament.name || '足球赛事'}-${theme?.name || '海报'}-${kind==='guide'?'球队入驻指引':'球队邀请海报'}.png`;link.click()
}
watch(()=>[props.modelValue,props.result,templateId.value],generate)
onUnmounted(cancelRender)
</script>
<style scoped>
.invitation-layout{display:grid;grid-template-columns:minmax(0,360px) minmax(0,1fr);gap:28px}.invitation-preview-box{display:grid;min-height:320px;place-items:center;background:#f2f6f3}.invitation-preview{display:block;width:100%;max-width:360px;margin:auto;height:auto}.invitation-detail h3{margin:0 0 18px;font-size:17px}.invitation-detail ol{padding-left:22px;margin:0;display:grid;gap:18px;line-height:1.7}.invitation-link{display:block;margin-top:24px}.invitation-link>span{display:block;margin-bottom:8px;color:#65736b;font-size:13px}.invitation-footer{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px}.invitation-footer :deep(.el-button+.el-button){margin-left:0}@media(max-width:680px){.invitation-layout{grid-template-columns:1fr}.invitation-preview{max-width:300px}.invitation-footer{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
<style scoped>
.poster-style-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 28px}.poster-style-options button{display:flex;flex-direction:column;align-items:center;gap:9px;padding:12px 4px;border:1px solid #dce5df;border-radius:6px;background:#fff;color:#52635a;cursor:pointer;font:inherit;font-size:12px}.poster-style-options button.selected{border-color:#078447;color:#076a3b;background:#f0f9f3;box-shadow:inset 0 0 0 1px #078447}.poster-style-options i{width:38px;height:5px}.poster-style-options button:focus-visible{outline:2px solid #078447;outline-offset:2px}
</style>
