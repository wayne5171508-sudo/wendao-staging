'use strict';
// ════════════════════════════════════════════
//  道侶系統（選用功能，單人遊玩不受影響）
//  ・可玩角色：男主、女修（立繪由外部提供，見 CHARACTERS.assetDir）
//  ・道侶關係：締結、解除、親密度、雙修靈力、道侶印記、共鳴
//  ・合修室：靈泉洞府、雲床仙府（材料解鎖、風格切換、邀請、單人／雙人判斷）
//  ・雙修演出：五階段狀態機（可跳過、可加速、可選強度），每階段只觸發事件 ID，畫面由外部素材處理
//  ・連線：DaoNet 為接口，目前是單機版本（道侶一律視為離線；設定頁可開「模擬道侶在線」測試）
// ════════════════════════════════════════════

// ───────── 角色 ─────────
// assetDir：該角色的立繪資料夾。檔名與 assets/hero/ 相同的圖放進去就會自動取代（沒有的沿用男主圖並在 console 警告一次）
// textSub：劇情文字替換（劇本原本以男主撰寫）
const CHARACTERS = {
  // faxiang：突破成功時的法相圖（純黑底，screen 混合）；不在素材清單就不顯示法相，只有光環、雷光與閃光
  qingyuan: { id: 'qingyuan', name: '林清遠', given: '清遠', gender: 'm', assetDir: 'assets/hero/', faxiang: 'assets/fx/faxiang.webp', textSub: [] },
  // sword：該角色立繪的寬高比與劍身座標 [劍柄x,y, 劍尖x,y]（圖內比例），覆蓋 HERO_SWORD；castDir：施法立繪資料夾（缺圖就不顯示施法切入）
  yunxi: { id: 'yunxi', name: '蘇雲汐', given: '雲汐', gender: 'f', assetDir: 'assets/hero_yunxi/', castDir: 'assets/cast_yunxi/', faxiang: 'assets/fx/faxiang_yunxi.webp',
    sword: { hold: { ar: 683 / 1100, blade: [0.25, 0.57, 0.03, 0.95] }, sit: { ar: 816 / 665, blade: [0.06, 0.69, 0.94, 0.69] }, back: { ar: 847 / 726, hilt: null },
      bhold: { ar: 1118 / 748, blade: [0.21, 0.49, 0.0, 0.75] }, bstance: { ar: 1020 / 775, blade: [0.665, 0.632, 0.925, 0.9] }, blean: { ar: 1652 / 1100, blade: [0.524, 0.449, 0.98, 0.825] } },
    ar: { hold_nitian: 1260 / 1100 },
    textSub: [['林清遠', '蘇雲汐'], ['清遠', '雲汐'], ['少年', '少女'], ['他在石階', '她在石階'], ['他出生那夜', '她出生那夜'], ['小師弟', '小師妹'], ['林母', '蘇母']] },
};

// ───────── 道侶設定（數值集中在這裡調整） ─────────
const DAO = {
  // 親密度等級：門檻、名稱；等級決定雙修加成、可選強度、可解鎖的演出細節旗標
  levels: [
    { at: 0, name: '初識' }, { at: 50, name: '相知' }, { at: 150, name: '相惜' },
    { at: 300, name: '傾心' }, { at: 600, name: '同心' }, { at: 1000, name: '道合' },
  ],
  // 強度：need 為需要的親密度等級
  intensity: [
    { id: 'mild', name: '適中', need: 0 },
    { id: 'direct', name: '直白', need: 2 },
    { id: 'full', name: '完全', need: 4 },
  ],
  // 演出細節旗標：親密度達到 lv 時解鎖（外部素材依旗標決定要播的版本）
  detailFlags: [
    { id: 'detail_1', lv: 1 }, { id: 'detail_2', lv: 2 }, { id: 'detail_3', lv: 3 }, { id: 'detail_4', lv: 4 }, { id: 'detail_5', lv: 5 },
  ],
  // 雙修演出五階段；dur 為基本秒數（加速時減半）
  stages: [
    { id: 'approach', name: '進入與靠近', dur: 4 },
    { id: 'unveil', name: '解開與敞開', dur: 4 },
    { id: 'merge', name: '交融', dur: 5 },
    { id: 'climax', name: '修為爆發', dur: 3 },
    { id: 'afterglow', name: '餘韻', dur: 4 },
  ],
  // 親密度來源
  gain: { explore: 3, dual: { mild: 8, direct: 10, full: 12 }, resonance: 5 },
  // 贈送靈物：物品 id → 親密度
  gifts: { herb_q: 1, herb_c: 1, herb_b: 3, herb_l: 5, star: 8, p_qi: 4, p_heal: 3, p_break: 8, p_zhuji: 15, p_zao: 30 },
  giftDaily: 10,          // 每日最多贈送次數
  // 雙修邀請不限每日次數，但獎勵每日遞減：當天第 1 次 100%、第 2 次 50%、第 3 次起 25%（today.dual 每日零點重置）。單人閉關不受影響。
  dualDecay: [1, 0.5, 0.25],
  dualRatio: (n) => DAO.dualDecay[Math.min(n, DAO.dualDecay.length - 1)],   // n＝今天已雙修幾次（0 起算）
  soloSec: 90,            // 單人閉關：相當於幾息的自然修煉 × 合修室加成
  dualSec: 180,           // 雙修：相當於幾息的自然修煉 × 雙修倍率
  dualMult: (lv) => 2.5 + lv * 0.25,   // 親密度越高倍率越高
  resonance: (lv) => 0.1 + lv * 0.03,  // 道侶共鳴機率
  wuxCap: 0.2, xinCap: 0.1,           // 悟性（修煉速度）、心魔抗性（突破成功率）累積上限
  qiPerDual: 10, qiStreak: 5,          // 每次雙修得雙修靈力；連日雙修額外加成
  markCost: (lv) => 100 * (lv + 1), markMax: 10, markStat: 0.02,   // 道侶印記：每級攻擊、氣血 +2%
  // 共同技能（系統先預留解鎖旗標，戰鬥效果之後接）
  // hidden：效果還沒接上的技能先不顯示、也不能領悟（同心訣做好後拿掉 hidden）
  skills: [{ id: 'tongxin', name: '同心訣', cost: 200, desc: '道侶同場時，雙方靈力回復提升（效果待接入）', hidden: true }],
};

