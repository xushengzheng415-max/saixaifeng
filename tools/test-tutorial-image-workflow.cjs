'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { pathToFileURL } = require('node:url')
const { chromium } = require('./lib/load-playwright.cjs')
const jsQR = require('../platform-admin-vue/node_modules/jsqr')
const baseUrl = process.env.TUTORIAL_TEST_BASE_URL || 'http://127.0.0.1:5199'
const allowedHost = new URL(baseUrl).hostname
const root = path.resolve(__dirname,'..'), out = path.join(root,'output/tutorial-image-workflow-20261104')
const id = 'tutorial_22222222-2222-4222-8222-222222222222', rows = [], uploads = [], saved = [], external = [], errors = []
function response(body) {
  const p = body.functionParams || {}
  if (body.action === 'uploadImage') { uploads.push(body.base64Data); return {success:true,fileID:'cloud://offline/processed-'+uploads.length+'.jpg',tempUrl:body.base64Data} }
  if (body.action === 'checkLogin') return {success:true,user:{_id:'platform-owner',isPlatformOwner:true}}
  if (body.functionName === 'platformOwner') return {success:true,isPlatformOwner:true,requests:[]}
  if (p.action === 'tutorialList') return {success:true,rows,total:rows.length,imageUrls:Object.fromEntries(uploads.map((u,i)=>['cloud://offline/processed-'+(i+1)+'.jpg',u]))}
  if (p.action === 'tutorialSave') { saved.push(p);rows[0]={_id:id,revision:1,draft:p.content,published:p.content,isPublished:p.mode==='publish'};return {success:true,id} }
  return {success:true,data:{banners:[],tournaments:[],organizers:[],accounts:[],teams:[],supportRequests:[],stats:{}}}
}
;(async()=>{
  fs.mkdirSync(out,{recursive:true})
  const {createServer}=await import(pathToFileURL(path.join(root,'platform-admin-vue/node_modules/vite/dist/node/index.js')))
  const server=await createServer({root:path.join(root,'platform-admin-vue'),configFile:path.join(root,'platform-admin-vue/vite.config.js'),server:{host:'127.0.0.1',port:5199,strictPort:true,watch:{ignored:['**/node_modules/**','**/dist*/**']}}})
  let browser
  try {
    await server.listen();browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
    const ctx=await browser.newContext({viewport:{width:1440,height:1100}})
    await ctx.addInitScript(()=>{localStorage.setItem('platformAuthToken','offline-qa');localStorage.setItem('platformSession',JSON.stringify({userId:'platform-owner',userName:'平台负责人',user:{_id:'platform-owner',isPlatformOwner:true},loginAt:Date.now()}));sessionStorage.setItem('sxfPlatformAuthContext','platform')})
    await ctx.route('**/webLoginApi',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response(route.request().postDataJSON()))}))
    await ctx.route('**/*',route=>{const u=new URL(route.request().url());if(!['127.0.0.1','localhost',allowedHost].includes(u.hostname) && !u.hostname.includes('tcloudbase.com')){external.push(u.hostname);return route.abort()};return route.fallback()})
    const page=await ctx.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message))
    await page.goto(baseUrl+'/#/tournament-center-admin?section=tutorials')
    const fixture=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1200;c.height=800;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,1200,800);x.fillStyle='#f2f5f3';x.fillRect(0,0,1200,80);x.fillStyle='#152d20';x.font='bold 34px "Microsoft YaHei"';x.fillText('球员资料',40,52);x.fillStyle='#176b43';x.fillRect(55,145,95,95);x.fillStyle='#fff';x.font='bold 34px Arial';x.fillText('FC',78,205);x.fillStyle='#151515';x.font='32px "Microsoft YaHei"';x.fillText('姓名：张三',220,185);x.fillText('电话：13812345678',220,265);x.fillText('郑州测试足球队',220,345);x.fillStyle='#176b43';x.fillRect(870,620,220,66);x.fillStyle='#fff';x.fillText('保存',947,664);return c.toDataURL('image/png')})
    const fixtureFile={name:'offline-private-fixture.png',mimeType:'image/png',buffer:Buffer.from(fixture.split(',')[1],'base64')}
    await page.getByRole('button',{name:'新建教程',exact:true}).click()
    const builder=page.getByRole('dialog',{name:'新建教程',exact:true})
    await builder.getByRole('textbox').nth(0).fill('球队上传图片操作教程（离线验收）')
    await builder.getByRole('textbox',{name:'步骤描述',exact:true}).fill('第一步：选择已处理隐私的截图。')
    const pasteScreenshot = async target => {
      await target.focus()
      await target.evaluate(async (element, data) => { const blob=await (await fetch(data)).blob(), file=new File([blob],'clipboard-screenshot.png',{type:'image/png'}), transfer=new DataTransfer();transfer.items.add(file);element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true})) },fixture)
    }
    const plainPasteAllowed = await builder.getByRole('textbox',{name:'步骤描述',exact:true}).evaluate(element => { const transfer=new DataTransfer();transfer.setData('text/plain','普通文字');const e=new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true});element.dispatchEvent(e);return !e.defaultPrevented })
    assert.equal(plainPasteAllowed,true,'plain text paste remains native')
    await pasteScreenshot(builder.getByRole('group',{name:'步骤截图粘贴区',exact:true}))
    assert.equal(await builder.getByRole('textbox',{name:'步骤描述',exact:true}).inputValue(),'第一步：选择已处理隐私的截图。')
    let editor=page.getByRole('dialog',{name:'编辑步骤截图',exact:true})
    await editor.getByRole('button',{name:'一键遮隐私',exact:true}).click()
    await editor.locator('.image-status').filter({hasText:/[1-9][0-9]* 处遮盖/}).waitFor({timeout:90000})
    assert.equal(uploads.length,0,'original image must not be uploaded during local OCR')
    assert.equal(await editor.getByRole('button',{name:'使用处理后图片',exact:true}).isDisabled(),true)
    const draw=async(tool,a,b)=>{await editor.getByText(tool,{exact:true}).click();const rect=await editor.locator('canvas').boundingBox();await page.mouse.move(rect.x+a[0]*rect.width/1200,rect.y+a[1]*rect.height/800);await page.mouse.down();await page.mouse.move(rect.x+b[0]*rect.width/1200,rect.y+b[1]*rect.height/800,{steps:10});await page.mouse.up()}
    await draw('方框',[840,590],[1120,720]);await draw('箭头',[760,480],[950,620]);await editor.getByRole('button',{name:'撤销',exact:true}).click();await editor.getByRole('button',{name:'重做',exact:true}).click()
    await editor.getByText('已核对隐私区域',{exact:true}).click()
    await page.screenshot({path:path.join(out,'privacy-and-annotations.png')})
    await editor.getByRole('button',{name:'使用处理后图片',exact:true}).click();await editor.waitFor({state:'hidden'})
    assert.equal(uploads.length,1);assert.notEqual(uploads[0],fixture);assert.ok(uploads[0].startsWith('data:image/jpeg;'))
    const pixels=await page.evaluate(async(data)=>{const i=new Image();i.src=data;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);const phone=x.getImageData(220,235,350,28).data,logo=x.getImageData(80,170,45,45).data,all=x.getImageData(0,0,c.width,c.height).data;let grey=0,logoGrey=0,red=0;for(let k=0;k<phone.length;k+=4)if(phone[k]>212&&phone[k]<242&&Math.abs(phone[k]-phone[k+1])<12&&Math.abs(phone[k+1]-phone[k+2])<12)grey++;for(let k=0;k<logo.length;k+=4)if(logo[k]>212&&logo[k]<242&&Math.abs(logo[k]-logo[k+1])<12)logoGrey++;for(let k=0;k<all.length;k+=4)if(all[k]>140&&all[k]>all[k+1]*1.6&&all[k]>all[k+2]*1.6)red++;return {grey,logoGrey,red}},uploads[0])
    assert.ok(pixels.grey>350*28*.8,'phone text should be covered');assert.ok(pixels.logoGrey>45*45*.8,'coloured logo candidate should be covered');assert.ok(pixels.red>500,'annotations are flattened into output')
    await builder.getByRole('button',{name:'添加下一步',exact:true}).click();await builder.getByRole('textbox',{name:'步骤描述',exact:true}).fill('第二步：点击保存。')
    await pasteScreenshot(builder.getByRole('textbox').nth(0));assert.equal(await builder.getByRole('textbox').nth(0).inputValue(),'球队上传图片操作教程（离线验收）');editor=page.getByRole('dialog',{name:'编辑步骤截图',exact:true});await editor.getByRole('button',{name:'沿用上一步',exact:true}).click();await editor.getByText('已核对隐私区域',{exact:true}).click();await editor.getByRole('button',{name:'使用处理后图片',exact:true}).click();await editor.waitFor({state:'hidden'});assert.equal(uploads.length,2)
    await page.screenshot({path:path.join(out,'step-builder.png')})
    await builder.getByRole('button',{name:'上一步',exact:true}).click();assert.equal(await builder.getByRole('textbox',{name:'步骤描述',exact:true}).inputValue(),'第一步：选择已处理隐私的截图。')
    await builder.getByRole('button',{name:'发布教程',exact:true}).click();await page.getByRole('button',{name:'发布',exact:true}).click()
    const share=page.getByRole('dialog',{name:'分享教程',exact:true});await share.getByRole('button',{name:'下载海报',exact:true}).waitFor();await page.waitForFunction(()=>{const c=document.querySelector('.poster-preview canvas');return c?.width===720 && !document.querySelector('.poster-preview .el-loading-mask')})
    const qrPixels=await share.locator('canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(48,Number(c.dataset.qrY),230,230).data))
    const decoded=jsQR(new Uint8ClampedArray(qrPixels),230,230);assert.equal(decoded?.data,'https://www.sxffootball.cn/service-account-h5/tutorial.html?id='+id)
    const downloadPromise=page.waitForEvent('download');await share.getByRole('button',{name:'下载海报',exact:true}).click();await(await downloadPromise).saveAs(path.join(out,'share-poster.png'))
    assert.equal(saved[0].content.steps.length,2);assert.equal(saved[0].content.steps[0].title,'第1步');assert.deepEqual(Object.keys(saved[0].content.steps[0]).sort(),['image','text','title']);assert.ok(!JSON.stringify(saved[0]).includes('data:image'),'draft payload cannot contain originals or editing history')
    await page.screenshot({path:path.join(out,'share-dialog.png')});await share.getByRole('button',{name:'关闭',exact:true}).click();await share.waitFor({state:'hidden'})
    await page.getByRole('button',{name:'编辑',exact:true}).click();await page.setViewportSize({width:390,height:844});const mobileBuilder=page.getByRole('dialog',{name:'编辑教程',exact:true});assert.equal(await mobileBuilder.evaluate(d=>d.scrollWidth>d.clientWidth+1),false);await page.screenshot({path:path.join(out,'builder-mobile.png'),fullPage:true})
    assert.deepEqual(errors,[]);assert.deepEqual(external,[])
    fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'passed',pixels,qr:decoded.data,uploads:uploads.length,externalRequests:external,errors},null,2));console.log('PASS: screenshot-region paste, title-field paste, native text paste preserved, real local Chinese/English OCR, phone/logo masking, arrows/boxes, undo/redo, no original upload, reuse, two-step publication, clean payload, decoded poster QR, download and mobile layout')
  } finally {if(browser)await browser.close();await server.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
