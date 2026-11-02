# 发现转会市场：真实球员池与完整分页

日期：2026-10-28。状态：本地候选已实现与测试，尚未部署或上传小程序。

## 本轮目的

用户要求平台内容充实。当前已发布 v4 的全平台球员区只展示已完成身价测算的球员，导致实际只有1人；选定立洋杯才展示该赛事球员，且只取前30人。本轮将内容池与货币榜单分开，沿用户确认的原图结构展示更多真实资料，不增加装饰统计或伪造竞技指标。

## 候选展示口径

- 全平台“发现球员”：汇合公开、非草稿赛事的已审核名单，以稳定 playerId 去重；选定赛事则只取该赛事已审名单，竞赛组别继续在赛事内筛选。
- 不读取整个平台的私有球员库作为公开候选来源。明确私有/未发布赛事、不公开球员、删除记录、测试来源，以及测试球队/赛事下的名单不进入公开球员池和人数。
- 未测算球员保留名字、球队、位置和现有接口允许展示的照片，标“身价未测算”。已测算球员显示真实快照金额；青少年身价保持不公开规则。
- 身价榜、上升最快继续沿统一身价快照计算口径；未测算球员不以0元进入榜单，不补造涨幅、交易或走势。
- 已知生日为青少年时不因旧快照缺失/错误成人标记而公开货币金额；缺少可信成人依据时保留不公开状态。
- 每次30人，继续加载覆盖全池。分页追加保留已加载行，按 playerId 去重；重复触底不并发重取。

这属于本轮本地候选的公开展示实现边界，尚未改变生产的 v4 行为；此前 v4/B2 发布记录保留为历史事实。公开字段、报价/合同权限、球员资料页开放与计费边界不变。

## 接口与源码

`dataCenter.transferShowcase` 原有公开只读入口保持，候选响应升级为 `transfer-showcase/5`。

- 新增请求：`playerCursor`，不传表示第一页。
- 新增响应：`playerHasMore`、`nextPlayerCursor`、`playerPoolVersion`、`playerPageOffset`。
- `playerPool`：`roster` 为本赛事池；`public_roster` 为公开赛事名单合并池。
- `playerTotal`：经过有效球员、公开范围与测试来源过滤后的候选池人数；`playerMeasuredCount` 仍仅表示本次返回行中已测算人数，不冒充全平台测算总量。
- 游标绑定赛事、年龄段和球员池有序版本。范围或排序改变返回 `DATA_VIEW_CHANGED`，客户端提示刷新；非法游标返回 `DATA_CURSOR_INVALID`。
- 名单、资料读取失败返回错误，不当作空名单；超过读取预算明确要求先选择赛事，不静默截断。

后端：`cloudfunctions/dataCenter/transfer/showcase.cjs`、新增 `public-roster-pool.cjs`。复用 `shared/reader.cjs`、`shared/roster.cjs`、`shared/statistics.mjs` 的完整读取、名单和 synthetic 排除，不新建身价算法。

小程序：`miniprogram/pages/discover/discover.js`、`discover-model.js`、`discover.wxml`、`discover.wxss`。支持触底/按钮续页、错误重试、池变化刷新、切号清理游标、图片懒加载。搜索与位置筛选作用于已加载球员，字段明确此范围。旧 v4 没有分页字段时保持兼容，不显示无效的加载按钮。

## 验证证据

- 线上只读核对：立洋杯 v4 返回已审核池总数322、当前页30、该页已测算1。没有写入或重新测算任何身价。
- 使用该线上公开响应，通过正式页面数据适配器及WXML/WXSS生成浏览器布局预览：`outputs/发现真实球员充实20261028/`。这是赛事范围当前30人的真实展示，不冒充 v5 已上线的全平台池，也不是原生截图。公开响应JSON及临时图片地址仅保留工作目录，不归档数据库导出或个人资料到知识库。
- `tools/test-transfer-public-roster-pool.cjs`：隔离322人分11页，无重复漏人；跨赛事稳定ID去重；未测算保留；私有/测试三层排除；青少年隐藏；跨范围/版本游标阻断；读取失败不返回假空。
- `tools/test-discover-market-view.cjs`：真实金额、状态与搜索、追加去重、防重复触底、续页失败保留、池变更刷新、切号清游标、过期响应和WXML限制通过。
- 既有 `test-mini-transfer-center-pages.cjs`、`test-transfer-center.cjs`、`test-data-center.mjs`、`check-data-governance.mjs` 通过。
- `node --check` 相关JS/CJS通过；`git diff --check` 无本轮格式错误。
- `sync-data-center.mjs --check` 仍报12项既有共享副本不一致（statistics.mjs/service.cjs），本轮未改这些共享文件，未执行同步覆盖其他任务。

## 上线前步骤

当前任务尚未明确授权云端变更，故不部署 `dataCenter`，不上传小程序、不设置体验版、不提交审核。

获得授权后，必须重新下载最新线上 dataCenter 整包，差量加入本轮2个转会文件，检查 shared 依赖兼容与相对require完整性，保留运行配置；发布后回下载比对并运行公开范围/分页只读探针，再上传对应小程序开发版。上传、体验版设置、审核与正式发布分别报告。不得把本地其他会话的后端改动或未验证共享副本一并覆盖生产。