// 合修室：解鎖材料、靈石維持費（靈氣消耗）、風格（scene 為外部場景資源 ID）
const DUAL_ROOMS = [
  { id: 'lingquan', name: '靈泉洞府', bonus: 1.5, upkeep: 100, need: { herb_b: 6, ore: 10 }, stone: 3000, desc: '洞中靈泉氤氳，最宜調息。',
    styles: [{ id: 'moon', name: '月照靈泉' }, { id: 'mist', name: '霧鎖清潭' }, { id: 'autumn', name: '秋楓石泉' }] },
  { id: 'yunchuang', name: '雲床仙府', bonus: 1.8, upkeep: 200, need: { herb_l: 4, star: 3 }, stone: 8000, desc: '雲為床、霞為帳，仙府懸於九天。',
    styles: [{ id: 'cloud', name: '流雲錦帳' }, { id: 'dawn', name: '朝霞仙榻' }, { id: 'starry', name: '星河天幕' }] },
];
const roomScene = (room, style) => `room_${room}_${style}`;   // 外部場景資源 ID
// 場景 ID → 顯示名稱（例如 room_lingquan_moon → 月照靈泉）；畫面只顯示名稱，內部 ID 不外露
const SCENE_NAME = Object.fromEntries(DUAL_ROOMS.flatMap((R) => R.styles.map((st) => [roomScene(R.id, st.id), st.name])));

// ════════ 連線接口（目前單機） ════════
// 之後接 Firebase／Supabase 時，只要實作同名方法：online()、invite()、send()；收到事件呼叫 Dao.onNet(evt)
// 單機版：道侶一律離線；送出的事件（贈禮、邀請、狀態）先放進 outbox，接上連線後再補送
const DaoNet = {
  online() { return DEV && !!(S.d.dao && S.d.dao.simOnline); },   // 測試用「模擬道侶在線」（只在開發模式有效）
  async invite(roomId) {
    if (!this.online()) return { ok: false, reason: 'offline' };
    return { ok: true };   // 模擬：在線就直接接受
  },
  send(evt) { const o = S.d.dao.outbox; o.push({ ...evt, t: Date.now() }); if (o.length > 50) o.splice(0, o.length - 50); },
};

