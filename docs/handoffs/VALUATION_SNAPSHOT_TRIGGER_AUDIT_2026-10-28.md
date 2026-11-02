# 球员身价缺失：计算与保存链路核对

日期：2026-10-28。仅只读调查，未触发球员档案接口、估值写入、补算、生产部署或小程序上传。

## 已核验事实

1. 线上 `player_valuations` 以最小字段投影读取，集合总记录数为1，coverage=complete，scopeKey=career，计算时间2026-10-26。此前立洋杯公开接口返回已审核名单池322人、当前页30人、其中有已保存公开估值1人。
2. 线上dataCenter当前修改时间仍为2026-10-28 14:24:07，与本地保存的v4发布读回基线一致；函数没有timer触发器。不能据此排除所有外部定时调度，但本轮核验的源码没有接通全员初始化或赛后批量估值快照更新。
3. `shared/service.cjs` 的 `query` 在单球员统计查询时调用 `buildPlayerValuation`，形成当前响应中的实时估值；这条计算路径本身不保存估值快照。
4. 已确认的持久化调用点在 `shared/hub.cjs` 的平台负责人 `playerProfile`：查询正式生涯统计后调用 `valuation-store.record`。当前本地hub和valuation-store文件与上述线上读回基线的SHA-256一致。
5. `valuation-store.record` 只接受coverage=complete且total为有限数的结果，按球员/算法/统计范围/授权/数据版本/日期幂等保存；待评估结果不入库。hub对保存失败做catch，仍可返回档案，因而“档案能看到估值”不证明“公开榜单已有该快照”。
6. `buildPlayerValuation`要求存在该球员统计行，且每行 appearances、starts、minutesPlayed 的coverage均为complete；缺这些核心依据时返回pending。缺年龄、位置等其他因子与缺核心比赛数据不是同一条件，不能一概解释为缺资料就无法测算。
7. 发现页与转会估值展示读取player_valuations，未在浏览公开市场时现场计算或保存每个人的身价。

## 结论边界

当前存在“实时计算—快照持久化—公开展示”连接不完整的问题。仅凭没有快照，不能判定其余321人都没有比赛数据或都不具备测算条件；也不能未经逐人检查就断言全部都能立即计算。

前一轮公开球员池与分页修复只解决名单可见性，不解决估值生成覆盖率。本轮没有为了充实页面而给球员补0元或固定基础价，没有改估值算法。

## 后续处理建议

- 先用统一服务做无写入的全员检查，区分可计算但未保存、核心比赛依据不足、青少年不公开、身份/来源异常及保存失败。
- 对符合条件的球员准备受控、幂等、可续跑的首次快照生成；沿现有已确认算法和完整度规则，不降低核心依据门槛。
- 将正式比赛确认/修订后的估值刷新接入明确的服务端流程，公开页保持读取；失败应可追踪，不依赖人工逐个打开档案。
- 批量写入、自动任务及生产发布属于后续明确授权范围，本次未执行。准确可补算人数需完成逐人检查后再报告。

## 代码入口

- `cloudfunctions/dataCenter/shared/service.cjs`：buildPlayerValuation / query。
- `cloudfunctions/dataCenter/shared/hub.cjs`：playerProfile / valuation-store.record。
- `cloudfunctions/dataCenter/shared/valuation-store.cjs`：完整度门槛与幂等持久化。
- `cloudfunctions/dataCenter/transfer/showcase.cjs`：公开读取已有快照。
