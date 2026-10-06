<template>
  <div class="platform-console">
    <div v-if="checkingPermission" class="permission-loading">
      <el-icon class="is-loading" :size="30"><Loading /></el-icon>
      <span>正在进入平台运营中心…</span>
    </div>

    <template v-else>
      <aside class="sidebar">
        <div class="brand">
          <img :src="logoUrl" alt="赛小蜂足球" />
          <div><strong>赛小蜂足球</strong><span>平台运营中心</span></div>
        </div>
        <nav>
          <button v-for="item in navigation" :key="item.key" :class="{ active: activeTab === item.key }" @click="activeTab = item.key">
            <el-icon><component :is="item.icon" /></el-icon><span>{{ item.label }}</span><em v-if="item.badge">{{ item.badge }}</em>
          </button>
        </nav>
        <div class="sidebar-bottom">
          <div class="owner"><small>当前平台负责人</small><strong>{{ currentUserName }}</strong></div>
          <el-button text @click="router.push('/tournament-space')"><el-icon><Back /></el-icon>返回赛事空间</el-button>
        </div>
      </aside>

      <main>
        <header class="topbar">
          <div><h1>{{ section.title }}</h1></div>
          <div class="top-actions"><span v-if="displayedLoadedAt">更新于 {{ formatTime(displayedLoadedAt, true) }}</span><el-button :loading="displayedLoading" @click="refreshActiveSection"><el-icon><Refresh /></el-icon>刷新数据</el-button></div>
        </header>

        <div v-loading="activeTab !== 'capacity' && loading" class="workspace">
          <template v-if="activeTab === 'overview'">
            <section class="stats">
              <button v-for="item in statCards" :key="item.key" @click="activeTab = item.target">
                <span class="stat-icon" :class="item.color"><el-icon><component :is="item.icon" /></el-icon></span>
                <span class="stat-copy"><strong>{{ item.value }}</strong><b>{{ item.label }}</b></span>
                <el-icon><ArrowRight /></el-icon>
              </button>
            </section>

            <div class="overview-grid">
              <section class="panel">
                <div class="panel-head"><div><h2>最近创建的赛事</h2></div><el-button link type="primary" @click="activeTab = 'tournaments'">查看全部</el-button></div>
                <div v-if="recentTournaments.length" class="activity-list">
                  <button v-for="item in recentTournaments" :key="item._id" @click="openTournament(item)">
                    <span class="entity-icon"><el-icon><Trophy /></el-icon></span>
                    <span><strong>{{ item.name }}</strong><small>{{ item.organizerName || '主办方待补充' }} · {{ formatDate(item.createTime) }}</small></span>
                    <el-tag :type="statusType(item.status)">{{ statusText(item.status) }}</el-tag><small>{{ item.teamCount }} 支球队</small>
                  </button>
                </div>
                <el-empty v-else :description="hiddenTournaments.length ? '赛事已隐藏，可在全平台赛事展开' : '暂无赛事数据'" />
              </section>
              <section class="panel attention">
                <div class="panel-head"><div><h2>需要跟进</h2></div></div>
                <button v-if="stats.activeSupportCount" class="notice warning" @click="activeTab = 'support'"><el-icon><Service /></el-icon><span><strong>{{ stats.activeSupportCount }} 个协助事项处理中</strong><small>查看用户授权状态和有效期</small></span><el-icon><ArrowRight /></el-icon></button>
                <button v-if="stats.missingContactCount" class="notice danger" @click="showMissingContacts"><el-icon><Warning /></el-icon><span><strong>{{ stats.missingContactCount }} 个主办方缺少联系方式</strong><small>需要补齐手机号或邮箱</small></span><el-icon><ArrowRight /></el-icon></button>
                <div v-if="!stats.activeSupportCount && !stats.missingContactCount" class="all-clear"><el-icon><CircleCheckFilled /></el-icon><strong>当前没有待跟进异常</strong><small>联系人与协助状态都正常</small></div>
              </section>
            </div>

            <section class="panel recent-organizers">
              <div class="panel-head"><div><h2>最近活跃的主办方</h2></div><el-button link type="primary" @click="activeTab = 'organizers'">主办方名录</el-button></div>
              <div class="organizer-cards"><button v-for="item in organizers.slice(0, 4)" :key="item._id" @click="openOrganizer(item)"><span class="avatar">{{ avatarText(item.name) }}</span><span><strong>{{ item.name }}</strong><small>{{ item.contact }} · {{ item.phone || item.email || '联系方式待补充' }}</small><small>{{ item.tournamentCount }} 场赛事 · {{ item.teamCount }} 支自建球队</small></span><el-icon><ArrowRight /></el-icon></button></div>
            </section>
          </template>

          <section v-else-if="activeTab === 'organizers'" class="panel table-panel">
            <div class="toolbar">
              <el-input v-model="organizerKeyword" clearable placeholder="搜索主办方、联系人、手机号、邮箱"><template #prefix><el-icon><Search /></el-icon></template></el-input>
              <el-select v-model="organizerContactFilter"><el-option label="全部联系状态" value="all" /><el-option label="可直接联系" value="ready" /><el-option label="联系方式缺失" value="missing" /><el-option label="协助处理中" value="support" /></el-select>
              <span>共 {{ filteredOrganizers.length }} 个主办方</span>
            </div>
            <el-table :data="filteredOrganizers" row-key="_id" @row-click="openOrganizer">
              <el-table-column label="主办方" min-width="230"><template #default="{ row }"><div class="name-cell"><span class="avatar small">{{ avatarText(row.name) }}</span><div><strong>{{ row.name }}</strong><small>{{ row.orgId ? '已关联机构' : '个人主办方账号' }}</small></div></div></template></el-table-column>
              <el-table-column label="联系人" min-width="150"><template #default="{ row }"><strong>{{ row.contact }}</strong><small class="block">{{ row.email || '未填写邮箱' }}</small></template></el-table-column>
              <el-table-column label="手机号" width="175"><template #default="{ row }"><button v-if="row.phone" class="phone" @click.stop="copyText(row.phone)">{{ row.phone }} <el-icon><CopyDocument /></el-icon></button><el-tag v-else type="danger" effect="plain">待补充</el-tag></template></el-table-column>
              <el-table-column label="站内信" width="100"><template #default="{ row }"><el-tag v-if="row.latestNotice" :type="row.latestNotice.readAt ? 'success' : 'warning'">{{ row.latestNotice.readAt ? '已读' : '未读' }}</el-tag><small v-else>未发送</small></template></el-table-column>
              <el-table-column prop="tournamentCount" label="创建赛事" width="105" align="center" /><el-table-column prop="teamCount" label="创建球队" width="105" align="center" />
              <el-table-column label="协助状态" width="120"><template #default="{ row }"><el-tag v-if="row.activeSupportCount" type="warning">处理中 {{ row.activeSupportCount }}</el-tag><small v-else>暂无</small></template></el-table-column>
              <el-table-column label="最近赛事" min-width="210"><template #default="{ row }">{{ row.latestTournament?.name || '尚未创建赛事' }}<small class="block">{{ formatDate(row.latestTournament?.createTime || row.createTime) }}</small></template></el-table-column>
              <el-table-column label="操作" width="290" fixed="right"><template #default="{ row }"><el-button link type="primary" @click.stop="openOrganizer(row)">查看档案</el-button><el-button link @click.stop="startSupport">协助处理</el-button><el-button link type="success" :disabled="!row.userId" :title="row.userId ? '' : '没有可接收站内信的账号'" @click.stop="openOrganizerNotice(row)">发站内信</el-button></template></el-table-column>
              <template #empty><el-empty description="没有符合条件的主办方" /></template>
            </el-table>
          </section>

          <section v-else-if="activeTab === 'accounts'" class="panel table-panel">
            <div class="account-tip"><strong>账号删除保护</strong><span>只允许删除没有机构、赛事、球队、球员或成员关系的空主办方账号。业务数据不会随账号删除。</span></div>
            <div class="toolbar">
              <el-input v-model="accountKeyword" clearable placeholder="搜索账号姓名、手机号、邮箱"><template #prefix><el-icon><Search /></el-icon></template></el-input>
              <span>共 {{ filteredAccounts.length }} 个主办方账号</span>
            </div>
            <el-table :data="filteredAccounts" row-key="_id">
              <el-table-column label="登录账号" min-width="210"><template #default="{ row }"><div class="name-cell"><span class="avatar small">{{ avatarText(row.name) }}</span><div><strong>{{ row.name }}</strong><small>{{ row._id }}</small></div></div></template></el-table-column>
              <el-table-column label="手机号" width="150"><template #default="{ row }">{{ row.phone || '未填写' }}</template></el-table-column>
              <el-table-column label="邮箱" min-width="190"><template #default="{ row }">{{ row.email || '未填写' }}</template></el-table-column>
              <el-table-column label="机构状态" width="120"><template #default="{ row }"><el-tag :type="row.orgId ? 'warning' : 'info'" effect="plain">{{ row.orgId ? '已关联机构' : '无机构' }}</el-tag></template></el-table-column>
              <el-table-column prop="tournamentCount" label="创建赛事" width="95" align="center" />
              <el-table-column prop="teamCount" label="创建球队" width="95" align="center" />
              <el-table-column label="账号状态" width="100"><template #default="{ row }"><el-tag :type="row.isActive ? 'success' : 'info'">{{ row.isActive ? '正常' : '已停用' }}</el-tag></template></el-table-column>
              <el-table-column label="最近登录" width="165"><template #default="{ row }">{{ formatTime(row.lastLoginTime) }}</template></el-table-column>
              <el-table-column label="操作" width="110" fixed="right"><template #default="{ row }"><el-button link type="danger" :loading="accountDeletingId === row._id" @click="inspectAndDeleteAccount(row)">注销PC</el-button></template></el-table-column>
              <template #empty><el-empty description="没有符合条件的主办方账号" /></template>
            </el-table>
          </section>

          <section v-else-if="activeTab === 'tournaments'" class="panel table-panel">
            <div class="toolbar"><el-input v-model="tournamentKeyword" clearable placeholder="搜索赛事、主办方、城市"><template #prefix><el-icon><Search /></el-icon></template></el-input><el-select v-model="tournamentStatusFilter"><el-option label="全部状态" value="all" /><el-option v-for="(label, key) in statusMap" :key="key" :label="label" :value="key" /></el-select><span>显示 {{ filteredTournaments.length }} / {{ tournaments.length }} 场</span></div>
            <el-table :data="filteredTournaments" row-key="_id" @row-click="openTournament">
              <el-table-column label="赛事名称" min-width="260"><template #default="{ row }"><div class="name-cell"><span class="entity-icon"><el-icon><Trophy /></el-icon></span><div><strong>{{ row.name }}</strong><small>{{ categoryText(row.category) }} · {{ formatText(row.formatType) }}</small></div></div></template></el-table-column>
              <el-table-column label="主办方/创建人" min-width="210"><template #default="{ row }"><strong>{{ row.organizerName || '主办方待补充' }}</strong><small class="block">{{ row.creatorName || '创建人待核验' }}{{ row.creatorPhone ? ` · ${row.creatorPhone}` : '' }}</small></template></el-table-column><el-table-column label="举办地" min-width="130"><template #default="{ row }">{{ row.city || '待补充' }}</template></el-table-column>
              <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag></template></el-table-column><el-table-column prop="teamCount" label="参赛球队" width="105" align="center" /><el-table-column label="创建时间" width="150"><template #default="{ row }">{{ formatDate(row.createTime) }}</template></el-table-column>
              <el-table-column label="操作" width="130" fixed="right"><template #default="{ row }"><el-button link type="primary" @click.stop="openTournament(row)">查看</el-button><el-button link @click.stop="hideTournament(row)">隐藏</el-button></template></el-table-column>
              <template #empty><el-empty description="没有符合条件的赛事" /></template>
            </el-table>
            <div v-if="hiddenTournaments.length" class="hidden-collection">
              <button type="button" class="hidden-toggle" title="仅本浏览器隐藏，不影响统计" :aria-expanded="showHiddenTournaments" @click="showHiddenTournaments = !showHiddenTournaments"><span>已隐藏 {{ hiddenTournaments.length }} 场赛事</span><span>{{ showHiddenTournaments ? '收起' : '展开' }}</span></button>
              <div v-if="showHiddenTournaments" class="hidden-list">
                <div v-for="row in hiddenTournaments" :key="row._id" class="hidden-row"><div><strong>{{ row.name }}</strong><small>{{ statusText(row.status) }} · {{ row.organizerName || '主办方待补充' }}</small></div><el-button link type="primary" @click="openTournament(row)">查看</el-button><el-button link @click="restoreTournament(row)">恢复</el-button></div>
              </div>
            </div>
          </section>

          <section v-else-if="activeTab === 'teams'" class="panel table-panel">
            <div class="toolbar"><el-input v-model="teamKeyword" clearable placeholder="搜索球队、联系人、手机号、创建方"><template #prefix><el-icon><Search /></el-icon></template></el-input><span>显示 {{ filteredTeams.length }} / {{ teams.length }} 支</span></div>
            <el-table :data="filteredTeams" row-key="_id" @row-click="openTeam">
              <el-table-column label="球队" min-width="230"><template #default="{ row }"><div class="name-cell"><span class="team-logo" :title="row.logoUnavailable ? '队徽暂不可用，请在球队资料中重新上传' : ''"><img v-if="row.logo && !row.logoUnavailable" :src="row.logo" alt="" @error="handleTeamLogoError(row)" /><el-icon v-else><Flag /></el-icon></span><div><strong>{{ row.name }}</strong><small>{{ row.city || '地区待补充' }}</small></div></div></template></el-table-column>
              <el-table-column label="创建方/所属机构" min-width="200"><template #default="{ row }">{{ row.organizerName || '归属待核验' }}</template></el-table-column><el-table-column label="球队联系人" min-width="180"><template #default="{ row }"><strong>{{ row.contact || '待补充' }}</strong><small class="block">{{ row.phone || '未填写手机号' }}</small></template></el-table-column>
              <el-table-column prop="playerCount" label="球员数" width="90" align="center" /><el-table-column prop="tournamentCount" label="参赛次数" width="100" align="center" /><el-table-column label="创建时间" width="150"><template #default="{ row }">{{ formatDate(row.createTime) }}</template></el-table-column><el-table-column label="操作" width="130" fixed="right"><template #default="{ row }"><el-button link type="primary" @click.stop="openTeam(row)">查看</el-button><el-button link @click.stop="hideTeam(row)">隐藏</el-button></template></el-table-column>
              <template #empty><el-empty description="没有符合条件的球队" /></template>
            </el-table>
            <div v-if="hiddenTeams.length" class="hidden-collection">
              <button type="button" class="hidden-toggle" title="仅本浏览器隐藏，不影响统计" :aria-expanded="showHiddenTeams" @click="showHiddenTeams = !showHiddenTeams"><span>已隐藏 {{ hiddenTeams.length }} 支球队</span><span>{{ showHiddenTeams ? '收起' : '展开' }}</span></button>
              <div v-if="showHiddenTeams" class="hidden-list">
                <div v-for="row in hiddenTeams" :key="row._id" class="hidden-row"><div><strong>{{ row.name }}</strong><small>{{ row.organizerName || '归属待核验' }}</small></div><el-button link type="primary" @click="openTeam(row)">查看</el-button><el-button link @click="restoreTeam(row)">恢复</el-button></div>
              </div>
            </div>
          </section>

          <section v-else-if="activeTab === 'playerCards'"><PlayerCardTemplateLibrary /></section>
          <section v-else-if="activeTab === 'capacity'"><CapacityPerformanceMonitor ref="capacityMonitorRef" /></section>

          <template v-else-if="activeTab === 'support'">
            <section class="embedded-system"><SystemAdmin /></section>
          </template>

          <section v-else class="panel content-panel">
            <el-tabs v-model="contentTab">
              <el-tab-pane label="首页轮播" name="banners"><div class="panel-head"><div><h2>赛事中心首页轮播</h2></div><el-button type="primary" @click="openBannerDialog()"><el-icon><Plus /></el-icon>添加轮播</el-button></div><el-table :data="banners" border><el-table-column label="图片" width="190"><template #default="{ row }"><button class="banner-image" @click="previewImage(row.displayImageUrl)"><img :src="row.displayImageUrl" alt="" /></button></template></el-table-column><el-table-column prop="title" label="标题" min-width="180" /><el-table-column prop="link" label="跳转链接" min-width="220" show-overflow-tooltip /><el-table-column label="排序" width="120"><template #default="{ row }"><el-input-number v-model="row.sort" :min="0" :max="999" size="small" controls-position="right" @change="saveBannerQuick(row)" /></template></el-table-column><el-table-column label="状态" width="100"><template #default="{ row }"><el-switch v-model="row.isActive" @change="saveBannerQuick(row)" /></template></el-table-column><el-table-column label="操作" width="140"><template #default="{ row }"><el-button link type="primary" @click="openBannerDialog(row)">编辑</el-button><el-button link type="danger" @click="removeBanner(row)">删除</el-button></template></el-table-column></el-table></el-tab-pane>
              <el-tab-pane label="推荐赛事" name="featured">
                <div class="panel-head"><div><h2>公开推荐赛事</h2></div><el-button type="primary" @click="featuredDialogVisible = true"><el-icon><Plus /></el-icon>添加推荐</el-button></div>
                <el-table :data="featuredTournaments" border>
                  <el-table-column prop="name" label="赛事名称" min-width="230" />
                  <el-table-column prop="organizerName" label="主办方" min-width="180" />
                  <el-table-column label="赛事状态" width="110"><template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag></template></el-table-column>
                  <el-table-column label="公开状态" width="120"><template #default="{ row }"><el-tag :type="row.publicStatus === 'published' ? 'success' : 'info'">{{ row.publicStatus === 'published' ? `已发布 V${row.publicVersion || 1}` : '未发布' }}</el-tag></template></el-table-column>
                  <el-table-column label="排序" width="120"><template #default="{ row }"><el-input-number v-model="row.featuredSort" :min="0" :max="999" size="small" controls-position="right" @change="updateFeatured(row, true)" /></template></el-table-column>
                  <el-table-column label="操作" width="260"><template #default="{ row }">
                    <el-button v-if="row.publicStatus !== 'published'" link type="success" :loading="publishingTournamentId === row._id" @click="publishTournament(row)">发布到赛事中心</el-button>
                    <el-button v-else link type="warning" :loading="publishingTournamentId === row._id" @click="publishTournament(row)">更新快照</el-button>
                    <el-button v-if="row.publicStatus === 'published'" link type="danger" :loading="publishingTournamentId === row._id" @click="revokeTournament(row)">撤回公开</el-button>
                    <el-button link type="danger" @click="removeFeatured(row)">取消推荐</el-button>
                  </template></el-table-column>
                </el-table>
              </el-tab-pane>
            </el-tabs>
          </section>
        </div>
      </main>

      <el-dialog v-model="noticeDialogVisible" title="发送站内信" width="min(560px, 92vw)">
        <div class="notice-target"><span>收件人</span><strong>{{ noticeTarget?.name || '主办方' }}</strong></div>
        <el-form label-position="top">
          <el-form-item label="标题"><el-input v-model.trim="noticeForm.title" maxlength="80" show-word-limit /></el-form-item>
          <el-form-item label="内容"><el-input v-model.trim="noticeForm.body" type="textarea" :rows="4" maxlength="1000" show-word-limit /></el-form-item>
        </el-form>
        <p class="notice-destination">收件人可在个人资料中绑定手机号，完成后主办方档案会更新。</p>
        <template #footer><el-button @click="noticeDialogVisible=false">取消</el-button><el-button type="primary" :loading="noticeSending" @click="sendOrganizerNotice">发送站内信</el-button></template>
      </el-dialog>

      <el-drawer v-model="organizerDrawerVisible" title="主办方运营档案" size="min(680px, 92vw)">
        <template v-if="selectedOrganizer"><div class="profile-head"><span class="avatar large">{{ avatarText(selectedOrganizer.name) }}</span><div><h2>{{ selectedOrganizer.name }}</h2><p>{{ selectedOrganizer.contact }} · {{ selectedOrganizer.orgId ? '机构主办方' : '个人主办方账号' }}</p></div></div><div class="contact-card"><div><small>手机号</small><strong>{{ selectedOrganizer.phone || '尚未填写' }}</strong></div><div><small>邮箱</small><strong>{{ selectedOrganizer.email || '尚未填写' }}</strong></div><div class="contact-actions"><el-button :disabled="!selectedOrganizer.phone" @click="copyText(selectedOrganizer.phone)"><el-icon><CopyDocument /></el-icon>复制手机号</el-button><el-button type="primary" @click="startSupport"><el-icon><Headset /></el-icon>协助处理问题</el-button></div></div><el-descriptions :column="2" border class="description"><el-descriptions-item label="创建赛事">{{ selectedOrganizer.tournamentCount }}</el-descriptions-item><el-descriptions-item label="创建球队">{{ selectedOrganizer.teamCount }}</el-descriptions-item><el-descriptions-item label="账号状态">{{ selectedOrganizer.isActive ? '正常' : '已停用' }}</el-descriptions-item><el-descriptions-item label="最近登录">{{ formatTime(selectedOrganizer.lastLoginTime) }}</el-descriptions-item></el-descriptions><h3>他创建的赛事</h3><div v-if="selectedOrganizerTournaments.length" class="drawer-list"><button v-for="item in selectedOrganizerTournaments" :key="item._id" @click="openTournament(item)"><span><strong>{{ item.name }}</strong><small>{{ statusText(item.status) }} · {{ item.teamCount }} 支球队</small></span><el-icon><ArrowRight /></el-icon></button></div><el-empty v-else description="尚未创建赛事" :image-size="70" /><h3>他创建的球队</h3><div v-if="selectedOrganizerTeams.length" class="drawer-list"><button v-for="item in selectedOrganizerTeams" :key="item._id" @click="openTeam(item)"><span><strong>{{ item.name }}</strong><small>{{ item.city || '地区待补充' }} · 参加 {{ item.tournamentCount }} 场赛事</small></span><el-icon><ArrowRight /></el-icon></button></div><el-empty v-else description="尚未创建球队" :image-size="70" /></template>
      </el-drawer>

      <el-drawer v-model="detailDrawerVisible" :title="selectedTournament ? '赛事平台档案' : '球队平台档案'" size="min(620px, 92vw)">
        <template v-if="selectedTournament"><div class="profile-head"><span class="entity-icon large"><el-icon><Trophy /></el-icon></span><div><h2>{{ selectedTournament.name }}</h2><p>{{ selectedTournament.organizerName || '主办方待补充' }}</p></div></div><el-descriptions :column="1" border><el-descriptions-item label="赛事状态"><el-tag :type="statusType(selectedTournament.status)">{{ statusText(selectedTournament.status) }}</el-tag></el-descriptions-item><el-descriptions-item label="实际创建人">{{ selectedTournament.creatorName || '待核验' }}</el-descriptions-item><el-descriptions-item label="创建人手机"><button v-if="selectedTournament.creatorPhone" class="phone" @click="copyText(selectedTournament.creatorPhone)">{{ selectedTournament.creatorPhone }} <el-icon><CopyDocument /></el-icon></button><span v-else>待补充</span></el-descriptions-item><el-descriptions-item label="创建人邮箱">{{ selectedTournament.creatorEmail || '待补充' }}</el-descriptions-item><el-descriptions-item label="赛事类别">{{ categoryText(selectedTournament.category) }}</el-descriptions-item><el-descriptions-item label="赛制">{{ formatText(selectedTournament.formatType) }}</el-descriptions-item><el-descriptions-item label="举办地">{{ selectedTournament.city || '待补充' }}</el-descriptions-item><el-descriptions-item label="参赛球队">{{ selectedTournament.teamCount }} 支</el-descriptions-item><el-descriptions-item label="创建时间">{{ formatTime(selectedTournament.createTime) }}</el-descriptions-item><el-descriptions-item label="平台标识">{{ selectedTournament._id }}</el-descriptions-item></el-descriptions></template>
        <template v-else-if="selectedTeam"><div class="profile-head"><span class="team-logo large" :title="selectedTeam.logoUnavailable ? '队徽暂不可用，请在球队资料中重新上传' : ''"><img v-if="selectedTeam.logo && !selectedTeam.logoUnavailable" :src="selectedTeam.logo" alt="" @error="handleTeamLogoError(selectedTeam)" /><el-icon v-else><Flag /></el-icon></span><div><h2>{{ selectedTeam.name }}</h2><p>{{ selectedTeam.organizerName || '归属待核验' }}</p></div></div><el-descriptions :column="1" border><el-descriptions-item label="所在地区">{{ selectedTeam.city || '待补充' }}</el-descriptions-item><el-descriptions-item label="球队联系人">{{ selectedTeam.contact || '待补充' }}</el-descriptions-item><el-descriptions-item label="联系电话">{{ selectedTeam.phone || '待补充' }}</el-descriptions-item><el-descriptions-item label="球员数量">{{ selectedTeam.playerCount }}</el-descriptions-item><el-descriptions-item label="参赛次数">{{ selectedTeam.tournamentCount }}</el-descriptions-item><el-descriptions-item label="创建时间">{{ formatTime(selectedTeam.createTime) }}</el-descriptions-item><el-descriptions-item label="平台标识">{{ selectedTeam._id }}</el-descriptions-item></el-descriptions></template>
      </el-drawer>

      <el-dialog v-model="bannerDialogVisible" :title="bannerForm.bannerId ? '编辑轮播图' : '添加轮播图'" width="min(620px, 92vw)"><el-form label-width="88px"><el-form-item label="标题"><el-input v-model="bannerForm.title" maxlength="80" /></el-form-item><el-form-item label="图片" required><div class="upload"><button @click.prevent="openBannerCropper"><img v-if="bannerForm.displayImageUrl" :src="bannerForm.displayImageUrl" alt="" /><span v-else>选择并裁剪图片</span></button><small>建议比例 16:5，支持 JPG、PNG</small></div></el-form-item><el-form-item label="跳转链接"><el-input v-model="bannerForm.link" /></el-form-item><el-form-item label="排序"><el-input-number v-model="bannerForm.sort" :min="0" :max="999" /></el-form-item><el-form-item label="状态"><el-switch v-model="bannerForm.isActive" active-text="启用" inactive-text="停用" /></el-form-item></el-form><template #footer><el-button @click="bannerDialogVisible = false">取消</el-button><el-button type="primary" :loading="savingBanner" @click="submitBanner">保存</el-button></template></el-dialog>
      <el-dialog v-model="featuredDialogVisible" title="添加推荐赛事" width="min(760px, 92vw)"><el-input v-model="featuredKeyword" clearable placeholder="搜索未推荐赛事" class="dialog-search" /><el-table :data="featuredCandidates" max-height="420"><el-table-column prop="name" label="赛事名称" min-width="240" /><el-table-column prop="organizerName" label="主办方" min-width="180" /><el-table-column label="操作" width="90"><template #default="{ row }"><el-button link type="primary" @click="addFeatured(row)">添加</el-button></template></el-table-column></el-table></el-dialog>
      <ImageCropper ref="bannerCropperRef" title="裁剪轮播图" :aspect-ratio="1920 / 600" @confirm="handleBannerCrop" />
    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowRight, Back, CircleCheckFilled, Connection, CopyDocument, DataAnalysis, Flag, Headset, Loading, Picture, Plus, Refresh, Search, Service, Tickets, Trophy, UserFilled, Warning } from '@element-plus/icons-vue'
