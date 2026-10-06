# 赛小蜂足球生产外部配置检查表

> 更新日期：2026-08-19
> 正式域名：`www.sxffootball.cn`
> 本文件只记录配置名称、归属、验收方式和安全边界，不保存任何 AppSecret、令牌、API Key 或模板真实值。

## 1. 微信开放平台网站应用

配置归属：微信开放平台管理员。

- 网站应用 AppID：`wx5a42aae0e5d0669c`。
- 授权回调域填写：`www.sxffootball.cn`，不带协议、端口、路径或通配符。
- 域名校验文件：`https://www.sxffootball.cn/EHRyanmLQy.txt`，当前公网 HTTP 200。
- 正式 PC 二维码回调地址：`https://www.sxffootball.cn/admin/#/wechat-callback`。
- 回调页通过 `fetch()` 调用 `webLoginApi.wechatWebLogin`，浏览器端不使用 CloudBase SDK。

管理员验收：

1. 在微信开放平台确认网站应用的授权回调域已保存为 `www.sxffootball.cn`。
2. 从 `https://www.sxffootball.cn/admin/#/login` 生成二维码，确认二维码授权请求中的 `redirect_uri` 解码后为上述 PC 回调地址。
3. 使用专用验收账号扫码，确认 `state` 校验通过；成功后进入 `/admin/#/organization-onboarding`。
4. 不在网页、仓库、截图或日志中记录网站应用 AppSecret。

## 2. 裁判服务号模板通知

配置归属：服务号管理员、轻量服务器管理员和 CloudBase 环境管理员。

`sendRefereeTemplateMessages` 当前缺少以下四项环境变量：

| 环境变量 | 值的来源 | 说明 |
|---|---|---|
| `SERVICE_ACCOUNT_APP_ID` | 服务号管理员 | 服务号 AppID，不是网站应用或小程序 AppID |
| `SERVICE_ACCOUNT_APP_SECRET` | 服务号管理员 | 只写 CloudBase 环境变量，禁止写入仓库 |
| `SERVICE_ACCOUNT_REFEREE_TEMPLATE_ID` | 服务号模板消息后台 | 裁判任务通知模板 ID |
| `SERVICE_ACCOUNT_H5_URL` | 固定正式入口 | `https://www.sxffootball.cn/referee/` |
| `SXF_FOOTBALL_WECHAT_BRIDGE_URL` | 固定出口中转 | `https://api.saixiaofeng.com/wechat/football/v1` |
| `SXF_FOOTBALL_WECHAT_BRIDGE_SECRET` | 中转双方独立密钥 | 只写服务器及调用方环境变量，禁止写入仓库 |

默认模板字段为：

- 赛事：`thing1`
- 对阵：`thing2`
- 时间：`time3`
- 角色：`thing4`

若微信模板字段不同，使用 `SERVICE_TEMPLATE_TOURNAMENT_KEY`、`SERVICE_TEMPLATE_MATCH_KEY`、`SERVICE_TEMPLATE_TIME_KEY`、`SERVICE_TEMPLATE_ROLE_KEY` 环境变量覆盖；不得修改前端写死另一套映射。

安全与验收：

1. 配置后只读调用 `configurationStatus`，必须返回 `configured: true`、`missingConfig: []`、`results: []`。
2. 普通直接调用必须继续返回 `INTERNAL_RELAY_REQUIRED`。
3. 真实发送只允许 `webLoginApi` 生成的手机号、时间戳和 60 秒 HMAC 中转证明。
4. 首次真实发送需要单独授权，并使用专用验收裁判、验收比赛和一条通知记录；不得批量触发生产队列。
5. 验收模板内容包含赛事、对阵、时间、角色，点击后进入正式裁判 H5。
6. 微信服务号 API IP 白名单使用轻量服务器固定公网 IP `124.221.239.63`；CloudBase 动态出口 `1.15.19.135` 不再作为长期白名单方案。

## 3. 赛事报名、服务号绑定与审核通知

配置归属：足球小程序管理员、服务号管理员和 CloudBase 环境管理员。报名业务状态、任务中心和通知发件箱已经上线；下列外部微信配置未提供时，系统必须显示“未授权 / 待服务号绑定 / 通道待配置”，不得显示已送达。

| 配置名 | 来源 | 用途 |
|---|---|---|
| `SXF_FOOTBALL_REGISTRATION_QR_ENV_VERSION` | 发布阶段 | `develop`、`trial` 或 `release`；生产默认 `release` |
| `SXF_FOOTBALL_MINI_TEMPLATE_TOURNAMENT_REVIEW` | 足球小程序订阅消息后台 | 报名审核结果订阅模板 ID，不得复制篮球模板 |
| `SXF_FOOTBALL_MINI_REVIEW_TOURNAMENT_KEY` / `TEAM_KEY` / `STATUS_KEY` / `DETAIL_KEY` | 小程序订阅模板详情 | 对应模板字段名；缺省按 `thing1/thing2/phrase3/thing4`，必须以实际模板为准 |
| `SXF_FOOTBALL_SERVICE_FOLLOW_URL` | 足球服务号/中转服务 | 带 `{scene}` 占位符的参数关注入口，用于小程序与服务号一次性绑定 |
| `SXF_FOOTBALL_SERVICE_CALLBACK_TOKEN` | 足球服务号后台 | 服务号回调签名 Token，只写云函数环境变量 |
| `SXF_FOOTBALL_SERVICE_ACCOUNT_APPID` | 足球服务号基本配置 | 写入轻量服务器中转环境变量，不属于小程序或网站应用AppID |
| `SXF_FOOTBALL_SERVICE_ACCOUNT_APPSECRET` | 足球服务号基本配置 | 用于中转获取普通 `access_token`，写入轻量服务器环境变量，禁止发到对话或提交仓库 |
| `SXF_FOOTBALL_WECHAT_BRIDGE_URL` | 固定出口中转 | `https://api.saixiaofeng.com/wechat/football/v1` |
| `SXF_FOOTBALL_WECHAT_BRIDGE_SECRET` | 中转双方独立密钥 | 服务器与 `tournamentRegistrationFlow` 使用同值 HMAC 密钥 |
| `SXF_FOOTBALL_SERVICE_BRIDGE_KEY` | 服务号中转服务 | 可信桥接调用密钥，只用于受保护的绑定事件中转 |
| `SXF_FOOTBALL_SERVICE_TEMPLATE_REGISTRATION_REVIEW` | 足球服务号模板后台 | 报名审核通过/驳回模板 ID；未申请前明确标记“模板未配置” |
| `SXF_FOOTBALL_SERVICE_REVIEW_TOURNAMENT_KEY` / `TEAM_KEY` / `STATUS_KEY` / `DETAIL_KEY` | 服务号模板详情 | 对应模板字段名；缺省按 `thing1/thing2/phrase3/thing4`，必须以实际模板为准 |

