'use strict';
// ════════════════════════════════════════════
//  角色抽卡（仙緣召喚）：所有可調數值都在這一個檔案，邏輯在 js/gacha.js
//  角色資料（名字、立繪、技能、星級上限）在 js/roster-cfg.js 的 PZ_CHARS／PZ_RARITY
// ════════════════════════════════════════════
const GACHA_CFG = {
  // 卡池：主角與道侶不進卡池；同稀有度內平均（劇情戰友結識前排除，見 Gacha.poolOf）
  pool: {
    SSR: ['xuanqiong', 'litianjue', 'zhuji', 'suningxue'],
    SR:  ['luqingchuan', 'langye', 'suhongyu', 'tianjizi'],
    R:   ['linzhao', 'bairuoshui', 'youyao', 'tieyue'],
  },
  rates: { SSR: 0.03, SR: 0.17, R: 0.80 },   // 基礎機率
  pity: {
    hard: 90,        // 第 90 抽（距上次 SSR）必出 SSR
    softFrom: 75,    // 第 75 抽起每抽 SSR 機率 +softStep（75 抽＝3%+6%）
    softStep: 0.06,
    srEvery: 10,     // 每 10 抽至少 1 個 SR 以上（單抽也累計）
  },
  dailyMax: { pz: 30, old: 30 },   // 每日召喚上限（抽數，含仙緣券與免費抽）：pz 轉珠仙緣召喚、old 舊機緣（法寶池＋功法池合計）；台北時間換日重置，邏輯在 js/bonus.js 的 GachaCap
  cost: { one: 160, ten: 1500 },   // 靈石；仙緣券 1 張＝單抽 1 次（十連要 10 張）
  // 重複角色：升星 +1 到 PZ_RARITY[稀有度].maxStar；滿星後轉星塵
  dust: { R: 2, SR: 10, SSR: 40 },
  exchange: { stone: 30, ticket: 6 },   // 1 星塵＝30 靈石；6 星塵換 1 張仙緣券
  hist: 20,                             // 抽卡紀錄保留最近幾筆
  ssrFull: 1400,                        // SSR 全螢幕出場光持續毫秒
  flipGap: 220,                         // 十連每張翻牌間隔毫秒
};
