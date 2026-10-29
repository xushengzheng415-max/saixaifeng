<template>
  <section class="membership-admin">
    <div class="toolbar">
      <el-select v-model="days" style="width:130px" @change="loadOverview">
        <el-option label="今天" :value="1" />
        <el-option label="近 7 天" :value="7" />
        <el-option label="近 30 天" :value="30" />
        <el-option label="近 90 天" :value="90" />
      </el-select>
      <el-button :loading="planLoading || overviewLoading || listLoading || subLoading" @click="refreshAll">刷新数据</el-button>
      <span class="source">数据源：platform_membership_plans + membership_orders + member_subscriptions + fan_points_ledger</span>
    </div>

    <div v-if="error" class="error" role="alert">{{ error }} <el-button link @click="refreshAll">重试</el-button></div>

    <template v-else>
      <div class="stat-grid">
        <article class="stat-card">
          <small>期间会员收入</small>
          <strong>{{ overview.totals ? overview.totals.grossYuan : '—' }}<em>元</em></strong>
          <span>已支付 {{ overview.totals ? overview.totals.paid : 0 }} 笔 · 退款 {{ overview.totals ? overview.totals.refunded : 0 }} 笔</span>
        </article>
        <article class="stat-card">
          <small>期间赠滴</small>
          <strong>{{ overview.totals ? overview.totals.grantDrops : 0 }}<em>滴</em></strong>
          <span>只统计已发放的会员单，已退款不计</span>
        </article>
        <article class="stat-card">
          <small>生效会员</small>
          <strong>{{ overview.subscription ? overview.subscription.active : '—' }}<em>人</em></strong>
          <span>已过期 {{ overview.subscription ? overview.subscription.expired : 0 }} 人</span>
        </article>
        <article class="stat-card" :class="{ warn: overview.subscription && overview.subscription.expiringSoon }">
          <small>7 天内到期</small>
          <strong>{{ overview.subscription ? overview.subscription.expiringSoon : 0 }}<em>人</em></strong>
          <span>{{ overview.subscription && overview.subscription.expiringSoon ? '一期不做自动续费，需提醒用户手动续费' : '暂无临期会员' }}</span>
        </article>
      </div>

      <p v-if="overview.truncated" class="hint warn">{{ overview.truncatedNote }}</p>
      <p v-if="overview.available === false" class="hint">{{ overview.note }}</p>

      <section class="block">
        <h2>
          会员档位
          <small>{{ planInfo.sourceLabel }} · 版本 v{{ planInfo.version }}</small>
        </h2>
        <p class="hint">
          四档必须齐全（基础/进阶/专业/家庭），首月价不高于续费价，赠滴为正整数，定妆照折扣 5–10 折；年付本期不对用户开放，但价格仍需符合「续费价 × 10 个月 ±5」。
          <span v-if="planInfo.updatedText">最近一次保存：{{ planInfo.updatedText }}<template v-if="planInfo.updatedByName"> · {{ planInfo.updatedByName }}</template></span>
        </p>
        <p v-if="planInfo.note" class="hint" :class="{ warn: planInfo.source === 'default' }">{{ planInfo.note }}</p>
        <p v-if="planInfo.ready === false" class="hint bad">{{ planInfo.reasonText || '库内档位配置异常，会员已停止售卖' }}</p>

        <el-table v-loading="planLoading" :data="planForm" size="small" row-key="code">
          <el-table-column label="档位" width="150">
            <template #default="{ row }">
              <strong>{{ row.label }}</strong>
              <small class="sub mono">{{ row.code }}</small>
            </template>
          </el-table-column>
          <el-table-column label="名称" min-width="130">
            <template #default="{ row }"><el-input v-model.trim="row.name" maxlength="20" /></template>
          </el-table-column>
          <el-table-column label="首月价（元）" width="130">
            <template #default="{ row }"><el-input-number v-model="row.firstYuan" :min="0.01" :max="10000" :precision="2" :step="0.1" controls-position="right" style="width:100%" /></template>
          </el-table-column>
          <el-table-column label="续费价（元）" width="130">
            <template #default="{ row }"><el-input-number v-model="row.renewYuan" :min="0.01" :max="10000" :precision="2" :step="0.1" controls-position="right" style="width:100%" /></template>
          </el-table-column>
          <el-table-column label="年付价（元）" width="130">
            <template #default="{ row }"><el-input-number v-model="row.yearlyYuan" :min="0.01" :max="100000" :precision="2" :step="1" controls-position="right" style="width:100%" /></template>
          </el-table-column>
          <el-table-column label="赠滴" width="120">
            <template #default="{ row }"><el-input-number v-model="row.grantDrops" :min="1" :max="100000" :step="50" controls-position="right" style="width:100%" /></template>
          </el-table-column>
          <el-table-column label="定妆照折扣" width="130">
            <template #default="{ row }"><el-input-number v-model="row.portraitZhe" :min="5" :max="10" :precision="1" :step="0.5" controls-position="right" style="width:100%" /></template>
          </el-table-column>
          <el-table-column label="排序" width="100">
            <template #default="{ row }"><el-input-number v-model="row.order" :min="1" :max="99" :step="1" controls-position="right" style="width:100%" /></template>
          </el-table-column>
          <el-table-column label="用户端可购买" width="120" align="center">
            <template #default="{ row }"><el-switch v-model="row.visible" /></template>
          </el-table-column>
        </el-table>

        <div class="actions">
          <el-button type="primary" :loading="planSaving" @click="savePlans">保存档位</el-button>
          <el-button :disabled="planSaving" @click="restoreDefaults">填入默认表</el-button>
          <el-button :disabled="planSaving" @click="loadPlan">放弃修改</el-button>
          <span class="source">保存后立即对新的购买生效；已付款订单按购买时的价格快照结算</span>
        </div>

        <div v-if="planWarnings.length" class="warnings">
          <p v-for="(item, index) in planWarnings" :key="index">{{ item }}</p>
        </div>

        <template v-if="planInfo.history && planInfo.history.length">
          <h3>最近保存记录</h3>
          <ul class="history">
            <li v-for="item in planInfo.history" :key="item.version">
              <span class="mono">v{{ item.version }}</span>
              <span>{{ item.atText || '时间待确认' }}</span>
              <span>{{ item.operatorName || '平台负责人' }}</span>
              <span class="history-summary">{{ item.summary || '无价格与状态变化' }}</span>
            </li>
          </ul>
        </template>
      </section>

      <section class="block">
        <h2>会员收入趋势 <small>北京时间切天，单位：元</small></h2>
        <div class="day-list">
          <div v-for="day in overview.byDay || []" :key="day.day" class="day-row">
            <span class="day-key">{{ day.day.slice(5) }}</span>
            <span class="day-bar"><i :style="{ width: barWidth(day.grossCents) }" /></span>
            <span class="day-value">{{ day.grossYuan || '0' }}<em v-if="day.paidCount">（{{ day.paidCount }} 笔）</em></span>
          </div>
        </div>
        <div v-if="overview.byPlan && overview.byPlan.length" class="plan-list">
          <span v-for="plan in overview.byPlan" :key="plan.planCode" class="plan-chip">
            {{ plan.planName }}：{{ plan.paid }}/{{ plan.orders }} 笔已支付 · {{ plan.grossYuan }} 元
          </span>
        </div>
        <p v-if="overview.subscription && overview.subscription.byLevel && overview.subscription.byLevel.length" class="hint">
          生效会员分布：
          <span v-for="item in overview.subscription.byLevel" :key="item.levelCode">{{ item.levelName }} {{ item.count }} 人 · </span>
        </p>
      </section>

      <section class="block">
        <h2>会员订单 <small>共 {{ list.total }} 笔（本次检索 {{ list.scanned }} 条）· 只读，不发滴、不改状态、不退款</small></h2>
        <div class="order-tools">
          <el-select v-model="status" style="width:130px" @change="loadList(1)">
            <el-option label="全部状态" value="all" />
            <el-option label="待支付" value="pending" />
            <el-option label="已支付" value="paid" />
            <el-option label="已关闭" value="closed" />
            <el-option label="已退款" value="refunded" />
          </el-select>
          <el-select v-model="ledgerState" style="width:140px" @change="loadList(1)">
            <el-option label="全部发放状态" value="all" />
            <el-option label="未发放" value="pending" />
            <el-option label="已发放" value="granted" />
            <el-option label="发放受阻" value="blocked" />
          </el-select>
          <el-select v-model="planCode" style="width:130px" @change="loadList(1)">
            <el-option label="全部档位" value="all" />
            <el-option v-for="item in planInfo.plans || []" :key="item.code" :label="item.name" :value="item.code" />
          </el-select>
          <el-input v-model.trim="keyword" clearable placeholder="搜索会员单号 / 微信单号 / 用户ID" style="width:290px" @keyup.enter="loadList(1)" @clear="loadList(1)" />
          <el-button :loading="listLoading" @click="loadList(1)">查询</el-button>
        </div>
        <p v-if="list.truncated" class="hint warn">{{ list.truncatedNote }}</p>
        <p v-else-if="list.available === false" class="hint">{{ list.note }}</p>

        <el-table v-loading="listLoading" :data="list.rows" row-key="outTradeNo">
          <el-table-column label="创建时间" width="145"><template #default="{ row }">{{ row.createdText || '—' }}</template></el-table-column>
          <el-table-column label="会员单号" min-width="215"><template #default="{ row }"><span class="mono">{{ row.outTradeNo }}</span></template></el-table-column>
          <el-table-column label="档位" width="110"><template #default="{ row }">{{ row.planName || '—' }}</template></el-table-column>
          <el-table-column label="金额" width="110" align="right">
            <template #default="{ row }">{{ row.priceYuan }} 元<small class="sub">{{ row.priceTierLabel || '—' }}</small></template>
          </el-table-column>
          <el-table-column label="赠滴" width="80" align="right"><template #default="{ row }">{{ row.grantDrops }}</template></el-table-column>
          <el-table-column label="订单状态" width="115" align="center"><template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ row.statusLabel }}</el-tag></template></el-table-column>
          <el-table-column label="发放状态" width="110" align="center"><template #default="{ row }"><el-tag :type="ledgerType(row.ledgerState)" size="small">{{ row.ledgerLabel }}</el-tag></template></el-table-column>
          <el-table-column label="微信支付单号" min-width="190"><template #default="{ row }"><span class="mono">{{ row.transactionId || '—' }}</span></template></el-table-column>
          <el-table-column label="付款人" width="170">
            <template #default="{ row }">
              <span class="mono">{{ row.openIdMasked || '—' }}</span>
              <small class="sub">{{ row.userId ? '账号 ' + row.userId.slice(-6) : '' }}</small>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row)">详情</el-button></template></el-table-column>
          <template #empty><el-empty :description="list.available === false ? (list.note || '还没有会员订单') : '没有符合条件的会员订单'" /></template>
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
        <h2>会员列表 <small>共 {{ subs.total }} 人（本次读取 {{ subs.scanned }} 条）· 一期不自动续费</small></h2>
        <div class="order-tools">
          <el-select v-model="subStatus" style="width:130px" @change="loadSubs(1)">
            <el-option label="全部状态" value="all" />
            <el-option label="生效中" value="active" />
            <el-option label="已过期" value="expired" />
          </el-select>
          <el-select v-model="subLevel" style="width:140px" @change="loadSubs(1)">
            <el-option label="全部档位" value="all" />
            <el-option v-for="item in planInfo.plans || []" :key="item.code" :label="item.name" :value="item.code" />
          </el-select>
          <el-input v-model.trim="subKeyword" clearable placeholder="搜索账号 ID / 最近会员单号" style="width:270px" @keyup.enter="loadSubs(1)" @clear="loadSubs(1)" />
          <el-button :loading="subLoading" @click="loadSubs(1)">查询</el-button>
        </div>
        <p v-if="subs.truncated" class="hint warn">{{ subs.truncatedNote }}</p>
        <p v-else-if="subs.available === false" class="hint">{{ subs.note }}</p>

        <el-table v-loading="subLoading" :data="subs.rows" row-key="openIdMasked">
          <el-table-column label="会员" min-width="200">
            <template #default="{ row }">
              <strong>{{ row.levelName || '会员' }}</strong>
              <small class="sub mono">{{ row.openIdMasked || '—' }}</small>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="110" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">{{ row.statusLabel }}</el-tag>
              <small v-if="row.expiresSoon" class="sub warn-text">即将到期</small>
            </template>
          </el-table-column>
          <el-table-column label="开始时间" width="145"><template #default="{ row }">{{ row.startedText || '—' }}</template></el-table-column>
          <el-table-column label="到期时间" width="145"><template #default="{ row }">{{ row.expiresText || '—' }}</template></el-table-column>
          <el-table-column label="剩余天数" width="100" align="right"><template #default="{ row }">{{ row.status === 'active' ? row.daysLeft + ' 天' : '—' }}</template></el-table-column>
          <el-table-column label="最近会员单" min-width="215"><template #default="{ row }"><span class="mono">{{ row.lastOrderId || '—' }}</span></template></el-table-column>
          <el-table-column label="账号" width="150"><template #default="{ row }">{{ row.userId ? String(row.userId).slice(-8) : '—' }}</template></el-table-column>
          <template #empty><el-empty :description="subs.available === false ? (subs.note || '还没有会员') : '没有符合条件的会员'" /></template>
        </el-table>

        <div class="pager">
          <el-pagination
            :current-page="subs.page"
            :page-size="subs.pageSize"
            :page-sizes="[10, 20, 50]"
            :total="subs.total"
            layout="sizes, prev, pager, next, total"
            @current-change="loadSubs"
            @size-change="size => loadSubs(1, size)"
          />
        </div>
      </section>
    </template>

    <el-dialog v-model="detailVisible" title="会员订单详情" width="min(780px, 94vw)">
      <div v-if="detailLoading" class="detail-loading">正在读取订单与账本…</div>
      <template v-else-if="detail && detail.success">
        <div class="detail-head">
          <div><small>会员单号</small><strong class="mono">{{ detail.order.outTradeNo }}</strong></div>
          <div><small>档位 / 金额</small><strong>{{ detail.order.planName || '—' }} · {{ detail.order.priceYuan }} 元（{{ detail.order.priceTierLabel || '—' }}）</strong></div>
          <div><small>订单状态</small><strong>{{ detail.order.statusLabel }} · {{ detail.order.ledgerLabel }}</strong></div>
        </div>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="创建时间">{{ detail.order.createdText || '—' }}</el-descriptions-item>
          <el-descriptions-item label="支付时间">{{ detail.order.paidText || '—' }}</el-descriptions-item>
          <el-descriptions-item label="微信支付单号">{{ detail.order.transactionId || '—' }}</el-descriptions-item>
          <el-descriptions-item label="回调次数">{{ detail.order.notifyCount }}</el-descriptions-item>
          <el-descriptions-item label="付款人">{{ detail.order.openIdMasked || '—' }}</el-descriptions-item>
          <el-descriptions-item label="下单端">{{ detail.order.clientPlatform || '—' }}</el-descriptions-item>
          <el-descriptions-item label="本单赠滴">{{ detail.order.grantDrops }} 滴</el-descriptions-item>
          <el-descriptions-item label="定妆照折扣">{{ Number(detail.order.portraitDiscount) < 1 ? (Math.round(detail.order.portraitDiscount * 100) / 10) + ' 折' : '原价' }}</el-descriptions-item>
          <el-descriptions-item label="发放错误">{{ detail.order.ledgerError || '—' }}</el-descriptions-item>
          <el-descriptions-item label="关闭时间">{{ detail.order.closedText || '—' }}</el-descriptions-item>
        </el-descriptions>

        <h3>账本一致性</h3>
        <p class="reconcile" :class="{ bad: !detail.ledger.consistent }">
          账本合计 <strong>{{ balanceText(detail.ledger.balance) }}</strong>
          · 镜像余额 <strong>{{ balanceText(detail.ledger.mirror) }}</strong>
          · 结论：<strong>{{ detail.ledger.consistent ? '一致' : (detail.ledger.complete ? '不一致，需人工核对' : '账本过多，未计算') }}</strong>
        </p>
        <p v-if="detail.ledger.note" class="hint">{{ detail.ledger.note }}</p>

        <h3>本单赠滴流水</h3>
        <el-table :data="detail.ledger.entries" size="small">
          <el-table-column label="时间" width="150"><template #default="{ row }">{{ row.timeText || '—' }}</template></el-table-column>
          <el-table-column label="滴数" width="90" align="right"><template #default="{ row }">{{ row.delta > 0 ? '+' : '' }}{{ row.delta }}</template></el-table-column>
          <el-table-column prop="reason" label="原因" width="160" />
          <el-table-column label="流水 ID" min-width="200"><template #default="{ row }"><span class="mono">{{ row.id }}</span></template></el-table-column>
          <template #empty><el-empty description="还没有对应的赠滴流水（可能尚未发放）" /></template>
        </el-table>
        <p class="hint">幂等键：<span class="mono">{{ detail.ledger.refId }}</span></p>

        <h3>该账户会员状态</h3>
        <p v-if="detail.subscription" class="reconcile">
          {{ detail.subscription.levelName || '会员' }} · {{ detail.subscription.statusLabel }}
          · 到期 {{ detail.subscription.expiresText || '—' }}
          <template v-if="detail.subscription.status === 'active'">（剩 {{ detail.subscription.daysLeft }} 天）</template>
          · 首月价已用：{{ detail.subscription.firstMonthUsed ? '是' : '否' }}
        </p>
        <p v-else class="hint">该账户没有会员订阅记录。</p>

        <p v-if="detail.priceSnapshot" class="snapshot">价格快照：{{ JSON.stringify(detail.priceSnapshot) }}</p>
        <div class="dialog-actions"><el-button @click="detailVisible = false">关闭</el-button></div>
      </template>
      <div v-else class="detail-loading">{{ detail ? detail.error : '没有找到该订单' }}</div>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { callFunction } from '@/utils/cloud'

