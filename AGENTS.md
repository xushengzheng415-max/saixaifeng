# AGENTS.md — 赛小蜂足球 AI 开发规则

> 本文件只保存长期有效、可执行的开发约束。产品规划见
> [`docs/PRODUCT_RULES.md`](docs/PRODUCT_RULES.md)，当前进度见
> [`docs/CURRENT_STATUS.md`](docs/CURRENT_STATUS.md)，历史决策见
> [`docs/ADR.md`](docs/ADR.md)。
>
> **最后更新：2026-08-19**

---

## 一、规则优先级

发生冲突时按以下顺序处理：

1. 用户在当前任务中的明确指令。
2. 本文件中的技术、安全和数据红线。
3. `docs/PRODUCT_RULES.md` 中标记为“已确认”的产品规则。
4. `docs/CURRENT_STATUS.md` 中的阶段目标。
5. `docs/ADR.md`、旧计划、历史备忘和代码现状。

不能自行选择互相冲突的规则。若冲突会影响身份、权限、收费、数据归属或产品范围，必须停止相关修改并向用户确认。

讨论、设想和未来方向不能直接当作当前强制要求。代码现状也不自动等于产品决策。

---

## 二、正式代码库与项目入口

| 项目项 | 当前值 |
|---|---|
| 项目名称 | 赛小蜂足球 |
| 正式本地仓库 | `E:\Documents\sxf-football` |
| Gitee | `https://gitee.com/saixiaofeng/saixiaofeng.git` |
| GitHub | `https://github.com/xushengzheng415-max/saixaifeng.git` |
| 正式域名 | `www.sxffootball.cn` |
| CloudBase 环境 | `cloud1-7g8ckb3c7815a011` |
| Web HTTP 入口 | `https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi` |

`E:\OneDrive\Desktop\足球赛事系统` 仅是旧资料，Codex 临时 worktree 也不是部署源。所有修改、构建、提交和部署必须以正式仓库为准。

主要代码端：

- `web-admin-vue/`：Vue 3 + Vite + Element Plus 的 PC 管理后台。
- `miniprogram/`：原生微信小程序。
- `service-account-h5/`：服务号承接的个人与临时任务入口。
- `index.html`：根域名着陆和登录页。
- `cloudfunctions/`：Node.js 18 CloudBase 云函数。

当前产品边界以 `docs/PRODUCT_RULES.md` 为准，不根据目录名称推断角色或权限。

---

## 三、不可违反的技术红线

### 3.1 网页端零 SDK

浏览器端禁止引入或使用 `@cloudbase/js-sdk`。

- 登录：`fetch()` 调 `webLoginApi` 的登录 action。
- 数据库：`webLoginApi` 的 `dbQuery` action。
- 其他云函数：`webLoginApi` 的 `callFunction` relay。
- 只有 `webLoginApi` 是网页端统一 HTTP 入口；不能假设其他云函数已配置 HTTP 触发器。
- `WechatCallbackView.vue` 必须使用纯 HTTP/fetch 链路。

`web-admin-vue` 以 `/admin/` 为 base。公开资源和动态路径必须兼容该子目录，禁止无意使用指向站点根目录的绝对路径。

### 3.2 WXML 表达式限制

本项目 WXML 只允许简单插值、简单取反和简单 `||`：

```html
{{value}}
{{!value}}
{{value1 || value2}}
```

禁止在 WXML 中使用：

- `===`、`!==` 等比较运算；
- 三元表达式；
- `.find()`、可选链或其他方法调用；
- 数组索引；
- 复杂深层计算。

所有条件和派生值必须在对应 `.js` 中预计算为 data 字段。

### 3.3 身份与登录安全

- `users` 表示自然人登录账号，不表示互斥的永久业务身份。
- 禁止根据固定手机号硬编码角色、权限、封禁或产品能力。
- 测试账号只用于验收，不能成为业务判断条件。
- 当前代码中的 `users.role`、单一 `orgId` 属于兼容字段；在正式成员关系迁移完成前保持兼容，但不得继续扩大其职责。
- 手机号是区分自然人账号的唯一凭证。PC 微信扫码和小程序微信授权都必须完成手机号验证；OpenID、UnionID 只能作为绑定到手机号主账号的渠道标识。
- 同一手机号在 `phone` 与 `phoneNumber` 两个字段中只能命中一个有效账号。发现重复必须阻断，禁止选择第一条继续登录。
- PC 微信渠道候选识别顺序为 `unionId` → `wechatOpenId` → 兼容旧 `openId`，但候选账号仍必须与本次验证手机号指向同一 `User` 才能登录。
- 小程序 `openId` 与 PC `wechatOpenId` 分字段保存，不能互相覆盖。
- 同一微信用户跨应用识别依赖 `unionId`，不能假设 OpenID 相同。
- 微信标识与手机号指向不同账号时不能静默换绑或丢失机构、赛事、球队等业务引用。
- 登录切换必须先清理上一账号本地认证信息，再原子写入新会话。

### 3.4 租户与数据边界

- `orgId` 是当前机构数据隔离边界；`creatorId` 只表示具体创建人，不能代替租户边界。
- 所有读写必须校验当前机构或明确的赛事授权关系。
- 主办方只能访问赛事所需数据，不能借赛事权限查看俱乐部的学员、课程、财务等私有经营数据。
- `users` 不属于赛事、球队或球员业务清理范围，清理业务数据不能删除登录账号。
- 球队资料是长期资产；参赛名单、比赛阵容和赛果是赛事快照。日常资料修改不能覆盖已审核或已完赛历史数据。
- 账号、机构、球队、球员和参赛关系不得因名称相同而自动合并；存在冲突时进入人工核验。

