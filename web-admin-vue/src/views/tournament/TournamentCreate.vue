<template>
  <div class="tournament-create">
    <el-page-header @back="$router.push('/tournaments')" title="返回赛事列表">
      <template #content>
        <span style="font-size: 18px;">创建赛事</span>
      </template>
    </el-page-header>

    <div class="page-card" style="margin-top: 20px; max-width: 900px;">
      <!-- 步骤条 -->
      <el-steps :active="activeStep" finish-status="success" style="margin-bottom: 30px;">
        <el-step title="基础信息" />
        <el-step title="积分规则" />
        <el-step title="换人规则" />
        <el-step title="停赛规则" />
      </el-steps>

      <el-form :model="form" label-width="100px" label-position="top" :rules="rules" ref="formRef">
        <!-- 第1步：基础信息 -->
        <div v-if="activeStep === 0">
          <!-- 智能识别竞赛规程（问题1：替换模板选择区域） -->
          <div class="ai-parse-section">
            <div class="section-title">
              <el-icon><Document /></el-icon>
              <span>智能识别竞赛规程</span>
            </div>
            <div class="parse-hint">上传竞赛规程文件（支持 PDF、WORD、JPG、PNG、BMP 格式），AI自动提取比赛规则并填充表单</div>
            
            <div class="parse-upload-area">
              <div class="upload-row">
                <el-upload
                  class="parse-uploader"
                  :show-file-list="false"
                  :before-upload="beforeParseUpload"
                  :http-request="handleParseUpload"
                  accept=".pdf,.docx,.jpg,.jpeg,.png,.bmp"
                >
                  <el-button type="primary" :loading="parsingRegulations" size="default">
                    <el-icon v-if="!parsingRegulations"><Upload /></el-icon>
                    {{ parsingRegulations ? '识别中...' : '选择文件' }}
                  </el-button>
                </el-upload>
                <el-button 
                  type="success" 
                  :loading="parsingRegulations" 
                  @click="startParseRegulations"
                  :disabled="!parseFileData"
                  size="default"
                  style="margin-left: 12px;"
                >
                  开始识别
                </el-button>
                <span class="upload-tip">支持 PDF、WORD、JPG、PNG、BMP 格式</span>
              </div>
              
              <div v-if="parseFileName" class="parse-file-info">
                <el-icon><Document /></el-icon>
                <span>{{ parseFileName }}</span>
                <el-button type="text" size="small" @click="clearParseFile">清除</el-button>
              </div>
              
              <div v-if="parseResult" class="parse-result">
                <el-alert type="success" :closable="false" show-icon>
                  <template #title>识别成功！已自动填充规则配置，请核对修改</template>
                </el-alert>
              </div>
            </div>
          </div>

          <el-divider />

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

          <!-- ★ 赛事类型选择 -->
          <el-form-item label="赛事类型" required>
            <div class="schedule-type-grid">
              <div
                v-for="item in categoryOptions"
                :key="item.value"
                class="type-card"
                :class="{ selected: form.category === item.value }"
                @click="form.category = item.value"
              >
                <div class="type-icon" :style="{ background: item.bgColor, color: item.color }">{{ item.icon }}</div>
                <div class="type-info">
                  <div class="type-name">{{ item.label }}</div>
                  <div class="type-desc">{{ item.desc }}</div>
                </div>
                <div v-if="form.category === item.value" class="type-check">✓</div>
              </div>
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

          <!-- 比赛时间设置（问题2：时间类型调整） -->
          <el-divider content-position="left">比赛时间设置</el-divider>
          
          <el-row :gutter="16">
            <el-col :span="8">
              <el-form-item label="时间类型">
                <el-radio-group v-model="form.matchTime.timeType" @change="onTimeTypeChange">
                  <el-radio label="halves">上下半场</el-radio>
                  <el-radio label="quarters">分节</el-radio>
                </el-radio-group>
                <div class="form-item-tip">比赛的时间计算方式</div>
              </el-form-item>
            </el-col>
          </el-row>

          <!-- 上下半场模式 -->
          <template v-if="form.matchTime.timeType === 'halves'">
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="半场时长">
                  <el-select v-model="form.matchTime.halfDuration" style="width: 100%;">
                    <el-option
                      v-for="option in halfDurationOptions"
                      :key="option.value"
                      :label="option.label"
                      :value="option.value"
                    />
                  </el-select>
                  <div class="form-item-tip">选项：20/25/30/35/40/45 分钟</div>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="中场休息">
                  <el-input-number
                    v-model="form.matchTime.halftimeBreak"
                    :min="0"
                    :max="20"
                    style="width: 100%;"
                    controls-position="right"
                  />
                  <div class="form-item-tip">中场休息时长（分钟）</div>
                </el-form-item>
              </el-col>
            </el-row>
          </template>

          <!-- 分节模式 -->
          <template v-if="form.matchTime.timeType === 'quarters'">
            <el-row :gutter="16">
              <el-col :span="8">
                <el-form-item label="每节时长">
                  <el-select v-model="form.matchTime.quarterDuration" style="width: 100%;">
                    <el-option
                      v-for="option in quarterDurationOptions"
                      :key="option.value"
                      :label="option.label"
                      :value="option.value"
                    />
                  </el-select>
                  <div class="form-item-tip">选项：5/10/15/20/25/30 分钟</div>
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="节数">
                  <el-input-number
                    v-model="form.matchTime.quartersCount"
                    :min="2"
                    :max="4"
                    style="width: 100%;"
                    controls-position="right"
                  />
                  <div class="form-item-tip">比赛总节数（2/3/4 节）</div>
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="节间休息">
                  <el-input-number
                    v-model="form.matchTime.quarterBreak"
                    :min="0"
                    :max="10"
                    style="width: 100%;"
                    controls-position="right"
                  />
                  <div class="form-item-tip">每节之间休息时长（分钟）</div>
                </el-form-item>
              </el-col>
            </el-row>
          </template>

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
              <el-form-item label="赛事Logo">
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
                      {{ uploadingLogo ? '压缩上传中...' : '上传Logo' }}
                    </el-button>
                  </el-upload>
                  <!-- ★ Bug 3 修复：显示本地预览（优先）或上传后的临时 URL -->
                  <div class="logo-preview" v-if="logoPreviewUrl || form.logo">
                    <img :src="logoPreviewUrl || form.logo" alt="Logo预览" />
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
                <div class="form-item-tip">当前制式允许设置的最大值：{{ matchFormatMaxPlayers }} 人</div>
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
                      <div class="form-item-tip">不填或为 0 表示沿用第一阶段上限</div>
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="每队换人申请次数">
                      <el-input-number v-model="form.maxRosterChanges" :min="0" :max="10" style="width: 100%" />
                      <div class="form-item-tip">淘汰赛阶段每队最大换人申请次数（默认 3）</div>
                    </el-form-item>
                  </el-col>
                </el-row>
              </template>
            </el-collapse-item>
          </el-collapse>

          <el-form-item label="赛事说明">
            <el-input v-model="form.description" type="textarea" :rows="4" placeholder="请输入赛事说明" maxlength="500" show-word-limit />
          </el-form-item>
        </div>

        <!-- 第2步：积分规则配置 -->
        <div v-if="activeStep === 1">
          <el-alert title="积分规则说明" type="info" :closable="false" style="margin-bottom: 20px;">
            <template #default>
              配置赛事的积分计算规则，包括胜平负得分、进球加分、红黄牌扣分等。
            </template>
          </el-alert>

          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="胜场得分">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <el-input-number
                    v-model="form.rules.pointsRule.winPoints"
                    :min="0"
                    :max="10"
                    style="width: 100px;"
                    controls-position="right"
                  />
                  <span class="form-item-tip" style="margin-top: 0; white-space: nowrap;">球队获胜时获得的积分（默认 3 分）</span>
                </div>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="平局得分">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <el-input-number
                    v-model="form.rules.pointsRule.drawPoints"
                    :min="0"
                    :max="10"
                    style="width: 100px;"
                    controls-position="right"
                  />
                  <span class="form-item-tip" style="margin-top: 0; white-space: nowrap;">球队平局时获得的积分（默认 1 分）</span>
                </div>
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="负场得分">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <el-input-number
                    v-model="form.rules.pointsRule.lossPoints"
                    :min="0"
                    :max="10"
                    style="width: 100px;"
                    controls-position="right"
                  />
                  <span class="form-item-tip" style="margin-top: 0; white-space: nowrap;">球队失败时获得的积分（默认 0 分）</span>
                </div>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="弃权得分">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <el-input-number
                    v-model="form.rules.pointsRule.forfeitPoints"
                    :min="0"
                    :max="10"
                    style="width: 100px;"
                    controls-position="right"
                  />
                  <span class="form-item-tip" style="margin-top: 0; white-space: nowrap;">球队弃权时获得的积分（默认 0 分）</span>
                </div>
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
            <div class="form-item-tip">每个进球额外获得的积分（可设置小数，如 0.5）</div>
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
                  <div class="form-item-tip">每张黄牌扣除的积分</div>
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
                  <div class="form-item-tip">每张红牌扣除的积分</div>
                </el-form-item>
              </el-col>
            </el-row>
          </template>

          <el-form-item>
            <el-checkbox v-model="form.useDefaultRules">使用默认规则（胜3平1负0，跳过后续配置）</el-checkbox>
          </el-form-item>

          <!-- 同分排序方式 - 可拖拽排序（问题4：优化UI排版） -->
          <el-divider content-position="left">同分排序方式</el-divider>
        <el-form-item required>
          <template #label>
            <div>同分排序方式</div>
            <div style="font-weight: normal; font-size: 12px; color: #909399;">拖拽调整优先级，从高到低</div>
          </template>
          <div
              class="tiebreaker-drag-list"
              style="max-width: 500px;"
              @dragover.prevent
            >
              <div
                v-for="(key, index) in form.rules.pointsRule.tiebreakerOrder"
                :key="key"
                class="tiebreaker-drag-item"
                :class="{ dragging: draggingIndex === index }"
                draggable="true"
                @dragstart="onDragStart($event, index)"
                @dragover="onDragOver($event, index)"
                @dragend="onDragEnd"
              >
                <div class="drag-handle">≡</div>
                <div class="drag-index">{{ index + 1 }}</div>
                <div class="drag-label">{{ getTiebreakerLabel(key) }}</div>
              </div>
            </div>
          </el-form-item>
        </div>

        <!-- 第3步：换人规则配置 -->
        <div v-if="activeStep === 2">
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
              style="width: 120px;"
              controls-position="right"
            />
            <div class="form-item-tip">每场比赛允许的最大换人次数（默认 5 次）</div>
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
            <div class="form-item-tip">是否允许被换下场的球员再次被换上场</div>
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
            <div class="form-item-tip">中场休息时是否允许额外换人（不计入常规换人次数）</div>
          </el-form-item>

          <el-form-item
            label="中场额外换人人数"
            v-if="form.rules.substitutionRule.extraSubstitutionAtHalftime"
          >
            <div class="halftime-sub-input">
              <el-input-number
                v-model="form.rules.substitutionRule.halftimeSubstitutions"
                :min="0"
                :max="10"
                :disabled="halftimeSubUnlimited"
                :placeholder="halftimeSubUnlimited ? '-' : '请输入人数'"
                style="width: 120px;"
                controls-position="right"
              />
              <el-button
                type="text"
                @click="toggleHalftimeUnlimited"
                :class="{ 'unlimited-active': halftimeSubUnlimited }"
              >
                {{ halftimeSubUnlimited ? '已设不限' : '设为不限' }}
              </el-button>
            </div>
            <div class="form-item-tip">中场休息时可额外更换的人数（不计入全场换人名额）</div>
          </el-form-item>
        </div>

        <!-- 第4步：停赛规则配置 -->
        <div v-if="activeStep === 3">
          <el-alert title="停赛规则说明" type="info" :closable="false" style="margin-bottom: 20px;">
            <template #default>
              配置赛事的黄牌累计停赛、红牌直接停赛等规则。
            </template>
          </el-alert>

          <el-divider content-position="left">黄牌累计停赛</el-divider>

          <el-form-item label="累计黄牌数量">
            <el-input-number
              v-model="form.rules.suspensionRule.yellowCardsForSuspension"
              :min="0"
              :max="10"
              :step="1"
              style="width: 120px;"
              controls-position="right"
            />
            <div class="form-item-tip">球员累计多少张黄牌后停赛一场（设置为 0 表示不启用，默认 4 张）</div>
          </el-form-item>

          <el-form-item label="停赛场次">
            <el-input-number
              v-model="form.rules.suspensionRule.yellowCardSuspensionMatches"
              :min="1"
              :max="5"
              :step="1"
              style="width: 120px;"
              controls-position="right"
            />
            <div class="form-item-tip">因累计黄牌停赛的场次数量（默认 1 场）</div>
          </el-form-item>

          <el-divider content-position="left">红牌直接停赛</el-divider>

          <el-form-item label="直接红牌停赛场次">
            <el-input-number
              v-model="form.rules.suspensionRule.redCardSuspensionMatches"
              :min="1"
              :max="10"
              :step="1"
              style="width: 120px;"
              controls-position="right"
            />
            <div class="form-item-tip">球员直接获得红牌后停赛的场次数量（默认 1 场）</div>
          </el-form-item>

          <el-form-item label="两黄变红停赛场次">
            <el-input-number
              v-model="form.rules.suspensionRule.secondYellowSuspensionMatches"
              :min="0"
              :max="5"
              :step="1"
              style="width: 120px;"
              controls-position="right"
            />
            <div class="form-item-tip">球员两黄变红后停赛的场次数量（设置为 0 表示不额外停赛，默认 0 场）</div>
          </el-form-item>

          <!-- 跨阶段规则：仅在小组赛+淘汰赛制或混合制时显示 -->
          <template v-if="showCrossStageRules">
            <el-divider content-position="left">跨阶段规则</el-divider>

            <el-form-item label="红牌是否带入下阶段">
              <el-switch v-model="form.rules.suspensionRule.carryRedCardToNextSeason" />
              <span style="margin-left: 8px; color: #909399;">
                {{ form.rules.suspensionRule.carryRedCardToNextSeason ? '带入' : '不带入' }}
              </span>
              <el-tooltip placement="top">
                <template #content>
                  启用后，本阶段的红牌停赛将延续到下一个阶段<br/>
                  适用于小组赛+淘汰赛制的赛事
                </template>
                <el-icon style="margin-left: 4px; color: #909399;"><QuestionFilled /></el-icon>
              </el-tooltip>
              <div class="form-item-tip">红牌停赛是否延续到下一个阶段（适用于跨阶段赛事）</div>
            </el-form-item>

            <el-form-item label="黄牌是否带入下阶段">
              <el-switch v-model="form.rules.suspensionRule.carryYellowCardToNextSeason" />
              <span style="margin-left: 8px; color: #909399;">
                {{ form.rules.suspensionRule.carryYellowCardToNextSeason ? '带入' : '不带入' }}
              </span>
              <el-tooltip placement="top">
                <template #content>
                  启用后，本阶段累计的黄牌将延续到下一个阶段<br/>
                  适用于小组赛+淘汰赛制的赛事
                </template>
                <el-icon style="margin-left: 4px; color: #909399;"><QuestionFilled /></el-icon>
              </el-tooltip>
              <div class="form-item-tip">黄牌累计是否延续到下一个阶段（适用于跨阶段赛事）</div>
            </el-form-item>

            <el-form-item label="小组赛红黄牌是否带入淘汰赛阶段">
              <el-switch v-model="form.rules.suspensionRule.carryCardsToKnockout" />
              <span style="margin-left: 8px; color: #909399;">
                {{ form.rules.suspensionRule.carryCardsToKnockout ? '带入' : '不带入' }}
              </span>
              <el-tooltip placement="top">
                <template #content>
                  启用后，小组赛阶段的红黄牌将计入淘汰赛阶段<br/>
                  影响累计黄牌停赛和红牌停赛的计算
                </template>
                <el-icon style="margin-left: 4px; color: #909399;"><QuestionFilled /></el-icon>
              </el-tooltip>
              <div class="form-item-tip">小组赛的红黄牌是否计入淘汰赛阶段（适用于小组赛+淘汰赛制）</div>
            </el-form-item>
          </template>
        </div>

        <!-- 步骤导航按钮 -->
        <el-form-item>
          <div style="display: flex; justify-content: space-between; width: 100%;">
            <el-button v-if="activeStep > 0" @click="prevStep">上一步</el-button>
            <div v-else></div>

            <div>
              <el-button v-if="activeStep < 3 && !form.useDefaultRules" type="primary" @click="nextStep">
                下一步
              </el-button>
              <el-button v-if="activeStep === 3 || form.useDefaultRules" type="primary" :loading="submitting" @click="handleSubmit">
                创建赛事
              </el-button>
            </div>
          </div>
        </el-form-item>
      </el-form>

      <!-- ★ 向导式确认弹窗 -->
      <el-dialog v-model="showWizard" :title="['基础信息','比赛时间','积分规则','换人/停赛','确认'][wizardStep]" width="680px" :close-on-click-modal="false" destroy-on-close>
        <el-steps :active="wizardStep" finish-status="success" style="margin-bottom: 20px;">
          <el-step title="基础信息" />
          <el-step title="比赛时间" />
          <el-step title="积分规则" />
          <el-step title="换人/停赛" />
          <el-step title="确认" />
        </el-steps>

        <div v-if="wizardStep === 0">
          <el-form :model="wizardData" label-width="100px">
            <el-form-item label="赛事名称"><el-input v-model="wizardData.name" /></el-form-item>
            <el-form-item label="赛制">
              <el-select v-model="wizardData.type" style="width: 100%;">
                <el-option v-for="t in typeOptions" :key="t.value" :label="t.label" :value="t.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="报名截止"><el-date-picker v-model="wizardData.deadline" type="date" style="width: 100%;" /></el-form-item>
            <el-form-item label="开始日期"><el-date-picker v-model="wizardData.startDate" type="date" style="width: 100%;" /></el-form-item>
            <el-form-item label="结束日期"><el-date-picker v-model="wizardData.endDate" type="date" style="width: 100%;" /></el-form-item>
          </el-form>
        </div>

        <div v-else-if="wizardStep === 1">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="时间类型">{{ wizardData.matchTime?.timeType === 'halves' ? '上下半场' : '分节' }}</el-descriptions-item>
            <el-descriptions-item v-if="wizardData.matchTime?.timeType === 'halves'" label="半场时长">{{ wizardData.matchTime?.halfDuration }} 分钟</el-descriptions-item>
            <el-descriptions-item v-if="wizardData.matchTime?.timeType === 'halves'" label="中场休息">{{ wizardData.matchTime?.halftimeBreak }} 分钟</el-descriptions-item>
            <el-descriptions-item v-if="wizardData.matchTime?.timeType === 'quarters'" label="每节时长">{{ wizardData.matchTime?.quarterDuration }} 分钟</el-descriptions-item>
          </el-descriptions>
        </div>

        <div v-else-if="wizardStep === 2">
          <el-descriptions :column="3" border>
            <el-descriptions-item label="胜场">{{ (wizardData.rules || {}).pointsRule?.winPoints ?? 3 }} 分</el-descriptions-item>
            <el-descriptions-item label="平局">{{ (wizardData.rules || {}).pointsRule?.drawPoints ?? 1 }} 分</el-descriptions-item>
            <el-descriptions-item label="负场">{{ (wizardData.rules || {}).pointsRule?.lossPoints ?? 0 }} 分</el-descriptions-item>
          </el-descriptions>
        </div>

        <div v-else-if="wizardStep === 3">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="最大换人数">{{ (wizardData.rules || {}).substitutionRule?.maxSubstitutions ?? 5 }}</el-descriptions-item>
            <el-descriptions-item label="允许换回">{{ (wizardData.rules || {}).substitutionRule?.allowReturnSubstitution ? '是' : '否' }}</el-descriptions-item>
            <el-descriptions-item label="黄牌停赛">{{ (wizardData.rules || {}).suspensionRule?.yellowCardsForSuspension ?? 2 }} 张</el-descriptions-item>
            <el-descriptions-item label="红牌停赛">{{ (wizardData.rules || {}).suspensionRule?.redCardSuspensionMatches ?? 1 }} 场</el-descriptions-item>
          </el-descriptions>
        </div>

        <div v-else-if="wizardStep === 4">
          <el-alert type="success">
            <template #title>确认无误后点击"确认填充"</template>
            <p>{{ wizardData.name }} | {{ wizardData.type }} | 胜{{ (wizardData.rules || {}).pointsRule?.winPoints ?? 3 }}分</p>
          </el-alert>
        </div>

        <template #footer>
          <el-button @click="showWizard = false">取消</el-button>
          <el-button v-if="wizardStep > 0" @click="wizardStep--">上一步</el-button>
          <el-button v-if="wizardStep < 4" type="primary" @click="wizardStep++">下一步</el-button>
          <el-button v-if="wizardStep === 4" type="success" @click="confirmWizardFill">确认填充</el-button>
        </template>
      </el-dialog>

    </div>
    
    <!-- ★ Logo 裁剪组件（v-model 控制弹窗显示） -->
    <ImageCropper
      v-model="showLogoCropper"
      :imageSrc="logoCropperImageUrl"
      @crop="onLogoCropSuccess"
      @cancel="onLogoCropCancel"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload, QuestionFilled, Document } from '@element-plus/icons-vue'