const PLAN_LABELS = { basic: '基础会员', plus: '进阶会员', pro: '专业会员', family: '家庭会员' }

const days = ref(7)
const status = ref('all')
const ledgerState = ref('all')
const planCode = ref('all')
const keyword = ref('')
const subStatus = ref('all')
const subLevel = ref('all')
const subKeyword = ref('')

const planLoading = ref(false)
const planSaving = ref(false)
const overviewLoading = ref(false)
const listLoading = ref(false)
const subLoading = ref(false)
const detailLoading = ref(false)
const error = ref('')
const planWarnings = ref([])

const planForm = ref([])
const planInfo = reactive({
  source: 'default', sourceLabel: '代码内置的 2026-10-27 已确认表', ready: true,
  reasonText: '', version: 0, updatedText: '', updatedByName: '', note: '', plans: [], defaults: [], history: []
})
const overview = reactive({ totals: null, subscription: null, byDay: [], byPlan: [], available: true, note: '', truncated: false, truncatedNote: '' })
const list = reactive({ rows: [], total: 0, page: 1, pageSize: 20, pageCount: 1, scanned: 0, available: true, note: '', truncated: false, truncatedNote: '' })
const subs = reactive({ rows: [], total: 0, page: 1, pageSize: 20, pageCount: 1, scanned: 0, available: true, note: '', truncated: false, truncatedNote: '' })
const detailVisible = ref(false)
const detail = ref(null)

