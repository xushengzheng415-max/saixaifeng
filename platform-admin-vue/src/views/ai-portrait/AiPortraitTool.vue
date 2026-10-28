<template>
  <section class="portrait-tool">
    <div class="tool-meta"><el-tag type="info">后台自用 · 不扣蜂蜜</el-tag><el-button v-if="error" @click="restart">重新加载</el-button></div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <iframe v-else :key="version" ref="frame" :src="toolUrl" title="在线自主生成球衣照" @error="error = '生图工具加载失败，请重试'" />
  </section>
</template>
<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { callFunction } from '@/utils/cloud'
const origin = 'https://www.sxffootball.cn'
const toolUrl = origin + '/service-account-h5/ai-portrait-demo.html?adminTool=1&v=20261028-models'
const frame = ref(null)
const error = ref('')
const version = ref(0)
let request = null
function restart() { error.value = ''; request = null; version.value++ }
async function ready(event) {
  if (event.origin !== origin || event.source !== frame.value?.contentWindow || event.data?.type !== 'portrait-tool-ready') return
  try {
    request ||= callFunction('platformOwner', { action: 'createAiPortraitToolSession' })
    const reply = await request
    if (!reply?.success || !reply.ticket) throw new Error(reply?.error || '无后台生图权限，请重新登录')
    frame.value?.contentWindow.postMessage({ type: 'portrait-tool-session', ticket: reply.ticket }, origin)
  } catch (failure) {
    error.value = failure.message || '后台生图会话创建失败，请重试'
    frame.value?.contentWindow.postMessage({ type: 'portrait-tool-session', error: error.value }, origin)
  }
}
onMounted(() => window.addEventListener('message', ready))
onBeforeUnmount(() => window.removeEventListener('message', ready))
</script>
<style scoped>
.tool-meta{display:flex;align-items:center;gap:12px;margin-bottom:12px}
iframe{display:block;width:100%;height:calc(100vh - 235px);min-height:660px;border:0;background:white}
</style>
