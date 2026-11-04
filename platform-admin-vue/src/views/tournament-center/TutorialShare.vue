<template>
  <el-dialog v-model="visible" title="分享教程" width="min(760px, 96vw)" :close-on-click-modal="false">
    <div class="share-layout"><div><el-form label-position="top"><el-form-item label="教程链接"><el-input :model-value="link" readonly aria-label="教程链接" /></el-form-item></el-form><div class="share-actions"><el-button @click="copy">复制链接</el-button><el-button @click="openLink">打开教程</el-button></div><p class="share-note">海报二维码打开已发布教程，下架后链接也会停用。</p><el-alert v-if="error" :title="error" type="error" :closable="false"><el-button link @click="generate">重新生成</el-button></el-alert></div><div v-loading="loading" class="poster-preview"><canvas ref="poster" aria-label="教程转发海报" /></div></div>
    <template #footer><el-button @click="visible = false">关闭</el-button><el-button type="primary" :disabled="loading || !!error" @click="download">下载海报</el-button></template>
  </el-dialog>
</template>
<script setup>
import { nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { drawTutorialPoster, tutorialLink } from '@/utils/tutorialPoster'
const visible = ref(false), poster = ref(null), loading = ref(false), error = ref(''), link = ref('')
let current = null, epoch = 0
async function open(article) { current = JSON.parse(JSON.stringify(article)); link.value = tutorialLink(article.id); visible.value = true; await nextTick(); await generate() }
async function generate() { const request = ++epoch;loading.value = true;error.value = '';try { await drawTutorialPoster(poster.value,current) } catch (e) { if (request === epoch) error.value = e.message || '海报生成失败，请重试' } finally { if (request === epoch) loading.value = false } }
async function copy() { try { await navigator.clipboard.writeText(link.value); ElMessage.success('链接已复制') } catch { ElMessage.warning('复制失败，请手动复制链接') } }
function openLink() { window.open(link.value,'_blank','noopener,noreferrer') }
function download() { const a = document.createElement('a');a.href = poster.value.toDataURL('image/png');a.download = (current.title || '操作教程').replace(/[\\/:*?"<>|]/g,'').slice(0,60)+'-转发海报.png';a.click() }
defineExpose({ open })
</script>
<style scoped>
.share-layout{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:24px}.share-actions{display:flex;gap:8px;flex-wrap:wrap}.share-actions .el-button{margin-left:0}.share-note{font-size:12px;line-height:1.7;color:#69776e;margin-top:18px}.poster-preview{background:#edf1ee;padding:10px;min-height:350px}.poster-preview canvas{display:block;width:100%;height:auto;background:#fff}@media(max-width:600px){.share-layout{grid-template-columns:1fr}.poster-preview{max-width:320px;width:100%;margin:auto}}
</style>
