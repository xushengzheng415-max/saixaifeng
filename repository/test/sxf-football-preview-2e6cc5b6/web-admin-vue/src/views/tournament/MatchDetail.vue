<template>
  <div class="match-detail">
    <!-- 顶部导航 -->
    <el-page-header @back="goBack" :title="`比赛详情`">
      <template #content>
        <span class="header-match-name">
          {{ homeName }} vs {{ awayName }}
        </span>
        <el-tag :type="statusTagType" size="small" style="margin-left: 8px;">{{ statusLabel }}</el-tag>
      </template>
    </el-page-header>

    <!-- 比赛核心信息 -->
    <div class="match-hero" :class="'status-bg-' + (match.status || 'scheduled')">
      <div class="hero-team hero-home">
        <img v-if="homeLogo" :src="homeLogo" :alt="`${homeName || '主队'}队徽`" class="hero-logo" @error="handleTeamLogoError('home')" />
        <div class="hero-logo-placeholder" v-else>{{ homeName?.[0] || '?' }}</div>
        <div class="hero-team-name">{{ homeName || '待定' }}</div>
      </div>

      <div class="hero-score-area">
        <template v-if="match.status === 'finished' || match.status === 'completed'">
          <div class="hero-score">
            <span class="score-num">{{ displayHomeScore }}</span>
            <span class="score-sep">:</span>
            <span class="score-num">{{ displayAwayScore }}</span>
          </div>
          <div class="hero-match-time">{{ match.matchDate }} {{ match.matchTime }}</div>
          <div class="hero-venue">{{ match.venue || '场地待定' }}</div>
        </template>
        <template v-else>
          <div class="hero-vs">VS</div>
          <div class="hero-match-time">{{ match.matchDate || '--' }} {{ match.matchTime || '--:--' }}</div>
          <div class="hero-venue">{{ match.venue || '场地待定' }}</div>
        </template>
      </div>

      <div class="hero-team hero-away">
        <img v-if="awayLogo" :src="awayLogo" :alt="`${awayName || '客队'}队徽`" class="hero-logo" @error="handleTeamLogoError('away')" />
        <div class="hero-logo-placeholder" v-else>{{ awayName?.[0] || '?' }}</div>
        <div class="hero-team-name">{{ awayName || '待定' }}</div>
      </div>
    </div>

    <!-- 操作栏 -->
    <div v-if="!isRefereeEvidenceLocked" class="detail-actions">
      <el-button @click="openEditDialog" size="small">
        <el-icon><Edit /></el-icon> 编辑比赛
      </el-button>
      <el-button
        v-if="match.status === 'scheduled'"
        type="success"
        size="small"
        @click="updateStatus('ongoing')"
        :loading="saving"
      >开始比赛</el-button>
      <el-button
        v-if="match.status === 'ongoing'"
        type="warning"
        size="small"
        @click="openFinishDialog"
        :loading="saving"
      >结束比赛</el-button>
      <el-button
        v-if="match.status === 'ongoing'"
        type="info"
        size="small"
        @click="updateStatus('scheduled')"
        :loading="saving"
      >重置为未开始</el-button>
      <el-button
        v-if="match.status === 'scheduled'"
        type="warning"
        size="small"
        @click="updateStatus('postponed')"
        :loading="saving"
      >延期</el-button>
    </div>

    <section v-if="canReviewRefereeRecord" class="referee-review-bar">
      <div>
        <strong>裁判电子记录待复核</strong>
        <span>比分、阵容、事件、报告及签字均为只读证据；退回不会直接改写现场数据。</span>
      </div>
      <div class="referee-review-actions">
        <el-button type="warning" plain @click="openReturnRecordDialog">退回裁判修正</el-button>
        <el-button type="success" @click="archiveRefereeRecord" :loading="reviewSaving">确认无误并归档</el-button>
      </div>
    </section>

    <div class="detail-body">
      <!-- 左侧：事件时间线 -->
      <div class="detail-main">
        <el-tabs v-model="activeTab" class="detail-tabs">
          <!-- 双方阵容 -->
          <el-tab-pane name="lineup">
            <template #label><el-icon><User /></el-icon> 出场阵容</template>
            <div class="lineup-header">
              <div class="lineup-title">{{ homeName }} vs {{ awayName }}</div>
              <div class="lineup-actions">
                <el-button v-if="!isRefereeEvidenceLocked" size="small" @click="openDualVisualEditor" :loading="visualEditorOpening">
                  <el-icon><Picture /></el-icon> 可视化布置
                </el-button>
                <el-button v-if="!isRefereeEvidenceLocked" type="primary" size="small" @click="openLineupDialog">
                  <el-icon><Edit /></el-icon> 编辑阵容
                </el-button>
                <el-button v-if="hasLineups" type="success" size="small" @click="openPreviewDialog">
                  <el-icon><View /></el-icon> 预览首发名单（中超版）
                </el-button>
                <el-dropdown v-if="canDownloadRefereeSheet" trigger="click" @command="handleRefereeSheetCommand">
                  <el-button size="small" :loading="refereeSheetLoading" title="工作单只在本机生成，不会上传裁判填写内容">
                    裁判工作单<el-icon class="el-icon--right"><ArrowDown /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="download">下载 Word 工作单</el-dropdown-item>
                      <el-dropdown-item command="print">打印工作单</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </div>
            <div v-if="hasLineups" ref="lineupExportArea" class="lineup-container">
              <!-- 主队阵容 -->
              <div class="lineup-side">
                <div class="lineup-team-header">
                  <span class="team-badge">
                    <img v-if="homeLogo" :src="homeLogo" :alt="`${homeName || '主队'}队徽`" @error="handleTeamLogoError('home')" />
                    <span v-else>{{ homeName?.[0] || '主' }}</span>
                  </span>
                  <div>
                    <div class="team-name">{{ homeName || '主队' }}</div>
                    <div class="team-formation" v-if="lineups.home?.formation">阵型 {{ lineups.home.formation }}</div>
                  </div>
                </div>
                <!-- 首发 -->
                <div class="lineup-section-title">首发球员</div>
                <div class="lineup-table-header">
                  <span class="col-num">号码</span>
                  <span class="col-pos">位置</span>
                  <span class="col-name">姓名</span>
                  <span class="col-jersey">球衣名</span>
                </div>
                <div
                  v-for="(p, i) in homeLineupPlayers"
                  :key="'h-'+i"
                  class="lineup-player"
                  :class="{ 'is-captain': p.isCaptain, 'is-foreign': p.isForeign }"
                >
                  <span class="col-num">{{ p.number }}</span>
                  <span class="col-pos">{{ formatPosition(p.position) }}</span>
                  <span class="col-name">
                    {{ p.name }}
                    <el-tag v-if="p.isCaptain" size="small" type="warning" style="margin-left: 4px;">C</el-tag>
                    <el-tag v-if="p.isForeign" size="small" style="margin-left: 4px;">F</el-tag>
                  </span>
                  <span class="col-jersey">{{ p.jerseyName || '-' }}</span>
                </div>
                <!-- 替补 -->
                <div class="lineup-section-title" v-if="homeLineupSubstitutes.length">替补球员</div>
                <div
                  v-for="(p, i) in homeLineupSubstitutes"
                  :key="'hs-'+i"
                  class="lineup-player sub"
                >
                  <span class="col-num">{{ p.number }}</span>
                  <span class="col-pos">{{ formatPosition(p.position) }}</span>
                  <span class="col-name">{{ p.name }}</span>
                  <span class="col-jersey">{{ p.jerseyName || '-' }}</span>
                </div>
                <div class="lineup-coach" v-if="lineups.home?.coach">主教练：{{ lineups.home.coach }}</div>
              </div>

              <!-- 客队阵容 -->
              <div class="lineup-side">
                <div class="lineup-team-header">
                  <span class="team-badge away">
                    <img v-if="awayLogo" :src="awayLogo" :alt="`${awayName || '客队'}队徽`" @error="handleTeamLogoError('away')" />
                    <span v-else>{{ awayName?.[0] || '客' }}</span>
                  </span>
                  <div>
                    <div class="team-name">{{ awayName || '客队' }}</div>
                    <div class="team-formation" v-if="lineups.away?.formation">阵型 {{ lineups.away.formation }}</div>
                  </div>
                </div>
                <!-- 首发 -->
                <div class="lineup-section-title">首发球员</div>
                <div class="lineup-table-header">
                  <span class="col-num">号码</span>
                  <span class="col-pos">位置</span>
                  <span class="col-name">姓名</span>
                  <span class="col-jersey">球衣名</span>
                </div>
                <div
                  v-for="(p, i) in awayLineupPlayers"
                  :key="'a-'+i"
                  class="lineup-player"
                  :class="{ 'is-captain': p.isCaptain, 'is-foreign': p.isForeign }"
                >
                  <span class="col-num">{{ p.number }}</span>
                  <span class="col-pos">{{ formatPosition(p.position) }}</span>
                  <span class="col-name">
                    {{ p.name }}
                    <el-tag v-if="p.isCaptain" size="small" type="warning" style="margin-left: 4px;">C</el-tag>
                    <el-tag v-if="p.isForeign" size="small" style="margin-left: 4px;">F</el-tag>
                  </span>
                  <span class="col-jersey">{{ p.jerseyName || '-' }}</span>
                </div>
                <!-- 替补 -->
                <div class="lineup-section-title" v-if="awayLineupSubstitutes.length">替补球员</div>
                <div
                  v-for="(p, i) in awayLineupSubstitutes"
                  :key="'as-'+i"
                  class="lineup-player sub"
                >
                  <span class="col-num">{{ p.number }}</span>
                  <span class="col-pos">{{ formatPosition(p.position) }}</span>
                  <span class="col-name">{{ p.name }}</span>
                  <span class="col-jersey">{{ p.jerseyName || '-' }}</span>
                </div>
                <div class="lineup-coach" v-if="lineups.away?.coach">主教练：{{ lineups.away.coach }}</div>
              </div>
            </div>
            <el-empty v-else :description="lineupEmptyDescription" />
          </el-tab-pane>

          <!-- 比赛事件 -->
          <el-tab-pane name="events">
            <template #label><el-icon><Soccer /></el-icon> 比赛事件</template>
            <el-alert v-if="substitutionAudit.issues.length" type="warning" :closable="false" show-icon :title="`换人记录存在 ${substitutionAudit.issues.length} 项异常`" :description="substitutionAudit.issues.map(item => `${item.side === 'home' ? homeName : awayName} ${item.minute}′：${item.message}`).join('；')" />
            <div v-if="sortedEvents.length" class="event-summary-grid">
              <div v-for="item in eventSummary" :key="item.key" class="event-summary-item">
                <span class="event-summary-icon">{{ item.icon }}</span>
                <div>
                  <strong>{{ item.value }}</strong>
                  <span>{{ item.label }}</span>
                </div>
              </div>
            </div>
            <div class="events-timeline">
              <div v-if="sortedEvents.length === 0" class="events-empty">
                暂无比赛事件<el-button v-if="!isRefereeEvidenceLocked" link type="primary" @click="openAddEventDialog">，+ 添加事件</el-button>
              </div>
              <div v-for="(evt, i) in sortedEvents" :key="eventRowKey(evt, i)" class="event-row" :class="'event-' + evt.type">
                <div class="event-time">{{ eventTimeText(evt) }}</div>
                <div class="event-icon">
                  <img v-if="isSecondYellowRed(evt)" :src="yellowRedCardIcon" alt="2黄变1红" />
                  <img v-else-if="eventIconAsset(evt.type)" :src="eventIconAsset(evt.type)" :alt="eventIconAlt(evt.type)" />
                  <span v-else>{{ eventIcon(evt.type) }}</span>
                </div>
                <div class="event-content">
                  <span class="event-type-label">{{ eventLabel(evt) }}</span>
                  <template v-if="evt.type === 'substitution'">
                    <span class="event-period">{{ substitutionPeriodLabel(evt.substitutionPeriod) }}</span>
                    <span class="event-player">换上：{{ evt.playerName }}</span>
                    <span v-if="evt.assistName" class="event-assist">换下：{{ evt.assistName }}</span>
                  </template>
                  <template v-else>
                    <span class="event-player">{{ evt.playerName }}</span>
                    <span v-if="evt.assistName" class="event-assist">助攻：{{ evt.assistName }}</span>
                  </template>
                  <span v-if="evt.teamSide" class="event-side">{{ evt.teamSide === 'home' ? homeName : awayName }}</span>
                </div>
                <el-button v-if="!isRefereeEvidenceLocked" size="small" text type="danger" @click="removeEvent(evt)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>
            <el-button v-if="!isRefereeEvidenceLocked" type="primary" plain size="small" @click="openAddEventDialog" style="margin-top: 12px;">
              <el-icon><Plus /></el-icon> 添加事件
            </el-button>
          </el-tab-pane>

          <!-- 数据统计 -->
          <el-tab-pane name="stats">
            <template #label><el-icon><DataLine /></el-icon> 数据统计</template>
            <div class="match-stats-panel">
              <div class="stats-score-row">
                <span>{{ homeName || '主队' }}</span>
                <strong>{{ displayHomeScore }} : {{ displayAwayScore }}</strong>
                <span>{{ awayName || '客队' }}</span>
              </div>
              <div class="event-summary-grid stats-summary-grid">
                <div v-for="item in eventSummary" :key="item.key" class="event-summary-item">
                  <span class="event-summary-icon">{{ item.icon }}</span>
                  <div>
                    <strong>{{ item.value }}</strong>
                    <span>{{ item.label }}</span>
                  </div>
                </div>
              </div>
              <div v-if="sortedEvents.length === 0" class="stats-empty">暂无比赛事件数据</div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>

      <!-- 右侧：比赛信息 -->
      <div class="detail-sidebar">
        <div class="info-card">
          <div class="info-card-title">比赛信息</div>
          <div class="info-row"><span class="info-label">场序</span><span>{{ match.matchSequence || match.sequence || '--' }}</span></div>
          <div class="info-row"><span class="info-label">日期</span><span>{{ match.matchDate || '--' }}</span></div>
          <div class="info-row"><span class="info-label">时间</span><span>{{ match.matchTime || '--:--' }}</span></div>
          <div class="info-row"><span class="info-label">场地</span><span>{{ match.venue || '待定' }}</span></div>
          <div class="info-row"><span class="info-label">阶段</span><span>{{ phaseLabel }}</span></div>
          <div class="info-row"><span class="info-label">轮次</span><span>{{ roundLabel }}</span></div>
        </div>

        <!-- 裁判组信息 -->
        <div class="info-card">
          <div class="info-card-title">
            裁判组
            <el-button v-if="!isRefereeEvidenceLocked" link type="primary" size="small" @click="openRefereeDialog" style="margin-left: auto;">
              <el-icon><Edit /></el-icon>
            </el-button>
          </div>
          <div v-if="hasRefereeCrew">
            <div class="info-row" v-for="role in refereeRoleOptions" :key="role.key" v-show="refereeCrew[role.key]?.name">
              <span class="info-label">{{ role.label }}</span><span>{{ refereeCrew[role.key]?.name }}</span>
            </div>
            <div class="info-row" v-if="operationRefereeName">
              <span class="info-label">操作负责人</span><span>{{ operationRefereeName }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">裁判报告</span>
              <span>{{ match.refereeReportStatus === 'submitted' ? '已提交并锁定' : '未提交' }}</span>
            </div>
          </div>
          <div v-else class="info-empty">暂无裁判信息</div>
        </div>

        <!-- 球服颜色 -->
        <div class="info-card">
          <div class="info-card-title">
            球服颜色
            <el-button v-if="!isRefereeEvidenceLocked" link type="primary" size="small" @click="openKitDialog" style="margin-left: auto;">
              <el-icon><Edit /></el-icon>
            </el-button>
          </div>
          <div v-if="hasKitColors">
            <div class="kit-row">
              <span class="kit-label">{{ homeName || '主队' }}</span>
              <el-tag size="small" effect="plain" type="success">{{ kitSetLabel('home') }}</el-tag>
              <div class="kit-dots">
                <el-tooltip content="上衣" placement="top">
                  <span class="kit-dot" v-if="kitColors.home?.jersey" :style="{ backgroundColor: kitColorCss(kitColors.home.jersey) }"></span>
                </el-tooltip>
                <el-tooltip content="短裤" placement="top">
                  <span class="kit-dot" v-if="kitColors.home?.shorts" :style="{ backgroundColor: kitColorCss(kitColors.home.shorts) }"></span>
                </el-tooltip>
                <el-tooltip content="球袜" placement="top">
                  <span class="kit-dot" v-if="kitColors.home?.socks" :style="{ backgroundColor: kitColorCss(kitColors.home.socks) }"></span>
                </el-tooltip>
              </div>
            </div>
            <div class="kit-row">
              <span class="kit-label">{{ awayName || '客队' }}</span>
              <el-tag size="small" effect="plain" type="success">{{ kitSetLabel('away') }}</el-tag>
              <div class="kit-dots">
                <el-tooltip content="上衣" placement="top">
                  <span class="kit-dot" v-if="kitColors.away?.jersey" :style="{ backgroundColor: kitColorCss(kitColors.away.jersey) }"></span>
                </el-tooltip>
                <el-tooltip content="短裤" placement="top">
                  <span class="kit-dot" v-if="kitColors.away?.shorts" :style="{ backgroundColor: kitColorCss(kitColors.away.shorts) }"></span>
                </el-tooltip>
                <el-tooltip content="球袜" placement="top">
                  <span class="kit-dot" v-if="kitColors.away?.socks" :style="{ backgroundColor: kitColorCss(kitColors.away.socks) }"></span>
                </el-tooltip>
              </div>
            </div>
          </div>
          <div v-else class="info-empty">未设置球服颜色</div>
        </div>

        <div class="info-card" v-if="match.refereeNote">
          <div class="info-card-title">裁判备注</div>
          <div class="ref-note">{{ match.refereeNote }}</div>
        </div>
      </div>
    </div>

    <!-- 编辑比赛弹窗（复用赛程页逻辑） -->
    <el-dialog v-model="editDialogVisible" title="编辑比赛" width="520px">
      <el-form :model="editForm" label-width="80px">
        <el-form-item label="日期">
          <el-date-picker v-model="editForm.matchDate" type="date" format="YYYY-MM-DD" value-format="YYYY-MM-DD" style="width:100%;" />
        </el-form-item>
        <el-form-item label="时间">
          <el-time-select v-model="editForm.matchTime" start="06:00" step="00:15" end="23:00" format="HH:mm" style="width:100%;" />
        </el-form-item>
        <el-form-item label="场地">
          <el-select v-model="editForm.venue" allow-create filterable style="width:100%;">
            <el-option v-for="v in venueOptions" :key="v" :label="v" :value="v" />
          </el-select>
        </el-form-item>
        <el-form-item label="主队">
          <el-select v-model="editForm.homeTeamId" style="width:100%;">
            <el-option v-for="t in allTeams" :key="t.teamId" :label="t.teamName" :value="t.teamId" />
          </el-select>
        </el-form-item>
        <el-form-item label="客队">
          <el-select v-model="editForm.awayTeamId" style="width:100%;">
            <el-option v-for="t in allTeams" :key="t.teamId" :label="t.teamName" :value="t.teamId" />
          </el-select>
        </el-form-item>
        <el-form-item label="裁判">
          <el-select v-model="editForm.refereeId" style="width:100%;">
            <el-option label="未指派" :value="null" />
            <el-option v-for="r in referees" :key="r._id" :label="r.name" :value="r._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="editForm.status" style="width:100%;">
            <el-option label="未开始" value="scheduled" />
            <el-option label="进行中" value="ongoing" />
            <el-option label="已结束" value="finished" />
            <el-option label="延期" value="postponed" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
        <el-form-item label="比分（主:客）" v-if="editForm.status === 'finished'">
          <el-input-number v-model="editForm.homeScore" :min="0" style="width:100px;" />
          <span style="margin: 0 8px;">:</span>
          <el-input-number v-model="editForm.awayScore" :min="0" style="width:100px;" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveMatchEdit" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 结束比赛 / 录入比分弹窗 -->
    <el-dialog v-model="finishDialogVisible" title="结束比赛 · 录入比分" width="560px" class="finish-dialog">
      <div class="finish-score-input">
        <article class="finish-score-team">
          <small>主队</small>
          <strong>{{ homeName || '主队' }}</strong>
          <el-input-number v-model="finishForm.homeScore" :min="0" :max="99" controls-position="right" size="large" :disabled="hasStructuredEvents" />
        </article>
        <span class="finish-sep">:</span>
        <article class="finish-score-team">
          <small>客队</small>
          <strong>{{ awayName || '客队' }}</strong>
          <el-input-number v-model="finishForm.awayScore" :min="0" :max="99" controls-position="right" size="large" :disabled="hasStructuredEvents" />
        </article>
      </div>
      <template #footer>
        <el-button @click="finishDialogVisible = false">取消</el-button>
        <el-button type="success" @click="finishMatch" :loading="saving">确认结束</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="returnRecordDialogVisible" title="退回裁判限定修正" width="560px">
      <el-alert type="warning" :closable="false" title="主办方不能直接修改裁判现场记录。请选择需要更正的进球事件，并填写退回原因。" style="margin-bottom: 16px;" />
      <el-form label-position="top">
        <el-form-item label="退回原因" required>
          <el-input v-model="returnRecordForm.reason" type="textarea" :rows="3" maxlength="300" show-word-limit placeholder="例如：第 58 分钟进球球员与事件记录不一致" />
        </el-form-item>
        <el-form-item label="允许修正的事件球员字段" required>
          <el-checkbox-group v-model="returnRecordForm.fields">
            <el-checkbox v-for="eventItem in returnableEvents" :key="eventItem.eventId" :label="`event_player:${eventItem.eventId}`">
              {{ eventItem.minute }}′ · {{ eventItem.playerName || '未填写球员' }} · {{ eventItem.teamSide === 'away' ? awayName : homeName }}
            </el-checkbox>
          </el-checkbox-group>
          <el-empty v-if="!returnableEvents.length" description="没有可退回的结构化进球事件" :image-size="70" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="returnRecordDialogVisible = false">取消</el-button>
        <el-button type="warning" @click="returnRefereeRecord" :loading="reviewSaving">确认退回</el-button>
      </template>
    </el-dialog>

    <!-- 裁判组编辑弹窗 -->
    <el-dialog v-model="refereeDialogVisible" title="编辑裁判组" width="520px">
      <el-form :model="refereeForm" label-width="110px" size="default">
        <el-alert :title="`${currentMatchFormatLabel}固定安排4人；只有操作负责人可以进入手机端执法`" type="info" :closable="false" style="margin-bottom:16px;" />
        <el-form-item v-for="role in refereeRoleOptions" :key="role.key" :label="role.label" required>
          <el-select v-model="refereeForm[role.key]" :placeholder="`请选择${role.label}`" style="width:100%;" filterable>
            <el-option v-for="r in referees" :key="r._id" :label="`${r.name}（${r.phone || '-'}）`" :value="r._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作负责人" required>
          <el-select v-model="refereeForm.operationRefereeId" style="width:100%;">
            <el-option v-for="r in selectedCrewOptions" :key="r._id" :label="r.name" :value="r._id" />
          </el-select>
          <div style="color:#909399;font-size:12px;">每场只设1名操作人员，负责开始比赛、记录事件、结束比赛和提交裁判报告</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="refereeDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveRefereeCrew" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 球服颜色编辑弹窗 -->
    <el-dialog v-model="kitDialogVisible" title="编辑球服颜色" width="520px">
      <div class="kit-edit-section">
        <div class="kit-edit-team">
          <div class="kit-edit-title">{{ homeName || '主队' }}（主场）</div>
          <div class="kit-set-picker"><span class="kit-color-label">选择套装</span><el-select v-model="kitForm.homeSet" size="small" style="width:150px"><el-option label="主比赛服" value="primary" /><el-option label="备用比赛服" value="secondary" :disabled="!hasKitSet('home','secondary')" /></el-select></div>
          <div class="kit-preview-row"><span>上衣</span><i :style="kitPreviewStyle('home','jersey')"></i><b>{{ selectedKitColor('home','jersey') || '未设置' }}</b><span>短裤</span><i :style="kitPreviewStyle('home','shorts')"></i><b>{{ selectedKitColor('home','shorts') || '未设置' }}</b><span>球袜</span><i :style="kitPreviewStyle('home','socks')"></i><b>{{ selectedKitColor('home','socks') || '未设置' }}</b></div>
        </div>

        <el-divider>VS</el-divider>

        <div class="kit-edit-team">
          <div class="kit-edit-title away">{{ awayName || '客队' }}（客场）</div>
          <div class="kit-set-picker"><span class="kit-color-label">选择套装</span><el-select v-model="kitForm.awaySet" size="small" style="width:150px"><el-option label="主比赛服" value="primary" /><el-option label="备用比赛服" value="secondary" :disabled="!hasKitSet('away','secondary')" /></el-select></div>
          <div class="kit-preview-row"><span>上衣</span><i :style="kitPreviewStyle('away','jersey')"></i><b>{{ selectedKitColor('away','jersey') || '未设置' }}</b><span>短裤</span><i :style="kitPreviewStyle('away','shorts')"></i><b>{{ selectedKitColor('away','shorts') || '未设置' }}</b><span>球袜</span><i :style="kitPreviewStyle('away','socks')"></i><b>{{ selectedKitColor('away','socks') || '未设置' }}</b></div>
        </div>
      </div>
      <template #footer>
        <el-button @click="kitDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveKitColors" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 首发阵容编辑弹窗 -->
    <el-dialog
      v-model="lineupDialogVisible"
      title="编辑出场阵容"
      width="1200px"
      :close-on-click-modal="false"
    >
      <div class="lineup-edit-container">
        <!-- 主队 -->
        <div class="lineup-edit-side">
            <div class="lineup-edit-header">
              <span class="let-team-name">{{ homeName || '主队' }}</span>
              <div style="display:flex;gap:8px;align-items:center;">
                <el-select v-model="lineupForm.home.formation" placeholder="阵型" style="width: 100px;" size="small" clearable>
                  <el-option label="4-4-2" value="4-4-2" />
                  <el-option label="4-3-3" value="4-3-3" />
                  <el-option label="4-2-3-1" value="4-2-3-1" />
                  <el-option label="3-5-2" value="3-5-2" />
                  <el-option label="5-3-2" value="5-3-2" />
                  <el-option label="4-1-4-1" value="4-1-4-1" />
                  <el-option label="4-5-1" value="4-5-1" />
                  <el-option label="3-4-3" value="3-4-3" />
                </el-select>
              </div>
            </div>
          <div class="lineup-edit-coach">
            主教练 <el-input v-model="lineupForm.home.coach" placeholder="教练姓名" size="small" style="width: 120px; margin-left: 6px;" />
          </div>
          <div class="lineup-edit-table-head">
            <span class="le-col-num">号码</span>
            <span class="le-col-pos">位置</span>
            <span class="le-col-name">姓名</span>
            <span class="le-col-jersey">球衣名</span>
            <span class="le-col-flags">标记</span>
            <span class="le-col-act"></span>
          </div>
          <div class="lineup-edit-subtitle">首发（11人）</div>
          <div
            v-for="(p, i) in lineupForm.home.players"
            :key="'h-'+i"
            class="lineup-edit-row"
          >
            <el-select v-model="p.number" placeholder="#" size="small" class="le-input-num" filterable clearable allow-create>
              <el-option v-for="n in 99" :key="n" :label="n" :value="n" />
            </el-select>
            <el-select v-model="p.position" size="small" class="le-input-pos">
              <el-option v-for="pos in positionOptions" :key="pos.value" :label="pos.label" :value="pos.value" />
            </el-select>
            <el-select v-model="p.name" placeholder="选择球员" size="small" class="le-input-name" filterable allow-create @change="onPlayerSelect('home', 'starting', i, $event)">
              <el-option v-for="pl in homePlayers" :key="pl._id" :label="pl.name" :value="pl.name" />
            </el-select>
            <el-input v-model="p.jerseyName" placeholder="球衣名" size="small" class="le-input-jersey" />
            <div class="le-flags">
              <el-checkbox v-model="p.isCaptain" label="C" size="small" title="队长" />
              <el-checkbox v-model="p.isForeign" label="F" size="small" title="外援" />
              <el-checkbox v-model="p.isYoung" label="☆" size="small" title="低龄球员" />
              <el-checkbox v-model="p.isOverage" label="◇" size="small" title="超龄球员" />
            </div>
            <el-button size="small" text type="danger" @click="removePlayer('home', 'starting', i)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <div class="lineup-edit-add">
            <el-button size="small" text type="primary" @click="addPlayer('home', 'starting')" :disabled="lineupForm.home.players.length >= 11">
              + 添加首发
            </el-button>
          </div>
          <div class="lineup-edit-subtitle" style="margin-top:12px;">替补</div>
          <div
            v-for="(p, i) in lineupForm.home.substitutes"
            :key="'hs-'+i"
            class="lineup-edit-row"
          >
            <el-select v-model="p.number" placeholder="#" size="small" class="le-input-num" filterable clearable allow-create>
              <el-option v-for="n in 99" :key="n" :label="n" :value="n" />
            </el-select>
            <el-select v-model="p.position" size="small" class="le-input-pos">
              <el-option v-for="pos in positionOptions" :key="pos.value" :label="pos.label" :value="pos.value" />
            </el-select>
            <el-select v-model="p.name" placeholder="选择球员" size="small" class="le-input-name" filterable allow-create @change="onPlayerSelect('home', 'sub', i, $event)">
              <el-option v-for="pl in homePlayers" :key="pl._id" :label="pl.name" :value="pl.name" />
            </el-select>
            <el-input v-model="p.jerseyName" placeholder="球衣名" size="small" class="le-input-jersey" />
            <div class="le-flags">
              <el-checkbox v-model="p.isCaptain" label="C" size="small" title="队长" />
              <el-checkbox v-model="p.isForeign" label="F" size="small" title="外援" />
              <el-checkbox v-model="p.isYoung" label="☆" size="small" title="低龄球员" />
              <el-checkbox v-model="p.isOverage" label="◇" size="small" title="超龄球员" />
            </div>
            <el-button size="small" text type="danger" @click="removePlayer('home', 'sub', i)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <div class="lineup-edit-add">
            <el-button size="small" text type="primary" @click="addPlayer('home', 'sub')">
              + 添加替补
            </el-button>
          </div>
        </div>

        <!-- 客队 -->
        <div class="lineup-edit-side">
            <div class="lineup-edit-header">
              <span class="let-team-name">{{ awayName || '客队' }}</span>
              <div style="display:flex;gap:8px;align-items:center;">
                <el-select v-model="lineupForm.away.formation" placeholder="阵型" style="width: 100px;" size="small" clearable>
                  <el-option label="4-4-2" value="4-4-2" />
                  <el-option label="4-3-3" value="4-3-3" />
                  <el-option label="4-2-3-1" value="4-2-3-1" />
                  <el-option label="3-5-2" value="3-5-2" />
                  <el-option label="5-3-2" value="5-3-2" />
                  <el-option label="4-1-4-1" value="4-1-4-1" />
                  <el-option label="4-5-1" value="4-5-1" />
                  <el-option label="3-4-3" value="3-4-3" />
                </el-select>
              </div>
            </div>
          <div class="lineup-edit-coach">
            主教练 <el-input v-model="lineupForm.away.coach" placeholder="教练姓名" size="small" style="width: 120px; margin-left: 6px;" />
          </div>
          <div class="lineup-edit-table-head">
            <span class="le-col-num">号码</span>
            <span class="le-col-pos">位置</span>
            <span class="le-col-name">姓名</span>
            <span class="le-col-jersey">球衣名</span>
            <span class="le-col-flags">标记</span>
            <span class="le-col-act"></span>
          </div>
          <div class="lineup-edit-subtitle">首发（11人）</div>
          <div
            v-for="(p, i) in lineupForm.away.players"
            :key="'a-'+i"
            class="lineup-edit-row"
          >
            <el-select v-model="p.number" placeholder="#" size="small" class="le-input-num" filterable clearable allow-create>
              <el-option v-for="n in 99" :key="n" :label="n" :value="n" />
            </el-select>
            <el-select v-model="p.position" size="small" class="le-input-pos">
              <el-option v-for="pos in positionOptions" :key="pos.value" :label="pos.label" :value="pos.value" />
            </el-select>
            <el-select v-model="p.name" placeholder="选择球员" size="small" class="le-input-name" filterable allow-create @change="onPlayerSelect('away', 'starting', i, $event)">
              <el-option v-for="pl in awayPlayers" :key="pl._id" :label="pl.name" :value="pl.name" />
            </el-select>
            <el-input v-model="p.jerseyName" placeholder="球衣名" size="small" class="le-input-jersey" />
            <div class="le-flags">
              <el-checkbox v-model="p.isCaptain" label="C" size="small" title="队长" />
              <el-checkbox v-model="p.isForeign" label="F" size="small" title="外援" />
              <el-checkbox v-model="p.isYoung" label="☆" size="small" title="低龄球员" />
              <el-checkbox v-model="p.isOverage" label="◇" size="small" title="超龄球员" />
            </div>
            <el-button size="small" text type="danger" @click="removePlayer('away', 'starting', i)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <div class="lineup-edit-add">
            <el-button size="small" text type="primary" @click="addPlayer('away', 'starting')" :disabled="lineupForm.away.players.length >= 11">
              + 添加首发
            </el-button>
          </div>
          <div class="lineup-edit-subtitle" style="margin-top:12px;">替补</div>
          <div
            v-for="(p, i) in lineupForm.away.substitutes"
            :key="'as-'+i"
            class="lineup-edit-row"
          >
            <el-select v-model="p.number" placeholder="#" size="small" class="le-input-num" filterable clearable allow-create>
              <el-option v-for="n in 99" :key="n" :label="n" :value="n" />
            </el-select>
            <el-select v-model="p.position" size="small" class="le-input-pos">
              <el-option v-for="pos in positionOptions" :key="pos.value" :label="pos.label" :value="pos.value" />
            </el-select>
            <el-select v-model="p.name" placeholder="选择球员" size="small" class="le-input-name" filterable allow-create @change="onPlayerSelect('away', 'sub', i, $event)">
              <el-option v-for="pl in awayPlayers" :key="pl._id" :label="pl.name" :value="pl.name" />
            </el-select>
            <el-input v-model="p.jerseyName" placeholder="球衣名" size="small" class="le-input-jersey" />
            <div class="le-flags">
              <el-checkbox v-model="p.isCaptain" label="C" size="small" title="队长" />
              <el-checkbox v-model="p.isForeign" label="F" size="small" title="外援" />
              <el-checkbox v-model="p.isYoung" label="☆" size="small" title="低龄球员" />
              <el-checkbox v-model="p.isOverage" label="◇" size="small" title="超龄球员" />
            </div>
            <el-button size="small" text type="danger" @click="removePlayer('away', 'sub', i)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <div class="lineup-edit-add">
            <el-button size="small" text type="primary" @click="addPlayer('away', 'sub')">
              + 添加替补
            </el-button>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="lineupDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveLineup" :loading="saving">保存阵容</el-button>
      </template>
    </el-dialog>

    <!-- 可视化阵容编辑弹窗（双队模式） -->
    <el-dialog
      v-model="visualEditorVisible"
      title="编辑双方首发阵容（可视化）"
      width="95%"
      :close-on-click-modal="false"
      top="2vh"
    >
      <VisualLineupEditor
        v-if="visualEditorVisible"
        mode="dual"
        :homeTeamName="homeName"
        :awayTeamName="awayName"
        :homeTeamLogo="homeLogo"
        :awayTeamLogo="awayLogo"
        :homePlayersList="homePlayers"
        :awayPlayersList="awayPlayers"
        :playerCount="currentPlayerCount"
        :substitutePlayerLimit="substitutePlayerLimit"
        :homeInitialLineup="match.lineups?.home"
        :awayInitialLineup="match.lineups?.away"
        @save="handleVisualLineupSave"
      />
    </el-dialog>

    <!-- 添加比赛事件弹窗 -->
    <el-dialog v-model="eventDialogVisible" title="添加比赛事件" width="680px" class="event-dialog">
      <el-form v-loading="eventPlayersLoading" :model="eventForm" label-position="top" class="event-form">
        <div class="event-form-grid">
          <el-form-item label="事件类型">
          <el-select v-model="eventForm.type" style="width:100%">
            <el-option label="进球 ⚽" value="goal" />
            <el-option label="助攻 👟" value="assist" />
            <el-option label="黄牌 🟨" value="yellow_card" />
            <el-option label="红牌 🔴" value="red_card" />
            <el-option label="2黄变1红 🟨🔴" value="second_yellow_red" />
            <el-option label="换人 🔄" value="substitution" />
            <el-option label="点球打进 ⚽（P）" value="penalty_scored" />
            <el-option label="点球未进" value="penalty_missed" />
            <el-option label="乌龙球 ⚽（OG）" value="own_goal" />
          </el-select>
          </el-form-item>
          <el-form-item label="时间（分钟）">
            <el-select v-model="eventForm.minute" filterable placeholder="选择比赛分钟" style="width:100%">
              <el-option v-for="option in eventMinuteOptions" :key="option.value" :label="option.label" :value="option.value" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="球队" class="event-team-item">
          <el-radio-group v-model="eventForm.teamSide" class="event-team-options">
            <el-radio :value="'home'">{{ homeName || '主队' }}</el-radio>
            <el-radio :value="'away'">{{ awayName || '客队' }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <template v-if="eventForm.type === 'substitution'">
          <el-alert :title="effectiveSubstitutionRules.label" type="info" :closable="false" />
          <el-alert v-if="!substitutionInputState.known" title="缺少本场首发名单，请先补齐阵容" type="warning" :closable="false" />
          <el-alert v-else-if="substitutionInputState.issues.length" :title="`本队已有换人异常：${substitutionInputState.issues[0].message}`" type="warning" :closable="false" />
          <el-form-item label="换人时段" required>
            <el-radio-group v-model="eventForm.substitutionPeriod" class="substitution-period-options">
              <el-radio-button v-for="option in substitutionPeriodOptions" :key="option.value" :value="option.value">{{ option.label }}</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <section class="substitution-editor">
            <header><div><strong>换人名单</strong><span>每次最多5组</span></div><el-button size="small" plain type="primary" :disabled="eventForm.substitutions.length >= 5" @click="addSubstitutionRow"><el-icon><Plus /></el-icon>增加一组</el-button></header>
            <div v-for="(row,index) in eventForm.substitutions" :key="index" class="substitution-row">
              <span class="substitution-index">{{ index + 1 }}</span>
              <el-select v-model="row.outId" filterable clearable placeholder="选择当前在场球员"><el-option v-for="player in substitutionOutOptions(index)" :key="player.value" :label="player.label" :value="player.value" /></el-select>
              <el-icon class="substitution-arrow"><Right /></el-icon>
              <el-select v-model="row.inId" filterable clearable placeholder="选择可用替补"><el-option v-for="player in substitutionInOptions(index)" :key="player.value" :label="player.label" :value="player.value" /></el-select>
              <el-button v-if="eventForm.substitutions.length > 1" text type="danger" circle aria-label="删除这组换人" @click="removeSubstitutionRow(index)"><el-icon><Delete /></el-icon></el-button>
            </div>
          </section>
        </template>
        <el-form-item v-else :label="eventPlayerFieldLabel" required>
          <el-select v-model="eventForm.playerName" filterable clearable :placeholder="eventPlayerPlaceholder" style="width:100%">
            <el-option v-for="player in eventPlayerOptions" :key="player.value" :label="player.label" :value="player.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="助攻球员" v-if="eventForm.type === 'goal'">
          <el-select v-model="eventForm.assistName" filterable clearable placeholder="选择助攻球员（可选）" style="width:100%">
            <el-option v-for="player in eventAssistOptions" :key="player.value" :label="player.label" :value="player.value" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="eventDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEvent" :loading="saving">添加</el-button>
      </template>
    </el-dialog>

    <!-- 中超版首发名单导出模板（平时隐藏，导出时截图） -->
    <div ref="cslExportTemplate" v-show="false" class="csl-export-wrap">
      <div class="csl-export-page">
        <!-- 标题 -->
        <div class="csl-title">{{ tournamentName }}</div>
        <div class="csl-subtitle">首发名单</div>

        <!-- 对阵与比赛信息 -->
        <div class="csl-match-info">
          <div class="csl-vs-row">
            <span class="csl-vs-label">主队</span>
            <span class="csl-vs-name">{{ homeName || '主队' }}</span>
            <span class="csl-vs-sep">—</span>
            <span class="csl-vs-name">{{ awayName || '客队' }}</span>
            <span class="csl-vs-label">客队</span>
          </div>
          <div class="csl-meta-row">
            <span>轮次：{{ roundLabel }}</span>
            <span>场序：{{ match.matchSequence || match.sequence || '-' }}</span>
            <span>日期：{{ match.matchDate || '--' }}</span>
            <span>开球时间：{{ match.matchTime || '--:--' }}</span>
          </div>
          <div class="csl-meta-row">
            <span>城市：{{ match.city || '-' }}</span>
            <span>体育场：{{ match.venue || '待定' }}</span>
          </div>
        </div>

        <!-- 裁判组 -->
        <div class="csl-referee-block">
          <div class="csl-ref-row">
            <template v-for="role in refereeRoleOptions" :key="role.key">
              <span class="csl-ref-label">{{ role.label }}：</span><span class="csl-ref-val">{{ refereeCrew[role.key]?.name || '-' }}</span>
            </template>
          </div>
        </div>

        <!-- 双方球队信息 -->
        <div class="csl-team-info-row">
          <div class="csl-team-info">
            <span class="csl-team-name">{{ homeName || '主队' }}</span>
            <span class="csl-team-record">（{{ homeRecord || '-' }}）</span>
            <span class="csl-kit-info">球服颜色（上衣：{{ kitColors.home?.jersey || '-' }} 短裤：{{ kitColors.home?.shorts || '-' }} 袜子：{{ kitColors.home?.socks || '-' }}）</span>
          </div>
          <div class="csl-team-info">
            <span class="csl-team-name">{{ awayName || '客队' }}</span>
            <span class="csl-team-record">（{{ awayRecord || '-' }}）</span>
            <span class="csl-kit-info">球服颜色（上衣：{{ kitColors.away?.jersey || '-' }} 短裤：{{ kitColors.away?.shorts || '-' }} 袜子：{{ kitColors.away?.socks || '-' }}）</span>
          </div>
        </div>

        <!-- 首发球员表格 -->
        <div class="csl-section-title">首发球员</div>
        <div class="csl-lineup-tables">
          <!-- 主队首发 -->
          <table class="csl-table">
            <thead>
              <tr>
                <th style="width:32px">号码</th>
                <th style="width:48px">位置</th>
                <th style="width:70px">姓名</th>
                <th style="width:60px">球衣名</th>
                <th style="width:30px">年龄</th>
                <th style="width:68px">出场次数/时间</th>
                <th style="width:28px">进球</th>
                <th style="width:40px">红/黄牌</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, i) in homeStartersPadded" :key="'hp'+i">
                <td>{{ p.number ?? p.jerseyNumber ?? '-' }}</td>
                <td>{{ formatPosition(p.position) }}</td>
                <td>{{ p.name }}<span v-if="p.isCaptain" class="csl-tag">(C)</span><span v-if="p.isForeign" class="csl-tag">(F)</span><span v-if="p.isYoung" class="csl-tag">(☆)</span><span v-if="p.isOverage" class="csl-tag">(◇)</span></td>
                <td>{{ p.jerseyName || '-' }}</td>
                <td>{{ p.age || '-' }}</td>
                <td>{{ p.appearances || '-' }}</td>
                <td>{{ p.goals ?? '-' }}</td>
                <td>{{ p.cards || '-' }}</td>
              </tr>
            </tbody>
          </table>
          <!-- 客队首发 -->
          <table class="csl-table">
            <thead>
              <tr>
                <th style="width:32px">号码</th>
                <th style="width:48px">位置</th>
                <th style="width:70px">姓名</th>
                <th style="width:60px">球衣名</th>
                <th style="width:30px">年龄</th>
                <th style="width:68px">出场次数/时间</th>
                <th style="width:28px">进球</th>
                <th style="width:40px">红/黄牌</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, i) in awayStartersPadded" :key="'ap'+i">
                <td>{{ p.number ?? p.jerseyNumber ?? '-' }}</td>
                <td>{{ formatPosition(p.position) }}</td>
                <td>{{ p.name }}<span v-if="p.isCaptain" class="csl-tag">(C)</span><span v-if="p.isForeign" class="csl-tag">(F)</span><span v-if="p.isYoung" class="csl-tag">(☆)</span><span v-if="p.isOverage" class="csl-tag">(◇)</span></td>
                <td>{{ p.jerseyName || '-' }}</td>
                <td>{{ p.age || '-' }}</td>
                <td>{{ p.appearances || '-' }}</td>
                <td>{{ p.goals ?? '-' }}</td>
                <td>{{ p.cards || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 替补球员 -->
        <div class="csl-section-title">替补球员</div>
        <div class="csl-lineup-tables">
          <table class="csl-table">
            <thead>
              <tr>
                <th style="width:32px">号码</th>
                <th style="width:48px">位置</th>
                <th style="width:70px">姓名</th>
                <th style="width:60px">球衣名</th>
                <th style="width:30px">年龄</th>
                <th style="width:68px">出场次数/时间</th>
                <th style="width:28px">进球</th>
                <th style="width:40px">红/黄牌</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, i) in homeSubsPadded" :key="'hs'+i">
                <td>{{ p.number ?? p.jerseyNumber ?? '-' }}</td>
                <td>{{ formatPosition(p.position) }}</td>
                <td>{{ p.name }}<span v-if="p.isCaptain" class="csl-tag">(C)</span><span v-if="p.isForeign" class="csl-tag">(F)</span><span v-if="p.isYoung" class="csl-tag">(☆)</span><span v-if="p.isOverage" class="csl-tag">(◇)</span></td>
                <td>{{ p.jerseyName || '-' }}</td>
                <td>{{ p.age || '-' }}</td>
                <td>{{ p.appearances || '-' }}</td>
                <td>{{ p.goals ?? '-' }}</td>
                <td>{{ p.cards || '-' }}</td>
              </tr>
            </tbody>
          </table>
          <table class="csl-table">
            <thead>
              <tr>
                <th style="width:32px">号码</th>
                <th style="width:48px">位置</th>
                <th style="width:70px">姓名</th>
                <th style="width:60px">球衣名</th>
                <th style="width:30px">年龄</th>
                <th style="width:68px">出场次数/时间</th>
                <th style="width:28px">进球</th>
                <th style="width:40px">红/黄牌</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, i) in awaySubsPadded" :key="'as'+i">
                <td>{{ p.number ?? p.jerseyNumber ?? '-' }}</td>
                <td>{{ formatPosition(p.position) }}</td>
                <td>{{ p.name }}<span v-if="p.isCaptain" class="csl-tag">(C)</span><span v-if="p.isForeign" class="csl-tag">(F)</span><span v-if="p.isYoung" class="csl-tag">(☆)</span><span v-if="p.isOverage" class="csl-tag">(◇)</span></td>
                <td>{{ p.jerseyName || '-' }}</td>
                <td>{{ p.age || '-' }}</td>
                <td>{{ p.appearances || '-' }}</td>
                <td>{{ p.goals ?? '-' }}</td>
                <td>{{ p.cards || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 主教练 -->
        <div class="csl-coach-row">
          <div class="csl-coach">主教练：{{ lineups.home?.coach || '-' }}</div>
          <div class="csl-coach">主教练：{{ lineups.away?.coach || '-' }}</div>
        </div>

        <!-- 阵型 -->
        <div class="csl-formation-row">
          <div class="csl-formation">阵型：{{ lineups.home?.formation || '-' }}</div>
          <div class="csl-formation">阵型：{{ lineups.away?.formation || '-' }}</div>
        </div>

        <!-- 说明 -->
        <div class="csl-note">说明：守门员（GK）队长（C）外援（F）低龄球员（☆）超龄球员（◇）</div>

        <!-- 签字区 -->
        <div class="csl-sign-row">
          <div class="csl-sign">操作负责人：{{ operationRefereeName || '-' }}</div>
          <div class="csl-sign">{{ formatDateTimeCN(new Date()) }}</div>
        </div>
      </div>
    </div>

    <!-- 预览首发名单对话框 -->
    <el-dialog
      v-model="previewDialogVisible"
      title="预览首发名单（中超版）"
      width="95%"
      top="2vh"
      :close-on-click-modal="false"
    >
      <div class="preview-container">
        <div ref="previewContent" class="preview-content">
          <!-- 这里动态加载 csl-export-page 的副本用于预览 -->
          <div class="csl-export-page">
            <!-- 标题 -->
            <div class="csl-title">{{ tournamentName }}</div>
            <div class="csl-subtitle">首发名单</div>
            
            <!-- 对阵与比赛信息 -->
            <div class="csl-match-info">
              <div class="csl-vs-row">
                <span class="csl-vs-label">主队</span>
                <span class="csl-vs-name">{{ homeName || '主队' }}</span>
                <span class="csl-vs-sep">—</span>
                <span class="csl-vs-name">{{ awayName || '客队' }}</span>
                <span class="csl-vs-label">客队</span>
              </div>
              <div class="csl-meta-row">
                <span>轮次：{{ roundLabel }}</span>
                <span>场序：{{ match.matchSequence || match.sequence || '-' }}</span>
                <span>日期：{{ match.matchDate || '--' }}</span>
                <span>开球时间：{{ match.matchTime || '--:--' }}</span>
              </div>
              <div class="csl-meta-row">
                <span>城市：{{ match.city || '-' }}</span>
                <span>体育场：{{ match.venue || '待定' }}</span>
              </div>
            </div>

            <!-- 裁判组 -->
            <div class="csl-referee-block">
              <div class="csl-ref-row">
                <template v-for="role in refereeRoleOptions" :key="role.key">
                  <span class="csl-ref-label">{{ role.label }}：</span><span class="csl-ref-val">{{ refereeCrew[role.key]?.name || '-' }}</span>
                </template>
              </div>
            </div>

            <!-- 双方球队信息 -->
            <div class="csl-team-info-row">
              <div class="csl-team-info">
                <span class="csl-team-name">{{ homeName || '主队' }}</span>
                <span class="csl-team-record">（{{ homeRecord || '-' }}）</span>
                <span class="csl-kit-info">球服颜色（上衣：{{ kitColors.home?.jersey || '-' }} 短裤：{{ kitColors.home?.shorts || '-' }} 袜子：{{ kitColors.home?.socks || '-' }}）</span>
              </div>
              <div class="csl-team-info">
                <span class="csl-team-name">{{ awayName || '客队' }}</span>
                <span class="csl-team-record">（{{ awayRecord || '-' }}）</span>
                <span class="csl-kit-info">球服颜色（上衣：{{ kitColors.away?.jersey || '-' }} 短裤：{{ kitColors.away?.shorts || '-' }} 袜子：{{ kitColors.away?.socks || '-' }}）</span>
              </div>
            </div>

            <!-- 首发球员表格 -->
            <div class="csl-section-title">首发球员</div>
            <div class="csl-lineup-tables">
              <table class="csl-table">
                <thead>
                  <tr>
                    <th style="width:32px">号码</th>
                    <th style="width:48px">位置</th>
                    <th style="width:70px">姓名</th>
                    <th style="width:60px">球衣名</th>
                    <th style="width:30px">年龄</th>
                    <th style="width:68px">出场次数/时间</th>
                    <th style="width:28px">进球</th>
                    <th style="width:40px">红/黄牌</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(p, i) in homeStartersPadded" :key="'hp'+i">
                    <td>{{ p.number ?? p.jerseyNumber ?? '-' }}</td>
                    <td>{{ formatPosition(p.position) }}</td>
                    <td>{{ p.name }}<span v-if="p.isCaptain" class="csl-tag">(C)</span><span v-if="p.isForeign" class="csl-tag">(F)</span><span v-if="p.isYoung" class="csl-tag">(☆)</span><span v-if="p.isOverage" class="csl-tag">(◇)</span></td>
                    <td>{{ p.jerseyName || '-' }}</td>
                    <td>{{ p.age || '-' }}</td>
                    <td>{{ p.appearances || '-' }}</td>
                    <td>{{ p.goals ?? '-' }}</td>
                    <td>{{ p.cards || '-' }}</td>
                  </tr>
                </tbody>
              </table>
              <table class="csl-table">
                <thead>
                  <tr>
                    <th style="width:32px">号码</th>
                    <th style="width:48px">位置</th>
                    <th style="width:70px">姓名</th>
                    <th style="width:60px">球衣名</th>
                    <th style="width:30px">年龄</th>
                    <th style="width:68px">出场次数/时间</th>
                    <th style="width:28px">进球</th>
                    <th style="width:40px">红/黄牌</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(p, i) in awayStartersPadded" :key="'ap'+i">
                    <td>{{ p.number ?? p.jerseyNumber ?? '-' }}</td>
                    <td>{{ formatPosition(p.position) }}</td>
                    <td>{{ p.name }}<span v-if="p.isCaptain" class="csl-tag">(C)</span><span v-if="p.isForeign" class="csl-tag">(F)</span><span v-if="p.isYoung" class="csl-tag">(☆)</span><span v-if="p.isOverage" class="csl-tag">(◇)</span></td>
                    <td>{{ p.jerseyName || '-' }}</td>
                    <td>{{ p.age || '-' }}</td>
                    <td>{{ p.appearances || '-' }}</td>
                    <td>{{ p.goals ?? '-' }}</td>
                    <td>{{ p.cards || '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- 替补球员 -->
            <div class="csl-section-title">替补球员</div>
            <div class="csl-lineup-tables">
              <table class="csl-table">
                <thead>
                  <tr>
                    <th style="width:32px">号码</th>
                    <th style="width:48px">位置</th>
                    <th style="width:70px">姓名</th>
                    <th style="width:60px">球衣名</th>
                    <th style="width:30px">年龄</th>
                    <th style="width:68px">出场次数/时间</th>
                    <th style="width:28px">进球</th>
                    <th style="width:40px">红/黄牌</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(p, i) in homeSubsPadded" :key="'hs'+i">
                    <td>{{ p.number ?? p.jerseyNumber ?? '-' }}</td>
                    <td>{{ formatPosition(p.position) }}</td>
                    <td>{{ p.name }}<span v-if="p.isCaptain" class="csl-tag">(C)</span><span v-if="p.isForeign" class="csl-tag">(F)</span><span v-if="p.isYoung" class="csl-tag">(☆)</span><span v-if="p.isOverage" class="csl-tag">(◇)</span></td>
                    <td>{{ p.jerseyName || '-' }}</td>
                    <td>{{ p.age || '-' }}</td>
                    <td>{{ p.appearances || '-' }}</td>
                    <td>{{ p.goals ?? '-' }}</td>
                    <td>{{ p.cards || '-' }}</td>
                  </tr>
                </tbody>
              </table>
              <table class="csl-table">
                <thead>
                  <tr>
                    <th style="width:32px">号码</th>
                    <th style="width:48px">位置</th>
                    <th style="width:70px">姓名</th>
                    <th style="width:60px">球衣名</th>
                    <th style="width:30px">年龄</th>
                    <th style="width:68px">出场次数/时间</th>
                    <th style="width:28px">进球</th>
                    <th style="width:40px">红/黄牌</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(p, i) in awaySubsPadded" :key="'as'+i">
                    <td>{{ p.number ?? p.jerseyNumber ?? '-' }}</td>
                    <td>{{ formatPosition(p.position) }}</td>
                    <td>{{ p.name }}<span v-if="p.isCaptain" class="csl-tag">(C)</span><span v-if="p.isForeign" class="csl-tag">(F)</span><span v-if="p.isYoung" class="csl-tag">(☆)</span><span v-if="p.isOverage" class="csl-tag">(◇)</span></td>
                    <td>{{ p.jerseyName || '-' }}</td>
                    <td>{{ p.age || '-' }}</td>
                    <td>{{ p.appearances || '-' }}</td>
                    <td>{{ p.goals ?? '-' }}</td>
                    <td>{{ p.cards || '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- 主教练 -->
            <div class="csl-coach-row">
              <div class="csl-coach">主教练：{{ lineups.home?.coach || '-' }}</div>
              <div class="csl-coach">主教练：{{ lineups.away?.coach || '-' }}</div>
            </div>

            <!-- 阵型 -->
            <div class="csl-formation-row">
              <div class="csl-formation">阵型：{{ lineups.home?.formation || '-' }}</div>
              <div class="csl-formation">阵型：{{ lineups.away?.formation || '-' }}</div>
            </div>

            <!-- 说明 -->
            <div class="csl-note">说明：守门员（GK）队长（C）外援（F）低龄球员（☆）超龄球员（◇）</div>

            <!-- 签字区 -->
            <div class="csl-sign-row">
              <div class="csl-sign">
                操作负责人：{{ operationRefereeName || '-' }}
              </div>
              <div class="csl-sign">{{ formatDateTimeCN(new Date()) }}</div>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="preview-footer">
          <el-button @click="previewDialogVisible = false">关闭</el-button>
          <el-button type="primary" @click="saveAsImage">
            <el-icon><Picture /></el-icon> 保存图片
          </el-button>
          <el-button type="success" @click="saveAsPDF">
            <el-icon><Document /></el-icon> 保存PDF
          </el-button>
          <el-button type="warning" @click="printLineup">
            <el-icon><Printer /></el-icon> 打印
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 比赛监督签字二维码弹窗 -->
    <el-dialog
      v-model="signatureQrDialogVisible"
      title="比赛监督签字"
      width="420px"
      :close-on-click-modal="false"
      @close="closeSignatureQrDialog"
    >
      <div style="text-align: center; padding: 20px 0;">
        <div v-if="signatureQrLoading" style="padding: 40px 0;">
          <el-icon class="is-loading" style="font-size: 32px;"><Loading /></el-icon>
          <div style="margin-top: 12px; color: #909399;">正在生成签字二维码...</div>
        </div>
        <div v-else-if="signatureQrUrl">
          <div style="margin-bottom: 16px; font-size: 15px; font-weight: 600; color: #303133;">
            请使用微信扫描下方二维码，在手机上完成签字
          </div>
          <!-- 横版二维码展示 -->
          <div style="display: flex; justify-content: center; margin-bottom: 16px; background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
            <img :src="signatureQrUrl" style="width: 260px; height: 260px;" />
          </div>
          <div v-if="signatureImageUrl" style="margin-top: 16px;">
            <div style="font-size: 14px; color: #67C23A; margin-bottom: 8px;">✓ 签字已完成</div>
            <div style="background: white; padding: 16px; border-radius: 8px; border: 1px solid #e4e7ed; display: inline-block;">
              <img :src="signatureImageUrl" style="max-width: 420px; max-height: 180px;" />
            </div>
          </div>
          <div v-else style="color: #909399; font-size: 13px;">
            {{ signaturePolling ? '等待签字中...' : '准备就绪' }}
          </div>
          <div v-if="signatureError" style="color: #F56C6C; margin-top: 8px; font-size: 13px;">
            {{ signatureError }}
          </div>
        </div>
        <div v-else style="padding: 40px 0; color: #F56C6C;">
          生成二维码失败，请重试
        </div>
      </div>
      <template #footer>
        <el-button @click="closeSignatureQrDialog">关闭</el-button>
        <el-button type="primary" @click="refreshSignatureQr" v-if="signatureQrUrl">
          刷新二维码
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { matchListQuery } from '../../utils/matchListContext'
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, Edit, Delete, Plus, Right, Soccer, User, DataLine, Picture, Download, View, Document, Printer } from '@element-plus/icons-vue'
import { queryById, callFunction, updateRecord, queryList, reviewRefereeRecord, getFileUrl, rosterExceptionBoard } from '../../utils/cloud'
import { formatMatchPhase, formatMatchRound } from '../../utils/matchLabels'
import { cardEventCounts, goalEventLabel, isGoalEvent, isPenaltyMissed, isPenaltyScored, isSecondYellowRed } from '../../utils/matchEvent'
import { MATCH_FORMAT_DEFAULTS } from '../../utils/rosterHelper'
import { createRefereeLineupPrintHtml, createRefereeLineupSheet, createRefereePrintLoadingHtml, refereeLineupSheetFileName } from '../../utils/refereeLineupSheet'
import VisualLineupEditor from './VisualLineupEditor.vue'
import { substitutionRules, substitutionState, assertSubstitutionChange } from '../../../../cloudfunctions/dataCenter/shared/substitution.mjs'

const route = useRoute()
const router = useRouter()
const yellowRedCardIcon = `${import.meta.env.BASE_URL}images/match-events/yellow-red.svg`

const tournamentId = route.params.id
const matchId = route.params.matchId
const sourceDivisionId = typeof route.query.divisionId === 'string' ? route.query.divisionId : ''

const match = ref({})
const substitutionDivision = ref({}), substitutionTournament = ref({})
const effectiveSubstitutionRules = computed(() => substitutionRules(match.value,substitutionDivision.value,substitutionTournament.value))
const substitutionAudit = computed(() => substitutionState(match.value,effectiveSubstitutionRules.value))
const homeName = ref('')
const awayName = ref('')
const homeLogo = ref('')
const awayLogo = ref('')
const registeredKitColors = ref({ home: { primary: {}, secondary: {} }, away: { primary: {}, secondary: {} } })
const registeredKitColorLabels = ref({ home: { primary: {}, secondary: {} }, away: { primary: {}, secondary: {} } })

function handleTeamLogoError(side) {
  if (side === 'home') homeLogo.value = ''
  if (side === 'away') awayLogo.value = ''
}

function getTeamLogoSource(record, side = '') {
  if (!record || typeof record !== 'object') return ''
  const scoped = side ? [
    record[`${side}Logo`],
    record[`${side}TeamLogo`],
    record[`${side}TeamLogoUrl`],
    record[`${side}LogoUrl`],
    record[`${side}LogoFileID`],
    record[`${side}LogoFileId`]
  ] : []
  return [
    ...scoped,
    record.logo,
    record.logoUrl,
    record.logoTransparentUrl,
    record.logoTransparent,
    record.logoOriginal,
    record.logoImage,
    record.teamLogo,
    record.teamLogoUrl,
    record.teamLogoImage,
    record.teamLogoFileID,
    record.teamLogoFileId,
    record.crest,
    record.logoFileID,
    record.logoFileId,
    record.teamLogoFileId
  ].map(value => String(value || '').trim()).find(Boolean) || ''
}

async function resolveTeamLogoSource(source) {
  const value = String(source || '').trim()
  if (!value) return ''
  if (/^cloud:\/\//i.test(value)) {
    const resolved = await getFileUrl(value)
    return /^https?:\/\//i.test(String(resolved || '')) ? resolved : ''
  }
  return /^(https?:\/\/|\/)/i.test(value) ? value : ''
}

async function applyTeamLogo(side, source) {
  const logo = await resolveTeamLogoSource(source)
  if (side === 'home' && logo) homeLogo.value = logo
  if (side === 'away' && logo) awayLogo.value = logo
}
const refName = ref('')
const tournamentNameStr = ref('')
const tournamentMatchFormat = ref('')
const substitutePlayerLimit = ref(null)
const saving = ref(false)
const refereeSheetLoading = ref(false)
const reviewSaving = ref(false)
const returnRecordDialogVisible = ref(false)
const returnRecordForm = ref({ reason: '', fields: [] })
const activeTab = ref('lineup')
const homePlayers = ref([])
const awayPlayers = ref([])

// 同一场比赛内反复打开阵容编辑器时，球队球员库无需重复查询。
const teamPlayersCache = new Map()
const teamPlayersRequests = new Map()
const TEAM_PLAYERS_CACHE_TTL = 2 * 60 * 1000

// 编辑弹窗
const editDialogVisible = ref(false)
const editForm = ref({})
const allTeams = ref([])
const referees = ref([])
const venueOptions = ref([])

// 结束比赛弹窗
const finishDialogVisible = ref(false)
const finishForm = ref({ homeScore: 0, awayScore: 0 })

// 事件弹窗
const eventDialogVisible = ref(false)
const eventPlayersLoading = ref(false)
const emptySubstitution = () => ({ outId:'',inId:'' })
const newEventForm = () => ({ type:'goal',minute:0,teamSide:'home',playerName:'',assistName:'',substitutionPeriod:'first_half',substitutions:[emptySubstitution()] })
const eventForm = ref(newEventForm())
const eventMinuteOptions = Array.from({ length:131 }, (_,minute) => ({ value:minute,label:`${minute}′` }))
const substitutionPeriodOptions = [{ label:'上半场',value:'first_half' },{ label:'中场休息',value:'halftime' },{ label:'下半场',value:'second_half' }]
const eventPlayerFieldLabel = computed(() => ['yellow_card','red_card','second_yellow_red'].includes(eventForm.value.type) ? '领牌球员' : eventForm.value.type === 'assist' ? '助攻球员' : '球员')
const eventPlayerPlaceholder = computed(() => ['yellow_card','red_card','second_yellow_red'].includes(eventForm.value.type) ? '选择领牌球员' : eventForm.value.type === 'assist' ? '选择助攻球员' : '选择本队球员')
const isPlayerRecord = player => Boolean(player && typeof player === 'object' && !Array.isArray(player))
const getPlayerId = player => isPlayerRecord(player) ? String(player.playerId || player.id || player._id || '') : ''
const activeEventPlayers = computed(() => {
  const players = eventForm.value.teamSide === 'away' ? awayPlayers.value : homePlayers.value
  return Array.isArray(players) ? players.filter(isPlayerRecord) : []
})
const eventPlayerOptions = computed(() => {
  const rows = new Map()
  activeEventPlayers.value.forEach(player => {
    const name = String(player.name || player.playerName || '').trim()
    if (!name || rows.has(name)) return
    const number = player.jerseyNumber ?? player.number
    const position = formatPosition(player.position)
    rows.set(name, { value:name,label:[number !== undefined && number !== '' ? `${number}号` : '',name,position && position !== '-' ? position : ''].filter(Boolean).join(' · ') })
  })
  return [...rows.values()]
})
const eventAssistOptions = computed(() => eventPlayerOptions.value.filter(player => player.value !== eventForm.value.playerName))

watch(() => eventForm.value.teamSide, (next, previous) => {
  if (!eventDialogVisible.value || next === previous) return
  eventForm.value.playerName = ''
  eventForm.value.assistName = ''
  eventForm.value.substitutions = [emptySubstitution()]
})
watch(() => eventForm.value.playerName, playerName => {
  if (eventForm.value.assistName === playerName) eventForm.value.assistName = ''
})
watch(() => eventForm.value.type, type => {
  if (type !== 'goal') eventForm.value.assistName = ''
  if (type === 'substitution' && !eventForm.value.substitutions.length) eventForm.value.substitutions = [emptySubstitution()]
})

function addSubstitutionRow() { if (eventForm.value.substitutions.length < 5) eventForm.value.substitutions.push(emptySubstitution()) }
function removeSubstitutionRow(index) { if (eventForm.value.substitutions.length > 1) eventForm.value.substitutions.splice(index,1) }
const substitutionInputState = computed(() => {
  const state = substitutionState(match.value,effectiveSubstitutionRules.value,match.value.events || [],Number(eventForm.value.minute))
  const side = state?.sides?.[eventForm.value.teamSide] || {}
  return {
    ...side,
    incoming: Array.isArray(side.incoming) ? side.incoming.filter(isPlayerRecord) : [],
    outgoing: Array.isArray(side.outgoing) ? side.outgoing.filter(isPlayerRecord) : [],
    issues: Array.isArray(side.issues) ? side.issues : []
  }
})
function substitutionOption(player) {
  if (!isPlayerRecord(player)) return null
  const value = getPlayerId(player)
  if (!value) return null
  const name = String(player.name || player.playerName || '').trim()
  const number = player.number ?? player.jerseyNumber
  return { value, label:[number !== undefined && number !== '' ? `${number}号` : '',name].filter(Boolean).join(' · ') || '未命名球员' }
}
function substitutionOptions(index,kind) {
  const rows = Array.isArray(eventForm.value.substitutions) ? eventForm.value.substitutions.filter(row => row && typeof row === 'object') : []
  const used = new Set(rows.flatMap((row,rowIndex) => rowIndex===index ? [kind==='incoming'?row.outId:row.inId] : [row.outId,row.inId]).filter(Boolean).map(String))
  const players = Array.isArray(substitutionInputState.value[kind]) ? substitutionInputState.value[kind] : []
  return players.map(substitutionOption).filter(option => option && !used.has(option.value))
}
function substitutionOutOptions(index) { return substitutionOptions(index,'outgoing') }
function substitutionInOptions(index) { return substitutionOptions(index,'incoming') }
watch(() => [eventForm.value.minute,eventForm.value.teamSide], () => {
  if(eventDialogVisible.value && eventForm.value.type==='substitution')eventForm.value.substitutions=[emptySubstitution()]
})

// 裁判组编辑弹窗
const refereeDialogVisible = ref(false)
const refereeForm = ref({
  mainReferee: '',
  assistant1: '', assistant2: '', fourthOfficial: '',
  secondReferee: '', thirdReferee: '', timekeeper: '',
  operationRefereeId: ''
})

// 球服颜色编辑弹窗
const kitDialogVisible = ref(false)
const kitForm = ref({
  homeSet: 'primary',
  awaySet: 'primary',
  home: { jersey: '', shorts: '', socks: '' },
  away: { jersey: '', shorts: '', socks: '' }
})

// 可视化阵容编辑弹窗
const visualEditorVisible = ref(false)
const visualEditorOpening = ref(false)
const currentTeamSide = ref('home')
const currentLineupData = ref(null)

// 阵容编辑弹窗
const lineupExportArea = ref(null)
const cslExportTemplate = ref(null)
const previewDialogVisible = ref(false)
// 签字二维码弹窗
const signatureQrDialogVisible = ref(false)
const signatureQrUrl = ref('')
const signatureQrLoading = ref(false)
const signaturePolling = ref(false)
const signatureError = ref('')
const signatureMatchId = ref('')
let signaturePollTimer = null
const signatureSigned = ref(false)
const signatureImageUrl = ref('')
const previewContent = ref(null)
const lineupDialogVisible = ref(false)
const lineupForm = ref({
  home: {
    formation: '',
    players: [],
    substitutes: [],
    coach: ''
  },
  away: {
    formation: '',
    players: [],
    substitutes: [],
    coach: ''
  }
})

const positionOptions = [
  { label: '守门员', value: 'GK' },
  { label: '后卫', value: 'DF' },
  { label: '前卫', value: 'MF' },
  { label: '前锋', value: 'FW' }
]

// 球服颜色选项（固定颜色名，不用色轮）
const kitColorOptions = ['红', '黄', '蓝', '白', '绿', '黑', '橙', '紫', '粉', '灰', '深绿', '浅蓝', '藏青', '棕']

// 兼容旧数据的 hex → 颜色名映射
const hexToColorName = {
  '#e53935': '红', '#f44336': '红', '#ef5350': '红', '#b71c1c': '红',
  '#ffeb3b': '黄', '#fdd835': '黄', '#fbc02d': '黄', '#f9a825': '黄', '#ffee58': '黄',
  '#2196f3': '蓝', '#1e88e5': '蓝', '#1976d2': '蓝', '#0d47a1': '蓝', '#42a5f5': '浅蓝', '#64b5f6': '浅蓝',
  '#ffffff': '白', '#f5f5f5': '白', '#fafafa': '白',
  '#4caf50': '绿', '#43a047': '绿', '#388e3c': '绿', '#1b5e20': '深绿', '#66bb6a': '绿', '#81c784': '绿', '#38761d': '深绿',
  '#000000': '黑', '#212121': '黑', '#424242': '黑',
  '#ff9800': '橙', '#f57c00': '橙', '#fb8c00': '橙', '#ef6c00': '橙',
  '#9c27b0': '紫', '#7b1fa2': '紫', '#6a1b9a': '紫', '#ab47bc': '紫',
  '#e91e63': '粉', '#d81b60': '粉', '#c2185b': '粉', '#ad1457': '粉', '#f06292': '粉',
  '#9e9e9e': '灰', '#757575': '灰', '#616161': '灰',
  '#795548': '棕', '#5d4037': '棕', '#8d6e63': '棕',
  '#283593': '藏青', '#1a237e': '藏青', '#303f9f': '藏青', '#3f51b5': '藏青',
}

const colorNameToHex = {
  '红':'#E53935', '黄':'#FDD835', '蓝':'#1E88E5', '白':'#FFFFFF', '绿':'#43A047', '黑':'#212121',
  '橙':'#FB8C00', '紫':'#8E24AA', '粉':'#D81B60', '灰':'#757575', '深绿':'#1B5E20', '浅蓝':'#42A5F5',
  '藏青':'#283593', '棕':'#795548'
}

// 将颜色值（可能是 hex 或颜色名）转换为显示用的颜色名
function normalizeKitColor(val) {
  if (!val) return ''
  if (kitColorOptions.includes(val)) return val
  const normalized = hexToColorName[val.toLowerCase()]
  if (normalized) return normalized
  // 如果都不匹配，返回原值
  return val
}

function kitColorCss(val) {
  if (!val) return ''
  if (colorNameToHex[val]) return colorNameToHex[val]
  const named = Object.entries(colorNameToHex).find(([name]) => String(val).includes(name))
  return named?.[1] || val
}

const phaseLabel = computed(() => formatMatchPhase(match.value))
const roundLabel = computed(() => formatMatchRound(match.value))

const statusLabel = computed(() => {
  const s = match.value.status || 'scheduled'
  return { scheduled: '未开始', ongoing: '进行中', finished: '待提交报告', completed: '已结束', postponed: '延期', cancelled: '已取消' }[s] || s
})

const statusTagType = computed(() => {
  const s = match.value.status || 'scheduled'
  return { scheduled: 'info', ongoing: 'warning', finished: 'warning', completed: 'success', postponed: 'warning', cancelled: 'danger' }[s] || 'info'
})

const canReviewRefereeRecord = computed(() => Boolean(match.value.refereeRecord && match.value.refereeReviewStatus === 'under_review'))
const isRefereeEvidenceLocked = computed(() => Boolean(
  match.value.refereeRecordLocked ||
  match.value.refereeReviewStatus === 'under_review' ||
  match.value.refereeReviewStatus === 'returned' ||
  match.value.refereeReviewStatus === 'archived'
))
const canDownloadRefereeSheet = computed(() =>
  Boolean(match.value._id) && ['scheduled', 'postponed'].includes(String(match.value.status || 'scheduled')) && !isRefereeEvidenceLocked.value
)
const lineupEmptyDescription = computed(() => isRefereeEvidenceLocked.value
  ? '裁判电子记录已锁定，阵容证据仅可查看'
  : '暂无阵容信息，点击上方按钮录入')
const returnableEvents = computed(() => (match.value.events || []).filter(item => item && isGoalEvent(item) && item.eventId))

const sortedEvents = computed(() => {
  const events = match.value.events || []
  return [...events].sort((a, b) => (a.minute || 0) - (b.minute || 0))
})

function calculateEventScore(events) {
  const score = { home: 0, away: 0 }
  ;(Array.isArray(events) ? events : []).forEach(event => {
    if (!isGoalEvent(event)) return
    let side = event?.teamSide === 'away' || event?.side === 'away' ? 'away' : 'home'
    const type = String(event?.type || event?.eventType || '').trim().toLowerCase()
    if (['own_goal', 'own-goal', 'og'].includes(type)) side = side === 'home' ? 'away' : 'home'
    score[side] = Math.min(99, score[side] + 1)
  })
  return score
}
const hasStructuredEvents = computed(() => Array.isArray(match.value.events) && !match.value.resultCorrection)
const eventScore = computed(() => calculateEventScore(match.value.events))
const displayHomeScore = computed(() => hasStructuredEvents.value ? eventScore.value.home : (match.value.homeScore ?? 0))
const displayAwayScore = computed(() => hasStructuredEvents.value ? eventScore.value.away : (match.value.awayScore ?? 0))

const localEventKeys = new WeakMap()
let localEventKeySequence = 0
function existingEventId(event) {
  return String(event?.eventId || event?._id || event?.id || '').trim()
}
function eventRowKey(event, index) {
  const id = existingEventId(event)
  if (id) return `event-${id}`
  if (event && typeof event === 'object') {
    if (!localEventKeys.has(event)) localEventKeys.set(event, `event-local-${++localEventKeySequence}`)
    return localEventKeys.get(event)
  }
  return `event-index-${index}`
}

const eventSummary = computed(() => {
  const events = match.value.events || []
  const count = (...types) => events.filter(event => types.includes(event.type)).length
  return [
    { key: 'total', icon: '📋', label: '全部事件', value: events.length },
    { key: 'goals', icon: '⚽', label: '进球', value: events.filter(isGoalEvent).length },
    { key: 'yellow', icon: '🟨', label: '黄牌', value: events.reduce((sum, event) => sum + cardEventCounts(event).yellow, 0) },
    { key: 'red', icon: '🟥', label: '红牌', value: events.reduce((sum, event) => sum + cardEventCounts(event).red, 0) },
    { key: 'subs', icon: '🔄', label: '换人', value: count('substitution') }
  ]
})

function substitutionPeriodLabel(value) { return ({ first_half:'上半场',halftime:'中场休息',second_half:'下半场' })[value] || '比赛中' }
function eventTimeText(event) { return event?.type === 'substitution' && event?.substitutionPeriod === 'halftime' ? '中场' : `${Number(event?.minute || 0)}'` }

// 裁判组
const refereeCrew = computed(() => match.value.refereeCrew || {})
const currentMatchFormat = computed(() => match.value.matchFormat || tournamentMatchFormat.value || '11side')
const currentPlayerCount = computed(() => Number.parseInt(String(currentMatchFormat.value), 10) || 11)
const currentMatchFormatLabel = computed(() => {
  const number = String(currentMatchFormat.value).match(/\d+/)?.[0] || '11'
  return `${number}人制`
})
const refereeRoleOptions = computed(() => /^(5|6)/.test(String(currentMatchFormat.value))
  ? [
      { key: 'mainReferee', label: '主裁判' },
      { key: 'secondReferee', label: '第二裁判' },
      { key: 'thirdReferee', label: '第三裁判' },
      { key: 'timekeeper', label: '计时员' }
    ]
  : [
      { key: 'mainReferee', label: '主裁判' },
      { key: 'assistant1', label: '第一助理裁判' },
      { key: 'assistant2', label: '第二助理裁判' },
      { key: 'fourthOfficial', label: '第四官员' }
    ])
const selectedCrewOptions = computed(() => {
  const ids = refereeRoleOptions.value.map(role => refereeForm.value[role.key]).filter(Boolean)
  return referees.value.filter(referee => ids.includes(referee._id))
})
const operationRefereeName = computed(() => {
  const id = match.value.operationRefereeId
  for (const role of refereeRoleOptions.value) {
    const referee = refereeCrew.value[role.key]
    if (referee?._id === id) return referee.name
  }
  return ''
})
const hasRefereeCrew = computed(() => {
  return refereeRoleOptions.value.some(role => refereeCrew.value[role.key]?.name)
})

// 球服颜色（自动将旧 hex 值转换为颜色名）
const kitColors = computed(() => {
  const raw = match.value.kitColors || { home: {}, away: {} }
  const selection = match.value.kitSelection || {}
  const registered = registeredKitColors.value
  const labels = registeredKitColorLabels.value
  const valueFor = (side, key) => {
    const matchValue = normalizeKitColor(raw[side]?.[key])
    if (matchValue) return matchValue
    const setKey = selection[side] || 'primary'
    const registeredValue = normalizeKitColor(registered[side]?.[setKey]?.[key])
    if (registeredValue && !String(registeredValue).startsWith('#')) return registeredValue
    return labels[side]?.[key] || registeredValue
  }
  return {
    home: {
      jersey: valueFor('home', 'jersey'),
      shorts: valueFor('home', 'shorts'),
      socks: valueFor('home', 'socks')
    },
    away: {
      jersey: valueFor('away', 'jersey'),
      shorts: valueFor('away', 'shorts'),
      socks: valueFor('away', 'socks')
    }
  }
})
const kitSetLabel = side => (match.value.kitSelection?.[side] || 'primary') === 'secondary' ? '备用比赛服' : '主比赛服'
const hasKitSet = (side, setKey) => ['jersey','shorts','socks'].some(key => registeredKitColors.value[side]?.[setKey]?.[key])
const selectedKitColor = (side, key) => {
  const setKey = kitForm.value[`${side}Set`] || 'primary'
  return normalizeKitColor(registeredKitColors.value[side]?.[setKey]?.[key]) || registeredKitColorLabels.value[side]?.[setKey]?.[key] || ''
}
const kitPreviewStyle = (side, key) => {
  const color = selectedKitColor(side, key)
  return { backgroundColor: kitColorCss(color) || '#eef2f0' }
}
const hasKitColors = computed(() => {
  const k = kitColors.value
  return ['jersey','shorts','socks'].some(key => k.home?.[key] || k.away?.[key])
})

// 首发阵容
const lineups = computed(() => match.value.lineups || { home: null, away: null })
const getLineupRows = rows => Array.isArray(rows) ? rows.filter(player => player && typeof player === 'object' && !Array.isArray(player)) : []
const homeLineupPlayers = computed(() => getLineupRows(lineups.value.home?.players))
const homeLineupSubstitutes = computed(() => getLineupRows(lineups.value.home?.substitutes))
const awayLineupPlayers = computed(() => getLineupRows(lineups.value.away?.players))
const awayLineupSubstitutes = computed(() => getLineupRows(lineups.value.away?.substitutes))
const hasLineups = computed(() => {
  const l = lineups.value
  return !!(l.home?.players?.length || l.away?.players?.length)
})

const tournamentName = computed(() => tournamentNameStr.value || match.value.tournamentName || '足球赛事')
const homeRecord = computed(() => {
  // 战绩占位，后续可从 tournament standings 计算
  return '-'
})
const awayRecord = computed(() => '-')

// 固定行数的阵容表格（首发11人，替补12人，不够的补空行）
const homeStartersPadded = computed(() => {
  const arr = getLineupRows(lineups.value.home?.players)
  const padded = [...arr]
  while (padded.length < 11) padded.push({})
  return padded
})
const awayStartersPadded = computed(() => {
  const arr = getLineupRows(lineups.value.away?.players)
  const padded = [...arr]
  while (padded.length < 11) padded.push({})
  return padded
})
const homeSubsPadded = computed(() => {
  const arr = getLineupRows(lineups.value.home?.substitutes)
  const padded = [...arr]
  while (padded.length < 12) padded.push({})
  return padded
})
const awaySubsPadded = computed(() => {
  const arr = getLineupRows(lineups.value.away?.substitutes)
  const padded = [...arr]
  while (padded.length < 12) padded.push({})
  return padded
})

function kitStyle(kit) {
  if (!kit || !kit.jersey) return {}
  const jersey = kitColorCss(kit.jersey)
  const shorts = kitColorCss(kit.shorts || kit.jersey)
  return {
    backgroundColor: jersey,
    color: isLightColor(jersey) ? '#333' : '#fff',
    border: `2px solid ${shorts}`,
  }
}

function isLightColor(hex) {
  if (!hex) return true
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16) || 0
  const g = parseInt(c.substring(2, 4), 16) || 0
  const b = parseInt(c.substring(4, 6), 16) || 0
  return (r * 0.299 + g * 0.587 + b * 0.114) > 186
}

function eventIcon(type) {
  return { goal: '⚽', assist: '👟', yellow_card: '🟨', red_card: '🔴', second_yellow_red: '🟨🔴', substitution: '🔄', stoppage_time: '⏱', other: '•••', penalty: '⚽', penalty_scored: '⚽', penalty_missed: '⚽', own_goal: '⚽' }[type] || '•'
}

const eventIconAssets = {
  penalty: `${import.meta.env.BASE_URL}images/match-events/penalty.svg`,
  penalty_scored: `${import.meta.env.BASE_URL}images/match-events/penalty.svg`,
  penalty_missed: `${import.meta.env.BASE_URL}images/match-events/penalty-missed.svg`,
  penalty_miss: `${import.meta.env.BASE_URL}images/match-events/penalty-missed.svg`,
  own_goal: `${import.meta.env.BASE_URL}images/match-events/own-goal.svg`
}
function eventIconAsset(type) {
  return eventIconAssets[type] || ''
}
function eventIconAlt(type) {
  return { penalty: '点球', penalty_scored: '点球', penalty_missed: '点球未进', penalty_miss: '点球未进', own_goal: '乌龙球' }[type] || '比赛事件'
}

function eventLabel(event) {
  if (isGoalEvent(event)) return goalEventLabel(event)
  const type = event?.type || event
  return {
    assist: '助攻',
    yellow_card: '黄牌',
    red_card: '红牌',
    second_yellow_red: '2黄变1红',
    substitution: '换人',
    stoppage_time: '补时',
    other: '其他',
    penalty: '点球',
    penalty_scored: '点球',
    penalty_missed: '点球未进',
    penalty_miss: '点球未进',
    own_goal: '乌龙球'
  }[type] || type
}

function formatPosition(pos) {
  const map = { GK: '守门员', DF: '后卫', MF: '前卫', FW: '前锋', CB: '后卫', LB: '后卫', RB: '后卫', CDM: '前卫', CM: '前卫', LM: '前卫', RM: '前卫', CAM: '前卫', LW: '前锋', RW: '前锋', ST: '前锋', CF: '前锋' }
  return map[pos] || pos || '-'
}

function formatDateTimeCN(date) {
  if (!date) return ''
  const d = new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}年${m}月${day}日${h}时${min}分`
}

function goBack() {
  router.push({
    path: `/tournaments/${tournamentId}/matches`,
    query: matchListQuery(route.query)
  })
}

function ensureEvidenceEditable() {
  if (!isRefereeEvidenceLocked.value) return true
  ElMessage.warning('裁判电子记录已提交，PC 端只能复核或归档，不能改写现场快照')
  return false
}

function openReturnRecordDialog() {
  returnRecordForm.value = { reason: '', fields: [] }
  returnRecordDialogVisible.value = true
}

async function archiveRefereeRecord() {
  try {
    await ElMessageBox.confirm('确认归档后，电子比赛记录及全部裁判现场快照将保持只读。', '确认无误并归档', { type: 'warning' })
    reviewSaving.value = true
    const result = await reviewRefereeRecord({ matchId, reviewOperation: 'archive' })
    if (!result.success) throw new Error(result.error || result.message || '归档失败')
    match.value.refereeReviewStatus = 'archived'
    match.value.refereeRecord = { ...(match.value.refereeRecord || {}), reviewStatus: 'archived' }
    ElMessage.success(result.message || '赛果已确认归档')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '归档失败')
  } finally { reviewSaving.value = false }
}

async function returnRefereeRecord() {
  if (!returnRecordForm.value.reason.trim() || !returnRecordForm.value.fields.length) return ElMessage.warning('请填写退回原因并选择允许修正的事件球员字段')
  try {
    reviewSaving.value = true
    const result = await reviewRefereeRecord({ matchId, reviewOperation: 'return', reason: returnRecordForm.value.reason, fields: returnRecordForm.value.fields })
    if (!result.success) throw new Error(result.error || result.message || '退回失败')
    match.value.refereeReviewStatus = 'returned'
    match.value.refereeRecord = { ...(match.value.refereeRecord || {}), reviewStatus: 'returned' }
    returnRecordDialogVisible.value = false
    ElMessage.success(result.message || '电子记录已退回裁判限定修正')
  } catch (error) { ElMessage.error(error.message || '退回失败') } finally { reviewSaving.value = false }
}

function resolveSubstitutePlayerLimit(playerCount, ...sources) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue
    const details = source.regulationDetails && typeof source.regulationDetails === 'object'
      ? source.regulationDetails
      : source
    // 阵容编辑器的替补席只承载可参赛人员，不单独扣除球队官员名额。
    const totalLimit = Number(details.benchTotalLimit)
    if (Number.isFinite(totalLimit) && totalLimit >= 0) {
      return totalLimit
    }
    const playerLimit = Number(details.benchPlayerLimit)
    if (Number.isFinite(playerLimit) && playerLimit >= 0) return playerLimit
  }
  return Number(playerCount) === 8 ? 8 : null
}

// 加载赛事名称与当前组别规程
async function loadTournamentName(tid, divisionId = '') {
  try {
    const effectiveDivisionId = String(divisionId || sourceDivisionId || '')
    const [tournament, divisionRecord] = await Promise.all([
      queryById('tournaments', tid),
      effectiveDivisionId ? queryById('divisions', effectiveDivisionId).catch(() => null) : Promise.resolve(null)
    ])
    if (tournament && tournament.name) {
      tournamentNameStr.value = tournament.name
    }
    if (tournament) {
      const division = divisionRecord || (tournament.divisions || []).find(item => item && effectiveDivisionId && (item.id === effectiveDivisionId || item._id === effectiveDivisionId))
      substitutionDivision.value = division || {}
      substitutionTournament.value = tournament
      tournamentMatchFormat.value = division?.matchFormat || tournament.matchFormat || ''
      const playerCount = Number.parseInt(String(division?.matchFormat || tournamentMatchFormat.value || tournament.matchFormat || ''), 10)
      substitutePlayerLimit.value = resolveSubstitutePlayerLimit(
        playerCount,
        division,
        division?.publishedRegulationsSnapshot,
        division?.rulesSnapshot,
        tournament
      )
    }
  } catch (e) {
    console.warn('加载赛事名称失败:', e)
  }
}

// 加载比赛详情
async function loadMatch() {
  try {
    const m = await queryById('matches', matchId)
    match.value = m
    if (['finished', 'completed'].includes(m.status) || (m.events || []).length > 0) {
      activeTab.value = 'events'
    }
    homeName.value = m.homeTeamName || ''
    awayName.value = m.awayTeamName || ''
    await Promise.all([
      applyTeamLogo('home', getTeamLogoSource(m, 'home')),
      applyTeamLogo('away', getTeamLogoSource(m, 'away'))
    ])
    refName.value = m.refereeName || ''
    // 赛事名称和队徽互不依赖，并行加载，减少打开详情页的首屏等待。
    await Promise.all([
      loadTournamentName(m.tournamentId || tournamentId, m.divisionId || sourceDivisionId),
      // 加载队徽（先尝试从 tournament_teams 加载）
      loadTeamLogos(m.homeTeamId, m.awayTeamId)
    ])
    // 如果场序为空，自动计算
    if (!m.matchSequence && !m.sequence) {
      calculateMatchSequence(m)
    }
  } catch (err) {
    ElMessage.error('加载比赛失败: ' + err.message)
  }
}

// 自动计算场序（按比赛日期时间排序）
async function calculateMatchSequence(currentMatch) {
  try {
    const allMatches = await queryList('matches', {
      where: { tournamentId },
      orderBy: { matchDate: 'asc', matchTime: 'asc' },
      limit: 1000
    })
    const sorted = (allMatches || []).filter(m => m.matchDate).sort((a, b) => {
      const dtA = (a.matchDate || '') + ' ' + (a.matchTime || '00:00')
      const dtB = (b.matchDate || '') + ' ' + (b.matchTime || '00:00')
      return dtA.localeCompare(dtB)
    })
    const idx = sorted.findIndex(m => m._id === currentMatch._id)
    if (idx >= 0) {
      match.value.matchSequence = idx + 1
    }
  } catch (e) {
    console.warn('计算场序失败:', e)
  }
}

async function loadTeamLogos(homeId, awayId) {
  try {
    const ids = [homeId, awayId].filter(Boolean)
    if (ids.length === 0) return

    const teamIdMap = { home: homeId, away: awayId }
    const relationMap = { home: null, away: null }
    registeredKitColors.value = { home: { primary: {}, secondary: {} }, away: { primary: {}, secondary: {} } }
    registeredKitColorLabels.value = { home: { primary: {}, secondary: {} }, away: { primary: {}, secondary: {} } }

    // 1. 从当前赛事报名关系读取真实 teamId、队徽和报名时提交的主比赛服。
    try {
      const eventId = String(match.value.tournamentId || tournamentId || '')
      const divisionId = String(match.value.divisionId || sourceDivisionId || '')
      const relationScore = row => {
        const sameDivision = divisionId && String(row.divisionId || 'default') === divisionId ? 100 : 0
        const status = String(row.status || row.participationStatus || '').toLowerCase()
        const statusScore = ['approved','confirmed','accepted'].includes(status) ? 20 : ['pending','pending_review','claimed'].includes(status) ? 10 : 0
        const time = new Date(row.updateTime?.$date || row.updateTime || row.createTime?.$date || row.createTime || 0).getTime() || 0
        return sameDivision + statusScore + time / 1e15
      }
      const loadRelation = async sourceId => {
        const [byRelationId, byTeamId] = await Promise.all([
          queryById('tournament_teams', sourceId).catch(() => null),
          eventId ? queryList('tournament_teams', { where: { tournamentId:eventId, teamId:String(sourceId) }, limit: 100, silent:true }) : Promise.resolve([])
        ])
        const unique = new Map([byRelationId, ...(byTeamId || [])].filter(Boolean).map(item => [String(item._id), item]))
        return [...unique.values()]
          .filter(row => (!eventId || String(row.tournamentId || '') === eventId) && (String(row._id) === String(sourceId) || String(row.teamId) === String(sourceId)))
          .sort((left, right) => relationScore(right) - relationScore(left))[0] || null
      }
      ;[relationMap.home, relationMap.away] = await Promise.all([loadRelation(homeId), loadRelation(awayId)])
      for (const side of ['home','away']) {
        const relation = relationMap[side]
        if (!relation) continue
        if (relation.teamId) teamIdMap[side] = relation.teamId
        const relationLogo = getTeamLogoSource(relation)
        if (relationLogo) await applyTeamLogo(side, relationLogo)
        const source = relation.kitColors || relation.uniformColors || {}
        const sourceLabels = relation.kitColorLabels || {}
        registeredKitColors.value[side] = { primary: { ...(source.primary || source.home || {}) }, secondary: { ...(source.secondary || source.away || {}) } }
        registeredKitColorLabels.value[side] = { primary: { ...(sourceLabels.primary || sourceLabels.home || {}) }, secondary: { ...(sourceLabels.secondary || sourceLabels.away || {}) } }
      }
    } catch (e) {
      console.warn('tournament_teams 查询失败:', e)
    }

    // 2. 报名关系没有颜色时，回退球队长期主比赛服；单场手工设置仍由 matches.kitColors 优先。
    const realTeamIds = [teamIdMap.home, teamIdMap.away].filter(Boolean)
    const missingKit = side => !['jersey','shorts','socks'].some(key => registeredKitColors.value[side]?.primary?.[key] || registeredKitColors.value[side]?.secondary?.[key])
    if (realTeamIds.length > 0 && (!homeLogo.value || !awayLogo.value || missingKit('home') || missingKit('away'))) {
      try {
        const teams = (await Promise.all(realTeamIds.map(id => queryById('teams', id).catch(() => null)))).filter(Boolean)
        for (const t of teams || []) {
          for (const side of ['home','away']) {
            if (String(t._id) !== String(teamIdMap[side])) continue
            const logoSource = getTeamLogoSource(t)
            if (logoSource) await applyTeamLogo(side, logoSource)
            if (!missingKit(side)) continue
            const source = t.kitColors || t.uniformColors || {}
            const sourceLabels = t.kitColorLabels || {}
            registeredKitColors.value[side] = { primary: { ...(source.primary || source.home || {}) }, secondary: { ...(source.secondary || source.away || {}) } }
            registeredKitColorLabels.value[side] = { primary: { ...(sourceLabels.primary || sourceLabels.home || {}) }, secondary: { ...(sourceLabels.secondary || sourceLabels.away || {}) } }
          }
        }
      } catch (e) {
        console.warn('teams 查询失败:', e)
      }
    }
  } catch (e) {
    console.warn('加载队徽失败:', e)
  }
}

// 更新比赛状态
async function updateStatus(status) {
  if (!ensureEvidenceEditable()) return
  saving.value = true
  try {
    await callFunction('updateMatch', {
      matchId,
      data: { status, updateTime: new Date() }
    })
    match.value.status = status
    ElMessage.success('状态已更新')
  } catch (err) {
    ElMessage.error('更新失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

// 结束比赛
function openFinishDialog() {
  if (!ensureEvidenceEditable()) return
  finishForm.value = {
    homeScore: displayHomeScore.value,
    awayScore: displayAwayScore.value
  }
  finishDialogVisible.value = true
}

async function finishMatch() {
  if (!ensureEvidenceEditable()) return
  saving.value = true
  try {
    const result = await callFunction('updateMatch', {
      matchId,
      data: {
        homeScore: finishForm.value.homeScore,
        awayScore: finishForm.value.awayScore,
        status: 'finished',
        updateTime: new Date()
      }
    })
    match.value.homeScore = result?.data?.homeScore ?? finishForm.value.homeScore
    match.value.awayScore = result?.data?.awayScore ?? finishForm.value.awayScore
    match.value.status = 'finished'
    finishDialogVisible.value = false
    ElMessage.success('比赛已结束，比分已保存')
  } catch (err) {
    ElMessage.error('保存比分失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

// 编辑比赛
async function openEditDialog() {
  if (!ensureEvidenceEditable()) return
  editForm.value = {
    _id: match.value._id,
    matchDate: match.value.matchDate || '',
    matchTime: match.value.matchTime || '',
    venue: match.value.venue || '',
    homeTeamId: match.value.homeTeamId || null,
    awayTeamId: match.value.awayTeamId || null,
    refereId: match.value.refereeId || null,
    status: match.value.status || 'scheduled',
    homeScore: match.value.homeScore,
    awayScore: match.value.awayScore
  }
  await loadAllTeams()
  await loadReferees()
  editDialogVisible.value = true
}

async function loadAllTeams() {
  try {
    // 保底：当前比赛的两支球队先加入列表
    const baseTeamIds = new Set()
    if (match.value.homeTeamId) baseTeamIds.add(match.value.homeTeamId)
    if (match.value.awayTeamId) baseTeamIds.add(match.value.awayTeamId)

    // 再从 tournament_teams 获取该赛事关联的其他球队ID
    const tournamentTeams = await queryList('tournament_teams', {
      where: { tournamentId }
    })
    ;(tournamentTeams || [])
      .filter(tt => tt.teamId)
      .forEach(tt => baseTeamIds.add(tt.teamId))

    if (baseTeamIds.size === 0) {
      allTeams.value = []
      return
    }

    // 从 teams 集合获取球队名称
    const teams = await queryList('teams', {})
    const teamMap = new Map((teams || []).map(t => [t._id, t.teamName || '']))

    allTeams.value = Array.from(baseTeamIds).map(id => ({
      teamId: id,
      teamName: teamMap.get(id) || ''
    }))
  } catch (e) { console.warn('加载球队失败', e) }
}

async function loadReferees() {
  try {
    referees.value = await queryList('referees', {
      where: { status: 'approved' },
      orderBy: { createTime: 'desc' }
    })
  } catch (e) {
    console.warn('加载已通过裁判失败', e)
    referees.value = []
  }
}

async function saveMatchEdit() {
  if (!ensureEvidenceEditable()) return
  saving.value = true
  try {
    const f = editForm.value
    // 只在用户修改了球队选择时才更新队名，防止 allTeams 加载失败时清空队名
    const homeTeamChanged = f.homeTeamId !== match.value.homeTeamId
    const awayTeamChanged = f.awayTeamId !== match.value.awayTeamId
    const homeTeamName = homeTeamChanged
      ? (allTeams.value.find(t => t.teamId === f.homeTeamId)?.teamName || match.value.homeTeamName || '')
      : (match.value.homeTeamName || '')
    const awayTeamName = awayTeamChanged
      ? (allTeams.value.find(t => t.teamId === f.awayTeamId)?.teamName || match.value.awayTeamName || '')
      : (match.value.awayTeamName || '')

    await callFunction('updateMatch', {
      matchId: f._id,
      data: {
        matchDate: f.matchDate,
        matchTime: f.matchTime,
        venue: f.venue,
        homeTeamId: f.homeTeamId,
        homeTeamName,
        awayTeamId: f.awayTeamId,
        awayTeamName,
        refereId: f.refereeId,
        refereName: referees.value.find(r => r._id === f.refereeId)?.name || match.value.refereeName || '',
        status: f.status,
        homeScore: f.status === 'finished' ? f.homeScore : match.value.homeScore,
        awayScore: f.status === 'finished' ? f.awayScore : match.value.awayScore,
        updateTime: new Date()
      }
    })
    ElMessage.success('保存成功')
    editDialogVisible.value = false
    loadMatch()
  } catch (err) {
    ElMessage.error('保存失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

// 比赛事件
async function openAddEventDialog() {
  if (!ensureEvidenceEditable()) return
  eventForm.value = newEventForm()
  eventDialogVisible.value = true
  eventPlayersLoading.value = true
  try {
    const [home, away] = await Promise.all([
      homePlayers.value.length ? Promise.resolve(homePlayers.value) : loadTeamPlayers(match.value.homeTeamId),
      awayPlayers.value.length ? Promise.resolve(awayPlayers.value) : loadTeamPlayers(match.value.awayTeamId)
    ])
    homePlayers.value = home
    awayPlayers.value = away
  } finally {
    eventPlayersLoading.value = false
  }
}

async function saveEvent() {
  if (!ensureEvidenceEditable()) return
  let newEvents = []
  if (eventForm.value.type === 'substitution') {
    const rows = (Array.isArray(eventForm.value.substitutions) ? eventForm.value.substitutions : []).filter(row => row && typeof row === 'object' && (row.outId || row.inId))
    if (!rows.length) return ElMessage.warning('请至少填写一组换人')
    if (rows.some(row => !row.outId || !row.inId)) return ElMessage.warning('请完整选择每组换上和换下球员')
    if (new Set(rows.flatMap(row => [row.outId,row.inId])).size !== rows.length * 2) return ElMessage.warning('同一批换人不能重复选择球员')
    const input = substitutionInputState.value
    const hasStaleSelection = rows.some(row =>
      !input.incoming.some(player => getPlayerId(player) === String(row.inId)) ||
      !input.outgoing.some(player => getPlayerId(player) === String(row.outId))
    )
    if (hasStaleSelection) return ElMessage.warning('换人名单已变化，请重新选择球员')
    const batchId = `sub-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
    newEvents = rows.map((row,index) => {
      const incoming = input.incoming.find(player => getPlayerId(player) === String(row.inId))
      const outgoing = input.outgoing.find(player => getPlayerId(player) === String(row.outId))
      return {
        type:'substitution',minute:Number(eventForm.value.minute || 0),teamSide:eventForm.value.teamSide,
        teamId:String(eventForm.value.teamSide === 'away' ? match.value.awayTeamId || '' : match.value.homeTeamId || ''),
        eventId:`${batchId}-${index+1}`,
        playerName:String(incoming?.name || incoming?.playerName || ''),playerId:row.inId,inPlayerId:row.inId,playerNumber:String(incoming?.jerseyNumber ?? incoming?.number ?? ''),
        assistName:String(outgoing?.name || outgoing?.playerName || ''),assistPlayerId:row.outId,outPlayerId:row.outId,assistNumber:String(outgoing?.jerseyNumber ?? outgoing?.number ?? ''),
        substitutionPeriod:eventForm.value.substitutionPeriod,substitutionBatchId:batchId,substitutionBatchIndex:index + 1,substitutionBatchSize:rows.length,
        source:'organizer_pc',createdAt:new Date().toISOString()
      }
    })
  } else {
    if (!eventForm.value.playerName) return ElMessage.warning('请选择事件球员')
    const player = activeEventPlayers.value.find(item => String(item.name || item.playerName) === eventForm.value.playerName)
    const assist = activeEventPlayers.value.find(item => String(item.name || item.playerName) === eventForm.value.assistName)
    const penalty = isPenaltyScored(eventForm.value) || isPenaltyMissed(eventForm.value)
    newEvents = [{
      ...eventForm.value,
      teamId:String(eventForm.value.teamSide === 'away' ? match.value.awayTeamId || '' : match.value.homeTeamId || ''),
      substitutions: undefined,
      substitutionPeriod: undefined,
      playerId: String(player?._id || player?.id || player?.playerId || ''),
      playerNumber: String(player?.jerseyNumber ?? player?.number ?? ''),
      assistPlayerId: String(assist?._id || assist?.id || assist?.playerId || ''),
      assistNumber: String(assist?.jerseyNumber ?? assist?.number ?? ''),
      isGoal: isGoalEvent(eventForm.value),
      isPenalty: penalty,
      penaltyOutcome: isPenaltyMissed(eventForm.value) ? 'missed' : (isPenaltyScored(eventForm.value) ? 'scored' : undefined),
      disciplinaryOutcome: eventForm.value.type === 'second_yellow_red' ? 'second_yellow_red' : undefined,
      yellowCardCount: eventForm.value.type === 'second_yellow_red' ? 2 : undefined,
      redCardCount: eventForm.value.type === 'second_yellow_red' ? 1 : undefined,
      source: 'organizer_pc',
      createdAt: new Date().toISOString()
    }]
  }
  saving.value = true
  try {
    const events = [...(match.value.events || []), ...newEvents]
    assertSubstitutionChange(match.value,effectiveSubstitutionRules.value,events)
    const result = await callFunction('updateMatch', {
      matchId,
      expectedEventRevision:Number(match.value.matchEventRevision || 0),
      data: { events, updateTime: new Date() }
    })
    match.value.events = events
    match.value.matchEventRevision = result?.data?.matchEventRevision ?? Number(match.value.matchEventRevision || 0) + 1
    match.value.homeScore = result?.data?.homeScore ?? calculateEventScore(events).home
    match.value.awayScore = result?.data?.awayScore ?? calculateEventScore(events).away
    eventDialogVisible.value = false
    ElMessage.success('事件已添加')
  } catch (err) {
    ElMessage.error('添加事件失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

function eventIndexInSource(target) {
  const events = match.value.events || []
  const sameReference = events.indexOf(target)
  if (sameReference >= 0) return sameReference
  const eventId = String(target?.eventId || '')
  if (eventId) return events.findIndex(item => String(item?.eventId || '') === eventId)
  return events.findIndex(item => item && item.createdAt === target?.createdAt && item.type === target?.type && item.minute === target?.minute && item.teamSide === target?.teamSide && item.playerName === target?.playerName && item.assistName === target?.assistName && item.substitutionBatchIndex === target?.substitutionBatchIndex)
}

async function removeEvent(targetEvent) {
  if (!ensureEvidenceEditable()) return
  try {
    const events = [...(match.value.events || [])]
    const index = eventIndexInSource(targetEvent)
    if (index < 0) return ElMessage.warning('事件已更新，请刷新后再试')
    const eventDescription = [eventTimeText(targetEvent), eventLabel(targetEvent), targetEvent?.playerName || ''].filter(Boolean).join(' ')
    await ElMessageBox.confirm(`${eventDescription || '该比赛事件'}将被删除，删除后无法恢复。`, '确认删除比赛事件', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
    saving.value = true
    events.splice(index, 1)
    assertSubstitutionChange(match.value,effectiveSubstitutionRules.value,events)
    const result = await callFunction('updateMatch', {
      matchId,
      expectedEventRevision:Number(match.value.matchEventRevision || 0),
      data: { events, updateTime: new Date() }
    })
    match.value.events = events
    match.value.matchEventRevision = result?.data?.matchEventRevision ?? Number(match.value.matchEventRevision || 0) + 1
    match.value.homeScore = result?.data?.homeScore ?? calculateEventScore(events).home
    match.value.awayScore = result?.data?.awayScore ?? calculateEventScore(events).away
    ElMessage.success('已删除')
  } catch (err) {
    if (err !== 'cancel' && err !== 'close') ElMessage.error('删除失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

// 裁判组编辑
async function openRefereeDialog() {
  if (!ensureEvidenceEditable()) return
  await loadReferees()
  const c = match.value.refereeCrew || {}
  
  // 通过姓名反查 _id
  const findIdByName = (name) => {
    if (!name) return ''
    const ref = referees.value.find(r => r.name === name)
    return ref?._id || ''
  }
  
  const form = { operationRefereeId: match.value.operationRefereeId || match.value.refereeRecordKeeperId || '' }
  refereeRoleOptions.value.forEach(role => { form[role.key] = c[role.key]?._id || findIdByName(c[role.key]?.name) })
  const defaultOperatorRole = /^(5|6)/.test(String(currentMatchFormat.value)) ? 'timekeeper' : 'fourthOfficial'
  form.operationRefereeId = form.operationRefereeId || form[defaultOperatorRole]
  refereeForm.value = form
  refereeDialogVisible.value = true
}

async function saveRefereeCrew() {
  if (!ensureEvidenceEditable()) return
  saving.value = true
  try {
    const roleIds = refereeRoleOptions.value.map(role => refereeForm.value[role.key])
    if (roleIds.some(id => !id)) throw new Error('请完整安排4名裁判')
    if (new Set(roleIds).size !== 4) throw new Error('同一名裁判不能重复担任多个岗位')
    if (!roleIds.includes(refereeForm.value.operationRefereeId)) throw new Error('操作负责人必须从本场裁判中选择')
    const data = {}
    refereeRoleOptions.value.forEach(role => { data[role.key] = refereeForm.value[role.key] })
    const result = await callFunction('updateMatch', {
      matchId,
      data: {
        refereeCrew: data,
        refereeRecordKeeperId: refereeForm.value.operationRefereeId,
        operationRefereeId: refereeForm.value.operationRefereeId,
        updateTime: new Date()
      }
    })
    if (!result?.success) throw new Error(result?.message || '裁判指派未保存')
    await loadMatch()
    refereeDialogVisible.value = false
    ElMessage.success('裁判信息已保存')
  } catch (err) {
    ElMessage.error('保存失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

// 球服颜色编辑
function openKitDialog() {
  if (!ensureEvidenceEditable()) return
  const k = kitColors.value
  const selection = match.value.kitSelection || {}
  kitForm.value = {
    homeSet: selection.home || 'primary',
    awaySet: selection.away || 'primary',
    home: {
      jersey: normalizeKitColor(k.home?.jersey) || '',
      shorts: normalizeKitColor(k.home?.shorts) || '',
      socks: normalizeKitColor(k.home?.socks) || ''
    },
    away: {
      jersey: normalizeKitColor(k.away?.jersey) || '',
      shorts: normalizeKitColor(k.away?.shorts) || '',
      socks: normalizeKitColor(k.away?.socks) || ''
    }
  }
  kitDialogVisible.value = true
}

async function saveKitColors() {
  if (!ensureEvidenceEditable()) return
  saving.value = true
  try {
    const kitSelection = { home: kitForm.value.homeSet || 'primary', away: kitForm.value.awaySet || 'primary' }
    const snapshot = {
      home: {
        jersey: selectedKitColor('home', 'jersey') || kitForm.value.home.jersey || '',
        shorts: selectedKitColor('home', 'shorts') || kitForm.value.home.shorts || '',
        socks: selectedKitColor('home', 'socks') || kitForm.value.home.socks || ''
      },
      away: {
        jersey: selectedKitColor('away', 'jersey') || kitForm.value.away.jersey || '',
        shorts: selectedKitColor('away', 'shorts') || kitForm.value.away.shorts || '',
        socks: selectedKitColor('away', 'socks') || kitForm.value.away.socks || ''
      }
    }
    const result = await callFunction('updateMatch', {
      matchId,
      data: { kitColors: snapshot, kitSelection, updateTime: new Date() }
    })
    if (!result?.success) throw new Error(result?.message || '球服颜色未保存')
    match.value.kitColors = snapshot
    match.value.kitSelection = kitSelection
    kitDialogVisible.value = false
    ElMessage.success('球服颜色已保存')
  } catch (err) {
    ElMessage.error('保存失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

// 加载球队报名球员
async function loadTeamPlayers(teamId) {
  if (!teamId) return []
  const key = String(teamId)
  const cached = teamPlayersCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.players
  const pending = teamPlayersRequests.get(key)
  if (pending) return pending

  const request = (async () => {
    try {
      // 1. 直接查询（teamId 可能是 teams._id 或 tournament_teams._id）
      const [byTeamId, byTeamCode] = await Promise.all([
        queryList('players', { where: { teamId }, limit: 1000 }),
        queryList('players', { where: { teamCode: teamId }, limit: 1000 })
      ])
      let all = [...(byTeamId || []), ...(byTeamCode || [])]

      // 2. 如果为空，尝试通过 tournament_teams 找到真实的 teams._id
      if (all.length === 0) {
        const ttList = await queryList('tournament_teams', { where: { _id: teamId }, limit: 1 })
        if (ttList && ttList.length > 0 && ttList[0].teamId) {
          const realTeamId = ttList[0].teamId
          const [byRealId, byRealCode] = await Promise.all([
            queryList('players', { where: { teamId: realTeamId }, limit: 1000 }),
            queryList('players', { where: { teamCode: realTeamId }, limit: 1000 })
          ])
          all = [...(byRealId || []), ...(byRealCode || [])]
        }
      }

      const map = new Map()
      for (const p of all) {
        if (p._id) map.set(p._id, p)
      }
      const result = Array.from(map.values())
      // 空结果不缓存，避免临时网络异常把“暂无球员”保留到下一次打开。
      if (result.length > 0) {
        teamPlayersCache.set(key, {
          players: result,
          expiresAt: Date.now() + TEAM_PLAYERS_CACHE_TTL
        })
      }
      return result
    } catch (e) {
      console.warn('加载球队球员失败:', e)
      return []
    }
  })()

  teamPlayersRequests.set(key, request)
  try {
    return await request
  } finally {
    teamPlayersRequests.delete(key)
  }
}

function uniqueIds(values) {
  return [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))]
}

function rosterSnapshotDivision(snapshot) {
  return String(snapshot?.divisionId || snapshot?.division || '').trim()
}

function rosterSnapshotPlayerId(player) {
  return String(player?._id || player?.playerId || player?.id || '').trim()
}

function getRosterLimit(...sources) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue
    for (const field of ['rosterLimit', 'maxPlayersPerTeam', 'maxPlayers']) {
      const value = Number(source[field])
      if (Number.isFinite(value) && value > 0) return Math.floor(value)
    }
  }
  const formatValue = String(
    match.value.matchFormat || substitutionDivision.value.matchFormat || substitutionTournament.value.matchFormat || ''
  )
  const format = /side/i.test(formatValue)
    ? formatValue.toLowerCase()
    : `${formatValue.match(/(11|9|8|7|5)/)?.[1] || ''}side`
  return Number(MATCH_FORMAT_DEFAULTS[format] || 0)
}

async function loadApprovedMatchRoster(side) {
  const sourceTeamId = String(match.value[`${side}TeamId`] || '')
  const currentTournamentId = String(match.value.tournamentId || tournamentId || '')
  let currentDivisionId = String(match.value.divisionId || sourceDivisionId || '')
  if (!sourceTeamId || !currentTournamentId) throw new Error('比赛球队或赛事信息不完整')

  const directResult = await queryById('tournament_teams', sourceTeamId).catch(() => null)
  const directRelation = Array.isArray(directResult) ? directResult[0] || null : directResult
  const teamIds = uniqueIds([sourceTeamId, directRelation?.teamId])
  const registrationLists = await Promise.all(teamIds.map(teamId => queryList('tournament_teams', {
    where: { tournamentId: currentTournamentId, teamId },
    limit: 100,
    silent: true,
    cache: 'bypass',
    throwOnError: true
  })))
  const registrations = [...new Map([
    directRelation,
    ...(registrationLists || []).flat()
  ].filter(row => row && String(row.tournamentId || '') === currentTournamentId)
    .filter(row => teamIds.includes(String(row.teamId || '')) || String(row._id || '') === sourceTeamId)
    .map(row => [String(row._id || `${row.teamId}:${row.divisionId}`), row])).values()]
  const divisionIds = uniqueIds(registrations.map(row => row.divisionId || row.division))
  if (!currentDivisionId && divisionIds.length > 1) throw new Error('比赛缺少组别信息，无法安全选择赛事名单')
  if (!currentDivisionId && divisionIds.length === 1) currentDivisionId = divisionIds[0]
  const registration = registrations.find(row => !currentDivisionId || String(row.divisionId || row.division || 'default') === currentDivisionId) || null
  const actualTeamId = String(registration?.teamId || directRelation?.teamId || sourceTeamId)
  if (!currentDivisionId) throw new Error('比赛缺少组别信息，无法安全选择赛事名单')

  const result = await rosterExceptionBoard({
    tournamentId: currentTournamentId,
    teamId: actualTeamId,
    divisionId: currentDivisionId,
    rosterAction: 'listRoster'
  })
  if (!result?.success) throw new Error(result?.error || '赛事正式名单加载失败')
  const resolvedDivisionId = String(result.relation?.divisionId || '')
  if (resolvedDivisionId && resolvedDivisionId !== currentDivisionId) throw new Error('球队名单与比赛组别不一致')
  const snapshotStatus = String(result.snapshot?.status || '').toLowerCase()
  if (!['approved', 'confirmed', 'locked'].includes(snapshotStatus)) {
    throw new Error('尚未形成已审核赛事正式名单，请先完成球队名单审核')
  }
  const players = (Array.isArray(result.rows) ? result.rows : []).filter(player => player && typeof player === 'object').map(player => ({
    playerId: String(player._id || player.playerId || player.id || '').trim(),
    name: String(player.name || '').trim(),
    number: String(player.jerseyNumber || '').trim()
  })).filter(player => player.name)
    .sort((left, right) => String(left.number).localeCompare(String(right.number), 'zh-CN', { numeric: true }) || left.name.localeCompare(right.name, 'zh-CN'))
  if (!players.length) throw new Error('已审核名单中没有可读取的队员资料')

  const limit = getRosterLimit(substitutionDivision.value, registration, substitutionTournament.value)
  return { players, limit, registeredCount: players.length }
}

function calculateSuspendedPlayerIds(matches, currentMatch, homeRoster, awayRoster) {
  const ruleSources = [substitutionDivision.value?.suspensionRule, substitutionDivision.value?.rulesSnapshot?.suspensionRule, substitutionDivision.value?.publishedRegulationsSnapshot?.suspensionRule, substitutionTournament.value?.suspensionRule, substitutionTournament.value?.rules?.suspensionRule].filter(Boolean)
  const rules = ruleSources[0]
  if (!rules) return { ids: new Set(), complete: false, reason: '当前组别未找到停赛规则' }
  const yellowThreshold = Number(rules.yellowCardsForSuspension)
  const yellowBan = Number(rules.yellowCardSuspensionMatches ?? 1)
  const redBan = Number(rules.redCardSuspensionMatches)
  const secondYellowBan = Number(rules.secondYellowSuspensionMatches)
  if (!(yellowThreshold > 0) || !(yellowBan >= 0) || !(redBan >= 0) || !(secondYellowBan >= 0)) return { ids: new Set(), complete: false, reason: '停赛规则不完整' }

  const currentTime = `${currentMatch.matchDate || ''} ${currentMatch.matchTime || ''}`
  const teamIds = new Set([String(currentMatch.homeTeamId || ''), String(currentMatch.awayTeamId || '')])
  const relevant = matches.filter(item => {
    if (String(item._id) === String(currentMatch._id)) return false
    if (String(item.tournamentId || '') !== String(currentMatch.tournamentId || tournamentId)) return false
    if (String(item.divisionId || '') !== String(currentMatch.divisionId || sourceDivisionId)) return false
    const includesTeam = [item.homeTeamId, item.awayTeamId].some(id => teamIds.has(String(id || '')))
    const time = `${item.matchDate || ''} ${item.matchTime || ''}`
    return includesTeam && time < currentTime && ['finished', 'completed'].includes(String(item.status || '').toLowerCase())
  }).sort((a, b) => `${a.matchDate || ''} ${a.matchTime || ''}`.localeCompare(`${b.matchDate || ''} ${b.matchTime || ''}`))
  if (matches.length >= 1000) return { ids: new Set(), complete: false, reason: '历史比赛超过读取上限，未自动标记停赛' }
  if (relevant.some(item => !Array.isArray(item.events))) return { ids: new Set(), complete: false, reason: '历史比赛事件记录不完整，未自动标记停赛' }
  const stageOf = item => String(item.stage || item.phase || item.stageName || item.roundType || '').trim()
  const isKnockout = value => /knockout|淘汰|决赛|半决赛|四分之一|八强|四强/i.test(value)
  if ((rules.clearYellowCardsAfterGroup || rules.carryCardsToKnockout === false)
    && (!stageOf(currentMatch) || relevant.some(item => !stageOf(item)))) {
    return { ids: new Set(), complete: false, reason: '历史阶段信息不完整，无法按组别规则计算停赛' }
  }

  const bans = new Map()
  const yellows = new Map()
  const previousStageByTeam = new Map()
  for (const item of relevant) {
    const stage = stageOf(item)
    for (const teamId of [item.homeTeamId, item.awayTeamId].map(value => String(value || ''))) {
      if (!teamIds.has(teamId)) continue
      const previousStage = previousStageByTeam.get(teamId) || ''
      if (stage && previousStage && isKnockout(stage) && !isKnockout(previousStage)
        && (rules.clearYellowCardsAfterGroup || rules.carryCardsToKnockout === false)) {
        for (const key of yellows.keys()) if (key.startsWith(`${teamId}:`)) yellows.set(key, 0)
      }
      if (stage) previousStageByTeam.set(teamId, stage)
      for (const [key, remaining] of bans) {
        if (key.startsWith(`${teamId}:`) && remaining > 0) bans.set(key, remaining - 1)
      }
    }
    for (const event of item.events) {
      const type = String(event?.type || event?.eventType || '').toLowerCase()
      const isYellow = ['yellow_card', 'second_yellow_red'].includes(type)
      const isRed = ['red_card', 'second_yellow_red'].includes(type)
      if (!isYellow && !isRed) continue
      const playerId = String(event.playerId || event.player_id || '').trim()
      const eventTeamId = String(event.teamId || (event.teamSide === 'away' ? item.awayTeamId : item.homeTeamId) || '').trim()
      if (!playerId || !eventTeamId || !teamIds.has(eventTeamId)) return { ids: new Set(), complete: false, reason: '历史红黄牌缺少稳定球员或球队编号，未自动标记停赛' }
      const playerKey = `${eventTeamId}:${playerId}`
      if (isYellow) {
        const yellowCount = Number(event.yellowCardCount || event.cardCount || (type === 'second_yellow_red' ? 2 : 1))
        const count = (yellows.get(playerKey) || 0) + Math.max(1, yellowCount)
        if (count >= yellowThreshold) {
          if (yellowBan > 0) bans.set(playerKey, Math.max(bans.get(playerKey) || 0, yellowBan))
          yellows.set(playerKey, 0)
        } else yellows.set(playerKey, count)
      }
      if (isRed) {
        const matchesToBan = type === 'second_yellow_red' ? secondYellowBan : redBan
        if (matchesToBan > 0) bans.set(playerKey, Math.max(bans.get(playerKey) || 0, matchesToBan))
      }
    }
  }
  const ids = new Set()
  for (const [teamId, roster] of [[String(currentMatch.homeTeamId || ''), homeRoster], [String(currentMatch.awayTeamId || ''), awayRoster]]) {
    roster.players.forEach(player => { if (player.playerId && bans.get(`${teamId}:${player.playerId}`) > 0) ids.add(player.playerId) })
  }
  return { ids, complete: true, reason: '' }
}

async function prepareRefereeLineupSheetInput() {
  if (!match.value.homeTeamId || !match.value.awayTeamId) throw new Error('比赛缺少主客队信息，暂时无法生成工作单')
  const [homeRoster, awayRoster] = await Promise.all([
    loadApprovedMatchRoster('home'),
    loadApprovedMatchRoster('away')
  ])
  const allMatches = await queryList('matches', { where:{ tournamentId:String(match.value.tournamentId || tournamentId) }, limit:1000, silent:true, throwOnError:true })
  const suspension = calculateSuspendedPlayerIds(allMatches || [], match.value, homeRoster, awayRoster)
  if (suspension.complete) {
    homeRoster.players.forEach(player => { if (suspension.ids.has(player.playerId)) player.note='S' })
    awayRoster.players.forEach(player => { if (suspension.ids.has(player.playerId)) player.note='S' })
  }
  if (!match.value.matchSequence && !match.value.sequence && !match.value.matchNo && !match.value.matchIndex) await calculateMatchSequence(match.value)
  const rowCount = Math.max(homeRoster.limit,awayRoster.limit,homeRoster.players.length,awayRoster.players.length)
  const matchFormat = match.value.matchFormat || substitutionDivision.value.matchFormat || substitutionTournament.value.matchFormat || ''
  return {
    input:{
      match:match.value,
      matchFormat,
      tournamentName:tournamentNameStr.value || match.value.tournamentName || '',
      divisionName:substitutionDivision.value.name || substitutionDivision.value.divisionName || match.value.divisionName || match.value.division || '',
      location:substitutionTournament.value.location || substitutionTournament.value.venue || '',
      homeName:homeName.value,
      awayName:awayName.value,
      kitColors:kitColors.value,
      homePlayers:homeRoster.players,
      awayPlayers:awayRoster.players,
      rowCount
    },
    homeRoster,
    awayRoster,
    suspension
  }
}

function notifyRefereeSheetIssues(homeRoster, awayRoster, suspension, actionLabel) {
  if (homeRoster.limit && homeRoster.players.length > homeRoster.limit || awayRoster.limit && awayRoster.players.length > awayRoster.limit) {
    ElMessage.warning(`工作单${actionLabel}；有球队名单人数超过登记上限，已完整列出全部队员`)
  } else if (!suspension.complete) {
    ElMessage.warning(`工作单${actionLabel}；${suspension.reason}`)
  } else {
    ElMessage.success(`裁判工作单${actionLabel}`)
  }
}

function handleRefereeSheetCommand(command) {
  if (command === 'print') printRefereeLineupSheet()
  else downloadRefereeLineupSheet()
}

async function downloadRefereeLineupSheet() {
  if (!canDownloadRefereeSheet.value || refereeSheetLoading.value) return
  refereeSheetLoading.value = true
  try {
    const { input,homeRoster,awayRoster,suspension } = await prepareRefereeLineupSheetInput()
    const file = await createRefereeLineupSheet(input)
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = refereeLineupSheetFileName(input.match, input.homeName, input.awayName)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 30000)
    notifyRefereeSheetIssues(homeRoster,awayRoster,suspension,'已下载到本机')
  } catch (error) {
    ElMessage.error(error.message || '工作单生成失败，请检查已审核赛事名单')
  } finally {
    refereeSheetLoading.value = false
  }
}

async function printRefereeLineupSheet() {
  if (!canDownloadRefereeSheet.value || refereeSheetLoading.value) return
  const printWindow = window.open('', '_blank')
  if (!printWindow) return ElMessage.warning('请允许浏览器打开打印窗口后重试')
  refereeSheetLoading.value = true
  printWindow.document.open()
  printWindow.document.write(createRefereePrintLoadingHtml('正在读取已审核名单和停赛规则'))
  printWindow.document.close()
  try {
    const { input,homeRoster,awayRoster,suspension } = await prepareRefereeLineupSheetInput()
    const stage = printWindow.document.getElementById('referee-print-stage')
    if (stage) stage.textContent = '名单已核对，正在排版打印页面'
    printWindow.document.open()
    printWindow.document.write(createRefereeLineupPrintHtml(input))
    printWindow.document.close()
    notifyRefereeSheetIssues(homeRoster,awayRoster,suspension,'已打开打印预览')
  } catch (error) {
    printWindow.close()
    ElMessage.error(error.message || '工作单打印准备失败，请检查已审核赛事名单')
  } finally {
    refereeSheetLoading.value = false
  }
}

// 阵容编辑
async function openLineupDialog() {
  if (!ensureEvidenceEditable()) return
  const l = match.value.lineups || {}
  lineupForm.value = {
    home: {
      formation: l.home?.formation || '',
      coach: l.home?.coach || '',
      players: (l.home?.players || []).map(p => ({ ...p })),
      substitutes: (l.home?.substitutes || []).map(p => ({ ...p }))
    },
    away: {
      formation: l.away?.formation || '',
      coach: l.away?.coach || '',
      players: (l.away?.players || []).map(p => ({ ...p })),
      substitutes: (l.away?.substitutes || []).map(p => ({ ...p }))
    }
  }
  // 加载两队报名球员
  const [home, away] = await Promise.all([
    loadTeamPlayers(match.value.homeTeamId),
    loadTeamPlayers(match.value.awayTeamId)
  ])
  homePlayers.value = home
  awayPlayers.value = away
  lineupDialogVisible.value = true
}

// 可视化阵容编辑（双队模式）
async function openDualVisualEditor() {
  if (!ensureEvidenceEditable()) return
  if (visualEditorOpening.value) return
  visualEditorOpening.value = true
  try {
    if (homePlayers.value.length === 0) homePlayers.value = await loadTeamPlayers(match.value.homeTeamId)
    if (awayPlayers.value.length === 0) awayPlayers.value = await loadTeamPlayers(match.value.awayTeamId)
    visualEditorVisible.value = true
  } catch (error) {
    ElMessage.error(error.message || '读取双方球员名单失败')
  } finally {
    visualEditorOpening.value = false
  }
}

async function handleVisualLineupSave(data) {
  if (!ensureEvidenceEditable()) return
  try {
    let updateData
    if (data && data.home && data.away) {
      // dual 模式：同时保存双方阵容
      updateData = {
        lineups: {
          home: data.home,
          away: data.away
        },
        updateTime: new Date()
      }
    } else {
      // single 模式（兼容旧逻辑）
      updateData = {}
      updateData['lineups.' + currentTeamSide.value] = data
      updateData.updateTime = new Date()
    }

    await callFunction('updateMatch', {
      matchId,
      data: updateData
    })

    // 更新本地数据
    if (!match.value.lineups) match.value.lineups = {}
    if (data && data.home && data.away) {
      match.value.lineups.home = data.home
      match.value.lineups.away = data.away
    } else {
      match.value.lineups[currentTeamSide.value] = data
    }

    visualEditorVisible.value = false
    ElMessage.success('阵容保存成功')
  } catch (error) {
    ElMessage.error('保存失败：' + error.message)
  }
}

// 打开预览对话框
function openPreviewDialog() {
  previewDialogVisible.value = true
}


// ========== 比赛监督签字相关方法 ==========
// 打开签字二维码弹窗
async function openSignatureQrDialog() {
  signatureQrDialogVisible.value = true
  signatureQrLoading.value = true
  signatureError.value = ''
  signatureQrUrl.value = ''
  
  const mid = match.value?._id || match.value?.id || ''
  if (!mid) {
    signatureError.value = '比赛ID不存在'
    signatureQrLoading.value = false
    return
  }
  
  try {
    // 使用 qrcode 库生成普通二维码（绕过微信小程序码 API 限制）
    const QRCode = await import('qrcode')
    // 本地开发用局域网IP，生产用官网域名
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const baseUrl = isLocal ? 'http://192.168.1.4:5174' : 'https://www.sxffootball.cn'
    const signUrl = baseUrl + '/#/sign?matchId=' + mid
    const dataUrl = await QRCode.toDataURL(signUrl, {
      width: 280,
      margin: 2,
      color: {
        dark: '#1B5E20',
        light: '#FFFFFF'
      }
    })
    signatureQrUrl.value = dataUrl
    signatureMatchId.value = mid
    startSignaturePolling(mid)
  } catch (e) {
    console.error('生成签字二维码失败:', e)
    signatureError.value = '生成二维码失败：' + (e.message || e)
  } finally {
    signatureQrLoading.value = false
  }
}

// 轮询签字状态
function startSignaturePolling(matchId) {
  signaturePolling.value = true
  if (signaturePollTimer) clearInterval(signaturePollTimer)
  
  let pollCount = 0
  signaturePollTimer = setInterval(async () => {
    pollCount++
    if (pollCount > 60) {
      clearInterval(signaturePollTimer)
      signaturePolling.value = false
      signatureError.value = '签字超时，请重新扫码'
      return
    }
    
    try {
      const res = await callFunction('getSignatureStatus', { matchId })
      if (res && res.signed) {
        clearInterval(signaturePollTimer)
        signaturePolling.value = false
        signatureImageUrl.value = res.signatureUrl || ''
        if (match.value) {
          match.value.refereeSigned = true
          match.value.signatureUrl = res.signatureUrl || ''
        }
        ElMessage.success('比赛监督签字完成！')
        signatureQrDialogVisible.value = false
      }
    } catch (e) {
      console.error('轮询签字状态失败:', e)
    }
  }, 5000)
}

// 关闭签字二维码弹窗
function closeSignatureQrDialog() {
  signatureQrDialogVisible.value = false
  signatureQrUrl.value = ''
  signatureError.value = ''
  if (signaturePollTimer) {
    clearInterval(signaturePollTimer)
    signaturePollTimer = null
  }
  signaturePolling.value = false
}

// 刷新二维码
function refreshSignatureQr() {
  closeSignatureQrDialog()
  setTimeout(() => openSignatureQrDialog(), 300)
}

      // 移除签字
      function removeSignature() {
        signatureImageUrl.value = ''
        signatureSigned.value = false
        if (match.value) {
          match.value.refereeSigned = false
          match.value.signatureUrl = ''
        }
        ElMessage.info('已移除签字')
      }


// 保存为图片
async function saveAsImage() {
  try {
    const el = previewContent.value
    if (!el) {
      ElMessage.warning('未找到预览内容')
      return
    }

    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(el.querySelector('.csl-export-page'), {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: true,
      logging: false
    })

    // 下载图片
    const link = document.createElement('a')
    link.download = `${match.value.matchDate || ''}_${homeName.value || '主队'}vs${awayName.value || '客队'}_首发名单.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    ElMessage.success('图片已保存')
  } catch (err) {
    console.error('保存图片失败:', err)
    ElMessage.error('保存图片失败: ' + err.message)
  }
}

// 保存为PDF
async function saveAsPDF() {
  try {
    const el = previewContent.value
    if (!el) {
      ElMessage.warning('未找到预览内容')
      return
    }

    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(el.querySelector('.csl-export-page'), {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: true,
      logging: false
    })

    // 生成PDF
    const { default: jsPDF } = await import('jspdf')
    const imgData = canvas.toDataURL('image/png')
    
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const margin = 6
    
    const imgW = canvas.width
    const imgH = canvas.height
    const availW = pageW - margin * 2
    const availH = pageH - margin * 2
    const ratio = Math.min(availW / imgW, availH / imgH)
    const drawW = imgW * ratio
    const drawH = imgH * ratio
    const drawX = margin + (availW - drawW) / 2
    const drawY = margin + (availH - drawH) / 2

    doc.addImage(imgData, 'PNG', drawX, drawY, drawW, drawH)

    const fileName = `${match.value.matchDate || ''}_${homeName.value || '主队'}vs${awayName.value || '客队'}_首发名单.pdf`
    doc.save(fileName.replace(/\s+/g, ''))
    ElMessage.success('PDF已导出')
  } catch (err) {
    console.error('导出PDF失败:', err)
    ElMessage.error('导出PDF失败: ' + err.message)
  }
}

// 打印
async function printLineup() {
  try {
    const el = previewContent.value
    if (!el) {
      ElMessage.warning('未找到预览内容')
      return
    }

    // 创建打印窗口
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      ElMessage.warning('请允许浏览器打开弹出窗口')
      return
    }

    const printContent = el.querySelector('.csl-export-page').outerHTML
    const style = `
      <style>
        body { margin: 0; padding: 0; }
        .csl-export-page {
          width: 1123px;
          min-height: 794px;
          padding: 24px 32px;
          background: #fff;
          box-sizing: border-box;
          font-family: "SimSun", "宋体", "Microsoft YaHei", "PingFang SC", serif;
          color: #000;
        }
        .csl-title { text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 4px; margin-bottom: 4px; }
        .csl-subtitle { text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 12px; margin-bottom: 12px; }
        .csl-match-info { border-top: 2px solid #000; border-bottom: 1px solid #000; padding: 8px 0; margin-bottom: 8px; }
        .csl-vs-row { text-align: center; font-size: 14px; font-weight: bold; margin-bottom: 6px; }
        .csl-meta-row { display: flex; justify-content: center; gap: 24px; font-size: 12px; margin-bottom: 2px; }
        .csl-referee-block { border-bottom: 1px solid #000; padding: 6px 0; margin-bottom: 8px; }
        .csl-ref-row { display: flex; flex-wrap: wrap; gap: 8px 20px; font-size: 11px; margin-bottom: 3px; }
        .csl-ref-label { font-weight: bold; }
        .csl-team-info-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 12px; font-weight: bold; }
        .csl-section-title { font-size: 13px; font-weight: bold; margin: 6px 0 4px 0; text-align: center; }
        .csl-lineup-tables { display: flex; gap: 16px; margin-bottom: 4px; }
        .csl-table { flex: 1; border-collapse: collapse; font-size: 10px; width: 100%; }
        .csl-table th, .csl-table td { border: none; border-bottom: 1px dashed #333; padding: 3px 4px; text-align: center; vertical-align: middle; }
        .csl-table th { background: #f0f0f0; font-weight: bold; font-size: 9px; border-bottom: 1px solid #000; }
        .csl-table td:nth-child(3) { text-align: left; }
        .csl-tag { font-size: 9px; margin-left: 2px; }
        .csl-coach-row { display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; margin: 6px 0; border-bottom: 1px solid #000; padding-bottom: 4px; }
        .csl-formation-row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 8px; }
        .csl-note { font-size: 10px; text-align: center; margin: 8px 0; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 4px 0; }
        .csl-sign-row { display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; margin-top: 12px; }
      </style>
    `
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>打印首发名单</title>
          <meta charset="utf-8">
          ${style}
        </head>
        <body>
          ${printContent}
        </body>
      </html>
    `)
    printWindow.document.close()
    
    // 等待图片加载后打印
    setTimeout(() => {
      printWindow.print()
    }, 500)
    
    ElMessage.success('正在打开打印窗口')
  } catch (err) {
    console.error('打印失败:', err)
    ElMessage.error('打印失败: ' + err.message)
  }
}

// 导出首发名单（中超版PDF）- 保留兼容性
async function exportLineupPDF() {
  openPreviewDialog()
}

function onPlayerSelect(side, type, index, playerName) {
  const list = side === 'home' ? homePlayers.value : awayPlayers.value
  const player = list.find(p => p.name === playerName)
  if (!player) {
    console.warn(`[onPlayerSelect] 未找到球员: ${playerName}, 列表有 ${list.length} 人`, list.map(p => p.name))
    ElMessage.warning('未找到球员数据：' + playerName)
    return
  }
  const arr = type === 'starting' ? lineupForm.value[side].players : lineupForm.value[side].substitutes
  const p = arr[index]
  if (!p) return


  // 号码 — 兼容数字和字符串
  if (player.jerseyNumber != null && String(player.jerseyNumber).trim() !== '') {
    const num = Number(player.jerseyNumber)
    if (!isNaN(num) && num >= 1 && num <= 99) {
      p.number = num
    }
  } else {
    ElMessage.info(`球员「${player.name}」未设置球衣号码，请手动填写`)
  }
  // 球衣名 — 优先用数据库字段，其次自动计算
  if (player.jerseyName && String(player.jerseyName).trim()) {
    p.jerseyName = String(player.jerseyName).trim()
  } else {
    p.jerseyName = computeJerseyName(player.name)
  }
  // 年龄
  if (player.age) {
    p.age = player.age
  } else if (player.birthDate) {
    const birth = new Date(player.birthDate)
    if (!isNaN(birth.getTime())) {
      const now = new Date()
      let age = now.getFullYear() - birth.getFullYear()
      if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--
      p.age = age
    }
  }
  // 自动映射位置
  const posMap = {
    GK: 'GK', 守门员: 'GK', 门将: 'GK',
    DF: 'DF', 后卫: 'DF', CB: 'DF', LB: 'DF', RB: 'DF', LWB: 'DF', RWB: 'DF',
    MF: 'MF', 前卫: 'MF', 中场: 'MF', CM: 'MF', CDM: 'MF', CAM: 'MF', LM: 'MF', RM: 'MF',
    FW: 'FW', 前锋: 'FW', ST: 'FW', CF: 'FW', LW: 'FW', RW: 'FW'
  }
  if (player.position && posMap[player.position]) {
    p.position = posMap[player.position]
  }
}

function computeJerseyName(name) {
  if (!name || name.length < 2) return ''
  // 常见姓氏拼音映射（姓 → 大写拼音）
  const surnameMap = {
    '赵':'ZHAO','钱':'QIAN','孙':'SUN','李':'LI','周':'ZHOU','吴':'WU','郑':'ZHENG','王':'WANG',
    '冯':'FENG','陈':'CHEN','褚':'CHU','卫':'WEI','蒋':'JIANG','沈':'SHEN','韩':'HAN','杨':'YANG',
    '朱':'ZHU','秦':'QIN','尤':'YOU','许':'XU','何':'HE','吕':'LV','施':'SHI','张':'ZHANG',
    '孔':'KONG','曹':'CAO','严':'YAN','华':'HUA','金':'JIN','魏':'WEI','陶':'TAO','姜':'JIANG',
    '戚':'QI','谢':'XIE','邹':'ZOU','喻':'YU','柏':'BO','水':'SHUI','窦':'DOU','章':'ZHANG',
    '云':'YUN','苏':'SU','潘':'PAN','葛':'GE','奚':'XI','范':'FAN','彭':'PENG','郎':'LANG',
    '鲁':'LU','韦':'WEI','昌':'CHANG','马':'MA','苗':'MIAO','凤':'FENG','花':'HUA','方':'FANG',
    '俞':'YU','任':'REN','袁':'YUAN','柳':'LIU','酆':'FENG','鲍':'BAO','史':'SHI','唐':'TANG',
    '费':'FEI','廉':'LIAN','岑':'CEN','薛':'XUE','雷':'LEI','贺':'HE','倪':'NI','汤':'TANG',
    '滕':'TENG','殷':'YIN','罗':'LUO','毕':'BI','郝':'HAO','邬':'WU','安':'AN','常':'CHANG',
    '乐':'YUE','于':'YU','时':'SHI','傅':'FU','皮':'PI','卞':'BIAN','齐':'QI','康':'KANG',
    '伍':'WU','余':'YU','元':'YUAN','卜':'BU','顾':'GU','孟':'MENG','平':'PING','黄':'HUANG',
    '和':'HE','穆':'MU','萧':'XIAO','尹':'YIN','姚':'YAO','邵':'SHAO','湛':'ZHAN','汪':'WANG',
    '祁':'QI','毛':'MAO','禹':'YU','狄':'DI','米':'MI','贝':'BEI','明':'MING','臧':'ZANG',
    '计':'JI','伏':'FU','成':'CHENG','戴':'DAI','谈':'TAN','宋':'SONG','茅':'MAO','庞':'PANG',
    '熊':'XIONG','纪':'JI','舒':'SHU','屈':'QU','项':'XIANG','祝':'ZHU','董':'DONG','梁':'LIANG',
    '杜':'DU','阮':'RUAN','蓝':'LAN','闵':'MIN','席':'XI','季':'JI','麻':'MA','强':'QIANG',
    '贾':'JIA','路':'LU','娄':'LOU','危':'WEI','江':'JIANG','童':'TONG','颜':'YAN','郭':'GUO',
    '梅':'MEI','盛':'SHENG','林':'LIN','刁':'DIAO','钟':'ZHONG','徐':'XU','邱':'QIU','骆':'LUO',
    '高':'GAO','夏':'XIA','蔡':'CAI','田':'TIAN','樊':'FAN','胡':'HU','凌':'LING','霍':'HUO',
    '虞':'YU','万':'WAN','支':'ZHI','柯':'KE','昝':'ZAN','管':'GUAN','卢':'LU','莫':'MO',
    '经':'JING','房':'FANG','裘':'QIU','缪':'MIAO','干':'GAN','解':'XIE','应':'YING','宗':'ZONG',
    '丁':'DING','宣':'XUAN','贲':'BEN','邓':'DENG','郁':'YU','单':'SHAN','杭':'HANG','洪':'HONG',
    '包':'BAO','诸':'ZHU','左':'ZUO','石':'SHI','崔':'CUI','吉':'JI','钮':'NIU','龚':'GONG',
    '程':'CHENG','嵇':'JI','邢':'XING','滑':'HUA','裴':'PEI','陆':'LU','荣':'RONG','翁':'WENG',
    '荀':'XUN','羊':'YANG','於':'YU','惠':'HUI','甄':'ZHEN','曲':'QU','家':'JIA','封':'FENG',
    '芮':'RUI','羿':'YI','储':'CHU','靳':'JIN','汲':'JI','邴':'BING','糜':'MI','松':'SONG',
    '井':'JING','段':'DUAN','富':'FU','巫':'WU','乌':'WU','焦':'JIAO','巴':'BA','弓':'GONG',
    '牧':'MU','隗':'KUI','山':'SHAN','谷':'GU','车':'CHE','侯':'HOU','宓':'MI','蓬':'PENG',
    '全':'QUAN','郗':'XI','班':'BAN','仰':'YANG','秋':'QIU','仲':'ZHONG','伊':'YI','宫':'GONG',
    '宁':'NING','仇':'QIU','栾':'LUAN','暴':'BAO','甘':'GAN','钭':'TOU','厉':'LI','戎':'RONG',
    '祖':'ZU','武':'WU','符':'FU','刘':'LIU','景':'JING','詹':'ZHAN','束':'SHU','龙':'LONG',
    '叶':'YE','幸':'XING','司':'SI','韶':'SHAO','郜':'GAO','黎':'LI','蓟':'JI','薄':'BO',
    '印':'YIN','宿':'SU','白':'BAI','怀':'HUAI','蒲':'PU','邰':'TAI','从':'CONG','鄂':'E',
    '索':'SUO','咸':'XIAN','籍':'JI','赖':'LAI','卓':'ZHUO','蔺':'LIN','屠':'TU','蒙':'MENG',
    '池':'CHI','乔':'QIAO','阴':'YIN','郁':'YU','胥':'XU','能':'NAI','苍':'CANG','双':'SHUANG',
    '闻':'WEN','莘':'SHEN','党':'DANG','翟':'ZHAI','谭':'TAN','贡':'GONG','劳':'LAO','逄':'PANG',
    '姬':'JI','申':'SHEN','扶':'FU','堵':'DU','冉':'RAN','宰':'ZAI','郦':'LI','雍':'YONG',
    '却':'QUE','璩':'QU','桑':'SANG','桂':'GUI','濮':'PU','牛':'NIU','寿':'SHOU','通':'TONG',
    '边':'BIAN','扈':'HU','燕':'YAN','冀':'JI','郏':'JIA','浦':'PU','尚':'SHANG','农':'NONG',
    '温':'WEN','别':'BIE','庄':'ZHUANG','晏':'YAN','柴':'CHAI','瞿':'QU','阎':'YAN','充':'CHONG',
    '慕':'MU','连':'LIAN','茹':'RU','习':'XI','宦':'HUAN','艾':'AI','鱼':'YU','容':'RONG',
    '向':'XIANG','古':'GU','易':'YI','慎':'SHEN','戈':'GE','廖':'LIAO','庾':'YU','终':'ZHONG',
    '暨':'JI','居':'JU','衡':'HENG','步':'BU','都':'DU','耿':'GENG','满':'MAN','弘':'HONG',
    '匡':'KUANG','国':'GUO','文':'WEN','寇':'KOU','广':'GUANG','禄':'LU','阙':'QUE','东':'DONG',
    '欧':'OU','殳':'SHU','沃':'WO','利':'LI','蔚':'WEI','越':'YUE','夔':'KUI','隆':'LONG',
    '师':'SHI','巩':'GONG','厍':'SHE','聂':'NIE','晁':'CHAO','勾':'GOU','敖':'AO','融':'RONG',
    '冷':'LENG','訾':'ZI','辛':'XIN','阚':'KAN','那':'NUO','简':'JIAN','饶':'RAO','空':'KONG',
    '曾':'ZENG','毋':'WU','沙':'SHA','乜':'NIE','养':'YANG','鞠':'JU','须':'XU','丰':'FENG',
    '巢':'CHAO','关':'GUAN','蒯':'KUAI','相':'XIANG','查':'ZHA','后':'HOU','荆':'JING','红':'HONG',
    '游':'YOU','竺':'ZHU','权':'QUAN','逯':'LU','盖':'GE','益':'YI','桓':'HUAN','公':'GONG',
    '仉':'ZHANG','督':'DU','晋':'JIN','林':'LIN','闽':'MIN','闫':'YAN','江':'JIANG'
  }
  // 复姓映射
  const compoundMap = {
    '诸葛':'ZHUGE','司马':'SIMA','上官':'SHANGGUAN','欧阳':'OUYANG','夏侯':'XIAHOU',
    '闻人':'WENREN','东方':'DONGFANG','赫连':'HELIAN','皇甫':'HUANGFU','尉迟':'YUCHI',
    '公羊':'GONGYANG','澹台':'TANTAI','公冶':'GONGYE','宗政':'ZONGZHENG','濮阳':'PUYANG',
    '淳于':'CHUNYU','单于':'CHANYU','太叔':'TAISHU','申屠':'SHENTU','公孙':'GONGSUN',
    '仲孙':'ZHONGSUN','轩辕':'XUANYUAN','令狐':'LINGHU','钟离':'ZHONGLI','宇文':'YUWEN',
    '长孙':'ZHANGSUN','慕容':'MURONG','鲜于':'XIANYU','闾丘':'LVQIU','司徒':'SITU',
    '司空':'SIKONG','亓官':'QIGUAN','司寇':'SIKOU','子车':'ZIJU',
    '颛孙':'ZHUANSUN','端木':'DUANMU','巫马':'WUMA','公西':'GONGXI','漆雕':'QIDIAO',
    '乐正':'YUEZHENG','壤驷':'RANGSI','公良':'GONGLIANG','拓跋':'TUOBA','夹谷':'JIAGU',
    '宰父':'ZAIFU','谷梁':'GULIANG'
  }

  // 尝试匹配复姓
  for (const [surname, py] of Object.entries(compoundMap)) {
    if (name.startsWith(surname)) {
      const given = name.slice(surname.length)
      if (!given) return py
      const initials = given.split('').map(c => {
        // 简单首字母映射（仅作回退）
        const code = c.charCodeAt(0)
        if (code >= 0x4E00 && code <= 0x9FFF) {
          // 中文，使用预定义的首字母表（简化版）
          return c.toUpperCase() + '.'
        }
        return c.toUpperCase() + '.'
      }).join('')
      return py + ' ' + initials
    }
  }

  // 尝试匹配单姓
  for (const [surname, py] of Object.entries(surnameMap)) {
    if (name.startsWith(surname)) {
      const given = name.slice(surname.length)
      if (!given) return py
      const initials = given.split('').map(c => c.toUpperCase() + '.').join('')
      return py + ' ' + initials
    }
  }

  // 无法识别的姓氏：使用名字首字母作为回退
  console.warn(`[computeJerseyName] 未识别姓氏: ${name}`)
  return name.split('').map(c => c.toUpperCase() + '.').join('').slice(0, 10)
}

const surnamePinyinMap = {
  '赵':'ZHAO','钱':'QIAN','孙':'SUN','李':'LI','周':'ZHOU','吴':'WU','郑':'ZHENG','王':'WANG',
  '冯':'FENG','陈':'CHEN','褚':'CHU','卫':'WEI','蒋':'JIANG','沈':'SHEN','韩':'HAN','杨':'YANG',
  '朱':'ZHU','秦':'QIN','尤':'YOU','许':'XU','何':'HE','吕':'LYU','施':'SHI','张':'ZHANG',
  '孔':'KONG','曹':'CAO','严':'YAN','华':'HUA','金':'JIN','魏':'WEI','陶':'TAO','姜':'JIANG',
  '戚':'QI','谢':'XIE','邹':'ZOU','喻':'YU','柏':'BO','水':'SHUI','窦':'DOU','章':'ZHANG',
  '云':'YUN','苏':'SU','潘':'PAN','葛':'GE','奚':'XI','范':'FAN','彭':'PENG','郎':'LANG',
  '鲁':'LU','韦':'WEI','昌':'CHANG','马':'MA','苗':'MIAO','凤':'FENG','花':'HUA','方':'FANG',
  '俞':'YU','任':'REN','袁':'YUAN','柳':'LIU','酆':'FENG','鲍':'BAO','史':'SHI','唐':'TANG',
  '费':'FEI','廉':'LIAN','岑':'CEN','薛':'XUE','雷':'LEI','贺':'HE','倪':'NI','汤':'TANG',
  '滕':'TENG','殷':'YIN','罗':'LUO','毕':'BI','郝':'HAO','邬':'WU','安':'AN','常':'CHANG',
  '乐':'YUE','于':'YU','时':'SHI','傅':'FU','皮':'PI','卞':'BIAN','齐':'QI','康':'KANG',
  '伍':'WU','余':'YU','元':'YUAN','卜':'BU','顾':'GU','孟':'MENG','平':'PING','黄':'HUANG',
  '和':'HE','穆':'MU','萧':'XIAO','尹':'YIN','姚':'YAO','邵':'SHAO','湛':'ZHAN','汪':'WANG',
  '祁':'QI','毛':'MAO','禹':'YU','狄':'DI','米':'MI','贝':'BEI','明':'MING','臧':'ZANG',
  '计':'JI','伏':'FU','成':'CHENG','戴':'DAI','谈':'TAN','宋':'SONG','茅':'MAO','庞':'PANG',
  '熊':'XIONG','纪':'JI','舒':'SHU','屈':'QU','项':'XIANG','祝':'ZHU','董':'DONG','梁':'LIANG',
  '杜':'DU','阮':'RUAN','蓝':'LAN','闵':'MIN','席':'XI','季':'JI','麻':'MA','强':'QIANG',
  '贾':'JIA','路':'LU','娄':'LOU','危':'WEI','江':'JIANG','童':'TONG','颜':'YAN','郭':'GUO',
  '梅':'MEI','盛':'SHENG','林':'LIN','刁':'DIAO','钟':'ZHONG','徐':'XU','邱':'QIU','骆':'LUO',
  '高':'GAO','夏':'XIA','蔡':'CAI','田':'TIAN','樊':'FAN','胡':'HU','凌':'LING','霍':'HUO',
  '虞':'YU','万':'WAN','支':'ZHI','柯':'KE','昝':'ZAN','管':'GUAN','卢':'LU','莫':'MO',
  '经':'JING','房':'FANG','裘':'QIU','缪':'MIAO','干':'GAN','解':'XIE','应':'YING','宗':'ZONG',
  '丁':'DING','宣':'XUAN','贲':'BEN','邓':'DENG','郁':'YU','单':'SHAN','杭':'HANG','洪':'HONG',
  '包':'BAO','诸':'ZHU','左':'ZUO','石':'SHI','崔':'CUI','吉':'JI','钮':'NIU','龚':'GONG',
  '程':'CHENG','嵇':'JI','邢':'XING','滑':'HUA','裴':'PEI','陆':'LU','荣':'RONG','翁':'WENG',
  '荀':'XUN','羊':'YANG','於':'YU','惠':'HUI','甄':'ZHEN','曲':'QU','家':'JIA','封':'FENG',
  '芮':'RUI','羿':'YI','储':'CHU','靳':'JIN','汲':'JI','邴':'BING','糜':'MI','松':'SONG',
  '井':'JING','段':'DUAN','富':'FU','巫':'WU','乌':'WU','焦':'JIAO','巴':'BA','弓':'GONG',
  '牧':'MU','隗':'KUI','山':'SHAN','谷':'GU','车':'CHE','侯':'HOU','宓':'MI','蓬':'PENG',
  '全':'QUAN','郗':'XI','班':'BAN','仰':'YANG','秋':'QIU','仲':'ZHONG','伊':'YI','宫':'GONG',
  '宁':'NING','仇':'QIU','栾':'LUAN','暴':'BAO','甘':'GAN','钭':'TOU','厉':'LI','戎':'RONG',
  '祖':'ZU','武':'WU','符':'FU','刘':'LIU','景':'JING','詹':'ZHAN','束':'SHU','龙':'LONG',
  '叶':'YE','幸':'XING','司':'SI','韶':'SHAO','郜':'GAO','黎':'LI','蓟':'JI','薄':'BO',
  '印':'YIN','宿':'SU','白':'BAI','怀':'HUAI','蒲':'PU','邰':'TAI','从':'CONG','鄂':'E',
  '索':'SUO','咸':'XIAN','籍':'JI','赖':'LAI','卓':'ZHUO','蔺':'LIN','屠':'TU','蒙':'MENG',
  '池':'CHI','乔':'QIAO','阴':'YIN','郁':'YU','胥':'XU','能':'NAI','苍':'CANG','双':'SHUANG',
  '闻':'WEN','莘':'SHEN','党':'DANG','翟':'ZHAI','谭':'TAN','贡':'GONG','劳':'LAO','逄':'PANG',
  '姬':'JI','申':'SHEN','扶':'FU','堵':'DU','冉':'RAN','宰':'ZAI','郦':'LI','雍':'YONG',
  '却':'QUE','璩':'QU','桑':'SANG','桂':'GUI','濮':'PU','牛':'NIU','寿':'SHOU','通':'TONG',
  '边':'BIAN','扈':'HU','燕':'YAN','冀':'JI','郏':'JIA','浦':'PU','尚':'SHANG','农':'NONG',
  '温':'WEN','别':'BIE','庄':'ZHUANG','晏':'YAN','柴':'CHAI','瞿':'QU','阎':'YAN','充':'CHONG',
  '慕':'MU','连':'LIAN','茹':'RU','习':'XI','宦':'HUAN','艾':'AI','鱼':'YU','容':'RONG',
  '向':'XIANG','古':'GU','易':'YI','慎':'SHEN','戈':'GE','廖':'LIAO','庾':'YU','终':'ZHONG',
  '暨':'JI','居':'JU','衡':'HENG','步':'BU','都':'DU','耿':'GENG','满':'MAN','弘':'HONG',
  '匡':'KUANG','国':'GUO','文':'WEN','寇':'KOU','广':'GUANG','禄':'LU','阙':'QUE','东':'DONG',
  '欧':'OU','殳':'SHU','沃':'WO','利':'LI','蔚':'WEI','越':'YUE','夔':'KUI','隆':'LONG',
  '师':'SHI','巩':'GONG','厍':'SHE','聂':'NIE','晁':'CHAO','勾':'GOU','敖':'AO','融':'RONG',
  '冷':'LENG','訾':'ZI','辛':'XIN','阚':'KAN','那':'NUO','简':'JIAN','饶':'RAO','空':'KONG',
  '曾':'ZENG','毋':'WU','沙':'SHA','乜':'MIE','养':'YANG','鞠':'JU','须':'XU','丰':'FENG',
  '巢':'CHAO','关':'GUAN','蒯':'KUAI','相':'XIANG','查':'ZHA','后':'HOU','荆':'JING','红':'HONG',
  '游':'YOU','竺':'ZHU','权':'QUAN','逯':'LU','盖':'GE','益':'YI','桓':'HUAN','公':'GONG',
  '诸葛':'ZHUGE','司马':'SIMA','上官':'SHANGGUAN','欧阳':'OUYANG','夏侯':'XIAHOU',
  '闻人':'WENREN','东方':'DONGFANG','赫连':'HELIAN','皇甫':'HUANGFU','尉迟':'YUCHI',
  '公羊':'GONGYANG','澹台':'TANTAI','公冶':'GONGYE','宗政':'ZONGZHENG','濮阳':'PUYANG',
  '淳于':'CHUNYU','单于':'CHANYU','太叔':'TAISHU','申屠':'SHENTU','公孙':'GONGSUN',
  '仲孙':'ZHONGSUN','轩辕':'XUANYUAN','令狐':'LINGHU','钟离':'ZHONGLI','宇文':'YUWEN',
  '长孙':'ZHANGSUN','慕容':'MURONG','鲜于':'XIANYU','闾丘':'LYUQIU','司徒':'SITU',
  '司空':'SIKONG','亓官':'QIGUAN','司寇':'SIKOU','仉':'ZHANG','督':'DU','子车':'ZIJU',
  '颛孙':'ZHUANSUN','端木':'DUANMU','巫马':'WUMA','公西':'GONGXI','漆雕':'QIDIAO',
  '乐正':'YUEZHENG','壤驷':'RANGSI','公良':'GONGLIANG','拓跋':'TUOBA','夹谷':'JIAGU',
  '宰父':'ZAIFU','谷梁':'GULIANG'
}

function addPlayer(side, type) {
  if (!ensureEvidenceEditable()) return
  const arr = type === 'starting' ? lineupForm.value[side].players : lineupForm.value[side].substitutes
  arr.push({ number: null, position: 'DF', name: '', jerseyName: '', isCaptain: false, isForeign: false, isYoung: false, isOverage: false })
}

function removePlayer(side, type, index) {
  if (!ensureEvidenceEditable()) return
  const arr = type === 'starting' ? lineupForm.value[side].players : lineupForm.value[side].substitutes
  arr.splice(index, 1)
}

async function saveLineup() {
  if (!ensureEvidenceEditable()) return
  saving.value = true
  try {
    await callFunction('updateMatch', {
      matchId,
      data: { lineups: lineupForm.value, updateTime: new Date() }
    })
    match.value.lineups = lineupForm.value
    lineupDialogVisible.value = false
    ElMessage.success('阵容已保存')
  } catch (err) {
    ElMessage.error('保存失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadMatch().then(() => {
    if (route.query.editReferees === '1' && match.value?._id) openRefereeDialog()
  })
})
</script>

<style scoped>
.match-detail { padding: 20px; max-width: 1200px; margin: 0 auto; }

/* 顶部 Hero */
.match-hero {
  --hero-accent: rgba(255,255,255,0.28);
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 32px 24px;
  border-radius: 16px;
  margin: 20px 0;
  color: #fff;
  box-shadow: inset 0 3px 0 var(--hero-accent), 0 12px 30px rgba(20, 33, 29, 0.1);
}
.match-hero::before {
  content: '';
  position: absolute;
  z-index: -1;
  left: 50%;
  top: 50%;
  width: 138px;
  height: 138px;
  border: 1px solid rgba(255,255,255,0.09);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.match-hero::after {
  content: '';
  position: absolute;
  z-index: -1;
  inset: 0;
  background: linear-gradient(90deg, transparent calc(50% - 0.5px), rgba(255,255,255,0.065) 50%, transparent calc(50% + 0.5px));
  pointer-events: none;
}
.match-hero > * { position: relative; z-index: 1; }
.status-bg-scheduled {
  --hero-accent: rgba(71,184,129,0.72);
  background: radial-gradient(circle at 16% 0%, rgba(71,184,129,0.16), transparent 36%), linear-gradient(135deg, #172f29 0%, #24483e 100%);
}
.status-bg-ongoing {
  --hero-accent: rgba(240,162,46,0.82);
  background: radial-gradient(circle at 50% 0%, rgba(240,162,46,0.18), transparent 38%), linear-gradient(135deg, #222831 0%, #343c49 100%);
}
.status-bg-finished,
.status-bg-completed {
  --hero-accent: rgba(111,146,201,0.76);
  background: radial-gradient(circle at 84% 0%, rgba(111,146,201,0.17), transparent 36%), linear-gradient(135deg, #243147 0%, #384963 100%);
}
.status-bg-postponed {
  --hero-accent: rgba(203,213,225,0.58);
  background: linear-gradient(135deg, #353b43 0%, #515b66 100%);
}
.status-bg-cancelled {
  --hero-accent: rgba(220,104,104,0.75);
  background: linear-gradient(135deg, #493033 0%, #684044 100%);
}
.referee-review-bar { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin: 16px 0; padding: 14px 16px; border: 1px solid #f1d28e; border-radius: 10px; background: #fffaf0; }
.referee-review-bar strong, .referee-review-bar span { display: block; }
.referee-review-bar strong { color: #72520d; }
.referee-review-bar span { margin-top: 5px; color: #7d7160; font-size: 13px; }
.referee-review-actions { display: flex; flex: 0 0 auto; gap: 10px; }

.hero-team { display: flex; flex-direction: column; align-items: center; gap: 9px; width: 160px; }
.hero-logo {
  width: 68px;
  height: 68px;
  padding: 7px;
  box-sizing: border-box;
  object-fit: contain;
  border: 1px solid rgba(255,255,255,0.78);
  border-radius: 16px;
  background: rgba(255,255,255,0.96);
  box-shadow: 0 8px 22px rgba(6,16,13,0.2);
}
.hero-logo-placeholder {
  width: 64px; height: 64px; border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.25);
  background: rgba(255,255,255,0.12); display: flex; align-items: center; justify-content: center;
  font-size: 24px; color: #fff; font-weight: 700;
}
.hero-team-name { font-size: 15px; font-weight: 600; text-align: center; text-shadow: 0 1px 2px rgba(0,0,0,0.2); }

.hero-score-area { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.hero-score { display: flex; align-items: center; gap: 12px; }
.score-num { font-size: 48px; font-weight: 800; line-height: 1; }
.score-sep { font-size: 32px; opacity: 0.6; }
.hero-vs { font-size: 36px; font-weight: 700; opacity: 0.8; }
.hero-match-time { font-size: 13px; opacity: 0.8; }
.hero-venue { font-size: 13px; opacity: 0.7; margin-top: 2px; }

/* 操作栏 */
.detail-actions { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }

/* 主体布局 */
.detail-body { display: flex; gap: 20px; align-items: flex-start; }
.detail-main { flex: 1; min-width: 0; }
.detail-sidebar { width: 260px; flex-shrink: 0; }

@media (max-width: 768px) {
  .detail-body { flex-direction: column; }
  .detail-sidebar { width: 100%; }
}

.info-card {
  background: #fff; border-radius: 12px; padding: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06); margin-bottom: 16px;
}
.info-card-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #303133; }
.info-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #f5f5f5; }
.info-label { color: #909399; }
.ref-note { font-size: 13px; color: #606266; line-height: 1.6; }

/* 事件统计与时间线 */
.event-summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(110px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}
.event-summary-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 14px;
  border: 1px solid #ebeef5;
  border-radius: 10px;
  background: #fff;
}
.event-summary-icon { font-size: 22px; line-height: 1; }
.event-summary-item div { display: flex; flex-direction: column; min-width: 0; }
.event-summary-item strong { color: #1f2937; font-size: 20px; line-height: 1.1; }
.event-summary-item span:last-child { margin-top: 4px; color: #909399; font-size: 12px; }
.events-timeline { display: flex; flex-direction: column; gap: 8px; }
.events-empty { text-align: center; padding: 20px 0; color: #909399; font-size: 13px; }
.event-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 8px; background: #f9fafb;
  border-left: 3px solid #409eff; font-size: 13px;
}
.event-row.event-goal { border-left-color: #67c23a; }
.event-row.event-yellow_card { border-left-color: #e6a23c; }
.event-row.event-red_card { border-left-color: #f56c6c; }
.event-row.event-own_goal { border-left-color: #909399; }
.event-time { font-weight: 700; color: #409eff; min-width: 36px; }
.event-icon { font-size: 16px; }
.event-icon img { width: 18px; height: 18px; object-fit: contain; vertical-align: middle; }
.event-content { flex: 1; }
.event-type-label { color: #909399; margin-right: 6px; font-size: 12px; }
.event-player { font-weight: 500; }
.event-assist { color: #909399; font-size: 12px; margin-left: 6px; }
.event-side { color: #409eff; font-size: 12px; margin-left: 6px; }
.event-period { display: inline-flex; margin-right: 7px; padding: 2px 6px; border-radius: 4px; color: #7a5b0a; background: #fff4cc; font-size: 11px; }
.event-form { min-height: 310px; padding: 2px 4px 0; }
.event-form-grid { display: grid; grid-template-columns: minmax(0,1fr) 150px; gap: 14px; }
.event-form :deep(.el-form-item) { margin-bottom: 18px; }
.event-form :deep(.el-form-item__label) { height: auto; margin-bottom: 7px; color: #34443b; font-weight: 600; line-height: 1.4; }
.event-team-item { padding: 12px 14px; border: 1px solid #e3e9e5; border-radius: 7px; background: #f8faf9; }
.event-team-options { display: grid; width: 100%; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px 16px; }
.event-team-options :deep(.el-radio) { height: auto; margin: 0; white-space: normal; }
.event-team-options :deep(.el-radio__label) { overflow: hidden; text-overflow: ellipsis; }
.substitution-period-options { display: grid; width: 100%; grid-template-columns: repeat(3,minmax(0,1fr)); }
.substitution-period-options :deep(.el-radio-button__inner) { width: 100%; }
.substitution-editor { margin-bottom: 18px; overflow: hidden; border: 1px solid #e1e8e3; border-radius: 8px; background: #fff; }
.substitution-editor>header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 12px; border-bottom: 1px solid #e8edea; background: #f7faf8; }
.substitution-editor>header div { display: flex; flex-direction: column; gap: 2px; }
.substitution-editor>header span { color: #7a877f; font-size: 11px; }
.substitution-row { display: grid; grid-template-columns: 24px minmax(0,1fr) 20px minmax(0,1fr) 32px; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #edf1ee; }
.substitution-row:last-child { border-bottom: 0; }
.substitution-index { display: grid; width: 22px; height: 22px; place-items: center; border-radius: 50%; color: #fff; background: #087b43; font-size: 11px; }
.substitution-arrow { color: #87948c; }
@media (max-width: 620px) {
  .event-form-grid { grid-template-columns: 1fr; gap: 0; }
  .event-team-options { grid-template-columns: 1fr; }
  .substitution-period-options { grid-template-columns: 1fr; gap: 6px; }
  .substitution-period-options :deep(.el-radio-button__inner) { border: 1px solid #dcdfe6; border-radius: 4px; }
  .substitution-row { grid-template-columns: 24px minmax(0,1fr) 32px; }
  .substitution-row .substitution-arrow { display: none; }
  .substitution-row :deep(.el-select):first-of-type { grid-column: 2; }
  .substitution-row :deep(.el-select):last-of-type { grid-column: 2; }
}

/* 结束比赛比分输入 */
.finish-score-input {
  display: grid; grid-template-columns: minmax(0,1fr) 28px minmax(0,1fr); align-items: end; gap: 16px; padding: 12px 0 4px;
}
.finish-score-team { display: flex; min-width: 0; align-items: center; flex-direction: column; gap: 8px; }
.finish-score-team small { color: #7a877f; font-size: 12px; }
.finish-score-team strong { min-height: 42px; display: grid; place-items: center; color: #26382e; font-size: 15px; line-height: 1.35; text-align: center; overflow-wrap: anywhere; }
.finish-score-team :deep(.el-input-number) { width: 150px; max-width: 100%; }
.finish-score-team :deep(.el-input__inner) { padding-right: 42px; color: #17251d; font-size: 24px; font-weight: 800; text-align: center; }
.finish-sep { align-self: end; padding-bottom: 9px; color: #596860; font-size: 30px; font-weight: 700; text-align: center; }
@media (max-width: 560px) {
  .finish-score-input { grid-template-columns: minmax(0,1fr) 20px minmax(0,1fr); gap: 8px; }
  .finish-score-team :deep(.el-input-number) { width: 120px; }
}

/* Tab 样式 */
.detail-tabs :deep(.el-tabs__header) { margin-bottom: 16px; }
.lineup-placeholder { padding: 40px 0; }
.match-stats-panel {
  padding: 20px;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  background: #f8fafc;
}
.stats-score-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 20px;
  margin-bottom: 20px;
  color: #606266;
  text-align: center;
}
.stats-score-row span:first-child { text-align: right; }
.stats-score-row span:last-child { text-align: left; }
.stats-score-row strong { color: #064e3b; font-size: 32px; }
.stats-summary-grid { margin-bottom: 0; }
.stats-empty { padding: 28px 0 8px; color: #909399; font-size: 13px; text-align: center; }

@media (max-width: 980px) {
  .event-summary-grid { grid-template-columns: repeat(3, minmax(100px, 1fr)); }
}

/* 裁判组信息卡片 */
.info-card-title {
  display: flex;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #303133;
}
.info-empty { color: #c0c4cc; font-size: 13px; padding: 8px 0; }

/* 球服颜色展示 */
.kit-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
}
.kit-label {
  min-width: 60px;
  font-weight: 500;
  color: #606266;
}
.kit-row :deep(.el-tag) { flex: 0 0 auto; }
.kit-dots { display: flex; align-items: center; gap: 6px; }
.kit-dot {
  display: inline-block;
  width: 18px; height: 18px;
  border-radius: 50%;
  border: 1px solid #dcdfe6;
  cursor: pointer;
  transition: transform 0.15s;
}
.kit-dot:hover { transform: scale(1.3); }

/* 出场阵容展示 */
.lineup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.lineup-actions {
  display: flex;
  gap: 8px;
}
.lineup-title { font-size: 16px; font-weight: 600; color: #303133; }
.lineup-container { display: flex; gap: 24px; }
.lineup-side { flex: 1; min-width: 0; }
@medi (max-width: 768px) { .lineup-container { flex-direction: column; } }

.lineup-team-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #f5f7fa 0%, #e8f5e9 100%);
  border-radius: 8px;
  margin-bottom: 12px;
}
.team-badge {
  width: 36px; height: 36px;
  border-radius: 50%;
  background: #43a047;
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 700; flex-shrink: 0;
}
.team-badge img { width: 30px; height: 30px; object-fit: contain; border-radius: 50%; background: #fff; }
.team-badge.away { background: #e53935; }
.team-name { font-size: 14px; font-weight: 600; color: #303133; }
.team-formation { font-size: 12px; color: #909399; margin-top: 2px; }

.lineup-section-title {
  font-size: 13px;
  font-weight: 600;
  color: #909399;
  margin: 10px 0 6px 0;
  padding-bottom: 4px;
  border-bottom: 1px solid #ebeef5;
}
.lineup-table-header {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  font-size: 12px;
  color: #909399;
  background: #fafafa;
  border-radius: 4px;
  margin-bottom: 4px;
}
.lineup-player {
  display: flex;
  align-items: center;
  padding: 7px 8px;
  font-size: 13px;
  border-radius: 4px;
  transition: background 0.15s;
}
.lineup-player:hover { background: #f5f7fa; }
.lineup-player.is-captain { background: #fff8e1; }
.lineup-player.is-foreign { background: #e3f2fd; }
.lineup-player.sub { opacity: 0.7; }
.lineup-player .col-num {
  width: 36px; font-weight: 700; color: #409eff; text-align: center; flex-shrink: 0;
}
.lineup-player .col-pos {
  width: 60px; color: #909399; font-size: 12px; flex-shrink: 0;
}
.lineup-player .col-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lineup-player .col-jersey { width: 80px; color: #606266; font-size: 12px; flex-shrink: 0; }
.lineup-coach { font-size: 12px; color: #909399; padding: 8px 8px 0 8px; border-top: 1px solid #f0f0f0; margin-top: 8px; }

/* 裁判组 / 球服编辑弹窗 */
.kit-edit-section { display: flex; flex-direction: column; gap: 16px; }
.kit-edit-team { padding: 12px; background: #fafafa; border-radius: 8px; }
.kit-edit-title { font-size: 14px; font-weight: 600; margin-bottom: 10px; color: #303133; }
.kit-edit-title.away { color: #e53935; }
.kit-color-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.kit-set-picker { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.kit-preview-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; padding: 10px; border-radius: 6px; background: #f6f9f7; color: #66746b; font-size: 12px; }
.kit-preview-row i { width: 18px; height: 18px; border: 1px solid #d5dfd9; border-radius: 50%; box-shadow: inset 0 0 0 2px rgba(255,255,255,.6); }
.kit-preview-row b { margin-right: 8px; color: #304238; font-weight: 600; }
.kit-color-label { width: 50px; font-size: 13px; color: #606266; flex-shrink: 0; }
.kit-color-hex { font-size: 12px; color: #909399; min-width: 70px; }

/* 阵容编辑弹窗 */
.lineup-edit-container { display: flex; gap: 20px; }
@medi (max-width: 900px) { .lineup-edit-container { flex-direction: column; } }
.lineup-edit-side { flex: 1; min-width: 0; }
.lineup-edit-header {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 8px; font-size: 14px; font-weight: 600;
}
.le-team-name { color: #303133; }
.lineup-edit-coach { font-size: 12px; color: #606266; margin-bottom: 8px; display: flex; align-items: center; }
.lineup-edit-table-head {
  display: flex; align-items: center; padding: 6px 4px;
  font-size: 12px; color: #909399; background: #f5f7fa; border-radius: 4px; margin-bottom: 4px;
}
.le-col-num { width: 60px; text-align: center; flex-shrink: 0; font-weight: 600; }
.le-col-pos { width: 80px; flex-shrink: 0; }
.le-col-name { width: 120px; flex-shrink: 0; }
.le-col-jersey { flex: 1; min-width: 80px; }
.le-col-flags { width: 110px; flex-shrink: 0; display: flex; gap: 4px; justify-content: center; }
.le-col-act { width: 32px; flex-shrink: 0; }
.lineup-edit-row {
  display: flex; align-items: center; gap: 4px; padding: 4px 0;
}
.le-input-num { width: 60px !important; }
.le-input-num :deep(.el-input__inner) { text-align: center; }
.le-input-pos { width: 80px !important; }
.le-input-name { width: 120px !important; }
.le-input-jersey { flex: 1; min-width: 80px; width: 100% !important; }
.le-flags { display: flex; gap: 2px; align-items: center; }
.lineup-edit-subtitle {
  font-size: 12px; font-weight: 600; color: #909399;
  margin: 8px 0 4px 0; padding-top: 8px; border-top: 1px dashed #ebeef5;
}
.lineup-edit-add { margin-top: 4px; }

/* ========== 中超版首发名单导出样式 ========== */
.csl-export-wrap {
  font-family: "SimSun", "宋体", "Microsoft YaHei", "PingFang SC", serif;
  color: #000;
}
.csl-export-page {
  width: 794px;
  min-height: 1123px;
  padding: 24px 32px;
  background: #fff;
  box-sizing: border-box;
}

/* 标题 */
.csl-title {
  text-align: center;
  font-size: 24px;
  font-weight: bold;
  letter-spacing: 4px;
  margin-bottom: 4px;
}
.csl-subtitle {
  text-align: center;
  font-size: 28px;
  font-weight: bold;
  letter-spacing: 12px;
  margin-bottom: 12px;
}

/* 对阵信息 */
.csl-match-info {
  border-top: 2px solid #000;
  border-bottom: 1px solid #000;
  padding: 8px 0;
  margin-bottom: 8px;
}
.csl-vs-row {
  text-align: center;
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 6px;
}
.csl-vs-label { font-size: 12px; margin: 0 6px; }
.csl-vs-name { font-size: 15px; }
.csl-vs-sep { margin: 0 8px; }
.csl-meta-row {
  display: flex;
  justify-content: center;
  gap: 24px;
  font-size: 12px;
  margin-bottom: 2px;
}

/* 裁判组 */
.csl-referee-block {
  border-bottom: 1px solid #000;
  padding: 6px 0;
  margin-bottom: 8px;
}
.csl-ref-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  font-size: 11px;
  margin-bottom: 3px;
}
.csl-ref-label { font-weight: bold; }
.csl-ref-val { min-width: 40px; }

/* 球队信息 */
.csl-team-info-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: bold;
}
.csl-team-info { display: flex; align-items: center; gap: 6px; }
.csl-team-name { font-size: 13px; }
.csl-team-record { font-size: 11px; }
.csl-kit-info { font-size: 10px; font-weight: normal; color: #333; }

/* 分段标题 */
.csl-section-title {
  font-size: 13px;
  font-weight: bold;
  margin: 6px 0 4px 0;
  text-align: center;
}

/* 表格布局 */
.csl-lineup-tables {
  display: flex;
  gap: 16px;
  margin-bottom: 4px;
}
.csl-table {
  flex: 1;
  border-collapse: collapse;
  font-size: 10px;
  width: 100%;
}
.csl-table th,
.csl-table td {
  border: none;
  border-bottom: 1px dashed #333;
  padding: 3px 4px;
  text-align: center;
  vertical-align: middle;
}
.csl-table th {
  background: #f0f0f0;
  font-weight: bold;
  font-size: 9px;
  border-bottom: 1px solid #000;
}
.csl-table td:nth-child(3) {
  text-align: left;
}
.csl-tag {
  font-size: 9px;
  margin-left: 2px;
}

/* 主教练 */
.csl-coach-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  font-weight: bold;
  margin: 6px 0;
  border-bottom: 1px solid #000;
  padding-bottom: 4px;
}

/* 阵型 */
.csl-formation-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  margin-bottom: 8px;
}

/* 说明 */
.csl-note {
  font-size: 10px;
  text-align: center;
  margin: 8px 0;
  border-top: 1px solid #000;
  border-bottom: 1px solid #000;
  padding: 4px 0;
}

/* 签字区 */
.csl-sign-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  font-weight: bold;
  margin-top: 12px;
}
.csl-sign {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 预览对话框样式 */
.preview-container {
  max-height: 70vh;
  overflow-y: auto;
  padding: 16px;
  background: #f5f5f5;
  border-radius: 8px;
  display: flex;
  justify-content: center;
}

.preview-content {
  background: #fff;
  padding: 24px 32px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  width: 794px;
  min-height: 1123px;
  box-sizing: border-box;
}

.preview-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 0 0 0;
}
</style>
