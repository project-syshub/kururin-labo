// 画面の組み立てと操作
(function () {
  var SPIN_MS = 3200;
  var state = BingoStorage.load();
  var busy = false;
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var $ = function (id) { return document.getElementById(id); };

  // デザイン(ハロウィン / 通常)。玉の色は CSS 変数で切り替わるので、描画より先に反映する
  function applyTheme() {
    document.documentElement.classList.toggle('theme-halloween', state.settings.theme === 'halloween');
  }
  applyTheme();
  var btnDraw = $('btn-draw'), btnUndo = $('btn-undo'), btnReset = $('btn-reset');
  var ball = $('ball'), ballLetter = $('ball-letter'), ballNumber = $('ball-number');
  var cells = {};

  // 盤面
  (function buildBoard() {
    var board = $('board');
    BingoDraw.LETTERS.forEach(function (L, row) {
      var line = document.createElement('div');
      line.className = 'board-row';
      var label = document.createElement('div');
      label.className = 'board-label';
      label.style.background = 'var(--ball-' + L + ')';
      label.style.color = '#fff';
      label.textContent = L;
      line.appendChild(label);
      for (var i = 1; i <= 15; i++) {
        var n = row * 15 + i;
        var c = document.createElement('div');
        c.className = 'cell';
        c.dataset.letter = L;
        c.textContent = n;
        cells[n] = c;
        line.appendChild(c);
      }
      board.appendChild(line);
    });
  })();

  var handle = BingoGara.init($('machine'));

  function showBall(n, pop) {
    ball.classList.remove('pop');
    if (n == null) {
      ball.classList.add('blank');
      delete ball.dataset.letter;
      ballLetter.textContent = '';
      ballNumber.textContent = '--';
      ball.setAttribute('aria-label', 'まだ抽選していません');
      return;
    }
    var L = BingoDraw.letterOf(n);
    ball.style.setProperty('--c', BingoDraw.colorOf(L));
    ball.classList.remove('blank');
    ball.dataset.letter = L;
    ballLetter.textContent = L;
    ballNumber.textContent = n;
    ball.setAttribute('aria-label', L + ' の ' + n);
    if (pop) { void ball.offsetWidth; ball.classList.add('pop'); }
  }

  function render(pop) {
    var last = state.drawn[state.drawn.length - 1];
    Object.keys(cells).forEach(function (k) {
      var drawn = state.drawn.indexOf(Number(k)) !== -1;
      cells[k].classList.toggle('drawn', drawn);
      cells[k].classList.toggle('latest', Number(k) === last);
    });
    showBall(last, pop);

    var rest = BingoDraw.remaining(state.drawn);
    $('remain').textContent = '残り ' + rest.length + ' / ' + BingoDraw.MAX;
    BingoGara.updateBalls(rest);
    updateButtons();
  }

  function updateButtons() {
    var rest = state.drawn.length >= BingoDraw.MAX;
    btnDraw.disabled = busy || rest;
    btnDraw.textContent = rest ? '終了しました' : (busy ? '抽選中…' : '抽選する');
    btnUndo.disabled = busy || !state.drawn.length;
    btnReset.disabled = busy || !state.drawn.length;
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  async function draw() {
    if (busy) return;
    var n = BingoDraw.pick(state.drawn); // 結果は演出の前に決める
    if (n == null) return;
    busy = true;
    updateButtons();
    var popupFrom = null;
    if (state.settings.effect && !reduceMotion) {
      BingoSound.rattle(SPIN_MS / 1000);
      await BingoGara.spin(SPIN_MS);
      BingoGara.takeBall(n);
      popupFrom = BingoGara.cageCenter();             // 止まった籠の中央からポップアップへ
    }
    state.drawn.push(n);
    BingoStorage.save(state);
    render(true);
    if (popupFrom) await showPopup(n, popupFrom);
    busy = false;
    updateButtons();
  }

  // 出た番号を画面中央に大きく表示する。排出口の位置から飛び出すように広がり、
  // クリック・キー操作・一定時間で閉じる
  var POPUP_MS = 3800;                                  // 白玉 → 文字 → 数字 と出てから少し見せる
  var REVEAL_LETTER_MS = 800;                           // 文字が出る時刻(bingo.css と合わせる)
  function showPopup(n, from) {
    return new Promise(function (resolve) {
      var popup = $('popup'), pball = $('popup-ball');
      var L = BingoDraw.letterOf(n);
      pball.style.setProperty('--c', BingoDraw.colorOf(L));
      pball.dataset.letter = L;
      $('popup-letter').textContent = L;
      $('popup-number').textContent = n;
      popup.setAttribute('aria-label', L + ' の ' + n);
      popup.hidden = false;
      popup.classList.remove('closing');
      var r = pball.getBoundingClientRect();
      pball.style.setProperty('--fx', (from.x - (r.left + r.width / 2)) + 'px');
      pball.style.setProperty('--fy', (from.y - (r.top + r.height / 2)) + 'px');
      pball.classList.remove('pop-in');
      void pball.offsetWidth;
      pball.classList.add('pop-in');

      // アルファベットが出るタイミング(bingo.css の reveal の遅れと同じ)で「ジャン!」
      var sounds = reduceMotion ? [0] : [REVEAL_LETTER_MS];
      var soundTimers = sounds.map(function (ms) { return setTimeout(BingoSound.jan, ms); });

      var done = false, timer = setTimeout(close, POPUP_MS);
      function close() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        soundTimers.forEach(clearTimeout);                // 途中で閉じたら残りは鳴らさない
        popup.removeEventListener('click', close);
        document.removeEventListener('keydown', close);
        popup.classList.add('closing');
        setTimeout(function () { popup.hidden = true; resolve(); }, 250);
      }
      popup.addEventListener('click', close);
      document.addEventListener('keydown', close);
    });
  }

  function undo() {
    if (busy || !state.drawn.length) return;
    state.drawn.pop();
    BingoStorage.save(state);
    render(false);
  }

  function reset() {
    if (busy || !state.drawn.length) return;
    if (!confirm('抽選結果をすべて消して最初からやり直しますか?')) return;
    state.drawn = [];
    BingoStorage.save(state);
    render(false);
  }

  btnDraw.addEventListener('click', draw);
  handle.addEventListener('click', draw);
  btnUndo.addEventListener('click', undo);
  btnReset.addEventListener('click', reset);

  // 全画面
  $('btn-fullscreen').addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  });

  // 設定
  var dlg = $('dialog-settings'), setEffect = $('set-effect'), setSound = $('set-sound'), setVol = $('set-volume'), setTheme = $('set-theme');
  function applySettings() {
    BingoSound.configure({ enabled: state.settings.sound, volume: state.settings.volume });
  }
  $('btn-settings').addEventListener('click', function () {
    setEffect.checked = state.settings.effect;
    setSound.checked = state.settings.sound;
    setVol.value = state.settings.volume;
    setTheme.value = state.settings.theme;
    dlg.showModal();
  });
  setTheme.addEventListener('change', function () {
    state.settings.theme = setTheme.value;
    BingoStorage.save(state);
    applyTheme();
    render(false);                                      // 玉の色を新しいデザインの色で塗り直す
  });
  setEffect.addEventListener('change', function () { state.settings.effect = setEffect.checked; BingoStorage.save(state); });
  setSound.addEventListener('change', function () { state.settings.sound = setSound.checked; applySettings(); BingoStorage.save(state); });
  setVol.addEventListener('input', function () { state.settings.volume = Number(setVol.value); applySettings(); BingoStorage.save(state); });

  applySettings();
  BingoSound.preload();
  render(false);
})();
