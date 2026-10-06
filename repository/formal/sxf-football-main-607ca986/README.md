# 赛小蜂足球

赛小蜂足球是一套面向青少年足球赛事的多端管理系统，包含 PC 赛事管理后台、微信小程序、服务号 H5、CloudBase 云函数和公开站点。

## 正式代码源

- Gitee：`https://gitee.com/saixiaofeng/football.git`
- 正式本地仓库：`E:\Documents\sxf-football`
- `main`：可发布的稳定代码
- `develop`：日常集成分支

协作人员不得用 ZIP、聊天附件或复制文件夹替代 Git 提交与同步。分支、提交和合并要求见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开发前必读

1. [AGENTS.md](AGENTS.md)：安全、数据、技术与 AI 开发红线。
2. [docs/PRODUCT_RULES.md](docs/PRODUCT_RULES.md)：已确认的产品规则。
3. [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md)：当前进度和已验证状态。
4. [docs/ADR.md](docs/ADR.md)：历史技术与产品决策。
5. [docs/README.md](docs/README.md)：知识库导航和文档治理规则。

如果代码、文档和当前任务互相冲突，先报告冲突，不要自行猜测或覆盖既有业务规则。

## 目录说明

| 目录 | 用途 |
|---|---|
| `web-admin-vue/` | Vue 3 + Vite + Element Plus 的 PC 管理后台，部署路径为 `/admin/` |
| `miniprogram/` | 原生微信小程序 |
| `service-account-h5/` | 服务号承接页和临时任务入口 |
| `cloudfunctions/` | CloudBase 云函数 |
| `docs/` | 产品规则、状态、决策、发布记录、教程和设计资产 |
| `ops/` | 独立运维服务与辅助程序 |
| `tools/` | 本地验证和维护脚本 |
| `prototype-pages/` | 原型及其辅助页面 |

## 本地启动

### PC 管理后台

```powershell
git clone https://gitee.com/saixiaofeng/football.git
cd football
git switch develop
cd web-admin-vue
npm ci
npm run dev
```

生产构建：

```powershell
cd web-admin-vue
npm ci
npm run build
```

### 微信小程序

1. 安装微信开发者工具。
2. 导入仓库根目录，并以 `project.config.json` 为项目配置。
3. 本机私有配置保存在 `project.private.config.json`，该文件不得提交。
4. 上传、提审和发布均属于独立生产操作，不能因代码已提交而自动执行。

### 服务号 H5

`service-account-h5/` 是静态页面目录。修改后先在本地完成页面和语法检查；部署必须按 [AGENTS.md](AGENTS.md) 的生产边界单独授权并验证。

### 云函数

每个云函数维护自己的依赖。只在需要修改的函数目录安装依赖，并按影响范围执行 `node --check` 或相应测试。提交代码不等于部署云函数。

## 环境变量与敏感信息

- 根目录 [.env.example](.env.example) 只列变量名和安全默认值，不保存真实凭据。
- `.env`、`.env.*`（`.env.example` 除外）、`cloudbaserc.json`、`project.private.config.json`、私钥和证书包均不得提交。
- CloudBase、微信、短信、SMTP、百度/腾讯云和其他第三方密钥必须放在对应服务的环境变量或仓库外凭据中。
- 浏览器端环境变量会进入构建产物，不能用于保存 Secret、Token 或 API Key。
- 生产配置清单见 [docs/PRODUCTION_EXTERNAL_CONFIGURATION.md](docs/PRODUCTION_EXTERNAL_CONFIGURATION.md)。

## 常用验证

```powershell
cd web-admin-vue
npm run build
```

除构建外，还应按改动范围执行小程序 WXML 规则扫描、云函数语法检查、相关测试和 `git diff --check`。完整清单见 [AGENTS.md](AGENTS.md)。

## 部署边界

本仓库使用腾讯云 CloudBase 承载部分生产能力，但 Git/Gitee 协作和 CloudBase 部署是两件独立的事。任何推送都不会自动授权或执行生产部署、数据库写入、小程序上传或服务号配置变更。
