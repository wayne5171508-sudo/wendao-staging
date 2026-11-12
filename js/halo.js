'use strict';
// ════════════════════════════════════════════
//  主角光環（Canvas）
//  sit：腳下雙層法陣（外圈符文、內圈八卦，反向慢轉）＋靈氣絲帶螺旋繞身，顏色隨境界
//  stand／battle：背後多層光環（實圈、虛圈、放射光芒），呼吸式明暗，顏色隨主手兵器品階
//  靜態圖層先畫進離屏畫布，每幀只做旋轉貼圖，手機也能穩定 60fps；低階機或掉幀時自動降成單層
// ════════════════════════════════════════════

// 境界顏色：練氣青、築基翠、金丹金、元嬰紫
const REALM_HUE = [
  { c: '#8fe8ff', e: '#d8f8ff' }, { c: '#7dffb8', e: '#d6ffe8' }, { c: '#ffd76a', e: '#fff2c4' }, { c: '#c9a6ff', e: '#f0e2ff' },
];

// ════════════════════════════════════════════
//  黑底素材去黑：載入時用 Canvas 把近黑像素轉透明，效果接近 screen 疊加
//  透明度 = 亮度（低於 lo 直接透明），顏色正規化到最亮通道 255；round 時邊緣再加圓形羽化，不會出現圓盤邊
// ════════════════════════════════════════════
const Knock = {
  cache: {}, done: {},
  has(src) { return typeof ASSET_LIST === 'undefined' || ASSET_LIST.includes(src); },
  load(src, o = {}) {
    const key = src + '|' + (o.round === false ? 0 : 1);
    if (this.cache[key]) return this.cache[key];
    return (this.cache[key] = new Promise((res, rej) => {
      const im = new Image();
      im.onerror = () => rej(new Error('load ' + src));
      im.onload = () => {
        try {
          const W = im.naturalWidth, H = im.naturalHeight, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
          const c = cv.getContext('2d'); c.drawImage(im, 0, 0);
          const d = c.getImageData(0, 0, W, H), p = d.data, lo = o.lo ?? 12, fe = o.feather ?? 0.16, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2;
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4, m = Math.max(p[i], p[i + 1], p[i + 2]);
            let a = m <= lo ? 0 : (m - lo) / (255 - lo);
            if (a > 0 && o.round !== false) { const r = Math.hypot(x - cx, y - cy) / R; a *= Math.min(1, Math.max(0, (1 - r) / fe)); }
            if (a <= 0) { p[i + 3] = 0; continue; }
            const k = 255 / m; p[i] = Math.min(255, p[i] * k); p[i + 1] = Math.min(255, p[i + 1] * k); p[i + 2] = Math.min(255, p[i + 2] * k); p[i + 3] = Math.round(a * 255);
          }
          c.putImageData(d, 0, 0); const url = cv.toDataURL('image/png'); this.done[key] = url; res(url);
        } catch (e) { rej(e); }
      };
      im.src = src;
    }));
  },
  // 把 root 底下 <img data-knock="原圖"> 換成去黑後的圖；失敗時讓外層套 CSS 備援
  apply(root = document) {
    root.querySelectorAll('img[data-knock]').forEach((img) => {
      const src = img.dataset.knock; delete img.dataset.knock;
      this.load(src).then((u) => (img.src = u)).catch(() => { img.style.display = 'none'; if (img.parentElement) img.parentElement.classList.add('img-fail'); });
    });
  },
  url(src) { return this.done[src + '|1'] || null; },
};

// 光圈素材（選用）：檔案放進 assets/halo/ 並出現在素材清單時自動改用素材，否則用程式繪製
//  sit_outer 打坐外圈法陣、sit_inner 打坐內圈八卦、back_ring 背後光環；黑底圖會自動去黑
//  sit_ribbon 打坐靈氣絲帶（不是圓形，去黑時不做圓形羽化）
const HALO_IMG = { sitOuter: ['assets/halo/sit_outer.webp', true], sitInner: ['assets/halo/sit_inner.webp', true], back: ['assets/halo/back_ring.webp', true], ribbon: ['assets/halo/sit_ribbon.webp', false] };
const haloImgs = {};
for (const [k, [src, round]] of Object.entries(HALO_IMG)) if (typeof ASSET_LIST !== 'undefined' && ASSET_LIST.includes(src)) Knock.load(src, { round }).then((u) => { const im = new Image(); im.onload = () => (haloImgs[k] = im); im.src = u; }).catch(() => {});

