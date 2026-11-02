# 赛小蜂 · vMix 直播数据桥接器

本地运行在导播 PC 上的桥接脚本，把云端 `liveFeed` 实时比赛数据推送到 vMix，实现比分牌、计时、事件字幕、队徽等直播元素的自动更新。

## 架构

```
云端 liveFeed (webLoginApi)  ← 裁判H5录入的实时比分/事件
        │  HTTP(S) 轮询 (每 1~2s)
        ▼
  vmix-bridge.js (导播PC本地)
        │  vMix Web Controller HTTP API
        ▼
       vMix  ──→  推流到抖音/视频号
```

- 云端是唯一数据源，裁判手机不需要和导播 PC 在同一局域网。
- 桥接脚本只做「拉取 + 差异推送」，不存储业务数据。
- 队徽/球员照片下载到本地固定路径，vMix 图片输入直接指向该路径。

## 快速开始

### 1. 开启 vMix Web Controller

vMix → Settings → Web Controller → 勾选 Enable，记下端口（默认 8088）。

### 2. 准备配置

```bash
cd tools/vmix-bridge
copy config.example.json config.json
```

编辑 `config.json`，把 `feed.body.matchId` 改成当前比赛 ID，确认 `vmix.port` 与 vMix 一致。

### 3. 运行

```bash
node vmix-bridge.js
```

### 4. 验证

- 启动后日志会显示 `vMix 连接正常`；
- vMix 中对应标题输入的文本字段应开始更新；
- 每 15 秒（mock 模式）会触发一次事件字幕动画。

## 无云端接口时的验证方式

方式一：内置 mock（无需额外服务）

```bash
node vmix-bridge.js --mock
```

脚本自动生成演示比赛数据（每 20 秒一个事件），直接验证 vMix 链路。

方式二：独立 mock 服务（模拟真实 HTTP 接口）

```bash
# 终端 1
node mock-feed-server.js

# 终端 2，把 feed.url 改成 http://127.0.0.1:3030/liveFeed
node vmix-bridge.js
```

## 配置字段说明

| 字段 | 说明 |
|---|---|
| `feed.url` | liveFeed 接口地址（webLoginApi HTTP 入口） |
| `feed.method` | GET 或 POST |
| `feed.body` | POST 请求体，包含 `action: "liveFeed"` 和 `matchId` |
| `feed.pollIntervalMs` | 轮询间隔，默认 2000ms |
| `vmix.host` / `vmix.port` | vMix Web Controller 地址 |
| `mappings.*.input` | vMix 中对应的输入名称（标题输入 / 图片输入） |
| `mappings.*.field` | 标题输入中要写入的字段名（SelectedName） |
| `mappings.homeLogo.cachePath` | 队徽缓存到本地的相对路径（vMix 图片输入指向此文件） |
| `events.overlayInput` | 事件字幕条的 vMix 输入名，进球/红黄牌时触发 |
| `events.titleField` / `detailField` | 事件标题/详情字段名 |
| `events.showDurationMs` | 字幕展示时长（ms） |

## liveFeed 数据契约

桥接器期望接口返回以下结构（`{ data: {...} }` 包裹或直接返回均可）：

```json
{
  "matchId": "m2026102001",
  "status": "LIVE",
  "period": "2H",
  "periodStartTs": 1760900000000,
  "home": {
    "name": "曙光小学",
    "short": "曙光",
    "logo": "https://cdn.../team-xxx.png",
    "score": 2
  },
  "away": {
    "name": "实验二小",
    "short": "实验",
    "logo": "https://cdn.../team-yyy.png",
    "score": 1
  },
  "events": [
    {
      "eventId": "ev-001",
      "type": "goal",
      "minute": 34,
      "side": "home",
      "playerName": "张三"
    }
  ]
}
```

- `status`: `SCHEDULED` / `LIVE` / `HALF_TIME` / `FINISHED` 等
- `period`: `1H` / `2H` / `ET` / `PEN`
- `periodStartTs`: 当前阶段开始的毫秒时间戳，用于本地计时牌
- `events[].type`: `goal` / `yellow_card` / `red_card` / `second_yellow_red` / `substitution` / `penalty_scored` / `penalty_missed`
- `events[].side`: `home` / `away`
- 事件以 `eventId` 去重，同一条事件不会重复触发字幕动画

## 计时逻辑

- 当 `status` 为 `LIVE`/`IN_PROGRESS`/`PLAYING` 时，桥接器用本地时钟每秒递增（`MM:SS`），保证计时牌平滑；
- 其他状态直接显示 feed 返回的 `clock` 字段或状态文字。

## 图片缓存

- 队徽/球员照片下载到 `cache/` 目录下固定文件名；
- URL 未变化时不重复下载；
- vMix 图片输入（`SetImage`，vMix 25+）指向这些本地文件，脚本覆盖文件后 vMix 自动刷新。

## 故障恢复

- vMix 不可达时只打 warn 日志，不退出，恢复后自动续接；
- Feed 请求失败时保持上一次状态；
- 已推送事件 ID 持久化到 `state.json`，脚本重启后不重复触发历史事件字幕。

## 注意事项

- 本脚本仅使用 Node.js 内置模块，无需 `npm install`；
- 建议用 `pm2` 或 Windows 任务计划保持常驻；
- 生产部署前请确认 vMix Web Controller 端口未暴露到公网。
