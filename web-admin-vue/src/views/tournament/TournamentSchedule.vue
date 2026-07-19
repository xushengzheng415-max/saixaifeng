<template>
  <div class="tournament-schedule">
    <el-page-header @back="$router.push(`/tournaments/${tournamentId}`)" title="返回赛事详情">
      <template #content>
        <span style="font-size: 18px;">赛程管理 - {{ tournament.name || '赛事' }}</span>
        <el-tag v-if="tournamentType" style="margin-left: 8px;">{{ formatLabel }}</el-tag>
      </template>
    </el-page-header>

    <div v-if="divisionOptions.length > 1" class="division-selector">
      <span>赛事组别</span>
      <el-radio-group v-model="divisionSelectorValue" @change="handleDivisionChange">
        <el-radio-button v-for="division in divisionOptions" :key="division.id" :value="division.id">{{ division.name }}</el-radio-button>
      </el-radio-group>
      <el-tag type="success">当前：{{ activeDivision.name }}</el-tag>
      <el-button
        class="venue-view-button"
        type="primary"
        plain
        :disabled="quickEditMode"
        @click="openVenueView"
      >
        <el-icon><MapLocation /></el-icon> 全场地视图
      </el-button>
    </div>

    <div class="page-card" style="margin-top: 20px;">
      <!-- Tab 导航 -->
      <el-tabs v-model="activeTab" class="schedule-tabs">
        <!-- 抽签分组 Tab -->
        <el-tab-pane name="draw">
          <template #label>
            <span class="tab-label"><el-icon><Grid /></el-icon>抽签分组</span>
          </template>
          <TournamentDraw :key="activeDivisionId" :embedded="true" :tournament-id="tournamentId" :division-id="activeDivisionId" :readonly="true" />
        </el-tab-pane>

        <!-- 赛程列表 Tab -->
        <el-tab-pane name="schedule">
          <template #label>
            <span class="tab-label"><el-icon><Calendar /></el-icon>赛程列表</span>
          </template>

          <!-- 工具栏 -->
          <div class="toolbar">
            <div class="toolbar-left">
              <el-button type="primary" @click="openScheduleConfigDialog" :loading="generating">
                <el-icon><MagicStick /></el-icon> 自动生成赛程
              </el-button>
              <el-button type="success" @click="openManualAddDialog">
                <el-icon><Plus /></el-icon> 手动添加比赛
              </el-button>
              <el-button @click="loadMatches">刷新</el-button>
              <el-button plain :loading="exportingTable" @click="exportScheduleTable">
                <el-icon><Download /></el-icon> 导出表格
              </el-button>
              <el-button plain :loading="exportingImage" @click="exportScheduleImage">
                <el-icon><Picture /></el-icon> 导出图片
              </el-button>
              <el-button :type="quickEditMode ? 'warning' : 'primary'" plain @click="toggleQuickEditMode">
                {{ quickEditMode ? '退出快捷调整' : '快捷调整赛程' }}
              </el-button>
              <el-button
                type="danger"
                plain
                :disabled="matches.length === 0"
                :loading="deletingSchedule"
                @click="handleClearSchedule"
              >
                <el-icon><Delete /></el-icon> 删除赛程
              </el-button>
            </div>
            <div class="toolbar-right">
              <el-radio-group v-model="viewMode" size="small">
                <el-radio-button value="round">
                  <el-icon><List /></el-icon> 按轮次
                </el-radio-button>
                <el-radio-button value="calendar" :disabled="quickEditMode">
                  <el-icon><Calendar /></el-icon> 日历
                </el-radio-button>
              </el-radio-group>
            </div>
          </div>

          <el-alert v-if="quickEditMode" class="quick-edit-alert" type="warning" :closable="false" show-icon>
            拖拽一场比赛到另一场可交换日期、时间和场地；点击比赛可通过下拉框修改主客队，并快捷调整日期、时间和场地。
          </el-alert>

          <!-- 按轮次视图 -->
          <div v-if="viewMode === 'round'" v-loading="loading">
            <div v-for="group in groupedByRound" :key="group.key" class="round-group">
              <div class="round-header">
                <el-tag :type="group.phaseType" size="large">{{ group.roundLabel }}</el-tag>
                <span class="round-meta">{{ group.matches.length }} 场比赛 · {{ group.dateRange }}</span>
              </div>
              <div class="round-matches">
                <div
                  v-for="m in group.matches"
                  :key="m._id"
                  class="match-card"
                  :class="[
                    'status-' + (m.status || 'scheduled'),
                    m.isBye ? 'is-bye' : '',
                    quickEditMode ? 'quick-edit-mode' : '',
                    draggingMatchId === m._id ? 'dragging' : '',
                    dragOverMatchId === m._id ? 'drag-over' : '',
                    isQuickSaving(m._id) ? 'quick-saving' : ''
                  ]"
                  :data-phase="m.phase || 'other'"
                  :data-match-id="m._id"
                  @click="handleMatchCardClick(m)"
                  @pointerdown="handleMatchPointerDown($event, m)"
                  @dragstart.prevent
                >
                  <div v-if="quickEditMode && isMatchQuickEditable(m)" class="quick-drag-hint">拖拽交换场次 · 点击快捷修改</div>
                  <!-- 顶部：场号 + 时间 -->
                  <div class="match-header">
                    <span class="match-seq" v-if="m.matchSequence != null">场 {{ m.matchSequence }}</span>
                    <span class="match-seq" v-else-if="m.sequence != null">场 {{ m.sequence }}</span>
                    <span class="match-datetime">{{ m.matchDate || '--' }} {{ m.matchTime || '--:--' }}</span>
                  </div>

                  <!-- 中部：队徽 + 队名 + 球衣色 + 比分 -->
                  <div class="match-teams">
                    <div class="match-team home">
                      <img
                        v-if="teamLogos[m.homeTeamId]"
                        :src="teamLogos[m.homeTeamId]"
                        class="team-logo"
                        @error="$event.target.style.display='none'"
                      />
                      <div v-else class="team-logo-placeholder">{{ (m.homeTeamName || '?')[0] }}</div>
                      <span class="team-name">{{ m.homeTeamName || '待定' }}</span>
                      <span
                        v-if="m.kitColors?.home?.jersey"
                        class="kit-dot"
                        :style="{ backgroundColor: m.kitColors.home.jersey }"
                        :title="'主队球衣: ' + m.kitColors.home.jersey"
                      />
                      <template v-if="m.status === 'finished'">
                        <span class="team-score">{{ m.homeScore ?? '-' }}</span>
                      </template>
                    </div>
                    <div class="match-vs">VS</div>
                    <div class="match-team away">
                      <template v-if="m.status === 'finished'">
                        <span class="team-score">{{ m.awayScore ?? '-' }}</span>
                      </template>
                      <span class="team-name">{{ m.awayTeamName || '待定' }}</span>
                      <span
                        v-if="m.kitColors?.away?.jersey"
                        class="kit-dot"
                        :style="{ backgroundColor: m.kitColors.away.jersey }"
                        :title="'客队球衣: ' + m.kitColors.away.jersey"
                      />
                      <img
                        v-if="teamLogos[m.awayTeamId]"
                        :src="teamLogos[m.awayTeamId]"
                        class="team-logo"
                        @error="$event.target.style.display='none'"
                      />
                      <div v-else class="team-logo-placeholder">{{ (m.awayTeamName || '?')[0] }}</div>
                    </div>
                  </div>

                  <!-- 底部：状态 + 场地 + 裁判组 -->
                  <div class="match-status-bar">
                    <el-tag :type="statusTagType(m.status)" size="small">{{ statusLabel(m) }}</el-tag>
                    <span class="match-venue-small">{{ m.venue || '待定场地' }}</span>
                    <span v-if="m.refereeCrew?.mainReferee?.name || m.refereeName" class="match-ref">
                      主裁：{{ m.refereeCrew?.mainReferee?.name || m.refereeName }}
                      <template v-if="m.refereeCrew?.assistant1?.name">
                        &nbsp;边裁：{{ m.refereeCrew.assistant1.name }}
                        <template v-if="m.refereeCrew?.assistant2?.name">/{{ m.refereeCrew.assistant2.name }}</template>
                      </template>
                      <template v-if="m.refereeCrew?.fourthOfficial?.name">
                        &nbsp;第四官员：{{ m.refereeCrew.fourthOfficial.name }}
                      </template>
                    </span>
                    <span v-else class="match-ref empty">未指派裁判</span>
                  </div>
                </div>
              </div>
            </div>
            <el-empty v-if="!loading && groupedByRound.length === 0" description="暂无赛程，请先生成" />
          </div>

          <!-- 日历视图 -->
          <div v-if="viewMode === 'calendar'" v-loading="loading">
            <div class="calendar-nav">
              <el-button @click="shiftCalendar(-7)"><el-icon><ArrowLeft /></el-icon></el-button>
              <span class="calendar-range">{{ calendarLabel }}</span>
              <el-button @click="shiftCalendar(7)"><el-icon><ArrowRight /></el-icon></el-button>
            </div>
            <div class="calendar-scroll">
              <div class="calendar-grid">
                <div v-for="day in calendarDays" :key="day.date" class="calendar-day">
                  <div class="calendar-day-header" :class="{ 'is-today': day.isToday }">
                    <span class="day-name">{{ day.dayName }}</span>
                    <span class="day-date">{{ day.dateLabel }}</span>
                    <span v-if="day.matches.length" class="day-count">{{ day.matches.length }}</span>
                  </div>
                  <div class="calendar-day-body">
                    <div
                      v-for="m in day.matches"
                      :key="m._id"
                      class="calendar-match"
                      :class="'status-' + (m.status || 'scheduled')"
                      @click="openMatchDetail(m)"
                    >
                      <div class="cm-head">
                        <span class="cm-round">{{ matchRoundLabel(m) }}</span>
                        <span class="cm-time">{{ m.matchTime || '--:--' }}</span>
                      </div>
                      <div class="cm-main">
                        <span class="cm-teams">{{ m.homeTeamName || '待定' }} vs {{ m.awayTeamName || '待定' }}</span>
                        <span v-if="m.homeScore != null" class="cm-score">{{ m.homeScore }}:{{ m.awayScore }}</span>
                      </div>
                      <span class="cm-venue">{{ m.venue || '场地待定' }}</span>
                    </div>
                    <div v-if="day.matches.length === 0" class="calendar-empty">无比赛</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </el-tab-pane>
      </el-tabs>

    </div>

    <!-- 导出专用排版：保持在可渲染区域外，确保导出完整赛程而非当前屏幕截图 -->
    <div ref="scheduleExportRef" class="schedule-export-sheet" aria-hidden="true">
      <div class="schedule-export-header">
        <div class="schedule-export-title">{{ tournament.name || '赛事' }} · {{ activeDivision.name }}赛程表</div>
        <div class="schedule-export-meta">共 {{ exportMatches.length }} 场比赛</div>
      </div>
      <table class="schedule-export-table">
        <thead>
          <tr>
            <th>序号</th>
            <th>比赛日期</th>
            <th>时间</th>
            <th>比赛场地</th>
            <th>轮次</th>
            <th>比赛对阵</th>
            <th>比分</th>
            <th>状态</th>
            <th>主裁判</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(match, index) in exportMatches" :key="`export-${match._id || index}`">
            <td>{{ index + 1 }}</td>
            <td>{{ match.matchDate || '待定' }}</td>
            <td>{{ match.matchTime || '待定' }}</td>
            <td>{{ match.venue || '场地待定' }}</td>
            <td>{{ matchRoundLabel(match) }}</td>
            <td class="schedule-export-teams">{{ exportMatchTeams(match) }}</td>
            <td>{{ exportMatchScore(match) }}</td>
            <td>{{ statusLabel(match) }}</td>
            <td>{{ exportMatchReferee(match) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 独立全屏弹窗：横向场地、纵向时间，汇总全部组别 -->
    <el-dialog
      v-model="venueDialogVisible"
      fullscreen
      class="venue-dialog"
      :show-close="false"
      :close-on-click-modal="false"
    >
      <div v-loading="loading" class="venue-view">
        <div class="venue-page-header">
          <div>
            <div class="venue-page-title">全部组别球队场地部署</div>
            <div class="venue-page-subtitle">横向对照场地、纵向对照时间，汇总整个赛事且不受当前组别筛选影响</div>
          </div>
          <el-button type="primary" plain @click="venueDialogVisible = false">返回组别赛程</el-button>
        </div>
        <div class="venue-overview">
          <div class="venue-coverage">
            <span><strong>{{ venueCoverageSummary.tournamentDivisionCount }}</strong> 个赛事组别</span>
            <span><strong>{{ venueCoverageSummary.scheduledDivisionCount }}</strong> 个组别已有赛程</span>
            <span><strong>{{ venueCoverageSummary.teamCount }}</strong> 支球队</span>
          </div>
          <div class="venue-stats">
            <span><strong>{{ venueSummary.matchCount }}</strong> 场当日比赛</span>
            <span><strong>{{ venueSummary.usedVenueCount }}</strong> 个场地当日使用</span>
            <span v-if="venueSummary.pendingCount" class="is-warning"><strong>{{ venueSummary.pendingCount }}</strong> 场待分配</span>
            <span v-if="venueSummary.conflictCount" class="is-danger"><strong>{{ venueSummary.conflictCount }}</strong> 处时间冲突</span>
          </div>
        </div>
        <div class="venue-filter">
          <div class="venue-filter-header">
            <span class="venue-filter-title">统计场地</span>
            <el-checkbox v-model="allVenuesSelected" :indeterminate="venueSelectionIndeterminate">全选</el-checkbox>
            <span class="venue-filter-count">已选 {{ selectedVenues.length }} / {{ venueAvailableOptions.length }}</span>
          </div>
          <el-checkbox-group v-model="selectedVenues" class="venue-filter-options">
            <el-checkbox v-for="venue in venueAvailableOptions" :key="venue" :value="venue" border>
              {{ venue }}
            </el-checkbox>
          </el-checkbox-group>
        </div>
        <div class="calendar-nav venue-calendar-nav">
          <el-button @click="shiftVenueDate(-1)"><el-icon><ArrowLeft /></el-icon></el-button>
          <el-date-picker
            v-model="venueSelectedDate"
            type="date"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            :clearable="false"
            class="venue-date-picker"
          />
          <span class="venue-selected-day">{{ venueSelectedDayLabel }}</span>
          <el-button @click="shiftVenueDate(1)"><el-icon><ArrowRight /></el-icon></el-button>
        </div>
        <div class="venue-grid-scroll">
          <div class="venue-grid" :style="venueGridStyle">
            <div class="venue-grid-corner">比赛时间</div>
            <div
              v-for="venue in selectedVenueColumns"
              :key="`venue-head-${venue}`"
              class="venue-column-header"
              :class="{ 'is-pending': venue === '场地待定' }"
            >
              <span>{{ venue }}</span>
              <small>当日 {{ venueMatchCount(venue) }} 场</small>
            </div>
            <template v-for="row in venueTimeRows" :key="row.time">
              <div class="venue-time-cell" :class="{ 'is-pending': row.isPending }">
                <span>{{ row.time }}</span>
                <small>{{ row.matchCount }} 场</small>
              </div>
              <div
                v-for="cell in row.cells"
                :key="`${row.time}-${cell.venue}`"
                class="venue-slot-cell"
                :class="{ 'has-conflict': cell.isConflict }"
              >
                <div v-if="cell.isConflict" class="venue-conflict-label">冲突 · {{ cell.matches.length }} 场</div>
                <div
                  v-for="m in cell.matches"
                  :key="m._id"
                  class="venue-match"
                  :class="'status-' + (m.status || 'scheduled')"
                  @click="openMatchDetail(m)"
                >
                  <div class="venue-match-head">
                    <span class="venue-division">{{ divisionNameForMatch(m) }}</span>
                    <span class="venue-match-round">{{ matchRoundLabel(m) }}</span>
                  </div>
                  <div class="venue-match-teams">{{ m.homeTeamName || '待定' }} vs {{ m.awayTeamName || '待定' }}</div>
                </div>
                <span v-if="cell.matches.length === 0" class="venue-cell-empty">空闲</span>
              </div>
            </template>
          </div>
        </div>
        <el-empty v-if="!loading && venueTimeRows.length === 0" :description="venueEmptyDescription" />
      </div>
    </el-dialog>

    <!-- 比赛编辑弹窗 -->
    <el-dialog v-model="editDialogVisible" title="编辑比赛" width="520px">
      <el-form :model="editForm" label-width="80px">
        <el-form-item label="日期">
          <el-date-picker v-model="editForm.matchDate" type="date" format="YYYY-MM-DD" value-format="YYYY-MM-DD" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="时间">
          <el-time-select v-model="editForm.matchTime" start="06:00" step="00:15" end="23:00" format="HH:mm" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="场地">
          <el-select v-model="editForm.venue" allow-create filterable style="width: 100%;">
            <el-option v-for="v in venueOptions" :key="v" :label="v" :value="v" />
          </el-select>
        </el-form-item>
        <el-form-item label="主队">
          <el-select v-model="editForm.homeTeamId" filterable style="width: 100%;">
            <el-option v-for="t in teamOptions" :key="t.teamId" :label="t.teamName" :value="t.teamId" />
          </el-select>
        </el-form-item>
        <el-form-item label="客队">
          <el-select v-model="editForm.awayTeamId" filterable style="width: 100%;">
            <el-option v-for="t in teamOptions" :key="t.teamId" :label="t.teamName" :value="t.teamId" />
          </el-select>
        </el-form-item>
        <el-form-item label="裁判">
          <el-select v-model="editForm.refereeId" style="width: 100%;">
            <el-option label="未指派" :value="null" />
            <el-option v-for="r in referees" :key="r._id" :label="r.name" :value="r._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="editForm.status" style="width: 100%;">
            <el-option label="未开始" value="scheduled" />
            <el-option label="进行中" value="ongoing" />
            <el-option label="已结束" value="finished" />
            <el-option label="延期" value="postponed" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="danger" @click="handleDeleteMatch" :loading="saving">删除比赛</el-button>
        <el-button type="primary" @click="saveMatchEdit" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 赛程配置弹窗 -->
    <el-dialog v-model="showConfigDialog" title="生成赛程" width="600px" :close-on-click-modal="false">
      <div class="config-content">
        <el-alert type="info" :closable="false" show-icon>
          将根据 {{ activeDivision.name }} 组的抽签结果自动生成赛程，该组已有赛程将被覆盖。
        </el-alert>
        <div class="config-section">
          <h4>开始比赛日期</h4>
          <el-date-picker v-model="scheduleConfig.startDate" type="date" format="YYYY-MM-DD" value-format="YYYY-MM-DD" placeholder="请选择开始比赛日期" style="width: 220px;" />
          <div class="config-helper">系统会根据所选场地和比赛时段连续编排，当前日期排不完时自动顺延到下一天。</div>
        </div>
        <div class="config-section">
          <h4>当前组别每天比赛场次上限</h4>
          <el-input-number v-model="scheduleConfig.dailyMatchLimit" :min="1" :max="500" controls-position="right" style="width: 160px;" />
          <div class="config-helper">只限制当前正在生成的组别；其他组别仅在同一场地、同一时间冲突时需要避让。</div>
        </div>
        <div class="config-section">
          <h4>比赛场地 <span class="config-current-division">当前组别：{{ activeDivision.name }}</span></h4>
          <el-select
            v-model="generationVenues"
            multiple
            filterable
            allow-create
            default-first-option
            collapse-tags
            :max-collapse-tags="3"
            placeholder="可选择一块或多块比赛场地"
            style="width: 100%;"
            @change="rememberGenerationVenues"
          >
            <el-option v-for="v in generationVenueOptions" :key="v" :label="v" :value="v" />
          </el-select>
          <div class="config-helper">可为当前组别同时选择多块场地，系统会分散排赛并避开其他组别已经占用的场地时段；也可直接输入新的场地名称。</div>
        </div>
        <div class="config-section">
          <h4>比赛时段</h4>
          <div class="tag-input-row">
            <el-tag v-for="(t, i) in scheduleConfig.timeSlots" :key="i" closable @close="scheduleConfig.timeSlots.splice(i, 1)">{{ t }}</el-tag>
            <el-time-select v-model="timeInput" start="06:00" step="00:15" end="23:00" format="HH:mm" placeholder="选择时段" style="width: 130px;" @change="addTimeSlot" />
          </div>
        </div>
        <div class="config-section" v-if="tournamentType === 'cup'">
          <h4>淘汰赛规则</h4>
          <el-radio-group v-model="scheduleConfig.cupMode">
            <el-radio-button value="single">单场淘汰</el-radio-button>
            <el-radio-button value="two-leg">主客场两回合</el-radio-button>
          </el-radio-group>
        </div>
      </div>
      <template #footer>
        <el-button @click="showConfigDialog = false">取消</el-button>
        <el-button type="primary" @click="handleGenerate" :loading="generating">生成赛程</el-button>
      </template>
    </el-dialog>

    <!-- 手动添加比赛弹窗 -->
    <el-dialog v-model="manualAddVisible" title="手动添加比赛" width="520px">
      <el-form :model="manualForm" label-width="80px">
        <el-form-item label="日期">
          <el-date-picker v-model="manualForm.matchDate" type="date" format="YYYY-MM-DD" value-format="YYYY-MM-DD" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="时间">
          <el-time-select v-model="manualForm.matchTime" start="06:00" step="00:15" end="23:00" format="HH:mm" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="场地">
          <el-select v-model="manualForm.venue" allow-create filterable style="width: 100%;">
            <el-option v-for="v in venueOptions" :key="v" :label="v" :value="v" />
          </el-select>
        </el-form-item>
        <el-form-item label="主队">
          <el-select v-model="manualForm.homeTeamId" style="width: 100%;">
            <el-option v-for="t in allTeams" :key="t.teamId" :label="t.teamName" :value="t.teamId" />
          </el-select>
        </el-form-item>
        <el-form-item label="客队">
          <el-select v-model="manualForm.awayTeamId" style="width: 100%;">
            <el-option v-for="t in allTeams" :key="t.teamId" :label="t.teamName" :value="t.teamId" />
          </el-select>
        </el-form-item>
        <el-form-item label="裁判">
          <el-select v-model="manualForm.refereeId" style="width: 100%;">
            <el-option label="未指派" :value="null" />
            <el-option v-for="r in referees" :key="r._id" :label="r.name" :value="r._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="阶段">
          <el-input v-model="manualForm.roundName" placeholder="如：小组赛 A组、淘汰赛 1/4决赛" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="manualAddVisible = false">取消</el-button>
        <el-button type="primary" @click="saveManualMatch" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MagicStick, Calendar, Grid, List, MapLocation, ArrowLeft, ArrowRight, Plus, Download, Picture, Delete } from '@element-plus/icons-vue'
import { queryById, queryList, callFunction, deleteRecord, addRecord } from '../../utils/cloud'
import TournamentDraw from './TournamentDraw.vue'

const route = useRoute()
const router = useRouter()
const tournamentId = route.params.id

const activeTab = ref('schedule')
const tournament = ref({})
const activeDivisionId = ref('default')
const tournamentType = ref('')
const formatLabel = ref('')
const matches = ref([])
const allTournamentMatches = ref([])
const selectedVenues = ref([])
const venueDialogVisible = ref(false)
const venueSelectedDate = ref('')
const allTeams = ref([])
const referees = ref([])
const teamLogos = ref({})
const loading = ref(false)
const generating = ref(false)
const saving = ref(false)
const deletingSchedule = ref(false)
const exportingTable = ref(false)
const exportingImage = ref(false)
const scheduleExportRef = ref(null)
const viewMode = ref('calendar')
const showConfigDialog = ref(false)
const editDialogVisible = ref(false)
const generationVenues = ref([])
const divisionVenueSelections = ref({})
const timeInput = ref('')
const calendarBaseDate = ref(new Date())
const calendarInitialized = ref(false)
const quickEditMode = ref(false)
const draggingMatchId = ref('')
const dragOverMatchId = ref('')
const quickSavingIds = ref([])
let pointerDragState = null
let suppressNextCardClick = false
let venueSelectionInitialized = false

const scheduleConfig = ref({
  startDate: '',
  dailyMatchLimit: 8,
  venues: ['1号场地'],
  timeSlots: ['09:00', '14:00', '16:30'],
  cupMode: 'single'
})

const manualAddVisible = ref(false)
const manualForm = ref({
  matchDate: '',
  matchTime: '',
  venue: '',
  homeTeamId: null,
  awayTeamId: null,
  refereeId: null,
  roundName: ''
})

const editForm = ref({
  _id: '',
  matchDate: '',
  matchTime: '',
  venue: '',
  homeTeamId: null,
  awayTeamId: null,
  refereId: null,
  status: 'scheduled'
})

const phaseLabels = { group: '小组赛', league: '联赛', cup: '淘汰赛', knockout: '淘汰赛', final: '决赛' }

const divisionOptions = computed(() => {
  const divisions = Array.isArray(tournament.value.divisions) ? tournament.value.divisions : []
  if (divisions.length > 0) return divisions
  return [{ id: 'default', name: '默认组', tournamentType: tournament.value.tournamentType || tournament.value.type || tournament.value.format || 'tournament' }]
})
const activeDivision = computed(() => divisionOptions.value.find(item => item.id === activeDivisionId.value) || divisionOptions.value[0])
const divisionSelectorValue = computed({
  get() {
    return activeDivisionId.value
  },
  set(value) {
    activeDivisionId.value = value
  }
})
function belongsToActiveDivision(record) {
  return (record.divisionId || 'default') === activeDivisionId.value
}

async function handleDivisionChange() {
  await router.replace({
    path: route.path,
    query: { ...route.query, divisionId: activeDivisionId.value }
  })
  tournamentType.value = activeDivision.value.tournamentType || tournament.value.tournamentType || tournament.value.type || tournament.value.format || 'tournament'
  formatLabel.value = { tournament: '赛会制', cup: '杯赛制', league: '联赛制' }[tournamentType.value] || ''
  calendarInitialized.value = false
  await loadMatches({ focusCalendar: true })
  await loadTeamLogos()
  await loadAllTeams()
}

async function openVenueView() {
  await loadMatches()
  if (!venueSelectedDate.value) {
    venueSelectedDate.value = allTournamentMatches.value.find(match => match.matchDate)?.matchDate || formatDateStr(new Date())
  }
  venueDialogVisible.value = true
}

const generationVenueOptions = computed(() => {
  const set = new Set(scheduleConfig.value.venues || [])
  for (let index = 1; index <= 10; index += 1) set.add(`${index}号场地`)
  allTournamentMatches.value.forEach(m => { if (m.venue) set.add(String(m.venue).trim()) })
  Object.values(divisionVenueSelections.value).forEach(venues => {
    normalizeGenerationVenues(venues).forEach(venue => set.add(venue))
  })
  normalizeGenerationVenues(generationVenues.value).forEach(venue => set.add(venue))
  return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
})

// 场地选项（编辑、手动添加弹窗用）
const venueOptions = computed(() => generationVenueOptions.value)

function normalizeGenerationVenues(venues) {
  const values = Array.isArray(venues) ? venues : [venues]
  return [...new Set(values.map(venue => String(venue || '').trim()).filter(Boolean))]
}

function rememberGenerationVenues(venues = generationVenues.value) {
  const values = normalizeGenerationVenues(venues)
  generationVenues.value = values
  divisionVenueSelections.value = {
    ...divisionVenueSelections.value,
    [activeDivisionId.value]: values
  }
}

function syncGenerationVenues() {
  const savedVenues = normalizeGenerationVenues(divisionVenueSelections.value[activeDivisionId.value])
  if (savedVenues.length > 0) {
    generationVenues.value = savedVenues
    return
  }
  const matchVenues = normalizeGenerationVenues(matches.value.map(match => match.venue))
  const configuredVenues = normalizeGenerationVenues(scheduleConfig.value.venues)
  generationVenues.value = matchVenues.length > 0
    ? matchVenues
    : (configuredVenues.length > 0 ? configuredVenues : generationVenueOptions.value.slice(0, 1))
  rememberGenerationVenues()
}

function openScheduleConfigDialog() {
  syncGenerationVenues()
  showConfigDialog.value = true
}

const teamOptions = computed(() => {
  const map = new Map()
  allTeams.value.forEach(team => {
    if (team?.teamId) map.set(team.teamId, { teamId: team.teamId, teamName: team.teamName || team.name || '未命名球队' })
  })
  matches.value.forEach(match => {
    if (match.homeTeamId && !map.has(match.homeTeamId)) {
      map.set(match.homeTeamId, { teamId: match.homeTeamId, teamName: match.homeTeamName || '未命名球队' })
    }
    if (match.awayTeamId && !map.has(match.awayTeamId)) {
      map.set(match.awayTeamId, { teamId: match.awayTeamId, teamName: match.awayTeamName || '未命名球队' })
    }
  })
  return [...map.values()].sort((a, b) => a.teamName.localeCompare(b.teamName, 'zh-CN'))
})

function matchRoundNumber(match) {
  if (match?.scheduleRound != null) {
    const value = Number(match.scheduleRound)
    if (Number.isFinite(value)) return value
  }
  if (match?.round != null) {
    const value = Number(match.round)
    if (Number.isFinite(value)) return value
  }
  const label = String(match?.roundName || '')
  const matched = label.match(/第\s*(\d+)\s*轮/)
  return matched ? Number(matched[1]) : Number.MAX_SAFE_INTEGER
}

function phaseOrder(match) {
  const phase = match?.phase || ''
  if (phase === 'group' || phase === 'league') return 0
  if (phase === 'knockout' || phase === 'cup') return 1
  return 2
}

function compareMatchesByDateTime(a, b) {
  const aKey = `${a.matchDate || '9999-12-31'} ${a.matchTime || '99:99'}`
  const bKey = `${b.matchDate || '9999-12-31'} ${b.matchTime || '99:99'}`
  const timeResult = aKey.localeCompare(bKey)
  if (timeResult !== 0) return timeResult
  return Number(a.matchIndex || 0) - Number(b.matchIndex || 0)
}

const exportMatches = computed(() => [...matches.value].sort(compareMatchesByDateTime))

function compareMatchesByRoundAndTime(a, b) {
  const phaseResult = phaseOrder(a) - phaseOrder(b)
  if (phaseResult !== 0) return phaseResult
  const roundResult = matchRoundNumber(a) - matchRoundNumber(b)
  if (roundResult !== 0) return roundResult
  return compareMatchesByDateTime(a, b)
}

function roundGroupKey(match) {
  const phase = match.phase || 'other'
  const round = match.round != null ? `round-${match.round}` : `name-${match.roundName || 'other'}`
  const group = phase === 'group' ? (match.group || 'default') : ''
  return `${phase}:${round}:${group}`
}

// 按轮次分组
const groupedByRound = computed(() => {
  const map = {}
  matches.value.forEach(m => {
    const key = roundGroupKey(m)
    if (!map[key]) {
      map[key] = {
        key,
        round: m.round != null ? m.round : m.roundName || 'other',
        group: m.group || '',
        roundLabel: '',
        phaseType: '',
        matches: [],
        dateRange: '',
        dates: new Set()
      }
    }
    map[key].matches.push(m)
    if (m.matchDate) map[key].dates.add(m.matchDate)
  })
  return Object.values(map).map(g => {
    g.matches.sort(compareMatchesByDateTime)
    g.roundLabel = buildRoundLabel(g)
    g.phaseType = getPhaseType(g.matches)
    const dates = [...g.dates].sort()
    g.dateRange = dates.length ? (dates.length === 1 ? dates[0] : `${dates[0]} ~ ${dates[dates.length - 1]}`) : ''
    delete g.dates
    return g
  }).sort((a, b) => {
    // 小组赛/联赛排在前面，淘汰赛排在后面
    const aPhase = a.matches[0]?.phase || ''
    const bPhase = b.matches[0]?.phase || ''
    const aIsGroup = aPhase === 'group' || aPhase === 'league'
    const bIsGroup = bPhase === 'group' || bPhase === 'league'
    if (aIsGroup && !bIsGroup) return -1
    if (!aIsGroup && bIsGroup) return 1
    // 同阶段按真实轮次、分组、开赛时间排列
    const roundResult = matchRoundNumber(a.matches[0]) - matchRoundNumber(b.matches[0])
    if (roundResult !== 0) return roundResult
    const groupResult = String(a.group).localeCompare(String(b.group), 'zh-CN')
    if (groupResult !== 0) return groupResult
    return compareMatchesByDateTime(a.matches[0], b.matches[0])
  })
})

// 日历视图
const calendarDays = computed(() => {
  const base = new Date(calendarBaseDate.value)
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  const days = []
  const todayStr = formatDateStr(new Date())
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const ds = formatDateStr(d)
    days.push({
      date: ds,
      dateLabel: `${d.getMonth() + 1}/${d.getDate()}`,
      dayName: ['日','一','二','三','四','五','六'][d.getDay()],
      isToday: ds === todayStr,
      matches: matches.value.filter(m => m.matchDate === ds).sort(compareMatchesByRoundAndTime)
    })
  }
  return days
})

