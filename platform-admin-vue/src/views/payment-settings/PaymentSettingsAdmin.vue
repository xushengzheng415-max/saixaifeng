<template>
  <section class="pay-settings">
    <div class="pay-settings__toolbar">
      <el-button :loading="loading" @click="refresh">刷新体检</el-button>
      <span class="pay-settings__source">
        数据源：云函数加密配置（AES-256-GCM，主密钥只在云函数环境变量）+ 环境变量回退；体检只回状态、来源与脱敏指纹
      </span>
    </div>

    <div v-if="error" class="pay-settings__error" role="alert">
      {{ error }} <el-button link @click="refresh">重试</el-button>
    </div>

    <template v-else>
      <div class="pay-settings__stat-grid">
        <article class="pay-settings__stat" :class="{ 'pay-settings__stat--bad': !status.ready }">
          <small>支付配置是否就绪</small>
          <strong>{{ status.ready ? '已就绪' : '未就绪' }}</strong>
          <span>{{ status.ready ? '商户号、证书、密钥、AppID、回调地址均已配置' : missingText }}</span>
        </article>
        <article class="pay-settings__stat" :class="{ 'pay-settings__stat--bad': !status.rechargeAvailable }">
          <small>蜂蜜充值是否对用户开放</small>
          <strong>{{ status.rechargeAvailable ? '已开放' : '未开放' }}</strong>
          <span>{{ status.rechargeAvailable ? '档位已配置，用户可在服务号 H5 选择档位支付' : (status.rechargeError || '等待配置') }}</span>
        </article>
        <article class="pay-settings__stat">
          <small>回调验签模式</small>
          <strong>{{ modeText }}</strong>
          <span>{{ status.notifyUrl || '—' }}</span>
        </article>
        <article class="pay-settings__stat" :class="{ 'pay-settings__stat--bad': !secretStore.kekReady }">
          <small>凭据存放</small>
          <strong>{{ secretStore.savedCount }} 项已加密入库</strong>
          <span>{{ secretStore.kekReady ? '主密钥已配置 · 指纹 ' + (secretStore.kekFingerprint || '—') : '主密钥 PAYMENT_SECRET_KEK 未配置，暂不能写入' }}</span>
        </article>
      </div>

      <p v-if="status.checkedAt" class="pay-settings__hint">
        体检时间：{{ formatTime(status.checkedAt) }}（云函数各实例最长缓存 60 秒，保存后本页立即刷新）
      </p>

      <div v-if="!secretStore.kekReady" class="pay-settings__notice">
        <strong>先完成一次性初始化：</strong>
        在云开发控制台 → 云函数 <span class="pay-settings__mono">webLoginApi</span> → 函数配置 → 环境变量，新增
        <span class="pay-settings__mono">PAYMENT_SECRET_KEK</span>（不少于 16 位的随机字符串，只配这一次）。
        之后本页即可保存全部支付配置；主密钥不配，任何写入都会被服务端拒绝。
      </div>
      <div v-else-if="secretStore.savedCount > 0 && secretStore.decryptableCount < secretStore.savedCount" class="pay-settings__notice pay-settings__notice--warn">
        <strong>库内密文与当前主密钥不匹配：</strong>
        已保存 {{ secretStore.savedCount }} 项，只有 {{ secretStore.decryptableCount }} 项能解开。
        很可能是 PAYMENT_SECRET_KEK 被改过，请在下方逐项重新填写覆盖，不要改回旧密钥前先确认现有配置来源。
      </div>

      <section class="pay-settings__block">
        <h2>写入支付配置 <small>加密保存 · 页面不留明文 · 留空表示不修改</small></h2>
        <div class="pay-settings__form">
          <label v-for="field in secretFields" :key="field.key" class="pay-settings__form-row">
            <span class="pay-settings__form-label">
              {{ field.label }}
              <span class="pay-settings__mono">{{ field.key }}</span>
              <em v-if="savedHint(field.key)" class="pay-settings__saved">{{ savedHint(field.key) }}</em>
            </span>
            <el-input
              v-if="field.type === 'textarea'"
              v-model="form[field.key]"
              type="textarea"
              :rows="field.key === 'HONEY_TOPUP_PACKS' ? 4 : 3"
              :placeholder="field.placeholder"
              spellcheck="false"
            />
            <el-input
              v-else
              v-model.trim="form[field.key]"
              :placeholder="field.placeholder"
              spellcheck="false"
              :maxlength="field.maxlength || 128"
            />
            <span class="pay-settings__field-note">
              {{ field.note }}
              <el-button v-if="field.key === 'WXPAY_APIV3_KEY' && generatedKey" link type="primary" @click="form.WXPAY_APIV3_KEY = generatedKey">填入本页生成的密钥</el-button>
              <el-button v-if="field.key === 'HONEY_TOPUP_PACKS'" link type="primary" @click="form.HONEY_TOPUP_PACKS = confirmedPacksPretty">填入已确认 5 档</el-button>
            </span>
          </label>
        </div>
        <div class="pay-settings__actions">
          <el-button type="primary" :loading="saving" @click="saveSecrets">加密保存</el-button>
          <el-button :loading="clearing" :disabled="!secretStore.savedCount" @click="clearSecrets(null, '全部库内配置')">清除全部库内配置</el-button>
          <span class="pay-settings__hint">
            服务端会先校验格式再加密；私钥/公钥换行可整段粘贴，或写成 <span class="pay-settings__mono">\n</span>。
            保存后如需更换，重新填写该项再保存即可覆盖。
          </span>
        </div>
      </section>

      <section class="pay-settings__block">
        <h2>配置体检 <small>{{ okCount }} / {{ items.length }} 项正常</small></h2>
        <el-table :data="items" row-key="key" size="small">
          <el-table-column label="配置项" min-width="200">
            <template #default="{ row }">
              <div class="pay-settings__item">
                <strong>{{ row.label }}</strong>
                <span class="pay-settings__mono">{{ row.key }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="来源" width="130">
            <template #default="{ row }">
              <el-tag :type="sourceTagType(row.source)" size="small">{{ sourceText(row.source) }}</el-tag>
              <el-button v-if="row.source === 'db'" link type="danger" @click="clearSecrets([row.key], row.label)">清除</el-button>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="statusTagType(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="当前值（脱敏）" min-width="230">
            <template #default="{ row }">
              <span class="pay-settings__mono">{{ row.masked || '未配置' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="说明" min-width="260">
            <template #default="{ row }">
              <span class="pay-settings__note">{{ row.note }}</span>
            </template>
          </el-table-column>
        </el-table>
        <p class="pay-settings__hint">
          本次缺少的配置项：{{ status.missing && status.missing.length ? status.missing.join('、') : '无' }}。
          「加密存储」表示值来自本页保存的密文，「环境变量」表示仍在用云函数环境变量（迁移期可两处并存）。
        </p>
      </section>

      <section class="pay-settings__block">
        <h2>
          充值档位 <small>只读核对</small>
          <el-tag class="pay-settings__head-tag" :type="packs.confirmed ? 'success' : 'warning'" size="small">
            {{ packs.confirmed ? '与已确认 5 档一致' : '与已确认 5 档不一致' }}
          </el-tag>
        </h2>
        <div v-if="packs.list && packs.list.length" class="pay-settings__chips">
          <span v-for="pack in packs.list" :key="pack.id" class="pay-settings__chip">
            {{ pack.priceYuan }} 元 → {{ pack.drops }} 滴
          </span>
        </div>
        <p v-else class="pay-settings__hint pay-settings__hint--warn">
          线上一个档位都没有生效，用户暂时无法充值。原因：{{ packs.reason || '未配置' }}（{{ status.rechargeError || '档位待配置' }}）
        </p>
        <p v-if="packs.list && packs.list.length && !packs.confirmed" class="pay-settings__hint pay-settings__hint--warn">
          {{ packDiffText }}
        </p>
        <p class="pay-settings__hint">
          已确认档位：1 / 5 / 10 / 50 / 100 元 → 10 / 50 / 100 / 500 / 1000 滴（1 元 = 10 滴，不赠送滴数）。
          档位改由服务端校验（滴数必须等于金额 × 10、不允许赠滴），变更档位口径仍需产品负责人确认。
        </p>
        <div class="pay-settings__actions">
          <el-button size="small" @click="copyText(confirmedPacksJson, '已复制已确认档位 JSON')">复制已确认档位 JSON</el-button>
          <el-button size="small" @click="form.HONEY_TOPUP_PACKS = confirmedPacksPretty">填入上方表单</el-button>
        </div>
      </section>

      <section class="pay-settings__block">
        <h2>APIv3 密钥生成器 <small>仅在本页生成，不保存</small></h2>
        <p class="pay-settings__hint">
          微信支付商户平台的 APIv3 密钥只能设置一次且只显示一次。先在商户平台点「设置 APIv3 密钥」，
          用本页生成的 32 位密钥填入商户平台，再把同一串填进上方「APIv3 密钥」并保存。
          本页不会保存、也不会上传这串密钥；离开或刷新页面后就再也看不到。
        </p>
        <div class="pay-settings__generator">
          <el-button type="primary" :disabled="generatedKey !== ''" @click="generateKey">生成 32 位 APIv3 密钥</el-button>
          <el-button :disabled="!generatedKey" @click="copyText(generatedKey, '已复制 APIv3 密钥，请立刻填入商户平台并保存到本页')">复制密钥</el-button>
          <el-button :disabled="!generatedKey" @click="form.WXPAY_APIV3_KEY = generatedKey">填入上方表单</el-button>
          <el-button :disabled="!generatedKey" @click="clearKey">清除显示</el-button>
        </div>
        <div v-if="generatedKey" class="pay-settings__key">
          <span class="pay-settings__mono pay-settings__key-text">{{ generatedKey }}</span>
          <span class="pay-settings__hint">长度 {{ generatedKey.length }}；已排除 0/O/o/1/I/l 等易混字符</span>
        </div>
        <div class="pay-settings__checker">
          <el-input
            v-model.trim="keyToCheck"
            maxlength="64"
            clearable
            placeholder="可选：粘贴已有密钥，核对长度与字符集"
            style="max-width:420px"
          />
          <el-tag :type="keyCheck.type" size="small">{{ keyCheck.text }}</el-tag>
        </div>
      </section>

      <section class="pay-settings__block">
        <h2>微信侧还需要单独完成的事 <small>商户平台 / 微信公众平台</small></h2>
        <ol class="pay-settings__steps">
          <li>
            <strong>服务号与商户号关联</strong>
            <span>在商户平台「产品中心 → AppID 账号管理」把服务号 AppID 关联到商户号，并确认状态为已关联。</span>
          </li>
          <li>
            <strong>JSAPI 支付授权目录</strong>
            <span>在商户平台「产品中心 → 开发配置 → JSAPI 支付」把授权目录设为</span>
            <span class="pay-settings__mono">{{ jsapiDir }}</span>
            <el-button link type="primary" @click="copyText(jsapiDir, '已复制 JSAPI 授权目录')">复制</el-button>
          </li>
          <li>
            <strong>支付回调 HTTP 路径</strong>
            <span>云开发「HTTP 访问服务」需把 <span class="pay-settings__mono">/honeyPayNotify</span> 映射到 webLoginApi，最终回调地址是</span>
            <span class="pay-settings__mono">{{ status.notifyUrl || defaultNotifyUrl }}</span>
            <el-button link type="primary" @click="copyText(status.notifyUrl || defaultNotifyUrl, '已复制回调地址')">复制</el-button>
            <span class="pay-settings__note">APIv3 的 notify_url 不允许携带查询串，因此固定为纯路径 /honeyPayNotify。</span>
          </li>
        </ol>
      </section>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { callFunctionHTTP } from '@/utils/cloud'

// 支付设置页：体检 + 加密写入 + 生成器。
// 服务端只回「是否已配置 / 来源 / 格式 / 脱敏指纹」，页面无法读取任何密钥明文；
// 写入走 platformHoneyPaymentSecretSave，值在云函数内用 AES-256-GCM 加密后入库。
const DEFAULT_NOTIFY_URL = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/honeyPayNotify'
// 与 cloudfunctions/webLoginApi/honeyRecharge.cjs 的 CONFIRMED_PACK_CENTS 保持一致（仅用于页面提示与预填）
const CONFIRMED_PACK_CENTS = [100, 500, 1000, 5000, 10000]

const SECRET_FIELDS = [
  {
    key: 'WXPAY_MCH_ID',
    label: '商户号',
    type: 'input',
    maxlength: 32,
    placeholder: '纯数字，例如 1900000001',
    note: '商户平台首页顶部「商户号」，只填数字。'
  },
  {
    key: 'WXPAY_SERIAL_NO',
    label: 'API 证书序列号',
    type: 'input',
    maxlength: 64,
    placeholder: 'API 证书序列号（40 位十六进制）',
    note: '商户平台「账户中心 → API 安全 → API 证书」，必须与商户私钥是同一张证书。'
  },
  {
    key: 'WXPAY_APIV3_KEY',
    label: 'APIv3 密钥',
    type: 'input',
    maxlength: 64,
    placeholder: '32 位字母数字',
    note: '商户平台「API 安全 → 设置 APIv3 密钥」，只能设置一次；可先用下方生成器生成。'
  },
  {
    key: 'WXPAY_PRIVATE_KEY',
    label: '商户 API 私钥',
    type: 'textarea',
    placeholder: '-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----',
    note: '证书工具包里的 apiclient_key.pem 全文，包含首尾两行。'
  },
  {
    key: 'WXPAY_PLATFORM_PUBLIC_KEY',
    label: '微信支付公钥',
    type: 'textarea',
    placeholder: '-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----',
    note: '商户平台「API 安全 → 微信支付公钥」下载的 pub_key.pem。必须填公钥，不能填平台证书。'
  },
  {
    key: 'WXPAY_PLATFORM_SERIAL',
    label: '平台公钥 ID / 证书序列号',
    type: 'input',
    maxlength: 128,
    placeholder: 'PUB_KEY_ID_0114… 或平台证书序列号',
    note: '公钥模式填与公钥同页显示的「公钥 ID」；证书模式填平台证书序列号。'
  },
  {
    key: 'HONEY_TOPUP_PACKS',
    label: '充值档位',
    type: 'textarea',
    placeholder: '[{"priceCents":100,"drops":10}, …]',
    note: '服务端校验：每档滴数必须等于金额 × 10 分，且不允许赠送滴数。'
  }
]

const loading = ref(false)
const saving = ref(false)
const clearing = ref(false)
const error = ref('')
const status = reactive({
  ready: false,
  rechargeAvailable: false,
  rechargeError: '',
  missing: [],
  rate: 10,
  mode: 'unconfigured',
  notifyUrl: '',
  checkedAt: '',
  items: [],
  secretStore: { kekReady: false, kekFingerprint: '', savedCount: 0, savedKeys: [], decryptableCount: 0, error: '' },
  packs: { list: [], reason: '', confirmed: false, missingYuan: [], extraYuan: [] }
})
const generatedKey = ref('')
const keyToCheck = ref('')
const form = reactive(Object.fromEntries(SECRET_FIELDS.map(field => [field.key, ''])))

const secretFields = SECRET_FIELDS
const items = computed(() => status.items || [])
const secretStore = computed(() => status.secretStore || { kekReady: false, savedCount: 0, decryptableCount: 0 })
const packs = computed(() => status.packs || { list: [], reason: '', confirmed: false, missingYuan: [], extraYuan: [] })
const okCount = computed(() => items.value.filter(item => item.status === 'ok').length)
const missingText = computed(() => (status.missing && status.missing.length ? '缺少：' + status.missing.join('、') : '缺少必需配置项'))
const modeText = computed(() => ({ public_key: '微信支付公钥', platform_cert: '平台证书', unconfigured: '未配置' }[status.mode] || '未配置'))
const jsapiDir = 'https://www.sxffootball.cn/'
const defaultNotifyUrl = DEFAULT_NOTIFY_URL
const confirmedPacksJson = JSON.stringify(CONFIRMED_PACK_CENTS.map(cents => ({ priceCents: cents, drops: cents / 10 })))
const confirmedPacksPretty = JSON.stringify(CONFIRMED_PACK_CENTS.map(cents => ({ priceCents: cents, drops: cents / 10 })), null, 2)
const packDiffText = computed(() => {
  const missing = packs.value.missingYuan || []
  const extra = packs.value.extraYuan || []
  return '缺少档位：' + (missing.length ? missing.join(' / ') + ' 元' : '无') + '；多余档位：' + (extra.length ? extra.join(' / ') + ' 元' : '无')
})
const keyCheck = computed(() => {
  const raw = keyToCheck.value
  if (!raw) return { type: 'info', text: '未输入' }
  if (/^[0-9A-Za-z]{32}$/.test(raw)) return { type: 'success', text: '32 位字母数字，格式正确' }
  return { type: 'danger', text: '需 32 位字母数字（当前 ' + raw.length + ' 位）' }
})
const itemMap = computed(() => {
  const map = {}
  items.value.forEach(item => { map[item.key] = item })
  return map
})

function statusText(value) {
  return { ok: '已配置', missing: '未配置', invalid: '格式异常' }[value] || '未知'
}
function statusTagType(value) {
  return { ok: 'success', missing: 'info', invalid: 'danger' }[value] || 'info'
}
function sourceText(value) {
  return { db: '加密存储', env: '环境变量' }[value] || '未配置'
}
function sourceTagType(value) {
  return value === 'db' ? 'success' : 'info'
}
function savedHint(key) {
  const item = itemMap.value[key]
  if (!item) return ''
  if (item.source === 'db') return '已加密保存 · ' + item.masked
  if (item.source === 'env') return '当前来自环境变量 · ' + item.masked
  return ''
}
function formatTime(value) {
  const time = Date.parse(value || '')
  if (!Number.isFinite(time)) return value || '—'
  return new Date(time).toLocaleString('zh-CN', { hour12: false })
}

async function copyText(value, tip) {
  const raw = String(value || '')
  if (!raw) return
  try {
    await navigator.clipboard.writeText(raw)
    ElMessage.success(tip || '已复制')
  } catch {
    ElMessage.warning('复制失败，请手动选中复制')
  }
}

function generateKey() {
  // 32 位字母数字，避开 0/O/o/1/I/l 等易混字符，便于在商户平台手工录入。
  const charset = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz'
  const limit = Math.floor(256 / charset.length) * charset.length
  const buffer = new Uint8Array(64)
  const out = []
  while (out.length < 32) {
    window.crypto.getRandomValues(buffer)
    for (const byte of buffer) {
      if (out.length >= 32) break
      if (byte < limit) out.push(charset[byte % charset.length])
    }
  }
  generatedKey.value = out.join('')
}

function clearKey() {
  generatedKey.value = ''
}

function applyStatus(reply) {
  if (!reply || typeof reply !== 'object') return
  Object.assign(status, {
    ready: reply.ready === true,
    rechargeAvailable: reply.rechargeAvailable === true,
    rechargeError: reply.rechargeError || '',
    missing: Array.isArray(reply.missing) ? reply.missing : [],
    rate: Number(reply.rate) || 10,
    mode: reply.mode || 'unconfigured',
    notifyUrl: reply.notifyUrl || '',
    checkedAt: reply.checkedAt || '',
    items: Array.isArray(reply.items) ? reply.items : [],
    secretStore: reply.secretStore || { kekReady: false, kekFingerprint: '', savedCount: 0, savedKeys: [], decryptableCount: 0, error: '' },
    packs: reply.packs || { list: [], reason: '', confirmed: false, missingYuan: [], extraYuan: [] }
  })
}

async function loadStatus() {
  loading.value = true
  error.value = ''
  try {
    const reply = await callFunctionHTTP('platformHoneyPaymentConfig', {})
    if (!reply || reply.success !== true) throw new Error((reply && (reply.error || reply.code)) || '支付配置体检失败')
    applyStatus(reply)
  } catch (err) {
    error.value = err && err.message ? err.message : '支付配置体检失败'
  } finally {
    loading.value = false
  }
}

async function saveSecrets() {
  const secrets = {}
  SECRET_FIELDS.forEach(field => {
    const value = String(form[field.key] || '').trim()
    if (value) secrets[field.key] = value
  })
  const names = Object.keys(secrets)
  if (!names.length) {
    ElMessage.warning('请至少填写一项要保存的配置')
    return
  }
  const labelOf = key => (SECRET_FIELDS.filter(field => field.key === key)[0] || {}).label || key
  try {
    await ElMessageBox.confirm(
      '将加密保存：' + names.map(labelOf).join('、') + '。保存后本页不再显示明文，需要更换时重新填写该项即可覆盖。',
      '确认保存支付配置',
      { type: 'warning', confirmButtonText: '加密保存', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  saving.value = true
  try {
    const reply = await callFunctionHTTP('platformHoneyPaymentSecretSave', { secrets })
    if (!reply || reply.success !== true) throw new Error((reply && (reply.error || reply.code)) || '保存失败')
    applyStatus(reply.status)
    SECRET_FIELDS.forEach(field => { form[field.key] = '' })
    ElMessage.success('已加密保存 ' + ((reply.saved || []).length) + ' 项配置')
  } catch (err) {
    ElMessage.error(err && err.message ? err.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function clearSecrets(keys, label) {
  try {
    await ElMessageBox.confirm(
      '清除' + (label || '所选配置') + '后，该值立即不再生效（如环境变量里仍有同名配置会回退到环境变量）。确定清除？',
      '确认清除支付配置',
      { type: 'warning', confirmButtonText: '清除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  clearing.value = true
  try {
    const payload = Array.isArray(keys) && keys.length ? { keys } : { all: true }
    const reply = await callFunctionHTTP('platformHoneyPaymentSecretClear', payload)
    if (!reply || reply.success !== true) throw new Error((reply && (reply.error || reply.code)) || '清除失败')
    applyStatus(reply.status)
    ElMessage.success('已清除 ' + ((reply.cleared || []).length) + ' 项配置')
  } catch (err) {
    ElMessage.error(err && err.message ? err.message : '清除失败')
  } finally {
    clearing.value = false
  }
}

function refresh() {
  return loadStatus()
}
defineExpose({ refresh })

onMounted(() => { loadStatus() })
</script>

<style scoped>
.pay-settings { color: #26392d; }
.pay-settings__toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 14px; }
.pay-settings__source { color: #7a8a7f; font-size: 12px; }
.pay-settings__error { margin: 0 0 14px; padding: 10px 12px; border-radius: 8px; background: #fdecec; color: #a63b3b; font-size: 13px; }
.pay-settings__hint { margin: 6px 0 12px; color: #7a8a7f; font-size: 12px; line-height: 1.7; }
.pay-settings__hint--warn { color: #a0641d; }
.pay-settings__notice { margin: 0 0 18px; padding: 12px 14px; border-radius: 10px; background: #eef5f0; border: 1px solid #cfe4d8; color: #3c5a48; font-size: 13px; line-height: 1.8; }
.pay-settings__notice--warn { background: #fff7ec; border-color: #f0d9b8; color: #8a5a1d; }
.pay-settings__stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin-bottom: 18px; }
.pay-settings__stat { padding: 14px 16px; border: 1px solid #e2ece5; border-radius: 12px; background: #fff; }
.pay-settings__stat small { display: block; color: #7a8a7f; font-size: 12px; }
.pay-settings__stat strong { display: block; margin: 6px 0 4px; font-size: 20px; color: #1f6b45; }
.pay-settings__stat span { font-size: 12px; color: #7a8a7f; word-break: break-all; }
.pay-settings__stat--bad { border-color: #f0d9b8; background: #fff9f0; }
.pay-settings__stat--bad strong { color: #a0641d; }
.pay-settings__block { margin-bottom: 20px; padding: 16px; border: 1px solid #e2ece5; border-radius: 12px; background: #fff; }
.pay-settings__block h2 { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; font-size: 15px; }
.pay-settings__block h2 small { font-weight: 400; color: #7a8a7f; font-size: 12px; }
.pay-settings__head-tag { margin-left: auto; }
.pay-settings__form { display: grid; gap: 14px; margin-bottom: 12px; }
.pay-settings__form-row { display: grid; gap: 6px; }
.pay-settings__form-label { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; font-size: 13px; font-weight: 600; color: #26392d; }
.pay-settings__saved { font-style: normal; font-weight: 400; color: #1f6b45; font-size: 12px; }
.pay-settings__field-note { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; color: #7a8a7f; font-size: 12px; line-height: 1.6; }
.pay-settings__item strong { display: block; font-size: 13px; }
.pay-settings__item .pay-settings__mono { display: block; margin: 2px 0; }
.pay-settings__mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #4a6352; word-break: break-all; }
.pay-settings__note { color: #7a8a7f; font-size: 12px; }
.pay-settings__chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.pay-settings__chip { padding: 4px 10px; border-radius: 999px; background: #f4f8f5; color: #4a6352; font-size: 12px; }
.pay-settings__actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.pay-settings__actions .pay-settings__hint { margin: 0; }
.pay-settings__generator { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }
.pay-settings__key { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 12px; padding: 10px 12px; border-radius: 8px; background: #f2f8f4; }
.pay-settings__key-text { font-size: 15px; letter-spacing: 1px; color: #1f6b45; }
.pay-settings__key .pay-settings__hint { margin: 0; }
.pay-settings__checker { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.pay-settings__steps { margin: 0; padding-left: 20px; color: #4a6352; font-size: 13px; line-height: 1.9; }
.pay-settings__steps li { margin-bottom: 8px; }
.pay-settings__steps strong { display: block; color: #26392d; }
</style>
