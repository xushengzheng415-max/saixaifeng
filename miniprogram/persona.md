# 赛小蜂小程序产品原型与开发准则

> 更新时间：2026-06-30  
> 适用范围：`miniprogram/` 微信小程序源码  
> 产品阶段：足球 1.0 赛事系统深化中，2.0 青训与多体育平台架构预留

---

## 一、产品定位

赛小蜂小程序是赛小蜂足球赛事系统的移动端入口，当前服务于 **1.0 赛事系统**，核心目标是让球队、教练、裁判和赛事参与者在手机上完成赛事相关操作。

当前小程序不是单纯的裁判工具，也不是早期青训单点原型，而是围绕「赛事即官网」展开的多角色协作端。

| 产品线 | 定位 | 小程序承担内容 |
|---|---|---|
| 1.0 赛事系统 | 赛事即官网 SaaS | 登录、球队管理、球员管理、赛事报名、赛程查看、比赛详情、阵容、裁判签字、个人中心 |
| 1.0 成人版拓展 | 社会球队日常管理 | 约球、出勤、比赛记录、战报、年度总结，当前为规划方向 |
| 2.0 青训系统 | 青训俱乐部数字化管理 | 未来教练端/家长端独立或角色合并，当前仅做数据与架构预留 |

---

## 二、核心用户与角色

### 1. 教练 / 球队管理员

主要使用小程序管理球队与参赛相关事务。

核心任务：
- 创建或维护球队资料
- 管理球员资料
- 给赛事报名
- 提交和调整参赛名单
- 查看赛程、比赛详情和阵容
- 处理赛事中心或主办方下发的事项

### 2. 球员 / 队员

当前不是主要录入主体，但会通过球队、比赛、球员卡等页面获得展示与参与体验。

核心任务：
- 查看个人资料和球员卡
- 查看比赛与赛事信息
- 未来参与出勤确认、约球响应、战报分享

### 3. 裁判 / 裁判长

当前小程序包含裁判入口，重点服务比赛执裁和签字确认。

核心任务：
- 查看执裁相关比赛
- 进入比赛详情
- 完成赛后签字确认
- 未来支持裁判分配和执裁记录

### 4. 赛事中心 / 主办方视角

小程序已有赛事中心入口，当前更多是赛事浏览与报名入口，未来会补主办方移动端能力。

核心任务：
- 查看赛事列表和赛事详情
- 管理赛事报名入口
- 查看赛事队伍、赛程、抽签、规则
- 未来支持移动端主办方审核和通知

---

## 三、当前页面地图

小程序主包页面来自 `app.json`。

| 模块 | 页面 | 说明 |
|---|---|---|
| 登录 | `pages/login/login` | 微信/手机号等登录入口 |
| 首页 | `pages/home/home` | 小程序首页，赛事与功能入口 |
| 引导 | `pages/guide/team-info/team-info`、`pages/guide/referee-info/referee-info` | 球队/裁判资料引导 |
| 球队 | `pages/team/team`、`pages/team/detail/detail`、`pages/team/management-*` | 球队列表、详情、管理 |
| 球员 | `pages/team/player-add/player-add`、`pages/team/player-detail/player-detail`、`pages/player/detail/detail` | 球员新增与详情 |
| 比赛 | `pages/match/detail/detail`、`pages/match/squad/squad` | 比赛详情和阵容 |
| 赛事 | `pages/tournament/list/list`、`teams`、`draw`、`signup`、`schedule`、`create`、`detail`、`rules` | 赛事列表、队伍、抽签、报名、赛程、创建、详情、规程 |
| 赛事中心 | `pages/tournament-center/tournament-center` | 赛事中心入口 |
| 名单变更 | `pages/roster-change/roster-change` | 参赛名单变更申请 |
| 裁判 | `pages/referee/index` | 裁判入口 |
| 我的 | `pages/profile/profile`、`pages/profile/info/info` | 个人中心与资料 |
| 管理/邀请 | `pages/manage/manage`、`pages/invite/invite` | 管理与邀请 |

分包 `packageA`：

| 分包页面 | 说明 |
|---|---|
| `packageA/pages/signature/signature` | 签字页 |
| `packageA/pages/lineup/lineup` | 阵容页 |

---

## 四、底部导航

当前采用自定义 tabBar，四个主入口：

| Tab | 页面 | 定位 |
|---|---|---|
| 首页 | `pages/home/home` | 功能聚合、快捷入口 |
| 赛事 | `pages/tournament-center/tournament-center` | 赛事中心、赛事信息 |
| 裁判 | `pages/referee/index` | 裁判工作入口 |
| 我的 | `pages/profile/profile` | 账号、资料、身份 |

