"use strict"
function clean(value, max=60) { return String(value == null ? '' : value).trim().slice(0,max) }
function dateValue(value) {
  const raw=String(value == null ? '' : value).trim()
  if(!raw)return ''
  const date=new Date(raw+'T00:00:00Z')
  if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==raw||date.getTime()>Date.now())throw new Error('出生日期无效，请重新选择')
  return raw
}
function editableImportedProfile(person) {
  const identityNumber=clean(person.identityNumber,40).replace(/\s/g,'').toUpperCase()
  const documentType=clean(person.documentType)||(/^\d{17}[0-9X]$/.test(identityNumber)?'resident_id':identityNumber?'passport':'resident_id')
  if(!['resident_id','passport'].includes(documentType))throw new Error('请选择身份证或护照')
  let birthDate=dateValue(person.birthDate), gender=clean(person.gender,10)
  if(identityNumber && documentType==='resident_id') {
    if(!/^\d{17}[0-9X]$/.test(identityNumber))throw new Error('身份证号应为18位')
    const weights=[7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2]
    const sum=weights.reduce((n,w,i)=>n+Number(identityNumber[i])*w,0)
    if('10X98765432'[sum%11]!==identityNumber[17])throw new Error('身份证校验未通过，请核对号码')
    const derived=dateValue(identityNumber.slice(6,10)+'-'+identityNumber.slice(10,12)+'-'+identityNumber.slice(12,14))
    if(birthDate && birthDate!==derived)throw new Error('出生日期与身份证号不一致')
    birthDate=derived
    const derivedGender=Number(identityNumber[16])%2?'male':'female'
    if(gender && gender!==derivedGender)throw new Error('性别与身份证号不一致')
    gender=derivedGender
  } else if(identityNumber && !/^[A-Z0-9]{5,30}$/.test(identityNumber))throw new Error('护照号应为5至30位字母或数字')
  if(gender && !['male','female'].includes(gender))throw new Error('请选择有效性别')
  const strongFoot=clean(person.strongFoot,10)
  if(strongFoot && !['left','right','both'].includes(strongFoot))throw new Error('请选择有效惯用脚')
  const measurement=(key,min,max,label)=>{
    if(person[key]==null || person[key]==='')return null
    const value=Number(person[key])
    if(!Number.isFinite(value)||value<min||value>max)throw new Error(label+'超出有效范围')
    return Math.round(value*10)/10
  }
  return {documentType,identityNumber,birthDate,gender,nativePlace:clean(person.nativePlace),nationality:Object.prototype.hasOwnProperty.call(person,'nationality') ? clean(person.nationality,40) : (identityNumber && documentType==='resident_id' ? '中国' : ''),position:clean(person.position,30),strongFoot,height:measurement('height',50,250,'身高'),weight:measurement('weight',10,200,'体重'),identityIncomplete:!identityNumber}
}
function supplementImportedIdentity(identity,person) {
  if(person.documentType!=='passport' && identity.birthDate && person.birthDate && identity.birthDate!==person.birthDate)throw new Error('出生日期与身份证号不一致')
  const profile=editableImportedProfile({...person,identityNumber:identity.identityNumber})
  return {...identity,...profile}
}
module.exports={supplementImportedIdentity,editableImportedProfile}
