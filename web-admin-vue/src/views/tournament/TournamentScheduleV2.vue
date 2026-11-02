<template>
  <main class="schedule-v2" v-loading="loading">
    <header v-if="view !== 'workbench'" class="page-header">
      <div>
        <span>赛事空间　/　比赛管理</span>
        <h1>{{ view === 'map' ? '比赛管理' : viewTitle }}</h1>
      </div>
      <div class="event-context">
        <strong>{{ tournament.name || '当前赛事' }}</strong>
        <el-tag type="success" effect="plain">{{ divisions.length }}个组别</el-tag>
        <el-button v-if="view !== 'map'" type="success" plain @click="goScheduleCenter">赛程中心</el-button>
        <el-button plain @click="router.push('/tournament-space')">返回赛事空间</el-button>
      </div>
    </header>

    <section v-if="view !== 'map' && view !== 'workbench'" class="subview-bar">
      <el-button text @click="setView('map')"><el-icon><ArrowLeft /></el-icon>返回比赛地图</el-button>
      <span v-if="view !== 'imports'">{{ viewTitle }}</span>
    </section>

    <section v-if="view === 'workbench'" ref="workbenchRoot">
      <PairingResult :rows="matches" :event="tournament" :divisions="divisions" :can-adjust="canAdjustSchedule" :can-assign="canAssignReferee" :state-label="match => managementState(match).label" :focus-id="nextMatchId" @edit="openEdit" @sequence="openSequenceEdit" @referee="match => openRefereeAssignment(match,'referee')" @kit="match => openRefereeAssignment(match,'kit')" @detail="openMatchWorkspace" @reset="load" @navigate="setView" @scope="value => {divisionFilter=value;workbenchDivision=value}" />
    </section>

    <section v-if="view === 'referees'">
      <RefereeCenter :matches="matches" :event="tournament" :can-assign="canAssignReferee" :config="tournamentRefereeConfig" :assigning="batchAssigning" @navigate="setView" @referee="match => openRefereeAssignment(match,'referee')" @auto-assign="batchAutoAssignReferees" @docs="openRefereePreMatchDocs" />
    </section>

    <template v-if="view === 'settings'">
      <section class="settings-intro">
        <div><h2>整届赛事统一配置</h2><p>日期、场地和时段只维护一份；各组别只在总日历内限制可用资源。</p></div>
        <el-tag :type="calendarConfigured ? 'success' : 'warning'">{{ calendarConfigured ? '已创建赛事日历' : '待创建赛事日历' }}</el-tag>
      </section>

      <section class="settings-card">
        <header><h2>公共日历</h2><span>所有组别共享</span></header>
        <div class="settings-grid">
          <label><span>比赛周期</span><div class="date-range"><el-date-picker v-model="config.startDate" type="date" value-format="YYYY-MM-DD" format="YYYY.MM.DD" /><i>至</i><el-date-picker v-model="config.endDate" type="date" value-format="YYYY-MM-DD" format="YYYY.MM.DD" /></div></label>
          <label><span>默认场间隔</span><el-input-number v-model="config.defaultTurnaroundMinutes" :min="0" :max="180" :step="5" @change="applyDefaultTurnaround" /><small>分钟</small></label>
          <label><span>球队频次</span><el-select v-model="config.frequencyPreset" @change="resetPolicies"><el-option label="按制式自适应" value="adaptive" /><el-option label="全部一天一场" value="daily_one" /><el-option label="上下午各1场" value="am_pm" /><el-option label="按组别自定义" value="custom" /></el-select></label>
          <label><span>重要比赛</span><el-switch v-model="config.finalStageExclusive" /><small>决赛、半决赛、三四名决赛独占时段，不与其他场地同时开赛</small></label>
          <label class="weekdays weekday-tiles"><span>比赛日</span><div class="match-date-tiles"><button v-for="day in periodCalendarDays" :key="day.date" type="button" :class="['match-date-tile', { active: matchDateSet.has(day.date) }]" @click="toggleMatchDate(day.date)"><strong>{{ day.dayOfMonth }}</strong><small>{{ day.weekdayShort }}</small></button></div><small v-if="!periodCalendarDays.length">请先选择比赛周期</small><small v-else>点击方块勾选比赛日，已选 {{ config.matchDates.length }} 天</small></label>
        </div>
        <div class="session-editor"><div class="session-editor-title"><strong>可用时间段</strong><span>控制当天哪些时段开放比赛；开赛点按场地的首末场与比赛时长自动落在这些时段内</span></div><div v-for="window in config.sessionWindows" :key="window.key" class="session-row"><el-switch v-model="kickoffPeriodEnabled[window.key]" /><strong>{{ window.label }}</strong><el-time-picker v-model="window.start" :disabled="kickoffPeriodEnabled[window.key]===false" format="HH:mm" value-format="HH:mm" placeholder="09:00" style="width:104px" /><i>至</i><el-time-picker v-model="window.end" :disabled="kickoffPeriodEnabled[window.key]===false" format="HH:mm" value-format="HH:mm" placeholder="12:00" style="width:104px" /><small>{{ sessionSlotHint(window) }}</small></div></div>
        <div class="kickoff-time-editor"><label>开赛点</label><div class="kickoff-chip-list"><template v-for="(time,i) in selectedKickoffTimes" :key="i"><el-time-picker v-if="editingKickoff===i" v-model="editKickoffValue" format="HH:mm" value-format="HH:mm" size="small" style="width:110px" /><el-button v-if="editingKickoff===i" size="small" type="success" @click="confirmKickoff(i)">确认</el-button><el-tag v-else closable size="large" @close="removeKickoff(i)" @dblclick="startEditKickoff(i)">{{ time }}</el-tag></template><el-time-picker v-model="newKickoff" format="HH:mm" value-format="HH:mm" placeholder="添加时间" style="width:120px" size="small" /><el-button size="small" type="success" plain @click="addKickoff">＋</el-button></div><p class="kickoff-hint">双击标签可编辑时间；相邻间隔须 ≥ 比赛时长 + 转场时间（{{ Math.max(...divisions.map(d=>matchMinutes(d)||50),0) + config.defaultTurnaroundMinutes }} 分钟），太紧密会被拦截。</p></div>
      </section>

      <section class="settings-card">
        <header><h2>场地</h2><el-button type="success" plain @click="addVenue">＋ 增加场地</el-button></header>
        <table class="settings-table venue-settings-table"><thead><tr><th>场地名称</th><th>场地制式</th><th>首场</th><th>末场</th><th>自动开赛点</th><th></th></tr></thead><tbody><tr v-for="(venue,index) in config.venueResources" :key="index"><td><el-input v-model="venue.name" placeholder="如：1号场地" /></td><td><el-select v-model="venue.fieldFormat"><el-option v-for="option in fieldFormats" :key="option.value" :label="option.label" :value="option.value" /></el-select></td><td><el-time-picker v-model="venue.startTime" format="HH:mm" value-format="HH:mm" placeholder="09:00" style="width:112px" /></td><td><el-time-picker v-model="venue.endTime" format="HH:mm" value-format="HH:mm" placeholder="18:00" style="width:112px" /></td><td class="venue-kickoff-cell"><div class="kickoff-auto-chips"><span v-for="time in venueKickoffTimes(venue)" :key="time" class="kickoff-chip">{{ time }}</span><span v-if="!venueKickoffTimes(venue).length" class="kickoff-empty">无可用开赛点</span></div><small class="venue-step">间隔 {{ venueStepMinutes(venue) }} 分钟（比赛 {{ venueMatchDuration(venue) }} + 转场 {{ config.defaultTurnaroundMinutes }}）· 共 {{ venueKickoffTimes(venue).length }} 场/天</small></td><td><el-button link type="danger" @click="config.venueResources.splice(index,1)">删除</el-button></td></tr><tr v-if="!config.venueResources.length"><td colspan="6" class="empty-cell">请添加真实比赛场地</td></tr></tbody></table>
      </section>

      <section class="settings-card">
        <header><div><h2>组别策略</h2><span>默认继承公共设置，只在有特殊需求时覆盖</span></div></header>
        <div class="division-policy-table"><table><thead><tr><th>组别</th><th>制式</th><th>比赛时长</th><th>待排</th><th>场间隔</th><th>每天上限</th><th>同时段</th><th>最短休息</th><th>资源限制</th><th>容量</th></tr></thead><tbody><tr v-for="division in divisions" :key="division.id"><td><strong>{{ division.name }}</strong></td><td>{{ formatLabel(division) }}</td><td>{{ matchMinutes(division) || '待设置' }}<small v-if="matchMinutes(division)">分钟</small></td><td>{{ pendingCountForDivision(division.id) }}场</td><td><el-input-number v-model="policyFor(division).turnaroundMinutes" :min="0" :max="180" :step="5" size="small" /></td><td><el-input-number v-model="policyFor(division).maxMatchesPerDay" :min="1" :max="4" size="small" /></td><td><el-input-number v-model="policyFor(division).maxPerSession" :min="1" :max="4" size="small" /></td><td><el-input-number v-model="policyFor(division).minRestMinutes" :min="0" :max="4320" :step="30" size="small" /></td><td><el-button link type="success" @click="openPolicyLimits(division)">{{ hasPolicyLimits(division) ? '已限制' : '设置' }}</el-button></td><td><el-tag :type="capacityForDivision(division).ready ? 'success' : 'danger'">{{ capacityForDivision(division).ready ? '充足' : `缺${capacityForDivision(division).shortage}场` }}</el-tag></td></tr></tbody></table></div>
      </section>

      <section class="settings-card capacity-audit" :class="{ blocked: !capacityAudit.ready, passed: capacityAudit.ready }">
        <header><div><h2>赛期与场地容量核定</h2><span>按场地制式核算：当前比赛日、场地与时间设置能否容纳全部需要编排的比赛</span></div><el-tag :type="capacityAudit.ready ? 'success' : 'danger'">{{ capacityAudit.ready ? '理论容量满足' : '容量不足' }}</el-tag></header>
        <el-alert v-if="capacityAudit.missingDates" type="warning" :closable="false" title="请先在「公共日历」设置完整的比赛周期（开始与结束日期）" />
        <el-alert v-else-if="capacityAudit.noEligibleDates" type="warning" :closable="false" title="当前比赛周期内没有勾选的比赛日，请先在「公共日历」按日期勾选" />
        <el-alert v-else-if="!capacityAudit.rows.length" type="info" :closable="false" title="当前没有可核算的比赛场次" />
        <div v-else class="capacity-format-grid"><article v-for="row in capacityAudit.rows" :key="row.fieldFormat" :class="{ shortage: row.shortage > 0 }"><header><strong>{{ row.label }}</strong><span>{{ row.fieldCount }}块场地</span></header><dl><div><dt>需要场次</dt><dd>{{ row.requiredMatches }}场</dd></div><div><dt>每日资源格</dt><dd>{{ row.dailySlots }}个</dd></div><div><dt>赛期理论容量</dt><dd>{{ row.totalCapacity }}场</dd></div><div><dt>容量差额</dt><dd :class="{ danger: row.shortage > 0 }">{{ row.shortage ? `缺${row.shortage}场` : '满足' }}</dd></div></dl><p>{{ capacityRecommendation(row) }}</p></article></div>
        <div v-if="capacityAuditBreakdown.length" class="capacity-pending-list"><header><strong>未排场次筛查明细</strong><span>逐组别列出尚未安排日期、时间或场地的比赛及原因</span></header><ul><li v-for="row in capacityAuditBreakdown" :key="row.divisionId"><b>{{ row.name }}<small>{{ row.formatLabel }}</small></b><span><em>{{ row.pending }}场未排</em>{{ row.reasons.length ? `（${row.reasons.join('；')}）` : '' }}</span></li></ul></div>
        <div class="capacity-audit-foot"><span>合计需要 <b>{{ capacityAudit.requiredMatches }}</b> 场 · 理论容量 <b>{{ capacityAudit.totalCapacity }}</b> 场 · 有效比赛日 <b>{{ capacityAudit.availableDays }}</b> 天</span><small>点「自动排程」时会先做同一套核定，容量不足将直接阻断并列出原因。</small></div>
      </section>

      <section class="capacity-bar"><div><strong>全赛事 {{ matches.length }} 场</strong><span>{{ allCalendarDays.length }}个有效比赛日 · {{ config.venueResources.length }}块场地 · {{ totalCapacity }}场理论容量</span></div><el-button plain @click="resetPolicies">恢复自适应默认</el-button><el-button type="success" size="large" :loading="savingSettings" @click="saveSettings">保存并创建空日历</el-button></section>
    </template>

    <template v-else-if="view === 'imports'">
      <input ref="fileInput" class="hidden-input" type="file" accept=".xlsx,.xls" @change="readImportFile" />
      <div v-if="importFileName" class="upload-replace"><el-button plain @click="fileInput?.click()">重新上传</el-button></div>
      <el-alert v-if="!scheduleImportWriteEnabled" class="import-write-gate" type="warning" :closable="false" title="当前可识别预览，暂不能保存排期。" />

      <template v-if="importFileName">
        <section class="recognition-summary">
          <div><span>已识别文件</span><strong>{{ importFileName }}</strong></div><span><b>{{ recognitionStats.total }}</b>行比赛</span><span><b>{{ recognitionStats.recognized }}</b>场已匹配</span><span class="ready"><b>{{ recognitionStats.ready + recognitionStats.plannedKnockout }}</b>场地图预览</span><span v-if="recognitionStats.plannedKnockout" class="planned"><b>{{ recognitionStats.plannedKnockout }}</b>场淘汰赛后台站位</span><span><b>{{ recognitionStats.pairingOnly }}</b>场时间待填</span><span :class="{ danger:recognitionStats.unmatched || recognitionStats.incomplete }"><b>{{ recognitionStats.unmatched + recognitionStats.incomplete }}</b>项待处理</span><el-tag v-if="recognitionStats.plannedKnockout" :type="knockoutPrepareError ? 'danger' : 'warning'" effect="plain">{{ preparingKnockout ? '后台正在自动创建占位' : knockoutPrepareError ? '自动创建失败' : scheduleImportWriteEnabled ? '等待自动创建' : '自动创建待服务部署' }}</el-tag><el-button v-else type="success" :disabled="!scheduleImportWriteEnabled || !recognitionStats.ready || recognitionStats.unmatched > 0 || recognitionStats.incomplete > 0" @click="prepareRecognizedImport">{{ scheduleImportWriteEnabled ? '核对导入' : '暂不能导入' }}</el-button>
        </section>

        <section class="recognition-card">
          <header><div><h2>识别结果</h2><span>上传只做识别；淘汰赛会以“A组第1”“场序X胜者/负者”占位，小组赛结束后再解析为实际球队。</span></div><el-radio-group v-model="recognitionFilter" size="small"><el-radio-button value="all">全部</el-radio-button><el-radio-button value="ready">可映射</el-radio-button><el-radio-button value="planned_knockout">淘汰赛占位</el-radio-button><el-radio-button value="pairing_only">待填时间</el-radio-button><el-radio-button value="issues">待处理</el-radio-button></el-radio-group></header>
          <div class="recognition-table-wrap"><table class="recognition-table"><thead><tr><th>原表行</th><th>场序</th><th>组别</th><th>对阵</th><th>日期时间</th><th>场地</th><th>系统匹配</th><th>状态</th></tr></thead><tbody><tr v-for="row in filteredRecognitionRows" :key="`${row.sourceRow}-${row.matchNo}`"><td>{{ row.sourceRow }}</td><td>{{ row.matchNo || '-' }}</td><td>{{ row.division || '-' }}</td><td><strong>{{ row.home || '待定' }}</strong><em>VS</em><strong>{{ row.away || '待定' }}</strong></td><td>{{ row.matchDate || '待填' }}<small>{{ row.matchTime || '待填' }}</small></td><td>{{ row.venue || '待填' }}</td><td><span v-if="row.matchLabel">{{ row.matchLabel }}</span><span v-else class="danger">{{ row.message }}</span></td><td><el-tag :type="recognitionTagType(row.status)">{{ recognitionStatusLabel(row.status) }}</el-tag></td></tr></tbody></table></div>
        </section>

        <section v-if="recognitionMapRows.length" class="recognition-card">
          <header><div><h2>识别后地图预览</h2><span>按上传文件的日期、时间和场地展示，此时尚未写入正式赛事地图。</span></div></header>
          <div class="recognized-map"><article v-for="date in recognitionMapDates" :key="date"><header><strong>{{ date }}</strong><span>{{ recognitionMapRows.filter(row => row.matchDate === date).length }}场</span></header><div class="recognized-map-grid"><section v-for="venue in recognitionMapVenues(date)" :key="venue"><h3>{{ venue }}</h3><div v-for="row in recognizedMapMatches(date,venue)" :key="`${row.sourceRow}-${row.matchNo}`"><time>{{ row.matchTime }}</time><span><small>{{ row.division }}<em v-if="row.status === 'planned_knockout'">淘汰赛占位</em></small><strong>{{ row.home }}<em>VS</em>{{ row.away }}</strong></span></div></section></div></article></div>
        </section>
        <section class="import-confirm-bar">
          <div><strong>确认导入赛事地图</strong><span v-if="preparingKnockout">后台正在准备 {{ recognitionStats.plannedKnockout }} 场淘汰赛占位。</span><span v-else-if="knockoutPrepareError" class="danger">自动创建失败：{{ knockoutPrepareError }}</span><span v-else-if="recognitionStats.plannedKnockout">还有 {{ recognitionStats.plannedKnockout }} 场淘汰赛占位未创建。</span><span v-else-if="recognitionStats.unmatched || recognitionStats.incomplete">请先处理 {{ recognitionStats.unmatched + recognitionStats.incomplete }} 项未匹配或不完整排期。</span><span v-else>将把 {{ recognitionStats.ready }} 场比赛的日期、时间和场地写入赛事地图。</span></div><el-button v-if="recognitionStats.plannedKnockout && !preparingKnockout && scheduleImportWriteEnabled" plain type="warning" @click="autoPrepareKnockoutPairings">重试自动创建</el-button><el-button plain @click="clearRecognition">取消本次识别</el-button><el-button type="success" size="large" :disabled="!canConfirmRecognizedImport" @click="prepareRecognizedImport">确认导入赛事地图</el-button>
        </section>
      </template>

      <section v-else class="import-empty"><el-icon><Upload /></el-icon><el-button type="success" @click="fileInput?.click()">上传赛程</el-button><small>支持 .xlsx、.xls</small></section>
    </template>

    <template v-else-if="view === 'map'">
      <section v-if="!calendarConfigured" class="calendar-empty"><el-icon><Calendar /></el-icon><h2>先创建赛事日历</h2><p>统一设置比赛日、场地和时段，然后再手动、Excel或自动排期。</p><el-button type="success" @click="setView('settings')">进入赛程设置</el-button></section>
      <template v-else>
        <section class="map-summary"><span><b>{{ matches.length }}</b>场比赛</span><span class="played"><b>{{ playedMatches }}</b>场已进行</span><span class="remaining"><b>{{ remainingMatches }}</b>场剩余</span><i /><el-button plain @click="openManualAdd"><el-icon><Plus /></el-icon>场次</el-button><el-button plain @click="setView('settings')"><el-icon><Setting /></el-icon>赛程设置</el-button><el-button plain @click="setView('imports')"><el-icon><Upload /></el-icon>上传赛程</el-button><el-button type="success" :loading="autoScheduling" :disabled="!pendingMatches.length" @click="openAutoSchedule"><el-icon><MagicStick /></el-icon>自动排程</el-button></section>

        <section class="map-toolbar"><el-select v-model="divisionFilter"><el-option label="全部组别" value="all" /><el-option v-for="division in divisions" :key="division.id" :label="divisionOptionLabel(division)" :value="division.id" /></el-select><el-checkbox v-model="matchDayOnly" class="matchday-toggle">只显比赛日</el-checkbox><div class="date-tabs"><button v-for="day in visibleCalendarDays" :key="day.date" type="button" :class="{ active:selectedDate === day.date }" @click="selectedDate = day.date"><strong>{{ day.short }}</strong><small>{{ day.weekday }} · {{ day.count }}场</small></button></div><el-button plain :type="pendingDrawerOpen ? 'success' : ''" :aria-expanded="pendingDrawerOpen" @click="pendingDrawerOpen = !pendingDrawerOpen">待排比赛（{{ filteredPendingMatches.length }}）</el-button><el-button plain @click="openRefereePreMatchDocs">裁判赛前文档</el-button><el-button plain @click="viewSchedule">赛程中心</el-button></section>

        <section class="calendar-workspace" :class="{ 'without-pending': !pendingDrawerOpen, 'pending-open':pendingDrawerOpen, 'is-dragging':Boolean(draggedMatchId) }">
          <aside v-show="pendingDrawerOpen" class="pending-pool pending-drawer" @dragover.prevent @drop.stop.prevent="dropBackToPending">
            <header><h2>待排比赛 <el-tag type="warning">{{ filteredPendingMatches.length }}</el-tag></h2><el-button text size="small" @click="pendingDrawerOpen=false">收起</el-button></header>
            <p v-if="filteredPendingMatches.length">拖到右侧场地时间格</p>
            <div class="pending-list"><article v-for="match in filteredPendingMatches" :key="match._id" draggable="true" @dragstart="startDrag(match,$event)" @dragend="finishDrag" @click="openEdit(match)"><small>{{ divisionName(match.divisionId) }}<em v-if="divisionFormatLabel(match.divisionId)" class="card-format">{{ divisionFormatLabel(match.divisionId) }}</em> · {{ cardStageLabel(match) }}</small><strong>{{ teamLabel(match,'home') }}<em>VS</em>{{ teamLabel(match,'away') }}</strong><div class="pending-card-footer"><span>第{{ sequenceLabel(match) }}场</span><button type="button" class="pending-drag-handle" :class="{ active: placingMatchId === String(match._id) }" @click.stop="togglePlace(match)">{{ placingMatchId === String(match._id) ? '取消放置' : '点选放置' }}</button><span class="pending-drag-handle" draggable="true" :aria-label="`拖动第${sequenceLabel(match)}场`" @dragstart.stop="startDrag(match,$event)" @dragend="finishDrag" @click.stop role="button" tabindex="0">拖动</span></div></article><el-empty v-if="!filteredPendingMatches.length" :image-size="54" description="当前范围没有待排比赛" /></div>
          </aside>

          <el-empty v-if="!calendarDays.length" :description="pendingDrawerOpen ? '请先设置日期、开赛时间和场地' : '暂无已编排比赛'"><el-button v-if="!pendingDrawerOpen" type="success" plain @click="pendingDrawerOpen=true">打开待排比赛</el-button><el-button v-else plain @click="setView('settings')">赛程设置</el-button></el-empty>
          <div v-else class="calendar-board"><header><div><strong>{{ selectedDateLabel }}</strong><span>{{ selectedDayMatches.length }}场</span><em v-if="activeDivisionFormat" class="venue-filter-hint" :class="{ 'is-warning': venueFilterFallback }"><template v-if="venueFilterFallback">{{ fieldFormatLabel(activeDivisionFormat) }}组别 · 场地未配置制式，暂显示全部</template><template v-else>{{ fieldFormatLabel(activeDivisionFormat) }}场地<span v-if="hiddenVenueCount"> · 已隐藏{{ hiddenVenueCount }}块不兼容场地</span></template></em></div><small>点击比赛进入处理；拖动手柄调整赛程；按住空白处可左右拖动平移</small></header><div ref="mapScrollEl" class="calendar-scroll" @dragover.prevent @drop.prevent="notifyDropMiss" @mousedown="startMapPan" @click.capture="guardMapClick"><template v-for="block in activeBlocks" :key="block.id"><div v-if="activeBlocks.length>1" class="calendar-block-title"><strong>{{ block.name }}</strong><span>{{ block.formatLabel }}</span><em>{{ block.matches.length }}场</em></div><table :style="{ width: `${mapTableWidth(block.venues.length)}px` }"><colgroup><col style="width:96px" /><col v-for="venue in block.venues" :key="venue.name" :style="{ width: `${venueColumnWidth}px` }" /></colgroup><thead><tr><th @dragover.prevent>时间</th><th v-for="venue in block.venues" :key="venue.name" @dragover.prevent><strong>{{ venue.name }}</strong><small class="venue-format">{{ fieldFormatLabel(venue.fieldFormat) }}</small></th></tr></thead><tbody><tr v-for="time in block.times" :key="time"><th @dragover.prevent><strong>{{ time }}</strong><small>{{ sessionLabel(time) }}</small></th><td v-for="venue in block.venues" :key="`${time}-${venue.name}`" :data-drop-venue="venue.name" :data-drop-time="time" :class="{ 'drop-ready':Boolean(draggedMatchId), 'drop-hover':hoveredDropSlot === `${venue.name}|${time}`, 'place-ready':Boolean(placingMatchId), 'format-blocked':formatBlockedFor(venue.name), 'slot-blocked':Boolean(blockSlotState(block,venue.name,time)) && !blockSlotState(block,venue.name,time).closed, 'slot-closed':Boolean(blockSlotState(block,venue.name,time)) && blockSlotState(block,venue.name,time).closed }" @click="placeToSlot(venue.name,time)" @dragover.stop.prevent="hoverDropSlot(venue.name,time,$event)" @dragleave="leaveDropSlot(venue.name,time,$event)" @drop.stop.prevent="dropToSlot(venue.name,time,$event)"><article v-for="match in blockMatchesForCell(block,venue.name,time)" :key="match._id" class="calendar-match" :class="[`state-${managementState(match).key}`, { 'other-division': divisionFilter !== 'all' && String(match.divisionId || 'default') !== divisionFilter }]" draggable="true" @dragstart="startDrag(match,$event)" @dragend="finishDrag" @click.stop="placingMatchId ? placeToSlot(venue.name,time) : openMatchWorkspace(match)"><header><span>{{ divisionName(match.divisionId) }} · {{ cardStageLabel(match) }}</span><b>#{{ sequenceLabel(match) }}</b></header><div class="match-sides"><span class="match-team home"><ScheduleTeamCrest :sources="teamLogoSources(match,'home')" :name="teamLabel(match,'home')" /><strong :title="teamLabel(match,'home')">{{ teamLabel(match,'home') }}</strong></span><em class="calendar-score" :class="scoreStateClass(match)">{{ scoreText(match) }}</em><span class="match-team away"><strong :title="teamLabel(match,'away')">{{ teamLabel(match,'away') }}</strong><ScheduleTeamCrest :sources="teamLogoSources(match,'away')" :name="teamLabel(match,'away')" /></span></div><MatchDecision :match="match" /><footer><span class="match-state" :class="managementState(match).key"><i></i>{{ managementState(match).label }}</span><span class="card-actions"><button type="button" class="schedule-edit" @click.stop="openEdit(match)">调赛程</button><span class="drag-handle" draggable="true" title="拖动调整赛程" @dragstart.stop="startDrag(match,$event)" @dragend="finishDrag" @click.stop role="button" tabindex="0">拖动</span></span></footer></article><div v-if="!blockMatchesForCell(block,venue.name,time).length" class="drop-hint" :class="{ 'is-blocked': Boolean(blockSlotState(block,venue.name,time)) }" :title="blockSlotText(block,venue.name,time)"><b>{{ venue.name }} · {{ time }}</b><span v-if="blockSlotState(block,venue.name,time)">{{ blockSlotState(block,venue.name,time).closed ? '未开放此时间' : `占用至 ${blockSlotState(block,venue.name,time).to}` }}</span><span v-else-if="formatBlockedFor(venue.name)">制式不符</span><span v-else>{{ hoveredDropSlot === `${venue.name}|${time}` ? '松开安排比赛' : '拖入比赛' }}</span></div></td></tr></tbody></table></template></div></div>
        </section>
      </template>
    </template>

    <el-dialog v-model="editVisible" title="安排比赛" width="520px"><div v-if="editingMatch" class="edit-summary"><small>{{ divisionName(editingMatch.divisionId) }} · 第{{ editingMatch.matchNo || editingMatch.matchIndex || '-' }}场</small><strong>{{ teamLabel(editingMatch,'home') }}　VS　{{ teamLabel(editingMatch,'away') }}</strong></div><el-form label-position="top"><el-form-item label="比赛日期"><el-date-picker v-model="editForm.matchDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item><el-form-item label="开赛时间"><el-select v-model="editForm.matchTime" filterable style="width:100%"><el-option v-for="time in preciseTimes" :key="time" :label="time" :value="time" /></el-select></el-form-item><el-form-item label="比赛场地"><el-select v-model="editForm.venue" style="width:100%"><el-option v-for="venue in compatibleVenues(editingMatch)" :key="venue.name" :label="`${venue.name} · ${fieldFormatLabel(venue.fieldFormat)}`" :value="venue.name" /></el-select></el-form-item></el-form><template #footer><el-button @click="editVisible=false">取消</el-button><el-button type="success" :loading="savingAssignment" @click="saveEdit">保存并校验</el-button></template></el-dialog>
    <el-dialog v-model="sequenceVisible" title="修改场序" width="420px"><p v-if="sequenceMatch">{{ divisionName(sequenceMatch.divisionId) }} · {{ teamLabel(sequenceMatch,'home') }} vs {{ teamLabel(sequenceMatch,'away') }}</p><el-form label-position="top"><el-form-item label="场序号"><el-input-number v-model="sequenceNumber" :min="1" :max="9999" :step="1" /></el-form-item></el-form><template #footer><el-button @click="sequenceVisible=false">取消</el-button><el-button type="success" :loading="savingSequence" @click="saveSequence">保存</el-button></template></el-dialog>

    <el-dialog v-model="autoDialogVisible" title="自动排程" width="min(920px,94vw)" class="auto-schedule-dialog" :close-on-click-modal="false" :close-on-press-escape="!autoScheduling" :show-close="!autoScheduling">
      <section class="auto-scope">
        <div class="auto-scope-block">
          <header><strong>编排范围 · 组别</strong><span>已选 {{ autoScopeDivisionIds.length }}/{{ autoPendingDivisions.length }} 个组别 · 共 {{ autoScopeMatchCount }} 场会重新编排</span></header>
          <div v-if="!autoPendingDivisions.length" class="auto-scope-empty">当前没有可编排的比赛，请先生成对阵</div>
          <el-checkbox-group v-else v-model="autoScopeDivisionIds"><el-checkbox v-for="row in autoPendingDivisions" :key="row.id" :value="row.id">{{ row.name }}<small>{{ row.formatLabel }} · {{ row.total }}场{{ row.pending ? `（${row.pending}场待排）` : '（已排，将重排）' }}</small></el-checkbox></el-checkbox-group>
          <div v-if="autoPendingDivisions.length" class="auto-scope-actions"><el-button link type="success" @click="toggleAllAutoScopeDivisions">{{ autoScopeDivisionIds.length === autoPendingDivisions.length ? '全不选' : '全选' }}</el-button></div>
        </div>
        <div class="auto-scope-block">
          <header><strong>编排范围 · 比赛日</strong><span>已选 {{ autoScopeDates.length }}/{{ autoCalendarTiles.length }} 天</span></header>
          <div v-if="!autoCalendarTiles.length" class="auto-scope-empty">请先在「公共日历」勾选比赛日</div>
          <div v-else class="match-date-tiles"><button v-for="day in autoCalendarTiles" :key="day.date" type="button" :class="['match-date-tile', { active: autoScopeDateSet.has(day.date) }]" @click="toggleAutoScopeDate(day.date)"><strong>{{ day.dayOfMonth }}</strong><small>{{ day.weekdayShort }}</small></button></div>
          <div v-if="autoCalendarTiles.length" class="auto-scope-actions"><el-button link type="success" @click="toggleAllAutoScopeDates">{{ autoScopeDates.length === autoCalendarTiles.length ? '全不选' : '全选' }}</el-button><small class="auto-scope-tip">自动排程只会使用勾选的比赛日，未勾选的日期不会排入比赛</small></div>
        </div>
        <div class="auto-scope-block capacity-audit" :class="{ blocked: !autoScopeAudit.ready, passed: autoScopeAudit.ready }">
          <header><div><h2>所选范围赛制核定</h2><span>按所选组别与比赛日核算理论容量</span></div><el-tag :type="autoScopeAudit.ready ? 'success' : 'danger'">{{ autoScopeAudit.ready ? '容量满足' : '容量不足' }}</el-tag></header>
          <el-alert v-if="autoScopeAudit.missingDates || autoScopeAudit.noEligibleDates" type="warning" :closable="false" title="请先勾选至少一个比赛日" />
          <el-alert v-else-if="!autoScopeAudit.rows.length" type="info" :closable="false" title="所选范围内没有可编排的比赛" />
          <div v-else class="capacity-format-grid"><article v-for="row in autoScopeAudit.rows" :key="row.fieldFormat" :class="{ shortage: row.shortage > 0 }"><header><strong>{{ row.label }}</strong><span>{{ row.fieldCount }}块场地</span></header><dl><div><dt>需要场次</dt><dd>{{ row.requiredMatches }}场</dd></div><div><dt>每日资源格</dt><dd>{{ row.dailySlots }}个</dd></div><div><dt>赛期理论容量</dt><dd>{{ row.totalCapacity }}场</dd></div><div><dt>容量差额</dt><dd :class="{ danger: row.shortage > 0 }">{{ row.shortage ? `缺${row.shortage}场` : '满足' }}</dd></div></dl><p>{{ capacityRecommendation(row, autoScopeAudit) }}</p></article></div>
          <div v-if="autoScopeAudit.rows.length" class="capacity-audit-foot"><span>所选范围 <b>{{ autoScopeAudit.requiredMatches }}</b> 场 · 理论容量 <b>{{ autoScopeAudit.totalCapacity }}</b> 场 · 所选比赛日 <b>{{ autoScopeAudit.availableDays }}</b> 天</span><small v-if="autoScopeFullReflow">按所选组别的全部场次核算：整组重排会清空这些场次原来的日期、时间与场地，按正确阶段次序重排。</small><small v-else>所选范围已有 {{ autoScopeLockedCount }} 场已发布或已开赛，本次只补排未排场次，不会改动已完成场次。</small></div>
          <div v-if="autoScopeBreakdown.length" class="capacity-pending-list compact"><header><strong>未排场次筛查明细</strong></header><ul><li v-for="row in autoScopeBreakdown" :key="row.divisionId"><b>{{ row.name }}<small>{{ row.formatLabel }}</small></b><span><em>{{ row.pending }}场未排</em>{{ row.reasons.length ? `（${row.reasons.join('；')}）` : '' }}</span></li></ul></div>
        </div>
      </section>
      <template #footer><span class="auto-dialog-foot">容量不足时请先增加场地、比赛日或缩小组别范围</span><el-button :disabled="autoScheduling" @click="autoDialogVisible=false">取消</el-button><el-button type="success" :loading="autoScheduling" @click="runAutoSchedule">开始自动排程</el-button></template>
    </el-dialog>

    <el-dialog v-model="manualAddVisible" title="手动添加比赛" width="520px"><el-form label-position="top"><el-form-item label="组别" required><el-select v-model="manualForm.divisionId" style="width:100%" @change="loadManualTeams"><el-option v-for="division in divisions" :key="division.id" :label="division.name" :value="String(division.id)" /></el-select></el-form-item><el-form-item label="主队" required><el-select v-model="manualForm.homeTeamId" filterable style="width:100%"><el-option v-for="team in manualTeams" :key="team.teamId" :label="team.teamName" :value="team.teamId" /></el-select></el-form-item><el-form-item label="客队" required><el-select v-model="manualForm.awayTeamId" filterable style="width:100%"><el-option v-for="team in manualTeams" :key="team.teamId" :label="team.teamName" :value="team.teamId" /></el-select></el-form-item><el-form-item label="比赛日期"><el-date-picker v-model="manualForm.matchDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item><el-form-item label="开赛时间"><el-time-select v-model="manualForm.matchTime" start="06:00" step="00:15" end="23:00" format="HH:mm" style="width:100%" /></el-form-item><el-form-item label="比赛场地"><el-select v-model="manualForm.venue" filterable allow-create style="width:100%"><el-option v-for="venue in config.venueResources" :key="venue.name" :label="`${venue.name} · ${fieldFormatLabel(venue.fieldFormat)}`" :value="venue.name" /></el-select></el-form-item><el-form-item label="阶段名称"><el-input v-model="manualForm.roundName" placeholder="如：小组赛 A组、友谊交流赛；留空默认“手动添加”" /></el-form-item></el-form><template #footer><el-button @click="manualAddVisible=false">取消</el-button><el-button type="success" :loading="savingManualMatch" @click="saveManualMatch">保存</el-button></template></el-dialog>

    <el-dialog v-model="assignmentVisible" title="赛前安排" width="660px" :close-on-click-modal="false">
      <div v-if="assignmentMatch" class="assignment-summary"><strong>{{ teamLabel(assignmentMatch,'home') }}　vs　{{ teamLabel(assignmentMatch,'away') }}</strong><span>{{ divisionName(assignmentMatch.divisionId) }} · {{ assignmentMatch.matchDate || '待排' }} {{ assignmentMatch.matchTime || '' }} · {{ assignmentMatch.venue || '场地待定' }}</span></div>
      <el-tabs v-model="assignmentTab" class="assignment-tabs">
        <el-tab-pane label="裁判安排" name="referee">
          <div v-loading="assignmentLoading">
            <el-form label-position="top" class="assignment-form">
              <el-form-item label="裁判组 / 自动安排">
                <div class="assign-crew-row">
                  <el-select v-model="assignmentCrewId" clearable filterable placeholder="选择裁判组，一键填满下方岗位" @change="applyAssignmentCrew"><el-option v-for="group in assignmentCrews" :key="group.id" :label="assignmentCrewLabel(group)" :value="group.id" /></el-select>
                  <el-button type="warning" plain :loading="savingReferees" @click="autoAssignRefereeCrew"><el-icon><MagicStick /></el-icon>自动一键安排</el-button>
                </div>
                <small>默认 {{ assignmentCrewSize === 3 ? '三人' : '四人' }} 组 · {{ tournamentRefereeConfig.allowMainAsFourth ? '允许主裁兼任第四官员' : '主裁与第四官员分别担任' }} · 未配置能力的裁判默认全岗位可用</small>
              </el-form-item>
              <el-alert v-if="assignmentConflictItems.length" type="error" :closable="false" show-icon title="时间冲突：以下裁判同时执法本场同时间的其他比赛，自动安排会自动避开；手工指派时请留意">
                <p v-for="item in assignmentConflictItems" :key="item" style="margin:2px 0;font-size:13px">{{ item }}</p>
              </el-alert>
              <el-form-item v-for="role in visibleAssignmentRoles" :key="role.key" :label="role.label" required>
                <el-select v-model="assignmentForm[role.key]" filterable :placeholder="`选择${role.label}`" style="width:100%"><el-option v-for="referee in assignableReferees" :key="referee._id" :label="refereeLabel(referee)" :value="referee._id" :disabled="refereeUsedByOtherRole(referee._id,role.key) || conflictingRefereeIds.has(String(referee._id)) || !refereeCanServe(referee,role.key)" /></el-select>
              </el-form-item>
            </el-form>
            <el-empty v-if="!assignmentLoading && !assignableReferees.length" :image-size="54" description="当前赛事没有可指派的裁判" />
            <div class="assignment-save"><el-button type="success" :loading="savingReferees" :disabled="assignmentLoading || !assignableReferees.length" @click="saveWorkbenchReferees">保存裁判</el-button></div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="球衣颜色" name="kit">
          <div v-loading="kitLoading" class="kit-assignment">
            <section v-for="side in ['home','away']" :key="side"><h3>{{ side === 'home' ? '主队' : '客队' }} · {{ teamLabel(assignmentMatch,side) }}</h3><div class="kit-fields"><label v-for="part in kitParts" :key="part.key"><span>{{ part.label }}</span><el-select v-model="kitForm[side][part.key]" clearable :placeholder="`选择${part.label}颜色`"><el-option v-for="color in kitColorChoices(kitForm[side][part.key])" :key="color" :label="color" :value="color"><span class="kit-color-swatch" :style="{ backgroundColor:kitColorCss(color) }"></span>{{ color }}</el-option></el-select></label></div></section>
            <div class="assignment-save"><el-button type="success" :loading="savingKit" :disabled="kitLoading" @click="saveWorkbenchKit">保存球衣颜色</el-button></div>
          </div>
        </el-tab-pane>
      </el-tabs>
      <template #footer><el-button @click="assignmentVisible=false">关闭</el-button></template>
    </el-dialog>

    <el-dialog v-model="policyVisible" :title="`${policyDivision?.name || ''}资源限制`" width="620px"><el-form label-position="top"><el-form-item label="允许比赛的日期"><el-date-picker v-model="policyDraft.allowedDates" type="dates" value-format="YYYY-MM-DD" :disabled-date="policyDateDisabled" style="width:100%" placeholder="不选表示使用全部比赛日" /></el-form-item><el-form-item label="允许时段"><el-checkbox-group v-model="policyDraft.allowedSessions"><el-checkbox v-for="session in enabledSessions" :key="session.key" :label="session.key">{{ session.label }}</el-checkbox></el-checkbox-group><small>不选表示使用所有已开放时段</small></el-form-item><el-form-item label="允许场地"><el-select v-model="policyDraft.allowedVenues" multiple clearable style="width:100%" placeholder="不选表示使用全部兼容场地"><el-option v-for="venue in policyCompatibleVenues" :key="venue.name" :label="venue.name" :value="venue.name" /></el-select></el-form-item></el-form><template #footer><el-button @click="clearPolicyLimits">清除限制</el-button><el-button @click="policyVisible=false">取消</el-button><el-button type="success" @click="savePolicyLimits">保存限制</el-button></template></el-dialog>

    <el-dialog v-model="importVisible" title="导入赛事地图前最后检查" width="720px"><div class="import-summary"><span><b>{{ importPreview.validCount || 0 }}</b>场将更新</span><span><b>{{ importPreview.skippedCount || 0 }}</b>行跳过</span><span :class="{ danger:importPreview.errorCount }"><b>{{ importPreview.errorCount || 0 }}</b>项错误</span></div><el-alert v-if="importPreview.errorCount" type="error" :closable="false" title="请修正文件后重新导入" /><ul v-if="importPreview.errors?.length" class="import-errors"><li v-for="(error,index) in importPreview.errors" :key="index">第{{ error.row || '-' }}行：{{ error.message }}</li></ul><table v-else class="import-changes"><thead><tr><th>场序</th><th>原安排</th><th>新安排</th></tr></thead><tbody><tr v-for="change in importPreview.changes || []" :key="change.matchId"><td>#{{ change.matchNo || '-' }}</td><td>{{ arrangementText(change.before) }}</td><td>{{ arrangementText(change.after) }}</td></tr></tbody></table><template #footer><el-button @click="importVisible=false">返回检查</el-button><el-button type="success" :disabled="Boolean(importPreview.errorCount) || !importPreview.validCount" :loading="applyingImport" @click="applyImport">确认导入赛事地图</el-button></template></el-dialog>

    <el-dialog v-model="refereeDocsVisible" title="裁判赛前文档" width="760px" class="referee-doc-dialog" :close-on-click-modal="!refereeDocsLoading" :close-on-press-escape="!refereeDocsLoading" :show-close="!refereeDocsLoading">
      <div class="referee-doc-toolbar">
        <label><span>比赛日</span><el-select v-model="refereeDocsDate" placeholder="选择比赛日" style="width:240px"><el-option v-for="day in calendarDays" :key="day.date" :label="`${day.date} ${day.weekday}`" :value="day.date" /></el-select></label>
        <span class="referee-doc-count">{{ refereePreMatchList.length }} 场待开始比赛</span>
      </div>
      <div v-if="refereeDocsLoading" class="referee-doc-progress"><span>{{ refereeDocsProgress.label }}</span><b>{{ refereeDocsProgress.percent }}%</b><el-progress :percentage="refereeDocsProgress.percent" :stroke-width="8" :show-text="false" /></div>
      <div v-if="refereePreMatchList.length" class="referee-doc-list">
        <article v-for="match in refereePreMatchList" :key="match._id"><time>{{ match.matchTime || '待定' }}</time><div><small>{{ divisionName(match.divisionId) }} · 场序{{ match.matchSequence || match.matchNo || match.sequence || '—' }}</small><strong>{{ teamLabel(match,'home') }} <em>VS</em> {{ teamLabel(match,'away') }}</strong></div><span>{{ match.venue || '场地待定' }}</span></article>
      </div>
      <el-empty v-else :image-size="64" :description="refereeDocsDate ? '当天没有待开始比赛' : '当前赛事尚无已排比赛日'" />
      <template #footer><el-button @click="refereeDocsVisible=false">取消</el-button><el-button :disabled="!refereePreMatchList.length || refereeDocsLoading" :loading="refereeDocsLoading && refereePrintMode" @click="printRefereePreMatchDocs">批量打印</el-button><el-dropdown trigger="click" :disabled="!refereePreMatchList.length || refereeDocsLoading" @command="downloadRefereePreMatchDocs"><el-button type="success" :disabled="!refereePreMatchList.length || refereeDocsLoading" :loading="refereeDocsLoading && !refereePrintMode">批量下载</el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="pdf">PDF 工作单（推荐）</el-dropdown-item><el-dropdown-item command="word">Word 工作单</el-dropdown-item></el-dropdown-menu></template></el-dropdown></template>
    </el-dialog>
  </main>
