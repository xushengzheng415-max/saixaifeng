# 共享报名上传权限回退复核与发布防护

2026-10-28 共享报名上传再次被拒的现场已复核：22:56请求仍是uploadFile.startChunk、rule=null；重新下载线上webLoginApi发现staffUploadRights已回到旧E34D935D版本，Word目录规则消失，非桌面重启问题。以此次最新线上包仅补staffUploadRights.cjs，23:06:09上线Active/Available；全包读回6612文件业务与依赖实现一致（仅隐藏锁license元数据差异），权限模块恢复D32FAA63，实际回下载包通过报名Word范围检查及裁判表完整性检查。新增check-registration-upload-backend-package并接入强制check-referee-backend-package，实测旧包拒绝、新包通过；防回退代码d73f3baa已进main与preview。未重建桌面包、未刷新用户未提交窗口，用户可当前窗口直接重试创建。见docs/releases/registration-upload-rollback-20261028.md。

## 现场证据

新截图对应22:56:01请求，统一入口日志仍为rule=null、scopeOk=true、rightsOk=false，可信赛事上下文存在。线上重新下载的staffUploadRights.cjs为E34D935D56380BDF43D7662540B94EDDEABE8BD8E65BF679FE8B06BCCE30B151，不含已确认的Word目录规则；本地已修正模块为D32FAA63开头。当前线上旧模块可直接复现包检查失败。由此确认是线上权限代码回到了旧版，具体覆盖来源未在本轮审计定位；不能归因于用户没有重启。

## 修复与验证

以本次刚下载线上完整包为基线，只替换权限模块，保留其余最新业务入口与依赖。重新发布后webLoginApi为Active/Available、Nodejs18.15/512MB/120s、InstallDependency=TRUE；上传函数不重复部署，保留用户已确认的FALSE与原依赖。

重新回下载检查：权限模块SHA-256为d32faa630fd1e3ec4de34d65245b3402aab0df0eaa340e9b29f0896e616261c0，范围检查返回event.registration，拒绝跨赛事与非法文件类型；实际同包裁判表接口检查通过。完整读回无缺失、无新增，除了隐藏锁license元数据之外与拟上传包一致。23:06:10以后核对窗口内没有新的同类拒绝日志，但不将“无日志”宣称为用户已成功建队。未使用用户令牌、未创建真实报名或球队。

## 发布防回退

新增tools/check-registration-upload-backend-package.cjs，在实际拟发布目录加载纯权限模块，验证本赛事.docx上传映射及跨赛事/扩展名拒绝。该检查已接入原本强制执行的tools/check-referee-backend-package.cjs；任何旧权限文件的webLoginApi包都会在既有发布检查中失败。两项检查针对同一实际包执行，不能以主仓源码通过代替拟上传包通过。防护源码d73f3baa已合入main与preview，不发布其他端口。

用户操作：保持现有导入窗口直接重试“创建球队”，无需退出、重启或重新选Word。后端权限修复不依赖客户端缓存；前端错误透传需要刷新页面才能载入，但它不是本次拦截根因。

证据位于.codex-artifacts/registration-upload-retry-20261028，记录只含脱敏动作、版本和摘要，不保存账号令牌或原始报名资料。
