<template>
  <section class="honey-orders">
    <div class="toolbar">
      <el-select v-model="days" style="width:130px" @change="loadOverview">
        <el-option label="今天" :value="1" />
        <el-option label="近 7 天" :value="7" />
        <el-option label="近 30 天" :value="30" />
        <el-option label="近 90 天" :value="90" />
      </el-select>
      <el-button :loading="overviewLoading || listLoading" @click="refreshAll">刷新数据</el-button>
      <span class="source">数据源：honey_orders + fan_points_ledger；订单只读，手动加滴只加不减</span>
    </div>

    <div v-if="error" class="error" role="alert">{{ error }} <el-button link @click="refreshAll">重试</el-button></div>

    <template v-else>
      <div class="stat-grid">
        <article class="stat-card">
          <small>期间销售额（已支付-退款）</small>
          <strong>{{ overview.totals ? overview.totals.netYuan : '—' }}<em>元</em></strong>
          <span>支付 {{ overview.totals ? overview.totals.paid : 0 }} 笔 · 退款 {{ overview.totals ? overview.totals.refunded : 0 }} 笔</span>
        </article>
        <article class="stat-card">
          <small>支付成功率</small>
          <strong>{{ overview.totals ? overview.totals.successRate : 0 }}<em>%</em></strong>
          <span>已支付 /（已支付 + 已关闭）</span>
        </article>
        <article class="stat-card">
          <small>待支付订单</small>
          <strong>{{ overview.totals ? overview.totals.pending : 0 }}<em>笔</em></strong>
          <span>30 分钟未支付会自动关闭</span>
        </article>
        <article class="stat-card" :class="{ warn: overview.totals && overview.totals.blocked }">
          <small>已支付·待入账</small>
          <strong>{{ overview.totals ? overview.totals.blocked : 0 }}<em>笔</em></strong>
          <span>{{ overview.totals && overview.totals.blocked ? '账本与镜像不一致，需人工核对' : '账本与镜像一致' }}</span>
        </article>
      </div>

      <p v-if="overview.truncated" class="hint warn">{{ overview.truncatedNote }}</p>
      <p v-else-if="overview.available === false" class="hint">{{ overview.note }}</p>

      <section class="block">
        <h2>每日收款 <small>北京时间切天，单位：元</small></h2>
        <div class="day-list">
          <div v-for="day in overview.byDay || []" :key="day.day" class="day-row">
            <span class="day-key">{{ day.day.slice(5) }}</span>
            <span class="day-bar"><i :style="{ width: barWidth(day.grossCents) }" /></span>
            <span class="day-value">{{ day.grossYuan || '0' }}<em v-if="day.paidCount">（{{ day.paidCount }} 笔）</em></span>
          </div>
        </div>
        <div v-if="overview.byPack && overview.byPack.length" class="pack-list">
          <span v-for="pack in overview.byPack" :key="pack.priceCents" class="pack-chip">
            {{ pack.priceYuan }} 元档：{{ pack.paid }}/{{ pack.orders }} 笔已支付
          </span>
        </div>
      </section>

      <section class="block">
        <h2>充值订单 <small>共 {{ list.total }} 笔（本次检索 {{ list.scanned }} 条）</small></h2>
        <div class="order-tools">
          <el-select v-model="status" style="width:130px" @change="loadList(1)">
            <el-option label="全部状态" value="all" />
            <el-option label="待支付" value="pending" />
            <el-option label="已支付" value="paid" />
            <el-option label="已关闭" value="closed" />
            <el-option label="已退款" value="refunded" />
          </el-select>
          <el-select v-model="ledgerState" style="width:150px" @change="loadList(1)">
            <el-option label="全部入账状态" value="all" />
            <el-option label="未入账" value="pending" />
            <el-option label="已入账" value="credited" />
            <el-option label="入账受阻" value="blocked" />
          </el-select>
          <el-input v-model.trim="keyword" clearable placeholder="搜索单号 / 微信单号 / 用户ID" style="width:280px" @keyup.enter="loadList(1)" @clear="loadList(1)" />
          <el-button :loading="listLoading" @click="loadList(1)">查询</el-button>
        </div>
        <p v-if="list.truncated" class="hint warn">{{ list.truncatedNote }}</p>
        <p v-else-if="list.available === false" class="hint">{{ list.note }}</p>

        <el-table v-loading="listLoading" :data="list.rows" row-key="outTradeNo">
          <el-table-column label="创建时间" width="145"><template #default="{ row }">{{ row.createdText || '—' }}</template></el-table-column>
          <el-table-column label="充值单号" min-width="220"><template #default="{ row }"><span class="mono">{{ row.outTradeNo }}</span></template></el-table-column>
          <el-table-column label="金额" width="100" align="right"><template #default="{ row }">{{ row.priceYuan }} 元</template></el-table-column>
          <el-table-column label="到账滴数" width="100" align="right"><template #default="{ row }">{{ row.totalDrops }}<small v-if="row.bonusDrops" class="block">含赠 {{ row.bonusDrops }}</small></template></el-table-column>
          <el-table-column label="订单状态" width="110" align="center"><template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ row.statusLabel }}</el-tag></template></el-table-column>
          <el-table-column label="入账状态" width="110" align="center"><template #default="{ row }"><el-tag :type="ledgerType(row.ledgerState)" size="small">{{ row.ledgerLabel }}</el-tag></template></el-table-column>
          <el-table-column label="微信支付单号" min-width="200"><template #default="{ row }"><span class="mono">{{ row.transactionId || '—' }}</span></template></el-table-column>
          <el-table-column label="付款人" width="170"><template #default="{ row }"><span class="mono">{{ row.openIdMasked || '—' }}</span><small class="block">{{ row.userId ? '账号 ' + row.userId.slice(-6) : '' }}</small></template></el-table-column>
          <el-table-column label="操作" width="90" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row)">详情</el-button></template></el-table-column>
          <template #empty><el-empty :description="list.available === false ? (list.note || '还没有充值订单') : '没有符合条件的订单'" /></template>
        </el-table>

        <div class="pager">
          <el-pagination
            :current-page="list.page"
            :page-size="list.pageSize"
            :page-sizes="[10, 20, 50]"
            :total="list.total"
            layout="sizes, prev, pager, next, total"
            @current-change="loadList"
            @size-change="size => loadList(1, size)"
          />
        </div>
      </section>
      <section class="block">
        <h2>手动加滴 <small>只加不减；不产生订单收入；退款与冲正不走这里</small></h2>
        <div class="order-tools">
          <el-input v-model.trim="grantPhone" maxlength="11" placeholder="用户手机号（11 位）" style="width:220px" @keyup.enter="lookupAccount" @clear="resetGrantForm" />
          <el-button :loading="grantLookupLoading" @click="lookupAccount">查询账户</el-button>
          <span class="source">按手机号定位服务号蜂蜜账户；查询时会用账本合计核对镜像余额</span>
        </div>

        <p v-if="grantLookupError" class="hint bad">{{ grantLookupError }}</p>
        <template v-else>
          <p v-if="grantSourceOutTradeNo" class="hint">定位来源：充值单 <span class="mono">{{ grantSourceOutTradeNo }}</span> 的付款账户</p>
          <div v-if="grantAccount" class="grant-card" :class="{ bad: !grantAccount.canGrant }">
            <div>
              <small>账户</small>
              <strong>{{ grantAccount.nickname || '未命名用户' }} · {{ grantAccount.phoneMasked || '手机号未知' }}</strong>
              <span class="mono">{{ grantAccount.openIdMasked }}</span>
            </div>
            <div>
              <small>当前余额</small>
              <strong>{{ grantAccount.balance === null ? '未计算' : grantAccount.balance + ' 滴' }}</strong>
              <span>镜像 {{ grantAccount.mirror === null ? '—' : grantAccount.mirror + ' 滴' }} · {{ grantAccount.consistent ? '账本与镜像一致' : '账本与镜像不一致' }}</span>
            </div>
          </div>
        </template>

        <p v-if="grantAccount && !grantAccount.canGrant" class="hint warn">{{ grantAccount.blockedReason }}</p>
        <div v-if="grantAccount && grantAccount.canGrant" class="order-tools">
          <el-input-number v-model="grantDrops" :min="1" :max="grantMaxDrops" :step="10" style="width:170px" />
          <span class="source">滴</span>
          <el-input v-model.trim="grantReason" maxlength="120" show-word-limit placeholder="加滴原因（4–120 字，必填，会写进账本流水）" style="width:380px" />
          <el-button type="primary" :loading="grantSubmitting" @click="submitGrant">确认加滴</el-button>
          <span class="source">单次上限 {{ grantMaxDrops }} 滴</span>
        </div>

        <h2 class="sub-head">最近手动加滴 <small>最近 20 条</small></h2>
        <p v-if="grantNote" class="hint">{{ grantNote }}</p>
        <el-table :data="grantRows" size="small">
          <el-table-column label="时间" width="145"><template #default="{ row }">{{ row.createdText || '—' }}</template></el-table-column>
          <el-table-column label="账户" min-width="200">
            <template #default="{ row }">
              <strong>{{ row.phoneMasked || '—' }}</strong>
              <small class="block mono">{{ row.openIdMasked }}</small>
            </template>
          </el-table-column>
          <el-table-column label="加滴" width="90" align="right"><template #default="{ row }">+{{ row.drops }}</template></el-table-column>
          <el-table-column label="余额变化" width="150" align="right"><template #default="{ row }">{{ row.beforeBalance }} → {{ row.afterBalance }}</template></el-table-column>
          <el-table-column prop="reason" label="原因" min-width="220" />
          <el-table-column label="操作人" width="120"><template #default="{ row }">{{ row.operatorName || '—' }}</template></el-table-column>
          <template #empty><el-empty :description="grantAvailable === false ? (grantNote || '还没有手动加滴记录') : '还没有手动加滴记录'" /></template>
        </el-table>
      </section>
    </template>

    <el-dialog v-model="detailVisible" title="充值订单详情" width="min(760px, 94vw)">
      <div v-if="detailLoading" class="detail-loading">正在读取订单与账本…</div>
      <template v-else-if="detail && detail.success">
        <div class="detail-head">
          <div><small>充值单号</small><strong class="mono">{{ detail.order.outTradeNo }}</strong></div>
          <div><small>金额 / 滴数</small><strong>{{ detail.order.priceYuan }} 元 → {{ detail.order.totalDrops }} 滴</strong></div>
          <div><small>订单状态</small><strong>{{ detail.order.statusLabel }} · {{ detail.order.ledgerLabel }}</strong></div>
        </div>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="创建时间">{{ detail.order.createdText || '—' }}</el-descriptions-item>
          <el-descriptions-item label="支付时间">{{ detail.order.paidText || '—' }}</el-descriptions-item>
          <el-descriptions-item label="微信支付单号">{{ detail.order.transactionId || '—' }}</el-descriptions-item>
          <el-descriptions-item label="回调次数">{{ detail.order.notifyCount }}</el-descriptions-item>
          <el-descriptions-item label="付款人">{{ detail.order.openIdMasked || '—' }}</el-descriptions-item>
          <el-descriptions-item label="下单端">{{ detail.order.clientPlatform || '—' }}</el-descriptions-item>
          <el-descriptions-item label="档位">{{ detail.order.packId || '—' }}</el-descriptions-item>
          <el-descriptions-item label="入账错误">{{ detail.order.ledgerError || '—' }}</el-descriptions-item>
        </el-descriptions>

        <h3>账本一致性</h3>
        <p class="reconcile" :class="{ bad: !detail.ledger.consistent }">
          账本合计 <strong>{{ balanceText(detail.ledger.balance) }}</strong>
          · 镜像余额 <strong>{{ balanceText(detail.ledger.mirror) }}</strong>
          · 结论：<strong>{{ detail.ledger.consistent ? '一致' : (detail.ledger.complete ? '不一致，需人工核对' : '账本过多，未计算') }}</strong>
        </p>
        <p v-if="detail.ledger.note" class="hint">{{ detail.ledger.note }}</p>

        <h3>本单入账流水</h3>
        <el-table :data="detail.ledger.entries" size="small">
          <el-table-column label="时间" width="150"><template #default="{ row }">{{ row.timeText || '—' }}</template></el-table-column>
          <el-table-column label="变动" width="90" align="right"><template #default="{ row }">{{ row.delta > 0 ? '+' : '' }}{{ row.delta }}</template></el-table-column>
          <el-table-column prop="reason" label="原因" width="160" />
          <el-table-column label="流水 ID" min-width="200"><template #default="{ row }"><span class="mono">{{ row.id }}</span></template></el-table-column>
          <template #empty><el-empty description="还没有对应的账本流水" /></template>
        </el-table>
        <p v-if="detail.priceSnapshot" class="snapshot">价格快照：{{ JSON.stringify(detail.priceSnapshot) }}</p>
        <div class="dialog-actions">
          <el-button @click="detailVisible = false">关闭</el-button>
          <el-button type="primary" @click="lookupAccountByOrder(detail.order.outTradeNo)">给该付款账户加滴</el-button>
        </div>
      </template>
      <div v-else class="detail-loading">{{ detail ? detail.error : '没有找到该订单' }}</div>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { callFunction } from '@/utils/cloud'

