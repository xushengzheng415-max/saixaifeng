<template>
  <section class="create-page">
    <div class="breadcrumb"><button type="button" @click="requestBack">赛事空间</button><span>/</span><strong>创建赛事</strong></div>
    <header><h1>创建赛事</h1><p>上传竞赛规程可自动生成赛事资料和竞赛规则草稿。</p></header>
    <div class="layout">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="form-panel">
        <section class="regulation-first">
          <div class="section-title"><h2>竞赛规程</h2><span>优先上传</span></div>
          <p>上传后自动识别赛事资料、组织架构和竞赛组别规则。</p>
          <div class="regulations">
            <div v-if="form.regulationsFileId" class="file-row"><el-icon><Document /></el-icon><span>{{ form.regulationsFileName }}</span></div>
            <el-upload :show-file-list="false" :before-upload="beforeRegulationsUpload" :http-request="handleRegulationsUpload" accept=".pdf,.docx">
              <el-button :loading="uploadingRegulations">{{ uploadingRegulations ? '上传并识别中' : '上传规程' }}</el-button>
            </el-upload>
            <small>支持 PDF、Word（.docx），最大 10MB</small>
          </div>
          <div v-if="recognizedDivisions.length" class="recognized"><strong>已识别 {{ recognizedDivisions.length }} 个竞赛组别</strong><el-tag v-for="item in recognizedDivisions" :key="item.name">{{ item.name }}</el-tag></div>
        </section>

        <section>
          <h2>基本信息</h2>
          <div class="identity-grid">
            <el-form-item class="logo-item" label="赛事 Logo">
              <button class="logo-select" type="button" @click="logoDialogVisible=true">
                <img v-if="logoPreview" :src="logoPreview" alt="赛事 Logo" />
                <span v-else><el-icon><Trophy /></el-icon></span>
              </button>
              <el-button link type="primary" @click="logoDialogVisible=true">上传 Logo</el-button>
            </el-form-item>
            <el-form-item label="赛事名称" prop="name" required><el-input v-model="form.name" maxlength="50" show-word-limit /></el-form-item>
            <el-form-item label="赛事简称"><el-input v-model="form.shortName" maxlength="20" /></el-form-item>
          </div>
          <div class="grid">
            <el-form-item label="赛事类别" prop="category" required><el-select v-model="form.category"><el-option label="青少年足球赛事" value="youth" /><el-option label="成人足球赛事" value="adult" /><el-option label="校园足球赛事" value="campus" /></el-select></el-form-item>
            <el-form-item label="比赛地点" prop="regionPath" required><el-cascader v-model="form.regionPath" :options="regionOptions" :props="{emitPath:true}" filterable clearable placeholder="请选择省、市、区县" /></el-form-item>
          </div>
        </section>

        <section>
          <h2>举办信息</h2>
          <div class="grid">
            <el-form-item label="赛事日期" prop="dateRange" required><el-date-picker v-model="form.dateRange" type="daterange" value-format="YYYY-MM-DD" range-separator="—" start-placeholder="开始日期" end-placeholder="结束日期" /></el-form-item>
            <el-form-item label="报名截止日"><el-date-picker v-model="form.deadline" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" /></el-form-item>
            <el-form-item label="赛事联系人" prop="contactName" required><el-input v-model="form.contactName" maxlength="30" /></el-form-item>
            <el-form-item label="联系电话" prop="contactPhone" required><el-input v-model="form.contactPhone" maxlength="20" inputmode="tel" /></el-form-item>
          </div>
        </section>

        <section>
          <div class="section-title"><h2>组织架构</h2><span>选填</span></div>
          <div class="organization-fields">
            <el-form-item label="主办单位"><div class="org-rows"><div v-for="(item,index) in form.organizers" :key="'organizer-'+index"><el-input v-model="form.organizers[index]" maxlength="120" /><el-button v-if="form.organizers.length>1" link type="danger" @click="removeOrganization('organizers',index)">删除</el-button></div><el-button link type="primary" @click="addOrganization('organizers')">＋ 增加主办单位</el-button></div></el-form-item>
            <el-form-item label="承办单位"><div class="org-rows"><div v-for="(item,index) in form.undertakers" :key="'undertaker-'+index"><el-input v-model="form.undertakers[index]" maxlength="120" /><el-button v-if="form.undertakers.length>1" link type="danger" @click="removeOrganization('undertakers',index)">删除</el-button></div><el-button link type="primary" @click="addOrganization('undertakers')">＋ 增加承办单位</el-button></div></el-form-item>
            <el-form-item label="协办单位"><div class="org-rows"><div v-for="(item,index) in form.coOrganizers" :key="'co-organizer-'+index"><el-input v-model="form.coOrganizers[index]" maxlength="120" /><el-button v-if="form.coOrganizers.length>1" link type="danger" @click="removeOrganization('coOrganizers',index)">删除</el-button></div><el-button link type="primary" @click="addOrganization('coOrganizers')">＋ 增加协办单位</el-button></div></el-form-item>
          </div>
        </section>
        <section>
          <CommercialPartnersEditor v-model="form.commercialCategories" />
        </section>
      </el-form>

      <aside class="preview">
        <h2>赛事预览</h2>
        <div class="preview-card">
          <img v-if="logoPreview" :src="logoPreview" alt="赛事 Logo" /><el-icon v-else><Trophy /></el-icon>
          <h3>{{ form.name || '赛事名称' }}</h3><span>筹备中</span>
          <p><el-icon><Location /></el-icon>{{ previewRegion }}</p>
          <p><el-icon><Calendar /></el-icon>{{ previewDate }}</p>
        </div>
        <div class="next"><h3>创建后下一步</h3><ol><li>核对竞赛规则草稿</li><li>确认球队加入</li><li>配置抽签与赛程</li></ol></div>
      </aside>
    </div>

    <footer class="actions"><span><el-icon><InfoFilled /></el-icon>识别结果均为草稿，可继续修改。</span><div><el-button @click="requestBack">返回赛事空间</el-button><el-button :loading="savingDraft" @click="saveDraft">保存草稿</el-button><el-button type="primary" :loading="creating" @click="createAndEnter">创建赛事并进入主控制台</el-button></div></footer>
    <el-dialog v-model="logoDialogVisible" title="上传赛事 Logo" width="620px" destroy-on-close><RemoveBgProcessor type="tournamentLogo" @success="handleLogoReady" /><template #footer><el-button @click="logoDialogVisible=false">取消</el-button></template></el-dialog>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Calendar, Document, InfoFilled, Location, Trophy } from '@element-plus/icons-vue'