const yuanOf = cents => (Number(cents) || 0) / 100
const centsOf = yuan => Math.round((Number(yuan) || 0) * 100)
const zheOf = discount => Math.round((Number(discount) || 1) * 100) / 10
const discountOf = zhe => Math.round((Number(zhe) || 10) * 10) / 100

function statusType(value) {
  return { paid: 'success', pending: 'warning', closed: 'info', refunded: 'danger' }[value] || 'info'
}
function ledgerType(value) {
  return { granted: 'success', pending: 'info', blocked: 'danger' }[value] || 'info'
}
function balanceText(value) {
  return Number.isFinite(value) ? value + ' 滴' : '未计算'
}
const maxDayCents = computed(() => (overview.byDay || []).reduce((max, day) => Math.max(max, day.grossCents || 0), 0))
function barWidth(cents) {
  if (!maxDayCents.value) return '0%'
  return Math.max(Math.round((Number(cents) || 0) / maxDayCents.value * 100), 2) + '%'
}

function toForm(plans) {
  return (plans || []).map(plan => ({
    code: plan.code,
    label: PLAN_LABELS[plan.code] || plan.name || plan.code,
    name: plan.name || '',
    firstYuan: yuanOf(plan.firstPriceCents),
    renewYuan: yuanOf(plan.renewPriceCents),
    yearlyYuan: yuanOf(plan.yearlyPriceCents),
    grantDrops: Number(plan.grantDrops) || 0,
    portraitZhe: zheOf(plan.portraitDiscount),
    order: Number(plan.order) || 1,
    visible: plan.visible !== false
  }))
}

