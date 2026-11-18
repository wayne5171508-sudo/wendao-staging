'use strict';
// ════════════════════════════════════════════
//  轉珠關卡制：所有可調數值都在這一個檔案
//  體力、轉珠規則、怪物、章節關卡、星級條件、獎勵、掃蕩
//  改完數字重新整理即可，不用動 puzzle.js／stage.js
// ════════════════════════════════════════════

// ───────── 體力 ─────────
const STA_CFG = {
  max: 60,          // 體力上限（自然回復只回到上限）
  regenMin: 5,      // 每幾分鐘回 1 點
  start: 60,        // 新存檔／舊存檔第一次升級時給的體力
  devRefill: true,  // 開發模式地圖上顯示「補滿體力」測試鈕
};

// ───────── 轉珠規則 ─────────
const PZ_CFG = {
  cols: 6, rows: 5,
  moveTime: 5,          // 轉珠秒數（第一次換位才開始計時）；網址加 &pzt=8 可改
  comboStep: 0.25,      // 每多 1 Combo 傷害 +25%
  extraOrb: 0.25,       // 一組超過 3 顆，每多 1 顆 +25%
  beat: 1.5, beaten: 0.5,   // 五行相剋倍率：剋 1.5、被剋 0.5
  comboGap: 450,        // 每個 Combo 消除之間的停頓（毫秒）
  skillStartHalf: true, // 開場技能冷卻只剩一半
  // 5 連珠：同屬性相連一組 min 顆以上（任意形狀）＝對全體敵人攻擊；該組傷害再 ×（1＋bonus＋多出顆數×per）
  // 心珠 5 連珠沒有全體攻擊，回復量套同一個加成
  five: { min: 5, bonus: 0.5, per: 0.1 },
};

// ───────── 隊伍 ─────────
// 角色、技能、陣營、星級、主角與道侶數值都在 js/roster-cfg.js

// ───────── 怪物 ─────────
// el 屬性、hp 血量、atk 攻擊、def 防禦、cd 出手倒數（回合）、img 立繪（沒有或載入失敗就顯示色塊＋名字）
// heavy：每第 every 次出手改放大招（mult 倍）；phases：血量低於 at 時換相（可改屬性 el、倒數 cd、減傷 dr、攻擊倍率 atk、吸血 leech、大招倍率 heavyMult，banner 換相字幕）
// boss: true 會放大顯示、換場景色調
const PZ_MONS = {
  lang:    { name: '妖化靈狼', el: 'wood',  hp: 1400, atk: 260, def: 20, cd: 2, img: 'assets/mon/yaoshou.webp' },
  hun:     { name: '遊魂',     el: 'water', hp: 1100, atk: 330, def: 10, cd: 2, img: 'assets/mon/youhun.webp' },
  jing:    { name: '山精',     el: 'earth', hp: 2200, atk: 240, def: 40, cd: 3, img: 'assets/mon/shanjing.webp' },
  kui:     { name: '屍傀',     el: 'metal', hp: 2600, atk: 380, def: 50, cd: 3, img: 'assets/mon/shikui.webp',
    heavy: { every: 3, mult: 2, name: '屍毒爪' } },
  mo:      { name: '魔修',     el: 'fire',  hp: 2000, atk: 420, def: 30, cd: 2, img: 'assets/mon/moxiu.webp' },
  // 前段關卡的小首領（boss: true＝放大顯示、標「首領」）
  lang_alpha: { name: '頭狼', el: 'wood', hp: 3200, atk: 320, def: 20, cd: 2, img: 'assets/mon/yaoshou.webp', boss: true,
    heavy: { every: 3, mult: 1.8, name: '撕咬' } },
  hun_elite: { name: '怨魂', el: 'water', hp: 3800, atk: 360, def: 15, cd: 2, img: 'assets/mon/youhun.webp', boss: true,
    heavy: { every: 3, mult: 1.8, name: '寒魄' } },
  jing_elite: { name: '山精首領', el: 'earth', hp: 5200, atk: 330, def: 50, cd: 3, img: 'assets/mon/shanjing.webp', boss: true,
    heavy: { every: 2, mult: 1.8, name: '落石' } },
  kui_elite: { name: '屍傀王', el: 'metal', hp: 6200, atk: 420, def: 60, cd: 3, img: 'assets/mon/kui_king.webp', boss: true,
    heavy: { every: 3, mult: 2.2, name: '屍毒爪' }, phases: [{ name: '' }, { at: 0.5, name: '屍化', dr: 0.2, banner: ['屍氣護體', '受傷減兩成'] }] },
  mo_elite: { name: '魔修護法', el: 'fire', hp: 6500, atk: 480, def: 40, cd: 2, img: 'assets/mon/moxiu.webp', boss: true,
    heavy: { every: 3, mult: 2, name: '血焰' } },
  mo_boss: { name: '魔修頭目', el: 'fire',  hp: 9000, atk: 650, def: 60, cd: 3, img: 'assets/mon/moxiu_boss.webp', boss: true,
    heavy: { every: 3, mult: 2.4, name: '焚心掌' },
    phases: [{ name: '' }, { at: 0.4, name: '狂怒', atk: 1.3, cd: 2, banner: ['魔修狂怒', '出手加快'] }] },
  lang_king: { name: '狼王', el: 'wood', hp: 7000, atk: 520, def: 40, cd: 2, img: 'assets/mon/lang_king.webp', boss: true,
    heavy: { every: 3, mult: 2.2, name: '裂風嘯' } },
  jing_old: { name: '千年山精', el: 'earth', hp: 11000, atk: 560, def: 80, cd: 3, img: 'assets/mon/jing_old.webp', boss: true,
    phases: [{ name: '' }, { at: 0.5, name: '石膚', dr: 0.3, banner: ['山石護體', '受傷減三成'] }] },
  // 第一章首領：沿用血甲妖將三相（減傷、暴怒吸血），每第 3 次出手為「血刃斬」
  xuejia: { name: '血甲妖將・厲蒼', el: 'fire', hp: 28000, atk: 1500, def: 60, cd: 3, img: 'assets/mon/xuejia.webp', boss: true,
    heavy: { every: 3, mult: 2.8, name: '血刃斬' },
    phases: [
      { name: '第一相', el: 'fire', cd: 3, heavyMult: 2.8 },
      { at: 0.66, name: '第二相', el: 'earth', cd: 3, heavyMult: 2.8, dr: 0.25, banner: ['妖將祭陣', '血陣護身，減傷兩成五，屬性轉為土'] },
      { at: 0.33, name: '第三相', el: 'fire', cd: 2, heavyMult: 2.6, atk: 1.3, leech: 0.25, banner: ['血甲暴怒', '出手加快，以血養血'] },
    ] },
};

