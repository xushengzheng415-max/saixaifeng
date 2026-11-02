# 小程序审核驳回整改：首屏游客浏览（2026-10-31）

## 一、驳回原文（微信审核，三条）

1. **未浏览即要求授权**：打开小程序进入首页，未浏览体验功能服务即要求授权手机号、头像、昵称登录。要求「在用户体验浏览功能服务后，再自行选择授权登录」。
2. **登录受限**：流程涉及账号登录，发布前无法完整体验功能，违反《微信小程序平台运营规范常见拒绝情形 3.3》。要求在提审页填写有效账号密码，或上传完整功能截图、录屏。
3. **类目不符**：涉及用户自定义生成内容（文字、图片等素材）发布与分享、且他人可见/访问，需补充选择「社交-笔记」类目。**已于 2026-10-31 补齐并通过**，当前服务类目为：工具 > 预约/报名、体育 > 体育培训、体育 > 体育馆服务、社交 > 笔记（主体 河南麦步体育文化发展有限公司，企业法人，微信认证 2026-04-30 完成）。

## 二、根因取证

- `miniprogram/app.json` 的 `pages` 首项即 `pages/login/login` → 冷启动首屏就是登录页。
- 查历史：`miniprogram/app.json` 在 1.0.27（2026-09-04）与正式版 1.0.34（2026-09-05）时期**首项同样是 `pages/login/login`**，所以首屏登录不是本次新增，是审核按当前包功能重判。
- 变化点在于 1.1/1.2 版本新增了发现页动态发布、发起约球、记一场与海报分享、公开转会市场等能力，触发类目与登录受限审查。
- 除首屏外全站已是游客友好：`pages/home/home.js` 未登录走 `guest-home` 并渲染 `components/guest-experience`（角色介绍、14 个功能模块、效果图、使用步骤、「看看正在进行的赛事」入口）；`pages/discover/discover.js` 有游客浏览模式；`pages/teams/index.js` 游客点管理动作才弹 `promptLogin`。
- `miniprogram/app.js` 无任何登录跳转；未注册的 `pages/index/index.js` 仍有强制 `redirectTo` 登录的死代码（保留未删，需单独确认后再清理）。

## 三、本次改动（只做首屏游客浏览）

| 文件 | 改动 |
|---|---|
| `miniprogram/app.json` | `pages` 首项由 `pages/login/login` 改为 `pages/home/home`，登录页降为第二项 |
| `miniprogram/pages/login/login.wxml` | 「暂不登录，先逛逛」由文字链改为独立入口块，新增说明「公开赛事、赛程赛果与球队信息可直接浏览；发布、报名、管理球队才需要手机号登录」 |
| `miniprogram/pages/login/login.wxss` | 新增 `.guest-entry-btn / .guest-entry-main / .guest-entry-hint` 样式，替换原 `.guest-entry-link` |
| `miniprogram/config/release.js` | 版本 `1.2.30 → 1.2.31`，`title` 改为「首屏游客浏览」，`sections` 首部插入同名小节（共 44 节） |
| `miniprogram/components/guest-experience/index.wxml` / `.wxss` | 角色介绍下方新增「赛事中心」入口卡（白底绿边、图标 + 标题 + 说明 + 「进入 ›」），点击触发既有 `publicEvents` 事件 |
| `miniprogram/pages/home/home.js` | `goToPublicCenter` 保持打开 `pages/public-tournament-center/index`（web-view 承载 `https://www.sxffootball.cn/service-account-h5/tournament-center.html`），新增 `navigateTo` 失败回退赛事列表原生页 |

未改动登录逻辑本身：仍为 `open-type="getPhoneNumber"` 主动点击登录，无自动授权。

### 登录入口决策（2026-10-31 用户确认，不改代码）

用户提出「在登录页微信授权下面加游客体验按钮」「直接在我的登录就行了」「页面登录使用保留」，最终确认：

- 不做首屏登录：`app.json` 首项保持 `pages/home/home`，不回退为 `pages/login/login`（回退即复现驳回 1 的「打开即要求授权」形态）。
- 登录页 `pages/login/login` 原样保留（手机号一键登录、协议、隐私政策、「先逛逛（免登录浏览）」）。
- 登录入口保留两处：首页游客体验底部「登录使用」按钮（用户明确要求保留）+「我的」tab 顶部「去登录 ›」横幅与「登录后使用完整功能」按钮。
- 依据：微信驳回原文按「打开小程序的第一屏是否出现授权请求」判定，登录页下摆游客按钮仍属「打开即要求授权」；审核员不会验证「能否跳过」。

## 四、验证

- `miniprogram/app.json` JSON 解析通过，`pages` 顺序为 `pages/home/home` → `pages/login/login` → `pages/discover/discover`；tabBar 首项仍为 `pages/home/home`。
- `node --check miniprogram/config/release.js` 通过；`version=1.2.31`、`sections=44`。
- `pages/login/login.wxml` 无 `===`/`!==`/三元/方法调用/数组索引命中；全仓 WXML 扫描 136 个文件，命中文件仍为 `components/guest-guide`、`pages/discover/discover`、`pages/team/detail/detail`、`pages/tournament/detail/detail` 四个既有文件，本次改动未新增违规。
- 游客体验「赛事中心」入口：`node --check miniprogram/pages/home/home.js` 通过；`guest-experience/index.wxml`、`home.wxml` 无 `===`/`!==`/`.find(`/三元/数组下标命中；`pages/public-tournament-center/index` 与 `pages/common/official-webview` 均已注册在 `app.json`，两者都只放行 `https://www.sxffootball.cn/` 前缀。
- 线上可用性（2026-10-31 只读 HEAD 回读）：`https://www.sxffootball.cn/service-account-h5/tournament-center.html` 200 / 4,326 B；业务域名校验文件 `https://www.sxffootball.cn/MP_verify_rscNSXUb1BQhGS3O.txt` 200 / 17 B（web-view 需该域名已在微信后台「业务域名」中配置）。
- 未上传、未设体验版、未提审。

## 五、未做（待用户决策）

- 手机号 + 短信验证码登录：后端 `webLoginApi` 已有 `phoneCodeLoginOptions / sendPhoneCodeLoginSms / completePhoneCodeLogin`（含冷却、单日上限、IP 小时限），小程序端未接；本次不做。
- 类目「社交-笔记」 vs 收窄公开动态：未定，影响 `msgSecCheck/imgSecCheck` 与举报入口的落点。
- 提审材料（录屏、测试账号说明）由用户侧准备；代码侧不硬编码测试账号。
