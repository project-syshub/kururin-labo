// 効果音。ガラガラ音は Web Audio で合成した仮の音、「ジャン!」は音源ファイル(audio/jan.mp3)。
// 実物のガラガラ音が用意できたら audio/ に置き、rattle() の中身を音源の再生に差し替える(呼び出し側は変更不要)。
window.BingoSound = (function () {
  var ctx = null;
  var master = null;
  var noise = null;
  var enabled = true;
  var volume = 0.6;

  function ensure() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    var len = ctx.sampleRate * 2;   // シンバルの長い響き用に 2 秒分
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noise.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function ready() {
    if (!enabled || !ensure()) return false;
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  // 短いノイズの破裂音(玉が籠にぶつかる音)
  function tick(at, gain, freq) {
    var src = ctx.createBufferSource();
    src.buffer = noise;
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 2;
    var g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.035);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(at, Math.random() * 0.5, 0.05);
  }

  // ガラガラ回転音
  function rattle(seconds) {
    if (!ready()) return;
    var t0 = ctx.currentTime;
    var t = 0;
    while (t < seconds) {
      var env = Math.min(1, t / 0.3, (seconds - t) / 0.5);
      tick(t0 + t, (0.25 + Math.random() * 0.75) * Math.max(env, 0.1), 1200 + Math.random() * 3500);
      t += 0.012 + Math.random() * 0.03;
    }
  }

  // ポップアップで文字・数字が出るときの「ジャン!」(音源ファイル audio/jan.mp3)。
  // 2 回続けて鳴らしても重なるよう、鳴らすたびに複製して再生する
  var janAudio = null;
  function jan() {
    if (!enabled) return;
    if (!janAudio) {
      janAudio = new Audio("audio/jan.mp3");
      janAudio.preload = "auto";
    }
    var a = janAudio.cloneNode();
    a.volume = Math.max(0, Math.min(1, volume));
    var p = a.play();
    if (p && p.catch) p.catch(function () { /* 再生できない環境では鳴らさない */ });
  }

  // 最初の抽選で遅れないよう、前もって読み込んでおく
  function preload() {
    if (!janAudio) {
      janAudio = new Audio("audio/jan.mp3");
      janAudio.preload = "auto";
      janAudio.load();
    }
  }

  function configure(opts) {
    if (typeof opts.enabled === 'boolean') enabled = opts.enabled;
    if (typeof opts.volume === 'number') {
      volume = opts.volume;
      if (master) master.gain.value = volume;
    }
  }

  return { rattle: rattle, jan: jan, preload: preload, configure: configure };
})();
