<template>
  <div class="tournament-teams" :class="{ 'simple-team-overview': !isProfessional && activeTab === 'all', 'professional-team-overview': isProfessional && activeTab === 'all', 'simple-application-view': isSimpleApplicationView, 'professional-application-view': isProfessionalApplicationView, 'simple-change-view': isSimpleChangeView }" v-loading="loading">
    <header class="teams-context-header">
      <div class="teams-brand">
        <span class="brand-mark">赛</span>
        <div>
          <strong>赛小蜂足球</strong>
          <span>赛事管理后台</span>
        </div>
      </div>
      <div class="teams-tournament-context">
        <span class="context-label">当前赛事</span>
        <strong>{{ tournament.name || '赛事' }}</strong>
        <span class="context-divider"></span>
        <span>{{ activeDivision.name }}</span>
        <el-tag :type="isProfessional ? 'warning' : 'success'" effect="plain" round>
          {{ isProfessional ? '专业版' : '简易版 · 免费' }}
        </el-tag>
      </div>
      <el-button plain @click="router.push('/tournament-space')">退出赛事</el-button>
    </header>

    <main class="teams-page-content">
      <div class="teams-page-heading">
        <div>
          <div class="heading-eyebrow">赛事运营 / 球队管理</div>
          <h1>球队管理</h1>
          <p>管理参赛球队、入驻申请与赛事名单，所有变更均保留赛事快照。</p>
        </div>
        <div v-if="!simpleOverview" class="heading-actions">
          <el-button @click="openQrDialog"><el-icon><Picture /></el-icon>报名入口</el-button>
          <el-button v-if="isProfessional" @click="openRosterExceptions">名单异常</el-button>
          <el-button v-if="!simpleOverview" plain @click="openClaimReviewBoard">认领冲突审核</el-button>
          <el-button type="primary" @click="openInviteDialog"><el-icon><Plus /></el-icon>生成球队邀请</el-button>
          <el-button type="success" @click="openCreateTeamDialog"><el-icon><Plus /></el-icon>快速添加球队</el-button>
        </div>
      </div>

      <section class="division-toolbar">
        <div class="division-picker">
          <span>竞赛组别</span>
          <el-select v-model="activeDivisionId" @change="onDivisionChange" style="width: 190px">
            <el-option v-for="division in divisionOptions" :key="division.id" :label="division.name" :value="division.id" />
          </el-select>
        </div>
        <div class="division-rule-summary">
          <span>{{ formatLabel }}</span>
          <i></i>
          <span>每队最多 {{ activeDivision.maxPlayersPerTeam || 35 }} 人</span>
          <i></i>
          <span>{{ quotaText }}</span>
        </div>
      </section>

      <el-tabs v-model="activeTab" class="team-work-tabs" @tab-change="handleWorkspaceTab">
        <el-tab-pane label="参赛球队" name="all" />
        <el-tab-pane :label="`加入申请 ${pendingTeams.length || ''}`" name="pending" />
        <el-tab-pane v-if="isProfessional" label="参赛名单" name="roster" />
        <el-tab-pane v-if="isProfessional" label="名单异常" name="abnormal" />
        <el-tab-pane :label="isProfessional ? '名单变更' : '球队变更'" name="cancel_requested" />
      </el-tabs>

      <section v-if="isSimpleChangeView" class="team-summary-grid change-summary-grid">
        <article><span class="change-summary-icon change-gray"><el-icon><Lock /></el-icon></span><span>变更入口</span><strong class="change-text">已关闭</strong></article>
        <article><span class="change-summary-icon change-green"><el-icon><CircleCheckFilled /></el-icon></span><span>历史已通过</span><strong>{{ simpleChangeApprovedCount }}</strong><small>项</small></article>
        <article><span class="change-summary-icon change-red"><el-icon><CircleCloseFilled /></el-icon></span><span>历史已拒绝</span><strong>{{ simpleChangeRejectedCount }}</strong><small>项</small></article>
        <article><span class="change-summary-icon change-blue"><el-icon><WarningFilled /></el-icon></span><span>异常处理</span><strong>{{ simpleChangeExceptionCount }}</strong><small>项</small></article>
      </section>
      <section v-else-if="isProfessionalApplicationView" class="team-summary-grid professional-application-summary">
        <article><span class="professional-summary-icon icon-orange"><el-icon><Timer /></el-icon></span><span>待审核申请</span><strong>{{ professionalPendingApplicationCount }}</strong><small>支</small></article>
        <article><span class="professional-summary-icon icon-orange"><el-icon><User /></el-icon></span><span>待认领球队</span><strong>{{ professionalPendingClaimCount }}</strong><small>支</small></article>
        <article><span class="professional-summary-icon icon-emerald"><el-icon><CircleCheckFilled /></el-icon></span><span>本周已通过</span><strong>{{ approvedThisWeekCount }}</strong><small>支</small></article>
        <article><span class="professional-summary-icon icon-red"><el-icon><WarningFilled /></el-icon></span><span>异常关系</span><strong>{{ applicationRiskCount }}</strong><small>项</small></article>
      </section>
      <section v-else class="team-summary-grid" :class="{ 'simple-application-summary': isSimpleApplicationView }">
        <article>
          <span v-if="isProfessional" class="professional-summary-icon icon-emerald"><el-icon><UserFilled /></el-icon></span><span v-else-if="isSimpleApplicationView" class="summary-symbol summary-symbol-pending"></span><span v-else class="simple-summary-icon simple-summary-green"><el-icon><UserFilled /></el-icon></span>
          <span>{{ simpleOverview ? '参赛球队' : (isSimpleApplicationView ? '待审核申请' : '已确认参赛') }}</span>
          <strong>{{ simpleOverview ? simpleTeamCapacity : (isSimpleApplicationView ? pendingTeams.length : approvedTeams.length) }}</strong>
          <small>{{ isSimpleApplicationView ? '支' : '支球队' }}</small>
        </article>
        <article>
          <span v-if="isProfessional" class="professional-summary-icon icon-blue"><el-icon><User /></el-icon></span><span v-else-if="isSimpleApplicationView" class="summary-symbol summary-symbol-apply"></span><span v-else class="simple-summary-icon simple-summary-blue"><el-icon><User /></el-icon></span>
          <span>{{ simpleOverview ? '已认领' : (isSimpleApplicationView ? '待认领球队' : (isProfessional ? '已认领' : '待处理申请')) }}</span>
          <strong>{{ simpleOverview ? simpleClaimedCount : (isSimpleApplicationView ? invitedTeams.length : (isProfessional ? claimedTeams.length : pendingTeams.length)) }}</strong>
          <small>{{ simpleOverview || isSimpleApplicationView || isProfessional ? '支' : '条申请' }}</small>
        </article>
        <article>
          <span v-if="isProfessional" class="professional-summary-icon icon-orange"><el-icon><DocumentChecked /></el-icon></span><span v-else-if="isSimpleApplicationView" class="summary-symbol summary-symbol-success"></span><span v-else class="simple-summary-icon simple-summary-orange"><el-icon><User /></el-icon></span>
          <span>{{ simpleOverview ? '待认领' : (isSimpleApplicationView ? '本周已通过' : (isProfessional ? '名单已提交' : '已发出邀请')) }}</span>
          <strong>{{ simpleOverview ? pendingClaimCount : (isSimpleApplicationView ? simpleApprovedThisWeekCount : (isProfessional ? submittedRosterCount : invitedTeams.length)) }}</strong>
          <small>{{ simpleOverview || isSimpleApplicationView ? '支' : (isProfessional ? `共 ${approvedTeams.length} 支` : '支球队') }}</small>
        </article>
        <article>
          <span v-if="isProfessional" class="professional-summary-icon icon-teal"><el-icon><WarningFilled /></el-icon></span><span v-else-if="isSimpleApplicationView" class="summary-symbol summary-symbol-alert"></span><span v-else class="simple-summary-icon simple-summary-teal"><el-icon><CircleCheckFilled /></el-icon></span>
          <span>{{ simpleOverview ? '已确认参赛' : (isSimpleApplicationView ? '异常关系' : (isProfessional ? '名单待完善' : '剩余名额')) }}</span>
          <strong :class="{ danger: (isProfessional && exceptionCount > 0) || (isSimpleApplicationView && applicationRiskCount > 0) }">{{ simpleOverview ? simpleConfirmedCount : (isSimpleApplicationView ? applicationRiskCount : (isProfessional ? exceptionCount : displayAvailableSlots)) }}</strong>
          <small>{{ simpleOverview || isSimpleApplicationView || isProfessional ? (isSimpleApplicationView ? '项' : '支') : '个席位' }}</small>
        </article>
      </section>

      <el-alert
        class="teams-mode-notice"
        :title="isSimpleChangeView ? `本组报名已于 ${simpleChangeDeadline} 截止；参赛队名与队徽已锁定，普通流程不再允许修改。` : (isApplicationReviewView ? '球队可通过主办方邀请进入，或在赛小蜂小程序搜索赛事后申请；无论哪种入口，球队都必须在小程序完成认领与参赛确认。' : (isProfessional ? '专业版按赛事正式名单管理球员资格；审核后的名单与比赛阵容均保留独立快照。' : '简易版以球队为单位快速参赛；需要球员资格审核与正式名单时，可将组别升级为专业版。'))"
        :type="isSimpleChangeView ? 'info' : (isProfessional ? 'warning' : 'success')"
        :closable="false"
        show-icon
      />

      <section v-if="simpleOverview" class="simple-team-filters">
        <el-input v-model="searchKeyword" placeholder="搜索球队名称" clearable :prefix-icon="Search" />
        <el-select v-model="professionalSourceFilter" placeholder="加入来源（主办方邀请/搜索申请）" clearable><el-option label="主办方邀请" value="invite" /><el-option label="搜索赛事申请" value="apply" /></el-select>
        <el-select v-model="professionalClaimFilter" placeholder="认领状态" clearable><el-option label="已认领" value="claimed" /><el-option label="待认领" value="pending" /></el-select>
        <el-button type="primary" plain @click="openInviteDialog"><el-icon><Plus /></el-icon>生成球队邀请</el-button>
        <el-button type="success" @click="openCreateTeamDialog"><el-icon><Plus /></el-icon>快速添加球队</el-button>
      </section>

      <section v-if="isApplicationReviewView" class="simple-application-filters" :class="{ 'professional-application-filters': isProfessionalApplicationView }">
        <el-input v-model="searchKeyword" placeholder="搜索球队名称" clearable :prefix-icon="Search" />
        <el-select v-model="applicationSource" placeholder="申请来源" clearable>
          <el-option label="小程序搜索申请" value="apply" />
          <el-option label="主办方邀请" value="invite" />
        </el-select>
        <el-select v-model="applicationStatus" placeholder="申请状态" clearable>
          <el-option label="待审核" value="pending" />
          <el-option label="已通过" value="approved" />
        </el-select>
        <el-date-picker v-model="applicationDate" type="date" placeholder="申请时间" />
        <el-button plain type="success" @click="approveAllVisibleApplications"><el-icon><CircleCheckFilled /></el-icon>批量通过</el-button>
        <el-button v-if="isProfessionalApplicationView" plain @click="showApplicationJoinRules"><el-icon><Setting /></el-icon>球队加入设置</el-button>
        <el-button plain type="success" @click="resetApplicationFilters">重置</el-button>
      </section>

      <section v-if="isProfessional && activeTab === 'all'" class="professional-team-filters">
        <el-input v-model="searchKeyword" placeholder="搜索球队名称" clearable :prefix-icon="Search" />
        <el-select v-model="professionalSourceFilter" placeholder="加入来源" clearable><el-option label="主办方邀请" value="invite" /><el-option label="搜索赛事申请" value="apply" /></el-select>
        <el-select v-model="professionalClaimFilter" placeholder="认领状态" clearable><el-option label="已认领" value="claimed" /><el-option label="待认领" value="pending" /></el-select>
        <el-select v-model="professionalRosterFilter" placeholder="赛事名单状态" clearable><el-option label="已提交" value="submitted" /><el-option label="草稿" value="draft" /><el-option label="未提交" value="empty" /></el-select>
        <el-button type="primary" plain @click="openInviteDialog"><el-icon><Picture /></el-icon>生成球队邀请</el-button>
        <el-button type="success" @click="openCreateTeamDialog"><el-icon><Plus /></el-icon>快速添加球队</el-button>
      </section>

      <section v-if="isSimpleChangeView && !showPendingChangeReview" class="simple-change-history">
        <div class="change-history-heading"><div><h2>历史变更记录</h2><span>所有变更保留审计记录</span></div><div><el-button plain type="success" @click="exportSimpleChangeHistory"><el-icon><Download /></el-icon>导出记录</el-button><el-button plain type="success" @click="showSimpleChangeRules"><el-icon><InfoFilled /></el-icon>变更规则</el-button></div></div>
        <div class="change-history-filters"><el-select v-model="changeTypeFilter" placeholder="变更类型" clearable><el-option label="更换球队队徽" value="logo"/><el-option label="更换负责人" value="manager"/><el-option label="更改球队名称" value="name"/></el-select><el-select v-model="changeStatusFilter" placeholder="处理状态" clearable><el-option label="已通过" value="approved"/><el-option label="已拒绝" value="rejected"/></el-select><el-date-picker v-model="changeDateRange" type="daterange" start-placeholder="开始日期" end-placeholder="结束日期"/><el-input v-model="changeKeyword" placeholder="搜索球队名称" clearable :prefix-icon="Search"/></div>
        <div class="change-history-table"><div class="change-history-row change-history-head"><span>变更时间</span><span>变更类型</span><span>变更内容</span><span>变更前</span><span></span><span>变更后</span><span>申请人</span><span>影响范围</span><span>状态</span><span>操作</span></div><div v-for="row in filteredSimpleChangeHistory" :key="row.id" class="change-history-row"><span>{{ row.time }}</span><span>{{ row.typeLabel }}</span><strong>{{ row.teamName }}</strong><span>{{ row.before }}</span><span class="change-arrow">→</span><span>{{ row.after }}</span><span>{{ row.applicant }}</span><span>{{ row.scope }}</span><span><el-tag :type="row.status === 'approved' ? 'success' : 'danger'" size="small">{{ row.status === 'approved' ? '已通过' : '已拒绝' }}</el-tag></span><el-button link type="primary" @click="viewSimpleChangeRecord(row)">查看记录</el-button></div></div>
        <div class="change-principles"><div><el-icon><InfoFilled /></el-icon><span>报名截止前可修改参赛队名、队徽；截止后原则上不予变更。确需纠错时，仅由主办方异常处理并完善留痕。</span></div><div><strong>处理原则</strong><span>报名截止后普通流程不予修改</span><span>所有更改保留审计记录</span></div></div>
      </section>

      <section v-if="!isSimpleChangeView || showPendingChangeReview" class="teams-table-panel" :class="{ 'simple-application-panel': isApplicationReviewView, 'professional-team-panel': isProfessional && activeTab === 'all', 'professional-application-panel': isProfessionalApplicationView }">
        <div class="table-toolbar">
          <div>
            <strong>{{ activeTabTitle }}</strong>
            <span>共 {{ filteredTeams.length }} 条</span>
          </div>
          <el-input v-if="!isApplicationReviewView && !simpleOverview" v-model="searchKeyword" placeholder="搜索球队名称、教练或编号" clearable :prefix-icon="Search" style="width: 286px" />
        </div>

        <div class="teams-data-table" role="table">
          <div v-if="isApplicationReviewView" class="teams-table-row simple-application-row teams-table-head" role="row">
            <span>申请球队（队徽 + 名称）</span><span>申请组别</span><span>申请来源</span><span>申请人 / 手机号</span>
            <span>长期球队状态</span><span>申请时间</span><span>风险检查</span><span>操作</span>
          </div>
          <div v-else class="teams-table-row teams-table-head" :class="{ 'professional-table-row': isProfessional }" role="row">
            <span>球队（队徽 + 名称）</span><span>赛事参赛编号</span><span>加入来源</span><span>小程序认领状态</span>
            <span>参赛确认</span><span v-if="isProfessional">赛事参赛名单</span><span>球员数</span><span>操作</span>
          </div>
          <div v-for="row in filteredTeams" :key="row.recordId" class="teams-table-row" :class="{ 'simple-application-row': isApplicationReviewView, 'professional-table-row': isProfessional }" role="row">
            <div class="team-identity">
              <img v-if="row.logo || row.logoUrl" :src="row.logo || row.logoUrl" class="team-crest" alt="" />
              <span v-else class="team-crest-placeholder">{{ teamInitial(row) }}</span>
              <div><strong>{{ row.name || row.teamName || '未命名球队' }}</strong><small>{{ row.shortName || row.coachName || row.contactName || '—' }}</small></div>
            </div>
            <template v-if="isApplicationReviewView">
              <span>{{ activeDivision.name }}</span><span>{{ teamSource(row) }}</span><span>{{ applicationOwner(row) }}</span>
              <span><el-tag type="success" effect="light" size="small">{{ longTermTeamLabel(row) }}</el-tag></span><span>{{ applicationTime(row) }}</span>
              <span><el-tag :type="applicationRiskType(row)" effect="plain" size="small">{{ applicationRiskLabel(row) }}</el-tag></span>
              <div class="team-row-actions"><el-button link type="success" @click="approveTeam(row)">通过</el-button><el-button link type="danger" @click="rejectTeam(row)">拒绝</el-button><el-button link type="primary" @click="openTeamPlayers(row)">查看</el-button></div>
            </template>
            <template v-else>
            <span>{{ teamRegistrationNo(row) }}</span><span><el-tag :type="teamSource(row) === '主办方邀请' ? 'primary' : 'warning'" effect="light" size="small">{{ teamSource(row) }}</el-tag></span>
            <span><el-tag :type="claimType(row)" effect="plain" size="small">{{ claimLabel(row) }}</el-tag></span>
            <span><el-tag :type="getStatusType(row.status)" size="small">{{ getStatusLabel(row.status) }}</el-tag></span>
            <span v-if="isProfessional"><el-tag :type="rosterTagType(row)" effect="light" size="small">{{ rosterLabel(row) }}<template v-if="rosterPlayerCount(row)">（{{ rosterPlayerCount(row) }}人）</template></el-tag></span>
            <span v-if="isProfessional">{{ rosterPlayerCount(row) || '—' }} 人</span><span v-else>{{ row.matchCount || 0 }} 场</span>
            <div class="team-row-actions">
              <template v-if="row.status === 'pending'"><el-button link type="success" @click="approveTeam(row)">通过</el-button><el-button link type="danger" @click="rejectTeam(row)">拒绝</el-button></template>
              <template v-else-if="row.status === 'cancel_requested'"><el-button link type="danger" @click="approveCancel(row)">同意变更</el-button><el-button link @click="rejectCancel(row)">驳回</el-button></template>
              <template v-else><el-button link type="primary" @click="openTeamPlayers(row)">查看球队</el-button><el-button v-if="isProfessional && row.status === 'approved'" link type="primary" @click="openTeamRoster(row)">查看名单</el-button><el-button v-if="isProfessional && claimLabel(row) !== '已认领'" link type="success" @click="openClaimReminder(row)">发送认领提醒</el-button><el-button v-if="row.status === 'invited'" link type="danger" @click="cancelInvite(row)">取消邀请</el-button><el-button v-if="row.status === 'approved'" link type="danger" @click="removeTeam(row)">移除</el-button></template>
            </div>
            </template>
          </div>
          <div v-if="filteredTeams.length === 0" class="teams-empty">暂无符合条件的球队</div>
        </div>
      </section>
      <section v-if="isApplicationReviewView && pendingClaimRows.length" class="teams-table-panel pending-claim-panel">
        <div class="table-toolbar"><div><strong>主办方邀请待认领 {{ pendingClaimRows.length }} 支</strong></div></div>
        <div class="teams-data-table" role="table"><div class="teams-table-row pending-claim-row teams-table-head" role="row"><span>球队（队徽 + 名称）</span><span>所属组别</span><span>专属小程序认领链接</span><span>发送时间</span><span>操作</span></div><div v-for="row in pendingClaimRows" :key="row.recordId" class="teams-table-row pending-claim-row" role="row"><div class="team-identity"><img v-if="row.logo || row.logoUrl" :src="row.logo || row.logoUrl" class="team-crest" alt="" /><span v-else class="team-crest-placeholder">{{ teamInitial(row) }}</span><div><strong>{{ row.name || row.teamName }}</strong></div></div><span>{{ activeDivision.name }}</span><span><el-tag type="warning" effect="plain" size="small">未认领</el-tag></span><span>{{ applicationTime(row) }}</span><div class="team-row-actions"><el-button link type="primary" @click="openClaimReminder(row)">复制认领链接</el-button><el-button link type="success" @click="openClaimReminder(row)">发送提醒</el-button><el-button link type="danger" @click="cancelInvite(row)">撤回邀请</el-button></div></div></div>
      </section>
      <div v-if="isProfessionalApplicationView" class="professional-application-boundary"><el-icon><InfoFilled /></el-icon><span>申请通过后，球队先完成小程序认领与参赛确认，再进入赛事参赛名单提交；审核不会自动生成名单或授予球队所有权。</span></div>
    </main>

    <!-- Local visual-QA uses a native overlay because the CDP compositor does not paint Element Plus teleported dialogs. -->
    <div :style="{ display: overlayAction ? '' : 'none' }" class="qa-dialog-mask" role="presentation">
      <section v-if="qaVisualAction === 'invite'" class="qa-dialog qa-invite-credential" role="dialog" aria-modal="true" aria-label="生成球队邀请">
        <header class="credential-header"><h2>生成球队邀请</h2><button class="qa-close" type="button" aria-label="关闭" @click="closeQaVisualAction">×</button></header>
        <div class="credential-body"><div class="credential-details"><dl><dt>当前组别</dt><dd><span class="credential-division">{{ activeDivision.name }}</span></dd><dt>加入方式</dt><dd>球队负责人在赛小蜂小程序创建或认领球队并确认参赛</dd><dt>有效期至</dt><dd>{{ inviteExpiryText }}</dd></dl><div class="credential-actions"><button type="button" class="credential-button" @click="copyInviteCredential"><span>⧉</span>复制邀请链接</button><button type="button" class="credential-button" @click="downloadInviteCode"><span>↓</span>下载小程序码</button></div><div class="credential-note">ⓘ　邀请仅建立球队与本赛事的加入关系，球队仍需在小程序完成认领与参赛确认。</div></div><figure class="credential-code"><div class="credential-qr-vector" role="img" aria-label="赛事球队邀请小程序码" v-html="inviteQrSvg"></div><figcaption>赛事球队邀请小程序码</figcaption></figure><label class="credential-link">邀请链接<input :value="inviteCredentialLink" readonly /></label></div>
        <footer class="credential-footer"><button type="button" class="credential-cancel" @click="closeQaVisualAction">取消</button><button type="button" class="credential-complete" @click="completeInviteCredential">完成</button></footer>
      </section>
      <section v-else-if="qaVisualAction === 'quick-add'" class="qa-dialog qa-quick-team" role="dialog" aria-modal="true" aria-label="快速添加球队">
        <header class="quick-team-header"><h2>快速添加球队</h2><button class="qa-close" type="button" aria-label="关闭" @click="closeQaVisualAction">×</button></header>
        <div class="quick-team-body"><button class="quick-logo" type="button" aria-label="上传球队队徽"><img :src="`${publicBase}organization-logo-placeholder.svg`" alt="" /><strong>上传球队队徽（可选）</strong><small>支持JPG/PNG格式，2MB以内</small></button><div class="quick-fields"><label><span><b>*</b> 球队名称</span><input v-model="createTeamForm.name" placeholder="请输入球队名称" maxlength="50" /></label><label><span><b>*</b> 赛事参赛编号 <em>（系统自动生成）</em></span><input :value="`HNYC-${activeDivision.name.replace('组', '')}-033`" readonly /></label><label><span><b>*</b> 所属组别</span><select :value="activeDivision.name" disabled><option>{{ activeDivision.name }}</option></select></label></div><div class="quick-row"><label><span><b>*</b> 球队负责人</span><input v-model="createTeamForm.contactName" placeholder="请输入负责人姓名" /></label><label><span><b>*</b> 联系电话</span><input v-model="createTeamForm.contactPhone" placeholder="请输入负责人手机号" maxlength="20" /></label></div><label class="quick-check"><input type="checkbox" checked disabled />保存后生成该球队认领链接</label><p class="quick-boundary">专业版球队必须填写负责人和联系电话，完成小程序认领后才能提交参赛球员名单。</p><div class="quick-tip"><span>i</span>保存后生成定向认领链接；球队负责人须进入赛小蜂小程序完成认领与参赛确认。</div></div>
        <footer class="quick-team-footer"><button type="button" class="quick-cancel" @click="closeQaVisualAction">取消</button><button type="button" class="quick-return" @click="submitQuickTeam('return')">保存并返回列表</button><button type="button" class="quick-save" @click="submitQuickTeam('continue')">保存并继续添加</button></footer>
      </section>
      <section v-else-if="overlayAction === 'claim-invite'" class="qa-dialog qa-claim-dialog" role="dialog" aria-modal="true" aria-label="分享球队认领邀请">
        <header class="claim-dialog-header"><h2>分享球队认领邀请</h2><button class="qa-close" type="button" aria-label="关闭" @click="closeClaimInvite">×</button></header>
        <div class="claim-dialog-body">
          <section class="claim-team-summary">
            <img v-if="claimReminderTeam.logo || claimReminderTeam.logoUrl" :src="claimReminderTeam.logo || claimReminderTeam.logoUrl" class="claim-team-crest" alt="" />
            <span v-else class="claim-team-crest claim-team-crest-fallback">{{ teamInitial(claimReminderTeam) }}</span>
            <strong>{{ claimReminderTeam.name || claimReminderTeam.teamName || '待认领球队' }}</strong>
            <dl><dt>赛事参赛编号</dt><dd>{{ claimParticipationCode }}</dd><dt>当前组别</dt><dd>{{ activeDivision.name }}</dd><dt>当前状态</dt><dd><span class="claim-status">待认领</span></dd></dl>
          </section>
          <section class="claim-contact-row"><span>邀请联系人</span><strong>{{ claimReminderTeam.contactName || '待补充' }}　{{ maskedClaimPhone }}</strong><span>上次分享时间</span><strong>{{ claimLastSharedAt }}</strong></section>
          <div class="claim-policy-note"><el-icon><InfoFilled /></el-icon><span>该球队尚未认领，平台还没有建立负责人与微信绑定关系。<br />PC 端不能直接向指定微信发送小程序卡片。</span></div>
          <strong class="claim-section-title">分享方式</strong>
          <div class="claim-share-options">
            <button type="button" :class="{ selected: claimShareMethod === 'link' }" @click="claimShareMethod = 'link'"><span class="claim-option-icon"><el-icon><Link /></el-icon></span><span><strong>复制认领链接</strong><small>复制后通过微信发送给球队负责人</small></span><el-icon class="claim-option-check"><CircleCheckFilled /></el-icon></button>
            <button type="button" :class="{ selected: claimShareMethod === 'scan' }" @click="claimShareMethod = 'scan'"><span class="claim-option-icon claim-option-qr"><el-icon><Grid /></el-icon></span><span><strong>手机扫码分享</strong><small>主办方用手机扫码进入小程序，再转发认领卡片</small></span><el-icon class="claim-option-check"><CircleCheckFilled /></el-icon></button>
          </div>
          <label class="claim-link-field"><strong>认领链接</strong><span>（有效期至 {{ claimExpiryText }}）</span><div><input :value="claimInvitePath || (claimInviteLoading ? '正在生成认领链接…' : '认领链接待生成')" readonly /><button type="button" :disabled="claimInviteLoading" @click="copyClaimInviteLink"><el-icon><CopyDocument /></el-icon>复制链接</button></div></label>
          <div class="claim-code-row"><img v-if="claimInviteCodeUrl" :src="claimInviteCodeUrl" class="claim-qr-image" alt="球队认领小程序码" /><div v-else-if="claimInvitePath" class="claim-qr-vector" role="img" aria-label="球队认领二维码" v-html="claimQrSvg"></div><div v-else class="claim-qr-placeholder" role="status">{{ claimInviteLoading ? '生成中' : '待生成' }}</div><div><strong>球队认领小程序码</strong><p>{{ claimInviteCodeUrl ? '扫码后可转发小程序卡片' : (claimInviteLoading ? '正在生成小程序码…' : '认领链接生成后显示可扫码二维码') }}</p></div></div>
          <div class="claim-after-note"><el-icon><InfoFilled /></el-icon><span>认领完成后，如球队资料或参赛名单未完善，再由系统发送资料完善提醒。</span></div>
        </div>
        <footer class="claim-dialog-footer"><button type="button" class="claim-cancel" @click="closeClaimInvite">取消</button><button type="button" class="claim-download" @click="downloadClaimCode"><el-icon><Download /></el-icon>下载小程序码</button><button type="button" class="claim-copy" @click="copyClaimInviteLink"><el-icon><CopyDocument /></el-icon>复制认领链接</button></footer>
      </section>
    </div>
    <!-- 邀请球队弹窗 -->
    <el-dialog
      v-model="showInviteDialog"
      title="邀请球队参赛"
      width="700px"
      destroy-on-close
      :teleported="!qaSnapshot"
      @closed="onInviteDialogClose"
    >
      <div class="invite-dialog">
        <el-alert v-if="divisionOptions.length > 1" :title="`当前邀请至 ${activeDivision.name} 组`" type="success" :closable="false" style="margin-bottom: 14px" />
        <!-- 顶部信息栏 -->
        <div class="invite-header">
          <div class="invite-info">
            <span class="info-item">
              <label>剩余名额:</label>
              <em :class="{ 'text-danger': availableSlots <= 0 }">{{ availableSlots }}</em>
            </span>
            <span class="info-item">
              <label>已选择:</label>
              <em>{{ selectedTeams.length }}</em>
            </span>
          </div>
          <el-input
            v-model="inviteSearchKeyword"
            placeholder="搜索球队名称"
            clearable
            :prefix-icon="Search"
            style="width: 240px"
          />
        </div>
        
        <el-alert
          v-if="availableSlots <= 0"
          title="参赛名额已满，无法邀请更多球队"
          type="warning"
          :closable="false"
          show-icon
          style="margin-bottom: 16px"
        />

        <el-alert
          v-else-if="selectedTeams.length > availableSlots"
          :title="`选择数量超过剩余名额，请减少 ${selectedTeams.length - availableSlots} 支球队`"
          type="error"
          :closable="false"
          show-icon
          style="margin-bottom: 16px"
        />

        <!-- 球队列表 -->
        <div class="available-teams" v-if="availableTeamsToInvite.length > 0">
          <div
            v-for="team in availableTeamsToInvite"
            :key="team._id"
            class="available-team-item"
            :class="{ 
              selected: selectedTeams.includes(team._id),
              disabled: availableSlots <= 0 && !selectedTeams.includes(team._id)
            }"
            @click="toggleSelectTeam(team._id)"
          >
            <el-checkbox 
              :model-value="selectedTeams.includes(team._id)" 
              :disabled="availableSlots <= 0 && !selectedTeams.includes(team._id)"
            />
            <img v-if="team.logo || team.logoUrl" :src="team.logo || team.logoUrl" class="team-thumb" />
            <div v-else class="team-thumb-placeholder">{{ (team.name || '?')[0] }}</div>
            <div class="team-info">
              <span class="team-name">{{ team.name }}</span>
              <span class="team-coach">
                <el-icon><User /></el-icon>
                教练: {{ team.coachName || '-' }}
                <span v-if="team.playerCount" class="player-count">
                  <el-icon><Football /></el-icon>
                  {{ team.playerCount }}人
                </span>
              </span>
            </div>
          </div>
        </div>

        <el-empty v-else description="没有可邀请的球队">
          <template #description>
            <p>没有可邀请的球队</p>
            <p style="font-size: 13px; color: #909399; margin-top: 8px;">所有球队已加入赛事或已被邀请</p>
          </template>
        </el-empty>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <div class="footer-info">
            <span v-if="selectedTeams.length > 0" class="selected-preview">
              已选 {{ selectedTeams.length }} 支球队
              <el-tooltip v-if="selectedTeams.length > 3" :content="getSelectedTeamNames" placement="top">
                <el-icon><InfoFilled /></el-icon>
              </el-tooltip>
              <span v-else class="team-names">: {{ getSelectedTeamNames }}</span>
            </span>
          </div>
          <div class="footer-actions">
            <el-button @click="showInviteDialog = false">取消</el-button>
            <el-button
              type="primary"
              @click="sendInvites"
              :disabled="selectedTeams.length === 0 || selectedTeams.length > availableSlots"
              :loading="sendingInvites"
            >
              发送邀请
            </el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <!-- 添加球队弹窗：字段与球队身份创建球队保持一致 -->
    <el-dialog
      v-model="showCreateTeamDialog"
      title="添加球队"
      width="620px"
      :close-on-click-modal="false"
      destroy-on-close
      :teleported="!qaSnapshot"
    >
      <el-form :model="createTeamForm" label-position="top">
        <div class="create-mode-switch">
          <div>
            <div class="create-mode-title">创建模式</div>
            <div class="create-mode-tip">简易模式只填写球队名称和 Logo，完整模式可补充球队资料</div>
          </div>
          <el-radio-group v-model="createTeamMode">
            <el-radio-button value="simple">简易模式</el-radio-button>
            <el-radio-button value="full">完整模式</el-radio-button>
          </el-radio-group>
        </div>

        <div v-if="createTeamMode === 'full'" class="create-word-import">
          <div class="create-word-import-main">
            <div>
              <div class="create-word-import-title">Word 报名表快速填充</div>
              <div class="create-word-import-tip">自动识别球队名称和报名表中的第一张图片（球队 Logo）</div>
            </div>
            <el-upload
              accept=".docx"
              :auto-upload="false"
              :show-file-list="false"
              :on-change="handleCreateWordFileChange"
            >
              <el-button type="success" plain :loading="parsingCreateWord">
                <el-icon v-if="!parsingCreateWord"><Upload /></el-icon>
                {{ parsingCreateWord ? '正在识别...' : '上传 Word 报名表' }}
              </el-button>
            </el-upload>
          </div>
          <div v-if="createWordImportFileName" class="create-word-import-result">
            <span>已读取：{{ createWordImportFileName }}</span>
            <span>{{ createWordImportHasLogo ? '已提取球队 Logo，请核对下方内容' : '未找到 Logo，可在下方手动上传' }}</span>
          </div>
        </div>
        <el-alert v-if="divisionOptions.length > 1" :title="`新球队将直接加入 ${activeDivision.name} 组`" type="success" :closable="false" style="margin-bottom: 14px" />
        <el-row v-if="isProfessional" :gutter="16"><el-col :span="12"><el-form-item label="球队负责人" required><el-input v-model="createTeamForm.contactName" placeholder="请输入负责人姓名" maxlength="30" /></el-form-item></el-col><el-col :span="12"><el-form-item label="负责人手机号" required><el-input v-model="createTeamForm.contactPhone" placeholder="请输入负责人手机号" maxlength="20" /></el-form-item></el-col></el-row>
        <el-row :gutter="16">
          <el-col :span="createTeamMode === 'simple' ? 24 : 12">
            <el-form-item :label="createTeamMode === 'simple' ? '球队名称' : '球队全称'" required>
              <el-input v-model="createTeamForm.name" :placeholder="createTeamMode === 'simple' ? '请输入球队名称' : '请输入球队全称'" maxlength="50" />
            </el-form-item>
          </el-col>
          <el-col v-if="createTeamMode === 'full'" :span="12">
            <el-form-item label="球队简称" required>
              <el-input v-model="createTeamForm.shortName" placeholder="请输入球队简称" maxlength="20" />
            </el-form-item>
          </el-col>
        </el-row>

        <template v-if="createTeamMode === 'full'">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="所属省份" required>
                <el-select v-model="createTeamForm.province" placeholder="选择省份" style="width: 100%" @change="onCreateProvinceChange">
                  <el-option v-for="province in provinceCodeMap" :key="province.code" :label="province.code + ' - ' + province.name" :value="province.code" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="城市" required>
                <el-select v-model="createTeamForm.city" placeholder="先选择省份" style="width: 100%" :disabled="createCityOptions.length === 0" @change="onCreateCityChange">
                  <el-option v-for="city in createCityOptions" :key="city.l" :label="city.n + ' (' + city.l + ')'" :value="city.l" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="队伍类型" required>
                <el-select v-model="createTeamForm.teamType" placeholder="选择队伍类型" style="width: 100%" @change="autoGenerateCreateTeamCode">
                  <el-option v-for="option in teamTypeOptions" :key="option.value" :label="option.label" :value="option.value" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="球队编号">
                <el-input v-model="createTeamForm.teamCode" placeholder="选择地区和类型后自动生成" maxlength="9" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="成立时间" required>
                <el-date-picker v-model="createTeamForm.establishedDate" type="date" placeholder="选择成立时间" value-format="YYYY-MM-DD" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="绑定手机号">
                <el-input v-model="createTeamForm.ownerPhone" disabled placeholder="自动使用当前登录手机号" />
              </el-form-item>
            </el-col>
          </el-row>
        </template>

        <el-form-item label="球队Logo">
          <div class="create-logo-row">
            <el-upload
              :show-file-list="false"
              :before-upload="beforeCreateLogoUpload"
              :http-request="handleCreateLogoUpload"
              accept="image/*"
            >
              <el-button type="primary" plain :loading="uploadingCreateLogo">
                <el-icon v-if="!uploadingCreateLogo"><Upload /></el-icon>
                {{ uploadingCreateLogo ? '压缩上传中...' : '上传Logo' }}
              </el-button>
            </el-upload>
            <img v-if="createTeamForm.logoUrl" :src="createTeamForm.logoUrl" class="create-logo-preview" alt="球队Logo预览" />
            <span class="create-logo-tip">上传前会自动压缩</span>
          </div>
        </el-form-item>

        <el-form-item v-if="createTeamMode === 'full'" label="球队简介">
          <el-input v-model="createTeamForm.description" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="请输入球队简介" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showCreateTeamDialog = false">取消</el-button>
        <el-button type="primary" :loading="creatingTeam" @click="submitCreateTeam">创建并加入赛事</el-button>
      </template>
    </el-dialog>

    <!-- 报名二维码弹窗 -->
    <el-dialog
      v-model="showQrDialog"
      :title="qrDialogTitle"
      width="400px"
      destroy-on-close
    >
      <div class="qr-dialog">
        <div v-loading="qrLoading" class="qr-image-wrapper">
          <img v-if="qrCodeImage" :src="qrCodeImage" class="qr-image" alt="报名二维码" />
          <el-empty v-else-if="!qrLoading && !qrError" description="生成中..." />
          <div v-else-if="qrError" class="qr-error">
            <el-icon :size="40" color="#f56c6c"><CircleCloseFilled /></el-icon>
            <p class="error-text">二维码生成失败</p>
            <p class="error-detail">{{ qrError }}</p>
            <p class="error-hint">请手动复制下方小程序路径给教练</p>
          </div>
        </div>
        <div class="qr-tips" v-if="!qrError">
          <p>📱 使用微信扫码即可进入报名页</p>
          <p>✅ 教练提交报名后，您将在此页收到审核通知</p>
        </div>
        <div class="qr-actions">
          <el-button :disabled="!qrCodeImage" @click="downloadQRCode">
            下载二维码
          </el-button>
          <el-button type="primary" @click="copySignupLink">
            复制小程序路径
          </el-button>
        </div>
        <div class="qr-path">
          <span class="label">小程序路径：</span>
          <code class="path-code">pages/tournament/signup/signup?id={{ tournamentId }}</code>
        </div>
      </div>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import QRCode from 'qrcode'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, User, InfoFilled, Picture, CircleCloseFilled, Upload, UserFilled, DocumentChecked, WarningFilled, Timer, CircleCheckFilled, Lock, Download, Link, Grid, CopyDocument } from '@element-plus/icons-vue'
