# AI 形象照演示页交接文档

> **2026-10-28 同日后续发布说明**：用户已授权并完成注册端透明成片直入库发布。正式 `service-entry.js` 现已通过登记专属凭证取得透明 PNG，确认使用只传受控成片编号，不再转 JPEG 或重复抠图。下文 v3.0 是 19:40 快照，第六章等「正式注册端仍走白底」描述保留历史追溯，当前状态以 [注册端发布记录](../releases/registration-transparent-portrait-20261028.md) 为准；后台工具仍仅管理员自用，客户确认使用仍按服务端既有规则扣蜂蜜。

版本：v3.0｜快照时间：2026-10-28 19:40（北京时间）｜状态：**公开演示模式已退役**（页面只显示迁移提示），生图工具收口到平台运营后台内嵌页；线上云函数已带后台会话门禁，公开请求不再接受透明输出与高清凭证。

本文覆盖 `service-account-h5/ai-portrait-demo.html` 与后端 `cloudfunctions/aiPortraitDemo`：现行状态、页面结构、接口契约、图像流水线、提示词、模型目录、部署验证、已知风险、待办。

> **先读 §0**。2026-10-28 这一天里，同一个页面被两条工作线并行改造过：一条修「成片有阴影 + 糊」，一条做「高清参考图直传 + 透明 PNG + 平台后台生图工具」。最终由后者收口，公开演示入口下线。本文所有状态都在 2026-10-28 19:15–19:40 重新回读核对过，不再沿用手写推断。

关联文档：

- 最后一轮发布记录（权威）：[`docs/releases/platform-ai-portrait-tool-20261028.md`](../releases/platform-ai-portrait-tool-20261028.md) — 平台工具、模型配置、会话鉴权
- 透明链路改造记录：[`docs/releases/ai-portrait-hd-chain-20261028.md`](../releases/ai-portrait-hd-chain-20261028.md)
- 白底/阴影修复明细：[`docs/CURRENT_STATUS.md`](../CURRENT_STATUS.md) 顶部 2026-10-28 条目
- 价格与权益口径：[`docs/MEMBERSHIP_HONEY_PRICING_2026-10-27.md`](../MEMBERSHIP_HONEY_PRICING_2026-10-27.md)
- 正式 H5 的扣费入口：`cloudfunctions/webLoginApi/serviceAiPortrait.cjs`
- 开发红线：[`AGENTS.md`](../../AGENTS.md) 第三、四、五章

---

## §0 现行状态（19:40 回读，先看这张表）

| 通道 | 现行实际内容 | 能否出图 |
| --- | --- | --- |
| **线上页面**（正式 + 预览 + 本地三份相同） | 61,652 B / SHA-256 `90026295…`；脚本第 292–295 行：非 `adminTool=1` 一律把 `body` 换成「工具已迁至平台后台」并 `return` | **公开打开不能出图**，只显示迁移提示和平台后台链接 |
| **平台后台内嵌**（`?adminTool=1` + 父窗口 `https://pingtai.sxffootball.cn`） | 父窗口 postMessage 下发 15 分钟票据，页面把 action 改写成 `adminTool*` 并带 `adminTicket` | **唯一可用入口**，强制透明 PNG |
| **线上云函数** `aiPortraitDemo` | `$LATEST` 更新于 2026-10-28 18:49:04；`index.js` 58,888 B / `F0AA0080…`，与本地逐字节一致（19:15 用 `fn code download` 回读核对，4 个源码文件与 2 个依赖声明全部一致） | 公开请求带 `transparentOutput` / `referenceTicket` / `preserveOriginal` / `prepareReference` **一律 403**；不带这些字段的普通白底出图仍 200 |
| **服务号正式 H5**（`service-entry.js`） | 2026-10-28 13:39 版本，未改动；调同一个 `/aiPortraitDemo`，只传白底字段 | 可用（白底链路） |

结论：**前端已下线公开演示，后端同步拒绝公开透明/高清凭证，两条线已自洽收口（最迟 19:15 前完成），不是故障。** 历史快照（56,265 B 正式页、只显示白底）已被同日后续发布全部覆盖。

### 0.1 19:15–19:35 实测证据

| 探测 | 结果 |
| --- | --- |
| `GET /aiPortraitDemo` | 200；`pipelineVersion: "20261028-transparent-png-v2"`、`referenceUpload.enabled: true`、`maxBytes: 3145728`、`outputFormats: ["transparent-png"]` |
| `GET` 返回的模型目录 | **只有 `seedream5flash`（Seedream 5.0 Flash），且 `defaultModel: "seedream5flash"`** —— 说明后台 `platform_settings/aiPortraitModels` 已把 4.5 与混元停用、把 5.0 Flash 设为默认 |
| `POST {action:'generate', transparentOutput:true}` | **403**（不再返回透明 PNG） |
| `POST {action:'generate', referenceTicket:'…'}` | **403** |
| `POST {action:'prepareReference', bytes:1000}` | **403** |
| `POST {action:'adminGetModels'}` / `{action:'adminCreateSession'}` | **403** |
| 线上正式页 / 预览页 HTTP | 均 200、61,652 B、`90026295…`，与本地同哈希 |

### 0.2 一次核对事故（必须记录）

19:19–19:24 用 `curl.exe --data-binary '<json>'` 在 PowerShell 里做门禁探测时，JSON 的双引号在传参过程中被吞掉，后端 `readBody()` 解析失败、退回整个 `event`，于是被当成「无 action 的默认生成」，**真实出了 3 张白底图**（各 12–13 秒，`model: seedream5flash`、`transparent:false`），产生 3 次模型调用费用。随后改用 `Invoke-WebRequest` 重测，三项全部 403，确认门禁生效。

