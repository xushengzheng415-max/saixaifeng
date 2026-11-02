# 个人保单 PDF 上传与自动识别（本地完成，未部署）

日期：2026-10-30  
状态：**已由后续发布 supersede** → 见 `insurance-ops-h5-20261030.md` 与 `insurance-pass-gate-baidu-20261030.md`

## 用户口径

个人购买保险后，在服务号 H5「我的参赛资料」上传自己的保单 PDF；服务端自动识别姓名与保障期并与当前球员/赛事日期核对，本人确认后提交。不做保司真伪验真。

## 改动

| 文件 | 说明 |
|---|---|
| `cloudfunctions/webLoginApi/serviceInsurancePolicyParse.cjs` | 纯文本解析：姓名、保障期、保单号、`matchResult` |
| `cloudfunctions/webLoginApi/serviceInsurancePolicy.cjs` | 上传 PDF（≤3MB）、OCR（百度 `accurate_basic`/`general_basic` + `pdf_file`，凭据同裁判表 `BAIDU_REFEREE_OCR_*`；可选本地 `pdf-parse`）、确认写入 `tournament_player_qualifications` |
| `cloudfunctions/webLoginApi/servicePrivate.cjs` / `index.js` | 注册 `servicePrivateInsuranceUpload/Recognize/Confirm` |
| `cloudfunctions/webLoginApi/servicePersonalData.cjs` | 保险状态：未要求 / 待提交 / 已提交 / 待人工；`canUpload` |
| `service-account-h5/service-personal.js` | 参赛资料保险行上传面板；`PAGE_VERSION=v2.12` |
| `service-account-h5/service-personal-polish.css` / `me.html` | 样式与 `?v=20261030-insurance1` |

草稿集合：`tournament_player_insurance_drafts`（12 小时过期）。  
已提交且 `auto_matched` 不可覆盖；`needs_manual_review` 允许重传。

## 验证

```
node --check cloudfunctions/webLoginApi/serviceInsurancePolicyParse.cjs
node --check cloudfunctions/webLoginApi/serviceInsurancePolicy.cjs
node --check cloudfunctions/webLoginApi/servicePrivate.cjs
node --check cloudfunctions/webLoginApi/servicePersonalData.cjs
node --check service-account-h5/service-personal.js
node tools/test-insurance-policy-parse.cjs   → PASS
```

## 发布（待授权）

1. `webLoginApi` 以线上下载包差量覆盖上述模块与入口，回下载 SHA-256 比对；确认 OCR 凭据可用。  
2. H5 正式 + `preview/service-account-h5/` 同步 `me.html`、`service-personal.js`、`service-personal-polish.css`。  
3. 真机：要求保险的组别 → 上传 PDF → 看识别结果 → 确认提交 → 参赛资料状态更新。