import { addRecord, uploadFileViaCloud, callFunction, _arrayBufferToBase64 } from '../../utils/cloud'
import { MATCH_FORMAT_OPTIONS, MATCH_FORMAT_DEFAULTS, getMaxByFormat } from '../../utils/rosterHelper'
import AIImageGenerator from '../../components/common/AIImageGenerator.vue'
import ImageCropper from '../../components/common/ImageCropper.vue'  // ★ Bug 3 修复：添加裁剪组件

const router = useRouter()
const formRef = ref(null)
const submitting = ref(false)
const uploadingLogo = ref(false)
const activeStep = ref(0) // 当前步骤：0-3
const halftimeSubUnlimited = ref(false) // 中场额外换人是否不限
const parsingRegulations = ref(false) // 是否正在识别竞赛规程
const parseFileData = ref(null) // 上传的规程文件
const parseFileName = ref('') // 文件名
const parseResult = ref(false) // 识别结果

// ★ Bug 3 修复：Logo 预览和裁剪相关
const logoPreviewUrl = ref('') // Logo 本地预览 URL
const showLogoCropper = ref(false) // 是否显示裁剪窗口
const logoCropperImageUrl = ref('') // 裁剪组件的图片 URL
const originalLogoFile = ref(null) // 原始 Logo 文件（用于裁剪）

