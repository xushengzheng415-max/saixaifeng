<template>
  <div class="tournament-edit">
    <el-page-header @back="$router.push('/tournaments/' + id)" title="返回赛事详情">
      <template #content>
        <span style="font-size: 18px;">编辑赛事</span>
      </template>
    </el-page-header>

    <div class="page-card" style="margin-top: 20px; max-width: 900px;" v-loading="loading">
      <!-- 步骤条 -->
      <el-steps :active="activeStep" finish-status="success" style="margin-bottom: 30px;">
        <el-step title="基础信息" description="赛事基本信息" />
        <el-step title="积分规则" description="胜平负得分规则" />
        <el-step title="换人规则" description="换人次数与规则" />
        <el-step title="停赛规则" description="黄牌红牌停赛规则" />
      </el-steps>

      <el-form :model="form" label-width="100px" label-position="top" :rules="rules" ref="formRef">
        <!-- Step 1: 基础信息 -->
        <div v-show="activeStep === 0">
          <!-- 赛制选择 -->
          <el-form-item label="选择赛制" required>
            <div class="schedule-type-grid">
              <div
                v-for="item in typeOptions"
                :key="item.value"
                class="type-card"
                :class="{ selected: form.type === item.value }"
                @click="form.type = item.value; form.typeName = item.label"
              >
                <div class="type-icon">{{ item.icon }}</div>
                <div class="type-info">
                  <div class="type-name">{{ item.label }}</div>
                  <div class="type-desc">{{ item.desc }}</div>
                </div>
                <div v-if="form.type === item.value" class="type-check">✓</div>
              </div>
            </div>
          </el-form-item>

          <!-- ★ 比赛制式选择（11/8/7/5人制） -->
          <el-form-item label="比赛制式" required>
            <div class="schedule-type-grid format-grid">
              <div
                v-for="item in matchFormatOptions"
                :key="item.value"
                class="type-card"
                :class="{ selected: form.matchFormat === item.value }"
                @click="onMatchFormatChange(item.value)"
              >
                <div class="type-icon">{{ item.icon }}</div>
                <div class="type-info">
                  <div class="type-name">{{ item.label }}</div>
                  <div class="type-desc">默认大名单 {{ item.defaultPlayers }} 人，上限 {{ item.maxPlayers }} 人</div>
                </div>
                <div v-if="form.matchFormat === item.value" class="type-check">✓</div>
              </div>
            </div>
          </el-form-item>

          <el-form-item label="多组别赛事">
            <div class="division-mode-panel">
              <div class="division-mode-head">
                <div>
                  <div class="division-mode-title">一个赛事统一管理多个年龄组</div>
                  <div class="form-tip">各组别独立管理球队、抽签、赛程和排名。</div>
                </div>
                <el-switch v-model="form.multiDivision" active-text="启用" inactive-text="单组别" @change="onMultiDivisionChange" />
              </div>
              <template v-if="form.multiDivision">
                <div class="division-quick-add">
                  <span>快速添加：</span>
                  <el-button v-for="name in divisionPresets" :key="name" size="small" @click="addDivision(name)">{{ name }}</el-button>
                  <el-button size="small" type="primary" plain @click="addDivision('')">自定义组别</el-button>
                </div>
                <div v-for="(division, index) in form.divisions" :key="division.id" class="division-row">
                  <el-input v-model="division.name" placeholder="组别名称，如 U8" />
                  <el-select v-model="division.tournamentType" placeholder="赛制" @change="onDivisionTypeChange(index)">
                    <el-option v-for="option in typeOptions" :key="option.value" :label="option.label" :value="option.value" />
                  </el-select>
                  <el-select v-model="division.matchFormat" placeholder="比赛制式" @change="onDivisionFormatChange(index)">
                    <el-option v-for="option in matchFormatOptions" :key="option.value" :label="option.label" :value="option.value" />
                  </el-select>
                  <el-input-number v-model="division.maxTeams" :min="2" :max="64" controls-position="right" />
                  <el-input-number v-model="division.maxPlayersPerTeam" :min="5" :max="getMaxByFormat(division.matchFormat)" controls-position="right" />
                  <el-button type="primary" plain @click="openDivisionRules(index)">
                    {{ getDivisionRulesStatus(division) }}
                  </el-button>
                  <el-button type="danger" link :disabled="form.divisions.length <= 2" @click="removeDivision(index)">删除</el-button>
                </div>
                <div class="division-column-hint">依次为：组别名称 / 赛制 / 比赛制式 / 球队上限 / 名单上限 / 详细规则</div>
              </template>
            </div>
          </el-form-item>

          <el-divider />

          <el-row :gutter="16">
            <el-col :span="24">
              <el-form-item label="赛事名称" prop="name" required>
                <el-input v-model="form.name" placeholder="请输入赛事名称" maxlength="50" show-word-limit />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="比赛地点" prop="location">
                <el-input v-model="form.location" placeholder="请输入比赛地点" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="冠名商">
                <el-input v-model="form.titleSponsor" placeholder="冠名赞助商" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="赛事Logo" prop="logo" required>
                <div class="logo-upload-wrapper">
                  <div class="logo-input-row">
                    <el-input v-model="form.logo" placeholder="上传后将自动填充URL" style="flex: 1;" />
                    <AIImageGenerator
                      type="tournamentLogo"
                      :name="form.name"
                      @success="handleAISuccess"
                    />
                  </div>
                  <el-upload
                    class="logo-uploader"
                    :show-file-list="false"
                    :before-upload="beforeLogoUpload"
                    :http-request="handleLogoUpload"
                    accept="image/*"
                  >
                    <el-button type="primary" :loading="uploadingLogo" size="small" style="margin-top: 8px;">
                      <el-icon v-if="!uploadingLogo"><Upload /></el-icon>
                      {{ uploadingLogo ? '上传中...' : '上传Logo' }}
                    </el-button>
                  </el-upload>
                  <div class="logo-preview" v-if="form.logo">
                    <img :src="form.logo" alt="Logo预览" />
                    <span class="preview-tip">预览</span>
                  </div>
                </div>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="赛事色调">
                <div class="theme-selector">
                  <div class="theme-templates">
                    <div
                      v-for="theme in themeOptions"
                      :key="theme.id"
                      class="theme-item"
                      :class="{ selected: form.themeId === theme.id }"
                      :style="{ background: theme.gradient }"
                      :title="theme.name + ' - ' + theme.description"
                      @click="selectTheme(theme)"
                    >
                      <span class="theme-check" v-if="form.themeId === theme.id">✓</span>
                      <span class="theme-name">{{ theme.name }}</span>
                    </div>
                  </div>
                  <div class="theme-selected-preview" v-if="selectedTheme">
                    <div class="preview-gradient" :style="{ background: selectedTheme.gradient }"></div>
                    <div class="preview-info">
                      <span class="preview-name">{{ selectedTheme.name }}</span>
                      <span class="preview-desc">{{ selectedTheme.description }}</span>
                    </div>
                  </div>
                </div>
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="16">
            <el-col :span="8">
              <el-form-item label="报名截止日">
                <el-date-picker v-model="form.deadline" type="date" placeholder="选择日期" value-format="YYYY-MM-DD" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="开始日期" prop="startDate">
                <el-date-picker v-model="form.startDate" type="date" placeholder="选择日期" value-format="YYYY-MM-DD" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="结束日期" prop="endDate">
                <el-date-picker v-model="form.endDate" type="date" placeholder="选择日期" value-format="YYYY-MM-DD" style="width: 100%" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="最大球队数" prop="maxTeams">
                <el-input-number v-model="form.maxTeams" :min="2" :max="64" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="每队大名单上限" prop="maxPlayersPerTeam">
                <el-input-number v-model="form.maxPlayersPerTeam" :min="5" :max="matchFormatMaxPlayers" style="width: 100%" />
                <div class="form-tip">当前制式允许设置的最大值：{{ matchFormatMaxPlayers }} 人</div>
              </el-form-item>
            </el-col>
          </el-row>

          <!-- ★ 淘汰赛配置折叠区 -->
          <el-collapse v-model="knockoutCollapseActive" style="margin-top: 12px;">
            <el-collapse-item title="淘汰赛配置（可选）" name="knockout">
              <el-alert type="info" :closable="false" style="margin-bottom: 16px;">
                <template #default>
                  启用后，淘汰赛阶段可提交独立大名单，并支持换人名额申请。小组赛结束后由主办方手动开启名单提交窗口。
                </template>
              </el-alert>

              <el-form-item label="启用淘汰赛独立名单">
                <el-switch v-model="form.knockoutRosterEnabled" />
                <span style="margin-left: 8px; color: #909399;">
                  {{ form.knockoutRosterEnabled ? '已启用' : '未启用' }}
                </span>
              </el-form-item>

              <template v-if="form.knockoutRosterEnabled">
                <el-row :gutter="16">
                  <el-col :span="12">
                    <el-form-item label="淘汰赛大名单上限">
                      <el-input-number v-model="form.knockoutMaxPlayers" :min="0" :max="50" style="width: 100%" />
                      <div class="form-tip">不填或为 0 表示沿用第一阶段上限</div>
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="每队换人申请次数">
                      <el-input-number v-model="form.maxRosterChanges" :min="0" :max="10" style="width: 100%" />
                      <div class="form-tip">淘汰赛阶段每队最大换人申请次数（默认 3）</div>
                    </el-form-item>
                  </el-col>
                </el-row>

                <!-- ★ 淘汰赛名单提交窗口控制（T05） -->
                <el-form-item label="第二阶段名单提交窗口">
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <el-tag :type="form.knockoutRosterOpen ? 'success' : 'info'">
                      {{ form.knockoutRosterOpen ? '已开启' : '未开启' }}
                    </el-tag>
                    <el-button
                      :type="form.knockoutRosterOpen ? 'warning' : 'primary'"
                      size="small"
                      :loading="togglingKnockoutOpen"
                      @click="toggleKnockoutRosterOpen"
                    >
                      {{ form.knockoutRosterOpen ? '关闭提交窗口' : '开启第二阶段名单提交' }}
                    </el-button>
                  </div>
                  <div class="form-tip">开启后，球队教练可在小程序提交淘汰赛阶段大名单及发起换人申请</div>
                </el-form-item>
              </template>
            </el-collapse-item>
          </el-collapse>

          <!-- 竞赛规程上传 -->
          <el-divider content-position="left">
            <el-icon><Document /></el-icon> 竞赛规程
          </el-divider>

          <el-form-item label="上传竞赛规程">
            <div class="regulations-upload-wrapper">
              <el-upload
                ref="regulationsUploadRef"
                class="regulations-uploader"
                :show-file-list="false"
                :before-upload="beforeRegulationsUpload"
                :http-request="handleRegulationsUpload"
                accept=".pdf,.docx,.doc,.jpg,.jpeg,.png"
              >
                <el-button type="primary" :loading="uploadingRegulations" size="default">
                  <el-icon v-if="!uploadingRegulations"><Upload /></el-icon>
                  {{ uploadingRegulations ? '上传中...' : '上传规程文件' }}
                </el-button>
              </el-upload>
              <div class="regulations-hint">
                支持 PDF、Word、图片格式，AI 将自动识别赛制信息
              </div>

              <!-- 已上传文件展示 -->
              <div v-if="form.regulationsFileId" class="regulations-file">
                <el-icon class="file-icon"><Document /></el-icon>
                <span class="file-name">{{ form.regulationsFileName || '竞赛规程' }}</span>
                <div class="file-actions">
                  <el-button
                    v-if="!parsingRegulations"
                    type="primary"
                    size="small"
                    @click="parseRegulations"
                  >
                    <el-icon><MagicStick /></el-icon> 识别赛制
                  </el-button>
                  <el-button v-else type="primary" size="small" loading>
                    识别中...
                  </el-button>
                  <el-button type="danger" size="small" link @click="removeRegulations">
                    <el-icon><Delete /></el-icon> 删除
                  </el-button>
                </div>
              </div>
            </div>
          </el-form-item>

          <el-form-item label="赛事说明">
            <el-input v-model="form.description" type="textarea" :rows="4" placeholder="请输入赛事说明" maxlength="500" show-word-limit />
          </el-form-item>
        </div>

        <!-- Step 2: 积分规则配置 -->
        <div v-show="activeStep === 1">
          <el-alert title="积分规则说明" type="info" :closable="false" style="margin-bottom: 20px;">
            <template #default>
              配置赛事的积分计算规则，包括胜平负得分、进球加分、红黄牌扣分等。
            </template>
          </el-alert>

          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="胜场得分">
                <el-input-number
                  v-model="form.rules.pointsRule.winPoints"
                  :min="0"
                  :max="10"
                  style="width: 100%;"
                  controls-position="right"
                />
                <div class="form-tip">球队获胜时获得的积分（默认 3 分）</div>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="平局得分">
                <el-input-number
                  v-model="form.rules.pointsRule.drawPoints"
                  :min="0"
                  :max="10"
                  style="width: 100%;"
                  controls-position="right"
                />
                <div class="form-tip">球队平局时获得的积分（默认 1 分）</div>
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="负场得分">
                <el-input-number
                  v-model="form.rules.pointsRule.lossPoints"
                  :min="0"
                  :max="10"
                  style="width: 100%;"
                  controls-position="right"
                />
                <div class="form-tip">球队失败时获得的积分（默认 0 分）</div>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="弃权得分">
                <el-input-number
                  v-model="form.rules.pointsRule.forfeitPoints"
                  :min="0"
                  :max="10"
                  style="width: 100%;"
                  controls-position="right"
                />
                <div class="form-tip">球队弃权时获得的积分（默认 0 分）</div>
              </el-form-item>
            </el-col>
          </el-row>

          <el-divider content-position="left">进球加分</el-divider>

          <el-form-item label="启用进球加分">
            <el-switch v-model="form.rules.pointsRule.enableGoalBonus" />
            <span style="margin-left: 8px; color: #909399;">
              {{ form.rules.pointsRule.enableGoalBonus ? '已启用' : '已禁用' }}
            </span>
            <el-tooltip placement="top">
              <template #content>
                启用后，球队每进一个球将额外获得积分奖励
              </template>
              <el-icon style="margin-left: 4px; color: #909399;"><QuestionFilled /></el-icon>
            </el-tooltip>
          </el-form-item>

          <el-form-item
            label="每进球加分"
            v-if="form.rules.pointsRule.enableGoalBonus"
          >
            <el-input-number
              v-model="form.rules.pointsRule.goalBonusPoints"
              :min="0"
              :max="5"
              :step="0.5"
              style="width: 100%;"
              controls-position="right"
            />
            <div class="form-tip">每个进球额外获得的积分（可设置小数，如 0.5）</div>
          </el-form-item>

          <el-divider content-position="left">红黄牌扣分</el-divider>

          <el-form-item label="启用红黄牌扣分">
            <el-switch v-model="form.rules.pointsRule.enableCardDeduction" />
            <span style="margin-left: 8px; color: #909399;">
              {{ form.rules.pointsRule.enableCardDeduction ? '已启用' : '已禁用' }}
            </span>
            <el-tooltip placement="top">
              <template #content>
                启用后，球队获得红黄牌将扣除积分
              </template>
              <el-icon style="margin-left: 4px; color: #909399;"><QuestionFilled /></el-icon>
            </el-tooltip>
          </el-form-item>

          <template v-if="form.rules.pointsRule.enableCardDeduction">
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="黄牌扣分数">
                  <el-input-number
                    v-model="form.rules.pointsRule.yellowCardDeduction"
                    :min="0"
                    :max="5"
                    :step="0.5"
                    style="width: 100%;"
                    controls-position="right"
                  />
                  <div class="form-tip">每张黄牌扣除的积分</div>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="红牌扣分数">
                  <el-input-number
                    v-model="form.rules.pointsRule.redCardDeduction"
                    :min="0"
                    :max="10"
                    :step="0.5"
                    style="width: 100%;"
                    controls-position="right"
                  />
                  <div class="form-tip">每张红牌扣除的积分</div>
                </el-form-item>
              </el-col>
            </el-row>
          </template>
        </div>

        <!-- Step 3: 换人规则配置 -->
        <div v-show="activeStep === 2">
          <el-alert title="换人规则说明" type="info" :closable="false" style="margin-bottom: 20px;">
            <template #default>
              配置赛事的换人规则，包括最大换人次数、是否允许换回、中场休息是否可额外换人等。
            </template>
          </el-alert>

          <el-form-item label="最大换人次数">
            <el-input-number
              v-model="form.rules.substitutionRule.maxSubstitutions"
              :min="0"
              :max="20"
              style="width: 100%;"
              controls-position="right"
            />
            <div class="form-tip">每场比赛允许的最大换人次数（默认 5 次）</div>
          </el-form-item>

          <el-divider content-position="left">换人规则</el-divider>

          <el-form-item label="是否允许换回">
            <el-switch v-model="form.rules.substitutionRule.allowReturnSubstitution" />
            <span style="margin-left: 8px; color: #909399;">
              {{ form.rules.substitutionRule.allowReturnSubstitution ? '允许' : '不允许' }}
            </span>
            <el-tooltip placement="top">
              <template #content>
                允许换回：被换下场的球员可以再次被换上场<br/>
                不允许换回：被换下场的球员不能再上场
              </template>
              <el-icon style="margin-left: 4px; color: #909399;"><QuestionFilled /></el-icon>
            </el-tooltip>
            <div class="form-tip">是否允许被换下场的球员再次被换上场</div>
          </el-form-item>

          <el-form-item label="中场休息可额外换人">
            <el-switch v-model="form.rules.substitutionRule.extraSubstitutionAtHalftime" />
            <span style="margin-left: 8px; color: #909399;">
              {{ form.rules.substitutionRule.extraSubstitutionAtHalftime ? '允许' : '不允许' }}
            </span>
            <el-tooltip placement="top">
              <template #content>
                启用后，中场休息时可以额外进行换人，不计入常规换人次数
              </template>
              <el-icon style="margin-left: 4px; color: #909399;"><QuestionFilled /></el-icon>
            </el-tooltip>
            <div class="form-tip">中场休息时是否允许额外换人（不计入常规换人次数）</div>
          </el-form-item>

          <el-form-item
            label="中场额外换人次数"
            v-if="form.rules.substitutionRule.extraSubstitutionAtHalftime"
          >
            <el-input-number
              v-model="form.rules.substitutionRule.halftimeSubstitutions"
              :min="0"
              :max="10"
              style="width: 100%;"
              controls-position="right"
            />
            <div class="form-tip">中场休息时允许的最大换人次数</div>
          </el-form-item>
        </div>

        <!-- Step 4: 停赛规则配置 -->
        <div v-show="activeStep === 3">
          <el-alert title="停赛规则说明" type="info" :closable="false" style="margin-bottom: 20px;">
            <template #default>
              配置赛事的黄牌累计停赛、红牌直接停赛等规则。
            </template>
          </el-alert>

          <el-divider content-position="left">黄牌累计停赛</el-divider>

          <el-form-item label="累计黄牌停赛数">
            <el-input-number
              v-model="form.rules.suspensionRule.yellowCardsForSuspension"
              :min="0"
              :max="10"
              :step="1"
              style="width: 100%;"
              controls-position="right"
            />
            <div class="form-tip">球员累计多少张黄牌后停赛一场（设置为 0 表示不启用，默认 4 张）</div>
          </el-form-item>

          <el-form-item label="黄牌停赛场次">
            <el-input-number
              v-model="form.rules.suspensionRule.yellowCardSuspensionMatches"
              :min="1"
              :max="5"
              :step="1"
              style="width: 100%;"
              controls-position="right"
            />
            <div class="form-tip">因累计黄牌停赛的场次数量（默认 1 场）</div>
          </el-form-item>

          <el-divider content-position="left">红牌直接停赛</el-divider>

          <el-form-item label="直接红牌停赛场次">
            <el-input-number
              v-model="form.rules.suspensionRule.redCardSuspensionMatches"
              :min="1"
              :max="10"
              :step="1"
              style="width: 100%;"
              controls-position="right"
            />
            <div class="form-tip">球员直接获得红牌后停赛的场次数量（默认 1 场）</div>
          </el-form-item>

          <el-form-item label="两黄变红停赛场次">
            <el-input-number
              v-model="form.rules.suspensionRule.secondYellowSuspensionMatches"
              :min="0"
              :max="5"
              :step="1"
              style="width: 100%;"
              controls-position="right"
            />
            <div class="form-tip">球员两黄变红后停赛的场次数量（设置为 0 表示不额外停赛，默认 0 场）</div>
          </el-form-item>

          <el-divider content-position="left">跨赛事规则</el-divider>

          <el-form-item label="红牌是否带入下赛季">
            <el-switch v-model="form.rules.suspensionRule.carryRedCardToNextSeason" />
            <span style="margin-left: 8px; color: #909399;">
              {{ form.rules.suspensionRule.carryRedCardToNextSeason ? '带入' : '不带入' }}
            </span>
            <el-tooltip placement="top">
              <template #content>
                启用后，本赛季的红牌停赛将延续到下个赛季<br/>
                适用于跨赛季的联赛赛事
              </template>
              <el-icon style="margin-left: 4px; color: #909399;"><QuestionFilled /></el-icon>
            </el-tooltip>
            <div class="form-tip">红牌停赛是否延续到下一个赛季（适用于跨赛季赛事）</div>
          </el-form-item>

          <el-form-item label="黄牌是否带入下赛季">
            <el-switch v-model="form.rules.suspensionRule.carryYellowCardToNextSeason" />
            <span style="margin-left: 8px; color: #909399;">
              {{ form.rules.suspensionRule.carryYellowCardToNextSeason ? '带入' : '不带入' }}
            </span>
            <el-tooltip placement="top">
              <template #content>
                启用后，本赛季累计的黄牌将延续到下个赛季<br/>
                适用于跨赛季的联赛赛事
              </template>
              <el-icon style="margin-left: 4px; color: #909399;"><QuestionFilled /></el-icon>
            </el-tooltip>
            <div class="form-tip">黄牌累计是否延续到下一个赛季（适用于跨赛季赛事）</div>
          </el-form-item>
        </div>

        <!-- 按钮组 -->
        <el-form-item>
          <div style="display: flex; justify-content: space-between; width: 100%;">
            <el-button v-if="activeStep > 0" @click="prevStep">上一步</el-button>
            <div v-else></div>

            <div>
              <el-button v-if="activeStep < 3" type="primary" @click="nextStep">
                下一步
              </el-button>
              <el-button
                v-if="activeStep === 3"
                type="primary"
                :loading="submitting"
                @click="handleSubmit"
              >
                保存修改
              </el-button>
              <el-button @click="$router.push('/tournaments/' + id)">取消</el-button>
            </div>
          </div>
        </el-form-item>
      </el-form>
    </div>

    <el-drawer
      v-model="divisionRulesVisible"
      :title="divisionRulesTitle"
      size="720px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <div v-if="divisionRulesDraft" class="division-rules-editor">
        <el-alert
          title="赛制与晋级规则始终按当前组别独立保存；积分、换人和红黄牌可沿用赛事统一规则，也可为本组单独设置。"
          type="info"
          :closable="false"
          show-icon
        />

        <el-tabs v-model="divisionRulesTab" class="division-rules-tabs">
          <el-tab-pane label="赛制与晋级" name="competition">
            <el-form label-position="top">
              <template v-if="['tournament', 'combined'].includes(currentDivisionType)">
                <div class="division-rule-section-title">小组赛与出线</div>
                <div class="division-rule-grid">
                  <el-form-item label="小组赛循环方式">
                    <el-select v-model="divisionRulesDraft.competitionRule.groupRoundMode">
                      <el-option label="单循环" value="single" />
                      <el-option label="双循环" value="double" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="每组直接出线名次">
                    <el-select v-model="divisionRulesDraft.competitionRule.qualifyPerGroup">
                      <el-option v-for="rank in 8" :key="rank" :label="`前 ${rank} 名`" :value="rank" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="成绩最好的额外出线名额">
                    <el-input-number v-model="divisionRulesDraft.competitionRule.bestThirdQualifiers" :min="0" :max="8" controls-position="right" />
                    <div class="form-tip">用于成绩最好的第三名或其他非直接晋级球队，0 表示不设置。</div>
                  </el-form-item>
                  <el-form-item label="淘汰赛规模">
                    <el-select v-model="divisionRulesDraft.competitionRule.knockoutTeamCount">
                      <el-option v-for="count in [2, 4, 8, 16, 32]" :key="count" :label="`${count} 强`" :value="count" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="首轮淘汰赛对阵">
                    <el-select v-model="divisionRulesDraft.competitionRule.knockoutPairing">
                      <el-option label="小组交叉对阵" value="cross" />
                      <el-option label="按排名设种子" value="seeded" />
                      <el-option label="晋级球队重新抽签" value="draw" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="首轮同组回避">
                    <el-switch v-model="divisionRulesDraft.competitionRule.avoidSameGroup" active-text="回避" inactive-text="不回避" />
                  </el-form-item>
                </div>
              </template>

              <template v-if="['league', 'combined'].includes(currentDivisionType)">
                <div class="division-rule-section-title">联赛阶段</div>
                <div class="division-rule-grid">
                  <el-form-item label="联赛循环方式">
                    <el-select v-model="divisionRulesDraft.competitionRule.leagueRoundMode">
                      <el-option label="单循环" value="single" />
                      <el-option label="双循环（主客场）" value="double" />
                    </el-select>
                  </el-form-item>
                </div>
              </template>

              <template v-if="currentDivisionType === 'cup'">
                <div class="division-rule-section-title">杯赛阶段</div>
                <div class="division-rule-grid">
                  <el-form-item label="淘汰赛对阵方式">
                    <el-select v-model="divisionRulesDraft.competitionRule.cupTieMode">
                      <el-option label="单场淘汰" value="single" />
                      <el-option label="主客场两回合" value="twoLegs" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="每轮重新抽签">
                    <el-switch v-model="divisionRulesDraft.competitionRule.reseedEachRound" active-text="重新抽签" inactive-text="固定签位" />
                  </el-form-item>
                </div>
              </template>

              <template v-if="currentDivisionType !== 'league'">
                <div class="division-rule-section-title">淘汰赛决胜</div>
                <div class="division-rule-grid">
                  <el-form-item label="平局处理">
                    <el-select v-model="divisionRulesDraft.competitionRule.knockoutTieBreaker">
                      <el-option label="加时赛后点球" value="extraTimePenalties" />
                      <el-option label="直接点球" value="directPenalties" />
                    </el-select>
                  </el-form-item>
                  <el-form-item v-if="divisionRulesDraft.competitionRule.knockoutTieBreaker === 'extraTimePenalties'" label="加时赛总时长">
                    <el-input-number v-model="divisionRulesDraft.competitionRule.extraTimeMinutes" :min="2" :max="30" controls-position="right" />
                    <span class="division-rule-unit">分钟</span>
                  </el-form-item>
                  <el-form-item label="三四名决赛">
                    <el-switch v-model="divisionRulesDraft.competitionRule.thirdPlaceMatch" active-text="设置" inactive-text="不设置" />
                  </el-form-item>
                </div>
              </template>
            </el-form>
          </el-tab-pane>

          <el-tab-pane label="积分与排名" name="points">
            <el-switch
              v-model="divisionRulesDraft.inheritTournamentRules"
              active-text="沿用赛事统一规则"
              inactive-text="本组独立设置"
              class="division-rules-inherit-switch"
            />
            <el-alert v-if="divisionRulesDraft.inheritTournamentRules" title="当前组别沿用赛事编辑页中的积分与排名规则。" type="success" :closable="false" />
            <el-form v-else label-position="top">
              <div class="division-rule-grid division-rule-grid-four">
                <el-form-item label="胜场积分"><el-input-number v-model="divisionRulesDraft.pointsRule.winPoints" :min="0" :max="10" /></el-form-item>
                <el-form-item label="平局积分"><el-input-number v-model="divisionRulesDraft.pointsRule.drawPoints" :min="0" :max="10" /></el-form-item>
                <el-form-item label="负场积分"><el-input-number v-model="divisionRulesDraft.pointsRule.lossPoints" :min="0" :max="10" /></el-form-item>
                <el-form-item label="弃权积分"><el-input-number v-model="divisionRulesDraft.pointsRule.forfeitPoints" :min="-10" :max="10" /></el-form-item>
              </div>
              <el-form-item label="同分排名顺序">
                <el-select v-model="divisionRulesDraft.pointsRule.tiebreakerOrder" multiple style="width: 100%" placeholder="按选择顺序执行">
                  <el-option v-for="option in tiebreakerOptions" :key="option.key" :label="option.label" :value="option.key" />
                </el-select>
                <div class="form-tip">系统按已选项目显示的先后顺序依次比较。</div>
              </el-form-item>
            </el-form>
          </el-tab-pane>

          <el-tab-pane label="换人规则" name="substitution">
            <el-alert v-if="divisionRulesDraft.inheritTournamentRules" title="当前组别沿用赛事编辑页中的换人规则；可在“积分与排名”中切换为本组独立设置。" type="success" :closable="false" />
            <el-form v-else label-position="top">
              <div class="division-rule-grid">
                <el-form-item label="每队最多换人名额">
                  <el-input-number v-model="divisionRulesDraft.substitutionRule.maxSubstitutions" :min="0" :max="20" controls-position="right" />
                  <div class="form-tip">0 表示不限制换人人数。</div>
                </el-form-item>
                <el-form-item label="换人窗口次数">
                  <el-input-number v-model="divisionRulesDraft.substitutionRule.substitutionWindows" :min="0" :max="10" controls-position="right" />
                  <div class="form-tip">0 表示不限制换人窗口。</div>
                </el-form-item>
                <el-form-item label="换下后能否再次上场">
                  <el-switch v-model="divisionRulesDraft.substitutionRule.allowReturnSubstitution" active-text="允许" inactive-text="不允许" />
                </el-form-item>
                <el-form-item label="中场换人计入窗口">
                  <el-switch v-model="divisionRulesDraft.substitutionRule.halftimeCountsAsWindow" active-text="计入" inactive-text="不计入" />
                </el-form-item>
                <el-form-item label="进入加时赛增加换人名额">
                  <el-input-number v-model="divisionRulesDraft.substitutionRule.extraTimeSubstitution" :min="0" :max="5" controls-position="right" />
                </el-form-item>
              </div>
            </el-form>
          </el-tab-pane>

          <el-tab-pane label="红黄牌" name="discipline">
            <el-alert v-if="divisionRulesDraft.inheritTournamentRules" title="当前组别沿用赛事编辑页中的红黄牌和停赛规则；可在“积分与排名”中切换为本组独立设置。" type="success" :closable="false" />
            <el-form v-else label-position="top">
              <div class="division-rule-grid">
                <el-form-item label="累计黄牌停赛门槛">
                  <el-input-number v-model="divisionRulesDraft.suspensionRule.yellowCardsForSuspension" :min="1" :max="10" controls-position="right" />
                  <span class="division-rule-unit">张</span>
                </el-form-item>
                <el-form-item label="累计黄牌停赛场次"><el-input-number v-model="divisionRulesDraft.suspensionRule.yellowCardSuspensionMatches" :min="0" :max="10" controls-position="right" /></el-form-item>
                <el-form-item label="直接红牌停赛场次"><el-input-number v-model="divisionRulesDraft.suspensionRule.redCardSuspensionMatches" :min="0" :max="20" controls-position="right" /></el-form-item>
                <el-form-item label="两黄变红停赛场次"><el-input-number v-model="divisionRulesDraft.suspensionRule.secondYellowSuspensionMatches" :min="0" :max="10" controls-position="right" /></el-form-item>
                <el-form-item v-if="['tournament', 'combined'].includes(currentDivisionType)" label="小组赛牌数带入淘汰赛">
                  <el-switch v-model="divisionRulesDraft.suspensionRule.carryCardsToKnockout" active-text="带入" inactive-text="清零" />
                </el-form-item>
                <el-form-item v-if="['tournament', 'combined'].includes(currentDivisionType)" label="小组赛结束清除黄牌">
                  <el-switch v-model="divisionRulesDraft.suspensionRule.clearYellowCardsAfterGroup" active-text="清除" inactive-text="保留" />
                </el-form-item>
                <el-form-item label="直接红牌需纪律审核">
                  <el-switch v-model="divisionRulesDraft.suspensionRule.directRedNeedsReview" active-text="需要" inactive-text="按默认场次执行" />
                </el-form-item>
              </div>
            </el-form>
          </el-tab-pane>
        </el-tabs>
      </div>

      <template #footer>
        <el-button @click="divisionRulesVisible = false">取消</el-button>
        <el-button type="primary" @click="saveDivisionRules">保存该组规则</el-button>
      </template>
    </el-drawer>

    <!-- AI 识别结果预览弹窗 -->
    <el-dialog
      v-model="showAiPreview"
      title="AI 识别结果 - 请确认后填入表单"
      width="600px"
      :close-on-click-modal="false"
    >
      <div class="ai-preview-content">
        <el-alert type="info" :closable="false" style="margin-bottom: 16px;">
          <template #title>
            <el-icon><InfoFilled /></el-icon> AI 已从竞赛规程中识别出以下信息，请核对后确认填入
          </template>
        </el-alert>

        <div class="ai-result-grid">
          <div v-for="(label, key) in aiFieldLabels" :key="key" class="ai-result-item">
            <label>{{ label }}</label>
            <div class="ai-result-value">
              <el-input
                v-if="key === 'description'"
                v-model="aiResult[key]"
                type="textarea"
                :rows="2"
                placeholder="未识别"
              />
              <el-input
                v-else-if="key === 'type'"
                v-model="aiResult[key]"
                placeholder="未识别"
              >
                <template #append>
                  <el-select v-model="aiResult[key]" style="width: 120px;">
                    <el-option value="tournament" label="赛会制" />
                    <el-option value="cup" label="杯赛制" />
                    <el-option value="league" label="联赛制" />
                    <el-option value="combined" label="复合制" />
                  </el-select>
                </template>
              </el-input>
              <el-date-picker
                v-else-if="['deadline', 'startDate', 'endDate'].includes(key)"
                v-model="aiResult[key]"
                type="date"
                placeholder="未识别"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
              <el-input-number
                v-else-if="['groupCount', 'teamsPerGroup', 'maxTeams', 'maxPlayers'].includes(key)"
                v-model="aiResult[key]"
                :min="0"
                style="width: 100%"
                placeholder="未识别"
              />
              <el-input
                v-else
                v-model="aiResult[key]"
                placeholder="未识别"
              />
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="showAiPreview = false">取消</el-button>
        <el-button type="primary" @click="applyAiResult">
          <el-icon><Check /></el-icon> 确认填入
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload, MagicStick, Check, InfoFilled, Document, Delete, QuestionFilled } from '@element-plus/icons-vue'
import { queryList, queryById, updateRecord, uploadFileViaCloud, uploadLargeFileViaCloud, getFileUrl, callFunction } from '../../utils/cloud'
import { MATCH_FORMAT_OPTIONS, MATCH_FORMAT_DEFAULTS, resolveMaxPlayers, inferMatchFormat, getMaxByFormat } from '../../utils/rosterHelper'
import AIImageGenerator from '../../components/common/AIImageGenerator.vue'

