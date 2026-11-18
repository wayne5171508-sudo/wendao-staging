'use strict';
// ════════════════════════════════════════════
//  遊戲資料表 —— 加內容（關卡、怪物、丹藥、功法、法寶、劇情）主要改這裡
// ════════════════════════════════════════════

// 開發模式：網址帶 ?dev 才開啟，存在 sessionStorage（同一分頁重新整理仍有效，關掉分頁就失效）；測試用的關卡與按鈕只在開發模式顯示
const DEV = (() => {
  const on = /[?&]dev(=|&|$)/.test(location.search);
  try { if (on) sessionStorage.setItem('staging_wendao_dev', '1'); return on || sessionStorage.getItem('staging_wendao_dev') === '1'; } catch (e) { return on; }
})();

const U = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  rand: (a, b) => a + Math.random() * (b - a),
  randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  chance: (p) => Math.random() < p,
  wait: (ms) => new Promise((r) => setTimeout(r, ms)),
  fmt(n) { n = Math.floor(n); if (n >= 1e8) return (n / 1e8).toFixed(1) + '億'; if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e5 ? 0 : 1) + '萬'; return String(n); },
  dur(sec) { sec = Math.floor(sec); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h ? `${h} 時 ${m} 分` : m ? `${m} 分` : `${sec} 息`; },
  today() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; },
};

let HERO_NAME = '林清遠';   // 依所選角色變更（js/dao.js 的 CHARACTERS）；玩家自訂名字（S.d.name）優先

// ───────── 更名 ─────────
// 名字規則要和 database.rules.json 的 users/$uid/name 一致：2～8 個字，只能是中文、英文、數字
const NAME_RE = /^[一-鿿A-Za-z0-9]{2,8}$/;
const RENAME_COST = 500;               // 第二次起每次更名消耗的靈石（第一次免費）
const RENAME_CD = 24 * 3600 * 1000;    // 兩次更名至少間隔 24 小時（雲端規則也會擋）
// 禁用詞：名字包含其中任一個就不能用（英文不分大小寫）。之後要增減直接改這個陣列
const NAME_BANNED = [
  '系統', '客服', '官方', '管理員', '管理员', '版主', '公告', 'GM', 'admin', 'system',
  '幹你', '幹妳', '操你', '他媽', '他妈', '媽的', '妈的', '靠北', '靠杯', '機掰', '雞掰', '幹林', '白痴', '白癡', '智障', '去死', '賤人', '婊子', '王八',
  'fuck', 'shit', 'bitch', 'cunt', 'dick',
];
const STAGES = ['初期', '中期', '後期'];
const REALMS = ['練氣', '築基', '金丹', '元嬰'];
const MAX_LV = REALMS.length * 3 - 1;
const lvName = (lv) => `${REALMS[Math.floor(lv / 3)]}・${STAGES[lv % 3]}`;
const isMajor = (lv) => lv % 3 === 2;           // 後期 → 下一大境界
// 每個小境界約需 100 息（練氣初期）到近五個時辰（元嬰初期）
const expNeed = (lv) => Math.round(120 * Math.pow(2.6, lv));
const baseRate = (lv) => 1.2 * Math.pow(1.55, lv);    // 每息修為
const OFFLINE_CAP = 8 * 3600;
// 雷劫：雷數；perfect／good 為點準時機後承受的傷害比例；dmg 為完全不點時共損失的護體比例
const TRIB = { minor: 3, major: 9, warn: 500, perfect: 0.35, good: 0.65, dmg: { minor: 0.6, major: 0.9 } };

