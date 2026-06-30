/**
 * 日志监控系统 - utils/logger.js（最小化版本，避免语法错误）
 * 原文件已被自动修复脚本损坏，此版本仅导出空函数以保持 app.js 能正常加载
 * TODO: 从备份恢复原始 logger.js
 */

// 是否启用（生产环境可关闭）
let enabled = false;

/**
 * 初始化日志系统（空实现）
 */
function init() {
  // 空实现
}

/**
 * 重写 console 方法（空实现）
 */
function overrideConsole() {
  // 空实现
}

/**
 * 格式化参数（空实现）
 */
function formatArgs(args) {
  return args.map(arg => String(arg)).join(' ');
}

/**
 * 记录日志（空实现）
 */
function log(level, message, data = {}) {
  // 空实现
  return null;
}

/**
 * 获取当前日期时间（空实现）
 */
function getCurrentDate() {
  const now = new Date();
  return now.toISOString();
}

/**
 * 上传日志到云数据库（空实现）
 */
async function uploadLogs() {
  return null;
}

/**
 * 获取日志（空实现）
 */
async function getLogs(options = {}) {
  return [];
}

/**
 * 清除日志（空实现）
 */
async function clearLogs() {
  return 0;
}

/**
 * 导出日志（空实现）
 */
async function exportLogs(options = {}) {
  return null;
}

// 导出模块（保持与原始文件相同的导出接口）
module.exports = {
  init,
  
  // 便捷方法
  debug: (msg, data) => log('DEBUG', msg, data),
  info: (msg, data) => log('INFO', msg, data),
  warn: (msg, data) => log('WARN', msg, data),
  error: (msg, data) => log('ERROR', msg, data),
  
  // 网络请求日志
  request: (url, method, status, duration) => {
    log('INFO', `[${method}] ${url}`, { status, duration: duration + 'ms' });
  },
  
  // 云函数调用日志
  cloud: (name, status, duration, error) => {
    const level = status === 'success' ? 'INFO' : 'ERROR';
    const data = { duration: duration + 'ms' };
    if (error) data.error = error;
    log(level, `Cloud: ${name}`, data);
  },
  
  // 上报错误（手动）
  report: (error, context = {}) => {
    log('ERROR', 'Manual Report', {
      message: error.message || String(error),
      stack: error.stack || '',
      ...context
    });
    uploadLogs();
  },
  
  // 获取/清除日志
  getLogs,
  clearLogs,
  exportLogs,
  
  // 设置启用状态
  setEnabled: (val) => { enabled = val; },
  
  // 立即上传
  flush: uploadLogs
};
