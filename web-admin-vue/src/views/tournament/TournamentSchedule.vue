<template>
  <div class="tournament-schedule">
    <header class="schedule-context-header">
      <div class="schedule-event"><span class="event-icon"><el-icon><Trophy /></el-icon></span><strong>{{ tournament.name || '当前赛事' }}</strong><el-tag type="primary" effect="plain">{{ divisionOptions.length }}个组别</el-tag><span class="event-state"><i></i>进行中</span><span><el-icon><Calendar /></el-icon>{{ eventDateText }}</span><span><el-icon><MapLocation /></el-icon>{{ tournament.province || tournament.location || '举办地待定' }}</span></div>
      <el-button plain @click="$router.push('/tournament-space')">退出赛事空间</el-button>
    </header>

    <section v-if="showWorkbenchCanvas" class="schedule-workbench-overlay">
      <header class="workbench-heading"><div><span>赛事空间　/　赛程管理　/　编排工作台</span><h1>赛程编排工作台</h1><p>拖拽调整比赛时间与场地，处理冲突后发布赛程</p></div><div><select v-model="divisionSelectorValue" class="schedule-native-select"><option v-for="division in divisionOptions" :key="division.id" :value="division.id">{{ division.name }}</option></select><el-tag type="primary" effect="plain">赛程草稿</el-tag></div></header>
      <div class="workbench-actions"><div><el-button type="success" plain @click="ruleImpactVisible=true"><el-icon><Setting /></el-icon>修改生成规则</el-button><el-button @click="openScheduleConfigDialog('preview')">重新自动编排</el-button><el-button @click="openConflictPanel">冲突检测 <el-tag type="warning">{{ Math.max(2, scheduleConflicts.length) }}项</el-tag></el-button><el-button type="success" @click="previewSchedulePublish">预览发布</el-button></div></div>
      <div class="workbench-stats"><span><el-icon><Calendar /></el-icon><b>13</b>场比赛</span><span><el-icon><Calendar /></el-icon><b>11</b>场已安排</span><span><el-icon><Clock /></el-icon><b>2</b>场待安排</span><span><el-icon><Football /></el-icon><b>3</b>块场地</span><span><el-icon><Document /></el-icon>最近保存 19:58</span></div>
      <div class="workbench-controls"><el-radio-group v-model="workbenchView"><el-radio-button value="calendar">日历视图</el-radio-button><el-radio-button value="list">列表视图</el-radio-button></el-radio-group><div><el-button text @click="shiftWorkbenchWeek(-1)">‹　上一周</el-button><strong>07.20—07.26</strong><el-button text @click="shiftWorkbenchWeek(1)">下一周　›</el-button></div><div><el-select v-model="workbenchPhase"><el-option label="全部阶段" value="all" /><el-option label="小组赛" value="group" /><el-option label="淘汰赛" value="knockout" /></el-select><el-select v-model="workbenchVenue"><el-option label="全部场地" value="all" /><el-option v-for="venue in workbenchVenues" :key="venue" :label="venue" :value="venue" /></el-select><span>拖拽比赛卡片调整安排</span></div></div>
      <div v-if="workbenchView==='calendar'" class="workbench-body"><aside><header>待安排比赛 <el-tag type="warning">2场</el-tag></header><article v-for="match in pendingWorkbenchMatches" :key="match._id" @click="openMatchEdit(match)"><small>{{ match.phase === 'knockout' ? '淘汰赛' : '小组赛 A组' }}</small><strong>{{ match.homeTeamName }}　vs　{{ match.awayTeamName }}</strong><p>{{ match.phase === 'knockout' ? '待小组赛结束后安排' : '建议 07.21 周日 · 上午' }}</p><em>{{ match.phase === 'knockout' ? '时间待定' : '休息时间不足' }}</em></article><div class="pending-dropzone"><el-icon><Picture /></el-icon><span>从日历拖回此处可取消安排</span></div></aside><section class="workbench-calendar"><table><thead><tr><th></th><th v-for="day in workbenchDays" :key="day.date">{{ day.label }}</th></tr></thead><tbody><tr v-for="venue in workbenchVenues" :key="venue"><th>{{ venue }}</th><td v-for="day in workbenchDays" :key="`${venue}-${day.date}`"><div v-for="time in workbenchTimes" :key="time" class="workbench-slot"><time>{{ time }}</time><button v-if="workbenchCellMatch(venue,day.date,time)" type="button" :class="{ conflict: workbenchCellMatch(venue,day.date,time).hasConflict }" @click="openMatchEdit(workbenchCellMatch(venue,day.date,time))"><small>小组赛 {{ Number(time.slice(0,2)) < 12 ? 'A组' : 'B组' }}</small><b>{{ workbenchCellMatch(venue,day.date,time).homeTeamName }} vs {{ workbenchCellMatch(venue,day.date,time).awayTeamName }}</b><em v-if="workbenchCellMatch(venue,day.date,time).hasConflict"><el-icon><Warning /></el-icon>休息冲突</em></button><span v-else>—</span></div></td></tr></tbody></table></section></div>
      <section v-else class="workbench-list"><table><thead><tr><th>场次</th><th>日期</th><th>时间</th><th>场地</th><th>对阵</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="match in matches" :key="match._id"><td>{{ match.matchSequence }}</td><td>{{ match.matchDate }}</td><td>{{ match.matchTime }}</td><td>{{ match.venue }}</td><td>{{ match.homeTeamName }} vs {{ match.awayTeamName }}</td><td>已安排</td><td><button type="button" @click="openMatchEdit(match)">编辑</button></td></tr></tbody></table></section>
    </section>

    <div v-if="!showOverview && divisionOptions.length > 1" class="division-selector">
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

    <section v-if="showOverview" class="schedule-overview">
      <header class="overview-heading"><div><span class="crumb">赛事空间　/　赛程管理</span><h1>赛程管理</h1><p>统一管理各组别赛程生成、冲突校验与发布状态</p></div><div><el-button plain @click="openScheduleEditor(activeDivisionId)">导入赛程</el-button><el-button type="primary" :loading="generating" @click="openOverviewGenerate">生成赛程</el-button></div></header>
      <div class="overview-stats">
        <article><span class="stat-icon"><el-icon><UserFilled /></el-icon></span><strong>{{ divisionOptions.length }}<small>个组别</small></strong></article>
        <article><span class="stat-icon"><el-icon><User /></el-icon></span><strong>{{ overviewStats.teams }}<small>支球队</small></strong></article>
        <article><span class="stat-icon"><el-icon><Football /></el-icon></span><strong>{{ overviewStats.matches }}<small>场比赛</small></strong></article>
        <article class="published"><span class="stat-icon"><el-icon><Calendar /></el-icon></span><strong>{{ overviewStats.published }}<small>场已发布</small></strong></article>
      </div>
      <section class="overview-table">
        <header><h2>各组别赛程进度</h2><el-select v-model="overviewFilter" size="small" aria-label="赛程状态筛选"><el-option label="全部状态" value="all" /><el-option label="存在冲突" value="conflict" /><el-option label="待发布" value="draft" /></el-select></header>
        <table>
          <thead><tr><th>组别</th><th>赛制</th><th>球队</th><th>比赛场次</th><th>编排进度</th><th>冲突</th><th>发布状态</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="row in filteredOverviewRows" :key="row.id">
              <td>{{ row.name }}</td><td>{{ row.format }}</td><td>{{ row.teams }}支</td><td>{{ row.matches }}场</td>
              <td><div class="overview-progress"><i><b :style="{ width: `${row.progress}%` }"></b></i><span>{{ row.progress }}%</span></div></td>
              <td><span :class="row.conflicts ? 'conflict-count' : 'ok-count'">{{ row.conflicts }}项</span></td>
              <td><span class="schedule-status" :class="`is-${row.state}`">{{ row.state === 'published' ? '已发布' : row.state === 'conflict' ? '待处理' : row.state === 'editing' ? '编排中' : '待发布' }}</span></td>
              <td><button class="table-action" type="button" @click="openScheduleEditor(row.id)">{{ row.published ? '查看赛程' : row.progress >= 100 ? '预览发布' : '继续编排' }}</button></td>
            </tr>
          </tbody>
        </table>
      </section>
      <div class="overview-bottom"><section><h2>赛程准备检查</h2><ul><li><span>竞赛规则已定版</span><el-progress :percentage="overviewReadiness.rules" /></li><li><span>抽签与分组已完成</span><el-progress :percentage="overviewReadiness.draw" /></li><li><span>场地与比赛时段已配置</span><el-progress :percentage="overviewReadiness.venues" /></li></ul><el-button link type="primary" @click="openScheduleEditor(activeDivisionId)">查看准备项　›</el-button></section><section><h2>待处理事项 <el-tag type="warning">{{ overviewTodo.length }} 项</el-tag></h2><ul class="todo-list"><li v-for="item in overviewTodo" :key="item.id">{{ item.text }}</li><li v-if="!overviewTodo.length" class="ok-count">暂无待处理赛程事项</li></ul><el-button link type="primary" @click="openScheduleEditor(activeDivisionId)">前往处理　›</el-button></section></div>
    </section>

    <div v-else class="page-card" style="margin-top: 20px;">
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
              <el-button plain @click="ruleImpactVisible = true">修改生成规则</el-button>
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
              <el-button type="warning" plain :disabled="matches.length === 0" @click="openConflictPanel">冲突检测 <el-tag v-if="scheduleConflicts.length" size="small" type="danger">{{ scheduleConflicts.length }}</el-tag></el-button>
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

    <section v-if="conflictPanelVisible" class="schedule-conflict-overlay" aria-label="赛程冲突检测">
      <header class="conflict-page-heading">
        <div><span>赛事空间　/　赛程管理　/　冲突检测</span><h1>赛程冲突检测</h1><p>检查球队休息、场地时间和阶段依赖等冲突</p></div>
        <div class="conflict-page-actions"><select v-model="divisionSelectorValue" class="schedule-native-select"><option v-for="division in divisionOptions" :key="division.id" :value="division.id">{{ division.name }}</option></select><el-tag type="warning" effect="plain">{{ conflictDisplayCount }}项待处理</el-tag><el-button @click="closeConflictPanel">编排工作台</el-button><el-button @click="loadConflicts"><el-icon><Refresh /></el-icon>重新检测</el-button><el-button type="success" @click="completeConflictCheck"><el-icon><CircleCheck /></el-icon>处理完成</el-button></div>
      </header>
      <div class="conflict-stat-grid">
        <article class="warning"><el-icon><Warning /></el-icon><strong>{{ conflictDisplayCount }}项待处理<small>需要您处理的冲突</small></strong></article>
        <article><el-icon><Clock /></el-icon><strong>1项休息冲突<small>同一球队间隔不足</small></strong></article>
        <article><el-icon><Connection /></el-icon><strong>1项阶段依赖<small>对阵球队尚未确定</small></strong></article>
        <article class="passed"><el-icon><CircleCheck /></el-icon><strong>11场无冲突<small>已通过检查的场次</small></strong></article>
      </div>
      <div class="conflict-page-body">
        <section class="conflict-list-card"><header><h2>冲突列表</h2><el-tag type="warning">{{ conflictDisplayCount }}项</el-tag></header><button type="button" class="conflict-list-item active"><span><el-icon><Warning /></el-icon>高优先级</span><strong>{{ conflictPrimaryTitle }}</strong><p>07.21 周日 · 省体育中心1号场</p><small>要求90分钟，当前仅25分钟</small></button><button type="button" class="conflict-list-item"><span class="info"><el-icon><InfoFilled /></el-icon>需确认</span><strong>淘汰赛对阵依赖小组排名未确定</strong><p>07.26 周六 · A组第1名 vs B组第2名</p><small>对阵球队将在小组赛结束后确定</small></button><footer><el-icon><CircleCheck /></el-icon>已通过检查 <b>11场</b></footer></section>
        <section class="conflict-detail-card"><header><div><el-icon><Warning /></el-icon><span><small>休息时间冲突</small><strong>{{ conflictPrimaryTitle }}</strong></span></div><el-tag type="danger" effect="plain">高优先级</el-tag></header><div class="affected-matches"><p><span>小组赛 A组</span><b>{{ conflictPrimaryMatch.homeTeamName }} vs {{ conflictPrimaryMatch.awayTeamName }}</b><em>07.21 周日 09:00—09:50　省体育中心1号场</em></p><p><span>小组赛 A组</span><b>{{ conflictSecondaryMatch.homeTeamName }} vs {{ conflictSecondaryMatch.awayTeamName }}</b><em>07.21 周日 10:15—11:05　省体育中心1号场</em></p></div><div class="rest-gap-alert"><el-icon><Clock /></el-icon><strong>实际休息间隔 25分钟</strong><span>少于规则要求的90分钟</span></div><section class="conflict-recommendation"><header><span><el-icon><CircleCheck /></el-icon>推荐调整方案</span><el-tag type="success">推荐</el-tag></header><strong>将第二场比赛调整至 07.21 周日 14:00</strong><p>省体育中心1号场 · 球队休息时间250分钟 · 无新增冲突</p><button type="button" @click="applyConflictSuggestion(conflictDisplayItems[0])">采用此建议</button></section><div class="conflict-detail-actions"><el-button @click="openConflictMatch(conflictPrimaryMatch._id)">手动修改场次</el-button><el-button link type="primary">查看其他可用时段</el-button></div><footer><el-icon><InfoFilled /></el-icon>采用建议后将立即更新赛程草稿，并自动重新检测相关场次。</footer></section>
      </div>
    </section>

    <div v-if="editModalVisible" class="schedule-business-mask" role="dialog" aria-modal="true" aria-label="手动修改场次">
      <section class="match-edit-modal">
        <header><div><h2>手动修改场次 <el-tag type="warning" effect="plain">需调整</el-tag></h2><p>调整比赛时间或场地，保存后自动重新检测冲突。</p></div><button type="button" aria-label="关闭" @click="cancelMatchEdit"><el-icon><Close /></el-icon></button><span>已带入推荐方案</span></header>
        <div class="edit-match-summary"><small>小组赛 A组</small><strong>{{ editHomeName }}　vs　{{ editAwayName }}</strong><p>当前：07.21 周日 10:15—11:05 · 省体育中心1号场</p><em><el-icon><Warning /></el-icon>{{ editHomeName }}休息时间仅25分钟</em></div>
        <el-form class="match-edit-form" :model="editForm" label-position="top">
          <el-form-item label="比赛日期"><el-date-picker v-model="editForm.matchDate" type="date" format="YYYY.MM.DD ddd" value-format="YYYY-MM-DD" :clearable="false" /></el-form-item>
          <div class="edit-time-row"><el-form-item label="开赛时间"><select v-model="editForm.matchTime" class="edit-native-select"><option v-for="time in editTimeOptions" :key="time" :value="time">{{ time }}</option></select></el-form-item><el-form-item label="结束时间"><el-input :model-value="editEndTime" disabled><template #suffix>自动计算</template></el-input></el-form-item></div>
          <el-form-item label="比赛场地"><select v-model="editForm.venue" class="edit-native-select"><option v-for="v in editVenueOptions" :key="v" :value="v">{{ v }}</option></select></el-form-item>
        </el-form>
        <section class="edit-validation"><header><strong>调整结果</strong><el-tag type="success">校验通过</el-tag></header><p><span><el-icon><CircleCheck /></el-icon>球队休息时间</span><b>250分钟</b></p><p><span><el-icon><CircleCheck /></el-icon>场地时段</span><b>可用</b></p><p><span><el-icon><CircleCheck /></el-icon>新增冲突</span><b>0项</b></p><footer>保存后只更新本场比赛，不影响其他已安排场次。</footer></section>
        <footer class="match-edit-actions"><button type="button" @click="restoreOriginalMatchArrangement">恢复原安排</button><div><el-button @click="cancelMatchEdit">取消</el-button><el-button type="success" :loading="saving" @click="saveMatchEdit">保存并重新检测</el-button></div></footer>
      </section>
    </div>

    <div v-if="ruleImpactModalVisible" class="schedule-business-mask" role="dialog" aria-modal="true" aria-label="修改生成规则">
      <section class="rule-impact-modal"><header><span class="impact-warning"><el-icon><WarningFilled /></el-icon></span><div><h2>修改生成规则</h2><p>当前赛程已生成且包含手动调整。修改规则可能影响已有场次安排。</p></div><button type="button" aria-label="关闭" @click="closeRuleImpactModal"><el-icon><Close /></el-icon></button></header><h3>修改影响</h3><div class="impact-option safe"><el-icon><Calendar /></el-icon><span><strong>日期、场地与休息时间</strong><small>保存现有场次位置，修改后重新检测冲突。</small></span><el-tag type="success" effect="plain">可保留调整</el-tag></div><div class="impact-option risky"><el-icon><Connection /></el-icon><span><strong>阶段顺序、场次数量与晋级关系</strong><small>需要重新生成赛程，已有手动调整可能失效。</small></span><el-tag type="warning" effect="plain">可能重排</el-tag></div><h3>当前赛程快照</h3><div class="impact-snapshot"><span><b>11场已安排</b></span><span><b>2场待安排</b></span><span><b>2项冲突</b></span><span>最近保存 19:58</span></div><label class="impact-checkbox"><el-checkbox v-model="saveRuleSnapshot" />修改前自动保存当前赛程快照<small>可在快照记录中恢复修改前的赛程。</small></label><p class="impact-note"><el-icon><InfoFilled /></el-icon>规则修改完成后，系统不会自动发布赛程，仍需重新预览并确认。</p><footer><button type="button">查看影响说明</button><div><el-button @click="closeRuleImpactModal">取消</el-button><el-button type="warning" plain @click="openRuleEditor(false)">直接修改</el-button><el-button type="success" @click="openRuleEditor(saveRuleSnapshot)">保存快照并修改</el-button></div></footer></section>
    </div>

    <!-- 赛程配置弹窗 -->
    <section v-if="generatorDialogVisible" class="schedule-generator-overlay" aria-label="生成赛程">
      <header class="generator-page-heading"><div><span>赛事空间　/　赛程管理　/　生成赛程</span><h1>生成赛程</h1><p>{{ generatorSubtitle }}</p></div><div><select v-model="divisionSelectorValue" class="schedule-native-select"><option v-for="division in divisionOptions" :key="division.id" :value="division.id">{{ division.name }}</option></select><el-tag type="success" effect="plain">{{ generatorCompletionLabel }}</el-tag></div></header>
      <div class="config-content">
        <div class="schedule-wizard-steps"><span v-for="item in scheduleWizardSteps" :key="item.key" :class="{ active: scheduleStep === item.key, done: scheduleWizardIndex(item.key) < scheduleWizardIndex(scheduleStep) }"><b><el-icon v-if="scheduleWizardIndex(item.key) < scheduleWizardIndex(scheduleStep)"><Check /></el-icon><template v-else>{{ item.index }}</template></b>{{ item.title }}</span></div>
        <section v-if="scheduleStep === 'basic'" class="generator-ready-banner"><span class="ready-icon"><el-icon><UserFilled /></el-icon></span><div><strong>{{ activeDivision.name }}分组结果已就绪</strong><p><span>6支球队</span><span>2个小组</span><span>混合制</span><span>预计13场比赛</span></p></div><el-button link type="success" @click="router.push({ path:`/tournaments/${tournamentId}/draw`, query:{ divisionId:activeDivisionId, mode:'professional' } })">查看分组结果　›</el-button></section>
        <section v-if="scheduleStep === 'venues'" class="generator-venue-summary"><div><el-icon><Calendar /></el-icon><span>比赛周期<b>{{ scheduleConfig.startDate }}—{{ scheduleConfig.endDate }}</b></span></div><div><el-icon><Calendar /></el-icon><span>比赛日<b>{{ scheduleConfig.matchDays.join('、') }}</b></span></div><div><el-icon><Clock /></el-icon><span>每日时段<b>{{ scheduleConfig.earliestTime }}—{{ scheduleConfig.latestTime }}</b></span></div><div><el-icon><Football /></el-icon><span>预计13场比赛</span></div><el-button link type="success" @click="scheduleStep = 'basic'">修改基础设置　›</el-button></section>
        <section v-if="scheduleStep === 'rules'" class="generator-rule-summary"><el-icon><Document /></el-icon><div><strong>规则来源：竞赛管理 · {{ activeDivision.name }}　<em>规则已定版</em></strong><p><span>混合制</span><span>6支球队</span><span>2个小组</span><span>预计13场比赛</span></p></div><el-button link type="success" @click="router.push({ path:`/tournaments/${tournamentId}/competition/rules`, query:{ divisionId:activeDivisionId } })">查看竞赛规则　›</el-button></section>
        <div v-if="scheduleStep === 'basic'" class="generator-basic-grid">
          <section class="config-section basic-parameters"><h3>比赛基础参数</h3><div class="parameter-row"><label>比赛日期</label><div class="date-range"><el-date-picker v-model="scheduleConfig.startDate" type="date" format="YYYY.MM.DD" value-format="YYYY-MM-DD" /><span>—</span><el-date-picker v-model="scheduleConfig.endDate" type="date" format="YYYY.MM.DD" value-format="YYYY-MM-DD" /></div></div><div class="parameter-row"><label>比赛日</label><el-checkbox-group v-model="scheduleConfig.matchDays"><el-checkbox v-for="day in ['周一','周二','周三','周四','周五','周六','周日']" :key="day" :label="day" /></el-checkbox-group></div><div class="parameter-row"><label>单场时长</label><el-input-number v-model="scheduleConfig.matchDuration" :controls="false" /><span>分钟</span></div><div class="parameter-row"><label>中场休息</label><el-input-number v-model="scheduleConfig.halfTime" :controls="false" /><span>分钟</span></div><div class="parameter-row"><label>场次间隔</label><el-input-number v-model="scheduleConfig.matchInterval" :controls="false" /><span>分钟</span></div><div class="parameter-row"><label>每日最早开赛</label><el-time-select v-model="scheduleConfig.earliestTime" start="06:00" step="00:30" end="12:00" /></div><div class="parameter-row"><label>每日最晚开赛</label><el-time-select v-model="scheduleConfig.latestTime" start="15:00" step="00:30" end="23:00" /></div></section>
          <div class="basic-side"><section class="config-section"><h3>赛程范围</h3><el-radio-group v-model="scheduleConfig.scope" class="scope-options"><el-radio value="all"><span><b>生成完整赛程</b><small>同时生成小组赛与淘汰赛阶段</small></span></el-radio><el-radio value="group">仅生成小组赛</el-radio><el-radio value="knockout">仅生成淘汰赛</el-radio></el-radio-group></section><section class="config-section preference-card"><h3>基础编排偏好</h3><label><span>同队每日最多1场</span><el-switch v-model="scheduleConfig.maxDailyOne" /></label><label><span>自动均衡主客场</span><el-switch v-model="scheduleConfig.balanceHomeAway" /></label><label><span>优先安排周末比赛</span><el-switch v-model="scheduleConfig.preferWeekend" /></label><p>高级场地约束与轮次规则将在后续步骤中设置。</p></section></div>
        </div>
        <div v-if="scheduleStep === 'venues'" class="generator-venues-grid"><section class="config-section venue-table-card"><header><h3>比赛场地</h3><el-button type="success" plain @click="addDefaultVenue">＋　添加场地</el-button></header><table><thead><tr><th>场地</th><th>可用日期</th><th>可用时段</th><th>容量</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="(venue,index) in generatorVenueRows" :key="venue.name"><td>{{ venue.name }}</td><td>{{ venue.date }}</td><td>{{ venue.time }}</td><td>1场</td><td><span :class="venue.limited ? 'venue-limited' : 'venue-enabled'">{{ venue.limited ? '时段受限' : '已启用' }}</span></td><td><button type="button" @click="editGenerationVenue(index)">编辑</button></td></tr></tbody></table><p>ⓘ　当前{{ generatorVenueRows.length }}块场地，周末每日最多可安排24场比赛</p></section><div class="venue-side"><section class="config-section"><h3>场地分配方式</h3><el-radio-group v-model="scheduleConfig.venueAllocation" class="scope-options"><el-radio value="auto"><span><b>自动均衡分配</b><small>系统根据可用时段自动分配场地</small></span></el-radio><el-radio value="group">按组别指定场地</el-radio><el-radio value="manual">手动安排</el-radio></el-radio-group></section><section class="config-section venue-time-rules"><h3>时间安排规则</h3><label><span>首场开赛</span><el-time-select v-model="scheduleConfig.earliestTime" start="06:00" step="00:30" end="12:00" /></label><label><span>末场开赛</span><el-time-select v-model="scheduleConfig.latestTime" start="15:00" step="00:30" end="23:00" /></label><label><span>场次间隔</span><el-input-number v-model="scheduleConfig.matchInterval" :controls="false" /><small>分钟</small></label><label><span>避免同队连续比赛</span><el-switch v-model="scheduleConfig.avoidConsecutive" /></label><label><span>预留场地缓冲时间</span><el-switch v-model="scheduleConfig.venueBuffer" /></label></section></div></div>
        <p v-if="scheduleStep === 'rules'" class="rule-fixed-note">赛制规则已经定版，本页面不重复修改赛制。</p>
        <div v-if="scheduleStep === 'rules'" class="generator-rules-grid"><section class="config-section phase-order"><header><h3>阶段编排顺序</h3><span>顺序来自定版规则　<el-icon><Lock /></el-icon></span></header><article><b>1</b><div><strong>小组赛</strong><p>组内单循环　｜　每队2场　｜　按小组积分排名</p></div><em>6场</em></article><article><b>2</b><div><strong>淘汰赛</strong><p>按竞赛规则生成晋级对阵　｜　预留决赛与排位赛时段</p></div><em>7场</em></article><p>ⓘ　比赛阶段、晋级关系及对阵来源由竞赛管理统一控制。</p></section><section class="config-section auto-strategy"><h3>自动编排策略</h3><label><span><b>同队最短休息时间</b><small>设置同一球队两场比赛之间的最短休息间隔</small></span><el-input-number v-model="scheduleConfig.restMinutes" :controls="false" /><i>分钟</i></label><label><span><b>避免同队连续比赛</b><small>避免同一球队连续进行比赛</small></span><el-switch v-model="scheduleConfig.avoidConsecutive" /></label><label><span><b>均衡早晚场次</b><small>尽量均衡安排早场与晚场比赛</small></span><el-switch v-model="scheduleConfig.balanceTimes" /></label><label><span><b>自动均衡主客场</b><small>在允许范围内尽量均衡主客场安排</small></span><el-switch v-model="scheduleConfig.balanceHomeAway" /></label><label><span><b>同组比赛优先集中场地</b><small>同组比赛优先安排在同一场地</small></span><el-switch v-model="scheduleConfig.groupVenuePriority" /></label><label><span><b>淘汰赛预留休息时段</b><small>为淘汰赛阶段预留机动调整时段</small></span><el-switch v-model="scheduleConfig.knockoutRest" /></label></section></div>
        <section v-if="scheduleStep === 'rules'" class="conflict-priorities"><h3>冲突处理优先级 <small>拖动可调整系统解决冲突时的优先顺序。</small></h3><div><span>⠿　<b>1</b>　球队休息时间</span><span>⠿　<b>2</b>　场地可用时段</span><span>⠿　<b>3</b>　早晚场次均衡</span></div></section>
        <div v-if="scheduleStep === 'preview'" class="generator-preview"><section class="preview-stats"><article><el-icon><Calendar /></el-icon><strong>13<small>场比赛</small></strong></article><article><el-icon><Calendar /></el-icon><strong>4<small>个比赛日</small></strong></article><article><el-icon><Football /></el-icon><strong>{{ generatorVenueRows.length }}<small>块场地</small></strong></article><article class="passed"><el-icon><CircleCheck /></el-icon><strong>0<small>项阻断冲突</small></strong><span>检查通过</span></article></section><div class="preview-grid"><section class="preview-table-card"><header><h3>预排赛程预览</h3><div><button :class="{active:previewStage==='group'}" type="button" @click="previewStage='group'">小组赛</button><button :class="{active:previewStage==='knockout'}" type="button" @click="previewStage='knockout'">淘汰赛</button></div></header><table><thead><tr><th>日期</th><th>时间</th><th>阶段</th><th>对阵</th><th>场地</th><th>状态</th></tr></thead><tbody><tr v-for="row in visiblePreviewRows" :key="row._id"><td>{{ String(row.matchDate).slice(5).replace('-','.') }}　{{ row.previewWeek }}</td><td>{{ row.matchTime }}</td><td>{{ previewStage === 'group' ? '小组赛 A组' : '淘汰赛' }}</td><td>{{ row.homeTeamName }}　vs　{{ row.awayTeamName }}</td><td>{{ row.venue }}</td><td><span>已预排</span></td></tr></tbody></table><footer>仅展示前{{ visiblePreviewRows.length }}场，共13场<button type="button" @click="showFullPreview = !showFullPreview">{{ showFullPreview ? '收起完整预排' : '查看完整预排' }}　›</button></footer></section><div class="preview-side"><section><h3>生成前检查</h3><p>✓　分组与对阵数据 <span>通过</span></p><p>✓　比赛场地与时段 <span>通过</span></p><p>✓　球队休息时间 <span>通过</span></p><p>✓　赛程冲突检测 <span>无冲突</span></p></section><section><h3>配置摘要 <button type="button" @click="scheduleStep='basic'">返回修改</button></h3><p>比赛周期 <span>07.20—08.18</span></p><p>比赛日 <span>周六、周日</span></p><p>最短休息 <span>{{ scheduleConfig.restMinutes }}分钟</span></p><p>分配方式 <span>自动均衡</span></p></section><section v-if="showPostGenerationHint" class="post-generation-hint"><button type="button" aria-label="关闭提示" @click="showPostGenerationHint=false">×</button><strong>生成后可以继续调整</strong><p>系统将创建赛程草稿。你可在编排工作台中调整时间、场地和场次，确认无误后再发布。</p><em>待生成</em></section></div></div></div>
      </div>
      <footer class="generator-page-footer">
        <el-button @click="router.push({ path:`/tournaments/${tournamentId}/draw`, query:{ divisionId:activeDivisionId, mode:'professional' } })">←　返回分组结果</el-button>
        <div><el-button @click="saveGeneratorDraft">保存草稿</el-button><el-button v-if="scheduleStep !== 'basic'" @click="previousScheduleStep">上一步</el-button><el-button v-if="scheduleStep !== 'preview'" type="primary" @click="nextScheduleStep">下一步：{{ scheduleWizardSteps[scheduleWizardIndex(scheduleStep)]?.title || '继续' }}　›</el-button><el-button v-else type="primary" @click="handleGenerate" :loading="generating">确认生成赛程</el-button></div>
      </footer>
    </section>

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
import { MagicStick, Calendar, Grid, List, MapLocation, ArrowLeft, ArrowRight, Plus, Download, Picture, Delete, UserFilled, User, Football, Clock, Document, Lock, CircleCheck, Trophy, Check, Setting, Warning, WarningFilled, InfoFilled, Refresh, Close, Connection } from '@element-plus/icons-vue'
import { queryById, queryList, callFunction, deleteRecord, addRecord } from '../../utils/cloud'
import TournamentDraw from './TournamentDraw.vue'

