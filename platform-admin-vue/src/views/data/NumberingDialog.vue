<template>
 <el-dialog v-model="visible" title="补发平台编号" width="460px" :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy">
  <div v-loading="loading">
   <p>{{record?.name}}</p>
   <el-alert v-if="error" :title="error" type="error" :closable="false"/>
   <el-form label-position="top" @submit.prevent="save">
    <el-form-item v-if="kind==='teams'" label="球队类型" required><el-radio-group v-model="teamMode" :disabled="busy||!!record?.parentTeamId"><el-radio value="root">主体球队</el-radio><el-radio value="squad">分队</el-radio></el-radio-group></el-form-item>
    <el-form-item v-if="kind==='teams'&&teamMode==='squad'" label="主体球队" required><el-select v-model="parentId" remote filterable :remote-method="searchRoots" :loading="rootsLoading" placeholder="搜索已发号主体" :disabled="busy||!!record?.parentTeamId" @visible-change="v=>v&&!roots.length&&searchRoots('')"><el-option v-for="r in roots" :key="r.id" :label="r.name+' · '+r.businessNumber" :value="r.id"/><template #footer><el-button v-if="rootCursor" link :loading="rootsLoading" @click="moreRoots">加载更多</el-button></template></el-select></el-form-item>
    <template v-if="kind==='players'||teamMode==='root'">
     <el-form-item :label="kind==='players'?'籍贯省份':'登记省份'" required><el-select v-model="province" placeholder="选择省份" @change="city=''" :disabled="busy"><el-option v-for="p in regions.provinceCodeMap" :key="p.code" :label="p.name" :value="p.code"/></el-select></el-form-item>
     <el-form-item :label="kind==='players'?'籍贯城市':'登记城市'" required><el-select v-model="city" placeholder="选择城市" :disabled="!province||busy"><el-option v-for="c in regions.cityLetterMap?.[province]||[]" :key="c.l" :label="c.n+'（'+c.l+'）'" :value="c.l"/></el-select></el-form-item>
    </template>
    <el-alert v-else-if="teamMode==='squad'" title="分队沿用主体号段，主体必须已发号" type="info" :closable="false"/>
    <p class="numbering-note">编号一经发放永久保留，转会或资料更正不换号。</p>
    <el-checkbox v-model="confirmed" :disabled="busy">{{teamMode==='squad'?'已核对主体分队关系':'已核对上述地区信息'}}</el-checkbox>
   </el-form>
  </div>
  <template #footer><el-button :disabled="busy" @click="visible=false">取消</el-button><el-button v-if="loadFailed" :loading="loading" @click="loadRules">重新读取</el-button><el-button type="primary" :loading="busy" :disabled="loading||loadFailed||!confirmed||(kind==='teams'&&!teamMode)||(teamMode==='squad'?!parentId:(!province||!city))" @click="save">确认发号</el-button></template>
 </el-dialog>
</template>
<script setup>
import {computed,ref} from 'vue'
import {ElMessage} from 'element-plus'
import {numberingRequest,dataHub} from './dataHubApi'
const emit=defineEmits(['changed']),visible=ref(false),record=ref(null),kind=ref('players'),province=ref(''),city=ref(''),confirmed=ref(false),busy=ref(false),loading=ref(false),error=ref(''),regions=ref({provinceCodeMap:[],cityLetterMap:{}}),loadFailed=ref(false)
let generation=0
const teamMode=ref(''),parentId=ref(''),roots=ref([]),rootCursor=ref(null),rootKeyword=ref(''),rootsLoading=ref(false)
let rootGeneration=0
async function fetchRoots(append){const token=++rootGeneration;rootsLoading.value=true;try{const r=await dataHub('hubCatalog',{kind:'teams',keyword:rootKeyword.value,cursor:append?rootCursor.value:null,pageSize:50});if(token!==rootGeneration)return;const found=r.items.filter(x=>x.id!==record.value.id&&!x.parentTeamId&&x.businessNumber);roots.value=append?[...roots.value,...found]:found;rootCursor.value=r.page.nextCursor}catch(e){if(token===rootGeneration)error.value=e.message}finally{if(token===rootGeneration)rootsLoading.value=false}}
function searchRoots(value){rootKeyword.value=value;rootCursor.value=null;roots.value=[];return fetchRoots(false)}
const moreRoots=()=>fetchRoots(true)
async function loadRules(){const token=++generation;loading.value=true;error.value='';loadFailed.value=false;try{const r=await numberingRequest('numberingRules');if(token===generation)regions.value=r.regions}catch(e){if(token===generation){error.value=e.message;loadFailed.value=true}}finally{if(token===generation)loading.value=false}}
async function open(row,type){if(busy.value)return;rootGeneration++;record.value=row;kind.value=type;teamMode.value=row.parentTeamId?'squad':'';parentId.value=row.parentTeamId||'';roots.value=[];rootCursor.value=null;province.value=row.numbering?.region?.provinceCode||'';city.value=row.numbering?.region?.cityLetter||'';confirmed.value=false;visible.value=true;await loadRules()}
async function save(){if(busy.value||loading.value||!confirmed.value)return;if(kind.value==='teams'&&!teamMode.value){error.value='请选择主体球队或分队';return}if(teamMode.value==='squad'?!parentId.value:(!province.value||!city.value)){error.value=teamMode.value==='squad'?'请选择主体球队':'请完整选择省份和城市';return}busy.value=true;error.value='';try{const r=await numberingRequest('assignBusinessNumber',{kind:kind.value,id:record.value.id,expectedRevision:record.value.numbering?.revision,...(kind.value==='teams'?{teamMode:teamMode.value}:{}),...(teamMode.value==='squad'?{parentTeamId:parentId.value}:{region:{provinceCode:province.value,cityLetter:city.value}})});ElMessage.success('已发放 '+r.number);visible.value=false;emit('changed')}catch(e){error.value=e.message}finally{busy.value=false}}
defineExpose({open})
</script>
<style scoped>.el-select{width:100%}.numbering-note{font-size:12px;color:#7e8c83;line-height:1.8}.el-alert{margin-bottom:16px}.el-form-item{margin-top:16px}</style>