const router = useRouter()
const route = useRoute()
const id = route.params.id

const formRef = ref(null)
const loading = ref(true)
const submitting = ref(false)
const uploadingLogo = ref(false)
const uploadingRegulations = ref(false)
const parsingRegulations = ref(false)
const showAiPreview = ref(false)
const aiResult = ref({})
const regulationsUploadRef = ref(null)
const activeStep = ref(0) // 当前步骤

const typeOptions = [
  { value: 'tournament', label: '赛会制', icon: '🏟️', desc: '小组赛 + 淘汰赛，分组循环后交叉淘汰' },
  { value: 'cup', label: '杯赛制', icon: '🏆', desc: '单场淘汰，32/16/8强抽签对决' },
  { value: 'league', label: '联赛制', icon: '📊', desc: '单循环或双循环积分赛' },
  { value: 'combined', label: '复合制', icon: '⚽', desc: '联赛阶段 + 杯赛阶段，灵活配置' }
]

// ★ 比赛制式选项
const matchFormatOptions = MATCH_FORMAT_OPTIONS
// 淘汰赛配置折叠区
const knockoutCollapseActive = ref([])
// 淘汰赛窗口切换 loading
const togglingKnockoutOpen = ref(false)

const themeOptions = [
  { id: 'green', name: '活力绿', gradient: 'linear-gradient(135deg, #1B5E20 0%, #2E7D32 50%, #43A047 100%)', description: '充满生机与活力' },
  { id: 'blue', name: '专业蓝', gradient: 'linear-gradient(135deg, #0D47A1 0%, #1565C0 50%, #1976D2 100%)', description: '专业可靠稳重' },
  { id: 'red', name: '热情红', gradient: 'linear-gradient(135deg, #B71C1C 0%, #D32F2F 50%, #F44336 100%)', description: '热血激情澎湃' },
  { id: 'orange', name: '活力橙', gradient: 'linear-gradient(135deg, #E65100 0%, #F57C00 50%, #FF9800 100%)', description: '温暖活力四射' },
  { id: 'purple', name: '典雅紫', gradient: 'linear-gradient(135deg, #4A148C 0%, #6A1B9A 50%, #9C27B0 100%)', description: '高贵典雅神秘' },
  { id: 'dark', name: '深邃黑', gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', description: '深邃专业质感' }
]

const form = ref({
  name: '', type: '', typeName: '', location: '',
  titleSponsor: '', deadline: '', startDate: '', endDate: '',
  maxTeams: 8, maxPlayers: 20, description: '',
  status: 'registering', registeredTeams: 0,
  themeId: 'green',
  logo: '',
  logoFileId: '',
  regulationsFileId: '',
  regulationsUrl: '',
  regulationsFileName: '',
  multiDivision: false,
  divisionMode: 'single',
  defaultDivisionId: '',
  divisions: [],
  // ★ 比赛制式与每队大名单上限
  matchFormat: '11side',
  maxPlayersPerTeam: 35,
  // ★ 淘汰赛独立名单配置
  knockoutMaxPlayers: 0,
  knockoutRosterEnabled: false,
  knockoutRosterOpen: false,
  maxRosterChanges: 3,
  // 规则配置
  rules: {
    // 积分规则
    pointsRule: {
      winPoints: 3,
      drawPoints: 1,
      lossPoints: 0,
      forfeitPoints: 0,
      enableGoalBonus: false,
      goalBonusPoints: 0,
      enableCardDeduction: false,
      yellowCardDeduction: 0,
      redCardDeduction: 0
    },
    // 换人规则
    substitutionRule: {
      maxSubstitutions: 5,
      allowReturnSubstitution: false,
      extraSubstitutionAtHalftime: true,
      halftimeSubstitutions: 0
    },
    // 停赛规则
    suspensionRule: {
      yellowCardsForSuspension: 4,
      yellowCardSuspensionMatches: 1,
      redCardSuspensionMatches: 1,
      secondYellowSuspensionMatches: 0,
      carryRedCardToNextSeason: false,
      carryYellowCardToNextSeason: false
    }
  }
})

const rules = {
  name: [{ required: true, message: '请输入赛事名称', trigger: 'blur' }],
  logo: [{ required: true, message: '请上传赛事Logo', trigger: 'change' }]
}

// 主题选择
const selectedTheme = computed(() => {
  return themeOptions.find(t => t.id === form.value.themeId)
})

// ★ 当前制式允许设置的大名单上限（动态绑定 el-input-number :max）
const matchFormatMaxPlayers = computed(() => {
  return getMaxByFormat(form.value.matchFormat)
})

function selectTheme(theme) {
  form.value.themeId = theme.id
}

// ★ 比赛制式切换处理：自动填充默认大名单上限；若用户已手动修改则弹确认框
function onMatchFormatChange(formatValue) {
  if (form.value.matchFormat === formatValue) return
  const currentMax = form.value.maxPlayersPerTeam
  const currentDefault = MATCH_FORMAT_DEFAULTS[form.value.matchFormat]
  const modified = currentMax && currentMax !== currentDefault
  const newDefault = MATCH_FORMAT_DEFAULTS[formatValue]

  if (modified) {
    ElMessageBox.confirm(
      `切换比赛制式将把每队大名单上限重置为 ${newDefault} 人，是否继续？`,
      '提示',
      { confirmButtonText: '重置', cancelButtonText: '保留当前值', type: 'warning' }
    ).then(() => {
      form.value.matchFormat = formatValue
      form.value.maxPlayersPerTeam = newDefault
    }).catch(() => {
      form.value.matchFormat = formatValue
      const newCap = getMaxByFormat(formatValue)
      if (form.value.maxPlayersPerTeam > newCap) {
        form.value.maxPlayersPerTeam = newCap
      }
    })
  } else {
    form.value.matchFormat = formatValue
    form.value.maxPlayersPerTeam = newDefault
  }
}

// ★ 切换淘汰赛名单提交窗口状态（T05）
async function toggleKnockoutRosterOpen() {
  togglingKnockoutOpen.value = true
  try {
    const nextOpen = !form.value.knockoutRosterOpen
    await updateRecord('tournaments', id, { knockoutRosterOpen: nextOpen })
    form.value.knockoutRosterOpen = nextOpen
    ElMessage.success(nextOpen ? '已开启第二阶段名单提交窗口' : '已关闭第二阶段名单提交窗口')
  } catch (err) {
    ElMessage.error('切换失败: ' + (err.message || '未知错误'))
  } finally {
    togglingKnockoutOpen.value = false
  }
}

// 步骤导航
function nextStep() {
  if (activeStep.value < 3) {
    activeStep.value++
  }
}

function prevStep() {
  if (activeStep.value > 0) {
    activeStep.value--
  }
}

// AI生成成功回调
function handleAISuccess(url) {
  form.value.logo = url
  ElMessage.success('AI已生成赛事LOGO')
}

// 赛事 Logo 上传
async function beforeLogoUpload(file) {
  const isImage = file.type.startsWith('image/')
  const isLt20M = file.size / 1024 / 1024 < 20

  if (!isImage) {
    ElMessage.error('只能上传图片文件！')
    return false
  }
  if (!isLt20M) {
    ElMessage.error('原始图片不能超过 20MB！')
    return false
  }
  return true
}

const divisionPresets = ['U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18']

const tiebreakerOptions = [
  { key: 'headToHead', label: '相互胜负关系' },
  { key: 'headToHeadGoalDiff', label: '相互净胜球' },
  { key: 'headToHeadGoals', label: '相互进球' },
  { key: 'goalDiff', label: '总净胜球' },
  { key: 'totalGoals', label: '总进球' },
  { key: 'fewestCards', label: '红黄牌数少优先' },
  { key: 'goalsConceded', label: '总失球' }
]

const divisionRulesVisible = ref(false)
const divisionRulesTab = ref('competition')
const editingDivisionIndex = ref(-1)
const divisionRulesDraft = ref(null)

const currentDivisionType = computed(() => (
  form.value.divisions[editingDivisionIndex.value]?.tournamentType || 'tournament'
))

const divisionRulesTitle = computed(() => {
  const division = form.value.divisions[editingDivisionIndex.value]
  return `${division?.name || '当前组别'} · 详细规则设置`
})

function cloneRuleData(value) {
  return JSON.parse(JSON.stringify(value || {}))
}

function createCompetitionRule(type = 'tournament') {
  return {
    groupRoundMode: 'single',
    qualifyPerGroup: 2,
    bestThirdQualifiers: 0,
    knockoutTeamCount: 8,
    knockoutPairing: 'cross',
    avoidSameGroup: true,
    leagueRoundMode: 'single',
    cupTieMode: 'single',
    reseedEachRound: false,
    knockoutTieBreaker: 'extraTimePenalties',
    extraTimeMinutes: 10,
    thirdPlaceMatch: false,
    type
  }
}

function normalizeDivisionRules(savedRules, type = 'tournament', tournamentRules = null) {
  const source = savedRules || {}
  const inherited = tournamentRules || form.value?.rules || {}
  const defaultPoints = {
    winPoints: 3,
    drawPoints: 1,
    lossPoints: 0,
    forfeitPoints: 0,
    tiebreakerOrder: tiebreakerOptions.map(item => item.key)
  }
  const defaultSubstitution = {
    maxSubstitutions: 5,
    substitutionWindows: 3,
    allowReturnSubstitution: false,
    halftimeCountsAsWindow: false,
    extraTimeSubstitution: 1
  }
  const defaultSuspension = {
    yellowCardsForSuspension: 4,
    yellowCardSuspensionMatches: 1,
    redCardSuspensionMatches: 1,
    secondYellowSuspensionMatches: 0,
    carryCardsToKnockout: false,
    clearYellowCardsAfterGroup: false,
    directRedNeedsReview: true
  }

  return {
    version: 1,
    configured: source.configured === true,
    inheritTournamentRules: source.inheritTournamentRules !== false,
    competitionRule: {
      ...createCompetitionRule(type),
      ...(source.competitionRule || {}),
      type
    },
    pointsRule: {
      ...defaultPoints,
      ...(inherited.pointsRule || {}),
      ...(source.pointsRule || {}),
      tiebreakerOrder: cloneRuleData(
        source.pointsRule?.tiebreakerOrder || inherited.pointsRule?.tiebreakerOrder || defaultPoints.tiebreakerOrder
      )
    },
    substitutionRule: {
      ...defaultSubstitution,
      ...(inherited.substitutionRule || {}),
      ...(source.substitutionRule || {})
    },
    suspensionRule: {
      ...defaultSuspension,
      ...(inherited.suspensionRule || {}),
      ...(source.suspensionRule || {})
    }
  }
}

function openDivisionRules(index) {
  const division = form.value.divisions[index]
  if (!division) return
  editingDivisionIndex.value = index
  divisionRulesDraft.value = cloneRuleData(
    normalizeDivisionRules(division.rules, division.tournamentType)
  )
  divisionRulesTab.value = 'competition'
  divisionRulesVisible.value = true
}

function saveDivisionRules() {
  const division = form.value.divisions[editingDivisionIndex.value]
  if (!division || !divisionRulesDraft.value) return
  if (!divisionRulesDraft.value.inheritTournamentRules && !divisionRulesDraft.value.pointsRule.tiebreakerOrder.length) {
    ElMessage.warning('请至少选择一种同分排名方式')
    divisionRulesTab.value = 'points'
    return
  }
  if (divisionRulesDraft.value.suspensionRule.clearYellowCardsAfterGroup) {
    divisionRulesDraft.value.suspensionRule.carryCardsToKnockout = false
  }
  division.rules = cloneRuleData({ ...divisionRulesDraft.value, configured: true })
  divisionRulesVisible.value = false
  ElMessage.success(`${division.name || '当前组别'}规则已保存`)
}

function getDivisionRulesStatus(division) {
  if (!division.rules?.configured) return '详细规则'
  return division.rules.inheritTournamentRules === false ? '独立规则' : '规则已设置'
}

function onDivisionTypeChange(index) {
  const division = form.value.divisions[index]
  if (!division) return
  const rulesData = normalizeDivisionRules(division.rules, division.tournamentType)
  rulesData.competitionRule = createCompetitionRule(division.tournamentType)
  rulesData.configured = false
  division.rules = rulesData
}

function createDivision(name = '') {
  return {
    id: `division-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    tournamentType: form.value.type || 'tournament',
    matchFormat: form.value.matchFormat || '7side',
    maxTeams: Number(form.value.maxTeams) || 8,
    maxPlayersPerTeam: Number(form.value.maxPlayersPerTeam) || 20,
    rules: normalizeDivisionRules(null, form.value.type || 'tournament')
  }
}

function onMultiDivisionChange(enabled) {
  if (enabled && form.value.divisions.length === 0) {
    form.value.divisions = [createDivision('U8'), createDivision('U9')]
  }
}

function addDivision(name) {
  if (name && form.value.divisions.some(item => item.name === name)) return
  form.value.divisions.push(createDivision(name))
}

function removeDivision(index) {
  if (form.value.divisions.length <= 2) {
    ElMessage.warning('多组别赛事至少保留两个组别')
    return
  }
  form.value.divisions.splice(index, 1)
}

function onDivisionFormatChange(index) {
  const division = form.value.divisions[index]
  if (division) division.maxPlayersPerTeam = MATCH_FORMAT_DEFAULTS[division.matchFormat] || 20
}

async function compressLogoImage(file) {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('图片读取失败'))
      img.src = objectUrl
    })

    const maxDimension = 640
    const scale = Math.min(maxDimension / image.width, maxDimension / image.height, 1)
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    context.clearRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    const targetSize = 180 * 1024
    let quality = 0.82
    let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality))
    while (blob && blob.size > targetSize && quality > 0.4) {
      quality -= 0.08
      blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality))
    }
    if (!blob) throw new Error('图片压缩失败')

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'tournament-logo'
    return new File([blob], `${baseName}.webp`, {
      type: 'image/webp',
      lastModified: Date.now()
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function handleLogoUpload(options) {
  uploadingLogo.value = true
  try {
    const { file } = options
    ElMessage.info('正在压缩赛事Logo...')
    const compressedFile = await compressLogoImage(file)
    const cloudPath = `tournament-logos/${Date.now()}-${compressedFile.name}`
    const result = await uploadLargeFileViaCloud(cloudPath, compressedFile, {
      chunkSize: 32 * 1024
    })
    const previewUrl = result.tempUrl || await getFileUrl(result.fileId)
    if (!previewUrl) throw new Error('未获取到Logo预览地址')
    form.value.logoFileId = result.fileId || ''
    form.value.logo = previewUrl
    formRef.value?.clearValidate('logo')
    ElMessage.success(`Logo压缩并上传成功（${Math.ceil(compressedFile.size / 1024)}KB）`)
  } catch (err) {
    console.error('上传失败:', err)
    ElMessage.error('上传失败: ' + (err.message || '未知错误'))
  } finally {
    uploadingLogo.value = false
  }
}

// ========== 竞赛规程上传 ==========

const aiFieldLabels = {
  name: '赛事名称',
  type: '赛制类型',
  groupCount: '分组数量',
  teamsPerGroup: '每组队伍数',
  maxTeams: '最大球队数',
  maxPlayers: '每队参赛人数',
  deadline: '报名截止日',
  startDate: '开始日期',
  endDate: '结束日期',
  location: '比赛地点',
  description: '赛事说明'
}

function beforeRegulationsUpload(file) {
  const validTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ]
  const isValidType = validTypes.includes(file.type) || file.name.match(/\.(pdf|docx|doc|jpg|jpeg|png|gif|webp)$/i)
  const isLt10M = file.size / 1024 / 1024 < 10

  if (!isValidType) {
    ElMessage.error('只支持 PDF、Word、图片格式！')
    return false
  }
  if (!isLt10M) {
    ElMessage.error('文件大小不能超过 10MB！')
    return false
  }
  return true
}

async function handleRegulationsUpload(options) {
  uploadingRegulations.value = true
  try {
    const { file } = options
    const ext = file.name.split('.').pop()
    const cloudPath = `tournament-regulations/${Date.now()}-${file.name}`
    const result = await uploadFileViaCloud(cloudPath, file)
    form.value.regulationsFileId = result.fileId
    form.value.regulationsUrl = result.tempUrl
    form.value.regulationsFileName = file.name
    ElMessage.success('竞赛规程上传成功！')
  } catch (err) {
    console.error('规程上传失败:', err)
    ElMessage.error('上传失败: ' + (err.message || '未知错误'))
  } finally {
    uploadingRegulations.value = false
  }
}

function removeRegulations() {
  form.value.regulationsFileId = ''
  form.value.regulationsUrl = ''
  form.value.regulationsFileName = ''
  if (regulationsUploadRef.value) {
    regulationsUploadRef.value.clearFiles()
  }
  ElMessage.success('已删除竞赛规程')
}

async function parseRegulations() {
  if (!form.value.regulationsFileId) {
    ElMessage.warning('请先上传竞赛规程')
    return
  }

  parsingRegulations.value = true
  try {
    const ext = form.value.regulationsFileName?.split('.').pop().toLowerCase() || ''
    let fileType = 'pdf'
    if (['docx', 'doc'].includes(ext)) fileType = 'docx'
    else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) fileType = 'image'

    const result = await callFunction('parseTournamentRegulations', {
      fileID: form.value.regulationsFileId,
      fileType: fileType,
      fileName: form.value.regulationsFileName
    }, 60000)

    if (result && result.success) {
      aiResult.value = result.data || {}
      showAiPreview.value = true
      ElMessage.success('AI 识别完成，请核对结果')
    } else {
      ElMessage.error(result?.message || '识别失败')
    }
  } catch (err) {
    console.error('识别失败:', err)
    ElMessage.error('识别失败: ' + (err.message || '未知错误'))
  } finally {
    parsingRegulations.value = false
  }
}

function applyAiResult() {
  const data = aiResult.value
  if (data.name) form.value.name = data.name
  if (data.type) {
    form.value.type = data.type
    const typeOption = typeOptions.find(t => t.value === data.type)
    if (typeOption) form.value.typeName = typeOption.label
  }
  if (data.groupCount) form.value.groupCount = data.groupCount
  if (data.teamsPerGroup) form.value.teamsPerGroup = data.teamsPerGroup
  if (data.maxTeams) form.value.maxTeams = data.maxTeams
  if (data.maxPlayers) form.value.maxPlayers = data.maxPlayers
  if (data.deadline) form.value.deadline = data.deadline
  if (data.startDate) form.value.startDate = data.startDate
  if (data.endDate) form.value.endDate = data.endDate
  if (data.location) form.value.location = data.location
  if (data.description) form.value.description = data.description

  showAiPreview.value = false
  ElMessage.success('已填入识别结果')
}

// 加载赛事数据
async function loadTournament() {
  loading.value = true
  try {
    const result = await queryList('tournaments', {
      where: { _id: id }
    })
    if (result.length === 0) {
      ElMessage.error('赛事不存在')
      router.push('/tournaments')
      return
    }
    const data = result[0]
    
    // 填充表单 - 确保 rules 对象存在
    const rulesData = data.rules || {}
    
    // ★ 读取大名单上限（回退链）：maxPlayersPerTeam → maxPlayers → 默认值
    const resolvedMax = resolveMaxPlayers(data)
    // ★ matchFormat 无值时根据 maxPlayers 反推制式
    const resolvedFormat = data.matchFormat || inferMatchFormat(data.maxPlayers || resolvedMax)
    
    form.value = {
      name: data.name || '',
      type: data.type || '',
      typeName: data.typeName || '',
      location: data.location || '',
      titleSponsor: data.titleSponsor || '',
      deadline: data.deadline || '',
      startDate: data.startDate || '',
      endDate: data.endDate || '',
      maxTeams: data.maxTeams || 8,
      maxPlayers: resolvedMax,
      description: data.description || '',
      status: data.status || 'registering',
      registeredTeams: data.registeredTeams || 0,
      themeId: data.themeId || 'green',
      logo: data.logo || data.logoUrl || '',
      logoFileId: data.logoFileId || '',
      regulationsFileId: data.regulationsFileId || '',
      regulationsUrl: data.regulationsUrl || '',
      regulationsFileName: data.regulationsFileName || '',
      multiDivision: data.multiDivision === true || data.divisionMode === 'multiple' || (data.divisions || []).length > 1,
      divisionMode: data.divisionMode || ((data.divisions || []).length > 1 ? 'multiple' : 'single'),
      defaultDivisionId: data.defaultDivisionId || data.divisions?.[0]?.id || 'default',
      divisions: (data.divisions || []).map(item => ({
        id: item.id || `division-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: item.name || '',
        tournamentType: item.tournamentType || data.type || 'tournament',
        matchFormat: item.matchFormat || resolvedFormat,
        maxTeams: Number(item.maxTeams || data.maxTeams || 8),
        maxPlayersPerTeam: Number(item.maxPlayersPerTeam || resolvedMax),
        rules: normalizeDivisionRules(
          item.rules,
          item.tournamentType || data.type || 'tournament',
          data.rules
        )
      })),
      // ★ 比赛制式与大名单上限（带回退）
      matchFormat: resolvedFormat,
      maxPlayersPerTeam: resolvedMax,
      // ★ 淘汰赛独立名单配置
      knockoutMaxPlayers: data.knockoutMaxPlayers || 0,
      knockoutRosterEnabled: data.knockoutRosterEnabled || false,
      knockoutRosterOpen: data.knockoutRosterOpen || false,
      maxRosterChanges: data.maxRosterChanges !== undefined ? data.maxRosterChanges : 3,
      // 规则配置 - 使用默认值填充缺失的字段
      rules: {
        pointsRule: {
          winPoints: rulesData.pointsRule?.winPoints ?? 3,
          drawPoints: rulesData.pointsRule?.drawPoints ?? 1,
          lossPoints: rulesData.pointsRule?.lossPoints ?? 0,
          forfeitPoints: rulesData.pointsRule?.forfeitPoints ?? 0,
          enableGoalBonus: rulesData.pointsRule?.enableGoalBonus ?? false,
          goalBonusPoints: rulesData.pointsRule?.goalBonusPoints ?? 0,
          enableCardDeduction: rulesData.pointsRule?.enableCardDeduction ?? false,
          yellowCardDeduction: rulesData.pointsRule?.yellowCardDeduction ?? 0,
          redCardDeduction: rulesData.pointsRule?.redCardDeduction ?? 0
        },
        substitutionRule: {
          maxSubstitutions: rulesData.substitutionRule?.maxSubstitutions ?? 5,
          allowReturnSubstitution: rulesData.substitutionRule?.allowReturnSubstitution ?? false,
          extraSubstitutionAtHalftime: rulesData.substitutionRule?.extraSubstitutionAtHalftime ?? true,
          halftimeSubstitutions: rulesData.substitutionRule?.halftimeSubstitutions ?? 0
        },
        suspensionRule: {
          yellowCardsForSuspension: rulesData.suspensionRule?.yellowCardsForSuspension ?? 4,
          yellowCardSuspensionMatches: rulesData.suspensionRule?.yellowCardSuspensionMatches ?? 1,
          redCardSuspensionMatches: rulesData.suspensionRule?.redCardSuspensionMatches ?? 1,
          secondYellowSuspensionMatches: rulesData.suspensionRule?.secondYellowSuspensionMatches ?? 0,
          carryRedCardToNextSeason: rulesData.suspensionRule?.carryRedCardToNextSeason ?? false,
          carryYellowCardToNextSeason: rulesData.suspensionRule?.carryYellowCardToNextSeason ?? false
        }
      }
    }
  } catch (err) {
    console.error('加载赛事失败:', err)
    ElMessage.error('加载失败: ' + err.message)
  } finally {
    loading.value = false
  }
}

