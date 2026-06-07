function limitThingValue(value) {
  value = String(value || '');
  return value.length > 20 ? value.slice(0, 20) : value;
}

function buildReminderSummary(items, today) {
  const sorted = (items || []).slice().sort((a, b) => a.nextDate - b.nextDate);
  const first = sorted[0];
  if (!first) return null;

  const count = sorted.length;
  const daysOverdue = Math.floor((today - first.nextDate) / 86400000);
  let thing1Value;
  let thing26Value;

  if (count === 1) {
    thing1Value = `${first.catName} - ${first.typeLabel}`;
    thing26Value = daysOverdue > 0
      ? `${thing1Value} 已逾期 ${daysOverdue} 天！！！`
      : `${thing1Value} 就在今天，赶紧去完成吧！`;
  } else {
    thing1Value = `${first.catName}等 ${count} 项照护`;
    thing26Value = daysOverdue > 0
      ? `共${count}项提醒，最早逾期${daysOverdue}天`
      : `共${count}项提醒今天到期`;
  }

  return {
    count,
    first,
    thing1: limitThingValue(thing1Value),
    time23: first.nextDate.toLocaleDateString('zh-CN'),
    thing26: limitThingValue(thing26Value),
    thing26Raw: thing26Value
  };
}

function groupRemindersByOpenid(items) {
  const groups = new Map();
  (items || []).forEach(item => {
    const openid = item.reminder && item.reminder._openid;
    if (!openid) return;
    if (!groups.has(openid)) groups.set(openid, []);
    groups.get(openid).push(item);
  });
  return Array.from(groups.entries()).map(([openid, reminders]) => ({ openid, reminders }));
}

module.exports = {
  buildReminderSummary,
  groupRemindersByOpenid,
  limitThingValue
};
