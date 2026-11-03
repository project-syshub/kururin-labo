// メッセージアプリの受け口(Google Apps Script)
// スプレッドシートの「拡張機能 > Apps Script」に貼り付け、ウェブアプリとしてデプロイする(手順は design-app-message.md)
var PASSWORD = '0527';          // 管理者画面のパスワード
var SHEET_NAME = 'messages';
var MAX_NAME = 50, MAX_TEXT = 2000;

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: '送信内容を読めませんでした' }); }
  if (req.action === 'send') return send(req);
  if (req.action === 'list') return list(req);
  return json({ ok: false, error: '不明な操作です' });
}

function send(req) {
  var name = String(req.name || '').trim().slice(0, MAX_NAME);
  var text = String(req.text || '').trim().slice(0, MAX_TEXT);
  if (!name || !text) return json({ ok: false, error: 'ネームと内容を入力してください' });
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet().appendRow([new Date(), plain(name), plain(text)]);
  } finally {
    lock.releaseLock();
  }
  return json({ ok: true });
}

function list(req) {
  if (String(req.password) !== PASSWORD) return json({ ok: false, error: 'password' });
  var rows = sheet().getDataRange().getValues().slice(1);   // 1 行目は見出し
  var messages = rows.map(function (r) {
    return { at: r[0] instanceof Date ? r[0].toISOString() : String(r[0]), name: String(r[1]), text: String(r[2]) };
  }).reverse();
  return json({ ok: true, messages: messages });
}

function sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) sh.appendRow(['送信日時', 'ネーム', '内容']);
  return sh;
}

// = + - @ で始まる文字が数式として扱われないように、文字列として保存する
function plain(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
