<template>
  <div class="visual-lineup-editor" :class="{ 'is-dual-mode': props.mode === 'dual' }">
    <!-- 单队模式 -->
    <template v-if="!props.mode || props.mode === 'single'">
      <!-- 顶部工具栏 -->
      <div class="editor-toolbar">
        <div class="toolbar-left">
          <h2 class="editor-title">阵容编辑器</h2>
        </div>
        <div class="toolbar-center">
          <el-form :inline="true" class="formation-selector">
            <el-form-item label="比赛人数">
              <el-select
                v-model="selectedPlayerCount"
                placeholder="选择人数"
                @change="handlePlayerCountChange"
                style="width: 120px"
              >
                <el-option
                  v-for="count in playerCounts"
                  :key="count"
                  :label="count + '人制'"
                  :value="count"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="阵型">
              <el-select
                v-model="selectedFormationId"
                placeholder="选择阵型"
                :disabled="!selectedPlayerCount"
                @change="handleFormationChange"
                style="width: 150px"
              >
                <el-option
                  v-for="formation in availableFormations"
                  :key="formation.id"
                  :label="formation.name"
                  :value="formation.id"
                />
              </el-select>
            </el-form-item>
          </el-form>
        </div>
        <div class="toolbar-right">
          <el-button type="primary" @click="handleSave" :loading="saving">
            <el-icon><Check /></el-icon>
            保存阵容
          </el-button>
        </div>
      </div>

      <!-- 阵容编辑区域 -->
      <div class="editor-content" ref="editorContentRef">
        <div class="football-field-wrapper">
          <div class="football-field" ref="fieldRef">
            <div class="field-background" :style="{ backgroundImage: `url(${fieldBgImage})` }"></div>
            <div
              v-for="pos in currentPositions"
              :key="pos.role"
              class="player-slot"
              :style="{
                left: pos.x + '%',
                top: pos.y + '%'
              }"
              @click="handlePlayerSlotClick(pos)"
            >
              <PlayerCard
                :player="assignedPlayers[pos.role] || null"
                :mini="true"
                :slot-label="pos.label"
              />
              <div class="position-label">{{ pos.label }}</div>
            </div>
          </div>
          <div class="field-bottom-area">
            <div class="substitutes-section">
              <div class="substitutes-header">
                <span class="substitutes-title">替补席</span>
                <el-tag size="small" type="info">{{ substitutePlayers.length }} 人</el-tag>
              </div>
              <div class="substitutes-list">
                <div
                  v-for="player in substitutePlayers"
                  :key="player.id"
                  class="substitute-card"
                  :class="{ 'is-assigned': isPlayerAssigned(player.id) }"
                  @click="handleSubstituteClick(player)"
                >
                  <div class="sub-avatar">
                    <img v-if="player.photo" :src="player.photo" :alt="player.name" />
                    <div v-else class="sub-avatar-placeholder">{{ getInitials(player.name) }}</div>
                  </div>
                  <div class="sub-info">
                    <div class="sub-name">{{ player.name }}</div>
                    <div class="sub-meta">
                      <span v-if="player.number" class="sub-number">#{{ player.number }}</span>
                      <span v-if="player.position" class="sub-position">{{ player.position }}</span>
                    </div>
                  </div>
                  <div v-if="isPlayerAssigned(player.id)" class="sub-status">
                    <el-tag size="small" type="success">首发</el-tag>
                  </div>
                </div>
                <div v-if="substitutePlayers.length === 0" class="empty-substitutes">
                  暂无替补球员
                </div>
              </div>
            </div>
            <div class="action-buttons-section">
              <el-button @click="handleExportImage" size="default">
                <el-icon><Picture /></el-icon>
                导出图片
              </el-button>
              <el-button @click="handleExportPDF" size="default">
                <el-icon><Document /></el-icon>
                导出PDF
              </el-button>
              <el-button type="primary" @click="handleSave" :loading="saving" size="default">
                <el-icon><Check /></el-icon>
                保存阵容
              </el-button>
              <el-button @click="handleReset" size="default">
                <el-icon><RefreshRight /></el-icon>
                重置阵容
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 双队模式：完整足球场左右对称 -->
    <template v-if="props.mode === 'dual'">
      <!-- 顶部工具栏 -->
      <div class="editor-toolbar dual-toolbar">
        <div class="toolbar-left">
          <h2 class="editor-title">{{ props.homeTeamName || '主队' }} vs {{ props.awayTeamName || '客队' }}</h2>
        </div>
        <div class="toolbar-center dual-formations">
          <el-form :inline="true">
            <el-form-item label="比赛人数">
              <el-select
                v-model="selectedPlayerCount"
                placeholder="选择人数"
                @change="handlePlayerCountChangeDual"
                style="width: 100px"
              >
                <el-option
                  v-for="count in playerCounts"
                  :key="count"
                  :label="count + '人制'"
                  :value="count"
                />
              </el-select>
            </el-form-item>
            <el-form-item>
              <template #label>
                <span style="color:#f56c6c;font-weight:600;">{{ props.homeTeamName || '主队' }}</span>
              </template>
              <el-select
                v-model="homeSelectedFormationId"
                placeholder="阵型"
                :disabled="!selectedPlayerCount"
                @change="handleHomeFormationChange"
                style="width: 120px"
              >
                <el-option
                  v-for="formation in availableFormations"
                  :key="formation.id"
                  :label="formation.name"
                  :value="formation.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item>
              <template #label>
                <span style="color:#e6a23c;font-weight:600;">{{ props.awayTeamName || '客队' }}</span>
              </template>
              <el-select
                v-model="awaySelectedFormationId"
                placeholder="阵型"
                :disabled="!selectedPlayerCount"
                @change="handleAwayFormationChange"
                style="width: 120px"
              >
                <el-option
                  v-for="formation in availableFormations"
                  :key="formation.id"
                  :label="formation.name"
                  :value="formation.id"
                />
              </el-select>
            </el-form-item>
          </el-form>
        </div>
        <div class="toolbar-right">
          <el-button @click="handleExportImageDual" size="default">
            <el-icon><Picture /></el-icon>
            导出
          </el-button>
          <el-button type="primary" @click="handleSaveDual" :loading="saving">
            <el-icon><Check /></el-icon>
            保存双方阵容
          </el-button>
        </div>
      </div>

      <!-- 球队信息栏（球场上方） -->
      <div class="dual-team-header">
        <div class="dual-team-info home-info">
          <div class="dual-team-logo" :class="{ 'has-logo': props.homeTeamLogo }">
            <img v-if="props.homeTeamLogo" :src="props.homeTeamLogo" @error="$event.target.style.display='none'" />
            <div v-else class="dual-team-logo-placeholder home-color">{{ getTeamInitials(props.homeTeamName) }}</div>
          </div>
          <div class="dual-team-title">{{ props.homeTeamName || '主队' }}</div>
        </div>
        <div class="dual-vs-divider">VS</div>
        <div class="dual-team-info away-info">
          <div class="dual-team-logo" :class="{ 'has-logo': props.awayTeamLogo }">
            <img v-if="props.awayTeamLogo" :src="props.awayTeamLogo" @error="$event.target.style.display='none'" />
            <div v-else class="dual-team-logo-placeholder away-color">{{ getTeamInitials(props.awayTeamName) }}</div>
          </div>
          <div class="dual-team-title">{{ props.awayTeamName || '客队' }}</div>
        </div>
      </div>

      <!-- 足球场主体 -->
      <div class="dual-field-outer">
        <div class="dual-field-container" ref="dualFieldRef" :style="{ backgroundImage: `url(${fieldBgImage})` }">
          <!-- 实际球场边界（黄框区域） -->
          <div class="field-boundary">
            <!-- 主队球员（左半场：x映射到0%-50%） -->
            <div
              v-for="pos in homeCurrentPositions"
              :key="'home-slot-' + pos.role"
              class="dual-player-slot home-player"
              :class="{ 'is-empty': !homeAssignedPlayers[pos.role] }"
              :style="{
                left: (pos.x * 0.5) + '%',
                top: pos.y + '%'
              }"
              @click="handleHomePlayerSlotClick(pos)"
            >
              <!-- 已分配球员：PlayerCard 缩小版 -->
              <template v-if="homeAssignedPlayers[pos.role]">
                <div class="slot-card-wrapper">
                  <PlayerCard :player="toCardPlayer(homeAssignedPlayers[pos.role])" :teamLogo="props.homeTeamLogo" />
                </div>
              </template>
              <!-- 空位 -->
              <template v-else>
                <div class="slot-empty-circle">
                  <span class="slot-empty-icon">+</span>
                </div>
                <div class="slot-empty-label">{{ pos.label }}</div>
              </template>
            </div>

            <!-- 客队球员（右半场：x映射到50%-100%，y不变） -->
            <div
              v-for="pos in awayCurrentPositions"
              :key="'away-slot-' + pos.role"
              class="dual-player-slot away-player"
              :class="{ 'is-empty': !awayAssignedPlayers[pos.role] }"
              :style="{
                left: (50 + pos.x * 0.5) + '%',
                top: pos.y + '%'
              }"
              @click="handleAwayPlayerSlotClick(pos)"
            >
              <!-- 已分配球员：PlayerCard 缩小版 -->
              <template v-if="awayAssignedPlayers[pos.role]">
                <div class="slot-card-wrapper">
                  <PlayerCard :player="toCardPlayer(awayAssignedPlayers[pos.role])" :teamLogo="props.awayTeamLogo" />
                </div>
              </template>
              <!-- 空位 -->
              <template v-else>
                <div class="slot-empty-circle">
                  <span class="slot-empty-icon">+</span>
                </div>
                <div class="slot-empty-label">{{ pos.label }}</div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- 替补席区域 -->
      <div class="dual-substitutes-bar">
        <!-- 主队替补席 -->
        <div class="dual-squad-bench home-squad-bench">
          <div class="bench-section" style="flex: 1; min-width: auto;">
            <div class="bench-header">
              <span class="bench-title" style="color:#f56c6c;">{{ props.homeTeamName || '主队' }} 替补席</span>
              <el-tag size="small" type="info">{{ homeBench.length }} / {{ maxBenchSlots }} 人</el-tag>
            </div>
            <div class="bench-list">
              <div
                v-for="player in homeBench"
                :key="'hb-' + getPlayerId(player)"
                class="bench-card has-remove"
                @click="handleHomeBenchRemove(player)"
              >
                <div class="bench-avatar">
                  <img v-if="player.photo" :src="player.photo" :alt="player.name" />
                  <div v-else class="bench-placeholder" style="background: linear-gradient(135deg, #f56c6c 0%, #c62828 100%);">{{ getInitials(player.name) }}</div>
                </div>
                <div class="bench-name">{{ player.name }}</div>
                <div class="bench-meta">
                  <span v-if="player.number" class="bench-num">#{{ player.number }}</span>
                </div>
              </div>
              <div
                v-for="idx in homeEmptyBenchSlots"
                :key="'he-' + idx"
                class="bench-empty-slot"
                @click="handleHomeBenchSlotClick"
              >
                <span class="bench-empty-icon">+</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 客队替补席 -->
        <div class="dual-squad-bench away-squad-bench">
          <div class="bench-section" style="flex: 1; min-width: auto;">
            <div class="bench-header">
              <span class="bench-title" style="color:#e6a23c;">{{ props.awayTeamName || '客队' }} 替补席</span>
              <el-tag size="small" type="info">{{ awayBench.length }} / {{ maxBenchSlots }} 人</el-tag>
            </div>
            <div class="bench-list">
              <div
                v-for="player in awayBench"
                :key="'ab-' + getPlayerId(player)"
                class="bench-card has-remove"
                @click="handleAwayBenchRemove(player)"
              >
                <div class="bench-avatar">
                  <img v-if="player.photo" :src="player.photo" :alt="player.name" />
                  <div v-else class="bench-placeholder" style="background: linear-gradient(135deg, #e6a23c 0%, #d48806 100%);">{{ getInitials(player.name) }}</div>
                </div>
                <div class="bench-name">{{ player.name }}</div>
                <div class="bench-meta">
                  <span v-if="player.number" class="bench-num">#{{ player.number }}</span>
                </div>
              </div>
              <div
                v-for="idx in awayEmptyBenchSlots"
                :key="'ae-' + idx"
                class="bench-empty-slot"
                @click="handleAwayBenchSlotClick"
              >
                <span class="bench-empty-icon">+</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 球员选择对话框（单队模式） -->
    <el-dialog
      v-if="!props.mode || props.mode === 'single'"
      v-model="showPlayerDialog"
      title="选择球员"
      width="600px"
      :close-on-click-modal="false"
    >
      <div class="player-select-dialog">
        <div class="dialog-info">
          <el-tag type="info">当前位置: {{ currentSlot?.label }}</el-tag>
        </div>
        <el-input
          v-model="playerSearchQuery"
          placeholder="搜索球员姓名/号码"
          clearable
          class="search-input"
          @input="handlePlayerSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <div class="player-list">
          <div
            v-for="player in filteredPlayers"
            :key="player.id"
            class="player-list-item"
            :class="{ 'is-assigned': isPlayerAssigned(player.id) && assignedPlayers[currentSlot?.role]?.id !== player.id }"
            @click="handlePlayerSelect(player)"
          >
            <div class="player-avatar">
              <img v-if="player.photo" :src="player.photo" :alt="player.name" />
              <div v-else class="avatar-placeholder">{{ getInitials(player.name) }}</div>
            </div>
            <div class="player-details">
              <div class="player-name">{{ player.name }}</div>
              <div class="player-meta">
                <span v-if="player.number">#{{ player.number }}</span>
                <span v-if="player.position">{{ player.position }}</span>
              </div>
            </div>
            <div v-if="isPlayerAssigned(player.id)" class="player-status">
              <el-tag size="small" :type="assignedPlayers[currentSlot?.role]?.id === player.id ? 'success' : 'warning'">
                {{ assignedPlayers[currentSlot?.role]?.id === player.id ? '当前位置' : '已安排' }}
              </el-tag>
            </div>
          </div>
          <div v-if="filteredPlayers.length === 0" class="empty-players">
            暂无可用球员
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showPlayerDialog = false">取消</el-button>
        <el-button type="danger" @click="handlePlayerRemove" v-if="currentSlot && assignedPlayers[currentSlot.role]">
          移除该球员
        </el-button>
      </template>
    </el-dialog>

    <!-- 球员选择对话框（双队模式） -->
    <el-dialog
      v-if="props.mode === 'dual'"
      v-model="showPlayerDialog"
      :title="selectingForBench ? '选择替补球员' : '选择球员'"
      width="600px"
      :close-on-click-modal="false"
    >
      <div class="player-select-dialog">
        <div class="dialog-info">
          <el-tag :type="dualDialogTeamSide === 'home' ? 'danger' : 'warning'">
            {{ dualDialogTeamSide === 'home' ? (props.homeTeamName || '主队') : (props.awayTeamName || '客队') }} — {{ selectingForBench ? '替补席' : '当前位置: ' + currentSlot?.label }}
          </el-tag>
        </div>
        <el-input
          v-model="playerSearchQuery"
          placeholder="搜索球员姓名/号码"
          clearable
          class="search-input"
          @input="handlePlayerSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <div class="player-list">
          <div
            v-for="player in dualFilteredPlayers"
            :key="getPlayerId(player) || player.name"
            class="player-list-item"
            :class="{
              'is-assigned': (getPlayerDisplayStatus(player).onField || getPlayerDisplayStatus(player).onBench) && !getPlayerDisplayStatus(player).isCurrent,
              'is-current-slot': getPlayerDisplayStatus(player).isCurrent
            }"
            @click="handleDualPlayerSelect(player)"
          >
            <div class="player-avatar">
              <img v-if="player.photo" :src="player.photo" :alt="player.name" />
              <div v-else class="avatar-placeholder">{{ getInitials(player.name) }}</div>
            </div>
            <div class="player-details">
              <div class="player-name">{{ player.name }}</div>
              <div class="player-meta">
                <span v-if="player.number">#{{ player.number }}</span>
                <span v-if="player.position">{{ player.position }}</span>
              </div>
            </div>
            <div v-if="getPlayerDisplayStatus(player).statusText" class="player-status">
              <el-tag size="small" :type="getPlayerDisplayStatus(player).statusType">
                {{ getPlayerDisplayStatus(player).statusText }}
              </el-tag>
            </div>
          </div>
          <div v-if="dualFilteredPlayers.length === 0" class="empty-players">
            暂无可用球员
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showPlayerDialog = false">取消</el-button>
        <el-button type="danger" @click="handleDualPlayerRemove" v-if="!selectingForBench && currentSlot && dualCurrentAssignedPlayers[currentSlot.role]">
          移除该球员
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Check,
  Picture,
  Document,
  Search,
  RefreshRight
} from '@element-plus/icons-vue'
import PlayerCard from '@/components/player/PlayerCard.vue'
import formationData from '@/data/formation-data.json'
import fieldBgImage from '@/assets/images/football-field-dual.jpg'

