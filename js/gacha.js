'use strict';
// ════════════════════════════════════════════
//  角色抽卡（仙緣召喚）：結算、存檔、抽卡頁與演出。數值全在 js/gacha-cfg.js
//  存檔欄位 S.d.pz.gacha（舊存檔沒有就補；損毀欄位夾到合法值，整欄壞掉只重設這一欄）：
//    pity   距上次 SSR 已抽幾次（0～89）      sr   距上次 SR 以上已抽幾次（0～9）
//    total  總抽數    dust 星塵    ticket 仙緣券    hist 最近 20 筆 [{ id, k: new|up|dust, n, at }]（新的在前）
//  抽到的角色與星級寫進 S.d.pz.ro.own（js/roster.js）
// ════════════════════════════════════════════

const Gacha = {
  busy: false, force: null,
  get d() { return S.d.pz.gacha; },

  // ───────── 存檔 ─────────
  fresh() { return { v: 1, pity: 0, sr: 0, total: 0, dust: 0, ticket: 0, hist: [] }; },
  fix(o) {
    try {
      const f = this.fresh(), P = GACHA_CFG.pity;
      if (!o || typeof o !== 'object' || Array.isArray(o)) return f;
      const n = (v, hi) => { v = Math.floor(Number(v)); return Number.isFinite(v) ? U.clamp(v, 0, hi) : 0; };
      Object.assign(f, { pity: n(o.pity, P.hard - 1), sr: n(o.sr, P.srEvery - 1), total: n(o.total, 1e9), dust: n(o.dust, 1e9), ticket: n(o.ticket, 1e6) });
      if (Array.isArray(o.hist)) f.hist = o.hist.filter((h) => h && typeof h === 'object' && pzChar(h.id)).slice(0, GACHA_CFG.hist)
        .map((h) => ({ id: h.id, k: ['new', 'up', 'dust'].includes(h.k) ? h.k : 'new', n: n(h.n, 999), at: n(h.at, 1e13) }));
      return f;
    } catch (e) { console.warn('[抽卡] 存檔欄位損毀，已重設', e); return this.fresh(); }
  },

  // ───────── 機率 ─────────
  // 這一抽的 SSR 機率：g.pity＝已連續幾抽沒出 SSR，所以這是第 pity+1 抽
  ssrRate(pity) {
    const P = GACHA_CFG.pity, k = pity + 1;
    return k >= P.hard ? 1 : Math.min(1, GACHA_CFG.rates.SSR + Math.max(0, k - P.softFrom + 1) * P.softStep);
  },
  rollRare(g) {
    const ssr = this.ssrRate(g.pity), r = Math.random();
    if (r < ssr) return 'SSR';
    if (g.sr + 1 >= GACHA_CFG.pity.srEvery) return 'SR';   // 第 10 抽還沒出 SR 以上：SSR 沒中就給 SR
    return r < ssr + GACHA_CFG.rates.SR ? 'SR' : 'R';
  },
  // 這一稀有度目前可抽到的角色：劇情戰友（PZ_STORY.recruit）首通招募前不進池（已招募或已擁有照常），機率由同稀有度其餘角色平分
  poolOf(rare) { return GACHA_CFG.pool[rare].filter((id) => typeof PzStory === 'undefined' || !PzStory.locked(id)); },
  // 角色進 ro：新角色 1 星；重複升星到上限；滿星轉星塵
  give(id) {
    const C = pzChar(id), own = Roster.d.own, max = PZ_RARITY[C.rare].maxStar;
    if (!own[id]) { own[id] = { star: 1 }; return { id, k: 'new', n: 1 }; }
    if (own[id].star < max) { own[id].star++; return { id, k: 'up', n: own[id].star }; }
    const d = GACHA_CFG.dust[C.rare]; this.d.dust += d; return { id, k: 'dust', n: d };
  },
  cost(n) { const g = this.d, useT = g.ticket >= n; return { useT, stone: useT ? 0 : n === 10 ? GACHA_CFG.cost.ten : GACHA_CFG.cost.one }; },

  // ───────── 結算：只在這裡。同步執行：扣費 → 寫結果 → 存檔 ─────────
  // 整段沒有 await，存檔前關掉頁面＝什麼都沒發生（不白扣、不重複發）；演出期間 busy 擋住連點
  pull(n) {
    if (this.busy) return { err: '召喚進行中' };
    if (n !== 1 && n !== 10) return { err: '抽數不正確' };
    const g = this.d, c = this.cost(n);
    if (!c.useT && !S.has('stone', c.stone)) return { err: `靈石不足（需要 ${U.fmt(c.stone)}，目前 ${U.fmt(S.d.inv.stone || 0)}）` };
    this.busy = true;
    if (c.useT) g.ticket -= n; else S.take('stone', c.stone);
    const res = [];
    for (let i = 0; i < n; i++) {
      let rare = this.rollRare(g), id = null;
      if (DEV && this.force) { const F = this.force; rare = GACHA_CFG.pool[F] ? F : pzChar(F) ? pzChar(F).rare : rare; id = pzChar(F) ? F : null; }
      id = id || U.pick(this.poolOf(rare));
      g.pity = rare === 'SSR' ? 0 : g.pity + 1;
      g.sr = rare === 'R' ? g.sr + 1 : 0;
      const r = this.give(id); r.rare = rare; res.push(r);
      g.hist.unshift({ id, k: r.k, n: r.n, at: Date.now() });
    }
    g.hist.length = Math.min(g.hist.length, GACHA_CFG.hist);
    g.total += n;
    S.save();
    return { res, paid: c.useT ? `仙緣券 ×${n}` : `靈石 ${U.fmt(c.stone)}` };
  },
  // 星塵兌換：to＝'stone'（q 星塵換 q×30 靈石）或 'ticket'（q 張券）
  exchange(to, q) {
    const g = this.d, E = GACHA_CFG.exchange, need = to === 'ticket' ? q * E.ticket : q;
    if (!(q > 0) || g.dust < need) return false;
    g.dust -= need;
    if (to === 'ticket') g.ticket += q; else S.add('stone', q * E.stone);
    S.save(); return true;
  },

  // ════════ 抽卡頁 ════════
  open(back) {
    this.back = back || null;
    let el = document.getElementById('gaPage');
    if (!el) { el = document.createElement('div'); el.id = 'gaPage'; document.body.appendChild(el); }
    this.el = el; el.classList.remove('hidden');
    if (typeof Audio2 !== 'undefined') { this._mood = Audio2.mood; Audio2.setMood('gacha'); }
    this.render();
  },
  close() {
    if (this.busy) return;
    this.el.classList.add('hidden');
    if (typeof Audio2 !== 'undefined' && this._mood) Audio2.setMood(this._mood);
    if (this.back) this.back(); else if (Stage.mapOn) Stage.renderMap();
  },
  ic(k) { return `<i class="ga-ic ga-ic-${k}"></i>`; },
  render() {
    const g = this.d, P = GACHA_CFG.pity, left = P.hard - g.pity, c1 = this.cost(1), c10 = this.cost(10);
    const ssr = GACHA_CFG.pool.SSR.map((id) => { const C = pzChar(id); return `<span class="ga-ssr" style="--c:${PZ_EL[C.el].c}"><img src="${C.face}" alt="" onerror="this.remove()"><small>${C.short || C.name.split('・').pop()}</small></span>`; }).join('');
    this.el.innerHTML = `<div class="ga-top"><button class="pz-btn" id="gaBack" aria-label="返回">返</button><b class="ga-title">仙緣召喚</b>
        <div class="ga-cur"><span>${this.ic('stone')}${U.fmt(S.d.inv.stone || 0)}</span><span>${this.ic('ticket')}${g.ticket}</span><span>${this.ic('dust')}${g.dust}</span></div></div>
      <div class="ga-body">
        <div class="ga-banner"><b>青冥仙緣</b><small>常駐卡池・十二位道友</small></div>
        <div class="ga-ssrs">${ssr}</div>
        <div class="ga-pity"><div class="ga-pbar"><i class="ga-pfill" style="clip-path:inset(0 ${(100 * left / P.hard).toFixed(1)}% 0 0)"></i></div>
          <p>距離 SSR 保底還有 <b>${left}</b> 抽${g.pity + 1 >= P.softFrom ? '<em>機率提升中</em>' : ''}</p><small>每 ${P.srEvery} 抽必得 SR 以上・已抽 ${U.fmt(g.total)} 次</small></div>
        <div class="ga-btns">
          <button class="ga-pull" data-n="1"><b>單抽</b><small>${c1.useT ? `${this.ic('ticket')}仙緣券 1` : `${this.ic('stone')}${GACHA_CFG.cost.one}`}</small></button>
          <button class="ga-pull ten" data-n="10"><b>十連</b><small>${c10.useT ? `${this.ic('ticket')}仙緣券 10` : `${this.ic('stone')}${U.fmt(GACHA_CFG.cost.ten)}`}</small></button></div>
        <div class="ga-links"><button class="pz-btn" data-p="info">機率與保底</button><button class="pz-btn" data-p="dust">星塵兌換</button><button class="pz-btn" data-p="hist">紀錄</button></div>
        ${DEV ? `<div class="ga-links dev">${['R', 'SR', 'SSR', ''].map((f) => `<button class="pz-btn${(this.force || '') === f ? ' on' : ''}" data-f="${f}">${f ? '必出 ' + f : '正常'}</button>`).join('')}<button class="pz-btn" data-f="stone">+靈石</button></div>` : ''}
      </div>
      <div class="ga-show hidden" id="gaShow"></div>
      <div class="pz-end hidden" id="gaPanel"></div><div class="pz-toast" id="gaToast"></div>`;
    const $$ = (s) => this.el.querySelectorAll(s);
    this.el.querySelector('#gaBack').onclick = () => this.close();
    $$('.ga-pull').forEach((b) => (b.onclick = () => this.go(+b.dataset.n)));
    $$('[data-p]').forEach((b) => (b.onclick = () => this[b.dataset.p]()));
    $$('[data-f]').forEach((b) => (b.onclick = () => { const f = b.dataset.f; if (f === 'stone') S.add('stone', 20000), S.save(); else this.force = f || null; this.render(); }));
  },
  toast(msg) {
    const t = this.el.querySelector('#gaToast'); t.textContent = msg; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), 2400);
  },
  panel(html, btns) {
    const el = this.el.querySelector('#gaPanel');
    el.innerHTML = `<div class="pz-panel ga-pp"><div class="pz-pbody">${html}</div><div class="pz-row wrap">${btns.map((b, i) => `<button class="pz-btn wide${b[2] ? ' ' + b[2] : ''}" data-b="${i}"${b[3] ? ' disabled' : ''}>${b[0]}</button>`).join('')}</div></div>`;
    el.classList.remove('hidden');
    el.querySelectorAll('[data-b]').forEach((b) => (b.onclick = () => btns[+b.dataset.b][1]()));
    el.onclick = (e) => { if (e.target === el) el.classList.add('hidden'); };
  },
  shut() { this.el.querySelector('#gaPanel').classList.add('hidden'); },
  info() {
    const R = GACHA_CFG.rates, P = GACHA_CFG.pity, pct = (v) => `${+(v * 100).toFixed(2)}%`;
    const rows = ['SSR', 'SR', 'R'].map((r) => { const L = this.poolOf(r); return `<tr><th style="color:${PZ_RARITY[r].c}">${r}</th><td>${pct(R[r])}</td><td>每位 ${pct(R[r] / L.length)}</td><td>${PZ_RARITY[r].maxStar} 星・滿星轉 ${GACHA_CFG.dust[r]} 星塵</td></tr><tr><td></td><td colspan="3" class="ga-who">${L.map((id) => pzChar(id).name).join('、')}</td></tr>`; }).join('');
    this.panel(`<h3>機率與保底</h3><table class="ga-tbl">${rows}</table>
      <p><em>SSR 保底</em>每抽都會累計，第 ${P.softFrom} 抽起每抽 SSR 機率 +${pct(P.softStep)}（第 ${P.softFrom} 抽 ${pct(this.ssrRate(P.softFrom - 1))}、第 ${P.softFrom + 5} 抽 ${pct(this.ssrRate(P.softFrom + 4))}），第 ${P.hard} 抽必得 SSR。抽到 SSR 後重新計算。</p>
      <p><em>SR 保底</em>每 ${P.srEvery} 抽至少 1 個 SR 以上，十連必有。單抽也會累計。</p>
      <p><em>保底計數</em>存在存檔裡，不因換卡池或關閉遊戲歸零。</p>
      <p><em>重複角色</em>同一角色再抽到＝升 1 星；滿星後轉成星塵，星塵可換靈石（1：${GACHA_CFG.exchange.stone}）或仙緣券（${GACHA_CFG.exchange.ticket} 星塵 1 張）。</p>
      <p><em>費用</em>單抽 ${GACHA_CFG.cost.one} 靈石、十連 ${U.fmt(GACHA_CFG.cost.ten)} 靈石；有仙緣券時優先用券（1 張＝1 抽）。主角與道侶不在卡池；劇情戰友（林昭、白若水、鐵嶽）在章節中結識前也不在卡池。</p>`, [['知道了', () => this.shut()]]);
  },
  dust() {
    const g = this.d, E = GACHA_CFG.exchange, all = g.dust;
    const re = (ok) => { if (ok) { if (typeof Audio2 !== 'undefined') Audio2.play('pickup'); this.render(); this.dust(); } };
    this.panel(`<h3>星塵兌換</h3><p class="c">${this.ic('dust')}星塵 <b>${g.dust}</b>　${this.ic('ticket')}仙緣券 <b>${g.ticket}</b></p>
      <p class="c note">角色滿星後再抽到會轉成星塵（R ${GACHA_CFG.dust.R}、SR ${GACHA_CFG.dust.SR}、SSR ${GACHA_CFG.dust.SSR}）</p>`, [
      [`${E.ticket} 星塵 → 仙緣券 1`, () => re(this.exchange('ticket', 1)), 'go', g.dust < E.ticket],
      [`10 星塵 → 靈石 ${10 * E.stone}`, () => re(this.exchange('stone', 10)), '', g.dust < 10],
      [`全部 → 靈石 ${U.fmt(all * E.stone)}`, () => re(this.exchange('stone', all)), '', !all],
      ['關閉', () => this.shut()]]);
  },
  hist() {
    const g = this.d, K = { new: '新角色', up: '升星', dust: '星塵' };
    const rows = g.hist.map((h) => { const C = pzChar(h.id); return `<li><b style="color:${PZ_RARITY[C.rare].c}">${C.rare}</b>${C.name}<small>${h.k === 'up' ? `升到 ${h.n} 星` : h.k === 'dust' ? `星塵 +${h.n}` : K.new}</small></li>`; }).join('');
    this.panel(`<h3>最近 ${GACHA_CFG.hist} 筆</h3>${rows ? `<ol class="ga-hist">${rows}</ol>` : '<p class="c note">還沒有召喚紀錄</p>'}`, [['關閉', () => this.shut()]]);
  },

  // ════════ 演出 ════════
  async go(n) {
    const r = this.pull(n);
    if (r.err) { this.toast(r.err); return; }
    try { await this.show(r.res, n); } catch (e) { console.warn('[抽卡] 演出錯誤', e); } finally { this.busy = false; }
  },
  // 可略過的等待：按「略過」後所有等待立即結束
  wait(ms) { return this.skip ? Promise.resolve() : new Promise((res) => { const t = setTimeout(res, ms); this._sk = () => { clearTimeout(t); res(); }; }); },
  rank(r) { return { R: 0, SR: 1, SSR: 2 }[r]; },
  face(o, big) {
    const C = pzChar(o.id), short = C.short || C.name.split('・').pop(), R = PZ_RARITY[C.rare];
    const tag = o.k === 'new' ? '<i class="ga-tag new">NEW</i>' : o.k === 'up' ? '<i class="ga-tag up">升星</i>' : `<i class="ga-tag dust">${this.ic('dust')}+${o.n}</i>`;
    const star = Roster.d.own[o.id].star;
    return `<div class="ga-face r-${C.rare}" style="--c:${R.c}"><img class="ga-art" src="${big ? C.art : C.face}" alt="${C.name}" onerror="this.remove()">
      <b class="ga-rare">${C.rare}</b>${tag}<span class="ga-nm"><b>${big ? C.name : short}</b><i>${'★'.repeat(star)}</i></span></div>`;
  },
  async show(res, n) {
    const el = this.el.querySelector('#gaShow'), top = res.reduce((a, o) => Math.max(a, this.rank(o.rare)), 0);
    this.skip = false;
    el.className = 'ga-show';
    el.innerHTML = `<div class="ga-circle"></div><div class="ga-stage"></div><div class="ga-acts"></div><button class="pz-btn ga-skip" id="gaSkip">略過</button>`;   // 略過固定右下角，在特效之上
    el.querySelector('#gaSkip').onclick = () => { this.skip = true; if (this._sk) this._sk(); if (typeof Audio2 !== 'undefined') ['gacha_ssr_pre', 'gacha_ssr'].forEach((k) => Audio2.stopPz(k)); };
    const stage = el.querySelector('.ga-stage');
    // SSR：有前奏與神卡音檔時，前奏一開始就播、神卡接在前奏結束那一刻（Audio2.chain），全螢幕出場光等前奏播完才出現；缺檔用原本的音效
    const A = typeof Audio2 !== 'undefined' ? Audio2 : null, pre = top === 2 && A ? A.chain('gacha_ssr_pre', 'gacha_ssr') : null;
    if (A && pre == null) A.play('gather');
    await this.wait(pre != null ? Math.max(1100, pre * 1000) : 1100);
    if (top === 2) {   // SSR：全螢幕出場光
      el.insertAdjacentHTML('beforeend', '<div class="ga-full"></div>');
      if (A && pre == null) A.reveal(4);
      await this.wait(GACHA_CFG.ssrFull);
    }
    el.classList.add('dim');
    if (n === 1) {
      const o = res[0];
      stage.innerHTML = `<div class="ga-one r-${o.rare}"><div class="ga-fx"></div>${this.face(o, true)}</div><p class="ga-note">${this.note(o)}</p>`;
      if (A) { if (A.has('gacha_draw')) A.play('gacha_draw'); else if (top < 2) A.reveal(top + 1); }   // 翻卡音
    } else {
      stage.innerHTML = `<div class="ga-ten">${res.map((o) => `<div class="ga-flip r-${o.rare}"><div class="ga-back"></div>${this.face(o)}</div>`).join('')}</div>`;
      const cards = stage.querySelectorAll('.ga-flip');
      for (let i = 0; i < cards.length; i++) {
        cards[i].classList.add('on');
        if (!this.skip && A) A.play(A.has('gacha_draw') ? 'gacha_draw' : res[i].rare === 'R' ? 'cast' : 'divine');
        await this.wait(GACHA_CFG.flipGap * (res[i].rare === 'R' ? 1 : 2.5));
      }
      cards.forEach((c) => c.classList.add('on'));
      const nw = res.filter((o) => o.k === 'new').length, up = res.filter((o) => o.k === 'up').length, du = res.filter((o) => o.k === 'dust').reduce((a, o) => a + o.n, 0);
      stage.insertAdjacentHTML('beforeend', `<p class="ga-note">${[nw && `新角色 ${nw}`, up && `升星 ${up}`, du && `星塵 +${du}`].filter(Boolean).join('・')}</p>`);
    }
    // 結果按鈕：編入隊伍放最佳（稀有度高、新角色優先）
    const best = [...res].sort((a, b) => this.rank(b.rare) - this.rank(a.rare) || (b.k === 'new') - (a.k === 'new'))[0];
    el.querySelector('#gaSkip').remove();
    el.querySelector('.ga-acts').innerHTML = `<button class="pz-btn go" id="gaTeam">編入隊伍</button><button class="pz-btn" id="gaAgain">再${n === 1 ? '抽一次' : '十連'}</button><button class="pz-btn" id="gaDone">完成</button>`;
    el.querySelector('#gaTeam').onclick = () => this.toTeam(best.id);
    el.querySelector('#gaAgain').onclick = () => { this.render(); this.go(n); };
    el.querySelector('#gaDone').onclick = () => this.render();
  },
  note(o) {
    const C = pzChar(o.id);
    return o.k === 'new' ? `獲得新角色「${C.name}」` : o.k === 'up' ? `${C.name} 升到 ${o.n} 星` : `${C.name} 已滿星，轉為星塵 +${o.n}`;
  },
  // 一鍵編入：有空位放空位，沒有就換掉第 3 位；已在隊上就直接打開編隊
  toTeam(id) {
    const t = Roster.d.team;
    if (!t.includes(id)) Roster.put(t.indexOf(null) >= 0 ? t.indexOf(null) : 2, id);
    this.back = null; this.close();
    if (!Stage.mapOn) Stage.showMap();
    Roster.editor(null, id);
  },
};

// ════════ 接到存檔：pz 欄位補 gacha（新存檔、讀檔、匯入、雲端套用都會經過 Stage.fix）════════
(() => {
  const fresh0 = Stage.fresh.bind(Stage), fix0 = Stage.fix;
  Stage.fresh = () => ({ ...fresh0(), gacha: Gacha.fresh() });
  Stage.fix = (d) => { const old = d.pz && d.pz.gacha; fix0.call(Stage, d); d.pz.gacha = Gacha.fix(old); };
  if (S.d && S.d.pz && !S.d.pz.gacha) S.d.pz.gacha = Gacha.fresh();   // 這個檔案載入前就已讀檔
})();

// ════════ 開發指令：?dev 時 console 可用 gaDev.force('SSR'|'SR'|'R'|角色id|null)、gaDev.set({ pity, dust, ticket }) ════════
const gaDev = {
  force(f) { Gacha.force = f || null; return Gacha.force; },
  set(o) { Object.assign(Gacha.d, Gacha.fix({ ...Gacha.d, ...o })); S.save(); return Gacha.d; },
};
if (!DEV) for (const k of Object.keys(gaDev)) gaDev[k] = () => false;
