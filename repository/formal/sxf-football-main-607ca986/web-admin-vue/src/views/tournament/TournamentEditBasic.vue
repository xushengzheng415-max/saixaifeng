<template>
  <section class="edit-page">
    <div class="toolbar">
      <el-button link @click="router.push('/tournaments/' + id)">← 返回赛事详情</el-button>
      <el-button v-if="canCompetition" plain @click="router.push('/tournaments/' + id + '/competition')">竞赛管理</el-button>
    </div>
    <h1>赛事资料</h1>
    <el-form ref="formRef" v-loading="loading" :model="form" :rules="rules" label-position="top" class="edit-form">
      <section v-if="canCompetition" class="regulation-first">
        <div class="section-title"><h2>竞赛规程</h2><span>优先上传</span></div>
        <p v-if="canCompetition" class="recognition-tip">上传后可生成竞赛规则草稿。</p>
        <div class="regulations">
          <div v-if="form.regulationsFileId" class="file-row"><el-icon><Document /></el-icon><span>{{ form.regulationsFileName || '竞赛规程' }}</span><el-button link type="primary" @click="viewRegulations">查看</el-button><el-button link type="danger" @click="removeRegulations">移除</el-button></div>
          <el-upload ref="regulationsUploadRef" :show-file-list="false" :before-upload="beforeRegulationsUpload" :http-request="handleRegulationsUpload" accept=".pdf,.docx"><el-button :loading="uploadingRegulations">{{ uploadingRegulations ? '上传中' : '上传规程' }}</el-button></el-upload>
          <el-button v-if="canCompetition && form.regulationsFileId" type="primary" plain :loading="recognizing" @click="recognizeRegulations">{{ recognizing ? '识别中' : '识别并生成' }}</el-button>
          <small>支持 PDF、Word（.docx），最大 10MB</small>
        </div>
      </section>
      <section>
        <h2>基本信息</h2>
        <div class="identity-grid">
          <el-form-item class="logo-item" label="赛事 Logo">
            <div class="logo-field">
              <div class="logo"><img v-if="form.logo" :src="form.logo" alt="赛事 Logo" /><span v-else>暂无 Logo</span></div>
              <el-upload :show-file-list="false" :before-upload="beforeLogoUpload" :http-request="handleLogoUpload" accept="image/*"><el-button :loading="uploadingLogo">{{ uploadingLogo ? '上传中' : '上传 Logo' }}</el-button></el-upload>
            </div>
          </el-form-item>
          <el-form-item label="赛事名称" prop="name" required><el-input v-model="form.name" maxlength="50" show-word-limit /></el-form-item>
          <el-form-item label="赛事简称"><el-input v-model="form.shortName" maxlength="20" /></el-form-item>
        </div>
        <div class="grid compact-grid">
          <el-form-item label="赛事类别" prop="category" required><el-select v-model="form.category"><el-option label="青少年足球赛事" value="youth" /><el-option label="成人足球赛事" value="adult" /><el-option label="校园足球赛事" value="campus" /></el-select></el-form-item>
          <el-form-item label="比赛地点" prop="regionPath" required>
            <el-cascader v-model="form.regionPath" :options="regionOptions" :props="{ emitPath: true }" filterable clearable placeholder="请选择省、市、区县" />
          </el-form-item>
        </div>
      </section>
      <section>
        <h2>举办信息</h2>
        <div class="grid compact-grid">
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
      <footer><el-button @click="router.push('/tournaments/' + id)">取消</el-button><el-button type="primary" :loading="submitting" @click="handleSubmit">保存修改</el-button></footer>
    </el-form>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document } from '@element-plus/icons-vue'
import { addRecord, callFunction, getFileUrl, queryById, queryList, updateRecord, uploadLargeFileViaCloud } from '../../utils/cloud'
import { cityMapData, districtMapData, provincesData } from '../team/areaData'
import CommercialPartnersEditor from '../../components/tournament/CommercialPartnersEditor.vue'
import { commercialCategoriesFrom, commercialPayload } from '../../utils/commercialPartners'
import { normalizeRecognizedGender, recognizedDivisionRulePayload } from '../../utils/regulationRecognition'