import { callFunction, logout } from '@/utils/cloud'
import { getPlatformSession, isPlatformSession } from '@/utils/platformSession'
import { getTempFileURL, uploadBase64Image } from '@/utils/upload'
import ImageCropper from '@/components/common/ImageCropper.vue'
import SystemAdmin from '@/views/system/SystemAdmin.vue'
import PlayerCardTemplateLibrary from './PlayerCardTemplateLibrary.vue'
import CapacityPerformanceMonitor from './CapacityPerformanceMonitor.vue'

const router = useRouter(), route = useRoute(), logoUrl = `${import.meta.env.BASE_URL}logo.png`
const requestedSection = String(route.query.section || '')
const activeTab = ref(['overview','organizers','accounts','tournaments','teams','support','content','playerCards','capacity'].includes(requestedSection) ? requestedSection : 'overview'), contentTab = ref('banners'), checkingPermission = ref(true), loading = ref(false), savingBanner = ref(false), lastLoadedAt = ref(null)
const permissionGranted = ref(false), overviewLoaded = ref(false), capacityMonitorRef = ref(null)
const overviewTabs = ['overview', 'organizers', 'accounts', 'tournaments', 'teams', 'support', 'content']
const displayedLoading = computed(() => activeTab.value === 'capacity' ? Boolean(capacityMonitorRef.value?.loading) : loading.value)
const displayedLoadedAt = computed(() => activeTab.value === 'capacity' ? capacityMonitorRef.value?.lastLoadedAt : lastLoadedAt.value)
function refreshActiveSection() { return activeTab.value === 'capacity' ? capacityMonitorRef.value?.refresh() : loadOverview() }
watch(activeTab, tab => { if (permissionGranted.value && overviewTabs.includes(tab) && !overviewLoaded.value && !loading.value) void loadOverview() })
const banners = ref([]), tournaments = ref([]), organizers = ref([]), accounts = ref([]), teams = ref([]), supportRequests = ref([])
const organizerKeyword = ref(''), organizerContactFilter = ref('all'), accountKeyword = ref(''), tournamentKeyword = ref(''), tournamentStatusFilter = ref('all'), teamKeyword = ref(''), featuredKeyword = ref('')
const accountDeletingId = ref('')
const noticeDialogVisible = ref(false), noticeSending = ref(false), noticeTarget = ref(null)
const noticeForm = reactive({ title: '', body: '' })
const organizerDrawerVisible = ref(false), detailDrawerVisible = ref(false), bannerDialogVisible = ref(false), featuredDialogVisible = ref(false), bannerCropperRef = ref(null)
const publishingTournamentId = ref('')
const selectedOrganizer = ref(null), selectedTournament = ref(null), selectedTeam = ref(null)
const hiddenStorageKey = `sxfPlatformHiddenRows:v1:${getPlatformSession()?.userId || 'platform-owner'}`
function readHiddenRows() {
  try {
    const stored = JSON.parse(localStorage.getItem(hiddenStorageKey) || '{}')
    const ids = value => Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))] : []
    return { tournaments: ids(stored.tournaments), teams: ids(stored.teams) }
  } catch { return { tournaments: [], teams: [] } }
}
const storedHiddenRows = readHiddenRows()
const hiddenTournamentIds = ref(storedHiddenRows.tournaments)
const hiddenTeamIds = ref(storedHiddenRows.teams)
const showHiddenTournaments = ref(false), showHiddenTeams = ref(false)
function saveHiddenRows() {
  try {
    localStorage.setItem(hiddenStorageKey, JSON.stringify({
      tournaments: hiddenTournamentIds.value,
      teams: hiddenTeamIds.value
    }))
  } catch { ElMessage.warning('隐藏设置未保存，请检查浏览器存储权限') }
}
function changeHiddenRow(kind, row, hidden) {
  const id = String(row?._id || '')
  if (!id) return
  const target = kind === 'tournaments' ? hiddenTournamentIds : hiddenTeamIds
  target.value = hidden
    ? [...new Set([...target.value, id])]
    : target.value.filter(value => value !== id)
  saveHiddenRows()
}
const hideTournament = row => changeHiddenRow('tournaments', row, true)
const restoreTournament = row => changeHiddenRow('tournaments', row, false)
const hideTeam = row => changeHiddenRow('teams', row, true)
const restoreTeam = row => changeHiddenRow('teams', row, false)
const stats = reactive({ totalTournaments: 0, totalOrganizers: 0, totalTeams: 0, activeSupportCount: 0, missingContactCount: 0 })
const bannerForm = reactive({ bannerId: '', title: '', imageUrl: '', displayImageUrl: '', link: '', sort: 0, isActive: true, storageType: 'cloud' })
const sections = { overview: ['运营总览','掌握平台赛事、主办方和问题协助的最新情况'], organizers: ['主办方联系人','找到赛事创建者，查看联系方式及其赛事和球队'], accounts: ['账号管理','管理主办方登录账号，并安全处理无业务关联的空账号'], tournaments: ['全平台赛事','查看平台内全部赛事的创建方、状态和参赛规模'], teams: ['全平台球队','查看长期球队资产、创建方和历史参赛情况'], support: ['问题与协助','通过用户确认授权的方式安全处理实际使用问题'], content: ['内容运营','管理公开赛事中心的轮播和推荐赛事'], playerCards: ['球员卡系统',''], capacity: ['容量与性能监控','查看平台汇总计数、资源指标与性能验证记录'] }
const section = computed(() => ({ title: sections[activeTab.value][0], description: sections[activeTab.value][1] }))
const navigation = computed(() => [{key:'overview',label:'运营总览',icon:Picture},{key:'organizers',label:'主办方联系人',icon:UserFilled,badge:stats.missingContactCount||''},{key:'accounts',label:'账号管理',icon:UserFilled},{key:'tournaments',label:'全平台赛事',icon:Trophy},{key:'teams',label:'全平台球队',icon:Flag},{key:'playerCards',label:'球员卡系统',icon:Picture},{key:'capacity',label:'容量与性能监控',icon:DataAnalysis},{key:'support',label:'问题与协助',icon:Headset,badge:stats.activeSupportCount||''},{key:'content',label:'内容运营',icon:Tickets}])
const statCards = computed(() => [{key:'o',label:'主办方',value:stats.totalOrganizers,hint:'平台联系人档案',icon:UserFilled,color:'blue',target:'organizers'},{key:'t',label:'全部赛事',value:stats.totalTournaments,hint:'含草稿与历史赛事',icon:Trophy,color:'green',target:'tournaments'},{key:'m',label:'长期球队',value:stats.totalTeams,hint:'不等同于参赛快照',icon:Flag,color:'orange',target:'teams'},{key:'s',label:'协助处理中',value:stats.activeSupportCount,hint:'等待确认或授权中',icon:Service,color:'purple',target:'support'}])
const currentUserName = computed(() => getPlatformSession()?.userName || '平台负责人')
let tournamentStatusTimer = null
let tournamentStatusRefreshRunning = false
let lastTournamentStatusWarningAt = 0
const recentTournaments = computed(() => tournaments.value.filter(row => !hiddenTournamentIds.value.includes(String(row._id))).slice(0, 6)), featuredTournaments = computed(() => tournaments.value.filter(x => x.isFeatured).sort((a,b) => a.featuredSort-b.featuredSort))
const hiddenTournaments = computed(() => tournaments.value.filter(row => hiddenTournamentIds.value.includes(String(row._id))))
const hiddenTeams = computed(() => teams.value.filter(row => hiddenTeamIds.value.includes(String(row._id))))
const norm = value => String(value || '').trim().toLowerCase()
const featuredCandidates = computed(() => tournaments.value.filter(x => !x.isFeatured && (!norm(featuredKeyword.value) || norm(x.name).includes(norm(featuredKeyword.value)))))
const filteredOrganizers = computed(() => organizers.value.filter(x => { const match = !norm(organizerKeyword.value) || norm([x.name,x.contact,x.phone,x.email].join(' ')).includes(norm(organizerKeyword.value)); const f=organizerContactFilter.value; return match && (f==='all'||(f==='ready'&&x.hasContact)||(f==='missing'&&!x.hasContact)||(f==='support'&&x.activeSupportCount>0)) }))
const filteredAccounts = computed(() => accounts.value.filter(x => !norm(accountKeyword.value) || norm([x.name,x.phone,x.email,x._id].join(' ')).includes(norm(accountKeyword.value))))
const filteredTournaments = computed(() => tournaments.value.filter(x => !hiddenTournamentIds.value.includes(String(x._id)) && (!norm(tournamentKeyword.value)||norm([x.name,x.organizerName,x.city].join(' ')).includes(norm(tournamentKeyword.value)))&&(tournamentStatusFilter.value==='all'||x.status===tournamentStatusFilter.value)))
const filteredTeams = computed(() => teams.value.filter(x => !hiddenTeamIds.value.includes(String(x._id)) && (!norm(teamKeyword.value)||norm([x.name,x.organizerName,x.contact,x.phone,x.city].join(' ')).includes(norm(teamKeyword.value)))))
const selectedOrganizerTournaments = computed(() => selectedOrganizer.value ? tournaments.value.filter(x => !hiddenTournamentIds.value.includes(String(x._id)) && selectedOrganizer.value.tournamentIds.includes(String(x._id))) : [])
const selectedOrganizerTeams = computed(() => selectedOrganizer.value ? teams.value.filter(x => !hiddenTeamIds.value.includes(String(x._id)) && selectedOrganizer.value.teamIds.includes(String(x._id))) : [])
const categoryMap={youth:'青少年赛事',amateur:'业余赛事',local:'地协赛',city:'城市联赛',professional:'职业联赛'},formatMap={tournament:'赛会制',cup:'杯赛制',league:'联赛制',combined:'混合制',hybrid:'混合制'},statusMap={draft:'草稿',registering:'报名中',published:'已发布',ongoing:'进行中',ended:'已结束',completed:'已结束',cancelled:'已取消'}
const categoryText=v=>categoryMap[v]||v||'未分类',formatText=v=>formatMap[v]||v||'未设置',statusText=v=>statusMap[v]||v||'未知',statusType=v=>({draft:'info',registering:'primary',published:'success',ongoing:'warning',cancelled:'danger'}[v]||'info')
const supportStatusText=v=>({pending:'等待确认',active:'协助中',rejected:'已拒绝',revoked:'已撤销',expired:'已过期'}[v]||'未知'),supportStatusType=v=>({pending:'warning',active:'success',rejected:'danger'}[v]||'info')
const avatarText=v=>String(v||'主').slice(0,1)
function dateOf(value){if(!value)return null;const d=new Date(value?.$date||value);return Number.isNaN(d.getTime())?null:d}
const formatDate=v=>dateOf(v)?.toLocaleDateString('zh-CN')||'时间待补充',formatTime=(v,only=false)=>{const d=dateOf(v);return d?(only?d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):d.toLocaleString('zh-CN',{hour12:false})):'—'}
async function copyText(v){if(!v)return;try{await navigator.clipboard.writeText(String(v));ElMessage.success('手机号已复制')}catch{ElMessage.warning('复制失败，请手动复制')}}
function openOrganizer(v){selectedOrganizer.value=v;organizerDrawerVisible.value=true}function openTournament(v){selectedTournament.value=v;selectedTeam.value=null;detailDrawerVisible.value=true}function openTeam(v){selectedTeam.value=v;selectedTournament.value=null;detailDrawerVisible.value=true}function startSupport(){organizerDrawerVisible.value=false;activeTab.value='support'}function showMissingContacts(){organizerContactFilter.value='missing';activeTab.value='organizers'}function previewImage(v){if(v)window.open(v,'_blank','noopener,noreferrer')}
function handleTeamLogoError(team){team.logoUnavailable=true;team.logo=''}
function openOrganizerNotice(row){if(!row?.userId)return;noticeTarget.value=row;noticeForm.title='请补充联系电话';noticeForm.body='请绑定已验证手机号，方便平台与您联系。点击“完善联系方式”可直接进入个人资料绑定手机号。';noticeDialogVisible.value=true}
const resultError=(r,f)=>r?.error||r?.message||f
async function resolveImageUrl(v){if(!v||!v.startsWith('cloud://'))return v;try{const r=await getTempFileURL(v);return r.success?r.url:v}catch{return v}}
async function checkPermission(){const r=await callFunction('platformOwner',{action:'status'});if(!r.success||!r.isPlatformOwner){ElMessage.error(resultError(r,'仅平台负责人可以进入平台运营中心'));const platformSession=isPlatformSession();if(platformSession)await logout();await router.replace(platformSession?'/platform-login':'/tournament-space');return false}return true}
async function refreshTournamentStatuses(){if(tournamentStatusRefreshRunning||!tournaments.value.length)return;tournamentStatusRefreshRunning=true;try{for(let offset=0;offset<tournaments.value.length;offset+=100){const rows=tournaments.value.slice(offset,offset+100);const r=await callFunction('manageTournamentCenterContent',{action:'refreshTournamentStatuses',tournamentIds:rows.map(item=>item._id)});if(!r?.success)throw new Error(resultError(r,'赛事状态暂时未更新'));const startedIds=new Set((r.data?.startedTournamentIds||[]).map(String));rows.forEach(item=>{if(startedIds.has(String(item._id))&&!['cancelled','ended','completed'].includes(String(item.status||'').toLowerCase()))item.status='ongoing'})}lastLoadedAt.value=new Date()}catch(error){if(Date.now()-lastTournamentStatusWarningAt>300000){lastTournamentStatusWarningAt=Date.now();ElMessage.warning(error.message||'赛事状态暂时未更新，请稍后重试')}}finally{tournamentStatusRefreshRunning=false}}
async function loadOverview(){loading.value=true;try{const r=await callFunction('manageTournamentCenterContent',{action:'overview'});if(!r.success)throw new Error(resultError(r,'加载平台运营数据失败'));const d=r.data||{};banners.value=await Promise.all((d.banners||[]).map(async x=>({...x,displayImageUrl:await resolveImageUrl(x.imageUrl)})));tournaments.value=d.tournaments||[];organizers.value=d.organizers||[];accounts.value=d.accounts||[];teams.value=d.teams||[];supportRequests.value=d.supportRequests||[];Object.assign(stats,d.stats||{});overviewLoaded.value=true;lastLoadedAt.value=new Date();await refreshTournamentStatuses()}catch(e){ElMessage.error(e.message||'加载平台运营数据失败')}finally{loading.value=false}}
async function sendOrganizerNotice(){const target=noticeTarget.value;if(!target?.userId||noticeSending.value)return;if(!noticeForm.title||!noticeForm.body)return ElMessage.warning('请填写通知标题和内容');noticeSending.value=true;try{const result=await callFunction('manageTournamentCenterContent',{action:'sendOrganizerNotice',recipientUserId:target.userId,title:noticeForm.title,body:noticeForm.body});if(!result?.success)throw new Error(result?.error||'站内信发送失败');ElMessage.success('站内信已发送');noticeDialogVisible.value=false;await loadOverview()}catch(error){ElMessage.error(error.message||'站内信发送失败')}finally{noticeSending.value=false}}
async function inspectAndDeleteAccount(row){if(accountDeletingId.value)return;accountDeletingId.value=row._id;try{const inspection=await callFunction('manageTournamentCenterContent',{action:'inspectOrganizerAccountDeletion',userId:row._id});if(!inspection.success)throw new Error(resultError(inspection,'PC账号注销预检查失败'));if(!inspection.canDelete){await ElMessageBox.alert('该账号仍有创建的赛事，请先处理赛事后再注销PC账号。','暂不能注销',{type:'warning',confirmButtonText:'知道了'});return}const prompt=await ElMessageBox.prompt('仅解除PC微信、服务号绑定和网页会话；小程序、机构和球队不受影响。请输入“注销PC”确认。','注销PC账号',{confirmButtonText:'确认注销',cancelButtonText:'取消',type:'error',inputPattern:/^注销PC$/,inputErrorMessage:'请输入“注销PC”'});const result=await callFunction('manageTournamentCenterContent',{action:'deleteOrganizerAccount',userId:row._id,confirmText:prompt.value});if(!result.success)throw new Error(resultError(result,'PC账号注销失败'));ElMessage.success('PC账号已注销，小程序不受影响');await loadOverview()}catch(e){if(!['cancel','close'].includes(e))ElMessage.error(e.message||'PC账号注销失败')}finally{accountDeletingId.value=''}}
function openBannerDialog(x=null){Object.assign(bannerForm,{bannerId:'',title:'',imageUrl:'',displayImageUrl:'',link:'',sort:0,isActive:true,storageType:'cloud'});if(x)Object.assign(bannerForm,{bannerId:x._id,title:x.title,imageUrl:x.imageUrl,displayImageUrl:x.displayImageUrl,link:x.link,sort:x.sort,isActive:x.isActive,storageType:x.storageType||'cloud'});bannerDialogVisible.value=true}
function openBannerCropper(){const i=document.createElement('input');i.type='file';i.accept='image/jpeg,image/png,image/webp';i.onchange=e=>{const f=e.target.files?.[0];if(f)bannerCropperRef.value?.open(f)};i.click()}
async function handleBannerCrop(blob,dataUrl){bannerForm.displayImageUrl=dataUrl;try{const r=await uploadBase64Image(dataUrl,'banners');if(!r.success||!r.fileID)throw new Error(r.message||'图片上传失败');bannerForm.imageUrl=r.fileID;bannerForm.displayImageUrl=await resolveImageUrl(r.fileID);ElMessage.success('图片上传成功')}catch(e){bannerForm.imageUrl='';ElMessage.error(e.message||'图片上传失败')}}
async function saveBanner(payload,msg=''){const r=await callFunction('manageTournamentCenterContent',{action:'saveBanner',...payload});if(!r.success)throw new Error(resultError(r,'保存失败'));if(msg)ElMessage.success(msg)}
async function submitBanner(){if(!bannerForm.imageUrl)return ElMessage.warning('请先上传轮播图片');savingBanner.value=true;try{await saveBanner({...bannerForm},'轮播图已保存');bannerDialogVisible.value=false;await loadOverview()}catch(e){ElMessage.error(e.message)}finally{savingBanner.value=false}}
async function saveBannerQuick(x){try{await saveBanner({bannerId:x._id,title:x.title,imageUrl:x.imageUrl,link:x.link,sort:x.sort,isActive:x.isActive,storageType:x.storageType},'设置已保存');await loadOverview()}catch(e){ElMessage.error(e.message);await loadOverview()}}
async function removeBanner(x){try{await ElMessageBox.confirm(`确定删除轮播图“${x.title||'未命名'}”吗？`,'删除轮播图',{type:'warning'});const r=await callFunction('manageTournamentCenterContent',{action:'deleteBanner',bannerId:x._id});if(!r.success)throw new Error(resultError(r,'删除失败'));ElMessage.success('轮播图已删除');await loadOverview()}catch(e){if(!['cancel','close'].includes(e))ElMessage.error(e.message)}}
async function updateFeatured(x,enabled,msg=true){try{const r=await callFunction('manageTournamentCenterContent',{action:'setFeatured',tournamentId:x._id,enabled,sort:x.featuredSort||0});if(!r.success)throw new Error(resultError(r,'更新失败'));if(msg)ElMessage.success(enabled?'推荐设置已保存':'已取消推荐');await loadOverview()}catch(e){ElMessage.error(e.message)}}
async function publishTournament(x){if(publishingTournamentId.value)return;try{await ElMessageBox.confirm(`仅公开赛事基础信息、公开球队/队徽、已发布赛程和已审核赛果。确认发布“${x.name}”吗？`,'发布到赛事中心',{type:'warning',confirmButtonText:x.publicStatus==='published'?'更新快照':'确认发布'});publishingTournamentId.value=x._id;const r=await callFunction('manageTournamentCenterContent',{action:'publishTournamentCenter',tournamentId:x._id,sort:x.featuredSort||0});if(!r.success)throw new Error(resultError(r,'发布失败'));ElMessage.success(`赛事中心快照 V${r.version} 已发布`);await loadOverview()}catch(e){if(!['cancel','close'].includes(e))ElMessage.error(e.message||'发布失败')}finally{publishingTournamentId.value=''}}
async function revokeTournament(x){if(publishingTournamentId.value)return;try{await ElMessageBox.confirm(`撤回后“${x.name}”将立即从公共赛事中心消失，确认撤回吗？`,'撤回公开赛事',{type:'warning',confirmButtonText:'确认撤回'});publishingTournamentId.value=x._id;const r=await callFunction('manageTournamentCenterContent',{action:'revokeTournamentCenter',tournamentId:x._id});if(!r.success)throw new Error(resultError(r,'撤回失败'));ElMessage.success('赛事已从公共中心撤回');await loadOverview()}catch(e){if(!['cancel','close'].includes(e))ElMessage.error(e.message||'撤回失败')}finally{publishingTournamentId.value=''}}
async function addFeatured(x){await updateFeatured(x,true);featuredDialogVisible.value=false}async function removeFeatured(x){try{await ElMessageBox.confirm(`确定取消推荐“${x.name}”吗？`,'取消推荐',{type:'warning'});await updateFeatured(x,false)}catch(e){if(!['cancel','close'].includes(e))ElMessage.error(e.message)}}
function handleTournamentStatusVisibility(){if(document.visibilityState==='visible'&&['overview','tournaments'].includes(activeTab.value))void refreshTournamentStatuses()}
onMounted(async()=>{document.title='赛小蜂足球 - 平台运营中心';try{if(await checkPermission()){permissionGranted.value=true;if(overviewTabs.includes(activeTab.value))await loadOverview();tournamentStatusTimer=window.setInterval(()=>{if(document.visibilityState==='visible'&&['overview','tournaments'].includes(activeTab.value))void refreshTournamentStatuses()},30000);document.addEventListener('visibilitychange',handleTournamentStatusVisibility)}}catch(e){ElMessage.error(e.message||'权限校验失败');await router.replace(isPlatformSession()?'/platform-login':'/tournament-space')}finally{checkingPermission.value=false}})
onBeforeUnmount(()=>{if(tournamentStatusTimer)window.clearInterval(tournamentStatusTimer);document.removeEventListener('visibilitychange',handleTournamentStatusVisibility)})
</script>

