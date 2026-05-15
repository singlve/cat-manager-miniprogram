// pages/cat-list/cat-list.js
// 宠物列表页
const clouddb = require('../../utils/clouddb.js');
const { calcAgeDetail, calcDaysBetween, formatBirthdayRow } = require('../../utils/util.js');

// ─── Demo 数据（未登录时展示） ───
function getDemoCats() {
  const cat1 = {
    _id: 'demo_1', name: '橘座', breed: '中华田园猫', gender: 'male',
    birthday: '2023-03-15', avatar: '', _displayAvatar: '',
    _daysSinceRecord: 3, _isDemo: true,
    adoptedDate: '2023-03-15', status: 'with_me', species: 'cat'
  };
  const cat2 = {
    _id: 'demo_2', name: '雪球', breed: '布偶猫', gender: 'female',
    birthday: '2024-01-20', avatar: '', _displayAvatar: '',
    _daysSinceRecord: 0, _isDemo: true,
    adoptedDate: '2024-01-20', status: 'with_me', species: 'cat'
  };

  // 为 demo 数据追加 computed 字段
  return [cat1, cat2].map(cat => {
    const isPassed = cat.status === 'passed_away';
    const ageEndDate = isPassed ? (cat.passedDate || undefined) : undefined;
    const age = calcAgeDetail(cat.birthday, ageEndDate);
    const bday = formatBirthdayRow(cat.birthday, isPassed);
    let companionText = '';
    if (isPassed && cat.passedDate) {
      const d = calcDaysBetween(cat.passedDate);
      if (d !== null) companionText = '🌈 宝贝已离开' + d + '天';
    } else {
      const startDate = cat.adoptedDate || cat.birthday;
      const cDays = calcDaysBetween(startDate);
      if (cDays !== null) companionText = '🏠 与你相伴' + cDays + '天';
    }
    let ageText = '';
    if (age) {
      const parts = [];
      if (age.years > 0) parts.push(age.years + '岁');
      if (age.months > 0) parts.push(age.months + '个月');
      parts.push(age.days + '天');
      ageText = parts.join('');
    }
    return Object.assign({}, cat, {
      _ageText: ageText,
      _companionText: companionText,
      _birthdayText: bday.text,
      _birthdayHint: bday.hint,
      _isPassed: isPassed
    });
  });
}

