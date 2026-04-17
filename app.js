// app.js
// 猫咪健康管家 - 应用入口
App({
  globalData: {
    userInfo: null,
    openid: null,
    cloudReady: false
  },

  onLaunch() {
    this.initCloud();
  },

  async initCloud() {
    if (typeof wx.cloud === 'undefined') {
      console.warn('[app] 云开发未安装，当前为本地数据模式');
      return;
    }

    try {
      // ⚠️ 重要：请在微信开发者工具中右键项目目录 → 「更多设置」→ 「云开发」→ 开通
      // 开通后在「云开发」面板的「设置」→「环境ID」复制粘贴到下面
      const envId = 'cloud1-5gylr1n55da68050'; // 云环境ID

      if (envId === 'YOUR_ENV_ID') {
        console.warn('[app] 云环境ID未配置，使用本地数据模式');
        return;
      }

      wx.cloud.init({
        env: envId,
        traceUser: true,
      });

      this.globalData.cloudReady = true;
      console.log('[app] 云开发初始化成功，环境ID:', envId);

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
  }
});
