const path = require('node:path')
const { PNG } = require('pngjs')
const { Resvg } = require('@resvg/resvg-js')

const {normalizeTextStyle,gradientCoordinates,contract} = require('./playerCardTextStyle.cjs')
const FONT_FILES = contract.fonts.flatMap(font=>font.files).map(file=>path.join(__dirname,'fonts',file))
const WIDTH = 300, HEIGHT = 430
const escapeXml = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' })[c])

function image(buffer, attributes = '') {
  if (!buffer) return ''
  const png = buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  const jpeg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
  if (!png && !jpeg) throw new Error('球员卡图片须为 PNG 或 JPG')
  return `<image href="data:image/${png ? 'png' : 'jpeg'};base64,${buffer.toString('base64')}" ${attributes}/>`
}

function makeForegroundMask(buffer) {
  const mask = PNG.sync.read(buffer)
  if (mask.width !== WIDTH || mask.height !== HEIGHT) throw new Error('遮罩须为 300 × 430 PNG')
  for (let i = 0; i < mask.data.length; i += 4) {
    const luma = mask.data[i] * .2126 + mask.data[i+1] * .7152 + mask.data[i+2] * .0722
    mask.data[i] = mask.data[i+1] = mask.data[i+2] = 255
    mask.data[i+3] = Math.round(mask.data[i+3] * (1 - luma / 255))
  }
  return PNG.sync.write(mask)
}

function makePortraitMask(buffer) {
  const mask=PNG.sync.read(buffer)
  if(mask.width!==WIDTH||mask.height!==HEIGHT)throw new Error('遮罩须为 300 × 430 PNG')
  for(let i=0;i<mask.data.length;i+=4){
    const luma=mask.data[i]*.2126+mask.data[i+1]*.7152+mask.data[i+2]*.0722
    mask.data[i+3]=Math.round(mask.data[i+3]*luma/255)
    mask.data[i]=mask.data[i+1]=mask.data[i+2]=255
  }
  return PNG.sync.write(mask)
}

function makeForegroundLayer(backgroundBuffer, maskBuffer) {
  const background = PNG.sync.read(backgroundBuffer)
  const mask = PNG.sync.read(maskBuffer)
  if (background.width !== WIDTH || background.height !== HEIGHT || mask.width !== WIDTH || mask.height !== HEIGHT) {
    throw new Error('背景和遮罩须为 300 × 430')
  }
  for (let i = 0; i < background.data.length; i += 4) {
    const luma = mask.data[i] * .2126 + mask.data[i+1] * .7152 + mask.data[i+2] * .0722
    background.data[i+3] = Math.round(background.data[i+3] * mask.data[i+3] / 255 * (1-luma/255))
  }
  return PNG.sync.write(background)
}

function label(value, field, maxWidth = 280, id = 'label', definitions = []) {
  const content = String(value == null ? '' : value).trim()
  if (!field || !content) return ''
  const size = Math.max(8, Math.min(80, Number(field.size) || 14))
  const style = normalizeTextStyle(field)
  const approximateWidth = value => Array.from(value).reduce((total, char) => total + (/^[\x00-\x7F]$/.test(char) ? .58 : 1), 0) * size + Math.max(0,Array.from(value).length-1)*style.letterSpacing
  let shown = content
  while (approximateWidth(shown) > maxWidth && Array.from(shown).length > 1) {
    shown = Array.from(shown).slice(0, -2).join('') + '…'
  }
  let fill = escapeXml(field.color || '#1c241d')
  if (style.fillMode === 'gradient') {
    const coordinates = gradientCoordinates(style.gradient.angle), key = 'fill_' + id
    definitions.push('<linearGradient id="'+key+'" x1="'+coordinates.x1+'%" y1="'+coordinates.y1+'%" x2="'+coordinates.x2+'%" y2="'+coordinates.y2+'%"><stop offset="0" stop-color="'+style.gradient.start+'"/>'+(style.gradient.middleEnabled?'<stop offset="0.5" stop-color="'+style.gradient.middle+'"/>':'')+'<stop offset="1" stop-color="'+style.gradient.end+'"/></linearGradient>')
    fill = 'url(#' + key + ')'
  }
  let filter = ''
  if (style.shadow.enabled) {
    const key = 'shadow_' + id, shadow = style.shadow
    definitions.push('<filter id="'+key+'" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="'+shadow.blur+'"/><feOffset dx="'+shadow.x+'" dy="'+shadow.y+'" result="offset"/><feFlood flood-color="'+shadow.color+'" flood-opacity="'+shadow.opacity+'"/><feComposite in2="offset" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>')
    filter = ' filter="url(#' + key + ')"'
  }
  const skew = style.fontStyle === 'italic' ? ' transform="translate('+(Number(field.x)||0)+' '+(Number(field.y)||0)+') skewX(-12) translate('+(-(Number(field.x)||0))+' '+(-(Number(field.y)||0))+')"' : ''
  const family = contract.fonts.find(font=>font.id===style.font).family + ', Noto Sans SC'
  return '<text x="'+(Number(field.x)||0)+'" y="'+(Number(field.y)||0)+'" text-anchor="middle" dominant-baseline="hanging" font-family="'+family+'" font-size="'+size+'" font-weight="'+(Number(field.weight)||400)+'" font-style="normal" letter-spacing="'+style.letterSpacing+'" fill="'+fill+'" stroke="'+style.stroke.color+'" stroke-width="'+style.stroke.width+'" stroke-linejoin="round" paint-order="stroke fill"'+filter+skew+'>'+escapeXml(shown)+'</text>'

}

