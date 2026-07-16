# AGENTS.md — 赛小蜂项目记忆系统

> **用途**：为 Codex / Claude Code / Cursor 等 AI 编程助手提供项目上下文。
> AI 在开始任何代码修改前，必须先阅读本文档。
> **最后更新**：2026-07-16

---

## 一、项目身份

| 字段 | 值 |
|------|-----|
| 项目名称 | **赛小蜂足球**（又名“赛小蜂足球管理系统”） |
| 产品线 | **1.0 赛事系统**（赛事即官网 SaaS）+ **2.0 青训俱乐部系统**（学员/排课/财务） |
| Git 仓库 | `https://gitee.com/saixiaofeng/saixiaofeng.git` |
| 本地路径 | `E:\Documents\sxf-football` |
| 域名 | `saixiaofeng.com`（已备案，HTTPS，1.0+2.0 统一使用） |
| 主色调 | 绿色渐变 `#1B5E20 → #43A047` |
| 首页主题 | 暗绿色 `#052e16 / #10b981`（蜂窝科技风） |
| 飞书产品文档 | https://lxcmobp6gun.feishu.cn/docx/A2MRdtUd7o9pUaxwQxdcqxFSnwe |

---

## 二、技术栈

### Web 管理后台（`web-admin-vue/`）
| 技术 | 版本/说明 |
|------|----------|
| 框架 | Vue 3.4（Options API + Composition API 混用） |
| 构建工具 | Vite 5.4 |
| UI 库 | Element Plus 2.7 |
| 路由 | Vue Router 4（Hash 模式，base: `/admin/`） |
| 样式 | SCSS（sass-embedded） |
| 关键依赖 | cropperjs（图片裁剪）、qrcode、mammoth（Word解析）、tiny-pinyin（球衣名） |
| 自动导入 | unplugin-auto-import + unplugin-vue-components |

### 微信小程序（`miniprogram/`）
- 原生开发（WXML / WXSS / JS）
- 自定义 tabBar
- 分包：packageA（签字页 + 阵容页）

### 着陆首页（`index.html`）
- 纯 HTML + Tailwind CSS CDN
- 多种登录方式：手机号短信 / 账号密码 / 微信扫码

### 云函数（`cloudfunctions/`）
- 运行时：Node.js 18.15
- 共 77 个云函数
- 无数据库 SDK 使用，仅云函数 SDK + 第三方 API

---

## 三、架构一图流

```
微信小程序 ──(wx.cloud)──┐
Vue 管理后台 ─(fetch)──┐ │
着陆首页(index.html)──┘ │
                        ▼
            ┌─────────────────────────┐
            │  CloudBase 云开发环境      │
            │  cloud1-7g8ckb3c7815a011 │
            │                         │
            │  ┌───────────────────┐  │
            │  │  webLoginApi      │  │ ← 网页端 HTTP 唯一入口
            │  │  (HTTP 触发)      │  │
            │  └───────┬───────────┘  │
            │          │ relay        │
            │  ┌───────┴───────────┐  │
            │  │  其他 76 个云函数   │  │
            │  └───────────────────┘  │
            │  ┌───────────────────┐  │
            │  │  MongoDB 数据库     │  │
            │  └───────────────────┘  │
            └─────────────────────────┘
```

**核心原则**：网页端零 SDK——浏览器完全不用 `@cloudbase/js-sdk`，所有请求走 `fetch()` 调 `webLoginApi`。

---

## 四、完整目录结构

