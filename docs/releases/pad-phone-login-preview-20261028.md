# 平板手机号验证码登录与宽屏品牌页

2026-10-28，用户确认增加手机号验证码登录，并明确授权更新 webLoginApi、新增 ADMINONLY 登录验证集合和复用短信服务。前端仅发布测试后台 /preview/admin/，正式 /admin/ 未发布。

## 本轮行为

- 宽屏统一左侧既有竖版 LOGO，右侧微信扫码 / 手机号登录；不再限制为触摸媒体查询，电脑宽屏也生效。保留微信二维码、刷新和教程。
- 手机号仅登录已有唯一有效自然人账号，同时兼容 users.phone / phoneNumber；不存在、停用或重复账号拒绝，不自动注册、不修改机构归属或微信标识。服务端发共同 auth_sessions 会话；客户端清理上一账号身份、机构、赛事授权缓存后写入新会话，并继续既有机构引导与服务号绑定检查。
- 新集合 web_phone_login 已创建，ACL 回读 ADMINONLY；通用 dbQuery 也拒绝读取。挑战和速率标识存散列，验证码绑定挑战与用户，5 分钟有效、最多 5 次错误，事务内一次性消费。60 秒间隔，手机号 10 次请求/日、客户端 50 次/小时，全局 200 次/小时与 1000 次/日，均为请求预算；可通过已有环境变量机制调整，本次没有修改环境配置。
- 切换至手机号时卸载二维码并清理微信 state；微信回调必须校验存在且匹配的 state，阻断过期回调。

## 代码与发布

- 基线 preview 8c5ec065a1540a4ac7da76e6292c19075706ed0d。功能提交 c2ef2cf33a3a21d6652e24d9b9ec5e21d8ba8b32，预览集成 85ace1edfd2296cd7d351a395c1dea63814dc728，均已推送 Gitee。
- 使用正式仓库内 .codex-artifacts/pad-preview-20261028 的精确提交归档构建，base=/preview/admin/。npm run build 通过，406 个静态文件上传。
- 后端从本次刚下载的线上完整包做最小差量，仅 index.js 与新增 phoneCodeLogin.cjs；CLI fn code update，不更新函数配置。已下载部署结果，比对 125 个源码及资源文件一致，并通过裁判表接口与相对依赖完整性检查。状态 Active，Nodejs18.15，内存512MB，超时120秒。sendSms 继续复用已在线支持 loginChallengeId 的版本，未改动。

## 验证

- 本地 17 项账号/验证码/并发/频率限制/会话切换测试通过。真实组件在 1461×1026 鼠标宽屏、1548×1032 与 1032×600 触摸横屏通过；既有平板业务页面回归失败数为0。测试使用模拟短信，没有真实账号写入。
- 线上手机号 capability enabled=true；错误手机号/验证码格式拒绝；新集合通用查询拒绝；裁判表接口仍按 AUTH_REQUIRED 阻断未登录调用。
- 真实微信二维码已加载，刷新会变更二维码。1032×600 手机号入口可用，无横向溢出，未发送真实短信。真实短信收取及账号登录仍需用户验收，不能据此宣称已完成真实 OTP 链路。
- 入口与 9 项关键资源 HTTP200、SHA-256 匹配本地；preview index SHA256=91dcbfc0de3dbfa2db7f0c50fc7419f56e564e1ef33050399fe501b81e638faa。正式 /admin/ index SHA256=b75b7ffc65cc10eb7cc35ea8999cf2d929706bc6a714d341c326c339bc124163，保持原样。
- 验收地址：https://www.sxffootball.cn/preview/admin/?layout=20261028c#/login 。未重打包安卓或 Windows 安装包。

证据位于 output/phone-code-login-20261028/（backend-online-probes.json、hosting-readback.json、ui-result.json、live-phone-ready.json、live-qr.log、构建及业务回归日志）；不归档真实手机号、OTP、会话令牌或云端凭据。