// 靈根（測靈台決定）
const ROOTS = {
  metal:   { name: '金靈根', ch: '金', color: '#ffd76a', desc: '攻擊 +15%', atk: 0.15 },
  wood:    { name: '木靈根', ch: '木', color: '#7fe0a0', desc: '氣血 +15%，戰後回復更多', hp: 0.15 },
  water:   { name: '水靈根', ch: '水', color: '#6ab8ff', desc: '靈力 +30%、回靈更快', mp: 0.3 },
  fire:    { name: '火靈根', ch: '火', color: '#ff7a4a', desc: '暴擊率 +10%', crit: 0.1 },
  earth:   { name: '土靈根', ch: '土', color: '#d4a96a', desc: '防禦 +40%', def: 0.4 },
  thunder: { name: '雷靈根', ch: '雷', color: '#c8a2ff', desc: '雷法傷害 +50%（異靈根）', thunder: 0.5, rare: true },
  ice:     { name: '冰靈根', ch: '冰', color: '#bff4ff', desc: '修煉速度 +20%（異靈根）', rate: 0.2, rare: true },
};
const ROOT_WEIGHTS = { metal: 16, wood: 16, water: 16, fire: 16, earth: 16, thunder: 10, ice: 10 };
// 靈根品階：天地玄黃，mult 為靈根加成倍率（黃品即原本數值）
const ROOT_REROLLS = 3;   // 靈根測試最多可重測幾次（用掉的次數存在 S.d.rootRerolls）
const GRADES = { 天: { w: 5, mult: 2, color: '#ffd76a' }, 地: { w: 15, mult: 1.5, color: '#c9a2ff' }, 玄: { w: 35, mult: 1.2, color: '#8fd0ff' }, 黃: { w: 45, mult: 1, color: '#d4b483' } };
const ROOT_FX = { atk: '攻擊', hp: '氣血', mp: '靈力', crit: '暴擊率', def: '防禦', thunder: '雷法傷害', rate: '修煉速度' };
const rootDesc = (root, grade) => Object.entries(ROOT_FX).filter(([k]) => ROOTS[root][k]).map(([k, n]) => `${n} +${Math.round(ROOTS[root][k] * GRADES[grade].mult * 100)}%`).join('，');
// 五行靈光圖（assets/fx/wuxing.webp）：升起時五色並現；結果光柱取正中的水流（唯一直立的一道），依屬性換色；雷、冰有專屬光柱圖
const ROOT_LIGHT_CLIP = '43% 0,58% 0,53% 76%,46% 76%';
const ROOT_LIGHT = {
  water: '', metal: 'hue-rotate(-175deg) saturate(.45) brightness(1.5)', wood: 'hue-rotate(-95deg) saturate(1.2)', fire: 'hue-rotate(150deg) saturate(1.6)',
  earth: 'hue-rotate(-170deg) saturate(1.3) brightness(1.1)',
};
const ROOT_PILLAR = { thunder: 'assets/fx/pillar_thunder.webp', ice: 'assets/fx/pillar_ice.webp' };
// 五行光柱：圖在素材清單裡才用，沒有就維持濾鏡做法
for (const r of ['metal', 'wood', 'water', 'fire', 'earth']) { const p = `assets/fx/pillar_${r}.webp`; if (typeof ASSET_LIST !== 'undefined' && ASSET_LIST.includes(p)) ROOT_PILLAR[r] = p; }