Page({
  data: {
    isOnline: true,
    cats: [], displayCats: [], loading: false, isLoggedIn: false,
    filterSpecies: 'all', sortBy: 'default',
    speciesCounts: { all: 0, cat: 0, dog: 0 },
    quickCatId: '', quickCatName: '', quickType: '', quickTypeName: '',
    showQuickModal: false, quickDate: new Date().toISOString().split('T')[0],
    banners: [
      {
        emoji: '⚖️',
        title: '体重记录功能上线',
        desc: '支持精确到时分秒的体重记录，折线图追踪变化趋势',
        bg: 'linear-gradient(135deg, #e8f5e9, #c8e6c9)',
        color: '#2e7d32',
        tag: 'NEW'
      },
      {
        emoji: '🐾',
        title: '支持狗狗记录',
        desc: '养狗狗的宝宝有福啦',
        bg: 'linear-gradient(135deg, #f3e5f5, #e1bee7)',
        color: '#6a1b9a',
        tag: '更新'
      },
      {
        emoji: '🌈',
        title: '宠物状态管理',
        desc: '支持记录宠物在身边/已离世状态，珍藏每一段陪伴时光',
        bg: 'linear-gradient(135deg, #fff3e0, #ffe0b2)',
        color: '#e65100',
        tag: '功能'
      },
      {
        emoji: '✍️',
        title: '签到功能上线',
        desc: '签到/抽奖得积分兑换爱宠用品',
        bg: 'linear-gradient(135deg, #fff3f9, #ffe0b2)',
        color: '#e65199',
        tag: '功能'
      },
      {
        emoji: '📒',
        title: '记账功能上线',
        desc: '记录你想记录的任何花销',
        bg: 'linear-gradient(135deg, #fff1e1, #ffe2c2)',
        color: '#e62100',
        tag: '功能'
      }
    ]
  },

  onShow() {
    this.setData({ isOnline: getApp().globalData.isOnline });
    const app = getApp();
    this.setData({ isLoggedIn: app.isLoggedIn() });
    if (app.isLoggedIn()) {
      this.loadAll();
    } else {
      // 未登录时展示 demo 数据
      const demoCats = getDemoCats();
      this._rawCats = demoCats;
      const counts = { all: demoCats.length, cat: demoCats.length, dog: 0 };
      this.setData({ cats: demoCats, speciesCounts: counts });
      this._updateDisplay();
    }
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  async loadAll() {
    this.setData({ loading: true });
    try {
      const cats = await clouddb.getCats();

      // 批量获取所有宠物的健康记录，按 catId 分组取最近日期
      const allRecords = await clouddb.getRecords();
      const latestRecordByCat = {};
      for (const r of allRecords) {
        const existing = latestRecordByCat[r.catId];
        if (!existing || r.date > existing) latestRecordByCat[r.catId] = r.date;
      }

      const catsWithExtras = await Promise.all(cats.map(async cat => {
        const avatarUrl = cat.avatar ? await clouddb.getAvatarUrl(cat.avatar) : '';

        // 已离世 → 年龄冻结在 passedDate
        const isPassed = cat.status === 'passed_away';
        const ageEndDate = isPassed ? (cat.passedDate || undefined) : undefined;
        const age = calcAgeDetail(cat.birthday, ageEndDate);

        // 生日行（日期 + 近7天倒计时）
        const bday = formatBirthdayRow(cat.birthday, isPassed);

        // 相伴 / 离开天数
        let companionText = '';
        if (isPassed && cat.passedDate) {
          const departedDays = calcDaysBetween(cat.passedDate);
          if (departedDays !== null) companionText = '🌈 宝贝已离开' + departedDays + '天';
        } else {
          const startDate = cat.adoptedDate || cat.birthday;
          const cDays = calcDaysBetween(startDate);
          if (cDays !== null) companionText = '🏠 与你相伴' + cDays + '天';
        }

        // 年龄文本
        let ageText = '';
        if (age) {
          const parts = [];
          if (age.years > 0) parts.push(age.years + '岁');
          if (age.months > 0) parts.push(age.months + '个月');
          parts.push(age.days + '天');
          ageText = parts.join('');
        }

        let daysSinceRecord;
        const latestDate = latestRecordByCat[cat._id];
        if (latestDate) {
          daysSinceRecord = Math.floor((Date.now() - new Date(latestDate).getTime()) / 86400000);
        }

        return Object.assign({}, cat, {
          _displayAvatar: avatarUrl,
          _daysSinceRecord: daysSinceRecord,
          _ageText: ageText,
          _companionText: companionText,
          _birthdayText: bday.text,
          _birthdayHint: bday.hint,
          _isPassed: isPassed
        });
      }));

      this._rawCats = catsWithExtras;
      const counts = { all: catsWithExtras.length, cat: 0, dog: 0 };
      catsWithExtras.forEach(c => {
        const s = c.species || 'cat';
        if (s === 'cat') counts.cat++;
        else if (s === 'dog') counts.dog++;
      });
      this.setData({ cats: catsWithExtras, loading: false, speciesCounts: counts });
      this._updateDisplay();
    } catch (e) {
      console.error('[cat-list] loadAll error:', e);
      this.setData({ loading: false });
    }
  },

  addCat() {
    // 不拦截：允许体验添加流程，保存时才检查登录
    wx.navigateTo({ url: '/pages/cat-add/cat-add' });
  },

  goCatDetail(e) {
    // 不拦截：demo 猫可点击查看详情
    wx.navigateTo({ url: `/pages/cat-detail/cat-detail?id=${e.currentTarget.dataset.id}` });
  },

  // ─── 速记：ActionSheet 选类型 → 弹窗选日期 → 直接保存 ───
  onQuickRecord(e) {
    const app = getApp();
    if (!app.isLoggedIn()) { this._promptLogin(); return; }
    const { id, name } = e.currentTarget.dataset;
    this.setData({ quickCatId: id, quickCatName: name });
    wx.showActionSheet({
      itemList: ['洗澡', '驱虫', '免疫', '体检'],
      success: (res) => {
        const types = ['bath', 'deworm', 'vaccine', 'checkup'];
        const names = ['洗澡', '驱虫', '免疫', '体检'];
        if (res.tapIndex < 4) {
          this.setData({
            quickType: types[res.tapIndex],
            quickTypeName: names[res.tapIndex],
            quickDate: new Date().toISOString().split('T')[0],
            showQuickModal: true
          });
        }
      }
    });
  },
  onQuickDateChange(e) { this.setData({ quickDate: e.detail.value }); },
  closeQuickModal() { this.setData({ showQuickModal: false }); },
  stopBubble() {},
  async saveQuickRecord() {
    const { quickCatId, quickType, quickDate } = this.data;
    if (!quickType || !quickDate) return;
    wx.showLoading({ title: '保存中...' });
    try {
      await clouddb.addRecord({
        catId: quickCatId,
        type: quickType,
        date: quickDate,
        note: ''
      });
      wx.hideLoading();
      this.setData({ showQuickModal: false });
      wx.showToast({ title: this.data.quickTypeName + '已记录', icon: 'success' });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '记录失败', icon: 'none' });
    }
  },

  async deleteCat(e) {
    const app = getApp();
    if (!app.isLoggedIn()) { this._promptLogin(); return; }
    const confirmed = await new Promise(r =>
      wx.showModal({
        title: '确认删除',
        content: '确定要删除这只宠物的档案吗？相关记录也会一并删除。',
        success: res => r(res.confirm)
      })
    );
    if (!confirmed) return;
    wx.showLoading({ title: '删除中...' });
    try {
      await clouddb.deleteCat(e.currentTarget.dataset.id);
      wx.showToast({ title: '已删除', icon: 'success' });
      this.loadAll();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  },

  // ─── 筛选与排序 ───
  onFilterSpecies(e) {
    const species = e.currentTarget.dataset.species;
    this.setData({ filterSpecies: species });
    this._updateDisplay();
  },

  onShowSort() {
    wx.showActionSheet({
      itemList: ['默认排序', '按名字 A-Z', '最近添加优先', '已离世放最后'],
      success: (res) => {
        const map = { 0: 'default', 1: 'name', 2: 'recent', 3: 'passedLast' };
        this.setData({ sortBy: map[res.tapIndex] });
        this._updateDisplay();
      }
    });
  },

  _updateDisplay() {
    const raw = this._rawCats || [];
    const { filterSpecies, sortBy } = this.data;

    // 按物种筛选
    let filtered = raw;
    if (filterSpecies !== 'all') {
      filtered = raw.filter(c => {
        const s = c.species || 'cat';
        return s === filterSpecies;
      });
    }

    // 排序
    var sorted = filtered.slice();
    if (sortBy === 'name') {
      sorted.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh'));
    } else if (sortBy === 'recent') {
      sorted.sort((a, b) => {
        const aDate = a.createdAt || a.adoptedDate || a.birthday || '';
        const bDate = b.createdAt || b.adoptedDate || b.birthday || '';
        return new Date(bDate) - new Date(aDate);
      });
    } else if (sortBy === 'passedLast') {
      sorted.sort((a, b) => {
        if ((a.status === 'passed_away') !== (b.status === 'passed_away')) {
          return a.status === 'passed_away' ? 1 : -1;
        }
        return 0;
      });
    }

    this.setData({ displayCats: sorted });
  },

  // ─── 统一登录提示（各写操作复用） ───
  _promptLogin() {
    wx.showModal({
      title: '需要登录',
      content: '该操作需要登录后才能完成，是否现在登录？',
      confirmText: '去登录',
      cancelText: '稍后再说',
      success: res => {
        if (res.confirm) wx.navigateTo({ url: '/pages/login/login' });
      }
    });
  },

  async onPullDownRefresh() {
    try { await this.loadAll(); } finally { wx.stopPullDownRefresh(); }
  },

  onShareAppMessage() {
    return { title: '猫咪健康管家 - 记录宝贝的健康日常 🐱', path: '/pages/cat-list/cat-list' };
  },
});