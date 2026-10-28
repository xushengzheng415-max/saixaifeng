<template>
  <div class="platform-tablet-nav">
    <button type="button" class="platform-tablet-toggle" :aria-expanded="open" aria-controls="platform-tablet-drawer" @click="open = true">
      <el-icon :size="22"><Menu /></el-icon><span>功能菜单</span>
    </button>
    <el-drawer v-model="open" title="平台运营中心" direction="ltr" size="min(320px, 84vw)" append-to-body class="platform-tablet-drawer">
      <nav id="platform-tablet-drawer" aria-label="平台运营中心功能">
        <div class="platform-tablet-owner"><small>当前平台负责人</small><strong>{{ ownerName }}</strong></div>
        <button
          v-for="item in items"
          :key="item.key"
          type="button"
          :aria-current="activeKey === item.key ? 'page' : undefined"
          @click="select(item.key)"
        >
          <el-icon><component :is="item.icon" /></el-icon><span>{{ item.label }}</span><em v-if="item.badge">{{ item.badge }}</em>
        </button>
        <div class="platform-tablet-group-label">营销活动</div>
        <button
          v-for="item in marketingItems"
          :key="item.key"
          type="button"
          :aria-current="activeKey === item.key ? 'page' : undefined"
          @click="select(item.key)"
        >
          <el-icon><component :is="item.icon" /></el-icon><span>{{ item.label }}</span>
        </button>
        <button type="button" class="platform-tablet-home" @click="goHome">
          <el-icon><Back /></el-icon><span>返回赛事空间</span>
        </button>
      </nav>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Back, Menu } from '@element-plus/icons-vue'

const props = defineProps({
  items: { type: Array, required: true },
  marketingItems: { type: Array, default: () => [] },
  activeKey: { type: String, default: '' },
  ownerName: { type: String, default: '平台负责人' }
})
const emit = defineEmits(['select', 'home'])
const open = ref(false)

function select(key) {
  open.value = false
  emit('select', key)
}

function goHome() {
  open.value = false
  emit('home')
}

watch(() => props.activeKey, () => { open.value = false })
</script>

<style scoped>
.platform-tablet-nav { display: none; flex: 0 0 auto; }
@media (max-width: 1180px) {
  .platform-tablet-nav { display: flex; align-items: center; }
}
</style>
