<template>
  <div class="guess-tab">
    <!-- 竞猜币余额 -->
    <div class="coin-balance">
      <div class="coin-info">
        <el-icon class="coin-icon"><GoldMedal /></el-icon>
        <div>
          <div class="coin-label">我的蜂蜜币</div>
          <div class="coin-value">{{ coins }}</div>
        </div>
      </div>
      <el-button type="warning" size="small" round @click="goTaskCenter">赚蜂蜜币</el-button>
    </div>

    <!-- 竞猜列表 -->
    <div v-loading="loading" class="guess-list">
      <template v-if="guesses.length > 0">
        <div
          v-for="g in guesses"
          :key="g.id"
          class="guess-card"
        >
          <div class="guess-header">
            <span class="guess-tournament">{{ g.tournamentName }}</span>
            <span class="guess-deadline">截止：{{ g.deadline }}</span>
          </div>
          <div class="guess-match">
            <span class="team-name">{{ g.homeName }}</span>
            <span class="vs-text">VS</span>
            <span class="team-name">{{ g.awayName }}</span>
          </div>
          <div class="guess-options">
            <button
              v-for="(opt, i) in g.options"
              :key="i"
              class="guess-option"
              :class="{ selected: g.selected === i }"
              :disabled="g.status !== 'open'"
              @click="selectOption(g, i)"
            >
              <span class="opt-label">{{ opt.label }}</span>
              <span class="opt-odds">{{ opt.odds }}</span>
            </button>
          </div>
          <div class="guess-footer">
            <span class="guess-pool">奖池 {{ g.pool }} 币</span>
            <span class="guess-status" :class="g.status">{{ statusText(g.status) }}</span>
          </div>
        </div>
      </template>
      <EmptyState v-else description="暂无竞猜" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { GoldMedal } from '@element-plus/icons-vue'
import EmptyState from '../../components/EmptyState.vue'

/**
 * 竞猜占位页
 * 展示竞猜列表 + 蜂蜜币余额
 */
const props = defineProps({
  tournamentId: { type: [String, Number], default: '' }
})

const coins = ref(1000)
const loading = ref(false)

// Mock 竞猜数据
const guesses = ref([
  {
    id: 'g1',
    tournamentName: '青少年锦标赛 · 第8轮',
    homeName: '红魔联队',
    awayName: '蓝焰FC',
    deadline: '今天 19:25',
    status: 'open',
    pool: 5800,
    selected: null,
    options: [
      { label: '主胜', odds: '1.85' },
      { label: '平', odds: '3.20' },
      { label: '客胜', odds: '2.10' }
    ]
  },
  {
    id: 'g2',
    tournamentName: '青少年锦标赛 · 第8轮',
    homeName: '北风竞技',
    awayName: '南方雄狮',
    deadline: '今天 20:55',
    status: 'open',
    pool: 3200,
    selected: null,
    options: [
      { label: '主胜', odds: '2.05' },
      { label: '平', odds: '3.00' },
      { label: '客胜', odds: '1.95' }
    ]
  }
])

function selectOption(guess, index) {
  if (guess.status !== 'open') return
  guess.selected = index
  ElMessage.success(`已选择：${guess.options[index].label}（赔率 ${guess.options[index].odds}）`)
  // 预留：callFunction('submitGuess', { guessId: guess.id, optionIndex: index })
}

function statusText(status) {
  const map = { open: '竞猜中', closed: '已截止', settled: '已开奖' }
  return map[status] || status
}

function goTaskCenter() {
  ElMessage.info('任务中心开发中')
}

onMounted(() => {
  // 预留：callFunction('getGuessList', { tournamentId: props.tournamentId })
})
</script>

<style scoped>
.guess-tab {
  padding: 4px 0;
}

.coin-balance {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: linear-gradient(135deg, #FFC107, #FF9800);
  border-radius: var(--portal-radius-md, 10px);
  margin-bottom: 14px;
}

.coin-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.coin-icon {
  font-size: 32px;
  color: #5D4037;
}

.coin-label {
  font-size: 12px;
  color: rgba(93, 64, 55, 0.85);
}

.coin-value {
  font-size: 22px;
  font-weight: 700;
  color: #5D4037;
  font-variant-numeric: tabular-nums;
}

.guess-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 200px;
}

.guess-card {
  background: var(--portal-bg-card, #fff);
  border: 1px solid var(--portal-border, #ebeef5);
  border-radius: var(--portal-radius-md, 10px);
  padding: 12px;
}

.guess-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.guess-tournament {
  font-size: 12px;
  color: var(--portal-text-secondary, #909399);
}

.guess-deadline {
  font-size: 11px;
  color: var(--portal-danger, #f56c6c);
}

.guess-match {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 10px;
}

.team-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--portal-text-primary, #303133);
}

.vs-text {
  font-size: 12px;
  color: var(--portal-text-secondary, #909399);
}

.guess-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 10px;
}

.guess-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px;
  border: 1px solid var(--portal-border, #ebeef5);
  background: #fff;
  border-radius: var(--portal-radius-sm, 6px);
  cursor: pointer;
  transition: all 0.2s;
}

.guess-option:hover:not(:disabled) {
  border-color: var(--portal-primary-lighter, #43A047);
  background: var(--portal-primary-bg, #E8F5E9);
}

.guess-option.selected {
  border-color: var(--portal-primary-light, #2E7D32);
  background: var(--portal-primary-bg-strong, #C8E6C9);
}

.guess-option:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.opt-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--portal-text-primary, #303133);
}

.opt-odds {
  font-size: 12px;
  color: var(--portal-danger, #f56c6c);
  font-weight: 600;
}

.guess-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 8px;
  border-top: 1px dashed var(--portal-border, #ebeef5);
}

.guess-pool {
  font-size: 11px;
  color: var(--portal-gold, #FFC107);
  font-weight: 600;
}

.guess-status {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: var(--portal-radius-pill, 999px);
}

.guess-status.open {
  background: var(--portal-primary-bg, #E8F5E9);
  color: var(--portal-primary-light, #2E7D32);
}

.guess-status.closed {
  background: #F4F4F5;
  color: var(--portal-text-secondary, #909399);
}

.guess-status.settled {
  background: #FDF6EC;
  color: #E6A23C;
}
</style>
