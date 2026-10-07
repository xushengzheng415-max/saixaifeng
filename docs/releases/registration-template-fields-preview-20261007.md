# 通用报名表与自选字段预览更新

下载文件原为立洋杯专用表。现通用模板去除固定赛事/城市/年份品牌，保留原表结构和责任书条款，仅把责任书中的固定赛事名称替换成“本次足球赛事”。增加出生日期和位置字段；队徽与各人员照片为 Word 原生图片控件，位置为下拉选项。青少年、成人预设及自选字段在下载前选择。

Word 通用、青少年、成人文件均经过 render_docx.py 渲染并逐页查看，每份 3 页；姓名、身份证等字段不与相邻人员错配，图片占位图不冒充实际照片。原用户下载文件未覆盖。图片控件兼容依据：[Microsoft Open XML picture content control](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.sdtcontentpicture?view=openxml-3.0.1)。未声称已在用户本机 Word/WPS 逐项点击验收。

演示“邀请球队”显示邀请内容示例图，二维码图形明确为示例，不调用真实邀请。演示 Word 批量导入保留出生日期和位置并创建虚拟球队/球员。

真实 importTeamRegistrationBatch 接口增加出生日期/位置处理，身份证缺失保留草稿并不计入正式名单 ID；本次只有代码，生产接口发布待用户独立授权（PREVIEW_RELEASE_WORKFLOW.md 第 68 行）。正式 `/admin/` 未授权覆盖。

test-registration-template-fields.mjs、旧跨页号码和兼任球员检查通过；源函数语法检查通过。全数据治理原有副本漂移未在此次处理。发布后追加资源回读证据。
