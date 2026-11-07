// 统一状态语义色：把 Element 的语义类型收敛到全局状态色板（src/assets/global.css）
// 未识别的类型一律回落到中性灰，避免重新出现 Element 默认色
export const STATUS_TONE_VARIANTS = {
  success: 'sxf-status--success',
  warning: 'sxf-status--warning',
  danger: 'sxf-status--danger',
  info: 'sxf-status--neutral'
}

export function statusToneClass(type) {
  return ['sxf-status', STATUS_TONE_VARIANTS[type] || 'sxf-status--neutral']
}
