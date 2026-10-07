# 裁判表识别：后端与 PC 预览发布

用户明确授权“发布后端和测试版”。前端仅部署 `/preview/admin/`；`webLoginApi`、`updateMatch` 更新足球生产环境。百度配置从本机忽略的 `.env.referee-ocr.local` 读取到服务端环境变量，没有写入浏览器或 Git。原环境变量逐项回读匹配。

## 接口与页面

- 比赛详情、出场阵容：上传裁判表，支持 JPG/PNG、不超过 3 MB。
- `recognizeRefereeReport`：认证并验证赛事读取和共享模块权限；调用百度表格 V2 与高精度文字识别。按姓名列定位固定号码、首发、替补、身份、上下场、进球、黄红牌列；只读取“比赛结果”标签后的比分。原图保存为比赛证据，返回签名草稿；不修改比赛记录。
- 弹窗对照原图，选择正式赛事名单球员；未知符号及姓名不一致不自动确认。修改角色、分钟、队长、门将；换人可按分钟配对，歧义须选择双方。
- `confirmRefereeReport`：重新核验正式名单、赛事和身份；比分必须与有效进球记录一致；相同原图与事件避免重复录入。经签名的 `updateMatch.importPaperReport` 事务保存，检查事件版本；电子裁判记录接管/锁定不允许导入，已核定阵容不静默覆盖。导入不自动结束比赛或归档赛果。
- 共享工作人员需同时拥有 `event.matches`、`event.teams`、`event.results`。授权记录、成员关系未更改。

## 发布证据

前端源 `6060b8b5`（包含同期 preview 的青年组出生范围改动），从正式仓库的已提交源码快照构建完整 dist。前一轮预览入口与主入口、MatchDetail 分包 HTTP 200 且 SHA-256 一致；最后取消额外确认勾选框后完整重建再上传。

后端从发布当日线上包差量更新，保留线上 `updateMatch` 的小程序共享校验 `miniSharedRecording.cjs`（SHA-256 `9D8D328F7A0E38C91CD0E8BECB618F4695E0424B2A9034E5A5FA56FFA062BF77`）与线上弃赛实现。不得从 PC preview 的旧 backend 基线直接整包覆盖该函数；本次部署差量包保存在正式仓库忽略的 `.codex-artifacts/referee-ocr-live-*`，与回下载摘要一致。

`webLoginApi` Active/Available，保持 Nodejs18.15、index.main，超时由 60 秒调整为 120 秒。`updateMatch` Active/Available，原有 Nodejs16.13、index.main、20 秒保持原值。

最终 webLoginApi 回下载：

| 文件 | SHA-256 |
| --- | --- |
| index.js | 25F46DDCB4DF7CAF4D7A395D4D546B8E2D80811D58C4B44647972F71C32077F3 |
| refereeReportOcr.cjs | DB5B916EB2D35B50B26C542851659380D7814FC00E7DDCE17BD401FA0F66B3D6 |
| data-center/match-events.mjs | AAA63D6CBBA02B5EE2BD7D71925C673A3DE2BCDE4E208C9A811A8FF94F00B366 |

`updateMatch/index.js`：`ACC4F95468FA68E408571478D9754E9226DD821AE75D635E5686C7C108048CB6`。

确认接口使用项目共享 `match-events.mjs`；线上旧 webLoginApi 统计包缺少对应导出，因此补入已提交的共享模块分发副本，没有替换旧统计包。未登录识别请求返回 `AUTH_REQUIRED`。未运行测试套件，未使用真实账号、裁判表或真实比赛进行写入验收；识别准确率、百度表格接口额度与真实上传保存链路待用户试用。

最终预览发布：完整上传 280 个文件；`index.html`、`assets/index-BsskjxWo.js`、`assets/MatchDetail-4lTHaP0-.js` 均 HTTP 200，线上 SHA-256 与最终构建产物一致。入口摘要 `0074EC30621A90C5F132D7E9EC4C14D7811050CE7AF3C5A57F67F170B384A42C`，比赛详情分包摘要 `20D7B839EFF89B0B9BF6D44E15C16BB9C84AEB09171E7832A55FC55E2A365859`。正式 `/admin/` 入口回读 HTTP 200、仍使用正式资源路径，本次未上传正式前端。