// 物品
const ITEMS = {
  stone:   { name: '靈石', color: '#9fe8d8', desc: '修仙界通用的貨幣與靈力來源。' },
  herb_q:  { name: '青靈草', color: '#6fe0a8', desc: '常見靈草，煉丹主材。' },
  herb_c:  { name: '赤血花', color: '#e0566a', desc: '花瓣如血，可補氣血。' },
  herb_b:  { name: '玄冰芝', color: '#8fd3ff', desc: '生於陰寒之地，野外才有。' },
  herb_l:  { name: '紫雷藤', color: '#b98cff', desc: '天雷淬鍊的奇藤，只見於秘境。' },
  scroll:  { name: '功法殘卷', color: '#e8dcc0', desc: '參悟新功法所需。' },
  ore:     { name: '玄鐵', color: '#a9b4c2', desc: '煉器與兵器突破的基礎材料。' },
  star:    { name: '星辰砂', color: '#ffd9a0', desc: '秘境深處的星輝結晶，高階兵器突破必需。' },
  p_qi:    { name: '聚氣丹', color: '#9fe8ff', desc: '立即獲得當前境界三成的修為。', pill: true },
  p_heal:  { name: '回春丹', color: '#ff8a8a', desc: '戰鬥中氣血低於三成時自動服下，回復四成氣血。', pill: true },
  p_break: { name: '破障丹', color: '#c79bff', desc: '突破時服用，成功率 +15%。', pill: true },
  p_zhuji: { name: '築基丹', color: '#ffd76a', desc: '大境界突破時服用，成功率 +30%。', pill: true },
  p_zao:   { name: '造化丹', color: '#ffe9a8', desc: '秘境奇珍。永久攻擊、氣血 +8%。', pill: true },
};

const RECIPES = [
  { out: 'p_qi',    need: { herb_q: 2 }, stone: 20, rate: 0.85, time: 2 },
  { out: 'p_heal',  need: { herb_c: 2 }, stone: 10, rate: 0.85, time: 2 },
  { out: 'p_break', need: { herb_q: 1, herb_c: 1, herb_b: 1 }, stone: 60, rate: 0.7, time: 3 },
  { out: 'p_zhuji', need: { herb_b: 2, herb_l: 1 }, stone: 200, rate: 0.5, time: 4 },
];

// 戰鬥技能：由功法解鎖
const SKILLS = [
  { id: 'jianqi', name: '劍氣', icon: '劍', mp: 15, cd: 4,  mult: 2.4, from: 'qingming', color: '#9fe8ff', desc: '劍氣破空，造成 240% 攻擊傷害。' },
  { id: 'leifa',  name: '雷法', icon: '雷', mp: 30, cd: 8,  mult: 3.6, from: 'leifa',    color: '#c8a2ff', desc: '引雷轟擊，360% 攻擊傷害並使敵人僵直一息。' },
  { id: 'huti',   name: '護體', icon: '罩', mp: 25, cd: 15, mult: 0.35, from: 'huti',    color: '#8ff0d8', desc: '靈罩吸收相當於三成五氣血的傷害，持續八息。' },
  { id: 'wanjian',name: '萬劍', icon: '萬', mp: 60, cd: 30, mult: 9,   from: 'wanjian',  color: '#ffe7a0', desc: '大招・萬劍歸宗，900% 攻擊傷害。' },
  // 兵器技能：裝備的最高階兵器達到 wt 階即可使用
  { id: 'yujian', name: '御劍', icon: '御', mp: 35, cd: 10, mult: 1.3, wt: 2, color: '#8fd0ff', desc: '御劍術：飛劍三連斬，每劍 130% 攻擊傷害。' },
  { id: 'jianyi', name: '劍意', icon: '意', mp: 40, cd: 22, mult: 0.6, wt: 3, color: '#ffcf7a', desc: '劍意：八息內普攻 +60%、暴擊 +20%。' },
];

// 功法：learn 為參悟所需殘卷，req 為境界下限
const ARTS = [
  { id: 'qingming', name: '青冥劍訣', req: 0, scroll: 0, per: '攻擊 +8%／層，解鎖「劍氣」', stat: { atk: 0.08 } },
  { id: 'yinqi',    name: '引氣訣',   req: 0, scroll: 1, per: '修煉速度 +12%／層', stat: { rate: 0.12 } },
  { id: 'jingang',  name: '金剛訣',   req: 1, scroll: 1, per: '氣血、防禦 +8%／層', stat: { hp: 0.08, def: 0.08 } },
  { id: 'leifa',    name: '掌心雷法', req: 2, scroll: 2, per: '解鎖「雷法」，雷法傷害 +15%／層', stat: {} },
  { id: 'huti',     name: '護體真訣', req: 2, scroll: 2, per: '解鎖「護體」，靈罩 +10%／層', stat: {} },
  { id: 'wanjian',  name: '萬劍歸宗', req: 3, scroll: 3, per: '解鎖大招「萬劍」，傷害 +15%／層', stat: {} },
];
const ART_MAX = 10;
const artCost = (lv) => Math.round(40 * Math.pow(1.75, lv));

