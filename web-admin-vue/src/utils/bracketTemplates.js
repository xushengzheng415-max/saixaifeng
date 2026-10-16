// Shared presentation templates. Tournament facts always come from source links;
// these templates never create pairings, infer winners, or assign match numbers.
const geometry=Object.freeze({cardWidth:212,cardHeight:56,columnGap:44,rowGap:24,padding:28,headerSpace:38})
export const BRACKET_TEMPLATE_VERSION='football-bracket-template/3'
export const BRACKET_TEMPLATES=Object.freeze({
  group_knockout:Object.freeze({id:'group_knockout',name:'小组出线淘汰',firstColumn:'小组出线对阵',middleColumn:'晋级对阵',lastColumn:'决赛',geometry}),
  single_elimination:Object.freeze({id:'single_elimination',name:'直接淘汰',firstColumn:'首轮对阵',middleColumn:'晋级对阵',lastColumn:'决赛',geometry}),
  ranked_knockout:Object.freeze({id:'ranked_knockout',name:'淘汰与排位',firstColumn:'交叉对阵',middleColumn:'晋级与排位',lastColumn:'决胜与排位',geometry})
})
export function resolveBracketTemplate(matches=[],requested='auto'){
  if(requested!=='auto'&&BRACKET_TEMPLATES[requested])return BRACKET_TEMPLATES[requested]
  const ranked=matches.some(row=>row.reviewStage==='placement'||['placement','ranking'].includes(String(row.phase || '').toLowerCase())||['home','away'].some(side=>row[side+'Source']?.type==='match_loser'))
  const fromGroups=matches.some(row=>['home','away'].some(side=>row[side+'Source']?.type==='group_rank'))
  return BRACKET_TEMPLATES[ranked?'ranked_knockout':fromGroups?'group_knockout':'single_elimination']
}