// ════════════════════════════════════════════
//  靈氣粒子：素材 assets/fx/qi_motes.webp（8 格黑底，前 5 金、後 3 青）
//  載入時逐格去黑並做圓形羽化（等同 screen 去黑，但不受父層 opacity／transform 影響），繪製時用 screen 疊加
// ════════════════════════════════════════════
const MOTE_SRC = 'assets/fx/qi_motes.webp', MOTE_GOLD = 5, MOTE_N = 8;
const Motes = {
  imgs: null,
  load() {
    if (this.imgs || this._ld) return; this._ld = true;
    const im = new Image();
    im.onload = () => {
      const S = im.naturalHeight, out = [];
      for (let k = 0; k < MOTE_N; k++) {
        const cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d');
        c.drawImage(im, k * S, 0, S, S, 0, 0, S, S);
        const d = c.getImageData(0, 0, S, S), p = d.data, h = S / 2;
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
          const i = (y * S + x) * 4, m = Math.max(p[i], p[i + 1], p[i + 2]), r = Math.hypot(x - h, y - h) / h;
          const a = (m <= 10 ? 0 : (m - 10) / 245) * Math.min(1, Math.max(0, (1 - r) / 0.25));
          if (a <= 0) { p[i + 3] = 0; continue; }
          const q = 255 / m; p[i] *= q; p[i + 1] *= q; p[i + 2] *= q; p[i + 3] = a * 255;
        }
        c.putImageData(d, 0, 0); out.push(cv);
      }
      this.imgs = out;
    };
    im.src = MOTE_SRC;
  },
  // 依模式設定：打坐多而慢；站立中等；戰鬥為青綠氣場、緩慢上飄（依特效強度：高 30、低 12、關或減少動態 0）。low＝低階機
  cfg(mode, low) {
    const cap = low ? 12 : 30;
    if (mode === 'battle') {
      const lv = FX.level(), off = lv === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;
      return { cap: off ? 0 : lv === 'low' || low ? 12 : 30, vy: [-8, -18], out: 6, trail: lv === 'high' && !low ? 2 : 0, teal: true };
    }
    return mode === 'sit' ? { cap, vy: [-10, -20], out: 0, trail: 0 } : { cap: Math.round(cap * 0.7), vy: [-16, -28], out: 8, trail: 0 };
  },
  // 出招時的技能色粒子：把青色光點染成指定色，依色快取
  tinted(i, color) {
    const k = i + color, T = this._t || (this._t = {});
    if (T[k]) return T[k];
    const s = this.imgs[i], cv = document.createElement('canvas'); cv.width = s.width; cv.height = s.height;
    const c = cv.getContext('2d'); c.drawImage(s, 0, 0); c.globalCompositeOperation = 'source-atop'; c.globalAlpha = 0.65; c.fillStyle = color; c.fillRect(0, 0, cv.width, cv.height);
    return (T[k] = cv);
  },
};
Motes.load();

