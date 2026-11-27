'use strict';
// ════════════════════════════════════════════
//  神通領悟：突破大境界（凝氣→築基、築基→結丹、結丹→元嬰）成功後，從該境界的池子抽 pick 個三選一，永久生效
//  realm：哪個大境界的池子（1＝築基、2＝結丹、3＝元嬰；化神之後再開）
//  char：'any' 通用；'qingyuan' 男主專屬；'yunxi' 女主專屬
//  fx：沿用 roster-cfg.js 的效果庫，以隊長技的方式整場生效；who:'hero'＝只作用在主角，el:'self'＝主角的屬性
//  單一神通上限約 ×1.2 或 +1 秒，不壓過技能進化。邏輯在 js/shentong.js，只給自己，不進雲端快照
// ════════════════════════════════════════════
const SHENTONG = [
  // ── 築基 ──
  { id: 'st_zj_jianyin', realm: 1, char: 'qingyuan', name: '劍吟初鳴', desc: '主角攻擊 ×1.1', fx: [{ t: 'atk', who: 'hero', mult: 1.1 }] },
  { id: 'st_zj_fengmai', realm: 1, char: 'qingyuan', name: '鋒脈貫通', desc: '每多 1 Combo 傷害再 +3%', fx: [{ t: 'comboUp', add: 0.03 }] },
  { id: 'st_zj_qingxin', realm: 1, char: 'yunxi', name: '清心滌念', desc: '全隊回復 ×1.15', fx: [{ t: 'rcv', mult: 1.15 }] },
  { id: 'st_zj_mengshou', realm: 1, char: 'yunxi', name: '夢守靈台', desc: '每回合結束回復 2% 氣血', fx: [{ t: 'regen', pct: 0.02 }] },
  { id: 'st_zj_ningshi', realm: 1, char: 'any', name: '凝視微塵', desc: '轉珠時間 +0.5 秒', fx: [{ t: 'time', sec: 0.5 }] },
  { id: 'st_zj_guyuan', realm: 1, char: 'any', name: '固元培本', desc: '全隊氣血 ×1.08', fx: [{ t: 'hp', mult: 1.08 }] },
  { id: 'st_zj_tunaxi', realm: 1, char: 'any', name: '吐納歸息', desc: '主角氣血 ×1.15', fx: [{ t: 'hp', who: 'hero', mult: 1.15 }] },
  // ── 結丹 ──
  { id: 'st_jd_duanyue', realm: 2, char: 'qingyuan', name: '斷岳', desc: '主角攻擊 ×1.15', fx: [{ t: 'atk', who: 'hero', mult: 1.15 }] },
  { id: 'st_jd_lianfeng', realm: 2, char: 'qingyuan', name: '連鋒疊勁', desc: '每多 1 Combo 傷害再 +5%', fx: [{ t: 'comboUp', add: 0.05 }] },
  { id: 'st_jd_poxu', realm: 2, char: 'qingyuan', name: '破虛同鳴', desc: '與主角同屬性的隊員攻擊 ×1.1', fx: [{ t: 'atk', el: 'self', mult: 1.1 }] },
  { id: 'st_jd_huiliu', realm: 2, char: 'yunxi', name: '靈泉迴流', desc: '全隊回復 ×1.2', fx: [{ t: 'rcv', mult: 1.2 }] },
  { id: 'st_jd_yanxi', realm: 2, char: 'yunxi', name: '霧帷', desc: '受到的傷害 ×0.9', fx: [{ t: 'guard', pct: 0.1 }] },
  { id: 'st_jd_lingxi', realm: 2, char: 'any', name: '靈犀一點', desc: '轉珠時間 +0.75 秒', fx: [{ t: 'time', sec: 0.75 }] },
  { id: 'st_jd_xuanjia', realm: 2, char: 'any', name: '玄甲護脈', desc: '全隊氣血 ×1.12', fx: [{ t: 'hp', mult: 1.12 }] },
  { id: 'st_jd_tongmai', realm: 2, char: 'any', name: '百脈同流', desc: '全隊攻擊 ×1.06', fx: [{ t: 'atk', mult: 1.06 }] },
  // ── 元嬰 ──
  { id: 'st_yy_wanren', realm: 3, char: 'qingyuan', name: '萬刃歸一', desc: '主角攻擊 ×1.2', fx: [{ t: 'atk', who: 'hero', mult: 1.2 }] },
  { id: 'st_yy_lieshi', realm: 3, char: 'qingyuan', name: '裂勢連斬', desc: '每多 1 Combo 傷害再 +6%', fx: [{ t: 'comboUp', add: 0.06 }] },
  { id: 'st_yy_ruiqi', realm: 3, char: 'qingyuan', name: '鋒芒共振', desc: '與主角同屬性的隊員攻擊 ×1.12', fx: [{ t: 'atk', el: 'self', mult: 1.12 }] },
  { id: 'st_yy_mengze', realm: 3, char: 'yunxi', name: '夢澤長春', desc: '每回合結束回復 3% 氣血', fx: [{ t: 'regen', pct: 0.03 }] },
  { id: 'st_yy_hunbi', realm: 3, char: 'yunxi', name: '引魂為壁', desc: '受到的傷害 ×0.85', fx: [{ t: 'guard', pct: 0.15 }] },
  { id: 'st_yy_huanliu', realm: 3, char: 'yunxi', name: '光陰緩流', desc: '轉珠時間 +1 秒', fx: [{ t: 'time', sec: 1 }] },
  { id: 'st_yy_tianxi', realm: 3, char: 'any', name: '天息養元', desc: '全隊氣血 ×1.15', fx: [{ t: 'hp', mult: 1.15 }] },
  { id: 'st_yy_jingyuan', realm: 3, char: 'any', name: '靜淵', desc: '每波開場，敵人出手倒數 +1', fx: [{ t: 'delay', n: 1 }] },
];

const SHENTONG_CFG = {
  pick: 3,          // 每次抽幾個選項
  resetScroll: 30,  // 重新領悟一次花幾張功法殘卷
};
