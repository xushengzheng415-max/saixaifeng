/**
 * 赛小蜂足球 · vMix 直播数据桥接脚本
 *
 * 职责：
 *   1. 轮询云端 liveFeed 实时比赛数据接口；
 *   2. 将比分、队名、计时、队徽/球员照片等写入 vMix（通过 vMix Web Controller HTTP API）；
 *   3. 新事件（进球/红黄牌/换人）触发 vMix 字幕条动画；
 *   4. 本地缓存图片到固定路径，供 vMix 图片输入直接引用。
 *
 * 设计原则：
 *   - 仅使用 Node.js 内置模块（http / https / fs / path / url），无需 npm install；
 *   - 所有 vMix 调用走 GET /api?Function=... 形式，与 vMix 官方 Web Controller 一致；
 *   - 失败重试 + 状态持久化，断网恢复后自动续接；
 *   - 事件去重：以 eventId 为准，已推送事件不重复触发动画。
 *
 * 用法：
 *   1. 复制 config.example.json 为 config.json 并按需修改；
 *   2. 在 vMix 中开启 Settings → Web Controller（默认端口 8088）；
 *   3. 运行：node vmix-bridge.js
 *   4. 无云端接口时可用 mock 模式验证：node vmix-bridge.js --mock
 */

'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// ---------------------------------------------------------------------------
// 常量与工具
// ---------------------------------------------------------------------------

const SCRIPT_DIR = __dirname;
const DEFAULT_CONFIG_PATH = path.join(SCRIPT_DIR, 'config.json');
const EXAMPLE_CONFIG_PATH = path.join(SCRIPT_DIR, 'config.example.json');

const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function nowTs() {
  return Date.now();
}

function fmtTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function makeLogger(levelName) {
  const threshold = LOG_LEVELS[levelName] ?? LOG_LEVELS.info;
  return (lv, ...args) => {
    if ((LOG_LEVELS[lv] ?? 99) < threshold) return;
    const prefix = `[${fmtTime(nowTs())}] [${lv.toUpperCase()}]`;
    if (lv === 'error') console.error(prefix, ...args);
    else if (lv === 'warn') console.warn(prefix, ...args);
    else console.log(prefix, ...args);
  };
}

/** 安全的 URL query 编码（vMix 对 Value 做 URL decode） */
function enc(v) {
  return encodeURIComponent(String(v ?? ''));
}

/** 读取 JSON 文件，失败返回 null */
function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/** 写 JSON 文件（原子写：先写临时文件再 rename） */
function writeJson(filePath, data) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

/** 确保目录存在 */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// HTTP 请求封装
// ---------------------------------------------------------------------------

/**
 * 通用 HTTP/HTTPS 请求
 * @param {object} opts - { method, url, headers, body(json对象或字符串), timeoutMs }
 * @returns {Promise<{status:number, headers:object, body:string}>}
 */
function httpRequest(opts) {
  return new Promise((resolve, reject) => {
    const url = new URL(opts.url);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const bodyStr = opts.body
      ? typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)
      : null;

    const headers = Object.assign({}, opts.headers || {});
    if (bodyStr && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = lib.request(
      {
        method: (opts.method || 'GET').toUpperCase(),
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers,
        timeout: opts.timeoutMs || 10000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('request timeout'));
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/** 下载二进制文件到本地路径，成功返回 true */
function downloadFile(url, destPath, timeoutMs) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.get(
        {
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname + u.search,
          headers: { 'User-Agent': 'sxf-vmix-bridge/1.0' },
          timeout: timeoutMs || 10000,
        },
        (res) => {
          if (res.statusCode < 200 || res.statusCode >= 400) {
            res.resume();
            resolve(false);
            return;
          }
          const tmp = `${destPath}.downloading`;
          const ws = fs.createWriteStream(tmp);
          res.pipe(ws);
          ws.on('finish', () => {
            ws.close(() => {
              try {
                fs.renameSync(tmp, destPath);
                resolve(true);
              } catch (e) {
                resolve(false);
              }
            });
          });
          ws.on('error', () => {
            try { fs.unlinkSync(tmp); } catch (_) {}
            resolve(false);
          });
        }
      );
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.on('error', () => resolve(false));
    } catch (e) {
      resolve(false);
    }
  });
}

// ---------------------------------------------------------------------------
// vMix 控制器
// ---------------------------------------------------------------------------

class VMixController {
  constructor(config, log) {
    this.host = config.host || '127.0.0.1';
    this.port = config.port || 8088;
    this.timeoutMs = config.timeoutMs || 5000;
    this.log = log;
  }

