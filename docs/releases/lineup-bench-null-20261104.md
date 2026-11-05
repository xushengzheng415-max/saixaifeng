# 达壹比赛替补席0/0：空配置解析修复

> 后续已与定版规则调整功能一并集成到测试版，当前测试提交与发布证据见[执行规则记录](division-execution-rules-20261104.md)。正式PC仍未覆盖。

- 日期：2026-11-04，Asia/Shanghai。
- 当前状态：测试 /preview/admin/ 已发布并HTTP/摘要读回；正式 /admin/ 未覆盖，等待本次正式发布授权。

## 线上诊断

截图为达壹体育对树青中医的竞技组8人制比赛。只读核验当前组别 matchFormat=8side，regulationDetails.benchTotalLimit、benchPlayerLimit、benchOfficialLimit 均为 null，表示未设置，并非明确禁止替补。

MatchDetail.resolveSubstitutePlayerLimit 对 null 使用 Number 后得到0，传给 VisualLineupEditor；组件对显式传入null也使用Number得到0。maxBenchSlots=0导致两队的空替补槽位数量均为0，既显示0/0也没有可点击的加号。没有证据表明需补建球队或球员，也不需要修改这场真实比赛数据。

## 最小修改

- 新增 utils/lineupBenchLimit.js，由比赛详情和阵容组件共用解析；null、undefined、空字符串和非法值表示未设置，数字0仍是有效限制。
- 延续现有规程优先级和既有8人制默认8个替补席名额，不改变总人数/球员人数业务口径，不写数据库。
- 原测试复制了一份解析函数，改为直接导入生产模块，新增真实null规程、空值继承、明确0、字符串数字与非法值覆盖。
- 未改云函数、小程序、H5、球员卡套件、人员资格、赛果与正式阵容。

## 验证与发布

- 生产共享模块回归通过。
- 真实 VisualLineupEditor 组件本地浏览器测试通过：null配置显示两队各8个空位，主客队均可选人进入替补席；明确0不出现空位。测试全为隔离人员，未访问云端、未保存真实比赛；截图 output/bench-null-20261104/both-benches-selected.png。
- GitHub最新preview c510f132为基线，功能提交b676bc95，preview合并提交ec7fe14e400ef8ee9b1d25395b79d11376ac9c42，均已推送；未合并main。保留主工作区其他任务修改。
- 依赖锁与主仓相同，npm run build，VITE_APP_BASE=/preview/admin/；2977模块、43.57秒构建通过。
- 发布407文件到preview/admin。7项入口及关键JS/CSS均HTTP200且SHA-256与本地一致；入口df647a2da27738921158591b2e838e5628170921b963d5e390eeb9795c075167，MatchDetail-ESYW_aqI.js为96cc37f422fad54dd34c72a965b0389eb9d5fc4e19fba1b347d3da080eb01773。
- 正式入口前后SHA-256保持31f17f9708a0d2463cea20bb9ace8abd7ecefb386820fd76abf2168714b3ccfc，不宣称正式用户已获得修复。
- 发布前默认Windows烟测会话遇网络进程重启并超时；改为本任务全新独立会话串行执行后，发布前后正式与测试通道均8/8。该验证不读取用户个人登录会话，也不代表用户设备实际业务已验收；报告保存在output/bench-null-20261104/desktop-{before,after}/。
- 线上证据：work/bench-null-20261104/http-readback.json。测试保留preview未验收功能，功能分支尚未进入main，未删除。
