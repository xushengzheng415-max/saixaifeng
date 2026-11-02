# 保险出证门槛 + 百度 OCR/安诚解析 + H5 美化发布（2026-10-30）

## 授权

用户确认「要求保险 ⇒ 未交保单不出参赛证」，并指示「按照你的计划走」发布。

## 本轮差量

| 目标 | 内容 |
|---|---|
| `webLoginApi` | `serviceInsurancePolicy.cjs`（百度 OCR）、`serviceInsurancePolicyParse.cjs`（安诚样例字段）、`servicePersonalData.cjs`（出证门槛） |
| H5 正式/测试 | `me.html` / `service-personal.js` / `service-personal-polish.css`（`?v=20261030-ins5`） |

未整包覆盖；`index.js` / `servicePrivate.cjs` 沿用线上已含保险 action 的基线。未发布主办方 PC `/admin/`（规程向导文案属 preview 流程）。

## 回读

### webLoginApi

- 基线：`fn code download` → 仅覆盖上述 3 文件；`check-referee-backend-package` PASS。
- 回下载：3 文件 `SAME=True`（`6A4CD6F20118` / `4B68E240B5A9` / `9BC01E302D36`）。
- 线上含 `insurancePassOk`、`PLAYER_INSURANCE_REQUIRED`。
- `fn detail`：`Status=Active`，`AvailableStatus=Available`，`Runtime=Nodejs18.15`，内存 512，超时 120，`InstallDependency=TRUE`，`ModTime=2026-10-30 21:26:19`。

### H5

| URL | HTTP | MATCH |
|---|---|---|
| `https://www.sxffootball.cn/service-account-h5/me.html` | 200 | True（`B9BBC58C90E5`） |
| `…/service-personal.js` | 200 | True（`4F413FAB30F6`，99737 B） |
| `…/service-personal-polish.css` | 200 | True（`EC6BE05964F2`，38859 B） |
| `preview/service-account-h5/` 同上三文件 | 200 | True |

## 投保链接

全局购买外链请在平台运营后台「赛事保险」保存（安澜链接已提供）。本轮未写库。

## 真机验收

1. 组别打开「意外保险」→ 未交保单时电子参赛证提示「需先提交本赛事保险资料」。
2. 上传安诚类 PDF → 识别保单号/保障期/险种 → 确认提交后可出证。
3. 「去购买保险」跳转外链；点击只记意向。