const Halo = {
  list: [], raf: 0, low: null, slow: 0, ft: [],
  RUNES: '乾坤震巽坎離艮兌天地風雷水火山澤道法自然氣聚丹成',
  TRIGRAMS: ['111', '011', '101', '001', '110', '010', '100', '000'],   // 先天八卦（1＝陽爻）

  // 低階機判斷：減少動態、核心數或記憶體偏低。執行中若連續掉幀也會降級
  isLow() {
    if (this.low !== null) return this.low;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
    return (this.low = reduce || cores < 4 || mem < 3);
  },

  // 掛上光環：mode = sit | stand | battle；target 為主角圖的選擇器，畫布鋪滿整個場景
  mount(mode, target, color) {
    const host = $('#sceneContent'), el = host && host.querySelector(target);
    if (!el) return null;
    const mk = (cls) => { const cv = document.createElement('canvas'); cv.className = 'halo-cv ' + cls; return cv; };
    const back = mk('back'), front = mk('front');
    host.insertBefore(back, host.firstChild);
    if (front) host.appendChild(front);
    const lv = S.d ? S.d.lv : 0, hue = REALM_HUE[Math.min(3, Math.floor(lv / 3))];
    const inst = { mode, el, back, front, pool: [], spawnT: 0, t: Math.random() * 10, c: color ? color.c : hue.c, e: color ? color.e : hue.e, sub: lv % 3, sprites: {} };
    this.list.push(inst); this.fit(inst);
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame((n) => this.loop(n)); }
    return inst;
  },
  // 出招時氣場加強，粒子染成技能色
  boost(color, sec = 0.9) { for (const I of this.list) if (I.mode === 'battle') { I.boostT = sec; I.boostC = color; } },
  fit(I) {
    const r = $('#sceneContent').getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    for (const cv of [I.back, I.front]) if (cv) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    I.W = r.width; I.H = r.height; I.dpr = dpr; I.sprites = {};
  },
  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.list = this.list.filter((I) => I.back.isConnected);
    if (!this.list.length) { this.raf = 0; return; }
    // 掉幀偵測：最近 90 幀平均超過 24ms 就降成單層
    this.ft.push(dt); if (this.ft.length > 90) this.ft.shift();
    if (!this.low && this.ft.length === 90 && this.ft.reduce((a, b) => a + b) / 90 > 0.024) { this.low = true; this.list.forEach((I) => (I.sprites = {})); }
    for (const I of this.list) {
      const r = $('#sceneContent').getBoundingClientRect();
      if (Math.abs(r.width - I.W) > 1 || Math.abs(r.height - I.H) > 1) this.fit(I);
      I.t += dt; I.dt = dt; this.draw(I, r);
    }
    this.raf = requestAnimationFrame((n) => this.loop(n));
  },

  // 光圈素材依境界或品階上色：保留透明度，把顏色往目標色推 amt
  tint(I, key, amt) {
    const ck = 'tint_' + key + I.c;
    if (I.sprites[ck]) return I.sprites[ck];
    const im = haloImgs[key], cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    const c = cv.getContext('2d'); c.drawImage(im, 0, 0); c.globalCompositeOperation = 'source-atop'; c.fillStyle = hexA(I.c, amt); c.fillRect(0, 0, cv.width, cv.height);
    return (I.sprites[ck] = cv);
  },
  // ───────── 離屏圖層 ─────────
  sprite(I, key, R, fn) {
    if (I.sprites[key]) return I.sprites[key];
    const s = Math.ceil(R * 2 * I.dpr) + 4, cv = document.createElement('canvas'); cv.width = cv.height = s;
    const c = cv.getContext('2d'); c.translate(s / 2, s / 2); c.scale(I.dpr, I.dpr); fn(c, R);
    return (I.sprites[key] = cv);
  },
  // 外圈：雙圓＋刻度＋符文
  runeRing(I, c, R) {
    c.strokeStyle = I.c; c.fillStyle = I.e; c.shadowColor = I.c; c.shadowBlur = 10; c.lineWidth = 2.4;
    c.beginPath(); c.arc(0, 0, R * 0.98, 0, 7); c.stroke();
    c.lineWidth = 1.2; c.beginPath(); c.arc(0, 0, R * 0.78, 0, 7); c.stroke();
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2, r0 = R * 0.94, r1 = R * (i % 2 ? 0.9 : 0.86); c.beginPath(); c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); c.stroke(); }
    c.font = `700 ${Math.round(R * 0.1)}px ${BRUSH}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowBlur = 6;
    const ch = [...this.RUNES];
    for (let i = 0; i < ch.length; i++) { const a = (i / ch.length) * Math.PI * 2; c.save(); c.rotate(a); c.translate(0, -R * 0.86); c.fillText(ch[i], 0, 0); c.restore(); }
  },
  // 內圈：八卦爻象＋太極
  bagua(I, c, R) {
    c.strokeStyle = I.c; c.fillStyle = I.e; c.shadowColor = I.c; c.shadowBlur = 8; c.lineWidth = 1.6;
    c.beginPath(); c.arc(0, 0, R * 0.62, 0, 7); c.stroke();
    // 八角框
    c.beginPath(); for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; c.lineTo(Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6); } c.stroke();
    const w = R * 0.16, h = R * 0.028, gap = R * 0.045;
    this.TRIGRAMS.forEach((tg, i) => {
      c.save(); c.rotate((i / 8) * Math.PI * 2); c.translate(0, -R * 0.46);
      [...tg].forEach((y, j) => { const yy = (j - 1) * gap; if (y === '1') c.fillRect(-w / 2, yy - h / 2, w, h); else { c.fillRect(-w / 2, yy - h / 2, w * 0.42, h); c.fillRect(w * 0.08, yy - h / 2, w * 0.42, h); } });
      c.restore();
    });
    // 太極
    const r = R * 0.2; c.lineWidth = 1.4;
    c.beginPath(); c.arc(0, 0, r, 0, 7); c.stroke();
    c.globalAlpha = 0.55; c.beginPath(); c.arc(0, 0, r, -Math.PI / 2, Math.PI / 2); c.arc(0, r / 2, r / 2, Math.PI / 2, -Math.PI / 2, true); c.arc(0, -r / 2, r / 2, Math.PI / 2, -Math.PI / 2); c.fill(); c.globalAlpha = 1;
    c.beginPath(); c.arc(0, -r / 2, r * 0.12, 0, 7); c.stroke(); c.beginPath(); c.arc(0, r / 2, r * 0.12, 0, 7); c.fill();
  },
  // 背光：放射光芒
  rays(I, c, R) {
    const n = 28;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, L = R * (i % 2 ? 0.82 : 1), wd = i % 2 ? 0.035 : 0.06;
      const g = c.createLinearGradient(0, 0, Math.cos(a) * L, Math.sin(a) * L);
      g.addColorStop(0, hexA(I.e, 0)); g.addColorStop(0.45, hexA(I.c, 0.55)); g.addColorStop(1, hexA(I.c, 0));
      c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, L, a - wd, a + wd); c.closePath(); c.fill();
    }
  },
  // 虛圈：斷續弧段＋小點
  dashRing(I, c, R) {
    c.strokeStyle = I.e; c.shadowColor = I.c; c.shadowBlur = 8; c.lineWidth = 2; c.lineCap = 'round';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.beginPath(); c.arc(0, 0, R, a, a + 0.32); c.stroke(); }
    c.fillStyle = I.e; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + 0.42; c.beginPath(); c.arc(Math.cos(a) * R, Math.sin(a) * R, 2.2, 0, 7); c.fill(); }
    c.lineWidth = 0.8; c.globalAlpha = 0.6; c.beginPath(); c.arc(0, 0, R * 0.9, 0, 7); c.stroke();
  },

  // ───────── 每幀繪製 ─────────
  draw(I, sc) {
    const er = I.el.getBoundingClientRect(), low = this.low || this.isLow();
    const bc = I.back.getContext('2d'); bc.setTransform(I.dpr, 0, 0, I.dpr, 0, 0); bc.clearRect(0, 0, I.W, I.H);
    if (I.front) { const fc = I.front.getContext('2d'); fc.setTransform(I.dpr, 0, 0, I.dpr, 0, 0); fc.clearRect(0, 0, I.W, I.H); }
    if (!er.width) return;
    const x = er.left - sc.left, y = er.top - sc.top;
    if (I.mode === 'sit') this.drawSit(I, bc, x + er.width / 2, y + er.height * 0.93, er.width, er.height, low);
    else this.drawBack(I, bc, x + er.width * (I.mode === 'battle' ? 0.5 : 0.47), y + er.height * (I.mode === 'battle' ? 0.24 : 0.17), Math.min(er.width * 0.62, er.height * 0.3), low);
    this.motes(I, bc, I.front.getContext('2d'), { x, y, w: er.width, h: er.height }, low);
  },
  // 靈氣粒子：物件池重複利用，數量不超過上限；一部分畫在身後、一部分在身前
  motes(I, bc, fc, b, low) {
    const imgs = Motes.imgs; if (!imgs) return;
    const C = Motes.cfg(I.mode, low), dt = I.dt || 0.016, pool = I.pool;
    while (pool.length < C.cap) pool.push({ on: false, hx: new Float32Array(4), hy: new Float32Array(4) });
    let alive = 0; for (let i = 0; i < pool.length; i++) if (pool[i].on) alive++;
    // 生成：平均生命 4 秒，維持在上限附近；出招加強（Halo.boost）時生成快五倍、向外噴並染技能色
    if (I.boostT > 0) I.boostT -= dt;
    const boost = I.boostT > 0;
    I.spawnT -= dt * (boost ? 5 : 1);
    if (I.spawnT <= 0 && C.cap && (alive < C.cap || boost)) {
      I.spawnT = 4 / C.cap * U.rand(0.6, 1.4);
      // 滿額時出招：回收最老的未染色粒子，總數不超過上限
      const free = alive < C.cap && pool.find((q) => !q.on);
      const p = free || pool.reduce((a, q) => (q.on && !q.tint && (!a || q.age / q.life > a.age / a.life) ? q : a), null);
      if (p) {
        const cx = b.x + b.w / 2, foot = I.mode === 'sit' && Math.random() < 0.5;
        // 打坐有一半從腳下法陣冒出；其餘從身體中段
        p.x = foot ? cx + U.rand(-0.55, 0.55) * b.w : cx + U.rand(-0.3, 0.3) * b.w;
        p.y = foot ? b.y + b.h * U.rand(0.88, 0.98) : b.y + b.h * U.rand(0.25, 0.85);
        const ang = Math.atan2(p.y - (b.y + b.h * 0.5), p.x - cx);
        p.vx = Math.cos(ang) * C.out * U.rand(0.5, 1); p.vy = U.rand(C.vy[0], C.vy[1]) + Math.sin(ang) * C.out * 0.4;
        p.gold = !C.teal && Math.random() < 0.6; p.img = p.gold ? U.randi(0, MOTE_GOLD - 1) : U.randi(MOTE_GOLD, MOTE_N - 1);
        p.tint = boost ? I.boostC : null; if (boost) { p.vx *= 3; p.vy -= 24; }
        p.size = U.rand(6, 22); p.life = U.rand(3, 5); p.age = 0; p.ph = Math.random() * 7; p.sw = U.rand(5, 14); p.fl = U.rand(3, 7);
        p.front = Math.random() < 0.4; p.on = true; p.hx.fill(p.x); p.hy.fill(p.y); p.rot = Math.random() * 6.28; p.spin = U.rand(-0.6, 0.6);
      }
    }
    for (const cv of [bc, fc]) { cv.save(); cv.globalCompositeOperation = 'screen'; }
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i]; if (!p.on) continue;
      p.age += dt; if (p.age >= p.life) { p.on = false; continue; }
      const k = p.age / p.life;
      if (C.trail) { p.hx.copyWithin(1, 0); p.hy.copyWithin(1, 0); p.hx[0] = p.x; p.hy[0] = p.y; }
      p.x += (p.vx + Math.cos(p.age * 1.3 + p.ph) * p.sw) * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
      const fade = Math.min(1, k / 0.15, (1 - k) / 0.3), a = fade * (0.7 + 0.3 * Math.sin(p.age * p.fl + p.ph)), sz = p.size * (1 - 0.45 * k), cv = p.front ? fc : bc, im = p.tint ? Motes.tinted(p.img, p.tint) : imgs[p.img];
      if (C.trail) for (let j = C.trail; j >= 1; j--) { cv.globalAlpha = a * 0.22 * (1 - j / (C.trail + 1)); const s2 = sz * (1 - j * 0.15); cv.drawImage(im, p.hx[j] - s2 / 2, p.hy[j] - s2 / 2, s2, s2); }
      cv.globalAlpha = a; cv.translate(p.x, p.y); cv.rotate(p.rot); cv.drawImage(im, -sz / 2, -sz / 2, sz, sz); cv.setTransform(I.dpr, 0, 0, I.dpr, 0, 0);
    }
    for (const cv of [bc, fc]) cv.restore();
  },
  drawSit(I, c, cx, cy, w, h, low) {
    const R = w * 0.6, t = I.t, br = 0.7 + 0.3 * Math.sin(t * 1.4);
    c.save(); c.globalCompositeOperation = 'lighter';
    // 地面光暈
    blob(c, cx, cy, R * 1.1, hexA(I.c, 0.18 * br));
    c.translate(cx, cy); c.scale(1, 0.3);
    const outer = haloImgs.sitOuter ? this.tint(I, 'sitOuter', 0.4) : this.sprite(I, 'rune', R, (cc, r) => this.runeRing(I, cc, r));
    c.globalAlpha = 0.85 * br; c.save(); c.rotate(t * 0.18); c.drawImage(outer, -R, -R, R * 2, R * 2); c.restore();
    if (!low) {
      const inner = haloImgs.sitInner ? this.tint(I, 'sitInner', 0.4) : this.sprite(I, 'bagua', R, (cc, r) => this.bagua(I, cc, r));
      c.globalAlpha = 0.9 * br; c.save(); c.rotate(-t * 0.28); c.drawImage(inner, -R, -R, R * 2, R * 2); c.restore();
    }
    c.restore();
    if (low) return;
    // 靈氣絲帶素材：左右翻轉模擬繞身旋轉；後層整條，前層只畫下半段（不遮臉）
    if (haloImgs.ribbon) {
      const rb = this.tint(I, 'ribbon', 0.3), H2 = h * 1.05, W2 = (H2 * rb.width) / rb.height, fc = I.front.getContext('2d');
      const sx = Math.cos(t * 0.7), k = Math.sign(sx || 1) * Math.max(0.3, Math.abs(sx)), base = cy + R * 0.12;
      const draw = (cv, scale, a, clipTop) => { cv.save(); cv.globalCompositeOperation = 'lighter'; cv.globalAlpha = a; if (clipTop) { cv.beginPath(); cv.rect(0, clipTop, I.W, I.H); cv.clip(); } cv.translate(cx, base); cv.scale(scale, 1); cv.drawImage(rb, -W2 / 2, -H2, W2, H2); cv.restore(); };
      draw(c, k, 0.55 + 0.2 * Math.sin(t * 1.3), 0);
      draw(fc, -k * 0.9, 0.35 + 0.15 * Math.sin(t * 1.1 + 1), cy - h * 0.42);
      return;
    }
    // 靈氣絲帶：從地面螺旋上升繞身；在身前的段落畫到前層畫布
    const fc = I.front.getContext('2d'), N = 3 + I.sub, SEG = 34, top = h * 0.95;
    for (const cv of [c, fc]) { cv.save(); cv.globalCompositeOperation = 'lighter'; cv.lineCap = 'round'; }
    for (let k = 0; k < N; k++) {
      const ph = (k / N) * Math.PI * 2, spd = 0.55 + k * 0.07;
      let px = null, py = null;
      for (let i = 0; i <= SEG; i++) {
        const s = i / SEG, th = ph + s * Math.PI * 2.4 + t * spd, rr = R * (0.95 - 0.5 * s) * (1 + 0.05 * Math.sin(t * 2 + k));
        const x = cx + Math.cos(th) * rr, y = cy - s * top + Math.sin(th) * rr * 0.3, front = Math.sin(th) > 0;
        if (px !== null) {
          const flow = 0.5 + 0.5 * Math.sin((s * 6 - t * 2.2 + k) * Math.PI);   // 往上流動的亮帶
          const a = Math.sin(s * Math.PI) * (0.25 + 0.6 * flow) * 0.8, cv = front ? fc : c;
          cv.strokeStyle = hexA(flow > 0.8 ? I.e : I.c, a); cv.lineWidth = (1 - s) * 5 + 1;
          cv.beginPath(); cv.moveTo(px, py); cv.lineTo(x, y); cv.stroke();
        }
        px = x; py = y;
      }
      // 絲帶頂端的光點
      const s = (t * 0.25 + k / N) % 1, th = ph + s * Math.PI * 2.4 + t * spd, rr = R * (0.95 - 0.5 * s);
      const x = cx + Math.cos(th) * rr, y = cy - s * top + Math.sin(th) * rr * 0.3, cv = Math.sin(th) > 0 ? fc : c;
      cv.fillStyle = hexA(I.e, Math.sin(s * Math.PI)); cv.beginPath(); cv.arc(x, y, 2.4, 0, 7); cv.fill();
      blob(cv, x, y, 10, hexA(I.c, 0.35 * Math.sin(s * Math.PI)));
    }
    for (const cv of [c, fc]) cv.restore();
  },
  drawBack(I, c, cx, cy, R, low) {
    const t = I.t, br = 0.62 + 0.38 * Math.sin(t * 1.6);   // 呼吸
    c.save(); c.globalCompositeOperation = 'lighter'; c.translate(cx, cy);
    blob(c, 0, 0, R * 1.25, hexA(I.c, 0.22 * br));
    const draw = (sp, rot, a, sc = 1) => { c.save(); c.rotate(rot); c.globalAlpha = a; const s = sp.width / I.dpr * sc; c.drawImage(sp, -s / 2, -s / 2, s, s); c.restore(); };
    if (!low) {
      draw(this.sprite(I, 'rays', R * 1.5, (cc, r) => this.rays(I, cc, r)), t * 0.08, 0.55 * br + 0.15, 1 + 0.04 * br);
      draw(this.sprite(I, 'dash', R * 1.18, (cc, r) => this.dashRing(I, cc, r * 0.97)), -t * 0.25, 0.75 * br + 0.2);
    }
    if (haloImgs.back) { c.globalAlpha = 0.55 + 0.45 * br; c.rotate(t * 0.12); c.drawImage(this.tint(I, 'back', 0.45), -R * 1.25, -R * 1.25, R * 2.5, R * 2.5); c.restore(); return; }
    // 實圈：粗光環＋內細環
    c.globalAlpha = 0.55 + 0.45 * br; c.strokeStyle = I.c; c.shadowColor = I.c; c.shadowBlur = 18; c.lineWidth = 4;
    c.beginPath(); c.arc(0, 0, R, 0, 7); c.stroke();
    c.strokeStyle = I.e; c.shadowBlur = 6; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, R - 3, 0, 7); c.stroke();
    if (!low) { c.globalAlpha = 0.5 * br; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, R * 0.72, 0, 7); c.stroke(); }
    c.restore();
  },
};

// ════════════════════════════════════════════
//  兵器展示框粒子：品階越高越密；神器加電光環繞
// ════════════════════════════════════════════
const Showcase = {
  start(cv, tier, color, edge) {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), W = r.width, H = r.height;
    if (!W) return;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const c = cv.getContext('2d'), low = Halo.isLow(), n = Math.round([6, 10, 18, 26, 40][tier] * (low ? 0.5 : 1));
    // 粒子從框內下緣往上飄，範圍略寬於框
    const mk = (init) => ({ x: U.rand(W * 0.2, W * 0.8), y: init ? U.rand(H * 0.1, H * 0.75) : H * 0.75, vy: -U.rand(10, 26) * (1 + tier * 0.25), vx: U.rand(-6, 6), r: U.rand(0.8, 2.2) + (tier >= 3 ? 0.6 : 0), ph: Math.random() * 7, gold: tier >= 3 && Math.random() < 0.4 });
    const ps = Array.from({ length: n }, () => mk(true));
    let flashes = [], nextBolt = U.rand(0.4, 1.2), bolt = null, t = 0, last = performance.now();
    const caseEl = cv.closest('.wcase');
    Knock.load('assets/fx/case_bolt.webp', { round: false, lo: 10 }).then((u) => { const im = new Image(); im.onload = () => (bolt = im); im.src = u; }).catch(() => console.warn('[特效] 展示框閃電素材載入失敗'));
    const loop = (now) => {
      if (!cv.isConnected) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H); c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]; p.y += p.vy * dt; p.x += (p.vx + Math.sin(t * 1.5 + p.ph) * 8) * dt;
        if (p.y < H * 0.08) { ps[i] = mk(false); continue; }
        const a = Math.min(1, (H * 0.75 - p.y) / 40, (p.y - H * 0.08) / 60) * (0.55 + 0.45 * Math.sin(t * 3 + p.ph));
        c.fillStyle = hexA(p.gold ? edge : color, Math.max(0, a)); c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill();
        if (tier >= 2) blob(c, p.x, p.y, p.r * 4, hexA(p.gold ? edge : color, Math.max(0, a) * 0.25));
      }
      // 閃電：素材隨機閃現（玄器以上）。每 1.5～3 秒一次、每次 0.2 秒；神器頻率加倍並讓框邊微閃
      // 只出現在框內四周與邊緣：中心橢圓（法寶主體）不放
      if (bolt && tier >= 2) {
        nextBolt -= dt;
        if (nextBolt <= 0) {
          nextBolt = U.rand(1.5, 3) / (tier >= 4 ? 2 : 1);
          const side = Math.random() < 0.5 ? -1 : 1, ex = W / 2 + side * W * U.rand(0.28, 0.4), ey = H * U.rand(0.18, 0.7);
          flashes.push({ x: ex, y: ey, ang: side * U.rand(0.05, 0.45) + (Math.random() < 0.3 ? Math.PI : 0), flip: Math.random() < 0.5, h: H * U.rand(0.32, 0.5), t: 0 });
          if (tier >= 4 && caseEl) { caseEl.classList.remove('zap'); void caseEl.offsetWidth; caseEl.classList.add('zap'); }
        }
        c.globalCompositeOperation = 'screen';
        for (const f of flashes) {
          f.t += dt; const k = f.t / 0.2; if (k >= 1) continue;
          const a = k < 0.15 ? k / 0.15 : k < 0.5 ? 1 - (k - 0.15) * 0.6 : (1 - k) * 1.6, w = (f.h * bolt.naturalWidth) / bolt.naturalHeight;
          c.save(); c.globalAlpha = Math.max(0, Math.min(1, a)); c.translate(f.x, f.y); c.rotate(f.ang); c.scale(f.flip ? -1 : 1, 1); c.drawImage(bolt, -w / 2, -f.h / 2, w, f.h); c.restore();
        }
        flashes = flashes.filter((f) => f.t < 0.2);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },
};

// ════════════════════════════════════════════
//  展示框法寶擺放：載入後裁掉近黑外圍（trim），依裁切後的比例縮放置中
//  規則：主體（含旋轉後外框）高度約佔框內 75%，寬度不超過框寬 85%；直立細長的劍再斜放 20 度
// ════════════════════════════════════════════
const CaseFit = {
  trimCache: {},
  trim(src) {
    if (this.trimCache[src]) return this.trimCache[src];
    return (this.trimCache[src] = new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        try {
          const W = im.naturalWidth, H = im.naturalHeight, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
          const c = cv.getContext('2d'); c.drawImage(im, 0, 0); const d = c.getImageData(0, 0, W, H).data;
          let x0 = W, y0 = H, x1 = -1, y1 = -1;
          for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const i = (y * W + x) * 4; if (Math.max(d[i], d[i + 1], d[i + 2]) * d[i + 3] / 255 > 26) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
          if (x1 < 0) return res({ src, w: W, h: H, nw: W, nh: H });
          x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(W - 1, x1 + 2); y1 = Math.min(H - 1, y1 + 2);
          const w = x1 - x0 + 1, h = y1 - y0 + 1;
          if (w * h > W * H * 0.94) return res({ src, w: W, h: H, nw: W, nh: H });   // 幾乎沒有黑邊：不必重畫
          const o = document.createElement('canvas'); o.width = w; o.height = h; o.getContext('2d').drawImage(im, x0, y0, w, h, 0, 0, w, h);
          res({ src: o.toDataURL('image/png'), w, h, nw: W, nh: H });
        } catch (e) { res({ src, w: im.naturalWidth, h: im.naturalHeight, nw: im.naturalWidth, nh: im.naturalHeight }); }
      };
      im.onerror = () => res(null);
      im.src = src;
    }));
  },
  // 依目前框的大小擺放；回傳量測結果（除錯用）
  async fit(caseEl) {
    const img = caseEl.querySelector('.wc-spin img'), inn = caseEl.querySelector('.wc-in'), frame = caseEl;
    if (!img || !inn) return null;
    const t = await this.trim(img.dataset.src || img.getAttribute('src')); if (!t) return null;
    if (!img.dataset.src) img.dataset.src = img.getAttribute('src');
    if (t.src !== img.src) img.src = t.src;
    const IH = inn.clientHeight, FW = frame.clientWidth, fb = caseEl.classList.contains('fb');
    // 劍：先轉成直立（rot），若直立後很細長，再斜放 20 度增加份量
    const rot = fb ? 0 : (parseFloat(getComputedStyle(caseEl).getPropertyValue('--r')) || 0) * Math.PI / 180;
    const c0 = Math.abs(Math.cos(rot)), s0 = Math.abs(Math.sin(rot)), uw = t.w * c0 + t.h * s0, uh = t.w * s0 + t.h * c0;
    const tilt = !fb && uw / uh < 0.5 ? 20 * Math.PI / 180 : 0, ang = rot + tilt;
    const c = Math.abs(Math.cos(ang)), s = Math.abs(Math.sin(ang)), bw = t.w * c + t.h * s, bh = t.w * s + t.h * c;
    const k = Math.min((0.75 * IH) / bh, (0.85 * FW) / bw);
    const w = t.w * k, h = t.h * k;
    Object.assign(img.style, { width: w + 'px', height: h + 'px', transform: `rotate(${ang}rad)` });
    caseEl.style.setProperty('--fitW', bw * k + 'px');
    return { nat: t.nw + 'x' + t.nh, trimmed: t.w + 'x' + t.h, shown: Math.round(w) + 'x' + Math.round(h), deg: Math.round((ang * 180) / Math.PI), hPct: Math.round((100 * bh * k) / IH), wPctFrame: Math.round((100 * bw * k) / FW), innerW: inn.clientWidth, innerH: IH };
  },
};
