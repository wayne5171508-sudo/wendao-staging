'use strict';
// ════════════════════════════════════════════
//  雲端：Google 登入、雲端存檔、道侶連線（Firebase Realtime Database）
//  資料結構：
//    users/<uid>   公開資料 { name, char, pid, at }（登入者可讀，本人可寫）
//    pids/<pid>    道侶編號 → uid
//    status/<uid>  上下線 { online, at }（斷線時自動設為離線）
//    saves/<uid>   雲端存檔 { at, data }（只有本人可讀寫）
//    inbox/<uid>/<id>  給該玩家的訊息（締結、贈禮、邀請、演出同步…），處理後刪除
//  沒網路或沒登入時一切照單機運作
// ════════════════════════════════════════════

const FIREBASE_CFG = null;
const FB_VER = '10.12.2';

// ───────── Firebase 接口（測試時可用 window.__CLOUD_ADAPTER 取代）─────────
const FirebaseAdapter = {
  async boot() {
    const load = (n) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = `https://www.gstatic.com/firebasejs/${FB_VER}/firebase-${n}-compat.js`; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    await load('app'); await Promise.all([load('auth'), load('database')]);
    firebase.initializeApp(FIREBASE_CFG); this.auth = firebase.auth(); this.db = firebase.database();
    try { await this.auth.getRedirectResult(); } catch (e) {}
  },
  onAuth(cb) { this.auth.onAuthStateChanged((u) => cb(u && { uid: u.uid, name: u.displayName || '', email: u.email || '' })); },
  async signIn() {
    const p = new firebase.auth.GoogleAuthProvider();
    try { await this.auth.signInWithPopup(p); }
    catch (e) { if (/popup|operation-not-supported/.test(e.code || '')) await this.auth.signInWithRedirect(p); else throw e; }
  },
  signOut() { return this.auth.signOut(); },
  async get(p) { return (await this.db.ref(p).get()).val(); },
  set(p, v) { return this.db.ref(p).set(v); },
  update(v) { return this.db.ref().update(v); },
  remove(p) { return this.db.ref(p).remove(); },
  push(p, v) { return this.db.ref(p).push(v); },
  on(p, cb) { const r = this.db.ref(p), f = (s) => cb(s.val()); r.on('value', f); return () => r.off('value', f); },
  onChild(p, cb) { const r = this.db.ref(p), f = (s) => cb(s.key, s.val()); r.on('child_added', f); return () => r.off('child_added', f); },
  presence(uid) {
    const st = this.db.ref(`status/${uid}`), TS = firebase.database.ServerValue.TIMESTAMP, c = this.db.ref('.info/connected');
    const f = (s) => { if (!s.val()) return; st.onDisconnect().set({ online: false, at: TS }).then(() => st.set({ online: true, at: TS })).catch((e) => console.warn('[雲端] 上線狀態更新失敗', e)); };
    c.on('value', f); return () => c.off('value', f);   // 回傳解除函式：換帳號、登出時一起解除
  },
  offline(uid) { return this.db.ref(`status/${uid}`).set({ online: false, at: Date.now() }); },
  connected() { return new Promise((res) => this.db.ref('.info/connected').once('value', (s) => res(s.val() === true))); },
};

