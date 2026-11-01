'use strict'
// A resolver lives for one authorized preview request, never across viewers.
function createAssetResolver(cloud){
  const cache=new Map(),pending=new Map();let scheduled=false
  async function flush(){
    scheduled=false;const batch=[...pending];pending.clear()
    for(let start=0;start<batch.length;start+=50){
      let remaining=batch.slice(start,start+50)
      for(let attempt=0;attempt<2&&remaining.length;attempt++){
        let rows=[];try{rows=(await cloud.getTempFileURL({fileList:remaining.map(([id])=>id)})).fileList||[]}catch{}
        const byId=new Map(rows.map(row=>[row.fileID||row.fileId,row.tempFileURL||'']))
        remaining=remaining.filter(([id,resolve])=>{const url=byId.get(id);if(url){resolve(url);return false}return true})
        if(remaining.length&&attempt===0)await new Promise(resolve=>setTimeout(resolve,150))
      }
      for(const [id,resolve]of remaining){cache.delete(id);resolve('')}
    }
  }
  function get(id){if(!id)return Promise.resolve('');if(cache.has(id))return cache.get(id);const promise=new Promise(resolve=>pending.set(id,resolve));cache.set(id,promise);if(!scheduled){scheduled=true;Promise.resolve().then(flush)}return promise}
  return async ids=>new Map(await Promise.all([...new Set(ids.filter(Boolean))].map(async id=>[id,await get(id)])))
}
async function mapLimit(rows,limit,fn){const results=new Array(rows.length);let cursor=0;await Promise.all(Array.from({length:Math.min(limit,rows.length)},async()=>{while(cursor<rows.length){const index=cursor++;results[index]=await fn(rows[index],index)}}));return results}
module.exports={createAssetResolver,mapLimit}
