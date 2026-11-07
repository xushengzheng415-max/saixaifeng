<template>
  <div class="formation-templates">
    <header class="page-head">
      <div class="head-text">
        <h2>阵型模板</h2>
        <p>
          唯一真源 <code>shared/formation-templates.json</code>。坐标口径：
          <b>x</b> = 本方半场纵深（0 = 本方球门线，100 = 中线），<b>y</b> = 横向（0 = 左边线，100 = 右边线）。
          横版主队 left = x/2、top = y；竖版 left = y、top = 100 - x；客队不做镜像。
        </p>
      </div>
      <div class="head-actions">
        <el-button v-if="canEdit" type="primary" @click="openCreate">新建阵型</el-button>
        <el-button v-if="canEdit" :loading="seeding" @click="seedBuiltin">初始化内置模板</el-button>
        <el-button :loading="loading" @click="reload">刷新</el-button>
      </div>
    </header>

    <el-alert
      v-if="!canEdit"
      class="readonly-tip"
      type="info"
      :closable="false"
      title="当前账号只能查看已发布阵型；编辑、发布与版本回查仅平台运营可用。"
    />

    <div class="workspace">
      <aside class="format-panel">
        <el-radio-group v-model="activeSize" size="small" class="format-tabs">
          <el-radio-button v-for="format in formats" :key="format.size" :value="format.size">
            {{ format.label }}
          </el-radio-button>
        </el-radio-group>
        <div class="format-note">{{ currentFormat ? currentFormat.description : '' }}</div>
        <ul class="template-list">
          <li
            v-for="item in currentFormat ? currentFormat.templates : []"
            :key="item.templateKey"
            :class="['template-item', { active: item.templateKey === selectedKey }]"
            @click="selectTemplate(item)"
          >
            <div class="template-item-main">
              <span class="template-code">{{ item.code }}</span>
              <span class="template-name">{{ item.name }}</span>
            </div>
            <div class="template-item-tags">
              <el-tag size="small" effect="plain">v{{ item.version }}</el-tag>
              <el-tag v-if="item.hasDraft" size="small" type="warning">草稿</el-tag>
              <el-tag v-if="item.retired" size="small" type="info">已停用</el-tag>
              <el-tag v-else-if="item.source === 'builtin'" size="small" type="success">内置</el-tag>
            </div>
          </li>
        </ul>
      </aside>

      <section v-if="detail" class="editor-panel">
        <div class="editor-head">
          <div class="editor-title">
            <h3>
              {{ detail.template.code }}
              <el-tag size="small" effect="plain">v{{ detail.template.version }}</el-tag>
              <el-tag v-if="detail.template.draft" size="small" type="warning">有未发布草稿</el-tag>
              <el-tag v-if="detail.template.retired" size="small" type="info">已停用（只读回看）</el-tag>
            </h3>
            <el-input v-model="workName" class="name-input" maxlength="40" :disabled="readOnly" placeholder="阵型名称" @input="markDirty" />
            <el-input v-model="workDescription" class="desc-input" maxlength="200" :disabled="readOnly" placeholder="阵型说明（可选）" @input="markDirty" />
          </div>
          <div class="editor-actions">
            <el-button :disabled="!canEdit || readOnly || !dirty" :loading="saving" @click="saveDraft">保存草稿</el-button>
            <el-button v-if="canEdit && !readOnly" type="primary" :disabled="!hasDraft" :loading="publishing" @click="publishDraft">发布</el-button>
            <el-button v-if="canEdit && !readOnly && !detail.template.retired" type="danger" plain :loading="archiving" @click="archiveTemplate">归档</el-button>
            <el-button @click="openExport">导出坐标</el-button>
            <el-button :loading="versionsLoading" @click="openVersions">历史版本</el-button>
          </div>
        </div>

        <div class="preview-grid">
          <div class="preview-card">
            <div class="preview-title">横版 · 本方半场（可拖动）</div>
            <div class="pitch-landscape" :style="{ backgroundImage: `url(${fieldBgImage})` }">
              <div class="field-boundary">
                <div class="half-field">
                  <span
                    v-for="(slot, index) in workSlots"
                    :key="slot.role"
                    :class="['slot-marker', { dragging: dragIndex === index }]"
                    :style="{ left: `${slot.x}%`, top: `${slot.y}%` }"
                    @pointerdown="startDrag(index, $event)"
                  >
                    <b>{{ slot.role }}</b>
                    <em>{{ slot.label }}</em>
                  </span>
                </div>
                <div class="center-line" />
              </div>
            </div>
          </div>
          <div class="preview-card">
            <div class="preview-title">竖版 · 手机端同源渲染</div>
            <div class="pitch-portrait">
              <div class="portrait-halfway" />
              <div class="portrait-box" />
              <span
                v-for="slot in workSlots"
                :key="`portrait-${slot.role}`"
                class="slot-marker portrait-marker"
                :style="portraitStyle(slot)"
              >
                <b>{{ slot.role }}</b>
              </span>
            </div>
          </div>
        </div>

        <el-table :data="workSlots" size="small" class="slot-table" :row-class-name="slotRowClass">
          <el-table-column label="#" width="52">
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column label="角色码" width="90" prop="role" />
          <el-table-column label="提交角色" width="90">
            <template #default="{ row }">{{ slotRoleOf(row.role) }}</template>
          </el-table-column>
          <el-table-column label="位置名称" min-width="140">
            <template #default="{ row }">
              <el-input v-model="row.label" size="small" maxlength="20" :disabled="readOnly" @input="markDirty" />
            </template>
          </el-table-column>
          <el-table-column label="x（纵深 %）" width="150">
            <template #default="{ row }">
              <el-input-number v-model="row.x" size="small" :min="0" :max="100" :step="0.5" :precision="2" :disabled="readOnly" @change="markDirty" />
            </template>
          </el-table-column>
          <el-table-column label="y（横向 %）" width="150">
            <template #default="{ row }">
              <el-input-number v-model="row.y" size="small" :min="0" :max="100" :step="0.5" :precision="2" :disabled="readOnly" @change="markDirty" />
            </template>
          </el-table-column>
        </el-table>
        <div class="slot-foot">
          <span>点位 {{ workSlots.length }} 个 / 应为 {{ detail.template.playersOnField }} 个</span>
          <span>提交角色由角色码派生，`starters[].slotPosition` 依赖该顺序，不可随意调整点位顺序。</span>
        </div>
      </section>

      <section v-else class="editor-panel empty-panel">
        <el-empty description="从左侧选择一个阵型开始查看或编辑" />
      </section>
    </div>

    <el-dialog v-model="createVisible" title="新建阵型" width="460px">
      <el-form label-width="96px">
        <el-form-item label="人数制">
          <el-select v-model="createForm.size" :disabled="true">
            <el-option v-for="format in formats" :key="format.size" :label="format.label" :value="format.size" />
          </el-select>
        </el-form-item>
        <el-form-item label="阵型编号">
          <el-input v-model.trim="createForm.code" placeholder="例如 3-2-3，各行之和须等于人数 - 1" maxlength="20" />
        </el-form-item>
        <el-form-item label="阵型名称">
          <el-input v-model.trim="createForm.name" placeholder="例如 3-2-3 (边路进攻)" maxlength="40" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model.trim="createForm.description" type="textarea" :rows="2" maxlength="200" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="confirmCreate">按编号生成点位</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="versionsVisible" title="历史版本" size="420px">
      <el-empty v-if="!versions.length" description="暂无历史版本（内置 v1 不单独存档）" :image-size="60" />
      <ul v-else class="version-list">
        <li v-for="item in versions" :key="item.version" class="version-item">
          <div class="version-main">
            <b>v{{ item.version }}</b>
            <span>{{ item.name }}</span>
          </div>
          <div class="version-meta">
            <span>{{ formatTime(item.publishedAt) }} · {{ item.publishedBy || '未知' }} · {{ item.slotCount }} 个点位</span>
          </div>
          <el-button v-if="canEdit && !readOnly" size="small" @click="restoreVersion(item)">另存为新版本草稿</el-button>
        </li>
      </ul>
    </el-drawer>

    <el-dialog v-model="exportVisible" title="导出坐标" width="760px" top="6vh">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="纯前端生成，不写库、不改任何数据。把下面任意一段发给助手即可生效。"
        description="助手命令：node tools/apply-formation-coordinates.mjs coords.json"
      />
      <div class="export-block">
        <div class="export-block-head">
          <b>① 点位清单（含阵型 ID，纯文本表格，人眼核对用）</b>
          <el-button size="small" @click="copyExport('table')">复制</el-button>
        </div>
        <pre class="export-pre">{{ exportParts.table }}</pre>
      </div>
      <div class="export-block">
        <div class="export-block-head">
          <b>② 种子片段（与 shared/formation-templates.json 同构，可直接替换）</b>
          <el-button size="small" @click="copyExport('json')">复制</el-button>
        </div>
        <pre class="export-pre">{{ exportParts.json }}</pre>
      </div>
      <template #footer>
        <el-button @click="exportVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import fieldBgImage from '@/assets/images/football-field-dual.jpg'
