// pages/cat-list/cat-list.js
// 宠物列表页
const clouddb = require('../../utils/clouddb.js');
const { calcAgeDetail, calcDaysBetween, formatBirthdayRow, parseDate } = require('../../utils/util.js');

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
      if (d !== null) companionText = '宝贝已离开' + d + '天';
    } else {
      const startDate = cat.adoptedDate || cat.birthday;
      const cDays = calcDaysBetween(startDate);
      if (cDays !== null) companionText = '与你相伴' + cDays + '天';
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
    isOnline: true, loadError: false,
    cats: [], displayCats: [], loading: false, isLoggedIn: false,
    filterSpecies: 'all', sortBy: 'default',
    speciesCounts: { all: 0, cat: 0, dog: 0 },
    addFabX: 0, addFabY: 0, addFabMovingX: 0, addFabMovingY: 0,
    quickCatId: '', quickCatName: '', quickType: '', quickTypeName: '',
    showQuickTypeModal: false, showQuickModal: false, quickDate: new Date().toISOString().split('T')[0],
    quickTypeOptions: [
      { value: 'bath', label: '洗澡' },
      { value: 'deworm', label: '驱虫' },
      { value: 'vaccine', label: '免疫' },
      { value: 'checkup', label: '体检' }
    ],
    showSortModal: false,
    sortOptions: [
      { value: 'default', label: '默认排序' },
      { value: 'name', label: '按名字 A-Z' },
      { value: 'recent', label: '最近添加优先' },
      { value: 'passedLast', label: '已离世放最后' }
    ],
    announcement: null,
    recentActivities: [],
    recentActivitiesExpanded: false,
    banners: [
      {
        iconPath: '/assets/icons/ui/pet.png',
        title: '建立专属宠物档案',
        desc: '记录猫猫狗狗的生日、品种、状态和陪伴时光',
        tag: '档案'
      },
      {
        iconPath: '/assets/icons/ui/edit.png',
        title: '快速记录健康日常',
        desc: '洗澡、驱虫、免疫、体检都能一键速记',
        tag: '健康'
      },
      {
        iconPath: '/assets/icons/ui/weight.png',
        title: '体重趋势清晰可见',
        desc: '按时间记录体重变化，照护变化更容易发现',
        tag: '体重'
      },
      {
        iconPath: '/assets/icons/ui/reminder.png',
        title: '重要事项准时提醒',
        desc: '设置疫苗、驱虫、洗护等提醒，减少遗忘',
        tag: '提醒'
      },
      {
        iconPath: '/assets/icons/ui/expense.png',
        title: '记账积分都能管理',
        desc: '记录宠物花销，签到攒积分兑换小奖励',
        tag: '日常'
      }
    ]
  },

  onShow() {
    this.setData({ isOnline: getApp().globalData.isOnline });
    this._initAddFabPosition();
    this._loadAnnouncement();
    const app = getApp();
    this.setData({ isLoggedIn: app.isLoggedIn() });
    if (app.isLoggedIn()) {
      this.loadAll();
    } else {
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
    // 只有在没有任何宠物数据展示时才显示 loading
    if (this.data.displayCats.length === 0) {
      this.setData({ loading: true, loadError: false });
    }
    try {
      const [cats, allRecords, reminders] = await Promise.all([
        clouddb.getCats(),
        clouddb.getRecords(),
        clouddb.getReminders()
      ]);

      // 批量获取所有宠物的健康记录，按 catId 分组取最近日期
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
          if (departedDays !== null) companionText = '宝贝已离开' + departedDays + '天';
        } else {
          const startDate = cat.adoptedDate || cat.birthday;
          const cDays = calcDaysBetween(startDate);
          if (cDays !== null) companionText = '与你相伴' + cDays + '天';
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
          daysSinceRecord = Math.floor((Date.now() - parseDate(latestDate).getTime()) / 86400000);
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
      const catNameMap = {};
      catsWithExtras.forEach(cat => { catNameMap[cat._id] = cat.name; });
      const recentActivities = this._buildRecentActivities(allRecords, reminders, catNameMap);
      this.setData({ cats: catsWithExtras, loading: false, speciesCounts: counts, recentActivities });
      this._updateDisplay();
    } catch (e) {
      console.error('[cat-list] loadAll error:', e);
      this.setData({ loading: false, loadError: true });
    }
  },

  retryLoad() {
    this.loadAll();
  },

  addCat() {
    // 不拦截：允许体验添加流程，保存时才检查登录
    wx.navigateTo({ url: '/pages/cat-add/cat-add' });
  },

  _initAddFabPosition() {
    if (this._addFabInited) return;
    try {
      const info = wx.getSystemInfoSync();
      this._windowWidth = info.windowWidth || 375;
      this._windowHeight = info.windowHeight || 667;
      this.setData({
        addFabX: Math.max(this._windowWidth - 74, 0),
        addFabY: Math.max(this._windowHeight - 210, 120),
        addFabMovingX: Math.max(this._windowWidth - 74, 0),
        addFabMovingY: Math.max(this._windowHeight - 210, 120)
      });
      this._addFabInited = true;
    } catch (e) {}
  },

  onAddFabMove(e) {
    if (!e.detail || e.detail.source !== 'touch') return;
    this._addFabMovingX = e.detail.x;
    this._addFabMovingY = e.detail.y;
  },

  onAddFabRelease() {
    const windowWidth = this._windowWidth || 375;
    const x = this._addFabMovingX || this.data.addFabX || 0;
    const y = this._addFabMovingY || this.data.addFabY || 0;
    const snappedX = x > windowWidth / 2 ? Math.max(windowWidth - 74, 0) : 16;
    this.setData({ addFabX: snappedX, addFabY: y });
  },

  goCatDetail(e) {
    // 不拦截：demo 猫可点击查看详情
    wx.navigateTo({ url: `/pages/cat-detail/cat-detail?id=${e.currentTarget.dataset.id}` });
  },

  goRecentActivity(e) {
    const kind = e.currentTarget.dataset.kind;
    const catId = e.currentTarget.dataset.catid;
    if (kind === 'reminder') {
      wx.switchTab({ url: '/pages/reminders/reminders' });
      return;
    }
    if (catId) wx.navigateTo({ url: `/pages/cat-detail/cat-detail?id=${catId}` });
  },

  toggleRecentActivities() {
    this.setData({ recentActivitiesExpanded: !this.data.recentActivitiesExpanded });
  },

  _buildRecentActivities(records, reminders, catNameMap) {
    const typeMeta = {
      bath: { label: '洗澡', iconPath: '/assets/icons/ui/bath.png' },
      deworm: { label: '驱虫', iconPath: '/assets/icons/ui/deworm.png' },
      vaccine: { label: '免疫', iconPath: '/assets/icons/ui/vaccine.png' },
      checkup: { label: '体检', iconPath: '/assets/icons/ui/checkup.png' },
      claw: { label: '修剪指甲', iconPath: '/assets/icons/ui/claw.png' },
      other: { label: '其他', iconPath: '/assets/icons/ui/other.png' }
    };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueItems = (reminders || [])
      .filter(reminder => !reminder.completedAt && catNameMap[reminder.catId] && reminder.lastDate && reminder.intervalDays)
      .map(reminder => {
        const next = parseDate(String(reminder.lastDate).slice(0, 10));
        next.setDate(next.getDate() + Number(reminder.intervalDays));
        const daysUntil = Math.ceil((next - today) / 86400000);
        const meta = typeMeta[reminder.type] || typeMeta.other;
        return {
          id: `reminder_${reminder._id}`,
          kind: 'reminder',
          catId: reminder.catId,
          iconPath: meta.iconPath,
          title: `${catNameMap[reminder.catId]}的${meta.label}提醒`,
          desc: daysUntil < 0 ? `已逾期 ${Math.abs(daysUntil)} 天` : daysUntil === 0 ? '今天需要完成' : `${daysUntil} 天后到期`,
          tone: daysUntil <= 0 ? 'danger' : 'warning',
          sortValue: daysUntil
        };
      })
      .filter(item => item.sortValue <= 7)
      .sort((a, b) => a.sortValue - b.sortValue)
      .slice(0, 2);

    const recordItems = (records || [])
      .filter(record => record.date && catNameMap[record.catId])
      .sort((a, b) => parseDate(b.date) - parseDate(a.date))
      .slice(0, 3)
      .map(record => {
        const meta = typeMeta[record.type] || typeMeta.other;
        return {
          id: `record_${record._id}`,
          kind: 'record',
          catId: record.catId,
          iconPath: meta.iconPath,
          title: `${catNameMap[record.catId]}完成了${meta.label}`,
          desc: String(record.date).slice(0, 10),
          tone: 'normal',
          sortValue: parseDate(record.date).getTime()
        };
      });

    return dueItems.concat(recordItems).slice(0, 4);
  },

  // ─── 速记：选类型 → 弹窗选日期 → 直接保存 ───
  onQuickRecord(e) {
    const app = getApp();
    if (!app.isLoggedIn()) { this._promptLogin(); return; }
    const { id, name } = e.currentTarget.dataset;
    this.setData({
      quickCatId: id,
      quickCatName: name,
      showQuickTypeModal: true
    });
  },
  closeQuickTypeModal() { this.setData({ showQuickTypeModal: false }); },
  onSelectQuickType(e) {
    const { type, name } = e.currentTarget.dataset;
    this.setData({
      quickType: type,
      quickTypeName: name,
      quickDate: new Date().toISOString().split('T')[0],
      showQuickTypeModal: false,
      showQuickModal: true
    });
  },
  onQuickDateChange(e) { this.setData({ quickDate: e.detail.value }); },
  closeQuickModal() { this.setData({ showQuickModal: false }); },
  stopBubble() {},

  async _loadAnnouncement() {
    try { var a = await clouddb.getActiveAnnouncement(); this.setData({ announcement: a }); } catch (e) {}
  },

  onAnnounceTap() {},

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
    this.setData({ showSortModal: true });
  },

  closeSortModal() {
    this.setData({ showSortModal: false });
  },

  onSelectSort(e) {
    const sortBy = e.currentTarget.dataset.sort;
    this.setData({ sortBy, showSortModal: false });
    this._updateDisplay();
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
        return parseDate(bDate) - parseDate(aDate);
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
    return { imageUrl: '/assets/logo.png', title: '宠物小管家Plus - 记录宝贝的健康日常', path: '/pages/cat-list/cat-list' };
  },
});