const days = ref(7)
const status = ref('all')
const ledgerState = ref('all')
const keyword = ref('')
const overviewLoading = ref(false)
const listLoading = ref(false)
const detailLoading = ref(false)
const error = ref('')
const overview = reactive({ totals: null, byDay: [], byPack: [], available: true, note: '', truncated: false, truncatedNote: '' })
const list = reactive({ rows: [], total: 0, page: 1, pageSize: 20, pageCount: 1, scanned: 0, available: true, note: '', truncated: false, truncatedNote: '' })
const detailVisible = ref(false)
const detail = ref(null)

// 手动加滴：只加不减。所有判断都在服务端（账本合计 vs 镜像、幂等、上限），页面只做输入与二次确认。
const grantPhone = ref('')
const grantSourceOutTradeNo = ref('')
const grantLookupLoading = ref(false)
const grantLookupError = ref('')
const grantAccount = ref(null)
const grantDrops = ref(100)
const grantReason = ref('')
const grantMaxDrops = ref(50000)
const grantSubmitting = ref(false)
const grantRows = ref([])
const grantAvailable = ref(true)
const grantNote = ref('')

function statusType(value) {
  return { paid: 'success', pending: 'warning', closed: 'info', refunded: 'danger' }[value] || 'info'
}
function ledgerType(value) {
  return { credited: 'success', pending: 'info', blocked: 'danger' }[value] || 'info'
}
function balanceText(value) {
  return Number.isFinite(value) ? value + ' 滴' : '未计算'
}
const maxDayCents = computed(() => (overview.byDay || []).reduce((max, day) => Math.max(max, day.grossCents || 0), 0))
function barWidth(cents) {
  if (!maxDayCents.value) return '0%'
  return Math.max(Math.round((Number(cents) || 0) / maxDayCents.value * 100), 2) + '%'
}

