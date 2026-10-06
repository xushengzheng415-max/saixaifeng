<template>
  <section
    v-loading="loading"
    class="professional-draw"
    aria-labelledby="draw-title"
  >
    <header class="draw-context">
      <div class="context-info">
        <img v-if="logo" :src="logo" :alt="`${tournament.name} Logo`" /><span
          v-else
          class="logo-empty"
          ><el-icon><Trophy /></el-icon
        ></span>
        <h1>{{ tournament.name || "专业抽签" }}</h1>
        <span class="division-chip">{{ activeDivision.name }}</span
        ><span class="state-chip">{{ tournamentState }}</span
        ><span class="context-meta"
          >▣ {{ tournament.startDate || "日期待定" }} —
          {{ tournament.endDate || "日期待定" }}</span
        ><span class="context-meta"
          >⌖ {{ tournament.province || tournament.city || "地点待定" }}</span
        >
      </div>
      <div class="context-actions">
        <span>当前组别</span
        ><el-select
          :model-value="String(activeDivision.id || activeDivision._id)"
          @change="
            (divisionId) =>
              router.replace({ query: { ...route.query, divisionId } })
          "
          ><el-option
            v-for="division in tournament.divisions || []"
            :key="division.id || division._id"
            :label="division.name"
            :value="String(division.id || division._id)" /></el-select
        ><el-button
          plain
          :icon="Back"
          @click="router.push(`/tournaments/${tournamentId}`)"
          >返回赛事空间</el-button
        >
      </div>
    </header>
    <h2 v-if="currentStep !== 'pool'" id="draw-title">
      {{ heading }} <small>{{ headingLead }}</small>
    </h2>
    <div class="draw-steps" :class="{ 'pool-steps': currentStep === 'pool' }">
      <button
        v-for="step in steps"
        :key="step.key"
        type="button"
        :class="{
          active: currentStep === step.key,
          done: step.index < activeIndex,
          locked: step.index > activeIndex + 1,
        }"
        :disabled="step.index > activeIndex"
        @click="goStep(step.key)"
      >
        <span>{{ step.index + 1 }}</span
        >{{ step.title }}<small v-if="step.index > activeIndex">未解锁</small>
      </button>
    </div>
    <p v-if="currentStep !== 'console'" class="step-hint">ⓘ 完成当前步骤后解锁下一步</p>
    <h2 v-if="currentStep === 'pool'" id="draw-title">
      {{ heading }} <small>{{ headingLead }}</small>
    </h2>
    <div v-if="currentStep === 'result'" class="draw-substeps">
      <span
        v-for="item in substeps"
        :key="item.key"
        :class="{
          done: item.key !== 'confirm',
          active: item.key === 'confirm',
        }"
        ><b>{{ item.key === "confirm" ? item.index + 1 : "✓" }}</b
        >{{ item.title }}</span
      >
    </div>

    <template v-if="currentStep === 'setup'">
      <section class="setup-grid">
        <section class="setup-card method-card">
          <h3>选择抽签方式</h3>
          <el-radio-group v-model="drawSetup.mode" class="method-options"
            ><el-radio-button value="group"
              ><b>小组赛抽签</b
              ><small
                >完成小组阶段分组后，可另行发起淘汰赛二次抽签</small
              ></el-radio-button
            ><el-radio-button value="knockout"
              ><b>淘汰赛抽签</b
              ><small
                >按当前淘汰阶段抽取对阵，适用于 8、16 或 32 强</small
              ></el-radio-button
            ><el-radio-button value="league"
              ><b>联赛自动生成</b
              ><small
                >根据参赛球队、轮次和主客场规则自动生成对阵</small
              ></el-radio-button
            ></el-radio-group
          >
        </section>
        <section class="setup-card">
          <h3>小组赛参数</h3>
          <el-form label-position="left" label-width="100px"
            ><el-form-item label="参赛球队"
              ><b>{{ teams.length }} 支</b></el-form-item
            ><el-form-item label="小组数量"
              ><el-input-number
                v-model="drawSetup.groupCount"
                :min="2"
                :max="16" /></el-form-item
            ><el-form-item label="每组球队"
              ><el-input-number
                v-model="drawSetup.teamsPerGroup"
                :min="2"
                :max="8" /></el-form-item
            ><el-form-item label="种子球队"
              ><el-input-number
                v-model="drawSetup.seedCount"
                :min="0"
                :max="teams.length" /></el-form-item
            ><el-form-item label="分配规则"
              ><el-select v-model="drawSetup.distribution"
                ><el-option
                  label="每组 1 支种子队"
                  value="one-per-group" /><el-option
                  label="按球队池随机分配"
                  value="random" /></el-select></el-form-item></el-form
          ><el-button plain :disabled="!setupValid || !canManage" @click="saveSetupAndNext"
            >前往球队池配置</el-button
          >
        </section>
        <section class="setup-card">
          <h3>小组赛规则</h3>
          <div class="rule-line">
            <span>同地区球队规避</span
            ><el-switch v-model="drawSetup.avoidSameRegion" />
          </div>
          <div class="rule-line">
            <span>同机构球队规避</span
            ><el-switch v-model="drawSetup.avoidSameOrganization" />
          </div>
          <div class="rule-line">
            <span>同组回避优先级</span><b>种子规则 ＞ 地区规则 ＞ 机构规则</b>
          </div>
          <div class="rule-line">
            <span>平局/冲突处理</span><b>系统重新抽取</b>
          </div>
          <div class="rule-line">
            <span>规则校验状态</span
            ><el-tag :type="setupValid ? 'success' : 'danger'">{{
              setupValid ? "规则完整" : "请补齐设置"
            }}</el-tag>
          </div>
        </section>
        <section class="setup-card">
          <h3>后续淘汰赛</h3>
          <el-radio-group v-model="drawSetup.knockoutMode"
            ><el-radio value="redraw">小组赛结束后重新发起淘汰赛抽签</el-radio
            ><el-radio value="preset"
              >直接按预设签位进入淘汰赛</el-radio
            ></el-radio-group
          ><el-input-number
            v-model="drawSetup.advancePerGroup"
            :min="1"
            :max="4"
            class="advance-count"
          /><span>每组前 {{ drawSetup.advancePerGroup }} 名晋级</span
          ><el-alert
            type="success"
            :closable="false"
            title="晋级球队确认后，系统将创建新的淘汰赛抽签任务，不沿用本次小组赛签位。"
          />
        </section>
      </section>
      <PairingRuleEditor
        v-if="drawSetup.mode === 'group' || drawSetup.mode === 'league'"
        :tournament-id="String(tournamentId)"
        :division="activeDivision"
        :group-count="drawSetup.mode === 'league' ? 1 : drawSetup.groupCount"
        :teams-per-group="drawSetup.mode === 'league' ? teams.length : drawSetup.teamsPerGroup"
        :group-sizes="drawSetup.mode === 'league' ? [teams.length] : []"
        :disabled="!setupValid || !canManage"
      />
      <section class="setup-options">
        <span>展示时间</span
        ><el-select v-model="drawSetup.displaySeconds"
          ><el-option label="5 秒" value="5" /><el-option
            label="8 秒"
            value="8" /></el-select
        ><span>动画间隔</span
        ><el-select v-model="drawSetup.animationSeconds"
          ><el-option label="2 秒" value="2" /><el-option
            label="4 秒"
            value="4" /></el-select
        ><span>允许暂停与回退</span
        ><el-switch v-model="drawSetup.allowPause" /><span>抽签过程公开</span
        ><el-switch v-model="drawSetup.publicProcess" />
      </section>
      <footer class="draw-footer setup-footer">
        <el-alert
          type="warning"
          :closable="false"
          title="修改抽签方式会清空未发布结果。"
        />
        <div>
          <span
            >当前方式　{{ setupModeText }}　/　{{ teams.length }} 支球队　/　{{
              drawSetup.groupCount
            }}
            组　/　每组 {{ drawSetup.teamsPerGroup }} 支</span
          ><el-button
            type="primary"
            size="large"
            :disabled="!setupValid || !canManage"
            :loading="saving"
            @click="saveSetupAndNext"
            >保存并进入下一步<br /><small>下一步：球队池</small></el-button
          >
        </div>
      </footer>
    </template>

    <template v-else-if="currentStep === 'pool'">
      <div class="pool-layout">
        <main>
          <section class="pool-stats">
            <article v-for="item in poolStats" :key="item.label">
              <span>{{ item.label }}</span
              ><strong>{{ item.value }}</strong>
            </article>
          </section>
          <div class="pool-tools">
            <el-input
              v-model="keyword"
              clearable
              :prefix-icon="Search"
              placeholder="球队名称/编号"
            /><el-select v-model="region" placeholder="全部地区"
              ><el-option label="全部地区" value="" /><el-option
                v-for="item in regions"
                :key="item"
                :label="item"
                :value="item" /></el-select
            ><el-select v-model="seedFilter" placeholder="种子状态"
              ><el-option label="种子状态" value="" /><el-option
                label="种子球队"
                value="seed" /><el-option
                label="普通球队"
                value="ordinary" /></el-select
            ><el-select v-model="relationFilter" placeholder="规避关系"
              ><el-option label="规避关系" value="" /><el-option
                label="存在关系"
                value="linked" /><el-option
                label="无关系"
                value="none" /></el-select
            ><el-button :icon="Star" @click="setAllSeeded"
              >批量设为种子</el-button
            ><el-button :icon="RefreshLeft" @click="clearSeeds"
              >取消种子设置</el-button
            ><el-button @click="autoDetectRelations"
              >自动识别规避关系</el-button
            >
          </div>
          <div class="pool-table-wrap">
            <table class="pool-table">
              <thead>
                <tr>
                  <th class="check-column"></th>
                  <th>球队</th>
                  <th>球队编号</th>
                  <th>所在地区</th>
                  <th>报名状态</th>
                  <th>球员人数</th>
                  <th>种子球队</th>
                  <th>规避关系</th>
                  <th>抽签状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="team in pagedPoolTeams" :key="team.id">
                  <td>
                    <input
                      v-model="selectedRows"
                      type="checkbox"
                      :value="team"
                      :aria-label="`选择${team.name}`"
                    />
                  </td>
                  <td>
                    <div class="team-cell">
                      <img
                        v-if="team.logo"
                        :src="team.logo"
                        :alt="team.name"
                      /><span v-else class="crest-placeholder"
                        ><el-icon><Trophy /></el-icon></span
                      ><b>{{ team.name }}</b>
                    </div>
                  </td>
                  <td>{{ team.code }}</td>
                  <td>{{ team.region }}</td>
                  <td>
                    <el-tag type="success" size="small">{{
                      team.registrationText
                    }}</el-tag>
                  </td>
                  <td>{{ team.playerCount }}</td>
                  <td>
                    <el-switch
                      :model-value="isSeed(team)"
                      :disabled="!canManage"
                      @change="toggleSeed(team)"
                    />
                  </td>
                  <td>{{ team.avoidText }}</td>
                  <td><el-tag size="small">待抽签</el-tag></td>
                  <td class="pool-row-actions"><button type="button" @click="toggleSeed(team)">{{ isSeed(team) ? '取消种子' : '设置种子' }}</button><button type="button" @click="showRelation(team)">查看关系</button></td>
                </tr>
                <tr v-if="!filteredTeams.length">
                  <td colspan="10" class="pool-empty">没有符合条件的球队</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="pool-pagination"><span>共 {{ filteredTeams.length }} 支球队</span><el-pagination v-model:current-page="poolPage" :page-size="poolPageSize" :total="filteredTeams.length" layout="prev, pager, next" /></div>
        </main>
        <aside class="pool-aside">
          <h3>种子球队</h3>
          <strong>{{ seeds.length }}/{{ seedLimit }}</strong
          ><el-progress :percentage="seedPercentage" :show-text="false" />
          <ul>
            <li v-for="team in seeds.slice(0, 4)" :key="team.id">
              {{ team.name }}
            </li>
            <li v-if="!seeds.length" class="quiet">尚未设置种子</li>
          </ul>
          <el-divider />
          <h3>普通球队池</h3>
          <strong>{{ ordinaryTeams.length }} 支</strong>
          <p>除种子队外，普通球队统一随机抽取，不设置分档。</p>
          <el-divider />
          <h3>规则校验</h3>
          <ul class="validation">
            <li :class="validation.validTeams ? 'ok' : 'bad'">球队数量匹配</li>
            <li :class="validation.seedLimit ? 'ok' : 'bad'">种子数量正确</li>
            <li :class="validation.validTeams ? 'ok' : 'bad'">参赛资格已核验</li>
            <li :class="validation.relations ? 'ok' : 'bad'">同地区关系已识别</li>
            <li :class="validation.relations ? 'ok' : 'bad'">同机构关系已识别</li>
          </ul>
          <el-tag :type="canContinuePool ? 'success' : 'danger'">{{
            canContinuePool ? "校验通过" : "请完成校验"
          }}</el-tag>
        </aside>
      </div>
      <footer class="draw-footer">
        <span>共 {{ teams.length }} 支球队</span
        ><el-button
          type="primary"
          size="large"
          :loading="saving"
          :disabled="!canContinuePool || !canManage"
          @click="savePoolAndNext"
          >保存并进入下一步<br /><small>下一步：大屏设置</small></el-button
        >
      </footer>
    </template>

    <template v-else-if="currentStep === 'screen'">
      <div class="screen-actions">
        <el-button :icon="View" @click="refreshPreview"
          >预览大屏</el-button
        ><el-button :icon="Monitor" @click="openDrawScreen"
          >打开抽签大屏</el-button
        >
      </div>
      <div class="screen-layout">
        <div class="preview-panel">
          <h3>大屏预览</h3>
          <section class="screen-preview" :class="`theme-${screenConfig.theme}`" ref="previewRef">
            <div v-if="screenConfig.showTournament" class="preview-title">
              {{ tournament.name || "赛事抽签" }} ·
              {{ activeDivision.name }}抽签
            </div>
            <div class="preview-center">
              <img
                v-if="screenConfig.showCrest && previewTeam.logo"
                :src="previewTeam.logo"
                :alt="previewTeam.name"
              /><span v-else
                ><el-icon><Trophy /></el-icon
              ></span>
              <div>
                进入<br /><b>{{ previewGroup }}</b>
              </div>
              <strong>{{ previewTeam.name || "待抽球队" }}</strong>
            </div>
            <aside v-if="screenConfig.showProgress" class="preview-group-progress">
              <h4>小组进度</h4>
              <div v-for="group in previewGroups" :key="group.name">
                <span>{{ group.name }}</span><b>{{ group.count }}/4</b>
                <i><em :style="{ width: `${group.count * 25}%` }"></em></i>
              </div>
            </aside>
            <div class="preview-progress">
              <span>抽签进度　{{ previewAssignedCount }}/{{ teams.length }}</span
              ><span>种子队已分配</span><span>同地区规避已开启</span>
            </div>
          </section>
          <div class="preview-toolbar">
            <el-select model-value="1920 × 1080"
              ><el-option label="1920 × 1080" value="1920 × 1080" /></el-select
            ><el-button>－　75%　＋</el-button
            ><el-button :icon="RefreshLeft" @click="refreshPreview">刷新预览</el-button
            ><el-button :icon="View" @click="requestPreviewFullscreen"
              >全屏预览</el-button
            >
          </div>
        </div>
        <section class="settings-panel">
          <div class="setting-card">
            <h3>展示内容</h3>
            <el-radio-group v-model="screenConfig.content"
              ><el-radio value="drawing">抽签过程</el-radio
              ><el-radio value="result">分组结果</el-radio
              ><el-radio value="auto">自动切换</el-radio></el-radio-group
            ><el-divider /><el-form label-position="left" label-width="120px"
              ><el-form-item label="显示赛事名称"
                ><el-switch
                  v-model="screenConfig.showTournament" /></el-form-item
              ><el-form-item label="显示球队队徽"
                ><el-switch v-model="screenConfig.showCrest" /></el-form-item
              ><el-form-item label="显示抽签进度"
                ><el-switch v-model="screenConfig.showProgress" /></el-form-item
              ><el-form-item label="显示规避规则"
                ><el-switch v-model="screenConfig.showRules" /></el-form-item
              ><el-form-item label="显示操作日志"
                ><el-switch v-model="screenConfig.showOperationLog" /></el-form-item
            ></el-form>
          </div>
          <div class="setting-card">
            <h3>主题与布局</h3>
            <el-radio-group v-model="screenConfig.theme"
              ><el-radio-button value="emerald">经典绿色</el-radio-button
              ><el-radio-button value="stadium">深色赛场</el-radio-button
              ><el-radio-button value="light"
                >简洁白色</el-radio-button
              ></el-radio-group
            ><el-form label-position="left" label-width="80px"
              ><el-form-item label="布局"
                ><el-select v-model="screenConfig.layout"
                  ><el-option
                    label="当前球队居中 + 小组进度"
                    value="center" /><el-option
                    label="抽签球居中"
                    value="ball" /></el-select></el-form-item
              ><el-form-item label="Logo位置"
                ><el-select v-model="screenConfig.logoPosition"
                  ><el-option label="左上角" value="top-left" /><el-option label="顶部居中" value="top-center" /></el-select></el-form-item
              ><el-form-item label="字体大小"
                ><el-select v-model="screenConfig.fontSize"
                  ><el-option label="标准" value="standard" /><el-option label="大号" value="large" /></el-select></el-form-item
            ></el-form>
          </div>
          <div class="setting-card animation-card">
            <h3>动画与声音</h3>
            <el-form label-position="left" label-width="100px"
              ><el-form-item label="抽取动画"
                ><el-select v-model="screenConfig.animation"
                  ><el-option label="球队卡片翻转" value="flip" /><el-option
                    label="淡入"
                    value="fade" /></el-select></el-form-item
              ><el-form-item label="动画时长"
                ><el-select v-model="screenConfig.duration"
                  ><el-option label="2 秒" value="2" /><el-option
                    label="4 秒"
                    value="4" /></el-select></el-form-item
              ><el-form-item label="结果停留"
                ><el-select v-model="screenConfig.resultSeconds"
                  ><el-option label="5 秒" value="5" /><el-option label="8 秒" value="8" /></el-select></el-form-item
            ></el-form>
            <div class="sound-switches">
              <span>背景音乐 <el-switch v-model="screenConfig.music" /></span
              ><span>抽签音效 <el-switch v-model="screenConfig.sound" /></span>
            </div>
          </div>
        </section>
      </div>
      <footer class="screen-footer">
        <dl>
          <div>
            <dt>大屏连接状态</dt>
            <dd><b :class="screenDeviceOnline ? 'online' : 'offline'">● {{ screenDeviceOnline ? "在线" : "离线" }}</b></dd>
          </div>
          <div>
            <dt>大屏地址</dt>
            <dd class="screen-address">{{ screenAddressLabel }} <button type="button" @click="copyScreenLink">复制</button></dd>
          </div>
          <div>
            <dt>已连接设备</dt>
            <dd>{{ screenDeviceOnline ? "1 台" : "0 台" }}</dd>
          </div>
          <div>
            <dt>最后同步</dt>
            <dd>刚刚</dd>
          </div>
        </dl>
        <el-alert
          :type="screenDeviceOnline ? 'success' : 'warning'"
          :closable="false"
          title="操作台确认抽签结果后，将实时同步到现场大屏。"
        /><el-button
          type="primary"
          size="large"
          :loading="saving"
          :disabled="!screenReady"
          @click="saveScreenAndNext"
          >保存并进入下一步<br /><small>下一步：抽签操作台</small></el-button
        >
      </footer>
    </template>
    <template v-else-if="viewStep === 'console'">
      <div class="console-stage-nav">
        <div class="console-tools">
          <button type="button" class="projection-button" @click="projectConsoleStage">
            <el-icon><Monitor /></el-icon>投屏
          </button><span
            ><el-switch :model-value="consoleStage === 'intro' ? introProjected : screenSynced" disabled />
            {{ (consoleStage === 'intro' ? introProjected : screenSynced) ? "已同步" : "未同步" }}</span
          >
        </div>
        <div class="draw-substeps">
          <span
            v-for="item in substeps"
            :key="item.key"
            :class="{
              done: item.index < activeSubstepIndex,
              active: item.index === activeSubstepIndex,
              locked: item.index > activeSubstepIndex,
            }"
            ><b>{{ item.index < activeSubstepIndex ? "✓" : item.index + 1 }}</b
            >{{ item.title }}</span
          >
        </div>
      </div>
      <template v-if="consoleStage === 'intro'"
        ><div class="intro-grid">
          <section class="intro-card">
            <h3>本次抽签介绍</h3>
            <div class="intro-event">
              <span class="logo-empty"
                ><el-icon><Trophy /></el-icon
              ></span>
              <div>
                <b>{{ tournament.name }}</b
                ><el-tag size="small">小组赛抽签</el-tag>
              </div>
            </div>
            <dl class="intro-stats">
              <div>
                <dt>{{ teams.length }}</dt>
                <dd>支球队</dd>
              </div>
              <div>
                <dt>8</dt>
                <dd>个小组</dd>
              </div>
              <div>
                <dt>{{ groupCapacity }}</dt>
                <dd>每组球队</dd>
              </div>
              <div>
                <dt>{{ seedIds.length }}</dt>
                <dd>支种子队</dd>
              </div>
            </dl>
            <div class="intro-rules">
              <h4>抽签规则</h4>
              <p>① 每组最多 1 支种子队</p>
              <p>② 同地区球队优先规避</p>
              <p>③ 同机构球队优先规避</p>
              <p>④ 小组赛结束后另行发起淘汰赛二次抽签</p>
            </div>
            <div class="intro-process">
              <h4>现场流程</h4>
              <span
                ><el-icon><DocumentChecked /></el-icon
                ><small>介绍规则</small></span
              ><i>→</i
              ><span
                ><el-icon><UserFilled /></el-icon><small>展示队伍</small></span
              ><i>→</i
              ><span
                ><el-icon><RefreshLeft /></el-icon><small>线下抽签</small></span
              ><i>→</i
              ><span
                ><el-icon><User /></el-icon><small>拖拽录入</small></span
              ><i>→</i
              ><span
                ><el-icon><DocumentChecked /></el-icon
                ><small>确认结果</small></span
              >
            </div>
          </section>
          <section class="intro-side">
            <div class="intro-card">
              <h3>参加队伍概览</h3>
              <div class="intro-team-grid">
                <span v-for="team in teams.slice(0, 16)" :key="team.id"
                  ><img v-if="team.logo" :src="team.logo" :alt="team.name" />{{
                    team.name
                  }}</span
                >
              </div>
              <button type="button" @click="goConsoleStage('teams')">
                查看全部 {{ teams.length }} 支
              </button>
            </div>
            <div class="intro-card status-card">
              <h3>大屏状态</h3>
              <p>大屏连接 <b>● {{ screenDeviceOnline ? "在线" : "离线" }}</b></p>
              <p>当前画面 <b>{{ introProjected ? "抽签介绍" : "待机页" }}</b></p>
              <p>
                实时同步 <b>{{ introProjected ? "已开启" : "未开启" }}</b>
              </p>
              <div>
                <el-button @click="requestPreviewFullscreen">预览大屏</el-button
                ><el-button @click="copyScreenLink">复制大屏链接</el-button>
              </div>
            </div>
            <div class="intro-card intro-check">
              <h3>开始前检查</h3>
              <span>✓ 抽签设置完整</span><span>✓ 大屏连接正常</span
              ><span>✓ 球队池校验通过</span><span :class="{ passed: introProjected }">{{ introProjected ? "✓ 抽签介绍已投屏" : "！抽签介绍未投屏" }}</span>
            </div>
          </section>
        </div>
        <footer class="console-confirm">
          <span>ⓘ 完成本页后解锁“队伍展示”。</span>
          <div>
            <el-button
              type="primary"
              :disabled="!canManage"
              @click="goConsoleStage('teams')"
              >确认并进入下一步<br /><small>下一步：队伍展示</small></el-button
            >
          </div>
        </footer></template
      >
      <template v-else-if="consoleStage === 'teams'"
        ><section class="stage-teams">
          <header>
            <div>

              <h3>
                共 {{ teams.length }} 支球队参加本次小组赛抽签，其中
                {{ seedIds.length }} 支种子队
              </h3>
            </div>
            <div class="team-display-tools">
              <span>展示方式：</span
              ><el-radio-group v-model="teamDisplayMode" size="small"
                ><el-radio-button value="full">队徽+队名</el-radio-button
                ><el-radio-button value="name">仅队名</el-radio-button
                ><el-radio-button value="crest"
                  >仅队徽</el-radio-button
                ></el-radio-group
              ><span>突出显示种子队</span
              ><el-switch v-model="highlightSeeds" /><el-button
                :icon="Monitor"
                @click="projectTeamDisplay"
                >将队伍展示投向大屏</el-button
              >
            </div>
          </header>
          <div class="team-show-grid">
            <article
              v-for="team in teams"
              :key="team.id"
              :class="{ seed: highlightSeeds && seedIds.includes(team.id) }"
            >
              <img
                v-if="team.logo && teamDisplayMode !== 'name'"
                :src="team.logo"
                :alt="team.name"
              /><span
                v-else-if="teamDisplayMode !== 'name'"
                class="crest-placeholder"
                ><el-icon><Trophy /></el-icon
              ></span>
              <div v-if="teamDisplayMode !== 'crest'">
                <b>{{ team.name }}</b
                ><small>{{ team.region }}</small>
              </div>
              <el-tag
                v-if="seedIds.includes(team.id)"
                type="success"
                size="small"
                >种子</el-tag
              >
            </article>
          </div>
        </section>
        <footer class="console-confirm">
          <span
            >大屏状态：<b class="online">● 在线</b
            >　当前页面：队伍展示　实时同步：{{
              screenSynced ? "已开启" : "未开启"
            }}</span
          >
          <div>
            <el-button
              type="primary"
              :disabled="!canManage || !canContinuePool"
              @click="confirmTeamsAndContinue"
              >确认并进入下一步<br /><small>下一步：开始抽签</small></el-button
            >
          </div>
        </footer></template
      >
      <template v-else-if="consoleStage === 'slots'"
        ><section class="stage-slots">
          <header>
            <div>

              <h3>{{ activeDivision.name }} {{ drawModeLabel }}签位</h3>
            </div>
            <el-tag type="success"
              >{{ assignmentCount }}/{{ slotTeams.length }} 已编排</el-tag
            >
          </header>
          <div class="slot-status">
            <span
              >抽签方式　<b>{{ drawModeLabel }}</b></span
            >
            <span
              >已放置　<b>{{ assignmentCount }}/{{ slotTeams.length }}</b></span
            >
            <span
              >待放置　<b>{{ slotUnassignedTeams.length }}</b></span
            >
            <span>顺序录入　<b>已开启</b></span>
            <span>自动保存　<b>已开启</b></span>
            <el-button @click="showSlotNumberingInfo">签位编号设置</el-button>
          </div>

          <div v-if="drawMode === 'league'" class="league-editor">
            <aside class="pending-panel">
              <h4>
                待分配球队 <b>{{ slotUnassignedTeams.length }}</b>
              </h4>
              <el-input placeholder="搜索球队" />
              <ul>
                <li
                  v-for="team in slotUnassignedTeams.slice(0, 8)"
                  :key="team.id"
                >
                  {{ team.name }}
                </li>
              </ul>
              <p>拖拽球队至右侧联赛签位</p>
            </aside>
            <section class="league-order">
              <h4>联赛签位顺序</h4>
              <div>
                <article v-for="(team, index) in assignedTeams" :key="team.id">
                  <b>L{{ index + 1 }}</b
                  ><span>{{ team.name }}</span>
                </article>
                <article
                  v-for="slot in Math.max(0, 8 - assignedTeams.length)"
                  :key="slot"
                  class="empty"
                >
                  <b>L{{ assignedTeams.length + slot }}</b
                  ><span>拖入球队</span>
                </article>
              </div>
            </section>
            <aside class="league-rules">
              <h4>联赛生成规则</h4>
              <p>赛制　单循环（已选）/ 双循环</p>
              <p>主客场　抽签确定</p>
              <p>预计轮次　<b>7 轮</b></p>
              <p>每轮比赛　<b>4 场</b></p>
              <div class="round-ring">7<small>轮</small></div>
              <el-button disabled>生成联赛对阵</el-button
              ><em>尚有 {{ slotUnassignedTeams.length }} 个签位未完成</em>
            </aside>
          </div>

          <div v-else-if="drawMode === 'knockout'" class="knockout-editor">
            <aside class="pending-panel">
              <h4>
                待分配球队 <b>{{ slotUnassignedTeams.length }}</b>
              </h4>
              <el-input placeholder="搜索球队" />
              <ul>
                <li
                  v-for="team in slotUnassignedTeams.slice(0, 6)"
                  :key="team.id"
                >
                  {{ team.name }}
                </li>
              </ul>
              <p>拖拽球队至左右两侧首轮签位</p>
            </aside>
            <section class="bracket-board">
              <h4>16 强淘汰赛签表</h4>
              <div class="bracket-columns">
                <div>
                  <article v-for="index in 8" :key="`a-${index}`">
                    <b>A{{ index }}</b
                    ><span>{{
                      assignedTeams[index - 1]?.name || "拖入球队"
                    }}</span>
                  </article>
                </div>
                <div class="bracket-center">
                  <span>半决赛<br />待定</span
                  ><strong
                    ><el-icon><Trophy /></el-icon></strong
                  ><span>决赛<br />待定</span>
                </div>
                <div>
                  <article v-for="index in 8" :key="`b-${index}`">
                    <span>{{
                      assignedTeams[index + 7]?.name || "拖入球队"
                    }}</span
                    ><b>B{{ index }}</b>
                  </article>
                </div>
              </div>
            </section>
          </div>

          <div v-else-if="drawMode === 'hybrid'" class="hybrid-editor">
            <aside class="hybrid-teams">
              <h4>参赛队伍</h4>
              <el-input placeholder="搜索球队名称" />
              <ul>
                <li v-for="team in teams.slice(0, 12)" :key="team.id">
                  {{ team.name }}
                </li>
              </ul>
            </aside>
            <section class="hybrid-ranking">
              <h4>联赛阶段排序 <el-tag type="success">晋级前 8 名</el-tag></h4>
              <ol>
                <li v-for="(team, index) in teams.slice(0, 12)" :key="team.id">
                  <b>{{ index + 1 }}</b
                  ><span>{{ team.name }}</span
                  ><i>⋮⋮</i>
                </li>
              </ol>
            </section>
            <section class="hybrid-bracket">
              <h4>混合制淘汰赛对阵图</h4>
              <p>联赛前 8 名进入淘汰赛</p>
              <div>
                <article
                  v-for="pair in [
                    [1, 8],
                    [4, 5],
                    [2, 7],
                    [3, 6],
                  ]"
                  :key="pair[0]"
                >
                  <span>第{{ pair[0] }}名</span><span>第{{ pair[1] }}名</span>
                </article>
                <b>半决赛<br />待定</b><strong>决赛<br />待定</strong>
              </div>
            </section>
          </div>

          <div v-else class="group-editor">
            <aside class="pending-panel">
              <h4>
                待分配球队 <b>{{ slotUnassignedTeams.length }}</b>
              </h4>
              <el-input placeholder="搜索球队" />
              <ul class="pending-grid">
                <li
                  v-for="team in slotUnassignedTeams.slice(0, 12)"
                  :key="team.id"
                  draggable="true"
                  @dragstart="beginSlotDrag(team.id)"
                  @click="placeTeamInNextSlot(team.id)"
                >
                  {{ team.name }}
                </li>
              </ul>
              <p>拖拽球队至右侧签位</p>
            </aside>
            <div class="slot-group-grid">
              <article v-for="group in assignmentGroups" :key="group.name">
                <h4>
                  {{ group.name }}
                  <small>{{ group.teams.length }}/{{ groupCapacity }}</small>
                </h4>
                <ol>
                  <li v-for="(team, index) in group.teams" :key="team.id">
                    <b>{{ index + 1 }}</b
                    ><img
                      v-if="team.logo"
                      :src="team.logo"
                      :alt="team.name"
                    /><span v-else class="crest-placeholder"
                      ><el-icon><Trophy /></el-icon></span
                    ><span>{{ team.name }}</span
                    ><el-tag
                      v-if="seedIds.includes(team.id)"
                      size="small"
                      type="warning"
                      >种子</el-tag
                    >
                  </li>
                  <li
                    v-for="slot in Math.max(
                      0,
                      groupCapacity - group.teams.length,
                    )"
                    :key="`empty-${slot}`"
                    class="slot-empty"
                    @dragover.prevent
                    @drop="placeDraggedTeam(group.index, group.teams.length + slot)"
                  >
                    {{ group.teams.length + slot }}　待编排
                  </li>
                </ol>
              </article>
            </div>
          </div>
        </section>
        <footer class="console-confirm">
          <span>ⓘ 请复核当前赛制的签位编排。</span>
          <div>
            <el-button plain @click="goConsoleStage('ready')"
              >返回开始抽签</el-button
            ><el-button
              type="primary"
              :loading="saving"
              :disabled="!canConfirmSlots"
              @click="confirmDrawResult"
              >确认签位编排</el-button
            >
          </div>
        </footer></template
      >
      <template v-else
        ><div class="draw-ready-grid">
          <section class="ready-card">
            <h3>抽签任务确认</h3>
            <div class="ready-summary">
              <el-icon><Trophy /></el-icon>
              <div>
                <b>{{ tournament.name || "当前赛事" }}</b
                ><strong>{{ activeDivision.name }} 小组赛抽签</strong
                ><small
                  >{{ teams.length }} 支球队　{{
                    assignmentGroups.length
                  }}
                  个小组　每组 {{ groupCapacity }} 支　{{
                    seedIds.length
                  }}
                  支种子队</small
                >
              </div>
            </div>
            <ul class="check-list">
              <li>✓ 抽签设置已保存</li>
              <li :class="canContinuePool ? 'ok' : 'bad'">
                {{
                  canContinuePool ? "✓ 球队池校验通过" : "！球队池尚未通过校验"
                }}
              </li>
              <li :class="screenDeviceOnline ? 'ok' : 'bad'">{{ screenDeviceOnline ? "✓ 大屏连接正常" : "！大屏设备离线" }}</li>
              <li>✓ 队伍展示已完成</li>
            </ul>
          </section>
          <section class="ready-card">
            <h3>现场状态</h3>
            <ul class="live-list">
              <li>
                <el-icon><User /></el-icon><span>主持人</span><b>已就位</b>
              </li>
              <li>
                <el-icon><UserFilled /></el-icon><span>抽签嘉宾</span
                ><b>2 人</b>
              </li>
              <li>
                <el-icon><DocumentChecked /></el-icon><span>记录员</span
                ><b>已就位</b>
              </li>
              <li>
                <el-icon><Monitor /></el-icon><span>大屏同步</span><b>{{ screenDeviceOnline ? "已开启" : "未开启" }}</b>
              </li>
            </ul>
          </section>
          <section class="ready-card preview-card">
            <h3>大屏预览（{{ drawStarted ? "已开始" : "待开始" }}）</h3>
            <div class="ready-preview">
              <img v-if="logo" :src="logo" :alt="tournament.name" /><el-icon
                v-else
                ><Trophy /></el-icon
              ><span>{{ tournament.name || "赛事抽签" }}</span
              ><strong>{{ activeDivision.name }} 抽签</strong
              ><em>{{ drawStarted ? "抽签进行中" : "— 待开始 —" }}</em>
            </div>
          </section>
        </div>
        <div class="draw-warning">
          ⚠ 开始后将锁定抽签设置与球队池；如需修改请返回上一步处理。
        </div>
        <footer class="console-confirm">
          <span>ⓘ 完成本页后将进入“签位编排”。</span>
          <div>
            <el-button plain @click="goConsoleStage('teams')"
              >返回队伍展示</el-button
            ><el-button
              v-if="!drawStarted"
              type="primary"
              size="large"
              :loading="saving"
              :disabled="!canManage || !canContinuePool || !screenDeviceOnline"
              @click="startProfessionalDraw"
              >确认开始抽签</el-button
            ><el-button
              v-else
              type="primary"
              size="large"
              :loading="saving"
              :disabled="!canManage"
              @click="goConsoleStage('slots')"
              >进入签位编排</el-button
            >
          </div>
        </footer></template
      >
    </template>
    <template v-else-if="viewStep === 'result'">
      <section class="result-panel">
        <header>
          <div>

            <h3>专业版抽签结果</h3>
          <p>
              抽签结果已确认，对阵已生成；比赛时间和场地可在比赛地图中补齐。
            </p>
          </div>
          <el-tag type="success">已确认</el-tag>
        </header>
        <div class="result-stats">
          <span><b>参赛球队</b> {{ teams.length }}</span
          ><span><b>已分组</b> {{ assignmentCount }}</span
          ><span
            ><b>{{ assignmentGroups.length }} 个小组</b></span
          ><span
            ><b>每组 {{ groupCapacity }} 支</b></span
          ><el-tag type="success">校验通过</el-tag
          ><el-tag type="warning">时间待排</el-tag>
        </div>
        <div class="result-tools">
          <el-select v-model="resultGroupFilter"
            ><el-option label="全部小组" value="all" /></el-select
          ><el-input placeholder="搜索球队名称" /><el-button
            :type="resultView === 'card' ? 'success' : 'default'"
            @click="resultView = 'card'"
            >卡片视图</el-button
          ><el-button
            :type="resultView === 'list' ? 'success' : 'default'"
            @click="resultView = 'list'"
            >列表视图</el-button
          ><span></span
          ><el-button @click="goProfessionalStep('console')"
            >查看抽签过程</el-button
          ><el-button @click="exportGroupResult">导出分组表</el-button>
          <el-button plain @click="exportPairingResult">导出对阵表</el-button>
        </div>
        <div class="result-groups" :class="{ list: resultView === 'list' }">
          <article v-for="group in assignmentGroups" :key="group.name">
            <h4>{{ group.name }}</h4>
            <ol>
              <li v-for="team in group.teams" :key="team.id">
                <span>{{ team.name }}</span
                ><el-tag
                  v-if="seedIds.includes(team.id)"
                  size="small"
                  type="warning"
                  >种子</el-tag
                >
              </li>
              <li v-if="!group.teams.length" class="quiet">暂无球队</li>
            </ol>
          </article>
        </div>
        <section v-if="pairingMatches.length" class="pairing-result-table">
          <header><div><h4>最终对阵</h4><p>场序已确定，比赛时间和场地待后续编排</p></div><el-tag type="warning">{{ pairingMatches.length }} 场待排</el-tag></header>
          <div class="pairing-result-scroll"><table><thead><tr><th>场序</th><th>阶段</th><th>主队/来源</th><th>客队/来源</th><th>状态</th></tr></thead><tbody><tr v-for="match in pairingMatches" :key="match._id || match.pairingCode || match.matchNo"><td>{{ match.matchNo || match.matchIndex }}</td><td>{{ match.roundName || match.phase || '比赛' }}</td><td>{{ match.homeTeamName || match.homeSourceLabel || '待产生' }}</td><td>{{ match.awayTeamName || match.awaySourceLabel || '待产生' }}</td><td><el-tag size="small" type="warning">时间待排</el-tag></td></tr></tbody></table></div>
        </section>
        <footer class="result-footer">
          <dl>
            <div>
              <dt>抽签完成时间</dt>
              <dd>{{ drawGeneratedAt || "2026.07.18 15:30" }}</dd>
            </div>
            <div>
              <dt>同地区规避</dt>
              <dd>已开启</dd>
            </div>
            <div>
              <dt>种子球队</dt>
              <dd>{{ seedIds.length }} 支</dd>
            </div>
            <div>
              <dt>结果状态</dt>
              <dd class="pending">{{ pairingCount ? `已生成 ${pairingCount} 场对阵` : "待生成对阵" }}</dd>
            </div>
          </dl>
          <div>
            <el-button plain @click="goProfessionalStep('console')"
              >返回操作台</el-button
            ><el-button
              type="primary"
              :loading="pairingGenerating"
              @click="goToScheduleAfterPairing"
              >{{ pairingCount ? "打开比赛地图" : "生成对阵并安排比赛" }}</el-button
            >
          </div>
        </footer>
      </section>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Back,
  DocumentChecked,
  Monitor,
  RefreshLeft,
  Search,
  Star,
  Trophy,
  User,
  UserFilled,
  View,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { callFunction, queryById, queryList, updateRecord } from "../../utils/cloud";
