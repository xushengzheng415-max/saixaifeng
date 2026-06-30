/**
 * 格式化工具函数
 */

/**
 * 格式化日期
 * @param {Date|string|number} date - 日期对象、字符串或时间戳
 * @param {string} format - 格式模板，默认 'YYYY-MM-DD HH:mm'
 * @returns {string} 格式化后的日期字符串
 */
export function formatDate(date, format = 'YYYY-MM-DD HH:mm') {
  if (!date) return '-'

  const d = new Date(date)
  if (isNaN(d.getTime())) return '-'

  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds)
}

/**
 * 格式化日期（仅日期部分）
 * @param {Date|string|number} date
 * @returns {string} YYYY-MM-DD
 */
export function formatDateOnly(date) {
  return formatDate(date, 'YYYY-MM-DD')
}

/**
 * 格式化时间（仅时间部分）
 * @param {Date|string|number} date
 * @returns {string} HH:mm
 */
export function formatTimeOnly(date) {
  return formatDate(date, 'HH:mm')
}

/**
 * 格式化相对时间
 * @param {Date|string|number} date
 * @returns {string}
 */
export function formatRelativeTime(date) {
  if (!date) return '-'

  const d = new Date(date)
  const now = new Date()
  const diff = now.getTime() - d.getTime()

  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  const week = 7 * day
  const month = 30 * day
  const year = 365 * day

  if (diff < minute) {
    return '刚刚'
  } else if (diff < hour) {
    return Math.floor(diff / minute) + '分钟前'
  } else if (diff < day) {
    return Math.floor(diff / hour) + '小时前'
  } else if (diff < week) {
    return Math.floor(diff / day) + '天前'
  } else if (diff < month) {
    return Math.floor(diff / week) + '周前'
  } else if (diff < year) {
    return Math.floor(diff / month) + '个月前'
  } else {
    return Math.floor(diff / year) + '年前'
  }
}

/**
 * 格式化数字（添加千分位）
 * @param {number} num
 * @returns {string}
 */
export function formatNumber(num) {
  if (num === null || num === undefined) return '-'
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * 格式化金额
 * @param {number} amount - 金额
 * @param {number} decimals - 小数位数，默认 2
 * @returns {string}
 */
export function formatMoney(amount, decimals = 2) {
  if (amount === null || amount === undefined) return '-'
  return '¥' + Number(amount).toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * 格式化手机号码（隐藏中间4位）
 * @param {string} phone
 * @returns {string}
 */
export function formatPhone(phone) {
  if (!phone) return '-'
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
}

/**
 * 格式化身份证号（隐藏中间部分）
 * @param {string} idCard
 * @returns {string}
 */
export function formatIdCard(idCard) {
  if (!idCard) return '-'
  if (idCard.length === 18) {
    return idCard.replace(/(\d{4})\d{10}(\d{4})/, '$1**********$2')
  }
  return idCard
}

/**
 * 格式化字符串（限制长度并添加省略号）
 * @param {string} str
 * @param {number} maxLength
 * @returns {string}
 */
export function formatEllipsis(str, maxLength = 20) {
  if (!str) return '-'
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength) + '...'
}
