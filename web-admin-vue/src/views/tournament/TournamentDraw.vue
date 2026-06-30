<template>
  <div class="tournament-draw" :class="{ fullscreen: isFullscreen, embedded: props.embedded }">
    <!-- 顶部导航栏 -->
    <div class="draw-header" v-show="!isFullscreen && !props.embedded">
      <el-page-header @back="$router.push('/tournaments')" title="返回赛事列表">
        <template #content>
          <span style="font-size: 18px;">抽签分组 - {{ tournament.name || '赛事' }}</span>
          <el-tag v-if="tournamentType" style="margin-left: 8px;">{{ formatLabel }}</el-tag>
        </template>
      </el-page-header>
    </div>

    <!-- 初始状态：显示新建抽签规则按钮 -->
    <div v-if="!drawGenerated && !hasSavedGroups" class="empty-state">
      <el-empty :description="props.readonly ? '暂无抽签分组数据' : '暂无抽签规则'">
        <el-button v-if="!props.readonly" type="primary" size="large" @click="showConfigDialog = true">
          <el-icon><Plus /></el-icon> 新建抽签规则
        </el-button>
      </el-empty>
    </div>

    <!-- 配置对话框 -->
    <el-dialog
      v-model="showConfigDialog"
      title="新建抽签规则"
      width="600px"
      :close-on-click-modal="false"
    >
      <div class="config-dialog-content">
        <div class="config-section">
          <h4>选择赛制</h4>
          <el-radio-group v-model="configForm.tournamentType" size="large">
            <el-radio-button value="tournament">赛会制（小组赛）</el-radio-button>
            <el-radio-button value="cup">杯赛制（淘汰赛）</el-radio-button>
            <el-radio-button value="league">联赛制</el-radio-button>
          </el-radio-group>
        </div>

        <!-- 赛会制配置 -->
        <div v-if="configForm.tournamentType === 'tournament'" class="config-section">
          <h4>小组赛设置</h4>
          <div class="config-row">
            <label>分组数量</label>
            <el-input-number v-model="configForm.groupCount" :min="2" :max="16" :step="1" controls-position="right" />
            <span class="config-hint">个小组</span>
          </div>
          <div class="config-row">
            <label>每组队伍数</label>
            <el-input-number v-model="configForm.teamsPerGroup" :min="2" :max="8" :step="1" controls-position="right" />
            <span class="config-hint">支/组（共 {{ configForm.groupCount * configForm.teamsPerGroup }} 支）</span>
          </div>
        </div>

        <!-- 杯赛制配置 -->
        <div v-if="configForm.tournamentType === 'cup'" class="config-section">
          <h4>淘汰赛设置</h4>
          <div class="config-row">
            <label>淘汰赛规模</label>
            <el-radio-group v-model="configForm.knockoutSize">
              <el-radio-button :value="64">64强</el-radio-button>
              <el-radio-button :value="32">32强</el-radio-button>
              <el-radio-button :value="16">16强</el-radio-button>
              <el-radio-button :value="8">8强</el-radio-button>
              <el-radio-button :value="4">4强</el-radio-button>
            </el-radio-group>
          </div>
        </div>

        <!-- 联赛制配置 -->
        <div v-if="configForm.tournamentType === 'league'" class="config-section">
          <h4>联赛设置</h4>
          <div class="config-row">
            <label>分组设置</label>
            <el-radio-group v-model="configForm.leagueGrouped">
              <el-radio-button :value="false">不分组（单联赛表）</el-radio-button>
              <el-radio-button :value="true">分组联赛</el-radio-button>
            </el-radio-group>
          </div>
          <div v-if="configForm.leagueGrouped" class="config-row">
            <label>分组数量</label>
            <el-input-number v-model="configForm.groupCount" :min="2" :max="8" :step="1" controls-position="right" />
            <span class="config-hint">个小组</span>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="showConfigDialog = false; resetConfig()">取消</el-button>
        <el-button type="primary" @click="confirmConfig" :disabled="!canConfirmConfig">
          确认并生成空表格
        </el-button>
      </template>
    </el-dialog>

    <!-- 全屏模式顶部 -->
    <div class="draw-header-fullscreen" v-show="isFullscreen">
      <div class="logo">🏆 54校园足球赛事管理系统</div>
      <div class="title">{{ tournament.name || '赛事抽签仪式' }}</div>
      <div class="subtitle">抽签分组仪式</div>
    </div>

    <!-- 操作栏 -->
    <div class="draw-toolbar" v-show="drawGenerated && !isFullscreen && !props.readonly" :class="{ 'embedded-toolbar': props.embedded }">
      <div class="toolbar-left">
        <div class="stat-item">
          <span class="stat-label">参赛球队</span>
          <span class="stat-value">{{ approvedTeams.length }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">已分配</span>
          <span class="stat-value">{{ groupedCount }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">未分配</span>
          <span class="stat-value">{{ ungroupedTeams.length }}</span>
        </div>
      </div>
      <div class="toolbar-right">
        <el-button @click="reconfigure" :disabled="drawing">
          <el-icon><Setting /></el-icon> 重新配置
        </el-button>
        <el-button type="primary" @click="autoDraw" :loading="drawing" :disabled="ungroupedTeams.length === 0">
          <el-icon><MagicStick /></el-icon> 随机抽签
        </el-button>
        <el-button @click="clearGroups" :disabled="groupedCount === 0">
          <el-icon><RefreshLeft /></el-icon> 清空分配
        </el-button>
        <el-button type="warning" @click="saveGroups" :loading="saving">
          <el-icon><Check /></el-icon> 保存确认
        </el-button>
        <el-button @click="exportImage" :loading="exportingImage">
          <el-icon><Picture /></el-icon> 导出图片
        </el-button>
        <el-button @click="toggleFullscreen">
          <el-icon><FullScreen /></el-icon> {{ isFullscreen ? '退出全屏' : '全屏展示' }}
        </el-button>
      </div>
    </div>

    <!-- 抽签动画遮罩 -->
    <div v-if="showDrawAnimation" class="draw-animation-overlay">
      <div class="draw-animation-content">
        <div class="animation-title">正在抽签中...</div>
        <div class="animation-ball-container">
          <div v-for="i in 8" :key="i" class="animation-ball" :style="ballStyle(i)"></div>
        </div>
        <div class="animation-progress">
          <el-progress :percentage="drawProgress" :stroke-width="12" :show-text="false" color="#f59e0b" />
        </div>
        <div class="animation-status">{{ drawStatus }}</div>
      </div>
    </div>

    <!-- 主体区域（配置完成后显示） -->
    <div v-if="drawGenerated" class="draw-body" :class="{ fullscreen: isFullscreen }">
      <!-- 未分组球队池 -->
      <div
        v-if="!props.readonly"
        class="team-pool"
        :class="{ fullscreen: isFullscreen }"
      >
        <div class="pool-header">
          <h3>
            <el-icon><Box /></el-icon>
            未分配球队
            <el-tag type="info" size="small">{{ ungroupedTeams.length }}</el-tag>
          </h3>
          <div class="pool-actions" v-if="!props.readonly">
            <el-button size="small" type="info" plain @click="addPlaceholder('bye')" title="添加轮空">
              <el-icon><Plus /></el-icon> 轮空
            </el-button>
            <el-button size="small" type="warning" plain @click="addPlaceholder('playin')" title="添加附加赛待定">
              <el-icon><Plus /></el-icon> 附加赛
            </el-button>
          </div>
        </div>
        <div class="pool-content">
          <div
            v-for="team in ungroupedTeams"
            :key="team.teamId"
            class="team-card"
            :class="{ placeholder: team.isPlaceholder }"
            @mousedown="onMouseDown($event, team)"
          >
            <div class="team-logo-wrapper">
              <img v-if="team.logo || team.logoUrl" :src="team.logo || team.logoUrl" class="team-logo" @error="$event.target.style.display='none'" />
              <div v-else class="team-logo-placeholder">{{ (team.name || team.teamName || '?')[0] }}</div>
            </div>
            <div class="team-name">{{ team.name || team.teamName }}</div>
            <div class="team-coach">{{ team.coachName || team.contactName || '-' }}</div>
            <el-button
              v-if="team.isPlaceholder && !props.readonly"
              class="delete-placeholder-btn"
              size="small"
              type="danger"
              circle
              @click.stop="removePlaceholder(team)"
            >
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <el-empty v-if="ungroupedTeams.length === 0" description="所有球队已分配" />
        </div>
      </div>

      <!-- 分组区域（赛会制显示） -->
      <div v-if="tournamentType === 'tournament' && groups.length > 0" class="groups-area" :class="{ fullscreen: isFullscreen }">
        <div
          v-for="(group, index) in groups"
          :key="index"
          class="group-card"
          :class="{ 'group-highlight': groupHighlightIndex === index }"
        >
          <div class="group-header">
            <div class="group-name">{{ group.name }}</div>
            <div class="group-count">{{ group.slots.filter(s => s).length }} / {{ teamsPerGroup }}</div>
          </div>
          <div class="group-teams">
            <div
              v-for="(slot, slotIndex) in group.slots"
              :key="slot ? slot.teamId : 'slot-' + slotIndex"
            >
              <!-- 已分配的球队 -->
              <div
                v-if="slot"
                class="group-team-item"
                @mousedown="onMouseDown($event, slot, index)"
              >
                <div class="team-rank">{{ slotIndex + 1 }}</div>
                <div class="team-logo-wrapper small">
                  <img v-if="slot.logo || slot.logoUrl" :src="slot.logo || slot.logoUrl" class="team-logo" @error="$event.target.style.display='none'" />
                  <div v-else class="team-logo-placeholder">{{ (slot.name || '?')[0] }}</div>
                </div>
                <div class="team-name">{{ slot.name || slot.teamName }}</div>
                <el-icon class="drag-handle" v-if="!props.readonly"><Rank /></el-icon>
              </div>
              <!-- 空位占位符 -->
              <div
                v-else
                class="group-slot-empty"
                :data-group-index="index"
                :data-slot-index="slotIndex"
              >
                <span class="slot-number">{{ slotIndex + 1 }}</span>
                <span class="slot-hint">拖拽球队到此处</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 淘汰赛对阵树（杯赛制显示）- 世界杯式布局 -->
      <div v-if="tournamentType === 'cup' && knockoutLayout" class="knockout-worldcup" :class="{ fullscreen: isFullscreen }">
        <!-- 确认对阵状态栏 -->
        <div class="bracket-confirm-bar" v-if="!props.readonly">
          <div class="confirm-status" :class="{ confirmed: bracketConfirmed }">
            {{ bracketConfirmed ? '对阵已确认' : '对阵尚未确认，请拖拽分配球队后点击确认' }}
          </div>
          <el-button
            size="small"
            :type="bracketConfirmed ? 'success' : 'primary'"
            :disabled="bracketConfirmed"
            @click="confirmBracket"
          >
            <el-icon><Check /></el-icon>
            {{ bracketConfirmed ? '已确认' : '确认对阵' }}
          </el-button>
        </div>
        <div class="knockout-bracket-body">
          <!-- 左半区 -->
          <div class="bracket-side bracket-left">
            <div v-for="(round, ri) in knockoutLayout.leftRounds" :key="'L-'+round.round" class="bracket-round-column" :class="{ 'semi-final': round.name === '半决赛' }">
              <div class="round-label">{{ round.name }}</div>
              <div class="round-matches-list">
                <div v-for="match in round.matches" :key="match.id" class="knockout-match">
                  <div class="match-teams">
                    <div class="match-team"
                         :class="{ filled: match.slot1, 'drag-over': match.dragOverSlot1, 'bracket-slot': true }"
                         :data-round="match._roundIndex"
                         :data-match="match._matchIndex"
                         data-slot="slot1"
                         @mousedown="match.slot1 ? onMouseDown($event, match.slot1, null, { round: match._roundIndex, match: match._matchIndex, slot: 'slot1' }) : (e => e.preventDefault())"
                    >
                      <img v-if="match.slot1?.logo || match.slot1?.logoUrl" :src="match.slot1.logo || match.slot1.logoUrl" class="match-team-logo" @error="$event.target.style.display='none'" />
                      <div v-else class="match-team-placeholder">{{ (match.slot1?.name || '?')[0] }}</div>
                      <span class="match-team-name">{{ match.slot1?.name || '待定' }}</span>
                    </div>
                    <div class="match-team"
                         :class="{ filled: match.slot2, 'drag-over': match.dragOverSlot2, 'bracket-slot': true }"
                         :data-round="match._roundIndex"
                         :data-match="match._matchIndex"
                         data-slot="slot2"
                         @mousedown="match.slot2 ? onMouseDown($event, match.slot2, null, { round: match._roundIndex, match: match._matchIndex, slot: 'slot2' }) : (e => e.preventDefault())"
                    >
                      <img v-if="match.slot2?.logo || match.slot2?.logoUrl" :src="match.slot2.logo || match.slot2.logoUrl" class="match-team-logo" @error="$event.target.style.display='none'" />
                      <div v-else class="match-team-placeholder">{{ (match.slot2?.name || '?')[0] }}</div>
                      <span class="match-team-name">{{ match.slot2?.name || '待定' }}</span>
                    </div>
                  </div>
                  <div class="match-connector"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- 中间决赛区 -->
          <div class="bracket-center">
            <!-- 决赛 -->
            <div class="center-final" v-if="knockoutLayout.finalMatch">
              <div class="center-title">🏆 决赛</div>
              <div class="final-match-card">
                <div class="final-team-side">
                  <div v-if="knockoutLayout.finalMatch.slot1" class="final-team-info">
                    <img :src="knockoutLayout.finalMatch.slot1.logo || knockoutLayout.finalMatch.slot1.logoUrl" class="final-team-logo" @error="$event.target.style.display='none'" />
                    <span>{{ knockoutLayout.finalMatch.slot1.name }}</span>
                  </div>
                  <div v-else class="final-team-empty">
                    <div class="final-circle"></div>
                    <span>待定</span>
                  </div>
                </div>
                <div class="final-vs">VS</div>
                <div class="final-team-side">
                  <div v-if="knockoutLayout.finalMatch.slot2" class="final-team-info">
                    <img :src="knockoutLayout.finalMatch.slot2.logo || knockoutLayout.finalMatch.slot2.logoUrl" class="final-team-logo" @error="$event.target.style.display='none'" />
                    <span>{{ knockoutLayout.finalMatch.slot2.name }}</span>
                  </div>
                  <div v-else class="final-team-empty">
                    <div class="final-circle"></div>
                    <span>待定</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 季军赛 -->
            <div class="center-third" v-if="knockoutLayout.thirdPlaceMatch">
              <div class="center-title third-title">🥉 季军赛</div>
              <div class="third-match-card">
                <div class="third-team-side">
                  <div v-if="knockoutLayout.thirdPlaceMatch.slot1" class="final-team-info">
                    <img :src="knockoutLayout.thirdPlaceMatch.slot1.logo || knockoutLayout.thirdPlaceMatch.slot1.logoUrl" class="final-team-logo small" @error="$event.target.style.display='none'" />
                    <span>{{ knockoutLayout.thirdPlaceMatch.slot1.name }}</span>
                  </div>
                  <div v-else class="final-team-empty">
                    <div class="final-circle small"></div>
                    <span>待定</span>
                  </div>
                </div>
                <div class="final-vs small">VS</div>
                <div class="third-team-side">
                  <div v-if="knockoutLayout.thirdPlaceMatch.slot2" class="final-team-info">
                    <img :src="knockoutLayout.thirdPlaceMatch.slot2.logo || knockoutLayout.thirdPlaceMatch.slot2.logoUrl" class="final-team-logo small" @error="$event.target.style.display='none'" />
                    <span>{{ knockoutLayout.thirdPlaceMatch.slot2.name }}</span>
                  </div>
                  <div v-else class="final-team-empty">
                    <div class="final-circle small"></div>
                    <span>待定</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 右半区 -->
          <div class="bracket-side bracket-right">
            <div v-for="(round, ri) in knockoutLayout.rightRounds" :key="'R-'+round.round" class="bracket-round-column" :class="{ 'semi-final': round.name === '半决赛' }">
              <div class="round-label">{{ round.name }}</div>
              <div class="round-matches-list">
                <div v-for="match in round.matches" :key="match.id" class="knockout-match">
                  <div class="match-connector right-connector"></div>
                  <div class="match-teams">
                    <div class="match-team"
                         :class="{ filled: match.slot1, 'drag-over': match.dragOverSlot1, 'bracket-slot': true }"
                         :data-round="match._roundIndex"
                         :data-match="match._matchIndex"
                         data-slot="slot1"
                         @mousedown="match.slot1 ? onMouseDown($event, match.slot1, null, { round: match._roundIndex, match: match._matchIndex, slot: 'slot1' }) : (e => e.preventDefault())"
                    >
                      <img v-if="match.slot1?.logo || match.slot1?.logoUrl" :src="match.slot1.logo || match.slot1.logoUrl" class="match-team-logo" @error="$event.target.style.display='none'" />
                      <div v-else class="match-team-placeholder">{{ (match.slot1?.name || '?')[0] }}</div>
                      <span class="match-team-name">{{ match.slot1?.name || '待定' }}</span>
                    </div>
                    <div class="match-team"
                         :class="{ filled: match.slot2, 'drag-over': match.dragOverSlot2, 'bracket-slot': true }"
                         :data-round="match._roundIndex"
                         :data-match="match._matchIndex"
                         data-slot="slot2"
                         @mousedown="match.slot2 ? onMouseDown($event, match.slot2, null, { round: match._roundIndex, match: match._matchIndex, slot: 'slot2' }) : (e => e.preventDefault())"
                    >
                      <img v-if="match.slot2?.logo || match.slot2?.logoUrl" :src="match.slot2.logo || match.slot2.logoUrl" class="match-team-logo" @error="$event.target.style.display='none'" />
                      <div v-else class="match-team-placeholder">{{ (match.slot2?.name || '?')[0] }}</div>
                      <span class="match-team-name">{{ match.slot2?.name || '待定' }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 联赛积分表（联赛制显示） -->
      <div v-if="tournamentType === 'league' && groups.length > 0" class="league-container" :class="{ fullscreen: isFullscreen }">
        <div v-for="(group, groupIndex) in groups" :key="groupIndex" class="league-table-card">
          <div class="league-table-header">
            <div class="league-table-title">{{ group.name }}</div>
            <div class="league-table-count">{{ group.teams.length }} 队</div>
          </div>
          <div class="league-table-content">
            <div class="league-table-head">
              <div class="rank-col">#</div>
              <div class="team-col">球队</div>
              <div class="stat-col">赛</div>
              <div class="stat-col">胜</div>
              <div class="stat-col">平</div>
              <div class="stat-col">负</div>
              <div class="stat-col">进</div>
              <div class="stat-col">失</div>
              <div class="stat-col">积分</div>
            </div>
            <div
              v-for="(team, tIndex) in group.teams"
              :key="team.teamId"
              class="league-table-row"
              @mousedown="onMouseDown($event, team, groupIndex)"
            >
              <div class="rank-col">{{ tIndex + 1 }}</div>
              <div class="team-col">
                <div class="team-logo-wrapper mini">
                  <img v-if="team.logo || team.logoUrl" :src="team.logo || team.logoUrl" class="team-logo" @error="$event.target.style.display='none'" />
                  <div v-else class="team-logo-placeholder">{{ (team.name || '?')[0] }}</div>
                </div>
                <span class="team-name-text">{{ team.name || team.teamName }}</span>
              </div>
              <div class="stat-col">0</div>
              <div class="stat-col">0</div>
              <div class="stat-col">0</div>
              <div class="stat-col">0</div>
              <div class="stat-col">0</div>
              <div class="stat-col">0</div>
              <div class="stat-col points">0</div>
            </div>
            <!-- 联赛制拖放接收区 -->
            <div
              v-if="!props.readonly"
              class="league-table-drop-zone"
              :data-group-index="groupIndex"
              @mouseenter="$event.currentTarget.classList.add('drop-active')"
              @mouseleave="$event.currentTarget.classList.remove('drop-active')"
            >
              <el-icon><Plus /></el-icon>
              <span>拖拽球队到此处</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, reactive } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, MagicStick, RefreshLeft, Check, FullScreen, Box, Rank, Setting, Picture, Delete } from '@element-plus/icons-vue'
import html2canvas from 'html2canvas'
import { queryById, queryList, addRecord, updateRecord, deleteRecord } from '../../utils/cloud'

const props = defineProps({
  embedded: { type: Boolean, default: false },
  tournamentId: { type: String, default: null },
  readonly: { type: Boolean, default: false }
})

const route = useRoute()
const tournamentId = props.tournamentId || route.params.id

const loading = ref(false)
const saving = ref(false)
const drawing = ref(false)
const tournament = ref({})
const approvedTeams = ref([])
const groups = ref([])
const groupCount = ref(4)
const teamsPerGroup = ref(4)
const isFullscreen = ref(false)
const poolDragOver = ref(false)
const draggedTeam = ref(null)
const draggedFromGroup = ref(null)
const draggedFromBracket = ref(null)
const groupHighlightIndex = ref(-1)
const dragOverSlot = reactive({ groupIndex: -1, slotIndex: -1 })

// 淘汰赛对阵树
const bracket = ref([])
const bracketConfirmed = ref(false)
const exportingImage = ref(false)

// 配置对话框
const showConfigDialog = ref(false)
const configForm = ref({
  tournamentType: 'tournament',
  groupCount: 4,
  teamsPerGroup: 4,
  knockoutSize: 16,
  leagueGrouped: false
})

// 赛制相关
const tournamentType = computed(() => configForm.value.tournamentType)
const formatLabel = computed(() => {
  const m = { tournament: '赛会制', cup: '杯赛制', league: '联赛制' }
  return m[tournamentType.value] || ''
})

  // 淘汰赛布局（世界杯式：左右半区 + 中间决赛/季军赛）
const knockoutLayout = computed(() => {
  if (!bracket.value.length) return null
  const rounds = bracket.value.length
  if (rounds < 3) return null

  // 倒数第二轮是决赛，最后一轮是季军赛
  const finalMatch = bracket.value[rounds - 2]?.matches?.[0] || null
  const thirdPlaceMatch = bracket.value[rounds - 1]?.matches?.[0] || null

  // 半决赛
  const semiRound = bracket.value[rounds - 3]
  const semiMatches = semiRound?.matches || []

  // 左右半区（不含半决赛、决赛、季军赛）
  const leftRounds = []
  const rightRounds = []

  for (let r = 0; r < rounds - 3; r++) {
    const roundData = bracket.value[r]
    const matchCount = roundData.matches.length
    const half = Math.floor(matchCount / 2)

    leftRounds.push({
      round: roundData.round,
      name: roundData.name,
      matches: roundData.matches.slice(0, half),
      side: 'left'
    })

    rightRounds.push({
      round: roundData.round,
      name: roundData.name,
      matches: roundData.matches.slice(half),
      side: 'right'
    })
  }

  // 半决赛加入最内层
  if (semiMatches.length >= 2) {
    leftRounds.push({
      round: semiRound.round,
      name: semiRound.name,
      matches: [semiMatches[0]],
      side: 'left'
    })
    rightRounds.push({
      round: semiRound.round,
      name: semiRound.name,
      matches: [semiMatches[1]],
      side: 'right'
    })
  }

  return { leftRounds, rightRounds, finalMatch, thirdPlaceMatch }
})

// 是否已生成抽签表（控制界面显示）
const drawGenerated = ref(false)
const hasSavedGroups = ref(false)

// 是否可以确认配置
const canConfirmConfig = computed(() => {
  if (tournamentType.value === 'cup') {
    return configForm.value.knockoutSize > 0
  }
  if (tournamentType.value === 'league') {
    if (configForm.value.leagueGrouped) return configForm.value.groupCount > 0
    return true
  }
  return configForm.value.groupCount > 0 && configForm.value.teamsPerGroup > 0
})

// 确认配置并生成空表格
function confirmConfig() {
  // 应用配置
  groupCount.value = configForm.value.groupCount
  teamsPerGroup.value = configForm.value.teamsPerGroup

  // 生成空表格
  generateDraw()

  // 关闭对话框
  showConfigDialog.value = false

  ElMessage.success('已生成空表格，请拖拽球队进行分配')
}

// 重新配置
function reconfigure() {
  ElMessageBox.confirm('重新配置将清空当前所有分配，确定继续吗？', '重新配置', {
    type: 'warning'
  }).then(() => {
    clearGroups()
    drawGenerated.value = false
    showConfigDialog.value = true
  }).catch(() => {})
}

// 重置配置
function resetConfig() {
  configForm.value = {
    tournamentType: 'tournament',
    groupCount: 4,
    teamsPerGroup: 4,
    knockoutSize: 16,
    leagueGrouped: false
  }
}

// 生成抽签表（空表格）
function generateDraw() {
  drawGenerated.value = true

  if (tournamentType.value === 'cup') {
    generateKnockoutBracket()
  } else if (tournamentType.value === 'league') {
    generateLeagueTable()
  } else {
    initGroups()
  }
}

// 生成淘汰赛对阵树
function generateKnockoutBracket() {
  const size = configForm.value.knockoutSize
  const totalRounds = Math.log2(size)
  const bracketData = []

  for (let r = 0; r < totalRounds; r++) {
    const matchCount = size / Math.pow(2, r + 1)
    const roundName = getRoundName(r, totalRounds)
    const matches = []
    for (let m = 0; m < matchCount; m++) {
      matches.push({
        id: `r${r}_m${m}`,
        slot1: null,
        slot2: null,
        winner: null,
        dragOverSlot1: false,
        dragOverSlot2: false,
        _roundIndex: r,
        _matchIndex: m
      })
    }
    bracketData.push({
      round: r + 1,
      name: roundName,
      matches
    })
  }

  // 添加季军赛
  bracketData.push({
    round: totalRounds + 1,
    name: '季军赛',
    matches: [{
      id: 'third-place',
      slot1: null,
      slot2: null,
      winner: null,
      dragOverSlot1: false,
      dragOverSlot2: false
    }]
  })

  bracket.value = bracketData
  groups.value = []
  ElMessage.success(`已生成 ${size} 强淘汰赛对阵表（含季军赛）`)
}

// 获取淘汰赛轮次名称
function getRoundName(roundIndex, totalRounds) {
  const roundMap = {
    1: { 0: '决赛' },
    2: { 0: '半决赛', 1: '决赛' },
    3: { 0: '1/4决赛', 1: '半决赛', 2: '决赛' },
    4: { 0: '1/8决赛', 1: '1/4决赛', 2: '半决赛', 3: '决赛' },
    5: { 0: '1/16决赛', 1: '1/8决赛', 2: '1/4决赛', 3: '半决赛', 4: '决赛' },
    6: { 0: '1/32决赛', 1: '1/16决赛', 2: '1/8决赛', 3: '1/4决赛', 4: '半决赛', 5: '决赛' }
  }
  return roundMap[totalRounds]?.[roundIndex] || `第${roundIndex + 1}轮`
}

// 生成联赛积分表
function generateLeagueTable() {
  if (configForm.value.leagueGrouped) {
    groups.value = []
    for (let i = 0; i < groupCount.value; i++) {
      groups.value.push({
        name: groupNames[i],
        code: String.fromCharCode(65 + i),
        teams: [],
        type: 'league'
      })
    }
  } else {
    groups.value = [{
      name: '联赛积分榜',
      code: 'ALL',
      teams: [],
      type: 'league'
    }]
  }
  bracket.value = []
  ElMessage.success(configForm.value.leagueGrouped ? `已生成 ${groupCount.value} 个小组积分表` : '已生成联赛积分表')
}

// 组名列表
const groupNames = ['A组', 'B组', 'C组', 'D组', 'E组', 'F组', 'G组', 'H组',
  'I组', 'J组', 'K组', 'L组', 'M组', 'N组', 'O组', 'P组']

// 计算属性
const ungroupedTeams = computed(() => {
  const groupedIds = new Set()
  groups.value.forEach(g => {
    // 赛会制：slots
    if (g.slots) {
      g.slots.forEach(slot => {
        if (slot) groupedIds.add(slot.teamId)
      })
    }
    // 联赛制：teams
    if (g.teams) {
      g.teams.forEach(team => {
        if (team && team.teamId) groupedIds.add(team.teamId)
      })
    }
  })
  bracket.value.forEach(r => r.matches.forEach(m => {
    if (m.slot1) groupedIds.add(m.slot1.teamId)
    if (m.slot2) groupedIds.add(m.slot2.teamId)
  }))
  return approvedTeams.value.filter(t => !groupedIds.has(t.teamId))
})

const groupedCount = computed(() => {
  let count = 0
  groups.value.forEach(g => {
    if (g.slots) {
      g.slots.forEach(slot => {
        if (slot) count++
      })
    }
    if (g.teams) {
      count += g.teams.filter(t => t && t.teamId).length
    }
  })
  bracket.value.forEach(r => r.matches.forEach(m => {
    if (m.slot1) count++
    if (m.slot2) count++
  }))
  return count
})

// 监听分组数量变化
watch(groupCount, (newVal) => {
  if (tournamentType.value !== 'tournament') return
  const current = groups.value.length
  if (newVal > current) {
    for (let i = current; i < newVal; i++) {
      groups.value.push({ name: groupNames[i], slots: new Array(teamsPerGroup.value).fill(null), dragOver: false, slotDragOver: -1 })
    }
  } else if (newVal < current) {
    groups.value = groups.value.slice(0, newVal)
  }
})

// 加载赛事信息
async function loadTournament() {
  try {
    tournament.value = await queryById('tournaments', tournamentId)
  } catch (err) {
    console.error('加载赛事失败:', err)
  }
}

// 加载已参赛球队
async function loadApprovedTeams() {
  loading.value = true
  try {
    const list = await queryList('tournament_teams', {
      where: { tournamentId, status: 'approved' },
      orderBy: { createTime: 'desc' }
    })

    const teamIds = list.map(t => t.teamId).filter(Boolean)
    if (teamIds.length > 0) {
      const teamsData = await queryList('teams', {
        where: { _id: { $in: teamIds } }
      })
      const teamMap = {}
      teamsData.forEach(t => { teamMap[t._id] = t })

      approvedTeams.value = list.map(item => ({
        ...item,
        ...teamMap[item.teamId],
        _id: item._id,
        teamId: item.teamId
      }))
    } else {
      approvedTeams.value = list
    }
  } catch (err) {
    console.error('加载球队失败:', err)
    ElMessage.error('加载球队列表失败')
  } finally {
    loading.value = false
  }
}

// 加载已有数据
async function loadGroups() {
  try {
    if (tournamentType.value === 'cup') {
      await loadBracket()
    } else if (tournamentType.value === 'league') {
      await loadLeagueTables()
    } else {
      await loadGroupsData()
    }
  } catch (err) {
    console.error('加载数据失败:', err)
    drawGenerated.value = false
  }
}

async function loadGroupsData() {
  const list = await queryList('tournament_groups', {
    where: { tournamentId },
    orderBy: { groupCode: 'asc' }
  })

  if (list.length > 0) {
    drawGenerated.value = true
    hasSavedGroups.value = true
    groups.value = list.map(g => {
      const maxTeams = g.maxTeams || teamsPerGroup.value || 4
      const slots = new Array(maxTeams).fill(null)
      ;(g.teams || []).forEach(t => {
        const fullTeam = approvedTeams.value.find(at => at.teamId === t.teamId)
        const team = fullTeam || t
        const position = (t.seedOrder || t.position || 1) - 1
        if (position >= 0 && position < slots.length) {
          slots[position] = team
        } else {
          const emptyIndex = slots.findIndex(s => !s)
          if (emptyIndex >= 0) slots[emptyIndex] = team
        }
      })
      return {
        _id: g._id,
        name: g.groupName,
        code: g.groupCode,
        slots,
        type: g.type || 'group'
      }
    })
    groupCount.value = groups.value.length
    // 恢复配置
    configForm.value.groupCount = groups.value.length
    if (list.length > 0 && list[0].maxTeams) {
      teamsPerGroup.value = list[0].maxTeams
      configForm.value.teamsPerGroup = list[0].maxTeams
    }

    // 将占位球队（轮空/附加赛待定）加入 approvedTeams，确保移回池子时能显示
    groups.value.forEach(g => {
      g.slots.forEach(slot => {
        if (slot && (slot.teamId.startsWith('bye-') || slot.teamId.startsWith('playin-')) && !approvedTeams.value.find(at => at.teamId === slot.teamId)) {
          approvedTeams.value.push({
            teamId: slot.teamId,
            name: slot.name || slot.teamName || '占位球队',
            teamName: slot.teamName || slot.name || '占位球队',
            isPlaceholder: true
          })
        }
      })
    })
  }
}

async function loadBracket() {
  const list = await queryList('tournament_bracket', {
    where: { tournamentId },
    orderBy: { round: 'asc' }
  })

  if (list.length > 0) {
    drawGenerated.value = true
    hasSavedGroups.value = true
    bracket.value = list.map((r, ri) => ({
      round: r.round,
      name: r.name,
      matches: r.matches.map((m, mi) => ({
        id: m.matchId || `r${ri}_m${mi}`,
        slot1: m.slot1 ? approvedTeams.value.find(t => t.teamId === m.slot1.teamId) || m.slot1 : null,
        slot2: m.slot2 ? approvedTeams.value.find(t => t.teamId === m.slot2.teamId) || m.slot2 : null,
        winner: m.winner ? approvedTeams.value.find(t => t.teamId === m.winner.teamId) || m.winner : null,
        dragOverSlot1: false,
        dragOverSlot2: false,
        _roundIndex: ri,
        _matchIndex: mi
      }))
    }))
    // 恢复确认状态（从第一条记录的 meta 中读取）
    bracketConfirmed.value = list[0]?.confirmed === true
  }
}

async function loadLeagueTables() {
  const list = await queryList('tournament_league_tables', {
    where: { tournamentId },
    orderBy: { tableName: 'asc' }
  })

  if (list.length > 0) {
    drawGenerated.value = true
    hasSavedGroups.value = true
    groups.value = list.map(t => ({
      _id: t._id,
      name: t.tableName,
      code: t.tableCode,
      teams: (t.teams || []).map(tt => {
        const fullTeam = approvedTeams.value.find(at => at.teamId === tt.teamId)
        return fullTeam || tt
      }),
      type: 'league'
    }))
    groupCount.value = groups.value.length
    // 恢复配置
    configForm.value.groupCount = groups.value.length
    configForm.value.leagueGrouped = groups.value.length > 1
  }
}

// 初始化分组
function initGroups() {
  groups.value = []
  for (let i = 0; i < groupCount.value; i++) {
    groups.value.push({
      name: groupNames[i],
      code: String.fromCharCode(65 + i),
      slots: new Array(teamsPerGroup.value).fill(null)
    })
  }
}

// ===== 鼠标事件拖放实现（绕过 HTML5 DnD 在 Vue 3 下的兼容性问题）=====

const isMouseDragging = ref(false)
const dragCloneEl = ref(null)
const dragPayload = ref(null)

function onMouseDown(e, team, fromGroupIndex = null, fromBracket = null) {
  if (props.readonly) return
  if (e.button !== 0) return
  e.preventDefault()

  const card = e.currentTarget
  const rect = card.getBoundingClientRect()

  // 创建克隆元素作为拖拽视觉反馈
  const clone = card.cloneNode(true)
  clone.classList.add('drag-clone')
  clone.style.position = 'fixed'
  clone.style.left = rect.left + 'px'
  clone.style.top = rect.top + 'px'
  clone.style.width = rect.width + 'px'
  clone.style.pointerEvents = 'none'
  clone.style.zIndex = '9999'
  clone.style.opacity = '0.92'
  document.body.appendChild(clone)

  // 记录数据
  dragCloneEl.value = clone
  dragPayload.value = {
    team,
    fromGroupIndex,
    fromBracket,
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top
  }
  isMouseDragging.value = true

  // 原元素半透明
  card.classList.add('dragging-source')

  // 绑定全局事件
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e) {
  if (!isMouseDragging.value || !dragCloneEl.value) return

  const clone = dragCloneEl.value
  clone.style.left = (e.clientX - dragPayload.value.offsetX) + 'px'
  clone.style.top = (e.clientY - dragPayload.value.offsetY) + 'px'

  // 检测下方的目标元素（先隐藏克隆元素以免挡住）
  clone.style.visibility = 'hidden'
  const target = document.elementFromPoint(e.clientX, e.clientY)
  clone.style.visibility = 'visible'

  // 重置所有高亮
  document.querySelectorAll('.group-slot-empty').forEach(el => el.classList.remove('slot-dragover'))
  document.querySelectorAll('.team-pool').forEach(el => el.classList.remove('pool-dragover'))
  document.querySelectorAll('.match-team.bracket-slot').forEach(el => el.classList.remove('slot-dragover'))
  document.querySelectorAll('.league-table-drop-zone').forEach(el => el.classList.remove('drop-active'))

  if (target) {
    const slot = target.closest('.group-slot-empty')
    if (slot) slot.classList.add('slot-dragover')
    const pool = target.closest('.team-pool')
    if (pool) pool.classList.add('pool-dragover')
    const bracketSlot = target.closest('.match-team.bracket-slot')
    if (bracketSlot && !bracketSlot.classList.contains('filled')) {
      bracketSlot.classList.add('slot-dragover')
    }
    const leagueDrop = target.closest('.league-table-drop-zone')
    if (leagueDrop) leagueDrop.classList.add('drop-active')
  }
}

function onMouseUp(e) {
  if (!isMouseDragging.value) return

  const clone = dragCloneEl.value
  const payload = dragPayload.value

  // 隐藏克隆元素以获取下方真实元素
  if (clone) clone.style.visibility = 'hidden'
  const target = document.elementFromPoint(e.clientX, e.clientY)
  if (clone) clone.style.visibility = 'visible'

  let handled = false

  if (target && payload) {
    // 检查是否放入小组赛空槽位
    const slot = target.closest('.group-slot-empty')
    if (slot) {
      const groupIndex = parseInt(slot.dataset.groupIndex)
      const slotIndex = parseInt(slot.dataset.slotIndex)
      handleSlotDropManual(payload.team, payload.fromGroupIndex, groupIndex, slotIndex)
      handled = true
    }

    // 检查是否放入淘汰赛签位
    const bracketSlot = target.closest('.match-team.bracket-slot')
    if (bracketSlot && !handled) {
      const round = parseInt(bracketSlot.dataset.round)
      const match = parseInt(bracketSlot.dataset.match)
      const slotName = bracketSlot.dataset.slot
      handleBracketSlotDropManual(payload.team, payload.fromGroupIndex, payload.fromBracket, round, match, slotName)
      handled = true
    }

    // 检查是否放入联赛制积分表
    const leagueDropZone = target.closest('.league-table-drop-zone')
    if (leagueDropZone && !handled) {
      const groupIndex = parseInt(leagueDropZone.dataset.groupIndex)
      handleLeagueDropManual(payload.team, payload.fromGroupIndex, payload.fromBracket, groupIndex)
      handled = true
    }

    // 检查是否放入球队池
    const pool = target.closest('.team-pool')
    if (pool && !handled) {
      handlePoolDropManual(payload.team, payload.fromGroupIndex, payload.fromBracket)
      handled = true
    }
  }

  // 清理
  if (clone) document.body.removeChild(clone)
  document.querySelectorAll('.dragging-source').forEach(el => el.classList.remove('dragging-source'))
  document.querySelectorAll('.group-slot-empty').forEach(el => el.classList.remove('slot-dragover'))
  document.querySelectorAll('.team-pool').forEach(el => el.classList.remove('pool-dragover'))
  document.querySelectorAll('.match-team.bracket-slot').forEach(el => el.classList.remove('slot-dragover'))
  document.querySelectorAll('.league-table-drop-zone').forEach(el => el.classList.remove('drop-active'))

  dragCloneEl.value = null
  dragPayload.value = null
  isMouseDragging.value = false

  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}

function handleSlotDropManual(team, fromGroupIndex, targetGroupIndex, targetSlotIndex) {
  if (!team) return

  try {
    // 从原位置移除
    if (fromGroupIndex !== null) {
      const fromGroup = groups.value[fromGroupIndex]
      if (fromGroup) {
        const fromSlotIndex = fromGroup.slots.findIndex(s => s && s.teamId === team.teamId)
        if (fromSlotIndex >= 0) {
          fromGroup.slots[fromSlotIndex] = null
        }
      }
    }

    // 添加到目标位置
    const targetGroup = groups.value[targetGroupIndex]
    if (!targetGroup) return
    if (targetGroup.slots[targetSlotIndex]) {
      ElMessage.warning(`${targetGroup.name} 位置${targetSlotIndex + 1} 已有球队`)
      return
    }
    if (!targetGroup.slots.find(s => s && s.teamId === team.teamId)) {
      targetGroup.slots[targetSlotIndex] = { ...team }
    }

    ElMessage.success(`${team.name || team.teamName} → ${targetGroup.name} 位置${targetSlotIndex + 1}`)
  } catch (err) {
    console.error('[鼠标拖放] 失败:', err)
    ElMessage.error('拖拽失败')
  }
}

function handlePoolDropManual(team, fromGroupIndex, fromBracket = null) {
  if (!team) return

  // 从小组赛/联赛制移回
  if (fromGroupIndex !== null) {
    const fromGroup = groups.value[fromGroupIndex]
    if (fromGroup) {
      // 赛会制：从 slots 中移除
      if (fromGroup.slots) {
        const fromSlotIndex = fromGroup.slots.findIndex(s => s && s.teamId === team.teamId)
        if (fromSlotIndex >= 0) {
          fromGroup.slots[fromSlotIndex] = null
          ElMessage.success(`${team.name || team.teamName} 已移回未分配池`)
          return
        }
      }
      // 联赛制：从 teams 中移除
      if (fromGroup.teams) {
        const fromTeamIndex = fromGroup.teams.findIndex(t => t && t.teamId === team.teamId)
        if (fromTeamIndex >= 0) {
          fromGroup.teams.splice(fromTeamIndex, 1)
          ElMessage.success(`${team.name || team.teamName} 已移回未分配池`)
          return
        }
      }
    }
    return
  }

  // 从淘汰赛移回
  if (fromBracket) {
    const { round, match, slot } = fromBracket
    const matchData = bracket.value[round]?.matches?.[match]
    if (matchData && matchData[slot] && matchData[slot].teamId === team.teamId) {
      matchData[slot] = null
      ElMessage.success(`${team.name || team.teamName} 已移回未分配池`)
    }
    return
  }
}

// 联赛制积分表放置
function handleLeagueDropManual(team, fromGroupIndex, fromBracket, targetGroupIndex) {
  if (!team || !team.teamId) return

  const targetGroup = groups.value[targetGroupIndex]
  if (!targetGroup) return

  // 检查是否已在该组
  if (targetGroup.teams && targetGroup.teams.find(t => t && t.teamId === team.teamId)) {
    ElMessage.warning(`${team.name || team.teamName} 已在 ${targetGroup.name}`)
    return
  }

  // 从原位置移除
  if (fromGroupIndex !== null) {
    const fromGroup = groups.value[fromGroupIndex]
    if (fromGroup) {
      if (fromGroup.slots) {
        const fromSlotIndex = fromGroup.slots.findIndex(s => s && s.teamId === team.teamId)
        if (fromSlotIndex >= 0) fromGroup.slots[fromSlotIndex] = null
      }
      if (fromGroup.teams) {
        const fromTeamIndex = fromGroup.teams.findIndex(t => t && t.teamId === team.teamId)
        if (fromTeamIndex >= 0) fromGroup.teams.splice(fromTeamIndex, 1)
      }
    }
  } else if (fromBracket) {
    const { round, match, slot } = fromBracket
    const oldMatch = bracket.value[round]?.matches?.[match]
    if (oldMatch && oldMatch[slot] && oldMatch[slot].teamId === team.teamId) {
      oldMatch[slot] = null
    }
  }

  // 添加到目标组
  if (!targetGroup.teams) targetGroup.teams = []
  targetGroup.teams.push({ ...team })
  ElMessage.success(`${team.name || team.teamName} → ${targetGroup.name}`)
}

// 淘汰赛签位放置
function handleBracketSlotDropManual(team, fromGroupIndex, fromBracket, targetRound, targetMatch, targetSlot) {
  if (!team || !team.teamId) {
    console.warn('[drop] team missing or no teamId', team)
    return
  }


  const targetRoundData = bracket.value[targetRound]
  if (!targetRoundData) {
    console.warn('[drop] targetRound not found', targetRound, 'bracket length=', bracket.value.length)
    ElMessage.error('目标轮次不存在')
    return
  }

  const targetMatchData = targetRoundData.matches?.[targetMatch]
  if (!targetMatchData) {
    console.warn('[drop] targetMatch not found', targetMatch, 'matches length=', targetRoundData.matches?.length)
    ElMessage.error('目标比赛不存在')
    return
  }

  if (targetMatchData[targetSlot]) {
    ElMessage.warning('该签位已有球队')
    return
  }

  // 检查是否已在其他位置（排除原位置）
  for (let ri = 0; ri < bracket.value.length; ri++) {
    const r = bracket.value[ri]
    for (let mi = 0; mi < r.matches.length; mi++) {
      const m = r.matches[mi]
      if (m.slot1 && m.slot1.teamId === team.teamId) {
        if (targetRound === ri && targetMatch === mi && targetSlot === 'slot1') {
          return // 拖到原位置
        }
        ElMessage.warning(`${team.name || team.teamName} 已在淘汰赛中`)
        return
      }
      if (m.slot2 && m.slot2.teamId === team.teamId) {
        if (targetRound === ri && targetMatch === mi && targetSlot === 'slot2') {
          return // 拖到原位置
        }
        ElMessage.warning(`${team.name || team.teamName} 已在淘汰赛中`)
        return
      }
    }
  }

  // 从原位置移除
  if (fromGroupIndex !== null) {
    const fromGroup = groups.value[fromGroupIndex]
    if (fromGroup) {
      const fromSlotIndex = fromGroup.slots.findIndex(s => s && s.teamId === team.teamId)
      if (fromSlotIndex >= 0) fromGroup.slots[fromSlotIndex] = null
    }
  } else if (fromBracket) {
    const { round, match, slot } = fromBracket
    const oldMatch = bracket.value[round]?.matches?.[match]
    if (oldMatch && oldMatch[slot] && oldMatch[slot].teamId === team.teamId) {
      oldMatch[slot] = null
    }
  }

  // 放入目标位置
  targetMatchData[targetSlot] = { ...team }
  ElMessage.success(`${team.name || team.teamName} → 淘汰赛签位`)
}

// 添加占位球队（轮空 / 附加赛待定）
function addPlaceholder(type) {
  const existing = approvedTeams.value.filter(t => t.teamId && t.teamId.startsWith(type + '-'))
  const count = existing.length
  const id = `${type}-${count + 1}`
  const name = type === 'bye' ? '轮空' : `附加赛胜者${count + 1}`
  approvedTeams.value.push({
    teamId: id,
    name: name,
    teamName: name,
    isPlaceholder: true
  })
  ElMessage.success(`已添加 ${name}`)
}

// 删除占位球队
function removePlaceholder(team) {
  if (!team.isPlaceholder) return
  const idx = approvedTeams.value.findIndex(t => t.teamId === team.teamId)
  if (idx >= 0) {
    approvedTeams.value.splice(idx, 1)
    ElMessage.success(`已删除 ${team.name || team.teamName}`)
  }
}

// 随机抽签
async function autoDraw() {
  if (ungroupedTeams.value.length === 0) {
    ElMessage.info('没有待分配的球队')
    return
  }

  await ElMessageBox.confirm('将随机把所有未分配球队分配到各位置，确定继续吗？', '随机抽签', {
    confirmButtonText: '开始抽签',
    cancelButtonText: '取消',
    type: 'warning'
  })

  drawing.value = true
  showDrawAnimation.value = true
  drawProgress.value = 0
  drawStatus.value = '准备开始...'

  const pool = [...ungroupedTeams.value]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]]
  }

  const alreadyGroupedIds = new Set()
  groups.value.forEach(g => {
    if (g.slots) {
      g.slots.forEach(slot => {
        if (slot) alreadyGroupedIds.add(slot.teamId)
      })
    }
    if (g.teams) {
      g.teams.forEach(t => {
        if (t && t.teamId) alreadyGroupedIds.add(t.teamId)
      })
    }
  })
  bracket.value.forEach(r => r.matches.forEach(m => {
    if (m.slot1) alreadyGroupedIds.add(m.slot1.teamId)
    if (m.slot2) alreadyGroupedIds.add(m.slot2.teamId)
  }))

  const total = pool.length
  let current = 0

  for (const team of pool) {
    if (alreadyGroupedIds.has(team.teamId)) continue

    if (tournamentType.value === 'cup') {
      // 找到第一个有空位的槽位
      let placed = false
      for (const round of bracket.value) {
        for (const match of round.matches) {
          if (!match.slot1) {
            match.slot1 = team
            placed = true
            break
          } else if (!match.slot2) {
            match.slot2 = team
            placed = true
            break
          }
        }
        if (placed) break
      }
    } else if (tournamentType.value === 'league') {
      // 联赛制：轮流分配到各组
      const groupIndex = current % groups.value.length
      const group = groups.value[groupIndex]
      group.teams.push(team)

      drawStatus.value = `正在抽取: ${team.name || team.teamName} → ${group.name}`
      groupHighlightIndex.value = groupIndex

      await delay(300 + Math.random() * 400)
    } else {
      // 赛会制：收集所有空位
      const emptySlots = []
      groups.value.forEach((g, gi) => {
        g.slots.forEach((slot, si) => {
          if (!slot) emptySlots.push({ groupIndex: gi, slotIndex: si })
        })
      })
      if (emptySlots.length === 0) break

      const randomIndex = Math.floor(Math.random() * emptySlots.length)
      const { groupIndex, slotIndex } = emptySlots[randomIndex]

      drawStatus.value = `正在抽取: ${team.name || team.teamName} → ${groups.value[groupIndex].name} 位置${slotIndex + 1}`
      groupHighlightIndex.value = groupIndex

      await delay(300 + Math.random() * 400)

      groups.value[groupIndex].slots[slotIndex] = team
    }

    current++
    drawProgress.value = Math.round((current / total) * 100)
  }

  await delay(500)
  drawStatus.value = '抽签完成！'
  await delay(500)

  showDrawAnimation.value = false
  groupHighlightIndex.value = -1
  drawing.value = false

  ElMessage.success(`抽签完成！已将 ${current} 支球队分配完毕`)
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function ballStyle(i) {
  const angle = (i / 8) * 360
  return {
    animationDelay: `${i * 0.1}s`,
    transform: `rotate(${angle}deg) translateY(-40px) rotate(-${angle}deg)`
  }
}

