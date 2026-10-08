<template>
  <section class="card-catalog">
    <div class="catalog-toolbar">
      <el-input v-model.trim="keyword" clearable placeholder="搜索球员、卡片 ID、球队" @keyup.enter="search">
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-select v-model="regionId" aria-label="地区" @change="changeRegion"><el-option label="全部地区" value="all" /><el-option v-for="item in filters.regions" :key="item.id" :label="item.name" :value="item.id" /></el-select>
      <el-select v-model="tournamentId" aria-label="赛事" @change="changeTournament"><el-option label="全部赛事" value="all" /><el-option v-for="item in visibleTournaments" :key="item.id" :label="item.name" :value="item.id" /></el-select>
      <el-select v-model="teamId" aria-label="球队" @change="changeTeam"><el-option label="全部球队" value="all" /><el-option v-for="item in visibleTeams" :key="item.id" :label="item.name" :value="item.id" /></el-select>
      <el-select v-model="tier" aria-label="卡级"><el-option label="全部卡级" value="all" /><el-option label="铜卡" value="bronze" /><el-option label="银卡" value="silver" /><el-option label="金卡" value="gold" /></el-select>
      <el-select v-model="cardStatus" aria-label="成卡状态"><el-option label="全部状态" value="all" /><el-option label="已完成" value="ready" /><el-option label="生成中" value="pending" /><el-option label="生成失败" value="failed" /><el-option label="待制卡" value="missing" /><el-option label="测试排除" value="excluded" /></el-select>
      <el-select v-model="scopeType" aria-label="卡片范围"><el-option label="全部范围" value="all" /><el-option label="基础卡" value="base" /><el-option label="全平台" value="platform" /><el-option label="球队" value="team" /><el-option label="赛事" value="tournament" /><el-option label="球员" value="player" /><el-option label="未分配" value="unassigned" /></el-select>
      <el-select v-model="versionFilter" aria-label="版本状态"><el-option label="全部版本" value="all" /><el-option label="当前版本" value="current" /><el-option label="历史版本" value="history" /></el-select>
      <el-button @click="search" :loading="loading">刷新</el-button>
      <span class="catalog-coverage">全库 {{ coverage.cardedPlayers }} 人已成卡 · {{ coverage.missingPlayers }} 人待制卡 · {{ coverage.noPhotoPlayers }} 人缺头像 · {{ coverage.excludedPlayers }} 名测试数据</span>
      <span class="catalog-total">当前 {{ total }} 条</span>
    </div>

    <div v-if="coverage.missingPlayers || selectedPlayerIds.size || batchJob" class="batch-toolbar">
      <el-checkbox :model-value="allVisibleSelected" :disabled="!visibleMissing.length" @change="toggleVisiblePlayers">全选本页待制卡</el-checkbox>
      <el-button size="small" :loading="selectingAll" @click="selectAllFiltered">全选筛选结果</el-button>
      <span>已选 {{ selectedPlayerIds.size }} 人</span>
      <el-select v-model="selectedTemplateId" filterable placeholder="选择卡片模板" :loading="templatesLoading" @visible-change="openTemplates">
        <el-option-group v-for="group in templateGroups" :key="group.name" :label="group.label">
          <el-option v-for="template in group.templates" :key="template.id" :value="template.id" :label="templateLabel(template)" />
        </el-option-group>
        <template #empty><span class="template-empty">{{ templatesLoading ? '正在读取模板…' : '暂无已发布模板' }}</span></template>
      </el-select>
      <span v-if="selectedTemplate" class="batch-scope">{{ selectedTemplateScope }}</span>
      <el-button type="primary" :disabled="!compatiblePlayerIds.length || !selectedTemplateId || batchRunning" :loading="batchRunning" @click="startBatch">制作 {{ compatiblePlayerIds.length }} 人</el-button>
      <span v-if="incompatibleCount" class="batch-warning">另有 {{ incompatibleCount }} 人不符合模板范围</span>
    </div>
    <div v-if="batchJob" class="batch-progress" role="status" aria-live="polite">
      <div><strong>{{ batchJob.templateName || '卡片制作' }}</strong><span>{{ batchJob.completed }} / {{ batchJob.total }}</span></div>
      <el-progress :percentage="batchPercentage" :status="batchJob.status === 'completed_with_failures' ? 'exception' : undefined" />
      <small>已生成 {{ batchJob.generated }} · 跳过 {{ batchJob.skipped }} · 失败 {{ batchJob.failed }}</small>
      <small v-if="batchSkipText">{{ batchSkipText }}</small>
      <el-button v-if="batchJob.status === 'pending' && !batchRunning" size="small" @click="advanceBatch">继续生成</el-button>
      <el-button v-if="batchJob.failed && batchJob.status !== 'pending'" size="small" type="warning" plain @click="retryBatch">重试失败项</el-button>
    </div>

    <el-alert v-if="error" :title="error" type="error" :closable="false"><template #default><el-button link @click="load">重试</el-button></template></el-alert>
    <div v-loading="loading" class="catalog-body">
      <div v-if="cards.length" class="catalog-grid">
        <article v-for="card in cards" :key="card.cardId" class="catalog-card">
          <button class="catalog-image" type="button" @click="openCard(card)" :aria-label="'预览' + card.playerName + '的球员卡'">
            <img v-if="card.cardUrl" :src="card.cardUrl" :alt="card.playerName + '球员卡'" @error="card.imageFailed=true">
            <img v-else-if="card.status === 'missing' && card.portraitUrl" class="missing-portrait" :src="card.portraitUrl" :alt="card.playerName + '头像'" @error="card.portraitFailed=true">
            <span v-else class="image-failed">{{ card.imageFailed ? '图片读取失败' : statusLabel(card.status,card.portraitStatus) }}</span>
            <el-tag class="version-state" size="small" :type="card.status === 'excluded' ? 'danger' : card.status !== 'ready' ? 'warning' : card.isCurrent ? 'success' : 'info'">{{ card.status !== 'ready' ? statusLabel(card.status,card.portraitStatus) : card.isCurrent ? '当前' : '历史' }}</el-tag>
          </button>
          <div class="catalog-info">
            <div class="catalog-player"><strong>{{ card.playerName }}</strong><span>{{ card.jerseyNumber ? `#${card.jerseyNumber}` : '' }} · {{ tierName(card.cardTypeId) }}</span></div>
            <p>{{ card.teamName || '球队待补充' }} · {{ card.title }}</p>
            <p v-if="card.visualOnly" class="photo-status">卡面已生成 · 等级待核验</p>
            <p v-if="card.status === 'missing'" class="photo-status">{{ photoStatusLabel(card.portraitStatus) }}</p>
            <p class="catalog-version">{{ card.scopeName }}{{ card.scopeTargetName ? ` · ${card.scopeTargetName}` : '' }} · 模板 V{{ card.publishedVersion }} · 资料 V{{ card.cardDataVersion }}</p>
            <div v-if="card.status === 'missing' || card.status === 'excluded'" class="catalog-id"><span class="missing-id">尚未生成卡片 ID</span></div>
            <div v-else class="catalog-id"><code :title="card.cardId">{{ card.cardId }}</code><el-button link @click="copyId(card.cardId)">复制 ID</el-button></div>
            <div class="catalog-actions">
              <el-checkbox v-if="card.status === 'missing'" :model-value="selectedPlayerIds.has(card.playerId)" :disabled="!card.selectable || batchRunning" @change="togglePlayer(card,$event)">选择</el-checkbox>
              <el-button v-if="card.status === 'missing'" size="small" link @click="$emit('create-for-player', card.playerId)">新建个人模板</el-button>
              <span v-if="card.status === 'excluded'" class="excluded-note">测试数据不参与正式制卡</span>
              <el-button v-else size="small" :disabled="!card.cardUrl" @click="openCard(card)">查看成卡</el-button>
              <el-button v-if="card.canEdit" size="small" type="primary" plain @click="editCard(card)">编辑成卡</el-button>
              <el-button v-if="card.canEdit" size="small" link title="编辑模板并重新生成该范围内的成卡" @click="$emit('edit-template', card.templateId)">编辑模板</el-button>
            </div>
          </div>
        </article>
      </div>
      <el-empty v-else-if="!loading" description="暂无符合条件的成卡" />
    </div>
    <div class="catalog-pager"><span>共 {{ total }} 张</span><el-select v-model="pageSize" aria-label="每页数量" @change="changePageSize"><el-option v-for="size in pageSizes" :key="size" :label="`每页 ${size} 张`" :value="size" /></el-select><el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="prev, pager, next" @current-change="load" /></div>

    <el-dialog v-model="previewOpen" :title="previewCard ? `${previewCard.playerName} · ${tierName(previewCard.cardTypeId)}` : '球员卡预览'" width="min(620px, 96vw)">
      <template v-if="previewCard">
        <img class="catalog-large" :src="previewImage||previewCard.cardUrl" :alt="previewCard.playerName + '的球员卡'">
        <div class="preview-meta"><span>卡片 ID</span><code>{{ previewCard.cardId }}</code></div>
        <div class="preview-meta"><span>模板版本</span><strong>V{{ previewCard.publishedVersion }} · 资料 V{{ previewCard.cardDataVersion }}</strong></div>
        <div v-if="previewCard.visualOnly" class="preview-meta"><span>等级状态</span><strong>待核验</strong></div>
        <div v-if="editSession" class="card-edit-controls">
          <strong>调整头像构图</strong>
          <label class="crop-slider">头像大小 <span>{{ Math.round(editCrop.zoom * 100) }}%</span><el-slider v-model="editCrop.zoom" :min="1" :max="4" :step="0.05" :format-tooltip="sizeTooltip" /></label>
          <label class="crop-slider">左右位置 <span>{{ offsetLabel(Math.round(editCrop.x * 100)) }}</span><el-slider v-model="editCrop.x" :min="-1" :max="1" :step="0.01" :format-tooltip="offsetLabel" /></label>
          <label class="crop-slider">上下位置 <span>{{ offsetLabel(Math.round(editCrop.y * 100)) }}</span><el-slider v-model="editCrop.y" :min="-1" :max="1" :step="0.01" :format-tooltip="offsetLabel" /></label>
          <p>拖动滑杆调整头像大小和位置，保存后生成新版本。</p>
          <div><el-button :loading="previewing" @click="previewCrop">预览调整</el-button><el-button type="primary" :loading="savingEdit" @click="saveCrop">保存新版本</el-button></div>
        </div>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { playerCardTemplateRequest } from '@/utils/cloud'
