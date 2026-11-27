'use strict';
// ════════════════════════════════════════════
//  超級大放送（限時靈石倍率、放送券、每日保底）與靈石礦脈。數值全在 js/bonus-cfg.js
//  狀態存本機另一個 key（FANG_KEY），不進 S.d，所以不會隨雲端存檔上傳；舊存檔沒有這個 key＝全部預設值（礦脈首通未領）
//    seen 看過的最晚時間（防回撥）、day／earn 保底記帳的台北日序與當日靈石收入、
//    fDay／fEnd 首通放送觸發日與結束時間、tStart／tEnd 放送券開始與結束時間（tAfter＝延後時等的是哪個倍率）、tk 放送券張數、mDay／mN 礦脈今日日序與破關次數、mFirst 礦脈首通已領
//    gDay／gPz／gOld 抽卡每日上限的日序與今日轉珠召喚、舊機緣抽數
//  接法：包住既有函式（Stage.give／merge／sweep／onWin／rwText／dailyClaim、S.sign／offline／save／reset、UI.hud／map），不改原本邏輯
// ════════════════════════════════════════════

const FANG_KEY = 'staging_wendao_fang_v1';
Object.assign(PZ_MONS, MINE_MONS);
ICON_BALL.fang = ['放', '#ffcf5a'];
ICON_BALL.fang_tk = ['券', '#ffcf5a'];
ICON_BALL.fang_first = ['首', '#ffcf5a'];
ICON_BALL.fang_weekend = ['週', '#ffcf5a'];
ICON_BALL.icon_mine_entry = ['礦', '#3aa58a'];
ICON_BALL.icon_sign_entry = ['簽', '#c98a2a'];
const FANG_ICO = { first: 'fang_first', weekend: 'fang_weekend', ticket: 'fang_tk' };

