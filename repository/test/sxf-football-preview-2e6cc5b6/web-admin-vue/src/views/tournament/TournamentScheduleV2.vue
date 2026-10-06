<template>
  <main class="schedule-v2" v-loading="loading">
    <header class="page-header">
      <div>
        <span>赛事空间　/　比赛管理</span>
        <h1>{{ view === 'map' ? '比赛管理' : viewTitle }}</h1>
      </div>
      <div class="event-context">
        <strong>{{ tournament.name || '当前赛事' }}</strong>
        <el-tag type="success" effect="plain">{{ divisions.length }}个组别</el-tag>
        <el-button plain @click="router.push('/tournament-space')">返回赛事空间</el-button>
      </div>
    </header>

    <section v-if="view !== 'map'" class="subview-bar">
      <el-button text @click="setView('map')"><el-icon><ArrowLeft /></el-icon>返回比赛地图</el-button>
      <span>{{ viewTitle }}</span>
    </section>

    <section v-if="view === 'workbench'" ref="workbenchRoot" class="schedule-workbench">
      <div class="workbench-controls">
        <el-select v-model="workbenchDivision" aria-label="筛选组别"><el-option label="全部组别" value="all" /><el-option v-for="division in divisions" :key="division.id" :label="division.name" :value="division.id" /></el-select>
        <el-select v-model="workbenchStatus" aria-label="筛选状态"><el-option label="全部状态" value="all" /><el-option label="待排" value="pending" /><el-option label="待开始" value="scheduled" /><el-option label="进行中" value="live" /><el-option label="已完赛" value="completed" /></el-select>
        <el-input v-model="workbenchSearch" clearable placeholder="搜索球队或场序" aria-label="搜索球队或场序" />
        <span>{{ workbenchMatches.length }} / {{ matches.length }} 场</span>
      </div>
      <div class="workbench-table-wrap">
        <table class="workbench-table"><thead><tr><th>场序</th><th>组别</th><th>比赛日期</th><th>时间</th><th>场地</th><th>对阵</th><th>状态</th><th>裁判</th><th>操作</th></tr></thead><tbody>
          <tr v-for="match in workbenchMatches" :key="match._id" :data-match-id="match._id" :class="{ 'next-match-row':String(match._id) === nextMatchId }"><td>{{ sequenceLabel(match) }}</td><td>{{ divisionName(match.divisionId) }}</td><td>{{ match.matchDate || '待排' }}</td><td>{{ match.matchTime || '—' }}</td><td>{{ match.venue || '—' }}</td><td class="workbench-teams">{{ teamLabel(match,'home') }}　vs　{{ teamLabel(match,'away') }}</td><td>{{ match.matchDate ? managementState(match).label : '待排' }}</td><td>{{ match.refereeCrew?.mainReferee?.name || '未指派' }}</td><td class="workbench-actions"><el-button link type="success" :disabled="!canAdjustSchedule(match)" @click="openEdit(match)">调时间</el-button><el-button link type="success" :disabled="!canAdjustSchedule(match)" @click="openSequenceEdit(match)">改场序</el-button><el-button link type="success" :disabled="!canAssignReferee(match)" @click="openRefereeAssignment(match,'referee')">安排裁判</el-button><el-button link type="success" :disabled="!canAssignReferee(match)" @click="openRefereeAssignment(match,'kit')">球衣颜色</el-button><el-button link @click="openMatchWorkspace(match)">详情</el-button></td></tr>
        </tbody></table>
        <el-empty v-if="!loading && !workbenchMatches.length" description="当前筛选下没有比赛" />
      </div>
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
          <label class="weekdays"><span>比赛日</span><el-checkbox-group v-model="config.matchDays"><el-checkbox v-for="day in weekDays" :key="day" :label="day">{{ day }}</el-checkbox></el-checkbox-group></label>
        </div>
        <div class="session-grid">
          <article v-for="session in config.sessionWindows" :key="session.key" :class="{ disabled:!session.enabled }">
            <el-switch v-model="session.enabled" /><strong>{{ session.label }}</strong><el-time-select v-model="session.start" start="05:00" step="00:05" end="23:55" /><span>—</span><el-time-select v-model="session.end" start="05:00" step="00:05" end="24:00" />
          </article>
        </div>
      </section>

      <section class="settings-card">
        <header><h2>场地</h2><el-button type="success" plain @click="addVenue">＋ 增加场地</el-button></header>
        <table class="settings-table"><thead><tr><th>场地名称</th><th>场地制式</th><th>可用时段</th><th></th></tr></thead><tbody><tr v-for="(venue,index) in config.venueResources" :key="index"><td><el-input v-model="venue.name" placeholder="如：1号场地" /></td><td><el-select v-model="venue.fieldFormat"><el-option v-for="option in fieldFormats" :key="option.value" :label="option.label" :value="option.value" /></el-select></td><td>{{ enabledSessionLabels }}</td><td><el-button link type="danger" @click="config.venueResources.splice(index,1)">删除</el-button></td></tr><tr v-if="!config.venueResources.length"><td colspan="4" class="empty-cell">请添加真实比赛场地</td></tr></tbody></table>
      </section>

      <section class="settings-card">
        <header><div><h2>组别策略</h2><span>默认继承公共设置，只在有特殊需求时覆盖</span></div></header>
        <div class="division-policy-table"><table><thead><tr><th>组别</th><th>制式</th><th>比赛时长</th><th>待排</th><th>场间隔</th><th>每天上限</th><th>同时段</th><th>最短休息</th><th>资源限制</th><th>容量</th></tr></thead><tbody><tr v-for="division in divisions" :key="division.id"><td><strong>{{ division.name }}</strong></td><td>{{ formatLabel(division) }}</td><td>{{ matchMinutes(division) || '待设置' }}<small v-if="matchMinutes(division)">分钟</small></td><td>{{ pendingCountForDivision(division.id) }}场</td><td><el-input-number v-model="policyFor(division).turnaroundMinutes" :min="0" :max="180" :step="5" size="small" /></td><td><el-input-number v-model="policyFor(division).maxMatchesPerDay" :min="1" :max="4" size="small" /></td><td><el-input-number v-model="policyFor(division).maxPerSession" :min="1" :max="4" size="small" /></td><td><el-input-number v-model="policyFor(division).minRestMinutes" :min="0" :max="4320" :step="30" size="small" /></td><td><el-button link type="success" @click="openPolicyLimits(division)">{{ hasPolicyLimits(division) ? '已限制' : '设置' }}</el-button></td><td><el-tag :type="capacityForDivision(division).ready ? 'success' : 'danger'">{{ capacityForDivision(division).ready ? '充足' : `缺${capacityForDivision(division).shortage}场` }}</el-tag></td></tr></tbody></table></div>
      </section>

      <section class="capacity-bar"><div><strong>全赛事 {{ matches.length }} 场</strong><span>{{ calendarDays.length }}个有效比赛日 · {{ config.venueResources.length }}块场地 · {{ totalCapacity }}场理论容量</span></div><el-button plain @click="resetPolicies">恢复自适应默认</el-button><el-button type="success" size="large" :loading="savingSettings" @click="saveSettings">保存并创建空日历</el-button></section>
    </template>

    <template v-else-if="view === 'imports'">
      <section class="import-hero">
        <div><h2>赛程导入导出</h2><p>先下载已确认对阵，可在线下填写日期、时间和场地；上传后先识别，不会直接修改赛事地图。</p></div>
        <div><el-button plain @click="exportTemplate('pairing')"><el-icon><Download /></el-icon>下载待排对阵</el-button><el-button plain @click="exportTemplate('current')"><el-icon><Download /></el-icon>下载当前赛程</el-button><el-button type="success" @click="fileInput?.click()"><el-icon><Upload /></el-icon>上传并识别赛程</el-button><input ref="fileInput" class="hidden-input" type="file" accept=".xlsx,.xls" @change="readImportFile" /></div>
      </section>

      <section class="import-guide">
        <article><b>1</b><span><strong>下载对阵</strong><small>带场序、组别和双方，日期时间留空</small></span></article>
        <article><b>2</b><span><strong>线下或线上填写</strong><small>也可上传已有赛程表</small></span></article>
        <article><b>3</b><span><strong>识别并查错</strong><small>按比赛ID、场序、组别和对阵匹配</small></span></article>
        <article><b>4</b><span><strong>写入赛事地图</strong><small>完整通过冲突检查后才保存</small></span></article>
      </section>
      <el-alert v-if="!scheduleImportWriteEnabled" class="import-write-gate" type="warning" :closable="false" title="当前测试版已开放Excel识别和地图预览；排程云函数部署后，后台会自动创建淘汰赛占位并随赛果写入实际球队。" />

      <template v-if="importFileName">
        <section class="recognition-summary">
          <div><span>已识别文件</span><strong>{{ importFileName }}</strong></div><span><b>{{ recognitionStats.total }}</b>行比赛</span><span><b>{{ recognitionStats.recognized }}</b>场已匹配</span><span class="ready"><b>{{ recognitionStats.ready + recognitionStats.plannedKnockout }}</b>场地图预览</span><span v-if="recognitionStats.plannedKnockout" class="planned"><b>{{ recognitionStats.plannedKnockout }}</b>场淘汰赛后台站位</span><span><b>{{ recognitionStats.pairingOnly }}</b>场时间待填</span><span :class="{ danger:recognitionStats.unmatched || recognitionStats.incomplete }"><b>{{ recognitionStats.unmatched + recognitionStats.incomplete }}</b>项待处理</span><el-tag v-if="recognitionStats.plannedKnockout" :type="knockoutPrepareError ? 'danger' : 'warning'" effect="plain">{{ preparingKnockout ? '后台正在自动创建占位' : knockoutPrepareError ? '自动创建失败' : scheduleImportWriteEnabled ? '等待自动创建' : '自动创建待服务部署' }}</el-tag><el-button v-else type="success" :disabled="!scheduleImportWriteEnabled || !recognitionStats.ready || recognitionStats.unmatched > 0 || recognitionStats.incomplete > 0" @click="prepareRecognizedImport">{{ scheduleImportWriteEnabled ? '映射到赛事地图' : '写入地图待开放' }}</el-button>
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

      <section v-else class="import-empty"><el-icon><Upload /></el-icon><h2>上传赛程表后查看识别结果</h2><p>兼容系统下载表，也兼容“场序、比赛日期、时间、组别、比赛对阵、场地”类型的线下Excel。</p><el-button type="success" @click="fileInput?.click()">选择Excel文件</el-button></section>
    </template>

    <template v-else-if="view === 'map'">
      <section v-if="!calendarConfigured" class="calendar-empty"><el-icon><Calendar /></el-icon><h2>先创建赛事日历</h2><p>统一设置比赛日、场地和时段，然后再手动、Excel或自动排期。</p><el-button type="success" @click="setView('settings')">进入赛程设置</el-button></section>
      <template v-else>
        <section class="map-summary"><span><b>{{ matches.length }}</b>场比赛</span><span class="played"><b>{{ playedMatches }}</b>场已进行</span><span class="remaining"><b>{{ remainingMatches }}</b>场剩余</span><i /><el-button plain @click="setView('settings')"><el-icon><Setting /></el-icon>赛程设置</el-button><el-button plain @click="setView('imports')"><el-icon><Upload /></el-icon>导入导出</el-button><el-button type="success" :loading="autoScheduling" :disabled="!pendingMatches.length" @click="autoSchedule"><el-icon><MagicStick /></el-icon>自动排程</el-button></section>

        <section class="map-toolbar"><el-select v-model="divisionFilter"><el-option label="全部组别" value="all" /><el-option v-for="division in divisions" :key="division.id" :label="division.name" :value="division.id" /></el-select><div class="date-tabs"><button v-for="day in calendarDays" :key="day.date" type="button" :class="{ active:selectedDate === day.date }" @click="selectedDate = day.date"><strong>{{ day.short }}</strong><small>{{ day.weekday }}</small></button></div><el-button plain @click="openRefereePreMatchDocs">裁判赛前文档</el-button><el-button plain @click="viewSchedule">赛程工作台</el-button></section>

        <section class="calendar-workspace" :class="{ 'without-pending': !filteredPendingMatches.length }">
          <aside v-if="filteredPendingMatches.length" class="pending-pool" @dragover.prevent @drop="dropBackToPending">
            <header><h2>待排比赛</h2><el-tag type="warning">{{ filteredPendingMatches.length }}</el-tag></header>
            <p v-if="filteredPendingMatches.length">拖到右侧场地时间格</p>
            <div class="pending-list"><article v-for="match in filteredPendingMatches" :key="match._id" draggable="true" @dragstart="startDrag(match)" @click="openEdit(match)"><small>{{ divisionName(match.divisionId) }} · {{ match.roundName || '比赛' }}</small><strong>{{ teamLabel(match,'home') }}<em>VS</em>{{ teamLabel(match,'away') }}</strong><span>第{{ sequenceLabel(match) }}场 · 点击安排</span></article><el-empty v-if="!filteredPendingMatches.length" :image-size="54" description="当前范围没有待排比赛" /></div>
          </aside>

          <div class="calendar-board"><header><div><strong>{{ selectedDateLabel }}</strong><span>{{ selectedDayMatches.length }}场</span></div><small>点击比赛进入处理；拖动手柄调整赛程</small></header><div class="calendar-scroll"><table><thead><tr><th>时间</th><th v-for="venue in config.venueResources" :key="venue.name"><strong>{{ venue.name }}</strong><small>{{ fieldFormatLabel(venue.fieldFormat) }}</small></th></tr></thead><tbody><tr v-for="time in mapTimes" :key="time"><th><strong>{{ time }}</strong><small>{{ sessionLabel(time) }}</small></th><td v-for="venue in config.venueResources" :key="`${time}-${venue.name}`" @dragover.prevent @drop="dropToSlot(venue.name,time)"><article v-for="match in matchesForCell(venue.name,time)" :key="match._id" class="calendar-match" :class="`state-${managementState(match).key}`" @click="openMatchWorkspace(match)"><header><span>{{ divisionName(match.divisionId) }}</span><b>#{{ sequenceLabel(match) }}</b></header><div class="match-sides"><span class="match-team home"><i class="team-crest"><img v-if="teamLogo(match,'home')" :src="teamLogo(match,'home')" alt="" @error="hideTeamLogo(match,'home')" /><b v-else>{{ teamInitial(teamLabel(match,'home')) }}</b></i><strong>{{ teamLabel(match,'home') }}</strong></span><em class="calendar-score" :class="scoreStateClass(match)">{{ scoreText(match) }}</em><span class="match-team away"><strong>{{ teamLabel(match,'away') }}</strong><i class="team-crest"><img v-if="teamLogo(match,'away')" :src="teamLogo(match,'away')" alt="" @error="hideTeamLogo(match,'away')" /><b v-else>{{ teamInitial(teamLabel(match,'away')) }}</b></i></span></div><footer><span class="match-state" :class="managementState(match).key"><i></i>{{ managementState(match).label }}</span><span class="card-actions"><button type="button" class="schedule-edit" @click.stop="openEdit(match)">调赛程</button><button type="button" class="drag-handle" draggable="true" title="拖动调整赛程" @dragstart.stop="startDrag(match)" @click.stop>拖动</button></span></footer></article><span v-if="!matchesForCell(venue.name,time).length" class="drop-hint">拖到此处</span></td></tr></tbody></table></div></div>
        </section>
      </template>
    </template>

    <el-dialog v-model="editVisible" title="安排比赛" width="520px"><div v-if="editingMatch" class="edit-summary"><small>{{ divisionName(editingMatch.divisionId) }} · 第{{ editingMatch.matchNo || editingMatch.matchIndex || '-' }}场</small><strong>{{ teamLabel(editingMatch,'home') }}　VS　{{ teamLabel(editingMatch,'away') }}</strong></div><el-form label-position="top"><el-form-item label="比赛日期"><el-date-picker v-model="editForm.matchDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item><el-form-item label="开赛时间"><el-select v-model="editForm.matchTime" filterable style="width:100%"><el-option v-for="time in preciseTimes" :key="time" :label="time" :value="time" /></el-select></el-form-item><el-form-item label="比赛场地"><el-select v-model="editForm.venue" style="width:100%"><el-option v-for="venue in compatibleVenues(editingMatch)" :key="venue.name" :label="`${venue.name} · ${fieldFormatLabel(venue.fieldFormat)}`" :value="venue.name" /></el-select></el-form-item></el-form><template #footer><el-button @click="editVisible=false">取消</el-button><el-button type="success" :loading="savingAssignment" @click="saveEdit">保存并校验</el-button></template></el-dialog>
    <el-dialog v-model="sequenceVisible" title="修改场序" width="420px"><p v-if="sequenceMatch">{{ divisionName(sequenceMatch.divisionId) }} · {{ teamLabel(sequenceMatch,'home') }} vs {{ teamLabel(sequenceMatch,'away') }}</p><el-form label-position="top"><el-form-item label="场序号"><el-input-number v-model="sequenceNumber" :min="1" :max="9999" :step="1" /></el-form-item></el-form><template #footer><el-button @click="sequenceVisible=false">取消</el-button><el-button type="success" :loading="savingSequence" @click="saveSequence">保存</el-button></template></el-dialog>

    <el-dialog v-model="assignmentVisible" title="赛前安排" width="660px" :close-on-click-modal="false">
      <div v-if="assignmentMatch" class="assignment-summary"><strong>{{ teamLabel(assignmentMatch,'home') }}　vs　{{ teamLabel(assignmentMatch,'away') }}</strong><span>{{ divisionName(assignmentMatch.divisionId) }} · {{ assignmentMatch.matchDate || '待排' }} {{ assignmentMatch.matchTime || '' }} · {{ assignmentMatch.venue || '场地待定' }}</span></div>
      <el-tabs v-model="assignmentTab" class="assignment-tabs">
        <el-tab-pane label="裁判安排" name="referee">
          <div v-loading="assignmentLoading">
            <el-form label-position="top" class="assignment-form">
              <el-form-item v-for="role in assignmentRoles" :key="role.key" :label="role.label" required>
                <el-select v-model="assignmentForm[role.key]" filterable :placeholder="`选择${role.label}`" style="width:100%"><el-option v-for="referee in assignableReferees" :key="referee._id" :label="refereeLabel(referee)" :value="referee._id" :disabled="refereeUsedByOtherRole(referee._id,role.key) || conflictingRefereeIds.has(String(referee._id))" /></el-select>
              </el-form-item>
              <el-form-item label="操作负责人" required><el-select v-model="assignmentForm.operationRefereeId" placeholder="从本场裁判组选择" style="width:100%"><el-option v-for="referee in selectedCrewReferees" :key="referee._id" :label="referee.name || referee.realName" :value="referee._id" /></el-select></el-form-item>
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
      <template #footer><el-button @click="refereeDocsVisible=false">取消</el-button><el-button :disabled="!refereePreMatchList.length || refereeDocsLoading" :loading="refereeDocsLoading && refereePrintMode" @click="printRefereePreMatchDocs">批量打印</el-button><el-button type="success" :disabled="!refereePreMatchList.length || refereeDocsLoading" :loading="refereeDocsLoading && !refereePrintMode" @click="downloadRefereePreMatchDocs">批量下载</el-button></template>
    </el-dialog>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Calendar, Download, MagicStick, Setting, Upload } from '@element-plus/icons-vue'
