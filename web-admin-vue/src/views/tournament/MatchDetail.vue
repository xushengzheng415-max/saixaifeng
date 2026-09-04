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
        <img v-if="homeLogo" :src="homeLogo" class="hero-logo" @error="$event.target.style.display='none'" />
        <div class="hero-logo-placeholder" v-else>{{ homeName?.[0] || '?' }}</div>
        <div class="hero-team-name">{{ homeName || '待定' }}</div>
      </div>

      <div class="hero-score-area">
        <template v-if="match.status === 'finished' || match.status === 'completed'">
          <div class="hero-score">
            <span class="score-num">{{ match.homeScore ?? 0 }}</span>
            <span class="score-sep">:</span>
            <span class="score-num">{{ match.awayScore ?? 0 }}</span>
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
        <img v-if="awayLogo" :src="awayLogo" class="hero-logo" @error="$event.target.style.display='none'" />
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
                <el-button v-if="!isRefereeEvidenceLocked" size="small" @click="openDualVisualEditor">
                  <el-icon><Picture /></el-icon> 可视化布置
                </el-button>
                <el-button v-if="!isRefereeEvidenceLocked" type="primary" size="small" @click="openLineupDialog">
                  <el-icon><Edit /></el-icon> 编辑阵容
                </el-button>
                <el-button v-if="hasLineups" type="success" size="small" @click="openPreviewDialog">
                  <el-icon><View /></el-icon> 预览首发名单（中超版）
                </el-button>
              </div>
            </div>
            <div v-if="hasLineups" ref="lineupExportArea" class="lineup-container">
              <!-- 主队阵容 -->
              <div class="lineup-side">
                <div class="lineup-team-header">
                  <span class="team-badge">{{ homeName?.[0] || '主' }}</span>
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
                  v-for="(p, i) in lineups.home?.players || []"
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
                <div class="lineup-section-title" v-if="lineups.home?.substitutes?.length">替补球员</div>
                <div
                  v-for="(p, i) in lineups.home?.substitutes || []"
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
                  <span class="team-badge away">{{ awayName?.[0] || '客' }}</span>
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
                  v-for="(p, i) in lineups.away?.players || []"
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
                <div class="lineup-section-title" v-if="lineups.away?.substitutes?.length">替补球员</div>
                <div
                  v-for="(p, i) in lineups.away?.substitutes || []"
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
              <div v-for="(evt, i) in sortedEvents" :key="i" class="event-row" :class="'event-' + evt.type">
                <div class="event-time">{{ evt.minute }}'</div>
                <div class="event-icon">{{ eventIcon(evt.type) }}</div>
                <div class="event-content">
                  <span class="event-type-label">{{ eventLabel(evt.type) }}</span>
                  <span class="event-player">{{ evt.playerName }}</span>
                  <span v-if="evt.assistName" class="event-assist">助攻: {{ evt.assistName }}</span>
                  <span v-if="evt.teamSide" class="event-side">{{ evt.teamSide === 'home' ? homeName : awayName }}</span>
                </div>
                <el-button v-if="!isRefereeEvidenceLocked" size="small" text type="danger" @click="removeEvent(i)">
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
                <strong>{{ match.homeScore ?? 0 }} : {{ match.awayScore ?? 0 }}</strong>
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
              <div class="kit-dots">
                <el-tooltip content="上衣" placement="top">
                  <span class="kit-dot" v-if="kitColors.home?.jersey" :style="{ backgroundColor: kitColors.home.jersey }"></span>
                </el-tooltip>
                <el-tooltip content="短裤" placement="top">
                  <span class="kit-dot" v-if="kitColors.home?.shorts" :style="{ backgroundColor: kitColors.home.shorts }"></span>
                </el-tooltip>
                <el-tooltip content="球袜" placement="top">
                  <span class="kit-dot" v-if="kitColors.home?.socks" :style="{ backgroundColor: kitColors.home.socks }"></span>
                </el-tooltip>
              </div>
            </div>
            <div class="kit-row">
              <span class="kit-label">{{ awayName || '客队' }}</span>
              <div class="kit-dots">
                <el-tooltip content="上衣" placement="top">
                  <span class="kit-dot" v-if="kitColors.away?.jersey" :style="{ backgroundColor: kitColors.away.jersey }"></span>
                </el-tooltip>
                <el-tooltip content="短裤" placement="top">
                  <span class="kit-dot" v-if="kitColors.away?.shorts" :style="{ backgroundColor: kitColors.away.shorts }"></span>
                </el-tooltip>
                <el-tooltip content="球袜" placement="top">
                  <span class="kit-dot" v-if="kitColors.away?.socks" :style="{ backgroundColor: kitColors.away.socks }"></span>
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
    <el-dialog v-model="finishDialogVisible" title="结束比赛 · 录入比分" width="400px">
      <div class="finish-score-input">
        <div class="finish-team">{{ homeName || '主队' }}</div>
        <el-input-number v-model="finishForm.homeScore" :min="0" size="large" style="width:100px;" />
        <span class="finish-sep">:</span>
        <el-input-number v-model="finishForm.awayScore" :min="0" size="large" style="width:100px;" />
        <div class="finish-team">{{ awayName || '客队' }}</div>
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
          <div class="kit-color-row">
            <span class="kit-color-label">上衣</span>
            <el-select v-model="kitForm.home.jersey" size="small" style="width:100px" clearable placeholder="选择">
              <el-option v-for="c in kitColorOptions" :key="c" :label="c" :value="c" />
            </el-select>
            <span class="kit-color-name">{{ kitForm.home.jersey || '未选' }}</span>
          </div>
          <div class="kit-color-row">
            <span class="kit-color-label">短裤</span>
            <el-select v-model="kitForm.home.shorts" size="small" style="width:100px" clearable placeholder="选择">
              <el-option v-for="c in kitColorOptions" :key="c" :label="c" :value="c" />
            </el-select>
            <span class="kit-color-name">{{ kitForm.home.shorts || '未选' }}</span>
          </div>
          <div class="kit-color-row">
            <span class="kit-color-label">球袜</span>
            <el-select v-model="kitForm.home.socks" size="small" style="width:100px" clearable placeholder="选择">
              <el-option v-for="c in kitColorOptions" :key="c" :label="c" :value="c" />
            </el-select>
            <span class="kit-color-name">{{ kitForm.home.socks || '未选' }}</span>
          </div>
        </div>

        <el-divider>VS</el-divider>

        <div class="kit-edit-team">
          <div class="kit-edit-title away">{{ awayName || '客队' }}（客场）</div>
          <div class="kit-color-row">
            <span class="kit-color-label">上衣</span>
            <el-select v-model="kitForm.away.jersey" size="small" style="width:100px" clearable placeholder="选择">
              <el-option v-for="c in kitColorOptions" :key="c" :label="c" :value="c" />
            </el-select>
            <span class="kit-color-name">{{ kitForm.away.jersey || '未选' }}</span>
          </div>
          <div class="kit-color-row">
            <span class="kit-color-label">短裤</span>
            <el-select v-model="kitForm.away.shorts" size="small" style="width:100px" clearable placeholder="选择">
              <el-option v-for="c in kitColorOptions" :key="c" :label="c" :value="c" />
            </el-select>
            <span class="kit-color-name">{{ kitForm.away.shorts || '未选' }}</span>
          </div>
          <div class="kit-color-row">
            <span class="kit-color-label">球袜</span>
            <el-select v-model="kitForm.away.socks" size="small" style="width:100px" clearable placeholder="选择">
              <el-option v-for="c in kitColorOptions" :key="c" :label="c" :value="c" />
            </el-select>
            <span class="kit-color-name">{{ kitForm.away.socks || '未选' }}</span>
          </div>
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
        :homeInitialLineup="match.lineups?.home"
        :awayInitialLineup="match.lineups?.away"
        @save="handleVisualLineupSave"
      />
    </el-dialog>

    <!-- 添加比赛事件弹窗 -->
    <el-dialog v-model="eventDialogVisible" title="添加比赛事件" width="460px">
      <el-form :model="eventForm" label-width="80px">
        <el-form-item label="事件类型">
          <el-select v-model="eventForm.type" style="width:100%;">
            <el-option label="进球 ⚽" value="goal" />
            <el-option label="助攻 👟" value="assist" />
            <el-option label="黄牌 🟨" value="yellow_card" />
            <el-option label="红牌 🔴" value="red_card" />
            <el-option label="换人 🔄" value="substitution" />
            <el-option label="点球 ⚽" value="penalty" />
            <el-option label="乌龙球 ⚽" value="own_goal" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间（分钟）">
          <el-input-number v-model="eventForm.minute" :min="0" :max="130" style="width:100%;" />
        </el-form-item>
        <el-form-item label="球队">
          <el-radio-group v-model="eventForm.teamSide">
            <el-radio :value="'home'">{{ homeName || '主队' }}</el-radio>
            <el-radio :value="'away'">{{ awayName || '客队' }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="球员">
          <el-input v-model="eventForm.playerName" placeholder="球员姓名" />
        </el-form-item>
        <el-form-item label="助攻球员" v-if="eventForm.type === 'goal'">
          <el-input v-model="eventForm.assistName" placeholder="助攻球员（可选）" />
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
            <span>轮次：{{ match.round || '-' }}</span>
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
                <span>轮次：{{ match.round || '-' }}</span>
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
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Edit, Delete, Plus, Soccer, User, DataLine, Picture, Download, View, Document, Printer } from '@element-plus/icons-vue'
import { queryById, callFunction, updateRecord, queryList, reviewRefereeRecord } from '../../utils/cloud'
import VisualLineupEditor from './VisualLineupEditor.vue'