// ==================== Props ====================
const props = defineProps({
  matchId: { type: String, default: undefined },
  teamId: { type: String, default: undefined },
  teamSide: { type: String, default: undefined },
  players: { type: Array, default: () => [] },
  initialLineup: { type: Object, default: undefined },
  onSave: { type: Function, default: undefined },
  playerCount: { type: Number, default: undefined },
  substitutePlayerLimit: { type: Number, default: undefined },
  // 双队模式
  mode: { type: String, default: 'single' },
  homeTeamName: { type: String, default: '' },
  awayTeamName: { type: String, default: '' },
  homeTeamLogo: { type: String, default: '' },
  awayTeamLogo: { type: String, default: '' },
  homePlayersList: { type: Array, default: () => [] },
  awayPlayersList: { type: Array, default: () => [] },
  homeInitialLineup: { type: Object, default: undefined },
  awayInitialLineup: { type: Object, default: undefined },
})

// ==================== 工具函数 ====================
function mirrorPositions(positions) {
  // 客队左右镜像：x 镜像，y 不变，label 互换左/右
  return positions.map(p => ({
    ...p,
    x: 100 - p.x,
    y: p.y,
    label: p.label
      .replace(/左/g, '__TMP__')
      .replace(/右/g, '左')
      .replace(/__TMP__/g, '右')
  }))
}

