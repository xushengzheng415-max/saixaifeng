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
        <p class="rms-note">实名认证需活体检测并按次计费，开启前须已开通服务；人脸核验为静态照片与证件人像比对，不要求活体。保险在生成参赛证时校验，允许先报名后补交。</p>
      </article>
    </div>

    <aside class="rms-preview">
      <header class="rms-preview-head"><div><h4>球员端预览</h4><span>与小程序报名页一致的实时效果</span></div><em>实时</em></header>
      <div class="rms-page">
        <div class="rms-page-head">
          <strong>{{ divisionName || '当前组别' }} 报名</strong>
          <small>{{ registrationDeadline ? `报名截止 ${registrationDeadline}` : '报名截止待定' }}</small>
        </div>
        <section v-for="section in previewSections" :key="section.title" class="rms-page-card">
          <div class="rms-page-card-title"><i></i>{{ section.title }}</div>
          <ul class="rms-page-list">
            <li v-for="row in section.rows" :key="row.key" :class="row.tone">
              <span class="rms-page-label"><i v-if="row.required" class="rms-req">*</i>{{ row.label }}<small v-if="row.hint">{{ row.hint }}</small><small v-else-if="row.tone === 'is-optional'">选填</small></span>
              <span class="rms-page-field">
                <span v-if="row.control === 'input'" class="rms-ctl-input">{{ row.placeholder }}</span>
                <span v-else-if="row.control === 'number'" class="rms-ctl-input is-short">{{ row.placeholder }}</span>
                <span v-else-if="row.control === 'select'" class="rms-ctl-input">{{ row.placeholder }}</span>
                <span v-else-if="row.control === 'readonly'" class="rms-ctl-input is-readonly">{{ row.placeholder }}</span>
                <span v-else-if="row.control === 'photo'" class="rms-ctl-photo">＋<small>上传照片</small></span>
                <span v-else-if="row.control === 'idcard'" class="rms-ctl-faces"><span v-for="face in row.faces" :key="face" class="rms-ctl-photo">＋<small>{{ face }}</small></span></span>
                <span v-else-if="row.control === 'policy'" class="rms-ctl-policy"><span class="rms-ctl-upload">上传保单</span><span class="rms-ctl-link">或平台购买保险 ›</span></span>
                <span v-else-if="row.control === 'button'" class="rms-ctl-btn">{{ row.action }}</span>
              </span>
            </li>
          </ul>
        </section>
        <div v-if="previewSections.length === 0" class="rms-empty">本组别未要求提交任何材料</div>
        <div v-if="previewNotice" class="rms-page-notice">{{ previewNotice }}</div>
        <div class="rms-tip"><el-icon><WarningFilled /></el-icon><span>平台购买的保险自动核验免检；其他渠道保单需上传后由组委会审核。</span></div>
        <div class="rms-page-submit">提交报名</div>
        <div class="rms-footer">提交后仍可在「我的参赛资料」补交未完成项</div>
      </div>
    </aside>
  </section>
</template>

<script setup>
import { computed, watch } from 'vue'
import { WarningFilled } from '@element-plus/icons-vue'
import { ID_DOC_OPTIONS, ID_DOC_PARTS, MATERIAL_ITEMS, MATERIAL_OPTIONS } from '../../utils/registrationMaterials'

