// Compatibility entry for the independently deployed platform bundle (2026-10-05).
// Keep its current modules intact; mount the shared correction component only in duration issue rows.
import {createApp,h} from 'vue'
import ElementPlus from 'element-plus'
import DurationVerification from './views/data/DurationVerification.vue'
const mounted = new Map()
let scheduled = false
function scan() {
  scheduled=false
  for (const [row,item] of mounted) if(!row.isConnected){item.app.unmount();mounted.delete(row)}
  for(const row of document.querySelectorAll('.el-table__body tr')) {
    if(!/比赛时长未核实|比赛时长缺少依据|MATCH_DURATION_/.test(row.textContent))continue
    const matchId=row.textContent.match(/\b[a-f0-9]{24,32}\b/i)?.[0]
    if(!matchId)continue
    if(mounted.get(row)?.matchId===matchId)continue
    if(mounted.has(row)){mounted.get(row).app.unmount();mounted.get(row).host.remove();mounted.delete(row)}
    const host=document.createElement('span');host.style.marginLeft='14px';row.querySelector('td:last-child .cell')?.append(host)
    const app=createApp({render:()=>h(DurationVerification,{issue:{code:'MATCH_DURATION_EVIDENCE_MISSING',matchId},allowed:true,onSaved:()=>{
      const pane=row.closest('.el-tab-pane')||document
      const button=[...pane.querySelectorAll('button')].find(item=>item.textContent.trim()==='查询')||[...document.querySelectorAll('button')].find(item=>item.textContent.trim()==='查询')
      button?.click()
    }})})
    app.use(ElementPlus).mount(host);mounted.set(row,{app,host,matchId})
  }
}
const observer=new MutationObserver(()=>{if(!scheduled){scheduled=true;requestAnimationFrame(scan)}})
observer.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});scan()
