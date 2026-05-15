// cloudfunctions/queryExpress/index.js
// 快递物流查询 — 通过快递100 API 获取轨迹
// API Key 配置在文件顶部的 CONFIG 中
// 云数据库 express_cache 集合用于缓存（同单号30分钟内不重复查询）
const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ════════════════════════════════════════════
// 🔑 快递100 配置
// ════════════════════════════════════════════
// 生产环境需在云开发控制台 → 云函数 → queryExpress → 环境变量 中配置：
//   KUAIDI100_CUSTOMER = 你的customer
//   KUAIDI100_KEY      = 你的key
const CONFIG = {
  customer: process.env.KUAIDI100_CUSTOMER,
  key: process.env.KUAIDI100_KEY,
};

// 快递公司名称 → 快递100编码
const CARRIER_MAP = {
  '顺丰速运': 'shunfeng',
  '中通快递': 'zhongtong',
  '圆通速递': 'yuantong',
  '韵达快递': 'yunda',
  '申通快递': 'shentong',
  '极兔速递': 'jitu',
  '京东物流': 'jd',
  'EMS': 'ems',
};

const CACHE_TTL = 30 * 60 * 1000; // 缓存有效期 30 分钟

// ── 快递100 API 查询 ──
function queryKuaidi100(com, num) {
  return new Promise((resolve) => {
    const param = JSON.stringify({ com, num });
    const sign = crypto.createHash('md5')
      .update(param + CONFIG.key + CONFIG.customer)
      .digest('hex')
      .toUpperCase();

    const postData = `customer=${encodeURIComponent(CONFIG.customer)}&sign=${encodeURIComponent(sign)}&param=${encodeURIComponent(param)}`;

    const req = https.request({
      hostname: 'poll.kuaidi100.com',
      path: '/poll/query.do',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve({ ok: true, data });
        } catch (e) {
          resolve({ ok: false, msg: '解析物流信息失败' });
        }
      });
    });

    req.on('error', e => resolve({ ok: false, msg: '查询物流失败: ' + e.message }));
    req.write(postData);
    req.end();
  });
}

// ── 缓存读写 ──
async function getCache(cacheKey) {
  try {
    const res = await db.collection('express_cache').doc(cacheKey).get();
    if (res.data && Date.now() - res.data.updatedAt < CACHE_TTL) {
      return res.data.trackingData;
    }
  } catch (e) { /* 查不到 */ }
  return null;
}

async function setCache(cacheKey, trackingData) {
  try {
    await db.collection('express_cache').doc(cacheKey).set({
      data: {
        _id: cacheKey,
        trackingData,
        updatedAt: Date.now(),
      },
    });
  } catch (e) {
    // 更新
    try {
      await db.collection('express_cache').doc(cacheKey).update({
        data: { trackingData, updatedAt: Date.now() },
      });
    } catch (e2) {
      // 创建
      try {
        await db.collection('express_cache').add({
          data: {
            _id: cacheKey,
            trackingData,
            updatedAt: Date.now(),
          },
        });
      } catch (e3) { /* 忽略 */ }
    }
  }
}

// ════════════════════════════════════════════
// 主入口
// ════════════════════════════════════════════
exports.main = async (event) => {
  const { carrier, trackingNo } = event;

  if (!trackingNo || !trackingNo.trim()) {
    return { success: false, error: '缺少快递单号' };
  }

  if (!CONFIG.customer || !CONFIG.key) {
    return { success: false, error: '快递查询服务未配置，请联系管理员在云函数环境变量中设置 KUAIDI100_CUSTOMER 和 KUAIDI100_KEY' };
  }

  const com = CARRIER_MAP[carrier] || 'auto';
  const cacheKey = `${com}_${trackingNo.trim()}`;

  // 1. 先查缓存
  const cached = await getCache(cacheKey);
  if (cached) {
    return { success: true, data: cached, cached: true };
  }

  // 1.5 偶尔清理过期缓存（5% 概率，清理 >7 天的记录）
  if (Math.random() < 0.05) {
    try {
      await db.collection('express_cache').where({
        updatedAt: db.command.lt(Date.now() - 7 * 24 * 60 * 60 * 1000)
      }).remove();
    } catch (e) { /* 静默失败 */ }
  }

  // 2. 调快递100 API
  const result = await queryKuaidi100(com, trackingNo.trim());

  if (!result.ok) {
    return { success: false, error: result.msg };
  }

  // 3. 写入缓存
  await setCache(cacheKey, result.data);

  return { success: true, data: result.data, cached: false };
};