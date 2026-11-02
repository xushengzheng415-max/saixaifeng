'use strict'
// ---------- 每日转盘 ----------
  function renderDailySpin() {
    var v = view()
    v.innerHTML = '<div class="back-row"><button type="button" class="gc-btn ghost" data-back="map">返回地图</button></div>' +
      '<h3 class="view-title">每日领卡</h3>' +
      '<p class="view-tip">每天免费转一次，赢取球员卡或卡包！</p>' +
      '<div class="spin-wrap"><div id="luckyWheel"></div></div>' +
      '<div id="spinResult" class="spin-result"></div>'
    bindBack()
    if (state.dailySpun) {
      document.getElementById('spinResult').innerHTML = '<div class="spin-prize">' + state.dailyPrize + '</div><p style="color:#8b98bd;font-size:12px;margin-top:8px">明天再来吧～</p>'
      return
    }
    if (!window.LuckyCanvas) {
      document.getElementById('spinResult').innerHTML = '<p style="color:#ff6b7d">转盘加载失败，请刷新重试</p>'
      return
    }
    var prizes = [
      { title: '铜卡 x1', name: '铜卡', tier: 'bronze', color: '#e09a5f' },
      { title: '银卡 x1', name: '银卡', tier: 'silver', color: '#c9d4e8' },
      { title: '谢谢参与', name: 'none', tier: '', color: '#3a4a6b' },
      { title: '金卡 x1', name: '金卡', tier: 'gold', color: '#ffc94d' },
      { title: '卡包 x1', name: 'pack', tier: 'any', color: '#4de3c1' },
      { title: '铜卡 x2', name: '铜卡x2', tier: 'bronze', color: '#e09a5f' }
    ]
    try {
      new LuckyCanvas.LuckyWheel('#luckyWheel', {
        width: '300px', height: '300px',
        blocks: [{ padding: '10px', background: '#141f3d' }],
        prizes: prizes.map(function (p) { return { title: p.title, background: p.color, fonts: [{ text: p.title, top: '15%', fontColor: p.name === 'none' ? '#8b98bd' : '#3a2a00' }] } }),
        buttons: [{ radius: '25%', background: '#ffc94d', pointer: true, fonts: [{ text: '开始', top: '-10px', fontColor: '#3a2a00', fontWeight: '800' }] }],
        onStart: function () {
          playSound('spin')
          state.dailySpun = true
          // 模拟转盘结果（真实模式由后端控制概率）
          var winIdx = Math.floor(Math.random() * prizes.length)
          var prize = prizes[winIdx]
          var granted = prize.tier ? grantCard(prize.tier) : null
          state.dailyPrize = granted ? prize.title + ' · ' + granted.name : prize.title
          setTimeout(function () {
            var html = '<div class="spin-prize">' + (granted ? '🎉 获得：' + prize.title : '😅 ' + prize.title) + '</div>'
            if (granted) {
              html += '<div class="scratch-gain"><div class="sg-card"><img src="' + esc(granted.cardUrl) + '" alt="' + esc(granted.name) + '"><span>' + esc(granted.name) + ' · ' + granted.points + '分</span></div></div>' +
                '<p class="gain-hint">「' + esc(granted.name) + '」已加入你的持卡池，去「阵容」页就能上阵</p>'
              playSound('collect')
              if (window.confetti) confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 }, colors: [prize.color, '#ffffff'] })
            } else {
              playSound('tap')
            }
            document.getElementById('spinResult').innerHTML = html
          }, 2500)
        }
      })
    } catch (e) {
      document.getElementById('spinResult').innerHTML = '<p style="color:#ff6b7d">转盘初始化失败</p>'
    }
  }

  // ---------- 刮刮卡（收集大厅彩蛋） ----------