import { _arrayBufferToBase64, addRecord, callFunction, queryList, updateRecord, uploadLargeFileViaCloud } from '../../utils/cloud'
import RemoveBgProcessor from '../../components/common/RemoveBgProcessor.vue'
import { cityMapData, districtMapData, provincesData } from '../team/areaData'
import CommercialPartnersEditor from '../../components/tournament/CommercialPartnersEditor.vue'
import { commercialCategoriesFrom, commercialPayload } from '../../utils/commercialPartners'
import { normalizeRecognizedGender, recognizedDivisionRulePayload } from '../../utils/regulationRecognition'

const router=useRouter()
const formRef=ref(null)
const savingDraft=ref(false)
const creating=ref(false)
const uploadingRegulations=ref(false)
const logoDialogVisible=ref(false)
const logoPreview=ref('')
const pendingSourceFile=ref(null)
const draftId=ref('')
const recognizedDivisions=ref([])
const recognizedSharedRegulationDetails=ref({})
const isVisualQa=import.meta.env.DEV&&(window.location.href.includes('visualQa=1')||localStorage.getItem('sxfVisualQa')==='1')
const allProvince=code=>code+':all'
const allCity=code=>code+':all'
const regionOptions=provincesData.map(province=>({value:province.code,label:province.name,children:[{value:allProvince(province.code),label:'全省'},...(cityMapData[province.code]||[]).map(city=>({value:city.code,label:city.name,children:[{value:allCity(city.code),label:'全市'},...(districtMapData[city.code]||[]).map(district=>({value:district.code,label:district.name}))]}))]}))
const form=ref(isVisualQa?{name:'2026河南青少年足球冠军联赛',shortName:'河南青少年冠军联赛',category:'youth',regionPath:['410000','410100','410100:all'],commercialCategories:commercialCategoriesFrom(),dateRange:['2026-07-20','2026-08-18'],deadline:'2026-07-10',organizers:['河南青少年体育联合会'],undertakers:[''],coOrganizers:[''],contactName:'许老师',contactPhone:'138****2468',regulationsFileId:'',regulationsUrl:'',regulationsFileName:'',logoSourceUrl:'',logoTransparentUrl:'',logoTransparentFileId:''}:{name:'',shortName:'',category:'youth',regionPath:[],commercialCategories:commercialCategoriesFrom(),dateRange:[],deadline:'',organizers:[''],undertakers:[''],coOrganizers:[''],contactName:'',contactPhone:'',regulationsFileId:'',regulationsUrl:'',regulationsFileName:'',logoSourceUrl:'',logoTransparentUrl:'',logoTransparentFileId:''})
const rules={name:[{required:true,message:'请输入赛事名称',trigger:'blur'}],category:[{required:true,message:'请选择赛事类别',trigger:'change'}],regionPath:[{type:'array',required:true,min:2,message:'请选择比赛地点',trigger:'change'}],dateRange:[{type:'array',required:true,min:2,message:'请选择赛事日期',trigger:'change'}],contactName:[{required:true,message:'请输入赛事联系人',trigger:'blur'}],contactPhone:[{required:true,message:'请输入联系电话',trigger:'blur'}]}