const route = useRoute()
const router = useRouter()
const id = route.params.id
const staffRights = (() => { try { return JSON.parse(sessionStorage.getItem('sxfStaffPermissions') || '[]') } catch { return [] } })()
const canCompetition = sessionStorage.getItem('sxfTournamentStaff') !== '1' || staffRights.includes('event.competition')
const formRef = ref(null)
const regulationsUploadRef = ref(null)
const loading = ref(true)
const submitting = ref(false)
const uploadingLogo = ref(false)
const uploadingRegulations = ref(false)
const recognizing = ref(false)
const provinceAllValue = code => code + ':all'
const cityAllValue = code => code + ':all'
const regionOptions = provincesData.map(province => ({
  value: province.code,
  label: province.name,
  children: [
    { value: provinceAllValue(province.code), label: '全省' },
    ...(cityMapData[province.code] || []).map(city => ({
      value: city.code,
      label: city.name,
      children: [
        { value: cityAllValue(city.code), label: '全市' },
        ...(districtMapData[city.code] || []).map(district => ({ value: district.code, label: district.name }))
      ]
    }))
  ]
}))
const form = ref({
  name: '', shortName: '', category: 'youth', regionPath: [], commercialCategories: commercialCategoriesFrom(), dateRange: [], deadline: '',
  organizers: [''], undertakers: [''], coOrganizers: [''], contactName: '', contactPhone: '', logo: '', logoFileId: '',
  regulationsFileId: '', regulationsUrl: '', regulationsFileName: ''
})
const rules = {
  name: [{ required: true, message: '请输入赛事名称', trigger: 'blur' }],
  category: [{ required: true, message: '请选择赛事类别', trigger: 'change' }],
  regionPath: [{ type: 'array', required: true, min: 2, message: '请选择比赛地点', trigger: 'change' }],
  dateRange: [{ type: 'array', required: true, min: 2, message: '请选择赛事日期', trigger: 'change' }],
  contactName: [{ required: true, message: '请输入赛事联系人', trigger: 'blur' }],
  contactPhone: [{ required: true, message: '请输入联系电话', trigger: 'blur' }]
}

async function loadTournament() {
  loading.value = true
  try {
    const data = await queryById('tournaments', id)
    if (!data) throw new Error('赛事不存在')
    form.value = {
      name: data.name || '', shortName: data.shortName || '', category: data.category || 'youth',
      regionPath: resolveRegionPath(data), commercialCategories: commercialCategoriesFrom(data),
      dateRange: data.startDate && data.endDate ? [data.startDate, data.endDate] : [], deadline: data.deadline || '',
      organizers: organizationList(data.organizers || data.organizerName || data.organizer || data.organizationStructure?.organizers || data.organizationStructure?.organizerName),
      undertakers: organizationList(data.undertakers || data.undertakerName || data.undertaker || data.organizationStructure?.undertakers || data.organizationStructure?.undertakerName),
      coOrganizers: organizationList(data.coOrganizers || data.coOrganizerName || data.coOrganizer || data.organizationStructure?.coOrganizers || data.organizationStructure?.coOrganizerName),
      contactName: data.contactName || data.contact || '',
      contactPhone: data.contactPhone || data.phone || '', logo: data.logo || data.logoUrl || data.logoTransparentUrl || '',
      logoFileId: data.logoFileId || data.logoTransparentFileId || '',
      regulationsFileId: data.regulationsFileId || '', regulationsUrl: data.regulationsUrl || '',
      regulationsFileName: data.regulationsFileName || ''
    }
  } catch (error) {
    ElMessage.error('加载失败：' + (error.message || '请稍后重试'))
  } finally {
    loading.value = false
  }
}

function organizationList(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[、,，;；\n]/)
  const normalized = values.map(item => String(item || '').trim()).filter(Boolean)
  return normalized.length ? normalized : ['']
}

function addOrganization(field) {
  form.value[field].push('')
}

function removeOrganization(field, index) {
  form.value[field].splice(index, 1)
  if (!form.value[field].length) form.value[field].push('')
}

function findByName(items, text) {
  const source = String(text || '')
  return (items || []).find(item => source.includes(item.name))
}

function resolveRegionPath(data) {
  const text = [data.region, data.province, data.city, data.district, data.location].filter(Boolean).join(' ')
  const province = provincesData.find(item => item.code === data.provinceCode) || findByName(provincesData, text)
  if (!province) return []
  const cities = cityMapData[province.code] || []
  const city = cities.find(item => item.code === data.cityCode) || findByName(cities, text)
  if (!city || data.regionScope === 'province') return [province.code, provinceAllValue(province.code)]
  const districts = districtMapData[city.code] || []
  const district = districts.find(item => item.code === data.districtCode) || findByName(districts, text)
  if (!district || data.regionScope === 'city') return [province.code, city.code, cityAllValue(city.code)]
  return [province.code, city.code, district.code]
}

