'use strict'
// ---------- 点球大战 ----------
  function renderPenalty() {
    var v = view()
    v.innerHTML = '<div class="back-row"><button type="button" class="gc-btn ghost" data-back="pk">返回</button></div>' +
      '<h3 class="view-title">点球大战</h3>' +
      '<p class="view-tip">瞄准球门角落射门，赢球送卡包！</p>' +
      '<div class="penalty-wrap"><div class="goal-frame" id="goalFrame">' +
      '<div class="goal-area" data-zone="lt">左上</div><div class="goal-area" data-zone="rt">右上</div>' +
      '<div class="goal-area" data-zone="lb">左下</div><div class="goal-area" data-zone="rb">右下</div>' +
      '<div class="keeper" id="keeper">🧤</div></div>' +
      '<div class="penalty-msg" id="penaltyMsg">点击球门区域射门！</div></div>' +
      '<div id="penaltyResult" class="spin-result"></div>'
    bindBack()
    var kicked = false
    Array.prototype.forEach.call(document.querySelectorAll('.goal-area'), function (el) {
      el.onclick = function () {
        if (kicked) return
        kicked = true
        var zone = el.getAttribute('data-zone')
        var keeperZone = ['lt', 'rt', 'lb', 'rb'][Math.floor(Math.random() * 4)]
        var goal = zone !== keeperZone
        var keeperEl = document.getElementById('keeper')
        keeperEl.className = 'keeper jump-' + keeperZone
        var msgEl = document.getElementById('penaltyMsg')
        if (goal) {
          msgEl.innerHTML = '<span style="color:#4de3c1;font-weight:800">⚽ 进球了！</span>'
          playSound('win')
          if (window.confetti) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#4de3c1', '#ffc94d'] })
          setTimeout(function () {
            document.getElementById('penaltyResult').innerHTML = '<div class="spin-prize">🎁 赢得卡包 x1</div><p style="color:#4de3c1;font-size:12px;margin-top:6px">已加入你的持卡池！</p>'
          }, 800)
        } else {
          msgEl.innerHTML = '<span style="color:#ff6b7d;font-weight:800">🧤 被扑出了！</span>'
          playSound('lose')
          setTimeout(function () {
            document.getElementById('penaltyResult').innerHTML = '<p style="color:#8b98bd">差一点！再试一次？</p><button type="button" class="gc-btn" id="penaltyAgain" style="margin-top:8px;padding:10px 24px">再来一次</button>'
            var againBtn = document.getElementById('penaltyAgain')
            if (againBtn) againBtn.onclick = function () { renderPenalty() }
          }, 800)
        }
      }
    })
  }
