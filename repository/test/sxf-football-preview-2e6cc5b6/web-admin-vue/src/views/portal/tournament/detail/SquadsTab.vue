<template>
  <div class="squads-tab">
    <!-- 分组选择 -->
    <div v-if="groups.length > 0" class="group-selector">
      <el-select v-model="activeGroup" size="small" @change="handleGroupChange">
        <el-option
          v-for="g in groups"
          :key="g.value"
          :label="g.label"
          :value="g.value"
        />
      </el-select>
    </div>

    <!-- 球队列表 -->
    <div v-loading="loading" class="squads-list">
      <template v-if="teams.length > 0">
        <div class="team-grid">
          <div
            v-for="team in teams"
            :key="team.id"
            class="team-card"
            @click="goTeam(team)"
          >
            <TeamLogo :src="team.logo" :name="team.name" :size="48" :show-name="true" :vertical="true" />
            <div class="team-stats">
              <div class="stat">
                <span class="stat-label">胜</span>
                <span class="stat-value">{{ team.win }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">平</span>
                <span class="stat-value">{{ team.draw }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">负</span>
                <span class="stat-value">{{ team.lose }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
      <EmptyState v-else description="暂无参赛球队" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import TeamLogo from '../../components/TeamLogo.vue'
import EmptyState from '../../components/EmptyState.vue'

/**
 * 阵容 Tab（占位实现）
 * 展示参赛球队列表 + 简要战绩
 * 后续扩展：点击球队进入球员名单
 */
const props = defineProps({
  tournamentId: { type: [String, Number], default: '' }
})

const activeGroup = ref('all')
const loading = ref(false)

const groups = [
  { value: 'all', label: '全部球队' },
  { value: 'A', label: 'A 组' },
  { value: 'B', label: 'B 组' },
  { value: 'C', label: 'C 组' }
]

// Mock 球队数据
const teams = ref([
  { id: 'team1', name: '红魔联队', logo: '', win: 6, draw: 1, lose: 1 },
  { id: 'team2', name: '蓝焰FC', logo: '', win: 5, draw: 2, lose: 1 },
  { id: 'team3', name: '绿茵之翼', logo: '', win: 4, draw: 2, lose: 2 },
  { id: 'team4', name: '雷霆竞技', logo: '', win: 3, draw: 3, lose: 2 },
  { id: 'team5', name: '海港之星', logo: '', win: 3, draw: 2, lose: 3 },
  { id: 'team6', name: '山城联队', logo: '', win: 2, draw: 2, lose: 4 }
])

function handleGroupChange() {
  // 预留：按组筛选
}

function goTeam(team) {
  // 预留：跳转球队详情（含球员名单）
}

onMounted(() => {
  // 预留：callFunction('getTournamentTeams', { tournamentId: props.tournamentId })
})
</script>

<style scoped>
.squads-tab {
  padding: 4px 0;
}

.group-selector {
  margin-bottom: 12px;
}

.group-selector :deep(.el-select) {
  width: 120px;
}

.squads-list {
  min-height: 200px;
}

.team-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

@media (min-width: 768px) {
  .team-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }
}

@media (min-width: 1024px) {
  .team-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.team-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 14px 10px;
  background: var(--portal-bg-card, #fff);
  border-radius: var(--portal-radius-md, 10px);
  box-shadow: var(--portal-shadow-sm, 0 1px 4px rgba(0,0,0,0.06));
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.team-card:hover {
  box-shadow: var(--portal-shadow-md, 0 2px 12px rgba(0,0,0,0.08));
  border-color: var(--portal-primary-bg-strong, #C8E6C9);
}

.team-stats {
  display: flex;
  gap: 12px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-label {
  font-size: 11px;
  color: var(--portal-text-secondary, #909399);
}

.stat-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--portal-text-primary, #303133);
}
</style>
