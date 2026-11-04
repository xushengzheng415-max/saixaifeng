import { uploadLargeFileViaCloud } from './cloud'
export async function uploadTutorialImage(file, onProgress = () => {}) {
  if (!file || file.size <= 0 || file.size > 2*1024*1024) throw new Error('图片无效或超过2MB，请重新处理')
  onProgress(0)
  try {
    return await uploadLargeFileViaCloud('tutorial-images/'+crypto.randomUUID()+'.jpg',file,{
      chunkSize:24*1024,
      fallbackChunkSize:8*1024,
      onProgress:(done,total)=>onProgress(Math.round(done*100/total)),
      onRetry:()=>onProgress(0)
    })
  } catch (error) {
    if (/EXCEED_MAX_PAYLOAD_SIZE|payload size|\b413\b/i.test(error.message || '')) throw new Error('图片上传仍超出限制，请下载处理图后重试')
    throw new Error(error.message || '图片上传中断，请重试，当前标注已保留')
  }
}