import JSZip from 'jszip'
import { callFunction, getFileUrl, queryById, queryList, rosterExceptionBoard } from '../../utils/cloud'
import { extractScheduleRows, parseDivisionAndPool, recognitionSummary, recognizeScheduleRows } from '../../utils/scheduleWorkbookRecognition'
import { firstUnfinishedMatchDate } from '../../utils/matchCalendarSelection'
import { findWorkbenchFocusMatch } from '../../utils/matchScheduleFocus'
import { createRefereeLineupSheet, refereeLineupSheetFileName, REFEREE_SHEET_LEGEND } from '../../utils/refereeLineupSheet'
import { MATCH_FORMAT_DEFAULTS } from '../../utils/rosterHelper'
import { calculatePreMatchSuspensions } from '../../utils/refereeSuspension'

const route = useRoute(), router = useRouter(), tournamentId = String(route.params.id || '')
const scheduleImportWriteEnabled = import.meta.env.VITE_ENABLE_SCHEDULE_IMPORT_WRITE === 'true'
const loading = ref(false), savingSettings = ref(false), autoScheduling = ref(false), savingAssignment = ref(false), applyingImport = ref(false), preparingKnockout = ref(false), knockoutPrepareError = ref('')
const tournament = ref({}), divisions = ref([]), matches = ref([]), teamLogoMap = ref(new Map()), hiddenTeamLogoKeys = ref(new Set()), divisionFilter = ref(String(route.query.divisionId || 'all')), selectedDate = ref(typeof route.query.date === 'string' ? route.query.date : ''), draggedMatchId = ref('')
const view = ref(['settings','imports','map','workbench'].includes(String(route.query.view || '')) ? String(route.query.view) : 'map')
const workbenchDivision = ref('all'), workbenchStatus = ref('all'), workbenchSearch = ref('')
const workbenchRoot = ref(null), nextMatchId = ref('')
const sequenceVisible = ref(false), sequenceMatch = ref(null), sequenceNumber = ref(1), savingSequence = ref(false)
const assignmentVisible = ref(false), assignmentMatch = ref(null), assignmentTab = ref('referee')
const assignmentLoading = ref(false), kitLoading = ref(false), savingReferees = ref(false), savingKit = ref(false)
const refereeRows = ref([]), assignmentForm = reactive({ mainReferee:'',assistant1:'',assistant2:'',fourthOfficial:'',secondReferee:'',thirdReferee:'',timekeeper:'',operationRefereeId:'' })
const kitForm = reactive({ home:{ jersey:'',shorts:'',socks:'' },away:{ jersey:'',shorts:'',socks:'' } })
const kitParts = [{ key:'jersey',label:'上衣' },{ key:'shorts',label:'短裤' },{ key:'socks',label:'球袜' }]
const kitColorNames = ['红','黄','蓝','白','绿','黑','橙','紫','粉','灰','深绿','浅蓝','藏青','棕']
const kitColorHex = { 红:'#E53935',黄:'#FDD835',蓝:'#1E88E5',白:'#FFFFFF',绿:'#43A047',黑:'#212121',橙:'#FB8C00',紫:'#8E24AA',粉:'#D81B60',灰:'#757575',深绿:'#1B5E20',浅蓝:'#42A5F5',藏青:'#283593',棕:'#795548' }
const fileInput = ref(null), importVisible = ref(false), importRows = ref([]), importPreview = ref({})
const importFileName = ref(''), recognitionSourceRows = ref([]), recognitionRows = ref([]), recognitionFilter = ref('all')
const refereeDocsVisible = ref(false), refereeDocsDate = ref(''), refereeDocsLoading = ref(false), refereePrintMode = ref(false)
const refereeDocsProgress = ref({ percent:0,label:'' })
const editVisible = ref(false), editingMatch = ref(null), editForm = reactive({ matchDate:'',matchTime:'',venue:'' })
const policyVisible = ref(false), policyDivision = ref(null), policyDraft = reactive({ allowedDates:[],allowedSessions:[],allowedVenues:[] })
const weekDays = ['周一','周二','周三','周四','周五','周六','周日']
const fieldFormats = [5,7,8,9,11].map(value => ({ value:`${value}side`,label:`${value}人制` }))
const defaultSessions = () => [{ key:'morning',label:'上午',enabled:true,start:'09:00',end:'12:00' },{ key:'afternoon',label:'下午',enabled:true,start:'14:00',end:'18:00' },{ key:'evening',label:'晚间',enabled:false,start:'18:30',end:'21:30' }]
const config = reactive({ schemaVersion:2,startDate:'',endDate:'',matchDays:['周一','周二','周三','周四','周五','周六','周日'],sessionWindows:defaultSessions(),venueResources:[],defaultTurnaroundMinutes:10,timeStepMinutes:5,frequencyPreset:'adaptive',divisionPolicies:{} })

