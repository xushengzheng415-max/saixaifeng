<template>
  <section v-loading="loading" class="rules-page" :class="{ 'is-advancement-step': activeKey === 'advancement', 'is-finalize-step': activeKey === 'finalize' && isProfessional && !effective, 'is-professional-effective': effective && isProfessional }" aria-labelledby="rules-page-title">
    <header class="tournament-header">
      <div class="tournament-identity">
        <img v-if="tournamentLogo" :src="tournamentLogo" :alt="`${tournament.name} Logo`" />
        <span v-else class="logo-placeholder"><el-icon><Trophy /></el-icon></span>
        <h1>{{ tournament.name || '赛事竞赛管理' }}</h1>
        <span class="header-chip">{{ divisionCount }} 个组别</span>
        <span class="status-chip">{{ tournamentStatus }}</span>
        <span class="header-meta"><el-icon><Calendar /></el-icon>{{ dateRange }}</span>
        <span class="header-meta"><el-icon><Location /></el-icon>{{ tournament.region || tournament.location || '地区待定' }}</span>
      </div>
      <el-button plain :icon="Back" @click="exitTournament">退出赛事空间</el-button>
    </header>

    <div class="page-heading">
      <div>
        <div class="title-line">
          <h2 id="rules-page-title">竞赛管理 / {{ division.name || '竞赛组别' }}</h2>
          <span class="mode-state" :class="{ professional: isProfessional }">{{ modeStateText }}</span>
        </div>
        <p>{{ pageSubtitle }}</p>
      </div>
      <div class="heading-actions">
        <el-select class="division-selector" :model-value="divisionId" disabled aria-label="当前组别">
          <el-option :label="`当前组别：${division.name || '竞赛组别'}`" :value="divisionId" />
        </el-select>
        <el-button v-if="effective" plain @click="backToDivisions">返回组别管理</el-button>
        <span v-else class="draft-version">草稿 {{ draftVersion }}</span>
      </div>
    </div>

    <nav class="rule-steps" :class="{ professional: isProfessional }" aria-label="规则配置步骤">
      <span v-if="isProfessional" class="step-counter">步骤 {{ Math.min(activeIndex + 1, steps.length) }}/{{ steps.length }}</span>
      <template v-for="(step, index) in steps" :key="step.key">
        <button
          type="button"
          class="step-item"
          :class="{ active: index === activeIndex && !effective, done: index < activeIndex || effective, locked: index > activeIndex && !effective }"
          :disabled="index > activeIndex && !effective"
          @click="goToCompletedStep(index)"
        >
          <span class="step-circle"><el-icon v-if="index < activeIndex || effective"><Check /></el-icon><template v-else>{{ index + 1 }}</template></span>
          <strong>{{ step.title }}</strong>
          <small>{{ stepStatusText(index) }}</small>
        </button>
        <i v-if="index < steps.length - 1" class="step-line" :class="{ done: index < activeIndex || effective }"></i>
      </template>
    </nav>

    <el-alert v-if="!effective && activeKey === 'format'" class="scope-alert" type="success" :closable="false" show-icon :title="scopeNotice" />

    <main v-if="!effective" class="wizard-content">
      <template v-if="activeKey === 'format'">
        <section class="format-picker panel-card" :class="{ professional: isProfessional }">
          <h3>选择赛制类型</h3>
          <div class="format-grid">
            <button v-for="item in formats" :key="item.value" type="button" :class="{ selected: form.formatType === item.value }" @click="form.formatType = item.value">
              <el-icon><component :is="item.icon" /></el-icon>
              <span><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span>
              <el-icon v-if="form.formatType === item.value" class="selected-check"><CircleCheckFilled /></el-icon>
            </button>
          </div>
          <p class="format-description"><strong>{{ formatLabel }}说明</strong>{{ selectedFormatDescription }}</p>
        </section>

        <section v-if="!isProfessional" class="panel-card basic-format-settings">
          <h3>基础赛制设置</h3>
          <el-form label-position="left" label-width="120px">
            <el-form-item label="参赛球队"><el-input-number v-model="form.expectedTeams" :min="2" :max="128" controls-position="right" /></el-form-item>
            <el-form-item label="小组数量"><el-input-number v-model="form.groupCount" :min="1" :max="32" controls-position="right" /></el-form-item>
            <el-form-item label="每组球队"><el-input-number v-model="form.teamsPerGroup" :min="2" :max="32" controls-position="right" /></el-form-item>
            <el-form-item label="小组循环"><el-select v-model="form.groupCycle"><el-option label="单循环" value="single" /><el-option label="双循环" value="double" /></el-select></el-form-item>
            <el-form-item label="每组晋级"><el-input-number v-model="form.advancePerGroup" :min="1" :max="16" controls-position="right" /></el-form-item>
          </el-form>
          <div class="auto-result"><el-icon><MagicStick /></el-icon>系统将自动生成：{{ form.groupCount }} 个小组，前 {{ form.groupCount * form.advancePerGroup }} 名进入淘汰赛阶段。</div>
        </section>

        <template v-else>
          <section class="professional-settings">
            <article class="panel-card"><h3>小组赛阶段</h3><el-form label-position="left" label-width="118px"><el-form-item label="参赛球队"><el-input-number v-model="form.expectedTeams" :min="2" :max="128" /></el-form-item><el-form-item label="小组数量"><el-input-number v-model="form.groupCount" :min="1" :max="32" /></el-form-item><el-form-item label="每组球队"><el-input-number v-model="form.teamsPerGroup" :min="2" :max="32" /></el-form-item><el-form-item label="循环方式"><el-select :key="`group-cycle-${formRenderKey}`" v-model="form.groupCycle"><el-option label="单循环" value="single" /><el-option label="双循环" value="double" /></el-select><span class="select-value-overlay" aria-hidden="true">{{ groupCycleLabel }}</span></el-form-item><el-form-item label="每组晋级"><el-input-number v-model="form.advancePerGroup" :min="1" :max="16" /></el-form-item></el-form></article>
            <article class="panel-card"><h3>淘汰赛阶段</h3><el-form label-position="left" label-width="118px"><el-form-item label="淘汰赛规模"><el-select :key="`knockout-size-${formRenderKey}`" v-model="form.knockoutSize"><el-option label="4 强" :value="4" /><el-option label="8 强" :value="8" /><el-option label="16 强" :value="16" /></el-select><span class="select-value-overlay" aria-hidden="true">{{ form.knockoutSize }} 强</span></el-form-item><el-form-item label="淘汰形式"><el-select :key="`knockout-type-${formRenderKey}`" v-model="form.knockoutType"><el-option label="单淘汰" value="single" /><el-option label="双败淘汰" value="double" /></el-select><span class="select-value-overlay" aria-hidden="true">{{ form.knockoutType === 'double' ? '双败淘汰' : '单淘汰' }}</span></el-form-item><el-form-item label="比赛回合"><el-select :key="`knockout-legs-${formRenderKey}`" v-model="form.knockoutLegs"><el-option label="单场决胜" value="single" /><el-option label="主客场两回合" value="home-away" /></el-select><span class="select-value-overlay" aria-hidden="true">{{ form.knockoutLegs === 'home-away' ? '主客场两回合' : '单场决胜' }}</span></el-form-item><el-form-item label="对阵生成"><el-select :key="`bracket-source-${formRenderKey}`" v-model="form.bracketSource"><el-option label="小组结束后二次抽签" value="redraw" /><el-option label="按预设签位生成" value="preset" /></el-select><span class="select-value-overlay" aria-hidden="true">{{ form.bracketSource === 'preset' ? '按预设签位生成' : '小组结束后二次抽签' }}</span></el-form-item></el-form></article>
            <article class="panel-card"><h3>比赛组织</h3><el-form label-position="left" label-width="118px"><el-form-item label="比赛场地"><el-select :key="`venue-mode-${formRenderKey}`" v-model="form.venueMode"><el-option label="集中场地" value="centralized" /><el-option label="主客场" value="home-away" /></el-select><span class="select-value-overlay" aria-hidden="true">{{ form.venueMode === 'home-away' ? '主客场' : '集中场地' }}</span></el-form-item><el-form-item label="主客场设置"><el-switch v-model="form.homeAwayEnabled" /></el-form-item><el-form-item label="三四名决赛"><el-switch v-model="form.thirdPlaceEnabled" /></el-form-item><el-form-item label="淘汰赛平局"><el-select :key="`tie-break-${formRenderKey}`" v-model="form.knockoutTieBreak"><el-option label="加时赛 + 点球决胜" value="extra-penalties" /><el-option label="直接点球决胜" value="penalties" /></el-select><span class="select-value-overlay" aria-hidden="true">{{ form.knockoutTieBreak === 'penalties' ? '直接点球决胜' : '加时赛 + 点球决胜' }}</span></el-form-item></el-form></article>
          </section>
        </template>
      </template>

<template v-else-if="activeKey === 'eligibility'">
        <section class="eligibility-overview">
          <article class="panel-card eligibility-card"><h3><span>1</span>年龄与组别资格</h3><dl><div><dt>组别</dt><dd>U16年龄组</dd></div><div><dt>出生日期</dt><dd>2010.01.01—2011.12.31</dd></div><div><dt>参赛性别</dt><dd>混合组</dd></div><div><dt>超龄球员</dt><dd>{{ form.overageAllowed ? '受控申请' : '不允许' }}</dd></div></dl></article>
          <article class="panel-card eligibility-card"><h3><span>2</span>球队与赛事参赛名单</h3><dl><div><dt>球队上限</dt><dd>{{ form.expectedTeams }}支</dd></div><div><dt>每队球员人数</dt><dd>{{ form.minimumRoster }}—{{ form.rosterLimit }}人</dd></div><div><dt>教练人数</dt><dd>最多2人</dd></div></dl><p>参赛名单从球队长期球员库中选定，用于参加本赛事全部场次；与单场比赛的出场名单不同。</p></article>
          <article class="panel-card eligibility-card"><h3><span>3</span>报名与锁定</h3><dl><div><dt>报名截止</dt><dd>{{ form.registrationDeadline }}</dd></div><div><dt>截止前变更</dt><dd>需主办方审核</dd></div><div><dt>截止后锁定</dt><dd>球员、球队名称和队徽锁定，正常变更关闭</dd></div></dl></article>
          <article class="panel-card eligibility-card verification-card"><h3><span>4</span>资格核验开关</h3><div class="verification-switch"><span>实名认证</span><el-switch v-model="form.identityVerificationRequired" /><em>{{ form.identityVerificationRequired ? '必须核验' : '不要求（可选）' }}</em></div><div class="verification-switch"><span>标准形象照</span><el-switch v-model="form.portraitRequired" /><em>{{ form.portraitRequired ? '必须提交' : '建议补充（可选）' }}</em></div><div class="verification-switch"><span>身份证照片</span><el-switch v-model="form.identityVerificationRequired" /><em>未启用（随实名认证）</em></div><p>由主办方开启实名认证后可见。</p></article>
        </section>
        <section class="eligibility-checks"><div><el-icon><CircleCheckFilled /></el-icon><strong>年龄范围符合 U16 标准</strong><span>2010.01.01—2011.12.31</span></div><div><el-icon><CircleCheckFilled /></el-icon><strong>重复参赛核验</strong><span>同一球员仅代表一支球队</span></div><div><el-icon><CircleCheckFilled /></el-icon><strong>名单配额符合要求</strong><span>每队 {{ form.minimumRoster }}—{{ form.rosterLimit }} 人</span></div><div><el-icon><CircleCheckFilled /></el-icon><strong>球队认领已完成</strong><span>身份与归属已确认</span></div></section>
      </template>

