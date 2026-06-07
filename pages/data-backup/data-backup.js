const clouddb = require('../../utils/clouddb.js');
const { getErrorLogs, reportError } = require('../../utils/error-log.js');
const { confirmDangerousAction } = require('../../utils/util.js');
const { syncPageTheme } = require('../../utils/themes.js');

Page({
  data: {
    loading: true,
    loadError: false,
    exporting: false,
    counts: {
      cats: 0,
      healthRecords: 0,
      weightRecords: 0,
      reminders: 0,
      expenses: 0
    },
    backupData: null,
    exportedAtText: '',
    diagnosticCount: 0,
    copyingDiagnostics: false,
    readingImport: false,
    restoring: false,
    showRestoreModal: false,
    restoreMode: 'merge',
    importPreview: null
  },

  onLoad() {
    this.loadBackupData();
  },

  onShow() {
    syncPageTheme(this);
  },

  async loadBackupData() {
    this.setData({ loading: true, loadError: false });
    try {
      const snapshot = await clouddb.getBackupSnapshot();
      const backupData = {
        formatVersion: 2,
        schemaVersion: '2026-06',
        backupId: 'backup_' + Date.now(),
        appName: '宠物小管家Plus',
        exportedAt: new Date().toISOString(),
        data: {
          cats: snapshot.cats || [],
          healthRecords: snapshot.healthRecords || [],
          weightRecords: snapshot.weightRecords || [],
          reminders: snapshot.reminders || [],
          expenses: snapshot.expenses || []
        }
      };
      this.setData({
        loading: false,
        backupData,
        exportedAtText: this.formatTime(backupData.exportedAt),
        diagnosticCount: getErrorLogs().length,
        counts: {
          cats: backupData.data.cats.length,
          healthRecords: backupData.data.healthRecords.length,
          weightRecords: backupData.data.weightRecords.length,
          reminders: backupData.data.reminders.length,
          expenses: backupData.data.expenses.length
        }
      });
    } catch (error) {
      reportError('dataBackup.load', error);
      this.setData({ loading: false, loadError: true, backupData: null });
    }
  },

  formatTime(value) {
    const date = new Date(value);
    const pad = number => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  },

  retryLoad() {
    this.loadBackupData();
  },

  async copyBackupData() {
    if (!this.data.backupData || this.data.exporting) return;
    this.setData({ exporting: true });
    try {
      await new Promise((resolve, reject) => {
        wx.setClipboardData({
          data: JSON.stringify(this.data.backupData, null, 2),
          success: resolve,
          fail: reject
        });
      });
      wx.showToast({ title: '备份已复制', icon: 'success' });
    } catch (error) {
      reportError('dataBackup.copy', error);
      wx.showToast({ title: '复制失败，请重试', icon: 'none' });
    } finally {
      this.setData({ exporting: false });
    }
  },

  async copyDiagnostics() {
    if (this.data.copyingDiagnostics) return;
    this.setData({ copyingDiagnostics: true });
    try {
      const logs = getErrorLogs();
      const summary = {
        appName: '宠物小管家Plus',
        generatedAt: new Date().toISOString(),
        logs
      };
      await new Promise((resolve, reject) => wx.setClipboardData({
        data: JSON.stringify(summary, null, 2),
        success: resolve,
        fail: reject
      }));
      wx.showToast({ title: logs.length ? '诊断信息已复制' : '暂无错误记录', icon: 'none' });
    } catch (error) {
      reportError('dataBackup.copyDiagnostics', error);
      wx.showToast({ title: '复制失败，请重试', icon: 'none' });
    } finally {
      this.setData({ copyingDiagnostics: false });
    }
  },

  async readBackupFromClipboard() {
    if (this.data.readingImport) return;
    this.setData({ readingImport: true });
    try {
      const clipboard = await new Promise((resolve, reject) => wx.getClipboardData({
        success: result => resolve(result.data),
        fail: reject
      }));
      const parsed = JSON.parse(clipboard);
      const preview = this.validateBackup(parsed);
      const current = this.data.backupData && this.data.backupData.data;
      const keys = ['cats', 'healthRecords', 'weightRecords', 'reminders', 'expenses'];
      preview.conflicts = keys.reduce((sum, key) => {
        const currentIds = new Set((current && current[key] || []).map(row => row._id));
        return sum + preview.data[key].filter(row => currentIds.has(row._id)).length;
      }, 0);
      this.setData({
        importPreview: preview,
        restoreMode: 'merge',
        showRestoreModal: true
      });
    } catch (error) {
      reportError('dataBackup.readImport', error);
      wx.showToast({ title: error.message || '无法识别备份内容', icon: 'none' });
    } finally {
      this.setData({ readingImport: false });
    }
  },

  validateBackup(parsed) {
    if (!parsed || !parsed.data || ![1, 2].includes(Number(parsed.formatVersion))) {
      throw new Error('备份格式或版本不受支持');
    }
    const keys = ['cats', 'healthRecords', 'weightRecords', 'reminders', 'expenses'];
    const data = {};
    keys.forEach(key => {
      if (!Array.isArray(parsed.data[key])) throw new Error('备份缺少 ' + key + ' 数据');
      if (parsed.data[key].length > 2000) throw new Error(key + ' 数据量超过恢复上限');
      parsed.data[key].forEach(row => {
        if (!row || !/^[A-Za-z0-9_-]{1,80}$/.test(String(row._id || ''))) {
          throw new Error(key + ' 中存在无效数据标识');
        }
      });
      data[key] = parsed.data[key];
    });
    return {
      formatVersion: Number(parsed.formatVersion),
      schemaVersion: parsed.schemaVersion || 'legacy',
      exportedAt: parsed.exportedAt || '',
      data,
      counts: {
        cats: data.cats.length,
        healthRecords: data.healthRecords.length,
        weightRecords: data.weightRecords.length,
        reminders: data.reminders.length,
        expenses: data.expenses.length
      },
      conflicts: 0
    };
  },

  setRestoreMode(e) {
    this.setData({ restoreMode: e.currentTarget.dataset.mode });
  },

  closeRestoreModal() {
    if (this.data.restoring) return;
    this.setData({ showRestoreModal: false, importPreview: null });
  },

  async confirmRestore() {
    if (!this.data.importPreview || this.data.restoring) return;
    if (this.data.restoreMode === 'replace') {
      const confirmed = await confirmDangerousAction({
        title: '覆盖当前数据',
        content: '当前宠物、健康、体重、提醒和记账数据会先被清空。',
        secondContent: '覆盖恢复不可撤销，确定继续吗？'
      });
      if (!confirmed) return;
    }
    this.setData({ restoring: true });
    wx.showLoading({ title: '恢复中...', mask: true });
    try {
      const result = await clouddb.restoreBackupSnapshot(
        this.data.importPreview.data,
        this.data.restoreMode
      );
      wx.showToast({ title: '已恢复 ' + result.restored + ' 条', icon: 'success' });
      this.setData({ showRestoreModal: false, importPreview: null });
      await this.loadBackupData();
    } catch (error) {
      reportError('dataBackup.restore', error, { mode: this.data.restoreMode });
      wx.showToast({ title: '恢复失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ restoring: false });
    }
  }
});