import { callFunctionHTTP } from '@/utils/cloud'

const DF = new Set(['SW', 'LB', 'RB', 'CB', 'CB1', 'CB2', 'CB3', 'LWB', 'RWB', 'DF'])
const MF = new Set(['DM', 'CM', 'CM1', 'CM2', 'CM3', 'CM4', 'LM', 'RM', 'AM', 'MF'])
const ROLE_LABELS = {
  GK: '守门员',
  SW: '清道夫',
  LB: '左后卫',
  RB: '右后卫',
  CB1: '中后卫',
  CB2: '中后卫',
  CB3: '中后卫',
  CM: '中前卫',
  CM1: '左前卫',
  CM2: '中前卫',
  CM3: '右前卫',
  CM4: '前卫',
  LM: '左前卫',
  RM: '右前卫',
  DM: '后腰',
  AM: '前腰',
  FW: '前锋',
  FW1: '左前锋',
  FW2: '右前锋',
  FW3: '中锋'
}

const loading = ref(false)
const seeding = ref(false)
const saving = ref(false)
const publishing = ref(false)
const archiving = ref(false)
const creating = ref(false)
const versionsLoading = ref(false)
const canEdit = ref(false)
const formats = ref([])
const activeSize = ref(11)
const selectedKey = ref('')
const detail = ref(null)
const workSlots = ref([])
const workName = ref('')
const workDescription = ref('')
const dirty = ref(false)
const versions = ref([])
const versionsVisible = ref(false)
const createVisible = ref(false)
const createForm = ref({ size: 11, code: '', name: '', description: '' })
const dragIndex = ref(-1)
let dragRect = null

