export function divisionParticipantType(division={},tournament={}) {
  if(['youth','adult'].includes(division.participantType))return division.participantType
  const age=String(division.ageGroup||'')
  const under=age.match(/^U(\d+)$/i)
  if(under)return Number(under[1])<=18?'youth':'adult'
  if(/成人|成年|中年|老年/.test(age))return 'adult'
  return tournament.category==='adult'?'adult':'youth'
}
export function youthBirthRange(ageGroup,tournament={},method='under') {
  const match=String(ageGroup||'').trim().match(/^U(\d{1,2})$/i)
  const explicitYear=Number(tournament.competitionYear || tournament.seasonYear || 0)
  const dateYear=Number(String(tournament.startDate||'').match(/^(\d{4})-\d{2}-\d{2}/)?.[1]||0)
  const year=explicitYear||dateYear
  if(!match||Number(match[1])<1||!Number.isInteger(year)||year<1900||year>2200||!['cohort','under'].includes(method))return null
  const born=year-Number(match[1])
  return {birthDateStart:`${born}-01-01`,birthDateEnd:method==='cohort'?`${born}-12-31`:'',competitionYear:year}
}
export function adultBirthRange(tournament={},minimumAge=16) {
  const reference=youthBirthRange(`U${minimumAge}`,tournament)
  if(!reference)return null
  return {birthDateStart:'',birthDateEnd:reference.birthDateStart.slice(0,4)+'-12-31',competitionYear:reference.competitionYear}
}
export function divisionBasicsLocked(division={},tournament={},editState=null) {
  return editState?.canEdit !== true
}
export function buildDivisionBasics(form,{tournamentId,existing={},registeredTeams=0}={}) {
  const name=String(form.name||'').trim()
  if(name.length<2||name.length>30)throw new Error('组别名称需为2—30个字')
  if(!['youth','adult'].includes(form.participantType))throw new Error('请选择青少年或成人模式')
  if(!String(form.ageGroup||'').trim())throw new Error('请填写年龄段')
  const players=Number(String(form.matchFormat||'').replace('side',''))
  if(![5,7,8,9,11].includes(players))throw new Error('请选择比赛人数')
  const count=Number(form.expectedTeams)
  if(!Number.isInteger(count)||count<2||count>128)throw new Error('参赛队伍数量需为2—128支')
  if(count<registeredTeams)throw new Error(`已有${registeredTeams}支报名球队，数量不能再降低`)
  for(const field of ['birthDateStart','birthDateEnd'])if(form[field]){
    const date=new Date(form[field]+'T00:00:00Z')
    if(!/^\d{4}-\d{2}-\d{2}$/.test(form[field])||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==form[field])throw new Error('出生日期范围无效，请重新选择')
  }
  if(form.birthDateStart&&form.birthDateEnd&&form.birthDateStart>form.birthDateEnd)throw new Error('最早出生日期不能晚于最晚出生日期')
  return {tournamentId,name,customName:name,nameSource:'custom',participantType:form.participantType,ageGroup:String(form.ageGroup).trim(),gender:form.gender,matchFormat:form.matchFormat,playersOnField:players,expectedTeams:count,maxTeams:count,maxPlayersPerTeam:existing.maxPlayersPerTeam||existing.rosterLimit||({5:12,7:16,8:18,9:20,11:23}[players]),birthDateStart:form.birthDateStart||'',birthDateEnd:form.birthDateEnd||'',birthRangeMethod:form.birthRangeMethod||'manual',mode:'simple',isProfessional:false,ruleStatus:'draft',ruleProgress:0}
}
export function virtualTeamMatchesDivision(team,division={},tournament={}) {
  const age=String(division.ageGroup||'').trim().toUpperCase()
  if(/^U\d+$/.test(age))return String(team.ageGroup).toUpperCase()===age
  if(divisionParticipantType(division,tournament)==='adult')return team.ageGroup==='成人'
  return String(team.ageGroup).toLowerCase()==='open'
}
