# 赛小蜂足球 DSH Git 协作与部署交接

> 核对时间：2026-09-16（Asia/Shanghai）  
> 适用范围：赛小蜂足球代码协作、Gitee 分支治理、Git 仓库部署与线上回读  
> 正式仓库：`E:\Documents\sxf-football`  
> 权威远端：`https://gitee.com/saixiaofeng/football.git`

## 一、先记住结论

1. **唯一权威代码源是 Gitee `origin`。** GitHub 只作为只读镜像，禁止推送和作为部署源。
2. **唯一正式主分支是 `main`。** Gitee 当前默认分支已经是 `main`。
3. **`master` 是历史遗留分支，禁止继续开发、合并或部署。**
4. **`develop` 是日常集成分支，但当前落后 `main` 6 个提交，暂时不能直接作为新任务基线。**
5. 用户已确认项目改为 **Git 仓库部署**。正式规则应是：开发分支不触发生产，只有经过验证并合入 `main` 的版本才允许触发正式部署。
6. 当前存在“线上代码已经生效，但对应提交尚未合入 `main`”的漂移，必须先收口，不能直接继续堆新功能。
7. 小程序“开发版上传、体验版、审核、正式发布”仍是独立状态。除非部署流水线明确覆盖并能回读，否则不能因为 Git 合并成功就声称小程序已正式发布。

## 二、当前分支快照

### 2.1 Gitee 远端

| 分支 | 当前提交 | 状态 | 处理要求 |
|---|---|---|---|
| `origin/main` | `b597452cbced0a5f66a4199f692bda00a3f56509` | Gitee 默认分支；正式主线 | 保护分支；只通过合并请求进入 |
| `origin/develop` | `a4449f90b18915cf97051a9420d9ac742177a428` | 比 `main` 落后 6 个提交 | 收口前冻结；不得从这里开新任务 |
| `origin/master` | `d7c96f405227493b64d79faf6bb5b47beeaea115` | 历史遗留 | 禁止使用；保留只为查历史 |
| `origin/feature/kit-color-navy` | `db8602cdb7216bb8fbf18cd49cf3e14ac4b167b2` | 有 3 个提交尚未进入 `main` | 优先审查并通过 PR 收回 `main` |
| `origin/codex/*` | 多个历史协作分支 | 非正式主线 | 只按具体任务审查，不得整体并入 |

### 2.2 本机工作副本

- 当前分支：`fix/pc-admin-bugs`
- 当前提交：`83ad7a71fdcf773aee92146f8422ad1b556cdb24`
- 相对 `origin/main`：主线独有 7 个提交，本分支独有 1 个提交。
- 本分支提交涉及：
  - `cloudfunctions/tournamentRegistrationFlow/index.js`
  - `web-admin-vue/src/views/tournament/TournamentTeams.vue`
- 当前工作区还有未提交修改和未跟踪文件，涉及平台管理员会话隔离、协作文档、交付目录等。

**DSH 不得在这个脏工作副本中执行 `reset --hard`、`checkout -- .`、批量清理、强制变基或覆盖文件。** 新任务优先使用独立 clone，或在确认目录和分支后创建独立 worktree。

## 三、线上与仓库目前不一致

### 3.1 已核实的线上状态

- 正式地址 `https://www.sxffootball.cn/admin/` 返回 HTTP 200。
- 当前 PC 入口资源为 `assets/index-1eQ3kHKd.js`。
- 线上 `registrationKitColors` 资源已经包含“藏青”和 `#1F3A6E`。
- 线上赛事创建、赛事编辑和赛后复盘资源已经包含分片上传逻辑。
- 足球 CloudBase 环境 `cloud1-7g8ckb3c7815a011` 状态正常，静态托管在线。

### 3.2 漂移事实

上述“藏青色”和分片上传对应以下 3 个提交：

1. `e5002cf`：赛后附件与赛事规程改为分片上传。
2. `610283a`：比赛服颜色新增藏青色。
3. `db8602c`：补充上线与验证记录。

这 3 个提交目前位于 `origin/feature/kit-color-navy`，**尚未进入 `origin/main`**。因此截至本交接文档核对时：

> 线上 PC 已包含的代码，不完全等于 Gitee `main`。

在完成收口前，不能把 `main` 当前提交号直接当作完整线上版本号，也不能从线上状态反推某个分支已经合并。

