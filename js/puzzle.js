'use strict';
// ════════════════════════════════════════════
//  轉珠戰鬥（關卡制）：只在開發模式開啟，舊戰鬥 Battle 完全不動
//  進入：網址 ?dev&pz 開章節地圖，或開發模式下「歷練」頁最上方的「轉珠關卡」
//  玩法：按住珠子拖曳，經過的珠子會換位；放開或轉珠時間到就結算
//        橫或直三顆以上同色相連即消除，相連的同色一起算一個 Combo；消除後上方掉落補珠，可連鎖
//  一關＝數波小怪＋最後一波首領；數值（隊伍、怪物、關卡、獎勵）都在 js/stage-cfg.js，地圖與存檔在 js/stage.js
// ════════════════════════════════════════════

// ───────── 可替換素材 ─────────
// 之後換日系手繪風時只改這裡：填上路徑就用圖，null 或載入失敗就用程式畫的色塊珠／漸層背景
// 珠子圖建議正方形透明底（例 160×160），會縮放到格子大小；怪物立繪在 stage-cfg.js 的 PZ_MONS
const PZ_ART = {
  bgPos: '50% 40%',
  board: 'assets/pz/board.webp',       // 盤面底板（奶油紙棕框），null＝不貼
  card: 'assets/pz/card.webp',         // 隊員卡框（透明底）
  paper: 'assets/pz/paper.webp',       // 下半部紙紋（壓暗疊在底色上）
  orbs: { wood: 'assets/orb/wood.webp', fire: 'assets/orb/fire.webp', earth: 'assets/orb/earth.webp',
    metal: 'assets/orb/metal.webp', water: 'assets/orb/water.webp', heart: 'assets/orb/heart.webp' },
  // 消除特效：黑底圖，依消除珠子屬性選圖疊在盤面；沒填或載入失敗就用程式效果（珠子放大淡出）
  clear: { wood: 'assets/fx/pz_clr_wood.webp', fire: 'assets/fx/pz_clr_fire.webp', earth: 'assets/fx/pz_clr_earth.webp',
    metal: 'assets/fx/pz_clr_metal.webp', water: 'assets/fx/pz_clr_water.webp', heart: 'assets/fx/pz_clr_heart.webp' },
  // 5 連珠特效：黑底圖（四角純黑），screen 混色疊在半透明暗圈上（盤面是淺色紙，直接 screen 會看不見）；沒填或載入失敗就用程式光爆
  five: { wood: 'assets/fx/pz_five_wood.webp', fire: 'assets/fx/pz_five_fire.webp', earth: 'assets/fx/pz_five_earth.webp',
    metal: 'assets/fx/pz_five_metal.webp', water: 'assets/fx/pz_five_water.webp', heart: 'assets/fx/pz_five_heart.webp' },
  // 技能特效：黑底圖，用 mix-blend-mode:screen 疊在戰鬥區；key 對應效果種類（roster-cfg.js 效果庫的 t），技能放第一個有圖的效果
  fx: { nuke: 'assets/fx/pz_slash.webp', heal: 'assets/fx/pz_heal.webp', pierce: 'assets/fx/pz_break.webp', delay: 'assets/fx/pz_ice.webp',
    combo: 'assets/fx/pz_sk_combo.webp', comboUp: 'assets/fx/pz_sk_combo.webp', time: 'assets/fx/pz_sk_time.webp', convert: 'assets/fx/pz_sk_convert.webp' },
};