视觉主色保持绿色体系：
- 导航栏：`#2E7D32`
- 选中态：`#2E7D32`
- 品牌主色方向：`#1B5E20 -> #43A047`

---

## 五、核心业务流程

### 1. 登录与身份

```text
进入小程序 -> 登录 -> 获取 openId/手机号 -> 匹配用户 -> 进入首页/角色对应页面
```

跨端识别注意事项：
- 小程序端常用 `openId` + `phoneNumber`
- Web 端常用 `wechatOpenId` + `phone`
- 小程序 openId 与网页登录 openId 不相等，跨端识别优先用手机号/unionId

### 2. 球队管理

```text
教练登录 -> 我的球队 -> 创建/认领球队 -> 完善球队资料 -> 管理球员 -> 报名赛事
```

球队字段必须遵守 `teams` 统一规范。

| 类型 | 字段 |
|---|---|
| 核心 | `name`、`shortName`、`provinceCode`、`cityCode`、`cityName`、`teamType`、`teamCode` |
| 归属 | `ownerPhone`、`creatorId`、`claimStatus` |
| 来源/时间 | `source`、`createTime`、`updateTime` |
| 可选 | `establishedDate`、`logo`、`description`、`home` |

不要再新增或回写这些旧字段：
- `creatorPhone`
- `logoUrl`
- `phoneNumber`
- `phone`
- `contactPhone`
- `coachPhone`
- `openId`
- `wechatOpenId`
- `province`
- `city`
- `foundedDate`
- `createdAt`

### 3. 球员管理

```text
进入球队 -> 球员管理 -> 新增/编辑球员 -> 自动生成球衣名与球员编号 -> 参与赛事报名
```

球员字段必须遵守 `players` 统一规范。

| 类型 | 字段 |
|---|---|
| 基本 | `name`、`gender`、`birthDate`、`idCard`、`nationality`、`nativePlace` |
| 比赛 | `jerseyNumber`、`position`、`jerseyName`、`photoUrl` |
| 身体 | `height`、`weight` |
| 联系 | `contactName`、`contactPhone` |
| 归属 | `playerId`、`personType`、`teamId`、`teamName` |
| 管理 | `status`、`source`、`registerTime`、`createTime`、`updateTime`、`clubPlayerId` |

不要再使用这些旧字段：
- `birthday`
- `photo`
- `phone`
- `parentName`
- `parentPhone`
- `emergencyName`
- `emergencyPhone`
- `createdAt`
- `updatedAt`

### 4. 赛事报名

```text
赛事列表/赛事详情 -> 选择报名 -> 选择球队 -> 选择球员名单 -> 提交 -> 等待审核 -> 报名通过
```

报名状态流：

```text
drafting -> submitted -> pending_approval -> approved
```

后续重点完善：
- 参赛名单审核流程
- 名单变更审核
- 主办方移动端审核视角
- 球队待办 `team_tasks`

### 5. 比赛与签字

```text
查看赛程 -> 进入比赛详情 -> 查看双方阵容/比分/信息 -> 裁判或相关人员签字确认
```

当前重点：
- 比赛详情展示
- 阵容页
- 签字页
- 裁判签字流程

后续补强：
- 比赛事件记录：进球、助攻、黄牌、红牌、换人
- 裁判分配真实流程测试
- 赛后数据沉淀与战报生成

---

## 六、赛事类型体系

赛事类型字段为 `tournaments.category`，与赛制 `formatType` 独立。

| key | 标签 | 颜色 | 背景色 |
|---|---|---|---|
| `youth` | 青少年赛事 | `#AB47BC` | `#F3E5F5` |
| `amateur` | 业余赛事 | `#66BB6A` | `#E8F5E9` |
| `local` | 地协赛 | `#42A5F5` | `#E3F2FD` |
| `city` | 城市联赛 | `#FF9800` | `#FFF3E0` |
| `professional` | 职业联赛 | `#E53935` | `#FFEBEE` |

小程序新建赛事页涉及：
- `pages/tournament/create/create.js`
- `pages/tournament/create/create.wxml`

---

## 七、编号规则

### 球队编号 `teamCode`

```text
[省份号3位][城市字母1位][序号3位][类型代码2-3位]
```

示例：

```text
226E00112
```

### 球员编号 `playerId`

```text
[球队编号9位][序号3位][类型1位]
```

示例：

```text
226E00112001C
```

类型：
- `A`：教练
- `B`：工作人员
- `C`：球员
- `X`：多身份

规则：
- 序号按球队独立递增
- A/B/C/X 共享同一个序号空间
- 删除后序号不复用
- 创建来源写入 `source`，不写进编号

---

## 八、1.0 成人版社会球队拓展方向

