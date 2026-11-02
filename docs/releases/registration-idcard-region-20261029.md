# 身份证前 6 位推算球员籍贯并默认国籍中国（2026-10-29）

状态：**已于 2026-10-30 差量发布 `getMiniWorkspace`**（回下载 MATCH，`ModTime=2026-10-30 19:14:01`），见 `registration-donepage-idcard-20261030.md`。未推 Git、未改数据库、不回填历史档案。

## 1. 用户指令

- 起因：用户反馈「他们填写这身份证信息，为什么他有很多信息在详情页没有识别，包括他的籍贯等等一些信息？」（附图：小程序球队端球员详情，「国籍／籍贯／惯用脚／监护人／监护关系」全部显示「待完善」，但资料状态显示「资料完整」）。
- 排查结论：`playerRegistration.cjs` 的 `idDetails()` 只解析出生日期与性别；登记字段白名单不含国籍/籍贯/惯用脚；`incomplete` 判据也不含这两项，所以既能显示「资料完整」又显示「待完善」。
- 决策：用户先排除 A1/A2 分叉，最终回复「A1」，即「用身份证前 6 位推算籍贯并默认国籍为中国；推算值即档案籍贯，可用于球员业务编号」。

## 2. 改动文件

| 文件 | 改动 |
|---|---|
| `cloudfunctions/getMiniWorkspace/idcardRegion.cjs`（新增） | 省级 34 项、地级 334 项、省直辖县级 22 项的行政区划表；`coreName()` 归一简称（去行政级别后缀与名尾族名）；`regionFor()` 在平台字典 `numbering-regions.json` 中按省市名**唯一**匹配出 `{provinceCode, cityLetter}`；`resolveNativePlace()` 返回 `{nativePlace, nativePlaceRegion?, nativePlaceSource:'id_card'}`，非身份证号返回 `null` |
| `cloudfunctions/getMiniWorkspace/playerRegistration.cjs` | `idDetails()` 合并推算结果；`data` 增加 `nationality:'中国'`（档案已有国籍优先）；认领补齐时保留档案已有 `nativePlace`/`nativePlaceRegion`/`nativePlaceSource`/`nationality`，不被推算值覆盖 |
| `tools/test-idcard-region.cjs`（新增） | 14 条定点断言 + 全量地级码覆盖检查 |
| `tools/test-player-registration.cjs` | 追加 3 组断言：空档案按身份证补籍贯并自动发号 `P104A…`；档案已有籍贯保留且编号仍为 `P226A…`；国籍默认值 |
| `docs/PRODUCT_RULES.md`、`docs/data-center/NUMBERING_RULES.md`、`docs/ADR.md`、`docs/CURRENT_STATUS.md` | 登记口径并说明替代关系 |

## 3. 口径细节

- 只展开到地级，直辖市展开到市（`110101…` → 北京市），区县名不进入籍贯文本。
- 省直辖县级行政区按前 6 位区分（济源 `419001`、仙桃 `429004`、石河子 `659001` 等），避免全部落到同一个 `xx90` 地级码。
- 平台字典未收录或同名歧义只写文字籍贯、不生成结构化地区：西藏 6 个地级码、三沙、桂林（字典中桂林同时有 `C` 与 `H` 两个城市字母）共 9 个，编号仍保留 `region_required`，不选邻近城市凑号。
- 台湾/香港/澳门/境外（`71/81/82/91`）只写文字籍贯。
- 替代 2026-10-23「球员籍贯不能用身份证地址替代」口径；仍禁止用球队所在地、现居地、手机号冒充籍贯。
- 不推算未采集项：惯用脚、监护人姓名与监护关系仍按原规则补齐，本次未改。

## 4. 验证结果

```
node --check cloudfunctions/getMiniWorkspace/idcardRegion.cjs   → 通过
node --check cloudfunctions/getMiniWorkspace/playerRegistration.cjs → 通过
node tools/test-idcard-region.cjs      → PASS（334 个地级码，未收录 9 个）
node tools/test-player-registration.cjs → PASS（含新增籍贯/国籍/发号断言）
```

定点结果抽样：`410102…` → 河南省郑州市 + `226A`；`110101…` → 北京市 + `104A`；`659001…` → 新疆维吾尔自治区石河子市 + `223C`；`419001…` → 河南省济源市 + `226U`；`450303…` → 广西壮族自治区桂林市（无结构化地区）。

## 5. 影响面

- 详情页：`getMiniWorkspace` 详情的 `nationality` 与 `hometown`（`hometown || nativePlace`）从此有值，小程序球队端不再显示「待完善」。
- 永久编号：此前 H5 登记因 `NUMBERING_REGION_REQUIRED` 无法发号，现在提交即由 `afterWrite` 发号，例如北京市籍贯得到 `P104A00000001` 形态的编号。测试用内存库验证过。
- 球员卡：`nationality` 有值后国旗徽标可正常渲染。
- **不回填历史档案**：已入库玩家不会被批量改写，需重提或人工补录。

## 6. 未完成

- 未部署 `getMiniWorkspace`；按规则部署需当前任务明确授权，且须以最新线上下载包为基线差量修改、发布后回下载比对。
- 惯用脚仍无任何写入点；监护人对成年球员显示「待完善」的文案问题未处理（需另行确认口径）。
- 资料完整度判据（`index.js:1379`）未纳入国籍/籍贯，本次不改。
