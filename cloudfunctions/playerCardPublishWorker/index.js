const cloud=require('wx-server-sdk')
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV})
const {createPlayerCardPublish}=require('./playerCardPublish.cjs')
const suite=require('./playerCardSuite.cjs')
// Client invocation is denied by its function rule; timer and IAM deployment only.
exports.main=async event=>{
  const db=cloud.database(),publisher=createPlayerCardPublish({cloud})
  if(event?.action==='synchronizeActive')return publisher.synchronizeActive(String(event.tier||''))
  if(event?.action==='retry')return publisher.retry(String(event.jobId||''))
  if(event?.action==='audit'){
    const players=await suite.publicationPlayers(db,String(event.tier||'bronze'))
    const scores=await require('./data-center/service.cjs').createDataService(db).playerCardsForAuthorizedPlayers(players.map(p=>String(p._id)))
    const counts={},missing={};for(const score of scores.values()){const key=score.status==='ready'?score.tier:score.status;counts[key]=(counts[key]||0)+1;for(const field of score.missing||[])missing[field]=(missing[field]||0)+1}
    return {success:true,total:players.length,counts,missing}
  }
  const started=Date.now(),results=[]
  for(const tier of suite.TYPES){
    let status=await publisher.status(tier)
    if(status.status!=='pending')continue
    const job=await suite.document(db,suite.JOBS,status.jobId)
    const scores=await require('./data-center/service.cjs').createDataService(db).playerCardsForAuthorizedPlayers(job.targetIds||[])
    while(status.status==='pending'&&Date.now()-started<45000){
      status=await publisher.advance(status.jobId,{scores,batchSize:12,deadline:started+45000})
      if(status.busy)break
    }
    results.push({tier,...status})
  }
  return {success:true,results}
}