// ★ 向导式确认弹窗
const showWizard = ref(false)           // 控制向导弹窗显示
const wizardStep = ref(0)             // 当前步骤（0-5）
const wizardData = ref({})             // 向导中的临时数据（归一化后）
const wizardRawData = ref(null)       // AI 原始返回数据（用于调试）

// 比赛时间设置（问题2：时间类型调整 - 去掉全场，分节模式独立字段）
const halfDurationOptions = [
  { value: 20, label: '20分钟' },
  { value: 25, label: '25分钟' },
  { value: 30, label: '30分钟' },
  { value: 35, label: '35分钟' },
  { value: 40, label: '40分钟' },
  { value: 45, label: '45分钟' },
]

const quarterDurationOptions = [
  { value: 5, label: '5分钟' },
  { value: 10, label: '10分钟' },
  { value: 15, label: '15分钟' },
  { value: 20, label: '20分钟' },
  { value: 25, label: '25分钟' },
  { value: 30, label: '30分钟' },
]

// 同分排序选项（问题4：可拖拽排序）
const tiebreakerOptions = [
  { key: 'headToHead', label: '相互胜负关系' },
  { key: 'headToHeadGoalDiff', label: '相互净胜球' },
  { key: 'headToHeadGoals', label: '相互进球' },
  { key: 'goalDiff', label: '总净胜球' },
  { key: 'totalGoals', label: '总进球' },
  { key: 'fewestCards', label: '红黄牌数少优先' },
  { key: 'goalsConceded', label: '总失球' },
]

// 赛制选项
const typeOptions = [
  { value: 'tournament', label: '赛会制', icon: '🏟️', desc: '小组赛 + 淘汰赛，分组循环后交叉淘汰' },
  { value: 'cup', label: '杯赛制', icon: '🏆', desc: '单场淘汰，32/16/8强抽签对决' },
  { value: 'league', label: '联赛制', icon: '📊', desc: '单循环或双循环积分赛' },
  { value: 'combined', label: '复合制', icon: '⚽', desc: '联赛阶段 + 杯赛阶段，灵活配置' }
]

// ★ 比赛制式选项（11/8/7/5人制）
const matchFormatOptions = MATCH_FORMAT_OPTIONS