const props = defineProps({
  form: { type: Object, required: true },
  divisionName: { type: String, default: '' },
  registrationDeadline: { type: String, default: '' }
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
    if (value === 'required') return '活体检测·需开通'
    if (value === 'optional') return '选填，可后补'
    return '默认关闭'
  }
  if (key === 'faceCheck') {
    if (value === 'required') return '静态比对·不要求活体'
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

// 球员端报名页：基础信息恒定展示，材料项按配置出现，并按真实控件形态呈现。
const previewSections = computed(() => {
  const requirements = props.form.materialRequirements
  const state = key => requirements[key] || 'none'
  const requiredOf = key => state(key) === 'required'
  const toneOf = key => (state(key) === 'required' ? 'is-required' : state(key) === 'optional' ? 'is-optional' : 'is-fixed')
  const sections = []

  const profileRows = [
    { key: 'name', label: '姓名', control: 'input', placeholder: '与证件一致', required: true, tone: 'is-fixed' },
    { key: 'jerseyName', label: '球衣名', control: 'input', placeholder: '按姓名生成', tone: 'is-fixed' }
  ]
  if (state('jerseyNo') !== 'none') profileRows.push({ key: 'jerseyNo', label: '球衣号码', control: 'number', placeholder: `${props.form.jerseyNumberMin}–${props.form.jerseyNumberMax}`, hint: rangeInvalid.value ? '范围有误' : '按范围填写', required: requiredOf('jerseyNo'), tone: toneOf('jerseyNo') })
  profileRows.push({ key: 'position', label: '场上位置', control: 'select', placeholder: '选择位置', tone: 'is-fixed' })
  profileRows.push({ key: 'birthDate', label: '出生日期', control: 'readonly', placeholder: '由身份证读取', tone: 'is-fixed' })
  if (idDocsMode.value === 'number') profileRows.push({ key: 'idCard', label: '身份证号', control: 'input', placeholder: '18 位号码', hint: '报名填号核验', required: true, tone: 'is-required' })
  else if (idDocsMode.value === 'photos') profileRows.push({ key: 'idCard', label: '身份证号', control: 'input', placeholder: '选填', hint: '以照片留存为准', tone: 'is-optional' })
  profileRows.push({ key: 'phone', label: '联系电话', control: 'input', placeholder: '手机号', required: true, tone: 'is-fixed' })
  profileRows.push({ key: 'body', label: '身高 / 体重', control: 'input', placeholder: 'cm / kg', tone: 'is-fixed' })
  if (state('photo') !== 'none') profileRows.push({ key: 'photo', label: '标准形象照', control: 'photo', required: requiredOf('photo'), tone: toneOf('photo') })
  sections.push({ title: '球员信息', rows: profileRows })

  const verifyRows = []
  if (idDocsMode.value === 'photos') verifyRows.push({ key: 'idParts', label: '身份证照片', control: 'idcard', faces: idDocParts.filter(part => props.form.idDocParts[part.key]).map(part => part.label), required: true, tone: 'is-required' })
  if (state('realName') !== 'none') verifyRows.push({ key: 'realName', label: '实名认证', control: 'button', action: '去实名', hint: '报名时认证一次', required: requiredOf('realName'), tone: toneOf('realName') })
  if (state('faceCheck') !== 'none') verifyRows.push({ key: 'faceCheck', label: '人脸核验', control: 'button', action: '采集人脸', required: requiredOf('faceCheck'), tone: toneOf('faceCheck') })
  if (verifyRows.length) sections.push({ title: '身份核验', rows: verifyRows })

  const qualifyRows = []
  if (state('insurance') !== 'none') qualifyRows.push({ key: 'insurance', label: '意外保险', control: 'policy', required: requiredOf('insurance'), tone: toneOf('insurance') })
  if (state('waiver') !== 'none') qualifyRows.push({ key: 'waiver', label: '免责协议', control: 'button', action: '在线签署', hint: requiredOf('waiver') ? '报名时签署' : '', required: requiredOf('waiver'), tone: toneOf('waiver') })
  if (qualifyRows.length) sections.push({ title: '参赛资格', rows: qualifyRows })

  return sections.filter(section => section.rows.length)
})

const previewNotice = computed(() => {
  const notes = []
  if (props.form.singleDivisionOnly) notes.push('同一球员限报一个组别')
  if (!rangeInvalid.value && props.form.materialRequirements.jerseyNo !== 'none') notes.push(`球衣号码限 ${props.form.jerseyNumberMin}–${props.form.jerseyNumberMax} 号`)
  return notes.join(' · ')
})
</script>

<style scoped>
.rms-layout { display:grid; grid-template-columns:minmax(0,1fr) 420px; gap:20px; align-items:start; }
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
.rms-preview { position:sticky; top:12px; display:grid; gap:12px; padding:16px; border:1px solid #dbe7e0; border-radius:12px; background:#fff; }
.rms-preview-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
.rms-preview-head h4 { margin:0; color:#17231c; font-size:15px; }
.rms-preview-head span { display:block; margin-top:4px; color:#7b8880; font-size:12px; }
.rms-preview-head em { flex-shrink:0; padding:3px 8px; border-radius:20px; color:#087c43; background:#eaf7ee; font-size:11px; font-style:normal; }
/* 预览按小程序报名页还原：页面底色 + 白色分区卡片 + 右对齐控件 */
.rms-page { display:grid; gap:10px; padding:14px; border:1px solid #e5ece8; border-radius:12px; background:#f5f7f6; max-height:680px; overflow-y:auto; }
.rms-page-head { display:grid; gap:3px; padding:2px 2px 8px; }
.rms-page-head strong { color:#17231c; font-size:16px; }
.rms-page-head small { color:#8a978f; font-size:12px; }
.rms-page-card { padding:0 14px 4px; border-radius:10px; background:#fff; box-shadow:0 1px 2px rgba(23,35,28,.05); }
.rms-page-card-title { display:flex; align-items:center; gap:7px; padding:12px 0 8px; color:#1f3026; font-size:13px; font-weight:700; }
.rms-page-card-title i { width:3px; height:13px; border-radius:2px; background:#1f7a4d; }
.rms-page-list { margin:0; padding:0; list-style:none; }
.rms-page-list li { display:flex; align-items:center; justify-content:space-between; gap:10px; min-height:46px; padding:7px 0; border-bottom:1px solid #f1f4f2; }
.rms-page-list li:last-child { border-bottom:none; }
.rms-page-label { display:flex; align-items:baseline; gap:2px; min-width:0; color:#22312a; font-size:13px; }
.rms-page-label small { margin-left:6px; color:#9aa8a0; font-size:10px; }
.rms-page-field { display:flex; align-items:center; justify-content:flex-end; min-width:0; }
.rms-req { flex-shrink:0; color:#d9534f; font-style:normal; }
.rms-ctl-input { box-sizing:border-box; width:168px; height:32px; display:flex; align-items:center; justify-content:flex-end; padding:0 10px; border-radius:8px; color:#a3b0a8; background:#f5f8f6; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rms-ctl-input.is-short { width:88px; }
.rms-ctl-input.is-readonly { border:1px dashed #d9e2dc; background:#f7f9f8; color:#9aa8a0; }
.rms-ctl-photo { box-sizing:border-box; width:76px; height:76px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; border:1px dashed #bfd3c6; border-radius:8px; color:#7d9a8b; background:#f8fbf9; font-size:16px; }
.rms-ctl-photo small { color:#8fa79a; font-size:10px; }
.rms-ctl-faces { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; }
.rms-ctl-policy { display:flex; flex-direction:column; align-items:flex-end; gap:5px; }
.rms-ctl-upload { padding:6px 12px; border:1px dashed #bfd3c6; border-radius:8px; color:#5d7d6c; background:#f8fbf9; font-size:11px; white-space:nowrap; }
.rms-ctl-link { color:#0b6b3a; font-size:11px; }
.rms-ctl-btn { flex-shrink:0; padding:7px 16px; border-radius:16px; color:#0b6b3a; background:#eaf6ef; font-size:12px; font-weight:600; white-space:nowrap; }
.rms-empty { padding:14px 0; color:#85938b; font-size:12px; text-align:center; }
.rms-page-notice { padding:8px 10px; border-radius:8px; color:#3d5a4b; background:#eef5f0; font-size:11px; line-height:1.5; }
.rms-tip { display:flex; align-items:flex-start; gap:7px; padding:9px 10px; border-radius:8px; color:#8a6a1f; background:#fff8e8; font-size:11px; line-height:1.5; }
.rms-page-submit { padding:11px; border-radius:8px; color:#fff; background:#1f7a4d; font-size:14px; font-weight:600; text-align:center; }
.rms-footer { color:#85938b; font-size:10px; text-align:center; }
@media (max-width:1180px) { .rms-layout { grid-template-columns:1fr; } .rms-preview { position:static; max-width:460px; margin:0 auto; width:100%; } }
@media (max-width:620px) { .rms-row,.rms-parts { grid-template-columns:1fr; gap:8px; } .rms-hint { display:none; } }
</style>
