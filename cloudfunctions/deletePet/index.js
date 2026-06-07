const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

async function removeOwnedRows(collection, query) {
  let removed = 0;
  while (true) {
    const result = await db.collection(collection).where(query).limit(100).get();
    const rows = result.data || [];
    if (!rows.length) break;
    await Promise.all(rows.map(function(row) {
      return db.collection(collection).doc(row._id).remove();
    }));
    removed += rows.length;
    if (rows.length < 100) break;
  }
  return removed;
}

exports.main = async event => {
  const openid = cloud.getWXContext().OPENID;
  const catId = event && event.catId;
  if (!openid || !catId) return { code: -1, msg: '缺少删除参数' };

  const catResult = await db.collection('cats').doc(catId).get().catch(function() {
    return null;
  });
  const cat = catResult && catResult.data;
  if (!cat || cat._openid !== openid) return { code: -1, msg: '宠物不存在或无权删除' };

  const owner = { _openid: openid };
  const results = await Promise.all([
    removeOwnedRows('health_records', { ...owner, catId }),
    removeOwnedRows('weight_records', { ...owner, catId }),
    removeOwnedRows('reminders', { ...owner, catId }),
    removeOwnedRows('expenses', { ...owner, petId: catId })
  ]);
  await db.collection('cats').doc(catId).remove();

  return {
    code: 0,
    data: {
      cat: 1,
      healthRecords: results[0],
      weightRecords: results[1],
      reminders: results[2],
      expenses: results[3]
    }
  };
};