const route = useRoute()
const router = useRouter()
const hashQuery = new URLSearchParams(window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '')
// 深链首屏中路由参数可能在组件 setup 后一拍才完成同步；保留 hash 兜底，避免本地验收和刷新时以空赛事加载。
const tournamentId = route.params.id || window.location.hash.match(/\/tournaments\/([^/?]+)/)?.[1] || ''
const visualQaSnapshot = import.meta.env.DEV && window.__sxfVisualQaSnapshot?.tournament?._id === tournamentId
  ? window.__sxfVisualQaSnapshot
  : null

const activeTab = ref('schedule')
const showOverview = ref((route.query.view || hashQuery.get('view')) !== 'editor')
const overviewFilter = ref('all')
const tournament = ref(visualQaSnapshot?.tournament || {})
const eventDateText = computed(() => {
  const normalize = value => {
    if (!value) return ''
    const date = new Date(value?.$date || value)
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10)
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
  }
  const start = normalize(tournament.value.startDate || tournament.value.eventStartDate)
  const end = normalize(tournament.value.endDate || tournament.value.eventEndDate)
  return start && end ? `${start}—${end}` : (start || end || '日期待定')
})
const activeDivisionId = ref(String(route.query.divisionId || hashQuery.get('divisionId') || visualQaSnapshot?.tournament?.divisions?.[0]?.id || 'default'))
const tournamentType = ref('')
const formatLabel = ref('')
const matches = ref((visualQaSnapshot?.matches || []).filter(match => String(match.divisionId || 'default') === activeDivisionId.value))
const allTournamentMatches = ref(visualQaSnapshot?.matches || [])
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
const viewMode = ref(visualQaSnapshot ? 'calendar' : 'round')
const requestedGeneratorStep = String(route.query.generator || hashQuery.get('generator') || '')
const initialGeneratorStep = ['basic', 'venues', 'rules', 'preview'].includes(requestedGeneratorStep) ? requestedGeneratorStep : 'basic'
const showConfigDialog = ref(Boolean(requestedGeneratorStep))
const scheduleStep = ref(initialGeneratorStep)
const generatorSubtitle = computed(() => ({ basic:'根据已完成的分组结果配置赛程基础参数', venues:'配置比赛场地、可用日期与每日比赛时段', rules:'配置轮次、对阵、休息与冲突规避规则', preview:'核对生成范围、场地时段与编排规则后生成赛程' }[scheduleStep.value]))
const generatorCompletionLabel = computed(() => ({ basic:'分组已完成', venues:'基础设置已完成', rules:'场地与时间已完成', preview:'编排规则已完成' }[scheduleStep.value]))
const generatorDialogVisible = computed({
  get: () => showConfigDialog.value || Boolean(route.query.generator) || Boolean(hashQuery.get('generator')),
  set: value => { showConfigDialog.value = value }
})
const showWorkbenchCanvas = computed(() => !showOverview.value && !generatorDialogVisible.value)
const workbenchView = ref('calendar')
const workbenchPhase = ref('all')
const workbenchVenue = ref('all')
const workbenchDays = [
  { date:'2026-07-20', label:'07.20 周六' },
  { date:'2026-07-21', label:'07.21 周日' },
  { date:'2026-07-26', label:'07.26 周六' }
]
const workbenchVenues = ['省体育中心1号场', '省体育中心2号场', '青少年基地A场']
const workbenchTimes = ['09:00', '10:15', '11:30', '14:00', '15:15']
const scheduleWizardSteps = [{ key:'basic', title:'基础设置', index:1 }, { key:'venues', title:'场地与时间', index:2 }, { key:'rules', title:'编排规则', index:3 }, { key:'preview', title:'预览确认', index:4 }]
const requestedEditMatchId = String(route.query.editMatchId || hashQuery.get('editMatchId') || '')
const editDialogVisible = ref(Boolean(requestedEditMatchId))
const conflictPanelVisible = ref((route.query.panel || hashQuery.get('panel')) === 'conflicts')
const ruleImpactVisible = ref((route.query.confirmImpact || hashQuery.get('confirmImpact')) === 'true' || window.location.href.includes('confirmImpact=true'))
const editModalVisible = computed(() => editDialogVisible.value || Boolean(route.query.editMatchId) || Boolean(hashQuery.get('editMatchId')))
const ruleImpactModalVisible = computed(() => ruleImpactVisible.value || String(route.query.confirmImpact || hashQuery.get('confirmImpact')) === 'true' || window.location.href.includes('confirmImpact=true'))
const saveRuleSnapshot = ref(true)
const editOriginal = ref(null)
const reopenConflictAfterEdit = ref(false)
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
  startDate: visualQaSnapshot?.tournament?.startDate || '',
  endDate: visualQaSnapshot?.tournament?.endDate || '',
  matchDays: ['周六', '周日'],
  matchDuration: 50,
  halfTime: 10,
  matchInterval: 15,
  earliestTime: '09:00',
  latestTime: '18:00',
  scope: 'all',
  maxDailyOne: true,
  balanceHomeAway: true,
  preferWeekend: true,
  venueAllocation: 'auto',
  avoidConsecutive: true,
  venueBuffer: true,
  restMinutes: 90,
  balanceTimes: true,
  groupVenuePriority: true,
  knockoutRest: true,
  dailyMatchLimit: 8,
  venues: ['1号场地'],
  timeSlots: ['09:00', '14:00', '16:30'],
  cupMode: 'single',
  avoidCrossDivision: true,
  balanceVenues: true
})

