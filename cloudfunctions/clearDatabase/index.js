const cloud = require('wx-server-sdk')
cloud.init({ env: 'cloud1-7g8ckb3c7815a011' })
const db = cloud.database()

// 只清除球队相关数据，保留赛事和用户数据
const collections = ['teams', 'players', 'coaches', 'management']

exports.main = async (event, context) => {
  const results = []
  for (const name of collections) {
    let deleted = 0
    while (true) {
      const docs = await db.collection(name).limit(100).get()
      if (docs.data.length === 0) break
      for (const doc of docs.data) {
        try { await db.collection(name).doc(doc._id).remove(); deleted++ }
        catch (e) { console.error('删除失败:', e.message) }
      }
      if (docs.data.length < 100) break
    }
    results.push({ collection: name, deleted })
  }
  const total = results.reduce((s, r) => s + r.deleted, 0)
  return { success: true, message: '共删除 ' + total + ' 条记录', data: results }
}
