# 会员卡面背景解锁（OR 100 分）· 2026-10-31

> 用户确认：有效会员在「我的球员卡」可不达 100 分更换平台卡面背景；换照片仍须满 100 分。非会员换背景仍须 100 分。服务端叠加权益，不接受客户端自报。

## 源码改动

| 位置 | 内容 |
|---|---|
| `webLoginApi/membership.cjs` | `backgrounds` 权益 `open:true`；detail 区分已开通/未开通；导出 `isActiveMember` |
| `webLoginApi/playerCards.cjs` | `withMembershipBackground` 叠加 `canChangeBackground`；保存错误文案含「开通会员」 |
| `service-account-h5/player-cards.js` | 主卡提示「开通会员可不达 100 分更换卡面背景 · 去开通」 |
| `service-account-h5/service-personal.js` | `PAGE_VERSION=v2.16`；mock 权益 `backgrounds` 与线上一致 |
| `service-account-h5/i18n-fixed-en.js` | 新文案固定英文对照 |
| `docs/data-center/PLAYER_CARD_POINTS.md` | 背景 OR 会员、换照片仍 100 分 |
| `docs/ADR.md` | 决策记录更新 |
| `tools/test-player-card-entitlement.cjs` | 99 分 + 会员 → `canChangeBackground` |

## 校验

- `node --check cloudfunctions/webLoginApi/membership.cjs`
- `node --check cloudfunctions/webLoginApi/playerCards.cjs`
- `node tools/test-player-card-entitlement.cjs`
- `node tools/check-referee-backend-package.cjs <webLoginApi 发布包>` → PASS

## 发布

- `webLoginApi`：线上下载差量 → 替换 `membership.cjs`、`playerCards.cjs` → `fn code update` → 回下载核对 `isActiveMember` / `withMembershipBackground`
- H5 正式 `service-account-h5/` 与测试 `preview/service-account-h5/`：线上下载 `service-personal.js`、`player-cards.js`（及 `player-cards.html` 若需）差量 patch → `hosting deploy` 单文件 → HTTP 回读 SHA-256 MATCH

## 未做

- 会员专属背景素材库扩容、平台后台模板发布流程不变
- 小程序球员端（赛小蜂足球世界）未在本轮同步

## 发布回读（2026-10-31）

| 目标 | 文件 | 字节 | SHA-256 | 比对 |
|---|---|---:|---|---|
| 正式 H5 | `service-personal.js` | 100,846 | `29849C609134B9DCC5C7592BC017B6EC4C836F5281F54E930B23B04F6FB93FAE` | MATCH |
| 正式 H5 | `player-cards.js` | 19,110 | `68EE6389618619D1EA8CD229A4C7168952E6C12D8C890C7B6F879F5AF9FBCD34` | MATCH |
| 正式 H5 | `player-cards.html` | 8,127 | `B0478767CB737CC1775DBD701D938DEF155125BBB1D0F6EA5BA389D04372CF56` | MATCH |
| 正式 H5 | `i18n-fixed-en.js` | 6,608 | `3C6C4EC74F169F9DD271DACE53BD8EE22CF96512151F2AEDD5710223ADB4AF19` | MATCH |
| 测试 H5 | 同上四文件 | 同左 | 同左 | MATCH |
| webLoginApi 回下载 | `membership.cjs` | — | `6761C3AC25C97084D9000E626EE2D076AFBB18D4FA720C162CA02383FB7E782C` | 含 `isActiveMember` |
| webLoginApi 回下载 | `playerCards.cjs` | — | `F6902BFD6909E324184D34A39B2DF33628BAD5183020B0D284A85566153DF68B` | 含 `withMembershipBackground` |

H5 自线上下载差量 patch（`work/h5-publish-20261031`），未上传工作区整文件 `service-personal.js`（并行会话另有未发布改动）。`player-cards.html` 缓存串 `member-bg1` → `member-bg2`。
