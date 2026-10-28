'use strict'
const {readAll}=require('./data-center/reader.cjs')
const {balanceOf}=require('./fanWallet.cjs')
const honeyRecharge=require('./honeyRecharge.cjs')
const text=value=>typeof value==='string'?value.trim():''
const time=value=>{const stamp=value&&typeof value==='object'&&!(value instanceof Date)?value.$date||value._date:value;const n=new Date(stamp||0).getTime();return Number.isFinite(n)?n:0}
// 充值态与档位只认服务端配置：未配置微信支付或档位时返回不可用原因，前端不得自行兜底档位
const rechargeState=()=>{try{return honeyRecharge.rechargeState()}catch(error){return{available:false,reason:'PAYMENT_NOT_CONFIGURED',error:'充值暂不可用',packs:[],rate:10}}}
const unknown=status=>({status,balance:null,entries:[],rechargeAvailable:false,rechargeReason:status==='not_open'?'HONEY_ACCOUNT_NOT_OPEN':['conflict','reconciliation'].includes(status)?'HONEY_RECONCILING':'',packs:[],recentOrders:[]})
// Only call after canonical natural-account authentication. Never create/migrate money.
module.exports=async function personalAccount({db,user,session}){
 const openId=text(session.serviceAccountOpenId),uid=text(user._id)
 if(!openId||!uid)return{success:false,code:'SERVICE_PRIVATE_AUTH_REQUIRED',error:'请重新连接微信'}
 const read=(name,where,fields)=>readAll(db,name,where,{fields,maxRows:20000})
 async function wallet(){try{
  const fields={serviceAccountOpenId:true,userId:true,honeyBalance:true,status:true}
  const profiles=await read('fan_profiles',{serviceAccountOpenId:openId},fields)
  if(profiles.length>1)return unknown('conflict')
  const rows=await read('fan_points_ledger',{serviceAccountOpenId:openId},{delta:true,reason:true,targetType:true,createTime:true,createdAt:true})
  if(!profiles.length)return unknown(rows.length?'conflict':'not_open')
  const profile=profiles[0]
  if(profile.userId&&profile.userId!==uid||['deleted','disabled','revoked'].includes(text(profile.status)))return unknown('conflict')
  const balance=balanceOf(rows)
  if(!Number.isSafeInteger(balance)||balance<0||!Number.isSafeInteger(profile.honeyBalance)||profile.honeyBalance!==balance)return unknown('reconciliation')
  if(rows.reduce((sum,row)=>sum+BigInt(row.delta),0n)!==BigInt(balance))return unknown('reconciliation')
  const current=await read('fan_profiles',{serviceAccountOpenId:openId},fields)
  if(current.length!==1||current[0]._id!==profile._id||current[0].honeyBalance!==balance||current[0].userId&&current[0].userId!==uid||['deleted','disabled','revoked'].includes(text(current[0].status)))return unknown('reconciliation')
  // 标签必须覆盖服务端实际写入的 reason：注册奖励、签到、连续签到、应援扣滴、充值、平台加滴、AI 定妆照与退回。
  // 历史枚举（fan-check-in / fan-support / support-player / support-team）保留兼容旧流水；未登记的原因仍退回通用文案，
  // 不把内部原因码或运营备注直接展示给用户。
  const reason={ 'fan-registration-bonus':'注册奖励', 'fan-daily-check-in':'签到奖励', 'fan-seven-day-check-in':'连续签到奖励', 'fan-ranking-support':'应援扣滴', 'honey-topup':'蜂蜜充值', 'honey-topup-refund':'充值退款冲销', 'honey-manual-grant':'平台加滴', 'ai-portrait-generation':'AI 定妆照', 'ai-portrait-failed':'定妆照失败退回', 'fan-check-in':'签到奖励', 'fan-check-in-streak':'连续签到奖励', 'fan-support':'应援扣滴', 'support-player':'应援球员', 'support-team':'应援球队' }
  const labelOf=row=>{const base=reason[text(row.reason)];if(!base)return row.delta>=0?'蜂蜜收入':'蜂蜜支出';if(text(row.reason)==='fan-ranking-support'){const target=text(row.targetType);return target==='team'?'应援球队':target==='player'?'应援球员':base}return base}
  await honeyRecharge.ensureSecrets(db)
  const recharge=rechargeState()
  return{status:'ready',balance,rechargeAvailable:recharge.available===true,rechargeReason:recharge.reason||'',packs:recharge.packs||[],recentOrders:await honeyRecharge.listOrders(db,openId,8),entries:rows.map(row=>({id:row._id,delta:row.delta,label:labelOf(row),time:time(row.createTime||row.createdAt)})).sort((a,b)=>b.time-a.time||b.id.localeCompare(a.id))}
 }catch(error){return unknown('unavailable')}}
 async function messages(){try{
  const rows=await read('messages',{userId:uid},{title:true,subject:true,subtitle:true,content:true,summary:true,createTime:true,createdAt:true,status:true})
  return{status:'ready',entries:rows.filter(row=>!['deleted','revoked'].includes(text(row.status))).map(row=>({id:row._id,title:text(row.title||row.subject)||'消息通知',content:text(row.subtitle||row.content||row.summary),time:time(row.createdAt||row.createTime)})).sort((a,b)=>b.time-a.time||b.id.localeCompare(a.id))}
 }catch(error){return{status:'unavailable',entries:[]}}}
 const [honey,notices]=await Promise.all([wallet(),messages()])
 return{success:true,data:{wallet:honey,messages:notices}}
}
