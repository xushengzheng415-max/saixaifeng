'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('./lib/load-playwright.cjs');
const root = path.resolve(__dirname, '..');
const projectRoot = path.join(root, 'platform-admin-vue');
const output = path.join(root, 'output/platform-tablet-20261028');
const baseUrl = 'http://127.0.0.1:5187';
const cloudHostPattern = /cloud1-7g8ckb3c7815a011-1419431905\.ap-shanghai\.app\.tcloudbase\.com/;

const tournaments = Array.from({ length: 6 }, (_, index) => ({
  _id: `qa-tournament-${index + 1}`,
  name: ['郑州青少年足球邀请赛', '开封城市联赛', '洛阳春季杯', '新乡校园足球赛', '许昌五人制联赛', '南阳周末联赛'][index],
  organizerName: ['郑州劲风体育', '开封立洋足球', '洛阳青训中心', '新乡校园联盟', '许昌足协', '南阳体育中心'][index],
  creatorName: '张教练',
  creatorPhone: '13800000000',
  category: 'youth',
  formatType: 'tournament',
  city: '郑州',
  status: ['registering', 'ongoing', 'published', 'ended', 'draft', 'ongoing'][index],
  teamCount: 8 + index,
  createTime: '2026-10-20T10:00:00+08:00',
  platformArchived: false,
  isFeatured: index < 2,
  publicStatus: index < 2 ? 'published' : 'draft',
  publicVersion: 1,
  featuredSort: index
}));

const organizers = Array.from({ length: 5 }, (_, index) => ({
  _id: `qa-organizer-${index + 1}`,
  name: ['郑州劲风体育', '开封立洋足球', '洛阳青训中心', '新乡校园联盟', '许昌足协'][index],
  contact: '张教练',
  phone: index < 3 ? '1380000000' + index : '',
  email: '',
  hasContact: index < 3,
  activeSupportCount: index === 2 ? 1 : 0,
  usageStage: ['hosting', 'hosted', 'not_started', 'hosting', 'hosted'][index],
  usageStageLabel: ['正在办赛', '已办赛', '未开始使用', '正在办赛', '已办赛'][index],
  usageStageAutoLabel: '已办赛',
  usageStageIsManual: false,
  tournamentCount: 3,
  teamCount: 6,
  registeredTournamentCount: 2,
  latestTournament: { name: '郑州青少年足球邀请赛', createTime: '2026-10-20T10:00:00+08:00' },
  intentLevel: ['A', 'B', 'C', 'D', 'A'][index],
  intentLabel: ['A 有报名球队', 'B 有明确需求', 'C 待观察', 'D 待清理', 'A 有报名球队'][index],
  intentReason: '近 30 天有报名球队',
  intentRank: 4 - index,
  followUpStatus: index === 1 ? 'interested' : '',
  followUpStatusLabel: '有意向待落地',
  followUpNote: index === 1 ? '年底计划再办一场' : '',
  archived: false,
  userId: `qa-user-${index + 1}`,
  orgId: index < 3 ? `qa-org-${index + 1}` : '',
  deletable: index === 4,
  tournamentIds: [`qa-tournament-${index + 1}`],
  teamIds: [`qa-team-${index + 1}`],
  accountProfiles: [],
  latestNotice: null
}));

const accounts = organizers.map((row, index) => ({
  _id: row.userId,
  name: row.contact,
  phone: row.phone,
  email: '',
  registrationSource: 'PC 微信扫码',
  loginMethods: ['微信', '手机号'],
  orgId: row.orgId,
  tournamentCount: 3,
  teamCount: 6,
  isActive: true,
  lastLoginTime: '2026-10-27T09:30:00+08:00'
}));

const teams = Array.from({ length: 5 }, (_, index) => ({
  _id: `qa-team-${index + 1}`,
  name: ['郑州劲风 U10', '开封立洋 U12', '洛阳青训 U8', '新乡校园 U14', '许昌足协 U16'][index],
  city: '郑州',
  logo: '',
  organizerName: '郑州劲风体育',
  contact: '张教练',
  phone: '13800000001',
  playerCount: 18 + index,
  tournamentCount: 2,
  createTime: '2026-09-12T09:00:00+08:00',
  platformArchived: false
}));