const viewTitle = computed(() => ({ settings:'赛程设置',imports:'赛程导入导出',map:'赛事地图',workbench:'赛程工作台' })[view.value] || '赛事地图')
function setView(next) { view.value = next; const query={ ...route.query }; if(next === 'map')delete query.view;else query.view=next;return router.replace({ path:route.path,query }) }
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
  const row=Array.from(workbenchRoot.value?.querySelectorAll('tr[data-match-id]') || []).find(item => item.dataset.matchId === nextMatchId.value)
  row?.scrollIntoView({ block:'center',behavior:'auto' })
}
function openSequenceEdit(match) { sequenceMatch.value=match;sequenceNumber.value=Number(sequenceLabel(match)) || 1;sequenceVisible.value=true }
async function saveSequence() { const match=sequenceMatch.value, number=Number(sequenceNumber.value);if(!match || !Number.isInteger(number) || number<1)return ElMessage.warning('请输入有效场序号');savingSequence.value=true;try{const result=await callFunction('updateMatch',{matchId:match._id,data:{matchSequence:number}});if(!result?.success)throw new Error(result?.message || '场序保存失败');sequenceVisible.value=false;ElMessage.success('场序已更新');await load()}catch(error){ElMessage.error(error.message || '场序保存失败')}finally{savingSequence.value=false} }
const assignmentFormat = computed(() => assignmentMatch.value?.matchFormat || divisions.value.find(item => String(item.id) === String(assignmentMatch.value?.divisionId))?.matchFormat || '11side')
const assignmentRoles = computed(() => /^(5|6)/.test(String(assignmentFormat.value)) ? [{key:'mainReferee',label:'主裁判'},{key:'secondReferee',label:'第二裁判'},{key:'thirdReferee',label:'第三裁判'},{key:'timekeeper',label:'计时员'}] : [{key:'mainReferee',label:'主裁判'},{key:'assistant1',label:'第一助理裁判'},{key:'assistant2',label:'第二助理裁判'},{key:'fourthOfficial',label:'第四官员'}])
const assignableReferees = computed(() => refereeRows.value.filter(item => item.canOperate !== false && (item.status === 'approved' || item.synthetic === true && String(item.tournamentId || '') === tournamentId)))
const selectedCrewReferees = computed(() => assignableReferees.value.filter(item => assignmentRoles.value.some(role => assignmentForm[role.key] === item._id)))
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
  assignmentForm.operationRefereeId=match.operationRefereeId || match.refereeRecordKeeperId || assignmentForm[/^(5|6)/.test(String(assignmentFormat.value)) ? 'timekeeper' : 'fourthOfficial'] || ''
  for(const side of ['home','away'])for(const part of kitParts)kitForm[side][part.key]=String(match.kitColors?.[side]?.[part.key] || '')
  assignmentLoading.value=true;kitLoading.value=true
  const refereeTask=Promise.all([queryList('referees',{where:{status:'approved'},limit:500,silent:true}),queryList('referees',{where:{tournamentId},limit:500,silent:true})]).then(groups => {refereeRows.value=[...new Map(groups.flat().filter(Boolean).map(item => [String(item._id),item])).values()] }).catch(error => {refereeRows.value=[];ElMessage.error(error.message || '裁判名单加载失败')}).finally(() => {assignmentLoading.value=false})
  const kitTask=Promise.all(['home','away'].map(side => loadKitDefaults(match,side).then(defaults => {for(const part of kitParts)if(!kitForm[side][part.key])kitForm[side][part.key]=String(defaults[part.key] || '')}))).catch(error => ElMessage.error(error.message || '球服颜色加载失败')).finally(() => {kitLoading.value=false})
  await Promise.all([refereeTask,kitTask])
}
async function refreshAssignmentMatch() { const fresh=await queryById('matches',assignmentMatch.value._id);if(!fresh)throw new Error('保存后未读到比赛，请刷新赛程');matches.value=matches.value.map(item => item._id===fresh._id ? {...item,...fresh} : item);assignmentMatch.value=matches.value.find(item => item._id===fresh._id) || fresh }
async function saveWorkbenchReferees() {
  const ids=assignmentRoles.value.map(role => assignmentForm[role.key])
  if(ids.some(id => !id))return ElMessage.warning('请完整安排4名裁判')
  if(new Set(ids).size!==ids.length)return ElMessage.warning('同一裁判不能担任多个岗位')
  if(!ids.includes(assignmentForm.operationRefereeId))return ElMessage.warning('操作负责人须从本场裁判组选择')
  savingReferees.value=true
  try { const crew=Object.fromEntries(assignmentRoles.value.map(role => [role.key,assignmentForm[role.key]]));const result=await callFunction('updateMatch',{matchId:assignmentMatch.value._id,data:{refereeCrew:crew,refereeRecordKeeperId:assignmentForm.operationRefereeId,operationRefereeId:assignmentForm.operationRefereeId}});if(!result?.success)throw new Error(result?.message || '裁判安排未保存');await refreshAssignmentMatch();ElMessage.success('裁判组已保存') }catch(error){ElMessage.error(error.message || '裁判安排失败')}finally{savingReferees.value=false}
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
function teamInitial(name) { return String(name || '队').trim().slice(0,1) || '队' }
function teamLogoKey(match,side) { return `${String(match?._id || '')}:${side}` }
function teamLogo(match,side) { const key=teamLogoKey(match,side); if(hiddenTeamLogoKeys.value.has(key))return ''; const direct=match?.[`${side}TeamLogo`] || match?.[`${side}Logo`] || match?.[`${side}Team`]?.logoTransparentUrl || match?.[`${side}Team`]?.logoUrl || match?.[`${side}Team`]?.logo || ''; return String(direct || teamLogoMap.value.get(String(match?.[`${side}TeamId`] || '')) || '') }
function hideTeamLogo(match,side) { hiddenTeamLogoKeys.value=new Set([...hiddenTeamLogoKeys.value,teamLogoKey(match,side)]) }
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
function addVenue() { const used = new Set(config.venueResources.map(item => item.name)); let index = 1; while (used.has(`${index}号场地`)) index += 1; config.venueResources.push({ name:`${index}号场地`,fieldFormat:'5side',sessionWindows:config.sessionWindows.map(item => ({ ...item })) }) }
const enabledSessions = computed(() => config.sessionWindows.filter(item => item.enabled))
const enabledSessionLabels = computed(() => enabledSessions.value.map(item => item.label).join('、') || '未开放')
const calendarConfigured = computed(() => Boolean(config.startDate && config.endDate && config.matchDays.length && config.venueResources.length && enabledSessions.value.length))
const arrangedMatches = computed(() => matches.value.filter(match => match.matchDate && match.matchTime && match.venue))
const pendingMatches = computed(() => matches.value.filter(match => !match.matchDate || !match.matchTime || !match.venue))
const filteredPendingMatches = computed(() => pendingMatches.value.filter(match => divisionFilter.value === 'all' || String(match.divisionId || 'default') === divisionFilter.value))
const allCalendarDays = computed(() => { if (!config.startDate || !config.endDate) return []; const start = new Date(`${config.startDate}T00:00:00`), end = new Date(`${config.endDate}T00:00:00`), names=['周日','周一','周二','周三','周四','周五','周六'], rows=[]; for (let day=new Date(start);day<=end;day.setDate(day.getDate()+1)) { const weekday=names[day.getDay()]; if (!config.matchDays.includes(weekday)) continue; const date=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`; rows.push({ date,weekday,short:`${day.getMonth()+1}.${day.getDate()}` }) } return rows })
const calendarDays = computed(() => { const dates=new Set(arrangedMatches.value.map(match => String(match.matchDate || '').slice(0,10)).filter(Boolean)); return allCalendarDays.value.filter(day => dates.has(day.date)) })
watch(calendarDays, days => {
  if (!days.length || days.some(day => day.date === selectedDate.value)) return
  selectedDate.value = firstUnfinishedMatchDate(days, arrangedMatches.value, match =>
    ['scheduled', 'live', 'supplement', 'review'].includes(managementState(match).key)
  )
}, { immediate:true })
watch([selectedDate, divisionFilter], ([date, division]) => { if (!date) return; const query = { ...route.query, date }; if (division === 'all') delete query.divisionId; else query.divisionId = division; router.replace({ path:route.path, query }) })
const selectedDateLabel = computed(() => { const day=calendarDays.value.find(item => item.date === selectedDate.value); return day ? `${day.date} ${day.weekday}` : '请选择比赛日' })
const selectedDayMatches = computed(() => arrangedMatches.value.filter(match => match.matchDate === selectedDate.value && (divisionFilter.value === 'all' || String(match.divisionId || 'default') === divisionFilter.value)))
const refereePreMatchList = computed(() => arrangedMatches.value
  .filter(match => match.matchDate === refereeDocsDate.value && managementState(match).key === 'scheduled')
  .slice()
  .sort((a,b) => String(a.matchTime || '').localeCompare(String(b.matchTime || '')) || Number(a.matchSequence || a.matchNo || 0)-Number(b.matchSequence || b.matchNo || 0)))
function minutes(value) { const [hour,minute] = String(value || '00:00').split(':').map(Number); return hour*60+minute }
function timeText(value) { return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}` }
function timesByStep(step) { const rows=[]; for (const session of enabledSessions.value) for (let value=minutes(session.start);value<minutes(session.end);value+=step) rows.push(timeText(value)); return [...new Set(rows)].sort() }
const preciseTimes = computed(() => timesByStep(Math.max(5,Number(config.timeStepMinutes || 5))))
const mapTimes = computed(() => [...new Set(selectedDayMatches.value.map(match => match.matchTime).filter(Boolean))].sort())
function sessionLabel(time) { const value=minutes(time); return enabledSessions.value.find(item => value>=minutes(item.start) && value<minutes(item.end))?.label || '' }
function compatibleVenues(match) { const division=divisions.value.find(item => String(item.id) === String(match?.divisionId)); const format=String(match?.matchFormat || matchFormat(division)); return config.venueResources.filter(item => !format || item.fieldFormat === format) }
function matchesForCell(venue,time) { return selectedDayMatches.value.filter(match => match.venue === venue && match.matchTime === time) }

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
        tournamentId,divisionId:String(match.divisionId || '')
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
  const widths=[280,1240,280,360,360,360,360,360,360,360,360]
  const allWidths=[...widths,...widths]
  const maxRows=Math.max(Number(input.rowCount)||0,input.homePlayers.length,input.awayPlayers.length,1)
  const colgroup=`<colgroup>${allWidths.map(value=>`<col style="width:${(value/9360*100).toFixed(3)}%">`).join('')}</colgroup>`
  const heading=['序号','队员姓名','号码','首发','替补','身份','换上','换下','进球','黄牌','红牌','序号','队员姓名','号码','首发','替补','身份','换上','换下','进球','黄牌','红牌']
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
      const cells=[String(index+1),home.name||'',home.number||'','','',home.note||'','','','','','',String(index+1),away.name||'',away.number||'','','',away.note||'','','','','','']
      return `<tr>${cells.map((value,cell)=>`<td${cell%11===1?' class="player-name"':''}>${safeHtml(value)}</td>`).join('')}</tr>`
    }).join('')
    offset+=count
    const firstPage=page===0,lastPage=page===pageCount-1
    const title=firstPage?`<h1>裁判首发阵容信息表</h1><div class="meta"><div><span>比赛名称：</span><b>${safeHtml(`${input.tournamentName||'足球比赛'}（${String(input.matchFormat||'').replace('side','人制')}）`)}</b></div><div><span>比赛时间：</span><b>${safeHtml(`${day} ${match.matchTime||''}`)}</b></div><div><span>比赛地点：</span><b>${safeHtml(`${input.location||''}　${match.venue||''}　场序：第${match.matchSequence||match.matchNo||match.sequence||'待定'}场　组别：${input.divisionName||''}`)}</b></div></div>`:''
    const signatures=lastPage?`<div class="team-sign"><span>主教练签名：________________</span><span>球衣　上 / 下</span><span>主教练签名：________________</span><span>球衣　上 / 下</span></div><p class="legend">${REFEREE_SHEET_LEGEND.map(line => '<span>'+safeHtml(line)+'</span>').join('')}</p><p class="result">比赛结果：______:______　加时赛（点球决胜）结果：______:______　获胜队：____________________</p><div class="officials"><span>主裁判：____________</span><span>第一助理裁判：____________</span><span>第二助理裁判：____________</span><span>第四官员：____________</span><span>裁判监督：____________</span><span>比赛监督：____________</span></div><footer><img src="${logo}" alt="赛小蜂足球"><strong>本名单由赛小蜂足球后台自动生成，最终解释权归赛事组委会所有！</strong></footer>`:''
    pages.push(`<section class="sheet">${title}<table class="teams"><tbody><tr><td>主队：${safeHtml(input.homeName)}</td><td>客队：${safeHtml(input.awayName)}</td></tr><tr><td>${safeHtml(kitLine(input.kitColors?.home))}</td><td>${safeHtml(kitLine(input.kitColors?.away))}</td></tr><tr><td>领队/主教练：________________</td><td>领队/主教练：________________</td></tr><tr><td>工作人员/队医：____________</td><td>工作人员/队医：____________</td></tr></tbody></table><table class="roster">${colgroup}<thead>${header}</thead><tbody>${rows}</tbody></table>${signatures}</section>`)
  }
  return pages.join('')
}

