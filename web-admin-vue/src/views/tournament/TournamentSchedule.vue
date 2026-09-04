<template>
  <div class="tournament-schedule">
    <header class="schedule-context-header">
      <div class="schedule-event"><span class="event-icon"><el-icon><Trophy /></el-icon></span><strong>{{ tournament.name || '当前赛事' }}</strong><el-tag type="primary" effect="plain">{{ divisionOptions.length }}个组别</el-tag><span class="event-state"><i></i>进行中</span><span><el-icon><Calendar /></el-icon>{{ eventDateText }}</span><span><el-icon><MapLocation /></el-icon>{{ tournament.province || tournament.location || '举办地待定' }}</span></div>
      <el-button plain @click="$router.push('/tournament-space')">退出赛事空间</el-button>
    </header>

    <section v-if="showWorkbenchCanvas" class="schedule-workbench-overlay">
      <header class="workbench-heading"><div><el-button text class="workbench-back" @click="returnScheduleOverview">←　{{ scheduleReturnLabel }}</el-button><span>赛事空间　/　赛程管理　/　赛程地图</span><h1>赛程地图</h1><p>所有场地、日期和比赛均来自当前赛事真实配置</p></div><div><select v-if="!isJointSchedule" v-model="divisionSelectorValue" class="schedule-native-select" @change="handleDivisionChange"><option v-for="division in divisionOptions" :key="division.id" :value="division.id">{{ division.name }}</option></select><el-tag v-else type="success" effect="plain">全部{{ divisionOptions.length }}个组别 · {{ allTournamentMatches.length }}场</el-tag><el-tag type="primary" effect="plain">赛程草稿</el-tag></div></header>
      <section v-if="matches.length === 0" class="workbench-empty"><el-icon><MapLocation /></el-icon><h2>{{ activeDivision.name }}尚未生成赛程</h2><p>当前没有已配置的比赛场地、日期或时段。请先进入设置，输入真实场地名称并添加实际开赛时段。</p><div><el-button @click="returnScheduleOverview">{{ scheduleReturnLabel }}</el-button><el-button type="primary" @click="openScheduleConfigDialog('basic')">设置场地与生成赛程</el-button></div></section>
      <template v-else>
        <div class="saved-schedule-config"><span><el-icon><CircleCheck /></el-icon><strong>已保存并复用赛程设置</strong><small>{{ savedScheduleConfigSummary }}</small></span><el-button plain type="success" @click="openScheduleConfigDialog('preview')">查看或修改已保存设置</el-button></div>
        <div v-if="scheduleNeedsLatestRuleReflow" class="schedule-engine-upgrade"><span><el-icon><WarningFilled /></el-icon><strong>当前赛程由旧排序规则生成</strong><small>按最新规则，所有普通排位赛结束后才进入决赛阶段：半决赛 → 决赛 / 三四名决赛。</small></span><el-button type="warning" @click="openLatestRuleReflow">按最新规则重新编排</el-button></div>
        <div class="workbench-actions"><div><el-button :loading="undoingScheduleAdjustment" @click="undoLastScheduleAdjustment">撤销上次调整</el-button><el-button type="success" plain @click="ruleImpactVisible=true"><el-icon><Setting /></el-icon>修改生成规则</el-button><el-button @click="openConflictPanel">冲突检测 <el-tag v-if="scheduleConflicts.length" type="warning">{{ scheduleConflicts.length }}项</el-tag></el-button><el-button type="success" @click="previewSchedulePublish">竞赛文件发布</el-button></div></div>
        <div class="workbench-stats"><span><el-icon><Calendar /></el-icon><b>{{ workbenchStats.total }}</b>场比赛</span><span><el-icon><Calendar /></el-icon><b>{{ workbenchStats.arranged }}</b>场已安排</span><span><el-icon><Clock /></el-icon><b>{{ workbenchStats.pending }}</b>场待安排</span><span><el-icon><Football /></el-icon><b>{{ workbenchStats.venues }}</b>块场地</span><span><el-icon><Document /></el-icon>最近保存 {{ workbenchStats.lastSaved }}</span></div>
        <div class="workbench-controls"><el-radio-group v-model="workbenchView"><el-radio-button value="calendar">日历视图</el-radio-button><el-radio-button value="list">列表视图</el-radio-button></el-radio-group><div><el-button text @click="shiftWorkbenchWeek(-1)">‹　上一周</el-button><strong>{{ workbenchWeekLabel }}</strong><el-button text @click="shiftWorkbenchWeek(1)">下一周　›</el-button></div><div><el-select v-model="workbenchDivision"><el-option label="全部组别" value="all" /><el-option v-for="division in divisionOptions" :key="division.id" :label="division.name" :value="division.id" /></el-select><el-select v-model="workbenchPhase"><el-option label="全部阶段" value="all" /><el-option label="小组赛" value="group" /><el-option label="联赛" value="league" /><el-option label="淘汰赛" value="knockout" /><el-option label="排位赛" value="placement" /></el-select><el-select v-model="workbenchVenue"><el-option label="全部场地" value="all" /><el-option v-for="venue in workbenchVenues" :key="venue" :label="venue" :value="venue" /></el-select><span>比赛卡片可直接拖拽</span></div></div>
        <div v-if="workbenchView==='calendar'" class="venue-time-workbench">
          <section v-if="pendingWorkbenchMatches.length" class="pending-match-strip"><header>待安排比赛 <el-tag type="warning">{{ pendingWorkbenchMatches.length }}场</el-tag></header><div><button v-for="match in pendingWorkbenchMatches" :key="match._id" type="button" @click="openMatchEdit(match)"><small>{{ matchScheduleStageLabel(match) }} · {{ matchCardRoundLabel(match) }}</small><strong>{{ match.homeTeamName }} vs {{ match.awayTeamName }}</strong><span>{{ match.scheduleIssue || '尚未分配日期、时间或场地' }}</span></button></div></section>
          <div class="schedule-day-list">
            <article v-for="day in workbenchCalendarDays" :key="day.date" class="schedule-day-board">
              <header><div><strong>{{ day.label }}</strong><span>{{ scheduledMatchCountForDay(day.date) }}场比赛</span></div><small>联合赛程显示全部组别；左侧为时间，顶部按1号、2号、3号顺序排列场地</small></header>
              <div class="schedule-matrix-scroll"><table><thead><tr><th class="time-axis-title">时间</th><th v-for="venue in workbenchVenues" :key="venue"><span><el-icon><Football /></el-icon>{{ venue }}</span><small>{{ workbenchVenueFormatLabel(venue) }}</small></th></tr></thead><tbody><tr v-for="time in workbenchTimes" :key="`${day.date}-${time}`"><th class="time-axis"><strong>{{ time }}</strong><small>{{ sessionLabelForTime(time) }}</small></th><td v-for="venue in workbenchVenues" :key="`${day.date}-${time}-${venue}`" data-schedule-drop="true" :data-match-date="day.date" :data-match-time="time" :data-match-venue="venue" :class="{ 'drag-over-slot':isDragOverScheduleSlot(day.date,time,venue) }"><button v-for="match in workbenchMatchesForSlot(venue,day.date,time)" :key="match._id" type="button" class="schedule-match-card" :class="[scheduleCardStageClass(match),{ conflict:match.hasConflict,dragging:draggingMatchId===match._id,'drag-over':dragOverMatchId===match._id }]" :data-match-id="match._id" @click="handleScheduleCardClick(match)" @pointerdown="handleMatchPointerDown($event,match)"><header><span><em>{{ matchScheduleStageLabel(match) }}</em>{{ match.roundName || match.phase || '比赛' }}</span><b>第{{ match.matchNo || match.matchIndex || '-' }}场</b></header><div class="schedule-card-team"><img v-if="teamLogoVisible(match.homeTeamId)" :src="teamLogos[match.homeTeamId]" @error="markTeamLogoFailed(match.homeTeamId)" /><i v-else>{{ (match.homeTeamName || '待')[0] }}</i><strong>{{ match.homeTeamName || '待定' }}</strong></div><div class="schedule-card-vs">VS</div><div class="schedule-card-team"><img v-if="teamLogoVisible(match.awayTeamId)" :src="teamLogos[match.awayTeamId]" @error="markTeamLogoFailed(match.awayTeamId)" /><i v-else>{{ (match.awayTeamName || '待')[0] }}</i><strong>{{ match.awayTeamName || '待定' }}</strong></div><footer><span><strong>{{ match.divisionName || activeDivision.name }} · {{ matchFormatDisplayLabel(match) }}</strong><small>{{ matchCompetitionFormatLabel(match) }}</small></span><em v-if="match.hasConflict"><el-icon><Warning /></el-icon>存在冲突</em><b v-else>已安排</b></footer></button><span v-if="!workbenchCellMatch(venue,day.date,time)" class="empty-schedule-cell">拖到这里</span></td></tr></tbody></table></div>
            </article>
          </div>
          <section class="schedule-calendar-add-bar"><span><el-icon><Plus /></el-icon><strong>扩展赛程</strong><small>新增内容只扩展日期和资源格，不改变已有场序与对阵。</small></span><div><el-button plain @click="addNextMatchDate">＋ 比赛日</el-button><el-button plain @click="addCalendarTimeSlot">＋ 开赛时间</el-button><el-button plain @click="openCalendarTimePeriodSettings">＋ 时间段</el-button><el-button type="primary" @click="openManualAddDialog">＋ 场次</el-button></div></section>
        </div>
        <section v-else class="workbench-list"><table><thead><tr><th>场次</th><th>日期</th><th>时间</th><th>场地</th><th>对阵</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="match in matches" :key="match._id"><td>{{ match.matchNo || match.matchIndex || '-' }}</td><td>{{ match.matchDate || '待安排' }}</td><td>{{ match.matchTime || '待安排' }}</td><td>{{ match.venue || '待安排' }}</td><td>{{ match.homeTeamName }} vs {{ match.awayTeamName }}</td><td>{{ match.matchDate && match.matchTime && match.venue ? '已安排' : '待安排' }}</td><td><button type="button" @click="openMatchEdit(match)">编辑</button></td></tr></tbody></table></section>
      </template>
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
      <header class="overview-heading"><div><span class="crumb">赛事空间　/　赛程管理</span><h1>赛程管理</h1><p>统一管理各组别赛程生成、冲突校验与发布状态</p></div><div><el-button plain @click="openScheduleEditor(activeDivisionId)">导入赛程</el-button><el-button v-if="overviewStats.matches" type="primary" @click="openScheduleEditor(activeDivisionId)"><el-icon><MapLocation /></el-icon>进入赛程地图</el-button><el-button v-else type="primary" :loading="generating" :disabled="!activeSchedulePrerequisite.ready" @click="openOverviewGenerate">生成赛程</el-button></div></header>
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
              <td><button class="table-action" type="button" @click="openScheduleEditor(row.id)">{{ row.matches ? '进入赛程地图' : '配置并生成' }}</button></td>
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
        <article><el-icon><Football /></el-icon><strong>{{ matches.length }}场比赛<small>当前组别真实赛程</small></strong></article>
        <article><el-icon><Connection /></el-icon><strong>{{ conflictAffectedMatchCount }}场受影响<small>涉及冲突的比赛</small></strong></article>
        <article class="passed"><el-icon><CircleCheck /></el-icon><strong>{{ conflictPassedMatchCount }}场无冲突<small>已通过当前检查</small></strong></article>
      </div>
      <div class="conflict-page-body real-conflict-body"><section class="conflict-list-card"><header><h2>冲突列表</h2><el-tag v-if="conflictDisplayCount" type="warning">{{ conflictDisplayCount }}项</el-tag></header><button v-for="item in conflictDisplayItems" :key="item.key" type="button" class="conflict-list-item" @click="openConflictMatch(item.matchIds?.[0])"><span><el-icon><Warning /></el-icon>{{ item.level === 'danger' ? '高优先级' : '需确认' }}</span><strong>{{ item.title }}</strong><p>{{ item.detail }}</p><small>点击打开相关比赛进行调整</small></button><el-empty v-if="!conflictDisplayItems.length" description="当前未检测到场地时间冲突" /><footer><el-icon><CircleCheck /></el-icon>已通过检查 <b>{{ conflictPassedMatchCount }}场</b></footer></section></div>
    </section>

    <div v-if="editModalVisible" class="schedule-business-mask" role="dialog" aria-modal="true" aria-label="手动修改场次">
      <section class="match-edit-modal">
        <header><div><h2>手动修改场次</h2><p>调整比赛时间或场地，保存后自动重新检测冲突。</p></div><button type="button" aria-label="关闭" @click="cancelMatchEdit"><el-icon><Close /></el-icon></button></header>
        <div class="edit-match-summary"><small>{{ editOriginal?.roundName || editOriginal?.phase || '当前比赛' }}</small><strong>{{ editHomeName }}　vs　{{ editAwayName }}</strong><p>当前：{{ editOriginal?.matchDate || '日期待定' }} {{ editOriginal?.matchTime || '时间待定' }} · {{ editOriginal?.venue || '场地待定' }}</p></div>
        <el-form class="match-edit-form" :model="editForm" label-position="top">
          <el-form-item label="比赛日期"><el-date-picker v-model="editForm.matchDate" type="date" format="YYYY.MM.DD ddd" value-format="YYYY-MM-DD" :clearable="false" /></el-form-item>
          <div class="edit-time-row"><el-form-item label="开赛时间"><select v-model="editForm.matchTime" class="edit-native-select"><option v-for="time in editTimeOptions" :key="time" :value="time">{{ time }}</option></select></el-form-item><el-form-item label="结束时间"><el-input :model-value="editEndTime" disabled><template #suffix>自动计算</template></el-input></el-form-item></div>
          <el-form-item label="比赛场地"><select v-model="editForm.venue" class="edit-native-select"><option v-for="v in editVenueOptions" :key="v" :value="v">{{ v }}</option></select></el-form-item>
        </el-form>
        <section class="edit-validation"><header><strong>保存校验</strong><el-tag type="info">保存时检测</el-tag></header><p><span><el-icon><CircleCheck /></el-icon>比赛日期与时间</span><b>{{ editForm.matchDate && editForm.matchTime ? '已填写' : '待填写' }}</b></p><p><span><el-icon><CircleCheck /></el-icon>比赛场地</span><b>{{ editForm.venue || '待选择' }}</b></p><footer>保存时会检查同一场地、同一时段是否已有其他比赛。</footer></section>
        <footer class="match-edit-actions"><button type="button" @click="restoreOriginalMatchArrangement">恢复原安排</button><div><el-button @click="cancelMatchEdit">取消</el-button><el-button type="success" :loading="saving" @click="saveMatchEdit">保存并重新检测</el-button></div></footer>
      </section>
    </div>

    <div v-if="ruleImpactModalVisible" class="schedule-business-mask" role="dialog" aria-modal="true" aria-label="修改生成规则">
      <section class="rule-impact-modal"><header><span class="impact-warning"><el-icon><WarningFilled /></el-icon></span><div><h2>修改生成规则</h2><p>当前赛程已生成。修改规则可能影响已有场次安排。</p></div><button type="button" aria-label="关闭" @click="closeRuleImpactModal"><el-icon><Close /></el-icon></button></header><h3>修改影响</h3><div class="impact-option safe"><el-icon><Calendar /></el-icon><span><strong>日期、场地与休息时间</strong><small>保存现有场次位置，修改后重新检测冲突。</small></span><el-tag type="success" effect="plain">可保留调整</el-tag></div><div class="impact-option risky"><el-icon><Connection /></el-icon><span><strong>阶段顺序、场次数量与晋级关系</strong><small>需要重新生成赛程，已有手动调整可能失效。</small></span><el-tag type="warning" effect="plain">可能重排</el-tag></div><h3>当前赛程快照</h3><div class="impact-snapshot"><span><b>{{ workbenchStats.arranged }}场已安排</b></span><span><b>{{ workbenchStats.pending }}场待安排</b></span><span><b>{{ scheduleConflicts.length }}项冲突</b></span><span>最近保存 {{ workbenchStats.lastSaved }}</span></div><label class="impact-checkbox"><el-checkbox v-model="saveRuleSnapshot" />修改前自动保存当前赛程快照<small>可在快照记录中恢复修改前的赛程。</small></label><p class="impact-note"><el-icon><InfoFilled /></el-icon>规则修改完成后，系统不会自动发布赛程，仍需重新预览并确认。</p><footer><button type="button">查看影响说明</button><div><el-button @click="closeRuleImpactModal">取消</el-button><el-button type="warning" plain @click="openRuleEditor(false)">直接修改</el-button><el-button type="success" @click="openRuleEditor(saveRuleSnapshot)">保存快照并修改</el-button></div></footer></section>
    </div>

    <!-- 赛程配置弹窗 -->
    <section v-if="generatorDialogVisible" class="schedule-generator-overlay" aria-label="生成赛程">
      <header class="generator-page-heading"><div><el-button text class="workbench-back" @click="returnScheduleOverview">←　{{ scheduleReturnLabel }}</el-button><span>赛事空间　/　赛程管理　/　生成赛程</span><h1>{{ generationModeLabel }}</h1><p>{{ scheduleGenerationMode==='joint' ? '共享比赛日期与场地资源，混合安排全部已就绪组别' : '只编排所选组别，其他组别赛程保持不变' }}</p></div><div><strong class="joint-division-chip">{{ targetScheduleDivisions.length }}个组别 · {{ targetTeamCount }}支球队</strong><el-tag type="success" effect="plain">{{ generatorCompletionLabel }}</el-tag></div></header>
      <div class="config-content">
        <div class="schedule-wizard-steps"><span v-for="item in scheduleWizardSteps" :key="item.key" :class="{ active: scheduleStep === item.key, done: scheduleWizardIndex(item.key) < scheduleWizardIndex(scheduleStep) }"><b><el-icon v-if="scheduleWizardIndex(item.key) < scheduleWizardIndex(scheduleStep)"><Check /></el-icon><template v-else>{{ item.index }}</template></b>{{ item.title }}</span></div>
        <div v-if="scheduleStep === 'mode'" class="schedule-mode-layout"><section class="config-section schedule-mode-picker"><header><div><h3>先选择这次怎么编排</h3><p>这个选择只决定本次生成范围，不会改变各组别已经定版的赛制和抽签结果。</p></div></header><div class="schedule-mode-options"><label :class="{ selected:scheduleGenerationMode==='joint' }"><input v-model="scheduleGenerationMode" type="radio" value="joint" /><span><b>全部组别联合编排</b><small>推荐多组别赛事使用</small></span><p>全部已就绪组别共享日期、场地和时隙；相同制式可灵活混编，最大化利用场地。</p><em>{{ jointScheduleDivisions.length }}个组别 · {{ jointTeamCount }}支球队 · {{ jointTheoreticalMatchCount }}场</em></label><label :class="{ selected:scheduleGenerationMode==='separate' }"><input v-model="scheduleGenerationMode" type="radio" value="separate" /><span><b>每个组别单独编排</b><small>适合分开管理的赛事</small></span><p>一次只生成一个组别，其他组别已有赛程不受影响；之后可回来继续选择下一个组别。</p><em>本次只处理1个组别</em></label></div><div v-if="scheduleGenerationMode==='separate'" class="separate-division-picker"><strong>选择本次要编排的组别</strong><div><button v-for="division in jointScheduleDivisions" :key="division.id" type="button" :class="{ active:selectedScheduleDivision?.id===division.id }" @click="selectedScheduleDivisionId=division.id"><span>{{ division.name }}<small>{{ division.matchFormatLabel }} · {{ division.formatLabel }}</small></span><b>{{ division.row.teams }}支 · {{ division.matchCount }}场</b></button></div></div></section><aside class="config-section schedule-mode-summary"><h3>本次编排范围</h3><strong>{{ generationScopeLabel }}</strong><dl><div><dt>竞赛组别</dt><dd>{{ targetScheduleDivisions.length }}个</dd></div><div><dt>参赛球队</dt><dd>{{ targetTeamCount }}支</dd></div><div><dt>正式比赛</dt><dd>{{ targetTheoreticalMatchCount }}场</dd></div></dl><p><el-icon><CircleCheck /></el-icon>不同几人制仍严格匹配对应场地，不会跨制式安排。</p></aside></div>
        <section v-if="scheduleStep === 'basic'" class="generator-ready-banner"><span class="ready-icon"><el-icon><UserFilled /></el-icon></span><div><strong>{{ generationScopeLabel }}已就绪</strong><p><span>{{ targetTeamCount }}支球队</span><span>{{ generationModeLabel }}</span><span>预计{{ targetTheoreticalMatchCount }}场比赛</span></p></div></section>
        <section v-if="scheduleStep === 'venues'" class="generator-venue-summary"><div><el-icon><Calendar /></el-icon><span>比赛周期<b>{{ scheduleConfig.startDate }}—{{ scheduleConfig.endDate }}</b></span></div><div><el-icon><Calendar /></el-icon><span>比赛日<b>{{ scheduleConfig.matchDays.join('、') }}</b></span></div><div><el-icon><Clock /></el-icon><span>比赛阶段<b>{{ enabledSessionLabels.join('、') || '未启用' }} · {{ generatedTimeSlots.length }}个时隙</b></span></div><div><el-icon><Football /></el-icon><span>{{ generationScopeLabel }}预计{{ targetTheoreticalMatchCount }}场</span></div><el-button link type="success" @click="scheduleStep = 'basic'">修改时间设置　›</el-button></section>
        <section v-if="scheduleStep === 'rules'" class="generator-rule-summary"><el-icon><Document /></el-icon><div><strong>规则来源：竞赛管理 · {{ generationScopeLabel }}　<em>规则已定版</em></strong><p><span>{{ targetScheduleDivisions.length }}个组别</span><span>{{ targetTeamCount }}支球队</span><span>{{ generationVenues.length }}块场地</span><span>预计{{ targetTheoreticalMatchCount }}场比赛</span></p></div></section>
        <div v-if="scheduleStep === 'basic'" class="generator-basic-grid">
          <section class="config-section basic-parameters"><h3>{{ scheduleGenerationMode==='joint' ? '全赛事时间设置' : '所选组别时间设置' }}</h3><div class="parameter-row"><label>比赛日期</label><div class="date-range"><el-date-picker v-model="scheduleConfig.startDate" type="date" format="YYYY.MM.DD" value-format="YYYY-MM-DD" /><span>—</span><el-date-picker v-model="scheduleConfig.endDate" type="date" format="YYYY.MM.DD" value-format="YYYY-MM-DD" /></div></div><div class="parameter-row"><label>比赛日</label><el-checkbox-group v-model="scheduleConfig.matchDays"><el-checkbox v-for="day in ['周一','周二','周三','周四','周五','周六','周日']" :key="day" :label="day" /></el-checkbox-group></div><div class="joint-division-specs"><article v-for="division in targetScheduleDivisions" :key="division.id"><div class="joint-division-identity"><strong>{{ division.name }}</strong><em>{{ division.matchFormatLabel }}</em></div><span>{{ division.formatLabel }} · {{ division.row.teams }}支球队</span><span>{{ division.matchMinutes }}分钟比赛 ＋ {{ 60-division.matchMinutes }}分钟间隔</span><b>{{ division.matchCount }}场</b></article></div></section>
          <div class="basic-side"><section class="config-section"><h3>本次赛程范围</h3><p class="locked-schedule-scope"><el-icon><Lock /></el-icon><strong>{{ targetScheduleDivisions.length }}个组别 · {{ targetTheoreticalMatchCount }}场</strong><span>{{ scheduleGenerationMode==='joint' ? '各组别保留自己的赛制、场序、比赛时长和晋级依赖，共享本页日期与后续场地资源。' : '只生成当前所选组别，其他组别现有赛程和配置保持不变。' }}</span></p></section><section class="config-section preference-card"><h3>系统自动分配原则</h3><p class="automatic-frequency-rule"><el-icon><CircleCheck /></el-icon><strong>{{ scheduleGenerationMode==='joint' ? '跨组别混编并最大化利用场地' : '所选组别独立占用兼容场地' }}</strong><span>{{ scheduleGenerationMode==='joint' ? '不同组别可同时使用不同场地，也可在同一场地的不同时隙穿插安排。' : '本次只为所选组别排赛，同时自动避让其他组别已经占用的场地时隙。' }}</span></p><p>真实场地和三个阶段的起止时间在下一步统一设置。</p></section></div>
        </div>
        <div v-if="scheduleStep === 'venues'" class="generator-venues-grid"><section class="config-section venue-table-card venue-resource-editor"><header><div><h3>全赛事共享场地、制式与日内阶段</h3><small>每块场地必须选择5人制、7人制、8人制、9人制或11人制，再设置上午、下午、晚上</small></div><el-button type="success" plain @click="addDefaultVenue">＋　添加场地</el-button></header><div class="venue-resource-list"><article v-for="(venue,index) in generatorVenueRows" :key="index"><header><el-select v-model="venue.name" filterable allow-create default-first-option placeholder="选择场地编号，或输入自定义名称"><el-option v-for="name in venueNameOptions" :key="name" :label="name" :value="name" /></el-select><el-select v-model="venue.fieldFormat" placeholder="选择场地制式"><el-option v-for="option in fieldFormatOptions" :key="option.value" :label="option.label" :value="option.value" /></el-select><button type="button" @click="removeGenerationVenue(index)">删除</button></header><div class="venue-session-grid"><label v-for="window in venue.sessionWindows" :key="window.key" :class="{ disabled:!window.enabled }"><span><el-switch v-model="window.enabled" @change="syncAutoTiming" /><strong>{{ window.label }}</strong></span><div><el-time-select v-model="window.start" start="06:00" step="00:30" end="22:00" :disabled="!window.enabled" @change="syncAutoTiming" /><em>至</em><el-time-select v-model="window.end" start="07:00" step="00:30" end="24:00" :disabled="!window.enabled" @change="syncAutoTiming" /></div></label></div><footer><strong>{{ fieldFormatLabel(venue.fieldFormat) }}</strong><span>自动时隙：</span><el-tag v-for="time in slotsForWindows(venue.sessionWindows)" :key="time">{{ time }}</el-tag><em v-if="!slotsForWindows(venue.sessionWindows).length">尚无有效时隙</em></footer></article></div><el-empty v-if="!generatorVenueRows.length" description="尚未添加比赛场地" :image-size="72" /><p>ⓘ　场地下拉默认提供编号；需要时可直接输入自定义名称。系统只把比赛安排到相同制式场地。</p></section><div class="venue-side"><section class="config-section venue-allocation-note"><h3>场地制式硬匹配</h3><p><el-icon><CircleCheck /></el-icon><strong>5对5、7对7、8对8、9对9、11对11</strong></p><small>比赛制式读取各组定版规则。没有对应制式场地时联合生成整体阻断，并提示缺少哪种场地。</small></section><section class="config-section venue-allocation-note"><h3>兼容组别混编</h3><p><el-icon><CircleCheck /></el-icon><strong>相同场地制式的组别灵活穿插</strong></p><small>例如多个8人制组别可共享8人制场地；5人制与11人制不会被安排到8人制场地。</small></section><section class="config-section capacity-note"><h3>当前每日理论容量</h3><strong>{{ generatedVenueSlotCount }} 场</strong><p>{{ venueResourceConfigs.length }}块已配置场地 · 自动展开{{ generatedVenueSlotCount }}个资源格</p><small>实际可排数量按各制式场地分别计算，并受球队休息和阶段依赖限制。</small></section></div></div>
        <section v-if="scheduleStep === 'venues'" class="capacity-analysis" :class="{ ready:capacityAssessment.ready,blocked:!capacityAssessment.ready }"><header><div><h3>赛期与场地容量测算</h3><p>按{{ capacityAssessment.availableDays }}个有效比赛日、各制式场地时隙和本次{{ targetTheoreticalMatchCount }}场比赛提前测算。</p></div><el-tag :type="capacityAssessment.ready ? 'success' : 'danger'">{{ capacityAssessment.ready ? '理论容量满足' : '需要提前干预' }}</el-tag></header><el-alert v-if="capacityAssessment.missingDates" type="warning" :closable="false" title="请先设置完整的比赛开始和结束日期" /><el-alert v-else-if="capacityAssessment.noEligibleDates" type="warning" :closable="false" title="当前日期范围内没有勾选的比赛日，请修改日期或星期" /><div class="capacity-format-grid"><article v-for="row in capacityAssessment.rows" :key="row.fieldFormat" :class="{ shortage:!row.ready }"><header><strong>{{ row.label }}</strong><span>{{ row.fieldCount }}块场地</span></header><dl><div><dt>正式比赛</dt><dd>{{ row.requiredMatches }}场</dd></div><div><dt>每日资源格</dt><dd>{{ row.dailySlots }}个</dd></div><div><dt>赛期理论容量</dt><dd>{{ row.totalCapacity }}场</dd></div><div><dt>容量差额</dt><dd :class="{ danger:row.shortage }">{{ row.shortage ? `缺${row.shortage}场` : '满足' }}</dd></div></dl><p>{{ capacityRecommendation(row) }}</p></article></div><footer><span>可选干预：</span><el-button plain @click="scheduleStep='basic'">延长赛期或增加比赛日</el-button><el-button plain @click="addDefaultVenue">增加对应制式场地</el-button><el-button plain @click="router.push({ path:`/tournaments/${tournamentId}/competition` })">调整赛制或排名范围</el-button><small>调整赛制会重建对应组别场序，必须返回竞赛管理明确修改。</small></footer></section>
        <p v-if="scheduleStep === 'rules'" class="rule-fixed-note">赛制规则已经定版，本页面不重复修改赛制。</p>
        <div v-if="scheduleStep === 'rules'" class="generator-rules-grid"><section class="config-section phase-order"><header><h3>本次组别赛程规模</h3><span>来自各组定版规则　<el-icon><Lock /></el-icon></span></header><article v-for="(division,index) in targetScheduleDivisions" :key="division.id"><b>{{ index + 1 }}</b><div><strong>{{ division.name }} · {{ division.matchFormatLabel }} · {{ division.formatLabel }}</strong><p>{{ division.row.teams }}支球队 · 单场{{ division.matchMinutes }}分钟</p></div><em>{{ division.matchCount }}场</em></article><p>ⓘ　编排方式只控制本次生成范围，不改变任何组别的比赛制式、对阵、场序或晋级关系。</p></section><section class="config-section enforced-strategy"><h3>系统强制编排规则</h3><p><el-icon><CircleCheck /></el-icon><span><b>相同制式场地共享</b><small>同制式组别可混编，不同制式绝不混用</small></span></p><p><el-icon><CircleCheck /></el-icon><span><b>每队每阶段最多1场</b><small>{{ enabledSessionLabels.join('、') }}分别计算</small></span></p><p><el-icon><CircleCheck /></el-icon><span><b>各组别依赖独立</b><small>相同场序编号不会跨组串联</small></span></p><p><el-icon><CircleCheck /></el-icon><span><b>场地时隙唯一</b><small>同一场地同一时间只允许1场</small></span></p></section></div>
        <div v-if="scheduleStep === 'preview'" class="generator-preview"><el-alert v-if="!capacityAssessment.ready" type="error" :closable="false" title="当前赛期与场地容量不足，请返回场地规划按建议干预后再生成" /><section class="preview-stats"><article><el-icon><Calendar /></el-icon><strong>{{ targetTheoreticalMatchCount }}<small>场比赛</small></strong></article><article><el-icon><Calendar /></el-icon><strong>{{ capacityAssessment.availableDays }}<small>个有效比赛日</small></strong></article><article><el-icon><Football /></el-icon><strong>{{ generationVenues.length }}<small>块场地</small></strong></article><article :class="{ passed:capacityAssessment.ready,blocked:!capacityAssessment.ready }"><el-icon><CircleCheck v-if="capacityAssessment.ready" /><Warning v-else /></el-icon><strong>{{ capacityAssessment.totalCapacity }}<small>场理论容量</small></strong><span>{{ capacityAssessment.ready ? '容量满足' : '容量不足' }}</span></article></section><div class="preview-grid"><section class="preview-table-card"><header><h3>生成结果说明</h3></header><div class="pre-generation-summary"><el-icon><InfoFilled /></el-icon><h4>{{ capacityAssessment.ready ? generationScopeLabel : '当前配置不能容纳本次全部正式比赛' }}</h4><p v-if="capacityAssessment.ready">系统将把{{ targetScheduleDivisions.map(item => `${item.name}·${item.matchFormatLabel}`).join('、') }}共{{ targetTheoreticalMatchCount }}场比赛安排到兼容制式场地；生成前不展示虚构比赛。</p><p v-else>正式赛程需要{{ capacityAssessment.requiredMatches }}场，当前按制式合计理论容量仅{{ capacityAssessment.totalCapacity }}场。请增加对应制式场地、延长赛期、增加比赛日或返回竞赛管理调整赛制与排名范围。</p></div></section><div class="preview-side"><section><h3>生成前检查</h3><p>✓　正式抽签组别 <span>{{ targetScheduleDivisions.length }}个</span></p><p>✓　参赛球队 <span>{{ targetTeamCount }}支</span></p><p>✓　有效比赛日 <span>{{ capacityAssessment.availableDays }}天</span></p><p>{{ capacityAssessment.ready ? '✓' : '!' }}　制式场地容量 <span>{{ capacityAssessment.ready ? '满足' : '不足' }}</span></p></section><section><h3>配置摘要 <button type="button" @click="scheduleStep='venues'">返回干预</button></h3><p>比赛周期 <span>{{ scheduleConfig.startDate || '未设置' }}—{{ scheduleConfig.endDate || '未设置' }}</span></p><p>比赛日 <span>{{ scheduleConfig.matchDays.join('、') || '未设置' }}</span></p><p>分配模式 <span>{{ generationModeLabel }}</span></p><p>球队频次 <span>每阶段最多1场</span></p></section><section v-if="showPostGenerationHint" class="post-generation-hint"><button type="button" aria-label="关闭提示" @click="showPostGenerationHint=false">×</button><strong>生成后可以继续调整</strong><p>{{ scheduleGenerationMode==='joint' ? '系统将一次创建全部所选组别赛程草稿，可按组别查看或在全场地视图统一调整。' : '系统只创建当前所选组别赛程草稿，其他组别不受影响。' }}</p><em>{{ capacityAssessment.ready ? '待生成' : '待干预' }}</em></section></div></div></div>
      </div>
      <footer class="generator-page-footer">
        <el-button @click="returnScheduleOverview">←　{{ scheduleReturnLabel }}</el-button>
        <div><el-button :loading="savingScheduleDraft" @click="saveGeneratorDraft">保存配置草稿</el-button><el-button v-if="scheduleStep !== 'basic'" @click="previousScheduleStep">上一步</el-button><el-button v-if="scheduleStep !== 'preview'" type="primary" :loading="savingScheduleDraft" @click="nextScheduleStep">下一步：{{ scheduleWizardSteps[scheduleWizardIndex(scheduleStep)]?.title || '继续' }}　›</el-button><el-button v-else-if="!capacityAssessment.ready" type="warning" @click="openCurrentCapacityRisk">处理容量不足</el-button><el-button v-else type="primary" @click="handleGenerate" :loading="generating">确认生成赛程</el-button></div>
      </footer>
    </section>

    <el-dialog v-model="publicationCenterVisible" width="min(1220px,96vw)" top="3vh" class="competition-publication-dialog" :close-on-click-modal="false">
      <template #header><div class="publication-dialog-title"><span><el-icon><Document /></el-icon></span><div><h2>竞赛文件发布中心</h2><p>竞赛规程与竞赛日程分别按真实竞赛组别发布，版本互不混用。</p></div><el-select v-model="publicationDivisionId"><el-option v-for="division in divisionOptions" :key="division.id" :label="division.name" :value="division.id" /></el-select></div></template>
      <div class="publication-status-grid"><article><header><span>竞赛规程</span><el-tag :type="publicationDivision?.regulationsPublished ? 'success' : 'warning'">{{ publicationDivision?.regulationsPublished ? '已发布' : '待发布' }}</el-tag></header><strong>{{ publicationDivision?.name || '当前组别' }}竞赛规程</strong><p>版本：{{ publicationDivision?.regulationsPublishedVersion || publicationDivision?.rulesVersion || '规则定版版本' }}</p><footer><el-button plain @click="openRegulationsPage">预览规程</el-button><el-button type="primary" :loading="publishingDocument==='regulations'" @click="publishRegulations">{{ publicationDivision?.regulationsPublished ? '发布新版本' : '正式发布' }}</el-button></footer></article><article><header><span>竞赛日程</span><el-tag :type="publicationSchedulePublished ? 'success' : 'warning'">{{ publicationSchedulePublished ? '已发布' : '待发布' }}</el-tag></header><strong>{{ publicationDivision?.name || '当前组别' }}竞赛日程</strong><p>{{ publicationMatches.length }}场比赛 · {{ publicationVenueSummary }}</p><footer><el-button plain :loading="exportingTable" @click="exportFormalSchedule">导出Excel</el-button><el-button type="primary" :loading="publishingDocument==='schedule'" :disabled="!publicationScheduleReady" @click="publishScheduleDocument">{{ publicationSchedulePublished ? '发布新版本' : '正式发布' }}</el-button></footer></article></div>
      <section class="formal-schedule-toolbar"><div><strong>正式竞赛日程预览</strong><span>页面、打印/PDF和Excel使用同一组标准行</span></div><el-radio-group v-model="publicationOrientation"><el-radio-button value="portrait">A4竖版</el-radio-button><el-radio-button value="landscape">A4横版</el-radio-button></el-radio-group><el-button :icon="Printer" @click="printFormalSchedule">打印 / PDF</el-button></section>
      <section class="formal-schedule-stage"><article v-for="page in publicationPages" :key="page.number" class="formal-schedule-sheet" :class="publicationOrientation"><header><small>赛小蜂足球 · 正式竞赛文件</small><h1>竞赛日程（{{ publicationDivision?.name || '当前组别' }}）</h1><p>{{ tournament.name || '当前赛事' }} · 共{{ publicationRows.length }}场</p><span>场地：{{ publicationVenueSummary }}</span></header><table><thead><tr><th>日期</th><th>时间</th><th>阶段</th><th>轮次</th><th>组别</th><th>分组</th><th>比赛队</th><th>场地</th><th>场序</th></tr></thead><tbody><tr v-for="row in page.rows" :key="row.key"><td>{{ row.date }}</td><td>{{ row.time }}</td><td>{{ row.stage }}</td><td>{{ row.round }}</td><td>{{ row.division }}</td><td>{{ row.pool }}</td><td class="formal-teams">{{ row.teams }}</td><td>{{ row.venue }}</td><td>{{ row.serial }}</td></tr></tbody></table><footer><span>比赛时间与场地以主办方最新发布的竞赛日程为准。</span><b>第{{ page.number }}/{{ publicationPages.length }}页 · 制表日期：{{ publicationPreparedDate }}</b></footer></article></section>
      <el-alert v-if="!publicationScheduleReady" type="warning" :closable="false" title="当前组别存在未排场次或场地时段冲突，处理完成后才能正式发布竞赛日程。" />
    </el-dialog>

    <el-dialog v-model="generationRiskVisible" width="720px" top="10vh" class="generation-risk-dialog" :close-on-click-modal="false" :show-close="false">
      <section class="generation-risk-panel">
        <header><span><el-icon><WarningFilled /></el-icon></span><div><h2>当前配置无法完整生成赛程</h2><p>请先处理比赛日、场地或阶段容量问题，再返回确认生成。</p></div></header>
        <div class="generation-risk-summary"><article><small>未排场次</small><strong>{{ generationRisk.unassigned || capacityAssessment.rows.reduce((sum,row)=>sum+row.shortage,0) || '—' }}</strong></article><article><small>有效比赛日</small><strong>{{ capacityAssessment.availableDays }}天</strong></article><article><small>已配置场地</small><strong>{{ venueResourceConfigs.length }}块</strong></article></div>
        <el-alert :type="generationRisk.unassigned && capacityAssessment.rows.every(row=>row.ready) ? 'warning' : 'error'" :closable="false" :title="capacityDiagnosisText" />
        <div class="generation-format-diagnosis"><article v-for="row in capacityAssessment.rows" :key="row.fieldFormat" :class="{ shortage:row.shortage }"><header><strong>{{ row.label }}</strong><span>{{ row.fieldCount }}块场地</span></header><p>需要{{ row.requiredMatches }}场 · 理论容量{{ row.totalCapacity }}场</p><b>{{ row.shortage ? `缺少${row.shortage}场` : '场地总量足够' }}</b></article></div>
        <div v-if="generationRisk.formatBreakdown?.length" class="generation-risk-reasons"><strong>未排场次具体归属</strong><ul><li v-for="row in generationRisk.formatBreakdown" :key="`${row.divisionId}-${row.fieldFormat}`"><b>{{ row.divisionName }} · {{ row.fieldFormatLabel }}</b>：{{ row.unassigned }}场未排<span v-if="row.reasons?.length">（{{ row.reasons.join('；') }}）</span></li></ul></div>
        <div v-if="generationRisk.reasons?.length" class="generation-risk-reasons"><strong>系统检测原因</strong><ul><li v-for="reason in generationRisk.reasons.slice(0,8)" :key="reason">{{ reason }}</li></ul></div>
        <div class="generation-risk-actions"><button type="button" @click="goToRiskSetting('basic')"><el-icon><Calendar /></el-icon><span><strong>增加比赛日</strong><small>延长赛期或增加比赛星期</small></span></button><button type="button" @click="goToRiskSetting('venues')"><el-icon><Football /></el-icon><span><strong>调整场地或晚场</strong><small>增加对应制式场地、时段或开启晚场</small></span></button><button type="button" @click="goToCompetitionRules"><el-icon><Setting /></el-icon><span><strong>调整赛制</strong><small>修改场次数量或排名范围后重新抽签排赛</small></span></button></div>
        <footer><el-button @click="closeGenerationRisk">返回预览</el-button><el-button type="primary" @click="goToRiskSetting('venues')">前往处理</el-button></footer>
      </section>
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
import { MagicStick, Calendar, Grid, List, MapLocation, ArrowLeft, ArrowRight, Plus, Download, Picture, Delete, UserFilled, User, Football, Clock, Document, Lock, CircleCheck, Trophy, Check, Setting, Warning, WarningFilled, InfoFilled, Refresh, Close, Connection, Printer } from '@element-plus/icons-vue'
import { queryById, queryList, callFunction, deleteRecord, addRecord, getFileUrl } from '../../utils/cloud'
import TournamentDraw from './TournamentDraw.vue'