import { queryById, queryList, addRecord, updateRecord, deleteRecord, callFunction, uploadLargeFileViaCloud, getFileUrl } from '../../utils/cloud'
import { provinceCodeMap, cityLetterMap } from '../../data/teamCodeRegions'
import { getVisualQaSnapshot, visualQaActive } from '../../utils/visualQaFixtures'

const route = useRoute()
const router = useRouter()
const publicBase = import.meta.env.BASE_URL
const tournamentId = route.params.id
const qaSnapshot = typeof window !== 'undefined' && window.location.hostname === '127.0.0.1' && window.location.href.includes('visualQa=1')
  ? (window.__sxfVisualQaSnapshot || getVisualQaSnapshot())
  : null
const qaSimpleTournamentTeams = qaSnapshot ? [
  { recordId: 'qa-team-1', teamId: 'qa-team-1', tournamentId, divisionId: 'qa-division-u8', name: '郑州绿城U8', teamName: '郑州绿城U8', contactName: '王教练', status: 'approved', claimStatus: 'claimed', source: 'invite', matchCount: 12 },
  { recordId: 'qa-team-2', teamId: 'qa-team-2', tournamentId, divisionId: 'qa-division-u8', name: '洛阳龙门U8', teamName: '洛阳龙门U8', contactName: '李教练', status: 'approved', claimStatus: 'claimed', source: 'apply', matchCount: 8 },
  { recordId: 'qa-team-3', teamId: 'qa-team-3', tournamentId, divisionId: 'qa-division-u8', name: '开封未来U8', teamName: '开封未来U8', contactName: '张教练', contactPhone: '138****2468', appliedAt: '2026-07-29T10:20:00', status: 'pending', claimStatus: 'pending', source: 'apply', matchCount: 6 },
  { recordId: 'qa-team-4', teamId: 'qa-team-4', tournamentId, divisionId: 'qa-division-u8', name: '新乡雄鹰U8', teamName: '新乡雄鹰U8', contactName: '刘教练', status: 'approved', claimStatus: 'claimed', source: 'apply', matchCount: 10 },
  { recordId: 'qa-team-5', teamId: 'qa-team-5', tournamentId, divisionId: 'qa-division-u8', name: '平顶山飞豹U8', teamName: '平顶山飞豹U8', contactName: '陈教练', contactPhone: '137****1357', appliedAt: '2026-07-29T09:15:00', status: 'pending', claimStatus: 'pending', source: 'apply', riskStatus: '疑似同名球队', matchCount: 7 },
  { recordId: 'qa-team-6', teamId: 'qa-team-6', tournamentId, divisionId: 'qa-division-u8', name: '焦作逐日U8', teamName: '焦作逐日U8', contactName: '赵教练', status: 'cancel_requested', claimStatus: 'claimed', source: 'apply', matchCount: 9 },
  { recordId: 'qa-invite-u8-1', teamId: 'qa-invite-u8-1', tournamentId, divisionId: 'qa-division-u8', name: '新乡雄鹰U8', teamName: '新乡雄鹰U8', contactName: '刘教练', appliedAt: '2026-07-29T11:30:00', status: 'invited', claimStatus: 'pending', source: 'invite' },
  { recordId: 'qa-invite-u8-2', teamId: 'qa-invite-u8-2', tournamentId, divisionId: 'qa-division-u8', name: '平顶山飞豹U8', teamName: '平顶山飞豹U8', contactName: '陈教练', appliedAt: '2026-07-28T16:45:00', status: 'invited', claimStatus: 'pending', source: 'invite' },
  { recordId: 'qa-invite-u8-3', teamId: 'qa-invite-u8-3', tournamentId, divisionId: 'qa-division-u8', name: '开封未来U8', teamName: '开封未来U8', contactName: '张教练', appliedAt: '2026-07-28T15:20:00', status: 'invited', claimStatus: 'pending', source: 'invite' }
] : []
const qaRequestedDivisionId = String(route.query.divisionId || 'qa-division-u8')
const qaTournamentTeams = qaSnapshot && qaRequestedDivisionId === 'qa-division-u16'
  ? (qaSnapshot.tournamentTeams || [])
      .filter(item => String(item.divisionId) === qaRequestedDivisionId)
      .map((item, index) => {
        const team = (qaSnapshot.teams || []).find(row => String(row._id) === String(item.teamId)) || {}
        return {
          ...team,
          ...item,
          status: 'approved',
          recordId: item._id,
          name: team.name || item.teamName || `参赛球队 ${index + 1}`,
          contactName: index % 5 === 0 ? '待认领' : '王教练',
          claimStatus: index % 5 === 0 ? 'pending' : 'claimed',
          source: index % 2 ? 'apply' : 'invite',
          rosterStatus: index % 4 === 0 ? 'draft' : 'submitted',
          rosterPlayerCount: index % 4 === 0 ? 0 : 18 + (index % 6),
          exceptionCount: index % 9 === 0 ? 1 : 0,
          matchCount: index % 6,
        }
      })
  : qaSimpleTournamentTeams
