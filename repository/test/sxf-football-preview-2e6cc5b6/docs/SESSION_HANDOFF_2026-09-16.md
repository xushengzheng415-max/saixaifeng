# 赛小蜂足球会话移交（2026-09-16）

## 1. 正式项目与环境

- 正式仓库：`E:\Documents\sxf-football`
- Gitee：`https://gitee.com/saixiaofeng/football.git`
- 正式分支：`main`
- 足球 CloudBase 环境：`cloud1-7g8ckb3c7815a011`
- 正式域名：`https://www.sxffootball.cn`
- CloudBase 操作必须使用：`E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football ...`
- 当前浏览器可能停留在舞蹈环境 `sxf-dance-d3g5hbhp9ea2bd21b`，不得据此判断或修改足球环境。

## 2. Git 当前状态

- Gitee `main` 已同步到提交：`544ff8d7c5a6bf571a138f3ca74d9d503587f6a2`
- 本地当前分支：`codex/youth-football-p0`
- 本地 HEAD 同为：`544ff8d7c5a6bf571a138f3ca74d9d503587f6a2`
- 最新合并已保留“创建机构后必须绑定服务号”，并采用“进入赛事空间后再创建赛事”。
- 以下本地未跟踪目录属于临时/交付产物，未上传 Gitee：
  - `.codex-artifacts/`
  - `.dsh-vision-router/`
  - `deliverables/`
  - `docs/articles/`
- 不要执行 `git reset --hard`、`git checkout -- .` 或删除上述目录。

## 3. 已完成并验证

- 报名管理已实现：未认领球队可彻底删除；已认领球队只能移出赛事。
- 删除未认领球队时，`team_tasks`、`management`、`roster_snapshots`、`match_lineup_snapshots` 等可选集合缺失会安全跳过；球员、球队、参赛关系等核心集合仍严格处理。
- `tournamentRegistrationFlow` 已部署并从生产下载代码读回验证。
- “陆零後足球队”删除后已查询：球队、球员、工作人员、成员关系、参赛关系、邀请、导入草稿和导入批次均为 0；仅保留 3 条删除审计日志，登录账号未删除。
- Gitee `main` 已读回包含“删除队伍”和 `removeOptionalRows` 修复。
- 最近整库验证：PC 生产构建通过、12 个云函数语法检查通过、网页零 `@cloudbase/js-sdk`、WXML 红线通过、5 组相关契约测试通过。

## 4. 当前阻塞问题

报名管理上传 Word 报名表时提示：

> 球员身份摘要密钥尚未配置，请联系管理员

已确认原因：`tournamentRegistrationFlow` 在导入身份证号时调用 `importedIdentityDigest()`，要求生产环境变量 `SXF_IDENTITY_HASH_KEY`。正式云函数详情检查显示该变量没有非空值，因此后端按安全门禁主动终止导入；这不是 Word 文件或数据库集合问题。

相关代码：

- `cloudfunctions/tournamentRegistrationFlow/index.js`
- `importedIdentityDigest()`
- 错误码：`IDENTITY_HASH_KEY_REQUIRED`

同时检查到下列生产安全配置尚未完成：

- `SXF_IDENTITY_FEATURE_KEY`
- `SXF_MATCH_PASS_SECRET`

禁止把任何密钥值写入本文件、Git、前端、日志或聊天内容。

## 5. 下一会话首要任务

1. 先读取 `AGENTS.md`、本文件及 `docs/CURRENT_STATUS.md`。
2. 只在足球正式环境中检查各密钥应配置到哪些云函数，不要使用当前浏览器里的舞蹈环境。
3. 生成足够强度的随机密钥，通过 CloudBase 云函数环境变量安全配置；不得输出或提交密钥值。
4. 至少为 `tournamentRegistrationFlow` 配置非空 `SXF_IDENTITY_HASH_KEY`，保持其他现有环境变量不变。
5. 根据实际代码依赖，为对应函数配置 `SXF_IDENTITY_FEATURE_KEY` 和 `SXF_MATCH_PASS_SECRET`；不要假设三个变量都属于同一个函数。
6. 部署涉及的云函数并读回，只报告变量名是否存在且非空，不报告值。
7. 重新用当前 Word 报名表走导入流程，确认不再出现 `IDENTITY_HASH_KEY_REQUIRED`，并验证只生成待认领球队及球员草稿，不直接成为正式球员。
8. 更新 `docs/CURRENT_STATUS.md`；如代码或文档发生变化，再提交并推送 Gitee `main`，读回远程提交号。

## 6. 安全与数据红线

- 浏览器端继续使用 `webLoginApi` HTTP 入口，禁止引入 `@cloudbase/js-sdk`。
- `users` 是自然人账号，不属于球队删除或赛事清理范围。
- 手机号是主账号唯一凭证，不能按名称、OpenID 或手机号候选静默合并账号。
- 球队长期资料、赛事参赛关系和历史快照必须分开处理。
- 身份证号只保存脱敏展示和不可逆摘要；任何密钥不得进入仓库。
- 用户偏好是完成安全验证后直接部署并读回，但生产数据删除仍必须以用户明确操作为准。

## 7. 建议新会话开场指令

> 请读取 `docs/SESSION_HANDOFF_2026-09-16.md`，继续修复报名表导入提示“球员身份摘要密钥尚未配置”的问题。只操作赛小蜂足球正式环境，安全配置所需云函数环境变量，部署并读回验证，不得输出或提交任何密钥值；完成后重新验证 Word 报名表导入链路。
