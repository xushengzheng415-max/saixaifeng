import QRCode from 'qrcode'
export const tutorialLink = id => 'https://www.sxffootball.cn/service-account-h5/tutorial.html?id='+encodeURIComponent(id)
function lines(ctx, text, maxWidth, maxLines) {
  const result = []; let current = ''
  for (const char of String(text || '').replace(/\s+/g,' ')) { if (ctx.measureText(current+char).width > maxWidth && current) { result.push(current); current = char; if (result.length === maxLines) break } else current+=char }
  if (result.length < maxLines && current) result.push(current)
  if (result.join('').length < String(text || '').replace(/\s+/g,' ').length && result.length) { let last = result[result.length-1]; while (ctx.measureText(last+'…').width > maxWidth) last = last.slice(0,-1); result[result.length-1] = last+'…' }
  return result
}
export async function drawTutorialPoster(canvas, article) {
  if (!/^tutorial_[a-f0-9-]{36}$/.test(article.id || '')) throw new Error('教程链接无效，请重新打开分享')
  if (document.fonts?.ready) await document.fonts.ready
  canvas.width = 720; canvas.height = 1200
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff';ctx.fillRect(0,0,720,1200)
  ctx.fillStyle = '#0b4931';ctx.fillRect(0,0,720,14)
  ctx.font = 'bold 25px "Microsoft YaHei", sans-serif';ctx.fillText('赛小蜂足球',48,74)
  ctx.fillStyle = '#6a766e';ctx.font = '20px "Microsoft YaHei", sans-serif';ctx.fillText('操作教程',48,111)
  ctx.fillStyle = '#162c20';ctx.font = 'bold 38px "Microsoft YaHei", sans-serif'
  const title = lines(ctx,article.title,624,3);title.forEach((line,i)=>ctx.fillText(line,48,181+i*56))
  let top = 193+title.length*56
  ctx.fillStyle = '#607267';ctx.font = '20px "Microsoft YaHei", sans-serif'
  const metadata = lines(ctx,[article.category,article.audience,(article.steps || []).length+'个步骤'].filter(Boolean).join(' · '),624,2)
  metadata.forEach((line,i)=>ctx.fillText(line,48,top+i*27));top+=metadata.length*27+31
  const steps = article.steps || []
  steps.slice(0,3).forEach((step,i)=>{
    ctx.fillStyle='#e9f3ed';ctx.fillRect(48,top-24,38,38);ctx.fillStyle='#176b43';ctx.font='bold 23px sans-serif';ctx.fillText(String(i+1),60,top+3)
    const description = String(step.text || '').replace(/^第[一二三四五六七八九十0-9]+步[：:，.、\s]*/,'')
    const caption = /^第[0-9]+步$/.test(step.title || '') ? description : step.title || description
    ctx.fillStyle='#26392d';ctx.font='23px "Microsoft YaHei", sans-serif';const label = lines(ctx,caption,548,2);label.forEach((line,j)=>ctx.fillText(line,106,top+3+j*34));top+=Math.max(65,label.length*34+20)
  })
  if (steps.length > 3) { ctx.fillStyle='#77847b';ctx.font='18px "Microsoft YaHei", sans-serif';ctx.fillText('完整教程共'+steps.length+'步',106,Math.min(top,720)) }
  const footer = Math.max(520,top+40)
  ctx.strokeStyle='#e0e8e3';ctx.beginPath();ctx.moveTo(48,footer);ctx.lineTo(672,footer);ctx.stroke()
  const qr = document.createElement('canvas'); await QRCode.toCanvas(qr,tutorialLink(article.id),{width:230,margin:4,errorCorrectionLevel:'M',color:{dark:'#122d1fff',light:'#ffffffff'}})
  ctx.drawImage(qr,48,footer+34,230,230)
  ctx.fillStyle='#183a27';ctx.font='bold 26px "Microsoft YaHei", sans-serif';ctx.fillText('扫码查看完整教程',314,footer+124)
  ctx.fillStyle='#69786e';ctx.font='20px "Microsoft YaHei", sans-serif';ctx.fillText('可保存图片后转发',314,footer+165)
  const height = footer+320, pixels = ctx.getImageData(0,0,720,height)
  canvas.height = height;canvas.getContext('2d').putImageData(pixels,0,0);canvas.dataset.qrY = String(footer+34)
  return tutorialLink(article.id)
}