async function handleSubmit() {
  if (!form.value.type) {
    ElMessage.warning('请选择赛制')
    return
  }
  if (!form.value.name.trim()) {
    ElMessage.warning('请输入赛事名称')
    return
  }
  if (!form.value.logo && !form.value.logoFileId) {
    ElMessage.warning('请上传赛事Logo')
    activeStep.value = 0
    return
  }
  if (form.value.multiDivision) {
    const names = form.value.divisions.map(item => item.name.trim()).filter(Boolean)
    if (form.value.divisions.length < 2 || names.length !== form.value.divisions.length) {
      ElMessage.warning('多组别赛事至少需要两个已命名组别')
      activeStep.value = 0
      return
    }
    if (new Set(names).size !== names.length) {
      ElMessage.warning('组别名称不能重复')
      activeStep.value = 0
      return
    }
  }

  submitting.value = true
  try {
    // 整理提交数据
    const submitData = {
      ...form.value,
      divisionMode: form.value.multiDivision ? 'multiple' : 'single',
      divisions: form.value.multiDivision
        ? form.value.divisions.map(item => ({
            ...item,
            name: item.name.trim(),
            rules: normalizeDivisionRules(item.rules, item.tournamentType, form.value.rules)
          }))
        : [],
      defaultDivisionId: form.value.multiDivision ? (form.value.divisions[0]?.id || 'default') : 'default',
      // ★ 向后兼容：同时写入 maxPlayers（= maxPlayersPerTeam）
      maxPlayers: form.value.maxPlayersPerTeam,
      // 确保 rules 对象完整
      rules: {
        pointsRule: { ...form.value.rules.pointsRule },
        substitutionRule: { ...form.value.rules.substitutionRule },
        suspensionRule: { ...form.value.rules.suspensionRule }
      }
    }

    await updateRecord('tournaments', id, submitData)
    ElMessage.success('赛事修改成功！')
    router.push('/tournaments/' + id)
  } catch (err) {
    ElMessage.error('修改失败: ' + err.message)
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadTournament()
})
</script>

