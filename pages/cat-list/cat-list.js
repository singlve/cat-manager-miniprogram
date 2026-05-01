// pages/cat-list/cat-list.js
// 猫咪列表页
const clouddb = require('../../utils/clouddb.js');
const { calcAgeDetail, calcDaysBetween, formatBirthdayRow } = require('../../utils/util.js');

// ─── Demo 数据（未登录时展示） ───
function getDemoCats() {
  const cat1 = {
    _id: 'demo_1', name: '橘座', breed: '中华田园猫', gender: 'male',
    birthday: '2023-03-15', avatar: '', _displayAvatar: '',
    _daysSinceRecord: 3, _isDemo: true,
    adoptedDate: '2023-03-15', status: 'with_me'
  };
  const cat2 = {
    _id: 'demo_2', name: '雪球', breed: '布偶猫', gender: 'female',
    birthday: '2024-01-20', avatar: '', _displayAvatar: '',
    _daysSinceRecord: 0, _isDemo: true,
    adoptedDate: '2024-01-20', status: 'with_me'
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
    return {
      ...cat,
      _ageText: ageText,
      _companionText: companionText,
      _birthdayText: bday.text,
      _birthdayHint: bday.hint,
      _isPassed: isPassed
    };
  });
}

Page({
  data: {
    cats: [], loading: false, isLoggedIn: false,
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
        title: '品种库大更新',
        desc: '品种从33个扩展到92个，覆盖主流品种及颜色变种',
        bg: 'linear-gradient(135deg, #f3e5f5, #e1bee7)',
        color: '#6a1b9a',
        tag: '更新'
      },
      {
        emoji: '🌈',
        title: '宠物状态管理',
        desc: '支持记录猫咪在身边/去喵星状态，珍藏每一段陪伴时光',
        bg: 'linear-gradient(135deg, #fff3e0, #ffe0b2)',
        color: '#e65100',
        tag: '功能'
      }
    ]
  },

  onShow() {
    const app = getApp();
    this.setData({ isLoggedIn: app.isLoggedIn() });
    if (app.isLoggedIn()) {
      this.loadAll();
    } else {
      // 未登录时展示 demo 数据
      this.setData({ cats: getDemoCats() });
    }
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  async loadAll() {
    this.setData({ loading: true });
    try {
      const cats = await clouddb.getCats();

      const catsWithExtras = await Promise.all(cats.map(async cat => {
        const avatarUrl = cat.avatar ? await clouddb.getAvatarUrl(cat.avatar) : '';

        // 去喵星了 → 年龄冻结在 passedDate
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
        if (cat._id) {
          const records = await clouddb.getRecords({ catId: cat._id });
          if (records.length > 0) {
            const latest = records.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            daysSinceRecord = Math.floor((Date.now() - new Date(latest.date).getTime()) / 86400000);
          }
        }

        return {
          ...cat,
          _displayAvatar: avatarUrl,
          _daysSinceRecord: daysSinceRecord,
          _ageText: ageText,
          _companionText: companionText,
          _birthdayText: bday.text,
          _birthdayHint: bday.hint,
          _isPassed: isPassed
        };
      }));

      this.setData({ cats: catsWithExtras, loading: false });
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

  quickAddRecord(e) {
    // 不拦截：允许跳健康记录页
    const { id, name } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/health-records/health-records?catId=${id}&catName=${name}` });
  },

  async deleteCat(e) {
    const app = getApp();
    if (!app.isLoggedIn()) { this._promptLogin(); return; }
    const confirmed = await new Promise(r =>
      wx.showModal({
        title: '确认删除',
        content: '确定要删除这只猫咪的档案吗？相关记录也会一并删除。',
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
  }
});