const route = useRoute()
const router = useRouter()

const tournamentId = route.params.id
const matchId = route.params.matchId
const sourceDivisionId = typeof route.query.divisionId === 'string' ? route.query.divisionId : ''

const match = ref({})
const homeName = ref('')
const awayName = ref('')
const homeLogo = ref('')
const awayLogo = ref('')
const refName = ref('')
const tournamentNameStr = ref('')
const tournamentMatchFormat = ref('')
const saving = ref(false)
const reviewSaving = ref(false)
const returnRecordDialogVisible = ref(false)
const returnRecordForm = ref({ reason: '', fields: [] })
const activeTab = ref('lineup')
const homePlayers = ref([])
const awayPlayers = ref([])

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
const eventForm = ref({ type: 'goal', minute: 0, teamSide: 'home', playerName: '', assistName: '' })

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
  home: { jersey: '', shorts: '', socks: '' },
  away: { jersey: '', shorts: '', socks: '' }
})

// 可视化阵容编辑弹窗
const visualEditorVisible = ref(false)
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

// 将颜色值（可能是 hex 或颜色名）转换为显示用的颜色名
function normalizeKitColor(val) {
  if (!val) return ''
  if (kitColorOptions.includes(val)) return val
  const normalized = hexToColorName[val.toLowerCase()]
  if (normalized) return normalized
  // 如果都不匹配，返回原值
  return val
}