当前外部阻断：

1. `serviceAccountCallback` 已转换为HTTP云函数，正式入口为 `https://cloud1-7g8ckb3c7815a011.service.tcloudbase.com/footballServiceCallback`，健康检查 `/health` 已返回 HTTP 200。
2. 回调 Token 已在CloudBase与微信后台完成同值配置，微信服务器配置使用明文模式并通过首次验签；PC检测已取得 `40164 invalid ip 1.15.19.135`，确认 CloudBase 动态出口不在服务号白名单。
3. 已确定使用上海轻量服务器 `saixiaofeng` 的固定公网 IP `124.221.239.63`，通过现有 `api.saixiaofeng.com` 的独立 `/wechat/football/` 路由中转普通 access token、带参关注二维码和服务号模板消息；不得覆盖该域名现有站点和其他路由。
4. 中转程序只监听 `127.0.0.1:8789`，外部请求经 HTTPS/Nginx 转发并校验时间戳、随机数和 HMAC；服务器部署包在 `ops/wechat-football-bridge/`。服务器尚未取得管理会话，因此当前仍是本地待部署状态。
5. 微信回调若启用安全模式，还需要在服务号回调层完成消息解密；当前首次联调只允许选择明文模式，不能伪装支持安全模式。
6. 配置完成后只允许用一届验收赛事、一支验收球队串行测试；不得直接批量推送。

## 4. 域名与赛事大屏

当前状态：

| 域名 | DNS/HTTPS | 后续动作 |
|---|---|---|
| `www.sxffootball.cn` | CNAME 正常，HTTPS 200 | 已完成 |
| `sxffootball.cn` | 无可用网站 HTTPS | 由 DNS/网关管理员选择根域名跳转或 ALIAS/扁平化方案 |
| `screen.sxffootball.cn` | 无 CNAME、A 记录和 HTTPS；仓库内也没有独立公开大屏应用或 `/draw/:tournamentId` 路由 | 先确认大屏产品范围、公开只读数据接口、承载服务、证书和路由，再配置 DNS |

当前 `ProfessionalDrawFlow.vue` 只提供后台内大屏设置/预览，并生成 `https://screen.sxffootball.cn/draw/:tournamentId?divisionId=...` 外链；正式路由表没有该公开页面，生产构建也只有后台预览组件。不要只添加 `screen` DNS 后就宣称大屏上线。

大屏开始实施前需要确认：

1. 是否新建独立公开大屏应用，还是由现有 PC 应用提供不带后台导航的公开只读路由。
2. 大屏只展示抽签，还是同时覆盖赛程、比分、颁奖等场景。
3. 匿名访问使用公开令牌、发布快照还是其他只读授权；不得直接开放主办方数据库查询。
4. 大屏数据如何发布、撤回、过期和防止跨赛事读取。

完成条件必须同时包括：批准的大屏原型、正式页面、公开只读数据边界、目标服务、证书、DNS、根路由、HTTPS 200、目标/回退分辨率截图和异常/返回路径。

## 5. 当前未发布候选范围

- 官网根 `index.html` 与线上一致，无需重复上传。
- PC 候选包：完整 `web-admin-vue/dist`，193 个文件；因 Vite 哈希资源图变化，发布时必须完整上传 `/admin/`。
- 家长 H5：仅 `service-account-h5/app.js` 与 `service-account-h5/styles.css` 与线上不同。
- 小程序和云函数没有本轮源码发布差异。
- 当前用户要求暂不提交审核和发布；未获得新授权前不得上传上述候选包。

## 6. 配置完成后的统一回读

在正式仓库执行只读检查：

```powershell
cd E:\Documents\sxf-football
.\tools\check-production-readiness.ps1
```

脚本只执行 DNS/HTTPS 查询、`setHeadReferee` 无会话鉴权探针和裁判通知 `configurationStatus`；不会发送通知、读取通知队列、写业务数据或打印凭据。`readiness.full` 只有在核心 Web、裁判通知、根域名兼容入口和赛事大屏全部就绪时才为 `true`。

按顺序验证：

1. 微信开放平台回调域与扫码登录。
2. 裁判通知 `configurationStatus`。
3. 直接调用拒绝门禁。
4. 经单独授权后的一条真实模板消息。
5. `www`、根域名和 `screen` 的 DNS、证书、HTTPS 与页面路径。
6. 将实际结果写回 `docs/CURRENT_STATUS.md` 和 `docs/SESSION_HANDOFF_2026-08-13.md`。
