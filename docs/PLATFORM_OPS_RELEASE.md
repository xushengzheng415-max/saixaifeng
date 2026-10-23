# 平台运营后台独立发布

2026-10-09 用户确认：平台运营后台独立维护，不与主办方PC后台绑定发布。

| 项目 | 平台运营 | 主办方PC |
|---|---|---|
| 长期分支 | `codex/platform-ops` | `main` / `preview` |
| 工程 | `platform-admin-vue/` | `web-admin-vue/` |
| 构建 | 工程内 `npm ci`、`npm run build` | 原有PC构建流程 |
| 产物 | `platform-admin-vue/dist/` | `web-admin-vue/dist/` |
| 正式入口 | `https://pingtai.sxffootball.cn/` | `https://www.sxffootball.cn/admin/` |
| 发布 | 平台工程内 `npm run deploy` | PREVIEW_RELEASE_WORKFLOW.md |

平台分支固定保留，不因未合入main而删除。平台功能提交留在平台分支；跨端公共改动按独立提交审查和同步，不合并整个分支。旧PC工程中的平台代码仅为历史兼容，不继续同步修改，不作为平台正式发布源。旧 `vite.platform.config.js` 构建入口停用。

发布命令限制分支及目标，拒绝未提交的平台源码，构建后生成版本标记。仅通过既有SSH身份写入平台服务器的独立版本目录，保留旧版本，检查Nginx配置后切换站点目录，再回读线上文件摘要。禁止从该命令部署PC、H5、小程序或云函数。无权访问SSH时报告阻塞，不变更认证配置。

统一卡片绘制 `shared/player-card/draw.js`、字段协议 `cloudfunctions/webLoginApi/player-card-text-styles.json` 是允许的公共依赖；平台构建不依赖PC工程的文件或node_modules。共享后端与租户权限继续遵循AGENTS.md；前端工程拆分不代表新建数据库或自动发布共享云函数。

## 2026-10-23 共享后端代码更新的依赖保护

CloudBase CLI在缺少显式函数配置、从package.json推断配置时可能默认开启installDependency，造成传递依赖浮动。仅锁定根package-lock.json不足以证明云端安装遵循原包树，必须回下载核对实际node_modules版本/完整性。首次建队函数已改为携带完整现网依赖、关闭云端自动安装；赛事报名流程保留原false标志，其余三个本轮函数保留原true并核对实际依赖未变。

本次五个函数的无敏感值代码更新配置为`tools/football-numbering-functions.config.json`。发布前仍应回读实际配置，防止复用过时安装策略；只写name/installDependency，不把环境变量、密钥、超时等运行配置混进代码更新。继续使用足球专用sxf-cloud包装器，显式指定此config-file、函数名及刚下载线上包加最小差量的实际目录。不能因为有此配置文件就从脏工作区整包覆盖后端，也不能把fn deploy上传成功当作代码已更新。

实际状态、存量编码补发与回读证据见`docs/releases/numbering-standard-20261023.md`。
