export const PLAYER_REJECTION_REASONS = [
  {value:'photo_missing',label:'未上传球员照片',reason:'未上传球员照片，请补传'},
  {value:'photo_blurry',label:'照片模糊或遮挡面部',reason:'照片模糊或遮挡面部，请更换清晰照片'},
  {value:'identity_missing',label:'证件信息不完整',reason:'证件信息不完整，请补齐'},
  {value:'identity_invalid',label:'证件号码有误',reason:'证件号码有误，请核对原件后更正'},
  {value:'name_mismatch',label:'姓名与证件不一致',reason:'姓名与证件不一致，请更正'},
  {value:'birth_mismatch',label:'出生日期与证件不一致',reason:'出生日期与证件不一致，请核对后更正'},
  {value:'number_missing',label:'未填写球衣号码',reason:'未填写球衣号码，请补充'},
  {value:'number_duplicate',label:'球衣号码与本队重复',reason:'球衣号码与本队重复，请更换'},
  {value:'position_missing',label:'未填写场上位置',reason:'未填写场上位置，请补充'},
  {value:'other',label:'其他问题',reason:''}
]
export function playerRejectionReason(selected=[],other='') {
  if(!Array.isArray(selected))return ''
  const chosen=PLAYER_REJECTION_REASONS.filter(item=>selected.includes(item.value))
  if(!chosen.length || (selected.includes('other') && !String(other).trim()))return ''
  const reason=chosen.map(item=>item.value==='other'?String(other).trim():item.reason).join('；')
  return reason.length<=500?reason:''
}