const calendarLabel = computed(() => {
  const days = calendarDays.value
  if (!days.length) return ''
  return `${days[0].date} ~ ${days[6].date}`
})

function divisionNameForMatch(match) {
  if (match?.divisionName) return match.divisionName
  const divisionId = match?.divisionId || 'default'
  return divisionOptions.value.find(item => item.id === divisionId)?.name || '默认组'
}

function isVenueUsageMatch(match) {
  return !match?.isBye && match?.status !== 'cancelled'
}

const venueAvailableOptions = computed(() => {
  const venues = new Set((scheduleConfig.value.venues || []).map(item => String(item || '').trim()).filter(Boolean))
  for (let index = 1; index <= 10; index += 1) venues.add(`${index}号场地`)
  const hasPendingVenue = allTournamentMatches.value.some(match => isVenueUsageMatch(match) && !String(match.venue || '').trim())
  allTournamentMatches.value.forEach(match => {
    const venue = String(match.venue || '').trim()
    if (venue && isVenueUsageMatch(match)) venues.add(venue)
  })
  if (hasPendingVenue) venues.add('场地待定')

  return [...venues]
    .sort((a, b) => {
      if (a === '场地待定') return 1
      if (b === '场地待定') return -1
      return a.localeCompare(b, 'zh-CN', { numeric: true })
    })
})