```
赛小蜂/
├── AGENTS.md                        ← 你正在读的文件
├── index.html                       # 着陆首页（Tailwind CSS CDN）
├── package.json                     # 根 package.json（如有）
├── CODEBUDDY.md                     # 历史开发备忘
├── reset-password.html              # 密码重置页
├── cloudbaserc.template.json        # 云开发配置模板
├── project.config.json              # 小程序项目配置
│
├── web-admin-vue/                   # ⭐ Vue 3 管理后台
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── deploy.md                    # 部署说明
│   ├── public/
│   │   ├── logo.png
│   │   ├── formation-designer.html  # 阵型设计器
│   │   ├── login-logic.js           # 登录逻辑
│   │   └── images/                  # 金卡/银卡/铜卡/avatar-frame
│   └── src/
│       ├── main.js                  # 入口（Element Plus + router）
│       ├── App.vue
│       ├── router/index.js          # 46 个路由
│       ├── store/                   # 状态管理（暂未使用）
│       ├── assets/
│       │   ├── global.css
│       │   ├── portal.css           # 赛事官网样式
│       │   └── images/              # 足球场背景图
│       ├── data/
│       │   └── formation-data.json  # 阵型坐标数据（24KB）
│       ├── composables/
│       │   └── useResponsive.js
│       ├── utils/
│       │   ├── cloud.js             # ⭐⭐⭐ 零SDK核心：登录+数据库
│       │   ├── upload.js            # 分片上传
│       │   ├── jerseyName.js        # 球衣名拼音
│       │   ├── format.js            # 格式化
│       │   ├── permissions.js       # 权限管理
│       │   ├── ai.js                # AI 工具
│       │   ├── cos.js               # COS 存储
│       │   ├── rosterHelper.js      # 名册辅助
│       │   ├── logoRemoveBg.js      # Logo 去背景
│       │   ├── removeBg.js          # 通用去背景
│       │   ├── baiduRemoveBg.js     # 百度去背景
│       │   └── whiteBgRemover.js    # 白底移除
│       ├── components/
│       │   ├── SignaturePad.vue     # 签字板
│       │   ├── player/PlayerCard.vue # 球员卡
│       │   └── common/              # 通用组件（裁剪/AI/邀请对话框）
│       └── views/
│           ├── layout/LayoutView.vue    # 管理后台主框架
│           ├── login/                   # 登录/选角色/绑手机/微信回调
│           ├── dashboard/DashboardView.vue  # 数据概览
│           ├── tournament/              # 14 个比赛相关 Vue 文件
│           │   ├── TournamentCreate.vue  # 创建赛事（80KB）
│           │   ├── TournamentDetail.vue
│           │   ├── TournamentEdit.vue
│           │   ├── TournamentList.vue
│           │   ├── TournamentCenter.vue
│           │   ├── TournamentCenterManage.vue
│           │   ├── TournamentDraw.vue    # 抽签（79KB）
│           │   ├── TournamentSchedule.vue # 赛程
│           │   ├── TournamentTeams.vue
│           │   ├── TournamentSignups.vue
│           │   ├── TournamentWebsite.vue # 赛事官网
│           │   ├── MatchDetail.vue       # 比赛详情（128KB ⭐最大文件）
│           │   ├── MyTournaments.vue
│           │   ├── ReviewManagement.vue
│           │   ├── VisualLineupEditor.vue # 可视化阵容编辑器
│           │   └── RosterChangeReview.vue # 名册变更审核
│           ├── team/                     # TeamList.vue + TeamDetail.vue（116KB）
│           ├── player/                   # PlayerList.vue + PlayerDetail.vue
│           ├── referee/                  # RefereeList/RefereeMatchDetail/RefereeMyMatches/HeadRefereeManagement
│           ├── coach/CoachList.vue
│           ├── signature/SignatureView.vue # H5 签字页
│           ├── poster/PosterEditor.vue   # 海报编辑
│           ├── data/DataManager.vue
│           ├── system/SystemAdmin.vue
│           ├── tournament-center/        # 赛事中心独立后台
│           │   ├── TournamentCenterAdmin.vue
│           │   ├── TournamentCenterLogin.vue
│           │   └── components/           # 账号/球队/球员管理
│           ├── portal/                   # ⭐ 赛事官网（用户端）
│           │   ├── home/HomePage.vue
│           │   │   └── components/       # 横幅/快捷入口/热门比赛/实时赛程/排行
│           │   ├── tournament/           # 赛事列表/详情/卡片/分类筛选
│           │   ├── match/                # 比赛详情/比赛卡片
│           │   ├── chat/ChatPage.vue
│           │   ├── profile/ProfilePage.vue
│           │   ├── layout/               # TopNavBar + BottomTabBar + PortalLayout
│           │   └── components/           # 公共组件（UserAvatar/TeamLogo/LoginDialog等）
│           └── test/                     # TestDataView + RemoveBgDemo
│
├── miniprogram/                      # ⭐ 微信小程序
│   ├── app.js / app.json / app.wxss
│   ├── project.config.json
│   ├── sitemap.json
│   ├── utils/
│   │   ├── pinyin.js                # 拼音工具
│   │   └── logger.js                # 日志工具
│   ├── components/
│   │   └── player-card-canvas/      # 球员卡 Canvas 组件
│   ├── custom-tab-bar/              # 自定义底部导航
│   ├── pages/
│   │   ├── home/home                # 首页（25KB JS）
│   │   ├── login/login              # 登录页（26KB JS）
│   │   ├── tournament-center/       # 赛事中心
│   │   ├── tournament/              # 赛事相关（list/signup/schedule/rules/teams）
│   │   ├── team/                    # 球队管理（team/detail/player-add/management）
│   │   ├── match/                   # 比赛（create/detail/signup/squad/share）
│   │   ├── referee/                 # 裁判（index/record/verify）
│   │   ├── profile/profile          # 个人中心（12KB JS）
│   │   ├── identity/identity        # 身份认证（11KB JS）
│   │   ├── invite/invite            # 邀请
│   │   ├── signature/               # 手写签字
│   │   ├── roster-change/           # 名册变更
│   │   ├── card-preview/            # 球员卡预览
│   │   ├── my-cards/                # 我的卡片
│   │   ├── player-card/             # 球员卡
│   │   ├── guide/                   # 引导页
│   │   ├── admin/                   # 管理员
│   │   ├── manage/                  # 管理
│   │   └── logs/                    # 日志
│   └── packageA/                    # 分包
│       └── pages/
│           ├── signature/           # 签字页（分包版）
│           └── lineup/              # 阵容页
│
├── cloudfunctions/                   # ⭐ 云函数（77 个）
│   ├── webLoginApi/                  # ⭐⭐⭐ 网页端 HTTP API 总入口
│   │
│   ├── 认证类（11 个）
│   │   ├── sendSms/                  # 发送短信验证码
│   │   ├── verifySmsCode/            # 验证短信码
│   │   ├── bindPhone/                # 绑定手机
│   │   ├── bindPhoneToOpenId/        # 手机号绑定 OpenId
│   │   ├── phoneLogin/               # 手机号登录
│   │   ├── verifyPassword/           # 验证密码
│   │   ├── wechatWebLogin/           # 微信扫码登录
│   │   ├── emailLogin/               # 邮箱登录
│   │   ├── checkUserByOpenId/        # 查用户
│   │   ├── getOpenId/                # 获取 OpenId
│   │   └── user/                     # 用户相关
│   │
│   ├── 赛事业务类（9 个）
│   │   ├── applyTournament/          # 报名赛事
│   │   ├── getTournamentList/        # 赛事列表
│   │   ├── getTournamentDetail/      # 赛事详情
│   │   ├── getTournamentMatches/     # 赛事比赛
│   │   ├── getTournamentReferees/    # 赛事裁判
│   │   ├── getMyTeams/               # 我的球队
│   │   ├── submitRosterChange/       # 提交名册变更
│   │   ├── reviewRosterChange/       # 审核名册变更
│   │   └── tournamentReview/         # 赛事审核
│   │
│   ├── 比赛类（5 个）
│   │   ├── updateMatch/              # 更新比赛
│   │   ├── updateMatchLineup/        # 更新比赛阵容
│   │   ├── updateMatchSignature/     # 更新比赛签字
│   │   ├── generateSchedule/         # 生成赛程
│   │   └── deleteRecord/             # 删除记录
│   │
│   ├── 裁判类（4 个）
│   │   ├── setHeadReferee/           # 设置裁判长
│   │   ├── manageRefereeCommittee/   # 管理裁判委员会
│   │   ├── saveSignature/            # 保存签字
│   │   └── getSignatureStatus/       # 查询签字状态
│   │
│   ├── AI 类（4 个）
│   │   ├── parseTournamentRegulations/ # 混元 AI 解析规程（hy3-preview）
│   │   ├── generateAIImage/          # AI 生成图片
│   │   ├── generateContent/          # AI 生成内容
│   │   └── getRegulations/          # 规程代理下载
│   │
│   ├── 图片处理类（5 个）
│   │   ├── uploadFile/               # 文件上传
│   │   ├── uploadToCOS/              # COS 上传
│   │   ├── uploadCosDirect/          # COS 直传
│   │   ├── removeImageBg/            # AI 去背景
│   │   ├── removeLogoBg/             # Logo 去背景
│   │   ├── baiduRemoveBg/            # 百度去背景
│   │   └── imageProcess/             # 图片处理
│   │
│   ├── CRUD 类（10 个）
│   │   ├── createPlayer / deletePlayer / updatePlayer
│   │   ├── createTeam / deleteTeam / updateTeam
│   │   ├── deleteTournament
│   │   ├── getPlayers / getTeams / getTournaments / getBanners
│   │   ├── saveBanner
│   │
│   ├── 数据管理类（6 个）
│   │   ├── webBatchDelete/           # 批量删除
│   │   ├── webBatchUpdate/           # 批量更新
│   │   ├── clearDatabase/            # 清空数据库
│   │   ├── clearTeamPlayers/         # 清空球队球员
│   │   ├── clearTournamentTeams/     # 清空赛事球队
│   │   └── cleanupOrphanPlayers/     # 清理孤儿球员
│   │   └── cleanupOrphanTournamentTeams/
│   │   └── cleanupUsers/             # 清理用户
│   │
│   ├── 迁移类（3 个）
│   │   ├── migrateData/
│   │   ├── migrateCoachData/
│   │   └── migrateTeamPhoneBindings/
│   │   └── repairTeamOwnerBinding/
│   │
│   ├── 工具类（7 个）
│   │   ├── sendEmail/                # 发送邮件
│   │   ├── generateQRCode/           # 生成二维码
│   │   ├── generateInviteCode/       # 生成邀请码
│   │   ├── generateMiniProgramCode/  # 生成小程序码
│   │   ├── generatePlayerCard/       # 生成球员卡
│   │   ├── decodePhoneNumber/        # 解码手机号
│   │   └── updateUserRole/           # 更新用户角色
│   │   └── updateCoachPhone/         # 更新教练手机
│   │
│   ├── 赛事中心类（4 个）
│   │   ├── tournamentCenterLogin/
│   │   ├── setTournamentCenterPassword/
│   │   └── manageTournamentCenterAccounts/
│   │
│   └── 其他
│       ├── generateTestData/         # 生成测试数据
│       ├── generateImage-yQOBxs/     # 图片生成（特定用途）
│       └── testEnv/                  # 测试环境
│
├── docs/
│   └── CORS配置指南.md
│
├── tools/                            # 本地工具（可能不在此仓库）
│   ├── rembg_server.py              # 抠图 Flask 服务（端口5566）
│   └── remove_logo_bg.py
│
├── 开发计划.md
├── 云函数上传指南.md
├── 球员卡自动生成系统_使用说明.md
├── 调试脚本.md
├── 球队列表布局修复说明.md
└── 完整修复指南.md
```

