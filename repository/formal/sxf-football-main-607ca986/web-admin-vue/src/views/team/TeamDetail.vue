<template>
  <div class="team-detail">
    <el-page-header v-if="!sourceTournamentId" @back="goBack" :title="backTitle" />

    <template v-if="sourceTournamentId">
      <header class="tournament-team-context">
        <div class="context-event">
          <img :src="tournamentLogoUrl" alt="赛事标识" />
          <strong>{{ tournamentContext.name || '当前赛事' }}</strong>
          <el-tag type="primary" effect="plain">{{ tournamentContext.divisions?.length || 1 }}个组别</el-tag>
          <el-tag type="success" effect="plain">{{ tournamentContext.status === 'completed' ? '已结束' : '进行中' }}</el-tag>
          <span class="event-context-divider"></span>
          <span class="event-context-meta">{{ tournamentDateRange }}</span>
          <span class="event-context-meta">{{ tournamentContext.province || '赛事地点待定' }}</span>
        </div>
          <el-button type="success" plain @click="router.push('/tournament-space')"><el-icon><SwitchButton /></el-icon>退出赛事空间</el-button>
      </header>

      <main class="tournament-team-detail">
        <nav v-if="isProfessionalTournamentTeam" class="professional-team-tabs" aria-label="球队管理工作区">
          <button class="active" type="button" @click="goBack">参赛球队 <strong>32</strong></button>
          <button type="button" @click="router.push({ path: `/tournaments/${sourceTournamentId}/teams`, query: { divisionId: sourceDivisionId, mode: 'professional', tab: 'pending' } })">加入申请 <strong>12</strong></button>
          <button type="button" @click="openTournamentRoster">参赛名单 <strong>684</strong></button>
          <button type="button" @click="router.push({ path: `/tournaments/${sourceTournamentId}/teams`, query: { divisionId: sourceDivisionId, mode: 'professional', tab: 'abnormal' } })">名单异常 <strong class="warning">12</strong></button>
          <button type="button" @click="router.push({ path: `/tournaments/${sourceTournamentId}/teams`, query: { divisionId: sourceDivisionId, mode: 'professional', tab: 'cancel_requested' } })">名单变更 <strong>3</strong></button>
        </nav>
        <div class="detail-heading">
          <div><h1>球队详情</h1></div>
          <div class="detail-heading-actions"><el-button type="success" plain @click="openExportDialog"><el-icon><Download /></el-icon>导出球队资料</el-button><el-button v-if="isReadOnlyTournament" type="success" plain :loading="loading || playerStatsLoading" @click="openRosterPoster"><el-icon><Picture /></el-icon>球队名单海报</el-button><el-button type="primary" plain @click="editTeam">编辑球队</el-button><el-button type="success" plain @click="goBack"><el-icon><Back /></el-icon>返回参赛球队</el-button></div>
        </div>

        <section class="team-event-summary">
          <div class="summary-identity">
            <img :src="teamLogoDisplayUrl" alt="球队队徽" />
            <strong>{{ team.name || '未命名球队' }}</strong>
          </div>
          <dl><dt>赛事参赛编号</dt><dd>{{ tournamentParticipationCode }}</dd></dl>
          <dl><dt>所属组别</dt><dd>{{ tournamentRelation.divisionName || sourceDivisionId || '当前组别' }}</dd></dl>
          <dl><dt>加入来源</dt><dd class="link">{{ tournamentJoinSource }}</dd></dl>
          <dl><dt>认领状态</dt><dd><el-tag type="success">{{ team.ownerId || team.coachId ? '已认领' : '已关联' }}</el-tag></dd></dl>
          <dl><dt>参赛确认</dt><dd><el-tag type="success">{{ tournamentRelation.status === 'approved' ? '已确认' : '待确认' }}</el-tag></dd></dl>
        </section>

        <div class="team-detail-grid">
          <section class="detail-panel team-materials">
            <h2><el-icon><Tickets /></el-icon>球队赛事资料</h2>
            <dl><dt>赛事球队名称</dt><dd>{{ team.name || '—' }}</dd></dl>
            <dl><dt>球队队徽</dt><dd><img :src="teamLogoDisplayUrl" alt="队徽" /></dd></dl>
            <dl><dt>球队负责人</dt><dd>{{ tournamentContactName }}</dd></dl>
            <dl><dt>联系方式</dt><dd>{{ maskedPhone }}</dd></dl>
          </section>
          <section class="detail-panel collaboration-status">
            <h2><el-icon><UserFilled /></el-icon>小程序协作状态</h2>
            <dl><dt>认领时间</dt><dd>{{ formatTournamentTime(tournamentRelation.claimedAt || tournamentRelation.approveTime) }}</dd></dl>
            <dl><dt>最近活跃时间</dt><dd>{{ formatTournamentTime(team.lastActiveAt || team.updateTime) }}</dd></dl>
          </section>
          <section class="detail-panel match-summary">
            <h2><el-icon><Histogram /></el-icon>{{ isProfessionalTournamentTeam ? '专业版赛事协作' : '基础版比赛数据' }}</h2>
            <template v-if="isProfessionalTournamentTeam"><div class="professional-roster-stats"><article><span>已提交</span><strong>23</strong><small>人</small></article><article><span>已审核</span><strong>23</strong><small>人</small></article><article class="pending"><span>资料待补充</span><strong>0</strong><small>人</small></article></div><div class="professional-team-actions"><el-button type="success" plain @click="openTournamentRoster"><el-icon><Tickets /></el-icon>查看参赛名单</el-button><el-button v-if="!isReadOnlyTournament" type="success" @click="sendTournamentNotification"><el-icon><Bell /></el-icon>发送赛事通知</el-button></div></template>
            <template v-else>
            <div class="match-stats"><dl><dt>比赛场次</dt><dd>{{ teamMatchStats.total }}</dd></dl><dl><dt>胜场</dt><dd>{{ teamMatchStats.wins }}</dd></dl><dl><dt>平场</dt><dd>{{ teamMatchStats.draws }}</dd></dl><dl><dt>负场</dt><dd>{{ teamMatchStats.losses }}</dd></dl></div>
            <div class="match-stats lower"><dl><dt>进球数</dt><dd>{{ teamMatchStats.goalsFor }}</dd></dl><dl><dt>失球数</dt><dd>{{ teamMatchStats.goalsAgainst }}</dd></dl></div>
            </template>
          </section>
        </div>
        <section v-if="!isTournamentStaff" class="team-access-panel">
          <header>
            <div><h2>球队管理权限</h2><p>主账号负责球队管理，其他账号按分配权限协作。</p></div>
            <el-button v-if="!isReadOnlyTournament" type="primary" plain @click="openTeamAccess"><el-icon><Plus /></el-icon>分配账号</el-button>
          </header>
          <el-table :data="teamAccessRows" v-loading="teamAccessLoading" empty-text="暂未分配球队管理账号" class="team-access-table">
            <el-table-column prop="roleLabel" label="身份" width="120" />
            <el-table-column prop="name" label="姓名" min-width="140" />
            <el-table-column label="手机号" min-width="160"><template #default="{ row }">{{ row.phone || '—' }}</template></el-table-column>
            <el-table-column label="账号关系" width="150"><template #default="{ row }"><el-tag :type="row.accountType === 'owner' ? 'success' : (row.accountType === 'pending_owner' ? 'warning' : 'info')" size="small">{{ row.accountType === 'owner' ? '主账号' : (row.accountType === 'pending_owner' ? '待接收主账号' : '协作账号') }}</el-tag></template></el-table-column>
            <el-table-column label="状态" width="120"><template #default="{ row }"><el-tag :type="row.status === '主账号' || row.status === '已加入' ? 'success' : 'warning'" effect="plain" size="small">{{ row.status || '待授权' }}</el-tag></template></el-table-column>
            <el-table-column v-if="!isReadOnlyTournament" label="操作" width="110" align="center"><template #default="{ row }"><el-button link type="danger" :loading="teamAccessDeletingRole === row.role" :disabled="row.accountType === 'owner'" @click="deleteTeamAccess(row)">删除权限</el-button></template></el-table-column>
          </el-table>
        </section>
        <section class="team-kit-panel">
          <header><div><h2>比赛服颜色</h2><p>设置球队常用主、备用比赛服；单场比赛可根据撞色情况另行调整，历史比赛快照不会被覆盖。</p></div><el-button v-if="!isReadOnlyTournament" type="success" :loading="kitSaving" @click="saveTeamKitColors">保存颜色设置</el-button></header>
          <div class="kit-set-grid">
            <article v-for="kit in kitSets" :key="kit.key" class="kit-set-card">
              <div class="kit-set-title"><span>{{ kit.badge }}</span><div><strong>{{ kit.label }}</strong><small>{{ kit.description }}</small></div></div>
              <div class="kit-equipment-grid">
                <label v-for="equipment in kitEquipment" :key="equipment.key" class="kit-equipment-item">
                  <span class="kit-image-stage"><i class="kit-silhouette" :class="equipment.key" :style="kitShapeStyle(equipment.key, kitForm[kit.key][equipment.key])"></i></span>
                  <strong>{{ equipment.label }}</strong>
                  <el-select v-model="kitForm[kit.key][equipment.key]" :aria-label="`${kit.label}${equipment.label}颜色`" @change="clearKitSourceLabel(kit.key, equipment.key)">
                    <el-option v-for="color in kitColorOptions" :key="color.value" :label="color.label" :value="color.value"><span class="kit-color-option"><i :style="{backgroundColor:color.value}"></i>{{ color.label }}</span></el-option>
                  </el-select>
                  <small v-if="kitSourceLabel(kit.key, equipment.key)" class="kit-source-label">报名表：{{ kitSourceLabel(kit.key, equipment.key) }}</small>
                </label>
              </div>
            </article>
          </div>
          <footer><el-icon><InfoFilled /></el-icon>颜色用于球队默认资料和赛前辨色；正式比赛仍以该场主客队实际穿着及裁判确认结果为准。</footer>
        </section>
        <section class="synthetic-player-panel staff-roster-panel">
          <div class="synthetic-player-heading"><div><h2>工作人员</h2><p>共 {{ staffMembers.length }} 人；兼项人员同时保留工作人员和球员资料。</p></div><el-button v-if="!isReadOnlyTournament" type="primary" plain @click="openAddStaff"><el-icon><Plus /></el-icon>添加工作人员</el-button></div>
          <el-table :data="staffMembers" v-loading="loading" empty-text="暂无工作人员资料" class="synthetic-player-table">
            <el-table-column label="头像" width="72" align="center"><template #default="{ row }"><img v-if="row.photoUrl && !playerAvatarErrors.has(row._id)" :src="row.photoUrl" class="player-avatar-img" alt="" @error="markPlayerAvatarFailed(row)" /><el-avatar v-else :size="36">{{ row.name ? row.name[0] : '?' }}</el-avatar></template></el-table-column>
            <el-table-column prop="name" label="姓名" min-width="130" />
            <el-table-column label="球衣名" min-width="125"><template #default="{ row }">{{ displayJerseyName(row) }}</template></el-table-column>
            <el-table-column label="职务" min-width="130"><template #default="{ row }">{{ row.role || row.type || '工作人员' }}<el-tag v-if="row.isAlsoPlayer || row.dualRoleLabel" size="small" type="warning" class="dual-role-tag">兼球员</el-tag></template></el-table-column>
            <el-table-column label="出生日期" width="130"><template #default="{ row }">{{ row.birthDate || '—' }}</template></el-table-column>
            <el-table-column label="籍贯" min-width="150"><template #default="{ row }">{{ row.nativePlace || '—' }}</template></el-table-column>
          </el-table>
        </section>
        <section class="synthetic-player-panel">
          <div class="synthetic-player-heading">
            <div><h2>{{ isTeamDataWorkspace ? '球员参赛数据' : (isSyntheticTeam ? '虚拟球员资料' : '球员') }}</h2><p v-if="isTeamDataWorkspace">本届累计 · {{ tournamentPlayerRows.length }} 人 · 已确认赛果</p><p v-else>本届共 {{ players.length }} 名球员；未完成人证核验不能进入比赛阵容。</p></div>
            <el-button v-if="!isTeamDataWorkspace" type="primary" plain @click="openAddPlayer"><el-icon><Plus /></el-icon>添加球员</el-button>
            <el-tag v-if="isSyntheticTeam" type="warning" effect="plain">合成测试数据</el-tag>
          </div>
          <el-alert v-if="isTeamDataWorkspace && playerStatsError" :title="playerStatsError" type="error" :closable="false"><el-button link type="primary" @click="loadPlayerCompetitionData">重新加载</el-button></el-alert>
          <el-table :data="isTeamDataWorkspace ? sortedTournamentPlayerRows : players" :fit="!isTeamDataWorkspace" v-loading="loading || playerStatsLoading" empty-text="暂无球员资料" class="synthetic-player-table" :class="{ 'tournament-player-data-table': isTeamDataWorkspace }" @row-click="viewPlayerCard" @sort-change="onTournamentPlayerSort">
            <el-table-column label="头像" :width="isTeamDataWorkspace ? 56 : 72" align="center">
              <template #default="{ row }"><img v-if="row.photoUrl && !playerAvatarErrors.has(row._id)" :src="row.photoUrl" class="player-avatar-img" alt="" @error="markPlayerAvatarFailed(row)" /><el-avatar v-else :size="36">{{ row.name ? row.name[0] : '?' }}</el-avatar></template>
            </el-table-column>
            <el-table-column prop="name" label="姓名" :sortable="isTeamDataWorkspace ? 'custom' : false" :width="isTeamDataWorkspace ? 100 : undefined" min-width="110" show-overflow-tooltip />
            <el-table-column prop="jerseyName" label="球衣名" :sortable="isTeamDataWorkspace ? 'custom' : false" :width="isTeamDataWorkspace ? 125 : undefined" min-width="125" show-overflow-tooltip><template #default="{ row }">{{ displayJerseyName(row) }}</template></el-table-column>
            <el-table-column prop="identityLabel" label="身份" :sortable="isTeamDataWorkspace ? 'custom' : false" width="120" align="center"><template #default="{ row }"><el-tag size="small" :type="playerIdentityLabel(row) === '球员' ? 'info' : 'warning'">{{ playerIdentityLabel(row) }}</el-tag></template></el-table-column>
            <el-table-column v-if="isSyntheticTeam" prop="playerId" label="球员编号" min-width="150" />
            <el-table-column prop="jerseyNumber" label="球衣号码" :sortable="isTeamDataWorkspace ? 'custom' : false" width="90" align="center"><template #default="{ row }">{{ row.jerseyNumber || '—' }}</template></el-table-column>
            <el-table-column prop="position" label="位置" :sortable="isTeamDataWorkspace ? 'custom' : false" :width="isTeamDataWorkspace ? 68 : 100" align="center"><template #default="{ row }"><el-tag size="small" :type="getPositionType(row.position)">{{ getPositionLabel(row.position) }}</el-tag></template></el-table-column>
            <el-table-column v-if="!isTeamDataWorkspace" label="籍贯" min-width="150"><template #default="{ row }">{{ row.nativePlace || '—' }}</template></el-table-column>
            <el-table-column v-if="!isTeamDataWorkspace" label="出生年月日" width="130" align="center"><template #default="{ row }">{{ row.birthDate || '—' }}</template></el-table-column>
            <el-table-column prop="age" label="年龄" :sortable="isTeamDataWorkspace ? 'custom' : false" :width="isTeamDataWorkspace ? 65 : 80" align="center"><template #default="{ row }">{{ row.birthDate ? calculateAge(row.birthDate) : '—' }}</template></el-table-column>
            <el-table-column v-if="!isTeamDataWorkspace" label="资料状态" width="110" align="center"><template #default="{ row }"><el-tag :type="playerProfileTagType(row)" size="small">{{ playerProfileLabel(row) }}</el-tag></template></el-table-column>
            <el-table-column v-if="!isTeamDataWorkspace" label="主办方审核" width="120" align="center"><template #default="{ row }"><el-tag v-if="playerOrganizerReviewStatus(row) === 'approved'" type="success" size="small">已审核</el-tag><el-button v-else link type="warning" :loading="playerReviewingId === row._id" @click.stop="reviewPlayer(row)">审核</el-button></template></el-table-column>
            <template v-if="isTeamDataWorkspace">
              <el-table-column prop="appearances" label="出场场次" sortable="custom" :sort-orders="['descending', 'ascending', null]" width="90" align="center"><template #default="{ row }">{{ statValue(row, 'appearances') }}</template></el-table-column>
              <el-table-column prop="minutes" label="出场时间" sortable="custom" :sort-orders="['descending', 'ascending', null]" width="105" align="center"><template #default="{ row }">{{ statValue(row, 'minutes') }}{{ statValue(row, 'minutes') === '—' ? '' : ' 分钟' }}</template></el-table-column>
              <el-table-column prop="goals" label="进球" sortable="custom" :sort-orders="['descending', 'ascending', null]" width="65" align="center"><template #default="{ row }">{{ statValue(row, 'goals') }}</template></el-table-column>
              <el-table-column prop="yellowCards" label="黄牌" sortable="custom" :sort-orders="['descending', 'ascending', null]" width="65" align="center"><template #default="{ row }">{{ statValue(row, 'yellowCards') }}</template></el-table-column>
              <el-table-column prop="redCards" label="红牌" sortable="custom" :sort-orders="['descending', 'ascending', null]" width="65" align="center"><template #default="{ row }">{{ statValue(row, 'redCards') }}</template></el-table-column>
              <el-table-column label="操作" width="65" align="center"><template #default="{ row }"><el-button link type="primary" @click.stop="viewPlayerCard(row)">查看</el-button></template></el-table-column>
            </template>
            <el-table-column v-else label="操作" width="145" align="center"><template #default="{ row }"><el-button link type="primary" @click.stop="editPlayer(row)">编辑</el-button><el-button link type="danger" @click.stop="deletePlayer(row)">删除</el-button></template></el-table-column>
          </el-table>
        </section>
        <section v-if="isReadOnlyTournament" class="tournament-history-panel">
          <header class="tournament-history-heading"><div><h2>历史记录</h2><p>仅展示当前赛事球队的比赛与纪律数据，不修改历史快照。</p></div></header>
          <div class="tournament-history-grid">
            <article class="history-card"><h3>红黄牌记录</h3><el-table :data="playerDisciplineHistory" size="small" empty-text="暂无红黄牌记录"><el-table-column prop="name" label="球员" min-width="120" /><el-table-column prop="yellowCards" label="黄牌" width="80" align="center" /><el-table-column prop="redCards" label="红牌" width="80" align="center" /></el-table></article>
            <article class="history-card"><h3>比赛时间记录</h3><el-table :data="matchHistoryRows" size="small" empty-text="暂无比赛记录"><el-table-column prop="dateTime" label="比赛时间" width="150" /><el-table-column prop="opponent" label="对手" min-width="130" /><el-table-column prop="score" label="比分" width="80" align="center" /><el-table-column prop="status" label="状态" width="90" align="center" /></el-table></article>
          </div>
        </section>
        <section v-if="!isTeamDataWorkspace && importedDraftPlayers.length" class="synthetic-player-panel imported-draft-player-panel">
          <div class="synthetic-player-heading"><div><h2>报名表导入资料</h2><p>共 {{ importedDraftPlayers.length }} 人；历史导入资料先在此保留，确认后进入正式球员库。</p></div><el-tag type="info" effect="plain">导入记录</el-tag></div>
          <el-table :data="importedDraftPlayers" class="synthetic-player-table">
            <el-table-column label="姓名" prop="name" min-width="110" />
            <el-table-column label="球衣名" min-width="125"><template #default="{ row }">{{ displayJerseyName(row) }}</template></el-table-column>
            <el-table-column label="身份" width="120" align="center"><template #default="{ row }"><el-tag size="small" :type="playerIdentityLabel(row) === '球员' ? 'info' : 'warning'">{{ playerIdentityLabel(row) }}</el-tag></template></el-table-column>
            <el-table-column label="球衣号码" width="90" align="center"><template #default="{ row }">{{ row.jerseyNumber || '—' }}</template></el-table-column>
            <el-table-column label="出生日期" width="130" align="center"><template #default="{ row }">{{ row.birthDate || '—' }}</template></el-table-column>
            <el-table-column label="身份证" min-width="140"><template #default="{ row }">{{ row.identityMasked || '—' }}</template></el-table-column>
            <el-table-column label="并入状态" width="130" align="center"><template #default="{ row }"><el-tag size="small" :type="row.reviewStatus === 'conflict' ? 'danger' : (row.reviewStatus === 'confirmed' ? 'success' : 'info')">{{ row.reviewStatus === 'conflict' ? '资料冲突' : (row.reviewStatus === 'confirmed' ? '已入正式名单' : '历史导入') }}</el-tag></template></el-table-column>
          </el-table>
        </section>
        <section v-if="isProfessionalTournamentTeam" class="collaboration-timeline"><h2>协作流程进度</h2><ol><li v-for="step in professionalTimeline" :key="step.title"><span><el-icon><CircleCheckFilled /></el-icon></span><div><strong>{{ step.title }}</strong><time>{{ step.time }}</time><small>{{ step.description }}</small></div></li></ol></section>
        <el-button v-else class="view-results" type="success" plain @click="openTournamentMatches"><el-icon><SwitchButton /></el-icon>查看赛程赛果</el-button>
        <el-alert v-if="!isTeamDataWorkspace" title="报名表上传成功后直接形成本届正式名单；球员仍须完成人证核验后才能进入比赛阵容。" type="success" :closable="false" show-icon />
      </main>
    </template>

    <!-- 球队基本信息 -->
    <div v-if="!sourceTournamentId" class="page-card" style="margin-top: 20px;">
      <div class="page-header" style="justify-content: space-between;">
        <h2>球队详情</h2>
        <el-button type="primary" size="small" @click="editTeam">编辑球队</el-button>
      </div>
      <div class="team-info-header">
        <div class="team-logo-wrapper">
          <el-avatar :size="100" :src="teamLogoDisplayUrl" shape="square" style="background-color: #fff; color: #909399; border: 1px solid #ebeef5;">
            {{ team.name ? team.name[0] : '?' }}
          </el-avatar>
          <!-- AI生成队徽按钮 -->
          <AIImageGenerator
            type="teamLogo"
            :name="team.name"
            :color="team.color || 'blue'"
            class="ai-logo-btn"
            @success="handleAISuccess"
          />
        </div>
        <div class="team-meta">
          <h2>{{ team.name }}</h2>
          <div class="team-meta-row">
            <span class="meta-item">成立时间: {{ team.establishedDate || '-' }}</span>
            <span class="meta-item">球员: {{ players.length }}人</span>
          </div>
          <div class="team-meta-row">
            <span class="meta-item">简称: {{ team.shortName || '-' }}</span>
          </div>

        </div>
      </div>
    </div>

    <!-- 球员列表 -->
    <div v-if="!sourceTournamentId" class="page-card" style="margin-top: 16px;">
      <div class="page-header">
        <h2>球员阵容</h2>
        <div style="display: flex; gap: 8px;">
          <el-button
            type="danger"
            plain
            size="small"
            :loading="clearingPlayers"
            :disabled="players.length === 0"
            @click="clearPlayerRoster"
          >
            <el-icon><Delete /></el-icon>清空球员名单
          </el-button>
          <el-button type="success" size="small" @click="showBatchImport = true">
            <el-icon><Download /></el-icon>批量导入名单
          </el-button>
          <el-button type="warning" size="small" @click="showBatchAvatarImport = true">
            <el-icon><Upload /></el-icon>批量导入头像
          </el-button>
          <el-button type="primary" size="small" @click="showAddPlayer = true">
            <el-icon><Plus /></el-icon>添加球员
          </el-button>
        </div>
      </div>

      <el-table
        :data="players"
        v-loading="loading"
        style="width: 100%"
        empty-text="暂无球员"
        @row-click="viewPlayerCard"
        class="player-table"
      >
        <!-- 号码 -->
        <el-table-column label="号码" width="60" align="center">
          <template #default="{ row }">
            <span class="jersey-number">{{ row.jerseyNumber || '-' }}</span>
          </template>
        </el-table-column>
        <!-- 头像 -->
        <el-table-column prop="playerId" label="球员ID" width="140" />
        <el-table-column label="头像" width="60" align="center">
          <template #default="{ row }">
            <img
              v-if="row.photoUrl"
              :src="row.photoUrl"
              class="player-avatar-img"
              alt="头像"
            />
            <el-avatar v-else :size="36" style="background-color: #fff; color: #909399; border: 1px solid #ebeef5;">{{ row.name ? row.name[0] : '?' }}</el-avatar>
          </template>
        </el-table-column>
        <!-- 姓名 -->
        <el-table-column prop="name" label="姓名" width="80" />
          <el-table-column prop="_importKindLabel" label="人员类型" width="80" align="center" />
        <!-- 位置 -->
        <el-table-column label="位置" width="70" align="center">
          <template #default="{ row }">
            <el-tag :type="getPositionType(row.position)" size="small" style="white-space: nowrap;">{{ getPositionLabel(row.position) }}</el-tag>
          </template>
        </el-table-column>
        <!-- 球衣名 -->
        <el-table-column label="球衣名" width="110" align="center">
          <template #default="{ row }">
            <span style="white-space: nowrap; font-size: 12px;">{{ row.jerseyName || '-' }}</span>
          </template>
        </el-table-column>
        <!-- 年龄 -->
        <el-table-column label="年龄" width="60" align="center">
          <template #default="{ row }">
            <span>{{ row.birthDate ? calculateAge(row.birthDate) : '-' }}</span>
          </template>
        </el-table-column>
        <!-- 出场次数/时间 -->
        <el-table-column width="130" align="center">
          <template #header>
            <span style="white-space: nowrap;">出场次数/时间</span>
          </template>
          <template #default="{ row }">
            <span style="color: #909399;">-</span>
          </template>
        </el-table-column>
        <!-- 进球 -->
        <el-table-column label="进球" width="60" align="center">
          <template #default="{ row }">
            {{ row.goals || 0 }}
          </template>
        </el-table-column>
        <!-- 红黄牌 -->
        <el-table-column width="80" align="center">
          <template #header>
            <span style="white-space: nowrap;">红/黄牌</span>
          </template>
          <template #default="{ row }">
            <span style="color: #f56c6c;">{{ row.redCards || 0 }}</span>
            <span style="margin: 0 2px;">/</span>
            <span style="color: #e6a23c;">{{ row.yellowCards || 0 }}</span>
          </template>
        </el-table-column>
        <!-- 操作 -->
        <el-table-column label="操作" width="100" align="center">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click.stop="editPlayer(row)">编辑</el-button>
            <el-button type="danger" link size="small" @click.stop="removePlayer(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 添加/编辑球员对话框 -->
    <el-dialog
      v-model="showAddPlayer"
      :title="isEditingPlayer ? '编辑球员' : '添加球员'"
      width="700px"
      :close-on-click-modal="false"
    >
      <!-- 新增模式：选项卡 -->
      <el-tabs v-if="!isEditingPlayer" v-model="activeTab" type="border-card" class="player-tabs">
        <el-tab-pane label="手动新建" name="manual">
          <div class="tab-content">