const Bonus = {
  d: null,
  fresh() { return { seen: 0, day: -1, earn: 0, fDay: -1, fEnd: 0, tStart: 0, tEnd: 0, tAfter: 0, tk: 0, mDay: -1, mN: 0, mFirst: 0, gDay: -1, gPz: 0, gOld: 0 }; },
  load() {
    let p = {}; try { p = JSON.parse(localStorage.getItem(FANG_KEY)) || {}; } catch (e) {}
    const f = this.fresh();
    for (const k of Object.keys(f)) { const v = Number(p[k]); if (Number.isFinite(v)) f[k] = Math.floor(v); }
    f.tk = Math.max(0, f.tk); f.mN = Math.max(0, f.mN); f.earn = Math.max(0, f.earn);
    this.d = f;
  },
  save() { try { localStorage.setItem(FANG_KEY, JSON.stringify(this.d)); } catch (e) {} },
  reset() { try { localStorage.removeItem(FANG_KEY); } catch (e) {} this.d = this.fresh(); },

  // ───────── 時間 ─────────
  dayNo(t) { return Math.floor((t + DAILY_CFG.tzOffsetH * 36e5) / 864e5); },
  dayStart(no) { return no * 864e5 - DAILY_CFG.tzOffsetH * 36e5; },
  weekend(t) { return FANG_CFG.weekend.days.includes((this.dayNo(t) + 4) % 7); },   // 1970-01-01 是週四
  weekendEnd(t) { let no = this.dayNo(t) + 1; while (this.weekend(this.dayStart(no))) no++; return this.dayStart(no); },
  // 時間倒退：比看過的最晚時間早超過容許值 → true（不給任何放送）；否則記下最晚時間
  back(now = Date.now()) {
    if (now < this.d.seen - FANG_CFG.rollbackTol * 1000) return true;
    if (now > this.d.seen) this.d.seen = now;
    return false;
  },

  // ───────── 倍率 ─────────
  // 目前生效的放送，倍率高的在前
  active(now = Date.now()) {
    if (this.back(now)) return [];
    const d = this.d, a = [];
    if (d.fEnd > now) a.push({ k: 'first', name: '首通放送', mult: FANG_CFG.first.mult, end: d.fEnd });
    if (d.tEnd > now && d.tStart <= now) a.push({ k: 'ticket', name: '放送券', mult: FANG_CFG.ticket.mult, end: d.tEnd });
    if (this.weekend(now)) a.push({ k: 'weekend', name: '週末放送', mult: FANG_CFG.mult, end: this.weekendEnd(now) });
    return a.sort((x, y) => y.mult - x.mult);
  },
  mult(now) { const a = this.active(now); return a.length ? a[0].mult : 1; },   // 取最高，不相乘
  ok(kind) { return FANG_CFG.include.includes(kind) && !FANG_CFG.excludeFromBonus.includes(kind); },

  // ───────── 發放 ─────────
  // 來源已經發完 base 之後呼叫：補發放送加成、記帳，回傳加成量
  apply(base, kind) {
    if (!(base > 0)) return 0;
    let m = this.ok(kind) ? this.mult() : 1;
    if (kind === 'mine') m = Math.min(m, MINE_BONUS_CAP);   // 礦脈加成有上限
    const extra = Math.round(base * (m - 1));
    if (extra > 0) S.add('stone', extra);
    this.track(base + extra); return extra;
  },
  // 離線：只吃週末放送，且只算離線時段和週末重疊的部分
  offline(o) {
    const now = Date.now(), ms = o.sec * 1000;
    if (!(o.stone > 0) || !(ms > 0)) return 0;
    let ov = 0;
    if (!this.back(now) && this.ok('offline')) for (let t = now - ms; t < now;) { const n = Math.min(now, this.dayStart(this.dayNo(t) + 1)); if (this.weekend(t)) ov += n - t; t = n; }
    const extra = Math.round(o.stone * (ov / ms) * (FANG_CFG.mult - 1));
    if (extra > 0) S.add('stone', extra);
    this.track(o.stone + extra); return extra;
  },
  // 當日靈石收入（保底用）
  track(n) { this.settle(); this.d.earn += n; this.save(); },
  // 保底：換日後結算上一個有玩的日子，收入低於下限就補差額（最多 cap）
  settle() {
    const now = Date.now(), d = this.d, t = this.dayNo(now);
    if (d.day === t || this.back(now)) return 0;
    const F = FANG_CFG.floor, g = d.day >= 0 && t > d.day ? Math.max(0, Math.min(F.cap, F.min - d.earn)) : 0;
    if (g > 0) { S.add('stone', g); this.msg = `昨日靈石收入 ${U.fmt(d.earn)}，未達 ${U.fmt(F.min)}，保底補發 靈石 +${U.fmt(g)}`; }
    d.day = t; d.earn = 0; this.save(); return g;
  },
  // 每日第一次通關：開首通放送（當次通關的獎勵不加成）
  cleared() {
    const now = Date.now(), d = this.d, t = this.dayNo(now);
    if (this.back(now) || d.fDay === t) return false;
    d.fDay = t; d.fEnd = now + FANG_CFG.first.min * 6e4; this.save(); return true;
  },
  drop(p, n = 1) { let k = 0; for (let i = 0; i < n; i++) if (Math.random() < p) k++; if (k) { this.d.tk += k; this.save(); } return k; },
  useTicket() {
    const now = Date.now(), d = this.d;
    if (d.tk <= 0) return '沒有放送券';
    if (this.back(now)) return '手機時間早於上次紀錄，請先校正時間';
    d.tk--;
    if (d.tEnd > now) d.tEnd += FANG_CFG.ticket.min * 6e4;   // 已在跑或排隊中：時間疊加，倍率不疊加
    else {
      // 已有更高倍率：延到高倍率結束才開始計時，免得 20 分鐘被蓋掉白白浪費
      const hi = this.active(now).filter((x) => x.k !== 'ticket' && x.mult > FANG_CFG.ticket.mult);
      d.tStart = hi.length ? Math.max(...hi.map((x) => x.end)) : now; d.tAfter = hi.length ? Math.max(...hi.map((x) => x.mult)) : 0;
      d.tEnd = d.tStart + FANG_CFG.ticket.min * 6e4;
    }
    this.save(); return true;
  },

  // ───────── 介面 ─────────
  // 主畫面頂部：生效中顯示最高倍率與倒數；沒有放送但有券就顯示券數
  hud() {
    const hud = document.getElementById('hud'); if (!hud || !S.d) return;
    if (S.d.root && this.settle()) S.save();
    if (this.msg) { const m = this.msg; this.msg = ''; if (Stage.mapOn) Stage.toast(m); else UI.toast(m, '#ffe7a0'); }
    let el = document.getElementById('fangBar');
    if (!el) { el = document.createElement('button'); el.id = 'fangBar'; el.type = 'button'; el.onclick = () => this.panel(); hud.appendChild(el); }
    const a = this.active()[0], tk = this.d.tk;
    const html = !S.d.root ? '' : a ? `${gIco('ui', 'fang')}<b>${a.name} ×${a.mult}</b><small>${Stage.mmss(a.end - Date.now())}</small>`
      : tk ? `${gIco('ui', 'fang_tk')}<b>放送券 ×${tk}</b><small>點此使用</small>` : '';
    el.classList.toggle('hidden', !html);
    if (el._h !== html) { el.innerHTML = html; el._h = html; }
  },
  panel() {
    const a = this.active(), F = FANG_CFG, d = this.d, now = Date.now();
    const rows = a.length ? a.map((x, i) => `<div class="li">${gIco('ui', FANG_ICO[x.k])}<div><h4>${x.name}<em>×${x.mult}${i ? '（未採用）' : '（生效中）'}</em></h4><p>剩 ${Stage.mmss(x.end - now)}</p></div><span></span></div>`).join('')
      : '<p class="note" style="text-align:center">目前沒有放送</p>';
    UI.modal('超級大放送', `${rows}
      <div class="list"><div class="li">${gIco('ui', 'fang_tk')}<div><h4>放送券<em>×${d.tk}</em></h4><p>${d.tStart > now ? `<b class="fang-wait">將於 ×${d.tAfter} 結束後生效</b>（共 ${Stage.mmss(d.tEnd - d.tStart)}）<br>` : ''}${F.ticket.min} 分鐘 ×${F.ticket.mult}・時間可疊加・遇更高倍率延後開始</p></div><button class="seal sm" id="fangUse" ${d.tk ? '' : 'disabled'}>使用</button></div></div>
      <p class="note">・每日第一次通關任一關後 ${F.first.min} 分鐘 ×${F.first.mult}<br>・週六、週日全天 ×${F.mult}（離線只算週末時段）<br>・多個放送同時生效取最高，不相乘<br>・算進放送：轉珠通關、首通、掃蕩、離線、歷練、兩種簽到；靈石礦脈放送加成最高 ×${MINE_BONUS_CAP}；星塵兌換、任務不算<br>・保底：當日靈石收入未達 ${U.fmt(F.floor.min)}，隔天登入補發差額（最多 ${U.fmt(F.floor.cap)}）。今日已得 ${U.fmt(d.earn)}</p>
      <div class="row center"><button class="seal ghost" id="fangOk">知道了</button></div>`, {
      '#fangUse': () => { const r = this.useTicket(); if (r === true) { UI.toast(`放送券生效：${F.ticket.min} 分鐘靈石 ×${F.ticket.mult}`, '#ffe7a0'); this.hud(); this.panel(); } else UI.toast(r, '#ff9a9a'); },
      '#fangOk': () => UI.close(),
    });
  },
  // 轉珠地圖體力欄下方的小字
  mapLine() { const a = this.active()[0]; return a ? `<small class="pzm-fang">放送 ×${a.mult}・${Stage.mmss(a.end - Date.now())}</small>` : ''; },
};
Bonus.load();