function getInitials(name) {
  if (!name) return '?'
  return name.length >= 2 ? name.slice(-2) : name
}

function getTeamInitials(name) {
  if (!name) return '?'
  // 取第一个字符，或者前两个字符
  return name.slice(0, 2)
}

// 安全获取球员ID（兼容 id 和 _id）
function getPlayerId(player) {
  if (!player) return null
  return player.id || player._id || null
}

// 把阵容中的球员数据映射为 PlayerCard 需要的格式
function toCardPlayer(player) {
  if (!player) return null
  return {
    ...player,
    jerseyNumber: player.number || player.jerseyNumber || '--',
    photoUrl: player.photo || player.photoUrl || '',
    position: player.position || '',
    jerseyName: player.jerseyName || ''
  }
}

// 获取球衣名：优先用 jerseyName，否则生成拼音缩写
function getJerseyName(player) {
  if (player?.jerseyName) return player.jerseyName
  const name = player?.name
  if (!name) return ''
  // 两字：姓全拼 + 名首字母.
  // 三字：姓全拼 + 名1首字母.名2首字母.
  const pinyinMap = {
    '郑': 'ZHENG', '旭': 'XU', '升': 'SHENG',
    '李': 'LI', '王': 'WANG', '张': 'ZHANG', '刘': 'LIU',
    '陈': 'CHEN', '杨': 'YANG', '赵': 'ZHAO', '黄': 'HUANG',
    '周': 'ZHOU', '吴': 'WU', '徐': 'XU', '孙': 'SUN',
    '马': 'MA', '朱': 'ZHU', '胡': 'HU', '郭': 'GUO',
    '林': 'LIN', '何': 'HE', '高': 'GAO', '罗': 'LUO',
    '梁': 'LIANG', '宋': 'SONG', '郑': 'ZHENG', '谢': 'XIE',
    '韩': 'HAN', '唐': 'TANG', '冯': 'FENG', '于': 'YU',
    '董': 'DONG', '萧': 'XIAO', '程': 'CHENG', '曹': 'CAO',
    '袁': 'YUAN', '邓': 'DENG', '许': 'XU', '傅': 'FU',
    '沈': 'SHEN', '曾': 'ZENG', '彭': 'PENG', '吕': 'LV',
    '苏': 'SU', '卢': 'LU', '蒋': 'JIANG', '蔡': 'CAI',
    '贾': 'JIA', '丁': 'DING', '魏': 'WEI', '薛': 'XUE',
    '叶': 'YE', '阎': 'YAN', '余': 'YU', '潘': 'PAN',
    '杜': 'DU', '戴': 'DAI', '夏': 'XIA', '钟': 'ZHONG',
    '汪': 'WANG', '田': 'TIAN', '任': 'REN', '姜': 'JIANG',
    '范': 'FAN', '方': 'FANG', '石': 'SHI', '姚': 'YAO',
    '谭': 'TAN', '廖': 'LIAO', '邹': 'ZOU', '熊': 'XIONG',
    '金': 'JIN', '陆': 'LU', '郝': 'HAO', '孔': 'KONG',
    '白': 'BAI', '崔': 'CUI', '康': 'KANG', '毛': 'MAO',
    '邱': 'QIU', '秦': 'QIN', '江': 'JIANG', '史': 'SHI',
    '顾': 'GU', '侯': 'HOU', '邵': 'SHAO', '孟': 'MENG',
    '龙': 'LONG', '万': 'WAN', '段': 'DUAN', '雷': 'LEI',
    '钱': 'QIAN', '汤': 'TANG', '尹': 'YIN', '易': 'YI',
    '黎': 'LI', '向': 'XIANG', '乔': 'QIAO', '文': 'WEN',
    '祁': 'QI', '狄': 'DI', '米': 'MI', '安': 'AN',
    '耿': 'GENG', '关': 'GUAN', '温': 'WEN', '鲁': 'LU'
  }
  if (name.length === 2) {
    const sur = pinyinMap[name[0]] || name[0]
    const given = pinyinMap[name[1]] ? pinyinMap[name[1]][0] : name[1]
    return (sur + ' ' + given + '.').toUpperCase()
  }
  if (name.length >= 3) {
    const sur = pinyinMap[name[0]] || name[0]
    const g1 = pinyinMap[name[1]] ? pinyinMap[name[1]][0] : name[1]
    const g2 = pinyinMap[name[2]] ? pinyinMap[name[2]][0] : name[2]
    return (sur + ' ' + g1 + '.' + g2 + '.').toUpperCase()
  }
  return name.toUpperCase()
}

// ==================== 共享：阵型数据 ====================
const selectedPlayerCount = ref(null)

const playerCounts = computed(() => {
  return Object.keys(formationData)
    .filter(key => key.includes('人制'))
    .map(key => parseInt(key.replace('人制', '')))
    .filter(num => !isNaN(num))
    .sort((a, b) => a - b)
})

