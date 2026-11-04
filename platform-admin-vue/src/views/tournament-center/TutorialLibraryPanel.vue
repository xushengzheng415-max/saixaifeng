<template>
  <section class="library">
    <div class="toolbar"><el-input v-model="keyword" clearable placeholder="搜索教程标题" @keyup.enter="search" @clear="search" /><el-button @click="search">查询</el-button><el-button type="primary" @click="editor.open()">新建教程</el-button></div>
    <el-alert v-if="error" :title="error" type="error" :closable="false"><el-button link @click="load">重新加载</el-button></el-alert>
    <el-table v-loading="loading" :data="rows" row-key="_id">
      <el-table-column label="标题" min-width="230" show-overflow-tooltip><template #default="{ row }">{{ row.draft.title }}</template></el-table-column>
      <el-table-column label="分类" min-width="120"><template #default="{ row }">{{ row.draft.category }}</template></el-table-column>
      <el-table-column label="适用端口" min-width="140"><template #default="{ row }">{{ row.draft.audience }}</template></el-table-column>
      <el-table-column label="状态" width="160"><template #default="{ row }"><el-tag :type="row.isPublished ? 'success' : 'info'">{{ row.isPublished ? '已发布' : '未发布' }}</el-tag><small v-if="row.isPublished && JSON.stringify(row.draft) !== JSON.stringify(row.published)">有未发布修改</small></template></el-table-column>
      <el-table-column label="操作" width="260" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="editor.open(row, imageUrls)">编辑</el-button><el-button v-if="row.isPublished" link @click="read(row)">查看</el-button><el-button v-if="row.isPublished" link @click="copy(row)">复制链接</el-button><el-button v-if="row.isPublished" link type="danger" @click="withdraw(row)">下架</el-button></template></el-table-column>
      <template #empty><el-empty :description="keyword ? '未找到相关教程' : '暂无教程'" :image-size="70" /></template>
    </el-table>
    <el-pagination v-if="total > 20" v-model:current-page="page" :page-size="20" :total="total" layout="prev, pager, next" @current-change="load" />
    <TutorialEditor ref="editor" @saved="load" />
  </section>
</template>
<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { callFunction } from '@/utils/cloud'
import TutorialEditor from './TutorialEditor.vue'
const keyword = ref(''), page = ref(1), total = ref(0), rows = ref([]), loading = ref(false), error = ref(''), imageUrls = ref({}), editor = ref(null)
const link = id => 'https://www.sxffootball.cn/service-account-h5/tutorial.html?id=' + encodeURIComponent(id)
let epoch = 0
async function load() {
  const request = ++epoch; loading.value = true; error.value = ''
  try { const r = await callFunction('manageTournamentCenterContent', { action: 'tutorialList', keyword: keyword.value, page: page.value }); if (!r?.success) throw new Error(r?.error || '教程加载失败'); if (request !== epoch) return; rows.value = r.rows || []; total.value = r.total || 0; imageUrls.value = r.imageUrls || {} } catch (e) { if (request === epoch) { rows.value = []; error.value = e.message } } finally { if (request === epoch) loading.value = false }
}
function search() { page.value = 1; load() }
function read(row) { window.open(link(row._id), '_blank', 'noopener,noreferrer') }
async function copy(row) { try { await navigator.clipboard.writeText(link(row._id)); ElMessage.success('链接已复制') } catch { ElMessage.warning('复制失败，请打开教程后复制地址') } }
async function withdraw(row) {
  if (loading.value) return
  try { await ElMessageBox.confirm('下架后，已发送给客户的链接也将不可阅读。', '下架教程', { confirmButtonText: '下架', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  loading.value = true
  try { const r = await callFunction('manageTournamentCenterContent', { action: 'tutorialSave', id: row._id, revision: row.revision, mode: 'withdraw' }); if (!r?.success) throw new Error(r?.error || '下架失败'); ElMessage.success('教程已下架'); await load() } catch (e) { ElMessage.error(e.message) } finally { loading.value = false }
}
defineExpose({ refresh: load })
onMounted(load)
</script>
<style scoped>
.library{background:#fff;padding:20px;overflow:hidden}.toolbar{display:flex;gap:10px;margin-bottom:20px}.toolbar .el-input{width:280px}small{display:block;color:#8b6c22;margin-top:4px}.el-pagination{justify-content:flex-end;margin-top:16px}@media(max-width:600px){.library{padding:12px}.toolbar{flex-wrap:wrap}.toolbar .el-input{width:100%}}
</style>