function refereePrintDocumentHtml(entries) {
  const pages=entries.map(({input})=>printSheetHtml(input)).join('')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>裁判赛前工作单</title><style>@page{size:A4 portrait;margin:11mm}*{box-sizing:border-box}body{margin:0;color:#111;font-family:"SimSun","Songti SC",serif}.sheet{width:100%;page-break-after:always;break-after:page;display:flex;flex-direction:column}.sheet:last-child{page-break-after:auto;break-after:auto}h1{margin:0 0 4mm;text-align:center;font-size:18pt}.meta{margin:0 5mm 4mm;font-size:10pt}.meta div{display:grid;grid-template-columns:27mm 1fr;margin:2mm 0}.teams{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10pt}.teams td{height:7.5mm;padding:1mm;border:0.5pt solid #777}.roster{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8pt}.roster th,.roster td{height:6mm;padding:1mm .4mm;border:.5pt solid #777;text-align:center;overflow-wrap:anywhere}.roster th{height:11mm;font-weight:400}.roster td.player-name{font-size:9pt;font-weight:bold}.team-sign{display:grid;grid-template-columns:2fr 1fr 2fr 1fr;gap:1mm;padding:2mm 0;border:0.5pt solid #777;font-size:8pt}.team-sign span{text-align:center}.legend,.result{margin:2mm 0;font-size:8pt}.legend span{display:block;white-space:nowrap;line-height:1.25}.officials{display:grid;grid-template-columns:1fr 1fr;gap:3mm 14mm;margin:3mm 14mm 0;font-size:10pt}.officials span{min-height:7mm}footer{display:flex;align-items:center;gap:4mm;margin:auto 0 0;padding-top:4mm;font-size:8pt}footer img{width:34mm;height:auto}footer strong{font-weight:bold}@media screen{body{background:#e9ecef}.sheet{width:186mm;min-height:273mm;margin:8mm auto;padding:0;background:#fff;box-shadow:0 2mm 8mm #0002}}</style></head><body>${pages}<script>window.addEventListener('load',async()=>{await Promise.all([...document.images].map(img=>img.decode?.().catch(()=>{})));setTimeout(()=>window.print(),300)})<\/script></body></html>`
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
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>正在生成裁判工作单</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f7f5;color:#183a27;font-family:"Microsoft YaHei",sans-serif}.box{width:min(420px,calc(100vw - 48px));padding:32px;background:#fff;border:1px solid #dce5df;border-radius:10px;text-align:center;box-shadow:0 8px 32px #183a2712}.box img{width:150px;height:auto}.spin{width:28px;height:28px;margin:20px auto 12px;border:3px solid #d7e8dc;border-top-color:#078747;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.track{height:8px;margin-top:12px;overflow:hidden;border-radius:8px;background:#edf2ee}.track i{display:block;width:0;height:100%;background:#078747;transition:width .2s}.progress{display:flex;justify-content:space-between;margin-top:8px;color:#6c7b71;font-size:12px}</style></head><body><main class="box"><img src="${logo}" alt="赛小蜂"><div class="spin"></div><strong>正在生成裁判工作单</strong><div class="track"><i id="referee-progress-fill"></i></div><div class="progress"><span id="referee-progress-label">准备${total}场比赛</span><span id="referee-progress-percent">0%</span></div></main></body></html>`
}

function refereePrintErrorHtml(message) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>工作单生成失败</title><style>body{font-family:"Microsoft YaHei",sans-serif;background:#f6f8f6;color:#183a27;padding:48px}main{max-width:520px;margin:auto;padding:28px;background:#fff;border:1px solid #e5e9e6;border-radius:8px}strong{color:#b42318}</style></head><body><main><strong>裁判工作单生成失败</strong><p>${safeHtml(message)}</p><p>请返回赛事页面重试。</p></main></body></html>`
}

async function downloadRefereePreMatchDocs() {
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
      updateRefereeDocsProgress(42+(index/entries.length)*40,`生成 Word 工作单 ${index+1}/${entries.length}`)
      const {input}=entries[index]
      const document=await createRefereeLineupSheet(input,templateBytes,logoBytes)
      archive.file(refereeLineupSheetFileName(input.match,input.homeName,input.awayName),document)
    }
    updateRefereeDocsProgress(84,'正在打包工作单')
    const blob=await archive.generateAsync({type:'blob',mimeType:'application/zip'},metadata=>updateRefereeDocsProgress(84+(metadata.percent||0)*.16,`正在打包工作单 ${Math.round(metadata.percent||0)}%`))
    downloadBlob(blob,`${refereeDocsDate.value}-裁判赛前工作单.zip`)
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

function capacityForDivision(division) { const required=matches.value.filter(match => String(match.divisionId || 'default') === String(division.id)).length; const policy=policyFor(division), occupancy=Math.max(5,matchMinutes(division)+Number(policy.turnaroundMinutes || 0)); const dailyMinutes=enabledSessions.value.reduce((sum,item)=>sum+Math.max(0,minutes(item.end)-minutes(item.start)),0); const fields=config.venueResources.filter(item=>item.fieldFormat===matchFormat(division)).length; const capacity=Math.floor(dailyMinutes/occupancy)*fields*allCalendarDays.value.length; return { required,capacity,shortage:Math.max(0,required-capacity),ready:capacity>=required && fields>0 } }
const totalCapacity = computed(() => divisions.value.reduce((sum,division) => sum + capacityForDivision(division).capacity,0))
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

async function load() { loading.value=true; try { const [event,divisionRows,matchRows]=await Promise.all([queryById('tournaments',tournamentId),queryList('divisions',{where:{tournamentId},limit:1000,silent:true}),queryList('matches',{where:{tournamentId},limit:1000,silent:true})]); tournament.value=event || {}; divisions.value=(divisionRows?.length?divisionRows:(event?.divisions || [])).map(item=>({ ...item,id:String(item._id || item.id || 'default') })); const divisionMap=new Map(divisions.value.map(item=>[String(item.id),item.name]));matches.value=(matchRows || []).filter(item=>!item.isBye && item.status!=='cancelled').map(item=>({ ...item,divisionName:item.divisionName || divisionMap.get(String(item.divisionId || 'default')) || '' })); await loadTeamLogos(); applySavedConfig(event?.scheduleDraft || event?.scheduleConfig || {}); if (!Object.keys(config.divisionPolicies).length) resetPolicies() } catch(error){ElMessage.error(error.message || '赛程加载失败')} finally{loading.value=false} }
async function loadTeamLogos() { const ids=[...new Set(matches.value.flatMap(match=>[match.homeTeamId,match.awayTeamId].filter(Boolean).map(String)))]; if(!ids.length)return; try { const rows=(await Promise.all(ids.map(id=>queryById('teams',id).catch(()=>null)))).filter(Boolean); const entries=await Promise.all(rows.map(async team=>{const raw=String(team.logoTransparentUrl || team.logoUrl || team.logo || ''); const logo=raw.startsWith('cloud://') ? await getFileUrl(raw) : raw; return [String(team._id),logo]})); teamLogoMap.value=new Map(entries.filter(([,logo])=>logo)) } catch(error) { console.warn('加载赛程队徽失败',error) } }
function applySavedConfig(saved) { const source=saved && typeof saved==='object'?saved:{}; config.schemaVersion=2; config.startDate=source.startDate || tournament.value.startDate || ''; config.endDate=source.endDate || tournament.value.endDate || config.startDate; config.matchDays=Array.isArray(source.matchDays)&&source.matchDays.length?[...source.matchDays]:[...weekDays]; config.sessionWindows=Array.isArray(source.sessionWindows)&&source.sessionWindows.length?source.sessionWindows.map(item=>({ ...item })):defaultSessions(); const resources=Array.isArray(source.venueResources)?source.venueResources:[]; config.venueResources=resources.map(item=>({ name:String(item.name || item.venue || ''),fieldFormat:String(item.fieldFormat || ''),sessionWindows:config.sessionWindows.map(session=>({ ...session })) })).filter(item=>item.name); config.defaultTurnaroundMinutes=Number(source.defaultTurnaroundMinutes ?? source.matchInterval ?? 10); config.timeStepMinutes=Number(source.timeStepMinutes || 5); config.frequencyPreset=source.frequencyPreset || 'adaptive'; config.divisionPolicies=JSON.parse(JSON.stringify(source.divisionPolicies || {})) }
function payloadConfig() { return { ...config,sessionWindows:config.sessionWindows.map(item=>({ ...item })),venueResources:config.venueResources.map(item=>({ name:item.name.trim(),fieldFormat:item.fieldFormat,sessionWindows:config.sessionWindows.map(session=>({ ...session })) })),venues:config.venueResources.map(item=>item.name.trim()).filter(Boolean),generationMode:'joint' } }
function validateSettings() { if(!config.startDate||!config.endDate||config.startDate>config.endDate)return '请设置有效的比赛周期';if(!config.matchDays.length)return '请至少选择一个比赛日';if(!enabledSessions.value.length)return '请至少开放一个时段';if(!config.venueResources.length)return '请至少添加一块场地';if(config.venueResources.some(item=>!item.name.trim()||!item.fieldFormat))return '请填写完整的场地名称和制式';if(new Set(config.venueResources.map(item=>item.name.trim())).size!==config.venueResources.length)return '场地名称不能重复';return '' }
async function saveSettings() { const error=validateSettings();if(error)return ElMessage.warning(error);savingSettings.value=true;try{const result=await callFunction('generateSchedule',{action:'saveDraft',tournamentId,scheduleConfig:payloadConfig()});if(!result?.success)throw new Error(result?.message || '保存失败');tournament.value={...tournament.value,scheduleDraft:payloadConfig()};selectedDate.value=calendarDays.value[0]?.date || selectedDate.value;ElMessage.success('赛事日历已创建');setView('map')}catch(error){ElMessage.error(error.message || '赛程设置保存失败')}finally{savingSettings.value=false} }
async function autoSchedule() { const error=validateSettings();if(error)return ElMessage.warning(error);autoScheduling.value=true;try{await callFunction('generateSchedule',{action:'saveDraft',tournamentId,scheduleConfig:payloadConfig()});const ids=[...new Set(pendingMatches.value.map(match=>String(match.divisionId || 'default')))];const result=await callFunction('generateSchedule',{action:'scheduleExistingPairings',tournamentId,divisionIds:ids,scheduleConfig:payloadConfig(),fullReflow:false},120000);if(!result?.success)throw new Error(result?.message || '自动排程失败');ElMessage.success(result.message);await load()}catch(error){ElMessage.error(error.message || '自动排程失败')}finally{autoScheduling.value=false} }

function startDrag(match) { draggedMatchId.value=String(match._id) }
function draggedMatch() { return matches.value.find(item=>String(item._id)===draggedMatchId.value) }
async function assignRows(rows,apply=false,adjustmentType='manual') { return callFunction('generateSchedule',{action:'importScheduleAssignments',tournamentId,rows,dryRun:!apply,adjustmentType}) }
async function dropToSlot(venue,time) { const match=draggedMatch();if(!match)return;const row={matchId:match._id,matchDate:selectedDate.value,matchTime:time,venue};try{const preview=await assignRows([row],false,'drag');if(!preview?.success)throw new Error(preview?.errors?.[0]?.message || preview?.message);const result=await assignRows([row],true,'drag');if(!result?.success)throw new Error(result?.message);ElMessage.success('比赛已安排');await load()}catch(error){ElMessage.error(error.message || '无法放入该时段')}finally{draggedMatchId.value=''} }
async function dropBackToPending() { const match=draggedMatch();if(!match||!match.matchDate)return;try{await ElMessageBox.confirm('确定将该比赛移回待排池吗？','移回待排',{type:'warning'});const result=await callFunction('updateMatch',{matchId:match._id,data:{matchDate:'',matchTime:'',venue:'',scheduleStatus:'unassigned'},adjustmentType:'unassign'});if(!result?.success)throw new Error(result?.message);ElMessage.success('已移回待排池');await load()}catch(error){if(error!=='cancel'&&error!=='close')ElMessage.error(error.message || '操作失败')}finally{draggedMatchId.value=''} }
function openEdit(match) { editingMatch.value=match;editForm.matchDate=match.matchDate || selectedDate.value;editForm.matchTime=match.matchTime || preciseTimes.value[0] || '';editForm.venue=match.venue || compatibleVenues(match)[0]?.name || '';editVisible.value=true }
async function saveEdit() { if(!editingMatch.value||!editForm.matchDate||!editForm.matchTime||!editForm.venue)return ElMessage.warning('请填写完整排期');savingAssignment.value=true;try{const rows=[{matchId:editingMatch.value._id,...editForm}];const preview=await assignRows(rows,false,'manual');if(!preview?.success)throw new Error(preview?.errors?.[0]?.message || preview?.message);const result=await assignRows(rows,true,'manual');if(!result?.success)throw new Error(result?.message);editVisible.value=false;ElMessage.success('排期已保存');await load()}catch(error){ElMessage.error(error.message || '保存失败')}finally{savingAssignment.value=false} }

function arrangementText(value) { return value?.matchDate ? `${value.matchDate} ${value.matchTime} · ${value.venue}` : '待排' }
async function exportTemplate(mode='pairing') {
  try {
    const module=await import('xlsx'),XLSX=module.default||module
    const title=mode === 'pairing' ? `${tournament.value.name || '赛事'}待排对阵表` : `${tournament.value.name || '赛事'}当前赛程表`
    const headers=['比赛ID','组别ID','场序','组别','小组','轮次','比赛对阵','比赛日期','开赛时间','比赛场地']
    const rows=matches.value.slice().sort((left,right)=>Number(left.matchNo || left.matchIndex || 0)-Number(right.matchNo || right.matchIndex || 0)).map(match=>[
      match._id,String(match.divisionId || 'default'),match.matchNo || match.matchIndex || '',divisionName(match.divisionId),match.group || match.pool || '',match.roundName || '',`${teamLabel(match,'home')} VS ${teamLabel(match,'away')}`,
      mode === 'current' ? match.matchDate || '' : '',mode === 'current' ? match.matchTime || '' : '',mode === 'current' ? match.venue || '' : ''
    ])
    const sheet=XLSX.utils.aoa_to_sheet([[title],headers,...rows])
    sheet['!merges']=[{s:{r:0,c:0},e:{r:0,c:headers.length-1}}]
    sheet['!cols']=[{hidden:true},{hidden:true},{wch:8},{wch:16},{wch:9},{wch:18},{wch:42},{wch:14},{wch:12},{wch:18}]
    const help=XLSX.utils.aoa_to_sheet([['赛程填写说明'],['1. 不要修改比赛ID、组别、场序或对阵。'],['2. 需要排期时，同时填写比赛日期、开赛时间和比赛场地。'],['3. 日期可用 YYYY-MM-DD 或 M/D/YY，时间使用 HH:mm。'],['4. 系统也支持上传含“场序、日期、时间、组别、对阵、场地”的线下赛程表。'],['5. 上传后先识别预览，确认映射时再执行冲突校验。']])
    const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'赛程填写');XLSX.utils.book_append_sheet(book,help,'填写说明')
    XLSX.writeFile(book,`${title}.xlsx`)
    ElMessage.success(mode === 'pairing' ? '待排对阵已下载' : '当前赛程已下载')
  } catch(error) { ElMessage.error(error.message || '下载失败') }
}
async function readImportFile(event) {
  const file=event.target.files?.[0];event.target.value='';if(!file)return
  try {
    const module=await import('xlsx'),XLSX=module.default||module
    const book=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true})
    const sheet=book.Sheets['赛程填写'] || book.Sheets['排期填写'] || book.Sheets[book.SheetNames[0]]
    const extracted=extractScheduleRows(XLSX,sheet)
    if(extracted.error)throw new Error(extracted.error)
    recognitionSourceRows.value=extracted.rows
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
</script>

