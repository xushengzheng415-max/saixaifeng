const https = require('https')
const crypto = require('crypto')

// No provider request/response or credential values are logged.
function request(path, fields,timeout=45000) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(fields).toString()
    const req = https.request({ hostname: 'aip.baidubce.com', path, method: 'POST', headers: {
      'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body)
    } }, res => {
      const chunks = []; let size = 0
      res.on('data', chunk => { size += chunk.length; if (size > 8 * 1024 * 1024) req.destroy(new Error('OCR_RESPONSE_LIMIT')); else chunks.push(chunk) })
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
    req.setTimeout(timeout, () => req.destroy(new Error('OCR_TIMEOUT')))
    req.end(body)
  })
}

const {parseTables,resolveTiming}=require('./refereeReportAnalysis.cjs')
let tokenCache = null
async function recognizeImageSet(image,query,timeoutFor){
  // Table structure is the largest response. Finish it first so its request
  // body is no longer live when the two text requests start.
  const table=await request('/rest/2.0/ocr/v1/table'+query,{image},timeoutFor()).catch(()=>null)
  const timeout=timeoutFor()
  const [accurate,handwriting]=await Promise.allSettled([
    request('/rest/2.0/ocr/v1/accurate'+query,{image,detect_direction:'true',probability:'true'},timeout),
    request('/rest/2.0/ocr/v1/handwriting'+query,{image,recognize_granularity:'big',eng_granularity:'word'},timeout)
  ])
  return [table,accurate.status==='fulfilled'?accurate.value:null,handwriting.status==='fulfilled'?handwriting.value:null]
}
async function recognize(imageBase64,timing={},options={}) {
  // 总预算：小程序经 getMiniWorkspace 中转，微信侧约 60~65 秒必断，故中转调用只给 45 秒；
  // PC 直连 HTTP 仍用 105 秒，识别质量不受影响。
  const budget=Math.min(Number(options.budgetMs)||105000,105000)
  const deadline=Date.now()+budget
  const headroom=Math.min(30000,Math.round(budget*0.3))
  const mainTimeout=Math.min(45000,Math.max(12000,budget-20000))
  const stageTimeout=Math.min(18000,Math.max(8000,Math.round(budget*0.35)))
  // 任何一步都按剩余时间封顶，保证在预算内一定返回，绝不把整包拖到微信中转超时
  const cap=ms=>Math.max(3000,Math.min(ms,deadline-Date.now()-3000))
  const startedAt=Date.now()
  const trace=(label,since)=>console.log('[refereeOcr] '+label+' cost='+(Date.now()-since)+'ms total='+(Date.now()-startedAt)+'ms')
  if (!process.env.BAIDU_REFEREE_OCR_API_KEY || !process.env.BAIDU_REFEREE_OCR_SECRET_KEY) throw new Error('裁判表识别尚未配置，请联系平台管理员')
  const image=String(imageBase64 || '').replace(/^data:image\/[^;]+;base64,/, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image) || image.length<200 || image.length>4*1024*1024) throw new Error('请选择不超过3MB的清晰照片')
  const buffer=Buffer.from(image,'base64')
  const jpeg=buffer[0]===0xff && buffer[1]===0xd8, png=buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  if (!jpeg && !png) throw new Error('仅支持 JPG、PNG 照片')
  let mark=Date.now()
  if (!tokenCache || tokenCache.expires<Date.now()) {
    const auth=await request('/oauth/2.0/token',{grant_type:'client_credentials',client_id:process.env.BAIDU_REFEREE_OCR_API_KEY,client_secret:process.env.BAIDU_REFEREE_OCR_SECRET_KEY},Math.min(10000,budget))
    if (!auth.access_token) throw new Error('百度应用授权失败，请检查配置')
    tokenCache={value:auth.access_token,expires:Date.now()+Math.min(Number(auth.expires_in || 3600),86400)*1000-60000}
  }
  trace('token',mark);mark=Date.now()
  const query='?access_token='+encodeURIComponent(tokenCache.value)
  // The three providers previously held three encoded copies of the original
  // image at once. Keep table parsing first, then run only the two text reads
  // together; a failed route still does not fail the whole recognition.
  let [table,text,handwriting]=await recognizeImageSet(image,query,()=>cap(mainTimeout))
  trace('mainOcr',mark);mark=Date.now()
  let analysis
  try{analysis=parseTables(table || {},text || {},timing,handwriting,options)}catch(error){analysis=parseTables({},text || {},timing,handwriting,options)}
  if(!table){
    if(!Array.isArray(analysis.warnings))analysis.warnings=[]
    analysis.warnings.push('表格结构未识别，请换一张更清晰的裁判表重试')
  }
  let processingBuffer=buffer,transform=null
  const imageTools=require('./refereeReportImage.cjs'),size=require('./refereeGoalFocus.cjs').dimensions(buffer)
  let crops=[],teamTransforms={}
  if(table&&Date.now()<deadline-headroom){try{crops=imageTools.teamCrops(buffer,table,analysis)}catch(error){analysis.warnings.push('主客队局部未读取，请核对名单')}}
  if(crops.length){
    const results=[]
    // Process home/away crops one at a time. Each crop may load the native
    // renderer and two OCR responses, so parallel crops caused the largest
    // production memory spike.
    for(const crop of crops){
      if(Date.now()>=deadline-6000){results.push({crop,error:true});continue}
      const cropTimeout=cap(stageTimeout)
      try{const image=crop.buffer.toString('base64'),[t,a,h]=await recognizeImageSet(image,query,()=>Math.min(cropTimeout,cap(stageTimeout)))
        if(!t&&!a)throw new Error('CROP_OCR_EMPTY')
        const next=parseTables(t,a,timing,h,{...options,sourceSide:crop.side});imageTools.uploadedRegions(next,size,crop.transform)
        results.push({crop,next})
      }catch(error){results.push({crop,error:true})}
    }
    for(const {crop,next,error} of results){
      if(!error&&next.teams[crop.side].length>=analysis.teams[crop.side].length){const merged={...analysis,teams:{...analysis.teams,[crop.side]:next.teams[crop.side]}};analysis=imageTools.retainClearGoals(analysis,merged);teamTransforms[crop.side]=crop.transform}
      else analysis.warnings.push((crop.side==='home'?'主队':'客队')+'局部识别未完成，请核对名单')
    }
    if(analysis.teams.home.length&&analysis.teams.away.length)analysis.warnings=analysis.warnings.filter(w=>w!=='部分名单未识别，请对照原图补充')
  }
  trace('teamCrops',mark);mark=Date.now()
  if(!crops.length&&table&&Date.now()<deadline-headroom){
    let prepared=null
    try{prepared=imageTools.normalize(buffer,table)}catch(error){analysis.warnings.push('图片局部未读取，可选择原图重试')}
    if(prepared){try{
      const normalized=prepared.buffer.toString('base64'),retryTimeout=cap(stageTimeout)
      const [newTable,newText,newHandwriting]=await recognizeImageSet(normalized,query,()=>Math.min(retryTimeout,cap(stageTimeout)))
      if(!newTable&&!newText)throw new Error('NORMALIZED_OCR_EMPTY')
      const next=parseTables(newTable,newText,timing,newHandwriting,options)
      if(['home','away'].every(side=>next.teams[side].length>=analysis.teams[side].length)){
        const previousScore=analysis.score,currentScore=next.score
        if(previousScore.home!=null&&previousScore.away!=null){next.score=currentScore.home!=null&&(previousScore.home!==currentScore.home||previousScore.away!==currentScore.away)?{home:null,away:null}:previousScore}
        analysis=imageTools.retainClearGoals(analysis,next);transform=prepared.transform;imageTools.uploadedRegions(analysis,size,transform)
        table=newTable;text=newText;handwriting=newHandwriting
        if(analysis.score.home!=null)analysis.warnings=analysis.warnings.filter(warning=>warning!=='比分未识别，请填写')
      }
    }catch(error){analysis.warnings.push('表格放大识别未完成，可选择原图重试')}}
  }
  trace('normalizeRetry',mark);mark=Date.now()
  if(options.circledGoals===true)analysis=await require('./refereeGoalFocus.cjs').enhance(analysis,processingBuffer,(mode,image)=>request('/rest/2.0/ocr/v1/'+mode+query,mode==='handwriting'?{image,recognize_granularity:'big',eng_granularity:'word'}:{image,detect_direction:'true',probability:'true'},cap(Math.min(10000,stageTimeout))),Math.min(deadline-3000,Date.now()+Math.min(35000,Math.round(budget*0.3))))
  trace('circledGoals',mark);mark=Date.now()
  imageTools.uploadedRegions(analysis,size,null)
  analysis.imageQuality={width:size.width,height:size.height,bytes:buffer.length,lowResolution:Math.min(size.width,size.height)<900,normalized:!!transform||!!Object.keys(teamTransforms).length,transform,teamTransforms,regionCoordinateSpace:'uploaded_image',teamSeparation:'grid_panels/1'}
  analysis.analysisVersion='referee-report-analysis/7'
  if(!handwriting)analysis.warnings.push('手写增强暂不可用，请核对手写分钟')
  trace('done',startedAt)
  return { ...analysis, imageHash:crypto.createHash('sha256').update(buffer).digest('hex') }
}
function signEvidence(evidence) {
  return require('./paperReportProof.cjs').signEvidence(process.env.BAIDU_REFEREE_OCR_SECRET_KEY,evidence)
}
function verifyEvidence(evidence,proof){return require('./paperReportProof.cjs').verifyEvidence(process.env.BAIDU_REFEREE_OCR_SECRET_KEY,evidence,proof)}
function signImport(matchId, revision, data) {
  if (!process.env.SXF_PAPER_REPORT_SECRET) throw new Error('裁判表保存服务尚未配置')
  return require('./paperReportProof.cjs').signImport(process.env.SXF_PAPER_REPORT_SECRET,matchId,revision,data)
}
module.exports={recognize,parseTables,resolveTiming,signEvidence,verifyEvidence,signImport}
