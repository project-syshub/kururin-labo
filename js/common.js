// 共通: 表示モード(自動 / PC / スマホ)の切替
(function () {
  var KEY = 'kururin.view';
  var BREAKPOINT = 768;
  var root = document.documentElement;

  function getView() {
    try {
      var v = localStorage.getItem(KEY);
      if (v === 'pc' || v === 'mobile') return v;
    } catch (e) { /* 保存できない環境では自動のまま */ }
    return 'auto';
  }

  function setView(v) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* 無視 */ }
    apply();
  }

  function apply() {
    var view = getView();
    var layout = view === 'auto' ? (window.innerWidth < BREAKPOINT ? 'mobile' : 'pc') : view;
    root.dataset.view = view;
    root.dataset.layout = layout;

    var vp = document.querySelector('meta[name="viewport"]');
    if (vp) vp.content = view === 'pc' ? 'width=1024' : 'width=device-width, initial-scale=1';

    document.querySelectorAll('[data-view-set]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.dataset.viewSet === view));
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-view-set]').forEach(function (btn) {
      btn.addEventListener('click', function () { setView(btn.dataset.viewSet); });
    });
    apply();
  });
  window.addEventListener('resize', apply);
  apply(); // 描画前に反映してちらつきを防ぐ
})();