const Cloud = {
  A: null, user: null, booted: false, partnerOnline: false, offs: [], pending: {}, saveT: 0,
  async init() {
    this.A = window.__CLOUD_ADAPTER || FirebaseAdapter;
    if ((location.protocol === 'file:' || !FIREBASE_CFG) && !window.__CLOUD_ADAPTER) return;   // 沒有設定（測試站尚未建專案）＝單機
    try { await this.A.boot(); this.booted = true; } catch (e) { console.warn('[雲端] 無法連線（離線或被擋），以單機模式遊玩'); return; }
    this.A.onAuth((u) => this.onUser(u).catch((e) => console.warn('[雲端] 登入後同步失敗', e)));
  },
  get on() { return !!this.user; },
  async signIn() {
    if (!this.booted) { UI.toast(FIREBASE_CFG ? '目前連不到雲端，請確認網路' : '此版本未連接雲端（單機模式）', '#ff9a9a'); return; }
    try { await this.A.signIn(); } catch (e) { console.warn(e); UI.toast('登入未完成', '#ff9a9a'); }
  },
  async signOut() { if (!this.user) return; await this.upload(); await this.A.offline(this.user.uid); this.offs.forEach((f) => f()); this.offs = []; await this.A.signOut(); },

  async onUser(u) {
    this.offs.forEach((f) => f()); this.offs = []; this.user = u; this.partnerOnline = false; this.registered = null;   // 換帳號或重新登入：重新註冊、重新監聽收件匣
    if (!u) { this.refresh(); return; }
    // 雲端存檔：本機沒進度就直接用雲端；兩邊都有、且雲端不是本機上次同步的那份（別台裝置或新手機）時一律讓玩家選
    const cs = await this.A.get(`saves/${u.uid}`);
    let cd = null; if (cs && cs.data) try { cd = JSON.parse(cs.data); } catch (e) { console.warn('[雲端] 雲端存檔損毀，略過'); }
    if (cd && cd.root && (!S.d || !S.d.root)) { if (this.adopt(cs.data)) return; }   // 本機還沒入道（新手機）：直接用雲端
    else if (cd && cd.root && S.d.cloudAt !== `${u.uid}:${cs.at}`) {
      const info = (d, t) => `${escHtml(lvName(d.lv))}・${ROOTS[d.root] ? ROOTS[d.root].name : '?'}<br>${new Date(t).toLocaleString()}`;
      const pick = await new Promise((res) => UI.modal('雲端存檔', `<p class="big">雲端與本機各有一份存檔</p><p class="note" style="text-align:center">雲端：${info(cd, cs.at)}<br><br>本機：${info(S.d, S.d.last)}</p>
        <div class="row center"><button class="seal" id="cC">用雲端</button><button class="seal ghost sm" id="cL">用本機</button></div>`, { '#cC': () => { UI.close(); res('c'); }, '#cL': () => { UI.close(); res('l'); } }));
      if (pick === 'c' && this.adopt(cs.data)) return;
    }
    if (!S.d || !S.d.root) { this.refresh(); return; }   // 還沒入道：先不註冊，入道後再上傳
    await this.register();
  },
  // 套用雲端存檔：走匯入的格式檢查並換掉 S.d，重新整理前的自動存檔就會寫入雲端這份，不會蓋回本機舊檔
  adopt(data) { const r = S.importText(data); if (r !== true) { UI.toast(`雲端存檔無法使用（${r}），保留本機進度`, '#ff9a9a'); return false; } location.reload(); return true; },
  // 公開資料、道侶編號、上下線、收件匣、道侶狀態
  async register() {
    const u = this.user, g = S.d.dao;
    if (!u || this.registered === u.uid) return; this.registered = u.uid;
    // 一個帳號只佔一個編號（規則也會擋）：帳號已有編號就沿用（換裝置時本機編號會不同）
    const srv = (await this.A.get(`users/${u.uid}`)) || {}, prev = srv.pid;
    if (prev && (await this.A.get(`pids/${prev}`)) === u.uid) { if (g.pid !== prev) { g.pid = prev; S.save(); } }
    else { const own = await this.A.get(`pids/${g.pid}`); if (own && own !== u.uid) { g.pid = Math.random().toString(36).slice(2, 10).toUpperCase(); S.save(); } }   // 編號撞到別人：換一個
    // 名字以較新的一次更名為準：雲端較新就套用到本機；本機較新（例如沒登入時改的）就連同更名時間一起寫上去
    let nameUp = {};
    if (srv.name && srv.name !== HERO_NAME) {
      if ((srv.renameAt || 0) >= (S.d.lastRenameAt || 0)) this.takeName(srv);
      else nameUp = { [`users/${u.uid}/renameAt`]: S.d.lastRenameAt };
    }
    // 逐欄寫入（不整筆覆蓋），保留雲端的 renameAt；和編號同一次寫入，規則才能互相核對
    const base = () => ({ [`pids/${g.pid}`]: u.uid, [`users/${u.uid}/name`]: HERO_NAME, [`users/${u.uid}/char`]: g.char, [`users/${u.uid}/pid`]: g.pid, [`users/${u.uid}/at`]: Date.now() });
    try { await this.A.update({ ...base(), ...nameUp }); }
    catch (e) { if (!srv.name) throw e; this.takeName(srv); await this.A.update(base()); }   // 本機的名字被規則擋下（例如冷卻中）：改用雲端的名字

    const pOff = this.A.presence(u.uid); if (pOff) this.offs.push(pOff);
    this.offs.push(this.A.onChild(`inbox/${u.uid}`, (id, m) => { this.A.remove(`inbox/${u.uid}/${id}`); this.handle(m); }));
    this.watchPartner(); g.outbox = []; await this.upload(); this.refresh();
  },
  watchPartner() {
    if (this.pOff) { this.pOff(); this.pOff = null; }
    const P = S.d.dao.partner; this.partnerOnline = false;
    if (!P || !P.uid) return;
    const off1 = this.A.on(`status/${P.uid}`, (st) => { const on = !!(st && st.online); if (on !== this.partnerOnline) { this.partnerOnline = on; if (on) UI.toast(`道侶${P.name}上線了`, '#ff9ec4'); this.refresh(); } });
    // 道侶更名：監聽對方的公開名字，即時換掉自己存檔裡的道侶名字（舊的收件匣訊息維持原名）
    const off2 = this.A.on(`users/${P.uid}/name`, (n) => {
      if (typeof n !== 'string' || S.nameError(n) || n === P.name) return;
      P.name = escHtml(n); S.save(); this.refresh();
    });
    this.pOff = () => { off1(); off2(); };
    this.offs.push(() => this.pOff && this.pOff());
  },
  // 套用雲端的名字到本機（雲端比較新、或本機的名字被規則擋下時）
  takeName(srv) {
    S.d.name = S.nameError(srv.name) ? '' : srv.name;
    S.d.lastRenameAt = Math.max(S.d.lastRenameAt || 0, srv.renameAt || 0);
    Char.apply(); S.save();
  },
  // 更名寫入雲端：公開名字、更名時間、整份存檔用同一次寫入，不會只改一半。成功回傳 true，失敗回傳原因
  // 離線時 Firebase 會把寫入排隊、不會回報失敗，所以先確認在線，離線就直接拒絕
  async rename(name, at) {
    if (!this.user) return true;   // 沒登入雲端：只改本機
    if (!(await this.A.connected())) return '目前離線，連上網路後才能更名';
    const uid = this.user.uid, sat = S.d.last = Date.now(); S.d.cloudAt = `${uid}:${sat}`;
    try { await this.A.update({ [`users/${uid}/name`]: name, [`users/${uid}/renameAt`]: at, [`saves/${uid}`]: { at: sat, data: JSON.stringify(S.d) } }); return true; }
    catch (e) { console.warn('[雲端] 更名寫入失敗', e); return '雲端寫入失敗'; }
  },
  refresh() { if (UI.tab === 'dao' && !Battle.on && $('#dBack')) UI.dao(); UI.cloudBadge && UI.cloudBadge(); },
  // 存檔上傳（S.save 後 10 秒合併一次；切到背景時立即）
  async upload() { if (!this.user || !S.d || !S.d.root) return; clearTimeout(this.saveT); this.saveT = 0; const at = S.d.last || Date.now(); S.d.cloudAt = `${this.user.uid}:${at}`; try { await this.A.set(`saves/${this.user.uid}`, { at, data: JSON.stringify(S.d) }); } catch (e) { console.warn('[雲端] 存檔上傳失敗', e); } },
  queueUpload() { if (this.user && !this.saveT) this.saveT = setTimeout(() => this.upload(), 10000); },

  // ───────── 傳訊 ─────────
  send(uid, m) {
    if (!this.user || !uid) return false;
    Promise.resolve(this.A.push(`inbox/${uid}`, { ...m, from: this.user.uid, fromName: HERO_NAME, at: Date.now() })).catch((e) => { console.warn('[雲端] 訊息送出失敗', e); UI.toast('訊息沒送出，請確認網路後再試', '#ff9a9a'); });
    return true;
  },
  toPartner(m) { const P = S.d.dao.partner; return P && P.uid ? this.send(P.uid, m) : false; },
  wait(key, ms) { return new Promise((res) => { const t = setTimeout(() => { delete this.pending[key]; res(null); }, ms); this.pending[key] = (m) => { clearTimeout(t); delete this.pending[key]; res(m); }; }); },
  async requestBond(pid) {
    pid = String(pid || '').trim().toUpperCase();
    if (!pid) return '請輸入對方的道侶編號';
    if (pid === S.d.dao.pid) return '這是你自己的編號';
    const uid = await this.A.get(`pids/${pid}`); if (!uid) return '找不到這個道侶編號（對方需先登入）';
    const info = (await this.A.get(`users/${uid}`)) || {};
    this.send(uid, { type: 'bondReq', pid: S.d.dao.pid, char: S.d.dao.char });
    UI.toast(`已向${info.name ? escHtml(String(info.name).slice(0, 20)) : '對方'}送出締結邀請，等待回應`, '#ff9ec4');
    const r = await this.wait('bond', 120000);
    if (!r) return '對方沒有回應（可能不在線），稍後再試';
    if (r.type === 'bondNo') return `${r.fromName}婉拒了締結`;
    Dao.bondWith({ name: r.fromName, pid, uid: r.from, char: r.char }); this.watchPartner(); return true;
  },
  // 收到的訊息
  async handle(m) {
    // 收件匣任何人都能寫：名字與編號一進來就跳脫，之後彈窗、提示、存進道侶資料都安全
    m.fromName = escHtml(String(m.fromName || '').slice(0, 20)); m.pid = escHtml(String(m.pid || '').slice(0, 12));
    const g = S.d.dao, P = g.partner, fromPartner = P && P.uid === m.from;
    switch (m.type) {
      case 'bondReq': {
        if (g.partner) { this.send(m.from, { type: 'bondNo' }); return; }
        UI.modal('道侶締結', `<p class="big">${m.fromName}</p><p class="note" style="text-align:center">道侶編號 ${m.pid}<br>想與你結為道侶</p><div class="row center"><button class="seal" id="bY">結為道侶</button><button class="seal ghost sm" id="bN">婉拒</button></div>`, {
          '#bY': () => { UI.close(); Dao.bondWith({ name: m.fromName, pid: m.pid, uid: m.from, char: m.char }); this.send(m.from, { type: 'bondOk', char: S.d.dao.char }); this.watchPartner(); Audio2.play('bell'); UI.toast(`與${m.fromName}結為道侶`, '#ff9ec4'); this.refresh(); },
          '#bN': () => { UI.close(); this.send(m.from, { type: 'bondNo' }); },
        });
        return;
      }
      case 'bondOk': case 'bondNo': if (this.pending.bond) this.pending.bond(m); return;
      case 'unbond': if (fromPartner) { Dao.unbond(true); this.watchPartner(); UI.toast(`${m.fromName}解除了道侶`, '#ff9a9a'); this.refresh(); } return;
      case 'gift': if (fromPartner && ITEMS[m.item]) { S.add(m.item); Dao.addIntimacy(DAO.gifts[m.item] || 1, `收到${m.fromName}贈送的${ITEMS[m.item].name}`); S.save(); UI.toast(`${m.fromName}贈你${ITEMS[m.item].name}`, '#ff9ec4'); UI.hud(); this.refresh(); } return;
      case 'invite': {
        if (!fromPartner) return;
        if (Battle.on || DualShow.state === 'playing' || Story.waiting) { this.send(m.from, { type: 'inviteNo', why: 'busy' }); return; }
        const R = Dao.room(m.room); let answered = false;
        const reply = (ok) => { if (answered) return; answered = true; UI.close(); this.send(m.from, { type: ok ? 'inviteOk' : 'inviteNo' }); };
        UI.modal('雙修邀請', `<p class="big">${m.fromName}</p><p class="note" style="text-align:center">邀你前往${R ? R.name : '合修室'}雙修</p><div class="row center"><button class="seal" id="iY">前往</button><button class="seal ghost sm" id="iN">婉拒</button></div>`, { '#iY': () => reply(true), '#iN': () => reply(false) });
        Audio2.play('bell'); setTimeout(() => reply(false), 30000);
        return;
      }
      case 'inviteOk': case 'inviteNo': if (this.pending.invite) this.pending.invite(m); return;
      case 'dualStart': if (fromPartner) UI.daoDualRun({ room: m.room, style: m.style, intensity: m.intensity, speed: m.speed, guest: true, host: m.fromName }); return;
      case 'dualCtl': if (fromPartner && DualShow.state === 'playing') { if (m.skip) DualShow.skip(); if (m.speed) { UI.daoSpeed = m.speed; DualShow.setSpeed(m.speed); const b = $('#dsFast'); if (b) b.textContent = `加速 ×${m.speed}`; } } return;
      case 'explore': if (fromPartner) { Dao.addIntimacy(DAO.gain.explore, `${m.fromName}在外歷練時念著你`); S.save(); } return;
    }
  },
};