function fromForm() {
  return planForm.value.map(row => ({
    code: row.code,
    name: String(row.name || '').trim(),
    firstPriceCents: centsOf(row.firstYuan),
    renewPriceCents: centsOf(row.renewYuan),
    yearlyPriceCents: centsOf(row.yearlyYuan),
    grantDrops: Math.round(Number(row.grantDrops) || 0),
    portraitDiscount: discountOf(row.portraitZhe),
    visible: row.visible === true,
    order: Math.round(Number(row.order) || 1)
  }))
}

// 与后端同一套规则的快速前置检查，避免明显不合法的配置白跑一次云端
function checkForm(plans) {
  const codes = new Set()
  for (const plan of plans) {
    if (!PLAN_LABELS[plan.code]) return '档位代码必须是 basic / plus / pro / family'
    if (codes.has(plan.code)) return '档位代码不能重复'
    codes.add(plan.code)
    if (!plan.name) return PLAN_LABELS[plan.code] + ' 的名称不能为空'
    if (!Number.isSafeInteger(plan.firstPriceCents) || plan.firstPriceCents <= 0) return PLAN_LABELS[plan.code] + ' 的首月价必须大于 0 元'
    if (!Number.isSafeInteger(plan.renewPriceCents) || plan.renewPriceCents < plan.firstPriceCents) return PLAN_LABELS[plan.code] + ' 的续费价不能低于首月价'
    if (!Number.isSafeInteger(plan.yearlyPriceCents) || plan.yearlyPriceCents <= 0) return PLAN_LABELS[plan.code] + ' 的年付价必须大于 0 元'
    if (Math.abs(plan.yearlyPriceCents - plan.renewPriceCents * 10) > plan.renewPriceCents * 5) return PLAN_LABELS[plan.code] + ' 的年付价应约为续费价的 10 个月'
    if (!Number.isSafeInteger(plan.grantDrops) || plan.grantDrops <= 0) return PLAN_LABELS[plan.code] + ' 的赠滴必须是大于 0 的整数'
    if (!(plan.portraitDiscount >= 0.5 && plan.portraitDiscount <= 1)) return PLAN_LABELS[plan.code] + ' 的定妆照折扣必须在 5–10 折之间'
  }
  if (codes.size !== 4) return '四档（basic/plus/pro/family）必须齐全'
  return ''
}

