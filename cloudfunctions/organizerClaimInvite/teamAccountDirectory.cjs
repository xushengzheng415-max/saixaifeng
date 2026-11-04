'use strict'
const text=v=>String(v==null?'':v).trim()
const phone=v=>text(v).replace(/\D/g,'')
const active=m=>['active','accepted','claimed'].includes(text(m.status))
async function readRows(db,collection,where){
 const result=[];let cursor=''
 for(;;){
  const query=cursor?db.command.and([where,{_id:db.command.gt(cursor)}]):where
  const page=(await db.collection(collection).where(query).orderBy('_id','asc').limit(100).get()).data||[]
  if(!page.length)return result
  for(const row of page){if(!row._id||String(row._id)<=cursor)throw Error('账号资料分页异常，请重试');cursor=String(row._id);result.push(row);if(result.length>2000)throw Error('球队账号资料过多，请联系管理员核对')}
 }
}
function userPhone(user){
 const first=phone(user.phone),second=phone(user.phoneNumber)
 if(first&&second&&first!==second)throw Error('账号手机号存在冲突，请先核对账号')
 return first||second
}
const meaningfulName=v=>{const name=text(v);return ['用户','微信用户','未命名'].includes(name)?'':name}
async function complete({db,team,teamId,personnel,memberships}){
 // ownerId is authoritative; historical claim fields never override a completed transfer.
 const ownerId=text(team.ownerId||team.ownerUserId||team.claimedByUserId)
 const staff=(await readRows(db,'coaches',db.command.or([{teamId},{teamCode:teamId}]))).filter(s=>[s.teamId,s.teamCode].filter(Boolean).every(id=>String(id)===teamId)&&!['deleted','archived'].includes(text(s.status)))
 const rows=(personnel||[]).map(p=>{const copy={...p};delete copy.accountUserId;return copy})
 const ids=[...new Set([ownerId,...memberships.filter(active).map(m=>m.userId||m.memberUserId)].map(text).filter(Boolean))]
 let actualOwnerRole=''
 for(const id of ids){
  const values=(await db.collection('users').where({_id:id}).field({_id:true,name:true,realName:true,nickName:true,nickname:true,phone:true,phoneNumber:true,status:true,disabled:true}).limit(2).get()).data||[]
  if(values.length!==1)continue
  const user=values[0],number=userPhone(user)
  if(!/^1[3-9]\d{9}$/.test(number))continue
  const matches=staff.filter(s=>phone(s.phone||s.phoneNumber)===number)
  if(matches.length>1)throw Error('同一手机号对应多名工作人员，请先核对')
  const member=memberships.find(m=>active(m)&&String(m.userId||m.memberUserId||'')===id)
  if(id!==ownerId&&!matches.length)continue
  let row=rows.find(p=>phone(p.phone)===number)
  const linked=matches[0]
  const personalName=meaningfulName(user.realName||user.name)||meaningfulName(user.nickName||user.nickname)
  const boundOwnerName=id===ownerId&&text(team.ownerDisplayUserId)===ownerId?text(team.ownerDisplayName):''
  const matchingContact=phone(team.contactPhone)===number?text(team.contactName):''
  const matchingOwnerName=phone(team.ownerPhone)===number?text(team.ownerName):''
  if(!row){
   row={role:linked?'staff:'+linked._id:id===ownerId?'account_owner':'',name:text(linked&&linked.name)||personalName||boundOwnerName||matchingOwnerName||matchingContact||'未填写姓名',phone:number,accountType:id===ownerId?'owner':'member',roleLabel:id===ownerId?'账号持有人':text(linked&&linked.role)||'工作人员'}
   if(!row.role)continue
   rows.push(row)
  }
  row.accountUserId=id
  if(id===ownerId){
   row.accountType='owner';actualOwnerRole=row.role
   // Only use names tied to this account's verified phone; never borrow another contact's name.
   row.name=text(linked&&linked.name)||personalName||boundOwnerName||matchingOwnerName||matchingContact||meaningfulName(row.name)||'未填写姓名'
  }else if(row.accountType==='owner')row.accountType='member'
  if(member)row.permissions=Array.isArray(member.permissions)?member.permissions.filter(p=>['team.view','team.manage'].includes(p)):[]
 }
 return {personnel:rows,actualOwnerRole}
}
module.exports={readRows,complete,userPhone}
