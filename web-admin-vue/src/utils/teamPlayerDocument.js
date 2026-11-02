import {editableImportedProfile} from '../../../cloudfunctions/tournamentRegistrationFlow/importPersonFields.cjs'

const text=value=>String(value==null?'':value).trim()
const number=value=>text(value).replace(/\s/g,'').toUpperCase()
export function playerDocumentType(player={}) {
  if(['resident_id','passport'].includes(player.documentType))return player.documentType
  const stored=number(player.idCard||player.idNumber)
  return stored&&!stored.includes('*')&&!/^\d{17}[0-9X]$/.test(stored)?'passport':'resident_id'
}
export function playerDocumentForm(player={}) {
  const stored=number(player.idCard||player.idNumber)
  return {documentType:playerDocumentType(player),idCard:stored.includes('*')?'':stored}
}
export function preparePlayerDocument(form,original=null) {
  const documentType=form.documentType||'resident_id',identityNumber=number(form.idCard)
  const previous=number(original&&(original.idCard||original.idNumber))
  const sameType=original&&documentType===playerDocumentType(original)
  const hasStored=original&&(previous||original.identityDigest||original.identityMasked||original.identityNumberMasked)
  if(sameType&&hasStored&&(!identityNumber||identityNumber===previous)){
    const profile=editableImportedProfile({...form,documentType,identityNumber:''})
    const changed=profile.birthDate!==text(original.birthDate)||profile.gender!==text(original.gender||'male')||text(form.name)!==text(original.name)
    return {documentType,birthDate:profile.birthDate,gender:profile.gender,keepStoredIdentity:true,...(changed?{identityStatus:'not_verified',identityVerified:false,identityVerificationLabel:'待人证核验',eligibilityReviewRequired:true}:{})}
  }
  if(!identityNumber)throw Error(documentType==='passport'?'请输入护照号':'请输入身份证号')
  const profile=editableImportedProfile({...form,documentType,identityNumber})
  const mask=identityNumber.length>8?identityNumber.slice(0,4)+'*'.repeat(identityNumber.length-8)+identityNumber.slice(-4):identityNumber.slice(0,2)+'****'+identityNumber.slice(-2)
  return {documentType:profile.documentType,idCard:profile.identityNumber,idNumber:profile.identityNumber,birthDate:profile.birthDate,gender:profile.gender,identityDigest:'',identityMasked:mask,identityNumberMasked:mask,identityStatus:'not_verified',identityVerified:false,identityVerificationLabel:'待人证核验',eligibilityReviewRequired:true,keepStoredIdentity:false}
}
