<template>
  <section class="registration-importer">
    <header class="import-toolbar">
      <div>
        <strong>上传球队报名表</strong>
        <span>可同时选择多份 Word；一份文件创建一支球队。</span>
      </div>
      <div class="import-toolbar-actions">
        <el-button @click="templateDialogVisible=true"><el-icon><Download /></el-icon>下载报名表模板</el-button>
        <el-upload accept=".docx" multiple :auto-upload="false" :show-file-list="false" :on-change="handleDocxChange">
          <el-button type="success" plain :loading="parsingCount > 0">
            <el-icon><UploadFilled /></el-icon>{{ parsingCount > 0 ? `解析中 ${parsingCount}` : '选择报名表' }}
          </el-button>
        </el-upload>
      </div>
    </header>

    <el-dialog v-model="templateDialogVisible" title="选择报名字段" width="480px" append-to-body>
      <el-radio-group v-model="templatePreset" @change="applyTemplatePreset"><el-radio-button label="youth">青少年</el-radio-button><el-radio-button label="adult">成人</el-radio-button></el-radio-group>
      <p>姓名必填 · 球员栏位 {{ templatePlayerLimit }} 人</p><el-checkbox-group v-model="templateFields"><el-checkbox v-for="field in REGISTRATION_FIELDS" :key="field.key" :label="field.key">{{ field.label }}</el-checkbox></el-checkbox-group>
      <template #footer><el-button @click="templateDialogVisible=false">取消</el-button><el-button type="primary" :loading="downloadingTemplate" @click="downloadTemplate">下载模板</el-button></template>
    </el-dialog>
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
          <div v-if="currentTeamErrors(team).length" class="import-blockers" role="alert">
            <strong>还有 {{ currentTeamErrors(team).length }} 项需修正</strong>
            <ul><li v-for="issue in currentTeamIssues(team)" :key="issue.message">
              <span>{{ issue.message }}</span>
              <el-button v-if="team.players.includes(issue.person)" :disabled="importing || team.processing" link type="primary" @click="openPlayerEditor(issue.person,team)">修改</el-button>
            </li></ul>
          </div>
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
            <header><strong>工作人员资料</strong><span>证件、年龄、籍贯和照片状态已自动识别。</span></header>
            <div class="staff-table-wrap roster-scroll">
              <table class="roster-table staff-roster">
<colgroup>
                  <col class="col-photo" /><col class="col-name" /><col class="col-role" /><col class="col-birth" /><col class="col-age" /><col class="col-native" /><col class="col-jersey" /><col class="col-identity" /><col class="col-number" /><col class="col-phone" /><col class="col-status" />
                </colgroup>
                <thead><tr><th>照片</th><th>姓名</th><th>职务</th><th>出生日期</th><th>年龄</th><th>籍贯</th><th>球衣英文</th><th>{{ identityColumnLabel(team) }}</th><th>号码</th><th>手机号</th><th>照片状态</th></tr></thead>
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
                    <td><span class="native-place" :title="person.nativePlace || person.nationality">{{ placeOrNationalityLabel(person) }}</span></td>
                    <td><el-input v-if="person.jerseyNumber" v-model="person.jerseyName" maxlength="32" /><span v-else>—</span></td>
                    <td>
                      <div v-if="!person.identityEditing" class="identity-cell">
                        <el-tag v-if="person.documentType" size="small" effect="plain" class="identity-type-tag">{{ documentTypeLabel(person.documentType) }}</el-tag>
                        <span class="identity-mask">{{ displayRegistrationIdentity(person) }}</span>
                        <el-tag v-if="person.ignoredIdentityIssue" type="info" effect="plain" size="small">已忽略</el-tag>
                        <el-button link type="primary" size="small" @click="startIdentityEdit(person)">修改</el-button>
                        <el-button v-if="canIgnoreIdentity(person)" link type="warning" size="small" @click="ignoreIdentityIssue(person, team)">忽略</el-button>
                      </div>
                      <div v-else class="identity-cell">
                        <el-input v-model="person.identityDraft" maxlength="18" :placeholder="identityEditPlaceholder(person)" @keyup.enter="applyIdentityEdit(person, team)" />
                        <el-button link type="primary" size="small" @click="applyIdentityEdit(person, team)">确认</el-button>
                        <el-button link size="small" @click="cancelIdentityEdit(person)">取消</el-button>
                      </div>
                    </td>
                    <td><el-input v-if="person.jerseyNumber" v-model="person.jerseyNumber" maxlength="3" inputmode="numeric" /><span v-else>—</span></td>
                    <td>{{ person.phone ? maskPhone(person.phone) : '—' }}</td>
                    <td>
                      <div class="issue-cell">
                        <el-tag v-if="person.error" type="danger" size="small">{{ person.error }}</el-tag>
                        <el-tag v-else-if="person.photoProcessingStatus === 'processing'" type="warning" size="small">{{ person.photoProgressText || '处理中' }}</el-tag>
                        <el-tag v-else-if="person.photoProcessingStatus === 'processed'" type="success" effect="plain" size="small">已处理</el-tag>
                        <el-tag v-else-if="person.photoProcessingStatus === 'fallback_original'" type="warning" effect="plain" size="small">已保留原图</el-tag>
                        <el-tag v-else-if="person.photoProcessingStatus === 'failed'" type="danger" size="small">处理失败</el-tag>
                        <el-tag v-else-if="person.photoIsDefault || person.photoProcessingStatus === 'default_avatar'" type="info" effect="plain" size="small">默认头像</el-tag>
                        <el-tag v-else-if="person.photoFile" type="info" effect="plain" size="small">待处理</el-tag>
                        <el-tag v-else-if="person.photoIgnored || person.photoProcessingStatus === 'ignored_missing'" type="info" effect="plain" size="small">缺照片（已忽略）</el-tag>
                        <el-tag v-else type="warning" effect="plain" size="small">缺照片</el-tag>
                        <el-button v-if="canIgnorePhoto(person)" link type="warning" size="small" @click="ignorePhotoIssue(person, team)">忽略</el-button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="player-section">
            <header>
              <strong>球员资料</strong>

            </header>
            <div class="table-scroll-shell">
              <button type="button" class="scroll-hand left" title="向左滑动" aria-label="向左滑动" @click="scrollPlayerTable(team, -280)">
                <span class="scroll-hand-icon" aria-hidden="true"><i class="hand-left"></i></span>
              </button>
              <div
                class="player-table-wrap roster-scroll"
                :ref="el => setPlayerTableRef(team, el)"
                @pointerdown="startTableDrag($event, team)"
                @pointermove="moveTableDrag"
                @pointerup="endTableDrag"
                @pointercancel="endTableDrag"
              >
                <table class="roster-table player-roster">