async function loadPlan() {
  planLoading.value = true
  error.value = ''
  try {
    const reply = await callFunction('platformOwner', { action: 'membershipPlanGet' })
    if (!reply.success) throw new Error(reply.error || '读取会员档位失败')
    Object.assign(planInfo, {
      source: reply.source, sourceLabel: reply.sourceLabel, ready: reply.ready !== false,
      reasonText: reply.reasonText || '', version: Number(reply.version) || 0,
      updatedText: reply.updatedText || '', updatedByName: reply.updatedByName || '',
      note: reply.note || '', plans: reply.plans || [], defaults: reply.defaults || [], history: reply.history || []
    })
    planForm.value = toForm(reply.plans || [])
    planWarnings.value = []
  } catch (err) {
    error.value = err.message || '读取会员档位失败'
  } finally {
    planLoading.value = false
  }
}

async function loadOverview() {
  overviewLoading.value = true
  error.value = ''
  try {
    const reply = await callFunction('platformOwner', { action: 'membershipOverview', days: days.value })
    if (!reply.success) throw new Error(reply.error || '读取会员汇总失败')
    Object.assign(overview, reply)
  } catch (err) {
    error.value = err.message || '读取会员汇总失败'
  } finally {
    overviewLoading.value = false
  }
}

async function loadList(page = 1, pageSize = list.pageSize) {
  listLoading.value = true
  try {
    const reply = await callFunction('platformOwner', {
      action: 'membershipOrderList', page, pageSize,
      status: status.value, ledgerState: ledgerState.value, planCode: planCode.value, keyword: keyword.value
    })
    if (!reply.success) throw new Error(reply.error || '读取会员订单失败')
    Object.assign(list, reply)
  } catch (err) {
    ElMessage.error(err.message || '读取会员订单失败')
  } finally {
    listLoading.value = false
  }
}

