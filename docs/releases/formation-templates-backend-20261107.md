# 阵型模板后端上线与种子写入（2026-11-07）

## 范围

- 共享后端 `webLoginApi` 新增 8 个 `formationTemplates` action（`listFormationTemplates`、`getFormationTemplate`、`listFormationTemplateVersions`、`saveFormationTemplateDraft`、`publishFormationTemplate`、`archiveFormationTemplate`、`restoreFormationTemplateVersion`、`seedFormationTemplates`）。
- 写入 `formation_templates` 集合 26 条内置阵型（25 条 `active` + 1 条 `archived`）。
- 未改任何端渲染代码；未部署前端；未提交、未推送、未合并 `main`/`preview`。

## 集合核对（只读）

| 集合 | 上线前 | 索引 |
|---|---|---|
| `formation_templates` | 存在，0 条 | 仅默认 `_id_`、`_openid_1` |
| `formation_template_versions` | 存在，0 条 | 仅默认 `_id_`、`_openid_1` |

未擅自创建索引。建议后续补 `formation_template_versions` 的 `{templateKey:1, version:-1}` 复合索引；当前数据量下缺索引只影响历史版本查询走扫描，不影响正确性。

## 发布方式

仓库 `cloudfunctions/webLoginApi` 的业务文件数（95）少于线上包（含 `vendor/`、`assets/`、多个业务 `.cjs`），直接整包上传会删掉现网模块。因此：

1. `sxf-cloud football run fn code download webLoginApi` 取线上包到仓库外目录；
2. 只叠加 3 处：新增 `formationTemplates.cjs`、新增 `formation-templates.json`、`index.js` 增加 8 个 `case` 分发；
3. `node --check` 通过；
4. `node tools/check-referee-backend-package.cjs <拟发布目录>` 通过；
5. `fn code update webLoginApi --dir <拟发布目录> --deployMode cos`，只发代码、不改配置。

## 检查项结论

`tools/check-referee-backend-package.cjs`（发布前对拟发布目录、发布后对回下载包各执行一次，均通过）：

- 裁判表接口：`recognizeRefereeReport` / `confirmRefereeReport` / 分组换人 / `updateMatch.importPaperReport` 均在包内且签名、赛事与模块权限、事件版本、电子记录锁定校验保留；
- 报名上传权限：`football/team-registration-imports/{赛事ID}` 下 `.docx` 初始化 `event.registration`，跨赛事与非法文件类型拒绝。

## 配置与回读

| 项 | 发布前 | 发布后 |
|---|---|---|
| Runtime / Handler | Nodejs18.15 / `index.main` | 不变 |
| 内存 / 超时 | 512MB / 120s | 不变 |
| `InstallDependency` | `TRUE` | `TRUE`（沿用线上安装，未改为关闭） |
| 环境变量 | 28 项 | 28 项，名称完全一致 |
| 状态 | Active / Available | Active / Available |

回下载比对：业务文件 **6758 个逐个 SHA-256 一致**，无新增、无缺失；`index.js`、`formationTemplates.cjs`、`formation-templates.json` 三个文件哈希与拟发包完全相同。仅 `node_modules/.package-lock.json` 存在差异，属 `InstallDependency=TRUE` 在线安装产生的许可元数据，非业务代码。

空会话探针：`fn invoke` 调 `listFormationTemplates` 返回 `AUTH_REQUIRED`（而非"不支持的阵型模板操作"），证明 8 个 action 已在线分发且 JSON 副本可加载。

## 种子写入与回读

| 项 | 结果 |
|---|---|
| 总数 | 26 |
| 人数制分布 | 5 人制 4、7 人制 4、8 人制 7、9 人制 3、11 人制 8 |
| 状态 | 25 `active`；仅 11 人制 `4-5-1` 为 `archived` |
| 版本号 | 全部 `version=1` |
| 点位 | 每套 `slots` 数 = 场上人数（5/7/8/9/11 逐套核对） |
| 时间字段 | `createTime` / `updateTime` / `publishedAt` 均为日期类型 |
| 抽查 | `8-2-3-2`：GK(10,50)、CB1(30,25)、CB2(30,75)、CM1(55,16.67)、CM2(55,50)、CM3(55,83.33)、FW1(80,25)、FW2(80,75)，与真源一致 |
| `formation_template_versions` | 仍为 0 条（种子不写版本快照） |

写入说明：本次无平台运营会话令牌，种子由线上模块 `seed` 逻辑在假数据库上生成同形文档，再用数据库管理命令插入；字段、角色码、`position` 派生、`seededBy=platform-owner` 与函数写入一致。后台「初始化内置模板」按钮对已存在的 `_id` 为覆盖写，后续可用于重建。

## 测试端同步

`webLoginApi` 是正式与测试共用的后端，不存在独立测试函数，因此无需另发测试版本；PC 后台页面（`/formation-templates`）位于 `codex/*` 分支，未合入 `main`，未部署正式 `/admin/`，也未部署 `/preview/admin/`。小程序、服务号 H5 本次无改动。

## 未做

- 未改各端只读渲染（属下一阶段）。
- 未建索引。
- 未提交、未推送、未合并分支。
- 未触碰其他会话正在部署的 `getMiniWorkspace`。
