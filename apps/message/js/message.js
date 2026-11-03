// メッセージ: ネームと内容を管理者へ送る。管理者はパスワードを入れて届いた一覧を見る
// 送信先は Google Apps Script(gas/Code.gs)。パスワードの確認もそちらで行う
(function () {
  var KEY = 'message.draft';
  var MAX_TEXT = 2000;

  var $ = function (id) { return document.getElementById(id); };
  var nameEl = $('name'), textEl = $('text'), countEl = $('count');
  var errorEl = $('error'), noticeEl = $('notice'), btnSend = $('btn-send');
  var userView = $('user-view'), adminView = $('admin-view'), btnMode = $('btn-mode');
  var inboxEl = $('inbox'), emptyEl = $('empty'), totalEl = $('total'), adminErrorEl = $('admin-error');
  var dialog = $('pw-dialog'), pwEl = $('pw'), pwErrorEl = $('pw-error'), pwOk = $('pw-ok');
  var password = null;                       // 確認できたパスワード(ページを閉じると消える)

  // ---- 書きかけの保存・復元(再読み込みしても消えない) ----
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s) { nameEl.value = s.name || ''; textEl.value = s.text || ''; }
    } catch (e) { /* 保存データがなければ空のまま */ }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ name: nameEl.value, text: textEl.value })); } catch (e) { /* 保存できなくても動作は続ける */ }
  }
  function updateCount() { countEl.textContent = textEl.value.length + ' / ' + MAX_TEXT; }

  // ---- 送信先との通信 ----
  // Content-Type を text/plain にすると事前確認(CORS のプリフライト)なしで Apps Script に届く
  function call(payload) {
    if (!window.MESSAGE_ENDPOINT) return Promise.reject(new Error('送信先が設定されていません(js/config.js)'));
    return fetch(window.MESSAGE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) throw new Error('通信に失敗しました');
      return r.json();
    }, function () { throw new Error('通信に失敗しました。ネットワークを確認してください'); });
  }

  // ---- ユーザー画面 ----
  function send() {
    var name = nameEl.value.trim(), text = textEl.value.trim();
    errorEl.textContent = '';
    noticeEl.textContent = '';
    if (!name) { errorEl.textContent = 'ネームを入力してください'; nameEl.focus(); return; }
    if (!text) { errorEl.textContent = '内容を入力してください'; textEl.focus(); return; }
    btnSend.disabled = true;
    btnSend.textContent = '送信中…';
    call({ action: 'send', name: name, text: text }).then(function (res) {
      if (!res.ok) throw new Error(res.error || '送信できませんでした');
      textEl.value = '';                     // ネームは次回も使えるように残す
      save();
      updateCount();
      noticeEl.textContent = '送信しました。ありがとうございます';
    }).catch(function (e) {
      errorEl.textContent = e.message;
    }).then(function () {
      btnSend.disabled = false;
      btnSend.textContent = '送信する';
    });
  }

  function clearText() {
    if (textEl.value && !confirm('内容を消してもよいですか?')) return;
    textEl.value = '';
    save();
    updateCount();
    noticeEl.textContent = '';
    textEl.focus();
  }

  // ---- 管理者画面 ----
  function showAdmin(on) {
    userView.hidden = on;
    adminView.hidden = !on;
    btnMode.textContent = on ? 'ユーザー画面へ' : '管理者';
  }

  function openPassword() {
    pwEl.value = '';
    pwErrorEl.textContent = '';
    dialog.showModal();
    pwEl.focus();
  }

  function checkPassword(ev) {
    ev.preventDefault();
    var pw = pwEl.value.trim();
    if (!pw) { pwErrorEl.textContent = 'パスワードを入力してください'; return; }
    pwOk.disabled = true;
    pwErrorEl.textContent = '';
    call({ action: 'list', password: pw }).then(function (res) {
      if (!res.ok) throw new Error(res.error === 'password' ? 'パスワードが違います' : (res.error || '開けませんでした'));
      password = pw;
      dialog.close();
      showAdmin(true);
      render(res.messages);
    }).catch(function (e) {
      pwErrorEl.textContent = e.message;
      pwEl.select();
    }).then(function () { pwOk.disabled = false; });
  }

  function reload() {
    adminErrorEl.textContent = '';
    call({ action: 'list', password: password }).then(function (res) {
      if (!res.ok) throw new Error(res.error || '読み込めませんでした');
      render(res.messages);
    }).catch(function (e) { adminErrorEl.textContent = e.message; });
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // 新しいものから順に並べる
  function render(list) {
    inboxEl.innerHTML = '';
    (list || []).forEach(function (m) {
      var li = document.createElement('li');
      var meta = document.createElement('div');
      meta.className = 'meta';
      var who = document.createElement('span');
      who.className = 'who';
      who.textContent = m.name;
      var at = document.createElement('span');
      at.className = 'at';
      at.textContent = formatDate(m.at);
      meta.append(who, at);
      var body = document.createElement('p');
      body.className = 'body';
      body.textContent = m.text;
      li.append(meta, body);
      inboxEl.append(li);
    });
    totalEl.textContent = (list || []).length + '件';
    emptyEl.hidden = !!(list && list.length);
  }

  // ---- 操作 ----
  nameEl.addEventListener('input', save);
  textEl.addEventListener('input', function () { save(); updateCount(); });
  btnSend.addEventListener('click', send);
  $('btn-clear').addEventListener('click', clearText);
  btnMode.addEventListener('click', function () {
    if (adminView.hidden) openPassword();
    else showAdmin(false);
  });
  $('pw-form').addEventListener('submit', checkPassword);
  $('pw-cancel').addEventListener('click', function () { dialog.close(); });
  $('btn-reload').addEventListener('click', reload);

  load();
  updateCount();
})();
