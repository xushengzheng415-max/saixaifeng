# 球员卡排版预览与成卡大图对齐（2026-10-29）

## 问题

平台「编辑卡片」右侧排版预览与弹窗「成卡大图」排版不一致：国籍旗帜与球队队徽纵向偏移约半个元素高度，`SAMPLE`、`身高/体重`等 600 字重文字在成卡里明显比预览更粗更大。

## 根因

1. **徽标锚点**：编辑器把 `badges.*.y` 当作元素上边缘（`.card-badge{top:y;height:size}`），服务端 resvg 按中心锚定（国旗 `y-h/2`、队徽 `y-size/2`），canvas 端同样中心锚定。
2. **字重解析**：编辑器 `@font-face` 声明常规 `400 600`、粗体 `700 900`，600 落到常规字面；resvg 与 canvas 按“最近字重”吸附，600 落到粗体。
3. **国籍文字**：编辑器固定 `8px` 且未垂直居中，服务端 `min(size*0.6,18)` 按悬垂基线直接起排。

## 改动

| 文件 | 改动 |
|---|---|
| `cloudfunctions/webLoginApi/playerCardRender.cjs` | 国旗改为上边缘锚定（`top=y`）；队徽 `y` 直接用 `badges.team.y`；非中国籍国籍文字按 `y+(size*2/3-textSize)/2` 在 `size*2/3` 高的框内垂直居中、字重 700。字重映射保持原样（不压成两档），由前端统一字重区间到 resvg/canvas 的吸附结果。 |
| `platform-admin-vue/src/views/tournament-center/PlayerCardTemplateLibrary.vue` | `@font-face` 区间改为常规 `400 500`、粗体 `600 900`；国籍徽标按 `y` 起始、`size*2/3` 高、字号 `min(size*0.6,18)`，移除固定 `8px`。 |
| `shared/player-card/draw.js` 及 `service-account-h5/dynamic-card-renderer.js`、`miniprogram/utils/dynamic-card-draw.js` | 国旗与队徽改为上边缘锚定；非中国籍国籍文字在 `size*2/3` 框内居中、字重 700。副本由 `tools/sync-dynamic-player-card.mjs` 同步。 |

## 验证

- resvg 本地渲染 300×430：国旗 bbox `x=111..138, y=394..412`，与编辑器 `top: 394px; height: 18.67px` 一致；队徽上边缘同为 `badges.team.y`。
- `node --check` 通过；`node tools/sync-dynamic-player-card.mjs --check` → `PASS: 三端动态球员卡模块一致`。
- `platform-admin-vue`：边界检查 56 个源码文件通过，`npm run build` 成功，产物含 `600 900` 字重区间。
- `webLoginApi`：以线上包为基线（线上 `playerCardRender.cjs` 与提交前仓库逐字节一致），只替换该文件；`node tools/check-referee-backend-package.cjs <包目录>` 通过；回下载 6,612 文件，仅 `node_modules/.package-lock.json` 元数据差异。
- `getMiniWorkspace`：同基线方式只替换同一文件；回读 5,941 文件无缺失/新增，11 个文件差异来自在线依赖安装（`qs` 6.17.0→6.17.1、`@types/node` 26.6.5→26.6.6）。

## 发布

- 源码提交 `8ae968e0`（分支 `codex/platform-ops`）。
- 平台前端 `npm run deploy`：release `20261029082708-8ae968e0`，45 个文件摘要一致。
- `webLoginApi`：`fn code update`（COS）成功；读回 Active/Available、Nodejs18.15、120s、512MB、`index.main`、26 个环境变量、无 CodeError；`GET .../webLoginApi` 返回 200 与 `{"success":false,"error":"未知操作：undefined"}`。
- `getMiniWorkspace`：`fn code update`（COS）成功；读回 Active/Available、Nodejs18.15、150s、512MB、2 个环境变量保留。

## 追加：确认发布写入失败（同日 16:33）

平台「预览发布」点「确认发布」时页面提示「模板状态写入失败，请重试」。云函数日志：

```
[playerCardTemplates] savePlayerCardTemplate  document.set:fail -501007 invalid parameters. 不能更新_id的值
{"success":false,"code":"CARD_TEMPLATE_ERROR","error":"模板状态写入失败，请重试"}
```

- 根因：`playerCardWorkflows.publish` 的发布事务把读回的 `player_card_template_states` 文档整体展开回写（`set({data:{...(p.state||{}), ...}})`），状态文档自带 `_id`，CloudBase 一律拒绝写入 `_id`。旧单模板时代已存在按等级（`bronze`/`silver`/`gold`）的基态文档，因此金银铜套系首次发布就会命中。
- `playerCardDynamic.publish`（旧单模板 `publishDynamicPlayerCardTemplate` 路径）有同一写法，一并修复。
- 改动：新增 `fieldsOf(value)` 统一剔除 `_id`、`_openid`，在版本快照、状态文档、`published` 快照三处展开前调用；导出语义不变，只是不再回写主键。
- 回归：`tools/test-player-card-workflows.cjs` 的 mock `set` 现在按线上行为断言 `data` 不含 `_id`/`_openid`，并预置带 `_id` 的等级状态文档 + 二次发布场景。未应用修复时测试按线上同一行（`playerCardWorkflows.cjs:112`）失败，应用后通过；`test-player-card-legacy-read`、`test-player-card-preload`、`test-player-card-automatic-issue`、`test-player-card-text-styles`、`test-player-card-entitlement`、`test-player-card-unified` 均通过（`test-player-card-library` 与 `test-player-card-publish-cache` 在修复前即失败，与本次无关）。
- 发布：源码提交 `600bef3e`；`webLoginApi` 以线上包为基线只替换 `playerCardWorkflows.cjs`、`playerCardDynamic.cjs`，`check-referee-backend-package` 通过，`fn code update`（COS）成功，回下载 6,612 文件仅 `node_modules/.package-lock.json` 元数据差异，两个目标文件哈希一致；读回 Active/Available、Nodejs18.15、120s、512MB、`index.main`、26 个环境变量、`InstallDependency=TRUE`（与发布前一致）、无 CodeError；`GET .../webLoginApi` 返回 200。
- `getMiniWorkspace` 的同名副本按 `tools/sync-dynamic-player-card.mjs` 已同步源码；该函数只调用 `read`/`descriptor`/`exportCard`，不进入 `publish`，本次未整包重发，待其下次发版自然带上。
- 平台前端无需改动，线上仍是 `580b6125` 构建。

## 遗留

- 已生成的导出图与已发布的静态成卡仍沿用旧锚点：`player_card_renders` 的缓存键只含 `dataVersion` 与渲染版本号，渲染版本未变，因此需要重新生成或重新发布才会呈现新排版。
- 小程序展示端 `miniprogram/utils/dynamic-card-draw.js` 与 H5 `service-account-h5/dynamic-card-renderer.js` 只同步了源码，需随各自端口发版生效；小程序发版前，其 canvas 展示与服务端导出在徽标纵向仍有约 9–16px 差异。
- `getMiniWorkspace` 在 `cloudbaserc.json` 中没有函数条目，`fn code update` 按 CLI 默认配置执行，读回 `InstallDependency=TRUE` 并触发了一次在线依赖安装。后续该函数代码发布应显式提供安装关闭的受控配置，避免再次升级间接依赖。
