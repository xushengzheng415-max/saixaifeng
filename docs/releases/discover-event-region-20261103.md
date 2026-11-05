# 发现页赛事按实际登记区域展示、同城排前面（2026-11-03）

用户口径（2026-11-03）：发现里的赛事「按实际区域走」，确认采用推荐方案 —— **默认展示全部赛事 + 同城排前面，区域取球队资料登记的城市，不申请手机定位**。

同日追加确认（2026-11-03，方案 B）：**手机定位城市优先，取不到时回落球队资料登记城市**。定位只用于判定同城，不按城市过滤赛事；本章第 1–5 节为第一版（仅球队资料城市），第 6 节为定位方案落地记录（**代码已就绪，未部署、未上传**）。

## 1. 事实与依据

- 公共赛事接口 `cloudfunctions/getTournamentList/index.js` 原来只返回 `location`，不返回 `province` / `city` / `district`；
  小程序 `discover-model.js` 的 `regionText` 只能拿 `location` 兜底，`location` 为空就显示「区域待定」。
- 只读抽样线上 `tournaments`：`province` / `city` 均有值，形如「河南省 / 郑州市 / 濮阳市 / 焦作市」；`location` 部分为自由文本
  （「河南省 开封市（全市）」），个别把省份填进 `city`。
- 球队侧 `teams.city` 同口径（如「濮阳市」），发现页已在使用球队资料登记的所在城市（`teamProfile.city → cityText`），无需新权限。
- 赛事没有经纬度，只有文本地址，无法做距离排序；因此不做「附近赛事」，也不引入定位授权。

## 2. 改动

### 2.1 共享后端（正式与测试共用）

`cloudfunctions/getTournamentList/index.js`：

- 返回 `province` / `city` / `district` / `regionText`；`regionText` 由登记地拼「省+市+区」，
  `city` 与 `province` 相同时不重复拼，全部缺失才退回 `location`，不补造城市。
- `categoryLabel` 改为按实际类别取文案（原来固定写「青少年赛事」，会把 `adult` / `campus` 误标）；未知类别返回空串。
- 校验时顺带确认线上包已包含 `includeLegacyCategory` 与类别字段（此前本地有、线上没有，成人赛事可能被漏返），本次一并带上。
- 不改分页与公开范围：同城只在客户端排序，服务端分页口径保持原样。

### 2.2 小程序

`miniprogram/pages/discover/discover-model.js`：

- 新增 `normalizeRegionName`：去空格、去括号备注、去「省/市/区/县」后缀，让「郑州」命中「郑州市」。
- `formatPublicEvent`：区域改为「省+市」优先、`regionText` 退次、`location` 兜底；新增 `regionCityName` / `regionAreaName` /
  `isSameCity` / `hasSameCityTag` 供页面直接用（WXML 不做判断）。
- 新增 `rankPublicEventsByCity(items, myCity)`：稳定分区，同城排前、其余保持原相对顺序；本队未登记城市时不重排也不打标；
  省份填进 `city` 的历史数据不会被误判为同城。

`miniprogram/pages/discover/discover.js`：`renderEvents` 先按 `teamCityValue()`（当前球队资料登记城市）排序再筛选/搜索；
城市异步读到后按新顺序重排，不额外请求接口。

`miniprogram/pages/discover/discover.wxml` / `.wxss`：赛事标题行加「同城」标（`hasSameCityTag`，js 预计算）。

`miniprogram/config/release.js`：版本升 **1.2.38**，新增「赛事区域与同城」一节。

## 3. 发布与读回

- 云函数 `getTournamentList`：`fn code download` 取线上最新包 → 只覆盖本地 `index.js` → `node --check` →
  `fn code update --dir <staging> --deployMode cos` 成功；发布后配置未变：`Active`、`InstallDependency=TRUE`、
  `Nodejs16.13`、256MB / 15s、`ModTime 2026-11-03 22:03:13`、代码 7,452,414 B。
- `fn invoke getTournamentList {"pageSize":3,"includeLegacyCategory":true}` 读回：
  `regionText` 分别为「河南省焦作市 / 山东省菏泽市 / 河南省开封市」，`categoryLabel` 为「(空) / 校园赛事 / 成人赛事」。
- 小程序：1.2.38 已上传体验版，`TOTAL 5,170,748 B`（main 2,037,024 / packageCard 1,424,273 / packageDiscover 371,139 /
  pages/team 788,897 / pages/tournament 429,863 等），任务 `execution_success`；同一轮 1.2.37 也已上传成功
  （`TOTAL 5,168,882 B`）。