教训：**对线上计费接口做权限探测，必须使用能保证请求体完整性的客户端，并优先选择无副作用动作（如 `adminGetModels`）**；不要用会在参数里丢引号的 shell 拼装方式。

### 0.3 重新核对现行状态的命令

```powershell
# 函数能力与模型目录
Invoke-WebRequest -UseBasicParsing 'https://www.sxffootball.cn/aiPortraitDemo'

# 线上函数代码回读（与本地逐文件比对 SHA-256）
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run fn code download aiPortraitDemo <临时目录>
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run fn detail aiPortraitDemo --json   # 看 ModTime / Qualifier

# 两个页面哈希（应同为 61,652 B / 90026295…）
# 可用 System.Net.Http.HttpClient 取字节后算 SHA-256，避免 RawContentStream 差异
```

门禁探测只用无副作用动作：

```powershell
Invoke-WebRequest -UseBasicParsing -Method POST -Uri 'https://www.sxffootball.cn/aiPortraitDemo' `
  -Body '{"action":"adminGetModels"}' -ContentType 'application/json'   # 期望 403
```

---

## 一、结论速览

| 问题 | 结论 |
| --- | --- |
| 谁还能打开这个页面出图 | 只有从平台运营后台 `https://pingtai.sxffootball.cn/` 打开内嵌页（`adminTool=1` + 15 分钟票据）。公开链接只显示「工具已迁至平台后台」。 |
| 出图用什么模型 | **线上当前只下发 Seedream 5.0 Flash**（`doubao-seedream-5-0-flash-260915`），并作为默认。代码里三个模型都不再硬编码隐藏，上下架与默认值由 `platform_settings/aiPortraitModels` 决定。 |
| 一次出几张、多久 | 后台工具：1 张透明 PNG，1728×2304；实测 45–60 秒（含分割）。普通白底：1 张 JPEG，12–45 秒。 |
| 会不会产生费用 | 会。每次生成真实调用模型服务商，后台工具再多一次 `baiduRemoveBg` 分割。只有单实例 6 次/60 秒轻限流，没有按人额度。后台工具不扣蜂蜜。 |
| 照片会不会留存 | 业务库不存。`ai_portrait_usage` 只记模型/模式/姿势/张数/成败/耗时/错误摘要，不含照片、人脸、提示词、手机号。高清参考图直传云存储 `ai-portrait-reference/`，读取后立即删除；异常中断可能残留。 |
| 阴影/糊修了吗 | 修了：参考板纯白、参考分辨率上调、服务端 `whitenBackground`、提示词补 `PURE_WHITE_BG`。真实成片非纯白背景 **25.3% → 1.6%**。这套服务端修复对正式 H5 同样生效。 |
| 还有什么硬伤 | 模型重绘脸（身份漂移）、脸比球衣软、头发边缘可能「发刺」；构图归一依赖「非白像素外框」，背景灰雾没清干净时会看起来偏右。 |
| 代码在 Git 里吗 | **不在**：页面、`aiPortraitDemo` 全目录、`tools/` 下 3 个形象照测试脚本、本文档所在 `docs/handoffs/` 均为未跟踪状态（2026-10-28 19:40 核对）。 |

---

## 二、文件与版本快照

### 2.1 页面 `service-account-h5/ai-portrait-demo.html`

| 版本 | 大小 | SHA-256（前 8 位） | 状态 |
| --- | --- | --- | --- |
| 现行（正式 = 预览 = 本地） | 61,652 B | `90026295` | 公开访问显示迁移提示；`adminTool=1` 内嵌平台后台可用；高清直传 + 透明 PNG |
| 历史（2026-10-28 17:47 的白底修复版） | 56,265 B | `8509b8c2` | 已被覆盖，仅存在于历史记录中 |

配套静态资源（正式与预览目录各自一份，改图要各自发布）：

| 资源 | 说明 |
| --- | --- |
| `assets/logo-saixiaofeng-football.png`（97,308 B） | 顶部品牌图。页面写站点绝对路径 `/service-account-h5/assets/…`，预览目录取的是正式站这份 |
| `assets/pose-presets/pose-front.jpg`（32,948 B） | 03 步「正面抱膀」示例 |
| `assets/pose-presets/pose-three-quarter.jpg`（31,901 B） | 03 步「半侧抱膀」示例 |
| `assets/pose-presets/pose-low.jpg`（33,907 B） | 03 步「低位抱膀」示例 |

### 2.2 云函数 `cloudfunctions/aiPortraitDemo`

| 文件 | 大小 | SHA-256（前 8 位） | 说明 |
| --- | --- | --- | --- |
| `index.js` | 58,888 B | `F0AA0080` | 主入口：目录、姿势、提示词、模型调用、白底净化、构图归一、透明输出、`adminTool*` 门禁 |
| `referenceUpload.cjs` | 3,460 B | `2839C308` | 高清参考图直传：随机路径 + 单对象上传元数据 + HMAC 票据 + 消费即删 |
| `transparentPortrait.cjs` | 4,231 B | `43B56403` | 调 `baiduRemoveBg` 取分割蒙版，α 贴回 2K 原图，输出透明 PNG |
| `adminSession.cjs` | 698 B | `F30B09F0` | 校验 `auth_sessions/portrait_tool_<sha256>`：`scope='platform-portrait-tool'`、`active`、15 分钟内有效 |
| `config.json` | 201 B | — | `timeout: 120`、`memorySize: 256`、`permissions.openapi: ["hunyuan.image.generateImage"]` |
| `package.json` | 316 B | — | `@cloudbase/node-sdk ~3.16.0`、`jpeg-js ^0.4.4`、`pngjs ^7.0.0` |

