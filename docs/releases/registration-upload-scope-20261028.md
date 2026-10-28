# 共享赛事报名表分片上传权限修复

2026-10-28 共享赛事报名Word上传初始化被拒已修复并发布共享后端：CLS确认startChunk目录未登记导致rule=null；webLoginApi/uploadFile各差量staffUploadRights.cjs，当前赛事docx源文件目录复用event.registration，分片会话仍校验用户/机构/赛事，跨赛事与撤权拒绝。用户先授权两个后端发布，再明确授权uploadFile关闭云端自动安装并恢复原依赖。两个函数Active/Available，运行环境/内存/超时/环境变量保留；uploadFile6399文件与原包+权限补丁完全一致，webLoginApi6601文件只余隐藏锁license元数据差异，业务和运行依赖一致。回下载实际上传处理器的隔离初始化/分片/合并/清理/审计、越权拒绝及线上未登录拒绝通过。前端完整错误透传已发布PC预览，7项HTTP/SHA-256一致，正式PC未覆盖。见docs/releases/registration-upload-scope-20261028.md。

## 故障原因

2026-10-28 21:10:30的CLS日志：functionName=uploadFile、action=startChunk、rule=null、scopeOk=true、rightsOk=false。报名表源文件的football/team-registration-imports/{赛事ID}目录未登记给报名管理权限，尚未创建分片会话便被统一入口拒绝。前端仅读取message，漏了error/code，因此显示“初始化分片上传失败”。不是Word解析或头像问题。

## 发布与权限边界

- webLoginApi、uploadFile各只改staffUploadRights.cjs。仅本赛事.docx源文件允许初始化分片；继续使用event.registration，其他扩展名、路径越界、跨赛事目录拒绝。后续分片/完成/清理按会话所属用户、机构、赛事核对，撤权拒绝；临时URL仅本赛事Word路径。
- 共享后端源码f4980c5a已进入main，处理器全链路隔离覆盖追加f0d186b9；原包下载后逐文件核对，业务入口/裁判报告/其他模块未整包回退。前端7185b8f8进入preview，正式PC未覆盖。
- 前端在初始化/分片/合并阶段保留后台message/error及code，并拒绝缺uploadId的无效初始化响应。应用构建源码c0d613583d2d85b028607a3682cf80326c620e29，2956模块/4m22s构建通过、406文件发布/preview/admin/；7项入口/关键分包HTTP200、SHA-256一致。正式PC入口保持a7b61309e5539379381a8749d84ee7a57b2de05534592631976185fffb17fb89。

## 依赖和配置保留

首次默认发布触发云端安装，造成follow-redirects、@types/node、url内qs的小版本漂移。锁文件/覆盖试验未作为最终改动保留。用户随后明确允许关闭uploadFile自动安装、使用原依赖随包发布；最终InstallDependency=FALSE，原包6399文件仅替换权限模块，其余完整依赖字节一致。webLoginApi保持TRUE，6601文件业务及依赖实现一致，仅node_modules/.package-lock.json的license元数据变化。未提交试验package.json/锁文件。

webLoginApi保留Nodejs18.15/512MB/120s；uploadFile保留Nodejs16.13/256MB/15s。只有经用户追加授权的uploadFile依赖构建开关改变，环境变量、处理器及其余运行配置对比不变。两个权限模块SHA-256均为d32faa630fd1e3ec4de34d65245b3402aab0df0eaa340e9b29f0896e616261c0。

## 验证与实际边界

scoped Word生命周期、实际uploadLargeFileViaCloud错误透传/成功合并回归通过。加载线上回下载的真实uploadFile/index.js，在纯内存隔离环境跑初始化、两片上传、合并字节对账、临时数据清理、审计与文件URL读取；跨赛事及撤权时拒绝且不写存储。两个线上无登录探针均返回AUTH_REQUIRED，webLoginApi回下载包裁判表完整性检查通过。未代用户创建真实球队/球员或写赛事报名；用户可在现有窗口直接重试创建，无需重新选Word。

共享后端由正式与预览共用，代码已同步preview；无独立测试后端重复部署。前端错误提示仅PC预览，不把其他未验收功能带入正式。不上传小程序、H5或桌面安装包。

证据：.codex-artifacts/registration-upload-20261028中的package-delta、backend-readback、approved-function-state、preview-http与隔离处理器测试。仅保留脱敏动作/结果，不归档真实账号、令牌、个人资料或报名文件。