// 清空分组
function clearGroups() {
  ElMessageBox.confirm('确定清空所有分配吗？球队将回到未分配池。', '清空分配', {
    type: 'warning'
  }).then(() => {
    groups.value.forEach(g => {
      if (g.slots) {
        g.slots = new Array(teamsPerGroup.value).fill(null)
      }
      if (g.teams) {
        g.teams = []
      }
    })
    bracket.value.forEach(r => r.matches.forEach(m => { m.slot1 = null; m.slot2 = null; m.winner = null }))
    bracketConfirmed.value = false
    ElMessage.success('已清空所有分配')
  }).catch(() => {})
}

// 保存分组/对阵/积分表
async function saveGroups() {
  await ElMessageBox.confirm('保存后抽签结果将生效，确定保存吗？', '保存确认', {
    type: 'warning'
  })

  saving.value = true
  try {
    if (tournamentType.value === 'cup') {
      await saveBracket()
    } else if (tournamentType.value === 'league') {
      await saveLeagueTables()
    } else {
      await saveGroupsData()
    }

    hasSavedGroups.value = true
    ElMessage.success('保存成功！')
  } catch (err) {
    console.error('保存失败:', err)
    ElMessage.error('保存失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

async function saveGroupsData() {
  const oldGroups = await queryList('tournament_groups', { where: { tournamentId } })
  for (const g of oldGroups) {
    await deleteRecord('tournament_groups', g._id)
  }

  for (const group of groups.value) {
    const teamList = group.slots.map((slot, index) => {
      if (!slot) return null
      return {
        teamId: slot.teamId,
        teamName: slot.name || slot.teamName,
        seedOrder: index + 1
      }
    }).filter(Boolean)

    await addRecord('tournament_groups', {
      tournamentId,
      groupName: group.name,
      groupCode: group.code || group.name[0],
      teams: teamList,
      teamCount: teamList.length,
      maxTeams: teamsPerGroup.value,
      type: 'group',
      createTime: new Date(),
      updateTime: new Date()
    })
  }
}

async function saveBracket() {
  const oldBracket = await queryList('tournament_bracket', { where: { tournamentId } })
  for (const b of oldBracket) {
    await deleteRecord('tournament_bracket', b._id)
  }

  for (let index = 0; index < bracket.value.length; index++) {
    const roundData = bracket.value[index]
    await addRecord('tournament_bracket', {
      tournamentId,
      round: roundData.round,
      name: roundData.name,
      matches: roundData.matches.map(m => ({
        matchId: m.id,
        slot1: m.slot1 ? { teamId: m.slot1.teamId, teamName: m.slot1.name || m.slot1.teamName } : null,
        slot2: m.slot2 ? { teamId: m.slot2.teamId, teamName: m.slot2.name || m.slot2.teamName } : null,
        winner: m.winner ? { teamId: m.winner.teamId, teamName: m.winner.name || m.winner.teamName } : null
      })),
      // 在第一条记录中保存确认状态
      confirmed: index === 0 ? bracketConfirmed.value : undefined,
      createTime: new Date(),
      updateTime: new Date()
    })
  }
}

async function saveLeagueTables() {
  const oldTables = await queryList('tournament_league_tables', { where: { tournamentId } })
  for (const t of oldTables) {
    await deleteRecord('tournament_league_tables', t._id)
  }

  for (const group of groups.value) {
    const teamList = group.teams.map((t, index) => ({
      teamId: t.teamId,
      teamName: t.name || t.teamName,
      position: index + 1,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0
    }))

    await addRecord('tournament_league_tables', {
      tournamentId,
      tableName: group.name,
      tableCode: group.code || 'ALL',
      teams: teamList,
      teamCount: teamList.length,
      type: 'league',
      createTime: new Date(),
      updateTime: new Date()
    })
  }
}

// 确认对阵
async function confirmBracket() {
  await ElMessageBox.confirm('确认后对阵将锁定，确定要确认当前对阵吗？', '确认对阵', {
    confirmButtonText: '确认对阵',
    cancelButtonText: '取消',
    type: 'warning'
  })
  bracketConfirmed.value = true
  ElMessage.success('对阵已确认')
}

// 导出图片
async function exportImage() {
  exportingImage.value = true
  try {
    let targetEl = null
    let filename = ''

    if (tournamentType.value === 'cup') {
      targetEl = document.querySelector('.knockout-worldcup')
      filename = `${tournament.value.name || '赛事'}_淘汰赛对阵图.png`
    } else if (tournamentType.value === 'tournament') {
      targetEl = document.querySelector('.groups-area')
      filename = `${tournament.value.name || '赛事'}_抽签分组.png`
    } else {
      targetEl = document.querySelector('.league-container')
      filename = `${tournament.value.name || '赛事'}_联赛积分榜.png`
    }

    if (!targetEl) {
      ElMessage.error('未找到可导出的内容')
      return
    }

    // 临时扩大容器确保完整捕获
    const originalOverflow = targetEl.style.overflow
    targetEl.style.overflow = 'visible'

    const canvas = await html2canvas(targetEl, {
      backgroundColor: tournamentType.value === 'cup' ? '#0a2540' : '#f5f7fa',
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false
    })

    targetEl.style.overflow = originalOverflow

    const link = document.createElement('a')
    link.download = filename
    link.href = canvas.toDataURL('image/png')
    link.click()

    ElMessage.success('图片导出成功')
  } catch (err) {
    console.error('导出图片失败:', err)
    ElMessage.error('导出图片失败: ' + err.message)
  } finally {
    exportingImage.value = false
  }
}

// 淘汰赛拖拽开始
function onBracketSlotDragStart(e, roundIndex, matchIndex, slotName) {
  const match = bracket.value[roundIndex].matches[matchIndex]
  const team = match[slotName]
  if (!team) return
  const dragData = JSON.stringify({
    teamId: team.teamId,
    teamName: team.name || team.teamName || '',
    teamLogo: team.logo || team.logoUrl || '',
    fromGroupIndex: null,
    fromBracket: { roundIndex, matchIndex, slotName }
  })
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('application/json', dragData)
  e.dataTransfer.setData('text/plain', team.teamId)
  // 原生 DOM 标记，不触发 Vue 响应式
  e.target.classList.add('dragging')
  e.target.dataset.draggingTeamId = team.teamId
}

function onBracketDragOver(match, slotName) {
  match.dragOverSlot1 = slotName === 'slot1'
  match.dragOverSlot2 = slotName === 'slot2'
}

function onBracketDrop(e, roundIndex, matchIndex, slotName) {
  e.preventDefault()
  e.stopPropagation()

  const { team, fromGroupIndex, fromBracket } = resolveDragData(e)
  if (!team) {
    console.warn('[拖拽] 淘汰赛 drop 无球队数据')
    return
  }

  // 从原位置移除
  if (fromGroupIndex !== null) {
    const fromGroup = groups.value[fromGroupIndex]
    if (fromGroup && fromGroup.slots) {
      const fromSlotIndex = fromGroup.slots.findIndex(s => s && s.teamId === team.teamId)
      if (fromSlotIndex >= 0) {
        fromGroup.slots[fromSlotIndex] = null
      }
    } else if (fromGroup && fromGroup.teams) {
      fromGroup.teams = fromGroup.teams.filter(t => t.teamId !== team.teamId)
    }
  } else if (fromBracket) {
    const { roundIndex: oldR, matchIndex: oldM, slotName: oldSlot } = fromBracket
    bracket.value[oldR].matches[oldM][oldSlot] = null
  }

  // 放入目标位置
  bracket.value[roundIndex].matches[matchIndex][slotName] = { ...team }

  bracket.value.forEach(r => r.matches.forEach(m => { m.dragOverSlot1 = false; m.dragOverSlot2 = false }))
}

// 抽签动画
const showDrawAnimation = ref(false)
const drawProgress = ref(0)
const drawStatus = ref('')

// 全屏切换
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().then(() => {
      isFullscreen.value = true
    }).catch(() => {
      ElMessage.warning('全屏模式需要浏览器支持')
    })
  } else {
    document.exitFullscreen().then(() => {
      isFullscreen.value = false
    })
  }
}

document.addEventListener('fullscreenchange', () => {
  isFullscreen.value = !!document.fullscreenElement
})

// 组件挂载
onMounted(async () => {
  await loadTournament()
  await loadApprovedTeams()
  await loadGroups()
})
</script>

<style scoped>
.tournament-draw {
  padding: 20px;
  max-width: 1600px;
  margin: 0 auto;
  min-height: 100vh;
  background: #f5f7fa;
}

.tournament-draw.fullscreen {
  padding: 0;
  max-width: none;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
}

.tournament-draw.embedded {
  padding: 0;
  min-height: auto;
  background: transparent;
}

/* 空状态 */
.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 60vh;
}