---

## 五、致命规则（违反必挂）

### 5.1 ⭐⭐⭐ WXML 表达式铁律（小程序）
WXML 文件**只允许三种表达式**：
```html
<!-- ✅ 允许 -->
{{变量名}}
{{!变量名}}
{{变量1 || 变量2}}

<!-- ❌ 绝对禁止 -->
{{a === b}}          <!-- 比较运算符 -->
{{a ? b : c}}         <!-- 三元表达式 -->
{{arr.find(x)}}        <!-- 方法调用 -->
{{item.name[0]}}       <!-- 数组索引 -->
{{a.b.c}}              <!-- 深度属性链 -->
```

**原则**：所有条件判断和计算必须在 `.js` 文件中预计算为 data 字段，WXML 只做简单插值。

**历史教训**：2026-06-23/24 两次白屏，分别因为遗漏三元表达式和数组索引。提交前务必用以下命令扫：
```bash
grep -r '{{[^}]*?[^}]*:.*}}' miniprogram/pages/   # 扫三元
grep -r '{{[^}]*\[[0-9]' miniprogram/pages/         # 扫索引
```

### 5.2 ⭐⭐⭐ 零 SDK 方案（网页端）
**浏览器端绝对不能使用 `@cloudbase/js-sdk`**。

唯一入口：`webLoginApi` HTTP API
```
URL: https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi
```

