<template>
  <section class="registration-importer">
    <header class="import-toolbar">
      <div>
        <strong>上传球队报名表</strong>
        <span>可同时选择多份 Word；一份文件创建一支球队。</span>
      </div>
      <div class="import-toolbar-actions">
        <el-button @click="downloadTemplate"><el-icon><Download /></el-icon>下载报名表模板</el-button>
        <el-upload accept=".docx" multiple :auto-upload="false" :show-file-list="false" :on-change="handleDocxChange">
          <el-button type="success" plain :loading="parsingCount > 0">
            <el-icon><UploadFilled /></el-icon>{{ parsingCount > 0 ? `解析中 ${parsingCount}` : '选择报名表' }}
          </el-button>
        </el-upload>
      </div>
    </header>

    <el-alert
      type="success"
      :closable="false"
      title="自动读取球队、工作人员、球员、队徽和照片；导入时自动做人像分割。"
    />

    <div v-if="!teams.length && !parsingCount" class="import-empty">
      <el-icon><DocumentAdd /></el-icon>
      <strong>请选择球队报名表</strong>
      <span>支持 .docx，单份不超过 20MB</span>
    </div>

    <div v-else class="import-team-list">
      <article v-for="(team, teamIndex) in teams" :key="team.clientKey" class="import-team" :class="{ invalid: teamHasErrors(team) }">
        <header>
          <button type="button" class="expand-button" @click="team.expanded = !team.expanded">
            <el-icon><ArrowDown v-if="team.expanded" /><ArrowRight v-else /></el-icon>
          </button>
          <el-upload accept="image/jpeg,image/png,image/webp" :auto-upload="false" :show-file-list="false" :on-change="file => replaceLogo(file, team)">
            <button type="button" class="team-logo-button">
              <img v-if="team.logoPreviewUrl" :src="team.logoPreviewUrl" alt="队徽" />
              <span v-else>上传队徽</span>
            </button>
          </el-upload>
          <div class="team-heading">
            <strong>{{ team.teamName || `待识别球队 ${teamIndex + 1}` }}</strong>
            <span>{{ team.sourceFileName }} · {{ team.players.length }} 名球员 · {{ team.staff.length }} 名工作人员</span>
          </div>
          <el-tag v-if="team.importError" type="danger">导入失败</el-tag>
          <el-tag v-else-if="teamHasErrors(team)" type="danger">需修正</el-tag>
          <el-tag v-else-if="team.processing" type="warning">{{ team.progressText || '处理中' }}</el-tag>
          <el-tag v-else type="success" effect="plain">报名表解析成功</el-tag>
          <el-button link type="danger" :disabled="team.processing || importing" @click="removeTeam(teamIndex)"><el-icon><Delete /></el-icon>移除</el-button>
        </header>

        <div v-if="team.expanded" class="team-detail">
          <div class="team-fields">
            <label><span>球队名称</span><el-input v-model="team.teamName" maxlength="50" /></label>
            <label><span>领队</span><el-input v-model="team.contactName" maxlength="30" /></label>
            <label><span>领队手机号</span><el-input v-model="team.contactPhone" maxlength="11" inputmode="numeric" @input="syncLeaderPhone(team)" /></label>
            <label><span>主教练手机号 <small>填写后也可认领</small></span><el-input v-model="headCoach(team).phone" maxlength="11" inputmode="numeric" placeholder="选填" /></label>
          </div>

          <section v-if="hasImportedKitColors(team)" class="registration-kit-preview">
            <strong>比赛服</strong>
            <div v-for="set in kitPreviewSets" :key="set.key">
              <b>{{ set.label }}</b>
              <span v-for="equipment in kitPreviewEquipment" :key="equipment.key">
                <i :style="{ backgroundColor: team.kitColors?.[set.key]?.[equipment.key] || '#D9E0DC' }"></i>
                {{ equipment.label }}{{ team.kitColorLabels?.[set.key]?.[equipment.key] || '未识别' }}
              </span>
            </div>
          </section>

          <section class="staff-section">
            <header><strong>工作人员资料</strong><span>身份证信息、年龄、籍贯和照片状态已自动识别。</span></header>
            <div class="staff-table-wrap">
              <table>
                <thead><tr><th>照片</th><th>姓名</th><th>职务</th><th>出生日期</th><th>年龄</th><th>籍贯</th><th>球衣英文</th><th>身份证</th><th>号码</th><th>手机号</th><th>照片状态</th></tr></thead>
                <tbody>
                  <tr v-for="(person, personIndex) in team.staff" :key="`${team.clientKey}-staff-${personIndex}`" :class="{ invalid: person.error }">
                    <td><PersonPhotoUpload :person="person" @change="file => replacePersonPhoto(file, person)" /></td>
                    <td><el-input v-model="person.name" maxlength="30" /></td>
                    <td>
                      <span>{{ person.roleLabel || '工作人员' }}</span>
                      <el-tag v-if="person.dualRoleType" type="warning" effect="plain" size="small" class="dual-role-tag">兼球员</el-tag>
                    </td>
                    <td>{{ person.birthDate || '待补充' }}</td>
                    <td>{{ ageFromBirth(person.birthDate) }}</td>
                    <td><span class="native-place" :title="person.nativePlace">{{ person.nativePlace || '地区码待核验' }}</span></td>
                    <td><el-input v-if="person.jerseyNumber" v-model="person.jerseyName" maxlength="32" /><span v-else>—</span></td>
                    <td><span class="identity-mask">{{ maskRegistrationIdentity(person.identityNumber) }}</span></td>
                    <td><el-input v-if="person.jerseyNumber" v-model="person.jerseyNumber" maxlength="3" inputmode="numeric" /><span v-else>—</span></td>
                    <td>{{ person.phone ? maskPhone(person.phone) : '—' }}</td>
                    <td>
                      <el-tag v-if="person.error" type="danger" size="small">{{ person.error }}</el-tag>
                      <el-tag v-else-if="person.photoProcessingStatus === 'processing'" type="warning" size="small">{{ person.photoProgressText || '处理中' }}</el-tag>
                      <el-tag v-else-if="person.photoProcessingStatus === 'processed'" type="success" effect="plain" size="small">已处理</el-tag>
                      <el-tag v-else-if="person.photoProcessingStatus === 'fallback_original'" type="warning" effect="plain" size="small">已保留原图</el-tag>
                      <el-tag v-else-if="person.photoProcessingStatus === 'failed'" type="danger" size="small">处理失败</el-tag>
                      <el-tag v-else-if="person.photoFile" type="info" effect="plain" size="small">待处理</el-tag>
                      <el-tag v-else type="warning" effect="plain" size="small">缺照片</el-tag>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="player-section">
            <header><strong>球员资料</strong><span>出生日期、年龄、籍贯和球衣简称已自动生成。</span></header>
            <div class="player-table-wrap">
              <table>
                <thead><tr><th>照片</th><th>姓名</th><th>出生日期</th><th>年龄</th><th>籍贯</th><th>球衣英文</th><th>身份证</th><th>号码</th><th>照片状态</th></tr></thead>
                <tbody>
                  <tr v-for="(player, playerIndex) in team.players" :key="`${team.clientKey}-player-${playerIndex}`" :class="{ invalid: player.error }">
                    <td><PersonPhotoUpload :person="player" @change="file => replacePersonPhoto(file, player)" /></td>
                    <td><el-input v-model="player.name" maxlength="30" /><el-tag v-if="player.dualRoleType" type="warning" effect="plain" size="small" class="dual-role-tag">{{ player.dualRolePlayerLabel || '兼工作人员' }}</el-tag></td>
                    <td>{{ player.birthDate || '待补充' }}</td>
                    <td>{{ ageFromBirth(player.birthDate) }}</td>
                    <td><span class="native-place" :title="player.nativePlace">{{ player.nativePlace || '地区码待核验' }}</span></td>
                    <td><el-input v-model="player.jerseyName" maxlength="32" /></td>
                    <td><span class="identity-mask">{{ maskRegistrationIdentity(player.identityNumber) }}</span></td>
                    <td><el-input v-model="player.jerseyNumber" maxlength="3" inputmode="numeric" /></td>
                    <td>
                      <el-tag v-if="player.error" type="danger" size="small">{{ player.error }}</el-tag>
                      <el-tag v-else-if="player.photoProcessingStatus === 'processing'" type="warning" size="small">{{ player.photoProgressText || '处理中' }}</el-tag>
                      <el-tag v-else-if="player.photoProcessingStatus === 'processed'" type="success" effect="plain" size="small">已处理</el-tag>
                      <el-tag v-else-if="player.photoProcessingStatus === 'fallback_original'" type="warning" effect="plain" size="small">已保留原图</el-tag>
                      <el-tag v-else-if="player.photoProcessingStatus === 'failed'" type="danger" size="small">处理失败</el-tag>
                      <el-tag v-else-if="player.photoFile" type="info" effect="plain" size="small">待处理</el-tag>
                      <el-tag v-else type="warning" effect="plain" size="small">缺照片</el-tag>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <div v-if="team.errors.length || team.warnings.length || team.importError" class="team-messages">
            <p v-if="team.importError" class="error">{{ team.importError }}</p>
            <p v-for="item in currentTeamErrors(team)" :key="`error-${item}`" class="error">{{ item }}</p>
            <p v-for="item in team.warnings" :key="`warning-${item}`">{{ item }}</p>
          </div>
        </div>
      </article>
    </div>

    <footer class="import-footer">
      <span>将创建 {{ validTeamCount }} 支球队、{{ playerCount }} 名球员；认领前不会自动合并同名球队。</span>
      <div>
        <el-button :disabled="importing" @click="$emit('cancel')">取消</el-button>
        <el-button type="success" :loading="importing" :disabled="!canImport" @click="confirmImport">{{ importing ? currentProgress : `创建 ${validTeamCount} 支球队` }}</el-button>
      </div>
    </footer>
  </section>
