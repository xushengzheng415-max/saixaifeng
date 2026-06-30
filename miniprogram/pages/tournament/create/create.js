// pages/tournament/create/create.js — 同步网页版
const db = wx.cloud.database();
const _ = db.command;

const TYPE_LABELS = ['赛会制', '杯赛制', '联赛制', '复合制'];
const TYPE_VALUES = ['tournament', 'cup', 'league', 'combined'];
const TYPE_DESCS = [
  '小组赛+淘汰赛，分组循环后交叉淘汰',
  '单场淘汰，32/16/8强抽签对决',
  '单循环或双循环积分赛',
  '联赛阶段+杯赛阶段，灵活配置'
];
const THEME_NAMES = ['活力绿', '专业蓝', '热情红', '活力橙', '典雅紫', '深邃黑'];
const THEME_GRADIENTS = [
  'linear-gradient(135deg, #1B5E20, #43A047)',
  'linear-gradient(135deg, #0D47A1, #1976D2)',
  'linear-gradient(135deg, #B71C1C, #F44336)',
  'linear-gradient(135deg, #E65100, #FF9800)',
  'linear-gradient(135deg, #4A148C, #9C27B0)',
  'linear-gradient(135deg, #1a1a2e, #0f3460)'
];
const THEME_VALUES = ['green','blue','red','orange','purple','dark'];
const TIME_TYPES = ['半场制', '四节制'];
const HALF_OPTIONS = ['20分钟','25分钟','30分钟','35分钟','40分钟','45分钟'];
const HALF_VALUES = [20,25,30,35,40,45];
const QUARTER_OPTIONS = ['5分钟','10分钟','15分钟','20分钟','25分钟','30分钟'];
const QUARTER_VALUES = [5,10,15,20,25,30];
const Q_COUNT_OPTIONS = ['2节','4节'];
const EXTRA_SUB_OPTIONS = ['0人','1人','2人','3人','不限'];

const CATEGORY_LABELS = ['青少年赛事', '业余赛事', '地协赛', '城市联赛', '职业联赛'];
const CATEGORY_VALUES = ['youth','amateur','local','city','professional'];
const CATEGORY_DESCS = ['U8~U18青少年足球赛事','社会业余球队参赛赛事','各地足协主办精品赛事','各城市代表队巅峰对决','职业级足球联赛赛事'];

