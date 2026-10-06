// 云函数入口文件 - 清空数据库
const cloud = require('wx-server-sdk')

// 指定环境ID
cloud.init({
  env: 'cloud1-7g8ckb3c7815a011'
})

const db = cloud.database()

// 需要清空的集合列表（包含所有相关集合）
const collections = [
  'users',
  'teams',
  'players',
  'identity_cards',
  'player_cards',
  'tournaments',
  'tournament_teams',
  'tournament_groups',
  'matches',
  'management'
]

// 云函数入口函数
exports.main = async (event, context) => {
  const { collections: targetCollections, clearAll } = event
  let collectionsToClear = collections
  
  // 如果指定了要清空的集合
  if (targetCollections && Array.isArray(targetCollections)) {
    collectionsToClear = targetCollections
  }
  
  const results = []
  console.log('开始清空以下集合:', collectionsToClear)
  
  try {
    for (const collectionName of collectionsToClear) {
      try {
        console.log(`正在清空集合: ${collectionName}`)
        
        let deleted = 0
        
        // 分批删除（每次最多100条）
        while (true) {
          // 获取一批文档
          const docs = await db.collection(collectionName).limit(100).get()
          
          if (docs.data.length === 0) {
            console.log(`集合 ${collectionName} 为空或已清空`)
            break
          }
          
          // 删除这批文档
          for (const doc of docs.data) {
            try {
              await db.collection(collectionName).doc(doc._id).remove()
              deleted++
            } catch (e) {
              console.error(`删除文档 ${doc._id} 失败:`, e.message)
            }
          }
          
          console.log(`  ${collectionName}: 已删除 ${deleted} 条`)
          
          // 如果不足100条，说明删完了
          if (docs.data.length < 100) break
        }
        
        results.push({
          collection: collectionName,
          deleted: deleted,
          status: 'success'
        })
        
      } catch (err) {
        console.error(`清空集合 ${collectionName} 失败:`, err)
        results.push({
          collection: collectionName,
          deleted: 0,
          status: 'error',
          error: err.message
        })
      }
    }
    
    const successCount = results.filter(r => r.status === 'success').length
    const totalDeleted = results.reduce((sum, r) => sum + r.deleted, 0)
    
    console.log(`清空完成！成功 ${successCount} 个集合，共删除 ${totalDeleted} 条记录`)
    
    return {
      success: true,
      message: `已清空 ${successCount} 个集合，共删除 ${totalDeleted} 条记录`,
      data: {
        results: results,
        totalDeleted: totalDeleted
      }
    }
    
  } catch (err) {
    console.error('清空数据库失败:', err)
    return {
      success: false,
      message: '清空失败: ' + err.message,
      error: err.message
    }
  }
}