<template>
  <div class="category-filter">
    <!-- 横向分类 Tab（可滚动） -->
    <div class="filter-tabs">
      <div
        v-for="cat in categories"
        :key="cat.key"
        class="filter-tab"
        :class="{ active: modelValue === cat.key }"
        @click="select(cat.key)"
      >
        {{ cat.label }}
      </div>
    </div>

    <!-- 筛选条：状态 + 排序 -->
    <div class="filter-bar">
      <div class="filter-group">
        <span class="filter-label">状态</span>
        <button
          v-for="s in statusOptions"
          :key="s.value"
          class="filter-chip"
          :class="{ active: status === s.value }"
          @click="selectStatus(s.value)"
        >{{ s.label }}</button>
      </div>
      <div class="filter-group">
        <span class="filter-label">排序</span>
        <el-select v-model="sortBy" size="small" @change="handleSortChange">
          <el-option label="最新发布" value="latest" />
          <el-option label="即将开赛" value="upcoming" />
          <el-option label="人气最高" value="hot" />
        </el-select>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

/**
 * 赛事分类筛选组件 - 精致化版本
 * 设计要求：
 * - 横向分类Tab：pill形状，active绿底白字
 * - 状态chip + 排序select（紧凑排列）
 */
const props = defineProps({
  modelValue: { type: String, default: 'all' },
  status: { type: String, default: 'all' }
})

const emit = defineEmits(['update:modelValue', 'update:status', 'change'])

const sortBy = ref('latest')

const categories = [
  { key: 'all', label: '全部' },
  { key: 'youth', label: '青少年赛事' },
  { key: 'amateur', label: '业余赛事' },
  { key: 'local', label: '地协赛' },
  { key: 'city', label: '城市联赛' },
  { key: 'professional', label: '职业联赛' }
]

const statusOptions = [
  { value: 'all', label: '全部' },
  { value: 'registering', label: '报名中' },
  { value: 'ongoing', label: '进行中' },
  { value: 'completed', label: '已结束' }
]

function select(key) {
  emit('update:modelValue', key)
  emit('change', { category: key, status: props.status, sortBy: sortBy.value })
}

function selectStatus(value) {
  emit('update:status', value)
  emit('change', { category: props.modelValue, status: value, sortBy: sortBy.value })
}

function handleSortChange(value) {
  emit('change', { category: props.modelValue, status: props.status, sortBy: value })
}
</script>

<style scoped>
.category-filter {
  background: var(--portal-bg-card, #FFFFFF);
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: var(--portal-card-shadow, 0 2px 12px rgba(0, 0, 0, 0.08));
}

/* 横向分类Tab */
.filter-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding-bottom: 4px;
}

.filter-tabs::-webkit-scrollbar {
  display: none;
}

.filter-tab {
  flex-shrink: 0;
  padding: 8px 18px;
  border-radius: var(--portal-radius-pill, 999px);
  font-size: 13px;
  color: var(--portal-text-regular, #606266);
  background: var(--portal-bg-page, #F5F7FA);
  cursor: pointer;
  transition: all 0.25s ease;
  white-space: nowrap;
  font-weight: 500;
}

.filter-tab:hover {
  background: var(--portal-primary-bg, #E8F5E9);
  color: var(--portal-primary, #1B5E20);
}

.filter-tab.active {
  background: var(--portal-gradient-hero);
  color: #FFFFFF;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(27, 94, 32, 0.3);
}

/* 筛选条 */
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--portal-border, #EBEEF5);
  align-items: center;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-label {
  font-size: 12px;
  color: var(--portal-text-secondary, #909399);
  font-weight: 500;
}

.filter-chip {
  padding: 5px 14px;
  border: 1px solid var(--portal-border, #EBEEF5);
  background: #FFFFFF;
  border-radius: var(--portal-radius-pill, 999px);
  font-size: 12px;
  color: var(--portal-text-regular, #606266);
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 500;
}

.filter-chip:hover {
  border-color: var(--portal-primary-lighter, #43A047);
  color: var(--portal-primary, #1B5E20);
  background: var(--portal-primary-bg, #E8F5E9);
}

.filter-chip.active {
  background: var(--portal-primary-bg, #E8F5E9);
  border-color: var(--portal-primary, #1B5E20);
  color: var(--portal-primary, #1B5E20);
  font-weight: 600;
}
</style>