<colgroup>
                  <col class="col-photo" /><col class="col-name" /><col class="col-birth" /><col class="col-age" /><col class="col-native" /><col class="col-jersey" /><col class="col-identity" /><col class="col-number" /><col class="col-position" /><col class="col-status" />
                </colgroup>
                  <thead>
                    <tr>
                      <th>照片</th><th>姓名</th><th>出生日期</th><th>年龄</th><th>籍贯</th><th>球衣英文</th><th>{{ identityColumnLabel(team) }}</th><th>号码</th><th>位置</th><th>照片状态</th><th class="col-actions">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(player, playerIndex) in team.players" :key="`${team.clientKey}-player-${playerIndex}`" :class="{ invalid: player.error, editing: player.rowEditing }">
                      <td><PersonPhotoUpload :person="player" @change="file => replacePersonPhoto(file, player)" /></td>
                      <td><el-input v-model="player.name" maxlength="30" /><el-tag v-if="player.dualRoleType" type="warning" effect="plain" size="small" class="dual-role-tag">{{ player.dualRolePlayerLabel || '兼工作人员' }}</el-tag></td>
                      <td>
                        <el-input v-if="player.rowEditing" v-model="player.birthDate" maxlength="10" placeholder="YYYY-MM-DD" />
                        <template v-else>{{ player.birthDate || '待补充' }}</template>
                      </td>
                      <td>{{ ageFromBirth(player.birthDate) }}</td>
                      <td>
                        <el-input v-if="player.rowEditing" v-model="player.nativePlace" maxlength="40" placeholder="籍贯/国籍" />
                        <span v-else class="native-place" :title="player.nativePlace || player.nationality">{{ placeOrNationalityLabel(player) }}</span>
                      </td>
                      <td><el-input v-model="player.jerseyName" maxlength="32" /></td>
                      <td>
                        <div v-if="!player.identityEditing" class="identity-cell">
                          <el-tag v-if="player.documentType" size="small" effect="plain" class="identity-type-tag">{{ documentTypeLabel(player.documentType) }}</el-tag>
                          <span class="identity-mask">{{ displayRegistrationIdentity(player) }}</span>
                          <el-tag v-if="player.ignoredIdentityIssue" type="info" effect="plain" size="small">待补齐</el-tag>
                          <el-button v-if="canIgnoreIdentity(player)" link type="warning" size="small" @click="ignoreIdentityIssue(player, team)">忽略</el-button>
                        </div>
                        <div v-else class="identity-cell">
                          <el-input v-model="player.identityDraft" maxlength="18" :placeholder="identityEditPlaceholder(player)" @keyup.enter="applyIdentityEdit(player, team)" />
                          <el-button link type="primary" size="small" @click="applyIdentityEdit(player, team)">确认</el-button>
                          <el-button link size="small" @click="cancelIdentityEdit(player)">取消</el-button>
                        </div>
                      </td>
                      <td><el-input v-model="player.jerseyNumber" maxlength="3" inputmode="numeric" /></td>
                      <td><el-select v-model="player.position" clearable><el-option v-for="position in ['门将','后卫','中场','前锋','其他']" :key="position" :label="position" :value="position" /></el-select></td>
                      <td>
                        <div class="issue-cell">
                          <el-tag v-if="player.error" type="danger" size="small">{{ player.error }}</el-tag>
                          <el-tag v-else-if="player.photoProcessingStatus === 'processing'" type="warning" size="small">{{ player.photoProgressText || '处理中' }}</el-tag>
                          <el-tag v-else-if="player.photoProcessingStatus === 'processed'" type="success" effect="plain" size="small">已处理</el-tag>
                          <el-tag v-else-if="player.photoProcessingStatus === 'fallback_original'" type="warning" effect="plain" size="small">已保留原图</el-tag>
                          <el-tag v-else-if="player.photoProcessingStatus === 'failed'" type="danger" size="small">处理失败</el-tag>
                          <el-tag v-else-if="player.photoIsDefault || player.photoProcessingStatus === 'default_avatar'" type="info" effect="plain" size="small">默认头像</el-tag>
                          <el-tag v-else-if="player.photoFile" type="info" effect="plain" size="small">待处理</el-tag>
                          <el-tag v-else-if="player.photoIgnored || player.photoProcessingStatus === 'ignored_missing'" type="info" effect="plain" size="small">缺照片（已忽略）</el-tag>
                          <el-tag v-else type="warning" effect="plain" size="small">缺照片</el-tag>
                          <el-button v-if="canIgnorePhoto(player)" link type="warning" size="small" @click="ignorePhotoIssue(player, team)">忽略</el-button>
                        </div>
                      </td>
                      <td class="col-actions">
                        <div class="row-actions">
                          <el-button link type="primary" size="small" :disabled="importing || team.processing" @click="openPlayerEditor(player,team)">编辑</el-button>
                          <el-button link type="danger" size="small" :disabled="importing" @click="removePlayer(team, playerIndex)">删除</el-button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <button type="button" class="scroll-hand right" title="向右滑动" aria-label="向右滑动" @click="scrollPlayerTable(team, 280)">
                <span class="scroll-hand-icon" aria-hidden="true"><i class="hand-right"></i></span>
              </button>
            </div>
          </section>

          <div v-if="team.errors.length || team.warnings.length || team.importError || teamHasIgnorableIssues(team)" class="team-messages">
            <p v-if="team.importError" class="error">{{ team.importError }}</p>

            <p v-for="item in team.warnings" :key="`warning-${item}`">{{ item }}</p>
            <div v-if="teamHasIgnorableIssues(team)" class="ignore-all-row">
              <span>报名表无照片时自动使用默认头像；证件异常可先忽略，创建后在平台补资料。</span>
              <el-button size="small" type="warning" plain @click="ignoreAllTeamIssues(team)">忽略全部异常</el-button>
            </div>
          </div>
        </div>
      </article>
    </div>

    <RegistrationPlayerEditor v-model="playerEditorVisible" :player="editingPlayer" :team="editingTeam" @save="savePlayerEdit" />
    <footer class="import-footer">
      <div class="import-footer-status">
        <span v-if="importBlockers.length" class="blocking-reason">{{ importBlockers[0] }}</span>
        <el-button v-if="importBlockers.length" link type="primary" @click="showImportIssues">查看{{ importBlockers.length }}项问题</el-button>
        <span v-else>共 {{ teams.length }} 支球队、{{ playerCount }} 名球员</span>
      </div>
      <div>
        <el-button :disabled="importing" @click="$emit('cancel')">取消</el-button>
        <el-button type="success" :loading="importing" :disabled="!canImport" @click="confirmImport">{{ importing ? currentProgress : `创建 ${teams.length} 支球队` }}</el-button>
      </div>
    </footer>
  </section>
