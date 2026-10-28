'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.SXF_PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE || process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root = path.resolve(__dirname, '..');
const sourceRoot = process.env.SXF_TABLET_SOURCE_ROOT || root;
const output = path.join(root, 'output/tablet-landscape-20261028');
const pages=[['space','/tournament-space'],['console','/tournaments/qa-tournament-2026'],['teams','/tournaments/qa-tournament-2026/teams?divisionId=qa-division-u16&mode=professional'],['matches','/tournaments/qa-tournament-2026/matches'],['settings','/tournaments/qa-tournament-2026/matches?view=settings'],['match','/tournaments/qa-tournament-2026/match/qa-match-u8-012']];
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const vitePath=path.join(root,'web-admin-vue/node_modules/vite/dist/node/index.js');
  const {createServer}=await import(require('node:url').pathToFileURL(vitePath));
  const server=await createServer({root:path.join(sourceRoot,'web-admin-vue'),configFile:path.join(sourceRoot,'web-admin-vue/vite.config.js'),
    plugins:[{
      name:'tablet-qa-stage-order-cjs',enforce:'pre',
      transform(source,id){
        if(id.includes('generateSchedule')&&id.includes('stageOrder.cjs')) return source.replace('module.exports = {','export default {')
        if(id.includes('dataCenter/shared/match-score.cjs')) return source + '\nexport default globalThis.SxfMatchScore\n'
      }
    }],
    server:{host:'127.0.0.1',port:5186,strictPort:true,watch:{ignored:['**/dist*/**']}}});
  await server.listen();
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const results=[];let blockedCloudRequests=0;
  try{
    for(const [width,height,scale] of [[1548,1032,2],[1280,800,1]]){
      const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:scale,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14; vivo Pad3 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'});
      await context.route('**/*',route=>{const host=new URL(route.request().url()).hostname;if(/tcloudbase(?:app)?\.com$/.test(host)){blockedCloudRequests++;return route.abort()}return route.continue()});
      const page=await context.newPage();
      page.on('response',response=>{if(response.status()>=400&&response.url().startsWith('http://127.0.0.1'))console.log(`HTTP ${response.status()} ${response.url().split('?')[0]}`)});
      page.on('console',message=>{if(message.type()==='error')console.log('BROWSER '+message.text().slice(0,500))});
      page.on('pageerror',error=>console.log('PAGEERROR '+error.stack));
      for(const [name,route] of pages.filter(([name])=>!process.env.SXF_TABLET_PAGE||name===process.env.SXF_TABLET_PAGE)){
        console.log(`Checking ${name} at ${width}x${height}`);
        const url=`http://127.0.0.1:5186/admin/#${route}${route.includes('?')?'&':'?'}visualQa=1`;
        await page.goto('about:blank');
        await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
        await page.locator('.layout .content-area').waitFor({timeout:30000}).catch(async error=>{
          console.log('Failed page: '+page.url());console.log((await page.locator('body').innerText()).slice(0,1200));
          await page.screenshot({path:path.join(output,'failure.png')});throw error;
        });
        const expected={space:'.tournament-space',console:'.tournament-console',teams:'.tournament-teams',matches:'.schedule-v2',settings:'.schedule-v2 .settings-card',match:'.match-detail'}[name];
        await page.locator(expected).first().waitFor({timeout:20000});
        await page.waitForTimeout(800);
        const state=await page.evaluate(()=>{
          const area=document.querySelector('.content-area');const right=area.getBoundingClientRect().right;
          return {coarse:matchMedia('(pointer:coarse)').matches,landscape:matchMedia('(orientation:landscape)').matches,
            documentOverflow:document.documentElement.scrollWidth>innerWidth+2,contentOverflow:area.scrollWidth>area.clientWidth+2,
            sidebarVisible:!!document.querySelector('.sidebar')&&getComputedStyle(document.querySelector('.sidebar')).display!=='none',
            menuVisible:Array.from(document.querySelectorAll('.tablet-menu-toggle')).some(button=>button.getBoundingClientRect().width>0),
            offenders:Array.from(area.querySelectorAll('*')).filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.right>right+3&&!el.closest('.el-table,.el-scrollbar,.division-policy-table,.calendar-board')}).slice(0,8).map(el=>({tag:el.tagName,className:String(el.className).slice(0,90),right:Math.round(el.getBoundingClientRect().right)}))};
        });
        await page.screenshot({path:path.join(output,`${name}-${width}.png`)});
        results.push({name,width,height,scale,...state});console.log(JSON.stringify(results.at(-1)));
        if(name==='settings'){
          const chip=page.locator('.kickoff-chip-list .el-tag').first();
          await chip.evaluate(el=>el.scrollIntoView({block:'center'}));await chip.tap();
          await page.locator('.kickoff-chip-list .el-button').filter({hasText:'确认'}).waitFor();
          results.at(-1).touchTimeEdit=true;
        }
        if(name==='match'){
          const edit=page.locator('.detail-actions .el-button').filter({hasText:'编辑比赛'});
          if(await edit.count()&&await edit.isVisible()){
            await edit.tap();
          }else{
            await page.locator('.user-avatar-wrapper').tap();
            await page.locator('.el-dropdown-menu__item:visible').filter({hasText:'修改个人资料'}).tap();
          }
          await page.locator('.el-dialog:visible').waitFor();await page.waitForTimeout(250);
          const bounds=await page.locator('.el-dialog:visible').evaluate(el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight}});
          if(bounds.left<0||bounds.right>bounds.width+1||bounds.top<0||bounds.bottom>bounds.height+1)throw new Error('Dialog outside tablet screen');
          results.at(-1).dialogFits=true;await page.screenshot({path:path.join(output,`match-dialog-${width}.png`)});
          await page.locator('.el-dialog:visible .el-button').filter({hasText:'取消'}).tap();
        }
        if(state.menuVisible&&name==='teams'){
          await page.locator('.tablet-menu-toggle:visible').click();await page.locator('.tablet-navigation-drawer:visible').waitFor();
          await page.waitForFunction(()=>document.querySelector('.tablet-navigation-drawer')?.getBoundingClientRect().left>=-1);
          const parity=await page.evaluate(()=>{
            const expected=[...document.querySelectorAll('.sidebar .nav-item:not(:has(.submenu-arrow)) .nav-label,.sidebar .nav-sub-item .sub-label')].map(el=>el.textContent.trim()).sort();
            const actual=[...document.querySelectorAll('.tablet-menu-item,.tablet-menu-group button')].map(el=>el.textContent.trim()).sort();
            return {expected,actual,equal:JSON.stringify(expected)===JSON.stringify(actual)};
          });
          if(!parity.equal)throw new Error('Tablet menu differs from authorized desktop menu: '+JSON.stringify(parity));
          await page.screenshot({path:path.join(output,`menu-${width}.png`)});
          await page.locator('.tablet-navigation-drawer .el-drawer__close-btn').click();
        }
      }
      await context.close();
    }
    const desktop=await browser.newContext({viewport:{width:1440,height:960},isMobile:false,hasTouch:false});
    const page=await desktop.newPage();await page.goto('http://127.0.0.1:5186/admin/#/tournaments/qa-tournament-2026/teams?visualQa=1',{waitUntil:'domcontentloaded'});await page.locator('.sidebar').waitFor();
    const desktopUnchanged=await page.locator('.sidebar').isVisible()&&!await page.locator('.tablet-menu-toggle').isVisible();await desktop.close();
    const failed=results.filter(row=>!row.coarse||!row.landscape||row.documentOverflow||row.contentOverflow||row.sidebarVisible);
    const report={status:failed.length||!desktopUnchanged?'failed':'passed',target:'vivo Pad3 Pro landscape, 3096x2064 physical at 2x',results,failed,desktopUnchanged,blockedCloudRequests};
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,failures:failed.length,desktopUnchanged}));process.exitCode=report.status==='passed'?0:1;
  }finally{await browser.close();await server.close()}
})().catch(error=>{console.error(error.stack);process.exitCode=1});
