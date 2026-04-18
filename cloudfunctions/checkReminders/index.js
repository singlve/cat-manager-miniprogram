// cloudfunctions/checkReminders/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 定时触发：每天早上 9 点检查所有提醒
exports.main = async (event, context) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 查询所有提醒
  const { data: reminders } = await db.collection('reminders').get();

  const tasks = [];

  for (const r of reminders) {
    const lastDate = new Date(r.lastDate);
    lastDate.setHours(0, 0, 0, 0);

    const nextDate = new Date(lastDate);
    nextDate.setDate(nextDate.getDate() + r.intervalDays);
    nextDate.setHours(0, 0, 0, 0);

    // 今天正好是提醒日，或已过期
    if (nextDate <= today) {
      // 查猫咪名字
      let catName = '你的猫咪';
      try {
        const cat = await db.collection('cats').doc(r.catId).get();
        if (cat.data) catName = cat.data.name;
      } catch (e) {}

      const typeLabel = { bath: '洗澡', deworm: '驱虫', vaccine: '免疫', checkup: '体检', claw: '修剪指甲' }[r.type] || r.type;
      const daysOverdue = Math.floor((today - nextDate) / (1000 * 60 * 60 * 24));

      tasks.push({
        templateId: 'your_template_id', // ⚠️ 替换为实际模板ID
        toUser: r._openid,
        data: {
          thing1: { value: `${catName} - ${typeLabel}` },
          time2: { value: nextDate.toLocaleDateString('zh-CN') },
          phrase3: { value: daysOverdue > 0 ? `已逾期 ${daysOverdue} 天` : '今天' }
        },
        catId: r.catId,
        type: r.type,
        overdueDays: daysOverdue
      });
    }
  }

  return { checked: reminders.length, due: tasks.length, tasks };
};
