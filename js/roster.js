'use strict';
// ════════════════════════════════════════════
//  轉珠隊伍：已擁有角色、隊伍編組、主角與道侶快照、技能效果計算
//  數值與角色表在 js/roster-cfg.js；戰鬥在 js/puzzle.js 套用
//  存檔欄位 S.d.pz.ro（舊存檔沒有就補上，並送 PZ_STARTER 起始角色）：
//    own  { 角色 id: { star 星級 } }
//    team [id|null ×3] 三個隊員位
//    cap  'hero'＝主角當隊長，或隊上某角色的 id
//    mate 道侶主角快照（雲端 heroes/<uid> 讀來的最後一份；dev 模擬的帶 sim:true）
//  雲端：heroes/<uid> 放自己的主角快照，道侶讀它當副隊長（需阿文部署規則）
// ════════════════════════════════════════════

const pzChar = (id) => PZ_CHARS.find((c) => c.id === id);
const pzSk = (id) => PZ_SKILLS[id] || null;

const Roster = {
  get d() { return S.d.pz.ro; },

  // ───────── 存檔 ─────────
  fresh() { return { v: 1, own: Object.fromEntries(PZ_STARTER.map((id) => [id, { star: 1 }])), team: PZ_STARTER.slice(0, 3), cap: 'hero', mate: null }; },
  fix(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return this.fresh();   // 舊存檔：沒有這欄＝送起始角色
    const r = { v: 1, own: {}, team: [null, null, null], cap: 'hero', mate: this.clean(o.mate) }, nid = (id) => PZ_RENAMED[id] || id;
    if (r.mate && o.mate.sim) r.mate.sim = true;
    if (r.mate && typeof o.mate.uid === 'string') r.mate.uid = o.mate.uid.slice(0, 64);
    if (o.own && typeof o.own === 'object') for (const [id0, v] of Object.entries(o.own)) {
      const id = nid(id0), C = pzChar(id); if (!C) continue;
      r.own[id] = { star: Math.max((r.own[id] && r.own[id].star) || 1, U.clamp(Math.floor(Number(v && v.star) || 1), 1, PZ_RARITY[C.rare].maxStar)) };
    }
    if (!Object.keys(r.own).length) return { ...this.fresh(), mate: r.mate };   // 舊角色都對不到：重送起始角色
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
      wpn: WEAPONS.some((w) => w.id === s.wpn) ? s.wpn : null, sk: pzSk(s.sk) ? s.sk : PZ_HERO.sk, sub: pzSk(s.sub) ? s.sub : PZ_HERO.sub, at: num(s.at, 0, 1e13) || 0 };
    return o.name && o.el && o.lv !== null && o.atk && o.hp && o.rcv !== null ? o : null;
  },

  // ───────── 主角 ─────────
  // 自己的主角快照（也是寫到雲端 heroes/<uid> 的內容）
  snap() {
    const d = S.d, k = 1 + (d.lv || 0) * PZ_HERO.lvStep, w = S.wMain(), ws = w ? S.wStat(w.id) : null;
    return { name: (typeof HERO_NAME !== 'undefined' && HERO_NAME) || '林清遠', char: (d.dao && d.dao.char) || 'qingyuan', el: PZ_ROOT[d.root] || 'wood', lv: d.lv || 0,
      atk: Math.round(PZ_HERO.atk * k + (ws ? ws.atk * PZ_HERO.wpnAtk : 0)), hp: Math.round(PZ_HERO.hp * k), rcv: Math.round(PZ_HERO.rcv * k),
      wpn: w ? w.id : null, sk: (w && PZ_HERO.wpnSk[w.id]) || PZ_HERO.sk, sub: PZ_HERO.sub, at: Date.now() };
  },
  // 道侶主角：有快照用快照；綁了道侶但還沒同步過＝預設數值配道侶名字；沒綁＝預設補位
  mateSnap() {
    const P = S.d.dao && S.d.dao.partner, m = this.d.mate;
    if (m && (m.sim || (P && P.uid && m.uid === P.uid))) return { ...m, src: m.sim ? 'sim' : 'cloud' };
    if (P) return { ...PZ_MATE_DEFAULT, name: P.name, char: P.char || PZ_MATE_DEFAULT.char, src: 'bond' };
    return { ...PZ_MATE_DEFAULT, src: 'none' };
  },
  // 主角／道侶快照 → 隊員
  fromSnap(s, pos, self) {
    return { id: self ? 'hero' : 'mate', src: self ? 'self' : 'partner', name: s.name, short: s.name, el: s.el, role: PZ_HERO.role, fac: PZ_HERO.fac, wild: true, rare: '', star: 0,
      atk: s.atk, hp: s.hp, rcv: s.rcv, img: `assets/ui/char_${s.char}.webp`, port: false, pos, lv: s.lv, wpn: s.wpn,
      sk: pzSk(s.sk), lead: pzSk(self ? PZ_HERO.lead : s.sub), leadId: self ? PZ_HERO.lead : s.sub, mateSrc: s.src };
  },
  // 抽卡角色 → 隊員（數值乘星級）
  fromChar(id, pos) {
    const C = pzChar(id), star = (this.d.own[id] && this.d.own[id].star) || 1, k = 1 + (star - 1) * PZ_STAR.step;
    return { id, src: 'char', name: C.name, short: C.short || C.name.split('·').pop(), el: C.el, role: C.role, fac: C.fac, rare: C.rare, star,
      atk: Math.round(C.atk * k), hp: Math.round(C.hp * k), rcv: Math.round(C.rcv * k),
      img: C.face || C.art || '', port: !C.face && !!C.art, art: C.art || '', pos, sk: pzSk(C.sk), lead: pzSk(C.lead), leadId: C.lead };
  },

  // ───────── 組隊 ─────────
  // 回傳 [隊長, 副隊長, 隊員…]：主角固定在隊上，隊長可換成隊上的抽卡角色
  team() {
    const g = this.d, hero = this.fromSnap(this.snap(), '隊員', true), mate = this.fromSnap(this.mateSnap(), '副隊長', false);
    const mem = g.team.filter((id) => id && g.own[id]).map((id) => this.fromChar(id, '隊員'));
    const all = [hero, ...mem], cap = all.find((m) => m.id === g.cap) || hero;
    cap.pos = '隊長';
    return [cap, mate, ...all.filter((m) => m !== cap)];
  },
  // 隊長技＋副隊長技＋同陣營加成 → 效果清單（'self' 換成擁有者的屬性、陣營）
  calc(T) {
    const leads = [[T[0], T[0].lead], [T[1], T[1].lead]].filter(([, L]) => L), mods = [];
    leads.forEach(([m, L]) => L.fx.forEach((e) => mods.push({ ...e, el: e.el === 'self' ? m.el : e.el, fac: e.fac === 'self' ? m.fac : e.fac, src: L.name })));
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
    return { mods, facs, hp, rcv, atk, combo: sum('combo'), delay: sum('delay'), time: sum('time', 'sec'), comboUp: sum('comboUp', 'add'), pierce: mods.some((e) => e.t === 'pierce'),
      leads: leads.map(([m, L], i) => ({ ...L, who: m.name, pos: i ? '副隊長技' : '隊長技' })) };
  },
  match(e, m) { return (!e.el || e.el === m.el || (Array.isArray(e.el) && e.el.includes(m.el))) && (!e.fac || (e.wild && m.wild) || e.fac === m.fac) && (!e.role || e.role === m.role); },
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
    return `<span class="pzr-face ${cls}" style="--c:${E.c};--d:${E.d}">${m.img ? `<img${m.port ? ' class="port"' : ''} src="${m.img}" alt="" onerror="this.remove()">` : ''}<em>${m.short.slice(-2)}</em><i>${E.ch}</i></span>`;
  },
  skText(S1) { return S1 ? `「${S1.name}」${S1.desc}${S1.cd ? `（冷卻 ${S1.cd}）` : ''}` : '無'; },
  info(m) {
    const F = PZ_FACS[m.fac], R = PZ_RARITY[m.rare];
    return `<div class="pzr-info">${m.art ? `<img class="pzr-art" src="${m.art}" alt="${m.name}" onerror="this.remove()">` : this.face(m, 'lg')}<div><b>${m.name}</b>${R ? ` <span class="pzr-rare" style="color:${R.c}">${m.rare}</span> <span class="pzr-star">${'★'.repeat(m.star)}</span>` : m.lv !== undefined ? ` <small>${typeof lvName !== 'undefined' ? lvName(m.lv) : ''}${m.wpn ? '・' + WEAPONS.find((w) => w.id === m.wpn).name : ''}</small>` : ''}
      <p><span class="pzr-tag" style="--c:${PZ_EL[m.el].c}">${PZ_EL[m.el].ch}</span><span class="pzr-tag">${PZ_ROLES[m.role]}</span><span class="pzr-tag" style="--c:${m.wild ? '#c9f' : F.c}">${m.wild ? '萬用陣營' : F.name}</span><small>攻 ${U.fmt(m.atk)}・血 ${U.fmt(m.hp)}・回 ${U.fmt(m.rcv)}</small></p>
      <p><em>${m.id === 'mate' ? '副隊長技' : '隊長技'}</em>${this.skText(m.lead)}</p><p><em>主動技</em>${this.skText(m.sk)}</p></div></div>`;
  },
  // 地圖關卡說明裡的一行隊伍摘要
  summary() {
    const T = this.team(), C = this.calc(T);
    return `<div class="pzr-mini">${T.map((m) => this.face(m)).join('')}</div><p class="c note">氣血 ${U.fmt(C.hp)}・攻擊 ${U.fmt(C.atk)}${C.facs.length ? '・' + C.facs.map((f) => PZ_FACS[f.fac].name + f.n + '人').join('') : ''}</p>`;
  },

  // ───────── 編組畫面（開在章節地圖的面板裡）─────────
  // sel：目前點選的是 'hero'、'mate'、角色 id 或隊員空位 'slot0'～'slot2'
  editor(back, sel) {
    const g = this.d, T = this.team(), C = this.calc(T), byId = Object.fromEntries(T.map((m) => [m.id, m]));
    sel = sel || 'hero';
    const slots = [0, 1, 2].map((i) => g.team[i]);
    const card = (m, key, lab) => `<button class="pzr-card${sel === key ? ' sel' : ''}${m && m.pos === '隊長' ? ' cap' : ''}" data-k="${key}">${m ? this.face(m) : '<span class="pzr-face empty">＋</span>'}${m && m.wild ? '<b class="pzr-wild">萬用</b>' : ''}<small>${lab}</small></button>`;
    const free = PZ_CHARS.filter((c) => g.own[c.id] && !slots.includes(c.id));
    const pick = sel.startsWith('slot') ? null : byId[sel] || (g.own[sel] ? this.fromChar(sel, '') : null);
    const inTeam = pick && (pick.id === 'hero' || slots.includes(pick.id));
    const emptySlot = slots.indexOf(null);
    const facTxt = C.facs.length ? C.facs.map((f) => `${PZ_FACS[f.fac].name} ${f.n} 人（角色 ${f.own}＋萬用 ${f.wild}）：攻 ×${f.atk}、血 ×${f.hp}`).join('') : '同陣營 3 人以上有加成（主角、副隊長是萬用，可補任一陣營）';
    const acts = [];
    if (pick && inTeam && pick.pos !== '隊長') acts.push(['cap', '設為隊長']);
    if (pick && inTeam && pick.id !== 'hero') acts.push(['out', '移出隊伍']);
    if (pick && !inTeam && pick.id !== 'mate') acts.push(['in', emptySlot >= 0 ? '編入隊伍' : '換下選取的隊員']);
    const html = `<div class="pzr"><h3>隊伍編組</h3>
      <div class="pzr-row">${card(byId.hero, 'hero', byId.hero.pos)}${card(byId.mate, 'mate', '副隊長')}${slots.map((id, i) => card(id && byId[id], id || 'slot' + i, id ? (byId[id].pos === '隊長' ? '隊長' : '隊員') : '空位')).join('')}</div>
      <div class="pzr-sum"><span>氣血 <b>${U.fmt(C.hp)}</b></span><span>攻擊 <b>${U.fmt(C.atk)}</b></span><span>回復 <b>${U.fmt(C.rcv)}</b></span></div>
      <p class="pzr-lead">${C.leads.map((L) => `<em>${L.pos}</em>${L.who}「${L.name}」${L.desc}`).join('<br>')}<br><em>陣營</em>${facTxt}</p>
      ${pick ? this.info(pick) : `<p class="c note">點下方角色編入這個空位</p>`}
      ${acts.length ? `<div class="pz-row">${acts.map(([k, t]) => `<button class="pz-btn" data-a="${k}">${t}</button>`).join('')}</div>` : ''}
      ${pick && pick.id === 'mate' ? `<p class="c note">${{ none: '尚未締結道侶：由預設道友補位', bond: '道侶尚未同步主角資料：先用預設數值', cloud: '道侶上次同步的主角資料', sim: '測試用模擬道侶' }[pick.mateSrc]}</p>` : ''}
      <h4>已擁有（${Object.keys(g.own).length}）</h4>
      <div class="pzr-list">${free.length ? free.map((c) => { const m = this.fromChar(c.id, ''); return `<button class="pzr-card${sel === c.id ? ' sel' : ''}" data-k="${c.id}">${this.face(m)}<small>${m.short}</small></button>`; }).join('') : '<p class="note">沒有其他角色（之後由抽卡取得）</p>'}</div>
      ${DEV ? '<div class="pz-row wrap"><button class="pz-btn" data-dev="all">發放全部角色（測試）</button><button class="pz-btn" data-dev="mate">' + (g.mate && g.mate.sim ? '清除模擬道侶' : '模擬道侶（測試）') + '</button></div>' : ''}</div>`;
    const re = (s) => this.editor(back, s);
    Stage.panel(html, [['完成', () => (back ? back() : Stage.closePanel()), 'go']]);
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
      else if (a === 'in') this.put(emptySlot >= 0 ? emptySlot : Math.max(0, slots.indexOf(this._last)), pick.id);
      re(pick.id);
    }));
    if (byId[sel] && slots.includes(sel)) this._last = sel;   // 「換下選取的隊員」換的是最後點過的隊員
    el.querySelectorAll('[data-dev]').forEach((b) => (b.onclick = () => { b.dataset.dev === 'all' ? pzDev.giveAll() : pzDev.mate(g.mate && g.mate.sim ? null : undefined); re(sel); }));
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