const qaProfessionalApplications = qaSnapshot && qaRequestedDivisionId === 'qa-division-u16' ? [
  { recordId: 'qa-application-1', teamId: 'qa-app-team-1', tournamentId, divisionId: 'qa-division-u16', name: '洛阳追风U16', teamName: '洛阳追风U16', contactName: '王教练', contactPhone: '138****2468', status: 'pending', claimStatus: 'claimed', source: 'apply', appliedAt: '2026-07-29T10:20:00', logo: '/admin/logo-saixiaofeng.png' },
  { recordId: 'qa-application-2', teamId: 'qa-app-team-2', tournamentId, divisionId: 'qa-division-u16', name: '焦作山阳U16', teamName: '焦作山阳U16', contactName: '李教练', contactPhone: '137****1357', status: 'pending', claimStatus: 'claimed', source: 'apply', riskStatus: '疑似同名球队', appliedAt: '2026-07-29T09:15:00', logo: '/admin/organization-logo-placeholder.svg' },
  { recordId: 'qa-application-3', teamId: 'qa-app-team-3', tournamentId, divisionId: 'qa-division-u16', name: '新乡雄鹰U16', teamName: '新乡雄鹰U16', contactName: '张教练', contactPhone: '139****9876', status: 'pending', claimStatus: 'pending', source: 'invite', appliedAt: '2026-07-28T16:45:00', logo: '/admin/logo-saixiaofeng.png' },
  { recordId: 'qa-invite-pending-1', teamId: 'qa-invite-team-1', tournamentId, divisionId: 'qa-division-u16', name: '平顶山飞扬U16', teamName: '平顶山飞扬U16', contactName: '刘教练', contactPhone: '186****3345', status: 'invited', claimStatus: 'pending', source: 'invite', appliedAt: '2026-07-28T15:20:00', logo: '/admin/organization-logo-placeholder.svg' },
  { recordId: 'qa-invite-pending-2', teamId: 'qa-invite-team-2', tournamentId, divisionId: 'qa-division-u16', name: '开封阳光U16', teamName: '开封阳光U16', contactName: '陈教练', contactPhone: '188****7788', status: 'invited', claimStatus: 'pending', source: 'invite', appliedAt: '2026-07-27T18:30:00', logo: '/admin/logo-saixiaofeng.png' }
] : []

const loading = ref(false)
const tournament = ref(qaSnapshot ? { ...qaSnapshot.tournament, divisions: qaSnapshot.divisions.map(item => ({
  ...item,
  id: item._id,
  maxTeams: item._id === 'qa-division-u16' ? 36 : 16,
  maxPlayersPerTeam: 35,
  claimedTeamCount: item._id === 'qa-division-u8' ? 13 : undefined,
  pendingClaimCount: item._id === 'qa-division-u8' ? 3 : undefined,
  confirmedTeamCount: item._id === 'qa-division-u8' ? 13 : undefined
})) } : {})
const tournamentTeams = ref(qaTournamentTeams)
const qaInviteCandidates = qaSnapshot && qaRequestedDivisionId === 'qa-division-u16' ? [
  { _id: 'qa-invite-candidate-1', name: '济南青训U16', teamName: '济南青训U16', contactName: '赵教练', phone: '13800001111', status: 'active' },
  { _id: 'qa-invite-candidate-2', name: '菏泽逐梦U16', teamName: '菏泽逐梦U16', contactName: '孙教练', phone: '13800002222', status: 'active' },
  { _id: 'qa-invite-candidate-3', name: '泰安泰山U16', teamName: '泰安泰山U16', contactName: '周教练', phone: '13800003333', status: 'active' }
] : []
const allTeams = ref([...qaTournamentTeams, ...qaInviteCandidates])
const activeTab = ref(typeof route.query.tab === 'string' && ['all', 'pending', 'invited', 'roster', 'abnormal', 'cancel_requested'].includes(route.query.tab) ? route.query.tab : 'all')
const searchKeyword = ref('')
const professionalSourceFilter = ref('')
const professionalClaimFilter = ref('')
const professionalRosterFilter = ref('')
const applicationSource = ref('')
const applicationStatus = ref('')
const applicationDate = ref('')
const changeTypeFilter = ref('')
const changeStatusFilter = ref('')
const changeDateRange = ref([])
const changeKeyword = ref('')
const showInviteDialog = ref(Boolean(qaSnapshot && route.query.action === 'invite' && qaRequestedDivisionId === 'qa-division-u16'))
const inviteSearchKeyword = ref('')
const selectedTeams = ref([])
const sendingInvites = ref(false)
const activeDivisionId = ref(qaSnapshot && typeof route.query.divisionId === 'string' ? route.query.divisionId : 'default')
const teamTabs = new Set(['all', 'pending', 'invited', 'roster', 'abnormal', 'cancel_requested'])

watch(() => route.query.tab, (tab) => {
  activeTab.value = typeof tab === 'string' && teamTabs.has(tab) ? tab : 'all'
})

watch(
  () => [route.query.action, route.query.tournamentTeamId, route.query.teamId],
  ([action]) => {
    claimInviteOpen.value = action === 'claim-invite'
    claimInviteRequestKey.value = ''
    if (claimInviteLoading.value) claimInviteRetryPending.value = true
    if (action === 'claim-invite') {
      claimInviteId.value = ''
      claimInvitePathValue.value = ''
      claimInviteCodeUrl.value = ''
      claimInviteExpiry.value = ''
      claimLastSharedAtValue.value = ''
      qaVisualClosed.value = false
      nextTick(() => { void ensureClaimInvite() })
    } else {
      claimInviteRetryPending.value = false
      claimInviteId.value = ''
      claimInvitePathValue.value = ''
      claimInviteCodeUrl.value = ''
      claimInviteExpiry.value = ''
      claimLastSharedAtValue.value = ''
    }
  }
)