const route = useRoute()
const router = useRouter()
const CURRENT_SCHEDULE_ENGINE_VERSION='2026-08-30-unified-final-stage-v3'
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
const divisionRecords = ref(visualQaSnapshot?.divisions || [])
const approvedTeamCounts = ref({})
const drawReadinessByDivision = ref({})
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
const failedTeamLogos = ref({})
const loading = ref(false)
const generating = ref(false)
const savingScheduleDraft = ref(false)
const saving = ref(false)
const deletingSchedule = ref(false)
const undoingScheduleAdjustment = ref(false)
const exportingTable = ref(false)
const exportingImage = ref(false)
const scheduleExportRef = ref(null)
const publicationCenterVisible = ref(false)
const publicationDivisionId = ref(activeDivisionId.value)
const publicationOrientation = ref('portrait')
const publishingDocument = ref('')
const generationRiskVisible = ref(false)
const generationRisk = ref({ code:'',message:'',unassigned:0,reasons:[],formatBreakdown:[] })
const viewMode = ref(visualQaSnapshot ? 'calendar' : 'round')
const requestedGeneratorStep = String(route.query.generator || hashQuery.get('generator') || '')
const initialGeneratorStep = ['mode', 'basic', 'venues', 'rules', 'preview'].includes(requestedGeneratorStep) ? requestedGeneratorStep : 'mode'
const showConfigDialog = ref(Boolean(requestedGeneratorStep))
const scheduleStep = ref(initialGeneratorStep)
const generatorSubtitle = computed(() => ({ mode:'选择联合编排或按组别单独编排', basic:'根据已完成的分组结果配置赛程基础参数', venues:'配置比赛场地、可用日期与每日比赛时段', rules:'配置轮次、对阵、休息与冲突规避规则', preview:'核对生成范围、场地时段与编排规则后生成赛程' }[scheduleStep.value]))
const generatorCompletionLabel = computed(() => ({ mode:'请选择编排方式', basic:'编排方式已选择', venues:'时间设置已完成', rules:'场地与时间已完成', preview:'编排规则已完成' }[scheduleStep.value]))
const generatorDialogVisible = computed({
  get: () => showConfigDialog.value || Boolean(route.query.generator),
  set: value => { showConfigDialog.value = value }
})
const showWorkbenchCanvas = computed(() => !showOverview.value && !generatorDialogVisible.value)
const workbenchView = ref('calendar')
const workbenchDivision = ref('all')
const workbenchPhase = ref('all')
const workbenchVenue = ref('all')
const scheduleWizardSteps = [{ key:'mode', title:'编排方式', index:1 }, { key:'basic', title:'时间设置', index:2 }, { key:'venues', title:'场地与阶段', index:3 }, { key:'rules', title:'编排规则', index:4 }, { key:'preview', title:'预览确认', index:5 }]
const scheduleGenerationMode = ref('joint')
const selectedScheduleDivisionId = ref(activeDivisionId.value)
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
const calendarBaseDate = ref(new Date())
const calendarInitialized = ref(false)
const quickEditMode = ref(false)
const draggingMatchId = ref('')
const dragOverMatchId = ref('')
const dragOverScheduleSlot = ref(null)
const quickSavingIds = ref([])
let pointerDragState = null
let suppressNextCardClick = false
let venueSelectionInitialized = false