| 操作 | 方式 |
|------|------|
| 登录（短信/密码/微信/邮箱） | `fetch()` → `LOGIN_FUNCTION_MAP` 路由 |
| 数据库 CRUD | `dbQuery` action（list/get/count/add/update/delete） |
| 调用其他云函数 | `callFunction` action → relay 模式 |

### 5.3 ⭐⭐⭐ 两个部署目标（网页端）
- `index.html` → 部署到根目录 `/`
- `web-admin-vue/` → build 到 `/admin/` 子目录

修改 `web-admin-vue/src/utils/cloud.js` 后：
```bash
cd web-admin-vue && npm run build && npx tcb hosting deploy ./dist admin -e cloud1-7g8ckb3c7815a011
```

### 5.4 跨端字段名差异
| 端 | openId 字段 | 手机号字段 |
|----|-----------|---------|
| 小程序 | `openId` | `phoneNumber` |
| 网页端 | `wechatOpenId` | `phone` |

**所有涉及跨端用户识别的云函数必须同时查询两种字段名**：
```js
_.or([{ phone: xxx }, { phoneNumber: xxx }])
```

### 5.5 小程序 openId ≠ 网页 openId
同一微信用户在不同应用的 openId 不同。跨端识别**必须用 unionId**。

### 5.6 登录身份唯一性与会话切换

1. `users` 中同一手机号只能对应一个有效账号；唯一性检查必须同时覆盖 `phone` 与 `phoneNumber`，发现多条时立即阻断并提示管理员处理，禁止使用查询结果第一条继续登录。
2. PC 微信扫码按 `unionId` → `wechatOpenId` → 兼容旧 `openId` 的顺序识别账号；小程序 `openId` 与 PC `wechatOpenId` 必须分字段保存，禁止相互覆盖。
3. 微信标识与手机号指向不同账号时，不能静默换绑；账号合并必须先核验身份，并保留机构归属、邮箱、密码凭据及球队/球员等业务引用，登录角色统一归一为 `organizer`。
4. PC 每次登录成功后必须先清理上一账号的本地认证信息，再原子写入新用户、角色、手机号、OpenID/UnionID 和 token，避免右上角展示旧账号绑定信息。
5. 登录与绑定逻辑必须依据数据库身份关系，不得用固定手机号硬编码角色；第十七节手机号仅作为当前测试验收账号。

### 5.7 当前唯一登录身份：主办方

1. PC 管理后台和微信小程序无需预先开通账号；用户首次微信扫码或手机号注册时直接创建 `users.role=organizer` 的主办方账号，历史登录账号也统一归一为主办方。
2. `coach`、`player`、`referee` 仅作为主办方管理球队、球员、裁判等业务数据时的对象标签，不是当前登录身份。
3. 登录只识别 `users` 账号，不得从球员库、教练库、裁判库或球队数据反向推断业务身份；所有新登录账号均以主办方创建，不提供身份选择或身份切换入口。
4. 球队和球员的后续自助入口统一规划到服务号，当前 PC/小程序不得恢复球队端、球员端登录。
5. 机构切换是未来主办方在不同机构上下文之间切换，不等同于切换为球队、球员或裁判身份。
6. `users` 是登录账号集合，不属于球队、球员、赛事等业务数据清理范围；清理业务数据时不得删除登录账号。

---

## 六、已知坑点（完整清单）

### 6.1 云函数
| # | 坑 | 说明 |
|----|-----|------|
| 1 | **HTTP 路由规则** | 只有 `webLoginApi` 配置了 HTTP 触发。其他所有云函数必须通过 `webLoginApi` 的 `callFunction` action relay 调用 |
| 2 | **云函数环境 Node 18** | npm 包需兼容，有依赖的必须选「云端安装依赖」 |
| 3 | `emailLogin` 只有邮箱操作 | **没有 sendSms 功能**！短信用 `sendSms`（发）+ `verifySmsCode`（验） |
| 4 | **双重验证码陷阱** | bindPhone 内部已有完整流程（验证→找用户→合并），前端只需一步调用，不要再提前调 verifySmsCode |
| 5 | 混元 AI Key | `parseTournamentRegulations` 用 `hy3-preview` 模型，必须用服务端 Key，超时设 10s+ |
| 6 | 依赖管理 | 尽量零依赖，避免安装问题 |

