/* retouch film — 寄せエンジン（色＋露出・黒の位置）
   画像は含まず、パターンごとの数値（トーン分位・ゾーン別の色と彩度）だけで動く */
(function (G) {
  'use strict';
  var PCT = [1, 5, 10, 25, 50, 75, 90, 95, 99];

  var PATTERNS = {
    A: { name: '光で飛ばす', note: '白をぎりぎりまで上げ、色はほぼ無色。昼の強い光' },
    B: { name: '霞む水色', note: '黒を大きく持ち上げ、影と中間にシアン' },
    C: { name: '素の中間調', note: '中立のフィルム調。白だけわずかに黄' },
    D: { name: '夜のストロボ', note: '黒を深く沈め、光の当たった所だけ残す' },
    E: { name: '青に沈む', note: '影と中間に青。ハイライトは中立' },
    F: { name: '暖色ミッド', note: '中間に赤茶。室内の電球色' },
    G: { name: '琥珀のかぶり', note: '全体を黄〜琥珀へ。黒は持ち上げる' },
    H: { name: '暗闇の残光', note: 'ほぼ黒の中に点の光だけを残す' },
    M: { name: 'モノクロ', note: '黒を締めた硬めのモノクロ' }
  };

  // ---------- 色変換（sRGB D65 ⇄ CIELAB） ----------
  function s2l(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function l2s(c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
  var Xn = 0.950456, Zn = 1.088754;
  function fl(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
  function fi(t) { var t3 = t * t * t; return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787; }
  function rgb2lab(r, g, b, o) {
    r = s2l(r); g = s2l(g); b = s2l(b);
    var x = (0.412453 * r + 0.357580 * g + 0.180423 * b) / Xn;
    var y = 0.212671 * r + 0.715160 * g + 0.072169 * b;
    var z = (0.019334 * r + 0.119193 * g + 0.950227 * b) / Zn;
    var fx = fl(x), fy = fl(y), fz = fl(z);
    o[0] = y > 0.008856 ? 116 * fy - 16 : 903.3 * y;
    o[1] = 500 * (fx - fy); o[2] = 200 * (fy - fz);
    return o;
  }
  function lab2rgb(L, a, b, o) {
    var fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    var x = fi(fx) * Xn, y = L > 7.9996 ? fy * fy * fy : L / 903.3, z = fi(fz) * Zn;
    var r = 3.240479 * x - 1.53715 * y - 0.498535 * z;
    var g = -0.969256 * x + 1.875992 * y + 0.041556 * z;
    var bb = 0.055648 * x - 0.204043 * y + 1.057311 * z;
    o[0] = l2s(Math.min(1, Math.max(0, r)));
    o[1] = l2s(Math.min(1, Math.max(0, g)));
    o[2] = l2s(Math.min(1, Math.max(0, bb)));
    return o;
  }

  // ---------- 解析：入力写真の数値 ----------
  function median(arr, n) {
    if (!n) return 0;
    var s = Array.prototype.slice.call(arr, 0, n).sort(function (x, y) { return x - y; });
    return s[n >> 1];
  }
  function analyze(data, w, h) {
    var n = w * h, L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n), o = [0, 0, 0];
    var bx = Math.floor(Math.min(w, h) * 0.02), k = 0;
    for (var y = bx; y < h - bx; y++) for (var x = bx; x < w - bx; x++) {
      var i = (y * w + x) * 4;
      rgb2lab(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, o);
      L[k] = o[0]; A[k] = o[1]; B[k] = o[2]; k++;
    }
    var Ls = Array.prototype.slice.call(L, 0, k).sort(function (x, y) { return x - y; });
    var p = PCT.map(function (q) { return Ls[Math.min(k - 1, Math.floor(q / 100 * (k - 1)))]; });
    var q25 = p[3], q75 = p[5], v = p.slice();
    var tests = [function (l) { return l <= q25; }, function (l) { return l > q25 && l < q75; }, function (l) { return l >= q75; }];
    for (var t = 0; t < 3; t++) {
      var za = [], zb = [], zc = [];
      for (var j = 0; j < k; j++) if (tests[t](L[j])) { za.push(A[j]); zb.push(B[j]); zc.push(Math.hypot(A[j], B[j])); }
      if (za.length < 50) { za = Array.from(A.subarray(0, k)); zb = Array.from(B.subarray(0, k)); zc = za.map(function (a, j) { return Math.hypot(a, zb[j]); }); }
      v.push(median(za, za.length), median(zb, zb.length), median(zc, zc.length));
    }
    return v; // [p1..p99(9), sa,sb,sC, ma,mb,mC, ha,hb,hC]
  }

  // ---------- 見本の選び方（平均ではなく、近い作例だけ） ----------
  var TONE_W = [0.4, 0.8, 0.8, 1.2, 1.4, 1.2, 0.9, 0.7, 0.4];
  function dist(u, v, book) {
    var d = 0;
    for (var i = 0; i < 9; i++) { var e = u[i] - v[i]; d += TONE_W[i] * e * e; }
    for (var j = 9; j < 18; j += 3) { var ea = u[j] - v[j], eb = u[j + 1] - v[j + 1]; d += 0.15 * (ea * ea + eb * eb); }
    return Math.sqrt(d) * (book ? 1.15 : 1); // Books（印刷物の再撮影）は少し遠く扱う
  }
  function rank(model, inp) {
    // 自動判定：全見本から近い順に投票
    var all = model.map(function (m) { return { p: m.p, d: dist(inp, m.v, m.b) }; }).sort(function (a, b) { return a.d - b.d; });
    var score = {};
    all.slice(0, 15).forEach(function (r) { score[r.p] = (score[r.p] || 0) + 1 / (1 + r.d); });
    return Object.keys(score).sort(function (a, b) { return score[b] - score[a]; });
  }
  function target(model, pat, inp, k) {
    var c = model.filter(function (m) { return m.p === pat; })
      .map(function (m) { return { v: m.v, d: dist(inp, m.v, m.b) }; })
      .sort(function (a, b) { return a.d - b.d; }).slice(0, k || 6);
    var t = [];
    for (var i = 0; i < 18; i++) t.push(median(c.map(function (x) { return x.v[i]; }), c.length));
    return { v: t, n: c.length };
  }

  // ---------- トーンカーブ（単調な補間） ----------
  function monotone(xs, ys) {
    var n = xs.length, d = [], m = [];
    for (var i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 2 / (1 / d[i - 1] + 1 / d[i]);
    var T = new Float32Array(1025);
    var s = 0;
    for (var q = 0; q <= 1024; q++) {
      var x = q / 1024 * 100;
      while (s < n - 2 && x > xs[s + 1]) s++;
      var h = xs[s + 1] - xs[s], t = Math.min(1, Math.max(0, (x - xs[s]) / h));
      var t2 = t * t, t3 = t2 * t;
      T[q] = (2 * t3 - 3 * t2 + 1) * ys[s] + (t3 - 2 * t2 + t) * h * m[s] + (-2 * t3 + 3 * t2) * ys[s + 1] + (t3 - t2) * h * m[s + 1];
    }
    return T;
  }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  /* 設定 s:
     amt   全体の強さ 0..1
     tone  露出・トーンの寄せ 0..1.2
     color 色の寄せ 0..1.2
     chroma 彩度の寄せ 0..1.2
     exp   露出 -1..1（中間を上下）
     black 黒の位置 -20..30（Lの上げ下げ）
     white 白の飛ばし -10..10
     sat   彩度の微調整 -50..50 (%)
  */
  function buildTransform(inp, tgt, s, mono) {
    var t = tgt.v, amt = s.amt;
    var st = amt * s.tone, sc = amt * s.color, ss = amt * s.chroma;
    // 寄せ先のトーン点（1点あたり最大±24まで）
    var xs = [0], ys = [0];
    for (var i = 0; i < 9; i++) {
      var dx = clamp(t[i] - inp[i], -24, 24);
      xs.push(inp[i]); ys.push(inp[i] + st * dx);
    }
    xs.push(100); ys.push(100);
    // 黒の位置：暗部だけを上げ下げ（中間より上には効かない）
    var blk = s.black, wht = s.white, ex = s.exp * 12;
    for (i = 0; i < ys.length; i++) {
      var x = xs[i];
      var wB = Math.pow(clamp(1 - x / 50, 0, 1), 1.6);
      var wW = Math.pow(clamp((x - 55) / 45, 0, 1), 1.4);
      var wM = Math.sin(Math.PI * clamp(x / 100, 0, 1));
      ys[i] += blk * wB + wht * wW + ex * wM;
    }
    ys[0] = clamp(ys[0], 0, 60);
    // 単調性を保証
    for (i = 1; i < xs.length; i++) { if (xs[i] <= xs[i - 1]) xs[i] = xs[i - 1] + 0.05; if (ys[i] < ys[i - 1] + 0.05) ys[i] = ys[i - 1] + 0.05; }
    for (i = 0; i < ys.length; i++) ys[i] = Math.min(ys[i], 100);
    var curve = monotone(xs, ys);

    // ゾーンの境目（出力側の分位で判断）
    var q25 = curve[Math.round(clamp(inp[3], 0, 100) / 100 * 1024)], q75 = curve[Math.round(clamp(inp[5], 0, 100) / 100 * 1024)];
    var z = [];
    for (var j = 0; j < 3; j++) {
      var ia = inp[9 + j * 3], ib = inp[10 + j * 3], iC = Math.max(1, inp[11 + j * 3]);
      var ta = t[9 + j * 3], tb = t[10 + j * 3], tC = t[11 + j * 3];
      var r = Math.pow(clamp((tC + 0.5) / (iC + 0.5), 0.65, 1.6), ss);
      z.push({ ia: ia, ib: ib, ta: clamp(ta, -22, 22), tb: clamp(tb, -22, 28), r: r });
    }
    var satMul = 1 + s.sat / 100;
    var lab = [0, 0, 0];
    return function (R, Gc, Bc, out) {
      rgb2lab(R, Gc, Bc, lab);
      var L = lab[0], a = lab[1], b = lab[2];
      var Lo = curve[Math.round(clamp(L, 0, 100) / 100 * 1024)];
      if (mono) { return lab2rgb(Lo, 0, 0, out); }
      var ws = clamp((q25 + 8 - Lo) / 16, 0, 1), wh = clamp((Lo - (q75 - 8)) / 16, 0, 1);
      var wm = Math.max(0, 1 - ws - wh), sum = ws + wm + wh;
      ws /= sum; wm /= sum; wh /= sum;
      var A0 = 0, B0 = 0, k = [ws, wm, wh];
      for (var j = 0; j < 3; j++) {
        var zz = z[j];
        // 元の色は一部だけ打ち消す（被写体そのものの色＝イチョウの黄などを残すため）
        var nz = NEUTRAL * sc;
        var na = (a - nz * zz.ia) * zz.r + sc * zz.ta;
        var nb = (b - nz * zz.ib) * zz.r + sc * zz.tb;
        A0 += k[j] * na; B0 += k[j] * nb;
      }
      // 極端な明部・暗部では色を弱めて濁りを防ぐ
      var edge = clamp(Math.min(Lo / 6, (100 - Lo) / 12), 0.1, 1);
      return lab2rgb(Lo, A0 * satMul * edge, B0 * satMul * edge, out);
    };
  }

  // ---------- 3D LUT ----------
  var N = 33;
  var NEUTRAL = 0.35;
  function buildLUT(fn) {
    var lut = new Uint8ClampedArray(N * N * N * 3), o = [0, 0, 0], p = 0;
    for (var b = 0; b < N; b++) for (var g = 0; g < N; g++) for (var r = 0; r < N; r++) {
      fn(r / (N - 1), g / (N - 1), b / (N - 1), o);
      lut[p++] = o[0] * 255 + 0.5; lut[p++] = o[1] * 255 + 0.5; lut[p++] = o[2] * 255 + 0.5;
    }
    return lut;
  }
  function applyLUT(src, dst, lut) {
    var S = (N - 1) / 255, NN = N * N;
    for (var i = 0, n = src.length; i < n; i += 4) {
      var fr = src[i] * S, fg = src[i + 1] * S, fb = src[i + 2] * S;
      var r0 = fr | 0, g0 = fg | 0, b0 = fb | 0;
      if (r0 > N - 2) r0 = N - 2; if (g0 > N - 2) g0 = N - 2; if (b0 > N - 2) b0 = N - 2;
      var dr = fr - r0, dg = fg - g0, db = fb - b0;
      var i000 = (b0 * NN + g0 * N + r0) * 3, i100 = i000 + 3, i010 = i000 + N * 3, i110 = i010 + 3;
      var i001 = i000 + NN * 3, i101 = i001 + 3, i011 = i001 + N * 3, i111 = i011 + 3;
      for (var c = 0; c < 3; c++) {
        var c00 = lut[i000 + c] + (lut[i100 + c] - lut[i000 + c]) * dr;
        var c10 = lut[i010 + c] + (lut[i110 + c] - lut[i010 + c]) * dr;
        var c01 = lut[i001 + c] + (lut[i101 + c] - lut[i001 + c]) * dr;
        var c11 = lut[i011 + c] + (lut[i111 + c] - lut[i011 + c]) * dr;
        var c0 = c00 + (c10 - c00) * dg, c1 = c01 + (c11 - c01) * dg;
        dst[i + c] = c0 + (c1 - c0) * db;
      }
      dst[i + 3] = src[i + 3];
    }
  }

  G.PL = { PATTERNS: PATTERNS, analyze: analyze, rank: rank, target: target, buildTransform: buildTransform, buildLUT: buildLUT, applyLUT: applyLUT, lab2rgb: lab2rgb };
})(typeof window !== 'undefined' ? window : globalThis);