</template>

<script setup>
import RegistrationPlayerEditor from './RegistrationPlayerEditor.vue'
import { registrationImportIssues, registrationIdentityIssue, ignoredIdentityFields } from '../../utils/registrationImportValidation.js'
import { computed, defineComponent, h, onBeforeUnmount, ref } from 'vue'
import { ElButton, ElIcon, ElMessage, ElMessageBox, ElUpload } from 'element-plus'
import { ArrowDown, ArrowRight, Delete, DocumentAdd, Download, UploadFilled, User } from '@element-plus/icons-vue'
import { callFunction, uploadLargeFileViaCloud } from '../../utils/cloud'
import { removeWhiteBackground } from '../../utils/whiteBgRemover'
import { findVisiblePixelBounds } from '../../utils/imageBounds'
import { photoResult } from '../../utils/registrationPhotoReuse.js'
import {
  displayRegistrationIdentity,
  parseRegistrationIdentity,
  parseTeamRegistrationDocx,
  registrationDocumentTypeLabel,
  registrationIdentityColumnLabel
} from '../../utils/teamRegistrationDocx'
import { REGISTRATION_FIELDS, REGISTRATION_PRESETS, createRegistrationTemplate, registrationTemplatePlayerLimit } from '../../utils/registrationTemplate'
import { isDemoMode } from '../../utils/demoMode'
import { divisionParticipantType } from '../../utils/divisionBasics'
import defaultPlayerAvatarUrl from '../../assets/default-player-avatar.png'

const props = defineProps({
  tournamentId: { type: String, required: true },
  tournamentName: { type: String, required: true },
  division: { type: Object, required: true },
  availableSlots: { type: Number, default: 0 },
  existingTeamNames: { type: Array, default: () => [] }
})
const emit = defineEmits(['cancel', 'success'])

const teams = ref([])
const playerEditorVisible=ref(false),editingPlayer=ref(null),editingTeam=ref(null)
function openPlayerEditor(player,team){if(importing.value || team.processing)return;editingPlayer.value=player;editingTeam.value=team;playerEditorVisible.value=true}
function savePlayerEdit(profile,photoFile){
  const player=editingPlayer.value,team=editingTeam.value
  if(!player || !team?.players.includes(player))return
  const oldName=player.name
  Object.assign(player,profile,{identityNumberPrefix:'',identityEditing:false,rowEditing:false,identityIncomplete:!profile.identityNumber,error:'',ignoredIdentityIssue:profile.ignoredIdentityIssue === true})
  if(photoFile)replacePersonPhoto({raw:photoFile},player)
  const markers=[`「${oldName}」`,`“${oldName}”`]
  const keep=item=>!markers.some(marker=>String(item).includes(marker))
  team.errors=(team.errors || []).filter(keep)
  team.warnings=(team.warnings || []).filter(keep)
  ElMessage.success('球员资料已更新')
}
const templateDialogVisible=ref(false)
const templatePreset=ref(divisionParticipantType(props.division))
const templateFields=ref([...REGISTRATION_PRESETS[templatePreset.value]])
const downloadingTemplate=ref(false)
function applyTemplatePreset(value){templateFields.value=[...REGISTRATION_PRESETS[value]]}
const parsingKeys = ref(new Set())
const importing = ref(false)
const currentProgress = ref('正在创建')
const objectUrls = new Set()
let defaultPlayerAvatarFilePromise = null
const playerTableRefs = new Map()
const tableDragState = { active: false, teamKey: '', startX: 0, scrollLeft: 0, moved: false }
const kitPreviewSets = [{ key:'primary', label:'主比赛服 A' }, { key:'secondary', label:'备用比赛服 B' }]
const kitPreviewEquipment = [{ key:'jersey', label:'球衣' }, { key:'shorts', label:'球裤' }, { key:'socks', label:'球袜' }]
const parsingCount = computed(() => parsingKeys.value.size)
// 与下载模板使用同一套取数顺序（rosterLimit → maxPlayersPerTeam → maxPlayers），
// 避免组别规则上限（rosterLimit）改成 50 后仍按旧的 maxPlayersPerTeam 提示 30 人。
const maxPlayers = computed(() => {
  try { return registrationTemplatePlayerLimit(props.division) } catch { return 35 }
})
const templatePlayerLimit = computed(() => registrationTemplatePlayerLimit(props.division))
const playerCount = computed(() => teams.value.reduce((sum, team) => sum + team.players.length, 0))
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
      default: () => h('button', { type: 'button', class: ['person-photo-button', { 'is-empty':!componentProps.person.previewUrl }], title:'上传照片', 'aria-label':`${componentProps.person.name || '人员'}上传照片` }, componentProps.person.previewUrl
        ? h('img', { src: componentProps.person.previewUrl, alt: '' })
        : h(ElIcon, { class:'photo-placeholder', 'aria-hidden':true }, { default:()=>h(User) }))
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

