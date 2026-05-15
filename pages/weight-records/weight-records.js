// pages/weight-records/weight-records.js
// 体重记录列表页：按宠物筛选，查看每条体重记录，支持增删改
const clouddb = require('../../utils/clouddb.js');
const { datePart, calcAgo, nowTimeStr, datetime, todayStr } = require('../../utils/util.js');

Page({
  data: {
    isOnline: true,
    catId: '',           // 从宠物详情页进入时传入，用于默认筛选
    cats: [],            // 所有宠物列表
    catOptions: [],      // 筛选标签
    currentCat: 'all',  // 当前筛选的宠物 key
    currentPeriod: 'all', // 时间段筛选
    periodOptions: [
      { key: 'all',    label: '全部' },
      { key: '7d',     label: '近7天' },
      { key: '30d',    label: '近30天' },
      { key: '90d',    label: '近3个月' },
      { key: '180d',   label: '近半年' },
      { key: '365d',   label: '近1年' },
      { key: 'custom', label: '自定义' }
    ],
    customStartDate: '',  // 自定义起始日期
    customEndDate: '',    // 自定义结束日期
    // 分页
    recordsPage: 1,
    recordsPageSize: 20,
    hasMoreRecords: false,
    recordsLoading: false,
    records: [],        // 所有体重记录（带宠物名）
    filteredRecords: [], // 筛选后记录
    summaryLatest: '',    // 最新体重
    summaryCount: 0,      // 记录次数
    summaryChangeText: '', // 累计变化文字
    summaryChangeClass: '', // up/down 样式类
    isCurrentCatPassed: false, // 当前选中宠物是否已经离世
    showAddModal: false,
    addCatId: '',
    addDate: todayStr(),
    addTime: nowTimeStr(),
    addWeight: '',
    addNote: '',
    showEditModal: false,
    editId: '',
    editDate: todayStr(),
    editTime: nowTimeStr(),
    editWeight: '',
    editNote: ''
  },

  async onLoad(options) {
    this.setData({ catId: options.catId || '' });
    await this.loadCats();
    if (options.catId) {
      this.setData({ currentCat: options.catId });
    }
    await this.loadRecords();
  },

  onShow() {
    this.setData({ isOnline: getApp().globalData.isOnline });
    this.loadCats().then(() => this.loadRecords());
  },

  // 加载所有宠物
  async loadCats() {
    const cats = await clouddb.getAllCats();
    const catOptions = [{ key: 'all', label: '全部宠物' }];
    cats.forEach(c => catOptions.push({ key: c._id, label: c.name }));
    this.setData({ cats, catOptions });
  },

  // 加载体重记录（resetPage=true 从头加载，false 加载更多）
  async loadRecords(resetPage) {
    if (resetPage !== false) {
      this.setData({ recordsPage: 1, hasMoreRecords: true, records: [], filteredRecords: [] });
    }
    if (this.data.recordsLoading) return;
    this.setData({ recordsLoading: true });

    try {
      const page = this.data.recordsPage;
      const pageSize = this.data.recordsPageSize;
      const skip = (page - 1) * pageSize;

      const newRecords = await clouddb.getWeightRecords({}, { limit: pageSize, skip: skip });
      newRecords.sort((a, b) => new Date(b.date) - new Date(a.date));

      const catsMap = {};
      this.data.cats.forEach(c => { catsMap[c._id] = c; });

      const withCat = newRecords.map(function(r) { return Object.assign({}, r, {
        _catName: catsMap[r.catId] ? catsMap[r.catId].name : '未知宠物',
        _catAvatar: catsMap[r.catId] ? (catsMap[r.catId]._displayAvatar || catsMap[r.catId].avatar || '') : '',
        _ago: calcAgo(r.date)
      }); });

      const allRecords = page === 1 ? withCat : [].concat(this.data.records, withCat);
      const hasMore = newRecords.length >= pageSize;

      this.setData({
        records: allRecords,
        recordsPage: page + 1,
        hasMoreRecords: hasMore,
        recordsLoading: false,
      }, () => { this.applyFilter(); });
    } catch (e) {
      console.error('[weight-records] loadRecords error:', e);
      this.setData({ recordsLoading: false });
    }
  },

  // 触底加载更多
  onReachBottom() {
    if (this.data.hasMoreRecords && !this.data.recordsLoading) {
      this.loadRecords(false);
    }
  },

  // 切换宠物筛选
  setCatFilter(e) {
    this.setData({ currentCat: e.currentTarget.dataset.cat, currentPeriod: 'all' });
    this.applyFilter();
  },

  // 切换时间段筛选
  setPeriodFilter(e) {
    const period = e.currentTarget.dataset.period;
    const update = { currentPeriod: period };
    if (period === 'custom') {
      // 默认自定义范围：最近30天
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      update.customEndDate = todayStr();
      update.customStartDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    }
    this.setData(update);
    this.applyFilter();
  },

  applyFilter() {
    const { records, currentCat, currentPeriod, cats } = this.data;
    let filtered = records;

    // 判断当前选中宠物是否已离世了
    let isCurrentCatPassed = false;
    if (currentCat !== 'all') {
      const cat = cats.find(c => c._id === currentCat);
      isCurrentCatPassed = cat && cat.status === 'passed_away';
    }

    // 宠物筛选
    if (currentCat !== 'all') {
      filtered = filtered.filter(r => r.catId === currentCat);
    }

    // 时间段筛选
    if (currentPeriod !== 'all') {
      if (currentPeriod === 'custom') {
        const { customStartDate, customEndDate } = this.data;
        if (customStartDate) filtered = filtered.filter(r => datePart(r.date) >= customStartDate);
        if (customEndDate) filtered = filtered.filter(r => datePart(r.date) <= customEndDate);
      } else {
        const days = parseInt(currentPeriod);
        const cutoff = new Date();
        cutoff.setHours(0, 0, 0, 0);
        cutoff.setDate(cutoff.getDate() - days);
        const cutoffStr = cutoff.toISOString().split('T')[0];
        filtered = filtered.filter(r => datePart(r.date) >= cutoffStr);
      }
    }

    // 计算汇总数据
    let summaryLatest = '';
    let summaryCount = filtered.length;
    let summaryChangeText = '';
    let summaryChangeClass = '';
    if (filtered.length >= 2) {
      // 汇总应基于筛选后的全部数据，而非只取首尾
      const sortedByDate = filtered.slice().sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
      summaryLatest = sortedByDate[sortedByDate.length - 1].weight;
      const change = sortedByDate[sortedByDate.length - 1].weight - sortedByDate[0].weight;
      summaryChangeClass = change > 0 ? 'up' : 'down';
      summaryChangeText = (change > 0 ? '+' : '') + change.toFixed(2) + ' kg';
    } else if (filtered.length === 1) {
      summaryLatest = filtered[0].weight;
    }
    this.setData({ filteredRecords: filtered, summaryLatest, summaryCount, summaryChangeText, summaryChangeClass, isCurrentCatPassed },
      () => { wx.nextTick(() => { this.drawChart(); }); }
    );
  },

  // ─── 体重趋势折线图（Canvas 2D）───
  drawChart() {
    const { filteredRecords, currentCat } = this.data;
    if (currentCat === 'all' || filteredRecords.length < 2) return;

    const query = wx.createSelectorQuery();
    query.select('#weightChart')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0]) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio;
        const W = res[0].width;
        const H = res[0].height;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.scale(dpr, dpr);

        // 日期升序排列用于绘图
        const sorted = filteredRecords.slice().sort(function(a, b) { return new Date(a.date) - new Date(b.date); });

        // 布局
        const pad = { top: 28, right: 16, bottom: 46, left: 52 };
        const cw = W - pad.left - pad.right;
        const ch = H - pad.top - pad.bottom;

        // Y 轴范围
        const ws = sorted.map(r => r.weight);
        const minW = Math.min.apply(null, ws);
        const maxW = Math.max.apply(null, ws);
        const margin = Math.max((maxW - minW) * 0.4, 0.3);
        const yMin = Math.max(0, minW - margin);
        const yMax = maxW + margin;

        const xAt = (i) => pad.left + (i / (sorted.length - 1)) * cw;
        const yAt = (w) => pad.top + ch - ((w - yMin) / (yMax - yMin)) * ch;

        ctx.clearRect(0, 0, W, H);

        // ── 网格线 + Y 轴标注 ──
        const yTicks = 5;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = '12px -apple-system, sans-serif';
        ctx.fillStyle = '#999';
        for (let i = 0; i <= yTicks; i++) {
          const v = yMin + (i / yTicks) * (yMax - yMin);
          const y = yAt(v);
          ctx.beginPath();
          ctx.strokeStyle = '#f0f0f0';
          ctx.lineWidth = 1;
          ctx.moveTo(pad.left, y);
          ctx.lineTo(W - pad.right, y);
          ctx.stroke();
          ctx.fillText(v.toFixed(2), pad.left - 8, y);
        }

        // ── X 轴日期标注 ──
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = '10px -apple-system, sans-serif';
        const maxLbl = 7;
        const step = Math.max(1, Math.ceil(sorted.length / maxLbl));
        for (let i = 0; i < sorted.length; i += step) {
          const p = sorted[i].date.split('-');
          ctx.fillText(`${parseInt(p[1])}/${parseInt(p[2])}`, xAt(i), pad.top + ch + 8);
        }
        // 强制显示最后一个日期点
        if ((sorted.length - 1) % step !== 0) {
          const p = sorted[sorted.length - 1].date.split('-');
          ctx.fillText(`${parseInt(p[1])}/${parseInt(p[2])}`, xAt(sorted.length - 1), pad.top + ch + 8);
        }

        // ── 面积填充 ──
        ctx.beginPath();
        ctx.moveTo(xAt(0), yAt(yMin));
        for (let i = 0; i < sorted.length; i++) ctx.lineTo(xAt(i), yAt(sorted[i].weight));
        ctx.lineTo(xAt(sorted.length - 1), yAt(yMin));
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
        grad.addColorStop(0, 'rgba(74,144,217,0.28)');
        grad.addColorStop(1, 'rgba(74,144,217,0.03)');
        ctx.fillStyle = grad;
        ctx.fill();

        // ── 折线 ──
        ctx.beginPath();
        ctx.strokeStyle = '#4A90D9';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        for (let i = 0; i < sorted.length; i++) {
          i === 0 ? ctx.moveTo(xAt(i), yAt(sorted[i].weight))
                   : ctx.lineTo(xAt(i), yAt(sorted[i].weight));
        }
        ctx.stroke();

        // ── 数据点 ──
        for (let i = 0; i < sorted.length; i++) {
          const x = xAt(i), y = yAt(sorted[i].weight);
          ctx.beginPath(); ctx.fillStyle = '#fff'; ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.fillStyle = '#4A90D9'; ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        }
      });
  },

  // ─── 打开新增弹窗 ───
  openAddModal(e) {
    const catId = e ? e.currentTarget.dataset.catid : '';
    if (!catId) { wx.showToast({ title: '请先选择宠物', icon: 'none' }); return; }
    this.setData({
      showAddModal: true,
      addCatId: catId,
      addDate: todayStr(),
      addTime: nowTimeStr(),
      addWeight: '',
      addNote: '',
      showEditModal: false
    });
  },

  // ─── 打开编辑弹窗 ───
  openEdit(e) {
    const record = this.data.records.find(r => r._id === e.currentTarget.dataset.id);
    if (!record) return;
    this.setData({
      showEditModal: true,
      showAddModal: false,
      editId: record._id,
      editDate: datePart(record.date),
      editTime: (record.date || '').slice(11, 16) || '00:00',
      editWeight: String(record.weight),
      editNote: record.note || ''
    });
  },

  onAddDateChange(e)  { this.setData({ addDate: e.detail.value }); },
  onAddTimeChange(e)  { this.setData({ addTime: e.detail.value }); },
  onAddWeightInput(e)  { this.setData({ addWeight: e.detail.value }); },
  onAddNoteInput(e)   { this.setData({ addNote: e.detail.value }); },

  onEditDateChange(e) { this.setData({ editDate: e.detail.value }); },
  onEditTimeChange(e) { this.setData({ editTime: e.detail.value }); },
  onEditWeightInput(e) { this.setData({ editWeight: e.detail.value }); },
  onEditNoteInput(e)  { this.setData({ editNote: e.detail.value }); },

  // 自定义时间范围
  onCustomStartChange(e) { this.setData({ customStartDate: e.detail.value }); this.applyFilter(); },
  onCustomEndChange(e)   { this.setData({ customEndDate: e.detail.value });   this.applyFilter(); },

  // 快捷录入：使用当前筛选中的宠物（而非URL传入的 catId）
  openQuickAdd() {
    if (this.data.isCurrentCatPassed) {
      wx.showToast({ title: '已离世的宠物不支持记录', icon: 'none' }); return;
    }
    const targetCatId = this.data.currentCat;
    if (!targetCatId || targetCatId === 'all') {
      wx.showToast({ title: '请先选择宠物', icon: 'none' }); return;
    }
    this.setData({
      showAddModal: true,
      addCatId: targetCatId,
      addDate: todayStr(),
      addTime: nowTimeStr(),
      addWeight: '',
      addNote: ''
    });
  },

  // 新增保存
  async saveAdd() {
    const { addCatId, addDate, addTime, addWeight, addNote, isCurrentCatPassed } = this.data;
    if (isCurrentCatPassed) {
      wx.showToast({ title: '已离世的宠物不支持记录', icon: 'none' }); return;
    }
    if (!addCatId) { wx.showToast({ title: '请选择宠物', icon: 'none' }); return; }
    if (!addDate)  { wx.showToast({ title: '请选择日期',  icon: 'none' }); return; }
    const w = parseFloat(addWeight);
    if (isNaN(w) || w <= 0) { wx.showToast({ title: '请输入有效体重(kg)', icon: 'none' }); return; }
    if (w > 30) { wx.showToast({ title: '体重数值过大，请检查', icon: 'none' }); return; }

    await clouddb.addWeightRecord({ catId: addCatId, date: datetime(addDate, addTime), weight: w, note: addNote || '' });
    this.setData({ showAddModal: false });
    this.loadRecords();
    wx.showToast({ title: '记录成功', icon: 'success' });
  },

  // 编辑保存
  async saveEdit() {
    const { editId, editDate, editTime, editWeight, editNote } = this.data;
    if (!editDate) { wx.showToast({ title: '请选择日期', icon: 'none' }); return; }
    const w = parseFloat(editWeight);
    if (isNaN(w) || w <= 0) { wx.showToast({ title: '请输入有效体重(kg)', icon: 'none' }); return; }
    if (w > 30) { wx.showToast({ title: '体重数值过大，请检查', icon: 'none' }); return; }

    await clouddb.updateWeightRecord(editId, { date: datetime(editDate, editTime), weight: w, note: editNote || '' });
    this.setData({ showEditModal: false, showAddModal: false });
    this.loadRecords();
    wx.showToast({ title: '修改成功', icon: 'success' });
  },

  cancelModal() {
    this.setData({ showEditModal: false, showAddModal: false });
  },

  async deleteRecord(e) {
    const confirmed = await new Promise(r =>
      wx.showModal({ title: '确认删除', content: '确定要删除这条记录吗？', success: res => r(res.confirm) })
    );
    if (!confirmed) return;
    await clouddb.deleteWeightRecord(e.currentTarget.dataset.id);
    this.loadRecords();
    wx.showToast({ title: '已删除', icon: 'success' });
  },

  async onPullDownRefresh() {
    try { await this.loadCats(); await this.loadRecords(true); } finally { wx.stopPullDownRefresh(); }
  },

  onShareAppMessage() {
    const name = this.data.catName || '宝贝';
    return { title: name + ' - 猫咪健康管家 🐱', path: '/pages/weight-records/weight-records?catId=' + (this.data.catId || '') };
  },
});