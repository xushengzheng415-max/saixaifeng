<template>
  <div ref="container" class="tournament-bracket" :data-template-version="BRACKET_TEMPLATE_VERSION">
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
            <section v-for="node in board.nodes" :key="node.id" class="bracket-slot" :class="{'progress-slot':node.kind==='winner','title-slot':node.label,'pending-slot':slotTeam(node).pending}" :style="{left:node.x+'px',top:node.y+'px',width:node.width+'px',height:node.height+'px'}">
              <span v-if="node.label" class="round-label">{{ node.label }}</span>
              <img v-if="slotTeam(node).logo" :src="slotTeam(node).logo" alt="" @error="hideLogo(slotTeam(node).logo)" />
              <span v-else-if="!slotTeam(node).pending" class="crest-fallback" aria-hidden="true">{{ slotTeam(node).name.slice(0,1) }}</span>
              <div class="team-label"><strong :title="slotTeam(node).name">{{ slotTeam(node).name }}</strong><small v-if="slotOrigin(node)" :title="slotOrigin(node)">{{ slotOrigin(node) }}</small></div>
            </section>
          </div>
        </div>
      </section>
    </section>
    <el-empty v-if="!groups.length" description="当前组别暂无晋级赛程" />
  </div>
</template>

<script setup>
import {computed,ref,onMounted,onBeforeUnmount} from 'vue'
import {BRACKET_TEMPLATE_VERSION} from '../../utils/bracketTemplates'
import {bracketGroups,officialWinner,activeBracketMatch} from '../../utils/tournamentBracket'
const props=defineProps({matches:{type:Array,default:()=>[]},templateId:{type:String,default:'auto'},titleSuffix:{type:String,default:''},showDetails:{type:Boolean,default:false}})
const sides=['home','away'],failedLogos=ref(new Set())
const rows=computed(()=>props.matches.filter(activeBracketMatch))
const container=ref(null),availableWidth=ref(1400)
let resizeObserver
onMounted(()=>{resizeObserver=new ResizeObserver(entries=>{availableWidth.value=Math.floor(entries[0].contentRect.width)});if(container.value)resizeObserver.observe(container.value)})
onBeforeUnmount(()=>resizeObserver?.disconnect())
const groups=computed(()=>bracketGroups(rows.value,props.templateId,availableWidth.value))
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
function halfLabel(predecessor){for(const division of groups.value)for(const board of division.components){const node=board.nodes.find(item=>item.row.id===predecessor.id&&item.kind==='winner');if(node?.half)return node.half}return ''}
function team(row,side){const found=profile(row,side);if(found)return {...found,logo:/^(https?:\/\/|\/)/.test(found.logo)&&!failedLogos.value.has(found.logo)?found.logo:'',pending:false};const source=row[side+'Source'],previous=parent(row,side);const name=previous?(halfLabel(previous)+(source.type==='match_loser'?'负者':'胜者')):source?.type==='group_rank'?source.groupName+'第'+source.rank+'名':'晋级待定';return {name,logo:'',pending:true}}
function origin(row,side,seen=new Set()){
 const visit=row.id+'|'+side;if(seen.has(visit))return '';const next=new Set(seen);next.add(visit)
 const source=row[side+'Source'];if(source?.type==='group_rank')return source.groupName+'第'+source.rank+'名'
 const previous=parent(row,side);if(!previous)return ''
 const winner=winningSide(previous);if(winner)return origin(previous,source.type==='match_winner'?winner:winner==='home'?'away':'home',next)
 return [...new Set(sides.map(value=>origin(previous,value,next)).filter(Boolean))].join(' / ')
}
function hideLogo(value){failedLogos.value=new Set([...failedLogos.value,value])}
function slotTeam(node){
 if(node.kind==='team')return team(node.row,node.side)
 const side=winningSide(node.row)
 if(side)return team(node.row,side)
 return {name:node.label==='冠军'?'冠军待定':node.half?node.half+'胜者':'胜者待定',logo:'',pending:true}
}
function slotOrigin(node){
 if(slotTeam(node).pending)return ''
 return node.kind==='team'?origin(node.row,node.side):origin(node.row,winningSide(node.row))
}
</script>

<style scoped>
.division-bracket{margin:24px 0 30px}.division-bracket>h3{font-size:20px;margin:0 0 20px;color:#203d2c}.compact-board{margin:0 0 28px}.compact-board>h4{margin:0 0 8px;font-size:15px;font-weight:600;color:#456551}.bracket-scroll{overflow:auto;background:#f5f8f6;border:1px solid #e3ebe5;border-radius:6px;padding:12px 0}.bracket-canvas{position:relative;margin:0 auto}.bracket-lines{position:absolute;inset:0;pointer-events:none}.bracket-lines path{fill:none;stroke-width:1.5;stroke-linejoin:round}.winner-path{stroke:#8aab95}.loser-path{stroke:#b1c1b7;stroke-dasharray:4 4}.bracket-slot{position:absolute;box-sizing:border-box;display:flex;align-items:center;gap:7px;padding:8px;background:#fff;border:1px solid #dce6df;border-radius:4px}.bracket-slot img,.crest-fallback{height:28px;width:28px;flex:0 0 28px;object-fit:contain}.crest-fallback{display:grid;place-items:center;color:#527d61;font-size:17px}.team-label{min-width:0;flex:1}.team-label strong{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:13px;line-height:1.4;font-weight:600;color:#264b35;overflow:hidden;overflow-wrap:anywhere}.team-label small{display:block;font-size:11px;line-height:1.5;color:#84958a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.progress-slot{border-color:#a9c8b4;background:#fcfefd}.pending-slot .team-label{text-align:center}.pending-slot .team-label strong{font-weight:400;color:#82958a}.title-slot{border-color:#43865c;background:#eaf4ed}.title-slot .team-label strong{color:#386d49;font-weight:600}.round-label{position:absolute;left:0;top:-29px;width:100%;text-align:center;font-size:13px;font-weight:600;color:#42664d;white-space:nowrap}.source-issue{margin:6px 0;color:#ac752d;font-size:12px}@media(max-width:700px){.division-bracket>h3{font-size:18px}.bracket-scroll{margin:0 -4px}}
</style>
