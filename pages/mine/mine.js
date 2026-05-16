// pages/mine/mine.js
// 「我的」页面
const clouddb = require('../../utils/clouddb.js');
const { todayStr, calcCheckInPoints, buildCheckInWeek, buildCheckInMonth, getLotteryDrawsForStreak, calcCumulativeRewards, isAdmin } = require('../../utils/util.js');

function getAvatarEmoji(currentUser) {
  if (currentUser && currentUser.avatarEmoji) return currentUser.avatarEmoji;
  return '😺';
}

function getAvatarType(currentUser) {
  const avatar = currentUser && currentUser.avatar;
  if (avatar && avatar.startsWith('cloud://')) return 'image';
  if (avatar && (avatar.startsWith('http') || avatar.startsWith('wxfile'))) return 'image';
  return 'emoji';
}

Page({
  data: {
    isOnline: true,
    isLoggedIn: false,
    isAdmin: false,
    notifyCount: 0,
    nickname: '加载中...',
    avatar: '',
    avatarEmoji: '😺',
    avatarType: 'emoji',
    phone: '',
    catCount: 0,
    reminderCount: 0,
    recordCount: 0,
    // 资料编辑
    showEditModal: false,
    editNickname: '',
    editEmoji: '😺',
    editAvatarUrl: '',      // 用户上传的头像云路径
    emojiList: ['😺', '😸', '😻', '🐱', '😽', '😹', '😼', '🐈', '🐈‍⬛', '🦁', '🐯', '🐻', '🐨', '🐼', '🐰', '🐶', '🐹', '🐷', '🦊', '🦄'],
    // 签到积分
    points: 0,
    checkedInToday: false,
    checkInStreak: 0,
    // 补签
    makeUpCards: 0,
    makeUpDates: [],
    showMakeUpModal: false,
    makeUpTargetDate: '',
    makeUpTargetLabel: '',
    nextMakeUpCost: 1,
    lastGroupShareDate: '',
    lastTimelineShareDate: '',
    showShareTask: false,
    // 日历
    calendarWeek: [],
    calendarMonth: [],
    showFullCalendar: false,
    // 累积签到
    totalCheckIns: 0,
    claimedCumulativeMilestones: [],
    showingCumulReward: null,
    monthlyMakeUpCount: 0,
    // 抽奖
    canLottery: false,
    streakReached7: false,
    daysUntilLottery: 7,
    availableDraws: 0,
    drawnMilestones: [],
    drawingMilestone: 0,
    drawnToday: false,
    hasDrawnBefore: false,
    // 补签月限
    monthlyMakeUpMonth: '',
    hasSpun: false,
    showLottery: false,
    spinning: false,
    wheelAngle: 0,
    lotteryResult: '',
    lotteryResultColor: '',
    wheelLabels: [],
    lotteryPrizes: [
      { icon: '🪙', name: '5积分', color: '#FF6B6B', type: 'points', value: 5 },
      { icon: '🎫', name: '1补签卡', color: '#4ECDC4', type: 'card', value: 1 },
      { icon: '🪙', name: '10积分', color: '#FFE66D', type: 'points', value: 10 },
      { icon: '😅', name: '谢谢参与', color: '#A8E6CF', type: 'none', value: 0 },
      { icon: '🪙', name: '20积分', color: '#FF8B94', type: 'points', value: 20 },
      { icon: '🎫', name: '2补签卡', color: '#B8A9C9', type: 'card', value: 2 }
    ],
    // 绑定手机
    showBindPhone: false,
    bindPhone: '',
    bindPassword: '',
    bindConfirm: ''
  },

  onLoad() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
  },

  onShow() {
    this.setData({ isOnline: getApp().globalData.isOnline });
    const app = getApp();
    this.setData({ isLoggedIn: app.isLoggedIn(), isAdmin: isAdmin() });
    if (app.isLoggedIn()) { this.loadUserInfo(); this._loadNotifyCount(); }
  },

  async loadUserInfo() {
    let currentUser = null;
    try { currentUser = wx.getStorageSync('currentUser'); } catch (e) {}

    // 从云端同步最新用户数据（覆盖本地缓存）
    if (currentUser && currentUser._id) {
      try {
        const cloudUser = await clouddb.getUserById(currentUser._id);
        if (cloudUser) {
          currentUser = cloudUser;
          try { wx.setStorageSync('currentUser', currentUser); } catch (e) {}
        }
      } catch (e) { console.error('[mine] loadUserInfo cloud sync error:', e); }
    }

    const nickname = (currentUser && currentUser.nickname) || '宠物爱好者';
    const avatarEmoji = getAvatarEmoji(currentUser);
    const avatarType = getAvatarType(currentUser);

    const points = (currentUser && currentUser.totalPoints) || 0;
    const checkInStreak = (currentUser && currentUser.checkInStreak) || 0;
    const lastCheckInDate = (currentUser && currentUser.lastCheckInDate) || '';
    const makeUpCards = (currentUser && currentUser.makeUpCards) || 0;
    const makeUpDates = (currentUser && currentUser.makeUpDates) || [];
    const lastGroupShareDate = (currentUser && currentUser.lastGroupShareDate) || '';
    const lastTimelineShareDate = (currentUser && currentUser.lastTimelineShareDate) || '';

    const today = todayStr();
    const currentMonth = today.slice(0, 7); // "2026-05"
    const checkedInToday = lastCheckInDate === today;

    // ════════════════════════════════════════════════════
    // 累积签到：优先读取 totalCheckIns，缺失则从现有数据迁移
    // ════════════════════════════════════════════════════
    var totalCheckIns = currentUser.totalCheckIns;
    if (!totalCheckIns && totalCheckIns !== 0) {
      // 迁移：假设 streak + makeUpDates.length 就是历史总签到
      var oldStreak = currentUser.checkInStreak || 0;
      var oldMakeUps = (currentUser.makeUpDates || []).length;
      totalCheckIns = oldStreak + oldMakeUps;
    }

    // ════════════════════════════════════════════════════
    // 补签月限：跨月重置
    // ════════════════════════════════════════════════════
    var monthlyMakeUpCount = currentUser.monthlyMakeUpCount || 0;
    var monthlyMakeUpMonth = currentUser.monthlyMakeUpMonth || '';
    if (monthlyMakeUpMonth !== currentMonth) {
      monthlyMakeUpCount = 0;
      monthlyMakeUpMonth = currentMonth;
    }

    // ════════════════════════════════════════════════════
    // 抽奖：drawnMilestones + 月度重置 lotteryUsedMonth
    // ════════════════════════════════════════════════════
    var drawnMilestones = currentUser.drawnMilestones || [];
    // 向后兼容：从旧的 lotteryUsed 推算 drawnMilestones
    var oldLotteryUsed = (currentUser.lotteryUsed || 0);
    if (drawnMilestones.length === 0 && oldLotteryUsed > 0) {
      for (var m = 7; m <= checkInStreak && drawnMilestones.length < oldLotteryUsed; m += 7) {
        drawnMilestones.push(m);
      }
    }

    // 抽奖次数：每连签7天里程碑给1次，已抽的不计
    var lotteryEarned = getLotteryDrawsForStreak(checkInStreak);
    var availableDraws = Math.max(0, lotteryEarned - drawnMilestones.length);
    var canLottery = availableDraws > 0;

    var drawnToday = (currentUser && currentUser._lastDrawDate || '') === today;
    var hasDrawnBefore = drawnMilestones.length > 0;

    // ════════════════════════════════════════════════════
    // 累积签到奖励检查
    // ════════════════════════════════════════════════════
    var claimedCumulativeMilestones = currentUser.claimedCumulativeMilestones || [];
    var cumulReward = calcCumulativeRewards(totalCheckIns, claimedCumulativeMilestones);

    // ════════════════════════════════════════════════════
    // 日历构建（传入 drawnMilestones）
    // ════════════════════════════════════════════════════
    var calendarWeek = buildCheckInWeek(lastCheckInDate, checkInStreak, makeUpDates, drawnMilestones);
    var calendarMonth = buildCheckInMonth(lastCheckInDate, checkInStreak, makeUpDates, drawnMilestones);
    var streakReached7 = checkInStreak >= 7;
    var nextMilestone = streakReached7 ? (Math.floor(checkInStreak / 7) + 1) * 7 : 7;
    var daysUntilLottery = nextMilestone - checkInStreak;

    var cards = makeUpCards;

    this.setData({
      nickname,
      avatar: currentUser && currentUser.avatar || '',
      avatarEmoji,
      avatarType,
      phone: currentUser && currentUser.phone
        ? currentUser.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
        : '',
      points,
      checkedInToday,
      checkInStreak,
      totalCheckIns,
      calendarWeek,
      calendarMonth,
      showFullCalendar: false,
      canLottery,
      availableDraws,
      drawnMilestones,
      drawnToday,
      hasDrawnBefore,
      streakReached7,
      daysUntilLottery,
      makeUpCards: cards,
      makeUpDates,
      lastGroupShareDate,
      lastTimelineShareDate,
      monthlyMakeUpCount,
      monthlyMakeUpMonth,
      claimedCumulativeMilestones,
      showingCumulReward: cumulReward.earned ? cumulReward : null
    });

    try {
      const [cats, reminders, records] = await Promise.all([
        clouddb.getCats(),
        clouddb.getReminders(),
        clouddb.getRecords()
      ]);
      this.setData({
        catCount: cats.length,
        reminderCount: reminders.filter(r => !r.completedAt).length,
        recordCount: records.length
      });
    } catch (e) {
      console.error('[mine] loadUserInfo error:', e);
    }
  },

  goCats()      { wx.switchTab({ url: '/pages/cat-list/cat-list' }); },
  goReminders() { wx.switchTab({ url: '/pages/reminders/reminders' }); },
  goRecords()   { wx.navigateTo({ url: '/pages/health-records/health-records' }); },
  goExpense()   { wx.navigateTo({ url: '/pages/expense/expense' }); },
  goShippingAddress() { wx.navigateTo({ url: '/pages/shipping-address/shipping-address' }); },
  goPointsMall()    { wx.navigateTo({ url: '/pages/points-mall/points-mall' }); },
  goInventory()    { wx.navigateTo({ url: '/pages/inventory/inventory' }); },
  goAdmin()         { wx.navigateTo({ url: '/pages/admin-items/admin-items' }); },
  goAdminAnnounce() { wx.navigateTo({ url: '/pages/admin-announcement/admin-announcement' }); },
  goAdminData()    { wx.navigateTo({ url: '/pages/admin-data/admin-data' }); },
  goFeedback()    { this._markNotifyRead(); wx.navigateTo({ url: '/pages/feedback/feedback' }); },
  goAbout()        { wx.navigateTo({ url: '/pages/about/about' }); },

  async _loadNotifyCount() {
    try {
      var currentUser = wx.getStorageSync('currentUser') || {};
      var count = await clouddb.getUnreadNotifyCount(currentUser._openid);
      this.setData({ notifyCount: count });
    } catch (e) {}
  },

  async _markNotifyRead() {
    this.setData({ notifyCount: 0 });
    try {
      var currentUser = wx.getStorageSync('currentUser') || {};
      await clouddb.markNotificationsRead(currentUser._openid);
    } catch (e) {}
  },

  goLogin() { wx.navigateTo({ url: '/pages/login/login' }); },

  // ─── 编辑个人资料 ───
  openEditProfile() {
    let currentUser = null;
    try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (e) {}
    const avatarType = getAvatarType(currentUser);
    this.setData({
      showEditModal: true,
      editNickname: this.data.nickname,
      editEmoji: currentUser.avatarEmoji || '😺',
      editAvatarUrl: avatarType === 'image' ? (currentUser.avatar || '') : ''
    });
  },

  stopBubble() {}, // 阻止事件冒泡

  selectEmoji(e) { this.setData({ editEmoji: e.currentTarget.dataset.emoji, editAvatarUrl: '' }); },

  // ─── 上传自定义头像 ───
  chooseAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async res => {
        const filePath = res.tempFilePaths[0];
        wx.showLoading({ title: '上传中...', mask: true });
        try {
          const ext = filePath.split('.').pop() || 'jpg';
          const cloudPath = `avatars/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath
          });
          const fileID = uploadRes.fileID;
          this.setData({ editAvatarUrl: fileID, editEmoji: '' });
          wx.hideLoading();
          wx.showToast({ title: '头像已上传', icon: 'success' });
        } catch (e) {
          wx.hideLoading();
          console.error('[mine] upload avatar error:', e);
          wx.showToast({ title: '上传失败，请重试', icon: 'none' });
        }
      }
    });
  },

  onNicknameInput(e) { this.setData({ editNickname: e.detail.value }); },

  confirmEdit() {
    const nickname = this.data.editNickname.trim();
    if (!nickname) { wx.showToast({ title: '昵称不能为空', icon: 'none' }); return; }

    let currentUser = null;
    try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (e) {}
    const newAvatar = this.data.editAvatarUrl || 'emoji';
    const newAvatarEmoji = this.data.editEmoji;
    const newAvatarType = this.data.editAvatarUrl ? 'image' : 'emoji';

    currentUser.nickname = nickname;
    currentUser.avatar = newAvatar;
    currentUser.avatarEmoji = newAvatarEmoji;
    try { wx.setStorageSync('currentUser', currentUser); } catch (e) {}

    if (currentUser._id) {
      clouddb.updateUser(currentUser._id, {
        nickname,
        avatar: newAvatar,
        avatarEmoji: newAvatarEmoji
      }).catch(() => {});
    }

    this.setData({
      showEditModal: false,
      nickname,
      avatarEmoji: newAvatarEmoji,
      avatarType: newAvatarType,
      avatar: this.data.editAvatarUrl || '',
      editAvatarUrl: ''
    });
    wx.showToast({ title: '保存成功', icon: 'success' });
  },

  closeEditModal() { this.setData({ showEditModal: false, editAvatarUrl: '' }); },
  cancelEdit() { this.setData({ showEditModal: false, editAvatarUrl: '' }); },

  // ─── 绑定手机号 ───
  openBindPhone() {
    this.setData({ showBindPhone: true, bindPhone: '', bindPassword: '', bindConfirm: '' });
  },

  bindPhoneInput(e) { this.setData({ bindPhone: e.detail.value.trim() }); },
  bindPasswordInput(e) { this.setData({ bindPassword: e.detail.value }); },
  bindConfirmInput(e) { this.setData({ bindConfirm: e.detail.value }); },

  async onManualBindPhone() {
    const { bindPhone, bindPassword, bindConfirm } = this.data;
    if (!/^1[3-9]\d{9}$/.test(bindPhone)) { wx.showToast({ title: '请输入正确手机号', icon: 'none' }); return; }

    let currentUser = null;
    try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (e) {}
    const hasPassword = !!(currentUser && currentUser.password);

    if (!hasPassword) {
      // 首次绑定，需设置密码
      if (!bindPassword || bindPassword.length < 6) { wx.showToast({ title: '密码至少6位', icon: 'none' }); return; }
      if (bindPassword !== bindConfirm) { wx.showToast({ title: '两次密码不一致', icon: 'none' }); return; }
    }

    // 查重（不能绑定到其他账号）
    wx.showLoading({ title: '绑定中...' });
    const existing = await clouddb.getUserByPhone(bindPhone);
    if (existing && existing._openid !== currentUser._openid) {
      wx.hideLoading();
      wx.showToast({ title: '该手机号已被其他账号绑定', icon: 'none' }); return;
    }

    const updates = { phone: bindPhone };
    if (bindPassword) updates.password = bindPassword;
    if (currentUser._id) await clouddb.updateUser(currentUser._id, updates);
    currentUser.phone = bindPhone;
    if (bindPassword) currentUser.password = bindPassword;
    try { wx.setStorageSync('currentUser', currentUser); } catch (e) {}
    wx.hideLoading();
    wx.showToast({ title: '绑定成功', icon: 'success' });
    this.setData({ showBindPhone: false, phone: bindPhone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'), bindPhone: '', bindPassword: '', bindConfirm: '' });
  },

  async _finishBindPhone({ phone }) {
    let currentUser = null;
    try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (e) {}
    if (currentUser._id) await clouddb.updateUser(currentUser._id, { phone });
    currentUser.phone = phone;
    try { wx.setStorageSync('currentUser', currentUser); } catch (e) {}
    wx.hideLoading();
    wx.showToast({ title: '绑定成功', icon: 'success' });
    this.setData({ showBindPhone: false, phone: phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') });
  },

  closeBindPhone() { this.setData({ showBindPhone: false }); },

  // ─── 签到积分 ───
  async doCheckIn() {
    if (this.data.checkedInToday) {
      wx.showToast({ title: '今日已签到', icon: 'none' });
      return;
    }

    let currentUser = {};
    try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (e) {}

    const today = todayStr();
    const lastDate = currentUser.lastCheckInDate || '';

    // 计算连续签到天数
    let streak = 1;
    if (lastDate) {
      const last = new Date(lastDate.replace(/-/g, '/'));
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (last.toDateString() === yesterday.toDateString()) {
        streak = (currentUser.checkInStreak || 0) + 1;
      } else if (last.toDateString() === new Date().toDateString()) {
        return;
      }
    }

    // 累积签到 +1
    var totalCheckIns = (currentUser.totalCheckIns || 0) + 1;
    currentUser.totalCheckIns = totalCheckIns;

    const pointsEarned = calcCheckInPoints(streak);
    currentUser.totalPoints = (currentUser.totalPoints || 0) + pointsEarned;
    currentUser.lastCheckInDate = today;
    currentUser.checkInStreak = streak;

    // 累积签到奖励检查
    var claimedCumulative = currentUser.claimedCumulativeMilestones || [];
    var cumulReward = calcCumulativeRewards(totalCheckIns, claimedCumulative);
    if (cumulReward.earned) {
      currentUser.totalPoints += cumulReward.points;
      claimedCumulative.push(cumulReward.milestone);
      currentUser.claimedCumulativeMilestones = claimedCumulative;
    }

    if (currentUser._id) {
      try {
        await clouddb.updateUser(currentUser._id, {
          totalPoints: currentUser.totalPoints,
          totalCheckIns: totalCheckIns,
          lastCheckInDate: today,
          checkInStreak: streak,
          claimedCumulativeMilestones: claimedCumulative
        });
        // 云端成功 → 更新本地
        try { wx.setStorageSync('currentUser', currentUser); } catch (e) {}
      } catch (e) {
        console.error('[mine] checkIn cloud update failed:', e);
        wx.showToast({ title: '签到失败，请重试', icon: 'none' });
        return;
      }
    } else {
      // 未登录用户仅本地存储
      try { wx.setStorageSync('currentUser', currentUser); } catch (e) {}
    }

    // 抽奖：每连签7天里程碑给1次，已抽的不计
    var drawnMilestones = currentUser.drawnMilestones || [];
    var lotteryEarned = getLotteryDrawsForStreak(streak);
    var availableDraws2 = Math.max(0, lotteryEarned - drawnMilestones.length);
    var canLottery2 = availableDraws2 > 0;
    var nextMilestone2 = streak >= 7 ? (Math.floor(streak / 7) + 1) * 7 : 7;

    var calendarWeek2 = buildCheckInWeek(today, streak, this.data.makeUpDates, drawnMilestones);
    var calendarMonth2 = buildCheckInMonth(today, streak, this.data.makeUpDates, drawnMilestones);

    this.setData({
      points: currentUser.totalPoints,
      checkedInToday: true,
      totalCheckIns: totalCheckIns,
      checkInStreak: streak,
      calendarWeek: calendarWeek2,
      calendarMonth: calendarMonth2,
      canLottery: canLottery2,
      availableDraws: availableDraws2,
      drawnMilestones: drawnMilestones,
      streakReached7: streak >= 7,
      daysUntilLottery: nextMilestone2 - streak,
      drawnToday: false,
      hasDrawnBefore: drawnMilestones.length > 0,
      claimedCumulativeMilestones: claimedCumulative
    });

    if (cumulReward.earned) {
      wx.showToast({ title: '签到成功！累积' + cumulReward.label + '奖励+' + cumulReward.points + '分', icon: 'success' });
    } else {
      wx.showToast({ title: '签到成功 +' + pointsEarned + '分', icon: 'success' });
    }

    if (canLottery2 && streak % 7 === 0) {
      var self = this;
      setTimeout(function() { self.setData({ drawingMilestone: streak }); self.openLottery(); }, 1500);
    }
  },

  openShareTask() { this.setData({ showShareTask: true }); },
  closeShareTask() { this.setData({ showShareTask: false }); },

  // 点击“可抽奖 xN次”文字触发抽奖
  openLotteryIfAvailable() {
    if (!this.data.canLottery) return;
    var milestones = [7, 14, 21, 28];
    var drawn = this.data.drawnMilestones || [];
    var drawMilestone = 0;
    for (var i = 0; i < milestones.length; i++) {
      if (drawn.indexOf(milestones[i]) === -1) {
        drawMilestone = milestones[i];
        break;
      }
    }
    if (!drawMilestone) drawMilestone = 7;
    this.setData({ drawingMilestone: drawMilestone });
    this.openLottery();
  },

  // ─── 补签 ───
  onTapCalDay(e) {
    var dataset = e.currentTarget.dataset;
    var canMakeUp = dataset.canmakeup === true || dataset.canmakeup === 'true';
    var isJackpot = dataset.isjackpot === true || dataset.isjackpot === 'true';
    var hasDrawn = dataset.hasdrawn === true || dataset.hasdrawn === 'true';
    var drawMilestone = parseInt(dataset.drawmilestone) || 0;

    if (hasDrawn) { wx.showToast({ title: '已抽过奖了', icon: 'none' }); return; }
    if (isJackpot) {
      // 如果 drawMilestone 为 0（周历通过 canLottery 触发），
      // 自动取下一个未抽过的里程碑
      if (drawMilestone === 0) {
        var milestones = [7, 14, 21, 28];
        var drawn = this.data.drawnMilestones || [];
        for (var j = 0; j < milestones.length; j++) {
          if (drawn.indexOf(milestones[j]) === -1) {
            drawMilestone = milestones[j];
            break;
          }
        }
      }
      this.setData({ drawingMilestone: drawMilestone });
      this.openLottery();
      return;
    }
    // 补签月限检查
    if (this.data.monthlyMakeUpCount >= 4) {
      wx.showToast({ title: '本月补签次数已达上限（4次）', icon: 'none' });
      return;
    }
    if (!canMakeUp) return;

    var nextMakeUpCost = (this.data.monthlyMakeUpCount || 0) + 1;
    if (this.data.makeUpCards < nextMakeUpCost) {
      wx.showToast({ title: '补签卡不足，需要 ' + nextMakeUpCost + ' 张', icon: 'none' });
      return;
    }
    this.setData({
      showMakeUpModal: true,
      makeUpTargetDate: dataset.date,
      makeUpTargetLabel: dataset.label,
      nextMakeUpCost: nextMakeUpCost
    });
  },

  cancelMakeUp() { this.setData({ showMakeUpModal: false }); },

  async confirmMakeUp() {
    var self = this;
    var date = this.data.makeUpTargetDate;
    var cards = this.data.makeUpCards;
    var cost = this.data.nextMakeUpCost || 1;
    if (cards < cost) { wx.showToast({ title: '补签卡不足', icon: 'none' }); return; }
    if (this.data.monthlyMakeUpCount >= 4) {
      wx.showToast({ title: '本月补签次数已达上限（4次）', icon: 'none' });
      this.setData({ showMakeUpModal: false });
      return;
    }

    var currentUser = {};
    try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (e) {}

    var today = todayStr();
    var actualCost = (self.data.monthlyMakeUpCount || 0) + 1;
    if (actualCost > cost) cost = actualCost;

    // 补签：只增加累积签到，不改变连续签到
    var newDates = (self.data.makeUpDates || []).concat([date]);
    var newCards = cards - cost;
    var newTotalCheckIns = (currentUser.totalCheckIns || 0) + 1;
    var streakUnchanged = currentUser.checkInStreak || 0;

    var currentMonth = today.slice(0, 7);
    var monthlyMakeUpCount = currentUser.monthlyMakeUpCount || 0;
    var monthlyMakeUpMonth = currentUser.monthlyMakeUpMonth || '';
    if (monthlyMakeUpMonth !== currentMonth) { monthlyMakeUpCount = 0; }
    monthlyMakeUpCount += 1;

    currentUser.totalCheckIns = newTotalCheckIns;
    currentUser.makeUpCards = newCards;
    currentUser.makeUpDates = newDates;
    currentUser.monthlyMakeUpCount = monthlyMakeUpCount;
    currentUser.monthlyMakeUpMonth = currentMonth;
    // checkInStreak 不变！

    // 累积奖励检查（在云端更新之前合并）
    var claimedCumulative = currentUser.claimedCumulativeMilestones || [];
    var cumulReward = calcCumulativeRewards(newTotalCheckIns, claimedCumulative);
    var cloudUpdates = {
      totalCheckIns: newTotalCheckIns,
      makeUpCards: newCards,
      makeUpDates: newDates,
      monthlyMakeUpCount: monthlyMakeUpCount,
      monthlyMakeUpMonth: currentMonth
    };
    if (cumulReward.earned) {
      claimedCumulative.push(cumulReward.milestone);
      currentUser.claimedCumulativeMilestones = claimedCumulative;
      currentUser.totalPoints = (currentUser.totalPoints || 0) + cumulReward.points;
      cloudUpdates.totalPoints = currentUser.totalPoints;
      cloudUpdates.claimedCumulativeMilestones = claimedCumulative;
    }

    // 先写云端，成功后再写本地
    if (currentUser._id) {
      try {
        await clouddb.updateUser(currentUser._id, cloudUpdates);
      } catch (e) {
        console.error('[mine] confirmMakeUp cloud update failed:', e);
        wx.showToast({ title: '补签失败，请重试', icon: 'none' });
        return;
      }
    }
    try { wx.setStorageSync('currentUser', currentUser); } catch (e) {}

    var drawnMilestones = currentUser.drawnMilestones || [];
    var calendarWeek = buildCheckInWeek(currentUser.lastCheckInDate || '', streakUnchanged, newDates, drawnMilestones);
    var lotteryEarned = getLotteryDrawsForStreak(streakUnchanged);
    var availableDraws3 = Math.max(0, lotteryEarned - drawnMilestones.length);
    var nextMilestone3 = streakUnchanged >= 7 ? (Math.floor(streakUnchanged / 7) + 1) * 7 : 7;

    self.setData({
      makeUpCards: newCards,
      makeUpDates: newDates,
      checkInStreak: streakUnchanged,
      totalCheckIns: newTotalCheckIns,
      monthlyMakeUpCount: monthlyMakeUpCount,
      showMakeUpModal: false,
      calendarWeek: calendarWeek,
      calendarMonth: buildCheckInMonth(currentUser.lastCheckInDate || '', streakUnchanged, newDates, drawnMilestones),
      canLottery: availableDraws3 > 0,
      availableDraws: availableDraws3,
      drawnMilestones: drawnMilestones,
      streakReached7: streakUnchanged >= 7,
      daysUntilLottery: nextMilestone3 - streakUnchanged,
      drawnToday: self.data.drawnToday,
      hasDrawnBefore: drawnMilestones.length > 0,
      claimedCumulativeMilestones: claimedCumulative,
      points: cumulReward.earned ? currentUser.totalPoints : self.data.points
    });

    wx.showToast({ title: '补签成功！累积+1天', icon: 'success' });
  },

  async onPullDownRefresh() {
    try { await this.loadUserInfo(); } finally { wx.stopPullDownRefresh(); }
  },

  onShareAppMessage: function() {
    this._awardShareCard('group');
    return { imageUrl: '/assets/logo.png', title: '宠物健康管家 - 记录宠物的每一个瞬间', path: '/pages/cat-list/cat-list' };
  },

  onShareTimeline: function() {
    this._awardShareCard('timeline');
    return { imageUrl: '/assets/logo.png', title: '宠物健康管家 - 记录宠物的每一个瞬间' };
  },

  async _awardShareCard(type) {
    var self = this;
    var today = todayStr();
    var currentUser = {};
    try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (e) {}

    var dateField = type === 'group' ? 'lastGroupShareDate' : 'lastTimelineShareDate';
    if ((currentUser[dateField] || '') === today) {
      wx.showToast({ title: '今日已领取分享奖励', icon: 'none' });
      return;
    }

    var newCards = (currentUser.makeUpCards || 0) + 1;
    currentUser.makeUpCards = newCards;
    currentUser[dateField] = today;

    if (currentUser._id) {
      try {
        await clouddb.updateUser(currentUser._id, { makeUpCards: newCards, [dateField]: today });
      } catch (e) {
        console.error('[mine] awardShareCard cloud update failed:', e);
        return;
      }
    }
    try { wx.setStorageSync('currentUser', currentUser); } catch (e) {}

    var drawnMilestones = currentUser.drawnMilestones || [];
    var streak = currentUser.checkInStreak || 0;
    var calendarWeek = buildCheckInWeek(currentUser.lastCheckInDate || '', streak, currentUser.makeUpDates || [], drawnMilestones);
    var lotteryEarned = getLotteryDrawsForStreak(streak);
    var availableDraws4 = Math.max(0, lotteryEarned - drawnMilestones.length);
    var nextMilestone4 = streak >= 7 ? (Math.floor(streak / 7) + 1) * 7 : 7;

    self.setData({
      makeUpCards: newCards,
      calendarWeek: calendarWeek,
      calendarMonth: buildCheckInMonth(currentUser.lastCheckInDate || '', streak, currentUser.makeUpDates || [], drawnMilestones),
      canLottery: availableDraws4 > 0,
      availableDraws: availableDraws4,
      drawnMilestones: drawnMilestones,
      streakReached7: streak >= 7,
      daysUntilLottery: nextMilestone4 - streak,
      drawnToday: self.data.drawnToday,
      hasDrawnBefore: drawnMilestones.length > 0,
      showShareTask: false,
      lastGroupShareDate: type === 'group' ? today : self.data.lastGroupShareDate,
      lastTimelineShareDate: type === 'timeline' ? today : self.data.lastTimelineShareDate
    });

    wx.showToast({ title: '+1补签卡 🎫', icon: 'success' });
  },

  openLottery() {
    var prizes = this.data.lotteryPrizes;
    var labels = [];
    for (var i = 0; i < prizes.length; i++) {
      labels.push({ name: prizes[i].name, rotate: i * 60 + 30 });
    }
    this.setData({
      showLottery: true, spinning: false, hasSpun: false,
      wheelAngle: 0, lotteryResult: '', lotteryResultColor: '',
      wheelLabels: labels
    });
  },

  closeLottery() {
    if (this.data.spinning) return;
    this.setData({ showLottery: false, lotteryResult: '', lotteryResultColor: '' });
  },

  spinWheel() {
    var self = this;
    if (self.data.spinning || self.data.hasSpun) return;

    var prizes = self.data.lotteryPrizes;
    var prizeIndex = Math.floor(Math.random() * prizes.length);
    var segAngle = 360 / prizes.length;
    var targetAngle = 360 * 5 + 360 - (prizeIndex * segAngle + segAngle / 2);

    self.setData({ spinning: true, hasSpun: true, wheelAngle: targetAngle });

    setTimeout(function() {
      var prize = prizes[prizeIndex];
      self._awardPrize(prize);
    }, 4200);
  },

  async _awardPrize(prize) {
    var self = this;
    var currentUser = {};
    try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (e) {}
    var today = todayStr();
    var currentMonth = today.slice(0, 7);

    // 记录抽过的里程碑 + 月度消费一次
    var milestone = self.data.drawingMilestone;
    var drawnMilestones = currentUser.drawnMilestones || [];
    if (milestone && drawnMilestones.indexOf(milestone) === -1) {
      drawnMilestones.push(milestone);
    }
    var lotteryUsedMonth = (currentUser.lotteryUsedMonth || 0) + 1;

    currentUser.drawnMilestones = drawnMilestones;
    currentUser.lotteryUsedMonth = lotteryUsedMonth;
    currentUser.lotteryMonth = currentMonth;
    currentUser.lotteryUsed = drawnMilestones.length;
    currentUser._lastDrawDate = today;

    var resultColor = '#4A90D9';
    if (prize.type === 'points') {
      currentUser.totalPoints = (currentUser.totalPoints || 0) + prize.value;
      resultColor = '#4A90D9';
    } else if (prize.type === 'card') {
      currentUser.makeUpCards = (currentUser.makeUpCards || 0) + prize.value;
      resultColor = '#5CB85C';
    } else { resultColor = '#999'; }

    try { wx.setStorageSync('currentUser', currentUser); } catch (e) {}

    if (currentUser._id) {
      var updates = {
        drawnMilestones: drawnMilestones,
        lotteryUsedMonth: lotteryUsedMonth,
        lotteryMonth: currentMonth,
        lotteryUsed: drawnMilestones.length,
        _lastDrawDate: today
      };
      if (prize.type === 'points') updates.totalPoints = currentUser.totalPoints;
      if (prize.type === 'card') updates.makeUpCards = currentUser.makeUpCards;
      try {
        await clouddb.updateUser(currentUser._id, updates);
      } catch (e) {
        console.error('[mine] awardPrize cloud update failed:', e);
        // 本地已写，UI 已更新，仅日志记录
      }
    }

    var newPoints = prize.type === 'points' ? currentUser.totalPoints : self.data.points;
    var newCards = prize.type === 'card' ? currentUser.makeUpCards : self.data.makeUpCards;
    var streak = currentUser.checkInStreak || 0;
    var lotteryEarned = getLotteryDrawsForStreak(streak);
    var newAvailableDraws = Math.max(0, lotteryEarned - drawnMilestones.length);

    self.setData({
      spinning: false,
      lotteryResult: '恭喜获得 ' + prize.icon + ' ' + prize.name + '！',
      lotteryResultColor: resultColor,
      canLottery: newAvailableDraws > 0,
      availableDraws: newAvailableDraws,
      drawnMilestones: drawnMilestones,
      hasSpun: true,
      drawnToday: true,
      hasDrawnBefore: newAvailableDraws <= 0 && drawnMilestones.length > 0,
      points: newPoints,
      makeUpCards: newCards
    });

    if (prize.type === 'card') {
      var calendarWeek = buildCheckInWeek(
        currentUser.lastCheckInDate || '',
        currentUser.checkInStreak || 0,
        currentUser.makeUpDates || [],
        drawnMilestones
      );
      self.setData({
        calendarWeek: calendarWeek,
        calendarMonth: buildCheckInMonth(
          currentUser.lastCheckInDate || '',
          currentUser.checkInStreak || 0,
          currentUser.makeUpDates || [],
          drawnMilestones
        )
      });
    }

    if (prize.type === 'physical') {
      // 预留：写入 user_inventory 集合
    }
  },

  // ─── 切换日历视图（周/月） ───
  toggleCalendar() {
    this.setData({ showFullCalendar: !this.data.showFullCalendar });
  },

  logout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: res => {
        if (!res.confirm) return;
        wx.clearStorageSync();
        getApp().globalData.openid = null;
        this.setData({
          isLoggedIn: false,
          nickname: '',
          avatar: '',
          phone: '',
          catCount: 0,
          reminderCount: 0,
          recordCount: 0
        });
        wx.showToast({ title: '已退出', icon: 'success' });
      }
    });
  },


});