## 4. 验证

- `node --check`：`cloudfunctions/getTournamentList/index.js`、`pages/discover/discover.js`、`pages/discover/discover-model.js` 通过。
- `node tools/test-discover-market-view.cjs`：通过；新增区域用例 15 项（省+市拼接、省市不重复、`location` 兜底、无数据不编造、
  同城置顶且其余顺序不变、`郑州` ≡ `郑州市`、未登记城市不重排不打标、地址兜底匹配、省份填进 city 不误判、页面按城市排前、
  WXML 用 `hasSameCityTag` 预计算）。
- `node tools/test-friendly-invite-flow.cjs`：通过 **143 项 / 失败 0**（本轮未触碰约球链路，属回归）。

## 5. 边界与未做

- 不做「附近赛事」：赛事无经纬度，不做距离排序；手机定位只用于判定同城（见第 6 节）。
- 不做区域筛选 chips（用户口径是「默认全部 + 同城排前面」，不是只看同城）；如需「只看同城」，按此函数加筛选参数即可。
- 球队未登记城市且没有定位结果时只保持原顺序并提示城市待定，不猜测、不回退到 IP 或微信资料。
- 旧数据中 `city` 填成「河南省」的赛事按省份处理，不计为同城。

## 6. 追加：手机定位城市（方案 B，云函数已部署，小程序未上传）

用户 2026-11-03 确认「按推荐方案来」并在微信后台提交 `wx.getFuzzyLocation` 接口申请，随后确认**审核通过**；本轮按「部署 resolveCity」+「主包瘦身由助手定方案」执行。代码按「定位优先 + 球队资料兜底」落地。

### 6.1 改动

- 新增云函数 `cloudfunctions/resolveCity`：经纬度 → 城市（腾讯位置服务 `/ws/geocoder/v1/`）。
  - 只依赖 Node 内置 `https`，无第三方依赖，保持 Node.js 18 兼容。
  - key 只从环境变量 `TENCENT_LBS_KEY` 读取，不写死、不打日志、不出现在返回体或错误信息里。
  - 只取 `ad_info` 的省/市/区，不返回详细地址、不落库、不记录调用者身份；`city` 为空时用省份兜底（直辖市）。
  - 失败码：`BAD_LOCATION`（坐标缺失/越界/0,0）、`KEY_MISSING`（未配置 key）、`UPSTREAM_FAILED`（上游 status≠0）、`NO_CITY`（没解析到城市）、`UPSTREAM_ERROR`（网络/超时/解析失败）；按约 1km 网格缓存 200 条。
- `miniprogram/utils/location.js`：
  - `withPrivacy(task, { silent, onDeny })` 新增静默模式，隐私未同意时不再弹阻断弹窗（`pickLocation` 行为不变，仍会提示）。
  - 新增 `canLocate` / `locateAuthState`（已授权 / 已拒绝 / 未询问）/ `locateCity({force})` / `readCityCache` / `writeCityCache` / `clearCityCache`；城市缓存键 `sxf_discover_city_v1`，12 小时 TTL，`force` 时忽略缓存。
  - `locateCity` 永不 reject，失败返回 `{ ok:false, reason }`，页面据此静默回落。
- `miniprogram/app.json`：`requiredPrivateInfos` 增加 `"getFuzzyLocation"`（保留 `chooseLocation`）；`permission.scope.userLocation` 描述改为「用于在发现页按所在城市展示同城赛事，以及在发起约球时选择比赛场地」。
- `miniprogram/pages/discover/discover.js`：
  - 新增 `applyCityDisplay`（定位城市 > 球队资料城市 > 城市待定，`cityFromGps`/`citySource` 预计算）、`citySortValue`（排序与「同城」标共用同一取值）。
  - 新增 `locateCityIfNeeded(force)`：只在赛事栏触发；一次会话只自动请求一次；`authSetting` 已为拒绝时自动跳过（不反复弹窗），只有用户点城市入口才强制重试。
  - 新增 `requestCity(force)`：失败静默回落球队资料城市，只有用户主动触发才 toast 结果；城市到达后调 `renderEvents()` 重排，不重新请求接口。
  - `onTapCity` 改为三态文案（按手机定位 / 按球队资料 / 城市待定），可「重新定位」；城市完全待定且本账号可管理球队时给「去补充」入口。