function documentTypeLabel(documentType) {
  return registrationDocumentTypeLabel(documentType)
}

function identityColumnLabel(team) {
  return registrationIdentityColumnLabel([...(team?.staff || []), ...(team?.players || [])])
}

function placeOrNationalityLabel(person) {
  if (person?.documentType === 'passport') return person.nationality || '国籍待确认'
  return person?.nativePlace || '地区码待核验'
}

function identityEditPlaceholder(person) {
  if (person?.documentType === 'passport') return '护照号'
  if (person?.documentType === 'resident_id') return '18 位身份证号'
  return '身份证 18 位或护照号'
}

// 报名表证件号常被打码，解析只能拿到前段。主办方可补全完整身份证或护照号；
// 身份证可继续推导出生日期/性别/籍贯，护照只保存证件类型与号码，国籍仍待确认。
function setPlayerTableRef(team, el) {
  const key = team?.clientKey
  if (!key) return
  if (el) playerTableRefs.set(key, el)
  else playerTableRefs.delete(key)
}

function scrollPlayerTable(team, delta) {
  const el = playerTableRefs.get(team?.clientKey)
  if (!el) return
  el.scrollBy({ left: delta, behavior: 'smooth' })
}

function startTableDrag(event, team) {
  if (event.button != null && event.button !== 0) return
  if (event.target?.closest?.('input,textarea,button,select,a,.el-input,.el-select,.el-button,.el-upload,.row-actions')) return
  const el = playerTableRefs.get(team?.clientKey)
  if (!el) return
  tableDragState.active = true
  tableDragState.teamKey = team.clientKey
  tableDragState.startX = event.clientX
  tableDragState.scrollLeft = el.scrollLeft
  tableDragState.moved = false
  el.classList.add('is-dragging')
  try { el.setPointerCapture?.(event.pointerId) } catch { /* ignore */ }
}

function moveTableDrag(event) {
  if (!tableDragState.active) return
  const el = playerTableRefs.get(tableDragState.teamKey)
  if (!el) return
  const delta = event.clientX - tableDragState.startX
  if (Math.abs(delta) > 3) tableDragState.moved = true
  el.scrollLeft = tableDragState.scrollLeft - delta
  event.preventDefault()
}

function endTableDrag(event) {
  if (!tableDragState.active) return
  const el = playerTableRefs.get(tableDragState.teamKey)
  if (el) {
    el.classList.remove('is-dragging')
    try { el.releasePointerCapture?.(event.pointerId) } catch { /* ignore */ }
  }
  tableDragState.active = false
  tableDragState.teamKey = ''
}

