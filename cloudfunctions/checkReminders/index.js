// cloudfunctions/checkReminders/index.js
// 定时触发：检查所有提醒，向即将到期/已逾期的用户推送订阅消息
const cloud = require('wx-server-sdk');
const https = require('https');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 订阅消息模板 ID — 优先使用云函数环境变量，未配置时回退到小程序端申请授权的同一模板
const DEFAULT_APPID = 'wx1362cb2063c2e367';
const DEFAULT_TEMPLATE_ID = 'BMr3A8IZjnDrHnIxsIUZU4LX7khHdVrFo8F2aN7Fu8U';
const WECHAT_APPID = process.env.WECHAT_APPID || DEFAULT_APPID;
const WECHAT_APPSECRET = process.env.WECHAT_APPSECRET || '';
const TEMPLATE_ID = process.env.TEMPLATE_ID || DEFAULT_TEMPLATE_ID;
const MINIPROGRAM_STATE = process.env.MINIPROGRAM_STATE || 'formal';

const TYPE_LABEL = { bath: '洗澡', deworm: '驱虫', vaccine: '免疫', checkup: '体检', claw: '修剪指甲' };

const PAGE_SIZE = 100;
const SEND_CONCURRENCY = 5;

function limitThingValue(value) {
  value = String(value || '');
  return value.length > 20 ? value.slice(0, 20) : value;
}

let tokenCache = { token: '', expiresAt: 0 };