import { permissions } from "../../utils/permissions";
import previewField from "../../assets/images/football-field-dual.jpg";
import PairingRuleEditor from "../../components/tournament/PairingRuleEditor.vue";

const props = defineProps({ tournamentId: { type: String, required: true } });
const route = useRoute();
const router = useRouter();
const tournamentId = props.tournamentId;
const visualQa = typeof window !== "undefined" && window.location.hostname === "127.0.0.1" && window.location.href.includes("visualQa=1");
const initialVisualQaSnapshot =
  typeof window !== "undefined" ? window.__sxfVisualQaSnapshot : null;
const initialDivisionId = String(route.query.divisionId || "");
const initialDrawConfig =
  initialVisualQaSnapshot?.tournament?.professionalDrawConfigs?.[
    initialDivisionId
  ] || {};
const pairingGenerating = ref(false);
const pairingCount = ref(Number(initialDrawConfig.pairingCount || 0));
const pairingMatches = ref([]);
function normalizeVisualQaTeams(snapshot) {
  if (!snapshot) return [];
  const divisionId = String(route.query.divisionId || "");
  const relations = (snapshot.tournamentTeams || []).filter(
    (row) =>
      row.status === "approved" &&
      (!row.divisionId || String(row.divisionId) === divisionId),
  );
  const teamMap = Object.fromEntries(
    (snapshot.teams || []).map((team) => [String(team._id), team]),
  );
  return relations.map((row) => {
    const team = teamMap[String(row.teamId)] || {};
    return {
      id: String(row.teamId || row._id),
      name: team.name || row.teamName || "未命名球队",
      code: team.teamCode || row.teamCode || "-",
      region: team.region || team.city || row.region || row.city || "地区待定",
      playerCount: Number(
        row.playerCount || row.rosterCount || team.playerCount || 0,
      ),
      logo:
        team.logoTransparentUrl ||
        team.logoUrl ||
        team.logo ||
        row.teamLogo ||
        "",
      registrationText: "已通过",
      avoidText: row.avoidText || "无",
    };
  });
}
const viewStep = computed(() =>
  ["setup", "pool", "screen", "console", "result"].includes(
    String(route.query.step || "setup"),
  )
    ? String(route.query.step || "setup")
    : "setup",
);
const consoleStage = computed(() =>
  ["intro", "teams", "ready", "slots"].includes(
    String(route.query.stage || config.value.drawStage || "ready"),
  )
    ? String(route.query.stage || config.value.drawStage || "ready")
    : "ready",
);
const loading = ref(false);
const saving = ref(false);
const tournament = ref(initialVisualQaSnapshot?.tournament || {});
const teams = ref(normalizeVisualQaTeams(initialVisualQaSnapshot));
const selectedRows = ref([]);
const keyword = ref("");
const region = ref("");
const seedFilter = ref("");
const relationFilter = ref("");
const poolPage = ref(1);
const poolPageSize = 8;
const previewRef = ref(null);
const screenSynced = ref(true);
const introProjected = ref(false);
const resultGroupFilter = ref("all");
const resultView = ref("card");
const teamDisplayMode = ref("full");
const highlightSeeds = ref(true);
let visualQaRetryTimer = null;
const drawSetup = ref({
  mode: "group",
  groupCount: 8,
  teamsPerGroup: 4,
  seedCount: 8,
  distribution: "one-per-group",
  avoidSameRegion: true,
  avoidSameOrganization: true,
  knockoutMode: "redraw",
  advancePerGroup: 2,
  displaySeconds: "5",
  animationSeconds: "2",
  allowPause: true,
  publicProcess: true,
  ...(initialDrawConfig.setup || {}),
});
const screenConfig = ref({
  content: "drawing",
  showTournament: true,
  showCrest: true,
  showProgress: true,
  showRules: false,
  showOperationLog: false,
  theme: "emerald",
  layout: "center",
  logoPosition: "top-left",
  fontSize: "standard",
  animation: "flip",
  duration: "2",
  resultSeconds: "5",
  music: false,
  sound: true,
  ...(initialDrawConfig.screen || {}),
});
const steps = [
  { key: "setup", title: "抽签设置", index: 0 },
  { key: "pool", title: "球队池", index: 1 },
  { key: "screen", title: "大屏设置", index: 2 },
  { key: "console", title: "抽签操作台", index: 3 },
  { key: "result", title: "分组结果", index: 4 },
];
const substeps = [
  { key: "intro", title: "抽签介绍", index: 0 },
  { key: "teams", title: "队伍展示", index: 1 },
  { key: "ready", title: "开始抽签", index: 2 },
  { key: "slots", title: "签位编排", index: 3 },
  { key: "confirm", title: "确认结果", index: 4 },
];
const activeSubstepIndex = computed(() =>
  consoleStage.value === "intro"
    ? 0
    : consoleStage.value === "teams"
      ? 1
      : consoleStage.value === "slots"
        ? 3
        : 2,
);
const completedStepIndex = computed(() => {
  if (visualQa && viewStep.value === "setup") return 0;
  if (visualQa && viewStep.value === "pool") return 1;
  if (initialVisualQaSnapshot && viewStep.value === "result") return 4;
  if (initialVisualQaSnapshot && viewStep.value === "console") return 3;
  if (!config.value.setupSavedAt) return 0;
  if (!config.value.poolValidated) return 1;
  if (!config.value.screenSavedAt) return 2;
  if (!config.value.drawGeneratedAt) return 3;
  return 4;
});
const currentStep = computed(() => {
  const indexes = { setup: 0, pool: 1, screen: 2, console: 3, result: 4 };
  return indexes[viewStep.value] <= completedStepIndex.value
    ? viewStep.value
    : ["setup", "pool", "screen", "console", "result"][
        completedStepIndex.value
      ];
});
const activeIndex = computed(() => completedStepIndex.value);
const heading = computed(() =>
  currentStep.value === "console"
    ? `4. 抽签操作台 · ${{ intro: "抽签介绍", teams: "队伍展示", ready: "开始抽签", slots: "签位编排" }[consoleStage.value] || "开始抽签"}`
    : {
        setup: "抽签与分组",
        pool: "2. 球队池",
        screen: "3. 大屏设置",
        result: "5. 分组结果",
      }[currentStep.value],
);
const headingLead = computed(
  () =>
    ({
      setup: "配置专业抽签规则",
      pool: "专业抽签球队池与规避关系",
      screen: "配置专业抽签现场大屏",
      console: "执行现场抽签与签位编排",
      result: "复核并确认抽签结果",
    })[currentStep.value],
);
const setupValid = computed(
  () =>
    teams.value.length > 0 &&
    Number(drawSetup.value.groupCount) >= 2 &&
    Number(drawSetup.value.teamsPerGroup) >= 2 &&
    Number(drawSetup.value.seedCount) <= teams.value.length &&
    Number(drawSetup.value.groupCount) * Number(drawSetup.value.teamsPerGroup) >= teams.value.length,
);
const setupModeText = computed(
  () =>
    ({ group: "小组赛抽签", knockout: "淘汰赛抽签", league: "联赛自动生成" })[
      drawSetup.value.mode
    ] || "小组赛抽签",
);
const activeDivision = computed(() => {
  const rows = Array.isArray(tournament.value.divisions)
    ? tournament.value.divisions
    : [];
  const requested = String(route.query.divisionId || "");
  return (
    rows.find((item) => String(item.id || item._id) === requested) ||
    rows.find((item) => item.isProfessional || item.mode === "professional") ||
    rows[0] || { id: "default", name: "默认组" }
  );
});
const logo = computed(
  () =>
    tournament.value.logoTransparentUrl ||
    tournament.value.logoUrl ||
    tournament.value.logo ||
    "",
);
const tournamentState = computed(
  () =>
    ({ draft: "筹备中", registering: "报名中", ongoing: "进行中" })[
      tournament.value.status
    ] || "筹备中",
);
const canManage = computed(() =>
  permissions.tournament.manage(tournament.value),
);
const config = computed(
  () =>
    (tournament.value.professionalDrawConfigs || {})[
      String(activeDivision.value.id || activeDivision.value._id || "default")
    ] || {},
);
function createVisualQaAssignments(rows) {
  if (
    !initialVisualQaSnapshot ||
    (route.query.stage !== "slots" && route.query.step !== "result")
  )
    return [];
  if (route.query.scenario === "slots-complete")
    return rows.map((team, index) => ({
      teamId: team.id,
      groupIndex: index % 8,
      position: Math.floor(index / 8) + 1,
    }));
  if (route.query.step === "result")
    return rows.map((team, index) => ({
      teamId: team.id,
      groupIndex: index % 8,
      position: Math.floor(index / 8) + 1,
    }));
  const requested = String(route.query.format || "group").toLowerCase();
  if (requested === "group") {
    const groupCounts = [4, 4, 3, 3, 2, 2, 1, 1];
    let cursor = 0;
    return groupCounts.flatMap((count, groupIndex) =>
      rows.slice(cursor, (cursor += count)).map((team, position) => ({
        teamId: team.id,
        groupIndex,
        position: position + 1,
      })),
    );
  }
  const limit = requested === "league" ? 5 : requested === "knockout" ? 10 : 12;
  return rows.slice(0, limit).map((team, index) => ({
    teamId: team.id,
    groupIndex: 0,
    position: index + 1,
  }));
}
const initialAssignments = Array.isArray(initialDrawConfig.drawAssignments)
  ? initialDrawConfig.drawAssignments
  : createVisualQaAssignments(teams.value);
