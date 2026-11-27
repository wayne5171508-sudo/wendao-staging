'use strict';
// ════════════════════════════════════════════
//  主角成長接進轉珠：放置版的功法、法寶、副手、靈根、造化丹、道侶印記 → 轉珠主角的攻擊與氣血
//  只影響「自己的主角」；計算在 Roster.growth()，由 Roster.calc 以隊長技同款的倍率效果套用（單一出口）
//  雲端 heroes 快照不變（仍是未加成的基礎數值），所以道侶看到的副隊長不含這些加成
//
//  公式（與放置版 S.stats 同一套加法，只是換算成轉珠沒有的屬性）：
//    攻擊 ＝（主角基礎攻擊 ＋ 副手兵器攻擊 × wpnAtk × offhandRate）×（1 ＋ 功法 ＋ 靈根 ＋ 造化丹 ＋ 法寶）×（1 ＋ 道侶印記）
//    氣血 ＝ 主角基礎氣血 ×（1 ＋ 功法 ＋ 靈根 ＋ 造化丹 ＋ 法寶）×（1 ＋ 道侶印記）
// ════════════════════════════════════════════
const PZ_GROWTH = {
  artRate: 1.0,       // 功法層數加成（data.js ARTS 的 stat.atk／stat.hp，例：青冥劍訣每層攻擊 8%）× 這個係數
  offhandRate: 0.5,   // 副手兵器的攻擊以幾成計入（主手已在 PZ_HERO.wpnAtk 計入）
  rootRate: 1.0,      // 靈根加成（已乘品階 GRADES 倍率）× 這個係數
  bonusRate: 1.0,     // 造化丹永久加成 S.d.bonus.atk／hp × 這個係數
  fabaoRate: 1.0,     // 法寶加成 × 這個係數（換算見 conv）
  // 轉珠沒有防禦與暴擊：放置版屬性 → 轉珠屬性的換算 [轉成哪個, 每 1% 換幾 %]
  //   暴擊：放置版暴擊傷害 ×1.8，每 1 點暴擊率 ≈ 期望傷害 +0.8% → 攻擊 +0.8%
  //   防禦：放置版防禦是每次受擊扣 def×0.5 的定值，無法對應倍率；取半價換成氣血（1% 防禦 → 0.5% 氣血）
  //   套用對象：法寶（鐘＝防禦、鏡＝暴擊、塔＝氣血）與靈根（火＝暴擊、土＝防禦）
  //   水（靈力）、雷（雷法傷害）、冰（修煉速度）在轉珠沒有對應，不換算
  conv: { atk: ['atk', 1], hp: ['hp', 1], crit: ['atk', 0.8], def: ['hp', 0.5] },
  // 道侶印記：有道侶（含 ?dev 模擬道侶／模擬在線）時，每層攻擊、氣血 +markRate（放置版同為每層 2%）
  markRate: 0.02,
};

// 流雲技（流雲劍、碧濤劍）：轉心珠、回血之外再補一段自身屬性傷害，避免換上流雲劍後打首領反而變弱
const PZ_LIUYUN_NUKE = 5;   // 攻擊幾倍
PZ_SKILLS.liuyun_sk.fx.push({ t: 'nuke', mult: PZ_LIUYUN_NUKE });
PZ_SKILLS.liuyun_sk.desc = `心珠全部轉為自身屬性珠，回復兩成氣血，再造成攻擊 ${PZ_LIUYUN_NUKE} 倍傷害`;

// 殘卷出口：功法升到第 from 層起，除了靈石還要殘卷（第 from 層 base 張，之後每層多 step 張）；前面的層數不變，已超過的層數不回收
const PZ_ART_SCROLL = { from: 6, base: 2, step: 1 };
const artScroll = (to) => (to >= PZ_ART_SCROLL.from ? PZ_ART_SCROLL.base + (to - PZ_ART_SCROLL.from) * PZ_ART_SCROLL.step : 0);   // 升到第 to 層要幾張