### 3.5 术语与数据兼容

- `Division` / `division`：U8、U9、U10 等竞赛组别，也是赛事专业版的付费单位。
- `DrawGroup` / `group`：A 组、B 组等抽签小组，不能与竞赛组别混用。
- `category`：赛事类别；`formatType`：赛制，两者独立。
- 球队资料不等于 `TournamentRegistration`，正式参赛名单不等于球队日常球员库。
- 跨端手机号查询必须兼容 `phone` 与 `phoneNumber`；跨端微信字段必须兼容现有历史数据。

---

## 四、代码修改边界

开始编码前：

1. 阅读本文件及与任务相关的产品规则。
2. 检查工作区未提交改动，保留用户和其他任务的修改。
3. 列出当前业务涉及的 PC、小程序、服务号和云函数文件；只修改确有必要的范围。
4. 如果共用规则应由后端统一实现，禁止各端维护互相冲突的判断。
5. 产品规则未确认时，不通过页面默认值、手机号或临时代码替用户做决定。

实现过程中：

- 网页端继续走 `web-admin-vue/src/utils/cloud.js` 的零 SDK 链路。
- 云函数尽量减少依赖，并保持 Node.js 18 兼容。
- `bindPhone` 等已有完整服务端流程不能在前端重复验证，避免双重消费验证码。
- 含密钥的 `cloudbaserc.json`、API Key、密码、令牌和验证码不得读取到日志或提交仓库。
- 删除、迁移、批量清理和生产部署必须确认精确目标并单独验证。

---

## 五、验证清单

所有改动按实际影响选择验证，不能用无关检查代替核心流程验证。

### 网页端

- `npm run build`
- 确认未引入 `@cloudbase/js-sdk`
- 检查 `/admin/` 下资源路径
- 检查登录切换、机构边界和当前业务主流程

### 小程序

- 扫描 WXML 中的比较、三元、方法调用和数组索引
- 使用真实手机尺寸验证高频现场流程
- 验证重复点击、网络失败和恢复反馈

### 云函数

- 对修改的入口执行 `node --check`
- 验证鉴权、机构归属、重复账号和跨端字段兼容
- 云函数改动只有部署并读回生产结果后才算线上完成

### 产品规则

- 免费/付费边界、竞赛组别/抽签小组、球队资料/参赛快照不能混用
- 新旧规则冲突时只保留当前有效结论
- 未确定的价格、退款、试用和优惠规则不能写死

---

## 六、构建与部署

两个网页部署目标：

- 根目录：`index.html` → `/`
- PC 后台：`web-admin-vue/dist` → `/admin/`

本地构建：

```powershell
cd E:\Documents\sxf-football\web-admin-vue
npm run build
```

篮球和足球属于不同腾讯云账号。CloudBase CLI 操作统一使用：

```powershell
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football test
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run fn list
```

已刷新 PATH 的进程可使用 `sxf-cloud` 短命令。不得依赖或切换全局 `tcb login` 状态，不得手工覆盖目标环境。

API Key 位于仓库外的 `%LOCALAPPDATA%\SxfCloud\credentials\`，由 Windows DPAPI 加密。不得读取、打印、复制、记录、提交或移动凭据文件。

列表和状态检查属于只读操作；部署、修改配置、写数据库、删除函数和其他云端变更仍需当前任务明确授权。部署完成后必须读回生产状态或页面验证结果。

---

## 七、固定配置

| 配置 | 当前值 |
|---|---|
| CloudBase 区域 | `ap-shanghai` |
| Web base | `/admin/` |
| 短信签名 | `河南麦步体育` |
| 短信模板 ID | `2657871` |
| 小程序 AppID | `wx57164cca8676f411` |
| 网站应用 AppID | `wx5a42aae0e5d0669c` |
| 微信授权回调域 | `www.sxffootball.cn` |
| SMTP | `smtp.yeah.net:465`（SSL） |

敏感值必须通过环境变量或仓库外凭据提供。

---

## 八、文档治理

- 产品定位、身份、权限、收费、数据归属和端口边界必须经过用户明确确认，才能写为“已确认规则”。
- AI 可以自动更新已验证的技术事实、故障原因、部署要求和代码入口，但不得把讨论或猜测升级为产品规则。
- 当前阶段变化更新 `docs/CURRENT_STATUS.md`，不把临时进度写入本文件。
- 新的长期产品决策更新 `docs/PRODUCT_RULES.md`，并在 `docs/ADR.md` 记录决策日期和被替代规则。
- 历史文档必须标记“已归档”，不能继续作为当前需求来源。
- 每次文档更新都要检查内部冲突和 `git diff`，并在交付中说明。

---

> 每次开始代码修改前重新阅读第三、第四和第五章。

---

## 九、赛小蜂足球图标系统（已确认）

图标规范见 [`docs/ICON_SYSTEM.md`](docs/ICON_SYSTEM.md)。对新原型和正式页面：大尺寸品牌/场景图标先按 `oil-icon` 的赛小蜂足球品牌方向生成整套候选并完成切图验收；高密度功能控件和底部导航必须使用共享、可追溯的 SVG 图标，不得把生成 PNG 缩小代替。任何页面不得使用原型裁片、粗糙临时图标或页面内重复图标文件。