线上 `$LATEST` 更新于 2026-10-28 18:49:04，回读四个源码文件与本地**逐文件哈希一致**，即上表就是线上代码。

---

## 三、页面结构与两种运行模式

### 3.1 公开访问（现行：迁移提示，不可用）

- 单 HTML + 单段内联 `<script>`，零框架、零 `@cloudbase/js-sdk`（符合 AGENTS.md 3.1）。
- 脚本开头判断 `embeddedAdmin`（正则 `(?:\?|&)adminTool=1(?:&|$)`）；**不是内嵌模式就整页替换为**：

  > 工具已迁至平台后台 → 链接 `https://pingtai.sxffootball.cn/`

- 因此公开链接不存在「能出白底图」的旧行为，也不存在「请求透明被 403」的错配。任何要测效果的人都必须走平台后台。

### 3.2 平台后台内嵌模式（`?adminTool=1`）

| 环节 | 实际实现 |
| --- | --- |
| 会话握手 | 加载后向父窗口 `https://pingtai.sxffootball.cn` 发 `{type:'portrait-tool-ready'}`；父窗口回 `{type:'portrait-tool-session', ticket}`；15 秒未收到 → 「后台生图会话未就绪，请重新打开标签」 |
| 来源校验 | `event.source === window.parent` 且 `event.origin === 'https://pingtai.sxffootball.cn'`，否则丢弃消息（`*.sxffootball.cn` 不可替代） |
| 请求改写 | `portraitFetch()` 把 `prepareReference/cancelReference/generate` 改写为 `adminToolPrepare/adminToolCancel/adminToolGenerate`，`GET` 改写为 `adminToolModels`，并附 `adminTicket` |
| 后端效果 | 校验票据 → 还原 action → **强制** `transparentOutput = true`、`preserveOriginal = true` |
| 票据来源 | `platformOwner.createAiPortraitToolSession`（先 `requireOwner`）写入 `auth_sessions`；`aiPortraitDemo` 对 HTTP 的 `adminCreateSession` 一律 403 |

### 3.3 前端关键函数

| 函数 | 作用 |
| --- | --- |
| `layoutCrop / markCropDirty / endDrag` | 4:5 裁剪框铺底、拖拽边界、缩放联动 |
| `exportCrop(maxWidth, quality)` | 导出 4:5 canvas（现版不再在浏览器端净化） |
| `whitenCanvasRegion(canvas, x0, y0, w, h)` | 浏览器端白底净化。**现版仅保留定义（第 545 行），没有任何调用** |
| `commitCrop()` | 裁剪档位 `[[1600,0.94],[1600,0.90],[1400,0.90]]` |
| `drawRefSheet(size)` / `encodeSheet()` | 拼「脸 + 球衣」参考板：脸 0.62、球衣框 0.34、纯白底；档位 `[[2048,0.94],[2048,0.90],[1800,0.90],[1600,0.90]]`，上限 4,000,000 字符 |
| `uploadReference(dataUrl)` | `prepareReference` 取上传元数据 → `fetch PUT` 直传云存储 → 返回 `ticket`；失败时尽力 `cancelReference` |
| `loadModels / refreshModels / currentModel` | 拉目录、渲染卡片、取当前 key；每次生成前重读后台默认 |
| `run()` | 组装请求：`referenceTicket`、`preserveOriginal:true`、`transparentOutput:true`、体型三件套；结果必须是 `transparent === true && mimeType === 'image/png'`，否则报「未获得透明 PNG」 |
| `trimWatermark(src, skip)` | 兼容字段：仅 `watermark !== 'none'` 时裁右下角，当前恒 `none` |
| 保存 | 透明 PNG 原样下载，文件名 `赛小蜂AI形象照-<YYYYMMDDHHmmss>.png` |

---

## 四、接口契约

### 4.1 `GET /aiPortraitDemo`

```json
{
  "success": true,
  "message": "AI 形象照演示接口，请用 POST 调用",
  "pipelineVersion": "20261028-transparent-png-v2",
  "referenceUpload": { "enabled": true, "maxBytes": 3145728 },
  "outputFormats": ["transparent-png"],
  "poses": [{ "key": "front", "label": "正面抱膀" }],
  "models": [{ "key": "seedream5flash", "label": "Seedream 5.0 Flash", "ready": true, "default": true }],
  "defaultModel": "seedream5flash",
  "allowUserChoice": true
}
```

`models` / `defaultModel` 是**后台配置的投影**，不是代码常量：线上当前只下发 Seedream 5.0 Flash（见 §8）。`pipelineVersion`、`referenceUpload`、`outputFormats` 为 2026-10-28 新增。

### 4.2 `POST /aiPortraitDemo`

**控制类 action**