const availableFormations = computed(() => {
  if (!selectedPlayerCount.value) return []
  const key = selectedPlayerCount.value + '人制'
  const data = formationData[key]
  if (!data || !data.formations) return []
  return Object.entries(data.formations)
    .filter(([, formation]) => {
      const positions = Array.isArray(formation.positions) ? formation.positions : []
      const goalkeeperCount = positions.filter(position => position.role === 'GK').length
      return positions.length === selectedPlayerCount.value && goalkeeperCount === 1
    })
    .map(([id, f]) => ({
      id,
      name: f.name,
      description: f.description,
      positions: f.positions
    }))
})

// ==================== 单队模式状态 ====================
const editorContentRef = ref(null)
const fieldRef = ref(null)
const selectedFormationId = ref('')
const assignedPlayers = ref({})
const showPlayerDialog = ref(false)
const currentSlot = ref(null)
const playerSearchQuery = ref('')
const saving = ref(false)

// 字段映射：将球员数据库字段 jerseyNumber 映射为 number（兼容两种字段名）
function mapPlayerFields(player) {
  if (!player) return player
  return {
    ...player,
    number: player.number ?? player.jerseyNumber ?? null,
    id: player.id || player._id || player.name,
  }
}
const teamPlayers = ref((props.players || []).map(mapPlayerFields))

const currentFormation = computed(() => {
  if (!selectedPlayerCount.value || !selectedFormationId.value) return null
  return availableFormations.value.find(f => f.id === selectedFormationId.value) || null
})

const currentPositions = computed(() => {
  return currentFormation.value?.positions || []
})

const substitutePlayers = computed(() => {
  const assignedIds = Object.values(assignedPlayers.value).map(p => p.id)
  return teamPlayers.value.filter(p => !assignedIds.includes(p.id))
})

const filteredPlayers = computed(() => {
  const q = playerSearchQuery.value.toLowerCase()
  if (!q) return teamPlayers.value
  return teamPlayers.value.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.number && p.number.toString().includes(q))
  )
})

// ==================== 双队模式状态 ====================
const dualFieldRef = ref(null)
const homeSelectedFormationId = ref('')
const awaySelectedFormationId = ref('')
const homeAssignedPlayers = ref({})
const awayAssignedPlayers = ref({})
const homeLineupEdited = ref(false)
const awayLineupEdited = ref(false)
const dualDialogTeamSide = ref('home')
const dualCurrentSlot = ref(null)

const homePlayers = ref([...(props.homePlayersList || [])].map(mapPlayerFields))
const awayPlayers = ref([...(props.awayPlayersList || [])].map(mapPlayerFields))

// 手动管理的替补席
const homeBench = ref([])
const awayBench = ref([])

// 替补席选择模式
const selectingForBench = ref(false)

// 替补席容量
const maxBenchSlots = computed(() => {
  const ruleLimit = Number(props.substitutePlayerLimit)
  if (Number.isFinite(ruleLimit) && ruleLimit >= 0) return ruleLimit
  const rule = getSubstituteRule(selectedPlayerCount.value || 11)
  return rule.maxSubs
})

const homeEmptyBenchSlots = computed(() => Math.max(0, maxBenchSlots.value - homeBench.value.length))
const awayEmptyBenchSlots = computed(() => Math.max(0, maxBenchSlots.value - awayBench.value.length))

// 主队（左半场）：直接使用 formation-data.json 原始坐标
const homeCurrentPositions = computed(() => {
  const f = availableFormations.value.find(f => f.id === homeSelectedFormationId.value)
  if (!f || !f.positions) return []
  return f.positions
})

// 客队（右半场）：左右镜像（x 镜像，y 不变）
const awayCurrentPositions = computed(() => {
  const f = availableFormations.value.find(f => f.id === awaySelectedFormationId.value)
  if (!f || !f.positions) return []
  return mirrorPositions(f.positions)
})

// 球员库：未在场上也不在替补席的球员
const homeSquadPlayers = computed(() => {
  const fieldIds = Object.values(homeAssignedPlayers.value).map(p => getPlayerId(p)).filter(Boolean)
  const benchIds = homeBench.value.map(p => getPlayerId(p)).filter(Boolean)
  const usedIds = new Set([...fieldIds, ...benchIds])
  return homePlayers.value.filter(p => {
    const pid = getPlayerId(p)
    return pid && !usedIds.has(pid)
  })
})

const awaySquadPlayers = computed(() => {
  const fieldIds = Object.values(awayAssignedPlayers.value).map(p => getPlayerId(p)).filter(Boolean)
  const benchIds = awayBench.value.map(p => getPlayerId(p)).filter(Boolean)
  const usedIds = new Set([...fieldIds, ...benchIds])
  return awayPlayers.value.filter(p => {
    const pid = getPlayerId(p)
    return pid && !usedIds.has(pid)
  })
})

// 替补席：手动管理的替补球员
const homeSubstitutePlayers = computed(() => homeBench.value)
const awaySubstitutePlayers = computed(() => awayBench.value)

const dualFilteredPlayers = computed(() => {
  const q = playerSearchQuery.value.toLowerCase()
  const list = dualDialogTeamSide.value === 'home' ? homePlayers.value : awayPlayers.value
  if (!q) return list
  return list.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.number && p.number.toString().includes(q))
  )
})

// 双队弹窗中的当前已分配球员
const dualCurrentAssignedPlayers = computed(() => {
  return dualDialogTeamSide.value === 'home' ? homeAssignedPlayers : awayAssignedPlayers
})

// 当前弹窗槽位已分配的球员ID（用于标签显示）
const currentSlotPlayerId = computed(() => {
  const target = dualDialogTeamSide.value === 'home' ? homeAssignedPlayers.value : awayAssignedPlayers.value
  const slot = currentSlot.value
  if (!slot?.role) return null
  const player = target[slot.role]
  return getPlayerId(player)
})

function isDualPlayerAssigned(playerId) {
  if (!playerId) return false
  const homeIds = Object.values(homeAssignedPlayers.value).map(p => getPlayerId(p)).filter(Boolean)
  const awayIds = Object.values(awayAssignedPlayers.value).map(p => getPlayerId(p)).filter(Boolean)
  return homeIds.includes(playerId) || awayIds.includes(playerId)
}

// ==================== 单队模式：阵型变化 ====================
function handlePlayerCountChange() {
  selectedFormationId.value = ''
  assignedPlayers.value = {}
}

function handleFormationChange() {
}

// ==================== 单队模式：球员选择 ====================
function handlePlayerSlotClick(pos) {
  currentSlot.value = pos
  playerSearchQuery.value = ''
  showPlayerDialog.value = true
}

function isPlayerAssigned(playerId) {
  if (!playerId) return false
  return Object.values(assignedPlayers.value).some(p => getPlayerId(p) === playerId)
}

function handlePlayerSelect(player) {
  if (!currentSlot.value) return
  const playerId = getPlayerId(player)
  if (!playerId) {
    ElMessage.warning('球员数据异常，缺少ID')
    return
  }
  const dup = Object.entries(assignedPlayers.value).find(([, p]) => getPlayerId(p) === playerId)
  if (dup && dup[0] !== currentSlot.value.role) {
    ElMessage.warning('该球员已在阵容中')
    return
  }
  assignedPlayers.value = { ...assignedPlayers.value, [currentSlot.value.role]: player }
  showPlayerDialog.value = false
  ElMessage.success('已分配 ' + player.name + ' 到 ' + currentSlot.value.label)
}

function handlePlayerRemove() {
  if (!currentSlot.value) return
  const next = { ...assignedPlayers.value }
  delete next[currentSlot.value.role]
  assignedPlayers.value = next
  showPlayerDialog.value = false
  ElMessage.success('已移除该球员')
}

function handleSubstituteClick(player) {
  if (!selectedFormationId.value) {
    ElMessage.warning('请先选择阵型')
    return
  }
  const empty = currentPositions.value.find(pos => !assignedPlayers.value[pos.role])
  if (empty) {
    currentSlot.value = empty
    handlePlayerSelect(player)
  } else {
    currentSlot.value = currentPositions.value[0]
    playerSearchQuery.value = ''
    showPlayerDialog.value = true
    setTimeout(() => handlePlayerSelect(player), 100)
  }
}