const allVenuesSelected = computed({
  get() {
    return venueAvailableOptions.value.length > 0 && selectedVenues.value.length === venueAvailableOptions.value.length
  },
  set(checked) {
    selectedVenues.value = checked ? [...venueAvailableOptions.value] : []
  }
})

const venueSelectionIndeterminate = computed(() => {
  return selectedVenues.value.length > 0 && selectedVenues.value.length < venueAvailableOptions.value.length
})

const selectedVenueColumns = computed(() => {
  const selected = new Set(selectedVenues.value)
  return venueAvailableOptions.value.filter(venue => selected.has(venue))
})

const selectedVenueDayMatches = computed(() => {
  const selected = new Set(selectedVenueColumns.value)
  return allTournamentMatches.value
    .filter(match => {
      if (!isVenueUsageMatch(match) || match.matchDate !== venueSelectedDate.value) return false
      return selected.has(String(match.venue || '').trim() || '场地待定')
    })
    .sort(compareMatchesByDateTime)
})

const venueTimeOptions = computed(() => {
  const times = new Set((scheduleConfig.value.timeSlots || scheduleConfig.value.timeslots || []).filter(Boolean))
  allTournamentMatches.value.forEach(match => {
    if (match.matchTime) times.add(String(match.matchTime))
  })
  if (selectedVenueDayMatches.value.some(match => !match.matchTime)) times.add('时间待定')
  return [...times].sort((a, b) => {
    if (a === '时间待定') return 1
    if (b === '时间待定') return -1
    return a.localeCompare(b)
  })
})