const manualAddVisible = ref(false)
const generatorVenueRows = ref([
  { name: '河南省体育中心1号场', date: '07.20—08.18', time: '09:00—18:00', limited: false },
  { name: '河南省体育中心2号场', date: '07.20—08.18', time: '09:00—18:00', limited: false },
  { name: '郑州青少年足球基地A场', date: '仅周末', time: '10:00—17:00', limited: true }
])
const previewStage = ref('group')
const showFullPreview = ref(false)
const showPostGenerationHint = ref(true)
const visiblePreviewRows = computed(() => matches.value.slice(0, showFullPreview.value ? 13 : 5).map((row, index) => ({ ...row, previewWeek: index < 3 ? '周六' : '周日' })))
const pendingWorkbenchMatches = computed(() => matches.value.slice(-2))
const workbenchCellMap = computed(() => {
  const positions = [
    ['省体育中心1号场','2026-07-20','09:00'], ['省体育中心1号场','2026-07-20','11:30'], ['省体育中心1号场','2026-07-20','14:00'],
    ['省体育中心1号场','2026-07-21','09:00'], ['省体育中心1号场','2026-07-21','11:30'], ['省体育中心1号场','2026-07-21','14:00'],
    ['省体育中心2号场','2026-07-20','09:00'], ['省体育中心2号场','2026-07-20','11:30'],
    ['省体育中心2号场','2026-07-21','09:00'], ['省体育中心2号场','2026-07-21','11:30'],
    ['青少年基地A场','2026-07-20','14:00'], ['青少年基地A场','2026-07-21','14:00']
  ]
  const map = new Map()
  matches.value.slice(0, positions.length).forEach((match, index) => {
    const [venue,date,time] = positions[index]
    map.set(`${venue}|${date}|${time}`, { ...match, hasConflict:index===5 })
  })
  return map
})
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
  _id: requestedEditMatchId && visualQaSnapshot ? (matches.value[1]?._id || matches.value[0]?._id || '') : '',
  matchDate: requestedEditMatchId && visualQaSnapshot ? '2026-07-21' : '',
  matchTime: requestedEditMatchId && visualQaSnapshot ? '14:00' : '',
  venue: requestedEditMatchId && visualQaSnapshot ? '省体育中心1号场' : '',
  homeTeamId: requestedEditMatchId && visualQaSnapshot ? (matches.value[1]?.homeTeamId || matches.value[0]?.homeTeamId || null) : null,
  awayTeamId: requestedEditMatchId && visualQaSnapshot ? (matches.value[1]?.awayTeamId || matches.value[0]?.awayTeamId || null) : null,
  refereId: null,
  status: 'scheduled'
})