// ==================== 单队模式：保存/重置/导出 ====================
async function handleSave() {
  if (!selectedPlayerCount.value || !selectedFormationId.value) {
    ElMessage.warning('请先选择比赛人数和阵型')
    return
  }
  saving.value = true
  try {
    const lineup = buildSingleLineup(assignedPlayers.value, selectedFormationId.value, substitutePlayers.value)
    if (props.onSave) {
      props.onSave(lineup)
    } else {
      ElMessage.success('阵容已更新（未连接到保存接口）')
    }
  } catch (e) {
    ElMessage.error('保存失败: ' + (e.message || e))
  } finally {
    saving.value = false
  }
}

function buildSingleLineup(assigned, formationId, subs) {
  return {
    formation: formationId,
    players: Object.entries(assigned).map(([role, p]) => ({
      id: p.id, name: p.name, number: p.number, position: p.position,
      jerseyName: p.jerseyName || '', isCaptain: p.isCaptain || false,
      isForeign: p.isForeign || false, role
    })),
    substitutes: subs.map(p => ({
      id: p.id, name: p.name, number: p.number, position: p.position,
      jerseyName: p.jerseyName || '', isCaptain: p.isCaptain || false,
      isForeign: p.isForeign || false
    }))
  }
}

async function handleReset() {
  try {
    await ElMessageBox.confirm('确定要清空所有位置上的球员吗？', '重置阵容', {
      confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning'
    })
    assignedPlayers.value = {}
    ElMessage.success('阵容已重置')
  } catch (e) {}
}

async function handleExportImage() {
  const el = fieldRef.value
  if (!el) { ElMessage.error('找不到球场元素'); return }
  try {
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(el, { backgroundColor: '#1a1a1a', scale: 2, useCORS: true, allowTaint: true })
    const link = document.createElement('a')
    link.download = '阵容_' + (selectedFormationId.value || 'export') + '.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
    ElMessage.success('图片导出成功')
  } catch (e) { ElMessage.error('图片导出失败'); console.error(e) }
}

async function handleExportPDF() {
  const el = fieldRef.value
  if (!el) { ElMessage.error('找不到球场元素'); return }
  try {
    const [html2canvas, jsPDF] = await Promise.all([
      import('html2canvas').then(m => m.default),
      import('jspdf').then(m => m.default)
    ])
    const canvas = await html2canvas(el, { backgroundColor: '#1a1a1a', scale: 2, useCORS: true, allowTaint: true })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pw = pdf.internal.pageSize.getWidth()
    const ph = pdf.internal.pageSize.getHeight()
    const ratio = Math.min(pw / canvas.width, ph / canvas.height)
    pdf.addImage(imgData, 'PNG', (pw - canvas.width * ratio) / 2, 10, canvas.width * ratio, canvas.height * ratio)
    pdf.save('阵容_' + (selectedFormationId.value || 'export') + '.pdf')
    ElMessage.success('PDF导出成功')
  } catch (e) { ElMessage.error('PDF导出失败'); console.error(e) }
}

// 根据阵型ID推断比赛人数
function inferPlayerCountFromFormation(formationId) {
  if (!formationId) return null
  for (const [key, data] of Object.entries(formationData)) {
    if (data.formations && data.formations[formationId]) {
      return parseInt(key.replace('人制', ''))
    }
  }
  return null
}

const legacyFormationAliases = {
  8: {
    '3-3-2': '3-3-1',
    '4-2-2': '3-2-2',
    '4-3-1': '4-2-1',
    '1-3-3-1': '1-3-2-1'
  }
}

function normalizeFormationId(formationId, playerCount) {
  return legacyFormationAliases[playerCount]?.[formationId] || formationId
}

watch(() => props.playerCount, (count) => {
  if (playerCounts.value.includes(count)) {
    selectedPlayerCount.value = count
  }
}, { immediate: true })

// ==================== 替补规则：根据赛制获取参数 ====================
function getSubstituteRule(playerCount) {
  const rules = {
    5: { maxSubs: 7, maxSwap: 99, maxSwapTimes: 99 },
    7: { maxSubs: 7, maxSwap: 14, maxSwapTimes: 3 },
    8: { maxSubs: 8, maxSwap: 7, maxSwapTimes: 3 },
    9: { maxSubs: 11, maxSwap: 99, maxSwapTimes: 3 },
    11: { maxSubs: 12, maxSwap: 5, maxSwapTimes: 3 }
  }
  return rules[playerCount] || { maxSubs: 7, maxSwap: 99, maxSwapTimes: 99 }
}

// ==================== 自动分配首发球员 ====================
function autoAssignStartingPlayers(side) {
  const positions = side === 'home' ? homeCurrentPositions.value : awayCurrentPositions.value
  const players = side === 'home' ? homePlayers.value : awayPlayers.value
  const assignedRef = side === 'home' ? homeAssignedPlayers : awayAssignedPlayers
  const benchRef = side === 'home' ? homeBench : awayBench
  const initialLineup = side === 'home' ? props.homeInitialLineup : props.awayInitialLineup

  if (!positions.length || !players.length) return

  // 没有已保存的阵容时，清空场上和替补席
  const savedPlayers = (initialLineup?.players || []).filter(p => p.role && p.id)
  if (savedPlayers.length === 0) {
    assignedRef.value = {}
    benchRef.value = []
    return
  }

  const newAssigned = {}
  const usedIds = new Set()

  // 1. 恢复首发球员
  positions.forEach(pos => {
    const saved = savedPlayers.find(p => p.role === pos.role)
    if (saved) {
      const fullPlayer = players.find(p => (p._id || p.id) === saved.id)
      if (fullPlayer) {
        newAssigned[pos.role] = fullPlayer
        usedIds.add(saved.id)
      }
    }
  })

  assignedRef.value = newAssigned

  // 2. 恢复替补球员
  const savedSubs = (initialLineup?.substitutes || []).filter(p => p.id)
  const newBench = []
  savedSubs.forEach(saved => {
    const fullPlayer = players.find(p => (p._id || p.id) === saved.id)
    if (fullPlayer && !usedIds.has(saved.id)) {
      newBench.push(fullPlayer)
    }
  })
  benchRef.value = newBench
}

function autoAssignAll() {
  nextTick(() => {
    autoAssignStartingPlayers('home')
    autoAssignStartingPlayers('away')
  })
}

// ==================== 双队模式：阵型变化 ====================
function handlePlayerCountChangeDual() {
  homeSelectedFormationId.value = ''
  awaySelectedFormationId.value = ''
  homeLineupEdited.value = true
  awayLineupEdited.value = true
  homeAssignedPlayers.value = {}
  awayAssignedPlayers.value = {}
  homeBench.value = []
  awayBench.value = []
}

function handleHomeFormationChange() {
  // 如果当前没有分配球员，自动分配
  if (Object.keys(homeAssignedPlayers.value).length === 0) {
    autoAssignStartingPlayers('home')
  }
}

function handleAwayFormationChange() {
  // 如果当前没有分配球员，自动分配
  if (Object.keys(awayAssignedPlayers.value).length === 0) {
    autoAssignStartingPlayers('away')
  }
}

// ==================== 双队模式：球员槽位点击 ====================
function handleHomePlayerSlotClick(pos) {
  dualDialogTeamSide.value = 'home'
  currentSlot.value = pos
  playerSearchQuery.value = ''
  showPlayerDialog.value = true
}

function handleAwayPlayerSlotClick(pos) {
  dualDialogTeamSide.value = 'away'
  currentSlot.value = pos
  playerSearchQuery.value = ''
  showPlayerDialog.value = true
}

