const https = require('https')
const crypto = require('crypto')

// No provider request/response or credential values are logged.
function request(path, fields) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(fields).toString()
    const req = https.request({ hostname: 'aip.baidubce.com', path, method: 'POST', headers: {
      'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body)
    } }, res => {
      const chunks = []; let size = 0
      res.on('data', chunk => { size += chunk.length; if (size > 8 * 1024 * 1024) req.destroy(); else chunks.push(chunk) })
      res.on('error', () => reject(new Error('识别响应中断，请重试')))
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString())
          if (data.error_code || data.error || res.statusCode !== 200) {
            const code = Number(data.error_code)
            return reject(new Error([6, 17, 18, 19].includes(code) ? '百度表格识别权限或额度不足，请检查应用服务' : '百度识别未完成，请检查接口开通状态或重试'))
          }
          resolve(data)
        } catch (_) { reject(new Error('识别响应无法解析，请重试')) }
      })
    })
    req.on('error', () => reject(new Error('百度识别连接失败，请重试')))
    req.setTimeout(45000, () => req.destroy())
    req.end(body)
  })
}

const {parseTables,resolveTiming}=require('./refereeReportAnalysis.cjs')
let tokenCache = null
async function recognize(imageBase64,timing={}) {
  if (!process.env.BAIDU_REFEREE_OCR_API_KEY || !process.env.BAIDU_REFEREE_OCR_SECRET_KEY) throw new Error('裁判表识别尚未配置，请联系平台管理员')
  const image=String(imageBase64 || '').replace(/^data:image\/[^;]+;base64,/, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image) || image.length<200 || image.length>4*1024*1024) throw new Error('请选择不超过3MB的清晰照片')
  const buffer=Buffer.from(image,'base64')
  const jpeg=buffer[0]===0xff && buffer[1]===0xd8, png=buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  if (!jpeg && !png) throw new Error('仅支持 JPG、PNG 照片')
  if (!tokenCache || tokenCache.expires<Date.now()) {
    const auth=await request('/oauth/2.0/token',{grant_type:'client_credentials',client_id:process.env.BAIDU_REFEREE_OCR_API_KEY,client_secret:process.env.BAIDU_REFEREE_OCR_SECRET_KEY})
    if (!auth.access_token) throw new Error('百度应用授权失败，请检查配置')
    tokenCache={value:auth.access_token,expires:Date.now()+Math.min(Number(auth.expires_in || 3600),86400)*1000-60000}
  }
  const query='?access_token='+encodeURIComponent(tokenCache.value)
  const [table,text,handwriting]=await Promise.all([request('/rest/2.0/ocr/v1/table'+query,{image}),request('/rest/2.0/ocr/v1/accurate'+query,{image,detect_direction:'true',probability:'true'}),request('/rest/2.0/ocr/v1/handwriting'+query,{image,recognize_granularity:'big',eng_granularity:'word'}).catch(()=>null)])
  const analysis=parseTables(table,text,timing,handwriting)
  if(!handwriting)analysis.warnings.push('手写增强暂不可用，请核对手写分钟')
  return { ...analysis, imageHash:crypto.createHash('sha256').update(buffer).digest('hex'), buffer, extension:png?'png':'jpg' }
}
function signEvidence(evidence) {
  return crypto.createHmac('sha256',process.env.BAIDU_REFEREE_OCR_SECRET_KEY || '').update(JSON.stringify(evidence)).digest('hex')
}
function signImport(matchId, revision, data) {
  if (!process.env.SXF_PAPER_REPORT_SECRET) throw new Error('裁判表保存服务尚未配置')
  return crypto.createHmac('sha256',process.env.SXF_PAPER_REPORT_SECRET).update(JSON.stringify([String(matchId),Number(revision),data])).digest('hex')
}
module.exports={recognize,parseTables,resolveTiming,signEvidence,signImport}