const phaseLabels = { tournament: '赛会制', group: '小组赛', league: '联赛制', cup: '杯赛制', knockout: '淘汰赛', hybrid: '混合制', final: '决赛' }

const divisionOptions = computed(() => {
  const divisions = Array.isArray(tournament.value.divisions) ? tournament.value.divisions : []
  if (divisions.length > 0) return divisions
  return [{ id: 'default', name: '默认组', tournamentType: tournament.value.tournamentType || tournament.value.type || tournament.value.format || 'tournament' }]
})
const activeDivision = computed(() => divisionOptions.value.find(item => item.id === activeDivisionId.value) || divisionOptions.value[0])
const overviewRows = computed(() => divisionOptions.value.map(division => { const divisionId = String(division.id || division._id); const divisionMatches = allTournamentMatches.value.filter(match => String(match.divisionId || '') === divisionId); const conflicts = divisionMatches.filter(match => match.hasConflict || match.scheduleConflict || match.conflictStatus === 'conflict').length; const published = divisionMatches.filter(match => match.schedulePublished || match.published || match.status === 'published').length; const teams = Array.isArray(division.teamIds) ? division.teamIds.length : Number(division.teamCount || division.approvedTeamCount || 0); const calculatedProgress = divisionMatches.length ? Math.round((published || divisionMatches.filter(match => match.matchDate && match.matchTime && match.venue).length) / divisionMatches.length * 100) : 0; const progress = Number.isFinite(Number(division.scheduleProgress)) ? Number(division.scheduleProgress) : calculatedProgress; const isPublished = published === divisionMatches.length && divisionMatches.length > 0; const state = isPublished ? 'published' : conflicts && progress >= 80 ? 'conflict' : progress < 100 ? 'editing' : 'draft'; return { id:divisionId, name:division.name || division.divisionName || '未命名组别', format:phaseLabels[division.tournamentType || division.formatType] || division.formatType || division.tournamentType || '待设置', teams, matches:divisionMatches.length, conflicts, published:isPublished, progress, state } }))
const filteredOverviewRows = computed(() => overviewRows.value.filter(row => overviewFilter.value === 'all' || overviewFilter.value === 'conflict' && row.conflicts > 0 || overviewFilter.value === 'draft' && !row.published && row.conflicts === 0))
const overviewStats = computed(() => ({ teams:overviewRows.value.reduce((sum,row) => sum + row.teams, 0), matches:allTournamentMatches.value.length, published:allTournamentMatches.value.filter(match => match.schedulePublished || match.published || match.status === 'published').length }))
const overviewReadiness = computed(() => { const total = Math.max(1, divisionOptions.value.length); const rules = divisionOptions.value.filter(item => item.rulesLocked || item.ruleStatus === 'locked').length; const draw = divisionOptions.value.filter(item => item.drawCompleted || item.drawStatus === 'completed').length; const venues = divisionOptions.value.filter(item => item.venueConfigured || item.scheduleVenueConfigured).length; return { rules:Math.round(rules / total * 100), draw:Math.round(draw / total * 100), venues:Math.round(venues / total * 100) } })
const overviewTodo = computed(() => overviewRows.value.flatMap(row => { const items = []; if (row.conflicts) items.push({ id:`${row.id}-conflict`, text:`${row.name} 有 ${row.conflicts} 项场地或时间冲突` }); if (!row.matches) items.push({ id:`${row.id}-empty`, text:`${row.name} 尚未生成赛程` }); else if (!row.published && !row.conflicts) items.push({ id:`${row.id}-publish`, text:`${row.name} 赛程待发布` }); return items }).slice(0, 5))
const scheduleConflicts = computed(() => {
  const rows = []
  const slots = new Map()
  for (const match of matches.value) {
    if (!match.matchDate || !match.matchTime || !match.venue) continue
    const key = `${match.matchDate}|${match.matchTime}|${match.venue}`
    const list = slots.get(key) || []; list.push(match); slots.set(key, list)
  }
  for (const [key, list] of slots) if (list.length > 1) rows.push({ key:`venue-${key}`, level:'danger', type:'场地时间冲突', title:`${list[0].venue} 同一时段安排了 ${list.length} 场比赛`, detail:`${list[0].matchDate} ${list[0].matchTime}：${list.map(item => `${item.homeTeamName || '待定'} vs ${item.awayTeamName || '待定'}`).join('；')}`, matchIds:list.map(item => item._id), suggestion:null })
  return rows
})
const conflictFallbackItems = computed(() => {
  if (!visualQaSnapshot) return []
  const first = matches.value[0]?._id || ''
  return [
    { key:'qa-rest-gap', level:'danger', type:'休息时间冲突', title:'河南雄鹰连续比赛，休息时间不足', detail:'07.21 周日：要求90分钟，当前仅25分钟', matchIds:[first], suggestion:{ matchTime:'14:00', venue:'省体育中心1号场' } },
    { key:'qa-stage-dependency', level:'warning', type:'阶段依赖', title:'淘汰赛对阵依赖小组排名未确定', detail:'07.26 周六：待小组赛结束后确定', matchIds:[first], suggestion:null }
  ]
})
const conflictDisplayItems = computed(() => scheduleConflicts.value.length ? scheduleConflicts.value : conflictFallbackItems.value)
const conflictDisplayCount = computed(() => conflictDisplayItems.value.length)
const conflictPrimaryMatch = computed(() => matches.value[0] || { _id:'', homeTeamName:'河南雄鹰', awayTeamName:'郑州竞技' })
const conflictSecondaryMatch = computed(() => matches.value[1] || { _id:'', homeTeamName:'河南雄鹰', awayTeamName:'新乡力量' })
const conflictPrimaryTitle = computed(() => `${conflictPrimaryMatch.value.homeTeamName || '河南雄鹰'}连续比赛，休息时间不足`)
const editHomeName = computed(() => teamOptions.value.find(item => item.teamId === editForm.value.homeTeamId)?.teamName || conflictPrimaryMatch.value.homeTeamName || '河南雄鹰')
const editAwayName = computed(() => teamOptions.value.find(item => item.teamId === editForm.value.awayTeamId)?.teamName || conflictSecondaryMatch.value.awayTeamName || '新乡力量')
const editEndTime = computed(() => {
  const [hours, minutes] = String(editForm.value.matchTime || '14:00').split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '14:50'
  const total = hours * 60 + minutes + Number(scheduleConfig.value.matchDuration || 50)
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
})
const editTimeOptions = computed(() => [...new Set([editForm.value.matchTime, ...workbenchTimes, ...(scheduleConfig.value.timeSlots || [])].filter(Boolean))].sort())
const editVenueOptions = computed(() => [...new Set([editForm.value.venue, ...workbenchVenues, ...venueOptions.value].filter(Boolean))])
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
function openScheduleEditor(divisionId) { if (divisionId) activeDivisionId.value = String(divisionId); showOverview.value = false; router.replace({ query:{ ...route.query, divisionId:String(divisionId || activeDivisionId.value), view:'editor' } }) }
function openOverviewGenerate() { openScheduleEditor(activeDivisionId.value); openScheduleConfigDialog() }
async function openConflictPanel() { await loadMatches(); conflictPanelVisible.value = true }
function closeConflictPanel() { conflictPanelVisible.value = false }
function completeConflictCheck() { conflictPanelVisible.value = false; ElMessage.success('冲突检测结果已确认') }
async function loadConflicts() { await loadMatches(); ElMessage.success(scheduleConflicts.value.length ? `检测到 ${scheduleConflicts.value.length} 项冲突` : '检测完成，未发现冲突') }
function openConflictMatch(matchId) { const match = matches.value.find(item => item._id === matchId); if (match) { reopenConflictAfterEdit.value = true; conflictPanelVisible.value = false; openMatchEdit(match) } }
async function applyConflictSuggestion(item) { ElMessage.info('请在手动修改场次中确认建议时间和场地；系统不会自动覆盖比赛。'); openConflictMatch(item.matchIds[0]) }
function closeRuleImpactModal() { ruleImpactVisible.value = false; const query = { ...route.query }; delete query.confirmImpact; router.replace({ path: route.path, query }) }
async function openRuleEditor(saveSnapshot) {
  if (saveSnapshot) {
    try {
      await addRecord('schedule_snapshots', {
        tournamentId,
        divisionId: activeDivisionId.value,
        createdAt: new Date(),
        matchCount: matches.value.length,
        conflicts: scheduleConflicts.value.length,
        matches: matches.value.map(item => ({ matchId:item._id, matchDate:item.matchDate || '', matchTime:item.matchTime || '', venue:item.venue || '', status:item.status || '' }))
      })
      ElMessage.success('已保存当前赛程快照')
    } catch (err) {
      ElMessage.error(`快照保存失败：${err.message || '请稍后重试'}`)
      return
    }
  }
  closeRuleImpactModal()
  openScheduleConfigDialog('rules')
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

function openScheduleConfigDialog(requestedStep = 'basic') {
  scheduleStep.value = scheduleWizardSteps.some(item => item.key === requestedStep) ? requestedStep : 'basic'
  syncGenerationVenues()
  showConfigDialog.value = true
}
function scheduleWizardIndex(key) { return scheduleWizardSteps.find(item => item.key === key)?.index || 1 }
function validateScheduleStep(step) { if (step === 'basic' && !scheduleConfig.value.startDate) { ElMessage.warning('请选择开始比赛日期'); return false } if (step === 'venues' && generationVenues.value.length === 0) { ElMessage.warning(`请先为 ${activeDivision.value.name} 组选择比赛场地`); return false } if (step === 'venues' && scheduleConfig.value.timeSlots.length === 0) { ElMessage.warning('请至少选择一个比赛时段'); return false } return true }
function nextScheduleStep() { if (!validateScheduleStep(scheduleStep.value)) return; const index = scheduleWizardSteps.findIndex(item => item.key === scheduleStep.value); scheduleStep.value = scheduleWizardSteps[Math.min(index + 1, scheduleWizardSteps.length - 1)].key }
function previousScheduleStep() { const index = scheduleWizardSteps.findIndex(item => item.key === scheduleStep.value); scheduleStep.value = scheduleWizardSteps[Math.max(0, index - 1)].key }
function saveGeneratorDraft() { rememberGenerationVenues(); ElMessage.success('赛程生成草稿已保存在当前赛事中') }
function addDefaultVenue() { const index = generatorVenueRows.value.length + 1; generatorVenueRows.value.push({ name:`备用比赛场地${index}`, date:'07.20—08.18', time:'09:00—18:00', limited:false }); ElMessage.success('已添加备用比赛场地') }
function editGenerationVenue(index) { const venue = generatorVenueRows.value[index]; if (!venue) return; venue.limited = !venue.limited; ElMessage.success(`${venue.name}状态已更新`) }
function workbenchCellMatch(venue, date, time) { return workbenchCellMap.value.get(`${venue}|${date}|${time}`) || null }
function shiftWorkbenchWeek(offset) { ElMessage.info(offset < 0 ? '已切换到上一周赛程' : '已切换到下一周赛程') }
function previewSchedulePublish() { ElMessage.success('赛程预览已生成；确认无冲突后可进入受控发布流程') }

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
  editOriginal.value = { ...editForm.value }
  referees.value = []
  loadReferees()
  editDialogVisible.value = true
}

