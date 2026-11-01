'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const http = require('node:http')
const { chromium } = require('./lib/load-playwright.cjs')
const root = path.resolve(__dirname,'..')
const backend = fs.readFileSync(process.env.SXF_REFEREE_OAUTH_BACKEND || path.join(root,'cloudfunctions/webLoginApi/index.js'),'utf8')
const helpers = backend.slice(backend.indexOf('function normalizeServiceH5Url('),backend.indexOf('async function createRefereeOAuthUrl('))
const resolveReturn = vm.runInNewContext(helpers+'\nrefereeOAuthReturnUrl',{URL})
for(const base of ['https://www.sxffootball.cn/service-account-h5/','https://www.sxffootball.cn/preview/service-account-h5/']) {
  assert.equal(resolveReturn(base+'?refereeInvite=fixture-ref-invite&code=old&state=old#fragment'),base+'?refereeInvite=fixture-ref-invite')
  assert.equal(resolveReturn(base),base)
}
assert.equal(resolveReturn('https://evil.example/service-account-h5/?refereeInvite=fixture'),'')
assert.equal(resolveReturn('https://www.sxffootball.cn/admin/?refereeInvite=fixture'),'')
assert.equal(resolveReturn('http://www.sxffootball.cn/service-account-h5/'),'')
assert.equal(resolveReturn('https://www.sxffootball.cn/service-account-h5/?refereeInvite='+'x'.repeat(257)),'')

async function main(){
  const site=path.join(root,'service-account-h5')
  const server=http.createServer((req,res)=>{
    const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname)
    const original=path.resolve(site,'.'+(rel==='/'?'/index.html':rel))
    const file=rel==='/app.js' && process.env.SXF_REFEREE_H5_APP || rel==='/' && process.env.SXF_REFEREE_H5_INDEX || original
    if(!original.startsWith(site+path.sep)){res.writeHead(403).end();return}
    fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(data)})
  })
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  const origin='http://127.0.0.1:'+server.address().port
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
  async function scenario(query,{inviteFails=false,seedSession=false,expiredSession=false}={}){
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1})
    const calls=[]
    if(seedSession)await context.addInitScript(()=>localStorage.setItem('sxf_referee_h5_session','fixture-session'))
    await context.route('**/*',async route=>{
      const req=route.request()
      if(req.url().startsWith(origin))return route.continue()
      if(!req.url().includes('/webLoginApi'))return route.abort()
      const body=req.postDataJSON();calls.push(body)
      let response
      if(body.action==='serviceRefereeOAuth')response={success:true,refereeSessionToken:'fixture-session'}
      else if(body.action==='serviceRefereeOAuthUrl')response={success:true,authorizeUrl:'about:blank'}
      else if(body.workflowAction==='getRefereeInvitation')response=expiredSession?{success:false,code:'H5_AUTH_REQUIRED',message:'登录已过期'}:inviteFails?{success:false,message:'邀请已失效，请重新扫码'}:{success:true,data:{tournamentName:'隔离测试赛事'}}
      else if(body.workflowAction==='getWorkbench')response={success:true,data:{needsPhone:true}}
      else throw new Error('Unexpected API call '+body.action+' / '+body.workflowAction)
      return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(response)})
    })
    const page=await context.newPage()
    await page.goto(origin+'/?'+query)
    return {context,page,calls}
  }
  try{
    const callback=await scenario('code=fixture-code&state=fixture-state&refereeInvite=fixture-ref-invite')
    await callback.page.getByRole('heading',{name:'提交裁判资料',exact:true}).waitFor()
    assert.equal(callback.calls.filter(x=>x.workflowAction==='getRefereeInvitation').length,1)
    assert.equal(callback.calls.some(x=>x.workflowAction==='getWorkbench'),false)
    assert.equal(callback.calls.some(x=>['sendBindSms','verifyBindSms'].includes(x.workflowAction)),false)
    fs.mkdirSync(path.join(root,'output/referee-registration-20261101'),{recursive:true})
    await callback.page.screenshot({path:path.join(root,'output/referee-registration-20261101/registration-return.png'),fullPage:true})
    await callback.context.close()
    const invalid=await scenario('code=fixture-code&state=fixture-state&refereeInvite=expired-fixture',{inviteFails:true})
    await invalid.page.getByRole('heading',{name:'邀请暂不可用',exact:true}).waitFor()
    assert.equal(invalid.calls.some(x=>x.workflowAction==='getWorkbench'),false)
    await invalid.context.close()
    const initial=await scenario('refereeInvite=fixture-ref-invite')
    await initial.page.waitForURL('about:blank')
    assert.equal(initial.calls[0].returnUrl,origin+'/?refereeInvite=fixture-ref-invite')
    await initial.context.close()
    const workbench=await scenario('',{seedSession:true})
    await workbench.page.getByRole('heading',{name:'绑定裁判身份',exact:true}).waitFor()
    assert.equal(workbench.calls.some(x=>x.workflowAction==='getRefereeInvitation'),false)
    await workbench.context.close()
    const expired=await scenario('refereeInvite=fixture-ref-invite',{seedSession:true,expiredSession:true})
    await expired.page.waitForURL('about:blank')
    const retry=expired.calls.find(x=>x.action==='serviceRefereeOAuthUrl')
    assert.equal(retry.returnUrl,origin+'/?refereeInvite=fixture-ref-invite')
    assert.equal(expired.calls.some(x=>x.workflowAction==='getWorkbench'),false)
    await expired.context.close()
    console.log('裁判登记OAuth返回白名单8项与真实页面5场景通过；全部API已隔离，未发短信或写云端')
  }finally{await browser.close();await new Promise(r=>server.close(r))}
}
main().catch(e=>{console.error(e);process.exitCode=1})
