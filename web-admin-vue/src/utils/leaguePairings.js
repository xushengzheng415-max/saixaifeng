import templates from '../../../cloudfunctions/generateSchedule/pairingTemplates.js'
export const LEAGUE_PAIRING_MODES=[{value:'adjacent',label:'相邻签位',example:'1对2、3对4'},{value:'head_tail',label:'首尾配对',example:'1对末位、2对倒数第二位'}]
export function leaguePairingMode(value){return templates.normalizeLeaguePairingMode(value)}
export function leaguePairingLabel(value){return LEAGUE_PAIRING_MODES.find(item=>item.value===String(value||'adjacent'))?.label||'方式待核对'}
export function leagueRoundsForTeams(teams,mode='adjacent',loopType='single'){
 if(teams.length<2)return []
 return templates.standardRoundRobinRounds(teams.length,loopType,mode).map(pairs=>pairs.map(([home,away])=>({home:teams[home-1],away:teams[away-1]})))
}