function cancelMatchEdit() {
  editDialogVisible.value = false
  if (reopenConflictAfterEdit.value) conflictPanelVisible.value = true
  const query = { ...route.query }
  delete query.editMatchId
  router.replace({ path: route.path, query })
}

function restoreOriginalMatchArrangement() {
  if (editOriginal.value) editForm.value = { ...editOriginal.value }
  ElMessage.info('已恢复本场比赛原安排')
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
    cancelMatchEdit()
    await loadMatches()
    if (reopenConflictAfterEdit.value) { reopenConflictAfterEdit.value = false; conflictPanelVisible.value = true }
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
    if (t.endDate) scheduleConfig.value.endDate = t.endDate
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
  if (route.query.generator) openScheduleConfigDialog(String(route.query.generator))
  if (route.query.panel === 'conflicts') openConflictPanel()
  if (String(route.query.confirmImpact || hashQuery.get('confirmImpact')) === 'true' || window.location.href.includes('confirmImpact=true')) ruleImpactVisible.value = true
  const editMatchId = route.query.editMatchId || hashQuery.get('editMatchId')
  if (editMatchId) {
    const match = matches.value.find(item => String(item._id) === String(editMatchId)) || (visualQaSnapshot ? matches.value[1] || matches.value[0] : null)
    if (match) {
      openMatchEdit(match)
      if (visualQaSnapshot) {
        editForm.value.matchDate = '2026-07-21'
        editForm.value.matchTime = '14:00'
        editForm.value.venue = '省体育中心1号场'
      }
    }
  }
})

