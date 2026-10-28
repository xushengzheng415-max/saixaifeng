const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs')
const {chromium}=require('./lib/load-playwright.cjs')
async function main(){
 const root=path.resolve(__dirname,'../platform-admin-vue'),{build}=require('../platform-admin-vue/node_modules/esbuild'),{parse,compileScript}=require('../platform-admin-vue/node_modules/@vue/compiler-sfc')
 const bundle=await build({stdin:{contents:"import {createApp} from 'vue';import ElementPlus from 'element-plus';import Repair from './src/views/data/PlayerCardMatchRepair.vue';createApp(Repair,{matchId:'isolated-zero-match'}).use(ElementPlus).mount('#app')",resolveDir:root},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'isolated-repair',setup(b){b.onResolve({filter:/^@\/utils\/cloud$/},()=>({path:'cloud-stub',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export async function playerCardTemplateRequest(action,params){return window.repairApi(params)}'}));b.onLoad({filter:/\.vue$/},args=>({contents:compileScript(parse(fs.readFileSync(args.path,'utf8')).descriptor,{id:'repair-test',inlineTemplate:true}).content,resolveDir:path.dirname(args.path)}))}}]})
 let browser
 try{
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
 const page=await browser.newPage({viewport:{width:1050,height:850}}),writes=[]
 page.on('pageerror',e=>console.error(e.message))
 const side=(teamId)=>({teamId,name:teamId,players:[],lineup:{known:true,starters:[],bench:[]}})
 await page.exposeFunction('repairApi',params=>{if(params.workflowAction==='auditRepairSave'){writes.push(params);return {success:true}}return {success:true,matchName:'零事件验收',tournamentName:'隔离赛事',divisionName:'中年组',date:'2026-10-04',editable:true,revision:'fixture',scores:{home:0,away:0},durationMinutes:60,sides:{home:side('主队'),away:side('客队')},events:[],eventsComplete:false}})
 await page.setContent('<div id="app"></div>');await page.addStyleTag({path:path.join(root,'node_modules/element-plus/dist/index.css')});await page.addScriptTag({content:bundle.outputFiles[0].text})
 const save=page.getByRole('button',{name:'保存资料'}),complete=page.getByText('已核对原报告：本场无进球、牌罚和换人',{exact:true})
 await complete.click();await page.getByText('确认按原始比赛记录补充',{exact:true}).click();await save.click()
 await page.getByText('请填写至少4字的原始资料来源',{exact:true}).waitFor();assert.equal(writes.length,0)
 await page.getByRole('textbox').fill('本场纸质裁判报告');await save.click();await page.getByText('资料已保存',{exact:true}).waitFor()
 assert.equal(writes.length,1);assert.deepEqual(writes[0].events,[]);assert.equal(writes[0].eventsComplete,true);assert.equal(writes[0].confirmedSource,true)
 console.log('PASS: zero-event confirmation, visible required source validation, no invalid write, complete empty event payload')
 }finally{await browser?.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