<template v-else-if="activeKey === 'execution'">
        <section class="execution-overview"><div class="execution-notice"><el-icon><CircleCheck /></el-icon><span>参赛资格已保存，本页规则将同步给裁判端用于比赛执行。</span><strong>完成本页后进入：积分排名</strong></div><div class="execution-top-cards"><article class="panel-card execution-card"><h3>比赛形式与时间</h3><dl><div><dt>比赛人数</dt><dd>{{ form.playersOnField }}人制</dd></div><div><dt>比赛形式</dt><dd><el-radio-group v-model="form.periodMode"><el-radio-button label="halves">上下半场制</el-radio-button><el-radio-button label="single">分节制</el-radio-button></el-radio-group></dd></div><div><dt>单半场时长</dt><dd>{{ form.matchMinutes }}分钟</dd></div><div><dt>中场休息</dt><dd>{{ form.breakMinutes }}分钟</dd></div><div><dt>伤停补时</dt><dd>由主裁判决定</dd></div></dl></article><article class="panel-card execution-card"><h3>换人规则</h3><el-radio-group v-model="form.substitutionMode" class="substitution-toggle"><el-radio-button label="free">自由换人</el-radio-button><el-radio-button label="limited">限定换人</el-radio-button></el-radio-group><dl><div><dt>换人次数</dt><dd>{{ form.substitutionMode === 'limited' ? `${form.substitutionLimit}次` : '不限' }}</dd></div><div><dt>球员重复上场</dt><dd>允许</dd></div><div><dt>替补席人数</dt><dd>最多12人</dd></div></dl><p>选择限定换人后，才显示换人人数与次数设置。</p></article><article class="panel-card execution-card"><h3>到场与弃权处理</h3><dl><div><dt>迟到宽限</dt><dd>15分钟</dd></div><div><dt>最低开赛人数</dt><dd>7人</dd></div><div><dt>弃权判定</dt><dd>0:3负</dd></div><div><dt>比赛用球</dt><dd>5号球</dd></div></dl></article></div><section class="discipline-overview"><h3>红黄牌与纪律规则 <span>专业版 · 结构化记录</span></h3><div class="discipline-controls"><el-form label-position="left" label-width="108px"><el-form-item label="黄牌累计"><el-input-number v-model="form.yellowCardSuspension" :min="1" :max="10" /><span class="unit">张停赛1场</span></el-form-item><el-form-item label="直接红牌"><el-input-number v-model="form.redCardSuspension" :min="1" :max="10" /><span class="unit">场</span></el-form-item></el-form><div><span>两黄变一红</span><el-switch v-model="form.secondYellowRed" /></div><div><span>淘汰赛前清零</span><el-switch v-model="form.knockoutYellowReset" /></div><div><span>纪律事件关联</span><strong>必须关联正式名单球员</strong></div><div><span>停赛自动执行</span><el-switch v-model="form.disciplineEnabled" /></div></div></section><section class="referee-execution"><div><el-icon><CircleCheckFilled /></el-icon>赛前核验双方名单</div><div><el-icon><CircleCheckFilled /></el-icon>比赛事件实时记录</div><div><el-icon><CircleCheckFilled /></el-icon>赛后在线提交比赛报告</div><p>主办方仅查看与必要更正，不设置执法工作台。</p></section><div class="execution-summary"><el-icon><CircleCheckFilled /></el-icon><span>{{ form.playersOnField }}人制</span><span>上下半场制</span><span>单半场{{ form.matchMinutes }}分钟</span><span>中场{{ form.breakMinutes }}分钟</span><span>{{ form.substitutionMode === 'limited' ? '限定换人' : '自由换人' }}</span><span>迟到15分钟判定</span><span>黄牌{{ form.yellowCardSuspension }}张停赛1场</span><strong>规则校验通过</strong></div></section>
      </template>

      <template v-else-if="activeKey === 'rules'">
        <section class="simple-rules-grid">
          <article class="panel-card"><h3><span>1</span>球队参赛 <em>可配置</em></h3><el-form label-position="left" label-width="130px"><el-form-item label="参赛球队上限"><el-input-number v-model="form.expectedTeams" :min="2" :max="128" /></el-form-item><el-form-item label="报名截止时间"><el-input v-model="form.registrationDeadline" /></el-form-item><el-form-item label="截止后锁定队名与队徽"><el-switch v-model="form.lockRosterAfterDeadline" /></el-form-item></el-form><p>截止后如需变更，进入名单变更流程。</p></article>
          <article class="panel-card"><h3><span>2</span>比赛时间 <em>可配置</em></h3><el-form label-position="left" label-width="105px"><el-form-item label="比赛形式"><el-radio-group v-model="form.periodMode"><el-radio-button label="halves">上下半场制</el-radio-button><el-radio-button label="single">单节制</el-radio-button></el-radio-group></el-form-item><el-form-item label="单半场时长"><el-input-number v-model="form.matchMinutes" :min="10" :max="120" /><span class="unit">分钟</span></el-form-item><el-form-item label="中场休息"><el-input-number v-model="form.breakMinutes" :min="0" :max="30" /><span class="unit">分钟</span></el-form-item></el-form></article>
          <article class="panel-card"><h3><span>3</span>比赛执行 <em>可配置</em></h3><el-form label-position="left" label-width="96px"><el-form-item label="换人规则"><el-radio-group v-model="form.substitutionMode"><el-radio-button label="free">自由换人</el-radio-button><el-radio-button label="limited">限定换人</el-radio-button></el-radio-group></el-form-item><el-form-item label="比分录入"><el-switch v-model="form.scoreRequired" active-text="必须录入" /></el-form-item><el-form-item label="球员事件"><el-switch v-model="form.playerEventsEnabled" active-text="可选记录" /></el-form-item></el-form><p>简易版可人工填写号码/姓名，也可省略。</p></article>
          <article class="panel-card discipline-card"><h3><span>4</span>红黄牌纪律 <em>可配置</em></h3><el-form label-position="left" label-width="112px"><el-form-item label="黄牌累计"><el-input-number v-model="form.yellowCardSuspension" :min="1" :max="10" /><span class="unit">张停赛 1 场</span></el-form-item><el-form-item label="直接红牌"><el-input-number v-model="form.redCardSuspension" :min="1" :max="10" /><span class="unit">场</span></el-form-item><el-form-item label="两黄变一红"><el-switch v-model="form.secondYellowRed" /></el-form-item><el-form-item label="淘汰赛前清零"><el-switch v-model="form.knockoutYellowReset" /></el-form-item></el-form><p>简易版可人工填写号码或姓名，纪律处罚按本赛事累计。</p></article>
          <article class="panel-card default-rules"><h3>系统默认规则 <em>无需修改</em></h3><div><strong>小组赛积分</strong><span>胜 {{ form.winPoints }} / 平 {{ form.drawPoints }} / 负 {{ form.lossPoints }}</span></div><div><strong>同分排名</strong><span>{{ rankingLabel }}</span></div><div><strong>淘汰赛平局</strong><span>{{ knockoutTieBreakLabel }}</span></div></article>
        </section>
      </template>

<template v-else-if="activeKey === 'ranking'">
        <section class="ranking-notice"><el-icon><CircleCheck /></el-icon><span>比赛执行规则已保存，积分排名将用于小组赛实时排名。</span><strong>完成本页后进入：晋级规则</strong></section><section class="ranking-overview"><article class="panel-card ranking-points"><h3>积分设置</h3><div class="points-score"><div><span>胜</span><strong>{{ form.winPoints }}分</strong></div><div><span>平</span><strong>{{ form.drawPoints }}分</strong></div><div><span>负</span><strong>{{ form.lossPoints }}分</strong></div></div><dl><div><dt>弃权积分</dt><dd>0分</dd></div><div><dt>弃权比分</dt><dd>0:3</dd></div></dl><div class="ranking-toggle"><span>积分允许人工调整</span><el-switch v-model="form.manualRankingReview" /></div><small>特殊调整需生成变更记录</small></article><article class="panel-card ranking-tiebreak"><div class="ranking-card-heading"><h3>同分排名顺序</h3><span>仅比较同分球队之间的相互战绩</span><el-switch v-model="form.rankingRule" active-value="points-headtohead-goaldiff" inactive-value="points-goaldiff-goals" /></div><ol><li>相互比赛积分</li><li>相互比赛净胜球</li><li>相互比赛进球数</li><li>小组赛总净胜球</li><li>小组赛总进球数</li><li>公平竞赛积分</li><li>抽签决定</li></ol></article><article class="panel-card ranking-example"><div class="ranking-card-heading"><h3>排名示例</h3><span>按当前规则自动排序</span></div><table><thead><tr><th>排名</th><th>球队</th><th>场次</th><th>净胜球</th><th>积分</th></tr></thead><tbody><tr><td>1</td><td>郑州青训</td><td>3</td><td>+5</td><td>7</td></tr><tr><td>2</td><td>洛阳龙门</td><td>3</td><td>+3</td><td>6</td></tr><tr><td>3</td><td>开封未来</td><td>3</td><td>-1</td><td>4</td></tr><tr><td>4</td><td>南阳竞技</td><td>3</td><td>-7</td><td>0</td></tr></tbody></table></article></section><section class="ranking-checks"><div><el-icon><CircleCheckFilled /></el-icon>胜平负积分完整</div><div><el-icon><CircleCheckFilled /></el-icon>同分顺序无重复</div><div><el-icon><CircleCheckFilled /></el-icon>弃权处理已设置</div><div><el-icon><CircleCheckFilled /></el-icon>排名可自动计算</div></section><div class="ranking-summary"><el-icon><CircleCheckFilled /></el-icon><span>胜{{ form.winPoints }} / 平{{ form.drawPoints }} / 负{{ form.lossPoints }}</span><span>弃权0:3</span><span>7级同分比较</span><span>公平竞赛纳入排序</span><strong>排名校验通过</strong></div>
      </template>