### 6.2 网页端
| # | 坑 | 说明 |
|----|-----|------|
| 7 | **Vue SPA 相对路径** | `/admin/` 子目录下，动态 script src 必须用 `./` 开头，不能用 `/` |
| 8 | **const 无变量提升** | `index.html` 中 const 必须在所有使用它的函数之前定义 |
| 9 | **花括号匹配** | 删除代码块时确保花括号/括号配对，多一个 `}` 整个 script 块挂 |
| 10 | **微信扫码回调** | `WechatCallbackView.vue` 必须用纯 fetch 调云函数，不能走 SDK 路径 |
| 11 | CDN 缓存 | 静态托管 10 分钟缓存，部署后可能延迟生效 |
| 12 | **CORS** | TCB 静态托管 CORS 不受 COS 控制台控制，需用云函数代理 |

### 6.3 小程序
| # | 坑 | 说明 |
|----|-----|------|
| 13 | WXML 不支持 `.find()`、`?.`、`===` 等 | 见第 5.1 节 |
| 14 | WXML 不能调 JS 函数 | 只能用 data 属性 |
| 15 | 球衣姓名 | 二字（姓全拼+名首字母）、三字（姓全拼+名1首字母+名2首字母） |
| 16 | 首次加载延迟 | 赛事中心已加防重入锁 |

### 6.4 配置类
| # | 坑 | 说明 |
|----|-----|------|
| 17 | **短信签名不是"赛"** | 是"河南**麦**步体育"！模板ID `2657871`（不是 267871） |
| 18 | 邮箱 SMTP | saixiaofeng@yeah.net，smtp.yeah.net:465 (SSL) |
| 19 | cloudbaserc.json | 含明文密钥，不入仓库（用 template 版） |
| 20 | 控制台报错 `index.i33` | CloudBase 内部问题，不影响功能 |

---

## 七、数据库核心集合

| 集合名 | 说明 | 关键字段 |
|--------|------|---------|
| `users` | 用户 | phone, phoneNumber, wechatOpenId, openId, unionId, role, email, passwordHash |
| `teams` | 球队 | name, logo, province, city, orgId, createTime |
| `players` | 球员 | name, contactName, contactPhone, clothingSize, teamId |
| `tournaments` | 赛事 | name, category, formatType, status, orgId |
| `matches` | 比赛 | homeTeam, awayTeam, score, refereeSigned, refereeSignatureUrl |
| `tournament_teams` | 赛事报名 | tournamentId, teamId, status（状态流见下） |
| `sms_codes` | 验证码 | phone, code, used, expiresAt |
| `banners` | 横幅 | imageUrl, link, sort |
| `referees` | 裁判库 | name, phone, level |
| `tournament_referees` | 赛事裁判 | tournamentId, refereeId, role |
| `tournament_center_users` | 赛事中心用户 | username, passwordHash |

### 参赛名单状态流
```
not_submitted → drafting → submitted → pending_approval → approved/confirmed
                                                    ↓
                                            modification_requested / rejected → 回到编辑
```

---

## 八、赛事类型体系（5 种）

| key | 标签 | 颜色 | 背景色 |
|-----|------|------|--------|
| `youth` | 青少年赛事 | `#AB47BC` | `#F3E5F5` |
| `amateur` | 业余赛事 | `#66BB6A` | `#E8F5E9` |
| `local` | 地协赛 | `#42A5F5` | `#E3F2FD` |
| `city` | 城市联赛 | `#FF9800` | `#FFF3E0` |
| `professional` | 职业联赛 | `#E53935` | `#FFEBEE` |

- `category` ≠ `formatType`（赛制），两者独立
- 涉及文件：CategoryFilter.vue、HomePage.vue、QuickEntryGrid.vue、ChatPage.vue、TournamentCenterAdmin.vue、TournamentCreate.vue、小程序 create.js/wxml

---

## 九、球队编号规则

### 编码格式
```
[省份号3位][城市字母1位][序号3位][类型代码2-3位]
```

### 省份代码（部分）
| 上海 `101` | 北京 `104` | 广东 `204` | 河南 `226` | 浙江 `225` | 四川 `222` | 江苏 `213` |

### 队伍类型
`01` 一线队 | `02` 二线队 | `08`~`18` U8~U18

### 示例
- `226E00101` = 河南郑州第1支一线队
- `226E00108` = 河南郑州第1支U8队

---

## 十、坐标系统（阵型编辑器）

- **field-boundary 层**：`left:7% top:5% width:86% height:90%`
- **百分比坐标**：x 轴（0-100 前后位置），y 轴（0-100 左右位置）
- **镜像逻辑**：只镜像 x（`x: 100 - p.x`），y 不变，label 互换左右

---

## 十一、关键业务概念

- **球队资料 ≠ 参赛名单**：球队资料（日常管理）≠ 参赛名单（提交给某赛事的正式名单）
- **参赛名单**：提交后不可直接修改，需走修改申请→审核流程
- **待办体系**：主办方通过 `team_tasks` 集合下发待办
- **当前登录账号**：`15038292130` 为主办方验收账号；`17319716663` 仅保留微信绑定供后续服务号迁移，当前不得登录 PC/小程序后台。

### 11.1 ⭐⭐⭐ 主办方端优先与双端同步边界

当前阶段**先做主办方端（ORGANIZER）**。凡属于主办方的业务能力，微信小程序与 PC 管理后台必须保持功能对等：

| 端 | 代码范围 | 主办方定位 |
|----|----------|------------|
| 微信小程序 | `miniprogram/` | 主办方移动端入口 |
| PC 管理后台 | `web-admin-vue/` | 主办方桌面端入口 |

执行规则：

