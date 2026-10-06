<template>
  <div class="daily-content">
    <section><h2>本轮赛果</h2><div class="table-wrap"><table><thead><tr><th>组别</th><th>主队</th><th>比分</th><th>客队</th></tr></thead><tbody><tr v-for="row in results" :key="row.matchId"><td>{{ row.division || '—' }}</td><td>{{ row.home }}</td><td class="score">{{ row.score }}</td><td>{{ row.away }}</td></tr></tbody></table></div></section>
    <section><h2>积分榜</h2><img v-if="standingsImage" class="standings-image" :src="standingsImage" alt="正式积分榜快照"><p v-else>本期未附正式积分榜快照。</p></section>
    <section><h2>下轮对阵</h2><div v-if="fixtures.length" class="table-wrap"><table><thead><tr><th>组别</th><th>时间</th><th>主队</th><th></th><th>客队</th><th>场地</th></tr></thead><tbody><tr v-for="(row,index) in fixtures" :key="index"><td>{{ row.division || '—' }}</td><td>{{ row.date }} {{ row.time }}</td><td>{{ row.home }}</td><td class="versus">对</td><td>{{ row.away }}</td><td>{{ row.venue || '待定' }}</td></tr></tbody></table></div><p v-else>下一轮赛程尚未公布。</p></section>
    <section><h2>停赛信息</h2><p>{{ suspensionNote ? `主办方提供：${suspensionNote}` : '下轮停赛名单尚未录入，待主办方确认。' }}</p></section>
  </div>
</template>

<script setup>
defineProps({ results: { type: Array, default: () => [] }, fixtures: { type: Array, default: () => [] }, standingsImage: { type: String, default: '' }, suspensionNote: { type: String, default: '' } })
</script>

<style scoped>
.daily-content{display:grid;gap:22px}.daily-content h2{margin:0 0 10px;font-size:18px;color:#173025}.daily-content p{margin:0;color:#5b6a60;line-height:1.6}.table-wrap{overflow-x:auto;border:1px solid #dce8df}.daily-content table{width:100%;border-collapse:collapse;min-width:550px;background:#fff;font-size:13px}.daily-content th{padding:10px 9px;background:#edf5ef;color:#42604a;text-align:left;font-weight:600;white-space:nowrap}.daily-content td{padding:11px 9px;border-top:1px solid #e8eee9;color:#23372a}.daily-content tbody tr:nth-child(even){background:#f8fbf9}.daily-content .score{min-width:58px;color:#075d38;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}.daily-content .versus{color:#778b7d}.standings-image{display:block;width:100%;height:auto;border:1px solid #dce8df;background:#fff}
</style>
