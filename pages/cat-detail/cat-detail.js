// pages/cat-detail/cat-detail.js
// 宠物详情页：快速记录 + 健康时间轴
const clouddb = require('../../utils/clouddb.js');
const { calcAgeDetail, calcAgo, calcDaysBetween, parseDate } = require('../../utils/util.js');

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
    catId: '', cat: {}, records: [], recentRecords: [], healthSummary: [], careOverview: [], nowDate: '', isDemo: false,
    weightRecords: [], latestWeight: null,
    showWeightModal: false, deleting: false,
    weightDate: new Date().toISOString().split('T')[0],
    weightTime: '',
    weightValue: '', weightNote: '',
    showSharePreview: false, shareImagePath: '', generatingShare: false
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
      this.setData({
        cat: DEMO_CATS[options.id] || {},
        records: demoRecords,
        healthSummary: _buildHealthSummary(demoRecords),
        careOverview: _buildCareOverview(demoRecords),
        weightRecords: [],
        latestWeight: null
      });
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
      records.sort((a, b) => parseDate(b.date) - parseDate(a.date));
      const withAgo = records.map(function(r) { return Object.assign({}, r, { _ago: calcAgo(r.date) }); });
      this.setData({
        records: withAgo,
        recentRecords: withAgo.slice(0, 4),
        healthSummary: _buildHealthSummary(records),
        careOverview: _buildCareOverview(records)
      });
    } catch (e) {
      console.error('[cat-detail] loadRecords error:', e);
    }
  },

  // ─── 体重记录 ───
  async loadWeightRecords() {
    try {
      const records = await clouddb.getWeightRecords({ catId: this.data.catId });
      records.sort((a, b) => parseDate(b.date) - parseDate(a.date));
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

  goCareReminder(e) {
    const app = getApp();
    if (!app.isLoggedIn()) { this._promptLogin(); return; }
    if (this.data.cat.status === 'passed_away') {
      wx.showToast({ title: '已离世的宠物不支持添加提醒', icon: 'none' });
      return;
    }
    const type = e.currentTarget.dataset.type;
    const item = (this.data.careOverview || []).find(care => care.type === type);
    if (!item) return;
    const params = [
      `catId=${encodeURIComponent(this.data.catId)}`,
      `type=${encodeURIComponent(item.type)}`,
      `intervalDays=${encodeURIComponent(item.intervalDays || 30)}`
    ];
    if (item.lastDate) params.push(`lastDate=${encodeURIComponent(item.lastDate)}`);
    wx.navigateTo({ url: `/pages/reminder-add/reminder-add?${params.join('&')}` });
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
      success: res => {
        if (!res.confirm) return;
        wx.showModal({
          title: '再次确认删除',
          content: '删除后无法恢复。请再次确认是否删除这只宠物及相关记录。',
          confirmText: '确认删除',
          confirmColor: '#F36B6B',
          success: async secondRes => {
            if (!secondRes.confirm) return;
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
      }
    });
  },

  // ─── 分享卡 ───
  async openShareCard() {
    await new Promise(resolve => {
      this.setData({ showSharePreview: true, generatingShare: true, shareImagePath: '' }, resolve);
    });
    try {
      var path = await this._drawShareCard();
      this.setData({ shareImagePath: path, generatingShare: false });
      if (!path) wx.showToast({ title: '生成失败，请重试', icon: 'none' });
    } catch (e) {
      console.error('[cat-detail] gen share img fail:', e);
      this.setData({ generatingShare: false });
      wx.showToast({ title: '生成失败，请重试', icon: 'none' });
    }
  },

  closeSharePreview() { this.setData({ showSharePreview: false }); },
  stopBubble() {},

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
    var records = this.data.records || [];
    var W = 375, H = 667, S = 2;

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

    var name = cat.name || '未命名';
    var genderText = cat.gender === 'male' ? '弟弟' : (cat.gender === 'female' ? '妹妹' : '性别未知');
    var statusText = cat.status === 'passed_away' ? '已离世' : '在身边';
    var ageEnd = cat.status === 'passed_away' ? (cat.passedDate || undefined) : undefined;
    var age = calcAgeDetail(cat.birthday, ageEnd);
    var ageText = age ? ((age.years ? age.years + '岁' : '') + (age.months ? age.months + '个月' : '') + age.days + '天') : '未知';
    var companionDays = null;
    if (cat.status === 'passed_away' && cat.passedDate) companionDays = calcDaysBetween(cat.passedDate);
    else companionDays = calcDaysBetween(cat.adoptedDate || cat.birthday);
    var companionText = companionDays === null
      ? '陪伴天数未知'
      : (cat.status === 'passed_away' ? '离开 ' + companionDays + ' 天' : '相伴 ' + companionDays + ' 天');
    var latestRecord = records[0];

    _drawPosterBackground(ctx, W, H);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('宠物健康档案', 28, 46);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillText('Pet Health Profile', 28, 70);

    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    _roundRect(ctx, 258, 28, 88, 30, 15);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(statusText, 302, 49);

    _roundRect(ctx, 24, 100, W - 48, 170, 24);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(35,54,90,0.12)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    var avatarSrc = cat._displayAvatar || cat.avatar || '';
    var avatar = avatarSrc ? await _loadCanvasImage(canvas, avatarSrc) : null;
    if (avatar) {
      _drawCircleImage(ctx, avatar, 48, 124, 86, 86);
    } else {
      ctx.beginPath();
      ctx.arc(91, 167, 43, 0, Math.PI * 2);
      ctx.fillStyle = '#edf5ff';
      ctx.fill();
      ctx.fillStyle = '#5BA7D8';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name.slice(0, 1), 91, 168);
      ctx.textBaseline = 'alphabetic';
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = '#172033';
    ctx.font = 'bold 27px sans-serif';
    _fillTextSingleLine(ctx, name, 150, 150, 170);
    ctx.fillStyle = '#697386';
    ctx.font = '15px sans-serif';
    _fillTextSingleLine(ctx, (cat.breed || '品种未知') + ' · ' + genderText, 150, 175, 170);
    ctx.fillStyle = cat.status === 'passed_away' ? '#eb2f96' : '#1890ff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(statusText + ' · ' + companionText, 150, 202);

    var intro = cat.note || '认真记录每一次成长和健康变化。';
    ctx.fillStyle = '#7c8798';
    ctx.font = '13px sans-serif';
    _wrapText(ctx, intro, 48, 238, W - 96, 18, 2);

    var statY = 296;
    var stats = [
      { label: '年龄', value: ageText },
      { label: '生日', value: cat.birthday || '未记录' },
      { label: '体重', value: weight != null ? weight + ' kg' : '未记录' },
      { label: '健康记录', value: records.length + ' 条' }
    ];
    for (var i = 0; i < stats.length; i++) {
      var sx = 24 + (i % 2) * 171;
      var sy = statY + Math.floor(i / 2) * 76;
      _drawInfoTile(ctx, sx, sy, 156, 60, stats[i].label, stats[i].value);
    }

    var y = 468;
    ctx.fillStyle = '#172033';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText('最近健康动态', 28, y);
    y += 24;

    if (healthSummary.length) {
      var maxRecords = Math.min(healthSummary.length, 4);
      for (var j = 0; j < maxRecords; j++) {
        var item = healthSummary[j];
        ctx.fillStyle = '#f5f8fc';
        _roundRect(ctx, 28, y - 14, W - 56, 36, 12);
        ctx.fill();
        ctx.fillStyle = '#5BA7D8';
        ctx.font = 'bold 14px sans-serif';
        _fillTextSingleLine(ctx, item.label, 44, y + 8, 112);
        ctx.fillStyle = '#5f6b7a';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(item.date.slice(0, 10), W - 44, y + 8);
        ctx.textAlign = 'left';
        y += 44;
      }
    } else {
      ctx.fillStyle = '#7c8798';
      ctx.font = '14px sans-serif';
      ctx.fillText('还没有健康记录，期待第一条记录。', 28, y + 8);
      y += 42;
    }

    if (latestRecord) {
      ctx.fillStyle = '#7c8798';
      ctx.font = '13px sans-serif';
      _fillTextSingleLine(ctx, '最新记录：' + (_recordTypeLabel(latestRecord.type)) + ' · ' + latestRecord.date.slice(0, 10), 28, y + 8, W - 56);
    }

    ctx.fillStyle = '#e8edf5';
    _roundRect(ctx, 28, H - 70, W - 56, 42, 16);
    ctx.fill();
    ctx.fillStyle = '#5f6b7a';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('宠物小管家Plus · 记录宠物的每一个瞬间', W / 2, H - 44);

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
    return {
      imageUrl: this.data.shareImagePath || '/assets/logo.png',
      title: `看看${name}的健康档案`,
      path: `/pages/cat-detail/cat-detail?id=${this.data.cat?._id || this.data.catId || ''}`
    };
  }
});

