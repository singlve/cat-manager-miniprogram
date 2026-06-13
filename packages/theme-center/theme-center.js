const clouddb = require('../../utils/clouddb.js');
const {
  THEMES,
  getThemeProducts,
  getTheme,
  getInitialThemeData,
  normalizeOwnedThemes
} = require('../../utils/themes.js');
const initialTheme = getInitialThemeData();

function hexToRgb(hex) {
  var clean = String(hex || '').replace('#', '');
  var value = parseInt(clean, 16);
  if (!Number.isFinite(value)) return '91, 167, 216';
  return [
    (value >> 16) & 255,
    (value >> 8) & 255,
    value & 255
  ].join(', ');
}

function buildPreviewStyle(theme) {
  return [
    '--theme-primary:' + theme.primary,
    '--theme-primary-rgb:' + hexToRgb(theme.primary),
    '--theme-primary-deep:' + theme.primaryDeep,
    '--theme-secondary:' + theme.secondary,
    '--theme-secondary-rgb:' + hexToRgb(theme.secondary),
    '--theme-secondary-deep:' + theme.secondaryDeep,
    '--theme-action-start:' + theme.actionStart,
    '--theme-action-end:' + theme.actionEnd,
    '--theme-primary-soft:' + theme.soft,
    '--theme-secondary-soft:' + theme.secondarySoft,
    '--theme-bg:' + theme.background,
    '--theme-surface-tint:' + theme.soft
  ].join(';');
}

