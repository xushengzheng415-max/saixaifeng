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
const MATCH_FORMAT_OPTIONS = [
  { value: '11side', label: '11人制', defaultPlayers: 35, maxPlayers: 50, selectedClass: 'selected' },
  { value: '8side', label: '8人制', defaultPlayers: 25, maxPlayers: 40, selectedClass: '' },
  { value: '7side', label: '7人制', defaultPlayers: 20, maxPlayers: 35, selectedClass: '' },
  { value: '6side', label: '6人制', defaultPlayers: 16, maxPlayers: 30, selectedClass: '' },
  { value: '5side', label: '5人制', defaultPlayers: 12, maxPlayers: 25, selectedClass: '' }
];

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
    matchFormatOptions: MATCH_FORMAT_OPTIONS,
    divisionPresets: ['U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18'],
    multiDivision: false,
    divisions: [],
    matchFormatMaxPlayers: 50,
    selectedExtraSub: EXTRA_SUB_OPTIONS[4],
    deadlineText: '请选择报名截止日',
    startDateText: '请选择开始日期',
    endDateText: '请选择结束日期',
    regulationFileName: '',
    regulationFileId: '',
    regulationFileType: '',
    uploadingRegulation: false,
    hasRegulationFile: false,
    regulationUploadText: '上传文件',
    typeLabels: TYPE_LABELS,
    typeDescs: TYPE_DESCS,
    themeNames: THEME_NAMES,
    themeGradients: THEME_GRADIENTS,
    timeTypes: TIME_TYPES,
    halfDurations: HALF_OPTIONS,
    quarterDurations: QUARTER_OPTIONS,
    form: {
      name: '', formatType: 'tournament', category: 'youth', matchFormat: '11side',
      timeType: 'halves', halfDuration: 45, quarterDuration: 15, quarterCount: 4,
      halfTimeBreak: 15, quarterBreak: 5,
      location: '', titleSponsor: '', theme: 'green',
      deadline: '', startDate: '', endDate: '',
      maxTeams: '', maxPlayers: 35,
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

  chooseRegulationFile() {
    if (this.data.uploadingRegulation) return;
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'bmp'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        const extension = (file.name.split('.').pop() || '').toLowerCase();
        const allowed = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'bmp'];
        if (allowed.indexOf(extension) === -1) {
          wx.showToast({ title: '不支持该文件格式', icon: 'none' });
          return;
        }
        if (file.size > 10 * 1024 * 1024) {
          wx.showToast({ title: '文件不能超过10MB', icon: 'none' });
          return;
        }
        this.uploadRegulationFile(file, extension);
      }
    });
  },

  async uploadRegulationFile(file, extension) {
    this.setData({ uploadingRegulation: true });
    wx.showLoading({ title: '上传中...' });
    try {
      const cloudPath = `tournament-regulations/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
      const result = await wx.cloud.uploadFile({ cloudPath, filePath: file.path });
      this.setData({
        regulationFileName: file.name,
        regulationFileId: result.fileID,
        regulationFileType: extension,
        hasRegulationFile: true,
        regulationUploadText: '重新上传'
      });
      wx.hideLoading();
      wx.showToast({ title: '上传成功', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      console.error('竞赛规程上传失败:', err);
      wx.showToast({ title: '上传失败，请重试', icon: 'none' });
    } finally {
      this.setData({ uploadingRegulation: false });
    }
  },

  async viewRegulationFile() {
    const fileID = this.data.regulationFileId;
    if (!fileID) return;
    wx.showLoading({ title: '打开中...' });
    try {
      const result = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      const tempUrl = result.fileList && result.fileList[0] && result.fileList[0].tempFileURL;
      if (!tempUrl) throw new Error('未获取到文件地址');
      const imageTypes = ['jpg', 'jpeg', 'png', 'bmp'];
      if (imageTypes.indexOf(this.data.regulationFileType) !== -1) {
        wx.hideLoading();
        wx.previewImage({ urls: [tempUrl], current: tempUrl });
        return;
      }
      const download = await wx.downloadFile({ url: tempUrl });
      wx.hideLoading();
      await wx.openDocument({ filePath: download.tempFilePath, showMenu: true });
    } catch (err) {
      wx.hideLoading();
      console.error('竞赛规程查看失败:', err);
      wx.showToast({ title: '文件打开失败', icon: 'none' });
    }
  },

  clearRegulationFile() {
    this.setData({
      regulationFileName: '',
      regulationFileId: '',
      regulationFileType: '',
      hasRegulationFile: false,
      regulationUploadText: '上传文件'
    });
  },

  // === 通用输入 ===
  onInput(e) {
    const { field } = e.currentTarget.dataset;
    let value = e.detail.value;
    if (field === 'maxPlayers' && Number(value) > this.data.matchFormatMaxPlayers) {
      value = String(this.data.matchFormatMaxPlayers);
      wx.showToast({ title: `当前制式上限${this.data.matchFormatMaxPlayers}人`, icon: 'none' });
    }
    var data = { ['form.' + field]: value }
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

  onMatchFormatSelect(e) {
    const value = e.currentTarget.dataset.value;
    const selected = MATCH_FORMAT_OPTIONS.find(item => item.value === value);
    if (!selected || this.data.form.matchFormat === value) return;
    const options = MATCH_FORMAT_OPTIONS.map(item => ({
      ...item,
      selectedClass: item.value === value ? 'selected' : ''
    }));
    this.setData({
      matchFormatOptions: options,
      matchFormatMaxPlayers: selected.maxPlayers,
      'form.matchFormat': value,
      'form.maxPlayers': selected.defaultPlayers
    });
  },

  onMultiDivisionChange(e) {
    const enabled = e.detail.value;
    const divisions = enabled && this.data.divisions.length < 2
      ? [this.createDivision('U10'), this.createDivision('U12')]
      : this.data.divisions;
    this.setData({ multiDivision: enabled, divisions });
  },

  createDivision(name) {
    const selected = MATCH_FORMAT_OPTIONS.find(item => item.value === this.data.form.matchFormat) || MATCH_FORMAT_OPTIONS[0];
    return {
      id: `division_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name || '',
      tournamentType: this.data.form.formatType,
      matchFormat: selected.value,
      matchFormatLabel: selected.label,
      matchFormatIndex: MATCH_FORMAT_OPTIONS.findIndex(item => item.value === selected.value),
      maxTeams: 8,
      maxPlayersPerTeam: selected.defaultPlayers
    };
  },

  addDivision(e) {
    const name = e.currentTarget.dataset.name || '';
    if (name && this.data.divisions.some(item => item.name === name)) return;
    this.setData({ divisions: this.data.divisions.concat(this.createDivision(name)) });
  },

  removeDivision(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (this.data.divisions.length <= 2) {
      wx.showToast({ title: '多组别至少保留2个组别', icon: 'none' });
      return;
    }
    const divisions = this.data.divisions.slice();
    divisions.splice(index, 1);
    this.setData({ divisions });
  },

  onDivisionInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    const field = e.currentTarget.dataset.field;
    this.setData({ [`divisions[${index}].${field}`]: e.detail.value });
  },

  onDivisionFormat(e) {
    const index = Number(e.currentTarget.dataset.index);
    const formatIndex = Number(e.detail.value);
    const selected = MATCH_FORMAT_OPTIONS[formatIndex];
    this.setData({
      [`divisions[${index}].matchFormatIndex`]: formatIndex,
      [`divisions[${index}].matchFormat`]: selected.value,
      [`divisions[${index}].matchFormatLabel`]: selected.label,
      [`divisions[${index}].maxPlayersPerTeam`]: selected.defaultPlayers
    });
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
      if (!this.data.multiDivision && (Number(f.maxTeams) < 2 || Number(f.maxPlayers) < 5)) {
        wx.showToast({ title: '请填写球队数和名单上限', icon: 'none' }); return false;
      }
    }
    return true;
  },

  // === 提交 ===
  async submit() {
    if (!this.validate()) return;
    const f = this.data.form;
    const normalizedDivisions = this.data.multiDivision
      ? this.data.divisions.map(item => ({
          id: item.id,
          name: String(item.name || '').trim(),
          tournamentType: item.tournamentType || f.formatType,
          matchFormat: item.matchFormat || f.matchFormat,
          maxTeams: parseInt(item.maxTeams) || 0,
          maxPlayersPerTeam: parseInt(item.maxPlayersPerTeam) || 0
        }))
      : [];
    if (this.data.multiDivision) {
      const names = normalizedDivisions.map(item => item.name);
      if (normalizedDivisions.length < 2 || names.some(name => !name)) {
        wx.showToast({ title: '请至少填写2个组别', icon: 'none' });
        return;
      }
      if (new Set(names).size !== names.length) {
        wx.showToast({ title: '组别名称不能重复', icon: 'none' });
        return;
      }
      if (normalizedDivisions.some(item => item.maxTeams < 2 || item.maxPlayersPerTeam < 5)) {
        wx.showToast({ title: '请完善各组别人数上限', icon: 'none' });
        return;
      }
    }
    wx.showLoading({ title: '创建中...' });
    try {
      const userInfo = wx.getStorageSync('userInfo') || {};
      const creatorPhone = wx.getStorageSync('phoneNumber') || userInfo.phoneNumber || userInfo.phone || '';
      const creatorId = wx.getStorageSync('userId') || userInfo._id || userInfo.userId || '';
      const openId = wx.getStorageSync('openId') || userInfo.openId || userInfo.wechatOpenId || '';
      const submitData = {
        creatorId: creatorId,
        organizerId: creatorId,
        createdBy: creatorId || creatorPhone || openId,
        creatorPhone: creatorPhone,
        organizerPhone: creatorPhone,
        phoneNumber: creatorPhone,
        openId: openId,
        wechatOpenId: openId,
        name: f.name,
        formatType: f.formatType,
        matchFormat: f.matchFormat,
        multiDivision: this.data.multiDivision,
        divisionMode: this.data.multiDivision ? 'multiple' : 'single',
        divisions: normalizedDivisions,
        defaultDivisionId: normalizedDivisions[0] ? normalizedDivisions[0].id : 'default',
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
        maxPlayersPerTeam: parseInt(f.maxPlayers) || 0,
        description: f.description,
        regulationFileName: this.data.regulationFileName,
        regulationFileId: this.data.regulationFileId,
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
      if (this.data.multiDivision) {
        delete submitData.maxTeams;
        delete submitData.maxPlayers;
        delete submitData.maxPlayersPerTeam;
      }

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
