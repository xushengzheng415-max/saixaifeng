# 形象照上传超限修复发布（2026-10-19）

## 问题

真机反馈：球员登记页选完照片后，弹出「球员卡预览」弹窗，卡面区域空白并显示：

> Exceed max request payload size. For more information, please refer to https://docs.cloudbase.net/error-code/service/EXCEED_MAX_PAYLOAD_SIZE

## 原因

`serviceEntryUploadPhoto` 把形象照以 **base64 放进 JSON** 上传，而云开发 HTTP 访问服务对**文本类型请求体**（`application/json`）的上限是 **102400 字节**（官方错误码文档：文本类型 100KB，非文本 6MB）。

客户端原来固定压到「最长边 800px / JPEG 质量 0.85」，一张普通手机人像经 base64 膨胀后通常 150–300KB，**必然超过 100KB**，请求在网关层就被 413 拒绝，函数根本没执行。

实测确认（对 `webLoginApi` 发无效 action + 填充串，无副作用）：

| 请求体 | 结果 |
|---|---|
| 98335 / 101407 字节 | HTTP 200（进入函数，返回「未知操作」） |
| 102431 字节及以上 | HTTP 413 `EXCEED_MAX_PAYLOAD_SIZE` |

边界即 102400 字节。

报错位置也容易误判：`handlePhotoFile` 先调用 `editor.begin('正在处理照片…')` 打开弹窗，再发起上传；上传失败后 `editor.fail(error)` 把网关错误直接显示在卡面区域，看起来像「生成球员卡失败」，实际是上传请求被拒。

## 修复（仅 H5，无后端改动）

`service-account-h5/service-entry.js`：

- 新增 `encodeUploadImage(dataUrl, maxSide)`：以 `UPLOAD_IMAGE_MAX_CHARS = 96000` 为目标自适应压缩——先降质量（0.86 → 0.64，步长 0.07），仍超限则按 0.88 缩尺寸并重置质量 0.74，最多 14 轮；400px 时任意人像都远低于阈值，收敛有保证。每次编码都从原图重绘，不叠加多次压缩损失。
- 登记页与递卡确认页两处 `compressImage` 统一改走该函数。
- `api()` 兜底：若仍收到 `EXCEED_MAX_PAYLOAD_SIZE`，转成中文提示「照片数据过大，请换一张或重新拍摄」，不再把英文网关错误抛给用户。
- 缓存标记 `service-entry.js?v=20261019-photo1`（`join-player.html`、`claim-team.html`）。

预留余量：目标 96000 字符，加上 action、会话令牌与 JSON 包装约 200–600 字节，总请求体仍在 102400 以内。

## 发布

- 上传 132 个文件。
- 回读 `https://www.sxffootball.cn`（`Cache-Control: no-cache`）：两个页面均为 `v=20261019-photo1`；`service-entry.js` 线上 md5 `de57ca21…` 与本地一致，`encodeUploadImage` 与 `UPLOAD_IMAGE_MAX_CHARS = 96000` 均在线。
- 后端未改动（getMiniWorkspace / webLoginApi 本次无变更）。

## 真机验收

1. 登记页选择手机相册原图 → 应正常完成抠图并弹出球员卡预览，卡面显示人像。
2. 「更换图片 / 重新拍摄」重复多次不应再出现英文 payload 报错。
3. 递卡确认（恢复/转队）页更换形象照同样生效。

## 已知未处理

`service-account-h5/app.js` 的裁判证识别链路仍以 base64 提交 1800px 图片（`recognizeRefereeCertificate`），同样会触发 100KB 上限。该链路需要保留证书文字清晰度，单纯压缩会损害 OCR，应改为分片上传或二进制请求体，属独立改造项，本次未动。