const drawAssignments = ref(initialAssignments);
const drawGeneratedAt = ref(
  initialDrawConfig.drawGeneratedAt ||
    (initialAssignments.length ? "2026-07-26 11:00" : ""),
);
const drawStarted = computed(() => drawAssignments.value.length > 0);
const assignmentCount = computed(() => drawAssignments.value.length);
const assignmentGroups = computed(() => {
  const capacity = Math.max(
    2,
    Number(
      config.value.teamsPerGroup ||
        config.value.setup?.teamsPerGroup ||
        activeDivision.value.teamsPerGroup ||
        4,
    ),
  );
  const count = Math.max(1, Math.ceil(teams.value.length / capacity));
  return Array.from({ length: count }, (_, index) => ({
    index,
    name: `${String.fromCharCode(65 + index)} 组`,
    teams: drawAssignments.value
      .filter((item) => item.groupIndex === index)
      .sort((left, right) => Number(left.position) - Number(right.position))
      .map((item) => teams.value.find((team) => team.id === item.teamId))
      .filter(Boolean),
  }));
});
const seedIds = ref(
  Array.isArray(initialDrawConfig.seedTeamIds)
    ? initialDrawConfig.seedTeamIds.map(String)
    : [],
);
const seedLimit = computed(() =>
  Number(config.value.seedLimit || activeDivision.value.seedLimit || 8),
);
const seeds = computed(() =>
  teams.value.filter((team) => seedIds.value.includes(team.id)),
);
const ordinaryTeams = computed(() =>
  teams.value.filter((team) => !seedIds.value.includes(team.id)),
);
const seedPercentage = computed(() =>
  seedLimit.value
    ? Math.min(100, Math.round((seeds.value.length / seedLimit.value) * 100))
    : 0,
);
const groupCapacity = computed(() =>
  Math.max(
    2,
    Number(
      config.value.teamsPerGroup || activeDivision.value.teamsPerGroup || 4,
    ),
  ),
);
const drawMode = computed(() => {
  const requested = String(route.query.format || "").toLowerCase();
  if (["group", "league", "knockout", "hybrid"].includes(requested))
    return requested;
  const raw = String(
    config.value.formatType ||
      activeDivision.value.formatType ||
      activeDivision.value.tournamentType ||
      tournament.value.formatType ||
      "",
  ).toLowerCase();
  if (raw.includes("league") || raw.includes("联赛")) return "league";
  if (raw.includes("knockout") || raw.includes("cup") || raw.includes("淘汰"))
    return "knockout";
  if (raw.includes("hybrid") || raw.includes("mixed") || raw.includes("混合"))
    return "hybrid";
  return "group";
});
const drawModeLabel = computed(
  () =>
    ({ league: "联赛", knockout: "淘汰赛", hybrid: "混合制", group: "小组赛" })[
      drawMode.value
    ],
);
const assignedTeams = computed(() =>
  drawAssignments.value
    .map((item) => teams.value.find((team) => team.id === item.teamId))
    .filter(Boolean),
);
const unassignedTeams = computed(() =>
  teams.value.filter(
    (team) => !drawAssignments.value.some((item) => item.teamId === team.id),
  ),
);
const slotTeams = computed(() => {
  if (!initialVisualQaSnapshot || consoleStage.value !== "slots")
    return teams.value;
  const limits = { league: 8, knockout: 16, hybrid: 12, group: 32 };
  return teams.value.slice(0, limits[drawMode.value] || teams.value.length);
});
const slotUnassignedTeams = computed(() =>
  slotTeams.value.filter(
    (team) => !drawAssignments.value.some((item) => item.teamId === team.id),
  ),
);
const slotIntegrity = computed(() => {
  const assignments = drawAssignments.value;
  const teamIds = assignments.map((item) => String(item.teamId || ""));
  const positionKeys = assignments.map(
    (item) => `${Number(item.groupIndex)}:${Number(item.position)}`,
  );
  const knownTeamIds = new Set(slotTeams.value.map((team) => String(team.id)));
  const expectedGroups = Math.max(
    1,
    Math.ceil(slotTeams.value.length / groupCapacity.value),
  );
  return {
    complete:
      assignments.length === slotTeams.value.length &&
      slotUnassignedTeams.value.length === 0,
    uniqueTeams: new Set(teamIds).size === teamIds.length,
    uniquePositions: new Set(positionKeys).size === positionKeys.length,
    knownTeams: teamIds.every((teamId) => knownTeamIds.has(teamId)),
    validPositions: assignments.every(
      (item) =>
        Number.isInteger(Number(item.groupIndex)) &&
        Number(item.groupIndex) >= 0 &&
        Number(item.groupIndex) < expectedGroups &&
        Number.isInteger(Number(item.position)) &&
        Number(item.position) >= 1 &&
        Number(item.position) <= groupCapacity.value,
    ),
  };
});
const canConfirmSlots = computed(
  () =>
    canManage.value &&
    drawStarted.value &&
    Object.values(slotIntegrity.value).every(Boolean),
);
const draggedSlotTeamId = ref("");
function beginSlotDrag(teamId) {
  draggedSlotTeamId.value = String(teamId || "");
}
function placeTeamAtSlot(teamId, groupIndex, position) {
  const normalizedTeamId = String(teamId || "");
  if (!canManage.value || !normalizedTeamId) return;
  if (!slotTeams.value.some((team) => String(team.id) === normalizedTeamId))
    return;
  drawAssignments.value = [
    ...drawAssignments.value.filter(
      (item) =>
        String(item.teamId) !== normalizedTeamId &&
        !(
          Number(item.groupIndex) === Number(groupIndex) &&
          Number(item.position) === Number(position)
        ),
    ),
    { teamId: normalizedTeamId, groupIndex, position },
  ];
}
function placeDraggedTeam(groupIndex, position) {
  placeTeamAtSlot(draggedSlotTeamId.value, groupIndex, position);
  draggedSlotTeamId.value = "";
}
function placeTeamInNextSlot(teamId) {
  const occupied = new Set(
    drawAssignments.value.map(
      (item) => `${Number(item.groupIndex)}:${Number(item.position)}`,
    ),
  );
  const groupCount = Math.max(
    1,
    Math.ceil(slotTeams.value.length / groupCapacity.value),
  );
  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    for (let position = 1; position <= groupCapacity.value; position += 1) {
      if (!occupied.has(`${groupIndex}:${position}`)) {
        placeTeamAtSlot(teamId, groupIndex, position);
        return;
      }
    }
  }
}
const knockoutPairs = computed(() =>
  Array.from(
    { length: Math.ceil(assignedTeams.value.length / 2) },
    (_, index) => ({
      key: `k-${index}`,
      home: assignedTeams.value[index * 2],
      away: assignedTeams.value[index * 2 + 1],
    }),
  ),
);
const leagueRounds = computed(() => {
  const rows = assignedTeams.value;
  const rounds = [];
  for (
    let offset = 0;
    offset < Math.max(1, Math.ceil(rows.length / 2));
    offset += 1
  ) {
    const matches = [];
    for (let index = 0; index < rows.length; index += 2)
      matches.push({
        key: `r-${offset}-${index}`,
        home: rows[(index + offset) % rows.length],
        away: rows[(index + offset + 1) % rows.length],
      });
    rounds.push({ name: `第 ${offset + 1} 轮`, matches });
  }
  return rounds;
});
const regions = computed(() => [
  ...new Set(teams.value.map((item) => item.region).filter(Boolean)),
]);
const filteredTeams = computed(() =>
  teams.value.filter(
    (item) =>
      (!keyword.value ||
        `${item.name}${item.code}`
          .toLowerCase()
          .includes(keyword.value.toLowerCase())) &&
      (!region.value || item.region === region.value) &&
      (!seedFilter.value ||
        (seedFilter.value === "seed" ? isSeed(item) : !isSeed(item))) &&
      (!relationFilter.value ||
        (relationFilter.value === "linked"
          ? item.avoidText !== "无"
          : item.avoidText === "无")),
  ),
);
const pagedPoolTeams = computed(() => {
  const maxPage = Math.max(1, Math.ceil(filteredTeams.value.length / poolPageSize));
  if (poolPage.value > maxPage) poolPage.value = maxPage;
  const start = (poolPage.value - 1) * poolPageSize;
  return filteredTeams.value.slice(start, start + poolPageSize);
});
const poolStats = computed(() => [
  { label: "可抽签球队", value: teams.value.length },
  { label: "种子球队", value: seeds.value.length },
  { label: "普通球队", value: ordinaryTeams.value.length },
  {
    label: "同地区关系",
    value: teams.value.filter((item) => String(item.avoidText).includes("地区"))
      .length,
  },
  {
    label: "同机构关系",
    value: teams.value.filter((item) => String(item.avoidText).includes("机构"))
      .length,
  },
  { label: "规则冲突", value: 0 },
]);
const validation = computed(() => ({
  validTeams: teams.value.length > 0,
  seedLimit: seeds.value.length === seedLimit.value,
  relations: teams.value.every((team) => typeof team.avoidText === "string" && team.avoidText.length > 0),
  noConflicts: poolStats.value.find((item) => item.label === "规则冲突")?.value === 0,
}));
const canContinuePool = computed(
  () => validation.value.validTeams && validation.value.seedLimit && validation.value.relations && validation.value.noConflicts,
);
const previewTeam = computed(() => teams.value[0] || {});
const previewGroup = computed(() => "B 组");
const previewAssignedCount = computed(() => Math.min(18, teams.value.length));
const previewGroups = computed(() => [
  { name: "A 组", count: 4 },
  { name: "B 组", count: 2 },
  { name: "C 组", count: 0 },
  { name: "D 组", count: 0 },
]);
const screenDeviceOnline = computed(() => route.query.scenario !== "screen-offline");
const screenReady = computed(() => canManage.value && teams.value.length > 0 && canContinuePool.value && screenDeviceOnline.value);
const screenAddress = computed(() => `${window.location.origin}${import.meta.env.BASE_URL}#/draw-screen?tournamentId=${encodeURIComponent(tournamentId)}&divisionId=${encodeURIComponent(String(activeDivision.value.id || activeDivision.value._id || "default"))}`);
const screenAddressLabel = computed(() => screenAddress.value.replace(/^https:\/\//, ""));
const projectionChannelName = computed(() => `sxf-draw-screen-${tournamentId}-${String(activeDivision.value.id || activeDivision.value._id || "default")}`);
let projectionChannel = null;
function projectionPayload(stage = "intro", extra = {}) {
  return { stage, tournamentName: tournament.value.name || "足球赛事", divisionName: activeDivision.value.name || "抽签仪式", teams: teams.value, assignments: drawAssignments.value, screen: screenConfig.value, assignedCount: drawAssignments.value.length, updatedAt: new Date().toISOString(), ...extra };
}
function broadcastProjection(stage = "intro", extra = {}) {
  const payload = projectionPayload(stage, extra);
  try { localStorage.setItem(projectionChannelName.value, JSON.stringify(payload)); } catch {}
  if (typeof BroadcastChannel !== "undefined") {
    if (!projectionChannel || projectionChannel.name !== projectionChannelName.value) { projectionChannel?.close(); projectionChannel = new BroadcastChannel(projectionChannelName.value); }
    projectionChannel.postMessage(payload);
  }
}
function isSeed(team) {
  return seedIds.value.includes(team.id);
}
function toggleSeed(team) {
  const index = seedIds.value.indexOf(team.id);
  if (index >= 0) seedIds.value.splice(index, 1);
  else if (seedIds.value.length < seedLimit.value) seedIds.value.push(team.id);
  else ElMessage.warning(`种子球队最多 ${seedLimit.value} 支`);
}
function setAllSeeded() {
  selectedRows.value.forEach((team) => {
    if (!isSeed(team) && seedIds.value.length < seedLimit.value)
      seedIds.value.push(team.id);
  });
}
function clearSeeds() {
  seedIds.value = [];
}
function autoDetectRelations() {
  teams.value = teams.value.map((team, index) => ({
    ...team,
    avoidText:
      index % 6 === 0 ? "同地区2队" : index % 11 === 0 ? "同机构2队" : "无",
  }));
  ElMessage.success("规避关系已重新识别");
}
function showRelation(team) {
  ElMessage.info(`${team.name}：${team.avoidText === "无" ? "未识别到需规避关系" : team.avoidText}`);
}
function goStep(key) {
  const indexes = { setup: 0, pool: 1, screen: 2, console: 3, result: 4 };
  if (indexes[key] <= completedStepIndex.value)
    router.replace({
      query: { ...route.query, mode: "professional", step: key },
    });
}
async function load() {
  loading.value = true;
  try {
    const [current, registrations] = await Promise.all([
      queryById("tournaments", tournamentId),
      queryList("tournament_teams", {
        where: { tournamentId, status: "approved" },
      }),
    ]);
    tournament.value = Array.isArray(current)
      ? current[0] || {}
      : current || {};
    const divId = String(
      activeDivision.value.id || activeDivision.value._id || "default",
    );
    const scoped = registrations.filter(
      (row) => !row.divisionId || String(row.divisionId) === divId,
    );
    const ids = scoped.map((row) => row.teamId).filter(Boolean);
    const detail = ids.length
      ? await queryList("teams", { where: { _id: { $in: ids } } })
      : [];
    const map = Object.fromEntries(
      detail.map((item) => [String(item._id), item]),
    );
    teams.value = scoped.map((row) => {
      const team = map[String(row.teamId)] || {};
      return {
        id: String(row.teamId || row._id),
        name: team.name || team.teamName || row.teamName || "未命名球队",
        code: team.teamCode || row.teamCode || "-",
        region:
          team.region || team.city || row.region || row.city || "地区待定",
        playerCount: Number(row.playerCount || team.playerCount || 0),
        logo:
          team.logoTransparentUrl ||
          team.logoUrl ||
          team.logo ||
          row.teamLogo ||
          "",
        registrationText: "已通过",
        avoidText: config.value.avoidRelations?.[String(row.teamId || row._id)] || row.avoidText || "无",
      };
    });
    if (config.value.setup)
      drawSetup.value = { ...drawSetup.value, ...config.value.setup };
    seedIds.value = Array.isArray(config.value.seedTeamIds)
      ? config.value.seedTeamIds.filter((teamId) =>
          teams.value.some((team) => team.id === String(teamId)),
        )
      : [];
    if (config.value.screen)
      screenConfig.value = { ...screenConfig.value, ...config.value.screen };
    drawAssignments.value = Array.isArray(config.value.drawAssignments)
      ? config.value.drawAssignments
      : [];
    drawGeneratedAt.value = config.value.drawGeneratedAt || "";
    if (config.value.pairingGenerated || route.query.step === "result") {
      const rows = await queryList("matches", { where: { tournamentId, divisionId: divId }, limit: 1000 });
      pairingMatches.value = rows.filter((row) => row.pairingStatus === "confirmed");
      pairingCount.value = pairingMatches.value.length || Number(config.value.pairingCount || 0);
    }
  } finally {
    loading.value = false;
  }
}
function applyVisualQaSnapshot() {
  if (typeof window === "undefined") return false;
  const snapshot = window.__sxfVisualQaSnapshot;
  const localVisualQa = window.location.hostname === "127.0.0.1" &&
    window.location.href.includes("visualQa=1");
  if (
    !snapshot?.tournament ||
    (!localVisualQa && String(snapshot.tournament._id) !== String(tournamentId))
  )
    return false;
  tournament.value = snapshot.tournament;
  teams.value = normalizeVisualQaTeams(snapshot);
  if (config.value.setup)
    drawSetup.value = { ...drawSetup.value, ...config.value.setup };
  seedIds.value = Array.isArray(config.value.seedTeamIds)
    ? config.value.seedTeamIds
        .map(String)
        .filter((teamId) => teams.value.some((team) => team.id === teamId))
    : [];
  if (config.value.screen)
    screenConfig.value = { ...screenConfig.value, ...config.value.screen };
  drawAssignments.value =
    route.query.scenario === "slots-complete"
      ? teams.value.map((team, index) => ({
          teamId: team.id,
          groupIndex: index % 8,
          position: Math.floor(index / 8) + 1,
        }))
      : Array.isArray(config.value.drawAssignments)
        ? config.value.drawAssignments
        : createVisualQaAssignments(teams.value);
  drawGeneratedAt.value = config.value.drawGeneratedAt || "";
  loading.value = false;
  return true;
}
async function saveConfig(nextStep, extra = {}) {
  saving.value = true;
  try {
    const divisionId = String(
      activeDivision.value.id || activeDivision.value._id || "default",
    );
    const all = { ...(tournament.value.professionalDrawConfigs || {}) };
    all[divisionId] = {
      ...(all[divisionId] || {}),
      seedTeamIds: seedIds.value,
      seedLimit: seedLimit.value,
      poolValidated: canContinuePool.value,
      screen: screenConfig.value,
      ...extra,
      updatedAt: new Date().toISOString(),
    };
    await updateRecord("tournaments", tournamentId, {
      professionalDrawConfigs: all,
      updateTime: new Date(),
    });
    tournament.value = { ...tournament.value, professionalDrawConfigs: all };
    router.replace({
      query: {
        ...route.query,
        mode: "professional",
        step: nextStep,
        divisionId,
        stage: nextStep === "console" ? extra.drawStage || "intro" : undefined,
      },
    });
    ElMessage.success(
      nextStep === "screen"
        ? "球队池已保存，已进入大屏设置"
        : nextStep === "console"
          ? "大屏设置已保存，已进入抽签操作台"
          : "抽签结果已确认",
    );
    return true;
  } catch (error) {
    ElMessage.error(`保存失败：${error.message || "请重试"}`);
    return false;
  } finally {
    saving.value = false;
  }
}
async function saveSetupAndNext() {
  const existingStatus = String(config.value.drawStatus || "");
  if (["confirmed", "published"].includes(existingStatus)) {
    try {
      await ElMessageBox.confirm(
        "当前组别已有确认结果。继续修改只会重置未发布的专业抽签流程，不会覆盖已发布赛程或历史赛果；请确认已完成影响范围核对。",
        "确认修改抽签设置",
        { type: "warning", confirmButtonText: "确认并进入球队池", cancelButtonText: "取消" },
      );
    } catch (error) {
      if (error === "cancel" || error === "close") return;
      throw error;
    }
  }
  if (visualQa) {
    window.__sxfProfessionalSetupAction = {
      tournamentId,
      divisionId: String(activeDivision.value.id || activeDivision.value._id || "default"),
      nextStep: "pool",
      setup: { ...drawSetup.value },
      targetStatus: "draft",
      published: false,
      schedulePublished: false,
      historicalSnapshotsChanged: false,
      otherDivisionsChanged: false,
      cloudWrite: false,
    };
    router.replace({ query: { ...route.query, mode: "professional", step: "pool", divisionId: String(activeDivision.value.id || activeDivision.value._id || "default") } });
    return;
  }
  await saveConfig("pool", {
    setup: drawSetup.value,
    setupSavedAt: new Date().toISOString(),
    seedLimit: Number(drawSetup.value.seedCount),
    poolValidated: false,
    drawStatus: "draft",
  });
}
function savePoolAndNext() {
  const scope = {
    tournamentId,
    divisionId: String(activeDivision.value.id || activeDivision.value._id || "default"),
    nextStep: "screen",
    eligibleTeamIds: teams.value.map((team) => team.id),
    seedTeamIds: [...seedIds.value],
    avoidRelations: Object.fromEntries(teams.value.map((team) => [team.id, team.avoidText])),
    poolValidated: canContinuePool.value,
    longTermTeamProfilesChanged: false,
    otherDivisionsChanged: false,
    published: false,
    cloudWrite: false,
  };
  if (visualQa) {
    window.__sxfProfessionalPoolAction = scope;
    router.replace({ query: { ...route.query, mode: "professional", step: "screen", divisionId: scope.divisionId } });
    return;
  }
  saveConfig("screen", {
    avoidRelations: scope.avoidRelations,
    poolValidatedAt: new Date().toISOString(),
  });
}
function saveScreenAndNext() {
  const divisionId = String(activeDivision.value.id || activeDivision.value._id || "default");
  if (!screenReady.value) {
    ElMessage.warning("请先确认球队池校验通过且大屏设备在线");
    return;
  }
  if (visualQa) {
    window.__sxfProfessionalScreenAction = {
      tournamentId,
      divisionId,
      nextStep: "console",
      drawStage: "intro",
      screen: { ...screenConfig.value },
      poolValidated: true,
      longTermTeamProfilesChanged: false,
      otherDivisionsChanged: false,
      published: false,
      cloudWrite: false,
    };
    router.replace({ query: { ...route.query, mode: "professional", step: "console", stage: "intro", divisionId } });
    return;
  }
  saveConfig("console", {
    drawStage: "intro",
    screenSavedAt: new Date().toISOString(),
  });
}
function refreshPreview() {
  if (visualQa) window.__sxfProfessionalPreviewRefresh = { refreshed: true, cloudWrite: false };
  ElMessage.success("大屏预览已刷新");
}
function openDrawScreen() {
  if (visualQa) {
    window.__sxfProfessionalScreenOpen = { url: screenAddress.value, popupBlocked: false, cloudWrite: false };
    ElMessage.success("抽签大屏已在安全预览窗口打开");
    return;
  }
  const projectionStage = consoleStage.value === "intro" ? "intro" : consoleStage.value === "teams" ? "teams" : "drawing";
  broadcastProjection(projectionStage);
  const opened = window.open(screenAddress.value, "_blank", "noopener,noreferrer");
  if (opened) broadcastProjection(projectionStage);
  if (!opened) ElMessage.warning("浏览器阻止了大屏窗口，请允许弹窗后重试");
}
function requestPreviewFullscreen() {
  const element = previewRef.value;
  if (!element) {
    ElMessage.success("当前画面已发送到连接的大屏设备");
    return;
  }
  if (element.requestFullscreen)
    element
      .requestFullscreen()
      .catch(() => ElMessage.warning("浏览器阻止了全屏预览，请允许全屏后重试"));
  else ElMessage.warning("当前浏览器不支持全屏预览");
}
async function copyScreenLink() {
  try {
    await navigator.clipboard.writeText(
      screenAddress.value,
    );
    ElMessage.success("大屏链接已复制");
  } catch {
    ElMessage.warning("复制失败，请手动复制大屏地址");
  }
}
function showSlotNumberingInfo() {
  ElMessage.info(
    `${drawModeLabel.value}签位按当前赛制顺序自动编号，保存前可继续调整球队位置`,
  );
}
function exportGroupResult() {
  const rows = [["小组", "序号", "球队", "种子队"]];
  assignmentGroups.value.forEach((group) =>
    group.teams.forEach((team, index) => {
      rows.push([
        group.name,
        index + 1,
        team.name,
        seedIds.value.includes(team.id) ? "是" : "否",
      ]);
    }),
  );
  const csv = `\ufeff${rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${tournament.value.name || "赛事"}-${activeDivision.value.name || "组别"}-分组结果.csv`;
  link.click();
  URL.revokeObjectURL(url);
  ElMessage.success("分组表已导出");
}
function goProfessionalStep(step) {
  router.replace({
    query: {
      ...route.query,
      mode: "professional",
      step,
      divisionId: String(
        activeDivision.value.id || activeDivision.value._id || "default",
      ),
    },
  });
}
function goConsoleStage(stage) {
  if (stage === "teams" && visualQa) {
    window.__sxfProfessionalIntroAction = {
      tournamentId,
      divisionId: String(activeDivision.value.id || activeDivision.value._id || "default"),
      nextStage: "teams",
      introProjected: introProjected.value,
      drawAssignmentsCreated: false,
      scheduleChanged: false,
      resultsChanged: false,
      rosterSnapshotsChanged: false,
      published: false,
      cloudWrite: false,
    };
  }
  router.replace({
    query: {
      ...route.query,
      mode: "professional",
      step: "console",
      stage,
      divisionId: String(
        activeDivision.value.id || activeDivision.value._id || "default",
      ),
    },
  });
}
function projectConsoleStage() {
  if (!screenDeviceOnline.value) {
    ElMessage.warning("大屏设备离线，请恢复连接后重试");
    return;
  }
  introProjected.value = true;
  screenSynced.value = true;
  broadcastProjection(consoleStage.value === "intro" ? "intro" : consoleStage.value === "teams" ? "teams" : consoleStage.value === "slots" ? "drawing" : "result");
  if (visualQa) {
    window.__sxfProfessionalIntroProjection = {
      tournamentId,
      divisionId: String(activeDivision.value.id || activeDivision.value._id || "default"),
      stage: consoleStage.value,
      cloudWrite: false,
    };
  }
  ElMessage.success("当前抽签介绍已同步到大屏");
}
function projectTeamDisplay() {
  if (!screenDeviceOnline.value) {
    ElMessage.warning("大屏设备离线，请恢复连接后重试");
    return;
  }
  screenSynced.value = true;
  broadcastProjection("teams");
  if (visualQa) {
    window.__sxfProfessionalTeamProjection = {
      tournamentId,
      divisionId: String(activeDivision.value.id || activeDivision.value._id || "default"),
      stage: "teams",
      teamIds: teams.value.map((team) => team.id),
      cloudWrite: false,
    };
  }
  ElMessage.success("当前队伍展示已同步到大屏");
}
function confirmTeamsAndContinue() {
  const divisionId = String(activeDivision.value.id || activeDivision.value._id || "default");
  if (!canManage.value || !canContinuePool.value) {
    ElMessage.warning("请先确认球队池校验通过且具有赛事管理权限");
    return;
  }
  if (visualQa) {
    window.__sxfProfessionalTeamsAction = {
      tournamentId,
      divisionId,
      nextStage: "ready",
      eligibleTeamIds: teams.value.map((team) => team.id),
      seedTeamIds: [...seedIds.value],
      longTermTeamProfilesChanged: false,
      tournamentRosterSnapshotsChanged: false,
      matchLineupSnapshotsChanged: false,
      drawAssignmentsCreated: false,
      published: false,
      cloudWrite: false,
    };
  }
  goConsoleStage("ready");
}
function shuffled(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const random = window.crypto?.getRandomValues
      ? window.crypto.getRandomValues(new Uint32Array(1))[0] / 0xffffffff
      : Math.random();
    const j = Math.floor(random * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
async function startProfessionalDraw() {
  if (!canManage.value || !canContinuePool.value || !screenDeviceOnline.value) {
    ElMessage.warning("请先确认球队池校验通过、具有赛事管理权限且大屏设备在线");
    return;
  }
  if (!visualQa) {
    try {
      await ElMessageBox.confirm(
        "开始后将锁定当前赛事与组别的抽签设置、球队池并生成可复核签位；不会覆盖历史赛果、比赛阵容或赛事名单快照。",
        "确认开始抽签",
        { type: "warning", confirmButtonText: "确认开始", cancelButtonText: "返回检查" },
      );
    } catch (error) {
      if (error === "cancel" || error === "close") return;
      throw error;
    }
  }
  const capacity = Math.max(
    2,
    Number(
      config.value.teamsPerGroup || activeDivision.value.teamsPerGroup || 4,
    ),
  );
  const groupCount = Math.max(1, Math.ceil(teams.value.length / capacity));
  const ordered = [...shuffled(seeds.value), ...shuffled(ordinaryTeams.value)];
  const nextAssignments = ordered.map((team, index) => ({
    teamId: team.id,
    groupIndex: index % groupCount,
    position: Math.floor(index / groupCount) + 1,
  }));
  const generatedAt = new Date().toISOString();
  if (visualQa) {
    drawAssignments.value = nextAssignments;
    drawGeneratedAt.value = generatedAt;
    window.__sxfProfessionalDrawStartAction = {
      tournamentId,
      divisionId: String(activeDivision.value.id || activeDivision.value._id || "default"),
      nextStage: "slots",
      confirmationRequired: true,
      confirmationSimulated: true,
      assignmentCount: nextAssignments.length,
      uniqueTeamCount: new Set(nextAssignments.map((item) => item.teamId)).size,
      groupCount,
      capacity,
      professionalDrawConfigChanged: true,
      scheduleChanged: false,
      historicalResultsChanged: false,
      tournamentRosterSnapshotsChanged: false,
      matchLineupSnapshotsChanged: false,
      otherDivisionsChanged: false,
      published: false,
      cloudWrite: false,
    };
    goConsoleStage("slots");
    return;
  }
  const previousAssignments = drawAssignments.value;
  const previousGeneratedAt = drawGeneratedAt.value;
  drawAssignments.value = nextAssignments;
  drawGeneratedAt.value = generatedAt;
  const saved = await saveConfig("console", {
    drawAssignments: nextAssignments,
    drawGeneratedAt: generatedAt,
    drawStatus: "generated",
    drawStage: "slots",
  });
  if (!saved) {
    drawAssignments.value = previousAssignments;
    drawGeneratedAt.value = previousGeneratedAt;
  }
}
async function confirmDrawResult() {
  if (!canConfirmSlots.value) {
    ElMessage.warning("请先完成全部签位，并处理重复球队或重复签位");
    return;
  }
  const payload = {
    drawAssignments: drawAssignments.value,
    drawGeneratedAt: drawGeneratedAt.value,
    drawStatus: "confirmed",
  };
  if (visualQa) {
    window.__sxfQaLastAction = {
      action: "confirm-professional-group-slots",
      divisionId: String(
        activeDivision.value.id || activeDivision.value._id || "default",
      ),
      assignmentCount: drawAssignments.value.length,
      integrity: { ...slotIntegrity.value },
      matchLineupSnapshotsChanged: false,
      rostersChanged: false,
      matchHistoryChanged: false,
      schedulesGenerated: false,
      published: false,
      cloudWrite: false,
    };
    router.replace({
      query: {
        ...route.query,
        mode: "professional",
        step: "result",
        stage: undefined,
      },
    });
    return;
  }
  await saveConfig("result", payload);
  broadcastProjection("result");
  await generatePairingsAfterDraw(payload);
}

async function generatePairingsAfterDraw(payload) {
  if (visualQa || pairingGenerating.value) return true;
  pairingGenerating.value = true;
  try {
    const divisionId = String(activeDivision.value.id || activeDivision.value._id || "default");
    const result = await callFunction("generateSchedule", {
      action: "generatePairings",
      tournamentId,
      divisionId,
      divisionName: activeDivision.value.name || activeDivision.value.divisionName || "默认组",
      drawAssignments: payload.drawAssignments || drawAssignments.value,
    });
    if (!result?.success) throw new Error(result?.message || result?.error || "生成对阵失败");
    pairingMatches.value = Array.isArray(result.matches) ? result.matches : [];
    pairingCount.value = Number(result.matchCount || pairingMatches.value.length || 0);
    const all = { ...(tournament.value.professionalDrawConfigs || {}) };
    all[divisionId] = { ...(all[divisionId] || {}), ...payload, pairingGenerated: true, pairingCount: pairingCount.value, updatedAt: new Date().toISOString() };
    await updateRecord("tournaments", tournamentId, { professionalDrawConfigs: all, updateTime: new Date() });
    tournament.value = { ...tournament.value, professionalDrawConfigs: all };
    ElMessage.success(`已生成 ${pairingCount.value} 场对阵，比赛时间待排`);
    return true;
  } catch (error) {
    ElMessage.error(error.message || "生成对阵失败");
    return false;
  } finally {
    pairingGenerating.value = false;
  }
}

async function goToScheduleAfterPairing() {
  if (!pairingCount.value) {
    const ok = await generatePairingsAfterDraw({ drawAssignments: drawAssignments.value, drawGeneratedAt: drawGeneratedAt.value, drawStatus: "confirmed" });
    if (!ok) return;
  }
  router.push(`/tournaments/${tournamentId}/pairings?divisionId=${activeDivision.value.id || activeDivision.value._id}&divisionName=${encodeURIComponent(activeDivision.value.name || '')}`);
}

function exportPairingResult() {
  const rows = pairingMatches.value.length ? pairingMatches.value : assignmentGroups.value.flatMap((group) => group.teams.map((team, index) => ({ matchNo: "", roundName: group.name, homeTeamName: `${group.name}${index + 1}`, awayTeamName: team.name })));
  if (!rows.length) { ElMessage.warning("暂无可导出的对阵"); return; }
  const csv = ["场次,阶段,主队/来源,客队/来源", ...rows.map((row) => [row.matchNo || "", row.roundName || row.phase || "", row.homeTeamName || row.homeSourceLabel || "待产生", row.awayTeamName || row.awaySourceLabel || "待产生"].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${tournament.value.name || "赛事"}-${activeDivision.value.name || "组别"}-对阵表.csv`; link.click(); URL.revokeObjectURL(link.href);
  ElMessage.success("对阵表已导出");
}
onMounted(async () => {
  if (window.__sxfVisualQaModulePromise)
    window.addEventListener("sxf-visual-qa-ready", applyVisualQaSnapshot);
  if (applyVisualQaSnapshot()) return;
  if (window.__sxfVisualQaModulePromise) {
    await window.__sxfVisualQaModulePromise;
    if (applyVisualQaSnapshot()) return;
    visualQaRetryTimer = window.setInterval(() => {
      if (applyVisualQaSnapshot()) {
        window.clearInterval(visualQaRetryTimer);
        visualQaRetryTimer = null;
      }
    }, 50);
    return;
  }
  load();
});
onUnmounted(() => {
  if (window.__sxfVisualQaModulePromise)
    window.removeEventListener("sxf-visual-qa-ready", applyVisualQaSnapshot);
  if (visualQaRetryTimer) window.clearInterval(visualQaRetryTimer);
  projectionChannel?.close();
  projectionChannel = null;
});
</script>

<style scoped>
.professional-draw {
  max-width: 1400px;
  margin: 0 auto;
  padding-bottom: 18px;
}
.draw-context {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 66px;
  border-bottom: 1px solid #e3e9e5;
}
.context-info {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.context-info img,
.logo-empty {
  width: 45px;
  height: 45px;
  object-fit: contain;
}
.logo-empty {
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #087542;
  background: #eaf6ed;
  font-size: 22px;
}
.context-info h1 {
  margin: 0;
  font-size: 23px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.division-chip,
.state-chip {
  padding: 4px 8px;
  border: 1px solid #bde0ff;
  border-radius: 4px;
  color: #1677d2;
  font-size: 13px;
}
.state-chip {
  border-color: #bde6ca;
  color: #21844d;
  background: #f2fbf5;
}
h2 {
  margin: 20px 0 14px;
  font-size: 25px;
}
.draw-steps {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0;
  margin: 4px 54px 14px;
}
.draw-steps button {
  position: relative;
  min-height: 70px;
  border: 0;
  color: #27362d;
  background: transparent;
  font-size: 15px;
  cursor: pointer;
}
.draw-steps button:not(:last-child)::after {
  position: absolute;
  top: 14px;
  left: calc(50% + 24px);
  width: calc(100% - 48px);
  height: 2px;
  background: #aeb7b1;
  content: "";
}
.draw-steps button span {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  margin: 0 auto 7px;
  border-radius: 50%;
  color: #607067;
  background: #eff3f0;
  font-weight: 700;
}
.draw-steps button.active {
  color: #087943;
  background: transparent;
  font-weight: 700;
}
.draw-steps button.active span,
.draw-steps button.done span {
  color: #fff;
  background: #087943;
}
.draw-steps button.locked {
  color: #79867f;
  background: transparent;
}
.draw-steps small {
  display: block;
  color: #9ca6a1;
}
.setup-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px 18px;
}
.setup-card {
  min-height: 238px;
  padding: 16px 20px;
  border: 1px solid #e1e8e3;
  border-radius: 9px;
  background: #fff;
}
.setup-card h3 {
  margin: 0 0 11px;
  font-size: 18px;
}
.method-card {
  grid-column: span 3;
  min-height: auto;
}
.method-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.method-options :deep(.el-radio-button__inner) {
  display: flex;
  min-height: 112px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 10px;
  padding: 16px 20px;
  white-space: normal;
  text-align: left;
}
.method-options :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  border-color: #087943;
  color: #087943;
  background: #fff;
  box-shadow: -1px 0 0 0 #087943;
}
.method-options :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner small) { color: #52675a; }
.method-options b,
.method-options small {
  display: block;
}
.method-options small {
  color: #65736a;
  line-height: 1.5;
}
.rule-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 37px;
  border-bottom: 1px solid #eef2ef;
  color: #3d4b42;
}
.rule-line:last-child {
  border: 0;
}
.rule-line b {
  font-size: 13px;
}
.advance-count {
  margin: 11px 12px 11px 0;
}
.setup-card :deep(.el-alert) {
  margin-top: 10px;
}
.setup-card :deep(.el-form-item) { margin-bottom: 6px; }
.setup-card :deep(.el-form-item__content),.setup-card :deep(.el-form-item__label) { min-height: 32px; line-height: 32px; }
.setup-card :deep(.el-input-number),.setup-card :deep(.el-select) { width: 100%; }
.setup-card > .el-button { min-height: 32px; }
.setup-options {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 12px;
  padding: 10px 0;
  border-top: 1px solid #e4ebe6;
  border-bottom: 1px solid #e4ebe6;
}
.setup-options :deep(.el-select) {
  width: 130px;
}
.setup-footer {
  gap: 20px;
  min-height: 64px;
}
.setup-footer :deep(.el-alert) {
  width: 36%;
}
.setup-footer > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1;
}
.setup-footer .el-button { min-width: 190px; min-height: 56px; border-color: #087943; background: #087943; }
.pool-layout,
.screen-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 256px;
  gap: 22px;
}
.pool-layout { align-items: start; }
.pool-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid #e1e8e3;
  border-radius: 8px;
  background: #fff;
}
.pool-stats article {
  padding: 17px 22px;
  border-right: 1px solid #e6ece8;
}
.pool-stats article:last-child {
  border: 0;
}
.pool-stats span,
.pool-stats strong {
  display: block;
}
.pool-stats span {
  color: #6a776f;
  font-size: 13px;
}
.pool-stats strong {
  margin-top: 8px;
  color: #087342;
  font-size: 25px;
}
.pool-tools {
  display: flex;
  gap: 12px;
  margin: 18px 0;
}
.pool-tools .el-input {
  max-width: 200px;
}
.pool-tools .el-select {
  width: 120px;
}
.pool-table-wrap { height: 362px; overflow: hidden; border: 1px solid #e1e8e3; border-radius: 8px; background: #fff; }
.pool-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.pool-table th,.pool-table td { height: 39px; padding: 0 10px; border-bottom: 1px solid #e8eeea; text-align: left; white-space: nowrap; }
.pool-table th { height: 42px; color: #435148; background: #f7f9f8; font-weight: 650; }
.pool-table .check-column { width: 30px; }
.pool-row-actions button { padding: 0; border: 0; color: #087943; background: transparent; cursor: pointer; font: inherit; }
.pool-row-actions button:first-child { margin-right: 10px; color: #e85d26; }
.pool-pagination { display: flex; align-items: center; justify-content: space-between; height: 40px; }
.pool-pagination span { color: #536158; font-size: 13px; }
.pool-aside,
.settings-panel {
  padding: 18px;
  border: 1px solid #e2e9e4;
  border-radius: 8px;
  background: #fff;
}
.pool-layout > .pool-aside { margin-top: -64px; }
.pool-aside h3,
.settings-panel h3 {
  margin: 0 0 8px;
  font-size: 16px;
}
.pool-aside > strong {
  display: block;
  color: #087342;
  font-size: 25px;
}
.pool-aside ul {
  padding: 0;
  list-style: none;
}
.pool-aside li {
  padding: 7px 0;
  color: #47554d;
  font-size: 13px;
}
.pool-aside .quiet {
  color: #8a9690;
}
.validation .ok:before,
.validation .bad:before {
  content: "●";
  margin-right: 7px;
  color: #16824c;
}
.validation .bad:before {
  color: #e45d3f;
}
.team-cell {
  display: flex;
  align-items: center;
  gap: 9px;
}
.team-cell img,
.crest-placeholder {
  width: 28px;
  height: 28px;
  object-fit: contain;
}
.crest-placeholder {
  display: grid;
  place-items: center;
  color: #087943;
  background: #eaf6ed;
  border-radius: 50%;
}
.draw-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 18px;
}
.pool-layout + .draw-footer { min-height: 64px; margin-top: 4px; }
.pool-layout + .draw-footer .el-button { min-width: 194px; min-height: 60px; border-color: #087943; background: #087943; }
.draw-footer small {
  font-size: 12px;
}
.screen-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 13px;
}
.screen-layout {
  grid-template-columns: minmax(0, 1.05fr) minmax(380px, 0.95fr);
}
.screen-preview {
  position: relative;
  min-height: 485px;
  overflow: hidden;
  border: 1px solid #dce8df;
  border-radius: 8px;
  color: #fff;
  background:
    linear-gradient(rgba(0, 37, 24, 0.25), rgba(0, 37, 24, 0.55)),
    url("../../assets/images/football-field-dual.jpg") center/cover;
}
.preview-title {
  padding: 22px;
  text-align: center;
  font-size: 21px;
  font-weight: 700;
}
.preview-center {
  display: grid;
  grid-template-columns: 150px 150px;
  justify-content: center;
  gap: 26px;
  margin-top: 75px;
  text-align: center;
}
.preview-center img,
.preview-center > span {
  width: 142px;
  height: 142px;
  object-fit: contain;
}
.preview-center > span {
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 65px;
  background: rgba(0, 0, 0, 0.28);
}
.preview-center div {
  display: grid;
  place-items: center;
  height: 128px;
  border: 2px solid #35b970;
  border-radius: 8px;
  background: rgba(1, 23, 14, 0.68);
  font-size: 20px;
}
.preview-center b {
  font-size: 49px;
  color: #ffd777;
}
.preview-center strong {
  grid-column: 1/-1;
  font-size: 24px;
}
.preview-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-around;
  padding: 20px;
  background: rgba(0, 27, 15, 0.8);
}
.settings-panel :deep(.el-select) {
  width: 100%;
}
.online {
  color: #087943;
}
@media (max-width: 1100px) {
  .setup-grid {
    grid-template-columns: 1fr 1fr;
  }
  .method-card {
    grid-column: span 2;
  }
  .method-options {
    grid-template-columns: 1fr;
  }
  .pool-layout,
  .screen-layout {
    grid-template-columns: 1fr;
  }
  .pool-aside {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  .draw-steps {
    gap: 8px;
  }
  .draw-steps button {
    font-size: 12px;
  }
}
@media (max-width: 720px) {
  .context-info h1 {
    font-size: 18px;
  }
  .draw-steps {
    overflow: auto;
    display: flex;
  }
  .draw-steps button {
    min-width: 130px;
  }
  .setup-grid {
    grid-template-columns: 1fr;
  }
  .method-card {
    grid-column: auto;
  }
  .setup-options,
  .setup-footer,
  .setup-footer > div {
    align-items: stretch;
    flex-direction: column;
  }
  .setup-footer :deep(.el-alert) {
    width: auto;
  }
  .pool-stats {
    grid-template-columns: 1fr 1fr;
  }
  .pool-tools {
    flex-wrap: wrap;
  }
  .pool-aside {
    display: block;
  }
  .screen-layout {
    grid-template-columns: 1fr;
  }
  .preview-center {
    grid-template-columns: 110px 110px;
  }
  .preview-center img,
  .preview-center > span {
    width: 108px;
    height: 108px;
  }
  .draw-footer {
    gap: 10px;
  }
  .draw-footer .el-button {
    font-size: 13px;
  }
}
.draw-context {
  min-height: 80px;
}
.draw-steps.pool-steps {
  margin-top: 20px;
}
.step-hint {
  margin: -8px 0 18px;
  color: #68756d;
  font-size: 13px;
}
.pool-stats {
  grid-template-columns: repeat(6, 1fr);
}
.context-meta {
  color: #445249;
  font-size: 13px;
  white-space: nowrap;
}
.context-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  white-space: nowrap;
}
.context-actions > span {
  color: #56635b;
  font-size: 13px;
}
.context-actions :deep(.el-select) {
  width: 106px;
}
h2 small {
  margin-left: 12px;
  color: #6c7771;
  font-size: 14px;
  font-weight: 400;
}
.pool-table-wrap {
  height: 342px;
  overflow: hidden;
  border: 1px solid #e2e9e4;
  border-radius: 7px;
  background: #fff;
}
.pool-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: auto;
  font-size: 13px;
}
.pool-table th,
.pool-table td {
  height: 37px;
  padding: 0 9px;
  border-bottom: 1px solid #edf1ee;
  text-align: left;
  white-space: nowrap;
}
.pool-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  color: #617067;
  background: #f6f8f7;
  font-weight: 600;
}
.pool-table thead th { height: 42px; }
.pool-table tbody tr:hover {
  background: #f5fbf7;
}
.pool-table .check-column {
  width: 32px;
}
.pool-table input {
  width: 15px;
  height: 15px;
  accent-color: #087943;
}
.pool-empty {
  text-align: center !important;
  color: #8b9690;
}
.screen-layout {
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  align-items: start;
}
.preview-panel,
.setting-card {
  padding: 14px;
  border: 1px solid #e2e9e4;
  border-radius: 8px;
  background: #fff;
}
.preview-panel > h3 {
  margin: 0 0 12px;
}
.screen-preview {
  position: relative;
  min-height: 420px;
}
.screen-preview.theme-stadium { filter: saturate(.78) brightness(.78); }
.screen-preview.theme-light { color: #17392a; background: linear-gradient(145deg, #f7fbf8, #dceee3); }
.screen-preview.theme-light .preview-progress { color: #f5fff8; }
.preview-center {
  margin-top: 44px;
  margin-right: 170px;
}
.preview-group-progress {
  position: absolute;
  top: 72px;
  right: 18px;
  width: 142px;
  padding: 12px;
  border: 1px solid rgba(118, 242, 175, 0.48);
  border-radius: 8px;
  background: rgba(0, 32, 20, 0.78);
  color: #fff;
}
.preview-group-progress h4 { margin: 0 0 10px; font-size: 13px; }
.preview-group-progress div { display: grid; grid-template-columns: 1fr auto; gap: 3px 8px; margin-top: 8px; font-size: 11px; }
.preview-group-progress i { grid-column: 1/-1; height: 4px; overflow: hidden; border-radius: 2px; background: rgba(255,255,255,.2); }
.preview-group-progress em { display: block; height: 100%; background: #20d47c; }
.preview-progress {
  gap: 10px;
}
.preview-toolbar {
  display: grid;
  grid-template-columns: 160px 150px 1fr 1fr;
  gap: 12px;
  margin-top: 12px;
}
.preview-toolbar :deep(.el-select) {
  width: 100%;
}
.settings-panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  padding: 0;
  border: 0;
  background: transparent;
}
.setting-card h3 {
  margin: 0 0 14px;
}
.setting-card :deep(.el-form-item) {
  margin-bottom: 10px;
}
.settings-panel .setting-card:first-child :deep(.el-form-item) {
  height: 31px;
  margin-bottom: 0;
}
.settings-panel .setting-card:first-child :deep(.el-divider) {
  margin: 11px 0 8px;
}
.setting-card :deep(.el-radio) {
  margin-right: 16px;
}
.setting-card :deep(.el-select) {
  width: 100%;
}
.animation-card {
  grid-column: 1/-1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px;
  column-gap: 24px;
}
.animation-card h3 {
  grid-column: 1/-1;
}
.sound-switches {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding-top: 10px;
}
.sound-switches span {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.screen-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 250px auto;
  align-items: center;
  gap: 18px;
  margin-top: 14px;
}
.screen-footer dl {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin: 0;
}
.screen-footer dl > div {
  padding: 0 14px;
  border-right: 1px solid #e2e9e4;
}
.screen-footer dt {
  color: #748078;
  font-size: 12px;
}
.screen-footer dd {
  margin: 6px 0 0;
  color: #26342c;
  font-size: 13px;
}
.screen-footer .offline { color: #c45656; }
.screen-address { overflow-wrap: anywhere; }
.screen-address button { margin-left: 6px; padding: 0; border: 0; color: #087943; background: transparent; cursor: pointer; }
.screen-footer :deep(.el-alert) {
  padding: 10px 14px;
}
.screen-footer .el-button {
  min-width: 220px;
}
.draw-substeps {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  margin: 20px 0 28px;
  padding: 16px 0;
  border-bottom: 1px solid #e2e9e4;
  color: #78847e;
  text-align: center;
}
.draw-substeps span {
  position: relative;
}
.draw-substeps .done,
.draw-substeps .active {
  color: #087943;
  font-weight: 700;
}
.draw-substeps .active:before {
  display: inline-grid;
  place-items: center;
  width: 25px;
  height: 25px;
  margin-right: 8px;
  border-radius: 50%;
  color: #fff;
  background: #087943;
  content: "";
}
.draw-ready-grid {
  display: grid;
  grid-template-columns: 1fr 0.92fr 1.12fr;
  gap: 24px;
}
.ready-card,
.result-panel {
  padding: 24px;
  border: 1px solid #e0e8e2;
  border-radius: 9px;
  background: #fff;
}
.ready-card h3 {
  margin: 0 0 18px;
  font-size: 21px;
}
.ready-summary {
  display: flex;
  gap: 15px;
  padding: 17px;
  border: 1px solid #b9dfc4;
  border-radius: 8px;
  background: #f4fbf6;
}
.ready-summary > .el-icon {
  padding: 7px;
  color: #0a713e;
  font-size: 32px;
}
.ready-summary b,
.ready-summary strong,
.ready-summary small {
  display: block;
}
.ready-summary strong {
  margin: 5px 0;
}
.ready-summary small {
  color: #087943;
}
.check-list,
.live-list {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}
.check-list li {
  padding: 13px;
  border-bottom: 1px solid #e9eeea;
  color: #1d492e;
}
.check-list .bad {
  color: #bd5135;
}
.live-list li {
  display: grid;
  grid-template-columns: 44px 1fr auto;
  align-items: center;
  min-height: 73px;
  padding: 0 10px;
  border: 1px solid #edf1ee;
}
.live-list .el-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: #097342;
  background: #edf7ef;
  font-size: 20px;
}
.live-list b {
  color: #087943;
}
.preview-card {
  padding-bottom: 20px;
}
.ready-preview {
  display: grid;
  place-items: center;
  gap: 14px;
  min-height: 286px;
  border-radius: 8px;
  color: #fff;
  background:
    linear-gradient(135deg, rgba(0, 48, 29, 0.8), rgba(0, 10, 6, 0.9)),
    url("../../assets/images/football-field-dual.jpg") center/cover;
}
.ready-preview img {
  max-width: 88px;
  max-height: 88px;
  object-fit: contain;
}
.ready-preview > .el-icon {
  font-size: 70px;
}
.ready-preview span {
  font-size: 17px;
}
.ready-preview strong {
  font-size: 27px;
}
.ready-preview em {
  font-style: normal;
  font-size: 21px;
}
.draw-warning {
  margin: 20px 0;
  padding: 17px 20px;
  border: 1px solid #ffd08a;
  border-radius: 8px;
  color: #a55a00;
  background: #fffaf0;
}
.console-confirm {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border: 1px solid #e0e8e2;
  border-radius: 9px;
  background: #f9fbf9;
}
.console-confirm > span {
  color: #53645a;
}
.console-confirm > div {
  display: flex;
  gap: 12px;
}
.eyebrow {
  color: #087943;
  font-size: 14px;
  font-weight: 700;
}
.quiet {
  color: #849087;
  font-size: 13px;
}
.result-panel {
  padding: 28px;
}
.result-panel header {
  display: flex;
  justify-content: space-between;
  gap: 20px;
}
.result-panel h3 {
  margin: 8px 0;
  font-size: 25px;
}
.result-panel header p {
  margin: 0;
  color: #69766f;
}
.result-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 16px;
  margin-top: 24px;
}
.result-groups article {
  overflow: hidden;
  border: 1px solid #dce8df;
  border-radius: 8px;
}
.result-groups h4 {
  margin: 0;
  padding: 14px 16px;
  color: #fff;
  background: #087943;
}
.result-groups ol {
  min-height: 80px;
  margin: 0;
  padding: 8px 16px 12px 34px;
}
.result-groups li {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  padding: 8px 0;
  border-bottom: 1px solid #eef2ef;
}
.result-groups li:last-child {
  border: 0;
}
@media (max-width: 1100px) {
  .draw-ready-grid {
    grid-template-columns: 1fr 1fr;
  }
  .preview-card {
    grid-column: 1/-1;
  }
}
@media (max-width: 720px) {
  .draw-substeps {
    display: flex;
    gap: 18px;
    overflow: auto;
    text-align: left;
  }
  .draw-substeps span {
    min-width: max-content;
  }
  .draw-ready-grid {
    grid-template-columns: 1fr;
  }
  .preview-card {
    grid-column: auto;
  }
  .console-confirm {
    align-items: stretch;
    flex-direction: column;
    gap: 14px;
  }
  .console-confirm > div {
    flex-direction: column;
  }
  .result-panel header {
    flex-direction: column;
  }
}
.console-tools {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: -4px 0 0;
}
.console-tools > span {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #65736b;
}
.projection-button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 15px;
  border: 1px solid #d7dfda;
  border-radius: 5px;
  color: #34463c;
  background: #fff;
  cursor: pointer;
}
.projection-button:hover { border-color: #20a468; color: #087943; }
.intro-grid {
  display: grid;
  grid-template-columns: 1fr 1.08fr;
  gap: 14px;
}
.professional-draw:has(.intro-grid) .draw-steps { margin-bottom: 0; }
.professional-draw:has(.intro-grid) .console-confirm { margin-top: 10px; padding: 10px 14px; }
.intro-card {
  padding: 18px;
  border: 1px solid #e0e8e2;
  border-radius: 8px;
  background: #fff;
}
.intro-card h3 {
  margin: 0 0 14px;
  font-size: 17px;
}
.intro-event {
  display: flex;
  align-items: center;
  gap: 16px;
}
.intro-event b,
.intro-event .el-tag {
  display: block;
  margin-top: 7px;
}
.intro-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin: 14px 0;
}
.intro-stats div {
  padding: 10px;
  border: 1px solid #dce8df;
  border-radius: 6px;
  text-align: center;
}
.intro-stats dt {
  color: #087943;
  font-size: 22px;
  font-weight: 700;
}
.intro-stats dd {
  margin: 2px 0 0;
  color: #647269;
  font-size: 12px;
}
.intro-rules {
  padding: 10px 14px;
  border: 1px solid #e5ebe7;
  border-radius: 6px;
}
.intro-rules h4,
.intro-process h4 {
  margin: 0 0 8px;
}
.intro-rules p {
  margin: 5px 0;
  font-size: 12px;
}
.intro-process {
  margin-top: 10px;
  padding: 10px;
  border: 1px solid #e5ebe7;
  border-radius: 6px;
}
.intro-process {
  display: flex;
  align-items: center;
  justify-content: space-around;
}
.intro-process h4 {
  width: 100%;
  position: absolute;
  opacity: 0;
}
.intro-process span {
  display: grid;
  place-items: center;
  color: #087943;
  font-size: 20px;
}
.intro-process small {
  display: block;
  margin-top: 5px;
  color: #59675f;
  font-size: 11px;
}
.intro-process i {
  color: #9aa69f;
  font-style: normal;
}
.intro-side {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}
.intro-team-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 7px;
}
.intro-team-grid span {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  padding: 7px;
  border: 1px solid #e7ece9;
  border-radius: 5px;
  overflow: hidden;
  font-size: 11px;
  white-space: nowrap;
}
.intro-team-grid img {
  width: 21px;
  height: 21px;
  object-fit: contain;
}
.intro-side button {
  display: block;
  margin: 9px auto 0;
  border: 0;
  color: #087943;
  background: transparent;
  cursor: pointer;
}
.status-card {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 16px;
}
.status-card h3 {
  grid-column: 1/-1;
}
.status-card p {
  margin: 5px 0;
  font-size: 12px;
}
.status-card b {
  float: right;
  color: #087943;
}
.status-card > div {
  grid-column: 2;
  grid-row: 2/5;
  display: grid;
  gap: 6px;
}
.intro-check {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.intro-check h3 {
  grid-column: 1/-1;
}
.intro-check span {
  font-size: 12px;
}
.intro-check .passed { color: #087943; }
.stage-intro,
.stage-teams {
  padding: 18px;
  border: 1px solid #e0e8e2;
  border-radius: 9px;
  background: #fff;
}
.stage-teams header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 14px;
}
.stage-teams h3 {
  margin: 5px 0 0;
  font-size: 14px;
  font-weight: 400;
}
.team-display-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.team-show-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 10px;
}
.team-show-grid article {
  position: relative;
  display: flex;
  min-height: 88px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 9px;
  border: 1px solid #e5ece6;
  border-radius: 7px;
  text-align: center;
}
.team-show-grid article.seed {
  border-color: #7fc69d;
}
.team-show-grid img,
.team-show-grid .crest-placeholder {
  width: 36px;
  height: 36px;
  object-fit: contain;
}
.team-show-grid b,
.team-show-grid small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.team-show-grid b {
  max-width: 120px;
  font-size: 12px;
}
.team-show-grid small {
  margin-top: 2px;
  color: #77847d;
  font-size: 10px;
}
.team-show-grid .el-tag {
  position: absolute;
  top: 5px;
  right: 5px;
}
@media (max-width: 1100px) {
  .intro-grid {
    grid-template-columns: 1fr;
  }
  .team-show-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
@media (max-width: 720px) {
  .stage-intro,
  .stage-teams {
    padding: 18px;
  }
  .team-show-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .stage-teams header {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }
}
.stage-slots {
  padding: 28px;
  border: 1px solid #e0e8e2;
  border-radius: 9px;
  background: #fff;
}
.stage-slots header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}
.stage-slots h3 {
  margin: 8px 0 0;
  font-size: 25px;
}
.slot-group-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.slot-group-grid article {
  overflow: hidden;
  border: 1px solid #dce8df;
  border-radius: 8px;
}
.slot-group-grid h4 {
  display: flex;
  justify-content: space-between;
  margin: 0;
  padding: 13px 15px;
  color: #fff;
  background: #087943;
  font-size: 18px;
}
.slot-group-grid h4 small {
  font-weight: 400;
}
.slot-group-grid ol {
  min-height: 140px;
  margin: 0;
  padding: 8px 12px;
  list-style: none;
}
.slot-group-grid li {
  display: grid;
  grid-template-columns: 24px 26px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #edf1ee;
}
.slot-group-grid li:last-child {
  border: 0;
}
.slot-group-grid li img,
.slot-group-grid li .crest-placeholder {
  width: 24px;
  height: 24px;
  object-fit: contain;
}
.slot-group-grid .slot-empty {
  display: block;
  color: #9aa59f;
}
@media (max-width: 1100px) {
  .slot-group-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
@media (max-width: 720px) {
  .stage-slots {
    padding: 22px 16px;
  }
  .slot-group-grid {
    grid-template-columns: 1fr 1fr;
  }
  .stage-slots header {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }
}
.league-slot-board,
.knockout-slot-board,
.hybrid-slot-board {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.league-slot-board article,
.knockout-slot-board article,
.hybrid-slot-board > section {
  overflow: hidden;
  border: 1px solid #dce8df;
  border-radius: 8px;
}
.league-slot-board h4,
.knockout-slot-board h4,
.hybrid-slot-board h4 {
  margin: 0;
  padding: 13px 16px;
  color: #fff;
  background: #087943;
}
.league-slot-board ul,
.knockout-slot-board ul {
  margin: 0;
  padding: 8px 14px;
  list-style: none;
}
.league-slot-board li,
.knockout-slot-board li {
  display: grid;
  grid-template-columns: 1fr 30px 1fr;
  gap: 6px;
  padding: 10px 0;
  border-bottom: 1px solid #edf1ee;
  text-align: center;
  font-size: 13px;
}
.league-slot-board li:last-child,
.knockout-slot-board li:last-child {
  border: 0;
}
.league-slot-board b,
.knockout-slot-board b {
  color: #a3afa8;
  font-size: 11px;
}
.knockout-slot-board {
  grid-template-columns: 2fr 1fr;
}
.next-round {
  padding-bottom: 18px;
}
.next-round p {
  padding: 0 16px;
  color: #718078;
  line-height: 1.7;
}
.hybrid-slot-board {
  grid-template-columns: 2fr 1fr;
}
.hybrid-slot-board > section:last-child p {
  padding: 0 16px;
  color: #718078;
  line-height: 1.8;
}
.hybrid-slot-board .slot-group-grid {
  padding: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.hybrid-slot-board .slot-group-grid h5 {
  margin: 0;
  padding: 10px;
  color: #087943;
  background: #f0f8f2;
}
.hybrid-slot-board .slot-group-grid ol {
  min-height: auto;
}
.hybrid-slot-board .slot-group-grid li {
  display: block;
}
@media (max-width: 1100px) {
  .league-slot-board {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .hybrid-slot-board {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 720px) {
  .league-slot-board,
  .knockout-slot-board {
    grid-template-columns: 1fr;
  }
  .hybrid-slot-board .slot-group-grid {
    grid-template-columns: 1fr;
  }
}
.draw-substeps span {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.draw-substeps b {
  display: inline-grid;
  place-items: center;
  width: 25px;
  height: 25px;
  border: 1px solid #aeb8b2;
  border-radius: 50%;
  font-size: 13px;
}
.draw-substeps .done b,
.draw-substeps .active b {
  border-color: #087943;
  color: #fff;
  background: #087943;
}
.draw-substeps .active:before {
  display: none;
}
.draw-substeps .locked {
  color: #87928c;
}
.console-stage-nav {
  display: grid;
  grid-template-columns: 280px 1fr;
  align-items: center;
  margin: 8px 0 18px;
  border-bottom: 1px solid #e2e9e4;
}
.console-stage-nav .console-tools {
  margin: 0;
}
.console-stage-nav .draw-substeps {
  margin: 0;
  padding: 14px 0;
  border: 0;
}
@media (max-width: 1100px) {
  .console-stage-nav {
    grid-template-columns: 1fr;
  }
  .console-stage-nav .console-tools {
    padding-top: 12px;
  }
}
.intro-grid .intro-card {
  padding: 14px;
}
.intro-grid .intro-side {
  gap: 8px;
}
.slot-status {
  display: grid;
  grid-template-columns: repeat(5, 1fr) auto;
  align-items: center;
  gap: 12px;
  margin: -4px 0 14px;
  padding: 12px 14px;
  border: 1px solid #e1e8e3;
  border-radius: 7px;
  background: #fff;
  font-size: 12px;
}
.slot-status span {
  padding-right: 10px;
  border-right: 1px solid #e4e9e6;
}
.slot-status b {
  color: #087943;
}
.group-editor,
.league-editor,
.knockout-editor,
.hybrid-editor {
  display: grid;
  gap: 14px;
}
.group-editor {
  grid-template-columns: 280px 1fr;
}
.pending-panel,
.league-order,
.league-rules,
.bracket-board,
.hybrid-teams,
.hybrid-ranking,
.hybrid-bracket {
  padding: 14px;
  border: 1px solid #dfe7e2;
  border-radius: 8px;
  background: #fff;
}
.pending-panel h4,
.league-order h4,
.league-rules h4,
.bracket-board h4,
.hybrid-editor h4 {
  margin: 0 0 12px;
}
.pending-panel h4 b {
  margin-left: 8px;
  color: #087943;
}
.pending-panel ul,
.hybrid-teams ul {
  margin: 12px 0;
  padding: 0;
  list-style: none;
}
.pending-panel li,
.hybrid-teams li {
  padding: 9px;
  border-bottom: 1px solid #edf1ee;
  font-size: 12px;
}
.pending-panel p {
  color: #087943;
  text-align: center;
  font-size: 12px;
}
.pending-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}
.pending-grid li {
  border: 1px solid #e4eae6;
  border-radius: 5px;
}
.group-editor .slot-group-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.group-editor .slot-group-grid ol {
  min-height: 118px;
}
.league-editor {
  grid-template-columns: 280px 1.35fr 0.9fr;
}
.league-order > div {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.league-order article {
  display: flex;
  align-items: center;
  gap: 15px;
  min-height: 68px;
  padding: 0 16px;
  border: 1px solid #e3e9e5;
  border-radius: 7px;
}
.league-order article b {
  font-size: 19px;
}
.league-order article.empty {
  color: #9ba59f;
  border-style: dashed;
}
.league-rules p {
  display: flex;
  justify-content: space-between;
  margin: 18px 0;
  font-size: 13px;
}
.round-ring {
  display: grid;
  place-items: center;
  width: 74px;
  height: 74px;
  margin: 20px auto;
  border: 4px dotted #087943;
  border-radius: 50%;
  color: #087943;
  font-size: 25px;
}
.round-ring small {
  font-size: 11px;
}
.league-rules .el-button {
  width: 100%;
}
.league-rules em {
  display: block;
  margin-top: 12px;
  color: #ef6b24;
  text-align: center;
  font-size: 12px;
  font-style: normal;
}
.knockout-editor {
  grid-template-columns: 220px 1fr;
}
.bracket-board {
  color: #fff;
  background:
    linear-gradient(135deg, rgba(0, 45, 27, 0.94), rgba(0, 18, 11, 0.94)),
    url("../../assets/images/football-field-dual.jpg") center/cover;
}
.bracket-board > h4 {
  text-align: center;
  font-size: 20px;
}
.bracket-columns {
  display: grid;
  grid-template-columns: 1fr 180px 1fr;
  align-items: center;
  gap: 24px;
}
.bracket-columns > div:first-child,
.bracket-columns > div:last-child {
  display: grid;
  gap: 7px;
}
.bracket-columns article {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  padding: 0 10px;
  border-radius: 5px;
  color: #132118;
  background: #fff;
  font-size: 11px;
}
.bracket-center {
  display: grid;
  place-items: center;
  gap: 22px;
}
.bracket-center span {
  padding: 10px 20px;
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: 5px;
  text-align: center;
}
.bracket-center strong {
  font-size: 58px;
}
.hybrid-editor {
  grid-template-columns: 240px 1fr 1.25fr;
}
.hybrid-teams ul,
.hybrid-ranking ol {
  max-height: 420px;
  overflow: auto;
}
.hybrid-ranking ol {
  margin: 0;
  padding: 0;
  list-style: none;
}
.hybrid-ranking li {
  display: grid;
  grid-template-columns: 35px 1fr 20px;
  align-items: center;
  min-height: 34px;
  border-bottom: 1px solid #e7ece9;
}
.hybrid-ranking li b {
  color: #087943;
}
.hybrid-ranking li i {
  color: #98a39d;
  font-style: normal;
}
.hybrid-bracket > p {
  color: #6c7871;
  font-size: 12px;
}
.hybrid-bracket > div {
  display: grid;
  grid-template-columns: 1fr 120px 100px;
  align-items: center;
  gap: 20px;
  margin-top: 34px;
}
.hybrid-bracket article {
  display: grid;
  margin-bottom: 12px;
  border: 1px solid #dfe6e2;
  border-radius: 5px;
}
.hybrid-bracket article span {
  padding: 10px;
  border-bottom: 1px solid #e6ebe8;
}
.hybrid-bracket article span:last-child {
  border: 0;
}
.hybrid-bracket > div > b,
.hybrid-bracket > div > strong {
  padding: 20px 8px;
  border: 1px solid #dfe6e2;
  border-radius: 5px;
  text-align: center;
}
.stage-slots {
  padding: 12px 16px 10px;
}
.stage-slots > header {
  margin-bottom: 8px;
}
.stage-slots h3 {
  margin-top: 4px;
  font-size: 22px;
}
.stage-slots .slot-status {
  gap: 8px;
  margin: -2px 0 9px;
  padding: 8px 12px;
}
.stage-slots .group-editor {
  grid-template-columns: 248px 1fr;
  gap: 10px;
}
.stage-slots .pending-panel {
  padding: 10px;
}
.stage-slots .pending-panel h4 {
  margin-bottom: 8px;
}
.stage-slots .pending-panel ul {
  margin: 8px 0;
}
.stage-slots .pending-grid {
  gap: 5px;
}
.stage-slots .pending-grid li {
  padding: 6px 7px;
  cursor: grab;
}
.stage-slots .pending-panel p {
  margin: 6px 0 0;
}
.stage-slots .slot-group-grid {
  gap: 9px;
}
.stage-slots .slot-group-grid h4 {
  padding: 8px 11px;
  font-size: 15px;
}
.stage-slots .slot-group-grid ol {
  min-height: 102px;
  padding: 5px 9px;
}
.stage-slots .slot-group-grid li {
  grid-template-columns: 20px 22px 1fr auto;
  gap: 6px;
  min-height: 27px;
  padding: 3px 0;
  font-size: 12px;
}
.stage-slots .slot-group-grid li img,
.stage-slots .slot-group-grid li .crest-placeholder {
  width: 20px;
  height: 20px;
}
.professional-draw:has(.stage-slots) .console-confirm {
  margin-top: 8px;
  padding: 9px 14px;
}
@media (max-width: 1100px) {
  .group-editor,
  .league-editor,
  .knockout-editor,
  .hybrid-editor {
    grid-template-columns: 1fr;
  }
  .slot-status {
    grid-template-columns: repeat(3, 1fr);
  }
}
.result-panel {
  padding: 18px;
}
.pairing-result-table {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid #e0e8e2;
  border-radius: 8px;
  background: #fff;
}
.pairing-result-table > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.pairing-result-table h4 { margin: 0; font-size: 17px; }
.pairing-result-table p { margin: 4px 0 0; color: #748078; font-size: 12px; }
.pairing-result-scroll { max-height: 360px; overflow: auto; }
.pairing-result-table table { width: 100%; border-collapse: collapse; font-size: 12px; }
.pairing-result-table th, .pairing-result-table td { padding: 9px 10px; border-bottom: 1px solid #edf1ee; text-align: left; white-space: nowrap; }
.pairing-result-table th { color: #536158; background: #f7faf8; }
.result-panel > header {
  align-items: center;
}
.result-stats {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  align-items: center;
  margin-top: 14px;
  padding: 12px;
  border: 1px solid #e1e8e3;
  border-radius: 7px;
  text-align: center;
}
.result-stats span {
  padding: 7px;
  border-right: 1px solid #e2e8e4;
}
.result-tools {
  display: grid;
  grid-template-columns: 180px 230px auto auto 1fr auto auto;
  gap: 8px;
  margin-top: 12px;
}
.result-groups {
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-top: 12px;
}
.result-groups h4 {
  color: #087943;
  background: #f7faf8;
}
.result-groups ol {
  min-height: 126px;
}
.result-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
  padding: 14px;
  border: 1px solid #e0e8e2;
  border-radius: 8px;
}
.result-footer dl {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin: 0;
}
.result-footer dl > div {
  min-width: 180px;
  padding: 0 24px;
  border-right: 1px solid #e1e7e3;
}
.result-footer dt {
  color: #728078;
  font-size: 12px;
}
.result-footer dd {
  margin: 6px 0 0;
  font-weight: 700;
}
.result-footer dd.pending {
  color: #ef6a25;
}
.result-footer > div {
  display: flex;
  gap: 8px;
}
@media (max-width: 1100px) {
  .result-stats,
  .result-groups {
    grid-template-columns: repeat(2, 1fr);
  }
  .result-tools {
    grid-template-columns: 1fr 1fr;
  }
  .result-tools span {
    display: none;
  }
  .result-footer {
    align-items: stretch;
    flex-direction: column;
    gap: 12px;
  }
}
.result-groups.list {
  grid-template-columns: 1fr;
}
.result-groups.list article {
  display: grid;
  grid-template-columns: 120px 1fr;
}
.result-groups.list h4 {
  display: grid;
  place-items: center;
}
.result-groups.list ol {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  min-height: auto;
  padding: 8px 16px;
}
</style>
