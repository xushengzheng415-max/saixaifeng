export const TEAM_ENTRY_STEPS = [
  '微信扫码，打开赛事邀请',
  '微信登录并验证手机号',
  '选择已有球队，或填写队名、队徽创建球队',
  '选择开放组别，按页面提示确认参赛',
  '进入球队管理，邀请球员入库并提交赛事名单'
]
const base=import.meta.env?.BASE_URL || '/admin/'
export const POSTER_TEMPLATES=[
  {id:'emerald',name:'绿茵赛场',accent:'#bce86b',ink:'#123d2b',background:`${base}images/team-invitation-v2/emerald.png`},
  {id:'crimson',name:'红金荣耀',accent:'#f5d48a',ink:'#6d1822',background:`${base}images/team-invitation-v2/crimson.png`},
  {id:'cobalt',name:'蓝色竞技',accent:'#6ae9ff',ink:'#07528b',background:`${base}images/team-invitation-v2/cobalt.png`}
]
function imageOf(url){return new Promise((resolve,reject)=>{
  const image=new Image(),timer=setTimeout(()=>reject(new Error('海报图片加载超时，请重试')),15000)
  image.crossOrigin='anonymous';image.onload=()=>{clearTimeout(timer);resolve(image)}
  image.onerror=()=>{clearTimeout(timer);reject(new Error('海报图片加载失败，请重试'))};image.src=url
})}
function font(context,size,weight=600){context.font=`${weight} ${size}px "Microsoft YaHei",sans-serif`}
function lines(context,value,width){
  const result=[];let line=''
  for(const character of String(value || '')){if(line && context.measureText(line+character).width>width){result.push(line);line=''}line+=character}
  if(line)result.push(line);return result
}
function date(value){
  if(!value)return '待公布'
  if(typeof value==='string' && /^\d{4}-\d{2}-\d{2}/.test(value))return value.slice(0,10).replaceAll('-','.')
  const parsed=new Date(value instanceof Date?value:value.$date || value._date || value)
  return Number.isFinite(parsed.getTime())?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(parsed).replaceAll('/','.'):'待公布'
}
function textRows(context,value,width,size,maxLines=3){
  let rows
  do{font(context,size,700);rows=lines(context,value,width);if(rows.length<=maxLines || size<=40)break;size-=2}while(size>0)
  if(rows.length>1 && context.measureText(rows.at(-1)).width<width*.3){
    const joined=rows.slice(-2).join(''),characters=[...joined],football=joined.lastIndexOf('足球')
    let split=football>0 && context.measureText(joined.slice(0,football)).width<=width && context.measureText(joined.slice(football)).width<=width?football:0
    if(!split){let score=Infinity;for(let index=1;index<characters.length;index++){const left=characters.slice(0,index).join(''),right=characters.slice(index).join(''),a=context.measureText(left).width,b=context.measureText(right).width;if(a<=width && b<=width && Math.abs(a-b)<score){score=Math.abs(a-b);split=index}}}
    if(split)rows.splice(-2,2,characters.slice(0,split).join(''),characters.slice(split).join(''))
  }
  return {rows,size,lineHeight:Math.ceil(size*1.34)}
}
function cover(context,image,width,height,shift=0){
  const iw=image.naturalWidth || image.width || 1080,ih=image.naturalHeight || image.height || 1440
  const scale=Math.max(width/iw,height/ih),w=iw*scale,h=ih*scale
  context.drawImage(image,0,0,iw,ih,(width-w)/2,(height-h)/2+shift,w,h)
}
function mask(context,height,opacity=.66){
  const shade=context.createLinearGradient(0,0,0,height)
  shade.addColorStop(0,`rgba(0,8,15,${opacity})`);shade.addColorStop(.65,'rgba(0,8,15,.22)');shade.addColorStop(1,'rgba(0,8,15,0)')
  context.fillStyle=shade;context.fillRect(0,0,1080,height)
}
function label(context,value,x,y,color,size=24,weight=600){context.fillStyle=color;font(context,size,weight);context.fillText(value,x,y)}
function qrCard(context,qr,x,y,size,ink){
  context.fillStyle='#ffffff';context.fillRect(x,y,size+48,size+122)
  context.drawImage(qr,x+24,y+24,size,size)
  context.textAlign='center';label(context,'微信扫码报名',x+(size+48)/2,y+size+72,ink,30,600)
  context.textAlign='left'
}
export async function renderTeamInvitationPosters({tournament={},invitation={},templateId='emerald',loadImage=imageOf,createCanvas=()=>document.createElement('canvas')}){
  if(!invitation.qrCodeUrl || invitation.testOnly || invitation.envVersion!=='release')throw new Error('请先生成正式版邀请二维码')
  const theme=POSTER_TEMPLATES.find(item=>item.id===templateId)
  if(!theme)throw new Error('请选择有效的海报样式')
  const source={name:String(tournament.name || '足球赛事'),start:date(tournament.startDate),end:date(tournament.endDate),location:String(tournament.location || tournament.city || tournament.region || '待公布'),organizer:String(tournament.organizerName || '赛事组委会')}
  const groups=(Array.isArray(invitation.availableDivisions)?invitation.availableDivisions:[]).map(item=>String(item.name || '').trim()).filter(Boolean)
  const metadata=[['时间',source.start+(source.end!=='待公布' && source.end!==source.start?'—'+source.end:'')],['地点',source.location],['组别',groups.join('、') || '扫码后选择开放组别'],['截止','以所选组别为准']]
  const [qr,background]=await Promise.all([loadImage(invitation.qrCodeUrl),loadImage(theme.background)])
  function create(height){const canvas=createCanvas();canvas.width=1080;canvas.height=height;const context=canvas.getContext('2d');if(!context)throw new Error('浏览器无法生成海报，请更换浏览器后重试');return {canvas,context}}
  function finish(canvas){try{return canvas.toDataURL('image/png')}catch{throw new Error('二维码图片暂无法导出，请重新生成邀请')}}
  function invite(){
    const {canvas,context:c}=create(1440),isRed=theme.id==='crimson',isBlue=theme.id==='cobalt'
    const title=textRows(c,source.name,isBlue?920:936,isBlue?82:84)
    const titleY=isBlue?268:isRed?280:270,titleBottom=titleY+(title.rows.length-1)*title.lineHeight
    const metaWidth=isBlue?370:432; font(c,36)
    const prepared=metadata.map(([name,value])=>{
      if(name==='时间' && source.end!=='待公布' && source.end!==source.start)return {name,rows:[source.start,`至 ${source.end}`]}
      const bracket=value.indexOf('（')
      if(bracket>0 && c.measureText(value).width>metaWidth && c.measureText(value.slice(0,bracket)).width<=metaWidth && c.measureText(value.slice(bracket)).width<=metaWidth)return {name,rows:[value.slice(0,bracket),value.slice(bracket)]}
      return {name,rows:lines(c,value,metaWidth)}
    })
    const metadataHeight=prepared.reduce((n,row)=>n+Math.max(92,row.rows.length*48+28),0)
    const panelHeight=Math.max(470,metadataHeight+96)
    canvas.height=isBlue?Math.max(1440,titleBottom+metadataHeight+710):Math.max(1440,titleBottom+panelHeight+330)
    c.fillStyle=theme.ink;c.fillRect(0,0,1080,canvas.height)
    cover(c,background,1080,canvas.height,isRed?-95:isBlue?-100:-310);mask(c,Math.max(650,titleBottom+80),.58)
    c.textAlign=isRed?'center':'left'
    label(c,'赛小蜂足球',isRed?540:72,76,'#d7e5df',24,500)
    if(isBlue){
      label(c,'球队邀约',72,156,theme.accent,48,500)
      title.rows.forEach((row,index)=>label(c,row,72,titleY+index*title.lineHeight,'#ffffff',title.size,700))
      c.textAlign='left'
      c.fillStyle='rgba(2,18,45,.78)';c.fillRect(512,titleBottom+146,512,metadataHeight+84)
      let y=titleBottom+202
      for(const row of prepared){label(c,row.name,536,y,'#9bc4d4',26,500);row.rows.forEach((value,index)=>label(c,value,630,y+index*48,'#ffffff',36,600));y+=Math.max(92,row.rows.length*48+28)}
      qrCard(c,qr,664,canvas.height-458,300,theme.ink)
      label(c,source.organizer,72,canvas.height-58,'#d1ecf6',23)
    }else{
      label(c,isRed?'参赛邀请':'球队招募',isRed?540:72,160,theme.accent,isRed?60:48,500)
      title.rows.forEach((row,index)=>label(c,row,isRed?540:72,titleY+index*title.lineHeight,'#ffffff',title.size,700))
      if(isRed){c.fillStyle=theme.accent;c.fillRect(420,titleBottom+52,240,4)}
      const top=canvas.height-panelHeight-48
      c.textAlign='left'
      if(isRed){c.fillStyle='rgba(35,4,11,.86)';c.fillRect(48,top,566,panelHeight);c.fillStyle=theme.accent;c.fillRect(48,top,6,panelHeight)}
      else{c.fillStyle='#ffffff';c.fillRect(48,top,984,panelHeight);c.fillStyle='#087d47';c.fillRect(48,top,8,panelHeight)}
      let y=top+76
      for(const row of prepared){label(c,row.name,82,y,isRed?'#dcbba0':'#6c7f74',26,500);row.rows.forEach((value,index)=>label(c,value,174,y+index*48,isRed?'#ffffff':theme.ink,36,600));y+=Math.max(92,row.rows.length*48+28)}
      qrCard(c,qr,660,top+28,300,theme.ink)
      c.textAlign='center';label(c,source.organizer,540,canvas.height-17,'#d6e6dd',20)
    }
    return finish(canvas)
  }
  function guide(){
    const {canvas,context:c}=create(1720),title=textRows(c,source.name,570,46)
    font(c,36);const rows=TEAM_ENTRY_STEPS.map(step=>lines(c,step,780))
    const stepHeights=rows.map(row=>Math.max(150,row.length*52+70))
    canvas.height=Math.max(1720,600+stepHeights.reduce((a,b)=>a+b,0)+160)
    c.fillStyle=theme.ink;c.fillRect(0,0,1080,canvas.height);cover(c,background,1080,1440,-480);mask(c,570,.4)
    c.textAlign='left';label(c,'赛小蜂足球',64,76,'#d3eadf',25)
    label(c,'球队入驻指引',64,167,'#ffffff',72,700)
    title.rows.forEach((row,index)=>label(c,row,64,249+index*title.lineHeight,'#ffffff',title.size,600))
    qrCard(c,qr,692,122,280,theme.ink)
    c.fillStyle='#f5f8f6';c.fillRect(0,550,1080,canvas.height-550)
    c.fillStyle=theme.accent;c.fillRect(64,588,72,6)
    let y=686
    rows.forEach((row,index)=>{
      label(c,String(index+1).padStart(2,'0'),64,y,theme.ink,54,600)
      row.forEach((value,lineIndex)=>label(c,value,220,y+lineIndex*52,'#1a3025',36,500))
      c.fillStyle='#dbe5df';c.fillRect(220,y+stepHeights[index]-65,796,1);y+=stepHeights[index]
    })
    c.textAlign='center';label(c,source.organizer,540,canvas.height-66,'#75867b',23)
    return finish(canvas)
  }
  return {invitation:invite(),guide:guide(),templateId:theme.id}
}