import { provinceCodeMap } from '@/data/teamCodeRegions'

defineEmits(['edit-template','create-for-player'])
const cards=ref([]),keyword=ref(''),regionId=ref('all'),tournamentId=ref('all'),teamId=ref('all'),filters=ref({regions:[],teams:[],tournaments:[]}),tier=ref('all'),cardStatus=ref('all'),scopeType=ref('all'),versionFilter=ref('all'),page=ref(1),pageSize=ref(30),pageSizes=[30,60,100],total=ref(0)
const loading=ref(false),error=ref(''),previewOpen=ref(false),previewCard=ref(null),coverage=ref({players:0,cardedPlayers:0,missingPlayers:0,noPhotoPlayers:0,excludedPlayers:0})
const previewImage=ref(''),editSession=ref(null),previewing=ref(false),savingEdit=ref(false),editCrop=reactive({zoom:1,x:0,y:0})
const visibleTeams=computed(()=>filters.value.teams.filter(item=>(regionId.value==='all'||item.regionId===regionId.value)&&(tournamentId.value==='all'||(item.tournamentIds||[]).includes(String(tournamentId.value)))))
const visibleTournaments=computed(()=>filters.value.tournaments.filter(item=>(teamId.value==='all'||(item.teamIds||[]).includes(String(teamId.value)))&&(regionId.value==='all'||(item.teamIds||[]).some(id=>filters.value.teams.some(team=>String(team.id)===String(id)&&team.regionId===regionId.value)))))
const selectedPlayerIds=ref(new Set()),selectedMeta=ref(new Map()),templates=ref([]),templatesLoading=ref(false),selectedTemplateId=ref(''),batchJob=ref(null),batchRunning=ref(false),selectingAll=ref(false)
const selectedTemplate=computed(()=>templates.value.find(item=>item.id===selectedTemplateId.value)||null)
const selectedTemplateScope=computed(()=>{const item=selectedTemplate.value;if(!item)return '';const label=({base:'基础模板',platform:'全平台预装',tournament:'赛事模板',team:'球队模板',player:'个人模板'})[item.system]||'模板';return `${label}${item.targetName?' · '+item.targetName:''} · ${tierName(item.tier)}`})
const templateGroups=computed(()=>['base','platform','tournament','team','player'].map(system=>({name:system,label:({base:'基础金银铜',platform:'全平台预装',tournament:'赛事金银铜',team:'球队体系卡',player:'球员定制卡'})[system],templates:templates.value.filter(item=>item.system===system)})).filter(group=>group.templates.length))
const compatiblePlayerIds=computed(()=>[...selectedPlayerIds.value].filter(id=>{
  const player=selectedMeta.value.get(id),template=selectedTemplate.value
  if(!player||!template)return false
  if(template.system==='team')return String(player.teamId||'')===String(template.targetId)
  if(template.system==='tournament')return (player.tournamentIds||[]).includes(String(template.targetId))
  if(template.system==='player')return String(player.playerId||id)===String(template.targetId)
  return true
}))
const incompatibleCount=computed(()=>Math.max(0,selectedPlayerIds.value.size-compatiblePlayerIds.value.length))
const visibleMissing=computed(()=>cards.value.filter(card=>card.status==='missing'&&card.selectable))
const allVisibleSelected=computed(()=>visibleMissing.value.length>0&&visibleMissing.value.every(card=>selectedPlayerIds.value.has(card.playerId)))
const batchPercentage=computed(()=>batchJob.value?.total?Math.min(100,Math.round(batchJob.value.completed/batchJob.value.total*100)):0)
const batchSkipText=computed(()=>{const reasons=[...new Set((batchJob.value?.skipReasons||[]).map(item=>String(item.reason||'')).filter(Boolean))];return reasons.length?`跳过原因：${reasons.join('、')}`:''})
const BATCH_STORAGE_KEY='playerCardCatalog.activeBatchJobId'
let requestVersion=0
function tierName(value){return ({bronze:'铜卡',silver:'银卡',gold:'金卡'})[value]||'等级待核定'}
function statusLabel(value,photoStatus){if(value==='missing')return photoStatus==='missing'?'待补头像':'待制卡';return ({pending:'生成中',failed:'生成失败',processing:'生成中',excluded:'测试数据不制卡'})[value]||'成卡暂不可用'}
function photoStatusLabel(value){return ({available:'已发现可用球队照片',review:'有登记照待核验',missing:'未找到可用头像'})[value]||'头像状态待核验'}
function templateLabel(template){const tier=({bronze:'铜卡',silver:'银卡',gold:'金卡'})[template.tier]||'卡片';const target=template.targetName?` · ${template.targetName}`:'';return `${tier} · ${template.title} V${template.version}${target}`}
function offsetLabel(value){const amount=Number(value)||0;return `${amount>0?'+':''}${Math.round(amount)}%`}
function sizeTooltip(value){return `${Math.round(Number(value||1)*100)}%`}
async function load(){
  const id=++requestVersion;loading.value=true;error.value=''
  try{
    const result=await playerCardTemplateRequest('listPlayerCardCatalog',{keyword:keyword.value,regionId:regionId.value,tournamentId:tournamentId.value,teamId:teamId.value,tier:tier.value,cardStatus:cardStatus.value,scopeType:scopeType.value,versionFilter:versionFilter.value,offset:(page.value-1)*pageSize.value,limit:pageSize.value})
    if(!result?.success)throw new Error(result?.error||'成卡库读取失败')
    if(id!==requestVersion)return
    cards.value=(result.cards||[]).map(card=>({...card,imageFailed:false}));total.value=Number(result.total||0)
    if(result.filters)filters.value={regions:(result.filters.regions||[]).map(item=>({...item,name:provinceCodeMap.find(province=>province.code===item.id)?.name||item.name})),teams:result.filters.teams||[],tournaments:result.filters.tournaments||[]}
    if(result.coverage)coverage.value={...coverage.value,...result.coverage}
  }catch(cause){if(id===requestVersion)error.value=cause.message||'成卡库读取失败，请重试'}
  finally{if(id===requestVersion)loading.value=false}
}
function search(){page.value=1;load()}
function changeRegion(){if(teamId.value!=='all'&&!visibleTeams.value.some(item=>item.id===teamId.value))teamId.value='all';if(tournamentId.value!=='all'&&!visibleTournaments.value.some(item=>item.id===tournamentId.value))tournamentId.value='all';search()}
function changeTournament(){if(teamId.value!=='all'&&!visibleTeams.value.some(item=>item.id===teamId.value))teamId.value='all';search()}
function changeTeam(){if(tournamentId.value!=='all'&&!visibleTournaments.value.some(item=>item.id===tournamentId.value))tournamentId.value='all';search()}
function changePageSize(){page.value=1;load()}
function togglePlayer(card,checked){const ids=new Set(selectedPlayerIds.value),meta=new Map(selectedMeta.value);if(checked){ids.add(card.playerId);meta.set(card.playerId,{playerId:card.playerId,teamId:card.teamId,tournamentIds:card.tournamentIds||[]})}else{ids.delete(card.playerId);meta.delete(card.playerId)}selectedPlayerIds.value=ids;selectedMeta.value=meta}
function toggleVisiblePlayers(checked){const ids=new Set(selectedPlayerIds.value),meta=new Map(selectedMeta.value);for(const card of visibleMissing.value){if(checked){ids.add(card.playerId);meta.set(card.playerId,{playerId:card.playerId,teamId:card.teamId,tournamentIds:card.tournamentIds||[]})}else{ids.delete(card.playerId);meta.delete(card.playerId)}}selectedPlayerIds.value=ids;selectedMeta.value=meta}
async function loadTemplates(){templatesLoading.value=true;try{const result=await playerCardTemplateRequest('listPlayerCardCatalogTemplates');if(!result?.success)throw new Error(result?.error||'模板列表读取失败');templates.value=result.templates||[]}catch(cause){ElMessage.error(cause.message||'模板列表读取失败')}finally{templatesLoading.value=false}}
async function openTemplates(open){if(open&&!templates.value.length)await loadTemplates()}
async function selectAllFiltered(){
  selectingAll.value=true
  try{const result=await playerCardTemplateRequest('listPlayerCardCatalogTargets',{keyword:keyword.value,regionId:regionId.value,tournamentId:tournamentId.value,teamId:teamId.value,tier:tier.value,scopeType:scopeType.value,cardStatus:'missing'});if(!result?.success)throw new Error(result?.error||'待制卡列表读取失败');const ids=new Set(selectedPlayerIds.value),meta=new Map(selectedMeta.value);for(const target of result.targets||[]){ids.add(target.playerId);meta.set(target.playerId,target)}selectedPlayerIds.value=ids;selectedMeta.value=meta;ElMessage.success(`已选 ${result.total||0} 名可制卡球员`)}catch(cause){ElMessage.error(cause.message||'待制卡列表读取失败')}finally{selectingAll.value=false}
}
async function runBatch(){
  if(batchRunning.value||!batchJob.value?.jobId)return
  batchRunning.value=true
  try{
    for(let step=0;step<200;step++){
      const result=await playerCardTemplateRequest('advancePlayerCardCatalogBatch',{jobId:batchJob.value.jobId})
      if(!result?.success)throw new Error(result?.error||'成卡生成失败')
      batchJob.value={...batchJob.value,...result}
      if(result.status!=='pending')break
      await new Promise(resolve=>setTimeout(resolve,50))
    }
    if(batchJob.value?.status==='completed'){
      selectedPlayerIds.value=new Set();selectedMeta.value=new Map();sessionStorage.removeItem(BATCH_STORAGE_KEY);await load()
    }else if(batchJob.value?.status==='completed_with_failures')await load()
  }catch(cause){ElMessage.error(cause.message||'成卡生成失败')}
  finally{batchRunning.value=false}
}
async function startBatch(){
  if(!selectedTemplateId.value||!compatiblePlayerIds.value.length||batchRunning.value)return
  const template=selectedTemplate.value
  try{
    const result=await playerCardTemplateRequest('startPlayerCardCatalogBatch',{templateId:selectedTemplateId.value,playerIds:compatiblePlayerIds.value})
    if(!result?.success)throw new Error(result?.error||'无法开始制卡')
    if(result.status==='completed'){ElMessage.info(`已跳过 ${result.skipped||0} 名已有此模板成卡的球员`);selectedPlayerIds.value=new Set();selectedMeta.value=new Map();await load();return}
    batchJob.value=result
    sessionStorage.setItem(BATCH_STORAGE_KEY,result.jobId)
    await runBatch()
  }catch(cause){ElMessage.error(cause.message||'无法开始制卡')}
}
async function advanceBatch(){await runBatch()}
async function retryBatch(){if(!batchJob.value?.jobId||batchRunning.value)return;try{const result=await playerCardTemplateRequest('retryPlayerCardCatalogBatch',{jobId:batchJob.value.jobId});if(!result?.success)throw new Error(result?.error||'重试失败');batchJob.value={...batchJob.value,...result};await runBatch()}catch(cause){ElMessage.error(cause.message||'重试失败')}}
function openCard(card){if(!card.cardUrl)return;editSession.value=null;previewCard.value=card;previewImage.value=card.cardUrl;previewOpen.value=true}
async function editCard(card){
  if(!card.canEdit)return
  loading.value=true
  try{
    const result=await playerCardTemplateRequest('getPlayerCardCatalogCard',{cardId:card.cardId})
    if(!result?.success)throw new Error(result?.error||'成卡读取失败')
    previewCard.value=result.card;previewImage.value=result.card.cardUrl||''
    Object.assign(editCrop,{zoom:Number(result.card.crop?.zoom||1),x:Number(result.card.crop?.x||0),y:Number(result.card.crop?.y||0)})
    editSession.value={cardId:result.card.cardId,editRevision:Number(result.card.editRevision||0)}
    previewOpen.value=true
  }catch(cause){ElMessage.error(cause.message||'成卡读取失败')}
  finally{loading.value=false}
}
async function previewCrop(){
  if(!editSession.value)return
  previewing.value=true
  try{const result=await playerCardTemplateRequest('previewPlayerCardCatalogCard',{cardId:editSession.value.cardId,crop:{...editCrop}});if(!result?.success)throw new Error(result?.error||'成卡预览失败');previewImage.value=result.imageUrl}
  catch(cause){ElMessage.error(cause.message||'成卡预览失败')}
  finally{previewing.value=false}
}
async function saveCrop(){
  if(!editSession.value)return
  savingEdit.value=true
  try{
    const result=await playerCardTemplateRequest('savePlayerCardCatalogCard',{cardId:editSession.value.cardId,expectedEditRevision:editSession.value.editRevision,crop:{...editCrop}})
    if(!result?.success)throw new Error(result?.error||'成卡保存失败')
    await load()
    const updated=await playerCardTemplateRequest('getPlayerCardCatalogCard',{cardId:result.cardId})
    if(!updated?.success)throw new Error(updated?.error||'新版本回读失败')
    previewCard.value=updated.card;previewImage.value=updated.card.cardUrl||'';editSession.value={cardId:updated.card.cardId,editRevision:Number(updated.card.editRevision||0)}
    ElMessage.success('已保存为新卡版本')
  }catch(cause){ElMessage.error(cause.message||'成卡保存失败')}
  finally{savingEdit.value=false}
}
async function copyId(value){
  try{await navigator.clipboard.writeText(String(value||''));ElMessage.success('卡片 ID 已复制')}
  catch{ElMessage.error('复制失败，请手动复制')}
}
watch([tier,cardStatus,scopeType,versionFilter],()=>search())
async function restoreBatch(){const jobId=sessionStorage.getItem(BATCH_STORAGE_KEY);if(!jobId)return;try{const result=await playerCardTemplateRequest('getPlayerCardCatalogBatchStatus',{jobId});if(result?.success){batchJob.value=result;if(result.status==='completed')sessionStorage.removeItem(BATCH_STORAGE_KEY);else if(result.status==='completed_with_failures'){sessionStorage.removeItem(BATCH_STORAGE_KEY)}}}catch{sessionStorage.removeItem(BATCH_STORAGE_KEY)}}
onMounted(()=>{load();loadTemplates();restoreBatch()})
</script>