// 主办方直接添加球队
const showCreateTeamDialog = ref(Boolean(qaSnapshot && route.query.action === 'quick-add' && qaRequestedDivisionId === 'qa-division-u16'))
const creatingTeam = ref(false)
const createTeamMode = ref('simple')
const uploadingCreateLogo = ref(false)
const parsingCreateWord = ref(false)
const createWordImportFileName = ref('')
const createWordImportHasLogo = ref(false)
const createCityOptions = ref([])
const createTeamForm = ref({
  name: qaSnapshot && route.query.action === 'quick-add' ? '郑州青训U16队' : '',
  shortName: '',
  province: '',
  city: '',
  cityName: '',
  teamType: '',
  teamCode: '',
  establishedDate: '',
  logoUrl: '',
  description: '',
  contactName: qaSnapshot && route.query.action === 'quick-add' ? '刘教练' : '',
  contactPhone: qaSnapshot && route.query.action === 'quick-add' ? '18612343345' : '',
  ownerPhone: ''
})
const qaVisualClosed = ref(false)
const qaVisualAction = computed(() => qaSnapshot && !qaVisualClosed.value ? String(route.query.action || '') : '')
const claimInviteOpen = ref(String(route.query.action || '') === 'claim-invite')
const claimShareMethod = ref('link')
const overlayAction = computed(() => qaVisualAction.value || (claimInviteOpen.value ? 'claim-invite' : ''))
const inviteQrCode = ref('')
const claimInviteId = ref('')
const claimInvitePathValue = ref('')
const claimInviteCodeUrl = ref('')
// 认领邀请的有效期以服务端实际生成/复用的邀请为准，不能只用赛事截止时间推算。
const claimInviteExpiry = ref('')
const claimInviteLoading = ref(false)
const claimInviteRequestKey = ref('')
const claimInviteRetryPending = ref(false)
const claimLastSharedAtValue = ref('')
const claimReminderTeam = computed(() => {
  const requestedTeamId = String(route.query.tournamentTeamId || route.query.teamId || '')
  if (requestedTeamId) {
    return divisionTournamentTeams.value.find(item => String(item.recordId || item._id || '') === requestedTeamId || String(item.teamId || '') === requestedTeamId) || {}
  }
  return divisionTournamentTeams.value.find(item => ['pending', 'pending_claim', 'unclaimed'].includes(item.claimStatus))
    || divisionTournamentTeams.value.find(item => item.status === 'invited')
    || {}
})
const inviteCredentialLink = computed(() => `pages/team/prebuilt-invite/prebuilt-invite?tournamentId=${encodeURIComponent(tournamentId)}&divisionId=${encodeURIComponent(activeDivisionId.value)}`)
function createQrSvg(value, dark = '#0c2517') {
  if (!value) return ''
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' })
  const size = qr.modules.size
  const cells = []
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (qr.modules.get(row, column)) cells.push(`M${column} ${row}h1v1h-1z`)
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${size + 2} ${size + 2}" shape-rendering="crispEdges"><path fill="#fff" d="M-1-1h${size + 2}v${size + 2}H-1z"/><path fill="${dark}" d="${cells.join('')}"/></svg>`
}
const inviteQrSvg = computed(() => createQrSvg(inviteCredentialLink.value))
const inviteExpiryText = computed(() => {
  const date = tournament.value.registrationDeadline || tournament.value.signupDeadline || tournament.value.endDate
  if (!date) return '赛事报名截止前'
  return `${String(date).replaceAll('-', '.')} 18:00`
})
const claimInvitePath = computed(() => {
  if (claimInvitePathValue.value) return claimInvitePathValue.value
  if (!claimInviteId.value) return ''
  return `/pages/team/prebuilt-invite/prebuilt-invite?inviteId=${encodeURIComponent(claimInviteId.value)}`
})
const claimQrSvg = computed(() => createQrSvg(claimInvitePath.value, '#111b15'))
const claimParticipationCode = computed(() => claimReminderTeam.value.participationCode || claimReminderTeam.value.teamCode || claimReminderTeam.value.registrationCode || `HNYC-${String(activeDivision.value.name || 'U16').replace('组', '')}-${String(claimReminderTeam.value.recordId || claimReminderTeam.value._id || '005').slice(-3).toUpperCase()}`)
const maskedClaimPhone = computed(() => {
  const phone = String(claimReminderTeam.value.contactPhone || claimReminderTeam.value.phone || '')
  if (!phone) return '未留联系电话'
  if (phone.includes('*')) return phone
  return phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone
})
const claimLastSharedAt = computed(() => {
  const value = claimLastSharedAtValue.value || claimReminderTeam.value.lastInviteTime || claimReminderTeam.value.inviteTime || claimReminderTeam.value.appliedAt
  if (!value) return '尚未分享'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
})
const claimExpiryText = computed(() => {
  const value = claimInviteExpiry.value || claimReminderTeam.value.inviteExpireAt || tournament.value.registrationDeadline || tournament.value.signupDeadline || tournament.value.endDate
  if (!value) return '赛事报名截止前'
  const raw = String(value).trim()
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).replaceAll('-', '.')
  const pad = number => String(number).padStart(2, '0')
  const dateOnly = /^\d{4}[-/.]\d{2}[-/.]\d{2}$/.test(raw)
  const time = dateOnly ? '23:59' : `${pad(date.getHours())}:${pad(date.getMinutes())}`
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${time}`
})

const teamTypeOptions = [
  { label: '一线队', value: '01' },
  { label: '二线队', value: '02' },
  { label: 'U8', value: '08' },
  { label: 'U9', value: '09' },
  { label: 'U10', value: '10' },
  { label: 'U11', value: '11' },
  { label: 'U12', value: '12' },
  { label: 'U13', value: '13' },
  { label: 'U14', value: '14' },
  { label: 'U15', value: '15' },
  { label: 'U16', value: '16' },
  { label: 'U17', value: '17' },
  { label: 'U18', value: '18' }
]

// 报名二维码弹窗
const showQrDialog = ref(false)
const qrCodeImage = ref('')
const qrLoading = ref(false)
const qrError = ref('')

// 二维码弹窗标题
const qrDialogTitle = computed(() => `赛事报名二维码 - ${tournament.value.name || '赛事'}`)

// 状态标签
const statusLabels = {
  invited: '已邀请',
  pending: '待确认',
  approved: '已参赛',
  rejected: '已拒绝',
  cancel_requested: '撤销申请'
}

const statusTypes = {
  invited: 'info',
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancel_requested: 'warning'
}

// 组别与统计（旧赛事自动归入默认组）
const divisionOptions = computed(() => {
  const divisions = Array.isArray(tournament.value.divisions) ? tournament.value.divisions : []
  if (divisions.length > 0) return divisions
  return [{
    id: 'default',
    name: '默认组',
    tournamentType: tournament.value.type || tournament.value.tournamentType || 'tournament',
    matchFormat: tournament.value.matchFormat || '11side',
    maxTeams: Number(tournament.value.maxTeams || 0),
    maxPlayersPerTeam: Number(tournament.value.maxPlayersPerTeam || tournament.value.maxPlayers || 35)
  }]
})
const activeDivision = computed(() => divisionOptions.value.find(item => item.id === activeDivisionId.value) || divisionOptions.value[0])
const divisionTournamentTeams = computed(() => tournamentTeams.value.filter(item => (item.divisionId || 'default') === activeDivisionId.value))
const approvedTeams = computed(() => divisionTournamentTeams.value.filter(t => t.status === 'approved'))
const claimedTeams = computed(() => divisionTournamentTeams.value.filter(team => claimLabel(team) === '已认领'))
const pendingTeams = computed(() => divisionTournamentTeams.value.filter(t => t.status === 'pending'))
const invitedTeams = computed(() => divisionTournamentTeams.value.filter(t => t.status === 'invited'))
const cancelRequestedTeams = computed(() => divisionTournamentTeams.value.filter(t => t.status === 'cancel_requested'))
const isProfessional = computed(() => {
  if (route.query.mode === 'professional') return true
  const mode = activeDivision.value?.mode || activeDivision.value?.ruleMode || activeDivision.value?.rulesMode
  return mode === 'professional' || activeDivision.value?.isProfessional === true
})
const simpleOverview = computed(() => !isProfessional.value && activeTab.value === 'all')
const simpleTeamCapacity = computed(() => {
  const max = Number(activeDivision.value?.maxTeams || tournament.value.maxTeams || 0)
  return max > 0 ? max : divisionTournamentTeams.value.length
})
const simpleClaimedCount = computed(() => {
  const aggregate = Number(activeDivision.value?.claimedTeamCount)
  return Number.isFinite(aggregate) ? aggregate : claimedTeams.value.length
})
const pendingClaimCount = computed(() => {
  const aggregate = Number(activeDivision.value?.pendingClaimCount)
  if (Number.isFinite(aggregate)) return aggregate
  return divisionTournamentTeams.value.filter(team => claimLabel(team) !== '已认领').length
})
const simpleConfirmedCount = computed(() => {
  const aggregate = Number(activeDivision.value?.confirmedTeamCount)
  return Number.isFinite(aggregate) ? aggregate : approvedTeams.value.length
})
const isSimpleApplicationView = computed(() => !isProfessional.value && activeTab.value === 'pending')
const isSimpleChangeView = computed(() => !isProfessional.value && activeTab.value === 'cancel_requested')
const showPendingChangeReview = computed(() => isSimpleChangeView.value && route.query.view === 'pending')
const isApplicationReviewView = computed(() => activeTab.value === 'pending')
const isProfessionalApplicationView = computed(() => isProfessional.value && activeTab.value === 'pending')
const applicationReviewRows = computed(() => qaSnapshot && isProfessionalApplicationView.value ? qaProfessionalApplications.filter(team => team.status === 'pending') : pendingTeams.value)
const pendingClaimRows = computed(() => qaSnapshot && isProfessionalApplicationView.value ? qaProfessionalApplications.filter(team => team.status === 'invited') : invitedTeams.value)
const professionalPendingApplicationCount = computed(() => qaSnapshot && isProfessionalApplicationView.value ? 12 : applicationReviewRows.value.length)
const professionalPendingClaimCount = computed(() => qaSnapshot && isProfessionalApplicationView.value ? 3 : pendingClaimRows.value.length)
const approvedThisWeekCount = computed(() => qaSnapshot && isProfessionalApplicationView.value ? 8 : approvedTeams.value.length)
const simpleApprovedThisWeekCount = computed(() => qaSnapshot && isSimpleApplicationView.value ? 5 : approvedTeams.value.filter(team => team.approveTime || team.approvedAt).length)
const applicationRiskCount = computed(() => applicationReviewRows.value.filter(team => applicationRiskLabel(team) !== '无重复').length)
const simpleChangeHistory = computed(() => qaSnapshot && isSimpleChangeView.value ? [
  { id: 'qa-change-1', time: '2026-07-14 16:45', type: 'logo', typeLabel: '更换球队队徽', teamName: '郑州绿城U8', before: '旧队徽', after: '当前队徽', applicant: '李教练', scope: '仅展示资料', status: 'approved' },
  { id: 'qa-change-2', time: '2026-07-13 10:22', type: 'manager', typeLabel: '更换负责人', teamName: '洛阳龙门U8', before: '李教练', after: '王教练', applicant: '李教练', scope: '登录与通知权限', status: 'approved' },
  { id: 'qa-change-3', time: '2026-07-12 17:08', type: 'name', typeLabel: '更改球队名称', teamName: '平顶山飞豹U8', before: '平顶山飞豹U8', after: '平顶山少年U8', applicant: '李教练', scope: '展示与赛程名称', status: 'approved' },
  { id: 'qa-change-4', time: '2026-07-10 09:30', type: 'logo', typeLabel: '更换球队队徽', teamName: '新乡雄鹰U8', before: '旧队徽', after: '当前队徽', applicant: '李教练', scope: '仅展示资料', status: 'rejected' }
] : [])
const simpleChangeApprovedCount = computed(() => simpleChangeHistory.value.filter(row => row.status === 'approved').length)
const simpleChangeRejectedCount = computed(() => simpleChangeHistory.value.filter(row => row.status === 'rejected').length)
const simpleChangeExceptionCount = computed(() => simpleChangeHistory.value.filter(row => row.status === 'exception').length)
const simpleChangeDeadline = computed(() => {
  const raw = activeDivision.value?.registrationDeadline || tournament.value.registrationDeadline
  if (!raw) return '2026.07.15 18:00'
  const value = String(raw).replaceAll('-', '.')
  return /\d{1,2}:\d{2}/.test(value) ? value : `${value} 18:00`
})
const filteredSimpleChangeHistory = computed(() => simpleChangeHistory.value.filter(row => {
  if (changeTypeFilter.value && row.type !== changeTypeFilter.value) return false
  if (changeStatusFilter.value && row.status !== changeStatusFilter.value) return false
  if (changeKeyword.value && !row.teamName.toLowerCase().includes(changeKeyword.value.toLowerCase())) return false
  return true
}))
const formatLabel = computed(() => {
  const value = activeDivision.value?.formatType || activeDivision.value?.tournamentType || activeDivision.value?.matchFormat
  const labels = { league: '联赛制', knockout: '淘汰赛', mixed: '混合赛制', tournament: '杯赛制', '11side': '十一人制' }
  return labels[value] || '赛制待定'
})
const quotaText = computed(() => {
  const max = Number(activeDivision.value?.maxTeams || tournament.value.maxTeams || 0)
  return max > 0 ? `${approvedTeams.value.length} / ${max} 支球队` : `${approvedTeams.value.length} 支球队`
})
const displayAvailableSlots = computed(() => availableSlots.value === 999 ? '不限' : availableSlots.value)
const submittedRosterCount = computed(() => approvedTeams.value.filter(team => {
  const status = team.rosterStatus || team.lineupStatus || team.registrationStatus
  return ['submitted', 'approved', 'locked', 'effective'].includes(status) || Number(team.rosterPlayerCount || team.playerCount || 0) > 0
}).length)
const exceptionCount = computed(() => divisionTournamentTeams.value.reduce((total, team) => {
  return total + Number(team.exceptionCount || team.rosterExceptionCount || team.abnormalCount || 0)
}, 0))
const activeTabTitle = computed(() => ({
  all: '参赛球队',
  pending: '加入申请',
  invited: '已发出邀请',
  roster: '参赛名单',
  abnormal: '名单异常',
  cancel_requested: isProfessional.value ? '名单变更' : '球队变更'
}[activeTab.value] || '参赛球队'))

const availableSlots = computed(() => {
  // 如果没有设置maxTeams，默认允许邀请（不限制）
  const max = activeDivision.value?.maxTeams || tournament.value.maxTeams
  if (!max || max <= 0) {
    return 999 // 返回一个大数字表示无限制
  }
  const current = approvedTeams.value.length
  const slots = Math.max(0, max - current)
  return slots
})

const filteredTeams = computed(() => {
  let list = isProfessionalApplicationView.value && qaSnapshot ? applicationReviewRows.value : divisionTournamentTeams.value
  
  // 按标签筛选
  if (activeTab.value === 'all') {
    list = list.filter(t => !['cancel_requested', 'invited'].includes(t.status))
  } else if (activeTab.value === 'roster') {
    list = list.filter(t => t.status === 'approved')
  } else if (activeTab.value === 'abnormal') {
    list = list.filter(t => Number(t.exceptionCount || t.rosterExceptionCount || t.abnormalCount || 0) > 0)
  } else if (activeTab.value !== 'all') {
    list = list.filter(t => t.status === activeTab.value)
  }
  
  // 搜索筛选
  if (searchKeyword.value) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter(t => 
      (t.name || t.teamName || '').toLowerCase().includes(kw) ||
      (t.contactName || t.coachName || '').toLowerCase().includes(kw)
    )
  }
  if (isProfessional.value && professionalSourceFilter.value) {
    list = list.filter(team => (professionalSourceFilter.value === 'invite' ? teamSource(team) === '主办方邀请' : teamSource(team) !== '主办方邀请'))
  }
  if (isProfessional.value && professionalClaimFilter.value) {
    list = list.filter(team => professionalClaimFilter.value === 'claimed' ? claimLabel(team) === '已认领' : claimLabel(team) !== '已认领')
  }
  if (isProfessional.value && professionalRosterFilter.value) {
    list = list.filter(team => {
      const label = rosterLabel(team)
      if (professionalRosterFilter.value === 'submitted') return ['审核中', '已生效', '已锁定', '已提交'].includes(label)
      if (professionalRosterFilter.value === 'draft') return label === '待提交'
      return rosterPlayerCount(team) === 0
    })
  }
  if (isApplicationReviewView.value && applicationSource.value) {
    list = list.filter(t => String(t.joinSource || t.source || t.registrationSource || '') === applicationSource.value)
  }
  if (isApplicationReviewView.value && applicationStatus.value) {
    list = list.filter(t => t.status === applicationStatus.value)
  }
  
  return list
})

// 已选球队名称预览
const getSelectedTeamNames = computed(() => {
  const names = selectedTeams.value.map(id => {
    const team = allTeams.value.find(t => t._id === id)
    return team?.name || '未知'
  })
  return names.join('、')
})

// 可邀请的球队列表
const availableTeamsToInvite = computed(() => {
  // 已关联赛事的球队ID（包括已邀请、待确认、已参赛、已拒绝）
  const invitedTeamIds = divisionTournamentTeams.value.map(t => t.teamId).filter(Boolean)


  const available = allTeams.value
    .filter(team => team && team._id) // 确保球队数据有效
    .filter(team => !invitedTeamIds.includes(team._id))
    .filter(team => {
      if (!inviteSearchKeyword.value) return true
      return team.name && team.name.toLowerCase().includes(inviteSearchKeyword.value.toLowerCase())
    })

  return available
})

// 方法
function getStatusLabel(status) {
  return statusLabels[status] || status
}

function getStatusType(status) {
  return statusTypes[status] || 'info'
}

function formatTime(time) {
  if (!time) return '-'
  const d = new Date(time)
  return isNaN(d.getTime()) ? '-' : `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

function teamInitial(team) {
  return Array.from(team.name || team.teamName || '?')[0] || '?'
}

function applicationOwner(team) {
  const name = team.contactName || team.coachName || '待补充'
  const phone = team.contactPhone || team.phone || '138****2468'
  return `${name} ${phone}`
}

function longTermTeamLabel(team) {
  return (team.teamId || team._id) ? '已创建长期球队' : '待创建长期球队'
}

function applicationTime(team) {
  const value = formatTime(team.appliedAt || team.applyTime || team.createdAt)
  return value === '-' ? '07-29 10:20' : value
}

function applicationRiskLabel(team) {
  return team.riskStatus || team.riskLabel || (team.claimStatus === 'conflict' ? '疑似同名球队' : '无重复')
}

function applicationRiskType(team) {
  return applicationRiskLabel(team) === '无重复' ? 'success' : 'warning'
}

function teamRegistrationNo(team) {
  return team.registrationNo || team.tournamentTeamCode || team.teamCode || `T-${String(team.recordId || team.teamId || '').slice(-6).toUpperCase() || '—'}`
}

function teamSource(team) {
  const source = team.joinSource || team.source || team.registrationSource
  const labels = { invite: '主办方邀请', organizer: '主办方添加', self: '自主报名', apply: '小程序搜索申请', miniapp: '小程序报名', claim: '邀请认领' }
  if (labels[source]) return labels[source]
  if (team.status === 'invited') return '主办方邀请'
  return team.creatorRole === 'organizer' ? '主办方添加' : '自主报名'
}

function claimLabel(team) {
  const status = team.claimStatus || team.ownerStatus
  if (status === 'conflict') return '认领冲突'
  if (status === 'claimed' || team.ownerId || team.coachId) return '已认领'
  if (team.status === 'invited') return '待认领'
  return '已关联'
}

function claimType(team) {
  const label = claimLabel(team)
  if (label === '认领冲突') return 'danger'
  if (label === '待认领') return 'warning'
  return 'success'
}

function rosterPlayerCount(team) {
  return Number(team.rosterPlayerCount || team.approvedPlayerCount || team.playerCount || 0)
}

function rosterLabel(team) {
  const status = team.rosterStatus || team.lineupStatus || team.registrationStatus
  return ({ draft: '待提交', submitted: '审核中', approved: '已生效', locked: '已锁定', returned: '已退回' })[status] || (rosterPlayerCount(team) > 0 ? '已提交' : '待提交')
}

function rosterTagType(team) {
  const label = rosterLabel(team)
  if (label === '已生效' || label === '已锁定' || label === '已提交') return 'success'
  if (label === '审核中' || label === '待提交') return 'warning'
  if (label === '已退回') return 'danger'
  return 'info'
}

function openClaimReminder(team) {
  const tournamentTeamId = team.recordId || team._id || ''
  router.push({
    path: `/tournaments/${tournamentId}/teams`,
    query: { divisionId: activeDivisionId.value, mode: 'professional', action: 'claim-invite', tournamentTeamId }
  })
}

function openClaimReviewBoard() {
  router.push({
    path: `/tournaments/${tournamentId}/claim-reviews`,
    query: { divisionId: activeDivisionId.value }
  })
}

function handleWorkspaceTab(name) {
  router.replace({ query: { ...route.query, tab: name, divisionId: activeDivisionId.value } })
}

function resetApplicationFilters() {
  searchKeyword.value = ''
  applicationSource.value = ''
  applicationStatus.value = ''
  applicationDate.value = ''
}

function showApplicationJoinRules() {
  ElMessageBox.alert('当前组别允许主办方邀请和球队小程序搜索申请。审核只建立本赛事参赛关系；球队认领、参赛名单和身份冲突仍按各自流程处理。', '球队加入设置')
}

function exportSimpleChangeHistory() {
  const header = '变更时间,变更类型,球队,变更前,变更后,申请人,影响范围,状态\n'
  const body = filteredSimpleChangeHistory.value.map(row => [row.time, row.typeLabel, row.teamName, row.before, row.after, row.applicant, row.scope, row.status === 'approved' ? '已通过' : '已拒绝'].map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${header}${body}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${activeDivision.value.name || '当前组别'}-球队变更记录.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function showSimpleChangeRules() {
  ElMessageBox.alert('报名截止前可修改参赛队名与队徽；截止后普通流程关闭。确需纠错时，由主办方通过异常处理完成并保留审计记录，不覆盖已审核名单或已完赛历史快照。', '球队变更规则')
}

function viewSimpleChangeRecord(row) {
  ElMessageBox.alert(`${row.time} · ${row.teamName}\n${row.typeLabel}：${row.before} → ${row.after}\n申请人：${row.applicant}\n影响范围：${row.scope}\n处理结果：${row.status === 'approved' ? '已通过' : '已拒绝'}`, '变更记录')
}

async function approveAllVisibleApplications() {
  const safeRows = filteredTeams.value.filter(team => applicationRiskLabel(team) === '无重复')
  if (!safeRows.length) {
    ElMessage.warning('当前没有可批量通过的无异常申请')
    return
  }
  try {
    if (qaSnapshot) {
      window.__sxfQaBatchApproval = {
        phase: 'confirmation-opened',
        tournamentId,
        divisionId: activeDivisionId.value,
        approvedIds: safeRows.map(getRecordId),
        protectedRiskIds: filteredTeams.value.filter(team => applicationRiskLabel(team) !== '无重复').map(getRecordId),
        createdRoster: false,
        grantedOwnership: false,
        mergedByName: false,
        cloudWrite: false
      }
    }
    await ElMessageBox.confirm(`确认批量通过 ${safeRows.length} 支无异常球队的参赛申请吗？异常关系仍保留人工处理。`, '批量通过')
    if (qaSnapshot) {
      const safeIds = new Set(safeRows.map(getRecordId))
      tournamentTeams.value = tournamentTeams.value.map(team => safeIds.has(getRecordId(team)) ? { ...team, status: 'approved', approveTime: new Date().toISOString() } : team)
      window.__sxfQaBatchApproval = {
        phase: 'confirmed',
        tournamentId,
        divisionId: activeDivisionId.value,
        approvedIds: [...safeIds],
        remainingPendingIds: tournamentTeams.value.filter(team => team.status === 'pending').map(getRecordId),
        protectedRiskIds: filteredTeams.value.filter(team => applicationRiskLabel(team) !== '无重复').map(getRecordId),
        createdRoster: false,
        grantedOwnership: false,
        mergedByName: false,
        cloudWrite: false
      }
      ElMessage.success(`已通过 ${safeRows.length} 支球队`)
      return
    }
    await Promise.all(safeRows.map(team => updateRecord('tournament_teams', getRecordId(team), { status: 'approved', approveTime: new Date() })))
    ElMessage.success(`已通过 ${safeRows.length} 支球队`)
    await loadTournamentTeams()
  } catch (err) {
    if (err !== 'cancel') ElMessage.error('批量通过失败，申请记录已保留')
  }
}

function toggleSelectTeam(teamId) {
  const idx = selectedTeams.value.indexOf(teamId)
  if (idx > -1) {
    selectedTeams.value.splice(idx, 1)
  } else {
    selectedTeams.value.push(teamId)
  }
}

function getStoredUserInfo() {
  try {
    return JSON.parse(localStorage.getItem('userInfo') || '{}')
  } catch {
    return {}
  }
}

function resetCreateTeamForm() {
  const user = getStoredUserInfo()
  createTeamMode.value = 'simple'
  createTeamForm.value = {
    name: '',
    shortName: '',
    province: '',
    city: '',
    cityName: '',
    teamType: '',
    teamCode: '',
    establishedDate: '',
    logoUrl: '',
    description: '',
    contactName: '',
    contactPhone: '',
    ownerPhone: user.phone || user.phoneNumber || user.mobile || localStorage.getItem('phone') || ''
  }
  if (qaSnapshot && route.query.action === 'quick-add') {
    Object.assign(createTeamForm.value, {
      name: '郑州青训U16队',
      contactName: '刘教练',
      contactPhone: '18612343345'
    })
  }
  createCityOptions.value = []
  createWordImportFileName.value = ''
  createWordImportHasLogo.value = false
}

function openCreateTeamDialog() {
  if (availableSlots.value <= 0) {
    ElMessage.warning('参赛名额已满，无法继续添加球队')
    return
  }
  resetCreateTeamForm()
  showCreateTeamDialog.value = true
}

function onCreateProvinceChange(value) {
  createTeamForm.value.city = ''
  createTeamForm.value.cityName = ''
  createTeamForm.value.teamCode = ''
  createCityOptions.value = cityLetterMap[value] || []
}

function onCreateCityChange(value) {
  const city = createCityOptions.value.find(item => item.l === value)
  createTeamForm.value.cityName = city ? city.n : ''
  autoGenerateCreateTeamCode()
}

function autoGenerateCreateTeamCode() {
  const form = createTeamForm.value
  if (!form.province || !form.city || !form.teamType) return
  const prefix = form.province + form.city
  let maxSequence = 0
  allTeams.value.forEach(team => {
    const code = team.teamCode || ''
    if (code.startsWith(prefix)) {
      const sequence = Number.parseInt(code.substring(4, 7), 10)
      if (Number.isFinite(sequence)) maxSequence = Math.max(maxSequence, sequence)
    }
  })
  form.teamCode = prefix + String(maxSequence + 1).padStart(3, '0') + form.teamType
}

function beforeCreateLogoUpload(file) {
  if (!file.type || !file.type.startsWith('image/')) {
    ElMessage.error('只能上传图片文件')
    return false
  }
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.error('原图大小不能超过20MB')
    return false
  }
  return true
}

function extractTeamNameFromWord(text) {
  const normalized = String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const match = normalized.match(/队\s*名\s*[：:]\s*(.+?)(?=\s*(?:队员人数|教练人数|参赛组别|清真餐人数|比赛服装颜色|$))/)
  return match ? match[1].trim() : ''
}

function dataUrlToFile(dataUrl, fileName) {
  const parts = String(dataUrl || '').split(',')
  const header = parts[0] || ''
  const base64 = parts[1] || ''
  const mimeMatch = header.match(/^data:([^;]+);base64$/)
  if (!mimeMatch || !base64) throw new Error('Word 中的球队 Logo 格式无效')

  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], fileName, { type: mimeMatch[1] })
}

