'use strict';
// ════════════════════════════════════════════
//  劇情：背景圖＋對話框推進；第一章「凡塵問道」、測靈根、突破天象演出
// ════════════════════════════════════════════

const Story = {
  waiting: null, typing: null, full: '',

  // 可跳過的劇情／演出：跑 fn 期間顯示「跳過」；按下後對話、等待、章節卡都立即結束（需要玩家選擇的卷軸仍會出現）
  skip: false,
  async run(fn) {
    this.skip = false; $('#skipBtn').classList.remove('hidden');
    try { return await fn(); } finally { $('#skipBtn').classList.add('hidden'); this.skip = false; }
  },
  skipNow() {
    this.skip = true; clearInterval(this.typing); this.typing = null; this.hideDlg();
    if (this.waiting) { const r = this.waiting; this.waiting = null; r(); }
  },
  wait(ms) { return new Promise((r) => { const end = Date.now() + ms, f = () => (this.skip || Date.now() >= end ? r() : setTimeout(f, 40)); f(); }); },

  // 對話框：點擊推進，打字中點擊則直接顯示全文
  say(who, text) {
    if (this.skip) return Promise.resolve();
    return new Promise((res) => {
      const box = $('#dlg'); box.classList.remove('hidden'); box.classList.toggle('narr', who === 'narr');
      $('#dlgName').textContent = who === 'narr' ? '' : PEOPLE[who].name;
      this.portrait(who);
      const el = $('#dlgText'); el.textContent = ''; this.full = text; let i = 0;
      clearInterval(this.typing);
      this.typing = setInterval(() => { i++; el.textContent = text.slice(0, i); if (i >= text.length) { clearInterval(this.typing); this.typing = null; } }, 34);
      this.waiting = res; Audio2.play('page');
    });
  },
  // 立繪：有圖的 NPC 站在右側；說話者高亮，其餘變暗；無立繪者說話時收起右側立繪
  portrait(who) {
    const box = $('#sceneContent'), P = PEOPLE[who] || {};
    let npc = box.querySelector('.char.npc');
    if (P.img) {
      if (!npc) { npc = document.createElement('div'); npc.className = 'char npc enter'; npc.innerHTML = '<img alt="">'; box.appendChild(npc); }
      if (npc.dataset.who !== who) { npc.dataset.who = who; npc.querySelector('img').src = NPC_IMG(P.img); npc.querySelector('img').alt = P.name; npc.classList.remove('enter'); void npc.offsetWidth; npc.classList.add('enter'); }
    } else if (npc && who !== 'narr' && who !== 'hero') npc.remove();
    box.querySelectorAll('.char[data-who]').forEach((c) => c.classList.toggle('listen', c.dataset.who !== who));
  },
  advance() {
    if (!this.waiting) return;
    if (this.typing) { clearInterval(this.typing); this.typing = null; $('#dlgText').textContent = this.full; return; }
    const r = this.waiting; this.waiting = null; r();
  },
  async lines(list) { for (const [who, t] of list) await this.say(who, t); },
  hideDlg() { $('#dlg').classList.add('hidden'); },
  stage(bg, grade, chars = '') { UI.setBg(bg, grade); UI.scene(chars); },
  // 入門後有佩劍就換背劍立繪
  heroChar(side = 'left') { const w = S.d.root && S.wTop(); return `<div class="char hero" data-who="hero" style="${side}:4%">${w ? heroArmed(w, 'back') : `<img src="${IMG_SRC.hero_front}" alt="${escHtml(HERO_NAME)}">`}</div>`; },
  card(title, sub) { return new Promise((res) => { const el = document.createElement('div'); el.className = 'card'; el.innerHTML = `<b>${title}</b><span>${sub}</span>`; $('#app').appendChild(el); Audio2.play('gong'); this.wait(3200).then(() => { el.remove(); res(); }); }); },

  // ───────── 第一章 ─────────
  intro() { return this.run(() => this._intro()); },
  async _intro() {
    const replay = !!S.d.story.joined;   // 從「閣」重溫劇情：不重測靈根、不重複發獎勵
    UI.mode('story'); FX.ambient = 'qi';
    Audio2.setMood('title');
    this.stage('title', 'dim');
    await this.lines([
      ['narr', '天地有靈，萬物有道。'],
      ['narr', '青冥山下，青石村中，住著一個名叫林清遠的少年。'],
      ['narr', '他出生那夜，村後古井冒出青光，三日不散。'],
      ['narr', '十六年後，仙門青冥宗開山收徒的消息，傳到了山腳。'],
    ]);
    this.hideDlg(); await this.card('第一章', '凡 塵 問 道');
    Audio2.setMood('village');
    this.stage('village', '', this.heroChar());
    await this.lines([
      ['mother', '清遠，又要去看那座山了？'],
      ['hero', '娘……青冥宗今年開山收徒，我想去試試。'],
      ['mother', '娘知道攔不住你。這枚玉珮，是你出生那夜在古井邊撿到的，帶著吧。'],
      ['narr', '（玉珮觸手溫熱，彷彿有什麼在裡頭輕輕跳動。）'],
      ['elder', '十六年前那道青光，老朽看得真切——那不是凡物。去吧，孩子，石階盡頭便是山門。'],
    ]);
    Audio2.setMood('title');
    this.stage('title', '', this.heroChar());
    await this.lines([
      ['guard', '止步！收徒之期已過三日，凡人請回。'],
      ['hero', '弟子林清遠，求仙長給一次機會。'],
      ['narr', '少年在石階上跪了下來。一日，山風如刀；二日，冷雨如注；三日，霜降石階，膝下成冰。'],
      ['xuanheng', '……三日不退，倒有幾分道心。上前來，將手按在測靈石上。'],
    ]);
    await this.rootTest(replay);
    this.stage('sect', '', this.heroChar());
    Audio2.setMood('sect');
    const R = ROOTS[S.d.root];
    await this.lines([
      ['xuanheng', R.rare ? `${R.name}？！異靈根，百年難遇！` : S.d.grade === '天' || S.d.grade === '地' ? `${S.d.grade}品${R.name}！老夫生平少見。` : `${S.d.grade}品${R.name}，根骨尚可，勤修便是。`],
      ['shizun', '此子，我收了。'],
      ['xuanheng', '凌霄師兄？您已百年不收弟子……'],
      ['shizun', '他在石階上跪了三日，心不動，氣不亂。林清遠，可願隨我入青冥，問一問這天道？'],
      ['hero', '……弟子願意！'],
      ['shizun', '此乃《青冥劍訣》。劍氣破空，便是你的第一式。'],
      ['shizun', '有訣無劍，終是紙上談兵。這柄青鋼劍隨為師下山斬過妖，今日賜你。'],
    ]);
    // 賜劍：主角立繪換成背劍
    if (!replay && !S.d.weapons.qinggang) S.gainWeapon('qinggang');
    if (!S.d.wslot[0]) S.d.wslot[0] = 'qinggang';
    const hc = document.querySelector('.char.hero');
    if (hc) { hc.outerHTML = this.heroChar(); const c = $('#sceneContent .char.hero'); c.classList.add('gift'); FX.converge(c.getBoundingClientRect().left + 80, FX.h * 0.55, 'rgba(232,232,232,0.9)', 18, 160, 0.6); }
    Audio2.play('pickup'); if (!replay) UI.toast('獲得凡器・青鋼劍', WTIERS[0].color);   // 重溫劇情：不重複報獲得
    await this.lines([
      ['hero', '……弟子，定不負此劍。'],
      ['shizun', '修行之道，先固根基。回你的洞府打坐，靈氣自會運轉，離山之時亦不停歇。'],
      ['shixiong', '小師弟，我是陸沉舟。修為穩了，就到演武場來試劍——「歷練」裡的青冥宗。'],
      ['shijie', '我是柳晚吟，守著丹房。靈草送你幾株，聚氣丹能助你修行。'],
    ]);
    if (!replay) { S.d.arts.qingming = 1; S.d.unlocked.sect = true; S.add('herb_q', 4); S.add('herb_c', 2); S.add('stone', 100); }
    S.d.story.joined = true; S.save();
    this.hideDlg(); UI.mode('game'); UI.go('home');
    if (replay) return;   // 重溫劇情：不再顯示入門橫幅與新手提示
    UI.banner('拜入青冥宗', `${S.d.grade}品${R.name}・${rootDesc(S.d.root, S.d.grade)}`);
    setTimeout(() => UI.toast('修為滿了就能「突破」，底部印章切換洞府、歷練、丹房、功法、法寶、機緣'), 3700);
  },

  // 測靈根：走到測靈石前 → 手按石碑 → 符文由下而上亮起 → 靈氣升起 → 對應屬性光柱與品階
  async rootTest(replay) {
    this.hideDlg();
    for (;;) {
      const res = replay ? { root: S.d.root, grade: S.d.grade } : rollRoot();
      await this.steleShow(res, replay);
      if (await this.rootCard(res, replay)) { S.d.root = res.root; S.d.grade = res.grade; S.save(); return; }
    }
  },
  async steleShow({ root, grade }, replay) {
    UI.setBg('title', 'dim');
    UI.scene(`<div class="stele" id="stele"><img class="st-base" src="assets/bg/stele.webp" alt="測靈石"><i class="st-dusk"></i><div class="st-glow"><img src="assets/bg/stele.webp" alt=""></div>
      <img class="st-light" src="assets/fx/wuxing.webp" alt=""><img class="st-pillar" alt="">
      <div class="st-hero"><img class="sh-top" src="assets/hero/walk_back.webp" alt=""><img class="sh-bot" src="assets/hero/walk_back.webp" alt="${escHtml(HERO_NAME)}"></div>
      <img class="st-press" src="assets/hero/press_stele.webp" alt="${escHtml(HERO_NAME)}手按測靈石"><i class="st-hand"></i></div>${replay ? '<p class="st-replay">僅回顧，不會改變靈根</p>' : ''}`);
    const st = $('#stele'), hero = st.querySelector('.st-hero');
    const at = (fx, fy) => { const r = st.getBoundingClientRect(), sc = $('#scene').getBoundingClientRect(); return { x: r.left - sc.left + fx * r.width, y: r.top - sc.top + fy * r.height }; };
    await this.wait(400);
    // 一、走到石碑前：只有一張背影站姿，用上下輕晃與下半身衣袍擺動模擬步伐
    hero.classList.add('walking', 'arrive'); Audio2.play('page');
    await this.wait(2200); hero.classList.remove('walking');
    // 二、手按石碑：換成側身按碑圖，掌心光效
    st.classList.add('touch'); Audio2.play('orb'); FX.shake($('#scene'), 4);
    let p = at(0.415, 0.45); FX.burst(p.x, p.y, 'rgba(200,240,255,0.9)', 18, 140, 3, 0.7);
    await this.wait(700);
    // 三、符文由下而上依序亮起
    for (let i = 1; i <= 5; i++) {
      st.style.setProperty('--lit', i / 5); Audio2.play('page');
      p = at(0.5, 0.7 - i * 0.13); FX.sparks(p.x, p.y, '#bff4ff', 10, 180);
      await this.wait(420);
    }
    // 四、靈氣升起：五行靈光同時浮現
    st.classList.add('rise'); Audio2.play('qi'); FX.shake($('#scene'), 5);
    for (let i = 0; i < 8; i++) { p = at(0.5, 0.74); FX.converge(p.x, p.y - 160, 'rgba(220,240,255,0.85)', 5, 220, 0.8); await this.wait(160); }
    // 五、屬性光柱
    const light = st.querySelector('.st-light');
    if (ROOT_PILLAR[root]) { st.querySelector('.st-pillar').src = ROOT_PILLAR[root]; st.classList.add('shoot-img'); }
    else { light.style.clipPath = `polygon(${ROOT_LIGHT_CLIP})`; light.style.filter = `brightness(.92) contrast(1.7) ${ROOT_LIGHT[root]}`; st.classList.add('shoot'); } Audio2.play('gong'); Audio2.play('thunder'); FX.shake($('#scene'), 12);
    p = at(0.5, 0.74); FX.pillar(p.x, p.y, hexA(ROOTS[root].color, 0.5), 100, 2.4); FX.ring(p.x, p.y, ROOTS[root].color, 20, 300, 1, 5); FX.burst(p.x, p.y - 120, ROOTS[root].color, 50, 320, 4, 1.2);
    FX.flash = 0.5;
    await this.wait(1500);
  },
  // 結果卷軸：確認（主要）／重新測試；重溫劇情時只有確認
  rootCard({ root, grade }, replay) {
    const R = ROOTS[root], G = GRADES[grade], left = Math.max(0, ROOT_REROLLS - (S.d.rootRerolls || 0));
    const el = document.createElement('div'); el.className = 'root-card';
    el.innerHTML = `<div class="rc-head"><b style="color:${R.color}">${R.name}</b><span class="rc-grade" style="--g:${G.color}">${grade}品</span></div>
      <p class="rc-desc">${rootDesc(root, grade)}${R.rare ? '<br><em>異靈根，百年難遇</em>' : ''}</p>
      ${replay ? '<p class="rc-note">僅回顧，不會改變靈根</p>' : ''}<p class="rc-note">品階：天&nbsp;×2、地&nbsp;×1.5、玄&nbsp;×1.2、黃&nbsp;×1（靈根加成倍率）</p>
      <div class="row center">${replay ? '' : left > 0 ? `<button class="seal sm ghost" id="rcAgain">重新測試<small>剩 ${left} 次</small></button>` : '<button class="seal sm ghost" id="rcAgain" disabled>已無重測機會</button>'}<button class="seal" id="rcOk">確認靈根</button></div>`;
    $('#sceneContent').appendChild(el); $('#skipBtn').classList.add('hidden');
    return new Promise((res) => {
      el.querySelector('#rcOk').onclick = () => { Audio2.play('gong'); el.remove(); $('#skipBtn').classList.remove('hidden'); res(true); };
      const again = el.querySelector('#rcAgain'); if (again && left > 0) again.onclick = () => { S.d.rootRerolls = (S.d.rootRerolls || 0) + 1; S.save(); Audio2.play('page'); el.remove(); $('#skipBtn').classList.remove('hidden'); res(false); };
    });
  },

  // 通關後的主線劇情；有播放時回傳 true
  afterClear(rid, idx, first) {
    const R = REGIONS.find((r) => r.id === rid);
    if (R.test || !first || idx !== R.stages.length - 1) return false;   // 測試關不觸發劇情
    const next = { sect: 'village', village: 'wild', wild: 'realm' }[rid];
    const play = (bg, lines, after) => this.run(async () => {
      UI.mode('story'); this.stage(bg, '', this.heroChar());
      await this.lines(lines); this.hideDlg(); UI.mode('game');
      if (after) await after();
      S.save(); UI.go('map');
    });
    if (rid === 'sect') { S.d.unlocked.village = true; play('sect', [['shixiong', '三場試劍，一氣呵成。不錯！'], ['shizun', '山腳青石村近來妖物作亂，連你娘親住的那條巷子也不太平。'], ['shizun', '這是你第一次下山。去吧——活著回來，便是功課。']], () => UI.banner('首次下山', '歷練開放：山腳村')); return true; }
    if (rid === 'village') { S.d.unlocked.wild = true; play('village', [['elder', '清遠……不，該叫仙長了。多虧你，村子保住了。'], ['hunter', '那些東西都是從落霞嶺下來的。嶺上近來夜夜有怪光。'], ['hero', '落霞嶺……我去看看。']], () => UI.banner('落霞嶺', '歷練開放：野外')); return true; }
    if (rid === 'wild') { S.d.unlocked.realm = true; play('sect', [['shizun', '落霞嶺的妖物，比往年多了數倍，並非偶然。'], ['shizun', '嶺東北有一處幽冥古洞，魔氣沖天。為師懷疑有妖將在其中聚煞。'], ['shizun', '秘境靈氣紊亂，每日只能進出三次。萬事小心。']], () => UI.banner('幽冥古洞', '秘境開放・每日三次')); return true; }
    if (rid === 'realm') { this.ending(); return true; }
    return false;
  },

  ending() { return this.run(() => this._ending()); },
  async _ending() {
    UI.mode('story'); Audio2.setMood('dungeon');
    this.stage('realm', '', `<div class="char" data-who="yaojiang" style="left:50%;transform:translateX(-50%);height:66%"><img src="assets/mon/yaojiang.webp" alt="厲蒼" style="filter:brightness(.7) drop-shadow(0 0 20px rgba(255,40,50,.6))"></div>`);
    await this.lines([
      ['yaojiang', '咳……人族小輩……你身上……那股氣息……是那塊玉珮？'],
      ['yaojiang', '哈……原來……十六年前那道青光……是你……'],
      ['hero', '你說什麼？把話說清楚！'],
      ['narr', '妖將化作黑煙散去。懷中的玉珮，燙得驚人。'],
    ]);
    Audio2.setMood('sect');
    this.stage('sect', '', this.heroChar());
    await this.lines([
      ['hero', '師尊，妖將臨死前盯著弟子的玉珮，說了句「原來是你」。'],
      ['shizun', '……給為師看看。'],
      ['narr', '凌霄真人凝視玉珮良久，眼底閃過一絲波瀾。'],
      ['shizun', '此事，日後再說。在為師查明之前，莫讓旁人見到這枚玉珮。'],
    ]);
    this.hideDlg();
    S.d.story.ch1 = true; S.save();
    await this.card('第一章　凡塵問道', '完');
    UI.mode('game'); UI.go('home');
    UI.toast('第二章「築基問心」待續。秘境可每日挑戰，持續修煉、收集法寶吧。', '#ffe7a0');
  },

  async replay() { await this.intro(); },

  // ───────── 突破演出：一、蓄力（光環展開）→ 二、雷劫（天象、雷光、震動）→ 三、成功（法相、光環擴散、閃光）或失敗跌落 ─────────
  breakShow(use) { return this.run(() => this._breakShow(use)); },

  // 雷劫：雷雲壓下 → 每道雷前 0.5 秒紅圈預警（可按「渡劫」減傷）→ 天雷劈下、白閃、震動、落點爆發、靈罩裂紋
  // 回傳成功率加成：剩餘護體越多越高
  async tribulation(major, stage, footX, footY, cy) {
    const sc = $('#sceneContent'), n = major ? TRIB.major : TRIB.minor, r = stage.getBoundingClientRect(), s0 = $('#scene').getBoundingClientRect();
    const headY = r.top - s0.top + r.height * 0.08;
    sc.insertAdjacentHTML('beforeend', `<div class="bt-shield" style="left:${footX}px;top:${cy}px;width:${r.width * 1.05}px;height:${r.height * 1.05}px"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path class="ck ck1" d="M50 8 L44 26 L53 34 L46 52"/><path class="ck ck2" d="M20 30 L33 40 L28 55 L38 66"/><path class="ck ck3" d="M80 32 L68 44 L74 58 L63 70"/><path class="ck ck4" d="M46 52 L57 63 L50 80 L58 92"/></svg></div>
      <div class="bt-warn" style="left:${footX}px;top:${headY}px"></div>
      <div class="bt-hud"><span>雷劫 <b id="tbN">0</b> / ${n}</span><span>護體</span><div class="bar mp"><i id="tbS" style="width:100%"></i></div><b id="tbP">100%</b></div>
      <button class="seal bt-tap hidden" id="tbTap">渡劫<small>紅圈收攏時按</small></button>`);
    const shield = sc.querySelector('.bt-shield'), warn = sc.querySelector('.bt-warn'), tap = sc.querySelector('#tbTap'), cloud = sc.querySelector('.bt-cloud');
    // 雷雲漸漸壓下、畫面變暗
    sc.querySelector('.bt-dark').classList.add('on'); cloud.classList.add('on'); Audio2.play('roar'); Audio2.loop('meditate', false); Audio2.setMood('trib');   // 雷劫音樂＋雷雲翻湧
    UI.banner(major ? '九霄雷劫' : '小天劫', `${n} 道天雷將至——紅圈收攏時按「渡劫」`);
    requestAnimationFrame(() => shield.classList.add('on'));
    await this.wait(1600);
    document.querySelectorAll('#scene .banner').forEach((b) => b.remove());   // 標題不擋住落雷
    tap.classList.remove('hidden');
    const weight = (i) => (i === n - 1 ? 2.4 : 1 + i * 0.18), total = Array.from({ length: n }, (_, i) => weight(i)).reduce((a, b) => a + b, 0);
    const dmgTotal = major ? TRIB.dmg.major : TRIB.dmg.minor;
    let hp = 1, taps = 0;
    for (let i = 0; i < n; i++) {
      const last = i === n - 1, power = i / Math.max(1, n - 1);
      // 預警：雲心閃電、頭頂紅圈收攏 0.5 秒
      let tapAt = 0; const strikeAt = performance.now() + TRIB.warn;
      tap.onclick = () => { if (!tapAt) { tapAt = performance.now(); tap.classList.add('pressed'); } };
      cloud.classList.remove('warn'); void cloud.offsetWidth; cloud.classList.add('warn');
      warn.classList.remove('go'); void warn.offsetWidth; warn.classList.add('go'); Audio2.play('array');   // 音效：落雷預警
      await this.wait(TRIB.warn);
      // 判定：落雷前 0.2 秒內按下為「點準」
      const dt = tapAt ? strikeAt - tapAt : Infinity, grade = dt <= 200 && dt >= -80 ? 'perfect' : dt <= TRIB.warn ? 'good' : 'none';
      tap.classList.remove('pressed');
      const mult = grade === 'perfect' ? TRIB.perfect : grade === 'good' ? TRIB.good : 1;
      if (grade !== 'none') taps++;
      hp = Math.max(0.03, hp - (dmgTotal * weight(i) / total) * mult);
      this.strike(footX, cy, headY, power, last, shield, 1 - hp, grade);
      $('#tbN').textContent = i + 1; $('#tbS').style.width = hp * 100 + '%'; $('#tbP').textContent = Math.round(hp * 100) + '%';
      // 後幾道間隔更短
      await this.wait(last ? 1500 : (major ? 1000 - power * 550 : 1100));
    }
    tap.classList.add('hidden'); warn.classList.remove('go');
    return 0.3 * (hp - (1 - dmgTotal));   // 不點時加成為 0；點得越準越高
  },
  // 一道天雷：天雷圖劈下、全畫面白閃、震動、落點爆發、衝擊波、靈罩裂紋與碎片
  strike(x, cy, headY, power, last, shield, crack, grade) {
    const sc = $('#sceneContent'), w = last ? 2.3 : 0.75 + power * 0.6;
    const tmp = document.createElement('div');
    tmp.innerHTML = `<img class="bt-bolt" src="assets/fx/thunder_bolt.webp" alt="" style="left:${x}px;height:${last ? cy + 60 : headY + 60}px;--w:${w};--b:${1 + power * 0.5 + (last ? 0.4 : 0)}"><img class="bt-impact" src="assets/fx/thunder_impact.webp" alt="" style="left:${x}px;top:${cy + 40}px;--s:${last ? 1.6 : 0.8 + power * 0.5}">`;
    const els = [...tmp.children]; els.forEach((e) => sc.appendChild(e));
    setTimeout(() => els.forEach((e) => e.remove()), last ? 1300 : 700);
    $('#scene').classList.remove('bt-hit'); void $('#scene').offsetWidth; $('#scene').classList.add('bt-hit');
    FX.flash = last ? 0.5 : 0.25 + power * 0.15; Audio2.play('thunder'); if (last) Audio2.play('boom');   // 音效：天雷落下
    FX.shake($('#scene'), last ? 22 : 10 + power * 8);   // 震動（設定可關）
    FX.ring(x, cy + 40, '#e6d6ff', 20, last ? 420 : 220 + power * 120, 0.6, 5);
    FX.burst(x, cy, '#bff4ff', 14 + Math.round(crack * 30), 260, 3, 0.8);   // 靈罩碎片
    shield.style.setProperty('--crack', crack.toFixed(2)); shield.classList.remove('hit'); void shield.offsetWidth; shield.classList.add('hit');
    FX.text(x, cy - 40, { perfect: '渡劫・減傷', good: '稍早・減傷', none: '硬抗' }[grade], grade === 'perfect' ? '#ffe7a0' : grade === 'good' ? '#bff4ff' : '#ff9a9a', grade === 'perfect' ? 24 : 18);
  },
  // 雷劫結束：成功則餘雷消散、雲層散開；失敗則雷光擊倒主角、靈罩碎裂
  async tribEnd(ok, stage, x, cy) {
    const sc = $('#sceneContent'), cloud = sc.querySelector('.bt-cloud'), shield = sc.querySelector('.bt-shield');
    sc.querySelectorAll('.bt-hud,.bt-tap,.bt-warn').forEach((e) => e.remove());
    if (ok) {
      for (let i = 0; i < 10; i++) FX.sparks(U.rand(0, FX.w), U.rand(0, FX.h * 0.4), '#d8c8ff', 4, 120);
      cloud.classList.add('clear'); sc.querySelector('.bt-dark').classList.remove('on'); shield.classList.add('fade');
      await this.wait(1000);
    } else {
      this.strike(x, cy, cy * 0.55, 1, true, shield, 1, 'none');
      shield.classList.add('shatter'); FX.burst(x, cy, '#bff4ff', 60, 360, 4, 1.2);
      stage.classList.add('down'); cloud.classList.add('clear'); sc.querySelector('.bt-dark').classList.remove('on');
      await this.wait(1400);
    }
  },
  async _breakShow(use) {
    const major = isMajor(S.d.lv), cx = FX.w / 2, before = S.stats(), rate0 = S.rate();
    $('#ctrlContent').style.pointerEvents = 'none'; $('#nav').style.pointerEvents = 'none'; $('#controls').classList.add('busy');
    const sc = $('#sceneContent'), stage = sc.querySelector('.hero-stage'), r = stage.getBoundingClientRect(), s0 = $('#scene').getBoundingClientRect();
    const footX = r.left - s0.left + r.width / 2, footY = r.bottom - s0.top - r.height * 0.06, cy = footY - r.height * 0.45;
    const fxp = Char.cur().faxiang, faxiang = fxp && typeof ASSET_LIST !== 'undefined' && ASSET_LIST.includes(fxp) ? fxp : null;   // 該角色的法相圖；沒有就不顯示（不借用別人的）
    sc.insertAdjacentHTML('afterbegin', '<i class="bt-dark"></i><div class="bt-cloud"><img src="assets/fx/thunder_cloud.webp" alt=""><i class="bt-core"></i></div>' + (faxiang ? `<img class="bt-faxiang" src="${faxiang}" alt="">` : ''));
    stage.insertAdjacentHTML('beforebegin', `<div class="bt-ring" style="left:${footX}px;top:${footY}px"><img src="assets/fx/ring.webp" alt=""></div>`);
    const ring = sc.querySelector('.bt-ring'), fx = sc.querySelector('.bt-faxiang');
    // 一、蓄力
    UI.banner('靈氣匯聚', '天地靈氣，盡歸丹田'); Audio2.play('qi');
    requestAnimationFrame(() => ring.classList.add('on'));
    for (let i = 0; i < 22; i++) { FX.converge(footX, cy, 'rgba(159,232,255,0.95)', 8, Math.max(FX.w, FX.h) * 0.6, 1.2); await this.wait(90); }
    // 二、雷劫
    const bonus = await this.tribulation(major, stage, footX, footY, cy);
    const res = S.breakthrough(use, bonus);
    if (res.ok) await this.tribEnd(true);
    else await this.tribEnd(false, stage, footX, cy);
    let panel;
    if (res.ok) {
      // 三、成功
      if (fx) fx.classList.add('on'); ring.classList.add('burst'); $('#scene').classList.add('bt-white');
      FX.flash = 1; FX.ring(footX, cy, '#ffe7a0', 20, 420, 1.3, 7); FX.burst(footX, cy, '#ffe7a0', 70, 380, 4, 1.3);
      Audio2.play('up'); Audio2.play('gong');
      UI.banner(res.major ? `晉入${REALMS[Math.floor(res.to / 3)]}期` : lvName(res.to), res.major ? '脫胎換骨，壽元大增' : '瓶頸破開，修為精進');
      const after = S.stats(), f = (v) => (typeof v === 'number' ? U.fmt(v) : v), row = (n, a, b) => `<div><span>${n}</span><b>${f(a)}</b><i>→</i><b class="up">${f(b)}</b></div>`;
      panel = `<h3>${lvName(res.to)}</h3><div class="bt-stats">${row('氣血', before.hp, after.hp)}${row('攻擊', before.atk, after.atk)}${row('防禦', before.def, after.def)}${row('靈力', before.mp, after.mp)}${row('修煉', rate0.toFixed(1) + '／息', S.rate().toFixed(1) + '／息')}</div><div class="row center"><button class="seal" id="btOk">穩固境界</button></div>`;
    } else {
      ring.classList.add('broken'); Audio2.play('fail');
      // 已在最低境界（練氣初期）時不會再跌，只散去一半修為
      const drop = res.to < res.from;
      UI.banner(res.major ? '渡劫失敗' : '突破失敗', drop ? '道基受震，境界跌落' : '道基受震，修為散去');
      panel = `<h3 class="fail">${drop ? `${lvName(res.from)} → ${lvName(res.to)}` : lvName(res.to)}</h3><p>${drop ? '境界跌落一層，修為散去，只剩此境一半。' : '修為散去，只剩一半。'}<br>多備破障丹再來。</p><div class="row center"><button class="seal" id="btOk">重新修煉</button></div>`;
    }
    await this.wait(1400);
    $('#scene').classList.remove('bt-white'); document.querySelectorAll('#scene .banner').forEach((b) => b.remove());
    sc.insertAdjacentHTML('beforeend', `<div class="bt-panel">${panel}</div>`);
    $('#skipBtn').classList.add('hidden');   // 等玩家按結果時不需要跳過
    await new Promise((ok) => (sc.querySelector('#btOk').onclick = ok));
    sc.querySelectorAll('.bt-dark,.bt-cloud,.bt-faxiang,.bt-ring,.bt-panel,.bt-hud,.bt-shield,.bt-warn,.bt-tap').forEach((e) => e.remove());
    stage.classList.remove('down');
    $('#ctrlContent').style.pointerEvents = ''; $('#nav').style.pointerEvents = ''; $('#controls').classList.remove('busy');
    UI.hud(); UI.go('home');
  },
};
// 擲靈根與品階（依權重）
function rollRoot() {
  const pick = (W) => { let r = Math.random() * Object.values(W).reduce((a, b) => a + b, 0); for (const k in W) if ((r -= W[k]) <= 0) return k; return Object.keys(W)[0]; };
  return { root: pick(ROOT_WEIGHTS), grade: pick(Object.fromEntries(Object.entries(GRADES).map(([k, g]) => [k, g.w]))) };
}
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