<style scoped>
.schedule-type-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.type-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 2px solid #e4e7ed;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.type-card:hover {
  border-color: #b3d9b3;
  background: #f9fdf9;
}

.type-card.selected {
  border-color: #2E7D32;
  background: #e8f5e9;
}

.type-icon {
  font-size: 32px;
  flex-shrink: 0;
}

.type-name {
  font-size: 15px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 2px;
}

.type-desc {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
}

.type-check {
  position: absolute;
  top: 8px;
  right: 12px;
  color: #2E7D32;
  font-size: 18px;
  font-weight: bold;
}

/* ★ 比赛制式选择器（4列紧凑卡片） */
.format-grid {
  grid-template-columns: repeat(4, 1fr);
}

.format-grid .type-card {
  flex-direction: column;
  text-align: center;
  padding: 14px 8px;
  gap: 6px;
}

.format-grid .type-icon {
  font-size: 28px;
}

.format-grid .type-name {
  font-size: 14px;
}

.format-grid .type-desc {
  font-size: 11px;
  line-height: 1.3;
}

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
  position: relative;
  width: 80px;
  height: 80px;
  border: 1px dashed #dcdfe6;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
}

.logo-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.logo-preview .preview-tip {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 12px;
  text-align: center;
  padding: 2px 0;
}

