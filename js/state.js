'use strict';
// ════════════════════════════════════════════
//  存檔與數值：修為、資源、屬性、離線累積、突破、煉丹、功法、兵器、任務
// ════════════════════════════════════════════

const SAVE_KEY = 'staging_wendao_idle_v1';

const S = {
  d: null,
  fresh() {
    return {
      ver: 2, created: Date.now(), last: Date.now(),
      lv: 0, exp: 0, root: null, grade: null,
      inv: { stone: 50, herb_q: 2, herb_c: 2, p_heal: 1 },
      arts: {}, weapons: {}, wslot: [null, null], fabao: {}, fslot: null, quests: {},
      bonus: { atk: 0, hp: 0 },
      cleared: {}, unlocked: { sect: false, village: false, wild: false, realm: false },
      daily: { date: U.today(), realm: 0, free: false, sign: false }, pityArtifact: 0, pityTechnique: 0,
      story: {}, auto: false, settings: { music: true, sfx: true },
      name: '', renameCount: 0, lastRenameAt: 0,
      rootRerolls: 0,   // 靈根已重測次數（上限 ROOT_REROLLS）   // 自訂名字（空字串＝用角色預設名）、更名次數、上次更名時間
    };
  },
  load() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) {}
    if (!raw) { this.d = this.fresh(); return false; }
    const fix = (p) => { this.d = Object.assign(this.fresh(), p); this.migrate(); this.fixSlots(); this.fixPity(); this.fixName(); if (this.d.root && !this.d.grade) this.d.grade = '黃'; };
    try { fix(JSON.parse(raw)); return true; }
    catch (e) {
      // 讀檔失敗：先備份原始資料，再把型別不對的欄位換回預設值重試；仍失敗才當成沒存檔
      console.warn('[存檔] 讀取失敗，原檔已備份到 ' + SAVE_KEY + '_backup', e);
      this.backupRaw(raw); this.loadError = true;
      try {
        const p = JSON.parse(raw), f = this.fresh();
        for (const k of Object.keys(f)) if (f[k] !== null && p[k] !== undefined && (p[k] === null || typeof p[k] !== typeof f[k] || Array.isArray(p[k]) !== Array.isArray(f[k]))) p[k] = f[k];
        fix(p); this.recovered = true; return true;
      } catch (e2) {}
      this.d = this.fresh(); return false;
    }
  },
  backupRaw(raw) { try { localStorage.setItem(SAVE_KEY + '_backup', raw || localStorage.getItem(SAVE_KEY)); } catch (e) {} },
  // v1 的隨機法寶改為兵器系統：舊法寶折成靈石
  migrate() {
    const d = this.d;
    if (d.ver >= 2) return;
    if (Array.isArray(d.bag) && d.bag.length) { d.inv.stone = (d.inv.stone || 0) + d.bag.reduce((a, it) => a + 60 * (it.tier + 1) * (1 + it.lv), 0); this.migrated = d.bag.length; }
    delete d.bag; delete d.equip; delete d.nextId; d.ver = 2;
  },
  // 佩戴欄只能放已擁有的兵器
  // 名字欄位：舊存檔補預設值；匯入或被改過的存檔若名字不合規則，退回角色預設名
  fixName() {
    const d = this.d;
    if (typeof d.name !== 'string' || (d.name && this.nameError(d.name))) d.name = '';
    if (!(d.renameCount >= 0)) d.renameCount = 0;
    if (!(d.lastRenameAt >= 0)) d.lastRenameAt = 0;
  },
  // 名字是否可用：可用回傳空字串，否則回傳原因
  nameError(n) {
    n = String(n || '');
    if (n.length < 2) return '名字至少 2 個字';
    if (n.length > 8) return '名字最多 8 個字';
    if (!NAME_RE.test(n)) return '名字只能用中文、英文、數字，不能有空白或符號';
    const low = n.toLowerCase();
    if (NAME_BANNED.some((w) => low.includes(w.toLowerCase()))) return '名字含有不能使用的字詞';
    return '';
  },
  renameCost() { return this.d.renameCount > 0 ? RENAME_COST : 0; },
  renameWait() { return this.d.renameCount > 0 ? Math.max(0, this.d.lastRenameAt + RENAME_CD - Date.now()) : 0; },
  // 更名前檢查：可以更名回傳空字串，否則回傳原因
  renameCheck(n) {
    const e = this.nameError(n); if (e) return e;
    if (n === HERO_NAME) return '和目前的名字相同';
    const w = this.renameWait(); if (w > 0) return `更名冷卻中，還要 ${Math.ceil(w / 3600000)} 小時`;
    if (!this.has('stone', this.renameCost())) return `靈石不足（需要 ${this.renameCost()}）`;
    return '';
  },
  fixSlots() { this.d.wslot = this.d.wslot.map((id) => (id && this.d.weapons[id] ? id : null)); if (!this.d.fabao || typeof this.d.fabao !== 'object') this.d.fabao = {}; if (this.d.fslot && !this.d.fabao[this.d.fslot]) this.d.fslot = null; },
  // 保底計數：兩池各自一個欄位。舊存檔的 gacha.{wpn,art} 搬過來；非數字或異常大數字一律修正到 0～89
  fixPity() {
    const d = this.d, old = d.gacha || {};
    const norm = (v) => { v = Math.floor(Number(v)); return Number.isFinite(v) ? U.clamp(v, 0, GACHA.pity - 1) : 0; };
    if (old.wpn !== undefined && !d.pityArtifact) d.pityArtifact = old.wpn;
    if (old.art !== undefined && !d.pityTechnique) d.pityTechnique = old.art;
    delete d.gacha;
    d.pityArtifact = norm(d.pityArtifact); d.pityTechnique = norm(d.pityTechnique);
  },
  save() { if (!this.d) return; this.d.last = Date.now(); try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.d)); } catch (e) {} },
  // 匯入存檔：驗證格式後覆蓋；成功回傳 true，失敗回傳原因
  importText(text) {
    let d;
    try { d = JSON.parse(text); } catch (e) { return '存檔格式不正確，無法讀取'; }
    if (!d || typeof d !== 'object' || typeof d.lv !== 'number' || !d.inv || typeof d.inv !== 'object' || !d.root) return '這不是《問道青冥》的存檔';
    const keep = this.d; this.d = Object.assign(this.fresh(), d); this.migrate(); this.fixSlots(); this.fixPity(); this.fixName();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.d)); } catch (e) { this.d = keep; return '瀏覽器無法寫入存檔'; }
    return true;
  },
  reset() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} },

  // ───────── 屬性 ─────────
  artLv(id) { return this.d.arts[id] || 0; },
  // 裝備通用：id 可能是兵器或法寶
  gDef(id) { return WEAPONS.find((x) => x.id === id) || FABAO.find((x) => x.id === id); },
  gOwn(id) { return this.d.weapons[id] || this.d.fabao[id]; },
  isFb(id) { return FABAO.some((x) => x.id === id); },
  // 法寶加成：強化每級 +8%，突破每次 +25%（鏡的暴擊點數同樣放大）
  fStat(id) {
    const f = FABAO.find((x) => x.id === id), o = this.d.fabao[id]; if (!f || !o) return null;
    return Math.round(f.val * (1 + 0.08 * o.lv) * (1 + 0.25 * o.brk) * 10) / 10;
  },
  fMain() { const id = this.d.fslot; return id && this.d.fabao[id] ? FABAO.find((f) => f.id === id) : null; },
  fBonus(stat) { const f = this.fMain(); return f && FB_TYPES[f.type].stat === stat ? this.fStat(f.id) : 0; },
  // 兵器數值：強化每級 +8%，突破每次 +25%
  wStat(id) {
    const w = WEAPONS.find((x) => x.id === id), o = this.d.weapons[id]; if (!w || !o) return null;
    const k = (1 + 0.08 * o.lv) * (1 + 0.25 * o.brk);
    return { atk: Math.round(w.atk * k), crit: Math.round(w.crit * (1 + 0.1 * o.brk) * 10) / 10, regen: Math.round(w.regen * (1 + 0.04 * o.lv) * (1 + 0.25 * o.brk) * 10) / 10 };
  },
  wMain() { const id = this.d.wslot[0]; return id && this.d.weapons[id] ? WEAPONS.find((w) => w.id === id) : null; },   // 主手兵器
  equipped() { return this.d.wslot.filter((id) => id && this.d.weapons[id]).map((id) => WEAPONS.find((w) => w.id === id)); },
  wTop() { return this.equipped().reduce((t, w) => (!t || w.tier > t.tier ? w : t), null); },   // 最高階的已裝備兵器，決定光效
  wFx(fx) { return this.equipped().some((w) => w.fx === fx); },
  wSum(key) { return this.d.wslot.reduce((a, id) => a + ((id && this.wStat(id)) ? this.wStat(id)[key] : 0), 0); },
  stats() {
    const d = this.d, L = d.lv, k = Math.pow(1.45, L), r = this.rootFx();
    const art = (key) => ARTS.reduce((a, A) => a + (A.stat[key] || 0) * this.artLv(A.id), 0);
    const hp = Math.round(120 * k * (1 + art('hp') + (r.hp || 0) + d.bonus.hp + this.fBonus('hp') / 100));
    const atk = Math.round((15 * k + this.wSum('atk')) * (1 + art('atk') + (r.atk || 0) + d.bonus.atk));
    const def = Math.round(3 * k * (1 + art('def') + (r.def || 0) + this.fBonus('def') / 100));
    const mp = Math.round((80 + 20 * L) * (1 + (r.mp || 0)));
    return { hp, atk, def, mp, mpRegen: 4 + L * 0.6 + (r.mp ? 2 : 0) + this.wSum('regen'), crit: 0.08 + (r.crit || 0) + (this.wSum('crit') + this.fBonus('crit')) / 100, interval: 1.0, power: Math.round(hp * 0.2 + atk * 3 + def * 2) };
  },
  // 靈根加成乘上品階倍率
  rootFx() {
    if (!this.d.root) return {};
    const m = GRADES[this.d.grade || '黃'].mult;
    return Object.fromEntries(Object.entries(ROOTS[this.d.root]).map(([k, v]) => [k, typeof v === 'number' ? v * m : v]));
  },
  rate() {
    const d = this.d, r = this.rootFx();
    return baseRate(d.lv) * (1 + 0.12 * this.artLv('yinqi') + (r.rate || 0));
  },
  need() { return expNeed(this.d.lv); },
  full() { return this.d.exp >= this.need(); },
  addExp(n) { if (this.d.lv >= MAX_LV && this.full()) return; this.d.exp = Math.min(this.need() * 1.0, this.d.exp + n); },
  add(id, n = 1) { this.d.inv[id] = (this.d.inv[id] || 0) + n; },
  has(id, n = 1) { return (this.d.inv[id] || 0) >= n; },
  take(id, n = 1) { if (!this.has(id, n)) return false; this.d.inv[id] -= n; return true; },

  // 離線累積（最多八個時辰）
  offline() {
    const sec = Math.min(OFFLINE_CAP, Math.max(0, (Date.now() - this.d.last) / 1000));
    if (sec < 60 || !this.d.root) return null;
    const before = this.d.exp, room = this.need() - before;
    const gain = Math.min(room, this.rate() * sec);
    this.d.exp += gain;
    const stone = Math.floor(sec / 60) * (1 + this.d.lv);
    this.add('stone', stone);
    return { sec, gain, stone, capped: sec >= OFFLINE_CAP, full: this.full() };
  },

  // 每日秘境次數
  today() {
    if (this.d.daily.date !== U.today()) this.d.daily = { date: U.today(), realm: 0, free: false, sign: false };
    return this.d.daily;
  },
  dailyLeft() { return REGIONS.find((r) => r.id === 'realm').daily - this.today().realm; },
  sign() { const t = this.today(); if (t.sign) return 0; t.sign = true; const n = GACHA.sign(this.d.lv); this.add('stone', n); this.save(); return n; },

  // ───────── 機緣抽取 ─────────
  // wpn＝法寶池、art＝功法池，保底計數互不影響
  pityKey(pool) { return pool === 'wpn' ? 'pityArtifact' : 'pityTechnique'; },
  pity(pool) { return this.d[this.pityKey(pool)]; },
  // 單抽判定：先累計，第 90 抽必出仙階以上；抽中仙階以上（含自然抽中）計數歸零
  rollTier(pool) {
    const key = this.pityKey(pool), d = this.d;
    d[key] = (d[key] || 0) + 1;
    let tier;
    if (d[key] >= GACHA.pity) tier = U.chance(1 / 6) ? 4 : 3;
    else { let r = Math.random(); tier = GACHA.rates.findIndex((p) => (r -= p) < 0); if (tier < 0) tier = 0; }
    if (tier >= 3) d[key] = 0;
    return tier;
  },
  drawCost(n) { return n === 10 ? GACHA.cost10 : GACHA.cost; },
  // 單抽與十連共用：單抽每日首抽免費；十連保底一個靈階以上。回傳結果陣列，靈石不足回傳 null（不扣款、不抽）
  draw(pool, n) {
    const t = this.today(), free = n === 1 && !t.free, cost = Math.abs(this.drawCost(n));
    if (!free) {
      if ((this.d.inv.stone || 0) < cost) return null;
      this.d.inv.stone -= cost;
    }
    if (free) t.free = true;
    const tiers = Array.from({ length: n }, () => this.rollTier(pool));   // 十連逐抽累計、逐抽判定
    if (n === 10 && tiers.every((x) => x === 0)) tiers[9] = 1;
    const res = tiers.map((tier) => (pool === 'wpn' ? this.grantWeapon(tier) : this.grantArt(tier)));
    this.save(); return res;
  },
  grantWeapon(tier) {
    const pool = [...WEAPONS.filter((x) => x.tier === tier), ...FABAO.filter((x) => x.tier === tier)], g = U.pick(pool);
    if (g.type) { const isNew = !this.d.fabao[g.id]; return { tier, type: 'f', id: g.id, name: g.name, base: g.name, qty: '×1', isNew, note: this.gainFabao(g.id) }; }
    const isNew = !this.d.weapons[g.id];
    return { tier, type: 'w', id: g.id, name: g.name, base: g.name, qty: '×1', isNew, note: this.gainWeapon(g.id) };
  },
  grantArt(tier) {
    const R = ART_GACHA[tier];
    const open = ARTS.filter((A) => this.artLv(A.id) < ART_MAX);
    const A = R.art === 'wanjian' && this.artLv('wanjian') < ART_MAX ? ARTS.find((x) => x.id === 'wanjian') : R.art ? U.pick(open) : null;
    if (!A) { const n = R.scroll || 10; this.add('scroll', n); return { tier, type: 'item', id: 'scroll', name: `功法殘卷 ×${n}`, base: '功法殘卷', qty: `×${n}`, isNew: false }; }
    const lv = this.artLv(A.id) + 1; this.d.arts[A.id] = lv;
    return { tier, type: 'art', id: A.id, name: `${A.name}・第 ${lv} 層`, base: A.name, qty: `第 ${lv} 層`, isNew: lv === 1 };
  },

  // ───────── 突破 ─────────
  breakRate(usePills) {
    const major = isMajor(this.d.lv);
    let r = major ? 0.55 : 0.95;
    if (usePills.break) r += 0.15;
    if (usePills.zhuji && major) r += 0.3;
    return Math.min(0.98, r);
  },
  // bonus：渡劫時點準時機換來的成功率加成（可為負）
  breakthrough(usePills, bonus = 0) {
    if (!this.full() || this.d.lv >= MAX_LV) return null;
    if (usePills.break && !this.take('p_break')) usePills.break = false;
    if (usePills.zhuji && !this.take('p_zhuji')) usePills.zhuji = false;
    const rate = U.clamp(this.breakRate(usePills) + bonus, 0.02, 0.98), ok = Math.random() < rate, major = isMajor(this.d.lv), from = this.d.lv;
    // 失敗：跌回上一個小境界，修為只剩該境界的一半
    if (ok) { this.d.lv++; this.d.exp = 0; }
    else { this.d.lv = Math.max(0, this.d.lv - 1); this.d.exp = Math.floor(this.need() * 0.5); }
    this.save();
    return { ok, major, from, to: this.d.lv };
  },

  // ───────── 煉丹 ─────────
  alchRate(r) { return Math.min(0.95, r.rate + Math.floor(this.d.lv / 3) * 0.06 + (this.d.root === 'fire' ? 0.05 : 0)); },
  canCraft(r) { return Object.entries(r.need).every(([k, n]) => this.has(k, n)) && this.has('stone', r.stone); },
  craft(r) {
    if (!this.canCraft(r)) return null;
    for (const [k, n] of Object.entries(r.need)) this.take(k, n);
    this.take('stone', r.stone);
    const ok = Math.random() < this.alchRate(r);
    if (ok) this.add(r.out);
    this.save(); return ok;
  },
  usePill(id) {
    if (!this.has(id)) return null;
    if (id === 'p_qi') { if (this.full()) return '修為已滿，先行突破'; this.take(id); this.d.exp = Math.min(this.need(), this.d.exp + this.need() * 0.3); }
    else if (id === 'p_zao') { this.take(id); this.d.bonus.atk += 0.08; this.d.bonus.hp += 0.08; }
    else return '此丹在突破或戰鬥時自動使用';
    this.save(); return true;
  },

  // ───────── 功法 ─────────
  artState(A) {
    const lv = this.artLv(A.id);
    if (lv === 0) return { lv, can: this.d.lv >= A.req * 3 && this.has('scroll', A.scroll), learn: true };
    return { lv, can: lv < ART_MAX && this.has('stone', artCost(lv)), learn: false };
  },
  upArt(A) {
    const st = this.artState(A); if (!st.can) return false;
    if (st.learn) this.take('scroll', A.scroll); else this.take('stone', artCost(st.lv));
    this.d.arts[A.id] = st.lv + 1; this.save(); return true;
  },
  skillOpen(sk) { if (sk.wt !== undefined) { const t = this.wTop(); return !!t && t.tier >= sk.wt; } return this.artLv(sk.from) > 0; },

  // ───────── 兵器 ─────────
  // 取得兵器；已擁有則折成玄鐵（不退靈石），回傳說明文字
  gainWeapon(id) {
    const w = WEAPONS.find((x) => x.id === id);
    if (this.d.weapons[id]) { const ore = 5 * (w.tier + 1); this.add('ore', ore); return `${w.name}重複，化為玄鐵 ×${ore}`; }
    this.d.weapons[id] = { lv: 0, brk: 0, fail: 0 };
    // 主手空著就放主手；主手已有劍就放副手，並標記讓法寶頁高亮
    if (!this.d.wslot[0]) this.d.wslot[0] = id;
    else if (!this.d.wslot[1]) { this.d.wslot[1] = id; this.d.freshW = id; }
    return null;
  },
  // 取得法寶；法寶欄空著就直接佩上；重複則折成玄鐵（不退靈石）
  gainFabao(id) {
    const f = FABAO.find((x) => x.id === id);
    if (this.d.fabao[id]) { const ore = 5 * (f.tier + 1); this.add('ore', ore); return `${f.name}重複，化為玄鐵 ×${ore}`; }
    this.d.fabao[id] = { lv: 0, brk: 0, fail: 0 };
    if (!this.d.fslot) this.d.fslot = id;
    return null;
  },
  fEquip(id) { this.d.fslot = id; this.save(); },
  fUnequip() { this.d.fslot = null; this.save(); },
  // 剛自動放入副手的兵器，提示一次
  subNotice(id) { return this.d.freshW === id && this.d.wslot[1] === id ? `${WEAPONS.find((w) => w.id === id).name}已放入副手` : null; },
  wSwap() { this.d.wslot = [this.d.wslot[1], this.d.wslot[0]]; this.d.freshW = null; this.save(); },
  wEquip(id, slot) {
    this.d.freshW = null;
    const o = slot === 0 ? 1 : 0;
    if (this.d.wslot[o] === id) this.d.wslot[o] = this.d.wslot[slot];   // 兩欄互換
    this.d.wslot[slot] = id; this.save();
  },
  wUnequip(slot) { this.d.wslot[slot] = null; this.save(); },
  wCap(id) { return 10 * (1 + this.gOwn(id).brk); },
  // 強化：失敗只扣靈石，連敗三次後必成
  wEnhance(id) {
    const w = this.gDef(id), o = this.gOwn(id), cost = wEnhCost(w, o.lv);
    if (o.lv >= this.wCap(id) || !this.take('stone', cost)) return null;
    const pity = o.fail >= W_PITY, ok = pity || Math.random() < wEnhRate(o.lv);
    if (ok) { o.lv++; o.fail = 0; } else o.fail++;
    this.save(); return { ok, pity };
  },
  wCanBreak(id) {
    const w = this.gDef(id), o = this.gOwn(id);
    if (o.brk >= W_BRK_MAX || o.lv < this.wCap(id)) return false;
    const { need, stone } = wBrkNeed(w, o.brk);
    return Object.entries(need).every(([k, n]) => this.has(k, n)) && this.has('stone', stone);
  },
  wBreak(id) {
    if (!this.wCanBreak(id)) return false;
    const w = this.gDef(id), o = this.gOwn(id), { need, stone } = wBrkNeed(w, o.brk);
    for (const [k, n] of Object.entries(need)) this.take(k, n);
    this.take('stone', stone); o.brk++; this.save(); return true;
  },
  // 商店與煉器
  shopOpen(it) { return this.d.lv >= (it.lv || 0); },
  buy(it) {
    if (!this.shopOpen(it) || (it.w && this.d.weapons[it.w]) || !this.take('stone', it.stone)) return false;
    if (it.w) this.gainWeapon(it.w); else this.add(it.item, it.n);
    this.save(); return true;
  },
  canForge(f) { return !this.d.weapons[f.w] && Object.entries(f.need).every(([k, n]) => this.has(k, n)) && this.has('stone', f.stone); },
  forge(f) {
    if (!this.canForge(f)) return null;
    for (const [k, n] of Object.entries(f.need)) this.take(k, n);
    this.take('stone', f.stone);
    const ok = Math.random() < f.rate;
    if (ok) this.gainWeapon(f.w);
    this.save(); return ok;
  },
  // 任務：done 達成未領、claimed 已領
  questState(q) { return this.d.quests[q.id] ? 'claimed' : q.check(this) ? 'done' : 'todo'; },
  claim(q) {
    if (this.questState(q) !== 'done') return null;
    const notes = [];
    for (const [k, n] of Object.entries(q.reward)) { if (k === 'w') { const r = this.gainWeapon(n); if (r) notes.push(r); } else this.add(k, n); }
    this.d.quests[q.id] = true; this.save(); return notes;
  },
  questsReady() { return QUESTS.filter((q) => this.questState(q) === 'done').length; },
};

