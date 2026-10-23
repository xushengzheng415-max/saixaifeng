import {callFunction,getPlayerReadIdentity} from '../../utils/cloud'
export async function dataHub(action,params={}){const identity=getPlayerReadIdentity(),reply=await callFunction('dataCenter',{action,...params});if(identity!==getPlayerReadIdentity())throw new Error('账号或机构已切换，请重新加载');if(!reply?.success)throw new Error(reply?.error||reply?.message||'数据读取失败，请重试');if(reply.hubVersion!=='football-data-hub/1')throw new Error('数据总站接口尚未就绪，请稍后重试');return reply}
export const metric=value=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('zh-CN'):'—'
export function dateText(value){if(!value)return '—';const d=new Date(value?.$date||value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Shanghai'}).format(d):'—'}
export const safeImage=value=>typeof value==='string'&&(/^(https?:\/\/|data:image\/png;base64,)/.test(value))?value:''
export const teamMetrics=[{key:'played',label:'场次'},{key:'wins',label:'胜'},{key:'draws',label:'平'},{key:'losses',label:'负'},{key:'goalsFor',label:'进球'},{key:'goalsAgainst',label:'失球'}]
