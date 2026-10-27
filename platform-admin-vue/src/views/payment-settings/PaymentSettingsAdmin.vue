<template>
  <section class="pay-settings">
    <div class="pay-settings__toolbar">
      <el-button :loading="loading" @click="refresh">刷新体检</el-button>
      <span class="pay-settings__source">
        数据源：云函数环境变量体检（只回是否已配置、格式与脱敏指纹）；本页不保存任何密钥
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
        <article class="pay-settings__stat">
          <small>计价口径</small>
          <strong>1 元 = {{ status.rate || 10 }} 滴</strong>
          <span>档位滴数必须等于金额 × {{ status.rate || 10 }}</span>
        </article>
      </div>

      <p v-if="status.checkedAt" class="pay-settings__hint">
        体检时间：{{ formatTime(status.checkedAt) }}（云端读取的是云函数当前生效的环境变量，改完变量需重新部署或重启后复查）
      </p>

      <section class="pay-settings__block">
        <h2>配置体检 <small>{{ okCount }} / {{ items.length }} 项正常</small></h2>
        <el-table :data="items" row-key="key" size="small">
          <el-table-column label="配置项" min-width="210">
            <template #default="{ row }">
              <div class="pay-settings__item">
                <strong>{{ row.label }}</strong>
                <span class="pay-settings__mono">{{ row.key }}</span>
                <el-button link type="primary" @click="copyText(row.key, '已复制变量名 ' + row.key)">复制变量名</el-button>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="statusTagType(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="当前值（脱敏）" min-width="240">
            <template #default="{ row }">
              <span class="pay-settings__mono">{{ row.masked || '未配置' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="说明" min-width="300">
            <template #default="{ row }">
              <span class="pay-settings__note">{{ row.note }}</span>
            </template>
          </el-table-column>
        </el-table>
        <p class="pay-settings__hint">
          本次缺少的配置项：{{ status.missing && status.missing.length ? status.missing.join('、') : '无' }}。
          密钥与私钥只允许写入云函数环境变量，任何页面、仓库和日志都不保存明文。
        </p>
      </section>

      <section class="pay-settings__block">
        <h2>
          充值档位 <small>只读</small>
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
          档位由服务端环境变量 <span class="pay-settings__mono">HONEY_TOPUP_PACKS</span> 决定，页面只做核对；需要变更时先由产品确认，再改变量。
        </p>
        <div class="pay-settings__actions">
          <el-button size="small" @click="copyText(confirmedPacksJson, '已复制已确认档位 JSON')">复制已确认档位 JSON</el-button>
          <span class="pay-settings__hint">写入云函数环境变量前请再次核对档位口径；带赠滴的档位会被服务端拒绝。</span>
        </div>
      </section>

      <section class="pay-settings__block">
        <h2>APIv3 密钥生成器 <small>仅在本页生成，不保存</small></h2>
        <p class="pay-settings__hint">
          微信支付商户平台的 APIv3 密钥只能设置一次且只显示一次。请在商户平台点「设置 APIv3 密钥」时使用本页生成的 32 位密钥，
          然后立即把它写入云函数环境变量 <span class="pay-settings__mono">WXPAY_APIV3_KEY</span>。
          本页不会保存、也不会上传这串密钥；离开或刷新页面后就再也看不到。
        </p>
        <div class="pay-settings__generator">
          <el-button type="primary" :disabled="generatedKey !== ''" @click="generateKey">生成 32 位 APIv3 密钥</el-button>
          <el-button :disabled="!generatedKey" @click="copyText(generatedKey, '已复制 APIv3 密钥，请立刻写入环境变量')">复制密钥</el-button>
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
import { ElMessage } from 'element-plus'
import { callFunctionHTTP } from '@/utils/cloud'

// 支付设置页只做「体检 + 提示 + 生成器」：
// 服务端只同步"是否已配置 / 格式 / 脱敏指纹"，页面无法读取任何密钥明文，也不写入环境变量。
const DEFAULT_NOTIFY_URL = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/honeyPayNotify'
// 与 cloudfunctions/webLoginApi/honeyRecharge.cjs 的 CONFIRMED_PACK_CENTS 保持一致（仅用于页面提示展示）
const CONFIRMED_PACK_CENTS = [100, 500, 1000, 5000, 10000]

const loading = ref(false)
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
  packs: { list: [], reason: '', confirmed: false, missingYuan: [], extraYuan: [] }
})
const generatedKey = ref('')
const keyToCheck = ref('')

const items = computed(() => status.items || [])
const packs = computed(() => status.packs || { list: [], reason: '', confirmed: false, missingYuan: [], extraYuan: [] })
const okCount = computed(() => items.value.filter(item => item.status === 'ok').length)
const missingText = computed(() => (status.missing && status.missing.length ? '缺少：' + status.missing.join('、') : '缺少必需配置项'))
const modeText = computed(() => ({ public_key: '微信支付公钥', platform_cert: '平台证书', unconfigured: '未配置' }[status.mode] || '未配置'))
const jsapiDir = 'https://www.sxffootball.cn/'
const defaultNotifyUrl = DEFAULT_NOTIFY_URL
const confirmedPacksJson = JSON.stringify(CONFIRMED_PACK_CENTS.map(cents => ({ priceCents: cents, drops: cents / 10 })))
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

function statusText(value) {
  return { ok: '已配置', missing: '未配置', invalid: '格式异常' }[value] || '未知'
}
function statusTagType(value) {
  return { ok: 'success', missing: 'info', invalid: 'danger' }[value] || 'info'
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

async function loadStatus() {
  loading.value = true
  error.value = ''
  try {
    const reply = await callFunctionHTTP('platformHoneyPaymentConfig', {})
    if (!reply || reply.success !== true) throw new Error((reply && (reply.error || reply.code)) || '支付配置体检失败')
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
      packs: reply.packs || { list: [], reason: '', confirmed: false, missingYuan: [], extraYuan: [] }
    })
  } catch (err) {
    error.value = err && err.message ? err.message : '支付配置体检失败'
  } finally {
    loading.value = false
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
