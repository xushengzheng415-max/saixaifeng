// Penalty shootout kicks are a match decision, separate from in-play goals.
const result = (home,away,rounds,complete,winnerSide='',reason='') => ({home,away,rounds,complete,winnerSide,reason})
export function evaluatePenaltyShootout(input) {
  if(!Array.isArray(input) || input.length>20)return result(0,0,[],false,'','点球轮次最多20轮')
  const active=input.map((row,index)=>({round:index+1,home:row?.home ?? '',away:row?.away ?? '',givenRound:row?.round}))
  while(active.length && !active.at(-1).home && !active.at(-1).away)active.pop()
  if(!active.length)return result(0,0,[],false,'','请记录点球轮次')
  let home=0,away=0,homeKicks=0,awayKicks=0
  const rounds=[]
  for(const [index,row] of active.entries()){
    if(row.givenRound != null && Number(row.givenRound)!==row.round)return result(home,away,rounds,false,'','点球轮次顺序不正确')
    if(!['','scored','missed'].includes(row.home) || !['','scored','missed'].includes(row.away))return result(home,away,rounds,false,'','点球结果只能标记为进或未进')
    if(!row.home)return result(home,away,rounds,false,'',`第${row.round}轮主队结果未填写`)
    homeKicks++
    if(row.home==='scored')home++
    const earlyHome=homeKicks<=5 && home>away+Math.max(0,5-awayKicks)
    const earlyAway=awayKicks<=5 && away>home+Math.max(0,5-homeKicks)
    if(earlyHome || earlyAway){
      if(row.away || index!==active.length-1)return result(home,away,rounds,false,'','已分出胜负，后续点球不应继续记录')
      rounds.push({round:row.round,home:row.home,away:''})
      return result(home,away,rounds,true,earlyHome?'home':'away')
    }
    if(!row.away)return result(home,away,rounds,false,'',`第${row.round}轮客队结果未填写`)
    awayKicks++
    if(row.away==='scored')away++
    rounds.push({round:row.round,home:row.home,away:row.away})
    const homeWon=homeKicks<=5 && home>away+Math.max(0,5-awayKicks)
    const awayWon=awayKicks<=5 && away>home+Math.max(0,5-homeKicks)
    const suddenDeath=homeKicks>=5 && awayKicks>=5 && home!==away
    if(homeWon || awayWon || suddenDeath){
      if(index!==active.length-1)return result(home,away,rounds,false,'','已分出胜负，后续点球不应继续记录')
      return result(home,away,rounds,true,home>away?'home':'away')
    }
  }
  return result(home,away,rounds,false,'',rounds.length>=5?'前五轮打平，请增加一轮点球':'请继续记录点球轮次')
}