1. **修改小程序主办方功能时，必须同步检查并修改 PC 端对应功能。**
2. **修改 PC 端主办方功能时，必须同步检查并修改小程序对应功能。**
3. 开工前先列出同一业务在小程序、PC 端及云函数/API 中的对应文件；若任一端尚无对应页面，必须在同一需求中补齐或先向用户说明阻碍，不能默认只做单端。
4. “同步”指两端的业务能力、权限、字段、校验、状态流和最终数据结果一致；界面布局和交互方式可按移动端/桌面端特点分别设计，不要求机械复制 UI。
5. 共用数据与业务规则优先落在同一套云函数/API 中，禁止两端各自维护互相冲突的规则。
6. 主办方端需求在小程序和 PC 端均完成并验证后，才可标记为完成；只完成其中一端视为未完成。
7. 仍须遵守页面修改边界：每次实际编码前，必须确认本次小程序页面、PC 页面及确有必要的云函数/API 文件清单；不得借“双端同步”扩大到无关页面。

#### 主办方首批能力：批量添加球员

- 主办方必须可以在其有管理权限的球队中**批量添加球员**。
- 小程序与 PC 端都必须提供该能力，并写入同一套球员/球队数据结构。
- 两端至少保持以下规则一致：目标球队与赛事权限、批量录入字段、必填校验、手机号/球员重复校验、成功/失败逐条结果、部分失败处理及防重复提交。
- 批量添加不得绕过现有主办方权限、球队归属、赛事归属及参赛名单审核规则；“球队资料”与“参赛名单”仍按本章定义分开处理。

### 11.2 ⭐⭐⭐ 青少年赛事与成年赛事责任边界

青少年赛事不能直接套用成年赛事中“参赛球队自行完善资料”的协作模式，两类赛事必须允许采用不同的运营责任模型。

#### 青少年赛事（当前优先场景）

- **主办方负责完整建档和赛事执行**：赛程、赛制、球队录入、球员录入、球员照片上传及相关资料维护均由主办方完成。
- 参赛球队的职责是参与赛事，不得把创建球员、上传照片、补全基础资料等工作设为球队参赛的必经前置条件。
- 主办方必须能在 PC 端和小程序端独立完成上述闭环，不得依赖球队端、教练端或球员端配合后才能继续。
- 批量添加球员属于该闭环的核心能力；录入后产生的球队、球员和参赛数据仍须遵守统一权限与审核规则。

#### 成年赛事（保留扩展）

- 成年赛事可保留主办方与参赛球队协作录入、球队自助维护或球员自助完善资料等模式。
- 不得用青少年赛事规则全局覆盖成年赛事，也不得反向强迫青少年球队采用成年赛事的自助协作流程。
- 具体采用哪种责任模型必须由明确的赛事类型或业务配置决定；禁止仅靠页面默认值或账号手机号硬编码判断。

### 11.3 ⭐⭐⭐ 当前阶段、机构切换与服务号规划

实施顺序必须严格区分“当前开发范围”和“后续产品方向”：

1. **当前 P0：先完成主办方 PC 端和主办方小程序端。** 两端组成同一个主办方管理产品，优先打通青少年赛事从建赛、球队/球员建档到赛程执行的完整闭环。
2. **当前不新建独立球队编辑端或球员端。** 现阶段涉及球队和球员的数据写入操作，首先作为主办方管理能力落在上述两个端口中；服务号只允许建设下述球队信息只读入口。
3. **主办方按机构级身份设计。** 数据归属、权限判断和登录上下文要保留机构维度，不能把新功能永久绑定到单个自然人或单一手机号；当前登录角色固定为主办方。
4. **为后续机构切换保留能力。** 同一主办方账号未来可能进入不同机构；新增数据与接口必须能明确当前机构上下文，避免出现跨机构数据串用，但不得因此恢复球队/球员/裁判登录身份。
5. **后续阶段再扩展服务号承接窗口。** 借鉴赛小蜂篮球的经验，球队端、球员端的多入口/自助功能未来统一收口到微信服务号，主要服务成年赛事协作及确有自助需要的场景。
6. 服务号不替代当前主办方 PC 端和小程序端的核心管理能力；除下述已确认的球队信息只读入口外，在服务号项目路径、页面清单和接口边界得到用户确认前，不得擅自创建、迁移或扩展业务代码。
7. 内容公众号与业务服务号继续保持职责分离：内容/IP/品牌传播归内容公众号，球队、球员、赛事操作等业务入口归服务号。

### 11.4 ⭐⭐⭐ 当前服务号最小范围：球队查询链接

当前服务号只做一个面向参赛球队教练的轻量查询闭环：

1. 用户参加赛事后，由球队教练扫描二维码关注微信服务号。
2. 服务号提供一个**球队数据查询入口链接**，教练可在比赛结束后查看本队相关的比分、分组情况及后续明确开放的球队维度赛事信息。
3. 当前只开放球队和赛事结果数据，**暂不开放任何球员数据**，包括球员名单、个人资料、照片和个人比赛数据。
4. 当前入口原则上只读，不提供球队创建、球队资料修改、球员创建、照片上传或参赛名单维护能力；这些写入工作仍由主办方 PC 端和小程序端负责。
5. 服务号展示的数据必须读取赛事系统现有的同一份球队、比赛和分组数据，禁止另建一套人工维护且可能不一致的数据。
6. “球队数据查询入口链接”是业务页面入口，不是操作系统文件符号链接；具体服务号项目路径、二维码落点、链接载体和身份识别方案须在实际开发前由用户确认。