| action | 入参 | 返回 | 公开请求 |
| --- | --- | --- | --- |
| `prepareReference` | `bytes`（100 B – 3 MB 整数） | `{ data: { url, headers, ticket, maxBytes } }` | **403**（仅 `adminToolPrepare` 可用） |
| `cancelReference` | `ticket` | `{ success: true }` | **403** |
| `adminCreateSession` | — | 403 | 403（只允许平台后台服务端建会话） |
| `adminToolModels / adminToolPrepare / adminToolCancel / adminToolGenerate` | 对应公开 action + `adminTicket` | 同公开 action | 需票据，失败 403「后台生图会话已过期，请重新打开标签」 |
| `adminGetModels` | — | 目录 + 设置 | 403（只允许云函数内部调用） |

**出图字段**

| 字段 | 类型 | 约束与默认值 | 说明 |
| --- | --- | --- | --- |
| `pose` | string | `front` / `side` / `low`，默认 `front` | 非法 → 400 `不支持的姿势预设` |
| `photo` | string | `^data:image/(png\|jpeg\|webp);base64,` 且 < 1,200,000 字符 | 内联参考图（公开白底链路可用） |
| `referenceTicket` | string | `prepareReference` 返回的票据 | **公开请求 403**；后台工具用云存储里的高清参考图 |
| `model` | string | 目录内 key | 下架/停用/未开通 → 400，不静默替换 |
| `jerseyRef` | boolean | 有 `photo` 时生效 | `true` = 参考板（脸 + 球衣） |
| `jerseyPreset` | boolean | 默认 `false` | `true` = 颜色是显式样板色（纯白也算有效） |
| `jerseyColor` | string | `^#[0-9a-f]{6}$` | 非样板模式下纯白视为取色失败丢弃 |
| `jerseyStyle` | string | `plain` / `raglan` / `striped` | 只在无参考板时写进提示词 |
| `jerseyText` | boolean | 默认 `false` | `true` 才让 AI 试写胸前文字 |
| `aspectRatio` | string | `3:4` / `1:1` / `4:3`，默认 `3:4` | 只影响出图尺寸 |
| `height` / `weight` | number | 120–230 cm 与 20–200 kg | 非法按「没填」处理 |
| `bodyType` | string | `lean` / `slim` / `normal` / `strong` / `heavy` / `large` | 手动体型优先于 BMI 推算 |
| `preserveOriginal` | boolean | 默认 `false` | **公开请求 403**；后台工具强制 `true` |
| `transparentOutput` | boolean | 默认 `false` | **公开请求 403**；后台工具强制 `true` |
| `adminTicket` | string | 64 位 hex | 仅 `adminTool*` 需要 |

**成功响应（`data`）**

| 字段 | 公开白底链路 | 后台透明链路 |
| --- | --- | --- |
| `image` | `data:image/jpeg;base64,…` | `data:image/png;base64,…` |
| `images` | 数组 | **不返回**（避免响应超 6MB） |
| `pipelineVersion` | 有 | 有 |
| `transparent` / `mimeType` | `false` / 无 | `true` / `image/png` |
| `originalPreserved` | `false` | `false` |
| `outputWidth` / `outputHeight` | 归一后尺寸 | 2K 原尺寸 |
| 其它 | `mode`、`jerseyMode`、`jerseyStyle(Label)`、`jerseyTextMode`、`pose(Label)`、`model(Label)`、`modelMode:'sync'`、`watermark:'none'`、`compositionNormalized`、`bodyType/bodyLabel`、`durationMs`、`prompt` | 同左 |

**错误码**

| HTTP | 场景 | 页面表现 |
| --- | --- | --- |
| 400 | 模型下架/停用/未开通、姿势非法、参考图凭证失效/无效 | 状态行红字显示后端 `error` |
| 403 | 公开请求带透明/凭证字段、`prepareReference/cancelReference`、`adminTool*` 票据失效、`adminCreateSession`/`adminGetModels` 走 HTTP | `透明球衣照工具仅限平台后台使用` / `高清生图工具仅限平台后台使用` / `后台生图会话已过期…` |
| 413 | 请求体超网关上限（公开页仍受 ~100KB 约束，故高清改走直传） | 网关直接返回，函数不执行 |
| 429 | 单实例 60 秒超过 6 次 | `这一分钟生成次数过多…` / `上传过于频繁…` |
| 502 | 模型或分割失败 | `本次生成失败，请稍后重试` + `detail` |
| 503 | 未配模型凭据时 `prepareReference` | `高清上传暂不可用，请稍后重试` |

---

## 五、图像流水线

### 5.1 白底链路（服务号正式 H5、以及不带工具字段的普通调用）

```
照片（前端自行压缩，正式 H5 为 800px / ≤96,000 字符）
  → POST（内联 photo，可拼参考板）
  → 模型出图（1728×2304 量级）
  → whitenBackground（服务端白底净化）
  → normalizeComposition（顶部 8%、底部贴边、左右留白相等、人物占宽 ≤76%）
  → JPEG q92 → ≤3,000,000 字符内联，超限退回模型临时 URL
```

旧版演示页曾在浏览器端也做净化（`whitenCanvasRegion`），现版该方法只剩定义、不再调用；**白底净化现在全部在服务端**，所以正式 H5 也会受益。

### 5.2 透明链路（平台后台工具）

```
4:5 头肩裁剪 1600/q0.94（≤1400/0.90 退档）
  → 有球衣时拼 2048/q0.94 参考板（≤4,000,000 字符）
  → prepareReference(bytes) 取上传元数据 + ticket（15 分钟、单对象）
  → fetch PUT 直传云存储 ai-portrait-reference/<32hex>.jpg（≤3MB）
  → POST { referenceTicket, preserveOriginal: true, transparentOutput: true, … }
  → consume(ticket)：校验签名/过期/路径/大小/JPEG 魔数 → 读取 → 立即删除
  → 模型原图（不净化、不归一）
  → transparentPortrait.render：
      缩到 ≤1024px 的 JPEG q92 → callFunction baiduRemoveBg(removeBackground)
      → 校验 success、无 type、personNum ≤ 1、返回 PNG 蒙版
      → α 双线性缩放贴回 2K 原图（RGB 保持原像素）
      → PNG deflate 9，内联 ≤5,500,000 字符，超限直接报错（不降级白底）
```