// ════════ 靈石礦脈 ════════
const Mine = {
  st: { ...MINE_STAGE, stars: [{ t: 'clear' }], ch: { ...PZ_CHAPTERS[0], bg: MINE_STAGE.bg } },
  open() { return !!(S.d && S.d.cleared && S.d.cleared[MINE_CFG.unlock]); },
  // 今日破關次數；換日重置（時間倒退時不重置）
  today() { const d = Bonus.d, t = Bonus.dayNo(Date.now()); if (d.mDay !== t && !Bonus.back()) { d.mDay = t; d.mN = 0; Bonus.save(); } return d.mN; },
  left() { return Math.max(0, MINE_CFG.daily - this.today()); },
  kFor(lv, T = pzTeam()) {
    const K = MINE_CFG.scale, hero = T.find((m) => m.id === 'hero') || T[0], sum = T.reduce((a, m) => a + (m.atk || 0), 0);
    const team = hero && hero.atk > 0 ? Math.max(1, sum / hero.atk) : 1;
    return U.clamp(K.base * Math.pow(K.step, lv - K.ref) * Math.pow(team, K.team || 0), K.min, K.max);
  },
  play() {
    if (!this.open()) return Stage.toast('通過青冥宗三場試劍後開放'), false;
    if (!this.left()) return Stage.toast('今日礦脈次數已用完，明天再來'), false;
    if (!Stage.spend(this.st.cost)) { Stage.noSta(this.st.cost); return false; }
    this.st.k = this.kFor(S.d.lv); Stage.hideMap(); Puzzle.open({ stage: this.st }); return true;
  },
  // 破關：固定靈石，放送加成最高 ×MINE_BONUS_CAP；回傳 Stage.onWin 同格式
  onWin() {
    const d = Bonus.d, firstClear = !d.mFirst, add = MINE_CFG.stone + (firstClear ? MINE_CFG.first : 0);
    this.today(); d.mN++; d.mFirst = 1;
    S.add('stone', add); const bonus = Bonus.apply(add, 'mine'); S.save();
    if (typeof UI !== 'undefined' && UI.hud) UI.hud();
    return { got: 1, newStars: firstClear ? 1 : 0, all: 1, firstClear, first: firstClear ? { stone: MINE_CFG.first, exp: 0, items: {} } : null, rw: { stone: add, bonus, exp: 0, items: {}, mineDay: d.mN } };
  },
  detail() {
    if (!this.open()) { Stage.toast('通過青冥宗三場試劍後開放'); return; }
    const st = this.st, n = this.today(), first = !Bonus.d.mFirst;
    const mons = st.waves.map((w, i) => `<li><em>${i === st.waves.length - 1 ? '首領' : `第 ${i + 1} 波`}</em>${w.map((m) => { const M = PZ_MONS[m]; return `<span style="--c:${PZ_EL[M.el].c}">${pzElI(M.el, 'pz-el')}${M.name}</span>`; }).join('')}</li>`).join('');
    Stage.panel(`<h3>${st.name}</h3><ul class="pzm-waves">${mons}</ul><p class="c pzm-tip">${st.tip}</p>
      ${typeof Roster !== 'undefined' ? Roster.summary() : ''}
      <p class="pzm-rw"><b>獎勵</b>${Stage.rwText({ stone: MINE_CFG.stone, exp: 0, items: {} })}</p>
      <p class="pzm-rw${first ? '' : ' done'}"><b>${first ? '首通' : '首通・已領'}</b>${Stage.rwText({ stone: MINE_CFG.first, exp: 0, items: {} })}</p>
      <p class="c note">進場體力 ${st.cost}・失敗不退・放送加成最高 ×${MINE_BONUS_CAP}<br>今日破關 ${n} / ${MINE_CFG.daily}・體力 ${Stage.sta()} / ${STA_CFG.max}</p>`,
    [[`出戰（${st.cost}）`, () => { Stage.closePanel(); this.play(); }, 'go', n >= MINE_CFG.daily], ...(typeof Roster !== 'undefined' ? [['編隊', () => Roster.editor(() => this.detail())]] : []), ['關閉', () => Stage.closePanel()]]);
  },
};

