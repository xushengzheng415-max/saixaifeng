<template>
  <section class="rms-layout">
    <div class="rms-main">
      <article class="rms-card">
        <header class="rms-card-head">
          <div>
            <h3>报名材料要求</h3>
            <p>按本赛事需要选择必填、选填或不需要，未开启的项目不会出现在球员报名页。</p>
          </div>
          <span class="rms-summary">{{ materialSummary }}</span>
        </header>
        <div class="rms-grid">
          <div v-for="item in materialItems" :key="item.key" class="rms-row">
            <span class="rms-label">{{ item.label }}<i v-if="item.paid" class="rms-tag">付费开通</i><i v-else-if="item.noLiveness" class="rms-tag is-neutral">不要求活体</i></span>
            <el-select v-if="item.key === 'idDocs'" v-model="idDocsMode" size="small" class="rms-select">
              <el-option v-for="option in idDocOptions" :key="option.value" :label="option.label" :value="option.value" />
            </el-select>
            <el-select v-else v-model="form.materialRequirements[item.key]" size="small" class="rms-select">
              <el-option v-for="option in materialOptions" :key="option.value" :label="option.label" :value="option.value" />
            </el-select>
            <em class="rms-hint">{{ materialHint(item.key) }}</em>
          </div>
        </div>
        <div v-if="idDocsMode === 'photos'" class="rms-parts">
          <span class="rms-label">留存证件面</span>
          <div class="rms-part-list">
            <label v-for="part in idDocParts" :key="part.key"><el-checkbox v-model="form.idDocParts[part.key]" size="small">{{ part.label }}</el-checkbox></label>
            <small>{{ idDocPartSummary ? `当前留存：${idDocPartSummary}` : '未选择留存面' }}</small>
          </div>
        </div>
        <div class="rms-row"><span class="rms-label">同一球员限报一个组别</span><el-switch v-model="form.singleDivisionOnly" /><em class="rms-hint">{{ form.singleDivisionOnly ? '仅可报一个组别' : '允许跨组' }}</em></div>
        <div class="rms-row is-range"><span class="rms-label">球衣号码范围</span><div class="rms-number"><el-input-number v-model="form.jerseyNumberMin" :min="0" :max="999" size="small" controls-position="right" /><span>至</span><el-input-number v-model="form.jerseyNumberMax" :min="1" :max="999" size="small" controls-position="right" /></div><em class="rms-hint" :class="{ 'is-error': rangeInvalid }">{{ rangeInvalid ? '下限不能大于上限' : '报名填号时校验' }}</em></div>
        <p class="rms-note">身份证、实名、人脸在球员报名页统一前置，顺序为证件采集 → 实名认证 → 人脸核验；核验后自动带出姓名、出生日期、年龄与户籍地，球员不再二次填写。实名认证需活体检测并按次计费，开启前须已开通服务；人脸核验为静态照片与证件人像比对，不要求活体。保险与免责协议在生成参赛证前校验，允许先报名后补交。</p>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, watch } from 'vue'
import { ID_DOC_OPTIONS, ID_DOC_PARTS, MATERIAL_ITEMS, MATERIAL_OPTIONS } from '../../utils/registrationMaterials'

const props = defineProps({
  form: { type: Object, required: true }
})

const materialItems = MATERIAL_ITEMS
const idDocParts = ID_DOC_PARTS
const materialOptions = MATERIAL_OPTIONS
// 身份证材料只有三种提交方式，第三种仅限青少年组，成年组必须提交身份证号。
const idDocOptions = ID_DOC_OPTIONS
const idDocsMode = computed({
  // 兼容旧值：required / optional 都按“提交正反面”处理。
  get() {
    const value = props.form.materialRequirements.idDocs
    if (value === 'number' || value === 'photos' || value === 'none') return value
    return 'photos'
  },
  set(value) { props.form.materialRequirements.idDocs = value }
})

// 选择“提交正反面”时默认两面都留存，避免只传一面的配置遗漏。
watch(idDocsMode, (mode, previous) => {
  if (mode !== 'photos' || previous === 'photos') return
  const parts = props.form.idDocParts
  if (!parts.frontPhoto && !parts.backPhoto) { parts.frontPhoto = true; parts.backPhoto = true }
})

function materialIsRequired(key) { return props.form.materialRequirements[key] === 'required' }

