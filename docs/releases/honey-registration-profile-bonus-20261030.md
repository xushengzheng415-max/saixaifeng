# 蜂蜜注册 10 滴 + 补全资料 50 滴（2026-10-30）

> 授权：用户明确「授权部署 webLoginApi + getMiniWorkspace」。

## 规则
- 首次开通蜂蜜账户：10 滴（`fan-registration-bonus`，替代旧 100）
- 球员档案首次 `profileStatus=complete` 且有标准形象照：50 滴（`player-profile-complete-bonus`，按 playerId 幂等）
- 不补发存量；奖励失败不阻断登记

## 发布
- 基线：线上包差量 `work/online-webLoginApi-20261030-2345` / `work/online-getMiniWorkspace-20261030-2345`
- `webLoginApi`：覆盖 `honeyBonus.cjs`、`fanCenter.cjs`、`servicePersonalAccount.cjs`，并对线上 `index.js` 仅插入补全资料奖励（保留 `servicePrivateInsurancePurchaseClick`）
- `getMiniWorkspace`：覆盖 `honeyBonus.cjs`、`playerRegistration.cjs`
- 预检：`check-referee-backend-package` PASS
- 回下载哈希一致；`fn detail` 均为 Active（webLoginApi ModTime 2026-10-31 00:12:41；getMiniWorkspace 00:13:20），Runtime Nodejs18.15，InstallDependency=TRUE，配置未改

