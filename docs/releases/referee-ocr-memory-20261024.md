# 裁判表识别内存修复

正式识别在256MB函数中并发保留原图的三份编码请求、OCR响应和局部图片处理对象，触发FUNCTIONS_MEMORY_LIMIT_EXCEEDED。修复基于当前线上函数包：表格结构先识别，准确文字与手写文字再并行；主客队局部图逐张处理；不返回未使用的原图Buffer。函数内存调整为512MB，其余线上配置与环境变量保留。

PC核对弹窗把云平台内存和超时错误改为中文重试提示，上传后的原图仍可直接重试。未修改识别事实规则、赛事名单、比分、比赛事件或保存权限。

修复提交e3b3dcd1已同步main。webLoginApi以当前线上包为基线差量更新，回读Active、Nodejs18.15、index.main、120秒、512MB、Event；环境变量配置保留。线上refereeReportOcr.cjs与发布源码SHA-256一致，匿名识别探针返回AUTH_REQUIRED。正式PC构建通过，392个文件发布/admin/，入口及裁判表相关8个资源HTTP 200且SHA-256与本地构建一致。回读证据位于.codex-artifacts/referee-ocr-readback-20261024和webapi-ocr-final-readback-20261024。未运行真实授权样图复测，也未写真实比赛数据。