/* 配置对话框 */
.config-dialog-content {
  max-height: 60vh;
  overflow-y: auto;
}

.config-section {
  margin-bottom: 24px;
}

.config-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #374151;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.config-row label {
  font-size: 14px;
  color: #374151;
  min-width: 90px;
  text-align: right;
}

.config-hint {
  font-size: 12px;
  color: #9ca3af;
}

/* 全屏模式顶部 */
.draw-header-fullscreen {
  text-align: center;
  padding: 30px 0 20px;
  color: #fff;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.draw-header-fullscreen .logo {
  font-size: 14px;
  color: #94a3b8;
  margin-bottom: 12px;
  letter-spacing: 2px;
}

.draw-header-fullscreen .title {
  font-size: 36px;
  font-weight: 700;
  color: #fbbf24;
  text-shadow: 0 0 20px rgba(251, 191, 36, 0.3);
  margin-bottom: 8px;
}

.draw-header-fullscreen .subtitle {
  font-size: 18px;
  color: #94a3b8;
}

/* 操作栏 */
.draw-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #fff;
  border-radius: 12px;
  margin: 20px 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.embedded .draw-toolbar,
.draw-toolbar.embedded-toolbar {
  margin: 0 0 16px 0;
  padding: 12px 16px;
}

.toolbar-left {
  display: flex;
  gap: 24px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-label {
  font-size: 13px;
  color: #6b7280;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #1f2937;
}

.toolbar-right {
  display: flex;
  gap: 12px;
}

/* 抽签动画 */
.draw-animation-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.95);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.draw-animation-content {
  text-align: center;
}