// ==================== 双队模式：球员选择 ====================
function isHomePlayerAssigned(playerId) {
  if (!playerId) return false
  return Object.values(homeAssignedPlayers.value).some(p => getPlayerId(p) === playerId)
}
function isAwayPlayerAssigned(playerId) {
  if (!playerId) return false
  return Object.values(awayAssignedPlayers.value).some(p => getPlayerId(p) === playerId)
}

// 检查主队球员是否在替补席
function isHomePlayerOnBench(playerId) {
  if (!playerId) return false
  return homeBench.value.some(p => getPlayerId(p) === playerId)
}

// 检查客队球员是否在替补席
function isAwayPlayerOnBench(playerId) {
  if (!playerId) return false
  return awayBench.value.some(p => getPlayerId(p) === playerId)
}

// 获取球员在对话框中的显示状态（首发/替补/当前位置）
function getPlayerDisplayStatus(player) {
  const pid = getPlayerId(player)
  if (!pid) return { onField: false, onBench: false, isCurrent: false, statusText: '', statusType: '' }
  const side = dualDialogTeamSide.value
  const onField = side === 'home' ? isHomePlayerAssigned(pid) : isAwayPlayerAssigned(pid)
  const onBench = side === 'home' ? isHomePlayerOnBench(pid) : isAwayPlayerOnBench(pid)
  const isCurrent = currentSlotPlayerId.value === pid
  let statusText = ''
  let statusType = ''
  if (isCurrent) {
    statusText = '当前位置'
    statusType = 'success'
  } else if (onField) {
    statusText = '首发'
    statusType = 'warning'
  } else if (onBench) {
    statusText = '替补'
    statusType = 'info'
  }
  return { onField, onBench, isCurrent, statusText, statusType }
}

function handleDualPlayerSelect(player) {
  const playerId = getPlayerId(player)
  if (!playerId) {
    ElMessage.warning('球员数据异常，缺少ID')
    return
  }

  // ===== 替补席选择模式 =====
  if (selectingForBench.value) {
    if (dualDialogTeamSide.value === 'home') homeLineupEdited.value = true
    else awayLineupEdited.value = true
    const targetBench = dualDialogTeamSide.value === 'home' ? homeBench : awayBench
    const targetAssigned = dualDialogTeamSide.value === 'home' ? homeAssignedPlayers : awayAssignedPlayers

    // 检查是否已在场上
    const onField = Object.values(targetAssigned.value).some(p => getPlayerId(p) === playerId)
    if (onField) {
      ElMessage.warning('该球员已在首发阵容中')
      return
    }
    // 检查是否已在替补席
    const onBench = targetBench.value.some(p => getPlayerId(p) === playerId)
    if (onBench) {
      ElMessage.warning('该球员已在替补席中')
      return
    }

    targetBench.value = [...targetBench.value, player]
    showPlayerDialog.value = false
    ElMessage.success(player.name + ' 已添加至替补席')
    return
  }

  // ===== 场上位置选择模式 =====
  if (!currentSlot.value) return
  if (dualDialogTeamSide.value === 'home') homeLineupEdited.value = true
  else awayLineupEdited.value = true
  const target = dualDialogTeamSide.value === 'home' ? homeAssignedPlayers : awayAssignedPlayers

  const dup = Object.entries(target.value).find(([, p]) => getPlayerId(p) === playerId)
  if (dup && dup[0] !== currentSlot.value.role) {
    // 球员已在其他位置，自动从原位置移除并移动到新位置
    const next = { ...target.value }
    delete next[dup[0]]
    next[currentSlot.value.role] = player
    target.value = next
    showPlayerDialog.value = false
    ElMessage.success('已将 ' + player.name + ' 移动至 ' + currentSlot.value.label)
    return
  }
  target.value = { ...target.value, [currentSlot.value.role]: player }
  showPlayerDialog.value = false
  ElMessage.success('已分配 ' + player.name + ' 到 ' + currentSlot.value.label)
}

function handleDualPlayerRemove() {
  if (!currentSlot.value) return
  if (dualDialogTeamSide.value === 'home') homeLineupEdited.value = true
  else awayLineupEdited.value = true
  const target = dualDialogTeamSide.value === 'home' ? homeAssignedPlayers : awayAssignedPlayers
  const next = { ...target.value }
  delete next[currentSlot.value.role]
  target.value = next
  showPlayerDialog.value = false
  ElMessage.success('已移除该球员')
}

// 点击球员库中的球员：有空位就放到场上，没空位就添加到替补席
function handleHomeSquadClick(player) {
  if (!homeSelectedFormationId.value) { ElMessage.warning('请先选择主队阵型'); return }
  const empty = homeCurrentPositions.value.find(pos => !homeAssignedPlayers.value[pos.role])
  homeLineupEdited.value = true
  if (empty) {
    homeAssignedPlayers.value = { ...homeAssignedPlayers.value, [empty.role]: player }
    ElMessage.success(player.name + ' 已首发')
  } else {
    homeBench.value = [...homeBench.value, player]
    ElMessage.success(player.name + ' 已添加到替补席')
  }
}

function handleAwaySquadClick(player) {
  if (!awaySelectedFormationId.value) { ElMessage.warning('请先选择客队阵型'); return }
  const empty = awayCurrentPositions.value.find(pos => !awayAssignedPlayers.value[pos.role])
  awayLineupEdited.value = true
  if (empty) {
    awayAssignedPlayers.value = { ...awayAssignedPlayers.value, [empty.role]: player }
    ElMessage.success(player.name + ' 已首发')
  } else {
    awayBench.value = [...awayBench.value, player]
    ElMessage.success(player.name + ' 已添加到替补席')
  }
}

// 点击替补席中的球员：有空位就移到场上，没空位提示
function handleHomeBenchClick(player) {
  if (!homeSelectedFormationId.value) { ElMessage.warning('请先选择主队阵型'); return }
  const empty = homeCurrentPositions.value.find(pos => !homeAssignedPlayers.value[pos.role])
  const pid = getPlayerId(player)
  if (empty) {
    homeLineupEdited.value = true
    homeAssignedPlayers.value = { ...homeAssignedPlayers.value, [empty.role]: player }
    homeBench.value = homeBench.value.filter(p => getPlayerId(p) !== pid)
    ElMessage.success(player.name + ' 已进入首发')
  } else {
    ElMessage.warning('场上已满，请先从场上移除一名球员')
  }
}

function handleAwayBenchClick(player) {
  if (!awaySelectedFormationId.value) { ElMessage.warning('请先选择客队阵型'); return }
  const empty = awayCurrentPositions.value.find(pos => !awayAssignedPlayers.value[pos.role])
  const pid = getPlayerId(player)
  if (empty) {
    awayLineupEdited.value = true
    awayAssignedPlayers.value = { ...awayAssignedPlayers.value, [empty.role]: player }
    awayBench.value = awayBench.value.filter(p => getPlayerId(p) !== pid)
    ElMessage.success(player.name + ' 已进入首发')
  } else {
    ElMessage.warning('场上已满，请先从场上移除一名球员')
  }
}

// 点击主队替补席空槽位
function handleHomeBenchSlotClick() {
  if (!homeSelectedFormationId.value) {
    ElMessage.warning('请先选择主队阵型')
    return
  }
  if (homeBench.value.length >= maxBenchSlots.value) {
    ElMessage.warning('替补席已满')
    return
  }
  dualDialogTeamSide.value = 'home'
  selectingForBench.value = true
  playerSearchQuery.value = ''
  showPlayerDialog.value = true
}

// 点击客队替补席空槽位
function handleAwayBenchSlotClick() {
  if (!awaySelectedFormationId.value) {
    ElMessage.warning('请先选择客队阵型')
    return
  }
  if (awayBench.value.length >= maxBenchSlots.value) {
    ElMessage.warning('替补席已满')
    return
  }
  dualDialogTeamSide.value = 'away'
  selectingForBench.value = true
  playerSearchQuery.value = ''
  showPlayerDialog.value = true
}