</template>

<script setup>
import MatchDecision from '../../components/match/MatchDecision.vue'
import { formatMatchRound } from '../../utils/matchLabels'
import { computed, nextTick, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Calendar, Download, MagicStick, Plus, Setting, Upload } from '@element-plus/icons-vue'
import JSZip from 'jszip'
import PairingResult from './PairingResult.vue'
import RefereeCenter from './RefereeCenter.vue'
import ScheduleTeamCrest from '../../components/tournament/ScheduleTeamCrest.vue'
import { addRecord, callFunction, queryById, queryList, rosterExceptionBoard } from '../../utils/cloud'
import { extractScheduleRows, parseDivisionAndPool, recognitionSummary, recognizeScheduleRows } from '../../utils/scheduleWorkbookRecognition'
import { firstUnfinishedMatchDate } from '../../utils/matchCalendarSelection'
import { findWorkbenchFocusMatch } from '../../utils/matchScheduleFocus'
import { createRefereeLineupPdf } from '../../utils/refereeLineupPdf'
import { createRefereeLineupSheet, refereeLineupSheetFileName, REFEREE_SHEET_LEGEND } from '../../utils/refereeLineupSheet'
import { MATCH_FORMAT_DEFAULTS } from '../../utils/rosterHelper'
import {parseKickoffTimes,configuredKickoffTimes,kickoffWindows,kickoffPeriod,halfHourKickoffOptions,generateKickoffTimes} from '../../utils/scheduleKickoffTimes.mjs'
import {createScheduleTemplateWorkbook} from '../../utils/scheduleTemplateWorkbook.mjs'
import { isDemoMode } from '../../utils/demoMode'
import { calculatePreMatchSuspensions } from '../../utils/refereeSuspension'