// ════════ 道侶邏輯 ════════
const Dao = {
  fresh() {
    return { char: 'qingyuan', pid: Math.random().toString(36).slice(2, 10).toUpperCase(), partner: null, intimacy: 0, dualQi: 0, mark: 0, skills: {},
      wux: 0, xin: 0, rooms: {}, sessions: 0, streak: 0, lastDual: '', today: { date: '', dual: 0, gift: 0 }, outbox: [], simOnline: false, log: [] };
  },
  // 載入存檔時補欄位、修正異常
  fix(d) {
    const f = this.fresh(); d.dao = Object.assign(f, d.dao && typeof d.dao === 'object' ? d.dao : {});
    const g = d.dao; if (!CHARACTERS[g.char]) g.char = 'qingyuan';
    for (const k of ['intimacy', 'dualQi', 'mark', 'wux', 'xin', 'sessions', 'streak']) { g[k] = Number(g[k]); if (!Number.isFinite(g[k]) || g[k] < 0) g[k] = 0; }
    g.mark = Math.min(DAO.markMax, Math.floor(g.mark)); g.wux = Math.min(DAO.wuxCap, g.wux); g.xin = Math.min(DAO.xinCap, g.xin);
    g.today = Object.assign({ date: '', dual: 0, gift: 0 }, g.today && typeof g.today === 'object' ? g.today : {});
    for (const k of ['dual', 'gift']) { g.today[k] = Number(g.today[k]); if (!Number.isFinite(g.today[k]) || g.today[k] < 0) g.today[k] = 0; }   // 舊存檔沒有今日次數：預設 0
    if (!Array.isArray(g.outbox)) g.outbox = []; if (!Array.isArray(g.log)) g.log = [];
    if (g.partner && !CHARACTERS[g.partner.char]) g.partner.char = g.char === 'yunxi' ? 'qingyuan' : 'yunxi';   // 舊存檔沒有道侶角色
    if (g.partner && /[<>"]/.test(g.partner.name)) g.partner.name = escHtml(g.partner.name);   // 舊存檔裡未跳脫的道侶名字
    for (const R of DUAL_ROOMS) { const r = g.rooms[R.id]; if (r && !R.styles.some((s) => s.id === r.style)) r.style = R.styles[0].id; }
  },
  get g() { return S.d.dao; },
  today() { const t = this.g.today; if (t.date !== U.today()) Object.assign(t, { date: U.today(), dual: 0, gift: 0 }); return t; },
  lv() { let l = 0; DAO.levels.forEach((L, i) => { if (this.g.intimacy >= L.at) l = i; }); return l; },
  lvName() { return DAO.levels[this.lv()].name; },
  nextAt() { const n = DAO.levels[this.lv() + 1]; return n ? n.at : null; },
  flags() { const l = this.lv(); return DAO.detailFlags.filter((f) => l >= f.lv).map((f) => f.id); },
  intensities() { const l = this.lv(); return DAO.intensity.map((x) => ({ ...x, open: l >= x.need })); },
  addIntimacy(n, why) { if (!this.g.partner) return 0; this.g.intimacy += n; this.note(`${why}，親密度 +${n}`); return n; },
  note(s) { const l = this.g.log; l.unshift({ t: Date.now(), s }); if (l.length > 20) l.length = 20; },

  // 締結：需通過青冥宗試劍（在宗門廣場締結）；partner 為對方的道號與編號（單機版手動輸入）
  canBond() { return !this.g.partner && !!S.d.cleared['sect-2']; },
  bond(name, pid) {
    name = String(name || '').trim().slice(0, 8); pid = String(pid || '').trim().toUpperCase().slice(0, 12);
    if (!this.canBond()) return '需先通過青冥宗試劍，於宗門廣場締結';
    if (!name) return '請輸入道侶的道號';
    this.g.partner = { name, pid: pid || null, char: this.otherChar(), since: Date.now() }; this.g.intimacy = 0;
    DaoNet.send({ type: 'bond', name: HERO_NAME, pid: this.g.pid });
    this.note(`與${name}結為道侶`); S.save(); return true;
  },
  // 連線締結成功（雙方都呼叫）
  // 道侶的角色：雲端由對方資料帶入；單機與舊存檔預設為和自己相反的角色
  otherChar() { return this.g.char === 'yunxi' ? 'qingyuan' : 'yunxi'; },
  bondWith(P) { this.g.partner = { name: P.name, pid: P.pid || null, uid: P.uid || null, char: CHARACTERS[P.char] ? P.char : this.otherChar(), since: Date.now() }; this.g.intimacy = 0; this.note(`與${P.name}結為道侶`); S.save(); },
  // 解除：親密度歸零；合修室、雙修靈力、印記、悟性心魔抗性保留（屬於自己的修行）
  unbond(silent) {
    if (!this.g.partner) return false;
    if (!silent) DaoNet.send({ type: 'unbond', pid: this.g.pid });
    this.note(`與${this.g.partner.name}解除道侶`); this.g.partner = null; this.g.intimacy = 0; this.g.streak = 0; S.save(); return true;
  },
  gift(id) {
    if (!this.g.partner) return '尚無道侶';
    const v = DAO.gifts[id]; if (!v) return '此物不可贈送';
    if (this.today().gift >= DAO.giftDaily) return `今日已贈送 ${DAO.giftDaily} 次`;
    if (!S.take(id)) return `${ITEMS[id].name}不足`;
    this.today().gift++; this.addIntimacy(v, `贈送${ITEMS[id].name}`);
    DaoNet.send({ type: 'gift', item: id }); S.save(); return true;
  },
  // 一起探索：道侶在線（同行）時戰鬥勝利提升親密度
  onExplore() { if (this.g.partner && DaoNet.online()) { this.addIntimacy(DAO.gain.explore, '與道侶一同歷練'); return true; } return false; },

  // ───────── 合修室 ─────────
  room(id) { return DUAL_ROOMS.find((r) => r.id === id); },
  owned(id) { return !!this.g.rooms[id]; },
  canUnlock(R) { return !this.owned(R.id) && Object.entries(R.need).every(([k, n]) => S.has(k, n)) && S.has('stone', R.stone); },
  unlock(id) {
    const R = this.room(id); if (!R || !this.canUnlock(R)) return false;
    for (const [k, n] of Object.entries(R.need)) S.take(k, n); S.take('stone', R.stone);
    this.g.rooms[id] = { style: R.styles[0].id, uses: 0 }; this.note(`開闢${R.name}`); S.save(); return true;
  },
  setStyle(id, style) { const r = this.g.rooms[id], R = this.room(id); if (!r || !R.styles.some((s) => s.id === style)) return false; r.style = style; S.save(); return true; },
  scene(id) { return roomScene(id, this.g.rooms[id] ? this.g.rooms[id].style : this.room(id).styles[0].id); },
  // 單人／雙人判斷
  mode() { return this.g.partner && DaoNet.online() ? 'dual' : 'solo'; },

  // 單人閉關：無雙修加成，只有合修室加成；回傳結果
  solo(id) {
    const R = this.room(id); if (!this.owned(id)) return null;
    const cost = R.upkeep * (1 + Math.floor(S.d.lv / 3)); if (!S.take('stone', cost)) return { err: `靈石不足（需 ${cost}）` };
    const before = S.d.exp; S.addExp(S.rate() * DAO.soloSec * R.bonus); this.g.rooms[id].uses++;
    S.save(); return { exp: S.d.exp - before, cost };
  },
  // 雙修結算（演出結束或跳過時呼叫一次）
  dualResult(id, intensity, guest) {
    const R = this.room(id), g = this.g, t = this.today(), lv = this.lv(), cost = guest ? 0 : R.upkeep * (1 + Math.floor(S.d.lv / 3)) * 2;
    if (!S.take('stone', cost)) return { err: `靈石不足（需 ${cost}）` };
    const ratio = DAO.dualRatio(t.dual);
    t.dual++; g.sessions++; if (g.rooms[id]) g.rooms[id].uses++;
    const before = S.d.exp; S.addExp(S.rate() * DAO.dualSec * R.bonus * DAO.dualMult(lv) * ratio);
    const yest = new Date(Date.now() - 864e5), ys = `${yest.getFullYear()}-${yest.getMonth() + 1}-${yest.getDate()}`;
    g.streak = g.lastDual === U.today() ? g.streak : g.lastDual === ys ? g.streak + 1 : 1; g.lastDual = U.today();
    const qi = Math.round((DAO.qiPerDual + (g.streak > 1 ? DAO.qiStreak * Math.min(5, g.streak - 1) : 0)) * ratio); g.dualQi += qi;
    let inti = this.addIntimacy(Math.max(1, Math.round((DAO.gain.dual[intensity] || DAO.gain.dual.mild) * ratio)), '雙修');
    let res = null;
    if (Math.random() < DAO.resonance(lv)) {   // 道侶共鳴：悟性或心魔抗性（各有上限，滿了給另一種）
      const wFull = g.wux >= DAO.wuxCap, xFull = g.xin >= DAO.xinCap;
      if (!(wFull && xFull)) {
        const pickW = xFull || (!wFull && Math.random() < 0.5);
        if (pickW) { g.wux = Math.min(DAO.wuxCap, g.wux + 0.01); res = { type: 'wux', name: '悟性', text: '修煉速度 +1%' }; }
        else { g.xin = Math.min(DAO.xinCap, g.xin + 0.01); res = { type: 'xin', name: '心魔抗性', text: '突破成功率 +1%' }; }
      }
      inti += this.addIntimacy(DAO.gain.resonance, '道侶共鳴');
    }
    DaoNet.send({ type: 'dual', room: id, intensity });
    S.save();
    return { exp: S.d.exp - before, cost, qi, intimacy: inti, resonance: res, streak: g.streak, ratio, nth: t.dual };
  },
  // 道侶印記與共同技能（消耗雙修靈力）
  upMark() { const c = DAO.markCost(this.g.mark); if (this.g.mark >= DAO.markMax || this.g.dualQi < c) return false; this.g.dualQi -= c; this.g.mark++; S.save(); return true; },
  learnSkill(id) { const k = DAO.skills.find((x) => x.id === id); if (!k || k.hidden || this.g.skills[id] || this.g.dualQi < k.cost) return false; this.g.dualQi -= k.cost; this.g.skills[id] = true; S.save(); return true; },
};

// ════════ 雙修演出狀態機 ════════
// 狀態：idle → playing（逐階段）→ done；可 skip()、setSpeed()；每階段開始時 emit('dual:stage', {...})
// 外部演出接上 DualShow.on(fn)；fn 會收到 { room, style, scene, stage, intensity, flags, anim, fx }
// 預設處理：顯示階段卡片（若 assets/dual/<room>/<stage>_<intensity>.webp 存在則顯示圖）
const DualShow = {
  state: 'idle', handlers: [],
  on(fn) { this.handlers.push(fn); },
  emit(evt) { for (const fn of this.handlers) { try { fn(evt); } catch (e) { console.warn('[雙修演出] 外部處理錯誤', e); } } },
  // 回傳 Promise：演出結束（含跳過）時 resolve
  play(roomId, intensity, speed = 1, style0) {
    const g = Dao.g, style = style0 || (g.rooms[roomId] ? g.rooms[roomId].style : Dao.room(roomId).styles[0].id), flags = Dao.flags();
    this.state = 'playing'; this.speed = speed; this.skipFlag = false; this.idx = -1;
    this.ctx = { room: roomId, style, scene: roomScene(roomId, style), intensity, flags };
    return new Promise(async (done) => {
      for (let i = 0; i < DAO.stages.length && !this.skipFlag; i++) {
        this.idx = i; const st = DAO.stages[i];
        this.emit({ ...this.ctx, stage: st.id, stageName: st.name, index: i, anim: `dual_${roomId}_${st.id}_${intensity}`, fx: `fx_dual_${st.id}` });
        const end = Date.now() + (st.dur * 1000) / this.speed;
        while (Date.now() < end && !this.skipFlag) { await U.wait(80); }
      }
      this.state = 'done'; this.emit({ ...this.ctx, stage: 'end', index: DAO.stages.length }); done(!this.skipFlag);
    });
  },
  skip() { this.skipFlag = true; },
  setSpeed(s) { this.speed = s; },
};
// 外部文字（選用）：assets/dual/text.json，格式 { "<stage>_<intensity>": "文字", "<stage>": "文字" }
let DUAL_TEXT = null;
const DUAL_TEXT_DEFAULT = {
  approach: '靈霧繚繞，兩人相擁而立，額頭輕抵。', unveil: '靈氣如絲纏繞周身，衣袂翻飛，再無阻隔。', merge: '緊緊相擁，神識相依，兩股真元緩緩交融。',
  climax: '靈力奔湧如潮，修為一舉衝開關竅！', afterglow: '雲收霧散，兩人仍相擁不放，相視一笑，道心更堅。',
};
const dualText = (stage, intensity) => (DUAL_TEXT && (DUAL_TEXT[`${stage}_${intensity}`] || DUAL_TEXT[stage])) || DUAL_TEXT_DEFAULT[stage] || '';
fetch('assets/dual/text.json').then((r) => (r.ok ? r.json() : null)).then((j) => (DUAL_TEXT = j)).catch(() => {});

// ════════ 加成接到角色屬性 ════════
(() => {
  const rate0 = S.rate.bind(S), br0 = S.breakRate.bind(S), st0 = S.stats.bind(S), load0 = S.load.bind(S), imp0 = S.importText.bind(S), fresh0 = S.fresh.bind(S);
  S.fresh = () => { const d = fresh0(); d.dao = Dao.fresh(); return d; };
  // 道侶資料壞掉時只重設道侶資料（保留角色），不讓整個遊戲開不起來
  S.load = () => { const r = load0(); try { Dao.fix(S.d); } catch (e) { console.warn('[存檔] 道侶資料損毀，已重設', e); S.backupRaw(); const ch = S.d.dao && S.d.dao.char; S.d.dao = Dao.fresh(); if (CHARACTERS[ch]) S.d.dao.char = ch; S.loadError = S.recovered = true; } return r; };
  S.importText = (t) => { const r = imp0(t); if (r === true) { Dao.fix(S.d); S.save(); } return r; };
  S.rate = () => rate0() * (1 + (S.d.dao ? S.d.dao.wux : 0));                    // 悟性
  S.breakRate = (u) => Math.min(0.98, br0(u) + (S.d.dao ? S.d.dao.xin : 0));      // 心魔抗性
  S.stats = () => {                                                                 // 道侶印記
    const s = st0(), m = S.d.dao ? S.d.dao.mark * DAO.markStat : 0; if (!m) return s;
    s.hp = Math.round(s.hp * (1 + m)); s.atk = Math.round(s.atk * (1 + m)); s.power = Math.round(s.hp * 0.2 + s.atk * 3 + s.def * 2); return s;
  };
})();

// ════════ 角色切換：名稱、劇情文字、立繪路徑 ════════
const Char = {
  cur() { return CHARACTERS[(S.d && S.d.dao && S.d.dao.char) || 'qingyuan']; },
  warned: {},
  // 立繪路徑：assets/hero/xxx → 該角色資料夾的同名檔（存在才換）
  path(src) {
    const C = this.cur(); if (!src || C.assetDir === 'assets/hero/' || !src.startsWith('assets/hero/')) return src;
    const p = C.assetDir + src.slice('assets/hero/'.length);
    if (typeof ASSET_LIST !== 'undefined' && ASSET_LIST.includes(p)) return p;
    if (!this.warned[p]) { this.warned[p] = 1; console.warn(`[角色] ${C.name} 缺少立繪 ${p}，暫用男主圖`); }
    return src;
  },
  text(s) {
    const C = this.cur(); for (const [a, b] of C.textSub) s = s.split(a).join(b);
    // 自訂名字：劇本裡的全名與名（例如「蘇雲汐」「雲汐」）一次換成新名字。
    // 必須單次替換：分兩次換時，新名字若含原本的名（如「雲汐二號」）會被第二次再換一遍，變成「雲汐二號二號」
    if (S.d && S.d.name) { const n = escHtml(S.d.name), q = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); s = s.replace(new RegExp(`${q(C.name)}|${q(C.given)}`, 'g'), () => n); }
    return s;
  },
  // 立繪寬高比（gear 頁持逆天劍等直接寫死比例的地方用）
  ar(name, def) { const a = this.cur().ar; return (a && a[name]) || def; },
  apply() {
    const C = this.cur(); HERO_NAME = (S.d && S.d.name) || C.name;
    document.body.className = document.body.className.replace(/\bchar-\w+/g, '').trim() + ' char-' + C.id;
    // 立繪設定：先還原男主，再套該角色的寬高比、劍身座標
    if (!this.sword0) this.sword0 = JSON.parse(JSON.stringify(HERO_SWORD));
    for (const [k, v] of Object.entries(this.sword0)) HERO_SWORD[k] = { ...v };
    for (const [k, v] of Object.entries(C.sword || {})) if (HERO_SWORD[k]) { Object.assign(HERO_SWORD[k], v); if (v.hilt === null) delete HERO_SWORD[k].hilt; }
    // 施法立繪：女角有圖用女角，沒圖就不顯示（不會跳出男主）
    if (!this.cast0) this.cast0 = { ...CAST_IMG };
    for (const k of Object.keys(this.cast0)) {
      const p = C.castDir ? C.castDir + k + '.webp' : this.cast0[k];
      if (!C.castDir || typeof ASSET_LIST === 'undefined' || ASSET_LIST.includes(p)) CAST_IMG[k] = p; else delete CAST_IMG[k];
    }
    // 劇情人物名稱（對話框上的名字）也套用角色替換，例如女主的母親為「蘇母」；先記下原名，切換角色時可還原
    if (typeof PEOPLE !== 'undefined') {
      if (!this.people0) this.people0 = Object.fromEntries(Object.entries(PEOPLE).map(([k, p]) => [k, p.name]));
      for (const [k, n] of Object.entries(this.people0)) PEOPLE[k].name = C.textSub.reduce((s, [a, b]) => s.split(a).join(b), n);
      if (PEOPLE.hero) PEOPLE.hero.name = HERO_NAME;
    }
    // 畫面上所有 <img>（含之後動態插入）自動換成該角色的立繪
    const fix = (i) => { const s = i.getAttribute('src'); if (s && s.startsWith('assets/hero/')) { const n = this.path(s); if (n !== s) i.setAttribute('src', n); } };
    if (!this.mo) {
      this.mo = new MutationObserver((ms) => ms.forEach((m) => {
        if (m.type === 'attributes') fix(m.target);
        else m.addedNodes.forEach((n) => { if (n.tagName === 'IMG') fix(n); else if (n.querySelectorAll) n.querySelectorAll('img').forEach(fix); });
      }));
      this.mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    }
    document.querySelectorAll('img').forEach(fix);
  },
};

// ════════ 介面：道侶・合修 ════════
Story.say = ((say0) => function (who, text) { return say0.call(this, who, Char.text(text)); })(Story.say);   // 劇情文字依角色替換
Object.assign(UI, {
  daoRoom: 'lingquan', daoInt: 'mild', daoSpeed: 1,
  dao() {
    const g = Dao.g, C = Char.cur(), P = g.partner, lv = Dao.lv(), next = Dao.nextAt(), t = Dao.today(), online = DaoNet.online(), cloud = typeof Cloud !== 'undefined' && Cloud.on;
    this.tab = 'dao'; this.navLock();
    Audio2.setMood('sect'); this.setBg('dongfu', 'dim'); Audio2.loop && Audio2.loop('meditate', false);
    this.scene(`<div class="dao-hero"><div class="banner static" style="animation:none;top:20%"><b style="font-size:clamp(30px,9vw,48px)">道侶・合修</b><span>${P ? `${escHtml(HERO_NAME)} ✦ ${P.name}・${Dao.lvName()}` : '尚未結為道侶'}</span></div></div>`);
    const partner = P
      ? `<div class="li">${gIco('ui', 'char_' + P.char, 'pface', '#ff9ec4')}<div><h4>${P.name}<em>${Dao.lvName()}・${online ? '<b style="color:#8ff0b8">在線</b>' : '離線'}</em></h4>
          <div class="bar xp" style="margin-top:6px"><i style="width:${next ? (100 * g.intimacy) / next : 100}%"></i><span>親密度 ${g.intimacy}${next ? ` / ${next}` : '（已滿）'}</span></div></div><span></span></div>
         <div class="dao-gifts"><small>贈送靈物（今日 ${t.gift}/${DAO.giftDaily}）</small>${Object.keys(DAO.gifts).filter((k) => S.has(k)).map((k) => `<button class="dao-gift" data-gift="${k}">${mIco(k)}${ITEMS[k].name}<b>+${DAO.gifts[k]}</b></button>`).join('') || '<p class="note">身上沒有可贈送的靈物</p>'}</div>
         <div class="row" style="gap:8px;justify-content:flex-end">${DEV ? `<button class="seal sm ghost" id="dSim">${g.simOnline ? '模擬在線・開' : '模擬在線・關'}</button>` : ''}<button class="seal sm ghost" id="dUnbond">解除道侶</button></div>
         ${DEV ? '<p class="note">開發模式：「模擬在線」開啟後視為道侶在線，不需另一支手機即可測試雙修流程。</p>' : ''}`
      : !Dao.canBond() ? '<p class="note">需先通過青冥宗三場試劍，才能在宗門廣場締結道侶。</p>'
      : cloud ? `<p class="note">輸入對方的道侶編號（對方需已登入），對方同意後即結為道侶。</p>
         <div class="dao-form"><input id="dPid" maxlength="12" placeholder="對方的道侶編號"><button class="seal sm" id="dBond">送出邀請</button></div>`
      : `<p class="note">登入雲端帳號後，可與另一支手機上的道侶連線。未登入時可先以道號締結（單機）。</p>
         <div class="dao-form"><input id="dName" maxlength="8" placeholder="道侶道號"><input id="dPid" maxlength="12" placeholder="編號（選填）"><button class="seal sm" id="dBond">締結</button></div>`;
    const acct = typeof Cloud === 'undefined' ? '' : cloud
      ? `<p class="note">雲端：已登入 ${Cloud.user.email || Cloud.user.name}　<button class="link-btn" id="dOut">登出</button></p>`
      : `<div class="row" style="gap:8px;align-items:center;margin:4px 0 8px"><button class="seal sm" id="dIn">Google 登入</button><span class="note" style="margin:0">登入後存檔上雲、可與道侶連線</span></div>`;
    const rooms = DUAL_ROOMS.map((R) => {
      const own = Dao.owned(R.id), r = g.rooms[R.id];
      if (!own) {
        const mats = Object.entries(R.need).map(([k, n]) => `<span class="mat ${S.has(k, n) ? '' : 'lack'}">${mIco(k)}${ITEMS[k].name} ${S.d.inv[k] || 0}/${n}</span>`).join('') + `<span class="mat ${S.has('stone', R.stone) ? '' : 'lack'}">${stoneAmt(R.stone)}</span>`;
        return `<div class="li"><div><h4>${R.name}<em>未開闢</em></h4><p>${R.desc}</p><div>${mats}</div></div><button class="seal sm" data-unlock="${R.id}" ${Dao.canUnlock(R) ? '' : 'disabled'}>開闢</button></div>`;
      }
      const styles = R.styles.map((s) => `<button class="${r.style === s.id ? 'on' : ''}" data-style="${R.id}:${s.id}">${s.name}</button>`).join('');
      return `<div class="li dao-room ${this.daoRoom === R.id ? 'sel' : ''}" data-room="${R.id}"><div><h4>${R.name}<em>修煉加成 ×${R.bonus}・已用 ${r.uses} 次</em></h4><div class="tabs dao-styles">${styles}</div>
        <p class="note">場景：${SCENE_NAME[roomScene(R.id, r.style)] || R.name}</p></div><span></span></div>`;
    }).join('');
    const anyRoom = DUAL_ROOMS.some((R) => Dao.owned(R.id)), dual = Dao.mode() === 'dual';
    const ints = Dao.intensities().map((x) => `<button class="${this.daoInt === x.id ? 'on' : ''}" data-int="${x.id}" ${x.open ? '' : 'disabled'}>${x.name}${x.open ? '' : `<small>需${DAO.levels[x.need].name}</small>`}</button>`).join('');
    const act = anyRoom ? `<div class="tabs dao-int">${ints}</div>
      <div class="row center gacha-btns"><button class="seal ghost" id="dSolo">閉關<small>單人・無雙修加成</small></button>
      <button class="seal" id="dDual" ${dual ? '' : 'disabled'}>邀請雙修<small>${!P ? '尚無道侶' : `${online ? '' : '道侶離線・'}今日已雙修 ${t.dual} 次`}</small></button></div>` : '<p class="note">先以探索所得材料開闢一間合修室。</p>';
    const mc = DAO.markCost(g.mark);
    const growth = `<div class="li"><div><h4>雙修靈力 ${g.dualQi}<em>連續雙修 ${g.streak} 日</em></h4><p>道侶印記 第 ${g.mark} 層：攻擊、氣血 +${Math.round(g.mark * DAO.markStat * 100)}%　悟性 +${Math.round(g.wux * 100)}%　心魔抗性 +${Math.round(g.xin * 100)}%</p></div>
        <button class="seal sm" id="dMark" ${g.mark < DAO.markMax && g.dualQi >= mc ? '' : 'disabled'}>印記<small>${g.mark < DAO.markMax ? mc : '圓滿'}</small></button></div>
      ${DAO.skills.filter((k) => !k.hidden).map((k) => `<div class="li"><div><h4>${k.name}<em>${g.skills[k.id] ? '已領悟' : `雙修靈力 ${k.cost}`}</em></h4><p>${k.desc}</p></div><button class="seal sm ${g.skills[k.id] ? 'ghost' : ''}" data-dskill="${k.id}" ${!g.skills[k.id] && g.dualQi >= k.cost ? '' : 'disabled'}>${g.skills[k.id] ? '已悟' : '領悟'}</button></div>`).join('')}`;
    this.controls(`<div class="row spread"><div class="sec-title" style="flex:1">道侶</div><button class="seal sm ghost" id="dBack">返回</button></div>
      <p class="note">角色：${escHtml(HERO_NAME)}　我的道侶編號：<b class="dao-pid">${g.pid}</b></p>${acct}${partner}
      <div class="sec-title">合修室</div><div class="list">${rooms}</div>${act}
      <div class="sec-title">道侶修行</div><div class="list">${growth}</div>`);
    const $$ = (s, fn) => document.querySelectorAll(s).forEach((b) => (b.onclick = (e) => fn(b, e)));
    $$('#dBack', () => this.go('home'));
    $$('#dBond', async (b) => {
      b.disabled = true;
      const r = cloud ? await Cloud.requestBond($('#dPid').value) : Dao.bond($('#dName').value, $('#dPid').value);
      if (r === true) { Audio2.play('bell'); this.toast(`與${Dao.g.partner.name}結為道侶`, '#ff9ec4'); } else this.toast(r, '#ff9a9a');
      if (this.tab === 'dao') this.dao();
    });
    $$('#dIn', () => Cloud.signIn());
    $$('#dOut', async () => { await Cloud.signOut(); this.dao(); });
    $$('#dUnbond', () => this.modal('解除道侶', `<p class="big">確定與${P.name}解除道侶？</p><p class="note" style="text-align:center">親密度將歸零；合修室、雙修靈力與印記保留。</p><div class="row center"><button class="seal" id="uY">解除</button><button class="seal ghost sm" id="uN">再想想</button></div>`,
      { '#uY': () => { Dao.unbond(); this.close(); this.dao(); }, '#uN': () => this.close() }));
    $$('#dSim', () => { g.simOnline = !g.simOnline; S.save(); this.dao(); });
    $$('.dao-pid', () => { try { navigator.clipboard.writeText(g.pid); this.toast('已複製道侶編號', '#ff9ec4'); } catch (e) {} });
    $$('[data-gift]', (b) => { const r = Dao.gift(b.dataset.gift); if (r === true) { Audio2.play('pickup'); this.toast(`贈送${ITEMS[b.dataset.gift].name}，親密度 +${DAO.gifts[b.dataset.gift]}`, '#ff9ec4'); } else this.toast(r, '#ff9a9a'); this.dao(); this.hud(); });
    $$('[data-unlock]', (b) => { if (Dao.unlock(b.dataset.unlock)) { Audio2.play('gong'); this.toast(`開闢${Dao.room(b.dataset.unlock).name}`, '#ffe7a0'); this.daoRoom = b.dataset.unlock; } this.dao(); this.hud(); });
    $$('[data-style]', (b, e) => { e.stopPropagation(); const [r, s] = b.dataset.style.split(':'); Dao.setStyle(r, s); this.daoRoom = r; Audio2.play('page'); this.dao(); });
    $$('[data-room]', (b) => { this.daoRoom = b.dataset.room; this.dao(); });
    $$('[data-int]', (b) => { this.daoInt = b.dataset.int; this.dao(); });
    $$('#dMark', () => { if (Dao.upMark()) { Audio2.play('up'); this.toast(`道侶印記提升至第 ${Dao.g.mark} 層`, '#ff9ec4'); } this.dao(); this.hud(); });
    $$('[data-dskill]', (b) => { if (Dao.learnSkill(b.dataset.dskill)) { Audio2.play('up'); this.toast('領悟共同技能', '#ff9ec4'); } this.dao(); });
    if (!Dao.owned(this.daoRoom)) this.daoRoom = (DUAL_ROOMS.find((R) => Dao.owned(R.id)) || DUAL_ROOMS[0]).id;
    $$('#dSolo', () => { const r = Dao.solo(this.daoRoom); if (!r) return; if (r.err) { this.toast(r.err, '#ff9a9a'); return; } Audio2.play('qi'); this.toast(`於${Dao.room(this.daoRoom).name}閉關，修為 +${U.fmt(r.exp)}（靈石 −${U.fmt(r.cost)}）`, '#9fe8ff'); this.dao(); this.hud(); });
    $$('#dDual', () => this.daoDual());
  },
  // 邀請 → 對方接受 → 傳送 → 演出 → 結算（房主）
  async daoDual() {
    const room = this.daoRoom, R = Dao.room(room), P = Dao.g.partner;
    const inv = await DaoNet.invite(room);
    if (!inv.ok) { this.toast(inv.reason === 'offline' ? `${P ? P.name : '道侶'}不在線，可先單人閉關` : inv.reason === 'busy' ? `${P.name}正忙，稍後再邀` : inv.reason === 'timeout' ? `${P.name}沒有回應` : `${P.name}婉拒了邀請`, '#ff9a9a'); return; }
    const opts = { room, style: Dao.g.rooms[room].style, intensity: this.daoInt, speed: this.daoSpeed };
    if (typeof Cloud !== 'undefined') Cloud.toPartner({ type: 'dualStart', ...opts });
    this.toast(`${P.name}已接受邀請，傳送至${R.name}`, '#ff9ec4');
    await this.daoDualRun(opts);
  },
  // 雙方共用：演出與結算；guest 為受邀方（用房主的合修室與風格，不付維持費）
  async daoDualRun(o) {
    const R = Dao.room(o.room), sync = (m) => typeof Cloud !== 'undefined' && Cloud.toPartner({ type: 'dualCtl', ...m });
    UI.close(); this.daoSpeed = o.speed || 1;
    await this.fade(true);
    $('#app').classList.add('gacha-show'); requestAnimationFrame(() => FX.resize());
    this.scene(`<div class="dual-show" id="dualShow"><div class="ds-bg"></div><div class="ds-art"></div>
      <div class="ds-top"><b id="dsStage"></b><span id="dsStep"></span></div><p class="ds-text" id="dsText"></p>
      <div class="ds-ctrl"><button class="seal sm ghost" id="dsFast">加速 ×1</button><button class="seal sm ghost" id="dsSkip">跳過</button></div></div>`);
    this.fade(false); dualVideo($('#dualShow'), o.room);
    $('#dsFast').onclick = () => { this.daoSpeed = this.daoSpeed === 1 ? 2 : 1; DualShow.setSpeed(this.daoSpeed); $('#dsFast').textContent = `加速 ×${this.daoSpeed}`; sync({ speed: this.daoSpeed }); };
    $('#dsSkip').onclick = () => { DualShow.skip(); sync({ skip: true }); };
    $('#dsFast').textContent = `加速 ×${this.daoSpeed}`;
    await DualShow.play(o.room, o.intensity, this.daoSpeed, o.style);
    const res = Dao.dualResult(o.room, o.intensity, o.guest);
    $('#app').classList.remove('gacha-show'); requestAnimationFrame(() => FX.resize());
    if (res.err) { this.toast(res.err, '#ff9a9a'); this.dao(); return; }
    Audio2.play('up'); this.hud();
    this.modal('雙修圓滿', `<div class="list">
      <div class="li">${ico('exp')}<div><h4>修為 +${U.fmt(res.exp)}</h4><p>${R.name}・雙修倍率 ×${DAO.dualMult(Dao.lv()).toFixed(2)}${res.ratio < 1 ? `・今日第 ${res.nth} 次，獎勵 ${Math.round(res.ratio * 100)}%` : ''}</p></div><span></span></div>
      ${res.cost ? `<div class="li">${ico('stone')}<div><h4>靈氣消耗 ${stoneAmt(res.cost, '−')}</h4></div><span></span></div>` : ''}
      <div class="li">${gIco('ui', 'intimacy')}<div><h4>親密度 +${res.intimacy}</h4><p>${Dao.lvName()}</p></div><span></span></div>
      <div class="li">${gIco('ui', 'dual_qi')}<div><h4>雙修靈力 +${res.qi}</h4><p>連續雙修 ${res.streak} 日</p></div><span></span></div>
      ${res.resonance ? `<div class="li">${gIco('ui', 'resonance')}<div><h4>道侶共鳴・${res.resonance.name}</h4><p>${res.resonance.text}</p></div><span></span></div>` : ''}
      </div><div class="row center"><button class="seal" id="dOk">收下</button></div>`, { '#dOk': () => { this.close(); this.dao(); } });
  },
});
// 預設演出處理：依事件更新畫面（外部演出可另外用 DualShow.on() 接上）
// 演出圖：assets/dual/<合修室>/<階段>_<強度>.webp，同一組可再加 _2、_3…；選「直白」會連「適中」一起播，選「完全」三組都播
const dualArt = (room, stage, intensity) => {
  const has = (p) => typeof ASSET_LIST !== 'undefined' && ASSET_LIST.includes(p), out = [], order = DAO.intensity.map((x) => x.id);
  for (const it of order.slice(0, order.indexOf(intensity) + 1))
    for (let i = 1; i <= 6; i++) { const p = `assets/dual/${room}/${stage}_${it}${i > 1 ? '_' + i : ''}.webp`; if (has(p)) out.push(p); else if (i > 1) break; }
  return out;
};
// 雙修影片：演出開始時疊在演出圖上播一支（隨機），播完、跳過、載入失敗、斷網或被擋自動播放就移除，底下的靜態演出照常進行
// 進入演出才建立 <video>，開遊戲不預載；sw.js 不快取影片（見 sw.js）
// 影片編號 → 合修室：只從目前合修室的影片裡隨機挑；加影片時放 assets/dual/video_NN.mp4（＋同名 .jpg 封面）再在這裡加一行
const DUAL_VIDEO_ROOM = {
  1: 'lingquan', 2: 'lingquan', 3: 'lingquan', 4: 'lingquan', 5: 'lingquan', 6: 'lingquan', 7: 'lingquan', 8: 'lingquan', 9: 'lingquan',
  10: 'yunchuang', 11: 'yunchuang', 12: 'yunchuang', 13: 'yunchuang', 14: 'yunchuang',
};
const dualVideo = (box, room) => {
  const list = Object.keys(DUAL_VIDEO_ROOM).filter((k) => DUAL_VIDEO_ROOM[k] === room);
  if (!box || !list.length) return;   // 這間合修室沒有影片：只放靜態演出
  const n = String(list[Math.floor(Math.random() * list.length)]).padStart(2, '0'), wrap = document.createElement('div');
  wrap.className = 'ds-video';
  wrap.innerHTML = `<video muted playsinline preload="none" poster="assets/dual/video_${n}.jpg"></video><button class="seal sm ghost ds-vskip">跳過影片</button>`;
  const v = wrap.querySelector('video');
  // 看門狗：每秒檢查播放進度；還沒開始播超過 5 秒、或播到一半停格（斷網、緩衝不足）超過 3 秒，就關掉影片
  let last = -1, still = 0, dog = 0;
  const end = () => { clearInterval(dog); if (!wrap.isConnected) return; v.pause(); v.removeAttribute('src'); v.load(); wrap.remove(); };
  box._vEnd = end;
  v.muted = true;   // iOS 要用屬性設定才算靜音，才允許自動播放
  v.onended = v.onerror = end;
  wrap.querySelector('.ds-vskip').onclick = end;
  dog = setInterval(() => {
    if (!wrap.isConnected) return end();
    if (v.currentTime !== last) { last = v.currentTime; still = 0; } else if (++still >= (last > 0 ? 3 : 5)) end();
  }, 1000);
  box.querySelector('.ds-art').after(wrap);
  v.src = `assets/dual/video_${n}.mp4`;
  const p = v.play(); if (p) p.catch(end);
};
DualShow.on((e) => {
  const box = $('#dualShow'); if (!box) return;
  clearInterval(box._cyc);
  if (e.stage === 'end') { if (box._vEnd) box._vEnd(); return; }
  const sceneImg = `assets/dual/scene/${e.scene}.webp`, has = (p) => typeof ASSET_LIST !== 'undefined' && ASSET_LIST.includes(p);
  box.querySelector('.ds-bg').style.backgroundImage = has(sceneImg) ? `url(${sceneImg})` : '';
  box.querySelector('.ds-bg').dataset.scene = e.scene;
  const arts = dualArt(e.room, e.stage, e.intensity), art = box.querySelector('.ds-art');
  if (!arts.length) art.innerHTML = `<div class="ds-ph">${e.anim}<br>${e.fx}</div>`;
  else {
    let i = 0; const show = () => { art.innerHTML = `<img src="${arts[i % arts.length]}" alt="">`; i++; };
    show();
    if (arts.length > 1) box._cyc = setInterval(() => (DualShow.state === 'playing' ? show() : clearInterval(box._cyc)), Math.max(900, (DAO.stages[e.index].dur * 1000) / (DualShow.speed || 1) / arts.length));
  }
  $('#dsStage').textContent = e.stageName; $('#dsStep').textContent = `${e.index + 1} / ${DAO.stages.length}`;
  const tx = $('#dsText'); tx.textContent = dualText(e.stage, e.intensity); tx.classList.remove('in'); void tx.offsetWidth; tx.classList.add('in');
  if (e.stage === 'climax') { FX.flash = 0.6; FX.burst(FX.w / 2, FX.h * 0.45, '#ffd76a', 40, 260, 3, 1.2); Audio2.play('gong'); }
});
