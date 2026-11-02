# 手机号登录：云调用权限缺失

2026-10-23，用户授权后已部署；代码读回通过，手机号接口权限验收仍未通过，正在单独重同步。不能宣称已恢复登录。

用户截图是小程序手机号登录提示“手机号授权已失效，请重新授权”，与此前开发者工具截图窗口关闭是不同问题。CLS查询checkUserByOpenId当日记录，22:17:28、22:17:32均在phonenumber.getPhoneNumber解析阶段返回-604101。wx-server-sdk错误枚举为WX_FUNCTIONS_SERVER_OPENAPI_NO_PERMISSION；CloudBase官方FAQ确认需config.json.permissions.openapi声明。当前线上下载包只有index.js、package.json及node_modules，缺少该权限文件；线上index与本地基线一致。

本地修复仅两文件：新增config.json，只声明phonenumber.getPhoneNumber；index.js不再将所有错误都归为凭证过期，区分权限缺失、接口超时、明确无效/已用凭证和其他接口不可用。返回机器码，不泄露手机号或授权凭证；手机号主账号、微信可信上下文、重复账号与不同账号拒绝、PC/小程序字段隔离保持。失败不写users，不允许模拟手机号或固定账号绕过。

隔离测试覆盖7项既有身份/绑定场景、5项错误分类以及最小权限清单，均通过；登录恢复专项通过，node --check及diff检查通过。拟发布包从新下载线上包保留依赖后只替换index.js、添加config.json，manifest记录精确改动。当前Runtime为Nodejs16.13；本次不擅自迁移运行时、配置或更新SDK。

经用户明确授权，微信开发者工具完整部署回执成功，22:35:52代码生效；4343文件回下载与发布manifest一致，包括index.js与config.json，未夹带其他本地后端改动。工具把InstallDependency从TRUE改成FALSE，已通过UpdateFunctionConfiguration仅恢复该字段，读回Active/Available，其余原配置保持。小程序开发/体验/正式共用此后端，无独立测试函数；无需重传小程序开发包。

使用小程序真实SDK上下文、故意无效的手机号code探测（无真实授权、不产生登录或用户写入），22:46仍返回PHONE_API_PERMISSION_DENIED。已超过发布后约10分钟，不能继续只归因缓存。已复用正确AppID的现有窗口，发起只更新config.json的官方增量部署，任务confirmation_cloud_fn_inc_deploy_ddee5ae6-4e45-4a72-928b-86313641dc71，等待开发者工具原生确认。真实成功登录须由用户主动确认手机号，不代授权或伪造成功。

官方参考：https://docs.cloudbase.net/faq/knowledge/cloud-call-604101-permission-error 。证据路径`.codex-artifacts/phone-login-permission-20261023/`；原始错误证据仅保存时间与错误码，不保存手机号/登录凭证。已有上述精确函数及配置变更；无真实用户写入、Git推送或小程序重传。
