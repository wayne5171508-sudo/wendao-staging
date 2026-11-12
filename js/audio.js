'use strict';
// ════════════════════════════════════════════
//  AudioManager（Web Audio API）
//  ・兩條音量匯流：BGM、SFX，各自可調，設定存在 localStorage（wendao_audio）
//  ・BGM：洞府、戰鬥、精英／頭目、抽卡、雷劫；切換交叉淡入淡出約 1 秒，同時只播一首
//    長曲用 <audio> 串流（解碼成 PCM 一首就要幾十 MB），先 fetch 成 blob（離線由 service worker 提供）
//    抽卡沒有音檔，用原本的古琴竹笛即時合成；任何音檔載入失敗也退回合成，不影響遊戲
//  ・SFX：短音效預先解碼；同一音效最多同時 4 個；沒有素材的音效用即時合成
//  ・第一次點擊畫面才啟動；切到背景或鎖屏時暫停
// ════════════════════════════════════════════

const AUDIO_KEY = 'staging_wendao_audio';
const BGM_SRC = { home: 'assets/audio/bgm_home.mp3', battle: 'assets/audio/bgm_battle.mp3', boss: 'assets/audio/bgm_boss.mp3', gacha: 'assets/audio/bgm_gacha.mp3', trib: 'assets/audio/bgm_trib.mp3', tribIntro: 'assets/audio/bgm_trib_intro.mp3' };
// 短音效：assets/audio/sfx_<key>.mp3
const SFX_SRC = { slash: 'slash', crit: 'crit', hurt: 'hurt', cast: 'cast', thunder: 'thunder', gather: 'gather', divine: 'divine', meditate: 'meditate',
  reveal_fan: 'reveal_fan', reveal_ling: 'reveal_ling', reveal_xuan: 'reveal_xuan', reveal_xian: 'reveal_xian', reveal_shen: 'reveal_shen' };
// 揭曉音效依品階：凡、靈、玄、仙、神
const REVEAL_SFX = ['reveal_fan', 'reveal_ling', 'reveal_xuan', 'reveal_xian', 'reveal_shen'];
// 舊的場景名稱對應到 BGM
const MOOD_BGM = { title: 'home', village: 'home', sect: 'home', wild: 'home', dungeon: 'battle', battle: 'battle', boss: 'boss', gacha: 'gacha', trib: 'trib' };
// 遊戲內音效名稱 → 素材（含音量、音高隨機）；沒有列在這裡的只用合成
const SFX_MAP = { swing1: ['slash', 0.8, 0.06], swing2: ['slash', 0.8, 0.06], swing3: ['slash', 0.9, 0.04], hitHeavy: ['crit', 0.9, 0.04], hurt: ['hurt', 0.9, 0.05], thunder: ['thunder', 0.85, 0.04], cast: ['cast', 0.7, 0.03], gather: ['gather', 0.8, 0], divine: ['divine', 1, 0], meditate: ['meditate', 0.3, 0] };
const FADE = 0.7, FADE_IN_DELAY = 0.4, SFX_MAX = 4, MEDITATE_VOL = 0.16;   // 先淡出、0.4 秒後再淡入：總長約 1.1 秒，兩首只重疊約 0.3 秒

