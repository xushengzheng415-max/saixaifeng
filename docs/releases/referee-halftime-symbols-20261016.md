# 换人栏中场简写

用户确认：换上/换下栏写半、中、对号或↑↓符号，按本场中场换人解释；30只是上下半场各30分钟赛事的中场时刻，不是全平台固定值。

normalizeMinute仅在on/off字段识别上述新增标记，复用timing.halfMinutes。时长由原resolveTiming从本场锁定快照/组别规则读取；未知时长保留待核对，不补默认30。首发、替补、身份和进球栏含义不变，明确数字分钟继续原样解析。原始标记保留在rawFields中。

从最新线上webLoginApi包仅更新refereeReportAnalysis.cjs，保存接口、鉴权和签名保持线上基线；规则对PC正式/预览及手机共用识别接口生效。主工作区、main、preview同步该归一化改动，保留同期未提交内容。