- `miniprogram/pages/discover/discover.wxml` / `.wxss`：头部城市 chip 增加「定位」小标（`wx:if="{{cityFromGps}}"`，js 预计算）。

### 6.2 上线前置（当前状态）

1. 微信后台「开发管理 → 接口设置」申请 `wx.getFuzzyLocation`：**已审核通过**。
2. 小程序「用户隐私保护指引」声明**位置信息**：**未完成**（未声明时调用会被微信拦截，页面静默回落球队资料城市）。
3. 部署 `cloudfunctions/resolveCity`：**已部署并读回**（见第 7 节）；环境变量 `TENCENT_LBS_KEY` **仍未配置**，`fn invoke` 返回 `KEY_MISSING`。
4. 重新上传体验版并真机验证定位 / 拒绝授权 / 关定位三种路径：**未完成**（主包瘦身已完成，见第 8 节）。

任一步缺失时的行为：接口未开通 → `unsupported`；用户拒绝 → `denied`（不再自动弹窗）；云函数未部署或缺 key → `KEY_MISSING` / `cloud_unavailable`；以上全部静默回落到球队资料城市，与第 1–5 节行为一致，线上旧包不受影响。

### 6.3 验证

- `node --check`：`cloudfunctions/resolveCity/index.js`、`miniprogram/utils/location.js`、`miniprogram/pages/discover/discover.js` 通过；`app.json` JSON 解析通过。
- `node tools/test-discover-city-locate.cjs` PASS，覆盖：云函数入参校验、上游解析与直辖市兜底、`NO_CITY` / `UPSTREAM_FAILED`、key 不出现在返回体与错误信息、网格缓存命中不再打上游；定位缓存命中/过期重取、拒绝授权不调逆地理、隐私未同意 `privacy_denied`、缺 key / 无云函数 / 无定位接口各自回落、`force` 忽略缓存；页面「定位优先重排、回落球队城市、双缺失待定、已拒绝不自动请求、接口不可用不发请求」；WXML 无复杂表达式、`city-badge` 与 `app.json` 声明检查。
- 回归：`node tools/test-discover-market-view.cjs`、`node tools/test-public-event-card-display.cjs` PASS。

### 6.4 未做（等用户确认）

- 定位城市不参与「公开约球」的只看同城筛选（该栏仍按球队资料城市），口径未获授权。
- 不做后台持续定位、不把坐标或城市写进数据库或用户资料。
- 未提交、未推送、未上传小程序。

## 7. resolveCity 部署与读回（2026-11-03）

- 部署：`sxf-cloud football run fn deploy resolveCity --dir cloudfunctions/resolveCity --runtime Nodejs18.15 --install-dependency false --yes --json` 成功（`action: create`）。CLI 遇到未登记函数会交互询问「使用默认配置」，必须带 `--yes`（全局非交互）；管道 `echo y` 无效。
- 超时修正：CLI 新建函数默认 `Timeout=3`，而函数内上游请求超时是 5 秒，故补 `fn config update fn resolveCity --timeout 10 --yes`（读回 `Timedout: 10`）。
- 读回：`Status Active` / `AvailableStatus Available`、`Runtime Nodejs18.15`、`MemorySize 256`、`Timeout 10`、`InstallDependency FALSE`、`CodeSize 2757`、`Environment.Variables null`（**尚未配置 key**）。
- 调用验证：`fn invoke resolveCity --params '{"latitude":34.746,"longitude":113.625}'` → `{"success":false,"code":"KEY_MISSING","message":"尚未配置腾讯位置服务 key"}`，说明函数可调用、入参校验与 key 缺失分支正确；`-d @file` 传参不被识别（会落到 `BAD_LOCATION`），只能用 `--params`。
- 待办：在 CloudBase 控制台为 `resolveCity` 配置环境变量 `TENCENT_LBS_KEY`（不要在命令行、日志或仓库里传值），配置后再次 `fn invoke` 读回真实城市（预期「郑州市」）。

## 8. 主包瘦身（2026-11-03，本轮完成）

背景：1.2.39 上传被拒 `main package source size 2130KB exceed max limit 2048KB`。改造前后统一用 `node tools/check-miniprogram-package-size.cjs` 统计；该工具已改为按**微信上传口径**统计（读取 `project.config.json` 的 `packOptions.ignore`，与开发者工具上报的 main package source size 对齐），并新增主包/分包页面归属校验。