const venueTimeRows = computed(() => {
  if (selectedVenueColumns.value.length === 0) return []
  return venueTimeOptions.value.map(time => {
    const timeMatches = selectedVenueDayMatches.value.filter(match => (match.matchTime || '时间待定') === time)
    return {
      time,
      isPending: time === '时间待定',
      matchCount: timeMatches.length,
      cells: selectedVenueColumns.value.map(venue => {
        const matches = timeMatches.filter(match => (String(match.venue || '').trim() || '场地待定') === venue)
        return {
          venue,
          matches,
          isConflict: venue !== '场地待定' && time !== '时间待定' && matches.length > 1
        }
      })
    }
  })
})

const venueGridStyle = computed(() => ({
  gridTemplateColumns: `120px repeat(${selectedVenueColumns.value.length}, minmax(220px, 1fr))`,
  minWidth: `${Math.max(1100, 120 + selectedVenueColumns.value.length * 220)}px`
}))

const venueSelectedDayLabel = computed(() => {
  const date = parseLocalDate(venueSelectedDate.value)
  if (!date) return ''
  return `星期${['日', '一', '二', '三', '四', '五', '六'][date.getDay()]}`
})

const venueSummary = computed(() => {
  const usedVenues = new Set()
  let pendingCount = 0
  const slotCounts = new Map()
  selectedVenueDayMatches.value.forEach(match => {
    const venue = String(match.venue || '').trim()
    if (venue) usedVenues.add(venue)
    else pendingCount += 1
    if (venue && match.matchTime) {
      const key = `${match.matchTime}|${venue}`
      slotCounts.set(key, (slotCounts.get(key) || 0) + 1)
    }
  })
  return {
    matchCount: selectedVenueDayMatches.value.length,
    usedVenueCount: usedVenues.size,
    pendingCount,
    conflictCount: [...slotCounts.values()].filter(count => count > 1).length
  }
})

const venueCoverageSummary = computed(() => {
  const divisionIds = new Set()
  const teamIds = new Set()
  allTournamentMatches.value.filter(isVenueUsageMatch).forEach(match => {
    divisionIds.add(match.divisionId || 'default')
    if (match.homeTeamId || match.homeTeamName) teamIds.add(match.homeTeamId || `name:${match.homeTeamName}`)
    if (match.awayTeamId || match.awayTeamName) teamIds.add(match.awayTeamId || `name:${match.awayTeamName}`)
  })
  return {
    tournamentDivisionCount: divisionOptions.value.length,
    scheduledDivisionCount: divisionIds.size,
    teamCount: teamIds.size
  }
})

