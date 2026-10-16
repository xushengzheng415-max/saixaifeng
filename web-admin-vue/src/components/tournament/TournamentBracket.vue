<template>
  <div class="tournament-bracket">
    <section v-for="division in groups" :key="division.id" class="division-bracket">
      <header class="division-title"><h3>{{ division.name }}</h3><span><i class="legend-win"></i>胜者晋级 <i class="legend-loss"></i>负者转入排位</span></header>
      <p v-for="issue in division.issues" :key="issue" class="bracket-warning">{{ issue }}</p>
      <section v-for="board in division.components" :key="board.id" class="bracket-board">
        <h4>{{ board.title }}</h4>
        <p v-if="board.cycle" class="bracket-warning">晋级来源存在循环，请检查赛程关系。</p>
        <div class="bracket-scroll" tabindex="0" :aria-label="division.name+' '+board.title">
          <div class="bracket-canvas" :style="{width:board.width+'px',height:board.height+'px'}">
            <div v-for="(column,index) in board.columns" :key="index" class="round-title" :style="{left:column.x+'px'}">{{ column.label }}</div>
            <svg class="bracket-lines" :width="board.width" :height="board.height" aria-hidden="true">
              <g v-for="(edge,index) in board.paths" :key="index" :class="edge.type==='match_winner'?'winner-path':'loser-path'"><path :d="edge.d" /><text :x="edge.labelX" :y="edge.labelY">{{ edge.type==='match_winner'?'胜者':'负者' }}</text></g>
            </svg>
            <article v-for="node in board.nodes" :key="node.row.id" class="bracket-match" :class="{'focused-match':selectedId===node.row.id,'finished-match':node.row.resultStatus==='approved'}" :style="{left:node.x+'px',top:node.y+'px',width:node.width+'px',height:node.height+'px'}">
              <header><span>{{ node.half ? node.half+' · ' : '' }}场序 {{ node.row.matchNo || '—' }}</span><span>{{ node.row.resultStatus==='approved'?'正式赛果':node.row.scoreReady?'待复核':'待比赛' }}</span></header>
              <strong class="match-round">{{ node.row.roundName || node.row.phaseLabel }}</strong>
              <div v-for="teamSide in sides" :key="teamSide" class="bracket-team" :class="teamState(node.row,teamSide)">
                <div class="team-name"><img v-if="logo(node.row,teamSide)" :src="logo(node.row,teamSide)" alt="" @error="$event.target.style.display='none'" /><span :title="teamName(node.row,teamSide)">{{ teamName(node.row,teamSide) }}</span><b v-if="officialWinner(node.row) &amp;&amp; node.row[teamSide+'TeamId']" class="winner-mark">{{ officialWinner(node.row)===node.row[teamSide+'TeamId'] ? '胜' : '负' }}</b></div>
                <b class="team-score">{{ node.row.scoreReady ? node.row[teamSide+'Score'] : '—' }}</b>
                <small v-if="sourceLabel(node.row[teamSide+'Source'])" class="source-label">{{ sourceLabel(node.row[teamSide+'Source']) }}</small>
              </div>
              <div v-if="node.row.resultStatus==='approved' && ['penalties','penalty_shootout'].includes(node.row.resolution)" class="penalties">点球 {{ node.row.homePenaltyScore }} : {{ node.row.awayPenaltyScore }}</div>
              <footer><span>{{ node.row.matchDate || '日期待定' }} {{ node.row.matchTime || '' }}</span><button type="button" @click="select(node.row)">查看对阵</button></footer>
            </article>
          </div>
        </div>
      </section>
    </section>
    <el-empty v-if="!groups.length" description="当前组别暂无淘汰赛或排位赛" />
    <section v-if="rows.length" ref="detailElement" class="bracket-details">
      <header><h3>对阵详情</h3><el-button v-if="selectedId" link @click="selectedId=''">显示全部</el-button></header>
      <el-table :data="detailRows" row-key="id" empty-text="当前筛选无匹配对阵" style="width:100%">
        <el-table-column label="场序" width="76"><template #default="{row}">{{ row.matchNo || '—' }}</template></el-table-column>
        <el-table-column label="组别 / 阶段" min-width="180"><template #default="{row}">{{ row.divisionName }}<small>{{ row.roundName || row.phaseLabel }}</small></template></el-table-column>
        <el-table-column label="主队" min-width="190"><template #default="{row}">{{ teamName(row,'home') }}</template></el-table-column>
        <el-table-column label="比分" width="100" align="center"><template #default="{row}"><strong>{{ row.scoreReady ? row.homeScore+' : '+row.awayScore : '— : —' }}</strong><small v-if="row.scoreReady && row.resultStatus!=='approved'">待复核</small></template></el-table-column>
        <el-table-column label="客队" min-width="190"><template #default="{row}">{{ teamName(row,'away') }}</template></el-table-column>
        <el-table-column label="去向" min-width="210"><template #default="{row}"><small v-for="route in routes(row)" :key="route">{{ route }}</small><small v-if="!routes(row).length">{{ officialWinner(row) ? '本阶段结果已确认' : '待正式赛果确认' }}</small></template></el-table-column>
        <el-table-column label="时间 / 场地" min-width="170"><template #default="{row}">{{ row.matchDate || '日期待定' }} {{ row.matchTime }}<small>{{ row.venue }}</small></template></el-table-column>
        <el-table-column label="操作" width="100"><template #default="{row}"><el-button type="primary" link @click="$emit('open',row)">查看赛果</el-button></template></el-table-column>
      </el-table>
    </section>
  </div>
</template>