// ───────── 兵器 ─────────
// 圖檔：assets/weapon/<id>.webp；rot 為把劍尖轉成朝下所需角度（原圖角度各異）；階級顏色與邊框見 WTIERS
// 品階：凡、靈、玄、仙、神。name 用於兵器與法寶（○器），pin 用於功法與殘卷（○品）
const WTIERS = [
  { name: '凡器', pin: '凡品', color: '#e8e8e8', edge: '#bfc4ca' },
  { name: '靈器', pin: '靈品', color: '#5fe6e0', edge: '#38c2c8' },   // 青
  { name: '玄器', pin: '玄品', color: '#ffd36a', edge: '#e0a83a' },   // 金
  { name: '仙器', pin: '仙品', color: '#c08cff', edge: '#8f5ff0' },   // 紫
  { name: '神器', pin: '神品', color: '#ff6a4a', edge: '#ffd76a' },   // 赤金
];
// 抽到的東西顯示用的品階名：兵器、法寶用「○器」，功法、殘卷用「○品」
const tierName = (r) => (r.type === 'w' || r.type === 'f' ? WTIERS[r.tier].name : WTIERS[r.tier].pin);
// rot：展示圖轉正的角度；grip：戰鬥劍身圖上握點的位置（由劍首往劍尖的比例，預設 0.12）；card：展示圖是帶光暈的卡面，沒有 assets/weapon/blade/<id>.webp 時戰鬥不疊圖
const WEAPONS = [
  { id: 'qinggang',  rot: 0,   name: '青鋼劍', tier: 0, atk: 8,   crit: 0,  regen: 0,   desc: '宗門制式長劍，樸實耐用。' },
  { id: 'liuyun',    rot: 150, name: '流雲劍', tier: 1, atk: 22,  crit: 3,  regen: 0.6, desc: '劍身如雲，靈氣流轉不滯。' },
  { id: 'shuanghan', rot: 145, name: '霜寒劍', tier: 2, atk: 50,  crit: 5,  regen: 1.2, fx: 'slow',  fxName: '霜寒', fxDesc: '命中使妖物出手變慢 25%', desc: '萬載玄冰所鑄，劍出霜生。' },
  { id: 'qingming',  rot: -32, name: '青冥劍', tier: 3, atk: 110, crit: 8,  regen: 2,   fx: 'combo', fxName: '連擊', fxDesc: '普攻 30% 機率追加一劍', desc: '青冥宗鎮派仙劍，劍鳴如龍吟。' },
  { id: 'nitian',    rot: 0,   name: '逆天劍', tier: 4, atk: 240, crit: 12, regen: 3,   fx: 'pierce', fxName: '破防', fxDesc: '無視妖物防禦，對首領傷害 +25%', desc: '傳說斬過天道的神兵，出鞘則天象異變。' },
  // 法寶池新劍：暴擊路線，攻擊約同階原劍九成
  { id: 'xuantie',   rot: 3,   name: '玄鐵劍', tier: 0, atk: 7,   crit: 2,  regen: 0,   desc: '玄鐵粗鑄，沉而不鈍。' },
  { id: 'bitao', card: true,     rot: -1,  name: '碧濤劍', tier: 1, atk: 19,  crit: 5,  regen: 0.8, desc: '劍氣如潮，青光翻湧。' },
  { id: 'jinxia', card: true,    rot: -38, name: '金霞劍', tier: 2, atk: 44,  crit: 8,  regen: 1.2, desc: '朝霞淬鋒，揮動時金雲繚繞。' },
  { id: 'zichen', card: true,    rot: -36, name: '紫宸劍', tier: 3, atk: 96,  crit: 12, regen: 2.2, fx: 'slow', fxName: '霜寒', fxDesc: '命中使妖物出手變慢 25%', desc: '紫氣東來，劍落星沉。' },
  { id: 'chixiao', card: true,   rot: -34, name: '赤霄劍', tier: 4, atk: 210, crit: 16, regen: 3.4, fx: 'combo', fxName: '連擊', fxDesc: '普攻 30% 機率追加一劍', desc: '赤龍盤鋒，劍出則雷火並起。' },
];
// ───────── 法寶（鐘、鏡、塔）：佩於法寶欄一件；強化與突破規則同兵器 ─────────
// 圖檔：assets/fabao/<類型>_t<品階>.webp；val 為加成（鐘 防禦 %、鏡 暴擊點數、塔 氣血 %）
const FB_TYPES = { zhong: { name: '鐘', stat: 'def', label: '防禦', unit: '%' }, jing: { name: '鏡', stat: 'crit', label: '暴擊', unit: '%' }, ta: { name: '塔', stat: 'hp', label: '氣血', unit: '%' } };
const FABAO = [
  ['zhong', ['青銅鐘', '碧落鐘', '金光鐘', '紫霄鐘', '混元鐘'], [5, 10, 18, 28, 40], '鐘聲一響，邪祟不侵。'],
  ['jing', ['古銅鏡', '碧波鏡', '乾坤鏡', '紫微鏡', '昊天鏡'], [2, 4, 7, 10, 14], '鏡照虛實，破綻無所遁形。'],
  ['ta', ['石浮屠', '碧玉塔', '鎮魂塔', '紫極塔', '九霄玲瓏塔'], [5, 10, 18, 28, 40], '塔鎮周身，氣血綿長。'],
].flatMap(([type, names, vals, desc]) => names.map((name, tier) => ({ id: `${type}${tier}`, type, name, tier, val: vals[tier], desc })));
const FB_IMG = (f) => `assets/fabao/${f.type}_t${f.tier}.webp`;
const W_SLOTS = ['主手', '副手'];
const W_BRK_MAX = 3;                                    // 突破上限（每次 +10 強化上限、屬性 +25%）
const wEnhCost = (w, lv) => Math.round(40 * Math.pow(1.35, lv) * (1 + w.tier * 1.5));
const wEnhRate = (lv) => Math.max(0.25, 1 - lv * 0.04); // 強化成功率
const W_PITY = 3;                                       // 連續失敗三次，下次必成
const wBrkNeed = (w, brk) => {
  const n = brk + 1, need = { p_break: n, ore: 6 * n * (w.tier + 1) };
  if (w.tier >= 2) need.star = n * (w.tier - 1);
  return { need, stone: 500 * n * (w.tier + 1) };
};
// 取得方式（顯示在未擁有的兵器上）
const W_SOURCE = { qinggang: '入門時師尊所賜・宗門商店', liuyun: '宗門商店・任務', shuanghan: '煉器・秘境妖將首通', qingming: '煉器・秘境妖將掉落', nitian: '任務「逆天問道」', xuantie: '機緣・法寶池', bitao: '機緣・法寶池', jinxia: '機緣・法寶池', zichen: '機緣・法寶池', chixiao: '機緣・法寶池' };
const SHOP = [
  { w: 'qinggang', stone: 200 },
  { w: 'liuyun', stone: 2500, lv: 2 },
  { item: 'ore', n: 5, stone: 300 },
  { item: 'p_heal', n: 1, stone: 120 },
  { item: 'p_break', n: 1, stone: 900, lv: 3 },
];
const FORGE = [
  { w: 'shuanghan', need: { ore: 12, herb_b: 6 }, stone: 3000, rate: 0.7 },
  { w: 'qingming',  need: { ore: 30, herb_l: 8, star: 4 }, stone: 30000, rate: 0.45 },
];
// 機緣抽取：只消耗遊戲內靈石。rates 依序為凡、靈、玄、仙、神五階；pity 抽內必出仙階以上
const GACHA = { cost: 200, cost10: 1800, pity: 90, rates: [0.5, 0.3, 0.14, 0.05, 0.01], sign: (lv) => 120 + 60 * lv };
// 功法池各階獎勵：scroll 為功法殘卷數；art 為隨機一部功法 +1 層（wanjian 指定萬劍歸宗）
const ART_GACHA = [{ scroll: 1 }, { scroll: 2 }, { scroll: 4 }, { art: 'any' }, { art: 'wanjian' }];
// 宗門任務：check(S) 為達成條件，reward 為獎勵
const QUESTS = [
  { id: 'q_sect',   name: '試劍功成', desc: '通過青冥宗三場試劍', check: (S) => !!S.d.cleared['sect-2'], reward: { stone: 200, ore: 5 } },
  { id: 'q_down',   name: '首次下山', desc: '平定山腳村妖患', check: (S) => !!S.d.cleared['village-3'], reward: { w: 'liuyun' } },
  { id: 'q_zhuji',  name: '築基有成', desc: '晉入築基期', check: (S) => S.d.lv >= 3, reward: { ore: 10, p_break: 2 } },
  { id: 'q_wild',   name: '落霞平亂', desc: '擊敗落霞嶺魔修頭目', check: (S) => !!S.d.cleared['wild-4'], reward: { herb_b: 6, ore: 12 } },
  { id: 'q_boss',   name: '斬妖將',   desc: '擊敗血甲妖將・厲蒼', check: (S) => !!S.d.cleared['realm-2'], reward: { star: 3, scroll: 2 } },
  { id: 'q_four',   name: '劍心通明', desc: '收集凡器、靈器、玄器、仙器四階兵器', check: (S) => [0, 1, 2, 3].every((t) => WEAPONS.some((w) => w.tier === t && S.d.weapons[w.id])), reward: { star: 6 } },
  { id: 'q_nitian', name: '逆天問道', desc: '金丹期，擊敗妖將五次，且青冥劍突破一次', check: (S) => S.d.lv >= 6 && (S.d.cleared['realm-2'] || 0) >= 5 && (S.d.weapons.qingming?.brk || 0) >= 1, reward: { w: 'nitian' } },
];

