# AGENTS.md — 赛小蜂项目记忆系统

> **用途**：为 Codex / Claude Code / Cursor 等 AI 编程助手提供项目上下文。
> AI 在开始任何代码修改前，必须先阅读本文档。
> **最后更新**：2026-06-30

---

## 一、项目身份

| 字段 | 值 |
|------|-----|
| 项目名称 | **赛小蜂**（又名"麦布足球赛事管理系统"） |
| 产品线 | **1.0 赛事系统**（赛事即官网 SaaS）+ **2.0 青训俱乐部系统**（学员/排课/财务） |
| Git 仓库 | `https://gitee.com/saixiaofeng/saixiaofeng.git` |
| 本地路径 | `C:\Users\Frank\Documents\赛小蜂` |
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
- **手机号身份映射**：`15038292130`→ORGANIZER / `17319716663`→COACH

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

---

## 十七、测试账号

| 手机号 | 角色 | 用途 |
|--------|------|------|
| `15038292130` | ORGANIZER（主办方） | 网页端赛事管理 |
| `17319716663` | COACH（教练） | 小程序端球队管理 |

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

> **AI 使用提示**：每次开始编码前，请重新阅读第五章（致命规则）和第六章（已知坑点）。
> 这个项目踩过的坑已经写在这里了，不要再踩一遍。

## 重要：唯一正式代码库

见 `REPOSITORY_POLICY.md`。所有分支、部署、备份、提交以 `C:\Users\Frank\Documents\赛小蜂` 为准；不要使用桌面旧目录或 Codex 临时 worktree 作为部署源。