这是 1.0 赛事系统的付费拓展，不与正式赛事排名强绑定。

| 模块 | 说明 |
|---|---|
| 约球管理 | 队长创建约战，分享链接，对方点击应战后直接生成比赛记录 |
| 手动比赛 | 已经线下约好的比赛可手动录入 |
| 三态出勤 | 已到、请假、缺席 |
| 数据记录员 | 赛前分配记录权限，比赛中可交接 |
| 实时比分 | 场下人员实时更新比分 |
| 比赛事件 | 进球、助攻、红黄牌、射门、扑救等 |
| 自动战报 | 赛后生成可分享战报 |
| 年度总结 | 自动统计全年数据，生成年度总结文章 |
| 球员卡增强 | 出勤徽章、炫彩度、成就体系 |

规划集合：

```text
casual_matches
```

注意：
- 约球记录是球队私有数据
- 不参与正式赛事积分排名
- 复用 1.0 球队和球员资料

---

## 九、2.0 青训预留

2.0 是青训俱乐部系统，产品逻辑围绕学员成长，不等同于 1.0 赛事。

| 1.0 | 2.0 |
|---|---|
| 主办方、教练、裁判、球队 | 校区管理员、教练、家长 |
| 围绕赛事 | 围绕学员成长 |
| `players` / 参赛名单 | `students` / 学员池 |

预留原则：
- 2.0 业务集合需要 `orgId`
- 1.0 `players` 与 2.0 `students` 不强制混用
- 同步时用 `clubPlayerId` 回溯
- 2.0 的 `guardianRelation`、`school`、`grade`、`healthNote`、`courseSchedule`、`feeStatus` 不写入 1.0 的 `players`

---

## 十、多体育平台预留

当前足球优先，不改现有集合名。

原则：
- 足球现有集合继续使用 `teams`、`players`、`tournaments`、`matches`
- 未来篮球、羽毛球等新项目使用前缀集合，如 `basketball_teams`
- 小程序未来通过 `app.globalData.sportType` 切换体育项目
- 现在新写逻辑可预留 `sportType`，默认值为 `football`

未来小程序方向：

```text
赛小蜂赛事：足球 / 篮球 / 羽毛球 / 乒乓球
赛小蜂教练：多项目教练端
赛小蜂家长：多项目家长端
```

当前阶段不要为了多体育过度抽象，先保证足球 1.0 稳定。

---

## 十一、技术开发铁律

### 1. WXML 表达式限制

WXML 中只写简单表达式。

允许：

```text
{{变量}}
{{!变量}}
{{a || b}}
```

禁止：

```text
{{a === b}}
{{a !== b}}
{{condition ? a : b}}
{{list.find(...)}}
{{items[0]}}
```

所有复杂计算必须在 JS 中预计算后 `setData`。

### 2. 编码与兼容

- 文件统一 UTF-8
- 避免 BOM 导致小程序编译异常
- 避免过新的 JS 语法影响真机兼容
- 小程序端对数据字段要做空值兜底

### 3. 云函数调用

- 小程序端继续使用 `wx.cloud`
- 网页端是 `fetch + webLoginApi`
- 只有 `webLoginApi` 配置 HTTP 触发，其他云函数不要假设可直接 HTTP 调用

### 4. 文件与图片

- `photoUrl`、`logo` 存云存储 fileID，不存临时 URL
- 临时 URL 由前端展示时动态获取
- 不要把 `logoUrl`、`photo` 等临时字段重新写回数据库

---

## 十二、近期开发优先级

1. 完善参赛名单审核和名单变更流程
2. 真实测试裁判分配与裁判签字闭环
3. 增加比赛事件记录：进球、助攻、红黄牌、换人
4. 设计球队待办 `team_tasks`
5. 增强主办方移动端视角
6. 逐步落地成人版社会球队日常管理：约球、出勤、战报
7. 为 2.0 和多体育保留字段与结构，但不提前大改现有足球数据

---

## 十三、AI 协作规则

后续 AI 或开发者改小程序时，应默认遵守：

- 优先保护现有业务闭环，不做无关重构
- 修改字段前先核对统一字段规范
- 小程序 WXML 不写复杂表达式
- 旧字段只做兼容读取，不做新增写入
- 敏感配置不提交 Git
- 视觉风格保持绿色运动科技感，优先保证清晰、可用、稳定
- 对 1.0/2.0 边界保持清醒：赛事归赛事，青训归青训

---

## 十四、一句话版本

赛小蜂小程序当前是足球 1.0 赛事系统的移动协作端，核心服务教练/球队、赛事报名、比赛查看、裁判签字和个人中心；后续在不破坏现有数据结构的前提下，逐步拓展社会球队日常管理、2.0 青训和多体育平台能力。
