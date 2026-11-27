'use strict';
// ════════════════════════════════════════════
//  轉珠關卡制：章節地圖、體力、星級、獎勵、掃蕩、存檔
//  數值全在 js/stage-cfg.js；戰鬥本身在 js/puzzle.js
//  存檔欄位 S.d.pz（舊存檔沒有這欄，載入時自動補上，不動其他資料）：
//    sta 目前體力、staAt 上次結算回復的時間（毫秒）
//    st  { 關卡 id: { s 星星位元（1、2、4）, c 通關次數 } }
//    sw  { date 日期, n: { 關卡 id: 今日掃蕩次數 } }
//    tut 新手教學已看過（1）
//    ovf 溢出修為：修為已滿時轉珠獎勵的修為先存這裡，突破成功時補入
//    daily { last 上次簽到的台北日序（1970-01-01＝0，沒簽過＝-1）, streak 連續天數, total 累計天數 }（js/daily-cfg.js）
// ════════════════════════════════════════════

const PZ_STAGES = PZ_CHAPTERS.flatMap((C) => C.stages.map((s, i) => ({ ...s, ch: C, idx: i, stars: s.stars || STAR_DEFAULT })));
const stageById = (id) => PZ_STAGES.find((s) => s.id === id);

const Stage = {
  // ───────── 存檔 ─────────
  fresh() { return { v: 1, sta: STA_CFG.start, staAt: Date.now(), st: {}, sw: { date: '', n: {} }, ovf: 0, tut: 0, daily: { last: -1, streak: 0, total: 0 } }; },
  // 補欄位、修正異常值；舊存檔（沒有 pz）＝新的一份
  fix(d) {
    const f = this.fresh(), p = d.pz && typeof d.pz === 'object' && !Array.isArray(d.pz) ? d.pz : {};
    const num = (v, def) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : def);
    const g = { v: 1, sta: num(p.sta, f.sta), staAt: num(p.staAt, f.staAt), st: {}, sw: { date: '', n: {} }, ovf: Math.max(0, Math.round(num(p.ovf, 0))), tut: p.tut ? 1 : 0 };
    g.sta = U.clamp(Math.floor(g.sta), 0, 9999);
    d.settings = d.settings && typeof d.settings === 'object' ? d.settings : {};
    if (typeof d.settings.skConfirm !== 'boolean') d.settings.skConfirm = true;   // 技能施放前確認（舊存檔補預設：開）
    const dl = p.daily && typeof p.daily === 'object' ? p.daily : {}, int = (v, def, lo) => Math.max(lo, Math.floor(num(v, def)));
    g.daily = { last: int(dl.last, -1, -1), streak: int(dl.streak, 0, 0), total: int(dl.total, 0, 0) };
    if (g.staAt > Date.now() || g.staAt < 0) g.staAt = Date.now();   // 時間被調過：從現在重算
    if (p.st && typeof p.st === 'object') for (const [k, v] of Object.entries(p.st)) {
      if (!v || typeof v !== 'object') continue;
      g.st[k] = { s: num(v.s, 0) & 7, c: Math.max(0, Math.floor(num(v.c, 0))) };
    }
    if (p.sw && typeof p.sw === 'object' && typeof p.sw.date === 'string') {
      g.sw.date = p.sw.date;
      if (p.sw.n && typeof p.sw.n === 'object') for (const [k, v] of Object.entries(p.sw.n)) g.sw.n[k] = Math.max(0, Math.floor(num(v, 0)));
    }
    d.pz = g;
  },
  get d() { return S.d.pz; },

  // ───────── 體力 ─────────
  // 依經過時間回復（只回到上限）；回傳目前體力
  sta() {
    const g = this.d, now = Date.now(), ms = STA_CFG.regenMin * 60000;
    if (g.staAt > now) g.staAt = now;
    if (g.sta >= STA_CFG.max) { g.staAt = now; return g.sta; }
    const n = Math.floor((now - g.staAt) / ms);
    if (n > 0) { g.sta = Math.min(STA_CFG.max, g.sta + n); g.staAt = g.sta >= STA_CFG.max ? now : g.staAt + n * ms; }
    return g.sta;
  },
  // 下一點回復還要幾毫秒（滿了回 0）
  staNext() { const s = this.sta(); return s >= STA_CFG.max ? 0 : Math.max(0, this.d.staAt + STA_CFG.regenMin * 60000 - Date.now()); },
  // 回復到 n 點要多久（毫秒）
  staWait(n) { const s = this.sta(); if (s >= n) return 0; return this.staNext() + (n - s - 1) * STA_CFG.regenMin * 60000; },
  spend(n) {
    const before = this.sta(); if (before < n) return false;
    this.d.sta = before - n;
    if (before >= STA_CFG.max) this.d.staAt = Date.now();   // 從滿的狀態扣：從現在開始計時
    S.save(); return true;
  },
  // 戰敗退還（stage-cfg 的 loseRefund）：回傳實際退了幾點
  refund(st) {
    const n = Math.floor(st.cost * (st.loseRefund || 0)); if (n <= 0) return 0;
    const before = this.sta(), after = Math.min(STA_CFG.max, before + n);
    this.d.sta = after; if (after >= STA_CFG.max) this.d.staAt = Date.now(); S.save(); return after - before;
  },
  refill() { this.d.sta = Math.max(this.sta(), STA_CFG.max); this.d.staAt = Date.now(); S.save(); },

  // ───────── 關卡狀態 ─────────
  rec(id) { return this.d.st[id] || { s: 0, c: 0 }; },
  stars(id) { const s = this.rec(id).s; return (s & 1) + ((s >> 1) & 1) + ((s >> 2) & 1); },
  cleared(id) { return this.rec(id).c > 0; },
  // 第一關永遠開放；之後要前一關通關過
  open(st) { const i = PZ_STAGES.indexOf(st); return i <= 0 || this.cleared(PZ_STAGES[i - 1].id); },
  state(st) { return !this.open(st) ? 'lock' : this.cleared(st.id) ? 'clear' : 'open'; },
  starText(c) {
    return { clear: '通關', turns: `${c.n} 回合內通關`, combo: `單回合 ${c.n} Combo 以上`, hp: `通關時氣血 ${Math.round(c.n * 100)}% 以上` }[c.t] || c.t;
  },
  starOk(c, r) {
    return c.t === 'clear' ? true : c.t === 'turns' ? r.turns <= c.n : c.t === 'combo' ? r.maxCombo >= c.n : c.t === 'hp' ? r.hpRatio >= c.n : false;
  },

  // ───────── 獎勵：直接進現有資源（靈石＝inv.stone、修為＝S.addExp、物品＝inv）─────────
  expOf(sec) { return Math.round(S.rate() * sec); },
  give(rw) {
    const out = { stone: 0, exp: 0, items: {} };
    if (rw.stone) { S.add('stone', rw.stone); out.stone += rw.stone; }
    if (rw.expSec) { const n = this.expOf(rw.expSec), b = S.d.exp; S.addExp(n); const got = Math.round(S.d.exp - b), lost = n - got; out.exp += got; if (lost >= 1) { out.ovf = (out.ovf || 0) + lost; this.d.ovf += lost; } }   // 整數加減；差不到 1 不算溢出
    for (const [k, n] of Object.entries(rw.items || {})) { S.add(k, n); out.items[k] = (out.items[k] || 0) + n; }
    return out;
  },
  merge(a, b) { const o = { stone: a.stone + b.stone, exp: a.exp + b.exp, items: { ...a.items }, ovf: (a.ovf || 0) + (b.ovf || 0) }; for (const [k, n] of Object.entries(b.items)) o.items[k] = (o.items[k] || 0) + n; return o; },
  rwText(o) {
    const p = [];
    const ic = (id) => `<span class="pz-rw">${gIco('item', id)}`;   // 獎勵列：靈石、修為、道具前面放物品圖示
    if (o.stone) p.push(`${ic('stone')}靈石 ${U.fmt(o.stone)}</span>`);
    if (o.exp) p.push(`${ic('exp')}修為 ${U.fmt(o.exp)}</span>`);
    for (const [k, n] of Object.entries(o.items || {})) p.push(`${ic(k)}${(ITEMS[k] && ITEMS[k].name) || k} ×${n}</span>`);
    return p.join('、<wbr>') || '無';   // <wbr>：每項是不換行的圖示＋文字，Safari 不會在「、」後自己斷行（章節獎勵合計會連成一條撐破面板）
  },
  ovfText(n) { return `修為已滿，溢出 +${U.fmt(n)}，突破後補入<span class="nw">（共 ${U.fmt(this.d.ovf)}）</span><br><b class="pz-ovf-tip">先到地圖右上『突破』提升境界，再挑戰後面的關卡</b>`; },
  // 預覽用（還沒發）：修為以目前速度估
  rwPreview(rw) { return this.rwText({ stone: rw.stone || 0, exp: rw.expSec ? this.expOf(rw.expSec) : 0, items: rw.items }); },

  // ───────── 通關、失敗（由 Puzzle 呼叫）─────────
  // r：{ turns, maxCombo, hpRatio }
  onWin(id, r) {
    const st = stageById(id), rec = (this.d.st[id] = this.rec(id)), firstClear = rec.c === 0;
    const before = rec.s; let got = 0;
    st.stars.forEach((c, i) => { if (this.starOk(c, r)) got |= 1 << i; });
    rec.s |= got; rec.c++;
    let rw = this.give(st);
    let first = null; if (firstClear && st.first) { first = this.give(st.first); rw = this.merge(rw, first); }
    S.save(); if (typeof UI !== 'undefined' && S.d.root) UI.hud && UI.hud();
    return { got, newStars: rec.s & ~before, all: rec.s, firstClear, first, rw };
  },

  // ───────── 掃蕩 ─────────
  swToday() { const t = U.today(); if (this.d.sw.date !== t) this.d.sw = { date: t, n: {} }; return this.d.sw; },
  swLeft(id) { const lim = SWEEP_CFG.dailyPerStage; return lim ? Math.max(0, lim - (this.swToday().n[id] || 0)) : Infinity; },
  swCost(st) { return Math.ceil(st.cost * SWEEP_CFG.costMult); },
  canSweep(st) { return this.stars(st.id) >= SWEEP_CFG.needStars; },
  // 回傳 { ok, n, rw } 或 { ok:false, why }
  sweep(id, times) {
    const st = stageById(id);
    if (!this.canSweep(st)) return { ok: false, why: `${SWEEP_CFG.needStars} 星通關後才能掃蕩` };
    const left = this.swLeft(id); if (left <= 0) return { ok: false, why: '今日掃蕩次數已用完' };
    const cost = this.swCost(st), n = Math.min(times, left, Math.floor(this.sta() / cost));
    if (n <= 0) return { ok: false, why: 'sta', need: cost };
    this.spend(cost * n);
    let rw = { stone: 0, exp: 0, items: {} };
    for (let i = 0; i < n; i++) rw = this.merge(rw, this.give(st));
    this.swToday().n[id] = (this.swToday().n[id] || 0) + n;
    (this.d.st[id] = this.rec(id)).c += n;
    S.save();
    return { ok: true, n, rw, cost: cost * n };
  },

  // ───────── 進場 ─────────
  play(id) {
    const st = stageById(id);
    if (!st || !this.open(st)) { this.toast('尚未開放'); return false; }
    if (!this.spend(st.cost)) { this.noSta(st.cost); return false; }
    this.hideMap();
    Puzzle.open({ stage: st });
    return true;
  },

  // ───────── 每日簽到（數值在 js/daily-cfg.js） ─────────
  // 台北日期的日序：用整數比字串好算連續與斷簽
  dayNo(now = Date.now()) { return Math.floor((now + DAILY_CFG.tzOffsetH * 36e5) / 864e5); },
  // can 今天可領；day 今天（或今天已領）是這輪第幾天；back 手機日期早於上次簽到（時間被調回去）
  dailyInfo() {
    const g = this.d.daily, t = this.dayNo(), C = DAILY_CFG.cycle;
    if (t <= g.last) return { can: false, back: t < g.last, day: ((Math.max(1, g.streak) - 1) % C) + 1, streak: g.streak };
    const streak = t === g.last + 1 ? g.streak + 1 : 1;   // 斷簽（隔超過一天）從第 1 天重算
    return { can: true, day: ((streak - 1) % C) + 1, streak };
  },
  dailyClaim() {
    const i = this.dailyInfo(); if (!i.can) return null;
    const g = this.d.daily, rw = { ticket: DAILY_CFG.ticket, stone: i.day === DAILY_CFG.cycle ? DAILY_CFG.bonus.stone : 0 };
    Object.assign(g, { last: this.dayNo(), streak: i.streak, total: g.total + 1 });
    Gacha.d.ticket += rw.ticket; if (rw.stone) S.add('stone', rw.stone);
    S.save(); return { ...i, ...rw };
  },
  dailyPanel() {
    const i = this.dailyInfo(), C = DAILY_CFG.cycle, B = DAILY_CFG.bonus.stone;
    const days = [...Array(C)].map((_, k) => { const d = k + 1, got = d < i.day || (d === i.day && !i.can);
      return `<li class="${got ? 'got' : d === i.day ? 'now' : ''}"><small>第 ${d} 天</small><b>券 ×${DAILY_CFG.ticket}</b>${d === C ? `<b class="pzd-bonus">靈石 ${B}</b>` : ''}${got ? '<i>已領</i>' : ''}</li>`; }).join('');
    const note = i.back ? '手機日期早於上次簽到，請確認時間設定' : i.can ? `今天是連續第 ${i.streak} 天` : `已連續簽到 ${i.streak} 天，明天再來`;
    this.panel(`<h3>每日簽到</h3><ol class="pzd-days">${days}</ol><p class="c">${note}</p><p class="c note">每天送仙緣券 ${DAILY_CFG.ticket} 張；連續第 ${C} 天加送靈石 ${B}；斷簽從第 1 天重算（台北時間換日）</p>`,
      i.can ? [['領取', () => { const r = this.dailyClaim(); if (!r) return this.closePanel(); this.toast(`仙緣券 +${r.ticket}${r.stone ? `、靈石 +${r.stone}` : ''}`); this.renderMap(); this.dailyPanel(); }], ['稍後', () => this.closePanel()]]
        : [['知道了', () => this.closePanel()]]);
  },

  // ════════ 章節地圖 ════════
  mapOn: false,
  showMap(ch = 1) {
    this.ch = PZ_CHAPTERS.find((c) => c.id === ch) || PZ_CHAPTERS[0];
    let el = document.getElementById('pzMap');
    if (!el) { el = document.createElement('div'); el.id = 'pzMap'; document.body.appendChild(el); }
    this.el = el; el.classList.remove('hidden'); this.mapOn = true;
    document.body.classList.add('pz-on');
    if (typeof Audio2 !== 'undefined') Audio2.setMood(Audio2.mood);
    this.renderMap(); this.preloadPz();
    clearInterval(this._ti); this._ti = setInterval(() => this.mapOn && this.staHud(), 1000);
  },
  // 地圖上的「突破」：開現有的突破面板。突破演出在洞府場景播，地圖先讓開，演出結束或按「稍後」就自動回到地圖
  breakEntry() {
    if (!S.full()) { this.toast(`修為未滿（${U.fmt(S.d.exp)} / ${U.fmt(S.need())}），滿了才能突破`); return; }
    if (S.d.lv >= MAX_LV) { this.toast('已臻此界之巔'); return; }
    const ch = this.ch.id, back = () => { if (!this.mapOn && !Puzzle.on) this.showMap(ch); };
    this.closeMap(); if (UI.go) UI.go('home'); UI.breakModal();
    const s0 = Story.breakShow; let started = false;
    Story.breakShow = (u) => { started = true; Story.breakShow = s0; return s0.call(Story, u).finally(back); };
    const t = setInterval(() => { if (started) return clearInterval(t); if ($('#modal').classList.contains('hidden')) { clearInterval(t); Story.breakShow = s0; back(); } }, 300);
  },
  // 轉珠素材：第一次進轉珠地圖才在背景下載（音檔交給 Audio2 自己載）；之後由離線快取提供
  preloadPz() {
    if (typeof Audio2 !== 'undefined') Audio2.loadLazy();   // 抽卡音效
    if (this._pre || typeof PZ_ASSET === 'undefined') return; this._pre = true;
    ASSET_LIST.filter((s) => PZ_ASSET.test(s) && !s.endsWith('.mp3')).forEach((s, i) => setTimeout(() => { const im = new Image(); im.src = s; }, i * 60));
  },
  hideMap() { this.mapOn = false; clearInterval(this._ti); if (this.el) this.el.classList.add('hidden'); },
  closeMap() {
    this.hideMap(); document.body.classList.remove('pz-on');
    if (typeof FX !== 'undefined') requestAnimationFrame(() => FX.resize());
    if (typeof UI !== 'undefined' && UI.tab === 'map' && !$('#app').classList.contains('title-mode')) UI.map();
  },
  renderMap() {
    const C = this.ch, list = C.stages.map((s) => stageById(s.id));
    // 直式捲動地圖：第一關在最下面，往上走；節點左右錯開
    const nodes = list.map((st, i) => {
      const state = this.state(st), n = this.stars(st.id), boss = !!st.big;
      const x = [50, 74, 62, 32, 24, 46, 72, 70, 40, 50][i % 10];
      return `<button class="pzm-node ${state}${boss ? ' boss' : ''}" data-st="${st.id}" style="--x:${x}%">
        <b>${state === 'lock' ? '<i class="pzm-lock">鎖</i>' : st.id.split('-')[1]}</b><span class="pzm-stars">${[0, 1, 2].map((k) => `<i class="${k < n ? 'on' : ''}">★</i>`).join('')}</span>
        <small>${st.name}</small></button>`;
    }).reverse();
    const total = list.reduce((a, st) => a + this.stars(st.id), 0);
    this.el.innerHTML = `<div class="pzm-top"><button class="pz-btn" id="pzmBack" aria-label="返回">返</button>
        <div class="pzm-title"><b>${C.name.split('・').map((t) => `<span>${t}</span>`).join('<i>・</i>')}</b><small>★ ${total} / ${list.length * 3}</small></div>
        ${S.d.root ? `<button class="pz-btn pzm-break${S.full() ? ' ready' : ''}" id="pzmBreak">突破${this.d.ovf >= 1 ? `<small>溢 ${U.fmt(this.d.ovf)}</small>` : ''}</button>` : ''}
        <div class="pzm-sta" id="pzmSta"></div></div>
      <div class="pzm-scroll" id="pzmScroll" style="background-image:${C.id === 1 && pzHas('ch1_bg') ? 'linear-gradient(rgba(8,10,14,.15),rgba(8,10,14,.3)),url(assets/map/ch1_bg.webp)' : `linear-gradient(rgba(8,10,14,.55),rgba(8,10,14,.75)),url(${C.bg[0]})`}"><div class="pzm-path">${nodes.join('')}</div></div>
      ${DEV && STA_CFG.devRefill ? '<button class="pzm-dev" id="pzmDev">補滿體力（測試）</button>' : ''}
      ${typeof Gacha !== 'undefined' && PzStory.gachaOpen() ? '<button class="pzm-gacha" id="pzmGacha" aria-label="抽卡"><i></i><b>抽卡</b></button>' : ''}
      ${typeof Gacha !== 'undefined' ? `<button class="pzm-gacha pzm-daily${this.dailyInfo().can ? ' dot' : ''}" id="pzmDaily" aria-label="每日簽到">${gIco('ui', 'icon_sign_entry')}<b>簽到</b></button>` : ''}
      <div class="pz-rotate"><b>請將手機轉為直式</b><small>轉珠關卡只支援直式畫面</small></div>
      <div class="pz-toast" id="pzmToast"></div><div class="pz-end hidden" id="pzmPanel"></div>`;
    this.el.querySelector('#pzmBack').onclick = () => this.closeMap();
    const bk = this.el.querySelector('#pzmBreak'); if (bk) bk.onclick = () => this.breakEntry();
    const ga = this.el.querySelector('#pzmGacha'); if (ga) ga.onclick = () => Gacha.open();
    const dy = this.el.querySelector('#pzmDaily'); if (dy) dy.onclick = () => this.dailyPanel();
    const dev = this.el.querySelector('#pzmDev'); if (dev) dev.onclick = () => { this.refill(); this.staHud(); this.toast('體力已補滿'); };
    this.el.querySelectorAll('.pzm-node').forEach((b) => (b.onclick = () => this.detail(b.dataset.st)));
    this.staHud();
    // 捲到目前要打的關卡
    const cur = this.el.querySelector('.pzm-node.open') || this.el.querySelector('.pzm-node.clear');
    if (cur) requestAnimationFrame(() => cur.scrollIntoView({ block: 'center' }));
  },
  staHud() {
    const el = this.el && this.el.querySelector('#pzmSta'); if (!el) return;
    const s = this.sta(), nx = this.staNext();
    el.innerHTML = `<b><i class="pzm-staico"></i>體力 ${s} / ${STA_CFG.max}</b><small>${nx ? `${this.mmss(nx)}後 +1` : '已滿'}</small>`;
  },
  // 倒數文字：「4 分 48 秒」「1 小時 5 分」（不用 4:48 這種寫法，會被看成時鐘時間）
  mmss(ms) { const t = Math.ceil(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return h ? `${h} 小時 ${m} 分` : m ? `${m} 分 ${s} 秒` : `${s} 秒`; },
  // 大約多久：「約 20 分鐘」「約 1 小時 5 分鐘」
  about(ms) { const m = Math.ceil(ms / 60000), h = Math.floor(m / 60); return h ? `${h} 小時${m % 60 ? ` ${m % 60} 分鐘` : ''}` : `${m} 分鐘`; },
  toast(msg) {
    const t = this.el && this.el.querySelector('#pzmToast'); if (!t) return;
    t.textContent = msg; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), 2400);
  },
  panel(html, btns) {
    const el = this.el.querySelector('#pzmPanel');
    el.innerHTML = `<div class="pz-panel"><div class="pz-pbody">${html}</div><div class="pz-row wrap">${btns.map((b, i) => `<button class="pz-btn wide${b[2] ? ' ' + b[2] : ''}" data-b="${i}"${b[3] ? ' disabled' : ''}>${b[0]}</button>`).join('')}</div></div>`;
    el.classList.remove('hidden');
    el.querySelectorAll('[data-b]').forEach((b) => (b.onclick = () => btns[+b.dataset.b][1]()));
    el.onclick = (e) => { if (e.target === el) this.closePanel(); };
  },
  closePanel() { const el = this.el && this.el.querySelector('#pzmPanel'); if (el) el.classList.add('hidden'); },
  noSta(need) {
    const s = this.sta(), w = this.staWait(need), html = `<h3>體力不足</h3><p class="c">需要 ${need} 點，目前 ${s} 點</p><p class="c note">每 ${STA_CFG.regenMin} 分鐘回復 1 點，約 ${this.about(w)}後足夠</p>`;
    if (this.mapOn) this.panel(html, [['知道了', () => this.closePanel()]]);
    return html;
  },
  // 關卡說明：波次、星級條件、獎勵、出戰、掃蕩
  detail(id) {
    const st = stageById(id), state = this.state(st);
    if (state === 'lock') { this.toast('先通關前一關才能挑戰'); return; }
    if (typeof Audio2 !== 'undefined') { Audio2.play('stage_select'); if (st.bgm && Audio2.tracks[st.bgm]) Audio2.loadTrack(st.bgm); }   // 選關音效；首領曲延後下載：看到首領關詳情才載
    const rec = this.rec(id), mons = st.waves.map((w, i) => `<li><em>${i === st.waves.length - 1 ? '首領' : `第 ${i + 1} 波`}</em>${w.map((m) => { const M = PZ_MONS[m]; return `<span style="--c:${PZ_EL[M.el].c}">${pzElI(M.el, 'pz-el')}${M.name}</span>`; }).join('')}</li>`).join('');
    const stars = st.stars.map((c, i) => `<li class="${rec.s & (1 << i) ? 'on' : ''}"><i>★</i>${this.starText(c)}</li>`).join('');
    const can = this.canSweep(st), left = this.swLeft(id), cost = this.swCost(st), B = SWEEP_CFG.batch;
    const html = `<h3>${st.id}　${st.name}</h3>
      <ul class="pzm-waves">${mons}</ul>
      <ul class="pzm-starlist">${stars}</ul>
      ${st.tip ? `<p class="c pzm-tip">${st.tip}</p>` : ''}
      ${typeof Roster !== 'undefined' ? Roster.summary() : ''}
      <p class="pzm-rw"><b>獎勵</b>${this.rwPreview(st)}</p>
      ${st.first ? `<p class="pzm-rw${rec.c ? ' done' : ''}"><b>${rec.c ? '首通・已領' : '首通'}</b>${this.rwPreview(st.first)}</p>` : ''}
      <p class="c note">進場體力 ${st.cost}・${st.loseRefund ? `失敗退 ${Math.floor(st.cost * st.loseRefund)}` : '失敗不退'}・目前 ${this.sta()} / ${STA_CFG.max}${can ? `<br>掃蕩每次 ${cost} 體力${left === Infinity ? '' : `・今日剩 ${left} 次`}` : `<br>${SWEEP_CFG.needStars} 星通關後可掃蕩`}</p>`;
    const btns = [[`出戰（${st.cost}）`, () => { this.closePanel(); this.play(id); }, 'go']];
    if (typeof Roster !== 'undefined') btns.push(['編隊', () => Roster.editor(() => this.detail(id))]);
    if (can) {
      btns.push([`掃蕩 ×1`, () => this.doSweep(id, 1), '', left <= 0]);
      btns.push([`掃蕩 ×${B}`, () => this.doSweep(id, B), '', left <= 0]);
    }
    btns.push(['關閉', () => this.closePanel()]);
    this.panel(html, btns);
  },
  doSweep(id, n) {
    const r = this.sweep(id, n);
    if (!r.ok) { if (r.why === 'sta') this.noSta(r.need); else this.toast(r.why); return; }
    if (typeof Audio2 !== 'undefined') Audio2.play('pickup');
    this.panel(`<h3>掃蕩完成</h3><p class="c">${stageById(id).name} ×${r.n}${r.n < n ? `（體力或次數只夠 ${r.n} 次）` : ''}</p><p class="c">${this.rwText(r.rw)}${r.rw.ovf ? `<br><small class="note">${this.ovfText(r.rw.ovf)}</small>` : ''}</p><p class="c note">消耗體力 ${r.cost}・剩 ${this.sta()}</p>`,
      [['繼續', () => this.detail(id)], ['關閉', () => this.closePanel()]]);
    this.staHud();
  },
  // 戰鬥結束回到地圖；next＝直接開下一關說明
  back(next) {
    this.showMap(this.ch ? this.ch.id : 1);
    if (next) { const i = PZ_STAGES.findIndex((s) => s.id === next); if (i >= 0 && i + 1 < PZ_STAGES.length && this.open(PZ_STAGES[i + 1])) this.detail(PZ_STAGES[i + 1].id); }
  },
};