const phaseLabel = computed(() => {
  const p = match.value.phase
  return { group: '小组赛', league: '联赛', knockout: '淘汰赛', cup: '淘汰赛', final: '决赛' }[p] || p || '-'
})

const roundLabel = computed(() => {
  if (match.value.roundName) return match.value.roundName
  if (match.value.round) return `第${match.value.round}轮`
  return '-'
})

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
const lineupEmptyDescription = computed(() => isRefereeEvidenceLocked.value
  ? '裁判电子记录已锁定，阵容证据仅可查看'
  : '暂无阵容信息，点击上方按钮录入')
const returnableEvents = computed(() => (match.value.events || []).filter(item => item && item.type === 'goal' && item.eventId))

const sortedEvents = computed(() => {
  const events = match.value.events || []
  return [...events].sort((a, b) => (a.minute || 0) - (b.minute || 0))
})

const eventSummary = computed(() => {
  const events = match.value.events || []
  const count = (...types) => events.filter(event => types.includes(event.type)).length
  return [
    { key: 'total', icon: '📋', label: '全部事件', value: events.length },
    { key: 'goals', icon: '⚽', label: '进球', value: count('goal', 'penalty', 'own_goal') },
    { key: 'yellow', icon: '🟨', label: '黄牌', value: count('yellow_card') },
    { key: 'red', icon: '🟥', label: '红牌', value: count('red_card') },
    { key: 'subs', icon: '🔄', label: '换人', value: count('substitution') }
  ]
})

// 裁判组
const refereeCrew = computed(() => match.value.refereeCrew || {})
const currentMatchFormat = computed(() => match.value.matchFormat || tournamentMatchFormat.value || '11side')
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
  return {
    home: {
      jersey: normalizeKitColor(raw.home?.jersey),
      shorts: normalizeKitColor(raw.home?.shorts),
      socks: normalizeKitColor(raw.home?.socks)
    },
    away: {
      jersey: normalizeKitColor(raw.away?.jersey),
      shorts: normalizeKitColor(raw.away?.shorts),
      socks: normalizeKitColor(raw.away?.socks)
    }
  }
})
const hasKitColors = computed(() => {
  const k = kitColors.value
  return !!(k.home?.jersey || k.away?.jersey)
})

