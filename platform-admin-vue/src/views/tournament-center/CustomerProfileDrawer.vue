<template>
  <el-drawer :model-value="modelValue" title="客户档案" size="min(980px, 96vw)" @update:model-value="$emit('update:modelValue', $event)">
    <div class="customer-head"><strong>{{ customer?.name || '客户档案' }}</strong><el-button :loading="loading" @click="load">刷新档案</el-button></div>
    <div v-if="loading" class="profile-state">正在读取账号与关联资料…</div>
    <el-alert v-else-if="error" :title="error" type="error" :closable="false" />
    <template v-else-if="profile">
      <p v-if="profile.organizations.length" class="org-names">关联机构：{{ profile.organizations.map(x => x.name).join('、') }}</p>
      <el-tabs v-model="tab">
        <el-tab-pane :label="`账号 ${profile.accounts.length}`" name="accounts">
          <p class="source-note">注册来源与后续绑定不同；历史未记录的来源无法确定。</p>
          <section v-for="account in profile.accounts" :key="account.id" class="account-row">
            <div class="account-title"><strong>{{ account.name }}</strong><span>{{ account.relation }}</span><el-tag :type="account.status === '正常' ? 'success' : 'info'">{{ account.status }}</el-tag></div>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="手机号">{{ account.phone || '未填写' }}</el-descriptions-item>
              <el-descriptions-item label="注册来源">{{ account.registrationSource }}</el-descriptions-item>
              <el-descriptions-item label="注册时间">{{ time(account.createTime) }}</el-descriptions-item>
              <el-descriptions-item label="最近登录">{{ time(account.lastLoginTime) }}</el-descriptions-item>
              <el-descriptions-item label="已配置登录">{{ account.loginMethods.join('、') || '未记录' }}</el-descriptions-item>
              <el-descriptions-item label="PC账号">{{ account.pcStatus }}</el-descriptions-item>
              <el-descriptions-item label="创建球队" :span="2">{{ account.createdTeams.join('、') || '未发现直接创建记录' }}</el-descriptions-item>
              <el-descriptions-item label="创建赛事" :span="2">{{ account.createdTournaments.join('、') || '未发现直接创建记录' }}</el-descriptions-item>
            </el-descriptions>
          </section>
          <el-empty v-if="!profile.accounts.length" description="未找到关联登录账号" :image-size="60" />
        </el-tab-pane>
        <el-tab-pane v-for="item in sections" :key="item.key" :name="item.key" :label="`${item.label} ${profile[item.key].length}`">
          <div class="profile-toolbar"><el-input v-model="keyword" clearable placeholder="搜索名称、创建人或球队" /><span>{{ filtered.length }} 条</span></div>
          <el-table :data="pageRows" row-key="id" empty-text="未发现关联记录">
            <el-table-column prop="name" :label="item.label + '名称'" min-width="180" />
            <el-table-column v-if="item.key === 'players'" prop="teamName" label="所属球队" min-width="170" />
            <el-table-column v-else prop="creatorName" label="创建人" min-width="130" />
            <el-table-column prop="relation" label="关联依据" min-width="120" />
            <el-table-column v-if="item.key === 'teams'" prop="playerCount" label="关联球员" width="90" />
            <el-table-column v-if="item.key !== 'players'" label="创建时间" width="170"><template #default="{ row }">{{ time(row.createTime) }}</template></el-table-column>
          </el-table>
          <el-pagination v-if="filtered.length > 30" v-model:current-page="page" :page-size="30" :total="filtered.length" layout="prev, pager, next" />
        </el-tab-pane>
      </el-tabs>
    </template>
  </el-drawer>
</template>
<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { callFunction } from '@/utils/cloud'
const props = defineProps({ modelValue: Boolean, customer: Object })
defineEmits(['update:modelValue'])
const loading = ref(false), error = ref(''), profile = ref(null), tab = ref('accounts'), keyword = ref(''), page = ref(1)
const sections = [{ key: 'teams', label: '球队' }, { key: 'tournaments', label: '赛事' }, { key: 'players', label: '球员' }]
const filtered = computed(() => (profile.value?.[tab.value] || []).filter(row => [row.name, row.creatorName, row.teamName].join(' ').toLowerCase().includes(keyword.value.toLowerCase())))
const pageRows = computed(() => filtered.value.slice((page.value - 1) * 30, page.value * 30))
watch([tab, keyword], () => { page.value = 1 })
function time(value) { const date = new Date(value?.$date || value); return value && Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { hour12: false }) : '未记录' }
let sequence = 0
async function load() {
  const current = ++sequence
  loading.value = true; error.value = ''; profile.value = null
  try {
    const result = await callFunction('manageTournamentCenterContent', { action: 'getCustomerProfile', userId: props.customer?.userId || '', orgId: props.customer?.orgId || '' })
    if (current !== sequence) return
    if (!result?.success) throw new Error(result?.error || result?.message || '档案读取失败，请刷新重试')
    profile.value = result.data
  } catch (failure) { if (current === sequence) error.value = failure.message }
  finally { if (current === sequence) loading.value = false }
}
watch(() => [props.modelValue, props.customer?.userId, props.customer?.orgId], () => {
  if (props.modelValue) { tab.value = 'accounts'; keyword.value = ''; load() }
  else { sequence++; loading.value = false }
})
onBeforeUnmount(() => { sequence++ })
</script>
<style scoped>
.customer-head,.account-title,.profile-toolbar{display:flex;align-items:center;gap:12px}.customer-head{justify-content:space-between;margin-bottom:16px}.customer-head strong{font-size:18px}.account-title{margin-bottom:12px}.account-title>span,.org-names,.source-note{font-size:13px;color:#6d7d73}.account-row{padding:16px 0;border-bottom:1px solid #e2e8e4}.profile-toolbar{margin:12px 0}.profile-toolbar .el-input{max-width:360px}.profile-toolbar span{margin-left:auto;white-space:nowrap}.profile-state{padding:30px 0;color:#6d7d73}.el-pagination{margin-top:16px}.account-row :deep(.el-descriptions__content){overflow-wrap:anywhere}@media(max-width:600px){.account-title{flex-wrap:wrap}.account-row :deep(.el-descriptions__label){min-width:65px}}
</style>