async function loadSubs(page = 1, pageSize = subs.pageSize) {
  subLoading.value = true
  try {
    const reply = await callFunction('platformOwner', {
      action: 'membershipSubscriptionList', page, pageSize,
      status: subStatus.value, levelCode: subLevel.value, keyword: subKeyword.value
    })
    if (!reply.success) throw new Error(reply.error || '读取会员列表失败')
    Object.assign(subs, reply)
  } catch (err) {
    ElMessage.error(err.message || '读取会员列表失败')
  } finally {
    subLoading.value = false
  }
}

function refreshAll() {
  return Promise.all([loadPlan(), loadOverview(), loadList(list.page), loadSubs(subs.page)])
}

async function restoreDefaults() {
  if (!planInfo.defaults.length) { ElMessage.warning('还没有读到默认档位表，请先刷新数据'); return }
  try {
    await ElMessageBox.confirm('把平台内置的 2026-10-27 已确认档位表填入表单？还需要点「保存档位」才会生效。', '填入默认表', {
      type: 'warning', confirmButtonText: '填入', cancelButtonText: '取消'
    })
  } catch (err) {
    return
  }
  planForm.value = toForm(planInfo.defaults)
  planWarnings.value = ['已填入平台内置默认表，点「保存档位」后才会生效']
}