async function loadOverview() {
  overviewLoading.value = true
  error.value = ''
  try {
    const reply = await callFunction('platformOwner', { action: 'honeyOrdersOverview', days: days.value })
    if (!reply.success) throw new Error(reply.error || '读取收款汇总失败')
    Object.assign(overview, reply)
  } catch (err) {
    error.value = err.message || '读取收款汇总失败'
  } finally {
    overviewLoading.value = false
  }
}

async function loadList(page = 1, pageSize = list.pageSize) {
  listLoading.value = true
  try {
    const reply = await callFunction('platformOwner', {
      action: 'honeyOrderList', page, pageSize,
      status: status.value, ledgerState: ledgerState.value, keyword: keyword.value
    })
    if (!reply.success) throw new Error(reply.error || '读取订单失败')
    Object.assign(list, reply)
  } catch (err) {
    ElMessage.error(err.message || '读取订单失败')
  } finally {
    listLoading.value = false
  }
}

function refreshAll() {
  return Promise.all([loadOverview(), loadList(list.page), loadGrants()])
}

function resetGrantForm() {
  grantSourceOutTradeNo.value = ''
  grantAccount.value = null
  grantLookupError.value = ''
  grantReason.value = ''
}

function newRequestId() {
  return 'hg-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

async function runLookup(payload) {
  grantLookupError.value = ''
  grantAccount.value = null
  grantLookupLoading.value = true
  try {
    const reply = await callFunction('platformOwner', Object.assign({ action: 'honeyGrantAccount' }, payload))
    if (!reply.success) throw new Error(reply.error || '查询蜂蜜账户失败')
    grantAccount.value = reply.account
    grantMaxDrops.value = Number(reply.maxDrops) || 50000
    grantDrops.value = Math.min(100, grantMaxDrops.value)
    grantReason.value = ''
  } catch (err) {
    grantLookupError.value = err.message || '查询蜂蜜账户失败'
  } finally {
    grantLookupLoading.value = false
  }
}

async function lookupAccount() {
  grantSourceOutTradeNo.value = ''
  const phone = String(grantPhone.value || '').replace(/\D/g, '')
  if (!/^1[3-9]\d{9}$/.test(phone)) { grantLookupError.value = '请输入正确的 11 位手机号'; return }
  await runLookup({ phone })
}

// 从订单详情直接给该付款账户加滴：只传单号，OpenID 不落到浏览器。
async function lookupAccountByOrder(outTradeNo) {
  detailVisible.value = false
  grantSourceOutTradeNo.value = String(outTradeNo || '')
  grantPhone.value = ''
  await runLookup({ outTradeNo: grantSourceOutTradeNo.value })
}

async function submitGrant() {
  const account = grantAccount.value
  if (!account || !account.canGrant) return
  const drops = Number(grantDrops.value)
  const reason = String(grantReason.value || '').trim()
  if (!Number.isSafeInteger(drops) || drops <= 0) { ElMessage.error('加滴数必须是大于 0 的整数'); return }
  if (reason.length < 4) { ElMessage.error('请填写至少 4 个字的加滴原因'); return }
  const target = account.phoneMasked || account.openIdMasked || '该账户'
  const after = Number.isFinite(account.balance) ? account.balance + drops : null
  try {
    await ElMessageBox.confirm(
      `给 ${target} 增加 ${drops} 滴？` + (after === null ? '' : `余额 ${account.balance} → ${after} 滴。`) +
      '只写一条正数账本流水并同步镜像，不产生订单收入，也不能在这里撤回。',
      '确认手动加滴',
      { type: 'warning', confirmButtonText: '确认加滴', cancelButtonText: '取消' }
    )
  } catch (err) {
    return
  }
  grantSubmitting.value = true
  try {
    const reply = await callFunction('platformOwner', {
      action: 'honeyGrantDrops',
      phone: grantSourceOutTradeNo.value ? undefined : grantPhone.value,
      outTradeNo: grantSourceOutTradeNo.value || undefined,
      drops, reason, requestId: newRequestId()
    })
    if (!reply.success) throw new Error(reply.error || '加滴失败')
    ElMessage.success(reply.deduped ? '这笔已经记过账，未重复加滴' : `已加 ${drops} 滴，当前 ${reply.balance} 滴`)
    if (account) {
      grantAccount.value = Object.assign({}, account, {
        balance: reply.balance, mirror: reply.balance, consistent: true, canGrant: true
      })
    }
    grantReason.value = ''
    await loadGrants()
  } catch (err) {
    ElMessage.error(err.message || '加滴失败')
  } finally {
    grantSubmitting.value = false
  }
}

async function loadGrants() {
  try {
    const reply = await callFunction('platformOwner', { action: 'honeyGrantList' })
    if (!reply.success) throw new Error(reply.error || '读取加滴记录失败')
    grantRows.value = reply.rows || []
    grantAvailable.value = reply.available !== false
    grantNote.value = reply.note || ''
  } catch (err) {
    grantRows.value = []
    grantAvailable.value = false
    grantNote.value = err.message || '读取加滴记录失败'
  }
}

async function openDetail(row) {
  detailVisible.value = true
  detailLoading.value = true
  detail.value = null
  try {
    const reply = await callFunction('platformOwner', { action: 'honeyOrderDetail', outTradeNo: row.outTradeNo })
    detail.value = reply
  } catch (err) {
    detail.value = { success: false, error: err.message || '读取订单详情失败' }
  } finally {
    detailLoading.value = false
  }
}

function refresh() { return refreshAll() }
defineExpose({ refresh })

onMounted(() => { refreshAll() })
</script>

<style scoped>
.honey-orders{color:#26392d}
.toolbar,.order-tools{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:14px}
.source{color:#7a8a7f;font-size:12px}
.error{margin:0 0 14px;padding:10px 12px;border-radius:8px;background:#fdecec;color:#a63b3b;font-size:13px}
.hint{margin:6px 0 12px;color:#7a8a7f;font-size:12px}
.hint.warn{color:#a0641d}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:18px}
.stat-card{padding:14px 16px;border:1px solid #e2ece5;border-radius:12px;background:#fff}
.stat-card small{display:block;color:#7a8a7f;font-size:12px}
.stat-card strong{display:block;margin:6px 0 4px;font-size:26px;color:#1f6b45}
.stat-card strong em{margin-left:4px;font-size:12px;font-style:normal;color:#7a8a7f}
.stat-card span{font-size:12px;color:#7a8a7f}
.stat-card.warn{border-color:#f0d9b8;background:#fff9f0}
.stat-card.warn strong{color:#a0641d}
.block{margin-bottom:20px;padding:16px;border:1px solid #e2ece5;border-radius:12px;background:#fff}
.block h2{margin:0 0 12px;font-size:15px}
.block h2 small{margin-left:6px;font-weight:400;color:#7a8a7f;font-size:12px}
.day-list{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}
.day-row{display:grid;grid-template-columns:52px 1fr 130px;gap:10px;align-items:center;font-size:12px}
.day-key{color:#7a8a7f}
.day-bar{height:10px;border-radius:5px;background:#f2f6f3;overflow:hidden}
.day-bar i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#7fc39a,#2f8a58)}
.day-value{text-align:right;color:#26392d}
.day-value em{font-style:normal;color:#7a8a7f}
.pack-list{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.pack-chip{padding:4px 10px;border-radius:999px;background:#f4f8f5;color:#4a6352;font-size:12px}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#4a6352}
.block{display:block}
.pager{display:flex;justify-content:flex-end;margin-top:12px}
.detail-head{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:14px}
.detail-head small{display:block;color:#7a8a7f;font-size:12px}
.detail-head strong{font-size:13px}
.honey-orders h3{margin:18px 0 8px;font-size:14px}
.reconcile{margin:0 0 8px;padding:10px 12px;border-radius:8px;background:#f2f8f4;font-size:13px}
.reconcile.bad{background:#fdecec;color:#a63b3b}
.hint.bad{color:#a63b3b}
.grant-card{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:0 0 12px;padding:14px 16px;border:1px solid #dcebe2;border-radius:12px;background:#f7fbf8}
.grant-card.bad{border-color:#f0d9b8;background:#fff9f0}
.grant-card small{display:block;color:#7a8a7f;font-size:12px}
.grant-card strong{display:block;margin:4px 0 2px;font-size:14px}
.grant-card span{color:#7a8a7f;font-size:12px}
.sub-head{margin-top:20px!important;padding-top:14px;border-top:1px dashed #e2ece5}
.detail-loading{padding:30px 0;text-align:center;color:#7a8a7f;font-size:13px}
.snapshot{margin-top:10px;color:#7a8a7f;font-size:12px;word-break:break-all}
.dialog-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}
</style>