  baseUrl() {
    return `http://${this.host}:${this.port}/api`;
  }

  /** 调用 vMix Function API */
  async callFunction(fn, params = {}) {
    const qs = Object.entries(params)
      .map(([k, v]) => `${enc(k)}=${enc(v)}`)
      .join('&');
    const url = `${this.baseUrl()}?Function=${enc(fn)}${qs ? '&' + qs : ''}`;
    try {
      const res = await httpRequest({ url, method: 'GET', timeoutMs: this.timeoutMs });
      if (res.status >= 200 && res.status < 300) return true;
      this.log('warn', `vMix ${fn} 返回 HTTP ${res.status}`);
      return false;
    } catch (e) {
      this.log('warn', `vMix ${fn} 调用失败: ${e.message}`);
      return false;
    }
  }

  /** 设置标题文本字段 */
  setText(input, selectedName, value) {
    if (!input || !selectedName) return Promise.resolve(false);
    return this.callFunction('SetText', { Input: input, SelectedName: selectedName, Value: value });
  }

  /** 触发 Overlay 动画（输入切换到 Overlay 通道） */
  overlayInput(input) {
    if (!input) return Promise.resolve(false);
    return this.callFunction('OverlayInputAll', { Input: input });
  }

  /** 设置图片输入的源文件（vMix 25+） */
  setImage(input, localPath) {
    if (!input || !localPath) return Promise.resolve(false);
    return this.callFunction('SetImage', { Input: input, Value: localPath });
  }

