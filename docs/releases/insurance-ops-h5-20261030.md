# 赛事保险：H5 上传入口 + 平台运营统计（2026-10-30）

## 口径

- 保单由球员侧上传：成人本人，青少年监护人。
- 外链购买仅作投保引导，不走平台支付，点击不等于成交。
- 运营统计以已上传并确认的保单凭证为准；险种来自 OCR 文本标签。

## 发布授权

用户 2026-10-30 明确「授权」发布本轮保险相关改动（`webLoginApi`、`platformOwner`、服务号 H5 正式+测试、平台运营后台正式）。

源码提交：`a049411e`（`codex/platform-ops`，仅保险相关文件；未推送远端）。

## 正式结果

### `webLoginApi`（共享正式后端）

- 基线：刚下载线上包；差量 5 文件：`index.js`（补 `AdultMatchPass` + 4 个保险 case）、`serviceInsurancePolicy.cjs`、`serviceInsurancePolicyParse.cjs`、`servicePersonalData.cjs`、`servicePrivate.cjs`。
- `check-referee-backend-package` → PASS。
- `fn code update --deployMode cos` 成功；回下载 5 文件 `SAME`。
- `fn detail`：`Active` / `Available` / `Nodejs18.15` / 内存 512 / 超时 120 / `InstallDependency=TRUE` / `ModTime=2026-10-30 20:36:23`。

### `platformOwner`（共享正式后端）

- 基线：刚下载线上包；差量：新增 `insuranceOps.cjs`，`index.js` 仅追加保险 4 个 action。
- 回下载：`index.js` / `insuranceOps.cjs` / `membershipPlans.cjs` 均 `SAME`。
- `fn detail`：`Active` / `Available` / `InstallDependency=TRUE` / `ModTime=2026-10-30 20:39:58`。

### 服务号 H5 正式 + 测试

单文件上传 `me.html`、`service-personal.js`、`service-personal-polish.css` →  
`service-account-h5/` 与 `preview/service-account-h5/`。

| 文件 | 大小 | SHA-256 前缀 | 正式 | 测试 |
|---|---|---|---|---|
| `me.html` | 1097 | `E6B605C563C0` | MATCH | MATCH |
| `service-personal.js` | 96825 | `589E0B220D8D` | MATCH | MATCH |
| `service-personal-polish.css` | 33548 | `FC84FB3C8EC9` | MATCH | MATCH |

入口：`https://www.sxffootball.cn/service-account-h5/me.html`（`?v=20261030-ins2`）。

### 平台运营后台

- `npm run deploy` → release `20261030124250-a049411e`，45 文件摘要一致。
- 线上 `https://pingtai.sxffootball.cn/release.json` 已回读同 commit/release。
- 营销导航「赛事保险」：投保引导链接配置 + 保单统计。

## 真机待验收

1. 要求保险的组别：监护人/本人上传 PDF → 识别 → 确认。  
2. 平台后台打开「赛事保险」看统计与保存购买链接。  
3. 点购买链接后应有意向点击记录（非成交）。
