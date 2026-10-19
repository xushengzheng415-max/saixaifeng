const clean=value=>String(value || '').normalize('NFKC').replace(/\s/g,'')
const median=values=>{const v=values.filter(Number.isFinite).sort((a,b)=>a-b);return v.length?v[Math.floor(v.length/2)]:0}
function text(cell){return typeof cell.words==='string'?cell.words:typeof cell.word==='string'?cell.word:(cell.words || []).map(w=>w.word || w.words || '').join(' ')}
function point(cell){const p=cell.cell_location || [];return {x:median(p.map(p=>p.x)),y:median(p.map(p=>p.y))}}
function region(cells){const points=cells.flatMap(cell=>cell.cell_location || []).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));if(!points.length)return null;const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return {left:Math.floor(Math.min(...xs)-3),top:Math.floor(Math.min(...ys)-3),width:Math.ceil(Math.max(...xs)-Math.min(...xs)+6),height:Math.ceil(Math.max(...ys)-Math.min(...ys)+6)}}
function inside(x,y,polygon){let yes=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)yes=!yes}return yes}
function token(row,source){const p=row.location;return p?{text:String(row.words || ''),p,source,x:p.left+p.width/2,y:p.top+Math.min(p.height,14)/2}:null}
function exactMark(value,kind){const s=clean(value);return kind==='starter'?/^[√✓✔Vv]$/.test(s):/^[○〇◯Oo0]$/.test(s)}
function normalizeMinute(value,timing,kind){
  const original=String(value || '').trim(),numbered=/[①-⑳❶-❿]|[（(]\d{1,2}[)）](?=\s*\d)/.test(original),withoutOrdinals=original.replace(/[①-⑳❶-❿]/g,',').replace(/[（(]\d{1,2}[)）](?=\s*\d)/g,',');const s=clean(withoutOrdinals).replace(/[′'’`]/g,'').replace(/^,+|,+$/g,'');const notes=[]
  if(!s)return {value:numbered?'?':'',notes}
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
  const directScores=[...new Set(rows.flatMap(row=>{const match=clean(row.words).match(/比赛结果[:：]?(\d{1,2})[:：](\d{1,2})/);return match?[Number(match[1])+':'+Number(match[2])]:[]}))]
  if(directScores.length===1){const values=directScores[0].split(':').map(Number);return {home:values[0],away:values[1]}}
  if(directScores.length>1)return {home:null,away:null}
  const label=rows.find(row=>/比赛结果/.test(row.words || '')&&row.location)
  if(!label)return {home:null,away:null}
  const p=label.location,left=p.left+p.width
  const next=rows.filter(row=>/加时赛|点球决胜/.test(row.words || '')&&row.location&&row.location.left>left&&Math.abs(row.location.top-p.top)<60).sort((a,b)=>a.location.left-b.location.left)[0]
  const right=next?.location.left || left+Math.max(150,p.width*2)
  const colonScores=[...new Set(rows.filter(row=>row.location&&row.location.left>=left-3&&row.location.left<right&&Math.abs(row.location.top-p.top)<65).flatMap(row=>{const match=clean(row.words).match(/^(\d{1,2})[:：](\d{1,2})$/);return match?[Number(match[1])+':'+Number(match[2])]:[]}))]
  if(colonScores.length===1){const values=colonScores[0].split(':').map(Number);return {home:values[0],away:values[1]}}
  if(colonScores.length>1)return {home:null,away:null}
  const candidates=rows.filter(row=>row.location&&/^\d{1,2}$/.test(clean(row.words))&&row.location.left>=left-3&&row.location.left<right&&Math.abs(row.location.top-p.top)<65)
  const unique=[]
  for(const row of candidates.sort((a,b)=>a.location.left-b.location.left)){
    const old=unique.find(old=>Math.abs(old.location.left-row.location.left)<15)
    if(old&&clean(old.words)!==clean(row.words))return {home:null,away:null}
    if(!old)unique.push(row)
  }
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
function parseTables(tableResult,textResult,timing={},handwriting=null,options={}){
  const teams={home:[],away:[]},warnings=[]
  const accurate=(textResult.words_result || []).map(row=>token(row,'accurate')).filter(Boolean)
  const handwritten=(handwriting?.words_result || []).map(row=>token(row,'handwriting')).filter(Boolean)
  let singleSide=0
  const left=t=>Math.min(...(t.table_location || []).map(p=>p.x),Infinity)
  for(const table of [...(tableResult.tables_result || [])].sort((a,b)=>left(a)-left(b))){
    const cells=(table.body || []).map(c=>({...c,r:Number(Array.isArray(c.row_start)?c.row_start[0]:c.row_start),c:Number(Array.isArray(c.col_start)?c.col_start[0]:c.col_start),ce:Number(c.col_end),text:text(c),center:point(c)}))
    const panels=require('./refereeReportPanels.cjs'),headers=panels.headers(cells)
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
      const side=(['home','away'].includes(options.sourceSide)?options.sourceSide:null) || header.teamSide || (headers.length===1?(singleSide++%2?'away':'home'):hi?'away':'home'),start=header.panelStart
      const end=header.panelEnd
      const headings=cells.filter(c=>Math.abs(c.r-header.r)<=1&&c.c>=start&&c.c<end)
      const column=pattern=>headings.filter(c=>pattern.test(clean(c.text))).sort((a,b)=>Math.abs(a.r-header.r)-Math.abs(b.r-header.r))[0]?.c
      const combined=column(/^(?:[说设]?明|出场|首替|首发[\/、和与]?替补)$/)
      const legacyCombined=combined!=null || cells.some(c=>c.r===header.r&&c.c>=start+7&&c.c<=start+9&&/进球[123一二三]/.test(clean(c.text)))
      const legacySplit=cells.some(c=>c.r===header.r&&c.c>=start+7&&c.c<=start+11&&(/进球[123一二三]/.test(clean(c.text))||c.c===start+11&&/红牌/.test(clean(c.text))))
      const fallback=legacyCombined?(legacySplit?{identity:4,on:5,off:6,goals:[7,8,9],yellow:10,red:11}:{identity:4,on:5,off:6,goals:[7],yellow:8,red:9}):{identity:5,on:6,off:7,goals:[8],yellow:9,red:10}
      const semanticGoals=[...new Set(headings.filter(c=>c.r===header.r&&/^(?:进球|入球|得分)[123一二三]?$/.test(clean(c.text))).map(c=>c.c))].sort((a,b)=>a-b)
      const goalColumns=semanticGoals.length?semanticGoals:fallback.goals.map(col=>start+col)
      // Older sheets have separate starter/bench columns; many paper sheets use
      // one mark column. Resolve semantic headings before falling back to layout.
      const numberColumn=column(/^(?:号码|号数|球衣号)$/) ?? start+2
      const columns={3:column(/^首发$/) ?? combined ?? start+3,4:column(/^替补$/) ?? combined ?? start+(legacyCombined?3:4),5:column(/^(?:身[份价]|队长门将)$/) ?? start+fallback.identity,6:column(/^(?:换上|黄上|上场|入场)$/) ?? start+fallback.on,7:column(/^(?:换下|下场|离场)$/) ?? start+fallback.off,8:goalColumns[0],9:column(/^(?:黄牌|警告)$/) ?? start+fallback.yellow,10:column(/^(?:红牌|罚下)$/) ?? start+fallback.red}
      const upper=Math.min(...(header.cell_location || []).map(p=>p.y))+10
      const inBody=t=>t.p.top>=upper&&t.p.top<lower-8
      const numberCells=cells.filter(c=>c.r>header.r&&c.c===numberColumn&&c.ce-c.c===1).sort((a,b)=>a.center.y-b.center.y)
      const validName=value=>{const name=clean(value);return /^[\p{Script=Han}·]{2,8}$/u.test(name)&&!/队员|主教练|主教炼|签名|领队|人员|队医|比赛|球衣/.test(name)?name:''}
      const tokensIn=(cell,source=accurate)=>cell?.cell_location?.length?source.filter(t=>inside(t.x,t.p.top+t.p.height/2,cell.cell_location)):[]
      const anchors=numberCells.map(cell=>{
        const nameCell=cells.find(other=>other.r===cell.r&&other.c===start+1&&other.ce-other.c===1)
        const tableNames=String(nameCell?.text || '').split(/[\n\r]+/).map(validName).filter(Boolean)
        const nameCandidates=[...new Set([...tableNames,...tokensIn(nameCell,[...accurate,...handwritten]).map(t=>validName(t.text)).filter(Boolean)])]
        const rawNumbers=[...tokensIn(cell).map(t=>clean(t.text)),clean(cell.text)]
        const numberCandidates=[...new Set(rawNumbers.filter(value=>/^\d{1,3}$/.test(value)).map(value=>String(Number(value))))]
        return {number:numberCandidates[0] || '',numberCandidates,nameCandidates,y:cell.center.y,hasIdentity:!!(nameCandidates.length||numberCandidates.length)}
      })
      if(anchors.some(row=>row.hasIdentity&&!row.nameCandidates.length))warnings.push((side==='home'?'主队':'客队')+'有姓名未识别，请核对标记球员')
      const firstIdentity=anchors.findIndex(row=>row.hasIdentity),lastIdentity=anchors.map(row=>row.hasIdentity).lastIndexOf(true)
      for(let i=0;i<anchors.length;i++){
        if(!anchors[i].hasIdentity&&(firstIdentity<0||i<firstIdentity||i>lastIdentity))continue
        const uncorroborated=[]
        const get=(offset,override)=>{
          const targetColumn=override ?? columns[offset] ?? start+offset
          if(targetColumn<start||targetColumn>=end)return ''
          const cell=cells.find(c=>c.r===numberCells[i].r&&c.c===targetColumn&&c.ce-c.c===1)
          const tableText=cell?.text.trim() || ''
          const candidates=[...accurate,...handwritten].filter(t=>cell?.cell_location&&inside(t.x,t.p.top+t.p.height/2,cell.cell_location)&&!(/首发|替补|身份|换上|换下|进球|黄牌|红牌|签名|球衣/.test(t.text)))
          if(offset===3||offset===4){
            if(/[①-⑳❶-❿]/.test(tableText))return tableText
            const marks=[tableText,...candidates.map(t=>t.text)],ticks=marks.filter(value=>exactMark(value,'starter')),circles=marks.filter(value=>/^[○〇◯Oo]$/.test(clean(value)))
            if(ticks.length&&circles.length)return '?'
            if(ticks.length)return ticks[0]
            if(circles.length)return circles[0]
            if(clean(tableText)==='0')return '?'
            if(tableText)return tableText
            return ''
          }
          if(offset===5&&/^(GK|C|S)$/i.test(clean(tableText)))return tableText
          if(offset>=6&&tableText&&!/球衣|签名/.test(tableText)){
            if(/[中场半]/.test(tableText)){const mid=candidates.find(t=>/中场|半场/.test(t.text));if(mid)return mid.text}
            if(offset>=8&&/^\d+$/.test(clean(tableText))&&!candidates.some(t=>clean(t.text).replace(/[′'’]/g,'')===clean(tableText)))uncorroborated.push(offset)
            return tableText
          }
          if(offset>=6)return candidates.filter(t=>t.source==='handwriting'&&!cells.some(other=>other.c===targetColumn&&Math.abs(other.r-numberCells[i].r)<=1&&other.r!==numberCells[i].r&&clean(other.text)===clean(t.text))).map(t=>t.text).join(',')
          if(!candidates.length)return ''
          const best=candidates.slice().sort((a,b)=>{
            const recognized=t=>offset===3?exactMark(t.text,'starter'):offset===4?exactMark(t.text,'substitute'):offset===5?/^(GK|C|S)$/i.test(clean(t.text)):/\d|中场|半场/.test(clean(t.text))
            return Number(recognized(b))-Number(recognized(a)) || Number(b.source==='handwriting')-Number(a.source==='handwriting')
          })[0]
          return best.text
        }
        const starter=get(3),substitute=get(4),identity=get(5)
        const numberMarks=[numberCells[i].text,...tokensIn(numberCells[i],[...accurate,...handwritten]).map(t=>t.text)]
        const displacedTick=numberMarks.some(value=>/[√✓✔]/.test(value)||/^[Vv]$/.test(clean(value)))
        const isStarter=exactMark(starter,'starter')||displacedTick,isSubstitute=exactMark(substitute,'substitute')
        let role=/^[×✕xX]+$/.test(clean(starter+substitute))?'absent':isStarter&&!isSubstitute?'starter':isSubstitute&&!isStarter?'substitute':'unknown'
        const mark=String(starter+substitute).trim()
        const blankAsBench=options.blankRoleAsBench===true && role==='unknown' && (!mark || /^[\s①-⑳❶-❿↑↓\d′'’、，,;；()（）]+$/.test(mark))
        if(blankAsBench)role='substitute'
        const raw={starter,substitute,identity,on:get(6),off:get(7),goals:goalColumns.map(col=>get(8,col)).filter(Boolean).join(','),yellow:get(9),red:get(10)},reviewNotes=[]
        const nameCandidates=anchors[i].nameCandidates
        const entry={name:nameCandidates[0] || '',nameCandidates,number:anchors[i].number,numberCandidates:anchors[i].numberCandidates,role,roleSource:blankAsBench?'blank_as_substitute':'recognized_mark',captain:/^C$/i.test(clean(identity)),goalkeeper:/^GK$/i.test(clean(identity)),rawFields:raw,reviewNotes}
        if(!entry.number)reviewNotes.push('号码未识别，请核对')
        // Keep the whole actual row, including identity and cross-column handwriting.
        // These coordinates are mapped back to the uploaded image after enhancement.
        const reviewCells=cells.filter(cell=>cell.r===numberCells[i].r&&cell.c>=start+1&&cell.c<end&&cell.ce<=end),headerCells=cells.filter(cell=>cell.r===header.r&&cell.c>=start+1&&cell.c<end&&cell.ce<=end)
        entry.reviewRegion=region(reviewCells);entry.reviewHeaderRegion=region(headerCells)
        entry.reviewPolygon=panels.polygon(reviewCells,entry.reviewRegion);entry.reviewHeaderPolygon=panels.polygon(headerCells,entry.reviewHeaderRegion);entry.evidenceSide=side
        const regionCells=cells.filter(cell=>cell.r===numberCells[i].r&&cell.c>=Math.min(columns[3],columns[5])&&cell.c<end)
        const regionPoints=regionCells.flatMap(cell=>cell.cell_location || [])
        if(regionPoints.length){const xs=regionPoints.map(p=>p.x),ys=regionPoints.map(p=>p.y);entry.sourceRegion={left:Math.max(0,Math.floor(Math.min(...xs)-3)),top:Math.max(0,Math.floor(Math.min(...ys)-4)),width:Math.ceil(Math.max(...xs)-Math.min(...xs)+6),height:Math.ceil(Math.max(...ys)-Math.min(...ys)+8)}}
        const markCell=cells.find(cell=>cell.r===numberCells[i].r&&cell.c===columns[3])
        if(markCell?.cell_location?.length){const xs=markCell.cell_location.map(p=>p.x),ys=markCell.cell_location.map(p=>p.y);entry.markRegion={left:Math.floor(Math.min(...xs)),top:Math.floor(Math.min(...ys)),width:Math.ceil(Math.max(...xs)-Math.min(...xs)),height:Math.ceil(Math.max(...ys)-Math.min(...ys))}}
        if(blankAsBench && mark)reviewNotes.push('按未打钩默认替补，旁注仍需核对')
        for(const field of ['on','off','goals','yellow','red']){const normalized=normalizeMinute(raw[field],timing,field);entry[field]=normalized.value;reviewNotes.push(...normalized.notes)}
        for(const offset of uncorroborated){const field={8:'goals',9:'yellow',10:'red'}[offset];reviewNotes.push(`原文候选“${raw[field]}”缺少位置复核，请确认`);entry[field]='?'}
        if(role==='substitute'&&starter)reviewNotes.push('首发栏有涂改，按替补标记解析，请核对')
        if(entry.on&&entry.off&&/^\d+$/.test(entry.on)&&/^\d+$/.test(entry.off)&&Number(entry.off)<=Number(entry.on))reviewNotes.push('换下时间不晚于换上时间，请核对')
        if(role==='unknown')reviewNotes.push('首发、替补标记不清，请核对')
        if(!entry.name)reviewNotes.push('姓名与号码需核对')
        teams[side].push(entry)
      }
    }
  }
  const notes=require('./refereeReportNotes.cjs').enrich(teams,textResult,handwriting,options)
  const score=scoreFromLocations(textResult,handwriting)
  if(options.sourceSide?!teams[options.sourceSide]?.length:!teams.home.length||!teams.away.length)warnings.push('部分名单未识别，请对照原图补充')
  if(score.home==null||score.away==null)warnings.push('比分未识别，请填写')
  const hasHalftime=Object.values(teams).flat().some(row=>['on','off'].some(field=>/中场|半场|^[半中√✓✔Vv↑↓]+$/.test(clean(row.rawFields?.[field]))))
  if(hasHalftime&&timing.halfMinutes==null)warnings.push('缺少半场时长，中场换人须填写分钟')
  if(hasHalftime&&timing.needsReview)warnings.push('历史比赛缺少赛前时长快照，请核对中场分钟')
  const parsedGoals=Object.fromEntries(['home','away'].map(side=>[side,teams[side].reduce((sum,row)=>sum+(/^\d{1,3}(?:,\d{1,3})*$/.test(row.goals)?row.goals.split(',').length:0),0)]))
  if(score.home!=null&&(parsedGoals.home!==score.home||parsedGoals.away!==score.away))warnings.push('比分与已解析进球次数不一致，请核对进球分钟')
  if(notes.annotations.length && Object.values(teams).flat().some(row=>row.reviewNotes?.length || String(row.goals).includes('?')))warnings.push('部分记录不清楚，请核对标记项目')
  return {teams,score,timing,warnings:[...new Set(warnings)],...notes,roleConvention:options.blankRoleAsBench===true?'tick_starter_blank_bench':'explicit_marks',analysisVersion:'referee-report-analysis/3'}
}
module.exports={parseTables,normalizeMinute,resolveTiming,scoreFromLocations}