Page({
  data: {
    themes: [],
    ownedThemes: ['default'],
    activeTheme: initialTheme.themeKey,
    previewTheme: initialTheme.themeKey,
    selectedTheme: Object.assign({}, getTheme(initialTheme.themeKey), {
      owned: true,
      active: true,
      previewing: true,
      points: 0
    }),
    previewStyle: buildPreviewStyle(getTheme(initialTheme.themeKey)),
    themeClass: initialTheme.themeClass,
    saving: false,
    showApplyBar: false,
    previewScene: 'home',
    previewScenes: [
      { key: 'home', label: '首页' },
      { key: 'reminder', label: '提醒' },
      { key: 'expense', label: '记账' }
    ]
  },

  async onShow() {
    var currentUser = {};
    try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (e) {}

    if (currentUser._id) {
      try {
        var cloudUser = await clouddb.getUserById(currentUser._id);
        if (cloudUser) {
          currentUser = Object.assign({}, currentUser, cloudUser);
          wx.setStorageSync('currentUser', currentUser);
        }
      } catch (e) {}
    }

    var ownedThemes = normalizeOwnedThemes(currentUser.ownedThemes);
    var activeTheme = ownedThemes.indexOf(currentUser.activeTheme) !== -1
      ? currentUser.activeTheme
      : 'default';
    var app = getApp();
    var active = app.applyTheme(activeTheme);
    var priceMap = await this.loadThemePrices();
    var themes = this.buildThemes(ownedThemes, active.key, active.key, priceMap);

    this.setData({
      ownedThemes: ownedThemes,
      activeTheme: active.key,
      previewTheme: active.key,
      selectedTheme: themes.find(function(theme) { return theme.key === active.key; }) || themes[0],
      previewStyle: buildPreviewStyle(active),
      themeClass: active.className,
      themes: themes,
      showApplyBar: false
    });
  },

  async loadThemePrices() {
    var map = {};
    getThemeProducts().forEach(function(item) {
      map[item.virtualValue] = item.points;
    });
    try {
      var items = await clouddb.getRedeemItems();
      (items || []).forEach(function(item) {
        if (item.virtualType === 'theme' && item.virtualValue) {
          map[item.virtualValue] = item.points;
        }
      });
    } catch (e) {}
    return map;
  },

  buildThemes(ownedThemes, activeKey, previewKey, priceMap) {
    return THEMES.map(function(theme) {
      return Object.assign({}, theme, {
        owned: ownedThemes.indexOf(theme.key) !== -1,
        active: activeKey === theme.key,
        previewing: previewKey === theme.key,
        points: theme.key === 'default' ? 0 : (priceMap[theme.key] || 0)
      });
    });
  },

  previewThemeStyle(e) {
    if (this.data.saving) return;
    var key = e.currentTarget.dataset.key;
    var preview = getTheme(key);
    var themes = this.data.themes.map(function(theme) {
      return Object.assign({}, theme, { previewing: theme.key === key });
    });
    this.setData({
      previewTheme: key,
      selectedTheme: themes.find(function(theme) { return theme.key === key; }),
      previewStyle: buildPreviewStyle(preview),
      themes: themes,
      showApplyBar: key !== this.data.activeTheme
    });
  },

  switchPreviewScene(e) {
    var scene = e.currentTarget.dataset.scene;
    if (!scene || scene === this.data.previewScene) return;
    this.setData({ previewScene: scene });
  },

  handlePrimaryAction() {
    if (!this.data.selectedTheme || !this.data.selectedTheme.owned) {
      this.goMall();
      return;
    }
    this.confirmTheme();
  },

  async confirmTheme() {
    var key = this.data.previewTheme;
    if (this.data.saving || key === this.data.activeTheme) return;
    var oldKey = this.data.activeTheme;
    var oldUser = {};
    var cloudThemeSaved = false;
    try { oldUser = Object.assign({}, wx.getStorageSync('currentUser') || {}); } catch (e) {}
    this.setData({ saving: true });
    try {
      var currentUser = Object.assign({}, oldUser, {
        activeTheme: key,
        ownedThemes: normalizeOwnedThemes(oldUser.ownedThemes)
      });
      if (currentUser._id) {
        await clouddb.updateUser(currentUser._id, {
          activeTheme: key,
          ownedThemes: currentUser.ownedThemes
        });
        cloudThemeSaved = true;
      }
      wx.setStorageSync('currentUser', currentUser);
      var active = getApp().applyTheme(key);
      var updatedThemes = this.data.themes.map(function(theme) {
        return Object.assign({}, theme, {
          active: theme.key === key,
          previewing: theme.key === key
        });
      });
      this.setData({
        activeTheme: active.key,
        previewTheme: active.key,
        themeClass: active.className,
        previewStyle: buildPreviewStyle(active),
        themes: updatedThemes,
        selectedTheme: updatedThemes.find(function(theme) { return theme.key === key; }),
        showApplyBar: false
      });
      wx.showToast({ title: key === 'default' ? '已恢复默认主题' : '主题已启用', icon: 'success' });
    } catch (e) {
      if (oldUser._id && cloudThemeSaved) {
        try {
          await clouddb.updateUser(oldUser._id, {
            activeTheme: oldKey,
            ownedThemes: normalizeOwnedThemes(oldUser.ownedThemes)
          });
        } catch (rollbackError) {}
      }
      try { wx.setStorageSync('currentUser', oldUser); } catch (storageError) {}
      var restored = getApp().applyTheme(oldKey);
      var restoredThemes = this.data.themes.map(function(theme) {
        return Object.assign({}, theme, {
          active: theme.key === oldKey,
          previewing: theme.key === oldKey
        });
      });
      this.setData({
        activeTheme: oldKey,
        previewTheme: oldKey,
        themeClass: restored.className,
        previewStyle: buildPreviewStyle(restored),
        themes: restoredThemes,
        selectedTheme: restoredThemes.find(function(theme) { return theme.key === oldKey; }),
        showApplyBar: false
      });
      wx.showToast({ title: '保存失败，已恢复原主题', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  cancelPreview() {
    var active = getTheme(this.data.activeTheme);
    var themes = this.data.themes.map(function(theme) {
      return Object.assign({}, theme, { previewing: theme.key === active.key });
    });
    this.setData({
      previewTheme: active.key,
      selectedTheme: themes.find(function(theme) { return theme.key === active.key; }),
      previewStyle: buildPreviewStyle(active),
      themes: themes,
      showApplyBar: false
    });
  },

  goMall() {
    wx.navigateTo({ url: '/packages/points-mall/points-mall' });
  },

  restoreDefaultTheme() {
    var that = this;
    if (this.data.saving) return;
    if (this.data.activeTheme === 'default') {
      wx.showToast({ title: '当前已是默认主题', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '恢复默认主题',
      content: '将切换回清爽治愈主题，已解锁的其他主题不会受到影响。',
      confirmText: '恢复默认',
      success: function(res) {
        if (!res.confirm) return;
        var preview = getTheme('default');
        var themes = that.data.themes.map(function(theme) {
          return Object.assign({}, theme, { previewing: theme.key === 'default' });
        });
        that.setData({
          previewTheme: 'default',
          selectedTheme: themes.find(function(theme) { return theme.key === 'default'; }),
          previewStyle: buildPreviewStyle(preview),
          themes: themes,
          showApplyBar: true
        }, function() {
          that.confirmTheme();
        });
      }
    });
  },

  onShareAppMessage() {
    return {
      imageUrl: '/assets/logo.jpg',
      title: '宠物小管家Plus - 主题装扮',
      path: '/pages/cat-list/cat-list'
    };
  }
});