function materialHint(key) {
  const value = props.form.materialRequirements[key]
  if (key === 'insurance') {
    if (value === 'required') return '参赛证前达标'
    if (value === 'optional') return '可后补'
    return '不校验'
  }
  if (key === 'realName') {
    if (value === 'required') return '前置核验·需开通'
    if (value === 'optional') return '选填，可后补'
    return '默认关闭'
  }
  if (key === 'faceCheck') {
    if (value === 'required') return '前置核验·静态比对'
    if (value === 'optional') return '选填，可后补'
    return '默认关闭'
  }
  if (key === 'idDocs') {
    if (idDocsMode.value === 'number') return '报名填号核验'
    if (idDocsMode.value === 'photos') return '上传正反面留存'
    return '仅限青少年组'
  }
  if (value === 'required') return '报名必交'
  if (value === 'optional') return '选填，可后补'
  return '不要求'
}

const idDocPartSummary = computed(() => {
  if (idDocsMode.value !== 'photos') return ''
  return idDocParts.filter(part => props.form.idDocParts[part.key]).map(part => part.label).join('、')
})

const rangeInvalid = computed(() => Number(props.form.jerseyNumberMin) > Number(props.form.jerseyNumberMax))

const materialSummary = computed(() => {
  const required = materialItems.filter(item => item.key !== 'idDocs' && materialIsRequired(item.key)).map(item => item.label)
  const optional = materialItems.filter(item => item.key !== 'idDocs' && props.form.materialRequirements[item.key] === 'optional').map(item => item.label)
  if (idDocsMode.value !== 'none') required.unshift(`身份证材料（${idDocOptions.find(option => option.value === idDocsMode.value).label}）`)
  if (!required.length) return optional.length ? `无必填项（选填：${optional.join('、')}）` : '无材料要求'
  return `必填 ${required.length} 项：${required.join('、')}`
})
</script>

<style scoped>
.rms-layout { display:block; }
.rms-main { min-width:0; }
.rms-card { padding:18px 22px; border:1px solid #dfe8e2; border-radius:12px; background:#fff; }
.rms-card-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; padding-bottom:14px; border-bottom:1px solid #edf1ee; }
.rms-card-head h3,.rms-card-head p { margin:0; }
.rms-card-head h3 { color:#1f3026; font-size:17px; }
.rms-card-head p { margin-top:5px; color:#718078; font-size:12px; line-height:1.5; }
.rms-summary { flex-shrink:0; padding:5px 10px; border-radius:6px; color:#087c43; background:#eaf7ee; font-size:12px; }
.rms-grid { display:grid; gap:0; }
.rms-row { display:grid; grid-template-columns:minmax(150px,190px) 128px minmax(0,1fr); align-items:center; gap:14px; padding:12px 0; border-bottom:1px solid #edf1ee; }
.rms-label { color:#31423a; font-size:13px; font-weight:600; white-space:nowrap; }
.rms-hint { color:#68756d; font-size:12px; font-style:normal; }
.rms-hint.is-error { color:#c45656; }
.rms-select { width:128px; }
.rms-tag { margin-left:6px; padding:1px 6px; border-radius:4px; color:#8a5a00; background:#fff2d8; font-size:11px; font-style:normal; font-weight:500; }
.rms-tag.is-neutral { color:#4b6b7a; background:#eef4f7; }
.rms-parts { display:grid; grid-template-columns:minmax(150px,190px) minmax(0,1fr); align-items:center; gap:14px; padding:12px 0; border-bottom:1px solid #edf1ee; }
.rms-part-list { display:flex; flex-wrap:wrap; align-items:center; gap:4px 16px; }
.rms-part-list label { display:flex; align-items:center; white-space:nowrap; }
.rms-part-list small { color:#85938b; font-size:11px; }
.rms-number { display:flex; align-items:center; gap:8px; color:#7a8880; font-size:12px; }
.rms-number :deep(.el-input-number) { width:92px; flex:0 0 auto; }
/* 号码范围一行需要放两个输入框，独占数值与提示两列，避免被挤成个位数宽度 */
.rms-row.is-range { grid-template-columns:minmax(150px,190px) minmax(0,1fr) auto; }
.rms-note { margin:14px 0 0; color:#647168; font-size:12px; line-height:1.65; }
@media (max-width:620px) { .rms-row,.rms-parts { grid-template-columns:1fr; gap:8px; } .rms-hint { display:none; } }
</style>