### 3.3 Git 部署配置的证据边界

- 用户已明确确认：项目已经改为 Git 仓库部署。
- 仓库内暂未发现 `.gitee`、`.github/workflows` 或其他可回读的流水线配置文件。
- CloudBase CLI 能确认环境和托管在线，但本次只读检查不能显示外部控制台中的仓库绑定、触发分支、构建命令、部署目录和最近一次流水线记录。

因此 DSH 开始处理部署任务时，必须先在实际部署控制台回读以下信息：

1. 绑定仓库是否为 `saixiaofeng/football`。
2. 正式环境触发分支是否只允许 `main`。
3. PC 构建命令是否在 `web-admin-vue` 下执行 `npm ci` 与 `npm run build`。
4. PC 部署目录是否为 `web-admin-vue/dist`，线上路径是否为 `/admin/`。
5. 根站、服务号 H5、云函数是否属于同一条流水线，还是分别发布。
6. 最近一次成功部署对应的 Git 提交号、构建时间和部署结果。

未完成上述回读时，只能说“Git 部署已启用，精确触发配置待控制台确认”，不得把推送成功写成线上发布成功。

## 四、建议的分支与发布模型

### 4.1 收口完成后的长期模型

| 层级 | 分支 | 用途 | 是否允许触发生产 |
|---|---|---|---|
| 正式发布 | `main` | 唯一可发布基线 | 是，仅此分支 |
| 日常集成 | `develop` | 多人功能合并和联调 | 否 |
| 任务开发 | `feature/<姓名或AI>-<主题>` | 新功能 | 否 |
| 缺陷修复 | `fix/<姓名或AI>-<主题>` | 普通缺陷 | 否 |
| 紧急修复 | `hotfix/<主题>` | 从 `main` 开出的线上紧急修复 | 合入 `main` 后才触发 |
| 历史归档 | `master` | 仅查历史 | 永不 |

### 4.2 两人协作固定流程

1. 每人使用独立 clone 或独立 worktree，不共用同一个脏工作目录。
2. 每天开始先 `fetch origin --prune`，确认 `origin/main` 与 `origin/develop`。
3. 普通任务从已对齐的 `develop` 新建自己的 `feature/*` 或 `fix/*` 分支。
4. 一项任务只做一个明确目标；代码、测试和对应状态记录放在同一合并请求中。
5. 先合入 `develop` 完成联调；准备发布时再由发布负责人创建 `develop -> main` 合并请求。
6. `main` 禁止直接开发、禁止强推、禁止删除；建议要求至少一人复核和必需检查通过。
7. `main` 合并后由 Git 部署流水线发布；发布者必须记录提交号、流水线结果和线上回读结果。
8. 回滚使用 `git revert` 生成可审计提交，再由流水线发布；禁止对 `main` 强制回退历史。

### 4.3 当前过渡规则

在 `develop` 尚未追平 `main` 前：

- 不从当前 `develop` 开新分支。
- 新的紧急任务临时从最新 `origin/main` 开分支。
- 先通过 PR 把已确认的线上分支改动收回 `main`。
- 再通过受审查的合并让 `develop` 吸收最新 `main`，不得强制重写共享分支历史。

## 五、DSH 首次接手的收口顺序

### 第 1 步：只读审计，不发布

- 阅读 `AGENTS.md`、本文、`docs/PRODUCT_RULES.md`、`docs/CURRENT_STATUS.md`、`docs/ADR.md`。
- 执行 `git fetch origin --prune`，重新输出远端分支、默认分支、提交差异和工作区状态。
- 核对部署控制台中的仓库、触发分支、构建命令、部署目录和最近一次成功提交。
- 输出“仓库 main / 当前线上 / 本机工作区”三方差异表。

### 第 2 步：把已上线改动收回主线

- 从最新 `origin/main` 创建独立收口分支，例如：
  - `chore/dsh-reconcile-production-main-20260916`
- 审查 `origin/feature/kit-color-navy` 的 3 个提交。
- 优先通过合并请求并入 `main`；如 `docs/CURRENT_STATUS.md` 冲突，保留双方有效记录，按时间倒序整理，禁止直接选择一侧覆盖。
- 验证 PC 构建、网页零 SDK、相关云函数语法、`git diff --check` 和线上已有功能回归。
- 未经用户明确授权，不点击正式合并，不触发生产部署。