function _buildHealthSummary(records) {
  var map = { bath: '洗澡', deworm: '驱虫', vaccine: '免疫', checkup: '体检' };
  var latest = {};
  (records || []).forEach(function(r) {
    if (!latest[r.type] || r.date > latest[r.type]) latest[r.type] = r.date;
  });
  var result = Object.keys(latest).map(function(k) { return { label: map[k] || k, date: latest[k] }; });
  result.sort(function(a, b) { return b.date.localeCompare(a.date); });
  return result;
}

function _recordTypeLabel(type) {
  var map = { bath: '洗澡', deworm: '驱虫', vaccine: '免疫', checkup: '体检', claw: '修剪指甲', other: '其他' };
  return map[type] || type || '记录';
}

function _buildCareOverview(records) {
  var configs = [
    { type: 'bath', label: '洗澡', intervalDays: 60, iconPath: '/assets/icons/ui/bath.png' },
    { type: 'deworm', label: '驱虫', intervalDays: 90, iconPath: '/assets/icons/ui/deworm.png' },
    { type: 'vaccine', label: '免疫', intervalDays: 365, iconPath: '/assets/icons/ui/vaccine.png' },
    { type: 'checkup', label: '体检', intervalDays: 365, iconPath: '/assets/icons/ui/checkup.png' }
  ];
  var latest = {};
  (records || []).forEach(function(r) {
    if (!r || !r.type || !r.date) return;
    var date = String(r.date).slice(0, 10);
    if (!latest[r.type] || date > latest[r.type]) latest[r.type] = date;
  });

  return configs.map(function(config) {
    var date = latest[config.type];
    if (!date) {
      return {
        type: config.type,
        label: config.label,
        iconPath: config.iconPath,
        dateText: '未记录',
        agoText: '暂无记录',
        statusText: '待记录',
        statusClass: 'empty',
        lastDate: '',
        intervalDays: config.intervalDays
      };
    }
    var days = _daysSince(date);
    var needsAttention = days !== null && days > config.intervalDays;
    return {
      type: config.type,
      label: config.label,
      iconPath: config.iconPath,
      dateText: date,
      agoText: calcAgo(date),
      statusText: needsAttention ? '建议安排' : '状态正常',
      statusClass: needsAttention ? 'warning' : 'good',
      lastDate: date,
      intervalDays: config.intervalDays
    };
  });
}

