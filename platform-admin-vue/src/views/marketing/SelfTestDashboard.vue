<template>
  <section class="selftest-dashboard">
    <div class="filters">
      <el-select v-model="days" style="width:140px" @change="refresh"><el-option label="近7天" :value="7" /><el-option label="近30天" :value="30" /></el-select>
      <el-button :loading="loading" @click="refresh">刷新</el-button>
      <span class="source">活动：身价自测 · 数据从正式接入后开始记录</span>
    </div>
    <div v-if="error" class="error" role="alert">{{ error }} <el-button link @click="refresh">重试</el-button></div>
    <template v-else>
      <div class="metrics">
        <div v-for="item in metrics" :key="item.key" class="metric"><strong>{{ item.value }}</strong><span>{{ item.label }}</span></div>
      </div>
      <p class="boundary">统计为匿名会话数。分享仅统计点击；“好友回访”以分享链接打开计数。注册和建队成功数尚未接入，当前显示的是入口点击。</p>
      <div v-if="!hasEvents && !loading" class="empty">暂无自测互动数据。正式页面接入统计后，这里会显示真实结果。</div>
      <template v-else>
        <section class="block"><h2>转化路径</h2><div class="steps"><div v-for="item in funnel" :key="item.key"><strong>{{ item.value }}</strong><span>{{ item.label }}</span><small>{{ item.rate }}</small></div></div></section>
        <div class="details">
          <section class="block"><h2>参加过的赛事 <small>本人自报，可多选</small></h2><div v-for="item in distribution('competitionTypes')" :key="item.label" class="distribution"><span>{{ item.label }}</span><b>{{ item.value }}</b></div></section>
          <section class="block"><h2>正式比赛几人制</h2><div v-for="item in distribution('matchFormat')" :key="item.label" class="distribution"><span>{{ item.label }}</span><b>{{ item.value }}</b></div></section>
          <section class="block"><h2>日常约球几人制</h2><div v-for="item in distribution('friendlyFormat')" :key="item.label" class="distribution"><span>{{ item.label }}</span><b>{{ item.value }}</b></div></section>
        </div>
        <section class="block"><h2>每日趋势</h2><el-table :data="data?.daily || []" size="small"><el-table-column prop="day" label="日期" width="130" /><el-table-column label="打开"><template #default="{row}">{{ row.counts.view || 0 }}</template></el-table-column><el-table-column label="开始"><template #default="{row}">{{ row.counts.start || 0 }}</template></el-table-column><el-table-column label="完成"><template #default="{row}">{{ row.counts.complete || 0 }}</template></el-table-column><el-table-column label="分享"><template #default="{row}">{{ row.counts.share || 0 }}</template></el-table-column><el-table-column label="好友回访"><template #default="{row}">{{ row.counts.referral_open || 0 }}</template></el-table-column></el-table></section>
      </template>
    </template>
  </section>
</template>
<script setup>
import {computed,onMounted,ref} from 'vue'
import {callFunctionHTTP} from '@/utils/cloud'
const days=ref(7),loading=ref(false),error=ref(''),data=ref(null)
const total=key=>Number(data.value?.totals?.[key]||0)
const metrics=computed(()=>[
  {key:'view',label:'打开自测',value:total('view')},{key:'start',label:'开始答题',value:total('start')},{key:'complete',label:'完成自测',value:total('complete')},
  {key:'share',label:'点击分享',value:total('share')},{key:'referral_open',label:'好友回访',value:total('referral_open')},
  {key:'register_intent',label:'去注册点击',value:total('register_intent')},{key:'mini_create_intent',label:'去建队点击',value:total('mini_create_intent')}
])
const hasEvents=computed(()=>Object.values(data.value?.totals||{}).some(value=>Number(value)>0))
const funnel=computed(()=>[
  {key:'view',label:'打开',value:total('view'),rate:'起点'},
  {key:'start',label:'开始',value:total('start'),rate:rate(total('start'),total('view'))},
  {key:'complete',label:'完成',value:total('complete'),rate:rate(total('complete'),total('start'))},
  {key:'register_intent',label:'去注册点击',value:total('register_intent'),rate:rate(total('register_intent'),total('complete'))}
])
function rate(current,previous){return previous?`${Math.round(current/previous*100)}%`:'—'}
function distribution(kind){return Object.entries(data.value?.distributions?.[kind]||{}).sort((a,b)=>b[1]-a[1]).map(([label,value])=>({label,value}))}
function day(offset){const date=new Date(Date.now()+offset*86400000);return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)}
async function refresh(){loading.value=true;error.value='';try{const response=await callFunctionHTTP('marketingSelfTestSummary',{start:day(1-days.value),end:day(0)},60000,{cache:'bypass'});if(!response?.success)throw Error(response?.error||'读取失败');data.value=response}catch(failure){error.value=failure?.message||'读取失败'}finally{loading.value=false}}
onMounted(refresh)
defineExpose({refresh,loading})
</script>
<style scoped>
.selftest-dashboard{color:#26392d}.filters{display:flex;align-items:center;gap:10px;margin-bottom:20px}.source{color:#6f8174;font-size:12px}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.metric{display:flex;flex-direction:column;gap:7px;padding:17px;background:#fff;border:1px solid #e0e9e2;border-radius:8px}.metric strong{font-size:25px}.metric span{font-size:13px;color:#5e7365}.boundary{font-size:12px;color:#718275;line-height:1.6;margin:13px 0 21px}.block{background:#fff;border:1px solid #e0e9e2;border-radius:8px;padding:18px;margin:14px 0}.block h2{font-size:16px;margin:0 0 17px}.block h2 small{font-size:11px;color:#708274;font-weight:400}.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:0}.steps>div{display:flex;flex-direction:column;gap:6px;padding:8px 15px;border-right:1px solid #e6eee8}.steps>div:first-child{padding-left:0}.steps>div:last-child{border:0}.steps strong{font-size:23px}.steps span{font-size:13px}.steps small{color:#708274}.details{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.details .block{margin:0}.distribution{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #edf2ed;font-size:13px}.distribution:last-child{border:0}.empty,.error{padding:30px 12px;color:#66786b;text-align:center}.error{color:#b93d38}@media(max-width:980px){.details{grid-template-columns:1fr}.steps{grid-template-columns:repeat(2,1fr)}.steps>div:nth-child(2){border:0}}@media(max-width:600px){.filters{flex-wrap:wrap}.source{width:100%}.metrics{grid-template-columns:repeat(2,1fr)}}
</style>
