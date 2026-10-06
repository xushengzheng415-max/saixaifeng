window.BOARD_DATA = {
  title: '赛小蜂足球 · 公众专业版抽签大屏',
  version: '2026-08-19-awaiting-confirmation',
  sections: [
    {
      id: 'public-draw-screen',
      title: '独立公众大屏 · 专业版抽签第一阶段',
      groups: [
        {
          title: '发布快照全链路',
          nodes: [
            { label: '抽签介绍待机', type: 'entry', path: '../prototypes/screen-draw-intro-1920x1080.png', logic: '主办方手动发布后进入待机；展示赛事、竞赛组别、32支球队、8个小组和等待开始状态。' },
            { label: '参赛球队展示', type: 'entry', path: '../prototypes/screen-draw-teams-1920x1080.png', logic: '只读展示32支公开球队与8支种子球队；长队名和缺队徽保持稳定布局。' },
            { label: '抽签进行中', type: 'entry', path: '../prototypes/screen-draw-drawing-1920x1080.png', logic: '只读同步当前签位、当前球队、目标小组和8组进度；公众端不接受写入。' },
            { label: '分组结果', type: 'entry', path: '../prototypes/screen-draw-result-1920x1080.png', logic: '展示8组32支球队与发布版本；只消费主办方已发布的结果快照。' },
            { label: '发布已撤回', type: 'entry', path: '../prototypes/screen-draw-revoked-1920x1080.png', logic: '发布撤回后令牌立即失效，只显示通用撤回状态，不返回赛事数据。' },
            { label: '链接无效或已过期', type: 'entry', path: '../prototypes/screen-draw-invalid-1920x1080.png', logic: '令牌无效、过期或版本替换时只显示不可用状态，不允许赛事ID直查。' },
            { label: '断网与恢复', type: 'entry', path: '../prototypes/screen-draw-offline-1920x1080.png', logic: '断网时保留最近一次已验证快照并自动重试；恢复后重新校验令牌、版本和发布状态。' }
          ]
        }
      ]
    }
  ]
}
