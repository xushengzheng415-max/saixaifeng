<template>
  <div class="tournament-bracket" :data-template-version="BRACKET_TEMPLATE_VERSION">
    <section v-for="division in groups" :key="division.id" class="division-bracket">
      <h3>{{ division.name }}{{ titleSuffix ? ' · '+titleSuffix : '' }}</h3>
      <p v-for="issue in division.issues" :key="issue" class="source-issue">{{ issue }}</p>
      <section v-for="board in division.components" :key="board.id" class="compact-board">
        <h4>{{ board.title }}</h4>
        <p v-if="board.cycle" class="source-issue">晋级来源存在循环，请检查赛程关系。</p>
        <div class="bracket-scroll" tabindex="0" :aria-label="division.name+' '+board.title">
          <div class="bracket-canvas" :style="{width:board.width+'px',height:board.height+'px'}">
            <svg class="bracket-lines" :width="board.width" :height="board.height" aria-hidden="true">
              <path v-for="(edge,index) in board.paths" :key="index" :d="edge.d" :class="edge.type==='match_loser'?'loser-path':'winner-path'" />
            </svg>
            <section v-for="node in board.nodes" :key="node.row.id" class="bracket-pair" :style="{left:node.x+'px',top:node.y+'px',width:node.width+'px',height:node.height+'px'}">
              <span v-if="!node.half" class="round-label">{{ node.row.roundName || node.row.phaseLabel }}</span>
              <div v-for="teamSide in sides" :key="teamSide" class="team-slot" :class="{'confirmed-team':isWinner(node.row,teamSide)}">
                <img v-if="team(node.row,teamSide).logo" :src="team(node.row,teamSide).logo" alt="" @error="hideLogo(team(node.row,teamSide).logo)" />
                <span v-else class="crest-fallback" aria-hidden="true">{{ team(node.row,teamSide).pending?'':team(node.row,teamSide).name.slice(0,1) }}</span>
                <div class="team-label"><strong :title="team(node.row,teamSide).name">{{ team(node.row,teamSide).name }}</strong><small v-if="origin(node.row,teamSide)" :title="origin(node.row,teamSide)">{{ origin(node.row,teamSide) }}</small></div>
              </div>
            </section>
          </div>
        </div>
      </section>
    </section>
    <el-empty v-if="!groups.length" description="当前组别暂无晋级赛程" />
  </div>
</template>

<script setup>
import {computed,ref} from 'vue'
import {BRACKET_TEMPLATE_VERSION} from '../../utils/bracketTemplates'
import {bracketGroups,officialWinner,activeBracketMatch} from '../../utils/tournamentBracket'
const props=defineProps({matches:{type:Array,default:()=>[]},templateId:{type:String,default:'auto'},titleSuffix:{type:String,default:''},showDetails:{type:Boolean,default:false}})
const sides=['home','away'],failedLogos=ref(new Set())
const rows=computed(()=>props.matches.filter(activeBracketMatch))
const groups=computed(()=>bracketGroups(rows.value,props.templateId))
function parent(row,side){const source=row[side+'Source'];if(!['match_winner','match_loser'].includes(source?.type))return null;const candidates=rows.value.filter(item=>item.divisionId===row.divisionId&&(source.matchId?item.id===source.matchId:String(item.matchNo)===String(source.matchNo)));return candidates.length===1?candidates[0]:null}
function winningSide(row){const id=officialWinner(row);return id?(id===row.homeTeamId?'home':id===row.awayTeamId?'away':''):''}
function profile(row,side,seen=new Set()){
 const visit=row.id+'|'+side;if(seen.has(visit))return null;const next=new Set(seen);next.add(visit)
 const raw=String(row[side+'TeamName'] || ''),id=row[side+'TeamId'],source=row[side+'Source']
 const predecessor=parent(row,side),winner=predecessor&&winningSide(predecessor)
 if(predecessor&&winner){const from=source.type==='match_winner'?winner:winner==='home'?'away':'home';return profile(predecessor,from,next)}
 if(predecessor&&!winner)return null
 return raw&&!/^(?:场序|第)\d+.*(?:胜者|负者|场)/.test(raw)&&!['待定球队','球队待定'].includes(raw)?{id,name:raw,logo:String(row[side+'TeamLogo'] || '')}:null
}
function halfLabel(predecessor){for(const division of groups.value)for(const board of division.components){const node=board.nodes.find(item=>item.row.id===predecessor.id);if(node?.half)return node.half}return ''}
function team(row,side){const found=profile(row,side);if(found)return {...found,logo:/^(https?:\/\/|\/)/.test(found.logo)&&!failedLogos.value.has(found.logo)?found.logo:'',pending:false};const source=row[side+'Source'],previous=parent(row,side);const name=previous?(halfLabel(previous)+(source.type==='match_loser'?'负者':'胜者')):source?.type==='group_rank'?source.groupName+'第'+source.rank+'名':'晋级待定';return {name,logo:'',pending:true}}
function origin(row,side,seen=new Set()){
 const visit=row.id+'|'+side;if(seen.has(visit))return '';const next=new Set(seen);next.add(visit)
 const source=row[side+'Source'];if(source?.type==='group_rank')return source.groupName+'第'+source.rank+'名'
 const previous=parent(row,side);if(!previous)return ''
 const winner=winningSide(previous);if(winner)return origin(previous,source.type==='match_winner'?winner:winner==='home'?'away':'home',next)
 return [...new Set(sides.map(value=>origin(previous,value,next)).filter(Boolean))].join(' / ')
}
function hideLogo(value){failedLogos.value=new Set([...failedLogos.value,value])}
function isWinner(row,side){return winningSide(row)===side}
</script>

<style scoped>
.division-bracket{margin:22px 0 28px}.division-bracket>h3{font-size:20px;margin:0 0 18px;color:#203d2c}.compact-board{margin:0 0 24px}.compact-board>h4{margin:0 0 12px;font-size:15px;font-weight:600;color:#456551}.bracket-scroll{overflow:auto;background:#f7faf8;border-radius:5px;padding:10px 0}.bracket-canvas{position:relative;margin:0 auto}.bracket-lines{position:absolute;inset:0;pointer-events:none}.bracket-lines path{fill:none;stroke-width:1.8;stroke-linejoin:round}.winner-path{stroke:#4b8f67}.loser-path{stroke:#a6b5ac;stroke-dasharray:4 4}.bracket-pair{position:absolute;box-sizing:border-box;display:grid;grid-template-rows:1fr 1fr;background:#fff;border:1px solid #d5e2da;border-radius:4px}.team-slot{display:flex;align-items:center;gap:10px;min-width:0;padding:6px 10px;box-sizing:border-box}.team-slot+.team-slot{border-top:1px solid #e8efea}.team-slot img,.crest-fallback{height:30px;width:30px;flex:0 0 30px;object-fit:contain}.crest-fallback{display:grid;place-items:center;color:#6c8b77;font-size:17px}.team-label{min-width:0}.team-label strong{display:block;font-size:14px;line-height:1.4;font-weight:600;color:#294b36;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.team-label small{display:block;font-size:11px;line-height:1.4;color:#88968d;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.confirmed-team .team-label strong{color:#087b43}.round-label{position:absolute;top:-25px;width:100%;text-align:center;font-size:13px;font-weight:600;color:#365e45;white-space:nowrap}.source-issue{margin:6px 0;color:#ac752d;font-size:12px}@media(max-width:700px){.division-bracket>h3{font-size:18px}.bracket-scroll{margin:0 -4px}}
</style>
