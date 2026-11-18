'use strict';
// ════════════════════════════════════════════
//  丹爐仙氣前層：canvas 光粒與繞爐符文
//  畫布與 .fz-front 同大：寬 = 丹爐 2.5 倍、高 = 丹爐 1.4 倍，丹爐中心 x = 50%
//  狀態：idle（青金緩飄）、brew（轉金、收向爐口）、ok（向外爆散）、fail（轉灰黑、下沉）
// ════════════════════════════════════════════

const Aura = {
  RUNES: '丹靈玄元氣道仙炁乾坤坎離震巽',
  start(cv) {
    this.stop();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 粒子數依裝置調整：畫面面積、CPU 核心數、記憶體；減少動態時只留少量
    const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
    const tier = reduce ? 0.25 : cores >= 8 && mem >= 8 ? 1 : cores >= 4 ? 0.7 : 0.45;
    const dpr = Math.min(2, devicePixelRatio || 1), r = cv.getBoundingClientRect();
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    const W = r.width, H = r.height;
    this.cv = cv; this.c = cv.getContext('2d'); this.c.scale(dpr, dpr); this.W = W; this.H = H; this.state = 'idle'; this.t = 0;
    // 丹爐幾何（畫布座標）
    const fw = W / 2.5, top = H * (32 / 140), bot = H * (132 / 140);
    this.f = { cx: W / 2, fw, top, bot, fh: bot - top };
    this.mouth = { x: W / 2, y: top + (bot - top) * 0.32 };
    const n = Math.round(Math.min(48, (W * H) / 4200) * tier), runes = Math.max(3, Math.round(7 * tier));
    this.ps = Array.from({ length: n }, () => this.spawn(true));
    this.rs = Array.from({ length: runes }, (_, i) => this.spawnRune(i, runes, true));
    let last = performance.now();
    const loop = (now) => {
      if (!cv.isConnected) return this.stop();
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      this.frame(dt); this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    return n;
  },
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; },
  set(state) {
    this.state = state;
    if (state === 'ok') for (const p of this.ps) { const a = Math.atan2(p.y - this.mouth.y, p.x - this.mouth.x); p.vx = Math.cos(a) * U.rand(80, 200); p.vy = Math.sin(a) * U.rand(80, 200) - 40; p.life = Math.min(p.life, 1.4); }
  },
  // 光粒：只在丹爐左右兩側、約一個爐寬內生成，左右各半
  spawn(init) {
    const { cx, fw, top, bot } = this.f, side = Math.random() < 0.5 ? -1 : 1, gold = Math.random() < 0.35;
    return { x: cx + side * U.rand(fw * 0.42, fw * 0.95), y: init ? U.rand(top, bot) : U.rand(bot - (bot - top) * 0.3, bot), vx: -side * U.rand(0, 5), vy: U.rand(-24, -10),
      r: Math.random() < 0.2 ? U.rand(1.8, 2.8) : U.rand(0.7, 1.5), gold, tw: U.rand(0, 7), tws: U.rand(2, 6), life: U.rand(3, 6), age: init ? U.rand(0, 3) : 0 };
  },
  // 符文：沿繞爐的橢圓軌道旋轉，同時緩慢上升、越高越淡
  spawnRune(i, n, init) {
    return { ch: U.pick([...this.RUNES]), th: (i / n) * Math.PI * 2 + U.rand(-0.3, 0.3), sz: U.rand(14, 20), life: U.rand(6, 9), age: init ? U.rand(0, 5) : 0 };
  },
  // 在爐身範圍內的東西大幅變淡，特效不蓋住爐身
  bodyFade(x, y) {
    const { cx, fw, top, bot } = this.f, dx = Math.abs(x - cx) / (fw * 0.46), dy = (y - (top + (bot - top) * 0.3)) / ((bot - top) * 0.7);
    return dy > 0 && dy < 1 && dx < 1 ? 0.15 + 0.85 * Math.max(0, dx - 0.7) / 0.3 : 1;
  },
  frame(dt) {
    const { c, W, H, mouth, state } = this, F = this.f; this.t += dt;
    c.clearRect(0, 0, W, H);
    const brew = state === 'brew', fail = state === 'fail', spd = brew ? 2.2 : 1;
    c.globalCompositeOperation = fail ? 'source-over' : 'lighter';
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i];
      p.age += dt;
      if (brew) {   // 收向爐口
        const dx = mouth.x - p.x, dy = mouth.y - p.y, d = Math.hypot(dx, dy) || 1;
        p.vx += (dx / d) * 240 * dt; p.vy += (dy / d) * 240 * dt; p.vx *= 0.95; p.vy *= 0.95;
        if (d < 12) p.age = p.life;
      } else if (fail) { p.vy += 30 * dt; p.vx *= 0.98; }
      else if (state === 'idle') p.vx += Math.sin(this.t * 0.8 + p.tw) * 4 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt * (brew ? 1 : spd);
      if (p.age > p.life || p.y < F.top - F.fh * 0.25 || p.y > H) { this.ps[i] = state === 'ok' ? { ...this.spawn(), life: 0, age: 1 } : this.spawn(); continue; }
      const fade = Math.min(1, p.age / 0.6, (p.life - p.age) / 1.2), tw = 0.55 + 0.45 * Math.sin(this.t * p.tws + p.tw);
      const a = Math.max(0, fade * tw * 0.75 * this.bodyFade(p.x, p.y));
      c.fillStyle = fail ? `rgba(40,36,38,${a * 0.8})` : brew || p.gold ? `rgba(255,214,130,${a})` : `rgba(160,245,230,${a})`;
      c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill();
      if (p.r > 1.6 && !fail) { c.globalAlpha = a * 0.35; c.beginPath(); c.arc(p.x, p.y, p.r * 3, 0, 7); c.fill(); c.globalAlpha = 1; }
    }
    // 繞爐符文：橢圓軌道中心在爐身中段，半徑約一個爐寬；轉到爐後時變小變淡
    c.globalCompositeOperation = 'lighter'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const ocy = F.top + F.fh * 0.62, rx = F.fw * 0.92, ry = F.fw * 0.24;
    for (let i = 0; i < this.rs.length; i++) {
      const q = this.rs[i]; q.age += dt * spd; q.th += dt * 0.35 * spd;
      if (q.age > q.life) { this.rs[i] = { ...this.spawnRune(i, this.rs.length), th: q.th }; continue; }
      if (fail) continue;
      const k = q.age / q.life, front = Math.sin(q.th), x = F.cx + Math.cos(q.th) * rx, y = ocy + front * ry - k * F.fh * 0.55;
      const depth = front > 0 ? 1 : 0.45, a = Math.min(1, q.age / 1) * (1 - k * 0.85) * 0.85 * depth * this.bodyFade(x, y) * (0.75 + 0.25 * Math.sin(this.t * 2 + i));
      if (a <= 0.01) continue;
      c.font = `${q.sz * (front > 0 ? 1 : 0.82)}px "LXGW WenKai TC", serif`;
      c.fillStyle = brew ? `rgba(255,214,130,${a})` : `rgba(236,220,160,${a})`;
      c.shadowColor = brew ? '#ffb050' : '#7ff0d8'; c.shadowBlur = 8;
      c.fillText(q.ch, x, y);
    }
    c.shadowBlur = 0;
  },
};

// 自我檢查：爐身中央的透明度被壓低，爐外不受影響
console.assert((() => { const a = Object.create(Aura); a.f = { cx: 100, fw: 80, top: 0, bot: 200 }; return a.bodyFade(100, 150) < 0.3 && a.bodyFade(200, 150) === 1; })(), 'Aura.bodyFade 應壓低爐身範圍');
