// cloudfunctions/getPhoneNumber/index.js
// 微信手机号解密云函数（由客户端 wx.cloud.getPhoneNumber 调用）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { code } = event;
  if (!code) return { errCode: -1, errMsg: '缺少 code 参数' };

  try {
    const res = await cloud.cloudbase.getPhoneNumber({ code });
    return { ...res };
  } catch (e) {
    console.error('[getPhoneNumber] error:', e);
    return { errCode: -2, errMsg: e.message || '解密失败' };
  }
};