// 从主队替补席移除球员
function handleHomeBenchRemove(player) {
  homeLineupEdited.value = true
  const pid = getPlayerId(player)
  homeBench.value = homeBench.value.filter(p => getPlayerId(p) !== pid)
  ElMessage.success(player.name + ' 已从替补席移除')
}

// 从客队替补席移除球员
function handleAwayBenchRemove(player) {
  awayLineupEdited.value = true
  const pid = getPlayerId(player)
  awayBench.value = awayBench.value.filter(p => getPlayerId(p) !== pid)
  ElMessage.success(player.name + ' 已从替补席移除')
}

// 监听弹窗关闭，重置替补选择状态
watch(showPlayerDialog, (val) => {
  if (!val) selectingForBench.value = false
})

// ==================== 双队模式：导出 ====================
async function handleExportImageDual() {
  const el = dualFieldRef.value
  if (!el) { ElMessage.error('找不到球场元素'); return }
  try {
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(el, { backgroundColor: '#0d2818', scale: 2, useCORS: true, allowTaint: true })
    const link = document.createElement('a')
    link.download = '对阵_' + (props.homeTeamName || '主队') + '_vs_' + (props.awayTeamName || '客队') + '.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
    ElMessage.success('图片导出成功')
  } catch (e) { ElMessage.error('图片导出失败'); console.error(e) }
}

// ==================== 双队模式：加载已保存阵容 ====================
watch(() => props.homeInitialLineup, (v) => {
  // 用户开始编辑后，比赛数据刷新不能覆盖本地未保存阵容。
  if (homeLineupEdited.value) return
  homeAssignedPlayers.value = {}
  const savedFormation = v?.formation || ''
  // 自动推断比赛人数
  const count = props.playerCount || inferPlayerCountFromFormation(savedFormation)
  if (count && !selectedPlayerCount.value) {
    selectedPlayerCount.value = count
  }
  homeSelectedFormationId.value = normalizeFormationId(savedFormation, count)
  // 延迟自动分配，等待阵型数据计算完成
  nextTick(() => {
    if (homeCurrentPositions.value.length > 0) {
      autoAssignStartingPlayers('home')
    }
  })
}, { immediate: true })

watch(() => props.awayInitialLineup, (v) => {
  if (awayLineupEdited.value) return
  awayAssignedPlayers.value = {}
  const savedFormation = v?.formation || ''
  // 自动推断比赛人数（如果主队已经设置了，用同一个）
  const count = props.playerCount || inferPlayerCountFromFormation(savedFormation)
  if (count && !selectedPlayerCount.value) {
    selectedPlayerCount.value = count
  }
  awaySelectedFormationId.value = normalizeFormationId(savedFormation, count)
  // 延迟自动分配，等待阵型数据计算完成
  nextTick(() => {
    if (awayCurrentPositions.value.length > 0) {
      autoAssignStartingPlayers('away')
    }
  })
}, { immediate: true })

// ==================== 双队模式：保存 ====================
async function handleSaveDual() {
  if (!selectedPlayerCount.value || !homeSelectedFormationId.value || !awaySelectedFormationId.value) {
    ElMessage.warning('请先选择比赛人数和双方阵型')
    return
  }
  saving.value = true
  try {
    const homeLineup = buildSingleLineup(homeAssignedPlayers.value, homeSelectedFormationId.value, homeSubstitutePlayers.value)
    const awayLineup = buildSingleLineup(awayAssignedPlayers.value, awaySelectedFormationId.value, awaySubstitutePlayers.value)
    if (props.onSave) {
      props.onSave({ home: homeLineup, away: awayLineup })
    } else {
      ElMessage.success('双方阵容已更新（未连接到保存接口）')
    }
  } catch (e) {
    ElMessage.error('保存失败: ' + (e.message || e))
  } finally {
    saving.value = false
  }
}

// ==================== 单队模式：加载已保存阵容 ====================
watch(() => props.initialLineup, (v) => {
  assignedPlayers.value = {}
  const savedFormation = v?.formation || ''
  const count = props.playerCount || inferPlayerCountFromFormation(savedFormation)
  if (count && !selectedPlayerCount.value) {
    selectedPlayerCount.value = count
  }
  selectedFormationId.value = normalizeFormationId(savedFormation, count)
  if (v?.players?.forEach) {
    v.players.forEach(p => { if (p.role) assignedPlayers.value[p.role] = p })
  }
}, { immediate: true })

function handlePlayerSearch() {}
</script>

<style scoped lang="scss">
.visual-lineup-editor {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f7fa;

  &.is-dual-mode {
    background: #0a1f0f;
  }
}

// ==================== 顶部工具栏 ====================
.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  z-index: 10;
  flex-shrink: 0;

  .toolbar-left {
    .editor-title {
      font-size: 20px;
      font-weight: 600;
      color: #303133;
      margin: 0;
    }
  }

  .toolbar-center {
    .formation-selector {
      margin: 0;
    }
  }

  .toolbar-right {
    display: flex;
    gap: 12px;
  }
}

// ==================== 单队模式：编辑区域 ====================
.editor-content {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 24px;
  overflow: auto;
}

.football-field-wrapper {
  width: 100%;
  max-width: 1000px;
  background: #1a1a1a;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.football-field {
  position: relative;
  width: 100%;
    aspect-ratio: 2560 / 1100;
  overflow: hidden;

  .field-background {
    position: absolute;
    inset: 0;
    background-size: contain;
    background-position: center;
    background-repeat: no-repeat;
  }
}

.player-slot {
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 10;
  cursor: pointer;

  &:hover {
    z-index: 20;
  }

  .position-label {
    position: absolute;
    bottom: -20px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 11px;
    color: #fff;
    background: rgba(0, 0, 0, 0.7);
    padding: 2px 8px;
    border-radius: 4px;
    white-space: nowrap;
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }

  &:hover .position-label {
    opacity: 1;
  }
}

// ==================== 底部灰色区域 ====================
.field-bottom-area {
  background: #2a2a2a;
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.substitutes-section {
  .substitutes-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;

    .substitutes-title {
      font-size: 14px;
      font-weight: 600;
      color: #e0e0e0;
    }
  }

  .substitutes-list {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 8px;

    &::-webkit-scrollbar {
      height: 4px;
    }
    &::-webkit-scrollbar-track {
      background: #3a3a3a;
      border-radius: 2px;
    }
    &::-webkit-scrollbar-thumb {
      background: #666;
      border-radius: 2px;
    }
  }

  .substitute-card {
    flex-shrink: 0;
    width: 90px;
    background: #3a3a3a;
    border-radius: 8px;
    padding: 10px 8px;
    cursor: pointer;
    transition: all 0.2s;
    text-align: center;
    border: 2px solid transparent;

    &:hover {
      background: #4a4a4a;
      border-color: #409eff;
      transform: translateY(-2px);
    }

    &.is-assigned {
      opacity: 0.6;
      cursor: not-allowed;
      &:hover {
        border-color: #67c23a;
        transform: none;
      }
    }

    .sub-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      overflow: hidden;
      margin: 0 auto 6px;
      background: #e4e7ed;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .sub-avatar-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #fff;
        font-size: 14px;
        font-weight: 600;
      }
    }

    .sub-info {
      .sub-name {
        font-size: 12px;
        font-weight: 500;
        color: #fff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .sub-meta {
        font-size: 11px;
        color: #aaa;
        margin-top: 2px;

        .sub-number {
          color: #409eff;
          margin-right: 4px;
        }
        .sub-position {
          color: #67c23a;
        }
      }
    }

    .sub-status {
      margin-top: 4px;
    }
  }

  .empty-substitutes {
    color: #888;
    font-size: 13px;
    padding: 20px;
    text-align: center;
    width: 100%;
  }
}

.action-buttons-section {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid #3a3a3a;

  .el-button {
    .el-icon {
      margin-right: 4px;
    }
  }
}

