'use strict';
// ════════════════════════════════════════════
//  轉珠隊伍：已擁有角色、隊伍編組、主角與道侶快照、技能效果計算
//  數值與角色表在 js/roster-cfg.js；戰鬥在 js/puzzle.js 套用
//  存檔欄位 S.d.pz.ro（舊存檔沒有就補上；新存檔只有主角，戰友靠劇情招募，見 js/pz-story.js）：
//    own  { 角色 id: { star 星級 } }
//    team [id|null ×3] 三個戰友位
//    cap  'hero'＝主角當隊長，或隊上某角色的 id
//    mate 道侶主角快照（雲端 heroes/<uid> 讀來的最後一份；dev 模擬的帶 sim:true）
//    mateOff true＝道侶欄位設為不同行（預設同行；舊版客戶端讀檔會丟掉這欄＝回到同行）
//    own_sk 'wpn'＝主動技用兵器技、'own'＝用本命技（結丹解鎖；v2 起，舊存檔補 'wpn'）
//  雲端：heroes/<uid> 放自己的主角快照，道侶讀它當副隊長（需阿文部署規則）
// ════════════════════════════════════════════

const pzChar = (id) => PZ_CHARS.find((c) => c.id === id);
const pzSk = (id) => PZ_SKILLS[id] || null;