function selectedRegion() {
  const path = form.value.regionPath || []
  const province = provincesData.find(item => item.code === path[0])
  const city = (cityMapData[path[0]] || []).find(item => item.code === path[1])
  const district = city ? (districtMapData[city.code] || []).find(item => item.code === path[2]) : null
  if (!province) return { provinceCode: '', province: '', cityCode: '', city: '', districtCode: '', district: '', regionScope: '', region: '' }
  if (!city) return { provinceCode: province.code, province: province.name, cityCode: '', city: province.name, districtCode: '', district: '', regionScope: 'province', region: province.name + '（全省）' }
  if (!district) return { provinceCode: province.code, province: province.name, cityCode: city.code, city: city.name, districtCode: '', district: '', regionScope: 'city', region: province.name + ' ' + city.name + '（全市）' }
  return { provinceCode: province.code, province: province.name, cityCode: city.code, city: city.name, districtCode: district.code, district: district.name, regionScope: 'district', region: province.name + ' ' + city.name + ' ' + district.name }
}

function beforeLogoUpload(file) {
  if (!file.type.startsWith('image/')) { ElMessage.error('请选择图片文件'); return false }
  if (file.size > 20 * 1024 * 1024) { ElMessage.error('原始图片不能超过 20MB'); return false }
  return true
}
async function compressLogo(file) {
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise((resolve, reject) => { const target = new Image(); target.onload = () => resolve(target); target.onerror = () => reject(new Error('图片读取失败')); target.src = url })
    const scale = Math.min(640 / image.width, 640 / image.height, 1)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale))
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
    let quality = 0.82
    let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality))
    while (blob && blob.size > 180 * 1024 && quality > 0.4) { quality -= 0.08; blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality)) }
    if (!blob) throw new Error('图片压缩失败')
    return new File([blob], 'tournament-logo.webp', { type: 'image/webp', lastModified: Date.now() })
  } finally { URL.revokeObjectURL(url) }
}
async function handleLogoUpload(options) {
  uploadingLogo.value = true
  try {
    const file = await compressLogo(options.file)
    const result = await uploadLargeFileViaCloud('tournament-logos/' + Date.now() + '.webp', file, { chunkSize: 32 * 1024 })
    form.value.logoFileId = result.fileId || ''; form.value.logo = result.tempUrl || await getFileUrl(result.fileId)
    formRef.value?.clearValidate('logo'); ElMessage.success('赛事 Logo 已上传')
  } catch (error) { ElMessage.error('Logo 上传失败：' + (error.message || '请重试')) } finally { uploadingLogo.value = false }
}
function beforeRegulationsUpload(file) {
  if (!/\.(pdf|docx)$/i.test(file.name)) { ElMessage.error('自动识别仅支持 PDF、Word（.docx）'); return false }
  if (file.size > 10 * 1024 * 1024) { ElMessage.error('竞赛规程不能超过 10MB'); return false }
  return true
}
async function handleRegulationsUpload(options) {
  uploadingRegulations.value = true
  try {
    const file = options.file
    const result = await uploadLargeFileViaCloud('tournament-regulations/' + Date.now() + '-' + file.name, file, { chunkSize: 32 * 1024 })
    form.value.regulationsFileId = result.fileId || ''; form.value.regulationsUrl = result.tempUrl || ''; form.value.regulationsFileName = file.name
    await updateRecord('tournaments', id, {
      regulationsFileId: form.value.regulationsFileId,
      regulationsUrl: form.value.regulationsUrl,
      regulationsFileName: form.value.regulationsFileName
    })
    ElMessage.success('竞赛规程已上传')
    if (canCompetition) await recognizeRegulations()
  } catch (error) { ElMessage.error('规程上传失败：' + (error.message || '请重试')) } finally { uploadingRegulations.value = false }
}