const route = useRoute(), router = useRouter(), tournamentId = String(route.params.id || '')
// The deployed import action validates the actor, scope and conflicts server-side.
const scheduleImportWriteEnabled = true
const loading = ref(false), savingSettings = ref(false), autoScheduling = ref(false), savingAssignment = ref(false), applyingImport = ref(false), preparingKnockout = ref(false), knockoutPrepareError = ref('')
// 追加纪律处罚（停赛）用于裁判表自动标 S；读取失败时向裁判表提示，不静默当成无处罚。
const disciplinaryActions = ref([]), disciplinaryLoadFailed = ref(false)
const tournament = ref({}), divisions = ref([]), matches = ref([]), teamLogoMap = ref(new Map()), divisionFilter = ref(String(route.query.divisionId || 'all')), selectedDate = ref(typeof route.query.date === 'string' ? route.query.date : ''), draggedMatchId = ref(''), matchDayOnly = ref(true)
const view = ref(['settings','imports','map','workbench','referees'].includes(String(route.query.view || '')) ? String(route.query.view) : 'map')
const pendingDrawerOpen=ref(true),hoveredDropSlot=ref(''),dropSaving=ref(false)
const workbenchDivision = ref(String(route.query.divisionId || 'all')), workbenchStatus = ref('all'), workbenchSearch = ref('')
const workbenchRoot = ref(null), nextMatchId = ref('')
const sequenceVisible = ref(false), sequenceMatch = ref(null), sequenceNumber = ref(1), savingSequence = ref(false)
const assignmentVisible = ref(false), assignmentMatch = ref(null), assignmentTab = ref('referee')
const assignmentLoading = ref(false), kitLoading = ref(false), savingReferees = ref(false), savingKit = ref(false)
const refereeRows = ref([]), assignmentForm = reactive({ mainReferee:'',assistant1:'',assistant2:'',fourthOfficial:'',secondReferee:'',thirdReferee:'',timekeeper:'',operationRefereeId:'' })
const kitForm = reactive({ home:{ jersey:'',shorts:'',socks:'' },away:{ jersey:'',shorts:'',socks:'' } })
const kitParts = [{ key:'jersey',label:'上衣' },{ key:'shorts',label:'短裤' },{ key:'socks',label:'球袜' }]
const kitColorNames = ['红','黄','蓝','白','绿','黑','橙','紫','粉','灰','深绿','浅蓝','藏青','棕']
const kitColorHex = { 红:'#E53935',黄:'#FDD835',蓝:'#1E88E5',白:'#FFFFFF',绿:'#43A047',黑:'#212121',橙:'#FB8C00',紫:'#8E24AA',粉:'#D81B60',灰:'#757575',深绿:'#1B5E20',浅蓝:'#42A5F5',藏青:'#283593',棕:'#795548' }
const exportingSchedule = ref(''), scheduleDownload = ref(null)
const fileInput = ref(null), importVisible = ref(false), importRows = ref([]), importPreview = ref({})
const importFileName = ref(''), recognitionSourceRows = ref([]), recognitionRows = ref([]), recognitionFilter = ref('all')
const refereeDocsVisible = ref(false), refereeDocsDate = ref(''), refereeDocsLoading = ref(false), refereePrintMode = ref(false)
const refereeDocsProgress = ref({ percent:0,label:'' })
const editVisible = ref(false), editingMatch = ref(null), editForm = reactive({ matchDate:'',matchTime:'',venue:'' })
const policyVisible = ref(false), policyDivision = ref(null), policyDraft = reactive({ allowedDates:[],allowedSessions:[],allowedVenues:[] })
const weekDays = ['周一','周二','周三','周四','周五','周六','周日']
const fieldFormats = [5,7,8,9,11].map(value => ({ value:`${value}side`,label:`${value}人制` }))
const defaultSessions = () => [{ key:'morning',label:'上午',enabled:true,start:'09:00',end:'12:00' },{ key:'afternoon',label:'下午',enabled:true,start:'14:00',end:'18:00' },{ key:'evening',label:'晚间',enabled:false,start:'18:30',end:'21:30' }]
const config = reactive({ kickoffTimes:[],schemaVersion:2,startDate:'',endDate:'',matchDays:['周一','周二','周三','周四','周五','周六','周日'],matchDates:[],sessionWindows:defaultSessions(),venueResources:[],defaultTurnaroundMinutes:10,timeStepMinutes:5,frequencyPreset:'adaptive',divisionPolicies:{},finalStageExclusive:false })