### 第 3 步：拆分本机未完成工作

- `83ad7a7` 的报名管理/虚拟球队改动单独审查，不能与平台管理员会话隔离混成一个提交。
- 当前未提交的平台会话改动另建独立 `fix/*` 分支，完成构建和路由回归后再提 PR。
- 未跟踪的 `.codex-artifacts/`、`.dsh-vision-router/`、`deliverables/`、`docs/articles/` 等目录先判断归属，不得整目录加入提交。

### 第 4 步：修复长期分支治理

- 让 `develop` 通过正常合并吸收最新 `main`。
- 在 Gitee 保护 `main` 和 `develop`，禁止强推和直接删除。
- 把 GitHub push URL 禁用或在权限层面设为只读。
- 将 `master` 标记为归档，禁止部署平台监听该分支。
- 如果部署配置可代码化，把不含密钥的流水线配置纳入仓库；密钥只放部署平台的安全变量中。

## 六、每次部署必须记录什么

每次 Git 部署完成后，在 `docs/CURRENT_STATUS.md` 顶部新增一条记录，至少包含：

- 发布目标：根站、PC `/admin/`、服务号 H5、具体云函数或小程序。
- 来源仓库与分支。
- 合并后的完整 Git 提交号。
- 流水线编号或可回读的部署记录标识。
- 构建结果与关键检查结果。
- 正式环境与正式域名。
- 线上入口资源或函数修改时间。
- 线上回读证据：HTTP 状态、关键功能字符串、哈希或无写入探针。
- 明确写出未发布的部分，尤其是小程序审核/正式发布状态。

只有“提交成功”而没有流水线成功和线上回读时，状态只能写为“代码已推送，线上未验证”。

## 七、禁止事项

- 禁止从 `master` 开发或部署。
- 禁止从当前陈旧的 `develop` 开新任务。
- 禁止直接向 `main` 推送业务代码。
- 禁止 `git push --force`、`git reset --hard`、批量覆盖他人工作区。
- 禁止使用 `git add .` 或 `git add -A` 夹带临时产物。
- 禁止把 GitHub 当作第二个可写权威源。
- 禁止把密钥、验证码、生产数据、真实身份证信息或本机凭据提交到 Git。
- 禁止把“Git 推送成功”写成“正式发布成功”。
- 禁止在未确认流水线范围时，假定云函数、小程序或服务号 H5会随 PC 自动发布。

## 八、可直接复制给 DSH 的开场指令

```text
你现在接手赛小蜂足球的 Git 多人协作和仓库部署治理。

正式仓库：E:\Documents\sxf-football
权威远端：https://gitee.com/saixiaofeng/football.git
唯一正式主分支：main
GitHub 只读，master 已归档。

先完整阅读：
1. AGENTS.md
2. docs/DSH_GIT_HANDOFF_2026-09-16.md
3. docs/PRODUCT_RULES.md
4. docs/CURRENT_STATUS.md
5. docs/ADR.md

本轮先只读审计，不合并、不推送、不部署：
- git fetch origin --prune；
- 核对 Gitee 默认分支、origin/main、origin/develop、origin/master 和所有未合入 main 的 feature/fix 分支；
- 核对实际 Git 部署控制台绑定的仓库、触发分支、构建命令、部署目录和最近一次成功提交；
- 对比仓库 main、正式线上和本机工作区，输出三方差异表；
- 特别审查 origin/feature/kit-color-navy 的 e5002cf、610283a、db8602c，因为这些功能已在线上出现但尚未进入 main；
- 不得触碰当前脏工作区，不得 reset、强推、清理未跟踪文件或覆盖他人修改。

先提交一份收口方案和拟操作文件/分支清单，等我确认后再实施。正式合并 main 会触发 Git 部署，必须在合并前再次确认，并在部署后回读正式域名和记录提交号。
```

## 九、本交接文档的状态

- 已验证：Gitee 默认分支、远端分支提交、分支差异、本机脏工作区、CloudBase 环境在线、正式 PC 资源中的关键功能字符串。
- 用户确认：项目已改为 Git 仓库部署。
- 仍待控制台回读：Git 部署绑定范围、唯一触发分支、构建命令、部署目录、最近一次流水线记录。
- 本文只新增交接说明；未合并分支、未推送远端、未触发部署、未修改生产数据。