<template v-else-if="activeKey === 'advancement'">
        <section class="advancement-notice"><el-icon><CircleCheck /></el-icon><span>积分排名规则已保存，晋级资格将按最终小组排名自动计算。</span><strong>完成本页后进入：规则定版</strong></section><section class="advancement-layout"><div class="advancement-left"><article class="panel-card advancement-card"><h3>晋级名额</h3><div class="advancement-meta"><span>小组数量</span><strong>{{ form.groupCount }}组</strong><span>每组晋级</span><strong>前{{ form.advancePerGroup }}名</strong></div><div class="advancement-total"><span>晋级球队</span><strong>{{ form.groupCount * form.advancePerGroup }}支</strong></div><div class="advancement-mode"><span>晋级方式</span><el-radio-group v-model="form.advancementRule"><el-radio-button label="group-top">小组排名自动晋级</el-radio-button><el-radio-button label="best-runner-up">手动指定晋级</el-radio-button></el-radio-group></div><p>A—D组前{{ form.advancePerGroup }}名，共{{ form.groupCount * form.advancePerGroup }}支球队进入淘汰赛。</p></article><article class="panel-card advancement-card"><h3>二次抽签规则</h3><dl><div><dt>抽签时间</dt><dd>小组赛结束后</dd></div><div><dt>种子池</dt><dd>各组第1名 · {{ form.groupCount }}支</dd></div><div><dt>非种子池</dt><dd>各组第2名 · {{ form.groupCount }}支</dd></div></dl><div class="advancement-switches"><span>种子对阵非种子</span><el-switch v-model="form.sameGroupAvoidance" /><span>同组球队回避</span><el-switch v-model="form.sameGroupAvoidance" /><span>同地区球队回避</span><el-switch v-model="form.sameGroupAvoidance" /></div></article><article class="panel-card advancement-card"><h3>退赛与空位处理</h3><dl><div><dt>抽签前退赛</dt><dd>同组下一名递补</dd></div><div><dt>抽签后退赛</dt><dd>对手直接晋级</dd></div></dl><div class="replacement-ok"><el-icon><CircleCheckFilled /></el-icon>递补需重新核验报名名单</div></article></div><article class="panel-card bracket-preview"><h3>8强晋级路径预览</h3><div class="bracket"><div class="bracket-column"><span>种子1<br /><b>vs</b><br />非种子1</span><span>种子2<br /><b>vs</b><br />非种子2</span><span>种子3<br /><b>vs</b><br />非种子3</span><span>种子4<br /><b>vs</b><br />非种子4</span></div><div class="bracket-middle"><span>4强</span><span>半决赛</span><span>决赛</span></div></div><p>实际对阵由淘汰赛二次抽签生成</p><div class="path-ok"><el-icon><CircleCheckFilled /></el-icon>路径校验通过</div></article></section><div class="advancement-summary"><el-icon><CircleCheckFilled /></el-icon><span>{{ form.groupCount }}组前{{ form.advancePerGroup }}名</span><span>共{{ form.groupCount * form.advancePerGroup }}支晋级</span><span>种子 / 非种子分池</span><span>同组回避</span><span>抽签前允许递补</span><strong>晋级校验通过</strong></div>
      </template>

      <template v-else>
        <section v-if="isProfessional" class="finalize-layout professional-finalize">
          <article class="finalize-main panel-card">
            <h3>规则方案</h3>
            <section class="final-rule-row"><span class="final-rule-number">1</span><div><h4>赛制结构</h4><p>{{ formatLabel }} · {{ form.groupCount }}组 × {{ form.teamsPerGroup }}支 · {{ groupCycleLabel }} · 每组前{{ form.advancePerGroup }}名晋级</p></div><em><el-icon><CircleCheckFilled /></el-icon>已完成</em><button type="button" @click="jumpToStep('format')">查看详情</button></section>
            <section class="final-rule-row"><span class="final-rule-number">2</span><div><h4>参赛资格</h4><p>U16年龄资格 · 每队{{ form.minimumRoster }}—{{ form.rosterLimit }}人 · 报名截止后锁定名单</p><p>实名与标准形象照按主办方开关核验，异常资料进入人工复核</p></div><em><el-icon><CircleCheckFilled /></el-icon>已完成</em><button type="button" @click="jumpToStep('eligibility')">查看详情</button></section>
            <section class="final-rule-row"><span class="final-rule-number">3</span><div><h4>比赛执行</h4><p>上场{{ form.playersOnField }}人 · {{ periodModeLabel }}每段{{ form.matchMinutes }}分钟 · 中场休息{{ form.breakMinutes }}分钟 · {{ substitutionModeLabel }}</p><p>红黄牌结构化记录 · 裁判报告关联正式名单 · 停赛自动执行</p></div><em><el-icon><CircleCheckFilled /></el-icon>已完成</em><button type="button" @click="jumpToStep('execution')">查看详情</button></section>
            <section class="final-rule-row"><span class="final-rule-number">4</span><div><h4>积分排名</h4><p>胜{{ form.winPoints }} / 平{{ form.drawPoints }} / 负{{ form.lossPoints }} · {{ rankingLabel }}</p></div><em><el-icon><CircleCheckFilled /></el-icon>已完成</em><button type="button" @click="jumpToStep('ranking')">查看详情</button></section>
            <section class="final-rule-row"><span class="final-rule-number">5</span><div><h4>晋级规则</h4><p>各组前{{ form.advancePerGroup }}名晋级 · 种子队 / 非种子队分池 · 同组回避 · 抽签前允许递补</p></div><em><el-icon><CircleCheckFilled /></el-icon>已完成</em><button type="button" @click="jumpToStep('advancement')">查看详情</button></section>
            <div class="final-check"><el-icon><CircleCheckFilled /></el-icon>规则检查通过，竞赛规程预览稿已生成。</div>
          </article>
          <aside class="finalize-side-stack">
            <section class="finalize-aside panel-card"><h3>定版信息</h3><dl><div><dt>方案版本</dt><dd>Draft {{ draftVersion }}</dd></div><div><dt>当前状态</dt><dd class="warning">待定版</dd></div><div><dt>创建人</dt><dd>赛事管理员</dd></div><div><dt>最后保存</dt><dd>{{ lastSavedText }}</dd></div></dl></section>
            <section class="regulation-card panel-card"><header><h3>竞赛规程自动生成</h3><span>预览稿已生成</span></header><div class="regulation-content"><el-icon><Document /></el-icon><div><p>系统已根据当前规则生成《{{ division.name || '当前组别' }}竞赛规程》</p><small>包含章节</small><div class="regulation-tags"><span>赛制结构</span><span>参赛资格</span><span>比赛办法</span><span>积分排名</span><span>晋级规则</span><span>纪律处罚</span></div></div></div><div class="regulation-actions"><el-button plain :icon="View" @click="printRules">预览规程</el-button><el-button plain :icon="Document" @click="exportRules">导出 Word</el-button></div><p class="regulation-note">规则修改后，规程内容与版本号自动同步更新。</p></section>
            <div class="final-lock-warning"><el-icon><WarningFilled /></el-icon><span>本次确认赛制与规则并生成竞赛规程；<br />最终竞赛方案将在赛程确认后锁定。</span></div>
          </aside>
        </section>
        <section v-else class="finalize-layout">
          <article class="finalize-main panel-card">
            <h3>{{ division.name || '当前组别' }}竞赛规则定版</h3>
            <section class="summary-section"><div class="summary-heading"><span>1</span><h4>赛制设置</h4><em><el-icon><CircleCheckFilled /></el-icon>已完成</em><button type="button" @click="jumpToStep('format')">修改</button></div><div class="summary-items"><span><el-icon><Trophy /></el-icon>{{ formatLabel }}</span><span>{{ form.expectedTeams }} 支球队 / {{ form.groupCount }} 组</span><span>{{ groupCycleLabel }}</span><span>前 {{ form.advancePerGroup }} 名晋级</span></div></section>
            <section class="summary-section"><div class="summary-heading"><span>2</span><h4>基础规则</h4><em><el-icon><CircleCheckFilled /></el-icon>已完成</em><button type="button" @click="jumpToStep('rules')">修改</button></div><div class="summary-items"><span>上场 {{ form.playersOnField }} 人</span><span>{{ periodModeLabel }} · {{ form.matchMinutes }} 分钟</span><span>中场 {{ form.breakMinutes }} 分钟</span><span>{{ substitutionModeLabel }}</span><span>胜 {{ form.winPoints }} / 平 {{ form.drawPoints }} / 负 {{ form.lossPoints }}</span></div></section>
            <section class="system-summary"><h4>系统默认规则</h4><span>小组赛积分按已配置值计算</span><span>同分排名：{{ rankingLabel }}</span><span>淘汰赛平局：{{ knockoutTieBreakLabel }}</span></section>
          </article>
          <aside class="finalize-aside panel-card"><h3>定版信息</h3><dl><div><dt>组别</dt><dd>{{ division.name || '竞赛组别' }}</dd></div><div><dt>参赛球队</dt><dd>{{ form.expectedTeams }} 支</dd></div><div><dt>当前草稿</dt><dd>{{ draftVersion }}</dd></div><div><dt>状态</dt><dd class="warning">待定版</dd></div><div><dt>最后保存</dt><dd>{{ lastSavedText }}</dd></div></dl><hr /><h4>启用后影响</h4><div class="impact-tags"><span>抽签分组</span><span>赛程编排</span><span>积分排名</span></div><el-alert type="warning" :closable="false" title="本次仅确认当前组别规则；已生成的赛程与历史比赛快照不会被改写。" /></aside>
        </section>
      </template>
    </main>

    <main v-else class="effective-layout" :class="{ 'professional-effective': isProfessional }">
      <template v-if="isProfessional">
        <article class="effective-main panel-card">
          <h3>{{ division.name || '当前组别' }}专业竞赛规则 <strong>{{ division.rulesVersion || draftVersion }} · 已生效</strong></h3>
          <section class="effective-rule-row"><span class="final-rule-number">1</span><div><h4>赛制结构</h4><p>{{ formatLabel }} · {{ form.groupCount }}组 × {{ form.teamsPerGroup }}支 · {{ groupCycleLabel }} · {{ form.groupCount * form.advancePerGroup }}强单淘汰 · 每组前{{ form.advancePerGroup }}名晋级</p></div><em><el-icon><CircleCheckFilled /></el-icon>已生效</em></section>
          <section class="effective-rule-row"><span class="final-rule-number">2</span><div><h4>参赛资格</h4><p>U16年龄组 · 最多{{ form.expectedTeams }}支球队 · 每队最多{{ form.rosterLimit }}人 · 报名截止后名单锁定</p><p>正式参赛名单从球队长期球员库中选定，需完成球队确认</p></div><em><el-icon><CircleCheckFilled /></el-icon>已生效</em></section>
          <section class="effective-rule-row"><span class="final-rule-number">3</span><div><h4>比赛执行</h4><p>{{ form.playersOnField }}人制 · {{ periodModeLabel }} · 单段{{ form.matchMinutes }}分钟 · 中场{{ form.breakMinutes }}分钟 · {{ substitutionModeLabel }} · 弃权0:3</p><p>比赛事件、裁判报告和纪律处罚关联正式赛事名单</p></div><em><el-icon><CircleCheckFilled /></el-icon>已生效</em></section>
          <section class="effective-rule-row"><span class="final-rule-number">4</span><div><h4>报名与锁定</h4><p>报名截止时间：{{ form.registrationDeadline || '按赛事公告执行' }}</p><p>报名截止后，球员、球队名称及队徽锁定；正常变更进入受控申请</p></div><em><el-icon><CircleCheckFilled /></el-icon>已生效</em></section>
          <section class="effective-rule-row"><span class="final-rule-number">5</span><div><h4>积分排名与晋级</h4><p>胜{{ form.winPoints }} / 平{{ form.drawPoints }} / 负{{ form.lossPoints }} · {{ rankingLabel }}</p><p>每组前{{ form.advancePerGroup }}名晋级 · 种子 / 非种子分池 · 同组回避 · 抽签前允许递补</p></div><em><el-icon><CircleCheckFilled /></el-icon>已生效</em></section>
        </article>
        <aside class="effective-aside panel-card"><div class="aside-title"><h3>定版信息</h3><strong>已生效</strong></div><dl><div><dt>当前版本</dt><dd>{{ division.rulesVersion || draftVersion }}</dd></div><div><dt>状态</dt><dd class="effective-state">已生效</dd></div><div><dt>定版人</dt><dd>{{ division.finalizedByName || '赛事管理员' }}</dd></div><div><dt>定版时间</dt><dd>{{ finalizedTimeText }}</dd></div><div><dt>基于版本</dt><dd>V1.0</dd></div></dl><hr /><h4>启用后影响</h4><div class="impact-tags effective-impact"><span>抽签分组</span><span>赛程编排</span><span>积分排名</span><span>比赛执行</span></div><div class="effective-warning"><el-icon><WarningFilled /></el-icon><span>已进入正式比赛管理，版本不可降级；规则调整将生成新版本并保留审计，不能解除报名截止后的身份锁定。</span></div><div class="effective-export-actions"><el-button plain :icon="Printer" @click="printRules">打印预览</el-button><el-button type="primary" :icon="Document" @click="exportRules">导出{{ division.name || '当前组别' }}规则</el-button></div></aside>
      </template>
      <template v-else>
        <article class="effective-main panel-card">
          <h3>{{ division.name || '当前组别' }}竞赛规则 <strong>{{ division.rulesVersion || draftVersion }} · 已生效</strong></h3>
          <section class="summary-section effective-section"><div class="summary-heading"><span>1</span><h4>赛制设置</h4><em><el-icon><CircleCheckFilled /></el-icon>已生效</em></div><div class="summary-items"><span>{{ formatLabel }}</span><span>{{ form.expectedTeams }} 支球队 / {{ form.groupCount }} 组</span><span>{{ groupCycleLabel }}</span><span>前 {{ form.advancePerGroup }} 名晋级</span></div></section>
          <section class="summary-section effective-section"><div class="summary-heading"><span>2</span><h4>基础规则</h4><em><el-icon><CircleCheckFilled /></el-icon>已生效</em></div><div class="summary-items"><span>{{ periodModeLabel }}</span><span>单段 {{ form.matchMinutes }} 分钟</span><span>中场 {{ form.breakMinutes }} 分钟</span><span>{{ substitutionModeLabel }}</span><span>{{ rankingLabel }}</span></div></section>
        </article>
        <aside class="effective-aside panel-card"><div class="aside-title"><h3>定版信息</h3><strong>已生效</strong></div><dl><div><dt>当前版本</dt><dd>{{ division.rulesVersion || draftVersion }}</dd></div><div><dt>定版时间</dt><dd>{{ finalizedTimeText }}</dd></div><div><dt>定版人</dt><dd>{{ division.finalizedByName || '赛事管理员' }}</dd></div></dl><hr /><h4>影响范围</h4><div class="impact-tags"><span>抽签分组</span><span>赛程编排</span><span>积分排名</span></div><el-alert type="warning" :closable="false" title="已进入正式竞赛管理，规则调整将生成新版本并保留审计记录。" /></aside>
      </template>
    </main>

    <footer class="wizard-footer">
      <div class="footer-summary"><el-icon><CircleCheck /></el-icon><span>{{ footerSummary }}</span></div>
      <div class="footer-actions">
        <template v-if="effective"><el-button plain @click="backToDivisions">返回组别管理</el-button><el-button plain @click="goToDraw">进入抽签分组</el-button><el-button type="primary" @click="goToSchedule">进入赛程管理</el-button></template>
        <template v-else>
          <el-button v-if="activeIndex > 0 && (activeKey !== 'finalize' || !isProfessional)" :disabled="saving" @click="previous">上一步</el-button>
          <el-button v-if="activeKey !== 'finalize'" type="primary" :loading="saving" :disabled="!canManage" @click="next">{{ nextButtonText }} <el-icon><ArrowRight /></el-icon></el-button>
          <el-button v-else plain :icon="Printer" @click="printRules">打印预览</el-button>
          <el-button v-if="activeKey === 'finalize' && isProfessional" plain :icon="View" @click="printRules">预览竞赛规程</el-button>
          <el-button v-if="activeKey === 'finalize'" type="primary" :loading="saving" :disabled="!canManage" @click="finalize">确认规则并进入球队管理</el-button>
        </template>
      </div>
    </footer>
    <el-alert v-if="!canManage" class="permission-alert" type="warning" :closable="false" show-icon title="你只有查看该赛事的权限，不能修改竞赛规则。" />
  </section>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Back, Calendar, Check, CircleCheck, CircleCheckFilled, Document, Grid, Location, MagicStick, Printer, Tickets, Trophy, View, WarningFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { confirmDivisionRules, queryById, updateRecord } from '../../utils/cloud'