async function removePlayer(team, playerIndex) {
  const player = team.players[playerIndex]
  if (!player) return
  const name = String(player.name || '').trim() || `第 ${playerIndex + 1} 名球员`
  try {
    await ElMessageBox.confirm(
      `确定从本次导入中删除「${name}」？创建球队后可由主教练分享，让球员自行加入。`,
      '删除球员',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch { return }
  if (!player.photoIsDefault) revokePreview(player.previewUrl)
  team.players.splice(playerIndex, 1)
  const marker = `「${name}」`
  team.errors = (team.errors || []).filter(item => !String(item).includes(marker))
  team.warnings = (team.warnings || []).filter(item => !String(item).includes(marker))
  ElMessage.success(`已删除「${name}」，可稍后由主教练邀请加入`)
}

function startIdentityEdit(person) {
  person.identityEditing = true
  person.identityDraft = String(person.identityNumber || person.identityNumberPrefix || '')
}

function cancelIdentityEdit(person) {
  person.identityEditing = false
  person.identityDraft = ''
}

function applyIdentityEdit(person, team) {
  const raw = String(person.identityDraft || '').trim().toUpperCase()
  const parsed = parseRegistrationIdentity(raw)
  const completeResident = /^\d{17}[0-9X]$/.test(raw)
  const completePassport = parsed.documentType === 'passport' && parsed.valid && !parsed.isPartial
  if (!parsed.valid || (!completeResident && !completePassport)) {
    return ElMessage.warning('请填写有效的 18 位身份证号或完整护照号')
  }
  const duplicated = [...team.staff, ...team.players].find(item => item !== person && String(item.identityNumber || '') === raw)
  if (duplicated) return ElMessage.error(`该证件号与「${duplicated.name || '其他人员'}」重复`)
  person.identityNumber = raw
  person.identityNumberPrefix = ''
  person.identityIncomplete = false
  person.documentType = parsed.documentType || person.documentType || ''
  if (parsed.documentType === 'passport') {
    person.nationality = person.nationality || ''
    if (!person.nativePlace) person.nativePlace = ''
  } else {
    if (parsed.nationalityDefault) person.nationality = parsed.nationalityDefault
    if (parsed.birthDate) person.birthDate = parsed.birthDate
    if (parsed.gender) person.gender = parsed.gender
    if (parsed.nativePlace && parsed.nativePlace !== '待核验') person.nativePlace = parsed.nativePlace
  }
  person.error = ''
  person.identityEditing = false
  person.identityDraft = ''
  ElMessage.success(`${person.name || '该人员'}${documentTypeLabel(person.documentType)}号已更新`)
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

async function downloadTemplate() {
  downloadingTemplate.value=true
  try {
  const response=await fetch(`${import.meta.env.BASE_URL}templates/team-registration-form-template.docx?v=generic-fields-20261007`)
  if(!response.ok)throw new Error('模板下载失败，请重试')
  const blob=await createRegistrationTemplate(await response.arrayBuffer(),templateFields.value,{tournamentName:props.tournamentName,divisionName:props.division.name || props.division.divisionName,maxPlayers:templatePlayerLimit.value})
  const url=URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${props.tournamentName}-${props.division.name || props.division.divisionName || '球队'}-报名表.docx`.replace(/[\\/:*?"<>|]/g,'_')
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(()=>URL.revokeObjectURL(url),30000)
  templateDialogVisible.value=false
  }catch(error){ElMessage.error(error.message||'模板下载失败，请重试')}finally{downloadingTemplate.value=false}
}

function currentTeamIssues(team){return registrationImportIssues(team,maxPlayers.value)}
function currentTeamErrors(team){return currentTeamIssues(team).map(issue=>issue.message)}
function showImportIssues(){
  const team=teams.value.find(team=>teamHasErrors(team)) || teams.value[0]
  if(team)team.expanded=true
  requestAnimationFrame(()=>document.querySelector('.import-team.invalid, .import-team')?.scrollIntoView({behavior:'smooth',block:'start'}))
}
const importBlockers=computed(()=>{
  const messages=teams.value.flatMap(team=>currentTeamErrors(team).map(message=>`${team.teamName || '未命名球队'}：${message}`))
  if(teams.value.length>props.availableSlots)messages.unshift(`当前组别仅剩${props.availableSlots}个球队名额，已选择${teams.value.length}支球队`)
  for(const team of teams.value)if(team.processing)messages.unshift(`${team.teamName || '球队'}：${team.progressText || '资料处理中，请稍候'}`)
  if(parsingCount.value)messages.unshift('报名表正在解析，请稍候')
  return messages
})
function hasMissingPhoto(person) {
  if (person?.photoIsDefault || person?.photoProcessingStatus === 'default_avatar') return false
  return !person?.photoFile && !person?.photoFileId && person?.photoProcessingStatus !== 'ignored_missing' && !person?.photoIgnored
}

async function loadDefaultPlayerAvatarFile() {
  if (!defaultPlayerAvatarFilePromise) {
    defaultPlayerAvatarFilePromise = fetch(defaultPlayerAvatarUrl)
      .then(async response => {
        if (!response.ok) throw new Error('默认头像加载失败')
        const blob = await response.blob()
        return new File([blob], 'default-player-avatar.png', { type: blob.type || 'image/png', lastModified: Date.now() })
      })
      .catch(error => {
        defaultPlayerAvatarFilePromise = null
        throw error
      })
  }
  return defaultPlayerAvatarFilePromise
}

async function applyDefaultAvatarIfMissing(person, team) {
  if (!person || person.photoFile || person.photoFileId || person.photoIgnored || person.photoProcessingStatus === 'ignored_missing') return false
  const file = await loadDefaultPlayerAvatarFile()
  person.photoFile = file
  person.photoIsDefault = true
  person.photoProcessingStatus = 'default_avatar'
  person.previewUrl = defaultPlayerAvatarUrl
  person.photoProgressText = ''
  const name = String(person.name || '').trim()
  if (name) {
    const marker = `「${name}」未找到照片`
    team.warnings = (team.warnings || []).filter(item => item !== marker)
  }
  return true
}

function canIgnoreIdentity(person) {
  if (!person || person.ignoredIdentityIssue) return false
  // 身份证/护照通用：格式错误、打码不全、未填写都可忽略，创建后平台补。
  if (person.error || registrationIdentityIssue(person)) return true
  if (person.identityIncomplete) return true
  if (!person.identityNumber) return true
  return false
}

function canIgnorePhoto(person) {
  return Boolean(person?.photoProcessingStatus === 'failed' || hasMissingPhoto(person))
}

function canIgnorePerson(person) {
  return canIgnoreIdentity(person) || canIgnorePhoto(person)
}

function teamHasIgnorableIssues(team) {
  return [...(team?.staff || []), ...(team?.players || [])].some(canIgnorePerson)
}

function scrubPersonMessages(team, person, kinds = ['identity', 'photo']) {
  const name = String(person?.name || '').trim()
  if (!name) return
  const marker = `「${name}」`
  const identityHint = /证件|身份证|护照|出生日期/
  const photoHint = /照片|人像/
  const keep = item => {
    const text = String(item)
    if (!text.includes(marker)) return true
    if (kinds.includes('identity') && identityHint.test(text)) return false
    if (kinds.includes('photo') && photoHint.test(text)) return false
    if (kinds.includes('identity') && kinds.includes('photo')) return false
    return true
  }
  team.errors = (team.errors || []).filter(keep)
  team.warnings = (team.warnings || []).filter(keep)
}

// 主办方可忽略证件（身份证/护照）与缺照片等解析异常，创建后走平台补资料；
// 队名/领队手机等建队必填项仍不可忽略。
function ignoreIdentityIssue(person, team) {
  if (!canIgnoreIdentity(person)) return
  if(currentTeamIssues(team).some(issue=>issue.code==='duplicate' && issue.people.includes(person))){
    return ElMessage.warning('证件号重复，请修改或删除对应人员')
  }
  person.ignoredIdentityIssue = true
  const parsed = parseRegistrationIdentity(person.identityNumber || person.identityNumberPrefix || '')
  if (!parsed.valid || person.error || registrationIdentityIssue(person)) {
    const ignored=ignoredIdentityFields(person)
    person.identityNumber = ''
    person.birthDate=ignored.birthDate
    person.gender=ignored.gender
    person.identityNumberPrefix = person.identityNumberPrefix || ''
  } else if (parsed.isPartial) {
    person.identityNumber = ''
    person.identityNumberPrefix = parsed.identityNumberPrefix || person.identityNumberPrefix || ''
    person.documentType = parsed.documentType || person.documentType || ''
  }
  person.identityIncomplete = true
  person.eligibilityReviewRequired = true
  person.error = ''
  scrubPersonMessages(team, person, ['identity'])
}

function ignorePhotoIssue(person, team) {
  if (!canIgnorePhoto(person)) return
  person.photoIgnored = true
  person.photoProcessingStatus = 'ignored_missing'
  person.eligibilityReviewRequired = true
  scrubPersonMessages(team, person, ['photo'])
}

function ignorePersonIssues(person, team) {
  if (canIgnoreIdentity(person)) ignoreIdentityIssue(person, team)
  if (canIgnorePhoto(person)) ignorePhotoIssue(person, team)
}

function ignoreAllTeamIssues(team) {
  const people = [...(team.staff || []), ...(team.players || [])].filter(canIgnorePerson)
  if (!people.length) return ElMessage.info('当前没有可忽略的异常')
  people.forEach(person => ignorePersonIssues(person, team))
  const remaining=currentTeamErrors(team)
  if(remaining.length)ElMessage.warning(`已处理可忽略项，仍有${remaining.length}项需修正：${remaining[0]}`)
  else ElMessage.success('可忽略项已处理，可以创建球队')
}

function teamHasErrors(team) {
  return currentTeamErrors(team).length > 0
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
  if (/^1[3-9]\d{9}$/.test(team.contactPhone)) {
    team.errors = (team.errors || []).filter(item => !/领队手机|有效的领队手机/.test(String(item || '')))
  }
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
  for (const person of [...team.staff, ...team.players]) {
    await applyDefaultAvatarIfMissing(person, team)
  }
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
  if (!person.photoIsDefault) revokePreview(person.previewUrl)
  person.photoFile = rawFile
  person.photoIsDefault = false
  person.photoIgnored = false
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
  if(isDemoMode())return fitImage(file,300,388,0.04)
  const auditFile = await fitImage(file, 250, 250, 0, '#fff', 'image/jpeg')
  const result = await callFunction('baiduRemoveBg', { action: 'removeBackground', tournamentId: props.tournamentId, imageBase64: await blobToRawBase64(auditFile) })
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
    const photoResults=new Map(people.filter(person=>person.photoFile&&person.photoFileId).map(person=>[person.photoFile,photoResult(person)]))
    let processedPeople = 0
    for (let index = 0; index < people.length; index += 1) {
      const person = people[index]
      const reused=photoResults.get(person.photoFile)
      if(!person.photoFileId&&reused)Object.assign(person,reused)
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
      if (person.photoIsDefault) {
        person.photoProcessingStatus = 'processing'
        person.photoProgressText = '上传默认头像'
        updateProgress(`上传默认头像 ${personProgress} · ${person.name || '未命名人员'}`)
        person.photoFileId = await uploadFile(
          `player-photos/imports/${props.tournamentId}/${teamKey}-${index + 1}-default.png`,
          person.photoFile,
          (received, total) => {
            person.photoProgressText = `上传 ${Math.round(received / total * 100)}%`
            updateProgress(`上传默认头像 ${personProgress} · ${person.name || '未命名人员'} ${person.photoProgressText}`)
          }
        )
        person.photoProcessingStatus = 'default_avatar'
        person.photoProgressText = ''
        if (person.photoFileId) photoResults.set(person.photoFile, photoResult(person))
        continue
      }
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
      if(person.photoFileId)photoResults.set(person.photoFile,photoResult(person))
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
      documentType: person.documentType || '',
      nationality: person.nationality || '',
      identityIncomplete: Boolean(person.identityIncomplete || !person.identityNumber),
      eligibilityReviewRequired: Boolean(person.eligibilityReviewRequired || person.ignoredIdentityIssue || person.photoIgnored || !person.identityNumber),
      position:person.position || '',
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
      documentType: player.documentType || '',
      nationality: player.nationality || '',
      identityIncomplete: Boolean(player.identityIncomplete || !player.identityNumber),
      eligibilityReviewRequired: Boolean(player.eligibilityReviewRequired || player.ignoredIdentityIssue || player.photoIgnored || !player.identityNumber || !player.nationality),
      position:player.position || '',
      strongFoot:player.strongFoot || '',
      height:player.height ?? null,
      weight:player.weight ?? null,
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
  if (!canImport.value) {showImportIssues();return ElMessage.warning(importBlockers.value[0] || '请先选择报名表')}
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
    await ElMessageBox.confirm(`确认创建 ${teams.value.length} 支球队和 ${playerCount.value} 名球员？`, '批量创建确认', { type: 'info', confirmButtonText: '开始创建', cancelButtonText: '取消' })
  } catch { return }

  importing.value = true
  try {
    for (let index = 0; index < teams.value.length; index += 1) {
      currentProgress.value = `准备第 ${index + 1}/${teams.value.length} 支`
      await processTeamFiles(teams.value[index], index)
    }
    currentProgress.value = '创建球队和队员'
    // 50 人名单创建会写多表，默认 60s 易超时；超时后后端可能已创建成功，重试会报「已经导入过」。
    const result = await callFunction('tournamentRegistrationFlow', {
      action: 'importTeamRegistrationBatch',
      tournamentId: props.tournamentId,
      divisionId: props.division?.id || props.division?._id,
      confirmRisks,
      teams: teams.value.map(payloadForTeam)
    }, 300000)
    if (!result?.success) throw Object.assign(new Error(result?.message || '批量创建失败'), { code: result?.code || '' })

    const imported = result.data?.teams || []
    const playerTotal = Number(result.data?.playerCount || 0)
    ElMessage.success({
      message: isDemoMode()
        ? `已创建 ${imported.length} 支虚拟球队`
        : `球队资料上传成功：已创建 ${imported.length} 支球队、${playerTotal} 名球员`,
      duration: 6000,
      showClose: true
    })
    // 先关上传弹层；认领码由父页面在关闭后继续生成，避免组件销毁中断。
    teams.value = []
    emit('success', {
      teams: imported,
      invitations: [],
      playerCount: playerTotal,
      demo: isDemoMode(),
      needInvites: !isDemoMode() && imported.length > 0
    })
    emit('cancel')
  } catch (error) {
    const message = String(error?.message || '批量创建失败')
    const alreadyImported = error?.code === 'IMPORT_SOURCE_ALREADY_USED' || /已经导入过|请勿重复创建/.test(message)
    if (alreadyImported) {
      // 常见于：创建已成功但前端超时/二次点击；报名表文件已落库，应关窗刷新而不是卡在上传页。
      ElMessage.warning({ message: '该报名表已创建过球队，正在关闭并刷新列表', duration: 5000, showClose: true })
      teams.value = []
      emit('success', { teams: [], invitations: [], playerCount: 0, demo: false, needInvites: false, alreadyImported: true })
      emit('cancel')
      return
    }
    ElMessage.error({ message, duration: 8000, showClose: true })
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
.registration-importer{display:flex;flex-direction:column;gap:14px;min-height:440px;min-width:0;max-width:100%}.import-toolbar{display:flex;align-items:center;justify-content:space-between;gap:18px}.import-toolbar>div{display:flex;flex-direction:column;gap:4px}.import-toolbar strong{font-size:17px}.import-toolbar span,.import-footer>span{color:#6f7c73;font-size:12px}.import-empty{min-height:300px;display:grid;place-content:center;justify-items:center;gap:9px;color:#7d8981;border:1px dashed #cdd9d1;background:#fafcfa}.import-empty .el-icon{font-size:42px;color:#1c8a4d}.import-team-list{display:flex;flex-direction:column;gap:10px;max-height:58vh;min-width:0;max-width:100%;overflow-x:hidden;overflow-y:auto;padding-right:4px}.import-team{min-width:0;max-width:100%;border:1px solid #dfe7e1;background:#fff}.import-team.invalid{border-color:#e6b8b4}.import-team>header{display:grid;grid-template-columns:28px 54px minmax(0,1fr) auto auto;align-items:center;gap:10px;min-height:66px;padding:7px 12px}.expand-button{border:0;background:transparent;color:#536159;cursor:pointer}.team-logo-button,.person-photo-button{display:grid;place-items:center;overflow:hidden;border:1px dashed #b8c9bd;background:#f7faf8;color:#21814e;cursor:pointer}.team-logo-button{width:50px;height:50px}.team-logo-button img,.person-photo-button img{width:100%;height:100%;object-fit:contain}.team-logo-button span{font-size:10px}.team-heading{min-width:0;display:flex;flex-direction:column;gap:4px}.team-heading strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.team-heading span{color:#7b8780;font-size:11px}.team-detail{min-width:0;max-width:100%;padding:14px 16px 16px;border-top:1px solid #edf1ee;background:#fbfcfb}.team-fields{display:grid;grid-template-columns:1.2fr .8fr .8fr .9fr;gap:11px}.team-fields label{display:flex;min-width:0;flex-direction:column;gap:6px;color:#46554b;font-size:12px}.team-fields small{color:#849087;font-weight:400}.person-photo-button{width:36px;height:44px}.person-photo-button span{font-size:10px}.staff-section{margin-top:14px;padding-top:10px;border-top:1px solid #e7ece8}.staff-section>header,.player-section>header{display:flex;justify-content:space-between;gap:12px;margin-bottom:7px}.staff-section>header strong,.player-section>header strong{font-size:13px}.staff-section>header span,.player-section>header span{color:#7a877f;font-size:11px}.player-section{margin-top:14px}.dual-role-tag{display:block;width:max-content;margin-top:4px}.team-messages{display:flex;flex-wrap:wrap;gap:5px 14px;margin-top:10px;padding:9px 11px;background:#fff8e9}.team-messages p{margin:0;color:#98601d;font-size:11px}.team-messages p.error{color:#c4453c}.import-footer{display:flex;align-items:center;justify-content:space-between;gap:18px;padding-top:13px;border-top:1px solid #e4eae6}.import-footer>div{display:flex;gap:10px}@media(max-width:900px){.team-fields{grid-template-columns:1fr 1fr}.import-toolbar,.import-footer{align-items:flex-start;flex-direction:column}.import-footer>div{align-self:stretch}.import-footer :deep(.el-button){flex:1}}
.registration-kit-preview{display:flex;align-items:center;gap:14px;margin-top:12px;padding:10px 12px;border-top:1px solid #e7ece8;border-bottom:1px solid #e7ece8}.registration-kit-preview>strong{flex:0 0 62px;font-size:13px}.registration-kit-preview>div{display:flex;align-items:center;gap:10px}.registration-kit-preview b{font-size:12px}.registration-kit-preview span{display:inline-flex;align-items:center;gap:5px;color:#66746b;font-size:11px}.registration-kit-preview i{width:13px;height:13px;border:1px solid #cbd5ce;border-radius:2px}
.import-toolbar>.import-toolbar-actions{flex-direction:row;align-items:center;gap:10px}
.staff-table-wrap :deep(.el-upload),.player-table-wrap :deep(.el-upload){display:block;width:36px}
.registration-importer :deep(.person-photo-button){display:grid;width:36px;height:44px;padding:0;place-items:center;overflow:hidden;border:1px dashed #b8c9bd;background:#f7faf8;color:#21814e;cursor:pointer}
.registration-importer :deep(.person-photo-button img){display:block;width:100%;height:100%;object-fit:cover}
.registration-importer :deep(.person-photo-button span){font-size:10px}
@media(max-width:720px){.import-toolbar>.import-toolbar-actions{width:100%;flex-wrap:wrap}}
.roster-scroll{min-width:0;max-width:100%;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;border:1px solid #e1e7e3;background:#fff}
.roster-table{width:max(100%,var(--roster-min));min-width:var(--roster-min);border-collapse:separate;border-spacing:0;table-layout:fixed;color:#314038;font-size:13px;overflow-wrap:normal;word-break:normal}
.staff-roster{--roster-min:1464px}
.player-roster{--roster-min:1346px}
.roster-table col.col-photo{width:72px}
.roster-table col.col-name{width:176px}
.roster-table col.col-role{width:124px}
.roster-table col.col-birth{width:118px}
.roster-table col.col-age{width:68px}
.roster-table col.col-native{width:180px}
.roster-table col.col-jersey{width:176px}
.roster-table col.col-identity{width:216px}
.roster-table col.col-number{width:84px}
.roster-table col.col-phone{width:122px}
.roster-table col.col-position{width:128px}
.roster-table col.col-status{width:128px}
.roster-table th,.roster-table td{box-sizing:border-box;padding:10px 12px;border-bottom:1px solid #edf1ee;background:#fff;text-align:left;vertical-align:middle;overflow-wrap:normal;word-break:normal}
.roster-table th{height:40px;padding-top:8px;padding-bottom:8px;color:#526159;background:#f5f8f6;font-size:12px;font-weight:600;white-space:nowrap}
.roster-table tr:last-child td{border-bottom:0}
.roster-table tr.invalid td{background:#fff7f6}
.roster-table th:last-child,.roster-table td:last-child{position:sticky;right:0;z-index:2;box-shadow:-8px 0 8px -8px rgba(28,52,36,.18)}
.roster-table th:last-child{z-index:3;background:#f5f8f6}
.roster-table :deep(.el-input),.roster-table :deep(.el-select){width:100%;max-width:100%}
.roster-table :deep(.el-input__wrapper),.roster-table :deep(.el-select__wrapper){width:100%;min-height:32px;box-sizing:border-box}
.native-place{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;white-space:normal;color:#3d4c43;font-size:13px;line-height:1.4}
.identity-stack{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:0}
.identity-number{color:#314038;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.3;white-space:nowrap}
.identity-note{color:#6d7c73;font-size:11px;line-height:1.2}
.person-photo-button.is-empty{border-style:solid;color:#96a69c;background:#f2f5f3}.photo-placeholder{font-size:24px}
:global(.team-import-dialog.el-dialog){max-width:calc(100vw - 32px)}
:global(.team-import-dialog .el-dialog__body){min-width:0}

.import-blockers{margin-bottom:14px;padding:12px 14px;background:#fff4f2;color:#b33a32;font-size:13px}.import-blockers ul{margin:8px 0 0;padding-left:18px;max-height:180px;overflow:auto}.import-blockers li{line-height:26px}.import-blockers li .el-button{margin-left:10px}.import-footer .import-footer-status{display:flex;flex:1;min-width:0;align-items:center;gap:10px}.blocking-reason{color:#b33a32!important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.native-place{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#526159;font-size:12px}
.identity-cell{display:flex;flex-wrap:wrap;align-items:center;gap:2px 6px;min-width:0}
.identity-cell .el-input{flex:1 0 100%;width:100%}
.identity-cell .el-button{padding:0;font-size:11px}
.identity-type-tag{margin-right:2px}
.issue-cell{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;min-width:0}
.ignore-all-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-top:6px;color:#8a6d3b}
.ignore-all-row span{font-size:12px}
.table-scroll-shell{position:relative;display:grid;grid-template-columns:36px minmax(0,1fr) 36px;gap:6px;align-items:stretch}
.scroll-hand{display:grid;place-items:center;width:36px;padding:0;border:1px solid #c9d6ce;border-radius:999px;background:#f4f8f5;color:#1f7a49;cursor:pointer;align-self:center;height:64px;box-shadow:0 1px 2px rgba(16,64,36,.08)}
.scroll-hand:hover{background:#e7f4ec;border-color:#9fbfab}
.scroll-hand-icon{display:grid;place-items:center;width:22px;height:22px}
.row-actions{display:inline-flex;flex-direction:row;flex-wrap:nowrap;align-items:center;justify-content:center;gap:10px;width:100%}
.row-actions :deep(.el-button){margin:0;padding:0;height:auto;min-height:0;font-size:12px;line-height:1.2}
</style>