// 赛事类型选项
const categoryOptions = [
  { value: 'youth', label: '青少年赛事', icon: '⚽', desc: 'U8~U18青少年足球赛事', bgColor: '#F3E5F5', color: '#AB47BC' }
]

// 淘汰赛配置折叠区默认展开状态
const knockoutCollapseActive = ref([])

// 主题选项
const themeOptions = [
  { id: 'green', name: '活力绿', gradient: 'linear-gradient(135deg, #1B5E20 0%, #2E7D32 50%, #43A047 100%)', description: '充满生机与活力' },
  { id: 'blue', name: '专业蓝', gradient: 'linear-gradient(135deg, #0D47A1 0%, #1565C0 50%, #1976D2 100%)', description: '专业可靠稳重' },
  { id: 'red', name: '热情红', gradient: 'linear-gradient(135deg, #B71C1C 0%, #D32F2F 50%, #F44336 100%)', description: '热血激情澎湃' },
  { id: 'orange', name: '活力橙', gradient: 'linear-gradient(135deg, #E65100 0%, #F57C00 50%, #FF9800 100%)', description: '温暖活力四射' },
  { id: 'purple', name: '典雅紫', gradient: 'linear-gradient(135deg, #4A148C 0%, #6A1B9A 50%, #9C27B0 100%)', description: '高贵典雅神秘' },
  { id: 'dark', name: '深邃黑', gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', description: '深邃专业质感' }
]

// 表单数据
const form = ref({
  name: '', type: '', typeName: '', location: '',
  titleSponsor: '', deadline: '', startDate: '', endDate: '',
  maxTeams: 8, maxPlayers: 20, description: '',
  status: 'registering', registeredTeams: 0,
  category: 'youth', // 赛小蜂足球只创建青少年赛事
  themeId: 'green',
  logo: '',

  // ★ 比赛制式与每队大名单上限
  matchFormat: '11side',
  maxPlayersPerTeam: 35,
  // ★ 淘汰赛独立名单配置
  knockoutMaxPlayers: 0,
  knockoutRosterEnabled: false,
  knockoutRosterOpen: false,
  maxRosterChanges: 3,

  // 比赛时间设置（问题2：时间类型调整）
  matchTime: {
    timeType: 'halves',      // 'halves' 或 'quarters'（删除 'full'）
    // 上下半场模式
    halfDuration: 30,        // 半场时长（分钟）
    halftimeBreak: 10,       // 中场休息（分钟）
    // 分节模式
    quarterDuration: 15,    // 每节时长（分钟）
    quartersCount: 4,        // 节数
    quarterBreak: 2,         // 节间休息（分钟）
  },

  // 规则配置（嵌套结构，与 TournamentEdit.vue 保持一致）
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
      redCardDeduction: 0,
      // 同分排序方式（问题4：可拖拽排序）
      tiebreakerOrder: ['headToHead', 'headToHeadGoalDiff', 'headToHeadGoals', 'goalDiff', 'totalGoals', 'fewestCards', 'goalsConceded']
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
      carryYellowCardToNextSeason: false,
      carryCardsToKnockout: false // 新增：小组赛红黄牌是否带入淘汰赛
    }
  },

  useDefaultRules: false
})

// 表单验证规则
const rules = {
  name: [{ required: true, message: '请输入赛事名称', trigger: 'blur' }]
}

// 计算属性：是否显示跨阶段规则（仅在复合制/混合制时显示）
const showCrossStageRules = computed(() => {
  return form.value.type === 'combined'  // 只在复合制（混合制）时显示跨阶段规则
})

// 监听赛制变化，如果切换到联赛制，隐藏跨阶段规则相关字段
watch(() => form.value.type, (newType) => {
  if (newType === 'league' || newType === 'cup') {
    // 联赛制或杯赛制时，清空跨阶段相关设置
    form.value.rules.suspensionRule.carryRedCardToNextSeason = false
    form.value.rules.suspensionRule.carryYellowCardToNextSeason = false
    form.value.rules.suspensionRule.carryCardsToKnockout = false
  }
})

// ========== 中场额外换人「设为不限」功能（问题3：修复按钮无响应） ==========
/**
 * 切换中场额外换人是否不限
 */
function toggleHalftimeUnlimited() {
  halftimeSubUnlimited.value = !halftimeSubUnlimited.value
  if (halftimeSubUnlimited.value) {
    // 设为不限时，将人数设为 0（表示不限）
    form.value.rules.substitutionRule.halftimeSubstitutions = 0
    console.log('[中场换人] 已设为不限')
  } else {
    // 取消不限时，恢复默认值 1
    form.value.rules.substitutionRule.halftimeSubstitutions = 1
    console.log('[中场换人] 已取消不限，设置为 1 人')
  }
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
  // 判断是否已手动修改（与当前制式默认值不同）
  const modified = currentMax && currentMax !== currentDefault
  const newDefault = MATCH_FORMAT_DEFAULTS[formatValue]

  if (modified) {
    // 用户已手动修改，弹确认框
    ElMessageBox.confirm(
      `切换比赛制式将把每队大名单上限重置为 ${newDefault} 人，是否继续？`,
      '提示',
      { confirmButtonText: '重置', cancelButtonText: '保留当前值', type: 'warning' }
    ).then(() => {
      form.value.matchFormat = formatValue
      form.value.maxPlayersPerTeam = newDefault
    }).catch(() => {
      // 用户选择保留当前值，仅切换制式不重置人数
      form.value.matchFormat = formatValue
      // 若当前值超过新制式上限，则截断
      const newCap = getMaxByFormat(formatValue)
      if (form.value.maxPlayersPerTeam > newCap) {
        form.value.maxPlayersPerTeam = newCap
      }
    })
  } else {
    // 未手动修改，直接切换并填充默认值
    form.value.matchFormat = formatValue
    form.value.maxPlayersPerTeam = newDefault
  }
}

// 时间类型切换时的处理（问题2）
function onTimeTypeChange() {
  // 切换时间类型时，保持各自模式的默认值
  if (form.value.matchTime.timeType === 'halves') {
    // 切换到上下半场模式，确保有合理的默认值
    if (!form.value.matchTime.halfDuration) {
      form.value.matchTime.halfDuration = 30
    }
    if (form.value.matchTime.halftimeBreak === undefined || form.value.matchTime.halftimeBreak === null) {
      form.value.matchTime.halftimeBreak = 10
    }
  } else if (form.value.matchTime.timeType === 'quarters') {
    // 切换到分节模式，确保有合理的默认值
    if (!form.value.matchTime.quarterDuration) {
      form.value.matchTime.quarterDuration = 15
    }
    if (!form.value.matchTime.quartersCount) {
      form.value.matchTime.quartersCount = 4
    }
    if (form.value.matchTime.quarterBreak === undefined || form.value.matchTime.quarterBreak === null) {
      form.value.matchTime.quarterBreak = 2
    }
  }
}

// ========== 问题1：智能识别竞赛规程 ==========

/**
 * 上传竞赛规程前的校验
 * ★ Bug 1 修复：PDF/DOCX 限制为 2MB（Base64 编码后约 2.6MB，避免 HTTP 413）
 */
function beforeParseUpload(file) {
  const fileName = file.name.toLowerCase()
  const isPDF = file.type === 'application/pdf' || fileName.endsWith('.pdf')
  const isDOCX = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileName.endsWith('.docx')
  const isImage = file.type.startsWith('image/')
  
  if (!isPDF && !isDOCX && !isImage) {
    ElMessage.error('不支持的文件格式！请上传 PDF、WORD 或图片文件')
    return false
  }
  
  // ★ 限制文件大小：图片 10MB，PDF/WORD 2MB（避免 HTTP 413）
  let maxSize = 10
  if (isPDF || isDOCX) {
    maxSize = 2  // ★ 修复：从 5MB 改为 2MB
  }
  
  const isLtMax = file.size / 1024 / 1024 < maxSize
  if (!isLtMax) {
    const fileTypeText = isPDF ? 'PDF' : (isDOCX ? 'WORD' : '图片')
    ElMessage.error(`${fileTypeText} 文件过大（超过 ${maxSize}MB）。请压缩文件后重试，或联系管理员`)
    return false
  }
  
  // 保存文件数据
  parseFileData.value = file
  parseFileName.value = file.name
  parseResult.value = false
  
  const fileTypeText = isPDF ? 'PDF' : (isDOCX ? 'WORD' : '图片')
  ElMessage.success(`${fileTypeText} 文件已选择，点击「开始识别」进行AI解析`)
  return false // 阻止自动上传
}

