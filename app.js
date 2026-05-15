// app.js
// 宠物健康管家 - 应用入口
App({
  globalData: {
    userInfo: null,
    openid: null,
    cloudReady: false,
    isOnline: true,    // 网络状态（默认在线）
    catsCache: { data: null, ts: 0 }  // 猫咪列表缓存（5分钟过期）
  },

  onLaunch() {
    this.initCloud();
    this._initNetworkMonitor();
  },

  // 判断用户是否已登录（本地 storage 中有 currentUser 且有 openid）
  isLoggedIn() {
    try {
      const user = wx.getStorageSync('currentUser');
      return !!(user && user._id);
    } catch (e) { return false; }
  },

  // 跳转登录页（未登录时统一调用）
  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  async initCloud() {
    if (typeof wx.cloud === 'undefined') {
      console.warn('[app] 云开发未安装，当前为本地数据模式');
      return;
    }

    try {
      const envId = 'cloud1-5gylr1n55da68050';

      wx.cloud.init({
        env: envId,
        traceUser: true,
      });

      this.globalData.cloudReady = true;

      // 获取 openid
      await this.fetchOpenId();

    } catch (e) {
      console.error('[app] 云开发初始化失败:', e);
    }
  },

  async fetchOpenId() {
    try {
      const res = await wx.cloud.callFunction({ name: 'login' });
      if (res.result && res.result.openid) {
        this.globalData.openid = res.result.openid;
      }
    } catch (e) {
      console.warn('[app] login 云函数未部署或调用失败（正常，部署后消失）:', e);
    }
  },

  // ─── 网络状态监听 ───
  _initNetworkMonitor() {
    // 初始化：获取当前网络类型
    wx.getNetworkType({
      success: (res) => {
        this.globalData.isOnline = res.networkType !== 'none';
      },
      fail: () => {
        this.globalData.isOnline = false;
      }
    });
    // 监听网络状态变化
    wx.onNetworkStatusChange((res) => {
      const wasOffline = !this.globalData.isOnline;
      this.globalData.isOnline = res.isConnected;
      if (wasOffline && res.isConnected) {
        // 从离线恢复 → 提示用户
        wx.showToast({ title: '网络已恢复', icon: 'success', duration: 1500 });
      }
    });
  }
});
