// cloudfunctions/getAdminRecords/index.js
// 管理员专用：查询指定集合的全部记录（绕过客户端 _openid 限制）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// 管理员 openid 白名单（需与 utils/util.js 中的 ADMIN_OPENIDS 保持一致）
// 留空 = 不做服务端鉴权，依赖客户端页面级权限控制
const ADMIN_OPENIDS = [];

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const callerOpenid = wxContext.OPENID;

  // 服务端管理员校验（白名单非空时生效）
  if (ADMIN_OPENIDS.length > 0 && ADMIN_OPENIDS.indexOf(callerOpenid) === -1) {
    return { code: -1, msg: '无管理员权限' };
  }

  const { collection, orderBy, orderDesc, limit: reqLimit } = event;
  if (!collection) {
    return { code: -1, msg: '缺少 collection 参数' };
  }

  // 微信云函数单次查询上限 100 条，自动分页拉取
  const MAX_LIMIT = 100;
  const totalLimit = Math.min(reqLimit || 500, 1000);
  let allData = [];
  let batch = 0;

  while (allData.length < totalLimit) {
    const batchLimit = Math.min(MAX_LIMIT, totalLimit - allData.length);
    let query = db.collection(collection)
      .skip(batch * MAX_LIMIT)
      .limit(batchLimit);

    if (orderBy) {
      query = query.orderBy(orderBy, orderDesc || 'desc');
    }

    try {
      const { data } = await query.get();
      if (!data || data.length === 0) break;
      allData = allData.concat(data);
      if (data.length < batchLimit) break; // 没有更多数据
      batch++;
    } catch (e) {
      console.error('[getAdminRecords] query error:', e);
      break;
    }
  }

  return { code: 0, data: allData };
};