关键限制：

| 项 | 值 |
| --- | --- |
| 参考图上限 | 3 MB（`referenceUpload.MAX_BYTES`）；解码限制 8MP、边长 ≤3072 |
| 票据有效期 | 10 分钟（HMAC-SHA256，密钥复用模型凭据） |
| 临时对象 | `ai-portrait-reference/` 下随机文件名；`consume` 的 `finally` 里删除 |
| 分割依赖 | 云函数 `baiduRemoveBg`（`action:'removeBackground'`） |
| 透明输出上限 | 5,500,000 字符内联，超限报错 |
| 超时 | 函数 `timeout: 120` 秒，需覆盖模型 + 分割两次调用 |

### 5.3 白底净化算法（两版共用，稳定）

| 参数 | 值 | 含义 |
| --- | --- | --- |
| 饱和度上限 | ≤ 18 | `max(r,g,b) - min(r,g,b)`，超过判为彩色 |
| 亮度下限 | ≥ 190 | 平均亮度，低于判为人物/深色物件 |
| 相邻步进 | ≤ 26 | 与父像素亮度差 > 26 且自身 < 238 即视为轮廓，停止生长 |
| 纯白例外 | ≥ 238 | 允许跨过硬边（阴影边缘亮线） |
| 种子 | 画面四边 | 只清连到边框的背景；被围住的白领、白球衣高光不动 |

实现要点（**改这段必须保留**）：

1. `Uint8Array visited` + `Int32Array` 手写栈，不递归，避免 2K 图爆栈。
2. **先取基准亮度、再涂白**：`const base = valueAt(index)` 然后写 255。反过来会让邻居全拿 255 比，灰影被判成边缘漏掉（2026-10-28 首轮单测踩过）。
3. 净化必须在量外框**之前**，否则灰影/暗角会把人物外框拉宽。

服务端函数返回 `clearedRatio`（千分位），目前只用于本地排查，未回传 HTTP 响应。

### 5.4 构图归一

| 常量 | 默认 | 环境变量 |
| --- | --- | --- |
| 开关 | 开 | `COMPOSE_NORMALIZE=0` 关闭 |
| 人物最大占宽 | 0.76 | `COMPOSE_SUBJECT_WIDTH_RATIO`（0.2–0.95） |
| 头顶留白 | 0.08 | `COMPOSE_TOP_MARGIN_RATIO` |
| 输出质量 | q92 | 常量，不开放 |

- 外框判定：步长 2px，`max-min ≤ 10 && min ≥ 238` 判为背景。
- 缩放：`min(0.76W/boxW, 0.92H/boxH)`，水平居中、底边贴齐，双线性重采样到同尺寸纯白画布。
- 失败即跳过：外框为空或宽/高不足 10% → 返回 `null`，只打 `warn`，退回模型原图（`compositionNormalized: false`）。
- 透明链路与 `preserveOriginal: true` **不走**这一步。

---

## 六、与正式 H5 的关系（别改错地方）

正式「球员登记 → 智能生成形象照」仍走**同一个接口**，扣费在另一个入口，且 `service-entry.js` 本轮未改动：

| 阶段 | 调用 | 费用 |
| --- | --- | --- |
| 预览出图 | `POST https://www.sxffootball.cn/aiPortraitDemo`，`pose:'front'`、`jerseyPreset:true`、颜色/款式、可选身高体重；照片经 `encodeUploadImage(dataUrl, 800)` 压到 ≤96,000 字符内联 | 不扣蜂蜜，消耗模型额度 |
| 用户点「用这张」 | `webLoginApi` 的 `serviceEntryAiPortraitApply`（`base64Data` + `requestId` 幂等键） | 扣蜂蜜（默认 100 滴，原价 150） |

`serviceAiPortrait.cjs` 硬约束：`base64Data` 必须 `^data:image/(png|jpeg|jpg);base64,` 且 **≤96,000 字符**（`MAX_BASE64_CHARS`），否则 `PHOTO_INVALID` / `PHOTO_TOO_LARGE`。

影响范围：

- 提示词禁令、`whitenBackground`、`normalizeComposition` 都在 `aiPortraitDemo` 里，正式 H5 调的也是它 → **白底修复对正式链路同样生效**，且不会因为演示页下线而失效。
- 正式 H5 **不拼参考板、不做 4:5 裁剪、不做浏览器端净化**，参考图整张直送 → 效果弱于后台工具。
- 透明链路**尚未接入**正式 H5：`serviceEntryAiPortraitApply` 的入口校验仍按 96,000 字符白底 JPEG 设计，要接 2K 透明 PNG 必须先改体积口径与前端压缩策略。

---

## 七、提示词结构

`buildPrompt()` 分「有/无球衣参考板」两条主分支，共用四段固定文案：