const selectedKickoffTimes=ref([])
const kickoffPeriodEnabled=ref({morning:true,afternoon:true,evening:false})
const kickoffPeriods=[{key:'morning',label:'上午'},{key:'afternoon',label:'下午'},{key:'evening',label:'晚上'}].map(period=>({...period,options:halfHourKickoffOptions().filter(time=>kickoffPeriod(time)===period.key)}))
const extraKickoffTimes=computed(()=>selectedKickoffTimes.value.filter(time=>!halfHourKickoffOptions().includes(time)))
// 开赛点不再手工勾选：由「场地首场时间 + 该制式对应组别的比赛时长 + 转场时间」逐点推算，
// 相邻开赛点天然不重叠，不会再出现「界面显示空格但后端判定占用」。
const openSessions=computed(()=>config.sessionWindows.filter(item=>{const toggle=kickoffPeriodEnabled.value[item.key];return toggle===undefined?item.enabled!==false:Boolean(toggle)}))
// 时段开关与 sessionWindows.enabled 保持同一数据源：保存与正式引擎都读 enabled 标志。
watch(kickoffPeriodEnabled,value=>{config.sessionWindows.forEach(item=>{item.enabled=value[item.key]!==false})},{deep:true})
function sessionSlotHint(window){const count=allKickoffTimes.value.filter(time=>kickoffPeriod(time)===window.key).length;return count?`${count}个开赛点`:'该时段暂无开赛点'}
function venueMatchDuration(venue){const format=String(venue?.fieldFormat||'');const values=divisions.value.filter(item=>!format||matchFormat(item)===format).map(item=>Number(matchMinutes(item)||0)).filter(value=>value>0);return values.length?Math.max(...values):50}
function venueStepMinutes(venue){return Math.max(5,venueMatchDuration(venue)+Number(config.defaultTurnaroundMinutes||0))}
function venueKickoffTimes(venue){const manual=selectedKickoffTimes.value.length?selectedKickoffTimes.value:null;if(manual)return manual;const sessions=openSessions.value;const start=venue?.startTime||sessions[0]?.start||'09:00';const end=venue?.endTime||sessions[sessions.length-1]?.end||'18:00';return generateKickoffTimes({start,end,step:venueStepMinutes(venue),sessions})}
const venueKickoffMap=computed(()=>new Map(config.venueResources.map(venue=>[venue.name,venueKickoffTimes(venue)])))
function venueOffersTime(venueName,time){const manual=selectedKickoffTimes.value.length?selectedKickoffTimes.value:null; const list=manual||venueKickoffMap.value.get(venueName);return !list||!list.length||list.includes(time)}
const newKickoff=ref('')
const editingKickoff=ref(-1)
const editKickoffValue=ref('')
function startEditKickoff(i){ editingKickoff.value=i; editKickoffValue.value=selectedKickoffTimes.value[i] }
function confirmKickoff(i){ const t=String(editKickoffValue.value||'').trim(); if(!/^\d{1,2}:\d{2}$/.test(t))return ElMessage.warning('请输入 HH:mm 格式时间'); if(selectedKickoffTimes.value.includes(t)&&selectedKickoffTimes.value[i]!==t)return ElMessage.warning('该开赛点已存在'); selectedKickoffTimes.value[i]=t; selectedKickoffTimes.value.sort(); config.kickoffTimes=[...selectedKickoffTimes.value]; editingKickoff.value=-1 }
function addKickoff(){ const t=String(newKickoff.value||'').trim(); if(!/^\d{1,2}:\d{2}$/.test(t))return ElMessage.warning('请输入 HH:mm 格式时间'); if(selectedKickoffTimes.value.includes(t))return ElMessage.warning('该开赛点已存在'); selectedKickoffTimes.value=[...selectedKickoffTimes.value,t].sort(); config.kickoffTimes=[...selectedKickoffTimes.value]; newKickoff.value='' }
function removeKickoff(i){ selectedKickoffTimes.value.splice(i,1); config.kickoffTimes=[...selectedKickoffTimes.value] }
const allKickoffTimes=computed(()=>selectedKickoffTimes.value.length?selectedKickoffTimes.value:[...new Set(config.venueResources.flatMap(venue=>venueKickoffTimes(venue)))].sort())
// 初始化：有手工值用手工，否则用自动推算值填充
watch(allKickoffTimes,times=>{if(!times.length)return; if(!selectedKickoffTimes.value.length)selectedKickoffTimes.value=[...times]},{immediate:true})
const viewTitle = computed(() => ({ settings:'赛程设置',imports:'上传赛程',map:'赛事地图',workbench:'赛程中心',referees:'裁判中心' })[view.value] || '赛事地图')
function goScheduleCenter() { return setView('workbench') }
watch(()=>route.query.view,value=>{view.value=['settings','imports','map','workbench','referees'].includes(String(value || ''))?String(value):'map'})
function setView(next, opts) { view.value = next; const query={ ...route.query }; if(next === 'map')delete query.view;else query.view=next;const replaced=router.replace({ path:route.path,query });if(opts && opts.autostart){replaced.then(() => { if(!pendingMatches.value.length){ElMessage.info('当前没有待排比赛，无需自动排程');return} autoSchedule() })}return replaced }
async function viewSchedule() { workbenchDivision.value='all';workbenchStatus.value='all';workbenchSearch.value='';await setView('workbench');await focusNextWorkbenchMatch() }
function sequenceLabel(match) { return match.matchSequence ?? match.matchNo ?? match.matchIndex ?? '—' }
function canAdjustSchedule(match) { return !match.executionSnapshot && !match.refereeRecordLocked && ['scheduled','pending','checked_in','not_started','upcoming',''].includes(String(match.status || '').toLowerCase()) }
function canAssignReferee(match) { return !match.refereeRecordLocked && ['scheduled','pending','checked_in','not_started','upcoming',''].includes(String(match.status || '').toLowerCase()) }
const workbenchMatches = computed(() => matches.value.filter(match => {
  if (workbenchDivision.value !== 'all' && String(match.divisionId || 'default') !== workbenchDivision.value) return false
  const status = match.matchDate ? managementState(match).key : 'pending'
  if (workbenchStatus.value !== 'all' && status !== workbenchStatus.value) return false
  const keyword = workbenchSearch.value.trim().toLowerCase()
  return !keyword || [sequenceLabel(match),match.homeTeamName,match.awayTeamName].some(value => String(value || '').toLowerCase().includes(keyword))
}).sort((a,b) => String(a.matchDate || '9999').localeCompare(String(b.matchDate || '9999')) || String(a.matchTime || '99:99').localeCompare(String(b.matchTime || '99:99')) || Number(sequenceLabel(a) || 0)-Number(sequenceLabel(b) || 0)))
async function focusNextWorkbenchMatch() {
  await nextTick()
  const target=findWorkbenchFocusMatch(workbenchMatches.value,selectedDate.value,managementState)
  nextMatchId.value=target ? String(target._id) : ''
  if (!target) return
  await nextTick()
  const row=Array.from(workbenchRoot.value?.querySelectorAll('tr.next-match-row') || []).find(item => item.classList.contains('next-match-row'))
  row?.scrollIntoView({ block:'center',behavior:'auto' })
}
function openSequenceEdit(match) { sequenceMatch.value=match;sequenceNumber.value=Number(sequenceLabel(match)) || 1;sequenceVisible.value=true }
async function saveSequence() { const match=sequenceMatch.value, number=Number(sequenceNumber.value);if(!match || !Number.isInteger(number) || number<1)return ElMessage.warning('请输入有效场序号');savingSequence.value=true;try{const result=await callFunction('updateMatch',{matchId:match._id,data:{matchSequence:number}});if(!result?.success)throw new Error(result?.message || '场序保存失败');sequenceVisible.value=false;ElMessage.success('场序已更新');await load()}catch(error){ElMessage.error(error.message || '场序保存失败')}finally{savingSequence.value=false} }
const assignmentFormat = computed(() => assignmentMatch.value?.matchFormat || divisions.value.find(item => String(item.id) === String(assignmentMatch.value?.divisionId))?.matchFormat || '11side')
const assignmentRoles = computed(() => /^(5|6)/.test(String(assignmentFormat.value)) ? [{key:'mainReferee',label:'主裁判'},{key:'secondReferee',label:'第一助理裁判'},{key:'thirdReferee',label:'第二助理裁判'},{key:'timekeeper',label:'第四官员'}] : [{key:'mainReferee',label:'主裁判'},{key:'assistant1',label:'第一助理裁判'},{key:'assistant2',label:'第二助理裁判'},{key:'fourthOfficial',label:'第四官员'}])
const assignableReferees = computed(() => refereeRows.value.filter(item => item.canOperate !== false && (item.status === 'approved' || item.synthetic === true && String(item.tournamentId || '') === tournamentId)))
const selectedCrewReferees = computed(() => assignableReferees.value.filter(item => assignmentRoles.value.some(role => assignmentForm[role.key] === item._id)))
const assignmentCrewId = ref('')
const tournamentRefereeConfig = computed(() => tournament.value?.refereeConfig || { defaultCrewSize: 4, allowMainAsFourth: true, defaultAllRoles: true })
const assignmentCrewSize = computed(() => Number(assignmentMatch.value?.refereeCrewSize) || Number(tournamentRefereeConfig.value.defaultCrewSize) || 4)
const visibleAssignmentRoles = computed(() => assignmentRoles.value.slice(0, assignmentCrewSize.value))
const assignmentCrews = computed(() => { const docCrews = (Array.isArray(tournament.value?.refereeCrews) ? tournament.value.refereeCrews : []).map(doc => ({ id: doc.id, name: doc.name || '裁判组', members: doc.members || {} })); const derived = new Map(); for (const referee of assignableReferees.value) { const gid = referee.refereeGroupId || referee.refereeGroupName; if (!gid) continue; if (!derived.has(gid)) derived.set(gid, { id: gid, name: referee.refereeGroupName || gid, members: {} }); const group = derived.get(gid); if (referee.groupRole && ['mainReferee','assistant1','assistant2','fourthOfficial'].includes(referee.groupRole) && !group.members[referee.groupRole]) group.members[referee.groupRole] = referee._id } return [...docCrews, ...[...derived.values()].filter(group => Object.keys(group.members).length > 0)] })
const assignmentCrewShort = { mainReferee: '主裁', assistant1: '助理一', assistant2: '助理二', fourthOfficial: '第四官员' }
function assignmentCrewLabel(group) { return `${group.name}（${['mainReferee','assistant1','assistant2','fourthOfficial'].map(key => { const found = refereeRows.value.find(item => String(item._id) === String(group.members[key])); const person = found?.name || found?.realName || ''; return person ? `${assignmentCrewShort[key]} ${person}` : `${assignmentCrewShort[key]} 空缺` }).join(' · ')}）` }
function applyAssignmentCrew(groupId) { const group = assignmentCrews.value.find(item => item.id === groupId); if (!group) return; const canonical = ['mainReferee','assistant1','assistant2','fourthOfficial']; assignmentRoles.value.forEach((role, index) => { assignmentForm[role.key] = String(group.members[canonical[index]] || '') }) }
const assignmentConflictItems = computed(() => { const current=assignmentMatch.value; if(!current?.matchDate||!current?.matchTime)return[]; const items=[]; matches.value.forEach(match=>{ if(match._id===current._id||String(match.status||'').toLowerCase()==='cancelled'||String(match.status||'').toLowerCase()==='canceled')return; if(match.matchDate!==current.matchDate||match.matchTime!==current.matchTime)return; const names=Object.values(match.refereeCrew||{}).map(p=>{ const id=typeof p==='string'?p:p?._id||p?.refereeId; const r=refereeRows.value.find(x=>String(x._id)===String(id)); return r?.name||r?.realName||'' }).filter(Boolean); if(names.length)items.push(`与场序${match.matchSequence||''}(${match.homeTeamName||'v'} vs ${match.awayTeamName||''}) 同时开赛：${names.join('、')}`) }); return items })
function refereeCanServe(referee, roleKey) { const canonical = ({ secondReferee:'assistant1', thirdReferee:'assistant2', timekeeper:'fourthOfficial' })[roleKey] || roleKey; const caps = referee.refereeCapabilities || referee.capabilities; if (Array.isArray(caps) && caps.length) { if (caps.includes(canonical)) return true; return canonical === 'fourthOfficial' && tournamentRefereeConfig.value.allowMainAsFourth !== false && caps.includes('mainReferee') } return tournamentRefereeConfig.value.defaultAllRoles !== false }
function autoAssignRefereeCrew() { if (!assignmentMatch.value?.matchDate || !assignmentMatch.value?.matchTime) return ElMessage.warning('请先安排本场比赛的日期和时间'); const current=assignmentMatch.value; const slotKey = `${current.matchDate} ${current.matchTime}`; const used = new Set(); matches.value.forEach(match => { if (match._id===current._id) return; if (String(match.matchDate||'')+' '+String(match.matchTime||'')!==slotKey) return; Object.values(match.refereeCrew||{}).forEach(p => { const id=typeof p==='string'?p:p?._id||p?.refereeId; if(id) used.add(String(id)) }) }); const pool = assignableReferees.value.filter(item => !used.has(String(item._id))); const roles = visibleAssignmentRoles.value; const chosen = {}; const chosenIds = new Set(); const mainCandidates = pool.filter(item => refereeCanServe(item, 'mainReferee')).sort((a,b)=>{ if (a.synthetic!==b.synthetic) return a.synthetic?1:-1; return (b.level||'').localeCompare(a.level||'') }); const main = mainCandidates[0]; if (main) { chosen[roles[0].key] = main._id; chosenIds.add(String(main._id)) } const remainingRoles = roles.slice(1); for (const role of remainingRoles) { const roleKey = role.key; let candidates = pool.filter(item => !chosenIds.has(String(item._id)) && refereeCanServe(item, roleKey)); candidates = candidates.sort((a,b)=>{ if (a.synthetic!==b.synthetic) return a.synthetic?1:-1; return (b.level||'').localeCompare(a.level||'') }); const pick = candidates[0]; if (pick) { chosen[roleKey] = pick._id; chosenIds.add(String(pick._id)) } } for (const role of roles) { if (!assignmentForm[role.key] && chosen[role.key]) assignmentForm[role.key] = String(chosen[role.key]) } }
const batchAssigning = ref(false)
function rolesForMatch(match) { const format = match?.matchFormat || divisions.value.find(item => String(item.id) === String(match?.divisionId))?.matchFormat || '11side'; return /^(5|6)/.test(String(format)) ? ['mainReferee','secondReferee','thirdReferee','timekeeper'] : ['mainReferee','assistant1','assistant2','fourthOfficial'] }
function matchCrewIds(match) { const crew = {}; Object.entries(match?.refereeCrew || {}).forEach(([key, person]) => { const id = typeof person === 'string' ? person : person?._id || person?.refereeId; if (id) crew[key] = String(id) }); return crew }
async function batchAutoAssignReferees() {
  if (batchAssigning.value) return
  const sizeOf = match => Math.min(4, Number(match.refereeCrewSize) || Number(tournamentRefereeConfig.value.defaultCrewSize) || 4)
  const schedulable = matches.value.filter(match => canAssignReferee(match) && match.matchDate && match.matchTime)
  const needsWork = schedulable.filter(match => { const crew = matchCrewIds(match); return rolesForMatch(match).slice(0, sizeOf(match)).some(key => !crew[key]) })
  if (!needsWork.length) return ElMessage.info(schedulable.length ? '已排定时间的比赛都已安排裁判，无需一键安排' : '没有可自动安排的比赛，请先在比赛地图排定日期和时间')
  const skipped = schedulable.length - needsWork.length
  try { await ElMessageBox.confirm(`将为 ${needsWork.length} 场比赛自动安排裁判${skipped ? `，已排满的 ${skipped} 场自动跳过不覆盖` : ''}。按执裁能力分配岗位，同一时间段的比赛不重复使用裁判；只补空缺岗位，已安排的岗位保持不变。`, '一键安排裁判', { confirmButtonText: '开始安排', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  batchAssigning.value = true
  try {
    if (!refereeRows.value.length) { const groups = await Promise.all([queryList('referees',{ where:{ status:'approved' }, limit:500, silent:true }),queryList('referees',{ where:{ tournamentId }, limit:500, silent:true })]); refereeRows.value = [...new Map(groups.flat().filter(Boolean).map(item => [String(item._id),item])).values()] }
    if (!assignableReferees.value.length) { ElMessage.warning('当前赛事没有可指派的裁判，请先在裁判管理中完成资格审核'); return }
    const usedBySlot = new Map()
    matches.value.forEach(match => { if (!match.matchDate || !match.matchTime) return; const key = `${match.matchDate} ${match.matchTime}`; if (!usedBySlot.has(key)) usedBySlot.set(key, new Set()); const slot = usedBySlot.get(key); Object.values(matchCrewIds(match)).forEach(id => slot.add(id)) })
    const queue = [...needsWork].sort((a, b) => `${a.matchDate} ${a.matchTime}`.localeCompare(`${b.matchDate} ${b.matchTime}`) || Number(a.matchSequence || a.matchNo || 0) - Number(b.matchSequence || b.matchNo || 0))
    let done = 0
    const failed = []
    for (const match of queue) {
      const activeKeys = rolesForMatch(match).slice(0, sizeOf(match))
      const crew = matchCrewIds(match)
      const slot = usedBySlot.get(`${match.matchDate} ${match.matchTime}`)
      const chosenIds = new Set(Object.values(crew))
      for (const key of activeKeys) {
        if (crew[key]) continue
        const pick = assignableReferees.value.filter(item => !slot.has(String(item._id)) && !chosenIds.has(String(item._id)) && refereeCanServe(item, key)).sort((a, b) => { if (Boolean(a.synthetic) !== Boolean(b.synthetic)) return a.synthetic ? 1 : -1; return String(b.level || b.refereeLevel || '').localeCompare(String(a.level || a.refereeLevel || '')) })[0]
        if (pick) { crew[key] = String(pick._id); chosenIds.add(String(pick._id)) }
      }
      const label = `${match.matchSequence || match.matchNo || '?'} 场（${match.homeTeamName || '?'} vs ${match.awayTeamName || '?'}）`
      if (activeKeys.some(key => !crew[key])) { failed.push(`${label}：该时段可用裁判不足，岗位排不满`); continue }
      try {
        const result = await callFunction('updateMatch', { matchId: match._id, data: { refereeCrew: crew, refereeCrewSize: sizeOf(match) } })
        if (!result?.success) throw new Error(result?.message || '保存失败')
        activeKeys.forEach(key => slot.add(crew[key]))
        done += 1
      } catch (error) { failed.push(`${label}：${error.message || '保存失败'}`) }
    }
    await load()
    if (failed.length) ElMessageBox.alert(`已安排 ${done} 场；${failed.length} 场未能安排：\n${failed.slice(0, 8).join('\n')}${failed.length > 8 ? `\n…等 ${failed.length} 场` : ''}`, '一键安排结果', { confirmButtonText: '知道了', type: done ? 'warning' : 'error' }).catch(() => {})
    else ElMessage.success(`一键安排完成，${done} 场比赛裁判已全部就位`)
  } catch (error) { ElMessage.error(error.message || '一键安排失败') } finally { batchAssigning.value = false }
}
const conflictingRefereeIds = computed(() => {
  const current=assignmentMatch.value
  if (!current?.matchDate || !current?.matchTime) return new Set()
  const ids=new Set()
  matches.value.forEach(match => {
    if (match._id === current._id || ['cancelled','canceled','postponed'].includes(String(match.status || '').toLowerCase()) || match.matchDate !== current.matchDate || match.matchTime !== current.matchTime) return
    Object.values(match.refereeCrew || {}).forEach(person => { const id=typeof person === 'string' ? person : person?._id || person?.refereeId; if(id)ids.add(String(id)) })
  })
  return ids
})
function refereeUsedByOtherRole(id,currentRole) { return assignmentRoles.value.some(role => role.key !== currentRole && assignmentForm[role.key] === id) }
function refereeLabel(referee) { const phone=String(referee.phone || referee.phoneNumber || ''); const masked=phone.length===11 ? `${phone.slice(0,3)}****${phone.slice(-4)}` : '';return [referee.name || referee.realName || '未命名裁判',masked].filter(Boolean).join(' · ') }
function kitColorCss(color) { return kitColorHex[color] || (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(String(color || '')) ? color : '#eef2f0') }
function kitColorLabel(color) {
  const value=String(color || '').trim()
  return Object.keys(kitColorHex).find(name => kitColorHex[name].toLowerCase() === value.toLowerCase()) || value
}
function kitColorChoices(current) { return current && !kitColorNames.includes(current) ? [current,...kitColorNames] : kitColorNames }
async function loadKitDefaults(match,side) {
  const sourceId=String(match?.[`${side}TeamId`] || '')
  if (!sourceId) return {}
  const direct=await queryById('tournament_teams',sourceId).catch(() => null)
  const byTeam=await queryList('tournament_teams',{where:{tournamentId,teamId:sourceId},limit:100,silent:true}).catch(() => [])
  const relations=[direct,...(byTeam || [])].filter(row => row && String(row.tournamentId || '') === tournamentId)
  const relation=relations.sort((a,b) => Number(String(b.divisionId || '')===String(match.divisionId || ''))-Number(String(a.divisionId || '')===String(match.divisionId || '')))[0]
  const teamId=String(relation?.teamId || sourceId)
  const team=await queryById('teams',teamId).catch(() => null)
  const source=relation?.kitColors || relation?.uniformColors || team?.kitColors || team?.uniformColors || {}
  const labels=relation?.kitColorLabels || team?.kitColorLabels || {}
  const set=match.kitSelection?.[side] || 'primary'
  return { ...(labels[set] || labels.primary || labels.home || {}),...(source[set] || source.primary || source.home || source) }
}
async function openRefereeAssignment(match,tab='referee') {
  assignmentMatch.value=match;assignmentTab.value=tab;assignmentVisible.value=true
  const crew=match.refereeCrew || {}
  Object.keys(assignmentForm).forEach(key => { assignmentForm[key]='' })
  assignmentRoles.value.forEach(role => { const person=crew[role.key];assignmentForm[role.key]=typeof person === 'string' ? person : person?._id || person?.refereeId || '' })
  assignmentCrewId.value=''
  for(const side of ['home','away'])for(const part of kitParts)kitForm[side][part.key]=String(match.kitColors?.[side]?.[part.key] || '')
  assignmentLoading.value=true;kitLoading.value=true
  const refereeTask=Promise.all([queryList('referees',{where:{status:'approved'},limit:500,silent:true}),queryList('referees',{where:{tournamentId},limit:500,silent:true})]).then(groups => {refereeRows.value=[...new Map(groups.flat().filter(Boolean).map(item => [String(item._id),item])).values()] }).catch(error => {refereeRows.value=[];ElMessage.error(error.message || '裁判名单加载失败')}).finally(() => {assignmentLoading.value=false})
  const kitTask=Promise.all(['home','away'].map(side => loadKitDefaults(match,side).then(defaults => {for(const part of kitParts)if(!kitForm[side][part.key])kitForm[side][part.key]=String(defaults[part.key] || '')}))).catch(error => ElMessage.error(error.message || '球服颜色加载失败')).finally(() => {kitLoading.value=false})
  await Promise.all([refereeTask,kitTask])
}
async function refreshAssignmentMatch() { const fresh=await queryById('matches',assignmentMatch.value._id);if(!fresh)throw new Error('保存后未读到比赛，请刷新赛程');matches.value=matches.value.map(item => item._id===fresh._id ? {...item,...fresh} : item);assignmentMatch.value=matches.value.find(item => item._id===fresh._id) || fresh }
async function saveWorkbenchReferees() {
  const activeRoles=visibleAssignmentRoles.value
  const ids=activeRoles.map(role => assignmentForm[role.key])
  if(ids.some(id => !id))return ElMessage.warning(`请完整安排${activeRoles.length}名裁判`)
  if(new Set(ids).size!==ids.length)return ElMessage.warning('同一裁判不能担任多个岗位')
  savingReferees.value=true
  try { const crew=Object.fromEntries(activeRoles.map(role => [role.key,assignmentForm[role.key]]));const result=await callFunction('updateMatch',{matchId:assignmentMatch.value._id,data:{refereeCrew:crew,refereeCrewSize:assignmentCrewSize.value}});if(!result?.success)throw new Error(result?.message || '裁判安排未保存');await refreshAssignmentMatch();ElMessage.success('裁判组已保存') }catch(error){ElMessage.error(error.message || '裁判安排失败')}finally{savingReferees.value=false}
}
async function saveWorkbenchKit() {
  const snapshot=Object.fromEntries(['home','away'].map(side => [side,Object.fromEntries(kitParts.map(part => [part.key,String(kitForm[side][part.key] || '').trim()]))]))
  if(!snapshot.home.jersey || !snapshot.away.jersey)return ElMessage.warning('请先选择双方上衣颜色')
  savingKit.value=true
  try {const result=await callFunction('updateMatch',{matchId:assignmentMatch.value._id,data:{kitColors:snapshot}});if(!result?.success)throw new Error(result?.message || '球衣颜色未保存');await refreshAssignmentMatch();ElMessage.success('球衣颜色已保存')}catch(error){ElMessage.error(error.message || '球衣颜色保存失败')}finally{savingKit.value=false}
}
function fieldFormatLabel(value) { return fieldFormats.find(item => item.value === value)?.label || '制式待设置' }
function matchFormat(division) { const raw = String(division?.matchFormat || ''); const number = raw.match(/(5|7|8|9|11)/)?.[1] || Number(division?.playersOnField || 0); return number ? `${number}side` : '' }
function formatLabel(division) { return `${fieldFormatLabel(matchFormat(division))} · ${{league:'联赛制',cup:'小组+淘汰',tournament:'淘汰赛',hybrid:'复合赛制'}[division?.formatType || division?.tournamentType] || '赛制待设置'}` }
function matchMinutes(division) { return Number(division?.matchMinutes || division?.rulesSnapshot?.matchMinutes || 0) }
function divisionName(id) { return divisions.value.find(item => String(item.id) === String(id))?.name || '未命名组别' }
function teamLabel(match, side) { return String(match?.[`${side}TeamName`] || match?.[`${side}SourceLabel`] || '待产生') }
function crestSources(team) {
  return [team?.logoTransparentFileId,team?.logoTransparentFileID,team?.logoTransparentUrl,team?.logoFileID,team?.logoFileId,team?.logoCloudFileId,team?._logoFileId,team?.logoUrl,team?.logo].filter(value=>typeof value==='string' && value.trim())
}
function teamLogoSources(match,side) {
  const saved=[match?.[`${side}TeamLogoTransparentFileId`],match?.[`${side}TeamLogoFileID`],match?.[`${side}TeamLogoFileId`],match?.[`${side}TeamLogoTransparentUrl`],match?.[`${side}TeamLogo`],match?.[`${side}Logo`],...crestSources(match?.[`${side}Team`])]
  const current=teamLogoMap.value.get(String(match?.[`${side}TeamId`] || '')) || []
  return [...new Set([...saved,...current].filter(value=>typeof value==='string' && value.trim()))]
}
function hasMatchScore(match) { return match?.homeScore !== null && match?.homeScore !== undefined && match?.homeScore !== '' && match?.awayScore !== null && match?.awayScore !== undefined && match?.awayScore !== '' }
function scoreText(match) { const state=managementState(match).key; return state==='scheduled' || state==='supplement' && !hasMatchScore(match) ? '- : -' : match?.homeScore == null && match?.awayScore == null ? '— : —' : `${match.homeScore ?? '—'} : ${match.awayScore ?? '—'}` }
function managementState(match) {
  const status=String(match?.status || '').toLowerCase(),postState=String(match?.postState || '').toLowerCase(),reviewStatus=String(match?.refereeReviewStatus || match?.reviewStatus || '').toLowerCase(),recordState=String(match?.recordState || '')
  const hasScore=hasMatchScore(match)
  const refereeSubmitted=reviewStatus === 'under_review' || reviewStatus === 'returned' || reviewStatus === 'archived' || recordState === '电子记录待复核' || recordState === '电子记录已归档' || Boolean(match?.refereeRecord || match?.refereeReport || match?.refereeSubmittedAt || match?.refereeReportSubmittedAt)
  const preMatchStatus=['scheduled','pending','checked_in','not_started','upcoming'].includes(status)
  if(status==='archived' || postState==='archived' || reviewStatus==='archived' || recordState==='电子记录已归档')return { key:'archived',label:'已归档' }
  if(['live','in_progress','playing'].includes(status) || match?.executionState==='recording')return { key:'live',label:'进行中' }
  if(refereeSubmitted || status==='pending_review' || postState==='review')return { key:'review',label:'待复核' }
  if(preMatchStatus)return { key:'scheduled',label:'待开始' }
  if(hasScore)return { key:'completed',label:'已完赛' }
  if(postState==='supplement' || ['pending_result','awaiting_result','completed','finished'].includes(status))return { key:'supplement',label:'完赛未补录' }
  return { key:'scheduled',label:'待开始' }
}
function scoreStateClass(match) { const state=managementState(match).key;return state==='live'?'score-live':['scheduled','supplement'].includes(state)?'score-upcoming':'score-finished' }
const managementCounts = computed(() => matches.value.reduce((counts,match)=>{const key=managementState(match).key;counts[key]=(counts[key] || 0)+1;return counts},{ scheduled:0,live:0,completed:0,supplement:0,review:0,archived:0 }))
const playedMatches = computed(() => matches.value.filter(match => managementState(match).key !== 'scheduled').length)
const remainingMatches = computed(() => Math.max(0, matches.value.length - playedMatches.value))
function matchRoute(match,suffix=''){return { path:`/tournaments/${tournamentId}/match/${match._id}${suffix}`,query:{ ...(match.divisionId ? { divisionId:match.divisionId } : {}),listDate:selectedDate.value,listDivision:divisionFilter.value,listView:view.value } }}
function openMatchWorkspace(match){const state=managementState(match).key;if(state==='live')return router.push(matchRoute(match,'/monitor'));if(state==='supplement')return router.push(matchRoute(match,'/post-match'));if(state==='review')return router.push(matchRoute(match,'/review'));if(state==='archived')return router.push(matchRoute(match,'/archive'));return router.push(matchRoute(match))}
function pendingCountForDivision(id) { return matches.value.filter(match => String(match.divisionId || 'default') === String(id) && (!match.matchDate || !match.matchTime || !match.venue)).length }
function matchCountForDivision(id) { return matches.value.filter(match => String(match.divisionId || 'default') === String(id)).length }
function defaultPolicy(division) { const eleven = matchFormat(division) === '11side'; const onePerDay=config.frequencyPreset === 'daily_one' || config.frequencyPreset === 'adaptive' && eleven; return { turnaroundMinutes:Number(config.defaultTurnaroundMinutes || 10),maxMatchesPerDay:onePerDay ? 1 : 2,maxPerSession:1,minRestMinutes:onePerDay ? 1080 : 120,allowedDates:[],allowedSessions:[],allowedVenues:[] } }
function policyFor(division) { const id = String(division.id); if (!config.divisionPolicies[id]) config.divisionPolicies[id] = defaultPolicy(division); return config.divisionPolicies[id] }
function resetPolicies() { config.divisionPolicies = Object.fromEntries(divisions.value.map(division => [division.id,defaultPolicy(division)])) }
function applyDefaultTurnaround(value) { Object.values(config.divisionPolicies).forEach(policy => { policy.turnaroundMinutes = Number(value || 0) }) }
function hasPolicyLimits(division) { const policy=policyFor(division);return Boolean(policy.allowedDates?.length || policy.allowedSessions?.length || policy.allowedVenues?.length) }
const policyCompatibleVenues = computed(() => policyDivision.value ? config.venueResources.filter(venue => venue.fieldFormat === matchFormat(policyDivision.value)) : [])
function openPolicyLimits(division) { const policy=policyFor(division);policyDivision.value=division;policyDraft.allowedDates=[...(policy.allowedDates || [])];policyDraft.allowedSessions=[...(policy.allowedSessions || [])];policyDraft.allowedVenues=[...(policy.allowedVenues || [])];policyVisible.value=true }
function policyDateDisabled(date) { const value=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;return Boolean(config.startDate && value<config.startDate || config.endDate && value>config.endDate || !allCalendarDays.value.some(day=>day.date===value)) }
function savePolicyLimits() { if(!policyDivision.value)return;const policy=policyFor(policyDivision.value);policy.allowedDates=[...policyDraft.allowedDates];policy.allowedSessions=[...policyDraft.allowedSessions];policy.allowedVenues=[...policyDraft.allowedVenues];policyVisible.value=false }
function clearPolicyLimits() { policyDraft.allowedDates=[];policyDraft.allowedSessions=[];policyDraft.allowedVenues=[];savePolicyLimits() }
function addVenue() { const used = new Set(config.venueResources.map(item => item.name)); let index = 1; while (used.has(`${index}号场地`)) index += 1; const sessions=openSessions.value; config.venueResources.push({ name:`${index}号场地`,fieldFormat:'5side',startTime:sessions[0]?.start || '09:00',endTime:sessions[sessions.length-1]?.end || '18:00',sessionWindows:config.sessionWindows.map(item => ({ ...item })) }) }
const enabledSessions = computed(() => config.sessionWindows.filter(item => item.enabled))
const enabledSessionLabels = computed(() => enabledSessions.value.map(item => item.label).join('、') || '未开放')
const calendarConfigured = computed(() => Boolean(config.startDate && config.endDate && config.matchDays.length && config.venueResources.length && enabledSessions.value.length))
const arrangedMatches = computed(() => matches.value.filter(match => match.matchDate && match.matchTime && match.venue))
const pendingMatches = computed(() => matches.value.filter(match => !match.matchDate || !match.matchTime || !match.venue))
const filteredPendingMatches = computed(() => pendingMatches.value.filter(match => divisionFilter.value === 'all' || String(match.divisionId || 'default') === divisionFilter.value))
const allCalendarDays = computed(() => { if (!config.startDate || !config.endDate) return []; const start = new Date(`${config.startDate}T00:00:00`), end = new Date(`${config.endDate}T00:00:00`), names=['周日','周一','周二','周三','周四','周五','周六'], allowedDates=Array.isArray(config.matchDates)&&config.matchDates.length?new Set(config.matchDates):null, rows=[]; for (let day=new Date(start);day<=end;day.setDate(day.getDate()+1)) { const weekday=names[day.getDay()]; const date=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`; if (allowedDates ? !allowedDates.has(date) : !config.matchDays.includes(weekday)) continue; rows.push({ date,weekday,short:`${day.getMonth()+1}.${day.getDate()}` }) } return rows })
const calendarDays = computed(() => {
  const counts = new Map()
  for (const match of arrangedMatches.value) {
    if (divisionFilter.value !== 'all' && String(match.divisionId || 'default') !== divisionFilter.value) continue
    const date = String(match.matchDate || '').slice(0,10)
    counts.set(date, (counts.get(date) || 0) + 1)
  }
  if(calendarConfigured.value) {
    const configured=new Set(allCalendarDays.value.map(day=>day.date))
    const extra=[...counts].filter(([date])=>!configured.has(date)).map(([date,count])=>{const day=new Date(`${date}T00:00:00`);return {date,count,weekday:['周日','周一','周二','周三','周四','周五','周六'][day.getDay()],short:`${day.getMonth()+1}.${day.getDate()}`}})
    return [...allCalendarDays.value.map(day=>({...day,count:counts.get(day.date) || 0})),...extra].sort((a,b)=>a.date.localeCompare(b.date))
  }
  return [...counts].sort(([a],[b]) => a.localeCompare(b)).map(([date,count]) => {
    const day = new Date(`${date}T00:00:00`)
    return { date,count,weekday:['周日','周一','周二','周三','周四','周五','周六'][day.getDay()],short:`${day.getMonth()+1}.${day.getDate()}` }
  })
})
// 只显比赛日：勾选后仅保留当天已排比赛的日期；一个比赛日都没有时回退显示全部，避免日期条清空
const visibleCalendarDays = computed(() => { if (!matchDayOnly.value) return calendarDays.value; const withMatches = calendarDays.value.filter(day => day.count > 0); return withMatches.length ? withMatches : calendarDays.value })
watch(visibleCalendarDays, days => {
  if (!days.length) { selectedDate.value = ''; return }
  if (days.some(day => day.date === selectedDate.value)) return
  selectedDate.value = firstUnfinishedMatchDate(days, arrangedMatches.value, match =>
    ['scheduled', 'live', 'supplement', 'review'].includes(managementState(match).key)
  )
}, { immediate:true })
// 比赛日按具体日期勾选：周期内每天一个小方块，点选切换；超出比赛周期的选择自动剔除，并同步推导周几（兼容旧版引擎与演示端）
const periodCalendarDays = computed(() => {
  if (!config.startDate || !config.endDate) return []
  const start = new Date(`${config.startDate}T00:00:00`), end = new Date(`${config.endDate}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return []
  const names = ['日', '一', '二', '三', '四', '五', '六']
  const rows = []
  for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    rows.push({ date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`, dayOfMonth: day.getDate(), weekdayShort: names[day.getDay()] })
  }
  return rows
})
const matchDateSet = computed(() => new Set(Array.isArray(config.matchDates) ? config.matchDates : []))
function toggleMatchDate(date) {
  const current = matchDateSet.value
  const next = current.has(date) ? [...current].filter(value => value !== date) : [...current, date].sort()
  config.matchDates = next
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const weekdays = [...new Set(next.map(value => names[new Date(`${value}T00:00:00`).getDay()]))]
  if (weekdays.length) config.matchDays = weekdays
}
watch(() => config.matchDates.slice(), dates => {
  const names=['周日','周一','周二','周三','周四','周五','周六']
  const valid=(Array.isArray(dates)?dates:[]).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(String(value))).sort()
  const inRange=valid.filter(value => !(config.startDate && value<config.startDate) && !(config.endDate && value>config.endDate))
  if (inRange.length!==valid.length) config.matchDates=inRange
  const weekdays=[...new Set(inRange.map(value => names[new Date(`${value}T00:00:00`).getDay()]))]
  if (weekdays.length) config.matchDays=weekdays
})
watch([selectedDate, divisionFilter], ([date, division]) => { if (!date) return; const query = { ...route.query, date }; if (division === 'all') delete query.divisionId; else query.divisionId = division; router.replace({ path:route.path, query }) })
const selectedDateLabel = computed(() => { const day=calendarDays.value.find(item => item.date === selectedDate.value); return day ? `${day.date} ${day.weekday}` : '请选择比赛日' })
const selectedDayMatches = computed(() => arrangedMatches.value.filter(match => match.matchDate === selectedDate.value && (divisionFilter.value === 'all' || String(match.divisionId || 'default') === divisionFilter.value)))
const activeDivisionFormat = computed(() => {
  if (divisionFilter.value === 'all') return ''
  const division = divisions.value.find(item => String(item.id) === String(divisionFilter.value))
  return division ? String(matchFormat(division) || '') : ''
})
// 选定组别后，日历只展示与该组别制式一致的场地；当天已被该组别占用的场地始终保留，避免历史数据里的比赛“消失”
const visibleVenues = computed(() => {
  const all = Array.isArray(config.venueResources) ? config.venueResources : []
  const format = activeDivisionFormat.value
  if (!format) return all
  const matched = all.filter(venue => String(venue.fieldFormat || '') === format)
  if (!matched.length) return all
  const usedToday = new Set(selectedDayMatches.value.map(match => match.venue).filter(Boolean))
  return [...matched, ...all.filter(venue => !matched.includes(venue) && usedToday.has(venue.name))]
})
const hiddenVenueCount = computed(() => Math.max(0, (config.venueResources || []).length - visibleVenues.value.length))
// 组别有制式、但没有任何场地配了该制式时，会退回显示全部场地；这种情况必须明确告知，避免误判为过滤失效
const venueFilterFallback = computed(() => Boolean(activeDivisionFormat.value) && (config.venueResources || []).length > 0 && !(config.venueResources || []).some(venue => String(venue.fieldFormat || '') === activeDivisionFormat.value))
function divisionFormatLabel(divisionId) {
  const division = divisions.value.find(item => String(item.id) === String(divisionId))
  const format = matchFormat(division)
  return format ? fieldFormatLabel(format) : ''
}
function divisionOptionLabel(division) {
  const format = matchFormat(division)
  return format ? `${division.name}（${fieldFormatLabel(format)}）` : division.name
}
const refereePreMatchList = computed(() => arrangedMatches.value
  .filter(match => match.matchDate === refereeDocsDate.value && managementState(match).key === 'scheduled')
  .slice()
  .sort((a,b) => String(a.matchTime || '').localeCompare(String(b.matchTime || '')) || Number(a.matchSequence || a.matchNo || 0)-Number(b.matchSequence || b.matchNo || 0)))
function minutes(value) { const [hour,minute] = String(value || '00:00').split(':').map(Number); return hour*60+minute }
function timeText(value) { return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}` }
function timesByStep(step) { const rows=[]; for (const session of enabledSessions.value) for (let value=minutes(session.start);value<minutes(session.end);value+=step) rows.push(timeText(value)); return [...new Set(rows)].sort() }
const preciseTimes = computed(() => selectedKickoffTimes.value.length ? selectedKickoffTimes.value : allKickoffTimes.value)
// ===== 赛历地图 =====
// 场地并排：同一天用一张网格，全部场地按列展示；组别筛选只决定显示哪些场地列与卡片明暗，不再按组别拆成多块纵向堆叠
function dayMatchesForDivision(divisionId) { return dayVenueMatches.value.filter(match => String(match.divisionId || 'default') === String(divisionId)) }
const activeBlocks = computed(() => {
  const venues = visibleVenues.value
  if (!venues.length) return []
  const division = divisionFilter.value === 'all' ? null : divisions.value.find(item => String(item.id) === String(divisionFilter.value))
  const id = division ? String(division.id) : 'all'
  const matches = dayVenueMatches.value
  const configured = calendarConfigured.value ? venues.flatMap(venue => venueKickoffMap.value.get(venue.name) || []) : []
  const times = [...new Set([...configured, ...matches.map(match => match.matchTime).filter(Boolean)])].sort()
  const slotState = new Map()
  for (const venue of venues) for (const time of times) slotState.set(`${venue.name}|${time}`, slotBlockInfo(venue.name, time, id))
  return [{ id, name: division?.name || '全部组别', formatLabel: division ? formatLabel(division) : '', venues, times, matches, slotState }]
})
function blockMatchesForCell(block, venue, time) { return block.matches.filter(match => match.venue === venue && match.matchTime === time) }
// 场地列宽按「可用宽度正好放下 3 列」实时测算：单组别与全部组别共用同一公式，
// 因此两种情况下列宽完全一致；场地多于 3 块时表格超宽，靠横向滚动或按住拖动平移查看。
const mapScrollEl = ref(null), mapScrollWidth = ref(0)
const venueColumnWidth = computed(() => {
  const available = mapScrollWidth.value
  if (!available) return 400
  return Math.max(300, Math.min(560, Math.round((available - 96) / 3)))
})
function mapTableWidth(venueCount) { return 96 + venueCount * venueColumnWidth.value }
let mapResizeObserver = null
// 地图挂载/尺寸变化时重算列宽（切换待排抽屉、缩放窗口都会触发）
watch(mapScrollEl, el => {
  mapResizeObserver?.disconnect()
  mapResizeObserver = null
  if (!el) return
  mapScrollWidth.value = el.clientWidth
  mapResizeObserver = new ResizeObserver(entries => { const entry = entries[0]; if (entry) mapScrollWidth.value = Math.round(entry.contentRect.width) })
  mapResizeObserver.observe(el)
})
// 小手：场地多时按住地图空白处左右拖动即可平移，不必滑到底部找横向滚动条
let mapPanState = null, mapPanMoved = false
function startMapPan(event) {
  const el = mapScrollEl.value
  if (!el || event.button !== 0) return
  const target = event.target instanceof Element ? event.target : null
  if (target && target.closest('article, button, a, input, [draggable="true"], .drag-handle')) return
  mapPanState = { clientX:event.clientX, scrollLeft:el.scrollLeft }
  mapPanMoved = false
  event.preventDefault()
  el.classList.add('is-panning')
  window.addEventListener('mousemove', moveMapPan)
  window.addEventListener('mouseup', endMapPan)
}
function moveMapPan(event) {
  const el = mapScrollEl.value
  if (!el || !mapPanState) return
  const offset = event.clientX - mapPanState.clientX
  if (Math.abs(offset) > 4) mapPanMoved = true
  el.scrollLeft = mapPanState.scrollLeft - offset
}
function endMapPan() {
  const el = mapScrollEl.value
  if (el) el.classList.remove('is-panning')
  mapPanState = null
  window.removeEventListener('mousemove', moveMapPan)
  window.removeEventListener('mouseup', endMapPan)
  if (mapPanMoved) window.setTimeout(() => { mapPanMoved = false }, 260)
}
// 拖动平移后紧跟的 click 不应触发落位，避免平移时误排比赛
function guardMapClick(event) {
  if (!mapPanMoved) return
  event.stopPropagation()
  event.preventDefault()
}
function blockSlotState(block, venueName, time) { return block.slotState.get(`${venueName}|${time}`) || null }
function blockSlotText(block, venueName, time) {
  const state = blockSlotState(block, venueName, time)
  if (!state) return ''
  if (state.closed) return `${venueName} 在这个时间没有开赛点`
  return `${state.division} 第${state.matchNo}场 ${state.from}–${state.to} 占用中`
}
function sessionLabel(time) { return kickoffPeriods.find(period=>period.key===kickoffPeriod(time))?.label || '' }
function compatibleVenues(match) { const division=divisions.value.find(item => String(item.id) === String(match?.divisionId)); const format=String(match?.matchFormat || matchFormat(division)); return config.venueResources.filter(item => !format || item.fieldFormat === format) }
function cardStageLabel(match) {
  const normalized = { ...match, phase:match.phase || match.stage || match.scheduleType, roundName:match.roundName || match.stageName || match.scheduleStageName }
  const round = formatMatchRound(normalized)
  if (round && round !== '-') return round
  const phase = String(normalized.phase || '').toLowerCase()
  return ({ group:'小组赛', league:'联赛', knockout:'淘汰赛', cup:'淘汰赛', semifinal:'半决赛', semi_final:'半决赛', final:'决赛', placement:'排位赛', ranking:'排位赛' })[phase] || '阶段待定'
}
function matchesForCell(venue,time) { return selectedDayMatches.value.filter(match => match.venue === venue && match.matchTime === time) }
// 场地占用判定必须跨组别：组别筛选只影响“显示哪些比赛”，不影响“哪些时段已被占用”
const dayVenueMatches = computed(() => arrangedMatches.value.filter(match => match.matchDate === selectedDate.value))
function matchDurationMinutes(match) {
  const direct = Number(match?.durationMinutes || 0)
  if (direct > 0) return direct
  const configured = Number(config.matchDurations?.[match?.divisionId] || 0)
  if (configured > 0) return configured
  const division = divisions.value.find(item => String(item.id) === String(match?.divisionId))
  const byDivision = Number(matchMinutes(division) || 0)
  return byDivision > 0 ? byDivision : 50
}
// 返回该格被哪场比赛占用（含“上一场还没打完”的时间重叠）；null 表示可放
// divisionId 用于判断“同组别的比赛会渲染成卡片”，其他组别的比赛看不见必须提示
function slotBlockInfo(venue, time, divisionId) {
  if (!venue || !time) return null
  const start = minutes(time)
  const visibleIds = new Set(dayMatchesForDivision(divisionId).filter(match => match.venue === venue && match.matchTime === time).map(match => String(match._id)))
  for (const match of dayVenueMatches.value) {
    if (match.venue !== venue || !match.matchTime) continue
    const duration = matchDurationMinutes(match)
    const from = minutes(match.matchTime)
    if (from === start) {
      if (visibleIds.has(String(match._id))) return null
      return { from: timeText(from), to: timeText(from + duration), matchNo: sequenceLabel(match), division: divisionName(match.divisionId) }
    }
    if (from > start) continue
    if (start < from + duration) return { from: timeText(from), to: timeText(from + duration), matchNo: sequenceLabel(match), division: divisionName(match.divisionId) }
  }
  // 该场地在这个时间没有开赛点（首末场或时段未覆盖）
  if (!venueOffersTime(venue, time)) return { closed: true }
  return null
}
function slotBlockMessage(venueName, time, divisionId) {
  const block = slotBlockInfo(venueName, time, divisionId)
  if (!block) return ''
  if (block.closed) return `${venueName} 在这个时间没有开赛点，请换一个时段`
  return `${block.division} 第${block.matchNo}场 ${block.from}–${block.to} 占用中，请换一个时段`
}
// 场地制式校验：拖拽/点选前就拦下“8人制比赛放 7人制场地”这类不兼容放置，不再等后端报错
function slotFormatMessage(venueName, divisionId) {
  const format = matchFormat(divisions.value.find(item => String(item.id || item._id) === String(divisionId)))
  if (!format) return ''
  const venue = config.venueResources.find(item => item.name === venueName)
  const venueFormat = String(venue?.fieldFormat || '').trim().toLowerCase()
  if (venueFormat && venueFormat !== format) return `${venueName}是${fieldFormatLabel(venueFormat)}场地，不能安排${fieldFormatLabel(format)}比赛`
  return ''
}

function openRefereePreMatchDocs() {
  refereeDocsDate.value = selectedDate.value || calendarDays.value[0]?.date || ''
  refereeDocsProgress.value = { percent:0,label:'' }
  refereeDocsVisible.value = true
}

function refereeRosterLimit(match, division, registration) {
  for (const source of [division, division?.rulesSnapshot, division?.publishedRegulationsSnapshot, registration, tournament.value]) {
    if (!source || typeof source !== 'object') continue
    for (const field of ['rosterLimit', 'maxPlayersPerTeam', 'maxPlayers']) {
      const value = Number(source[field])
      if (Number.isFinite(value) && value > 0) return Math.floor(value)
    }
  }
  const formatValue = String(match.matchFormat || division?.matchFormat || tournament.value.matchFormat || '')
  const format = /side/i.test(formatValue) ? formatValue.toLowerCase() : `${formatValue.match(/(11|9|8|7|5)/)?.[1] || ''}side`
  return Number(MATCH_FORMAT_DEFAULTS[format] || 0)
}

async function loadApprovedRefereeRoster(match, side, cache) {
  const sourceTeamId = String(match[`${side}TeamId`] || '')
  const matchTournamentId = String(match.tournamentId || tournamentId)
  let divisionId = String(match.divisionId || '')
  if (!sourceTeamId || !matchTournamentId) throw new Error('比赛球队或赛事信息不完整')
  const cacheKey = `${matchTournamentId}:${divisionId}:${sourceTeamId}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const request = (async () => {
    const directValue = await queryById('tournament_teams', sourceTeamId).catch(() => null)
    const direct = Array.isArray(directValue) ? directValue[0] || null : directValue
    const teamIds = [...new Set([sourceTeamId, direct?.teamId].map(value => String(value || '')).filter(Boolean))]
    const lists = await Promise.all(teamIds.map(teamId => queryList('tournament_teams', {
      where:{ tournamentId:matchTournamentId, teamId }, limit:100, silent:true, cache:'bypass', throwOnError:true
    })))
    const registrations = [...new Map([direct, ...(lists || []).flat()]
      .filter(row => row && String(row.tournamentId || '') === matchTournamentId)
      .filter(row => teamIds.includes(String(row.teamId || '')) || String(row._id || '') === sourceTeamId)
      .map(row => [String(row._id || `${row.teamId}:${row.divisionId}`), row])).values()]
    const divisionIds = [...new Set(registrations.map(row => String(row.divisionId || row.division || '')).filter(Boolean))]
    if (!divisionId && divisionIds.length > 1) throw new Error('比赛缺少组别信息，无法安全选择赛事名单')
    if (!divisionId && divisionIds.length === 1) divisionId = divisionIds[0]
    if (!divisionId) throw new Error('比赛缺少组别信息，无法安全选择赛事名单')
    const registration = registrations.find(row => String(row.divisionId || row.division || 'default') === divisionId) || null
    const actualTeamId = String(registration?.teamId || direct?.teamId || sourceTeamId)
    const result = await rosterExceptionBoard({ tournamentId:matchTournamentId, teamId:actualTeamId, divisionId, rosterAction:'listRoster' })
    if (!result?.success) throw new Error(result?.error || '赛事正式名单加载失败')
    const resolvedDivision = String(result.relation?.divisionId || '')
    if (resolvedDivision && resolvedDivision !== divisionId) throw new Error('球队名单与比赛组别不一致')
    if (!['approved','confirmed','locked'].includes(String(result.snapshot?.status || '').toLowerCase())) {
      throw new Error('尚未形成已审核赛事正式名单')
    }
    const players = (result.rows || []).map(player => ({
      playerId:String(player._id || player.playerId || player.id || '').trim(),
      name:String(player.name || '').trim(),
      number:String(player.jerseyNumber || '').trim()
    })).filter(player => player.name)
      .sort((left,right) => String(left.number).localeCompare(String(right.number),'zh-CN',{numeric:true}) || left.name.localeCompare(right.name,'zh-CN'))
    if (!players.length) throw new Error('已审核名单中没有可读取的队员资料')
    const division = divisions.value.find(item => String(item.id) === divisionId) || {}
    return { players, limit:refereeRosterLimit(match,division,registration), registeredCount:players.length }
  })()
  cache.set(cacheKey, request)
  try { return await request } catch(error) { cache.delete(cacheKey); throw error }
}

function suspensionRuleFor(match) {
  const division = divisions.value.find(item => String(item.id) === String(match.divisionId || '')) || {}
  const sources = [division.suspensionRule,division.rulesSnapshot?.suspensionRule,division.publishedRegulationsSnapshot?.suspensionRule,tournament.value.suspensionRule,tournament.value.rules?.suspensionRule]
  return sources.find(Boolean) || null
}

async function buildRefereePreMatchEntries(onProgress) {
  const selected = refereePreMatchList.value
  if (!selected.length) throw new Error('所选比赛日没有待开始比赛')
  const rosterCache = new Map()
  const entries = []
  const warnings = new Set()
  if (disciplinaryLoadFailed.value) warnings.add('追加处罚读取失败，本次裁判表未纳入追加停赛')
  let completed = 0
  for (let offset=0; offset<selected.length; offset+=3) {
    const batch = selected.slice(offset,offset+3)
    const built = await Promise.all(batch.map(async match => {
      const [home,away] = await Promise.all([
        loadApprovedRefereeRoster(match,'home',rosterCache),
        loadApprovedRefereeRoster(match,'away',rosterCache)
      ])
      const suspension = calculatePreMatchSuspensions({
        matches:matches.value,currentMatch:match,homeRoster:home,awayRoster:away,rules:suspensionRuleFor(match),
        tournamentId,divisionId:String(match.divisionId || ''),manualActions:disciplinaryActions.value
      })
      if (suspension.complete) {
        home.players.forEach(player => { if (suspension.ids.has(player.playerId)) player.note='S' })
        away.players.forEach(player => { if (suspension.ids.has(player.playerId)) player.note='S' })
      } else if (suspension.reason) warnings.add(suspension.reason)
      const division = divisions.value.find(item => String(item.id) === String(match.divisionId || '')) || {}
      const rowCount = Math.max(home.limit,away.limit,home.players.length,away.players.length)
      const kitDefaults = await Promise.all(['home','away'].map(side => loadKitDefaults(match,side)))
      const kitColors = Object.fromEntries(['home','away'].map((side,index) => [side,Object.fromEntries(kitParts.map(part => [part.key,kitColorLabel(match.kitColors?.[side]?.[part.key] || kitDefaults[index]?.[part.key])]))]))
      const workMatch = { ...match, matchSequence:match.matchSequence || match.matchNo || match.sequence || match.matchIndex }
      const entry = {
        match:workMatch,
        input:{
          match:workMatch,
          matchFormat:match.matchFormat || division.matchFormat || tournament.value.matchFormat || '',
          tournamentName:tournament.value.name || match.tournamentName || '',
          divisionName:division.name || division.divisionName || match.divisionName || match.division || '',
          location:tournament.value.location || tournament.value.address || tournament.value.venue || '',
          homeName:teamLabel(match,'home'),awayName:teamLabel(match,'away'),
          kitColors,
          homePlayers:home.players,awayPlayers:away.players,rowCount
        }
      }
      completed += 1
      onProgress?.(completed,selected.length)
      return entry
    }))
    entries.push(...built)
  }
  return { entries, warnings:[...warnings] }
}

function safeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]))
}
function kitLine(colors) {
  return `球衣颜色：上衣${colors?.jersey || '____'}　短裤${colors?.shorts || '____'}　球袜${colors?.socks || '____'}`
}

function printSheetHtml(input) {
  const widths=[280,1240,280,360,360,360,360,864,288,288]
  const allWidths=[...widths,...widths]
  const maxRows=Math.max(Number(input.rowCount)||0,input.homePlayers.length,input.awayPlayers.length,1)
  const colgroup=`<colgroup>${allWidths.map(value=>`<col style="width:${(value/9360*100).toFixed(3)}%">`).join('')}</colgroup>`
  const heading=['序号','队员姓名','号码','说明','身份','换上','换下','进球','黄牌','红牌','序号','队员姓名','号码','说明','身份','换上','换下','进球','黄牌','红牌']
  const header=`<tr>${heading.map(label=>`<th>${label}</th>`).join('')}</tr>`
  const match=input.match||{}
  const day=String(match.matchDate||'').replace(/^(\d{4})-(\d{1,2})-(\d{1,2})$/,'$1年$2月$3日')
  const logo=`${window.location.origin}${import.meta.env.BASE_URL}logo-saixiaofeng.png`
  const pageCount=maxRows>20?Math.ceil(maxRows/20):1
  const rowsPerPage=Math.floor(maxRows/pageCount),extraRows=maxRows%pageCount
  const pages=[]
  let offset=0
  for(let page=0;page<pageCount;page+=1){
    const count=rowsPerPage+(page<extraRows?1:0)
    const rows=Array.from({length:count},(_,row)=>{
      const index=offset+row,home=input.homePlayers[index]||{},away=input.awayPlayers[index]||{}
      const cells=[String(index+1),home.name||'',home.number||'','',home.note||'','','','','','',String(index+1),away.name||'',away.number||'','',away.note||'','','','','','']
      return `<tr>${cells.map((value,cell)=>`<td${cell%10===1?' class="player-name"':''}>${safeHtml(value)}</td>`).join('')}</tr>`
    }).join('')
    offset+=count
    const firstPage=page===0,lastPage=page===pageCount-1
    const title=firstPage?`<h1>裁判首发阵容信息表</h1><div class="meta"><div><span>比赛名称：</span><b>${safeHtml(`${input.tournamentName||'足球比赛'}（${String(input.matchFormat||'').replace('side','人制')}）`)}</b></div><div><span>比赛时间：</span><b>${safeHtml(`${day} ${match.matchTime||''}`)}</b></div><div><span>比赛地点：</span><b>${safeHtml(`${input.location||''}　${match.venue||''}　场序：第${match.matchSequence||match.matchNo||match.sequence||'待定'}场　组别：${input.divisionName||''}`)}</b></div></div><p class="result">比赛结果：______：______    加时赛（点球决胜）结果：______：______    获胜队：________________________</p><p class="legend">${REFEREE_SHEET_LEGEND.map(line => '<span>'+safeHtml(line)+'</span>').join('')}</p>`:''
    const signatures=lastPage?`<div class="team-sign"><span>主教练签名：________________</span><span>球衣　上 / 下</span><span>主教练签名：________________</span><span>球衣　上 / 下</span></div><div class="officials"><span>主裁判：____________</span><span>第一助理裁判：____________</span><span>第二助理裁判：____________</span><span>第四官员：____________</span><span>裁判监督：____________</span><span>比赛监督：____________</span></div><footer><img src="${logo}" alt="赛小蜂足球"><strong>本名单由赛小蜂足球后台自动生成，最终解释权归赛事组委会所有！</strong></footer>`:''
    pages.push(`<section class="sheet">${title}<table class="teams"><tbody><tr><td>主队：${safeHtml(input.homeName)}</td><td>客队：${safeHtml(input.awayName)}</td></tr><tr><td>${safeHtml(kitLine(input.kitColors?.home))}</td><td>${safeHtml(kitLine(input.kitColors?.away))}</td></tr><tr><td>领队/主教练：________________</td><td>领队/主教练：________________</td></tr><tr><td>工作人员/队医：____________</td><td>工作人员/队医：____________</td></tr></tbody></table><table class="roster">${colgroup}<thead>${header}</thead><tbody>${rows}</tbody></table>${signatures}</section>`)
  }
  return pages.join('')
}

function refereePrintDocumentHtml(entries) {
  const pages=entries.map(({input})=>printSheetHtml(input)).join('')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>裁判赛前工作单</title><style>@page{size:A4 portrait;margin:11mm}*{box-sizing:border-box}body{margin:0;color:#111;font-family:"SimSun","Songti SC",serif}.sheet{width:100%;page-break-after:always;break-after:page;display:flex;flex-direction:column}.sheet:last-child{page-break-after:auto;break-after:auto}h1{margin:0 0 4mm;text-align:center;font-size:18pt}.meta{margin:0 5mm 4mm;font-size:10pt}.meta div{display:grid;grid-template-columns:27mm 1fr;margin:2mm 0}.teams{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10pt}.teams td{height:7.5mm;padding:1mm;border:0.5pt solid #777}.roster{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8pt}.roster th,.roster td{height:6mm;padding:1mm .4mm;border:.5pt solid #777;text-align:center;overflow-wrap:anywhere}.roster th{height:11mm;font-weight:400}.roster td.player-name{font-size:9pt;font-weight:bold}.team-sign{display:grid;grid-template-columns:2fr 1fr 2fr 1fr;gap:1mm;padding:2mm 0;border:0.5pt solid #777;font-size:8pt}.team-sign span{text-align:center}.legend,.result{margin:2mm 0;font-size:8pt}.legend span{display:block;white-space:nowrap;line-height:1.25}.officials{display:grid;grid-template-columns:1fr 1fr;gap:3mm 14mm;margin:3mm 14mm 0;font-size:10pt}.officials span{min-height:7mm}footer{display:flex;align-items:center;gap:4mm;margin:auto 0 0;padding-top:4mm;font-size:8pt}footer img{width:34mm;height:auto}footer strong{font-weight:bold}@media screen{body{background:#e9ecef}.sheet{width:186mm;min-height:273mm;margin:8mm auto;padding:0;background:#fff;box-shadow:0 2mm 8mm #0002}}
.upload-replace{display:flex;justify-content:flex-end;margin-top:16px}.import-empty small{color:#718078;font-size:13px}
.calendar-match header{font-size:12px;gap:12px}.calendar-match header>span{min-width:0;overflow-wrap:anywhere}.calendar-match header>b{flex-shrink:0}
</style></head><body>${pages}<script>window.addEventListener('load',async()=>{await Promise.all([...document.images].map(img=>img.decode?.().catch(()=>{})));setTimeout(()=>window.print(),300)})<\/script></body></html>`
}

function downloadBlob(blob, filename) {
  const url=URL.createObjectURL(blob),link=document.createElement('a')
  link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove()
  window.setTimeout(()=>URL.revokeObjectURL(url),30000)
}

async function prepareRefereePreMatchDocs(onProgress) {
  const {entries,warnings}=await buildRefereePreMatchEntries(onProgress)
  onProgress?.(1,1,'正在准备工作单模板')
  const [templateResponse,logoResponse]=await Promise.all([
    fetch(`${import.meta.env.BASE_URL}templates/referee-match-sheet-template.docx`,{cache:'force-cache'}),
    fetch(`${import.meta.env.BASE_URL}logo-saixiaofeng.png`,{cache:'force-cache'})
  ])
  if(!templateResponse.ok||!logoResponse.ok)throw new Error('裁判工作单模板或Logo加载失败，请刷新后重试')
  const [templateBytes,logoBytes]=await Promise.all([templateResponse.arrayBuffer(),logoResponse.arrayBuffer()])
  return {entries,warnings,templateBytes,logoBytes}
}

function updateRefereeDocsProgress(percent,label,printWindow=null) {
  const value=Math.max(0,Math.min(100,Math.round(percent)))
  refereeDocsProgress.value={percent:value,label}
  if(!printWindow||printWindow.closed)return
  try {
    const fill=printWindow.document.getElementById('referee-progress-fill')
    const percentLabel=printWindow.document.getElementById('referee-progress-percent')
    const message=printWindow.document.getElementById('referee-progress-label')
    if(fill)fill.style.width=`${value}%`
    if(percentLabel)percentLabel.textContent=`${value}%`
    if(message)message.textContent=label
  } catch {}
}

function refereePrintLoadingHtml(total) {
  const logo=`${window.location.origin}${import.meta.env.BASE_URL}logo-saixiaofeng.png`
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>正在生成裁判工作单</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f7f5;color:#183a27;font-family:"Microsoft YaHei",sans-serif}.box{width:min(420px,calc(100vw - 48px));padding:32px;background:#fff;border:1px solid #dce5df;border-radius:10px;text-align:center;box-shadow:0 8px 32px #183a2712}.box img{width:150px;height:auto}.spin{width:28px;height:28px;margin:20px auto 12px;border:3px solid #d7e8dc;border-top-color:#078747;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.track{height:8px;margin-top:12px;overflow:hidden;border-radius:8px;background:#edf2ee}.track i{display:block;width:0;height:100%;background:#078747;transition:width .2s}.progress{display:flex;justify-content:space-between;margin-top:8px;color:#6c7b71;font-size:12px}.upload-replace{display:flex;justify-content:flex-end;margin-top:16px}.import-empty small{color:#718078;font-size:13px}
.calendar-match header{font-size:12px;gap:12px}.calendar-match header>span{min-width:0;overflow-wrap:anywhere}.calendar-match header>b{flex-shrink:0}
</style></head><body><main class="box"><img src="${logo}" alt="赛小蜂"><div class="spin"></div><strong>正在生成裁判工作单</strong><div class="track"><i id="referee-progress-fill"></i></div><div class="progress"><span id="referee-progress-label">准备${total}场比赛</span><span id="referee-progress-percent">0%</span></div></main></body></html>`
}

function refereePrintErrorHtml(message) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>工作单生成失败</title><style>body{font-family:"Microsoft YaHei",sans-serif;background:#f6f8f6;color:#183a27;padding:48px}main{max-width:520px;margin:auto;padding:28px;background:#fff;border:1px solid #e5e9e6;border-radius:8px}strong{color:#b42318}.upload-replace{display:flex;justify-content:flex-end;margin-top:16px}.import-empty small{color:#718078;font-size:13px}
.calendar-match header{font-size:12px;gap:12px}.calendar-match header>span{min-width:0;overflow-wrap:anywhere}.calendar-match header>b{flex-shrink:0}
</style></head><body><main><strong>裁判工作单生成失败</strong><p>${safeHtml(message)}</p><p>请返回赛事页面重试。</p></main></body></html>`
}

async function downloadRefereePreMatchDocs(format = 'pdf') {
  if(refereeDocsLoading.value)return
  refereeDocsLoading.value=true;refereePrintMode.value=false
  updateRefereeDocsProgress(0,'准备读取比赛名单')
  try {
    const {entries,warnings,templateBytes,logoBytes}=await prepareRefereePreMatchDocs((done,total,stage)=>{
      if(stage)updateRefereeDocsProgress(42,stage)
      else updateRefereeDocsProgress(5+(done/total)*35,`读取正式名单 ${done}/${total}`)
    })
    const archive=new JSZip()
    for(let index=0;index<entries.length;index+=1){
      updateRefereeDocsProgress(42+(index/entries.length)*40,`生成 ${format === 'pdf' ? 'PDF' : 'Word'} 工作单 ${index+1}/${entries.length}`)
      const {input}=entries[index]
      const document=format === 'pdf' ? await createRefereeLineupPdf(input) : await createRefereeLineupSheet(input,templateBytes,logoBytes)
      archive.file(refereeLineupSheetFileName(input.match,input.homeName,input.awayName).replace(/\.docx$/i,format === 'pdf' ? '.pdf' : '.docx'),document)
    }
    updateRefereeDocsProgress(84,'正在打包工作单')
    const blob=await archive.generateAsync({type:'blob',mimeType:'application/zip'},metadata=>updateRefereeDocsProgress(84+(metadata.percent||0)*.16,`正在打包工作单 ${Math.round(metadata.percent||0)}%`))
    downloadBlob(blob,`${refereeDocsDate.value}-裁判赛前工作单-${format === 'pdf' ? 'PDF' : 'Word'}.zip`)
    updateRefereeDocsProgress(100,'工作单已下载')
    if(warnings.length)ElMessage.warning(`已打包${entries.length}场；${warnings[0]}`)
    else ElMessage.success(`已打包${entries.length}份裁判工作单`)
  } catch(error) { updateRefereeDocsProgress(0,'生成失败');ElMessage.error(error.message||'批量下载失败') }
  finally { refereeDocsLoading.value=false }
}

async function printRefereePreMatchDocs() {
  if(refereeDocsLoading.value)return
  const printWindow=window.open('','_blank')
  if(!printWindow)return ElMessage.warning('请允许浏览器打开打印窗口后重试')
  refereeDocsLoading.value=true;refereePrintMode.value=true
  refereeDocsProgress.value={percent:0,label:'正在准备打印稿'}
  printWindow.document.open();printWindow.document.write(refereePrintLoadingHtml(refereePreMatchList.value.length));printWindow.document.close()
  try {
    const {entries,warnings}=await buildRefereePreMatchEntries((done,total)=>updateRefereeDocsProgress(5+(done/total)*65,`读取正式名单 ${done}/${total}`,printWindow))
    updateRefereeDocsProgress(78,'正在排版打印页面',printWindow)
    printWindow.document.open();printWindow.document.write(refereePrintDocumentHtml(entries));printWindow.document.close()
    updateRefereeDocsProgress(100,'打印页面已就绪',null)
    if(warnings.length)ElMessage.warning(`已生成${entries.length}场打印稿；${warnings[0]}`)
    else ElMessage.success(`已生成${entries.length}场打印稿`)
  } catch(error) {
    try { printWindow.document.open();printWindow.document.write(refereePrintErrorHtml(error.message||'批量打印准备失败'));printWindow.document.close() } catch { printWindow.close() }
    updateRefereeDocsProgress(0,'生成失败',printWindow)
    ElMessage.error(error.message||'批量打印准备失败')
  }
  finally { refereeDocsLoading.value=false }
}

function capacityForDivision(division) { const required=matches.value.filter(match => String(match.divisionId || 'default') === String(division.id)).length; const policy=policyFor(division), occupancy=Math.max(5,matchMinutes(division)+Number(policy.turnaroundMinutes || 0)); const dailyMinutes=enabledSessions.value.reduce((sum,item)=>sum+Math.max(0,minutes(item.end)-minutes(item.start)),0); const fields=config.venueResources.filter(item=>item.fieldFormat===matchFormat(division)).length; const slotsPerDay=config.venueResources.filter(item=>item.fieldFormat===matchFormat(division)).reduce((sum,venue)=>sum+venueKickoffTimes(venue).length,0); const capacity=slotsPerDay*allCalendarDays.value.length; return { required,capacity,shortage:Math.max(0,required-capacity),ready:capacity>=required && fields>0 } }const totalCapacity = computed(() => divisions.value.reduce((sum,division) => sum + capacityForDivision(division).capacity,0))
// 赛制核定：按场地制式核算“需要场次”与“比赛日 × 场地时隙”的理论供给，供页面核定面板与自动排程前置校验共用同一套口径。
function buildCapacityAudit(divisionIds,dayCount,pendingOnly){
  const scope=divisionIds&&divisionIds.length?new Set(divisionIds.map(String)):null
  const requirements=new Map()
  for(const division of divisions.value){
    const fieldFormat=matchFormat(division)
    if(!fieldFormat)continue
    const count=matches.value.filter(match=>(!pendingOnly||!match.matchDate||!match.matchTime||!match.venue)&&(!scope||scope.has(String(match.divisionId||'default')))&&String(match.divisionId||'default')===String(division.id)).length
    if(count)requirements.set(fieldFormat,(requirements.get(fieldFormat)||0)+count)
  }
  const missingDates=!config.startDate||!config.endDate
  const availableDays=missingDates?0:Number(dayCount||0)
  const rows=[...requirements].map(([fieldFormat,requiredMatches])=>{
    const fields=config.venueResources.filter(item=>item.fieldFormat===fieldFormat)
    const dailySlots=fields.reduce((sum,venue)=>sum+venueKickoffTimes(venue).length,0)
    const totalCapacity=dailySlots*availableDays
    const shortage=Math.max(0,requiredMatches-totalCapacity)
    const averageSlots=fields.length?dailySlots/fields.length:0
    const minimumFields=availableDays&&averageSlots?Math.ceil(requiredMatches/(availableDays*averageSlots)):0
    const minimumDays=dailySlots?Math.ceil(requiredMatches/dailySlots):0
    return { fieldFormat,label:fieldFormatLabel(fieldFormat),requiredMatches,fieldCount:fields.length,dailySlots,totalCapacity,shortage,minimumFields,minimumDays,ready:shortage===0&&fields.length>0 }
  }).sort((a,b)=>a.fieldFormat.localeCompare(b.fieldFormat))
  return { rows,missingDates,noEligibleDates:!missingDates&&availableDays===0,ready:!missingDates&&availableDays>0&&rows.length>0&&rows.every(row=>row.ready),requiredMatches:rows.reduce((sum,row)=>sum+row.requiredMatches,0),totalCapacity:rows.reduce((sum,row)=>sum+row.totalCapacity,0),availableDays }
}
const capacityAudit = computed(() => buildCapacityAudit(null,allCalendarDays.value.length))
function capacityRecommendation(row,audit){ const current=audit||capacityAudit.value; if(current.missingDates)return '请先设置完整的比赛开始与结束日期'; if(current.noEligibleDates)return '当前范围内没有比赛日，请先勾选比赛日'; if(!row.fieldCount)return `至少添加 ${Math.max(1,row.minimumFields)} 块${row.label}`; if(row.shortage>0)return `若保持当前比赛日，至少需要 ${Math.max(row.minimumFields,row.fieldCount+1)} 块${row.label}；或把比赛日增加到 ${row.minimumDays} 天`; return '理论容量满足；排程时继续校验球队休息与阶段依赖' }
// 未排场次筛查明细：逐组别列出尚未安排日期/时间/场地的比赛与可能原因，与容量核定同一套口径。
function buildPendingBreakdown(scope){
  const rows=[]
  for(const division of divisions.value){
    const divisionId=String(division.id)
    if(scope && !scope.has(divisionId))continue
    const pending=matches.value.filter(match=>String(match.divisionId||'default')===divisionId&&(!match.matchDate||!match.matchTime||!match.venue)).length
    if(!pending)continue
    const label=fieldFormatLabel(matchFormat(division))
    const fields=config.venueResources.filter(item=>item.fieldFormat===matchFormat(division)).length
    const reasons=[]
    if(!fields)reasons.push(`无${label}场地`)
    else{ const shortage=capacityForDivision(division).shortage; if(shortage>0)reasons.push(`理论容量缺${shortage}场`) }
    rows.push({ divisionId,name:division.name||'未命名组别',formatLabel:label,pending,reasons })
  }
  return rows
}
const capacityAuditBreakdown = computed(() => buildPendingBreakdown(null))
const autoScopeBreakdown = computed(() => buildPendingBreakdown(new Set(autoScopeDivisionIds.value.map(String))))
const autoDialogVisible = ref(false)
const autoScopeDivisionIds = ref([])
const autoScopeDates = ref([])
const autoPendingDivisions = computed(() => divisions.value.map(division => ({ id:String(division.id),name:division.name,formatLabel:fieldFormatLabel(matchFormat(division)),total:matchCountForDivision(division.id),pending:pendingCountForDivision(division.id) })).filter(row => row.total > 0))
const autoCalendarTiles = computed(() => allCalendarDays.value.map(day => ({ date:day.date,dayOfMonth:Number(day.date.slice(8,10)),weekdayShort:day.weekday.slice(1) })))
const autoScopeDateSet = computed(() => new Set(autoScopeDates.value))
const autoScopeMatchCount = computed(() => { const scope=new Set(autoScopeDivisionIds.value.map(String)); return matches.value.filter(match => scope.has(String(match.divisionId || 'default'))).length })
const autoScopeAudit = computed(() => buildCapacityAudit(autoScopeDivisionIds.value,autoScopeDates.value.length,false))
// 所选范围内已发布日程或已进入比赛执行的场次数量：>0 时不能整组重排（正式引擎会拒绝），改为只补排未排场次
const autoScopeLockedCount = computed(() => { const scope=new Set(autoScopeDivisionIds.value.map(String)); return matches.value.filter(match => { if(!scope.has(String(match.divisionId || 'default'))) return false; return Boolean(match.executionSnapshot || match.schedulePublished || ['ongoing','live','finished','completed'].includes(String(match.status || '').toLowerCase())) }).length })
const autoScopeFullReflow = computed(() => autoScopeLockedCount.value === 0)
function openAutoSchedule(){ if(!matches.value.length)return ElMessage.info('当前没有可编排的比赛，请先生成对阵'); const error=validateSettings(); if(error)return ElMessage.warning(error); autoScopeDivisionIds.value=autoPendingDivisions.value.map(row => row.id); autoScopeDates.value=autoCalendarTiles.value.map(day => day.date); autoDialogVisible.value=true }
function toggleAutoScopeDate(date){ autoScopeDates.value=autoScopeDateSet.value.has(date)?autoScopeDates.value.filter(value => value !== date):[...autoScopeDates.value,date].sort() }
function toggleAllAutoScopeDates(){ autoScopeDates.value=autoScopeDates.value.length===autoCalendarTiles.value.length?[]:autoCalendarTiles.value.map(day => day.date) }
function toggleAllAutoScopeDivisions(){ autoScopeDivisionIds.value=autoScopeDivisionIds.value.length===autoPendingDivisions.value.length?[]:autoPendingDivisions.value.map(row => row.id) }
function interval(match) { const division=divisions.value.find(item=>String(item.id)===String(match.divisionId)) || {}; const policy=policyFor(division); const start=new Date(`${match.matchDate}T${match.matchTime}:00`).getTime(); const buffer=match.bufferMinutes == null ? Number(policy.turnaroundMinutes || 0) : Number(match.bufferMinutes || 0); return { start,end:start+(Number(match.durationMinutes || matchMinutes(division) || 50)+buffer)*60000 } }
const conflicts = computed(() => { const rows=[]; const grouped=new Map(); for (const match of arrangedMatches.value) { const key=`${match.matchDate}|${match.venue}`, list=grouped.get(key)||[]; list.push(match); grouped.set(key,list) } grouped.forEach(list=>{list.sort((a,b)=>interval(a).start-interval(b).start);for(let index=1;index<list.length;index+=1)if(interval(list[index-1]).end>interval(list[index]).start)rows.push({ type:'venue',matches:[list[index-1],list[index]] })});return rows })
const recognitionStats = computed(() => recognitionSummary(recognitionRows.value))
const recognitionReadyRows = computed(() => recognitionRows.value.filter(row => row.status === 'ready'))
const canConfirmRecognizedImport = computed(() => scheduleImportWriteEnabled && recognitionStats.value.ready > 0 && recognitionStats.value.plannedKnockout === 0 && recognitionStats.value.unmatched === 0 && recognitionStats.value.incomplete === 0 && !preparingKnockout.value)
const recognitionMapRows = computed(() => recognitionRows.value.filter(row => ['ready','planned_knockout'].includes(row.status) && row.matchDate && row.matchTime && row.venue))
const filteredRecognitionRows = computed(() => recognitionRows.value.filter(row => {
  if (recognitionFilter.value === 'all') return true
  if (recognitionFilter.value === 'issues') return ['unmatched','incomplete'].includes(row.status)
  return row.status === recognitionFilter.value
}))
const recognitionMapDates = computed(() => [...new Set(recognitionMapRows.value.map(row => row.matchDate).filter(Boolean))].sort())
function recognitionMapVenues(date) { return [...new Set(recognitionMapRows.value.filter(row => row.matchDate === date).map(row => row.venue).filter(Boolean))].sort((left,right) => left.localeCompare(right,'zh-CN',{ numeric:true })) }
function recognizedMapMatches(date,venue) { return recognitionMapRows.value.filter(row => row.matchDate === date && row.venue === venue).sort((left,right) => left.matchTime.localeCompare(right.matchTime) || Number(left.matchNo || 0)-Number(right.matchNo || 0)) }
function recognitionStatusLabel(status) { return ({ ready:'可映射',planned_knockout:'淘汰赛占位待创建',pairing_only:'对阵已识别',incomplete:'排期不完整',unmatched:'未匹配' })[status] || '已识别' }
function recognitionTagType(status) { return ({ ready:'success',planned_knockout:'warning',pairing_only:'warning',incomplete:'danger',unmatched:'danger' })[status] || 'info' }

async function load() { loading.value=true; try { if(isDemoMode(tournamentId)) await callFunction('generateSchedule',{action:'repairLegacyGroupPairings',tournamentId,divisionId:String(route.query.divisionId || '')}); const [event,divisionRows,matchRows]=await Promise.all([queryById('tournaments',tournamentId),queryList('divisions',{where:{tournamentId},limit:1000,silent:true}),queryList('matches',{where:{tournamentId},limit:1000,silent:true})]); tournament.value=event || {}; divisions.value=(divisionRows?.length?divisionRows:(event?.divisions || [])).map(item=>({ ...item,id:String(item._id || item.id || 'default') })); const divisionMap=new Map(divisions.value.map(item=>[String(item.id),item.name]));matches.value=(matchRows || []).filter(item=>!item.isBye && item.status!=='cancelled' && !item.demoLegacyPairing).map(item=>({ ...item,divisionName:item.divisionName || divisionMap.get(String(item.divisionId || 'default')) || '' })); await loadTeamLogos(); await loadDisciplinaryActions(); applySavedConfig(event?.scheduleDraft || event?.scheduleConfig || {}); if (!Object.keys(config.divisionPolicies).length) resetPolicies() } catch(error){ElMessage.error(error.message || '赛程加载失败')} finally{loading.value=false} }
async function loadTeamLogos() {
  teamLogoMap.value=new Map()
  const ids=[...new Set(matches.value.flatMap(match=>[match.homeTeamId,match.awayTeamId].filter(Boolean).map(String)))]
  const results=await Promise.allSettled(ids.map(async id=>[id,crestSources(await queryById('teams',id))]))
  teamLogoMap.value=new Map(results.filter(result=>result.status==='fulfilled').map(result=>result.value))
  if(results.some(result=>result.status==='rejected'))console.warn('部分球队队徽资料暂未读取，保留比赛快照队徽')
}
async function loadDisciplinaryActions() {
  try {
    const rows = await queryList('disciplinary_actions',{where:{tournamentId,status:'effective'},limit:500,silent:true,throwOnError:true})
    disciplinaryActions.value = (rows || []).filter(row => row && String(row.status || '')==='effective')
    disciplinaryLoadFailed.value = false
  } catch(error) {
    disciplinaryActions.value = []
    const message = String(error && (error.message || error.errMsg) || '')
    disciplinaryLoadFailed.value = !/not exist|collection_not_exist|resourcenotfound|-502005/i.test(message)
    if (disciplinaryLoadFailed.value) console.warn('追加处罚读取失败',error)
  }
}
function applySavedConfig(saved) { const source=saved && typeof saved==='object'?saved:{}; config.schemaVersion=2; config.startDate=source.startDate || tournament.value.startDate || ''; config.endDate=source.endDate || tournament.value.endDate || config.startDate; config.matchDays=Array.isArray(source.matchDays)&&source.matchDays.length?[...source.matchDays]:[...weekDays]; config.matchDates=Array.isArray(source.matchDates)?source.matchDates.filter(value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value))):[]; config.sessionWindows=Array.isArray(source.sessionWindows)&&source.sessionWindows.length?source.sessionWindows.map(item=>({ ...item })):defaultSessions(); const resources=Array.isArray(source.venueResources)?source.venueResources:[]; config.venueResources=resources.map(item=>({ name:String(item.name || item.venue || ''),fieldFormat:String(item.fieldFormat || ''),startTime:String(item.startTime || ''),endTime:String(item.endTime || ''),sessionWindows:config.sessionWindows.map(session=>({ ...session })) })).filter(item=>item.name); config.defaultTurnaroundMinutes=Number(source.defaultTurnaroundMinutes ?? source.matchInterval ?? 10); config.timeStepMinutes=Number(source.timeStepMinutes || 5); selectedKickoffTimes.value=configuredKickoffTimes({...source,sessionWindows:config.sessionWindows});kickoffPeriodEnabled.value=source.kickoffPeriods || Object.fromEntries(kickoffPeriods.map(period=>[period.key,config.sessionWindows.find(session=>session.key===period.key)?.enabled ?? period.key!=='evening']));config.kickoffTimes=[...selectedKickoffTimes.value];config.frequencyPreset=source.frequencyPreset || 'adaptive'; config.finalStageExclusive=source.finalStageExclusive===true; config.divisionPolicies=JSON.parse(JSON.stringify(source.divisionPolicies || {})) }
function payloadConfig() { const times=selectedKickoffTimes.value.length?selectedKickoffTimes.value:allKickoffTimes.value; return { ...config,kickoffTimes:times,kickoffPeriods:{...kickoffPeriodEnabled.value},matchDurations:Object.fromEntries(divisions.value.map(division=>[division.id,matchMinutes(division)])),sessionWindows:config.sessionWindows.map(item=>({ ...item })),venueResources:config.venueResources.map(item=>({ name:item.name.trim(),fieldFormat:item.fieldFormat,startTime:item.startTime || '',endTime:item.endTime || '',sessionWindows:config.sessionWindows.map(session=>({ ...session })),kickoffTimes:times })),venues:config.venueResources.map(item=>item.name.trim()).filter(Boolean),generationMode:'joint' } }
function validateSettings() { if(!selectedKickoffTimes.value.length)return '请至少输入一个开赛时间';if(!config.startDate||!config.endDate||config.startDate>config.endDate)return '请设置有效的比赛周期';if(!config.matchDates.length)return '请在比赛周期内勾选至少一个比赛日';if(!enabledSessions.value.length)return '请至少开放一个时段';if(!config.venueResources.length)return '请至少添加一块场地';if(config.venueResources.some(item=>!item.name.trim()||!item.fieldFormat))return '请填写完整的场地名称和制式';if(new Set(config.venueResources.map(item=>item.name.trim())).size!==config.venueResources.length)return '场地名称不能重复';const overlapError=validateKickoffOverlap();if(overlapError)return overlapError;return '' }
// 开赛点间隔校验：手工写的开赛时间间隔必须 ≥ 比赛时长 + 转场时间，否则前一场还没结束
function validateKickoffOverlap(){ const times=[...selectedKickoffTimes.value].sort(); if(times.length<2)return ''; const minGap=Math.max(...divisions.value.map(d=>matchMinutes(d)||50),0)+Number(config.defaultTurnaroundMinutes||0); for(let i=1;i<times.length;i+=1){ const gap=minutes(times[i])-minutes(times[i-1]); if(gap<minGap)return `开赛点 ${times[i-1]} 与 ${times[i]} 间隔仅 ${gap} 分钟，小于最小间隔 ${minGap} 分钟（比赛时长 ${Math.max(...divisions.value.map(d=>matchMinutes(d)||50),0)} + 转场 ${config.defaultTurnaroundMinutes}），前一场还没结束` } return '' }
async function saveSettings() { const error=validateSettings();if(error)return ElMessage.warning(error);savingSettings.value=true;try{const result=await callFunction('generateSchedule',{action:'saveDraft',tournamentId,scheduleConfig:payloadConfig()});if(!result?.success)throw new Error(result?.message || '保存失败');tournament.value={...tournament.value,scheduleDraft:payloadConfig()};selectedDate.value=calendarDays.value[0]?.date || selectedDate.value;pendingDrawerOpen.value=true;ElMessage.success('赛事日历已创建');setView('map')}catch(error){ElMessage.error(error.message || '赛程设置保存失败')}finally{savingSettings.value=false} }
// 手动加赛（＋场次）：从组别已审核球队中选双方，直接写入 matches，与旧版赛程页同一链路。
const manualAddVisible=ref(false),savingManualMatch=ref(false),manualTeams=ref([])
const manualForm=reactive({divisionId:'',homeTeamId:'',awayTeamId:'',matchDate:'',matchTime:'09:00',venue:'',roundName:''})
function openManualAdd(){ if(!divisions.value.length)return ElMessage.info('当前赛事没有组别，请先创建组别'); manualForm.divisionId=String(divisionFilter.value!=='all'?divisionFilter.value:divisions.value[0].id); manualForm.homeTeamId='';manualForm.awayTeamId=''; manualForm.matchDate=selectedDate.value || config.matchDates[0] || ''; manualForm.matchTime='09:00'; manualForm.venue=config.venueResources[0]?.name || ''; manualForm.roundName=''; manualAddVisible.value=true; loadManualTeams() }
async function loadManualTeams(){ manualTeams.value=[]; if(!manualForm.divisionId)return; try{ const rows=await queryList('tournament_teams',{where:{tournamentId,divisionId:manualForm.divisionId},limit:500,silent:true}); manualTeams.value=(rows||[]).filter(row=>['approved','confirmed'].includes(String(row.status||''))).map(row=>({teamId:String(row.teamId||row._id),teamName:row.teamName||row.name||''})).filter(row=>row.teamId&&row.teamName) }catch(error){ manualTeams.value=[] } }
async function saveManualMatch(){ const f=manualForm; if(!f.divisionId)return ElMessage.warning('请选择组别'); if(!f.homeTeamId||!f.awayTeamId)return ElMessage.warning('请选择主队和客队'); if(f.homeTeamId===f.awayTeamId)return ElMessage.warning('主队和客队不能相同'); if(!f.venue||!f.venue.trim())return ElMessage.warning('请选择或填写场地'); if(!f.matchDate||!f.matchTime)return ElMessage.warning('请选择比赛日期和开赛时间'); const division=divisions.value.find(item=>String(item.id)===String(f.divisionId))||{}; const home=manualTeams.value.find(item=>item.teamId===f.homeTeamId),away=manualTeams.value.find(item=>item.teamId===f.awayTeamId); savingManualMatch.value=true; try{ await addRecord('matches',{tournamentId,divisionId:f.divisionId,divisionName:division.name||'',matchFormat:matchFormat(division),scheduleType:tournament.value.tournamentType||'',phase:'group',roundName:String(f.roundName||'').trim()||'手动添加',matchDate:f.matchDate,matchTime:f.matchTime,venue:String(f.venue).trim(),homeTeamId:f.homeTeamId,homeTeamName:home?.teamName||'',awayTeamId:f.awayTeamId,awayTeamName:away?.teamName||'',homeScore:0,awayScore:0,status:'scheduled',statusText:'未开始',isBye:false,createTime:new Date(),updateTime:new Date()}); manualAddVisible.value=false; ElMessage.success('比赛已添加'); await load() }catch(error){ ElMessage.error(error.message||'添加比赛失败') } finally{ savingManualMatch.value=false } }
async function runAutoSchedule() {
  if(!autoScopeDivisionIds.value.length)return ElMessage.warning('请至少勾选一个组别')
  if(!autoScopeDates.value.length)return ElMessage.warning('请至少勾选一个比赛日')
  if(!autoScopeAudit.value.rows.length)return ElMessage.warning('所选范围内没有可编排的比赛')
  if(!autoScopeAudit.value.ready)return ElMessage.error('所选范围的赛制核定不通过：请按核定建议增加场地或比赛日，或缩小组别范围后再排程')
  autoScheduling.value=true
  try {
    const base=payloadConfig()
    await callFunction('generateSchedule',{action:'saveDraft',tournamentId,scheduleConfig:base})
    // 只编排本次勾选的范围：组别由 divisionIds 限定，比赛日由 matchDates 限定（正式引擎按 matchDates 判定合法比赛日）。
    const scopedConfig={...base,matchDates:[...autoScopeDates.value],matchDays:[]}
    const result=await callFunction('generateSchedule',{action:'scheduleExistingPairings',tournamentId,divisionIds:[...autoScopeDivisionIds.value],scheduleConfig:scopedConfig,fullReflow:autoScopeFullReflow.value},120000)
    if(!result?.success)throw new Error(result?.message || '自动排程失败')
    autoDialogVisible.value=false
    ElMessage.success(result.message)
    await load()
  } catch(error) { ElMessage.error({message:error.message || '自动排程失败',duration:6500}) }
  finally { autoScheduling.value=false }
}

const placingMatchId=ref('')
// HTML5 drop 事件在本页拖拽中不稳定（dragover 期间重渲染 + dropEffect 序列问题，Chrome 下常态丢失），
// 且 DnD 拖拽期间浏览器不派发 mouseup，无法靠坐标兜底。因此以 dragend 兜底：drop 未处理时，
// 放到“最后悬停的格子”（dragover 持续触发，鼠标位置始终可知）；Esc 可取消拖拽。
const dropHandled=ref(false)
function onDragKeydown(event){if(event.key==='Escape'&&draggedMatchId.value){dropHandled.value=true}}
function startDrag(match,event) {
  draggedMatchId.value=String(match._id);hoveredDropSlot.value=''
  dropHandled.value=false
  dragHoverPos.value={x:0,y:0}
  window.addEventListener('keydown',onDragKeydown)
  window.getSelection()?.removeAllRanges()
  if(event?.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-sxf-match-id',String(match._id));event.dataTransfer.setData('text/plain',String(match._id))}
}
const dragHoverPos=ref({x:0,y:0})
function finishDrag(){
  const matchId=draggedMatchId.value
  window.removeEventListener('keydown',onDragKeydown)
  // 幽灵 dragleave 可能提前清空悬停高亮，松手位置以最后一次 dragover 的坐标反查为准。
  if(matchId && !dropHandled.value){
    let venue='',time=''
    const el=document.elementFromPoint(dragHoverPos.value.x,dragHoverPos.value.y)
    const cell=el && el.closest ? el.closest('td[data-drop-venue]') : null
    if(cell){venue=cell.dataset.dropVenue;time=cell.dataset.dropTime}
    else if(hoveredDropSlot.value){[venue,time]=hoveredDropSlot.value.split('|')}
    const match=matches.value.find(item=>String(item._id)===String(matchId))
    if(venue && time && match){
      savePlacement(match,venue,time,'drag')
    }
  }
  dropHandled.value=false
  draggedMatchId.value='';hoveredDropSlot.value=''
}
function hoverDropSlot(venue,time,event){if(event&&event.preventDefault)event.preventDefault();if(!draggedMatchId.value)return;if(event.clientX||event.clientY)dragHoverPos.value={x:event.clientX,y:event.clientY};const divisionId=String(draggedMatch()?.divisionId || '');const blocked=Boolean(slotBlockInfo(venue,time,divisionId)||slotFormatMessage(venue,divisionId));if(blocked){hoveredDropSlot.value='';if(event.dataTransfer)event.dataTransfer.dropEffect='none';return}hoveredDropSlot.value=`${venue}|${time}`;if(event.dataTransfer)event.dataTransfer.dropEffect='move'}
function notifyDropMiss(){if(draggedMatchId.value)ElMessage.warning('请松手到场地时间格内')}
function togglePlace(match){placingMatchId.value=placingMatchId.value===String(match._id)?'':String(match._id)}
const dragPlaceDivisionId=computed(()=>{const id=placingMatchId.value||draggedMatchId.value;if(!id)return '';const match=matches.value.find(item=>String(item._id)===String(id));return String(match?.divisionId || '')})
function formatBlockedFor(venueName){return Boolean(dragPlaceDivisionId.value)&&Boolean(slotFormatMessage(venueName,dragPlaceDivisionId.value))}
async function savePlacement(match,venue,time,mode){
  // 统一放置保存：校验与保存全部包进 try，任何异常都给出可见报错（不再静默失败）。
  try{
    if(!selectedDate.value){ElMessage.warning('请先选择比赛日');return}
    const divisionId=String(match.divisionId || '')
    const blockMessage=slotBlockMessage(venue,time,divisionId)
    if(blockMessage){ElMessage.warning(blockMessage);return}
    const formatMessage=slotFormatMessage(venue,divisionId)
    if(formatMessage){ElMessage.warning(formatMessage);return}
    dropSaving.value=true
    const row={matchId:match._id,matchDate:selectedDate.value,matchTime:time,venue}
    const preview=await assignRows([row],false,mode)
    if(!preview?.success)throw new Error((preview?.errors || []).map(item=>item?.message).filter(Boolean).join('；') || preview?.message || '排期校验失败，请刷新重试')
    const result=await assignRows([row],true,mode)
    if(!result?.success)throw new Error((result?.errors || []).map(item=>item?.message).filter(Boolean).join('；') || result?.message || '保存失败，请刷新重试')
    ElMessage.success(`第${sequenceLabel(match)}场已安排到${venue} ${time}`)
    placingMatchId.value=''
    await load()
  }catch(error){
    console.error('[排赛放置失败]',mode,venue,time,error)
    ElMessage.error({message:error.message || '无法放入该时段',duration:8000})
  }finally{dropSaving.value=false}
}
async function placeToSlot(venue,time){
  if(!placingMatchId.value || dropSaving.value)return
  const match=matches.value.find(item=>String(item._id)===String(placingMatchId.value))
  if(!match){placingMatchId.value='';return}
  await savePlacement(match,venue,time,'manual')
}
function leaveDropSlot(venue,time,event){if(!event.relatedTarget)return;if(event.currentTarget?.contains(event.relatedTarget))return;if(hoveredDropSlot.value===`${venue}|${time}`)hoveredDropSlot.value=''}
function draggedMatch() { return matches.value.find(item=>String(item._id)===draggedMatchId.value) }
async function assignRows(rows,apply=false,adjustmentType='manual') { return callFunction('generateSchedule',{action:'importScheduleAssignments',tournamentId,rows,dryRun:!apply,adjustmentType}) }
async function dropToSlot(venue,time,event) {
  dropHandled.value=true
  if(dropSaving.value){ElMessage.warning('正在保存上一场，请稍候');return}
  const droppedId=event?.dataTransfer?.getData('application/x-sxf-match-id') || event?.dataTransfer?.getData('text/plain') || draggedMatchId.value
  const match=matches.value.find(item=>String(item._id)===String(droppedId))
  if(!match){ElMessage.warning('未识别到拖拽的比赛，请重试');finishDrag();return}
  await savePlacement(match,venue,time,'drag')
  finishDrag()
}
async function dropBackToPending() { dropHandled.value=true;const match=draggedMatch();if(!match||!match.matchDate)return;try{await ElMessageBox.confirm('确定将该比赛移回待排池吗？','移回待排',{type:'warning'});const result=await callFunction('updateMatch',{matchId:match._id,data:{matchDate:'',matchTime:'',venue:'',scheduleStatus:'unassigned'},adjustmentType:'unassign'});if(!result?.success)throw new Error(result?.message);ElMessage.success('已移回待排池');await load()}catch(error){if(error!=='cancel'&&error!=='close')ElMessage.error(error.message || '操作失败')}finally{draggedMatchId.value=''} }
function openEdit(match) { editingMatch.value=match;editForm.matchDate=match.matchDate || selectedDate.value;editForm.matchTime=match.matchTime || preciseTimes.value[0] || '';editForm.venue=match.venue || compatibleVenues(match)[0]?.name || '';editVisible.value=true }
async function saveEdit() { if(!editingMatch.value||!editForm.matchDate||!editForm.matchTime||!editForm.venue)return ElMessage.warning('请填写完整排期');savingAssignment.value=true;try{const rows=[{matchId:editingMatch.value._id,...editForm}];const preview=await assignRows(rows,false,'manual');if(!preview?.success)throw new Error(preview?.errors?.[0]?.message || preview?.message);const result=await assignRows(rows,true,'manual');if(!result?.success)throw new Error(result?.message);editVisible.value=false;ElMessage.success('排期已保存');await load()}catch(error){ElMessage.error(error.message || '保存失败')}finally{savingAssignment.value=false} }

function arrangementText(value) { return value?.matchDate ? `${value.matchDate} ${value.matchTime} · ${value.venue}` : '待排' }
function downloadScheduleWorkbook(XLSX,book,filename) {
  if(scheduleDownload.value) URL.revokeObjectURL(scheduleDownload.value.url)
  const bytes=XLSX.write(book,{bookType:'xlsx',type:'array'})
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))
  scheduleDownload.value={url,filename}
  const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove()
}
onBeforeUnmount(()=>{if(scheduleDownload.value)URL.revokeObjectURL(scheduleDownload.value.url)})
async function exportTemplate(mode='pairing') {
  if(exportingSchedule.value)return
  if(!matches.value.length)return ElMessage.warning('当前没有可导出的对阵')
  exportingSchedule.value=mode
  try {
    const {buffer,filename}=await createScheduleTemplateWorkbook({tournament:tournament.value,matches:view.value==='workbench'?workbenchMatches.value:matches.value,divisionName:'全部组别',stageLabel:match=>match.phase==='group' || match.stage==='group'?'小组赛':match.roundName || match.scheduleStageName || '联赛',teamName:teamLabel})
    if(scheduleDownload.value)URL.revokeObjectURL(scheduleDownload.value.url)
    const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));scheduleDownload.value={url,filename};const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();ElMessage.success('赛程表已生成');return
  } catch(error) { ElMessage.error(error.message || '生成失败，请重试') } finally { exportingSchedule.value='' }
}
async function readImportFile(event) {
  const file=event.target.files?.[0];event.target.value='';if(!file)return
  try {
    const module=await import('xlsx'),XLSX=module.default||module
    const book=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true})
    const sourceRows=[]
    for(const name of book.SheetNames) {
      if(name.startsWith('_') || book.Workbook?.Sheets?.find(sheet=>sheet.name===name)?.Hidden)continue
      const extracted=extractScheduleRows(XLSX,book.Sheets[name])
      if(!extracted.error)sourceRows.push(...extracted.rows.map(row=>({...row,sourceSheet:name})))
    }
    if(!sourceRows.length)throw new Error('文件中没有可识别的赛程工作表')
    recognitionSourceRows.value=sourceRows
    recognitionRows.value=recognizeScheduleRows(recognitionSourceRows.value,matches.value,config.venueResources)
    recognitionFilter.value='all';importFileName.value=file.name;importPreview.value={};importRows.value=[]
    if(!recognitionRows.value.length)throw new Error('文件中没有可识别的比赛行')
    ElMessage.success(`已读取 ${recognitionRows.value.length} 行，匹配 ${recognitionStats.value.recognized} 场已生成对阵`)
    if(scheduleImportWriteEnabled && recognitionStats.value.plannedKnockout && !recognitionStats.value.unmatched && !recognitionStats.value.incomplete)await autoPrepareKnockoutPairings()
  } catch(error) { importFileName.value='';recognitionSourceRows.value=[];recognitionRows.value=[];ElMessage.error(error.message || '文件解析失败') }
}
function importedDivisionId(row) {
  const imported=parseDivisionAndPool(row.division).division.replace(/[\s　]/g,'')
  const matched=divisions.value.find(division=>{const actual=String(division.name || '').replace(/[\s　]/g,'');return actual===imported || actual.includes(imported) || imported.includes(actual)})
  return matched?.id || ''
}
async function autoPrepareKnockoutPairings() {
  const planned=recognitionRows.value.filter(row=>row.status==='planned_knockout')
  const divisionIds=[...new Set(planned.map(importedDivisionId).filter(Boolean))]
  if(!divisionIds.length){knockoutPrepareError.value='无法确定淘汰赛所属竞赛组别';return ElMessage.error(knockoutPrepareError.value)}
  knockoutPrepareError.value=''
  preparingKnockout.value=true
  try {
    let added=0
    for(const divisionId of divisionIds){const result=await callFunction('generateSchedule',{action:'ensureKnockoutPairings',tournamentId,divisionId});if(!result?.success)throw new Error(result?.message || '淘汰赛占位对阵生成失败');added+=Number(result.addedCount || 0)}
    await load()
    recognitionRows.value=recognizeScheduleRows(recognitionSourceRows.value,matches.value,config.venueResources)
    ElMessage.success(added ? `已生成 ${added} 场淘汰/排位赛占位对阵` : '淘汰/排位赛占位对阵已完整')
  } catch(error) { knockoutPrepareError.value=error.message || '淘汰赛占位对阵生成失败';ElMessage.error(knockoutPrepareError.value) } finally { preparingKnockout.value=false }
}
async function prepareRecognizedImport() {
  if(!recognitionReadyRows.value.length)return ElMessage.warning('当前没有可映射到地图的完整排期')
  importRows.value=recognitionReadyRows.value.map(row=>({matchId:row.matchId,matchDate:row.matchDate,matchTime:row.matchTime,venue:row.venue}))
  try { importPreview.value=await assignRows(importRows.value,false,'import');importVisible.value=true } catch(error) { ElMessage.error(error.message || '地图映射预检失败') }
}
function clearRecognition(){importFileName.value='';recognitionSourceRows.value=[];recognitionRows.value=[];importRows.value=[];importPreview.value={};recognitionFilter.value='all';knockoutPrepareError.value=''}
async function applyImport() { applyingImport.value=true;try{const result=await assignRows(importRows.value,true,'import');if(!result?.success)throw new Error(result?.message || '导入失败');const applied=Number(result.appliedCount || importRows.value.length || 0);importVisible.value=false;const firstDate=recognitionReadyRows.value[0]?.matchDate;await load();if(firstDate)selectedDate.value=firstDate;setView('map');ElMessage.success(`已将 ${applied} 场比赛导入赛事地图`)}catch(error){ElMessage.error(error.message || '导入失败')}finally{applyingImport.value=false} }
onMounted(async () => { await load();if(view.value==='workbench')await focusNextWorkbenchMatch() })
onBeforeUnmount(() => { mapResizeObserver?.disconnect(); endMapPan() })
</script>

