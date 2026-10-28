export function createChunkUploadError(result, fallback) {
  const reason=[result?.message,result?.error].find(value=>typeof value==='string'&&value.trim())
  const error=new Error(reason||fallback)
  if(typeof result?.code==='string')error.code=result.code
  return error
}
