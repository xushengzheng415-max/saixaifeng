'use strict'

// Sanitized, historical evidence only. This is not a live cloud telemetry source.
const source = '2026-10-01 capacity-audit/findings.json（只读审计）'
const sampledAt = '2026-10-01' // The audit records a date, not an exact timestamp.
const window = { from: '2026-09-30T07:00:00Z', to: '2026-10-01T07:00:00Z' }
const historical = (key, label, value, unit, definition) => ({ key, label, value, unit, status: 'historical', source, sampledAt, window, definition })

module.exports = {
  metrics: [
    historical('auditPeakQps', '历史环境峰值 QPS', 189, '次/秒', '请求窗口内环境汇总；包括开发与测试活动，部分指标滞后。QPS数据截至10月1日12:00（北京时间），不是当前QPS或压测上限。'),
    historical('auditInvocations', '历史函数调用量', 3637, '次', '审计窗口内环境函数汇总，不代表单独页面或当前每秒请求。'),
    historical('auditConcurrent', '历史峰值函数并发', 6, '次', '已观察到的并发，不代表配额或安全容量。'),
    historical('auditErrors', '历史函数错误数', 6, '次', '环境级历史计数；未核实逐请求错误日志。'),
    historical('auditDatabaseReads', '历史数据库读请求', 39300, '次', '历史监控计数；与本地SDK get次数的计费映射尚未确认。'),
    historical('auditDatabaseSize', '历史数据库大小', 9, 'MB', '10月1日审计历史值，不是当前存储占用。'),
    historical('webMemoryConfigured', 'Web入口历史配置内存', 256, 'MB', 'webLoginApi配置；不是当前进程占用或账号总配额。'),
    historical('miniMemoryConfigured', '小程序入口历史配置内存', 512, 'MB', 'getMiniWorkspace配置；不是当前进程占用或账号总配额。')
  ],
  quotas: [
    { key: 'environmentQps', label: '个人版环境 QPS 配额', limit: 500, used: null, unit: '次/秒', status: 'historical', source, sampledAt, definition: '审计套餐ID baas_personal，PREPAYMENT，enableOverrun=false。额度不是500用户保证；尚未实时接入套餐变更或当前使用量。' },
    { key: 'accountConcurrency', label: '账号函数并发配额', limit: null, used: null, unit: '次', status: 'unavailable', source: '未接入：scf:GetAccount曾被拒绝', sampledAt: null, definition: '需另行授权只读云配置；不能由QPS配额推算。' },
    { key: 'monthlyCompute', label: '当月函数计算用量', limit: null, used: null, unit: 'GB·秒', status: 'unavailable', source: '未接入：账单与资源包数据', sampledAt: null, definition: '未读取当月计费用量、资源包及超额规则。' },
    { key: 'databaseStorage', label: '数据库存储配额', limit: null, used: null, unit: 'MB', status: 'unavailable', source: '未接入：实时配额与存储监控', sampledAt: null, definition: '9MB历史大小不作为当前used；没有推测个人版存储上限。' }
  ],
  tests: [
    { id: 'public-read-probe-20261001', title: '公开赛事中心只读探测', type: 'production_probe', verifiedAt: sampledAt, scope: 'publicTournamentCenter：三次顺序GET', productionSafeQps: null, summary: '2284 / 2429 / 2523ms；响应220860字节；HTTP 200。', limitations: ['不是压力测试，没有测并发、安全QPS、P95或P99。', '测量对应审计下载的生产源码，与本地权威基线不同。'] },
    { id: 'local-read-optimization-20261001', title: '读取优化本地合成回归', type: 'local_synthetic', verifiedAt: sampledAt, scope: '基线1b046eb；PC/H5响应等价、1250球员及5101比赛完整分页、权限和在途共享', productionSafeQps: null, summary: '合成数据库；H5关联读取最多4路并行；没有生产数据、生产压测或部署。', limitations: ['认证与机构解析被隔离以比较查询开销；不是完整HTTP测试。', '本机耗时、CPU和内存不能转为生产并发容量。', '部分完整分页路径增加get次数，需按路径验收和核对实际索引。'] }
  ]
}
