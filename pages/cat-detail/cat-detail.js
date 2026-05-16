// pages/cat-detail/cat-detail.js
// 宠物详情页：快速记录 + 健康时间轴
const clouddb = require('../../utils/clouddb.js');
const { calcAgo } = require('../../utils/util.js');

// ─── Demo 数据 ───
const DEMO_CATS = {
  'demo_1': { _id: 'demo_1', name: '橘座', breed: '中华田园猫', gender: 'male', birthday: '2023-03-15', adoptedDate: '2023-03-15', note: '能吃能睡，体重管理中', avatar: '', _displayAvatar: '', status: 'with_me' },
  'demo_2': { _id: 'demo_2', name: '雪球', breed: '布偶猫', gender: 'female', birthday: '2024-01-20', adoptedDate: '2024-01-20', note: '', avatar: '', _displayAvatar: '', status: 'with_me' }
};

const DEMO_RECORDS = {
  'demo_1': [
    { _id: 'demo_r1', catId: 'demo_1', type: 'deworm',   date: '2026-04-10', note: '体内驱虫',        _ago: '13天前' },
    { _id: 'demo_r2', catId: 'demo_1', type: 'checkup',  date: '2026-03-20', note: '年度体检正常',    _ago: '34天前' },
    { _id: 'demo_r3', catId: 'demo_1', type: 'bath',     date: '2026-03-01', note: '',                _ago: '53天前' }
  ],
  'demo_2': [
    { _id: 'demo_r4', catId: 'demo_2', type: 'vaccine',  date: '2026-04-15', note: '猫三联第三针',    _ago: '8天前' },
    { _id: 'demo_r5', catId: 'demo_2', type: 'bath',     date: '2026-03-28', note: '',                _ago: '26天前' }
  ]
};

