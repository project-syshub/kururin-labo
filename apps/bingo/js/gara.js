// ガラガラ演出: 市販の黒いアナログ式ビンゴ抽選器(球状の籠・右側の手回しクランク・枠の台)を
// 斜め上から見た絵として描く。3D 座標を簡易投影して SVG に出力するので、籠・台・玉が同じ角度になる。
// 籠の中の玉は簡易物理(重力・籠の回転による摩擦・玉同士の衝突)で動かす。
//
// ワールド座標: x=右(軸の向き) / y=上 / z=手前。単位は籠の半径=1。
window.BingoGara = (function () {
  var NS = 'http://www.w3.org/2000/svg';
  var VIEW_W = 520, VIEW_H = 480;            // viewBox(init で絵に合わせて調整)
  var S = 100, OX = 315, OY = 257;           // 拡大率と原点の画面位置
  var YAW = -26 * Math.PI / 180;             // 右手前から見る
  var PITCH = 24 * Math.PI / 180;            // 上から見下ろす
  var CA = Math.cos(YAW), SA = Math.sin(YAW), CB = Math.cos(PITCH), SB = Math.sin(PITCH);
  var VIEWER = [-CB * SA, SB, CB * CA];      // 視点方向(ワールド座標)
  var LIGHT = norm([0.3, 1, 0.6]);

  var R = 1, CYW = 1.5;                      // 籠の半径と中心の高さ
  var BR = 0.14;                             // 玉の半径(籠の半径に対する実物の比率に近い大きさ)
  var CRANK_X = 1.58, ARM = 0.62;            // クランク
  var BASE_TOP = 0.12;                       // 台の上面の高さ

  var SPIN_DEG = 720;                        // 1回の抽選で回す角度(2回転。止まるとクランクも元の向きに戻る)

  // 物理パラメータ(籠の半径=1 の単位系)
  var GRAVITY = 60;
  var WALL_LIMIT = R - BR - 0.04;            // 玉の中心が動ける範囲(枠の太さ分を引く)
  var WALL_BOUNCE = 0.3, BALL_BOUNCE = 0.4;
  var WALL_GRIP = 0.12;                      // 籠の内壁が玉を連れ回す強さ
  var STEP = 1 / 240;

  var svg, backG, frontG, cageBack, cageFront, cageShine, cageBackAlt, cageFrontAlt, glass, ballsG;
  var crankArm, crankHi, crankKnob, crankHub, crankHit;
  var balls = [];                            // { n, g, text, p:[x,y,z](籠の中心基準), v:[x,y,z] }
  var omega = 0;                             // 籠の角速度(rad/s、x 軸まわり)
  var spinning = false, simRaf = null, simLast = 0, quietFrames = 0;

  // ---- 小さな 3D ユーティリティ ----
  function norm(v) { var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

  function proj(x, y, z) {
    var x1 = x * CA + z * SA, z1 = -x * SA + z * CA;
    var y2 = y * CB - z1 * SB, z2 = y * SB + z1 * CB;
    var k = 1 / (1 - 0.05 * z2);             // ごく弱い遠近(手前ほど大きい)
    return { x: OX + S * x1 * k, y: OY - S * y2 * k, z: z2, k: k };
  }

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }

  function gray(v) { var h = Math.max(0, Math.min(255, Math.round(v))).toString(16); return '#' + (h.length < 2 ? '0' + h : h).repeat(3); }

  // 8 頂点の六面体(頂点 0-3 と 4-7 が対応する 2 つの四角形)を、背面を除いて奥から描く
  function solid(parent, v, base, range) {
    var faces = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
    var c = [0, 0, 0];
    v.forEach(function (p) { c[0] += p[0] / 8; c[1] += p[1] / 8; c[2] += p[2] / 8; });
    var P = v.map(function (p) { return proj(p[0], p[1], p[2]); });
    var items = [];
    faces.forEach(function (f) {
      var n = norm(cross(sub(v[f[1]], v[f[0]]), sub(v[f[2]], v[f[0]])));
      var fc = [0, 0, 0];
      f.forEach(function (i) { fc[0] += v[i][0] / 4; fc[1] += v[i][1] / 4; fc[2] += v[i][2] / 4; });
      if (dot(n, sub(fc, c)) < 0) n = [-n[0], -n[1], -n[2]];
      if (dot(n, VIEWER) <= 0.01) return;      // 裏向きの面は描かない
      var depth = 0;
      f.forEach(function (i) { depth += P[i].z / 4; });
      items.push({ f: f, depth: depth, shade: base + range * Math.max(0, dot(n, LIGHT)) });
    });
    items.sort(function (a, b) { return a.depth - b.depth; });
    items.forEach(function (it) {
      el('polygon', {
        points: it.f.map(function (i) { return P[i].x.toFixed(1) + ',' + P[i].y.toFixed(1); }).join(' '),
        fill: gray(it.shade), stroke: '#050505', 'stroke-width': 0.8, 'stroke-linejoin': 'round'
      }, parent);
    });
  }

  // 横から見た形(z, y の多角形・反時計回り)を x0〜x1 の厚みで押し出した立体。曲線の支柱などに使う
  function extrudeX(parent, shape, x0, x1, base, range) {
    var faces = [];
    var cap = function (x, nx) {
      faces.push({ pts: shape.map(function (p) { return [x, p[1], p[0]]; }), n: [nx, 0, 0] });
    };
    cap(x0, -1); cap(x1, 1);
    for (var i = 0; i < shape.length; i++) {
      var a = shape[i], b = shape[(i + 1) % shape.length];
      var n = norm([0, -(b[0] - a[0]), b[1] - a[1]]);       // 辺の外向き法線(z,y の反時計回り前提)
      faces.push({ pts: [[x0, a[1], a[0]], [x1, a[1], a[0]], [x1, b[1], b[0]], [x0, b[1], b[0]]], n: n });
    }
    faces.filter(function (f) { return dot(f.n, VIEWER) > 0.01; }).map(function (f) {
      var P = f.pts.map(function (p) { return proj(p[0], p[1], p[2]); });
      return { P: P, depth: P.reduce(function (s, q) { return s + q.z; }, 0) / P.length, shade: base + range * Math.max(0, dot(f.n, LIGHT)) };
    }).sort(function (a, b) { return a.depth - b.depth; }).forEach(function (f) {
      el('polygon', {
        points: f.P.map(function (q) { return q.x.toFixed(1) + ',' + q.y.toFixed(1); }).join(' '),
        fill: gray(f.shade), stroke: '#050505', 'stroke-width': 0.8, 'stroke-linejoin': 'round'
      }, parent);
    });
  }

  // 樹脂製の支柱の横から見た形: 台の上で前後に広がり、カーブしながら細くなって軸を支える
  var SUPPORT_SHAPE = (function () {
    var pts = [[0.62, 0.12], [0.52, 0.42], [0.36, 0.82], [0.24, 1.2], [0.2, CYW]];
    for (var i = 0; i <= 8; i++) {                             // 軸のまわりの丸い頭
      var a = i * Math.PI / 8;
      pts.push([0.2 * Math.cos(a), CYW + 0.2 * Math.sin(a)]);
    }
    return pts.concat([[-0.24, 1.2], [-0.42, 0.78], [-0.62, 0.4], [-0.82, 0.12]]);
  })();

  function box(parent, x0, x1, y0, y1, z0, z1, base, range) {
    var ring = function (y) { return [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]]; };
    solid(parent, ring(y1).concat(ring(y0)), base == null ? 16 : base, range == null ? 40 : range);
  }


  // ---- 玉(白に黒の印字、陰影つき)----
  function ballFace(parent, r, fontSize) {
    el('circle', { r: r, fill: 'url(#gBall)', stroke: '#777', 'stroke-width': 0.8 }, parent);
    el('ellipse', { cx: -r * 0.32, cy: -r * 0.38, rx: r * 0.32, ry: r * 0.22, fill: '#fff', opacity: 0.9 }, parent);
    return el('text', { y: fontSize * 0.35, 'text-anchor': 'middle', 'font-size': fontSize, 'font-weight': 700, fill: '#111' }, parent);
  }

  function setBallTransform(g, x, y, z) {
    var p = proj(x, y, z);
    g.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ') scale(' + (BR * S * p.k / 18).toFixed(3) + ')');
    return p.z;
  }

  function build() {
    svg.setAttribute('viewBox', '0 0 ' + VIEW_W + ' ' + VIEW_H);
    var defs = el('defs', {}, svg);
    var gb = el('radialGradient', { id: 'gBall', cx: 0.38, cy: 0.32, r: 0.75 }, defs);
    el('stop', { offset: 0, 'stop-color': '#ffffff' }, gb);
    el('stop', { offset: 0.55, 'stop-color': '#f1f1f1' }, gb);
    el('stop', { offset: 1, 'stop-color': '#b4b4b4' }, gb);
    var gs = el('radialGradient', { id: 'gShadow' }, defs);
    el('stop', { offset: 0, 'stop-color': '#000', 'stop-opacity': 0.22 }, gs);
    el('stop', { offset: 1, 'stop-color': '#000', 'stop-opacity': 0 }, gs);

    backG = el('g', {}, svg);

    // 床の影
    var sc = proj(0, 0, 0.05);
    el('ellipse', { cx: sc.x.toFixed(1), cy: (sc.y + 6).toFixed(1), rx: (2.0 * S).toFixed(1), ry: (0.75 * S).toFixed(1), fill: 'url(#gShadow)' }, backG);

    // 奥: 台(黒い1枚板)、左の支柱、左の軸
    box(backG, -1.65, 1.65, 0, BASE_TOP, -1.0, 1.45, 14, 36);
    extrudeX(backG, SUPPORT_SHAPE, -1.36, -1.16, 14, 44);
    // 左の軸: 左の支柱から籠の左端まで(籠の中は通さない)。籠より奥にあるので先に描く
    box(backG, -1.16, -R + 0.02, CYW - 0.045, CYW + 0.045, -0.045, 0.045, 30, 40);

    // 籠(うっすら透ける面 → 奥の枠 → 玉 → 手前の枠 → 枠のつや)
    glass = el('circle', { fill: 'rgba(255,255,255,0.22)' }, svg);
    cageBack = el('path', { fill: 'none', stroke: '#3a3a3a', 'stroke-width': (0.028 * S).toFixed(1), 'stroke-linecap': 'round' }, svg);
    cageBackAlt = el('path', { fill: 'none', stroke: '#5c5c5c', 'stroke-width': (0.028 * S).toFixed(1), 'stroke-linecap': 'round' }, svg);
    ballsG = el('g', {}, svg);
    cageFront = el('path', { fill: 'none', stroke: '#0e0e0e', 'stroke-width': (0.04 * S).toFixed(1), 'stroke-linecap': 'round' }, svg);
    cageFrontAlt = el('path', { fill: 'none', stroke: '#3c3c3c', 'stroke-width': (0.04 * S).toFixed(1), 'stroke-linecap': 'round' }, svg);
    cageShine = el('path', { fill: 'none', stroke: 'rgba(255,255,255,0.22)', 'stroke-width': (0.011 * S).toFixed(1), 'stroke-linecap': 'round', transform: 'translate(-0.8,-0.8)' }, svg);
    frontG = el('g', {}, svg);
    // 右の軸: 籠の右端から右の支柱・クランクまで。籠より手前なので籠の後に描く
    box(frontG, R - 0.02, CRANK_X, CYW - 0.045, CYW + 0.045, -0.045, 0.045, 30, 40);
    // 右の支柱
    extrudeX(frontG, SUPPORT_SHAPE, 1.16, 1.36, 14, 44);


    // 手回しクランク(軸の右端。回転に合わせて腕が回る)
    var crank = el('g', { id: 'handle', style: 'cursor:pointer' }, frontG);
    crankHit = el('circle', { fill: 'transparent' }, crank);
    crankArm = el('line', { stroke: '#111', 'stroke-linecap': 'round' }, crank);
    crankHi = el('line', { stroke: '#555', 'stroke-linecap': 'round' }, crank);
    crankKnob = el('line', { stroke: '#0a0a0a', 'stroke-linecap': 'round' }, crank);
    crankHub = el('circle', { fill: '#222', stroke: '#666', 'stroke-width': 1.5 }, crank);

    setAngle(0);
  }

  // 籠の枠を 3D で組み、奥側と手前側に分けて path にする
  function drawCage(rad) {
    var N = 48, back = '', front = '', backAlt = '', frontAlt = '';
    var c = proj(0, CYW, 0), zc = c.z;
    glass.setAttribute('cx', c.x.toFixed(1));
    glass.setAttribute('cy', c.y.toFixed(1));
    glass.setAttribute('r', (S * R * c.k).toFixed(1));

    // n 点で輪を作る(phase は最初の点の角度)。band を渡すと band 区間ごとに色を塗り分ける
    function ring(point, n, phase, band) {
      var pts = [];
      for (var j = 0; j < n; j++) pts.push(point(phase + 2 * Math.PI * j / n));
      for (var i = 0; i < n; i++) {
        var a = pts[i], b = pts[(i + 1) % n];
        var seg = 'M' + a.x.toFixed(1) + ',' + a.y.toFixed(1) + 'L' + b.x.toFixed(1) + ',' + b.y.toFixed(1);
        var alt = band && Math.floor(i / band) % 2 === 1;
        if ((a.z + b.z) / 2 >= zc) { if (alt) frontAlt += seg; else front += seg; }
        else { if (alt) backAlt += seg; else back += seg; }
      }
    }
    for (var m = 0; m < 8; m++) {                        // 経線(軸を通る円。回転で向きが変わる)
      (function (th) {
        ring(function (phi) { return proj(R * Math.cos(phi), CYW + R * Math.sin(phi) * Math.cos(th), R * Math.sin(phi) * Math.sin(th)); }, N, 0);
      })(rad + m * Math.PI / 8);
    }
    // 緯線(軸に垂直な輪)。輪は回っても形が変わらないので、濃淡の区間を籠と一緒に回して回転を見せる
    for (var l = 1; l <= 7; l++) {
      (function (al) {
        var r = R * Math.sin(al), x = R * Math.cos(al);
        ring(function (psi) { return proj(x, CYW + r * Math.cos(psi), r * Math.sin(psi)); }, 32, rad, 4);
      })(l * Math.PI / 8);
    }
    cageBack.setAttribute('d', back);
    cageBackAlt.setAttribute('d', backAlt);
    cageFront.setAttribute('d', front);
    cageFrontAlt.setAttribute('d', frontAlt);
    cageShine.setAttribute('d', front + frontAlt);
  }

  function setAngle(deg) {
    var rad = deg * Math.PI / 180;
    drawCage(rad);
    var hub = proj(CRANK_X, CYW, 0);
    var th = rad + Math.PI;                              // 静止時は腕が下向き
    var tip = proj(CRANK_X, CYW + ARM * Math.cos(th), ARM * Math.sin(th));
    var end = proj(CRANK_X + 0.42, CYW + ARM * Math.cos(th), ARM * Math.sin(th));
    function line(e, a, b, w) {
      e.setAttribute('x1', a.x.toFixed(1)); e.setAttribute('y1', a.y.toFixed(1));
      e.setAttribute('x2', b.x.toFixed(1)); e.setAttribute('y2', b.y.toFixed(1));
      e.setAttribute('stroke-width', w.toFixed(1));
    }
    line(crankArm, hub, tip, 0.1 * S * tip.k);
    line(crankHi, hub, tip, 0.03 * S * tip.k);
    line(crankKnob, tip, end, 0.14 * S * tip.k);
    crankHub.setAttribute('cx', hub.x.toFixed(1)); crankHub.setAttribute('cy', hub.y.toFixed(1)); crankHub.setAttribute('r', (0.1 * S * hub.k).toFixed(1));
    crankHit.setAttribute('cx', hub.x.toFixed(1)); crankHit.setAttribute('cy', hub.y.toFixed(1));
  }

  function init(svgEl) {
    svg = svgEl;
    build();
    // 描かれた絵の大きさに viewBox を合わせる(余白つき)
    // クランクが上を向いたときも切れないよう、半回転させた状態の範囲も合わせる
    var b0 = svg.getBBox();
    setAngle(180);
    var b1 = svg.getBBox();
    setAngle(0);
    var x0 = Math.min(b0.x, b1.x), y0 = Math.min(b0.y, b1.y);
    var b = { x: x0, y: y0, width: Math.max(b0.x + b0.width, b1.x + b1.width) - x0, height: Math.max(b0.y + b0.height, b1.y + b1.height) - y0 };
    if (b.width > 0 && b.height > 0) {
      var pad = 16;
      svg.setAttribute('viewBox', [b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2].map(function (v) { return v.toFixed(1); }).join(' '));
    }
    crankHit.setAttribute('r', (ARM * 1.3 * S).toFixed(1));
    return svg.querySelector('#handle');
  }

  // ---- 籠の中の玉(簡易物理)----
  function step(dt) {
    var i, j, b, n = balls.length;
    for (i = 0; i < n; i++) {
      b = balls[i];
      b.v[1] -= GRAVITY * dt;
      b.v[0] *= 0.999; b.v[1] *= 0.999; b.v[2] *= 0.999;
      b.p[0] += b.v[0] * dt; b.p[1] += b.v[1] * dt; b.p[2] += b.v[2] * dt;
    }
    // 玉同士の衝突
    var minD = BR * 2;
    for (i = 0; i < n; i++) {
      var a = balls[i];
      for (j = i + 1; j < n; j++) {
        b = balls[j];
        var dx = b.p[0] - a.p[0], dy = b.p[1] - a.p[1], dz = b.p[2] - a.p[2];
        var d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= minD * minD || d2 < 1e-10) continue;
        var d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d, push = (minD - d) / 2;
        a.p[0] -= nx * push; a.p[1] -= ny * push; a.p[2] -= nz * push;
        b.p[0] += nx * push; b.p[1] += ny * push; b.p[2] += nz * push;
        var rel = (b.v[0] - a.v[0]) * nx + (b.v[1] - a.v[1]) * ny + (b.v[2] - a.v[2]) * nz;
        if (rel < 0) {
          var imp = -(1 + BALL_BOUNCE) * rel / 2;
          a.v[0] -= nx * imp; a.v[1] -= ny * imp; a.v[2] -= nz * imp;
          b.v[0] += nx * imp; b.v[1] += ny * imp; b.v[2] += nz * imp;
        }
      }
    }
    // 籠の内壁: 押し戻し・跳ね返り・回転による連れ回し
    for (i = 0; i < n; i++) {
      b = balls[i];
      var len = Math.sqrt(dot(b.p, b.p));
      if (len <= WALL_LIMIT) continue;
      var w = [b.p[0] / len, b.p[1] / len, b.p[2] / len];
      b.p = [w[0] * WALL_LIMIT, w[1] * WALL_LIMIT, w[2] * WALL_LIMIT];
      var vn = dot(b.v, w);
      if (vn > 0) { b.v[0] -= w[0] * vn * (1 + WALL_BOUNCE); b.v[1] -= w[1] * vn * (1 + WALL_BOUNCE); b.v[2] -= w[2] * vn * (1 + WALL_BOUNCE); }
      var wall = [0, -omega * b.p[2], omega * b.p[1]];   // 内壁の速度 = ω × p
      vn = dot(b.v, w);
      var wn = dot(wall, w);
      for (var k = 0; k < 3; k++) {
        var vt = b.v[k] - w[k] * vn, wt = wall[k] - w[k] * wn;
        b.v[k] += (wt - vt) * WALL_GRIP;
      }
    }
  }

  function drawBalls() {
    balls.forEach(function (b) { b.z = setBallTransform(b.g, b.p[0], CYW + b.p[1], b.p[2]); });
    balls.slice().sort(function (a, b) { return a.z - b.z; }).forEach(function (b) { ballsG.appendChild(b.g); });
  }

  // 玉が落ち着くまで物理を進める(回転中は止めない)
  function simFrame(now) {
    var elapsed = Math.min(0.05, (now - simLast) / 1000);
    simLast = now;
    var steps = Math.max(1, Math.round(elapsed / STEP));
    for (var s = 0; s < steps; s++) step(elapsed / steps);
    drawBalls();
    var energy = 0;
    balls.forEach(function (b) { energy += dot(b.v, b.v); });
    quietFrames = (!spinning && energy < 0.02 * Math.max(1, balls.length)) ? quietFrames + 1 : 0;
    if (quietFrames > 20) { simRaf = null; return; }
    simRaf = requestAnimationFrame(simFrame);
  }

  function wake() {
    quietFrames = 0;
    if (simRaf) return;
    simLast = performance.now();
    simRaf = requestAnimationFrame(simFrame);
  }

  // 下から順に重ならない位置を探して置く(初期配置・玉を戻したとき)
  function packPosition() {
    var best = null;
    for (var t = 0; t < 400; t++) {
      var p = [(Math.random() * 2 - 1) * WALL_LIMIT, (Math.random() * 2 - 1) * WALL_LIMIT, (Math.random() * 2 - 1) * WALL_LIMIT];
      if (dot(p, p) > WALL_LIMIT * WALL_LIMIT) continue;
      var ok = balls.every(function (b) { var d = sub(p, b.p); return dot(d, d) >= 4 * BR * BR * 1.02; });
      if (ok && (!best || p[1] < best[1])) best = p;
    }
    return best || [0, 0, 0];
  }

  function addBall(n) {
    var g = el('g', {}, ballsG);
    var text = ballFace(g, 18, 14);
    text.textContent = n;
    var b = { n: n, g: g, text: text, p: packPosition(), v: [0, 0, 0], z: 0 };
    balls.push(b);
    return b;
  }

  function removeBall(b) {
    balls.splice(balls.indexOf(b), 1);
    if (b.g.parentNode) b.g.parentNode.removeChild(b.g);
  }

  // 籠の中の玉を残りの番号に合わせる(出た玉は消え、戻した玉は加わる)
  var firstFill = true;
  function updateBalls(remaining) {
    var inCage = {};
    balls.slice().forEach(function (b) {
      if (remaining.indexOf(b.n) === -1) removeBall(b); else inCage[b.n] = true;
    });
    var added = 0;
    remaining.forEach(function (n) { if (!inCage[n]) { addBall(n); added++; } });
    if (firstFill) {                                     // 最初は画面に出す前に落ち着かせておく
      firstFill = false;
      for (var s = 0; s < 480; s++) step(STEP);
      balls.forEach(function (b) { b.v = [0, 0, 0]; });
      drawBalls();
    } else {
      drawBalls();
      wake();
    }
    return added;
  }

  function easeInOut(p) { return 0.5 - 0.5 * Math.cos(Math.PI * p); }

  // 籠を回す(ms 後に解決)。玉は物理演算で転がる
  function spin(ms) {
    return new Promise(function (resolve) {
      var start = performance.now();
      spinning = true;
      wake();
      function frame(now) {
        var p = Math.min(1, (now - start) / ms);
        setAngle(SPIN_DEG * easeInOut(p));
        // 角度の微分 = 角速度
        omega = (SPIN_DEG * Math.PI / 180) * (Math.PI / 2) * Math.sin(Math.PI * p) / (ms / 1000);
        if (p < 1) requestAnimationFrame(frame);
        else {
          omega = 0;
          spinning = false;
          setAngle(0);
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });
  }

  // ---- 当選した玉 ----
  // 回転が止まったら、当選番号の玉を籠から取り除く(玉は飛び出さず、籠の中央からポップアップへつなぐ)
  function takeBall(number) {
    balls.slice().forEach(function (b) { if (b.n === number) removeBall(b); });
    wake();                                              // 抜けた隙間に玉が寄る
  }

  // 籠の中心の画面上の位置(ポップアップが広がり始める位置)
  function cageCenter() {
    var r = glass.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  return { init: init, updateBalls: updateBalls, spin: spin, takeBall: takeBall, cageCenter: cageCenter };
})();
