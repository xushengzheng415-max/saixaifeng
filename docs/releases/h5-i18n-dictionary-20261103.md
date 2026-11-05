# 服务号 H5 英文改由人工字典提供（2026-11-03）

> 用户选择方案 B：英文界面文案改由 `service-account-h5/i18n-fixed-en.js` 的人工字典提供，不再依赖百度翻译接口。
> 承接同日「H5 右上角中英文按钮自闪修复」（`docs/releases/h5-i18n-toggle-flash-20261103.md`）。

## 1. 用户现象

点击右上角「EN」后，按钮文案变成「中文」，页面内容仍是中文，等于没有任何反应。

## 2. 根因（两条独立缺陷）

1. **生产没有翻译服务**：`POST webLoginApi {"action":"translateUi"}` 实测返回
   `{"success":false,"code":"TRANSLATE_NOT_CONFIGURED","error":"翻译服务尚未配置"}`，
   即 CloudBase 生产环境未配置 `BAIDU_TRANSLATE_*`。上一轮修复只做到「失败不再循环重试」，所以按钮不再闪、但也不会变英文。
2. **人工字典脚本解析失败**：`service-account-h5/i18n-fixed-en.js` 第 96 行把三条词条写成了带字面 `\n` 转义的一行
   （`'卡世界': 'Card World',\n    '赛小蜂足球世界': … \n    '足球世界': …`），整份脚本语法错误，
   `window.SXF_I18N_FIXED_EN` 从未生成。运行时 `FIXED` 恒为空对象，点击 EN 只能走「送百度翻译」这条必败路径，
   因此看起来「有中英文按钮但没反应」。

## 3. 改动

### 3.1 `service-account-h5/i18n-fixed-en.js`（27,542 B / 457 词条）

- 修复第 96 行的字面 `\n`，恢复为三条独立词条（这是英文一直不生效的直接原因）。
- 按方案 B 在字典前声明：
  - `SXF_I18N_MACHINE_ENABLED = false`（机器翻译默认关闭；以后配好百度密钥改成 `true` 即恢复兜底）；
  - `SXF_I18N_KEEP_ZH`：`确认使用`、`确认并提交登记`、`球员卡已确认`、`保存并提升身价`、`需人工核验`、`已认领`、`联赛组`。
    这些字符串被页面脚本用 `===` 比较（`registration-idcheck.js` 确认按钮文案、`service-entry.js` 认领状态与身价按钮），翻译会破坏逻辑。
- 补齐登记主流程约 200 条：`球员登记`→`Player Registration`、`查找球员`→`Find player`、
  `未找到，可新建球员`→`Not found. You can create a new player`、`未找到本队档案`→`No record in this team`、
  `继续登记入口`→`Continue registration link`、`球员卡待确认`→`Player card pending confirmation`、
  表单字段、AI 头像/蜂蜜扣费面板、PC 卡弹窗、支付与会员原因提示等。
- 有意排除：在职球员姓名、姓氏列表、数据驱动状态文案（人名不音译，见 `PRODUCT_RULES.md` 国籍/姓名词条边界）。

### 3.2 `service-account-h5/i18n-runtime.js`（16,609 B）

在自闪修复版本上补字典优先逻辑：

- `KEEP_ZH` 清单：`collect()` 不收集、`applyOne()` 不写入被比较的状态中文字符串。
- `queueFlush()` 先应用字典命中项（不再送翻译），再计算 `need`；`!machineEnabled || autoPaused` 时不发请求，
  字典照常生效——即没有翻译服务也能英文化。
- `schedule()` 在 `autoPaused` 下不再提前返回（字典仍可应用，只是不发请求）。
- 其余自闪修复（`quietWrite`、`isToggleTarget`、失败暂停、8 秒超时、按钮 `data-i18n-skip`）保持不变。

### 3.3 页面令牌

