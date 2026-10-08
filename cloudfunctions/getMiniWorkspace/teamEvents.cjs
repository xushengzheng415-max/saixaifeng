 'use strict'
const {readAll,readByIds}=require('./data-center/reader.cjs')
const hidden=new Set(['cancelled','withdrawn','rejected','replaced','invite_cancelled','removed','deleted'])
async function load(db,teams){
  const registrations=[]
  for(const team of teams){
    registrations.push(...(await readAll(db,'tournament_teams',{teamId:String(team._id)})).filter(row=>!hidden.has(String(row.status || '').toLowerCase()) && row.tournamentId))
  }
  const tournaments=await readByIds(db,'tournaments','_id',registrations.map(row=>row.tournamentId))
  return {tournaments:tournaments.filter(row=>row.deleted!==true && row.isDeleted!==true && !['deleted','removed'].includes(String(row.status))).map(row=>({...row,workspaceRelation:'participating'})),registrations,hostedRegistrations:[]}
}
module.exports={load}
