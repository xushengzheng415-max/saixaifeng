# PC 预览验收与正式发布流程

本流程用于赛小蜂足球 PC 后台。目标是让产品负责人先在线验收，再进入正式环境，同时避免两个人或多个 Codex 会话互相覆盖。

## 固定分支与地址

| 用途 | Git 分支 | 部署地址 |
|---|---|---|
| 个人开发 | 每个任务自己的功能分支 | 不部署正式站 |
| 在线预览 | `preview` | `https://www.sxffootball.cn/preview/admin/` |
| 正式发布 | `main` | `https://www.sxffootball.cn/admin/` |

`preview` 是长期验收分支，不删除。功能分支禁止直接部署 `/admin/`。

## 一 开发完成后先提交功能分支

1. 确认没有夹带别人的改动或临时文件。
2. 执行相关测试和 `git diff --check`。
3. 提交并推送自己的功能分支。
4. 此时不部署正式 `/admin/`。

## 二 合并到 preview 并部署预览

发布人先声明正在发布预览，其他人暂停发布同一目标。

```powershell
git fetch origin --prune
git switch preview
git pull --ff-only origin preview
git merge --no-ff origin/功能分支
```

发生冲突时必须按业务语义保留双方功能，禁止简单选“ours”或“theirs”。解决后重新运行测试和构建。

预览构建必须使用独立资源路径：

```powershell
cd E:\Documents\sxf-football\web-admin-vue
$env:VITE_APP_BASE = '/preview/admin/'
npm run build
Remove-Item Env:VITE_APP_BASE
```

构建后检查 `dist/index.html` 只引用 `/preview/admin/assets/`，不得引用正式 `/admin/assets/`。

先推送 `preview`，再部署预览目录：

```powershell
git push origin preview
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run hosting deploy web-admin-vue/dist preview/admin --concurrency 3 --retry-count 8 --retry-interval 3000
```

本项目当前 CloudBase CLI 使用 `--safe` 或 `--verify` 时出现过卡死、无输出和入口未写入的问题，因此 PC 托管发布不使用这两个参数，改为发布后手工读回验证。

必须验证：

1. `https://www.sxffootball.cn/preview/admin/` 返回 HTTP 200。
2. 入口只引用 `/preview/admin/assets/`。
3. 关键分包线上 SHA-256 与本地一致。
4. 正式 `https://www.sxffootball.cn/admin/` 仍返回 HTTP 200，且继续引用 `/admin/assets/`。

## 三 产品负责人在线验收

产品负责人只在预览地址验收。确认通过前，不合并 `main`，不部署正式 `/admin/`。

预览前端目前仍调用足球正式后端。查看页面、选择 Word、检查本地解析没有问题；点击“创建、删除、审核、保存”等写操作会修改正式数据，只能使用明确的测试赛事和测试数据。

如果功能依赖尚未上线的云函数或数据库结构，不能为了预览擅自部署生产后端。应先取得明确授权，或建立独立测试 CloudBase 环境。

## 四 验收通过后合并 main

```powershell
git fetch origin --prune
git switch main
git pull --ff-only origin main
git merge --no-ff origin/preview
```

如果 `main` 在预览期间出现新提交，必须解决冲突并重新运行全部相关测试。禁止把已验收的旧 `preview` 直接强推覆盖新 `main`。

正式构建前清除预览路径变量：

```powershell
Remove-Item Env:VITE_APP_BASE -ErrorAction SilentlyContinue
cd E:\Documents\sxf-football\web-admin-vue
npm run build
```

构建后确认 `dist/index.html` 只引用 `/admin/assets/`，不包含 `/preview/admin/`。

先推送 `main`：

```powershell
git push origin main
```

## 五 得到正式部署授权后再发布

只有用户在当前任务明确要求正式部署，才能执行：

```powershell
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run hosting deploy web-admin-vue/dist admin --concurrency 3 --retry-count 8 --retry-interval 3000
```

正式发布必须完整上传整个 `dist`，禁止只上传单个哈希分包。发布后手工读回：

1. `/admin/index.html` HTTP 200。
2. 入口只引用 `/admin/assets/`。
3. 关键分包本地与线上 SHA-256 一致。
4. 预览 `/preview/admin/` 仍可访问且引用预览路径。
5. 涉及云函数时，函数状态必须为 `Deployment completed`，并单独验证环境变量未被覆盖。

## 六 发布权与故障处理

- 同一时间只有一个发布人可以操作 `/preview/admin/` 或 `/admin/`。
- 发布前在会话中声明目标和预计耗时，发布后报告提交号、地址和读回结果。
- 不相信“命令退出码为 0”就等于发布成功，必须以 HTTP 和哈希读回为准。
- 如果正式入口出现 NoSuchKey 404，立即停止其他操作，使用已验证的 `main` 完整构建重新上传 `/admin/`，恢复后再排查原因。
- 不从脏工作区、未合并功能分支或临时 worktree 部署正式站。

## 七 给其他 Codex 会话的开场指令

> 本项目 PC 改动必须遵循 `docs/PREVIEW_RELEASE_WORKFLOW.md`：功能分支只提交；先合并 `preview` 并部署 `/preview/admin/`；产品负责人验收后再合并 `main`；只有得到当前任务明确授权后才能部署正式 `/admin/`。发布前必须合并同期分支，发布后必须进行 HTTP 与 SHA-256 读回，禁止个人分支直接覆盖正式站。

## 八 合并 main 后清理功能分支

功能分支是短期分支。功能确认完整进入 `main` 后，应删除本地和 Gitee 远端分支，避免旧分支继续被误用或再次部署。

删除前必须同时满足：

1. `main` 已拉取到最新 Gitee 状态。
2. 分支内容已完整进入 `main`；普通合并应通过 `git merge-base --is-ancestor`，若使用 cherry-pick、squash 或手工解冲突，必须另外核对功能代码和测试已在 `main`。
3. `git rev-list --count origin/main..origin/分支名` 为 0，或独有提交已明确被 `main` 中的等价提交替代。
4. `git worktree list` 中没有 worktree 正在使用该分支。
5. 其他开发者或 Codex 会话没有继续在该分支工作。

固定保留：

- `main`：正式主分支。
- `preview`：长期在线验收分支。
- `master`：历史遗留分支，仅保留查阅，不再开发或部署。
- 当前正在开发、尚未完整进入 `main` 的功能分支。

确认后删除：

```powershell
git branch -d 功能分支
git push origin --delete 功能分支
git fetch origin --prune
```

如果 `git branch -d` 拒绝删除，不得直接改用 `-D`。先查明是上游跟踪分支差异、未合并提交还是仍有 worktree 占用；只有确认内容已由 `main` 完整保留后，才能使用 `-D` 删除本地旧引用。

临时 worktree 清理顺序：先检查 `git -C 路径 status --short` 为空，再运行 `git worktree remove 路径`，最后执行 `git worktree prune`。不得删除有未提交修改的 worktree。