// ════════ 接到既有流程 ════════
(() => {
  const give0 = Stage.give.bind(Stage), merge0 = Stage.merge.bind(Stage), sweep0 = Stage.sweep.bind(Stage), win0 = Stage.onWin.bind(Stage), rt0 = Stage.rwText.bind(Stage), dc0 = Stage.dailyClaim.bind(Stage);
  // 轉珠通關（有 cost 的是關卡本身，沒有的是首通獎勵）與掃蕩
  Stage.give = (rw) => { const o = give0(rw); if (o.stone) o.bonus = Bonus.apply(o.stone, Bonus.kind || (rw.cost ? 'stage' : 'first')); return o; };
  Stage.merge = (a, b) => { const o = merge0(a, b); o.bonus = (a.bonus || 0) + (b.bonus || 0); o.tk = (a.tk || 0) + (b.tk || 0); return o; };
  Stage.sweep = (id, n) => {
    Bonus.kind = 'sweep'; let r; try { r = sweep0(id, n); } finally { Bonus.kind = null; }
    if (r.ok) { const k = Bonus.drop(FANG_CFG.ticket.sweepDrop, r.n); if (k) r.rw.tk = (r.rw.tk || 0) + k; }
    return r;
  };
  Stage.onWin = (id, r) => {
    if (id === Mine.st.id) { if (typeof PzStory !== 'undefined') PzStory.pending = []; const W = Mine.onWin(r); if (Bonus.cleared()) W.rw.fang = 1; return W; }
    const W = win0(id, r), k = Bonus.drop(FANG_CFG.ticket.drop);
    if (k) W.rw.tk = (W.rw.tk || 0) + k;
    if (Bonus.cleared()) W.rw.fang = 1;
    return W;
  };
  Stage.rwText = (o) => {
    let s = rt0(o);
    if (o.bonus) s += `、<wbr><span class="pz-rw fang-rw">${gIco('ui', 'fang')}放送加成 +${U.fmt(o.bonus)}</span>`;
    if (o.tk) s += `、<wbr><span class="pz-rw fang-rw">${gIco('ui', 'fang_tk')}放送券 ×${o.tk}</span>`;
    if (o.mineDay) s += `<br><small class="mine-day">今日 ${o.mineDay} / ${MINE_CFG.daily}</small>`;
    if (o.fang) s += `<br><small class="fang-on">今日首次通關：接下來 ${FANG_CFG.first.min} 分鐘靈石 ×${FANG_CFG.first.mult}</small>`;
    return s;
  };
  Stage.dailyClaim = () => { const r = dc0(); if (r && r.stone) { r.stone += Bonus.apply(r.stone, 'daily'); S.save(); } return r; };

  const sign0 = S.sign.bind(S), off0 = S.offline.bind(S), save0 = S.save.bind(S), reset0 = S.reset.bind(S);
  S.sign = () => { const n = sign0(); if (!n) return n; const x = Bonus.apply(n, 'sign'); S.save(); return n + x; };
  S.offline = () => { const o = off0(); if (o) { o.bonus = Bonus.offline(o); o.stone += o.bonus; } return o; };
  S.save = () => { save0(); if (Bonus.d) { Bonus.back(); Bonus.save(); } };
  S.reset = () => { reset0(); Bonus.reset(); };

  const hud0 = UI.hud.bind(UI), map0 = UI.map, sta0 = Stage.staHud.bind(Stage), rm0 = Stage.renderMap.bind(Stage);
  UI.hud = () => { hud0(); Bonus.hud(); };
  // 突破／渡劫演出期間隱藏頂部放送條（不擋演出畫面）
  const bs0 = Story._breakShow.bind(Story);
  Story._breakShow = async (...a) => { document.body.classList.add('fang-off'); try { return await bs0(...a); } finally { document.body.classList.remove('fang-off'); } };
  Stage.staHud = () => { sta0(); const el = Stage.el && Stage.el.querySelector('#pzmSta'); if (el) el.insertAdjacentHTML('beforeend', Bonus.mapLine()); };
  // 歷練頁：轉珠關卡入口下方
  UI.map = function () {
    map0.apply(this, arguments);
    const pz = document.getElementById('pzEntry'); if (!pz) return;
    const b = document.createElement('button'), open = Mine.open();
    b.className = `region${open ? '' : ' locked'}`; b.id = 'mineEntry';
    // 入口：洞口去背圖靠右，疊在暗色水晶洞（中段背景）上，左邊留給標題；沒有洞口圖就只用背景
    b.style.cssText = pzHas('entry_mine') ? `background-image:url(assets/ui/entry_mine.webp),linear-gradient(rgba(5,8,14,.35),rgba(5,8,14,.35)),url(${MINE_STAGE.bg[1]});background-size:auto 112%,cover,cover;background-position:right -6px bottom -4px,0 0,50% 55%;background-repeat:no-repeat`
      : `background-image:url(${MINE_STAGE.bg[1]});background-position:50% 55%`;
    b.innerHTML = `<h4>${MINE_STAGE.name}</h4><p>${open ? `每次破關 靈石 ${U.fmt(MINE_CFG.stone)}・放送加成最高 ×${MINE_BONUS_CAP}` : '通過青冥宗三場試劍後開放'}</p><span class="prog">${open ? `今日 ${Mine.today()} / ${MINE_CFG.daily}` : ''}</span>`;
    b.onclick = () => { if (!open) { UI.toast('通過青冥宗三場試劍後開放', '#ffe7a0'); return; } Stage.showMap(1); Mine.detail(); };
    pz.after(b);
  };
  // 轉珠地圖：右緣浮動鈕多一顆「礦脈」
  Stage.renderMap = () => {
    rm0();
    if (!Mine.open()) return;
    Stage.el.insertAdjacentHTML('beforeend', `<button class="pzm-gacha pzm-daily pzm-mine" id="pzmMine" aria-label="靈石礦脈">${gIco('ui', 'icon_mine_entry')}<b>礦脈</b></button>`);
    Stage.el.querySelector('#pzmMine').onclick = () => Mine.detail();
  };
})();

