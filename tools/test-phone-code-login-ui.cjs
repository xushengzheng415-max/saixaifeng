'use strict'
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const {chromium}=require(process.env.SXF_PLAYWRIGHT_MODULE||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))
const root=path.resolve(__dirname,'..'),sourceRoot=process.env.SXF_TABLET_SOURCE_ROOT||root,output=path.join(root,'output/phone-code-login-20261028')
;(async()=>{
  fs.mkdirSync(output,{recursive:true})
  const {createServer}=await import(require('node:url').pathToFileURL(path.join(root,'web-admin-vue/node_modules/vite/dist/node/index.js')))
  const server=await createServer({root:path.join(sourceRoot,'web-admin-vue'),configFile:path.join(sourceRoot,'web-admin-vue/vite.config.js'),
    plugins:[{name:'phone-qa-cjs',enforce:'pre',transform(source,id){
      if(id.includes('generateSchedule')&&id.includes('stageOrder.cjs'))return source.replace('module.exports = {','export default {')
      if(id.includes('dataCenter/shared/match-score.cjs'))return source+'\nexport default globalThis.SxfMatchScore\n'
    }}],server:{host:'127.0.0.1',port:5192,strictPort:true,watch:{ignored:['**/dist*/**']}}})
  await server.listen()
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
  const results=[]
  try{
    for(const [width,height,touch] of [[1461,1026,false],[1548,1032,true],[1032,600,true]]){
      const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1})
      let sends=0,completes=0
      await context.route('https://*.tcloudbase.com/**',async route=>{
        let data={};try{data=route.request().postDataJSON()||{}}catch{}
        let result={success:false,error:'本地验证不访问生产数据'}
        if(data.action==='phoneCodeLoginOptions')result={success:true,enabled:true,existingAccountsOnly:true}
        if(data.action==='sendPhoneCodeLoginSms'){
          assert.equal(data.authToken,undefined);sends++;await new Promise(resolve=>setTimeout(resolve,120))
          result={success:true,loginChallenge:'a'.repeat(64),retryAfter:60,expiresIn:300}
        }
        if(data.action==='completePhoneCodeLogin'){
          assert.equal(data.authToken,undefined);completes++
          result=data.smsCode==='123456'?{success:true,authToken:'b'.repeat(64),user:{_id:'phone-qa-user',phone:'13900000001',nickname:'验证样例'}}:{success:false,code:'PHONE_CODE_MISMATCH',error:'验证码不正确，请重新输入'}
        }
        await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(result)})
      })
      const page=await context.newPage()
      await page.goto('http://127.0.0.1:5192/admin/#/login',{waitUntil:'domcontentloaded'})
      await page.locator('.modern-login .login-brand img').waitFor({timeout:30000})
      const layout=await page.evaluate(()=>{
        const logo=document.querySelector('.login-brand img').getBoundingClientRect(),qr=document.querySelector('.qr-shell').getBoundingClientRect()
        return{logoOnLeft:logo.right<qr.left,fits:qr.right<=innerWidth&&qr.bottom<=innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1}
      })
      assert.equal(layout.logoOnLeft,true);assert.equal(layout.fits,true);assert.equal(layout.overflow,false);assert.equal(sends,0)
      await page.screenshot({path:path.join(output,`wechat-${width}.png`)})
      await page.getByRole('tab',{name:'手机号登录'}).click()
      await page.locator('#login-phone').fill('13900000001')
      await page.waitForFunction(()=>!document.querySelector('.phone-code-row button').disabled)
      await page.evaluate(()=>{localStorage.setItem('authToken','old-token');localStorage.setItem('currentOrg','old-org');sessionStorage.setItem('sxfStaffPermissions','old-grant')})
      await page.locator('.phone-code-row button').evaluate(button=>{button.click();button.click()})
      await page.locator('.login-feedback').filter({hasText:'验证码已发送'}).waitFor()
      assert.equal(sends,1);assert.equal(await page.locator('.phone-code-row button').isDisabled(),true)
      await page.locator('#login-code').fill('999999');await page.locator('.phone-submit').click()
      await page.locator('.login-feedback').filter({hasText:'验证码不正确'}).waitFor()
      assert.equal(await page.evaluate(()=>localStorage.getItem('authToken')),'old-token')
      await page.screenshot({path:path.join(output,`phone-${width}.png`)})
      await page.evaluate(async()=>{
        const {default:router}=await import('/admin/src/router/index.js')
        router.beforeEach(to=>{if(to.path==='/organization-onboarding'){window.__phoneLoginTarget=to.path;return false}})
      })
      await page.locator('#login-code').fill('123456');await page.locator('.phone-submit').click()
      await page.waitForFunction(()=>window.__phoneLoginTarget==='/organization-onboarding')
      const stored=await page.evaluate(()=>({id:localStorage.getItem('userId'),oldOrg:localStorage.getItem('currentOrg'),oldGrant:sessionStorage.getItem('sxfStaffPermissions'),loggedIn:localStorage.getItem('isLoggedIn')}))
      assert.deepEqual(stored,{id:'phone-qa-user',oldOrg:null,oldGrant:null,loggedIn:'true'})
      results.push({width,height,touch,...layout,sendDeduplicated:sends===1,wrongCodeHandled:completes===2,oldTenantCleared:true,postLoginTargetVerified:true})
      await context.close()
    }
    const context=await browser.newContext({viewport:{width:1032,height:600},hasTouch:true,isMobile:true})
    await context.route('https://*.tcloudbase.com/**',route=>route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({success:true,enabled:false})}))
    const page=await context.newPage();await page.goto('http://127.0.0.1:5192/admin/#/login')
    await page.getByRole('tab',{name:'手机号登录'}).click();await page.locator('.phone-availability').waitFor()
    await page.locator('#login-phone').fill('13900000001');assert.equal(await page.locator('.phone-code-row button').isDisabled(),true)
    const report={status:'passed',results,backendUnavailableDisablesSms:true,realSmsSent:false,productionWrites:false}
    fs.writeFileSync(path.join(output,'ui-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report))
  }finally{await browser.close();await server.close()}
})().catch(error=>{console.error(error.stack);process.exitCode=1})