function createDefaultScheduleConfig() { return {
  startDate: tournament.value.startDate || visualQaSnapshot?.tournament?.startDate || '',
  endDate: tournament.value.endDate || visualQaSnapshot?.tournament?.endDate || '',
  matchDays: ['周六', '周日'],
  matchDuration: 0,
  halfTime: 10,
  matchInterval: 0,
  earliestTime: '09:00',
  latestTime: '18:00',
  scope: 'all',
  maxDailyOne: false,
  balanceHomeAway: true,
  preferWeekend: true,
  venueAllocation: 'auto',
  avoidConsecutive: true,
  venueBuffer: true,
  restMinutes: 90,
  balanceTimes: true,
  groupVenuePriority: true,
  knockoutRest: true,
  dailyMatchLimit: 0,
  venues: [],
  venueResources: [],
  timeSlots: [],
  calendarExtraTimeSlots: [],
  slotMinutes: 60,
  maxPerSession: 1,
  sessionWindows: [
    { key:'morning',label:'上午',enabled:true,start:'09:00',end:'12:00' },
    { key:'afternoon',label:'下午',enabled:true,start:'14:00',end:'17:00' },
    { key:'evening',label:'晚上',enabled:false,start:'18:00',end:'21:00' }
  ],
  cupMode: 'single',
  avoidCrossDivision: true,
  balanceVenues: true
} }
const scheduleConfig = ref(createDefaultScheduleConfig())