// 怪物：img 對應 assets/mon/*.webp（原圖以原生解析度去背，依局部背景色扣掉白邊）
const MONSTERS = {
  yaoshou:  { name: '妖化靈狼', img: 'yaoshou',  hp: 1,   atk: 1,   spd: 1.15 },
  shanjing: { name: '山精',     img: 'shanjing', hp: 1.5, atk: 0.85, spd: 0.8 },
  youhun:   { name: '遊魂',     img: 'youhun',   hp: 0.8, atk: 1.2, spd: 1.0 },
  shikui:   { name: '屍傀',     img: 'shikui',   hp: 1.7, atk: 1.1, spd: 0.75 },
  moxiu:    { name: '魔修',     img: 'moxiu',    hp: 1.2, atk: 1.35, spd: 1.0 },
  moxiu_boss: { name: '魔修頭目', img: 'moxiu_boss', hp: 1.2, atk: 1.35, spd: 1.0 },   // 落霞嶺尾關精英，數值同魔修（不設 boss，免得野外掉秘境兵器）
  yaojiang: { name: '血甲妖將・厲蒼', img: 'yaojiang', hp: 44, atk: 1.0, spd: 0.9, boss: true,   // 金丹中期標準配置約 45～50 息
    // 首領三相：at 血量比例門檻；atk、spd 為進入該相時的倍率；dr 受傷減免；leech 傷害吸血；
    // chargeCd 血刃斬間隔、chargeT 蓄力時間（雷法可打斷）、chargeMult 血刃斬倍率
    phases: [
      { name: '第一相', chargeCd: 8, chargeT: 2.4, chargeMult: 3.2 },
      { at: 0.66, name: '第二相', banner: ['妖將祭陣', '血陣護身，蓄力更快'], dr: 0.25, chargeCd: 6.5, chargeT: 2.2, chargeMult: 3.2 },
      { at: 0.33, name: '第三相', banner: ['血甲暴怒', '渾身浴血，以血養血'], atk: 1.3, spd: 1.35, chargeCd: 6, chargeT: 1.8, chargeMult: 3.6, leech: 0.25 },
    ] },
  // 測試用大 Boss：四相，血量約妖將 2.3 倍
  tianmo: { name: '九幽天魔・墮淵', img: 'tianmo', hp: 100, atk: 1.2, spd: 0.95, boss: true, intro: ['九幽天魔', '心魔所化，自深淵睜眼'],
    phases: [
      { name: '第一相', chargeCd: 7.5, chargeT: 2.4, chargeMult: 3.0 },
      { at: 0.75, name: '魔焰相', banner: ['魔焰護體', '黑焰繞身，受傷減三成'], dr: 0.3, chargeCd: 6.5, chargeT: 2.2, chargeMult: 3.2 },
      { at: 0.5, name: '雷殛相', banner: ['逆引天雷', '出手更快，蓄力更短'], spd: 1.3, chargeCd: 5.5, chargeT: 2.0, chargeMult: 3.4 },
      { at: 0.25, name: '九幽相', banner: ['九幽狂暴', '以血養魔，一擊重於千鈞'], atk: 1.35, spd: 1.25, chargeCd: 5, chargeT: 1.6, chargeMult: 4.0, leech: 0.3 },
    ] },
};
const monStats = (type, p, elite) => {
  const m = MONSTERS[type], k = Math.pow(1.45, p), e = elite ? 2.2 : 1;
  return { hp: Math.round(60 * k * m.hp * e), atk: Math.round(8 * k * m.atk * (elite ? 1.3 : 1)), def: Math.round(1 * k), interval: 1.5 / m.spd, exp: Math.round(10 * Math.pow(2.4, p) * (elite ? 2.5 : 1)), stone: Math.round(6 * Math.pow(1.5, p) * (elite ? 2 : 1)) };
};

