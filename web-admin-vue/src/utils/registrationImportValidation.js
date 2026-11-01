import { editableImportedProfile } from '../../../cloudfunctions/tournamentRegistrationFlow/importPersonFields.cjs'
const text=value=>String(value == null ? '' : value).trim()
const phone=value=>text(value).replace(/\D/g,'')
const nameKey=value=>text(value).replace(/\s/g,'').toLowerCase()
const identity=value=>text(value).replace(/\s/g,'').toUpperCase()

export function registrationImportIssues(team,maxPlayers=35) {
  const issues=[]
  const add=(code,message,person=null,people=[])=>issues.push({code,message,person,people})
  if(!text(team.teamName))add('teamName','请填写球队名称')
  if(!text(team.contactName))add('contactName','请填写领队姓名')
  if(!/^1[3-9]\d{9}$/.test(phone(team.contactPhone)))add('contactPhone','请填写正确的领队手机号')
  const players=team.players || [],staff=team.staff || []
  if(!players.length)add('players','请至少保留1名球员')
  if(players.length>maxPlayers)add('players',`球员${players.length}人，超过每队${maxPlayers}人上限`)
  const coach=staff.find(person=>person.roleType==='head_coach')
  if(coach?.phone && !/^1[3-9]\d{9}$/.test(phone(coach.phone)))add('coachPhone','主教练手机号格式不正确',coach)
  // Parser messages are snapshots. Recompute their known rules from current fields.
  for(const message of team.errors || []) {
    if(!/球队名称|领队姓名|未识别到领队|领队手机|球员资料|身份证|证件|护照|出生日期|球服号码|照片|人像/.test(message))add('source',text(message))
  }
  const byIdentity=new Map()
  for(const person of [...staff,...players]) {
    const isPlayer=players.includes(person), label=text(person.name) || (isPlayer?`第${players.indexOf(person)+1}名球员`:person.roleLabel || '工作人员')
    if(isPlayer && !text(person.name))add('name',`${label}：请填写姓名`,person)
    if(!isPlayer && !text(person.name) && !person.identityNumber)continue
    try { editableImportedProfile(person) } catch(error) { add('profile',`${label}：${error.message}`,person) }
    if(person.error && !/身份证|证件|护照|出生日期|重复/.test(person.error))add('person',`${label}：${person.error}`,person)
    const number=text(person.jerseyNumber)
    if(isPlayer && number && !/^\d{1,3}$/.test(number))add('jerseyNumber',`${label}：球衣号码应为1至3位数字`,person)
    const id=identity(person.identityNumber)
    if(!id)continue
    try {editableImportedProfile({...person,birthDate:'',gender:'',height:null,weight:null,strongFoot:''})} catch {continue}
    const matches=byIdentity.get(id) || []
    for(const other of matches) {
      const dualRole=players.includes(other)!==isPlayer && nameKey(other.name)===nameKey(person.name)
      if(!dualRole)add('duplicate',`${text(other.name) || '未命名人员'}与${label}证件号重复，请修改或删除`,person,[other,person])
      else {
        const player=isPlayer?person:other
        if(!text(player.jerseyNumber))add('jerseyNumber',`${text(player.name)}兼任工作人员，请填写球衣号码`,player)
      }
    }
    matches.push(person);byIdentity.set(id,matches)
  }
  return issues.filter((issue,index,all)=>all.findIndex(item=>item.message===issue.message)===index)
}

export function registrationIdentityIssue(person) {
  try { editableImportedProfile({...person,height:null,weight:null,strongFoot:''});return '' }
  catch(error){return error.message}
}
export function ignoredIdentityFields(person) {
  const candidate={documentType:['resident_id','passport'].includes(person.documentType)?person.documentType:'resident_id',identityNumber:'',birthDate:person.birthDate || '',gender:person.gender || ''}
  for(let attempt=0;attempt<3;attempt++) {
    try {return editableImportedProfile(candidate)}
    catch(error){if(/出生日期/.test(error.message))candidate.birthDate='';else if(/性别/.test(error.message))candidate.gender='';else throw error}
  }
  return candidate
}
