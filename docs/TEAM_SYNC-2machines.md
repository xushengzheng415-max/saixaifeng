# 第二台电脑接入与双机同步（执行清单）

> 性质：**可执行操作清单**。用于把第二台机器接入正式仓库并建立日常同步习惯。
> 配套决策见 [`ADR.md`](ADR.md) 2026-09-05 条目与 [`COLLAB_WORKFLOW-2dev.md`](COLLAB_WORKFLOW-2dev.md)。
> ⚠️ 先把"第 0 节"的仓库现状问题处理掉，再让第二台机器 clone，否则会把分支混乱一起复制过去。

---

## 零、先解决仓库现状（本机实测，必须先定）

### 已发现的问题

| # | 现象 | 影响 |
|---|---|---|
| G1 | `git config` 里 `origin` 已经是 `https://gitee.com/saixiaofeng/football.git`，但 `AGENTS.md` 第 34 行原写 `https://gitee.com/saixiaofeng/saixiaofeng.git` | 文档与实际不一致，新人会 clone 错仓库（**已修正**） |
| G2 | **同时存在 `master` 和 `main`**：`master=d7c96f4`（早期遗留，本地/远端一致但已停更）；`main` 才是实际开发主线 | 容易误判主分支 |
| G3 | **本地 `main=0e0fb66` 落后 `origin/main=b597452` 共 4 个提交**（`.git/logs` 记录：`0e0fb66 → a4449f9 → e84c5da → 544ff8d → b597452`） | 本地 main 是陈旧影子，不能直接在上面开发或发布 |
| G4 | 当前检出分支是 `fix/pc-admin-bugs`（从本地旧 main 开出），上轮改动都在这里 | 需要合进 main 并推送 |
| G5 | 存在 `github` 远端与 `codex/*` 分支、`refs/codex/snapshots/*`、`refs/codex/turn-diffs/*` | GitHub 只作只读镜像；历史 AI 快照分支应清理 |

### 权威主分支结论（✅ 已确认：`main`）

- **`main` 是唯一权威主分支**；`master` 为 2019 年代号遗留，不再使用（建议废弃，暂不删除）。
- 本地 `main` 需要先对齐远端：
  ```powershell
  git fetch origin --prune
  git status                      # 确认没有未提交改动，再执行下一步
  git checkout main
  git merge --ff-only origin/main # 本地 main 对齐到远端最新
  ```
- 关闭 GitHub 推送，防止误推：
  ```powershell
  git remote set-url --push github DISABLED
  ```

### 合并上轮功能分支

```powershell
git merge --no-ff fix/pc-admin-bugs
git push origin main
```


---

## 一、第二台电脑首次接入

### 1. 认证方式（先定，否则会一直弹窗）

- **推荐**：Gitee 生成**私人令牌**（设置 → 私人令牌），clone/push 时用
  `https://<用户名>:<令牌>@gitee.com/saixiaofeng/football.git` 或让 Git 凭据管理器记住。
- 令牌**只存在各自的 Windows 凭据管理器**里，不写进仓库、不发给对方、不写进任何文档或脚本。

### 2. clone

```powershell
cd E:\Documents
git clone https://gitee.com/saixiaofeng/football.git sxf-football
cd sxf-football
git remote -v
```

### 3. 远端策略（已确认）

```powershell
# GitHub 只作只读镜像：保留可以，但不要推
git remote set-url --push github DISABLED
```

> 只保留一个权威源 `origin`(Gitee)，是防止两边分叉的根本手段。

### 4. 分支准备

```powershell
git fetch origin --prune
git checkout <权威主分支>          # 按第零节确认结果填 master 或 main
git checkout -b dev-<你的名字>     # 第二台机器自己的长期开发分支
```

### 5. 本机依赖与构建（不进 git 的部分）

```powershell
cd web-admin-vue
npm ci                              # 有 lock 文件时用 ci，保证两台依赖一致
npm run build                       # 确认本机能构建通过
```

### 6. 云发布凭据（**不要从对方电脑复制**）

- `sxf-cloud` 的 API Key 在**各自机器**的 `%LOCALAPPDATA%\SxfCloud\credentials\`，由 Windows DPAPI 加密，**换了机器就无法直接复用**。
- 第二台机器需要按同样方式**各自配置一份**；不得把凭据文件拷给对方、不得提交、不得打印到日志。
- 仓库内的 `cloudbaserc.json` 已在 `.gitignore` 中（已核实第 25、28 行），含部署环境/密钥的本地文件本来就不会同步。

---

## 二、日常同步节奏

```powershell
# 每天开始
git fetch origin --prune
git pull --rebase origin <权威主分支>   # 把自己的开发分支变基到最新主分支

# 提交
git status                              # 确认没有夹带对方文件或临时产物
git diff --check                        # 空白/冲突标记自检
git add <明确文件>                       # 不用 git add -A，避免把临时文件带进去
git commit -m "PC: <改动>"

# 推送自己的开发分支
git push origin dev-<你的名字>

# 合进主分支（谁发布谁合，合前先喊话）
git checkout <权威主分支>
git pull --rebase origin <权威主分支>
git merge --no-ff dev-<你的名字>
git push origin <权威主分支>
```

**红线**

- 禁止 `git push --force` 到主分支。
- 禁止 `git add -A` / `git add .`（容易把未 gitignore 的临时产物、构建产物带进去）。
- 合并前 `git fetch`，不要盲合。
- `dist/` 不提交、不互相拷；两台机器各自构建，构建产物按入口哈希核对是否一致。

---

## 三、两台机器之间"什么会同步 / 什么不会"

| 内容 | 是否同步 | 说明 |
|---|---|---|
| 源码（PC/小程序/云函数/H5） | ✅ git | 主通道 |
| `docs/*.md` | ✅ git | 共享文件，改前喊话；`CURRENT_STATUS.md` 谁发布谁写 |
| `package.json` / lock 文件 | ✅ git | 改依赖的人负责通知对方 `npm ci` |
| `node_modules/` | ❌ | 各自安装（已 gitignore） |
| `web-admin-vue/dist/` | ❌ | 各自构建（已 gitignore，第 5 行） |
| `.env` / `cloudbaserc.json` | ❌ | 各自配置（已 gitignore，第 22-29 行） |
| `%LOCALAPPDATA%\SxfCloud\credentials\` | ❌ | DPAPI 绑定机器，必须各自配置 |
| 微信开发者工具本地设置 | ❌ | `project.private.config.json` 已 gitignore（第 26 行） |
| 云函数环境变量 | ❌ | 在云上配置，不随仓库走；改动属于生产变更，需当次授权 |

---

## 四、双机最容易出问题的四个点

1. **两人改了同一个共享文档**（`CURRENT_STATUS.md` / `AGENTS.md`）：合并冲突时不要删对方条目，只调整顺序；`CURRENT_STATUS.md` 固定插在首行之后。
2. **契约改动没提前说**：`webLoginApi` 的 action/字段同时服务 PC、小程序、服务号，先记 ADR 再各自实现。
3. **主分支漂移**：一方合了没推，另一方从旧状态开发。规则是"合进主分支后立刻推"。
4. **构建产物哈希不一致**：两台机器 `npm run build` 结果应逐文件哈希一致；不一致说明 `node_modules` 版本或 Node 版本不同，统一 Node 版本后再发。