function requestJson(method, url, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const req = https.request(url, {
      method,
      headers: payload ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      } : {}
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch (e) {
          reject(new Error('微信接口返回非 JSON: ' + raw));
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function getAccessToken(forceRefresh) {
  const now = Date.now();
  if (!forceRefresh && tokenCache.token && tokenCache.expiresAt > now) {
    return tokenCache.token;
  }

  if (!WECHAT_APPSECRET) {
    throw new Error('缺少云函数环境变量 WECHAT_APPSECRET');
  }

  const url = 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential'
    + '&appid=' + encodeURIComponent(WECHAT_APPID)
    + '&secret=' + encodeURIComponent(WECHAT_APPSECRET);
  const res = await requestJson('GET', url);

  if (!res.access_token) {
    throw new Error('获取 access_token 失败: ' + JSON.stringify(res));
  }

  const expiresIn = Number(res.expires_in || 7200);
  tokenCache = {
    token: res.access_token,
    expiresAt: now + Math.max(60, expiresIn - 300) * 1000
  };
  return tokenCache.token;
}

async function sendSubscribeMessage(payload) {
  let token = await getAccessToken(false);
  let res = await requestJson('POST', 'https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=' + encodeURIComponent(token), payload);

  if (res.errcode === 40001 || res.errcode === 42001) {
    token = await getAccessToken(true);
    res = await requestJson('POST', 'https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=' + encodeURIComponent(token), payload);
  }

  if (res.errcode && res.errcode !== 0) {
    const err = new Error(res.errmsg || 'subscribe send failed');
    err.errCode = res.errcode;
    err.errMsg = res.errmsg;
    throw err;
  }

  return res;
}

exports.main = async (event, context) => {
  event = event || {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let totalChecked = 0;
  let totalDue = 0;
  let sentCount = 0;
  let failCount = 0;
  let skippedNoTemplate = 0;
  let skippedNoOpenid = 0;
  let skippedInvalidReminder = 0;
  const failedDetails = [];
  const previewDetails = [];

  try {
    // 分页查询所有提醒
    let reminders = [];
    const countResult = await db.collection('reminders').count();
    const total = countResult.total;

    for (let skip = 0; skip < total; skip += PAGE_SIZE) {
      const { data } = await db.collection('reminders').skip(skip).limit(PAGE_SIZE).get();
      reminders = reminders.concat(data);
    }

    totalChecked = reminders.length;

    const dueReminders = [];

    for (const r of reminders) {
      if (!r.lastDate || !r.intervalDays) {
        skippedInvalidReminder++;
        continue;
      }

      const lastDate = new Date(r.lastDate);
      if (Number.isNaN(lastDate.getTime())) {
        skippedInvalidReminder++;
        continue;
      }
      lastDate.setHours(0, 0, 0, 0);

      const nextDate = new Date(lastDate);
      nextDate.setDate(nextDate.getDate() + r.intervalDays);
      nextDate.setHours(0, 0, 0, 0);

      if (nextDate > today) continue;
      totalDue++;
      dueReminders.push({ reminder: r, nextDate });
    }

    const sendTargets = event.limit
      ? dueReminders.slice(0, Math.max(0, Number(event.limit) || 0))
      : dueReminders;

    async function sendOne(item) {
      const r = item.reminder;
      const nextDate = item.nextDate;
      let catName = '你的宠物';
      try {
        const cat = await db.collection('cats').doc(r.catId).get();
        if (cat.data) catName = cat.data.name;
      } catch (e) {
        console.warn('[checkReminders] cat lookup failed for', r.catId, e.message);
      }

      const typeLabel = TYPE_LABEL[r.type] || r.type;
      const daysOverdue = Math.floor((today - nextDate) / (1000 * 60 * 60 * 24));
      const thing1Value = `${catName} - ${typeLabel}`;
      const thing26Value = daysOverdue > 0
        ? `${thing1Value} 已逾期 ${daysOverdue} 天！！！`
        : `${thing1Value} 就在今天，赶紧去完成吧！`;

      // 没有模板 ID 时仅统计，不发送
      if (!TEMPLATE_ID) {
        skippedNoTemplate++;
        console.log('[checkReminders] 未配置模板ID，跳过发送:', catName, typeLabel);
        return;
      }

      if (!r._openid) {
        skippedNoOpenid++;
        console.warn('[checkReminders] 提醒缺少 _openid，无法发送:', r._id);
        return;
      }

      if (previewDetails.length < 10) {
        previewDetails.push({
          reminderId: r._id,
          catId: r.catId,
          type: r.type,
          thing1: limitThingValue(thing1Value),
          time23: nextDate.toLocaleDateString('zh-CN'),
          thing26: limitThingValue(thing26Value),
          thing26Raw: thing26Value
        });
      }

      if (event.dryRun) return;

      try {
        await sendSubscribeMessage({
          touser: r._openid,
          template_id: TEMPLATE_ID,
          data: {
            thing1: { value: limitThingValue(thing1Value) },
            time23: { value: nextDate.toLocaleDateString('zh-CN') },
            thing26: { value: limitThingValue(thing26Value) }
          },
          page: `pages/cat-detail/cat-detail?id=${r.catId}`,
          miniprogram_state: MINIPROGRAM_STATE,
          lang: 'zh_CN'
        });
        sentCount++;
      } catch (e) {
        failCount++;
        if (failedDetails.length < 10) {
          failedDetails.push({
            reminderId: r._id,
            catId: r.catId,
            type: r.type,
            templateId: TEMPLATE_ID,
            errCode: e.errCode || e.errcode || e.code || '',
            errMsg: e.errMsg || e.errmsg || e.message || String(e)
          });
        }
        console.error('[checkReminders] send failed for', r._id, ':', e.message);
      }
    }

    for (let i = 0; i < sendTargets.length; i += SEND_CONCURRENCY) {
      await Promise.all(sendTargets.slice(i, i + SEND_CONCURRENCY).map(sendOne));
    }

    console.log(`[checkReminders] 完成 — 检查 ${totalChecked} 条，到期 ${totalDue} 条，本次发送 ${sendTargets.length} 条，发送成功 ${sentCount}，失败 ${failCount}，无模板 ${skippedNoTemplate}，无openid ${skippedNoOpenid}，无效提醒 ${skippedInvalidReminder}`);
    return {
      ok: true,
      checked: totalChecked,
      due: totalDue,
      attempted: sendTargets.length,
      sent: sentCount,
      failed: failCount,
      skippedNoTemplate,
      skippedNoOpenid,
      skippedInvalidReminder,
      failedDetails,
      previewDetails
    };

  } catch (e) {
    console.error('[checkReminders] 执行失败:', e);
    return { ok: false, error: e.message, checked: totalChecked, due: totalDue };
  }
};