async function savePlans() {
  const payload = fromForm()
  const problem = checkForm(payload)
  if (problem) { ElMessage.error(problem); return }
  const changed = planForm.value.filter(row => row.visible !== false).map(row => row.label).join('、')
  try {
    await ElMessageBox.confirm(
      `保存会员档位并立即对新的购买生效？当前开放售卖的档位：${changed || '无'}。已付款订单按购买时的价格快照结算，不受影响。`,
      '保存会员档位',
      { type: 'warning', confirmButtonText: '保存并生效', cancelButtonText: '取消' }
    )
  } catch (err) {
    return
  }
  planSaving.value = true
  planWarnings.value = []
  try {
    const reply = await callFunction('platformOwner', { action: 'membershipPlanSave', version: planInfo.version, plans: payload })
    if (!reply.success) throw new Error(reply.error || '保存会员档位失败')
    planInfo.version = Number(reply.version) || planInfo.version
    planInfo.source = reply.source || 'db'
    planInfo.sourceLabel = '库内已保存配置'
    planInfo.updatedText = reply.updatedText || ''
    planInfo.updatedByName = reply.updatedByName || ''
    planInfo.ready = true
    planInfo.reasonText = ''
    planInfo.note = '库内配置优先于 webLoginApi 的环境变量与代码默认表，保存后立即对新会员生效（已购会员按购买时的快照结算）。'
    const savedWarnings = Array.isArray(reply.warnings) ? reply.warnings : []
    ElMessage.success('会员档位已保存，版本 v' + planInfo.version)
    await Promise.all([loadPlan(), loadOverview()])
    planWarnings.value = savedWarnings
  } catch (err) {
    ElMessage.error(err.message || '保存会员档位失败')
    if (/刷新/.test(String(err.message || ''))) await loadPlan()
  } finally {
    planSaving.value = false
  }
}