import { permissions } from '../../utils/permissions'
import { getVisualQaSnapshot, visualQaActive } from '../../utils/visualQaFixtures'

const route = useRoute()
const router = useRouter()
const tournamentId = String(route.params.id || '')
const divisionId = String(route.query.divisionId || '')
const localVisualQa = typeof window !== 'undefined' && window.location.hostname === '127.0.0.1' && window.location.href.includes('visualQa=1')
const localEffectiveQa = localVisualQa && window.location.href.includes('step=effective')
const localProfessionalQa = localVisualQa && (divisionId === 'qa-division-u16' || window.location.href.includes('mode=professional'))
const loading = ref(false)
const saving = ref(false)
const tournament = ref(localVisualQa ? { name: '2026河南青少年足球冠军联赛', status: 'ongoing', divisionCount: 5, startDate: '2026-07-20', endDate: '2026-08-18', region: '河南省' } : {})
const division = ref(localVisualQa ? { _id: 'qa-division-u16', name: 'U16组', mode: localProfessionalQa ? 'professional' : 'simple', isProfessional: localProfessionalQa, rulesLocked: localEffectiveQa, ruleFinalized: localEffectiveQa, ruleStatus: localEffectiveQa ? 'finalized' : 'draft', ruleProgress: localEffectiveQa ? 100 : 0, expectedTeams: 16, groupCount: 4, teamsPerGroup: 4, groupCycle: 'single', advancePerGroup: 2, formatType: 'cup', draftVersion: 'V1.1', rulesVersion: localEffectiveQa && localProfessionalQa ? 'V1.1' : 'V1.0' } : {})
const activeIndex = ref(0)
const lastSavedAt = ref(null)
const formRenderKey = ref(0)

const simpleSteps = [
  { key: 'format', title: '赛制设置', description: '确定比赛结构' },
  { key: 'rules', title: '基础规则', description: '设置比赛基础' },
  { key: 'finalize', title: '规则定版', description: '生成最终规则' }
]
const professionalSteps = [
  { key: 'format', title: '赛制结构', description: '设置阶段结构' },
  { key: 'eligibility', title: '参赛资格', description: '资格与名单准入' },
  { key: 'execution', title: '比赛执行', description: '现场与纪律规则' },
  { key: 'ranking', title: '积分排名', description: '积分和同分规则' },
  { key: 'advancement', title: '晋级规则', description: '晋级名额与方式' },
  { key: 'finalize', title: '规则定版', description: '确认并锁定' }
]
const formats = [
  { value: 'cup', label: '杯赛制', description: '小组赛 + 淘汰赛', icon: Trophy },
  { value: 'tournament', label: '赛会制', description: '单淘汰为主', icon: Calendar },
  { value: 'league', label: '联赛制', description: '单循环 / 双循环', icon: Grid },
  { value: 'hybrid', label: '混合制', description: '联赛阶段 + 淘汰赛', icon: Tickets }
]
const form = reactive({
  formatType: 'cup', expectedTeams: 16, groupCount: 4, teamsPerGroup: 4, groupCycle: 'single', advancePerGroup: 2,
  knockoutSize: 8, knockoutType: 'single', knockoutLegs: 'single', bracketSource: 'redraw', venueMode: 'centralized', homeAwayEnabled: false, thirdPlaceEnabled: true, knockoutTieBreak: 'extra-penalties',
  birthDateCutoff: '', rosterLimit: 30, minimumRoster: 11, identityVerificationRequired: true, eligibilityReviewRequired: true, portraitRequired: true, overageAllowed: false, exceptionPolicy: 'return',
  registrationDeadline: '2026-07-15 18:00', lockRosterAfterDeadline: true, periodMode: 'halves', matchMinutes: 35, breakMinutes: 10, playersOnField: 11, substitutionMode: 'free', substitutionLimit: 5, scoreRequired: true, playerEventsEnabled: true, refereeReportRequired: true,
  disciplineEnabled: true, yellowCardSuspension: 2, redCardSuspension: 1, secondYellowRed: true, knockoutYellowReset: false,
  winPoints: 3, drawPoints: 1, lossPoints: 0, rankingRule: 'points-headtohead-goaldiff', awayGoalsEnabled: false, liveRankingEnabled: true, manualRankingReview: false,
  advancementRule: 'group-top', sameGroupAvoidance: true
})

