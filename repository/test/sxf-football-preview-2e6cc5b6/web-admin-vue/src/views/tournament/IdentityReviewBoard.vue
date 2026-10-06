<template>
  <div class="identity-review" v-loading="loading">
    <header><div><h1>{{ insuranceMode ? '投保资料' : '人证复核' }}</h1><p>{{ insuranceMode ? '仅限赛事授权人员查看' : '按赛事与组别核对身份材料' }}</p></div><div class="header-actions"><el-button plain @click="toggleMode">{{ insuranceMode ? '人证复核' : '投保资料' }}</el-button><el-button @click="insuranceMode ? loadInsurance() : load()">刷新</el-button></div></header>
    <main v-if="!insuranceMode">
      <section class="queue">
        <button v-for="row in rows" :key="row.id" :class="{active: selected?.id === row.id}" @click="selected = row">
          <span>{{ row.playerName }}</span><small>{{ row.tournamentName }} · {{ row.divisionName || '默认组别' }} · {{ documentLabel(row.documentType) }}</small>
        </button>
        <el-empty v-if="!rows.length && !loading" description="暂无待复核资料" />
      </section>
      <section v-if="selected" class="detail">
        <div class="images"><figure><img v-if="selected.documentUrl" :src="selected.documentUrl" alt="证件材料" /><span v-else>证件材料不可用</span><figcaption>证件材料</figcaption></figure><figure><img v-if="selected.photoUrl" :src="selected.photoUrl" alt="近期形象照" /><span v-else>暂无形象照</span><figcaption>近期形象照</figcaption></figure></div>
        <dl><dt>赛事组别</dt><dd>{{ selected.tournamentName }} · {{ selected.divisionName || '默认组别' }}</dd><dt>球队</dt><dd>{{ selected.teamName || selected.teamId }}</dd><dt>球员</dt><dd>{{ selected.playerName }}</dd><dt>证件</dt><dd>{{ documentLabel(selected.documentType) }}</dd><dt>号码</dt><dd>{{ selected.identityNumberMasked || '待人工核对' }}</dd><dt>算法结果</dt><dd>{{ assessmentText(selected.faceAssessment) }}</dd></dl>
        <el-alert type="info" :closable="false" title="两名审核员须独立判断；同一账号不能重复参与。" />
        <el-input v-model="reason" type="textarea" :rows="3" maxlength="300" placeholder="退回时必须填写原因" />
        <div class="actions"><el-button type="danger" plain :loading="saving" @click="submit('rejected')">退回补充</el-button><el-button type="success" :loading="saving" @click="submit('approved')">确认通过</el-button></div>
      </section>
    </main>
    <main v-else class="insurance-list">
      <article v-for="row in insuranceRows" :key="row.id" class="insurance-row"><header><div><strong>{{ row.tournamentName }} · {{ row.divisionName }}</strong><p>{{ row.teamName }} · {{ row.playerName }}</p></div><small>{{ displayTime(row.submittedAt) }}</small></header><div class="images"><figure v-for="doc in row.documents" :key="doc.side"><img :src="doc.url" :alt="doc.side === 'front' ? '身份证正面' : '身份证反面'" /><figcaption>{{ doc.side === 'front' ? '身份证正面' : '身份证反面' }}</figcaption></figure></div></article>
      <el-empty v-if="!insuranceRows.length && !loading" description="暂无投保资料" />
    </main>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { listIdentityReviewQueue, listTournamentInsuranceQueue, reviewIdentityVerification } from '../../utils/cloud'