// 地圖：區域與關卡；p 為難度（對應約略的境界等級）
const REGIONS = [
  { id: 'sect', icon: 'trial', name: '青冥宗', sub: '演武場試煉', bg: 'sect', mood: 'sect', stages: [
    { name: '試劍・山精傀儡', p: 0,   waves: ['shanjing', 'shanjing'] },
    { name: '試劍・靈狼幻影', p: 0.4, waves: ['yaoshou', 'yaoshou', 'shanjing'] },
    { name: '試劍・遊魂符陣', p: 0.8, waves: ['youhun', 'yaoshou', 'youhun*'] },
  ] },
  { id: 'village', icon: 'village', name: '山腳村', sub: '首次下山', bg: 'village', mood: 'village', stages: [
    { name: '村外狼患', p: 1.3, waves: ['yaoshou', 'yaoshou', 'yaoshou*'] },
    { name: '竹林山精', p: 1.7, waves: ['shanjing', 'yaoshou', 'shanjing*'] },
    { name: '古井夜魂', p: 2.1, waves: ['youhun', 'youhun', 'youhun*'] },
    { name: '亂葬屍傀', p: 2.6, waves: ['shikui', 'youhun', 'shikui*'] },
  ] },
  { id: 'wild', icon: 'hill', name: '落霞嶺', sub: '野外', bg: 'wild', mood: 'wild', grade: 'wild', stages: [
    { name: '嶺下山徑', p: 3.0, waves: ['shanjing', 'yaoshou', 'shikui'] },
    { name: '枯林屍陣', p: 3.5, waves: ['shikui', 'shikui', 'youhun*'] },
    { name: '魔修營地', p: 4.0, waves: ['moxiu', 'yaoshou', 'moxiu'] },
    { name: '斷崖遊魂', p: 4.6, waves: ['youhun', 'moxiu', 'youhun*'] },
    { name: '魔修頭目', bossIcon: true, p: 5.2, waves: ['shikui', 'moxiu', 'moxiu_boss*'] },
  ] },
  { id: 'realm', icon: 'cave', name: '幽冥古洞', sub: '秘境・每日三次', bg: 'realm', mood: 'dungeon', grade: 'realm', daily: 3, stages: [
    { name: '古洞外圍', p: 5.6, waves: ['moxiu', 'shikui', 'youhun*'] },
    { name: '血泉迴廊', p: 6.2, waves: ['shikui*', 'moxiu', 'moxiu*'] },
    { name: '妖將血池', p: 6.8, waves: ['shikui', 'yaojiang'] },
  ] },
  // 測試用：隨時可進、不限次數；難度依當下境界自動調整（scale）
  { id: 'trial', icon: 'demon', iconKeys: ['normal', 'hard', 'hell'], name: '心魔試煉', sub: '測試・九幽天魔', bg: 'realm', mood: 'dungeon', grade: 'realm', test: true, scale: true, stages: [
    { name: '心魔劫・普通', bossIcon: false, p: 0.3, waves: ['tianmo'] },     // p 為「目前境界＋p」
    { name: '心魔劫・困難', bossIcon: false, p: 1.2, waves: ['tianmo'] },
    { name: '心魔劫・地獄', bossIcon: true, p: 2.2, waves: ['tianmo'] },
  ] },
];