<style scoped>
.card-catalog{display:grid;gap:14px;min-width:0}.catalog-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.catalog-toolbar>.el-input{width:min(320px,100%)}.catalog-toolbar>.el-select{width:132px}.catalog-total,.catalog-coverage{color:#64746b;font-size:12px}.catalog-total{margin-left:auto}.catalog-body{min-height:240px}.catalog-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px}.catalog-card{min-width:0;border:1px solid #dce7df;background:#fff}.catalog-image{position:relative;display:grid;place-items:center;width:100%;height:250px;padding:10px;border:0;background:#f0f4f1;cursor:pointer}.catalog-image img{display:block;width:100%;height:100%;object-fit:contain}.image-failed{color:#7b8981;font-size:12px}.version-state{position:absolute;top:10px;left:10px}.catalog-info{display:grid;gap:7px;padding:11px}.catalog-player{display:flex;align-items:baseline;justify-content:space-between;gap:8px}.catalog-player strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.catalog-player span,.catalog-info p{margin:0;color:#67766e;font-size:11px}.catalog-version{min-height:28px;line-height:1.4}.catalog-id{display:flex;align-items:center;gap:4px;min-width:0}.catalog-id code,.preview-meta code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#526359;font-size:10px}.missing-id{color:#a77828;font-size:11px}.catalog-actions{display:flex;gap:6px;flex-wrap:wrap}.catalog-pager{display:flex;align-items:center;justify-content:flex-end;gap:12px;color:#64746b;font-size:12px}.catalog-pager>.el-select{width:120px}.catalog-large{display:block;max-width:min(100%,360px);max-height:70vh;margin:0 auto 16px;object-fit:contain}.preview-meta{display:grid;grid-template-columns:100px minmax(0,1fr);gap:10px;padding:7px 0;border-top:1px solid #edf1ee;font-size:12px}.preview-meta>span{color:#6b7971}.card-edit-controls{display:grid;gap:8px;padding-top:12px;border-top:1px solid #edf1ee}.card-edit-controls>strong{font-size:13px}.card-edit-controls>.crop-slider{display:grid;grid-template-columns:90px 42px minmax(0,1fr);align-items:center;gap:12px;color:#46554d;font-size:12px}.crop-slider>span{text-align:right;font-variant-numeric:tabular-nums;color:#64746b}.crop-slider :deep(.el-slider){margin:0 8px}.card-edit-controls>p{margin:0;color:#6b7971;font-size:12px}.card-edit-controls>div{display:flex;gap:8px}@media(max-width:680px){.catalog-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.catalog-image{height:220px}.catalog-toolbar>.el-input{width:100%}.catalog-total{margin-left:0}.catalog-pager{flex-wrap:wrap;gap:6px}.card-edit-controls>.crop-slider{grid-template-columns:74px 38px minmax(0,1fr);gap:6px}.crop-slider :deep(.el-slider){margin:0 4px}}
.batch-toolbar,.batch-progress{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid #e5ece7;color:#526359;font-size:12px}.batch-toolbar>.el-select{width:min(320px,100%)}.batch-scope,.batch-warning,.excluded-note,.photo-status{color:#7b8981;font-size:11px}.batch-warning,.excluded-note{color:#a77828}.batch-progress>div{display:flex;justify-content:space-between;gap:20px;width:100%}.batch-progress>.el-progress{width:min(100%,480px)}.batch-progress>small{color:#64746b}.missing-portrait{padding:16px;object-fit:contain}.template-empty{display:block;padding:10px;color:#7b8981;font-size:12px}
</style>