function regionSelection(){
  const path=form.value.regionPath||[]
  const province=provincesData.find(item=>item.code===path[0])
  const city=(cityMapData[path[0]]||[]).find(item=>item.code===path[1])
  const district=city?(districtMapData[city.code]||[]).find(item=>item.code===path[2]):null
  if(!province)return{provinceCode:'',province:'',cityCode:'',city:'',districtCode:'',district:'',regionScope:'',region:''}
  if(!city)return{provinceCode:province.code,province:province.name,cityCode:'',city:province.name,districtCode:'',district:'',regionScope:'province',region:province.name+'（全省）'}
  if(!district)return{provinceCode:province.code,province:province.name,cityCode:city.code,city:city.name,districtCode:'',district:'',regionScope:'city',region:province.name+' '+city.name+'（全市）'}
  return{provinceCode:province.code,province:province.name,cityCode:city.code,city:city.name,districtCode:district.code,district:district.name,regionScope:'district',region:province.name+' '+city.name+' '+district.name}
}
function pathFromNames(data){
  const text=[data.province,data.city,data.district,data.location].filter(Boolean).join(' ')
  const province=provincesData.find(item=>text.includes(item.name));if(!province)return[]
  const city=(cityMapData[province.code]||[]).find(item=>text.includes(item.name));if(!city)return[province.code,allProvince(province.code)]
  const district=(districtMapData[city.code]||[]).find(item=>text.includes(item.name));return district?[province.code,city.code,district.code]:[province.code,city.code,allCity(city.code)]
}
function cleanList(value){return(Array.isArray(value)?value:[]).map(item=>String(item||'').trim()).filter(Boolean)}
function addOrganization(key){form.value[key].push('')}
function removeOrganization(key,index){form.value[key].splice(index,1);if(!form.value[key].length)form.value[key]=['']}
const previewDate=computed(()=>form.value.dateRange.length===2?form.value.dateRange[0]+' — '+form.value.dateRange[1]:'赛事日期')
const previewRegion=computed(()=>regionSelection().region||'办赛地点')

