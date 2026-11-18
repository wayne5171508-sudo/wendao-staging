'use strict';
// ════════════════════════════════════════════
//  轉珠角色與技能：所有角色、技能、隊伍加成數值都在這一個檔案
//  新增角色：在 PZ_CHARS 加一筆（指定 lead 隊長技 id、sk 主動技 id），放一張頭像 face 與一張立繪 art 即可
//  新增技能：在 PZ_SKILLS 加一筆，fx 從下方「效果庫」挑效果組合，不用改程式
//  邏輯在 js/roster.js（存檔、組隊、編組畫面、道侶快照），戰鬥套用在 js/puzzle.js
// ════════════════════════════════════════════

// ───────── 效果庫（隊長技與主動技共用，一個技能的 fx 可放多個效果）─────────
//  t: 'atk'     攻擊倍率 mult；可限定 el 屬性、fac 陣營、role 定位（都不填＝全隊）。隊長技＝整場；主動技＝本回合
//  t: 'hp'      氣血倍率 mult（同樣可限定 el／fac／role）。只在隊長技有效
//  t: 'rcv'     回復倍率 mult（同上）。只在隊長技有效
//  t: 'heal'    立即回復 pct 成最大氣血。主動技
//  t: 'delay'   全體敵人出手倒數 +n。主動技；放在隊長技＝每波開場生效
//  t: 'convert' 把 from 珠全轉成 to 珠（to 不填＝施放者屬性）。主動技
//  t: 'pierce'  無視敵方防禦與減傷。主動技＝本回合；隊長技＝整場
//  t: 'combo'   結算 Combo 數 +n。主動技＝本回合；隊長技＝每回合
//  t: 'nuke'    以 el 屬性（不填＝施放者屬性）對目標造成施放者攻擊 mult 倍傷害（計算相剋）；all: true＝打全體（各自相剋）。主動技
//  t: 'bleed'   代價：之後 n 回合，每回合結束隊伍損失 pct 成最大氣血（不會因此倒下，最少留 1）。主動技
//  t: 'leech'   本回合造成傷害的 pct 成回復為氣血。主動技
//  t: 'time'    轉珠時間 +sec 秒。隊長技＝每回合；主動技＝本回合
//  t: 'comboUp' 每多 1 Combo 的傷害加成再 +add（基礎見 PZ_CFG.comboStep）。隊長技＝整場；主動技＝本回合
//  t: 'convert' 的 from 可填陣列（多色一起轉）；atk／hp／rcv 的 el 可填陣列（多屬性）
//  el／fac 填 'self'＝施放者自己的屬性／陣營
const PZ_SKILLS = {
  // 主角（隊長）
  hero_lead:  { name: '靈根共鳴', desc: '與隊長同屬性的隊員攻擊 ×1.5', fx: [{ t: 'atk', el: 'self', mult: 1.5 }] },
  hero_sub:   { name: '同心護持', desc: '全隊氣血 ×1.2', fx: [{ t: 'hp', mult: 1.2 }] },
  // 仙寶（主角兵器）給的主動技：見 PZ_HERO.wpnSk
  jianqi:     { name: '劍氣', cd: 4, desc: '以自身屬性造成攻擊 10 倍傷害', fx: [{ t: 'nuke', mult: 10 }] },
  liuyun_sk:  { name: '流雲', cd: 5, desc: '心珠全部轉為自身屬性珠，回復兩成氣血', fx: [{ t: 'convert', from: 'heart' }, { t: 'heal', pct: 0.2 }] },
  shuang_sk:  { name: '霜寒', cd: 5, desc: '全體敵人出手倒數 +1', fx: [{ t: 'delay', n: 1 }] },
  qingming_sk:{ name: '青冥劍意', cd: 5, desc: '以自身屬性造成攻擊 16 倍傷害', fx: [{ t: 'nuke', mult: 16 }] },
  nitian_sk:  { name: '逆天', cd: 6, desc: '本回合無視防禦，且自身屬性攻擊 ×2', fx: [{ t: 'pierce' }, { t: 'atk', el: 'self', mult: 2 }] },
  jinxia_sk:  { name: '破防', cd: 4, desc: '本回合無視敵方的防禦與減傷', fx: [{ t: 'pierce' }] },
  chixiao_sk: { name: '連擊', cd: 4, desc: '本回合結算 Combo 數 +2', fx: [{ t: 'combo', n: 2 }] },
  // 通用（測試、道侶模擬用）
  ld_hp:      { name: '固守', desc: '全隊氣血 ×1.5', fx: [{ t: 'hp', mult: 1.5 }] },
  // ── SSR ──
  xq_lead:    { name: '玄穹庇佑', desc: '全隊氣血 ×1.5', fx: [{ t: 'hp', mult: 1.5 }] },   // 平衡 1118：×2 → ×1.5
  xq_sk:      { name: '天尊垂憐', cd: 6, desc: '回復五成氣血', fx: [{ t: 'heal', pct: 0.5 }] },
  lt_lead:    { name: '血煞滔天', desc: '火屬性隊員攻擊 ×2.1', fx: [{ t: 'atk', el: 'fire', mult: 2.1 }] },   // 平衡 1118：×2.5 → ×2.1（−16%）
  // 平衡 1118：12 倍 → 9 倍。厲天絕當隊長、一星：980 × 9 × 隊長技 2.1 ＝ 18,522，扣血甲妖將防禦 60 ＝ 18,462，約首領 28,000 血的 66%（舊版 29,340＝105%）
  lt_sk:      { name: '血海焚天', cd: 6, desc: '以火屬性對全體造成攻擊 9 倍傷害；之後 3 回合每回合損失 5% 氣血', fx: [{ t: 'nuke', el: 'fire', mult: 9, all: true }, { t: 'bleed', pct: 0.05, n: 3 }] },
  zj_lead:    { name: '殘魂業火', desc: '火與木屬性隊員攻擊 ×1.8', fx: [{ t: 'atk', el: ['fire', 'wood'], mult: 1.8 }] },
  zj_sk:      { name: '焚魂燼', cd: 6, desc: '以火屬性對全體造成攻擊 8 倍傷害，回復兩成氣血', fx: [{ t: 'nuke', el: 'fire', mult: 8, all: true }, { t: 'heal', pct: 0.2 }] },
  sn_lead:    { name: '凌霜心訣', desc: '水屬性隊員攻擊 ×1.5，全隊氣血 ×1.2', fx: [{ t: 'atk', el: 'water', mult: 1.5 }, { t: 'hp', mult: 1.2 }] },
  sn_sk:      { name: '萬里冰封', cd: 7, desc: '全體敵人出手倒數 +2', fx: [{ t: 'delay', n: 2 }] },
  // ── SR ──
  lq_lead:    { name: '七彩劍陣', desc: '每回合 Combo +1', fx: [{ t: 'combo', n: 1 }] },
  lq_sk:      { name: '七彩歸一', cd: 6, desc: '木珠與水珠全部轉為金珠，本回合 Combo +2', fx: [{ t: 'convert', from: ['wood', 'water'], to: 'metal' }, { t: 'combo', n: 2 }] },
  ly_lead:    { name: '噬魂嗜血', desc: '土屬性隊員攻擊 ×2', fx: [{ t: 'atk', el: 'earth', mult: 2 }] },
  ly_sk:      { name: '噬魂爪', cd: 5, desc: '本回合無視防禦，造成傷害的兩成回復氣血', fx: [{ t: 'pierce' }, { t: 'leech', pct: 0.2 }] },
  hy_lead:    { name: '蝶舞連環', desc: '每多 1 Combo 的傷害加成 +15%（25% → 40%）', fx: [{ t: 'comboUp', add: 0.15 }] },
  hy_sk:      { name: '赤蝶亂舞', cd: 4, desc: '本回合 Combo +3', fx: [{ t: 'combo', n: 3 }] },
  tj_lead:    { name: '天機推演', desc: '轉珠時間 +2 秒', fx: [{ t: 'time', sec: 2 }] },
  tj_sk:      { name: '窺天', cd: 4, desc: '本回合轉珠時間 +4 秒', fx: [{ t: 'time', sec: 4 }] },
  // ── R ──
  lz_lead:    { name: '少年意氣', desc: '金屬性隊員攻擊 ×1.3', fx: [{ t: 'atk', el: 'metal', mult: 1.3 }] },
  lz_sk:      { name: '初鋒', cd: 5, desc: '以自身屬性造成攻擊 8 倍傷害', fx: [{ t: 'nuke', mult: 8 }] },
  bs_lead:    { name: '杏林春暖', desc: '全隊回復 ×1.4', fx: [{ t: 'rcv', mult: 1.4 }] },
  bs_sk:      { name: '妙手回春', cd: 4, desc: '回復兩成氣血', fx: [{ t: 'heal', pct: 0.2 }] },
  yy_lead:    { name: '幽冥咒', desc: '魔族隊員攻擊 ×1.3', fx: [{ t: 'atk', fac: 'demon', mult: 1.3 }] },
  yy_sk:      { name: '幽水引', cd: 5, desc: '心珠全部轉為水珠', fx: [{ t: 'convert', from: 'heart', to: 'water' }] },
  ty_lead:    { name: '鐵壁', desc: '全隊氣血 ×1.3', fx: [{ t: 'hp', mult: 1.3 }] },
  ty_sk:      { name: '鎮嶽', cd: 5, desc: '全體敵人出手倒數 +1', fx: [{ t: 'delay', n: 1 }] },
};

