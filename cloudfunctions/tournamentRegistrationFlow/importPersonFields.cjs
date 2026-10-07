'use strict'
function supplementImportedIdentity(identity, person) {
  const value=String(person.birthDate || '').trim()
  let birthDate=''
  if(value){
    const date=new Date(value+'T00:00:00Z')
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value||date.getTime()>Date.now())throw new Error('出生日期无效，请核对报名表')
    birthDate=value
  }
  if(identity.identityNumber && birthDate && identity.birthDate!==birthDate)throw new Error('出生日期与身份证号不一致，请核对报名表')
  return {...identity,birthDate:identity.birthDate||birthDate,position:String(person.position||'').trim().slice(0,30),identityIncomplete:!identity.identityNumber}
}
module.exports={supplementImportedIdentity}