function currentOrgId(){if(isVisualQa)return'qa-org';try{const user=JSON.parse(localStorage.getItem('userInfo')||'{}');return user.orgId||user.organizationId||''}catch{return''}}
function handleLogoReady(asset){logoPreview.value=asset.previewUrl||asset.url;pendingSourceFile.value=asset.sourceFile||null;form.value.logoTransparentFileId=asset.fileID||'';form.value.logoTransparentUrl=asset.fileID||asset.url||'';logoDialogVisible.value=false}
async function ensureSourceLogo(){if(!pendingSourceFile.value||form.value.logoSourceUrl)return;const extension=pendingSourceFile.value.name.split('.').pop()||'png';const result=await uploadLargeFileViaCloud('tournament-logo-source/'+Date.now()+'.'+extension,pendingSourceFile.value,{chunkSize:32*1024});form.value.logoSourceUrl=result.tempUrl||result.fileId||'';pendingSourceFile.value=null}
function beforeRegulationsUpload(file){if(!/\.(pdf|docx)$/i.test(file.name)){ElMessage.error('自动识别仅支持 PDF、Word（.docx）');return false}if(file.size>10*1024*1024){ElMessage.error('竞赛规程不能超过 10MB');return false}return true}
async function handleRegulationsUpload(options){
  uploadingRegulations.value=true
  try{
    const file=options.file
    const uploaded=await uploadLargeFileViaCloud('tournament-regulations/'+Date.now()+'-'+file.name,file,{chunkSize:32*1024})
    form.value.regulationsFileId=uploaded.fileId||'';form.value.regulationsUrl=uploaded.tempUrl||'';form.value.regulationsFileName=file.name
    await recognizeLocalFile(file)
  }catch(error){ElMessage.error('规程处理失败：'+(error.message||'请重试'))}finally{uploadingRegulations.value=false}
}
async function recognizeLocalFile(file){
  const bytes=await file.arrayBuffer();const size=32*1024;const total=Math.ceil(bytes.byteLength/size);const sessionId='create_'+Date.now()+'_'+Math.random().toString(36).slice(2,8)
  let result=await callFunction('parseTournamentRegulations',{action:'startChunkedParse',sessionId,fileName:file.name,fileSize:bytes.byteLength,fileType:file.type||'',fileID:form.value.regulationsFileId})
  if(!result?.success)throw new Error(result?.error||'初始化识别失败')
  for(let index=0;index<total;index++){const dataChunk=_arrayBufferToBase64(bytes.slice(index*size,Math.min((index+1)*size,bytes.byteLength)));result=await callFunction('parseTournamentRegulations',{action:'uploadDataChunk',sessionId,chunkIndex:index,totalChunks:total,dataChunk});if(!result?.success)throw new Error(result?.error||'规程传输失败')}
  result=await callFunction('parseTournamentRegulations',{action:'executeParsed',sessionId},300000)
  if(!result?.success)throw new Error(result?.error||'规程识别失败')
  applyRecognition(result.data||{})
}
function applyRecognition(data){
  const basic=data.basicInfo||{};const organizations=data.organizationStructure||{}
  if(basic.name)form.value.name=String(basic.name)
  if(['youth','adult','campus'].includes(basic.category))form.value.category=basic.category
  if(basic.startDate&&basic.endDate)form.value.dateRange=[basic.startDate,basic.endDate]
  if(basic.deadline)form.value.deadline=basic.deadline
  const path=pathFromNames(basic);if(path.length)form.value.regionPath=path
  const organizers=cleanList(organizations.organizers);if(organizers.length)form.value.organizers=organizers
  const undertakers=cleanList(organizations.undertakers);if(undertakers.length)form.value.undertakers=undertakers
  const coOrganizers=cleanList(organizations.coOrganizers);if(coOrganizers.length)form.value.coOrganizers=coOrganizers
  recognizedDivisions.value=Array.isArray(data.divisions)?data.divisions.filter(item=>String(item?.name||'').trim()):[]
  recognizedSharedRegulationDetails.value=data.sharedRegulationDetails&&typeof data.sharedRegulationDetails==='object'?data.sharedRegulationDetails:{}
  ElMessage.success('赛事资料已识别，请核对后创建')
}
function normalizedFormat(value){const text=String(value||'').toLowerCase().replace(/人制$/,'side');return['5side','7side','8side','9side','11side'].includes(text)?text:'7side'}
async function createDivisionDrafts(tournamentId){
  if(!recognizedDivisions.value.length)return 0
  const existing=await queryList('divisions',{where:{tournamentId},limit:100,silent:true});const names=new Set(existing.map(item=>String(item.name||item.divisionName||'').trim().toLowerCase()));let created=0
  for(const source of recognizedDivisions.value){const name=String(source.name||'').trim();if(!name||names.has(name.toLowerCase()))continue;const matchFormat=normalizedFormat(source.matchFormat);const playersOnField=Number(matchFormat.replace('side',''));const limits={'5side':25,'7side':35,'8side':40,'9side':45,'11side':50};const recognizedRules=recognizedDivisionRulePayload(source,recognizedSharedRegulationDetails.value);await addRecord('divisions',{tournamentId,name,customName:name,nameSource:'custom',ageGroup:String(source.ageGroup||'open'),gender:normalizeRecognizedGender(source.gender),matchFormat,playersOnField,maxPlayersPerTeam:limits[matchFormat],expectedTeams:Math.max(2,Number(source.expectedTeams||8)),displayOrder:existing.length+created+1,mode:'simple',isProfessional:false,ruleStatus:'draft',ruleProgress:0,rulesVersion:'暂未定版',formatType:['cup','tournament','league','hybrid'].includes(source.formatType)?source.formatType:'cup',groupCount:Number(source.groupCount||0),teamsPerGroup:Number(source.teamsPerGroup||0),groupCycle:source.groupCycle==='double'?'double':'single',advancePerGroup:Number(source.advancePerGroup||0),knockoutSize:Number(source.knockoutSize||0),periodMode:source.periodMode==='quarters'?'single':'halves',matchMinutes:Number(source.matchMinutes||0),breakMinutes:Number(source.breakMinutes||0),substitutionLimit:Number(source.substitutionLimit||0),substitutionReentryAllowed:source.substitutionReentryAllowed===true,yellowCardSuspension:Number(source.yellowCardSuspension||0),redCardSuspension:Number(source.redCardSuspension||0),winPoints:Number(source.winPoints??3),drawPoints:Number(source.drawPoints??1),lossPoints:Number(source.lossPoints??0),...recognizedRules,regulationSourceFileId:form.value.regulationsFileId,regulationRecognition:true,regulationRecognizedAt:new Date(),createTime:new Date(),updateTime:new Date()});names.add(name.toLowerCase());created++}
  return created
}
async function validateForm(){if(!currentOrgId()){ElMessage.error('未识别到当前机构，请重新登录后再创建赛事');return false}try{await formRef.value.validate();return true}catch{return false}}
function payload(status){const dates=form.value.dateRange||[];const region=regionSelection();const organizers=cleanList(form.value.organizers);const undertakers=cleanList(form.value.undertakers);const coOrganizers=cleanList(form.value.coOrganizers);const commercial=commercialPayload(form.value.commercialCategories);return{name:form.value.name.trim(),shortName:form.value.shortName.trim(),category:form.value.category,...region,location:region.region,...commercial,startDate:dates[0]||'',endDate:dates[1]||'',deadline:form.value.deadline||'',organizers,organizerName:organizers.join('、'),undertakers,coOrganizers,undertakerName:undertakers.join('、'),coOrganizerName:coOrganizers.join('、'),organizationStructure:{organizers,organizerName:organizers.join('、'),undertakers,coOrganizers},contactName:form.value.contactName.trim(),contactPhone:form.value.contactPhone.trim(),regulationsFileId:form.value.regulationsFileId,regulationsUrl:form.value.regulationsUrl,regulationsFileName:form.value.regulationsFileName,logo:form.value.logoTransparentUrl,logoTransparentUrl:form.value.logoTransparentUrl,logoTransparentFileId:form.value.logoTransparentFileId,logoSourceUrl:form.value.logoSourceUrl,status,createFlowVersion:'regulation-first-v2'}}
async function writeTournament(status){await ensureSourceLogo();if(form.value.logoTransparentFileId)form.value.logoTransparentUrl=form.value.logoTransparentFileId;if(/^data:|^blob:/i.test(String(form.value.logoSourceUrl||'')))form.value.logoSourceUrl='';const data=payload(status);data.regulationDivisionSuggestions=recognizedDivisions.value;data.regulationRecognitionData={sharedRegulationDetails:recognizedSharedRegulationDetails.value,divisions:recognizedDivisions.value};data.regulationRecognitionStatus=recognizedDivisions.value.length?'suggestions_ready':'';const payloadBytes=new Blob([JSON.stringify(data)]).size;if(payloadBytes>512*1024)throw new Error('赛事资料中仍包含过大的本地图片，请重新选择Logo后再创建');if(draftId.value){await updateRecord('tournaments',draftId.value,data);return draftId.value}const result=await addRecord('tournaments',data);const id=result._id||result.id||result.data?._id;if(!id)throw new Error('赛事已保存但未返回赛事标识');draftId.value=id;return id}
async function saveDraft(){savingDraft.value=true;try{const id=await writeTournament('draft');ElMessage.success('赛事草稿已保存');return id}catch(error){ElMessage.error('保存草稿失败：'+(error.message||'请稍后重试'))}finally{savingDraft.value=false}}
async function createAndEnter(){if(!await validateForm())return;creating.value=true;try{const id=await writeTournament('draft');const created=await createDivisionDrafts(id);ElMessage.success(created?`赛事已创建，并自动生成 ${created} 个竞赛规则草稿`:'赛事已创建，请继续添加竞赛组别');router.push('/tournaments/'+id)}catch(error){ElMessage.error('创建赛事失败：'+(error.message||'请稍后重试'))}finally{creating.value=false}}
async function requestBack(){const changed=form.value.name||form.value.regionPath.length||form.value.dateRange.length||form.value.regulationsFileId||form.value.logoTransparentUrl;if(changed&&!draftId.value){try{await ElMessageBox.confirm('当前资料尚未保存，确定返回赛事空间吗？','确认返回',{confirmButtonText:'返回',cancelButtonText:'继续填写',type:'warning'})}catch{return}}router.push('/tournament-space')}
</script>