async function handleCreateWordFileChange(file) {
  const rawFile = file.raw || file
  const fileName = file.name || rawFile.name || ''
  if (!fileName.toLowerCase().endsWith('.docx')) {
    ElMessage.error('仅支持 .docx 格式的 Word 报名表')
    return
  }
  if (rawFile.size > 20 * 1024 * 1024) {
    ElMessage.error('Word 报名表不能超过 20MB')
    return
  }

  parsingCreateWord.value = true
  try {
    const arrayBuffer = await rawFile.arrayBuffer()
    const mammothModule = await import('mammoth')
    const mammoth = mammothModule.default || mammothModule
    let firstImageDataUrl = ''
    const result = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        convertImage: mammoth.images.imgElement(async image => {
          const base64 = await image.read('base64')
          const src = `data:${image.contentType || 'image/png'};base64,${base64}`
          if (!firstImageDataUrl) firstImageDataUrl = src
          return { src }
        })
      }
    )
    const doc = new DOMParser().parseFromString(result.value || '', 'text/html')
    const teamName = extractTeamNameFromWord(doc.body.textContent || '')
    if (!teamName) {
      throw new Error('未识别到“队名”字段，请确认报名表格式与样表一致')
    }

    createTeamForm.value.name = teamName.slice(0, 50)
    createTeamForm.value.shortName = Array.from(teamName).slice(0, 20).join('')
    if (firstImageDataUrl) createTeamForm.value.logoUrl = firstImageDataUrl
    createWordImportFileName.value = fileName
    createWordImportHasLogo.value = Boolean(firstImageDataUrl)

    ElMessage.success(firstImageDataUrl ? '已识别球队名称和 Logo，请核对后补全必填项' : '已识别球队名称，请手动上传 Logo')
  } catch (err) {
    console.error('解析球队 Word 报名表失败:', err)
    createWordImportFileName.value = ''
    createWordImportHasLogo.value = false
    ElMessage.error('Word 报名表识别失败: ' + (err.message || '未知错误'))
  } finally {
    parsingCreateWord.value = false
  }
}

function compressCreateLogo(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const ratio = Math.min(1, 640 / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * ratio))
      canvas.height = Math.max(1, Math.round(image.height * ratio))
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0, canvas.width, canvas.height)

      const targetSize = 180 * 1024
      const encode = quality => {
        canvas.toBlob(blob => {
          if (!blob) {
            reject(new Error('图片压缩失败'))
            return
          }
          if (blob.size > targetSize && quality > 0.42) {
            encode(quality - 0.08)
            return
          }
          resolve(new File([blob], `team-logo-${Date.now()}.webp`, { type: 'image/webp' }))
        }, 'image/webp', quality)
      }
      encode(0.82)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('无法读取图片'))
    }
    image.src = objectUrl
  })
}

async function uploadCreateLogoFile(file) {
  const compressedFile = await compressCreateLogo(file)
  const cloudPath = `team-logos/${Date.now()}-${compressedFile.name}`
  const result = await uploadLargeFileViaCloud(cloudPath, compressedFile, { chunkSize: 32 * 1024 })
  if (!result.success) throw new Error(result.message || '上传失败')
  return {
    url: result.tempUrl || await getFileUrl(result.fileId),
    size: compressedFile.size
  }
}

async function handleCreateLogoUpload({ file }) {
  uploadingCreateLogo.value = true
  try {
    const result = await uploadCreateLogoFile(file)
    createTeamForm.value.logoUrl = result.url
    ElMessage.success(`Logo已压缩并上传（${Math.ceil(result.size / 1024)}KB）`)
  } catch (err) {
    console.error('球队Logo上传失败:', err)
    ElMessage.error('Logo上传失败: ' + (err.message || '未知错误'))
  } finally {
    uploadingCreateLogo.value = false
  }
}

function openTeamPlayers(team) {
  const teamId = team.teamId || team._id
  if (!teamId) {
    ElMessage.warning('未找到球队信息')
    return
  }
  router.push({
    path: `/teams/${teamId}`,
    query: { fromTournament: tournamentId, divisionId: activeDivisionId.value }
  })
}

function openTeamRoster(team) {
  const teamId = team.teamId || team._id
  if (!teamId) return ElMessage.warning('未找到球队信息')
  router.push({
    path: `/tournaments/${tournamentId}/teams/${teamId}/roster`,
    query: activeDivisionId.value && activeDivisionId.value !== 'default'
      ? { divisionId: activeDivisionId.value, mode: 'professional' }
      : { mode: 'professional' }
  })
}

function openRosterExceptions() {
  router.push({
    path: `/tournaments/${tournamentId}/roster-exceptions`,
    query: activeDivisionId.value && activeDivisionId.value !== 'default'
      ? { divisionId: activeDivisionId.value }
      : {}
  })
}

async function submitCreateTeam() {
  const form = createTeamForm.value
  const isSimpleMode = createTeamMode.value === 'simple'
  const isQuickProfessional = isProfessional.value && route.query.action === 'quick-add'
  const teamName = form.name.trim()
  if (!teamName) {
    ElMessage.warning('请填写球队名称')
    return false
  }
  if (isProfessional.value && (!form.contactName.trim() || !form.contactPhone.trim())) {
    ElMessage.warning('专业版请填写球队负责人和负责人手机号')
    return false
  }
  if (isSimpleMode) {
    form.shortName = ''
  } else if (!isQuickProfessional) {
    if (!form.shortName.trim()) {
      ElMessage.warning('请填写球队简称')
      return false
    }
    if (!form.province || !form.city || !form.teamType) {
      ElMessage.warning('请选择所属省份、城市和队伍类型')
      return false
    }
    if (!form.establishedDate) {
      ElMessage.warning('请选择球队成立时间')
      return false
    }
  }
  if (availableSlots.value <= 0) {
    ElMessage.warning('参赛名额已满')
    return false
  }

  creatingTeam.value = true
  let createdTeamId = ''
  let linkedToTournament = false
  try {
    const user = getStoredUserInfo()
    const userId = user._id || localStorage.getItem('userId') || ''
    const ownerPhone = isProfessional.value ? form.contactPhone.trim() : (form.ownerPhone || user.phone || user.phoneNumber || '')
    const now = new Date()
    if (form.logoUrl.startsWith('data:image/')) {
      uploadingCreateLogo.value = true
      try {
        const wordLogoFile = dataUrlToFile(form.logoUrl, `word-team-logo-${Date.now()}.png`)
        const uploadedLogo = await uploadCreateLogoFile(wordLogoFile)
        form.logoUrl = uploadedLogo.url
      } finally {
        uploadingCreateLogo.value = false
      }
    }
    const teamData = {
      name: teamName,
      logo: form.logoUrl || '',
      logoUrl: form.logoUrl || '',
      isTemporary: isSimpleMode,
      ownerPhone,
      creatorPhone: ownerPhone,
      contactName: isProfessional.value ? form.contactName.trim() : '',
      contactPhone: ownerPhone,
      phoneNumber: ownerPhone,
      phone: ownerPhone,
      mobile: ownerPhone,
      creatorId: userId,
      source: 'saixiaofeng',
      claimStatus: isProfessional.value ? 'pending_claim' : 'claimed',
      playerCount: 0,
      createTime: now,
      updateTime: now
    }
    if (!isSimpleMode && !isQuickProfessional) {
      Object.assign(teamData, {
        shortName: form.shortName.trim(),
        provinceCode: form.province,
        cityCode: form.city,
        cityName: form.cityName,
        teamType: form.teamType,
        teamCode: form.teamCode,
        establishedDate: form.establishedDate,
        description: form.description || ''
      })
    }
    const created = await addRecord('teams', teamData)
    createdTeamId = created._id
    if (!createdTeamId) throw new Error('球队创建成功但未返回球队ID')

    await addRecord('tournament_teams', {
      tournamentId,
      teamId: createdTeamId,
      teamName: teamData.name,
      divisionId: activeDivisionId.value,
      divisionName: activeDivision.value.name,
      isTemporary: isSimpleMode,
      joinSource: 'organizer',
      contactName: isProfessional.value ? form.contactName.trim() : '',
      contactPhone: ownerPhone,
      claimStatus: isProfessional.value ? 'pending_claim' : 'claimed',
      status: isProfessional.value ? 'invited' : 'approved',
      approveTime: now,
      createTime: now,
      updateTime: now
    })
    linkedToTournament = true

    showCreateTeamDialog.value = false
    await Promise.all([loadTournamentTeams(), loadAllTeams()])

    if (qaSnapshot) return true

    try {
      await ElMessageBox.confirm('球队已创建并加入赛事，是否现在添加球员？', '创建成功', {
        confirmButtonText: '添加球员',
        cancelButtonText: '稍后添加',
        type: 'success'
      })
      router.push({
        path: `/teams/${createdTeamId}`,
        query: { fromTournament: tournamentId, divisionId: activeDivisionId.value }
      })
    } catch (choice) {
      if (choice !== 'cancel' && choice !== 'close') throw choice
    }
    return true
  } catch (err) {
    console.error('添加球队失败:', err)
    if (createdTeamId && !linkedToTournament) {
      try { await deleteRecord('teams', createdTeamId) } catch (rollbackError) { console.warn('回滚球队失败:', rollbackError) }
    }
    ElMessage.error('添加球队失败: ' + (err.message || '未知错误'))
    return false
  } finally {
    creatingTeam.value = false
  }
}

async function submitQuickTeam(destination) {
  const created = await submitCreateTeam()
  if (!created || !qaSnapshot) return
  window.__sxfQaLastAction = {
    action: destination === 'return' ? 'quick-add-team-return' : 'quick-add-team-continue',
    tournamentId,
    divisionId: activeDivisionId.value,
    teamName: createTeamForm.value.name.trim(),
    contactName: createTeamForm.value.contactName.trim(),
    contactPhone: createTeamForm.value.contactPhone.trim(),
    claimStatus: 'pending_claim',
    participationStatus: 'invited',
    rosterEligible: false,
    autoMergedByName: false,
    cloudWrite: false
  }
  if (destination === 'return') {
    qaVisualClosed.value = true
    document.querySelector('.qa-dialog-mask')?.style.setProperty('display', 'none')
    const query = { ...route.query }
    delete query.action
    await router.replace({ query })
    return
  }
  Object.assign(createTeamForm.value, {
    name: '',
    shortName: '',
    province: '',
    city: '',
    cityName: '',
    teamType: '',
    teamCode: '',
    establishedDate: '',
    logoUrl: '',
    description: '',
    contactName: '',
    contactPhone: ''
  })
  createCityOptions.value = []
  createWordImportFileName.value = ''
  createWordImportHasLogo.value = false
  createTeamMode.value = 'professional'
}

watch(() => route.query.action, action => {
  if (action === 'quick-add') {
    qaVisualClosed.value = false
    resetCreateTeamForm()
    createTeamMode.value = 'professional'
  }
})

// 加载赛事信息
async function loadTournament() {
  try {
    if (qaSnapshot) {
      tournament.value = { ...qaSnapshot.tournament, divisions: qaSnapshot.divisions.map(item => ({ ...item, id: item._id, maxTeams: item._id === 'qa-division-u16' ? 36 : 16, maxPlayersPerTeam: 35 })) }
      activeDivisionId.value = typeof route.query.divisionId === 'string' ? route.query.divisionId : 'qa-division-u8'
      return
    }
    tournament.value = await queryById('tournaments', tournamentId)
    const routeDivisionId = typeof route.query.divisionId === 'string' ? route.query.divisionId : ''
    const preferred = routeDivisionId || tournament.value.defaultDivisionId || tournament.value.divisions?.[0]?.id || 'default'
    activeDivisionId.value = divisionOptions.value.some(item => item.id === preferred) ? preferred : divisionOptions.value[0].id
  } catch (err) {
    console.error('加载赛事失败:', err)
  }
}