function venueMatchCount(venue) {
  return selectedVenueDayMatches.value.filter(match => (String(match.venue || '').trim() || '场地待定') === venue).length
}

const venueEmptyDescription = computed(() => {
  return selectedVenues.value.length === 0 ? '请至少勾选一个统计场地' : '所选场地当日暂无可展示的赛程'
})

function syncVenueSelection() {
  const available = venueAvailableOptions.value
  if (!venueSelectionInitialized) {
    selectedVenues.value = [...available]
    venueSelectionInitialized = true
    return
  }
  const availableSet = new Set(available)
  selectedVenues.value = selectedVenues.value.filter(venue => availableSet.has(venue))
}

function shiftCalendar(days) {
  const next = new Date(calendarBaseDate.value)
  next.setDate(next.getDate() + days)
  calendarBaseDate.value = next
}

function shiftVenueDate(days) {
  const current = parseLocalDate(venueSelectedDate.value) || new Date()
  current.setDate(current.getDate() + days)
  venueSelectedDate.value = formatDateStr(current)
}

function formatDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseLocalDate(dateText) {
  const parts = String(dateText || '').split('-').map(Number)
  if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function focusCalendarOnFirstMatch(list) {
  const first = list.find(match => match.matchDate)
  const date = first ? parseLocalDate(first.matchDate) : null
  if (date) {
    calendarBaseDate.value = date
    calendarInitialized.value = true
  }
}

function matchRoundLabel(match) {
  const round = matchRoundNumber(match)
  if (round !== Number.MAX_SAFE_INTEGER) return `第${round}轮`
  return match.roundName || '未分轮次'
}

function buildRoundLabel(group) {
  const first = group.matches[0]
  if (!first) return `第${group.round}轮`
  const phase = first.phase || ''
  if (phase === 'group') {
    const groupName = (first.group || '').replace(/组$/, '')
    return groupName ? `小组赛 ${groupName}组 第${group.round}轮` : `小组赛 第${group.round}轮`
  }
  if (phase === 'league') return `联赛 第${group.round}轮`
  if (phase === 'knockout' || phase === 'cup') return first.roundName || `淘汰赛 第${group.round}轮`
  return first.roundName || `第${group.round}轮`
}

function getPhaseType(ms) {
  const phase = ms[0]?.phase
  if (phase === 'group') return 'success'
  if (phase === 'league') return ''
  return 'warning'
}

function statusLabel(m) {
  if (m.isBye) return '轮空'
  const s = m.status || 'scheduled'
  return { scheduled: '未开始', ongoing: '进行中', finished: '已结束', postponed: '延期', cancelled: '已取消' }[s] || s
}

function statusTagType(s) {
  const map = { scheduled: 'info', ongoing: '', finished: 'success', postponed: 'warning', cancelled: 'danger' }
  return map[s || 'scheduled'] || 'info'
}

function exportMatchTeams(match) {
  const home = match.homeTeamName || '待定'
  if (match.isBye) return `${home}（轮空）`
  return `${home} vs ${match.awayTeamName || '待定'}`
}

function exportMatchScore(match) {
  if (match.isBye) return '—'
  if (match.homeScore == null || match.awayScore == null) return '—'
  return `${match.homeScore}:${match.awayScore}`
}

function exportMatchReferee(match) {
  return match.refereeCrew?.mainReferee?.name || match.refereeName || '未指派'
}

function scheduleExportFilename(extension) {
  const tournamentName = tournament.value.name || '赛事'
  const divisionName = activeDivision.value.name || '当前组别'
  const safeName = `${tournamentName}-${divisionName}-赛程表`.replace(/[\\/:*?"<>|]/g, '_')
  return `${safeName}.${extension}`
}

function scheduleExportRows() {
  return exportMatches.value.map((match, index) => ({
    序号: index + 1,
    比赛日期: match.matchDate || '待定',
    时间: match.matchTime || '待定',
    比赛场地: match.venue || '场地待定',
    赛事组别: activeDivision.value.name || '',
    轮次: matchRoundLabel(match),
    比赛对阵: exportMatchTeams(match),
    比分: exportMatchScore(match),
    状态: statusLabel(match),
    主裁判: exportMatchReferee(match)
  }))
}

async function exportScheduleTable() {
  if (exportMatches.value.length === 0) {
    ElMessage.warning('当前组别暂无可导出的赛程')
    return
  }
  exportingTable.value = true
  try {
    const xlsxModule = await import('xlsx')
    const XLSX = xlsxModule.default || xlsxModule
    const worksheet = XLSX.utils.json_to_sheet(scheduleExportRows())
    worksheet['!cols'] = [
      { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 12 },
      { wch: 18 }, { wch: 38 }, { wch: 10 }, { wch: 12 }, { wch: 16 }
    ]
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '赛程')
    XLSX.writeFile(workbook, scheduleExportFilename('xlsx'))
    ElMessage.success('赛程表格已导出')
  } catch (error) {
    console.error('导出赛程表格失败:', error)
    ElMessage.error('赛程表格导出失败，请稍后重试')
  } finally {
    exportingTable.value = false
  }
}

async function exportScheduleImage() {
  if (exportMatches.value.length === 0) {
    ElMessage.warning('当前组别暂无可导出的赛程')
    return
  }
  exportingImage.value = true
  try {
    await nextTick()
    const element = scheduleExportRef.value
    if (!element) throw new Error('未找到赛程导出区域')
    const html2canvasModule = await import('html2canvas')
    const html2canvas = html2canvasModule.default || html2canvasModule
    const width = element.scrollWidth
    const height = element.scrollHeight
    const scale = Math.min(2, 30000 / Math.max(width, height))
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale,
      useCORS: true,
      logging: false,
      width,
      height,
      windowWidth: width,
      windowHeight: height
    })
    const link = document.createElement('a')
    link.download = scheduleExportFilename('png')
    link.href = canvas.toDataURL('image/png')
    document.body.appendChild(link)
    link.click()
    link.remove()
    ElMessage.success('赛程图片已导出')
  } catch (error) {
    console.error('导出赛程图片失败:', error)
    ElMessage.error('赛程图片导出失败，请稍后重试')
  } finally {
    exportingImage.value = false
  }
}

// 打开比赛编辑
async function openMatchDetail(match) {
  // 跳转到比赛详情页
  router.push({
    path: `/tournaments/${tournamentId}/match/${match._id}`,
    query: { divisionId: match.divisionId || activeDivisionId.value }
  })
}

function toggleQuickEditMode() {
  quickEditMode.value = !quickEditMode.value
  if (quickEditMode.value) {
    viewMode.value = 'round'
    ElMessage.info('已开启快捷调整：拖拽交换场次，点击比赛修改队伍、时间和场地')
  } else {
    resetMatchDrag()
  }
}

function isMatchQuickEditable(match) {
  return !match?.isBye && !['ongoing', 'finished'].includes(match?.status)
}

function handleMatchCardClick(match) {
  if (suppressNextCardClick) {
    suppressNextCardClick = false
    return
  }
  if (!quickEditMode.value) {
    openMatchDetail(match)
    return
  }
  if (!isMatchQuickEditable(match)) {
    ElMessage.warning('进行中或已结束的比赛不能使用快捷调整')
    return
  }
  openMatchEdit(match)
}

function isQuickSaving(matchId) {
  return quickSavingIds.value.includes(matchId)
}

function resetMatchDrag() {
  document.removeEventListener('pointermove', handleMatchPointerMove)
  document.removeEventListener('pointerup', handleMatchPointerUp)
  document.removeEventListener('pointercancel', handleMatchPointerCancel)
  document.body.classList.remove('schedule-dragging')
  pointerDragState = null
  draggingMatchId.value = ''
  dragOverMatchId.value = ''
}

function handleMatchPointerDown(event, match) {
  if (event.button !== 0 || !quickEditMode.value || !isMatchQuickEditable(match) || quickSavingIds.value.length > 0) return
  if (event.target.closest('button, input, textarea, select, .el-select, .el-date-editor')) return

  pointerDragState = {
    pointerId: event.pointerId,
    matchId: match._id,
    startX: event.clientX,
    startY: event.clientY,
    active: false
  }
  document.addEventListener('pointermove', handleMatchPointerMove, { passive: false })
  document.addEventListener('pointerup', handleMatchPointerUp)
  document.addEventListener('pointercancel', handleMatchPointerCancel)
}

function handleMatchPointerMove(event) {
  if (!pointerDragState || event.pointerId !== pointerDragState.pointerId) return
  const distance = Math.hypot(event.clientX - pointerDragState.startX, event.clientY - pointerDragState.startY)
  if (!pointerDragState.active && distance < 6) return

  if (!pointerDragState.active) {
    pointerDragState.active = true
    draggingMatchId.value = pointerDragState.matchId
    document.body.classList.add('schedule-dragging')
  }

  event.preventDefault()
  const targetElement = document.elementFromPoint(event.clientX, event.clientY)?.closest('.match-card[data-match-id]')
  const targetId = targetElement?.dataset.matchId || ''
  const targetMatch = matches.value.find(match => match._id === targetId)
  dragOverMatchId.value = targetMatch && targetId !== pointerDragState.matchId && isMatchQuickEditable(targetMatch) ? targetId : ''
}

