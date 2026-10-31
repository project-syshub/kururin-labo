// チーム分け: ランダムに振り分ける。条件(属性を均等に・別のチームにする人・同じチームにする人)を選べる
(function () {
  var KEY = 'team.state';
  var TEAM_COLORS = ['#d6342c', '#2b6cd4', '#2e9e4f', '#e07000', '#7a4cc2', '#1f8a8a', '#d6457f', '#8a5a2b'];
  var TEAM_NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var REVEAL_MS = 700;
  var TRIES = 3000;                          // 条件を満たす分け方を探す回数
  var DEFAULT_ROWS = 6;                      // 最初に出しておく参加者の行数
  var DEFAULT_AGE = '子ども', DEFAULT_SEX = '男';   // 新しい行の区分・性別の初期値

  var $ = function (id) { return document.getElementById(id); };
  var peopleEl = $('people'), rowTpl = $('person-row'), amountEl = $('amount'), revealEl = $('reveal');
  var teamsEl = $('teams'), emptyEl = $('empty'), errorEl = $('error'), noticeEl = $('notice');
  var btnAgain = $('btn-again'), btnCopy = $('btn-copy'), btnGo = $('btn-go');
  var conds = ['balance', 'apart', 'together'];
  var lastTeams = null, revealTimer = null;

  // ---- ハロウィンのデザイン(ON/OFF をヘッダーのボタンで切り替え。初期値は ON) ----
  var THEME_KEY = 'team.theme';
  function halloweenOn() {
    try { return localStorage.getItem(THEME_KEY) !== 'normal'; } catch (e) { return true; }
  }
  function applyTheme(on) {
    document.documentElement.classList.toggle('theme-halloween', on);
    var btn = $('btn-theme');
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = '🎃 ハロウィン ' + (on ? 'ON' : 'OFF');
  }
  applyTheme(halloweenOn());
  $('btn-theme').addEventListener('click', function () {
    var on = !document.documentElement.classList.contains('theme-halloween');
    try { localStorage.setItem(THEME_KEY, on ? 'halloween' : 'normal'); } catch (e) { /* 保存できなくても切り替えは効く */ }
    applyTheme(on);
  });

  // ---- 保存・復元 ----
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s) {
        var list = s.people;
        if (!list && s.names) {                       // 以前の「まとめて入力」形式の保存データを読み替える
          list = s.names.split(/\r?\n/).map(splitLine).filter(function (p) { return p.length; }).map(function (p) {
            var has = function (a) { return p.indexOf(a) > 0; };
            return { name: p[0], age: has('大人') ? '大人' : has('子ども') ? '子ども' : '', sex: has('男') ? '男' : has('女') ? '女' : '' };
          });
        }
        (list || []).forEach(function (p) { addRow(p); });
        amountEl.value = s.amount || 2;
        document.querySelector('input[name="mode"][value="' + (s.mode === 'size' ? 'size' : 'teams') + '"]').checked = true;
        revealEl.checked = s.reveal !== false;
        conds.forEach(function (c) { $('use-' + c).checked = !!(s.use && s.use[c]); });
        $('bal-age').checked = !s.balance || s.balance.age !== false;
        $('bal-sex').checked = !s.balance || s.balance.sex !== false;
        $('apart').value = s.apart || '';
        $('together').value = s.together || '';
      }
    } catch (e) { /* 保存データがなければ初期値 */ }
  }
  function save() {
    var use = {};
    conds.forEach(function (c) { use[c] = $('use-' + c).checked; });
    try {
      localStorage.setItem(KEY, JSON.stringify({
        people: rows(), amount: Number(amountEl.value), mode: mode(), reveal: revealEl.checked,
        use: use, balance: { age: $('bal-age').checked, sex: $('bal-sex').checked },
        apart: $('apart').value, together: $('together').value
      }));
    } catch (e) { /* 保存できなくても動作は続ける */ }
  }

  // ---- 入力 ----
  function splitLine(line) {
    return line.split(/[,、，]/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  // ---- 参加者の行 ----
  function addRow(p) {
    var li = rowTpl.content.firstElementChild.cloneNode(true);
    li.querySelector('.p-name').value = (p && p.name) || '';
    // 新しい行の初期値は「子ども」「男」(保存済みの行は保存した値のまま)
    li.querySelector('.p-age').value = p ? p.age || '' : DEFAULT_AGE;
    li.querySelector('.p-sex').value = p ? p.sex || '' : DEFAULT_SEX;
    li.querySelector('.p-del').addEventListener('click', function () {
      li.remove();
      if (!peopleEl.children.length) addRow();          // 少なくとも 1 行は残す
      updateInfo();
    });
    peopleEl.appendChild(li);
    return li;
  }
  // 入力中の行(名前が空の行も含む)
  function rows() {
    return [].map.call(peopleEl.children, function (li) {
      return { name: li.querySelector('.p-name').value, age: li.querySelector('.p-age').value, sex: li.querySelector('.p-sex').value };
    });
  }
  // 参加者(名前が入っている行だけ)。
  // tags は表示用の属性(区分・性別)、attrs は均等にする対象としてチェックした項目だけ
  function people() {
    var balAge = $('bal-age').checked, balSex = $('bal-sex').checked;
    return rows().map(function (r) {
      return {
        name: r.name.trim(),
        tags: [r.age, r.sex].filter(Boolean),
        attrs: [balAge ? r.age : '', balSex ? r.sex : ''].filter(Boolean)
      };
    }).filter(function (p) { return p.name; });
  }
  // 組み合わせ(1 行に 1 組)
  function groups(id) {
    return $(id).value.split(/\r?\n/).map(splitLine).filter(function (g) { return g.length >= 2; });
  }
  function use(c) { return $('use-' + c).checked; }
  function mode() { return document.querySelector('input[name="mode"]:checked').value; }
  function amount() { return Math.max(1, Math.min(50, Math.floor(Number(amountEl.value) || 1))); }

  function teamCount(n) {
    return mode() === 'teams' ? Math.min(amount(), n) : Math.ceil(n / amount());
  }

  function updateInfo() {
    var n = people().length;
    $('count').textContent = n + '人';
    $('amount-unit').textContent = mode() === 'teams' ? 'チーム' : '人ずつ';
    var preview = '';
    if (n > 0) {
      var t = teamCount(n), small = Math.floor(n / t), big = Math.ceil(n / t);
      preview = t + 'チーム(1チーム ' + (small === big ? small : small + '〜' + big) + '人)';
    }
    $('preview').textContent = preview;
    conds.forEach(function (c) { $('body-' + c).hidden = !use(c); });
    errorEl.textContent = '';
    noticeEl.textContent = '';
    save();
  }

  // ---- 乱数 ----
  function randInt(max) {
    var a = new Uint32Array(1), limit = Math.floor(4294967296 / max) * max;
    do { crypto.getRandomValues(a); } while (a[0] >= limit);
    return a[0] % max;
  }
  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = randInt(i + 1), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---- 振り分け ----
  // 「同じチームにする人」をまとめて 1 つの塊(unit)にし、塊ごとにチームへ配る。
  // 各塊は、条件に反しないチームのうち「人数が少ない」「同じ属性の人が少ない」チームへ(同点はランダム)。
  // これを何度か試し、条件を満たして人数の差が最小になった分け方を採用する。
  function plan(list, t) {
    var index = {};
    list.forEach(function (p, i) { index[p.name] = i; });

    // 名前の確認
    var unknown = [];
    var resolve = function (g) {
      return g.map(function (name) {
        if (!(name in index)) unknown.push(name);
        return index[name];
      });
    };
    var together = use('together') ? groups('together').map(resolve) : [];
    var apart = use('apart') ? groups('apart').map(resolve) : [];
    if (unknown.length) return { error: '参加者にいない名前があります: ' + unique(unknown).join('、') };

    // 同じチームにする人を塊にまとめる(union-find)
    var parent = list.map(function (_, i) { return i; });
    var find = function (i) { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    together.forEach(function (g) { for (var k = 1; k < g.length; k++) parent[find(g[k])] = find(g[0]); });
    var unitOf = {}, units = [];
    list.forEach(function (_, i) {
      var r = find(i);
      if (!(r in unitOf)) { unitOf[r] = units.length; units.push([]); }
      units[unitOf[r]].push(i);
    });

    // 別のチームにする人どうしの関係(塊の単位)
    var conflict = units.map(function () { return {}; });
    var contradiction = null;
    apart.forEach(function (g) {
      for (var a = 0; a < g.length; a++) for (var b = a + 1; b < g.length; b++) {
        var ua = unitOf[find(g[a])], ub = unitOf[find(g[b])];
        if (ua === ub) contradiction = list[g[a]].name + ' と ' + list[g[b]].name;
        conflict[ua][ub] = conflict[ub][ua] = true;
      }
    });
    if (contradiction) return { error: contradiction + ' が「別のチーム」と「同じチーム」の両方に入っています' };

    var cap = Math.ceil(list.length / t);
    var biggest = Math.max.apply(null, units.map(function (u) { return u.length; }));
    var balance = use('balance');
    // 属性ごとの人数のかたより(各属性について、いちばん多いチームと少ないチームの差の合計)
    var allAttrs = unique([].concat.apply([], list.map(function (p) { return p.attrs; })));
    var unevenness = function (attrCount) {
      return allAttrs.reduce(function (sum, a) {
        var c = attrCount.map(function (x) { return x[a] || 0; });
        return sum + Math.max.apply(null, c) - Math.min.apply(null, c);
      }, 0);
    };
    // 割り切れない属性は差 1 が最小
    var idealUneven = allAttrs.filter(function (a) {
      return list.filter(function (p) { return p.attrs.indexOf(a) !== -1; }).length % t !== 0;
    }).length;
    var best = null;

    for (var tryNo = 0; tryNo < TRIES; tryNo++) {
      var teams = [], attrCount = [];
      for (var i = 0; i < t; i++) { teams.push([]); attrCount.push({}); }
      var unitTeam = [];
      // 大きい塊・制約の多い塊から先に(同じ条件の中はランダム)
      var order = shuffle(units.map(function (_, i) { return i; })).sort(function (a, b) {
        return units[b].length - units[a].length || Object.keys(conflict[b]).length - Object.keys(conflict[a]).length;
      });
      var ok = order.every(function (u) {
        var members = units[u];
        var best2 = [], bestScore = Infinity;
        for (var k = 0; k < t; k++) {
          if (teams[k].length + members.length > Math.max(cap, biggest)) continue;
          var clash = Object.keys(conflict[u]).some(function (v) { return unitTeam[v] === k; });
          if (clash) continue;
          var score = teams[k].length * 10;
          if (balance) members.forEach(function (m) {
            list[m].attrs.forEach(function (a) { score += (attrCount[k][a] || 0) * 100; });   // 属性ごとに数える
          });
          if (score < bestScore) { bestScore = score; best2 = [k]; }
          else if (score === bestScore) best2.push(k);
        }
        if (!best2.length) return false;
        var pick = best2[randInt(best2.length)];
        unitTeam[u] = pick;
        members.forEach(function (m) {
          teams[pick].push(list[m]);
          list[m].attrs.forEach(function (a) { attrCount[pick][a] = (attrCount[pick][a] || 0) + 1; });
        });
        return true;
      });
      if (!ok) continue;
      var sizes = teams.map(function (x) { return x.length; });
      var spread = Math.max.apply(null, sizes) - Math.min.apply(null, sizes);
      var uneven = balance ? unevenness(attrCount) : 0;
      if (!best || spread < best.spread || (spread === best.spread && uneven < best.uneven)) best = { teams: teams, spread: spread, uneven: uneven };
      if (spread <= 1 && uneven <= idealUneven) break;
    }

    if (!best) return { error: '条件をすべて満たす分け方が見つかりませんでした。チーム数か条件を見直してください' };
    var result = shuffle(best.teams.map(shuffle)).sort(function (a, b) { return b.length - a.length; });
    return { teams: result, notice: best.spread > 1 ? '「同じチームにする人」の条件のため、チームの人数に' + best.spread + '人の差があります' : '' };
  }

  function unique(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  function teamName(i) { return 'チーム' + (TEAM_NAMES[i] || i + 1); }

  // ---- 表示 ----
  function render(teams) {
    clearTimeout(revealTimer);
    teamsEl.innerHTML = '';
    emptyEl.hidden = teams.length > 0;
    var showAttr = use('balance');
    var cards = teams.map(function (members, i) {
      var card = document.createElement('article');
      card.className = 'team-card';
      card.style.setProperty('--tc', TEAM_COLORS[i % TEAM_COLORS.length]);
      var h = document.createElement('h3');
      h.textContent = teamName(i);
      var small = document.createElement('small');
      small.textContent = members.length + '人';
      h.appendChild(small);
      var ol = document.createElement('ol');
      members.forEach(function (m) {
        var li = document.createElement('li');
        li.textContent = m.name;
        if (showAttr) m.tags.forEach(function (a) {
          var tag = document.createElement('span');
          tag.className = 'tag';
          tag.textContent = a;
          li.appendChild(tag);
        });
        ol.appendChild(li);
      });
      card.append(h, ol);
      if (showAttr) {
        var count = {};
        members.forEach(function (m) { m.tags.forEach(function (a) { count[a] = (count[a] || 0) + 1; }); });
        var sum = document.createElement('p');
        sum.className = 'summary';
        sum.textContent = Object.keys(count).sort().map(function (a) { return a + ' ' + count[a] + '人'; }).join(' / ');
        card.appendChild(sum);
      }
      teamsEl.appendChild(card);
      return card;
    });

    if (revealEl.checked) {
      cards.forEach(function (c) { c.classList.add('hidden-card'); });
      var i = 0;
      (function next() {
        if (i >= cards.length) { setBusy(false); return; }
        cards[i].classList.remove('hidden-card');
        cards[i].classList.add('show');
        i++;
        revealTimer = setTimeout(next, REVEAL_MS);
      })();
      setBusy(true);
    } else {
      cards.forEach(function (c) { c.classList.add('show'); });
      setBusy(false);
    }
  }

  function setBusy(busy) {
    btnGo.disabled = busy;
    btnAgain.disabled = busy || !lastTeams;
    btnCopy.disabled = busy || !lastTeams;
  }

  function go() {
    var list = people();
    errorEl.textContent = '';
    noticeEl.textContent = '';
    if (list.length < 2) { errorEl.textContent = '参加者を2人以上入力してください'; return; }
    var dup = unique(list.map(function (p) { return p.name; }).filter(function (n, i, a) { return a.indexOf(n) !== i; }));
    if (dup.length) { errorEl.textContent = '同じ名前が複数あります: ' + dup.join('、') + '(区別できるように名前を変えてください)'; return; }
    var r = plan(list, teamCount(list.length));
    if (r.error) { errorEl.textContent = r.error; return; }
    noticeEl.textContent = r.notice;
    lastTeams = r.teams;
    render(lastTeams);
  }

  function copy() {
    if (!lastTeams) return;
    var text = lastTeams.map(function (m, i) {
      return '【' + teamName(i) + '】' + m.map(function (p) { return p.name; }).join('、');
    }).join('\n');
    var done = function () { btnCopy.textContent = 'コピーしました'; setTimeout(function () { btnCopy.textContent = 'コピー'; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallback(text); done(); });
    else { fallback(text); done(); }
  }
  function fallback(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* 何もしない */ }
    ta.remove();
  }

  // ---- 操作 ----
  [amountEl, $('apart'), $('together')].forEach(function (el) { el.addEventListener('input', updateInfo); });
  peopleEl.addEventListener('input', updateInfo);
  peopleEl.addEventListener('change', updateInfo);
  $('btn-add').addEventListener('click', function () {
    addRow().querySelector('.p-name').focus();
    updateInfo();
  });
  revealEl.addEventListener('change', save);
  conds.forEach(function (c) { $('use-' + c).addEventListener('change', updateInfo); });
  ['bal-age', 'bal-sex'].forEach(function (id) { $(id).addEventListener('change', updateInfo); });
  document.querySelectorAll('input[name="mode"]').forEach(function (r) { r.addEventListener('change', updateInfo); });
  $('minus').addEventListener('click', function () { amountEl.value = Math.max(1, amount() - 1); updateInfo(); });
  $('plus').addEventListener('click', function () { amountEl.value = Math.min(50, amount() + 1); updateInfo(); });
  btnGo.addEventListener('click', go);
  btnAgain.addEventListener('click', go);
  btnCopy.addEventListener('click', copy);
  $('btn-fullscreen').addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  });

  load();
  while (peopleEl.children.length < DEFAULT_ROWS) addRow();
  updateInfo();
})();
