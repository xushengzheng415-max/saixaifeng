const assert=require('node:assert/strict'),Module=require('node:module')
const target=require.resolve('../cloudfunctions/webLoginApi/playerCards.cjs'),original=Module._load
Module._load=function(name,parent,...rest){if(parent?.filename===target){if(name==='./data-center/service.cjs')return {};if(name==='./playerCardSuite.cjs')return {};if(name==='./playerCardLibrary.cjs')return {};if(name==='./playerCardRender.cjs')return {}}return original.call(this,name,parent,...rest)}
try{
 const {portraitMatchesRegistration}=require(target)
 const entry={player:{_id:'p',linkedUserId:'u'},relation:{parentInvite:'old-invite',registrantType:'self',registrantUserId:'u'}}
 const portrait={status:'confirmed',parentInvite:'new-invite',sourceChannel:'service_account_h5',playerId:'p',serviceAccountOpenId:'official'}
 assert.equal(portraitMatchesRegistration(portrait,entry,{openId:'official'}),true,'same verified owner can use a new registration portrait through an older submission relation')
 assert.equal(portraitMatchesRegistration({...portrait,playerId:'other'},entry,{openId:'official'}),false)
 assert.equal(portraitMatchesRegistration(portrait,entry,{openId:'other'}),false)
 assert.equal(portraitMatchesRegistration(portrait,{...entry,player:{_id:'p',linkedUserId:'other'}},{openId:'official'}),false)
 assert.equal(portraitMatchesRegistration({...portrait,status:'ready_for_confirmation'},entry,{openId:'official'}),false)
 assert.equal(portraitMatchesRegistration({...portrait,sourceChannel:'arbitrary'},entry,{openId:'official'}),false)
 assert.equal(portraitMatchesRegistration({...portrait,parentInvite:'old-invite'},entry,{openId:'official'}),true,'legacy confirmed portrait path preserved')
 console.log('PASS registration card reuse: old relation/new confirmed portrait, stable player, same service account, ownership, status and legacy compatibility')
}finally{Module._load=original}
