import {configuredKickoffTimes} from './scheduleKickoffTimes.mjs'
export async function createScheduleTemplateWorkbook({tournament={},matches=[],divisionName='当前组别',stageLabel,teamName}={}) {
  const mod=await import('exceljs'),ExcelJS=mod.default || mod,book=new ExcelJS.Workbook()
  book.calcProperties.fullCalcOnLoad=true
  const sheet=book.addWorksheet('赛程填写',{views:[{state:'frozen',ySplit:2,xSplit:3,showGridLines:false}],pageSetup:{orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0}})
  const cfg=tournament.scheduleDraft || tournament.scheduleConfig || {},times=configuredKickoffTimes(cfg),venues=(cfg.venueResources || []).map(v=>v.name).filter(Boolean)
  if(!venues.length)for(let i=1;i<=10;i++)venues.push(`${i}号场地`)
  if(!times.length)throw new Error('请先在赛程设置填写开赛时间，再下载填写表')
  const options=book.addWorksheet('_填写选项');options.state='veryHidden'
  times.forEach((value,i)=>options.getCell(i+1,1).value=value);venues.forEach((value,i)=>options.getCell(i+1,2).value=value)
  book.definedNames.add(`'_填写选项'!$A$1:$A$${times.length}`,'KickoffTimeOptions');book.definedNames.add(`'_填写选项'!$B$1:$B$${venues.length}`,'VenueOptions')
  const dates=[],weekdays=['周日','周一','周二','周三','周四','周五','周六'],start=cfg.startDate || tournament.startDate,end=cfg.endDate || tournament.endDate
  if(start && end)for(let date=new Date(`${start}T00:00:00`);date<=new Date(`${end}T00:00:00`) && dates.length<366;date.setDate(date.getDate()+1)){if(cfg.matchDays?.length && !cfg.matchDays.includes(weekdays[date.getDay()]))continue;dates.push(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`)}
  dates.forEach((value,i)=>options.getCell(i+1,3).value=value)
  if(dates.length)book.definedNames.add(`'_填写选项'!$C$1:$C$${dates.length}`,'MatchDateOptions')
  const headers=['比赛ID','组别ID','场序','比赛日期','星期','时间','组别','小组','阶段','比赛对阵','场地'],widths=[16,16,8,16,12,12,18,10,22,48,16]
  sheet.columns=widths.map(width=>({width}));sheet.getColumn(1).hidden=true;sheet.getColumn(2).hidden=true
  sheet.mergeCells('C1:K1');const title=sheet.getCell('C1');title.value=`${tournament.name || '赛事'}赛程表`;title.font={name:'微软雅黑',size:18,bold:true,color:{argb:'FF11623C'}};title.alignment={horizontal:'center',vertical:'middle'};sheet.getRow(1).height=42
  sheet.getRow(2).values=headers;sheet.getRow(2).height=32
  const border={style:'thin',color:{argb:'FFCBD8D0'}}
  const listValidation=name=>({type:'list',allowBlank:true,formulae:[name],showErrorMessage:true,errorStyle:'stop',errorTitle:'请选择列表中的值',error:'请使用下拉选项，避免无法识别'})
  matches.forEach((match,index)=>{
    const n=index+3,row=sheet.getRow(n);row.values=[match._id,String(match.divisionId || 'default'),match.matchNo || match.matchIndex || index+1,match.matchDate || '',null,match.matchTime || '',match.divisionName || divisionName,match.groupName || match.group || match.pool || '',stageLabel(match),`${teamName(match,'home')} VS ${teamName(match,'away')}`,match.venue || ''];row.height=30
    row.eachCell({includeEmpty:true},cell=>{cell.font={name:'微软雅黑',size:11,color:{argb:'FF26352C'}};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};cell.border={top:border,bottom:border,left:border,right:border};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:index%2?'FFF7FAF8':'FFFFFFFF'}};cell.protection={locked:true}})
    for(const column of [4,6,11]){const cell=row.getCell(column);cell.protection={locked:false};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEDF8EF'}}}
    row.getCell(6).dataValidation=listValidation('KickoffTimeOptions');row.getCell(11).dataValidation=listValidation('VenueOptions');if(dates.length)row.getCell(4).dataValidation=listValidation('MatchDateOptions')
    const dateFormula=`IF(ISNUMBER(D${n}),D${n},DATE(LEFT(D${n},4),MID(D${n},6,2),RIGHT(D${n},2)))`
    row.getCell(5).value={formula:`IF(D${n}="","",IFERROR(CHOOSE(WEEKDAY(${dateFormula},2),"星期一","星期二","星期三","星期四","星期五","星期六","星期日"),""))`,result:match.matchDate?['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][new Date(`${match.matchDate}T00:00:00`).getDay()]:''}
  })
  sheet.getRow(2).eachCell(cell=>{cell.font={name:'微软雅黑',size:11,bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF087B43'}};cell.alignment={horizontal:'center',vertical:'middle'};cell.border={top:border,bottom:border,left:border,right:border}})
  sheet.autoFilter={from:'C2',to:`K${Math.max(2,matches.length+2)}`};sheet.pageSetup.printTitlesRow='1:2';sheet.pageSetup.printArea=`C1:K${Math.max(2,matches.length+2)}`
  await sheet.protect('',{selectLockedCells:true,selectUnlockedCells:true,autoFilter:true,spinCount:1000})
  return {buffer:await book.xlsx.writeBuffer(),filename:`${tournament.name || '赛事'}-${divisionName}-赛程填写表.xlsx`}
}