const currentFormat = computed(() => formats.value.find(item => item.size === activeSize.value) || null)
const readOnly = computed(() => Boolean(detail.value && (detail.value.template.retired || detail.value.template.status === 'archived')) || !canEdit.value)
const hasDraft = computed(() => Boolean(detail.value && detail.value.template.draft))
const exportVisible = ref(false)

// 中文按 2 个字符宽度对齐，避免纯文本表格在等宽字体下错位。
function textWidth(text) {
  let width = 0
  for (const char of String(text)) width += /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]/.test(char) ? 2 : 1
  return width
}

function padText(text, width) {
  const value = String(text)
  return value + ' '.repeat(Math.max(0, width - textWidth(value)))
}

// 导出只读当前编辑器里的点位（含尚未保存的拖动结果），不调用任何写接口。
const exportParts = computed(() => {
  if (!detail.value) return { table: '', json: '' }
  const size = detail.value.template.playersOnField
  const code = detail.value.template.code
  const status = detail.value.template.retired || detail.value.template.status === 'archived' ? 'retired' : 'active'
  const slots = workSlots.value.map(slot => ({
    role: String(slot.role || '').trim().toUpperCase(),
    label: String(slot.label || '').trim(),
    x: Number(slot.x),
    y: Number(slot.y)
  }))
  const rows = [
    ['#', 'role', 'label', 'x', 'y'],
    ...slots.map((slot, index) => [String(index + 1), slot.role, slot.label, String(slot.x), String(slot.y)])
  ]
  const widths = rows[0].map((_, column) => Math.max(...rows.map(row => textWidth(row[column]))))
  const table = [
    `阵型 ID：${size} / ${code}`,
    `阵型名称：${workName.value || code}`,
    `状态：${status === 'active' ? '启用' : '已停用'}    点位：${slots.length} 个 / 应为 ${size} 个`,
    '坐标：x = 本方半场纵深（0 = 本方球门线，100 = 中线），y = 横向（0 = 左边线，100 = 右边线）',
    '渲染：横版主队 left = x / 2、top = y；横版客队 left = 50 + x / 2、top = y；竖版 left = 5 + y * 0.9、top = 7 + (100 - x) * 0.86',
    '',
    rows.map(row => row.map((cell, column) => padText(cell, widths[column])).join('  ').trimEnd()).join('\n')
  ].join('\n')
  const json = [
    '{',
    `  "code": ${JSON.stringify(code)},`,
    `  "name": ${JSON.stringify(workName.value || code)},`,
    `  "description": ${JSON.stringify(workDescription.value || '')},`,
    `  "status": ${JSON.stringify(status)},`,
    '  "slotRoles": [',
    slots.map(slot => `    ${JSON.stringify(slotRoleOf(slot.role))}`).join(',\n'),
    '  ],',
    '  "positions": [',
    slots.map((slot, index) => `    ${JSON.stringify(slot)}${index === slots.length - 1 ? '' : ','}`).join('\n'),
    '  ]',
    '}'
  ].join('\n')
  return { table, json }
})