const Audio2 = {
  ctx: null, bgmBus: null, sfxBus: null, synthOut: null, verb: null,
  set: { bgm: 0.7, sfx: 0.8, mute: false },
  mood: 'title', cur: null, want: 'home', tracks: {}, buffers: {}, active: {}, loops: {}, nextT: 0, beat: 0, drone: null,
  get musOn() { return !this.set.mute && this.set.bgm > 0; },
  get sfxOn() { return !this.set.mute && this.set.sfx > 0; },

  loadSet() { try { Object.assign(this.set, JSON.parse(localStorage.getItem(AUDIO_KEY) || '{}')); } catch (e) {} },
  saveSet() { try { localStorage.setItem(AUDIO_KEY, JSON.stringify(this.set)); } catch (e) {} },
  applyVol() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, m = this.set.mute ? 0 : 1;
    this.bgmBus.gain.setTargetAtTime(m * this.set.bgm * 0.8, t, 0.08);
    this.sfxBus.gain.setTargetAtTime(m * this.set.sfx * 0.9, t, 0.05);
    document.querySelectorAll('#btnMute').forEach((b) => { b.textContent = this.set.mute ? '靜' : '聲'; b.classList.toggle('off', this.set.mute); });
  },
  setVol(kind, v) { this.set[kind] = U.clamp(v, 0, 1); this.saveSet(); this.applyVol(); },
  toggleMute() { this.set.mute = !this.set.mute; this.saveSet(); this.unlock(); this.applyVol(); },

  // 第一次點擊畫面時呼叫（瀏覽器自動播放限制）
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.bgmBus = c.createGain(); this.bgmBus.connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.connect(c.destination);
    // 合成配樂（抽卡 BGM）當成一條 BGM 軌
    this.synthOut = c.createGain(); this.synthOut.gain.value = 0; this.synthOut.connect(this.bgmBus);
    this.verb = c.createConvolver();
    const len = c.sampleRate * 3.8, ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    this.verb.buffer = ir;
    const wet = c.createGain(); wet.gain.value = 0.55; this.verb.connect(wet); wet.connect(this.synthOut);
    this.tracks.synth = { gain: this.synthOut, synth: true };   // 任何 BGM 檔缺少時的備援
    // iOS：在使用者點擊當下先建立 <audio>，之後換 src 播放才不會被擋
    for (const k of Object.keys(BGM_SRC)) this.makeTrack(k);
    this.applyVol();
    this.startMusic();
    this.preloadSfx();
    const w = this.want; this.cur = null; this.bgm(w);
  },
  makeTrack(key) {
    const el = new Audio(); el.preload = 'auto'; el.loop = key !== 'tribIntro'; el.crossOrigin = 'anonymous';
    const tr = { el, gain: this.ctx.createGain(), ready: null };
    tr.gain.gain.value = 0;
    try { this.ctx.createMediaElementSource(el).connect(tr.gain); } catch (e) { tr.broken = true; }
    tr.gain.connect(this.bgmBus);
    this.tracks[key] = tr;
  },
  // 載入 BGM：fetch 成 blob（service worker 可離線提供），失敗回傳 false
  loadTrack(key) {
    const tr = this.tracks[key];
    if (!tr || tr.synth) return Promise.resolve(true);
    if (!tr.ready) tr.ready = fetch(BGM_SRC[key]).then((r) => { if (!r.ok) throw 0; return r.blob(); }).then((b) => { tr.el.src = URL.createObjectURL(b); return !tr.broken; })
      .catch(() => { console.warn(`[音效] 找不到 BGM：${BGM_SRC[key]}，改用合成配樂`); return false; });
    return tr.ready;
  },
  sfxState: {},   // 每個音效：loading／ok／missing
  preloadSfx() {
    for (const k of Object.keys(SFX_SRC)) {
      this.sfxState[k] = 'loading';
      fetch(`assets/audio/sfx_${k}.mp3`).then((r) => { if (!r.ok) throw 0; return r.arrayBuffer(); })
        .then((ab) => new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej))).then((buf) => { this.buffers[k] = buf; this.sfxState[k] = 'ok'; })
        .catch(() => { this.sfxState[k] = 'missing'; console.warn(`[音效] 找不到或無法解碼：assets/audio/sfx_${k}.mp3`); });
    }
  },
  // 揭曉音效：該品階檔案缺少時退回上一階（往下找），全部沒有才用合成；不報錯、不中斷演出
  reveal(tier) {
    if (!this.ctx) return;
    for (let t = tier; t >= 0; t--) {
      const k = REVEAL_SFX[t];
      if (this.buffers[k]) {
        if (t !== tier) this.warnOnce(`reveal${tier}`, `[音效] 缺少 sfx_${REVEAL_SFX[tier]}.mp3，改用 sfx_${k}.mp3`);
        return this.playBuf(k, t >= 4 ? 1 : 0.85, 0);
      }
    }
    this.warnOnce(`reveal${tier}`, `[音效] 揭曉音效都尚未載入或缺少，改用合成音（品階 ${tier}）`);
    this.synth(tier >= 4 ? 'divine' : 'reveal' + tier);
  },
  warned: {},
  warnOnce(key, msg) { if (this.warned[key]) return; this.warned[key] = true; console.warn(msg); },

  // ───────── BGM ─────────
  setMood(m) {
    this.mood = m;
    if (this.drone) this.retuneDrone();
    this.bgm(MOOD_BGM[m] || 'home');
  },
  async bgm(key) {
    this.want = key;
    if (!this.ctx || this.cur === key) return;
    const prev = this.cur; this.cur = key;
    const t = this.ctx.currentTime;
    // 先淡出其他所有軌
    for (const [k, tr] of Object.entries(this.tracks)) if (k !== key && !(key === 'trib' && k === 'tribIntro')) this.fadeOut(tr);
    if (key === 'trib') return this.playTrib();
    const ok = await this.loadTrack(key);
    if (this.cur !== key) return;
    if (!ok) { this.cur = 'synth'; this.fadeIn(this.tracks.synth); return; }   // 音檔失敗：改播合成配樂
    this.fadeIn(this.tracks[key]);
  },
  fadeIn(tr) {
    const t = this.ctx.currentTime, g = tr.gain.gain, from = g.value, delay = from > 0.05 ? 0 : FADE_IN_DELAY;
    g.cancelScheduledValues(t); g.setValueAtTime(from, t); g.setValueAtTime(from, t + delay); g.linearRampToValueAtTime(1, t + delay + FADE);
    clearTimeout(tr.stopT);
    if (tr.el && tr.el.paused && !document.hidden) tr.el.play().catch(() => {});
  },
  fadeOut(tr) {
    if (!tr) return;
    const t = this.ctx.currentTime;
    tr.gain.gain.cancelScheduledValues(t); tr.gain.gain.setValueAtTime(tr.gain.gain.value, t); tr.gain.gain.linearRampToValueAtTime(0, t + FADE);
    if (tr.el) {
      clearTimeout(tr.stopT);
      if (tr.broken) tr.el.pause();   // 音量節點控制不到（部分 iOS）：直接停，不讓舊曲全音量多響
      else tr.stopT = setTimeout(() => tr.el.pause(), FADE * 1000 + 80);
    }
  },
  // 保險：不是目前曲目的音軌，音量到 0 就一定暫停（避免任何情況下兩首同時在播）
  guard() {
    if (!this.ctx) return;
    for (const [k, tr] of Object.entries(this.tracks)) {
      if (!tr.el || tr.el.paused) continue;
      const mine = k === this.cur || (this.cur === 'trib' && k === 'tribIntro');
      if (!mine && tr.gain.gain.value < 0.03) tr.el.pause();
    }
  },
  // 雷劫：先播開場（17 秒），接著交叉淡入雷劫主曲循環
  async playTrib() {
    const intro = this.tracks.tribIntro, main = this.tracks.trib;
    const [a, b] = await Promise.all([this.loadTrack('tribIntro'), this.loadTrack('trib')]);
    if (this.cur !== 'trib') return;
    if (!a && !b) { this.fadeIn(this.tracks.synth); return; }
    if (!a) { this.fadeIn(main); return; }
    intro.el.currentTime = 0; this.fadeIn(intro);
    clearTimeout(this.tribT);
    this.tribT = setTimeout(() => { if (this.cur !== 'trib') return; this.fadeOut(intro); if (b) { main.el.currentTime = 0; this.fadeIn(main); } }, Math.max(1000, ((intro.el.duration || 17) - FADE) * 1000));
  },
  // 結果揭曉：目前音樂漸弱，過一會兒再回來
  duck(level = 0.2, hold = 1.6) {
    const tr = this.tracks[this.cur]; if (!tr || !this.ctx) return;
    const g = tr.gain.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(level, t + 0.25); g.setValueAtTime(level, t + hold); g.linearRampToValueAtTime(1, t + hold + 1.2);
  },

  // ───────── SFX ─────────
  // 有素材播素材，否則用合成；同一音效最多同時 SFX_MAX 個，超過就停掉最舊的
  play(name, opt = {}) {
    if (!this.ctx) return;
    const m = SFX_MAP[name];
    if (!m || !this.buffers[m[0]]) return this.synth(name);
    this.playBuf(m[0], m[1] * (opt.vol ?? 1), m[2]);
  },
  playBuf(key, vol, jitter) {
    const buf = this.buffers[key]; if (!buf) return;
    const list = (this.active[key] = (this.active[key] || []).filter((s) => !s.done));
    if (list.length >= SFX_MAX) { const old = list.shift(); try { old.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02); old.src.stop(this.ctx.currentTime + 0.08); } catch (e) {} }
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = buf; src.playbackRate.value = 1 + (jitter ? U.rand(-jitter, jitter) : 0); g.gain.value = vol;
    src.connect(g); g.connect(this.sfxBus); src.start();
    const rec = { src, g, done: false }; src.onended = () => (rec.done = true); list.push(rec);
  },
  // 循環音效（打坐）：on 淡入、off 淡出
  loop(name, on) {
    if (!this.ctx) { this.loopWant = on ? name : null; return; }
    const cur = this.loops[name];
    if (on) {
      if (cur || !this.buffers[name]) { if (!this.buffers[name]) setTimeout(() => this.loopWant === name && this.loop(name, true), 800); this.loopWant = name; return; }
      const src = this.ctx.createBufferSource(), g = this.ctx.createGain(), t = this.ctx.currentTime;
      src.buffer = this.buffers[name]; src.loop = true; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(MEDITATE_VOL, t + 1.5);   // 打坐循環壓在 BGM 底下，只當空氣聲
      src.connect(g); g.connect(this.sfxBus); src.start(); this.loops[name] = { src, g }; this.loopWant = name;
    } else {
      if (this.loopWant === name) this.loopWant = null;
      if (!cur) return;
      const t = this.ctx.currentTime; cur.g.gain.setTargetAtTime(0, t, 0.25); cur.src.stop(t + 1); delete this.loops[name];
    }
  },

  // ───────── 背景／鎖屏暫停 ─────────
  pauseAll(hidden) {
    if (!this.ctx) return;
    if (hidden) { this.ctx.suspend(); for (const tr of Object.values(this.tracks)) if (tr.el && !tr.el.paused) { tr.resumeMe = true; tr.el.pause(); } }
    else { this.ctx.resume(); for (const tr of Object.values(this.tracks)) if (tr.el && tr.resumeMe) { tr.resumeMe = false; tr.el.play().catch(() => {}); } }
  },
  init() {
    this.loadSet();
    const go = () => this.unlock();
    addEventListener('pointerdown', go); addEventListener('keydown', go);
    document.addEventListener('visibilitychange', () => this.pauseAll(document.hidden));
    setInterval(() => this.guard(), 500);
    addEventListener('pagehide', () => this.pauseAll(true));
  },

  // ───────── 音效 ─────────
  tone(freq, dur, type = 'sine', vol = 0.3, slide = 0, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol = 0.3, freq = 1200, q = 1, delay = 0, type = 'bandpass') {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay, n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus); src.start(t);
  },
  synth(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'swing1': this.noise(0.13, 0.22, 3200, 0.7); break;
      case 'swing2': this.noise(0.13, 0.22, 2600, 0.7); break;
      case 'swing3': this.noise(0.22, 0.3, 1800, 0.6); this.tone(700, 0.25, 'triangle', 0.08, 500); break;
      case 'hit': this.noise(0.07, 0.35, 900, 1.2); this.tone(140, 0.09, 'square', 0.07, -60); break;
      case 'hitHeavy': this.noise(0.14, 0.45, 500, 1); this.tone(90, 0.18, 'square', 0.1, -40); break;
      case 'hurt': this.tone(240, 0.22, 'sawtooth', 0.12, -140); this.noise(0.1, 0.2, 600); break;
      case 'blink': this.tone(1200, 0.18, 'sine', 0.12, -800); this.noise(0.18, 0.12, 5000, 2); break;
      case 'wave': this.tone(900, 0.28, 'triangle', 0.13, 700); this.noise(0.22, 0.14, 4200, 2); break;
      case 'dash': this.noise(0.32, 0.2, 1800, 0.5); this.tone(500, 0.3, 'sine', 0.1, 700); break;
      case 'thunder': this.noise(0.7, 0.5, 260, 0.4); this.noise(0.14, 0.35, 3200, 0.5); break;
      case 'shield': this.tone(440, 0.6, 'sine', 0.13, 440); this.tone(660, 0.6, 'sine', 0.09, 330); break;
      case 'pickup': this.tone(1046, 0.14, 'sine', 0.12, 300); this.tone(1568, 0.18, 'sine', 0.06, 0, 0.05); break;
      case 'bell': this.tone(523, 1.6, 'sine', 0.14); this.tone(1318, 1.2, 'sine', 0.05); this.tone(2093, 0.8, 'sine', 0.03); break;
      case 'up': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.6, 'triangle', 0.14, 0, i * 0.09)); break;
      case 'fail': this.tone(300, 0.6, 'sawtooth', 0.12, -200); break;
      case 'craft': this.tone(330, 0.4, 'sine', 0.1, 200); this.noise(0.6, 0.08, 400, 0.5); break;
      case 'gong': this.tone(110, 2.4, 'sine', 0.3, -10); this.tone(220, 1.8, 'triangle', 0.08); this.noise(0.5, 0.15, 300, 0.5); break;
      case 'roar': this.tone(70, 1.1, 'sawtooth', 0.25, -25); this.noise(0.9, 0.25, 220, 0.5); break;
      case 'shoot': this.tone(320, 0.16, 'square', 0.05, -160); break;
      case 'array': this.tone(220, 0.8, 'triangle', 0.08, 220); break;
      case 'boom': this.noise(0.5, 0.4, 180, 0.6); this.tone(60, 0.4, 'sine', 0.3, -20); break;
      case 'orb': this.tone(660, 1.4, 'sine', 0.1, 200); this.tone(990, 1.2, 'sine', 0.06, 300); break;
      case 'page': this.noise(0.12, 0.08, 2500, 0.8); break;
      // 揭曉音效：凡～仙用合成（神器用素材 divine）
      case 'reveal0': this.tone(784, 0.3, 'sine', 0.12, 200); break;
      case 'reveal1': this.tone(880, 0.6, 'sine', 0.13); this.tone(1318, 0.5, 'sine', 0.06, 0, 0.06); break;
      case 'reveal2': [659, 880, 1318].forEach((f, i) => this.tone(f, 1.0, 'sine', 0.12, 0, i * 0.07)); this.tone(220, 1.6, 'sine', 0.12); break;
      case 'reveal3': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 1.4, 'triangle', 0.1, 0, i * 0.06)); this.tone(110, 2.4, 'sine', 0.25, -10); this.noise(0.6, 0.12, 300, 0.5); break;
      case 'cast': this.tone(220, 0.8, 'triangle', 0.08, 220); break;
      case 'gather': this.tone(180, 2.4, 'sine', 0.07, 180); this.tone(270, 2.4, 'sine', 0.05, 270); break;
      case 'divine': this.tone(110, 2.4, 'sine', 0.3, -10); this.tone(220, 1.8, 'triangle', 0.08); this.noise(0.7, 0.4, 260, 0.4); break;
      case 'qi': this.tone(180, 2.4, 'sine', 0.07, 180); this.tone(270, 2.4, 'sine', 0.05, 270); break;
    }
  },

  // ───────── 配樂 ─────────
  // 五聲音階（宮商角徵羽），依場景換調
  SCALES: {
    title:   { root: 146.83, steps: [0, 2, 4, 7, 9], density: 0.45, flute: 0.35 },
    village: { root: 164.81, steps: [0, 2, 4, 7, 9], density: 0.5, flute: 0.2 },
    sect:    { root: 146.83, steps: [0, 2, 4, 7, 9], density: 0.55, flute: 0.3 },
    wild:    { root: 130.81, steps: [0, 3, 5, 7, 10], density: 0.4, flute: 0.18 },
    dungeon: { root: 110.0, steps: [0, 3, 5, 7, 10], density: 0.28, flute: 0.08 },
    battle:  { root: 110.0, steps: [0, 3, 5, 7, 10], density: 0.75, flute: 0.05 },
  },
  

  startMusic() {
    const c = this.ctx;
    // 低鳴：兩個慢慢起伏的正弦
    this.drone = [0, 7].map((st, i) => {
      const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      o.type = 'sine'; g.gain.value = 0.035 - i * 0.01;
      lfo.frequency.value = 0.07 + i * 0.03; lg.gain.value = 0.015;
      lfo.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(this.synthOut); g.connect(this.verb);
      o.start(); lfo.start();
      return { o, st };
    });
    this.retuneDrone();
    this.nextT = c.currentTime + 0.5;
    this.timer = setInterval(() => this.schedule(), 120);
  },
  retuneDrone() {
    if (!this.drone) return;
    const S = this.SCALES.sect;
    for (const d of this.drone) d.o.frequency.setTargetAtTime((S.root / 2) * Math.pow(2, d.st / 12), this.ctx.currentTime, 1.5);
  },
  note(S, octave = 0) {
    const st = U.pick(S.steps) + 12 * octave;
    return S.root * Math.pow(2, st / 12);
  },
  schedule() {
    const c = this.ctx; if (!c || this.cur !== 'synth') { if (c) this.nextT = c.currentTime + 0.3; return; }
    const S = this.SCALES.sect, step = this.mood === 'battle' ? 0.42 : 0.62;
    while (this.nextT < c.currentTime + 0.4) {
      const t = this.nextT; this.beat++;
      if (Math.random() < S.density) {
        if (Math.random() < 0.18) { // 短句：上行或下行三四音
          let o = U.randi(0, 1), dir = U.chance(0.5) ? 1 : -1, i0 = U.randi(0, 4);
          for (let k = 0; k < U.randi(3, 4); k++) {
            const idx = ((i0 + k * dir) % 5 + 5) % 5;
            this.guqin(S.root * Math.pow(2, (S.steps[idx] + 12 * o) / 12), t + k * step * 0.5, 0.18);
          }
        } else this.guqin(this.note(S, U.randi(0, 1)), t, U.rand(0.12, 0.22));
      }
      if (this.beat % 16 === 0 && Math.random() < S.flute) this.dizi(this.note(S, 1), t + 0.1, U.rand(3, 5));
      this.nextT += step * (Math.random() < 0.15 ? 2 : 1);
    }
  },
  // 古琴：多泛音撥弦，起音微微滑音（吟猱感）
  guqin(f, t, vel) {
    const c = this.ctx, g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(500, t + 1.5);
    [[1, 1], [2, 0.45], [3, 0.2], [4.02, 0.08]].forEach(([m, a]) => {
      const o = c.createOscillator(), og = c.createGain();
      o.type = m === 1 ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(f * m * 1.012, t); o.frequency.exponentialRampToValueAtTime(f * m, t + 0.18);
      if (Math.random() < 0.25) o.frequency.setTargetAtTime(f * m * 1.006, t + 0.8, 0.3);
      og.gain.value = a; o.connect(og); og.connect(lp); o.start(t); o.stop(t + 3.3);
    });
    lp.connect(g); g.connect(this.synthOut); g.connect(this.verb);
  },
  // 竹笛：柔和正弦＋漸深顫音＋氣聲
  dizi(f, t, dur) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
    const vib = c.createOscillator(), vg = c.createGain();
    o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = f; o2.frequency.value = f * 2;
    vib.frequency.value = 5.2; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.012, t + dur * 0.6);
    vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
    const g2 = c.createGain(); g2.gain.value = 0.12; o2.connect(g2); g2.connect(g);
    o.connect(g);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.5); g.gain.setValueAtTime(0.06, t + dur - 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.synthOut); g.connect(this.verb);
    // 氣聲
    const n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(), bp = c.createBiquadFilter(), ng = c.createGain();
    src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 3;
    ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.012, t + 0.4); ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(ng); ng.connect(this.verb);
    [o, o2, vib].forEach((x) => { x.start(t); x.stop(t + dur + 0.1); }); src.start(t);
  },
};

Audio2.init();