async function recognizeRegulations() {
  if (!form.value.regulationsFileId || recognizing.value) return
  recognizing.value = true
  try {
    const extension = String(form.value.regulationsFileName || '').split('.').pop().toLowerCase()
    const result = await callFunction('parseTournamentRegulations', {
      action: 'parseStoredFile',
      tournamentId: id,
      fileID: form.value.regulationsFileId,
      fileName: form.value.regulationsFileName,
      fileType: extension === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }, 300000)
    if (!result?.success) throw new Error(result?.message || result?.error || '识别失败')
    const data = result.data || {}
    const divisions = Array.isArray(data.divisions) ? data.divisions.filter(item => String(item?.name || '').trim()) : []
    const organizations = data.organizationStructure || {}
    const organizationCount = ['organizers', 'undertakers', 'coOrganizers'].reduce((total, key) => total + (Array.isArray(organizations[key]) ? organizations[key].length : 0), 0)
    try {
      await ElMessageBox.confirm(
        '识别到赛事资料、' + organizationCount + ' 个组织单位和 ' + divisions.length + ' 个竞赛组别。确认后将保存赛事资料并新增缺失的规则草稿。',
        '确认识别结果',
        { confirmButtonText: '确认生成', cancelButtonText: '先不生成', type: 'info' }
      )
    } catch {
      return
    }
    await applyRecognition(data, divisions)
  } catch (error) {
    ElMessage.error('规程识别失败：' + (error.message || '请手动填写'))
  } finally {
    recognizing.value = false
  }
}

function recognizedMatchFormat(value) {
  const normalized = String(value || '').toLowerCase().replace(/人制$/, 'side')
  return ['5side', '7side', '8side', '9side', '11side'].includes(normalized) ? normalized : '7side'
}