14 个 H5 页面统一把 `i18n-fixed-en.js?v=` 与 `i18n-runtime.js?v=` 升到 `20261103-dict1`
（原为 `20261031-fixed1` / `20261031-world1` / `20261101-entop1`），覆盖
`ai-portrait-demo`、`claim-team`、`data-center`、`index`、`join-player`、`me`、`player-card-game`、
`player-card-game-demo`、`player-cards`、`registration-ai-test`、`registration-resume`、`self-register`、
`tournament-center`、`valuation-self-test`。

**发布方式（防回退）**：14 个入口仍按「线上现有内容 + 只改 i18n 令牌两行」逐文件重建后上传，
未把仓库里其它会话的在途改动带上线；两个脚本文件按仓库版本上传（本轮唯一改动源）。

## 4. 验证

### 4.1 `tools/test-h5-i18n-toggle.cjs`（6 项全 PASS）

1. 人工字典生效：页面切 EN 后 `h1`=`Player Registration`、`#status`=`Verifying WeChat identity…`、
   `#find`=`Find player`、`#content p`=`Not found. You can create a new player`；`translateUi` 请求 **0** 次；
   `dictCount=457`、`machine=false`；状态词 `#keep` 仍为 `确认使用`；字典外文案 `#unknown` 仍为 `今天天气不错`。
2. 动态新增内容走字典且不再请求。
3. 用户点击切换：EN 套字典、切回中文完整还原。
4. 机器翻译开启时（`SXF_I18N_MACHINE_ENABLED=true`）字典外文案才走接口，字典命中项仍优先。
5. 翻译服务未配置时只尝试一次、按钮不再闪，暂停后字典仍生效。
6. 网络连续失败最多自动重试 3 次。

### 4.2 线上 headless 实测（正式与测试端 `join-player.html`）

`{"title":"Player Registration","link":"Continue registration link","status":"Open this page from the registration link sent by the service account","translateRequests":0,"dictCount":457,"machine":false}`

页面在 `localStorage.sxf_h5_lang='en'` 下直接呈现英文，无任何 `translateUi` 请求；按钮停在「中文」（可切回）。
`registration-resume.html`、`index.html` 在非微信浏览器里会先跳 `open.weixin.qq.com` 授权页，headless 无法停留，仍按同一份脚本生效。

## 5. 发布与读回

### 5.1 正式 `/service-account-h5/`（全部 `Cache-Control: no-cache` 回读）

| 文件 | 大小 | SHA-256 |
|---|---|---|
| `i18n-runtime.js` | 16,609 B | `5D6831F931A373763F75F2697C8D776523F07CD320EF8AD9E2A11509D924A205` |
| `i18n-fixed-en.js` | 27,542 B | `25604750D473919AB843410A23A74F6147756DF66170E1926B3AF531D69E38FB` |
| `ai-portrait-demo.html` | 61,771 B | `2BA74A6E0CA8AD4D89C5156BDBC0901695C2511F8CC9FDEEFA9B67EE75A84B44` |
| `claim-team.html` | 679 B | `41085D1C47BDD83623D377FCD1EBC819D87BDB744C4B0F6A2E4AEB1330D3A601` |
| `data-center.html` | 999 B | `6C925795CAAA8ACAA0156C8EF08754263A67F4108F403EC04427744F2A0AF5D0` |
| `index.html` | 6,313 B | `64B1F3976C435C9E798927B19C3F1A42D218176B7D1AA79D2F1B6CA67D7B722E` |
| `join-player.html` | 1,172 B | `D9400587AFADD3C656D3B01A9B99FB853E34B282835A17D258473A5086319F9B` |
| `me.html` | 1,204 B | `A4714D08A9D0178F62B2DBA0F4B2A35E2C4FB573211CD98D861D39FAC5418170` |
| `player-card-game.html` | 806 B | `99A422FEE98DE6065269492302DCC5E3D43AF1C8C272CBDA08E3C2256DA8BFF9` |
| `player-card-game-demo.html` | 30,370 B | `26D4D6131DA2B3B3D54F56503037EEBC87DC3596E79E37A11237B31DEC0FB143` |
| `player-cards.html` | 8,127 B | `CDFA84169F58CA519C5E5D7102E25B835C493163CE65DFE978A352709E900FD6` |
| `registration-ai-test.html` | 6,745 B | `DCF5FF723460AB2852EF4E4A8855CCB1E7E96E0C8BABE49419C46DE988C73790` |
| `registration-resume.html` | 857 B | `7AFCC6B378083EF1E352A5ABF9EA571588D242B3FC2D8793E6158BB73BAFEDFF` |
| `self-register.html` | 1,616 B | `0A503691696C4A9B7E39DB928F5486690EA969027D9A9824B8902F79A584D403` |
| `tournament-center.html` | 4,324 B | `B175A9DA8A822A437862069615C0031F028F66151E7A2976B3D59BC24033E392` |
| `valuation-self-test.html` | 34,024 B | `58A5D87214BC10A691907D2133DA43D61DE765303E35C7F3DF4B6F964BED6614` |