// ───────── 星級條件（預設，每關可用 stars 覆寫）─────────
// t：clear 通關；turns 在 n 回合內通關；combo 單回合最高 Combo 達 n；hp 通關時隊伍氣血不低於 n（0～1）
// 星星分開累計：某次達成就永久亮起；三顆都亮才能掃蕩
const STAR_DEFAULT = [{ t: 'clear' }, { t: 'turns', n: 10 }, { t: 'combo', n: 5 }];

// ───────── 掃蕩 ─────────
const SWEEP_CFG = {
  needStars: 3,      // 幾星才能掃蕩
  costMult: 1,       // 掃蕩體力＝關卡體力 × 這個倍率
  dailyPerStage: 10, // 每關每日可掃蕩次數（0＝不限）
  batch: 5,          // 「掃蕩 ×N」的 N
};

// ───────── 章節與關卡 ─────────
// waves：每波 1～3 隻（怪物 id），最後一波要有首領（boss: true 的怪，可帶小怪）；k 這關怪物血量與攻擊倍率
// big 地圖上畫成大節點（章節重點關）；cost 進場體力；stone 靈石；expSec 修為（＝當下修煉速度幾秒的修為，跟著境界成長）
// first 首次通關額外獎勵（stone、expSec、items: { 物品 id: 數量 }）
const PZ_CHAPTERS = [
  { id: 1, name: '第一章・青石山道', bg: ['assets/bg/pz_day.webp', 'assets/bg/pz_dusk.webp', 'assets/bg/pz_night.webp'],
    stages: [
      { id: '1-1', name: '村口狼嚎', cost: 4, k: 1, waves: [['lang'], ['lang', 'lang_alpha']], stone: 30, expSec: 60,
        first: { stone: 60, items: { herb_q: 2 } }, stars: [{ t: 'clear' }, { t: 'turns', n: 6 }, { t: 'combo', n: 3 }] },
      { id: '1-2', name: '山徑遊魂', cost: 4, k: 1, waves: [['hun', 'hun'], ['hun_elite']], stone: 35, expSec: 70,
        first: { stone: 60, items: { herb_c: 2 } }, stars: [{ t: 'clear' }, { t: 'turns', n: 6 }, { t: 'combo', n: 4 }] },
      { id: '1-3', name: '山精出沒', cost: 5, k: 1, waves: [['lang', 'hun'], ['jing_elite']], stone: 40, expSec: 80,
        first: { stone: 80, items: { p_qi: 1 } }, stars: [{ t: 'clear' }, { t: 'turns', n: 7 }, { t: 'hp', n: 0.6 }] },
      { id: '1-4', name: '古道夜行', cost: 5, k: 1.1, waves: [['hun', 'hun', 'hun'], ['kui_elite']], stone: 45, expSec: 90,
        first: { stone: 80, items: { herb_q: 3 } } },
      { id: '1-5', big: true, name: '狼王巢穴', cost: 6, k: 1.1, waves: [['lang', 'lang'], ['jing', 'lang'], ['lang_king']], stone: 60, expSec: 120,
        first: { stone: 150, items: { scroll: 3 } } },
      { id: '1-6', name: '魔修伏擊', cost: 6, k: 1.2, waves: [['mo'], ['mo', 'hun'], ['mo_elite']], stone: 55, expSec: 110,
        first: { stone: 100, items: { herb_c: 3 } } },
      { id: '1-7', name: '落霞嶺', cost: 6, k: 1.25, waves: [['kui', 'jing'], ['mo', 'mo'], ['mo', 'kui_elite']], stone: 60, expSec: 120,
        first: { stone: 100, items: { ore: 5 } } },
      { id: '1-8', big: true, name: '魔修頭目', cost: 7, k: 1.3, waves: [['mo', 'hun'], ['mo', 'kui'], ['mo_boss']], stone: 80, expSec: 160,
        first: { stone: 200, items: { p_qi: 2 } } },
      { id: '1-9', name: '千年山精', cost: 7, k: 1.35, waves: [['jing', 'jing'], ['kui', 'lang', 'hun'], ['jing_old']], stone: 85, expSec: 170,
        first: { stone: 200, items: { ore: 8 } } },
      { id: '1-10', big: true, name: '血甲妖將', cost: 10, k: 1, waves: [['mo', 'kui'], ['mo', 'mo', 'jing'], ['xuejia']], stone: 150, expSec: 300,
        first: { stone: 500, items: { p_break: 1, scroll: 5 } }, stars: [{ t: 'clear' }, { t: 'turns', n: 14 }, { t: 'hp', n: 0.3 }] },
    ] },
];