</template>

<script setup>
import { computed, defineComponent, h, onBeforeUnmount, ref } from 'vue'
import { ElButton, ElIcon, ElMessage, ElMessageBox, ElUpload } from 'element-plus'
import { ArrowDown, ArrowRight, Delete, DocumentAdd, Download, UploadFilled } from '@element-plus/icons-vue'
import { callFunction, uploadLargeFileViaCloud } from '../../utils/cloud'
import { removeWhiteBackground } from '../../utils/whiteBgRemover'
import { findVisiblePixelBounds } from '../../utils/imageBounds'
import { maskRegistrationIdentity, parseTeamRegistrationDocx } from '../../utils/teamRegistrationDocx'

const props = defineProps({
  tournamentId: { type: String, required: true },
  division: { type: Object, required: true },
  availableSlots: { type: Number, default: 0 },
  existingTeamNames: { type: Array, default: () => [] }
})
const emit = defineEmits(['cancel', 'success'])

const teams = ref([])
const parsingKeys = ref(new Set())
const importing = ref(false)
const currentProgress = ref('正在创建')
const objectUrls = new Set()
const kitPreviewSets = [{ key:'primary', label:'主比赛服 A' }, { key:'secondary', label:'备用比赛服 B' }]
const kitPreviewEquipment = [{ key:'jersey', label:'球衣' }, { key:'shorts', label:'球裤' }, { key:'socks', label:'球袜' }]
const parsingCount = computed(() => parsingKeys.value.size)
const maxPlayers = computed(() => Number(props.division?.maxPlayersPerTeam || props.division?.maxPlayers || 35))
const playerCount = computed(() => teams.value.reduce((sum, team) => sum + team.players.length, 0))
const validTeamCount = computed(() => teams.value.filter(team => !teamHasErrors(team)).length)
const canImport = computed(() => teams.value.length > 0 && teams.value.length <= props.availableSlots && teams.value.every(team => !teamHasErrors(team) && !team.processing) && !importing.value)

