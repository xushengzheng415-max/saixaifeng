# 共用队徽读取修复（2026-10-16）

## 原因

用户报告立洋杯前14张卡提示“球队队徽读取失败”。这14名球员使用同一个队徽文件。文件仍存在，PNG请求成功；云存储响应按请求Origin返回跨域头，但未带Vary: Origin。浏览器先以普通缩略图读取并缓存后，以anonymous模式将同一地址用于Canvas时可能复用不含跨域头的缓存。

使用实际队徽只读复现：普通Image读取成功；同地址anonymous Image连续两次失败；新请求成功。共用图片本身合法，球队身份继续由稳定teamId区分，与队徽相同无关。

## 修复

统一draw模块保留首轮anonymous Image读取；失败后仅重试一次，以fetch的cors模式、omit凭据和cache: reload重新请求原地址，再从Blob解码。原文件路径、临时签名及查询参数不变；没有改存储权限、使用no-cors或隐藏真实失败。整个重试受超时及AbortController约束，解码完成或失败均释放临时Blob地址。同批图片仍按原URL共享Promise，不按队名、队徽合并球队或球员。

同步H5和小程序绘制源码副本。本次仅发布独立平台工程，其他端不随平台发布命令上线；没有云函数、模板激活、发卡或数据写入。

## 验证

- test-player-card-cors-cache.cjs：真实双端口HTTP服务复现普通缩略图缓存；两个不同teamId、24名不同球员共用一个队徽，仅补一次CORS请求，24/24成功；签名地址保持不变，Blob地址释放；真实CORS拒绝和超时仍失败。
- 截图涉及14名球员的原授权场景，先预热普通队徽缓存再绘制，14/14成功；证据work/card-preview-materials-20261016/real-warm-cache-recovery.json。
- test-player-card-preview-resilience、test-player-card-recipient-transfer-ui、test-dynamic-player-card、test-player-card-workflow-render均通过。隔离发放测试没有写生产数据。
- 三份draw源码字节一致。全量sync-dynamic-player-card --check提示同期其他任务正在修改的getMiniWorkspace/playerCardReader差异，未覆盖该改动。

## 正式发布

平台版本20261016105458-4dab1a10，源码提交4dab1a10911db997cdd56d329cca31e4fa82bd64。独立边界检查与生产构建通过，27个线上文件HTTP成功且SHA-256与本地产物一致。仅更新pingtai.sxffootball.cn；H5和小程序本次只同步源码，后端与存储配置未变。
