# 多人协同开发规范

## 分支模型

| 分支 | 用途 | 规则 |
|---|---|---|
| `main` | 稳定、可发布基线 | 只接受经过验证的合并，不直接开发 |
| `develop` | 日常集成 | 功能分支从这里创建并合回这里 |
| `feature/<topic>` | 新功能 | 一个分支只解决一个明确主题 |
| `fix/<topic>` | 缺陷修复 | 必须说明复现、修复与验证 |
| `docs/<topic>` | 纯文档 | 不夹带业务代码 |
| `hotfix/<topic>` | 线上紧急修复 | 从 `main` 创建，完成后同时回合 `main` 与 `develop` |

推荐在 Gitee 为 `main` 和 `develop` 开启保护分支，禁止强制推送和直接删除，并要求通过 Pull Request 合并。

## 标准流程

```powershell
git switch develop
git pull --ff-only origin develop
git switch -c feature/short-topic
```

完成开发和验证后：

```powershell
git status
git diff --check
git add <本次相关文件>
git commit -m "feat: 简要说明"
git push -u origin feature/short-topic
```

随后在 Gitee 创建 Pull Request，目标分支选择 `develop`。准备发布时，再由负责人把已验证的 `develop` 合并到 `main`。

## 提交要求

- 一次提交只包含一个可解释的目标，不混入无关文件。
- 提交前检查 `git status` 和 `git diff --cached`。
- 不覆盖、删除或回滚其他人的未提交改动。
- 不提交构建产物、缓存、临时目录、本机配置或生产凭据。
- 推荐提交前缀：`feat:`、`fix:`、`docs:`、`refactor:`、`test:`、`chore:`。
- 已部署但尚未提交的改动必须补齐代码、验证记录和对应文档，不能只依赖线上状态。

## 文档同步

- 产品规则变化：更新 `docs/PRODUCT_RULES.md`，并在 `docs/ADR.md` 记录决策。
- 当前进度或验证结果：更新 `docs/CURRENT_STATUS.md`。
- 发布内容：更新 `docs/releases/`。
- 新增长期知识：先放入合适的 `docs/` 分类，再更新 `docs/README.md` 索引。
- 文档与代码冲突时先报告，由负责人确认哪一方需要修正。

## 安全与数据边界

- 禁止提交 `.env`、Token、Secret、密码、API Key、私钥、生产数据库导出或真实用户资料。
- 测试数据必须虚构并去标识化；截图不得包含手机号、身份证号、验证码、真实未公开姓名或后台凭据。
- 浏览器端代码不得保存第三方 Secret；需要密钥的能力必须通过受鉴权的服务端入口调用。
- 发现凭据曾进入 Git 后，先在对应平台轮换/作废，再移除代码中的值；是否清理历史需单独评估并通知所有协作者。

## 合并前最小检查

1. 相关业务规则已阅读，改动范围与任务一致。
2. `git diff --check` 通过。
3. PC 改动完成 `npm run build`。
4. 云函数改动完成 `node --check` 和鉴权/租户边界检查。
5. 小程序改动完成 WXML 限制扫描和关键流程验证。
6. 没有新增敏感信息、真实用户数据或本机文件。
7. 对应知识库和状态文档已同步。