逐页令牌回读：14 个页面 `i18n-runtime.js?v=` 与 `i18n-fixed-en.js?v=` 均为 `20261103-dict1`。

**并发说明**：`claim-team.html`（679 B）、`join-player.html`（1,172 B）、`registration-resume.html`（857 B）
与本轮上传的基线（678 / 1,171 / 852 B）差 1～5 B，逐行比对确认差异只来自另一会话同日更新的脚本令牌
（`service-entry.js` `20261030-donepage2`→`20261103-memberpay1`、`registration-resume.js` `20261103-gate1`→`20261103-memberpay1`），
我们的 `20261103-dict1` 令牌在三个页面均完整保留，未覆盖对方改动。

`data-center`、`index`、`me`、`player-cards`、`tournament-center` 的**线上正文**仍比仓库副本新（线上原为 `20261101-entop1` 版本），
本轮只改令牌行；后续再改这 5 页必须先从线上包取基线差量修改。

### 5.2 测试端 `/preview/service-account-h5/`

- `i18n-runtime.js`、`i18n-fixed-en.js` 与正式同哈希（16,609 B / 27,542 B，回读 MATCH）。
- `join-player.html`、`claim-team.html`、`registration-resume.html` 已为 `dict1` 版本（与正式同内容）。
- 本轮追加：`data-center.html`、`me.html` 从测试端线上内容重建、仅改两行 i18n 令牌（`entop1/fixed1`、`entop1/world1` → `dict1`），
  上传 2 个文件并回读令牌为 `dict1`。
- 测试端历史副本口径差异（本次未改，需知悉）：`index`、`player-cards`、`tournament-center`、`ai-portrait-demo`、
  `registration-ai-test` 的测试端副本本身**不含 i18n 脚本**（更早的旧快照）；`player-card-game`、`player-card-game-demo`、
  `self-register`、`valuation-self-test` 在测试端不存在（HTTP 404）。这几个页面在测试端从来就没有语言按钮，不属于本次改动范围。

## 6. 回退

- 把 `i18n-fixed-en.js` 回退为上一版（六条词条 + 无 `KEEP_ZH`/无开关）并保留线上 12,354 B 基线 `i18n-runtime.js`，
  即可回到「点 EN 必失败、页面保持中文」的状态；14 个页面令牌改回 `20261031-fixed1` / `20261101-entop1`。
- 建议不要回退 `i18n-runtime.js` 的自闪修复部分，否则按钮会重新自闪。

## 7. 仍未做

- `webLoginApi` 的百度翻译密钥仍未配置；如需把机器翻译作为字典未命中文案的兜底，须单独授权配置 `BAIDU_TRANSLATE_*`
  并把 `SXF_I18N_MACHINE_ENABLED` 置 `true`。
- 未提交、未推送 Git（本地工作区还包含其它会话在途改动）。
