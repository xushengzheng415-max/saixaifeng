# 赛小蜂 AI Agent 开发 Workflow

> 本文档记录赛小蜂项目后续使用 Codex / Claude Code / Cursor 等 AI Agent 协作开发时的固定流程。
> 目标是把 AI 编程从临时式改代码，升级为可追踪、可验证、可复盘的工程流程。

## 一、核心原则

赛小蜂后续所有需求、Bug 修复、代码调整、文档调整，都默认走以下流程：

```
Issue -> Spec -> Plan -> Branch -> Code -> Test -> Review -> Docs -> PR -> Sync
```

不要让 AI Agent 直接从一句模糊需求跳到改代码。先把问题、边界、方案和验收方式说清楚，再进入实现。

## 二、标准流程

### 1. Issue：建立任务记录

每个独立任务都应在 GitHub Issue 中记录：

- 背景和目标
- 影响范围
- 验收标准
- 当前状态和阻塞点

后续沟通、分支、PR 都要关联该 Issue。

### 2. Spec：定义问题

开始实现前，需要明确：

- 这次要解决什么
- 不解决什么
- 业务规则是什么
- 哪些端会受影响：小程序、Web 管理后台、云函数、赛事官网、文档、部署

### 3. Plan：拆解任务

把任务拆成可执行步骤：

- 需要修改哪些文件或模块
- 需要新增哪些数据结构或接口
- 需要验证哪些路径
- 是否需要更新文档、部署说明、测试账号或配置说明

### 4. Branch：分支开发

默认从主分支创建工作分支，分支名前缀使用 `codex/`。

示例：

```bash
git switch -c codex/fix-match-signature
```

涉及子项目或并行功能时，分支名称要体现业务范围，例如：

- `codex/miniprogram-roster-review`
- `codex/web-admin-tournament-filter`
- `codex/cloudfunction-user-binding`

### 5. Code：按计划实现

实现时遵守项目既有架构：

- Web 管理后台浏览器端保持零 SDK，统一走 `webLoginApi`
- 小程序 WXML 只保留简单表达式，复杂计算放到 JS 中预处理
- 云函数跨端识别同时兼容 `phone/phoneNumber`、`openId/wechatOpenId`，跨应用身份以 `unionId` 为准
- 不引入不必要的新依赖

### 6. Test：验证结果

提交前至少完成与改动范围匹配的验证。

小程序相关改动需要检查：

```bash
rg "{{[^}]*\?[^}]*:.*}}" miniprogram
rg "{{[^}]*\[[0-9]" miniprogram
rg "{{[^}]*===|!==|\.find\(" miniprogram
```

Web 管理后台相关改动需要检查：

```bash
cd web-admin-vue
npm run build
```

涉及 `web-admin-vue/src/utils/cloud.js` 的改动，构建后还需要按部署流程发布到 `/admin/`。

云函数相关改动需要检查：

- HTTP 入口是否仍由 `webLoginApi` relay
- 是否需要云端安装依赖
- 是否需要兼容历史字段
- 是否避免把密钥写入仓库

### 7. Review：风险审查

PR 前需要自查：

- 是否破坏现有登录、赛事、球队、球员、裁判、签字流程
- 是否引入字段名不兼容
- 是否影响已部署的 `/` 和 `/admin/` 两个入口
- 是否遗漏错误处理、空状态、权限判断
- 是否需要数据迁移或回滚方案

### 8. Docs：沉淀文档

功能完成后，根据影响范围更新：

- GitHub Issue 进度
- PR 描述
- `AGENTS.md` 项目记忆
- 业务说明文档
- 部署说明
- 开发日志或变更记录

如果只是代码内部小修，可以在 PR 中说明不需要额外文档。

### 9. PR：合并前检查

每个代码或文档调整都应创建 GitHub PR。PR 描述必须包含：

- 关联 Issue
- 改动摘要
- 验证结果
- 风险和回滚说明
- 是否同步到 Gitee

### 10. Sync：多端同步

赛小蜂当前使用：

- GitHub：Issue / PR / 分支协作
- Gitee：代码镜像与备份

后续完成本地提交后，需要按任务情况同步：

```bash
git push github <branch>
git push origin <branch>
```

合并主分支后，也要保持 GitHub 和 Gitee 主分支一致。

## 三、AI Agent 执行约定

AI Agent 在赛小蜂项目中工作时必须遵守：

- 编码前先阅读 `AGENTS.md`，尤其是致命规则和已知坑点
- 有代码或文档变更时，优先建立或更新 GitHub Issue
- 使用 `codex/` 前缀创建工作分支
- 改动完成后创建或更新 PR
- 在 PR 或 Issue 中说明测试结果、未测试项和风险
- 遇到分支项目、子模块或并行任务时，必须在对应 Issue/PR 中通知到位

## 四、当前决策

2026-07-02 起，赛小蜂采用以上 Workflow 作为默认 AI Agent 开发流程。

这套流程来自对《Codex技巧 | 先别Vibe，把Workflow整明白，你的开发事半功倍》一文的项目化落地：工具和模型会变化，但稳定的工程流程应该沉淀在项目中。