| 片段 | 作用 | 位置 |
| --- | --- | --- |
| `POSES[pose].text` | 姿势描述 | 主体句 |
| `COMPOSE` | 平视、半身到髋部、中轴重合、左右留白差 ≤3%、两侧各 20% 纯白、人物占宽 60%、头顶留白 8%、手肘不贴边、无道具/边框/文字 | 结尾构图段 |
| `REFERENCE_FRAME` | 仅参考板分支：参考图只负责脸/发型/球衣，不照搬构图与站位；不沿用参考图背景、底色、影棚灰、灰渐变、暗角、地面投影、环境光 | 参考板分支 |
| `PURE_WHITE_BG` | 纯白（#ffffff）无缝影棚；不要落地投影、背景阴影、灰渐变、暗角、地面反光；轮廓外侧与四周不得有灰雾 | 两条分支都加 |

其余：参考板分支写「左侧同一张脸 + 右侧球衣款式还原（主色/领口/袖口/侧身/暗纹/左胸队徽）+ 文字策略」；样板/取色分支写「颜色 + 款式 + 纯色无文字徽章」，纯白球衣额外补「只保留极轻微接触阴影和清晰边缘」。

`bodyText` 来自 `readBodyProfile()`：身高体重折算比例（非法当没填），手动体型优先；只回标签不回数值。

注意：提示词写「人物占宽 60%、两侧各 20%」，而归一默认是「≤76% 占宽」——两者不是同一套口径：提示词让模型少跑偏，归一兜底几何。**不要为了对齐数字去改归一默认值**，否则「胸口以下白带」会回来。

---

## 八、模型目录与后台配置

```js
DEFAULT_MODEL = 'seedream45'          // 代码兜底默认，仅在后台没有有效配置时生效
MODEL_CATALOG = {
  hunyuan35:      { label: '混元影像 3.5',      model: 'hy-image-v3.5-preview',           order: 5,  hidden: false },
  seedream45:     { label: 'Seedream 4.5',      model: 'doubao-seedream-4-5',             order: 15 },
  seedream5flash: { label: 'Seedream 5.0 Flash', model: 'doubao-seedream-5-0-flash-260915', order: 20, hidden: false }
}
```

| 规则 | 行为 |
| --- | --- |
| `hidden: true` | 固定不下发、请求硬拒绝，后台也开不回来。**当前三个模型都不再硬编码隐藏**（这是 2026-10-28 下午的改动） |
| 后台开关 | `platform_settings/aiPortraitModels`：`{ models: { key: { enabled } }, defaultModel, allowUserChoice }` |
| 缺省配置 | 只启用 `DEFAULT_MODEL`（Seedream 4.5），不自动打开其他模型 |
| 配置读不到 | 回退代码默认设置；正式 H5 侧不因此挡单 |
| `ready` | 服务端是否具备调用凭据；`ready:false` 页面禁止选择 |
| `default` | 取「本次不指定模型时真正会跑的模型」 |
| 自选关闭 | 服务端只按后台默认执行，提交别的已知模型也会被拒 |

**现行线上实际配置（19:15 由 `GET` 反推，未直接读库）**：只下发 `seedream5flash`，`defaultModel` 也是它，`allowUserChoice: true`。即后台已把 Seedream 4.5 与混元停用、把 5.0 Flash 设为默认。要看/改这条配置请在平台后台「AI 形象照 → 模型设置」，不要在代码里写死。

调用侧事实：Seedream 4.5 走 `https://vod.gz.baidubce.com/v1/images/generations`（OpenAI Image Generations 规范透传方舟），`watermark: false`，不接受 `output_format`（只有 5.0 系列支持），尺寸被拒时退回 `2K`；Seedream 5.0 Flash 走火山方舟 `ARK_BASE`，同样 `output_format: 'jpeg'`、`watermark: false`、`response_format: 'url'`，单图一次一张。

---

## 九、环境变量、依赖与外部函数

| 变量 | 必需 | 作用 |
| --- | --- | --- |
| 百度云 VOD 凭据（`BV_API_KEY` 及其别名） | 是（4.5/透明链路） | Seedream 4.5 调用；同时作为 `referenceUpload` 的 HMAC 密钥与 `referenceUpload.enabled` 判定依据 |
| 方舟凭据（`ARK_API_KEY` / `ARK_SEEDREAM_KEY` / `ARK_MODEL`） | 是（5.0 Flash） | Seedream 5.0 Flash 调用；`GET` 的 `ready` 由此判断 |
| 混元凭据（`TOKENHUB_API_KEY`、`HUNYUAN35_MODEL`） | 视配置 | 混元 3.5 |
| `BV_BASE_URL` | 否 | 覆盖 VOD 网关地址 |
| `SEEDREAM45_SIZE` / `SEEDREAM45_OUTPUT_FORMAT` | 否 | 覆盖 4.5 尺寸/输出格式 |
| `COMPOSE_NORMALIZE` / `COMPOSE_SUBJECT_WIDTH_RATIO` / `COMPOSE_TOP_MARGIN_RATIO` | 否 | 构图归一开关与参数 |

凭据只走环境变量；**不得**读入日志、文档、对话或提交仓库。

外部依赖：

| 依赖 | 用途 |
| --- | --- |
| 云函数 `baiduRemoveBg` | 透明链路的人像分割（`action:'removeBackground'`） |
| 云函数 `platformOwner` | `createAiPortraitToolSession`：负责人鉴权后写入 15 分钟工具会话 |
| 集合 `auth_sessions` | `adminSession.verify` 读 `portrait_tool_<sha256(ticket)>`：`active`、`scope:'platform-portrait-tool'`、`operatorId`、`expiresAt` 在未来 15 分钟内 |
| 集合 `ai_portrait_usage` | 用法统计 |
| 集合 `platform_settings` | 模型目录开关 |
| 云存储 `ai-portrait-reference/` | 高清参考图临时对象 |