const overview = {
  banners: [],
  tournaments,
  organizers,
  accounts,
  teams,
  supportRequests: [],
  stats: { totalTournaments: 12, totalOrganizers: 5, totalTeams: 5, activeSupportCount: 1, missingContactCount: 2, leadCount: 2 }
};

const tabs = ['overview', 'organizers', 'accounts', 'tournaments', 'teams', 'content', 'support', 'honeyOrders'];
const extraTabs = ['dataCenter', 'playerCards', 'feedback', 'cardRules', 'marketingSelfTest', 'aiPortrait', 'paymentSettings'];
const tabLabels = {
  overview: '运营总览',
  organizers: '主办方联系人',
  accounts: '账号管理',
  tournaments: '全平台赛事',
  teams: '全平台球队',
  dataCenter: '数据中心',
  playerCards: '球员卡系统',
  feedback: '反馈管理',
  cardRules: '积分规则',
  support: '问题与协助',
  content: '内容运营',
  marketingSelfTest: '自测身价',
  aiPortrait: 'AI 形象照',
  honeyOrders: '蜂蜜充值',
  paymentSettings: '支付设置'
};
// 内页数据依赖各自云函数结构；这里先只验证外壳（导航、触控、溢出），页面级异常单独记录。
const tolerantTabs = new Set(extraTabs);
const tabletDevices = [
  { name: 'landscape-1180', width: 1180, height: 820 },
  { name: 'landscape-1024', width: 1024, height: 768 },
  { name: 'portrait-820', width: 820, height: 1180 },
  { name: 'portrait-768', width: 768, height: 1024 }
].filter(device => !process.env.TABLET_DEVICE || device.name === process.env.TABLET_DEVICE);

function jsonResult(bodyText) {
  let body = {};
  try { body = JSON.parse(bodyText || '{}'); } catch { body = {}; }
  const action = String(body.action || '');
  if (action === 'callFunction') {
    const functionName = String(body.functionName || '');
    const params = body.functionParams || {};
    if (functionName === 'platformOwner' && params.action === 'status') return { success: true, isPlatformOwner: true };
    if (functionName === 'manageTournamentCenterContent' && params.action === 'overview') return { success: true, data: overview };
    if (functionName === 'manageTournamentCenterContent' && params.action === 'refreshTournamentStatuses') return { success: true, data: { startedTournamentIds: [] } };
    if (functionName === 'platformOwner' && params.action === 'listRequests') return { success: true, requests: [] };
    if (functionName === 'platformOwner' && params.action === 'honeyOrdersOverview') return { success: true, overview: { available: false, note: '本地验收：未开通支付配置', totals: null, byDay: [], byPack: [] } };
    if (functionName === 'platformOwner' && params.action === 'honeyOrderList') return { success: true, list: { rows: [], total: 0, scanned: 0, page: 1, pageSize: 10 } };
    return { success: true, data: {}, rows: [], items: [], requests: [], list: { rows: [], total: 0, scanned: 0, page: 1, pageSize: 10 } };
  }
  if (action === 'listPlayerCardTemplates') return { success: true, templates: [], nextCursor: '' };
  if (action === 'listPlayerCardPreloadTargets' || action === 'listPlayerCardLayoutPresets') return { success: true, targets: [], presets: [], layouts: [], nextCursor: '' };
  if (action === 'savePlayerCardTemplate' && body.workflowAction === 'list') return { success: true, sets: [], legacy: [], issues: [] };
  if (action === 'savePlayerCardTemplate' && String(body.workflowAction || '').startsWith('scoreRules')) {
    const parameters = { appearancePoints: 2, startPoints: 3, minutesPerPoint: 30, goalPoints: 5, goalCapPercent: 50, supportDropsPerPoint: 20, silverAt: 500, goldAt: 1200 };
    return { success: true, revision: 1, draft: { ...parameters }, draftReason: '', active: { parameters: { ...parameters } }, job: null };
  }
  return { success: true, data: [] };
}

