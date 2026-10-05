<template>
  <div class="identity-review" v-loading="loading">
    <header><div><h1>人证复核</h1><p>仅处理算法未能明确判断的球员资料</p></div><el-button @click="load">刷新</el-button></header>
    <main>
      <section class="queue">
        <button v-for="row in rows" :key="row.id" :class="{active: selected?.id === row.id}" @click="selected = row">
          <span>{{ row.playerName }}</span><small>{{ documentLabel(row.documentType) }} · {{ row.identityNumberMasked || '号码待核对' }}</small>
        </button>
        <el-empty v-if="!rows.length && !loading" description="暂无待复核资料" />
      </section>
      <section v-if="selected" class="detail">
        <div class="images"><figure><img v-if="selected.documentUrl" :src="selected.documentUrl" alt="证件材料" /><span v-else>证件材料不可用</span><figcaption>证件材料</figcaption></figure><figure><img v-if="selected.photoUrl" :src="selected.photoUrl" alt="近期形象照" /><span v-else>暂无形象照</span><figcaption>近期形象照</figcaption></figure></div>
        <dl><dt>球员</dt><dd>{{ selected.playerName }}</dd><dt>证件</dt><dd>{{ documentLabel(selected.documentType) }}</dd><dt>号码</dt><dd>{{ selected.identityNumberMasked || '待人工核对' }}</dd><dt>算法结果</dt><dd>{{ assessmentText(selected.faceAssessment) }}</dd></dl>
        <el-alert type="info" :closable="false" title="两名审核员须独立判断；同一账号不能重复参与。" />
        <el-input v-model="reason" type="textarea" :rows="3" maxlength="300" placeholder="退回时必须填写原因" />
        <div class="actions"><el-button type="danger" plain :loading="saving" @click="submit('rejected')">退回补充</el-button><el-button type="success" :loading="saving" @click="submit('approved')">确认通过</el-button></div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { listIdentityReviewQueue, reviewIdentityVerification } from '../../utils/cloud'

const loading=ref(false), saving=ref(false), rows=ref([]), selected=ref(null), reason=ref('')
const labels={resident_id:'居民身份证',household_register:'户口簿本人页',passport:'护照',mainland_travel_permit:'港澳居民来往内地通行证',taiwan_travel_permit:'台湾居民来往大陆通行证'}
function documentLabel(value){return labels[value] || '法定身份证明'}
function assessmentText(value){const item=value || {};return item.status === 'passed' ? `本地比对通过（距离 ${item.distance ?? '-'}）` : '需人工判断'}
async function load(){loading.value=true;try{const result=await listIdentityReviewQueue();if(!result?.success)throw new Error(result?.error||'加载失败');rows.value=result.rows||[];selected.value=rows.value.find(item=>item.id===selected.value?.id)||rows.value[0]||null}catch(error){ElMessage.error(error.message||'加载失败')}finally{loading.value=false}}
async function submit(decision){if(!selected.value)return;if(decision==='rejected'&&!reason.value.trim())return ElMessage.warning('请填写退回原因');saving.value=true;try{const result=await reviewIdentityVerification({verificationId:selected.value.id,decision,reason:reason.value.trim()});if(!result?.success)throw new Error(result?.error||'保存失败');ElMessage.success(result.message||'复核意见已保存');reason.value='';await load()}catch(error){ElMessage.error(error.message||'保存失败')}finally{saving.value=false}}
onMounted(load)
</script>

<style scoped>
.identity-review{padding:24px 28px;color:#26352c}.identity-review header{display:flex;align-items:center;justify-content:space-between;padding-bottom:18px;border-bottom:1px solid #e3eae5}.identity-review h1{margin:0;font-size:28px}.identity-review header p{margin:7px 0 0;color:#758279}.identity-review main{display:grid;grid-template-columns:320px minmax(0,1fr);gap:18px;margin-top:18px}.queue,.detail{border:1px solid #e2e9e4;border-radius:9px;background:#fff}.queue{min-height:420px;overflow:hidden}.queue button{display:flex;width:100%;padding:15px 17px;border:0;border-bottom:1px solid #edf1ee;background:#fff;text-align:left;flex-direction:column;cursor:pointer}.queue button.active{background:#eef8f2;border-left:4px solid #11844b}.queue span{font-weight:700}.queue small{margin-top:6px;color:#7b877f}.detail{padding:20px}.images{display:grid;grid-template-columns:1.6fr 1fr;gap:14px}.images figure{margin:0;border:1px solid #e4e9e6;background:#f7f9f7}.images img,.images figure>span{display:flex;width:100%;height:260px;object-fit:contain;align-items:center;justify-content:center;color:#8a948d}.images figcaption{padding:9px;text-align:center;color:#69766d}.detail dl{display:grid;grid-template-columns:90px 1fr;gap:12px;margin:22px 0}.detail dt{color:#7b877f}.detail dd{margin:0}.detail .el-textarea{margin-top:16px}.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}@media(max-width:900px){.identity-review main{grid-template-columns:1fr}.images{grid-template-columns:1fr}.images img,.images figure>span{height:220px}}
</style>