<style scoped>
.schedule-v2{min-height:100vh;padding:0 28px 70px;color:#17251d;background:#f6f8f6}.page-header{display:flex;min-height:84px;align-items:center;justify-content:space-between;border-bottom:1px solid #dfe6e1}.page-header span{color:#77827b;font-size:12px}.page-header h1{margin:5px 0 0;font-size:28px}.event-context{display:flex;align-items:center;gap:12px}.primary-nav{display:flex;gap:28px;border-bottom:1px solid #dfe6e1;background:#fff}.primary-nav button{height:58px;padding:0 4px;border:0;border-bottom:3px solid transparent;background:none;font-size:16px;cursor:pointer}.primary-nav button.active{border-color:#087b43;color:#087b43;font-weight:700}.settings-intro,.settings-card,.map-summary,.map-toolbar,.calendar-workspace,.capacity-bar,.import-hero,.import-guide,.recognition-summary,.recognition-card,.import-empty,.import-confirm-bar{margin-top:16px;border:1px solid #dce4df;border-radius:9px;background:#fff}.settings-intro{display:flex;align-items:center;justify-content:space-between;padding:18px}.settings-intro h2,.settings-card h2{margin:0;font-size:19px}.settings-intro p,.settings-card header span{margin:5px 0 0;color:#748078;font-size:13px}.settings-card{padding:18px}.settings-card>header{display:flex;align-items:center;justify-content:space-between;margin-bottom:15px}.settings-grid{display:grid;grid-template-columns:1.4fr .8fr 1fr;gap:16px}.settings-grid label>span{display:block;margin-bottom:7px;font-weight:650}.settings-grid label>small{margin-left:6px}.settings-grid .weekdays{grid-column:1/-1}.date-range{display:flex;align-items:center;gap:8px}.date-range i{font-style:normal;color:#7d8881}.session-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:17px}.session-grid article{display:grid;grid-template-columns:40px 45px 1fr 18px 1fr;align-items:center;gap:7px;padding:11px;border:1px solid #e0e7e2;border-radius:7px}.session-grid article.disabled{opacity:.5;background:#f4f6f5}.settings-table,.division-policy-table table{width:100%;border-collapse:collapse}.settings-table th,.settings-table td,.division-policy-table th,.division-policy-table td{padding:10px;border-bottom:1px solid #e8ede9;text-align:left}.settings-table th,.division-policy-table th{color:#68766d;font-size:12px}.settings-table .el-select,.division-policy-table .el-input-number{width:100%}.empty-cell{text-align:center!important;color:#879189}.division-policy-table{overflow-x:auto}.division-policy-table table{min-width:1050px}.division-policy-table small{margin-left:3px;color:#7b867f}.capacity-bar{position:sticky;bottom:10px;z-index:5;display:flex;align-items:center;gap:12px;padding:14px 18px;box-shadow:0 8px 30px rgba(31,58,42,.12)}.capacity-bar>div{display:flex;flex:1;flex-direction:column;gap:4px}.capacity-bar span{color:#6e7a72;font-size:13px}.calendar-empty{display:grid;min-height:520px;place-items:center;align-content:center;gap:12px;text-align:center}.calendar-empty>.el-icon{color:#087b43;font-size:56px}.calendar-empty h2,.calendar-empty p{margin:0}.calendar-empty p{color:#718078}.map-summary{display:flex;align-items:center;gap:22px;padding:13px 16px}.map-summary span{font-size:13px}.map-summary b{margin-right:4px;font-size:22px}.map-summary .pending b{color:#c67a00}.map-summary .danger b,.danger{color:#c4322c}.map-summary i{flex:1}.hidden-input{display:none}.map-toolbar{display:flex;align-items:center;gap:14px;padding:10px 14px}.map-toolbar>.el-select{width:180px}.date-tabs{display:flex;flex:1;gap:5px;overflow-x:auto}.date-tabs button{min-width:64px;padding:6px 8px;border:1px solid #dce4df;border-radius:6px;background:#fff;cursor:pointer}.date-tabs button.active{border-color:#087b43;color:#087b43;background:#edf7f1}.date-tabs strong,.date-tabs small{display:block}.calendar-workspace{display:grid;grid-template-columns:270px minmax(0,1fr);min-height:620px;overflow:hidden}.pending-pool{border-right:1px solid #e0e7e2}.pending-pool>header,.calendar-board>header{display:flex;align-items:center;justify-content:space-between;padding:14px;border-bottom:1px solid #e3e9e5}.pending-pool h2{margin:0;font-size:17px}.pending-pool>p{margin:10px 14px;color:#748178;font-size:12px}.pending-list{max-height:750px;overflow:auto;padding:0 10px 12px}.pending-list article,.calendar-match{margin-top:8px;padding:10px;border:1px solid #dce5df;border-left:3px solid #087b43;border-radius:6px;background:#fff;cursor:grab}.pending-list article small,.pending-list article span{display:block;color:#748078;font-size:11px}.pending-list article strong,.calendar-match>strong{display:flex;align-items:center;justify-content:space-between;gap:5px;margin:7px 0;font-size:13px}.pending-list em,.calendar-match em{color:#909b94;font-size:10px;font-style:normal}.calendar-board{min-width:0}.calendar-board>header small{color:#748078}.calendar-scroll{max-height:750px;overflow:auto}.calendar-scroll table{width:100%;min-width:850px;border-collapse:separate;border-spacing:0}.calendar-scroll th,.calendar-scroll td{min-width:180px;height:78px;padding:7px;border-right:1px solid #e3e9e5;border-bottom:1px solid #e3e9e5;vertical-align:top}.calendar-scroll th:first-child{position:sticky;left:0;z-index:2;min-width:76px;background:#f7f9f7}.calendar-scroll thead th{position:sticky;top:0;z-index:3;background:#f2f6f3}.calendar-scroll th strong,.calendar-scroll th small{display:block}.calendar-scroll th small{margin-top:4px;color:#7b877f;font-size:11px}.drop-hint{display:grid;height:62px;place-items:center;color:#a1aaa4;font-size:11px}.calendar-match{margin:0;border-left-color:#23845a}.calendar-match header,.calendar-match footer{display:flex;justify-content:space-between;color:#718078;font-size:10px}.calendar-match>strong{font-size:12px}.edit-summary{display:flex;flex-direction:column;gap:7px;margin-bottom:15px;padding:12px;border-radius:6px;background:#f2f7f3}.import-hero{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:20px}.import-hero h2,.recognition-card h2{margin:0;font-size:20px}.import-hero p{margin:6px 0 0;color:#6e7b73}.import-hero>div:last-child{display:flex;gap:10px}.import-guide{display:grid;grid-template-columns:repeat(4,1fr);gap:0;padding:15px}.import-write-gate{margin-top:16px}.import-guide article{display:flex;align-items:center;gap:10px;padding:6px 16px;border-right:1px solid #e2e8e4}.import-guide article:last-child{border-right:0}.import-guide article>b{display:grid;width:28px;height:28px;place-items:center;border-radius:50%;color:#fff;background:#087b43}.import-guide article span{display:flex;flex-direction:column;gap:3px}.import-guide small,.recognition-card header span{color:#748078}.recognition-summary{display:flex;align-items:center;gap:22px;padding:14px 18px}.recognition-summary>div{display:flex;min-width:240px;flex:1;flex-direction:column;gap:3px}.recognition-summary>div span{color:#718078;font-size:12px}.recognition-summary>span{white-space:nowrap}.recognition-summary b{margin-right:4px;font-size:22px}.recognition-summary .ready b{color:#087b43}.recognition-summary .planned b{color:#c67a00}.import-confirm-bar{position:sticky;bottom:10px;z-index:6;display:flex;align-items:center;gap:12px;padding:14px 18px;box-shadow:0 8px 30px rgba(31,58,42,.14)}.import-confirm-bar>div{display:flex;flex:1;flex-direction:column;gap:4px}.import-confirm-bar span{color:#6e7a72;font-size:13px}.recognition-card{padding:17px}.recognition-card>header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:12px}.recognition-card>header h2{margin-bottom:4px}.recognition-table-wrap{max-height:480px;overflow:auto}.recognition-table{width:100%;min-width:1120px;border-collapse:collapse}.recognition-table th{position:sticky;top:0;z-index:1;padding:10px;background:#f1f5f2;color:#627168;text-align:left;font-size:12px}.recognition-table td{padding:10px;border-bottom:1px solid #e5ebe7;vertical-align:top;font-size:12px}.recognition-table td:nth-child(4){min-width:240px}.recognition-table td:nth-child(4) strong{display:inline}.recognition-table em,.recognized-map em{margin:0 6px;color:#8a968e;font-size:10px;font-style:normal}.recognition-table td:nth-child(5) small{display:block;margin-top:3px;color:#77837b}.recognized-map>article{margin-top:12px;border:1px solid #e1e8e3;border-radius:7px}.recognized-map>article>header{display:flex;justify-content:space-between;padding:10px 13px;background:#f2f7f3}.recognized-map-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;padding:10px}.recognized-map-grid>section{padding:10px;border:1px solid #e3e9e5;border-radius:6px}.recognized-map-grid h3{margin:0 0 8px;font-size:14px}.recognized-map-grid section>div{display:grid;grid-template-columns:55px 1fr;gap:8px;padding:7px 0;border-top:1px solid #edf1ee}.recognized-map-grid section>div:first-of-type{border-top:0}.recognized-map-grid span{display:flex;flex-direction:column;gap:2px}.recognized-map-grid small{color:#738078}.import-empty{display:grid;min-height:380px;place-items:center;align-content:center;gap:12px;text-align:center}.import-empty>.el-icon{color:#087b43;font-size:52px}.import-empty h2,.import-empty p{margin:0}.import-empty p{max-width:650px;color:#718078}.import-summary{display:flex;gap:30px;padding:14px;background:#f3f7f4}.import-summary b{margin-right:4px;font-size:24px}.import-errors{max-height:300px;overflow:auto;color:#b42318}.import-changes{width:100%;margin-top:14px;border-collapse:collapse}.import-changes th,.import-changes td{padding:9px;border-bottom:1px solid #e5ebe7;text-align:left}@media(max-width:1000px){.settings-grid,.session-grid{grid-template-columns:1fr}.settings-grid .weekdays{grid-column:auto}.calendar-workspace{grid-template-columns:1fr}.pending-pool{border-right:0;border-bottom:1px solid #e0e7e2}.map-summary,.map-toolbar,.import-hero,.recognition-summary{align-items:flex-start;flex-wrap:wrap}.map-summary i{display:none}.import-guide{grid-template-columns:1fr 1fr}.import-guide article:nth-child(2){border-right:0}.import-hero>div:last-child{flex-wrap:wrap}}
.calendar-workspace.without-pending{grid-template-columns:minmax(0,1fr)}
.subview-bar{display:flex;align-items:center;gap:12px;margin-top:14px;padding-bottom:10px;border-bottom:1px solid #dfe6e1}.subview-bar span{color:#66746b;font-size:13px}.map-summary{flex-wrap:wrap;gap:16px}.map-summary .played b{color:#087b43}.map-summary .remaining b{color:#c67a00}.match-state{display:inline-flex;align-items:center;gap:5px}.match-state i{width:7px;height:7px;border-radius:50%;background:#87928b}.match-state.live i{background:#d92d20}.match-state.completed i{background:#159447}.match-state.supplement i{background:#e77710}.match-state.review i{background:#c59100}.match-state.archived i{background:#557064}.calendar-match{cursor:pointer;transition:border-color .15s ease,box-shadow .15s ease}.calendar-match:hover{border-color:#83ad94;box-shadow:0 3px 10px rgba(31,58,42,.1)}.calendar-match.state-scheduled{border-left-color:#a7b0aa;background:#fff}.calendar-match.state-live{border-left-color:#d92d20;background:#fff5f3}.calendar-match.state-completed{border-left-color:#159447;background:#eef9f1}.calendar-match.state-supplement{border-left-color:#e77710;background:#fff9f2}.calendar-match.state-review{border-left-color:#c59100;background:#fffbee}.calendar-match.state-archived{border-left-color:#718079;background:#f7f9f8}.calendar-match>strong em{min-width:34px;text-align:center}.calendar-match footer{align-items:center;margin-top:8px}.card-actions{display:flex;align-items:center;gap:5px}.card-actions button{padding:2px 5px;border:0;border-radius:3px;color:#516158;background:transparent;font-size:10px;cursor:pointer}.card-actions button:hover{color:#087b43;background:#eaf4ee}.drag-handle{cursor:grab!important}.pending-list article{cursor:pointer}
.match-sides{grid-template-columns:minmax(0,1fr) 86px minmax(0,1fr)}.match-sides>.calendar-score{display:block;min-width:86px;color:#9ca3af;font-size:28px;font-style:normal;font-variant-numeric:tabular-nums;font-weight:900;line-height:1;text-align:center;letter-spacing:.5px}.match-sides>.calendar-score.score-finished{color:#111827}.match-sides>.calendar-score.score-live{color:#d92d20}.match-sides>.calendar-score.score-upcoming{color:#9ca3af}
.match-sides{display:grid;align-items:center;gap:8px;margin:10px 0}.match-team{display:flex;min-width:0;align-items:center;gap:10px}.match-team.away{justify-content:flex-end;text-align:right}.match-team strong{overflow:hidden;color:#102e1d;font-size:18px;font-weight:800;line-height:1.35;text-overflow:ellipsis;white-space:nowrap}.team-crest{display:grid;width:38px;height:38px;flex:0 0 38px;place-items:center;overflow:hidden;border:1px solid #d9e6de;border-radius:50%;background:#fff;color:#168957;font-size:15px;font-style:normal}.team-crest img{display:block;width:100%;height:100%;object-fit:contain}.team-crest b{font-size:15px}
.schedule-workbench{margin-top:16px;background:#fff;border:1px solid #dce4df;border-radius:8px}.workbench-controls{display:flex;align-items:center;gap:10px;padding:14px;border-bottom:1px solid #e4eae6}.workbench-controls .el-select{width:160px}.workbench-controls .el-input{width:240px}.workbench-controls>span{margin-left:auto;color:#617168;white-space:nowrap}.workbench-table-wrap{overflow-x:auto}.workbench-table{width:100%;min-width:1120px;border-collapse:collapse}.workbench-table th,.workbench-table td{padding:11px 12px;border-bottom:1px solid #edf1ee;text-align:left;white-space:nowrap}.workbench-table th{color:#64746a;background:#f6f8f6;font-size:12px;font-weight:600}.workbench-table td{font-size:13px}.workbench-table .workbench-teams{min-width:260px;white-space:normal}.workbench-actions{min-width:265px}.workbench-actions .el-button{margin:0 8px 0 0}@media(max-width:700px){.workbench-controls{flex-wrap:wrap}.workbench-controls .el-select,.workbench-controls .el-input{width:calc(50% - 5px)}.workbench-controls>span{margin-left:0}}
.assignment-summary{display:flex;flex-direction:column;gap:4px;padding:0 0 12px;border-bottom:1px solid #e3e9e5}.assignment-summary strong{font-size:15px}.assignment-summary span{color:#68776e;font-size:12px}.assignment-tabs{margin-top:10px}.assignment-form{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}.assignment-save{display:flex;justify-content:flex-end;margin-top:8px}.kit-assignment section{padding:12px 0;border-bottom:1px solid #e7ece8}.kit-assignment h3{margin:0 0 12px;font-size:14px}.kit-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.kit-fields label>span{display:block;margin-bottom:6px;color:#627168;font-size:12px}.kit-fields .el-select{width:100%}.kit-color-swatch{display:inline-block;width:14px;height:14px;margin-right:8px;border:1px solid #bfc9c2;border-radius:2px;vertical-align:-2px}@media(max-width:600px){.assignment-form,.kit-fields{grid-template-columns:1fr}}
.workbench-table tr.next-match-row{background:#edf7f0}.workbench-table tr.next-match-row td:first-child{box-shadow:inset 3px 0 #087b43}
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
</style>