/**
 * 清除已选择的规程文件
 */
function clearParseFile() {
  parseFileData.value = null
  parseFileName.value = ''
  parseResult.value = false
}

/**
 * 开始识别竞赛规程
 */
async function startParseRegulations() {
  if (!parseFileData.value) {
    ElMessage.warning('请先选择规程文件')
    return
  }
  
  parsingRegulations.value = true
  
  try {
    const fileName = parseFileData.value.name.toLowerCase()
    const isPDF = fileName.endsWith('.pdf')
    const isDOCX = fileName.endsWith('.docx')
    const isImage = parseFileData.value.type.startsWith('image/')
    
    let fileToUpload = parseFileData.value
    
    // 1. 根据文件类型处理
    if (isImage) {
      // 图片：先压缩
      ElMessage.info('正在压缩图片...')
      fileToUpload = await compressImage(parseFileData.value, { maxDimension: 1200, quality: 0.7, targetSize: 500 * 1024 })
      console.log('[识别规程] 压缩后大小:', (fileToUpload.size / 1024).toFixed(0), 'KB')
    } else if (isPDF || isDOCX) {
      // PDF/WORD：不压缩，但显示提示
      const fileTypeText = isPDF ? 'PDF' : 'WORD'
      ElMessage.info(`正在上传 ${fileTypeText} 文件...`)
      // PDF/WORD 不需要压缩，直接使用原文件
    }
    
    // 2. ★ 新方案：直接将文件分片发给 parseTournamentRegulations（绕过 uploadFile 避免 413）
    let fileType = 'image'
    if (isPDF) fileType = 'pdf'
    else if (isDOCX) fileType = 'docx'

    const CHUNK_SIZE = 50 * 1024  // ★ 每片 50KB（Base64 后 ~67KB，远低于网关限制）
    const arrayBuffer = await fileToUpload.arrayBuffer()
    const totalBytes = arrayBuffer.byteLength
    const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE)

    console.log(`[识别规程] 文件: ${parseFileData.value.name}, 大小: ${(totalBytes / 1024 / 1024).toFixed(2)}MB, 分成 ${totalChunks} 片发送`)

    // 步骤 1：初始化解析会话
    const initResult = await callFunction('parseTournamentRegulations', {
      action: 'startChunkedParse',
      fileName: parseFileData.value.name,
      fileType: fileType,
      totalChunks: totalChunks,
      totalSize: totalBytes
    })

    if (!initResult.success) {
      throw new Error(initResult.message || '初始化解析失败')
    }

    const parseSessionId = initResult.sessionId

    try {
      // 步骤 2：逐片发送文件数据
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, totalBytes)
        const chunkBuffer = arrayBuffer.slice(start, end)
        const chunkBase64 = _arrayBufferToBase64(chunkBuffer)

        const chunkResult = await callFunction('parseTournamentRegulations', {
          action: 'uploadDataChunk',
          sessionId: parseSessionId,
          chunkIndex: i,
          data: chunkBase64
        })

        if (!chunkResult.success) {
          throw new Error(`数据分片 ${i + 1}/${totalChunks} 发送失败: ${chunkResult.message}`)
        }

        // 进度提示（每 10 片提示一次）
        if ((i + 1) % 10 === 0 || i === totalChunks - 1) {
          console.log(`[识别规程] 数据传输: ${i + 1}/${totalChunks} 片`)
        }
      }

      // 步骤 3：通知云函数开始解析
      ElMessage.info('文件传输完成，正在 AI 识别规程内容...')
      console.log('[识别规程] 所有分片已发送，开始 AI 解析...')

      const parseResultData = await callFunction('parseTournamentRegulations', {
        action: 'executeParsed',
        sessionId: parseSessionId
      })

      // ★ 调试日志：完整打印返回结构
      console.log('[识别规程] ★★★ executeParsed 完整返回:', JSON.stringify(parseResultData, null, 2))
      console.log('[识别规程] ★★★ parseResultData.success:', parseResultData?.success)
      console.log('[识别规程] ★★★ parseResultData.data:', JSON.stringify(parseResultData?.data || {}, null, 2))
      console.log('[识别规程] ★★★ parseResultData.message:', parseResultData?.message)
      console.log('[识别规程] ★★★ parseResultData.rawText:', (parseResultData?.rawText || '').substring(0, 500))

      if (parseResultData && parseResultData.success) {
        // ★ 改为向导式确认弹窗，不自动填充
        const src = parseResultData.data || {}
        console.log('[识别规程] ★★ src (AI分析结果):', JSON.stringify(src, null, 2))
        console.log('[识别规程] ★★ src.basicInfo?', !!src.basicInfo)
        console.log('[识别规程] ★★ src.name?', src.name)
        console.log('[识别规程] ★★ src.basicInfo?.name?', src.basicInfo?.name)
        // 归一化（兼容扁平/嵌套格式）
        wizardData.value = {
          name: src.name || src.basicInfo?.name || '',
          type: src.type || src.basicInfo?.type || '',
          deadline: src.deadline || src.basicInfo?.deadline || '',
          startDate: src.startDate || src.basicInfo?.startDate || '',
          endDate: src.endDate || src.basicInfo?.endDate || '',
          maxTeams: src.maxTeams ?? src.basicInfo?.maxTeams ?? 8,
          maxPlayers: src.maxPlayers ?? src.basicInfo?.maxPlayers ?? 20,
          location: src.location || src.basicInfo?.location || '',
          description: src.description || src.basicInfo?.description || '',
          matchTime: src.matchTime || {
            timeType: src.timeType || 'halves',
            halfDuration: src.halfDuration ?? 30,
            halftimeBreak: src.halftimeBreak ?? 10,
            quarterDuration: src.quarterDuration ?? null,
            quartersCount: src.quartersCount ?? null,
            quarterBreak: src.quarterBreak ?? null,
          },
          rules: src.rules || {
            pointsRule: { winPoints: src.winPoints ?? 3, drawPoints: src.drawPoints ?? 1, lossPoints: src.lossPoints ?? 0 },
            substitutionRule: { maxSubstitutions: src.maxSubstitutions ?? 5, allowReturnSubstitution: src.allowReturnSubstitution ?? false },
            suspensionRule: { yellowCardsForSuspension: src.yellowCardsForSuspension ?? 2, redCardSuspensionMatches: src.redCardSuspensionMatches ?? 1 },
          },
        }
        wizardRawData.value = src
        wizardStep.value = 0
        showWizard.value = true
        parseResult.value = true
        ElMessage.success('AI 识别完成！请逐步确认信息')
      } else {
        throw new Error(parseResultData?.message || 'AI识别失败')
      }
    } catch (chunkErr) {
      console.error('[识别规程] ❌ 分片处理错误:', chunkErr)
      throw chunkErr
    }
  } catch (err) {
    console.error('[识别竞赛规程] ❌', err)
    ElMessage.error('识别失败：' + (err.message || '未知错误') + '，请手动填写或重试')
  } finally {
    parsingRegulations.value = false
  }
}

/**
 * 用识别的数据填充表单
 */
/**
 * ★★ 第十六轮重写：AI 识别结果填充表单 ★★
 * 
 * 设计原则：
 * - 不依赖嵌套/扁平格式假设，直接暴力映射
 * - 无论 AI 返回什么格式，能填的字段全部填上
 * - 每个字段独立映射，一个失败不影响其他
 */
