'use strict';
// ════════════════════════════════════════════
//  戰鬥：上方妖物、下方主角背影；自動普攻，四個技能手動或自動施放；精英與首領會蓄力，首領三階段
// ════════════════════════════════════════════

const Battle = {
  on: false,
  // cont：從上一關「下一關」接續，秘境不再扣每日次數
  start(rid, idx, cont, ready) {
    if (!ready) { if (!this._prep) this._prep = Promise.resolve().then(() => this.prep(rid, idx)).catch(() => {}).then(() => { this._prep = null; this.start(rid, idx, cont, true); }); return; }
    const R = REGIONS.find((r) => r.id === rid), st0 = R.stages[idx];
    // 依境界調整難度：以目前境界加一點為準
    const st = R.scale ? { ...st0, p: S.d.lv + st0.p } : st0;
    if (R.daily && !cont) { if (S.dailyLeft() <= 0) { UI.toast('今日秘境次數已用盡，明日再來'); UI.stages(rid); return; } S.d.daily.realm++; S.save(); }
    const s = S.stats();
    $('#app').classList.remove('tall'); $('#app').classList.add('fighting');
    this.R = R; this.idx = idx; this.st = st; this.on = true; this.wave = 0; this.pause = 0.6; this.result = null;
    this.hero = { hp: s.hp, max: s.hp, mp: s.mp, maxmp: s.mp, regen: s.mpRegen, atk: s.atk, def: s.def, crit: s.crit, interval: s.interval, t: 0.3, shield: 0, shieldT: 0, pill: false, yiT: 0 };
    // 進場當下讀主手兵器決定立繪與光效（換裝後下一場立即生效）；兩者看同一把，不再一個看最高階、一個看主手
    this.main = this.wpn = S.wMain(); this.pose = battlePose(this.main);
    this.cd = Object.fromEntries(SKILLS.map((k) => [k.id, 0]));
    this.loot = { exp: 0, stone: 0 };
    // 一關只決定一次曲子：有首領的關卡播頭目戰，其餘播一般戰鬥（精英不換曲，避免一關內來回切）
    Audio2.loop('meditate', false);
    Audio2.setMood(st.waves.some((w) => MONSTERS[w.replace('*', '')].boss) ? 'boss' : 'battle');
    UI.setBg(R.bg, R.grade || 'dim');
    FX.clear(); FX.ambient = R.grade === 'realm' ? 'realm' : 'qi';
    UI.scene(`
      <div class="battle-top"><button class="seal sm ghost" id="bRun">撤</button><span class="wave-tag" id="bWave"></span></div>
      <div class="mon-hud"><h5 id="mName"></h5><div class="bar ${st.waves.some((w) => w.includes('yaojiang')) ? 'boss' : 'hp'}"><i id="mBar"></i><span id="mTxt"></span></div><div id="mCharge"></div></div>
      <div class="mon" id="mon"><img class="mon-shield back" alt=""><img id="monImg" alt=""><img class="mon-shield front" id="monShield" alt=""></div>
      <div class="combo-n hidden" id="comboN"><b>0</b><span>連擊</span></div>
      <div class="hshield back hidden" id="shieldBack"><img alt=""></div>
      <div class="hero-b ready ${this.pose.stance}" id="heroB">${heroArmed(this.main, this.pose.stance, 'pose bstance')}</div>
      <div class="hshield front hidden" id="shield"><img alt=""><i class="sh-hit"></i></div>`);
    UI.controls(`<div class="bstat">
        <div class="lbl"><span>氣血</span><span id="hTxtB"></span></div><div class="bar hp"><i id="hBarB"></i></div>
        <div class="lbl"><span>靈力</span><span id="pTxtB"></span></div><div class="bar mp"><i id="pBarB"></i></div></div>
      <div class="skills" style="--n:${this.skillList().length}">${this.skillList().map((k) => `<button class="skill" data-k="${k.id}" style="--c:${k.color}"><img class="sk-img" src="assets/skill/${k.id}.webp" alt="" onerror="this.remove()"><b>${k.icon}</b><i class="cd"></i><i class="sk-flash"></i><span class="cdt"></span><small>${k.name}</small></button>`).join('')}</div>
      <div class="row center bauto" style="margin-top:18px"><button class="seal sm ${S.d.auto ? '' : 'ghost'}" id="bAuto">${S.d.auto ? '自動施法・開' : '自動施法・關'}</button></div>`);
    document.querySelectorAll('.skill').forEach((b) => (b.onclick = () => { b.classList.remove('press'); void b.offsetWidth; b.classList.add('press'); this.cast(b.dataset.k); }));
    $('#bRun').onclick = () => this.end(false, true);
    $('#bAuto').onclick = () => { S.d.auto = !S.d.auto; S.save(); $('#bAuto').classList.toggle('ghost', !S.d.auto); $('#bAuto').textContent = S.d.auto ? '自動施法・開' : '自動施法・關'; };
    FX.loadSprites(); this.combo = 0; this.lastHit = 0; this.flip = false;
    // 護體罩素材：主角用原色，妖物（魔焰護體等）加紅黑濾鏡；素材缺失時主角退回 CSS 光罩、妖物不顯示，不影響戰鬥
    Knock.load(FX.SPR_SRC.heroShield, { round: false, lo: 12 }).then((u) => { document.querySelectorAll('.hshield img, .mon-shield').forEach((el) => (el.src = u)); }).catch(() => document.querySelectorAll('.hshield').forEach((el) => el.classList.add('img-fail')));
    this.shieldOn = false;
    this.spawn();
    // 背後多層光環，顏色隨主手品階
    Halo.mount('battle', '#heroB .hfig', this.main ? { c: WTIERS[this.main.tier].color, e: WTIERS[this.main.tier].edge } : null);
    // 神器：天象異變
    if (this.wpn && this.wpn.tier >= 4) setTimeout(() => this.on && this.heaven(), 500);
  },
  // 進場前的載入階段：特效圖去黑＋decode、本關立繪／兵器／妖物圖 decode，避免開場第一幀卡頓（第一次約 5×50ms）；最多等 3 秒
  prep(rid, idx) {
    const R = REGIONS.find((r) => r.id === rid), w = S.wMain(), pose = battlePose(w);
    const srcs = [Char.path(HERO_SWORD[pose.stance].img), w && W_IMG(w.id), ...R.stages[idx].waves.map((m) => `assets/mon/${MONSTERS[m.replace('*', '')].img}.webp`)];
    const dec = (src) => { const im = new Image(); im.src = src; return im.decode().catch(() => {}); };
    const arc = this.arcSrc(); this.arcOk = null;
    const arcDec = arc ? (() => { const im = new Image(); im.src = arc; return im.decode().then(() => (this.arcOk = arc), () => {}); })() : 0;
    document.body.classList.add('busy');
    return Promise.race([Promise.all([FX.loadSprites(), arcDec, ...srcs.filter(Boolean).map(dec)]), U.wait(3000)]).finally(() => document.body.classList.remove('busy'));
  },
  // 劍氣光弧圖（選用）：assets/cast/arc.webp，女主 assets/cast_yunxi/arc.webp；弧口朝右（行進方向）
  //  要在素材清單裡、且進場前 decode 成功才用（this.arcOk），否則沿用 CSS 光弧
  arcSrc() { const p = ((typeof Char !== 'undefined' && Char.cur().castDir) || 'assets/cast/') + 'arc.webp'; return typeof ASSET_LIST !== 'undefined' && ASSET_LIST.includes(p) ? p : null; },
  // 兵器技能只在達到階級後出現在技能列
  skillList() { return SKILLS.filter((k) => k.wt === undefined || S.skillOpen(k)); },
  heaven() {
    FX.stormT = 1; Audio2.play('thunder'); FX.flash = 0.8; FX.shake($('#scene'), 10);
    const p = this.heroPos(); FX.bolt(p.x + 40, p.y - 160, '#ffb08a', 6, 0.4);
    UI.banner('逆天劍鳴', '神兵出鞘，天象異變');
    setTimeout(() => { FX.stormT = 0; }, 2600);
  },
  // 技能色調：同一套施法特效依技能換色（劍氣青綠、雷法紫藍、護體金白），其他技能用技能本色
  TINT: { jianqi: '#4ff2c4', leifa: '#8f8cff', huti: '#ffe9b0' },
  tint(id) { return this.TINT[id] || SKILLS.find((k) => k.id === id).color; },
  // 施法立繪：短暫切入
  cutin(id) {
    if (!CAST_IMG[id]) return;
    const old = $('.cutin'); if (old) old.remove();
    const el = document.createElement('div'); el.className = 'cutin'; el.style.setProperty('--c', this.tint(id));
    el.innerHTML = `<img src="${CAST_IMG[id]}" alt="">`;
    $('#sceneContent').appendChild(el); setTimeout(() => el.remove(), 900);
  },

  spawn() {
    const key = this.st.waves[this.wave], elite = key.endsWith('*'), type = key.replace('*', ''), M = MONSTERS[type];
    const s = monStats(type, this.st.p, elite);
    this.mon = { type, M, elite, boss: !!M.boss, ...s, max: s.hp, t: s.interval * 0.8, charge: 0, chargeMax: 0, chargeCd: M.boss ? 6 : 8, phase: 1, stun: 0, dr: 0, leech: 0, ph: M.phases ? M.phases[0] : null };
    const img = $('#monImg'); img.src = `assets/mon/${M.img}.webp`;
    const box = $('#mon'); box.className = 'mon enter' + (M.boss ? ' boss' : ''); setTimeout(() => box.classList.remove('enter'), 520);
    $('#mName').innerHTML = `${M.name}${elite ? '<em>精英</em>' : ''}${M.boss ? `<em>${M.phases[0].name}</em>` : ''}`;
    box.classList.toggle('tianmo', M.tint === 'tianmo');
    $('#bWave').textContent = `${this.st.name}　${this.wave + 1} / ${this.st.waves.length}`;
    if (M.boss) { UI.banner(...(M.intro || [M.name, '秘境之主，自血池中站起'])); Audio2.play('roar'); FX.shake($('#scene'), 8); }
    this.render();
  },

  monPos() { return { x: FX.w / 2, y: FX.h * (this.mon && this.mon.boss ? 0.36 : 0.34) }; },
  heroPos() { return { x: FX.w / 2, y: FX.h * 0.84 }; },

  dmgMon(base, color, opts = {}) {
    const m = this.mon; if (!m || m.hp <= 0) return;
    const crit = Math.random() < this.hero.crit + (this.hero.yiT > 0 ? 0.2 : 0), pierce = S.wFx('pierce');
    const dmg = Math.max(1, Math.round(base * U.rand(0.92, 1.08) * (crit ? 1.8 : 1) * (pierce && m.boss ? 1.25 : 1) - (pierce ? 0 : m.def * 0.5)));
    const real = Math.max(1, Math.round(dmg * (1 - m.dr)));
    m.hp -= real;
    const p = this.monPos();
    FX.text(p.x, p.y - 30, (crit ? '暴擊 ' : '') + U.fmt(real), crit ? '#ffd76a' : m.dr ? '#ffb4b4' : color || '#ffffff', crit || opts.big ? 30 : 23, 'dmg');
    const box = $('#mon'); box.classList.add('hit'); setTimeout(() => box.classList.remove('hit'), 90);
    if (crit) this.hitstop(opts.big ? 110 : 80, opts.big ? 10 : 7);
    else if (opts.big) FX.shake($('#scene'), 10);
    Audio2.play(crit || opts.big ? 'hitHeavy' : 'hit');
    if (m.hp <= 0) this.kill();
    return { crit };
  },

  kill() {
    const m = this.mon, p = this.monPos();
    m.hp = 0; $('#mon').classList.add('dead');
    FX.burst(p.x, p.y, m.boss ? '#ff6a7a' : '#9fe8ff', 36, 260, 3.5, 1);
    FX.ring(p.x, p.y, 'rgba(255,255,255,0.7)', 20, 160, 0.5, 4);
    this.loot.exp += m.exp; this.loot.stone += m.stone;
    FX.text(p.x, p.y, `修為 +${U.fmt(m.exp)}`, '#b8f0c8', 18, 'gain');
    if (m.boss) { Audio2.play('boom'); FX.shake($('#scene'), 14); }
    this.wave++; this.pause = 1.0;
    if (this.wave >= this.st.waves.length) { this.pause = 99; setTimeout(() => this.end(true), 1100); }
    else setTimeout(() => { if (this.on) this.spawn(); }, 900);
  },

  hurtHero(raw, label, src) {
    const h = this.hero; if (h.hp <= 0) return;
    let dmg = Math.max(1, Math.round(raw * U.rand(0.9, 1.1) - h.def * 0.5));
    const hp0 = this.heroPos();
    if (h.shield > 0) { const a = Math.min(h.shield, dmg); h.shield -= a; dmg -= a; FX.ring(hp0.x, hp0.y - 60, '#8ff0d8', 40, 110, 0.35, 3); this.shieldFx(h.shield > 0 ? 'hit' : 'off', this.monPos().x, this.monPos().y); if (dmg <= 0) { FX.text(hp0.x, hp0.y - 120, '靈罩吸收', '#8ff0d8', 18, 'hero'); return; } }
    h.hp -= dmg;
    // 首領第三相：以血養血
    if (src && src.leech && src.hp > 0) { const heal = Math.round(dmg * src.leech); src.hp = Math.min(src.max, src.hp + heal); const mp = this.monPos(); FX.text(mp.x, mp.y, '+' + U.fmt(heal), '#ff6a7a', 16, 'info'); }
    FX.text(hp0.x, hp0.y - 130, (label ? label + ' ' : '-') + U.fmt(dmg), '#ff7a7a', label ? 28 : 22, 'hero');
    const hb = $('#heroB'); hb.classList.remove('hurt'); void hb.offsetWidth; hb.classList.add('hurt');
    FX.sparks(hp0.x, hp0.y - 80, '#ff8a8a', 8, 260); Audio2.play('hurt');
    if (label) FX.shake($('#scene'), 12);
    if (h.hp < h.max * 0.3 && !h.pill && S.take('p_heal')) { h.pill = true; h.hp = Math.min(h.max, h.hp + h.max * 0.4); FX.text(hp0.x, hp0.y - 170, '服下回春丹', '#ff8a8a', 18, 'hero'); FX.burst(hp0.x, hp0.y - 80, '#ff8a8a', 18, 140); }
    if (h.hp <= 0) { h.hp = 0; this.pause = 99; setTimeout(() => this.end(false), 700); }
  },

  cast(id) {
    if (!this.on || this.pause > 0 || !this.mon || this.mon.hp <= 0) return;
    const k = SKILLS.find((x) => x.id === id), h = this.hero;
    if (!S.skillOpen(k)) { UI.toast(`尚未習得「${ARTS.find((a) => a.id === k.from).name}」`); return; }
    if (this.cd[id] > 0 || h.mp < k.mp) return;
    h.mp -= k.mp; this.cd[id] = k.cd;
    const lv = S.artLv(k.from), m = this.monPos(), hp = this.heroPos(), tint = this.tint(id);
    FX.array(hp.x, hp.y - 4, 110, tint, 0.7); Halo.boost(tint);
    this.cutin(id); Audio2.play('cast');   // 開招式
    const low = FX.low, alive = () => this.on && this.mon && this.mon.hp > 0;
    if (id === 'yujian') {
      // 御劍：飛劍環繞主角旋轉（持續約 1.4 秒），三把依序飛出斬向妖物
      FX.spr('yujianRing', hp.x, hp.y - 120, { w: 260, life: 1.6, s0: 0.5, s1: 1, spin: 2.4, hold: 0.75, ghosts: 0, alpha: 0.9 });
      Audio2.play('wave');
      for (let i = 0; i < 3; i++) setTimeout(() => { if (!alive()) return; const sx = hp.x + (i - 1) * 70; FX.wave(sx, hp.y - 120, m.x + (i - 1) * 20, m.y, k.color, 0.28); Audio2.play('swing1'); setTimeout(() => alive() && (FX.slash(m.x, m.y, 100, -0.4 + i * 0.4, k.color, 0.25), FX.impact(m.x + (i - 1) * 20, m.y, false, k.color), this.dmgMon(h.atk * k.mult, k.color)), 160); }, 450 + i * 200);
    } else if (id === 'jianyi') {
      // 劍意：金色巨劍虛影橫斬（左→右），留下金色裂紋與殘影；之後八息內普攻強化
      h.yiT = 8; Audio2.play('gong');
      FX.dim(0.35, 0.7);
      FX.spr('jianyi', m.x, m.y + 10, { w: 300, ang: -Math.PI / 2 + 0.12, dx: 160, dy: -10, life: 0.5, s0: 0.85, s1: 1.15, ghosts: 3, hold: 0.55 });
      setTimeout(() => { if (!alive()) return; FX.spr('jianyi', m.x, m.y + 20, { w: 340, ang: -Math.PI / 2, life: 0.9, s0: 1, s1: 1.05, ghosts: 0, alpha: 0.55, hold: 0.3 }); this.dmgMon(h.atk * 2.2, k.color, { big: true }); FX.sparks(m.x, m.y, '#ffd76a', low ? 4 : 16, 340); }, 180);
      FX.text(hp.x, hp.y - 190, '劍意凜然', k.color, 22, 'hero');
    } else if (id === 'jianqi') {
      // 劍氣橫掃：立繪微前傾 → 青綠劍氣自劍尖旋轉掃向妖物（約 0.4 秒、帶拖影）→ 命中閃光、擴散光環、妖物後退震動
      const tip = this.swordTip(), swept = this.qiSweep(tip, m, tint); Audio2.play('wave');
      if (!swept) FX.wave(hp.x, hp.y - 90, m.x, m.y, tint, 0.3);
      setTimeout(() => { if (!alive()) return; this.dmgMon(h.atk * k.mult, tint); if (!swept) FX.slash(m.x, m.y, 110, -0.5, tint, 0.3); FX.impact(m.x, m.y, false, tint); this.hitFx(m, tint); }, swept ? 380 : 200);   // 刀光素材是固定橘色，有劍氣橫掃時不再疊
    } else if (id === 'leifa') {
      // 雷法：全畫面變暗＋雲層閃光 → 0.15 秒後主雷柱劈落 → 環形衝擊波、地面裂痕光、電火花 → 震動與 100ms 定格
      const boost = (1 + 0.15 * (lv - 1)) * (1 + (S.rootFx().thunder || 0)), gy = m.y + 70;
      FX.dim(0.72, 0.9); FX.flash = 0.25;
      setTimeout(() => {
        if (!this.on || !this.mon) return;
        const key = 'thunder' + (1 + Math.floor(Math.random() * 3)), x = m.x + U.rand(-20, 20);
        FX.spr(key, x, gy, { w: 330, ay: 0.86, ang: U.rand(-0.08, 0.08), flip: Math.random() < 0.5, life: 0.5, s0: 1, s1: 1.04, ghosts: 0, hold: 0.4 });
        if (!low) FX.spr('thunder' + (1 + ((+key.slice(-1)) % 3)), x + U.rand(-50, 50), gy, { w: 220, ay: 0.86, flip: Math.random() < 0.5, life: 0.35, s0: 1, s1: 1, ghosts: 0, alpha: 0.5, delay: 0.06 });
        FX.flash = 0.9; Audio2.play('thunder');
        FX.ring(x, gy, '#d8c4ff', 16, 220, 0.5, 6); FX.ring(x, gy, '#ffffff', 10, 120, 0.3, 3);   // 環形衝擊波
        FX.add({ k: 'ring', x, y: gy, r0: 30, r1: 90, color: '#b48cff', life: 0.8, width: 10 });            // 地面裂痕光
        FX.sparks(x, gy - 40, '#e6d6ff', low ? 6 : 22, 420);
        this.hitstop(100, 14);
        if (alive()) { this.dmgMon(h.atk * k.mult * boost, k.color, { big: true }); this.hitFx(m, tint); if (this.mon) { this.mon.stun = 1; this.mon.charge = 0; } }
      }, 150);
    } else if (id === 'huti') {
      h.shield = Math.round(h.max * k.mult * (1 + 0.1 * (lv - 1))); h.shieldT = 8; Audio2.play('shield');
      this.shieldFx('on');
      FX.converge(hp.x, hp.y - 70, 'rgba(255,233,176,0.9)', low ? 8 : 22, 160, 0.6);
      if (FX.level() !== 'off') FX.ring(hp.x, hp.y - 70, tint, 30, 150, 0.5, 4);
    } else if (id === 'wanjian') {
      // 萬劍齊發：約 0.8 秒內分批落下，後排（小、遠、偏上）到前排（大、近）；每把落點小爆點；最後一波集中在目標並放衝擊波
      FX.flash = 0.3; Audio2.play('wave'); FX.dim(0.4, 1.3);
      const waves = low ? 3 : 5, per = low ? 3 : 5, dmg = (h.atk * k.mult * (1 + 0.15 * (lv - 1))) / waves;
      for (let wv = 0; wv < waves; wv++) {
        const last = wv === waves - 1, depth = wv / (waves - 1);   // 0 後排 → 1 前排
        setTimeout(() => {
          if (!this.on) return;
          for (let j = 0; j < (last ? per + 2 : per); j++) {
            const tx = last ? m.x + U.rand(-30, 30) : m.x + U.rand(-130, 130) * (1 - depth * 0.4), ty = last ? m.y + U.rand(-10, 30) : m.y - 60 + depth * 120 + U.rand(-20, 20);
            const sz = 30 + depth * 34, dl = j * 0.03;
            FX.spr('rainSword', tx, ty, { w: sz, ay: 1, dy: 260 + depth * 120, dx: U.rand(-20, 20), fall: true, life: 0.22 + dl, delay: dl, s0: 1, s1: 1, ghosts: low ? 0 : 1, hold: 0.85, ang: U.rand(-0.12, 0.12),
              onEnd: () => { FX.impact(tx, ty, false, '#9ff0e0'); } });
          }
          setTimeout(() => {
            if (!alive()) return;
            Audio2.play('swing1');   // 同一音效最多 4 個重疊（AudioManager 限制）
            this.dmgMon(dmg, k.color, { big: last });
            if (last) { FX.ring(m.x, m.y, '#ffe7a0', 20, 230, 0.6, 7); FX.impact(m.x, m.y, true, '#ffe7a0'); FX.shake($('#scene'), 12); }
          }, 220 + per * 30);
        }, wv * (800 / waves));
      }
    }
  },
  // 護體罩（前後兩層包住主角）：on 由腳下往上展開＋地面波紋；hit 受擊方向局部閃亮＋小波紋；off 碎成六角光片
  shieldGeo() {
    const hb = document.querySelector('#heroB .hfig'), s0 = $('#scene').getBoundingClientRect(); if (!hb) return null;
    const r = hb.getBoundingClientRect(), H = r.height * 1.15, W = H * (541 / 600);   // 角色高度的 1.15 倍，依素材比例
    return { cx: r.left - s0.left + r.width / 2, bottom: r.bottom - s0.top + r.height * 0.06, W, H };
  },
  shieldFx(state, fromX, fromY) {
    const els = [$('#shieldBack'), $('#shield')]; if (!els[1]) return;
    const g = this.shieldGeo();
    if (state === 'on') {
      if (g) for (const el of els) Object.assign(el.style, { left: g.cx - g.W / 2 + 'px', top: g.bottom - g.H + 'px', width: g.W + 'px', height: g.H + 'px' });
      for (const el of els) { el.classList.remove('hidden', 'off', 'hit', 'on'); void el.offsetWidth; el.classList.add('on'); }
      if (g) { FX.ripple(g.cx, g.bottom - g.H * 0.06, g.W * 1.5, 0.3, 0.7); setTimeout(() => FX.ripple(g.cx, g.bottom - g.H * 0.5, g.W * 1.3, 1, 0.55, 0.6), 380); }
      this.shieldOn = true;
    } else if (state === 'hit' && g) {
      // 擊中方向：從護罩中心指向攻擊來源，在邊緣亮一塊並冒小波紋
      const cy = g.bottom - g.H / 2, ang = Math.atan2((fromY ?? 0) - cy, (fromX ?? g.cx) - g.cx), ex = Math.cos(ang) * 0.46, ey = Math.sin(ang) * 0.46;
      const spot = els[1].querySelector('.sh-hit'); spot.style.left = 50 + ex * 100 + '%'; spot.style.top = 50 + ey * 100 + '%';
      els[1].classList.remove('hit'); void els[1].offsetWidth; els[1].classList.add('hit'); clearTimeout(this.shHitT); this.shHitT = setTimeout(() => els[1].classList.remove('hit'), 360);
      FX.ripple(g.cx + ex * g.W, cy + ey * g.H, g.W * 0.45, 1, 0.4, 0.8);
    } else if (state === 'off' && this.shieldOn) {
      this.shieldOn = false;
      for (const el of els) { el.classList.add('off'); el.classList.remove('on'); }
      if (g) FX.hexBurst(g.cx, g.bottom - g.H / 2, g.W * 0.48, g.H * 0.48);
      setTimeout(() => els.forEach((el) => el.classList.add('hidden')), 420);
    }
  },
  // 劍氣橫掃（DOM＋CSS transform/opacity，不用影片）：新月形劍氣自劍尖旋轉擴散飛向妖物，後面跟兩道拖影；強度「關」時回傳 false 走舊的刀光
  qiSweep(from, to, color) {
    const lv = FX.level(), host = $('#sceneContent'); if (lv === 'off' || !host || !host.animate) return false;
    this.leanAnim();
    const dx = to.x - from.x, dy = to.y - from.y, ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const n = lv === 'high' ? 3 : 1;   // 本體＋拖影數
    for (let i = 0; i < n; i++) {
      const el = document.createElement('i'); el.className = 'qi-sweep' + (i ? ' ghost' : ''); el.style.setProperty('--c', color);
      if (this.arcOk) { el.classList.add('img'); el.style.backgroundImage = `url(${this.arcOk})`; }
      el.style.left = from.x + 'px'; el.style.top = from.y + 'px'; host.appendChild(el);
      const a = i ? 0.45 / i : 1, tf = (p, s, r) => `translate(-50%,-50%) translate(${dx * p}px,${dy * p}px) rotate(${ang + r}deg) scale(${s})`;
      el.animate([
        { transform: tf(0, 0.45, -40), opacity: 0 },
        { transform: tf(0.25, 0.9, 10), opacity: a, offset: 0.2 },
        { transform: tf(0.85, 1.5, 70), opacity: a, offset: 0.75 },
        { transform: tf(1, 1.9, 95), opacity: 0 },
      ], { duration: 400, delay: i * 45, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'both' }).onfinish = () => el.remove();
    }
    return true;
  },
  // 施放時立繪微前傾（以腳底為軸），不打斷普攻動作
  leanAnim() {
    const el = document.querySelector('#heroB .hfig'); if (!el || !el.animate || (this.atkAnim && this.atkAnim.playState === 'running')) return;
    const f = (y, r) => ({ transform: `translateX(-50%) translateY(${y}%) rotate(${r}deg)` });
    this.atkAnim = el.animate([f(0, 0), { ...f(-3, 4), offset: 0.3 }, f(0, 0)], { duration: 450, easing: 'ease-out' });
  },
  // 命中：技能色閃光＋兩圈擴散光環，妖物後退並震動（閃白與傷害數字由 dmgMon 處理）
  hitFx(m, color) {
    if (FX.level() === 'off') return;
    FX.flashColor(color, 0.35);
    FX.ring(m.x, m.y, color, 16, 150, 0.45, 5); if (FX.level() === 'high') FX.ring(m.x, m.y, '#ffffff', 10, 90, 0.3, 2);
    const img = $('#monImg'); if (!img || !img.animate || FX.noShake) return;
    img.animate([{ transform: 'none' }, { transform: 'translate(4px,-5%) scale(.97)', offset: 0.25 }, { transform: 'translate(-4px,-4%) scale(.97)', offset: 0.45 }, { transform: 'translate(2px,-2%)', offset: 0.7 }, { transform: 'none' }], { duration: 320, easing: 'ease-out' });
  },
  // 普攻動作（以程式位移與旋轉模擬，之後補圖可換成逐格立繪）：蓄勢後撤 → 前衝 → 揮劍 → 後座回位
  attackAnim(scale = 1) {
    const el = document.querySelector('#heroB .hfig'); if (!el || !el.animate) return;
    if (this.atkAnim) this.atkAnim.cancel();
    const f = (y, s, r) => ({ transform: `translateX(-50%) translateY(${y * scale}%) scale(${1 - (1 - s) * scale}) rotate(${r * scale}deg)` });
    this.atkAnim = el.animate([
      { ...f(0, 1, 0), offset: 0 }, { ...f(4, 1.01, 5), offset: 0.16 },          // 蓄勢
      { ...f(-15, 0.9, -6), offset: 0.4, easing: 'cubic-bezier(.2,.8,.3,1)' },  // 前衝
      { ...f(-13, 0.9, -16), offset: 0.55 },                                      // 揮劍
      { ...f(3, 1.02, 3), offset: 0.8 },                                          // 後座
      { ...f(0, 1, 0), offset: 1 },
    ], { duration: 480, easing: 'ease-out' });
  },
  // 暴擊：短暫定格，再鏡頭震動與拉近
  hitstop(ms, mag) {
    const sc = $('#scene'); Game.freeze = ms / 1000; sc.classList.add('hitstop');
    const a = this.atkAnim; if (a && a.playState === 'running') a.pause();
    setTimeout(() => {
      sc.classList.remove('hitstop'); if (a && a.playState === 'paused') a.play();
      FX.shake(sc, mag);
      if (!FX.noShake) for (const el of [$('#mon img#monImg'), $('#heroB')]) if (el && el.animate) el.animate([{ scale: '1.04' }, { scale: '1' }], { duration: 240, easing: 'ease-out' });   // 只放大妖物與主角；不可對整個場景層做 transform，否則血條會掉到特效下面
    }, ms);
  },
  // 起手式劍尖在畫面上的位置（劍光與出劍特效從這裡發出）
  swordTip() {
    const el = document.querySelector('#heroB .hfig.bstance'), sc = $('#scene').getBoundingClientRect();
    if (!el) return { x: this.heroPos().x, y: this.heroPos().y - 90 };
    const r = el.getBoundingClientRect(), [x1, y1, bx2, by2] = HERO_SWORD[this.pose.stance].blade, g = wGrip(this.main, this.pose.stance), x2 = bx2 - g * (bx2 - x1), y2 = by2 - g * (by2 - y1);   // 疊劍往後退了 grip，劍尖跟著退
    // 立繪整體前傾 lean 度（以腳底為軸），把劍身座標一起轉過去
    const lean = (parseFloat(getComputedStyle($('#heroB')).getPropertyValue('--lean')) || 0) * Math.PI / 180, ox = r.left - sc.left + r.width / 2, oy = r.bottom - sc.top;
    const rot = (px, py) => { const dx = px - ox, dy = py - oy; return [ox + dx * Math.cos(lean) - dy * Math.sin(lean), oy + dx * Math.sin(lean) + dy * Math.cos(lean)]; };
    const [tx, ty] = rot(r.left - sc.left + x2 * r.width, r.top - sc.top + y2 * r.height), [hx, hy] = rot(r.left - sc.left + x1 * r.width, r.top - sc.top + y1 * r.height);
    return { x: tx, y: ty, hx, hy };
  },
  // 一次普攻：兵器階級越高，劍光軌跡與命中特效越華麗
  swing(mult, tag) {
    const h = this.hero, m = this.mon;
    if (!this.on || !m || m.hp <= 0) return;
    const p = this.monPos(), w = this.wpn, t = w ? w.tier : -1, c = w ? WTIERS[t].color : S.d.root ? ROOTS[S.d.root].color : '#9fe8ff';
    const combo = tag === '連擊';
    if (S.wFx('slow') && !m.slowed) { m.slowed = true; m.interval *= 1.25; FX.text(p.x, p.y, '霜寒', '#bfe8ff', 18, 'skill'); }
    const res = this.dmgMon(h.atk * mult * (h.yiT > 0 ? 1.6 : 1)) || {};
    // 刀光從主角出手方向（左下）掃向右上，約 0.25 秒；連擊換 combo 素材並左右鏡像輪流；暴擊改播暴擊斬
    const hx = p.x + U.rand(-14, 14), hy = p.y + U.rand(-24, 10), sz = 205 + Math.max(0, t) * 12;
    if (res.crit) FX.spr('critSlash', hx, hy, { w: sz * 1.35, ang: U.rand(-0.15, 0.1), dx: 110, dy: -70, life: 0.3, s0: 0.8, s1: 1.25 });
    else if (combo) { this.flip = !this.flip; FX.spr('combo', hx, hy, { w: sz, flip: this.flip, dx: this.flip ? -90 : 90, dy: -55, life: 0.25 }); }
    else FX.spr('slash', hx, hy, { w: sz, ang: U.rand(-0.2, 0.15), dx: 95, dy: -60, life: 0.25 });
    FX.impact(hx, hy, res.crit, t >= 0 ? c : '#ffb070');   // 命中爆點＋火花
    if (t >= 1) FX.wave(this.swordTip().x, this.swordTip().y, hx, hy, c, 0.2);   // 靈器以上：劍氣飛向怪物
    this.hitCombo();
  },
  // 連擊數：1.4 秒內持續命中就累加，固定顯示在畫面右側
  hitCombo() {
    const now = performance.now(); this.combo = now - this.lastHit < 1400 ? this.combo + 1 : 1; this.lastHit = now;
    const el = $('#comboN'); if (!el) return;
    el.classList.toggle('hidden', this.combo < 2); el.querySelector('b').textContent = this.combo;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    clearTimeout(this.comboT); this.comboT = setTimeout(() => el.classList.add('hidden'), 1500);
  },

  tick(dt) {
    if (!this.on) return;
    const h = this.hero, m = this.mon;
    for (const k in this.cd) this.cd[k] = Math.max(0, this.cd[k] - dt);
    h.mp = Math.min(h.maxmp, h.mp + h.regen * dt);
    if (h.shieldT > 0) { h.shieldT -= dt; if (h.shieldT <= 0) h.shield = 0; }
    if (this.shieldOn && !(h.shield > 0)) this.shieldFx('off');
    if (h.yiT > 0) h.yiT -= dt;
    if (this.pause > 0) { this.pause -= dt; this.render(); return; }
    if (!m || m.hp <= 0) { this.render(); return; }
    // 自動施法
    if (S.d.auto) {
      const ready = (id) => { const k = SKILLS.find((x) => x.id === id); return S.skillOpen(k) && this.cd[id] <= 0 && h.mp >= k.mp; };
      if (ready('huti') && h.shield <= 0 && (h.hp < h.max * 0.55 || m.charge > 0)) this.cast('huti');
      else if (ready('wanjian')) this.cast('wanjian');
      else if (ready('jianyi')) this.cast('jianyi');
      else if (ready('yujian') && h.mp > 50) this.cast('yujian');
      else if (ready('leifa') && (m.charge > 0 || h.mp > h.maxmp * 0.6)) this.cast('leifa');
      else if (ready('jianqi') && h.mp > 40) this.cast('jianqi');
    }
    // 主角普攻
    h.t -= dt;
    if (h.t <= 0) {
      h.t = h.interval;
      // 普攻：切到起手式出劍，再收回持劍
      this.attackAnim();
      Audio2.play(U.pick(['swing1', 'swing2']));
      setTimeout(() => this.swing(1), 190);   // 前衝到底時出劍
      if (S.wFx('combo') && U.chance(0.3)) setTimeout(() => { this.attackAnim(0.75); this.swing(0.6, '連擊'); }, 420);
    }
    // 首領換相
    if (m.boss) {
      const P = m.M.phases, r = m.hp / m.max;
      let np = 1; P.forEach((p, i) => { if (i && r < p.at) np = i + 1; });
      if (np > m.phase) {
        m.phase = np; const ph = (m.ph = P[np - 1]);
        Audio2.play('roar'); FX.shake($('#scene'), 14); FX.ring(this.monPos().x, this.monPos().y, '#ff3a3a', 30, 300, 0.7, 6);
        UI.banner(ph.banner[0], ph.banner[1]);
        $('#mName').innerHTML = `${m.M.name}<em>${ph.name}</em>`;
        if (ph.atk) m.atk = Math.round(m.atk * ph.atk);
        if (ph.spd) m.interval /= ph.spd;
        m.dr = ph.dr || 0; m.leech = ph.leech || 0;
        // 妖物護罩：出現時地面波紋，消失時碎成紅色六角光片
        const wasW = $('#mon').classList.contains('warded'), mp = this.monPos(), mr = $('#mon').getBoundingClientRect();
        if (m.dr > 0 && !wasW) FX.ripple(mp.x, mp.y + mr.height * 0.4, mr.width * 1.4, 0.3, 0.7);
        if (!(m.dr > 0) && wasW) FX.hexBurst(mp.x, mp.y, mr.width * 0.5, mr.height * 0.5, '#ff6a5a', 'rgba(120,10,20,.25)');
        $('#mon').classList.toggle('warded', m.dr > 0); $('#mon').classList.toggle('enrage', np === P.length);
        m.chargeCd = Math.min(m.chargeCd, 2);
      }
    }
    // 妖物攻擊與蓄力大招
    if (m.stun > 0) { m.stun -= dt; this.render(); return; }
    if (m.charge > 0) {
      m.charge -= dt;
      if (m.charge <= 0) { const p = this.monPos(), hp = this.heroPos(), dark = m.type === 'tianmo';   // 九幽天魔：紫黑血刃斬
        if (dark) FX.voidSlash(hp.x, hp.y - 80, 140, -0.3); else FX.slash(hp.x, hp.y - 80, 140, -0.3, '#ff4a4a', 0.35); FX.ring(p.x, p.y, dark ? '#9b4dff' : '#ff4a4a', 30, 220, 0.4, 5); this.hurtHero(m.atk * (m.ph ? m.ph.chargeMult : 2.4), m.boss ? '血刃斬' : '重擊', m); m.chargeCd = m.ph ? m.ph.chargeCd : 9; }
    } else if (m.elite || m.boss) {
      m.chargeCd -= dt;
      if (m.chargeCd <= 0) { m.chargeMax = m.charge = m.ph ? m.ph.chargeT : 2.8; Audio2.play('array'); }
    }
    if (m.charge <= 0) {
      m.t -= dt;
      if (m.t <= 0) {
        m.t = m.interval;
        const mon = $('#mon'); mon.animate([{ transform: 'translateX(-50%) translateY(0)' }, { transform: 'translateX(-50%) translateY(10%) scale(1.05)' }, { transform: 'translateX(-50%) translateY(0)' }], { duration: 260 });
        setTimeout(() => this.on && this.mon === m && m.hp > 0 && this.hurtHero(m.atk, null, m), 140);
      }
    }
    this.render();
  },

  render() {
    if (!this.on || !$('#hBarB')) return;
    const h = this.hero, m = this.mon;
    $('#hBarB').style.width = (100 * h.hp / h.max) + '%'; $('#hTxtB').textContent = `${U.fmt(h.hp)} / ${U.fmt(h.max)}${h.shield > 0 ? `　靈罩 ${U.fmt(h.shield)}` : ''}`;
    $('#pBarB').style.width = (100 * h.mp / h.maxmp) + '%'; $('#pTxtB').textContent = `${Math.floor(h.mp)} / ${h.maxmp}`;
    if (m) {
      $('#mBar').style.width = (100 * Math.max(0, m.hp) / m.max) + '%'; $('#mTxt').textContent = `${U.fmt(Math.max(0, m.hp))} / ${U.fmt(m.max)}`;
      $('#mCharge').innerHTML = m.charge > 0 ? `<div class="charge"><i style="width:${100 * (1 - m.charge / m.chargeMax)}%"></i></div><div class="charge-tip">${m.boss ? `${m.M.name.split('・')[0]}蓄力「血刃斬」——快開護體或以雷法打斷` : '蓄力重擊——護體或雷法可化解'}</div>` : '';
    }
    $('#heroB').classList.toggle('yi', h.yiT > 0);
    for (const k of SKILLS) {
      const b = document.querySelector(`.skill[data-k="${k.id}"]`); if (!b) continue;
      const open = S.skillOpen(k), cd = this.cd[k.id];
      b.classList.toggle('locked', !open); b.classList.toggle('nomp', open && h.mp < k.mp);
      b.classList.toggle('ready', open && cd <= 0 && h.mp >= k.mp);
      b.querySelector('.cd').style.setProperty('--p', (open ? (360 * cd) / k.cd : 0) + 'deg');
      b.querySelector('.cdt').textContent = open && cd > 0 ? Math.ceil(cd) : '';
    }
  },

  end(win, fled) {
    if (!this.on) return;
    this.on = false; FX.ambient = 'qi';
    const R = this.R, key = `${R.id}-${this.idx}`, first = win && !S.d.cleared[key];
    if (fled) { UI.toast('暫且撤退，回到歷練地圖'); UI.go('map'); return; }
    if (!win) {
      S.addExp(this.loot.exp * 0.3); S.save();
      UI.modal('敗退', `<p class="big">道行尚淺，暫避鋒芒</p><p class="note" style="text-align:center">回洞府修煉、煉丹、精進功法與法寶後再來。<br>本次保留三成修為 +${U.fmt(this.loot.exp * 0.3)}</p>
        <div class="row center"><button class="seal" id="eHome">回洞府</button><button class="seal ghost sm" id="eAgain">再戰</button></div>`,
        { '#eHome': () => { UI.close(); UI.go('home'); }, '#eAgain': () => { UI.close(); this.start(R.id, this.idx); } });
      return;
    }
    // 結算
    S.addExp(this.loot.exp); S.add('stone', this.loot.stone);
    Dao.onExplore();   // 道侶同行（在線）時親密度提升
    const got = [];
    for (const [id, pr, a, b] of DROPS[R.id]) if (U.chance(pr * (first ? 1.5 : 1))) { const n = U.randi(a, b); S.add(id, n); got.push(`${ico(id)}<span>${ITEMS[id].name} ×${n}</span>`); }
    // 秘境妖將掉落兵器
    if (!R.test && this.st.waves.some((w) => MONSTERS[w.replace('*', '')].boss)) {
      const wid = first && !S.d.weapons[BOSS_WEAPON.first] ? BOSS_WEAPON.first : U.chance(BOSS_WEAPON.rareP) ? BOSS_WEAPON.rare : null;
      if (wid) {
        const w = WEAPONS.find((x) => x.id === wid), note = S.gainWeapon(wid), sub = S.subNotice(wid);
        got.push(`<i class="ico img item" data-ball="兵" style="--c:${WTIERS[w.tier].color}"><img class="item-ico" src="${W_IMG(w.id)}" alt=""></i><span style="color:${WTIERS[w.tier].color}">${note || `${w.name}（兵器）`}${sub ? '<small class="subnote">已放入副手，可到法寶頁與主手互換</small>' : ''}</span>`);
        if (sub) setTimeout(() => UI.toast(sub, WTIERS[w.tier].color), 400);
      }
    }
    S.d.cleared[key] = (S.d.cleared[key] || 0) + 1;
    const lastStage = this.idx === R.stages.length - 1;
    S.save();
    Audio2.play('up');
    UI.modal(first ? '初勝' : '得勝', `<p class="big">${this.st.name}</p>
      <div class="list loot-list"><div class="li">${ico('exp')}<div><h4>修為 +${U.fmt(this.loot.exp)}</h4></div><span></span></div>
      <div class="li">${ico('stone')}<div><h4>靈石 +${U.fmt(this.loot.stone)}</h4></div><span></span></div>
      ${got.map((g) => `<div class="li">${g.split('</i>')[0]}</i><div><h4>${g.split('</i>')[1]}</h4></div><span></span></div>`).join('')}</div>
      <div class="row center"><button class="seal" id="wNext">${lastStage ? '返回' : '下一關'}</button><button class="seal ghost sm" id="wHome">洞府</button></div>`,
      {
        '#wNext': () => { UI.close(); if (!Story.afterClear(R.id, this.idx, first)) { if (lastStage) UI.stages(R.id); else this.start(R.id, this.idx + 1, true); } },
        '#wHome': () => { UI.close(); if (!Story.afterClear(R.id, this.idx, first)) UI.go('home'); },
      });
  },
};