Page({
  data: {
    catId: '', cat: {}, records: [], recentRecords: [], healthSummary: [], nowDate: '', isDemo: false,
    weightRecords: [], latestWeight: null,
    showWeightModal: false, deleting: false,
    weightDate: new Date().toISOString().split('T')[0],
    weightTime: '',
    weightValue: '', weightNote: '',
    showSharePreview: false, shareImagePath: ''
  },

  onLoad(options) {
    if (!options.id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 1000);
      return;
    }
    const isDemo = options.id && options.id.startsWith('demo_');
    this.setData({ catId: options.id, nowDate: new Date().toISOString().split('T')[0], isDemo });
    if (isDemo) {
      var demoRecords = DEMO_RECORDS[options.id] || [];
      this.setData({ cat: DEMO_CATS[options.id] || {}, records: demoRecords, healthSummary: _buildHealthSummary(demoRecords), weightRecords: [], latestWeight: null });
    } else {
      this.loadCat();
      this.loadRecords();
      this.loadWeightRecords();
    }
  },

  onShow() {
    if (this.data.catId && !this.data.isDemo) { this.loadCat(); this.loadRecords(); this.loadWeightRecords(); }
  },

  async loadCat() {
    try {
      const cat = await clouddb.getCatById(this.data.catId);
      if (cat) {
        if (cat.avatar && cat.avatar.startsWith('cloud://')) {
          cat._displayAvatar = await clouddb.getAvatarUrl(cat.avatar);
        } else {
          cat._displayAvatar = cat.avatar;
        }
        this.setData({ cat });
      }
    } catch (e) {
      console.error('[cat-detail] loadCat error:', e);
    }
  },

  async loadRecords() {
    try {
      const records = await clouddb.getRecords({ catId: this.data.catId });
      records.sort((a, b) => new Date(b.date) - new Date(a.date));
      const withAgo = records.map(function(r) { return Object.assign({}, r, { _ago: calcAgo(r.date) }); });
      this.setData({ records: withAgo, recentRecords: withAgo.slice(0, 4), healthSummary: _buildHealthSummary(records) });
    } catch (e) {
      console.error('[cat-detail] loadRecords error:', e);
    }
  },

  // ─── 体重记录 ───
  async loadWeightRecords() {
    try {
      const records = await clouddb.getWeightRecords({ catId: this.data.catId });
      records.sort((a, b) => new Date(b.date) - new Date(a.date));
      const latestWeight = records.length > 0 ? records[0].weight : null;
      this.setData({ weightRecords: records, latestWeight });
    } catch (e) {
      console.error('[cat-detail] loadWeightRecords error:', e);
    }
  },

  openWeightModal() {
    const app = getApp();
    if (!app.isLoggedIn()) { this._promptLogin(); return; }
    if (this.data.cat.status === 'passed_away') {
      wx.showToast({ title: '已离世的宠物不支持记录', icon: 'none' }); return;
    }
    const now = new Date();
    this.setData({
      showWeightModal: true,
      weightDate: now.toISOString().split('T')[0],
      weightTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      weightValue: '',
      weightNote: ''
    });
  },

  closeWeightModal() {
    this.setData({ showWeightModal: false });
  },

  onWeightDateChange(e)  { this.setData({ weightDate: e.detail.value }); },
  onWeightTimeChange(e)  { this.setData({ weightTime: e.detail.value }); },
  onWeightInput(e)       { this.setData({ weightValue: e.detail.value }); },
  onWeightNoteInput(e)   { this.setData({ weightNote: e.detail.value }); },

  async saveWeightRecord() {
    const { weightDate, weightTime, weightValue, weightNote } = this.data;
    const w = parseFloat(weightValue);
    if (!weightDate) { wx.showToast({ title: '请选择日期', icon: 'none' }); return; }
    if (isNaN(w) || w <= 0) { wx.showToast({ title: '请输入有效体重(kg)', icon: 'none' }); return; }
    if (w > 60) { wx.showToast({ title: '体重数值过大，请检查', icon: 'none' }); return; }

    // 日期不能早于宠物生日（按日期部分比较即可）
    if (this.data.cat.birthday && weightDate < this.data.cat.birthday) {
      wx.showToast({ title: '记录日期不能早于宠物生日', icon: 'none' }); return;
    }

    const fullDate = `${weightDate} ${weightTime || '00:00'}:00`;

    wx.showLoading({ title: '保存中...' });
    try {
      await clouddb.addWeightRecord({
        catId: this.data.catId,
        date: fullDate,
        weight: w,
        note: weightNote || ''
      });
      this.setData({ showWeightModal: false });
      this.loadWeightRecords();
      wx.showToast({ title: '体重已记录', icon: 'success' });
    } catch (e) {
      console.error('[cat-detail] saveWeightRecord error:', e);
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  goWeightRecords() {
    const app = getApp();
    if (!app.isLoggedIn()) { this._promptLogin(); return; }
    wx.navigateTo({ url: '/pages/weight-records/weight-records?catId=' + this.data.catId });
  },

  // 统一登录提示
  _promptLogin() {
    wx.showModal({
      title: '需要登录',
      content: '该操作需要登录后才能完成，是否现在登录？',
      confirmText: '去登录',
      cancelText: '稍后再说',
      success: res => { if (res.confirm) wx.navigateTo({ url: '/pages/login/login' }); }
    });
  },

  // 快速记录：demo 猫或未登录时提示登录
  async onQuickRecord(e) {
    const app = getApp();
    if (!app.isLoggedIn()) { this._promptLogin(); return; }
    if (this.data.cat.status === 'passed_away') {
      wx.showToast({ title: '已离世的宠物不支持记录', icon: 'none' }); return;
    }

    const type = e.currentTarget.dataset.type;
    const date = e.detail.value;
    if (!type || !date) return;

    if (this.data.cat.birthday && date < this.data.cat.birthday) {
      wx.showToast({ title: '记录日期不能早于宠物生日', icon: 'none' });
      return;
    }

    const newRecord = {
      _id: 'rec_' + Date.now(),
      catId: this.data.catId,
      type: type,
      date: date,
      note: ''
    };

    try {
      await clouddb.addRecord(newRecord);
      this.loadRecords();
      const typeLabel = { bath: '洗澡', deworm: '驱虫', vaccine: '免疫', checkup: '体检' }[type];
      wx.showToast({ title: typeLabel + '已记录', icon: 'success' });
    } catch (e) {
      console.error('[cat-detail] onQuickRecord error:', e);
      wx.showToast({ title: '记录失败，请重试', icon: 'none' });
    }
  },

  goHealthRecords() {
    const app = getApp();
    if (!app.isLoggedIn()) { this._promptLogin(); return; }
    wx.navigateTo({ url: '/pages/health-records/health-records?catId=' + this.data.catId });
  },

  goEdit() {
    const app = getApp();
    if (!app.isLoggedIn()) { this._promptLogin(); return; }
    wx.navigateTo({ url: '/pages/cat-edit/cat-edit?id=' + this.data.catId });
  },

  deleteCat() {
    if (this.data.deleting) return;
    const app = getApp();
    if (!app.isLoggedIn()) { this._promptLogin(); return; }
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这只宠物吗？相关记录也会一并删除',
      success: async res => {
        if (!res.confirm) return;
        this.setData({ deleting: true });
        wx.showLoading({ title: '删除中...' });
        try {
          await clouddb.deleteCat(this.data.catId);
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 1000);
        } catch (e) {
          console.error('[cat-detail] deleteCat error:', e);
          wx.showToast({ title: '删除失败，请重试', icon: 'none' });
        } finally {
          wx.hideLoading();
          this.setData({ deleting: false });
        }
      }
    });
  },

  // ─── 分享卡 ───
  async openShareCard() {
    this.setData({ showSharePreview: true });
    // 后台生成分享图
    try {
      var path = await this._drawShareCard();
      this.setData({ shareImagePath: path });
    } catch (e) { console.error('[cat-detail] gen share img fail:', e); }
  },

  closeSharePreview() { this.setData({ showSharePreview: false }); },

  async saveShareCard() {
    var path = this.data.shareImagePath;
    if (!path) {
      path = await this._drawShareCard();
      this.setData({ shareImagePath: path });
    }
    if (!path) { wx.showToast({ title: '生成失败', icon: 'none' }); return; }
    try {
      await wx.saveImageToPhotosAlbum({ filePath: path });
      this.setData({ showSharePreview: false });
      wx.showToast({ title: '已保存到相册', icon: 'success' });
    } catch (e) {
      this.setData({ showSharePreview: false });
      if (e.errMsg && e.errMsg.indexOf('auth deny') !== -1) {
        wx.showModal({ title: '需要授权', content: '请在设置中允许保存到相册', showCancel: false });
      } else { wx.showToast({ title: '保存失败', icon: 'none' }); }
    }
  },

  async _drawShareCard() {
    var cat = this.data.cat;
    var healthSummary = this.data.healthSummary || [];
    var weight = this.data.latestWeight;
    var W = 375, H = 550, S = 2;

    var query = wx.createSelectorQuery();
    var node = await new Promise(function(r) {
      query.select('#shareCanvas').fields({ node: true }).exec(function(res) { r(res[0]); });
    });
    if (!node) return '';

    var canvas = node.node;
    var ctx = canvas.getContext('2d');
    canvas.width = W * S;
    canvas.height = H * S;
    ctx.scale(S, S);

    // 背景
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#4A90D9';
    ctx.fillRect(0, 0, W, 120);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('宠物健康档案', W / 2, 44);

    ctx.beginPath();
    ctx.arc(W / 2, 80, 32, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.fillStyle = '#4A90D9';
    ctx.font = 'bold 28px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText((cat.name || '?').slice(0, 1), W / 2, 80);
    ctx.textBaseline = 'alphabetic';

    var y = 140;
    ctx.fillStyle = '#222';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(cat.name || '未命名', W / 2, y);
    ctx.fillStyle = '#888';
    ctx.font = '16px sans-serif';
    ctx.fillText((cat.breed || '') + (cat.gender ? ' · ' + (cat.gender === 'male' ? '弟弟' : '妹妹') : ''), W / 2, y + 20);

    y += 40;
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(W - 30, y);
    ctx.stroke();

    y += 20;
    var items = [];
    if (cat.birthday) items.push({ l: '生日', v: cat.birthday });
    if (cat.adoptedDate) items.push({ l: '领养', v: cat.adoptedDate });
    if (weight != null) items.push({ l: '体重', v: weight + ' kg' });
    if (healthSummary.length) items.push({ l: '健康', v: healthSummary.length + '类' });
    ctx.textAlign = 'left';
    for (var i = 0; i < items.length; i++) {
      var cx = 30 + (i % 2) * 157;
      var cy = y + Math.floor(i / 2) * 48;
      ctx.fillStyle = '#999';
      ctx.font = '14px sans-serif';
      ctx.fillText(items[i].l, cx, cy);
      ctx.fillStyle = '#333';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(items[i].v, cx, cy + 20);
    }

    y += Math.ceil(items.length / 2) * 48 + 20;
    if (healthSummary.length) {
      ctx.fillStyle = '#4A90D9';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('健康记录', 30, y);
      y += 20;
      ctx.fillStyle = '#555';
      ctx.font = '15px sans-serif';
      for (var j = 0; j < healthSummary.length; j++) {
        ctx.fillText(healthSummary[j].label + '    ' + healthSummary[j].date, 30, y);
        y += 22;
      }
    }

    y = Math.max(y + 24, H - 22);
    ctx.fillStyle = '#bbb';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('宠物健康管家', W / 2, y);

    return await new Promise(function(r) {
      wx.canvasToTempFilePath({
        canvas: canvas, x: 0, y: 0, width: W * S, height: H * S,
        destWidth: W * S, destHeight: H * S, fileType: 'jpg', quality: 0.9,
        success: function(res) { r(res.tempFilePath); },
        fail: function() { r(''); }
      });
    });
  },

  onShareAppMessage() {
    const name = this.data.cat?.name || '宝贝';
    return { imageUrl: '/assets/logo.png', title: `看看${name}的档案`, path: `/pages/cat-detail/cat-detail?catId=${this.data.cat?._id || ''}` };
  }
});

function _buildHealthSummary(records) {
  var map = { bath: '🛁洗澡', deworm: '💊驱虫', vaccine: '💉免疫', checkup: '🩺体检' };
  var latest = {};
  (records || []).forEach(function(r) {
    if (!latest[r.type] || r.date > latest[r.type]) latest[r.type] = r.date;
  });
  var result = Object.keys(latest).map(function(k) { return { label: map[k] || k, date: latest[k] }; });
  result.sort(function(a, b) { return b.date.localeCompare(a.date); });
  return result;
}
