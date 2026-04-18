// cloudfunctions/getPhoneNumber/index.js
// 微信手机号解密云函数（由客户端 wx.cloud.callFunction 调用）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { code } = event;
  if (!code) return { errCode: -1, errMsg: '缺少 code 参数' };

  try {
    // 微信手机号快速验证
    // 方式1: 通过 cloudbase 统一服务
    const res = await cloud.cloudbase.auth().getPhoneNumber(code);
    return { phone: res.phoneNumber || res };
  } catch (e) {
    console.error('[getPhoneNumber] error:', e);
    // 方式2: 直接返回 code 让前端自行处理
    return { errCode: -2, errMsg: e.message || '解密失败', rawCode: code };
  }
};