function fillFormWithParsedData(data) {
  if (!data) {
    console.warn('[识别规程] ⚠️ 收到空数据，跳过填充')
    return
  }

  console.log('[识别规程] ========== 开始填充表单 ==========')
  console.log('[识别规程] 原始数据:', JSON.stringify(data).substring(0, 800))
  console.log('[识别规程] 字段列表:', Object.keys(data))

  const filledFields = []  // 记录已填充的字段，用于通知用户

  // ════════════════════════════════════════
  // 第一部分：基础信息（直接映射 + 兼容嵌套格式）
  // ════════════════════════════════════════

  // 赛事名称（最重要，优先级最高）
  const nameVal = data.name || data.basicInfo?.name || ''
  if (nameVal) {
    form.value.name = String(nameVal).trim()
    filledFields.push(`名称:${form.value.name.substring(0, 20)}${form.value.name.length > 20 ? '...' : ''}`)
    console.log('[识别规程] ✅ 赛事名称:', form.value.name)
  }

  // 赛制类型
  const typeVal = data.type || data.basicInfo?.type || ''
  if (typeVal) {
    const typeMap = { league: '联赛制', cup: '杯赛制', combined: '混合制', group: '分组循环+淘汰' }
    form.value.type = typeVal
    form.value.typeName = typeMap[typeVal] || typeVal
    filledFields.push(`赛制:${typeMap[typeVal] || typeVal}`)
    console.log('[识别规程] ✅ 赛制:', typeVal)
  }

  // 报名截止日
  const deadlineVal = data.deadline || data.basicInfo?.deadline || ''
  if (deadlineVal) {
    form.value.deadline = deadlineVal
    filledFields.push(`截止日:${deadlineVal}`)
    console.log('[识别规程] ✅ 报名截止日:', deadlineVal)
  }

  // 开始日期
  const startVal = data.startDate || data.basicInfo?.startDate || ''
  if (startVal) {
    form.value.startDate = startVal
    filledFields.push(`开始:${startVal}`)
  }

  // 结束日期
  const endVal = data.endDate || data.basicInfo?.endDate || ''
  if (endVal) {
    form.value.endDate = endVal
    filledFields.push(`结束:${endVal}`)
  }

  // 最大球队数
  const maxTeamsVal = data.maxTeams ?? data.basicInfo?.maxTeams ?? null
  if (maxTeamsVal !== null && maxTeamsVal !== undefined) {
    form.value.maxTeams = Number(maxTeamsVal)
    filledFields.push(`球队数:${form.value.maxTeams}`)
  }

  // 每队人数
  const maxPlayersVal = data.maxPlayers ?? data.basicInfo?.maxPlayers ?? null
  if (maxPlayersVal !== null && maxPlayersVal !== undefined) {
    form.value.maxPlayers = Number(maxPlayersVal)
    filledFields.push(`人数:${form.value.maxPlayers}`)
  }

  // 举办地点
  const locVal = data.location || data.basicInfo?.location || ''
  if (locVal) {
    form.value.location = String(locVal).trim()
    filledFields.push(`地点:${form.value.location.substring(0, 15)}`)
  }

  // 赛事说明
  const descVal = data.description || data.basicInfo?.description || ''
  if (descVal) {
    form.value.description = String(descVal).trim()
  }

  // ════════════════════════════════════════
  // 第二部分：比赛时间设置
  // ════════════════════════════════════════
  const mt = data.matchTime || data  // 兼容两种格式

  if (mt.timeType) {
    form.value.matchTime.timeType = mt.timeType
    console.log('[识别规程] ✅ 时间类型:', mt.timeType)
  }
  if (mt.halfDuration != null) {
    form.value.matchTime.halfDuration = Number(mt.halfDuration)
    filledFields.push(`半场:${mt.halfDuration}分钟`)
    console.log('[识别规程] ✅ 半场时长:', mt.halfDuration)
  }
  if (mt.halftimeBreak != null) {
    form.value.matchTime.halftimeBreak = Number(mt.halftimeBreak)
  }
  if (mt.quarterDuration != null) {
    form.value.matchTime.quarterDuration = Number(mt.quarterDuration)
  }
  if (mt.quartersCount != null) {
    form.value.matchTime.quartersCount = Number(mt.quartersCount)
  }
  if (mt.quarterBreak != null) {
    form.value.matchTime.quarterBreak = Number(mt.quarterBreak)
  }

  // ════════════════════════════════════════
  // 第三部分：积分规则
  // ════════════════════════════════════════
  const pr = data.rules?.pointsRule || data  // 兼容两种格式

  if (pr.winPoints != null) {
    form.value.rules.pointsRule.winPoints = Number(pr.winPoints)
    filledFields.push(`胜:${pr.winPoints}分`)
  }
  if (pr.drawPoints != null) {
    form.value.rules.pointsRule.drawPoints = Number(pr.drawPoints)
    filledFields.push(`平:${pr.drawPoints}分`)
  }
  if (pr.lossPoints != null) {
    form.value.rules.pointsRule.lossPoints = Number(pr.lossPoints)
    filledFields.push(`负:${pr.lossPoints}分`)
  }

  // ════════════════════════════════════════
  // 第四部分：换人规则
  // ════════════════════════════════════════
  const sr = data.rules?.substitutionRule || data

  if (sr.maxSubstitutions != null) {
    form.value.rules.substitutionRule.maxSubstitutions = Number(sr.maxSubstitutions)
    filledFields.push(`换人:${sr.maxSubstitutions}次`)
  }
  if (sr.allowReturnSubstitution != null) {
    form.value.rules.substitutionRule.allowReturnSubstitution = Boolean(sr.allowReturnSubstitution)
  }

  // ════════════════════════════════════════
  // 第五部分：停赛规则
  // ════════════════════════════════════════
  const suspR = data.rules?.suspensionRule || data

  if (suspR.yellowCardsForSuspension != null) {
    form.value.rules.suspensionRule.yellowCardsForSuspension = Number(suspR.yellowCardsForSuspension)
    filledFields.push(`${suspR.yellowCardsForSuspension}黄停赛`)
  }
  if (suspR.redCardSuspensionMatches != null) {
    form.value.rules.suspensionRule.redCardSuspensionMatches = Number(suspR.redCardSuspensionMatches)
    filledFields.push('红牌停赛')
  }

  // ════════════════════════════════════════
  // 最终报告
  // ════════════════════════════════════════
  console.log('[识别规程] ========== 填充完成 ==========')
  console.log('[识别规程] 已填充字段:', filledFields)

  if (filledFields.length > 0) {
    ElMessage.success(`✅ 已自动填充 ${filledFields.length} 项: ${filledFields.join('、')}`)
  } else {
    ElMessage.warning('⚠️ 识别完成但未提取到可填充的信息，请手动填写')
  }
}

// 步骤切换
function nextStep() {
  // 第1步验证
  if (activeStep.value === 0) {
    if (!form.value.type) {
      ElMessage.warning('请选择赛制')
      return
    }
    if (!form.value.name.trim()) {
      ElMessage.warning('请输入赛事名称')
      return
    }
  }

  // 如果勾选了使用默认规则，跳过第2-4步
  if (form.value.useDefaultRules && activeStep.value === 1) {
    // 直接提交
    handleSubmit()
    return
  }

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

// ========== 问题3：Logo 上传彻底修复 ==========

/**
 * 图片压缩函数（彻底修复 HTTP 413 问题）
 * 关键改进：
 * 1. 正确设置 canvas.width 和 canvas.height 为缩小后的尺寸
 * 2. 用 ctx.drawImage(img, 0, 0, newWidth, newHeight) 缩放绘制
 * 3. 先缩小尺寸，再转 JPEG
 * 4. 递归降低质量和尺寸直到满足目标大小
 * 5. 目标：原图 327KB → 压缩后 < 100KB
 */
async function compressImage(file, options = {}) {
  const MAX_DIMENSION = options.maxDimension || 800  // 最大边长 800px
  const QUALITY = options.quality || 0.6
  const TARGET_SIZE = options.targetSize || 300 * 1024 // 目标 300KB 以内
  
  console.log(`[compressImage] 开始压缩: ${(file.size / 1024).toFixed(0)}KB, ${file.type}, maxDimension=${MAX_DIMENSION}, quality=${QUALITY}`)
  
  // Step1: 用 Image 加载图片
  const img = await new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = (err) => reject(new Error('图片加载失败'))
    i.src = URL.createObjectURL(file)
  })
  
  // Step2: 计算新尺寸（保持宽高比）
  const scale = Math.min(MAX_DIMENSION / img.width, MAX_DIMENSION / img.height, 1)
  const newWidth = Math.round(img.width * scale)
  const newHeight = Math.round(img.height * scale)
  
  console.log(`[compressImage] ${img.width}×${img.height} → ${newWidth}×${newHeight} (scale=${scale.toFixed(2)})`)
  
  // Step3: 绘制到缩小后的 canvas
  const canvas = document.createElement('canvas')
  canvas.width = newWidth
  canvas.height = newHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, newWidth, newHeight)
  
  // Step4: 导出为 JPEG（递归降低质量直到满足目标大小）
  let quality = QUALITY
  let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
  
  // 如果还是太大，逐步降低质量
  while (blob.size > TARGET_SIZE && quality > 0.1) {
    quality -= 0.1
    blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    console.log(`[compressImage] 降低质量到 ${quality.toFixed(1)}, 大小: ${(blob.size/1024).toFixed(0)}KB`)
  }
  
  // 如果质量降到最低还是太大，进一步缩小尺寸
  if (blob.size > TARGET_SIZE && MAX_DIMENSION > 256) {
    console.log(`[compressImage] 质量已降到最低(${quality.toFixed(1)})，但大小仍超标(${(blob.size/1024).toFixed(0)}KB)，递归缩小尺寸`)
    URL.revokeObjectURL(img.src)
    return compressImage(file, { maxDimension: Math.round(MAX_DIMENSION * 0.75), quality: 0.5, targetSize: TARGET_SIZE })
  }
  
  console.log(`[compressImage] 最终: ${(blob.size/1024).toFixed(0)}KB (${newWidth}×${newHeight}, q=${quality.toFixed(1)})`)
  URL.revokeObjectURL(img.src)
  
  // 创建压缩后的 File 对象
  const compressedFile = new File([blob], file.name.replace(/\.(png|gif|webp)$/i, '.jpg'), {
    type: 'image/jpeg',
    lastModified: Date.now()
  })
  
  return compressedFile
}