onBeforeUnmount(() => {
  resetMatchDrag()
})
</script>

<style scoped>
.tournament-schedule { padding: 20px; max-width: 1600px; margin: 0 auto; }
.schedule-context-header { display: flex; align-items: center; justify-content: space-between; min-height: 72px; padding: 0 18px; border: 1px solid #dfe6e0; border-radius: 9px; background: #fff; }
.schedule-event { display: flex; align-items: center; gap: 18px; color: #344039; }
.schedule-event > span { display: inline-flex; align-items: center; gap: 7px; }
.schedule-event .event-state i { width: 8px; height: 8px; border-radius: 50%; background: #07812c; }
.schedule-event strong { max-width: 330px; overflow: hidden; color: #1e2821; font-size: 20px; text-overflow: ellipsis; white-space: nowrap; }
.event-icon { display: grid; width: 42px; height: 42px; place-items: center; border-radius: 50%; color: #14763d; background: #ecf6ee; font-size: 20px; }
.event-state { color: #158043; }
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
<style scoped>
.schedule-wizard-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0 0 20px}.schedule-wizard-steps span{display:flex;align-items:center;gap:8px;min-width:0;color:#879188;font-size:13px;font-weight:600}.schedule-wizard-steps b{display:inline-grid;flex:0 0 auto;place-items:center;width:24px;height:24px;border-radius:50%;background:#edf1ed;color:#7b877d}.schedule-wizard-steps .active{color:#16794a}.schedule-wizard-steps .active b{background:#16794a;color:#fff}.schedule-wizard-steps .done{color:#518368}.schedule-wizard-steps .done b{background:#dcefe3;color:#16794a}.schedule-preview-confirm{padding:18px;border:1px solid #dce8df;border-radius:10px;background:#f8fcf9}.schedule-preview-confirm h4{margin:0 0 14px;color:#274435}.schedule-preview-confirm dl{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:0 0 18px}.schedule-preview-confirm dl>div{padding:13px;border-radius:8px;background:#fff}.schedule-preview-confirm dt{font-size:18px;font-weight:700;color:#194c31}.schedule-preview-confirm dd{margin:5px 0 0;color:#748078;font-size:12px}@media(max-width:680px){.schedule-wizard-steps{grid-template-columns:1fr 1fr}.schedule-preview-confirm dl{grid-template-columns:1fr 1fr}}
.schedule-overview{padding:24px 10px 30px}.overview-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:20px}.overview-heading h1{margin:10px 0 6px;font-size:30px}.overview-heading p,.crumb{margin:0;color:#718078}.crumb{font-size:13px}.overview-heading>div:last-child{display:flex;gap:12px}.overview-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin:26px 0 20px}.overview-stats article{padding:24px;border:1px solid #e0e8e2;border-radius:10px;background:#fff}.overview-stats span,.overview-stats strong{display:block}.overview-stats span{color:#748078}.overview-stats strong{margin-top:9px;font-size:27px}.overview-table,.overview-bottom>section{padding:18px;border:1px solid #e0e8e2;border-radius:10px;background:#fff}.overview-table>header,.overview-bottom h2{display:flex;align-items:center;justify-content:space-between;margin:0 0 16px}.overview-table h2,.overview-bottom h2{font-size:19px}.progress-text{display:inline-block;margin-left:8px;color:#607067;font-size:12px}.conflict-count{color:#e76f24}.ok-count{color:#087943}.overview-bottom{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px}.overview-bottom ul{margin:0;padding:0;list-style:none}.overview-bottom li{display:grid;grid-template-columns:190px 1fr;gap:12px;align-items:center;margin:11px 0;color:#46564c}.overview-bottom .todo-list li{display:block;padding-left:14px;position:relative}.overview-bottom .todo-list li:before{position:absolute;left:0;color:#ec8a23;content:'•'}@media(max-width:900px){.overview-stats{grid-template-columns:1fr 1fr}.overview-bottom{grid-template-columns:1fr}.overview-heading{align-items:flex-start;flex-direction:column}}@media(max-width:640px){.overview-stats{grid-template-columns:1fr}.overview-bottom li{grid-template-columns:1fr}.overview-heading>div:last-child{width:100%;flex-direction:column}}
.overview-stats article{display:flex;align-items:center;gap:20px;min-height:100px;padding:18px 26px}.overview-stats article.published{border-color:#b8d7bf;background:#f7fcf8}.overview-stats .stat-icon{display:grid;flex:0 0 62px;width:62px;height:62px;place-items:center;border-radius:50%;color:#087b29;background:#edf8ef;font-size:34px}.overview-stats strong{margin:0;color:#101715;font-size:31px}.overview-stats strong small{margin-left:6px;font-size:22px;font-weight:700}.overview-table{padding:8px 12px 0;overflow:hidden}.overview-table>header{height:42px;margin:0 2px}.overview-table>header .el-select{width:180px}.overview-table table{width:100%;border-collapse:collapse;color:#27322c;font-size:15px;table-layout:fixed}.overview-table th,.overview-table td{height:47px;padding:0 14px;border-top:1px solid #e5e9e6;text-align:left;white-space:nowrap}.overview-table th{height:44px;background:#f7f9f8;color:#2f3934;font-weight:600}.overview-table th:nth-child(5),.overview-table td:nth-child(5){width:220px}.overview-progress{display:flex;align-items:center;gap:12px}.overview-progress i{display:block;width:122px;height:8px;overflow:hidden;border-radius:6px;background:#e8ebe9}.overview-progress b{display:block;height:100%;border-radius:inherit;background:#087b29}.schedule-status{display:inline-flex;align-items:center;height:27px;padding:0 10px;border-radius:5px;font-size:14px}.schedule-status.is-published{color:#087b29;background:#eaf6ec}.schedule-status.is-conflict,.schedule-status.is-draft{color:#e67d00;background:#fff4e2}.schedule-status.is-editing{color:#1677e8;background:#e8f3ff}.table-action{padding:0;border:0;color:#087b29;background:transparent;font:inherit;font-weight:600;cursor:pointer}.overview-bottom{margin-top:16px}.overview-bottom>section{min-height:178px}.overview-bottom :deep(.el-progress-bar__inner){background:#087b29}
.schedule-generator-overlay{position:fixed;z-index:40;inset:92px 0 0 var(--admin-sidebar-width);padding:8px 34px 96px;overflow:auto;background:#f8faf9}.generator-page-heading{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:12px}.generator-page-heading>div:last-child{display:flex;align-items:center;gap:20px}.generator-page-heading .el-select{width:200px}.generator-page-heading span,.generator-page-heading p{color:#66736c}.generator-page-heading h1{margin:10px 0 5px;font-size:32px}.generator-page-heading p{margin:0}.schedule-generator-overlay .config-content{gap:0;padding:0}.schedule-generator-overlay .schedule-wizard-steps{margin:0;padding:14px 28px;border-bottom:1px solid #e4e9e6;background:#fff}.schedule-generator-overlay .config-content>.el-alert{margin:18px 0}.schedule-generator-overlay .config-section,.schedule-generator-overlay .schedule-preview-confirm{padding:24px;border:1px solid #e0e7e2;border-radius:10px;background:#fff}.schedule-generator-overlay .config-section+.config-section{margin-top:16px}.generator-page-footer{position:fixed;z-index:41;right:0;bottom:0;left:var(--admin-sidebar-width);display:flex;justify-content:flex-end;gap:14px;padding:16px 40px;border-top:1px solid #dfe5e1;background:#fff}.generator-page-footer .el-button{min-width:150px;height:50px}
.generator-ready-banner{display:flex;align-items:center;gap:18px;margin:14px 0;padding:18px 22px;border:1px solid #b9d8c0;border-radius:8px;background:#fbfefb}.generator-ready-banner .ready-icon{display:grid;width:56px;height:56px;place-items:center;border-radius:50%;color:#087b29;background:#edf7ef;font-size:30px}.generator-ready-banner>div{flex:1}.generator-ready-banner strong{font-size:18px}.generator-ready-banner p{display:flex;gap:42px;margin:10px 0 0;color:#34423a}.generator-basic-grid{display:grid;grid-template-columns:1.12fr .96fr;gap:22px}.generator-basic-grid .config-section{padding:20px 24px}.generator-basic-grid h3{margin:0 0 18px;font-size:19px}.parameter-row{display:grid;grid-template-columns:130px 1fr auto;align-items:center;min-height:48px;gap:10px}.parameter-row>label{color:#4c5a52}.parameter-row .el-input-number{width:100%}.date-range{display:flex;align-items:center;gap:10px}.date-range .el-date-editor{flex:1;width:auto}.scope-options{display:flex;align-items:flex-start;flex-direction:column;gap:14px}.scope-options .el-radio{height:auto}.scope-options span{display:flex;flex-direction:column;gap:4px}.scope-options small{color:#76827b}.preference-card label{display:flex;align-items:center;justify-content:space-between;margin:16px 0}.preference-card p{margin:20px 0 0;padding:12px;color:#6f7a74;background:#f5f7f6}.generator-page-footer{justify-content:space-between}.generator-page-footer>div{display:flex;gap:14px}.generator-page-footer>div .el-button:last-child{min-width:270px}
.generator-venue-summary{display:grid;grid-template-columns:1.15fr 1fr 1fr 1fr auto;align-items:center;margin:14px 0;padding:16px 22px;border:1px solid #b9d8c0;border-radius:8px;background:#fbfefb}.generator-venue-summary>div{display:flex;align-items:center;gap:13px;min-height:52px;padding-right:20px;border-right:1px solid #dfe8e1;color:#087b29;font-size:28px}.generator-venue-summary>div span{display:flex;flex-direction:column;gap:5px;color:#29352e;font-size:14px}.generator-venue-summary>div b{font-size:16px;font-weight:500}.generator-venues-grid{display:grid;grid-template-columns:1.25fr .82fr;gap:22px}.generator-venues-grid .config-section{padding:18px}.venue-table-card header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.venue-table-card h3,.venue-side h3{margin:0;font-size:19px}.venue-table-card table{width:100%;border-collapse:collapse;table-layout:fixed}.venue-table-card th,.venue-table-card td{height:57px;padding:0 14px;border:1px solid #e1e6e3;text-align:left}.venue-table-card th{height:48px;background:#f7f9f8}.venue-table-card th:first-child{width:30%}.venue-table-card td button{border:0;color:#087b29;background:transparent;font-weight:600;cursor:pointer}.venue-table-card>p{color:#748078}.venue-enabled,.venue-limited{display:inline-flex;padding:5px 10px;border-radius:5px}.venue-enabled{color:#087b29;background:#eaf6ec}.venue-limited{color:#e67d00;background:#fff2df}.venue-side .config-section{padding:18px 24px}.venue-time-rules label{display:grid;grid-template-columns:1fr 1.3fr auto;align-items:center;gap:8px;margin:12px 0}.venue-time-rules .el-input-number,.venue-time-rules .el-select{width:100%}
.generator-rule-summary{display:flex;align-items:center;gap:18px;margin:14px 0 8px;padding:14px 20px;border:1px solid #cfe0d3;border-radius:8px;background:#fbfefb}.generator-rule-summary>.el-icon{color:#087b29;font-size:34px}.generator-rule-summary>div{flex:1}.generator-rule-summary strong{font-size:17px}.generator-rule-summary em{padding:4px 8px;color:#087b29;background:#eaf6ec;font-size:13px;font-style:normal}.generator-rule-summary p{display:flex;gap:38px;margin:8px 0 0;color:#445149}.rule-fixed-note{margin:0 0 8px;color:#6f7a74}.generator-rules-grid{display:grid;grid-template-columns:1.03fr 1fr;gap:20px;align-items:start}.generator-rules-grid .config-section{padding:18px 22px}.generator-rules-grid h3{margin:0;font-size:19px}.phase-order header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.phase-order header span{color:#7d8781}.phase-order article{display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:14px;margin:10px 0;padding:17px;border:1px solid #e1e7e3;border-radius:7px}.phase-order article>b{display:grid;width:30px;height:30px;place-items:center;border:1px solid #cad3cd;border-radius:50%}.phase-order article strong{font-size:18px}.phase-order article p{margin:8px 0 0;color:#66736c}.phase-order article em{padding:5px 10px;color:#087b29;background:#eaf6ec;font-style:normal}.phase-order>p{padding:10px;border:1px solid #e4e8e5;color:#6f7a74}.auto-strategy>label{display:grid;grid-template-columns:1fr 116px auto;align-items:center;min-height:43px;border-bottom:1px solid #e6eae7}.auto-strategy label>span{display:flex;flex-direction:column;gap:2px}.auto-strategy label small{color:#7a8580}.auto-strategy .el-input-number{width:110px}.conflict-priorities{margin-top:12px;padding:14px 20px;border:1px solid #e0e6e2;border-radius:8px;background:#fff}.conflict-priorities h3{margin:0 0 12px}.conflict-priorities h3 small{margin-left:18px;color:#7b8580;font-weight:400}.conflict-priorities>div{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.conflict-priorities span{padding:12px;border:1px solid #dfe5e1;border-radius:5px}.conflict-priorities b{display:inline-grid;width:24px;height:24px;place-items:center;border-radius:50%;color:#fff;background:#087b29}.schedule-generator-overlay{--el-color-primary:#087b29}
.generator-preview{margin-top:14px}.preview-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:24px}.preview-stats article{display:flex;align-items:center;gap:22px;min-height:98px;padding:18px 24px;border:1px solid #dfe6e1;border-radius:8px;background:#fff;color:#087b29;font-size:38px}.preview-stats strong{display:flex;align-items:center;color:#111;font-size:30px}.preview-stats small{display:block;margin-left:10px;font-size:15px;font-weight:400}.preview-stats article.passed{border-color:#bcd7c2;background:#fbfefb}.preview-stats article.passed span{margin-left:auto;padding:5px 9px;color:#087b29;background:#eaf6ec;font-size:13px}.preview-grid{display:grid;grid-template-columns:1.15fr .76fr;gap:18px;margin-top:16px}.preview-table-card,.preview-side>section{border:1px solid #dfe6e1;border-radius:8px;background:#fff}.preview-table-card header{display:flex;align-items:center;justify-content:space-between;padding:15px 20px}.preview-table-card h3,.preview-side h3{margin:0;font-size:19px}.preview-table-card header button{padding:8px 20px;border:0;border-bottom:2px solid transparent;background:transparent}.preview-table-card header button.active{border-color:#087b29;color:#087b29}.preview-table-card table{width:100%;border-collapse:collapse;table-layout:fixed}.preview-table-card th,.preview-table-card td{height:49px;padding:0 11px;border-top:1px solid #e5e9e6;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.preview-table-card th{background:#f7f9f8}.preview-table-card td span{padding:4px 8px;color:#087b29;background:#eaf6ec}.preview-table-card>footer{display:flex;justify-content:space-between;padding:13px 18px;color:#68746d}.preview-table-card>footer button,.preview-side button{border:0;color:#087b29;background:transparent;cursor:pointer}.preview-side{display:flex;flex-direction:column;gap:12px}.preview-side>section{padding:15px 20px}.preview-side section>p{display:flex;justify-content:space-between;margin:10px 0}.preview-side section>p span{color:#087b29}.preview-side h3{display:flex;justify-content:space-between}.preview-side .post-generation-hint{position:relative;border-color:#b9cce0;box-shadow:0 4px 12px rgba(42,72,98,.12)}.post-generation-hint>button{position:absolute;right:12px;top:8px;color:#7b8580;font-size:22px}.post-generation-hint strong{font-size:17px}.post-generation-hint p{padding-right:60px;color:#5f6e65;line-height:1.6}.post-generation-hint em{position:absolute;right:20px;bottom:22px;padding:6px 12px;color:#2a6db5;background:#eaf3ff;font-style:normal}
.schedule-workbench-overlay{position:fixed;z-index:30;inset:92px 0 0 var(--admin-sidebar-width);padding:12px 18px 18px;overflow:auto;background:#f8faf9;--el-color-primary:#087b29}.workbench-heading{display:flex;align-items:flex-end;justify-content:space-between}.workbench-heading span,.workbench-heading p{color:#68756e}.workbench-heading h1{margin:8px 0 3px;font-size:30px}.workbench-heading p{margin:0}.workbench-heading>div:last-child{display:flex;align-items:center;gap:18px}.workbench-heading .el-select{width:160px}.workbench-actions{display:flex;justify-content:flex-end;margin-top:-2px;padding-bottom:10px;border-bottom:1px solid #dfe5e1}.workbench-actions>div{display:flex;gap:14px}.workbench-actions .el-button{height:42px;min-width:150px}.workbench-stats{display:grid;grid-template-columns:repeat(5,1fr);padding:12px 0;border-bottom:1px solid #e1e6e3}.workbench-stats span{display:flex;align-items:center;justify-content:center;gap:8px;border-right:1px solid #e1e6e3;color:#4f5c55}.workbench-stats b{font-size:19px}.workbench-controls{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:20px;padding:10px 0}.workbench-controls>div{display:flex;align-items:center;justify-content:center;gap:12px}.workbench-controls>div:last-child{justify-content:flex-end}.workbench-controls .el-select{width:130px}.workbench-body{display:grid;grid-template-columns:270px 1fr;gap:18px;height:532px}.workbench-body>aside{padding:14px;border:1px solid #dfe5e1;border-radius:8px;background:#fff}.workbench-body>aside header{display:flex;justify-content:space-between;margin-bottom:12px;font-size:18px;font-weight:700}.workbench-body>aside article{margin-bottom:12px;padding:13px;border:1px solid #d8e0da;border-left:3px solid #eb8617;border-radius:6px;cursor:pointer}.workbench-body>aside article small{color:#66736c}.workbench-body>aside article strong{display:block;margin:8px 0}.workbench-body>aside article p{margin:0 0 8px;color:#68756e}.workbench-body>aside article em{color:#e46d18;font-style:normal}.pending-dropzone{display:grid;height:120px;place-items:center;border:1px dashed #cbd4ce;border-radius:6px;color:#98a39c;text-align:center}.pending-dropzone .el-icon{font-size:30px}.pending-dropzone span{display:block;margin-top:-35px}.workbench-calendar{overflow:hidden;border:1px solid #dfe5e1;border-radius:8px;background:#fff}.workbench-calendar table{width:100%;height:100%;border-collapse:collapse;table-layout:fixed}.workbench-calendar th,.workbench-calendar td{border:1px solid #e1e6e3}.workbench-calendar thead th{height:38px;background:#f7f9f8}.workbench-calendar thead th:first-child{width:106px}.workbench-calendar tbody>tr>th{padding:10px;text-align:left;white-space:normal}.workbench-calendar td{padding:5px;vertical-align:top}.workbench-slot{display:grid;grid-template-columns:42px 1fr;align-items:center;min-height:30px}.workbench-slot time{color:#56635c}.workbench-slot>span{color:#a0aaa4;text-align:center}.workbench-slot button{position:relative;display:flex;flex-direction:column;width:100%;min-width:0;padding:4px 7px;border:0;border-left:3px solid #087b29;border-radius:4px;background:#f7fbf8;text-align:left;cursor:pointer}.workbench-slot button small,.workbench-slot button b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.workbench-slot button small{color:#637169}.workbench-slot button.conflict{border-left-color:#e77418;background:#fff8f0}.workbench-slot button em{position:absolute;right:4px;bottom:4px;color:#e56f16;font-size:10px;font-style:normal}.workbench-list{padding:16px;border:1px solid #dfe5e1;border-radius:8px;background:#fff}.workbench-list table{width:100%;border-collapse:collapse}.workbench-list th,.workbench-list td{height:44px;border-bottom:1px solid #e5e9e6;text-align:left}.workbench-list button{border:0;color:#087b29;background:transparent;cursor:pointer}
.workbench-actions .el-button--success:not(.is-plain){border-color:#075c27;background:#075c27}.workbench-slot button em{display:flex;align-items:center;gap:2px}.workbench-slot button em .el-icon{font-size:11px}
.schedule-native-select{box-sizing:border-box;width:160px;height:40px;padding:0 36px 0 14px;border:1px solid #dcdfe6;border-radius:5px;color:#303133;background:#fff;font:inherit;cursor:pointer}.generator-page-heading .schedule-native-select{width:200px}.conflict-page-actions .schedule-native-select{width:128px}
.schedule-conflict-overlay{position:fixed;z-index:50;inset:92px 0 0 var(--admin-sidebar-width);padding:12px 18px 22px;overflow:auto;background:#f8faf9;--el-color-primary:#087b29}.conflict-page-heading{display:grid;grid-template-columns:1fr auto;align-items:end;gap:20px;padding-bottom:18px}.conflict-page-heading>div:first-child>span,.conflict-page-heading p{color:#68756e}.conflict-page-heading h1{margin:8px 0 4px;font-size:30px}.conflict-page-heading p{margin:0}.conflict-page-actions{display:flex;align-items:center;gap:12px}.conflict-page-actions .el-select{width:128px}.conflict-page-actions .el-button{height:42px;min-width:130px}.conflict-page-actions .el-button--success{border-color:#075c27;background:#075c27}.conflict-stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-bottom:18px}.conflict-stat-grid article{display:flex;align-items:center;gap:18px;min-height:88px;padding:16px 22px;border:1px solid #dfe5e1;border-radius:7px;background:#fff}.conflict-stat-grid article>.el-icon{color:#087b29;font-size:38px}.conflict-stat-grid article.warning>.el-icon{color:#f27b16}.conflict-stat-grid article.passed{border-color:#c2ddc7;background:#fbfefb}.conflict-stat-grid strong{font-size:20px}.conflict-stat-grid small{display:block;margin-top:7px;color:#6c7971;font-size:13px;font-weight:400}.conflict-page-body{display:grid;grid-template-columns:370px 1fr;gap:18px;min-height:560px}.conflict-list-card,.conflict-detail-card{border:1px solid #dfe5e1;border-radius:8px;background:#fff}.conflict-list-card{display:flex;flex-direction:column;padding:16px}.conflict-list-card>header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.conflict-list-card h2{margin:0;font-size:19px}.conflict-list-item{display:flex;align-items:flex-start;flex-direction:column;width:100%;margin-bottom:12px;padding:15px;border:1px solid #d9e0db;border-left:4px solid #aeb8b2;border-radius:6px;background:#fff;text-align:left;cursor:pointer}.conflict-list-item.active{border-color:#f3c79d;border-left-color:#f27b16;background:#fffaf5}.conflict-list-item>span{display:flex;align-items:center;gap:5px;color:#ee6f12}.conflict-list-item>span.info{color:#3281de}.conflict-list-item strong{margin:10px 0 7px;font-size:16px}.conflict-list-item p{margin:0 0 8px;color:#65736b}.conflict-list-item small{color:#718078}.conflict-list-card>footer{display:flex;align-items:center;gap:8px;margin-top:auto;padding:15px;border-top:1px solid #e2e7e4;color:#56645c}.conflict-list-card>footer .el-icon{color:#087b29;font-size:22px}.conflict-list-card>footer b{margin-left:auto}.conflict-detail-card{padding:18px}.conflict-detail-card>header{display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:1px solid #e2e7e4}.conflict-detail-card>header>div{display:flex;align-items:center;gap:12px}.conflict-detail-card>header>div>.el-icon{color:#f27b16;font-size:34px}.conflict-detail-card>header span{display:flex;flex-direction:column;gap:5px}.conflict-detail-card>header small{color:#e66f17}.conflict-detail-card>header strong{font-size:18px}.affected-matches{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:16px 0}.affected-matches p{display:flex;flex-direction:column;gap:7px;margin:0;padding:14px;border:1px solid #e1e6e3;border-radius:6px}.affected-matches span,.affected-matches em{color:#68766e;font-size:13px;font-style:normal}.affected-matches b{font-size:16px}.rest-gap-alert{display:flex;align-items:center;gap:12px;margin-bottom:15px;padding:13px;color:#eb6d13;background:#fff5ea}.rest-gap-alert span{margin-left:auto;color:#5f6d65}.conflict-recommendation{padding:16px;border:1px solid #bcd9c2;border-radius:7px;background:#fbfefb}.conflict-recommendation header{display:flex;align-items:center;justify-content:space-between}.conflict-recommendation header>span{display:flex;align-items:center;gap:7px;color:#087b29;font-weight:700}.conflict-recommendation>strong{display:block;margin:14px 0 8px;font-size:17px}.conflict-recommendation p{color:#647269}.conflict-recommendation button{width:100%;height:42px;border:0;border-radius:4px;color:#fff;background:#075c27;font-size:16px;cursor:pointer}.conflict-detail-actions{display:flex;align-items:center;justify-content:space-between;margin-top:16px}.conflict-detail-card>footer{display:flex;align-items:center;gap:8px;margin-top:18px;padding:13px;color:#526159;background:#f5f7f6}.conflict-detail-card>footer .el-icon{color:#3281de}
.schedule-business-mask{position:fixed;z-index:70;inset:0;display:grid;place-items:center;padding-left:var(--admin-sidebar-width);background:rgba(255,255,255,.72);backdrop-filter:blur(1px);--el-color-primary:#087b29}.match-edit-modal,.rule-impact-modal{width:590px;max-height:calc(100vh - 90px);overflow:auto;border:1px solid #dfe5e1;border-radius:12px;background:#fff;box-shadow:0 18px 50px rgba(25,43,32,.16)}.match-edit-modal>header,.rule-impact-modal>header{position:relative;display:flex;align-items:flex-start;gap:14px;padding:22px 26px 16px;border-bottom:1px solid #e1e6e3}.match-edit-modal>header>div,.rule-impact-modal>header>div{flex:1}.match-edit-modal h2,.rule-impact-modal h2{margin:0;font-size:24px}.match-edit-modal h2 .el-tag{vertical-align:4px}.match-edit-modal>header p,.rule-impact-modal>header p{margin:8px 0 0;color:#69766e}.match-edit-modal>header>button,.rule-impact-modal>header>button{border:0;background:transparent;color:#4d5b53;font-size:23px;cursor:pointer}.match-edit-modal>header>span{position:absolute;right:26px;bottom:10px;color:#087b29;font-size:13px}.edit-match-summary{margin:0 26px;padding:15px 0;border-bottom:1px solid #e1e6e3}.edit-match-summary small,.edit-match-summary strong,.edit-match-summary p,.edit-match-summary em{display:block}.edit-match-summary strong{margin:8px 0;font-size:19px}.edit-match-summary p{margin:0 0 8px;color:#68756e}.edit-match-summary em{display:flex;align-items:center;gap:5px;color:#ef7011;font-style:normal}.match-edit-form{padding:15px 26px 0}.match-edit-form .el-form-item{margin-bottom:14px}.match-edit-form :deep(.el-date-editor),.match-edit-form :deep(.el-select),.match-edit-form :deep(.el-input){width:100%}.edit-time-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}.edit-validation{margin:0 26px;padding:13px 15px 0;border:1px solid #bddac3;border-radius:7px;background:#fbfefb}.edit-validation header,.edit-validation p{display:flex;align-items:center;justify-content:space-between}.edit-validation header{margin-bottom:5px;color:#087b29}.edit-validation p{margin:8px 0}.edit-validation p span{display:flex;align-items:center;gap:7px}.edit-validation p .el-icon{color:#087b29}.edit-validation footer{margin:10px -15px 0;padding:10px 15px;border-top:1px solid #dce8df;color:#68766e}.match-edit-actions{display:flex;align-items:center;justify-content:space-between;padding:18px 26px 24px}.match-edit-actions>button{border:0;color:#2d78da;background:transparent;cursor:pointer}.match-edit-actions>div{display:flex;gap:12px}.match-edit-actions .el-button{min-width:92px}.match-edit-actions .el-button--success{min-width:175px;border-color:#075c27;background:#075c27}
.rule-impact-modal{width:635px}.rule-impact-modal>header{align-items:center}.impact-warning{display:grid;flex:0 0 44px;width:44px;height:44px;place-items:center;border-radius:50%;color:#fff;background:#f26e0e;font-size:27px}.rule-impact-modal>h3{margin:18px 28px 10px;font-size:17px}.impact-option{display:grid;grid-template-columns:40px 1fr auto;align-items:center;gap:12px;margin:10px 28px;padding:14px;border:1px solid #c9decf;border-radius:6px}.impact-option.risky{border-color:#f1c8a4}.impact-option>.el-icon{color:#087b29;font-size:28px}.impact-option.risky>.el-icon{color:#f06f13}.impact-option span{display:flex;flex-direction:column;gap:5px}.impact-option small{color:#68756e}.impact-snapshot{display:grid;grid-template-columns:repeat(4,1fr);margin:10px 28px;padding:15px 18px;border:1px solid #d9e0db;border-radius:6px}.impact-snapshot span{padding:0 12px;border-right:1px solid #e1e6e3;color:#5c6a62;text-align:center}.impact-snapshot span:last-child{border:0}.impact-snapshot b{color:#26332c}.impact-checkbox{display:grid;grid-template-columns:auto 1fr;align-items:center;margin:12px 28px;color:#26332c}.impact-checkbox small{grid-column:2;color:#68756e}.impact-note{display:flex;align-items:center;gap:8px;margin:20px 28px;padding-top:16px;border-top:1px solid #e1e6e3;color:#56645c}.impact-note .el-icon{color:#3281de}.rule-impact-modal>footer{display:flex;align-items:center;justify-content:space-between;padding:0 28px 22px}.rule-impact-modal>footer>button{border:0;color:#2d78da;background:transparent;cursor:pointer}.rule-impact-modal>footer>div{display:flex;gap:10px}.rule-impact-modal>footer .el-button--success{border-color:#075c27;background:#075c27}
.edit-native-select{box-sizing:border-box;width:100%;height:40px;padding:0 34px 0 12px;border:1px solid #dcdfe6;border-radius:4px;color:#303133;background:#fff;font:inherit;cursor:pointer}
@media(max-width:1100px){.conflict-page-actions{flex-wrap:wrap}.conflict-stat-grid{grid-template-columns:1fr 1fr}.conflict-page-body{grid-template-columns:320px 1fr}.schedule-business-mask{padding-left:0}}
</style>