<style scoped>
.create-page{width:min(calc(100% - 64px),1240px);margin:0 auto;padding:22px 0 112px}.breadcrumb{display:flex;gap:9px;color:#68766e;font-size:13px}.breadcrumb button{padding:0;border:0;color:#4e6055;background:transparent;cursor:pointer}.create-page>header{margin:18px 0 14px}.create-page>header h1{margin:0;font-size:28px}.create-page>header p{margin:6px 0 0;color:#627168}.layout{display:grid;grid-template-columns:minmax(0,880px) 310px;gap:18px}.form-panel,.preview{border:1px solid #dfe5e1;border-radius:8px;background:#fff;box-shadow:0 3px 12px rgba(16,52,32,.05)}.form-panel>section{padding:21px 26px 7px}.form-panel>section+section{border-top:1px solid #e7ebe8}.form-panel h2,.preview>h2{margin:0 0 17px;font-size:17px}.section-title{display:flex;align-items:center;gap:8px}.section-title span{margin-bottom:17px;padding:2px 7px;border-radius:4px;color:#68766e;background:#edf2ef;font-size:12px}.regulation-first{background:#f4fbf6}.regulation-first>p{margin:-7px 0 13px;color:#5f6f65;font-size:13px}.regulations,.recognized{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.regulations small{color:#78847c}.file-row{display:flex;min-width:320px;align-items:center;gap:8px;padding:8px 11px;border:1px solid #dce6df;background:#fff}.file-row span{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.recognized{margin-top:12px}.recognized strong{color:#167442;font-size:13px}.identity-grid{display:grid;grid-template-columns:140px minmax(0,1fr);gap:0 22px;max-width:720px}.logo-item{grid-row:1/3}.logo-select{display:grid;width:112px;height:112px;place-items:center;overflow:hidden;border:1px dashed #c9d3cd;border-radius:6px;color:#a2aca6;background:#fff;cursor:pointer}.logo-select img{width:100%;height:100%;object-fit:contain}.logo-select .el-icon{font-size:46px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 24px;max-width:740px}.form-panel :deep(.el-input__wrapper),.form-panel :deep(.el-select__wrapper),.form-panel :deep(.el-date-editor){min-height:40px}.form-panel :deep(.el-select),.form-panel :deep(.el-cascader),.form-panel :deep(.el-date-editor){width:100%}.org-rows{display:flex;flex-direction:column;gap:7px}.org-rows>div{display:flex;gap:6px}.preview{padding:22px}.preview-card{padding:24px 20px;border:1px solid #e3e8e5;text-align:center}.preview-card>img{width:86px;height:86px;object-fit:contain}.preview-card>.el-icon{color:#aeb7b1;font-size:52px}.preview-card h3{margin:15px 0 8px}.preview-card>span{display:inline-block;padding:3px 7px;color:#1680cf;background:#eaf5ff;font-size:12px}.preview-card p{display:flex;align-items:center;gap:7px;margin:12px 0 0;color:#5b6a61;font-size:13px;text-align:left}.next{margin-top:20px;padding-top:18px;border-top:1px solid #e3e8e5}.next h3{margin:0;font-size:15px}.next ol{display:grid;gap:12px;margin:14px 0 0;padding-left:22px;color:#4f6056;font-size:13px}.actions{position:fixed;right:0;bottom:0;left:0;z-index:10;display:flex;min-height:82px;align-items:center;justify-content:space-between;gap:18px;padding:14px 42px;border-top:1px solid #dfe5e1;background:rgba(255,255,255,.98);box-shadow:0 -4px 16px rgba(24,52,37,.06)}.actions>span{display:flex;align-items:center;gap:7px;color:#526159}.actions>div{display:flex;gap:10px}.actions :deep(.el-button){min-width:140px;min-height:44px}.actions :deep(.el-button--primary){min-width:280px;border-color:#087d47;background:#087d47}@media(max-width:1080px){.layout{grid-template-columns:1fr}.preview{display:none}}@media(max-width:720px){.create-page{width:calc(100% - 24px)}.identity-grid,.grid{grid-template-columns:1fr}.logo-item{grid-row:auto}.actions{position:static;align-items:stretch;flex-direction:column;padding:14px}.actions>div{flex-direction:column}.actions :deep(.el-button){width:100%;min-width:0}}
.wide{grid-column:1/-1}.custom-partners{display:flex;flex-direction:column;gap:8px}.custom-partners>div{display:grid;grid-template-columns:160px minmax(0,1fr) auto;gap:8px}
.organization-fields{display:flex;max-width:700px;flex-direction:column}.organization-input{width:620px;max-width:100%}.organization-fields .org-rows{width:680px;max-width:100%}.organization-fields .org-rows>div{display:grid;grid-template-columns:minmax(0,620px) 52px;align-items:center;gap:8px}@media(max-width:720px){.organization-input,.organization-fields .org-rows{width:100%}.organization-fields .org-rows>div{grid-template-columns:minmax(0,1fr) 52px}}
</style>