// ════════ 突破成功：補入溢出修為（補到這層修為上限，多的繼續留著）════════
(() => {
  const bt0 = S.breakthrough.bind(S);
  S.breakthrough = (use, bonus) => {
    const r = bt0(use, bonus), g = S.d.pz;
    if (r && r.ok && g && g.ovf > 0) { const b = S.d.exp; S.addExp(g.ovf); const add = Math.round(S.d.exp - b); g.ovf = Math.max(0, Math.round(g.ovf - add)); r.ovfIn = add; S.save(); }   // 夾在 ≥0、取整：不再出現「溢 -1」
    return r;
  };
})();

// ════════ 接到存檔：新存檔、讀檔、匯入（含雲端套用）都會補上 pz 欄位 ════════
(() => {
  const fresh0 = S.fresh.bind(S), load0 = S.load.bind(S), imp0 = S.importText.bind(S);
  S.fresh = () => { const d = fresh0(); d.pz = Stage.fresh(); return d; };
  S.load = () => { const r = load0(); try { Stage.fix(S.d); } catch (e) { console.warn('[存檔] 關卡資料損毀，已重設', e); S.backupRaw(); S.d.pz = Stage.fresh(); } return r; };
  S.importText = (t) => { const r = imp0(t); if (r === true) { Stage.fix(S.d); S.save(); } return r; };
  // 轉珠地圖或戰鬥開著時切 App 回來：「出關」彈窗會被蓋在轉珠畫面底下（看不到，關掉轉珠後才冒出來，按收下又跳回洞府）
  // 收益照給，改用轉珠畫面自己的提示
  if (typeof UI !== 'undefined') {
    const om0 = UI.offlineModal.bind(UI);
    UI.offlineModal = (o) => {
      if (!document.body.classList.contains('pz-on')) return om0(o);
      const msg = `閉關 ${U.dur(o.sec)}：修為 +${U.fmt(o.gain)}、靈石 +${U.fmt(o.stone)}`;
      if (typeof Puzzle !== 'undefined' && Puzzle.on) Puzzle.toast(msg); else Stage.toast(msg);
    };
  }
})();
