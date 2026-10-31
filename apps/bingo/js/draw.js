// 抽選ロジック(75球式)
window.BingoDraw = (function () {
  var LETTERS = ['B', 'I', 'N', 'G', 'O'];
  var MAX = 75;

  function letterOf(n) { return LETTERS[Math.floor((n - 1) / 15)]; }

  // 偏りのない乱数(0 以上 max 未満)
  function randInt(max) {
    var a = new Uint32Array(1);
    var limit = Math.floor(4294967296 / max) * max;
    do { crypto.getRandomValues(a); } while (a[0] >= limit);
    return a[0] % max;
  }

  function remaining(drawn) {
    var seen = {};
    drawn.forEach(function (n) { seen[n] = true; });
    var rest = [];
    for (var i = 1; i <= MAX; i++) if (!seen[i]) rest.push(i);
    return rest;
  }

  function pick(drawn) {
    var rest = remaining(drawn);
    return rest.length ? rest[randInt(rest.length)] : null;
  }

  function colorOf(letter) {
    return getComputedStyle(document.documentElement).getPropertyValue('--ball-' + letter).trim();
  }

  return { LETTERS: LETTERS, MAX: MAX, letterOf: letterOf, randInt: randInt, remaining: remaining, pick: pick, colorOf: colorOf };
})();
