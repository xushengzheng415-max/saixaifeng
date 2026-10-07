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

function cellText(cell) {
  if (typeof cell?.words === 'string') return cell.words
  if (typeof cell?.word === 'string') return cell.word
  return (Array.isArray(cell?.words) ? cell.words : []).map(word => word.word || word.words || '').join(' ')
}
function index(value) { return Number(Array.isArray(value) ? value[0] : value) }
function marked(value, kind) {
  const text = String(value || '').replace(/\s/g, '')
  return kind === 'starter' ? /^[√✓✔勾]$/.test(text) : /^[○〇◯Oo０0]$/.test(text)
}
function parseTables(tableResult, textResult) {
  const teams = { home: [], away: [] }; const warnings = []
  const left = table => Math.min(...(table.table_location || []).map(point=>Number(point.x)).filter(Number.isFinite), Infinity)
  // Some providers split the two adjacent roster halves into separate tables.
  const tables=[...(tableResult.tables_result || [])].sort((a,b)=>left(a)-left(b))
  let singleHeaderCount=0
  for (const table of tables) {
    const cells = (table.body || []).map(cell => ({ row: index(cell.row_start ?? cell.row), col: index(cell.col_start ?? cell.column), text: cellText(cell) }))
    const names = cells.filter(cell => /队员姓名/.test(cell.text.replace(/\s/g, ''))).sort((a,b) => a.row-b.row || a.col-b.col)
    if (!names.length) continue
    const headers = names.slice(0, 2)
    for (let i=0; i<headers.length; i++) {
      const header=headers[i], side=headers.length===1 ? (singleHeaderCount++ % 2===0?'home':'away') : i===0 ? 'home' : 'away', start=header.col-1
      const rows=[...new Set(cells.filter(cell => cell.row>header.row).map(cell=>cell.row))].sort((a,b)=>a-b)
      for (const row of rows) {
        const get=offset => cells.find(cell=>cell.row===row && cell.col===start+offset)?.text.trim() || ''
        const sequence=get(0), name=get(1), number=get(2)
        if (!/^\d{1,3}$/.test(sequence) || !name || !/^\d{1,3}$/.test(number)) continue
        const starter=get(3), substitute=get(4), omitted=/^[×✕xX]$/.test(starter+substitute)
        let role=marked(starter,'starter') && !substitute ? 'starter' : marked(substitute,'substitute') && !starter ? 'substitute' : omitted ? 'absent' : 'unknown'
        const raw = { starter, substitute, identity:get(5), on:get(6), off:get(7), goals:get(8), yellow:get(9), red:get(10) }
        teams[side].push({ name, number, role, ...raw, captain:/^[cC]$/.test(raw.identity), goalkeeper:/^GK$/i.test(raw.identity) })
      }
    }
  }
  // The score comes only from the labelled result, never from filename or events.
  const allText=(textResult.words_result || []).map(row=>row.words || '').join(' ')
  const score=allText.match(/比赛结果\s*[:：]?\s*(\d{1,2})\s*[:：﹕]\s*(\d{1,2})/)
  if (!teams.home.length || !teams.away.length) warnings.push('部分名单未识别，请对照原图补充')
  if (!score) warnings.push('比分未识别，请填写')
  return { teams, score:score ? {home:Number(score[1]),away:Number(score[2])} : {home:null,away:null}, warnings }
}
let tokenCache = null
async function recognize(imageBase64) {
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
  const [table,text]=await Promise.all([request('/rest/2.0/ocr/v1/table'+query,{image}),request('/rest/2.0/ocr/v1/accurate_basic'+query,{image,detect_direction:'true'})])
  return { ...parseTables(table,text), imageHash:crypto.createHash('sha256').update(buffer).digest('hex'), buffer, extension:png?'png':'jpg' }
}
function signEvidence(evidence) {
  return crypto.createHmac('sha256',process.env.BAIDU_REFEREE_OCR_SECRET_KEY || '').update(JSON.stringify(evidence)).digest('hex')
}
function signImport(matchId, revision, data) {
  if (!process.env.SXF_PAPER_REPORT_SECRET) throw new Error('裁判表保存服务尚未配置')
  return crypto.createHmac('sha256',process.env.SXF_PAPER_REPORT_SECRET).update(JSON.stringify([String(matchId),Number(revision),data])).digest('hex')
}
module.exports={recognize,parseTables,signEvidence,signImport}
