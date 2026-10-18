// Browser-only repository. No transport or production credentials belong here.
import { calculateMatchEventScore } from '../../../cloudfunctions/dataCenter/shared/match-events.mjs'
import standings from '../../../cloudfunctions/dataCenter/shared/standings.cjs'
import pairingTemplates from '../../../cloudfunctions/generateSchedule/pairingTemplates.js'
import fixtureCatalog from '../data/syntheticTeamCatalog.mjs'
export const DEMO_ORG_ID = 'demo-organization'
export function createDemoWorkspace({assetBase='/preview/admin/'}={}) {
  let sequence = 0
  const tables = {}
  const clone = value => JSON.parse(JSON.stringify(value))
  const rows = name => tables[name] ||= []
  const assetUrl=path=>path?`${assetBase}${path}`:''
  const fail = message => { throw new Error(message) }
  const success = data => ({ success: true, data: clone(data) })
  function add(collection, data) {
    const record = { ...clone(data), _id: `demo-${collection}-${++sequence}`, orgId: DEMO_ORG_ID, synthetic: true, isTest: true, source: 'browser_demo', createTime: new Date().toISOString() }
    rows(collection).push(record)
    if (collection === 'tournaments') {
      const divisions = record.divisions?.length ? record.divisions : (record.regulationDivisionSuggestions?.length ? [] : [{ name:record.divisionName || '默认组别', tournamentType:record.tournamentType, matchFormat:record.matchFormat, maxTeams:record.maxTeams, maxPlayersPerTeam:record.maxPlayersPerTeam, rules:record.rules || {} }])
      record.divisions = divisions.map(division => {
        const id = String(division.id || '').startsWith('demo-') ? division.id : `demo-division-${++sequence}`
        const row = { ...division, id, _id:id, tournamentId:record._id, orgId:DEMO_ORG_ID, synthetic:true }
        rows('divisions').push(row)
        return clone(row)
      })
      record.defaultDivisionId = record.divisions[0]?.id || 'default'
      for (const referee of rows('referees').filter(row => !row.tournamentId)) add('referees', { ...referee, tournamentId:record._id })
    }
    if (collection === 'divisions') {
      const tournament = rows('tournaments').find(row => row._id === record.tournamentId)
      if (tournament) {
        tournament.divisions ||= []
        tournament.divisions.push({ ...clone(record), id:record._id })
        if (tournament.divisions.length === 1) tournament.defaultDivisionId = record._id
      }
    }
    return record
  }
  function get(collection, id) {
    return rows(collection).find(row => String(row._id) === String(id)) || fail('演示空间中没有这条记录，请返回赛事空间')
  }
  function match(row, where = {}) {
    return Object.entries(where).every(([key, expected]) => {
      // Existing pages use the logged-in org in their query. Only this local repository is searched.
      if (['orgId', 'organizationId', 'creatorId', 'ownerId', 'userId'].includes(key)) return true
      const value = key.split('.').reduce((item, part) => item?.[part], row)
      if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
        if ('$in' in expected) return expected.$in.includes(value)
        if ('$ne' in expected) return value !== expected.$ne
        if ('$eq' in expected) return value === expected.$eq
        if ('$exists' in expected) return (value !== undefined) === expected.$exists
        if ('$regex' in expected) return new RegExp(expected.$regex, expected.$options || '').test(String(value || ''))
        fail(`演示查询暂不支持条件：${key}`)
      }
      return Array.isArray(value) ? value.includes(expected) : value === expected
    })
  }
  function update(collection, id, data = {}) {
    const row = get(collection, id)
    Object.assign(row, clone(data), { _id: row._id, orgId: DEMO_ORG_ID, synthetic: true, isTest: true, source: 'browser_demo', updateTime: new Date().toISOString() })
    return row
  }
  function remove(collection, id) {
    get(collection, id)
    tables[collection] = rows(collection).filter(row => row._id !== id)
  }
  function query(params) {
    const { collection, operation, id, data = {} } = params
    if (operation === 'list' || operation === 'count') {
      const list = rows(collection).filter(row => match(row, params.where))
      for (const [key, direction] of Object.entries(params.orderBy || {}).reverse()) list.sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? ''), 'zh') * (direction === 'desc' ? -1 : 1))
      return operation === 'count' ? { success: true, total: list.length } : success(list.slice(params.skip || 0, (params.skip || 0) + (params.limit || 100)))
    }
    if (operation === 'get') return success(get(collection, id))
    if (operation === 'add') { const row = add(collection, data); return { ...success(row), id: row._id, _id: row._id } }
    if (operation === 'update') return success(update(collection, id, data))
    if (['delete', 'deleteDivision', 'deleteTournamentWorkspace'].includes(operation)) {
      remove(collection, id)
      if (operation === 'deleteTournamentWorkspace') for (const name of Object.keys(tables)) tables[name] = rows(name).filter(row => row.tournamentId !== id)
      return success({ removed: 1 })
    }
    const operations = {
      confirmDivisionRules: { ...data, rulesLocked: true, ruleStatus: 'finalized', rulesVersion: 'demo-v1' },
      reviseDivisionRules: { rulesLocked: false, ruleStatus: 'draft' },
      renameDivision: data,
      assignTournamentTeamDivision: data,
      upgradeDivisionToProfessional: { ...data, mode: 'professional', professionalMode: true },
      confirmCompetitionPlan: { ...data, competitionPlanConfirmed: true }
    }
    if (operations[operation]) return success(update(collection, id, operations[operation]))
    return fail('这项操作尚未接入模拟，不会调用真实接口')
  }
  function registration(params) {
    const { action, tournamentId, divisionId = 'default' } = params
    if(action==='importTeamRegistrationBatch'){
      get('tournaments',tournamentId)
      const imported=[]
      for(const source of params.teams || []){
        const team=add('teams',{...source,name:source.name,logo:source.logoFileId,playerCount:(source.players||[]).length})
        const players=(source.players||[]).map(person=>add('players',{...person,teamId:team._id}))
        for(const person of source.staff||[])add('coaches',{...person,teamId:team._id})
        const relation=add('tournament_teams',{tournamentId,divisionId,teamId:team._id,name:team.name,teamName:team.name,status:'approved',claimStatus:'claimed',participationStatus:'confirmed',players,playerIds:players.map(player=>player._id),playerCount:players.length})
        imported.push({teamId:team._id,teamName:team.name,tournamentTeamId:relation._id})
      }
      return success({teams:imported})
    }
    if (action === 'addSyntheticTeams') {
      get('tournaments', tournamentId)
      const additions = (params.teamIds || []).filter(teamId => !rows('tournament_teams').some(row => row.tournamentId === tournamentId && row.divisionId === divisionId && row.teamId === teamId))
      for (const teamId of additions) {
        const team = get('teams', teamId)
        const players = rows('players').filter(player => player.teamId === teamId)
        const registration = add('tournament_teams', { tournamentId, divisionId, teamId, teamName: team.name, name: team.name, teamLogo:team.logo||'', status: 'pending', participationStatus: 'pending_review', claimStatus: 'claimed', claimed: true, players: clone(players), playerIds: players.map(player => player._id), playerCount: players.length })
        add('roster_snapshots', { tournamentId, divisionId, teamId, registrationId: registration._id, status: 'draft', players: clone(players) })
      }
      return { success: true, addedCount: additions.length, message: '虚拟球队已添加' }
    }
    if (action === 'approveAllDemoRegistrations') {
      if (!String(tournamentId || '').startsWith('demo-') || !String(divisionId).startsWith('demo-')) return fail('仅支持演示赛事及演示组别')
      const tournament = get('tournaments', tournamentId)
      const division = get('divisions', divisionId)
      if (tournament.orgId !== DEMO_ORG_ID || tournament.synthetic !== true || division.tournamentId !== tournamentId) return fail('演示组别范围不匹配')
      const pending = rows('tournament_teams').filter(row => row.tournamentId === tournamentId && String(row.divisionId || 'default') === divisionId && row.status === 'pending')
      for (const row of pending) {
        const team = get('teams', row.teamId)
        if (!String(row._id).startsWith('demo-') || row.orgId !== DEMO_ORG_ID || row.synthetic !== true || team.synthetic !== true || team.orgId !== DEMO_ORG_ID) return fail('仅支持虚拟球队审核')
      }
      for (const row of pending) registration({ action:'reviewRegistration', registrationId:row._id, decision:'approved' })
      return { success:true, approvedCount:pending.length, tournamentId, divisionId }
    }
    if (action === 'reviewRegistration') {
      const approved=params.decision==='approved'
      const row=update('tournament_teams',params.registrationId,{status:params.decision,participationStatus:approved?'confirmed':params.decision,rosterStatus:approved?'approved':'draft'})
      rows('roster_snapshots').filter(snapshot=>snapshot.registrationId===params.registrationId).forEach(snapshot=>{snapshot.status=approved?'approved':'draft'})
      return success(row)
    }
    if (action === 'setDivisionRegistration') return success(update('divisions', divisionId, { registrationEnabled: params.enabled }))
    if (action === 'createTemporaryRefereeClaim') {
      const row = add('referees', { tournamentId, name: params.name, status: 'approved', canOperate: true, level: '虚拟裁判' })
      return success({ refereeId: row._id })
    }
    if (action === 'reviewTemporaryRefereeClaim') return success(update('referees', params.refereeId, { status: 'approved', canOperate: true }))
    return fail('演示模式不发送真实邀请或通知，请直接使用虚拟球队和裁判')
  }
  function schedule(params) {
    const { action, tournamentId, divisionId } = params
    const tournament = get('tournaments', tournamentId)
    const selected = row => row.tournamentId === tournamentId && (!divisionId || row.divisionId === divisionId)
    if (['prepareDrawPreview','repairLegacyGroupPairings'].includes(action) && tournament.scheduleGenerated) {
      const legacy=rows('matches').filter(row=>selected(row) && !row.demoLegacyPairing && row.synthetic && row.isTest && row.status==='scheduled' && row.matchDate && row.matchTime && row.venue && !row.scheduleGenerated && !row.scheduleAssignmentSource && !(row.events || []).length)
      for(const row of legacy) update('matches',row._id,{demoLegacyScheduleBackup:{matchDate:row.matchDate,matchTime:row.matchTime,venue:row.venue,reason:'legacy-demo-auto-fill'},matchDate:'',matchTime:'',venue:'',scheduleStatus:'unassigned',scheduleGenerated:false})
    }
    if(action==='resetDivisionSchedule') {
      if(!divisionId) return fail('请指定要重置的组别')
      const division=get('divisions',divisionId)
      if(division.tournamentId!==tournamentId)return fail('组别不属于当前赛事')
      const ids=new Set(params.matchIds || []),requested=rows('matches').filter(row=>selected(row) && ids.has(row._id) && !row.demoLegacyPairing)
      if(requested.length!==ids.size)return fail('部分比赛不属于当前赛事组别，请刷新')
      const protectedRows=requested.filter(row=>!['scheduled','pending','not_started','upcoming',''].includes(String(row.status || '').toLowerCase()) || row.executionSnapshot || row.refereeRecordLocked || row.schedulePublished || row.published || (row.events || []).length)
      if(protectedRows.length)return fail('部分比赛已开赛、发布或锁定，请刷新后重试')
      const resetAt=new Date().toISOString()
      requested.forEach(row=>update('matches',row._id,{scheduleResetBackup:{matchDate:row.matchDate || '',matchTime:row.matchTime || '',venue:row.venue || '',resetAt},matchDate:'',matchTime:'',venue:'',date:'',startTime:'',timeSlot:'',scheduleStatus:'unassigned',scheduleGenerated:false,scheduleAssignmentSource:'reset',scheduleResetAt:resetAt}))
      return {success:true,resetCount:requested.length}
    }
    if (action === 'prepareDrawPreview') {
      const confirmed = rows('tournament_groups').filter(row=>selected(row) && row.type==='tournament' && row.status==='confirmed').sort((a,b)=>String(a.groupCode).localeCompare(String(b.groupCode)))
      if(confirmed.length!==2 || confirmed.some(group=>(group.teams || []).length!==4)) return {success:true,message:'当前组别按已有已确认对阵预览'}
      const template = pairingTemplates.standardRoundRobinTemplate({groupSizes:[4,4],source:'当前已确认小组'})
      const rank=(groupName,rank)=>({type:'group_rank',groupName,rank})
      template.stages.push({name:'半决赛',phase:'knockout',stageOrder:2,matches:[{code:'SF1',home:rank('A组',1),away:rank('B组',2)},{code:'SF2',home:rank('B组',1),away:rank('A组',2)}]})
      template.stages.push({name:'5–8名排位赛',phase:'placement',stageOrder:3,matches:[{code:'P1',home:rank('A组',3),away:rank('B组',4)},{code:'P2',home:rank('B组',3),away:rank('A组',4)}]})
      template.stages.push({name:'决赛',phase:'knockout',stageOrder:4,matches:[{code:'F',home:'SF1胜',away:'SF2胜'}]})
      template.stages.push({name:'三四名赛',phase:'placement',stageOrder:5,matches:[{code:'P34',home:'SF1负',away:'SF2负'}]})
      template.stages.push({name:'五六名赛',phase:'placement',stageOrder:6,matches:[{code:'P56',home:'P1胜',away:'P2胜'}]})
      template.stages.push({name:'七八名赛',phase:'placement',stageOrder:7,matches:[{code:'P78',home:'P1负',away:'P2负'}]})
      const generated=pairingTemplates.buildPairingsFromTemplate(tournamentId,divisionId,params.divisionName || '',confirmed,template).matches
      const existing=rows('matches').filter(row=>selected(row) && row.status!=='cancelled'),used=new Set()
      for(const item of generated) {
        const found=existing.find(row=>!used.has(row._id) && (item.phase==='group' ? row.homeTeamId===item.homeTeamId && row.awayTeamId===item.awayTeamId || row.homeTeamId===item.awayTeamId && row.awayTeamId===item.homeTeamId : row.pairingCode===item.pairingCode))
        const data={...item,homeScore:null,awayScore:null,matchEventRevision:0,events:[]}
        if(found){used.add(found._id);update('matches',found._id,{phase:item.phase,groupName:item.group,group:item.group,roundName:item.roundName,scheduleStageName:item.scheduleStageName,scheduleStageOrder:item.scheduleStageOrder,matchNo:item.matchNo,matchIndex:item.matchNo,pairingCode:item.pairingCode,homeSource:item.homeSource,awaySource:item.awaySource,homeSourceLabel:item.homeSourceLabel,awaySourceLabel:item.awaySourceLabel,dependencyMatchNos:item.dependencyMatchNos,demoLegacyPairing:false})}
        else {const row=add('matches',data);used.add(row._id)}
      }
      existing.filter(row=>!used.has(row._id)).forEach(row=>{row.demoLegacyPairing=true})
      return {success:true,matchCount:generated.length}
    }
    if (action === 'repairLegacyGroupPairings') {
      const scopes = [...new Set(rows('tournament_groups').filter(row => selected(row) && row.type === 'tournament' && row.status === 'confirmed').map(row=>row.divisionId || 'default'))]
      let repaired = 0
      for(const scopedDivision of scopes) {
        const old = rows('matches').filter(row=>row.tournamentId===tournamentId && (row.divisionId || 'default')===scopedDivision && row.status!=='cancelled')
        if(!old.length || !old.every(row=>row.synthetic && row.isTest && !row.groupName && !row.matchDate && !row.matchTime && !row.venue && !(row.events || []).length && row.status==='scheduled')) continue
        old.forEach(row=>{row.status='cancelled';row.demoLegacyPairing=true})
        schedule({action:'generatePairings',tournamentId,divisionId:scopedDivision})
        repaired++
      }
      return {success:true,repaired}
    }
    if (action === 'importScheduleAssignments') {
      const requested = params.rows || [], changes=[], errors=[], seen=new Set()
      for(const [index,entry] of requested.entries()) {
        const row=rows('matches').find(row=>row._id===entry.matchId && row.tournamentId===tournamentId && row.status!=='cancelled' && !row.demoLegacyPairing)
        if(!row || seen.has(entry.matchId)) {errors.push({row:index+1,message:'比赛不存在或重复'});continue}
        seen.add(entry.matchId)
        if(row.status!=='scheduled' || (row.events || []).length) {errors.push({row:index+1,message:'比赛已开始，不能调整'});continue}
        if(!/^\d{4}-\d{2}-\d{2}$/.test(entry.matchDate || '') || !Number.isFinite(Date.parse(`${entry.matchDate}T00:00:00Z`)) || new Date(`${entry.matchDate}T00:00:00Z`).toISOString().slice(0,10)!==entry.matchDate || !/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.matchTime || '') || !String(entry.venue || '').trim()) {errors.push({row:index+1,message:'请填写有效日期、时间和场地'});continue}
        changes.push({matchId:row._id,matchNo:row.matchNo || row.sequence,before:{matchDate:row.matchDate || '',matchTime:row.matchTime || '',venue:row.venue || ''},after:{matchDate:entry.matchDate,matchTime:entry.matchTime,venue:String(entry.venue).trim()}})
      }
      const planned=rows('matches').filter(row=>row.tournamentId===tournamentId && row.status!=='cancelled' && !row.demoLegacyPairing).map(row=>({...row,...(changes.find(change=>change.matchId===row._id)?.after || {})}))
      for(const change of changes) {
        const current=planned.find(row=>row._id===change.matchId),start=new Date(`${current.matchDate}T${current.matchTime}`).getTime(),end=start+Number(current.durationMinutes || tournament.scheduleDraft?.matchDurations?.[current.divisionId] || 50)*60000
        const conflict=planned.find(other=>{if(other._id===current._id || !other.matchDate || !other.matchTime)return false;const from=new Date(`${other.matchDate}T${other.matchTime}`).getTime(),to=from+Number(other.durationMinutes || tournament.scheduleDraft?.matchDurations?.[other.divisionId] || 50)*60000;return start<to && from<end && (other.venue===current.venue || [other.homeTeamId,other.awayTeamId].filter(Boolean).some(id=>[current.homeTeamId,current.awayTeamId].filter(Boolean).includes(id)))})
        if(conflict){const shared=[conflict.homeTeamId,conflict.awayTeamId].filter(Boolean).find(id=>[current.homeTeamId,current.awayTeamId].includes(id)),team=rows('teams').find(row=>row._id===shared)?.name || '同一球队',reason=conflict.venue===current.venue ? `${current.venue}该时段已有比赛` : `${team}该时段已有比赛`;errors.push({matchId:change.matchId,conflictMatchId:conflict._id,message:`${reason}：第${conflict.matchNo || conflict.sequence || '—'}场 ${conflict.homeTeamName}—${conflict.awayTeamName}（${conflict.matchDate} ${conflict.matchTime}）`})}
      }
      if(errors.length) return {success:false,message:'排期预检未通过',errors,errorCount:errors.length,validCount:0,changes:[]}
      if(params.dryRun!==false) return {success:true,dryRun:true,validCount:changes.length,errorCount:0,changes}
      changes.forEach(change=>update('matches',change.matchId,{...change.after,scheduleStatus:'scheduled',scheduleGenerated:true,scheduleAssignmentSource:params.adjustmentType || 'manual',scheduleAssignedAt:new Date().toISOString()}))
      if(params.adjustmentType==='import' && changes.length) update('tournaments',tournamentId,{scheduleDraft:{...(tournament.scheduleDraft || {}),startDate:changes.map(c=>c.after.matchDate).sort()[0],endDate:changes.map(c=>c.after.matchDate).sort().at(-1),venueResources:[...new Set(changes.map(c=>c.after.venue))].map(name=>({name}))}})
      return {success:true,appliedCount:changes.length}
    }
    if (action === 'saveDraft') return success(update('tournaments', tournamentId, { scheduleConfig: params.scheduleConfig, scheduleDraft:params.scheduleConfig }))
    if (action === 'resetPairings') { tables.matches = rows('matches').filter(row => !selected(row)); return success({}) }
    if (['publishSchedule', 'publishRegulations'].includes(action)) {
      if (action === 'publishSchedule') rows('matches').filter(selected).forEach(row => { row.schedulePublished = true })
      else if (divisionId) update('divisions', divisionId, { regulationsPublished: true })
      return { success: true, publicationId: `demo-publication-${++sequence}`, version: 'demo-v1', matchCount: rows('matches').filter(selected).length }
    }
    if (action === 'generatePairings') {
      if (rows('matches').some(row=>selected(row) && row.status!=='cancelled')) return fail('已有模拟对阵，请先重置对阵')
      const teams = rows('tournament_teams').filter(selected)
      if (teams.length < 2) return fail('请先添加至少两支虚拟球队')
      const savedGroups = rows('tournament_groups').filter(row => selected(row) && row.type === 'tournament' && ['confirmed','published'].includes(row.status))
      const pools = savedGroups.length ? savedGroups.map(group => ({ name:group.groupName || group.groupCode, teams:(group.teams || []).filter(team => !String(team.teamId || '').startsWith('bye-')).map(team => ({teamId:team.teamId,teamName:team.teamName})) })) : [{ name:'',teams }]
      let sequenceNumber = 0
      for (const pool of pools) {
        const ring = [...pool.teams]
        if(ring.length % 2) ring.push(null)
        for(let round=1;round<ring.length;round++) {
          for(let index=0;index<ring.length/2;index++) {
            const home=ring[index],away=ring[ring.length-1-index]
            if(!home || !away) continue
            add('matches',{ tournamentId,divisionId:divisionId || 'default',divisionName:params.divisionName || '',groupName:pool.name,homeTeamId:home.teamId,awayTeamId:away.teamId,homeTeamName:home.teamName,awayTeamName:away.teamName,status:'scheduled',stage:pool.name ? 'group' : 'league',round,matchNo:++sequenceNumber,sequence:sequenceNumber,homeScore:null,awayScore:null,matchEventRevision:0,events:[] })
          }
          ring.splice(1,0,ring.pop())
        }
      }
      return { success: true, matchCount: rows('matches').filter(selected).length }
    }
    if (action === 'scheduleExistingPairings') {
      const list = rows('matches').filter(row=>selected(row) && row.status==='scheduled' && !row.demoLegacyPairing && (!params.divisionIds || params.divisionIds.includes(row.divisionId)) && (!row.matchDate || !row.matchTime || !row.venue))
      if(!list.length)return {success:true,matchCount:0,message:'没有待排比赛'}
      const config=params.scheduleConfig || {},sessions=(config.sessionWindows || []).filter(s=>s.enabled),venues=(config.venueResources || []).map(v=>v.name).filter(Boolean)
      if(!config.startDate || !config.endDate || !sessions.length || !venues.length) return fail('请先设置比赛日期、开放时段和场地')
      const clock=t=>{const [h,m]=String(t || '').split(':').map(Number);return h*60+m},format=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`,weekday=['周日','周一','周二','周三','周四','周五','周六'],planned=[]
      const before=clone(tables)
      try {
        for(const row of list.sort((a,b)=>Number(a.matchNo || 0)-Number(b.matchNo || 0))) {
          let chosen
          for(let day=new Date(`${config.startDate}T00:00:00`);day<=new Date(`${config.endDate}T00:00:00`) && !chosen;day.setDate(day.getDate()+1)) {
            if(!(config.matchDays || []).includes(weekday[day.getDay()]))continue
            const date=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`
            for(const session of sessions) {
              if(chosen)break
              const duration=Number(row.durationMinutes || config.matchDurations?.[row.divisionId] || 50)
              const starts=Array.isArray(config.kickoffTimes)?config.kickoffTimes.map(clock).filter(minute=>minute>=clock(session.start) && minute+duration<=clock(session.end)):Array.from({length:Math.max(0,Math.floor((clock(session.end)-clock(session.start)-duration)/Math.max(5,Number(config.timeStepMinutes || 5)))+1)},(_,i)=>clock(session.start)+i*Math.max(5,Number(config.timeStepMinutes || 5)))
              for(const minute of starts)for(const venue of venues) {
                if(chosen)break
                const entry={matchId:row._id,matchDate:date,matchTime:format(minute),venue}
                const preview=schedule({action:'importScheduleAssignments',tournamentId,rows:[entry],dryRun:true,adjustmentType:'auto'})
                if(preview.success){schedule({action:'importScheduleAssignments',tournamentId,rows:[entry],dryRun:false,adjustmentType:'auto'});chosen=entry;planned.push(entry);break}
              }
            }
          }
          if(!chosen)throw new Error('可用日期、场地或时段不足，请调整设置')
        }
      }catch(error){for(const key of Object.keys(tables))delete tables[key];Object.assign(tables,before);throw error}
      update('tournaments',tournamentId,{scheduleGenerated:true,scheduleConfig:config,scheduleDraft:config})
      return {success:true,matchCount:planned.length,message:`已编排 ${planned.length} 场比赛`}
    }
    return fail('这项赛程操作尚未接入模拟，不会调用真实接口')
  }
  function rosterReview(params) {
    const { tournamentId, teamId, divisionId, playerId, rosterAction } = params
    get('tournaments', tournamentId)
    const relations = rows('tournament_teams').filter(row => row.tournamentId === tournamentId && row.teamId === teamId && ['pending', 'invited', 'approved', 'confirmed', 'active'].includes(row.status))
    const relation = divisionId ? relations.find(row => String(row.divisionId || 'default') === String(divisionId)) : (relations.length === 1 ? relations[0] : null)
    if (!relation) return fail('球队不属于当前赛事组别或报名已取消')
    const scoped = row => row.tournamentId === tournamentId && row.teamId === teamId && String(row.divisionId || 'default') === String(relation.divisionId || 'default')
    const snapshots = rows('roster_snapshots').filter(scoped)
    const latest = snapshots.at(-1)
    // A registration draft contains candidate profiles, not individual organizer approvals.
    const approvedIds = [...new Set(latest?.playerIds || [])]
    const teamPlayers = rows('players').filter(row => (row.teamId === teamId || row.teamCode === teamId) && !['archived', 'deleted'].includes(row.status))
    if (rosterAction === 'approvePlayer') {
      const player = teamPlayers.find(row => row._id === playerId)
      if (!player) return fail('球员不存在或不属于当前球队')
      if (!approvedIds.includes(playerId)) approvedIds.push(playerId)
      const now = new Date().toISOString()
      update('players', playerId, { organizerReviewStatus:'approved', organizerReviewedAt:now, organizerReviewedBy:'模拟主办方' })
      const snapshot = add('roster_snapshots', { tournamentId, teamId, divisionId:relation.divisionId || 'default', playerIds:approvedIds, version:Number(latest?.version || 0)+1, status:'approved', previousSnapshotId:latest?._id || '', approvedAt:now })
      update('tournament_teams', relation._id, { rosterStatus:'approved', rosterPlayerCount:approvedIds.length, playerReviewStatus:approvedIds.length === teamPlayers.length ? 'completed' : 'pending', lastRosterApprovalAt:now })
      return { success:true, playerId, snapshotId:snapshot._id, playerIds:approvedIds, snapshotStatus:'approved' }
    }
    if (rosterAction === 'listRoster') return { success:true, snapshot:latest ? { id:latest._id, status:latest.status, version:latest.version || 1, playerIds:approvedIds } : null, rows:teamPlayers.filter(row => approvedIds.includes(row._id)).map(row => ({ id:row._id, name:row.name, identityStatus:row.identityStatus || 'not_verified', mediaStats:{} })) }
    return fail('这项名单操作尚未接入模拟')
  }
  function request(action, params = {}) {
    if (action === 'rosterExceptionBoard') return rosterReview(params)
    if (action === 'dbQuery') return query(params)
    if (action === 'callFunction') return request(params.functionName, params.functionParams)
    if (action === 'webBatchUpdate' || action === 'deleteRecord') return query({ ...params, operation: params.action })
    if (action === 'tournamentRegistrationFlow') return registration(params)
    if (action === 'generateSchedule') return schedule(params)
    if (action === 'updateMatch') {
      const row = get('matches', params.matchId)
      if (params.expectedEventRevision !== undefined && params.expectedEventRevision !== (row.matchEventRevision || 0)) return fail('模拟比赛已更新，请刷新后重试')
      if (params.action && !['finishOrganizerMatch', 'forfeitMatch'].includes(params.action)) return fail('这项比赛操作尚未接入模拟')
      const data = { ...(params.data || {}) }
      if (Array.isArray(data.events)) {
        const score = calculateMatchEventScore({ ...row, events: data.events })
        Object.assign(data, { homeScore: score.home, awayScore: score.away, matchEventRevision: (row.matchEventRevision || 0) + 1 })
      }
      if (params.action === 'finishOrganizerMatch') {
        const score = calculateMatchEventScore(row)
        Object.assign(data, { status: 'finished', homeScore: score?.home ?? data.homeScore, awayScore: score?.away ?? data.awayScore })
      }
      if (params.action === 'forfeitMatch') Object.assign(data, { status: 'finished', resultType: 'forfeit', homeScore: data.forfeitTeamId === row.homeTeamId ? 0 : 3, awayScore: data.forfeitTeamId === row.awayTeamId ? 0 : 3 })
      return success(update('matches', params.matchId, data))
    }
    if (action === 'tournamentStaffAccess') {
      if (['scope', 'mine', 'invitations'].includes(params.action)) return { success: true, isOwner: true, isStaff: false, activeOrgId: DEMO_ORG_ID, grants: [], invitations: [] }
      return fail('演示模式不修改真实账号授权')
    }
    if (action === 'onboardingWorkspace' && params.action === 'organizerInboxList') return success({ messages: [], unreadCount: 0 })
    if (action === 'onboardingWorkspace' && params.action === 'state') return { success: true, organization: { id: DEMO_ORG_ID, name: '模拟机构', capabilities: ['event'] }, requiresOnboarding: false }
    if (action === 'uploadFile' && params.action === 'uploadBase64') return { success: true, fileID: params.base64Data, tempUrl: params.base64Data }
    if (action === 'uploadImage') return { success: true, fileID: params.base64Data, fileId: params.base64Data, url: params.base64Data }
    if (action === 'uploadFile' && params.action === 'getTempFileURL') return { success: true, url: String(params.fileID || '').startsWith('data:') ? params.fileID : '' }
    if (action === 'getSignatureStatus') return { success: true, signatures: [], data: {} }
    if (action === 'resultCenter') {
      const tournament = get('tournaments', params.tournamentId)
      const divisions = rows('divisions').filter(row => row.tournamentId === tournament._id)
      const matches = rows('matches').filter(row => row.tournamentId === tournament._id).map(row => ({ ...clone(row), id: row._id, divisionName:row.divisionName || '', groupName:row.groupName || '', scoreReady: Number.isFinite(row.homeScore) && Number.isFinite(row.awayScore), resultStatus: ['finished', 'completed'].includes(row.status) ? 'approved' : 'not_submitted', standingsEligible: ['league','group','round_robin'].includes(row.stage), yellowHome:0, yellowAway:0, redHome:0, redAway:0 }))
      const tables = standings.buildStandings(matches, Object.fromEntries(divisions.map(row => [row._id, row])))
      if (params.action === 'publishStandings') {
        if (!tables.some(table => table.officialMatchCount)) return fail('请先完成模拟比赛')
        add('publication_snapshots', { tournamentId:tournament._id, divisionId:params.divisionId, type:'standings', version:1, standings:tables })
        return { success:true, message:'模拟积分榜已发布' }
      }
      if (!['dashboard', 'teamData'].includes(params.action)) return fail('这项成绩操作尚未接入模拟')
      return { success:true, tournament:{ ...clone(tournament), id:tournament._id }, divisions:divisions.map(row => ({ ...clone(row), id:row._id })), matches, events:matches.flatMap(row => row.events || []), standings:tables, knockout:[], publications:clone(rows('publication_snapshots').filter(row => row.tournamentId === tournament._id)), generatedAt:new Date().toISOString() }
    }
    if (action === 'getPlayers') return { ...success(rows('players')), players: clone(rows('players')) }
    if (action === 'deleteTeam') { remove('teams', params.teamId); tables.players = rows('players').filter(row => row.teamId !== params.teamId); return success({}) }
    return fail('这项操作尚未接入模拟，不会调用真实接口')
  }
  function ensureVirtualTeams() {
  for(const source of fixtureCatalog.teams){
    let team=rows('teams').find(row=>row.syntheticKey===source.key)
    if(!team)team=add('teams',{name:source.name,teamName:source.name,ageGroup:source.ageGroup,playerCount:source.players.length,syntheticKey:source.key,syntheticDatasetId:fixtureCatalog.datasetId,demoPoolType:'original',logo:assetUrl(source.logoPath),logoUrl:assetUrl(source.logoPath),status:'active'})
    else Object.assign(team,{logo:team.logo||assetUrl(source.logoPath),logoUrl:team.logoUrl||assetUrl(source.logoPath),demoPoolType:'original'})
    for(const person of source.players){
      let player=rows('players').find(row=>row.teamId===team._id&&row.syntheticKey===person.key)
      const photo=assetUrl(person.avatarPath)
      if(!player)player=add('players',{teamId:team._id,name:person.name,realName:person.name,birthDate:person.birthDate,gender:person.gender,jerseyNumber:person.number,number:person.number,position:person.position,syntheticKey:person.key,syntheticDatasetId:fixtureCatalog.datasetId,ageGroup:source.ageGroup,avatarUrl:photo,photoUrl:photo,photoFileID:photo,status:'active'})
      else Object.assign(player,{avatarUrl:player.avatarUrl||photo,photoUrl:player.photoUrl||photo,photoFileID:player.photoFileID||photo})
    }
  }
  for(const team of rows('teams'))if(['U8','U10','U12'].includes(team.ageGroup)&&team.source==='browser_demo'&&/^模拟U\d+球队\d+$/.test(team.name||''))team.demoTemporary=true
  const ages=['成人',...Array.from({length:13},(_,index)=>`U${index+6}`),'open']
  for (const ageGroup of ages) {
    if(['U8','U10','U12'].includes(ageGroup))continue
    for (let index = 1; index <= 8; index++) {
      const label = ageGroup === 'open' ? '青少年' : ageGroup
      const logo=assetUrl(`assets/synthetic-fixtures/team-crests/team-${String((ages.indexOf(ageGroup)*8+index-1)%48+1).padStart(2,'0')}.svg`)
      const existing=rows('teams').find(team=>team.ageGroup===ageGroup&&team.name===`模拟${label}球队${index}`&&team.source==='browser_demo')
      if(existing){Object.assign(existing,{logo,logoUrl:logo,demoPoolType:'supplement'});continue}
      const team = add('teams', { name: `模拟${label}球队${index}`, teamName: `模拟${label}球队${index}`, ageGroup, status: 'active', playerCount: ageGroup === 'open' ? 12 : 18,logo,logoUrl:logo,demoPoolType:'supplement' })
      for (let number = 1; number <= team.playerCount; number++) add('players', { teamId: team._id, name: `虚拟球员${index}-${number}`, realName: `虚拟球员${index}-${number}`, jerseyNumber: number, number, ageGroup, gender: '男', birthDate: ageGroup === '成人' ? '1996-01-01' : ageGroup === 'open' ? '2014-01-01' : `${2026 - Number(ageGroup.slice(1))}-01-01`, status: 'active', position: number === 1 ? '门将' : '前锋' })
    }
  }
  }
  ensureVirtualTeams()
  for (let index = 1; index <= 8; index++) add('referees', { name: `虚拟裁判${index}`, status: 'approved', auditStatus: 'approved', canOperate: true, availabilityStatus: 'available', level: '一级' })
  return {
    request,
    snapshot: () => clone({ sequence, tables }),
    restore(value) {
      sequence = Number(value.sequence) || 0
      for (const name of Object.keys(tables)) delete tables[name]
      Object.assign(tables, clone(value.tables))
      for(const collection of Object.values(tables))for(const row of collection)sequence=Math.max(sequence,Number(String(row._id||'').match(/-(\d+)$/)?.[1])||0)
      ensureVirtualTeams()
    }
  }
}
