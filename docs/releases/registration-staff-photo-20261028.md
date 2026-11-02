# 报名表工作人员照片复用与缺图占位

2026-10-28 Word报名表工作人员照片复用与缺图占位框已发布PC预览：同一表内工作人员无照片时，按唯一同名球员且无身份证/可见前缀/生日/性别冲突复用照片；保留已有工作人员照片，仅复制照片字段，不复制身份、角色、号码或参赛资格。缺图显示矩形人像占位框且仍可上传，不生成占位图片文件；同一File的分割/上传结果复用。功能1d5a6a26、预览源码74bd50f7；实际Word跨栏照片复用、3岗位、同名歧义/资料冲突、原照片保护、受保护号码与兼任回归通过；实际PersonPhotoUpload组件截图已查看。2955模块/1m26s构建通过，预览入口及关键资源7项HTTP/SHA-256一致，正式/admin/未改；无后端或其他端发布。见docs/releases/registration-staff-photo-20261028.md。

用户要求：在当前表中查找领队、主教练、队医对应球员的已有照片复用；没有照片时使用占位头像框。匹配范围仅为本次Word的staff与players数组，既有照片优先。唯一同名但已知身份信息有冲突时不复用；同名多人或缺姓名保持空框。

照片复用使用同一个原始File对象，上传循环按该对象缓存已处理结果，复用成功或保留原图的文件ID，不重复分割上传。不建立自然人链接，不改变工作人员与球员角色、号码、审核或参赛状态，不按姓名合并账号或人员。照片来源字段仅在当前导入预览内使用，后端继续原有授权与文件路径校验。

空头像采用现有Element Plus User SVG图标，36×44矩形框，已有照片继续完整contain展示；保留可点击上传、标题及无障碍名称。占位仅为界面状态，不写照片文件或照片ID。

修改：registrationPhotoReuse.js、teamRegistrationDocx.js、TeamRegistrationWordImporter.vue、test-registration-staff-photo.mjs。实测Word照片行中工作人员图像缺失、下方同名球员有图时复用；其他教练/队医仍为空。测试也覆盖重复姓名、不同完整号码/可见前缀/生日冲突、已有照片不覆盖。protected-identity与dual-role回归通过。

本地实际组件隔离渲染截图：.codex-artifacts/registration-staff-photo-20261028/avatar-preview.png。使用AI示例照片，无真实个人数据或数据库写入。预览入口SHA-256：465652c9da8f4acbad7d9e7dfd17b67033d1934f2c38a0fb93ce47b255e77eed；正式入口保持：a7b61309e5539379381a8749d84ee7a57b2de05534592631976185fffb17fb89。仅预览发布，正式发布待本次用户验收。
