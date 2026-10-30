# 赛事保险：H5 上传入口 + 平台运营统计（2026-10-30）

## 口径（已写入 PRODUCT_RULES / ADR）

- 保单由球员侧上传：成人本人，青少年监护人。
- 外链购买仅作投保引导，不走平台支付，点击不等于成交。
- 运营统计以已上传并确认的保单凭证为准；险种来自 OCR 文本标签。

## 本轮实现（本地，未部署）

### 服务号 H5「我的」

- 参赛区新增「赛事保险资料」入口。
- 参赛资料 / 电子参赛证保险条：可配置「去购买保险」+「上传保单」。
- 复用既有 `servicePrivateInsuranceUpload/Recognize/Confirm`；新增 `servicePrivateInsurancePurchaseClick` 记外链意向。
- `purchaseUrl` 优先赛事/组别字段，否则读平台配置 `platform_settings/insurance-purchase`。

### 平台运营后台

- 营销导航新增「赛事保险」页：`InsuranceAdmin.vue`。
- `platformOwner` 新动作：`insuranceOverview` / `insuranceSubmissionList` / `insurancePurchaseLinkGet` / `insurancePurchaseLinkSave`。
- 展示：已交保单、自动核对、待人工核对、外链点击、险种分布、赛事分布、明细列表；可配置全局投保引导链接。

### OCR

- 保单 OCR 使用**百度云**（与裁判表同一应用：`BAIDU_REFEREE_OCR_API_KEY` / `BAIDU_REFEREE_OCR_SECRET_KEY`；可选用 `BAIDU_INSURANCE_OCR_*` 覆盖）。
- PDF 走 `accurate_basic`（失败回退 `general_basic`）的 `pdf_file` / `pdf_file_num`，限前 3 页并带月额度护栏；不写腾讯云 OCR。
- `serviceInsurancePolicyParse` 增加 `productType`（险种）提取并随确认写入资格记录。

## 未做

- 未部署 `webLoginApi` / `platformOwner` / H5 / 平台后台。
- 未对接保司成交回调；不以跳转当成交。