/* 主题选择器 */
.theme-selector {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.theme-templates {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.theme-item {
  height: 48px;
  border-radius: 8px;
  cursor: pointer;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  border: 2px solid transparent;
}

.theme-item:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.theme-item.selected {
  border-color: #fff;
  box-shadow: 0 0 0 3px rgba(46, 125, 50, 0.5);
}

.theme-check {
  position: absolute;
  top: 2px;
  right: 4px;
  color: #fff;
  font-size: 14px;
  font-weight: bold;
}

.theme-name {
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.theme-selected-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: #f9f9f9;
  border-radius: 8px;
}

.preview-gradient {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  flex-shrink: 0;
}

.preview-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.preview-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.preview-desc {
  font-size: 12px;
  color: #909399;
}

/* 表单提示文字 */
.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  line-height: 1.4;
}

/* 步骤内容区域 */
.el-form > div {
  animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 竞赛规程上传 */
.regulations-upload-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.regulations-hint {
  font-size: 12px;
  color: #909399;
}

.regulations-file {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #f5f7fa;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
}

.regulations-file .file-icon {
  font-size: 24px;
  color: #409eff;
  flex-shrink: 0;
}

.regulations-file .file-name {
  flex: 1;
  font-size: 14px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.regulations-file .file-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* AI 识别结果预览 */
.ai-preview-content {
  max-height: 60vh;
  overflow-y: auto;
}

.ai-result-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ai-result-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-result-item label {
  font-size: 13px;
  font-weight: 500;
  color: #606266;
}

.ai-result-value {
  width: 100%;
}

.division-mode-panel { width: 100%; padding: 16px; background: #f5f9f5; border: 1px solid #d9ead9; border-radius: 10px; box-sizing: border-box; }
.division-mode-head { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.division-mode-title { color: #1b5e20; font-weight: 600; }
.division-quick-add { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 16px 0 12px; }
.division-row { display: grid; grid-template-columns: 1.1fr 1fr 1fr 110px 110px 92px 52px; gap: 8px; align-items: center; padding: 10px; margin-top: 8px; background: #fff; border-radius: 8px; }
.division-column-hint { margin-top: 8px; color: #909399; font-size: 12px; }

.division-rules-editor { padding: 0 4px 20px; }
.division-rules-tabs { margin-top: 18px; }
.division-rules-inherit-switch { margin-bottom: 16px; }
.division-rule-section-title { margin: 8px 0 14px; padding-left: 10px; border-left: 3px solid #2e7d32; color: #1b5e20; font-size: 15px; font-weight: 600; }
.division-rule-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; }
.division-rule-grid-four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.division-rule-grid :deep(.el-select),
.division-rule-grid :deep(.el-input-number) { width: 100%; }
.division-rule-unit { margin-left: 8px; color: #606266; }

@media (max-width: 1100px) {
  .division-row { grid-template-columns: 1fr 1fr; }
  .division-rule-grid-four { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