// ───────── 分類 ─────────
const PZ_ROLES = { dps: '輸出', heal: '回血', ctrl: '控場', sup: '輔助', tank: '防禦' };
const PZ_FACS = { sect: { name: '正道宗門', c: '#9fd8ff' }, demon: { name: '魔族', c: '#ff7a9a' }, rogue: { name: '散修', c: '#d8c48a' } };
// 稀有度：maxStar 星級上限
const PZ_RARITY = { R: { c: '#bfc4ca', maxStar: 3 }, SR: { c: '#ffd36a', maxStar: 4 }, SSR: { c: '#ff7a4a', maxStar: 5 } };
// 星級加成：數值 ×（1 ＋（星級−1）× step）；之後抽到重複角色升星
const PZ_STAR = { step: 0.12 };
// 同陣營加成：某陣營人數＝隊上該陣營抽卡角色數＋萬用（主角、副隊長，最多 2）→ 該陣營成員與萬用的攻擊、氣血倍率
// 三個陣營各算一次，只取最高檔的一個陣營（至少要有 1 個該陣營抽卡角色）
const PZ_FAC_BONUS = [{ n: 3, atk: 1.1, hp: 1.05 }, { n: 4, atk: 1.2, hp: 1.1 }, { n: 5, atk: 1.35, hp: 1.15 }];

