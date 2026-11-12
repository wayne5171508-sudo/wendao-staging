'use strict';
// ════════════════════════════════════════════
//  特效層：覆蓋整個畫面的一張畫布（靈氣光點、雲霧、劍光、雷、靈罩、天象、傷害數字）
// ════════════════════════════════════════════

const BRUSH = '"LXGW WenKai TC","Kaiti TC","STKaiti","BiauKai","Songti TC",serif';

const FX = {
  cv: null, c: null, w: 0, h: 0, dpr: 1, list: [], motes: [], mists: [], ambient: 'qi', storm: 0, stormT: 0, flash: 0, t: 0,
  cranes: [], craneT: 2, cranesOn: false,
  // 遠景白鶴：淡色剪影成群掠過
  drawCranes(dt) {
    const c = this.c;
    this.craneT -= dt;
    if (this.craneT <= 0) {
      this.craneT = U.rand(8, 15);
      const dir = U.chance(0.5) ? 1 : -1, y = U.rand(0.1, 0.32), n = U.randi(2, 4), s = U.rand(0.55, 0.9);
      for (let i = 0; i < n; i++) this.cranes.push({ x: dir > 0 ? -0.1 - i * 0.06 : 1.1 + i * 0.06, y: y + i * 0.03 * (i % 2 ? 1 : -1), dir, s: s * U.rand(0.85, 1), v: U.rand(0.03, 0.045), ph: Math.random() * 7 });
    }
    for (const k of this.cranes) {
      k.x += k.v * k.dir * dt; k.ph += dt * 3.2;
      const x = k.x * this.w, y = k.y * this.h, flap = Math.sin(k.ph * 0.75);
      c.save(); c.translate(x, y); c.scale(k.dir * k.s, k.s); c.globalAlpha = 0.7;
      c.fillStyle = '#e4ecf2'; c.strokeStyle = '#e4ecf2'; c.lineCap = 'round';
      c.beginPath(); c.ellipse(0, 0, 13, 3, -0.06, 0, 7); c.fill();
      c.lineWidth = 1.6; c.beginPath(); c.moveTo(11, -1); c.quadraticCurveTo(20, -5, 27, -3); c.stroke();
      c.lineWidth = 1; c.beginPath(); c.moveTo(-11, 1); c.lineTo(-25, 3); c.stroke();
      for (const sd of [1, -0.45]) { const ty = -26 * flap * sd; c.fillStyle = '#e4ecf2'; c.beginPath(); c.moveTo(-6, 0); c.bezierCurveTo(-4, ty * 0.6, -6, ty, -16, ty - 2); c.bezierCurveTo(-10, ty * 0.5, 0, ty * 0.15, 6, 0); c.fill(); c.fillStyle = 'rgba(20,28,40,0.55)'; c.beginPath(); c.ellipse(-13, ty - 1, 4, 2, 0.4, 0, 7); c.fill(); }
      c.fillStyle = '#c8302a'; c.beginPath(); c.arc(26, -4, 1.2, 0, 7); c.fill(); c.restore();
    }
    this.cranes = this.cranes.filter((k) => k.x > -0.4 && k.x < 1.4);
  },
  init(cv) {
    this.cv = cv; this.c = cv.getContext('2d');
    for (let i = 0; i < 6; i++) this.mists.push({ x: Math.random(), y: 0.25 + Math.random() * 0.7, r: U.rand(0.35, 0.7), v: U.rand(0.006, 0.016), a: U.rand(0.05, 0.1) });
    this.resize();
  },
  resize() {
    const r = this.cv.parentElement.getBoundingClientRect();
    this.dpr = Math.min(2, devicePixelRatio || 1); this.w = r.width; this.h = r.height;
    this.cv.width = Math.round(r.width * this.dpr); this.cv.height = Math.round(r.height * this.dpr);
  },
  add(p) { p.t = 0; p.life = p.life || 0.6; this.list.push(p); return p; },
  clear() { this.list.length = 0; },

  // ───────── 產生器 ─────────
  burst(x, y, color, n = 12, speed = 160, size = 3, life = 0.6) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = speed * U.rand(0.3, 1); this.add({ k: 'dot', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, size: size * U.rand(0.5, 1.4), color, life: life * U.rand(0.6, 1.2), drag: 3 }); }
  },
  sparks(x, y, color, n = 8, speed = 320) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = speed * U.rand(0.4, 1); this.add({ k: 'streak', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color, life: U.rand(0.15, 0.3), drag: 6 }); }
  },
  ring(x, y, color, r0, r1, life = 0.4, width = 3) { this.add({ k: 'ring', x, y, r0, r1, color, life, width }); },
  // 劍光：斜向新月弧
  // ───────── 素材特效（取代舊的平面弧形色塊）─────────
  // 素材在 assets/fx/hit/，黑底；第一次戰鬥時由 Knock 去黑後快取。slash／crit_slash／combo 原圖是「左下→右上」的斜刀光
  SPR_SRC: { slash: 'assets/fx/hit/slash.webp', combo: 'assets/fx/hit/combo.webp', critSlash: 'assets/fx/hit/crit_slash.webp', hit: 'assets/fx/hit/hit.webp', critBurst: 'assets/fx/hit/crit_burst.webp', shield: 'assets/fx/hit/demon_shield.webp',
    thunder1: 'assets/fx/skill/thunder1.webp', thunder2: 'assets/fx/skill/thunder2.webp', thunder3: 'assets/fx/skill/thunder3.webp',
    rainSword: 'assets/fx/skill/rain_sword.webp', yujianRing: 'assets/fx/skill/yujian_ring.webp', jianyi: 'assets/fx/skill/jianyi.webp', heroShield: 'assets/fx/skill/shield_sphere.webp', shieldRing: 'assets/fx/skill/shield_ring.webp' },
  sprImg: {},
  // 特效強度：high | low | off（設定頁可切換）；沒設定過時低階機自動用 low
  level() { const s = S.d && S.d.settings && S.d.settings.fx; return s || (typeof Halo !== 'undefined' && Halo.isLow() ? 'low' : 'high'); },
  get low() { return this.level() !== 'high'; },
  applyLevel() { document.documentElement.dataset.fx = this.level(); },
  // 回傳 Promise：全部去黑並 decode 完成（失敗的跳過），戰鬥進場前會等它
  loadSprites() {
    if (typeof Knock === 'undefined') return Promise.resolve();
    return (this._spr ||= Promise.all(Object.entries(this.SPR_SRC).map(([k, src]) => Knock.load(src, { round: false, lo: 14 })
      .then((u) => { const im = new Image(); im.src = u; return im.decode().then(() => { this.sprImg[k] = im; if (k === 'slash') this.voidTint(); }); })
      .catch(() => console.warn('[特效] 素材載入失敗：' + src)))));
  },
  // 貼圖特效：w 為顯示寬度；ang 旋轉；s0→s1 縮放；dx,dy 掃過的位移；ghosts 殘影數（低階機自動關閉）
  spr(key, x, y, o = {}) {
    const im = this.sprImg[key]; if (!im) return false;
    const w = o.w || 200, h = (w * (im.naturalHeight || im.height)) / (im.naturalWidth || im.width);   // 染色版是 canvas，沒有 natural 尺寸   // 依原圖比例
    this.add({ k: 'spr', key, x, y, w, h, ang: o.ang || 0, s0: o.s0 ?? 0.85, s1: o.s1 ?? 1.15, dx: o.dx || 0, dy: o.dy || 0, flip: !!o.flip, ghosts: this.low ? 0 : o.ghosts ?? 2, life: o.life || 0.25, spin: o.spin || 0, fall: !!o.fall, ay: o.ay ?? 0.5, hold: o.hold || 0, delay: o.delay || 0, alpha: o.alpha ?? 1, op: o.op, onEnd: o.onEnd });
    return true;
  },
  // 舊介面相容：技能、怪物攻擊呼叫的 slash／wave 改用刀光素材（素材未載入時退回簡單光點）
  slash(x, y, r, ang, color, life = 0.28) {
    if (!this.spr('slash', x, y, { w: r * 2.6, ang: ang * 0.6, life: Math.max(0.22, Math.min(0.32, life)), dx: r * 0.5, dy: -r * 0.35 })) this.sparks(x, y, color, 6, 220);
  },
  // 九幽天魔的血刃斬：同一張刀光染成紫黑兩層（深色剪影墊底＋紫光），不新增素材；染色在載入時做一次
  voidTint() {
    const im = this.sprImg.slash, tint = (fill) => { const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const c = cv.getContext('2d'); c.drawImage(im, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = fill; c.fillRect(0, 0, cv.width, cv.height); return cv; };
    this.sprImg.slashShade = tint('#12001c'); this.sprImg.slashVoid = tint('#b45cff');
  },
  voidSlash(x, y, r, ang, life = 0.35) {
    const o = { w: r * 2.6, ang: ang * 0.6, life, dx: r * 0.5, dy: -r * 0.35 };
    if (!this.spr('slashShade', x, y, { ...o, w: o.w * 1.1, ghosts: 0, op: 'source-over', alpha: 0.85 })) return this.slash(x, y, r, ang, '#9b4dff', life);
    this.spr('slashVoid', x, y, o);
  },
  wave(x0, y0, x1, y1, color, life = 0.32) {
    // 劍氣：小刀光沿直線飛向目標（刀光原圖斜角約 -35°，轉到行進方向）
    const ang = Math.atan2(y1 - y0, x1 - x0) + 0.6;
    if (!this.spr('slash', (x0 + x1) / 2, (y0 + y1) / 2, { w: 120, ang, life, s0: 0.6, s1: 0.8, dx: x1 - x0, dy: y1 - y0, ghosts: 1 })) this.sparks(x1, y1, color, 6, 200);
  },
  // 護罩碎裂：沿橢圓邊緣產生六角光片向外飄
  hexBurst(cx, cy, rx, ry, color = '#bff4ff', fill = 'rgba(140,240,220,.18)') {
    const n = this.low ? 10 : 28;
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, x = cx + Math.cos(a) * rx * U.rand(0.7, 1), y = cy + Math.sin(a) * ry * U.rand(0.7, 1), sp = U.rand(60, 170);
      this.add({ k: 'hex', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, drag: 1.6, size: U.rand(5, 11), rot: Math.random() * 6, spin: U.rand(-3, 3), color, fill, life: U.rand(0.7, 1.1) }); }
  },
  // 波紋環：用環形素材由小擴大淡出（ry 壓扁成地面圓環）
  ripple(x, y, w, flat = 0.32, life = 0.6, alpha = 1) { if (!this.spr('shieldRing', x, y, { w, life, s0: 0.25, s1: 1.15, ghosts: 0, hold: 0.25, alpha })) this.ring(x, y, '#bff4ff', 10, w / 2, life, 3); const p = this.list[this.list.length - 1]; if (p && p.k === 'spr') p.sy = flat; },
  // 技能色全畫面閃光（閃完自動回到預設的淡紫白）
  flashColor(hex, a = 0.35) { const n = parseInt(hex.slice(1), 16); this.flashRGB = `${n >> 16},${(n >> 8) & 255},${n & 255}`; this.flash = Math.max(this.flash, a); },
  dim(a = 0.6, life = 0.6) { this.add({ k: 'dim', a, life }); },
  // 命中爆點：普通用 hit，暴擊用 crit_burst
  impact(x, y, crit, color) {
    this.spr(crit ? 'critBurst' : 'hit', x, y, { w: crit ? 300 : 170, ang: Math.random() * 6.28 * (crit ? 0 : 1), life: crit ? 0.38 : 0.28, s0: 0.35, s1: crit ? 1.15 : 1, ghosts: 0 });
    this.sparks(x, y, color || '#ffb070', this.low ? 3 : crit ? 14 : 7, crit ? 360 : 260);
  },
  bolt(x, y, color = '#e6d6ff', width = 4, life = 0.32) {
    const pts = []; let px = x + U.rand(-60, 60);
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push({ x: U.lerp(px, x, t) + (i && i < 12 ? U.rand(-22, 22) : 0), y: U.lerp(-20, y, t) }); }
    this.add({ k: 'bolt', pts, color, width, life });
  },
  // 飄字分道：dmg 傷害（怪物正下）、gain 收穫（右下）、info 狀態（左側）、hero 主角身上
  // 每個字先量出外框，跟畫面上還在飄的字比對，碰到就排到下一行並晚一點出現，依序錯開
  // 飄字分區：dmg 傷害與收穫（怪物身上，向上依序錯開）、skill 技能名（畫面上方居中，固定位置）、hero 主角身上
  LANES: { dmg: [0, 0], gain: [0, 0], info: [0, 0], hero: [0, 0], skill: [0, 0] },
  // 怪物名稱與血條的下緣（技能名、傷害飄字都不可以蓋上去）
  hudBottom() { const h = document.querySelector('.mon-hud'), s = document.querySelector('#scene'); if (!h || !s) return 120; const r = h.getBoundingClientRect(); return r.bottom - s.getBoundingClientRect().top + 6; },
  textBox(p) { return { l: p.x - p.w / 2, r: p.x + p.w / 2, t: p.y - p.h * 0.8, b: p.y + p.h * 0.25 }; },
  text(x, y, str, color = '#fff', size = 22, kind = 'dmg') {
    // 不飄進頂部怪物名牌與血條（約佔畫面上方 110px）：起點至少在血條下方「字高＋飄升距離」
    const rise = 70 * Math.min(1, this.h / 520), floor = Math.min(250, Math.max(this.h * 0.48, 110 + size + rise)), L = this.LANES[kind] || this.LANES.dmg;
    if (this.c) this.c.font = `700 ${size}px ${BRUSH}`;
    const w = (this.c ? this.c.measureText(str).width : str.length * size) + 10, h = size * 1.15;
    if (kind === 'info') kind = 'skill';
    const skill = kind === 'skill', top = this.hudBottom ? this.hudBottom() : 120;
    const p = { k: 'text', kind, x: skill ? (this.w || 400) / 2 : U.clamp(x + L[0], w / 2 + 4, (this.w || 400) - w / 2 - 4), y: skill ? top + size + 6 : kind === 'hero' ? y : Math.max(y, floor) + L[1] * size, w, h, vy: skill ? -8 : -rise, str, color, size, life: skill ? 1.3 : 1.0, delay: 0 };
    const over = (a, b) => { const A = this.textBox(a), B = this.textBox(b); return A.l < B.r && B.l < A.r && A.t < B.b && B.t < A.b; };
    for (let i = 0; i < 8; i++) {
      const hit = this.list.find((q) => q.k === 'text' && q.t < q.life * 0.8 && over(p, q));
      if (!hit) break;
      const up = this.textBox(hit).t - p.h * 0.25 - 3;   // 傷害往上疊；碰到血條下緣就改往下排
      p.y = !skill && kind !== 'hero' && up - p.h * 0.8 >= top + 64 ? up : this.textBox(hit).b + p.h * 0.8 + 3;   // 血條下方 64px 留給技能名
      p.delay = Math.max(p.delay, (hit.delay || 0) - hit.t + 0.1);   // 依序：晚 0.1 秒出現
    }
    this.add(p);
  },
  converge(x, y, color, n = 20, radius = 260, life = 1.2) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, r = radius * U.rand(0.6, 1.1); this.add({ k: 'conv', sx: x + Math.cos(a) * r, sy: y + Math.sin(a) * r, tx: x, ty: y, color, size: U.rand(1.6, 3.6), life: life * U.rand(0.7, 1.2), curl: U.rand(-1.2, 1.2) }); }
  },
  pillar(x, y, color, w = 90, life = 2) { this.add({ k: 'pillar', x, y, w, color, life }); },
  array(x, y, r, color, life = 1.2, spin = 1.6) { this.add({ k: 'array', x, y, r, color, life, spin }); },
  swordRain(x, y, color) {
    for (let i = 0; i < 18; i++) { const sx = x + U.rand(-120, 120), d = i * 0.035; this.add({ k: 'sword', x0: sx + U.rand(-30, 30), y0: -40, x1: x + U.rand(-50, 50), y1: y + U.rand(-30, 30), color, life: 0.45 + d, delay: d }); }
  },
  shake(el, mag = 6) {
    if (!el || this.noShake || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${mag}px,${-mag / 2}px)` }, { transform: `translate(${-mag}px,${mag / 2}px)` }, { transform: `translate(${mag / 2}px,0)` }, { transform: 'translate(0,0)' }], { duration: 220 });
  },

  // ───────── 更新與繪製 ─────────
  frame(dt) {
    this.t += dt;
    const c = this.c, W = this.w, H = this.h;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, W, H);
    // 天象異變
    this.storm = U.lerp(this.storm, this.stormT, Math.min(1, dt * 1.5));
    if (this.storm > 0.02) {
      c.fillStyle = `rgba(18,8,40,${0.55 * this.storm})`; c.fillRect(0, 0, W, H);
      c.save(); c.translate(W / 2, H * 0.08); c.scale(1, 0.4); c.rotate(this.t * 0.35);
      for (let i = 0; i < 7; i++) { c.rotate(0.9); blob(c, W * 0.22, 0, W * 0.32, `rgba(70,30,110,${0.4 * this.storm})`); }
      c.restore();
      if (this.storm > 0.6 && Math.random() < dt * 0.9) { this.flash = 0.7; this.bolt(U.rand(W * 0.1, W * 0.9), U.rand(H * 0.15, H * 0.45), '#d8c8ff', 2.5, 0.25); Audio2.play('thunder'); }
    }
    // 雲霧帶與靈氣光點
    if (this.ambient) {
      for (const m of this.mists) {
        m.x += m.v * dt; if (m.x - m.r > 1.2) m.x = -m.r;
        c.save(); c.globalAlpha = m.a; c.translate(m.x * W, m.y * H); c.scale(1, 0.28); blob(c, 0, 0, m.r * W * 1.4, this.ambient === 'realm' ? 'rgba(150,70,110,1)' : 'rgba(215,228,245,1)'); c.restore();
      }
      while (this.motes.length < 34) this.motes.push({ x: Math.random() * W, y: H * U.rand(0.2, 1.05), vy: U.rand(-26, -8), s: U.rand(0.8, 2.2), t: 0, life: U.rand(4, 9), ph: Math.random() * 7, gold: Math.random() < 0.25 });
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const m of this.motes) {
        m.t += dt; m.y += m.vy * dt; m.x += Math.sin(this.t * 1.1 + m.ph) * 0.3;
        const a = Math.sin((Math.PI * m.t) / m.life), col = this.ambient === 'realm' ? (m.gold ? '255,150,90' : '255,90,130') : m.gold ? '255,226,160' : '160,225,255';
        c.fillStyle = `rgba(${col},${a * 0.12})`; c.beginPath(); c.arc(m.x, m.y, m.s * 3, 0, 7); c.fill();
        c.fillStyle = `rgba(${col},${a * 0.85})`; c.beginPath(); c.arc(m.x, m.y, m.s * 0.8, 0, 7); c.fill();
      }
      c.restore();
      this.motes = this.motes.filter((m) => m.t < m.life);
    }
    if (this.cranesOn) this.drawCranes(dt);
    // 特效：飄字永遠最後畫，不被刀光、爆點蓋住
    this.list.sort((a, b) => (a.k === 'text') - (b.k === 'text') || (b.k === 'dim') - (a.k === 'dim'));
    for (const p of this.list) {
      p.t += dt;
      if (p.vx !== undefined) { p.x += p.vx * dt; p.y += (p.vy || 0) * dt; if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; } }
      else if (p.vy && p.t >= (p.delay || 0)) p.y += p.vy * dt;
      const t = p.t - (p.delay || 0); if (t < 0) continue;
      const k = Math.max(0, 1 - t / (p.life - (p.delay || 0)));
      c.save(); c.globalAlpha = k;
      if (p.k !== 'text') c.globalCompositeOperation = 'lighter';
      switch (p.k) {
        case 'dot': c.fillStyle = p.color; c.beginPath(); c.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, 7); c.fill(); break;
        case 'streak': { const sp = Math.hypot(p.vx, p.vy) || 1, L = Math.min(18, sp * 0.06) * k + 2; c.strokeStyle = p.color; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - (p.vx / sp) * L, p.y - (p.vy / sp) * L); c.stroke(); break; }
        case 'ring': c.strokeStyle = p.color; c.lineWidth = p.width * k + 0.5; c.beginPath(); c.arc(p.x, p.y, U.lerp(p.r0, p.r1, 1 - k), 0, 7); c.stroke(); break;
        // 素材特效：載入時已去黑（Knock），用 screen 疊加；先放大、沿出手方向掃過，再淡出，尾端留殘影
        case 'spr': {
          const im = this.sprImg[p.key]; if (!im) break;
          const e = Math.min(1, t / (p.life - p.delay)), ease = p.fall ? e * e : 1 - Math.pow(1 - Math.min(1, e / 0.55), 3);
          const fadeAt = p.hold || 0.45, alpha = p.alpha * Math.min(1, t / 0.04) * (e < fadeAt ? 1 : 1 - (e - fadeAt) / (1 - fadeAt));
          const draw = (q, a) => {
            const qq = Math.max(0, q), sc = p.s0 + (p.s1 - p.s0) * qq, x = p.x + p.dx * (p.fall ? qq - 1 : qq - 0.5), y = p.y + p.dy * (p.fall ? qq - 1 : qq - 0.5);
            c.save(); c.globalCompositeOperation = p.op || 'screen'; c.globalAlpha = a; c.translate(x, y); c.rotate(p.ang + p.spin * t); c.scale(sc * (p.flip ? -1 : 1), sc * (p.sy || 1));
            c.drawImage(im, -p.w / 2, -p.h * p.ay, p.w, p.h); c.restore();
          };
          if (p.onEnd && e >= 1 && !p.ended) { p.ended = true; p.onEnd(); }
          if (p.ghosts) for (let g = p.ghosts; g >= 1; g--) draw(ease - g * 0.16, alpha * (0.32 / g));   // 殘影
          draw(ease, alpha);
          break;
        }
        case 'hex': {   // 護罩碎片：六角形光片，旋轉並向外飄散
          c.translate(p.x, p.y); c.rotate(p.rot + p.spin * t); c.globalAlpha = k; c.strokeStyle = p.color; c.fillStyle = p.fill; c.lineWidth = 1.4; c.shadowColor = p.color; c.shadowBlur = 8;
          c.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * p.size, Math.sin(a) * p.size); } c.closePath(); c.fill(); c.stroke(); break;
        }
        case 'dim': { const e = t / p.life; c.globalCompositeOperation = 'source-over'; c.globalAlpha = (e < 0.2 ? e / 0.2 : 1 - (e - 0.2) / 0.8) * p.a; c.fillStyle = '#050310'; c.fillRect(0, 0, W, H); break; }
        case 'bolt': c.strokeStyle = p.color; c.lineWidth = p.width; c.shadowColor = p.color; c.shadowBlur = 20; c.beginPath(); p.pts.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y))); c.stroke(); c.lineWidth = p.width * 0.4; c.strokeStyle = '#fff'; c.stroke(); break;
        case 'conv': {
          const e = Math.min(1, t / p.life), ee = e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2, sw = Math.sin(ee * Math.PI) * 60 * p.curl;
          const dx = p.tx - p.sx, dy = p.ty - p.sy, l = Math.hypot(dx, dy) || 1, x = U.lerp(p.sx, p.tx, ee) + (-dy / l) * sw, y = U.lerp(p.sy, p.ty, ee) + (dx / l) * sw;
          c.globalAlpha = Math.sin(ee * Math.PI); c.fillStyle = p.color; c.beginPath(); c.arc(x, y, p.size, 0, 7); c.fill(); blob(c, x, y, p.size * 4, p.color.replace(/[\d.]+\)$/, '0.25)'));
          break;
        }
        case 'pillar': {
          // 光柱：橫向多層柔邊，縱向由下往上漸淡
          // 在離屏畫布上畫橫向柔邊，再用縱向漸層遮罩淡出，避免分段色帶
          const h = Math.max(1, Math.ceil(p.y * Math.min(1, t / 0.25))), w = Math.ceil(p.w), oc = this._pc || (this._pc = document.createElement('canvas')), o = oc.getContext('2d');
          oc.width = w; oc.height = h;
          const gx = o.createLinearGradient(0, 0, w, 0);
          gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(0.3, p.color); gx.addColorStop(0.5, 'rgba(255,255,255,0.85)'); gx.addColorStop(0.7, p.color); gx.addColorStop(1, 'rgba(0,0,0,0)');
          o.fillStyle = gx; o.fillRect(0, 0, w, h);
          o.globalCompositeOperation = 'destination-in'; const gy = o.createLinearGradient(0, 0, 0, h); gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(1, '#000'); o.fillStyle = gy; o.fillRect(0, 0, w, h);
          c.globalAlpha = k * 0.85; c.drawImage(oc, p.x - w / 2, p.y - h);
          break;
        }
        case 'array': c.translate(p.x, p.y); c.scale(1, 0.42); c.rotate(p.t * p.spin); drawArray(c, p.r * (0.7 + 0.3 * Math.min(1, t / 0.2)), p.color); break;
        case 'sword': {
          const e = Math.min(1, t / (p.life - p.delay)), x = U.lerp(p.x0, p.x1, e * e), y = U.lerp(p.y0, p.y1, e * e), ang = Math.atan2(p.y1 - p.y0, p.x1 - p.x0);
          c.translate(x, y); c.rotate(ang); c.shadowColor = p.color; c.shadowBlur = 14; c.fillStyle = p.color;
          c.beginPath(); c.moveTo(26, 0); c.lineTo(-14, -3.5); c.lineTo(-14, 3.5); c.closePath(); c.fill(); c.fillStyle = '#fff'; c.fillRect(-18, -6, 3, 12);
          break;
        }
        case 'text': {
          const sc = 1 + Math.max(0, 0.12 - t) * 5; c.globalAlpha = Math.min(1, k * 2.2);
          c.translate(p.x, p.y); c.scale(sc, sc); c.font = `700 ${p.size}px ${BRUSH}`; c.textAlign = 'center';
          c.lineWidth = 4; c.strokeStyle = 'rgba(6,8,14,0.85)'; c.strokeText(p.str, 0, 0); c.fillStyle = p.color; c.fillText(p.str, 0, 0);
          break;
        }
      }
      c.restore();
    }
    this.list = this.list.filter((p) => p.t < p.life);
    if (this.flash > 0) { c.fillStyle = `rgba(${this.flashRGB || '230,220,255'},${this.flash * 0.45})`; c.fillRect(0, 0, W, H); this.flash = Math.max(0, this.flash - dt * 2.5); if (!this.flash) this.flashRGB = null; }
  },
};

function blob(c, x, y, r, color) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
function drawArray(c, R, color) {
  c.strokeStyle = color; c.shadowColor = color; c.shadowBlur = 12; c.lineWidth = 2;
  c.beginPath(); c.arc(0, 0, R, 0, 7); c.stroke(); c.lineWidth = 1.2; c.beginPath(); c.arc(0, 0, R * 0.8, 0, 7); c.stroke();
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(a) * R * 0.82, Math.sin(a) * R * 0.82); c.lineTo(Math.cos(a) * R * (i % 3 ? 0.9 : 0.98), Math.sin(a) * R * (i % 3 ? 0.9 : 0.98)); c.stroke(); }
  for (let t = 0; t < 2; t++) { c.beginPath(); for (let j = 0; j <= 3; j++) { const a = (j / 3) * Math.PI * 2 + (t * Math.PI) / 3; c.lineTo(Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78); } c.stroke(); }
}