<style scoped>
.pending-list article,.calendar-match,.pending-drag-handle{user-select:none;-webkit-user-select:none}.calendar-workspace.is-dragging{user-select:none;-webkit-user-select:none}.pending-card-footer{display:flex;align-items:center;justify-content:space-between;gap:8px}.pending-card-footer>span{font-size:12px;color:#66746b}.pending-drag-handle{cursor:grab;border:1px solid #c9dbcf;border-radius:4px;padding:4px 10px;background:#f0f7f2;color:#087b43;font-size:12px}.pending-drag-handle:active{cursor:grabbing}.calendar-board td{border:1px solid #d8e2dc!important;position:relative;min-width:180px}.calendar-board td.drop-hover{background:#e1f5e7!important;box-shadow:inset 0 0 0 3px #159447}.calendar-board .drop-hint{display:flex!important;min-height:58px;align-items:center;justify-content:center;flex-direction:column;gap:6px;border:1px dashed #ccdad1;border-radius:5px;padding:8px;pointer-events:none}.calendar-board .drop-hint b{font-size:12px;font-weight:500;color:#819387}.calendar-board .drop-hint span{font-size:12px;color:#657d6e}.calendar-board td.drop-hover .drop-hint{border-color:#159447}.calendar-board td.drop-hover .drop-hint span{color:#087b43;font-weight:600}

.kickoff-period-switches{display:flex;gap:28px;margin-top:18px}.kickoff-period-switches label{display:flex;align-items:center;gap:8px}.kickoff-option-row{display:flex;align-items:flex-start;gap:14px}.kickoff-option-row>strong{min-width:32px;padding-top:9px;font-size:13px}.kickoff-option-row :deep(.el-checkbox-group){display:flex;flex-wrap:wrap;gap:6px}.kickoff-option-row :deep(.el-checkbox-button__inner){border:1px solid #dce5df!important;border-radius:4px!important;box-shadow:none!important;padding:9px 12px}.kickoff-empty{color:#66746b;font-size:13px}.kickoff-time-editor{display:grid;gap:8px;margin-top:18px}.kickoff-time-editor>label{font-weight:600}.kickoff-time-editor>div{display:flex;gap:8px;flex-wrap:wrap}.kickoff-error{color:#c53d3d;font-size:13px}
.kickoff-auto-chips{display:flex;flex-wrap:wrap;gap:6px}
.kickoff-chip{display:inline-block;padding:2px 9px;border-radius:5px;background:#e8f6ee;color:#087b43;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;line-height:20px}
.kickoff-hint{margin:2px 0 0;color:#7b877f;font-size:12px;line-height:1.7}
.session-editor{display:flex;flex-direction:column;gap:10px;border:1px solid #e4ece6;border-radius:8px;padding:12px 14px;background:#fbfdfb}
.session-editor-title{display:flex;flex-direction:column;gap:2px}
.session-editor-title span{color:#7b877f;font-size:12px}
.session-row{display:flex;align-items:center;gap:12px}
.session-row strong{width:36px}
.session-row i{color:#93a09a;font-style:normal}
.session-row small{margin-left:auto;color:#8a978f;font-size:12px}
.capacity-pending-list{margin-top:14px;border:1px dashed #d8e4da;border-radius:8px;padding:12px 14px;background:#fdfefd}
.capacity-pending-list header{display:flex;flex-direction:column;gap:2px;margin-bottom:8px}
.capacity-pending-list header span{color:#7b877f;font-size:12px}
.capacity-pending-list ul{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}
.capacity-pending-list li{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 10px;border-radius:6px;background:#f4f8f4}
.capacity-pending-list li b{display:flex;align-items:center;gap:6px;font-size:13px}
.capacity-pending-list li b small{color:#93a09a;font-weight:400}
.capacity-pending-list li span{font-size:12px;color:#5c6a61}
.capacity-pending-list li em{font-style:normal;color:#c2492f;font-weight:600;margin-right:4px}
.capacity-pending-list.compact{padding:8px 10px}
.capacity-pending-list.compact header strong{font-size:12px}
.venue-settings-table td{vertical-align:top}
.venue-settings-table th:nth-child(1),.venue-settings-table td:nth-child(1){min-width:160px}
.venue-settings-table th:nth-child(2),.venue-settings-table td:nth-child(2){min-width:130px}
.venue-settings-table :deep(.el-select){width:100%;min-width:120px}
.venue-kickoff-cell{max-width:380px}
.venue-kickoff-cell .venue-step{display:block;margin-top:6px;color:#8a958d;font-size:11px;line-height:1.5}
.calendar-board td.slot-closed{background:#f6f7f6;cursor:not-allowed}
.calendar-board td.slot-closed.place-ready{outline:2px dashed #dde1dd;outline-offset:-3px}
.calendar-board td.slot-closed .drop-hint{border-color:#e2e6e2;background:transparent}
.calendar-board td.slot-closed .drop-hint b,.calendar-board td.slot-closed .drop-hint span{color:#b0b8b1;font-weight:500}

.calendar-board td.drop-ready{background:#f0faf3;outline:1px dashed #a5d4b3}
.calendar-board td.place-ready{background:#eefaf2;outline:2px dashed #57b57f;outline-offset:-3px;cursor:pointer}
.calendar-board td.place-ready .drop-hint{border-color:#7cc79a}
.calendar-board td.place-ready .drop-hint span{color:#0f8a4d;font-weight:600}
.calendar-board td.drop-hover{background:#dcf5e6;outline:2px solid #159447;outline-offset:-3px;box-shadow:inset 0 0 0 1px #159447}
.calendar-board td.drop-hover .drop-hint{border-color:#159447}
.calendar-board td.drop-hover .drop-hint span{color:#087b43;font-weight:600}
.calendar-board td.slot-blocked{background:repeating-linear-gradient(45deg,#f8f9f8,#f8f9f8 6px,#eef0ee 6px,#eef0ee 12px);cursor:not-allowed}
.calendar-board td.format-blocked{cursor:not-allowed}
.calendar-board td.format-blocked .drop-hint{border-color:#e8ddd0;background:#fbf7f1}
.calendar-board td.format-blocked .drop-hint b,.calendar-board td.format-blocked .drop-hint span{color:#b4551f}
.calendar-board td.slot-blocked.place-ready{outline:2px dashed #ccd3cd;outline-offset:-3px;cursor:not-allowed}
.calendar-board td.slot-blocked .drop-hint{border-color:#d9ded9;background:transparent}
.calendar-board td.slot-blocked .drop-hint b,.calendar-board td.slot-blocked .drop-hint span{color:#9aa49c;font-weight:500}.pending-list article[draggable="true"]{cursor:grab}.pending-list article[draggable="true"]:active{cursor:grabbing}.schedule-download-link{display:block;margin:10px 0;color:#087b43;font-size:13px;overflow-wrap:anywhere}.workbench-entry-actions{display:flex;justify-content:flex-end;gap:8px;margin:0 0 12px;flex-wrap:wrap}.workbench-entry-actions :deep(.el-button + .el-button){margin-left:0}

.schedule-v2{min-height:100vh;padding:0 14px 70px;color:#17251d;background:#f6f8f6}.page-header{display:flex;min-height:84px;align-items:center;justify-content:space-between;border-bottom:1px solid #dfe6e1}.page-header span{color:#77827b;font-size:12px}.page-header h1{margin:5px 0 0;font-size:28px}.event-context{display:flex;align-items:center;gap:12px}.primary-nav{display:flex;gap:28px;border-bottom:1px solid #dfe6e1;background:#fff}.primary-nav button{height:58px;padding:0 4px;border:0;border-bottom:3px solid transparent;background:none;font-size:16px;cursor:pointer}.primary-nav button.active{border-color:#087b43;color:#087b43;font-weight:700}.settings-intro,.settings-card,.map-summary,.map-toolbar,.calendar-workspace,.capacity-bar,.import-hero,.import-guide,.recognition-summary,.recognition-card,.import-empty,.import-confirm-bar{margin-top:16px;border:1px solid #dce4df;border-radius:9px;background:#fff}.settings-intro{display:flex;align-items:center;justify-content:space-between;padding:18px}.settings-intro h2,.settings-card h2{margin:0;font-size:19px}.settings-intro p,.settings-card header span{margin:5px 0 0;color:#748078;font-size:13px}.settings-card{padding:18px}.settings-card>header{display:flex;align-items:center;justify-content:space-between;margin-bottom:15px}.settings-grid{display:grid;grid-template-columns:1.4fr .8fr 1fr;gap:16px}.settings-grid label>span{display:block;margin-bottom:7px;font-weight:650}.settings-grid label>small{margin-left:6px}.settings-grid .weekdays{grid-column:1/-1}.date-range{display:flex;align-items:center;gap:8px}.date-range i{font-style:normal;color:#7d8881}.session-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:17px}.session-grid article{display:grid;grid-template-columns:40px 45px 1fr 18px 1fr;align-items:center;gap:7px;padding:11px;border:1px solid #e0e7e2;border-radius:7px}.session-grid article.disabled{opacity:.5;background:#f4f6f5}.settings-table,.division-policy-table table{width:100%;border-collapse:collapse}.settings-table th,.settings-table td,.division-policy-table th,.division-policy-table td{padding:10px;border-bottom:1px solid #e8ede9;text-align:left}.settings-table th,.division-policy-table th{color:#68766d;font-size:12px}.settings-table .el-select,.division-policy-table .el-input-number{width:100%}.empty-cell{text-align:center!important;color:#879189}.division-policy-table{overflow-x:auto}.division-policy-table table{min-width:1050px}.division-policy-table small{margin-left:3px;color:#7b867f}.capacity-bar{position:sticky;bottom:10px;z-index:5;display:flex;align-items:center;gap:12px;padding:14px 18px;box-shadow:0 8px 30px rgba(31,58,42,.12)}.capacity-bar>div{display:flex;flex:1;flex-direction:column;gap:4px}.capacity-bar span{color:#6e7a72;font-size:13px}.calendar-empty{display:grid;min-height:520px;place-items:center;align-content:center;gap:12px;text-align:center}.calendar-empty>.el-icon{color:#087b43;font-size:56px}.calendar-empty h2,.calendar-empty p{margin:0}.calendar-empty p{color:#718078}.map-summary{display:flex;align-items:center;gap:22px;padding:13px 16px}.map-summary span{font-size:13px}.map-summary b{margin-right:4px;font-size:22px}.map-summary .pending b{color:#c67a00}.map-summary .danger b,.danger{color:#c4322c}.map-summary i{flex:1}.hidden-input{display:none}.map-toolbar{display:flex;align-items:center;gap:14px;padding:10px 14px}.map-toolbar>.el-select{width:180px}.date-tabs{display:flex;flex:1;gap:5px;overflow-x:auto}.date-tabs button{flex-shrink:0;white-space:nowrap;min-width:76px;padding:6px 8px;border:1px solid #dce4df;border-radius:6px;background:#fff;cursor:pointer}.date-tabs button.active{border-color:#087b43;color:#087b43;background:#edf7f1}.date-tabs strong,.date-tabs small{display:block}.calendar-workspace{display:grid;grid-template-columns:270px minmax(0,1fr);min-height:620px;overflow:hidden}.pending-pool{border-right:1px solid #e0e7e2}.pending-pool>header,.calendar-board>header{display:flex;align-items:center;justify-content:space-between;padding:14px;border-bottom:1px solid #e3e9e5}.pending-pool h2{margin:0;font-size:17px}.pending-pool>p{margin:10px 14px;color:#748178;font-size:12px}.pending-list{max-height:750px;overflow:auto;padding:0 10px 12px}.pending-list article,.calendar-match{margin-top:8px;padding:10px;border:1px solid #dce5df;border-left:3px solid #087b43;border-radius:6px;background:#fff;cursor:grab}.pending-list article small,.pending-list article span{display:block;color:#748078;font-size:11px}.pending-list article strong,.calendar-match>strong{display:flex;align-items:center;justify-content:space-between;gap:5px;margin:7px 0;font-size:13px}.pending-list em,.calendar-match em{color:#909b94;font-size:10px;font-style:normal}.calendar-board{min-width:0}.calendar-board>header small{color:#748078}.calendar-scroll{max-height:750px;overflow:auto}.calendar-scroll table{width:100%;min-width:850px;border-collapse:separate;border-spacing:0}.calendar-scroll th,.calendar-scroll td{min-width:180px;height:78px;padding:7px;border-right:1px solid #e3e9e5;border-bottom:1px solid #e3e9e5;vertical-align:top}.calendar-scroll th:first-child{position:sticky;left:0;z-index:2;min-width:76px;background:#f7f9f7}.calendar-scroll thead th{position:sticky;top:0;z-index:3;background:#f2f6f3}.calendar-scroll th strong,.calendar-scroll th small{display:block}.calendar-scroll th small{margin-top:4px;color:#7b877f;font-size:11px}.drop-hint{display:grid;height:62px;place-items:center;color:#a1aaa4;font-size:11px}.calendar-match{margin:0;border-left-color:#23845a}.calendar-match header,.calendar-match footer{display:flex;justify-content:space-between;color:#718078;font-size:10px}.calendar-match>strong{font-size:12px}.edit-summary{display:flex;flex-direction:column;gap:7px;margin-bottom:15px;padding:12px;border-radius:6px;background:#f2f7f3}.import-hero{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:20px}.import-hero h2,.recognition-card h2{margin:0;font-size:20px}.import-hero p{margin:6px 0 0;color:#6e7b73}.import-hero>div:last-child{display:flex;gap:10px}.import-guide{display:grid;grid-template-columns:repeat(4,1fr);gap:0;padding:15px}.import-write-gate{margin-top:16px}.import-guide article{display:flex;align-items:center;gap:10px;padding:6px 16px;border-right:1px solid #e2e8e4}.import-guide article:last-child{border-right:0}.import-guide article>b{display:grid;width:28px;height:28px;place-items:center;border-radius:50%;color:#fff;background:#087b43}.import-guide article span{display:flex;flex-direction:column;gap:3px}.import-guide small,.recognition-card header span{color:#748078}.recognition-summary{display:flex;align-items:center;gap:22px;padding:14px 18px}.recognition-summary>div{display:flex;min-width:240px;flex:1;flex-direction:column;gap:3px}.recognition-summary>div span{color:#718078;font-size:12px}.recognition-summary>span{white-space:nowrap}.recognition-summary b{margin-right:4px;font-size:22px}.recognition-summary .ready b{color:#087b43}.recognition-summary .planned b{color:#c67a00}.import-confirm-bar{position:sticky;bottom:10px;z-index:6;display:flex;align-items:center;gap:12px;padding:14px 18px;box-shadow:0 8px 30px rgba(31,58,42,.14)}.import-confirm-bar>div{display:flex;flex:1;flex-direction:column;gap:4px}.import-confirm-bar span{color:#6e7a72;font-size:13px}.recognition-card{padding:17px}.recognition-card>header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:12px}.recognition-card>header h2{margin-bottom:4px}.recognition-table-wrap{max-height:480px;overflow:auto}.recognition-table{width:100%;min-width:1120px;border-collapse:collapse}.recognition-table th{position:sticky;top:0;z-index:1;padding:10px;background:#f1f5f2;color:#627168;text-align:left;font-size:12px}.recognition-table td{padding:10px;border-bottom:1px solid #e5ebe7;vertical-align:top;font-size:12px}.recognition-table td:nth-child(4){min-width:240px}.recognition-table td:nth-child(4) strong{display:inline}.recognition-table em,.recognized-map em{margin:0 6px;color:#8a968e;font-size:10px;font-style:normal}.recognition-table td:nth-child(5) small{display:block;margin-top:3px;color:#77837b}.recognized-map>article{margin-top:12px;border:1px solid #e1e8e3;border-radius:7px}.recognized-map>article>header{display:flex;justify-content:space-between;padding:10px 13px;background:#f2f7f3}.recognized-map-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;padding:10px}.recognized-map-grid>section{padding:10px;border:1px solid #e3e9e5;border-radius:6px}.recognized-map-grid h3{margin:0 0 8px;font-size:14px}.recognized-map-grid section>div{display:grid;grid-template-columns:55px 1fr;gap:8px;padding:7px 0;border-top:1px solid #edf1ee}.recognized-map-grid section>div:first-of-type{border-top:0}.recognized-map-grid span{display:flex;flex-direction:column;gap:2px}.recognized-map-grid small{color:#738078}.import-empty{display:grid;min-height:220px;place-items:center;align-content:center;gap:12px;text-align:center}.import-empty>.el-icon{color:#087b43;font-size:52px}.import-empty h2,.import-empty p{margin:0}.import-empty p{max-width:650px;color:#718078}.import-summary{display:flex;gap:30px;padding:14px;background:#f3f7f4}.import-summary b{margin-right:4px;font-size:24px}.import-errors{max-height:300px;overflow:auto;color:#b42318}.import-changes{width:100%;margin-top:14px;border-collapse:collapse}.import-changes th,.import-changes td{padding:9px;border-bottom:1px solid #e5ebe7;text-align:left}@media(max-width:1000px){.settings-grid,.session-grid{grid-template-columns:1fr}.settings-grid .weekdays{grid-column:auto}.calendar-workspace{grid-template-columns:1fr}.pending-pool{border-right:0;border-bottom:1px solid #e0e7e2}.map-summary,.map-toolbar,.import-hero,.recognition-summary{align-items:flex-start;flex-wrap:wrap}.map-summary i{display:none}.import-guide{grid-template-columns:1fr 1fr}.import-guide article:nth-child(2){border-right:0}.import-hero>div:last-child{flex-wrap:wrap}}
.calendar-workspace.without-pending{grid-template-columns:minmax(0,1fr)}
.subview-bar{display:flex;align-items:center;gap:12px;margin-top:14px;padding-bottom:10px;border-bottom:1px solid #dfe6e1}.subview-bar span{color:#66746b;font-size:13px}.map-summary{flex-wrap:wrap;gap:16px}.map-summary .played b{color:#087b43}.map-summary .remaining b{color:#c67a00}.match-state{display:inline-flex;align-items:center;gap:5px}.match-state i{width:7px;height:7px;border-radius:50%;background:#87928b}.match-state.live i{background:#d92d20}.match-state.completed i{background:#159447}.match-state.supplement i{background:#e77710}.match-state.review i{background:#c59100}.match-state.archived i{background:#557064}.calendar-match{cursor:pointer;transition:border-color .15s ease,box-shadow .15s ease}.calendar-match:hover{border-color:#83ad94;box-shadow:0 3px 10px rgba(31,58,42,.1)}.calendar-match.state-scheduled{border-left-color:#a7b0aa;background:#fff}.calendar-match.state-live{border-left-color:#d92d20;background:#fff5f3}.calendar-match.state-completed{border-left-color:#159447;background:#eef9f1}.calendar-match.state-supplement{border-left-color:#e77710;background:#fff9f2}.calendar-match.state-review{border-left-color:#c59100;background:#fffbee}.calendar-match.state-archived{border-left-color:#718079;background:#f7f9f8}.calendar-match>strong em{min-width:34px;text-align:center}.calendar-match footer{align-items:center;margin-top:8px}.card-actions{display:flex;align-items:center;gap:5px}.card-actions button{padding:2px 5px;border:0;border-radius:3px;color:#516158;background:transparent;font-size:10px;cursor:pointer}.card-actions button:hover{color:#087b43;background:#eaf4ee}.drag-handle{cursor:grab!important}.pending-list article{cursor:pointer}
.match-sides{grid-template-columns:minmax(0,1fr) 86px minmax(0,1fr)}.match-sides>.calendar-score{display:block;min-width:86px;color:#9ca3af;font-size:28px;font-style:normal;font-variant-numeric:tabular-nums;font-weight:900;line-height:1;text-align:center;letter-spacing:.5px}.match-sides>.calendar-score.score-finished{color:#111827}.match-sides>.calendar-score.score-live{color:#d92d20}.match-sides>.calendar-score.score-upcoming{color:#9ca3af}
.match-sides{display:grid;align-items:center;gap:8px;margin:10px 0}.match-team{display:flex;min-width:0;align-items:center;gap:10px}.match-team.away{justify-content:flex-end;text-align:right}.match-team strong{overflow:hidden;color:#102e1d;font-size:18px;font-weight:800;line-height:1.35;text-overflow:ellipsis;white-space:nowrap}
.schedule-workbench{margin-top:16px;background:#fff;border:1px solid #dce4df;border-radius:8px}.workbench-controls{display:flex;align-items:center;gap:10px;padding:14px;border-bottom:1px solid #e4eae6}.workbench-controls .el-select{width:160px}.workbench-controls .el-input{width:240px}.workbench-controls>span{margin-left:auto;color:#617168;white-space:nowrap}.workbench-table-wrap{overflow-x:auto}.workbench-table{width:100%;min-width:1120px;border-collapse:collapse}.workbench-table th,.workbench-table td{padding:11px 12px;border-bottom:1px solid #edf1ee;text-align:left;white-space:nowrap}.workbench-table th{color:#64746a;background:#f6f8f6;font-size:12px;font-weight:600}.workbench-table td{font-size:13px}.workbench-table .workbench-teams{min-width:260px;white-space:normal}.workbench-actions{min-width:265px}.workbench-actions .el-button{margin:0 8px 0 0}@media(max-width:700px){.workbench-controls{flex-wrap:wrap}.workbench-controls .el-select,.workbench-controls .el-input{width:calc(50% - 5px)}.workbench-controls>span{margin-left:0}}
.assignment-summary{display:flex;flex-direction:column;gap:4px;padding:0 0 12px;border-bottom:1px solid #e3e9e5}.assignment-summary strong{font-size:15px}.assignment-summary span{color:#68776e;font-size:12px}.assignment-tabs{margin-top:10px}.assignment-form{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}.assignment-save{display:flex;justify-content:flex-end;margin-top:8px}.kit-assignment section{padding:12px 0;border-bottom:1px solid #e7ece8}.kit-assignment h3{margin:0 0 12px;font-size:14px}.kit-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.kit-fields label>span{display:block;margin-bottom:6px;color:#627168;font-size:12px}.kit-fields .el-select{width:100%}.kit-color-swatch{display:inline-block;width:14px;height:14px;margin-right:8px;border:1px solid #bfc9c2;border-radius:2px;vertical-align:-2px}@media(max-width:600px){.assignment-form,.kit-fields{grid-template-columns:1fr}}
.workbench-table tr.next-match-row{background:#edf7f0}.workbench-table tr.next-match-row td:first-child{box-shadow:inset 3px 0 #087b43}
.upload-replace{display:flex;justify-content:flex-end;margin-top:16px}.import-empty small{color:#718078;font-size:13px}
.calendar-match header{font-size:12px;gap:12px}.calendar-match header>span{min-width:0;overflow-wrap:anywhere}.calendar-match header>b{flex-shrink:0}
.assign-crew-row{display:flex;gap:10px;align-items:center}.assign-crew-row>.el-select{flex:1 1 auto;min-width:0}.assign-crew-row>.el-button{flex:0 0 auto}
</style>

<style scoped>
.referee-doc-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:12px}
.referee-doc-toolbar label{display:flex;align-items:center;gap:10px}
.referee-doc-toolbar label>span,.referee-doc-count{color:#617067;font-size:13px}
.referee-doc-progress{display:grid;grid-template-columns:1fr auto;align-items:center;gap:7px;margin:12px 0 16px;padding:10px 12px;background:#f5f8f6;border-radius:6px;color:#58675e;font-size:12px}
.referee-doc-progress .el-progress{grid-column:1/-1}
.referee-doc-list{max-height:440px;overflow:auto;border-top:1px solid #e7ede9}
.referee-doc-list article{display:grid;grid-template-columns:60px minmax(0,1fr) 100px;align-items:center;gap:14px;padding:11px 8px;border-bottom:1px solid #e7ede9}
.referee-doc-list time{font-variant-numeric:tabular-nums;font-weight:700;color:#183a27}
.referee-doc-list article>div{display:flex;min-width:0;flex-direction:column;gap:4px}
.referee-doc-list small,.referee-doc-list article>span{color:#758178;font-size:12px}
.referee-doc-list strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.referee-doc-list em{margin:0 6px;color:#89958d;font-size:11px;font-style:normal}

.calendar-workspace,.calendar-workspace.without-pending{width:100%;max-width:100%;grid-template-columns:minmax(0,1fr)}
.calendar-workspace.pending-open{grid-template-columns:280px minmax(0,1fr)}
.pending-drawer{overflow:hidden;border-right:1px solid #dce5df;background:#fff}
.pending-drawer>header h2{display:flex;align-items:center;gap:8px}
.pending-drawer .pending-list{max-height:750px}
.calendar-scroll table{width:100%;table-layout:fixed;border-spacing:0}
.calendar-scroll th,.calendar-scroll td{box-sizing:border-box;padding:8px}
.calendar-scroll th:first-child{width:96px;min-width:96px}
.calendar-scroll thead th{height:76px;vertical-align:middle}
.calendar-block-title{display:flex;align-items:center;gap:10px;padding:16px 12px 10px;background:#fbfcfb;border-top:1px solid #e3e9e5}
.calendar-block-title:first-child{border-top:0;padding-top:6px}
.calendar-block-title strong{font-size:15px;color:#17251d}
.calendar-block-title span{padding:1px 9px;border-radius:999px;background:#eef4f0;color:#4d6155;font-size:12px}
.calendar-block-title em{margin-left:auto;color:#8a958d;font-size:12px;font-style:normal}
.calendar-scroll thead th .venue-format{display:inline-block;margin-top:6px;padding:1px 9px;border-radius:999px;background:#e8f6ee;color:#087b43;font-size:12px;font-weight:600;line-height:18px;white-space:nowrap}
.calendar-board .venue-filter-hint{margin-left:8px;padding:2px 10px;border-radius:999px;background:#fff6e6;color:#a8650a;font-size:12px;font-style:normal;font-weight:600;white-space:nowrap}
.calendar-board .venue-filter-hint.is-warning{background:#fdecec;color:#b42318}
.pending-list article small .card-format{margin-left:6px;padding:0 6px;border-radius:999px;background:#e8f6ee;color:#087b43;font-size:11px;font-style:normal;font-weight:600}
.map-toolbar .matchday-toggle{flex-shrink:0;white-space:nowrap;height:auto}
.calendar-scroll tbody th,.calendar-scroll tbody td{height:128px}
.calendar-match{box-sizing:border-box;width:100%;min-width:0;min-height:112px;padding:10px 12px}
.calendar-board .drop-hint{box-sizing:border-box;min-height:112px;width:100%}
.calendar-match.other-division{opacity:.55;filter:saturate(.35)}
.match-date-tiles{position:relative;z-index:2;display:flex;flex-wrap:wrap;gap:8px;margin-top:2px}
.match-date-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:44px;height:44px;padding:0;border:1px solid #d6dce4;border-radius:8px;background:#fff;cursor:pointer;font:inherit;line-height:1.15;outline:0;-webkit-user-select:none;user-select:none;transition:border-color .15s ease,background .15s ease,box-shadow .15s ease}
.match-date-tile strong{font-size:15px;color:#1f2d3d}
.match-date-tile small{font-size:10px;color:#8a94a3}
.match-date-tile:hover{border-color:#9fb8a9;background:#f7f9f8}
.match-date-tile:focus-visible{border-color:#087b43;box-shadow:0 0 0 2px rgba(8,123,67,.18)}
.match-date-tile.active{border-color:#2e7d32;background:#2e7d32;box-shadow:none}
.match-date-tile.active:hover{border-color:#276b2a;background:#276b2a}
.match-date-tiles + small{display:block;margin-top:8px;color:#8a94a3;font-size:12px}
.match-date-tile.active strong,.match-date-tile.active small{color:#fff}
.capacity-audit.blocked{border-color:#f0d3b0;background:#fffaf3}
.capacity-audit.passed{border-color:#cbe6d6}
.capacity-audit>header h2{font-size:19px}
.capacity-format-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(248px,1fr));gap:12px;margin-top:14px}
.capacity-format-grid article{padding:14px;border:1px solid #dce5df;border-radius:8px;background:#fff}
.capacity-format-grid article.shortage{border-color:#f0c9a0;background:#fffaf3}
.capacity-format-grid article>header{display:flex;align-items:center;justify-content:space-between;gap:10px}
.capacity-format-grid article>header strong{font-size:15px}
.capacity-format-grid article>header span{color:#7b877f;font-size:12px}
.capacity-format-grid dl{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;margin:12px 0 0;padding:0}
.capacity-format-grid dl>div{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.capacity-format-grid dt{color:#748078;font-size:12px}
.capacity-format-grid dd{margin:0;font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}
.capacity-format-grid dd.danger{color:#c4322c}
.capacity-format-grid article>p{margin:11px 0 0;color:#66746b;font-size:12px;line-height:1.7}
.capacity-audit-foot{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px solid #e8ede9}
.capacity-audit-foot b{color:#087b43;font-variant-numeric:tabular-nums}
.capacity-audit-foot small{color:#7b877f;font-size:12px}
.auto-scope{display:grid;gap:16px}
.auto-scope-block{padding:14px;border:1px solid #dce5df;border-radius:8px;background:#fff}
.auto-scope-block>header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
.auto-scope-block>header span{color:#748078;font-size:12px}
.auto-scope-empty{color:#8a94a3;font-size:13px}
.auto-scope-block :deep(.el-checkbox){display:flex;align-items:flex-start;height:auto;margin:0 0 10px}
.auto-scope-block :deep(.el-checkbox__label){display:flex;flex-direction:column;gap:2px;line-height:1.4}
.auto-scope-block :deep(.el-checkbox__label small){color:#7b877f;font-size:12px}
.auto-scope-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:10px}
.auto-scope-tip{color:#8a94a3;font-size:12px}
.auto-dialog-foot{margin-right:auto;color:#8a94a3;font-size:12px}
</style>

<style scoped>
/* 比赛卡片：恢复「主队 | 比分 | 客队」横向排列（队徽-队名 左，客队右，比分局中）；
   列宽与表宽由脚本按容器宽度实时测算（正好放下 3 列），单组别与全部组别同宽 */
.calendar-scroll{cursor:grab;max-height:750px;overflow:auto}
.calendar-scroll.is-panning{cursor:grabbing;user-select:none;-webkit-user-select:none}
.calendar-scroll table{width:auto;min-width:0;table-layout:fixed}
.calendar-scroll tbody th,.calendar-scroll tbody td{height:150px}
.calendar-match{box-sizing:border-box;width:100%;min-width:0;min-height:132px;padding:12px 14px}
.calendar-board .drop-hint{box-sizing:border-box;min-height:132px}
.calendar-match .match-sides{display:grid;grid-template-columns:minmax(0,1fr) 72px minmax(0,1fr);align-items:center;gap:8px;margin:11px 0}
.calendar-match .match-team{gap:8px}
.calendar-match .match-team strong{overflow:visible;white-space:normal;word-break:break-word;font-size:16px;font-weight:700;line-height:1.3}
.calendar-match .match-sides>.calendar-score{min-width:72px;font-size:24px}
.calendar-match footer{margin-top:9px}
@media(max-width:900px){.calendar-workspace.pending-open{grid-template-columns:230px minmax(0,1fr)}}
.upload-replace{display:flex;justify-content:flex-end;margin-top:16px}.import-empty small{color:#718078;font-size:13px}
.calendar-match header{font-size:12px;gap:12px}.calendar-match header>span{min-width:0;overflow-wrap:anywhere}.calendar-match header>b{flex-shrink:0}
</style>
