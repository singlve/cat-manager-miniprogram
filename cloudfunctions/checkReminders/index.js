// cloudfunctions/checkReminders/index.js
// 定时触发：检查所有提醒，向即将到期/已逾期的用户推送订阅消息
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 订阅消息模板 ID — 在微信公众平台「订阅消息」中申请，替换为实际模板 ID
const TEMPLATE_ID = process.env.TEMPLATE_ID || '';

const TYPE_LABEL = { bath: '洗澡', deworm: '驱虫', vaccine: '免疫', checkup: '体检', claw: '修剪指甲' };

const PAGE_SIZE = 100;

exports.main = async (event, context) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let totalChecked = 0;
  let totalDue = 0;
  let sentCount = 0;
  let failCount = 0;

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

    for (const r of reminders) {
      const lastDate = new Date(r.lastDate);
      lastDate.setHours(0, 0, 0, 0);

      const nextDate = new Date(lastDate);
      nextDate.setDate(nextDate.getDate() + r.intervalDays);
      nextDate.setHours(0, 0, 0, 0);

      if (nextDate > today) continue;
      totalDue++;

      let catName = '你的宠物';
      try {
        const cat = await db.collection('cats').doc(r.catId).get();
        if (cat.data) catName = cat.data.name;
      } catch (e) {
        console.warn('[checkReminders] cat lookup failed for', r.catId, e.message);
      }

      const typeLabel = TYPE_LABEL[r.type] || r.type;
      const daysOverdue = Math.floor((today - nextDate) / (1000 * 60 * 60 * 24));

      // 没有模板 ID 时仅统计，不发送
      if (!TEMPLATE_ID) {
        console.log('[checkReminders] 未配置模板ID，跳过发送:', catName, typeLabel);
        continue;
      }

      try {
        await cloud.openapi.subscribeMessage.send({
          touser: r._openid,
          templateId: TEMPLATE_ID,
          data: {
            thing1: { value: `${catName} - ${typeLabel}` },
            time23: { value: nextDate.toLocaleDateString('zh-CN') },
            thing26: { value: daysOverdue > 0 ? `已逾期 ${daysOverdue} 天` : '今天' }
          },
          page: `/pages/cat-detail/cat-detail?id=${r.catId}`
        });
        sentCount++;
      } catch (e) {
        failCount++;
        console.error('[checkReminders] send failed for', r._id, ':', e.message);
      }
    }

    console.log(`[checkReminders] 完成 — 检查 ${totalChecked} 条，到期 ${totalDue} 条，发送成功 ${sentCount}，失败 ${failCount}`);
    return { ok: true, checked: totalChecked, due: totalDue, sent: sentCount, failed: failCount };

  } catch (e) {
    console.error('[checkReminders] 执行失败:', e);
    return { ok: false, error: e.message, checked: totalChecked, due: totalDue };
  }
};