- 分包化（`miniprogram/app.json`）：把低频二级页整体提升为独立分包根，**页面路径完全不变**，因此小程序内跳转、云函数里的 `targetPage` 与订阅消息 `page` 字符串都不需要改：
  - `pages/todo`（index）、`pages/messages`（index）、`pages/guide`（team-info、referee-info）、`pages/service`（workbench、claim、lineup）、`pages/referee`（index、match）、`pages/roster-change`（roster-change）、`pages/workspace`（select、switch、temp-team、restricted）。
  - 主包 `pages` 由 44 条减到 28 条；tabBar 五页（home / event / teams / discover / profile）仍在主包，不能进分包。
- `packOptions.ignore`（`project.config.json`）：
  - **移除** `images/runtime/team-card-bg-v1-lite.jpg` 的忽略项：该图被 `pages/team/tactics/tactics.wxml` 引用，忽略会让战术板背景图取不到，属既有缺陷；改为保留在主包（13.7 KB）。
  - 新增排除未注册且零引用的 `pages/identity`、`pages/my-cards`（源码保留、不进包）。
  - 新增排除 `pages/guide` 下已被子目录版本替代的扁平旧文件（`team-info.*` / `referee-info.*`）、`pages/referee` 的占位 `verify.*` / `record.*`。
  - 新增排除与运行无关的 `pages/tournament/create/create.js.bak`、`utils/pinyin.js.tmp`、`persona.md`、`AGENTS.md`、`packageCard/README.md`（`LICENSE-lucide.txt` 等许可说明文件不排除）。
- 结果（上传口径）：主包 **2426.3 KB → 1937.6 KB**，余量 110.4 KB；`packageCard` 1396.4 KB、`pages/team` 824.3 KB、`pages/tournament` 518.9 KB、`packageDiscover` 382.0 KB、`pages/match` 150.5 KB、`packageA` 50.0 KB，均未超限。
- 未采用：重编码大图——实测用 System.Drawing 以 q82 重编码 9 张主包大图，425.2 KB 反而变成 550.1 KB（原图压缩更优），本机无 `magick`/`ffmpeg`/`sharp`，故放弃。
- 验证：`app.json` / `project.config.json` JSON 解析通过；`miniprogram` 全部 `.js` 逐文件 `node --check` 0 失败；`tools/check-miniprogram-package-size.cjs` 分包归属校验通过（主包页面均不在分包根目录内、分包页面 `.js/.wxml/.json` 文件齐全）；`tools/test-discover-city-locate.cjs`、`test-discover-market-view.cjs`、`test-public-event-card-display.cjs` PASS；`tools/validate-ui-delivery.js` 仅剩 1 条**既有误报**（`'/pages/tournament/' + page` 动态拼接被当成未登记路由，HEAD 版本同样命中，非本次引入）。
- `miniprogram/config/release.js`：1.2.39「赛事区域与同城」条目由「不申请手机定位」改为定位优先口径，并补授权时机、失败回落与不写库三条说明。
- 未记录上传结果：本轮未执行上传。

## 9. 逆地理改为「离线城市表优先 + 在线增强」（2026-11-03/04，已部署读回）

背景：`wx.getFuzzyLocation` 本身免费（微信不收接口费），但「经纬度 → 城市名」这一步必须依赖第三方逆地理服务。腾讯位置服务要额外申请 Key、配置授权 IP、再按 Key 分配每日配额，链路长且易断。用户提出「有没有好的解决办法」，故把这一步改成**自带数据、零 key、零配额**的实现，在线服务降级为可选增强。

- 新增离线数据 `cloudfunctions/resolveCity/city-centers.js`（**369 个地级行政单位**的中心点，12.9 KB）：由 `tools/build-city-centers.cjs` 从阿里 DataV 行政区划边界接口（`https://geo.datav.aliyun.com/areas_v3/bound/{省adcode}_full.json` 的 `properties.center`）生成，脚本可重跑覆盖，产物不入手工编辑流程。
  - 覆盖：地级市 + 自治州 + 地区 + 盟（按 `properties.level === 'city'` 取），并含 4 个直辖市、香港、澳门；台湾省接口 404，暂缺（该地区用户回落球队资料城市）。
  - 精度实测：郑州 4.0km、焦作 2.7km、喀什地区 0.0km、漠河→大兴安岭地区 163km、延吉→延边州 1.3km、大理→大理州 5km；纽约 9513km → 判定超出覆盖、如实返回 `NO_CITY`（由页面回落球队城市）。