async function handleMatchPointerUp(event) {
  if (!pointerDragState || event.pointerId !== pointerDragState.pointerId) return
  const sourceId = pointerDragState.matchId
  const targetId = dragOverMatchId.value
  const wasDragging = pointerDragState.active
  resetMatchDrag()

  if (!wasDragging) return
  suppressNextCardClick = true
  window.setTimeout(() => { suppressNextCardClick = false }, 0)
  const targetMatch = matches.value.find(match => match._id === targetId)
  if (targetMatch) await handleMatchDrop(sourceId, targetMatch)
}

function handleMatchPointerCancel() {
  resetMatchDrag()
}

function scheduleSlot(match) {
  return {
    matchDate: match.matchDate || '',
    matchTime: match.matchTime || '',
    venue: match.venue || ''
  }
}

async function persistMatchSchedule(matchId, slot) {
  const result = await callFunction('updateMatch', { matchId, data: slot })
  if (!result?.success) throw new Error(result?.message || result?.error || '保存赛程失败')
}

async function handleMatchDrop(sourceId, targetMatch) {
  const sourceMatch = matches.value.find(match => match._id === sourceId)
  if (!sourceMatch || sourceMatch._id === targetMatch._id) return
  if (!isMatchQuickEditable(sourceMatch) || !isMatchQuickEditable(targetMatch)) {
    ElMessage.warning('只能调整未开始或已延期的比赛')
    return
  }

  const sourceSlot = scheduleSlot(sourceMatch)
  const targetSlot = scheduleSlot(targetMatch)
  if (JSON.stringify(sourceSlot) === JSON.stringify(targetSlot)) {
    ElMessage.info('两场比赛的日期、时间和场地相同，无需交换')
    return
  }

  const sourceName = `${sourceMatch.homeTeamName || '待定'} vs ${sourceMatch.awayTeamName || '待定'}`
  const targetName = `${targetMatch.homeTeamName || '待定'} vs ${targetMatch.awayTeamName || '待定'}`
  const sourcePosition = `${sourceSlot.matchDate || '日期待定'} ${sourceSlot.matchTime || '时间待定'} · ${sourceSlot.venue || '场地待定'}`
  const targetPosition = `${targetSlot.matchDate || '日期待定'} ${targetSlot.matchTime || '时间待定'} · ${targetSlot.venue || '场地待定'}`
  try {
    await ElMessageBox.confirm(
      `确定交换“${sourceName}”（${sourcePosition}）与“${targetName}”（${targetPosition}）的日期、时间和场地吗？`,
      '确认交换场次',
      { type: 'warning', confirmButtonText: '确认交换', cancelButtonText: '取消' }
    )
  } catch {
    return
  }

  quickSavingIds.value = [sourceMatch._id, targetMatch._id]
  let sourceUpdated = false
  try {
    await persistMatchSchedule(sourceMatch._id, targetSlot)
    sourceUpdated = true
    await persistMatchSchedule(targetMatch._id, sourceSlot)
    Object.assign(sourceMatch, targetSlot)
    Object.assign(targetMatch, sourceSlot)
    matches.value = [...matches.value].sort(compareMatchesByRoundAndTime)
    ElMessage.success('场次日期、时间和场地已交换')
  } catch (err) {
    if (sourceUpdated) {
      try {
        await persistMatchSchedule(sourceMatch._id, sourceSlot)
      } catch (rollbackErr) {
        console.error('赛程交换回滚失败:', rollbackErr)
      }
    }
    await loadMatches()
    ElMessage.error('拖拽调整失败: ' + err.message)
  } finally {
    quickSavingIds.value = []
  }
}

// 编辑比赛（弹窗）
function openMatchEdit(match) {
  editForm.value = {
    _id: match._id,
    matchDate: match.matchDate || '',
    matchTime: match.matchTime || '',
    venue: match.venue || '',
    homeTeamId: match.homeTeamId || null,
    awayTeamId: match.awayTeamId || null,
    refereId: match.refereeId || null,
    status: match.status || 'scheduled'
  }
  referees.value = []
  loadReferees()
  editDialogVisible.value = true
}

async function loadReferees() {
  try {
    referees.value = await queryList('users', {
      where: { role: 'referee', tournamentId }
    })
  } catch {
    try {
      referees.value = await queryList('referees', { where: { tournamentId } })
    } catch (e2) { console.warn('加载裁判失败', e2) }
  }
}

