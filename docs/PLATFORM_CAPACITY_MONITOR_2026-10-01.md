# 平台容量与性能监控候选

日期：2026-10-01。状态：平台方后台本地实现，未推送/部署，未运行压力测试，未接入新云资源、凭据或IAM权限。与 [球队/球员读取优化](TEAM_PLAYER_READ_PERFORMANCE_2026-10-01.md) 分别验收；有监控页面不意味着读取性能或生产容量已验证。

## 入口与权限

平台运营中心 `/admin/#/tournament-center-admin?section=capacity` 左侧“容量与性能监控”，与球员卡系统同级。不是主办方工作台，也不是公开页面；“公开数据”表示公开业务资料汇总，不向公众开放监控。

前端先要求平台会话通道；统一HTTP `platformCapacityOverview` 返回前由 `authenticateWebSession` 校验 `principalType === platform_owner` 且 `user.isPlatformOwner === true`。普通机构管理员、伪造客户端role、匿名、缺owner标记和失效会话都不能读。每次缓存命中仍重新鉴权。使用现有平台令牌隔离，不硬编码手机号或扩大机构管理权限。

返回固定聚合契约，不接受客户端collection/where/用户ID；没有球员名单、证件、手机号、监护人、凭据或原始日志。action和监控模块不写数据库、改权限或配置。前端身份变化时清空并丢弃迟到响应，机构会话本地不发监控请求。

## 指标定义与可用性

| 分类 | 本地接口已实现 | 未接入/限制 |
|---|---|---|
| 全平台规模 | teams/players/tournaments/matches服务器count | 档案文档数，不等于去重自然人或公开数量；包含草稿/归档 |
| 公开业务规模 | football已发布赛事快照版本count、status=published新闻记录count | 快照版本不是去重赛事数，新闻实际可见还受公开关系控制；公开球队/球员去重数为null，缺低成本权威汇总 |
| 当前可采集 | 本次count采样耗时、采样Node进程RSS | 不含认证/网络；单进程RSS不是全环境总资源或峰值；缓存命中不重采 |
| 请求/错误/资源遥测 | 字段、来源、窗口、状态及告警占位契约 | 当前QPS、请求量、P95、错误率、环境CPU/实际内存均null；没有虚构实时值 |
| 套餐/配额 | 2026-10-01审计个人版ID baas_personal与500 QPS历史额度 | 当前used=null；账号并发配额、当月计算资源包及存储配额null，不用历史189峰值计算当前利用率 |
| 历史审计 | 明确historical状态、采集日期、请求窗口、开发/测试与指标滞后说明 | 只读审计不是实时数据；只有日期时不补虚构时分秒 |
| 压测记录 | 本地合成读取回归与三次顺序生产只读探测的时间/场景/验证范围/局限 | 没有经过生产压测验证的安全QPS或用户数，verifiedProductionSafeQps=null，无“启动压测”按钮 |

80%为页面配额利用率预警比例，不是压力测试安全阈值。只有新鲜、已接入且limit/used真实数值时才计算配额比例。未知或历史值不显示绿色“负载正常”，告警只在平台页面内，不发外部消息。当前页面可如实呈现“业务计数可用，实时监控尚未接入”。

历史证据为已脱敏常量capacityAudit20261001.cjs，包含审计结论与有限历史数字；没有复制密钥/原始个人资料/云日志。页面不能以刷新将这些常量变为“实时”。本地测试截图中的fixture明确标记，不能作为真实服务器数据交付。

## 采样成本与刷新策略

六个固定count聚合，最多三路并行，不调用集合get或逐条读取。count仍可能需要数据库内部扫描/索引，计费必须另核验，不能宣称零成本。当前不扫描公开快照payload求去重球员数。

服务端每温实例缓存300秒，同实例并发刷新共享一个pending采样；客户端forceRefresh不能绕过TTL。每次采样标采样时间、过期时间和缓存状态。失效后某项失败，保留它上次成功值并标stale和原时间；首次失败value=null。部分失败仍返回其他可用项，全部失败不伪装为0。