// ───────── 接到既有系統 ─────────
(() => {
  const save0 = S.save.bind(S); S.save = () => { save0(); Cloud.queueUpload(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) Cloud.upload(); });
  // 道侶連線：有登入且道侶有雲端帳號時改走真正的連線
  const online0 = DaoNet.online.bind(DaoNet), invite0 = DaoNet.invite.bind(DaoNet), send0 = DaoNet.send.bind(DaoNet);
  const linked = () => Cloud.on && S.d.dao.partner && S.d.dao.partner.uid;
  DaoNet.online = () => (linked() ? Cloud.partnerOnline || (DEV && S.d.dao.simOnline) : online0());
  DaoNet.invite = async (room) => {
    if (!linked()) return invite0(room);
    if (!Cloud.partnerOnline) return { ok: false, reason: 'offline' };
    Cloud.toPartner({ type: 'invite', room });
    UI.toast('已送出邀請，等待道侶回應…', '#ff9ec4');
    const r = await Cloud.wait('invite', 35000);
    return r && r.type === 'inviteOk' ? { ok: true } : { ok: false, reason: r ? r.why || 'declined' : 'timeout' };
  };
  DaoNet.send = (evt) => {
    if (!linked()) return send0(evt);
    if (evt.type === 'gift') Cloud.toPartner({ type: 'gift', item: evt.item });
    else if (evt.type === 'unbond') Cloud.toPartner({ type: 'unbond' });
  };
  // 一起歷練：通知道侶
  const ex0 = Dao.onExplore.bind(Dao); Dao.onExplore = () => { const r = ex0(); if (r && linked()) Cloud.toPartner({ type: 'explore' }); return r; };
})();

// 入道後補註冊（新遊戲時還沒有角色資料）
setInterval(() => { if (Cloud.user && S.d && S.d.root && Cloud.registered !== Cloud.user.uid) Cloud.register(); }, 3000);
