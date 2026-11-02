# 服务号「我的参赛」参赛资料与电子参赛证发布记录（2026-10-30）

> 需求原文：「在我的里面参赛的时候，一定要有一个我的参赛资料跟我的电子参赛证，这都需要去做的。」
> 授权：用户 2026-10-30 在发布方式选择中明确「现在发布正式（推荐）」，授权范围为 `webLoginApi` 差量发布 + H5 正式端与测试端同步。

## 一、需求口径

- 「我的」页（`service-account-h5/me.html`）在用户存在参赛关系时必须同时给出两个入口：**我的参赛资料**、**我的电子参赛证**，两者都要可点开看真实数据，不做占位页。
- 参赛资料：按人（本人或受监护球员）展示赛事/组别/球队、报名状态、名单状态、资料项完成度（姓名、出生日期、证件信息、形象照、球衣号、人证核验、保险资料）与不可用原因。
- 电子参赛证：按 `docs/PRODUCT_RULES.md` 807 / 816 / 817 画证件卡面。
  - 青少年（816）：现场不扫码，卡面只显示「按名单核验」，由助理裁判按照片逐人核验。
  - 成人（817）：实名后长期电子参赛证；**本场签名二维码在阵容确认后由球队端生成**，H5 只做长期证件卡面与说明，**不伪造二维码**，也不复制小程序 `getMiniWorkspace` 的 `adultElectronicPass` 口径。
  - 未通过人证核验 / 未进入正式名单（807）：卡面置灰、不出证号，并给出原因。

## 二、后端改动（`cloudfunctions/webLoginApi`）

### 2.1 `servicePersonalData.cjs` — 新增 `servicePrivateParticipation`

- 只在服务号私有会话鉴权通过后可用（鉴权在 `servicePrivate.cjs` 内，接口本身不信任浏览器传来的账号/手机号/机构）。
- `playerFields` 扩展：`gender,birthDate,birthday,idCard,identityMasked,position,profileStatus,registrantType,participantType,organizerReviewStatus,organizerReviewReason`。
- 退出名单口径补齐 `withdrawn`、`invite_cancelled`：
  ```js
  const removed=new Set(['archived','deleted','removed','replaced','cancelled','canceled','withdrawn','invite_cancelled'])
  ```
- 新增 `participations()` 及辅助函数 `stamp/lower/ownValue/readBool/requirementsFor/rosterPlayerIds/ageAt/maskIdentity/registrationState/optionalRead`。
- 状态机（单一来源，前端不重复判定）：
  ```js
  const APPROVED_REG=new Set(['approved','confirmed','accepted','claimed','active'])
  const REJECTED_REG=new Set(['rejected','failed','invalid','cancelled','canceled','withdrawn','removed','deleted'])
  const LISTED_ROSTER=new Set(['approved','locked'])
  ```
  ```js
  let stateValue='registration_pending'
  if(review==='rejected')stateValue='rejected'
  else if(listed){ if(LISTED_ROSTER.has(rosterStatus))stateValue='approved'
    else if(rosterStatus==='returned')stateValue='returned'
    else stateValue='reviewing' }
  else if(snapshot&&rosterStatus==='returned')stateValue='returned'
  else if(snapshot)stateValue='not_listed'
  else if(APPROVED_REG.has(registrationState(registration)))stateValue='registered'
  else if(REJECTED_REG.has(registrationState(registration)))stateValue='registration_rejected'
  ```
- 出证资格与模式：
  ```js
  const identityRequired=requirements.identityVerificationRequired||requirements.electronicPassVerificationRequired
  const passEligible=stateValue==='approved'&&(!identityRequired||identityVerified)
  const mode=age==null&&registrantType!=='guardian'?'unknown':(youth?'youth':'adult')
  ```
- 返回 `{success:true,data:{schemaVersion:'service-personal/3',items}}`；每项含 `state/stateText/stateTone/reason`、`materials`（7 项，含脱敏证件号）、`pass{eligible,stateText,mode,number,issuedAt,note}`。
- 路由：`if(action==='servicePrivateParticipation')return participations()`。

### 2.2 `servicePrivate.cjs` — action 白名单

第 173 行的私有动作白名单加入 `'servicePrivateParticipation'`，否则会被判 `SERVICE_PRIVATE_ACTION_INVALID`。

### 2.3 `index.js` — 顶层 action switch（本轮补漏，发布阻断点）

第一轮发布后线上探针 `servicePrivateParticipation` 仍返回 `未知操作`。根因：`index.js` 的 `switch(action)` 只枚举了已有私有动作，新 action 没有 `case`，请求根本到不了 `servicePrivate.cjs`。补：

```js
      case 'servicePrivateAccountData':
      // 我的参赛：参赛资料与电子参赛证（只读，鉴权在 servicePrivate 内）
      case 'servicePrivateParticipation':
      case 'servicePrivateRegistrationList':
```

## 三、H5 改动（`service-account-h5/`）

- `service-personal.js`
  - 修复本地预览开关从未生效的 bug（原用 `location.protocol+location.host` 拼出 `http:127.0.0.1:8899`，永远不匹配 → 本地 `?mock=1` 直接被跳微信授权）：改为 `location.origin` + `file:` 协议判定。
  - `state` 增加 `participation:null, participationKind:'profile'`；`mockResponse` 支持 `servicePrivateParticipation`。
  - `renderHome()` 在「我的比赛数据」后插入参赛区块，末尾 `loadParticipation(false)`。
  - 两个入口按钮：`data-action="homeParticipationProfile"` / `homeParticipationPass`，图标 `list.svg` / `shield.svg`。
  - 资料卡片：证件信息行加 `wide` 类占满整行（否则脱敏号在双列网格折行）。
  - 参赛证证号文案按模式区分，青少年不再误显示「开赛前生成」：
    ```js
    '<div class="pp-pass-line"><span>证号</span><b>'+esc(pass.number||(mode==='youth'?'按名单核验':pass.eligible?'开赛前生成':'—'))+'</b></div>'
    ```
  - 「正式名单」印章改为流内元素（原先 `position:absolute` 覆盖说明文字）。
  - 全局点击支持 `data-pp-player` 切换同一账号下多名球员。
