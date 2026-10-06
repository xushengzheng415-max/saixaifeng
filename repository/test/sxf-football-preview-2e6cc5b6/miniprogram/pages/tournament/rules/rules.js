// pages/tournament/rules/rules.js
const db = wx.cloud.database();

Page({
  data: {
    tournamentId: '',
    formatType: '',
    parsing: false,
    rules: {
      regulations: '',
      matchRules: '',
      pointsRules: '',
      advancementRules: '',
      rewardRules: '',
      appealRules: '',
      otherRules: ''
    }
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ tournamentId: options.id });
      this.loadRules(options.id);
    }
    if (options.formatType) {
      this.setData({ formatType: options.formatType });
    }
  },

  async loadRules(tournamentId) {
    wx.showLoading({ title: '加载中...' });
    try {
      const res = await db.collection('tournaments').doc(tournamentId).get();
      if (res.data && res.data.rules) {
        this.setData({
          rules: res.data.rules,
          formatType: res.data.formatType || ''
        });
      }
    } catch (err) {
      console.error('加载规则失败:', err);
    } finally {
      wx.hideLoading();
    }
  },

  onInputChange(e) {
    const { field } = e.currentTarget.dataset;
    const value = e.detail.value;
    this.setData({
      [`rules.${field}`]: value
    });
  },

  onUploadDoc() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf', 'doc', 'docx', 'txt', 'jpg', 'png'],
      success: (res) => {
        const filePath = res.tempFiles[0].path;
        const fileName = res.tempFiles[0].name;
        this.parseWithAI(filePath, fileName);
      }
    });
  },

  async parseWithAI(filePath, fileName) {
    this.setData({ parsing: true });
    wx.showLoading({ title: 'AI识别中...' });

    try {
      if (fileName.match(/\.(jpg|jpeg|png|gif)$/i)) {
        await this.parseImageWithAI(filePath);
      } else {
        await this.parseDocWithAI(filePath, fileName);
      }
    } catch (err) {
      console.error('AI识别失败:', err);
      wx.showToast({
        title: '识别失败，请手动填写',
        icon: 'none'
      });
    } finally {
      this.setData({ parsing: false });
      wx.hideLoading();
    }
  },

  async parseImageWithAI(filePath) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'parseTournamentRegulations',
        data: {
          filePath: filePath,
          type: 'image'
        }
      });
      if (res.result && res.result.success) {
        this.fillParsedData(res.result.data);
      }
    } catch (err) {
      console.error('图片识别失败:', err);
      throw err;
    }
  },

  async parseDocWithAI(filePath, fileName) {
    try {
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: `regulations/${Date.now()}_${fileName}`,
        filePath: filePath
      });

      const parseRes = await wx.cloud.callFunction({
        name: 'parseTournamentRegulations',
        data: {
          fileID: uploadRes.fileID,
          type: 'document'
        }
      });
      if (parseRes.result && parseRes.result.success) {
        this.fillParsedData(parseRes.result.data);
      }
    } catch (err) {
      console.error('文档识别失败:', err);
      throw err;
    }
  },

  fillParsedData(data) {
    const rules = { ...this.data.rules };

    if (data.regulations) rules.regulations = data.regulations;
    if (data.matchRules) rules.matchRules = data.matchRules;
    if (data.pointsRules) rules.pointsRules = data.pointsRules;
    if (data.advancementRules) rules.advancementRules = data.advancementRules;
    if (data.rewardRules) rules.rewardRules = data.rewardRules;
    if (data.appealRules) rules.appealRules = data.appealRules;
    if (data.otherRules) rules.otherRules = data.otherRules;

    this.setData({ rules });

    wx.showToast({
      title: '识别成功，请检查并完善',
      icon: 'success',
      duration: 2000
    });
  },

  onCancel() {
    wx.navigateBack();
  },

  async onSave() {
    const { tournamentId, rules } = this.data;

    if (!tournamentId) {
      const pages = getCurrentPages();
      const prevPage = pages[pages.length - 2];
      if (prevPage) {
        prevPage.setData({
          'formData.rules': rules
        });
      }
      wx.navigateBack();
      return;
    }

    wx.showLoading({ title: '保存中...' });

    try {
      await db.collection('tournaments').doc(tournamentId).update({
        data: {
          rules: rules,
          updateTime: db.serverDate()
        }
      });
      wx.hideLoading();
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (err) {
      console.error('保存失败:', err);
      wx.hideLoading();
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    }
  }
});
