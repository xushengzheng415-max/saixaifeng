'use strict'
// ---------- ZzFX 音效合成（<1KB，零音频文件）：首次触摸时初始化 AudioContext ----------
  var zzfxCtx = null
  function zzfxInit() {
    if (zzfxCtx) return
    try {
      zzfxCtx = new (window.AudioContext || window.webkitAudioContext)()
      if (zzfxCtx.state === 'suspended') zzfxCtx.resume()
    } catch (e) {}
  }
  function zzfx(params) {
    if (!zzfxCtx) return
    try {
      var p = params.split(',').map(Number)
      // zzfx 核心算法（内联版，约 300 字节）
      var volume = p[0] || .3, randomness = p[1] || .05, frequency = p[2] || 440, attack = p[3] || 0, slide = p[4] || 0, noise = p[5] || 0, modulation = p[6] || 0, modulationPhase = p[7] || 0, distortion = p[8] || 0, sustain = p[9] || .1, release = p[10] || .1, decay = p[11] || .1, shape = p[12] || 0, deltaSlide = p[13] || 0, pitchJump = p[14] || 0, pitchJumpTime = p[15] || 0, repeatTime = p[16] || 0, sustainVolume = p[17] || .5, square = p[18] || 0, bitcrush = p[19] || 0
      var sampleRate = 44100, sign = v => v > 0 ? 1 : -1, f = 0, i = 0, sl = 0, length = 0, startFrequency = 0, slide2 = 1, t = 0, tm = 0, cr = 0, jump = 1
      var buffer = zzfxCtx.createBuffer(1, length = 44100 * 2, 44100), b = buffer.getChannelData(0), x = 0
      var r = [], f2 = 0, sl2 = 0, m = 0, c = 0
      for (i = 0; i < length; i++) {
        f2 = startFrequency = (frequency + slide * i / sampleRate * 100 + randomness * Math.random()) * (1 + pitchJump * (jump ? 1 : sign(Math.sin(pitchJumpTime * i / sampleRate))))
        if (bitcrush) f2 = Math.round(f2 / bitcrush) * bitcrush
        if (slide2) { sl2 += deltaSlide; f2 += sl2 * i / sampleRate * 100 }
        if (jump && i > length * pitchJumpTime) jump = 0
        if (repeatTime && !(i % Math.floor(repeatTime * sampleRate))) f2 = startFrequency
        f = sign(Math.sin(2 * 3.14159 * f2 * i / sampleRate + modulation * Math.sin(modulationPhase * i / sampleRate)))
        if (shape) f = shape === 1 ? sign(f) : f * f
        if (distortion) f = Math.atan(distortion * f)
        cr += (noise ? Math.random() * 2 - 1 : f) * volume * Math.exp(-i / (attack * sampleRate) * (i < attack * sampleRate ? 1 : 0)) * Math.exp(-Math.max(0, i - sustain * sampleRate) / (release * sampleRate))
        b[i] = cr
      }
      var source = zzfxCtx.createBufferSource(); source.buffer = buffer; source.connect(zzfxCtx.destination); source.start()
    } catch (e) {}
  }
  function playSound(name) {
    if (!zzfxCtx) zzfxInit()
    if (!zzfxCtx) return
    if (name === 'tap') zzfx('0.2,0,600,0,0,0,0,0,0,0.05,0.05,0,0,0,0,0,0,0.5,0,0')
    else if (name === 'collect') zzfx('0.3,0,880,0,0.1,0,0,0,0,0.15,0.1,0,0,0,0,0,0,0.5,0,0')
    else if (name === 'win') zzfx('0.3,0,523,0,0.3,0,0,0,0,0.2,0.15,0,0,0,0,0,0,0.5,0,0')
    else if (name === 'lose') zzfx('0.2,0,220,0,0,0,0,0,0,0.15,0.2,0,0,0,0,0,0,0.5,0,0')
    else if (name === 'spin') zzfx('0.15,0,800,0,0.05,0,0,0,0,0.08,0.08,0,0,0,0,0,0,0.5,0,0')
  }
  document.addEventListener('touchstart', zzfxInit, { once: true, passive: true })
  document.addEventListener('click', zzfxInit, { once: true })

  // ---------- 每日领卡转盘（lucky-canvas） ----------