- `service-personal-polish.css`：新增「我的参赛」整段样式（入口卡、球员切换、资料项网格、参赛证卡面、350px 媒体查询）。
- `me.html`：资源版本升 `?v=20261030-participation1`。

## 四、验证

| 检查 | 结果 |
|---|---|
| `node --check` `servicePersonalData.cjs` / `servicePrivate.cjs` / `index.js` / `service-personal.js` | 通过 |
| 本地 Playwright（390px 与 350px） | 主页「我的参赛」与两入口副标题正确；资料页两名球员卡片切换正常；参赛证成人态可出示并带印章、青少年态置灰且无二维码；`scrollWidth` 390 / 350 无横向溢出；无 console / pageerror |
| 无身份线上探针（发布前） | `servicePrivateParticipation` → `未知操作`（暴露 `index.js` 缺 case） |
| 无身份线上探针（补 `index.js` 后） | `servicePrivateParticipation` → `{"code":"SERVICE_PRIVATE_AUTH_REQUIRED"}`，鉴权在前、路由在线 |

未做：真实微信内端到端（需用户本人会话）；成人本场签名二维码（按 817 由球队端生成，H5 未复制）。

## 五、发布（2026-10-30）

### 5.1 第一轮：`servicePersonalData.cjs` + `servicePrivate.cjs`

- 基线：刚下载的线上包（6,613 文件），staging `%TEMP%\sxf-webLoginApi-publish-20261030`，只覆盖 2 个文件。
- `node tools/check-referee-backend-package.cjs <stage>` → `PASS`（含报名 Word 上传范围与裁判表完整性）。
- `fn code update webLoginApi --deployMode cos` 成功；回下载两文件 `SAME=True`。
- **但路由未打通**（见 §2.3），H5 功能此时实际不可用。

### 5.2 第二轮：补 `index.js`

- 基线：第一轮回读包 `%TEMP%\sxf-webLoginApi-readback-20261030`（6,613 文件），staging `%TEMP%\sxf-webLoginApi-publish2-20261030`。
- `git diff --no-index --stat` 对比基线与 staging：**仅 `index.js` 1 个文件 +2 行**，无其他会话改动夹带（本地 `index.js` 与线上基线哈希原本一致，`D36B39D3…`）。
- `node --check index.js` 通过；`check-referee-backend-package.cjs` → `PASS`。
- `fn code update` 成功；回下载（`%TEMP%\sxf-webLoginApi-readback2-20261030`）逐文件比对。

| 文件 | 大小 | SHA-256（线上=本地） |
|---|---|---|
| `servicePersonalData.cjs` | 22,302 B | `B762B5EE0B1BE9DF9858B5F3FA0A75B00B8A6AFAB447CFE9BA477789364D9311` |
| `servicePrivate.cjs` | 15,948 B | `190693824A226AC74965ECB41F707A3BD7C8C176C018ED0F6FEDB043B8347545` |
| `index.js` | 416,269 B | `804F65CF37178FE54673DF2A5A0BF9E6D57BF29157E7BA38026287A6C7B23F9D` |

- `fn detail --json` 回读：`Status=Active`、`AvailableStatus=Available`、`Runtime=Nodejs18.15`、`InstallDependency=TRUE`、`DeployMode=code`、`ModTime=2026-10-30 14:25:30`；运行配置未变（发布前后仅代码变化）。

### 5.3 H5 正式 + 测试端

单文件上传正式 `service-account-h5/` 与测试端 `preview/service-account-h5/`，两侧各 3 个文件全部成功。回读（`Cache-Control: no-cache` + `?v=check20261030`，字节 SHA-256 比对）：

| 文件 | 大小 | SHA-256 | 正式 | 测试 |
|---|---|---|---|---|
| `me.html` | 1,117 B | `4680F1DBAA0C2D812BC027C7D04813D8957275E2CB76821E67BF02E86F2F7BD7` | MATCH | MATCH |
| `service-personal.js` | 73,297 B | `7084B39C3FD15C1B8A1212DA7AC4C6417082DD55EC7B567CD557AA75EC99E0E0` | MATCH | MATCH |
| `service-personal-polish.css` | 24,282 B | `5C74BF1B2C7E253DB3416E3B0839A0623694C657BAFA775DA2879169737088B1` | MATCH | MATCH |

6/6 URL HTTP 200 且与本地一致；`me.html` 线上含 `participation1` 版本标记。云函数为共享正式后端，无独立测试副本，测试端 H5 与正式共用同一接口。

## 六、遗留

1. 真实微信端到端未验收：需用户本人打开 `me.html` 确认「我的参赛」两个入口的数据与卡面。
2. 成人本场签名二维码仍只在球队端生成（按 817）；若要在 H5 提供需另行确认是否复用 `getMiniWorkspace` 口径。
3. 历史遗留待拍板：报名同名校验判定口径、驳回通知模板 ID 与跳转落点。
4. 本轮改动尚未提交 Git（工作区存在其他会话未提交改动）。
