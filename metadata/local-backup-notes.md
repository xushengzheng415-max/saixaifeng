# 赛小蜂足球 1.0 → 1.1 基线备份

备份时间：2026-10-06（Asia/Shanghai）

## 代码基准

- Gitee 正式源码：`origin/main`，提交 `607ca986944e222b935c46c4e13ebf7d892973cf`。
- Gitee PC 预览源码：`origin/preview`，提交 `2e6cc5b62f2c779b90afc418fb21bd410f959743`。
- 正式源码归档：`repository/source-main-607ca986.zip`。
- 预览源码归档：`repository/source-preview-2e6cc5b6.zip`。
- 小程序源码归档：`repository/miniprogram-source-1.0.34-607ca986.zip`。
- 完整 Git refs/源码/stash 备份：`repository/all-refs-607ca986-and-stashes.bundle`（已验证，含 467 refs 和 17 份 stash 快照）。`repository/nested-timefix-stash-20261006.bundle` 补入 `.worktrees/time-fix` 的第 18 份未提交状态。`all-refs-pre-refresh-040a33a8.bundle` 是较早快照。

## 线上代码回读

- 正式 PC：`https://www.sxffootball.cn/admin/`，HTTP 200；入口 HTML SHA-256 `604820920BCBF12BF141FADA29AC3E107787F627FFFACFDA1F17C0135ACA80B1`；入口 JS `index-C4Mu1z7E.js`、CSS `index-DW9I1r72.css`。
- PC 预览：`https://www.sxffootball.cn/preview/admin/`，HTTP 200；入口 HTML SHA-256 `B377E4D1541C8D2A7E08AF007B234E0BA2BEB0F39D107FE9CBA84BF42B47DCBD`；入口 JS `index-DAza6Ubn.js`、CSS `index-CKETlIH8.css`。
- 正式官网首页：`https://www.sxffootball.cn/`；在线资源闭包 101 项 HTTP 200，2 个动态/非活动路径返回 404 并记录于清单。`hosting/formal/landing/` 已备份。
- 正式服务号 H5：`/service-account-h5/`；在线资源闭包 21 项，全部 HTTP 200。
- 预览服务号 H5：`/preview/service-account-h5/`；在线资源闭包 9 项，全部 HTTP 200。
- 正式与预览 PC 实际引用资源分别保存于 `hosting/formal/admin-current/` 与 `hosting/test/admin-current/`；两个 `ONLINE-MANIFEST.json` 记录线上 URL、HTTP 状态、响应大小和 SHA-256。正式 PC 的扫描还发现 31 个来自动态模板或内置依赖的路径字符串返回 404，逐项状态保存在清单中；预览 PC 没有失败项。
- `metadata/offline-file-verification.json` 回读校验了 329 个 HTTP 200 文件，缺失 0、SHA-256 不匹配 0。`hosting/raw-cloudbase-partial/` 是停止的整目录下载副本，不完整；实际线上资源以 `landing`、`admin-current` 与 `service-account-h5` 下的按入口回读快照为准。

## CloudBase

- 足球正式环境：`cloud1-7g8ckb3c7815a011`，状态 Normal。
- 本项目代码和发布记录指向此足球环境；PC 预览仍调用正式后端，没有独立测试数据库/云函数环境。
- 在线函数清单 88 个，全部代码包均已下载到 `cloudfunctions/formal/`，含运行依赖；约 3.02 GB。未下载或保存环境变量值。
- 与 `origin/main` 对比入口 `index.js` 原始 blob：57 个完全一致，26 个不同，5 个函数在仓库没有对应入口。逐函数结果与哈希在 `cloudfunctions/formal/online-vs-repo-index-hashes.json`。

## 仓库构建对比

- 正式源码本地构建入口引用 `index-DZWlVDvQ.js` 与 `index-DW9I1r72.css`。
- 预览源码本地构建入口引用 `index-BRPbApyG.js` 与 `index-D2kWrns6.css`。
- 两份线上 PC 入口引用与本地构建不同。线上正式文件和预览文件已分别存档；本地源码归档仍以 Gitee 当前分支为准。
- `miniprogram/config/release.js` 在正式源码为 `1.0.34 / 开发版`，在预览源码为 `1.0.34 / 开发体验版`。微信开发者工具 CLI 显示已登录，但 CLI 只提供本地上传等操作，不提供从微信平台下载正式/体验代码包的命令；因此本地小程序源码已归档，平台实际正式版/体验版源包无法直接回读。

## 恢复与使用

- 从 `source-main-607ca986.zip` 恢复正式仓库源码快照；从 `source-preview-2e6cc5b6.zip` 恢复 PC 预览源码快照。
- `all-refs-607ca986-and-stashes.bundle` 保存正式/预览 ref、分支、历史 refs 和 17 份 stash；用 `nested-timefix-stash-20261006.bundle` 还原嵌套工作区的第 18 份 stash。两个 bundle 均已运行 `git bundle verify`。
- 在线资源清单用于还原实际部署的静态前端；CloudBase 函数目录用于比对或恢复其在线源码包。
- 下一阶段从 `607ca986` 的正式源码基线开发 1.1；正式、预览在线包与 Git 源码的差异需先逐项核对，不能只按入口文件名认定一致。
- 9 月 25 日遗留未跟踪导出目录已另存于 `repository/legacy-work-export-20260925/`；根目录原文件夹仍保留。完整 CloudBase 下载包在本地副本中含 3 处硬编码凭据，GitHub 公共备份对应文件已脱敏为环境变量读取。
- GitHub 公开备份分支为 `backup/pre-1.1-20261006`；已脱敏 3 个云函数里的第三方密钥字段，原始包只留本地。
- 本备份不含数据库数据，也没有执行部署或发布。


安全记录：3 个 CloudBase 下载源码文件含疑似硬编码百度/腾讯密钥。原始文件只保存在本地备份目录；GitHub 公开分支中的副本已改为读取环境变量，清单不含密钥值。