// ==================== 双队模式：足球场 ====================
.dual-toolbar {
  flex-wrap: wrap;
  gap: 8px;
  background: rgba(10, 31, 15, 0.92);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);

  .editor-title {
    color: #fff;
  }

  :deep(.el-form-item__label) {
    color: rgba(255, 255, 255, 0.85);
  }

  .dual-formations {
    .el-form {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
    }
  }
}

.dual-field-outer {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 0;
  overflow: hidden;
}

.dual-field-container {
  position: relative;
  width: 100%;
  height: 100%;
  max-width: none;
  background: transparent;
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  border-radius: 0;
  overflow: visible;

  .field-boundary {
    position: absolute;
    left: 7%;
    top: 5%;
    width: 86%;
    height: 90%;
    pointer-events: none;

    .dual-player-slot {
      pointer-events: auto;
    }
  }
}

// ===== 球队信息栏（球场上方） =====
.dual-team-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 12px 24px;
  background: rgba(10, 31, 15, 0.88);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.dual-team-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dual-team-logo {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(255, 255, 255, 0.25);
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  &.has-logo {
    background: #fff;
    border-color: rgba(255, 255, 255, 0.5);
  }
}

.dual-team-logo-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  border-radius: 50%;
}

.dual-team-title {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

.dual-vs-divider {
  font-size: 16px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 2px;
}

.home-color {
  background: linear-gradient(135deg, rgba(245, 108, 108, 0.85), rgba(198, 40, 40, 0.95));
}

.away-color {
  background: linear-gradient(135deg, rgba(230, 162, 60, 0.85), rgba(212, 136, 6, 0.95));
}

// ===== 双队球员槽位 =====
.dual-player-slot {
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 10;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  align-items: center;

  &:hover {
    z-index: 20;
    transform: translate(-50%, -50%) scale(1.06);
  }

  // 已生成卡片按原始比例填满球场槽位。
  .slot-card-wrapper {
    width: 126px;
    height: 181px;
    position: relative;
    overflow: visible;

    :deep(.player-card) {
      position: static;
      transform: none;
      box-shadow: none !important;
    }

    :deep(.player-card:hover) {
      box-shadow: none !important;
      transform: none !important;
    }

    :deep(.player-card-container) {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0;
    }

    :deep(.card-level-indicator) {
      display: none;
    }
  }

  // 空位状态
  .slot-empty-circle {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 2px dashed rgba(255, 255, 255, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.25);
    transition: all 0.2s;

    .slot-empty-icon {
      font-size: 18px;
      font-weight: 300;
      color: rgba(255, 255, 255, 0.5);
    }
  }

  .slot-empty-label {
    font-size: 9px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.6);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
    background: rgba(0, 0, 0, 0.4);
    padding: 1px 5px;
    border-radius: 3px;
    white-space: nowrap;
    margin-top: 3px;
  }

  // 空位hover效果
  &.is-empty:hover {
    .slot-empty-circle {
      border-color: rgba(255, 255, 255, 0.6);
      background: rgba(64, 158, 255, 0.2);

      .slot-empty-icon {
        color: rgba(255, 255, 255, 0.85);
      }
    }
  }
}

// ==================== 双队模式：球员库 + 替补席 ====================
.dual-substitutes-bar {
  display: flex;
  flex-direction: row;
  gap: 0;
  background: #1a1a1a;
}

.dual-squad-bench {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  background: #1a1a1a;
  flex: 1;
  flex-shrink: 0;
}

.home-squad-bench {
  border-top: 2px solid #f56c6c;
}

.away-squad-bench {
  border-top: 2px solid #e6a23c;
}

.squad-section,
.bench-section {
  flex: 1;
  min-width: 200px;
  background: #2a2a2a;
  border-radius: 8px;
  padding: 10px;
}

.squad-header,
.bench-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;

  .squad-title,
  .bench-title {
    font-size: 12px;
    font-weight: 600;
  }
}

.squad-list,
.bench-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 180px;
  overflow-y: auto;
  padding-right: 4px;

  &::-webkit-scrollbar {
    width: 3px;
  }
  &::-webkit-scrollbar-track {
    background: #3a3a3a;
    border-radius: 2px;
  }
  &::-webkit-scrollbar-thumb {
    background: #555;
    border-radius: 2px;
  }
}

.squad-card,
.bench-card {
  width: 64px;
  background: #3a3a3a;
  border-radius: 6px;
  padding: 6px 4px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  border: 2px solid transparent;

  &:hover {
    background: #4a4a4a;
    border-color: #409eff;
    transform: translateY(-2px);
  }
}

.bench-card {
  background: #333;

  &:hover {
    background: #444;
    border-color: #67c23a;
  }
}

.squad-avatar,
.bench-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  margin: 0 auto 3px;
  background: #e4e7ed;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.squad-placeholder,
.bench-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  border-radius: 50%;
}

.squad-name,
.bench-name {
  font-size: 10px;
  font-weight: 500;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.squad-meta,
.bench-meta {
  font-size: 9px;
  color: #aaa;
  margin-top: 1px;
}

.squad-num,
.bench-num {
  color: #409eff;
}

.squad-empty,
.bench-empty {
  color: #888;
  font-size: 11px;
  padding: 8px;
  text-align: center;
  width: 100%;
}

// ==================== 球员选择对话框 ====================
.player-select-dialog {
  .dialog-info {
    margin-bottom: 16px;
  }

  .search-input {
    margin-bottom: 16px;
  }

  .player-list {
    max-height: 400px;
    overflow-y: auto;
    border: 1px solid #dcdfe6;
    border-radius: 4px;

    .player-list-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      cursor: pointer;
      transition: background 0.2s;

      &:hover {
        background: #f5f7fa;
      }

      &.is-assigned {
        opacity: 0.7;
        background: #fdf6ec;
      }

      &.is-current-slot {
        background: #f0f9ff;
        border-left: 3px solid #409eff;
      }

      .player-avatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        overflow: hidden;
        flex-shrink: 0;
        background: #e4e7ed;

        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .avatar-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: #fff;
          font-size: 18px;
          font-weight: 600;
        }
      }

      .player-details {
        flex: 1;

        .player-name {
          font-size: 14px;
          font-weight: 500;
          color: #303133;
        }

        .player-meta {
          font-size: 12px;
          color: #909399;
          margin-top: 4px;

          span {
            margin-right: 12px;
          }
        }
      }

      .player-status {
        flex-shrink: 0;
      }
    }

    .empty-players {
      padding: 32px;
      text-align: center;
      color: #909399;
    }
  }
}

// ==================== 替补席空槽位 ====================
.bench-empty-slot {
  width: 64px;
  height: 78px;
  background: #3a3a3a;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px dashed #555;

  &:hover {
    background: #4a4a4a;
    border-color: #409eff;

    .bench-empty-icon {
      color: #409eff;
    }
  }

  .bench-empty-icon {
    font-size: 24px;
    font-weight: 300;
    color: #888;
  }
}

.bench-card.has-remove {
  position: relative;

  &::after {
    content: '×';
    position: absolute;
    top: -4px;
    right: -4px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #f56c6c;
    color: #fff;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;
    pointer-events: none;
  }

  &:hover::after {
    opacity: 1;
  }
}

// ==================== 响应式适配 ====================
@media (max-width: 768px) {
  .editor-toolbar {
    flex-direction: column;
    gap: 12px;
    padding: 12px;

    .toolbar-center {
      .formation-selector {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
    }
  }

  .football-field {
    aspect-ratio: 2560 / 1100;
  }

  .field-bottom-area {
    padding: 12px;
  }

  .substitute-card {
    width: 80px;
    padding: 8px 6px;
  }

  .dual-field-outer {
    padding: 8px 12px;
  }

  .dual-substitutes-bar {
    flex-direction: column;
    padding: 8px 12px;
  }

  .dual-sub-section {
    min-width: 100%;
  }

  .half-badge {
    font-size: 11px;
    padding: 4px 8px;
  }
}
</style>