<style scoped>
:global(body){margin:0;background:#f3f6f4}.platform-console{min-height:100vh;color:#17211b;background:#f3f6f4}.permission-loading{min-height:100vh;display:grid;place-content:center;justify-items:center;gap:14px;color:#237a49}.sidebar{position:fixed;inset:0 auto 0 0;z-index:10;width:238px;display:flex;flex-direction:column;padding:22px 16px 18px;color:#fff;background:linear-gradient(180deg,#0c3b27,#082c1d);box-sizing:border-box}.brand{display:flex;align-items:center;gap:12px;padding:0 8px 24px;border-bottom:1px solid #ffffff1a}.brand img{width:44px;height:44px;padding:4px;object-fit:contain;border-radius:13px;background:#fff;box-sizing:border-box}.brand div,.owner{display:flex;flex-direction:column;gap:4px}.brand span,.owner small{color:#ffffff9e;font-size:12px}.sidebar nav{display:flex;flex-direction:column;gap:6px;padding-top:22px}.sidebar nav button{min-height:46px;display:grid;grid-template-columns:22px 1fr auto;align-items:center;gap:10px;padding:0 13px;color:#ffffffb3;border:0;border-radius:10px;background:transparent;text-align:left;cursor:pointer}.sidebar nav button:hover{color:#fff;background:#ffffff12}.sidebar nav button.active{color:#fff;background:#198754;box-shadow:0 8px 20px #00000024}.sidebar nav em{min-width:20px;padding:2px 6px;border-radius:10px;background:#e6594f;font-size:11px;font-style:normal;text-align:center}.sidebar-bottom{margin-top:auto}.owner{margin-bottom:8px;padding:13px;border:1px solid #ffffff17;border-radius:10px;background:#ffffff0d}.owner strong{overflow:hidden;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.sidebar-bottom :deep(.el-button){color:#ffffffa6}.platform-console>main{min-height:100vh;margin-left:238px}.topbar{min-height:112px;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:22px 34px;border-bottom:1px solid #dfe7e2;background:#ffffffeb;box-sizing:border-box}.topbar h1{margin:3px 0 0;font-size:25px}.topbar p{margin:5px 0 0;color:#738078;font-size:13px}.topbar>div>small{color:#248553;font-size:10px;font-weight:700;letter-spacing:.12em}.top-actions{display:flex;align-items:center;gap:12px}.top-actions span{color:#8a948e;font-size:12px}.workspace{max-width:1560px;margin:auto;padding:24px 30px 40px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:15px}.stats>button{min-height:112px;display:grid;grid-template-columns:50px 1fr 18px;align-items:center;gap:13px;padding:18px;border:1px solid #e0e7e3;border-radius:14px;background:#fff;text-align:left;cursor:pointer;box-shadow:0 5px 18px #1e462d0a}.stats>button:hover{border-color:#9bc3ac}.stat-icon{width:50px;height:50px;display:grid;place-items:center;border-radius:14px;font-size:24px}.stat-icon.blue{color:#2771d6;background:#ebf3ff}.stat-icon.green{color:#17814c;background:#eaf8f0}.stat-icon.orange{color:#d16a21;background:#fff2e8}.stat-icon.purple{color:#8154cb;background:#f3edff}.stat-copy{display:flex;flex-direction:column}.stat-copy>strong{font-size:27px}.stat-copy b{font-size:13px}.stat-copy small{margin-top:4px;color:#929b95;font-size:11px}.overview-grid{display:grid;grid-template-columns:1.65fr .8fr;gap:16px;margin-top:17px}.panel{overflow:hidden;border:1px solid #e0e7e3;border-radius:14px;background:#fff;box-shadow:0 5px 18px #1e462d08}.panel-head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:20px 22px;border-bottom:1px solid #edf1ee}.panel-head h2{margin:0;font-size:16px}.panel-head p{margin:5px 0 0;color:#839087;font-size:12px}.activity-list>button{width:100%;display:grid;grid-template-columns:38px 1fr auto 80px;align-items:center;gap:12px;padding:14px 20px;border:0;border-bottom:1px solid #f0f3f1;background:#fff;text-align:left;cursor:pointer}.activity-list>button:hover,.organizer-cards>button:hover,.drawer-list button:hover{background:#f8fbf9}.activity-list>button>span:nth-child(2),.organizer-cards>button>span:nth-child(2),.drawer-list button span{min-width:0;display:flex;flex-direction:column;gap:5px}.activity-list small,.organizer-cards small,.drawer-list small,.name-cell small,.block,.table-panel td small{color:#879189;font-size:11px}.entity-icon,.team-logo{width:36px;height:36px;display:grid;place-items:center;overflow:hidden;flex:0 0 auto;color:#237a49;border-radius:10px;background:#e9f6ef}.team-logo img{width:100%;height:100%;object-fit:cover}.attention{padding-bottom:16px}.notice{width:calc(100% - 32px);min-height:76px;display:grid;grid-template-columns:38px 1fr 18px;align-items:center;gap:12px;margin:14px 16px 0;padding:12px;border:1px solid #eadfca;border-radius:11px;background:#fffaf1;text-align:left;cursor:pointer}.notice.danger{border-color:#edd8d5;background:#fff7f6}.notice span{display:flex;flex-direction:column;gap:5px}.all-clear{min-height:190px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#7b887f}.all-clear .el-icon{color:#2a9a5d;font-size:35px}.recent-organizers{margin-top:17px}.organizer-cards{display:grid;grid-template-columns:repeat(4,1fr)}.organizer-cards>button{display:grid;grid-template-columns:42px 1fr 18px;align-items:center;gap:11px;padding:18px;border:0;border-right:1px solid #edf1ee;background:#fff;text-align:left;cursor:pointer}.avatar{width:42px;height:42px;display:grid;place-items:center;flex:0 0 auto;color:#fff;border-radius:12px;background:linear-gradient(135deg,#238b56,#125f39);font-weight:700}.avatar.small{width:35px;height:35px}.avatar.large{width:58px;height:58px;font-size:21px}.table-panel .toolbar{display:flex;align-items:center;gap:12px;padding:17px 20px;border-bottom:1px solid #e9eeeb}.toolbar .el-input{width:min(390px,42vw)}.toolbar .el-select{width:170px}.toolbar>span{margin-left:auto;color:#7e8982;font-size:12px}.name-cell{display:flex;align-items:center;gap:11px}.name-cell>div{min-width:0;display:flex;flex-direction:column;gap:4px}.block{display:block;margin-top:4px}.phone{padding:0;color:#176d43;border:0;background:transparent;font-weight:600;cursor:pointer}.support-hero{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:17px;padding:25px 28px;color:#fff;border-radius:15px;background:linear-gradient(120deg,#0f5132,#188455);box-shadow:0 12px 28px #115b362e}.support-hero>div{display:flex;align-items:center;gap:16px}.support-hero>div>span{width:54px;height:54px;display:grid;place-items:center;border-radius:15px;background:#ffffff24;font-size:27px}.support-hero h2{margin:0}.support-hero p{margin:6px 0 0;color:#ffffffb8;font-size:12px}.support-hero :deep(.el-button){color:#155e3a;border-color:#fff;background:#fff}.content-panel{padding:0 20px 20px}.content-panel .panel-head{padding-inline:2px}.banner-image{padding:0;border:0;background:transparent;cursor:pointer}.banner-image img{width:160px;height:52px;display:block;object-fit:cover;border-radius:7px}.profile-head{display:flex;align-items:center;gap:15px;margin-bottom:20px}.profile-head h2{margin:0;font-size:20px}.profile-head p{margin:6px 0 0;color:#7d8981;font-size:12px}.profile-head .large{width:58px;height:58px}.contact-card{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:18px;border:1px solid #dce8e1;border-radius:12px;background:#f6fbf8}.contact-card>div:not(.contact-actions){display:flex;flex-direction:column;gap:6px}.contact-actions{grid-column:1/-1;display:flex;gap:10px}.description{margin-top:18px}.drawer-list{overflow:hidden;border:1px solid #e1e8e4;border-radius:11px}.drawer-list button{width:100%;display:flex;align-items:center;justify-content:space-between;padding:13px 15px;border:0;border-bottom:1px solid #edf1ee;background:#fff;text-align:left;cursor:pointer}.drawer-list button:last-child{border-bottom:0}.upload{width:100%;display:flex;flex-direction:column;gap:8px}.upload button{width:min(430px,100%);aspect-ratio:16/5;overflow:hidden;display:grid;place-items:center;color:#177545;border:1px dashed #7eaf91;border-radius:10px;background:#f4fbf6;cursor:pointer}.upload img{width:100%;height:100%;object-fit:cover}.dialog-search{margin-bottom:14px}
@media(max-width:1180px){.stats{grid-template-columns:repeat(2,1fr)}.overview-grid{grid-template-columns:1fr}.organizer-cards{grid-template-columns:repeat(2,1fr)}}@media(max-width:760px){.sidebar{width:74px;padding-inline:10px}.brand{justify-content:center;padding-inline:0}.brand div,.sidebar nav span,.sidebar nav em,.owner,.sidebar-bottom .el-button span{display:none}.sidebar nav button{grid-template-columns:1fr;justify-items:center;padding:0}.platform-console>main{margin-left:74px}.topbar{align-items:flex-start;flex-direction:column;padding:20px}.workspace{padding:18px 14px 30px}.stats,.organizer-cards{grid-template-columns:1fr}.activity-list>button{grid-template-columns:34px 1fr auto}.activity-list>button>small:last-child{display:none}.toolbar{align-items:stretch!important;flex-direction:column}.toolbar .el-input,.toolbar .el-select{width:100%}.toolbar>span{margin-left:0}.support-hero{align-items:flex-start;flex-direction:column}.contact-card{grid-template-columns:1fr}}
.account-tip{display:flex;gap:12px;padding:14px 20px;color:#8b6327;border-bottom:1px solid #eadfcf;background:#fffaf2;font-size:12px}.account-tip strong{flex:0 0 auto}.account-tip span{color:#857765}
.notice-target{display:flex;gap:12px;margin-bottom:16px;color:#758179;font-size:13px}.notice-target strong{color:#26352c}.notice-destination{margin:0;color:#78847c;font-size:12px}
.embedded-system{overflow:hidden;border-radius:15px}.embedded-system :deep(.system-admin){padding:0;background:transparent}.embedded-system :deep(.page-card){max-width:none;margin:0}
.hidden-collection{border-top:1px solid #e9eeeb;background:#fafcfb}
.hidden-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border:0;background:transparent;color:#415349;font-size:13px;font-weight:600;text-align:left;cursor:pointer}
.hidden-toggle span:last-child{color:#176d43}
.hidden-list{border-top:1px solid #e9eeeb}
.hidden-row{display:flex;align-items:center;gap:10px;padding:10px 20px;border-bottom:1px solid #edf1ee}
.hidden-row:last-child{border-bottom:0}
.hidden-row>div{min-width:0;flex:1;display:flex;flex-direction:column;gap:4px}
.hidden-row strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.hidden-row small{color:#829087;font-size:11px}
</style>