const isProfessional = computed(() => division.value.mode === 'professional' || division.value.isProfessional === true || division.value.plan === 'professional')
const steps = computed(() => isProfessional.value ? professionalSteps : simpleSteps)
const activeKey = computed(() => steps.value[activeIndex.value]?.key || 'finalize')
const effective = computed(() => division.value.rulesLocked === true || ['finalized', 'locked', 'published'].includes(String(division.value.ruleStatus || '').toLowerCase()))
const canManage = computed(() => permissions.tournament.manage(tournament.value))
const tournamentLogo = computed(() => tournament.value.logoTransparentUrl || tournament.value.logoUrl || tournament.value.logo || '')
const divisionCount = computed(() => Math.max(Number(tournament.value.divisionCount || 0), Array.isArray(tournament.value.divisions) ? tournament.value.divisions.length : 0, 1))
const tournamentStatus = computed(() => ({ draft: '筹备中', registering: '报名中', upcoming: '即将开始', ongoing: '进行中', completed: '已结束', finished: '已结束' })[tournament.value.status] || '筹备中')
const dateRange = computed(() => tournament.value.startDate && tournament.value.endDate ? `${formatDate(tournament.value.startDate)}—${formatDate(tournament.value.endDate)}` : '日期待定')
const formatLabel = computed(() => formats.find(item => item.value === form.formatType)?.label || '待设置')
const selectedFormatDescription = computed(() => ({ cup: '先进行小组赛确定晋级名额，再进入淘汰赛决出最终名次。', tournament: '在集中赛期内以淘汰赛为主完成全部场次。', league: '所有球队按单循环或双循环积分排名。', hybrid: '先完成联赛阶段，再根据排名进入淘汰赛。' })[form.formatType])
const rankingLabel = computed(() => form.rankingRule === 'points-goaldiff-goals' ? '积分 → 净胜球 → 进球数' : '积分 → 相互战绩 → 净胜球')
const groupCycleLabel = computed(() => form.groupCycle === 'double' ? '小组双循环' : '小组单循环')
const periodModeLabel = computed(() => form.periodMode === 'single' ? '单节制' : '上下半场制')
const substitutionModeLabel = computed(() => form.substitutionMode === 'limited' ? `限定换人 ${form.substitutionLimit} 次` : '自由换人')
const knockoutTieBreakLabel = computed(() => form.knockoutTieBreak === 'penalties' ? '直接点球决胜' : '加时赛 + 点球决胜')
const modeStateText = computed(() => effective.value ? `${isProfessional.value ? '专业模式' : '简易模式'} · 已锁定` : `${isProfessional.value ? '专业模式' : '简易模式'} · ${activeKey.value === 'finalize' ? '待定版' : '当前配置'}`)
const pageSubtitle = computed(() => {
  if (effective.value) return `查看${division.value.name || '当前组别'}已定版的竞赛规则。`
  if (!isProfessional.value) return '配置球队级赛制与基础比赛规则'
  return ({ format: '专业配置赛制阶段与比赛结构', eligibility: `设置${division.value.name || '当前组别'}的球队与球员参赛资格`, execution: '设置比赛现场执行与纪律规则', ranking: '设置积分与同分排名规则', advancement: '设置晋级名额与对阵规则', finalize: '确认专业版竞赛规则并定版' })[activeKey.value] || '专业配置赛制阶段与比赛结构'
})
const scopeNotice = computed(() => isProfessional.value ? `当前修改仅作用于 ${division.value.name || '本组别'}，保存草稿不会改写已生效版本或历史比赛快照。` : '本流程只确定球队级赛制与分组结构，不建立球员名单。')
const draftVersion = computed(() => division.value.draftVersion || division.value.rulesVersionDraft || 'V1.1')
const lastSavedText = computed(() => lastSavedAt.value ? formatDateTime(lastSavedAt.value) : formatDateTime(division.value.updateTime || new Date()))
const finalizedTimeText = computed(() => formatDateTime(division.value.finalizedAt || division.value.updateTime || new Date()))
const nextButtonText = computed(() => `保存并进入${steps.value[activeIndex.value + 1]?.title || '下一步'}`)
const footerSummary = computed(() => {
  if (effective.value) return `${division.value.name || '当前组别'}规则已完成定版，可用于本组抽签、赛程和积分计算。`
  if (activeKey.value === 'format') return `${form.expectedTeams} 支球队 · ${form.groupCount} 个小组 · ${groupCycleLabel.value} · 前 ${form.advancePerGroup} 名晋级`
  if (activeKey.value === 'finalize') return '规则可定版，确认后进入球队管理。'
  return `当前步骤：${steps.value[activeIndex.value]?.title || '规则配置'}，保存后进入下一步。`
})

function syncActiveStep() {
  if (effective.value) { activeIndex.value = steps.value.length - 1; return }
  const requested = String(route.query.step || 'format')
  const found = steps.value.findIndex(item => item.key === requested)
  activeIndex.value = found >= 0 ? found : 0
}

async function load() {
  const visualSnapshot = window.location.hostname === '127.0.0.1' && window.location.href.includes('visualQa=1')
    ? (window.__sxfVisualQaSnapshot || getVisualQaSnapshot())
    : null
  if (visualSnapshot) {
    tournament.value = visualSnapshot.tournament?.name ? visualSnapshot.tournament : { name: '2026河南青少年足球冠军联赛', status: 'ongoing', divisionCount: 5, startDate: '2026-07-20', endDate: '2026-08-18', region: '河南省' }
    const source = visualSnapshot.divisions.find(item => String(item._id || item.id) === 'qa-division-u16') || {}
    const effectiveSnapshot = localEffectiveQa
    const professionalSnapshot = localProfessionalQa
    division.value = { ...source, mode: professionalSnapshot ? 'professional' : 'simple', isProfessional: professionalSnapshot, rulesLocked: effectiveSnapshot, ruleFinalized: effectiveSnapshot, ruleStatus: effectiveSnapshot ? 'finalized' : 'draft', ruleProgress: effectiveSnapshot ? 100 : 0, name: 'U16组', expectedTeams: 16, groupCount: 4, teamsPerGroup: 4, groupCycle: 'single', advancePerGroup: 2, formatType: 'cup', draftVersion: 'V1.1', rulesVersion: effectiveSnapshot && professionalSnapshot ? 'V1.1' : 'V1.0' }
    hydrateForm(division.value)
    if (professionalSnapshot) Object.assign(form, { birthDateCutoff: '2011-12-31', rosterLimit: 25, minimumRoster: 18, identityVerificationRequired: false, portraitRequired: false, eligibilityReviewRequired: true, overageAllowed: false, exceptionPolicy: 'manual' })
    syncActiveStep()
    return
  }
  if (!divisionId) { ElMessage.error('缺少竞赛组别参数'); backToDivisions(); return }
  loading.value = true
  try {
    const [currentTournament, currentDivision] = await Promise.all([queryById('tournaments', tournamentId), queryById('divisions', divisionId)])
    tournament.value = Array.isArray(currentTournament) ? currentTournament[0] || {} : currentTournament || {}
    division.value = Array.isArray(currentDivision) ? currentDivision[0] || {} : currentDivision || {}
    hydrateForm(division.value)
    syncActiveStep()
  } catch (error) {
    ElMessage.error(error.message || '读取组别规则失败')
  } finally {
    loading.value = false
  }
}

function hydrateForm(source) {
  const keys = Object.keys(form)
  keys.forEach(key => { if (source[key] !== undefined && source[key] !== null) form[key] = source[key] })
  form.formatType = source.formatType || source.tournamentType || form.formatType
  form.expectedTeams = Number(source.expectedTeams || source.teamCount || form.expectedTeams)
  form.matchMinutes = Number(source.matchMinutes || form.matchMinutes)
  form.playersOnField = Number(source.playersOnField || form.playersOnField)
  formRenderKey.value += 1
}

function rulePayload(progress) {
  return { ...form, mode: isProfessional.value ? 'professional' : 'simple', isProfessional: isProfessional.value, ruleStatus: 'draft', ruleProgress: progress, updateTime: new Date() }
}

async function save(progress) {
  if (!canManage.value) return false
  saving.value = true
  try {
    const payload = rulePayload(progress)
    await updateRecord('divisions', divisionId, payload)
    Object.assign(division.value, payload)
    lastSavedAt.value = new Date()
    return true
  } catch (error) {
    ElMessage.error(error.message || '保存规则失败')
    return false
  } finally {
    saving.value = false
  }
}

async function next() {
  const progress = Math.round(((activeIndex.value + 1) / steps.value.length) * 100)
  if (!await save(progress)) return
  activeIndex.value = Math.min(activeIndex.value + 1, steps.value.length - 1)
  replaceStep(activeKey.value)
}

function previous() { activeIndex.value = Math.max(0, activeIndex.value - 1); replaceStep(activeKey.value) }
function goToCompletedStep(index) { if (effective.value) return; if (index <= activeIndex.value) { activeIndex.value = index; replaceStep(activeKey.value) } }
function jumpToStep(key) { const index = steps.value.findIndex(item => item.key === key); if (index >= 0) { activeIndex.value = index; replaceStep(key) } }
function replaceStep(step) { router.replace({ query: { ...route.query, divisionId, step } }) }

async function finalize() {
  if (!canManage.value) return
  saving.value = true
  try {
    const result = await confirmDivisionRules(divisionId, {
      ...form,
      mode: isProfessional.value ? 'professional' : 'simple',
      isProfessional: isProfessional.value
    })
    if (!result?.success) {
      if (result?.code === 'DIVISION_ENTITLEMENT_REQUIRED') {
        throw new Error('专业版尚未开通，完成专业版权益后才能定版')
      }
      throw new Error(result?.error || '竞赛规则定版失败')
    }
    Object.assign(division.value, result.data || {})
    ElMessage.success('规则已定版并生效')
    router.push({ path: `/tournaments/${tournamentId}/teams`, query: { divisionId } })
  } catch (error) {
    ElMessage.error(error.message || '规则定版失败')
  } finally {
    saving.value = false
  }
}