function openExport() {
  if (!detail.value) return
  exportVisible.value = true
}

async function copyExport(kind) {
  const text = exportParts.value[kind]
  if (!text) return
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      document.body.removeChild(area)
    }
    ElMessage.success('已复制')
  } catch (error) {
    ElMessage.error('复制失败，请手动选择文本复制')
  }
}

function slotRoleOf(role) {
  const code = String(role || '').trim().toUpperCase()
  if (code === 'GK') return 'GK'
  if (DF.has(code) || /^(CB|LB|RB|LWB|RWB|SW)/.test(code)) return 'DF'
  if (MF.has(code) || /^(DM|CM|LM|RM|AM)/.test(code)) return 'MF'
  return 'FW'
}

function formatTime(value) {
  if (!value) return '未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function markDirty() {
  dirty.value = true
}

// 与小程序 miniprogram/utils/lineup-layout.js 的 portraitStyle 保持一致：
// 先归一到线内矩形（左右 5%/90%、上下 7%/86%），再由横版坐标顺时针旋转 90°。
function portraitStyle(slot) {
  const left = 5 + Number(slot.y || 0) * 0.9
  const top = 7 + (100 - Number(slot.x || 0)) * 0.86
  return { left: `${left.toFixed(2)}%`, top: `${top.toFixed(2)}%` }
}

function cloneSlots(slots) {
  return (slots || []).map(slot => ({
    slotId: slot.slotId,
    role: slot.role,
    label: slot.label,
    x: Number(slot.x),
    y: Number(slot.y)
  }))
}

async function request(action, params) {
  const result = await callFunctionHTTP(action, params)
  if (!result || result.success !== true) {
    const error = new Error((result && result.error) || '请求失败')
    error.code = result && result.code
    throw error
  }
  return result
}

async function loadList() {
  loading.value = true
  try {
    const result = await request('listFormationTemplates', {})
    formats.value = result.formats || []
    canEdit.value = result.canEdit === true
    if (!formats.value.some(item => item.size === activeSize.value) && formats.value.length) activeSize.value = formats.value[0].size
  } catch (error) {
    ElMessage.error(error.message || '阵型模板读取失败')
  } finally {
    loading.value = false
  }
}

async function loadDetail(key) {
  const template = findTemplate(key)
  if (!template) return
  try {
    const result = await request('getFormationTemplate', { playersOnField: template.playersOnField, formation: template.code })
    detail.value = result
    const source = result.template.draft || result.template
    workSlots.value = cloneSlots(source.slots)
    workName.value = source.name || result.template.name
    workDescription.value = source.description || ''
    dirty.value = false
  } catch (error) {
    ElMessage.error(error.message || '阵型详情读取失败')
  }
}

function findTemplate(key) {
  for (const format of formats.value) {
    const hit = (format.templates || []).find(item => item.templateKey === key)
    if (hit) return hit
  }
  return null
}

async function selectTemplate(item) {
  if (item.templateKey === selectedKey.value) return
  if (dirty.value) {
    try {
      await ElMessageBox.confirm('当前阵型有未保存的点位修改，切换后将丢弃。是否继续？', '未保存修改', { type: 'warning' })
    } catch (error) {
      return
    }
  }
  selectedKey.value = item.templateKey
  await loadDetail(item.templateKey)
}

