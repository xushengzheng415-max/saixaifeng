# PC与H5实际展示链路（2026-10-16）

## 真实证据与前次结论修正

用户再次报告PC排阵退回照片。CLS实际请求d3a8ed55-c960-11f1-8ba2-525400ab2e2a包含dynamicCardProtocol，响应success=true、card status=ready、立洋杯铜卡templateId及v6正确。入口JS未出现协议字段不能代表懒加载cloud分包没有该字段。前次静态读取修复是有效回归修复，未覆盖当前网页端绘制失败，不能再据此宣称该用户页面恢复。

取实际授权响应里的素材地址和已发布布局，在独立浏览器可正常绘制；尚未取得用户浏览器具体失败素材/字体/缓存错误，不能断言唯一客户端网络原因。当前正式PC绘制模块为旧版，未包含共享图片、限流及CORS重取机制。

H5用户提供正式tournament-center.html#rankings。实际JS创建published-player-card完整图片，但正式CSS仍只有旧图层/照片的规则，没有该完整图片的尺寸约束。900px整卡可溢出手机容器并被截掉。白波已获赛事展示授权，但publicTournamentPlayerCard在playerCardPublic不为true时强制baseOnly，仍取旧基础卡。

## 实施边界

- PC viewer在dynamic/1之外增加playerCardRendererVersion=player-card-web/2协商。未声明可靠网页绘制能力的现有页面，按需返回相同已授权动态卡的完整PNG URL，避免旧浏览器自行下载照片、队徽、字体并Canvas合成失败；不是重发卡或批量静态化。新版明确协商可继续返回动态scene，导出操作仍保持scene权限核验。仅在按需整图路径2人并发，动态路径4人并发。
- H5完整图片使用300:430等比contain，最大300px且适配窄屏，去掉圆角裁切；只补完整卡图片规则，不重排卡内人物或文字。更新共享绘制模块资源版本以覆盖当前模板样式及读取修复。
- 公开赛事详情仍先通过现有公开榜单名单检查。仅当当前展示为该赛事已发布升级套系、有效明确平台发放授权与套系成员一致，才展示此赛事卡。撤销、其他赛事、球队/个人荣誉、未列入公开名单继续拒绝或保留原基础卡规则；原人物始终只给可见像素投影，不把公开查卡扩为公开原始档案。
- 不修改真实卡库/等级/照片/名单，不保存用户比赛阵容。本次只读核查后端；渲染按原受控路径生成按需缓存。

## 验证与发布

test-player-card-legacy-read穿过真实处理器和原生绘图，覆盖旧页面带dynamic/1仍获得整图、新能力继续动态、跨机构拒绝、升级及版本失效。test-public-event-card-display覆盖有效本赛事已授卡、未列公开、撤销、跨赛事、荣誉、缺授权和读取失败。test-tournament-card-fit用生产实际CSS与DOM类名复现900px溢出，并验证320/390/768屏下全卡比例和边界。其他原发放、素材、遮罩、数据治理回归通过。

H5预览仅三文件，复用正式现有其他资产：/preview/card-display/service-account-h5/tournament-center.html#rankings；三个文件HTTP/SHA-256回读一致后供产品负责人验收。H5正式发布仍需当前验收授权。PC不部署前端，后端从当前线上包差量三个读取模块，保留OCR及运行配置。实际结果待发布回读记录。

## 实际回读与可见验证

- 源码d73fc3e8。webLoginApi Active/Available、无CodeError，CodeSha256=b08aeb21c9f2eafb1b2845440aa3592ad7944125696410fb95146805d4f7acde；回下载三模块与源码字节一致，其他成员CRC/长度一致，仅npm隐藏锁元数据附带变化。未改运行配置。
- 正常公开赛事接口实调白波：ready、立洋杯templateId=63edbfcdf7152093e874d7f8988dfb84、v6、动态scene；在已发布预览页390px浏览器绘制后，完整图片300×430，left=45/right=345、contain，截图确认卡框与文字完整。没有把某张旧基础卡图片替换成演示图。
- 同一公开范围实调孔祥子不携动态协议，返回ready、同赛事v6、完整PNG URL。使用正式PC当前部署的PlayerCard-JXIlG03v组件、原cloud模块和Vue运行时，将该真实受控返回通过隔离HTTP映射给组件，实际请求仍带旧dynamic/1且没有新renderer版本；组件显示900×1290原图、300px宽完整卡面。此验证未使用用户会话、未保存阵容；不能冒称已经替用户点击实际排阵页。
- 预览3文件HTTP200及SHA匹配。H5正式HTML/CSS/绘制文件尚未替换，已向用户说明AGENTS.md验收要求并请求正式H5授权；正式后端当前赛事已授展示读取修复已生效。PC原前端不变，只需重新读取卡片。
- 证据work/card-display-paths-20261016/{web-final,web-readback-verification,h5-preview-readback,h5-live-card-render,production-pc-component-result}.json及h5-real-card-preview.png、production-pc-component-complete.png。授权接口返回与素材地址仅保存在忽略诊断目录，不提交仓库。

## H5正式发布（用户已授权）

用户看到正式页已替换卡面但仍放大，核对确认正式HTML没有加载fit补丁。用户明确答复“立即更新正式H5”后，先备份正式入口/绘制文件，再发布fit CSS、共享renderer，最后入口新版本。正式入口新增tournament-center-card-fit.css?v=20261016-1、renderer使用20261016-card-display1。

实际详情测试另发现旧脚本只认可HTTPS卡图URL，预期动态绘制的PNG data URL会被误判暂无。保存生产现有tournament-center-player-list-20260930.js为仓库正式源，只将此处判断扩为HTTPS或data:image/png;base64，未重写其他业务；入口脚本版本更新为20261016-card-fit2。该补充属于同一显示修复，不改公开权限或接口。当前正式dynamic-card.js匹配条件不接受带https前缀的API URL，因此本页仍请求旧客户端完整PNG；本次未扩大修改共享fetch适配器，而是按实际请求协议验证完整图路径。

四个正式文件HTTP200且源码摘要一致。使用正式HTML、CSS、脚本，从球员榜点击打开详情（隔离榜单条目、真实白波公开卡接口返回）走完实际DOM事件；卡片模板v6，手机390px中宽300/高430、left45/right345、contain。截图h5-formal-full-flow.png确认完整卡框、姓名及底部可见，下方资料不被卡图撑走。真实未携动态协议的白波公开读取也已实调ready，避免用不符合实际请求协议的动态scene夹具误判前端失败。

原正式入口及脚本备份：work/card-display-paths-20261016/h5-formal-before/；四文件回读h5-formal-readback.json；正式浏览器h5-formal-browser.json。本次没有发布积分规则或替用户调整积分。

用户随后询问积分规则如何生效，核对现有流程为填写至少4字原因→保存草稿→试算影响→确认发布→等待“规则已生效”；已获卡级保留。H5历史页面只接受硬编码V2，会把配置版积分误标待核定，现识别服务端V2或合法config-代次-时间戳版本，不计算/改写分数与等级；未知版本仍不当作已核定。正式脚本缓存版本最终为20261016-card-fit3。隔离完整详情流程使用config-3测试积分摘要识别铜卡，并继续使用真实白波卡URL验证整卡尺寸；没有在生产保存或发布积分草稿。