// ════════ 抽卡每日上限（數值 GACHA_CFG.dailyMax）：只擋抽數，星塵與保底計數照原本流程 ════════
const GachaCap = {
  // 今日已抽；換日重置（時間倒退時不重置）
  used(k) { const d = Bonus.d, t = Bonus.dayNo(Date.now()); if (d.gDay !== t && !Bonus.back()) { d.gDay = t; d.gPz = 0; d.gOld = 0; Bonus.save(); } return k === 'pz' ? d.gPz : d.gOld; },
  left(k) { return Math.max(0, GACHA_CFG.dailyMax[k] - this.used(k)); },
  add(k, n) { this.used(k); Bonus.d[k === 'pz' ? 'gPz' : 'gOld'] += n; Bonus.save(); },
  why(k, n) { const l = this.left(k); return l <= 0 ? '今日召喚已達上限' : n > l ? `今日只剩 ${l} 抽` : ''; },
  line(k) { const l = this.left(k); return l ? `今日召喚 ${GACHA_CFG.dailyMax[k] - l} / ${GACHA_CFG.dailyMax[k]}` : '今日召喚已達上限'; },
};
(() => {
  // 轉珠仙緣召喚
  const pull0 = Gacha.pull.bind(Gacha), render0 = Gacha.render.bind(Gacha);
  Gacha.pull = (n) => { const w = GachaCap.why('pz', n); if (w) return { err: w }; const r = pull0(n); if (!r.err) GachaCap.add('pz', n); return r; };
  Gacha.render = () => {
    render0();
    Gacha.el.querySelectorAll('.ga-pull').forEach((b) => { b.disabled = !!GachaCap.why('pz', +b.dataset.n); });
    const box = Gacha.el.querySelector('.ga-btns'); if (box) box.insertAdjacentHTML('afterend', `<p class="ga-cap${GachaCap.left('pz') ? '' : ' full'}">${GachaCap.line('pz')}</p>`);
  };
  // 舊機緣（法寶池、功法池共用一個上限）
  const draw0 = S.draw.bind(S), uiDraw0 = UI.draw.bind(UI), uiPull0 = UI.pull.bind(UI);
  S.draw = (pool, n) => { if (GachaCap.why('old', n)) return null; const r = draw0(pool, n); if (r) GachaCap.add('old', n); return r; };
  UI.pull = (n) => { const w = GachaCap.why('old', n); if (w) { UI.toast(w, '#ff9a9a'); return; } return uiPull0(n); };
  UI.draw = (pool) => {
    uiDraw0(pool);
    [['#g1', 1], ['#g10', 10]].forEach(([s, n]) => { const b = document.querySelector(s); if (b) b.disabled = !!GachaCap.why('old', n); });
    const box = document.querySelector('.gacha-btns'); if (box) box.insertAdjacentHTML('afterend', `<p class="note ga-cap${GachaCap.left('old') ? '' : ' full'}" style="text-align:center">${GachaCap.line('old')}</p>`);
  };
})();
