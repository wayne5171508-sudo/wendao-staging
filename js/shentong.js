'use strict';
// ════════════════════════════════════════════
//  神通領悟：資料在 js/shentong-cfg.js
//  存檔 S.d.st = { got: { 大境界: 神通 id }, pend: [{ realm, opts: [id…] }] }
//    pend 在突破當下就抽好並存檔，關掉重開不會換選項；讀檔時 opts 只留下該境界、該角色池子裡的 id
//  套用：Roster.growth() 讀 ST.list()，Roster.calc 把 fx 併進「修行」加成（只給自己，不進雲端快照）
// ════════════════════════════════════════════
const ST = {
  later: false,   // 按過「稍後」：這次開遊戲回洞府不再自動跳出，直到下一次突破
  def(id) { return SHENTONG.find((s) => s.id === id); },
  top() { return Math.max(...SHENTONG.map((s) => s.realm)); },
  ch(d = S.d) { return (d.dao && d.dao.char) || 'qingyuan'; },
  inPool(r, id, ch) { const s = this.def(id); return !!s && s.realm === r && (s.char === 'any' || s.char === ch); },
  draw(r, ch, rnd) {
    const p = SHENTONG.filter((s) => this.inPool(r, s.id, ch)).map((s) => s.id), out = [];
    while (out.length < SHENTONG_CFG.pick && p.length) out.push(p.splice(Math.floor(rnd() * p.length), 1)[0]);
    return out;
  },
  // 讀檔整理：清掉不合法的資料，並替舊存檔補發已經過的每個大境界
  fix(d) {
    const o = d.st && typeof d.st === 'object' ? d.st : {}, ch = this.ch(d), got = {}, pend = [];
    for (const [k, id] of Object.entries(o.got && typeof o.got === 'object' ? o.got : {})) if (this.inPool(+k, id, ch)) got[+k] = id;
    for (const p of Array.isArray(o.pend) ? o.pend : []) {
      const r = p && +p.realm; if (!r || got[r] || pend.some((q) => q.realm === r) || !Array.isArray(p.opts)) continue;
      const opts = [...new Set(p.opts)].filter((id) => this.inPool(r, id, ch)).slice(0, SHENTONG_CFG.pick);
      if (opts.length) pend.push({ realm: r, opts });
    }
    // 補發用建檔時間當種子：補發後還沒存檔就關掉，重開仍是同一組選項
    for (let r = 1, n = Math.min(Math.floor((d.lv || 0) / 3), this.top()); r <= n; r++) {
      if (got[r] || pend.some((q) => q.realm === r)) continue;
      const opts = this.draw(r, ch, seeded((d.created || 1) + r * 7919)); if (opts.length) pend.push({ realm: r, opts });
    }
    pend.sort((a, b) => a.realm - b.realm); d.st = { got, pend };
  },
  roll(r) {
    const st = S.d.st; if (st.got[r] || st.pend.some((q) => q.realm === r)) return;
    const opts = this.draw(r, this.ch(), Math.random); if (!opts.length) return;
    st.pend.push({ realm: r, opts }); st.pend.sort((a, b) => a.realm - b.realm); this.later = false; S.save();
  },
  // 領悟：選項必須是存檔裡這個境界抽好的其中一個；領過就沒有 pend，連點第二次直接失敗
  choose(r, id) {
    const st = S.d.st, i = st.pend.findIndex((q) => q.realm === r);
    if (i < 0 || st.got[r] || !st.pend[i].opts.includes(id)) return false;
    st.got[r] = id; st.pend.splice(i, 1); S.save(); return true;
  },
  resetErr(r) {
    const st = S.d.st;
    if (!st.got[r]) return '這個境界還沒有神通';
    if (st.pend.some((q) => q.realm === r)) return '先領悟待選的神通';
    if (!S.has('scroll', SHENTONG_CFG.resetScroll)) return `功法殘卷不足（需要 ${SHENTONG_CFG.resetScroll}，持有 ${S.d.inv.scroll || 0}）`;
    return '';
  },
  reset(r) {
    if (this.resetErr(r)) return false;
    const opts = this.draw(r, this.ch(), Math.random); if (!opts.length) return false;
    S.take('scroll', SHENTONG_CFG.resetScroll); delete S.d.st.got[r];
    S.d.st.pend.push({ realm: r, opts }); S.d.st.pend.sort((a, b) => a.realm - b.realm); S.save(); return true;
  },
  list() { const g = (S.d && S.d.st && S.d.st.got) || {}; return Object.keys(g).sort((a, b) => a - b).map((k) => this.def(g[k])).filter(Boolean); },
  pending() { return !!(S.d && S.d.st && S.d.st.pend.length); },

  // ───────── 面板（自己的全螢幕層，洞府與章節地圖上都蓋得住）─────────
  tag(s) { return s.char === 'any' ? '通用' : '專屬'; },
  card(s, cls = '') { return `<b>${s.name}</b><em class="${s.char === 'any' ? '' : 'own'}">${this.tag(s)}</em><span>${s.desc}</span>${cls}`; },
  open(onDone, manage) {
    this.done = onDone; this.busy = false;
    let ov = document.getElementById('stOv');
    if (!ov) { ov = document.createElement('div'); ov.id = 'stOv'; ov.className = 'st-ov'; document.body.appendChild(ov); }
    if (!manage && this.pending()) this.offer(ov); else this.manage(ov);
  },
  close() { const ov = document.getElementById('stOv'); if (ov) ov.remove(); const f = this.done; this.done = null; if (f) f(); },
  box(ov, title, sub, body, foot) {
    ov.innerHTML = `<div class="st-box" role="dialog" aria-modal="true" aria-label="${title}"><h3>${title}</h3><p class="st-sub">${sub}</p><div class="st-body">${body}</div><div class="st-foot">${foot}</div></div>`;
  },
  offer(ov) {
    const p = S.d.st.pend[0], left = S.d.st.pend.length - 1; let sel = null;
    this.box(ov, '神通領悟', `晉入${REALMS[p.realm]}・三門神通擇一，永久生效${left ? `（之後還有 ${left} 次）` : ''}`,
      p.opts.map((id) => `<button class="st-opt" data-id="${id}">${this.card(this.def(id))}</button>`).join(''),
      '<button class="seal sm ghost" data-st="later">稍後</button><button class="seal sm" data-st="pick" disabled>領悟</button>');
    const foot = ov.querySelector('.st-foot'), base = foot.innerHTML;
    const bindFoot = () => {
      foot.querySelector('[data-st="later"]').onclick = () => { this.later = true; this.close(); };
      const pk = foot.querySelector('[data-st="pick"]'); pk.disabled = !sel;
      pk.onclick = () => {
        const s = this.def(sel);
        foot.innerHTML = `<p>確定領悟「${s.name}」？</p><button class="seal sm ghost" data-st="back">再想想</button><button class="seal sm" data-st="ok">確定</button>`;
        foot.querySelector('[data-st="back"]').onclick = () => { foot.innerHTML = base; bindFoot(); };
        foot.querySelector('[data-st="ok"]').onclick = () => {
          if (this.busy) return; this.busy = true; foot.querySelectorAll('button').forEach((b) => (b.disabled = true));
          if (!this.choose(p.realm, sel)) { this.close(); return; }
          if (typeof Audio2 !== 'undefined') Audio2.play('up');
          UI.toast(`領悟神通「${s.name}」`, '#ffe7a0');
          if (this.pending()) { this.busy = false; this.offer(ov); } else this.close();
        };
      };
    };
    ov.querySelectorAll('.st-opt').forEach((b) => (b.onclick = () => {
      sel = b.dataset.id; ov.querySelectorAll('.st-opt').forEach((x) => x.classList.toggle('sel', x === b)); foot.innerHTML = base; bindFoot();
    }));
    bindFoot();
  },
  manage(ov) {
    const st = S.d.st, cost = SHENTONG_CFG.resetScroll, rows = [];
    for (let r = 1; r <= this.top(); r++) {
      const s = st.got[r] && this.def(st.got[r]), wait = st.pend.some((q) => q.realm === r);
      rows.push(`<div class="st-row"><h4>${REALMS[r]}</h4>${s ? `<div class="st-opt got">${this.card(s)}</div><button class="seal sm ghost" data-re="${r}">重新領悟（殘卷 ${cost}）</button>`
        : wait ? '<p class="note">待領悟</p><button class="seal sm" data-st="go">領悟</button>' : `<p class="note">晉入${REALMS[r]}後領悟</p>`}</div>`);
    }
    this.box(ov, '神通', `功法殘卷 ${S.d.inv.scroll || 0}・重新領悟會退回該境界並重抽三門`, rows.join(''), '<button class="seal sm" data-st="close">關閉</button>');
    const foot = ov.querySelector('.st-foot');
    foot.querySelector('[data-st="close"]').onclick = () => this.close();
    ov.querySelectorAll('[data-st="go"]').forEach((b) => (b.onclick = () => this.offer(ov)));
    ov.querySelectorAll('[data-re]').forEach((b) => (b.onclick = () => {
      const r = +b.dataset.re, err = this.resetErr(r);
      if (err) { foot.innerHTML = `<p class="lack">${err}</p><button class="seal sm" data-st="close">知道了</button>`; foot.querySelector('button').onclick = () => this.manage(ov); return; }
      foot.innerHTML = `<p>花 ${cost} 張殘卷，放棄「${this.def(st.got[r]).name}」，重抽${REALMS[r]}的三門神通？</p><button class="seal sm ghost" data-st="back">再想想</button><button class="seal sm" data-st="ok">確定</button>`;
      foot.querySelector('[data-st="back"]').onclick = () => this.manage(ov);
      foot.querySelector('[data-st="ok"]').onclick = () => {
        if (this.busy) return; this.busy = true; foot.querySelectorAll('button').forEach((x) => (x.disabled = true));
        const ok = this.reset(r); this.busy = false; ok ? this.offer(ov) : this.manage(ov);
      };
    }));
  },
};