async function saveMatchEdit() {
  const f = editForm.value
  if (!f.homeTeamId || !f.awayTeamId) {
    ElMessage.warning('请选择主队和客队')
    return
  }
  if (f.homeTeamId === f.awayTeamId) {
    ElMessage.warning('主队和客队不能相同')
    return
  }

  saving.value = true
  try {
    const homeTeam = teamOptions.value.find(t => t.teamId === f.homeTeamId)
    const awayTeam = teamOptions.value.find(t => t.teamId === f.awayTeamId)
    const ref = referees.value.find(r => r._id === f.refereeId)
    const result = await callFunction('updateMatch', {
      matchId: f._id,
      data: {
        matchDate: f.matchDate,
        matchTime: f.matchTime,
        venue: f.venue,
        homeTeamId: f.homeTeamId,
        homeTeamName: homeTeam?.teamName || '',
        awayTeamId: f.awayTeamId,
        awayTeamName: awayTeam?.teamName || '',
        refereId: f.refereeId,
        refereName: ref?.name || '',
        status: f.status,
        updateTime: new Date()
      }
    })
    if (!result?.success) throw new Error(result?.message || result?.error || '更新比赛失败')
    ElMessage.success('保存成功')
    editDialogVisible.value = false
    await loadMatches()
  } catch (err) {
    ElMessage.error('保存失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

async function handleDeleteMatch() {
  try {
    await ElMessageBox.confirm('确定删除这场比赛？此操作不可恢复。', '删除比赛', { type: 'warning' })
    await deleteRecord('matches', editForm.value._id)
    ElMessage.success('已删除')
    editDialogVisible.value = false
    loadMatches()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

async function handleClearSchedule() {
  const currentMatches = [...matches.value]
  if (currentMatches.length === 0) {
    ElMessage.info('当前组别暂无赛程')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定删除“${activeDivision.value.name}”组的全部 ${currentMatches.length} 场赛程吗？此操作不可恢复，其他组别赛程不受影响。`,
      '删除赛程',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消'
      }
    )
  } catch {
    return
  }

  deletingSchedule.value = true
  let deletedCount = 0
  try {
    for (const match of currentMatches) {
      await deleteRecord('matches', match._id)
      deletedCount++
    }

    ElMessage.success(`已删除“${activeDivision.value.name}”组 ${deletedCount} 场赛程`)
  } catch (err) {
    ElMessage.error(`删除未全部完成：已删除 ${deletedCount} 场，${err.message || '请刷新后重试'}`)
  } finally {
    deletingSchedule.value = false
    await loadMatches()
  }
}

// 手动添加比赛
function openManualAddDialog() {
  manualForm.value = {
    matchDate: formatDateStr(new Date()),
    matchTime: '09:00',
    venue: generationVenues.value[0] || scheduleConfig.value.venues[0] || '1号场地',
    homeTeamId: null,
    awayTeamId: null,
    refereeId: null,
    roundName: ''
  }
  loadReferees()
  manualAddVisible.value = true
}

async function saveManualMatch() {
  const f = manualForm.value
  if (!f.homeTeamId || !f.awayTeamId) {
    ElMessage.warning('请选择主队和客队')
    return
  }
  if (f.homeTeamId === f.awayTeamId) {
    ElMessage.warning('主队和客队不能相同')
    return
  }

  saving.value = true
  try {
    const homeTeam = allTeams.value.find(t => t.teamId === f.homeTeamId)
    const awayTeam = allTeams.value.find(t => t.teamId === f.awayTeamId)
    const ref = referees.value.find(r => r._id === f.refereeId)

    await addRecord('matches', {
      tournamentId,
      divisionId: activeDivisionId.value,
      divisionName: activeDivision.value.name,
      scheduleType: tournamentType.value,
      phase: 'group',
      roundName: f.roundName || '手动添加',
      matchDate: f.matchDate,
      matchTime: f.matchTime,
      venue: f.venue,
      homeTeamId: f.homeTeamId,
      homeTeamName: homeTeam?.teamName || '',
      awayTeamId: f.awayTeamId,
      awayTeamName: awayTeam?.teamName || '',
      refereeId: f.refereeId,
      refereeName: ref?.name || '',
      homeScore: 0,
      awayScore: 0,
      status: 'scheduled',
      statusText: '未开始',
      isBye: false,
      createTime: new Date(),
      updateTime: new Date()
    })

    ElMessage.success('比赛添加成功')
    manualAddVisible.value = false
    loadMatches()
  } catch (err) {
    ElMessage.error('添加失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

// 添加时段
function addTimeSlot() {
  const t = timeInput.value
  if (t && !scheduleConfig.value.timeSlots.includes(t)) {
    scheduleConfig.value.timeSlots.push(t)
  }
  timeInput.value = ''
}

// 生成赛程
async function handleGenerate() {
  if (!scheduleConfig.value.startDate) {
    ElMessage.warning('请选择开始比赛日期')
    return
  }
  if (generationVenues.value.length === 0) {
    ElMessage.warning(`请先为 ${activeDivision.value.name} 组选择比赛场地`)
    return
  }
  if (scheduleConfig.value.timeSlots.length === 0) {
    ElMessage.warning('请至少选择一个比赛时段')
    return
  }
  rememberGenerationVenues()
  showConfigDialog.value = false
  try {
    await ElMessageBox.confirm('生成成功后将覆盖当前组别已有赛程；若场地时段不足，原赛程会保留。确定继续吗？', '生成赛程', { type: 'warning' })
  } catch {
    showConfigDialog.value = true
    return
  }

  generating.value = true
  try {
    const result = await callFunction('generateSchedule', {
      tournamentId,
      divisionId: activeDivisionId.value,
      divisionName: activeDivision.value.name,
      scheduleType: tournamentType.value,
      scheduleConfig: {
        startDate: scheduleConfig.value.startDate,
        dailyMatchLimit: scheduleConfig.value.dailyMatchLimit,
        venues: [...generationVenues.value],
        timeSlots: scheduleConfig.value.timeSlots,
        cupMode: scheduleConfig.value.cupMode
      }
    })

    if (result && result.success) {
      ElMessage.success(`赛程生成成功！共 ${result.matchCount || 0} 场比赛`)
      await loadMatches({ focusCalendar: true })
    } else {
      ElMessage.error('生成失败: ' + (result?.message || result?.error || '未知错误'))
    }
  } catch (err) {
    ElMessage.error('调用云函数失败: ' + err.message)
  } finally {
    generating.value = false
  }
}

async function loadTournament() {
  try {
    const t = await queryById('tournaments', tournamentId)
    tournament.value = t
    const routeDivisionId = typeof route.query.divisionId === 'string' ? route.query.divisionId : ''
    const preferred = routeDivisionId || t.defaultDivisionId || t.divisions?.[0]?.id || 'default'
    activeDivisionId.value = divisionOptions.value.some(item => item.id === preferred) ? preferred : divisionOptions.value[0].id
    tournamentType.value = activeDivision.value.tournamentType || t.tournamentType || t.type || t.format || 'tournament'
    formatLabel.value = { tournament: '赛会制', cup: '杯赛制', league: '联赛制' }[tournamentType.value] || ''
    // 回填配置
    if (t.scheduleConfig) {
      scheduleConfig.value = { ...scheduleConfig.value, ...t.scheduleConfig }
    }
    if (t.startDate) scheduleConfig.value.startDate = t.startDate
  } catch (err) {
    console.error('加载赛事失败:', err)
  }
}

async function loadMatches(options = {}) {
  loading.value = true
  try {
    const list = await queryList('matches', {
      where: { tournamentId },
      orderBy: { matchDate: 'asc', matchTime: 'asc' }
    })
    allTournamentMatches.value = [...list].sort(compareMatchesByDateTime)
    matches.value = allTournamentMatches.value.filter(belongsToActiveDivision).sort(compareMatchesByRoundAndTime)
    syncGenerationVenues()
    syncVenueSelection()
    if (options.focusCalendar || !calendarInitialized.value) {
      focusCalendarOnFirstMatch(matches.value)
    }
  } catch (err) {
    console.error('加载赛程失败:', err)
  } finally {
    loading.value = false
  }
}

async function loadAllTeams() {
  try {
    const groups = (await queryList('tournament_groups', { where: { tournamentId } })).filter(belongsToActiveDivision)
    const teams = []
    groups.forEach(g => {
      ;(g.groups || []).forEach(gp => {
        (gp.teams || []).forEach(t => {
          if (t && t.teamId) teams.push({ teamId: t.teamId, teamName: t.teamName || t.name || '' })
        })
      })
      ;(g.ranking || []).forEach(r => {
        if (r.teamId) teams.push({ teamId: r.teamId, teamName: r.teamName || '' })
      })
    })
    // 也加载 approved teams
    const approved = (await queryList('tournament_teams', { where: { tournamentId, status: 'approved' } })).filter(belongsToActiveDivision)
    approved.forEach(t => teams.push({ teamId: t.teamId || t._id, teamName: t.teamName || t.name || '' }))
    allTeams.value = [...new Map(teams.map(t => [t.teamId, t])).values()]
  } catch (err) {
    console.warn('加载球队列表失败', err)
  }
}

async function loadTeamLogos() {
  try {
    const teamIds = new Set()
    matches.value.forEach(m => {
      if (m.homeTeamId) teamIds.add(m.homeTeamId)
      if (m.awayTeamId) teamIds.add(m.awayTeamId)
    })
    if (teamIds.size === 0) return

    const teams = await queryList('teams', {})
    const map = {}
    ;(teams || []).forEach(t => {
      const logo = t.logoUrl || t.logo || t.logoImage || ''
      if (logo && t._id) map[t._id] = logo
    })
    teamLogos.value = map
  } catch (err) {
    console.warn('加载队徽失败', err)
  }
}

onMounted(async () => {
  await loadTournament()
  await loadMatches()
  await loadTeamLogos()
  await loadAllTeams()
})

onBeforeUnmount(() => {
  resetMatchDrag()
})
</script>

<style scoped>
.tournament-schedule { padding: 20px; max-width: 1600px; margin: 0 auto; }
.division-selector { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 14px 18px; margin-top: 20px; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; }
.division-selector > span:first-child { font-weight: 600; color: #374151; }
.venue-view-button { margin-left: 4px; }
.schedule-tabs :deep(.el-tabs__header) { margin-bottom: 20px; }
.tab-label { display: flex; align-items: center; gap: 6px; }

.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.toolbar-left, .toolbar-right { display: flex; gap: 12px; align-items: center; }
.quick-edit-alert { margin: -6px 0 18px; }

.schedule-export-sheet {
  position: fixed;
  top: 0;
  left: -20000px;
  z-index: -1;
  box-sizing: border-box;
  width: 1200px;
  padding: 42px;
  color: #1f2937;
  background: #fff;
  font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
}
.schedule-export-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
.schedule-export-title { color: #111827; font-size: 28px; font-weight: 800; }
.schedule-export-meta { color: #6b7280; font-size: 14px; white-space: nowrap; }
.schedule-export-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.schedule-export-table th,
.schedule-export-table td { padding: 12px 10px; border: 1px solid #dbe2ea; font-size: 13px; line-height: 1.45; text-align: center; word-break: break-word; }
.schedule-export-table th { color: #1f2937; font-weight: 700; background: #eef4fb; }
.schedule-export-table tbody tr:nth-child(even) { background: #f8fafc; }
.schedule-export-table th:nth-child(1) { width: 48px; }
.schedule-export-table th:nth-child(2) { width: 105px; }
.schedule-export-table th:nth-child(3) { width: 70px; }
.schedule-export-table th:nth-child(4) { width: 95px; }
.schedule-export-table th:nth-child(5) { width: 95px; }
.schedule-export-table th:nth-child(6) { width: 300px; }
.schedule-export-table th:nth-child(7) { width: 70px; }
.schedule-export-table th:nth-child(8) { width: 75px; }
.schedule-export-table th:nth-child(9) { width: 105px; }
.schedule-export-table .schedule-export-teams { font-weight: 600; text-align: left; }

/* 按轮次视图 */
.round-group { margin-bottom: 24px; }
.round-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.round-meta { font-size: 13px; color: #909399; }
.round-matches { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 16px; }

/* 比赛卡片 */
.match-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px 18px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  border-left: 4px solid #409eff;
  position: relative;
  overflow: hidden;
}
.match-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: linear-gradient(135deg, rgba(64,158,255,0.03) 0%, transparent 60%);
  pointer-events: none;
}
.match-card:hover {
  box-shadow: 0 8px 25px rgba(0,0,0,0.1);
  transform: translateY(-3px);
}
.match-card.quick-edit-mode { cursor: grab; }
.match-card.quick-edit-mode:active { cursor: grabbing; }
.match-card.quick-edit-mode.dragging { opacity: 0.5; transform: scale(0.99); }
.match-card.quick-edit-mode.drag-over { border-color: #e6a23c; box-shadow: 0 0 0 3px rgba(230, 162, 60, 0.22), 0 8px 25px rgba(0,0,0,0.1); transform: translateY(-3px); }
.match-card.quick-edit-mode.quick-saving { cursor: wait; opacity: 0.65; pointer-events: none; }
.match-card.quick-edit-mode img { -webkit-user-drag: none; user-select: none; }
.quick-drag-hint { margin: -6px 0 8px; color: #e6a23c; font-size: 11px; font-weight: 600; text-align: right; }
:global(body.schedule-dragging) { cursor: grabbing !important; user-select: none; }
.match-card.status-finished { border-left-color: #67c23a; }
.match-card.status-finished::before {
  background: linear-gradient(135deg, rgba(103,194,58,0.04) 0%, transparent 60%);
}
.match-card.status-ongoing { border-left-color: #e6a23c; }
.match-card.status-ongoing::before {
  background: linear-gradient(135deg, rgba(230,162,60,0.04) 0%, transparent 60%);
}
.match-card.status-postponed { border-left-color: #f56c6c; opacity: 0.75; }
.match-card.status-cancelled { border-left-color: #f56c6c; opacity: 0.5; text-decoration: line-through; }
.match-card.is-bye { opacity: 0.35; border-left-color: #c0c4cc; }

/* 小组赛卡片风格 */
.match-card[data-phase="group"] {
  border-left-color: #43a047;
}
.match-card[data-phase="group"]::before {
  background: linear-gradient(135deg, rgba(67,160,71,0.05) 0%, transparent 60%);
}
.match-card[data-phase="group"] .match-vs {
  background: #e8f5e9;
  color: #2e7d32;
}

/* 淘汰赛卡片风格 */
.match-card[data-phase="knockout"],
.match-card[data-phase="cup"] {
  border-left-color: #ed6c02;
}
.match-card[data-phase="knockout"]::before,
.match-card[data-phase="cup"]::before {
  background: linear-gradient(135deg, rgba(237,108,2,0.05) 0%, transparent 60%);
}
.match-card[data-phase="knockout"] .match-vs,
.match-card[data-phase="cup"] .match-vs {
  background: #fff3e0;
  color: #e65100;
}

/* 卡片头部：场号 + 时间 */
.match-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f0f0f0;
}
.match-seq {
  font-size: 13px;
  font-weight: 700;
  color: #1B5E20;
  background: #e8f5e9;
  padding: 2px 10px;
  border-radius: 12px;
}
.match-datetime {
  font-size: 12px;
  color: #909399;
  font-weight: 500;
}

/* 旧样式兼容 */
.match-venue {
  font-size: 11px;
  color: #909399;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.match-venue::before {
  content: '';
  display: inline-block;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #c0c4cc;
}
.match-time {
  display: flex;
  gap: 10px;
  font-size: 13px;
  color: #606266;
  margin-bottom: 12px;
  font-weight: 500;
}
.match-date { color: #303133; }
.match-time-str { color: #606266; }

.match-teams {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 0;
}
.match-team {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.match-team.home { justify-content: flex-end; text-align: right; }
.match-team.away { justify-content: flex-start; }
.team-name {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 130px;
}
.team-logo {
  width: 32px;
  height: 32px;
  object-fit: contain;
  border-radius: 6px;
  flex-shrink: 0;
}
.team-logo-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: linear-gradient(135deg, #1B5E20, #43A047);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.kit-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px #d0d0d0;
  flex-shrink: 0;
  display: inline-block;
}
.team-score {
  font-size: 22px;
  font-weight: 800;
  color: #f59e0b;
  min-width: 32px;
  text-align: center;
  background: #fffbeb;
  border-radius: 8px;
  padding: 3px 8px;
  line-height: 1.2;
}
.match-vs {
  font-size: 12px;
  font-weight: 700;
  color: #909399;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #f5f7fa;
  letter-spacing: 0.5px;
}
.match-status-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  font-size: 12px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
}
.match-venue-small {
  font-size: 11px;
  color: #909399;
  flex: 1;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.match-ref { color: #606266; font-size: 11px; white-space: nowrap; }
.match-ref.empty { color: #f56c6c; font-size: 11px; }

/* 日历视图 */
.calendar-nav { display: flex; justify-content: center; align-items: center; gap: 16px; margin-bottom: 16px; }
.calendar-range { font-size: 15px; font-weight: 600; }
.calendar-scroll { overflow-x: auto; padding: 2px 2px 10px; }
.calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(205px, 1fr)); gap: 12px; min-width: 1480px; }
.calendar-day { background: #f9fafb; border: 1px solid #edf0f4; border-radius: 12px; overflow: hidden; min-height: 460px; }
.calendar-day-header { padding: 12px 14px; background: #f3f4f6; display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 600; }
.calendar-day-header.is-today { background: #409eff; color: #fff; }
.day-name { color: inherit; opacity: 0.7; }
.day-count { margin-left: auto; background: rgba(0,0,0,0.1); border-radius: 8px; padding: 0 6px; font-size: 11px; }
.is-today .day-count { background: rgba(255,255,255,0.3); }
.calendar-day-body { padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.calendar-match {
  background: #fff;
  border-radius: 8px;
  padding: 10px 12px;
  min-height: 76px;
  font-size: 13px;
  cursor: pointer;
  border-left: 3px solid #409eff;
  transition: all 0.15s;
}
.calendar-match:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.calendar-match.status-finished { border-left-color: #67c23a; }
.calendar-match.status-ongoing { border-left-color: #e6a23c; }
.cm-head, .cm-main { display: flex; align-items: center; gap: 4px; }
.cm-head { justify-content: space-between; margin-bottom: 7px; }
.cm-round { color: #409eff; font-size: 12px; font-weight: 600; }
.cm-time { font-weight: 700; }
.cm-main { min-width: 0; }
.cm-teams { overflow: hidden; flex: 1; text-overflow: ellipsis; white-space: nowrap; }
.cm-score { margin-left: auto; font-weight: 700; color: #f59e0b; flex-shrink: 0; }
.cm-venue { display: block; margin-top: 7px; overflow: hidden; color: #909399; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.calendar-empty { text-align: center; color: #c0c4cc; font-size: 13px; padding: 54px 0; }

/* 全部组别场地视图 */
.venue-view { min-height: 520px; }
:deep(.venue-dialog) { background: #f5f7fa; }
:deep(.venue-dialog .el-dialog__header) { display: none; }
:deep(.venue-dialog .el-dialog__body) { height: 100vh; box-sizing: border-box; padding: 22px 28px 28px; overflow: auto; }
.venue-page-header { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 18px; padding-bottom: 16px; border-bottom: 1px solid #ebeef5; }
.venue-page-title { color: #1f2937; font-size: 19px; font-weight: 700; }
.venue-page-subtitle { margin-top: 5px; color: #8492a6; font-size: 12px; }
.venue-overview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 16px;
  padding: 16px 18px;
  border: 1px solid #d9ecff;
  border-radius: 12px;
  background: linear-gradient(135deg, #f5faff 0%, #fff 72%);
}
.venue-coverage { display: flex; flex-wrap: wrap; gap: 10px; }
.venue-coverage span { padding: 7px 10px; color: #5b6472; font-size: 12px; background: #fff; border: 1px solid #d9ecff; border-radius: 8px; }
.venue-coverage strong { margin-right: 2px; color: #409eff; font-size: 16px; }
.venue-stats { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; }
.venue-stats span { padding: 7px 10px; color: #5b6472; font-size: 12px; background: #fff; border: 1px solid #e7ebf0; border-radius: 8px; }
.venue-stats strong { margin-right: 2px; color: #409eff; font-size: 16px; }
.venue-stats .is-warning, .venue-stats .is-warning strong { color: #e6a23c; }
.venue-stats .is-danger, .venue-stats .is-danger strong { color: #f56c6c; }
.venue-filter {
  margin-bottom: 16px;
  padding: 14px 16px;
  border: 1px solid #e4e7ed;
  border-radius: 10px;
  background: #fff;
}
.venue-filter-header { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; }
.venue-filter-title { color: #303133; font-size: 13px; font-weight: 700; }
.venue-filter-count { color: #909399; font-size: 11px; }
.venue-filter-options { display: flex; flex-wrap: wrap; gap: 8px; }
.venue-filter-options :deep(.el-checkbox) { margin-right: 0; }
.venue-filter-options :deep(.el-checkbox.is-bordered) { height: 32px; padding: 0 12px; border-radius: 7px; }
.venue-calendar-nav { margin: 0 0 16px; }
.venue-date-picker { width: 150px !important; }
.venue-selected-day { min-width: 48px; color: #606266; font-size: 13px; }
.venue-grid-scroll { overflow: auto; max-height: calc(100vh - 340px); border: 1px solid #e4e7ed; border-radius: 12px; }
.venue-grid {
  display: grid;
  background: #e4e7ed;
  gap: 1px;
}
.venue-grid-corner,
.venue-column-header,
.venue-time-cell,
.venue-slot-cell { background: #fff; }
.venue-grid-corner {
  position: sticky;
  left: 0;
  top: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 64px;
  color: #4b5563;
  font-size: 13px;
  font-weight: 700;
  background: #f3f6f9;
}
.venue-column-header {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 64px;
  padding: 0 14px;
  color: #303133;
  font-size: 13px;
  font-weight: 700;
  background: #f3f6f9;
}
.venue-column-header small { color: #909399; font-size: 11px; font-weight: 500; }
.venue-column-header.is-pending { color: #e6a23c; background: #fff9ed; }
.venue-time-cell {
  position: sticky;
  left: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 116px;
  padding: 14px;
  color: #303133;
  font-size: 14px;
  font-weight: 700;
  text-align: center;
  background: #f8fafc;
}
.venue-time-cell small { color: #909399; font-size: 11px; font-weight: 500; }
.venue-time-cell.is-pending { color: #e6a23c; background: #fff9ed; }
.venue-slot-cell { position: relative; display: flex; flex-direction: column; gap: 8px; min-height: 116px; padding: 10px; }
.venue-slot-cell.has-conflict { padding-top: 36px; background: #fff5f5; box-shadow: inset 0 0 0 2px #f56c6c; }
.venue-conflict-label { position: absolute; top: 8px; left: 10px; padding: 3px 7px; color: #fff; font-size: 11px; font-weight: 700; background: #f56c6c; border-radius: 4px; }
.venue-match {
  padding: 9px 10px;
  border-left: 3px solid #409eff;
  border-radius: 7px;
  background: #f8fbff;
  cursor: pointer;
  transition: box-shadow 0.15s, transform 0.15s;
}
.venue-match:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(31, 45, 61, 0.12); }
.venue-match.status-finished { border-left-color: #67c23a; background: #f7fcf4; }
.venue-match.status-ongoing { border-left-color: #e6a23c; background: #fffaf0; }
.venue-match.status-postponed { border-left-color: #f56c6c; background: #fff7f7; }
.venue-match-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.venue-division { max-width: 110px; padding: 2px 6px; overflow: hidden; color: #409eff; font-size: 10px; background: #ecf5ff; border-radius: 4px; text-overflow: ellipsis; white-space: nowrap; }
.venue-match-round { overflow: hidden; color: #909399; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.venue-match-teams { margin-top: 7px; overflow: hidden; color: #374151; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.venue-cell-empty { margin: auto; color: #c5cad2; font-size: 12px; }

@media (max-width: 900px) {
  .venue-overview { align-items: flex-start; flex-direction: column; }
  .venue-stats { justify-content: flex-start; }
  :deep(.venue-dialog .el-dialog__body) { padding: 16px; }
}

/* 配置弹窗 */
.config-content { display: flex; flex-direction: column; gap: 20px; }
.config-section h4 { margin: 0 0 8px 0; font-size: 14px; color: #303133; }
.config-current-division { margin-left: 8px; color: #409eff; font-size: 12px; font-weight: 500; }
.config-helper { margin-top: 7px; color: #909399; font-size: 11px; }
.tag-input-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
</style>