/**
 * 获取图片尺寸（用于日志）
 */
async function getImageDimensions(file) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(`${img.width}×${img.height}`)
    img.onerror = () => resolve('unknown')
    img.src = URL.createObjectURL(file)
  })
}

/**
 * 赛事 Logo 上传（已添加压缩功能 + 直接 HTTP 调用 + 错误重试）
 */
async function beforeLogoUpload(file) {
  const isImage = file.type.startsWith('image/')
  const isLt2M = file.size / 1024 / 1024 < 2

  if (!isImage) {
    ElMessage.error('只能上传图片文件！')
    return false
  }
  if (!isLt2M) {
    ElMessage.warning('图片大小超过 2MB，将自动压缩后上传')
    // 不阻止上传，允许继续（会在 handleLogoUpload 中压缩）
  }
  return true
}

async function handleLogoUpload(options) {
  uploadingLogo.value = true
  const loadingMsg = ElMessage.info({
    message: '正在处理图片...',
    duration: 0
  })
  
  try {
    const { file } = options
    
    console.log('[Logo上传] 原始大小:', (file.size / 1024).toFixed(0), 'KB', '类型:', file.type, `尺寸: ${await getImageDimensions(file)}`)
    
    // ★ Bug 3 修复：创建本地预览（立即显示，无需等待上传）
    logoPreviewUrl.value = URL.createObjectURL(file)
    originalLogoFile.value = file
    
    // 压缩图片（使用新的压缩函数，目标 300KB 以内）
    const compressedFile = await compressImage(file, { maxDimension: 800, quality: 0.6, targetSize: 300 * 1024 })
    
    console.log('[Logo上传] 压缩后大小:', (compressedFile.size / 1024).toFixed(0), 'KB')
    
    // 如果压缩后仍然太大（> 500KB），警告用户并再次压缩
    if (compressedFile.size > 500 * 1024) {
      ElMessage.warning('图片压缩后仍然较大（' + (compressedFile.size / 1024).toFixed(0) + 'KB），正在尝试进一步压缩...')
      const recompressedFile = await compressImage(file, { maxDimension: 600, quality: 0.5, targetSize: 300 * 1024 })
      console.log('[Logo上传] 二次压缩后大小:', (recompressedFile.size / 1024).toFixed(0), 'KB')
      await uploadCompressedLogo(recompressedFile, loadingMsg)
    } else {
      await uploadCompressedLogo(compressedFile, loadingMsg)
    }
  } catch (err) {
    console.error('[Logo上传] 失败:', err)
    loadingMsg.close()
    ElMessage.error('上传失败: ' + (err.message || '未知错误') + '。请重试或联系管理员')
  } finally {
    uploadingLogo.value = false
  }
}

/**
 * 上传压缩后的图片（带重试逻辑）
 */
