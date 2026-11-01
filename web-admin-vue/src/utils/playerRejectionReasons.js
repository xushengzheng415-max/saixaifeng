export const PLAYER_REJECTION_REASONS = [
  {value:'photo',label:'照片',reason:'请补充或更换清晰的球员照片'},
  {value:'identity',label:'身份证/证件',reason:'请补齐或核对证件信息'},
  {value:'name',label:'姓名',reason:'请核对球员姓名'},
  {value:'birth',label:'出生日期',reason:'请核对出生日期'},
  {value:'number',label:'球衣号码',reason:'请补齐或核对球衣号码'},
  {value:'position',label:'场上位置',reason:'请补齐或核对场上位置'},
  {value:'other',label:'其他',reason:''}
]
export function playerRejectionReason(selected=[],other='') {
  if(!Array.isArray(selected))return ''
  const chosen=PLAYER_REJECTION_REASONS.filter(item=>selected.includes(item.value))
  if(!chosen.length || (selected.includes('other') && !String(other).trim()))return ''
  const parts=chosen.map(item=>item.value==='other'?String(other).trim():item.reason)
  const reason=parts.join('；')
  return reason.length<=200?reason:''
}