function star(cx, cy, radius) {
  const points = []
  for (let i=0;i<10;i++) {
    const angle=-Math.PI/2+i*Math.PI/5, r=i%2?radius*.4:radius
    points.push(`${cx+Math.cos(angle)*r},${cy+Math.sin(angle)*r}`)
  }
  return `<polygon points="${points.join(' ')}" fill="#ffdf45"/>`
}

function nationality(player, badge) {
  if (!badge || !player.nationality) return ''
  const { x, y, size } = badge
  if (String(player.nationality) === '中国') {
    const h = size*2/3
    return `<g><rect x="${x-size/2}" y="${y-h/2}" width="${size}" height="${h}" fill="#d92d24"/>${star(x-size*.3,y-h*.2,size*.12)}</g>`
  }
  return label(player.nationality, { x,y,size:Math.min(size*.6,18),weight:600,color:'#1c241d' }, size*2)
}

function adjusted(field, delta) {
  if (!field || !delta) return field
  return { ...field, x: field.x + Number(delta.x||0)/3, y: field.y + Number(delta.y||0)/3, size: field.size*Number(delta.scale||1) }
}

function renderCard({ backgroundBuffer, maskBuffer, portraitBuffer, teamLogoBuffer, template, player = {}, crop, personalLayout, size = 3 }) {
  const bg = PNG.sync.read(backgroundBuffer)
  if (bg.width !== WIDTH || bg.height !== HEIGHT) throw new Error('背景须为 300 × 430 PNG')
  const mask = makePortraitMask(maskBuffer)
  const photo = template.photo || { x:150,y:35,scale:108 }
  const c = crop || { zoom:1,x:0,y:0 }, zoom = Math.max(1,Math.min(4,Number(c.zoom)||1))
  const w = 270*Number(photo.scale||100)/100*zoom, h = 300*Number(photo.scale||100)/100*zoom
  const x = Number(photo.x||150)-w/2+Number(c.x||0)*264, y = Number(photo.y||0)+300-h+Number(c.y||0)*300
  const fields = template.layout || {}, personal = {}, badges = template.badges || {}
  const position = { GK:'守门员', DF:'后卫', MF:'中场', FW:'前锋' }[player.position] || player.position
  const logo = badges.team && teamLogoBuffer ? image(teamLogoBuffer,
    `x="${badges.team.x-badges.team.size/2}" y="${badges.team.y-badges.team.size/2}" width="${badges.team.size}" height="${badges.team.size}" preserveAspectRatio="xMidYMid meet"`) : ''
  const definitions = []
  const textLayers = [
    label(player.jerseyNumber,adjusted(fields.number,personal.number),85,'number',definitions),
    label(position,fields.position,105,'position',definitions),
    label(player.name,adjusted(fields.name,personal.name),245,'name',definitions),
    label(player.jerseyName,fields.jerseyName,245,'jerseyName',definitions),
    player.height == null || player.height === '' ? '' : label(`身高 ${player.height}cm`,fields.height,110,'height',definitions),
    player.weight == null || player.weight === '' ? '' : label(`体重 ${player.weight}kg`,fields.weight,110,'weight',definitions)
  ].join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs>${definitions.join('')}<mask id="portrait" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" style="mask-type:alpha">${image(mask, `width="${WIDTH}" height="${HEIGHT}"`)}</mask></defs>
    ${image(backgroundBuffer, `width="${WIDTH}" height="${HEIGHT}"`)}
    ${portraitBuffer ? `<g mask="url(#portrait)">${image(portraitBuffer, `x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMax meet"`)}</g>` : ''}
    ${textLayers}
    ${nationality(player,badges.nationality)}${logo}
  </svg>`
  return new Resvg(svg,{ fitTo:{mode:'zoom',value:size}, font:{fontFiles:FONT_FILES,loadSystemFonts:false} }).render().asPng()
}

module.exports = { renderCard, makeForegroundMask, makeForegroundLayer, makePortraitMask, WIDTH, HEIGHT }
