const cloud=require('wx-server-sdk'),crypto=require('crypto');cloud.init({env:cloud.SYMBOL_CURRENT_ENV})
const {processImage}=require('./process.cjs')
const {recognize}=require('./baidu-ocr.cjs')
exports.main=async function(event){
  event=event||{};const token=String(event.parentSessionToken||'');if(!token)return{success:false,code:'PARENT_AUTH_REQUIRED',error:'请重新打开登记邀请'}
  const db=cloud.database(),rows=(await db.collection('parent_h5_sessions').where({tokenHash:crypto.createHash('sha256').update(token).digest('hex'),active:true}).limit(2).get()).data||[],session=rows[0]
  if(rows.length!==1||!session||new Date(session.expiresAt).getTime()<=Date.now()||!Number.isFinite(new Date(session.expiresAt).getTime()))return{success:false,code:'PARENT_AUTH_REQUIRED',error:'登记会话已失效'}
  const invites=(await db.collection('parent_profile_invites').where({token:session.parentInvite,status:'active'}).limit(2).get()).data||[]
  if(invites.length!==1||(invites[0].expiresAt&&new Date(invites[0].expiresAt).getTime()<=Date.now()))return{success:false,error:'登记邀请已失效'}
  const imageBase64=String(event.imageBase64||String(event.base64Data||'').replace(/^data:image\/[^;]+;base64,/,'')).trim();if(imageBase64.length>4.2*1024*1024)return{success:false,error:'照片过大，请重新选择'}
  const bytes=Buffer.from(imageBase64,'base64');if(!bytes.length||bytes.length>3*1024*1024)return{success:false,error:'照片过大，请重新选择'}
  const permitted=await db.runTransaction(async tx=>{const r=await tx.collection('parent_h5_sessions').doc(session._id).get(),s=Array.isArray(r.data)?r.data[0]:r.data,now=Date.now(),same=now-Number(s.imagePrepareWindowStart||0)<60000,count=same?Number(s.imagePrepareCount||0):0;if(count>=12)return false;await tx.collection('parent_h5_sessions').doc(session._id).update({data:{imagePrepareWindowStart:same?s.imagePrepareWindowStart:now,imagePrepareCount:count+1}});return true})
  if(!permitted)return{success:false,error:'处理请求过于频繁，请稍后再试'}
  try{
    const type=String(event.documentType||'resident_id'),side=event.side==='back'?'back':'front'
    if((event.ocrConsent===true||event.ocrConsent==='true')&&['resident_id','passport'].includes(type)){
      const result=await recognize(bytes,type,side,db)
      const minimal={...result.recognized,provider:'baidu-ocr',consentVersion:'baidu-document-ocr/1',recognizedAt:db.serverDate()}
      await db.collection('parent_h5_sessions').doc(session._id).update({data:{[side==='front'?'identityOcrFrontPreview':'identityOcrBackPreview']:minimal}})
      return result
    }
    const result=await processImage(bytes,type);return{success:true,base64Data:'data:image/jpeg;base64,'+result.data.toString('base64'),cropDetected:result.cropDetected,rotation:result.rotation,width:result.width,height:result.height,needsOrientationConfirmation:result.needsOrientationConfirmation,message:result.message}
  }catch(error){return{success:false,code:String(error.code||'IDENTITY_IMAGE_PROCESS_FAILED'),error:error.code?error.message:'照片无法处理，请重新选择清晰完整照片'}}
}