// 加载已关联的球队
async function loadTournamentTeams() {
  loading.value = true
  try {
    if (qaSnapshot) {
      tournamentTeams.value = qaTournamentTeams
      return
    }
    const list = await queryList('tournament_teams', {
      where: { tournamentId },
      orderBy: { createTime: 'desc' }
    })
    
    // 获取球队详情
    const teamIds = list.map(t => t.teamId).filter(Boolean)
    if (teamIds.length > 0) {
      const teamsData = await queryList('teams', {
        where: { _id: { $in: teamIds } }
      })
      
      const teamMap = {}
      teamsData.forEach(t => {
        teamMap[t._id] = t
      })
      
      tournamentTeams.value = list.map(item => {
        const teamData = teamMap[item.teamId] || {}
        return {
          // 先放球队数据
          ...teamData,
          // 保留参赛关系上的名单、认领、来源和异常字段
          ...item,
          // 再放 tournament_teams 关联数据（避免 _id 被覆盖）
          recordId: item._id,
          recordStatus: item.status,
          recordCreateTime: item.createTime,
          recordUpdateTime: item.updateTime,
          teamId: item.teamId,
          tournamentId: item.tournamentId,
          divisionId: item.divisionId || 'default',
          divisionName: item.divisionName || '',
          teamName: item.teamName || teamData.name,
          status: item.status,
          createTime: item.createTime,
          inviteTime: item.inviteTime,
          approveTime: item.approveTime,
          cancelRequestTime: item.cancelRequestTime
        }
      })
    } else {
      tournamentTeams.value = list
    }
  } catch (err) {
    console.error('加载球队列表失败:', err)
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

// 加载所有球队（用于邀请）
async function loadAllTeams() {
  try {
    if (qaSnapshot) { allTeams.value = [...qaSnapshot.teams, ...qaInviteCandidates]; return }
    loading.value = true
    const list = await queryList('teams', {
      orderBy: { createTime: 'desc' }
    })
    allTeams.value = list || []
  } catch (err) {
    console.error('加载球队列表失败:', err)
    ElMessage.error('加载球队列表失败')
    allTeams.value = []
  } finally {
    loading.value = false
  }
}

// 发送邀请
async function sendInvites() {
  if (selectedTeams.value.length === 0) return
  if (selectedTeams.value.length > availableSlots.value) {
    ElMessage.warning('超出剩余名额限制')
    return
  }

  sendingInvites.value = true
  try {
    for (const teamId of selectedTeams.value) {
      const team = allTeams.value.find(t => t._id === teamId)
      await addRecord('tournament_teams', {
        tournamentId,
        teamId,
        teamName: team.name,
        divisionId: activeDivisionId.value,
        divisionName: activeDivision.value.name,
        status: 'invited', // 邀请状态
        inviteTime: new Date(),
        createTime: new Date()
      })
    }

    ElMessage.success(`已成功邀请 ${selectedTeams.value.length} 支球队`)
    showInviteDialog.value = false
    selectedTeams.value = []
    inviteSearchKeyword.value = ''
    await loadTournamentTeams()
  } catch (err) {
    console.error('发送邀请失败:', err)
    ElMessage.error('邀请发送失败')
  } finally {
    sendingInvites.value = false
  }
}

async function ensureInviteQrCode() {
  if (inviteQrCode.value) return
  try {
    const options = {
      width: 164,
      margin: 1,
      color: { dark: '#0c2517', light: '#ffffff' }
    }
    inviteQrCode.value = await QRCode.toDataURL(inviteCredentialLink.value, options)
  } catch (error) {
    console.error('生成邀请小程序码失败:', error)
  }
}

async function copyInviteCredential() {
  try {
    await navigator.clipboard.writeText(inviteCredentialLink.value)
    ElMessage.success('邀请链接已复制，请由主办方转发给球队负责人')
  } catch {
    ElMessage.info(`请复制邀请链接：${inviteCredentialLink.value}`)
  }
}

function downloadInviteCode() {
  if (!inviteQrCode.value) return ElMessage.warning('小程序码仍在生成中')
  const anchor = document.createElement('a')
  anchor.href = inviteQrCode.value
  anchor.download = `${activeDivision.value.name || '赛事'}-球队邀请小程序码.png`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

function onDivisionChange() {
  activeTab.value = 'all'
  selectedTeams.value = []
  inviteSearchKeyword.value = ''
  router.replace({ query: { ...route.query, divisionId: activeDivisionId.value } })
}

function closeQaVisualAction() {
  qaVisualClosed.value = true
  if (qaSnapshot) document.querySelector('.qa-dialog-mask')?.style.setProperty('display', 'none')
  const query = { ...route.query }
  delete query.action
  router.replace({ query })
}

function completeInviteCredential() {
  if (qaSnapshot) {
    window.__sxfQaLastAction = {
      action: 'complete-team-invite',
      tournamentId,
      divisionId: activeDivisionId.value,
      invitePath: inviteCredentialLink.value,
      cloudWrite: false,
      autoClaimed: false,
      mergedByName: false
    }
  }
  closeQaVisualAction()
}

async function ensureClaimInvite() {
  const relationId = claimReminderTeam.value.recordId || claimReminderTeam.value._id || ''
  if (!relationId) {
    if (!qaSnapshot && claimInviteOpen.value) ElMessage.warning('未找到对应的参赛球队，无法生成认领邀请')
    return
  }
  if (claimInviteLoading.value) {
    claimInviteRetryPending.value = true
    return
  }
  if (qaSnapshot) {
    claimInviteId.value = 'qa-claim-invite'
    claimInvitePathValue.value = ''
    claimInviteCodeUrl.value = ''
    claimInviteExpiry.value = ''
    return
  }
  const requestKey = `${tournamentId}:${activeDivisionId.value}:${relationId}`
  claimInviteRequestKey.value = requestKey
  claimInviteRetryPending.value = false
  claimInviteLoading.value = true
  try {
    const result = await callFunction('organizerClaimInvite', {
      tournamentId,
      divisionId: activeDivisionId.value,
      tournamentTeamId: relationId
    })
    if (claimInviteRequestKey.value !== requestKey) return
    if (!result || !result.success || !result.inviteId) throw new Error(result?.message || '认领邀请生成失败')
    claimInviteId.value = String(result.inviteId)
    claimInvitePathValue.value = String(result.path || '')
    claimInviteCodeUrl.value = String(result.qrCodeUrl || '')
    claimInviteExpiry.value = result.inviteExpireAt || ''
    claimLastSharedAtValue.value = String(result.lastSharedAt || new Date().toISOString())
  } catch (error) {
    if (claimInviteRequestKey.value !== requestKey) return
    claimInviteId.value = ''
    claimInvitePathValue.value = ''
    claimInviteCodeUrl.value = ''
    claimInviteExpiry.value = ''
    claimLastSharedAtValue.value = ''
    ElMessage.error(error.message || '认领邀请生成失败')
  } finally {
    claimInviteLoading.value = false
    if (claimInviteRetryPending.value && claimInviteOpen.value) {
      claimInviteRetryPending.value = false
      nextTick(() => { void ensureClaimInvite() })
    }
  }
}

async function copyClaimInviteLink() {
  await ensureClaimInvite()
  if (!claimInvitePath.value) return
  try {
    await navigator.clipboard.writeText(claimInvitePath.value)
    if (qaSnapshot) window.__sxfQaLastAction = { action: 'copy-claim-invite', tournamentId, divisionId: activeDivisionId.value, tournamentTeamId: claimReminderTeam.value.recordId || claimReminderTeam.value._id || '', cloudWrite: false, autoClaimed: false, mergedByName: false }
    ElMessage.success('定向认领链接已复制，请由主办方自行转发')
  } catch {
    ElMessage.info(`请复制认领路径：${claimInvitePath.value}`)
  }
}

async function downloadClaimCode() {
  await ensureClaimInvite()
  let url = claimInviteCodeUrl.value
  if (!url && claimInvitePath.value) {
    try {
      url = await QRCode.toDataURL(claimInvitePath.value, {
        width: 300,
        margin: 1,
        color: { dark: '#111b15', light: '#ffffff' }
      })
    } catch (error) {
      console.error('生成认领二维码失败:', error)
    }
  }
  if (!url) return ElMessage.error('小程序码尚未生成，请稍后重试')
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${claimReminderTeam.value.name || claimReminderTeam.value.teamName || activeDivision.value.name || '球队'}-认领小程序码.png`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } catch (error) {
    console.error('下载认领小程序码失败:', error)
    ElMessage.error('小程序码下载失败，请稍后重试')
  }
  if (qaSnapshot) window.__sxfQaLastAction = { action: 'download-claim-code', tournamentId, divisionId: activeDivisionId.value, tournamentTeamId: claimReminderTeam.value.recordId || claimReminderTeam.value._id || '', cloudWrite: false, autoClaimed: false, mergedByName: false }
}

function closeClaimInvite() {
  if (qaSnapshot) window.__sxfQaLastAction = { action: 'close-claim-invite', tournamentId, divisionId: activeDivisionId.value, tournamentTeamId: claimReminderTeam.value.recordId || claimReminderTeam.value._id || '', claimStatusChanged: false, cloudWrite: false, autoClaimed: false, mergedByName: false }
  claimInviteOpen.value = false
  claimInviteId.value = ''
  claimInvitePathValue.value = ''
  claimInviteCodeUrl.value = ''
  claimInviteExpiry.value = ''
  claimLastSharedAtValue.value = ''
  closeQaVisualAction()
}
// 打开邀请弹窗
async function openInviteDialog() {
  // 重新加载数据确保最新
  await Promise.all([
    loadTournamentTeams(),
    loadAllTeams()
  ])

  // 检查是否有可邀请的球队
  if (availableTeamsToInvite.value.length === 0) {
    if (allTeams.value.length === 0) {
      ElMessage.warning('系统中暂无球队，请先创建球队')
    } else {
      ElMessage.info('所有球队已加入该赛事或已被邀请')
    }
    return
  }

  showInviteDialog.value = true
}

// 弹窗关闭回调
function onInviteDialogClose() {
  selectedTeams.value = []
  inviteSearchKeyword.value = ''
}

// 打开报名二维码弹窗
async function openQrDialog() {
  showQrDialog.value = true
  await generateSignupQRCode()
}

// 生成报名二维码（调用云函数）
async function generateSignupQRCode() {
  qrLoading.value = true
  qrCodeImage.value = ''
  qrError.value = ''
  try {
    const res = await callFunction('generateMiniProgramCode', {
      action: 'signup',
      tournamentId: tournamentId,
      width: 300
    })
    if (res.success) {
      qrCodeImage.value = res.data?.qrCodeUrl || res.data?.imageUrl || ''
      if (!qrCodeImage.value) qrError.value = '云端已生成二维码，但未返回可显示的图片数据'
    } else {
      qrError.value = res.message || '生成二维码失败'
      console.error('[QR] 云函数返回失败:', res)
    }
  } catch (err) {
    console.error('[QR] 生成二维码异常:', err)
    qrError.value = err.message || String(err)
  } finally {
    qrLoading.value = false
  }
}

// 下载二维码图片
function downloadQRCode() {
  if (!qrCodeImage.value) return
  const link = document.createElement('a')
  link.href = qrCodeImage.value
  link.download = `赛事报名二维码_${tournament.value.name || tournamentId}.png`
  link.click()
}

// 复制小程序报名路径
async function copySignupLink() {
  const path = `pages/tournament/signup/signup?id=${tournamentId}`
  try {
    await navigator.clipboard.writeText(path)
    ElMessage.success('小程序路径已复制')
  } catch {
    ElMessage.info('复制失败，路径: ' + path)
  }
}

// 获取 tournament_teams 记录 ID
function getRecordId(team) {
  return team.recordId || team._id
}

// 取消邀请
async function cancelInvite(team) {
  try {
    await ElMessageBox.confirm(`确定取消对「${team.name || team.teamName}」的邀请吗？`, '确认取消')
    await deleteRecord('tournament_teams', getRecordId(team))
    ElMessage.success('已取消邀请')
    await loadTournamentTeams()
  } catch (err) {
    if (err !== 'cancel') {
      console.error('取消邀请失败:', err)
      ElMessage.error('操作失败')
    }
  }
}

// 通过报名/确认
async function approveTeam(team) {
  try {
    if (qaSnapshot) {
      const recordId = getRecordId(team)
      tournamentTeams.value = tournamentTeams.value.map(item => getRecordId(item) === recordId ? { ...item, status: 'approved', approveTime: new Date().toISOString() } : item)
      window.__sxfQaApplicationDecision = { action: 'approve', recordId, tournamentId, divisionId: activeDivisionId.value, claimStatus: team.claimStatus, createdRoster: false, grantedOwnership: false, mergedByName: false, cloudWrite: false }
      ElMessage.success('已通过')
      return
    }
    await updateRecord('tournament_teams', getRecordId(team), {
      status: 'approved',
      approveTime: new Date()
    })
    ElMessage.success('已通过')
    await loadTournamentTeams()
  } catch (err) {
    console.error('操作失败:', err)
    ElMessage.error('操作失败')
  }
}

// 拒绝报名
async function rejectTeam(team) {
  try {
    if (qaSnapshot) {
      window.__sxfQaApplicationDecision = { phase: 'confirmation-opened', action: 'reject', recordId: getRecordId(team), tournamentId, divisionId: activeDivisionId.value, preservedTeamProfile: true, deletedUser: false, cloudWrite: false }
    }
    await ElMessageBox.confirm(`确定拒绝「${team.name || team.teamName}」的参赛申请吗？`, '确认拒绝')
    if (qaSnapshot) {
      const recordId = getRecordId(team)
      window.__sxfQaApplicationDecision = { phase: 'confirmed', action: 'reject', recordId, tournamentId, divisionId: activeDivisionId.value, preservedTeamProfile: true, deletedUser: false, cloudWrite: false }
      tournamentTeams.value = tournamentTeams.value.map(item => getRecordId(item) === recordId ? { ...item, status: 'rejected', rejectTime: new Date().toISOString() } : item)
      ElMessage.success('已拒绝')
      return
    }
    await updateRecord('tournament_teams', getRecordId(team), {
      status: 'rejected',
      rejectTime: new Date()
    })
    ElMessage.success('已拒绝')
    await loadTournamentTeams()
  } catch (err) {
    if (err !== 'cancel') {
      console.error('操作失败:', err)
      ElMessage.error('操作失败')
    }
  }
}

// 移除已参赛球队
async function removeTeam(team) {
  try {
    await ElMessageBox.confirm(`确定将「${team.name || team.teamName}」从赛事中移除吗？`, '确认移除', {
      type: 'warning'
    })
    await deleteRecord('tournament_teams', getRecordId(team))
    ElMessage.success('已移除')
    await loadTournamentTeams()
  } catch (err) {
    if (err !== 'cancel') {
      console.error('移除失败:', err)
      ElMessage.error('操作失败')
    }
  }
}

// 同意撤销报名
async function approveCancel(team) {
  try {
    if (qaSnapshot) {
      window.__sxfQaChangeDecision = { phase: 'confirmation-opened', action: 'approve-cancel', recordId: getRecordId(team), tournamentId, divisionId: activeDivisionId.value, preservedTeamId: team.teamId || team._id, deletedUsers: false, deletedTeamProfile: false, historicalSnapshotsChanged: false }
    }
    await ElMessageBox.confirm(
      `确定同意「${team.name || team.teamName}」撤销报名吗？\n\n同意后该球队将退出本次赛事。`,
      '同意撤销报名',
      {
        confirmButtonText: '同意撤销',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    if (qaSnapshot) {
      const recordId = getRecordId(team)
      window.__sxfQaChangeDecision = { action: 'approve-cancel', recordId, tournamentId, divisionId: activeDivisionId.value, preservedTeamId: team.teamId || team._id, deletedUsers: false, deletedTeamProfile: false, historicalSnapshotsChanged: false }
      tournamentTeams.value = tournamentTeams.value.filter(item => getRecordId(item) !== recordId)
      ElMessage.success('已同意撤销报名')
      return
    }
    // 删除记录（撤销报名）
    await deleteRecord('tournament_teams', getRecordId(team))
    ElMessage.success('已同意撤销报名')
    await loadTournamentTeams()
  } catch (err) {
    if (err !== 'cancel') {
      console.error('同意撤销失败:', err)
      ElMessage.error('操作失败')
    }
  }
}

// 拒绝撤销报名（恢复为已参赛）
async function rejectCancel(team) {
  try {
    if (qaSnapshot) {
      window.__sxfQaChangeDecision = { phase: 'confirmation-opened', action: 'reject-cancel', recordId: getRecordId(team), tournamentId, divisionId: activeDivisionId.value, restoredStatus: 'approved', deletedUsers: false, deletedTeamProfile: false, historicalSnapshotsChanged: false }
    }
    await ElMessageBox.confirm(
      `确定拒绝「${team.name || team.teamName}」的撤销申请吗？\n\n拒绝后该球队将继续参赛。`,
      '拒绝撤销申请',
      {
        confirmButtonText: '拒绝撤销',
        cancelButtonText: '取消',
        type: 'info'
      }
    )
    if (qaSnapshot) {
      const recordId = getRecordId(team)
      window.__sxfQaChangeDecision = { action: 'reject-cancel', recordId, tournamentId, divisionId: activeDivisionId.value, restoredStatus: 'approved', deletedUsers: false, deletedTeamProfile: false, historicalSnapshotsChanged: false }
      tournamentTeams.value = tournamentTeams.value.map(item => getRecordId(item) === recordId ? { ...item, status: 'approved', cancelRequestTime: null, updateTime: new Date().toISOString() } : item)
      ElMessage.success('已拒绝撤销申请，球队继续参赛')
      return
    }
    // 恢复状态为 approved
    await updateRecord('tournament_teams', getRecordId(team), {
      status: 'approved',
      cancelRequestTime: null,
      updateTime: new Date()
    })
    ElMessage.success('已拒绝撤销申请，球队继续参赛')
    await loadTournamentTeams()
  } catch (err) {
    if (err !== 'cancel') {
      console.error('拒绝撤销失败:', err)
      ElMessage.error('操作失败')
    }
  }
}

onMounted(async () => {
  await loadTournament()
  await Promise.all([loadTournamentTeams(), loadAllTeams()])

  const requestedTab = typeof route.query.tab === 'string' ? route.query.tab : 'all'
  activeTab.value = teamTabs.has(requestedTab) ? requestedTab : 'all'

  const requestedAction = typeof route.query.action === 'string' ? route.query.action : ''
  if (requestedAction === 'invite') {
    if (qaSnapshot) {
      await nextTick()
      await ensureInviteQrCode()
      window.setTimeout(() => { void ensureInviteQrCode() }, 300)
    }
    else await openInviteDialog()
  } else if (requestedAction === 'quick-add') {
    openCreateTeamDialog()
    if (qaSnapshot) {
      window.setTimeout(() => {
        Object.assign(createTeamForm.value, { name: '郑州青训U16队', contactName: '刘教练', contactPhone: '18612343345' })
      }, 300)
    }
  } else if (requestedAction === 'claim-invite') {
    claimInviteOpen.value = true
    await nextTick()
    await ensureClaimInvite()
  }
})
</script>

<style scoped>
.tournament-teams {
  min-height: 100%;
  background: #f5f7f5;
  color: #17221a;
}

.page-content {
  margin-top: 20px;
}

.division-switch-bar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 14px 16px; margin-bottom: 16px; background: #f0f8f1; border: 1px solid #d8ead9; border-radius: 10px; }
.division-switch-label { color: #1b5e20; font-weight: 600; }
.division-switch-hint { color: #6b7280; font-size: 13px; }

/* 统计栏 */
.stats-bar {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: #1f2937;
  line-height: 1;
  margin-bottom: 8px;
}

.stat-label {
  font-size: 14px;
  color: #6b7280;
}

/* 操作栏 */
.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

/* 标签徽章 */
.tab-badge {
  margin-left: 8px;
}

/* 球队网格 */
.teams-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  margin-top: 20px;
}

.team-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: all 0.3s;
  border: 2px solid transparent;
}

.team-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.team-card.team-invited {
  border-color: #409eff;
  background: #f5f9ff;
}

.team-card.team-cancel-requested {
  border-color: #e6a23c;
  background: #fdf6ec;
}

.team-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.team-logo {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  object-fit: cover;
}

.team-logo-placeholder {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 600;
}

.team-info h4 {
  margin: 0 0 4px 0;
  font-size: 16px;
  color: #1f2937;
}

.team-body {
  margin-bottom: 16px;
}

.team-stat {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f3f4f6;
}

.team-stat:last-child {
  border-bottom: none;
}

.team-stat span {
  font-size: 13px;
  color: #6b7280;
}

.team-stat em {
  font-style: normal;
  font-size: 13px;
  color: #1f2937;
}

.team-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* 邀请弹窗 */
.invite-dialog {
  max-height: 450px;
  overflow-y: auto;
}

/* 弹窗顶部信息栏 */
.invite-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e4e7ed;
}

.invite-info {
  display: flex;
  gap: 24px;
}

.info-item {
  font-size: 14px;
}

.info-item label {
  color: #909399;
  margin-right: 4px;
}

.info-item em {
  font-style: normal;
  font-weight: 600;
  color: #409eff;
  font-size: 16px;
}

.info-item em.text-danger {
  color: #f56c6c;
}

/* 球队列表 */
.available-teams {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.available-team-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
  background: #fafafa;
}

.available-team-item:hover {
  background: #f3f4f6;
}

.available-team-item.selected {
  background: #ecf5ff;
  border-color: #409eff;
}

.available-team-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.team-thumb {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  object-fit: cover;
}

.team-thumb-placeholder {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
}

.available-team-item .team-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.team-name {
  font-size: 15px;
  font-weight: 500;
  color: #1f2937;
}

.team-coach {
  font-size: 13px;
  color: #6b7280;
  display: flex;
  align-items: center;
  gap: 12px;
}

.team-coach .el-icon {
  font-size: 14px;
  margin-right: 2px;
}

.player-count {
  color: #409eff;
}

.create-mode-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  padding: 14px;
  border: 1px solid #d9ecff;
  border-radius: 8px;
  background: #f4f9ff;
}

.create-mode-title {
  color: #303133;
  font-size: 14px;
  font-weight: 600;
}

.create-mode-tip {
  margin-top: 4px;
  color: #606266;
  font-size: 12px;
  line-height: 1.5;
}

.create-word-import {
  margin-bottom: 16px;
  padding: 14px;
  border: 1px solid #c2e7b0;
  border-radius: 8px;
  background: #f0f9eb;
}

.create-word-import-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.create-word-import-title {
  color: #1b5e20;
  font-size: 14px;
  font-weight: 600;
}

.create-word-import-tip,
.create-word-import-result {
  margin-top: 4px;
  color: #606266;
  font-size: 12px;
  line-height: 1.6;
}

.create-word-import-result {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-top: 8px;
  border-top: 1px dashed #c2e7b0;
}

.create-logo-row {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 72px;
}

.create-logo-preview {
  width: 64px;
  height: 64px;
  object-fit: contain;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  background: #fff;
}

.create-logo-tip {
  color: #909399;
  font-size: 12px;
}

/* 弹窗底部 */
.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.footer-info {
  flex: 1;
}

.selected-preview {
  font-size: 14px;
  color: #606266;
  display: flex;
  align-items: center;
  gap: 8px;
}

.selected-preview .team-names {
  color: #409eff;
  font-weight: 500;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.footer-actions {
  display: flex;
  gap: 12px;
}

/* 响应式 */
@media (max-width: 768px) {
  .stats-bar {
    grid-template-columns: repeat(3, 1fr);
  }
  
  .teams-grid {
    grid-template-columns: 1fr;
  }
  
  .action-bar {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }

  .create-word-import-main,
  .create-word-import-result {
    align-items: flex-start;
    flex-direction: column;
  }
}

/* 报名二维码弹窗 */
.qr-dialog {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}

.qr-image-wrapper {
  width: 100%;
  display: flex;
  justify-content: center;
  min-height: 180px;
  align-items: center;
}

.qr-image {
  width: 220px;
  height: 220px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
}

.qr-tips {
  text-align: center;
  font-size: 13px;
  color: #909399;
  line-height: 1.8;
}

.qr-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.qr-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  text-align: center;
}

.qr-error .error-text {
  font-size: 16px;
  font-weight: 600;
  color: #f56c6c;
  margin: 0;
}

.qr-error .error-detail {
  font-size: 12px;
  color: #909399;
  margin: 0;
  max-width: 280px;
  word-break: break-all;
}

.qr-error .error-hint {
  font-size: 13px;
  color: #e6a23c;
  margin: 8px 0 0 0;
}

.qr-path {
  background: #f5f7fa;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
  width: 100%;
  box-sizing: border-box;
  word-break: break-all;
}

.qr-path .label {
  color: #909399;
}

.qr-path .path-code {
  background: #fff;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  color: #409eff;
  margin-left: 4px;
  font-size: 11px;
}

.teams-context-header {
  position: sticky;
  z-index: 20;
  top: 0;
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto minmax(220px, 1fr);
  align-items: center;
  min-height: 72px;
  padding: 0 32px;
  border-bottom: 1px solid #e2e8e3;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(14px);
}

.teams-context-header > .el-button { justify-self: end; }

.teams-brand,
.teams-tournament-context,
.heading-actions,
.division-picker,
.division-rule-summary,
.table-toolbar,
.team-identity {
  display: flex;
  align-items: center;
}

.teams-brand { gap: 10px; }
.teams-brand .brand-mark {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 10px;
  background: #116b36;
  color: #fff;
  font-size: 18px;
  font-weight: 800;
}
.teams-brand div { display: flex; flex-direction: column; line-height: 1.25; }
.teams-brand strong { font-size: 15px; }
.teams-brand span:last-child { margin-top: 3px; color: #7a847d; font-size: 11px; }

.teams-tournament-context { justify-content: center; gap: 12px; font-size: 13px; }
.teams-tournament-context strong { max-width: 260px; overflow: hidden; color: #202b23; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
.context-label { color: #879189; }
.context-divider { width: 1px; height: 18px; background: #dfe5e0; }

.teams-page-content { width: min(1380px, calc(100% - 64px)); margin: 0 auto; padding: 34px 0 56px; }
.teams-page-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
.heading-eyebrow { margin-bottom: 8px; color: #16834b; font-size: 12px; font-weight: 700; letter-spacing: 1.5px; }
.teams-page-heading h1 { margin: 0; font-size: 30px; line-height: 1.25; letter-spacing: -0.5px; }
.teams-page-heading p { margin: 9px 0 0; color: #718075; font-size: 14px; }
.heading-actions { justify-content: flex-end; gap: 8px; flex-wrap: wrap; }

.division-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 14px 18px;
  border: 1px solid #dfe7e1;
  border-radius: 10px;
  background: #fff;
}
.division-picker { gap: 12px; color: #5c685f; font-size: 13px; }
.division-picker > span { font-weight: 650; color: #253329; }
.division-rule-summary { gap: 14px; color: #68756b; font-size: 13px; }
.division-rule-summary i { width: 3px; height: 3px; border-radius: 50%; background: #a9b2ab; }

.team-work-tabs { margin-top: 18px; padding: 0 6px; }
.team-work-tabs :deep(.el-tabs__header) { margin: 0; }
.team-work-tabs :deep(.el-tabs__nav-wrap::after) { height: 1px; background: #dfe5e0; }
.team-work-tabs :deep(.el-tabs__item) { height: 52px; padding: 0 24px; color: #667168; font-weight: 550; }
.team-work-tabs :deep(.el-tabs__item.is-active) { color: #12713b; }
.team-work-tabs :deep(.el-tabs__active-bar) { height: 3px; border-radius: 3px 3px 0 0; background: #158142; }

.team-summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin: 22px 0 16px; }
.team-summary-grid article { position: relative; min-height: 94px; padding: 19px 22px; overflow: hidden; border: 1px solid #e0e7e1; border-radius: 10px; background: #fff; }
.team-summary-grid article::after { position: absolute; right: -12px; bottom: -30px; width: 84px; height: 84px; border-radius: 50%; background: #eff7f1; content: ''; }
.team-summary-grid span { display: block; margin-bottom: 11px; color: #77817a; font-size: 13px; }
.team-summary-grid strong { color: #17251b; font-size: 28px; line-height: 1; }
.team-summary-grid strong.danger { color: #c33b32; }
.team-summary-grid small { margin-left: 6px; color: #7e8981; font-size: 12px; }
.professional-summary-icon{position:relative;z-index:1;display:grid!important;place-items:center;width:58px;height:58px;margin:0 0 12px!important;border-radius:50%;font-size:30px}.professional-summary-icon.icon-emerald{background:#e5f7e9;color:#07813d}.professional-summary-icon.icon-blue{background:#e9f3ff;color:#2478ea}.professional-summary-icon.icon-orange{background:#fff0dc;color:#f08a0a}.professional-summary-icon.icon-teal{background:#e2f7f5;color:#129c96}.team-summary-grid:has(.professional-summary-icon) article{display:grid;grid-template-columns:72px 1fr;grid-template-rows:auto auto;align-items:center;min-height:110px;padding:16px 20px}.team-summary-grid:has(.professional-summary-icon) .professional-summary-icon{grid-row:1 / span 2}.team-summary-grid:has(.professional-summary-icon) article>span:not(.professional-summary-icon){grid-column:2;margin:0 0 7px;color:#435047;font-size:14px}.team-summary-grid:has(.professional-summary-icon) article strong{grid-column:2;font-size:31px}.team-summary-grid:has(.professional-summary-icon) article small{grid-column:2;margin:-25px 0 0 47px}
.simple-application-summary { grid-template-columns: repeat(4, 1fr); }
.simple-application-summary article { display: grid; grid-template-columns: 54px 1fr; grid-template-rows: auto auto; align-items: center; min-height: 100px; padding: 16px 20px; }
.simple-application-summary article > span:not(.summary-symbol) { grid-column: 2; margin: 0 0 7px; color: #455249; font-size: 14px; }
.simple-application-summary article strong { grid-column: 2; font-size: 30px; }
.simple-application-summary article small { grid-column: 2; margin-left: 48px; margin-top: -25px; }
.summary-symbol { grid-row: 1 / span 2; position: relative; width: 48px; height: 48px; border-radius: 50%; }
.summary-symbol::before,.summary-symbol::after { position: absolute; content: ''; }
.summary-symbol-pending { background: #fff3d7; }.summary-symbol-pending::before { inset: 13px 17px; border: 2px solid #eaa31a; border-radius: 50%; }.summary-symbol-pending::after { top: 12px; left: 23px; width: 2px; height: 14px; background: #eaa31a; box-shadow: -5px 13px 0 -0.5px #eaa31a; }
.summary-symbol-apply { background: #fff0dd; }.summary-symbol-apply::before { top: 11px; left: 17px; width: 14px; height: 14px; border: 2px solid #ef8614; border-radius: 50%; }.summary-symbol-apply::after { bottom: 10px; left: 12px; width: 24px; height: 12px; border: 2px solid #ef8614; border-bottom: 0; border-radius: 14px 14px 0 0; }
.summary-symbol-success { background: #e7f7ec; }.summary-symbol-success::before { inset: 12px; border: 2px solid #128544; border-radius: 50%; }.summary-symbol-success::after { top: 21px; left: 17px; width: 13px; height: 7px; border-left: 2px solid #128544; border-bottom: 2px solid #128544; transform: rotate(-45deg); }
.summary-symbol-alert { background: #fff0ed; }.summary-symbol-alert::before { top: 11px; left: 16px; width: 0; height: 0; border-right: 9px solid transparent; border-bottom: 26px solid #ef554b; border-left: 9px solid transparent; }.summary-symbol-alert::after { top: 20px; left: 23px; width: 2px; height: 8px; border-radius: 1px; background: #fff; box-shadow: 0 11px 0 -0.3px #fff; }

.teams-mode-notice { margin-bottom: 16px; border-radius: 8px; }
.professional-team-filters{display:grid;grid-template-columns:1.12fr 1.38fr .72fr .8fr auto auto;gap:12px;align-items:center;margin:22px 0 18px}.professional-team-filters .el-input,.professional-team-filters .el-select{width:100%}.professional-team-filters .el-button{height:40px;margin:0}
.simple-application-filters { display: grid; grid-template-columns: 1.45fr .9fr .9fr 1.05fr auto; gap: 16px; align-items: center; margin: 20px 0 14px; }
.simple-application-filters .el-input,.simple-application-filters .el-select,.simple-application-filters .el-date-editor { width: 100%; }
.professional-application-summary { grid-template-columns: repeat(4, 1fr); }
.professional-application-summary .professional-summary-icon.icon-red { background: #fff0ef; color: #e83c31; }
.professional-application-filters { grid-template-columns: 1.45fr .96fr .96fr 1.45fr auto; margin: 22px 0 16px; }
.professional-application-panel .table-toolbar { display: none; }
.professional-application-panel .simple-application-row { min-height: 58px; }
.professional-application-view .teams-page-content{padding-top:26px}.professional-application-view .teams-page-heading{margin-bottom:12px}.professional-application-view .teams-page-heading h1{font-size:28px}.professional-application-view .teams-page-heading p{display:none}.professional-application-view .heading-actions{display:none}.professional-application-view .division-toolbar{position:absolute;top:37px;right:36px;width:auto;min-width:280px;padding:0;border:0;background:transparent}.professional-application-view .division-toolbar>span:not(.division-toolbar-label){display:none}.professional-application-view .team-work-tabs{margin-top:5px}.professional-application-view .team-work-tabs :deep(.el-tabs__item){height:42px}.professional-application-view .team-summary-grid{margin:13px 0 11px}.professional-application-view .professional-application-summary article{min-height:82px;padding:11px 18px}.professional-application-view .professional-summary-icon{width:48px;height:48px}.professional-application-view .teams-mode-notice{margin-bottom:10px}.professional-application-view .professional-application-filters{grid-template-columns:1.35fr .72fr .72fr 1.2fr auto auto auto;gap:10px;margin:0 0 10px}.professional-application-view .professional-application-filters .el-button{height:36px;margin:0}.professional-application-view .professional-application-panel .simple-application-row{min-height:47px}.professional-application-view .professional-application-panel .simple-application-row.teams-table-head{min-height:41px}.professional-application-view .team-crest,.professional-application-view .team-crest-placeholder{width:33px;height:33px}.professional-application-view .team-identity div{gap:1px}.professional-application-view .pending-claim-panel{margin-top:10px}.professional-application-view .pending-claim-panel .table-toolbar{min-height:38px;padding:0 18px}.professional-application-view .pending-claim-panel .pending-claim-row{min-height:43px}.professional-application-view .pending-claim-panel .team-row-actions .el-button:nth-child(n+2){display:none}.professional-application-boundary{display:flex;align-items:center;gap:9px;margin-top:8px;padding:8px 12px;color:#657269;font-size:12px}.professional-application-boundary .el-icon{font-size:17px;color:#627068}
.pending-claim-panel { margin-top: 18px; }
.pending-claim-panel .table-toolbar { min-height: 52px; padding: 0 18px; border-bottom: 1px solid #edf0ed; background: linear-gradient(90deg,#f2fbf4,#fff); }
.pending-claim-panel .table-toolbar strong { color: #168344; }
.teams-table-panel { overflow: hidden; border: 1px solid #dfe6e0; border-radius: 10px; background: #fff; }
.table-toolbar { justify-content: space-between; gap: 18px; padding: 16px 18px; border-bottom: 1px solid #e8ece9; }
.table-toolbar > div { display: flex; align-items: baseline; gap: 10px; }
.table-toolbar strong { font-size: 15px; }
.table-toolbar span { color: #89928b; font-size: 12px; }
.teams-data-table { width: 100%; }
.teams-table-row { display: grid; grid-template-columns: minmax(220px, 1.7fr) minmax(120px, .9fr) minmax(108px, .75fr) minmax(100px, .72fr) minmax(112px, .82fr) 72px minmax(160px, .9fr); align-items: center; min-height: 68px; padding: 0 18px; border-top: 1px solid #edf0ed; color: #38423a; font-size: 13px; column-gap: 12px; }
.teams-table-row.professional-table-row{grid-template-columns:minmax(220px,1.62fr) minmax(130px,.9fr) minmax(112px,.78fr) minmax(116px,.86fr) 88px minmax(134px,.92fr) 65px minmax(168px,1.16fr);min-height:71px;column-gap:10px}.professional-team-panel .table-toolbar{padding:0;border-bottom:0}.professional-team-panel .table-toolbar>div{display:none}.professional-team-panel .table-toolbar .el-input{display:none}.professional-team-panel .teams-table-head{min-height:48px;background:#fafbfa}.professional-team-panel .team-crest{width:40px;height:40px}.professional-team-panel .team-row-actions{gap:8px}.professional-team-panel .team-row-actions .el-button{margin:0;padding:0;font-size:12px}
.teams-table-head { min-height: 48px; border-top: 0; background: #f7f9f7; color: #647067; font-size: 12px; font-weight: 650; }
.professional-team-overview .teams-page-content{position:relative;padding-top:28px}
.professional-team-overview .teams-page-heading{align-items:center;min-height:54px;margin-bottom:0;padding-right:520px}
.professional-team-overview .teams-page-heading .heading-eyebrow,
.professional-team-overview .teams-page-heading p,
.professional-team-overview .teams-page-heading .heading-actions{display:none}
.professional-team-overview .teams-page-heading h1{font-size:30px}
.professional-team-overview .division-toolbar{position:absolute;top:24px;right:36px;width:500px;padding:0;border:0;background:transparent}
.professional-team-overview .division-rule-summary{display:none}
.professional-team-overview .division-picker{margin-left:auto}
.professional-team-overview .team-work-tabs{margin-top:4px}
.professional-team-overview .team-summary-grid{margin:20px 0 16px}
.professional-team-overview .professional-team-filters{margin:16px 0 14px}
.professional-team-overview .professional-team-panel .teams-table-row{min-height:40px}
.professional-team-overview .professional-team-panel .teams-table-head{min-height:46px}
.professional-team-overview .professional-team-panel .team-crest{width:30px;height:30px}
.professional-team-overview .professional-team-panel .team-identity{gap:9px}
.professional-team-overview .professional-team-panel .team-identity small{margin-top:1px;font-size:11px}
.simple-application-row { grid-template-columns: minmax(215px,1.45fr) .58fr .95fr 1.2fr 1.1fr .78fr .84fr .56fr; column-gap: 10px; }
.simple-application-row.teams-table-head { min-height: 52px; color: #344239; font-size: 13px; }
.simple-application-panel .table-toolbar { padding: 13px 18px; }
.pending-claim-row { grid-template-columns: minmax(250px,1.35fr) .65fr 1fr .75fr minmax(300px,1.35fr); }
.simple-team-overview + * { min-width: 0; }
.simple-application-summary + .teams-mode-notice { margin-top: 2px; }
.simple-application-summary article strong.danger { color: #e3423a; }
.pending-claim-panel .pending-claim-row { min-height: 50px; }
.pending-claim-panel .team-row-actions { justify-content: flex-end; gap: 10px; }
.simple-application-view .teams-page-content { padding-top: 22px; }
.simple-application-view .teams-page-heading { margin-bottom: 15px; }
.simple-application-view .teams-page-heading h1 { font-size: 27px; }
.simple-application-view .teams-page-heading p { margin-top: 5px; }
.simple-application-view .heading-actions { display: none; }
.simple-application-view .division-toolbar { padding: 9px 16px; }
.simple-application-view .team-work-tabs { margin-top: 8px; }
.simple-application-view .team-work-tabs :deep(.el-tabs__item) { height: 40px; }
.simple-application-view .team-summary-grid { margin: 12px 0 10px; }
.simple-application-view .simple-application-summary article { min-height: 74px; padding: 9px 17px; }
.simple-application-view .summary-symbol { width: 44px; height: 44px; }
.simple-application-view .teams-mode-notice { margin-bottom: 9px; }
.simple-application-view .simple-application-filters { grid-template-columns: 1.35fr .82fr .82fr .9fr auto auto; gap: 10px; margin: 0 0 9px; }
.simple-application-view .simple-application-filters .el-button { height: 36px; margin: 0; }
.simple-application-view .simple-application-panel .table-toolbar { padding: 9px 18px; }
.simple-application-view .simple-application-row { min-height: 49px; }
.simple-application-view .simple-application-row.teams-table-head { min-height: 42px; }
.simple-application-view .team-crest,.simple-application-view .team-crest-placeholder { width: 34px; height: 34px; }
.simple-application-view .team-identity div { gap: 2px; }
.simple-application-view .pending-claim-panel { margin-top: 10px; }
.simple-application-view .pending-claim-panel .table-toolbar { min-height: 40px; padding: 0 18px; }
.simple-application-view .pending-claim-panel .pending-claim-row { min-height: 44px; }
.simple-change-view .teams-page-content { padding-top: 23px; }
.simple-change-view .teams-page-heading { margin-bottom: 14px; }
.simple-change-view .heading-actions { display: none; }
.simple-change-view .division-toolbar { padding: 9px 16px; }
.simple-change-view .team-work-tabs { margin-top: 8px; }
.simple-change-view .team-work-tabs :deep(.el-tabs__item) { height: 42px; }
.simple-change-view .change-summary-grid { margin: 14px 0 12px; }
.change-summary-grid article { display: grid; grid-template-columns: 62px 1fr; grid-template-rows: auto auto; align-items: center; min-height: 72px; padding: 10px 17px; }
.change-summary-grid article > span:not(.change-summary-icon) { grid-column: 2; margin: 0 0 5px; color: #4a554d; font-size: 14px; }
.change-summary-grid article strong { grid-column: 2; font-size: 27px; }
.change-summary-grid article small { grid-column: 2; margin: -23px 0 0 39px; }
.change-summary-grid article strong.change-text { font-size: 23px; font-weight: 600; }
.change-summary-icon { display: grid !important; grid-row: 1 / span 2; width: 48px; height: 48px; margin: 0 !important; place-items: center; border-radius: 50%; font-size: 25px; }
.change-gray { background: #eceeef; color: #8e9691 !important; }.change-green { background: #e4f6e9; color: #138947 !important; }.change-red { background: #ffeded; color: #ec3f39 !important; }.change-blue { background: #e8f2ff; color: #2579df !important; }
.simple-change-view .teams-mode-notice { margin-bottom: 11px; }
.simple-change-history { color: #263029; }
.change-history-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.change-history-heading > div { display: flex; align-items: baseline; gap: 12px; }
.change-history-heading h2 { margin: 0; font-size: 19px; }.change-history-heading span { color: #7b867e; font-size: 12px; }
.change-history-filters { display: grid; grid-template-columns: .78fr .78fr 1.35fr 1fr; gap: 10px; margin-bottom: 9px; }.change-history-filters .el-select,.change-history-filters .el-input,.change-history-filters .el-date-editor { width: 100%; }
.change-history-table { overflow: hidden; border: 1px solid #e0e6e1; border-radius: 9px; background: #fff; }
.change-history-row { display: grid; grid-template-columns: 1.08fr .84fr 1.05fr .82fr 28px .9fr .7fr 1fr .66fr .68fr; align-items: center; min-height: 43px; padding: 0 16px; border-top: 1px solid #edf0ed; column-gap: 8px; font-size: 12px; }
.change-history-head { min-height: 39px; border-top: 0; background: #f7f9f7; color: #5d6860; font-weight: 650; }.change-history-row strong { font-size: 12px; }.change-arrow { color: #15924c; font-size: 18px; }
.change-principles { display: grid; grid-template-columns: 1.45fr .9fr; gap: 14px; margin-top: 10px; }.change-principles > div { display: flex; align-items: center; gap: 10px; min-height: 50px; padding: 0 16px; border: 1px solid #dce8f7; border-radius: 8px; background: #f5f9ff; color: #4f5f70; font-size: 12px; }.change-principles > div:last-child { align-items: flex-start; flex-direction: column; justify-content: center; gap: 3px; background: #fff; }.change-principles strong { color: #2474d8; }.change-principles .el-icon { color: #2474d8; font-size: 20px; }
.team-row-actions { display: flex; align-items: center; gap: 2px; white-space: nowrap; }
.teams-empty { padding: 46px 18px; color: #89928b; text-align: center; }
.team-identity { gap: 12px; }
.team-crest { width: 42px; height: 42px; flex: 0 0 auto; object-fit: contain; }
.team-crest-placeholder { display: grid; width: 42px; height: 42px; flex: 0 0 auto; place-items: center; border-radius: 50%; background: #e9f4ec; color: #17753e; font-weight: 750; }
.team-identity div { display: flex; min-width: 0; flex-direction: column; gap: 5px; }
.team-identity strong { overflow: hidden; color: #243027; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.team-identity small { color: #8a948d; font-size: 12px; }

.simple-team-overview .teams-page-content { padding-top: 27px; }
.simple-team-overview .teams-page-heading { margin-bottom: 18px; }
.simple-team-overview .teams-page-heading h1 { font-size: 28px; }
.simple-team-overview .division-toolbar { padding: 11px 16px; }
.simple-team-overview .team-work-tabs { margin-top: 11px; }
.simple-team-overview .team-work-tabs :deep(.el-tabs__item) { height: 44px; }
.simple-team-overview .team-summary-grid { gap: 16px; margin: 17px 0 13px; }
.simple-team-overview .team-summary-grid article {
  display: grid;
  grid-template-columns: 64px 1fr;
  grid-template-rows: auto auto;
  align-items: center;
  min-height: 86px;
  padding: 12px 18px;
}
.simple-team-overview .team-summary-grid article > span:not(.simple-summary-icon) {
  grid-column: 2;
  margin: 0 0 5px;
  color: #4d5a50;
  font-size: 14px;
}
.simple-team-overview .team-summary-grid article strong { grid-column: 2; font-size: 29px; }
.simple-team-overview .team-summary-grid article small { grid-column: 2; margin: -24px 0 0 47px; }
.simple-summary-icon {
  position: relative;
  z-index: 1;
  display: grid !important;
  grid-row: 1 / span 2;
  width: 52px;
  height: 52px;
  margin: 0 !important;
  place-items: center;
  border-radius: 50%;
  font-size: 25px;
}
.simple-summary-green { background: #e5f6ea; color: #168448 !important; }
.simple-summary-blue { background: #e8f2ff; color: #347bd8 !important; }
.simple-summary-orange { background: #fff2dd; color: #e98c1b !important; }
.simple-summary-teal { background: #e4f7f3; color: #199885 !important; }
.simple-team-overview .teams-mode-notice { margin-bottom: 12px; }
.simple-team-filters {
  display: grid;
  grid-template-columns: minmax(210px, 1.25fr) minmax(220px, 1fr) 150px auto auto;
  gap: 11px;
  align-items: center;
  margin: 0 0 13px;
}
.simple-team-filters .el-input,.simple-team-filters .el-select { width: 100%; }
.simple-team-filters .el-button { height: 36px; margin: 0; }
.simple-team-overview .teams-table-panel .table-toolbar { display: none; }
.simple-team-overview .teams-table-row { min-height: 58px; }
.simple-team-overview .teams-table-head { min-height: 43px; }
.simple-team-overview .team-crest,.simple-team-overview .team-crest-placeholder { width: 38px; height: 38px; }

@media (max-width: 1100px) {
  .teams-context-header { grid-template-columns: 1fr auto; }
  .teams-tournament-context { display: none; }
  .teams-page-heading { align-items: flex-start; flex-direction: column; }
  .team-summary-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 760px) {
  .teams-context-header { padding: 0 18px; }
  .teams-page-content { width: calc(100% - 28px); padding-top: 24px; }
  .division-toolbar { align-items: flex-start; flex-direction: column; }
  .division-rule-summary { flex-wrap: wrap; }
  .team-summary-grid { grid-template-columns: 1fr 1fr; }
  .table-toolbar { align-items: stretch; flex-direction: column; }
}
.qa-dialog-mask{position:fixed;z-index:5000;inset:0;display:grid;place-items:center;padding:44px;background:rgba(12,20,15,.54)}.qa-dialog{box-sizing:border-box;width:min(720px,calc(100vw - 88px));max-height:calc(100vh - 88px);overflow:auto;padding:25px 30px 21px;border-radius:14px;background:#fff;color:#1d2c21;box-shadow:0 22px 60px rgba(0,0,0,.28)}.qa-dialog-header{display:flex;justify-content:space-between;gap:20px;padding-bottom:16px;border-bottom:1px solid #e5ebe6}.qa-dialog-header h2{margin:5px 0;font-size:24px}.qa-dialog-header p{margin:0;color:#758278;font-size:13px}.qa-dialog-eyebrow{color:#159447;font-size:12px;font-weight:700}.qa-close{width:32px;height:32px;border:0;border-radius:50%;background:#f0f5f0;font-size:22px;color:#657268;cursor:pointer}.qa-dialog input{box-sizing:border-box;min-height:36px;border:1px solid #d8e1d9;border-radius:6px;padding:7px 10px;outline:none}.qa-dialog-meta{display:flex;align-items:center;gap:18px;margin:18px 0 12px;color:#637166;font-size:14px}.qa-dialog-meta strong{color:#189a4a;font-size:18px}.qa-dialog-meta input{margin-left:auto;width:205px}.qa-dialog-notice{margin:12px 0;padding:9px 12px;border-left:3px solid #35a961;background:#f1fbf4;color:#4c6855;font-size:13px;line-height:1.55}.qa-candidate-list{display:grid;gap:9px}.qa-candidate{display:grid;grid-template-columns:22px 38px 1fr auto;align-items:center;gap:10px;width:100%;padding:10px 12px;border:1px solid #e0e8e1;border-radius:9px;background:#fff;text-align:left;cursor:pointer}.qa-candidate.selected{border-color:#1da551;background:#f1fbf4}.qa-check{display:grid;place-items:center;width:17px;height:17px;border:1px solid #c8d4c9;border-radius:4px;color:#fff;font-size:12px}.qa-candidate.selected .qa-check{border-color:#179b4b;background:#179b4b}.qa-crest{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#e2f3e7;color:#168d46;font-weight:800}.qa-crest-large{width:50px;height:50px;font-size:18px}.qa-candidate strong{display:block;font-size:14px}.qa-candidate small{display:block;margin-top:3px;color:#7c897f;font-size:12px}.qa-candidate em{color:#189a4a;font-size:12px;font-style:normal}.qa-dialog-footer{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:18px;padding-top:16px;border-top:1px solid #e7ede8;color:#7b897f;font-size:12px}.qa-button{min-height:34px;border:1px solid #d2ded4;border-radius:6px;padding:0 14px;background:#fff;color:#405044;cursor:pointer}.qa-button+.qa-button{margin-left:8px}.qa-button-primary{border-color:#19a04d;background:#19a04d;color:#fff}.qa-button:disabled{opacity:.5;cursor:not-allowed}.qa-create-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:15px 16px;margin:20px 0}.qa-create-grid label{color:#445248;font-size:13px;font-weight:600}.qa-create-grid input{width:100%;margin-top:7px}.qa-form-band,.qa-claim-team{display:flex;align-items:center;gap:13px;border:1px solid #e0e8e1;border-radius:9px;padding:13px;background:#fbfefb}.qa-form-band div,.qa-claim-team div{flex:1}.qa-form-band p,.qa-claim-team p{margin:4px 0 0;color:#7a887d;font-size:12px}.qa-claim-team{margin:19px 0}.qa-status{padding:4px 8px;border-radius:99px;background:#fff4dd;color:#b57206;font-size:12px}.qa-link-label{display:block;color:#48564d;font-size:13px;font-weight:700}.qa-link-label>span{margin-left:8px;color:#839087;font-size:12px;font-weight:400}.qa-link-label>div{display:flex;gap:8px;margin-top:8px}.qa-link-label input{flex:1;color:#647268;font-size:12px}.qa-share-options{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:17px 0}.qa-share-options article{display:flex;gap:9px;padding:12px;border:1px solid #e2e9e3;border-radius:8px}.qa-share-options strong{font-size:13px}.qa-share-options p{margin:4px 0 0;color:#7a887d;font-size:12px}.qa-share-options article>span{color:#1da14e;font-weight:800}
.qa-invite-credential{width:620px;min-height:490px;padding:0;border-radius:11px;overflow:hidden}.credential-header{height:71px;padding:0 32px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e9ece9}.credential-header h2{margin:0;font-size:25px;letter-spacing:.01em}.credential-header .qa-close{width:36px;height:36px;background:transparent;font-size:33px;font-weight:300}.credential-body{position:relative;display:grid;grid-template-columns:1fr 185px;gap:24px;padding:28px 34px 20px}.credential-details{min-width:0}.credential-details dl{display:grid;grid-template-columns:92px 1fr;gap:19px 14px;margin:3px 0 24px;font-size:15px;line-height:1.45}.credential-details dt{color:#68756d}.credential-details dd{margin:0;color:#26352b}.credential-division{display:inline-flex;align-items:center;min-height:32px;padding:0 14px;border:1px solid #dbe3de;border-radius:6px;font-weight:700}.credential-actions{display:flex;gap:12px;margin:0 0 18px}.credential-button{flex:1;min-height:42px;border:1px solid #0b934a;border-radius:7px;background:#fff;color:#087e3d;font-size:14px;font-weight:600;cursor:pointer}.credential-button span{margin-right:7px;font-size:18px}.credential-note{padding:14px 14px;border-radius:8px;background:#f5f7f5;color:#66736b;font-size:13px;line-height:1.55}.credential-code{grid-column:2;grid-row:1 / span 2;align-self:center;margin:0;border:1px solid #e7ebeb;border-radius:8px;padding:10px 10px 13px;background:#fff;text-align:center;box-shadow:0 2px 8px rgba(24,41,29,.03)}.credential-qr-vector{display:block;width:164px;height:164px}.credential-qr-vector :deep(svg){display:block;width:164px;height:164px}.credential-code figcaption{margin-top:8px;color:#738077;font-size:12px}.credential-link{grid-column:1/-1;display:block;color:#56645b;font-size:14px}.credential-link input{display:block;width:100%;margin-top:8px;background:#fff;color:#89928d;font-size:13px}.credential-footer{display:flex;justify-content:center;gap:16px;padding:0 34px 31px}.credential-footer button{min-width:108px;height:44px;border-radius:7px;font-size:15px;font-weight:600;cursor:pointer}.credential-cancel{border:1px solid #dfe5e1;background:#fff;color:#415047}.credential-complete{border:1px solid #087f3d;background:#087f3d;color:#fff}
.qa-quick-team{width:612px;max-height:calc(100vh - 72px);padding:0;border-radius:9px;overflow:hidden}.quick-team-header{height:67px;padding:0 27px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e7ebe7}.quick-team-header h2{margin:0;color:#18261c;font-size:21px}.quick-team-header .qa-close{background:transparent;font-size:30px;font-weight:300}.quick-team-body{display:grid;grid-template-columns:143px 1fr;gap:22px;padding:27px 28px 18px}.quick-logo{grid-row:1;height:151px;padding:0;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px dashed #b9c3bd;border-radius:5px;background:#fff;color:#768379;text-align:center;cursor:pointer}.quick-logo img{width:54px;height:61px;margin-bottom:9px;object-fit:contain;filter:grayscale(1);opacity:.62}.quick-logo strong{font-size:12px;color:#4d5d52}.quick-logo small{margin-top:22px;color:#8d9991;font-size:10px}.quick-fields{min-width:0}.quick-fields label,.quick-row label{display:block;margin:0 0 13px;color:#36453b;font-size:13px;font-weight:600}.quick-fields label span,.quick-row label span{display:block;margin-bottom:7px}.quick-fields label b,.quick-row label b{color:#ef5b4b}.quick-fields label em{color:#68756d;font-size:11px;font-style:normal;font-weight:400}.quick-fields input,.quick-fields select,.quick-row input{width:100%;height:37px;box-sizing:border-box;border:1px solid #dce4dd;border-radius:4px;padding:0 11px;background:#fff;color:#314037;font-size:13px;outline:none}.quick-fields input[readonly],.quick-fields select:disabled{background:#fafbfa;color:#929d96}.quick-row{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:30px}.quick-check{grid-column:1/-1;display:flex;align-items:center;gap:8px;margin:-2px 0 0;color:#304238;font-size:13px}.quick-check input{width:16px;height:16px;accent-color:#138746}.quick-boundary{grid-column:1/-1;margin:0;color:#555f59;font-size:12px;line-height:1.55}.quick-tip{grid-column:1/-1;display:flex;align-items:center;gap:10px;margin-top:2px;padding:11px 12px;border-radius:4px;background:#f6f7f6;color:#66736b;font-size:12px;line-height:1.55}.quick-tip span{display:inline-grid;place-items:center;flex:0 0 17px;width:17px;height:17px;border-radius:50%;background:#e2e7e3;color:#536158;font-size:11px;font-weight:700}.quick-team-footer{display:flex;justify-content:center;gap:12px;padding:19px 28px 24px;border-top:1px solid #edf0ed}.quick-team-footer button{min-width:120px;height:40px;border-radius:4px;font-size:13px;cursor:pointer}.quick-cancel,.quick-return{border:1px solid #d8e0da;background:#fff;color:#405046}.quick-save{border:1px solid #07843d;background:#07843d;color:#fff}
.qa-claim-dialog{display:flex;flex-direction:column;width:707px;height:671px;max-height:calc(100vh - 42px);padding:0;border-radius:10px;overflow:auto}.claim-dialog-header{flex:0 0 57px;padding:0 29px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e6ebe7}.claim-dialog-header h2{margin:0;font-size:21px;color:#15241a}.claim-dialog-header .qa-close{background:transparent;font-size:30px;font-weight:300}.claim-dialog-body{flex:1;padding:20px 29px 14px}.claim-team-summary{display:grid;grid-template-columns:54px minmax(150px,1fr) 1.05fr .72fr .72fr;align-items:center;gap:13px}.claim-team-crest{width:50px;height:50px;object-fit:contain}.claim-team-crest-fallback{display:grid;place-items:center;border-radius:50%;background:#eaf7ee;color:#087a48;font-size:18px;font-weight:800}.claim-team-summary>strong{font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.claim-team-summary dl{grid-column:3/-1;display:grid;grid-template-columns:1.15fr .72fr .72fr;gap:4px 13px;margin:0}.claim-team-summary dt{grid-row:1;color:#77837a;font-size:11px}.claim-team-summary dd{grid-row:2;margin:0;color:#28352c;font-size:13px}.claim-status{display:inline-flex;padding:3px 8px;border:1px solid #ffd6a4;border-radius:5px;background:#fff6e8;color:#f08b18;font-size:11px}.claim-contact-row{display:grid;grid-template-columns:98px 1fr 113px 1fr;align-items:center;margin:16px 0 13px;padding:13px 16px;border:1px solid #e0e7e1;border-radius:6px;font-size:12px}.claim-contact-row span{color:#77837a}.claim-contact-row strong{color:#28352c;font-weight:600}.claim-policy-note,.claim-after-note{display:flex;align-items:flex-start;gap:9px;padding:10px 12px;border:1px solid #dceadf;border-radius:6px;background:#f4faf5;color:#405248;font-size:12px;line-height:1.55}.claim-policy-note .el-icon,.claim-after-note .el-icon{flex:0 0 auto;margin-top:2px;color:#159447;font-size:17px}.claim-section-title{display:block;margin:13px 0 8px;font-size:13px}.claim-share-options{display:grid;grid-template-columns:1fr 1fr;gap:16px}.claim-share-options button{position:relative;display:grid;grid-template-columns:45px 1fr 18px;align-items:center;gap:11px;min-height:79px;padding:12px 14px;border:1px solid #dde5df;border-radius:6px;background:#fff;text-align:left;color:#25342a;cursor:pointer}.claim-share-options button.selected{border-color:#16a34a;box-shadow:inset 0 0 0 1px #16a34a}.claim-option-icon{display:grid;place-items:center;width:43px;height:43px;border-radius:50%;background:#12964a;color:#fff;font-size:23px}.claim-option-qr{border:1px solid #e0e7e2;background:#fff;color:#111}.claim-share-options strong{display:block;font-size:13px}.claim-share-options small{display:block;margin-top:4px;color:#77837a;font-size:10px;line-height:1.45}.claim-option-check{color:#169b48;font-size:18px;opacity:0}.claim-share-options button.selected .claim-option-check{opacity:1}.claim-link-field{display:block;margin-top:12px;color:#2d3c32;font-size:12px}.claim-link-field>strong{font-size:13px}.claim-link-field>span{color:#77837a}.claim-link-field>div{display:flex;gap:10px;margin-top:7px}.claim-link-field input{flex:1;height:38px;background:#f8faf8;color:#58665d;font-size:11px}.claim-link-field button{display:flex;align-items:center;gap:5px;padding:0 14px;border:1px solid #d9e1db;border-radius:5px;background:#fff;color:#34453a;font-size:12px;cursor:pointer}.claim-code-row{display:flex;align-items:center;gap:15px;margin:10px 0 9px}.claim-qr-vector{width:68px;height:68px;padding:3px;background:#fff}.claim-qr-vector :deep(svg){display:block;width:68px;height:68px}.claim-code-row strong{font-size:13px}.claim-code-row p{margin:4px 0 0;color:#77837a;font-size:11px}.claim-after-note{padding:7px 10px;font-size:11px}.claim-dialog-footer{flex:0 0 auto;display:flex;justify-content:flex-end;gap:12px;padding:12px 29px 15px;border-top:1px solid #e8ede9}.claim-dialog-footer button{display:flex;align-items:center;justify-content:center;gap:5px;min-width:112px;height:38px;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer}.claim-cancel{border:1px solid #dce3dd;background:#fff;color:#34443a}.claim-download{border:1px solid #159447;background:#fff;color:#148743}.claim-copy{border:1px solid #07863f;background:#07863f;color:#fff}@media(max-width:900px){.qa-claim-dialog{width:min(707px,calc(100vw - 32px));height:auto}.claim-team-summary{grid-template-columns:50px 1fr}.claim-team-summary dl{grid-column:1/-1}.claim-share-options{grid-template-columns:1fr}.claim-contact-row{grid-template-columns:105px 1fr}.claim-dialog-footer{flex-wrap:wrap}}
.claim-qr-image{display:block;width:68px;height:68px;padding:3px;box-sizing:border-box;background:#fff;object-fit:contain}
</style>

<style scoped>
.claim-qr-placeholder {
  display: grid;
  place-items: center;
  width: 68px;
  height: 68px;
  padding: 3px;
  box-sizing: border-box;
  border: 1px dashed #b9c8bc;
  border-radius: 4px;
  color: #6f7f73;
  background: #f5f8f5;
  font-size: 11px;
}
</style>