async function reload() {
  await loadList()
  if (selectedKey.value) await loadDetail(selectedKey.value)
}

async function saveDraft() {
  if (!detail.value) return
  saving.value = true
  try {
    const payload = {
      playersOnField: detail.value.template.playersOnField,
      formation: detail.value.template.code,
      name: workName.value,
      description: workDescription.value,
      slots: workSlots.value
    }
    await request('saveFormationTemplateDraft', payload)
    ElMessage.success('草稿已保存')
    await loadList()
    await loadDetail(selectedKey.value)
  } catch (error) {
    ElMessage.error(error.message || '草稿保存失败')
  } finally {
    saving.value = false
  }
}

async function publishDraft() {
  if (!detail.value) return
  try {
    await ElMessageBox.confirm(
      `发布后立即成为各端读取的正式版本，版本号将变为 v${detail.value.template.version + 1}。是否发布？`,
      '发布阵型模板',
      { type: 'warning' }
    )
  } catch (error) {
    return
  }
  publishing.value = true
  try {
    await request('publishFormationTemplate', {
      playersOnField: detail.value.template.playersOnField,
      formation: detail.value.template.code
    })
    ElMessage.success('已发布')
    await loadList()
    await loadDetail(selectedKey.value)
  } catch (error) {
    ElMessage.error(error.message || '发布失败')
  } finally {
    publishing.value = false
  }
}

async function archiveTemplate() {
  if (!detail.value) return
  try {
    await ElMessageBox.confirm('归档后该阵型不可再编辑或发布，已保存的历史名单仍可回看。是否归档？', '归档阵型', { type: 'warning' })
  } catch (error) {
    return
  }
  archiving.value = true
  try {
    await request('archiveFormationTemplate', {
      playersOnField: detail.value.template.playersOnField,
      formation: detail.value.template.code
    })
    ElMessage.success('已归档')
    await reload()
  } catch (error) {
    ElMessage.error(error.message || '归档失败')
  } finally {
    archiving.value = false
  }
}

async function seedBuiltin() {
  seeding.value = true
  try {
    const preview = await request('seedFormationTemplates', { confirm: false })
    const planned = preview.planned || []
    if (!planned.length) {
      ElMessage.success('内置阵型已全部存在于集合，无需初始化')
      return
    }
    await ElMessageBox.confirm(
      `将把 ${planned.length} 个内置阵型写入 formation_templates 集合（含已停用的 4-5-1，标记为 archived）。是否继续？`,
      '初始化内置模板',
      { type: 'warning' }
    )
    const result = await request('seedFormationTemplates', { confirm: true })
    ElMessage.success(`已写入 ${result.written} 个内置阵型`)
    await reload()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '初始化失败')
  } finally {
    seeding.value = false
  }
}

async function openVersions() {
  if (!detail.value) return
  versionsVisible.value = true
  versionsLoading.value = true
  try {
    const result = await request('listFormationTemplateVersions', {
      playersOnField: detail.value.template.playersOnField,
      formation: detail.value.template.code
    })
    versions.value = result.versions || []
  } catch (error) {
    ElMessage.error(error.message || '历史版本读取失败')
  } finally {
    versionsLoading.value = false
  }
}

async function restoreVersion(item) {
  if (!detail.value) return
  try {
    await ElMessageBox.confirm(`将 v${item.version} 的点位另存为当前草稿，之后需要重新发布才会生效。是否继续？`, '另存为新版本', { type: 'warning' })
  } catch (error) {
    return
  }
  try {
    await request('restoreFormationTemplateVersion', {
      playersOnField: detail.value.template.playersOnField,
      formation: detail.value.template.code,
      version: item.version
    })
    ElMessage.success('已另存为草稿')
    await loadList()
    await loadDetail(selectedKey.value)
  } catch (error) {
    ElMessage.error(error.message || '另存失败')
  }
}

function openCreate() {
  createForm.value = { size: activeSize.value, code: '', name: '', description: '' }
  createVisible.value = true
}