### 11.5 ⭐⭐⭐ 裁判端手机优先与便捷性

裁判现场工作不再强制使用 Pad，**普通手机必须能够独立完成比赛记录工作**。Pad 仅作为可选的大屏设备，不得成为功能完整性或操作效率的前提。

执行规则：

1. 裁判记录功能以微信小程序手机端为第一使用场景，适配常见手机尺寸，并优先保证竖屏状态下完整可用。
2. 比分、比赛事件、判罚、签字和提交等核心操作不得依赖 Pad 专属布局、悬停操作、外接键盘或超宽屏幕。
3. 便捷性优先于信息堆叠：高频操作入口明显、点击区域足够大、步骤尽量少，避免裁判在场边反复切页和长文本输入。
4. 能通过预设、选择、快捷按钮和自动带入完成的内容，不要求裁判重复手工填写；危险操作和最终提交仍须有明确确认。
5. 现场记录必须有清晰的成功/失败反馈，并防止连续点击造成重复记分或重复事件；网络波动、提交失败或页面中断时，不得无提示丢失已记录内容。
6. 误记内容应允许在权限和比赛状态规则内快速更正，并保留必要的修改痕迹，不能要求裁判为一次纠错重做整场记录。
7. Pad 和 PC 可以提供更宽的信息展示、复核或管理视图，但不得拥有手机端缺失的裁判现场核心记录能力。
8. 裁判端属于现场执行端，不机械套用主办方“双端功能对等”规则；其数据仍须与主办方 PC/小程序使用同一比赛数据和状态流。
9. 验收时必须使用真实手机尺寸检查核心流程，不得只用桌面浏览器或 Pad 截图判断完成。

---

## 十二、配置速查

### 腾讯云短信
| 参数 | 值 |
|------|-----|
| SDKAppId | `1401139144` |
| 模板ID | `2657871` |
| 签名 | `河南麦步体育` |
| Region | `ap-beijing` |
| SecretId | `TENCENT_SECRET_ID` |

### 微信开放平台
| 参数 | 值 |
|------|-----|
| 小程序 AppID | `wx57164cca8676f411` |
| 网站应用 AppID | `wx5a42aae0e5d0669c` |
| 授权回调域 | `saixiaofeng.com` |

### 邮箱 SMTP
| 参数 | 值 |
|------|-----|
| 邮箱 | saixiaofeng@yeah.net |
| SMTP | smtp.yeah.net:465 (SSL) |
| 环境变量 | SMTP_USER / SMTP_PASS |

### CloudBase
| 参数 | 值 |
|------|-----|
| 环境ID | `cloud1-7g8ckb3c7815a011` |
| HTTP API URL | `https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi` |
| 区域 | ap-shanghai |

---

## 十三、部署流程

### Web 管理后台
```bash
cd web-admin-vue
npm run build
npx tcb hosting deploy ./dist admin -e cloud1-7g8ckb3c7815a011
```

### 着陆首页
```bash
npx tcb hosting deploy index.html / -e cloud1-7g8ckb3c7815a011
```

### 云函数
```bash
npx tcb fn deploy <函数名> -e cloud1-7g8ckb3c7815a011
# 有 node_modules 用"上传并部署：云端安装依赖"
```

### 小程序
微信开发者工具 → 导入 `miniprogram/` 目录

---

## 十四、修改代码时的清单

在提交任何改动前，确认：

- [ ] **主办方双端同步**：小程序与 PC 端对应功能均已实现或同步更新
- [ ] **主办方业务一致**：两端权限、字段、校验、状态流和数据结果一致
- [ ] **批量添加球员**：两端均验证权限、重复数据、逐条结果和部分失败处理
- [ ] **青少年赛事闭环**：主办方可独立完成赛制、赛程、球队、球员及照片维护，不依赖参赛球队配合
- [ ] **责任模型隔离**：青少年与成年赛事没有互相套用错误的录入责任和协作流程
- [ ] **机构上下文**：新增权限和数据归属未写死到单个手机号、个人或唯一固定角色
- [ ] **服务号最小范围**：当前仅有球队数据只读查询入口，未开放球员数据或球队/球员写入能力
- [ ] **数据同源**：服务号比分、分组和球队信息来自赛事系统现有数据，没有另建重复数据
- [ ] **阶段边界**：当前核心开发仍是主办方 PC/小程序，未擅自扩展服务号自助业务
- [ ] **裁判手机可用**：普通手机竖屏可独立完成全部现场核心记录，不依赖 Pad
- [ ] **裁判操作便捷**：高频操作步骤少、按钮易点、反馈清楚，并处理重复点击、网络失败和快速纠错
- [ ] **小程序**：WXML 无 `===`/`!==`/`?:`/`.find()`/`[0]`
- [ ] **网页端**：没有引入 `@cloudbase/js-sdk`，都走 `cloud.js`
- [ ] **云函数**：跨端查询用 `_.or()` 双字段兼容
- [ ] **cloud.js 修改后**：已 `npm run build` + `tcb hosting deploy ... /admin`
- [ ] **index.html 修改后**：已部署到根目录
- [ ] **短信**：签名写"河南麦步体育"，模板ID是 2657871
- [ ] **没有多余的花括号**
- [ ] **const 在使用前定义**

---

## 十五、修改 cloud.js 的完整流程