缓存为Node进程内缓存，不是跨实例全局缓存。冷启动和多个实例可能各执行六个count，不能承诺全环境五分钟严格六次。若实际监控使用量上升，另行设计现有数据库中的定期汇总/跨实例锁；当前不创建新集合、定时任务或付费资源。

前端按需加载，五分钟轮询仅在页面可见且平台会话有效时运行；切走标签卸载清理，隐藏页面暂停。重复刷新合并在途请求；后端权限拒绝终止轮询。capacity深链首载和顶部刷新不调用运营overview的全量资料加载；切到原运营功能再惰性加载一次。

## 本地验证

```powershell
node --preserve-symlinks --preserve-symlinks-main tools/test-capacity-monitor.cjs
node --preserve-symlinks --preserve-symlinks-main tools/test-capacity-monitor-ui.cjs
```

后端39项：匿名/机构管理员/伪造role/缺owner标记拒绝且零count；真实action分发；20次并发刷新只六次count、最大三路；每次cache hit鉴权；TTL与forceRefresh不能旁路；真零与unknown null区分；部分失败、原采样时间、stale、全失败、恢复、历史值不算当前使用率；无doc读取/数据库写入，读取错误不输出私密异常内容。

前端18组独立回归覆盖Vue/ElementPlus真实SSR渲染、null/真零/日期/空/过期/失败、身份拒绝/变化丢弃、重复刷新、可见轮询、隐藏暂停和卸载清理；历史/过期配额只显示当前—且无进度。1920/1365/390浏览器截图无整页横向溢出；重复刷新1请求、身份切换清空、机构会话0监控请求、capacity深链0全量overview调用、pageerror=0。所有截图均显式标记本地fixture并拦截HTTP，生产请求/压测为0。最终构建见verification记录，真实平台账号与上线遥测还未验收。

## 后续接入方案与上线前确认

1. 先回读最新生产函数/前端和当前Gitee，与读取优化及其他并行修复精确合并；本地基线与审计下载不同，不整包覆盖。
2. 保留旧ZIP/PC构建，按当前用户授权发布监控代码后用平台及机构账号分别验证，读回源码和页面资源；当前没有部署授权，因此不执行。
3. 实时指标优先利用现有环境DescribeCurveData只读来源，按5分钟或更低频采集，清晰区分历史窗口/实时采样延迟/开发活动。不要把审计机器外部凭据拷入函数或前端。
4. 若需Tencent Monitor/scf账户额度/账单API或日志接入，先列最小IAM只读动作、字段脱敏、保留时间、更新频率和成本再确认；当前monitor:GetMonitorData/scf:GetAccount已知被拒绝，不尝试扩权。只有同窗口请求与错误分母齐全才提供错误率；P95需要足够逐请求样本或官方分位指标。
5. 公开球队/球员去重数量需以已发布版本/业务关系为权威汇总；方案是写入发布流程维护可重建汇总，并标版本/更新时间，防止每刷新全表扫描。新增持久汇总/迁移另行确认，当前保持null。
6. 安全阈值需在隔离环境先定义真实场景、规模、并发阶梯、停止条件、P95/P99/错误率/CPU/内存/DB预算，记录每端请求倍增与缓存命中；禁止由500 QPS额度或本地测试推断。任何生产压测另行确认。

回滚：恢复上线前保存的webLoginApi精确版本及PC构建，移除新导航/action；没有数据库、索引或权限迁移，不删除业务数据。不要用旧Git基线代替当时线上回滚包。

## 文件

后端：webLoginApi/capacityMonitor.cjs、capacityAudit20261001.cjs；index.js仅新增lazy singleton与action。前端：CapacityPerformanceMonitor.vue、utils/capacityMonitor.js、TournamentCenterAdmin.vue；cloud.js导出统一HTTP并将action纳入在途共享与身份guard。测试：test-capacity-monitor.cjs、test-capacity-monitor-ui.cjs及局部辅助。data-center/INTEGRATION登记此聚合不新增竞技统计真值。