<el-form :model="playerForm" label-width="100px">
            <!-- 第一行：姓名 + 身份证号（核心信息放最前） -->
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="姓名" required>
                  <el-input
                    v-model="playerForm.name"
                    placeholder="请输入姓名"
                    @input="onNameInput"
                  />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="身份证号" required>
                  <el-input
                    v-model="playerForm.idCard"
                    placeholder="18位身份证号"
                    maxlength="18"
                    @input="onIdCardInput"
                  />
                </el-form-item>
              </el-col>
            </el-row>

            <!-- 第二行：自动生成的信息 -->
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="球衣姓名">
                  <el-input
                    v-model="playerForm.jerseyName"
                    placeholder="自动根据姓名生成，可手动修改"
                  >
                    <template #suffix>
                      <el-tooltip content="格式：ZHENG X.（二字）或 ZHENG X.S.（三字），ZH/CH/SH保留双字母">
                        <el-icon><Info-Filled /></el-icon>
                      </el-tooltip>
                    </template>
                  </el-input>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="平台年龄">
                  <el-input
                    v-model="displayAge"
                    placeholder="根据身份证号计算"
                    readonly
                  >
                    <template #suffix>
                      <el-tooltip content="根据身份证号出生日期计算实际年龄">
                        <el-icon><Info-Filled /></el-icon>
                      </el-tooltip>
                    </template>
                  </el-input>
                </el-form-item>
              </el-col>
            </el-row>

            <!-- 第三行：身份证解析的信息 -->
            <el-row :gutter="16">
              <el-col :span="8">
                <el-form-item label="出生日期">
                  <el-input
                    v-model="playerForm.birthDate"
                    placeholder="自动识别"
                    readonly
                  />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="籍贯">
                  <el-input v-model="playerForm.nativePlace" placeholder="自动识别" readonly />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="性别">
                  <el-select v-model="playerForm.gender" style="width: 100%">
                    <el-option label="男" value="male" />
                    <el-option label="女" value="female" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>

            <!-- 通讯地址 -->
            <el-row :gutter="16">
              <el-col :span="24">
                <el-form-item label="通讯地址">
                  <div class="address-row">
                    <el-select v-model="playerForm.province" placeholder="省" style="width: 110px" @change="onProvinceChange">
                      <el-option v-for="p in provinces" :key="p.code" :label="p.name" :value="p.code" />
                    </el-select>
                    <el-select v-model="playerForm.city" placeholder="市" style="width: 110px" :disabled="!playerForm.province" @change="onCityChange">
                      <el-option v-for="c in cities" :key="c.code" :label="c.name" :value="c.code" />
                    </el-select>
                    <el-select v-model="playerForm.district" placeholder="区" style="width: 110px" :disabled="!playerForm.city">
                      <el-option v-for="d in districts" :key="d.code" :label="d.name" :value="d.code" />
                    </el-select>
                  </div>
                </el-form-item>
                <el-form-item label=" " class="address-detail-item">
                  <el-input v-model="playerForm.addressDetail" placeholder="详细地址" />
                </el-form-item>
              </el-col>
            </el-row>

            <!-- 第四行：球衣信息 -->
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="球衣号" required>
                  <el-input-number v-model="playerForm.jerseyNumber" :min="1" :max="99" style="width: 100%" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="位置" required>
                  <el-select v-model="playerForm.position" placeholder="请选择位置" style="width: 100%">
                    <el-option label="守门员 GK" value="GK" />
                    <el-option label="后卫 DF" value="DF" />
                    <el-option label="前卫 MF" value="MF" />
                    <el-option label="前锋 FW" value="FW" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>

            <!-- 第五行：国籍 -->
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="国籍">
                  <el-input v-model="playerForm.nationality" placeholder="默认：中国" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="服装尺码">
                  <el-select v-model="playerForm.clothingSize" placeholder="选择尺码" style="width: 100%">
                    <el-option v-for="s in ['S','M','L','XL','XXL','XXXL']" :key="s" :label="s" :value="s" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>

            <!-- 第六行：身高体重 -->
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="身高(cm)">
                  <el-input-number v-model="playerForm.height" :min="100" :max="250" style="width: 100%" placeholder="身高" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="体重(kg)">
                  <el-input-number v-model="playerForm.weight" :min="30" :max="150" style="width: 100%" placeholder="体重" />
                </el-form-item>
              </el-col>
            </el-row>

            <el-divider content-position="left">联系方式</el-divider>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="联系人">
                  <el-input v-model="playerForm.contactName" placeholder="联系人姓名" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="联系电话">
                  <el-input v-model="playerForm.contactPhone" placeholder="电话号码" />
                </el-form-item>
              </el-col>
            </el-row>
            <!-- 身份证照片上传 -->
            <!-- 球员照片上传（带裁剪和抠图） -->
            <el-divider content-position="left">球员照片（必填）</el-divider>
            <el-row :gutter="16">
              <el-col :span="24">
                <el-form-item label="球员照片" required>
                  <div class="player-photo-section">
                    <AvatarCropper
                      v-if="!playerForm.photoUrl"
                      @success="handleAvatarCropSuccess"
                    />
                    <div v-else class="photo-preview-wrapper">
                      <img :src="playerForm.photoUrl" class="photo-preview-img" />
                      <el-button size="small" type="danger" @click="playerForm.photoUrl = ''">
                        重新上传
                      </el-button>
                    </div>
                  </div>
                </el-form-item>
              </el-col>
            </el-row>

            <el-divider content-position="left">身份证照片（非必填）</el-divider>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="身份证正面">
                  <div class="idcard-upload">
                    <el-upload
                      class="idcard-uploader"
                      :show-file-list="false"
                      :before-upload="beforePhotoUpload"
                      :http-request="(opts) => handleIdCardUpload(opts, 'front')"
                      accept="image/*"
                    >
                      <div v-if="playerForm.idCardFront" class="idcard-preview">
                        <img :src="playerForm.idCardFront" />
                      </div>
                      <div v-else class="idcard-placeholder">
                        <el-icon :size="24"><Plus /></el-icon>
                        <span>点击上传正面</span>
                      </div>
                    </el-upload>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="身份证反面">
                  <div class="idcard-upload">
                    <el-upload
                      class="idcard-uploader"
                      :show-file-list="false"
                      :before-upload="beforePhotoUpload"
                      :http-request="(opts) => handleIdCardUpload(opts, 'back')"
                      accept="image/*"
                    >
                      <div v-if="playerForm.idCardBack" class="idcard-preview">
                        <img :src="playerForm.idCardBack" />
                      </div>
                      <div v-else class="idcard-placeholder">
                        <el-icon :size="24"><Plus /></el-icon>
                        <span>点击上传反面</span>
                      </div>
                    </el-upload>
                  </div>
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
          </div>
        </el-tab-pane>

        <el-tab-pane v-if="!isTournamentStaff" label="从库中选择" name="library">
          <div class="tab-content">
            <!-- 搜索栏 -->
            <div class="library-search">
              <el-input v-model="libraryKeyword" placeholder="搜索姓名/身份证号" clearable @clear="loadPlayerLibrary" @keyup.enter="loadPlayerLibrary">
                <template #append>
                  <el-button :icon="Search" @click="loadPlayerLibrary" />
                </template>
              </el-input>
              <el-button size="small" :icon="Refresh" circle @click="loadPlayerLibrary(true)" title="刷新球员库" />
            </div>
            <!-- 球员库列表 -->
            <el-table
              :data="playerLibraryList"
              v-loading="libraryLoading"
              style="width: 100%"
              max-height="400px"
              size="small"
              @selection-change="handleLibrarySelectionChange"
              ref="libraryTableRef"
            >
              <el-table-column type="selection" width="40" />
              <el-table-column label="头像" width="70">
                <template #default="{ row }">
                  <img v-if="row.photoUrl" :src="row.photoUrl" class="library-avatar" />
                  <el-avatar v-else :size="40" style="background-color: #fff; color: #909399; border: 1px solid #ebeef5;">{{ row.name ? row.name[0] : '?' }}</el-avatar>
                </template>
              </el-table-column>
              <el-table-column prop="name" label="姓名" width="100" />
              <el-table-column prop="idCard" label="身份证号" width="160">
                <template #default="{ row }">
                  <span>{{ maskIdCard(row.idCard) }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="position" label="位置" width="80">
                <template #default="{ row }">
                  <el-tag :type="getPositionType(row.position)" size="small">{{ getPositionLabel(row.position) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="80">
                <template #default="{ row }">
                  <el-button type="primary" link size="small" @click="selectFromLibrary(row)">选择</el-button>
                </template>
              </el-table-column>
            </el-table>
            <div class="library-empty-tip">
              <el-empty v-if="playerLibraryList.length === 0 && !libraryLoading" description="球员库中暂无数据，请先手动新建球员" />
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>

      <!-- 编辑模式：直接显示表单 -->
      <template v-else>
<el-form :model="playerForm" label-width="100px">
          <!-- 第一行：姓名 + 身份证号（核心信息放最前） -->
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="姓名" required>
                <el-input
                  v-model="playerForm.name"
                  placeholder="请输入姓名"
                  @input="onNameInput"
                />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="身份证号" required>
                <el-input
                  v-model="playerForm.idCard"
                  placeholder="18位身份证号"
                  maxlength="18"
                  @input="onIdCardInput"
                />
              </el-form-item>
            </el-col>
          </el-row>

          <!-- 第二行：自动生成的信息 -->
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="球衣姓名">
                <el-input
                  v-model="playerForm.jerseyName"
                  placeholder="自动根据姓名生成，可手动修改"
                >
                  <template #suffix>
                    <el-tooltip content="格式：ZHENG X.（二字）或 ZHENG X.S.（三字），ZH/CH/SH保留双字母">
                      <el-icon><Info-Filled /></el-icon>
                    </el-tooltip>
                  </template>
                </el-input>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="平台年龄">
                <el-input
                  v-model="displayAge"
                  placeholder="根据身份证号计算"
                  readonly
                >
                  <template #suffix>
                    <el-tooltip content="根据身份证号出生日期计算实际年龄">
                      <el-icon><Info-Filled /></el-icon>
                    </el-tooltip>
                  </template>
                </el-input>
              </el-form-item>
            </el-col>
          </el-row>

          <!-- 第三行：身份证解析的信息 -->
          <el-row :gutter="16">
            <el-col :span="8">
              <el-form-item label="出生日期">
                <el-input
                  v-model="playerForm.birthDate"
                  placeholder="自动识别"
                  readonly
                />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="籍贯">
                <el-input v-model="playerForm.nativePlace" placeholder="自动识别" readonly />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="性别">
                <el-select v-model="playerForm.gender" style="width: 100%">
                  <el-option label="男" value="male" />
                  <el-option label="女" value="female" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>

          <!-- 通讯地址 -->
          <el-row :gutter="16">
            <el-col :span="24">
              <el-form-item label="通讯地址">
                <div class="address-row">
                  <el-select v-model="playerForm.province" placeholder="省" style="width: 110px" @change="onProvinceChange">
                    <el-option v-for="p in provinces" :key="p.code" :label="p.name" :value="p.code" />
                  </el-select>
                  <el-select v-model="playerForm.city" placeholder="市" style="width: 110px" :disabled="!playerForm.province" @change="onCityChange">
                    <el-option v-for="c in cities" :key="c.code" :label="c.name" :value="c.code" />
                  </el-select>
                  <el-select v-model="playerForm.district" placeholder="区" style="width: 110px" :disabled="!playerForm.city">
                    <el-option v-for="d in districts" :key="d.code" :label="d.name" :value="d.code" />
                  </el-select>
                </div>
              </el-form-item>
              <el-form-item label=" " class="address-detail-item">
                <el-input v-model="playerForm.addressDetail" placeholder="详细地址" />
              </el-form-item>
            </el-col>
          </el-row>

          <!-- 第四行：球衣信息 -->
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="球衣号" required>
                <el-input-number v-model="playerForm.jerseyNumber" :min="1" :max="99" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="位置" required>
                <el-select v-model="playerForm.position" placeholder="请选择位置" style="width: 100%">
                  <el-option label="守门员 GK" value="GK" />
                  <el-option label="后卫 DF" value="DF" />
                  <el-option label="前卫 MF" value="MF" />
                  <el-option label="前锋 FW" value="FW" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>

          <!-- 第五行：国籍 -->
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="国籍">
                <el-input v-model="playerForm.nationality" placeholder="默认：中国" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="服装尺码">
                <el-select v-model="playerForm.clothingSize" placeholder="选择尺码" style="width: 100%">
                  <el-option v-for="s in ['S','M','L','XL','XXL','XXXL']" :key="s" :label="s" :value="s" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>

          <!-- 第六行：身高体重 -->
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="身高(cm)">
                <el-input-number v-model="playerForm.height" :min="100" :max="250" style="width: 100%" placeholder="身高" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="体重(kg)">
                <el-input-number v-model="playerForm.weight" :min="30" :max="150" style="width: 100%" placeholder="体重" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-divider content-position="left">联系方式</el-divider>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="联系人">
                <el-input v-model="playerForm.contactName" placeholder="联系人姓名" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="联系电话">
                <el-input v-model="playerForm.contactPhone" placeholder="电话号码" />
              </el-form-item>
            </el-col>
          </el-row>
          <!-- 身份证照片上传 -->
          <!-- 球员照片上传（带裁剪和抠图） -->
          <el-divider content-position="left">球员照片（必填）</el-divider>
          <el-row :gutter="16">
            <el-col :span="24">
              <el-form-item label="球员照片" required>
                <div class="player-photo-section">
                  <AvatarCropper
                    v-if="!playerForm.photoUrl"
                    @success="handleAvatarCropSuccess"
                  />
                  <div v-else class="photo-preview-wrapper">
                    <img :src="playerForm.photoUrl" class="photo-preview-img" />
                    <el-button size="small" type="danger" @click="playerForm.photoUrl = ''">
                      重新上传
                    </el-button>
                  </div>
                </div>
              </el-form-item>
            </el-col>
          </el-row>

          <el-divider content-position="left">身份证照片（非必填）</el-divider>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="身份证正面">
                <div class="idcard-upload">
                  <el-upload
                    class="idcard-uploader"
                    :show-file-list="false"
                    :before-upload="beforePhotoUpload"
                    :http-request="(opts) => handleIdCardUpload(opts, 'front')"
                    accept="image/*"
                  >
                    <div v-if="playerForm.idCardFront" class="idcard-preview">
                      <img :src="playerForm.idCardFront" />
                    </div>
                    <div v-else class="idcard-placeholder">
                      <el-icon :size="24"><Plus /></el-icon>
                      <span>点击上传正面</span>
                    </div>
                  </el-upload>
                </div>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="身份证反面">
                <div class="idcard-upload">
                  <el-upload
                    class="idcard-uploader"
                    :show-file-list="false"
                    :before-upload="beforePhotoUpload"
                    :http-request="(opts) => handleIdCardUpload(opts, 'back')"
                    accept="image/*"
                  >
                    <div v-if="playerForm.idCardBack" class="idcard-preview">
                      <img :src="playerForm.idCardBack" />
                    </div>
                    <div v-else class="idcard-placeholder">
                      <el-icon :size="24"><Plus /></el-icon>
                      <span>点击上传反面</span>
                    </div>
                  </el-upload>
                </div>
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </template>

      <template #footer>
        <el-button @click="showAddPlayer = false">取消</el-button>
        <el-button v-if="isEditingPlayer || activeTab === 'manual'" type="primary" :loading="submitting" @click="submitPlayer">
          {{ isEditingPlayer ? '保存' : '添加' }}
        </el-button>
        <el-button v-if="!isEditingPlayer && activeTab === 'library'" type="primary" :loading="batchAdding" :disabled="selectedLibraryPlayers.length === 0" @click="batchAddFromLibrary">
          批量添加 ({{ selectedLibraryPlayers.length }})
        </el-button>
      </template>
    </el-dialog>

    <!-- 批量导入球员对话框 -->
    <el-dialog
      v-model="showBatchImport"
      title="批量导入球员"
      width="1180px"
      class="batch-import-dialog"
      top="5vh"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <!-- 导入模式切换 + 下载模板 -->
      <div class="import-header">
        <el-radio-group v-model="importMode" size="small" @change="clearImportData">
          <el-radio-button value="excel">Excel 模板导入</el-radio-button>
          <el-radio-button value="word">快捷模式（Word 报名表）</el-radio-button>
        </el-radio-group>
        <p class="import-tip" v-if="importMode === 'excel'">下载模板并填写球员信息后，上传 Excel 文件即可批量导入</p>
        <p class="import-tip" v-else>直接上传球队 Word 报名表（.docx），按「姓名 + 号码 + 出生年月/日期」快速录入，无需身份证号</p>
        <el-button v-if="importMode === 'excel'" type="success" size="small" @click="downloadImportTemplate">
          <el-icon><Download /></el-icon> 下载模板
        </el-button>
      </div>

      <!-- 上传区域 -->
      <div class="import-upload-area" v-if="importParsedData.length === 0">
        <el-upload
          ref="importUploadRef"
          :accept="importMode === 'word' ? '.docx' : '.xlsx,.xls'"
          :auto-upload="false"
          :show-file-list="false"
          :on-change="importMode === 'word' ? handleWordImportFileChange : handleImportFileChange"
          drag
        >
          <el-icon class="el-icon--upload" :size="48"><UploadFilled /></el-icon>
          <div class="el-upload__text" v-if="importMode === 'word'">
            将 Word 报名表拖拽到此处，或 <em>点击选择</em>
          </div>
          <div class="el-upload__text" v-else>
            将 Excel 文件拖拽到此处，或 <em>点击选择</em>
          </div>
          <template #tip>
            <div class="el-upload__tip" v-if="importMode === 'word'">
              支持 .docx 格式报名表（表格中含「姓名：XXX 号码：XX」与出生年月/日期；未写具体日期时按当月 1 日导入）
            </div>
            <div class="el-upload__tip" v-else>
              支持 .xlsx 格式，请使用模板文件填写球员信息
            </div>
          </template>
        </el-upload>
      </div>

      <!-- 预览区域 -->
      <div v-else class="import-preview">
        <div class="import-preview-header">
          <span class="import-preview-count">共解析到 <strong>{{ importParsedData.length }}</strong> 条人员记录</span>
          <div class="import-preview-actions">
            <el-button size="small" @click="clearImportData">重新选择</el-button>
            <el-button type="primary" size="small" :loading="batchImporting" @click="confirmBatchImport">
              确认导入 ({{ importParsedData.length }})
            </el-button>
          </div>
        </div>
        <!-- Word 报名表信息提示 -->
        <el-alert
          v-if="wordFormInfo.队名"
          type="success"
          :closable="false"
          style="margin-bottom: 8px;"
          title="报名表信息（请核对与当前球队一致）："
        >
          <template #default>
            <div style="font-size: 12px; line-height: 1.8;">
              <span v-for="(val, key) in wordFormInfo" :key="key" style="margin-right: 12px;">
                <strong>{{ key }}</strong>: {{ val }}
              </span>
            </div>
          </template>
        </el-alert>
        <el-alert
          v-if="importMode === 'word' && wordTeamLogoPreview"
          :type="teamHasLogo ? 'info' : 'success'"
          :closable="false"
          style="margin-bottom: 8px;"
          :title="teamHasLogo ? '检测到报名表队徽；当前球队已有队徽，将保留现有队徽' : '检测到报名表队徽；确认导入时将同步补充到当前球队'"
        >
          <template #default>
            <img :src="wordTeamLogoPreview" alt="报名表队徽预览" style="display: block; width: 72px; height: 72px; object-fit: contain; margin-top: 6px;" />
          </template>
        </el-alert>
        <!-- 列检测提示 -->
        <el-alert
          v-if="colDetectInfo.姓名列"
          type="info"
          :closable="false"
          style="margin-bottom: 8px;"
          title="请确认以下列映射是否正确："
        >
          <template #default>
            <div style="font-size: 12px; line-height: 1.8;">
              <span v-for="(val, key) in colDetectInfo" :key="key" style="margin-right: 12px;">
                <strong>{{ key }}</strong>: {{ val }}
              </span>
            </div>
          </template>
        </el-alert>
        <el-table :data="importParsedData" max-height="56vh" size="small" border style="width: 100%">
          <el-table-column type="index" label="#" width="40" />
          <el-table-column label="照片" width="60" align="center">
            <template #default="{ row }">
              <img v-if="row._photoPreview" :src="row._photoPreview" alt="球员照片" style="width: 36px; height: 44px; object-fit: cover; border-radius: 4px;" />
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="姓名" width="80" />
          <el-table-column prop="_importKindLabel" label="人员类型" width="80" align="center" />
          <el-table-column prop="jerseyNumber" label="球号" width="60" align="center">
            <template #default="{ row }">{{ row._importKind === 'staff' ? '-' : row.jerseyNumber }}</template>
          </el-table-column>
          <el-table-column prop="idCard" label="身份证号" width="160" />
          <el-table-column prop="position" label="位置" width="70" align="center">
            <template #default="{ row }">
              <span v-if="row._importKind === 'staff'">-</span>
              <el-tag v-else :type="getPositionType(row.position)" size="small">{{ getPositionLabel(row.position) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="jerseyName" label="球衣名" width="110" />
          <el-table-column prop="birthDate" label="出生日期" width="100" />
          <el-table-column label="年龄" width="55" align="center">
            <template #default="{ row }">{{ row.birthDate ? calculateAge(row.birthDate) : '-' }}</template>
          </el-table-column>
          <el-table-column prop="height" label="身高" width="60" align="center" />
          <el-table-column prop="weight" label="体重" width="60" align="center" />
          <el-table-column prop="contactPhone" label="联系电话" width="130" />
          <el-table-column prop="relatedPosition" label="关联职位" width="100" />
          <el-table-column label="状态" width="90" align="center">
            <template #default="{ row }">
              <el-tag v-if="row._error" type="danger" size="small">错误</el-tag>
              <el-tag v-else type="success" size="small">正常</el-tag>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="importErrors.length > 0" class="import-errors" style="margin-top: 12px;">
          <p class="import-errors-title">以下记录存在问题：</p>
          <p v-for="(err, i) in importErrors" :key="i" class="import-error-item">{{ err }}</p>
        </div>
      </div>

      <template #footer>
        <el-button @click="showBatchImport = false; clearImportData()">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 批量导入头像对话框 -->
    <el-dialog
      v-model="showBatchAvatarImport"
      title="批量导入头像"
      width="980px"
      class="batch-avatar-dialog"
      top="5vh"
      :close-on-click-modal="false"
      :before-close="closeBatchAvatarImport"
    >
      <div class="avatar-import-guide">
        <strong>使用方法：</strong>
        将照片按球员姓名命名后打包为 ZIP，例如“张三.jpg、李四.png”。系统只按完整姓名匹配；遇到同名球员或同名照片会提示人工选择。
      </div>

      <div v-if="avatarImportRows.length === 0" class="import-upload-area">
        <el-upload
          accept=".zip,application/zip"
          :auto-upload="false"
          :show-file-list="false"
          :on-change="handleAvatarZipChange"
          drag
        >
          <el-icon class="el-icon--upload" :size="48"><UploadFilled /></el-icon>
          <div class="el-upload__text">将头像 ZIP 压缩包拖到此处，或 <em>点击选择</em></div>
          <template #tip>
            <div class="el-upload__tip">支持 JPG、PNG、WEBP；单张照片不超过 10MB</div>
          </template>
        </el-upload>
      </div>

      <div v-else class="avatar-import-preview">
        <div class="avatar-import-summary">
          <div>
            <strong>{{ avatarZipName }}</strong>
            <el-tag type="success" size="small">自动匹配 {{ avatarAutoMatchedCount }}</el-tag>
            <el-tag v-if="avatarConflictCount" type="warning" size="small">需人工处理 {{ avatarConflictCount }}</el-tag>
            <el-tag v-if="avatarImportedCount" type="success" size="small">已完成 {{ avatarImportedCount }}</el-tag>
          </div>
          <div>
            <el-button size="small" :disabled="avatarBatchProcessing" @click="clearAvatarImport">重新选择</el-button>
            <el-button type="primary" size="small" :loading="avatarBatchProcessing" @click="confirmBatchAvatarImport">
              开始处理 ({{ avatarReadyCount }})
            </el-button>
          </div>
        </div>

        <el-alert
          v-if="avatarConflictCount"
          type="warning"
          :closable="false"
          title="发现同名球员、同名照片或未匹配照片，请在“匹配球员”列人工选择；不需要的照片可忽略。"
          style="margin-bottom: 10px;"
        />

        <el-table :data="avatarImportRows" max-height="58vh" size="small" border>
          <el-table-column type="index" label="#" width="45" />
          <el-table-column label="照片" width="76" align="center">
            <template #default="{ row }">
              <img :src="row.previewUrl" class="import-photo-preview" />
            </template>
          </el-table-column>
          <el-table-column prop="fileName" label="文件名" min-width="155" show-overflow-tooltip />
          <el-table-column prop="photoName" label="识别姓名" width="100" />
          <el-table-column label="匹配球员" min-width="235">
            <template #default="{ row }">
              <el-select
                v-if="row.needsManual"
                v-model="row.selectedPlayerId"
                filterable
                clearable
                placeholder="请选择球员"
                size="small"
                style="width: 100%;"
                :disabled="avatarBatchProcessing || row.ignored || row.status === 'success'"
              >
                <el-option
                  v-for="player in players"
                  :key="player._id"
                  :label="`${player.name}（${player.playerId || player.jerseyNumber || '无编号'}）`"
                  :value="player._id"
                />
              </el-select>
              <span v-else>{{ getAvatarTargetLabel(row) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="120" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.ignored" type="info" size="small">已忽略</el-tag>
              <el-tag v-else-if="row.status === 'success'" type="success" size="small">上传成功</el-tag>
              <el-tag v-else-if="row.status === 'auditing'" type="warning" size="small">检查人像</el-tag>
              <el-tag v-else-if="row.status === 'processing'" type="warning" size="small">抠图压缩</el-tag>
              <el-tag v-else-if="row.status === 'uploading'" type="warning" size="small">上传 {{ row.progress || 0 }}%</el-tag>
              <el-tooltip v-else-if="row.status === 'failed'" :content="row.error" placement="top">
                <el-tag type="danger" size="small">处理失败</el-tag>
              </el-tooltip>
              <el-tag v-else-if="row.needsManual && !row.selectedPlayerId" type="warning" size="small">待人工匹配</el-tag>
              <el-tag v-else type="success" size="small">待处理</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="75" align="center">
            <template #default="{ row }">
              <el-button
                link
                :type="row.ignored ? 'primary' : 'danger'"
                :disabled="avatarBatchProcessing || row.status === 'success'"
                @click="row.ignored = !row.ignored"
              >
                {{ row.ignored ? '恢复' : '忽略' }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <template #footer>
        <el-button :disabled="avatarBatchProcessing" @click="closeBatchAvatarImport">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 编辑球队对话框 -->
    <el-dialog
      v-model="showEditTeam"
      title="编辑球队"
      width="560px"
      :close-on-click-modal="false"
    >
      <el-form :model="teamEditForm" label-width="90px" label-position="top">
        <el-form-item label="球队编号">
          <el-input v-model="teamEditForm.teamCode" placeholder="如: 226E001" maxlength="20" />
        </el-form-item>
        <el-form-item label="全称" required>
          <el-input v-model="teamEditForm.name" placeholder="请输入球队全称" maxlength="50" />
        </el-form-item>
        <el-form-item label="简称" required>
          <el-input v-model="teamEditForm.shortName" placeholder="请输入球队简称" maxlength="20" />
        </el-form-item>

        <el-form-item label="球队建立时间">
          <el-date-picker v-model="teamEditForm.establishedDate" type="date" placeholder="选择建立时间" style="width: 100%" value-format="YYYY-MM-DD" />
        </el-form-item>

        <!-- 账号所有者即为负责人 -->

        <el-form-item label="球队Logo">
          <div class="logo-upload-wrapper">
            <div class="logo-input-row">
              <el-input v-model="teamEditForm.logoUrl" placeholder="上传后将自动填充URL" style="flex: 1;" />
              <AIImageGenerator
                type="teamLogo"
                :name="teamEditForm.name"
                color="blue"
                @success="(url) => teamEditForm.logoUrl = url"
              />
            </div>
            <el-button type="primary" size="small" style="margin-top: 8px;" @click="showLogoRemoveBg = true">
              <el-icon><Upload /></el-icon>
              上传Logo
            </el-button>
            <div class="logo-preview" v-if="teamEditForm.logoUrl">
              <img :src="teamEditForm.logoUrl" alt="Logo预览" />
            </div>
          </div>
        </el-form-item>

        <el-form-item label="球队简介">
          <el-input
            v-model="teamEditForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入球队简介"
            maxlength="200"
            show-word-limit
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showEditTeam = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitTeamEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 队徽裁剪对话框 -->
    <ImageCropper
      v-model="showLogoCropper"
      :image-src="cropperImageSrc"
      @crop="handleLogoCropConfirm"
    />

    <!-- Logo 抠图上传弹窗 -->
    <el-dialog
      v-model="showLogoRemoveBg"
      title="上传球队 Logo"
      width="700px"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <RemoveBgProcessor
        ref="logoRemoveBgRef"
        type="teamLogo"
        @success="handleLogoRemoveBgSuccess"
      />
    </el-dialog>

    <el-dialog v-model="showAddStaff" title="添加工作人员" width="500px" :close-on-click-modal="false">
      <el-form :model="staffForm" label-width="90px">
        <el-form-item label="姓名" required><el-input v-model="staffForm.name" maxlength="30" /></el-form-item>
        <el-form-item label="职务" required><el-select v-model="staffForm.type" style="width:100%"><el-option label="领队" value="team_leader" /><el-option label="主教练" value="head_coach" /><el-option label="队医" value="doctor" /><el-option label="工作人员" value="other" /></el-select></el-form-item>
        <el-form-item label="手机号"><el-input v-model="staffForm.phone" maxlength="20" placeholder="可留空" /></el-form-item>
        <el-form-item label="身份证"><el-input v-model="staffForm.idCard" maxlength="18" placeholder="可留空" /></el-form-item>
        <el-form-item label="球衣号码"><el-input-number v-model="staffForm.jerseyNumber" :min="1" :max="99" placeholder="可留空" style="width:100%" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="showAddStaff=false">取消</el-button><el-button type="primary" :loading="staffSubmitting" @click="submitStaff">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="showTeamAccess" title="球队管理权限" width="720px" :close-on-click-modal="false">
      <el-alert type="info" :closable="false" title="主账号可管理球队；协作账号由主账号分配权限。这里的账号不会进入工作人员名单。" />
      <div class="team-access-form">
        <div v-for="item in teamAccessForm" :key="item.role" class="team-access-form-row">
          <strong>{{ item.roleLabel }}</strong>
          <el-input v-model="item.name" placeholder="姓名" maxlength="30" />
          <el-input v-model="item.phone" placeholder="手机号" maxlength="11" />
          <el-radio v-model="teamAccessPrimaryRole" :value="item.role" :disabled="!item.name || !item.phone">主账号</el-radio>
          <el-button link type="danger" :disabled="teamAccessPrimaryRole === item.role" @click="clearTeamAccessFormRow(item)">删除</el-button>
        </div>
      </div>
      <template #footer><el-button @click="showTeamAccess=false">取消</el-button><el-button type="primary" :loading="teamAccessSaving" @click="saveTeamAccess">保存权限</el-button></template>
    </el-dialog>

    <el-dialog v-model="exportDialogVisible" title="导出球队资料" width="680px" :close-on-click-modal="false">
      <el-alert type="info" :closable="false" :title="`将导出 ${staffMembers.length} 名工作人员和 ${exportPlayers.length} 名球员，合并到一个工作表；默认 A4 横版打印。`" />
      <div class="export-dialog-section"><strong>导出字段</strong><el-checkbox-group v-model="exportFields" class="export-field-checks"><el-checkbox v-for="field in exportFieldOptions" :key="field.key" :label="field.key">{{ field.label }}</el-checkbox></el-checkbox-group></div>
      <template #footer><el-button @click="exportDialogVisible=false">取消</el-button><el-button type="primary" :loading="exporting" :disabled="exportFields.length === 0" @click="exportTeamData">导出 Excel</el-button></template>
    </el-dialog>
    <RosterPosterModal v-model="rosterPosterVisible" :tournament="tournamentContext" :tournament-logo="tournamentLogoUrl" :division-name="tournamentRelation.divisionName || sourceDivisionId" :team="team" :team-logo="teamLogoDisplayUrl" :players="posterRosterPlayers" :staff="staffMembers" :photo-data-urls="rosterPosterPhotos" :loading="loading || playerStatsLoading || rosterPosterPhotosLoading" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Upload, InfoFilled, Search, Refresh, Download, UploadFilled, Delete, SwitchButton, Back, Tickets, UserFilled, Histogram, Bell, CircleCheckFilled, Picture } from '@element-plus/icons-vue'
import { queryById, queryList, queryAll, addRecord, updateRecord, deleteRecord, uploadFile, uploadFileViaCloud, uploadLargeFileViaCloud, uploadImageViaWebApi, getFileUrl, callFunction, getCurrentOwner, rosterExceptionBoard } from '../../utils/cloud'
import AIImageGenerator from '../../components/common/AIImageGenerator.vue'
import AvatarCropper from '../../components/common/AvatarCropper.vue'
import { getVisualQaSnapshot } from '../../utils/visualQaFixtures'
import { removeLogoBackground } from '../../utils/logoRemoveBg'
import ImageCropper from '../../components/common/ImageCropper.vue'
import RemoveBgProcessor from '../../components/common/RemoveBgProcessor.vue'
import { provincesData, cityMapData, districtMapData } from './areaData.js'
import { generateJerseyName } from '../../utils/jerseyName.js'
import { KIT_COLOR_OPTIONS } from '../../utils/registrationKitColors.js'
import { actualStaffRecords } from '../../utils/staffRecords.js'
import { withLinkedStaffPhotos } from '../../utils/rosterPosterData.js'
import { sortPlayerTableRows } from '../../utils/teamPlayerTableSort.js'
import RosterPosterModal from '../../components/team/RosterPosterModal.vue'
import { buildTournamentPlayerStats, mergeTournamentRosterPlayer } from '../../utils/tournamentPlayerStats.js'
import JSZip from 'jszip'
import { useReadCacheRefresh } from '../../utils/useReadCacheRefresh.js'

const isTournamentStaff = sessionStorage.getItem('sxfTournamentStaff') === '1'
const route = useRoute()
const router = useRouter()
const teamId = String(route.params.teamId || route.params.id || '')
const sourceTournamentId = computed(() => typeof route.query.fromTournament === 'string' ? route.query.fromTournament : (route.params.teamId ? String(route.params.id || '') : ''))
const sourceDivisionId = computed(() => typeof route.query.divisionId === 'string' ? route.query.divisionId : '')
async function uploadScopedTeamFile(cloudPath, file, options = {}) {
  if (!isTournamentStaff) return uploadLargeFileViaCloud(cloudPath, file, options)
  const folder = String(cloudPath).split('/').slice(0, 2).join('/')
  const uploaded = await uploadImageViaWebApi(folder, file, sourceTournamentId.value)
  return { ...uploaded, fileID: uploaded.fileId }
}
const fromRegistration = computed(() => route.query.from === 'registration')
const isReadOnlyTournament = computed(() => Boolean(sourceTournamentId.value) && !fromRegistration.value)
const isTeamDataWorkspace = computed(() => Boolean(sourceTournamentId.value) && !fromRegistration.value)
const isProfessionalTournamentTeam = computed(() => route.query.mode === 'professional' || sourceDivisionId.value === 'qa-division-u16')
const tournamentDateRange = computed(() => tournamentContext.value.startDate && tournamentContext.value.endDate
  ? `${String(tournamentContext.value.startDate).replaceAll('-', '.')}—${String(tournamentContext.value.endDate).replaceAll('-', '.')}`
  : '赛期待定')
const backTitle = computed(() => fromRegistration.value ? '返回报名管理' : (sourceTournamentId.value ? '返回参赛球队' : '返回球队列表'))
const tournamentJoinSource = computed(() => {
  const source = String(tournamentRelation.value.joinSource || tournamentRelation.value.source || '').toLowerCase()
  if (['organizer_import', 'registration_docx_import'].includes(source)) return '报名表导入'
  if (['invite', 'organizer', 'organizer_invite', 'organizer_targeted_invite'].includes(source)) return '主办方邀请'
  if (['apply', 'self_apply', 'public_registration'].includes(source)) return '球队报名'
  return source ? '其他方式' : '自主报名'
})
const professionalTimeline = [
  { title: '主办方邀请', time: '2026.07.20 15:30', description: '主办方发起邀请' },
  { title: '球队认领', time: '2026.07.21 10:32', description: '球队负责人认领球队' },
  { title: '确认参赛', time: '2026.07.22 11:05', description: '确认参加本届赛事' },
  { title: '提交名单', time: '2026.07.28 15:20', description: '提交23人参赛名单' }
]
const qaSnapshot = typeof window !== 'undefined' && window.location.hostname === '127.0.0.1' && window.location.href.includes('visualQa=1')
  ? (window.__sxfVisualQaSnapshot || getVisualQaSnapshot())
  : null
const qaTeam = qaSnapshot && sourceTournamentId.value ? (() => {
  const source = (qaSnapshot.teams || []).find(item => String(item._id) === String(teamId)) || {}
  return isProfessionalTournamentTeam.value
    ? { ...source, _id: teamId, name: source.name || '郑州劲风U16', coachName: source.contactName || '王教练', contactName: source.contactName || '王教练', contactPhone: source.contactPhone || '13800003333', ownerId: 'qa-owner-1', updateTime: '2026-07-29T16:35:00', lastActiveAt: '2026-07-29T16:35:00' }
    : { _id: teamId, name: '郑州绿城U8', shortName: '绿城U8', logo: '/admin/organization-logo-placeholder.svg', coachName: '张教练', contactName: '张教练', contactPhone: '13812345678', ownerId: 'qa-owner-1', updateTime: '2026-07-19T16:35:00', lastActiveAt: '2026-07-19T16:35:00' }
})() : null

function goBack() {
  if (!sourceTournamentId.value) {
    router.push('/tournament-space')
    return
  }

  router.push({
    path: fromRegistration.value
      ? `/tournaments/${encodeURIComponent(sourceTournamentId.value)}/registration`
      : `/tournaments/${encodeURIComponent(sourceTournamentId.value)}/teams`,
    query: {
      ...(sourceDivisionId.value ? { divisionId: sourceDivisionId.value } : {}),
      ...(route.query.mode === 'professional' ? { mode: 'professional' } : {})
    }
  })
}

function openTournamentRoster() {
  router.push({ path: `/tournaments/${sourceTournamentId.value}/teams/${teamId}/roster`, query: { divisionId: sourceDivisionId.value, mode: 'professional' } })
}

function sendTournamentNotification() {
  if (qaSnapshot) window.__sxfQaTeamNotice = { action: 'prepare-tournament-notice', tournamentId: sourceTournamentId.value, divisionId: sourceDivisionId.value, teamId, relationScoped: true, clubPrivateDataIncluded: false, cloudWrite: false }
  ElMessageBox.alert('将仅向该球队当前赛事参赛关系中的负责人发送赛事通知，不会读取或使用俱乐部训练、财务等私有数据。', '发送赛事通知')
}

const loading = ref(false)
const submitting = ref(false)
const uploadingPhoto = ref(false)
const uploadingIdCard = ref({ front: false, back: false })

// 省市区数据（从 areaData.js 导入，由 element-china-area-data 自动生成）
const provinces = ref(provincesData)

const cities = ref([])
const districts = ref([])



function onProvinceChange() {
  playerForm.value.city = ''
  playerForm.value.district = ''
  cities.value = cityMapData[playerForm.value.province] || []
}

function onCityChange() {
  playerForm.value.district = ''
  districts.value = districtMapData[playerForm.value.city] || []
}
const team = ref(qaTeam || {})
const players = ref([])
const staffMembers = ref([])
const importedDraftPlayers = ref([])
const tournamentRosterPlayerIds = ref(new Set())
const tournamentMediaStats = ref({})
const dataCenterStatistics = ref(null)
function knownMetric(value) { return typeof value === 'number' && Number.isFinite(value) ? value : '—' }
function requestUnifiedStatistics() {
  return callFunction('dataCenter', {action:'query',scope:{teamId:String(teamId),...(sourceTournamentId.value ? {tournamentId:sourceTournamentId.value,...(sourceDivisionId.value ? {divisionId:sourceDivisionId.value} : {})} : {})}})
}
async function loadUnifiedStatistics(responsePromise) {
  dataCenterStatistics.value = null
  const response = await (responsePromise || requestUnifiedStatistics())
  if (!response.success) throw new Error(response.error || '统计加载失败')
  dataCenterStatistics.value = response
  if (sourceTournamentId.value) {
    const existing = new Set(players.value.map(row => String(row._id)))
    response.players.forEach(row => { if (!existing.has(row.playerId)) { existing.add(row.playerId); players.value.push({_id:row.playerId,name:row.playerName,teamId:row.teamId,profileStatus:'historical',statusText:'历史参赛球员'}) } })
  }
  const byPlayer = {}
  response.players.forEach(row => { const total = byPlayer[row.playerId] ||= {}; for (const field of ['appearances','goals','assists','yellowCards','redCards','minutesPlayed']) { if (total[field] === null || row.metrics[field] === null) total[field] = null; else total[field] = (total[field] || 0) + row.metrics[field] } })
  tournamentMediaStats.value = Object.fromEntries(Object.entries(byPlayer).map(([playerId,value]) => [playerId,{...value,minutes:value.minutesPlayed}]))
}

const kitSaving = ref(false)
const kitSets = [{key:'primary',label:'主比赛服',badge:'主',description:'常规比赛优先使用'},{key:'secondary',label:'备用比赛服',badge:'备',description:'撞色时切换使用'}]
const kitEquipment = [{key:'jersey',label:'球衣'},{key:'shorts',label:'球裤'},{key:'socks',label:'球袜'}]
const kitColorOptions = KIT_COLOR_OPTIONS
const kitForm = ref({primary:{jersey:'#138A4B',shorts:'#FFFFFF',socks:'#138A4B'},secondary:{jersey:'#FFFFFF',shorts:'#138A4B',socks:'#FFFFFF'}})
const kitColorLabels = ref({ primary:{}, secondary:{} })
const tournamentContext = ref(qaSnapshot && sourceTournamentId.value ? { ...qaSnapshot.tournament, divisions: qaSnapshot.divisions } : {})
const tournamentRelation = ref(qaSnapshot && sourceTournamentId.value ? { tournamentId: sourceTournamentId.value, teamId, divisionId: sourceDivisionId.value, divisionName: isProfessionalTournamentTeam.value ? 'U16组' : 'U8组', registrationNo: isProfessionalTournamentTeam.value ? 'HNYC-U16-021' : 'HNYC-U8-001', joinSource: isProfessionalTournamentTeam.value ? 'invite' : '主办方邀请', status: 'approved', claimedAt: isProfessionalTournamentTeam.value ? '2026-07-21T10:32:00' : '2026-07-18T10:24:00', rosterStatus: isProfessionalTournamentTeam.value ? 'submitted' : '' } : {})
const isSyntheticTeam = computed(() => team.value.synthetic === true || Boolean(team.value.syntheticDatasetId))
const tournamentParticipationCode = computed(() => tournamentRelation.value.registrationNo || tournamentRelation.value.tournamentTeamCode || tournamentRelation.value.participationCode || tournamentRelation.value.registrationCode || team.value.teamCode || (tournamentRelation.value._id ? `T-${String(tournamentRelation.value._id).slice(-6).toUpperCase()}` : '待分配'))
const tournamentContactName = computed(() => tournamentRelation.value.contactName || tournamentRelation.value.managerName || team.value.coachName || team.value.contactName || team.value.managerName || team.value.ownerName || '—')
const resolvedTournamentLogo = ref('')
const tournamentLogoDirectUrl = computed(() => [tournamentContext.value.logoTransparentUrl, tournamentContext.value.logoUrl, tournamentContext.value.logo]
  .map(value => String(value || '').trim())
  .find(value => /^(https?:\/\/|\/)/i.test(value)) || '')
async function resolveTournamentLogo() {
  resolvedTournamentLogo.value = ''
  const cloudSource = [tournamentContext.value.logoTransparentFileId, tournamentContext.value.logoFileId, tournamentContext.value.logoTransparentUrl, tournamentContext.value.logoUrl, tournamentContext.value.logo]
    .map(value => String(value || '').trim())
    .find(value => value.startsWith('cloud://'))
  if (!cloudSource) return
  const resolved = await getFileUrl(cloudSource)
  resolvedTournamentLogo.value = /^https?:\/\//i.test(String(resolved || '')) ? resolved : ''
}
const tournamentLogoUrl = computed(() => resolvedTournamentLogo.value || tournamentLogoDirectUrl.value || `${import.meta.env.BASE_URL}organization-logo-placeholder.svg`)
const tournamentMatches = ref([])
const tournamentMatchEvents = ref([])
const playerStatsLoading = ref(false)
const playerStatsError = ref('')
const competitionMatches = ref([])
const competitionRoster = ref(null)
const competitionDivision = ref({})
const playerAvatarErrors = ref(new Set())
function markPlayerAvatarFailed(row) { playerAvatarErrors.value = new Set([...playerAvatarErrors.value, row._id]) }
function displayJerseyName(row) { return row.jerseyName || row.shirtName || generateJerseyName(row.name || '') || '—' }
const tournamentPlayerRows = computed(() => buildTournamentPlayerStats(withLinkedStaffPhotos(competitionRoster.value ?? exportPlayers.value, staffMembers.value), competitionMatches.value, [teamId, tournamentRelation.value._id].filter(Boolean), competitionDivision.value, tournamentContext.value, { tournamentId: sourceTournamentId.value, divisionId: sourceDivisionId.value || tournamentRelation.value.divisionId || 'default' }))
function statValue(row, key) {
  if (playerStatsError.value || playerStatsLoading.value || (key === 'minutes' && row.minutesIncomplete) || (key === 'appearances' && row.appearanceIncomplete) || (key === 'goals' && row.goalsIncomplete) || (['yellowCards', 'redCards'].includes(key) && row.cardsIncomplete)) return '—'
  return row[key] ?? 0
}
const tournamentPlayerSort = ref({ prop: '', order: '' })
function tournamentPlayerSortValue(row, prop) {
  if (prop === 'name') return String(row.name || '').trim() || null
  if (prop === 'jerseyName') return displayJerseyName(row).replace(/^—$/, '') || null
  if (prop === 'identityLabel') return playerIdentityLabel(row)
  if (prop === 'position') return getPositionLabel(row.position).replace(/^[-—]$/, '') || null
  if (prop === 'age') { const age = calculateAge(row.birthDate); return typeof age === 'number' ? age : null }
  if (prop === 'jerseyNumber') {
    const raw = String(row.jerseyNumber ?? '').trim()
    return raw && raw !== '0' && Number.isFinite(Number(raw)) ? Number(raw) : null
  }
  if (['appearances', 'minutes', 'goals', 'yellowCards', 'redCards'].includes(prop)) {
    const value = statValue(row, prop)
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  }
  return null
}
const sortedTournamentPlayerRows = computed(() => sortPlayerTableRows(tournamentPlayerRows.value, tournamentPlayerSort.value.prop, tournamentPlayerSort.value.order, tournamentPlayerSortValue))
function onTournamentPlayerSort({ prop, order }) {
  if (isTeamDataWorkspace.value) tournamentPlayerSort.value = { prop: prop || '', order: order || '' }
}
async function readAllRows(collection, where) {
  return queryAll(collection, { where, silent: true, orderBy: { _id: 'asc' } })
}
async function loadPlayerCompetitionData() {
  if (!isTeamDataWorkspace.value) return
  playerStatsLoading.value = true
  playerStatsError.value = ''
  competitionMatches.value = []
  competitionRoster.value = null
  try {
    if (qaSnapshot) {
      competitionMatches.value = qaSnapshot.playerCompetitionMatches || []
      competitionRoster.value = qaSnapshot.players || []
      return
    }
    const divisionId = sourceDivisionId.value || tournamentRelation.value.divisionId || 'default'
    const [dashboard, roster, division] = await Promise.all([
      callFunction('resultCenter', { action: 'dashboard', tournamentId: sourceTournamentId.value }),
      rosterExceptionBoard({ tournamentId: sourceTournamentId.value, teamId, divisionId, rosterAction: 'listRoster' }),
      divisionId === 'default' ? Promise.resolve({}) : queryById('divisions', divisionId)
    ])
    competitionDivision.value = Array.isArray(division) ? division[0] || {} : division || {}
    if (!dashboard?.success) throw new Error(dashboard?.message || '赛果加载失败')
    if (!roster?.success) throw new Error(roster?.error || '本届名单加载失败')
    // 已有本届名单快照时只显示快照成员；旧报名表仍保留在本届展示中。
    if (roster.snapshot) {
      const sourceById = new Map(exportPlayers.value.map(player => [String(player._id), player]))
      competitionRoster.value = await Promise.all((roster.rows || []).map(async player => {
        const merged = mergeTournamentRosterPlayer(sourceById.get(String(player.id)), player)
        if (String(merged.photoUrl || '').startsWith('cloud://')) merged.photoUrl = await getFileUrl(merged._exportPhotoFileId || merged.photoUrl)
        return merged
      }))
      playerAvatarErrors.value = new Set()
    }
    const ids = new Set([String(teamId), String(tournamentRelation.value._id || '')])
    const official = (dashboard.matches || []).filter(match => match.resultStatus === 'approved' && String(match.divisionId || 'default') === String(divisionId) && (ids.has(String(match.homeTeamId)) || ids.has(String(match.awayTeamId))))
    const loaded = []
    for (let start = 0; start < official.length; start += 4) {
      const batch = await Promise.all(official.slice(start, start + 4).map(async summary => {
        const [match, events] = await Promise.all([queryById('matches', summary.id), readAllRows('match_events', { matchId: summary.id })])
        const raw = Array.isArray(match) ? match[0] : match
        if (!raw) throw new Error('比赛记录缺失')
        return { ...raw, statsEvents: events.length ? events : (raw.events || raw.refereeRecordPayload?.events || []) }
      }))
      loaded.push(...batch)
    }
    competitionMatches.value = loaded
  } catch (error) {
    playerStatsError.value = '参赛数据加载失败，请重新加载'
    console.error('加载本届球员参赛数据失败:', error)
  } finally {
    playerStatsLoading.value = false
  }
}
const teamMatchStats = computed(() => {
  const rows = dataCenterStatistics.value?.teams || []
  const sum = field => dataCenterStatistics.value && rows.every(row => row[field] !== null) ? rows.reduce((total,row) => total + row[field],0) : '—'
  return {total:dataCenterStatistics.value?.summary.matchCount ?? '—',wins:sum('wins'),draws:sum('draws'),losses:sum('losses'),goalsFor:sum('goalsFor'),goalsAgainst:sum('goalsAgainst')}
})
function historyEventPlayerId(event) { return String(event?.playerId || event?.player || event?.player_id || '') }
function historyEventType(event) { return String(event?.type || event?.eventType || '').toLowerCase() }
function firstHistoryValue() { for (const value of arguments) if (value !== undefined && value !== null && value !== '') return value; return '' }
const playerDisciplineHistory = computed(() => (dataCenterStatistics.value?.players || []).filter(row => row.observed.yellowCards || row.observed.redCards).map(row => ({name:row.playerName,yellowCards:knownMetric(row.metrics.yellowCards),redCards:knownMetric(row.metrics.redCards)})))
const matchHistoryRows = computed(() => tournamentMatches.value.slice().sort((left, right) => new Date(firstHistoryValue(right.matchDate, right.startTime, right.matchTime, right.createTime) || 0).getTime() - new Date(firstHistoryValue(left.matchDate, left.startTime, left.matchTime, left.createTime) || 0).getTime()).map(match => {
  const isHome = String(match.homeTeamId || match.teamAId || '') === String(teamId)
  const ownScore = isHome ? (match.homeScore ?? match.teamAScore) : (match.awayScore ?? match.teamBScore)
  const opponentScore = isHome ? (match.awayScore ?? match.teamBScore) : (match.homeScore ?? match.teamAScore)
  const opponent = isHome ? (match.awayTeamName || match.awayName || '客队') : (match.homeTeamName || match.homeName || '主队')
  const directDate = String(match.matchDate || '').slice(0, 10)
  const directTime = /^\d{1,2}:\d{2}$/.test(String(match.matchTime || '').trim()) ? String(match.matchTime).trim() : ''
  return { dateTime:directDate ? `${directDate}${directTime ? ` ${directTime}` : ''}` : formatTournamentTime(firstHistoryValue(match.startTime, match.kickoffAt, match.matchTime)), opponent, score:`${ownScore ?? '—'} : ${opponentScore ?? '—'}`, status:['completed','finished','archived'].includes(String(match.status || '').toLowerCase()) ? '已结束' : '待开始' }
}))
const maskedPhone = computed(() => {
  const phone = String(
    tournamentRelation.value.contactPhone || tournamentRelation.value.managerPhone || tournamentRelation.value.ownerPhone ||
    team.value.contactPhone || team.value.managerPhone || team.value.ownerPhone || team.value.creatorPhone || team.value.phoneNumber || team.value.phone || team.value.mobile || ''
  )
  // 主办方后台属于已授权的赛事工作区，显示完整联系方式；公开端仍使用脱敏数据。
  return phone || '—'
})
const clearingPlayers = ref(false)
const showAddPlayer = ref(false)
const showAddStaff = ref(false)
const staffSubmitting = ref(false)
const staffForm = ref({ name:'', type:'team_leader', phone:'', idCard:'', jerseyNumber:null })
const teamAccessRoleOptions = [
  { role:'team_leader', roleLabel:'领队' },
  { role:'head_coach', roleLabel:'主教练' },
  { role:'liaison', roleLabel:'联络员' }
]
const teamAccessRows = ref([])
const teamAccessLoading = ref(false)
const teamAccessSaving = ref(false)
const teamAccessDeletingRole = ref('')
const showTeamAccess = ref(false)
const teamAccessPrimaryRole = ref('team_leader')
const teamAccessForm = ref(teamAccessRoleOptions.map(item => ({ ...item, name:'', phone:'' })))
const exportDialogVisible = ref(false)
const rosterPosterVisible = ref(false)
const exporting = ref(false)
const exportFieldOptions = [
  { key:'photo', label:'照片', width:14 }, { key:'name', label:'姓名', width:14 }, { key:'memberType', label:'人员类型', width:12 },
  { key:'role', label:'职务/身份', width:18 }, { key:'jerseyNumber', label:'球衣号码', width:11 }, { key:'jerseyName', label:'球衣英文', width:16 },
  { key:'gender', label:'性别', width:9 }, { key:'birthDate', label:'出生日期', width:14 }, { key:'age', label:'年龄', width:9 },
  { key:'nativePlace', label:'籍贯', width:18 }, { key:'identityNumber', label:'身份证号', width:23 },
  { key:'phone', label:'手机号', width:16 }, { key:'position', label:'位置', width:12 }, { key:'organizerReviewStatus', label:'主办方审核', width:14 }
]
const exportFields = ref(exportFieldOptions.map(item => item.key))
function exportPlayerKey(player) {
  const identity = String(player.identityDigest || player.idCard || player.idNumber || '').replace(/\s/g, '').toUpperCase()
  if (identity) return `identity:${identity}`
  if (player.confirmedPlayerId) return `player:${player.confirmedPlayerId}`
  return `person:${String(player.name || '').trim()}|${String(player.birthDate || '').slice(0, 10)}|${String(player.jerseyNumber || '')}`
}
const exportPlayers = computed(() => {
  const result = new Map()
  ;[...players.value, ...importedDraftPlayers.value].forEach(player => {
    const key = exportPlayerKey(player)
    if (!result.has(key) || player._exportSource !== 'registration_player_draft') result.set(key, player)
  })
  return Array.from(result.values())
})
const posterRosterPlayers = computed(() => {
  if (!isReadOnlyTournament.value) return []
  const currentIds = tournamentRosterPlayerIds.value
  const source = competitionRoster.value ?? (isProfessionalTournamentTeam.value ? [] : players.value)
  const eligible = source.filter(person => {
    if (!person?._id) return false
    if (currentIds.size && !currentIds.has(String(person._id))) return false
    const review = String(person.reviewStatus || '').toLowerCase()
    if (['excluded', 'rejected', 'conflict'].includes(review)) return false
    if (isProfessionalTournamentTeam.value) {
      if (['exception', 'pending', 'incomplete', 'rejected'].includes(String(person.profileStatus || '').toLowerCase())) return false
      if (['pending', 'failed', 'rejected'].includes(String(person.identityStatus || '').toLowerCase())) return false
    }
    return true
  }).map(person => ({ ...person, jerseyName: person.jerseyName || person.shirtName || generateJerseyName(person.name || '') }))
  return withLinkedStaffPhotos(eligible, staffMembers.value)
})

function identityMatchParts(person) {
  return {
    name:String(person.name || '').replace(/\s/g, '').toLowerCase(),
    birthDate:String(person.birthDate || '').slice(0, 10),
    jerseyNumber:String(Number(person.jerseyNumber || 0) || '')
  }
}

function registerUniqueIdentity(map, key, identityNumber) {
  if (!key || !identityNumber) return
  if (!map.has(key)) map.set(key, identityNumber)
  else if (map.get(key) !== identityNumber) map.set(key, '')
}

async function loadRegistrationIdentityIndex() {
  if (!sourceTournamentId.value || !tournamentRelation.value?._id) return null
  const source = await callFunction('organizerClaimInvite', {
    action:'getTeamRegistrationSource',
    tournamentId:sourceTournamentId.value,
    divisionId:sourceDivisionId.value || tournamentRelation.value.divisionId || 'default',
    tournamentTeamId:String(tournamentRelation.value._id)
  })
  if (!source?.success || !source.available || !source.url) return null
  const response = await fetch(source.url, { cache:'no-store' })
  if (!response.ok) throw new Error(`原始报名表读取失败（${response.status}）`)
  const blob = await response.blob()
  const rawFileName = String(source.fileName || '球队报名表.docx')
  const fileName = rawFileName.toLowerCase().endsWith('.docx') ? rawFileName : `${rawFileName}.docx`
  const file = new File([blob], fileName, { type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  const { parseTeamRegistrationDocx } = await import('../../utils/teamRegistrationDocx.js')
  const parsed = await parseTeamRegistrationDocx(file, { skipImages:true })
  const exact = new Map()
  const nameBirth = new Map()
  const nameJersey = new Map()
  const names = new Map()
  ;[...(parsed.staff || []), ...(parsed.players || [])].forEach(person => {
    const identityNumber = String(person.identityNumber || '').trim().toUpperCase()
    if (!identityNumber) return
    const parts = identityMatchParts(person)
    registerUniqueIdentity(exact, `${parts.name}|${parts.birthDate}|${parts.jerseyNumber}`, identityNumber)
    registerUniqueIdentity(nameBirth, `${parts.name}|${parts.birthDate}`, identityNumber)
    registerUniqueIdentity(nameJersey, `${parts.name}|${parts.jerseyNumber}`, identityNumber)
    registerUniqueIdentity(names, parts.name, identityNumber)
  })
  return { exact, nameBirth, nameJersey, names }
}

function sourceIdentityNumber(record, index) {
  if (!index) return ''
  const parts = identityMatchParts(record)
  return index.exact.get(`${parts.name}|${parts.birthDate}|${parts.jerseyNumber}`)
    || index.nameBirth.get(`${parts.name}|${parts.birthDate}`)
    || index.nameJersey.get(`${parts.name}|${parts.jerseyNumber}`)
    || index.names.get(parts.name)
    || ''
}
function openExportDialog() {
  exportFields.value = exportFieldOptions.map(item => item.key)
  exportDialogVisible.value = true
}

const rosterPosterPhotos = ref({})
const rosterPosterPhotosLoading = ref(false)
async function openRosterPoster() {
  rosterPosterVisible.value = true
  rosterPosterPhotos.value = {}
  const fileIds = Array.from(new Set([...posterRosterPlayers.value, ...staffMembers.value]
    .map(person => person._exportPhotoFileId || person.photoFileID || person.photoFileId || person.photoUrl)
    .filter(value => String(value || '').startsWith('cloud://'))))
  if (!fileIds.length || !sourceTournamentId.value || !tournamentRelation.value?._id) return
  rosterPosterPhotosLoading.value = true
  try {
    const result = await callFunction('organizerClaimInvite', {
      action: 'getTeamExportPhotos',
      tournamentId: sourceTournamentId.value,
      divisionId: sourceDivisionId.value || tournamentRelation.value.divisionId || 'default',
      tournamentTeamId: String(tournamentRelation.value._id),
      fileIds: fileIds.slice(0, 50)
    })
    if (result?.success) {
      rosterPosterPhotos.value = Object.fromEntries((result.photos || [])
        .filter(item => item.status === 'ready' && item.base64 && item.mimeType)
        .map(item => [item.fileId, `data:${item.mimeType};base64,${item.base64}`]))
    }
  } catch (error) {
    console.warn('名单海报读取照片失败:', error.message || error)
  } finally {
    rosterPosterPhotosLoading.value = false
  }
}

function excelImageExtension(dataUrl) {
  const type = String(dataUrl || '').match(/^data:image\/(png|jpe?g|gif);/i)?.[1]?.toLowerCase()
  return type === 'jpg' ? 'jpeg' : (type || 'png')
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('照片读取失败'))
    reader.readAsDataURL(blob)
  })
}

async function photoForExcel(source, prefetchedPhoto) {
  if (prefetchedPhoto) source = prefetchedPhoto
  let url = String(source || '').trim()
  if (!url) return null
  if (url.startsWith('cloud://')) url = await getFileUrl(url)
  if (/^data:image\/(png|jpe?g|gif);/i.test(url)) return { base64:url, extension:excelImageExtension(url) }
  const response = await fetch(url)
  if (!response.ok) throw new Error(`照片下载失败（${response.status}）`)
  const blob = await response.blob()
  if (/^image\/(png|jpe?g|gif)$/i.test(blob.type)) {
    const base64 = await blobToDataUrl(blob)
    return { base64, extension:excelImageExtension(base64) }
  }
  const objectUrl = URL.createObjectURL(blob)
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('照片格式转换失败'))
      element.src = objectUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth || image.width
    canvas.height = image.naturalHeight || image.height
    canvas.getContext('2d').drawImage(image, 0, 0)
    return { base64:canvas.toDataURL('image/png'), extension:'png' }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function exportMemberValue(row, key) {
  if (key === 'photo') return ''
  if (key === 'memberType') return row._memberType
  if (key === 'role') return row._memberType === '工作人员' ? (row.role || row.type || '工作人员') : playerIdentityLabel(row)
  if (key === 'identityNumber') return row.identityNumber || row.idCard || row.idNumber || row._exportIdentityNumber || ''
  if (key === 'phone') return row.phone || row.contactPhone || ''
  if (key === 'position') return row._memberType === '球员' ? getPositionLabel(row.position) : ''
  if (key === 'organizerReviewStatus') return row._memberType === '球员' ? (playerOrganizerReviewStatus(row) === 'approved' ? '已审核' : '待审核') : ''
  if (key === 'gender') return ({ male:'男', female:'女' })[String(row.gender || '').toLowerCase()] || row.gender || ''
  if (key === 'age') return row.birthDate ? calculateAge(row.birthDate) : ''
  if (key === 'birthDate' && row.birthDate) {
    const match = String(row.birthDate).match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  }
  return row[key] ?? ''
}

async function exportTeamData() {
  exporting.value = true
  try {
    const ExcelJSImport = await import('exceljs')
    const ExcelJS = ExcelJSImport.default || ExcelJSImport
    const selectedFields = exportFieldOptions.filter(item => exportFields.value.includes(item.key))
    if (!selectedFields.length) return ElMessage.warning('请至少选择一个导出字段')
    const workbook = new ExcelJS.Workbook()
    workbook.creator = '赛小蜂足球'
    workbook.created = new Date()
    const worksheet = workbook.addWorksheet('球队资料', { views:[{ showGridLines:false, state:'frozen', ySplit:4 }] })
    const columnCount = selectedFields.length
    if (columnCount > 1) worksheet.mergeCells(1, 1, 1, columnCount)
    worksheet.getCell(1, 1).value = `${team.value.name || '球队'}资料`
    worksheet.getCell(1, 1).font = { name:'Microsoft YaHei', size:16, bold:true, color:{ argb:'FF123D27' } }
    worksheet.getCell(1, 1).alignment = { horizontal:'center', vertical:'middle' }
    worksheet.getRow(1).height = 32
    if (columnCount > 1) worksheet.mergeCells(2, 1, 2, columnCount)
    worksheet.getCell(2, 1).value = `赛事编号：${tournamentParticipationCode.value}    负责人：${tournamentContactName.value}    联系方式：${maskedPhone.value}`
    worksheet.getCell(2, 1).font = { name:'Microsoft YaHei', size:10, color:{ argb:'FF52635A' } }
    worksheet.getCell(2, 1).alignment = { horizontal:'center', vertical:'middle' }
    worksheet.getRow(2).height = 24
    const headerRow = worksheet.getRow(4)
    headerRow.values = selectedFields.map(item => item.label)
    headerRow.height = 30
    headerRow.eachCell(cell => {
      cell.font = { name:'Microsoft YaHei', size:10, bold:true, color:{ argb:'FFFFFFFF' } }
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF147A45' } }
      cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true }
    })
    selectedFields.forEach((field, index) => { worksheet.getColumn(index + 1).width = field.width })
    const records = [
      ...staffMembers.value.map(item => ({ ...item, _memberType:'工作人员' })),
      ...exportPlayers.value.map(item => ({ ...item, _memberType:'球员' }))
    ]
    let missingIdentityCount = 0
    if (selectedFields.some(item => item.key === 'identityNumber')) {
      try {
        const identityIndex = await loadRegistrationIdentityIndex()
        records.forEach(record => {
          if (!record.identityNumber && !record.idCard && !record.idNumber) record._exportIdentityNumber = sourceIdentityNumber(record, identityIndex)
          if (!record.identityNumber && !record.idCard && !record.idNumber && !record._exportIdentityNumber) missingIdentityCount += 1
        })
      } catch (error) {
        console.warn('从原始报名表补充身份证号失败:', error.message)
        missingIdentityCount = records.filter(record => !record.identityNumber && !record.idCard && !record.idNumber).length
      }
    }
    const photoColumn = selectedFields.findIndex(item => item.key === 'photo')
    const photoSource = record => record._exportPhotoFileId || record.photoFileID || record.photoFileId || record.photoUrl || ''
    const prefetchedPhotos = new Map()
    if (photoColumn >= 0 && sourceTournamentId.value && tournamentRelation.value?._id) {
      const fileIds = Array.from(new Set(records.map(photoSource).filter(value => String(value).startsWith('cloud://'))))
      if (fileIds.length) {
        try {
          const photoResult = await callFunction('organizerClaimInvite', {
            action:'getTeamExportPhotos',
            tournamentId:sourceTournamentId.value,
            divisionId:sourceDivisionId.value || tournamentRelation.value.divisionId || 'default',
            tournamentTeamId:String(tournamentRelation.value._id),
            fileIds
          })
          if (photoResult?.success) {
            ;(photoResult.photos || []).forEach(item => {
              if (item.status === 'ready' && item.base64 && item.mimeType) prefetchedPhotos.set(item.fileId, `data:${item.mimeType};base64,${item.base64}`)
            })
          }
        } catch (error) {
          console.warn('批量读取导出照片失败，将尝试逐张读取:', error.message)
        }
      }
    }
    let failedPhotos = 0
    for (const record of records) {
      const row = worksheet.addRow(selectedFields.map(field => exportMemberValue(record, field.key)))
      row.height = photoColumn >= 0 ? 58 : 32
      row.eachCell({ includeEmpty:true }, cell => {
        cell.font = { name:'Microsoft YaHei', size:10, color:{ argb:'FF25342B' } }
        cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true }
        cell.border = {
          top:{ style:'thin', color:{ argb:'FFBFCBC3' } }, bottom:{ style:'thin', color:{ argb:'FFBFCBC3' } },
          left:{ style:'thin', color:{ argb:'FFBFCBC3' } }, right:{ style:'thin', color:{ argb:'FFBFCBC3' } }
        }
        if (row.number % 2 === 0) cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF3F8F5' } }
      })
      const birthDateIndex = selectedFields.findIndex(item => item.key === 'birthDate')
      if (birthDateIndex >= 0 && row.getCell(birthDateIndex + 1).value instanceof Date) row.getCell(birthDateIndex + 1).numFmt = 'yyyy-mm-dd'
      if (photoColumn >= 0) {
        const source = photoSource(record)
        if (source) {
          try {
            const photo = await photoForExcel(source, prefetchedPhotos.get(source))
            if (photo) {
              const imageId = workbook.addImage(photo)
              worksheet.addImage(imageId, { tl:{ col:photoColumn + 0.18, row:row.number - 0.88 }, ext:{ width:48, height:62 }, editAs:'oneCell' })
            }
          } catch (error) {
            failedPhotos += 1
            console.warn('导出照片失败:', record.name, error.message)
          }
        }
      }
    }
    for (let column = 1; column <= columnCount; column += 1) {
      headerRow.getCell(column).border = {
        top:{ style:'thin', color:{ argb:'FF0F5F37' } }, bottom:{ style:'thin', color:{ argb:'FF0F5F37' } },
        left:{ style:'thin', color:{ argb:'FFFFFFFF' } }, right:{ style:'thin', color:{ argb:'FFFFFFFF' } }
      }
    }
    if (records.length) worksheet.autoFilter = { from:{ row:4, column:1 }, to:{ row:4 + records.length, column:columnCount } }
    const lastCellAddress = worksheet.getCell(Math.max(4, 4 + records.length), columnCount).address
    worksheet.pageSetup = {
      paperSize:9,
      orientation:'landscape',
      fitToPage:true,
      fitToWidth:1,
      fitToHeight:0,
      horizontalCentered:true,
      verticalCentered:false,
      printArea:`A1:${lastCellAddress}`,
      printTitlesRow:'1:4',
      margins:{ left:0.25, right:0.25, top:0.45, bottom:0.45, header:0.15, footer:0.2 }
    }
    worksheet.headerFooter = { oddFooter:'&C第 &P 页，共 &N 页' }
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const downloadUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `${team.value.name || '球队'}-资料.xlsx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(downloadUrl)
    const exportWarnings = []
    if (failedPhotos) exportWarnings.push(`${failedPhotos} 张照片未能写入`)
    if (missingIdentityCount) exportWarnings.push(`${missingIdentityCount} 人未在原始报名表中匹配到完整身份证号`)
    ElMessage.success(exportWarnings.length ? `球队资料已导出；${exportWarnings.join('，')}` : '球队资料已导出')
    exportDialogVisible.value = false
  } catch (error) { ElMessage.error(error.message || '导出失败') } finally { exporting.value = false }
}
const showBatchImport = ref(false)
const showBatchAvatarImport = ref(false)
const isEditingPlayer = ref(false)
const editingPlayerId = ref('')
const editingPlayerOriginal = ref(null)

// 球员库相关
const activeTab = ref('manual')
const playerLibraryList = ref([])
const libraryLoading = ref(false)
const libraryKeyword = ref('')
const selectedLibraryPlayers = ref([])
const batchAdding = ref(false)
const libraryTableRef = ref(null)

// 球员库缓存（页面会话内只加载一次）
const playerLibraryCache = ref([])
const libraryCacheLoaded = ref(false)

// 批量导入相关
const importParsedData = ref([])
const importErrors = ref([])
const batchImporting = ref(false)
const colDetectInfo = ref({})
const importUploadRef = ref(null)
const importMode = ref('excel') // excel=模板导入，word=快捷模式（Word 报名表，免身份证）
const wordFormInfo = ref({})
const wordTeamLogoPreview = ref('')
const wordTeamLogoFile = ref(null)
const getTeamLogoUrl = (teamRecord) => {
  const sources = [teamRecord?.logoFileID, teamRecord?.logoFileId, teamRecord?.logoCloudFileId, teamRecord?.logoUrl, teamRecord?.logo, teamRecord?._logoFileId]
    .map(value => String(value || '').trim())
  return sources.find(value => value.startsWith('cloud://')) || sources.find(Boolean) || ''
}
const teamLogoDisplayUrl = computed(() => {
  const value = String(team.value.logoUrl || team.value.logo || '')
  return /^(https?:\/\/|\/)/i.test(value) ? value : `${import.meta.env.BASE_URL}organization-logo-placeholder.svg`
})
const teamHasLogo = computed(() => Boolean(getTeamLogoUrl(team.value)))

async function resolveTeamLogo(teamRecord) {
  const source = getTeamLogoUrl(teamRecord)
  if (!source.startsWith('cloud://')) return { ...teamRecord, _logoFileId: source }
  const resolved = await getFileUrl(source)
  const url = /^https?:\/\//i.test(String(resolved || '')) ? resolved : ''
  return { ...teamRecord, _logoFileId: source, logo: url, logoUrl: url }
}

// 批量头像导入相关
const avatarImportRows = ref([])
const avatarZipName = ref('')
const avatarBatchProcessing = ref(false)
const avatarAutoMatchedCount = computed(() => avatarImportRows.value.filter(row => !row.needsManual && row.selectedPlayerId).length)
const avatarConflictCount = computed(() => avatarImportRows.value.filter(row => !row.ignored && row.needsManual && !row.selectedPlayerId).length)
const avatarImportedCount = computed(() => avatarImportRows.value.filter(row => row.status === 'success').length)
const avatarReadyCount = computed(() => avatarImportRows.value.filter(row => !row.ignored && row.status !== 'success' && row.selectedPlayerId).length)

// 编辑球队相关
const showEditTeam = ref(false)
const playerReviewingId = ref('')
const teamEditForm = ref({
  name: '',
  teamCode: '',
  establishedDate: '',
  logoUrl: '',
  description: ''
})

// 队徽裁剪相关
const showLogoCropper = ref(false)
const showLogoRemoveBg = ref(false)
const logoRemoveBgRef = ref(null)
const cropperImageSrc = ref('')
const cropperPendingFile = ref(null)

const playerForm = ref({
  name: '', gender: 'male', birthDate: '', idCard: '',
  nationality: '中国', nativePlace: '', jerseyNumber: 1,
  position: '', jerseyName: '', clothingSize: '',
  contactName: '', contactPhone: '',
  photoUrl: '', registerTime: '',
  // 通讯地址
  province: '', city: '', district: '', addressDetail: '',
  // 身份证照片
  idCardFront: '', idCardBack: ''
})

const positionMap = { GK: '守门员', DF: '后卫', MF: '前卫', FW: '前锋' }
const positionTypeMap = { GK: 'danger', DF: '', MF: 'success', FW: 'warning' }

function getPositionLabel(pos) { return positionMap[pos] || pos || '-' }
function getPositionType(pos) { return positionTypeMap[pos] || '' }

// 计算年龄（用于表格显示）
function calculateAge(birthDate) {
  if (!birthDate) return '-'
  try {
    const birth = new Date(birthDate)
    if (isNaN(birth.getTime())) return '-'
    const now = new Date()
    let age = now.getFullYear() - birth.getFullYear()
    const monthDiff = now.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
      age--
    }
    return age >= 0 ? age : '-'
  } catch (e) {
    return '-'
  }
}

// 平台年龄显示（根据身份证号出生日期计算）
const displayAge = computed(() => {
  if (!playerForm.value.birthDate) return '-'
  const birthDate = new Date(playerForm.value.birthDate)
  const now = new Date()
  let age = now.getFullYear() - birthDate.getFullYear()
  const monthDiff = now.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    age--
  }
  return age >= 0 ? `${age}岁` : '-'
})



// 解析身份证号
function parseIdCard(idCard) {
  if (!idCard || idCard.length !== 18) return null

  // 提取出生日期
  const year = idCard.substring(6, 10)
  const month = idCard.substring(10, 12)
  const day = idCard.substring(12, 14)
  const birthDate = `${year}-${month}-${day}`

  // 提取性别（第17位，奇数男，偶数女）
  const genderCode = parseInt(idCard.charAt(16))
  const gender = genderCode % 2 === 1 ? 'male' : 'female'

  // 提取籍贯（前6位地区码）- 显示城市
  const areaCode = idCard.substring(0, 6)
  const cityMap = {
    // 北京
    '1101': '北京市', '1102': '北京市',
    // 天津
    '1201': '天津市', '1202': '天津市',
    // 河北
    '1301': '石家庄市', '1302': '唐山市', '1303': '秦皇岛市', '1304': '邯郸市', '1305': '邢台市',
    '1306': '保定市', '1307': '张家口市', '1308': '承德市', '1309': '沧州市', '1310': '廊坊市', '1311': '衡水市',
    // 山西
    '1401': '太原市', '1402': '大同市', '1403': '阳泉市', '1404': '长治市', '1405': '晋城市',
    '1406': '朔州市', '1407': '晋中市', '1408': '运城市', '1409': '忻州市', '1410': '临汾市', '1411': '吕梁市',
    // 内蒙古
    '1501': '呼和浩特市', '1502': '包头市', '1503': '乌海市', '1504': '赤峰市', '1505': '通辽市',
    '1506': '鄂尔多斯市', '1507': '呼伦贝尔市', '1508': '巴彦淖尔市', '1509': '乌兰察布市',
    '1522': '兴安盟', '1525': '锡林郭勒盟', '1529': '阿拉善盟',
    // 辽宁
    '2101': '沈阳市', '2102': '大连市', '2103': '鞍山市', '2104': '抚顺市', '2105': '本溪市',
    '2106': '丹东市', '2107': '锦州市', '2108': '营口市', '2109': '阜新市', '2110': '辽阳市',
    '2111': '盘锦市', '2112': '铁岭市', '2113': '朝阳市', '2114': '葫芦岛市',
    // 吉林
    '2201': '长春市', '2202': '吉林市', '2203': '四平市', '2204': '辽源市', '2205': '通化市',
    '2206': '白山市', '2207': '松原市', '2208': '白城市', '2224': '延边朝鲜族自治州',
    // 黑龙江
    '2301': '哈尔滨市', '2302': '齐齐哈尔市', '2303': '鸡西市', '2304': '鹤岗市', '2305': '双鸭山市',
    '2306': '大庆市', '2307': '伊春市', '2308': '佳木斯市', '2309': '七台河市', '2310': '牡丹江市',
    '2311': '黑河市', '2312': '绥化市', '2327': '大兴安岭地区',
    // 上海
    '3101': '上海市', '3102': '上海市',
    // 江苏
    '3201': '南京市', '3202': '无锡市', '3203': '徐州市', '3204': '常州市', '3205': '苏州市',
    '3206': '南通市', '3207': '连云港市', '3208': '淮安市', '3209': '盐城市', '3210': '扬州市',
    '3211': '镇江市', '3212': '泰州市', '3213': '宿迁市',
    // 浙江
    '3301': '杭州市', '3302': '宁波市', '3303': '温州市', '3304': '嘉兴市', '3305': '湖州市',
    '3306': '绍兴市', '3307': '金华市', '3308': '衢州市', '3309': '舟山市', '3310': '台州市', '3311': '丽水市',
    // 安徽
    '3401': '合肥市', '3402': '芜湖市', '3403': '蚌埠市', '3404': '淮南市', '3405': '马鞍山市',
    '3406': '淮北市', '3407': '铜陵市', '3408': '安庆市', '3410': '黄山市', '3411': '滁州市',
    '3412': '阜阳市', '3413': '宿州市', '3415': '六安市', '3416': '亳州市', '3417': '池州市', '3418': '宣城市',
    // 福建
    '3501': '福州市', '3502': '厦门市', '3503': '莆田市', '3504': '三明市', '3505': '泉州市',
    '3506': '漳州市', '3507': '南平市', '3508': '龙岩市', '3509': '宁德市',
    // 江西
    '3601': '南昌市', '3602': '景德镇市', '3603': '萍乡市', '3604': '九江市', '3605': '新余市',
    '3606': '鹰潭市', '3607': '赣州市', '3608': '吉安市', '3609': '宜春市', '3610': '抚州市', '3611': '上饶市',
    // 山东
    '3701': '济南市', '3702': '青岛市', '3703': '淄博市', '3704': '枣庄市', '3705': '东营市',
    '3706': '烟台市', '3707': '潍坊市', '3708': '济宁市', '3709': '泰安市', '3710': '威海市',
    '3711': '日照市', '3713': '临沂市', '3714': '德州市', '3715': '聊城市', '3716': '滨州市', '3717': '菏泽市',
    // 河南
    '4101': '郑州市', '4102': '开封市', '4103': '洛阳市', '4104': '平顶山市', '4105': '安阳市',
    '4106': '鹤壁市', '4107': '新乡市', '4108': '焦作市', '4109': '濮阳市', '4110': '许昌市',
    '4111': '漯河市', '4112': '三门峡市', '4113': '南阳市', '4114': '商丘市', '4115': '信阳市',
    '4116': '周口市', '4117': '驻马店市', '4190': '省直辖县级行政区划',
    // 湖北
    '4201': '武汉市', '4202': '黄石市', '4203': '十堰市', '4205': '宜昌市', '4206': '襄阳市',
    '4207': '鄂州市', '4208': '荆门市', '4209': '孝感市', '4210': '荆州市', '4211': '黄冈市',
    '4212': '咸宁市', '4213': '随州市', '4228': '恩施土家族苗族自治州', '4290': '省直辖县级行政区划',
    // 湖南
    '4301': '长沙市', '4302': '株洲市', '4303': '湘潭市', '4304': '衡阳市', '4305': '邵阳市',
    '4306': '岳阳市', '4307': '常德市', '4308': '张家界市', '4309': '益阳市', '4310': '郴州市',
    '4311': '永州市', '4312': '怀化市', '4313': '娄底市', '4331': '湘西土家族苗族自治州',
    // 广东
    '4401': '广州市', '4402': '韶关市', '4403': '深圳市', '4404': '珠海市', '4405': '汕头市',
    '4406': '佛山市', '4407': '江门市', '4408': '湛江市', '4409': '茂名市', '4412': '肇庆市',
    '4413': '惠州市', '4414': '梅州市', '4415': '汕尾市', '4416': '河源市', '4417': '阳江市',
    '4418': '清远市', '4419': '东莞市', '4420': '中山市', '4451': '潮州市', '4452': '揭阳市', '4453': '云浮市',
    // 广西
    '4501': '南宁市', '4502': '柳州市', '4503': '桂林市', '4504': '梧州市', '4505': '北海市',
    '4506': '防城港市', '4507': '钦州市', '4508': '贵港市', '4509': '玉林市', '4510': '百色市',
    '4511': '贺州市', '4512': '河池市', '4513': '来宾市', '4514': '崇左市',
    // 海南
    '4601': '海口市', '4602': '三亚市', '4603': '三沙市', '4604': '儋州市', '4690': '省直辖县级行政区划',
    // 重庆
    '5001': '重庆市', '5002': '重庆市',
    // 四川
    '5101': '成都市', '5103': '自贡市', '5104': '攀枝花市', '5105': '泸州市', '5106': '德阳市',
    '5107': '绵阳市', '5108': '广元市', '5109': '遂宁市', '5110': '内江市', '5111': '乐山市',
    '5113': '南充市', '5114': '眉山市', '5115': '宜宾市', '5116': '广安市', '5117': '达州市',
    '5118': '雅安市', '5119': '巴中市', '5120': '资阳市', '5132': '阿坝藏族羌族自治州',
    '5133': '甘孜藏族自治州', '5134': '凉山彝族自治州',
    // 贵州
    '5201': '贵阳市', '5202': '六盘水市', '5203': '遵义市', '5204': '安顺市', '5205': '毕节市',
    '5206': '铜仁市', '5223': '黔西南布依族苗族自治州', '5226': '黔东南苗族侗族自治州', '5227': '黔南布依族苗族自治州',
    // 云南
    '5301': '昆明市', '5303': '曲靖市', '5304': '玉溪市', '5305': '保山市', '5306': '昭通市',
    '5307': '丽江市', '5308': '普洱市', '5309': '临沧市', '5323': '楚雄彝族自治州', '5325': '红河哈尼族彝族自治州',
    '5326': '文山壮族苗族自治州', '5328': '西双版纳傣族自治州', '5329': '大理白族自治州',
    '5331': '德宏傣族景颇族自治州', '5333': '怒江傈僳族自治州', '5334': '迪庆藏族自治州',
    // 西藏
    '5401': '拉萨市', '5402': '日喀则市', '5403': '昌都市', '5404': '林芝市', '5405': '山南市',
    '5406': '那曲市', '5425': '阿里地区',
    // 陕西
    '6101': '西安市', '6102': '铜川市', '6103': '宝鸡市', '6104': '咸阳市', '6105': '渭南市',
    '6106': '延安市', '6107': '汉中市', '6108': '榆林市', '6109': '安康市', '6110': '商洛市',
    // 甘肃
    '6201': '兰州市', '6202': '嘉峪关市', '6203': '金昌市', '6204': '白银市', '6205': '天水市',
    '6206': '武威市', '6207': '张掖市', '6208': '平凉市', '6209': '酒泉市', '6210': '庆阳市',
    '6211': '定西市', '6212': '陇南市', '6229': '临夏回族自治州', '6230': '甘南藏族自治州',
    // 青海
    '6301': '西宁市', '6302': '海东市', '6322': '海北藏族自治州', '6323': '黄南藏族自治州',
    '6325': '海南藏族自治州', '6326': '果洛藏族自治州', '6327': '玉树藏族自治州', '6328': '海西蒙古族藏族自治州',
    // 宁夏
    '6401': '银川市', '6402': '石嘴山市', '6403': '吴忠市', '6404': '固原市', '6405': '中卫市',
    // 新疆
    '6501': '乌鲁木齐市', '6502': '克拉玛依市', '6504': '吐鲁番市', '6505': '哈密市',
    '6523': '昌吉回族自治州', '6527': '博尔塔拉蒙古自治州', '6528': '巴音郭楞蒙古自治州',
    '6529': '阿克苏地区', '6530': '克孜勒苏柯尔克孜自治州', '6531': '喀什地区', '6532': '和田地区',
    '6540': '伊犁哈萨克自治州', '6542': '塔城地区', '6543': '阿勒泰地区', '6590': '自治区直辖县级行政区划'
  }
  const cityCode = areaCode.substring(0, 4)
  const nativePlace = cityMap[cityCode] || ''

  return { birthDate, gender, nativePlace }
}

// 姓名输入处理
function onNameInput() {
  if (!isEditingPlayer.value && playerForm.value.name) {
    playerForm.value.jerseyName = generateJerseyName(playerForm.value.name)
  }
  // 联系人自动填充姓名，可手动修改
  if (!playerForm.value.contactName) {
    playerForm.value.contactName = playerForm.value.name
  }
}

// 身份证号输入处理
function onIdCardInput() {
  const idCard = playerForm.value.idCard
  if (idCard && idCard.length === 18) {
    const parsed = parseIdCard(idCard)
    if (parsed) {
      playerForm.value.birthDate = parsed.birthDate
      playerForm.value.gender = parsed.gender
      if (!playerForm.value.nativePlace) {
        playerForm.value.nativePlace = parsed.nativePlace
      }
    }
  }
}

// 球员照片上传
async function beforePhotoUpload(file) {
  const isImage = file.type.startsWith('image/')
  const isLt2M = file.size / 1024 / 1024 < 2

  if (!isImage) {
    ElMessage.error('只能上传图片文件！')
    return false
  }
  if (!isLt2M) {
    ElMessage.error('图片大小不能超过 2MB！')
    return false
  }
  return true
}

// 处理头像裁剪成功
async function handleAvatarCropSuccess(base64Image) {
  try {
    uploadingPhoto.value = true

    // ★ 压缩到 300px 以内
    const compressed = await compressBase64(base64Image, 300)
    console.log('[TeamDetail] 球员头像压缩: ' + (compressed.length / 1024).toFixed(1) + 'KB')

    // base64 → Blob → File
    const base64Data = compressed.split(',')[1]
    const byteCharacters = atob(base64Data)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'image/png' })
    const file = new File([blob], `avatar-${Date.now()}.png`, { type: 'image/png' })

    // ★ 网页登录接口请求体限制较小，统一使用 32KB 小分片避免 HTTP 413
    const cloudPath = `player-photos/${teamId}/${Date.now()}-avatar.png`
    const result = await uploadScopedTeamFile(cloudPath, file, { chunkSize: 32 * 1024 })

    if (result.success) {
      playerForm.value.photoUrl = result.tempUrl || ''
      playerForm.value.photoFileID = result.fileId || result.fileID || ''
      ElMessage.success('头像上传成功！')
    } else {
      throw new Error(result.message || '上传失败')
    }
  } catch (err) {
    console.error('头像上传失败:', err)
    ElMessage.error('上传失败: ' + err.message)
  } finally {
    uploadingPhoto.value = false
  }
}

async function handlePhotoUpload(options) {
  uploadingPhoto.value = true
  try {
    const { file } = options
    const cloudPath = `player-photos/${teamId}/${Date.now()}-${file.name}`
    // ★ 分片上传（32KB/片）
    const result = await uploadScopedTeamFile(cloudPath, file, { chunkSize: 32 * 1024 })
    if (result.success) {
      playerForm.value.photoUrl = result.tempUrl || ''
      playerForm.value.photoFileID = result.fileId || result.fileID || ''
      ElMessage.success('照片上传成功！')
    } else {
      throw new Error(result.message || '上传失败')
    }
  } catch (err) {
    ElMessage.error('上传失败: ' + (err.message || '未知错误'))
  } finally {
    uploadingPhoto.value = false
  }
}

// 身份证照片上传
async function handleIdCardUpload(options, side) {
  uploadingIdCard.value[side] = true
  try {
    const { file } = options
    const cloudPath = `idcard-photos/${teamId}/${Date.now()}-${side}-${file.name}`
    // ★ 分片上传（32KB/片）
    const result = await uploadScopedTeamFile(cloudPath, file, { chunkSize: 32 * 1024 })
    if (result.success) {
      if (side === 'front') {
        playerForm.value.idCardFront = result.tempUrl || ''
      } else {
        playerForm.value.idCardBack = result.tempUrl || ''
      }
      ElMessage.success(`身份证${side === 'front' ? '正面' : '反面'}上传成功！`)
    } else {
      throw new Error(result.message || '上传失败')
    }
  } catch (err) {
    ElMessage.error('上传失败: ' + (err.message || '未知错误'))
  } finally {
    uploadingIdCard.value[side] = false
  }
}

function viewPlayerCard(row) {
  if (isTeamDataWorkspace.value) {
    ElMessageBox.alert(`出场场次：${statValue(row, 'appearances')}　出场时间：${statValue(row, 'minutes')} 分钟\n进球：${statValue(row, 'goals')}　黄牌：${statValue(row, 'yellowCards')}　红牌：${statValue(row, 'redCards')}`, row.name || '球员参赛数据')
    return
  }
  if (!sourceTournamentId.value) return router.push('/tournament-space')
  router.push({ path: `/tournaments/${sourceTournamentId.value}/players/${row._id}`, query: { teamId, divisionId: sourceDivisionId.value } })
}

function editPlayer(row) {
  if (isTeamDataWorkspace.value) return
  isEditingPlayer.value = true
  editingPlayerId.value = row._id
  editingPlayerOriginal.value = row
  playerForm.value = {
    name: row.name || '', gender: row.gender || 'male',
    birthDate: row.birthDate || '', idCard: row.idCard || '',
    nationality: row.nationality || '中国', nativePlace: row.nativePlace || '',
    jerseyNumber: row.jerseyNumber || 1, position: row.position || '',
    jerseyName: row.jerseyName || '', clothingSize: row.clothingSize || '',
    height: row.height || null, weight: row.weight || null,
    contactName: row.contactName || '', contactPhone: row.contactPhone || '',
    photoUrl: row.photoUrl || '', registerTime: row.registerTime || row.createTime || new Date().toISOString(),
    province: row.province || '', city: row.city || '', district: row.district || '', addressDetail: row.addressDetail || '',
    idCardFront: row.idCardFront || '', idCardBack: row.idCardBack || ''
  }
  showAddPlayer.value = true
}

async function removePlayer(row) {
  try {
    await ElMessageBox.confirm(`确定删除球员「${row.name}」吗？`, '删除确认', { type: 'warning' })
    if (!row._id) {
      ElMessage.error('球员记录缺少ID，无法删除')
      console.error('删除失败：row._id 为空', JSON.stringify(row))
      return
    }
    await deleteRecord('players', row._id)
    ElMessage.success('删除成功')
    await loadPlayers()
  } catch (err) {
    if (err !== 'cancel') {
      const msg = err?.message || String(err)
      console.error('删除球员失败:', err)
      ElMessage.error('删除失败: ' + msg)
    }
  }
}

async function clearPlayerRoster() {
  if (players.value.length === 0 || clearingPlayers.value) return

  const teamName = team.value.name || '当前球队'
  const playerCount = players.value.length
  try {
    await ElMessageBox.prompt(
      `将永久删除「${teamName}」的全部 ${playerCount} 条人员记录，且无法恢复。请输入“清空”确认。`,
      '清空球员名单',
      {
        type: 'error',
        confirmButtonText: '确认清空',
        cancelButtonText: '取消',
        inputPlaceholder: '请输入：清空',
        inputPattern: /^清空$/,
        inputErrorMessage: '请输入“清空”后再继续',
        confirmButtonClass: 'el-button--danger'
      }
    )
  } catch {
    return
  }

  clearingPlayers.value = true
  let deletedCount = 0
  const failedPlayers = []
  try {
    for (const player of [...players.value]) {
      if (!player._id) {
        failedPlayers.push(player.name || '未知人员')
        continue
      }
      try {
        await deleteRecord('players', player._id)
        deletedCount += 1
      } catch (err) {
        console.error(`清空名单时删除球员 ${player.name || player._id} 失败:`, err)
        failedPlayers.push(player.name || player._id)
      }
    }

    await loadPlayers()
    if (players.value.length === 0) {
      ElMessage.success(`已清空球员名单，共删除 ${deletedCount} 条记录`)
    } else if (deletedCount > 0) {
      ElMessage.warning(`已删除 ${deletedCount} 条，仍有 ${players.value.length} 条记录未删除，请重试`)
    } else {
      ElMessage.error(`清空失败，${failedPlayers.length || players.value.length} 条记录未删除`)
    }
  } finally {
    clearingPlayers.value = false
  }
}

async function submitPlayer() {
  if (!playerForm.value.name.trim()) {
    ElMessage.warning('请输入球员姓名')
    return
  }
  const keepImportedIdentity = isEditingPlayer.value && !playerForm.value.idCard && Boolean(editingPlayerOriginal.value?.identityDigest)
  if (!keepImportedIdentity && (!playerForm.value.idCard || playerForm.value.idCard.length !== 18)) {
    ElMessage.warning('请输入18位身份证号')
    return
  }
  if (!playerForm.value.photoUrl) {
    ElMessage.warning('请上传球员照片')
    return
  }
  // 检查球衣号是否有效（1-99）
  const jerseyNum = parseInt(playerForm.value.jerseyNumber)
  if (isNaN(jerseyNum) || jerseyNum < 1 || jerseyNum > 99) {
    ElMessage.warning('球衣号码必须在1-99之间')
    return
  }

  // 检查同一球队内是否已有相同身份证号的球员（避免重复加入同一球队）
  // 编辑时排除自己
  if (!isEditingPlayer.value) {
    try {
      const existInTeam = await queryList('players', {
        where: {
          idCard: playerForm.value.idCard,
          $or: [
            { teamId: teamId },
            { teamCode: teamId }
          ]
        }
      })
      if (existInTeam && existInTeam.length > 0) {
        ElMessage.warning('该球员已在本球队中，无需重复添加')
        submitting.value = false
        return
      }
    } catch (checkErr) {
      console.warn('检查球员重复失败，继续提交:', checkErr.message)
    }
  }

  // 检查同一球队内球衣号是否重复
  try {
    const jerseyWhere = {
      jerseyNumber: jerseyNum,
      $or: [
        { teamId: teamId },
        { teamCode: teamId }
      ]
    }
    // 编辑时排除自己
    if (isEditingPlayer.value && editingPlayerId.value) {
      jerseyWhere._id = { $ne: editingPlayerId.value }
    }
    const existJersey = await queryList('players', { where: jerseyWhere })
    if (existJersey && existJersey.length > 0) {
      ElMessage.warning(`球衣号码 ${jerseyNum} 已被球员「${existJersey[0].name}」使用`)
      submitting.value = false
      return
    }
  } catch (checkErr) {
    console.warn('检查球衣号重复失败，继续提交:', checkErr.message)
  }
  submitting.value = true
  try {
    // 如果有 photoFileID（云存储fileID），使用它作为永久保存的photoUrl
    // 这样避免临时URL过期导致图片无法显示
    const photoUrlToSave = playerForm.value.photoFileID || playerForm.value.photoUrl

    const data = {
      ...playerForm.value,
      playerId: generatePlayerId(team.value.teamCode || teamId, 'C'),
      // 球员归属同时写入主键和历史兼容字段，保证小程序与 PC 端读取一致。
      teamId: teamId,
      photoUrl: photoUrlToSave,
      teamCode: teamId,
      teamName: team.value.name,
      // 新注册时设置注册时间
      registerTime: isEditingPlayer.value ? playerForm.value.registerTime : new Date().toISOString()
    }
    if (keepImportedIdentity) delete data.idCard
    if (isEditingPlayer.value) {
      await updateRecord('players', editingPlayerId.value, data)
      ElMessage.success('保存成功')
    } else {
      await addRecord('players', data)

      // 同步到球员库（按身份证号去重）
      if (!isTournamentStaff) try {
        const owner = getCurrentOwner()
        const existWhere = owner
          ? { idCard: playerForm.value.idCard, owner }
          : { idCard: playerForm.value.idCard }
        const exist = await queryList('player_library', { where: existWhere })
        if (!exist || exist.length === 0) {
          await addRecord('player_library', {
            name: playerForm.value.name,
            idCard: playerForm.value.idCard,
            gender: playerForm.value.gender,
            birthDate: playerForm.value.birthDate,
            nativePlace: playerForm.value.nativePlace,
            nationality: playerForm.value.nationality,
            photoUrl: photoUrlToSave,
            photoFileID: playerForm.value.photoFileID || '',
            jerseyName: playerForm.value.jerseyName || '',
            position: playerForm.value.position || '',
            clothingSize: playerForm.value.clothingSize || '',
            height: playerForm.value.height || null,
            weight: playerForm.value.weight || null,
            contactName: playerForm.value.contactName || '',
            contactPhone: playerForm.value.contactPhone || '',
            province: playerForm.value.province || '',
            city: playerForm.value.city || '',
            district: playerForm.value.district || '',
            addressDetail: playerForm.value.addressDetail || '',
            idCardFront: playerForm.value.idCardFront || '',
            idCardBack: playerForm.value.idCardBack || '',
            owner: owner || '',
            creator: '',
            createTime: new Date(),
            updateTime: new Date()
          })
        }
      } catch (err) {
        console.warn('同步到球员库失败:', err)
      }

      ElMessage.success('添加成功')
    }
    showAddPlayer.value = false
    resetPlayerForm()
    loadPlayers()
  } catch (err) {
    ElMessage.error('操作失败: ' + err.message)
  } finally {
    submitting.value = false
  }
}

function openAddPlayer() {
  if (isTeamDataWorkspace.value) return
  resetPlayerForm()
  showAddPlayer.value = true
}

function openAddStaff() {
  staffForm.value = { name:'', type:'team_leader', phone:'', idCard:'', jerseyNumber:null }
  showAddStaff.value = true
}

async function loadTeamAccess() {
  if (!sourceTournamentId.value || !tournamentRelation.value?._id) return
  if (qaSnapshot) {
    teamAccessRows.value = [{ role:'team_leader', roleLabel:'领队', name:tournamentContactName.value, phone:maskedPhone.value === '—' ? '' : maskedPhone.value, accountType:'owner', status:'主账号' }]
    return
  }
  teamAccessLoading.value = true
  try {
    const result = await callFunction('organizerClaimInvite', {
      action:'listTeamAccess',
      tournamentId:sourceTournamentId.value,
      divisionId:sourceDivisionId.value || tournamentRelation.value.divisionId || 'default',
      tournamentTeamId:String(tournamentRelation.value._id)
    })
    if (!result?.success) throw new Error(result?.message || '球队管理权限加载失败')
    teamAccessRows.value = Array.isArray(result.personnel) ? result.personnel : []
    teamAccessPrimaryRole.value = result.primaryRole || teamAccessRows.value.find(item => item.accountType === 'owner')?.role || 'team_leader'
  } catch (error) {
    console.error('加载球队管理权限失败:', error)
    teamAccessRows.value = []
  } finally {
    teamAccessLoading.value = false
  }
}

async function openTeamAccess() {
  if (!tournamentRelation.value?._id) return ElMessage.error('当前球队参赛关系不存在，无法分配账号')
  if (!teamAccessRows.value.length) await loadTeamAccess()
  const existing = new Map(teamAccessRows.value.map(item => [item.role, item]))
  teamAccessForm.value = teamAccessRoleOptions.map(option => ({
    ...option,
    name:String(existing.get(option.role)?.name || ''),
    phone:String(existing.get(option.role)?.phone || '')
  }))
  teamAccessPrimaryRole.value = teamAccessRows.value.find(item => item.accountType === 'owner')?.role || teamAccessForm.value.find(item => item.name && item.phone)?.role || 'team_leader'
  showTeamAccess.value = true
}

function clearTeamAccessFormRow(item) {
  if (teamAccessPrimaryRole.value === item.role) return ElMessage.warning('主账号不能直接删除，请先选择其他主账号')
  item.name = ''
  item.phone = ''
}

async function deleteTeamAccess(row) {
  if (row.accountType === 'owner') return ElMessage.warning('主账号不能直接删除，请先在分配账号中设置新的主账号')
  try {
    await ElMessageBox.confirm(`确定删除“${row.name || row.roleLabel}”的球队管理权限吗？`, '删除权限', { confirmButtonText:'删除', cancelButtonText:'取消', type:'warning' })
    teamAccessDeletingRole.value = row.role
    const result = await callFunction('organizerClaimInvite', {
      action:'removeTeamAccess',
      tournamentId:sourceTournamentId.value,
      divisionId:sourceDivisionId.value || tournamentRelation.value.divisionId || 'default',
      tournamentTeamId:String(tournamentRelation.value._id),
      role:row.role
    })
    if (!result?.success) throw new Error(result?.message || '删除权限失败')
    teamAccessRows.value = Array.isArray(result.personnel) ? result.personnel : []
    ElMessage.success('账号权限已删除')
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(error.message || '删除权限失败')
  } finally {
    teamAccessDeletingRole.value = ''
  }
}

async function saveTeamAccess() {
  const personnel = teamAccessForm.value
    .map(item => ({ role:item.role, name:String(item.name || '').trim(), phone:String(item.phone || '').replace(/\D/g, '') }))
    .filter(item => item.name || item.phone)
  if (!personnel.length) return ElMessage.warning('请至少设置一名球队管理人员')
  for (const item of personnel) {
    if (!item.name || !/^1[3-9]\d{9}$/.test(item.phone)) return ElMessage.warning('请填写完整且有效的姓名和手机号')
  }
  const phones = personnel.map(item => item.phone)
  if (new Set(phones).size !== phones.length) return ElMessage.warning('同一手机号不能重复分配多个球队管理身份')
  if (!personnel.some(item => item.role === teamAccessPrimaryRole.value)) return ElMessage.warning('请选择一名主账号')
  teamAccessSaving.value = true
  try {
    const result = await callFunction('organizerClaimInvite', {
      action:'saveTeamAccess',
      tournamentId:sourceTournamentId.value,
      divisionId:sourceDivisionId.value || tournamentRelation.value.divisionId || 'default',
      tournamentTeamId:String(tournamentRelation.value._id),
      primaryRole:teamAccessPrimaryRole.value,
      personnel
    })
    if (!result?.success) throw new Error(result?.message || '球队管理权限保存失败')
    teamAccessRows.value = Array.isArray(result.personnel) ? result.personnel : []
    showTeamAccess.value = false
    ElMessage.success(result.ownerTransferPending ? '主账号转移已发起，请让新负责人用该手机号登录并扫描赛事认领码' : '球队管理权限已保存')
  } catch (error) {
    ElMessage.error(error.message || '球队管理权限保存失败')
  } finally {
    teamAccessSaving.value = false
  }
}

async function submitStaff() {
  const name = String(staffForm.value.name || '').trim()
  if (!name) return ElMessage.warning('请输入工作人员姓名')
  const roleLabels = { team_leader:'领队', head_coach:'主教练', doctor:'队医', other:'工作人员' }
  staffSubmitting.value = true
  try {
    await addRecord('coaches', {
      teamId,
      teamCode: teamId,
      teamName: team.value.name || '',
      name,
      type: staffForm.value.type,
      role: roleLabels[staffForm.value.type] || '工作人员',
      phone: String(staffForm.value.phone || '').trim(),
      idCard: String(staffForm.value.idCard || '').trim(),
      jerseyNumber: Number(staffForm.value.jerseyNumber || 0),
      source: 'organizer_manual_add',
      createTime: new Date().toISOString(),
      updateTime: new Date().toISOString()
    })
    ElMessage.success('工作人员已添加')
    showAddStaff.value = false
    await loadPlayers()
  } catch (error) {
    ElMessage.error(error.message || '添加工作人员失败')
  } finally {
    staffSubmitting.value = false
  }
}

function resetPlayerForm() {
  playerForm.value = {
    name: '', gender: 'male', birthDate: '', idCard: '',
    nationality: '中国', nativePlace: '', jerseyNumber: 1,
    position: '', jerseyName: '', clothingSize: '',
    height: null, weight: null,
    contactName: '', contactPhone: '',
    photoUrl: '', registerTime: new Date().toISOString(),
    province: '', city: '', district: '', addressDetail: '',
    idCardFront: '', idCardBack: ''
  }
  isEditingPlayer.value = false
  editingPlayerId.value = ''
  activeTab.value = 'manual'
}

// 身份证号脱敏显示
function maskIdCard(idCard) {
  if (!idCard || idCard.length !== 18) return idCard || '-'
  return idCard.substring(0, 6) + '********' + idCard.substring(14)
}

// 加载球员库列表（增量同步 + 排除当前球队已有球员 + 缓存机制）
async function loadPlayerLibrary(forceRefresh = false) {
  libraryLoading.value = true

  try {
    const owner = getCurrentOwner()

    // 1. 先获取当前球队已有球员的身份证号（用于排除）
    const existingIdCards = new Set()
    for (const p of players.value) {
      if (p.idCard) existingIdCards.add(p.idCard)
    }

    // 2. 如果有缓存且不是强制刷新，直接用缓存数据过滤
    if (!forceRefresh && libraryCacheLoaded.value && playerLibraryCache.value.length > 0) {
      let cachedList = playerLibraryCache.value.filter(p => !existingIdCards.has(p.idCard))

      // 如果有搜索关键词，在缓存中过滤
      const keyword = libraryKeyword.value.trim()
      if (keyword) {
        cachedList = cachedList.filter(p =>
          (p.name && p.name.includes(keyword)) ||
          (p.idCard && p.idCard.includes(keyword))
        )
      }

      playerLibraryList.value = cachedList
      libraryLoading.value = false
      return
    }

    // 3. 增量同步：把 players 集合中不在库里的球员同步到 player_library
    try {
      const allPlayers = await queryList('players', { limit: 1000, orderBy: { createTime: 'desc' } })
      if (allPlayers && allPlayers.length > 0) {
        // 先查库里已有的身份证号
        const libRes = await queryList('player_library', {
          where: owner ? { owner } : {},
          limit: 1000
        })
        const libIdCards = new Set((libRes || []).map(p => p.idCard).filter(Boolean))

        // 按身份证号去重，只同步不在库里的
        const seenIds = new Set()
        const toSync = []
        for (const p of allPlayers) {
          const idKey = p.idCard || p._id
          if (!idKey || seenIds.has(idKey) || libIdCards.has(p.idCard)) continue
          seenIds.add(idKey)
          toSync.push(p)
        }

        let synced = 0
        for (const p of toSync) {
          try {
            await addRecord('player_library', {
              name: p.name || '',
              idCard: p.idCard || '',
              gender: p.gender || 'male',
              birthDate: p.birthDate || '',
              nativePlace: p.nativePlace || '',
              nationality: p.nationality || '中国',
              photoUrl: p.photoUrl || '',
              photoFileID: p.photoFileID || '',
              jerseyName: p.jerseyName || '',
              position: p.position || '',
              clothingSize: p.clothingSize || '',
              height: p.height || null,
              weight: p.weight || null,
              contactName: p.contactName || '',
              contactPhone: p.contactPhone || '',
              province: p.province || '',
              city: p.city || '',
              district: p.district || '',
              addressDetail: p.addressDetail || '',
              idCardFront: p.idCardFront || '',
              idCardBack: p.idCardBack || '',
              owner: owner || '',
              creator: '',
              createTime: new Date(),
              updateTime: new Date()
            })
            synced++
          } catch (syncErr) {
            console.warn('同步球员到库失败:', p.name, syncErr)
          }
        }
        if (synced > 0) {
        }
      }
    } catch (syncErr) {
      console.warn('增量同步球员库失败:', syncErr)
    }

    // 4. 查询球员库（全量）
    const params = { orderBy: { createTime: 'desc' }, limit: 1000 }

    let list = []
    const where = owner ? { owner } : {}
    const listParams = { ...params, where: { ...(params.where || {}), ...where } }
    try {
      const res = await queryList('player_library', listParams)
      list = res || []
    } catch (queryErr) {
      console.warn('player_library 查询失败:', queryErr.message)
    }

    // 5. 排除当前球队已有球员
    list = list.filter(p => !existingIdCards.has(p.idCard))

    // 6. 转换 cloud:// 格式的头像为临时 URL
    for (const player of list) {
      if (player.photoUrl && player.photoUrl.startsWith('cloud://')) {
        player._photoFileID = player.photoUrl
        try {
          player.photoUrl = await getFileUrl(player.photoUrl)
        } catch (err) {
          console.warn('获取头像临时URL失败:', player.name, err)
        }
      }
    }

    // 7. 保存到缓存
    playerLibraryCache.value = [...list]
    libraryCacheLoaded.value = true

    // 8. 如果有搜索关键词，在前端过滤
    const keyword = libraryKeyword.value.trim()
    if (keyword) {
      list = list.filter(p =>
        (p.name && p.name.includes(keyword)) ||
        (p.idCard && p.idCard.includes(keyword))
      )
    }

    playerLibraryList.value = list
  } catch (err) {
    console.error('加载球员库失败:', err)
    playerLibraryList.value = []
  } finally {
    libraryLoading.value = false
  }
}

// 处理球员库复选框选择变化
function handleLibrarySelectionChange(selection) {
  selectedLibraryPlayers.value = selection
}

// 批量从球员库添加
async function batchAddFromLibrary() {
  if (selectedLibraryPlayers.value.length === 0) {
    ElMessage.warning('请先选择要添加的球员')
    return
  }

  batchAdding.value = true
  let successCount = 0
  let failCount = 0
  let skipCount = 0

  // 预先获取当前球队所有球员（用于重复检测和球衣号分配）
  let existingPlayers = []
  let usedJerseyNumbers = new Set()
  try {
    const [byTeamId, byTeamCode] = await Promise.all([
      queryList('players', { where: { teamId: teamId }, limit: 1000 }),
      queryList('players', { where: { teamCode: teamId }, limit: 1000 })
    ])
    const seen = new Set()
    for (const p of [...(byTeamId || []), ...(byTeamCode || [])]) {
      if (seen.has(p._id)) continue
      seen.add(p._id)
      existingPlayers.push(p)
      if (p.jerseyNumber) usedJerseyNumbers.add(parseInt(p.jerseyNumber))
    }
  } catch (e) {
    console.warn('预加载球队球员失败:', e)
  }

  // 构建已存在的球员标识集合（按 idCard 或 name+birthDate）
  const existingKeys = new Set()
  for (const p of existingPlayers) {
    if (p.idCard) {
      existingKeys.add(`idCard:${p.idCard}`)
    } else {
      existingKeys.add(`name:${p.name || ''}|birth:${p.birthDate || ''}`)
    }
  }

  for (const player of selectedLibraryPlayers.value) {
    try {
      // 检查是否已在球队中（支持无idCard的球员用 name+birthDate 判断）
      let isExist = false
      if (player.idCard) {
        isExist = existingKeys.has(`idCard:${player.idCard}`)
      } else {
        isExist = existingKeys.has(`name:${player.name || ''}|birth:${player.birthDate || ''}`)
      }
      if (isExist) {
        skipCount++
        continue
      }

      // 分配最小可用球衣号（1-99）
      let jerseyNum = 1
      for (let n = 1; n <= 99; n++) {
        if (!usedJerseyNumbers.has(n)) {
          jerseyNum = n
          usedJerseyNumbers.add(n)
          break
        }
      }

      const data = {
        name: player.name || '',
        gender: player.gender || 'male',
        birthDate: player.birthDate || '',
        idCard: player.idCard || '',
        nationality: player.nationality || '中国',
        nativePlace: player.nativePlace || '',
        jerseyNumber: jerseyNum,
        position: player.position || 'MF',
        jerseyName: player.jerseyName || '',
        clothingSize: player.clothingSize || '',
        height: player.height || null,
        weight: player.weight || null,
        contactName: player.contactName || '',
        contactPhone: player.contactPhone || '',
        photoUrl: player.photoUrl || '',
        photoFileID: player._photoFileID || player.photoFileID || '',
        registerTime: new Date().toISOString(),
        province: player.province || '',
        city: player.city || '',
        district: player.district || '',
        addressDetail: player.addressDetail || '',
        idCardFront: player.idCardFront || '',
        idCardBack: player.idCardBack || '',
        teamCode: teamId,
        teamName: team.value ? team.value.name : ''
      }
      if (!data.playerId) {
        data.playerId = generatePlayerId(team.value.teamCode || teamId, 'C');
      }

      await addRecord('players', data)
      successCount++
      // 标记为已存在，防止同批次重复添加
      if (player.idCard) {
        existingKeys.add(`idCard:${player.idCard}`)
      } else {
        existingKeys.add(`name:${player.name || ''}|birth:${player.birthDate || ''}`)
      }
    } catch (err) {
      console.error(`添加球员 ${player.name} 失败:`, err)
      failCount++
    }
  }

  batchAdding.value = false

  // 显示结果
  let msg = ''
  if (successCount > 0) msg += `成功添加 ${successCount} 名球员`
  if (skipCount > 0) msg += `${msg ? '，' : ''}${skipCount} 名已在球队中`
  if (failCount > 0) msg += `${msg ? '，' : ''}${failCount} 名失败`

  if (failCount === 0) {
    ElMessage.success(msg || '添加完成')
  } else {
    ElMessage.warning(msg || '添加完成')
  }

  // 清空选择
  selectedLibraryPlayers.value = []
  if (libraryTableRef.value) {
    libraryTableRef.value.clearSelection()
  }

  // 刷新列表
  loadPlayers()

  // 关闭弹窗
  if (successCount > 0) {
    showAddPlayer.value = false
  }
}

// 从球员库选择 — 填充到手动新建表单
function selectFromLibrary(player) {
  // 填充表单
  playerForm.value = {
    name: player.name || '',
    gender: player.gender || 'male',
    birthDate: player.birthDate || '',
    idCard: player.idCard || '',
    nationality: player.nationality || '中国',
    nativePlace: player.nativePlace || '',
    jerseyNumber: 1,
    position: player.position || '',
    jerseyName: player.jerseyName || '',
    clothingSize: player.clothingSize || '',
    height: player.height || null,
    weight: player.weight || null,
    contactName: player.contactName || '',
    contactPhone: player.contactPhone || '',
    photoUrl: player.photoUrl || '',
    photoFileID: player._photoFileID || player.photoFileID || '',
    registerTime: new Date().toISOString(),
    province: player.province || '',
    city: player.city || '',
    district: player.district || '',
    addressDetail: player.addressDetail || '',
    idCardFront: player.idCardFront || '',
    idCardBack: player.idCardBack || ''
  }

  // 更新省市区联动
  if (playerForm.value.province) {
    cities.value = cityMapData[playerForm.value.province] || []
  }
  if (playerForm.value.city) {
    districts.value = districtMapData[playerForm.value.city] || []
  }

  // 切换到手新建选项卡
  activeTab.value = 'manual'
  ElMessage.success(`已选择「${player.name}」，请确认球衣号和位置后提交`)
}

// AI生成队徽成功回调
async function handleAISuccess(url) {
  try {
    // 使用云函数更新（确保权限）
    const res = await callFunction('webBatchUpdate', {
      collection: 'teams',
      id: teamId,
      data: { logo: url, logoUrl: url }
    })

    // 同时更新本地数据
    team.value.logo = url
    team.value.logoUrl = url

    // 强制刷新UI
    team.value = { ...team.value }

    ElMessage.success('队徽已更新')
  } catch (err) {
    console.error('更新失败:', err)
    ElMessage.error('更新失败: ' + (err.message || '未知错误'))
  }
}

watch(showAddPlayer, (val) => {
  if (val) {
    if (!isTournamentStaff) loadPlayerLibrary()
  } else {
    resetPlayerForm()
    clearImportData()
  }
})

// 编辑球队
function editTeam() {
  teamEditForm.value = {
    name: team.value.name || '',
    teamCode: team.value.teamCode || '',
    establishedDate: team.value.establishedDate || '',
    shortName: team.value.shortName || '',
    logoUrl: team.value.logoUrl || team.value.logo || '',
    description: team.value.description || ''
  }
  showEditTeam.value = true
}

// ========== 批量导入球员（Excel）==========

const IMPORT_INSTRUCTION_START_ROW = 38

// 位置映射：中文 → 代码
const POSITION_MAP_CN = {
  '守门员': 'GK', '门将': 'GK',
  '后卫': 'DF', '边后卫': 'DF', '中后卫': 'DF',
  '前卫': 'MF', '中场': 'MF',
  '前锋': 'FW', '前峰': 'FW'
}
const PLAYER_ROLE_NAMES = ['队员', '球员', '运动员', '']
const STAFF_ROLE_TYPE_MAP = {
  '主教练': 'head_coach',
  '教练': 'head_coach',
  '助理教练': 'assistant_coach',
  '守门员教练': 'goalkeeper_coach',
  '领队': 'team_leader',
  '队医': 'doctor',
  '翻译': 'translator',
  '新闻官': 'press_officer',
  '其他': 'other'
}
const STAFF_ROLE_LABEL_MAP = {
  head_coach: '主教练',
  assistant_coach: '助理教练',
  goalkeeper_coach: '守门员教练',
  team_leader: '领队',
  doctor: '队医',
  translator: '翻译',
  press_officer: '新闻官',
  other: '其他'
}
const COACH_STAFF_TYPES = ['head_coach', 'assistant_coach', 'goalkeeper_coach']
const isStaffRole = (role) => !!STAFF_ROLE_TYPE_MAP[String(role || '').trim()]
const getImportRoleSuffix = (staffType) => COACH_STAFF_TYPES.includes(staffType) ? 'A' : 'B'
const normalizeJerseyNumber = (value) => {
  const text = String(value || '').trim()
  if (!text) return ''
  return /^\d+$/.test(text) ? String(parseInt(text, 10)) : text
}
const normalizeJerseyName = (value) => String(value || '').trim().toUpperCase()

// 下载导入模板
function downloadImportTemplate() {
  const a = document.createElement('a')
  a.href = `${import.meta.env.BASE_URL}templates/player-import-template.xlsx`
  a.download = '球员导入模板.xlsx'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  ElMessage.success('模板下载成功，请填写后重新上传')
}

// 处理导入文件选择
async function handleImportFileChange(file) {
  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const XLSX = await import('xlsx')
      const data = new Uint8Array(e.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 })

      if (!jsonData || jsonData.length < 2) {
        ElMessage.error('Excel 文件为空或格式不正确')
        return
      }

      // 查找表头行（找包含"姓名"的那一行）
      let headerRowIndex = -1
      for (let i = 0; i < Math.min(jsonData.length, 10); i++) {
        const row = jsonData[i]
        if (row && row.some(cell => String(cell || '').includes('姓名'))) {
          headerRowIndex = i
          break
        }
      }
      if (headerRowIndex === -1) {
        ElMessage.error('未找到列头行（需包含"姓名"列），请确认使用模板格式')
        return
      }

      const headers = jsonData[headerRowIndex].map(h => String(h || '').trim())
      const candidateRows = jsonData.slice(headerRowIndex + 1)
        .map((row, index) => ({ row, excelRowNumber: headerRowIndex + index + 2 }))
        .filter(({ row }) => row && row.some(c => String(c || '').trim()))

      if (candidateRows.length === 0) {
        ElMessage.warning('Excel 中没有有效的数据行')
        return
      }

      // 列索引映射（优先精确匹配，再模糊匹配，避免"球衣名"误匹配"姓名"等）
      function findCol(keywords, excludes = []) {
        // 1. 精确匹配
        let idx = headers.findIndex(h => keywords.some(k => h === k))
        // 2. 模糊匹配（排除含特定关键词的列）
        if (idx === -1) {
          idx = headers.findIndex(h =>
            keywords.some(k => h.includes(k)) &&
            !excludes.some(e => h.includes(e))
          )
        }
        return idx
      }

      const colMap = {
        serial: findCol(['序号', '编号', '顺序'], []),
        name: findCol(['姓名'], ['球衣', '号码', '球衣名', '缩写', '拼音']),
        idCard: findCol(['身份证号', '身份证', '证件号', '证件']),
        jerseyNumber: findCol(['球号', '号码'], ['身份证']),
        jerseyName: findCol(['球衣名', '姓名号码', '球衣名缩写', '拼音名'], []),
        position: findCol(['球场位置', '位置', '场上位置'], ['关联职位']),
        height: findCol(['身高(cm)', '身高']),
        weight: findCol(['体重(kg)', '体重(KG)', '体重']),
        contactName: findCol(['联系人', '联系人姓名', '联系姓名']),
        contactPhone: findCol(['联系电话', '手机号', '手机', '电话', '联系方式']),
        relatedPosition: findCol(['关联职位', '职务', '职位', '关联'], ['球场位置'])
      }

      // 调试日志 & 用户可见提示
      const info = {
        姓名列: colMap.name >= 0 ? `第${colMap.name + 1}列「${headers[colMap.name]}」` : '未找到',
        身份证列: colMap.idCard >= 0 ? `第${colMap.idCard + 1}列「${headers[colMap.idCard]}」` : '未找到',
        球号列: colMap.jerseyNumber >= 0 ? `第${colMap.jerseyNumber + 1}列「${headers[colMap.jerseyNumber]}」` : '未找到',
        球衣名列: colMap.jerseyName >= 0 ? `第${colMap.jerseyName + 1}列「${headers[colMap.jerseyName]}」` : '未找到（将自动生成）',
        位置列: colMap.position >= 0 ? `第${colMap.position + 1}列「${headers[colMap.position]}」` : '未找到',
        联系人列: colMap.contactName >= 0 ? `第${colMap.contactName + 1}列「${headers[colMap.contactName]}」` : '未找到',
        联系电话列: colMap.contactPhone >= 0 ? `第${colMap.contactPhone + 1}列「${headers[colMap.contactPhone]}」` : '未找到',
        序号列: colMap.serial >= 0 ? `第${colMap.serial + 1}列「${headers[colMap.serial]}」` : '未找到（不影响导入）',
        关联职位列: colMap.relatedPosition >= 0 ? `第${colMap.relatedPosition + 1}列「${headers[colMap.relatedPosition]}」` : '未找到',
      }
      colDetectInfo.value = info
      console.log('🔍 Excel 列检测结果:', info)

      if (colMap.name === -1) {
        ElMessage.error('未找到"姓名"列，请使用模板格式')
        return
      }

      const parsed = []
      const errors = []
      const instructionKeywords = ['填写说明', '姓名为必填', '球场位置可选', '关联职位可选', '球衣名会', '示例行请', '导入前删除']
      const isInstructionRow = (row, excelRowNumber) => {
        const rowText = (row || []).map(c => String(c || '').trim()).filter(Boolean).join(' ')
        if (!rowText) return true
        if (excelRowNumber >= IMPORT_INSTRUCTION_START_ROW) return true
        return instructionKeywords.some(keyword => rowText.includes(keyword))
      }

      candidateRows.forEach(({ row, excelRowNumber }) => {
        if (isInstructionRow(row, excelRowNumber)) return

        const serial = String(colMap.serial >= 0 ? (row[colMap.serial] || '') : '').trim()
        const name = String(colMap.name >= 0 ? (row[colMap.name] || '') : '').trim()
        const idCard = String(colMap.idCard >= 0 ? (row[colMap.idCard] || '') : '').trim()
        const jerseyNumberStr = String(colMap.jerseyNumber >= 0 ? (row[colMap.jerseyNumber] || '') : '').trim()
        const positionCn = String(colMap.position >= 0 ? (row[colMap.position] || '') : '').trim()
        const heightStr = String(colMap.height >= 0 ? (row[colMap.height] || '') : '').trim()
        const weightStr = String(colMap.weight >= 0 ? (row[colMap.weight] || '') : '').trim()
        const contactName = String(colMap.contactName >= 0 ? (row[colMap.contactName] || '') : '').trim()
        const contactPhone = String(colMap.contactPhone >= 0 ? (row[colMap.contactPhone] || '') : '').trim()
        const relatedPosition = String(colMap.relatedPosition >= 0 ? (row[colMap.relatedPosition] || '') : '').trim()
        const jerseyNameFromExcel = String(colMap.jerseyName >= 0 ? (row[colMap.jerseyName] || '') : '').trim()
        const normalizedJerseyNumber = normalizeJerseyNumber(jerseyNumberStr)
        const normalizedJerseyName = normalizeJerseyName(jerseyNameFromExcel)

        const unchangedExample = serial === '1' && name === '张三' && idCard === '410204200001010011' &&
          jerseyNumberStr === '10' && positionCn === '前卫' && heightStr === '178' && weightStr === '70' &&
          contactName === '张三' && contactPhone === '13800138000' && ['队员', '球员'].includes(relatedPosition)
        if (unchangedExample) return

        if (!name) {
          errors.push(`第 ${excelRowNumber} 行：姓名为空，已跳过`)
          return
        }

        const normalizedRole = relatedPosition || '队员'
        const importKind = isStaffRole(normalizedRole) ? 'staff' : 'player'
        const player = {
          name,
          idCard,
          jerseyNumber: importKind === 'staff' ? '' : normalizedJerseyNumber,
          position: importKind === 'staff' ? '' : (POSITION_MAP_CN[positionCn] || ''),
          height: heightStr || '',
          weight: weightStr || '',
          contactName: contactName || '',
          contactPhone: contactPhone || '',
          relatedPosition: normalizedRole,
          jerseyName: importKind === 'staff' ? '' : normalizedJerseyName,
          _importKind: importKind,
          _staffType: STAFF_ROLE_TYPE_MAP[normalizedRole] || '',
          _roleSuffix: importKind === 'staff' ? getImportRoleSuffix(STAFF_ROLE_TYPE_MAP[normalizedRole] || 'other') : 'C',
          _importKindLabel: importKind === 'staff'
            ? (getImportRoleSuffix(STAFF_ROLE_TYPE_MAP[normalizedRole] || 'other') === 'A' ? '教练' : '工作人员')
            : '球员',
          _error: false
        }

        // 自动生成球衣名（仅球员且 Excel 中没有提供时）
        if (player._importKind === 'player' && !player.jerseyName && typeof generateJerseyName === 'function') {
          player.jerseyName = generateJerseyName(name)
        }

        // 验证：工作人员允许不填球号和球场位置，但姓名、身份证号仍保留为基础身份信息
        if (!idCard) {
          player._error = true
          errors.push(`第 ${excelRowNumber} 行「${name}」：身份证号为空`)
        }
        if (player._importKind === 'player' && relatedPosition && !PLAYER_ROLE_NAMES.includes(relatedPosition) && !isStaffRole(relatedPosition)) {
          player._error = true
          errors.push(`第 ${excelRowNumber} 行「${name}」：关联职位「${relatedPosition}」无法识别`)
        }

        parsed.push(player)
      })

      importParsedData.value = parsed
      importErrors.value = errors

      if (parsed.length > 0) {
        ElMessage.success(`成功解析 ${parsed.length} 条人员记录${errors.length > 0 ? `，${errors.length} 条有警告` : ''}`)
      } else {
        ElMessage.warning('未解析到有效人员数据')
      }
    } catch (err) {
      console.error('导入解析失败:', err)
      ElMessage.error('Excel 解析失败：' + (err.message || '格式错误'))
    }
  }
  reader.readAsArrayBuffer(file.raw || file)
}

// 清空导入数据
// ========== 快捷模式：Word 报名表导入（姓名 + 号码 + 出生日期，免身份证）==========
const WORD_NAME_CELL_RE = /姓名\s*[：:]\s*(.*?)\s*号码\s*[：:]\s*([0-9０-９]*)/
const WORD_BIRTH_CELL_RE = /出生\s*(\d{4})\s*年\s*(\d{1,2})\s*月(?:\s*(\d{1,2})\s*日)?/
const WORD_TEAM_LOGO_MAX_SIZE = 10 * 1024 * 1024
const WORD_PLAYER_PHOTO_MAX_SIZE = 10 * 1024 * 1024

function normalizeFullWidthDigits(text) {
  return String(text || '').replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
}

function createWordImageFile(dataUrl, baseName) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i)
  if (!match) throw new Error('报名表图片格式不受支持')
  const mimeType = match[1].toLowerCase()
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1]
  return new File([bytes], `${baseName}.${extension}`, { type: mimeType })
}

// 解析报名表头部信息（队名/人数/组别/队服颜色），仅用于预览核对，不写入数据库
function parseWordFormHeader(fullText) {
  const info = {}
  const pick = (re) => {
    const m = fullText.match(re)
    return m ? m[1].trim() : ''
  }
  const teamName = pick(/队\s*名\s*[：:]\s*(.*?)\s*队员人数/)
  const playerCount = pick(/队员人数\s*[：:]\s*(\d+)/)
  const coachCount = pick(/教练人数\s*[：:]\s*(\d+)/)
  const group = pick(/参赛组别\s*[：:]\s*(\S+)/)
  const color1 = pick(/比赛服装颜色\s*1\s*[：:]\s*(\S+)/)
  const color2 = pick(/比赛服装颜色\s*2\s*[：:]\s*(\S+)/)
  if (teamName) info.队名 = teamName
  if (playerCount) info.队员人数 = playerCount
  if (coachCount) info.教练人数 = coachCount
  if (group) info.参赛组别 = group
  if (color1) info.队服颜色1 = color1
  if (color2) info.队服颜色2 = color2
  return info
}

async function handleWordImportFileChange(file) {
  const fileName = (file.name || '').toLowerCase()
  if (!fileName.endsWith('.docx')) {
    ElMessage.error('快捷模式仅支持 .docx 格式的 Word 报名表')
    return
  }
  try {
    const rawFile = file.raw || file
    const arrayBuffer = await rawFile.arrayBuffer()
    const mammoth = (await import('mammoth')).default
    const result = await mammoth.convertToHtml({ arrayBuffer })
    const doc = new DOMParser().parseFromString(result.value || '', 'text/html')
    const parsed = []
    const warnings = []

    // 报名表队徽可能位于表头表格内：先识别所有“姓名/号码”上方的球员照片，再取首张非球员图片作为队徽
    wordTeamLogoPreview.value = ''
    wordTeamLogoFile.value = null
    const wordPlayerPhotoImages = new Set()
    Array.from(doc.querySelectorAll('table')).forEach(table => {
      const rows = Array.from(table.querySelectorAll('tr'))
      rows.forEach((tr, rowIdx) => {
        if (rowIdx === 0) return
        const cells = Array.from(tr.querySelectorAll('td, th'))
        const previousCells = Array.from(rows[rowIdx - 1].querySelectorAll('td, th'))
        cells.forEach((cell, cellIdx) => {
          if (!(cell.textContent || '').match(WORD_NAME_CELL_RE)) return
          const photoImage = previousCells[cellIdx]?.querySelector('img')
          if (photoImage) wordPlayerPhotoImages.add(photoImage)
        })
      })
    })
    const headerLogoImage = Array.from(doc.querySelectorAll('img')).find(img => !wordPlayerPhotoImages.has(img))
    const headerLogoSource = headerLogoImage?.getAttribute('src') || ''
    if (headerLogoSource) {
      try {
        const logoFile = createWordImageFile(headerLogoSource, 'word-team-logo')
        if (logoFile.size > WORD_TEAM_LOGO_MAX_SIZE) {
          warnings.push('报名表页首队徽超过 10MB，已跳过队徽补充')
        } else {
          wordTeamLogoPreview.value = headerLogoSource
          wordTeamLogoFile.value = logoFile
        }
      } catch (logoError) {
        console.warn('解析报名表页首队徽失败:', logoError)
        warnings.push('报名表页首队徽无法解析，不影响球员名单导入')
      }
    } else if (!teamHasLogo.value) {
      warnings.push('当前球队没有队徽，且报名表页首未识别到可用队徽')
    }

    // 头部信息（队名/人数/组别/队服颜色）
    const fullText = (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
    wordFormInfo.value = parseWordFormHeader(fullText)

    // 表格解析：「姓名：X 号码：N」单元格所在行，下一行同列单元格是其「出生」日期
    const tables = Array.from(doc.querySelectorAll('table'))
    tables.forEach(table => {
      const rows = Array.from(table.querySelectorAll('tr'))
      rows.forEach((tr, rowIdx) => {
        const cells = Array.from(tr.querySelectorAll('td, th'))
        const previousCells = rowIdx > 0
          ? Array.from(rows[rowIdx - 1].querySelectorAll('td, th'))
          : []
        const nextCells = rowIdx + 1 < rows.length
          ? Array.from(rows[rowIdx + 1].querySelectorAll('td, th'))
          : []
        cells.forEach((cell, cellIdx) => {
          const m = (cell.textContent || '').match(WORD_NAME_CELL_RE)
          if (!m) return
          const name = (m[1] || '').trim()
          if (!name) return
          const jerseyNumber = normalizeJerseyNumber(normalizeFullWidthDigits((m[2] || '').trim()))
          let photoFile = null
          let photoPreview = ''
          const photoImage = previousCells[cellIdx]?.querySelector('img')
          const photoSource = photoImage?.getAttribute('src') || ''
          if (photoSource) {
            try {
              const candidatePhoto = createWordImageFile(photoSource, `word-player-${name}`)
              if (candidatePhoto.size > WORD_PLAYER_PHOTO_MAX_SIZE) {
                warnings.push(`「${name}」：报名表照片超过 10MB，已跳过照片导入`)
              } else {
                photoFile = candidatePhoto
                photoPreview = photoSource
              }
            } catch (photoError) {
              console.warn(`解析「${name}」报名表照片失败:`, photoError)
              warnings.push(`「${name}」：报名表照片无法解析`)
            }
          }
          let birthDate = ''
          const birthText = nextCells[cellIdx] ? (nextCells[cellIdx].textContent || '') : ''
          const bm = birthText.match(WORD_BIRTH_CELL_RE)
          if (bm) {
            const birthDay = bm[3] || '1'
            birthDate = `${bm[1]}-${String(bm[2]).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`
          } else {
            warnings.push(`「${name}」：未解析到出生日期，导入后可手动补充`)
          }
          parsed.push({
            name,
            idCard: '',
            jerseyNumber,
            position: '',
            height: '',
            weight: '',
            contactName: '',
            contactPhone: '',
            relatedPosition: '队员',
            jerseyName: typeof generateJerseyName === 'function' ? generateJerseyName(name) : '',
            birthDate,
            _importKind: 'player',
            _staffType: '',
            _roleSuffix: 'C',
            _importKindLabel: '球员',
            _photoFile: photoFile,
            _photoPreview: photoPreview,
            _error: false
          })
        })
      })
    })

    if (parsed.length === 0) {
      ElMessage.error('未从 Word 中解析到球员信息，请确认报名表表格中包含「姓名/号码/出生日期」')
      return
    }

    importParsedData.value = parsed
    importErrors.value = warnings
    colDetectInfo.value = {}
    const photoCount = parsed.filter(player => player._photoFile).length
    ElMessage.success(`已从 Word 报名表解析到 ${parsed.length} 名球员、${photoCount} 张球员照片`)
  } catch (err) {
    console.error('解析 Word 报名表失败:', err)
    ElMessage.error('Word 报名表解析失败，请确认文件格式正确（.docx）')
  }
}

function clearImportData() {
  importParsedData.value = []
  importErrors.value = []
  colDetectInfo.value = {}
  wordFormInfo.value = {}
  wordTeamLogoPreview.value = ''
  wordTeamLogoFile.value = null
}

// ========== 批量导入头像（ZIP，按完整姓名匹配）==========

const AVATAR_IMAGE_EXT_RE = /\.(jpe?g|png|webp)$/i
const AVATAR_ZIP_MAX_SIZE = 200 * 1024 * 1024
const AVATAR_SINGLE_MAX_SIZE = 10 * 1024 * 1024

function getAvatarPhotoName(path) {
  const fileName = String(path || '').split('/').pop() || ''
  return fileName.replace(AVATAR_IMAGE_EXT_RE, '').trim()
}

function getAvatarMimeType(fileName) {
  const lower = String(fileName || '').toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

function getAvatarTargetLabel(row) {
  const player = players.value.find(item => item._id === row.selectedPlayerId)
  if (!player) return '-'
  return `${player.name}（${player.playerId || player.jerseyNumber || '无编号'}）`
}

function revokeAvatarPreviewUrls() {
  avatarImportRows.value.forEach(row => {
    if (row.previewUrl) URL.revokeObjectURL(row.previewUrl)
  })
}

function clearAvatarImport() {
  revokeAvatarPreviewUrls()
  avatarImportRows.value = []
  avatarZipName.value = ''
}

function closeBatchAvatarImport(done) {
  if (avatarBatchProcessing.value) {
    ElMessage.warning('头像正在处理中，请稍候')
    return
  }
  clearAvatarImport()
  if (typeof done === 'function') done()
  else showBatchAvatarImport.value = false
}

async function handleAvatarZipChange(uploadFile) {
  const file = uploadFile?.raw || uploadFile
  if (!file) return

  if (!String(file.name || '').toLowerCase().endsWith('.zip')) {
    ElMessage.error('请选择 ZIP 压缩包')
    return
  }
  if (file.size > AVATAR_ZIP_MAX_SIZE) {
    ElMessage.error('ZIP 压缩包不能超过 200MB')
    return
  }
  if (!players.value.length) {
    ElMessage.warning('当前球队还没有球员，请先批量导入名单')
    return
  }

  let loadingMessage = null
  try {
    loadingMessage = ElMessage({ message: '正在解压并匹配头像...', type: 'info', duration: 0 })
    const zip = await JSZip.loadAsync(file)
    const imageEntries = Object.values(zip.files).filter(entry => {
      if (entry.dir || !AVATAR_IMAGE_EXT_RE.test(entry.name)) return false
      const normalizedPath = entry.name.replace(/\\/g, '/')
      return !normalizedPath.includes('__MACOSX/') && !normalizedPath.split('/').pop().startsWith('.')
    })

    if (!imageEntries.length) {
      loadingMessage.close()
      ElMessage.error('ZIP 中没有找到 JPG、PNG 或 WEBP 照片')
      return
    }

    const photoNameCounts = new Map()
    imageEntries.forEach(entry => {
      const name = getAvatarPhotoName(entry.name)
      photoNameCounts.set(name, (photoNameCounts.get(name) || 0) + 1)
    })

    const rows = []
    for (const entry of imageEntries) {
      const fileName = entry.name.split('/').pop()
      const photoName = getAvatarPhotoName(entry.name)
      const blob = await entry.async('blob')
      const candidates = players.value.filter(player => String(player.name || '').trim() === photoName)
      const duplicatePhotos = (photoNameCounts.get(photoName) || 0) > 1
      const autoMatched = candidates.length === 1 && !duplicatePhotos
      let issue = ''
      if (duplicatePhotos) issue = `ZIP 中存在 ${photoNameCounts.get(photoName)} 张“${photoName}”照片`
      else if (candidates.length > 1) issue = `球队中存在 ${candidates.length} 名“${photoName}”球员`
      else if (candidates.length === 0) issue = `没有找到姓名为“${photoName}”的球员`

      rows.push({
        fileName,
        photoName,
        blob,
        previewUrl: URL.createObjectURL(blob),
        selectedPlayerId: autoMatched ? candidates[0]._id : '',
        needsManual: !autoMatched,
        issue,
        ignored: false,
        status: 'pending',
        progress: 0,
        error: ''
      })
    }

    clearAvatarImport()
    avatarZipName.value = file.name
    avatarImportRows.value = rows
    loadingMessage.close()

    const abnormalRows = rows.filter(row => row.needsManual)
    if (abnormalRows.length) {
      await ElMessageBox.alert(
        `共读取 ${rows.length} 张照片，其中 ${abnormalRows.length} 张存在重名、重复或未匹配情况。请在列表中人工选择对应球员，或忽略不需要的照片。`,
        '发现头像匹配异常',
        { confirmButtonText: '去处理', type: 'warning' }
      )
    } else {
      ElMessage.success(`已读取并匹配 ${rows.length} 张头像`)
    }
  } catch (err) {
    loadingMessage?.close()
    console.error('头像 ZIP 解析失败:', err)
    ElMessage.error('ZIP 解析失败：' + (err.message || '文件格式错误'))
  }
}

function validateAvatarImage(row) {
  return new Promise((resolve, reject) => {
    if (!row.blob || row.blob.size === 0) {
      reject(new Error('照片文件为空'))
      return
    }
    if (row.blob.size > AVATAR_SINGLE_MAX_SIZE) {
      reject(new Error('单张照片不能超过 10MB'))
      return
    }

    const image = new Image()
    const url = URL.createObjectURL(row.blob)
    image.onload = () => {
      URL.revokeObjectURL(url)
      if (image.width < 160 || image.height < 160) {
        reject(new Error('照片分辨率过低，宽高至少 160px'))
        return
      }
      resolve(true)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('照片已损坏或格式不支持'))
    }
    image.src = url
  })
}

function dataUrlToFile(dataUrl, fileName) {
  const parts = String(dataUrl || '').split(',')
  if (parts.length !== 2) throw new Error('处理后的头像数据无效')
  const mimeMatch = parts[0].match(/:(.*?);/)
  const mime = mimeMatch ? mimeMatch[1] : 'image/png'
  const binary = atob(parts[1])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], fileName, { type: mime })
}

async function createWordImageForDirectUpload(dataUrl, fileName) {
  // webLoginApi 的 JSON 请求体限制较小；18KB PNG 转成 Base64 后仍处于安全范围
  const maxUploadBytes = 18 * 1024
  const candidateSizes = [220, 180, 150, 128, 112, 96, 80, 64]
  for (const maxSize of candidateSizes) {
    const compressedDataUrl = await compressBase64(dataUrl, maxSize)
    const candidateFile = dataUrlToFile(compressedDataUrl, fileName)
    if (candidateFile.size <= maxUploadBytes) return candidateFile
  }
  throw new Error('报名表图片压缩后仍超过上传限制，请更换图片后重试')
}

function compressAvatarForAudit(file, maxWidth = 250, quality = 0.5) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)
    image.onload = () => {
      URL.revokeObjectURL(url)
      const ratio = Math.min(1, maxWidth / image.width)
      const width = Math.max(1, Math.round(image.width * ratio))
      const height = Math.max(1, Math.round(image.height * ratio))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(image, 0, 0, width, height)
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('照片预压缩失败')),
        'image/jpeg',
        quality
      )
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('照片加载失败'))
    }
    image.src = url
  })
}

function blobToRawBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '')
    reader.onerror = () => reject(new Error('照片读取失败'))
    reader.readAsDataURL(blob)
  })
}

async function auditAndRemoveAvatarBackground(sourceFile) {
  const auditFile = sourceFile.size > 50 * 1024
    ? await compressAvatarForAudit(sourceFile)
    : sourceFile
  const imageBase64 = await blobToRawBase64(auditFile)
  const result = await callFunction('baiduRemoveBg', {
    action: 'removeBackground',
    imageBase64,
    ...(isTournamentStaff ? { tournamentId:sourceTournamentId.value } : {})
  })
  if (!result.success || !result.data) {
    throw new Error(result.message || '未检测到有效人像')
  }
  if (Number(result.personNum || 0) !== 1) {
    throw new Error(`照片检测到 ${result.personNum || 0} 个人像，请使用单人照片`)
  }
  return `data:image/png;base64,${result.data}`
}

async function processAvatarImportRow(row) {
  const targetPlayer = players.value.find(player => player._id === row.selectedPlayerId)
  if (!targetPlayer) throw new Error('未选择对应球员')

  row.status = 'auditing'
  row.error = ''
  row.progress = 0
  await validateAvatarImage(row)

  const sourceFile = new File([row.blob], row.fileName, { type: getAvatarMimeType(row.fileName) })
  const processedAvatar = await auditAndRemoveAvatarBackground(sourceFile)

  row.status = 'processing'
  const compressedDataUrl = await compressBase64(processedAvatar, 300)
  const processedFile = dataUrlToFile(compressedDataUrl, `${row.photoName || 'avatar'}-${Date.now()}.png`)

  row.status = 'uploading'
  const safeName = String(targetPlayer.playerId || targetPlayer._id || row.photoName).replace(/[^a-zA-Z0-9_-]/g, '') || 'avatar'
  const cloudPath = `player-photos/${teamId}/batch-${Date.now()}-${safeName}.png`
  const uploadResult = await uploadScopedTeamFile(cloudPath, processedFile, {
    chunkSize: 32 * 1024,
    onProgress: (received, total) => {
      row.progress = Math.round((received / total) * 100)
    }
  })
  if (!uploadResult.success || !uploadResult.fileId) {
    throw new Error(uploadResult.message || '头像上传失败')
  }

  await updateRecord('players', targetPlayer._id, {
    photoUrl: uploadResult.fileId,
    photoFileID: uploadResult.fileId,
    updateTime: new Date().toISOString()
  })
  row.status = 'success'
  row.progress = 100
}

async function confirmBatchAvatarImport() {
  const unresolved = avatarImportRows.value.filter(row => !row.ignored && row.status !== 'success' && !row.selectedPlayerId)
  if (unresolved.length) {
    ElMessage.warning(`还有 ${unresolved.length} 张照片需要人工选择对应球员或设为忽略`)
    return
  }

  const activeRows = avatarImportRows.value.filter(row => !row.ignored && row.status !== 'success' && row.selectedPlayerId)
  if (!activeRows.length) {
    ElMessage.warning('没有待处理的头像')
    return
  }

  const targetCounts = new Map()
  activeRows.forEach(row => targetCounts.set(row.selectedPlayerId, (targetCounts.get(row.selectedPlayerId) || 0) + 1))
  const duplicatedTargets = Array.from(targetCounts.entries()).filter(([, count]) => count > 1)
  if (duplicatedTargets.length) {
    const names = duplicatedTargets.map(([id]) => players.value.find(player => player._id === id)?.name || '未知球员')
    ElMessageBox.alert(
      `以下球员被分配了多张头像：${names.join('、')}。请每人只保留一张，其余照片设为忽略或重新选择。`,
      '头像分配重复',
      { confirmButtonText: '去处理', type: 'warning' }
    )
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定处理并上传 ${activeRows.length} 张球员头像吗？系统将更新对应球员的现有头像。`,
      '批量头像确认',
      { confirmButtonText: '开始处理', cancelButtonText: '取消', type: 'info' }
    )
  } catch {
    return
  }

  avatarBatchProcessing.value = true
  let successCount = 0
  let failedCount = 0
  for (const row of activeRows) {
    try {
      await processAvatarImportRow(row)
      successCount++
    } catch (err) {
      console.error(`头像“${row.fileName}”处理失败:`, err)
      row.status = 'failed'
      row.error = err.message || '处理失败'
      failedCount++
    }
  }
  avatarBatchProcessing.value = false
  await loadPlayers()

  if (failedCount) {
    ElMessage.warning(`头像处理完成：成功 ${successCount} 张，失败 ${failedCount} 张；失败项可直接重试`)
  } else {
    ElMessage.success(`头像批量导入完成，共成功 ${successCount} 张`)
  }
}

async function uploadWordTeamLogoIfMissing() {
  if (!wordTeamLogoFile.value) return { imported: false, preservedExisting: false }

  // 上传前重新读取球队，避免覆盖刚由其他入口补充的队徽
  const latestResult = await queryById('teams', teamId)
  const latestTeam = Array.isArray(latestResult) ? latestResult[0] : latestResult
  const latestLogo = getTeamLogoUrl(latestTeam)
  if (latestLogo) {
    team.value = { ...team.value, ...latestTeam }
    return { imported: false, preservedExisting: true }
  }

  // 报名表队徽属于小图片，压缩后直接上传，避免分片会话在连续导入时失效
  const logoFile = await createWordImageForDirectUpload(
    wordTeamLogoPreview.value,
    `word-logo-${Date.now()}.png`
  )
  const uploadResult = await uploadImageViaWebApi(`team-logos/${teamId}`, logoFile)
  if (!uploadResult.success || !uploadResult.fileId) {
    throw new Error(uploadResult.message || '报名表队徽上传失败')
  }

  const logoUrl = uploadResult.tempUrl || await getFileUrl(uploadResult.fileId)
  if (!logoUrl) throw new Error('报名表队徽已上传，但未获取到可访问地址')
  await updateRecord('teams', teamId, { logo: logoUrl, logoUrl, logoFileID: uploadResult.fileId })

  team.value = { ...team.value, logo: logoUrl, logoUrl }
  return { imported: true, preservedExisting: false }
}

function findExistingWordPlayers(player) {
  if (!player.birthDate) return []
  const targetName = String(player.name || '').trim()
  const targetJersey = normalizeJerseyNumber(player.jerseyNumber)
  return players.value.filter(existing =>
    String(existing.name || '').trim() === targetName &&
    normalizeJerseyNumber(existing.jerseyNumber) === targetJersey &&
    String(existing.birthDate || '').trim() === String(player.birthDate || '').trim()
  )
}

async function uploadWordPlayerPhoto(player, playerId) {
  const sourceFile = player._photoFile
  if (!sourceFile) return null
  if (!sourceFile.size || sourceFile.size > WORD_PLAYER_PHOTO_MAX_SIZE) {
    throw new Error('报名表球员照片为空或超过 10MB')
  }

  const safePlayerId = String(playerId || player.name || 'player').replace(/[^a-zA-Z0-9_-]/g, '') || 'player'
  const processedAvatar = await auditAndRemoveAvatarBackground(sourceFile)
  const processedFile = await createWordImageForDirectUpload(
    processedAvatar,
    `word-${safePlayerId}-${Date.now()}.png`
  )
  // 抠图后的头像只有几十 KB，直接上传比创建分片会话更可靠
  const uploadResult = await uploadImageViaWebApi(`player-photos/${teamId}`, processedFile)
  if (!uploadResult.success || !uploadResult.fileId) {
    throw new Error(uploadResult.message || '报名表球员照片上传失败')
  }
  return {
    photoUrl: uploadResult.fileId,
    photoFileID: uploadResult.fileId
  }
}

// 确认批量导入
async function confirmBatchImport() {
  const validData = importParsedData.value.filter(p => !p._error)
  if (validData.length === 0) {
    ElMessage.warning('没有可导入的有效人员数据')
    return
  }

  const playerCount = validData.filter(item => item._importKind !== 'staff').length
  const staffCount = validData.filter(item => item._importKind === 'staff').length
  const wordPhotoCount = importMode.value === 'word' ? validData.filter(item => item._photoFile).length : 0
  const wordExistingUpdateCount = importMode.value === 'word'
    ? validData.filter(item => item._importKind !== 'staff' && findExistingWordPlayers(item).length === 1).length
    : 0
  const shouldImportWordLogo = importMode.value === 'word' && !teamHasLogo.value && Boolean(wordTeamLogoFile.value)
  try {
    await ElMessageBox.confirm(
      `确定处理 ${playerCount} 名球员、${staffCount} 名工作人员到「${team.value.name || '当前球队'}」${wordExistingUpdateCount ? `；其中 ${wordExistingUpdateCount} 名将匹配并更新现有球员` : ''}${wordPhotoCount ? `，自动抠图并导入 ${wordPhotoCount} 张球员照片` : ''}${shouldImportWordLogo ? '，并补充报名表队徽' : ''}？`,
      '批量导入确认',
      { confirmButtonText: '确认导入', cancelButtonText: '取消', type: 'info' }
    )
  } catch {
    return
  }

  batchImporting.value = true
  let successPlayers = 0
  let updatedPlayers = 0
  let successStaff = 0
  let failed = 0
  let successPhotos = 0
  let failedPhotos = 0
  // A/B/C 共用同一个球队成员序号空间，删除后不复用
  const teamCodeForId = team.value.teamCode || teamId
  let existingCoaches = []
  try {
    const [coachByTeamId, coachByTeamCode] = await Promise.all([
      queryList('coaches', { where: { teamId: teamId } }),
      queryList('coaches', { where: { teamCode: teamCodeForId } })
    ])
    const coachMap = new Map()
    ;[...(coachByTeamId || []), ...(coachByTeamCode || [])].forEach(item => {
      const key = item._id || item.playerId || item.idNumber || `${item.name}-${item.phone}`
      coachMap.set(key, item)
    })
    existingCoaches = Array.from(coachMap.values())
  } catch (err) {
    console.warn('读取现有工作人员编号失败，将仅按球员编号递增:', err)
  }
  let maxExistingSeq = 0
  ;[...players.value, ...existingCoaches].forEach(item => {
    const pid = item.playerId || item.memberId || ''
    if (pid.startsWith(teamCodeForId)) {
      const seqStr = pid.substring(teamCodeForId.length, teamCodeForId.length + 3)
      const seq = parseInt(seqStr, 10)
      if (!isNaN(seq) && seq > maxExistingSeq) maxExistingSeq = seq
    }
  })
  let importSeq = maxExistingSeq + 1 // 批量导入序号计数器，确保每个人员ID唯一

  for (const player of validData) {
    try {
      // 解析身份证号（出生日期、籍贯、性别）
      const idCardInfo = parseIdCard(player.idCard) || {}
      const now = new Date().toISOString()

      if (player._importKind === 'staff') {
        const staffPlayerId = generatePlayerId(teamCodeForId, player._roleSuffix || 'B', importSeq)
        await addRecord('coaches', {
          teamId: teamId,
          teamCode: team.value.teamCode || teamId,
          teamName: team.value.name || '',
          playerId: staffPlayerId,
          memberId: staffPlayerId,
          name: player.name,
          phone: player.contactPhone || '',
          idNumber: player.idCard || '',
          idCard: player.idCard || '',
          type: player._staffType || 'other',
          role: STAFF_ROLE_LABEL_MAP[player._staffType] || player.relatedPosition || '其他',
          contactName: player.contactName || '',
          gender: idCardInfo.gender || '',
          birthDate: idCardInfo.birthDate || player.birthDate || '',
          nativePlace: idCardInfo.nativePlace || '',
          description: '',
          createTime: now,
          updateTime: now
        })
        successStaff++
        importSeq++
        continue
      }

      const jerseyNum = parseInt(player.jerseyNumber)
      const existingWordMatches = importMode.value === 'word' ? findExistingWordPlayers(player) : []
      if (existingWordMatches.length > 1) {
        console.warn(`Word 导入匹配到多个现有球员，已跳过「${player.name}」`, existingWordMatches.map(item => item._id))
        failed++
        continue
      }

      if (existingWordMatches.length === 1) {
        const existingPlayer = existingWordMatches[0]
        let photoFields = {}
        if (player._photoFile) {
          try {
            photoFields = await uploadWordPlayerPhoto(player, existingPlayer.playerId || existingPlayer._id) || {}
            successPhotos++
          } catch (photoError) {
            failedPhotos++
            console.error(`上传「${player.name}」报名表照片失败:`, photoError)
          }
        }
        await updateRecord('players', existingPlayer._id, {
          birthDate: idCardInfo.birthDate || player.birthDate || existingPlayer.birthDate || '',
          jerseyName: player.jerseyName || existingPlayer.jerseyName || '',
          ...photoFields,
          updateTime: now
        })
        updatedPlayers++
        continue
      }

      const generatedPlayerId = generatePlayerId(teamCodeForId, 'C', importSeq)
      let photoFields = {}
      if (player._photoFile) {
        try {
          photoFields = await uploadWordPlayerPhoto(player, generatedPlayerId) || {}
          successPhotos++
        } catch (photoError) {
          failedPhotos++
          console.error(`上传「${player.name}」报名表照片失败:`, photoError)
        }
      }
      await addRecord('players', {
        name: player.name,
        idCard: player.idCard,
        jerseyNumber: isNaN(jerseyNum) ? 0 : jerseyNum,
        jerseyName: player.jerseyName || '',
        position: player.position || '',
        height: player.height ? parseFloat(player.height) : null,
        weight: player.weight ? parseFloat(player.weight) : null,
        contactName: player.contactName || '',
        contactPhone: player.contactPhone || '',
        relatedPosition: player.relatedPosition || '',
        teamId: teamId,
        teamCode: teamId,
        teamName: team.value.name || '',
        gender: idCardInfo.gender || 'male',
        nationality: '中国',
        birthDate: idCardInfo.birthDate || player.birthDate || '',
        nativePlace: idCardInfo.nativePlace || '',
        playerId: generatedPlayerId,
        ...photoFields,
        registerTime: now,
        createTime: now
      })
      successPlayers++
      importSeq++ // 序号递增，确保每个球员ID唯一
    } catch (err) {
      console.error(`导入人员「${player.name}」失败:`, err)
      failed++
    }
  }

  let logoImportResult = { imported: false, preservedExisting: false }
  let logoImportFailed = false
  if (shouldImportWordLogo) {
    try {
      logoImportResult = await uploadWordTeamLogoIfMissing()
    } catch (logoError) {
      logoImportFailed = true
      console.error('报名表队徽补充失败:', logoError)
    }
  }

  batchImporting.value = false
  clearImportData()

  await loadPlayers()
  showBatchImport.value = false

  const logoResultText = logoImportResult.imported
    ? '，已同步补充队徽'
    : logoImportResult.preservedExisting
      ? '，球队已有队徽，未覆盖'
      : logoImportFailed
        ? '，队徽补充失败，可稍后手动上传'
        : ''
  const photoResultText = wordPhotoCount
    ? `，球员照片抠图上传成功 ${successPhotos} 张${failedPhotos ? `、失败 ${failedPhotos} 张` : ''}`
    : ''
  const resultMessage = `导入完成：新增球员 ${successPlayers} 人、更新现有球员 ${updatedPlayers} 人、工作人员 ${successStaff} 人${failed > 0 ? `，人员失败 ${failed} 人` : ''}${photoResultText}${logoResultText}`
  if (logoImportFailed || failedPhotos > 0 || failed > 0) {
    ElMessage.warning(resultMessage)
  } else {
    ElMessage.success(resultMessage)
  }
}

// 上传球队Logo（先裁剪预览，再抠图上传）
function handleTeamLogoUpload(options) {
  const { file } = options
  // 读取文件为 DataURL，弹出裁剪框
  const reader = new FileReader()
  reader.onload = (e) => {
    cropperImageSrc.value = e.target.result
    cropperPendingFile.value = file
    showLogoCropper.value = true
  }
  reader.readAsDataURL(file)
}

// 裁剪确认后的处理：抠图 + 上传
async function handleLogoCropConfirm(croppedBlob) {
  try {
    const file = cropperPendingFile.value
    // 1. 抠图处理
    ElMessage.info('正在处理图片，请稍候...')
    const removeBgResult = await removeLogoBackground(croppedBlob)

    let processedFile = croppedBlob
    let isProcessed = false
    if (removeBgResult.success && removeBgResult.data) {
      const base64Data = removeBgResult.data.split(',')[1]
      const byteCharacters = atob(base64Data)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      processedFile = new Blob([byteArray], { type: 'image/png' })
      processedFile = new File([processedFile], 'logo-' + Date.now() + '.png', { type: 'image/png' })
      isProcessed = true
      ElMessage.success('背景抠除成功，正在上传...')
    } else {
      ElMessage.warning('抠图失败，使用原图上传')
    }

    // 2. 上传处理后的图片
    const cloudPath = `team-logos/${teamId}/${Date.now()}-logo.png`
    // ★ 分片上传（32KB/片）
    const result = await uploadScopedTeamFile(cloudPath, processedFile, { chunkSize: 32 * 1024 })

    if (result.success) {
      teamEditForm.value.logoUrl = result.tempUrl
      if (isProcessed) {
        ElMessage.success('透明背景Logo上传成功')
      } else {
        ElMessage.success('Logo上传成功（未抠图）')
      }
    } else {
      throw new Error(result.message || '上传失败')
    }
  } catch (err) {
    console.error('[LogoUpload] 上传失败:', err)
    ElMessage.error('上传失败: ' + err.message)
  }
}

// RemoveBgProcessor 抠图上传成功回调
function handleLogoRemoveBgSuccess(result) {
  teamEditForm.value.logoUrl = result.url
  showLogoRemoveBg.value = false
  ElMessage.success('Logo 上传成功')
}

// 提交球队编辑
async function submitTeamEdit() {
  if (!teamEditForm.value.name.trim()) {
    ElMessage.warning('请输入球队全称')
    return
  }
  // 账号所有者即为负责人，使用账号绑定的手机号

  submitting.value = true
  try {
    const teamData = {
      ...teamEditForm.value,
      logo: teamEditForm.value.logoUrl
    }
    await updateRecord('teams', teamId, teamData)
    ElMessage.success('保存成功')
    showEditTeam.value = false
    loadTeam()
  } catch (err) {
    ElMessage.error('保存失败: ' + err.message)
  } finally {
    submitting.value = false
  }
}

async function loadTeam() {
  if (qaTeam) {
    team.value = qaTeam
    syncKitColorsFromTeam()
    return
  }
  try {
    const result = await queryById('teams', teamId)

    // 处理不同的返回格式
    if (Array.isArray(result) && result.length > 0) {
      team.value = await resolveTeamLogo(result[0])
    } else if (result && typeof result === 'object') {
      team.value = await resolveTeamLogo(result)
    } else {
      team.value = {}
    }
    syncKitColorsFromTeam()

  } catch (err) {
    console.error('加载球队信息失败:', err)
    team.value = {}
  }
}

function normalizeKitSet(source, fallback) {
  const allowed = new Set(kitColorOptions.map(item => item.value))
  return Object.fromEntries(kitEquipment.map(item => {
    const value = String(source?.[item.key] || '').toUpperCase()
    return [item.key, allowed.has(value) ? value : fallback[item.key]]
  }))
}

function syncKitColorsFromTeam() {
  const source = tournamentRelation.value.kitColors || team.value.kitColors || team.value.uniformColors || {}
  const sourceLabels = tournamentRelation.value.kitColorLabels || team.value.kitColorLabels || {}
  kitForm.value = {
    primary: normalizeKitSet(source.primary || source.home || {}, { jersey:'#138A4B', shorts:'#FFFFFF', socks:'#138A4B' }),
    secondary: normalizeKitSet(source.secondary || source.away || {}, { jersey:'#FFFFFF', shorts:'#138A4B', socks:'#FFFFFF' })
  }
  kitColorLabels.value = { primary:{ ...(sourceLabels.primary || {}) }, secondary:{ ...(sourceLabels.secondary || {}) } }
}

function kitSourceLabel(setKey, equipmentKey) {
  return String(kitColorLabels.value?.[setKey]?.[equipmentKey] || '')
}

function clearKitSourceLabel(setKey, equipmentKey) {
  if (kitColorLabels.value?.[setKey]) kitColorLabels.value[setKey][equipmentKey] = ''
}

function kitShapeStyle(type, color) {
  const asset = `${import.meta.env.BASE_URL}assets/kit/${type}.svg`
  return { backgroundColor:color, WebkitMaskImage:`url(${asset})`, maskImage:`url(${asset})` }
}

async function saveTeamKitColors() {
  kitSaving.value = true
  try {
    const data = { primary:{ ...kitForm.value.primary }, secondary:{ ...kitForm.value.secondary } }
    const labels = { primary:{ ...kitColorLabels.value.primary }, secondary:{ ...kitColorLabels.value.secondary } }
    if (sourceTournamentId.value) {
      if (!tournamentRelation.value._id) throw new Error('当前球队参赛关系不存在，无法保存本届赛事配色')
      await updateRecord('tournament_teams', tournamentRelation.value._id, { kitColors:data, kitColorLabels:labels, kitColorsUpdatedAt:new Date().toISOString() })
      tournamentRelation.value = { ...tournamentRelation.value, kitColors:data, kitColorLabels:labels }
      ElMessage.success('本届赛事主、备用比赛服颜色已保存')
    } else {
      await updateRecord('teams', teamId, { kitColors:data, kitColorLabels:labels, kitColorsUpdatedAt:new Date().toISOString() })
      team.value = { ...team.value, kitColors:data, kitColorLabels:labels }
      ElMessage.success('球队默认主、备用比赛服颜色已保存')
    }
  } catch (error) {
    ElMessage.error(error.message || '颜色设置保存失败')
  } finally {
    kitSaving.value = false
  }
}

// 生成球员ID
function generatePlayerId(teamCode, roleSuffix, overrideSeq) {
  roleSuffix = roleSuffix || 'C';
  if (!teamCode) return '';

  // 如果传入序号，直接使用（用于批量导入，避免循环中读取同一份 players 列表）
  if (typeof overrideSeq === 'number' && overrideSeq > 0) {
    var seq = overrideSeq.toString().padStart(3, '0');
    return teamCode + seq + roleSuffix;
  }

  var maxSeq = 0;
  for (var i = 0; i < players.value.length; i++) {
    var pid = players.value[i].playerId || '';
    if (pid.startsWith(teamCode)) {
      var seqStr = pid.substring(teamCode.length, teamCode.length + 3);
      var seq = parseInt(seqStr, 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  var nextSeq = (maxSeq + 1).toString().padStart(3, '0');
  return teamCode + nextSeq + roleSuffix;
}

async function loadPlayers() {
  loading.value = true
  const statisticsRequest = requestUnifiedStatistics().catch(error => ({ success: false, error: error.message }))
  try {
    // 同时查询 teamId 和 teamCode，合并去重
    // 因为历史数据有的用 teamId，有的用 teamCode
    const loadExportRoster = async () => {
      if (!sourceTournamentId.value || !tournamentRelation.value?._id) return []
      try {
        const result = await callFunction('organizerClaimInvite', {
          action:'listTeamExportRoster',
          tournamentId:sourceTournamentId.value,
          divisionId:sourceDivisionId.value || tournamentRelation.value.divisionId || 'default',
          tournamentTeamId:String(tournamentRelation.value._id)
        })
        if (!result?.success) throw new Error(result?.message || '本届球员名单加载失败')
        return Array.isArray(result.players) ? result.players : []
      } catch (error) {
        console.warn('加载本届球员名单失败:', error.message || error)
        return []
      }
    }
    const loadTournamentRoster = async () => {
      if (!sourceTournamentId.value || !tournamentRelation.value?._id) return []
      try {
        const result = await rosterExceptionBoard({
          rosterAction:'listRoster',
          tournamentId:sourceTournamentId.value,
          teamId,
          divisionId:sourceDivisionId.value || tournamentRelation.value.divisionId || 'default',
        })
        tournamentMediaStats.value = Object.fromEntries((result?.rows || []).map(row => [String(row.id || ''), row.mediaStats || {}]).filter(item => item[0]))
        return result?.success && Array.isArray(result.snapshot?.playerIds) ? result.snapshot.playerIds.map(String) : []
      } catch (error) {
        console.warn('加载本届正式名单失败:', error.message || error)
        return []
      }
    }
    const [byTeamId, byTeamCode, staffByTeamId, staffByTeamCode, exportRosterPlayers, tournamentRosterIds] = await Promise.all([
      readAllRows('players', { teamId }),
      readAllRows('players', { teamCode: teamId }),
      readAllRows('coaches', { teamId }),
      readAllRows('coaches', { teamCode: teamId }),
      loadExportRoster(),
      loadTournamentRoster()
    ])
    tournamentRosterPlayerIds.value = new Set((tournamentRosterIds || []).map(String))

    const staffMap = new Map()
    actualStaffRecords([...(staffByTeamId || []), ...(staffByTeamCode || [])]).forEach(person => {
      if (person?._id) staffMap.set(String(person._id), person)
    })
    staffMembers.value = await Promise.all(Array.from(staffMap.values()).map(async person => {
      const exportPhotoFileId = [person.photoFileID, person.photoFileId, person.photoUrl].map(value => String(value || '')).find(value => value.startsWith('cloud://')) || ''
      if (exportPhotoFileId) {
        try { return { ...person, _exportPhotoFileId:exportPhotoFileId, photoUrl:await getFileUrl(exportPhotoFileId) } } catch { return { ...person, _exportPhotoFileId:exportPhotoFileId } }
      }
      return person
    }))

    // 合并并去重（按 _id）
    const playerMap = new Map()
    for (const p of (byTeamId || [])) {
      if (p._id) playerMap.set(p._id, p)
    }
    for (const p of (byTeamCode || [])) {
      if (p._id) playerMap.set(p._id, p)
    }
    let result = Array.from(playerMap.values())

    // 处理头像URL：如果是 cloudId，需要转换成临时URL
    const processedPlayers = await Promise.all(result.map(async (player) => {
      const exportPhotoFileId = [player.photoFileID, player.photoFileId, player.photoUrl].map(value => String(value || '')).find(value => value.startsWith('cloud://')) || ''
      if (exportPhotoFileId) {
        try {
          const tempUrl = await getFileUrl(exportPhotoFileId)
          return { ...player, _exportPhotoFileId:exportPhotoFileId, photoUrl:tempUrl }
        } catch (err) {
          console.error('获取头像临时URL失败:', err)
          return { ...player, _exportPhotoFileId:exportPhotoFileId }
        }
      }
      return player
    }))

    players.value = processedPlayers
    const formalPlayerIds = new Set(processedPlayers.map(player => String(player._id || '')).filter(Boolean))
    const draftMap = new Map()
    ;(exportRosterPlayers || []).forEach(draft => {
      if (!draft?._id) return
      const status = String(draft.reviewStatus || '').toLowerCase()
      if (['excluded', 'rejected', 'conflict'].includes(status)) return
      if (draft.confirmedPlayerId && formalPlayerIds.has(String(draft.confirmedPlayerId))) return
      draftMap.set(String(draft._id), { ...draft, _exportSource:'registration_player_draft' })
    })
    importedDraftPlayers.value = await Promise.all(Array.from(draftMap.values()).map(async draft => {
      const exportPhotoFileId = [draft.photoFileID, draft.photoFileId, draft.photoUrl].map(value => String(value || '')).find(value => value.startsWith('cloud://')) || ''
      if (!exportPhotoFileId) return draft
      try { return { ...draft, _exportPhotoFileId:exportPhotoFileId, photoUrl:await getFileUrl(exportPhotoFileId) } } catch { return { ...draft, _exportPhotoFileId:exportPhotoFileId } }
    }))

    // 普通球队资料页沿用历史同步行为；赛事内查看只读，不因打开页面改写球队资产。
    if (!sourceTournamentId.value) {
      try {
        await updateRecord('teams', teamId, { playerCount: processedPlayers.length })
        if (team.value) team.value.playerCount = processedPlayers.length
      } catch (e) {
        console.error('同步 playerCount 失败:', e)
      }
    }
  } catch (err) {
    console.error('加载球员列表失败:', err)
  } finally {
    try { await loadUnifiedStatistics(statisticsRequest) } catch (error) { console.warn('统一统计加载失败:',error.message) }
    loading.value = false
  }
}

async function deletePlayer(player) {
  if (isTeamDataWorkspace.value) return
  if (!player?._id) return
  try {
    await ElMessageBox.confirm(`确定删除球员“${player.name || '未命名'}”吗？删除后不可恢复。`, '删除球员', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
    await deleteRecord('players', player._id)
    players.value = players.value.filter(item => String(item._id) !== String(player._id))
    ElMessage.success('球员已删除')
  } catch (error) {
    if (!['cancel', 'close'].includes(error)) ElMessage.error(error.message || '删除球员失败')
  }
}

function playerProfileLabel(player) {
  const identityStatus = String(player?.identityStatus || '').toLowerCase()
  if (!['verified', 'approved', 'complete'].includes(identityStatus)) return '待人证核验'
  const status = String(player?.profileStatus || '').toLowerCase()
  if (status === 'complete') return '资料完整'
  if (status === 'imported_pending_claim') return '待认领核对'
  if (status === 'pending_review') return '待审核'
  return isSyntheticTeam.value ? '测试资料' : '待完善'
}

function playerOrganizerReviewStatus(player) {
  if (sourceTournamentId.value) {
    const playerId = String(player?._id || '')
    const source = String(player?.source || '').toLowerCase()
    const importedRegistrationPlayer = Boolean(player?.registrationImportBatchId || player?.importDraftId || player?.registrationSourceFileId || source.indexOf('registration_docx_import') === 0)
    if (tournamentRosterPlayerIds.value.has(playerId)) return 'approved'
    if (importedRegistrationPlayer && String(player?.organizerReviewStatus || '').toLowerCase() === 'approved') return 'approved'
    return 'pending'
  }
  return String(player?.organizerReviewStatus || '').toLowerCase() === 'approved' ? 'approved' : 'pending'
}

async function reviewPlayer(player) {
  if (isTeamDataWorkspace.value) return
  if (!player?._id || playerOrganizerReviewStatus(player) === 'approved') return
  playerReviewingId.value = String(player._id)
  try {
    if (sourceTournamentId.value) {
      if (!tournamentRelation.value?._id) throw new Error('当前赛事参赛关系不存在，无法加入正式名单')
      const result = await rosterExceptionBoard({
        rosterAction:'approvePlayer',
        tournamentId:sourceTournamentId.value,
        teamId,
        divisionId:sourceDivisionId.value || tournamentRelation.value.divisionId || 'default',
        playerId:String(player._id)
      })
      if (!result?.success) throw new Error(result?.message || '球员审核失败')
      tournamentRosterPlayerIds.value = new Set([...tournamentRosterPlayerIds.value, String(player._id)])
      player.organizerReviewStatus = 'approved'
      ElMessage.success(`${player.name || '球员'}已审核并加入本届正式名单`)
    } else {
      await updateRecord('players', player._id, { organizerReviewStatus: 'approved', organizerReviewedAt: new Date().toISOString(), organizerReviewedBy: '赛事主办方' })
      player.organizerReviewStatus = 'approved'
      ElMessage.success(`${player.name || '球员'}已审核`)
    }
  } catch (error) {
    ElMessage.error(error.message || '球员审核失败')
  } finally {
    playerReviewingId.value = ''
  }
}

function playerIdentityLabel(player) {
  const explicit = String(player?.dualRoleLabel || '').trim()
  if (explicit) return explicit
  const role = String(player?.dualRoleType || '').trim()
  const roleLabels = { head_coach_player: '主教练兼球员', team_leader_player: '领队兼球员', doctor_player: '队医兼球员' }
  return roleLabels[role] || '球员'
}

function playerProfileTagType(player) {
  return playerProfileLabel(player) === '资料完整' ? 'success' : 'warning'
}

function formatTournamentTime(value) {
  if (!value) return '—'
  const date = new Date(value?.$date || value)
  if (Number.isNaN(date.getTime())) return '—'
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

async function loadTournamentTeamContext() {
  if (!sourceTournamentId.value) return
  if (qaSnapshot) {
    tournamentContext.value = { ...qaSnapshot.tournament, divisions: qaSnapshot.divisions }
    tournamentRelation.value = { tournamentId: sourceTournamentId.value, teamId, divisionId: sourceDivisionId.value, divisionName: isProfessionalTournamentTeam.value ? 'U16组' : 'U8组', registrationNo: isProfessionalTournamentTeam.value ? 'HNYC-U16-021' : 'HNYC-U8-001', joinSource: isProfessionalTournamentTeam.value ? 'invite' : '主办方邀请', status: 'approved', claimedAt: isProfessionalTournamentTeam.value ? '2026-07-21T10:32:00' : '2026-07-18T10:24:00', rosterStatus: isProfessionalTournamentTeam.value ? 'submitted' : '' }
    tournamentMatches.value = []
    syncKitColorsFromTeam()
    return
  }
  try {
    const [event, relations, matches] = await Promise.all([
      queryById('tournaments', sourceTournamentId.value),
      queryList('tournament_teams', { where: { tournamentId: sourceTournamentId.value, teamId } }),
      queryList('matches', { where: { tournamentId: sourceTournamentId.value }, limit: 500 })
    ])
    tournamentContext.value = Array.isArray(event) ? event[0] || {} : event || {}
    await resolveTournamentLogo()
    tournamentRelation.value = (relations || []).find(item => !sourceDivisionId.value || (item.divisionId || 'default') === sourceDivisionId.value) || relations?.[0] || {}
    syncKitColorsFromTeam()
    tournamentMatches.value = (matches || []).filter(match => {
      const homeId = String(match.homeTeamId || match.teamAId || '')
      const awayId = String(match.awayTeamId || match.teamBId || '')
      return (homeId === String(teamId) || awayId === String(teamId)) && ['completed', 'finished', 'archived'].includes(match.status)
    })
    const matchIds = tournamentMatches.value.map(match => match._id).filter(Boolean)
    tournamentMatchEvents.value = matchIds.length
      ? await queryList('match_events', { where:{ matchId:{ $in:matchIds } }, limit:1000, silent:true })
      : []
  } catch (error) {
    console.error('加载球队赛事资料失败:', error)
    ElMessage.error('球队赛事资料加载失败')
  }
}

function openTournamentMatches() {
  router.push({ path: `/tournaments/${sourceTournamentId.value}/matches`, query: sourceDivisionId.value ? { divisionId: sourceDivisionId.value } : {} })
}

useReadCacheRefresh({
  tags: ['players', 'statistics'],
  refresh: loadPlayers,
  clear: () => { team.value = {}; players.value = []; dataCenterStatistics.value = null },
  onError: () => ElMessage.warning('数据更新失败，请重试。')
})
onMounted(async () => {
  await loadTeam()
  if (route.query.edit === '1') editTeam()
  if (sourceTournamentId.value) {
    await loadTournamentTeamContext()
    await Promise.all([loadPlayers(), ...(isTournamentStaff ? [] : [loadTeamAccess()])])
    await loadPlayerCompetitionData()
  }
  else await loadPlayers()
})

// 压缩 Base64 图片（避免 413 Payload Too Large）
function compressBase64(dataUrl, maxSize = 300) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const ratio = Math.min(1, maxSize / img.width, maxSize / img.height)
      const w = Math.max(1, Math.round(img.width * ratio))
      const h = Math.max(1, Math.round(img.height * ratio))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}
</script>

<style scoped>
.team-info-header {
  display: flex;
  align-items: center;
  gap: 20px;
}

.team-logo-wrapper {
  position: relative;
}

.team-logo-wrapper .ai-logo-btn {
  position: absolute;
  bottom: 0;
  right: 0;
  opacity: 0;
  transition: opacity 0.3s;
}

.team-logo-wrapper:hover .ai-logo-btn {
  opacity: 1;
}

.team-meta h2 {
  font-size: 20px;
  margin-bottom: 8px;
  color: #303133;
}

.team-meta-row {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
  color: #909399;
}

.meta-item {
  margin-left: 8px;
}

.team-description {
  margin-top: 8px;
  font-size: 13px;
  color: #606266;
  line-height: 1.6;
  max-width: 600px;
}

.jersey-number {
  font-weight: 600;
  font-size: 16px;
  color: #2E7D32;
}

/* 地址选择器 */
.address-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.address-detail-item :deep(.el-form-item__label) {
  visibility: hidden;
}

/* 身份证上传 */
.idcard-upload {
  width: 100%;
}

.idcard-uploader {
  width: 100%;
}

.idcard-uploader :deep(.el-upload) {
  width: 100%;
}

.idcard-placeholder {
  width: 100%;
  height: 100px;
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #909399;
  cursor: pointer;
  transition: all 0.3s;
}

.idcard-placeholder:hover {
  border-color: #2E7D32;
  color: #2E7D32;
}

.idcard-placeholder span {
  font-size: 12px;
  margin-top: 4px;
}

.idcard-preview {
  width: 100%;
  height: 100px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #e4e7ed;
}

.idcard-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 球员照片4:3竖版样式 */
.player-photo-upload .idcard-placeholder,
.player-photo-upload .idcard-preview {
  width: 120px;
  height: 160px;
  margin: 0 auto;
}

/* 新头像裁剪区域样式 */
.player-photo-section {
  display: flex;
  justify-content: center;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
}

.photo-preview-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.photo-preview-img {
  width: 120px;
  height: 144px;
  object-fit: cover;
  border-radius: 8px;
  background-color: #f5f5f5;
  background-image:
    linear-gradient(45deg, #e0e0e0 25%, transparent 25%),
    linear-gradient(-45deg, #e0e0e0 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e0e0e0 75%),
    linear-gradient(-45deg, transparent 75%, #e0e0e0 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
}

/* Logo上传样式 */
.logo-upload-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.logo-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.logo-preview {
  width: 100px;
  height: 100px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #e4e7ed;
}

.logo-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 球员表格行可点击样式 */
.player-table :deep(.el-table__row) {
  cursor: pointer;
}

.player-table :deep(.el-table__row:hover) {
  background-color: #f0f9f0 !important;
}

/* 球员头像 - 透明背景，无框 */
.player-avatar-img {
  width: 36px;
  height: 48px;
  object-fit: contain;
  border-radius: 0;
  background-color: transparent;
  display: block;
}

/* 队徽Logo - 透明背景 */
.team-logo-wrapper :deep(.el-avatar) {
  background-color: transparent !important;
}

.logo-preview {
  background-color: transparent;
}

/* 球员库选项卡 */
.player-tabs {
  margin-top: -10px;
}

.player-tabs :deep(.el-tabs__content) {
  padding: 16px 0 0 0;
}

.tab-content {
  min-height: 300px;
}

.library-search {
  margin-bottom: 16px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.library-search .el-input {
  flex: 1;
}

.library-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}

.library-empty-tip {
  margin-top: 16px;
}

.batch-import-dialog {
  max-width: calc(100vw - 48px);
}

.batch-import-dialog :deep(.el-dialog__body) {
  padding-top: 8px;
}

.import-preview {
  min-width: 0;
}

.avatar-import-guide {
  margin-bottom: 14px;
  padding: 12px 14px;
  color: #606266;
  line-height: 1.7;
  background: #f0f9eb;
  border: 1px solid #c2e7b0;
  border-radius: 6px;
}

.avatar-import-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.avatar-import-summary > div {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.avatar-import-summary strong {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.import-photo-preview {
  width: 42px;
  height: 54px;
  display: block;
  margin: 0 auto;
  object-fit: contain;
  background-color: #f5f7fa;
  border-radius: 4px;
}

.batch-avatar-dialog :deep(.el-dialog__body) {
  padding-top: 8px;
}

.tournament-team-context {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 72px;
  padding: 0 32px;
  border-bottom: 1px solid #e4e8e5;
  background: #fff;
}
.context-event { display: flex; align-items: center; gap: 13px; }
.context-event img { width: 42px; height: 42px; object-fit: contain; }
.tournament-logo-placeholder { display:grid; width:42px; height:42px; place-items:center; flex:0 0 42px; color:#087542; background:#eaf6ed; font-size:10px; text-align:center; }
.context-event strong { max-width: 390px; overflow: hidden; font-size: 20px; text-overflow: ellipsis; white-space: nowrap; }
.event-context-divider { width: 1px !important; height: 26px !important; margin: 0 4px; border-radius: 0 !important; background: #e3e8e4 !important; }
.event-context-meta { width: auto !important; height: auto !important; border-radius: 0 !important; background: transparent !important; color: #3e4a42 !important; font-size: 14px; font-weight: 500; }
.tournament-team-detail { width: min(1320px, calc(100% - 64px)); margin: 0 auto; padding: 28px 0 48px; }
.professional-team-tabs{display:flex;gap:38px;margin:0 0 18px;border-bottom:1px solid #e2e8e3}.professional-team-tabs button{position:relative;height:45px;padding:0 4px;border:0;background:transparent;color:#303b33;font-size:15px;cursor:pointer}.professional-team-tabs button.active{color:#09823f;font-weight:700}.professional-team-tabs button.active::after{position:absolute;right:0;bottom:-1px;left:0;height:3px;background:#0a9348;content:''}.professional-team-tabs strong{margin-left:6px;font-weight:600}.professional-team-tabs strong.warning{color:#f16b2d}
.detail-heading { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; }
.detail-heading h1 { margin: 0; font-size: 29px; }
.detail-heading p { margin: 8px 0 0; color: #68736b; font-size: 14px; }
.team-event-summary { display: grid; grid-template-columns: 2.2fr repeat(5, 1fr); align-items: center; min-height: 132px; padding: 0 30px; border: 1px solid #e0e6e1; border-radius: 10px; background: #fff; }
.summary-identity { display: flex; align-items: center; gap: 18px; }
.summary-identity img { width: 78px; height: 78px; object-fit: contain; }
.summary-identity > span { display: grid; width: 70px; height: 70px; place-items: center; border-radius: 50%; background: #e8f4eb; color: #14743d; font-size: 22px; font-weight: 800; }
.summary-identity strong { font-size: 22px; }
.team-event-summary dl { min-height: 74px; margin: 0; padding: 14px 20px; border-left: 1px solid #e5e9e6; }
.team-event-summary dt { margin-bottom: 17px; color: #677169; font-size: 13px; }
.team-event-summary dd { margin: 0; color: #202a22; font-size: 15px; }
.team-event-summary dd.link { color: #1679d3; }
.team-detail-grid { display: grid; grid-template-columns: 1.2fr 1fr 1.6fr; gap: 20px; margin: 24px 0; }
.detail-panel { min-height: 292px; padding: 22px 24px; border: 1px solid #e1e6e2; border-radius: 10px; background: #fff; box-shadow: 0 2px 10px rgba(14, 67, 37, .025); }
.detail-panel h2 { display: flex; align-items: center; gap: 12px; margin: 0 0 23px; color: #1f2a22; font-size: 18px; }
.detail-panel h2 .el-icon { width: 29px; height: 29px; border-radius: 5px; background: #118343; color: #fff; font-size: 19px; }
.detail-panel dl { display: grid; grid-template-columns: 130px 1fr; align-items: center; margin: 0; padding: 10px 0; }
.detail-panel dt { color: #6e7871; font-size: 13px; }
.detail-panel dd { margin: 0; font-size: 14px; }
.team-materials dd img { width: 58px; height: 58px; object-fit: contain; }
.collaboration-status dl { display: block; padding: 18px 0; border-bottom: 1px solid #edf0ed; }
.collaboration-status dl:last-child { border-bottom: 0; }
.collaboration-status dt { margin-bottom: 14px; }
.match-summary { padding-bottom: 12px; }
.professional-roster-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:8px}.professional-roster-stats article{display:grid;grid-template-columns:1fr auto;grid-template-rows:auto auto;align-items:end;min-height:88px;padding:14px;border:1px solid #e6ebe7;border-radius:7px;background:#fbfdfb}.professional-roster-stats span{grid-column:1/-1;color:#667269;font-size:12px}.professional-roster-stats strong{color:#167f42;font-size:26px}.professional-roster-stats small{margin-bottom:4px;color:#536158}.professional-roster-stats article.pending strong{color:#d98b15}.professional-team-actions{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:17px}.professional-team-actions .el-button{height:41px;margin:0}
.team-access-panel{margin:0 0 24px;padding:22px 24px;border:1px solid #dfe7e1;border-radius:10px;background:#fff}.team-access-panel>header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:18px}.team-access-panel h2{margin:0;color:#1d2b21;font-size:19px}.team-access-panel header p{margin:7px 0 0;color:#69766d;font-size:13px}.team-access-form{display:grid;gap:12px;margin-top:18px}.team-access-form-row{display:grid;grid-template-columns:90px minmax(150px,1fr) minmax(180px,1fr) 100px 56px;gap:12px;align-items:center}.team-access-form-row>strong{color:#344139;font-size:14px}.team-access-form-row :deep(.el-radio){margin-right:0}.export-dialog-section{margin-top:18px}.export-dialog-section>strong{display:block;margin-bottom:10px;color:#344139}.export-field-checks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px 12px}.export-field-checks :deep(.el-checkbox){margin-right:0}
.tournament-history-panel{margin:0 0 24px;padding:22px 24px;border:1px solid #dfe7e1;border-radius:10px;background:#fff}.tournament-history-heading{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px}.tournament-history-heading h2{margin:0;color:#1d2b21;font-size:19px}.tournament-history-heading p{margin:7px 0 0;color:#69766d;font-size:13px}.tournament-history-grid{display:grid;grid-template-columns:1fr 1.35fr;gap:18px}.history-card{min-width:0}.history-card h3{margin:0 0 10px;color:#344139;font-size:15px}.history-card :deep(.el-table){border:1px solid #edf1ee;border-radius:6px}.history-card :deep(.el-table th.el-table__cell){background:#f8faf8}.history-card :deep(.el-table td.el-table__cell),.history-card :deep(.el-table th.el-table__cell){padding:7px 0}@media(max-width:900px){.tournament-history-grid{grid-template-columns:1fr}}
.red-card-value{color:#d83a3a;font-weight:700}.yellow-card-value{color:#d88b03;font-weight:700}
.team-kit-panel{margin:0 0 24px;padding:22px 24px;border:1px solid #dfe7e1;border-radius:10px;background:#fff}.team-kit-panel>header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:18px}.team-kit-panel h2{margin:0;color:#1d2b21;font-size:19px}.team-kit-panel header p{margin:7px 0 0;color:#69766d;font-size:13px}.kit-set-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.kit-set-card{padding:17px;border:1px solid #e2e8e4;border-radius:9px;background:#fafcfb}.kit-set-title{display:flex;align-items:center;gap:11px;margin-bottom:15px}.kit-set-title>span{display:grid;width:34px;height:34px;place-items:center;border-radius:50%;color:#fff;background:#087d40;font-weight:800}.kit-set-title div{display:grid;gap:3px}.kit-set-title small{color:#78847c;font-size:11px}.kit-equipment-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.kit-equipment-item{display:grid;justify-items:center;gap:8px;min-width:0;padding:12px 10px;border:1px solid #e7ece8;border-radius:8px;background:#fff}.kit-image-stage{display:grid;width:82px;height:82px;place-items:center;border-radius:10px;background:linear-gradient(145deg,#f5f8f6,#e8efeb)}.kit-silhouette{display:block;width:66px;height:66px;mask-position:center;mask-repeat:no-repeat;mask-size:contain;-webkit-mask-position:center;-webkit-mask-repeat:no-repeat;-webkit-mask-size:contain;filter:drop-shadow(0 4px 4px rgba(0,0,0,.12))}.kit-silhouette.shorts{width:62px;height:62px}.kit-silhouette.socks{width:58px;height:64px}.kit-equipment-item>strong{font-size:13px}.kit-equipment-item :deep(.el-select){width:100%}.kit-color-option{display:flex;align-items:center;gap:8px}.kit-color-option i{width:16px;height:16px;border:1px solid #cfd7d2;border-radius:4px}.team-kit-panel>footer{display:flex;align-items:center;gap:8px;margin-top:16px;padding:10px 12px;border-radius:6px;color:#56665c;background:#f0f8f3;font-size:12px}.team-kit-panel>footer .el-icon{color:#087d40;font-size:17px}
.kit-source-label{color:#718078;font-size:10px;line-height:1.2}
.collaboration-timeline{margin:-6px 0 12px;padding:14px 18px;border:1px solid #e1e7e2;border-radius:9px;background:#fff}.collaboration-timeline h2{margin:0 0 12px;font-size:15px}.collaboration-timeline ol{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;margin:0;padding:0;list-style:none}.collaboration-timeline li{position:relative;display:grid;grid-template-columns:46px 1fr;gap:10px;align-items:center}.collaboration-timeline li:not(:last-child)::after{position:absolute;top:22px;right:-17px;width:22px;height:1px;background:#9eaaa1;content:''}.collaboration-timeline li>span{display:grid;place-items:center;width:42px;height:42px;border:1px solid #27a059;border-radius:50%;color:#138544;font-size:23px}.collaboration-timeline li div{display:grid;gap:2px}.collaboration-timeline time,.collaboration-timeline small{color:#768179;font-size:10px}.collaboration-timeline strong{font-size:13px}
.synthetic-player-panel{margin:0 0 24px;padding:22px 24px;border:1px solid #dfe7e1;border-radius:10px;background:#fff}.synthetic-player-heading{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:18px}.synthetic-player-heading h2{margin:0;color:#1d2b21;font-size:19px}.synthetic-player-heading p{margin:7px 0 0;color:#6d7870;font-size:13px}.synthetic-player-table{cursor:pointer}.synthetic-player-table .player-avatar-img{width:38px;height:48px;border-radius:0;object-fit:contain;background:transparent}
.tournament-player-data-table :deep(.el-table__header-wrapper th.is-sortable .cell){display:flex;align-items:center;justify-content:center;gap:2px;padding:0 4px;white-space:nowrap}
.tournament-player-data-table :deep(.el-table__header-wrapper th.is-sortable .caret-wrapper){width:12px;flex:0 0 12px}
.tournament-player-data-table :deep(.el-table__header-wrapper th.is-sortable .sort-caret){left:1px}
.match-stats { display: grid; grid-template-columns: repeat(4, 1fr); padding-bottom: 23px; border-bottom: 1px solid #e8ece9; }
.match-stats.lower { grid-template-columns: repeat(2, 1fr); padding: 24px 0 0; border: 0; }
.match-stats dl { display: block; padding: 0 10px; text-align: center; }
.match-stats dt { margin-bottom: 16px; }
.match-stats dd { color: #14783e; font-size: 27px; font-weight: 700; }
.view-results { display: block; width: 410px; margin: 0 auto 26px; }

@media (max-width: 1150px) {
  .team-event-summary { grid-template-columns: 1fr 1fr 1fr; gap: 18px; padding: 22px; }
  .team-event-summary dl { border-left: 0; }
  .summary-identity { grid-column: 1 / -1; }
  .team-detail-grid { grid-template-columns: 1fr; }
  .kit-set-grid { grid-template-columns: 1fr; }
  .team-access-form-row { grid-template-columns: 80px 1fr; }
  .export-field-checks { grid-template-columns: repeat(2,minmax(0,1fr)); }
}
</style>