`web-admin-vue/src/utils/cloud.js` 是零SDK方案的核心，修改后必须：

```bash
# 1. 构建
cd web-admin-vue && npm run build

# 2. 部署到 /admin/（Vue SPA 走这里）
npx tcb hosting deploy ./dist admin -e cloud1-7g8ckb3c7815a011

# 3. 如果 index.html 也引用了相关逻辑，也要部署根目录
npx tcb hosting deploy index.html / -e cloud1-7g8ckb3c7815a011
```

---

## 十六、架构决策记录（ADR）

| 日期 | 决策 | 详情 |
|------|------|------|
| 2026-06-19 | **零 SDK 方案** | 浏览器端彻底不用 `@cloudbase/js-sdk`，全走 webLoginApi HTTP API |
| 2026-06-28 | **2.0 架构** | SaaS+私有化双模式、多租户 orgId、students 独立于 tournament_players |
| 2026-06-28 | **赛事类型扩至 5 种** | youth/amateur/local/city/professional |
| 2026-06-29 | **多体育平台** | 足球先跑稳，预留 sportType 参数位，子域名体系 |
| 2026-06-30 | **域名统一** | saixiaofeng.com 为唯一域名（1.0+2.0 共用） |
| 2026-06-30 | **Git 仓库** | 迁入 https://gitee.com/saixiaofeng/saixiaofeng.git |
| 2026-07-16 | **主办方双端优先** | 当前先完成主办方 PC 端和小程序端，所有主办方核心能力双端对等 |
| 2026-07-16 | **青少年赛事主办方代建** | 赛程赛制、球队、球员及照片由主办方负责，参赛球队不承担资料创建义务 |
| 2026-07-16 | **服务号分阶段** | 当前仅开放球队比分/分组等只读查询链接且不开放球员数据；球队/球员自助能力后续再收口服务号 |
| 2026-07-16 | **裁判手机优先** | 普通手机必须独立完成现场记录，Pad 仅作可选大屏设备，交互首先保证便捷与可靠 |
| 2026-07-16 | **登录身份唯一性** | 手机号跨 `phone`/`phoneNumber` 唯一，UnionID 优先识别，端间 OpenID 分存，切换账号先清旧会话 |
| 2026-07-16 | **扫码即主办方** | PC/小程序首次扫码或手机号注册直接创建 organizer，历史账号统一归一为 organizer；球队、球员、裁判仅作业务标签，后续球队/球员入口收口服务号 |

---

## 十七、测试账号

| 手机号 | 角色 | 用途 |
|--------|------|------|
| `15038292130` | ORGANIZER（主办方） | 网页端赛事管理 |
| `17319716663` | ORGANIZER（主办方） | 历史账号归一化及跨端登录验收 |

---

## 十八、当前状态（2026-06-30）

### ✅ 已完成
- 小程序登录/球队/球员/比赛/赛事/裁判/签字/个人主页
- 网页端首页/多方式登录/注册流程/角色路由守卫
- 赛事 CRUD/抽签/赛程/阵型编排/裁判签字 PC 端
- 队徽 AI 抠图/AI 解析规程/赛事官网/数据导出
- 零 SDK 方案/赛事中心独立后台
- WXML 兼容性全面修复

### 🔧 待完成
- 裁判分配流程真实测试
- 参赛名单审核流程完善
- 球队待办系统（team_tasks）
- 比赛事件记录（进球/黄牌/红牌）
- 小程序主办方视角功能
- 2.0 青训俱乐部系统开发

---

## 十九、项目记忆自动维护规则

用户已授权：后续开发过程中，AI 应根据事项的重要性，主动把已经确认且会长期影响项目的内容写入本 `AGENTS.md`，无需每次重复请求记录。

### 应自动记录

- 已确认的产品定位、阶段优先级、角色职责和业务边界。
- 小程序、PC、服务号等端口之间的分工与同步规则。
- 会影响多个页面或后续开发的数据模型、权限、接口和状态流决策。
- 经验证的重要技术限制、严重故障原因、部署要求及防止重复踩坑的规则。
- 用户明确确认并要求后续持续遵守的验收标准和默认原则。

### 不应自动记录

- 尚未确认的讨论、猜测、备选方案或临时设想。
- 单次调试过程、临时日志、短期测试数据和无复用价值的实现细节。
- 仅影响当前页面且代码本身已能清楚表达的普通修改。
- 密码、令牌、验证码、私钥及新增的敏感信息。

### 维护边界

1. 自动记录前先确认内容与现有规则不冲突；有冲突时更新旧规则并说明变更，不同时保留两套矛盾结论。
2. 记录应简洁、可执行，并写入最相关章节；重大架构或产品决策同时追加到 ADR。
3. 自动更新 `AGENTS.md` 不代表可以扩大业务代码修改范围；业务代码仍严格遵守用户当前指定的页面和文件清单。
4. 每次自动记录后必须检查 `git diff`，确认只写入预期内容，并在交付说明中告知用户。

---

> **AI 使用提示**：每次开始编码前，请重新阅读第五章（致命规则）和第六章（已知坑点）。
> 这个项目踩过的坑已经写在这里了，不要再踩一遍。

## 重要：唯一正式代码库

见 `REPOSITORY_POLICY.md`。所有分支、部署、备份、提交以 `E:\Documents\sxf-football` 为准；不要使用桌面旧目录或 Codex 临时 worktree 作为部署源。