async function uploadCompressedLogo(compressedFile, loadingMsg) {
  let retryCount = 0
  const maxRetries = 2
  
  while (retryCount <= maxRetries) {
    try {
      // 关闭之前的 loading 提示
      loadingMsg.close()
      
      // 显示上传中提示
      const uploadingMsg = ElMessage.info({
        message: `正在上传图片${retryCount > 0 ? '（第' + (retryCount + 1) + '次尝试）' : ''}...`,
        duration: 0
      })
      
      // 使用直接 HTTP 调用上传（避免 413 错误）
      const cloudPath = `tournament-logos/${Date.now()}-${compressedFile.name}`
      const result = await uploadFileViaCloud(cloudPath, compressedFile)
      
      uploadingMsg.close()
      
      if (result.success) {
        // ★ Bug 3 修复：优先使用 tempUrl（HTTP URL），否则用 fileId（需要转换为临时 URL）
        const logoUrl = result.tempUrl || result.fileId
        form.value.logo = logoUrl
        
        // ★ Bug 3 修复：上传成功后，触发裁剪窗口
        // 使用原始文件的本地 URL 进行裁剪（避免再次下载）
        if (originalLogoFile.value) {
          logoCropperImageUrl.value = URL.createObjectURL(originalLogoFile.value)
          showLogoCropper.value = true
        }
        
        ElMessage.success('Logo上传成功！可以裁剪调整位置')
        return // 成功，退出函数
      } else {
        throw new Error(result.message || '上传失败')
      }
    } catch (err) {
      retryCount++
      console.error(`[Logo上传] 第${retryCount}次尝试失败:`, err)
      
      if (retryCount > maxRetries) {
        throw err // 达到最大重试次数，抛出错误
      }
      
      // 等待 1 秒后重试
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
}

/**
 * ★ Bug 2 修复：Logo 裁剪成功回调
 * @param {Blob} croppedBlob - ImageCropper 返回的裁剪后图片 Blob
 */
async function onLogoCropSuccess(croppedBlob) {
  try {
    showLogoCropper.value = false
    console.log('[Logo裁剪] 裁剪成功, blob size:', (croppedBlob.size / 1024).toFixed(0), 'KB')
    
    // ★ 修复：将 Blob 转为 URL 用于预览
    const croppedImageUrl = URL.createObjectURL(croppedBlob)
    
    // 更新预览图
    logoPreviewUrl.value = croppedImageUrl
    
    // ★ 可选：上传裁剪后的图片到云存储（覆盖原图）
    // 将 Blob 转换为 File 对象
    const croppedFile = new File([croppedBlob], `cropped-logo-${Date.now()}.png`, {
      type: 'image/png',
      lastModified: Date.now()
    })
    
    // 上传裁剪后的图片
    const cloudPath = `tournament-logos/${Date.now()}-cropped.png`
    const uploadResult = await uploadFileViaCloud(cloudPath, croppedFile)
    
    if (uploadResult.success) {
      // 更新表单中的 logo URL
      form.value.logo = uploadResult.tempUrl || uploadResult.fileId
      ElMessage.success('裁剪成功！Logo 已更新')
    } else {
      ElMessage.warning('裁剪成功，但上传失败，预览已更新')
    }
  } catch (err) {
    console.error('[Logo裁剪] 处理失败:', err)
    ElMessage.error('裁剪处理失败，请重试')
  }
}

/**
 * ★ Bug 3 修复：Logo 裁剪取消回调
 */
function onLogoCropCancel() {
  showLogoCropper.value = false
  console.log('[Logo裁剪] 用户取消裁剪')
  ElMessage.info('已取消裁剪')
}

/**
 * ★ 向导式确认：把向导数据填到表单
 */
function confirmWizardFill() {
  const wd = wizardData.value || {}
  console.log('[向导确认] 开始填充:', JSON.stringify(wd).substring(0, 500))

  // 基础信息
  if (wd.name) form.value.name = String(wd.name).trim()
  if (wd.type) {
    form.value.type = wd.type
    const typeMap = { league: '联赛制', cup: '杯赛制', combined: '混合制', group: '分组循环+淘汰' }
    form.value.typeName = typeMap[wd.type] || wd.type
  }
  if (wd.deadline) form.value.deadline = wd.deadline
  if (wd.startDate) form.value.startDate = wd.startDate
  if (wd.endDate) form.value.endDate = wd.endDate
  if (wd.maxTeams != null) form.value.maxTeams = Number(wd.maxTeams)
  if (wd.maxPlayers != null) form.value.maxPlayers = Number(wd.maxPlayers)
  if (wd.location) form.value.location = String(wd.location).trim()
  if (wd.description) form.value.description = String(wd.description).trim()

  // 比赛时间
  if (wd.matchTime) {
    const mt = wd.matchTime
    if (mt.timeType) form.value.matchTime.timeType = mt.timeType
    if (mt.halfDuration != null) form.value.matchTime.halfDuration = Number(mt.halfDuration)
    if (mt.halftimeBreak != null) form.value.matchTime.halftimeBreak = Number(mt.halftimeBreak)
    if (mt.quarterDuration != null) form.value.matchTime.quarterDuration = Number(mt.quarterDuration)
    if (mt.quartersCount != null) form.value.matchTime.quartersCount = Number(mt.quartersCount)
    if (mt.quarterBreak != null) form.value.matchTime.quarterBreak = Number(mt.quarterBreak)
  }

  // 积分规则
  if (wd.rules && wd.rules.pointsRule) {
    const pr = wd.rules.pointsRule
    if (pr.winPoints != null) form.value.rules.pointsRule.winPoints = Number(pr.winPoints)
    if (pr.drawPoints != null) form.value.rules.pointsRule.drawPoints = Number(pr.drawPoints)
    if (pr.lossPoints != null) form.value.rules.pointsRule.lossPoints = Number(pr.lossPoints)
  }

  // 换人规则
  if (wd.rules && wd.rules.substitutionRule) {
    const sr = wd.rules.substitutionRule
    if (sr.maxSubstitutions != null) form.value.rules.substitutionRule.maxSubstitutions = Number(sr.maxSubstitutions)
    if (sr.allowReturnSubstitution != null) form.value.rules.substitutionRule.allowReturnSubstitution = Boolean(sr.allowReturnSubstitution)
  }

  // 停赛规则
  if (wd.rules && wd.rules.suspensionRule) {
    const sp = wd.rules.suspensionRule
    if (sp.yellowCardsForSuspension != null) form.value.rules.suspensionRule.yellowCardsForSuspension = Number(sp.yellowCardsForSuspension)
    if (sp.redCardSuspensionMatches != null) form.value.rules.suspensionRule.redCardSuspensionMatches = Number(sp.redCardSuspensionMatches)
  }

  showWizard.value = false
  parseResult.value = true
  ElMessage.success('已填充表单！请核对修改')
  console.log('[向导确认] ✅ 填充完成')
}

async function handleSubmit() {
  // 如果使用默认规则，设置默认值
  if (form.value.useDefaultRules) {
    form.value.rules.pointsRule = { winPoints: 3, drawPoints: 1, lossPoints: 0, forfeitPoints: 0, enableGoalBonus: false, goalBonusPoints: 0, enableCardDeduction: false, yellowCardDeduction: 0, redCardDeduction: 0 }
    form.value.rules.substitutionRule = { maxSubstitutions: 5, allowReturnSubstitution: false, extraSubstitutionAtHalftime: true, halftimeSubstitutions: 0 }
    form.value.rules.suspensionRule = { yellowCardsForSuspension: 4, yellowCardSuspensionMatches: 1, redCardSuspensionMatches: 1, secondYellowSuspensionMatches: 0, carryRedCardToNextSeason: false, carryYellowCardToNextSeason: false, carryCardsToKnockout: false }
  }

  submitting.value = true
  try {
    // 移除 useDefaultRules 字段（不需要存入数据库）
    const formData = { ...form.value }
    delete formData.useDefaultRules

    // ★ 关联当前登录用户的手机号（小程序端可据此匹配赛事）
    const savedUser = JSON.parse(localStorage.getItem('userInfo') || '{}')
    if (savedUser.phone) {
      formData.creatorPhone = savedUser.phone
      formData.organizerPhone = savedUser.phone
    }

    // ★ 向后兼容：同时写入 maxPlayers（= maxPlayersPerTeam）
    formData.maxPlayers = formData.maxPlayersPerTeam

    await addRecord('tournaments', formData)
    ElMessage.success('赛事创建成功！')
    router.push('/tournaments')
  } catch (err) {
    ElMessage.error('创建失败: ' + err.message)
  } finally {
    submitting.value = false
  }
}

// ========== 问题4：可拖拽排序 - 同分排序方式 ==========
/**
 * === 规则数据关联说明 ===
 * 
 * 1. 积分规则 → 排名计算引擎（输入比分后自动算积分+排名）
 * 2. 换人规则 → 第四官员换人流程（剩余名额、可否换回、中场额外）
 * 3. 停赛规则 → 自动停赛检测（累计黄牌/红牌停赛/跨阶段累计）
 * 4. 比赛时间 → 裁判端计时器（时长预设/倒计时模式）
 * 
 * 数据存储到 tournaments 集合，裁判操作页面和排名计算页面都从此读取。
 */
const draggingIndex = ref(-1)

/**
 * 拖拽开始
 */
function onDragStart(e, index) {
  draggingIndex.value = index
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', index.toString())
}

/**
 * 拖拽进入
 */
function onDragOver(e, index) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  
  if (draggingIndex.value === -1 || draggingIndex.value === index) {
    return
  }
  
  // 重新排序数组
  const items = [...form.value.rules.pointsRule.tiebreakerOrder]
  const draggedItem = items[draggingIndex.value]
  
  // 删除原位置的元素
  items.splice(draggingIndex.value, 1)
  // 插入到新位置
  items.splice(index, 0, draggedItem)
  
  form.value.rules.pointsRule.tiebreakerOrder = items
  draggingIndex.value = index
}

/**
 * 拖拽结束
 */
function onDragEnd() {
  draggingIndex.value = -1
}

/**
 * 获取排序规则的标签名
 */
function getTiebreakerLabel(key) {
  const option = tiebreakerOptions.find(opt => opt.key === key)
  return option ? option.label : key
}
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
.form-item-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  line-height: 1.4;
}

/* 智能识别竞赛规程区域（问题1） */
.ai-parse-section {
  margin-bottom: 20px;
  padding: 20px;
  background: linear-gradient(135deg, #f5f7fa 0%, #e8f5e9 100%);
  border-radius: 12px;
  border: 2px dashed #2E7D32;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 8px;
}

.parse-hint {
  font-size: 12px;
  color: #909399;
  margin-bottom: 16px;
}

.parse-upload-area {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.upload-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.upload-tip {
  font-size: 12px;
  color: #909399;
}

.parse-file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: white;
  border-radius: 6px;
  border: 1px solid #e4e7ed;
  font-size: 14px;
  color: #303133;
}

.parse-file-info .el-icon {
  color: #2E7D32;
}

.parse-result {
  margin-top: 12px;
}

/* 不限选项样式 */
.unlimited-option {
  display: flex;
  align-items: center;
}

/* 中场换人输入框样式（问题2） */
.halftime-sub-input {
  display: flex;
  align-items: center;
  gap: 8px;
}

.halftime-sub-input .unlimited-active {
  color: #2E7D32;
  font-weight: 500;
}

/* 同分排序拖拽列表样式（问题4：优化UI排版） */
.tiebreaker-drag-list {
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  overflow: hidden;
  background: #f9f9f9;
}

.tiebreaker-drag-item {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  background: white;
  border-bottom: 1px solid #ebeef5;
  cursor: move;
  transition: all 0.2s;
  user-select: none;
  height: 40px; /* 固定行高，更紧凑 */
}

.tiebreaker-drag-item:last-child {
  border-bottom: none;
}

.tiebreaker-drag-item:hover {
  background: #f5f7fa;
}

.tiebreaker-drag-item.dragging {
  background: #e8f5e9;
  border-color: #2E7D32;
  box-shadow: 0 2px 8px rgba(46, 125, 50, 0.2);
}

.tiebreaker-drag-item .drag-handle {
  font-size: 18px;
  color: #909399;
  margin-right: 12px;
  cursor: move;
  width: 20px; /* 固定宽度 */
  text-align: center;
}

.tiebreaker-drag-item .drag-index {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #2E7D32;
  color: white;
  font-size: 12px;
  font-weight: 500;
  margin-right: 12px;
  flex-shrink: 0; /* 不收缩 */
}

.tiebreaker-drag-item .drag-label {
  flex: 1; /* 弹性宽度 */
  font-size: 14px;
  color: #303133;
}

.tiebreaker-drag-item:hover .drag-handle {
  color: #606266;
  cursor: move;
}
</style>
