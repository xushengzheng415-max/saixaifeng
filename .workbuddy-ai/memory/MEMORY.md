# 项目长期记忆（赛小蜂足球）

## 云函数部署（重要，反复用到）

- 统一入口：`E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run <tcb 子命令>`。脚本已注入 `-e <env>`，**禁止再传 `--env`/`-e`**（会被脚本拒绝）。
- **不要整包上传本地 `cloudfunctions/<fn>/`**：本地 `node_modules` 常不完整（如 getMiniWorkspace 缺 `pngjs`、`@resvg`），运行时直接 443。
- 正确姿势：`fn code download <fn> <dir>` 取线上包为基线 → 只叠加本次改动文件 → `fn deploy --config-file <仓库外/排除目录的 json>`。
- `fn deploy --config-file` 的 `functionRoot` 是**父目录**，实际读取 `<functionRoot>/<函数名>/`。
- 配置不含 `envVariables` 时，`fn deploy` **不会清空**线上环境变量（2026-10-17、2026-10-19 两次验证）。
- 部署后用 `fn code download` 回下载做 md5 逐字节比对 + `fn detail --json` 对比 Runtime/Handler/Timeout/MemorySize/环境变量（`fn detail` 的完整输出含明文密钥与全部源码，**只解析需要的字段，不要整段打印**）。
- 探活手法：用未定义 action 或错误 bridgeKey 调用，能返回业务错误即证明模块加载正常且零副作用。

## 常用校验命令

`node tools/test-player-registration.cjs`、`test-player-join-review.cjs`、`test-service-entry-registration.cjs`、`test-mini-player-library.cjs`、`test-mini-account-participation.cjs`、`sync-data-center.mjs --check`、`test-data-center.mjs`、`check-data-governance.mjs`。

## 工作区现状

- 主目录长期存在大量未提交/未跟踪文件，禁止 `git reset --hard` / `git clean` / 整分支覆盖。
- `.codex-artifacts/` 已被 `.git/info/exclude` 排除，适合放发布包与回读证据。
