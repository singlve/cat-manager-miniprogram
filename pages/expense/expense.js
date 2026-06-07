// pages/expense/expense.js
const clouddb = require('../../utils/clouddb.js');
const { getExpenseCategories, getExpenseCategory } = require('../../utils/expense-categories.js');
const EXPENSE_CATEGORIES = getExpenseCategories('default');

var MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

const { syncPageTheme } = require('../../utils/themes.js');

Page({
  data: {
    isOnline: true,
    loading: true,
    loadError: false,
    viewMode: 'month',        // 'month' | 'year'
    // ── 年份 ──
    currentYear: 0,
    maxYear: 0,               // 当前年份上限（不允许超过今年）
    // ── 月度 ──
    currentMonth: '',         // '2026-05'
    currentMonthLabel: '',    // '2026年5月'
    expenses: [],             // 当月过滤后的记录
    groupedExpenses: [],
    stats: { total: '0.00', cats: {}, catsByName: {} },
    monthlyInsights: { changeText: '暂无上月数据', changeClass: 'neutral', topCategory: '-', topPet: '-' },
    catFilter: 'all',
    catFilterIdx: 0,
    catFilterOptions: [{ id: 'all', name: '猫咪' }],
    showCatFilterModal: false,
    // ── 年度 ──
    yearExpenses: [],         // 全年的原始记录缓存
    annualStats: { total: 0, avgMonth: 0, months: [], categories: [], cats: [] },
    // ── 通用 ──
    categories: EXPENSE_CATEGORIES,
    showDeleteModal: false,
    deleteTarget: null,
    cats: []
  },

  onLoad() {
    var now = new Date();
    var y = now.getFullYear();
    var m = now.getMonth() + 1;
    this.setData({
      currentYear: y,
      maxYear: y,
      currentMonth: y + '-' + String(m).padStart(2, '0'),
      currentMonthLabel: y + '年' + m + '月'
    });
  },

  onShow() {
    var theme = syncPageTheme(this);
    this.setData({ categories: getExpenseCategories(theme.key) });
    this.setData({ isOnline: getApp().globalData.isOnline });
    this.loadExpenseData();
  },

  // ════════════════════════════════════════════════════
  // 数据加载：月度只拉当前月和上月，年度才拉全年
  // ════════════════════════════════════════════════════
  async loadExpenseData() {
    this.setData({ loading: true, loadError: false });
    try {
      var y = this.data.currentYear;
      var start;
      var end;
      if (this.data.viewMode === 'year') {
        start = y + '-01-01';
        end = y + '-12-31';
      } else {
        var currentParts = this.data.currentMonth.split('-');
        var monthYear = Number(currentParts[0]);
        var month = Number(currentParts[1]);
        var previous = new Date(monthYear, month - 2, 1);
        start = previous.getFullYear() + '-' + String(previous.getMonth() + 1).padStart(2, '0') + '-01';
        end = this.data.currentMonth + '-31';
      }

      var expenses = await clouddb.getExpenses({ dateStart: start, dateEnd: end });
      expenses = expenses || [];

      var cats = [];
      try { cats = await clouddb.getCats(); } catch (e) {}

      this.setData({
        yearExpenses: expenses,
        cats: cats,
        catFilterOptions: [
          { id: 'all', name: '全部宠物' },
          { id: '__shared', name: '公共花销' }
        ].concat(cats.map(function(c) { return { id: c._id, name: c.name }; }))
      });

      // 根据当前视图模式渲染
      if (this.data.viewMode === 'year') {
        this.computeAnnualStats();
      } else {
        this.applyMonthFilter();
      }
    } catch (e) {
      console.error('[expense] loadYearData fail:', e);
      this.setData({ loadError: true });
    }
    this.setData({ loading: false });
  },

  loadYearData() { return this.loadExpenseData(); },

  retryLoad() { this.loadExpenseData(); },

  // ════════════════════════════════════════════════════
  // 月度视图
  // ════════════════════════════════════════════════════
  applyMonthFilter() {
    var cm = this.data.currentMonth;  // '2026-05'
    var expenses = (this.data.yearExpenses || []).filter(function(e) {
      return e.date && e.date.indexOf(cm) === 0;
    });

    var ym = cm.split('-');
    this.setData({
      expenses: expenses,
      currentMonthLabel: ym[0] + '年' + parseInt(ym[1], 10) + '月'
    });

    this.calcStats(expenses);
    this.computeMonthlyInsights(expenses);
    this.computeGroupedExpenses();
  },

  computeMonthlyInsights(expenses) {
    const currentTotal = (expenses || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const parts = this.data.currentMonth.split('-');
    const month = Number(parts[1]);
    const prevKey = month > 1 ? parts[0] + '-' + String(month - 1).padStart(2, '0') : '';
    const prevExpenses = prevKey ? (this.data.yearExpenses || []).filter(item => item.date && item.date.indexOf(prevKey) === 0) : [];
    const prevTotal = prevExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    let changeText = '暂无上月数据';
    let changeClass = 'neutral';
    if (prevTotal > 0) {
      const pct = Math.round(((currentTotal - prevTotal) / prevTotal) * 100);
      changeText = pct === 0 ? '与上月持平' : (pct > 0 ? '较上月增加 ' + pct + '%' : '较上月减少 ' + Math.abs(pct) + '%');
      changeClass = pct > 0 ? 'up' : (pct < 0 ? 'down' : 'neutral');
    }
    const categoryTotals = {};
    const petTotals = {};
    (expenses || []).forEach(item => {
      categoryTotals[item.categoryName || item.category || '其他'] = (categoryTotals[item.categoryName || item.category || '其他'] || 0) + Number(item.amount || 0);
      const petName = item.petName || (item.petId ? (this.data.cats.find(cat => cat._id === item.petId) || {}).name : '公共花销') || '未知宠物';
      petTotals[petName] = (petTotals[petName] || 0) + Number(item.amount || 0);
    });
    const topName = totals => Object.keys(totals).sort((a, b) => totals[b] - totals[a])[0] || '-';
    this.setData({ monthlyInsights: { changeText, changeClass, topCategory: topName(categoryTotals), topPet: topName(petTotals) } });
  },

  calcStats(expenses) {
    var cats = this.data.cats;
    var total = 0;
    var catsTotal = {};
    var catsByName = {};

    (expenses || []).forEach(function(e) {
      var amt = Number(e.amount) || 0;
      total += amt;
      var key = e.petId || '__shared';
      catsTotal[key] = (catsTotal[key] || 0) + amt;
      if (!catsByName[key] && key !== '__shared') {
        var cat = (cats || []).find(function(c) { return c._id === key; });
        catsByName[key] = cat ? cat.name : '未知';
      }
    });
    if (catsTotal['__shared']) catsByName['__shared'] = '公共花销';

    this.setData({
      'stats.total': total.toFixed(2),
      'stats.cats': catsTotal,
      'stats.catsByName': catsByName
    });
  },

  computeGroupedExpenses() {
    var expenses = this.data.expenses || [];
    var catFilter = this.data.catFilter;

    if (catFilter && catFilter !== 'all') {
      expenses = expenses.filter(function(e) {
        if (catFilter === '__shared') return !e.petId;
        return e.petId === catFilter;
      });
    }

    var groups = [];
    var lastDate = '';
    var themeKey = this.data.themeKey;
    expenses.forEach(function(e) {
      if (e.date !== lastDate) {
        lastDate = e.date;
        groups.push({ date: e.date, dayTotal: 0, items: [] });
      }
      var g = groups[groups.length - 1];
      g.dayTotal += (Number(e.amount) || 0);
      var category = getExpenseCategory(e.category, themeKey);
      g.items.push(Object.assign({}, e, { _categoryIconPath: category.iconPath }));
    });

    groups.forEach(function(g) { g.dayTotalStr = g.dayTotal.toFixed(2); });
    this.setData({ groupedExpenses: groups });
  },

  // 月份切换
  onPrevMonth() {
    var parts = this.data.currentMonth.split('-');
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    if (m === 1) { y--; m = 12; } else { m--; }
    var cm = y + '-' + String(m).padStart(2, '0');
    this.setData({ currentMonth: cm, currentYear: y });
    this.loadExpenseData();
  },

  onNextMonth() {
    var parts = this.data.currentMonth.split('-');
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var maxYear = this.data.maxYear;
    var now = new Date();
    var nowM = now.getMonth() + 1;

    // 不能超过当前月份
    if (y === maxYear && m >= nowM) {
      wx.showToast({ title: '已是当前月份', icon: 'none' });
      return;
    }
    if (m === 12) { y++; m = 1; } else { m++; }
    var cm = y + '-' + String(m).padStart(2, '0');
    this.setData({ currentMonth: cm, currentYear: y });
    this.loadExpenseData();
  },

  // 年份切换
  onPrevYear() {
    var y = this.data.currentYear - 1;
    if (y < 2020) return;
    this.setData({ currentYear: y });
    this.loadExpenseData();
  },

  onNextYear() {
    var y = this.data.currentYear + 1;
    if (y > this.data.maxYear) {
      wx.showToast({ title: '已是当前年份', icon: 'none' });
      return;
    }
    this.setData({ currentYear: y });
    this.loadExpenseData();
  },

  // 视图切换
  onSwitchView(e) {
    var mode = e.currentTarget.dataset.mode;
    if (mode === this.data.viewMode) return;
    this.setData({ viewMode: mode });
    this.loadExpenseData();
  },

  // ════════════════════════════════════════════════════
  // 年度汇总
  // ════════════════════════════════════════════════════
  computeAnnualStats() {
    var yearExpenses = this.data.yearExpenses || [];
    var cats = this.data.cats;

    // 按月汇总
    var monthTotals = {};
    for (var i = 1; i <= 12; i++) monthTotals[i] = 0;
    // 按分类汇总
    var catTotals = {};
    (this.data.categories || EXPENSE_CATEGORIES).forEach(function(c) {
      catTotals[c.key] = { iconPath: c.iconPath, name: c.name, color: c.color, total: 0 };
    });
    // 按宠物汇总
    var petTotals = {};

    var grandTotal = 0;

    yearExpenses.forEach(function(e) {
      var amt = Number(e.amount) || 0;
      grandTotal += amt;

      // 月份
      if (e.date) {
        var m = parseInt(e.date.split('-')[1], 10);
        monthTotals[m] = (monthTotals[m] || 0) + amt;
      }

      // 分类
      var catKey = e.category || 'other';
      if (catTotals[catKey]) catTotals[catKey].total += amt;

      // 宠物
      var petKey = e.petId || '__shared';
      petTotals[petKey] = (petTotals[petKey] || 0) + amt;
    });

    // 月度柱状图数据
    var maxAmount = Math.max.apply(null, Object.values(monthTotals)) || 0;
    var maxMonth = 0;
    for (var mi = 1; mi <= 12; mi++) {
      if (monthTotals[mi] === maxAmount) { maxMonth = mi; break; }
    }
    var barMax = 160;  // 最高柱子 rpx
    var months = [];
    for (var mth = 1; mth <= 12; mth++) {
      var mt = monthTotals[mth] || 0;
      var h = mt > 0 ? Math.max(8, (mt / maxAmount) * barMax) : 0;
      months.push({
        month: mth,
        label: MONTH_NAMES[mth - 1],
        total: mt.toFixed(2),
        height: Math.round(h * 100) / 100,
        isMax: mt > 0 && mt === maxAmount
      });
    }

    // 分类列表（按金额降序）
    var categories = Object.values(catTotals);
    categories.sort(function(a, b) { return b.total - a.total; });
    categories.forEach(function(c) {
      c.totalStr = c.total.toFixed(2);
      c.pct = grandTotal > 0 ? Math.round((c.total / grandTotal) * 100) : 0;
    });

    // 宠物排行
    var pets = Object.keys(petTotals).map(function(k) {
      var name = k === '__shared' ? '公共花销' : '未知宠物';
      if (k !== '__shared') {
        var cat = (cats || []).find(function(c) { return c._id === k; });
        if (cat) {
          name = cat.name;
        }
      }
      return { id: k, name: name, total: petTotals[k], pct: grandTotal > 0 ? Math.round((petTotals[k] / grandTotal) * 100) : 0 };
    });
    pets.sort(function(a, b) { return b.total - a.total; });
    pets.forEach(function(p) { p.totalStr = p.total.toFixed(2); });

    this.setData({
      annualStats: {
        total: grandTotal.toFixed(2),
        avgMonth: (grandTotal / 12).toFixed(2),
        maxMonthLabel: '¥' + maxAmount.toFixed(2),
        months: months,
        categories: categories,
        cats: pets
      }
    });
  },

  // 点击年度柱状图跳转到对应月份
  onTapMonth(e) {
    var month = Number(e.currentTarget.dataset.month);
    var cm = this.data.currentYear + '-' + String(month).padStart(2, '0');
    this.setData({ viewMode: 'month', currentMonth: cm });
    this.loadExpenseData();
  },

  // ════════════════════════════════════════════════════
  // 筛选 & 交互
  // ════════════════════════════════════════════════════
  openCatFilterModal() {
    if ((this.data.catFilterOptions || []).length <= 1) return;
    this.setData({ showCatFilterModal: true });
  },

  closeCatFilterModal() {
    this.setData({ showCatFilterModal: false });
  },

  selectCatFilter(e) {
    var idx = Number(e.currentTarget.dataset.idx);
    if (isNaN(idx)) idx = 0;
    var opt = this.data.catFilterOptions[idx];
    this.setData({
      catFilter: opt ? opt.id : 'all',
      catFilterIdx: idx,
      showCatFilterModal: false
    });
    this.computeGroupedExpenses();
  },

  onCatFilterChange(e) {
    var idx = Number(e.detail.value);
    var opt = this.data.catFilterOptions[idx];
    this.setData({ catFilter: opt ? opt.id : 'all', catFilterIdx: idx });
    this.computeGroupedExpenses();
  },

  onLongPress(e) {
    this.setData({ showDeleteModal: true, deleteTarget: e.currentTarget.dataset.id });
  },

  editExpense(e) {
    wx.navigateTo({ url: '/pages/expense-add/expense-add?id=' + e.currentTarget.dataset.id });
  },

  closeDeleteModal() {
    this.setData({ showDeleteModal: false, deleteTarget: null });
  },

  stopBubble() {},

  async confirmDelete() {
    var id = this.data.deleteTarget;
    if (!id) return;
    try {
      await clouddb.deleteExpense(id);
      wx.showToast({ title: '已删除', icon: 'success' });
      this.setData({ showDeleteModal: false, deleteTarget: null });
      this.loadExpenseData();
    } catch (e) {
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/expense-add/expense-add' });
  },

  async onPullDownRefresh() {
    try { await this.loadExpenseData(); } finally { wx.stopPullDownRefresh(); }
  },

  onShareAppMessage() {
    return { imageUrl: '/assets/logo.png', title: '把宠物的日常花销记录得更清楚', path: '/pages/expense/expense' };
  }
});