const Roster = {
  get d() { return S.d.pz.ro; },

  // ───────── 存檔 ─────────
  fresh() { return { v: 2, own_sk: 'wpn', own: {}, team: [null, null, null], cap: 'hero', mate: null, mateOff: false }; },
  fix(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return this.fresh();   // 沒有這欄：只有主角（已過關的戰友由 js/pz-story.js 補發）
    const r = { v: 2, own_sk: o.own_sk === 'own' ? 'own' : 'wpn', own: {}, team: [null, null, null], cap: 'hero', mate: this.clean(o.mate), mateOff: o.mateOff === true }, nid = (id) => PZ_RENAMED[id] || id;
    if (r.mate && o.mate.sim) r.mate.sim = true;
    if (r.mate && typeof o.mate.uid === 'string') r.mate.uid = o.mate.uid.slice(0, 64);
    if (o.own && typeof o.own === 'object') for (const [id0, v] of Object.entries(o.own)) {
      const id = nid(id0), C = pzChar(id); if (!C) continue;
      r.own[id] = { star: Math.max((r.own[id] && r.own[id].star) || 1, U.clamp(Math.floor(Number(v && v.star) || 1), 1, PZ_RARITY[C.rare].maxStar)) };
    }
    if (Array.isArray(o.team)) o.team.slice(0, 3).forEach((id, i) => { id = nid(id); if (r.own[id] && !r.team.includes(id)) r.team[i] = id; });
    r.cap = r.team.includes(nid(o.cap)) ? nid(o.cap) : 'hero';
    return r;
  },
  // 雲端來的快照不可信：逐欄檢查，不合格回傳 null
  clean(s) {
    if (!s || typeof s !== 'object') return null;
    const num = (v, lo, hi) => (Number.isFinite(+v) ? U.clamp(Math.round(+v), lo, hi) : null);
    const el = PZ_ROOT[s.el] || (PZ_EL[s.el] && s.el !== 'heart' ? s.el : null);
    const o = { name: escHtml(String(s.name || '').slice(0, 8)), char: /^[a-z]{1,16}$/.test(s.char) ? s.char : 'yunxi', el,
      lv: num(s.lv, 0, 99), atk: num(s.atk, 1, 99999), hp: num(s.hp, 1, 999999), rcv: num(s.rcv, 0, 99999),
      wpn: WEAPONS.some((w) => w.id === s.wpn) ? s.wpn : null, sk: pzSk(s.sk) ? s.sk : PZ_HERO.sk, sub: pzSk(s.sub) ? s.sub : PZ_HERO.sub, at: num(s.at, 0, 1e13) || 0, st: {} };
    // 抽卡角色星級（只收認得的角色，夾到該稀有度上限）
    if (s.st && typeof s.st === 'object') for (const [id, v] of Object.entries(s.st)) { const C = pzChar(id); if (C) o.st[id] = num(v, 1, PZ_RARITY[C.rare].maxStar) || 1; }
    return o.name && o.el && o.lv !== null && o.atk && o.hp && o.rcv !== null ? o : null;
  },

  // ───────── 主角 ─────────
  // 角色別主角設定（PZ_HERO_BY_CHAR）與目前大境界的技能；找不到角色退回 PZ_HERO
  hero() {
    const d = S.d, H = PZ_HERO_BY_CHAR[(d.dao && d.dao.char) || 'qingyuan'], i = Math.min(4, Math.floor((d.lv || 0) / 3)), w = S.wMain();
    const wsk = (w && PZ_HERO.wpnSk[w.id]) || PZ_HERO.sk, own = H && (d.lv || 0) >= PZ_OWN_LV ? H.own[i] : null;
    return { H: H || PZ_HERO, w, wsk, own, useOwn: !!own && this.d.own_sk === 'own', lead: H ? H.lead[i] : PZ_HERO.lead, sub: H ? H.sub[i] : PZ_HERO.sub, role: (H && H.role) || PZ_HERO.role };
  },
  // 主角基礎數值（未加修行）：自己隊上的主角用這份，修行加成由 calc 套用
  base() {
    const d = S.d, R = this.hero(), k = 1 + (d.lv || 0) * PZ_HERO.lvStep, ws = R.w ? S.wStat(R.w.id) : null;
    return { name: (typeof HERO_NAME !== 'undefined' && HERO_NAME) || '林清遠', char: (d.dao && d.dao.char) || 'qingyuan', el: PZ_ROOT[d.root] || 'wood', lv: d.lv || 0,
      atk: Math.round(R.H.atk * k + (ws ? ws.atk * PZ_HERO.wpnAtk : 0)), hp: Math.round(R.H.hp * k), rcv: Math.round(R.H.rcv * k),
      wpn: R.w ? R.w.id : null, sk: R.useOwn ? R.own : R.wsk, sub: R.sub, at: Date.now(),
      st: Object.fromEntries(Object.entries(this.d.own).map(([id, o]) => [id, o.star])) };   // 角色星級：抽卡升星後跟著同步到雲端
  },
  // 寫到雲端 heroes/<uid> 的快照：欄位同 base，atk／hp 換成修行後的數值（道侶當副隊長時不再乘修行），夾在 clean() 的上限內
  snap() {
    const b = this.base(), G = this.grow(b);
    return { ...b, atk: U.clamp(Math.round(b.atk * G.atkMult), 1, 99999), hp: U.clamp(Math.round(b.hp * G.hpMult), 1, 999999) };
  },
  // 道侶欄位（編組畫面最右邊）：沒綁定或沒登入雲端＝null（空白，不補位）
  //   src 'sim' ?dev 模擬道侶（online 跟著「模擬在線」）／'cloud' 雲端 heroes 快照（離線時就是對方上次上傳的）／'wait' 綁了但對方還沒上傳過（不能出戰）
  //   age 快照距今幾天，stale 超過 PZ_STORY.mate.staleDays
  mateSnap() {
    const g = S.d.dao || {}, P = g.partner, m = this.d.mate, day = 864e5;
    const at = (x) => { const age = x.at ? Math.max(0, (Date.now() - x.at) / day) : null; return { age, stale: age !== null && age > PZ_STORY.mate.staleDays }; };
    if (DEV && m && m.sim) return { ...m, src: 'sim', online: !!g.simOnline, ...at(m) };
    if (!P || !P.uid || typeof Cloud === 'undefined' || !Cloud.on) return null;
    if (m && m.uid === P.uid) return { ...m, name: P.name || m.name, src: 'cloud', online: !!Cloud.partnerOnline, ...at(m) };
    return { name: P.name, char: P.char || 'yunxi', src: 'wait' };
  },
  // 這一場會不會帶道侶：有可出戰的快照且沒設成不同行
  mateIn() { const s = this.mateSnap(); return s && s.src !== 'wait' && !this.d.mateOff ? s : null; },
  // 對方是否也把我帶上隊：雲端快照沒有這個欄位，只有 ?dev 模擬道侶可切換
  mateMutual(s) { return !!s && s.src === 'sim' && !!(S.d.dao && S.d.dao.simMutual); },
  // 主角／道侶快照 → 隊員
  fromSnap(s, pos, self) {
    const R = self ? this.hero() : null;
    return { id: self ? 'hero' : 'mate', src: self ? 'self' : 'partner', name: s.name, short: s.name, el: s.el, role: self ? R.role : PZ_HERO.role, fac: PZ_HERO.fac, wild: true, rare: '', star: 0,
      atk: s.atk, hp: s.hp, rcv: s.rcv, img: `assets/ui/char_${s.char}.webp`, port: false, pos, lv: s.lv, wpn: s.wpn, mate: s,
      sk: pzSk(s.sk), lead: pzSk(self ? R.lead : s.sub), leadId: self ? R.lead : s.sub, mateSrc: s.src };
  },
  // 抽卡角色 → 隊員（數值乘星級）
  fromChar(id, pos) {
    const C = pzChar(id), star = (this.d.own[id] && this.d.own[id].star) || 1, k = 1 + (star - 1) * PZ_STAR.step;
    return { id, src: 'char', name: C.name, short: C.short || C.name.split('・').pop(), el: C.el, role: C.role, fac: C.fac, rare: C.rare, star,
      atk: Math.round(C.atk * k), hp: Math.round(C.hp * k), rcv: Math.round(C.rcv * k),
      img: C.face || C.art || '', port: !C.face && !!C.art, art: C.art || '', pos, sk: pzSk(C.sk), lead: pzSk(C.lead), leadId: C.lead };
  },

  // ───────── 組隊 ─────────
  // 回傳 [隊長, 戰友…, 道侶]：主角固定在隊上，隊長可換成隊上的抽卡角色；道侶（副隊長）有才放最後
  team() {
    const g = this.d, hero = this.fromSnap(this.base(), '隊員', true), ms = this.mateIn();
    const mem = g.team.filter((id) => id && g.own[id]).map((id) => this.fromChar(id, '隊員'));
    const all = [hero, ...mem], cap = all.find((m) => m.id === g.cap) || hero;
    cap.pos = '隊長';
    return [cap, ...all.filter((m) => m !== cap), ...(ms ? [this.fromSnap(ms, '道侶', false)] : [])];
  },
  // 隊長技＋副隊長技（道侶）＋同陣營加成＋道侶同行加成 → 效果清單（'self' 換成擁有者的屬性、陣營）
  calc(T) {
    const mate = T.find((m) => m.id === 'mate'), leads = [[T[0], T[0].lead], ...(mate ? [[mate, mate.lead]] : [])].filter(([, L]) => L), mods = [];
    leads.forEach(([m, L]) => L.fx.forEach((e) => mods.push({ ...e, el: e.el === 'self' ? m.el : e.el, fac: e.fac === 'self' ? m.fac : e.fac, src: L.name })));
    // 主角修行（放置版功法、法寶、副手、靈根、造化丹、道侶印記）：只乘在自己的主角身上
    const hero = T.find((m) => m.id === 'hero'), G = hero ? this.grow(hero) : null;
    if (G) mods.push({ t: 'atk', who: 'hero', mult: G.atkMult, src: '修行' }, { t: 'hp', who: 'hero', mult: G.hpMult, src: '修行' });
    if (G) G.st.forEach((s1) => s1.fx.forEach((e) => mods.push({ ...e, el: e.el === 'self' ? hero.el : e.el, src: '神通' })));   // 神通（js/shentong.js）
    const bond = mate ? this.bond(mate.mate) : null;   // 道侶同行：感情加成、攻擊士氣、雙向共鳴（全隊）
    if (bond) bond.fx.forEach((e) => mods.push(e));
    // 同陣營加成：主角、副隊長是「萬用」，可補進任一陣營；各陣營＝抽卡角色數＋萬用數，只取最高的一個陣營
    const wild = T.filter((m) => m.wild).length, facs = [];
    const best = Object.keys(PZ_FACS).map((f) => ({ fac: f, own: T.filter((m) => !m.wild && m.fac === f).length }))
      .map((o) => ({ ...o, wild, n: o.own + wild, B: [...PZ_FAC_BONUS].reverse().find((b) => o.own + wild >= b.n) }))
      .filter((o) => o.B && o.own).sort((a, b) => b.n - a.n || b.own - a.own)[0];   // 同人數時抽卡角色多的優先
    if (best) {
      facs.push({ fac: best.fac, n: best.n, own: best.own, wild, atk: best.B.atk, hp: best.B.hp });
      mods.push({ t: 'atk', fac: best.fac, wild: true, mult: best.B.atk, src: '陣營' }, { t: 'hp', fac: best.fac, wild: true, mult: best.B.hp, src: '陣營' });
    }
    const sum = (t, k = 'n') => mods.filter((e) => e.t === t).reduce((a, e) => a + (e[k] || 0), 0);
    const hp = Math.round(T.reduce((a, m) => a + m.hp * this.mul(mods, 'hp', m), 0)), rcv = Math.round(T.reduce((a, m) => a + m.rcv * this.mul(mods, 'rcv', m), 0));
    const atk = Math.round(T.reduce((a, m) => a + m.atk * this.mul(mods, 'atk', m), 0));
    return { mods, facs, hp, rcv, atk, growth: G, bond, combo: sum('combo'), delay: sum('delay'), time: sum('time', 'sec'), comboUp: sum('comboUp', 'add'), regen: sum('regen', 'pct'), guard: mods.reduce((a, e) => (e.t === 'guard' ? a * (1 - (e.pct || 0)) : a), 1), pierce: mods.some((e) => e.t === 'pierce'),
      leads: leads.map(([m, L], i) => ({ ...L, who: m.name, pos: i ? '道侶技' : '隊長技' })) };
  },
  // 道侶同行加成（PZ_STORY.mate）：依親密度等級；s 為道侶快照
  bond(s) {
    const M = PZ_STORY.mate, lv = typeof Dao !== 'undefined' && S.d.dao ? Dao.lv() : 0, mo = M.morale[lv], mu = this.mateMutual(s) ? M.mutual : null;
    const fx = [{ t: 'hp', mult: M.love[lv], src: '感情加成' }, { t: 'atk', mult: mo.atk, src: '道侶士氣' }];
    if (mo.comboUp) fx.push({ t: 'comboUp', add: mo.comboUp, src: '道侶士氣' });
    if (mu) fx.push({ t: 'atk', mult: mu.atk, src: '雙向共鳴' }, { t: 'hp', mult: mu.hp, src: '雙向共鳴' }, ...(mu.regen ? [{ t: 'regen', pct: mu.regen, src: '雙向共鳴' }] : []));
    return { lv, lvName: DAO.levels[lv].name, love: M.love[lv], morale: mo, mutual: mu, fx };
  },
  bondText(B) {
    const x = (v) => `×${v.toFixed(2)}`;
    return `親密度「${B.lvName}」：感情加成 全隊血 ${x(B.love)}・道侶士氣 全隊攻 ${x(B.morale.atk)}${B.morale.comboUp ? `、每多 1 Combo 再 +${Math.round(B.morale.comboUp * 100)}%` : ''}`
      + (B.mutual ? `・雙向共鳴 攻 ${x(B.mutual.atk)}、血 ${x(B.mutual.hp)}${B.mutual.regen ? `、每回合回血 ${Math.round(B.mutual.regen * 100)}%` : ''}` : '・雙方都帶上彼此時另有雙向共鳴');
  },
  // 主角修行加成：數值與換算都在 js/pz-growth-cfg.js。atk／hp 為加總的百分比（0.3＝+30%），off 為副手換成的轉珠攻擊點數，mark 為道侶印記
  // 修行加成套到某份主角數值 b（atk、hp）上的倍率
  grow(b) {
    const G = this.growth();
    G.atkMult = ((b.atk + G.off) * (1 + G.atk) * (1 + G.mark)) / b.atk; G.hpMult = (1 + G.hp) * (1 + G.mark);
    return G;
  },
  growth() {
    const P = PZ_GROWTH, d = S.d, out = { atk: 0, hp: 0, off: 0, mark: 0, by: {}, st: typeof ST !== 'undefined' ? ST.list() : [] };
    const put = (src, stat, v) => {
      const [to, k] = P.conv[stat] || []; if (!to || !v) return;
      out[to] += v * k; const b = out.by[src] || (out.by[src] = { atk: 0, hp: 0 }); b[to] += v * k;
    };
    ARTS.forEach((A) => ['atk', 'hp'].forEach((k) => put('功法', k, (A.stat[k] || 0) * S.artLv(A.id) * P.artRate)));
    for (const [k, v] of Object.entries(S.rootFx())) if (typeof v === 'number') put('靈根', k, v * P.rootRate);
    const B = d.bonus || {}; put('造化丹', 'atk', (B.atk || 0) * P.bonusRate); put('造化丹', 'hp', (B.hp || 0) * P.bonusRate);
    const f = S.fMain(); if (f) put('法寶', FB_TYPES[f.type].stat, (S.fStat(f.id) / 100) * P.fabaoRate);
    const ow = d.wslot && d.wslot[1] && S.wStat(d.wslot[1]);
    if (ow) out.off = Math.round(ow.atk * PZ_HERO.wpnAtk * P.offhandRate);
    const g = d.dao || {}, mate = !!(g.partner || (DEV && (g.simOnline || (this.d.mate && this.d.mate.sim))));
    if (mate) out.mark = (g.mark || 0) * P.markRate;
    return out;
  },
  match(e, m) { return (!e.who || e.who === m.id) && (!e.el || e.el === m.el || (Array.isArray(e.el) && e.el.includes(m.el))) && (!e.fac || (e.wild && m.wild) || e.fac === m.fac) && (!e.role || e.role === m.role); },
  mul(mods, t, m) { return mods.reduce((a, e) => (e.t === t && e.mult && this.match(e, m) ? a * e.mult : a), 1); },

  // ───────── 編組操作 ─────────
  own(id) { return !!this.d.own[id]; },
  put(slot, id) {
    const g = this.d; if (!this.own(id) || slot < 0 || slot > 2) return false;
    const j = g.team.indexOf(id); if (j >= 0) g.team[j] = g.team[slot];   // 已在隊上：兩格對調
    g.team[slot] = id; S.save(); return true;
  },
  remove(id) { const g = this.d, j = g.team.indexOf(id); if (j < 0) return; g.team[j] = null; if (g.cap === id) g.cap = 'hero'; S.save(); },
  setCap(id) { const g = this.d; if (id !== 'hero' && !g.team.includes(id)) return; g.cap = id; S.save(); },
  grant(id, star = 1) { const C = pzChar(id); if (!C) return; const o = this.d.own[id]; this.d.own[id] = { star: U.clamp(Math.max(o ? o.star : 0, star), 1, PZ_RARITY[C.rare].maxStar) }; },

  // ───────── 顯示 ─────────
  face(m, cls = '') {
    const E = PZ_EL[m.el];
    return `<span class="pzr-face ${cls}" style="--c:${E.c};--d:${E.d}">${m.img ? `<img${m.port ? ' class="port"' : ''} src="${m.img}" alt="" onerror="this.remove()">` : ''}<em>${m.short.slice(-2)}</em>${pzElI(m.el, 'pzr-eli')}</span>`;
  },
  skText(S1) { return S1 ? `「${S1.name}」${S1.desc}${S1.cd ? `（冷卻 ${S1.cd}）` : ''}` : '無'; },
  info(m) {
    const F = PZ_FACS[m.fac], R = PZ_RARITY[m.rare], G = m.id === 'hero' ? this.calc(this.team()).growth : null;
    return `<div class="pzr-info${pzHas('card_detail') ? ' art' : ''}">${m.art ? `<img class="pzr-art" src="${m.art}" alt="${m.name}" onerror="this.remove()">` : this.face(m, 'lg')}<div><b>${m.name}</b>${R ? ` <span class="pzr-rare" data-r="${m.rare}" style="color:${R.c}">${m.rare}</span> <span class="pzr-star">${'★'.repeat(m.star)}</span>` : m.lv !== undefined ? ` <small>${typeof lvName !== 'undefined' ? lvName(m.lv) : ''}${m.wpn ? '・' + WEAPONS.find((w) => w.id === m.wpn).name : ''}</small>` : ''}
      <p><span class="pzr-tag" style="--c:${PZ_EL[m.el].c}">${pzElI(m.el, 'pz-el')}${PZ_EL[m.el].ch}</span><span class="pzr-tag">${PZ_ROLES[m.role]}</span><span class="pzr-tag" style="--c:${m.wild ? '#c9f' : F.c}"><i class="pzr-fac" data-fac="${m.wild ? 'wild' : m.fac}"></i>${m.wild ? '萬用陣營' : F.name}</span><small>攻 ${U.fmt(m.atk)}・血 ${U.fmt(m.hp)}・回 ${U.fmt(m.rcv)}${G ? `<br>修行後 攻 ${U.fmt(Math.round(m.atk * G.atkMult))}・血 ${U.fmt(Math.round(m.hp * G.hpMult))}` : ''}</small></p>
      <p><em>${m.id === 'mate' ? '道侶技' : '隊長技'}</em>${this.skText(m.lead)}</p><p><em>主動技</em>${this.skText(m.sk)}</p></div></div>`;
  },
  growthText(G) {
    const pc = (v) => `+${Math.round(v * 100)}%`, src = Object.entries(G.by).map(([k, b]) => `${k}${b.atk ? '攻' + pc(b.atk) : ''}${b.hp ? '血' + pc(b.hp) : ''}`);
    if (G.off) src.push(`副手攻 +${U.fmt(G.off)}`); if (G.mark) src.push(`道侶印記 ${pc(G.mark)}`);
    const st = G.st && G.st.length ? `<br><em>神通</em>${G.st.map((x) => `「${x.name}」${x.desc}`).join('・')}` : '';
    return `主角攻 ×${G.atkMult.toFixed(2)}、血 ×${G.hpMult.toFixed(2)}${src.length ? `（${src.join('・')}）` : '（尚無功法、法寶等加成）'}${st}`;
  },
  // 道侶欄位的說明文字
  mateNote(s) {
    if (!s) return '締結道侶並登入雲端後，可以在這裡帶道侶一起挑戰（對方不用在線）';
    if (s.src === 'wait') return `${s.name}還沒上傳主角資料：對方登入雲端並進入遊戲一次後就能同行`;
    const ago = s.age === null ? '' : s.age < 1 ? '今天' : `${Math.floor(s.age)} 天前`;
    return (s.src === 'sim' ? `測試用模擬道侶・${s.online ? '在線' : '離線'}` : s.online ? '道侶在線・使用最新快照' : `道侶離線・使用上次上傳的快照${ago ? `（${ago}）` : ''}`)
      + (s.stale ? `<br><b class="pzr-stale">快照已 ${Math.floor(s.age)} 天沒更新，數值可能不是最新</b>` : '') + (this.d.mateOff ? '<br>目前設為這次不同行' : '');
  },
  // 地圖關卡說明裡的一行隊伍摘要
  summary() {
    const T = this.team(), C = this.calc(T);
    return `<div class="pzr-mini">${T.map((m) => this.face(m)).join('')}</div><p class="c note">氣血 ${U.fmt(C.hp)}・攻擊 ${U.fmt(C.atk)}${C.facs.length ? '・' + C.facs.map((f) => PZ_FACS[f.fac].name + f.n + '人').join('') : ''}</p>`;
  },

  // ───────── 編組畫面（開在章節地圖的面板裡）─────────
  // sel：目前點選的是 'hero'、'mate'、角色 id 或戰友空位 'slot0'～'slot2'
  // 排列：主角、三個戰友位、最右邊道侶位（沒綁道侶＝空白）
  editor(back, sel) {
    const g = this.d, T = this.team(), C = this.calc(T), byId = Object.fromEntries(T.map((m) => [m.id, m]));
    sel = sel || 'hero';
    const slots = [0, 1, 2].map((i) => g.team[i]), ms = this.mateSnap(), mateM = ms && ms.src !== 'wait' ? byId.mate || this.fromSnap(ms, '道侶', false) : null;
    const spare = Object.keys(g.own).some((id) => !slots.includes(id));   // 還有沒上隊的戰友：空位顯示「空位」，否則「尚未結識」
    const card = (m, key, lab, cls = '') => `<button class="pzr-card${sel === key ? ' sel' : ''}${m && m.pos === '隊長' ? ' cap' : ''}${cls}" data-k="${key}">${m ? this.face(m) : `<span class="pzr-face empty">${cls ? '' : spare ? '＋' : '？'}</span>`}${m && m.wild ? '<b class="pzr-wild">萬用</b>' : ''}<small>${lab}</small></button>`;
    const mateCard = card(mateM, 'mate', !ms ? '道侶' : ms.src === 'wait' ? '待同步' : g.mateOff ? '不同行' : '道侶', ` mate${!mateM ? ' blank' : ''}${mateM && g.mateOff ? ' off' : ''}`);
    const pick = sel.startsWith('slot') ? null : sel === 'mate' ? mateM : byId[sel] || (pzChar(sel) ? this.fromChar(sel, '') : null);   // 圖鑑：未擁有的也能點開看技能
    const inTeam = pick && (pick.id === 'hero' || pick.id === 'mate' || slots.includes(pick.id));
    const emptySlot = slots.indexOf(null);
    const facTxt = C.facs.length ? C.facs.map((f) => `${PZ_FACS[f.fac].name} ${f.n} 人（角色 ${f.own}＋萬用 ${f.wild}）：攻 ×${f.atk}、血 ×${f.hp}`).join('') : '同陣營 3 人以上有加成（主角、道侶是萬用，可補任一陣營）';
    const acts = [];
    if (pick && inTeam && pick.pos !== '隊長' && pick.id !== 'mate') acts.push(['cap', '設為隊長']);
    if (pick && inTeam && pick.id !== 'hero' && pick.id !== 'mate') acts.push(['out', '移出隊伍']);
    if (pick && pick.id === 'mate') acts.push(['mate', g.mateOff ? '帶道侶同行' : '這次不同行']);
    if (pick && !inTeam && g.own[pick.id]) acts.push(['in', emptySlot >= 0 ? '編入隊伍' : '換下選取的隊員']);
    const HR = this.hero();
    if (pick && pick.id === 'hero' && typeof ST !== 'undefined' && (S.d.lv >= 3 || ST.list().length || ST.pending())) acts.push(['st', ST.pending() ? `領悟神通（${S.d.st.pend.length}）` : '神通']);
    if (pick && pick.id === 'hero' && HR.own) acts.push(['ownsk', HR.useOwn ? `改用兵器技「${pzSk(HR.wsk).name}」` : `改用本命技「${pzSk(HR.own).name}」`]);
    const html = `<div class="pzr"><h3>隊伍編組</h3>
      <div class="pzr-row">${card(byId.hero, 'hero', byId.hero.pos)}${slots.map((id, i) => card(id && byId[id], id || 'slot' + i, id ? (byId[id].pos === '隊長' ? '隊長' : '戰友') : spare ? '空位' : '尚未結識')).join('')}${mateCard}</div>
      <div class="pzr-sum"><span>氣血 <b>${U.fmt(C.hp)}</b></span><span>攻擊 <b>${U.fmt(C.atk)}</b></span><span>回復 <b>${U.fmt(C.rcv)}</b></span></div>
      <p class="pzr-lead">${C.leads.map((L) => `<em>${L.pos}</em>${L.who}「${L.name}」${L.desc}`).join('<br>')}<br><em>陣營</em>${facTxt}${C.growth ? `<br><em>修行</em>${this.growthText(C.growth)}` : ''}${C.bond ? `<br><em>修行・道侶</em>${this.bondText(C.bond)}` : ''}</p>
      ${pick ? this.info(pick) : sel === 'mate' ? '' : `<p class="c note">${spare ? '點下方角色編入這個空位' : '尚未結識戰友：推進章節關卡，會有同道加入'}</p>`}
      ${pick && pick.src === 'char' && !g.own[pick.id] ? '<p class="c note">尚未擁有・可從抽卡取得</p>' : ''}
      ${acts.length ? `<div class="pz-row">${acts.map(([k, t]) => `<button class="pz-btn" data-a="${k}">${t}</button>`).join('')}</div>` : ''}
      ${pick && pick.id === 'hero' && !HR.own ? `<p class="c note">結丹期解鎖本命技（可與兵器技二選一）</p>` : ''}
      ${sel === 'mate' ? `<p class="c note">${this.mateNote(ms)}</p>` : ''}
      <h4>圖鑑（已擁有 ${Object.keys(g.own).length} / ${PZ_CHARS.length}）</h4>
      <div class="pzr-list">${PZ_CHARS.map((c) => { const m = this.fromChar(c.id, ''), has = g.own[c.id]; return `<button class="pzr-card${sel === c.id ? ' sel' : ''}${has ? '' : ' lock'}${slots.includes(c.id) ? ' in' : ''}" data-k="${c.id}" style="--r:${PZ_RARITY[c.rare].c}">${this.face(m)}<small>${m.short}</small></button>`; }).join('')}</div>
      ${DEV ? '<div class="pz-row wrap"><button class="pz-btn" data-dev="all">發放全部角色（測試）</button><button class="pz-btn" data-dev="mate">' + (g.mate && g.mate.sim ? '清除模擬道侶' : '模擬道侶（測試）') + '</button>'
        + (g.mate && g.mate.sim ? `<button class="pz-btn" data-dev="on">模擬${S.d.dao.simOnline ? '在線' : '離線'}</button><button class="pz-btn" data-dev="mutual">對方${S.d.dao.simMutual ? '有' : '沒'}帶我</button><button class="pz-btn" data-dev="old">快照${(Date.now() - (g.mate.at || 0)) / 864e5 > PZ_STORY.mate.staleDays ? '過舊' : '最新'}</button>` : '') + '</div>' : ''}</div>`;
    const re = (s) => this.editor(back, s);
    Stage.panel(html, [['完成', () => (back ? back() : Stage.closePanel()), 'go'], ...(typeof Gacha !== 'undefined' && PzStory.gachaOpen() ? [['抽卡', () => Gacha.open(() => this.editor(back, sel)), 'ga-entry']] : [])]);
    const el = Stage.el.querySelector('#pzmPanel');
    el.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => {
      const k = b.dataset.k;
      if (sel.startsWith('slot') && g.own[k] && !slots.includes(k)) { this.put(+sel.slice(4), k); return re(k); }   // 先點空位再點角色
      re(k);
    }));
    el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'cap') this.setCap(pick.id);
      else if (a === 'out') this.remove(pick.id);
      else if (a === 'st') return ST.open(() => re('hero'));
      else if (a === 'ownsk') { g.own_sk = g.own_sk === 'own' ? 'wpn' : 'own'; S.save(); }
      else if (a === 'mate') { g.mateOff = !g.mateOff; S.save(); return re('mate'); }
      else if (a === 'in') this.put(emptySlot >= 0 ? emptySlot : Math.max(0, slots.indexOf(this._last)), pick.id);
      re(pick.id);
    }));
    if (byId[sel] && slots.includes(sel)) this._last = sel;   // 「換下選取的隊員」換的是最後點過的隊員
    el.querySelectorAll('[data-dev]').forEach((b) => (b.onclick = () => {
      const k = b.dataset.dev, D = S.d.dao;
      if (k === 'all') pzDev.giveAll(); else if (k === 'mate') pzDev.mate(g.mate && g.mate.sim ? null : undefined);
      else if (k === 'on') D.simOnline = !D.simOnline; else if (k === 'mutual') D.simMutual = !D.simMutual;
      else if (k === 'old') g.mate.at = (Date.now() - g.mate.at) / 864e5 > PZ_STORY.mate.staleDays ? Date.now() : Date.now() - (PZ_STORY.mate.staleDays + 2) * 864e5;
      S.save(); re(k === 'all' ? sel : 'mate');
    }));
  },
};

