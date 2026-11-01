<template>
  <el-dialog :model-value="modelValue" title="编辑球员资料" width="720px" style="max-width:calc(100vw - 32px)" append-to-body :close-on-click-modal="false" @close="close">
    <el-form label-position="top" @submit.prevent="save">
      <div class="player-edit-layout">
        <div class="portrait-field">
          <img v-if="previewUrl" :src="previewUrl" alt="球员照片" />
          <div v-else class="portrait-empty">未上传照片</div>
          <el-upload accept="image/jpeg,image/png,image/webp" :auto-upload="false" :show-file-list="false" :on-change="selectPhoto">
            <el-button>{{ previewUrl ? '更换照片' : '选择照片' }}</el-button>
          </el-upload>
          <span v-if="photoFile" class="photo-hint">已选择，创建球队时上传</span>
        </div>
        <div class="player-edit-fields">
          <el-form-item label="姓名" required><el-input v-model="draft.name" maxlength="30" /></el-form-item>
          <el-form-item label="球衣名"><el-input v-model="draft.jerseyName" maxlength="32" /></el-form-item>
          <el-form-item label="证件类型"><el-select v-model="draft.documentType"><el-option label="身份证" value="resident_id" /><el-option label="护照" value="passport" /></el-select></el-form-item>
          <el-form-item :label="draft.documentType === 'resident_id' ? '身份证号' : '护照号'"><el-input v-model="draft.identityNumber" :maxlength="draft.documentType === 'resident_id' ? 18 : 30" autocomplete="off" /></el-form-item>
          <el-form-item label="出生日期"><el-date-picker v-model="draft.birthDate" type="date" value-format="YYYY-MM-DD" /></el-form-item>
          <el-form-item label="性别"><el-select v-model="draft.gender" clearable><el-option label="男" value="male" /><el-option label="女" value="female" /></el-select></el-form-item>
          <el-form-item label="籍贯"><el-input v-model="draft.nativePlace" maxlength="60" /></el-form-item>
          <el-form-item label="国籍"><el-select v-model="draft.nationality" filterable clearable placeholder="待确认"><el-option v-for="item in nationalities" :key="item.code" :label="item.zh" :value="item.zh" /></el-select></el-form-item>
          <el-form-item label="球衣号码"><el-input v-model="draft.jerseyNumber" maxlength="3" inputmode="numeric" /></el-form-item>
          <el-form-item label="场上位置"><el-select v-model="draft.position" clearable><el-option v-for="item in positions" :key="item" :label="item" :value="item" /></el-select></el-form-item>
          <el-form-item label="惯用脚"><el-select v-model="draft.strongFoot" clearable><el-option label="左脚" value="left" /><el-option label="右脚" value="right" /><el-option label="双脚" value="both" /></el-select></el-form-item>
          <el-form-item label="身高（厘米）"><el-input-number v-model="draft.height" :min="50" :max="250" :precision="1" :controls="false" /></el-form-item>
          <el-form-item label="体重（公斤）"><el-input-number v-model="draft.weight" :min="10" :max="200" :precision="1" :controls="false" /></el-form-item>
        </div>
      </div>
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
    </el-form>
    <template #footer><el-button @click="close">取消</el-button><el-button type="primary" @click="save">保存资料</el-button></template>
  </el-dialog>
</template>
<script setup>
import nationalityCatalog from '../../../../cloudfunctions/webLoginApi/nationality-catalog.json'
import { onBeforeUnmount, ref, watch } from 'vue'
import { editableImportedProfile } from '../../../../cloudfunctions/tournamentRegistrationFlow/importPersonFields.cjs'
const props=defineProps({modelValue:Boolean,player:Object,team:Object})
const emit=defineEmits(['update:modelValue','save'])
const draft=ref({}),error=ref(''),previewUrl=ref(''),photoFile=ref(null)
const nationalities=nationalityCatalog.entries || []
const positions=['门将','后卫','左后卫','中后卫','右后卫','中场','后腰','中前卫','前腰','左边前卫','右边前卫','前锋','左边锋','中锋','右边锋','其他']
let ownedUrl=''
function release(){if(ownedUrl)URL.revokeObjectURL(ownedUrl);ownedUrl=''}
function close(){release();emit('update:modelValue',false)}
watch(()=>props.modelValue,visible=>{
  if(!visible){release();return}
  error.value='';photoFile.value=null
  const player=props.player || {}
  draft.value={...player,identityNumber:player.identityNumber || player.identityNumberPrefix || '',documentType:player.documentType || (/^\d{17}[0-9X]$/.test(player.identityNumber || '')?'resident_id':player.identityNumber?'passport':'resident_id'),height:player.height ?? null,weight:player.weight ?? null}
  previewUrl.value=player.previewUrl || ''
})
function selectPhoto(file){
  const raw=file.raw
  if(!raw || !['image/jpeg','image/png','image/webp'].includes(raw.type)){error.value='请选择 JPG、PNG 或 WebP 图片';return}
  if(raw.size>20*1024*1024){error.value='照片不能超过20MB';return}
  release();ownedUrl=URL.createObjectURL(raw);previewUrl.value=ownedUrl;photoFile.value=raw;error.value=''
}
function save(){
  try {
    const name=String(draft.value.name || '').trim()
    if(!name)throw new Error('请填写球员姓名')
    const profile=editableImportedProfile(draft.value)
    const number=String(draft.value.jerseyNumber || '').trim()
    if(number && !/^\d{1,3}$/.test(number))throw new Error('球衣号码应为1至3位数字')
    const duplicate=(props.team?.players || []).find(p=>p!==props.player && profile.identityNumber && String(p.identityNumber || '').replace(/\s/g,'').toUpperCase()===profile.identityNumber)
    if(duplicate)throw new Error('该证件号已被其他球员使用，请核对')
    error.value=''
    emit('save',{...profile,name,jerseyNumber:number,jerseyName:String(draft.value.jerseyName || '').trim().toUpperCase()},photoFile.value)
    close()
  }catch(e){error.value=e.message}
}
onBeforeUnmount(release)
</script>
<style scoped>
.player-edit-layout{display:grid;grid-template-columns:132px minmax(0,1fr);gap:24px}.portrait-field{display:flex;flex-direction:column;align-items:center;gap:10px}.portrait-field img,.portrait-empty{width:120px;height:155px;object-fit:contain;border:1px solid #dfe7e1}.portrait-empty{display:grid;place-items:center;color:#7b8780;font-size:12px}.photo-hint{font-size:12px;color:#6f7c73}.player-edit-fields{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}.player-edit-fields :deep(.el-select),.player-edit-fields :deep(.el-date-editor),.player-edit-fields :deep(.el-input-number){width:100%}@media(max-width:600px){.player-edit-layout{grid-template-columns:1fr}.player-edit-fields{grid-template-columns:1fr}.portrait-field{align-items:flex-start}}
</style>
