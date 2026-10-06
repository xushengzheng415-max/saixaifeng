const contract = require('./player-card-text-styles.json')
const HEX = /^#[0-9a-fA-F]{6}$/
function invalid() { throw Object.assign(new Error('文字样式参数无效，请检查颜色和数值范围'), {code:'CARD_TEMPLATE_TEXT_STYLE_INVALID'}) }
function number(value, min, max) { const n=Number(value); if (!Number.isFinite(n) || n<min || n>max) invalid();return n }
function color(value) { if (!HEX.test(String(value || ''))) invalid();return String(value) }
function normalizeTextStyle(raw = {}) {
  const defaults = contract.defaults, value={...defaults,...raw}
  if (!contract.fonts.some(font=>font.id===value.font) || !['normal','italic'].includes(value.fontStyle) || !['solid','gradient'].includes(value.fillMode)) invalid()
  for(const key of ['gradient','stroke','shadow']) if (raw[key] != null && (typeof raw[key] !== 'object' || Array.isArray(raw[key]))) invalid()
  const gradient={...defaults.gradient,...raw.gradient},stroke={...defaults.stroke,...raw.stroke},shadow={...defaults.shadow,...raw.shadow}
  if (typeof gradient.middleEnabled !== 'boolean' || typeof shadow.enabled !== 'boolean') invalid()
  return {font:value.font,fontStyle:value.fontStyle,letterSpacing:number(value.letterSpacing,-2,20),fillMode:value.fillMode,
    gradient:{start:color(gradient.start),middle:color(gradient.middle),end:color(gradient.end),middleEnabled:gradient.middleEnabled,angle:number(gradient.angle,0,360)},
    stroke:{width:number(stroke.width,0,5),color:color(stroke.color)},
    shadow:{enabled:shadow.enabled,color:color(shadow.color),opacity:number(shadow.opacity,0,1),x:number(shadow.x,-10,10),y:number(shadow.y,-10,10),blur:number(shadow.blur,0,6)}}
}
function gradientCoordinates(angle) {
  const radians=angle*Math.PI/180, x=Math.cos(radians)*50, y=Math.sin(radians)*50
  return {x1:50-x,y1:50-y,x2:50+x,y2:50+y}
}
module.exports = {normalizeTextStyle,gradientCoordinates,contract}