async function newTabletContext(browser, device) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; vivo Pad3 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
  });
  await context.addInitScript(() => {
    localStorage.setItem('platformAuthToken', 'qa-platform-token');
    localStorage.setItem('platformSession', JSON.stringify({ userId: 'platform-owner', userName: '平台负责人', user: { _id: 'platform-owner', userName: '平台负责人' }, loginAt: Date.now() }));
    sessionStorage.setItem('sxfPlatformAuthContext', 'platform');
  });
  await context.route('**/*', route => {
    if (cloudHostPattern.test(new URL(route.request().url()).hostname)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(jsonResult(route.request().postData())) });
    }
    return route.continue();
  });
  return context;
}

async function inspect(page) {
  return page.evaluate(() => {
    const area = document.querySelector('.platform-console .workspace');
    const right = area ? area.getBoundingClientRect().right : 0;
    const stats = document.querySelector('.platform-console .stats');
    const topButtons = Array.from(document.querySelectorAll('.platform-console .top-actions .el-button'));
    const refresh = topButtons.find(el => (el.textContent || '').includes('刷新数据'));
    const install = topButtons.find(el => (el.textContent || '').includes('安装') || (el.textContent || '').includes('主屏幕'));
    const sidebar = document.querySelector('.platform-console .sidebar');
    const toggle = document.querySelector('.platform-tablet-toggle');
    return {
      coarse: matchMedia('(pointer: coarse)').matches,
      landscape: matchMedia('(orientation: landscape)').matches,
      documentOverflow: document.documentElement.scrollWidth > innerWidth + 2,
      contentOverflow: Boolean(area && area.scrollWidth > area.clientWidth + 2),
      sidebarVisible: Boolean(sidebar && getComputedStyle(sidebar).display !== 'none'),
      menuVisible: Boolean(toggle && toggle.getBoundingClientRect().width > 0),
      statColumns: stats ? getComputedStyle(stats).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      refreshHeight: refresh ? Math.round(refresh.getBoundingClientRect().height) : 0,
      installHeight: install ? Math.round(install.getBoundingClientRect().height) : 0,
      installVisible: Boolean(install && install.getBoundingClientRect().width > 0),
      offenders: area ? Array.from(area.querySelectorAll('*'))
        .filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.right > right + 3 && !el.closest('.el-table, .el-scrollbar, .el-drawer, .el-dialog, .el-overlay');
        })
        .slice(0, 8)
        .map(el => ({ tag: el.tagName, className: String(el.className).slice(0, 90), right: Math.round(el.getBoundingClientRect().right) })) : []
    };
  });
}