const loading=ref(false), saving=ref(false), rows=ref([]), selected=ref(null), reason=ref(''), insuranceMode=ref(false), insuranceRows=ref([])
const labels={resident_id:'居民身份证',household_register:'户口簿本人页',passport:'护照',mainland_travel_permit:'港澳居民来往内地通行证',taiwan_travel_permit:'台湾居民来往大陆通行证'}
function documentLabel(value){return labels[value] || '法定身份证明'}
function assessmentText(value){const item=value || {};return item.status === 'passed' ? `本地比对通过（距离 ${item.distance ?? '-'}）` : '需人工判断'}
async function load(){loading.value=true;try{const result=await listIdentityReviewQueue();if(!result?.success)throw new Error(result?.error||'加载失败');rows.value=result.rows||[];selected.value=rows.value.find(item=>item.id===selected.value?.id)||rows.value[0]||null}catch(error){ElMessage.error(error.message||'加载失败')}finally{loading.value=false}}
async function loadInsurance(){loading.value=true;try{const result=await listTournamentInsuranceQueue();if(!result?.success)throw new Error(result?.error||'加载失败');insuranceRows.value=result.rows||[]}catch(error){ElMessage.error(error.message||'加载失败')}finally{loading.value=false}}
function toggleMode(){insuranceMode.value=!insuranceMode.value;if(insuranceMode.value)loadInsurance();else load()}
function displayTime(value){if(!value)return '提交时间待记录';const date=new Date(value);return Number.isNaN(date.getTime())?'提交时间待记录':date.toLocaleString('zh-CN',{hour12:false})}
async function submit(decision){if(!selected.value)return;if(decision==='rejected'&&!reason.value.trim())return ElMessage.warning('请填写退回原因');saving.value=true;try{const result=await reviewIdentityVerification({verificationId:selected.value.id,decision,reason:reason.value.trim()});if(!result?.success)throw new Error(result?.error||'保存失败');ElMessage.success(result.message||'复核意见已保存');reason.value='';await load()}catch(error){ElMessage.error(error.message||'保存失败')}finally{saving.value=false}}
onMounted(load)
</script>

<style scoped>
.identity-review{padding:24px 28px;color:#26352c}.identity-review header{display:flex;align-items:center;justify-content:space-between;padding-bottom:18px;border-bottom:1px solid #e3eae5}.identity-review h1{margin:0;font-size:28px}.identity-review header p{margin:7px 0 0;color:#758279}.identity-review main{display:grid;grid-template-columns:320px minmax(0,1fr);gap:18px;margin-top:18px}.queue,.detail{border:1px solid #e2e9e4;border-radius:9px;background:#fff}.queue{min-height:420px;overflow:hidden}.queue button{display:flex;width:100%;padding:15px 17px;border:0;border-bottom:1px solid #edf1ee;background:#fff;text-align:left;flex-direction:column;cursor:pointer}.queue button.active{background:#eef8f2;border-left:4px solid #11844b}.queue span{font-weight:700}.queue small{margin-top:6px;color:#7b877f}.detail{padding:20px}.images{display:grid;grid-template-columns:1.6fr 1fr;gap:14px}.images figure{margin:0;border:1px solid #e4e9e6;background:#f7f9f7}.images img,.images figure>span{display:flex;width:100%;height:260px;object-fit:contain;align-items:center;justify-content:center;color:#8a948d}.images figcaption{padding:9px;text-align:center;color:#69766d}.detail dl{display:grid;grid-template-columns:90px 1fr;gap:12px;margin:22px 0}.detail dt{color:#7b877f}.detail dd{margin:0}.detail .el-textarea{margin-top:16px}.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}@media(max-width:900px){.identity-review main{grid-template-columns:1fr}.images{grid-template-columns:1fr}.images img,.images figure>span{height:220px}}
.header-actions{display:flex;gap:8px}.insurance-list{display:grid!important;grid-template-columns:1fr!important;gap:12px}.insurance-row{border-bottom:1px solid #e3eae5;padding:14px 0}.insurance-row>header{display:flex;justify-content:space-between;align-items:flex-start}.insurance-row>header p{margin:6px 0;color:#758279}.insurance-row .images{max-width:900px;grid-template-columns:1fr 1fr;margin-top:10px}.insurance-row .images img{height:260px;background:#f7f9f7}
</style>