async function applyRecognition(data, divisions) {
  const basic = data.basicInfo || {}
  const organizations = data.organizationStructure || {}
  if (basic.name) form.value.name = String(basic.name)
  if (['youth', 'adult', 'campus'].includes(basic.category)) form.value.category = basic.category
  if (basic.startDate && basic.endDate) form.value.dateRange = [basic.startDate, basic.endDate]
  if (basic.deadline) form.value.deadline = basic.deadline
  const recognizedPath = resolveRegionPath(basic)
  if (recognizedPath.length) form.value.regionPath = recognizedPath
  const recognizedOrganizers = organizationList(organizations.organizers)
  if (recognizedOrganizers[0]) form.value.organizers = recognizedOrganizers
  form.value.undertakers = organizationList(organizations.undertakers)
  form.value.coOrganizers = organizationList(organizations.coOrganizers)

  const organizers = form.value.organizers.map(item => item.trim()).filter(Boolean)
  const undertakers = form.value.undertakers.map(item => item.trim()).filter(Boolean)
  const coOrganizers = form.value.coOrganizers.map(item => item.trim()).filter(Boolean)
  const commercial = commercialPayload(form.value.commercialCategories)
  const region = selectedRegion()
  await updateRecord('tournaments', id, {
    name: form.value.name.trim(),
    category: form.value.category,
    ...region,
    location: region.region,
    startDate: form.value.dateRange?.[0] || '',
    endDate: form.value.dateRange?.[1] || '',
    deadline: form.value.deadline || '',
    ...commercial,
    organizers,
    organizerName: organizers.join('、'),
    undertakers,
    coOrganizers,
    undertakerName: undertakers.join('、'),
    coOrganizerName: coOrganizers.join('、'),
    organizationStructure: { organizers, organizerName: organizers.join('、'), undertakers, coOrganizers },
    regulationRecognitionData: { sharedRegulationDetails: data.sharedRegulationDetails || {}, divisions },
    regulationRecognitionStatus: 'draft_generated',
    regulationRecognizedAt: new Date()
  })

  const existing = await queryList('divisions', { where: { tournamentId: id }, limit: 100, silent: true })
  const names = new Set(existing.map(item => String(item.name || item.divisionName || '').trim().toLowerCase()))
  const existingByName = new Map(existing.map(item => [String(item.name || item.divisionName || '').trim().toLowerCase(), item]))
  const sharedDetails = data.sharedRegulationDetails || {}
  let created = 0
  let updated = 0
  let locked = 0
  for (const source of divisions) {
    const name = String(source.name || '').trim()
    if (!name) continue
    const recognizedRules = recognizedDivisionRulePayload(source, sharedDetails)
    const current = existingByName.get(name.toLowerCase())
    if (current) {
      const ruleStatus = String(current.ruleStatus || current.status || '').toLowerCase()
      if (current.rulesLocked === true || current.ruleFinalized === true || ['finalized', 'locked', 'published'].includes(ruleStatus)) {
        locked += 1
        continue
      }
      await updateRecord('divisions', current._id || current.id, {
        ...recognizedRules,
        mode: current.mode || (current.isProfessional ? 'professional' : 'simple'),
        isProfessional: current.isProfessional === true || current.mode === 'professional',
        ruleProgress: Number(current.ruleProgress || 0),
        regulationSourceFileId: form.value.regulationsFileId,
        regulationRecognition: true,
        regulationRecognizedAt: new Date(),
        updateTime: new Date()
      })
      updated += 1
      continue
    }
    const matchFormat = recognizedMatchFormat(source.matchFormat)
    const playersOnField = Number(matchFormat.replace('side', ''))
    const maxPlayersMap = { '5side': 25, '7side': 35, '8side': 40, '9side': 45, '11side': 50 }
    await addRecord('divisions', {
      tournamentId: id,
      name,
      customName: name,
      nameSource: 'custom',
      ageGroup: String(source.ageGroup || 'open'),
      gender: normalizeRecognizedGender(source.gender),
      matchFormat,
      playersOnField,
      maxPlayersPerTeam: maxPlayersMap[matchFormat],
      expectedTeams: Math.max(2, Number(source.expectedTeams || 8)),
      displayOrder: existing.length + created + 1,
      mode: 'simple',
      isProfessional: false,
      ruleStatus: 'draft',
      ruleProgress: 0,
      rulesVersion: '暂未定版',
      formatType: ['cup', 'tournament', 'league', 'hybrid'].includes(source.formatType) ? source.formatType : 'cup',
      groupCount: Number(source.groupCount || 0),
      teamsPerGroup: Number(source.teamsPerGroup || 0),
      groupCycle: source.groupCycle === 'double' ? 'double' : 'single',
      advancePerGroup: Number(source.advancePerGroup || 0),
      knockoutSize: Number(source.knockoutSize || 0),
      periodMode: source.periodMode === 'quarters' ? 'single' : 'halves',
      matchMinutes: Number(source.matchMinutes || 0),
      breakMinutes: Number(source.breakMinutes || 0),
      substitutionLimit: Number(source.substitutionLimit || 0),
      substitutionReentryAllowed: source.substitutionReentryAllowed === true,
      yellowCardSuspension: Number(source.yellowCardSuspension || 0),
      redCardSuspension: Number(source.redCardSuspension || 0),
      winPoints: Number(source.winPoints ?? 3),
      drawPoints: Number(source.drawPoints ?? 1),
      lossPoints: Number(source.lossPoints ?? 0),
      ...recognizedRules,
      regulationSourceFileId: form.value.regulationsFileId,
      regulationRecognition: true,
      regulationRecognizedAt: new Date(),
      createTime: new Date(),
      updateTime: new Date()
    })
    names.add(name.toLowerCase())
    created += 1
  }
  ElMessage.success(`规程识别已完成：更新 ${updated} 个、新增 ${created} 个组别草稿${locked ? `，跳过 ${locked} 个已定版组别` : ''}`)
}
async function viewRegulations() {
  const preview = window.open('', '_blank')
  try {
    const url = form.value.regulationsUrl || await getFileUrl(form.value.regulationsFileId)
    if (!url) throw new Error('未获取到文件地址')
    form.value.regulationsUrl = url
    if (preview) { preview.opener = null; preview.location.href = url } else { window.location.href = url }
  } catch (error) { if (preview) preview.close(); ElMessage.error('规程打开失败：' + (error.message || '请重试')) }
}
function removeRegulations() {
  form.value.regulationsFileId = ''; form.value.regulationsUrl = ''; form.value.regulationsFileName = ''
  regulationsUploadRef.value?.clearFiles(); ElMessage.success('已移除，保存后生效')
}
async function handleSubmit() {
  try { await formRef.value.validate() } catch { return }
  submitting.value = true
  try {
    const dates = form.value.dateRange || []
    const region = selectedRegion()
    const organizers = form.value.organizers.map(item => item.trim()).filter(Boolean)
    const undertakers = form.value.undertakers.map(item => item.trim()).filter(Boolean)
    const coOrganizers = form.value.coOrganizers.map(item => item.trim()).filter(Boolean)
    const commercial = commercialPayload(form.value.commercialCategories)
    await updateRecord('tournaments', id, {
      name: form.value.name.trim(), shortName: form.value.shortName.trim(), category: form.value.category,
      ...region, location: region.region, ...commercial,
      startDate: dates[0] || '', endDate: dates[1] || '', deadline: form.value.deadline || '',
      organizers, organizerName: organizers.join('、'), undertakers, coOrganizers,
      undertakerName: undertakers.join('、'), coOrganizerName: coOrganizers.join('、'),
      organizationStructure: {
        organizers,
        organizerName: organizers.join('、'),
        undertakers,
        coOrganizers
      },
      contactName: form.value.contactName.trim(), contactPhone: form.value.contactPhone.trim(),
      logo: form.value.logo, logoFileId: form.value.logoFileId,
      ...(canCompetition ? { regulationsFileId: form.value.regulationsFileId, regulationsUrl: form.value.regulationsUrl,
        regulationsFileName: form.value.regulationsFileName } : {})
    })
    ElMessage.success('赛事资料已保存'); router.push('/tournaments/' + id)
  } catch (error) { ElMessage.error('保存失败：' + (error.message || '请稍后重试')) } finally { submitting.value = false }
}
onMounted(loadTournament)
</script>