---

## 十、部署与验证

### 10.1 命令（足球账号 wrapper，cwd = 仓库根）

```powershell
node --check cloudfunctions\aiPortraitDemo\index.js
node --check cloudfunctions\aiPortraitDemo\referenceUpload.cjs
node --check cloudfunctions\aiPortraitDemo\transparentPortrait.cjs
node --check cloudfunctions\aiPortraitDemo\adminSession.cjs

# 云函数代码发布（必须 fn code update；fn deploy 只改配置不传代码）
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run fn code update aiPortraitDemo --dir cloudfunctions/aiPortraitDemo --deployMode cos

# 静态页差量发布（正式 + 测试各一次，两份必须同版）
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run hosting deploy 'service-account-h5\ai-portrait-demo.html' 'service-account-h5/ai-portrait-demo.html'
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run hosting deploy 'service-account-h5\ai-portrait-demo.html' 'preview/service-account-h5/ai-portrait-demo.html'

# 读回
Invoke-WebRequest -UseBasicParsing 'https://www.sxffootball.cn/aiPortraitDemo'
```

禁止事项：

- 不要用 `fn deploy` 代替 `fn code update`。
- 不要整目录覆盖 `service-account-h5/`（同目录有其他会话改动，只差量发布本次文件）。
- 不要在未授权时部署；部署后必须回读 HTTP/摘要，云函数还要 `fn code download` 比对。
- 不要把 `docs/releases/ai-portrait-hd-chain-20261028.md` 里的「待定」当成已验收结论。
- **不要用 curl 拼 JSON 去探测线上计费接口**（§0.2 已踩过，会产生真实费用）。

### 10.2 已验证项

| 验证 | 结果 | 归属 |
| --- | --- | --- |
| `node --check`（index.js + 页面内联脚本） | 通过 | 白底修复线 |
| 白底净化/归一回归 11 项 | 11/11 通过 | 白底修复线 |
| 真实成片离线复算（1521×2085） | 非纯白 **25.3% → 1.6%**，灰影消失、未啃边 | 白底修复线 |
| 浏览器 harness（headless Chrome） | 参考板 24,855 字符、四角与头顶纯白、肤色保持 | 白底修复线 |
| 请求体上限探测 | 88KB 通过、195KB 413 | 白底修复线 |
| `node tools/test-ai-portrait-chain.cjs` | 通过（票据篡改/过期/越界拒绝、原字节读取、超大图拒绝、清理、浏览器直传） | 高清链路线 |
| `tools/test-ai-portrait-model-settings.cjs` | 通过（三模型分发、自选/后台默认、下架拒绝） | 平台工具线 |
| `tools/test-platform-ai-portrait-tool.cjs` | 通过（iframe 握手、横版无溢出、模型提交、生成前重读默认、透明预览） | 平台工具线（桩件，非生产账号） |
| 云端直传 | CORS OPTIONS 200、PUT 200、取消清理 200 | 高清链路线 |
| 真实透明出图一次 | 1728×2304、约 2.3 MB PNG、59.3 秒 | 高清链路线 |
| **19:15 线上函数回读** | `$LATEST` 18:49:04，`index.js` F0AA0080、`adminSession.cjs` F30B09F0、`referenceUpload.cjs` 2839C308、`transparentPortrait.cjs` 43B56403，与本地逐文件一致 | 本次核对 |
| **19:20 门禁实测** | 公开 `transparentOutput` / `referenceTicket` / `prepareReference` / `adminGetModels` / `adminCreateSession` 全部 403 | 本次核对 |
| **19:30 页面回读** | 正式与预览均 61,652 B、`90026295…`，与本地同哈希 | 本次核对 |

回归脚本清单（均未提交）：

| 脚本 | 覆盖 |
| --- | --- |
| `tools/test-ai-portrait-chain.cjs` | 票据与直传链路 |
| `tools/test-ai-portrait-model-settings.cjs` | `vm` 桩加载 `index.js`，模型目录与配置回退 |
| `tools/test-platform-ai-portrait-tool.cjs` | Playwright 跑 `adminTool=1` 内嵌页（依赖 `output/ai-portrait-platform-20261028`、`output/ai-portrait-chain-20261028` 工件） |

白底修复线的 4 个脚本仍在 `%TEMP%`（`sxf-test-whiten.cjs`、`sxf-whiten-real.cjs`、`sxf-build-harness.cjs`、`sxf-probe-body-limit.js`），未入库。

---

## 十一、已知问题与风险