// ───────── 主角（隊長／副隊長）─────────
// 屬性＝靈根；數值 ×（1 ＋ 境界 lv × lvStep）；主手兵器（仙寶）每 1 點攻擊再加 wpnAtk 點轉珠攻擊，並決定主動技
// lead 當隊長時的隊長技、sub 當副隊長時的副隊長技
const PZ_HERO = {
  fac: 'sect', role: 'dps', atk: 520, hp: 1400, rcv: 140, lvStep: 0.08, wpnAtk: 3,
  lead: 'hero_lead', sub: 'hero_sub', sk: 'jianqi',
  wpnSk: { qinggang: 'jianqi', xuantie: 'jianqi', liuyun: 'liuyun_sk', bitao: 'liuyun_sk', shuanghan: 'shuang_sk', zichen: 'shuang_sk',
    jinxia: 'jinxia_sk', qingming: 'qingming_sk', chixiao: 'chixiao_sk', nitian: 'nitian_sk' },
};
// 沒綁道侶時的副隊長補位（綁了但對方還沒同步過快照：用這組數值、名字換成道侶名字）
const PZ_MATE_DEFAULT = { name: '雲遊道友', char: 'yunxi', el: 'wood', lv: 0, atk: 460, hp: 1300, rcv: 200, wpn: null, sk: 'liuyun_sk', sub: 'hero_sub' };