// ════════ 接到存檔：關卡存檔補 ro 欄位 ════════
(() => {
  const fresh0 = Stage.fresh.bind(Stage), fix0 = Stage.fix.bind(Stage);
  Stage.fresh = () => ({ ...fresh0(), ro: Roster.fresh() });
  Stage.fix = (d) => { const old = d.pz && d.pz.ro; fix0(d); d.pz.ro = Roster.fix(old); };
  if (S.d && S.d.pz && !S.d.pz.ro) S.d.pz.ro = Roster.fresh();   // 這個檔案載入前就已讀檔
})();

// ════════ 雲端：上傳自己的主角快照、監聽道侶的 ════════
(() => {
  if (typeof Cloud === 'undefined') return;
  const up0 = Cloud.upload.bind(Cloud), wp0 = Cloud.watchPartner.bind(Cloud);
  Cloud.upload = async function () {
    await up0();
    if (!this.user || !S.d || !S.d.root) return;
    const s = Roster.snap(), key = JSON.stringify({ ...s, at: 0 });
    if (key === this._heroKey) return;   // 沒變就不重寫
    try { await this.A.set(`heroes/${this.user.uid}`, s); this._heroKey = key; } catch (e) { console.warn('[雲端] 主角快照上傳失敗（heroes 規則可能還沒部署）', e); }
  };
  Cloud.watchPartner = function () {
    wp0();
    const P = S.d.dao.partner; if (!P || !P.uid) return;
    const off = this.A.on(`heroes/${P.uid}`, (v) => {
      const s = Roster.clean(v); if (!s) return;
      s.uid = P.uid; S.d.pz.ro.mate = s; S.save();
    });
    const prev = this.pOff; this.pOff = () => { if (prev) prev(); off(); };
  };
})();

// ════════ 開發指令：?dev 時 console 可用 pzDev.giveAll()、pzDev.mate()、pzDev.star(id, n) ════════
const pzDev = {
  giveAll() { PZ_CHARS.forEach((c) => Roster.grant(c.id)); S.save(); return Object.keys(Roster.d.own).length; },
  // 模擬道侶快照：不帶參數＝一組測試資料；null＝清除
  mate(s) {
    if (s === null) { Roster.d.mate = null; S.save(); return null; }
    const m = Roster.clean(s || { name: '測試道侶', char: 'yunxi', el: 'water', lv: 6, atk: 980, hp: 2100, rcv: 260, wpn: 'zichen', sk: 'shuang_sk', sub: 'ld_hp', at: Date.now() });
    if (!m) return false;
    m.sim = true; Roster.d.mate = m; S.save(); return m;
  },
  star(id, n) { Roster.grant(id, n); S.save(); return Roster.d.own[id]; },
};
if (!DEV) for (const k of Object.keys(pzDev)) pzDev[k] = () => false;