.animation-title {
  font-size: 32px;
  font-weight: 700;
  color: #fbbf24;
  margin-bottom: 40px;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.05); }
}

.animation-ball-container {
  position: relative;
  width: 120px;
  height: 120px;
  margin: 0 auto 40px;
}

.animation-ball {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 20px;
  height: 20px;
  background: linear-gradient(135deg, #f59e0b, #fbbf24);
  border-radius: 50%;
  margin: -10px 0 0 -10px;
  animation: orbit 1s linear infinite;
  box-shadow: 0 0 10px rgba(245, 158, 11, 0.6);
}

@keyframes orbit {
  0% { transform: rotate(0deg) translateY(-40px) rotate(0deg); }
  100% { transform: rotate(360deg) translateY(-40px) rotate(-360deg); }
}

.animation-progress {
  width: 300px;
  margin: 0 auto 20px;
}

.animation-status {
  font-size: 16px;
  color: #94a3b8;
  min-height: 24px;
}

/* 主体区域 */
.draw-body {
  display: flex;
  gap: 20px;
  height: calc(100vh - 220px);
}

.draw-body.fullscreen {
  gap: 30px;
  padding: 20px 40px;
  height: calc(100vh - 200px);
}

/* 球队池 */
.team-pool {
  flex: 0 0 300px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.team-pool.fullscreen {
  flex: 0 0 360px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.team-pool.pool-dragover {
  border: 2px dashed #409eff;
  background: rgba(64, 158, 255, 0.05);
}

.pool-header {
  padding: 16px 20px;
  border-bottom: 1px solid #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.pool-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
}

.team-pool.fullscreen .pool-header {
  border-bottom-color: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.pool-header h3 {
  margin: 0;
  font-size: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  flex-shrink: 0;
}

.pool-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 球队卡片 */
.team-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f9fafb;
  border-radius: 10px;
  cursor: grab;
  transition: all 0.2s;
  border: 2px solid transparent;
}

.team-card:hover {
  background: #f3f4f6;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.team-card.dragging {
  opacity: 0.5;
  cursor: grabbing;
}

.team-logo-wrapper {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.team-logo-wrapper.small {
  width: 28px;
  height: 28px;
}

.team-logo {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  object-fit: cover;
}

.team-logo-placeholder {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
}

.team-name {
  flex: 1;
  font-weight: 500;
  color: #1f2937;
  font-size: 14px;
}

.team-coach {
  font-size: 12px;
  color: #6b7280;
}

/* 删除占位球队按钮 */
.delete-placeholder-btn {
  opacity: 0;
  transition: opacity 0.2s;
  flex-shrink: 0;
}

.team-card:hover .delete-placeholder-btn {
  opacity: 1;
}

.team-card.placeholder {
  border: 2px dashed #d1d5db;
  background: #f3f4f6;
}

.team-card.placeholder:hover {
  border-color: #f56c6c;
}

/* 分组区域 */
.groups-area {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  overflow-y: auto;
  align-content: start;
}

.groups-area.fullscreen {
  gap: 20px;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.group-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: all 0.2s;
  border: 2px solid transparent;
}

.tournament-draw.fullscreen .group-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.group-card.drag-over {
  border-color: #409eff;
}

.group-card.group-highlight {
  border-color: #f59e0b;
  box-shadow: 0 0 20px rgba(245, 158, 11, 0.3);
  animation: highlightPulse 0.5s ease-in-out;
}

@keyframes highlightPulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.02); }
  100% { transform: scale(1); }
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: linear-gradient(135deg, #1B5E20 0%, #43A047 100%);
  color: #fff;
}

.group-name {
  font-size: 18px;
  font-weight: 700;
}

.group-count {
  min-width: 44px;
  height: 26px;
  border-radius: 13px;
  padding: 0 10px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.group-teams {
  flex: 1;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 80px;
}

.group-slot-empty {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #fafbfc;
  border-radius: 8px;
  border: 2px dashed #e0e3e9;
  min-height: 44px;
  transition: all 0.2s;
}

.group-slot-empty .slot-number {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #909399;
  flex-shrink: 0;
}

.group-slot-empty .slot-hint {
  font-size: 13px;
  color: #c0c4cc;
  flex: 1;
}

/* 拖拽悬停时高亮具体空位 */
.group-slot-empty.slot-dragover {
  border-color: #409eff;
  background: rgba(64, 158, 255, 0.08);
  border-style: solid;
}

.group-slot-empty.slot-dragover .slot-number {
  background: #409eff;
  color: #fff;
}

.group-team-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #f9fafb;
  border-radius: 8px;
  cursor: grab;
  transition: all 0.2s;
}

.group-team-item:hover {
  background: #f3f4f6;
}

.team-rank {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  flex-shrink: 0;
}

.drag-handle {
  color: #c0c4cc;
  cursor: grab;
}

/* 淘汰赛对阵树 - 世界杯式布局 */
.knockout-worldcup {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding: 12px;
  background: linear-gradient(135deg, #0a2540 0%, #0d3b66 50%, #0a2540 100%);
  border-radius: 16px;
}

.knockout-worldcup.fullscreen {
  padding: 24px 40px;
  border-radius: 0;
}

.knockout-bracket-body {
  display: flex;
  flex: 1;
  gap: 16px;
  align-items: stretch;
  min-height: 0;
  min-width: fit-content;
}

/* 左右半区 */
.bracket-side {
  flex: 1;
  display: flex;
  gap: 16px;
  min-width: 0;
}

.bracket-left {
  flex-direction: row;
}

.bracket-right {
  flex-direction: row-reverse;
}

/* 轮次列 */
.bracket-round-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 130px;
  max-width: 180px;
}

.bracket-round-column.semi-final {
  min-width: 140px;
}

.round-label {
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: #60a5fa;
  margin-bottom: 8px;
  padding: 4px 8px;
  background: rgba(96, 165, 250, 0.1);
  border-radius: 6px;
  border: 1px solid rgba(96, 165, 250, 0.2);
  white-space: nowrap;
}

.round-matches-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  gap: 8px;
}

/* 单场比赛 */
.knockout-match {
  display: flex;
  align-items: center;
  gap: 6px;
  position: relative;
}

.bracket-left .knockout-match {
  flex-direction: row;
}

.bracket-right .knockout-match {
  flex-direction: row-reverse;
}

.match-teams {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.match-team {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  min-height: 36px;
  transition: all 0.2s;
  cursor: grab;
  user-select: none;
}

.match-team.filled {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.4);
}

.match-team.drag-over {
  background: rgba(64, 158, 255, 0.2);
  border-color: #409eff;
}

.match-team.bracket-slot {
  cursor: default;
}

.match-team.bracket-slot.filled {
  cursor: grab;
}

.match-team.bracket-slot.slot-dragover {
  background: rgba(64, 158, 255, 0.25);
  border-color: #409eff;
  border-style: dashed;
  box-shadow: 0 0 12px rgba(64, 158, 255, 0.3);
}

.match-team-logo {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.match-team-placeholder {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.match-team-name {
  font-size: 13px;
  color: #e2e8f0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 连接线 */
.match-connector {
  width: 20px;
  height: 2px;
  background: rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
}

.match-connector.right-connector {
  background: rgba(255, 255, 255, 0.3);
}

/* 中间决赛区 */
.bracket-center {
  flex: 0 0 300px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 24px;
  padding: 0 16px;
  min-width: 300px;
}

.center-final,
.center-third {
  width: 100%;
  text-align: center;
}

.center-title {
  font-size: 18px;
  font-weight: 700;
  color: #fbbf24;
  margin-bottom: 16px;
  letter-spacing: 2px;
}

.center-title.third-title {
  font-size: 15px;
  color: #94a3b8;
  margin-bottom: 12px;
}

.final-match-card,
.third-match-card {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 20px 24px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.final-team-side {
  flex: 1;
  display: flex;
  justify-content: center;
}

.final-team-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.final-team-info span {
  font-size: 13px;
  color: #e2e8f0;
  font-weight: 500;
}

.final-team-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.final-team-empty span {
  font-size: 12px;
  color: #64748b;
}

.final-circle {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  border: 2px dashed rgba(255, 255, 255, 0.2);
}

.final-circle.small {
  width: 40px;
  height: 40px;
}

.final-team-logo {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.final-team-logo.small {
  width: 42px;
  height: 42px;
}

.final-vs {
  font-size: 18px;
  font-weight: 700;
  color: #fbbf24;
  flex-shrink: 0;
}

.final-vs.small {
  font-size: 14px;
  color: #94a3b8;
}

/* 确认对阵状态 */
.bracket-confirm-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin: -12px -12px 12px -12px;
  border-radius: 16px 16px 0 0;
}

.bracket-confirm-bar .confirm-status {
  font-size: 13px;
  color: #94a3b8;
}

.bracket-confirm-bar .confirm-status.confirmed {
  color: #10b981;
  font-weight: 600;
}

.bracket-confirm-bar .confirm-status.confirmed::before {
  content: '✓ ';
}

/* 联赛积分表 */
.league-container {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 16px;
  overflow-y: auto;
}

.league-container.fullscreen {
  gap: 20px;
  grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
}

.league-table-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}

.league-table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: linear-gradient(135deg, #1B5E20 0%, #43A047 100%);
  color: #fff;
}

.league-table-title {
  font-size: 16px;
  font-weight: 700;
}

.league-table-count {
  font-size: 13px;
  background: rgba(255, 255, 255, 0.2);
  padding: 2px 10px;
  border-radius: 10px;
}

.league-table-content {
  padding: 8px;
}

.league-table-head {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 4px;
}

.rank-col {
  width: 32px;
  text-align: center;
  flex-shrink: 0;
}

.team-col {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
}

.stat-col {
  width: 36px;
  text-align: center;
  font-size: 12px;
  flex-shrink: 0;
}

.stat-col.points {
  font-weight: 700;
  color: #f59e0b;
}

.league-table-row {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  border-radius: 6px;
  transition: all 0.2s;
  cursor: grab;
}

.league-table-row:hover {
  background: #f3f4f6;
}

.team-logo-wrapper.mini {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.team-name-text {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.league-table-empty {
  text-align: center;
  padding: 30px 0;
  color: #c0c4cc;
  font-size: 13px;
  border: 2px dashed #e4e7ed;
  border-radius: 8px;
  margin: 4px;
}

/* 联赛制拖放接收区 */
.league-table-drop-zone {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  margin: 4px;
  border: 2px dashed #c0c4cc;
  border-radius: 8px;
  color: #909399;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.league-table-drop-zone:hover,
.league-table-drop-zone.drop-active {
  border-color: #409eff;
  background: rgba(64, 158, 255, 0.05);
  color: #409eff;
}

/* 滚动条美化 */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

/* 鼠标拖放克隆元素 */
.drag-clone {
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
  transform: rotate(3deg) scale(1.03);
  border-radius: 10px;
  cursor: grabbing !important;
  user-select: none;
}

.dragging-source {
  opacity: 0.4 !important;
  cursor: grabbing !important;
}

.team-pool.pool-dragover {
  border: 2px dashed #409eff;
  background: rgba(64, 158, 255, 0.05);
}

/* 响应式 */
@media (max-width: 768px) {
  .draw-body {
    flex-direction: column;
    height: auto;
  }

  .team-pool {
    flex: none;
    max-height: 300px;
  }

  .groups-area {
    grid-template-columns: 1fr;
  }

  .draw-toolbar {
    flex-direction: column;
    gap: 12px;
  }

  .toolbar-left, .toolbar-right {
    flex-wrap: wrap;
    justify-content: center;
  }
}
</style>