Page({
  data: {
    currentStep: 1,
    isStep1: true,
    isStep2: false,
    isStep3: false,
    isStep4: false,
    canPrev: false,
    canNext: true,
    canSubmit: false,
    step1Active: 'active',
    step2Active: '',
    step3Active: '',
    step4Active: '',
    typeIndex: 0,
    timeTypeIdx: 0,
    halfDurIdx: 5,
    qDurIdx: 2,
    qCountIdx: 1,
    themeIdx: 0,
    themeGradient: THEME_GRADIENTS[0],
    extraSubIdx: 4,
    showHalf: true,
    showQuarter: false,
    selectedTypeLabel: TYPE_LABELS[0],
    selectedTypeDesc: TYPE_DESCS[0],
    selectedTimeType: TIME_TYPES[0],
    selectedHalfDuration: HALF_OPTIONS[5],
    selectedQuarterDuration: QUARTER_OPTIONS[2],
    qCountOptions: Q_COUNT_OPTIONS,
    selectedQCount: Q_COUNT_OPTIONS[1],
    categoryIdx: 0,
    selectedCategoryLabel: CATEGORY_LABELS[0],
    categoryLabels: CATEGORY_LABELS,
    extraSubOptions: EXTRA_SUB_OPTIONS,
    selectedExtraSub: EXTRA_SUB_OPTIONS[4],
    deadlineText: '请选择报名截止日',
    startDateText: '请选择开始日期',
    endDateText: '请选择结束日期',
    typeLabels: TYPE_LABELS,
    typeDescs: TYPE_DESCS,
    themeNames: THEME_NAMES,
    themeGradients: THEME_GRADIENTS,
    timeTypes: TIME_TYPES,
    halfDurations: HALF_OPTIONS,
    quarterDurations: QUARTER_OPTIONS,
    form: {
      name: '', formatType: 'tournament', category: 'youth',
      timeType: 'halves', halfDuration: 45, quarterDuration: 15, quarterCount: 4,
      halfTimeBreak: 15, quarterBreak: 5,
      location: '', titleSponsor: '', theme: 'green',
      deadline: '', startDate: '', endDate: '',
      maxTeams: '', maxPlayers: '',
      description: '',
      pointsWin: 3, pointsDraw: 1, pointsLoss: 0, pointsForfeit: -1,
      goalBonusEnabled: false, cardDeductionEnabled: false,
      yellowCardDeduction: 1, redCardDeduction: 3,
      maxSubstitutions: '', allowSubBack: false, extraSubsAtHalfTime: 'unlimited',
      accumulatedYellowCards: 3, suspensionMatches: 1,
      directRedCardSuspension: 2, twoYellowToRedSuspension: 1,
      redCardCarryOver: true, yellowCardCarryOver: true, groupStageCardCarryOver: true
    }
  },

  onLoad() {
    this.setData({ 'form.theme': 'green' });
  },

  // === 通用输入 ===
  onInput(e) {
    const { field } = e.currentTarget.dataset;
    var data = { ['form.' + field]: e.detail.value }
    if (field === 'deadline') data.deadlineText = e.detail.value || '请选择报名截止日'
    if (field === 'startDate') data.startDateText = e.detail.value || '请选择开始日期'
    if (field === 'endDate') data.endDateText = e.detail.value || '请选择结束日期'
    this.setData(data);
  },

  onSwitch(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ ['form.' + field]: e.detail.value });
  },

  onDate(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ ['form.' + field]: e.detail.value });
  },

  // === 选择器 ===
  onTypeSelect(e) {
    const i = e.detail.value;
    this.setData({ typeIndex: i, 'form.formatType': TYPE_VALUES[i], selectedTypeLabel: TYPE_LABELS[i], selectedTypeDesc: TYPE_DESCS[i] });
  },

  onCategorySelect(e) {
    const i = e.detail.value;
    this.setData({ categoryIdx: i, 'form.category': CATEGORY_VALUES[i], selectedCategoryLabel: CATEGORY_LABELS[i] });
  },

  onPicker(e) {
    const f = e.currentTarget.dataset.field;
    const i = e.detail.value;
    if (f === 'timeType') {
      this.setData({
        timeTypeIdx: i, showHalf: i === 0, showQuarter: i === 1,
        selectedTimeType: TIME_TYPES[i],
        'form.timeType': i === 0 ? 'halves' : 'quarters'
      });
    } else if (f === 'halfDur') {
      this.setData({ halfDurIdx: i, 'form.halfDuration': HALF_VALUES[i], selectedHalfDuration: HALF_OPTIONS[i] });
    } else if (f === 'qDur') {
      this.setData({ qDurIdx: i, 'form.quarterDuration': QUARTER_VALUES[i], selectedQuarterDuration: QUARTER_OPTIONS[i] });
    } else if (f === 'qCount') {
      this.setData({ qCountIdx: i, 'form.quarterCount': [2,4][i], selectedQCount: Q_COUNT_OPTIONS[i] });
    }
  },

  onThemePick(e) {
    const i = e.detail.value;
    this.setData({ themeIdx: i, 'form.theme': THEME_VALUES[i], themeGradient: THEME_GRADIENTS[i], selectedThemeName: THEME_NAMES[i] });
  },

  onExtraSubPick(e) {
    const i = e.detail.value;
    const vals = [0,1,2,3,'unlimited'];
    this.setData({ extraSubIdx: i, 'form.extraSubsAtHalfTime': vals[i], selectedExtraSub: EXTRA_SUB_OPTIONS[i] });
  },

  // === 步骤 ===
  prevStep() {
    if (this.data.currentStep > 1) { this.setStepState(this.data.currentStep - 1); }
  },

  nextStep() {
    if (this.validate()) { this.setStepState(this.data.currentStep + 1); }
  },

  validate() {
    const f = this.data.form;
    if (this.data.currentStep === 1) {
      if (!f.name) { wx.showToast({ title: '请输入赛事名称', icon: 'none' }); return false; }
    }
    return true;
  },

  // === 提交 ===
  async submit() {
    if (!this.validate()) return;
    const f = this.data.form;
    wx.showLoading({ title: '创建中...' });
    try {
      const submitData = {
        creatorPhone: wx.getStorageSync('phoneNumber') || '',
        organizerPhone: wx.getStorageSync('phoneNumber') || '',
        name: f.name,
        formatType: f.formatType,
        category: f.category || 'youth',
        matchTime: {
          timeType: f.timeType,
          halfDuration: parseInt(f.halfDuration) || 45,
          halfTimeBreak: parseInt(f.halfTimeBreak) || 15,
          quarterDuration: parseInt(f.quarterDuration) || 15,
          quarterCount: parseInt(f.quarterCount) || 4,
          quarterBreak: parseInt(f.quarterBreak) || 5
        },
        location: f.location,
        titleSponsor: f.titleSponsor,
        theme: f.theme,
        deadline: f.deadline,
        startDate: f.startDate,
        endDate: f.endDate,
        maxTeams: parseInt(f.maxTeams) || 0,
        maxPlayers: parseInt(f.maxPlayers) || 0,
        description: f.description,
        rules: {
          points: {
            win: parseInt(f.pointsWin) || 3,
            draw: parseInt(f.pointsDraw) || 1,
            loss: parseInt(f.pointsLoss) || 0,
            forfeit: parseInt(f.pointsForfeit) || -1
          },
          goalBonusEnabled: f.goalBonusEnabled,
          cardDeductionEnabled: f.cardDeductionEnabled,
          yellowCardDeduction: parseInt(f.yellowCardDeduction) || 1,
          redCardDeduction: parseInt(f.redCardDeduction) || 3,
          maxSubstitutions: parseInt(f.maxSubstitutions) || 0,
          allowSubBack: f.allowSubBack,
          extraSubsAtHalfTime: f.extraSubsAtHalfTime,
          accumulatedYellowCards: parseInt(f.accumulatedYellowCards) || 3,
          suspensionMatches: parseInt(f.suspensionMatches) || 1,
          directRedCardSuspension: parseInt(f.directRedCardSuspension) || 2,
          twoYellowToRedSuspension: parseInt(f.twoYellowToRedSuspension) || 1,
          redCardCarryOver: f.redCardCarryOver,
          yellowCardCarryOver: f.yellowCardCarryOver,
          groupStageCardCarryOver: f.groupStageCardCarryOver
        },
        status: 'draft',
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      };

      const result = await db.collection('tournaments').add({ data: submitData });
      wx.hideLoading();
      wx.showToast({ title: '创建成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (err) {
      wx.hideLoading();
      console.error('创建失败:', err);
      wx.showToast({ title: '创建失败: ' + (err.message || ''), icon: 'none' });
    }
  }
});