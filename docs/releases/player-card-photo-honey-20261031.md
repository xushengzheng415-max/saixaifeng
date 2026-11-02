# 球员卡换照片蜂蜜付费 · 2026-10-31

> 用户确认：满 100 分仍免费换照片；未满 100 分每次成功换照片消耗 100 滴蜂蜜；会员只解锁换背景，不豁免换照片。

## 源码改动

| 位置 | 内容 |
|---|---|
| `webLoginApi/playerCards.cjs` | `PHOTO_REPLACE_HONEY_COST`、env 覆盖、`photoReplaceRequired`、`saveMyPlayerCard` 扣费/退回、`photoReplace` 摘要 |
| `webLoginApi/servicePersonalAccount.cjs` | 流水 reason 中文标签 |
| `service-account-h5/player-cards.js` | `PLAYER_CARD_PHOTO_PAY_REQUIRED` 确认重试、提示文案 |
| `service-account-h5/app.js` | 登记保存路径同上确认 |
| `tools/test-player-card-entitlement.cjs` | 99 分付费换照片、会员背景 |
| `docs/PRODUCT_RULES.md`、`docs/data-center/PLAYER_CARD_POINTS.md`、`docs/ADR.md` | 产品规则与权益表 |

## 校验

- `node --check cloudfunctions/webLoginApi/playerCards.cjs`
- `node --check cloudfunctions/webLoginApi/servicePersonalAccount.cjs`
- `node tools/test-player-card-entitlement.cjs`
- `node tools/check-referee-backend-package.cjs <webLoginApi 发布包>` → PASS

## 发布

- `webLoginApi`：线上下载差量 → 替换 `playerCards.cjs`、`servicePersonalAccount.cjs` → check → `fn code update` → 回下载核对 `photoReplaceRequired` / `player-card-photo-replace`
- H5 正式与 `preview/service-account-h5/`：`player-cards.js`、`app.js`（登记路径）差量 → hosting 单文件 → HTTP SHA MATCH

## 发布回读（2026-10-31）

| 目标 | 文件 | SHA-256 | 比对 |
|---|---|---|---|
| webLoginApi 回下载 | `playerCards.cjs` | `40C2066DC93A442F75EF3069E05043D81FD5A9709CE42E77F38312FD83C63657` | 含 `photoReplaceRequired` / `player-card-photo-replace` |
| webLoginApi 回下载 | `servicePersonalAccount.cjs` | `2887C521C1C1BBA440A1524AD44A961E3381409FF4A2E287460FFCEDBC4543ED` | 含流水中文标签 |
| 正式 + 测试 H5 | `player-cards.js` | `065E59FE8C271A737A693244806158D959CA8E8F8AF61F8849AA99449E464E46` | MATCH（`www.sxffootball.cn` no-cache） |
| 正式 + 测试 H5 | `player-cards.html` | `AA52614063F90CCAA73F3E32B98C312044623C8C44D60A2A408139C0F2D1609F` | MATCH |
| 正式 + 测试 H5 | `app.js` | `5B1163797FBF9EA5DADFC4D6A817A312D3E408AACE6738506404F705F0275FD0` | MATCH |

H5 自线上下载差量 patch（`work/h5-photo-honey-20261031/deploy`），未覆盖工作区其他未发布文件。`player-cards.html` 缓存串 `member-bg2` → `photo-honey1`。
