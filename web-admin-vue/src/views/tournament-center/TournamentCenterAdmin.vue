<template>
  <div class="tournament-center-admin">
    <!-- 页面标题 -->
    <div class="page-header">
      <div class="page-header-left">
        <img src="/logo-saixiaofeng.png" alt="赛小蜂足球" class="header-logo" />
        <div class="header-text">
          <h2>赛事中心后台</h2>
          <p class="subtitle">赛事数据库 · 球队管理 · 数据运营</p>
        </div>
      </div>
      <div class="page-header-right">
        <span class="header-user">{{ tcDisplayName || tcPhone }}</span>
        <el-button type="default" size="small" @click="handleTcLogout">
          <el-icon><SwitchButton /></el-icon>退出登录
        </el-button>
      </div>
    </div>

    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="6">
        <div class="stat-card">
          <div class="stat-icon blue">
            <el-icon><Trophy /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalTournaments }}</div>
            <div class="stat-label">总赛事数</div>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card">
          <div class="stat-icon green">
            <el-icon><Star /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.featuredTournaments }}</div>
            <div class="stat-label">推荐赛事</div>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card">
          <div class="stat-icon orange">
            <el-icon><User /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalOrganizers }}</div>
            <div class="stat-label">主办方数</div>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card">
          <div class="stat-icon purple">
            <el-icon><Picture /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.bannerCount }}</div>
            <div class="stat-label">轮播图数</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 标签页 -->
    <el-tabs v-model="activeTab" class="admin-tabs">
      <!-- 轮播图管理 -->
      <el-tab-pane label="轮播图管理" name="banners">
        <div class="tab-content">
          <div class="section-header">
            <h3>首页轮播图</h3>
            <el-button type="primary" @click="showBannerDialog()">
              <el-icon><Plus /></el-icon>添加轮播图
            </el-button>
          </div>

          <el-table :data="banners" v-loading="loading.banners" border>
            <el-table-column type="index" width="60" label="序号" />
            <el-table-column label="图片" width="200">
              <template #default="{ row }">
                <img :src="row.imageUrl" class="banner-preview" @click="previewImage(row.imageUrl)" />
              </template>
            </el-table-column>
            <el-table-column prop="title" label="标题" min-width="150" />
            <el-table-column prop="link" label="链接" min-width="200" show-overflow-tooltip />
            <el-table-column label="排序" width="100">
              <template #default="{ row }">
                <el-input-number v-model="row.sort" :min="0" :max="99" size="small" @change="updateBannerSort(row)" />
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-switch v-model="row.isActive" @change="toggleBannerStatus(row)" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link @click="showBannerDialog(row)">编辑</el-button>
                <el-button type="danger" link @click="deleteBanner(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- 推荐赛事管理 -->
      <el-tab-pane label="推荐赛事" name="featured">
        <div class="tab-content">
          <div class="section-header">
            <h3>推荐赛事列表</h3>
            <el-button type="primary" @click="showFeaturedDialog()">
              <el-icon><Plus /></el-icon>添加推荐
            </el-button>
          </div>

          <el-table :data="featuredTournaments" v-loading="loading.featured" border>
            <el-table-column type="index" width="60" label="序号" />
            <el-table-column label="赛事封面" width="120">
              <template #default="{ row }">
                <img :src="row.coverImage || '/default-tournament.png'" class="tournament-cover" />
              </template>
            </el-table-column>
            <el-table-column prop="name" label="赛事名称" min-width="180" />
            <el-table-column prop="organizerName" label="主办方" width="120" />
            <el-table-column label="赛事类型" width="100">
              <template #default="{ row }">
                <el-tag size="small">{{ formatType(row.type) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="年龄段" width="100">
              <template #default="{ row }">
                <el-tag size="small" type="success">{{ row.ageGroup }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="排序" width="100">
              <template #default="{ row }">
                <el-input-number v-model="row.sort" :min="0" :max="99" size="small" @change="updateFeaturedSort(row)" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button type="danger" link @click="removeFeatured(row)">取消推荐</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- 主办方管理 -->
      <el-tab-pane label="主办方管理" name="organizers">
        <div class="tab-content">
          <div class="section-header">
            <h3>主办方列表</h3>
            <el-button type="primary" @click="showOrganizerDialog()">
              <el-icon><Plus /></el-icon>添加主办方
            </el-button>
          </div>

          <el-table :data="organizers" v-loading="loading.organizers" border>
            <el-table-column type="index" width="60" label="序号" />
            <el-table-column label="LOGO" width="80">
              <template #default="{ row }">
                <img :src="row.logo || '/default-logo.png'" class="organizer-logo" />
              </template>
            </el-table-column>
            <el-table-column prop="name" label="主办方名称" min-width="150" />
            <el-table-column prop="contact" label="联系人" width="100" />
            <el-table-column prop="phone" label="联系电话" width="130" />
            <el-table-column prop="email" label="邮箱" min-width="150" show-overflow-tooltip />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.isActive ? 'success' : 'info'">
                  {{ row.isActive ? '正常' : '停用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link @click="showOrganizerDialog(row)">编辑</el-button>
                <el-button type="danger" link @click="toggleOrganizerStatus(row)">
                  {{ row.isActive ? '停用' : '启用' }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- 赛事审核 -->
      <el-tab-pane label="赛事审核" name="audit">
        <div class="tab-content">
          <div class="section-header">
            <h3>待审核赛事</h3>
            <el-radio-group v-model="auditFilter" size="small">
              <el-radio-button label="pending">待审核</el-radio-button>
              <el-radio-button label="approved">已通过</el-radio-button>
              <el-radio-button label="rejected">已拒绝</el-radio-button>
            </el-radio-group>
          </div>

          <el-table :data="auditList" v-loading="loading.audit" border>
            <el-table-column type="index" width="60" label="序号" />
            <el-table-column label="赛事封面" width="120">
              <template #default="{ row }">
                <img :src="row.coverImage || '/default-tournament.png'" class="tournament-cover" />
              </template>
            </el-table-column>
            <el-table-column prop="name" label="赛事名称" min-width="180" />
            <el-table-column prop="organizerName" label="主办方" width="120" />
            <el-table-column label="提交时间" width="150">
              <template #default="{ row }">
                {{ formatDate(row.submitTime) }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getAuditStatusType(row.status)">
                  {{ getAuditStatusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link @click="viewTournamentDetail(row)">查看</el-button>
                <template v-if="row.status === 'pending'">
                  <el-button type="success" link @click="auditTournament(row, 'approved')">通过</el-button>
                  <el-button type="danger" link @click="auditTournament(row, 'rejected')">拒绝</el-button>
                </template>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    
      <!-- 赛事分类管理 -->
      <el-tab-pane label="赛事分类" name="categories">
        <div class="tab-content">
          <div class="section-header">
            <h3>赛事分类管理</h3>
            <el-button type="primary" @click="showCategoryDialog()">
              <el-icon><Plus /></el-icon>添加分类
            </el-button>
          </div>
          <el-table :data="categories" border>
            <el-table-column type="index" width="60" label="序号" />
            <el-table-column prop="key" label="标识" width="120" />
            <el-table-column prop="label" label="分类名称" min-width="150" />
            <el-table-column prop="color" label="配色" width="100">
              <template #default="{ row }">
                <div class="color-dot" :style="{ background: row.color }"></div>
                <span>{{ row.color }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="sort" label="排序" width="80" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.isActive ? 'success' : 'info'">{{ row.isActive ? '启用' : '停用' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link @click="showCategoryDialog(row)">编辑</el-button>
                <el-button type="danger" link @click="toggleCategoryStatus(row)">{{ row.isActive ? '停用' : '启用' }}</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- 数据认领审核 -->
      <el-tab-pane label="认领审核" name="claims">
        <div class="tab-content">
          <div class="section-header">
            <h3>数据认领审核</h3>
            <el-radio-group v-model="claimFilter" size="small">
              <el-radio-button label="pending">待审核</el-radio-button>
              <el-radio-button label="approved">已通过</el-radio-button>
              <el-radio-button label="rejected">已拒绝</el-radio-button>
            </el-radio-group>
          </div>
          <el-table :data="claimList" v-loading="loading.claims" border>
            <el-table-column type="index" width="60" label="序号" />
            <el-table-column prop="dataType" label="数据类型" width="100">
              <template #default="{ row }">
                <el-tag>{{ row.dataType === 'team' ? '球队' : '球员' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="dataName" label="数据名称" min-width="150" />
            <el-table-column prop="claimPhone" label="认领手机号" width="130" />
            <el-table-column prop="claimUser" label="认领用户" width="120" />
            <el-table-column prop="submitTime" label="提交时间" width="160" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getClaimStatusType(row.status)">{{ getClaimStatusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link @click="viewClaimDetail(row)">查看</el-button>
                <template v-if="row.status === 'pending'">
                  <el-button type="success" link @click="auditClaim(row, 'approved')">通过</el-button>
                  <el-button type="danger" link @click="auditClaim(row, 'rejected')">拒绝</el-button>
                </template>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- 竞猜配置 -->
      <el-tab-pane label="竞猜配置" name="guess">
        <div class="tab-content">
          <div class="section-header">
            <h3>竞猜规则配置</h3>
          </div>
          <el-form label-width="140px" class="config-form">
            <el-form-item label="竞猜开关">
              <el-switch v-model="guessConfig.enabled" active-text="开启" inactive-text="关闭" />
            </el-form-item>
            <el-form-item label="竞猜币名称">
              <el-input v-model="guessConfig.coinName" placeholder="例：竞猜币" style="width: 200px" />
            </el-form-item>
            <el-form-item label="每日免费获取">
              <el-input-number v-model="guessConfig.dailyFree" :min="0" :max="100" />
              <span class="form-tip">个/天</span>
            </el-form-item>
            <el-form-item label="签到获取">
              <el-input-number v-model="guessConfig.signInReward" :min="0" :max="50" />
              <span class="form-tip">个/次</span>
            </el-form-item>
            <el-form-item label="分享获取">
              <el-input-number v-model="guessConfig.shareReward" :min="0" :max="50" />
              <span class="form-tip">个/次</span>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveGuessConfig" :loading="saving.guess">保存配置</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <!-- 直播调度 -->
      <el-tab-pane label="直播调度" name="live">
        <div class="tab-content">
          <div class="section-header">
            <h3>直播排期管理</h3>
            <el-button type="primary" @click="showLiveDialog()">
              <el-icon><Plus /></el-icon>添加直播
            </el-button>
          </div>
          <el-table :data="liveSchedule" v-loading="loading.live" border>
            <el-table-column type="index" width="60" label="序号" />
            <el-table-column prop="tournamentName" label="赛事" min-width="150" />
            <el-table-column prop="matchInfo" label="比赛" min-width="180" />
            <el-table-column prop="liveTime" label="直播时间" width="160" />
            <el-table-column prop="anchor" label="主播" width="100" />
            <el-table-column prop="platform" label="平台" width="100" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getLiveStatusType(row.status)">{{ getLiveStatusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link @click="showLiveDialog(row)">编辑</el-button>
                <el-button type="danger" link @click="deleteLive(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- 赛事列表 -->
      <el-tab-pane label="赛事列表" name="tournaments">
        <div class="tab-content">
          <div class="section-header">
            <h3>赛事列表</h3>
            <div class="header-actions">
              <el-select v-model="tournamentCategoryFilter" placeholder="按类型筛选" clearable style="width: 160px; margin-right: 12px;">
                <el-option label="青少年赛事" value="youth" />
              </el-select>
              <el-input
                v-model="tournamentSearchKeyword"
                placeholder="搜索赛事名称"
                prefix-icon="Search"
                clearable
                style="width: 250px;"
              />
            </div>
          </div>

          <el-table :data="filteredTournaments" v-loading="loading.tournaments" border>
            <el-table-column type="index" width="60" label="序号" />
            <el-table-column prop="name" label="赛事名称" min-width="180" show-overflow-tooltip />
            <el-table-column label="赛事类型" width="110">
              <template #default="{ row }">
                <el-tag size="small">{{ formatCategory(row.category) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="赛制" width="90">
              <template #default="{ row }">
                <el-tag size="small" type="warning">{{ formatFormatType(row.formatType) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="getTournamentStatusType(row.status)" size="small">
                  {{ getTournamentStatusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="开始日期" width="110">
              <template #default="{ row }">
                {{ formatDate(row.startDate) }}
              </template>
            </el-table-column>
            <el-table-column label="结束日期" width="110">
              <template #default="{ row }">
                {{ formatDate(row.endDate) }}
              </template>
            </el-table-column>
            <el-table-column prop="organizerPhone" label="创建人" width="130" />
            <el-table-column label="参赛球队数" width="110" align="center">
              <template #default="{ row }">
                <span>{{ row.registeredTeams || 0 }} / {{ row.maxTeams || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link @click="viewTournament(row)">查看</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div v-if="!loading.tournaments && tournaments.length === 0" class="empty-state" style="margin-top: 24px;">
            <el-empty description="暂无赛事数据" />
          </div>
        </div>
      </el-tab-pane>

      <!-- 球队管理 -->
      <el-tab-pane label="球队管理" name="teams">
        <TeamManagement />
      </el-tab-pane>

      <!-- 球员管理 -->
      <el-tab-pane label="球员管理" name="players">
        <PlayerManagement />
      </el-tab-pane>
      <!-- 账号管理（仅超级管理员可见） -->
      <el-tab-pane v-if="tcRole === 'super_admin'" label="账号管理" name="accounts">
        <AccountManagement />
      </el-tab-pane>

</el-tabs>

    <!-- 轮播图弹窗 -->
    <el-dialog v-model="dialogVisible.banner" :title="bannerForm.id ? '编辑轮播图' : '添加轮播图'" width="600px">
      <el-form :model="bannerForm" label-width="80px">
        <el-form-item label="标题">
          <el-input v-model="bannerForm.title" placeholder="请输入轮播图标题" />
        </el-form-item>
        <el-form-item label="图片">
          <div class="banner-upload-wrapper">
            <div v-if="bannerForm.imageUrl" class="banner-preview-box" @click="openBannerCropper">
              <img :src="bannerForm.imageUrl" class="uploaded-image" />
              <div class="preview-overlay">
                <el-icon><Edit /></el-icon>
                <span>点击更换</span>
              </div>
            </div>
            <div v-else class="banner-uploader" @click="openBannerCropper">
              <el-icon><Plus /></el-icon>
              <span>点击上传图片</span>
            </div>
            <div class="upload-tip">建议尺寸：1920x600 像素，支持 jpg、png 格式</div>
          </div>
        </el-form-item>
        <el-form-item label="链接">
          <el-input v-model="bannerForm.link" placeholder="请输入跳转链接（可选）" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="bannerForm.sort" :min="0" :max="99" />
          <span class="form-tip">数字越小排序越靠前</span>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="bannerForm.isActive" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible.banner = false">取消</el-button>
        <el-button type="primary" @click="saveBanner" :loading="saving.banner">保存</el-button>
      </template>
    </el-dialog>

    <!-- 添加推荐弹窗 -->
    <el-dialog v-model="dialogVisible.featured" title="添加推荐赛事" width="800px">
      <el-input v-model="searchKeyword" placeholder="搜索赛事名称" class="search-input" clearable>
        <template #append>
          <el-button @click="searchTournaments">
            <el-icon><Search /></el-icon>
          </el-button>
        </template>
      </el-input>

      <el-table :data="searchResults" v-loading="loading.search" border height="400">
        <el-table-column label="赛事封面" width="100">
          <template #default="{ row }">
            <img :src="row.coverImage || '/default-tournament.png'" class="tournament-cover-small" />
          </template>
        </el-table-column>
        <el-table-column prop="name" label="赛事名称" min-width="150" />
        <el-table-column prop="organizerName" label="主办方" width="120" />
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="addToFeatured(row)">添加</el-button>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <el-button @click="dialogVisible.featured = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 主办方弹窗 -->
    <el-dialog v-model="dialogVisible.organizer" :title="organizerForm.id ? '编辑主办方' : '添加主办方'" width="600px">
      <el-form :model="organizerForm" label-width="100px">
        <el-form-item label="主办方名称" required>
          <el-input v-model="organizerForm.name" placeholder="请输入主办方名称" />
        </el-form-item>
        <el-form-item label="LOGO">
          <el-upload
            class="logo-uploader"
            action="#"
            :auto-upload="false"
            :on-change="handleLogoChange"
            :show-file-list="false"
          >
            <img v-if="organizerForm.logo" :src="organizerForm.logo" class="uploaded-logo" />
            <div v-else class="upload-placeholder">
              <el-icon><Plus /></el-icon>
              <span>上传LOGO</span>
            </div>
          </el-upload>
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="organizerForm.contact" placeholder="请输入联系人姓名" />
        </el-form-item>
        <el-form-item label="联系电话" required>
          <el-input v-model="organizerForm.phone" placeholder="请输入联系电话" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="organizerForm.email" placeholder="请输入邮箱地址" />
        </el-form-item>
        <el-form-item label="简介">
          <el-input v-model="organizerForm.description" type="textarea" :rows="3" placeholder="请输入主办方简介" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="organizerForm.isActive" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible.organizer = false">取消</el-button>
        <el-button type="primary" @click="saveOrganizer" :loading="saving.organizer">保存</el-button>
      </template>
    </el-dialog>

    <!-- 图片裁剪组件 -->
    <ImageCropper
      ref="bannerCropperRef"
      title="裁剪轮播图"
      :aspect-ratio="1920/600"
      @confirm="handleBannerCrop"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Trophy, Star, User, Picture, Plus, Search, Edit, SwitchButton
} from '@element-plus/icons-vue'
import { formatDate } from '@/utils/format'
import { uploadBase64Image, getTempFileURL } from '@/utils/upload'
import { uploadBase64ToCOS } from '@/utils/cos'
import { callFunction } from '@/utils/cloud'
import ImageCropper from '@/components/common/ImageCropper.vue'
import TeamManagement from './components/TeamManagement.vue'
import PlayerManagement from './components/PlayerManagement.vue'
import AccountManagement from './components/AccountManagement.vue'

// 存储类型：'cloud' 为微信云存储，'cos' 为 COS 对象存储
const storageType = ref('cos') // 默认使用 COS

// 赛事中心登录态
const tcRole = ref(localStorage.getItem('tc_role') || '')
const tcPhone = ref(localStorage.getItem('tc_phone') || '')
const tcDisplayName = ref(localStorage.getItem('tc_displayName') || '')

// 退出登录（赛事中心独立登录系统）
function handleTcLogout() {
  localStorage.removeItem('tc_isLoggedIn')
  localStorage.removeItem('tc_phone')
  localStorage.removeItem('tc_token')
  localStorage.removeItem('tc_role')
  localStorage.removeItem('tc_displayName')
  // 使用 location.href 强制跳转，确保脱离 LayoutView 布局
  window.location.href = '/#/tournament-center-login'
}

// 标签页
const activeTab = ref('banners')

// 加载状态
const loading = reactive({
  banners: false,
  featured: false,
  organizers: false,
  audit: false,
  search: false,
  claims: false,
  live: false,
  tournaments: false
})

// 保存状态
const saving = reactive({
  banner: false,
  organizer: false,
  guess: false
})

// 统计数据
const stats = reactive({
  totalTournaments: 0,
  featuredTournaments: 0,
  totalOrganizers: 0,
  bannerCount: 0
})

// 数据列表
const banners = ref([])
const featuredTournaments = ref([])
const organizers = ref([])
const auditList = ref([])
const auditFilter = ref('pending')
const searchKeyword = ref('')
const searchResults = ref([])
// 赛事列表数据
const tournaments = ref([])
const tournamentCategoryFilter = ref('')
const tournamentSearchKeyword = ref('')

// 裁剪组件引用
const bannerCropperRef = ref(null)
const bannerFile = ref(null)

// 弹窗显示状态
const dialogVisible = reactive({
  banner: false,
  featured: false,
  organizer: false
})

// 表单数据
const bannerForm = reactive({
  id: null,
  title: '',
  imageUrl: '',
  fileID: '',
  link: '',
  sort: 0,
  isActive: true
})

const organizerForm = reactive({
  id: null,
  name: '',
  logo: '',
  contact: '',
  phone: '',
  email: '',
  description: '',
  isActive: true
})

// 赛事类型映射
const typeMap = {
  'league': '联赛制',
  'cup': '杯赛制',
  'tournament': '赛会制',
  'hybrid': '复合制'
}

// 赛事列表过滤
const _filteredTournaments = computed(() => {
  let result = tournaments.value
  if (tournamentCategoryFilter.value) {
    result = result.filter(t => t.category === tournamentCategoryFilter.value)
  }
  if (tournamentSearchKeyword.value) {
    const keyword = tournamentSearchKeyword.value.toLowerCase()
    result = result.filter(t => t.name?.toLowerCase().includes(keyword))
  }
  return result
})
// 使用简化的变量名
const filteredTournaments = _filteredTournaments

// 获取赛事列表
async function fetchTournaments() {
  loading.tournaments = true
  try {
    const result = await callFunction('getTournaments', {})
    if (result.success) {
      tournaments.value = result.data || []
    } else {
      // 优雅降级：不弹错误提示
      console.warn('获取赛事列表返回失败:', result.message)
      tournaments.value = []
    }
  } catch (err) {
    // 优雅降级：不弹错误提示
    console.warn('获取赛事列表失败:', err.message)
    tournaments.value = []
  } finally {
    loading.tournaments = false
  }
}

// 格式化赛事类型
const categoryLabelMap = {
  youth: '青少年赛事'
}
function formatCategory(category) {
  return categoryLabelMap[category] || category || '未知'
}

// 格式化赛制
const formatTypeLabelMap = {
  tournament: '赛会制',
  cup: '杯赛制',
  league: '联赛制',
  combined: '复合制'
}
function formatFormatType(formatType) {
  return formatTypeLabelMap[formatType] || formatType || '未知'
}

// 赛事状态映射
function getTournamentStatusType(status) {
  const map = {
    draft: 'info',
    published: 'success',
    ongoing: 'warning',
    ended: 'info',
    cancelled: 'danger'
  }
  return map[status] || 'info'
}

function getTournamentStatusText(status) {
  const map = {
    draft: '草稿',
    published: '已发布',
    ongoing: '进行中',
    ended: '已结束',
    cancelled: '已取消'
  }
  return map[status] || status || '未知'
}

// 查看赛事详情
function viewTournament(tournament) {
  // 跳转到赛小蜂赛事详情页
  window.open(`/#/tournaments/${tournament._id}`, '_blank')
}

function formatType(type) {
  return typeMap[type] || type
}

// 获取统计数据
async function fetchStats() {
  // TODO(2024-01): 调用云函数获取统计数据
  stats.totalTournaments = 128
  stats.featuredTournaments = 8
  stats.totalOrganizers = 45
  stats.bannerCount = banners.value.length
}

// 获取轮播图列表
async function fetchBanners() {
  loading.banners = true
  try {
    const result = await callFunction('getBanners', {})
    if (result.success) {
      // 将 fileID 转换为可访问的 URL
      const bannersData = result.data || []
      const fileIDs = bannersData
        .filter(b => b.imageUrl && b.imageUrl.startsWith('cloud://'))
        .map(b => b.imageUrl)
      
      // 批量获取临时 URL
      let urlMap = {}
      if (fileIDs.length > 0) {
        const urlResult = await getTempFileURL(fileIDs)
        if (urlResult.success && urlResult.urls) {
          urlResult.urls.forEach(item => {
            urlMap[item.fileID] = item.tempFileURL
          })
        }
      }
      
      // 更新图片 URL
      const bannersWithUrl = bannersData.map(banner => {
        if (banner.imageUrl && banner.imageUrl.startsWith('cloud://')) {
          banner.imageUrl = urlMap[banner.imageUrl] || banner.imageUrl
        }
        return banner
      })
      
      banners.value = bannersWithUrl
    } else {
      ElMessage.error(result.message || '获取轮播图列表失败')
    }
  } catch (err) {
    console.error('获取轮播图列表失败:', err)
    ElMessage.error('获取轮播图列表失败')
  } finally {
    loading.banners = false
  }
}

// 获取推荐赛事列表
async function fetchFeaturedTournaments() {
  loading.featured = true
  try {
    // TODO(2024-01): 调用云函数获取推荐赛事
    featuredTournaments.value = [
      {
        id: 1,
        name: '2026春季青少年足球联赛',
        coverImage: '/images/tournament1.jpg',
        organizerName: '赛小蜂足球',
        type: 'league',
        ageGroup: 'U12',
        sort: 1
      }
    ]
  } finally {
    loading.featured = false
  }
}

// 获取主办方列表
async function fetchOrganizers() {
  loading.organizers = true
  try {
    // TODO(2024-01): 调用云函数获取主办方列表
    organizers.value = [
      {
        id: 1,
        name: '赛小蜂足球',
        logo: '/logo.png',
        contact: '张三',
        phone: '13800138000',
        email: 'contact@maibu.com',
        isActive: true
      }
    ]
  } finally {
    loading.organizers = false
  }
}

// 获取审核列表
async function fetchAuditList() {
  loading.audit = true
  try {
    // TODO(2024-01): 调用云函数获取审核列表
    auditList.value = []
  } finally {
    loading.audit = false
  }
}

// 显示轮播图弹窗
function showBannerDialog(banner = null) {
  if (banner) {
    Object.assign(bannerForm, banner)
  } else {
    Object.assign(bannerForm, {
      id: null,
      title: '',
      imageUrl: '',
      fileID: '',
      link: '',
      sort: 0,
      isActive: true
    })
  }
  dialogVisible.banner = true
}

// 打开轮播图裁剪器
function openBannerCropper() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = (e) => {
    const file = e.target.files[0]
    if (file) {
      bannerFile.value = file
      bannerCropperRef.value?.open(file)
    }
  }
  input.click()
}

// 处理裁剪后的图片
async function handleBannerCrop(blob, dataUrl) {
  try {
    // 先用 dataUrl 显示预览
    bannerForm.imageUrl = dataUrl
    
    let result
    
    // 根据存储类型选择上传方式
    if (storageType.value === 'cos') {
      // 上传到 COS
      result = await uploadBase64ToCOS(dataUrl, 'banners', `banner_${Date.now()}`)
      if (result.success) {
        bannerForm.imageUrl = result.data.url
        bannerForm.fileID = result.data.fileID // 保存 fileID
        ElMessage.success('图片已上传到 COS')
      } else {
        ElMessage.error('图片上传到 COS 失败')
      }
    } else {
      // 上传到微信云存储
      result = await uploadBase64Image(dataUrl, 'banners')
      if (result.success) {
        // 获取临时访问URL用于预览
        const urlResult = await getTempFileURL(result.fileID)
        if (urlResult.success) {
          bannerForm.imageUrl = urlResult.url
          bannerForm.fileID = result.fileID // 同时保存fileID用于数据库存储
          ElMessage.success('图片已上传到云存储')
        } else {
          ElMessage.error('获取图片链接失败')
        }
      } else {
        ElMessage.error('图片上传失败')
      }
    }
  } catch (err) {
    console.error('上传失败:', err)
    ElMessage.error('图片上传失败')
  }
}

// 保存轮播图
async function saveBanner() {
  if (!bannerForm.imageUrl) {
    ElMessage.error('请上传轮播图图片')
    return
  }
  saving.banner = true
  try {
    // 使用 fileID 保存到数据库
    const imageUrl = bannerForm.fileID || bannerForm.imageUrl
    
    const data = {
      title: bannerForm.title,
      imageUrl: imageUrl,
      link: bannerForm.link,
      sort: bannerForm.sort,
      isActive: bannerForm.isActive,
      storageType: storageType.value
    }
    if (bannerForm.id) {
      data.id = bannerForm.id
    }
    const result = await callFunction('saveBanner', data)
    if (result.success) {
      ElMessage.success(bannerForm.id ? '更新成功' : '添加成功')
      dialogVisible.banner = false
      fetchBanners()
    } else {
      ElMessage.error(result.message || '保存失败')
    }
  } catch (err) {
    console.error('保存轮播图失败:', err)
    ElMessage.error('保存失败')
  } finally {
    saving.banner = false
  }
}

// 更新轮播图排序
async function updateBannerSort(banner) {
  // TODO(2024-01): 调用云函数更新排序
  ElMessage.success('排序已更新')
}

// 切换轮播图状态
async function toggleBannerStatus(banner) {
  // TODO(2024-01): 调用云函数切换状态
  ElMessage.success(banner.isActive ? '已启用' : '已停用')
}

// 删除轮播图
async function deleteBanner(banner) {
  try {
    await ElMessageBox.confirm('确定要删除这张轮播图吗？', '提示', {
      type: 'warning'
    })
    // TODO(2024-01): 调用云函数删除轮播图
    ElMessage.success('删除成功')
    fetchBanners()
  } catch {
    // 取消删除
  }
}

// 显示推荐弹窗
function showFeaturedDialog() {
  searchKeyword.value = ''
  searchResults.value = []
  dialogVisible.featured = true
}

// 搜索赛事
async function searchTournaments() {
  if (!searchKeyword.value.trim()) {
    ElMessage.warning('请输入搜索关键词')
    return
  }
  loading.search = true
  try {
    // TODO(2024-01): 调用云函数搜索赛事
    searchResults.value = []
  } finally {
    loading.search = false
  }
}

// 添加到推荐
async function addToFeatured(tournament) {
  // TODO(2024-01): 调用云函数添加到推荐
  ElMessage.success('已添加到推荐')
  dialogVisible.featured = false
  fetchFeaturedTournaments()
}

// 更新推荐排序
async function updateFeaturedSort(tournament) {
  // TODO(2024-01): 调用云函数更新排序
  ElMessage.success('排序已更新')
}

// 取消推荐
async function removeFeatured(tournament) {
  try {
    await ElMessageBox.confirm('确定要取消推荐该赛事吗？', '提示', {
      type: 'warning'
    })
    // TODO(2024-01): 调用云函数取消推荐
    ElMessage.success('已取消推荐')
    fetchFeaturedTournaments()
  } catch {
    // 取消
  }
}

// 显示主办方弹窗
function showOrganizerDialog(organizer = null) {
  if (organizer) {
    Object.assign(organizerForm, organizer)
  } else {
    Object.assign(organizerForm, {
      id: null,
      name: '',
      logo: '',
      contact: '',
      phone: '',
      email: '',
      description: '',
      isActive: true
    })
  }
  dialogVisible.organizer = true
}

// 处理LOGO上传
function handleLogoChange(file) {
  const reader = new FileReader()
  reader.readAsDataURL(file.raw)
  reader.onload = () => {
    organizerForm.logo = reader.result
  }
}

// 保存主办方
async function saveOrganizer() {
  saving.organizer = true
  try {
    // TODO(2024-01): 调用云函数保存主办方
    ElMessage.success(organizerForm.id ? '更新成功' : '添加成功')
    dialogVisible.organizer = false
    fetchOrganizers()
  } finally {
    saving.organizer = false
  }
}

// 切换主办方状态
async function toggleOrganizerStatus(organizer) {
  // TODO(2024-01): 调用云函数切换状态
  organizer.isActive = !organizer.isActive
  ElMessage.success(organizer.isActive ? '已启用' : '已停用')
}

// 审核状态
function getAuditStatusType(status) {
  const map = {
    'pending': 'warning',
    'approved': 'success',
    'rejected': 'danger'
  }
  return map[status] || 'info'
}

function getAuditStatusText(status) {
  const map = {
    'pending': '待审核',
    'approved': '已通过',
    'rejected': '已拒绝'
  }
  return map[status] || status
}

// 审核赛事
async function auditTournament(tournament, status) {
  const action = status === 'approved' ? '通过' : '拒绝'
  try {
    await ElMessageBox.confirm(`确定要${action}该赛事吗？`, '提示', {
      type: status === 'approved' ? 'success' : 'warning'
    })
    // TODO(2024-01): 调用云函数审核赛事
    ElMessage.success(`已${action}`)
    fetchAuditList()
  } catch {
    // 取消
  }
}

// 查看赛事详情
function viewTournamentDetail(tournament) {
  // TODO: 打开赛事详情弹窗或跳转
}

// 预览图片
function previewImage(url) {
  // TODO: 图片预览
}


// 赛事分类数据
const categories = ref([
  { id: 1, key: 'youth', label: '青少年赛事', color: '#AB47BC', bgColor: '#F3E5F5', sort: 1, isActive: true }
])

// 认领审核数据
const claimList = ref([])
const claimFilter = ref('pending')

// 竞猜配置
const guessConfig = reactive({
  enabled: true,
  coinName: '竞猜币',
  dailyFree: 3,
  signInReward: 5,
  shareReward: 2
})

// 直播调度数据
const liveSchedule = ref([])

// 分类弹窗
const categoryForm = reactive({
  id: null,
  key: '',
  label: '',
  color: '#AB47BC',
  bgColor: '#F3E5F5',
  sort: 0,
  isActive: true
})

function fetchCategories() {
  // TODO: 调用云函数获取分类列表
}

function showCategoryDialog(cat = null) {
  if (cat) {
    Object.assign(categoryForm, cat)
  } else {
    Object.assign(categoryForm, { id: null, key: '', label: '', color: '#AB47BC', bgColor: '#F3E5F5', sort: 0, isActive: true })
  }
  // 弹窗逻辑待完善
  ElMessage.info('分类管理功能开发中')
}

function toggleCategoryStatus(cat) {
  cat.isActive = !cat.isActive
  ElMessage.success(cat.isActive ? '已启用' : '已停用')
}

async function fetchClaimList() {
  loading.claims = true
  try {
    // TODO: 调用云函数获取认领审核列表
    claimList.value = [
      { id: 1, dataType: 'team', dataName: '红魔联队', claimPhone: '138****8000', claimUser: '张三', submitTime: '2026-06-20 14:30', status: 'pending' },
      { id: 2, dataType: 'player', dataName: '李四（前锋）', claimPhone: '139****9000', claimUser: '李四', submitTime: '2026-06-21 09:15', status: 'pending' }
    ]
  } finally {
    loading.claims = false
  }
}

function getClaimStatusType(status) {
  return { pending: 'warning', approved: 'success', rejected: 'danger' }[status] || 'info'
}

function getClaimStatusText(status) {
  return { pending: '待审核', approved: '已通过', rejected: '已拒绝' }[status] || status
}

async function auditClaim(item, status) {
  const action = status === 'approved' ? '通过' : '拒绝'
  try {
    await ElMessageBox.confirm(`确定要${action}该认领申请吗？`, '提示', { type: status === 'approved' ? 'success' : 'warning' })
    // TODO: 调用云函数审核认领
    ElMessage.success(`已${action}`)
    fetchClaimList()
  } catch {}
}

function viewClaimDetail(item) {
  ElMessage.info('认领详情：' + item.dataName)
}

async function saveGuessConfig() {
  saving.guess = true
  try {
    // TODO: 调用云函数保存竞猜配置
    await new Promise(resolve => setTimeout(resolve, 500))
    ElMessage.success('竞猜配置已保存')
  } finally {
    saving.guess = false
  }
}

async function fetchLiveSchedule() {
  loading.live = true
  try {
    // TODO: 调用云函数获取直播排期
    liveSchedule.value = [
      { id: 1, tournamentName: '青少年足球锦标赛', matchInfo: '红魔联队 vs 蓝焰FC', liveTime: '2026-06-25 19:30', anchor: '小蜂解说', platform: '赛小蜂直播', status: 'scheduled' }
    ]
  } finally {
    loading.live = false
  }
}

function getLiveStatusType(status) {
  return { scheduled: 'primary', live: 'success', ended: 'info' }[status] || 'info'
}

function getLiveStatusText(status) {
  return { scheduled: '未开始', live: '直播中', ended: '已结束' }[status] || status
}

function showLiveDialog(live = null) {
  ElMessage.info('直播调度功能开发中')
}

function deleteLive(live) {
  ElMessage.info('删除直播：' + live.matchInfo)
}

// 补充 loading 和 saving 字段

onMounted(() => {
  document.title = '赛小蜂足球赛事中心-管理后台'
  fetchStats()
  fetchBanners()
  fetchFeaturedTournaments()
  fetchOrganizers()
  fetchAuditList()
  fetchCategories()
  fetchClaimList()
  fetchLiveSchedule()
  fetchTournaments()
})
</script>

<style scoped>
.tournament-center-admin {
  min-height: 100vh;
  background: #f5f7fa;
  padding: 20px;
}

.page-header {
  margin-bottom: 24px;
  padding: 24px 28px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, #1B5E20 0%, #2E7D32 50%, #43A047 100%);
  border-radius: 12px;
  color: #fff;
  box-shadow: 0 4px 20px rgba(27, 94, 32, 0.25);
}

.page-header-left {
  display: flex;
  align-items: center;
  gap: 18px;
}

.header-logo {
  height: 48px;
  width: auto;
  object-fit: contain;
}

.page-header-left h2 {
  margin: 0 0 4px;
  font-size: 22px;
  color: #fff;
  font-weight: 600;
  letter-spacing: 2px;
}

.page-header-left .subtitle {
  margin: 0;
  color: rgba(255, 255, 255, 0.75);
  font-size: 13px;
}

.page-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-user {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

/* 统计卡片 */
.stats-row {
  margin-bottom: 24px;
}

.stat-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: #fff;
}

.stat-icon.blue {
  background: linear-gradient(135deg, #409EFF, #36cfc9);
}

.stat-icon.green {
  background: linear-gradient(135deg, #67C23A, #95de64);
}

.stat-icon.orange {
  background: linear-gradient(135deg, #E6A23C, #ffd666);
}

.stat-icon.purple {
  background: linear-gradient(135deg, #9254de, #b37feb);
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: #303133;
  line-height: 1;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 4px;
}

/* 标签页 */
.admin-tabs {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
}

.tab-content {
  padding-top: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.section-header h3 {
  margin: 0;
  font-size: 18px;
  color: #303133;
}

/* 表格图片 */
.banner-preview {
  width: 180px;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
  cursor: pointer;
}

.tournament-cover {
  width: 100px;
  height: 70px;
  object-fit: cover;
  border-radius: 4px;
}

.tournament-cover-small {
  width: 80px;
  height: 56px;
  object-fit: cover;
  border-radius: 4px;
}

.organizer-logo {
  width: 50px;
  height: 50px;
  object-fit: contain;
  border-radius: 4px;
}

/* 上传组件 */
.banner-uploader,
.logo-uploader {
  border: 2px dashed #d9d9d9;
  border-radius: 8px;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.3s;
}

.banner-uploader:hover,
.logo-uploader:hover {
  border-color: #409EFF;
}

.banner-uploader {
  width: 400px;
  height: 125px;
}

.logo-uploader {
  width: 120px;
  height: 120px;
}

.uploaded-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.uploaded-logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 10px;
}

.banner-upload-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.banner-preview-box {
  width: 400px;
  height: 125px;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  cursor: pointer;
}

.banner-preview-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.banner-preview-box .preview-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fff;
  opacity: 0;
  transition: opacity 0.3s;
}

.banner-preview-box:hover .preview-overlay {
  opacity: 1;
}

.banner-preview-box .preview-overlay .el-icon {
  font-size: 24px;
  margin-bottom: 4px;
}

.upload-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #8c939d;
  font-size: 14px;
}

.upload-placeholder .el-icon {
  font-size: 28px;
  margin-bottom: 8px;
}

.upload-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
}

.form-tip {
  margin-left: 12px;
  color: #909399;
  font-size: 12px;
}

/* 搜索输入框 */
.search-input {
  margin-bottom: 16px;
}

/* 赛事分类颜色圆点 */
.color-dot {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
}

/* 竞猜配置表单 */
.config-form {
  max-width: 600px;
  margin-top: 20px;
}

.config-form .form-tip {
  margin-left: 12px;
  color: var(--portal-text-secondary, #909399);
  font-size: 12px;
}

/* 认领审核手机号打码 */
.claim-phone {
  font-family: monospace;
}

</style>