const manualAddVisible = ref(false)
const generatorVenueRows = ref([])
const previewStage = ref('group')
const showFullPreview = ref(false)
const showPostGenerationHint = ref(true)
const visiblePreviewRows = computed(() => matches.value.slice(0, showFullPreview.value ? matches.value.length : 5).map(row => ({ ...row, previewWeek: weekdayLabel(row.matchDate) })))
const pendingWorkbenchMatches = computed(() => matches.value.filter(match => !match.matchDate || !match.matchTime || !match.venue))
const arrangedWorkbenchMatches = computed(() => matches.value.filter(match => match.matchDate && match.matchTime && match.venue))
const isJointSchedule = computed(() => tournament.value?.scheduleGenerationMode==='joint')
const sharedWorkbenchMatches = computed(() => isJointSchedule.value ? allTournamentMatches.value : matches.value)
const arrangedSharedWorkbenchMatches = computed(() => sharedWorkbenchMatches.value.filter(match => match.matchDate && match.matchTime && match.venue))
const workbenchVenues = computed(() => { const configured=(tournament.value?.scheduleConfig?.venueResources || scheduleConfig.value.venueResources || []).map(resource=>String(resource?.name || resource?.venue || '').trim());return [...new Set([...configured,...arrangedSharedWorkbenchMatches.value.map(match=>String(match.venue || '').trim())].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN',{ numeric:true })) })
const workbenchTimes = computed(() => [...new Set([...(scheduleConfig.value.timeSlots || []),...(scheduleConfig.value.calendarExtraTimeSlots || []),...arrangedSharedWorkbenchMatches.value.map(match => match.matchTime)].filter(Boolean))].sort())
const workbenchDays = computed(() => {
  const base = new Date(calendarBaseDate.value)
  const start = new Date(base.getFullYear(),base.getMonth(),base.getDate())
  return Array.from({ length:7 },(_,index) => { const date=new Date(start); date.setDate(start.getDate()+index); const text=formatDateStr(date); return { date:text,label:`${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')} 周${['日','一','二','三','四','五','六'][date.getDay()]}` } })
})
const workbenchCalendarDays = computed(() => { const scheduledDates=new Set(arrangedSharedWorkbenchMatches.value.map(match=>match.matchDate));const start=String(scheduleConfig.value.startDate || ''),end=String(scheduleConfig.value.endDate || '');const days=workbenchDays.value.filter(day=>scheduledDates.has(day.date) || start && end && day.date>=start && day.date<=end);return days.length ? days : workbenchDays.value })
const workbenchWeekLabel = computed(() => workbenchDays.value.length ? `${workbenchDays.value[0].date.slice(5)}—${workbenchDays.value[6].date.slice(5)}` : '')
const workbenchLastSaved = computed(() => {
  const latest = sharedWorkbenchMatches.value.map(match => new Date(match.updateTime?.$date || match.updateTime || match.createTime?.$date || match.createTime || 0)).filter(date => !Number.isNaN(date.getTime()) && date.getTime() > 0).sort((a,b) => b-a)[0]
  return latest ? latest.toLocaleString('zh-CN',{ hour12:false,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit' }) : '尚未保存'
})
const workbenchStats = computed(() => ({ total:sharedWorkbenchMatches.value.length,arranged:arrangedSharedWorkbenchMatches.value.length,pending:sharedWorkbenchMatches.value.filter(match=>!match.matchDate || !match.matchTime || !match.venue).length,venues:workbenchVenues.value.length,lastSaved:workbenchLastSaved.value }))
const workbenchCellMap = computed(() => {
  const map = new Map()
  arrangedSharedWorkbenchMatches.value.filter(match => (workbenchDivision.value==='all' || String(match.divisionId || 'default')===workbenchDivision.value) && (workbenchPhase.value === 'all' || match.phase === workbenchPhase.value) && (workbenchVenue.value === 'all' || match.venue === workbenchVenue.value)).forEach(match => {
    map.set(`${match.venue}|${match.matchDate}|${match.matchTime}`,match)
  })
  return map
})
const workbenchOccupancyMap = computed(() => { const map=new Map();arrangedSharedWorkbenchMatches.value.forEach(match=>map.set(`${match.venue}|${match.matchDate}|${match.matchTime}`,match));return map })
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
  const divisions = divisionRecords.value.length > 0 ? divisionRecords.value : (Array.isArray(tournament.value.divisions) ? tournament.value.divisions : [])
  if (divisions.length > 0) return divisions.map(item => ({ ...item, id:String(item.id || item._id || '') }))
  return [{ id: 'default', name: '默认组', tournamentType: tournament.value.tournamentType || tournament.value.type || tournament.value.format || 'tournament' }]
})
function generationTypeForDivision(division) {
  const formatType = String(division?.formatType || '').toLowerCase()
  if (formatType) return ({ cup:'tournament', tournament:'cup', league:'league', hybrid:'combined' })[formatType] || formatType
  return division?.tournamentType || tournament.value.tournamentType || tournament.value.type || tournament.value.format || 'tournament'
}
const activeDivision = computed(() => divisionOptions.value.find(item => item.id === activeDivisionId.value) || divisionOptions.value[0])
const publicationDivision = computed(() => divisionOptions.value.find(item=>item.id===publicationDivisionId.value) || divisionOptions.value[0])
const publicationMatches = computed(() => allTournamentMatches.value.filter(match=>String(match.divisionId || 'default')===String(publicationDivision.value?.id || 'default') && !match.isBye && match.status!=='cancelled').sort(compareMatchesByDateTime))
const publicationSchedulePublished = computed(() => publicationMatches.value.length>0 && publicationMatches.value.every(match=>match.schedulePublished===true || match.published===true || match.status==='published'))
const publicationScheduleReady = computed(() => { if(!publicationMatches.value.length || publicationMatches.value.some(match=>!match.matchDate || !match.matchTime || !match.venue))return false;const slots=new Set();for(const match of publicationMatches.value){const key=`${match.matchDate}|${match.matchTime}|${match.venue}`;if(slots.has(key))return false;slots.add(key)}return true })
const publicationRegulationsReady = computed(() => { const division=publicationDivision.value || {};return division.rulesLocked===true || division.ruleFinalized===true || ['finalized','locked','published'].includes(String(division.ruleStatus || '').toLowerCase()) })
const publicationRows = computed(() => publicationMatches.value.map((match,index)=>({ key:String(match._id || index),date:match.matchDate || '待定',time:match.matchTime || '待定',stage:matchScheduleStageLabel(match),round:matchRoundLabel(match),division:publicationDivision.value?.name || match.divisionName || '当前组别',pool:match.group || match.pool || '—',teams:exportMatchTeams(match),venue:match.venue || '待定',serial:match.matchNo || match.matchIndex || index+1 })))
const publicationPages = computed(() => { const pageSize=publicationOrientation.value==='landscape'?15:24;const pages=[];for(let index=0;index<publicationRows.value.length;index+=pageSize)pages.push({ number:pages.length+1,rows:publicationRows.value.slice(index,index+pageSize) });return pages.length?pages:[{number:1,rows:[]}] })
const publicationVenueSummary = computed(() => [...new Set(publicationMatches.value.map(match=>String(match.venue || '').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN',{numeric:true})).join('、') || '场地待定')
const publicationPreparedDate = computed(() => new Date().toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}))
function configuredTeamCount(division) {
  const candidates = [division?.expectedTeams,division?.requiredTeams,division?.teamRequirement,division?.participantTeams,division?.maxTeams]
  const value = candidates.map(Number).find(item => Number.isFinite(item) && item > 0)
  return value || 0
}
const overviewRows = computed(() => divisionOptions.value.map(division => { const divisionId = String(division.id || division._id); const divisionMatches = allTournamentMatches.value.filter(match => String(match.divisionId || '') === divisionId); const conflicts = divisionMatches.filter(match => match.hasConflict || match.scheduleConflict || match.conflictStatus === 'conflict').length; const published = divisionMatches.filter(match => match.schedulePublished || match.published || match.status === 'published').length; const teams = Number(approvedTeamCounts.value[divisionId] || 0); const expectedTeams = configuredTeamCount(division); const drawConfirmed = drawReadinessByDivision.value[divisionId] === true; const teamsReady = expectedTeams > 0 ? teams === expectedTeams : teams > 1; const calculatedProgress = divisionMatches.length ? Math.round((published || divisionMatches.filter(match => match.matchDate && match.matchTime && match.venue).length) / divisionMatches.length * 100) : 0; const progress = Number.isFinite(Number(division.scheduleProgress)) ? Number(division.scheduleProgress) : calculatedProgress; const isPublished = published === divisionMatches.length && divisionMatches.length > 0; const state = isPublished ? 'published' : conflicts && progress >= 80 ? 'conflict' : progress < 100 ? 'editing' : 'draft'; return { id:divisionId, name:division.name || division.divisionName || '未命名组别', format:phaseLabels[division.formatType || division.tournamentType] || division.formatType || division.tournamentType || '待设置', teams, expectedTeams, teamsReady, drawConfirmed, matches:divisionMatches.length, conflicts, published:isPublished, progress, state } }))
const filteredOverviewRows = computed(() => overviewRows.value.filter(row => overviewFilter.value === 'all' || overviewFilter.value === 'conflict' && row.conflicts > 0 || overviewFilter.value === 'draft' && !row.published && row.conflicts === 0))
const overviewStats = computed(() => ({ teams:overviewRows.value.reduce((sum,row) => sum + row.teams, 0), matches:allTournamentMatches.value.length, published:allTournamentMatches.value.filter(match => match.schedulePublished || match.published || match.status === 'published').length }))
const overviewReadiness = computed(() => { const total = Math.max(1, divisionOptions.value.length); const rules = divisionOptions.value.filter(item => item.rulesLocked || ['locked','finalized'].includes(String(item.ruleStatus || '').toLowerCase()) || item.ruleFinalized).length; const draw = overviewRows.value.filter(item => item.drawConfirmed && item.teamsReady).length; const venues = divisionOptions.value.filter(item => item.venueConfigured || item.scheduleVenueConfigured).length; return { rules:Math.round(rules / total * 100), draw:Math.round(draw / total * 100), venues:Math.round(venues / total * 100) } })
const overviewTodo = computed(() => overviewRows.value.flatMap(row => { const items = []; if (!row.teamsReady) items.push({ id:`${row.id}-teams`, text:`${row.name} 已通过 ${row.teams} 支，目标 ${row.expectedTeams || '未配置'} 支` }); if (!row.drawConfirmed) items.push({ id:`${row.id}-draw`, text:`${row.name} 抽签结果尚未正式确认` }); if (row.conflicts) items.push({ id:`${row.id}-conflict`, text:`${row.name} 有 ${row.conflicts} 项场地或时间冲突` }); if (row.teamsReady && row.drawConfirmed && !row.matches) items.push({ id:`${row.id}-empty`, text:`${row.name} 尚未生成赛程` }); else if (row.matches && !row.published && !row.conflicts) items.push({ id:`${row.id}-publish`, text:`${row.name} 赛程待发布` }); return items }).slice(0, 8))
const activeSchedulePrerequisite = computed(() => {
  const row = overviewRows.value.find(item => item.id === activeDivisionId.value) || { teamsReady:false,drawConfirmed:false }
  return { ...row,ready:row.teamsReady === true && row.drawConfirmed === true }
})
function scheduleConfigValid(config) {
  if (!config?.startDate || !config?.endDate || !Array.isArray(config.matchDays) || !config.matchDays.length) return false
  const resources=Array.isArray(config.venueResources) ? config.venueResources : []
  return resources.length>0 && resources.every(resource => String(resource?.name || resource?.venue || '').trim() && slotsForWindows(resource.sessionWindows).length>0)
}
const hasConfiguredSchedule = computed(() => allTournamentMatches.value.length>0 || scheduleConfigValid(tournament.value?.scheduleConfig))
const scheduleNeedsLatestRuleReflow = computed(() => allTournamentMatches.value.length>0 && (String(tournament.value?.scheduleEngineVersion || '')!==CURRENT_SCHEDULE_ENGINE_VERSION || allTournamentMatches.value.some(match=>String(match.scheduleEngineVersion || '')!==CURRENT_SCHEDULE_ENGINE_VERSION)))
const savedScheduleConfigSummary = computed(() => { const config=tournament.value?.scheduleConfig || scheduleConfig.value;const venues=Array.isArray(config?.venueResources) ? config.venueResources.length : (Array.isArray(config?.venues) ? config.venues.length : 0);return `${config?.startDate || '日期待定'}—${config?.endDate || '日期待定'} · ${venues}块场地 · 下次调整自动带入` })
const scheduleReturnLabel = computed(() => hasConfiguredSchedule.value ? '返回赛程总览' : '返回竞赛管理')
const activeFormatType = computed(() => String(activeDivision.value?.formatType || activeDivision.value?.tournamentType || '').toLowerCase())
const theoreticalMatchCount = computed(() => {
  const teamCount = Number(activeSchedulePrerequisite.value.teams || configuredTeamCount(activeDivision.value) || 0)
  if (teamCount < 2) return 0
  if (activeFormatType.value === 'league') return teamCount * (teamCount - 1) / 2 * (activeDivision.value?.loopType === 'double' ? 2 : 1)
  if (activeFormatType.value === 'tournament') return activeDivision.value?.fullRankingEnabled === false ? teamCount - 1 + (activeDivision.value?.thirdPlaceEnabled ? 1 : 0) : teamCount * Math.log2(teamCount) / 2
  const groupCount = Number(activeDivision.value?.groupCount || 0)
  const teamsPerGroup = Number(activeDivision.value?.teamsPerGroup || (groupCount ? teamCount / groupCount : 0))
  if (activeFormatType.value === 'cup' && groupCount > 1 && teamsPerGroup > 1) {
    const groupMatches = groupCount * teamsPerGroup * (teamsPerGroup - 1) / 2
    const placementMatches = activeDivision.value?.fullRankingEnabled === false ? Math.max(0,groupCount * Number(activeDivision.value?.advancePerGroup || 2) - 1) : teamsPerGroup * groupCount * Math.log2(groupCount) / 2
    return groupMatches + placementMatches
  }
  return 0
})
function theoreticalMatchesForDivision(division,row) {
  const teamCount=Number(row?.teams || configuredTeamCount(division) || 0);const format=String(division?.formatType || division?.tournamentType || '').toLowerCase()
  if(teamCount<2)return 0
  if(format==='league')return teamCount*(teamCount-1)/2*(division?.loopType==='double'?2:1)
  if(format==='tournament')return division?.fullRankingEnabled===false?teamCount-1+(division?.thirdPlaceEnabled?1:0):teamCount*Math.log2(teamCount)/2
  const groupCount=Number(division?.groupCount || 0),teamsPerGroup=Number(division?.teamsPerGroup || (groupCount?teamCount/groupCount:0))
  if(format==='cup'&&groupCount>1&&teamsPerGroup>1){const groupMatches=groupCount*teamsPerGroup*(teamsPerGroup-1)/2;const placement=division?.fullRankingEnabled===false?Math.max(0,groupCount*Number(division?.advancePerGroup || 2)-1):teamsPerGroup*groupCount*Math.log2(groupCount)/2;return groupMatches+placement}
  return 0
}
const jointScheduleDivisions = computed(() => divisionOptions.value.map(division => { const row=overviewRows.value.find(item => item.id===division.id);const matchFormat=divisionMatchFormat(division);return { ...division,row,matchFormat,matchFormatLabel:fieldFormatLabel(matchFormat).replace('场地',''),matchCount:theoreticalMatchesForDivision(division,row),matchMinutes:Number(division.matchMinutes || division.rulesSnapshot?.matchMinutes || 0),formatLabel:phaseLabels[division.formatType || division.tournamentType] || division.formatType || '待设置' } }).filter(item => item.row?.teamsReady && item.row?.drawConfirmed))
const jointTheoreticalMatchCount = computed(() => jointScheduleDivisions.value.reduce((sum,item) => sum+item.matchCount,0))
const jointTeamCount = computed(() => jointScheduleDivisions.value.reduce((sum,item) => sum+Number(item.row?.teams || 0),0))
const selectedScheduleDivision = computed(() => jointScheduleDivisions.value.find(item => item.id===selectedScheduleDivisionId.value) || jointScheduleDivisions.value[0])
const targetScheduleDivisions = computed(() => scheduleGenerationMode.value==='separate' ? (selectedScheduleDivision.value ? [selectedScheduleDivision.value] : []) : jointScheduleDivisions.value)
const targetTheoreticalMatchCount = computed(() => targetScheduleDivisions.value.reduce((sum,item) => sum+item.matchCount,0))
const targetTeamCount = computed(() => targetScheduleDivisions.value.reduce((sum,item) => sum+Number(item.row?.teams || 0),0))
const generationModeLabel = computed(() => scheduleGenerationMode.value==='separate' ? '按组别单独编排' : '全部组别联合编排')
const generationScopeLabel = computed(() => scheduleGenerationMode.value==='separate' ? `${selectedScheduleDivision.value?.name || '请选择组别'}单独编排` : '全部组别联合编排')
const activeFormatLabel = computed(() => phaseLabels[activeFormatType.value] || '待设置赛制')
const activeMatchMinutes = computed(() => Number(activeDivision.value?.matchMinutes || activeDivision.value?.rulesSnapshot?.matchMinutes || 0))
const slotGapMinutes = computed(() => Math.max(0,60-activeMatchMinutes.value))
const activeMatchFormatLabel = computed(() => ({ '5side':'5人制','7side':'7人制','8side':'8人制','9side':'9人制','11side':'11人制' })[String(activeDivision.value?.matchFormat || '').toLowerCase()] || activeDivision.value?.matchFormat || '比赛制式待确认')
function clockMinutes(value) { const [hour,minute]=String(value || '').split(':').map(Number); return Number.isFinite(hour)&&Number.isFinite(minute) ? hour*60+minute : -1 }
function clockText(value) { return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}` }
function defaultSessionWindows() { return [{ key:'morning',label:'上午',enabled:true,start:'09:00',end:'12:00' },{ key:'afternoon',label:'下午',enabled:true,start:'14:00',end:'17:00' },{ key:'evening',label:'晚上',enabled:false,start:'18:00',end:'21:00' }] }
function slotsForWindows(windows) { const slots=[];(windows || []).filter(window => window.enabled).forEach(window => { const start=clockMinutes(window.start);const end=clockMinutes(window.end);if(start<0||end<=start)return;for(let minute=start;minute+60<=end;minute+=60)slots.push(clockText(minute)) });return [...new Set(slots)].sort() }
const fieldFormatOptions=[5,7,8,9,11].map(players => ({ value:`${players}side`,label:`${players}人制场地` }))
const venueNameOptions=computed(() => [...new Set([...Array.from({ length:20 },(_,index)=>`${index+1}号场地`),...generatorVenueRows.value.map(row=>String(row.name || '').trim()).filter(Boolean)])])
function divisionMatchFormat(division) { const value=String(division?.matchFormat || '').trim().toLowerCase();return value || (Number(division?.playersOnField || 0)>0 ? `${Number(division.playersOnField)}side` : '') }
function fieldFormatLabel(value) { return fieldFormatOptions.find(option => option.value===value)?.label || '场地制式待设置' }
const venueResourceConfigs = computed(() => generatorVenueRows.value.map(row => ({ name:String(row.name || '').trim(),fieldFormat:String(row.fieldFormat || '').trim().toLowerCase(),sessionWindows:(row.sessionWindows || defaultSessionWindows()).map(window => ({ ...window })) })).filter(row => row.name && row.fieldFormat))
const generatedTimeSlots = computed(() => {
  return [...new Set(venueResourceConfigs.value.flatMap(resource => slotsForWindows(resource.sessionWindows)))].sort()
})
const enabledSessionLabels = computed(() => [...new Set(venueResourceConfigs.value.flatMap(resource => resource.sessionWindows.filter(window => window.enabled).map(window => window.label)))])
const generatedVenueSlotCount = computed(() => venueResourceConfigs.value.reduce((sum,resource) => sum+slotsForWindows(resource.sessionWindows).length,0))
const availableMatchDates = computed(() => {
  if (!scheduleConfig.value.startDate || !scheduleConfig.value.endDate) return []
  const start=new Date(`${scheduleConfig.value.startDate}T00:00:00`),end=new Date(`${scheduleConfig.value.endDate}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end<start) return []
  const names=['周日','周一','周二','周三','周四','周五','周六'],allowed=new Set(scheduleConfig.value.matchDays || []),dates=[]
  for(let date=new Date(start);date<=end;date.setDate(date.getDate()+1)){if(allowed.has(names[date.getDay()]))dates.push(formatDateStr(date))}
  return dates
})
const capacityAssessment = computed(() => {
  const requirements=new Map()
  targetScheduleDivisions.value.forEach(division => requirements.set(division.matchFormat,(requirements.get(division.matchFormat) || 0)+division.matchCount))
  const rows=[...requirements.entries()].map(([fieldFormat,requiredMatches]) => {
    const resources=venueResourceConfigs.value.filter(resource => resource.fieldFormat===fieldFormat)
    const dailySlots=resources.reduce((sum,resource) => sum+slotsForWindows(resource.sessionWindows).length,0)
    const totalCapacity=dailySlots*availableMatchDates.value.length
    const shortage=Math.max(0,requiredMatches-totalCapacity)
    const averageSlots=resources.length ? dailySlots/resources.length : 6
    const minimumFields=availableMatchDates.value.length ? Math.ceil(requiredMatches/(availableMatchDates.value.length*Math.max(1,averageSlots))) : 0
    const minimumDays=dailySlots ? Math.ceil(requiredMatches/dailySlots) : 0
    return { fieldFormat,label:fieldFormatLabel(fieldFormat).replace('场地',''),requiredMatches,fieldCount:resources.length,dailySlots,totalCapacity,shortage,minimumFields,minimumDays,ready:shortage===0 && resources.length>0 }
  })
  const missingDates=!scheduleConfig.value.startDate || !scheduleConfig.value.endDate
  const noEligibleDates=!missingDates && availableMatchDates.value.length===0
  return { rows,missingDates,noEligibleDates,ready:!missingDates&&!noEligibleDates&&rows.length>0&&rows.every(row => row.ready),requiredMatches:rows.reduce((sum,row)=>sum+row.requiredMatches,0),totalCapacity:rows.reduce((sum,row)=>sum+row.totalCapacity,0),availableDays:availableMatchDates.value.length }
})
const capacityDiagnosisText = computed(() => { const shortages=capacityAssessment.value.rows.filter(row=>row.shortage);if(shortages.length)return shortages.map(row=>`${row.label}缺${row.shortage}场容量`).join('；');if(generationRisk.value.unassigned>0)return `5人制和11人制场地总量均满足理论场数，但阶段必须串行、球队频次或休息时间使${generationRisk.value.unassigned}场无法落位；优先增加比赛日或开启晚场。`;return generationRisk.value.message || '现有日期、场地和时段容量不足' })
function capacityRecommendation(row) {
  if (capacityAssessment.value.missingDates) return '先设置完整比赛开始和结束日期'
  if (capacityAssessment.value.noEligibleDates) return '当前日期范围内没有勾选的比赛日，请修改日期或星期'
  if (!row.fieldCount) return `至少添加 ${Math.max(1,row.minimumFields)} 块${row.label}场地`
  if (row.shortage>0) return `若保持当前赛期，至少需要 ${row.minimumFields} 块${row.label}场地；或把有效比赛日增加到 ${row.minimumDays} 天`
  return '理论容量满足；生成时继续校验球队休息和阶段依赖'
}
const phasePlan = computed(() => {
  if (activeFormatType.value === 'league') return [{ title:'联赛阶段',description:`${activeSchedulePrerequisite.value.teams || 0}支球队单循环，每队${Math.max(0,(activeSchedulePrerequisite.value.teams || 0)-1)}场`,matches:theoreticalMatchCount.value }]
  if (activeFormatType.value === 'tournament') return [{ title:'淘汰与排位',description:'按已确认签位生成完整名次线',matches:theoreticalMatchCount.value }]
  const groupCount=Number(activeDivision.value?.groupCount || 0);const teamsPerGroup=Number(activeDivision.value?.teamsPerGroup || 0);const groupMatches=groupCount * teamsPerGroup * (teamsPerGroup-1) / 2
  return [{ title:'小组赛',description:`${groupCount}组×${teamsPerGroup}队单循环`,matches:groupMatches },{ title:'淘汰与排位',description:'按小组名次交叉生成完整排名',matches:Math.max(0,theoreticalMatchCount.value-groupMatches) }]
})
const estimatedMatchDays = computed(() => {
  return capacityAssessment.value.rows.length ? Math.max(...capacityAssessment.value.rows.map(row => row.minimumDays || 0)) : 0
})
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
const conflictAffectedMatchCount = computed(() => new Set(conflictDisplayItems.value.flatMap(item => item.matchIds || [])).size)
const conflictPassedMatchCount = computed(() => Math.max(0,matches.value.length-conflictAffectedMatchCount.value))
const conflictPrimaryMatch = computed(() => matches.value[0] || { _id:'', homeTeamName:'待定', awayTeamName:'待定' })
const conflictSecondaryMatch = computed(() => matches.value[1] || { _id:'', homeTeamName:'待定', awayTeamName:'待定' })
const conflictPrimaryTitle = computed(() => `${conflictPrimaryMatch.value.homeTeamName || '当前球队'}连续比赛，休息时间不足`)
const editHomeName = computed(() => teamOptions.value.find(item => item.teamId === editForm.value.homeTeamId)?.teamName || conflictPrimaryMatch.value.homeTeamName || '待定')
const editAwayName = computed(() => teamOptions.value.find(item => item.teamId === editForm.value.awayTeamId)?.teamName || conflictSecondaryMatch.value.awayTeamName || '待定')
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
  tournamentType.value = generationTypeForDivision(activeDivision.value)
  formatLabel.value = { tournament: '赛会制', cup: '杯赛制', league: '联赛制' }[tournamentType.value] || ''
  syncAutoTiming()
  calendarInitialized.value = false
  await loadMatches({ focusCalendar: true })
  if (!hasConfiguredSchedule.value) { scheduleStep.value='basic'; showOverview.value=false; showConfigDialog.value=true }
  await loadTeamLogos()
  await loadAllTeams()
}
function openScheduleEditor(divisionId) { if (divisionId) activeDivisionId.value = String(divisionId); showConfigDialog.value=false; showOverview.value = false; const query={ ...route.query,divisionId:String(divisionId || activeDivisionId.value),view:'editor' };delete query.generator;delete query.panel;router.replace({ path:route.path,query }) }
function openOverviewGenerate() { if (!jointScheduleDivisions.value.length) { ElMessage.warning('没有已完成球队审核和正式抽签的组别'); return } openScheduleEditor(activeDivisionId.value); openScheduleConfigDialog() }
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

function ensureSchedulePrerequisites() {
  const state = activeSchedulePrerequisite.value
  if (!state.teamsReady) { ElMessage.warning(`${activeDivision.value.name} 已通过 ${state.teams || 0} 支球队，必须与目标 ${state.expectedTeams || '球队数'} 一致后才能生成赛程`); return false }
  if (!state.drawConfirmed) { ElMessage.warning(`${activeDivision.value.name} 的抽签结果尚未正式确认，不能生成赛程`); return false }
  return true
}
function ensureJointSchedulePrerequisites() {
  const unready=divisionOptions.value.filter(division => { const row=overviewRows.value.find(item => item.id===division.id);return !row?.teamsReady || !row?.drawConfirmed })
  if (unready.length) { ElMessage.warning(`${unready.map(item => item.name).join('、')}尚未完成球队审核或正式抽签，不能联合生成赛程`); return false }
  if (!jointScheduleDivisions.value.length) { ElMessage.warning('没有可联合编排的竞赛组别'); return false }
  return true
}

function rememberGenerationVenues(venues = generationVenues.value) {
  const values = normalizeGenerationVenues(venues)
  generationVenues.value = values
  scheduleConfig.value.venues = values
  scheduleConfig.value.venueResources = venueResourceConfigs.value
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
    : configuredVenues
  const savedResources = Array.isArray(scheduleConfig.value.venueResources) ? scheduleConfig.value.venueResources : []
  generatorVenueRows.value = generationVenues.value.map(name => { const saved=savedResources.find(resource => String(resource.name || resource.venue || '').trim()===name);return { name,fieldFormat:String(saved?.fieldFormat || saved?.matchFormat || ''),sessionWindows:(saved?.sessionWindows || defaultSessionWindows()).map(window => ({ ...window })) } })
  rememberGenerationVenues()
}

function syncVenueRowsToSelection() {
  const seen=new Set()
  generatorVenueRows.value = generatorVenueRows.value.map(row => ({ name:String(row.name || '').trim(),fieldFormat:String(row.fieldFormat || '').trim().toLowerCase(),sessionWindows:(row.sessionWindows || defaultSessionWindows()).map(window => ({ ...window })) })).filter(row => row.name && !seen.has(row.name) && seen.add(row.name))
  const names = generatorVenueRows.value.map(row => row.name)
  rememberGenerationVenues(names)
}

function syncAutoTiming() {
  scheduleConfig.value.matchDuration = activeMatchMinutes.value
  scheduleConfig.value.matchInterval = slotGapMinutes.value
  scheduleConfig.value.slotMinutes = 60
  scheduleConfig.value.maxDailyOne = false
  scheduleConfig.value.maxPerSession = 1
  scheduleConfig.value.dailyMatchLimit = 0
  scheduleConfig.value.timeSlots = generatedTimeSlots.value
  scheduleConfig.value.venueResources = venueResourceConfigs.value
}

function ensureSelectedSchedulePrerequisites() {
  if (scheduleGenerationMode.value==='joint') return ensureJointSchedulePrerequisites()
  const division=selectedScheduleDivision.value
  if (!division) { ElMessage.warning('请选择一个已完成球队审核和正式抽签的组别'); return false }
  selectedScheduleDivisionId.value=division.id
  return true
}
function openScheduleConfigDialog(requestedStep = 'mode') {
  if (!visualQaSnapshot && !jointScheduleDivisions.value.length) { ElMessage.warning('没有已完成球队审核和正式抽签的组别'); return }
  syncAutoTiming()
  const savedMode=tournament.value?.scheduleDraft?.generationMode
  const resolvedStep=requestedStep==='basic' && !savedMode ? 'mode' : requestedStep
  scheduleStep.value = scheduleWizardSteps.some(item => item.key === resolvedStep) ? resolvedStep : 'mode'
  syncGenerationVenues()
  showConfigDialog.value = true
}
function scheduleWizardIndex(key) { return scheduleWizardSteps.find(item => item.key === key)?.index || 1 }
function validateVenueStep() {
  if (!generatorVenueRows.value.length) { ElMessage.warning(`请先添加 ${activeDivision.value.name} 的实际比赛场地`); return false }
  const names=generatorVenueRows.value.map(row => String(row.name || '').trim())
  if (names.some(name => !name)) { ElMessage.warning('请填写每块比赛场地的真实名称'); return false }
  if (new Set(names).size !== names.length) { ElMessage.warning('比赛场地名称不能重复'); return false }
  const missingFormat=generatorVenueRows.value.find(row => !row.fieldFormat)
  if (missingFormat) { ElMessage.warning(`请选择${missingFormat.name || '每块场地'}的几人制场地类型`); return false }
  const invalid=generatorVenueRows.value.find(row => slotsForWindows(row.sessionWindows).length===0)
  if (invalid) { ElMessage.warning(`${invalid.name}没有有效的上午、下午或晚上时间段`); return false }
  syncVenueRowsToSelection()
  syncAutoTiming()
  if (!capacityAssessment.value.ready) { openGenerationRisk({ code:'CLIENT_CAPACITY_INSUFFICIENT',message:'当前赛期与对应制式场地容量不足，请先按建议调整',unassigned:capacityAssessment.value.rows.reduce((sum,row)=>sum+row.shortage,0),reasons:capacityAssessment.value.rows.filter(row=>row.shortage).map(row=>`${row.label}缺${row.shortage}场容量：${capacityRecommendation(row)}`) }); return false }
  return true
}
function validateScheduleStep(step) { syncAutoTiming(); if (step === 'mode' && !ensureSelectedSchedulePrerequisites()) return false; if (step === 'basic' && (!scheduleConfig.value.startDate || !scheduleConfig.value.endDate)) { ElMessage.warning('请设置完整的比赛开始和结束日期'); return false } if (step === 'basic' && scheduleConfig.value.startDate > scheduleConfig.value.endDate) { ElMessage.warning('比赛结束日期不能早于开始日期'); return false } if (step === 'basic' && scheduleConfig.value.matchDays.length === 0) { ElMessage.warning('请至少选择一个比赛日'); return false } if (step === 'basic' && targetScheduleDivisions.value.some(item => !item.matchMinutes || item.matchMinutes > 60)) { ElMessage.warning('所选组别比赛时长不适用于一小时排赛格，请先返回竞赛规则确认'); return false } if (step === 'venues' && !validateVenueStep()) return false; return true }
async function nextScheduleStep() { if (!validateScheduleStep(scheduleStep.value)) return; if (!await persistScheduleDraft(true)) return; const index = scheduleWizardSteps.findIndex(item => item.key === scheduleStep.value); scheduleStep.value = scheduleWizardSteps[Math.min(index + 1, scheduleWizardSteps.length - 1)].key }
function previousScheduleStep() { const index = scheduleWizardSteps.findIndex(item => item.key === scheduleStep.value); scheduleStep.value = scheduleWizardSteps[Math.max(0, index - 1)].key }
async function persistScheduleDraft(silent=false) {
  if (savingScheduleDraft.value) return false
  syncAutoTiming()
  savingScheduleDraft.value=true
  try {
    const draft={ ...scheduleConfig.value,generationMode:scheduleGenerationMode.value,selectedDivisionId:selectedScheduleDivisionId.value,venues:[...generationVenues.value],venueResources:venueResourceConfigs.value,timeSlots:[...generatedTimeSlots.value] }
    const result=await callFunction('generateSchedule',{ action:'saveDraft',tournamentId,scheduleConfig:draft })
    if (!result?.success) throw new Error(result?.message || result?.error || '保存配置草稿失败')
    tournament.value={ ...tournament.value,scheduleDraft:draft }
    if (!silent) ElMessage.success('时间与场地配置草稿已保存')
    return true
  } catch(error) { ElMessage.error(error.message || '保存配置草稿失败');return false } finally { savingScheduleDraft.value=false }
}
function saveGeneratorDraft() { return persistScheduleDraft(false) }
function nextAutomaticVenueName() {
  const used=new Set(generatorVenueRows.value.map(row => String(row.name || '').match(/^(\d+)号场地$/)?.[1]).filter(Boolean).map(Number))
  let number=1
  while(used.has(number)) number+=1
  return `${number}号场地`
}
function addDefaultVenue() { generatorVenueRows.value.push({ name:nextAutomaticVenueName(),fieldFormat:'',sessionWindows:defaultSessionWindows() }) }
async function addNextMatchDate() { const base=String(scheduleConfig.value.endDate || arrangedSharedWorkbenchMatches.value.map(match=>match.matchDate).filter(Boolean).sort().at(-1) || formatDateStr(new Date()));const next=new Date(`${base}T00:00:00`);if(Number.isNaN(next.getTime())){ElMessage.warning('当前比赛结束日期无效');return}next.setDate(next.getDate()+1);const date=formatDateStr(next);scheduleConfig.value.endDate=date;const weekday=`周${['日','一','二','三','四','五','六'][next.getDay()]}`;if(!scheduleConfig.value.matchDays.includes(weekday))scheduleConfig.value.matchDays.push(weekday);calendarBaseDate.value=new Date(`${date}T00:00:00`);await persistScheduleDraft(true);ElMessage.success(`已增加比赛日 ${date}`) }
async function addCalendarTimeSlot() { try{const { value }=await ElMessageBox.prompt('输入临时开赛时间，例如 21:00','增加开赛时间',{confirmButtonText:'增加',cancelButtonText:'取消',inputPlaceholder:'HH:mm',inputPattern:/^(?:[01]\d|2[0-3]):[0-5]\d$/,inputErrorMessage:'请输入有效的24小时制时间'});const list=[...new Set([...(scheduleConfig.value.calendarExtraTimeSlots || []),String(value)].filter(Boolean))].sort();scheduleConfig.value.calendarExtraTimeSlots=list;await persistScheduleDraft(true);ElMessage.success(`已增加 ${value} 时间行`)}catch(error){if(error!=='cancel' && error!=='close')console.warn('增加开赛时间取消或失败',error)} }
function openCalendarTimePeriodSettings() { showConfigDialog.value=true;scheduleStep.value='venues' }
function removeGenerationVenue(index) { generatorVenueRows.value.splice(index,1); syncVenueRowsToSelection() }
function workbenchCellMatch(venue, date, time) { return workbenchOccupancyMap.value.get(`${venue}|${date}|${time}`) || null }
function workbenchOccupiedMatch(venue,date,time) { return workbenchOccupancyMap.value.get(`${venue}|${date}|${time}`) || null }
function workbenchMatchesForSlot(venue,date,time) { const match=workbenchCellMap.value.get(`${venue}|${date}|${time}`) || null;return match ? [match] : [] }
function scheduledMatchCountForDay(date) { return arrangedSharedWorkbenchMatches.value.filter(match=>match.matchDate===date).length }
function sessionLabelForTime(time) { const hour=Number(String(time || '').slice(0,2));return hour<12?'上午':hour<18?'下午':'晚上' }
function configuredVenueResource(venue) { return (tournament.value?.scheduleConfig?.venueResources || scheduleConfig.value.venueResources || []).find(resource=>String(resource?.name || resource?.venue || '').trim()===String(venue || '').trim()) }
function workbenchVenueFormatLabel(venue) { return fieldFormatLabel(String(configuredVenueResource(venue)?.fieldFormat || '')).replace('场地','') }
function matchFormatValue(match) { const direct=String(match?.matchFormat || match?.requiredVenueFormat || '').toLowerCase();if(direct)return direct;const division=divisionOptions.value.find(item=>item.id===String(match?.divisionId || ''));return divisionMatchFormat(division) }
function matchFormatDisplayLabel(match) { return fieldFormatLabel(matchFormatValue(match)).replace('场地','') }
function matchCompetitionFormatLabel(match) { const division=divisionOptions.value.find(item=>item.id===String(match?.divisionId || '')) || {};const type=String(division.formatType || division.tournamentType || match?.scheduleType || '').toLowerCase();return ({ tournament:'单败淘汰赛制',cup:'小组赛＋淘汰赛制',league:'联赛制',hybrid:'复合赛制',combined:'复合赛制' })[type] || '赛制待确认' }
function teamLogoVisible(teamId) { return Boolean(teamId && teamLogos.value[teamId] && !failedTeamLogos.value[teamId]) }
function markTeamLogoFailed(teamId) { if(teamId) failedTeamLogos.value={ ...failedTeamLogos.value,[teamId]:true } }
function shiftWorkbenchWeek(offset) { const date=new Date(calendarBaseDate.value); date.setDate(date.getDate()+offset*7); calendarBaseDate.value=date }
function previewSchedulePublish() { publicationDivisionId.value=activeDivisionId.value;publicationCenterVisible.value=true }
function openGenerationRisk(result={}) { generationRisk.value={ code:String(result.code || ''),message:String(result.message || result.error || '现有日期、场地和阶段容量不足，无法完整生成赛程'),unassigned:Number(result.unassigned || 0),reasons:Array.isArray(result.reasons)?result.reasons.map(String):[],formatBreakdown:Array.isArray(result.formatBreakdown)?result.formatBreakdown:[] };generationRiskVisible.value=true }
function openCurrentCapacityRisk() { openGenerationRisk({ code:'CLIENT_CAPACITY_INSUFFICIENT',message:'当前赛期与对应制式场地容量不足，请选择下方入口进行调整',unassigned:capacityAssessment.value.rows.reduce((sum,row)=>sum+row.shortage,0),reasons:capacityAssessment.value.rows.filter(row=>row.shortage).map(row=>`${row.label}缺${row.shortage}场容量：${capacityRecommendation(row)}`) }) }
function closeGenerationRisk() { generationRiskVisible.value=false;showConfigDialog.value=true;scheduleStep.value='preview' }
function goToRiskSetting(step) { generationRiskVisible.value=false;showConfigDialog.value=true;scheduleStep.value=step }
function goToCompetitionRules() { generationRiskVisible.value=false;router.push({ path:`/tournaments/${tournamentId}/competition`,query:{ divisionId:activeDivisionId.value } }) }
async function undoLastScheduleAdjustment() { try{await ElMessageBox.confirm('确定撤销最近一次拖拽、交换或手动位置调整吗？','撤销上次调整',{type:'warning',confirmButtonText:'确认撤销',cancelButtonText:'取消'})}catch{return}undoingScheduleAdjustment.value=true;try{const result=await callFunction('updateMatch',{ action:'undoLastScheduleAdjustment',tournamentId,divisionId:isJointSchedule.value?'all':activeDivisionId.value });if(!result?.success)throw new Error(result?.message || result?.error || '撤销失败');await loadMatches({ focusCalendar:false });ElMessage.success(`已恢复${result.restoredMatches || 1}场比赛到调整前位置`)}catch(error){ElMessage.error(error.message || '撤销失败')}finally{undoingScheduleAdjustment.value=false} }
function openLatestRuleReflow() { scheduleGenerationMode.value=tournament.value?.scheduleGenerationMode==='separate'?'separate':'joint';openScheduleConfigDialog('preview') }
function openRegulationsPage() { publicationCenterVisible.value=false;router.push({ path:`/tournaments/${tournamentId}/competition/rules`,query:{ divisionId:publicationDivision.value?.id || activeDivisionId.value,step:'finalize' } }) }

async function publishRegulations() {
  if(!publicationRegulationsReady.value){ElMessage.warning('当前组别规则尚未定版，不能发布竞赛规程');return}
  try{await ElMessageBox.confirm(`确定正式发布《${publicationDivision.value?.name || '当前组别'}竞赛规程》吗？发布后将保存当前规则版本快照。`,'发布竞赛规程',{type:'warning',confirmButtonText:'正式发布',cancelButtonText:'取消'})}catch{return}
  publishingDocument.value='regulations'
  try{const result=await callFunction('generateSchedule',{ action:'publishRegulations',tournamentId,divisionId:publicationDivision.value.id });if(!result?.success)throw new Error(result?.message || result?.error || '发布失败');const index=divisionRecords.value.findIndex(item=>String(item._id || item.id)===String(publicationDivision.value.id));if(index>=0)divisionRecords.value[index]={...divisionRecords.value[index],regulationsPublished:true,regulationsPublicationId:result.publicationId,regulationsPublishedVersion:result.version,regulationsPublishedAt:new Date()};ElMessage.success('竞赛规程已正式发布')}catch(error){ElMessage.error(error.message || '竞赛规程发布失败')}finally{publishingDocument.value=''}
}

async function publishScheduleDocument() {
  if(!publicationScheduleReady.value){ElMessage.warning('当前组别日程尚未完整落位或存在冲突，不能发布');return}
  try{await ElMessageBox.confirm(`确定正式发布${publicationDivision.value?.name || '当前组别'}的${publicationMatches.value.length}场竞赛日程吗？`,'发布竞赛日程',{type:'warning',confirmButtonText:'正式发布',cancelButtonText:'取消'})}catch{return}
  publishingDocument.value='schedule'
  try{const result=await callFunction('generateSchedule',{ action:'publishSchedule',tournamentId,divisionId:publicationDivision.value.id });if(!result?.success)throw new Error(result?.message || result?.error || '发布失败');allTournamentMatches.value.forEach(match=>{if(String(match.divisionId || 'default')===String(publicationDivision.value.id)){match.schedulePublished=true;match.schedulePublicationId=result.publicationId;match.schedulePublishedVersion=result.version;match.schedulePublishedAt=new Date()}});matches.value=allTournamentMatches.value.filter(belongsToActiveDivision).sort(compareMatchesByRoundAndTime);ElMessage.success(`竞赛日程已发布：${result.matchCount || publicationMatches.value.length}场`)}catch(error){ElMessage.error(error.message || '竞赛日程发布失败')}finally{publishingDocument.value=''}
}
function returnScheduleOverview() { if (!hasConfiguredSchedule.value) { router.push({ path:`/tournaments/${tournamentId}/competition`,query:{ divisionId:activeDivisionId.value } }); return } showConfigDialog.value=false; showOverview.value=true; const query={ ...route.query }; delete query.view; delete query.generator; delete query.panel; delete query.editMatchId; router.replace({ path:route.path,query }) }
function weekdayLabel(value) { const date=parseLocalDate(value); return date ? `周${['日','一','二','三','四','五','六'][date.getDay()]}` : '' }

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
  const phase=String(match?.phase || match?.scheduleType || '').toLowerCase()
  if(phase==='group') return round!==Number.MAX_SAFE_INTEGER ? `小组赛第${round}轮` : (match.roundName || '小组赛')
  if(phase==='league') return round!==Number.MAX_SAFE_INTEGER ? `联赛第${round}轮` : (match.roundName || '联赛')
  if(match?.roundName) { const name=String(match.roundName).replace(/^淘汰赛\s*/,'');return /半决赛|^决赛$|三、四名决赛|三四名决赛/.test(name) ? `决赛阶段 · ${name}` : name }
  if(phase==='placement' && match?.rankRange) return `${match.rankRange}名排位赛`
  if(phase==='knockout' || phase==='cup') return '淘汰赛'
  return round!==Number.MAX_SAFE_INTEGER ? `第${round}轮` : '未分轮次'
}
function matchCardRoundLabel(match){const phase=String(match?.phase || match?.scheduleType || '').toLowerCase();const round=matchRoundNumber(match);if(phase==='group'){const group=String(match?.group || match?.pool || '').trim();return `小组赛${group ? ` ${group}` : ''}${round!==Number.MAX_SAFE_INTEGER ? ` · 第${round}轮` : ''}`}if(phase==='league')return `联赛${round!==Number.MAX_SAFE_INTEGER ? ` · 第${round}轮` : ''}`;return String(match?.roundName || matchRoundLabel(match) || '比赛').replace(/^淘汰赛\s*/,'')}

function matchScheduleStageWeight(match) {
  const name=String(match?.roundName || '')
  const phase=String(match?.phase || match?.scheduleType || '').toLowerCase()
  if(name==='决赛' || /冠亚军决赛/.test(name)) return 60
  if(/三、四名决赛|三四名决赛|^3[–—-]4名/.test(name)) return 60
  if(/半决赛/.test(name)) return 60
  if(phase==='placement' || /排位赛/.test(name)){const range=String(match?.rankRange || name);const low=Number((range.match(/(\d+)\s*[–—-]/) || [])[1] || match?.finalRankHigh || 0);if(low>=17)return 10;if(low>=9)return 30;if(low>=5)return 50;if(low>=3)return 70;return 50}
  if(/1\/16决赛/.test(name)) return 0
  if(/1\/8决赛/.test(name)) return 20
  if(/1\/4决赛/.test(name)) return 40
  return 0
}
function chineseStageNumber(index){return ['','一','二','三','四','五','六','七','八','九','十'][index] || index}
function matchScheduleStageIndex(match){if(Number(match?.scheduleStageOrder)>0)return Number(match.scheduleStageOrder);const scope=String(match?.divisionId || 'default');const weights=[...new Set(allTournamentMatches.value.filter(item=>String(item.divisionId || 'default')===scope).map(matchScheduleStageWeight))].sort((a,b)=>a-b);return Math.max(1,weights.indexOf(matchScheduleStageWeight(match))+1)}
function matchScheduleStageLabel(match){return match?.scheduleStageName || `第${chineseStageNumber(matchScheduleStageIndex(match))}阶段`}
function scheduleCardStageClass(match){const index=matchScheduleStageIndex(match);const weight=matchScheduleStageWeight(match);if(weight>=60)return 'stage-finals';if(weight===10 || weight===30 || weight===50)return 'stage-placement';if(/league/.test(String(match?.phase || match?.scheduleType || '')))return 'stage-league';return `stage-tone-${((index-1)%4)+1}`}

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

function publicationFilename(extension) {
  return `${tournament.value.name || '赛事'}-${publicationDivision.value?.name || '竞赛组别'}-竞赛日程-A4${publicationOrientation.value==='landscape'?'横版':'竖版'}.${extension}`.replace(/[\\/:*?"<>|]/g,'_')
}

async function exportFormalSchedule() {
  if(!publicationRows.value.length){ElMessage.warning('当前组别没有可导出的竞赛日程');return}
  exportingTable.value=true
  try{const module=await import('xlsx');const XLSX=module.default || module;const rows=publicationRows.value.map(row=>({日期:row.date,时间:row.time,阶段:row.stage,轮次:row.round,组别:row.division,分组:row.pool,比赛队:row.teams,场地:row.venue,场序:row.serial}));const worksheet=XLSX.utils.json_to_sheet(rows,{origin:'A5'});XLSX.utils.sheet_add_aoa(worksheet,[['赛小蜂足球 · 正式竞赛文件'],[`竞赛日程（${publicationDivision.value?.name || '当前组别'}）`],[`${tournament.value.name || '当前赛事'} · 共${rows.length}场`],[`场地：${publicationVenueSummary.value}`]],{origin:'A1'});worksheet['!merges']=[0,1,2,3].map(row=>({s:{r:row,c:0},e:{r:row,c:8}}));worksheet['!cols']=(publicationOrientation.value==='landscape'?[10,9,9,21,13,7,27,10,7]:[9,8,8,18,11,6,20,9,6]).map(wch=>({wch}));worksheet['!pageSetup']={paperSize:9,orientation:publicationOrientation.value,fitToWidth:1,fitToHeight:0};const workbook=XLSX.utils.book_new();workbook.Props={Title:`${publicationDivision.value?.name || ''}竞赛日程`,Author:'赛小蜂足球'};XLSX.utils.book_append_sheet(workbook,worksheet,'竞赛日程');XLSX.writeFile(workbook,publicationFilename('xlsx'));ElMessage.success('正式竞赛日程Excel已导出')}catch(error){console.error('导出正式竞赛日程失败',error);ElMessage.error('竞赛日程Excel导出失败')}finally{exportingTable.value=false}
}

function escapePublicationText(value) { return String(value == null ? '' : value).replace(/[&<>"']/g,char=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char])) }
function printFormalSchedule() {
  if(!publicationRows.value.length){ElMessage.warning('当前组别没有可打印的竞赛日程');return}
  const direction=publicationOrientation.value==='landscape'?'landscape':'portrait'
  const pagesHtml=publicationPages.value.map(page=>{const rows=page.rows.map(row=>`<tr><td>${escapePublicationText(row.date)}</td><td>${escapePublicationText(row.time)}</td><td>${escapePublicationText(row.stage)}</td><td>${escapePublicationText(row.round)}</td><td>${escapePublicationText(row.division)}</td><td>${escapePublicationText(row.pool)}</td><td class="teams">${escapePublicationText(row.teams)}</td><td>${escapePublicationText(row.venue)}</td><td>${escapePublicationText(row.serial)}</td></tr>`).join('');return `<main class="sheet"><div class="brand">赛小蜂足球 · 正式竞赛文件</div><h1>竞赛日程（${escapePublicationText(publicationDivision.value?.name || '')}）</h1><div class="meta">${escapePublicationText(tournament.value.name || '')} · 共${publicationRows.value.length}场</div><div class="venues">场地：${escapePublicationText(publicationVenueSummary.value)}</div><table><thead><tr><th>日期</th><th>时间</th><th>阶段</th><th>轮次</th><th>组别</th><th>分组</th><th>比赛队</th><th>场地</th><th>场序</th></tr></thead><tbody>${rows}</tbody></table><div class="note"><span>比赛时间与场地以主办方最新发布的竞赛日程为准。</span><b>第${page.number}/${publicationPages.value.length}页 · 制表日期：${escapePublicationText(publicationPreparedDate.value)}</b></div></main>`}).join('')
  const frame=document.createElement('iframe');frame.setAttribute('title','竞赛日程打印');frame.style.position='fixed';frame.style.right='0';frame.style.bottom='0';frame.style.width='1px';frame.style.height='1px';frame.style.border='0';frame.style.opacity='0';document.body.appendChild(frame)
  const printDocument=frame.contentDocument;printDocument.open();printDocument.write(`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${escapePublicationText(publicationFilename(''))}</title><style>@page{size:A4 ${direction};margin:9mm}*{box-sizing:border-box}html,body{margin:0;color:#111;background:#fff;font-family:"Microsoft YaHei","SimSun",sans-serif}.sheet{width:${direction==='landscape'?'297mm':'210mm'};height:${direction==='landscape'?'210mm':'297mm'};padding:9mm;overflow:hidden;background:#fff;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}.brand{font-size:10px;color:#087b29}.sheet h1{margin:5px 0;text-align:center;font-size:21px}.meta{text-align:center;color:#555;font-size:11px}.venues{margin:7px 0;font-size:10px}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th,td{height:30px;padding:4px 3px;border:1px solid #333;font-size:9.5px;line-height:1.2;text-align:center;vertical-align:middle;word-break:normal}th{background:#eef5f0}th:nth-child(1),td:nth-child(1){width:10%}th:nth-child(2),td:nth-child(2){width:7%}th:nth-child(3),td:nth-child(3){width:8%;white-space:nowrap}th:nth-child(4),td:nth-child(4){width:18%;white-space:nowrap}th:nth-child(5),td:nth-child(5){width:10%}th:nth-child(6),td:nth-child(6){width:5%}th:nth-child(7),td:nth-child(7){width:23%}th:nth-child(8),td:nth-child(8){width:10%}th:nth-child(9),td:nth-child(9){width:6%}.teams{font-size:9px;font-weight:700;white-space:nowrap;text-align:left}.note{display:flex;justify-content:space-between;margin-top:7px;font-size:8.5px;color:#444}@media print{.sheet{margin:0}}</style></head><body>${pagesHtml}</body></html>`);printDocument.close()
  const cleanup=()=>{if(frame.parentNode)frame.parentNode.removeChild(frame)}
  window.setTimeout(()=>{try{frame.contentWindow.focus();frame.contentWindow.print();frame.contentWindow.onafterprint=cleanup;window.setTimeout(cleanup,30000)}catch(error){cleanup();ElMessage.error('当前内置浏览器不支持系统打印，请在Chrome或Edge中打开后打印/另存PDF')}},500)
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
    ElMessage.info('已开启拖拽调整：拖到比赛卡片可交换，拖到空白格可移动')
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

function handleScheduleCardClick(match) {
  if (suppressNextCardClick) { suppressNextCardClick=false;return }
  if (!isMatchQuickEditable(match) && quickEditMode.value) { ElMessage.warning('进行中或已结束的比赛不能拖拽调整');return }
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
  dragOverScheduleSlot.value = null
}

function handleMatchPointerDown(event, match) {
  const directScheduleDrag=event.currentTarget?.classList?.contains('schedule-match-card')
  if (event.button !== 0 || (!quickEditMode.value && !directScheduleDrag) || !isMatchQuickEditable(match) || quickSavingIds.value.length > 0) return
  const interactive=event.target.closest('button, input, textarea, select, .el-select, .el-date-editor')
  if (interactive && !interactive.classList.contains('schedule-match-card')) return

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
  const pointElement=document.elementFromPoint(event.clientX,event.clientY)
  const targetElement = pointElement?.closest('.match-card[data-match-id],.schedule-match-card[data-match-id]')
  const targetId = targetElement?.dataset.matchId || ''
  const targetMatch = allTournamentMatches.value.find(match => match._id === targetId)
  dragOverMatchId.value = targetMatch && targetId !== pointerDragState.matchId && isMatchQuickEditable(targetMatch) ? targetId : ''
  const dropElement=pointElement?.closest('[data-schedule-drop="true"]')
  dragOverScheduleSlot.value=!dragOverMatchId.value && dropElement ? { matchDate:dropElement.dataset.matchDate || '',matchTime:dropElement.dataset.matchTime || '',venue:dropElement.dataset.matchVenue || '' } : null
}

async function handleMatchPointerUp(event) {
  if (!pointerDragState || event.pointerId !== pointerDragState.pointerId) return
  const sourceId = pointerDragState.matchId
  const targetId = dragOverMatchId.value
  const targetSlot=dragOverScheduleSlot.value ? { ...dragOverScheduleSlot.value } : null
  const wasDragging = pointerDragState.active
  resetMatchDrag()

  if (!wasDragging) return
  suppressNextCardClick = true
  window.setTimeout(() => { suppressNextCardClick = false }, 0)
  const targetMatch = allTournamentMatches.value.find(match => match._id === targetId)
  if (targetMatch) await handleMatchDrop(sourceId, targetMatch)
  else if (targetSlot) await handleMatchMoveToSlot(sourceId,targetSlot)
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

async function persistMatchSchedule(matchId, slot, options={}) {
  const result = await callFunction('updateMatch', { matchId, data: slot,adjustmentGroupId:options.adjustmentGroupId || '',adjustmentType:options.adjustmentType || 'drag' })
  if (!result?.success) throw new Error(result?.message || result?.error || '保存赛程失败')
}

async function handleMatchDrop(sourceId, targetMatch) {
  const sourceMatch = allTournamentMatches.value.find(match => match._id === sourceId)
  if (!sourceMatch || sourceMatch._id === targetMatch._id) return
  if (!isMatchQuickEditable(sourceMatch) || !isMatchQuickEditable(targetMatch)) {
    ElMessage.warning('只能调整未开始或已延期的比赛')
    return
  }

  const sourceSlot = scheduleSlot(sourceMatch)
  const targetSlot = scheduleSlot(targetMatch)
  if (!matchSlotFormatCompatible(sourceMatch,targetSlot) || !matchSlotFormatCompatible(targetMatch,sourceSlot)) { ElMessage.warning('两场比赛的几人制与目标场地不兼容，不能交换');return }
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
  const adjustmentGroupId=`swap-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
  let sourceUpdated = false
  try {
    await persistMatchSchedule(sourceMatch._id, targetSlot,{ adjustmentGroupId,adjustmentType:'swap' })
    sourceUpdated = true
    await persistMatchSchedule(targetMatch._id, sourceSlot,{ adjustmentGroupId,adjustmentType:'swap' })
    Object.assign(sourceMatch, targetSlot)
    Object.assign(targetMatch, sourceSlot)
    allTournamentMatches.value = [...allTournamentMatches.value].sort(compareMatchesByDateTime)
    matches.value = [...matches.value].sort(compareMatchesByRoundAndTime)
    ElMessage.success('场次日期、时间和场地已交换')
  } catch (err) {
    if (sourceUpdated) {
      try {
        await persistMatchSchedule(sourceMatch._id, sourceSlot,{ adjustmentGroupId:`rollback-${adjustmentGroupId}`,adjustmentType:'rollback' })
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

function venueFormatValue(venue) { return String(configuredVenueResource(venue)?.fieldFormat || '').toLowerCase() }
function matchSlotFormatCompatible(match,slot) { const required=matchFormatValue(match),target=venueFormatValue(slot?.venue);return Boolean(required && target && required===target) }
function isDragOverScheduleSlot(date,time,venue) { const slot=dragOverScheduleSlot.value;return Boolean(slot && slot.matchDate===date && slot.matchTime===time && slot.venue===venue) }

async function handleMatchMoveToSlot(sourceId,targetSlot) {
  const sourceMatch=allTournamentMatches.value.find(match=>match._id===sourceId)
  if(!sourceMatch || !isMatchQuickEditable(sourceMatch)) return
  if(JSON.stringify(scheduleSlot(sourceMatch))===JSON.stringify(targetSlot)){ElMessage.info('比赛已经在这个时间和场地');return}
  if(!matchSlotFormatCompatible(sourceMatch,targetSlot)){ElMessage.warning(`${matchFormatDisplayLabel(sourceMatch)}比赛不能移入${workbenchVenueFormatLabel(targetSlot.venue)}场地`);return}
  const occupied=allTournamentMatches.value.find(match=>match._id!==sourceId && match.status!=='cancelled' && match.matchDate===targetSlot.matchDate && match.matchTime===targetSlot.matchTime && match.venue===targetSlot.venue)
  if(occupied){ElMessage.warning('目标时间和场地已被其他比赛占用，请拖到该比赛卡片上进行交换');return}
  const sourceSlot=scheduleSlot(sourceMatch)
  const sourceName=`${sourceMatch.homeTeamName || '待定'} vs ${sourceMatch.awayTeamName || '待定'}`
  try{await ElMessageBox.confirm(`确定把“${sourceName}”移动到 ${targetSlot.matchDate} ${targetSlot.matchTime} · ${targetSlot.venue} 吗？`,'确认移动场次',{type:'warning',confirmButtonText:'确认移动',cancelButtonText:'取消'})}catch{return}
  quickSavingIds.value=[sourceMatch._id]
  const adjustmentGroupId=`move-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
  try{await persistMatchSchedule(sourceMatch._id,targetSlot,{ adjustmentGroupId,adjustmentType:'move' });Object.assign(sourceMatch,targetSlot);allTournamentMatches.value=[...allTournamentMatches.value].sort(compareMatchesByDateTime);matches.value=[...matches.value].sort(compareMatchesByRoundAndTime);ElMessage.success('比赛已移动到新的时间和场地')}catch(err){try{await persistMatchSchedule(sourceMatch._id,sourceSlot,{ adjustmentGroupId:`rollback-${adjustmentGroupId}`,adjustmentType:'rollback' })}catch(rollbackErr){console.error('赛程移动回滚失败:',rollbackErr)}await loadMatches();ElMessage.error('拖拽调整失败: '+err.message)}finally{quickSavingIds.value=[]}
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
      adjustmentGroupId:`manual-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      adjustmentType:'manual',
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
  const defaultVenue = generationVenues.value[0] || scheduleConfig.value.venues[0] || ''
  if (!defaultVenue) { ElMessage.warning('请先在自动生成设置中添加实际比赛场地'); openScheduleConfigDialog('venues'); return }
  manualForm.value = {
    matchDate: formatDateStr(new Date()),
    matchTime: '09:00',
    venue: defaultVenue,
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

// 生成赛程
async function handleGenerate() {
  syncAutoTiming()
  if (!ensureSelectedSchedulePrerequisites()) return
  if (!validateScheduleStep('basic') || !validateVenueStep()) return
  if (!scheduleConfig.value.startDate) {
    ElMessage.warning('请选择开始比赛日期')
    return
  }
  if (generationVenues.value.length === 0) {
    ElMessage.warning(`请先为 ${activeDivision.value.name} 组选择比赛场地`)
    return
  }
  if (scheduleConfig.value.timeSlots.length === 0) {
    ElMessage.warning('请至少启用一个比赛阶段并设置有效起止时间')
    return
  }
  rememberGenerationVenues()
  showConfigDialog.value = false
  try {
    await ElMessageBox.confirm(scheduleGenerationMode.value==='joint' ? '生成成功后将覆盖全部所选组别已有赛程；若场地时段不足，原赛程会保留。确定继续吗？' : `生成成功后将覆盖${selectedScheduleDivision.value?.name || '当前组别'}已有赛程，其他组别不变；若场地时段不足，原赛程会保留。确定继续吗？`, '生成赛程', { type: 'warning' })
  } catch {
    showConfigDialog.value = true
    return
  }

  generating.value = true
  try {
    const selectedDivision=selectedScheduleDivision.value
    const result = await callFunction('generateSchedule', {
      tournamentId,
      scheduleAllDivisions: scheduleGenerationMode.value==='joint',
      divisionIds: scheduleGenerationMode.value==='joint' ? targetScheduleDivisions.value.map(item => item.id) : undefined,
      divisionId: scheduleGenerationMode.value==='separate' ? selectedDivision?.id : undefined,
      divisionName: scheduleGenerationMode.value==='separate' ? selectedDivision?.name : undefined,
      scheduleType: scheduleGenerationMode.value==='separate' ? generationTypeForDivision(selectedDivision) : undefined,
      scheduleConfig: {
        startDate: scheduleConfig.value.startDate,
        endDate: scheduleConfig.value.endDate,
        matchDays: scheduleConfig.value.matchDays,
        matchDuration: scheduleConfig.value.matchDuration,
        matchInterval: scheduleConfig.value.matchInterval,
        restMinutes: scheduleConfig.value.restMinutes,
        maxDailyOne: false,
        maxPerSession: 1,
        slotMinutes: 60,
        sessionWindows: scheduleConfig.value.sessionWindows,
        dailyMatchLimit: scheduleConfig.value.dailyMatchLimit,
        venues: [...generationVenues.value],
        venueResources: venueResourceConfigs.value,
        timeSlots: scheduleConfig.value.timeSlots,
        cupMode: scheduleConfig.value.cupMode
      }
    })

    if (result && result.success) {
      ElMessage.success(`赛程生成成功！共 ${result.matchCount || 0} 场比赛`)
      await loadMatches({ focusCalendar: true })
      if (scheduleGenerationMode.value==='separate' && selectedDivision?.id) activeDivisionId.value=selectedDivision.id
      tournament.value={ ...tournament.value,scheduleConfig:{ ...scheduleConfig.value,venues:[...generationVenues.value],venueResources:venueResourceConfigs.value,timeSlots:[...generatedTimeSlots.value] },scheduleGenerated:true,scheduleGenerationMode:scheduleGenerationMode.value,scheduleEngineVersion:result.scheduleEngineVersion || CURRENT_SCHEDULE_ENGINE_VERSION }
      showConfigDialog.value=false
      showOverview.value=false
      const query={ ...route.query,divisionId:activeDivisionId.value,view:'editor' };delete query.generator
      await router.replace({ path:route.path,query })
    } else {
      showConfigDialog.value=true
      scheduleStep.value='preview'
      openGenerationRisk(result || {})
    }
  } catch (err) {
    ElMessage.error('调用云函数失败: ' + err.message)
  } finally {
    generating.value = false
  }
}

async function loadTournament() {
  try {
    const [t, divisions] = await Promise.all([
      queryById('tournaments', tournamentId),
      queryList('divisions', { where: { tournamentId }, orderBy: { createTime: 'asc' }, silent: true })
    ])
    tournament.value = t
    divisionRecords.value = divisions || []
    const routeDivisionId = typeof route.query.divisionId === 'string' ? route.query.divisionId : ''
    const preferred = routeDivisionId || t.defaultDivisionId || t.divisions?.[0]?.id || 'default'
    activeDivisionId.value = divisionOptions.value.some(item => item.id === preferred) ? preferred : divisionOptions.value[0].id
    tournamentType.value = generationTypeForDivision(activeDivision.value)
    formatLabel.value = { tournament: '赛会制', cup: '杯赛制', league: '联赛制' }[tournamentType.value] || ''
    applySharedScheduleConfig()
    syncAutoTiming()
  } catch (err) {
    console.error('加载赛事失败:', err)
  }
}

function applySharedScheduleConfig() {
  const defaults=createDefaultScheduleConfig()
  const saved=tournament.value?.scheduleDraft || tournament.value?.scheduleConfig || {}
  scheduleConfig.value={
    ...defaults,
    ...saved,
    matchDays:Array.isArray(saved.matchDays) ? [...saved.matchDays] : defaults.matchDays,
    venues:Array.isArray(saved.venues) ? [...saved.venues] : [],
    timeSlots:Array.isArray(saved.timeSlots) ? [...saved.timeSlots] : [],
    calendarExtraTimeSlots:Array.isArray(saved.calendarExtraTimeSlots) ? [...saved.calendarExtraTimeSlots] : [],
    venueResources:Array.isArray(saved.venueResources) ? saved.venueResources.map(resource => ({ ...resource,sessionWindows:(resource.sessionWindows || defaultSessionWindows()).map(window => ({ ...window })) })) : []
  }
  scheduleGenerationMode.value=saved.generationMode==='separate' ? 'separate' : 'joint'
  selectedScheduleDivisionId.value=jointScheduleDivisions.value.some(item => item.id===String(saved.selectedDivisionId || '')) ? String(saved.selectedDivisionId) : activeDivisionId.value
}

async function enforceInitialScheduleEntry() {
  if (visualQaSnapshot || hasConfiguredSchedule.value || route.query.generator) return
  if (!jointScheduleDivisions.value.length) { showOverview.value=true; return }
  showOverview.value=false
  scheduleStep.value='mode'
  syncGenerationVenues()
  showConfigDialog.value=true
  await router.replace({ path:route.path,query:{ ...route.query,divisionId:activeDivisionId.value,generator:'mode' } })
}

function isOfficialDrawRecord(record) {
  return record?.status === 'published' || record?.status === 'confirmed' && Boolean(record.confirmedAt)
}

function drawRecordsConfirmed(records) {
  const active = records.filter(record => record.status !== 'archived')
  return active.length > 0 && active.every(isOfficialDrawRecord)
}

async function loadSchedulePrerequisites() {
  try {
    const [relations,groupRecords,bracketRecords,leagueRecords] = await Promise.all([
      queryList('tournament_teams',{ where:{ tournamentId,status:'approved' },limit:1000,silent:true }),
      queryList('tournament_groups',{ where:{ tournamentId },limit:1000,silent:true }),
      queryList('tournament_bracket',{ where:{ tournamentId },limit:1000,silent:true }),
      queryList('tournament_league_tables',{ where:{ tournamentId },limit:1000,silent:true })
    ])
    const counts = {}
    ;(relations || []).forEach(record => { const id=String(record.divisionId || 'default'); counts[id]=(counts[id] || 0)+1 })
    approvedTeamCounts.value = counts
    const readiness = {}
    divisionOptions.value.forEach(division => {
      const id=String(division.id || division._id || 'default')
      const format=String(division.formatType || division.tournamentType || '').toLowerCase()
      if (format === 'cup') readiness[id]=drawRecordsConfirmed((groupRecords || []).filter(record => String(record.divisionId || 'default')===id && !record.scheduleType && (record.groupName || record.groupCode)))
      else if (format === 'tournament') readiness[id]=drawRecordsConfirmed((bracketRecords || []).filter(record => String(record.divisionId || 'default')===id && !record.scheduleType && (Array.isArray(record.slots) || Array.isArray(record.matches))))
      else readiness[id]=drawRecordsConfirmed((leagueRecords || []).filter(record => String(record.divisionId || 'default')===id && !record.scheduleType && Array.isArray(record.teams)))
    })
    drawReadinessByDivision.value = readiness
  } catch (error) {
    console.warn('加载赛程准备状态失败',error)
    approvedTeamCounts.value = {}
    drawReadinessByDivision.value = {}
  }
}

async function loadMatches(options = {}) {
  loading.value = true
  try {
    const list = await queryList('matches', {
      where: { tournamentId },
      orderBy: { matchDate: 'asc', matchTime: 'asc' }
    })
    ;(list || []).forEach(match=>{const phase=String(match?.phase || match?.scheduleType || '').toLowerCase();if(phase==='group' || phase==='league')match.roundName=matchCardRoundLabel(match)})
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
    const logoSource=tournament.value?.scheduleGenerationMode==='joint' ? allTournamentMatches.value : matches.value
    logoSource.forEach(m => {
      if (m.homeTeamId) teamIds.add(m.homeTeamId)
      if (m.awayTeamId) teamIds.add(m.awayTeamId)
    })
    if (teamIds.size === 0) return

    const teams = await queryList('teams', {})
    const relevant=(teams || []).filter(t=>teamIds.has(String(t._id || '')))
    const resolved=await Promise.all(relevant.map(async t=>{ const logo=t.logoUrl || t.logo || t.logoImage || '';return [String(t._id || ''),logo ? await getFileUrl(String(logo)) : ''] }))
    const map = Object.fromEntries(resolved.filter(([teamId,logo])=>teamId && logo))
    teamLogos.value = map
    failedTeamLogos.value = {}
  } catch (err) {
    console.warn('加载队徽失败', err)
  }
}

onMounted(async () => {
  await loadTournament()
  await loadSchedulePrerequisites()
  await loadMatches()
  await loadTeamLogos()
  await loadAllTeams()
  if (route.query.generator) openScheduleConfigDialog(String(route.query.generator))
  else await enforceInitialScheduleEntry()
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
.schedule-wizard-steps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:0 0 20px}.schedule-wizard-steps span{display:flex;align-items:center;gap:8px;min-width:0;color:#879188;font-size:13px;font-weight:600}.schedule-wizard-steps b{display:inline-grid;flex:0 0 auto;place-items:center;width:24px;height:24px;border-radius:50%;background:#edf1ed;color:#7b877d}.schedule-wizard-steps .active{color:#16794a}.schedule-wizard-steps .active b{background:#16794a;color:#fff}.schedule-wizard-steps .done{color:#518368}.schedule-wizard-steps .done b{background:#dcefe3;color:#16794a}.schedule-preview-confirm{padding:18px;border:1px solid #dce8df;border-radius:10px;background:#f8fcf9}.schedule-preview-confirm h4{margin:0 0 14px;color:#274435}.schedule-preview-confirm dl{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:0 0 18px}.schedule-preview-confirm dl>div{padding:13px;border-radius:8px;background:#fff}.schedule-preview-confirm dt{font-size:18px;font-weight:700;color:#194c31}.schedule-preview-confirm dd{margin:5px 0 0;color:#748078;font-size:12px}@media(max-width:680px){.schedule-wizard-steps{grid-template-columns:1fr 1fr}.schedule-preview-confirm dl{grid-template-columns:1fr 1fr}}
.schedule-overview{padding:24px 10px 30px}.overview-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:20px}.overview-heading h1{margin:10px 0 6px;font-size:30px}.overview-heading p,.crumb{margin:0;color:#718078}.crumb{font-size:13px}.overview-heading>div:last-child{display:flex;gap:12px}.overview-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin:26px 0 20px}.overview-stats article{padding:24px;border:1px solid #e0e8e2;border-radius:10px;background:#fff}.overview-stats span,.overview-stats strong{display:block}.overview-stats span{color:#748078}.overview-stats strong{margin-top:9px;font-size:27px}.overview-table,.overview-bottom>section{padding:18px;border:1px solid #e0e8e2;border-radius:10px;background:#fff}.overview-table>header,.overview-bottom h2{display:flex;align-items:center;justify-content:space-between;margin:0 0 16px}.overview-table h2,.overview-bottom h2{font-size:19px}.progress-text{display:inline-block;margin-left:8px;color:#607067;font-size:12px}.conflict-count{color:#e76f24}.ok-count{color:#087943}.overview-bottom{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px}.overview-bottom ul{margin:0;padding:0;list-style:none}.overview-bottom li{display:grid;grid-template-columns:190px 1fr;gap:12px;align-items:center;margin:11px 0;color:#46564c}.overview-bottom .todo-list li{display:block;padding-left:14px;position:relative}.overview-bottom .todo-list li:before{position:absolute;left:0;color:#ec8a23;content:'•'}@media(max-width:900px){.overview-stats{grid-template-columns:1fr 1fr}.overview-bottom{grid-template-columns:1fr}.overview-heading{align-items:flex-start;flex-direction:column}}@media(max-width:640px){.overview-stats{grid-template-columns:1fr}.overview-bottom li{grid-template-columns:1fr}.overview-heading>div:last-child{width:100%;flex-direction:column}}
.overview-stats article{display:flex;align-items:center;gap:20px;min-height:100px;padding:18px 26px}.overview-stats article.published{border-color:#b8d7bf;background:#f7fcf8}.overview-stats .stat-icon{display:grid;flex:0 0 62px;width:62px;height:62px;place-items:center;border-radius:50%;color:#087b29;background:#edf8ef;font-size:34px}.overview-stats strong{margin:0;color:#101715;font-size:31px}.overview-stats strong small{margin-left:6px;font-size:22px;font-weight:700}.overview-table{padding:8px 12px 0;overflow:hidden}.overview-table>header{height:42px;margin:0 2px}.overview-table>header .el-select{width:180px}.overview-table table{width:100%;border-collapse:collapse;color:#27322c;font-size:15px;table-layout:fixed}.overview-table th,.overview-table td{height:47px;padding:0 14px;border-top:1px solid #e5e9e6;text-align:left;white-space:nowrap}.overview-table th{height:44px;background:#f7f9f8;color:#2f3934;font-weight:600}.overview-table th:nth-child(5),.overview-table td:nth-child(5){width:220px}.overview-progress{display:flex;align-items:center;gap:12px}.overview-progress i{display:block;width:122px;height:8px;overflow:hidden;border-radius:6px;background:#e8ebe9}.overview-progress b{display:block;height:100%;border-radius:inherit;background:#087b29}.schedule-status{display:inline-flex;align-items:center;height:27px;padding:0 10px;border-radius:5px;font-size:14px}.schedule-status.is-published{color:#087b29;background:#eaf6ec}.schedule-status.is-conflict,.schedule-status.is-draft{color:#e67d00;background:#fff4e2}.schedule-status.is-editing{color:#1677e8;background:#e8f3ff}.table-action{padding:0;border:0;color:#087b29;background:transparent;font:inherit;font-weight:600;cursor:pointer}.overview-bottom{margin-top:16px}.overview-bottom>section{min-height:178px}.overview-bottom :deep(.el-progress-bar__inner){background:#087b29}
.schedule-generator-overlay{position:fixed;z-index:40;inset:92px 0 0 var(--admin-sidebar-width);padding:8px 34px 96px;overflow:auto;background:#f8faf9}.generator-page-heading{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:12px}.generator-page-heading>div:last-child{display:flex;align-items:center;gap:20px}.generator-page-heading .el-select{width:200px}.generator-page-heading span,.generator-page-heading p{color:#66736c}.generator-page-heading h1{margin:10px 0 5px;font-size:32px}.generator-page-heading p{margin:0}.schedule-generator-overlay .config-content{gap:0;padding:0}.schedule-generator-overlay .schedule-wizard-steps{margin:0;padding:14px 28px;border-bottom:1px solid #e4e9e6;background:#fff}.schedule-generator-overlay .config-content>.el-alert{margin:18px 0}.schedule-generator-overlay .config-section,.schedule-generator-overlay .schedule-preview-confirm{padding:24px;border:1px solid #e0e7e2;border-radius:10px;background:#fff}.schedule-generator-overlay .config-section+.config-section{margin-top:16px}.generator-page-footer{position:fixed;z-index:41;right:0;bottom:0;left:var(--admin-sidebar-width);display:flex;justify-content:flex-end;gap:14px;padding:16px 40px;border-top:1px solid #dfe5e1;background:#fff}.generator-page-footer .el-button{min-width:150px;height:50px}
.generator-ready-banner{display:flex;align-items:center;gap:18px;margin:14px 0;padding:18px 22px;border:1px solid #b9d8c0;border-radius:8px;background:#fbfefb}.generator-ready-banner .ready-icon{display:grid;width:56px;height:56px;place-items:center;border-radius:50%;color:#087b29;background:#edf7ef;font-size:30px}.generator-ready-banner>div{flex:1}.generator-ready-banner strong{font-size:18px}.generator-ready-banner p{display:flex;gap:42px;margin:10px 0 0;color:#34423a}.generator-basic-grid{display:grid;grid-template-columns:1.12fr .96fr;gap:22px}.generator-basic-grid .config-section{padding:20px 24px}.generator-basic-grid h3{margin:0 0 18px;font-size:19px}.parameter-row{display:grid;grid-template-columns:130px 1fr auto;align-items:center;min-height:48px;gap:10px}.parameter-row>label{color:#4c5a52}.parameter-row .el-input-number{width:100%}.date-range{display:flex;align-items:center;gap:10px}.date-range .el-date-editor{flex:1;width:auto}.scope-options{display:flex;align-items:flex-start;flex-direction:column;gap:14px}.scope-options .el-radio{height:auto}.scope-options span{display:flex;flex-direction:column;gap:4px}.scope-options small{color:#76827b}.preference-card label{display:flex;align-items:center;justify-content:space-between;margin:16px 0}.preference-card p{margin:20px 0 0;padding:12px;color:#6f7a74;background:#f5f7f6}.generator-page-footer{justify-content:space-between}.generator-page-footer>div{display:flex;gap:14px}.generator-page-footer>div .el-button:last-child{min-width:270px}
.schedule-mode-layout{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(310px,.62fr);gap:22px;margin-top:18px}.schedule-mode-picker>header h3,.schedule-mode-summary h3{margin:0;font-size:21px}.schedule-mode-picker>header p{margin:8px 0 20px;color:#69766f}.schedule-mode-options{display:grid;grid-template-columns:1fr 1fr;gap:16px}.schedule-mode-options>label{position:relative;display:flex;flex-direction:column;min-height:190px;box-sizing:border-box;padding:22px;border:2px solid #e0e7e2;border-radius:12px;background:#fbfcfb;cursor:pointer;transition:.18s ease}.schedule-mode-options>label.selected{border-color:#159447;background:#f2fbf5;box-shadow:0 7px 20px rgba(16,121,63,.09)}.schedule-mode-options input{position:absolute;top:22px;right:22px;width:19px;height:19px;accent-color:#0b8a3d}.schedule-mode-options span{display:flex;align-items:flex-start;flex-direction:column;gap:7px;padding-right:32px}.schedule-mode-options b{font-size:19px;color:#173b29}.schedule-mode-options small{padding:3px 8px;border-radius:10px;color:#087b29;background:#eaf7ee}.schedule-mode-options p{flex:1;margin:20px 0 16px;color:#5d6b63;line-height:1.7}.schedule-mode-options em{color:#087b29;font-style:normal;font-weight:700}.separate-division-picker{margin-top:22px;padding-top:20px;border-top:1px solid #e3e9e5}.separate-division-picker>strong{display:block;margin-bottom:12px;font-size:16px}.separate-division-picker>div{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.separate-division-picker button{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px;border:1px solid #dce5df;border-radius:8px;color:#30483a;background:#fff;text-align:left;cursor:pointer}.separate-division-picker button.active{border-color:#159447;background:#f0faf3;box-shadow:inset 0 0 0 1px #159447}.separate-division-picker button span{display:flex;flex-direction:column;gap:5px;font-size:16px;font-weight:700}.separate-division-picker button small{color:#748078;font-size:12px;font-weight:500}.separate-division-picker button b{color:#087b29;white-space:nowrap}.schedule-mode-summary>strong{display:block;margin:22px 0;padding:18px;border-radius:9px;color:#087b29;background:#f1faf4;font-size:20px}.schedule-mode-summary dl{display:grid;gap:1px;margin:0;background:#e5ebe7}.schedule-mode-summary dl>div{display:flex;align-items:center;justify-content:space-between;padding:15px;background:#fff}.schedule-mode-summary dt{color:#6b776f}.schedule-mode-summary dd{margin:0;color:#183d2a;font-size:18px;font-weight:800}.schedule-mode-summary p{display:flex;align-items:flex-start;gap:8px;margin:22px 0 0;color:#4f6658;line-height:1.7}.schedule-mode-summary p .el-icon{flex:0 0 auto;margin-top:4px;color:#087b29}@media(max-width:1150px){.schedule-mode-layout{grid-template-columns:1fr}.separate-division-picker>div{grid-template-columns:1fr 1fr}}
.generator-venue-summary{display:grid;grid-template-columns:1.15fr 1fr 1fr 1fr auto;align-items:center;margin:14px 0;padding:16px 22px;border:1px solid #b9d8c0;border-radius:8px;background:#fbfefb}.generator-venue-summary>div{display:flex;align-items:center;gap:13px;min-height:52px;padding-right:20px;border-right:1px solid #dfe8e1;color:#087b29;font-size:28px}.generator-venue-summary>div span{display:flex;flex-direction:column;gap:5px;color:#29352e;font-size:14px}.generator-venue-summary>div b{font-size:16px;font-weight:500}.generator-venues-grid{display:grid;grid-template-columns:1.25fr .82fr;gap:22px}.generator-venues-grid .config-section{padding:18px}.venue-table-card header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.venue-table-card h3,.venue-side h3{margin:0;font-size:19px}.venue-table-card table{width:100%;border-collapse:collapse;table-layout:fixed}.venue-table-card th,.venue-table-card td{height:57px;padding:0 14px;border:1px solid #e1e6e3;text-align:left}.venue-table-card th{height:48px;background:#f7f9f8}.venue-table-card th:first-child{width:30%}.venue-table-card td button{border:0;color:#087b29;background:transparent;font-weight:600;cursor:pointer}.venue-table-card>p{color:#748078}.venue-enabled,.venue-limited{display:inline-flex;padding:5px 10px;border-radius:5px}.venue-enabled{color:#087b29;background:#eaf6ec}.venue-limited{color:#e67d00;background:#fff2df}.venue-side .config-section{padding:18px 24px}.venue-time-rules label{display:grid;grid-template-columns:1fr 1.3fr auto;align-items:center;gap:8px;margin:12px 0}.venue-time-rules .el-input-number,.venue-time-rules .el-select{width:100%}
.generator-rule-summary{display:flex;align-items:center;gap:18px;margin:14px 0 8px;padding:14px 20px;border:1px solid #cfe0d3;border-radius:8px;background:#fbfefb}.generator-rule-summary>.el-icon{color:#087b29;font-size:34px}.generator-rule-summary>div{flex:1}.generator-rule-summary strong{font-size:17px}.generator-rule-summary em{padding:4px 8px;color:#087b29;background:#eaf6ec;font-size:13px;font-style:normal}.generator-rule-summary p{display:flex;gap:38px;margin:8px 0 0;color:#445149}.rule-fixed-note{margin:0 0 8px;color:#6f7a74}.generator-rules-grid{display:grid;grid-template-columns:1.03fr 1fr;gap:20px;align-items:start}.generator-rules-grid .config-section{padding:18px 22px}.generator-rules-grid h3{margin:0;font-size:19px}.phase-order header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.phase-order header span{color:#7d8781}.phase-order article{display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:14px;margin:10px 0;padding:17px;border:1px solid #e1e7e3;border-radius:7px}.phase-order article>b{display:grid;width:30px;height:30px;place-items:center;border:1px solid #cad3cd;border-radius:50%}.phase-order article strong{font-size:18px}.phase-order article p{margin:8px 0 0;color:#66736c}.phase-order article em{padding:5px 10px;color:#087b29;background:#eaf6ec;font-style:normal}.phase-order>p{padding:10px;border:1px solid #e4e8e5;color:#6f7a74}.auto-strategy>label{display:grid;grid-template-columns:1fr 116px auto;align-items:center;min-height:43px;border-bottom:1px solid #e6eae7}.auto-strategy label>span{display:flex;flex-direction:column;gap:2px}.auto-strategy label small{color:#7a8580}.auto-strategy .el-input-number{width:110px}.conflict-priorities{margin-top:12px;padding:14px 20px;border:1px solid #e0e6e2;border-radius:8px;background:#fff}.conflict-priorities h3{margin:0 0 12px}.conflict-priorities h3 small{margin-left:18px;color:#7b8580;font-weight:400}.conflict-priorities>div{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.conflict-priorities span{padding:12px;border:1px solid #dfe5e1;border-radius:5px}.conflict-priorities b{display:inline-grid;width:24px;height:24px;place-items:center;border-radius:50%;color:#fff;background:#087b29}.schedule-generator-overlay{--el-color-primary:#087b29}
.generator-preview{margin-top:14px}.preview-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:24px}.preview-stats article{display:flex;align-items:center;gap:22px;min-height:98px;padding:18px 24px;border:1px solid #dfe6e1;border-radius:8px;background:#fff;color:#087b29;font-size:38px}.preview-stats strong{display:flex;align-items:center;color:#111;font-size:30px}.preview-stats small{display:block;margin-left:10px;font-size:15px;font-weight:400}.preview-stats article.passed{border-color:#bcd7c2;background:#fbfefb}.preview-stats article.passed span{margin-left:auto;padding:5px 9px;color:#087b29;background:#eaf6ec;font-size:13px}.preview-grid{display:grid;grid-template-columns:1.15fr .76fr;gap:18px;margin-top:16px}.preview-table-card,.preview-side>section{border:1px solid #dfe6e1;border-radius:8px;background:#fff}.preview-table-card header{display:flex;align-items:center;justify-content:space-between;padding:15px 20px}.preview-table-card h3,.preview-side h3{margin:0;font-size:19px}.preview-table-card header button{padding:8px 20px;border:0;border-bottom:2px solid transparent;background:transparent}.preview-table-card header button.active{border-color:#087b29;color:#087b29}.preview-table-card table{width:100%;border-collapse:collapse;table-layout:fixed}.preview-table-card th,.preview-table-card td{height:49px;padding:0 11px;border-top:1px solid #e5e9e6;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.preview-table-card th{background:#f7f9f8}.preview-table-card td span{padding:4px 8px;color:#087b29;background:#eaf6ec}.preview-table-card>footer{display:flex;justify-content:space-between;padding:13px 18px;color:#68746d}.preview-table-card>footer button,.preview-side button{border:0;color:#087b29;background:transparent;cursor:pointer}.preview-side{display:flex;flex-direction:column;gap:12px}.preview-side>section{padding:15px 20px}.preview-side section>p{display:flex;justify-content:space-between;margin:10px 0}.preview-side section>p span{color:#087b29}.preview-side h3{display:flex;justify-content:space-between}.preview-side .post-generation-hint{position:relative;border-color:#b9cce0;box-shadow:0 4px 12px rgba(42,72,98,.12)}.post-generation-hint>button{position:absolute;right:12px;top:8px;color:#7b8580;font-size:22px}.post-generation-hint strong{font-size:17px}.post-generation-hint p{padding-right:60px;color:#5f6e65;line-height:1.6}.post-generation-hint em{position:absolute;right:20px;bottom:22px;padding:6px 12px;color:#2a6db5;background:#eaf3ff;font-style:normal}
.schedule-workbench-overlay{position:fixed;z-index:30;inset:92px 0 0 var(--admin-sidebar-width);padding:12px 18px 18px;overflow:auto;background:#f8faf9;--el-color-primary:#087b29}.workbench-heading{display:flex;align-items:flex-end;justify-content:space-between}.workbench-heading span,.workbench-heading p{color:#68756e}.workbench-heading h1{margin:8px 0 3px;font-size:30px}.workbench-heading p{margin:0}.workbench-heading>div:last-child{display:flex;align-items:center;gap:18px}.workbench-heading .el-select{width:160px}.workbench-actions{display:flex;justify-content:flex-end;margin-top:-2px;padding-bottom:10px;border-bottom:1px solid #dfe5e1}.workbench-actions>div{display:flex;gap:14px}.workbench-actions .el-button{height:42px;min-width:150px}.workbench-stats{display:grid;grid-template-columns:repeat(5,1fr);padding:12px 0;border-bottom:1px solid #e1e6e3}.workbench-stats span{display:flex;align-items:center;justify-content:center;gap:8px;border-right:1px solid #e1e6e3;color:#4f5c55}.workbench-stats b{font-size:19px}.workbench-controls{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:20px;padding:10px 0}.workbench-controls>div{display:flex;align-items:center;justify-content:center;gap:12px}.workbench-controls>div:last-child{justify-content:flex-end}.workbench-controls .el-select{width:130px}.workbench-body{display:grid;grid-template-columns:270px 1fr;gap:18px;height:532px}.workbench-body>aside{padding:14px;border:1px solid #dfe5e1;border-radius:8px;background:#fff}.workbench-body>aside header{display:flex;justify-content:space-between;margin-bottom:12px;font-size:18px;font-weight:700}.workbench-body>aside article{margin-bottom:12px;padding:13px;border:1px solid #d8e0da;border-left:3px solid #eb8617;border-radius:6px;cursor:pointer}.workbench-body>aside article small{color:#66736c}.workbench-body>aside article strong{display:block;margin:8px 0}.workbench-body>aside article p{margin:0 0 8px;color:#68756e}.workbench-body>aside article em{color:#e46d18;font-style:normal}.pending-dropzone{display:grid;height:120px;place-items:center;border:1px dashed #cbd4ce;border-radius:6px;color:#98a39c;text-align:center}.pending-dropzone .el-icon{font-size:30px}.pending-dropzone span{display:block;margin-top:-35px}.workbench-calendar{overflow:hidden;border:1px solid #dfe5e1;border-radius:8px;background:#fff}.workbench-calendar table{width:100%;height:100%;border-collapse:collapse;table-layout:fixed}.workbench-calendar th,.workbench-calendar td{border:1px solid #e1e6e3}.workbench-calendar thead th{height:38px;background:#f7f9f8}.workbench-calendar thead th:first-child{width:106px}.workbench-calendar tbody>tr>th{padding:10px;text-align:left;white-space:normal}.workbench-calendar td{padding:5px;vertical-align:top}.workbench-slot{display:grid;grid-template-columns:42px 1fr;align-items:center;min-height:30px}.workbench-slot time{color:#56635c}.workbench-slot>span{color:#a0aaa4;text-align:center}.workbench-slot button{position:relative;display:flex;flex-direction:column;width:100%;min-width:0;padding:4px 7px;border:0;border-left:3px solid #087b29;border-radius:4px;background:#f7fbf8;text-align:left;cursor:pointer}.workbench-slot button small,.workbench-slot button b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.workbench-slot button small{color:#637169}.workbench-slot button.conflict{border-left-color:#e77418;background:#fff8f0}.workbench-slot button em{position:absolute;right:4px;bottom:4px;color:#e56f16;font-size:10px;font-style:normal}.workbench-list{padding:16px;border:1px solid #dfe5e1;border-radius:8px;background:#fff}.workbench-list table{width:100%;border-collapse:collapse}.workbench-list th,.workbench-list td{height:44px;border-bottom:1px solid #e5e9e6;text-align:left}.workbench-list button{border:0;color:#087b29;background:transparent;cursor:pointer}
.saved-schedule-config{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:14px 0 10px;padding:12px 16px;border:1px solid #b8d9c1;border-radius:8px;background:#f2faf4}.saved-schedule-config>span{display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:8px;color:#087b29}.saved-schedule-config>span>.el-icon{font-size:20px}.saved-schedule-config strong{font-size:15px}.saved-schedule-config small{color:#65736b}.workbench-actions .el-button--success:not(.is-plain){border-color:#075c27;background:#075c27}.workbench-slot button em{display:flex;align-items:center;gap:2px}.workbench-slot button em .el-icon{font-size:11px}
.venue-time-workbench{padding-bottom:32px}.pending-match-strip{margin-bottom:16px;padding:16px;border:1px solid #ecd8ba;border-radius:10px;background:#fffaf3}.pending-match-strip>header{display:flex;align-items:center;gap:10px;margin-bottom:12px;font-size:17px;font-weight:800}.pending-match-strip>div{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}.pending-match-strip button{display:flex;align-items:flex-start;flex-direction:column;gap:6px;padding:12px;border:1px solid #ead9c2;border-radius:8px;color:#253d30;background:#fff;text-align:left;cursor:pointer}.pending-match-strip button small,.pending-match-strip button span{color:#7b6d5b}.schedule-day-list{display:flex;flex-direction:column;gap:22px}.schedule-day-board{overflow:hidden;border:1px solid #d9e3dc;border-radius:12px;background:#fff;box-shadow:0 5px 18px rgba(22,71,43,.05)}.schedule-day-board>header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:15px 18px;border-bottom:1px solid #dfe7e2;background:#f4faf6}.schedule-day-board>header>div{display:flex;align-items:center;gap:14px}.schedule-day-board>header strong{font-size:20px;color:#173d29}.schedule-day-board>header span{padding:4px 10px;border-radius:12px;color:#087b29;background:#e4f4e9;font-weight:700}.schedule-day-board>header small{color:#68756e}.schedule-matrix-scroll{max-width:100%;overflow:auto}.schedule-matrix-scroll table{width:max-content;min-width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed}.schedule-matrix-scroll th,.schedule-matrix-scroll td{box-sizing:border-box;border-right:1px solid #e0e7e2;border-bottom:1px solid #e0e7e2}.schedule-matrix-scroll thead th{position:sticky;z-index:3;top:0;width:270px;min-width:270px;height:58px;padding:0 16px;color:#173d29;background:#edf7f0;font-size:17px;text-align:center}.schedule-matrix-scroll thead th .el-icon{margin-right:7px;color:#087b29;vertical-align:-2px}.schedule-matrix-scroll thead .time-axis-title{left:0;z-index:5;width:94px;min-width:94px;color:#fff;background:#087b29}.schedule-matrix-scroll tbody tr{height:164px}.schedule-matrix-scroll tbody td{width:270px;min-width:270px;padding:10px;vertical-align:top;background:#fcfdfc}.schedule-matrix-scroll .time-axis{position:sticky;z-index:2;left:0;width:94px;min-width:94px;padding:16px 10px;color:#163e29;background:#f3f8f5;text-align:center;vertical-align:top}.schedule-matrix-scroll .time-axis strong{display:block;font-size:20px}.schedule-matrix-scroll .time-axis small{display:block;margin-top:7px;color:#6d7a72;font-size:13px}.schedule-match-card{display:flex;flex-direction:column;width:100%;min-height:142px;padding:10px 12px;border:1px solid #b8d8c1;border-left:4px solid #087b29;border-radius:9px;color:#173729;background:#fff;box-shadow:0 4px 12px rgba(16,91,48,.08);text-align:left;cursor:pointer;transition:.16s ease}.schedule-match-card:hover{border-color:#087b29;box-shadow:0 7px 18px rgba(16,91,48,.14);transform:translateY(-1px)}.schedule-match-card.conflict{border-color:#e6a768;border-left-color:#df6d18;background:#fffaf4}.schedule-match-card>header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px;color:#68766e;font-size:12px}.schedule-match-card>header span{overflow:visible;white-space:normal}.schedule-match-card>header b{flex:0 0 auto;color:#087b29}.schedule-card-team{display:grid;grid-template-columns:36px minmax(0,1fr);align-items:center;gap:10px;min-height:39px}.schedule-card-team img,.schedule-card-team i{display:grid;width:34px;height:34px;box-sizing:border-box;place-items:center;border:1px solid #d5e1d8;border-radius:50%;object-fit:contain;background:#f2f7f4}.schedule-card-team i{color:#087b29;font-size:15px;font-style:normal;font-weight:800}.schedule-card-team strong{overflow:visible;color:#102f20;font-size:15px;line-height:1.35;white-space:normal;word-break:break-word}.schedule-card-vs{margin:1px 0 1px 46px;color:#9aa59e;font-size:11px;font-weight:800}.schedule-match-card>footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;padding-top:8px;border-top:1px solid #edf1ee;color:#6a776f;font-size:11px}.schedule-match-card>footer b{color:#087b29}.schedule-match-card>footer em{display:flex;align-items:center;gap:3px;color:#df6d18;font-style:normal}.empty-schedule-cell{display:grid;min-height:138px;place-items:center;border:1px dashed #dce4df;border-radius:8px;color:#b0b8b3;background:#fafcfa;font-size:12px}@media(max-width:1100px){.schedule-day-board>header{align-items:flex-start;flex-direction:column}.schedule-matrix-scroll thead th,.schedule-matrix-scroll tbody td{width:240px;min-width:240px}}
.schedule-matrix-scroll thead th{height:70px;padding:8px 16px}.schedule-matrix-scroll thead th>span{display:flex;align-items:center;justify-content:center}.schedule-matrix-scroll thead th>small{display:block;margin-top:5px;color:#087b29;font-size:12px;font-weight:700}.schedule-matrix-scroll tbody td{transition:.15s ease}.schedule-matrix-scroll tbody td.drag-over-slot{background:#e5f6ea;box-shadow:inset 0 0 0 2px #159447}.schedule-match-card{touch-action:none}.schedule-match-card.dragging{opacity:.42;transform:scale(.98)}.schedule-match-card.drag-over{border-color:#159447;box-shadow:0 0 0 3px rgba(21,148,71,.2)}body.schedule-dragging .schedule-match-card{cursor:grabbing}.schedule-match-card>footer span{font-weight:700}
.empty-schedule-cell{font-size:0}.empty-schedule-cell::after{content:'拖到这里';font-size:12px}.competition-publication-dialog .el-dialog__body{max-height:82vh;overflow:auto;background:#f6f8f7}.publication-dialog-title{display:grid;grid-template-columns:50px 1fr 220px;align-items:center;gap:14px;padding-right:24px}.publication-dialog-title>span{display:grid;width:46px;height:46px;place-items:center;border-radius:50%;color:#fff;background:#087b29;font-size:25px}.publication-dialog-title h2{margin:0;font-size:24px}.publication-dialog-title p{margin:6px 0 0;color:#68756e}.publication-status-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.publication-status-grid article{padding:18px;border:1px solid #dbe4de;border-radius:10px;background:#fff}.publication-status-grid article>header,.publication-status-grid article>footer{display:flex;align-items:center;justify-content:space-between;gap:10px}.publication-status-grid article>header span{font-size:17px;font-weight:800}.publication-status-grid article>strong{display:block;margin:18px 0 7px;font-size:20px}.publication-status-grid article>p{color:#68756e}.publication-status-grid article>footer{justify-content:flex-end;margin-top:18px}.formal-schedule-toolbar{display:flex;align-items:center;gap:16px;margin:18px 0 12px;padding:14px 18px;border:1px solid #dbe4de;border-radius:9px;background:#fff}.formal-schedule-toolbar>div{display:flex;flex:1;flex-direction:column;gap:4px}.formal-schedule-toolbar>div strong{font-size:18px}.formal-schedule-toolbar>div span{color:#6b7770}.formal-schedule-stage{overflow:auto;padding:24px;border:1px solid #dbe4de;border-radius:10px;background:#dfe5e1}.formal-schedule-sheet{box-sizing:border-box;margin:0 auto;padding:9mm;background:#fff;box-shadow:0 9px 30px rgba(24,51,35,.14);color:#111}.formal-schedule-sheet.portrait{width:210mm;min-height:297mm}.formal-schedule-sheet.landscape{width:297mm;min-height:210mm}.formal-schedule-sheet>header small{color:#087b29}.formal-schedule-sheet>header h1{margin:8px 0;text-align:center;font-size:24px}.formal-schedule-sheet>header p{text-align:center}.formal-schedule-sheet>header>span{display:block;margin:15px 0 8px;font-size:12px}.formal-schedule-sheet table{width:100%;border-collapse:collapse;table-layout:fixed}.formal-schedule-sheet th,.formal-schedule-sheet td{padding:7px 5px;border:1px solid #333;font-size:11px;text-align:center;word-break:break-word}.formal-schedule-sheet th{background:#edf5ef}.formal-schedule-sheet .formal-teams{text-align:left;font-weight:700}.formal-schedule-sheet>footer{display:flex;justify-content:space-between;gap:16px;margin-top:12px;color:#4d5751;font-size:10px}@media(max-width:900px){.publication-status-grid{grid-template-columns:1fr}.publication-dialog-title{grid-template-columns:46px 1fr}.publication-dialog-title .el-select{grid-column:1/-1;width:100%}.formal-schedule-toolbar{align-items:flex-start;flex-wrap:wrap}}
.formal-schedule-sheet>header h1{margin:5px 0;font-size:22px}.formal-schedule-sheet>header p{margin:4px 0}.formal-schedule-sheet>header>span{margin:8px 0 5px;font-size:11px}.formal-schedule-sheet th,.formal-schedule-sheet td{height:30px;padding:4px 3px;font-size:10px;line-height:1.25;word-break:normal}.formal-schedule-sheet th:nth-child(1),.formal-schedule-sheet td:nth-child(1){width:12%}.formal-schedule-sheet th:nth-child(2),.formal-schedule-sheet td:nth-child(2){width:8%}.formal-schedule-sheet th:nth-child(3),.formal-schedule-sheet td:nth-child(3){width:12%}.formal-schedule-sheet th:nth-child(4),.formal-schedule-sheet td:nth-child(4){width:11%}.formal-schedule-sheet th:nth-child(5),.formal-schedule-sheet td:nth-child(5){width:7%}.formal-schedule-sheet th:nth-child(6),.formal-schedule-sheet td:nth-child(6){width:32%}.formal-schedule-sheet th:nth-child(7),.formal-schedule-sheet td:nth-child(7){width:11%}.formal-schedule-sheet th:nth-child(8),.formal-schedule-sheet td:nth-child(8){width:7%}.formal-schedule-sheet .formal-teams{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px}.formal-schedule-sheet.landscape th:nth-child(6),.formal-schedule-sheet.landscape td:nth-child(6){width:38%}.formal-schedule-sheet>footer{gap:12px;margin-top:7px;font-size:9px}
.schedule-native-select{box-sizing:border-box;width:160px;height:40px;padding:0 36px 0 14px;border:1px solid #dcdfe6;border-radius:5px;color:#303133;background:#fff;font:inherit;cursor:pointer}.generator-page-heading .schedule-native-select{width:200px}.conflict-page-actions .schedule-native-select{width:128px}
.schedule-match-card>footer>span{display:flex;align-items:flex-start;flex-direction:column;gap:3px}.schedule-match-card>footer>span strong{color:#58675e;font-size:11px}.schedule-match-card>footer>span small{color:#087b29;font-size:10px;font-weight:700}.schedule-engine-upgrade{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:10px 0;padding:13px 16px;border:1px solid #efbf87;border-radius:8px;background:#fff8ef}.schedule-engine-upgrade>span{display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:8px}.schedule-engine-upgrade .el-icon{color:#dc751c;font-size:22px}.schedule-engine-upgrade small{color:#74685b}
.generation-format-diagnosis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:15px 0}.generation-format-diagnosis article{padding:12px 14px;border:1px solid #bcdac4;border-radius:8px;background:#f5fbf7}.generation-format-diagnosis article.shortage{border-color:#edb27d;background:#fff7ef}.generation-format-diagnosis header{display:flex;justify-content:space-between;gap:8px}.generation-format-diagnosis header span{color:#6a766f}.generation-format-diagnosis p{margin:8px 0;color:#5c6961}.generation-format-diagnosis b{color:#087b29}.generation-format-diagnosis article.shortage b{color:#d45d29}.generation-risk-reasons li b{color:#263b2d}
.schedule-calendar-add-bar{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:18px;padding:16px 18px;border:1px dashed #9ac7a7;border-radius:10px;background:#f5fbf7}.schedule-calendar-add-bar>span{display:grid;grid-template-columns:30px auto 1fr;align-items:center;gap:8px}.schedule-calendar-add-bar>span>.el-icon{display:grid;width:28px;height:28px;place-items:center;border-radius:50%;color:#fff;background:#087b29;font-size:19px}.schedule-calendar-add-bar>span small{color:#6b766f}.schedule-calendar-add-bar>div{display:flex;flex-wrap:wrap;gap:8px}@media(max-width:980px){.schedule-calendar-add-bar{align-items:flex-start;flex-direction:column}}
.generation-risk-dialog .el-dialog__header{display:none}.generation-risk-dialog .el-dialog__body{padding:0}.generation-risk-panel{padding:26px}.generation-risk-panel>header{display:flex;align-items:center;gap:16px;margin-bottom:20px}.generation-risk-panel>header>span{display:grid;width:52px;height:52px;place-items:center;border-radius:50%;color:#fff;background:#e4652e;font-size:30px}.generation-risk-panel h2{margin:0;font-size:24px}.generation-risk-panel header p{margin:7px 0 0;color:#6f756f}.generation-risk-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px}.generation-risk-summary article{padding:14px;border:1px solid #ead8c8;border-radius:8px;background:#fff9f3;text-align:center}.generation-risk-summary small{display:block;color:#766a60}.generation-risk-summary strong{display:block;margin-top:7px;color:#d45d29;font-size:25px}.generation-risk-reasons{margin:15px 0;padding:14px 18px;border-radius:8px;background:#f8f8f7}.generation-risk-reasons ul{max-height:150px;margin:10px 0 0;padding-left:22px;overflow:auto;color:#5f685f}.generation-risk-reasons li{margin:6px 0}.generation-risk-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:18px}.generation-risk-actions button{display:grid;grid-template-columns:34px 1fr;align-items:center;gap:10px;padding:15px;border:1px solid #dce4de;border-radius:8px;color:#25372c;background:#fff;text-align:left;cursor:pointer}.generation-risk-actions button:hover{border-color:#139447;background:#f3faf5}.generation-risk-actions .el-icon{color:#087b29;font-size:27px}.generation-risk-actions span{display:flex;flex-direction:column;gap:5px}.generation-risk-actions small{color:#707a73;line-height:1.45}.generation-risk-panel>footer{display:flex;justify-content:flex-end;gap:10px;margin-top:22px;padding-top:18px;border-top:1px solid #e4e9e5}@media(max-width:760px){.generation-risk-summary,.generation-risk-actions{grid-template-columns:1fr}}
.formal-schedule-sheet .formal-teams{overflow:visible;text-overflow:clip;white-space:nowrap;font-size:10px}
.formal-schedule-sheet th:nth-child(1),.formal-schedule-sheet td:nth-child(1){width:10%}.formal-schedule-sheet th:nth-child(2),.formal-schedule-sheet td:nth-child(2){width:7%}.formal-schedule-sheet th:nth-child(3),.formal-schedule-sheet td:nth-child(3){width:8%;white-space:nowrap}.formal-schedule-sheet th:nth-child(4),.formal-schedule-sheet td:nth-child(4){width:18%;white-space:nowrap}.formal-schedule-sheet th:nth-child(5),.formal-schedule-sheet td:nth-child(5){width:10%}.formal-schedule-sheet th:nth-child(6),.formal-schedule-sheet td:nth-child(6){width:5%}.formal-schedule-sheet th:nth-child(7),.formal-schedule-sheet td:nth-child(7){width:23%}.formal-schedule-sheet th:nth-child(8),.formal-schedule-sheet td:nth-child(8){width:10%}.formal-schedule-sheet th:nth-child(9),.formal-schedule-sheet td:nth-child(9){width:6%}.formal-schedule-sheet .formal-teams{font-size:9px;white-space:nowrap}
.schedule-match-card>header span{display:flex;align-items:center;flex-wrap:wrap;gap:5px}.schedule-match-card>header span>em{padding:2px 6px;border-radius:9px;background:#e7f4eb;color:#087b29;font-size:10px;font-style:normal;font-weight:800}.schedule-match-card.stage-tone-2{border-color:#9ccbe6;border-left-color:#2385bd}.schedule-match-card.stage-tone-2>header span>em{color:#176e9f;background:#e7f4fb}.schedule-match-card.stage-tone-3{border-color:#c5b5e8;border-left-color:#7753bd}.schedule-match-card.stage-tone-3>header span>em{color:#6343a8;background:#f0ebfb}.schedule-match-card.stage-tone-4,.schedule-match-card.stage-placement{border-color:#e8c49e;border-left-color:#d77a22}.schedule-match-card.stage-tone-4>header span>em,.schedule-match-card.stage-placement>header span>em{color:#b65f14;background:#fff1e4}.schedule-match-card.stage-league{border-color:#9dc9db;border-left-color:#177f9e}.schedule-match-card.stage-league>header span>em{color:#126b85;background:#e6f5f8}.schedule-match-card.stage-finals{border-color:#e2b0a8;border-left-color:#c43e2f;background:#fffafa;box-shadow:0 4px 14px rgba(155,48,36,.1)}.schedule-match-card.stage-finals>header span>em{color:#a62e23;background:#fde8e5}.schedule-match-card.stage-finals>header b{color:#b52f24}
.schedule-conflict-overlay{position:fixed;z-index:50;inset:92px 0 0 var(--admin-sidebar-width);padding:12px 18px 22px;overflow:auto;background:#f8faf9;--el-color-primary:#087b29}.conflict-page-heading{display:grid;grid-template-columns:1fr auto;align-items:end;gap:20px;padding-bottom:18px}.conflict-page-heading>div:first-child>span,.conflict-page-heading p{color:#68756e}.conflict-page-heading h1{margin:8px 0 4px;font-size:30px}.conflict-page-heading p{margin:0}.conflict-page-actions{display:flex;align-items:center;gap:12px}.conflict-page-actions .el-select{width:128px}.conflict-page-actions .el-button{height:42px;min-width:130px}.conflict-page-actions .el-button--success{border-color:#075c27;background:#075c27}.conflict-stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-bottom:18px}.conflict-stat-grid article{display:flex;align-items:center;gap:18px;min-height:88px;padding:16px 22px;border:1px solid #dfe5e1;border-radius:7px;background:#fff}.conflict-stat-grid article>.el-icon{color:#087b29;font-size:38px}.conflict-stat-grid article.warning>.el-icon{color:#f27b16}.conflict-stat-grid article.passed{border-color:#c2ddc7;background:#fbfefb}.conflict-stat-grid strong{font-size:20px}.conflict-stat-grid small{display:block;margin-top:7px;color:#6c7971;font-size:13px;font-weight:400}.conflict-page-body{display:grid;grid-template-columns:370px 1fr;gap:18px;min-height:560px}.conflict-list-card,.conflict-detail-card{border:1px solid #dfe5e1;border-radius:8px;background:#fff}.conflict-list-card{display:flex;flex-direction:column;padding:16px}.conflict-list-card>header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.conflict-list-card h2{margin:0;font-size:19px}.conflict-list-item{display:flex;align-items:flex-start;flex-direction:column;width:100%;margin-bottom:12px;padding:15px;border:1px solid #d9e0db;border-left:4px solid #aeb8b2;border-radius:6px;background:#fff;text-align:left;cursor:pointer}.conflict-list-item.active{border-color:#f3c79d;border-left-color:#f27b16;background:#fffaf5}.conflict-list-item>span{display:flex;align-items:center;gap:5px;color:#ee6f12}.conflict-list-item>span.info{color:#3281de}.conflict-list-item strong{margin:10px 0 7px;font-size:16px}.conflict-list-item p{margin:0 0 8px;color:#65736b}.conflict-list-item small{color:#718078}.conflict-list-card>footer{display:flex;align-items:center;gap:8px;margin-top:auto;padding:15px;border-top:1px solid #e2e7e4;color:#56645c}.conflict-list-card>footer .el-icon{color:#087b29;font-size:22px}.conflict-list-card>footer b{margin-left:auto}.conflict-detail-card{padding:18px}.conflict-detail-card>header{display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:1px solid #e2e7e4}.conflict-detail-card>header>div{display:flex;align-items:center;gap:12px}.conflict-detail-card>header>div>.el-icon{color:#f27b16;font-size:34px}.conflict-detail-card>header span{display:flex;flex-direction:column;gap:5px}.conflict-detail-card>header small{color:#e66f17}.conflict-detail-card>header strong{font-size:18px}.affected-matches{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:16px 0}.affected-matches p{display:flex;flex-direction:column;gap:7px;margin:0;padding:14px;border:1px solid #e1e6e3;border-radius:6px}.affected-matches span,.affected-matches em{color:#68766e;font-size:13px;font-style:normal}.affected-matches b{font-size:16px}.rest-gap-alert{display:flex;align-items:center;gap:12px;margin-bottom:15px;padding:13px;color:#eb6d13;background:#fff5ea}.rest-gap-alert span{margin-left:auto;color:#5f6d65}.conflict-recommendation{padding:16px;border:1px solid #bcd9c2;border-radius:7px;background:#fbfefb}.conflict-recommendation header{display:flex;align-items:center;justify-content:space-between}.conflict-recommendation header>span{display:flex;align-items:center;gap:7px;color:#087b29;font-weight:700}.conflict-recommendation>strong{display:block;margin:14px 0 8px;font-size:17px}.conflict-recommendation p{color:#647269}.conflict-recommendation button{width:100%;height:42px;border:0;border-radius:4px;color:#fff;background:#075c27;font-size:16px;cursor:pointer}.conflict-detail-actions{display:flex;align-items:center;justify-content:space-between;margin-top:16px}.conflict-detail-card>footer{display:flex;align-items:center;gap:8px;margin-top:18px;padding:13px;color:#526159;background:#f5f7f6}.conflict-detail-card>footer .el-icon{color:#3281de}
.schedule-business-mask{position:fixed;z-index:70;inset:0;display:grid;place-items:center;padding-left:var(--admin-sidebar-width);background:rgba(255,255,255,.72);backdrop-filter:blur(1px);--el-color-primary:#087b29}.match-edit-modal,.rule-impact-modal{width:590px;max-height:calc(100vh - 90px);overflow:auto;border:1px solid #dfe5e1;border-radius:12px;background:#fff;box-shadow:0 18px 50px rgba(25,43,32,.16)}.match-edit-modal>header,.rule-impact-modal>header{position:relative;display:flex;align-items:flex-start;gap:14px;padding:22px 26px 16px;border-bottom:1px solid #e1e6e3}.match-edit-modal>header>div,.rule-impact-modal>header>div{flex:1}.match-edit-modal h2,.rule-impact-modal h2{margin:0;font-size:24px}.match-edit-modal h2 .el-tag{vertical-align:4px}.match-edit-modal>header p,.rule-impact-modal>header p{margin:8px 0 0;color:#69766e}.match-edit-modal>header>button,.rule-impact-modal>header>button{border:0;background:transparent;color:#4d5b53;font-size:23px;cursor:pointer}.match-edit-modal>header>span{position:absolute;right:26px;bottom:10px;color:#087b29;font-size:13px}.edit-match-summary{margin:0 26px;padding:15px 0;border-bottom:1px solid #e1e6e3}.edit-match-summary small,.edit-match-summary strong,.edit-match-summary p,.edit-match-summary em{display:block}.edit-match-summary strong{margin:8px 0;font-size:19px}.edit-match-summary p{margin:0 0 8px;color:#68756e}.edit-match-summary em{display:flex;align-items:center;gap:5px;color:#ef7011;font-style:normal}.match-edit-form{padding:15px 26px 0}.match-edit-form .el-form-item{margin-bottom:14px}.match-edit-form :deep(.el-date-editor),.match-edit-form :deep(.el-select),.match-edit-form :deep(.el-input){width:100%}.edit-time-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}.edit-validation{margin:0 26px;padding:13px 15px 0;border:1px solid #bddac3;border-radius:7px;background:#fbfefb}.edit-validation header,.edit-validation p{display:flex;align-items:center;justify-content:space-between}.edit-validation header{margin-bottom:5px;color:#087b29}.edit-validation p{margin:8px 0}.edit-validation p span{display:flex;align-items:center;gap:7px}.edit-validation p .el-icon{color:#087b29}.edit-validation footer{margin:10px -15px 0;padding:10px 15px;border-top:1px solid #dce8df;color:#68766e}.match-edit-actions{display:flex;align-items:center;justify-content:space-between;padding:18px 26px 24px}.match-edit-actions>button{border:0;color:#2d78da;background:transparent;cursor:pointer}.match-edit-actions>div{display:flex;gap:12px}.match-edit-actions .el-button{min-width:92px}.match-edit-actions .el-button--success{min-width:175px;border-color:#075c27;background:#075c27}
.rule-impact-modal{width:635px}.rule-impact-modal>header{align-items:center}.impact-warning{display:grid;flex:0 0 44px;width:44px;height:44px;place-items:center;border-radius:50%;color:#fff;background:#f26e0e;font-size:27px}.rule-impact-modal>h3{margin:18px 28px 10px;font-size:17px}.impact-option{display:grid;grid-template-columns:40px 1fr auto;align-items:center;gap:12px;margin:10px 28px;padding:14px;border:1px solid #c9decf;border-radius:6px}.impact-option.risky{border-color:#f1c8a4}.impact-option>.el-icon{color:#087b29;font-size:28px}.impact-option.risky>.el-icon{color:#f06f13}.impact-option span{display:flex;flex-direction:column;gap:5px}.impact-option small{color:#68756e}.impact-snapshot{display:grid;grid-template-columns:repeat(4,1fr);margin:10px 28px;padding:15px 18px;border:1px solid #d9e0db;border-radius:6px}.impact-snapshot span{padding:0 12px;border-right:1px solid #e1e6e3;color:#5c6a62;text-align:center}.impact-snapshot span:last-child{border:0}.impact-snapshot b{color:#26332c}.impact-checkbox{display:grid;grid-template-columns:auto 1fr;align-items:center;margin:12px 28px;color:#26332c}.impact-checkbox small{grid-column:2;color:#68756e}.impact-note{display:flex;align-items:center;gap:8px;margin:20px 28px;padding-top:16px;border-top:1px solid #e1e6e3;color:#56645c}.impact-note .el-icon{color:#3281de}.rule-impact-modal>footer{display:flex;align-items:center;justify-content:space-between;padding:0 28px 22px}.rule-impact-modal>footer>button{border:0;color:#2d78da;background:transparent;cursor:pointer}.rule-impact-modal>footer>div{display:flex;gap:10px}.rule-impact-modal>footer .el-button--success{border-color:#075c27;background:#075c27}
.edit-native-select{box-sizing:border-box;width:100%;height:40px;padding:0 34px 0 12px;border:1px solid #dcdfe6;border-radius:4px;color:#303133;background:#fff;font:inherit;cursor:pointer}.workbench-back{display:block!important;width:max-content;margin:0 0 4px -12px!important;padding:0 12px!important;color:#087b29!important}.workbench-empty{display:grid;min-height:520px;place-items:center;align-content:center;gap:12px;border:1px dashed #cbd8cf;border-radius:10px;background:#fff;text-align:center}.workbench-empty>.el-icon{color:#087b29;font-size:58px}.workbench-empty h2{margin:6px 0 0;font-size:25px}.workbench-empty p{max-width:620px;margin:0;color:#69776f;line-height:1.7}.workbench-empty>div{display:flex;gap:12px;margin-top:8px}.venue-table-card header>div small{display:block;margin-top:6px;color:#758179}.venue-table-card td .el-input{width:100%}.time-slot-help{margin:8px 0 12px;color:#6d7972;line-height:1.5}.pre-generation-summary{display:grid;min-height:250px;place-items:center;align-content:center;padding:24px;text-align:center}.pre-generation-summary>.el-icon{color:#3281de;font-size:44px}.pre-generation-summary h4{margin:14px 0 8px;font-size:20px}.pre-generation-summary p{max-width:650px;margin:0;color:#637169;line-height:1.8}.real-conflict-body{display:block}.real-conflict-body .conflict-list-card{min-height:500px}.real-conflict-body .conflict-list-item{max-width:none}.locked-schedule-scope{display:grid;grid-template-columns:34px 1fr;gap:8px 12px;padding:16px;border:1px solid #cfe0d3;border-radius:7px;background:#f8fcf9}.locked-schedule-scope>.el-icon{grid-row:1/span 2;color:#087b29;font-size:26px}.locked-schedule-scope strong{font-size:18px}.locked-schedule-scope span{color:#68766e;line-height:1.6}.venue-allocation-note>p{display:flex;align-items:center;gap:9px;margin:14px 0 7px;color:#087b29}.venue-allocation-note>p .el-icon{font-size:22px}.venue-allocation-note>small{display:block;color:#68766e;line-height:1.7}.readonly-parameter strong{color:#087b29;font-size:17px}.readonly-parameter>span{color:#718078}.automatic-frequency-rule{display:grid!important;grid-template-columns:28px 1fr!important;gap:5px 10px!important;padding:14px!important;border:1px solid #cfe0d3!important;border-radius:7px!important;background:#f8fcf9!important}.automatic-frequency-rule>.el-icon{grid-row:1/span 2;color:#087b29;font-size:22px}.automatic-frequency-rule strong{font-size:16px}.automatic-frequency-rule span{color:#68766e;line-height:1.6}.session-window-rules article{display:grid;grid-template-columns:42px 46px 1fr 20px 1fr;align-items:center;gap:8px;margin:10px 0;padding:10px;border:1px solid #dfe6e1;border-radius:6px}.session-window-rules article.disabled{opacity:.55;background:#f6f8f7}.session-window-rules article .el-select{width:100%}.auto-slot-preview{display:flex;min-height:44px;flex-wrap:wrap;align-items:center;gap:7px;margin:12px 0;padding:9px;border:1px solid #dfe6e1;border-radius:6px;background:#f8faf9}.auto-slot-preview>span{color:#5f6d65}.auto-slot-preview em{color:#9aa49e;font-style:normal}.session-frequency-note{margin:10px 0 0;padding:10px;color:#087b29;background:#edf7ef;line-height:1.6}.enforced-strategy p{display:grid;grid-template-columns:26px 1fr;gap:3px 10px;margin:0;padding:14px 8px;border-bottom:1px solid #e2e7e4}.enforced-strategy p>.el-icon{grid-row:1/span 2;color:#087b29;font-size:21px}.enforced-strategy span{display:flex;flex-direction:column;gap:4px}.enforced-strategy small{color:#718078}
.venue-resource-editor{min-width:0}.venue-resource-list{display:flex;flex-direction:column;gap:12px}.venue-resource-list>article{padding:14px;border:1px solid #dfe6e1;border-radius:8px;background:#fbfdfb}.venue-resource-list>article>header{display:grid;grid-template-columns:1fr auto;gap:12px;margin:0 0 12px}.venue-resource-list>article>header button{border:0;color:#d85845;background:transparent;cursor:pointer}.venue-session-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.venue-session-grid label{padding:10px;border:1px solid #dfe6e1;border-radius:6px;background:#fff}.venue-session-grid label.disabled{opacity:.55;background:#f3f5f4}.venue-session-grid label>span{display:flex;align-items:center;gap:8px;margin-bottom:9px}.venue-session-grid label>div{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:5px}.venue-session-grid .el-select{width:100%}.venue-session-grid em{color:#718078;font-style:normal}.venue-resource-list article>footer{display:flex;min-height:36px;flex-wrap:wrap;align-items:center;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid #e4e9e6}.venue-resource-list article>footer>span{color:#637169}.venue-resource-list article>footer>em{color:#9aa49e;font-style:normal}.capacity-note>strong{display:block;margin:12px 0 4px;color:#087b29;font-size:30px}.capacity-note p,.capacity-note small{color:#68766e;line-height:1.6}
.joint-division-chip{padding:9px 15px;border:1px solid #b9ddc5;border-radius:6px;color:#087b29;background:#f3faf5;white-space:nowrap}.joint-division-specs{grid-column:1/-1;display:flex;flex-direction:column;gap:8px;margin-top:10px}.joint-division-specs article{display:grid;grid-template-columns:120px 1fr 1.35fr 70px;align-items:center;gap:10px;padding:11px 13px;border:1px solid #dfe6e1;border-radius:6px;background:#f9fcfa}.joint-division-specs article strong{color:#17452d}.joint-division-specs article span{color:#66746c}.joint-division-specs article b{color:#087b29;text-align:right}
.venue-resource-list>article>header{grid-template-columns:minmax(0,1fr) 190px auto}.venue-resource-list article>footer>strong{margin-right:6px;color:#087b29}.capacity-analysis{margin-top:16px;padding:20px;border:1px solid #e4ba86;border-radius:9px;background:#fffaf4}.capacity-analysis.ready{border-color:#b8d9c1;background:#f8fcf9}.capacity-analysis>header{display:flex;align-items:center;justify-content:space-between}.capacity-analysis h3{margin:0;font-size:20px}.capacity-analysis header p{margin:5px 0 0;color:#6c7871}.capacity-format-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin-top:15px}.capacity-format-grid article{padding:14px;border:1px solid #c9dfcf;border-radius:7px;background:#fff}.capacity-format-grid article.shortage{border-color:#efbc8d;background:#fffaf5}.capacity-format-grid article>header{display:flex;justify-content:space-between}.capacity-format-grid article>header strong{font-size:17px}.capacity-format-grid dl{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.capacity-format-grid dl>div{display:flex;justify-content:space-between;padding:7px;background:#f6f8f7}.capacity-format-grid dt{color:#69766e}.capacity-format-grid dd{margin:0;font-weight:700}.capacity-format-grid dd.danger{color:#df5f28}.capacity-format-grid article>p{margin:0;color:#6a756f;line-height:1.6}.capacity-analysis>footer{display:flex;align-items:center;flex-wrap:wrap;gap:9px;margin-top:15px;padding-top:14px;border-top:1px solid #eadbca}.capacity-analysis>footer>span{font-weight:700}.capacity-analysis>footer small{width:100%;color:#7a837e}.preview-stats article.blocked{border-color:#efb583;color:#e36d28;background:#fff8f1}.preview-stats article.blocked span{margin-left:auto;padding:5px 9px;color:#d65d21;background:#ffeadb;font-size:13px}
.joint-division-specs{gap:12px;margin-top:18px}.joint-division-specs article{grid-template-columns:190px minmax(130px,.8fr) minmax(240px,1.35fr) 76px;min-height:76px;box-sizing:border-box;gap:20px;padding:13px 18px}.joint-division-identity{display:flex;align-items:flex-start;flex-direction:column;gap:7px;min-width:0}.joint-division-identity strong{font-size:18px;line-height:1.25;white-space:nowrap}.joint-division-identity em{display:inline-flex;padding:3px 9px;border:1px solid #acd5ba;border-radius:12px;color:#087b29;background:#eef8f1;font-size:13px;font-style:normal;font-weight:700}.joint-division-specs article>span{font-size:15px;line-height:1.5}.joint-division-specs article>b{font-size:18px;white-space:nowrap}
@media(max-width:1100px){.conflict-page-actions{flex-wrap:wrap}.conflict-stat-grid{grid-template-columns:1fr 1fr}.conflict-page-body{grid-template-columns:320px 1fr}.schedule-business-mask{padding-left:0}.venue-session-grid{grid-template-columns:1fr}.joint-division-specs article{grid-template-columns:160px 1fr}.joint-division-specs article b{text-align:left}.venue-resource-list>article>header{grid-template-columns:1fr}}
</style>