| # | 问题 | 现状与成因 | 建议 |
| --- | --- | --- | --- |
| 1 | 公开演示入口已下线 | 页面非 `adminTool=1` 直接换成迁移提示；后端公开工具字段一律 403 | 对外沟通统一指向平台后台；若将来要恢复公开演示，必须前后端同时放行并成套发布 |
| 2 | 平台工具真实登录未端到端复测 | 发布记录写明「最终负责人登录 → 新会话入库 → 真生成尚未以真实登录账号复测」 | 用真实负责人账号在平台后台完整走一次，留截图与耗时 |
| 3 | 临时参考图可能残留 | `consume` 会删；上传后直接关页、生成前被拒、网络全断时可能遗留；未配存储生命周期 | 配存储生命周期 + 定期清理任务 |
| 4 | 人物可能「整体偏右」 | 归一以非白像素外框为准；背景灰雾/单侧灰影会拉宽外框 | ① 看 `compositionNormalized`；② `COMPOSE_NORMALIZE=0` 出原图对比；③ 看四角是否纯白 |
| 5 | 脸是模型重绘、比球衣软 | 参考图生图必然重画五官；拉普拉斯能量脸 2.65 vs 球衣 4.77 | 产品上标注 AI 生成；必要时换脸/局部重绘或更强保脸模型；可评估轻度 unsharp |
| 6 | 头发「发刺」 | 白底硬边裁片（非 α 抠图）的边缘亮边被模型当成发丝外扩 | 裁剪给头发留余量；提高参考分辨率；透明链路可缓解背景污染 |
| 7 | 透明 PNG 体积 | 2K PNG 内联 ≤5.5MB 硬上限，超限报错 | 如需更大图，改上传对象存储后返回 URL |
| 8 | 无按人额度 | 后台工具有会话鉴权，但仍只是单实例 6 次/分钟；费用由平台自担 | 后台工具加按人/按日配额；正式入口按人计费 |
| 9 | 正式 H5 仍走旧链路 | `service-entry.js` 不裁剪、不净化、不拼参考板；96,000 字符上限容不下 2K 透明 PNG | 拉平前端；接透明 PNG 必须先改扣费接口体积口径 |
| 10 | 照片合规 | 页面承诺「临时上传、生成结束即删、不落库」；缺单独人脸同意、撤回入口、显式 AI 标识 | 正式上线前补齐 |
| 11 | 费用不可控 | 每次 POST 真实计费；透明模式再多一次分割；**误探测也会真出图（§0.2）** | 探测只用无副作用动作；正式做配额 + 失败不计费 |
| 12 | 代码未入库 | 页面、`aiPortraitDemo`、3 个测试脚本、本文档都未跟踪 | 提交需单独授权，只带目标路径，先与并发会话对齐 |

---

## 十二、待办（按优先级）

| 优先级 | 事项 | 说明 |
| --- | --- | --- |
| P0 | 平台工具端到端复测 | 真实负责人登录 → 平台后台生成一次 → 确认票据、透明 PNG、下载与耗时 |
| P0 | 提交代码 | 页面 + `aiPortraitDemo` 全目录 + 3 个测试脚本；先与另一会话对齐 |
| P1 | 正式 H5 拉平 | 移植裁剪 + 参考板；若接透明 PNG，同步放宽 `MAX_BASE64_CHARS` |
| P1 | 临时对象生命周期 | 存储生命周期规则 + 清理任务 + 残留监控 |
| P1 | 身份一致性 | 评估换脸/局部重绘或更强保脸模型，先出对比样张 |
| P2 | 回传诊断字段 | `clearedRatio`、`scale` 进响应，减少「偏右」排查成本 |
| P2 | 白底回归脚本入库 | 4 个 `%TEMP%` 脚本迁到 `tools/` 并登记 |
| P2 | 合规补齐 | 人脸单独同意、删除照片入口、AI 生成标识 |
| P3 | 模型再平衡 | 当前只有 5.0 Flash 在跑；是否恢复 4.5/混元，由用户按效果与费用决定 |

---

## 十三、变更记录

| 时点 | 变更 | 状态 |
| --- | --- | --- |
| 2026-10-27 | 接入 Seedream 4.5（VOD 广州网关）；混元 3.5 / 5.0 Flash 标 `hidden`；新增服务端构图归一 | 上线（后被替代） |
| 2026-10-27 | 提示词补 `REFERENCE_FRAME`（参考图不许照搬构图） | 上线 |
| 2026-10-28 上午 | 用户反馈「成片还有阴影、比较糊」；实测背景 25.3% 未到纯白、脸拉普拉斯 2.65 | 定位 |
| 2026-10-28 17:47 | 参考板改纯白、脸 0.62 / 球衣 0.34、服务端 `whitenBackground`、提示词补 `PURE_WHITE_BG`；页面 `whitenCanvasRegion` | 上线（页面 56,265 B，后被 18:44 版覆盖） |
| 2026-10-28 18:09–18:25 | `referenceUpload.cjs` 直传 + HMAC 票据；`index.js` 支持 `referenceTicket`/`preserveOriginal`；`transparentPortrait.cjs` 透明 PNG | 上线（`20261028-transparent-png-v2`） |
| 2026-10-28 18:44 | 页面切高清链路（1600/2048、直传、透明输出） | 发布到预览，随后同步正式 |
| 2026-10-28 18:48–18:49 | `adminSession.cjs` + `adminTool*` 门禁；去掉模型硬编码隐藏；公开工具字段 403；`$LATEST` 18:49:04 部署 | 上线（`F0AA0080`） |
| 2026-10-28 18:44 起 | 页面（61,652 B）非 `adminTool=1` 已改为「工具已迁至平台后台」；该版发布到正式站后，公开入口即只显示迁移提示 | 上线（现行） |
| 2026-10-28 19:40 | 本文档 v3.0：按 19:15–19:35 回读重写现行状态，记录 §0.2 探测事故 | 交接 |

---

> 维护提醒：改这个页面/云函数前先读 `AGENTS.md` 第三、四、五章；正式计费、照片留存、AI 生成标识、扣费金额都属于产品决策，不能由页面默认值或临时代码替用户决定。重要资料交付后按 `AGENTS.md` 归档要求执行 `node tools/sync-obsidian-data-center.mjs` 并 `--check`。
