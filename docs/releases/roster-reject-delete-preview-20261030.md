# 球员逐人驳回 / 删除球员 / 报名表可编辑：测试版发布（20261030）

## 一、用户诉求

「驳回和上传参赛表格可进行编辑！或者删除某个球员的功能一定要上到测试版！现在客户端还是老版本」

三项功能此前只存在于 `codex/platform-ops` 工作区未提交改动，`main` 与 `preview` 都没有，因此测试版（`/preview/admin/`）一直看不到。

## 二、发布范围（前端，仅测试版）

在 preview 基线 `b10eb64d` 之上的 detached 提交 `8c43b189`（报名表身份证可手动补全）继续追加，只搬运三项功能所必需的文件：

| 文件 | 相对 preview 的增量 |
|---|---|
| `web-admin-vue/src/views/team/TeamDetail.vue` | 逐人驳回（原因多选 + 「其他原因」必填说明）、删除球员、球员审核状态列、籍贯/国籍编辑、照片内联显示、手机号/权限列 |
| `web-admin-vue/src/utils/cloud.js` | 新增 `toInlineImageUrl`（云存储图片附件头导致 `<img>` 不渲染） |
| `web-admin-vue/src/utils/nationalityDisplay.js` | 新增（国籍下拉数据源） |
| `cloudfunctions/webLoginApi/nationality-catalog.json` | 新增（国籍目录，前端打包读取，非云函数部署对象） |
| `web-admin-vue/src/utils/jerseyName.js` | 拉丁/英文姓名默认取姓并大写 |

未搬运 `router/index.js`（preview 含正式尚无的路由）、`TournamentTeams.vue`（与 preview 一致，无差异）等无关文件；工作区其余 30+ 个在建成改动的文件未进入本次预览。

## 三、后端：无需发布

原判断「`rosterExceptionBoard` 的 `rejectPlayer` 尚未上线」经线上包回下载核对为**不成立**：

- 以 `fn code download webLoginApi E:\Documents\sxf-football\.codex-artifacts\wlapi-online-reject-20261030` 下载线上包（5,251+ 文件，`index.js` 417,748 B）。
- 线上 `index.js` L5603 `if (action === 'rejectPlayer') {` 与本地工作区实现逐行一致（含 `organizerReviewStatus/rejected`、`playerReviewStatus:needs_resubmit`、HMAC 桥证明调用 `tournamentRegistrationFlow` 的 `notifyPlayerReviewRejected`）。
- 结论：本轮**未部署任何云函数**，共享正式后端未做变更。

## 四、构建与发布

- 工作树：`E:\Documents\sxf-preview-deploy`（detached `8c43b189` + 本次 5 个文件），`node_modules` 为主仓 Junction。
- `$env:VITE_APP_BASE='/preview/admin/'` → `npm run build`，4m25s 成功。
- `sxf-cloud.ps1 football run hosting deploy <dist> preview/admin --concurrency 3 --retry-count 8 --retry-interval 3000`：406 个文件上传成功。

## 五、回读

| 检查 | 结果 |
|---|---|
| `https://www.sxffootball.cn/preview/admin/index.html`（no-cache） | HTTP 200 |
| 入口资源引用 | 全部 `/preview/admin/assets/`，无根路径泄漏 |
| `assets/TeamDetail-CGCEpujX.js` | HTTP 200，184,014 B；远端与本地 SHA-256 一致 `31266B83E3C57A519B801F2CF95BED4A907B56ED10FBB7BB77289191584C560E` |
| 包内代码标记 | `rejectPlayer`、`organizerReviewStatus`、`删除球员`、`未填联系电话`、`nationality` 均存在 |

## 六、验收路径

1. 打开 https://www.sxffootball.cn/preview/admin/ ，用主办方账号进入赛事 → 参赛球队 → 某球队详情。
2. 参赛名单里待审核球员所在行「操作」列应有「通过 / 驳回」；驳回弹窗可选资料缺项，勾「其他原因」时必须填写说明。
3. 同一表格的「操作」列应有「详情 / 编辑 / 删除」，删除后该行消失。
4. 球队报名表上传页：身份证列显示脱敏号 + 「修改」，可填 18 位并回写出生日期/性别/籍贯。
5. CDN 可能缓存旧包，请用无痕窗口或 Ctrl+F5。

## 七、状态与遗留

- 正式 `/admin/`（`main`）**未发布**，三项功能在正式站仍不可见；按 `docs/PREVIEW_RELEASE_WORKFLOW.md` 需产品负责人验收后合并 `main` 并获授权才能发正式。
- preview 分支本身（`refs/heads/preview`）仍停在 `b10eb64d`，本次提交在 detached HEAD 上：`preview` 分支被 worktree `C:/Users/15043/.codex/worktrees/referee-sheet-preview/sxf-football` 占用，无法 checkout。待该 worktree 释放后需把 `8c43b189..` 两个提交并入 `preview` 分支。
- 主仓 `codex/platform-ops` 工作区仍保留这三个功能的原始改动，未提交；负责人合入 `main` 时以工作区版本为准。