- 云函数 `cloudfunctions/resolveCity/index.js` 重写为两级策略：
  1. 无 key：直接用最近城市中心点（Haversine）判定，毫秒级返回 `source:'offline'` + `distanceKm`；
  2. 有 key：先试在线（可拿到省/区/adcode），任何失败（`status 121` 配额耗尽、`112` IP 未授权、`311` 签名、超时、解析失败）都**回落离线结果**并标记 `degraded:true` + `upstreamCode` / `upstreamMessage`，不把上游错误抛给页面；
  3. 离线最近距离 > 300km（境外/无人区）不硬猜城市，返回 `NO_CITY`；
  4. 缓存改为带 TTL：在线/离线正常结果 6 小时，降级结果 30 分钟（配额恢复后能自动转回在线）；约 1km 网格，上限 200 条。
- 真实链路排障记录（供后续复用）：Key 建好后依次撞到 `status 112 来源IP未被授权 当前IP 182.254.157.81`（腾讯「授权 IP」不认 `0.0.0.0/0` 通配，须**留空**才是不限制）→ 清空后郑州坐标返回 `{"success":true,"city":"郑州市",...,"source":"tencent-lbs"}` 29ms、同网格第二次 `cached:true` 1ms → 换焦作坐标即 `status 121 此key每日调用量已达到上限`，根因为「账户额度 300 万/日但密钥未做配额分配」，需在控制台「配额分配」给该 Key 分配每日调用量。至此确认该依赖不可靠，转为上述离线方案。
- 部署与读回：`fn code update resolveCity --dir cloudfunctions/resolveCity`（只更新代码，避免覆盖已配置的环境变量）成功；`fn detail` 读回 `Status Active` / `AvailableStatus Available`、`Runtime Nodejs18.15`、`MemorySize 256`、`Timeout 10`、`CodeSize 10197`、`ModTime 2026-11-04 00:16:41`、`Environment.Variables` 保留 `TENCENT_LBS_KEY`；`InstallDependency` 由 `FALSE` 变为 `TRUE`（代码包无第三方依赖，在线安装不会引入内容，功能无影响）。
- 调用验证（配额仍为 121 的状态下）：
  - `{"latitude":35.215,"longitude":113.242}` → `{"success":true,"city":"焦作市","source":"offline","distanceKm":2.7,"degraded":true,"upstreamCode":"UPSTREAM_FAILED","upstreamMessage":"腾讯位置服务返回 status 121 / 此key每日调用量已达到上限"}`，136ms
  - `{"latitude":34.746,"longitude":113.625}` → `{"success":true,"city":"郑州市","source":"offline","distanceKm":3.9,"degraded":true,...}`，31ms
  - 即：**配额用尽、key 失效乃至完全没有 key 时，同城排序照常工作**；返回体与错误信息均不含 key（测试已断言）。
- 安全提示：为排查配置，`fn detail --json` 会把 `Environment.Variables` 的**明文值**打进终端输出，这类只读命令也会留痕；本轮据此建议**重置该腾讯位置服务 Key**（作废重发，再更新云函数环境变量），后续核对配置改用 `fn config get` 等不含值的口径，或在控制台页面核对。
- 测试：`tools/test-discover-city-locate.cjs` 已按新口径重写并通过（无 key 走离线表、境外 `NO_CITY`、在线成功/缓存、直辖市省份兜底、`121`/`311`/空 `ad_info` 三类降级回落、降级结果短 TTL 缓存、key 不出现在任何返回字段），`node --check` 与 `test-discover-market-view.cjs`、`test-public-event-card-display.cjs` 回归通过。
- 边界：离线表只做城市级结论，不返回省/区（页面只用城市名做同城排序，不影响展示）；县级市（如喀什市、延吉市）会就近归到所属地级市/州，与球队资料登记的县级市名称可能不同名，此时该用户同城标不亮、但赛事仍全量展示。

## 10. 小程序 1.2.39 上传（2026-11-04，已上传成功）与两处卡点修复

本轮上传连续失败两次，均为构建侧问题，不是体积问题（主包上传口径 1938.0 KB / 2048 KB，余量 110 KB）。

