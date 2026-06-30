// cloudfunctions/generatePlayerCard/index.js
// 球员卡云函数 - 头像裁剪+AI抠图+卡片合成
// 模板尺寸：500x700像素

const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// ===== 千问API配置 =====
const QWEN_API_KEY = process.env.QWEN_API_KEY || ''

// 卡片背景（云存储地址）
const CARD_BG = {
  bronze: 'cloud://cloud1-7g8ckb3c7815a011.636c-cloud1-7g8ckb3c7815a011-1419431905/player-cards/bronze-card.png',
  silver: 'cloud://cloud1-7g8ckb3c7815a011.636c-cloud1-7g8ckb3c7815a011-1419431905/player-cards/silver-card.png',
  gold: 'cloud://cloud1-7g8ckb3c7815a011.636c-cloud1-7g8ckb3c7815a011-1419431905/player-cards/gold-card.png'
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { identityCardId, playerId, avatarUrl, tier = 'bronze' } = event

  try {
    let playerData = event
    if (identityCardId) {
      const db = cloud.database()
      const res = await db.collection('identity_cards').doc(identityCardId).get()
      playerData = { ...res.data }
    } else if (playerId) {
      const db = cloud.database()
      const res = await db.collection('player_cards').doc(playerId).get()
      playerData = { ...res.data }
    }

    let processedAvatarUrl = avatarUrl || playerData.avatarUrl || playerData.photoUrl || playerData.photo || ''
    if (processedAvatarUrl && processedAvatarUrl.startsWith('cloud://')) {
      try {
        processedAvatarUrl = await callQwenSegmentation(processedAvatarUrl)
      } catch (err) {
        console.error('头像处理失败:', err)
      }
    }

    return {
      success: true,
      cardData: {
        backgroundUrl: CARD_BG[tier] || CARD_BG.bronze,
        playerData: {
          number: String(playerData.jerseyNumber || playerData.number || ''),
          name: playerData.nickname || playerData.name || '',
          jerseyName: playerData.jerseyName || '',
          position: playerData.position || '',
          height: playerData.height || '',
          weight: playerData.weight || '',
          nationality: playerData.nationality || '中国',
          avatarUrl: processedAvatarUrl || playerData.photo || '',
          teamLogoUrl: playerData.teamLogo || ''
        }
      }
    }
  } catch (err) {
    console.error('球员卡生成失败:', err)
    return { success: false, error: err.message }
  }
}

async function callQwenSegmentation(imageUrl) {
  return new Promise(async (resolve, reject) => {
    if (!QWEN_API_KEY) {
      resolve(imageUrl)
      return
    }

    const requestBody = JSON.stringify({
      task_name: 'player_card_portrait',
      model: 'segmentation-portrait-1.0',
      input: { image_url: imageUrl }
    })

    const options = {
      hostname: 'dashscope.aliyuncs.com',
      path: '/api/v1/segmentation/portrait_matting',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + QWEN_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', async () => {
        try {
          const result = JSON.parse(data)
          if (result.code === 200 && result.data && result.data.image) {
            const imgBuffer = Buffer.from(result.data.image, 'base64')
            const outputPath = 'processed/avatar-' + Date.now() + '.png'
            const uploadRes = await cloud.uploadFile({
              cloudPath: outputPath,
              fileContent: imgBuffer
            })
            resolve(uploadRes.fileID)
          } else {
            resolve(imageUrl)
          }
        } catch (err) {
          reject(err)
        }
      })
    })

    req.on('error', reject)
    req.write(requestBody)
    req.end()
  })
}
