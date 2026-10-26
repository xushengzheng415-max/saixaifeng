export const TEAM_ENTRY_STEPS = [
  '微信扫码，打开赛事邀请',
  '微信登录并验证手机号',
  '选择已有球队，或填写队名、队徽创建球队',
  '选择开放组别，按页面提示确认参赛',
  '进入球队管理，邀请球员入库并提交赛事名单'
]

function imageOf(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const timer = setTimeout(() => reject(new Error('二维码加载超时，请重试')), 12000)
    image.crossOrigin = 'anonymous'
    image.onload = () => { clearTimeout(timer); resolve(image) }
    image.onerror = () => { clearTimeout(timer); reject(new Error('二维码加载失败，请重试')) }
    image.src = url
  })
}
function lines(context, value, width) {
  const result = []; let line = ''
  for (const character of String(value || '')) {
    if (line && context.measureText(line + character).width > width) { result.push(line); line = '' }
    line += character
  }
  if (line) result.push(line)
  return result
}
function date(value) {
  if (!value) return '待公布'
  if (typeof value==='string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0,10).replaceAll('-','.')
  const parsed=new Date(value instanceof Date?value:value.$date || value._date || value)
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(parsed).replaceAll('/','.') : '待公布'
}
export async function renderTeamInvitationPosters({ tournament = {}, invitation = {}, loadImage = imageOf, createCanvas = () => document.createElement('canvas') }) {
  if (!invitation.qrCodeUrl || invitation.testOnly || invitation.envVersion !== 'release') throw new Error('请先生成正式版邀请二维码')
  const qr = await loadImage(invitation.qrCodeUrl)
  function render(guide) {
    const canvas = createCanvas(); canvas.width = 1080; canvas.height = guide ? 1720 : 1440
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法生成海报，请更换浏览器后重试')
    const title = String(tournament.name || '足球赛事')
    let size = 58; let titleLines
    do { context.font = `800 ${size}px "Microsoft YaHei",sans-serif`; titleLines = lines(context, title, 936); size -= 2 } while (titleLines.length > 3 && size > 30)
    const titleSize=size+2,titleBottom=162+(titleLines.length-1)*68
    const start=date(tournament.startDate),end=date(tournament.endDate)
    const time = `${start}${end!=='待公布' && end!==start ? '—' + end : ''}`
    const groups=(Array.isArray(invitation.availableDivisions)?invitation.availableDivisions:[]).map(group=>String(group.name || '').trim()).filter(Boolean)
    const metadata=[`比赛时间：${time}`, `比赛地点：${tournament.location || tournament.city || tournament.region || '待公布'}`, groups.length?`报名组别：${groups.join('、')}`:'报名组别：扫码后选择开放组别', '报名截止：以所选组别报名页为准']
    context.font='500 29px "Microsoft YaHei",sans-serif'
    const metadataHeight=metadata.reduce((total,text)=>total+lines(context,text,920).length*48+12,0)
    context.font='600 31px "Microsoft YaHei",sans-serif'
    const stepsHeight=TEAM_ENTRY_STEPS.reduce((total,step)=>total+Math.max(112,lines(context,step,820).length*48+38),0)
    canvas.height=Math.max(canvas.height,guide?titleBottom+526+stepsHeight+80:Math.max(650,titleBottom+92+metadataHeight+25)+664)
    const background = context.createLinearGradient(0, 0, 1080, canvas.height)
    background.addColorStop(0, '#06462f'); background.addColorStop(1, '#03281c')
    context.fillStyle = background; context.fillRect(0, 0, canvas.width, canvas.height)
    context.textAlign = 'center'; context.fillStyle = '#bce9ce'; context.font = '600 26px "Microsoft YaHei",sans-serif'
    context.fillText(guide ? '赛小蜂足球 · 球队入驻指引' : '赛小蜂足球 · 邀请球队参赛', 540, 78)
    context.font=`800 ${titleSize}px "Microsoft YaHei",sans-serif`
    context.fillStyle = '#ffffff'; titleLines.forEach((line, index) => context.fillText(line, 540, 162 + index * 68))
    if (guide) {
      context.fillStyle = '#ffffff'; context.fillRect(365, titleBottom + 46, 350, 350)
      context.drawImage(qr, 385, titleBottom + 66, 310, 310)
      context.fillStyle = '#caeed8'; context.font = '500 25px "Microsoft YaHei",sans-serif'
      context.fillText('已有球队和新球队都从此码进入', 540, titleBottom + 442)
      let y = titleBottom + 526
      TEAM_ENTRY_STEPS.forEach((step, index) => {
        context.textAlign = 'left'; context.fillStyle = '#a9e4be'; context.font = '800 33px "Microsoft YaHei",sans-serif'
        context.fillText(String(index + 1).padStart(2, '0'), 78, y)
        context.fillStyle = '#ffffff'; context.font = '600 31px "Microsoft YaHei",sans-serif'
        const stepLines = lines(context, step, 820)
        stepLines.forEach((line, lineIndex) => context.fillText(line, 160, y + lineIndex * 48))
        y += Math.max(112, stepLines.length * 48 + 38)
      })
    } else {
      context.fillStyle = '#d4efdf'; context.font = '500 29px "Microsoft YaHei",sans-serif'
      let y = titleBottom + 92
      for (const text of metadata) {
        for (const line of lines(context, text, 920)) { context.fillText(line, 540, y); y += 48 }
        y += 12
      }
      const qrTop = Math.max(650, y + 25)
      context.fillStyle = '#ffffff'; context.fillRect(290, qrTop, 500, 500)
      context.drawImage(qr, 315, qrTop + 25, 450, 450)
      context.fillStyle = '#ffffff'; context.font = '700 34px "Microsoft YaHei",sans-serif'
      context.fillText('微信扫码进入赛事报名', 540, qrTop + 564)
    }
    context.textAlign = 'center'; context.fillStyle = '#b6d8c4'; context.font = '500 22px "Microsoft YaHei",sans-serif'
    context.fillText(tournament.organizerName || '赛事组委会', 540, canvas.height - 54)
    try { return canvas.toDataURL('image/png') }
    catch { throw new Error('二维码图片暂无法导出，请重新生成邀请') }
  }
  return { invitation: render(false), guide: render(true) }
}
