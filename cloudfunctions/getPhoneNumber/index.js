// cloudfunctions/getPhoneNumber/index.js
// 微信手机号解密云函数（客户端 wx.cloud.callFunction 调用）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { code } = event;
  if (!code) return { errCode: -1, errMsg: '缺少 code 参数' };

  // ── 方式1: 微信统一服务（推荐） ──
  try {
    const res = await cloud.cloudbase.auth().getPhoneNumber(code);
    const phone = res && (res.phoneNumber || res);
    if (phone) return { phone, _source: 'cloudbase' };
  } catch (e1) {
    console.log('[getPhoneNumber] cloudbase方式失败，尝试openapi方式:', e1.message);
  }

  // ── 方式2: 云开发直接 OpenAPI（需确保依赖正确） ──
  try {
    const res2 = await cloud.cloudbase.service().auth().getPhoneNumber(code);
    const phone2 = res2 && (res2.phoneNumber || res2);
    if (phone2) return { phone: phone2, _source: 'service' };
  } catch (e2) {
    console.log('[getPhoneNumber] service方式也失败:', e2.message);
  }

  // ── 方式3: 返回 code 让前端知道调用成功但需用户授权 ──
  // （微信开发者工具本地调试时可能走此路径）
  return {
    errCode: -3,
    errMsg: '无法在此环境解密手机号',
    hint: '请确认云函数运行环境为正式版，且小程序已开通手机号快速验证组件'
  };
};