// 掉落：[物品, 機率, 數量下限, 上限]
const DROPS = {
  trial:   [['herb_b', 0.8, 2, 3], ['herb_l', 0.6, 1, 2], ['scroll', 0.8, 1, 3], ['ore', 0.9, 3, 6], ['star', 0.5, 1, 2]],
  sect:    [['herb_q', 0.6, 1, 2], ['herb_c', 0.4, 1, 1]],
  village: [['herb_q', 0.6, 1, 2], ['herb_c', 0.6, 1, 2], ['scroll', 0.15, 1, 1], ['ore', 0.3, 1, 2]],
  wild:    [['herb_c', 0.5, 1, 2], ['herb_b', 0.5, 1, 2], ['scroll', 0.25, 1, 1], ['ore', 0.5, 1, 3]],
  realm:   [['herb_b', 0.7, 1, 3], ['herb_l', 0.6, 1, 2], ['scroll', 0.6, 1, 2], ['ore', 0.7, 2, 4], ['star', 0.4, 1, 1], ['p_zao', 0.12, 1, 1]],
};
// 秘境妖將兵器掉落：首通必得霜寒劍；之後機率掉青冥劍
const BOSS_WEAPON = { first: 'shuanghan', rare: 'qingming', rareP: 0.12 };

// 人物：img 對應 assets/npc/<img>.webp，有圖的會在對話時顯示立繪
const PEOPLE = {
  hero:     { name: HERO_NAME },
  narr:     { name: '' },
  mother:   { name: '林母', img: 'mother' },
  elder:    { name: '周老村長', img: 'elder' },
  hunter:   { name: '獵戶阿虎', img: 'hunter' },
  guard:    { name: '守山弟子', img: 'guard' },
  xuanheng: { name: '玄衡長老', img: 'xuanheng' },
  shizun:   { name: '凌霄真人', img: 'shizun' },
  shixiong: { name: '師兄・陸沉舟', img: 'shixiong' },
  shijie:   { name: '師姐・柳晚吟', img: 'shijie' },
  yaojiang: { name: '厲蒼' },
};