// ───────── 拖曳手感（之後只改這裡）─────────
const PZ_DRAG = {
  enter: 0.1,        // 換位門檻：手指越過格線、進入新格子多深（格寬比例）就換；各軸分開算，0＝碰到格線就換（易在格線上來回抖）
  subStep: 0.25,     // 快速拖曳時兩個取樣點之間每隔幾格補一個判定點，確保沿路逐格換、不跳格
  swapMs: 70,        // 被讓位的珠子滑到空位的時間（ease-out cubic，換位當下就開始）
  liftScale: 1.1,    // 拿起的珠子放大倍率
  liftOffset: 0.2,   // 拿起的珠子往上偏離手指幾格
  edgeBuf: 0.3,      // 盤面上下各留幾格的透明緩衝：在緩衝區按下也能拿起最近一排的珠子
  outMax: 0.5,       // 手指在盤面外時，拿起的珠子最多超出盤面邊界幾格（換位判定一律夾在盤面內、取最近的格子）
  liftAlpha: 0.9,    // 拿起的珠子透明度
  ghostAlpha: 0.3,   // 原位虛影透明度
};
// ───────── 版面 ─────────
const PZ_LAYOUT = {
  topMin: 190,       // 上方戰鬥區至少多高（px）：標題列 34＋提示列 16＋立繪（首領名字血條疊在立繪下緣）約 130
  boardMaxH: 0.5,    // 盤面最多佔視窗高度幾成
};
const PZ_EL = {
  wood:  { ch: '木', c: '#58d07a', d: '#17602f' },
  fire:  { ch: '火', c: '#ff5a3a', d: '#8a1e0e' },
  earth: { ch: '土', c: '#c98a46', d: '#5e3612' },
  metal: { ch: '金', c: '#f3e7b0', d: '#8d7a30' },
  water: { ch: '水', c: '#48a6ff', d: '#123f78' },
  heart: { ch: '心', c: '#ff8ec0', d: '#962c5c' },
};
const PZ_COLORS = Object.keys(PZ_EL);
// 五行相剋：木剋土、土剋水、水剋火、火剋金、金剋木
const PZ_BEATS = { wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood' };
const pzRel = (a, d) => (PZ_BEATS[a] === d ? PZ_CFG.beat : PZ_BEATS[d] === a ? PZ_CFG.beaten : 1);
// 靈根對應珠色：雷歸火、冰歸水
const PZ_ROOT = { metal: 'metal', wood: 'wood', water: 'water', fire: 'fire', earth: 'earth', thunder: 'fire', ice: 'water' };

// 隊伍：[隊長, 副隊長, 隊員…]，由 js/roster.js 依存檔編組（主角、道侶快照、抽卡角色）
function pzTeam() { return Roster.team(); }

const Puzzle = {
  on: false,

  // ───────── 開關 ─────────
  // opts.stage：stage.js 的關卡（體力已由 Stage.play 扣過）
  open(opts = {}) {
    if (this.on) return;
    this.stage = opts.stage || stageById('1-1');
    this.on = true;
    const t = +(new URLSearchParams(location.search).get('pzt'));
    this.moveTime = t >= 2 && t <= 30 ? t : PZ_CFG.moveTime;
    this.dbg = /[?&]pzdebug(=|&|$)/.test(location.search);   // 拖曳除錯：盤面上方即時資訊＋手指紅點
    let root = document.getElementById('pz');
    if (!root) { root = document.createElement('div'); root.id = 'pz'; document.body.appendChild(root); }
    this.root = root;
    document.body.classList.add('pz-on');
    if (typeof Audio2 !== 'undefined') Audio2.bgm('pz_battle');
    this.reset();
    this.build();
    this.layout();
    this.spawn(0);
    this._rs = () => this.layout(); addEventListener('resize', this._rs);
    this.last = performance.now();
    const loop = (now) => { if (!this.on) return; const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.frame(dt); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  },
  // toMap：回章節地圖（預設）；next：回地圖後打開下一關說明
  close(toMap = true, next) {
    this.held = null; this.state = 'idle'; this.dropLift();   // 拖曳中直接關閉：不結算
    this.on = false; cancelAnimationFrame(this.raf); removeEventListener('resize', this._rs);
    (this._win || []).forEach(([t, f, o]) => removeEventListener(t, f, o)); document.removeEventListener('visibilitychange', this._vis);
    this.root.remove(); document.body.classList.remove('pz-on');
    if (typeof Audio2 !== 'undefined') Audio2.setMood(Audio2.mood);   // 切回目前場景的音樂
    if (typeof FX !== 'undefined') requestAnimationFrame(() => FX.resize());
    if (toMap) Stage.back(next);
  },

  reset() {
    this.team = pzTeam().map((m) => ({ ...m, cd: !m.sk ? 0 : PZ_CFG.skillStartHalf ? Math.ceil(m.sk.cd / 2) : m.sk.cd }));
    // 隊長技＋副隊長技＋同陣營加成（效果清單見 roster-cfg.js 效果庫）
    const C = Roster.calc(this.team);
    this.mods = C.mods; this.leads = C.leads; this.facs = C.facs; this.base = { combo: C.combo, delay: C.delay, pierce: C.pierce, time: C.time, comboUp: C.comboUp }; this.dots = [];
    this.hpMax = C.hp; this.hp = this.hpMax; this.rcv = C.rcv;
    this.buff = this.newBuff();
    this.sid = (this.sid || 0) + 1;   // 每局一個編號：撤退或重試後，上一局還在跑的結算醒來發現編號變了就停
    this.turn = 0; this.maxCombo = 0; this.state = 'idle'; this.held = null; this.wave = 0; this.foes = []; this.tg = 0;
    this.grid = this.newBoard();
  },
  // 依怪物表建一隻敵人（k＝關卡倍率）
  mkFoe(id, k) {
    const M = PZ_MONS[id], P = M.phases || [{}], p0 = P[0] || {};
    const hp = Math.round(M.hp * k), atk = Math.round(M.atk * k);
    return { id, M, name: M.name, boss: !!M.boss, hp, max: hp, atk0: atk, atk: Math.round(atk * (p0.atk || 1)), def: M.def || 0,
      el: p0.el || M.el, cd: p0.cd || M.cd, phase: 0, ph: p0, hits: 0, dr: p0.dr || 0, leech: p0.leech || 0 };
  },
  // 第 i 波上場
  spawn(i) {
    const st = this.stage, ids = st.waves[i], last = i === st.waves.length - 1;
    this.wave = i; this.tg = 0;
    this.foes = ids.map((id) => this.mkFoe(id, st.k || 1));
    if (this.base.delay) this.foes.forEach((f) => (f.cd += this.base.delay));   // 隊長技「每波開場倒數 +n」
    const bgs = st.ch.bg, top = this.root.querySelector('.pz-top');
    top.style.backgroundImage = `url(${bgs[Math.min(bgs.length - 1, last ? 2 : i ? 1 : 0)] || bgs[0]})`;
    const box = this.root.querySelector('#pzFoes');
    box.className = 'pz-foes n' + this.foes.length;
    box.innerHTML = this.foes.map((f, j) => `<div class="pz-foe${f.boss ? ' boss' : ''}" data-f="${j}">
        <div class="pz-fcd"><small>倒數</small><b></b></div>
        <div class="pz-fimg">${f.M.img ? `<img src="${f.M.img}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('i'),{className:'pz-fph',textContent:'${f.name.slice(0, 2)}'}))">` : `<i class="pz-fph">${f.name.slice(0, 2)}</i>`}</div>
        <div class="pz-fname"><i class="pz-el"></i><b>${f.name}</b><em></em></div>
        <div class="pz-hp boss"><i></i><span></span></div></div>`).join('');
    box.querySelectorAll('.pz-foe').forEach((el) => (el.onclick = () => this.pickTarget(+el.dataset.f)));
    this.root.querySelector('#pzWave').textContent = `第 ${i + 1} / ${st.waves.length} 波${last ? '・首領' : ''}`;
    this.hud();
    if (last && this.foes.some((f) => f.boss)) { this.banner(this.foes.find((f) => f.boss).name, '首領現身'); if (typeof Audio2 !== 'undefined') Audio2.play('roar'); }
    else if (i) this.banner(`第 ${i + 1} 波`, '');
  },
  alive() { return this.foes.filter((f) => f.hp > 0); },
  // 攻擊目標：玩家點選的（還活著）優先，否則第一隻活著的
  tgt() { const f = this.foes[this.tg]; return f && f.hp > 0 ? f : this.alive()[0]; },
  pickTarget(j) { if (this.state !== 'idle' || !this.foes[j] || this.foes[j].hp <= 0) return; this.tg = j; this.hud(); },
  foeEl(f) { return this.root.querySelector(`.pz-foe[data-f="${this.foes.indexOf(f)}"]`); },

  // ───────── 盤面資料 ─────────
  orb(c, r, col, y) { return { c, x: col, y: y ?? r, vy: 0, fall: false, die: 0 }; },
  newBoard() {
    const { cols, rows } = PZ_CFG, g = [];
    for (let r = 0; r < rows; r++) {
      g.push([]);
      for (let c = 0; c < cols; c++) {
        let col, n = 0;
        do { col = U.pick(PZ_COLORS); n++; } while (n < 20 && ((c >= 2 && g[r][c - 1].c === col && g[r][c - 2].c === col) || (r >= 2 && g[r - 1][c].c === col && g[r - 2][c].c === col)));   // 開局不預先成組
        g[r].push(this.orb(col, r, c));
      }
    }
    return g;
  },
  // 找出所有可消除的組：先標出橫直三連以上，再把相鄰的同色標記格併成一組（一組＝一個 Combo）
  groups() {
    const { cols, rows } = PZ_CFG, g = this.grid, mk = [...Array(rows)].map(() => Array(cols).fill(false));
    const col = (r, c) => (g[r][c] ? g[r][c].c : null);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols - 2; c++) { const k = col(r, c); if (k && k === col(r, c + 1) && k === col(r, c + 2)) mk[r][c] = mk[r][c + 1] = mk[r][c + 2] = true; }
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows - 2; r++) { const k = col(r, c); if (k && k === col(r + 1, c) && k === col(r + 2, c)) mk[r][c] = mk[r + 1][c] = mk[r + 2][c] = true; }
    const seen = [...Array(rows)].map(() => Array(cols).fill(false)), out = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!mk[r][c] || seen[r][c]) continue;
      const k = col(r, c), cells = [], st = [[r, c]]; seen[r][c] = true;
      while (st.length) {
        const [y, x] = st.pop(); cells.push([y, x]);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dy, dx]) => { const ny = y + dy, nx = x + dx; if (ny >= 0 && ny < rows && nx >= 0 && nx < cols && mk[ny][nx] && !seen[ny][nx] && col(ny, nx) === k) { seen[ny][nx] = true; st.push([ny, nx]); } });
      }
      out.push({ c: k, cells });
    }
    // 由下往上消（掉落感較自然）
    return out.sort((a, b) => Math.max(...b.cells.map((x) => x[0])) - Math.max(...a.cells.map((x) => x[0])));
  },
  // 消除後往下掉，空位從上方補新珠
  drop() {
    const { cols, rows } = PZ_CFG, g = this.grid;
    for (let c = 0; c < cols; c++) {
      let w = rows - 1;
      for (let r = rows - 1; r >= 0; r--) if (g[r][c]) { const o = g[r][c]; g[r][c] = null; g[w][c] = o; if (w !== r) o.fall = true; w--; }
      const n = w + 1;
      for (let r = w; r >= 0; r--) { const o = this.orb(U.pick(PZ_COLORS), r, c, r - n - 0.3); o.fall = true; g[r][c] = o; }
    }
  },
  settled() {
    for (const row of this.grid) for (const o of row) if (o && (o.die || Math.abs(o.y - this.rowOf(o)) > 0.01 || o.fall)) return false;
    return true;
  },
  rowOf(o) { for (let r = 0; r < PZ_CFG.rows; r++) if (this.grid[r].includes(o)) return r; return 0; },

  // ───────── 畫面 ─────────
  build() {
    const T = this.team, st = this.stage;
    this.root.innerHTML = `
      <div class="pz-top" style="background-position:${PZ_ART.bgPos}">
        <div class="pz-bar"><button class="pz-btn" id="pzExit">撤</button><span><b>${st.id} ${st.name}</b><small id="pzWave"></small></span><button class="pz-btn" id="pzHelp">？</button></div>
        <div class="pz-warn" id="pzWarn"></div>
        <div class="pz-foes" id="pzFoes"></div>
        <div class="pz-fl" id="pzFl"></div><div class="pz-combo" id="pzCombo"></div>
      </div>
      <div class="pz-team">${T.map((m, i) => `<button class="pz-mem" data-m="${i}" style="--c:${PZ_EL[m.el].c};--d:${PZ_EL[m.el].d}">
          <span class="pz-face">${m.img ? `<img${m.port ? ' class="port"' : ''} src="${m.img}" alt="" onerror="this.remove()">` : ''}<em>${m.short.slice(-2)}</em><i>${PZ_EL[m.el].ch}</i></span>
          <span class="pz-sk"></span><small>${m.pos === '隊員' ? m.short.slice(0, 4) : m.pos}</small></button>`).join('')}</div>
      <div class="pz-hp team"><i id="pzTHp"></i><span id="pzTHpT"></span></div>
      <div class="pz-timer"><i id="pzTm"></i></div>
      <div class="pz-boardwrap"><canvas id="pzCv"></canvas><canvas class="pz-lift" id="pzLift"></canvas><div class="pz-hint" id="pzHint">按住珠子拖曳換位，放開或 ${this.mt()} 秒到就結算</div></div>
      <div class="pz-toast" id="pzToast"></div>${this.dbg ? '<div class="pz-dbg" id="pzDbg"></div><i class="pz-dot" id="pzDot"></i>' : ''}
      <div class="pz-rotate"><b>請將手機轉為直式</b><small>轉珠關卡只支援直式畫面</small></div>
      <div class="pz-end hidden" id="pzEnd"></div>`;
    const $p = (s) => this.root.querySelector(s);
    ['board', 'card', 'paper'].forEach((k) => this.root.style.setProperty('--pz-' + k, PZ_ART[k] ? `url(${PZ_ART[k]})` : 'none'));
    this.cv = $p('#pzCv'); this.ctx = this.cv.getContext('2d');
    $p('#pzExit').onclick = () => this.retreat();
    $p('#pzHelp').onclick = () => this.help();
    this.root.querySelectorAll('.pz-mem').forEach((b) => (b.onclick = () => this.skill(+b.dataset.m)));
    // 觸控：pointer capture＋touch-action:none，擋掉 iOS 下拉重整、捲動、長按選取
    const cv = this.cv;
    // 在整個盤面區塊（含外框與上下緩衝）按下都能起拖，夾到最近的格子
    const wrap = this.root.querySelector('.pz-boardwrap');
    wrap.addEventListener('pointerdown', (e) => this.down(e));
    if (this.dbg) { cv.addEventListener('pointerleave', (e) => this.dbgEv(e)); wrap.addEventListener('pointerleave', (e) => this.dbgEv(e)); }
    // move／up 掛在 window：capture 沒設成功或手指出了盤面、出了視窗，仍收得到；被系統打斷（cancel、切 App、失焦）一律收尾
    const end = () => this.finish();
    this._win = [['pointermove', (e) => this.move(e)], ['pointerup', (e) => this.up(e)], ['pointercancel', (e) => this.up(e)],
      ['touchcancel', end], ['blur', end], ['touchmove', (e) => this.state === 'drag' && e.preventDefault(), { passive: false }]];
    this._win.forEach(([t, f, o]) => addEventListener(t, f, o));
    this._vis = () => document.hidden && this.finish(); document.addEventListener('visibilitychange', this._vis);
    this.root.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.loadArt();
  },
  // 盤面大小：寬度貼齊螢幕（最多 460），高度不超過視窗一半，且上方戰鬥區至少留 PZ_LAYOUT.topMin
  layout() {
    const { cols, rows } = PZ_CFG, W = Math.min(innerWidth - 32, 460);   // 左右各留 10px 給盤面底板框
    const q = (s) => this.root.querySelector(s), used = q('.pz-team').offsetHeight + q('.pz-hp.team').offsetHeight + q('.pz-timer').offsetHeight + 30;
    const cell = Math.floor(Math.max(28, Math.min(W / cols, (innerHeight * PZ_LAYOUT.boardMaxH) / rows, (innerHeight - used - PZ_LAYOUT.topMin) / (rows + 2 * PZ_DRAG.edgeBuf))));
    this.cell = cell; this.dpr = Math.min(2.5, devicePixelRatio || 1);
    this.cv.style.width = cols * cell + 'px'; this.cv.style.height = rows * cell + 'px';
    this.cv.width = Math.round(cols * cell * this.dpr); this.cv.height = Math.round(rows * cell * this.dpr);
    this.root.style.setProperty('--board', cols * cell + 'px');
    this.root.style.setProperty('--pzbuf', Math.round(cell * PZ_DRAG.edgeBuf) + 'px');
    this.root.style.setProperty('--pztop', PZ_LAYOUT.topMin + 'px');
    this.sprites = {};
    PZ_COLORS.forEach((k) => (this.sprites[k] = this.orbSprite(k)));
  },
  loadArt() {
    this.art = {}; this.clr = {}; this.five = {};
    Object.entries(PZ_ART.clear).forEach(([k, src]) => { if (!src) return; const im = new Image(); im.onload = () => (this.clr[k] = src); im.src = src; });
    Object.entries(PZ_ART.five || {}).forEach(([k, src]) => { if (!src) return; const im = new Image(); im.onload = () => (this.five[k] = src); im.src = src; });
    Object.entries(PZ_ART.orbs).forEach(([k, src]) => {
      if (!src) return;
      const im = new Image(); im.onload = () => { this.art[k] = im; this.sprites[k] = this.orbSprite(k); }; im.src = src;
    });
  },
  // 預先把每色珠子畫成小圖，每幀只貼圖（30 顆對手機很輕）
  orbSprite(k) {
    const s = Math.round(this.cell * this.dpr), cv = document.createElement('canvas'); cv.width = cv.height = s;
    const x = cv.getContext('2d'), E = PZ_EL[k], r = s * 0.45;
    if (this.art && this.art[k]) { x.drawImage(this.art[k], 0, 0, s, s); return cv; }
    const g = x.createRadialGradient(s * 0.38, s * 0.34, r * 0.1, s / 2, s / 2, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.18, E.c); g.addColorStop(1, E.d);
    x.fillStyle = g; x.beginPath(); x.arc(s / 2, s / 2, r, 0, Math.PI * 2); x.fill();
    x.lineWidth = s * 0.035; x.strokeStyle = 'rgba(0,0,0,.45)'; x.stroke();
    x.font = `700 ${Math.round(s * 0.42)}px "LXGW WenKai TC", serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = s * 0.07; x.strokeStyle = 'rgba(0,0,0,.55)'; x.strokeText(E.ch, s / 2, s / 2 + s * 0.02);
    x.fillStyle = '#fff'; x.fillText(E.ch, s / 2, s / 2 + s * 0.02);
    return cv;
  },

  frame(dt) {
    const { cols, rows } = PZ_CFG, g = this.grid, ctx = this.ctx, cs = this.cell * this.dpr;
    // 珠子位置往目標格移動：換位用快速內插，掉落用重力
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const o = g[r][c]; if (!o) continue;
      if (o.die) { o.die += dt / 0.22; continue; }
      if (o.tw) {
        const k = Math.min(1, (performance.now() - o.tw.t) / PZ_DRAG.swapMs), e = 1 - Math.pow(1 - k, 3);
        o.x = o.tw.x + (c - o.tw.x) * e; o.y = o.tw.y + (r - o.tw.y) * e; if (k >= 1) o.tw = null;
        continue;
      }
      o.x += (c - o.x) * Math.min(1, dt * 28);
      if (o.fall) { o.vy += 55 * dt; o.y += o.vy * dt; if (o.y >= r) { o.y = r; o.vy = 0; o.fall = false; } }
      else o.y += (r - o.y) * Math.min(1, dt * 28);
      if (Math.abs(o.x - c) < 0.002) o.x = c;
      if (!o.fall && Math.abs(o.y - r) < 0.002) o.y = r;
    }
    // 轉珠計時
    if (this.state === 'drag' && this.t0) {
      const left = this.mt() - (performance.now() - this.t0) / 1000;
      this.root.querySelector('#pzTm').style.transform = `scaleX(${Math.max(0, left / this.mt())})`;
      if (left <= 0) this.finish();
    }
    if (this.dbg) this.dbgDraw();
    // 繪製
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { ctx.fillStyle = PZ_ART.board ? ((r + c) % 2 ? 'rgba(120,82,44,.16)' : 'rgba(255,248,228,.28)') : (r + c) % 2 ? 'rgba(20,14,10,.62)' : 'rgba(46,34,24,.62)'; ctx.fillRect(c * cs, r * cs, cs, cs); }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const o = g[r][c]; if (!o || (this.held && o === this.held.o)) continue;
      if (o.y < -0.99) continue;
      let sc = 1, a = 1;
      if (o.die) { if (this.clr[o.c]) continue; const t = Math.min(1, o.die); sc = 1 + 0.35 * t; a = 1 - t; }   // 有消除圖就由圖取代
      ctx.globalAlpha = a;
      const sz = cs * sc; ctx.drawImage(this.sprites[o.c], o.x * cs + (cs - sz) / 2, o.y * cs + (cs - sz) / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
    if (this.held) {
      const h = this.held, d = this.dpr;
      // 原位留淡影；手上的珠子是盤面外的浮層 #pzLift（canvas 畫不到盤面外），每幀只改 transform
      ctx.globalAlpha = PZ_DRAG.ghostAlpha; ctx.drawImage(this.sprites[h.o.c], h.c * cs, h.r * cs, cs, cs);
      ctx.globalAlpha = 1;
      this.lift.style.transform = `translate3d(${this.liftOrg.x + h.vx}px, ${this.liftOrg.y + h.vy - this.cell * PZ_DRAG.liftOffset}px, 0)`;
    }
  },

  // ───────── 拖曳轉珠 ─────────
  pt(e) { const b = this.cv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; },
  down(e) {
    if (this.state !== 'idle') return;
    this.dbgEv(e);
    const p = this.pt(e), c = U.clamp(Math.floor(p.x / this.cell), 0, PZ_CFG.cols - 1), r = U.clamp(Math.floor(p.y / this.cell), 0, PZ_CFG.rows - 1);
    if (!this.grid[r][c]) return;
    e.preventDefault();
    try { this.cv.setPointerCapture(e.pointerId); } catch (er) {}
    this.pid = e.pointerId; this.state = 'drag'; this.t0 = 0; this.moved = false;
    this.held = { r, c, o: this.grid[r][c], px: p.x, py: p.y, vx: p.x, vy: p.y }; this.lastPt = p;
    // 浮層：拿起時把珠子畫一次，之後只移動；拖曳期間其他區塊不收觸控
    const L = (this.lift = this.root.querySelector('#pzLift')), sz = Math.round(this.cell * PZ_DRAG.liftScale);
    L.width = L.height = Math.round(sz * this.dpr); L.style.width = L.style.height = sz + 'px'; L.style.opacity = PZ_DRAG.liftAlpha;
    L.getContext('2d').drawImage(this.sprites[this.held.o.c], 0, 0, L.width, L.height);
    this.liftOrg = { x: this.cv.offsetLeft - sz / 2, y: this.cv.offsetTop - sz / 2 };
    L.style.transform = `translate3d(${this.liftOrg.x + p.x}px, ${this.liftOrg.y + p.y - this.cell * PZ_DRAG.liftOffset}px, 0)`;   // 先就位，避免第一幀閃在左上角
    L.classList.add('on'); this.root.classList.add('pz-dragging');
    if (typeof Audio2 !== 'undefined') Audio2.unlock();
    this.sfx('pz_pick');
  },
  move(e) {
    this.dbgEv(e);
    if (this.state !== 'drag' || e.pointerId !== this.pid) return;
    e.preventDefault();
    // 一次 move 事件可能有多個取樣點（手指快速滑動），逐點處理才不會跳格
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    // 相鄰取樣點距離太遠（手指甩很快）時，沿線段每 subStep 格補判定點
    (evs.length ? evs : [e]).forEach((ev) => {
      const p = this.pt(ev), L = this.lastPt || p, n = Math.max(1, Math.ceil(Math.hypot(p.x - L.x, p.y - L.y) / (this.cell * PZ_DRAG.subStep)));
      for (let i = 1; i <= n; i++) this.track({ x: L.x + ((p.x - L.x) * i) / n, y: L.y + ((p.y - L.y) * i) / n });
      this.lastPt = p;
    });
  },
  track(p) {
    const h = this.held, { cols, rows } = PZ_CFG, cell = this.cell;
    // 換位判定用夾在盤面內的座標（手指在首領區＝最上排，左右下同理）；畫面上的珠子跟手，最多超出 outMax 格
    const out = cell * PZ_DRAG.outMax;
    h.vx = U.clamp(p.x, -out, cols * cell + out); h.vy = U.clamp(p.y, -out + cell * PZ_DRAG.liftOffset, rows * cell + out);   // 上方含上偏量，畫面上同樣最多超出 outMax
    h.px = U.clamp(p.x, 0, cols * cell - 1); h.py = U.clamp(p.y, 0, rows * cell - 1);
    // 各軸分開判定：越過格線並進入新格 enter 深度才算換到那一軸；另一軸貼著格線不影響。兩軸都過＝斜換
    const ax = (v, cur) => { const k = Math.floor(v); return k > cur ? (v - k >= PZ_DRAG.enter ? k : k - 1) : k < cur ? (k + 1 - v >= PZ_DRAG.enter ? k : k + 1) : k; };
    const c = ax(h.px / cell, h.c), r = ax(h.py / cell, h.r);
    if (c === h.c && r === h.r) return;
    // 一次跨好幾格時沿路逐格換（含斜向）
    while (h.c !== c || h.r !== r) {
      const nc = h.c + Math.sign(c - h.c), nr = h.r + Math.sign(r - h.r), g = this.grid;
      this.lastSwap = { t: performance.now(), dir: '↖↑↗←·→↙↓↘'[(nr - h.r + 1) * 3 + (nc - h.c + 1)], to: [nr, nc] };
      const other = g[nr][nc]; g[nr][nc] = h.o; g[h.r][h.c] = other;
      if (other) other.tw = { x: other.x, y: other.y, t: performance.now() };   // 手指一經過就滑到空位
      h.o.x = nc; h.o.y = nr; h.c = nc; h.r = nr;
      if (!this.moved) { this.moved = true; this.t0 = performance.now(); const hint = this.root.querySelector('#pzHint'); if (hint) hint.classList.add('off'); }
      this.sfx('pz_tick');
    }
  },
  up(e) {
    if (e) this.dbgEv(e);
    if (this.state !== 'drag' || (e && e.pointerId !== this.pid)) return;
    this.finish();
  },
  dbgEv(e) {
    if (!this.dbg) return;
    this.dbgE = { type: e.type.replace('pointer', ''), x: e.clientX, y: e.clientY };
    this.root.querySelector('#pzDot').style.transform = `translate(${e.clientX - 4}px, ${e.clientY - 4}px)`;
  },
  dbgDraw() {
    const E = this.dbgE; if (!E) return;
    const b = this.cv.getBoundingClientRect(), cell = this.cell, { cols, rows } = PZ_CFG, x = E.x - b.left, y = E.y - b.top;
    const cx = U.clamp(x, 0, cols * cell - 1), cy = U.clamp(y, 0, rows * cell - 1), h = this.held, s = this.lastSwap;
    const out = x < 0 || y < 0 || x >= cols * cell || y >= rows * cell;
    this.root.querySelector('#pzDbg').textContent =
      `原始(${Math.round(x)},${Math.round(y)}) 夾界(${Math.round(cx)},${Math.round(cy)}) 判定[${Math.floor(cy / cell)},${Math.floor(cx / cell)}] ${out ? '盤外' : '盤內'} ` +
      `拿起${h ? `[${h.r},${h.c}]` : '—'} 換位${s ? `${Math.round(performance.now() - s.t)}ms前${s.dir}[${s.to}]` : '—'} 事件:${E.type} ${this.state}`;
  },
  dropLift() { if (this.lift) this.lift.classList.remove('on'); this.root.classList.remove('pz-dragging'); },
  // 收尾：拿起的珠子已在 grid 目前所在格，清掉 held 就落回原位；有換過位就結算
  finish() {
    if (this.state !== 'drag') return;
    try { this.cv.releasePointerCapture(this.pid); } catch (er) {}
    const moved = this.moved; this.held = null; this.dropLift();
    this.root.querySelector('#pzTm').style.transform = 'scaleX(1)';
    if (!moved) { this.state = 'idle'; return; }
    this.resolve();
  },

  // ───────── 結算：消除、連鎖、傷害、敵方回合、換波 ─────────
  // 結算中的等待：醒來時已關閉或換了一局（重試、撤退再開）就丟出 PZ_STALE 中止，舊結算不會動到新的一局
  async sleep(ms) { const sid = this.sid; await U.wait(ms); if (!this.on || this.sid !== sid) throw 'PZ_STALE'; },
  async settle() { const sid = this.sid; await this.waitSettle(); if (!this.on || this.sid !== sid) throw 'PZ_STALE'; },
  resolve() { this.state = 'resolve'; return this.resolveTurn().catch((e) => { if (e !== 'PZ_STALE') throw e; }); },
  async resolveTurn() {
    const combos = [];
    for (let wave = 0; wave < 30; wave++) {
      await this.settle();
      const gs = this.groups();
      if (!gs.length) break;
      for (const G of gs) {
        G.cells.forEach(([r, c]) => (this.grid[r][c].die = 0.001));
        combos.push(G);
        const five = G.cells.length >= PZ_CFG.five.min;
        this.comboPop(combos.length, G, five); this.clearFx(G); if (five) this.fiveFx(G);
        await this.sleep(PZ_CFG.comboGap);
      }
      gs.forEach((G) => G.cells.forEach(([r, c]) => (this.grid[r][c] = null)));
      this.drop();
    }
    await this.settle();
    this.turn++;
    if (combos.length) await this.attack(combos);
    if (await this.waveCheck()) return;
    await this.foesTurn();
    if (this.hp <= 0) return this.lose();
    this.endTurn();
  },
  newBuff() { return { pierce: false, combo: 0, atk: [], leech: 0, time: 0, comboUp: 0 }; },
  // 這回合的轉珠秒數：基本＋隊長技＋主動技
  mt() { return this.moveTime + this.base.time + this.buff.time; },
  endTurn() {
    this.team.forEach((m) => (m.cd = Math.max(0, m.cd - 1)));
    this.buff = this.newBuff();
    // 損血代價（bleed）：回合結束扣，不會因此倒下
    this.dots = this.dots.filter((d) => {
      const n = Math.min(this.hp - 1, Math.round(this.hpMax * d.pct));
      if (n > 0) { this.hp -= n; this.float('-' + U.fmt(n), '#c66', 'team'); }
      return --d.n > 0;
    });
    this.hud();
    this.state = 'idle';
  },
  // 這波打完：下一波上場（玩家接著轉珠，敵方不出手）或通關；回傳 true＝這回合到此為止
  async waveCheck() {
    if (this.alive().length) return false;
    if (this.wave >= this.stage.waves.length - 1) { this.win(); return true; }
    await this.sleep(500);
    this.spawn(this.wave + 1);
    await this.sleep(900);
    this.endTurn();
    return true;
  },
  waitSettle() { return new Promise((res) => { const f = () => (!this.on ? res() : this.settled() ? res() : requestAnimationFrame(f)); f(); }); },
  comboPop(n, G, five) {
    const el = this.root.querySelector('#pzCombo');
    el.innerHTML = `<b>${n}</b><span>Combo</span>${five ? '<em>5連珠</em>' : ''}`; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');   // 動畫自己淡出
    el.style.setProperty('--c', PZ_EL[G.c].c);
    this.sfx(five ? 'pz_five' : 'pz_clear', { combo: n });
    if (navigator.vibrate) try { navigator.vibrate(five ? [30, 30, 50] : 12); } catch (er) {}
  },

  // 傷害公式：隊員攻擊 ×（該色每組 1＋多出顆數×25%）×（1＋(Combo−1)×25%）× 隊長技，對目標再乘相剋、扣防禦與減傷
  leadMult(m) { return Roster.mul(this.mods, 'atk', m) * Roster.mul(this.buff.atk, 'atk', m); },
  dmgTo(f, raw, el) {
    const d = raw * pzRel(el, f.el);
    return Math.round(this.buff.pierce || this.base.pierce ? d : Math.max(1, (d - f.def) * (1 - f.dr)));
  },
  // 5 連珠（PZ_CFG.five）：該組另乘加成，且算進 aoe（打全體）；心珠只加成回復
  fiveMult(G) { const F = PZ_CFG.five, k = G.cells.length; return k >= F.min ? 1 + F.bonus + (k - F.min) * F.per : 1; },
  calc(combos) {
    const pow = {}, aoe = {};
    combos.forEach((G) => { const o = G.cells.length >= PZ_CFG.five.min && G.c !== 'heart' ? aoe : pow; o[G.c] = (o[G.c] || 0) + (1 + (G.cells.length - 3) * PZ_CFG.extraOrb) * this.fiveMult(G); });
    const n = combos.length + this.buff.combo + this.base.combo, mult = 1 + (n - 1) * (PZ_CFG.comboStep + this.base.comboUp + this.buff.comboUp);
    const hits = this.team.map((m, i) => { const k = m.atk * mult * this.leadMult(m); return pow[m.el] || aoe[m.el] ? { i, raw: k * (pow[m.el] || 0), aoe: k * (aoe[m.el] || 0) } : null; }).filter(Boolean);
    return { n, mult, hits, heal: pow.heart ? Math.round(this.rcv * pow.heart * mult) : 0, five: combos.some((G) => G.cells.length >= PZ_CFG.five.min) };
  },
  async attack(combos) {
    const R = this.calc(combos);
    this.maxCombo = Math.max(this.maxCombo, R.n);
    if (this.buff.combo + this.base.combo) this.float(`Combo +${this.buff.combo + this.base.combo}`, '#ffd76a', 'mid');
    let total = 0;
    for (const h of R.hits) {
      if (!this.alive().length) break;   // 全倒了：剩下的攻擊不用打
      const m = this.team[h.i], b = this.root.querySelector(`.pz-mem[data-m="${h.i}"]`);
      b.classList.remove('atk'); void b.offsetWidth; b.classList.add('atk');
      // 單體：打目標；5 連珠：打每一隻活著的敵人，相剋依各自屬性
      const shots = [...(h.raw ? [[this.tgt(), h.raw]] : []), ...(h.aoe ? this.alive().map((f) => [f, h.aoe]) : [])];
      let sum = 0, rel1 = 1;
      shots.forEach(([f, raw], k) => {
        if (f.hp <= 0) return;
        const rel = pzRel(m.el, f.el), dmg = this.dmgTo(f, raw, m.el);
        if (!k) rel1 = rel;
        this.hitFoe(f, dmg, rel, PZ_EL[m.el].c);
        sum += dmg;
      });
      const el = document.createElement('span'), all = !!h.aoe;
      el.className = 'pz-mnum' + (all ? ' all' : rel1 > 1 ? ' beat' : rel1 < 1 ? ' weak' : '');
      el.textContent = (all ? '全體 ' : rel1 > 1 ? '剋 ' : rel1 < 1 ? '抗 ' : '') + U.fmt(sum);
      if (all || rel1 === 1) el.style.color = PZ_EL[m.el].c;
      b.appendChild(el); setTimeout(() => el.remove(), 1600);
      total += sum;
      await this.sleep(all ? 260 : 160);
    }
    if (R.heal) this.heal(R.heal);
    if (total && this.buff.leech) { await this.sleep(200); this.heal(Math.round(total * this.buff.leech)); }
    if (total) {
      await this.sleep(250); this.totalDmg(total, R);
      await this.sleep(1350);                                  // 總傷害（滾動約 0.5 秒＋停留約 0.8 秒）播完才換相，兩者不重疊
      for (const f of this.alive()) if (this.phaseCheck(f)) { this.hud(); await this.sleep(1300); }
    }
    await this.sleep(250);
  },
  // 單隻受傷：數字飄在那隻頭上；倒下就淡出
  hitFoe(f, dmg, rel, color) {
    f.hp = Math.max(0, f.hp - dmg);
    const el = this.foeEl(f);
    if (el) {
      const n = document.createElement('span'); n.className = 'pz-fnum' + (rel > 1 ? ' beat' : rel < 1 ? ' weak' : '');
      n.textContent = U.fmt(dmg); n.style.color = rel > 1 ? '#ffe36a' : rel < 1 ? '#a8b4c0' : color || '#fff';
      n.style.setProperty('--dx', Math.round(U.rand(-16, 16)) + 'px');
      el.appendChild(n); setTimeout(() => n.remove(), 900);
      el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
      if (f.hp <= 0) el.classList.add('dead');
    }
    this.sfx('pz_hit', { heavy: rel > 1 });
    this.hud();
  },
  heal(n) {
    const real = Math.min(n, this.hpMax - this.hp); this.hp += real;
    this.float('+' + U.fmt(n), '#ff9ccc', 'team'); this.hud();
  },
  // 換相：血量低於門檻就套用該相的屬性、倒數、減傷、攻擊倍率、吸血
  phaseCheck(f) {
    const P = f.M.phases; if (!P || f.hp <= 0) return false;
    const r = f.hp / f.max;
    let np = 0; P.forEach((p, i) => { if (i && r < p.at) np = i; });
    if (np <= f.phase) return false;
    f.phase = np; const ph = (f.ph = P[np]);
    if (ph.el) f.el = ph.el; f.dr = ph.dr || 0; f.leech = ph.leech || 0; f.atk = Math.round(f.atk0 * (ph.atk || 1));
    if (ph.cd) f.cd = Math.min(f.cd, ph.cd);
    if (ph.banner) this.banner(ph.banner[0], ph.banner[1]);
    if (typeof Audio2 !== 'undefined') Audio2.play('roar');
    const el = this.foeEl(f);
    if (el) { el.classList.toggle('warded', f.dr > 0); el.classList.toggle('enrage', np === P.length - 1 && np > 0 && !!(ph.atk || ph.leech)); }
    if (f.boss) { const bgs = this.stage.ch.bg; this.root.querySelector('.pz-top').style.backgroundImage = `url(${bgs[Math.min(bgs.length - 1, np)] || bgs[0]})`; }
    return true;
  },
  foeCd(f) { return (f.ph && f.ph.cd) || f.M.cd; },
  heavyNext(f) { return f.M.heavy && (f.hits + 1) % f.M.heavy.every === 0; },
  // 敵方回合：每隻倒數 −1，歸零的依序出手
  async foesTurn() {
    this.alive().forEach((f) => f.cd--);
    this.hud();
    const act = this.alive().filter((f) => f.cd <= 0);
    if (!act.length) { await this.sleep(150); return; }
    await this.sleep(250);
    for (const f of act) {
      if (this.hp <= 0) break;
      f.hits++;
      const H = f.M.heavy, heavy = !!H && f.hits % H.every === 0, hm = heavy ? (f.ph && f.ph.heavyMult) || H.mult : 1;
      const dmg = Math.round(f.atk * hm * U.rand(0.92, 1.08));
      const el = this.foeEl(f); if (el) { el.classList.remove('lunge'); void el.offsetWidth; el.classList.add('lunge'); }
      await this.sleep(220);
      this.hp = Math.max(0, this.hp - dmg);
      this.float((heavy ? H.name + ' ' : '-') + U.fmt(dmg), '#ff6a6a', 'team', heavy);
      this.root.classList.remove('hurt'); void this.root.offsetWidth; this.root.classList.add('hurt');
      this.sfx('pz_hurt');
      if (navigator.vibrate) try { navigator.vibrate(heavy ? [40, 40, 60] : 30); } catch (er) {}
      if (f.leech) { const lh = Math.round(dmg * f.leech); f.hp = Math.min(f.max, f.hp + lh); this.float('吸血 +' + U.fmt(lh), '#ff6a7a', 'boss'); }
      f.cd = this.foeCd(f);
      this.hud();
      await this.sleep(act.length > 1 ? 380 : 450);
    }
  },

  // ───────── 隊員技能（冷卻以回合計，施放不結束回合；效果依 roster-cfg.js 的效果庫逐一套用）─────────
  skill(i) {
    const m = this.team[i], sk = m.sk;
    if (this.state !== 'idle' || !sk) return;
    if (m.cd > 0) { this.toast(`${m.name}「${sk.name}」：${sk.desc}（還要 ${m.cd} 回合）`); return; }
    m.cd = sk.cd;
    this.banner(sk.name, m.name);
    this.sfx('pz_cast');
    const art = sk.fx.find((e) => PZ_ART.fx[e.t]); if (art) this.fx(art.t);
    sk.fx.forEach((e) => this.effect(e, m));
    this.hud();
  },
  // 單一效果（主動技）
  effect(e, m) {
    const el = e.el === 'self' ? m.el : e.el, fac = e.fac === 'self' ? m.fac : e.fac;
    switch (e.t) {
      case 'atk': this.buff.atk.push({ ...e, el, fac }); this.float(`${el ? [].concat(el).map((x) => PZ_EL[x].ch).join('') + '屬性' : fac ? PZ_FACS[fac].name : '全隊'}攻擊 ×${e.mult}`, '#ffd76a', 'mid'); break;
      case 'heal': this.heal(Math.round(this.hpMax * (e.pct || 0.2))); break;
      case 'delay': this.alive().forEach((f) => (f.cd = Math.min(9, f.cd + (e.n || 1)))); this.float(`倒數 +${e.n || 1}`, '#9fd8ff', 'boss'); break;
      case 'convert': { const to = e.to || m.el, from = [].concat(e.from || 'heart'); this.grid.forEach((row) => row.forEach((o) => { if (o && from.includes(o.c)) { o.c = to; o.die = 0; } })); break; }
      case 'bleed': this.dots.push({ pct: e.pct || 0.05, n: e.n || 3 }); this.float(`${e.n || 3} 回合損血`, '#c66', 'mid'); break;
      case 'leech': this.buff.leech += e.pct || 0.2; this.float('吸血', '#ff6a7a', 'mid'); break;
      case 'time': this.buff.time += e.sec || 2; this.float(`轉珠 +${e.sec || 2} 秒`, '#9fd8ff', 'mid'); break;
      case 'comboUp': this.buff.comboUp += e.add || 0.1; this.float('連擊加成', '#ffb08a', 'mid'); break;
      case 'pierce': this.buff.pierce = true; this.float('破防', '#f3e7b0', 'mid'); break;
      case 'combo': this.buff.combo += e.n || 1; this.float(`本回合 Combo +${e.n || 1}`, '#ffb08a', 'mid'); break;
      case 'nuke': {
        const f = this.tgt(), nel = (Array.isArray(el) ? el[0] : el) || m.el; if (!f) break;
        this.state = 'resolve';   // 傷害落地前不能轉珠，避免和結算重疊
        const sid = this.sid;
        setTimeout(async () => {
          if (!this.on || this.sid !== sid) return;
          (e.all ? this.alive() : [f]).forEach((t) => { this.hitFoe(t, this.dmgTo(t, m.atk * (e.mult || 10) * this.leadMult(m), nel), pzRel(nel, t.el), PZ_EL[nel].c); this.phaseCheck(t); });
          if (this.alive().length) { this.state = 'idle'; this.hud(); return; }
          // 技能打倒整波：直接換下一波或通關（不算回合、敵方不出手）
          if (this.wave >= this.stage.waves.length - 1) return this.win();
          await U.wait(500); if (!this.on || this.sid !== sid) return;
          this.spawn(this.wave + 1); this.state = 'idle'; this.hud();
        }, 350);
        break;
      }
      default: console.warn('[轉珠] 主動技不支援的效果', e);
    }
  },

  // ───────── 介面更新與提示 ─────────
  hud() {
    const q = (s) => this.root.querySelector(s), T = this.tgt(), multi = this.alive().length > 1;
    q('#pzTHp').style.width = (100 * this.hp) / this.hpMax + '%'; q('#pzTHpT').textContent = `${U.fmt(this.hp)} / ${U.fmt(this.hpMax)}`;
    this.foes.forEach((f) => {
      const el = this.foeEl(f); if (!el) return;
      el.querySelector('.pz-hp i').style.width = (100 * f.hp) / f.max + '%';
      el.querySelector('.pz-hp span').textContent = f.boss ? `${U.fmt(f.hp)} / ${U.fmt(f.max)}` : U.fmt(f.hp);
      const E = PZ_EL[f.el], e = el.querySelector('.pz-el'); e.textContent = E.ch; e.style.setProperty('--c', E.c); e.style.setProperty('--d', E.d);
      el.querySelector('.pz-fname em').textContent = f.boss && f.ph && f.ph.name ? f.ph.name + (f.dr ? `・減傷 ${Math.round(f.dr * 100)}%` : '') + (f.leech ? '・吸血' : '') : '';
      el.querySelector('.pz-fcd b').textContent = Math.max(0, f.cd);
      el.querySelector('.pz-fcd').classList.toggle('danger', f.cd <= 1);
      el.querySelector('.pz-fcd').classList.toggle('heavy', !!this.heavyNext(f));
      el.classList.toggle('tg', multi && f === T);
    });
    // 提示剋制（目前目標）、下次出手是大招的敵人
    if (T) {
      const weak = Object.keys(PZ_BEATS).find((k) => PZ_BEATS[k] === T.el), hv = this.alive().find((f) => this.heavyNext(f));
      q('#pzWarn').innerHTML = `<span>${multi ? '目標 ' : ''}弱點 <i style="color:${PZ_EL[weak].c}">${PZ_EL[weak].ch}</i>　抗 <i style="color:${PZ_EL[PZ_BEATS[T.el]].c}">${PZ_EL[PZ_BEATS[T.el]].ch}</i></span>` +
        (hv ? `<span class="hv">${hv.name}下次：${hv.M.heavy.name}（約 ${U.fmt(hv.atk * ((hv.ph && hv.ph.heavyMult) || hv.M.heavy.mult))}）</span>` : '');
    }
    this.root.querySelectorAll('.pz-mem').forEach((b, i) => {
      const m = this.team[i]; b.classList.toggle('ready', m.cd === 0);
      b.querySelector('.pz-sk').textContent = !m.sk ? '' : m.cd === 0 ? m.sk.name : `${m.sk.name} ${m.cd}`;
    });
  },
  // 總傷害：數字從 0 滾到總數，下方標 Combo 倍率
  totalDmg(total, R) {
    const el = document.createElement('div'); el.className = 'pz-total';
    el.innerHTML = `<b>0</b><small>${R.five ? '<em>5連珠</em>' : ''}${R.n} Combo ×${R.mult.toFixed(2)}</small>`;
    this.root.querySelector('.pz-top').appendChild(el);
    const b = el.firstChild, t0 = performance.now(), dur = 520;
    const step = (now) => { const k = Math.min(1, (now - t0) / dur); b.textContent = Math.round(total * (1 - Math.pow(1 - k, 3))).toLocaleString(); if (k < 1 && el.isConnected) requestAnimationFrame(step); };
    requestAnimationFrame(step); setTimeout(() => el.remove(), 1300);
  },
  float(txt, color, where, big) {
    const fl = this.root.querySelector('#pzFl'), el = document.createElement('span');
    el.className = 'pz-num ' + where + (big ? ' big' : ''); el.textContent = txt; el.style.color = color;
    el.style.setProperty('--dx', where === 'team' ? '0px' : Math.round(U.rand(-40, 40)) + 'px');
    if (where === 'team') { el.style.top = 'auto'; }
    (where === 'team' ? this.root.querySelector('.pz-team') : fl).appendChild(el);
    setTimeout(() => el.remove(), 1100);
  },
  banner(a, b) {
    const el = document.createElement('div'); el.className = 'pz-banner'; el.innerHTML = `<b>${a}</b>${b ? `<span>${b}</span>` : ''}`;
    this.root.querySelector('.pz-top').appendChild(el); setTimeout(() => el.remove(), 1500);
  },
  clearFx(G) {
    const src = this.clr[G.c]; if (!src) return;
    // 每顆被消除的珠子各放一張，固定珠子 1.5 倍大，五行一致、不會蓋到隔壁太多
    const cell = this.cell, size = cell * 1.5, wrap = this.root.querySelector('.pz-boardwrap');
    G.cells.forEach(([r, c]) => {
      const im = new Image(); im.className = 'pz-clr'; im.alt = ''; im.src = src;
      im.style.cssText = `--m:url(${src});width:${size}px;height:${size}px;left:${this.cv.offsetLeft + (c + 0.5) * cell}px;top:${this.cv.offsetTop + (r + 0.5) * cell}px`;
      im.onerror = im.onanimationend = () => im.remove();
      wrap.appendChild(im);
    });
  },
  // 5 連珠特效：屬性圖光爆（PZ_ART.five；沒圖就程式光爆）＋往首領區的光柱＋螢幕閃光＋震動
  fiveFx(G) {
    const cell = this.cell, E = PZ_EL[G.c], rb = this.root.getBoundingClientRect(), cb = this.cv.getBoundingClientRect();
    const cx = cb.left - rb.left + (G.cells.reduce((a, [, c]) => a + c, 0) / G.cells.length + 0.5) * cell;
    const cy = cb.top - rb.top + (G.cells.reduce((a, [r]) => a + r, 0) / G.cells.length + 0.5) * cell;
    const add = (cls, css) => { const d = document.createElement('div'); d.className = cls; d.style.cssText = `--c:${E.c};--d:${E.d};` + css; d.onanimationend = () => d.remove(); this.root.appendChild(d); return d; };
    const src = this.five[G.c], size = cell * (src ? 5 : 4.4), pos = `left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;`;   // 一般消除每顆 1.5 格，這裡約 3 倍（圖的光爆約佔 85%）
    if (src) {
      add('pz-five-dim', pos);
      const im = new Image(); im.className = 'pz-five-img'; im.alt = ''; im.src = src; im.style.cssText = pos;
      im.onerror = im.onanimationend = () => im.remove(); this.root.appendChild(im);
    } else add('pz-five', pos);
    add('pz-five-beam', `left:${cx}px;top:${PZ_LAYOUT.topMin * 0.35}px;height:${cy - PZ_LAYOUT.topMin * 0.35}px;width:${cell * 1.6}px`);
    if (G.c !== 'heart') add('pz-flash', '');
    this.root.classList.remove('pz-shake'); void this.root.offsetWidth; this.root.classList.add('pz-shake');
  },
  fx(t) {
    const src = PZ_ART.fx[t]; if (!src) return;
    const im = new Image(); im.className = `pz-fx fx-${t}`; im.alt = ''; im.src = src;
    im.onerror = im.onanimationend = () => im.remove();
    this.root.querySelector('.pz-top').appendChild(im);   // 不放 #pzFl：它有 z-index，screen 混色會只混到透明底而露出黑框
  },
  toast(msg) {
    const t = this.root.querySelector('#pzToast'); t.textContent = msg; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), 2600);
  },
  help() {
    const L = this.leads.map((l) => `${l.pos}（${l.who}）「${l.name}」${l.desc}`).join('；') + (this.facs.length ? '；陣營加成：' + this.facs.map((f) => `${PZ_FACS[f.fac].name} ${f.n} 人，攻 ×${f.atk}、血 ×${f.hp}`).join('、') : '');
    this.endPanel(`<h3>轉珠說明</h3>
      <p>按住任一顆珠子拖曳，經過的珠子會跟它換位（可斜走）。放開手指，或第一次換位後 ${this.mt()} 秒到，就結算。</p>
      <p>橫或直 3 顆以上同色相連就消除，相連的同色算 1 個 Combo；消除後上方掉珠，可再連鎖。每多 1 Combo 傷害 +25%。</p>
      <p>每位隊員打自己顏色的珠。五行相剋：木剋土、土剋水、水剋火、火剋金、金剋木（剋 1.5 倍、被剋 0.5 倍）。心珠回血。</p>
      <p>敵人頭上數字是出手倒數；有多隻時點敵人可指定攻擊目標。點隊員頭像施放技能（冷卻歸零才能用，不會結束回合）。</p>
      <p>${L || '無隊長技'}</p>`, [['繼續', () => this.endClose()]]);
  },
  endPanel(html, btns) {
    const el = this.root.querySelector('#pzEnd');
    el.innerHTML = `<div class="pz-panel">${html}<div class="pz-row wrap">${btns.map((b, i) => `<button class="pz-btn wide${b[2] ? ' ' + b[2] : ''}" data-b="${i}">${b[0]}</button>`).join('')}</div></div>`;
    el.classList.remove('hidden');
    el.querySelectorAll('[data-b]').forEach((b) => (b.onclick = btns[+b.dataset.b][1]));
  },
  endClose() { this.root.querySelector('#pzEnd').classList.add('hidden'); },
  // 撤退＝失敗（體力不退）
  retreat() {
    if (this.state === 'end') return this.close();
    if (this.state !== 'idle') { this.toast('結算中，這回合結束後才能撤退'); return; }
    this.endPanel('<h3>撤退</h3><p class="c">撤退視同失敗，進場體力不退還</p>', [['撤退', () => this.close()], ['繼續', () => this.endClose()]]);
  },
  result() { return { turns: this.turn, maxCombo: this.maxCombo, hpRatio: this.hp / this.hpMax }; },
  win() {
    if (this.state === 'end') return;
    this.state = 'end';
    if (typeof Audio2 !== 'undefined') Audio2.play('boom');
    const st = this.stage, r = this.result(), W = Stage.onWin(st.id, r);
    const stars = st.stars.map((c, i) => `<li class="${W.all & (1 << i) ? 'on' : ''}${W.newStars & (1 << i) ? ' pzm-new' : ''}"><i>★</i>${Stage.starText(c)}</li>`).join('');
    const i = PZ_STAGES.indexOf(st), next = PZ_STAGES[i + 1];
    const btns = [];
    if (next) btns.push(['下一關', () => this.close(true, st.id), 'go']);
    btns.push([`再戰（${st.cost}）`, () => this.again()], ['返回地圖', () => this.close()]);
    this.endPanel(`<h3>通關</h3><p class="c">${r.turns} 回合・最高 ${r.maxCombo} Combo・剩餘氣血 ${Math.round(r.hpRatio * 100)}%</p>
      <ul class="pzm-starlist">${stars}</ul>
      <p class="c">${W.firstClear ? '<b class="pz-first">首次通關</b><br>' : ''}獲得 ${Stage.rwText(W.rw)}${W.rw.expFull ? '<br><small class="note">修為已滿，多的部分未計入，請先突破</small>' : ''}</p>`, btns);
  },
  lose() {
    this.state = 'end';
    const st = this.stage, alive = this.alive(), left = alive.reduce((a, f) => a + f.hp, 0), max = this.foes.reduce((a, f) => a + f.max, 0);
    this.endPanel(`<h3>道消身殞</h3><p class="c">撐了 ${this.turn} 回合・第 ${this.wave + 1} / ${st.waves.length} 波・敵方剩 ${Math.round((100 * left) / Math.max(1, max))}%</p><p class="c note">進場體力不退還</p>`,
      [[`重試（${st.cost}）`, () => this.again(), 'go'], ['返回地圖', () => this.close()]]);
  },
  // 再戰／重試：再扣一次體力，不夠就提示
  again() {
    const st = this.stage;
    if (!Stage.spend(st.cost)) { this.endPanel(Stage.noSta(st.cost), [['返回地圖', () => this.close()]]); return; }
    this.reset(); this.root.querySelector('#pzFl').innerHTML = ''; this.endClose();
    this.spawn(0); this.hud();
  },

  // 合成短音（Audio2 的音訊環境與音效音量）
  // 音效一律走 Audio2.play(key)：目前是合成音，之後在 audio.js 的 SFX_MAP 掛上音檔就自動換
  sfx(key, opt) { if (typeof Audio2 !== 'undefined') Audio2.play(key, opt); },
};

// ───────── 開發模式入口 ─────────
if (typeof DEV !== 'undefined' && DEV) {
  // 歷練頁最上方加「轉珠關卡」
  const _map = UI.map;
  UI.map = function () {
    _map.apply(this, arguments);
    const box = $('#ctrlContent'), t = box && box.querySelector('.sec-title');
    if (!t) return;
    const b = document.createElement('button');
    b.className = 'region'; b.id = 'pzEntry';
    b.style.cssText = `background-image:url(${PZ_CHAPTERS[0].bg[0]});background-position:${PZ_ART.bgPos}`;
    b.innerHTML = `<h4>轉珠關卡</h4><p>${PZ_CHAPTERS[0].name}</p><span class="prog">測試・體力 ${Stage.sta()} / ${STA_CFG.max}</span>`;
    b.onclick = () => Stage.showMap(1);
    t.after(b);
  };
  // 標題畫面也放一顆入口（沒有存檔也能測）
  const _title = Game.title;
  Game.title = function () {
    _title.apply(this, arguments);
    const b = document.createElement('button'); b.className = 't-imp t-pz'; b.textContent = '轉珠關卡'; b.onclick = () => Stage.showMap(1);
    const s = $('#sceneContent'); if (s) s.appendChild(b);
  };
  // 網址帶 &pz 直接開章節地圖
  if (/[?&]pz(=|&|$)/.test(location.search)) addEventListener('load', () => setTimeout(() => Stage.showMap(1), 50));
}