// 固定種子的亂數（mulberry32）
function seeded(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ════════ 接到存檔、突破、回洞府 ════════
(() => {
  const fresh0 = S.fresh.bind(S), load0 = S.load.bind(S), imp0 = S.importText.bind(S), bt0 = S.breakthrough.bind(S), go0 = UI.go.bind(UI);
  const safeFix = () => { try { ST.fix(S.d); } catch (e) { console.warn('[存檔] 神通資料損毀，已重設', e); S.d.st = { got: {}, pend: [] }; } };
  S.fresh = () => ({ ...fresh0(), st: { got: {}, pend: [] } });
  S.load = () => { const r = load0(); safeFix(); return r; };
  S.importText = (t) => { const r = imp0(t); if (r === true) { safeFix(); S.save(); } return r; };
  // 大境界突破成功：當下抽好選項存檔，演出結束回洞府時跳出面板
  S.breakthrough = (u, b) => { const r = bt0(u, b); if (r && r.ok && r.major) ST.roll(Math.floor(r.to / 3)); return r; };
  UI.go = (tab) => {
    go0(tab);
    if (tab !== 'home' || ST.later || !ST.pending()) return;
    setTimeout(() => {
      const a = $('#app').classList;
      if (UI.tab !== 'home' || Battle.on || a.contains('title-mode') || a.contains('story-mode') || $('#controls').classList.contains('busy') || document.getElementById('stOv') || !ST.pending()) return;
      ST.open();
    }, 450);
  };
  if (S.d) safeFix();   // 這個檔案載入前就已讀檔
})();