async function desktopLabels(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, isMobile: false, hasTouch: false });
  await context.addInitScript(() => {
    localStorage.setItem('platformAuthToken', 'qa-platform-token');
    localStorage.setItem('platformSession', JSON.stringify({ userId: 'platform-owner', userName: '平台负责人', user: { _id: 'platform-owner', userName: '平台负责人' }, loginAt: Date.now() }));
    sessionStorage.setItem('sxfPlatformAuthContext', 'platform');
  });
  await context.route('**/*', route => {
    if (cloudHostPattern.test(new URL(route.request().url()).hostname)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(jsonResult(route.request().postData())) });
    }
    return route.continue();
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/#/tournament-center-admin`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('.platform-console .sidebar').waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
  const state = await inspect(page);
  const labels = await page.evaluate(() => Array.from(document.querySelectorAll('.platform-console .sidebar nav button span')).map(el => el.textContent.trim()).filter(Boolean).sort());
  await page.screenshot({ path: path.join(output, 'desktop-overview-1440.png') });
  await page.locator('.platform-console .sidebar nav button', { hasText: '主办方联系人' }).click();
  await page.locator('.platform-console .el-table').waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(output, 'desktop-organizers-1440.png') });
  await context.close();
  return { labels, state };
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const vitePath = path.join(projectRoot, 'node_modules/vite/dist/node/index.js');
  const { createServer } = await import(pathToFileURL(vitePath));
  const server = await createServer({
    root: projectRoot,
    configFile: path.join(projectRoot, 'vite.config.js'),
    server: {
      host: '127.0.0.1',
      port: 5187,
      strictPort: true,
      fs: { allow: [root, projectRoot] },
      watch: { ignored: ['**/dist*/**', '**/node_modules/**'] }
    }
  });
  await server.listen();
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const results = [];
  const failures = [];
  const notes = [];
  let drawerParity = null;
  let desktop = null;
  try {
    desktop = await desktopLabels(browser);
    if (!desktop.state.sidebarVisible) failures.push('桌面 1440 侧栏未显示');
    if (desktop.state.menuVisible) failures.push('桌面 1440 出现了平板菜单按钮');
    if (desktop.state.statColumns !== 4) failures.push(`桌面 1440 统计卡不是 4 列：${desktop.state.statColumns}`);
    if (desktop.state.documentOverflow || desktop.state.contentOverflow) failures.push('桌面 1440 出现横向溢出');

    for (const device of tabletDevices) {
      const context = await newTabletContext(browser, device);
      const page = await context.newPage();
      const pageErrors = [];
      let currentTab = 'overview';
      page.on('pageerror', error => pageErrors.push({ tab: currentTab, message: error.message, stack: String(error.stack || '').split('\n').slice(0, 3).join(' | ') }));
      await page.goto(`${baseUrl}/#/tournament-center-admin`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.locator('.platform-console .workspace').waitFor({ timeout: 20000 });
      await page.waitForTimeout(700);
      for (const tab of [...tabs, ...extraTabs]) {
        currentTab = tab;
        if (tab !== 'overview') {
          await page.locator('.platform-console .platform-tablet-toggle').click();
          const drawer = page.locator('.platform-tablet-drawer');
          await drawer.waitFor({ state: 'visible' });
          await page.waitForTimeout(300);
          await drawer.locator('nav button', { hasText: tabLabels[tab] }).first().click();
          await page.waitForTimeout(900);
        }
        const state = await inspect(page);
        const row = { device: device.name, width: device.width, height: device.height, tab, tolerant: tolerantTabs.has(tab), ...state };
        results.push(row);
        await page.screenshot({ path: path.join(output, `${device.name}-${tab}.png`), fullPage: false });
        if (!state.coarse) failures.push(`${device.name}/${tab} 未识别为触屏指针`);
        if (state.landscape !== (device.width > device.height)) failures.push(`${device.name}/${tab} 方向识别不一致`);
        if (state.documentOverflow) failures.push(`${device.name}/${tab} 文档横向溢出`);
        if (state.contentOverflow) failures.push(`${device.name}/${tab} 工作区横向溢出`);
        if (state.sidebarVisible) failures.push(`${device.name}/${tab} 平板仍显示固定侧栏`);
        if (!state.menuVisible) failures.push(`${device.name}/${tab} 平板菜单按钮不可见`);
        if (state.refreshHeight < 44) failures.push(`${device.name}/${tab} 刷新按钮触控高度不足：${state.refreshHeight}`);
        if (!state.installVisible) failures.push(`${device.name}/${tab} 平板未显示安装入口`);
        if (state.installVisible && state.installHeight < 44) failures.push(`${device.name}/${tab} 安装入口触控高度不足：${state.installHeight}`);
        if (tab === 'overview' && state.statColumns !== 2) failures.push(`${device.name}/overview 统计卡不是 2 列：${state.statColumns}`);
        if (state.offenders.length) failures.push(`${device.name}/${tab} 工作区内溢出元素：${JSON.stringify(state.offenders)}`);
      }
      for (const error of pageErrors) {
        if (tolerantTabs.has(error.tab)) continue;
        failures.push(`${device.name}/${error.tab} 页面异常：${error.message}`);
      }
      const tolerantErrors = pageErrors.filter(error => tolerantTabs.has(error.tab));
      if (tolerantErrors.length) notes.push(`${device.name} 内页数据桩未覆盖：${tolerantErrors.map(error => `${error.tab} ${error.message} @ ${error.stack}`).join(' | ')}`);

      await page.locator('.platform-console .platform-tablet-toggle').waitFor();
      await page.locator('.platform-console .platform-tablet-toggle').click();
      await page.locator('.platform-tablet-drawer').waitFor({ state: 'visible' });
      await page.waitForTimeout(400);
      const labels = await page.evaluate(() => Array.from(document.querySelectorAll('.platform-tablet-drawer nav button span')).map(el => el.textContent.trim()).filter(Boolean));
      const menuLabels = labels.filter(label => label !== '返回赛事空间').sort();
      const parity = JSON.stringify(menuLabels) === JSON.stringify(desktop.labels);
      if (!drawerParity) drawerParity = { expected: desktop.labels, actual: menuLabels, equal: parity };
      if (!parity) failures.push(`${device.name} 抽屉菜单与桌面侧栏不一致`);
      await page.screenshot({ path: path.join(output, `${device.name}-menu.png`) });
      const homeButton = page.locator('.platform-tablet-drawer .platform-tablet-home');
      if (!(await homeButton.count())) failures.push(`${device.name} 抽屉缺少返回赛事空间入口`);
      await page.locator('.platform-tablet-drawer nav button', { hasText: '全平台球队' }).click();
      await page.waitForTimeout(500);
      const title = await page.locator('.platform-console .topbar h1').textContent();
      if (!title.includes('全平台球队')) failures.push(`${device.name} 抽屉切页失败：${title}`);
      if (await page.locator('.platform-tablet-drawer').isVisible()) failures.push(`${device.name} 抽屉切页后未关闭`);
      await context.close();
    }

    const loginContext = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const loginPage = await loginContext.newPage();
    await loginPage.goto(`${baseUrl}/#/platform-login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await loginPage.locator('.platform-login .login-shell').waitFor({ timeout: 20000 });
    await loginPage.waitForTimeout(400);
    const loginLandscape = await loginPage.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 2,
      introVisible: getComputedStyle(document.querySelector('.intro-panel')).display !== 'none',
      formVisible: Boolean(document.querySelector('.form-card') && document.querySelector('.form-card').getBoundingClientRect().height > 0)
    }));
    await loginPage.screenshot({ path: path.join(output, 'login-landscape-1024.png') });
    if (loginLandscape.overflow) failures.push('登录页横屏平板出现横向溢出');
    if (!loginLandscape.introVisible) failures.push('登录页横屏平板隐藏了品牌介绍');
    if (!loginLandscape.formVisible) failures.push('登录页横屏平板表单不可见');
    await loginPage.setViewportSize({ width: 768, height: 1024 });
    await loginPage.waitForTimeout(300);
    const loginPortrait = await loginPage.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 2,
      introVisible: getComputedStyle(document.querySelector('.intro-panel')).display !== 'none',
      formVisible: Boolean(document.querySelector('.form-card') && document.querySelector('.form-card').getBoundingClientRect().height > 0)
    }));
    await loginPage.screenshot({ path: path.join(output, 'login-portrait-768.png') });
    if (loginPortrait.overflow) failures.push('登录页竖屏平板出现横向溢出');
    if (loginPortrait.introVisible) failures.push('登录页竖屏平板未收起品牌介绍');
    if (!loginPortrait.formVisible) failures.push('登录页竖屏平板表单不可见');
    await loginContext.close();

    const report = {
      status: failures.length ? 'failed' : 'passed',
      target: '平台运营中心：电脑 1440 与平板 1180/1024 横屏、820/768 竖屏',
      desktop: desktop && desktop.state,
      drawerParity,
      results,
      notes,
      failures
    };
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: report.status, failures: failures.length, notes: notes.length, drawerParity: drawerParity && drawerParity.equal, files: results.length }, null, 2));
    if (notes.length) console.log(notes.slice(0, 12).join('\n'));
    if (failures.length) console.log(failures.slice(0, 30).join('\n'));
    process.exitCode = failures.length ? 1 : 0;
  } finally {
    await browser.close();
    await server.close();
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