// 首发阵容
const lineups = computed(() => match.value.lineups || { home: null, away: null })
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
  const arr = lineups.value.home?.players || []
  const padded = [...arr]
  while (padded.length < 11) padded.push({})
  return padded
})
const awayStartersPadded = computed(() => {
  const arr = lineups.value.away?.players || []
  const padded = [...arr]
  while (padded.length < 11) padded.push({})
  return padded
})
const homeSubsPadded = computed(() => {
  const arr = lineups.value.home?.substitutes || []
  const padded = [...arr]
  while (padded.length < 12) padded.push({})
  return padded
})
const awaySubsPadded = computed(() => {
  const arr = lineups.value.away?.substitutes || []
  const padded = [...arr]
  while (padded.length < 12) padded.push({})
  return padded
})

function kitStyle(kit) {
  if (!kit || !kit.jersey) return {}
  return {
    backgroundColor: kit.jersey,
    color: isLightColor(kit.jersey) ? '#333' : '#fff',
    border: `2px solid ${kit.shorts || kit.jersey}`,
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
  return { goal: '⚽', assist: '👟', yellow_card: '🟨', red_card: '🟥', substitution: '🔄', stoppage_time: '⏱', other: '•••', penalty: '⚽', own_goal: '⚽' }[type] || '•'
}

function eventLabel(type) {
  return { goal: '进球', assist: '助攻', yellow_card: '黄牌', red_card: '红牌', substitution: '换人', stoppage_time: '补时', other: '其他', penalty: '点球', own_goal: '乌龙球' }[type] || type
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
    path: `/tournaments/${tournamentId}/schedule`,
    query: sourceDivisionId ? { divisionId: sourceDivisionId } : {}
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

// 加载赛事名称
async function loadTournamentName(tid) {
  try {
    const tournament = await queryById('tournaments', tid)
    if (tournament && tournament.name) {
      tournamentNameStr.value = tournament.name
    }
    if (tournament) {
      const division = (tournament.divisions || []).find(item => item && sourceDivisionId && (item.id === sourceDivisionId || item._id === sourceDivisionId))
      tournamentMatchFormat.value = division?.matchFormat || tournament.matchFormat || ''
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
    refName.value = m.refereeName || ''
    // 加载赛事名称
    await loadTournamentName(m.tournamentId || tournamentId)
    // 加载队徽（先尝试从 tournament_teams 加载）
    loadTeamLogos(m.homeTeamId, m.awayTeamId)
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

    // 1. 先从 tournament_teams 获取关联的真实 teamId 和其上的 logo
    try {
      const ttList = await queryList('tournament_teams', { where: { _id: { $in: ids } }, limit: 10 })
      ;(ttList || []).forEach(t => {
        if (t._id === homeId) {
          if (t.teamId) teamIdMap.home = t.teamId
          if (t.logo || t.logoUrl) homeLogo.value = t.logo || t.logoUrl
        }
        if (t._id === awayId) {
          if (t.teamId) teamIdMap.away = t.teamId
          if (t.logo || t.logoUrl) awayLogo.value = t.logo || t.logoUrl
        }
      })
    } catch (e) {
      console.warn('tournament_teams 查询失败:', e)
    }

    // 2. 用真实 teamId 查 teams 集合获取 logo
    const realTeamIds = [teamIdMap.home, teamIdMap.away].filter(Boolean)
    if (realTeamIds.length > 0 && (!homeLogo.value || !awayLogo.value)) {
      try {
        const teams = await queryList('teams', { where: { _id: { $in: realTeamIds } }, limit: 10 })
        ;(teams || []).forEach(t => {
          if (t._id === teamIdMap.home) homeLogo.value = t.logo || t.logoUrl || t.logoImage || homeLogo.value
          if (t._id === teamIdMap.away) awayLogo.value = t.logo || t.logoUrl || t.logoImage || awayLogo.value
        })
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
    homeScore: match.value.homeScore || 0,
    awayScore: match.value.awayScore || 0
  }
  finishDialogVisible.value = true
}

async function finishMatch() {
  if (!ensureEvidenceEditable()) return
  saving.value = true
  try {
    await callFunction('updateMatch', {
      matchId,
      data: {
        homeScore: finishForm.value.homeScore,
        awayScore: finishForm.value.awayScore,
        status: 'finished',
        updateTime: new Date()
      }
    })
    match.value.homeScore = finishForm.value.homeScore
    match.value.awayScore = finishForm.value.awayScore
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
function openAddEventDialog() {
  if (!ensureEvidenceEditable()) return
  eventForm.value = { type: 'goal', minute: 0, teamSide: 'home', playerName: '', assistName: '' }
  eventDialogVisible.value = true
}

async function saveEvent() {
  if (!ensureEvidenceEditable()) return
  saving.value = true
  try {
    const events = [...(match.value.events || []), { ...eventForm.value }]
    await callFunction('updateMatch', {
      matchId,
      data: { events, updateTime: new Date() }
    })
    match.value.events = events
    eventDialogVisible.value = false
    ElMessage.success('事件已添加')
  } catch (err) {
    ElMessage.error('添加事件失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

async function removeEvent(index) {
  if (!ensureEvidenceEditable()) return
  try {
    const events = [...(match.value.events || [])]
    events.splice(index, 1)
    await callFunction('updateMatch', {
      matchId,
      data: { events, updateTime: new Date() }
    })
    match.value.events = events
    ElMessage.success('已删除')
  } catch (err) {
    ElMessage.error('删除失败: ' + err.message)
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
    await callFunction('updateMatch', {
      matchId,
      data: {
        refereeCrew: data,
        refereeRecordKeeperId: refereeForm.value.operationRefereeId,
        operationRefereeId: refereeForm.value.operationRefereeId,
        updateTime: new Date()
      }
    })
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
  const k = match.value.kitColors || {}
  kitForm.value = {
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
    await callFunction('updateMatch', {
      matchId,
      data: { kitColors: kitForm.value, updateTime: new Date() }
    })
    match.value.kitColors = kitForm.value
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
    if (result.length > 0) {
    }
    return result
  } catch (e) {
    console.warn('加载球队球员失败:', e)
    return []
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
  // 确保球员数据已加载
  if (homePlayers.value.length === 0) {
    homePlayers.value = await loadTeamPlayers(match.value.homeTeamId)
  }
  if (awayPlayers.value.length === 0) {
    awayPlayers.value = await loadTeamPlayers(match.value.awayTeamId)
  }
  visualEditorVisible.value = true
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
  loadMatch()
})
</script>

<style scoped>
.match-detail { padding: 20px; max-width: 1200px; margin: 0 auto; }

/* 顶部 Hero */
.match-hero {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 32px 24px;
  border-radius: 16px;
  margin: 20px 0;
  color: #fff;
}
.status-bg-scheduled { background: linear-gradient(135deg, #1B5E20 0%, #43A047 100%); }
.status-bg-ongoing { background: linear-gradient(135deg, #e65100 0%, #f57c00 100%); }
.status-bg-finished { background: linear-gradient(135deg, #1a237e 0%, #283593 100%); }
.status-bg-completed { background: linear-gradient(135deg, #064e3b 0%, #0f766e 100%); }
.status-bg-postponed { background: linear-gradient(135deg, #616161 0%, #9e9e9e 100%); }
.status-bg-cancelled { background: linear-gradient(135deg, #b71c1c 0%, #c62828 100%); opacity: 0.7; }
.referee-review-bar { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin: 16px 0; padding: 14px 16px; border: 1px solid #f1d28e; border-radius: 10px; background: #fffaf0; }
.referee-review-bar strong, .referee-review-bar span { display: block; }
.referee-review-bar strong { color: #72520d; }
.referee-review-bar span { margin-top: 5px; color: #7d7160; font-size: 13px; }
.referee-review-actions { display: flex; flex: 0 0 auto; gap: 10px; }

.hero-team { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 160px; }
.hero-logo { width: 64px; height: 64px; object-fit: contain; }
.hero-logo-placeholder {
  width: 64px; height: 64px; border-radius: 50%;
  background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center;
  font-size: 24px; color: #fff; font-weight: 700;
}
.hero-team-name { font-size: 15px; font-weight: 600; text-align: center; }

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
.event-content { flex: 1; }
.event-type-label { color: #909399; margin-right: 6px; font-size: 12px; }
.event-player { font-weight: 500; }
.event-assist { color: #909399; font-size: 12px; margin-left: 6px; }
.event-side { color: #409eff; font-size: 12px; margin-left: 6px; }

/* 结束比赛比分输入 */
.finish-score-input {
  display: flex; align-items: center; justify-content: center; gap: 12px; padding: 16px 0;
}
.finish-team { font-weight: 600; font-size: 14px; min-width: 80px; text-align: center; }
.finish-sep { font-size: 24px; font-weight: 700; }

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