const PersonPhotoUpload = defineComponent({
  name: 'PersonPhotoUpload',
  props: { person: { type: Object, required: true } },
  emits: ['change'],
  setup(componentProps, { emit: childEmit }) {
    return () => h(ElUpload, {
      accept: 'image/jpeg,image/png,image/webp',
      autoUpload: false,
      showFileList: false,
      onChange: file => childEmit('change', file)
    }, {
      default: () => h('button', { type: 'button', class: 'person-photo-button' }, componentProps.person.previewUrl
        ? h('img', { src: componentProps.person.previewUrl, alt: '' })
        : h('span', null, '上传'))
    })
  }
})

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, '').toLowerCase()
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11)
}

function maskPhone(value) {
  const phone = normalizePhone(value)
  return /^1[3-9]\d{9}$/.test(phone) ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : '手机号待补充'
}

function ageFromBirth(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return '待补充'
  const birth = new Date(`${value}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return '待补充'
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1
  return age >= 0 ? `${age}岁` : '待核验'
}

function downloadTemplate() {
  const anchor = document.createElement('a')
  anchor.href = `${import.meta.env.BASE_URL}templates/team-registration-form-template.docx`
  anchor.download = '球队报名表模板.docx'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

function currentTeamErrors(team) {
  const errors = [...(team.errors || [])]
  if (!String(team.teamName || '').trim()) errors.push('请填写球队名称')
  if (!String(team.contactName || '').trim()) errors.push('请填写领队姓名')
  if (!/^1[3-9]\d{9}$/.test(normalizePhone(team.contactPhone))) errors.push('请填写正确的领队手机号')
  if (team.players.length > maxPlayers.value) errors.push(`当前组别每队最多 ${maxPlayers.value} 名球员`)
  const coachPhone = normalizePhone(headCoach(team).phone)
  if (coachPhone && !/^1[3-9]\d{9}$/.test(coachPhone)) errors.push('主教练手机号格式不正确')
  return Array.from(new Set(errors))
}

function teamHasErrors(team) {
  return currentTeamErrors(team).length > 0 || team.players.some(player => player.error || !String(player.name || '').trim())
}

function hasImportedKitColors(team) {
  return kitPreviewSets.some(set => kitPreviewEquipment.some(equipment => team.kitColorLabels?.[set.key]?.[equipment.key]))
}

function headCoach(team) {
  let coach = team.staff.find(person => person.roleType === 'head_coach')
  if (!coach) {
    coach = { roleType: 'head_coach', roleLabel: '主教练', name: '', phone: '', identityNumber: '', photoFile: null, previewUrl: '', photoFileId: '', photoProcessingStatus: 'missing' }
    team.staff.push(coach)
  }
  return coach
}

function syncLeaderPhone(team) {
  team.contactPhone = normalizePhone(team.contactPhone)
  const leader = team.staff.find(person => person.roleType === 'team_leader')
  if (leader) leader.phone = team.contactPhone
}

function createPreview(file) {
  if (!file) return ''
  const url = URL.createObjectURL(file)
  objectUrls.add(url)
  return url
}

function revokePreview(url) {
  if (!url || !objectUrls.has(url)) return
  URL.revokeObjectURL(url)
  objectUrls.delete(url)
}

async function attachPreviews(team) {
  team.logoPreviewUrl = createPreview(team.logoFile)
  ;[...team.staff, ...team.players].forEach(person => { person.previewUrl = createPreview(person.photoFile) })
  if (team.logoFile) {
    try {
      team.preparedLogoFile = await prepareLogo(team.logoFile)
      revokePreview(team.logoPreviewUrl)
      team.logoPreviewUrl = createPreview(team.preparedLogoFile)
      team.logoProcessingStatus = 'prepared'
    } catch (error) {
      console.warn('队徽标准化预览失败，创建时重试:', error.message)
      team.preparedLogoFile = null
      team.logoProcessingStatus = 'pending'
    }
  }
  return team
}

async function handleDocxChange(file) {
  const rawFile = file.raw || file
  const key = String(file.uid || `${rawFile.name}-${rawFile.size}-${rawFile.lastModified}`)
  if (parsingKeys.value.has(key)) return
  if (teams.value.some(team => team.sourceFileName === rawFile.name && team.sourceFile?.size === rawFile.size)) return ElMessage.warning(`已选择 ${rawFile.name}`)
  parsingKeys.value = new Set([...parsingKeys.value, key])
  try {
    const parsed = await attachPreviews(await parseTeamRegistrationDocx(rawFile))
    teams.value.push(parsed)
    ElMessage.success(`已读取 ${parsed.teamName || rawFile.name}：${parsed.players.length} 名球员`)
  } catch (error) {
    ElMessage.error(`${rawFile.name || '报名表'}解析失败：${error.message || '格式不正确'}`)
  } finally {
    const next = new Set(parsingKeys.value)
    next.delete(key)
    parsingKeys.value = next
  }
}

function removeTeam(index) {
  const team = teams.value[index]
  revokePreview(team.logoPreviewUrl)
  ;[...team.staff, ...team.players].forEach(person => revokePreview(person.previewUrl))
  teams.value.splice(index, 1)
}

async function replaceLogo(file, team) {
  const rawFile = file.raw || file
  if (!rawFile.type?.startsWith('image/') || rawFile.size > 10 * 1024 * 1024) return ElMessage.error('队徽须为 10MB 以内的图片')
  revokePreview(team.logoPreviewUrl)
  team.logoFile = rawFile
  team.logoPreviewUrl = createPreview(rawFile)
  team.preparedLogoFile = null
  team.logoFileId = ''
  team.logoProcessingStatus = 'processing'
  try {
    team.preparedLogoFile = await prepareLogo(rawFile)
    revokePreview(team.logoPreviewUrl)
    team.logoPreviewUrl = createPreview(team.preparedLogoFile)
    team.logoProcessingStatus = 'prepared'
  } catch (error) {
    console.warn('队徽标准化预览失败，创建时重试:', error.message)
    team.logoProcessingStatus = 'pending'
  }
}

function replacePersonPhoto(file, person) {
  const rawFile = file.raw || file
  if (!rawFile.type?.startsWith('image/') || rawFile.size > 10 * 1024 * 1024) return ElMessage.error('照片须为 10MB 以内的图片')
  revokePreview(person.previewUrl)
  person.photoFile = rawFile
  person.previewUrl = createPreview(rawFile)
  person.photoFileId = ''
  person.photoProcessingStatus = 'pending'
  ElMessage.success(`${person.name || '球员'}照片已上传，创建时自动进行人像处理`)
}

function imageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片无法读取')) }
    image.src = url
  })
}

function canvasToFile(canvas, fileName, type = 'image/png', quality = 0.9) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(new File([blob], fileName, { type, lastModified: Date.now() })) : reject(new Error('图片处理失败')), type, quality))
}

async function trimTransparentContent(file, alphaThreshold = 12) {
  const image = await imageFromFile(file)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, image.naturalWidth || image.width)
  canvas.height = Math.max(1, image.naturalHeight || image.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  const bounds = findVisiblePixelBounds(pixels.data, canvas.width, canvas.height, alphaThreshold)
  if (!bounds || (bounds.x === 0 && bounds.y === 0 && bounds.width === canvas.width && bounds.height === canvas.height)) return file

  const cropped = document.createElement('canvas')
  cropped.width = bounds.width
  cropped.height = bounds.height
  cropped.getContext('2d').drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height)
  return canvasToFile(cropped, file.name.replace(/\.[^.]+$/, '-trimmed.png'), 'image/png', 1)
}

async function fitImage(file, width, height, paddingRatio = 0, background = null, outputType = 'image/png') {
  const image = await imageFromFile(file)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  context.clearRect(0, 0, width, height)
  if (background) { context.fillStyle = background; context.fillRect(0, 0, width, height) }
  const padding = Math.round(Math.min(width, height) * paddingRatio)
  const scale = Math.min((width - padding * 2) / image.width, (height - padding * 2) / image.height)
  const drawWidth = Math.max(1, Math.round(image.width * scale))
  const drawHeight = Math.max(1, Math.round(image.height * scale))
  context.drawImage(image, Math.round((width - drawWidth) / 2), Math.round((height - drawHeight) / 2), drawWidth, drawHeight)
  return canvasToFile(canvas, file.name.replace(/\.[^.]+$/, '.png'), outputType, 0.86)
}

async function blobToRawBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '')
    reader.onerror = () => reject(new Error('照片读取失败'))
    reader.readAsDataURL(blob)
  })
}

function dataUrlToFile(dataUrl, fileName) {
  const match = String(dataUrl || '').match(/^data:(image\/[^;]+);base64,(.+)$/)
  if (!match) throw new Error('人像分割结果无效')
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new File([bytes], fileName, { type: match[1], lastModified: Date.now() })
}

async function prepareLogo(file) {
  let source = file
  try {
    const result = await removeWhiteBackground(file)
    if (result?.success && result.data) source = dataUrlToFile(result.data, `team-logo-${Date.now()}.png`)
  } catch (error) {
    console.warn('队徽去白底失败，保留原图:', error.message)
  }
  const trimmed = await trimTransparentContent(source)
  return fitImage(trimmed, 500, 500, 0.08)
}

async function preparePortrait(file) {
  const auditFile = await fitImage(file, 250, 250, 0, '#fff', 'image/jpeg')
  const result = await callFunction('baiduRemoveBg', { action: 'removeBackground', imageBase64: await blobToRawBase64(auditFile) })
  if (!result?.success || !result.data) throw new Error(result?.message || '人像分割失败')
  if (result.personNum != null && Number(result.personNum) !== 1) throw new Error(`检测到 ${Number(result.personNum) || 0} 个人像`)
  const segmented = dataUrlToFile(`data:image/png;base64,${String(result.data).replace(/^data:image\/png;base64,/, '')}`, `portrait-${Date.now()}.png`)
  const trimmed = await trimTransparentContent(segmented)
  return fitImage(trimmed, 300, 388, 0.04)
}

async function uploadFile(cloudPath, file, onProgress, onRetry) {
  const result = await uploadLargeFileViaCloud(cloudPath, file, {
    chunkSize: 48 * 1024,
    fallbackChunkSize: 32 * 1024,
    onProgress,
    onRetry
  })
  if (!result?.success || !result.fileId) throw new Error(result?.message || '文件上传失败')
  return result.fileId
}

function safeKey(value, fallback) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || fallback
}

async function processTeamFiles(team, teamIndex) {
  team.processing = true
  team.importError = ''
  const updateProgress = text => {
    team.progressText = text
    currentProgress.value = `第 ${teamIndex + 1}/${teams.value.length} 支：${text}`
  }
  try {
    const teamKey = safeKey(team.clientKey, `team-${teamIndex + 1}`)
    if (!team.sourceFileId) {
      updateProgress('上传报名表 0%')
      team.sourceFileId = await uploadFile(
        `football/team-registration-imports/${props.tournamentId}/${teamKey}.docx`,
        team.sourceFile,
        (received, total) => updateProgress(`上传报名表 ${Math.round(received / total * 100)}%`),
        () => updateProgress('报名表切换安全分片')
      )
    }

    if (team.logoFile && !team.logoFileId) {
      updateProgress('处理队徽')
      const logo = team.preparedLogoFile || await prepareLogo(team.logoFile)
      team.logoFileId = await uploadFile(
        `team-logos/imports/${props.tournamentId}/${teamKey}.png`,
        logo,
        (received, total) => updateProgress(`上传队徽 ${Math.round(received / total * 100)}%`)
      )
      team.logoProcessingStatus = 'processed'
    }

    const people = [...team.staff, ...team.players]
    const pendingPeople = people.filter(person => person.photoFile && !person.photoFileId)
    let processedPeople = 0
    for (let index = 0; index < people.length; index += 1) {
      const person = people[index]
      if (person.roleType === 'player' && person.dualRoleType && !person.photoFileId) {
        const linkedStaff = team.staff.find(item => item.identityNumber && item.identityNumber === person.identityNumber)
        if (linkedStaff?.photoFileId) {
          person.photoFileId = linkedStaff.photoFileId
          person.photoProcessingStatus = linkedStaff.photoProcessingStatus
        }
      }
      if (!person.photoFile || person.photoFileId) continue
      processedPeople += 1
      const personProgress = `${processedPeople}/${pendingPeople.length}`
      person.photoProcessingStatus = 'processing'
      person.photoProgressText = '分割中'
      updateProgress(`处理人像 ${personProgress} · ${person.name || '未命名人员'}`)
      try {
        const portrait = await preparePortrait(person.photoFile)
        person.photoProgressText = '上传中'
        person.photoFileId = await uploadFile(
          `player-photos/imports/${props.tournamentId}/${teamKey}-${index + 1}.png`,
          portrait,
          (received, total) => {
            person.photoProgressText = `上传 ${Math.round(received / total * 100)}%`
            updateProgress(`处理人像 ${personProgress} · ${person.name || '未命名人员'} ${person.photoProgressText}`)
          }
        )
        person.photoProcessingStatus = 'processed'
        person.photoProgressText = ''
      } catch (error) {
        try {
          person.photoProgressText = '上传原图'
          updateProgress(`处理人像 ${personProgress} · ${person.name || '未命名人员'}保留原图`)
          const fallback = await fitImage(person.photoFile, 300, 388, 0.04, '#fff', 'image/jpeg')
          person.photoFileId = await uploadFile(
            `player-photos/imports/${props.tournamentId}/${teamKey}-${index + 1}-original.jpg`,
            fallback,
            (received, total) => {
              person.photoProgressText = `原图 ${Math.round(received / total * 100)}%`
              updateProgress(`处理人像 ${personProgress} · ${person.name || '未命名人员'} ${person.photoProgressText}`)
            }
          )
          person.photoProcessingStatus = 'fallback_original'
          person.photoProgressText = ''
          team.warnings = Array.from(new Set([...(team.warnings || []), `「${person.name}」人像分割失败，已保留原照片，可在球队资料中重试`]))
        } catch (fallbackError) {
          person.photoProcessingStatus = 'failed'
          person.photoProgressText = ''
          throw fallbackError
        }
      }
    }
    updateProgress('资料已就绪')
  } catch (error) {
    team.importError = error.message || '文件处理失败'
    throw error
  } finally {
    team.processing = false
  }
}

function payloadForTeam(team) {
  const people = [...team.staff, ...team.players]
  return {
    clientKey: team.clientKey,
    sourceFileId: team.sourceFileId,
    sourceFileName: team.sourceFileName,
    name: String(team.teamName || '').trim(),
    shortName: String(team.shortName || '').trim(),
    contactName: String(team.contactName || '').trim(),
    contactPhone: normalizePhone(team.contactPhone),
    logoFileId: team.logoFileId,
    kitColors: team.kitColors,
    kitColorLabels: team.kitColorLabels,
    staff: team.staff.filter(person => String(person.name || '').trim()).map(person => ({
      roleType: person.roleType,
      roleLabel: person.roleLabel,
      name: String(person.name || '').trim(),
      phone: normalizePhone(person.phone),
      identityNumber: person.identityNumber,
      jerseyNumber: String(person.jerseyNumber || '').replace(/\D/g, '').slice(0, 3),
      jerseyName: String(person.jerseyName || '').trim().toUpperCase().slice(0, 32),
      birthDate: person.birthDate,
      gender: person.gender,
      nativePlace: person.nativePlace,
      photoFileId: person.photoFileId,
      photoProcessingStatus: person.photoProcessingStatus
    })),
    players: team.players.map(player => ({
      name: String(player.name || '').trim(),
      identityNumber: player.identityNumber,
      jerseyNumber: String(player.jerseyNumber || '').replace(/\D/g, '').slice(0, 3),
      jerseyName: String(player.jerseyName || '').trim().toUpperCase().slice(0, 32),
      birthDate: player.birthDate,
      gender: player.gender,
      nativePlace: player.nativePlace,
      photoFileId: player.photoFileId,
      photoProcessingStatus: player.photoProcessingStatus
    })),
    photoCount: people.filter(person => person.photoFileId).length
  }
}

async function confirmImport() {
  if (!canImport.value) return ElMessage.warning('请先修正报名表中的必填项')
  const existingNames = new Set(props.existingTeamNames.map(normalizeName))
  const duplicateNames = teams.value.map(team => team.teamName).filter(name => existingNames.has(normalizeName(name)))
  let confirmRisks = false
  if (duplicateNames.length) {
    try {
      await ElMessageBox.confirm(`当前组别已有同名球队：${Array.from(new Set(duplicateNames)).join('、')}。继续后将创建独立球队并标记人工核验，不会自动合并。`, '发现同名球队', { type: 'warning', confirmButtonText: '继续创建', cancelButtonText: '返回核对' })
      confirmRisks = true
    } catch { return }
  }
  try {
    await ElMessageBox.confirm(`确认创建 ${teams.value.length} 支球队和 ${playerCount.value} 名球员？领队手机号已填写；补充主教练手机号后，二者均可通过认领邀请接管球队。`, '批量创建确认', { type: 'info', confirmButtonText: '开始创建', cancelButtonText: '取消' })
  } catch { return }

  importing.value = true
  try {
    for (let index = 0; index < teams.value.length; index += 1) {
      currentProgress.value = `准备第 ${index + 1}/${teams.value.length} 支`
      await processTeamFiles(teams.value[index], index)
    }
    currentProgress.value = '创建球队和队员'
    const result = await callFunction('tournamentRegistrationFlow', {
      action: 'importTeamRegistrationBatch',
      tournamentId: props.tournamentId,
      divisionId: props.division?.id || props.division?._id,
      confirmRisks,
      teams: teams.value.map(payloadForTeam)
    })
    if (!result?.success) throw new Error(result?.message || '批量创建失败')

    const imported = result.data?.teams || []
    const inviteResults = []
    for (let index = 0; index < imported.length; index += 1) {
      const item = imported[index]
      currentProgress.value = `生成认领邀请 ${index + 1}/${imported.length}`
      try {
        const code = await callFunction('tournamentRegistrationFlow', { action: 'generateTeamInviteCode', inviteId: item.inviteId, width: 300, envVersion: 'release' })
        if (!code?.success) throw new Error(code?.message || '认领邀请生成失败')
        inviteResults.push({ ...item, ...code.data, success: true })
      } catch (error) {
        inviteResults.push({ ...item, path: item.path, error: error.message || '认领邀请生成失败', success: false })
      }
    }
    ElMessage.success({ message: `球队资料上传成功：已创建 ${imported.length} 支球队、${Number(result.data?.playerCount || 0)} 名球员，等待领队或主教练认领`, duration: 6000, showClose: true })
    emit('success', { teams: imported, invitations: inviteResults, playerCount: Number(result.data?.playerCount || 0) })
  } catch (error) {
    ElMessage.error({ message: error.message || '批量创建失败', duration: 8000, showClose: true })
  } finally {
    importing.value = false
    currentProgress.value = '正在创建'
  }
}

onBeforeUnmount(() => {
  objectUrls.forEach(url => URL.revokeObjectURL(url))
  objectUrls.clear()
})
</script>

<style scoped>
.registration-importer{display:flex;flex-direction:column;gap:14px;min-height:440px}.import-toolbar{display:flex;align-items:center;justify-content:space-between;gap:18px}.import-toolbar>div{display:flex;flex-direction:column;gap:4px}.import-toolbar strong{font-size:17px}.import-toolbar span,.import-footer>span{color:#6f7c73;font-size:12px}.import-empty{min-height:300px;display:grid;place-content:center;justify-items:center;gap:9px;color:#7d8981;border:1px dashed #cdd9d1;background:#fafcfa}.import-empty .el-icon{font-size:42px;color:#1c8a4d}.import-team-list{display:flex;flex-direction:column;gap:10px;max-height:58vh;overflow:auto;padding-right:4px}.import-team{border:1px solid #dfe7e1;background:#fff}.import-team.invalid{border-color:#e6b8b4}.import-team>header{display:grid;grid-template-columns:28px 54px minmax(0,1fr) auto auto;align-items:center;gap:10px;min-height:66px;padding:7px 12px}.expand-button{border:0;background:transparent;color:#536159;cursor:pointer}.team-logo-button,.person-photo-button{display:grid;place-items:center;overflow:hidden;border:1px dashed #b8c9bd;background:#f7faf8;color:#21814e;cursor:pointer}.team-logo-button{width:50px;height:50px}.team-logo-button img,.person-photo-button img{width:100%;height:100%;object-fit:contain}.team-logo-button span{font-size:10px}.team-heading{min-width:0;display:flex;flex-direction:column;gap:4px}.team-heading strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.team-heading span{color:#7b8780;font-size:11px}.team-detail{padding:14px 16px 16px;border-top:1px solid #edf1ee;background:#fbfcfb}.team-fields{display:grid;grid-template-columns:1.2fr .8fr .8fr .9fr;gap:11px}.team-fields label{display:flex;min-width:0;flex-direction:column;gap:6px;color:#46554b;font-size:12px}.team-fields small{color:#849087;font-weight:400}.person-photo-button{width:36px;height:44px}.person-photo-button span{font-size:10px}.staff-section{margin-top:14px;padding-top:10px;border-top:1px solid #e7ece8}.staff-section>header,.player-section>header{display:flex;justify-content:space-between;gap:12px;margin-bottom:7px}.staff-section>header strong,.player-section>header strong{font-size:13px}.staff-section>header span,.player-section>header span{color:#7a877f;font-size:11px}.player-section{margin-top:14px}.staff-table-wrap,.player-table-wrap{overflow:auto;border:1px solid #e1e7e3}.staff-table-wrap table,.player-table-wrap table{width:100%;border-collapse:collapse;table-layout:fixed}.staff-table-wrap th,.staff-table-wrap td,.player-table-wrap th,.player-table-wrap td{height:54px;padding:5px 10px;border-bottom:1px solid #edf1ee;text-align:left}.staff-table-wrap th,.player-table-wrap th{height:34px;color:#617068;background:#f5f8f6;font-size:11px}.staff-table-wrap tr:last-child td,.player-table-wrap tr:last-child td{border-bottom:0}.staff-table-wrap tr.invalid,.player-table-wrap tr.invalid{background:#fff7f6}.staff-table-wrap th:first-child,.staff-table-wrap td:first-child,.player-table-wrap th:first-child,.player-table-wrap td:first-child{width:52px}.staff-table-wrap th:last-child,.staff-table-wrap td:last-child,.player-table-wrap th:last-child,.player-table-wrap td:last-child{width:120px}.identity-mask{color:#526159;font-family:monospace;font-size:12px}.dual-role-tag{display:block;width:max-content;margin-top:4px}.team-messages{display:flex;flex-wrap:wrap;gap:5px 14px;margin-top:10px;padding:9px 11px;background:#fff8e9}.team-messages p{margin:0;color:#98601d;font-size:11px}.team-messages p.error{color:#c4453c}.import-footer{display:flex;align-items:center;justify-content:space-between;gap:18px;padding-top:13px;border-top:1px solid #e4eae6}.import-footer>div{display:flex;gap:10px}@media(max-width:900px){.team-fields{grid-template-columns:1fr 1fr}.import-toolbar,.import-footer{align-items:flex-start;flex-direction:column}.import-footer>div{align-self:stretch}.import-footer :deep(.el-button){flex:1}}
.registration-kit-preview{display:flex;align-items:center;gap:14px;margin-top:12px;padding:10px 12px;border-top:1px solid #e7ece8;border-bottom:1px solid #e7ece8}.registration-kit-preview>strong{flex:0 0 62px;font-size:13px}.registration-kit-preview>div{display:flex;align-items:center;gap:10px}.registration-kit-preview b{font-size:12px}.registration-kit-preview span{display:inline-flex;align-items:center;gap:5px;color:#66746b;font-size:11px}.registration-kit-preview i{width:13px;height:13px;border:1px solid #cbd5ce;border-radius:2px}
.import-toolbar>.import-toolbar-actions{flex-direction:row;align-items:center;gap:10px}
.staff-table-wrap :deep(.el-upload),.player-table-wrap :deep(.el-upload){display:block;width:36px}
.registration-importer :deep(.person-photo-button){display:grid;width:36px;height:44px;padding:0;place-items:center;overflow:hidden;border:1px dashed #b8c9bd;background:#f7faf8;color:#21814e;cursor:pointer}
.registration-importer :deep(.person-photo-button img){display:block;width:100%;height:100%;object-fit:cover}
.registration-importer :deep(.person-photo-button span){font-size:10px}
@media(max-width:720px){.import-toolbar>.import-toolbar-actions{width:100%;flex-wrap:wrap}}
.player-table-wrap table{min-width:1160px;table-layout:fixed}
.player-table-wrap th:nth-child(1),.player-table-wrap td:nth-child(1){width:52px}
.player-table-wrap th:nth-child(2),.player-table-wrap td:nth-child(2){width:145px}
.player-table-wrap th:nth-child(3),.player-table-wrap td:nth-child(3){width:105px}
.player-table-wrap th:nth-child(4),.player-table-wrap td:nth-child(4){width:165px}
.player-table-wrap th:nth-child(5),.player-table-wrap td:nth-child(5){width:150px}
.player-table-wrap th:nth-child(6),.player-table-wrap td:nth-child(6){width:170px}
.player-table-wrap th:nth-child(7),.player-table-wrap td:nth-child(7){width:70px}
.player-table-wrap th:nth-child(8),.player-table-wrap td:nth-child(8){width:88px}
.player-table-wrap th:nth-child(9),.player-table-wrap td:nth-child(9){width:120px}
.native-place{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#526159;font-size:12px}
.staff-table-wrap table{min-width:1390px}
.staff-table-wrap th:nth-child(2),.staff-table-wrap td:nth-child(2){width:140px}
.staff-table-wrap th:nth-child(3),.staff-table-wrap td:nth-child(3){width:110px}
.staff-table-wrap th:nth-child(4),.staff-table-wrap td:nth-child(4){width:105px}
.staff-table-wrap th:nth-child(5),.staff-table-wrap td:nth-child(5){width:68px}
.staff-table-wrap th:nth-child(6),.staff-table-wrap td:nth-child(6){width:165px}
.staff-table-wrap th:nth-child(7),.staff-table-wrap td:nth-child(7){width:145px}
.staff-table-wrap th:nth-child(8),.staff-table-wrap td:nth-child(8){width:170px}
.staff-table-wrap th:nth-child(9),.staff-table-wrap td:nth-child(9){width:70px}
.staff-table-wrap th:nth-child(10),.staff-table-wrap td:nth-child(10){width:118px}
.player-table-wrap table{min-width:1220px}
.player-table-wrap th:nth-child(4),.player-table-wrap td:nth-child(4){width:68px}
.player-table-wrap th:nth-child(5),.player-table-wrap td:nth-child(5){width:165px}
.player-table-wrap th:nth-child(6),.player-table-wrap td:nth-child(6){width:150px}
.player-table-wrap th:nth-child(7),.player-table-wrap td:nth-child(7){width:170px}
.player-table-wrap th:nth-child(8),.player-table-wrap td:nth-child(8){width:70px}
.player-table-wrap th:nth-child(9),.player-table-wrap td:nth-child(9){width:88px}
.player-table-wrap th:nth-child(10),.player-table-wrap td:nth-child(10){width:120px}
.player-table-wrap table{min-width:1100px}
.player-table-wrap th:nth-child(1),.player-table-wrap td:nth-child(1){width:52px}
.player-table-wrap th:nth-child(2),.player-table-wrap td:nth-child(2){width:140px}
.player-table-wrap th:nth-child(3),.player-table-wrap td:nth-child(3){width:105px}
.player-table-wrap th:nth-child(4),.player-table-wrap td:nth-child(4){width:68px}
.player-table-wrap th:nth-child(5),.player-table-wrap td:nth-child(5){width:165px}
.player-table-wrap th:nth-child(6),.player-table-wrap td:nth-child(6){width:145px}
.player-table-wrap th:nth-child(7),.player-table-wrap td:nth-child(7){width:170px}
.player-table-wrap th:nth-child(8),.player-table-wrap td:nth-child(8){width:70px}
.player-table-wrap th:nth-child(9),.player-table-wrap td:nth-child(9){width:120px}
</style>
