// ホーム画面: apps.js の登録リストからカードを描画する
(function () {
  var grid = document.getElementById('app-grid');
  var empty = document.getElementById('empty');
  var apps = (window.KURURIN_APPS || []).filter(function (a) { return a.status !== 'hidden'; });

  if (!apps.length) {
    empty.hidden = false;
    return;
  }

  apps.forEach(function (app) {
    var li = document.createElement('li');
    var preparing = app.status === 'preparing';
    var card = document.createElement(preparing ? 'div' : 'a');
    card.className = 'app-card' + (preparing ? ' preparing' : '');
    if (preparing) card.setAttribute('aria-disabled', 'true');
    else card.href = app.path;

    var img = document.createElement('img');
    img.src = app.icon;
    img.alt = '';

    var text = document.createElement('span');
    text.className = 'text';
    var name = document.createElement('span');
    name.className = 'app-name';
    name.textContent = app.name;
    var desc = document.createElement('span');
    desc.className = 'app-desc';
    desc.textContent = app.description;
    text.append(name, desc);

    card.append(img, text);
    if (preparing) {
      var badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = '準備中';
      card.append(badge);
    }
    li.append(card);
    grid.append(li);
  });
})();