function stepStatusText(index) { if (effective.value) return index === steps.value.length - 1 ? '已完成' : '已生效'; if (index < activeIndex.value) return '已完成'; if (index === activeIndex.value) return isProfessional.value ? '当前步骤' : steps.value[index].description; return isProfessional.value ? '待配置' : steps.value[index].description }
function backToDivisions() { router.push(`/tournaments/${tournamentId}/competition`) }
function goToDraw() { router.push({ path: `/tournaments/${tournamentId}/draw`, query: { divisionId } }) }
function goToSchedule() { router.push({ path: `/tournaments/${tournamentId}/schedule`, query: { divisionId } }) }
function exitTournament() { router.push('/tournament-space') }
function printRules() { window.print() }
function escapeDocumentText(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}
function exportRules() {
  const title = escapeDocumentText(`${division.value.name || '竞赛组别'}竞赛规程`)
  const sections = [
    ['一、赛制结构', `${formatLabel.value}；${form.expectedTeams}支球队分为${form.groupCount}组，每组${form.teamsPerGroup}支，${groupCycleLabel.value}，每组前${form.advancePerGroup}名晋级。`],
    ['二、参赛资格', `每队赛事名单${form.minimumRoster}—${form.rosterLimit}人，报名截止后按赛事名单快照执行。`],
    ['三、比赛办法', `上场${form.playersOnField}人，${periodModeLabel.value}每段${form.matchMinutes}分钟，中场休息${form.breakMinutes}分钟，${substitutionModeLabel.value}。`],
    ['四、积分排名', `胜${form.winPoints}分、平${form.drawPoints}分、负${form.lossPoints}分；同分排名按${rankingLabel.value}。`],
    ['五、晋级规则', `各组前${form.advancePerGroup}名晋级，种子队与非种子队分池，执行同组回避及赛前递补核验。`],
    ['六、纪律处罚', `红黄牌与停赛按结构化比赛事件执行；淘汰赛平局采用${knockoutTieBreakLabel.value}。`]
  ]
  const body = sections.map(([heading, content]) => `<h2>${escapeDocumentText(heading)}</h2><p>${escapeDocumentText(content)}</p>`).join('')
  const documentHtml = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:"Microsoft YaHei",sans-serif;padding:32px;color:#17231c}h1{text-align:center}h2{margin-top:24px;font-size:18px}p{line-height:1.8}</style></head><body><h1>${title}</h1><p>方案版本：Draft ${escapeDocumentText(draftVersion.value)}</p>${body}</body></html>`
  const blob = new Blob(['\ufeff', documentHtml], { type: 'application/msword;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${division.value.name || '竞赛组别'}-竞赛规程-${draftVersion.value}.doc`
  link.click()
  URL.revokeObjectURL(url)
}
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '日期待定' : `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}` }
function formatDateTime(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '尚未保存' : `${formatDate(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` }

watch(() => route.query.step, syncActiveStep, { immediate: true })
onMounted(() => {
  load()
  if (import.meta.env.DEV) window.addEventListener('sxf-visual-qa-ready', load)
})
onUnmounted(() => window.removeEventListener('sxf-visual-qa-ready', load))
</script>

<style scoped>
.rules-page { width:100%; max-width:var(--admin-content-max-width); margin:0 auto; padding-bottom:96px; color:#17231c; }
.tournament-header { display:flex; min-height:74px; align-items:center; justify-content:space-between; margin:0 calc(var(--admin-content-gutter-x) * -1); padding:0 var(--admin-content-gutter-x); border-bottom:1px solid #e2e7e4; background:#fff; }
.tournament-identity { display:flex; min-width:0; align-items:center; gap:13px; }.tournament-identity>img,.logo-placeholder { width:46px; height:46px; flex:0 0 46px; object-fit:contain; }.logo-placeholder { display:grid; place-items:center; color:#087c43; font-size:24px; }.tournament-identity h1 { overflow:hidden; margin:0 7px 0 0; font-size:23px; text-overflow:ellipsis; white-space:nowrap; }.header-chip,.status-chip,.mode-state,.draft-version { padding:5px 10px; border:1px solid #c5e1ff; border-radius:5px; color:#1680df; font-size:13px; white-space:nowrap; }.status-chip,.mode-state { border-color:#bde3c9; color:#147b43; background:#f2faf4; }.header-meta { display:flex; align-items:center; gap:6px; margin-left:8px; color:#526159; font-size:13px; white-space:nowrap; }
.page-heading { display:flex; align-items:flex-start; justify-content:space-between; margin:27px 0 18px; }.title-line,.heading-actions { display:flex; align-items:center; gap:15px; }.page-heading h2 { margin:0; font-size:29px; }.page-heading p { margin:8px 0 0; color:#65736b; font-size:14px; }.mode-state.professional { border-color:#e7c36c; color:#8f6500; background:#fffaf0; }.heading-actions { gap:18px; }.division-selector { width:235px; }.draft-version { border:0; color:#555f59; background:#f1f3f2; }
.rule-steps { position:relative; display:flex; align-items:flex-start; max-width:980px; margin:0 auto 24px; }.rule-steps.professional { max-width:none; padding-top:28px; }.step-counter { position:absolute; top:4px; left:0; color:#087c43; font-size:14px; font-weight:600; }.step-item { display:flex; width:110px; flex:0 0 110px; flex-direction:column; align-items:center; gap:6px; padding:0; border:0; color:#18231d; background:transparent; }.step-item:not(:disabled) { cursor:pointer; }.step-circle { display:grid; width:40px; height:40px; place-items:center; border:1px solid #d6dcda; border-radius:50%; color:#303632; font-size:19px; background:#f5f6f6; }.step-item.active .step-circle,.step-item.done .step-circle { border-color:#087c43; color:#fff; background:#087c43; }.step-item.done:not(.active) .step-circle { color:#087c43; background:#fff; }.step-item strong { font-size:15px; }.step-item small { color:#6d7972; font-size:12px; white-space:nowrap; }.step-item.active strong,.step-item.active small,.step-item.done strong { color:#087c43; }.step-item.locked .step-circle { color:#858b87; }.step-line { height:2px; flex:1; margin-top:19px; background:#d4d9d6; }.step-line.done { background:#087c43; }
.scope-alert { min-height:58px; margin-bottom:20px; border:1px solid #c2dfcb; background:#f8fcf9; }.wizard-content { min-height:440px; }.panel-card { border:1px solid #dfe6e2; border-radius:9px; background:#fff; box-shadow:0 2px 10px rgba(23,55,35,.035); }.panel-card h3 { margin:0 0 20px; font-size:18px; }.format-picker { float:left; width:52%; min-height:380px; padding:22px; }.format-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; }.format-grid button { position:relative; display:flex; min-height:184px; flex-direction:column; align-items:center; justify-content:center; gap:15px; padding:18px 10px; border:1px solid #dce3df; border-radius:8px; color:#171d19; background:#fff; cursor:pointer; }.format-grid button.selected { border-color:#0a8649; color:#087c43; box-shadow:0 0 0 1px #0a8649 inset; }.format-grid button>.el-icon:first-child { font-size:40px; }.format-grid button span { text-align:center; }.format-grid button strong,.format-grid button small { display:block; }.format-grid button strong { font-size:17px; }.format-grid button small { margin-top:9px; color:#4f5c54; font-size:12px; }.selected-check { position:absolute; top:10px; right:10px; color:#087c43; }.format-description { margin:28px 0 0; color:#76837b; line-height:1.7; }.format-description strong { display:block; margin-bottom:7px; color:#28342d; }
.basic-format-settings { float:right; width:50%; width:calc(48% - 20px); min-height:380px; padding:22px 26px; }.basic-format-settings :deep(.el-form-item) { margin-bottom:9px; }.basic-format-settings :deep(.el-input-number),.basic-format-settings :deep(.el-select) { width:100%; }.auto-result { display:flex; align-items:center; gap:9px; margin-top:8px; padding:15px; border:1px solid #c9dfd0; border-radius:7px; color:#24372c; background:#f9fcfa; }.auto-result .el-icon { color:#078344; font-size:22px; }.format-picker.professional{float:none;width:auto;min-height:0;padding:0;border:0;background:transparent;box-shadow:none}.format-picker.professional>h3,.format-picker.professional .format-description{display:none}.format-picker.professional .format-grid{gap:18px}.format-picker.professional .format-grid button{min-height:88px;flex-direction:row;justify-content:flex-start;gap:16px;padding:16px 24px;text-align:left}.format-picker.professional .format-grid button>.el-icon:first-child{font-size:34px}.format-picker.professional .format-grid button span{text-align:left}.format-picker.professional .format-grid button strong{font-size:18px}.format-picker.professional .format-grid button small{margin-top:5px}.professional-settings { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; clear:both; margin-top:18px; }.professional-settings .panel-card { padding:20px 22px; }.professional-settings :deep(.el-form-item) { margin-bottom:9px; }.professional-settings :deep(.el-input-number),.professional-settings :deep(.el-select) { width:100%; }
.simple-rules-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.simple-rules-grid .panel-card{min-height:232px;padding:22px 25px}.simple-rules-grid h3{display:flex;align-items:center;gap:10px}.simple-rules-grid h3>span{display:grid;width:39px;height:39px;place-items:center;border-radius:50%;color:#fff;background:#087c43}.simple-rules-grid h3 em{margin-left:auto;padding:3px 7px;border-radius:4px;color:#138044;background:#edf8f0;font-size:12px;font-style:normal}.simple-rules-grid :deep(.el-form-item){margin-bottom:11px}.simple-rules-grid :deep(.el-input-number){width:100%}.simple-rules-grid p{margin:9px 0 0;color:#6e7b73;font-size:12px;line-height:1.6}.simple-rules-grid .unit{margin-left:8px;color:#526158;font-size:13px;white-space:nowrap}.discipline-card{grid-column:span 2}.default-rules{display:grid;grid-template-columns:1fr;align-content:start;gap:14px}.default-rules h3{grid-column:1/-1}.default-rules div{display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid #edf1ee;color:#56645c}.default-rules div:last-child{border-bottom:0}.default-rules strong{color:#27362d}
.rule-card-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }.rule-card-grid .panel-card { min-height:260px; padding:22px 25px; }.rule-card-grid .panel-card h3 { display:flex; align-items:center; gap:10px; }.rule-card-grid h3>span,.summary-heading>span { display:grid; width:31px; height:31px; place-items:center; border-radius:50%; color:#fff; font-size:14px; background:#087c43; }.rule-card-grid :deep(.el-date-editor),.rule-card-grid :deep(.el-input-number),.rule-card-grid :deep(.el-select) { width:100%; }.eligibility-grid,.execution-grid,.ranking-grid,.advancement-grid { grid-template-columns:repeat(4,1fr); }.points-inputs { display:grid; gap:13px; }.points-inputs label { display:flex; align-items:center; justify-content:space-between; gap:10px; }.ranking-order { display:grid; gap:9px; margin:20px 0 0; padding-left:25px; color:#56645c; }.ranking-grid .panel-card>.el-switch { display:flex; margin:20px 0; }.advancement-grid .panel-card>p { color:#69776f; }
.finalize-layout,.effective-layout { display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:28px; }.finalize-main,.effective-main { padding:28px 34px; }.finalize-main>h3,.effective-main>h3 { font-size:22px; }.effective-main>h3 strong { margin-left:10px; color:#078442; font-size:17px; }.summary-section { padding:17px 0 23px; border-bottom:1px solid #e8edea; }.summary-heading { display:flex; align-items:center; gap:12px; }.summary-heading h4 { flex:1; margin:0; font-size:17px; }.summary-heading em { display:flex; align-items:center; gap:5px; color:#078442; font-style:normal; }.summary-heading button { padding:7px 18px; border:1px solid #aeb8b2; border-radius:5px; background:#fff; cursor:pointer; }.summary-items { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-top:16px; }.summary-items span { display:flex; min-height:62px; align-items:center; justify-content:center; gap:7px; padding:10px; border:1px solid #e1e6e3; border-radius:6px; text-align:center; }.system-summary { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-top:14px; padding:14px; border:1px solid #dce7df; border-radius:7px; background:#fbfdfb; }.system-summary h4 { grid-column:1/-1; margin:0; color:#087c43; }.system-summary span { padding:10px; border:1px solid #e1e8e3; border-radius:6px; background:#fff; }.finalize-aside,.effective-aside { padding:28px 26px; }.finalize-aside dl,.effective-aside dl { display:grid; gap:18px; margin:0; }.finalize-aside dl>div,.effective-aside dl>div { display:flex; justify-content:space-between; }.finalize-aside dt,.effective-aside dt { color:#67746c; }.finalize-aside dd,.effective-aside dd { margin:0; }.finalize-aside dd.warning { color:#f07813; }.finalize-aside hr,.effective-aside hr { margin:26px 0; border:0; border-top:1px solid #e5eae7; }.impact-tags { display:flex; gap:10px; margin:16px 0 28px; }.impact-tags span { padding:5px 9px; border:1px solid #b9ddc5; border-radius:5px; color:#087c43; }.aside-title { display:flex; align-items:center; justify-content:space-between; }.aside-title strong { color:#078442; }.effective-section:last-child { border-bottom:0; }.effective-layout { min-height:500px; }
.is-finalize-step .page-heading { margin-bottom:10px; }
.is-finalize-step .rule-steps.professional { margin-bottom:14px; padding-top:0; }
.is-finalize-step .step-counter,.is-finalize-step .step-item small { display:none; }
.is-finalize-step .step-circle { width:36px; height:36px; font-size:17px; }
.is-finalize-step .step-line { margin-top:17px; }
.professional-finalize { grid-template-columns:minmax(0,2fr) 440px; gap:24px; }
.professional-finalize .finalize-main { padding:18px 16px 12px; }
.professional-finalize .finalize-main>h3 { margin:0 0 8px; padding:0 4px; font-size:22px; }
.final-rule-row { display:grid; grid-template-columns:34px minmax(0,1fr) 84px 112px; align-items:center; gap:12px; min-height:70px; padding:8px 10px; border:1px solid #e2e8e4; border-radius:7px; margin-bottom:8px; }
.final-rule-number { display:grid; width:29px; height:29px; place-items:center; border-radius:50%; color:#fff; font-weight:700; background:#087c43; }
.final-rule-row h4 { margin:0 0 5px; font-size:16px; }
.final-rule-row p { margin:2px 0; color:#35443b; font-size:13px; line-height:1.45; }
.final-rule-row em { display:flex; align-items:center; gap:5px; color:#087c43; font-size:13px; font-style:normal; white-space:nowrap; }
.final-rule-row button { min-height:38px; border:1px solid #c8d0cb; border-radius:6px; color:#26362d; background:#fff; cursor:pointer; }
.final-check { display:flex; min-height:49px; align-items:center; gap:12px; padding:8px 14px; border:1px solid #c5decf; border-radius:7px; color:#087c43; background:#f4faf6; font-weight:600; }
.final-check .el-icon { font-size:26px; }
.finalize-side-stack { display:grid; align-content:start; gap:12px; }
.professional-finalize .finalize-aside { padding:18px 20px; }
.professional-finalize .finalize-aside h3 { margin-bottom:12px; }
.professional-finalize .finalize-aside dl { gap:10px; }
.regulation-card { padding:17px 18px 13px; border-color:#e5c46a; }
.regulation-card header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.regulation-card header h3 { margin:0; font-size:19px; }
.regulation-card header span { padding:4px 8px; border:1px solid #e6c36b; border-radius:5px; color:#a56d00; background:#fffaf0; font-size:12px; white-space:nowrap; }
.regulation-content { display:grid; grid-template-columns:58px 1fr; gap:12px; margin-top:13px; }
.regulation-content>.el-icon { width:54px; height:66px; border:1px solid #d6aa37; border-radius:5px; color:#087c43; font-size:34px; }
.regulation-content p { margin:0 0 7px; color:#26362d; line-height:1.45; }
.regulation-content small { color:#69766e; }
.regulation-tags { display:flex; flex-wrap:wrap; gap:5px; margin-top:5px; }
.regulation-tags span { padding:2px 6px; border:1px solid #9bc4a9; border-radius:4px; color:#087c43; font-size:11px; }
.regulation-actions { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px; }
.regulation-actions :deep(.el-button) { width:100%; margin:0; }
.regulation-note { margin:9px 0 0; color:#59675e; font-size:11px; }
.final-lock-warning { display:flex; min-height:68px; align-items:center; gap:13px; padding:11px 16px; border:1px solid #f3b07d; border-radius:8px; color:#ed6b22; background:#fff8f3; line-height:1.55; }
.final-lock-warning .el-icon { flex:0 0 auto; font-size:25px; }
.is-finalize-step .footer-summary { display:none; }
.is-finalize-step .footer-actions { margin-left:auto; }
.is-professional-effective .page-heading { margin-bottom:10px; }
.is-professional-effective .rule-steps.professional { margin-bottom:14px; padding-top:0; }
.is-professional-effective .step-counter,.is-professional-effective .step-item small { display:none; }
.is-professional-effective .step-circle { width:36px; height:36px; font-size:17px; }
.is-professional-effective .step-line { margin-top:17px; }
.professional-effective { grid-template-columns:minmax(0,1.8fr) 500px; gap:24px; min-height:0; }
.professional-effective .effective-main { padding:19px 20px 16px; }
.professional-effective .effective-main>h3 { margin:0 0 12px; font-size:22px; }
.professional-effective .effective-main>h3 strong { font-size:16px; }
.effective-rule-row { display:grid; grid-template-columns:34px minmax(0,1fr) 82px; align-items:center; gap:13px; min-height:88px; padding:10px 12px; border:1px solid #e2e8e4; border-radius:7px; margin-bottom:10px; }
.effective-rule-row h4 { margin:0 0 6px; font-size:16px; }
.effective-rule-row p { margin:2px 0; color:#35443b; font-size:13px; line-height:1.48; }
.effective-rule-row em { display:flex; align-items:center; gap:5px; color:#087c43; font-size:13px; font-style:normal; white-space:nowrap; }
.professional-effective .effective-aside { align-self:stretch; padding:22px 26px 18px; }
.professional-effective .effective-aside dl { gap:14px; }
.professional-effective .effective-aside hr { margin:18px 0; }
.effective-state { color:#087c43; font-weight:700; }
.effective-impact { flex-wrap:wrap; margin:14px 0 20px; }
.effective-warning { display:flex; align-items:flex-start; gap:12px; padding:15px 16px; border:1px solid #f2a56d; border-radius:8px; color:#ed6b22; background:#fff8f3; line-height:1.7; }
.effective-warning .el-icon { flex:0 0 auto; margin-top:2px; font-size:25px; }
.effective-export-actions { display:grid; grid-template-columns:1fr 1.25fr; gap:14px; margin-top:18px; }
.effective-export-actions :deep(.el-button) { width:100%; min-height:44px; margin:0; }
.wizard-footer { position:fixed; right:0; bottom:0; left:var(--admin-sidebar-width); z-index:12; display:flex; min-height:82px; align-items:center; justify-content:space-between; gap:24px; padding:12px 30px; border-top:1px solid #dfe6e1; background:rgba(255,255,255,.98); box-shadow:0 -3px 14px rgba(20,46,31,.05); }.footer-summary { display:flex; min-width:0; align-items:center; gap:10px; color:#087c43; font-size:14px; }.footer-summary .el-icon { font-size:25px; }.footer-actions { display:flex; flex:0 0 auto; gap:16px; }.footer-actions :deep(.el-button) { min-width:184px; min-height:48px; font-size:15px; }.footer-actions :deep(.el-button--primary) { min-width:265px; }.permission-alert { margin-top:16px; }
@media (max-width:1400px) { .header-meta { display:none; }.format-picker { width:55%; }.basic-format-settings { width:calc(45% - 18px); }.format-grid { gap:10px; }.rule-card-grid { grid-template-columns:repeat(2,1fr); }.professional-settings { grid-template-columns:1fr 1fr; }.professional-settings article:last-child { grid-column:1/-1; } }
@media (max-width:1050px) { .format-picker,.basic-format-settings { float:none; width:100%; }.basic-format-settings { margin-top:18px; }.professional-settings,.finalize-layout,.effective-layout { grid-template-columns:1fr; }.rule-steps { overflow-x:auto; }.step-item { min-width:100px; }.wizard-footer { left:0; }.summary-items { grid-template-columns:repeat(2,1fr); } }
@media (max-width:720px) { .page-heading,.tournament-header { align-items:flex-start; }.page-heading,.heading-actions { flex-direction:column; }.header-chip,.status-chip { display:none; }.format-grid,.rule-card-grid,.professional-settings,.summary-items,.system-summary { grid-template-columns:1fr; }.system-summary h4 { grid-column:auto; }.wizard-footer { position:sticky; flex-direction:column; align-items:stretch; }.footer-actions { width:100%; }.footer-actions :deep(.el-button) { flex:1; min-width:0; } }
@media print { .sidebar,.tournament-header,.wizard-footer,.page-heading .heading-actions { display:none!important; }.rules-page { padding:0; }.finalize-layout,.effective-layout { grid-template-columns:1fr; } }
.professional-settings :deep(.el-form-item__content) { position:relative; }
.select-value-overlay { position:absolute; z-index:2; top:50%; left:12px; max-width:calc(100% - 44px); overflow:hidden; color:#17231c; font-size:14px; line-height:1.2; pointer-events:none; text-overflow:ellipsis; transform:translateY(-50%); white-space:nowrap; }
.eligibility-overview { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:18px; }
.eligibility-card { min-height:326px; padding:28px 28px 22px; }.eligibility-card h3 { display:flex; align-items:center; gap:12px; margin:0 0 22px; font-size:20px; }.eligibility-card h3 span { display:grid; width:34px; height:34px; place-items:center; border-radius:50%; color:#fff; font-size:16px; background:#087c43; }.eligibility-card dl { margin:0; }.eligibility-card dl>div { display:grid; grid-template-columns:92px minmax(0, 1fr); gap:8px; padding:13px 0; border-bottom:1px solid #edf1ee; line-height:1.5; }.eligibility-card dt { color:#516057; font-weight:600; }.eligibility-card dd { margin:0; color:#27362d; font-weight:500; }.eligibility-card p { margin:17px 0 0; color:#647168; font-size:13px; line-height:1.65; }.verification-switch { display:grid; grid-template-columns:1fr auto auto; align-items:center; gap:10px; padding:14px 0; border-bottom:1px solid #edf1ee; }.verification-switch span { color:#516057; font-weight:600; }.verification-switch em { min-width:94px; color:#68756d; font-size:12px; font-style:normal; }.eligibility-checks { display:grid; grid-template-columns:repeat(4, 1fr); gap:0; margin-top:28px; padding:18px 24px; border:1px solid #a8d8bb; border-radius:10px; background:#fff; }.eligibility-checks>div { display:grid; grid-template-columns:auto 1fr; column-gap:12px; align-items:center; min-width:0; padding:0 20px; border-right:1px dashed #a8d8bb; }.eligibility-checks>div:first-child { padding-left:8px; }.eligibility-checks>div:last-child { border-right:0; }.eligibility-checks .el-icon { grid-row:span 2; color:#087c43; font-size:29px; }.eligibility-checks strong { color:#26362d; font-size:15px; }.eligibility-checks span { margin-top:4px; color:#647168; font-size:13px; }
@media (max-width:1180px) { .eligibility-overview { grid-template-columns:repeat(2, minmax(0, 1fr)); }.eligibility-checks { grid-template-columns:repeat(2, 1fr); gap:16px; }.eligibility-checks>div:nth-child(2) { border-right:0; } }
.execution-overview { display:grid; gap:14px; }.execution-notice { display:flex; align-items:center; gap:12px; padding:14px 20px; border:1px solid #d9e9de; border-radius:9px; background:#fbfefc; color:#587066; }.execution-notice .el-icon { color:#087c43; font-size:28px; }.execution-notice strong { margin-left:auto; color:#087c43; font-size:14px; }.execution-top-cards { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:18px; }.execution-card { min-height:230px; padding:22px 24px; }.execution-card h3 { margin:0 0 14px; font-size:19px; }.execution-card dl { margin:0; }.execution-card dl>div { display:flex; justify-content:space-between; gap:14px; padding:9px 0; border-bottom:1px solid #edf1ee; }.execution-card dt { color:#55655c; font-weight:600; }.execution-card dd { margin:0; color:#26362d; text-align:right; }.execution-card p { margin:13px 0 0; color:#6d7971; font-size:12px; line-height:1.6; }.substitution-toggle { width:100%; margin:0 0 6px; }.substitution-toggle :deep(.el-radio-button) { width:50%; }.substitution-toggle :deep(.el-radio-button__inner) { width:100%; }.discipline-overview { padding:16px 22px; border:1px solid #cde5d5; border-radius:9px; background:#fff; }.discipline-overview h3 { margin:0 0 14px; color:#087c43; font-size:19px; }.discipline-overview h3 span { margin-left:10px; padding:4px 8px; border-radius:5px; color:#b57600; background:#fff1cb; font-size:12px; font-weight:500; }.discipline-controls { display:grid; grid-template-columns:1.7fr repeat(2,1fr) 1.5fr; gap:16px; align-items:center; }.discipline-controls :deep(.el-form-item) { margin-bottom:8px; }.discipline-controls>div { display:flex; align-items:center; justify-content:space-between; gap:10px; min-height:42px; }.discipline-controls strong { color:#33443a; font-size:13px; }.referee-execution { display:grid; grid-template-columns:repeat(3, 1fr) 1.5fr; gap:0; align-items:center; padding:13px 20px; border:1px solid #d9e9de; border-radius:8px; background:#fff; }.referee-execution div { display:flex; align-items:center; gap:8px; color:#33443a; font-weight:600; }.referee-execution .el-icon,.execution-summary .el-icon { color:#087c43; font-size:22px; }.referee-execution p { margin:0; padding-left:20px; border-left:1px solid #d9e9de; color:#5b6a61; line-height:1.45; }.execution-summary { display:flex; align-items:center; flex-wrap:wrap; gap:11px; padding:12px 18px; border:1px solid #d9e9de; border-radius:8px; background:#fff; color:#34443a; }.execution-summary span::after { margin-left:11px; color:#a6b4ac; content:'•'; }.execution-summary strong { margin-left:auto; color:#087c43; }
@media (max-width:1180px) { .execution-top-cards { grid-template-columns:1fr; }.discipline-controls,.referee-execution { grid-template-columns:1fr 1fr; }.referee-execution p { grid-column:1/-1; padding:12px 0 0; border:0; border-top:1px solid #d9e9de; } }
.ranking-notice { display:flex; align-items:center; gap:12px; padding:14px 20px; border:1px solid #d9e9de; border-radius:9px; background:#fbfefc; color:#587066; }.ranking-notice .el-icon,.ranking-checks .el-icon,.ranking-summary .el-icon { color:#087c43; font-size:26px; }.ranking-notice strong { margin-left:auto; color:#087c43; font-size:14px; }.ranking-overview { display:grid; grid-template-columns:1fr 1.25fr 1.4fr; gap:18px; }.ranking-overview .panel-card { min-height:335px; padding:20px 22px; }.ranking-overview h3 { margin:0; color:#26362d; font-size:19px; }.points-score { display:grid; grid-template-columns:repeat(3, 1fr); margin:18px 0 15px; border:1px solid #e5ebe7; border-radius:8px; overflow:hidden; }.points-score div { display:grid; justify-items:center; gap:6px; padding:13px 6px; border-right:1px solid #e5ebe7; }.points-score div:last-child { border-right:0; }.points-score span { color:#58675e; }.points-score strong { color:#19291f; font-size:24px; }.ranking-points dl { margin:0; }.ranking-points dl>div { display:flex; justify-content:space-between; padding:12px 8px; border-bottom:1px solid #edf1ee; }.ranking-points dt { color:#56655c; font-weight:600; }.ranking-points dd { margin:0; color:#26362d; }.ranking-toggle { display:flex; align-items:center; justify-content:space-between; padding:12px 8px 6px; }.ranking-points small { padding-left:8px; color:#6c7970; }.ranking-card-heading { display:flex; align-items:center; gap:10px; margin-bottom:16px; }.ranking-card-heading span { margin-left:auto; color:#087c43; font-size:12px; }.ranking-tiebreak ol { margin:0; padding:0; list-style:none; counter-reset:rank; }.ranking-tiebreak li { position:relative; padding:8px 12px 8px 45px; border:1px solid #edf1ee; border-radius:5px; margin-bottom:7px; color:#34443a; counter-increment:rank; }.ranking-tiebreak li::before { position:absolute; left:14px; color:#758178; content:counter(rank); }.ranking-example table { width:100%; border-collapse:collapse; font-size:13px; }.ranking-example th,.ranking-example td { padding:12px 7px; border-bottom:1px solid #edf1ee; text-align:left; }.ranking-example th { color:#526159; font-weight:600; }.ranking-checks { display:grid; grid-template-columns:repeat(4, 1fr); margin-top:16px; padding:17px 20px; border:1px solid #d2e8da; border-radius:8px; background:#fff; }.ranking-checks div { display:flex; align-items:center; gap:9px; padding:0 20px; border-right:1px dashed #b9dac5; color:#33443a; font-weight:600; }.ranking-checks div:last-child { border-right:0; }.ranking-summary { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-top:16px; padding:12px 18px; border:1px solid #e1ebe4; border-radius:8px; background:#fff; color:#34443a; }.ranking-summary span::after { margin-left:12px; color:#a6b4ac; content:'•'; }.ranking-summary strong { margin-left:auto; color:#087c43; }
@media (max-width:1180px) { .ranking-overview { grid-template-columns:1fr; }.ranking-checks { grid-template-columns:repeat(2,1fr); gap:14px; }.ranking-checks div:nth-child(2) { border-right:0; } }
.advancement-notice { display:flex; align-items:center; gap:12px; padding:14px 20px; border:1px solid #d9e9de; border-radius:9px; background:#fbfefc; color:#587066; }.advancement-notice .el-icon,.advancement-summary .el-icon,.path-ok .el-icon { color:#087c43; font-size:25px; }.advancement-notice strong { margin-left:auto; color:#087c43; font-size:14px; }.advancement-layout { display:grid; grid-template-columns:1.03fr 1fr; gap:18px; }.advancement-left { display:grid; gap:14px; }.advancement-card { padding:20px 22px; }.advancement-card h3,.bracket-preview h3 { margin:0 0 15px; font-size:19px; }.advancement-meta { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; align-items:center; padding:10px 0; border-top:1px solid #edf1ee; border-bottom:1px solid #edf1ee; }.advancement-meta span { color:#56655c; }.advancement-meta strong { color:#26362d; }.advancement-total { display:flex; justify-content:space-between; padding:12px 0; border-bottom:1px solid #edf1ee; }.advancement-total strong { color:#087c43; font-size:18px; }.advancement-mode { display:grid; gap:9px; padding-top:12px; }.advancement-mode>span { color:#56655c; font-weight:600; }.advancement-mode .el-radio-group { display:flex; }.advancement-mode :deep(.el-radio-button) { flex:1; }.advancement-mode :deep(.el-radio-button__inner) { width:100%; }.advancement-card p { margin:12px 0 0; color:#087c43; font-size:13px; }.advancement-card dl { margin:0; }.advancement-card dl>div { display:flex; justify-content:space-between; padding:9px 0; border-bottom:1px solid #edf1ee; }.advancement-card dt { color:#56655c; }.advancement-card dd { margin:0; color:#26362d; }.advancement-switches { display:grid; grid-template-columns:1fr auto; gap:10px 18px; align-items:center; padding-top:12px; }.advancement-switches span { color:#3d4c43; }.replacement-ok { display:flex; align-items:center; gap:8px; margin-top:12px; padding:10px; border-radius:6px; color:#087c43; background:#f1faf3; }.bracket-preview { padding:20px 22px; }.bracket { display:grid; grid-template-columns:1.35fr 1fr; min-height:290px; gap:24px; align-items:center; }.bracket-column { display:grid; gap:12px; }.bracket-column span { display:grid; place-items:center; min-height:56px; padding:8px; border:1px solid #dfe7e1; border-radius:7px; color:#33443a; text-align:center; line-height:1.25; }.bracket-column b { color:#77857b; font-weight:500; }.bracket-middle { display:grid; gap:44px; align-items:center; }.bracket-middle span { padding:12px 16px; border:1px solid #dfe7e1; border-radius:7px; color:#33443a; text-align:center; }.bracket-preview>p { margin:0; color:#68756c; font-size:12px; }.path-ok { display:flex; align-items:center; gap:8px; margin-top:15px; padding-top:12px; border-top:1px solid #edf1ee; color:#087c43; font-weight:600; }.advancement-summary { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-top:15px; padding:12px 18px; border:1px solid #d9e9de; border-radius:8px; color:#34443a; background:#fff; }.advancement-summary span::after { margin-left:12px; color:#a6b4ac; content:'•'; }.advancement-summary strong { margin-left:auto; color:#087c43; }
.is-advancement-step .wizard-content { gap:10px; padding-bottom:96px; }
.is-advancement-step .advancement-notice { padding:10px 18px; }
.is-advancement-step .advancement-layout { gap:14px; }
.is-advancement-step .advancement-left { gap:9px; }
.is-advancement-step .advancement-card,.is-advancement-step .bracket-preview { padding:13px 18px; }
.is-advancement-step .advancement-card h3,.is-advancement-step .bracket-preview h3 { margin-bottom:8px; }
.is-advancement-step .advancement-meta { padding:6px 0; }
.is-advancement-step .advancement-total { padding:7px 0; }
.is-advancement-step .advancement-mode { gap:6px; padding-top:7px; }
.is-advancement-step .advancement-mode { grid-template-columns:150px 1fr; align-items:center; }
.is-advancement-step .advancement-card p { margin-top:7px; }
.is-advancement-step .advancement-card dl>div { padding:6px 0; }
.is-advancement-step .advancement-switches { gap:6px 18px; padding-top:7px; }
.is-advancement-step .replacement-ok { margin-top:8px; padding:7px 10px; }
.is-advancement-step .advancement-card:nth-child(2),.is-advancement-step .advancement-card:nth-child(3) { display:grid; grid-template-columns:1fr 1fr; column-gap:22px; align-content:start; }
.is-advancement-step .advancement-card:nth-child(2) h3,.is-advancement-step .advancement-card:nth-child(3) h3 { grid-column:1/-1; }
.is-advancement-step .advancement-card:nth-child(2) .advancement-switches { padding-top:0; }
.is-advancement-step .advancement-card:nth-child(3) .replacement-ok { align-self:center; margin-top:0; }
.is-advancement-step .advancement-card:nth-child(3) { padding:8px 18px; }
.is-advancement-step .advancement-card:nth-child(3) h3 { margin-bottom:3px; }
.is-advancement-step .advancement-card:nth-child(3) dl>div { padding:3px 0; }
.is-advancement-step .bracket { min-height:250px; gap:20px; }
.is-advancement-step .bracket-column { gap:8px; }
.is-advancement-step .bracket-column span { position:relative; min-height:48px; padding:5px 8px; }
.is-advancement-step .bracket-column span::after { position:absolute; top:50%; right:-21px; width:20px; border-top:1px solid #cbd6ce; content:''; }
.is-advancement-step .bracket-middle { grid-template-columns:repeat(3,1fr); gap:12px; }
.is-advancement-step .bracket-middle span { padding:9px 14px; }
.is-advancement-step .path-ok { margin-top:9px; padding-top:8px; }
.is-advancement-step .advancement-summary { position:fixed; right:490px; bottom:12px; left:calc(var(--admin-sidebar-width) + 30px); z-index:13; margin-top:0; padding:9px 16px; }
.is-advancement-step .footer-summary { display:none; }
.is-advancement-step .footer-actions { z-index:14; margin-left:auto; }
@media (max-width:1180px) { .advancement-layout { grid-template-columns:1fr; }.bracket { min-height:220px; } }
</style>
