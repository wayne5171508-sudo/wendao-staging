'use strict';
// ════════════════════════════════════════════
//  主程式：標題、迴圈（修為自動增長、戰鬥、特效）、自動存檔
// ════════════════════════════════════════════

const Game = {
  last: 0, saveT: 0, hudT: 0,

  async init() {
    FX.init($('#fx'));
    // 顯示尺寸不超過原圖像素：圖片載入後以原生高度為上限（佩劍立繪的外框一起限制，劍光座標才對得上）
    document.addEventListener('load', (e) => { const i = e.target; if (i.tagName !== 'IMG' || !i.naturalHeight || !/\/(hero|npc|cast|mon|weapon)\//.test(i.src)) return; i.style.maxHeight = i.naturalHeight + 'px'; if (i.parentElement.classList.contains('hfig')) i.parentElement.style.maxHeight = i.naturalHeight + 'px'; }, true);
    addEventListener('resize', () => FX.resize());
    // 共用 keep-ratio：畫面上所有圖片（含之後動態插入的）都保持原比例
    const keep = (root) => { if (root.tagName === 'IMG') root.classList.add('keep-ratio'); else if (root.querySelectorAll) root.querySelectorAll('img:not(.keep-ratio)').forEach((i) => i.classList.add('keep-ratio')); };
    keep(document.body); new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach(keep))).observe(document.body, { childList: true, subtree: true });
    // 圖片載入失敗備援：靈石換成文字圓章，其他圖隱藏並讓外框改用 CSS 備援樣式，不出現破圖或白屏
    const imgFail = (i) => {
      if (i.dataset.fb) { const f = i.dataset.fb; delete i.dataset.fb; if (!f.startsWith('data:')) i.classList.add('loot-fb'); else i.classList.remove('loot-fb'); i.src = f; return; }   // 抽中素材的備援鏈
      if (i.dataset.failed) return; i.dataset.failed = '1';
      if (i.classList.contains('item-ico')) { const p = i.parentElement; p.classList.remove('img', 'item'); p.textContent = p.dataset.ball || '?'; console.warn('[圖示] 載入失敗，改用佔位圓球：' + i.getAttribute('src')); return; }   // 圖缺：換回圓球
      if (i.classList.contains('mat-ico')) { i.remove(); return; }
      if (i.classList.contains('stone-ico')) { const f = document.createElement('i'); f.className = 'stone-fb'; f.textContent = '石'; i.replaceWith(f); return; }
      i.style.visibility = 'hidden'; if (i.parentElement) i.parentElement.classList.add('img-fail');
    };
    document.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') imgFail(e.target); }, true);
    [...document.images].forEach((i) => { if (i.complete && !i.naturalWidth && i.getAttribute('src')) imgFail(i); });   // 程式啟動前就已失敗的（頂部資源列）
    const had = S.load(); Char.apply(); Cloud.init();
    FX.noShake = S.d.settings.shake === false; FX.applyLevel();
    // 點擊推進對話；按鈕
    $('#dlg').addEventListener('click', () => Story.advance());
    $('#skipBtn').onclick = (e) => { e.stopPropagation(); Story.skipNow(); };
    $('#scene').addEventListener('click', (e) => { if (Story.waiting && !e.target.closest('button')) Story.advance(); });
    addEventListener('keydown', (e) => { if ([' ', 'Enter'].includes(e.key) && Story.waiting) { e.preventDefault(); Story.advance(); } });
    addEventListener('pointerdown', () => Audio2.unlock(), { once: true });
    document.querySelectorAll('#nav button').forEach((b) => (b.onclick = () => { Audio2.play('page'); UI.go(b.dataset.tab); }));
    $('#btnSet').onclick = () => UI.settings();
    $('#btnBag').onclick = () => UI.bag();
    $('#btnMute').onclick = (e) => { e.stopPropagation(); Audio2.toggleMute(); };   // 主畫面右上角靜音
    Audio2.applyVol(); $('#btnMute').textContent = Audio2.set.mute ? '靜' : '聲'; $('#btnMute').classList.toggle('off', Audio2.set.mute);
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') UI.close(); });
    // 字型與首批素材同時下載
    await Promise.all([document.fonts ? Promise.race([document.fonts.load('700 24px "LXGW WenKai TC"', '問道青冥入道續緣'), U.wait(2000)]).catch(() => {}) : 0, this.preload()]);
    // 進到標題後才在背景下載其餘素材並註冊離線快取，不跟首批素材搶頻寬
    setTimeout(() => {
      (this.later || []).forEach((s, i) => setTimeout(() => { const im = new Image(); im.src = s; }, i * 80));
      if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }, 2500);
    this.title(had && S.d.root);
    if (S.loadError) UI.modal('存檔讀取異常', S.recovered && S.d.root
      ? '<p class="big">存檔有部分資料損毀，已修復</p><p class="note" style="text-align:center">損毀的欄位已換回預設值，原始存檔已另存備份。<br>可按「續緣」繼續修行。</p><div class="row center"><button class="seal" id="leOk">知道了</button></div>'
      : '<p class="big">存檔損毀，無法讀取</p><p class="note" style="text-align:center">原始存檔已另存備份，請勿清除瀏覽器資料。<br>有匯出過存檔可用「匯入存檔」還原；按「入道」會開始新的修行。</p><div class="row center"><button class="seal" id="leOk">知道了</button></div>', { '#leOk': () => UI.close() });
    requestAnimationFrame((t) => { this.last = t; this.loop(t); });
    addEventListener('visibilitychange', () => { if (document.hidden) S.save(); else if (S.d.root && !Battle.on) { const o = S.offline(); if (o) { UI.offlineModal(o); UI.hud(); } } });
    addEventListener('beforeunload', () => S.save());
  },

  // 首次載入：先下載標題與開場劇情要用的素材並顯示進度條，其餘（戰鬥、丹房、法寶等）進遊戲後在背景下載
  // 之後由離線快取提供，幾乎瞬間完成
  async preload() {
    const all = typeof ASSET_LIST !== 'undefined' ? ASSET_LIST : [], first = /\/(bg|npc|hero)\/(?!gacha_)|\/ui\/stone|wuxing|pillar_/;
    const list = all.filter((s) => first.test(s)), bar = $('#ldBar'), txt = $('#ldTxt'), box = $('#loader');
    const later = all.filter((s) => !first.test(s) && !s.startsWith('assets/dual/'));
    let done = 0;
    const tick = () => { done++; const p = Math.round((100 * done) / list.length); bar.style.width = p + '%'; txt.textContent = `載入中 ${p}%`; };
    const one = (src) => new Promise((res) => { const i = new Image(); i.onload = i.onerror = () => { tick(); res(); }; i.src = src; });
    for (let k = 0; k < list.length; k += 6) await Promise.all(list.slice(k, k + 6).map(one));   // 同時 6 個，手機網路較穩
    box.classList.add('done'); setTimeout(() => box.remove(), 600);
    this.later = later;
  },

  title(hasSave) {
    UI.mode('title'); UI.setBg('title'); Audio2.setMood('title'); FX.ambient = 'qi'; FX.cranesOn = true; FX.craneT = 1.5;
    UI.scene(`<div class="tlogo"><h1><span>問</span><span>道</span><span>青</span><span>冥</span></h1><p>一劍霜寒　逆天問道</p></div>
      <div class="tbtns">${hasSave ? `<span id="saveInfo">${lvName(S.d.lv)}・${ROOTS[S.d.root].name}（${S.d.grade || '黃'}品）</span>` : ''}
        <button class="seal${hasSave ? ' ghost' : ''}" id="tNew">入道<span class="cap">新的修行</span></button>
        ${hasSave ? '<button class="seal" id="tCont">續緣<span class="cap">繼續修行</span></button>' : ''}</div>
      <button class="t-imp" id="tImp">匯入存檔</button><button class="t-imp t-cloud" id="tCloud">${Cloud.on ? '雲端已登入' : '雲端登入'}</button>`);
    $('#tNew').onclick = () => {
      if (hasSave) { UI.modal('新的修行', '<p class="big">將覆蓋現有存檔，確定嗎？</p><div class="row center"><button class="seal" id="nY">重新入道</button><button class="seal ghost sm" id="nN">取消</button></div>', { '#nY': () => { UI.close(); this.begin(); }, '#nN': () => UI.close() }); return; }
      this.begin();
    };
    const c = $('#tCont'); if (c) c.onclick = () => this.resume();
    $('#tImp').onclick = () => UI.importSave(true);
    $('#tCloud').onclick = () => (Cloud.on ? UI.toast(`已登入 ${Cloud.user.email || ''}`, '#9fe8d8') : Cloud.signIn());
  },
  async begin() {
    Audio2.unlock(); S.reset(); S.d = S.fresh();
    // 選擇角色（男主／女修），之後名稱、劇情稱呼、立繪都跟著切換
    // 點角色列先展開半身立繪與介紹，再按「選擇」確認
    const INTRO = { qingyuan: '青石村少年，出生那夜古井青光三日不散。', yunxi: '青石村少女，劍心澄澈，生而帶玉。' };
    S.d.dao.char = await new Promise((res) => UI.modal('選擇修行之人', `<p class="note ch-hint" style="text-align:center">點選角色查看介紹</p><div class="list">${Object.values(CHARACTERS).map((C) => `<div class="li ch-row" data-chrow="${C.id}">${gIco('ui', 'char_' + C.id, 'pface')}<div><h4>${C.name}</h4><p>${C.gender === 'f' ? '女修' : '男修'}</p><p class="ch-intro">${INTRO[C.id] || ''}</p></div><img class="ch-front" src="${C.assetDir}front.webp" alt="${C.name}" onerror="this.remove()"><button class="seal sm" data-ch="${C.id}">選擇</button></div>`).join('')}</div>`,
      { '[data-chrow]': (el) => { document.querySelectorAll('#mBody .ch-row').forEach((r) => r.classList.toggle('open', r === el)); $('#mBody .ch-hint').textContent = '再按「選擇」確認'; },
        '[data-ch]': (el) => { if (el.closest('.ch-row').classList.contains('open')) { UI.close(); res(el.dataset.ch); } } }));
    Char.apply(); S.save();
    await UI.fade(true); UI.fade(false);
    Story.intro();
  },
  async resume() {
    Audio2.unlock();
    await UI.fade(true);
    const o = S.offline();
    UI.mode('game'); UI.go('home'); UI.fade(false);
    if (o) UI.offlineModal(o);
    if (S.migrated) setTimeout(() => UI.toast(`法寶改為兵器系統，舊法寶 ${S.migrated} 件已折成靈石`, '#ffe7a0'), 600);
    S.save();
  },

  loop(t) {
    let dt = Math.min(0.1, (t - this.last) / 1000); this.last = t;
    // 暴擊定格：這段時間戰鬥與特效暫停
    if (this.freeze > 0) { this.freeze -= dt; dt = 0; }
    // 洞府靈氣自行運轉
    if (S.d && S.d.root && !S.full()) S.addExp(S.rate() * dt);
    Battle.tick(dt);
    FX.frame(dt);
    this.hudT += dt;
    if (this.hudT > 0.25) { this.hudT = 0; if (S.d && S.d.root) { UI.homeRefresh(false); if (!$('#app').classList.contains('title-mode')) UI.hud(); } }
    this.saveT += dt;
    if (this.saveT > 10) { this.saveT = 0; if (S.d && S.d.root) S.save(); }
    requestAnimationFrame((tt) => this.loop(tt));
  },
};

window.addEventListener('load', () => Game.init());
