// 保存・復元(localStorage。使えない環境ではメモリ上のみで動作)
window.BingoStorage = (function () {
  var KEY = 'bingo.state';
  var DEFAULT = { drawn: [], settings: { effect: true, sound: true, volume: 0.6, theme: 'halloween' } };

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && Array.isArray(raw.drawn)) {
        return {
          drawn: raw.drawn.filter(function (n) { return n >= 1 && n <= 75; }),
          settings: Object.assign({}, DEFAULT.settings, raw.settings)
        };
      }
    } catch (e) { /* 壊れたデータは無視 */ }
    return { drawn: [], settings: Object.assign({}, DEFAULT.settings) };
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        drawn: state.drawn,
        settings: state.settings,
        updatedAt: new Date().toISOString()
      }));
    } catch (e) { /* 保存できなくても動作は続ける */ }
  }

  return { load: load, save: save };
})();
