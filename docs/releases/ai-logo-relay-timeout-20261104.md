# AI 队徽修复：中转超时 + 错误文案（2026-11-04）

## 一、问题

用户在轻量赛事「葛村蒿小足球俱乐部 · U9男子组」点击「AI 生成球队队徽」，界面只显示红字
「AI 队徽生成失败」，没有任何候选图。

排查结论（线上日志与线上代码包交叉验证）：

| 时间 | 事实 |
|---|---|
| 13:31:03 | 前端经 `webLoginApi` relay 调 `generateAIImage`，参数 `teamName=三面二班`、圆形、蓝色 |
| 13:31:18 | relay 抛 `callFunction:fail ESOCKETTIMEDOUT`（SDK 默认约 15 秒即放弃），返回 `success:false` |
| 13:31:23 | `generateAIImage` 实际执行成功：`aiProvider/aiModel = hunyuan-image`，图片已生成并上传 |

即**生图成功、结果被中转超时丢弃**。前端因 `result.success !== true` 且无 `message`，回落到兜底文案
「AI 队徽生成失败」，现场无法判断真实原因。

另有独立问题（本次未修）：`removeLogoBg`（百度 `object_segment`）返回 `Unsupported openapi method`，
候选取图未完成抠底，是白底 JPG。需在百度智能云侧开通该接口，代码侧无法解决。

## 二、改动

1. 后端 `cloudfunctions/webLoginApi/index.js`（`handleCallFunction`）
   ```js
   ...(functionName === 'parseTournamentRegulations' ? { timeout: 270000 } : {}),
   ...(functionName === 'generateAIImage' ? { timeout: 180000 } : {})
   ```
   与 `parseTournamentRegulations` 同口径，给生图单独留足中转余量。
2. 前端 `web-admin-vue/src/components/tournament/TeamLogoAiGenerator.vue`
   失败时优先展示 `result.message`，并拼接 `result.error`（如 `callFunction:fail ESOCKETTIMEDOUT`）；
   两者都没有才回落到「AI 队徽生成失败」。

## 三、发布与验证

### 后端（共享正式函数，已在线）

- 发布方式：从最新线上包 `fn code download webLoginApi` 差量修改，`fn code update --dir` 只更新代码
- 差量证据：与重新下载的线上原包 `git diff --no-index` 仅 `index.js` 一处，`1 file changed, 4 insertions(+), 1 deletion(-)`
- `node --check` 通过；`node tools/check-referee-backend-package.cjs <包目录>` 通过（含报名上传链路检查）
- 发布后回读（`fn detail --json`）：`Status=Active`、`AvailableStatus=Available`、`Timeout=120`、
  `MemorySize=512`、`Runtime=Nodejs18.15`、`InstallDependency=TRUE`（保持原有登记配置，未改动）；
  `CodeInfo` 中同时存在 `parseTournamentRegulations`（270000）与 `generateAIImage`（180000）

### 前端（仅测试端 `/preview/admin/`）

| 文件 | SHA-256 | 字节 |
|---|---|---|
| index.html | 4302D09AF14F44727B29176979AF1605A14C46695C12DF589EBF3ACA10981F62 | 818 |
| index-CsWMntax.js（入口） | C54816ED9DF349B676B1DC0469F9C021621D7F7356B42AA350A60300D69A70CD | 289,880 |
| TournamentTeams-Qy7kZ7vt.js | BEB01EE000480097308F3E8332D443C51E1F936C7F9CA342B98267D4B303A8AC | 242,123 |

线上分包回读命中：`AI 队徽生成失败：`（新错误文案）、`r=>Bl("batch")`（轻量模式直达批量添加）。

正式 `/admin/` 未发布，等待验收。

## 四、遗留

- 百度「通用物体分割」(`object_segment`) 未开通 → 队徽仍为白底，无透明 PNG
- `generateAIImage` 云函数自身线上配置为 256MB / 60 秒（仓库 `config.json` 写的是 512MB / 120 秒）；
  混元生图遇慢响应时仍有被函数自身超时截断的风险，属配置变更，需单独授权
- 轻量模式左侧导航隐藏「报名管理」，批量加队入口仍只在报名管理页，可达性待产品确认