// ───────── 抽卡角色 ─────────
// id 唯一；name 名號（「稱號·名字」時卡片只顯示名字，或用 short 指定）；el 五行；role 定位；fac 陣營；rare 稀有度；atk/hp/rcv 一星數值；lead 隊長技、sk 主動技（PZ_SKILLS 的 id）
// face 頭像（正方形 256×256）；art 立繪（直式 720×1280 透明底），都放 assets/char/。face 沒有就裁 art 上半部，都沒有就用屬性色塊＋名字
const PZ_CHARS = [
  // SSR
  { id: 'xuanqiong', name: '玄穹天尊',         el: 'earth', role: 'sup',  fac: 'sect',  rare: 'SSR', atk: 720, hp: 1900, rcv: 220, lead: 'xq_lead', sk: 'xq_sk', face: 'assets/char/xuanqiong_face.webp', art: 'assets/char/xuanqiong.webp' },
  { id: 'litianjue', name: '血煞魔尊·厲天絕',  el: 'fire',  role: 'dps',  fac: 'demon', rare: 'SSR', atk: 980, hp: 1350, rcv: 40, lead: 'lt_lead', sk: 'lt_sk', face: 'assets/char/litianjue_face.webp', art: 'assets/char/litianjue.webp' },
  { id: 'zhuji',     name: '焚天殘魂·朱寂',    el: 'fire',  role: 'dps',  fac: 'rogue', rare: 'SSR', atk: 900, hp: 1300, rcv: 110, lead: 'zj_lead', sk: 'zj_sk', face: 'assets/char/zhuji_face.webp', art: 'assets/char/zhuji.webp' },
  { id: 'suningxue', name: '凌霜仙子·蘇凝雪',  el: 'water', role: 'ctrl', fac: 'sect',  rare: 'SSR', atk: 760, hp: 1550, rcv: 160, lead: 'sn_lead', sk: 'sn_sk', face: 'assets/char/suningxue_face.webp', art: 'assets/char/suningxue.webp' },
  // SR
  { id: 'luqingchuan', name: '七彩劍尊·陸清川', el: 'metal', role: 'ctrl', fac: 'sect',  rare: 'SR', atk: 660, hp: 1200, rcv: 90, lead: 'lq_lead', sk: 'lq_sk', face: 'assets/char/luqingchuan_face.webp', art: 'assets/char/luqingchuan.webp' },
  { id: 'langye',      name: '噬魂·狼夜',      el: 'earth', role: 'dps',  fac: 'demon', rare: 'SR', atk: 760, hp: 1150, rcv: 50, lead: 'ly_lead', sk: 'ly_sk', face: 'assets/char/langye_face.webp', art: 'assets/char/langye.webp' },
  { id: 'suhongyu',    name: '赤蝶·蘇紅羽',    el: 'wood',  role: 'dps',  fac: 'rogue', rare: 'SR', atk: 720, hp: 1050, rcv: 80, lead: 'hy_lead', sk: 'hy_sk', face: 'assets/char/suhongyu_face.webp', art: 'assets/char/suhongyu.webp' },
  { id: 'tianjizi',    name: '天機子',         el: 'metal', role: 'sup',  fac: 'rogue', rare: 'SR', atk: 560, hp: 1150, rcv: 130, lead: 'tj_lead', sk: 'tj_sk', face: 'assets/char/tianjizi_face.webp', art: 'assets/char/tianjizi.webp' },
  // R
  { id: 'linzhao',   name: '少年劍子·林昭',    el: 'metal', role: 'dps',  fac: 'sect',  rare: 'R', atk: 560, hp: 1000, rcv: 60, lead: 'lz_lead', sk: 'lz_sk', face: 'assets/char/linzhao_face.webp', art: 'assets/char/linzhao.webp' },
  { id: 'bairuoshui', name: '回春聖手·白若水', el: 'wood',  role: 'heal', fac: 'sect',  rare: 'R', atk: 400, hp: 1050, rcv: 240, lead: 'bs_lead', sk: 'bs_sk', face: 'assets/char/bairuoshui_face.webp', art: 'assets/char/bairuoshui.webp' },
  { id: 'youyao',    name: '魔族聖女·幽瑤',    el: 'water', role: 'sup',  fac: 'demon', rare: 'R', atk: 470, hp: 1000, rcv: 110, lead: 'yy_lead', sk: 'yy_sk', face: 'assets/char/youyao_face.webp', art: 'assets/char/youyao.webp' },
  { id: 'tieyue',    name: '魔將·鐵嶽',        el: 'earth', role: 'tank', fac: 'demon', rare: 'R', atk: 420, hp: 2000, rcv: 60, lead: 'ty_lead', sk: 'ty_sk', face: 'assets/char/tieyue_face.webp', art: 'assets/char/tieyue.webp' },
];
// 新存檔與舊存檔升級時送的角色（之後抽卡才會產出其他角色）
const PZ_STARTER = ['linzhao', 'bairuoshui', 'tieyue'];
// 改過 id 的角色：舊存檔裡的舊 id 讀檔時換成新 id（佔位版 → 正式版）；對不到的舊角色丟掉，若因此一個角色都沒有就重送起始角色
const PZ_RENAMED = { shizun: 'xuanqiong', shijie: 'suningxue', shixiong: 'luqingchuan', guard: 'linzhao', mozhu: 'litianjue', monv: 'youyao', mojiang: 'tieyue',
  yaoshi: 'bairuoshui', sanxiu: 'tianjizi', hunter: 'langye', shidi: 'suhongyu' };