function buildPositions(size, code) {
  const rows = String(code).split('-').map(Number)
  if (rows.some(row => !Number.isInteger(row) || row <= 0) || rows.reduce((sum, row) => sum + row, 0) + 1 !== size) {
    throw new Error(`阵型编号与 ${size} 人制不匹配，各行之和应为 ${size - 1}`)
  }
  const positions = [{ role: 'GK', label: '守门员', x: 10, y: 50 }]
  const counters = { CB: 0, CM: 0, FW: 0 }
  const nextRole = prefix => {
    counters[prefix] += 1
    return `${prefix}${counters[prefix]}`
  }
  const rowRoles = (count, rowIndex) => {
    const isLast = rowIndex === rows.length - 1
    const isFirst = rowIndex === 0 && rows.length > 1
    if (isFirst) {
      if (count === 1) return ['SW']
      if (count === 4) return ['LB', nextRole('CB'), nextRole('CB'), 'RB']
      if (count === 5) return ['LB', nextRole('CB'), nextRole('CB'), nextRole('CB'), 'RB']
      return Array.from({ length: count }, () => nextRole('CB'))
    }
    if (isLast) return count === 1 ? ['FW'] : Array.from({ length: count }, () => nextRole('FW'))
    return Array.from({ length: count }, () => nextRole('CM'))
  }
  const xOf = index => (rows.length === 1 ? 55 : Math.round((30 + (50 * index) / (rows.length - 1)) * 100) / 100)
  rows.forEach((count, rowIndex) => {
    const x = xOf(rowIndex)
    rowRoles(count, rowIndex).forEach((role, index) => {
      const y = Math.round((100 * (index + 0.5) / count) * 100) / 100
      positions.push({ role, label: ROLE_LABELS[role] || '球员', x, y })
    })
  })
  return positions
}

async function confirmCreate() {
  const { size, code, name, description } = createForm.value
  if (!name) {
    ElMessage.warning('请填写阵型名称')
    return
  }
  let slots
  try {
    slots = buildPositions(size, code)
  } catch (error) {
    ElMessage.error(error.message)
    return
  }
  creating.value = true
  try {
    await request('saveFormationTemplateDraft', { playersOnField: size, formation: code, name, description, slots })
    ElMessage.success('阵型草稿已创建，确认点位后请发布')
    createVisible.value = false
    activeSize.value = size
    await loadList()
    selectedKey.value = `${size}-${code}`
    await loadDetail(selectedKey.value)
  } catch (error) {
    ElMessage.error(error.message || '创建失败')
  } finally {
    creating.value = false
  }
}

function startDrag(index, event) {
  if (readOnly.value) return
  const target = event.currentTarget
  const host = target && target.parentElement
  if (!host) return
  dragRect = host.getBoundingClientRect()
  dragIndex.value = index
  event.preventDefault()
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', stopDrag)
  window.addEventListener('pointercancel', stopDrag)
}

function onDragMove(event) {
  if (dragIndex.value < 0 || !dragRect) return
  const slot = workSlots.value[dragIndex.value]
  if (!slot) return
  const x = ((event.clientX - dragRect.left) / dragRect.width) * 100
  const y = ((event.clientY - dragRect.top) / dragRect.height) * 100
  slot.x = Math.round(Math.min(100, Math.max(0, x)) * 100) / 100
  slot.y = Math.round(Math.min(100, Math.max(0, y)) * 100) / 100
  dirty.value = true
}

function stopDrag() {
  dragIndex.value = -1
  dragRect = null
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointercancel', stopDrag)
}

function slotRowClass({ row }) {
  return row.role === 'GK' ? 'goalkeeper-row' : ''
}

onMounted(async () => {
  await loadList()
  const first = currentFormat.value && currentFormat.value.templates[0]
  if (first) {
    selectedKey.value = first.templateKey
    await loadDetail(first.templateKey)
  }
})
</script>

<style scoped>
.formation-templates {
  padding: 18px 22px 26px;
  color: #1f2d3d;
}

.page-head {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
  margin-bottom: 12px;
}

.head-text h2 {
  margin: 0 0 6px;
  font-size: 20px;
}

.head-text p {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: #667085;
  max-width: 880px;
}

.head-text code {
  padding: 1px 5px;
  border-radius: 4px;
  background: #eef2f7;
  font-size: 11px;
}

