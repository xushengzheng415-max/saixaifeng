# 我的球员卡 · 会员专属背景文案（2026-10-31）

> 用户确认：「我的球员卡里，成为会员后可更换会员专属背景。」本轮只对齐权益文案与页面提示；会员专属背景素材库仍未上线，不假装可换卡面。与 100 分换照片/等级默认背景分流。

## 改动

| 位置 | 内容 |
|---|---|
| `webLoginApi/membership.cjs` | 权益名 `卡面背景库` → `会员专属背景`；detail=`成为会员后可在「我的球员卡」更换`；`open:false` |
| `service-personal.js` v2.15 | mock 同步；权益 pending 展示 detail +「即将上线」；开通 CTA 增加「会员专属背景」 |
| `player-cards.html/js` | 主卡下提示「成为会员后可更换会员专属背景 · 去开通」 |
| `i18n-fixed-en.js` | 固定英文对照 |

## 发布与回读

- 正式 / 测试 H5：`service-personal.js` 100851 B / `1AA1EAEED37F…` MATCH；`player-cards.js` 19105 B MATCH；`player-cards.html` 8127 B MATCH；`i18n-fixed-en.js` 6279 B MATCH
- `webLoginApi`：线上包差量只改 `membership.cjs`；`check-referee-backend-package` PASS 后 `fn code update` 成功

## 未做

- 未开放真正换卡面背景库、未改 `canChangeBackground` / 100 分门槛
