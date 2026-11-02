# AI 形象照高清链路修复（2026-10-28）

状态：用户已选择「保留现模型，服务端抠图后只返回透明 PNG」。后端及正式/测试演示页均已发布并读回，最终版本完成真实生成、分割、透明通道及原尺寸验证。

## 最终发布结果

- `pipelineVersion:20261028-transparent-png-v2`；Seedream 4.5 生成后调用既有 `baiduRemoveBg`，只将 1024 长边分割请求图用于取得蒙版；将 alpha 蒙版映射到原始 1728×2304 RGB 图像，人物 RGB 不缩放、不重复 JPEG 编码。蒙版收边 2 个分割像素，消除明显白色背景描边；不按衣服颜色抠白，白球衣内部保持不透明。
- 新增 `transparentPortrait.cjs`；仅演示页传 `transparentOutput:true`，旧登记调用保持兼容。分割失败、无有效 alpha 或返回 labelmap/scoremap 时明确失败，不回退白底图。PNG 在响应中仅返回一次，避免 `image` 和 `images` 重复承载大图撞 HTTP 6MB 上限。
- H5 结果用棋盘格展示透明背景，保存扩展名为 `.png`；只接受服务端明确返回的透明 PNG。正式 `/service-account-h5/ai-portrait-demo.html`、测试 `/preview/service-account-h5/ai-portrait-demo.html` 两处 HTTP 200，均为 57,611B，SHA-256 均与本地一致：`E59602627198F423B58F6F6ABC98E2D50ED7D9AAED41204E83772EC2D63E45BF`。两端共用 `/aiPortraitDemo` 后端，未部署其他端口或其他函数。
- 最终真实调用（白色球衣）：输入 333,984B、生成请求 460B，49,070ms 返回 1728×2304 PNG / 1,836,729B；全透明 2,229,977 像素、完全不透明 1,642,232 像素、半透明 109,103 像素，白色不透明像素 421,907。参考图取消清理返回 200。证据为本地 `output/ai-portrait-chain-20261028/transparent-evidence.json`，图片不入知识库。
- 代码回下载核验：入口 SHA-256 `3D0774FA247E14FDA95E91BDEF5753D2AEFDB94CD52902B5110E334029A42D20`；透明模块 SHA-256 `43B56403782CCAB0AC2B4E719C13C948FF2C585C4192A6B955DB1CAF5342D80D`；上传模块及 package 文件亦逐文件比对。仅代码更新，未更改函数配置或凭据。
- `node --check` 及 `tools/test-ai-portrait-chain.cjs` 通过；覆盖有效 alpha、白衣保留、原尺寸/RGB、非透明/无效分割拒绝、高清直传和无水印不裁切。浏览器自动验收因调试连接失败、Windows 安全层无法可靠确认当前网址而中止，未完成浏览器内生成与下载按钮的端到端点击验收；未绕过该限制。接口真实调用与 HTTP/摘要验收已完成。
- 没有真人原照，本次使用用户提供的已有生成图做技术验证，不据此宣称人物质感已达标。未提交 Git，源码仍为未提交工作区快照。

以下记录保留本次修复的较早阶段；其中「等待路线确定」「H5 未发布」已由以上最终发布结果替代。

## 已确认问题

- 线上 `trimWatermark(src, data.watermark !== 'none')` 的布尔含义与函数内部 `if (skip)` 相反，导致 `watermark:none` 仍裁掉右侧 12%、底部 9.5%，再 JPEG 编码。1728×2304 经此路径正好成为用户提供的 1521×2085。
- 原参考板为 700–960 像素，JPEG/Base64 被限制在 95,000 字符内，受约 100KB HTTP 请求体限制。
- 原服务端构图归一会双线性缩放并 JPEG 编码；需要保留模型原始返回，才能判断质量损失来自哪里。

## 本次实现

- `cloudfunctions/aiPortraitDemo/referenceUpload.cjs`：服务端生成随机对象路径及单对象上传元数据，浏览器通过 `fetch PUT` 直传 JPEG；HMAC 凭证有效期 10 分钟，只允许读取自身随机路径，拒绝任意文件 ID/URL；读取前核对对象大小，限制 3MB，解码限制 8MP、边长 3072。读取后删除参考对象；前端直传失败也调用取消接口。
- 临时文件不写数据库，不进入球员档案。**浏览器上传后直接关闭、生成前验证拒绝或网络完全中断时，可能遗留临时对象；凭证到期不等于对象自动删除，本轮未配置存储生命周期或清理定时任务。**
- `aiPortraitDemo/index.js`：增加 `prepareReference` / `cancelReference`、`referenceTicket`、`preserveOriginal`，GET 返回 `pipelineVersion:20261028-hd-reference-v1`。现有登记端不传新字段，保留其原构图归一行为；未发布其他函数，未改配置、凭据或模型目录。
- H5 待发布代码：头肩图优先 1600px/q0.94，脸与球衣参考板优先 2048px/q0.94；不再对参考照片做白底净化，不再挤进小请求体，不因参考板编码失败静默丢掉球衣条件。误裁逻辑改为只有 `watermark:trim` 才处理。演示页请求保留原始输出。
- 模型、提示词保持原样，便于之后对照。Seedream 4.5 当前网关返回 JPEG；**转 PNG 编码不能凭空生成透明 alpha**。用户追加要求只输出透明 PNG，待选择保留当前模型服务端分割，或核验可接入的原生透明模型；此部分尚未实现。

## 验证

- `node --check` 两个后端文件通过；`node tools/test-ai-portrait-chain.cjs` 通过：凭证篡改/过期/越界拒绝、原字节读取、超大图拒绝、正常与失败清理、无水印图片不解码不裁切、浏览器直传和小 JSON 请求。
- 云端直传：CORS OPTIONS 200，允许正式域名及 PUT 所需签名头；PUT 200；取消清理接口 200。
- 真实调用一次：使用用户提供的已有生成图进行技术链路验证，输入 333,984B，生成请求 437B，输出 498,518B，1728×2304，`mode:reference`、`originalPreserved:true`、`compositionNormalized:false`、45,524ms。此调用证明传输和原图保留，不能证明用真人原照的画质已经达标。
- 证据在本地 `output/ai-portrait-chain-20261028/generation-evidence.json`；图片及凭证不归档至知识库。
- 以刚下载线上包为基线检查，入口差异仅为本次高清链路变更，新增模块无额外依赖。只执行 `fn code update` 更新代码，未执行配置更新。下载部署后 `index.js`、`referenceUpload.cjs`、`package.json`、`package-lock.json` 四文件 SHA-256 与本地全部一致；入口摘要 `5E9B81BC6E77A05651685F4270F250A16DDB632CCB515DD310598F18B3E08DD0`，上传模块摘要 `2839C30871382C865B4B3E95316ED84831139D76331FE5326F22932E995730DC`。

## 发布边界与待办

- 后端正式/测试共用 `/aiPortraitDemo`。H5 正式 `/service-account-h5/ai-portrait-demo.html` 与已登记测试 `/preview/service-account-h5/ai-portrait-demo.html` 本轮均未上传；当前线上页面仍是旧链路。
- 透明输出方案确定后，完成 alpha 真透明、边缘/白色球衣、输出尺寸与体积验收，再同时定向发布两份 H5 并读回摘要。
- 未提交 Git，保留同期用户与其他任务修改；不把工作区整包或长期平台分支合入 main/preview。
