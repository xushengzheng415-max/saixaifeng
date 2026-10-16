# 已发卡读取兼容修复（2026-10-16）

## 现场核实

用户报告卡已发布但PC排阵只显示照片/重试。只读回查立洋杯发放任务issue_fdd5c1dc96e6883467f1c0ef0741ea15，304人cursor=304、complete、failures为空、setDisplay=true；截图涉及的稳定球员ID已有三档授权且当前展示模板为立洋杯铜卡。不是未发卡，不重新授予或改展示配置。

正式PC和预览入口的当前JS包均未声明dynamicCardProtocol，继续使用服务端按需整卡兼容路径。线上webLoginApi/playerCardReader收到dynamic.exportCard已解析的cardUrl后，又收集并不存在的fileId调用getTempFileURL，导致SDK拒绝整次卡读取；即使SDK容忍，也可能拿已授权赛事卡去比对不同基础卡活动指针，错误标为pending。线上getMiniWorkspace已有静态导出保护，独立web读取模块未同步此保护。

## 修复

仅修改webLoginApi/playerCardReader.cjs。displayMode=static-export且具有有效HTTPS cardUrl的已授权结果，保留dynamic.exportCard内已核验的模板/数据/授权版本与原地址，跳过重复文件转换和基础卡指针比对。含cardScene的新动态结果亦不参加旧静态指针查询。其他旧静态图、权限和模板核验保持原路径。

不发布PC前端、不改模板/等级/名单/原图、不重复发卡；整图仍仅为旧客户端按需生成与缓存，不批量生成全员静态图片。getMiniWorkspace近期其他会话改动与线上内容保留，本次不发布小程序或H5。

## 验证

- test-player-card-legacy-read.cjs穿过实际授权读取处理器、动态读取与原生绘图：套系发布与发放后，旧客户端批量和单张读取ready整卡；与不同基础指针并存时仍保持赛事模板；缓存复用、升级读取金卡、动态协议不产生额外整图、公开投影、无权拒绝和模板失效均有断言。
- 测试云存储明确拒绝undefined/非永久fileId，防止“假SDK容忍空编号”掩盖回归；素材与数据库完全隔离，没有生产测试写入。
- 原动态发布/遮罩/授权、批量发放、卡库、预装、数据中心及治理/部署副本检查通过。
- 用刚下载的webLoginApi生产包只替换reader，实际包语法与裁判表防回退检查通过，保留全部其他在线模块和运行配置。

正式状态待上线回读。
