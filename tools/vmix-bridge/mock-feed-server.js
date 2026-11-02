/**
 * 本地 Mock liveFeed 服务
 *
 * 用途：在云端 liveFeed 接口尚未上线时，用本地 HTTP 服务模拟实时比赛数据，
 *       供 vmix-bridge.js 对接测试，验证 vMix 链路是否通畅。
 *
 * 用法：
 *   node mock-feed-server.js           # 默认端口 3030
 *   PORT=3100 node mock-feed-server.js
 *
 * 然后把 vmix-bridge 的 feed.url 改为 http://127.0.0.1:3030/liveFeed
 */

'use strict';

const http = require('http');

const PORT = parseInt(process.env.PORT || '3030', 10);

let state = {
  startTime: Date.now(),
  scoreH: 0,
  scoreA: 0,
  events: [],
  seq: 0,
};

function eventLabel(type) {
  return {
    goal: '进球',
    yellow_card: '黄牌',
    red_card: '红牌',
    substitution: '换人',
  }[type] || type;
}

function genFeed() {
  const now = Date.now();
  const elapsed = Math.floor((now - state.startTime) / 1000);
  const minute = Math.floor(elapsed / 60);

  // 每 15 秒模拟一个事件
  const bucket = Math.floor(elapsed / 15);
  while (state.seq < bucket) {
    state.seq++;
    const r = Math.random();
    let type;
    if (r < 0.5) type = 'goal';
    else if (r < 0.75) type = 'yellow_card';
    else if (r < 0.85) type = 'substitution';
    else type = 'red_card';

    const side = Math.random() > 0.5 ? 'home' : 'away';
    const players = ['张三', '李四', '王五', '赵六', '孙七', '周八'];
    const ev = {
      eventId: `mock-${state.seq}`,
      type,
      minute,
      side,
      playerName: players[Math.floor(Math.random() * players.length)],
    };
    state.events.push(ev);
    if (type === 'goal') {
      if (side === 'home') state.scoreH++;
      else state.scoreA++;
    }
  }

  const period = elapsed < 2700 ? '1H' : '2H'; // 45分钟半场，mock 用 45 秒
  let status = 'LIVE';
  if (elapsed >= 5400) status = 'FINISHED'; // 90 分钟后完赛

  return {
    matchId: 'mock-match-001',
    status,
    period,
    periodStartTs: state.startTime,
    clock: `${String(minute).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`,
    home: {
      name: '曙光小学',
      short: '曙光',
      logo: 'https://dummyimage.com/200x200/4CAF50/ffffff.png&text=HOME',
      score: state.scoreH,
    },
    away: {
      name: '实验二小',
      short: '实验',
      logo: 'https://dummyimage.com/200x200/2196F3/ffffff.png&text=AWAY',
      score: state.scoreA,
    },
    events: state.events.slice(-10),
  };
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.url === '/health') {
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.url.startsWith('/liveFeed') || req.url === '/') {
    const feed = genFeed();
    res.end(JSON.stringify({ code: 0, data: feed }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock liveFeed 服务已启动: http://127.0.0.1:${PORT}/liveFeed`);
  console.log('每 15 秒自动生成一条事件，Ctrl+C 退出');
});
