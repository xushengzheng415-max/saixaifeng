'use strict';
/*
 * 浏览器验证脚本统一加载 Playwright：
 * 优先使用仓库内本地安装（npm install --no-save playwright-core），
 * 其次兼容原有运行时缓存路径，避免缓存清理后整批脚本无法执行。
 */
const candidates = [
  'playwright-core',
  'playwright',
  'C:/Users/15043/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
];

function loadPlaywright() {
  for (const id of candidates) {
    try {
      return require(id);
    } catch { /* 尝试下一个位置 */ }
  }
  throw new Error('未找到 Playwright，请执行 npm install --no-save playwright-core');
}

module.exports = loadPlaywright();