async function openDetail(row) {
  detailVisible.value = true
  detailLoading.value = true
  detail.value = null
  try {
    const reply = await callFunction('platformOwner', { action: 'membershipOrderDetail', outTradeNo: row.outTradeNo })
    detail.value = reply
  } catch (err) {
    detail.value = { success: false, error: err.message || '读取会员订单详情失败' }
  } finally {
    detailLoading.value = false
  }
}

function refresh() { return refreshAll() }
defineExpose({ refresh })

onMounted(() => { refreshAll() })
</script>

<style scoped>
.membership-admin{color:#26392d}
.toolbar,.order-tools,.actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:14px}
.actions{margin-top:14px;margin-bottom:6px}
.source{color:#7a8a7f;font-size:12px}
.error{margin:0 0 14px;padding:10px 12px;border-radius:8px;background:#fdecec;color:#a63b3b;font-size:13px}
.hint{margin:6px 0 12px;color:#7a8a7f;font-size:12px}
.hint.warn{color:#a0641d}
.hint.bad{color:#a63b3b}
.block{margin-bottom:20px;padding:16px;border:1px solid #e2ece5;border-radius:12px;background:#fff}
.block h2{margin:0 0 12px;font-size:15px}
.block h2 small{margin-left:6px;font-weight:400;color:#7a8a7f;font-size:12px}
.block h3{margin:18px 0 8px;font-size:14px}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:18px}
.stat-card{display:block;padding:14px 16px;border:1px solid #e2ece5;border-radius:12px;background:#fff}
.stat-card small{display:block;color:#7a8a7f;font-size:12px}
.stat-card strong{display:block;margin:6px 0 4px;font-size:26px;color:#1f6b45}
.stat-card strong em{margin-left:4px;font-size:12px;font-style:normal;color:#7a8a7f}
.stat-card span{font-size:12px;color:#7a8a7f}
.stat-card.warn{border-color:#f0d9b8;background:#fff9f0}
.stat-card.warn strong{color:#a0641d}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#4a6352}
.sub{display:block;color:#7a8a7f;font-size:11px;line-height:1.6}
.sub.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.sub.warn-text{color:#a0641d}
.warn-text{color:#a0641d}
.day-list{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}
.day-row{display:grid;grid-template-columns:52px 1fr 130px;gap:10px;align-items:center;font-size:12px}
.day-key{color:#7a8a7f}
.day-bar{height:10px;border-radius:5px;background:#f2f6f3;overflow:hidden}
.day-bar i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#7fc39a,#2f8a58)}
.day-value{text-align:right;color:#26392d}
.day-value em{font-style:normal;color:#7a8a7f}
.plan-list{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.plan-chip{padding:4px 10px;border-radius:999px;background:#f4f8f5;color:#4a6352;font-size:12px}
.warnings{margin-top:10px;padding:10px 12px;border-radius:8px;background:#fff9f0;border:1px solid #f0d9b8}
.warnings p{margin:4px 0;color:#a0641d;font-size:12px}
.history{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.history li{display:grid;grid-template-columns:56px 130px 110px 1fr;gap:10px;font-size:12px;color:#4a6352}
.history-summary{color:#7a8a7f}
.pager{display:flex;justify-content:flex-end;margin-top:12px}
.detail-head{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:14px}
.detail-head small{display:block;color:#7a8a7f;font-size:12px}
.detail-head strong{font-size:13px}
.reconcile{margin:0 0 8px;padding:10px 12px;border-radius:8px;background:#f2f8f4;font-size:13px}
.reconcile.bad{background:#fdecec;color:#a63b3b}
.snapshot{margin-top:10px;color:#7a8a7f;font-size:12px;word-break:break-all}
.detail-loading{padding:30px 0;text-align:center;color:#7a8a7f;font-size:13px}
.dialog-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}
@media (max-width: 900px){
  .history li{grid-template-columns:1fr;gap:2px}
}
</style>