<script setup>
import {computed,ref,watch,nextTick} from 'vue'
import {bracketGroups,officialWinner,activeBracketMatch} from '../../utils/tournamentBracket'
const props=defineProps({matches:{type:Array,default:()=>[]},date:String,keyword:String})
defineEmits(['open'])
const sides=['home','away'],selectedId=ref(''),detailElement=ref(null)
const rows=computed(()=>props.matches.filter(activeBracketMatch))
const groups=computed(()=>bracketGroups(rows.value))
const detailRows=computed(()=>rows.value.filter(row=>(!selectedId.value||row.id===selectedId.value)&&(!props.date||row.matchDate===props.date)&&(!props.keyword||[row.homeTeamName,row.awayTeamName,row.matchNo,row.roundName].join(' ').includes(props.keyword.trim()))).sort((a,b)=>String(a.divisionId).localeCompare(String(b.divisionId))||Number(a.matchNo)-Number(b.matchNo)))
watch(()=>props.matches,()=>{if(!rows.value.some(row=>row.id===selectedId.value))selectedId.value=''})
function sourceLabel(source){if(source?.type==='group_rank')return source.groupName+'第'+source.rank+'名';if(['match_winner','match_loser'].includes(source?.type))return '场序'+(source.matchNo || '待定')+(source.type==='match_winner'?'胜者':'负者');return ''}
function teamName(row,side){return row[side+'TeamName'] || sourceLabel(row[side+'Source']) || '待定球队'}
function logo(row,side){const value=String(row[side+'TeamLogo'] || '');return /^(https?:\/\/|\/)/.test(value)?value:''}
function teamState(row,side){const winner=officialWinner(row);return winner&&row[side+'TeamId']?(winner===row[side+'TeamId']?'team-winner':'team-loser'):''}
function routes(row){return rows.value.filter(target=>target.divisionId===row.divisionId).flatMap(target=>sides.flatMap(side=>{const source=target[side+'Source'];if(!['match_winner','match_loser'].includes(source?.type))return [];const same=source.matchId?source.matchId===row.id:String(source.matchNo)===String(row.matchNo);if(!same)return [];const winner=officialWinner(row),participant=source.type==='match_winner'?winner:winner===row.homeTeamId?row.awayTeamId:winner?row.homeTeamId:'';const name=participant===row.homeTeamId?row.homeTeamName:participant===row.awayTeamId?row.awayTeamName:'';return [(name?name+' · ':'')+(source.type==='match_winner'?'胜者':'负者')+' → 场序'+target.matchNo+' '+(target.roundName || '')]}))}
async function select(row){selectedId.value=row.id;await nextTick();detailElement.value?.scrollIntoView({behavior:'smooth',block:'start'})}
</script>

<style scoped>
.division-bracket{margin:20px 0 28px}.division-title,.bracket-details>header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:12px}.division-title h3,.bracket-details h3{font-size:20px;margin:0}.division-title>span{display:flex;align-items:center;gap:7px;color:#65766b;font-size:12px}.legend-win,.legend-loss{width:24px;border-top:2px solid #188453;display:inline-block}.legend-loss{border-top:2px dashed #96a29b;margin-left:12px}.bracket-board{border-top:1px solid #dae4dd;margin-top:16px;padding-top:14px}.bracket-board>h4{margin:0 0 10px;font-size:16px;color:#315b42}.bracket-scroll{overflow:auto;background:#f4f7f5;border:1px solid #dbe4df;border-radius:6px}.bracket-canvas{position:relative}.bracket-lines{position:absolute;top:0;left:0;pointer-events:none}.bracket-lines path{fill:none;stroke-width:2}.winner-path path{stroke:#188453}.loser-path path{stroke:#9aa8a0;stroke-dasharray:5 4}.bracket-lines text{font-size:11px;fill:#63766a;paint-order:stroke;stroke:#f4f7f5;stroke-width:4px}.round-title{position:absolute;top:16px;font-size:13px;color:#5a7163;font-weight:650}.bracket-match{position:absolute;box-sizing:border-box;padding:10px 12px;background:white;border:1px solid #d2dfd6;border-radius:5px;overflow:hidden}.bracket-match header{display:flex;justify-content:space-between;color:#78867e;font-size:11px}.match-round{display:block;margin:5px 0;font-size:13px;color:#20452f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bracket-team{display:grid;grid-template-columns:minmax(0,1fr) 30px;align-items:center;min-height:48px;border-bottom:1px solid #edf1ee;padding:3px 0;box-sizing:border-box}.team-name{display:flex;align-items:center;gap:6px;min-width:0;font-size:14px}.team-name>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.team-name img{width:24px;height:24px;object-fit:contain;flex-shrink:0}.team-score{text-align:right;font-size:17px}.source-label{grid-column:1/-1;font-size:10px;color:#839088;padding-left:30px}.team-winner{color:#087b43;font-weight:700}.team-loser{color:#849087}.winner-mark{font-size:10px;padding:1px 3px;border:1px solid #c4e4d0;border-radius:2px}.bracket-match footer{display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#7e8b83;margin-top:7px;gap:8px}.bracket-match button{background:none;border:0;color:#087b43;cursor:pointer;font-size:11px;padding:0}.focused-match{outline:2px solid #138a4d}.penalties{font-size:10px;color:#916512;margin-top:3px}.bracket-warning{font-size:13px;color:#b37420;margin:8px 0}.bracket-details{margin-top:28px;scroll-margin-top:24px}.bracket-details small{display:block;color:#6d7c73;line-height:1.7;font-size:12px}.bracket-details :deep(.el-table__cell){padding:12px 9px}@media(max-width:700px){.division-title{align-items:flex-start;flex-direction:column}.bracket-match{padding:9px}.bracket-details{overflow-x:auto}}
</style>