<style scoped>
.edit-page{width:min(calc(100% - 48px),920px);margin:0 auto;padding:18px 0 72px}
.toolbar{display:flex;align-items:center;justify-content:space-between}
.edit-page>h1{margin:16px 0 12px;color:#18231d;font-size:26px}
.edit-form{overflow:hidden;border:1px solid #dfe5e1;border-radius:8px;background:#fff;box-shadow:0 3px 12px rgba(16,52,32,.05)}
.edit-form>section{padding:22px 26px 6px}
.edit-form>section+section{border-top:1px solid #e7ebe8}
.edit-form h2{margin:0 0 18px;color:#213229;font-size:17px}
.identity-grid{display:grid;grid-template-columns:138px minmax(0,1fr);gap:0 24px;max-width:720px}
.logo-item{grid-row:1/3}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 24px}
.compact-grid{max-width:740px}
.wide{grid-column:1/-1}
.edit-form :deep(.el-input__wrapper),.edit-form :deep(.el-select__wrapper),.edit-form :deep(.el-date-editor){min-height:40px}
.edit-form :deep(.el-select),.edit-form :deep(.el-date-editor),.edit-form :deep(.el-cascader){width:100%}
.logo-field{display:flex;align-items:flex-start;flex-direction:column;gap:10px}
.logo{display:grid;width:112px;height:112px;place-items:center;overflow:hidden;border:1px dashed #ccd5cf;color:#8a958e;font-size:12px}
.logo img{width:100%;height:100%;object-fit:contain}
.regulations{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.regulation-first{background:#fbfdfb}
.recognition-tip{margin:-7px 0 15px;color:#627168;font-size:13px}
.org-rows{display:grid;width:100%;gap:8px}
.org-rows>div{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px}
.file-row{display:flex;min-width:min(100%,420px);align-items:center;gap:8px;padding:8px 11px;border:1px solid #e0e6e2;background:#f8faf9}
.file-row span{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.regulations small{color:#77837c}
.section-title{display:flex;align-items:center;gap:9px}
.section-title span{margin-bottom:18px;padding:2px 7px;border-radius:4px;color:#69766f;background:#f0f3f1;font-size:12px}
.edit-form footer{display:flex;justify-content:flex-end;gap:12px;padding:16px 26px;border-top:1px solid #e2e7e4;background:#fafbfa}
.edit-form footer :deep(.el-button){min-width:108px}
@media(max-width:760px){.edit-page{width:calc(100% - 24px)}.identity-grid,.grid{grid-template-columns:1fr}.logo-item{grid-row:auto}.compact-grid{max-width:none}.wide{grid-column:auto}.edit-form>section{padding-right:18px;padding-left:18px}}
.custom-partners{display:flex;flex-direction:column;gap:8px}.custom-partners>div{display:grid;grid-template-columns:160px minmax(0,1fr) auto;gap:8px}
.organization-fields{display:flex;max-width:700px;flex-direction:column}.organization-input{width:620px;max-width:100%}.organization-fields .org-rows{width:680px;max-width:100%}.organization-fields .org-rows>div{display:grid;grid-template-columns:minmax(0,620px) 52px;align-items:center;gap:8px}@media(max-width:760px){.organization-input,.organization-fields .org-rows{width:100%}.organization-fields .org-rows>div{grid-template-columns:minmax(0,1fr) 52px}}
</style>
