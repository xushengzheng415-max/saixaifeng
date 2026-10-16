const clean=value=>String(value || '').normalize('NFKC').replace(/\s/g,'')
const median=values=>{const v=values.filter(Number.isFinite).sort((a,b)=>a-b);return v.length?v[Math.floor(v.length/2)]:0}
function text(cell){return typeof cell.words==='string'?cell.words:typeof cell.word==='string'?cell.word:(cell.words || []).map(w=>w.word || w.words || '').join(' ')}
function point(cell){const p=cell.cell_location || [];return {x:median(p.map(p=>p.x)),y:median(p.map(p=>p.y))}}
function inside(x,y,polygon){let yes=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)yes=!yes}return yes}
function token(row,source){const p=row.location;return p?{text:String(row.words || ''),p,source,x:p.left+p.width/2,y:p.top+Math.min(p.height,14)/2}:null}
function exactMark(value,kind){const s=clean(value);return kind==='starter'?/^[√✓✔Vv]$/.test(s):/^[○〇◯Oo0]$/.test(s)}
function normalizeMinute(value,timing,kind){
  const original=String(value || '').trim(),s=clean(original).replace(/[′'’`]/g,'');const notes=[]
  if(!s)return {value:'',notes}
  if(['中场','半场','中场休息','半场休息','中畅','中扬','场'].includes(s)||(['on','off'].includes(kind)&&(['半','中'].includes(s)||/^[√✓✔Vv↑↓]+$/.test(s)))){
    if(['on','off'].includes(kind)&&Number.isFinite(timing.halfMinutes)&&timing.halfMinutes>0){notes.push(`“${original}”按中场解析为${timing.halfMinutes}′`);return {value:String(timing.halfMinutes),notes}}
    return {value:original,notes:['中场分钟缺少可靠设置，请填写']}
  }
  const max=Number.isFinite(timing.totalMinutes)?Math.min(150,timing.totalMinutes+15):150
  if(/^\d{4}$/.test(s)&&['goals','yellow','red'].includes(kind)){
    const a=Number(s.slice(0,2)),b=Number(s.slice(2));if(a<=max&&b<=max){notes.push(`连续数字“${original}”拆为${a}′、${b}′，请核对`);return {value:`${a},${b}`,notes}}
  }
  const parts=s.replace(/[，;；、]/g,',').split(',')
  if(parts.every(p=>/^\d{1,3}$/.test(p)&&Number(p)<=150))return {value:parts.map(Number).join(','),notes}
  return {value:original,notes:[`“${original}”无法确定分钟，请核对原图`]}
}
function scoreFromLocations(textResult,handwriting){
  const rows=[...(textResult.words_result || []),...(handwriting?.words_result || [])]
  for(const row of rows){const direct=clean(row.words).match(/比赛结果[:：]?(\d{1,2})[:：](\d{1,2})/);if(direct)return {home:Number(direct[1]),away:Number(direct[2])}}
  const label=rows.find(row=>/比赛结果/.test(row.words || '')&&row.location)
  if(!label)return {home:null,away:null}
  const p=label.location,left=p.left+p.width
  const next=rows.filter(row=>/加时赛|点球决胜/.test(row.words || '')&&row.location&&row.location.left>left&&Math.abs(row.location.top-p.top)<60).sort((a,b)=>a.location.left-b.location.left)[0]
  const right=next?.location.left || left+Math.max(150,p.width*2)
  const candidates=rows.filter(row=>row.location&&/^\d{1,2}$/.test(clean(row.words))&&row.location.left>=left-3&&row.location.left<right&&Math.abs(row.location.top-p.top)<65)
  const unique=[]
  for(const row of candidates.sort((a,b)=>a.location.left-b.location.left))if(!unique.some(old=>Math.abs(old.location.left-row.location.left)<15))unique.push(row)
  return unique.length===2?{home:Number(clean(unique[0].words)),away:Number(clean(unique[1].words))}:{home:null,away:null}
}
function resolveTiming(match={},division={},tournament={}){
  const snapshot=match.durationRulesSnapshot || (match.rulesSnapshot?.schemaVersion==='football-match-duration/1'?match.rulesSnapshot:null)
  if(snapshot){const half=snapshot.minutesBasis==='period'&&Number(snapshot.periodCount)===2?Number(snapshot.minutes):null;return {halfMinutes:half,totalMinutes:Number(snapshot.totalMinutes)||null,source:'match_snapshot',needsReview:half==null}}
  const owner=division?._id?division:tournament,rules=owner.activeRulesSnapshot || owner.rulesSnapshot || owner
  const raw=Number(rules.matchMinutes ?? owner.matchMinutes),mode=rules.periodMode || owner.periodMode
  const half=mode==='halves'&&raw>0?(rules.matchMinutesBasis==='total'?raw/2:raw):null
  const historical=['finished','completed','archived','ended'].includes(String(match.status || '').toLowerCase())
  return {halfMinutes:half,totalMinutes:half!=null?half*2:null,source:division?._id?'division_settings':'tournament_settings',needsReview:historical,ruleVersion:String(owner.activeRulesVersion || owner.rulesVersion || '')}
}
function parseTables(tableResult,textResult,timing={},handwriting=null){
  const teams={home:[],away:[]},warnings=[]
  const accurate=(textResult.words_result || []).map(row=>token(row,'accurate')).filter(Boolean)
  const handwritten=(handwriting?.words_result || []).map(row=>token(row,'handwriting')).filter(Boolean)
  let singleSide=0
  const left=t=>Math.min(...(t.table_location || []).map(p=>p.x),Infinity)
  for(const table of [...(tableResult.tables_result || [])].sort((a,b)=>left(a)-left(b))){
    const cells=(table.body || []).map(c=>({...c,r:Number(Array.isArray(c.row_start)?c.row_start[0]:c.row_start),c:Number(Array.isArray(c.col_start)?c.col_start[0]:c.col_start),ce:Number(c.col_end),text:text(c),center:point(c)}))
    const headers=cells.filter(c=>/队员姓名/.test(clean(c.text))).sort((a,b)=>a.c-b.c).slice(0,2)
    if(!headers.length)continue
    const lower=Math.max(...cells.filter(c=>c.r>headers[0].r&&c.ce-c.c===1).flatMap(c=>(c.cell_location || []).map(p=>p.y)),0)
    function colAt(t){
      let best=null
      for(const col of [...new Set(cells.filter(c=>c.ce-c.c===1&&c.r>=headers[0].r).map(c=>c.c))]){
        const list=cells.filter(c=>c.c===col&&c.ce-c.c===1&&c.r>=headers[0].r)
        const near=list.slice().sort((a,b)=>Math.abs(a.center.y-t.y)-Math.abs(b.center.y-t.y))[0]
        if(!near?.cell_location?.length)continue
        const xs=near.cell_location.map(p=>p.x),min=Math.min(...xs),max=Math.max(...xs),distance=Math.abs(t.x-(min+max)/2)/Math.max(1,max-min)
        if(distance<=0.57&&(!best||distance<best.distance))best={col,distance}
      }
      return best?.col
    }
    for(const [hi,header] of headers.entries()){
      const side=headers.length===1?(singleSide++%2?'away':'home'):hi?'away':'home',start=header.c-1
      const combinedMark=cells.some(c=>c.r===header.r&&c.c===start+3&&/说明/.test(clean(c.text))) || cells.some(c=>c.r===header.r&&c.c>=start+7&&c.c<=start+9&&/进球[123一二三]/.test(clean(c.text)))
      const splitGoals=cells.some(c=>c.r===header.r&&c.c>=start+7&&c.c<=start+11&&(/进球[123一二三]/.test(clean(c.text))||c.c===start+11&&/红牌/.test(clean(c.text))))
      const columns=combinedMark?(splitGoals?{identity:4,on:5,off:6,goals:[7,8,9],yellow:10,red:11}:{identity:4,on:5,off:6,goals:[7],yellow:8,red:9}):{identity:5,on:6,off:7,goals:[8],yellow:9,red:10}
      const minuteStart=columns.on
      const upper=Math.min(...(header.cell_location || []).map(p=>p.y))+10
      const inBody=t=>t.p.top>=upper&&t.p.top<lower-8
      const numberTokens=accurate.filter(t=>inBody(t)&&colAt(t)===start+2&&/^\d{1,3}$/.test(clean(t.text)))
      const numberCells=cells.filter(c=>c.r>header.r&&c.c===start+2&&/^\d{1,3}$/.test(clean(c.text))).sort((a,b)=>a.center.y-b.center.y)
      const anchors=numberCells.map(c=>{const candidates=numberTokens.filter(t=>clean(t.text)===clean(c.text));const t=candidates.sort((a,b)=>Math.abs(a.y-c.center.y)-Math.abs(b.y-c.center.y))[0];return {number:clean(c.text),y:t?.y ?? c.center.y,estimated:!t}})
      const gap=median(anchors.slice(1).map((a,i)=>a.y-anchors[i].y)) || 32
      for(let i=0;i<anchors.length;i++)if(anchors[i].estimated&&i>0&&i<anchors.length-1)anchors[i].y=(anchors[i-1].y+anchors[i+1].y)/2
      const names=accurate.map(t=>({...t,text:clean(t.text).replace(/(?<=[\p{Script=Han}])[yYvV√✓✔]+$/u,'')})).filter(t=>inBody(t)&&colAt(t)===start+1&&/^[\p{Script=Han}·]{2,8}$/u.test(clean(t.text))&&!/队员|主教练|签名|领队|人员|队医|比赛|球衣/.test(t.text)).sort((a,b)=>a.p.top-b.p.top)
      const alignedNames=names.length===anchors.length?names:anchors.map(a=>names.slice().sort((l,r)=>Math.abs(l.y-a.y+10)-Math.abs(r.y-a.y+10))[0])
      if(names.length!==anchors.length)warnings.push(`${side==='home'?'主队':'客队'}姓名识别不完整，请核对号码对应关系`)
      for(let i=0;i<anchors.length;i++){
        const uncorroborated=[]
        const get=offset=>{
          const cell=cells.find(c=>c.r===numberCells[i].r&&c.c===start+offset&&c.ce-c.c===1)
          const tableText=cell?.text.trim() || ''
          const candidates=[...accurate,...handwritten].filter(t=>cell?.cell_location&&inside(t.x,t.p.top+t.p.height/2,cell.cell_location)&&!(/首发|替补|身份|换上|换下|进球|黄牌|红牌|签名|球衣/.test(t.text)))
          if(offset===3||(!combinedMark&&offset===4)){if(tableText)return tableText;return candidates.find(t=>combinedMark?(exactMark(t.text,'starter')||exactMark(t.text,'substitute')):exactMark(t.text,offset===3?'starter':'substitute'))?.text || ''}
          if(offset===columns.identity&&/^(GK|C|S)$/i.test(clean(tableText)))return tableText
          if(offset>=minuteStart&&tableText&&!/球衣|签名/.test(tableText)){
            if(/[中场半]/.test(tableText)){const mid=candidates.find(t=>/中场|半场/.test(t.text));if(mid)return mid.text}
            if(offset>=columns.goals[0]&&/^\d+$/.test(clean(tableText))&&!candidates.some(t=>clean(t.text).replace(/[′'’]/g,'')===clean(tableText)))uncorroborated.push(offset)
            return tableText
          }
          if(offset>=minuteStart)return candidates.filter(t=>t.source==='handwriting'&&!cells.some(other=>other.c===start+offset&&Math.abs(other.r-numberCells[i].r)<=1&&other.r!==numberCells[i].r&&clean(other.text)===clean(t.text))).map(t=>t.text).join(',')
          if(!candidates.length)return ''
          const best=candidates.slice().sort((a,b)=>{
            const recognized=t=>offset===3?exactMark(t.text,'starter'):offset===4?exactMark(t.text,'substitute'):offset===columns.identity?/^(GK|C|S)$/i.test(clean(t.text)):/\d|中场|半场/.test(clean(t.text))
            return Number(recognized(b))-Number(recognized(a)) || Number(b.source==='handwriting')-Number(a.source==='handwriting')
          })[0]
          return best.text
        }
        const starter=get(3),substitute=combinedMark?starter:get(4),identity=get(columns.identity)
        const isStarter=exactMark(starter,'starter'),isSubstitute=exactMark(substitute,'substitute')
        const role=isStarter&&!isSubstitute?'starter':isSubstitute&&!isStarter?'substitute':/^[×✕xX]$/.test(clean(starter+substitute))?'absent':'unknown'
        const raw={starter,substitute,identity,on:get(columns.on),off:get(columns.off),goals:columns.goals.map(get).filter(Boolean).join(','),yellow:get(columns.yellow),red:get(columns.red)},reviewNotes=[]
        const entry={name:alignedNames[i]?.text || '',number:anchors[i].number,role,captain:/^C$/i.test(clean(identity)),goalkeeper:/^GK$/i.test(clean(identity)),rawFields:raw,reviewNotes}
        for(const field of ['on','off','goals','yellow','red']){const normalized=normalizeMinute(raw[field],timing,field);entry[field]=normalized.value;reviewNotes.push(...normalized.notes)}
        for(const offset of uncorroborated){const field=columns.goals.includes(offset)?'goals':offset===columns.yellow?'yellow':offset===columns.red?'red':null;if(!field)continue;reviewNotes.push(`原文候选“${raw[field]}”缺少位置复核，请确认`);entry[field]='?'}
        if(!combinedMark&&role==='substitute'&&starter)reviewNotes.push('首发栏有涂改，按替补标记解析，请核对')
        if(entry.on&&entry.off&&/^\d+$/.test(entry.on)&&/^\d+$/.test(entry.off)&&Number(entry.off)<=Number(entry.on))reviewNotes.push('换下时间不晚于换上时间，请核对')
        if(role==='unknown')reviewNotes.push('首发、替补标记不清，请核对')
        if(names.length!==anchors.length)reviewNotes.push('姓名与号码需核对')
        teams[side].push(entry)
      }
    }
  }
  const score=scoreFromLocations(textResult,handwriting)
  if(!teams.home.length||!teams.away.length)warnings.push('部分名单未识别，请对照原图补充')
  if(score.home==null||score.away==null)warnings.push('比分未识别，请填写')
  if(timing.halfMinutes==null)warnings.push('缺少半场时长，中场换人须填写分钟')
  if(timing.needsReview)warnings.push('历史比赛缺少赛前时长快照，请核对中场分钟')
  const parsedGoals=Object.fromEntries(['home','away'].map(side=>[side,teams[side].reduce((sum,row)=>sum+(/^\d{1,3}(?:,\d{1,3})*$/.test(row.goals)?row.goals.split(',').length:0),0)]))
  if(score.home!=null&&(parsedGoals.home!==score.home||parsedGoals.away!==score.away))warnings.push('比分与已解析进球次数不一致，请核对进球分钟')
  return {teams,score,timing,warnings:[...new Set(warnings)],analysisVersion:'referee-report-analysis/2'}
}
module.exports={parseTables,normalizeMinute,resolveTiming,scoreFromLocations}
