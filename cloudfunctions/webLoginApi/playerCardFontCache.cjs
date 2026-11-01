const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),https=require('node:https')
const manifest=require('./player-card-font-manifest.json')
// 云函数代码目录（__dirname）在 CloudBase 运行时是只读的，字体缓存只能写系统临时目录。
const cacheRoot=path.join(os.tmpdir(),'sxf-player-card-fonts-v1')
let preparing=null
function itemOf(name) {
  const item=manifest.find(entry=>entry.name===name)
  if(!item) throw new Error('字体不可用')
  return item
}
function valid(file,expected) {
  try {return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')===expected} catch {return false}
}
function bundled(name,expected) {
  const candidates=[path.join(__dirname,'fonts',name),path.join(__dirname,name)]
  for(const file of candidates){if(fs.existsSync(file)&&valid(file,expected))return file}
  return ''
}
function pathFor(name) {
  const item=itemOf(name)
  return bundled(name,item.sha256)||path.join(cacheRoot,name)
}
function download(url) {
  return new Promise((resolve,reject)=>{
    const req=https.get(url,response=>{
      if(response.statusCode!==200){response.resume();reject(new Error('字体资源暂不可用，请重试'));return}
      const chunks=[];let total=0
      response.on('data',chunk=>{total+=chunk.length;if(total>12*1024*1024){req.destroy(new Error('字体资源过大'));return}chunks.push(chunk)})
      response.on('end',()=>resolve(Buffer.concat(chunks)));response.on('error',reject)
    })
    req.setTimeout(30000,()=>req.destroy(new Error('字体读取超时，请重试')));req.on('error',reject)
  })
}
async function ensureFonts() {
  if(preparing)return preparing
  preparing=Promise.all(manifest.map(async item=>{
    // 始终写临时目录，绝不写 __dirname，避免 EROFS。
    const file=path.join(cacheRoot,item.name)
    if(valid(file,item.sha256))return
    const bytes=await download(item.url)
    if(crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new Error('字体资源校验失败，请联系平台')
    fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+crypto.randomBytes(6).toString('hex')
    fs.writeFileSync(temp,bytes);fs.renameSync(temp,file)
  })).catch(error=>{preparing=null;throw error})
  return preparing
}
module.exports={pathFor,ensureFonts,cacheRoot}
