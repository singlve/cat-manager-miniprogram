const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

async function queryAll(collection, query, orderBy) {
  const rows = [];
  let skip = 0;
  while (true) {
    let request = db.collection(collection).where(query).skip(skip).limit(100);
    if (orderBy) request = request.orderBy(orderBy, 'desc');
    const result = await request.get();
    const page = result.data || [];
    rows.push.apply(rows, page);
    if (page.length < 100) break;
    skip += page.length;
  }
  return rows;
}

exports.main = async () => {
  const openid = cloud.getWXContext().OPENID;
  if (!openid) return { code: -1, msg: '无法识别当前用户' };

  const ownerQuery = { _openid: openid };
  const catsResult = await db.collection('cats')
    .where(ownerQuery)
    .orderBy('_createTime', 'desc')
    .limit(100)
    .get();
  const cats = catsResult.data || [];

  const latestRecordPairs = await Promise.all(cats.map(async function(cat) {
    const result = await db.collection('health_records')
      .where({ _openid: openid, catId: cat._id })
      .orderBy('date', 'desc')
      .limit(1)
      .get();
    const latest = result.data && result.data[0];
    return [cat._id, latest ? latest.date : ''];
  }));

  const latestRecordByCat = {};
  latestRecordPairs.forEach(function(pair) {
    if (pair[1]) latestRecordByCat[pair[0]] = pair[1];
  });

  const recentResult = await db.collection('health_records')
    .where(ownerQuery)
    .orderBy('date', 'desc')
    .limit(3)
    .get();
  const reminders = await queryAll('reminders', ownerQuery, '_createTime');

  return {
    code: 0,
    data: {
      cats,
      latestRecordByCat,
      recentRecords: recentResult.data || [],
      reminders
    }
  };
};