- 卡点一：`EMFILE: too many open files`。以仓库根目录 `E:\Documents\sxf-football` 作为上传项目时，开发者工具会扫描整个仓库（`desktop-windows/release/win-unpacked/resources/app.asar`、`cloudfunctions`、`web-admin-vue` 等），文件句柄耗尽后 CLI 长时间停在 `- Upload` 不返回，日志里伴随 `Invalid package ... desktop-windows\release\win-unpacked\resources\app.asar`。
  - 修复：新增 `tools/prepare-miniprogram-upload.cjs`，把 `project.config.json` + `project.miniapp.json` + `miniprogram/` 复制到独立暂存目录（默认 `%TEMP%\sxf-miniprogram-upload`，本次 `E:\Documents\_sxf-upload-1239`）后再上传。`packOptions.ignore` 的 value 相对 `miniprogramRoot`，暂存目录内口径与仓库根上传完全一致（792 个文件 / 5.7 MB）。
- 卡点二：`WXML file not found: ./pages/referee/record.wxml`。瘦身时对 IDE 自动生成的占位页 `pages/referee/verify.*`、`pages/referee/record.*` 只忽略了 `.js` + `.wxml`，留下了 `.json`；开发者工具把残留的 `.json` 当成页面，要求同名 WXML，于是编译直接失败。
  - 修复：`project.config.json` 补齐 `pages/referee/verify.json`、`pages/referee/record.json` 两条忽略（整页忽略）。
  - 防复发：`tools/check-miniprogram-package-size.cjs` 新增「页面文件只忽略了一部分」校验——同一 basename 的 `.js/.json/.wxml/.wxss` 只忽略其中一部分即报错并返回非 0。
- 上传结果（`cli.bat upload --project E:\Documents\_sxf-upload-1239 --version 1.2.39`）：`✔ upload` 成功，工具回读 `TOTAL 5,593,818 B (5.3 MB)`，`main 1,980,642 B (1.9 MB)`；分包 `packageCard 1,429,631 B`、`pages/team 897,036 B`、`pages/tournament 537,722 B`、`packageDiscover 392,496 B`、`pages/match 153,341 B`、`packageA 50,324 B`、`pages/referee 41,559 B`、`pages/service 33,804 B`、`pages/roster-change 20,031 B`、`pages/guide 19,743 B`、`pages/todo 14,523 B`、`pages/workspace 12,397 B`、`pages/messages 10,569 B`。
- 复核：`node tools/check-miniprogram-package-size.cjs` 通过（主包 1938.0 KB、分包归属与页面文件齐全、无部分忽略）；暂存目录内 `pages/discover/discover.js` 与仓库源文件 SHA-256 一致（`546869B4…5D9D81`），上传内容为当前源码。
- 位置信息合规复核（2026-11-04 01:35）：全新网格坐标 `{"latitude":34.9,"longitude":113.3}` 返回 `source:"offline"`、`distanceKm:36.9`，**无 `degraded` / `upstreamCode` 字段**，说明当前未走在线路径（`TENCENT_LBS_KEY` 已不在环境变量里），坐标只在自有云函数内换算，不向第三方地图服务商外发——用户隐私保护指引可按「不与第三方共享」如实声明。

### 微信「用户隐私保护指引」位置信息填写口径（可直接粘贴）

- 收集的信息类型：位置信息（模糊位置，精度到城市/区县）。若后台把位置拆成「精确位置」「大致位置」两项，只勾选与 `wx.getFuzzyLocation` 对应的模糊/大致位置即可；`wx.chooseLocation` 属于用户主动选择的地点，随该类型一并声明。
- 使用目的：用于向你推荐所在城市的赛事并做同城排序，以及在你发起约球时生成比赛场地地址。
- 使用场景与触发时机：仅在打开「发现」页赛事栏时请求一次城市级模糊定位；仅在用户点击「选择场地」时打开地图选点并回填所选用地点。不后台持续定位。
- 必要性说明：赛事没有经纬度字段，只能靠用户当前城市判断同城，改用球队资料城市会失去同城识别能力；用户拒绝时回落球队资料登记城市，赛事仍全量展示。
- 第三方共享：不共享。坐标与城市在本小程序自有云函数内完成换算，不向第三方地图服务商、广告平台或其他第三方提供，也不用于用户画像或广告投放。
- 存储与期限：坐标不落库、不写用户资料；城市名仅缓存在用户手机本地（最长 12 小时），到期或手动「重新定位」时覆盖。
- 用户拒绝后的影响：只影响同城排序与「同城」标，不阻断浏览、报名和管理。

### 未做

- 体验版设置、提交审核与正式发布；真机三条路径（定位成功 / 拒绝授权 / 手动重新定位）待验证。
- 未提交、未推送（工作区仍混有其他会话在途改动）。