  /** 健康检查：请求 /api 看是否能拿到 XML 状态 */
  async healthCheck() {
    try {
      const res = await httpRequest({ url: `${this.baseUrl()}`, method: 'GET', timeoutMs: this.timeoutMs });
      return res.status >= 200 && res.status < 300 && res.body.includes('<vmix>');
    } catch (e) {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// 图片缓存
// ---------------------------------------------------------------------------

class ImageCache {
  constructor(cacheDir, log) {
    this.cacheDir = cacheDir;
    this.log = log;
    this.urlMap = new Map(); // localPath -> lastUrl
    ensureDir(cacheDir);
    ensureDir(path.join(cacheDir, 'players'));
  }

  resolvePath(rel) {
    return path.join(this.cacheDir, rel);
  }

  /** 下载图片到固定路径，URL 未变化则跳过 */
  async ensure(url, relPath) {
    if (!url) return false;
    const full = this.resolvePath(relPath);
    const last = this.urlMap.get(full);
    if (last === url && fs.existsSync(full)) {
      return true; // 未变化
    }
    const ok = await downloadFile(url, full, 10000);
    if (ok) {
      this.urlMap.set(full, url);
      this.log('debug', `图片已缓存: ${relPath} <- ${url}`);
    } else {
      this.log('warn', `图片下载失败: ${url}`);
    }
    return ok;
  }
}

// ---------------------------------------------------------------------------
// 比赛分钟计算
// ---------------------------------------------------------------------------

/**
 * 根据 periodStartTs 计算当前比赛分钟
 * 若 periodStartTs 缺失则返回 null（由 feed 直接提供 minute 时优先使用）
 */
function calcMatchMinute(periodStartTs, now) {
  if (!periodStartTs) return null;
  const elapsedSec = Math.floor((now - periodStartTs) / 1000);
  if (elapsedSec < 0) return 0;
  // 简单按秒转分钟，半场休息等由 feed 的 period 字段表达
  const min = Math.floor(elapsedSec / 60);
  return min;
}

/** 格式化为 MM:SS（用于计时牌） */
function fmtClock(periodStartTs, now) {
  if (!periodStartTs) return '00:00';
  const elapsedSec = Math.max(0, Math.floor((now - periodStartTs) / 1000));
  const m = Math.floor(elapsedSec / 60);
  const s = elapsedSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// 事件格式化
// ---------------------------------------------------------------------------

const EVENT_LABELS = {
  goal: '进球',
  penalty_scored: '点球命中',
  penalty_missed: '点球未进',
  yellow_card: '黄牌',
  red_card: '红牌',
  second_yellow_red: '两黄变红',
  substitution: '换人',
  own_goal: '乌龙球',
};

function formatEventTitle(ev) {
  const label = EVENT_LABELS[ev.type] || ev.type || '事件';
  return label;
}

function formatEventDetail(ev, feed) {
  const side = ev.side === 'home' ? (feed.home?.name || '主队') : (feed.away?.name || '客队');
  const minute = ev.minute != null ? `${ev.minute}'` : '';
  const player = ev.playerName || ev.player || '';
  let detail = `${minute} ${side}`;
  if (player) detail += ` · ${player}`;
  if (ev.type === 'substitution' && ev.offPlayer) {
    detail += ` (${ev.offPlayer} → ${player})`;
  }
  return detail;
}

// ---------------------------------------------------------------------------
// 主桥接器
// ---------------------------------------------------------------------------

class VMixBridge {
  constructor(config) {
    this.config = config;
    this.log = makeLogger(config.logLevel || 'info');
    this.vmix = new VMixController(config.vmix || {}, this.log);
    this.cache = new ImageCache(config.cacheDir || path.join(SCRIPT_DIR, 'cache'), this.log);

    this.feedCfg = config.feed || {};
    this.mappings = config.mappings || {};
    this.eventsCfg = config.events || {};

    this.stateFile = config.stateFile || path.join(SCRIPT_DIR, 'state.json');
    this.clockTickMs = config.clockTickMs || 1000;

    // 运行时状态
    this.lastFeed = null;
    this.seenEventIds = new Set();
    this.lastClockText = null;
    this.running = false;
    this.feedTimer = null;
    this.clockTimer = null;
    this.overlayHideTimer = null;

    // 恢复持久化状态
    this.loadPersistedState();
  }

  loadPersistedState() {
    const s = readJson(this.stateFile);
    if (!s) return;
    if (Array.isArray(s.seenEventIds)) {
      this.seenEventIds = new Set(s.seenEventIds);
    }
    this.log('info', `已恢复 ${this.seenEventIds.size} 条历史事件记录`);
  }

  persistState() {
    try {
      writeJson(this.stateFile, {
        seenEventIds: Array.from(this.seenEventIds),
        lastMatchId: this.lastFeed?.matchId || null,
        savedAt: nowTs(),
      });
    } catch (e) {
      this.log('warn', `状态持久化失败: ${e.message}`);
    }
  }

  // ---- 生命周期 ----

  async start() {
    this.log('info', '赛小蜂 vMix 桥接器启动...');

    // vMix 健康检查（非阻塞，只警告）
    const ok = await this.vmix.healthCheck();
    if (ok) {
      this.log('info', `vMix 连接正常 (http://${this.vmix.host}:${this.vmix.port})`);
    } else {
      this.log('warn', `无法连接 vMix (http://${this.vmix.host}:${this.vmix.port})，请确认已开启 Web Controller`);
    }

    this.running = true;
    this.scheduleNextFeed();
    this.startClock();

    this.log('info', `轮询间隔: ${this.feedCfg.pollIntervalMs || 2000}ms`);
  }

  stop() {
    this.running = false;
    if (this.feedTimer) { clearTimeout(this.feedTimer); this.feedTimer = null; }
    if (this.clockTimer) { clearInterval(this.clockTimer); this.clockTimer = null; }
    if (this.overlayHideTimer) { clearTimeout(this.overlayHideTimer); this.overlayHideTimer = null; }
    this.persistState();
    this.log('info', '桥接器已停止');
  }

  // ---- Feed 轮询 ----

  scheduleNextFeed() {
    if (!this.running) return;
    const interval = this.feedCfg.pollIntervalMs || 2000;
    this.feedTimer = setTimeout(() => this.fetchAndApply(), interval);
  }

  async fetchAndApply() {
    try {
      const feed = await this.fetchFeed();
      if (feed) {
        await this.applyFeed(feed);
      }
    } catch (e) {
      this.log('warn', `Feed 轮询异常: ${e.message}`);
    } finally {
      this.scheduleNextFeed();
    }
  }

  async fetchFeed() {
    if (this.feedCfg.mock) {
      return this.generateMockFeed();
    }
    const url = this.feedCfg.url;
    if (!url) {
      this.log('warn', '未配置 feed.url');
      return null;
    }
    const opts = {
      url,
      method: this.feedCfg.method || 'GET',
      timeoutMs: this.feedCfg.timeoutMs || 8000,
      headers: this.feedCfg.headers || {},
    };
    // 合并请求体：配置的 body + 鉴权 token（若配置了 feed.token）
    const body = this.feedCfg.body ? { ...this.feedCfg.body } : {};
    if (this.feedCfg.token) body.token = this.feedCfg.token;
    if (Object.keys(body).length) opts.body = body;
    const res = await httpRequest(opts);
    if (res.status < 200 || res.status >= 300) {
      this.log('warn', `Feed HTTP ${res.status}`);
      return null;
    }
    let data;
    try {
      data = JSON.parse(res.body);
    } catch (e) {
      this.log('warn', `Feed JSON 解析失败: ${e.message}`);
      return null;
    }
    // 兼容 { data: {...} } 包裹
    return data.data || data;
  }

  // ---- 应用 feed 到 vMix ----

  async applyFeed(feed) {
    if (!feed || !feed.home || !feed.away) {
      this.log('debug', 'feed 数据不完整，跳过');
      return;
    }

    const isNewMatch = !this.lastFeed || this.lastFeed.matchId !== feed.matchId;
    if (isNewMatch) {
      this.log('info', `切换到比赛: ${feed.home.name} vs ${feed.away.name} (${feed.matchId})`);
      this.seenEventIds.clear();
    }

    // 队名 + 比分
    await this.updateScoreboard(feed);

    // 队徽图片
    await this.updateLogos(feed);

    // 事件（进球/红黄牌/换人）
    this.processEvents(feed);

    this.lastFeed = feed;
  }

  async updateScoreboard(feed) {
    const m = this.mappings;
    const tasks = [];

    if (m.homeName) tasks.push(this.vmix.setText(m.homeName.input, m.homeName.field, feed.home.name || ''));
    if (m.awayName) tasks.push(this.vmix.setText(m.awayName.input, m.awayName.field, feed.away.name || ''));
    if (m.homeShort) tasks.push(this.vmix.setText(m.homeShort.input, m.homeShort.field, feed.home.short || feed.home.name || ''));
    if (m.awayShort) tasks.push(this.vmix.setText(m.awayShort.input, m.awayShort.field, feed.away.short || feed.away.name || ''));
    if (m.homeScore) tasks.push(this.vmix.setText(m.homeScore.input, m.homeScore.field, feed.home.score ?? 0));
    if (m.awayScore) tasks.push(this.vmix.setText(m.awayScore.input, m.awayScore.field, feed.away.score ?? 0));
    if (m.period) tasks.push(this.vmix.setText(m.period.input, m.period.field, feed.period || ''));
    if (m.status) tasks.push(this.vmix.setText(m.status.input, m.status.field, feed.status || ''));

    await Promise.all(tasks);
  }

  async updateLogos(feed) {
    const m = this.mappings;
    if (m.homeLogo && feed.home.logo) {
      const ok = await this.cache.ensure(feed.home.logo, m.homeLogo.cachePath || 'home_logo.png');
      if (ok && m.homeLogo.input) {
        await this.vmix.setImage(m.homeLogo.input, this.cache.resolvePath(m.homeLogo.cachePath || 'home_logo.png'));
      }
    }
    if (m.awayLogo && feed.away.logo) {
      const ok = await this.cache.ensure(feed.away.logo, m.awayLogo.cachePath || 'away_logo.png');
      if (ok && m.awayLogo.input) {
        await this.vmix.setImage(m.awayLogo.input, this.cache.resolvePath(m.awayLogo.cachePath || 'away_logo.png'));
      }
    }
  }

  processEvents(feed) {
    const events = Array.isArray(feed.events) ? feed.events : [];
    if (events.length === 0) return;

    // 找出未推送过的新事件
    const fresh = events.filter((ev) => ev.eventId && !this.seenEventIds.has(ev.eventId));
    if (fresh.length === 0) return;

    // 只处理最新的一条（避免积压），其余标记已见
    for (const ev of fresh) {
      this.seenEventIds.add(ev.eventId);
    }
    const latest = fresh[fresh.length - 1];
    this.triggerEventOverlay(latest, feed);

    // 持久化（限流：每 10 条或切换时）
    if (this.seenEventIds.size % 10 === 0) {
      this.persistState();
    }
  }

  triggerEventOverlay(ev, feed) {
    const cfg = this.eventsCfg;
    if (!cfg.overlayInput) {
      this.log('info', `事件: ${formatEventTitle(ev)} ${formatEventDetail(ev, feed)}`);
      return;
    }
    const title = formatEventTitle(ev);
    const detail = formatEventDetail(ev, feed);
    this.log('info', `触发事件动画: ${title} | ${detail}`);

    (async () => {
      if (cfg.titleField) {
        await this.vmix.setText(cfg.overlayInput, cfg.titleField, title);
      }
      if (cfg.detailField) {
        await this.vmix.setText(cfg.overlayInput, cfg.detailField, detail);
      }
      // 主队色/客队色高亮（可选）
      if (cfg.sideField) {
        await this.vmix.setText(cfg.overlayInput, cfg.sideField, ev.side === 'home' ? 'home' : 'away');
      }
      await this.vmix.overlayInput(cfg.overlayInput);

      // 自动隐藏
      const duration = cfg.showDurationMs || 5000;
      if (this.overlayHideTimer) clearTimeout(this.overlayHideTimer);
      this.overlayHideTimer = setTimeout(() => {
        // vMix 中 Overlay 通道关闭通常由 GT 模板自带时长控制，这里仅做兜底
        this.log('debug', `事件字幕展示时长 ${duration}ms 已到`);
      }, duration);
    })();
  }

  // ---- 时钟 ----

  startClock() {
    this.clockTimer = setInterval(() => this.tickClock(), this.clockTickMs);
  }

  tickClock() {
    const m = this.mappings.clock;
    if (!m || !m.input || !m.field) return;
    if (!this.lastFeed) return;

    const feed = this.lastFeed;
    // 仅在 LIVE/IN_PROGRESS 时走本地计时，否则直接显示 feed 提供的分钟
    const liveStatus = (feed.status || '').toUpperCase();
    const isLive = ['LIVE', 'IN_PROGRESS', 'PLAYING'].includes(liveStatus);

    let text;
    if (isLive) {
      text = fmtClock(feed.periodStartTs, nowTs());
    } else {
      // 非进行中：显示 feed.status 或 00:00
      text = feed.clock || (feed.status === 'FINISHED' ? '完赛' : '00:00');
    }

    if (text !== this.lastClockText) {
      this.vmix.setText(m.input, m.field, text);
      this.lastClockText = text;
    }
  }

  // ---- Mock 数据生成（用于无云端接口时验证 vMix 链路） ----

  generateMockFeed() {
    const now = nowTs();
    if (!this._mockStart) {
      this._mockStart = now;
      this._mockScoreH = 0;
      this._mockScoreA = 0;
      this._mockEvents = [];
      this._mockEventSeq = 0;
    }
    const elapsed = Math.floor((now - this._mockStart) / 1000);
    const minute = Math.floor(elapsed / 60);

    // 每 20 秒模拟一个事件（演示用）
    if (elapsed > 0 && elapsed % 20 === 0 && this._mockLastEventAt !== elapsed) {
      this._mockLastEventAt = elapsed;
      const types = ['goal', 'yellow_card', 'substitution'];
      const type = types[Math.floor(Math.random() * types.length)];
      const side = Math.random() > 0.5 ? 'home' : 'away';
      this._mockEventSeq++;
      const ev = {
        eventId: `mock-${this._mockEventSeq}`,
        type,
        minute,
        side,
        playerName: ['张三', '李四', '王五', '赵六'][Math.floor(Math.random() * 4)],
      };
      this._mockEvents.push(ev);
      if (type === 'goal') {
        if (side === 'home') this._mockScoreH++;
        else this._mockScoreA++;
      }
    }

    return {
      matchId: 'mock-match-001',
      status: 'LIVE',
      period: elapsed < 2700 ? '1H' : '2H',
      periodStartTs: this._mockStart,
      home: {
        name: '曙光小学',
        short: '曙光',
        logo: 'https://dummyimage.com/200x200/4CAF50/ffffff.png&text=HOME',
        score: this._mockScoreH,
      },
      away: {
        name: '实验二小',
        short: '实验',
        logo: 'https://dummyimage.com/200x200/2196F3/ffffff.png&text=AWAY',
        score: this._mockScoreA,
      },
      events: this._mockEvents.slice(-5),
    };
  }
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

function loadConfig() {
  const args = process.argv.slice(2);
  const mockMode = args.includes('--mock');
  const configPathArg = args.find((a) => a.startsWith('--config='));
  const configPath = configPathArg ? configPathArg.slice('--config='.length) : DEFAULT_CONFIG_PATH;

  let config = readJson(configPath);
  if (!config) {
    // 回退到 example
    config = readJson(EXAMPLE_CONFIG_PATH);
    if (!config) {
      console.error(`找不到配置文件: ${configPath}`);
      console.error('请复制 config.example.json 为 config.json 后再运行');
      process.exit(1);
    }
    console.warn(`使用示例配置 ${EXAMPLE_CONFIG_PATH}（建议复制为 config.json 后修改）`);
  }

  if (mockMode) {
    config.feed = config.feed || {};
    config.feed.mock = true;
    console.log('已启用 MOCK 模式（不请求云端，自动生成演示数据）');
  }

  return config;
}

function main() {
  const config = loadConfig();
  const bridge = new VMixBridge(config);

  const shutdown = (signal) => {
    console.log(`\n收到 ${signal}，正在停止...`);
    bridge.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  bridge.start().catch((e) => {
    console.error('启动失败:', e);
    process.exit(1);
  });
}

main();
