'use strict';
// ════════════════════════════════════════════
//  轉珠劇情流程：首通招募戰友、首通解鎖抽卡（見面禮）、舊存檔依進度補發。數值與台詞在 js/pz-story-cfg.js
//  存檔欄位 S.d.pzs（放在存檔最上層：舊版客戶端讀檔時會原樣保留，pz 底下的未知欄位則會被丟掉）：
//    met  { 角色 id: 加入時間 }   gift 見面禮：0 未送、時間＝已送、'old'＝舊進度早已開過抽卡（不補送）
//  招募只在「首次通關」觸發（重刷、掃蕩不會）；已擁有的角色不重複招募，所以補發與首通互不重複
// ════════════════════════════════════════════

const PzStory = {
  pending: [],
  get d() { return S.d.pzs; },
  cleared(d, id) { const r = d.pz && d.pz.st && d.pz.st[id]; return !!(r && r.c > 0); },
  // 劇情戰友還沒結識（沒 met、也沒擁有）：不進卡池
  locked(id) { return PZ_STORY.recruit.some((R) => R.id === id) && !(S.d.pzs && S.d.pzs.met[id]) && !(S.d.pz && S.d.pz.ro.own[id]); },
  gachaOpen() { return !!(S.d && S.d.pz && (this.cleared(S.d, PZ_STORY.gacha.stage) || (S.d.pzs && S.d.pzs.gift))); },

  // 讀檔、匯入、雲端套用都會經過：補欄位、依進度補發戰友（安靜補，不跳對話）
  fix(d) {
    const P = (d.pzs = d.pzs && typeof d.pzs === 'object' && !Array.isArray(d.pzs) ? d.pzs : {});
    P.v = 1; if (!P.met || typeof P.met !== 'object' || Array.isArray(P.met)) P.met = {};
    if (P.gift !== 'old' && !(Number(P.gift) > 0)) P.gift = 0;
    for (const R of PZ_STORY.recruit) if (this.cleared(d, R.stage) && !d.pz.ro.own[R.id]) this.join(d, R.id);
    if (!P.gift && this.cleared(d, PZ_STORY.gacha.stage)) P.gift = 'old';
  },
  // 加入：給角色、放進第一個空的戰友位（已在隊上的不動）
  join(d, id) {
    const ro = d.pz.ro, C = pzChar(id); if (!C || ro.own[id]) return false;
    ro.own[id] = { star: 1 }; d.pzs.met[id] = d.pzs.met[id] || Date.now();
    const i = ro.team.indexOf(null); if (i >= 0 && !ro.team.includes(id)) ro.team[i] = id;
    return true;
  },
  // 首次通關：回傳要演的劇情
  onFirst(id) {
    const out = [], R = PZ_STORY.recruit.find((x) => x.stage === id), G = PZ_STORY.gacha;
    if (R && this.join(S.d, R.id)) out.push({ k: 'recruit', R, slot: S.d.pz.ro.team.indexOf(R.id) });
    if (G.stage === id && !this.d.gift) {
      this.d.gift = Date.now(); Gacha.d.ticket += G.gift.ticket; S.add('stone', G.gift.stone);
      out.push({ k: 'gacha' });
    }
    if (out.length) S.save();
    return out;
  },

  // ───────── 對話框（疊在轉珠畫面上，結算面板之上）─────────
  speaker(who) {
    if (who === 'narr') return { name: '', img: '' };
    if (who === 'hero') return { name: HERO_NAME, img: `assets/ui/char_${(S.d.dao && S.d.dao.char) || 'qingyuan'}.webp` };
    const C = pzChar(who); return { name: C ? C.short || C.name.split('・').pop() : who, img: C ? C.face || C.art || '' : '' };
  },
  show(list, root, done) {
    const ev = list.shift(); if (!ev) return done && done();
    const lines = ev.k === 'recruit' ? ev.R.lines : PZ_STORY.gacha.lines, G = PZ_STORY.gacha.gift;
    const tail = ev.k === 'recruit'
      ? (() => { const C = pzChar(ev.R.id); return `<b>${C.name}</b> 加入隊伍${ev.slot >= 0 ? `・已編入戰友第 ${ev.slot + 1} 位` : '・可到「編隊」編入'}`; })()
      : `<b>仙緣召喚</b>開啟・見面禮 仙緣券 ×${G.ticket}、靈石 ${U.fmt(G.stone)}`;
    const el = document.createElement('div'); el.className = 'pz-story'; root.appendChild(el);
    let i = 0;
    const step = () => {
      if (i >= lines.length) {
        el.innerHTML = `<div class="pz-story-box end"><p>${tail}</p><button class="pz-btn go" data-s>${ev.k === 'recruit' ? '同行' : '收下'}</button></div>`;
        if (typeof Audio2 !== 'undefined') Audio2.play('pickup');
        el.querySelector('[data-s]').onclick = (e) => { e.stopPropagation(); el.remove(); this.show(list, root, done); };
        el.onclick = null; return;
      }
      const [who, txt] = lines[i++], sp = this.speaker(who);
      el.innerHTML = `<div class="pz-story-box${who === 'narr' ? ' narr' : ''}">${sp.img ? `<img class="pz-story-face" src="${sp.img}" alt="" onerror="this.remove()">` : ''}
        <div>${sp.name ? `<b>${escHtml(sp.name)}</b>` : ''}<p>${txt}</p><small>點一下繼續</small></div></div>`;
    };
    el.onclick = () => step();
    step();
  },
};

// ════════ 接到存檔與流程 ════════
(() => {
  const fix0 = Stage.fix, fresh0 = S.fresh.bind(S);
  Stage.fix = (d) => { fix0.call(Stage, d); PzStory.fix(d); };
  S.fresh = () => ({ ...fresh0(), pzs: { v: 1, met: {}, gift: 0 } });
  if (S.d && S.d.pz && S.d.pz.ro && !S.d.pzs) PzStory.fix(S.d);   // 這個檔案載入前就已讀檔
  const ow = Stage.onWin.bind(Stage);
  Stage.onWin = (id, r) => { const W = ow(id, r); PzStory.pending = W.firstClear ? PzStory.onFirst(id) : []; return W; };
  // 通關結算面板出來後，疊上招募／解鎖對話
  const win0 = Puzzle.win;
  Puzzle.win = function () {
    PzStory.pending = [];
    // 章節最後一關首通（例：1-10）：先看章節完成面板，按「繼續」後再跳招募對話
    const cc0 = this.chapterClear;
    this.chapterClear = (C, then) => { const l = PzStory.pending; PzStory.pending = []; return cc0.call(this, C, () => { then(); if (l.length) setTimeout(() => this.on && PzStory.show(l, this.root), 400); }); };
    try { win0.apply(this, arguments); } finally { this.chapterClear = cc0; }
    if (PzStory.pending.length) { const l = PzStory.pending; PzStory.pending = []; setTimeout(() => this.on && PzStory.show(l, this.root), 400); }
  };
  // 抽卡頁：沒解鎖時不能從任何入口打開（地圖、編組按鈕已隱藏，這裡再擋一次）
  const open0 = Gacha.open.bind(Gacha);
  Gacha.open = (back) => (PzStory.gachaOpen() ? open0(back) : Stage.toast && Stage.toast(`通關 ${PZ_STORY.gacha.stage} 後開啟仙緣召喚`));
})();
