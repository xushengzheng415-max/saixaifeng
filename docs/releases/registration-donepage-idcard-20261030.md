# A+B 发布记录：登记完成页 + 身份证籍贯发号（2026-10-30）

授权：用户确认「按着你的建议走」（A 完成页 + B 籍贯发号）。

## A. 服务号 H5 球员登记独立完成页

### 范围
- `service-account-h5/service-entry.js`（相对线上仅完成页差量：+23/−25）
- `service-account-h5/service-entry.css`（追加 `.done-page` 样式 +9）
- `join-player.html` / `claim-team.html` / `registration-ai-test.html`（缓存标记 `?v=20261030-donepage2`）

发布前核对：线上 `service-entry.js`（93,247 B / `F2E6A09A…`）已含 AI 面板 v2；本地相对线上仅为完成页改动，未夹带其他会话文件。`join-player.html` 正式页继续 `window.SXF_AI_SHEET_V2=true`（用户此前已授权切正式）。

### 发布
- 正式：`hosting deploy` → `service-account-h5/`（5 文件）
- 测试：同内容 → `preview/service-account-h5/`（5 文件；此前 preview 缺 `service-entry.js`，本次一并补齐）

### 回读（`Cache-Control: no-cache`，字节 SHA-256）

| 文件 | 大小 | SHA-256 | 正式 | 测试 |
|---|---|---|---|---|
| `service-entry.js` | 93,173 | `915230A3C1CB326591E5643FAA960CE01EC4728A4FBC885E12946F39A7399926` | MATCH | MATCH |
| `service-entry.css` | 18,218 | `411D31F1675C6FEC8D6BFD2DBD0F6178BDCE0E5A573918551241948B46E7BC11` | MATCH | MATCH |
| `join-player.html` | 1,052 | `537DFBD66DDB495A848B9652C86628DB7FA498A37D0C7E6384ADBB7EAF0DD82E` | MATCH | MATCH |
| `claim-team.html` | 559 | `35847FED0CE06C4985613C149428843B287BD94531C22DB22BDB9D668A59E4A7` | MATCH | MATCH |
| `registration-ai-test.html` | 6,626 | `8D6D555ADA3EA73FCBF28926E5CE34ACCEDC1B5F7E02EC489779770314BD26F4` | MATCH | （同传） |

线上文案探针：`showRegistrationDone` 命中、`注册完成，等待审核` 命中、旧文案「已提交球队确认」为 0。

### 未做
- 未推 Git；真机微信邀请提交验收待用户本人走一遍。

## B. `getMiniWorkspace` 身份证推算籍贯并发号

### 差量包
- 基线：`fn code download getMiniWorkspace` → `work/online-getMiniWorkspace-20261030-ab`（5,941 文件）
- Staging：`work/deploy-getMiniWorkspace-20261030-ab`
- 相对基线仅：`ADDED idcardRegion.cjs`、`CHANGED playerRegistration.cjs`；`index.js` 与线上基线同哈希（未上传本地其他会话改动）

| 文件 | 大小 | SHA-256 |
|---|---|---|
| `idcardRegion.cjs` | 13,676 | `DF613773D3EA605A70A3D52CB4A778BA2487AF5A3CB3D10A227EA4FE3DF53B04` |
| `playerRegistration.cjs` | 42,246 | `6A71074CAFF5B7D971AA9730273402CE7C317D405DDC5116AEE3D742C84BAB3F` |

### 发布与回读
- `fn code update getMiniWorkspace --dir work/deploy-getMiniWorkspace-20261030-ab --deployMode cos` 成功
- 回下载 `work/verify-getMiniWorkspace-20261030-ab`：两目标文件 SHA-256 MATCH；`index.js` 相对发布前线上基线 unchanged
- `fn detail`：`Status=Active`、`AvailableStatus=Available`、`Runtime=Nodejs18.15`、`MemorySize=512`、`Timeout=150`、`InstallDependency=TRUE`、`CodeError=""`、`ModTime=2026-10-30 19:14:01`
- 无身份 invoke：`WORKSPACE_LOAD_FAILED` /「无法识别当前微信账号」（鉴权在前、包可加载，非模块缺失）
- 本地：`tools/test-idcard-region.cjs` PASS；`tools/test-player-registration.cjs` PASS

### 未做
- 未推 Git；不回填历史档案；惯用脚/监护人仍按原规则。
- 云函数为共享正式后端，无独立测试副本。

## 边界说明
本轮**未**发布 C（`tournamentRegistrationFlow` / `getPublicSignupDivisions`）。线上对该 action 探针仍返回 `ACTION_INVALID`（「不支持的报名联动操作」），需另获授权后再差量部署。