function _daysSince(dateStr) {
  var date = new Date(String(dateStr).slice(0, 10));
  if (Number.isNaN(date.getTime())) return null;
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.floor((today - date) / 86400000);
}

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function _drawPosterBackground(ctx, W, H) {
  var grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#eaf5ff');
  grad.addColorStop(0.48, '#fff8ef');
  grad.addColorStop(1, '#f4fbf5');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  var top = ctx.createLinearGradient(0, 0, W, 180);
  top.addColorStop(0, '#5BA7D8');
  top.addColorStop(1, '#67B3A5');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, 190);
}

function _drawInfoTile(ctx, x, y, w, h, label, value) {
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  _roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.fillStyle = '#8a95a5';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 14, y + 22);
  ctx.fillStyle = '#172033';
  ctx.font = 'bold 15px sans-serif';
  _fillTextSingleLine(ctx, value, x + 14, y + 45, w - 28);
}

function _fillTextSingleLine(ctx, text, x, y, maxWidth) {
  text = String(text || '');
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
    return;
  }
  var ellipsis = '...';
  while (text.length > 0 && ctx.measureText(text + ellipsis).width > maxWidth) {
    text = text.slice(0, -1);
  }
  ctx.fillText(text + ellipsis, x, y);
}

function _wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  text = String(text || '');
  var line = '';
  var lineCount = 0;
  for (var i = 0; i < text.length; i++) {
    var testLine = line + text[i];
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lineCount++;
      if (lineCount >= maxLines) {
        _fillTextSingleLine(ctx, line + text.slice(i), x, y, maxWidth);
        return;
      }
      ctx.fillText(line, x, y);
      line = text[i];
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

function _loadCanvasImage(canvas, src) {
  return new Promise(function(resolve) {
    var img = canvas.createImage();
    img.onload = function() { resolve(img); };
    img.onerror = function() { resolve(null); };
    img.src = src;
  });
}

function _drawCircleImage(ctx, img, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2);
  ctx.clip();
  var scale = Math.max(w / img.width, h / img.height);
  var sw = w / scale;
  var sh = h / scale;
  var sx = (img.width - sw) / 2;
  var sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}