.head-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.readonly-tip {
  margin-bottom: 12px;
}

.workspace {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.format-panel {
  border: 1px solid #e4e7ed;
  border-radius: 10px;
  padding: 12px;
  background: #fff;
}

.format-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.format-note {
  margin: 10px 0;
  font-size: 12px;
  line-height: 1.6;
  color: #8a94a6;
  min-height: 34px;
}

.template-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 560px;
  overflow-y: auto;
}

.template-item {
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.15s ease;
}

.template-item:hover {
  background: #f5f7fa;
}

.template-item.active {
  background: #eef5ff;
  border-color: #c6ddff;
}

.template-item-main {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 13px;
}

.template-code {
  font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.template-name {
  color: #5a6478;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-item-tags {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}

.editor-panel {
  border: 1px solid #e4e7ed;
  border-radius: 10px;
  padding: 14px;
  background: #fff;
  min-height: 420px;
}

.empty-panel {
  display: flex;
  align-items: center;
  justify-content: center;
}

.editor-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 12px;
}

.editor-title h3 {
  margin: 0 0 8px;
  font-size: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.name-input {
  max-width: 320px;
  margin-bottom: 6px;
}

.desc-input {
  max-width: 520px;
}

.editor-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.preview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 14px;
  margin-bottom: 14px;
}

.preview-card {
  border: 1px solid #eef0f4;
  border-radius: 8px;
  padding: 8px;
}

.preview-title {
  font-size: 12px;
  color: #667085;
  margin-bottom: 6px;
}

.pitch-landscape {
  position: relative;
  width: 100%;
  aspect-ratio: 2560 / 1100;
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  border-radius: 6px;
  background-color: #1f6b46;
  touch-action: none;
}

.field-boundary {
  position: absolute;
  left: 7%;
  top: 5%;
  width: 86%;
  height: 90%;
}

.half-field {
  position: absolute;
  left: 0;
  top: 0;
  width: 50%;
  height: 100%;
  touch-action: none;
}

.center-line {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  border-left: 1px dashed rgba(255, 255, 255, 0.55);
}

.slot-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  min-width: 44px;
  border-radius: 8px;
  background: rgba(15, 42, 30, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.6);
  color: #fff;
  font-size: 10px;
  line-height: 1.15;
  cursor: grab;
  user-select: none;
}

.slot-marker b {
  font-size: 11px;
}

.slot-marker em {
  font-style: normal;
  color: #d8f5e4;
  white-space: nowrap;
}

.slot-marker.dragging {
  cursor: grabbing;
  box-shadow: 0 0 0 2px #409eff;
}

.pitch-portrait {
  position: relative;
  width: 100%;
  aspect-ratio: 1100 / 1280;
  max-height: 420px;
  margin: 0 auto;
  border-radius: 6px;
  background: linear-gradient(180deg, #1f6b46, #17583a);
  border: 1px solid rgba(255, 255, 255, 0.5);
  overflow: hidden;
}

/* 中线在本方半场的最上沿（x = 100），与小程序竖版归一矩形一致。 */
.portrait-halfway {
  position: absolute;
  left: 0;
  right: 0;
  top: 7%;
  border-top: 1px dashed rgba(255, 255, 255, 0.5);
}

.portrait-box {
  position: absolute;
  left: 26%;
  right: 26%;
  bottom: 7%;
  height: 14%;
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-bottom: none;
}

.portrait-marker {
  min-width: 30px;
  padding: 2px 3px;
  background: rgba(10, 30, 20, 0.8);
}

.slot-foot {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  font-size: 12px;
  color: #8a94a6;
}

.version-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.version-item {
  border-bottom: 1px solid #f0f2f5;
  padding: 10px 0;
  display: grid;
  gap: 4px;
}

.version-main {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 13px;
}

.version-meta {
  font-size: 12px;
  color: #8a94a6;
}

.export-block {
  margin-top: 14px;
}

.export-block-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
  font-size: 13px;
  color: #1f2d3d;
}

.export-pre {
  margin: 0;
  padding: 10px 12px;
  max-height: 260px;
  overflow: auto;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #f8fafc;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #24303f;
  white-space: pre;
}

:deep(.goalkeeper-row) {
  background: #f7fbff;
}
</style>
