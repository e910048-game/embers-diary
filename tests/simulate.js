// 模擬試玩（25.1/26.1全面重寫）：不再以180天為單位，改為「直到達成tier3(等級10+，對應全部4個tier組)
// 或步數上限」為終止條件；5主流派×3種分配策略交叉測試；額外輸出SAN曲線、裝備前綴抽取分布、
// 有/無同伴對照、單人vs.wedding_ring雙效對照。
// 執行方式：node tests/simulate.js
//
// 註：26.2分級Boss尚未在ENEMIES資料中個別建模，本模擬以「達成tier3(level>=10)」近似代表
// 「全部4個tier組畢業」的終止條件。
//
// 2026-09-28補：先前SAN只在統計裡被動讀取(sanSum += state.san)，本身完全沒有機制——runBattle()
// 殺敵不扣SAN、rest()睡覺不回SAN、也從未模擬血月夜，導致sanAvg/sanMin印出來的數字其實只反映隨機
// 事件文字裡剛好給了多少SAN，跟真正的SAN系統(擊殺-4/夜晚壓力/血月relief等，見logic.js SAN_TIERS)
// 完全脫鉤。這次補上：runBattle()殺敵扣SAN、rest()睡覺回SAN(sanRestRegen)、新增runBloodMoonNight()
// 模擬血月夜(依resolveBloodMoonDefense決定打1或2場、勝利套用bloodMoonRewards含SAN relief)、
// 每phase結算後檢查applySanCollapse。夜晚壓力(nightSanPressure)已經在L.applyPhaseDecay內建，
// 本檔案本來就每步呼叫，不用額外處理。chooseAction()也補了SAN見底時優先rest(cautious/balanced)，
// 否則bot會一路探索到SAN歸零反覆崩潰，死亡率被打爆到60~92%(不是SAN系統的問題，是bot不會看警示)。
//
// 2026-09-28後續：血月夜補進來後deathRate一度整批飆到95~100%，查根因後發現**不是SAN、也不是血月
// 戰鬥數值本身太強**，是game.js裡一個更嚴重的既有bug：battleAttack(擊敗)跟battleFlee(逃跑成功)
// 呼叫的是同一個onEnd()、不分勝負——runBloodMoonWave/onTierZoneWon/onAbyssSurgeWon完全沒檢查
// 「這仗到底打贏了沒」，逃跑一路逃到底照樣領完整血月獎勵、插Tier收復旗標，等於不用打就能過血月夜。
// 這個bug已經在game.js修好(onEnd現在帶true/false，見git log「逃跑等同擊敗」)，但也代表：一個
// 打不贏血月的角色，真實玩家原本就能靠逃跑活下來(只是不會被貼「已守住」的標籤、沒有獎勵)——這件
// 事本檔案完全沒模擬(runBattle以前只會硬打到一方死亡，沒有flee)。所以這裡也對應補上「打不贏就跑」
// 的邏輯(見runBattle內的roundsToKill/roundsISurvive判斷，50%逃跑成功率比照game.js)，並修正
// clearUpcomingThreat只在打贏分支才呼叫的疏漏(比照game.js在血月夜一開始就清，不然逃跑或打輸會讓
// isThreatDue卡著true，下次rest()立刻又觸發一次血月夜)。修完後cautious/balanced的deathRate回到
// 0~19%(接近歷史基準)，aggressive仍是100%死亡——這是aggressive人設「不顧一切、只探索」刻意的結果，
// 不是bug。結論：**血月戰鬥數值本身沒有問題，先前的死亡率飆升是「逃跑等同擊敗」那個bug造成模擬器
// 誤判(bot沒有flee邏輯所以只能站著死)，已在game.js與本檔案一併修正、跑過驗證**。

const L = require("../js/logic.js");

const RUNS = 100;
const MAX_STEPS = 600; // 安全上限，避免單局跑不出tier3時無限迴圈
const TARGET_LEVEL = 10; // tier = floor((level-1)/3) >= 3
// 2026-07-04修正：本模擬器不區分行動類型的體力成本(單純每phase跑固定次數迴圈)，原本借用
// logic.js的ACTION_POINTS_PER_PHASE(=2)當次數上限——但那個欄位其實是死代碼，從未在真實遊戲邏輯
// 裡被讀取，真正限制玩家一個phase能做幾次行動的是體力(explore_near每次2點，六點上限，一個phase
// 最多3次)。刪除死代碼的同時，這裡改成獨立的本地常數，數值對齊體力系統的實際吞吐量，不再依賴
// 已刪除的匯出
const ACTIONS_PER_PHASE = 3;

function gather(state) {
  L.applyEffect(state, { resources: L.gatherYield(Math.random, state) });
}

function rest(state) {
  // 2026-09-28：血月夜是排定事件(isThreatDue)，跟下面的raidChance夜襲是兩套不同機制，優先判斷
  if (state.phase === "night" && L.isThreatDue(state)) {
    runBloodMoonNight(state);
    return;
  }
  if (state.phase === "night" && Math.random() < L.raidChance(state)) {
    runBattle(state, "enemy_walker_weak");
    return;
  }
  if (state.resources.food > 0 && state.resources.water > 0) {
    L.applyEffect(state, { hp: 15, resources: { food: -1, water: -1 } });
  }
  // 2026-09-28：睡眠SAN回復(夜晚全額/白天3成，SAN<50時加成)，比照game.js doRest的sanRestRegen
  L.applyEffect(state, { san: L.sanRestRegen(state, state.phase) });
}

// 2026-09-28：血月夜——依resolveBloodMoonDefense決定防禦是否擋下第一波(擋下只打cyborg_nemesis，
// 沒擋下打brute+cyborg_nemesis兩場，兩場都用extraTier:1貼近game.js的waves設定)。贏了才會拿到
// bloodMoonRewards(含固定SAN relief，見logic.js BLOOD_MOON_VICTORY_SAN_RELIEF)；死在血月夜由
// runBattle內部的state.hp<=0直接反映，外層迴圈的die檢查會抓到。
//
// ⚠️ 2026-09-28重要修正：clearUpcomingThreat比照game.js的startBloodMoonNight()「一開始就清」，
// 不能只在打贏那個分支才清——之前漏了這個，只要逃跑或打輸，isThreatDue會一直卡著true，
// 下次rest()會立刻又觸發一次血月夜，等於同一個晚上打到死為止，這也是死亡率一度被打到95~100%
// 的一部分原因(另一部分是game.js本體「逃跑=白撿血月獎勵」那個bug，已在game.js修好，見git log)。
function runBloodMoonNight(state) {
  state._bloodMoons = (state._bloodMoons || 0) + 1;
  L.clearUpcomingThreat(state);
  const defense = L.resolveBloodMoonDefense(state);
  if (defense.wavesBlocked === 0) {
    const r1 = runBattle(state, "enemy_walker_brute", { extraTier: 1 });
    if (state.hp <= 0) return;
    if (r1 === "fled") { onBloodMoonFleeSim(state); return; }
  }
  const r2 = runBattle(state, "enemy_cyborg_nemesis", { extraTier: 1 });
  if (state.hp <= 0) return;
  if (r2 === "fled") { onBloodMoonFleeSim(state); return; }
  L.bloodMoonRewards(state);
}

// 逃跑收尾：比照game.js的onBloodMoonFlee()——活下來但沒守住，沒有血月獎勵，資源被翻找損失一些
function onBloodMoonFleeSim(state) {
  state._bloodMoonFlees = (state._bloodMoonFlees || 0) + 1;
  ["food", "water", "scrap"].forEach(k => { const l = Math.min(3, state.resources[k] || 0); if (l > 0) state.resources[k] -= l; });
}

function reinforce(state) {
  // #21-2：改用22.2的reinforceFacility，挑選目前等級最低的設備強化（四大設備達Lv3封頂）
  const key = L.FACILITY_KEYS.reduce((min, k) =>
    (state.facilities[k] || 0) < (state.facilities[min] || 0) ? k : min, L.FACILITY_KEYS[0]);
  L.reinforceFacility(state, key);
}

function facilitiesTotal(state) {
  return L.FACILITY_KEYS.reduce((s, k) => s + (state.facilities[k] || 0), 0);
}

// 戰鬥：依26.1 getScaledEnemy依玩家等級疊加敵人數值；勝利時依27.1掉落rare+裝備自動實例化。
// opts可傳extraTier(血月夜用，貼近game.js的waves設定)。回傳"fled"代表逃跑成功(活著但沒打贏)，
// 其他情況呼叫端靠state.hp<=0(死亡)或函式正常返回(打贏)分辨——跟game.js的battleAttack/battleFlee對齊。
//
// 2026-09-28新增「打不贏就跑」：原本這裡是硬打到一方死亡，沒有flee概念，導致血月夜這類強制遭遇
// 對低等角色是死亡率100%的無腦互殺(見git log「把SAN機制接進模擬器」)。真實玩家遇到打不贏的仗
// 會按🏃逃跑，這裡用「照現在的傷害比，我方會先死」當判斷依據，50%成功率跟game.js battleFlee一致，
// 失敗只挨一下(不會因為嘗試逃跑而額外受罰)
function runBattle(state, enemyId, opts) {
  const scaled = L.getScaledEnemy(enemyId, state, opts);
  let hpLeft = scaled.hp;
  while (hpLeft > 0 && state.hp > 0) {
    const myStats = L.getEffectiveStats(state);
    const myDmg = Math.max(1, L.battleDamage(myStats.atk, L.getShreddedDef(scaled)));
    const enemyDmg = Math.max(1, scaled.atk - myStats.def);
    const roundsToKill = Math.ceil(hpLeft / myDmg);
    const roundsISurvive = Math.floor(state.hp / enemyDmg);
    if (roundsToKill > roundsISurvive) {
      if (Math.random() < 0.5) return "fled";
      L.applyEffect(state, { hp: -enemyDmg }); // 逃跑失敗，白挨一下，下一輪再試
      continue;
    }
    L.consumeAmmoForAttack(state);
    const dmgToEnemy = L.battleDamage(myStats.atk, L.getShreddedDef(scaled));
    hpLeft -= dmgToEnemy;
    L.applyDefShred(scaled, state); // 27.4
    if (hpLeft <= 0) break;
    if (scaled.stunned) {
      scaled.stunned = false;
    } else {
      const dmgToPlayer = L.battleDamage(scaled.atk, myStats.def);
      L.maybeGenerateShield(state, dmgToPlayer);
      const finalDmg = L.absorbShield(state, dmgToPlayer);
      L.applyEffect(state, { hp: -finalDmg });
    }
    if (L.maybeStunEnemy(state)) scaled.stunned = true; // 27.4
  }
  if (hpLeft <= 0) {
    L.applyEffect(state, { san: -L.SAN_COST_PER_KILL }); // 2026-09-28：比照game.js battleAttack，每殺一隻扣SAN
    L.gainExp(state, scaled.expReward || 0);
    const drop = L.pickWeighted((L.ENEMIES[enemyId] || {}).dropTable || []);
    if (drop) {
      const item = L.ITEMS[drop.itemId];
      if (item && ["weapon", "armor", "accessory"].includes(item.type)) {
        const slot = item.type;
        const current = state.equipment[slot] ? L.getEquipRef(state, state.equipment[slot]) : null;
        if (["rare", "epic", "legendary"].includes(item.rarity)) {
          const instId = L.instantiateEquipment(state, drop.itemId, Math.random);
          const inst = L.getInstance(state, instId);
          if (inst && inst.prefix) state._prefixDrops.push(inst.prefix.id);
          if (inst) state._rarityDrops.push(inst.rarity);
          if (!current || current.rarity !== "legendary") {
            state.equipment[slot] = instId;
          }
        } else {
          // common/uncommon：裝備後屬性(atk/def)優於目前裝備時才換裝
          const key = slot === "armor" ? "def" : "atk";
          const newVal = (item.stats && item.stats[key]) || 0;
          const curVal = current && current.stats ? (current.stats[key] || 0) : -1;
          if (!current || newVal > curVal) {
            state.equipment[slot] = drop.itemId;
          }
        }
      }
    }
  }
}

function runEvent(state, evt, strategy) {
  if (!evt.options || evt.options.length === 0) return;
  const valid = evt.options.filter(opt => {
    if (!opt.requiresResource) return true;
    return Object.entries(opt.requiresResource).every(([k, v]) => (state.resources[k] || 0) >= v);
  });
  const opts = valid.length > 0 ? valid : evt.options;

  let chosen;
  if (strategy === "aggressive") {
    chosen = opts.find(o => o.battle) || opts[0];
  } else if (strategy === "cautious") {
    chosen = opts.find(o => !o.battle && !o.roll) || opts.find(o => !o.battle) || opts[0];
  } else {
    chosen = opts[Math.floor(Math.random() * opts.length)];
  }

  if (chosen.roll) {
    const outcome = Math.random() < chosen.roll.chance ? chosen.roll.success : chosen.roll.fail;
    L.applyEffect(state, outcome.effect);
    if (outcome.battle) runBattle(state, outcome.battle);
    return;
  }
  if (chosen.battle) {
    runBattle(state, chosen.battle);
    return;
  }
  L.applyEffect(state, chosen.effect);
}

function chooseAction(state, strategy) {
  const lowHp = state.hp < state.hpMax * 0.5;
  const lowFood = state.resources.food <= 1;
  const lowWater = state.resources.water <= 1;
  // 2026-09-28：SAN見底時，有判斷力的玩家看到「動搖/崩潰邊緣」警示會主動休息(rest()才會回SAN，
  // 見上面的sanRestRegen)。沒有這條，cautious/balanced會一路探索到SAN歸零反覆崩潰，死亡率被打爆
  // (實測：加這條之前cautious死亡率從一路0%飆到60~92%，加了之後才恢復正常，見git log)——
  // aggressive刻意不加，「不顧一切」本來就是這個人設的意思，讓它繼續無視警示
  const lowSan = L.getSanTier(state).id === "critical" || L.getSanTier(state).id === "broken";

  if (strategy === "cautious") {
    if (lowHp || lowSan) return "rest";
    if (lowFood || lowWater) return "gather";
    if (state.resources.scrap >= L.reinforceCost(state) && facilitiesTotal(state) < 12) return "reinforce";
    return Math.random() < 0.3 ? "explore" : "gather";
  }
  if (strategy === "aggressive") {
    if (state.hp < state.hpMax * 0.2) return "rest";
    return "explore";
  }
  if (lowHp || lowSan) return "rest";
  if (lowFood || lowWater) return "gather";
  // #21-2：balanced在廢料充足且設備未滿級時，適度將廢料投入設備強化（避免長期溢出）
  if (state.resources.scrap >= L.reinforceCost(state) && facilitiesTotal(state) < 12 && Math.random() < 0.3) return "reinforce";
  return "explore";
}

// faction: 主流派id，null表示維持awakening隨機分配
function simulateOneRun(strategy, faction, opts = {}) {
  const state = L.defaultState();
  state._prefixDrops = [];
  state._rarityDrops = [];
  let sanSum = 0, sanCount = 0, sanMin = state.san, sanCollapses = 0;
  let scrapCappedPhases = 0, totalPhases = 0, firstScrapCapDay = null;

  if (opts.withCompanion) {
    L.recruitCompanion(state, "雷恩");
    state.companions["雷恩"] = "guard";
  }
  if (opts.weddingRing) {
    const instId = L.instantiateEquipment(state, "wedding_ring", () => 0.99);
    state.equipment.accessory = (typeof instId === "string" && instId.startsWith("inst_")) ? instId : instId;
    state.spouseState.weddingRingActive = true;
    state.spouseState.hasLinked = true;
  }

  // #21-2：枯燥度指標——統計第20天後各行動次數，計算採集佔比
  const actionsAfterDay20 = { gather: 0, total: 0 };

  for (let step = 0; step < MAX_STEPS; step++) {
    for (let ap = ACTIONS_PER_PHASE; ap > 0; ap--) {
      const action = chooseAction(state, strategy);
      if (state.day > 20) {
        actionsAfterDay20.total++;
        if (action === "gather") actionsAfterDay20.gather++;
      }
      if (action === "explore") {
        const evt = L.pickEvent(state);
        runEvent(state, evt, strategy);
      } else if (action === "gather") {
        gather(state);
      } else if (action === "rest") {
        rest(state);
      } else if (action === "reinforce") {
        reinforce(state);
      }
      if (state.hp <= 0) return finish(state, true);
      if (action === "rest") break;
      L.applyActionRegen(state);
    }

    if (state.companions && state.companions["雷恩"] === "gather") {
      L.applyEffect(state, { resources: L.gatherYield(Math.random) });
    }

    // 主流派覺醒後，依模擬指定的faction選定(2026-07-05技能點系統重設：改由玩家手動選擇，不再隨機)，並把所有技能點投入該流派
    if (state.awakening && state.skills && faction) {
      if (!state.skills.faction) L.chooseFaction(state, faction);
      while (L.spendSkillPoint(state, faction)) { /* 投完所有技能點 */ }
    }

    // #21-2：廢料溢出曲線——記錄scrap觸頂(達resourceCaps.scrap)的階段數與首次觸頂的天數
    if (state.resources.scrap >= state.resourceCaps.scrap) {
      scrapCappedPhases++;
      if (firstScrapCapDay === null) firstScrapCapDay = state.day;
    }
    totalPhases++;

    const died = L.applyPhaseDecay(state);
    if (L.applySanCollapse(state)) sanCollapses++; // 2026-09-28：SAN歸零時階段結束昏厥(不致死，HP-8+少量物資)
    sanSum += state.san; sanCount++;
    sanMin = Math.min(sanMin, state.san);
    if (died) return finish(state, true);
    L.advancePhase(state);

    if (state.level >= TARGET_LEVEL) return finish(state, false, true);
  }
  return finish(state, false, false);

  function finish(s, dead, reachedTarget) {
    return {
      dead,
      reachedTarget: !!reachedTarget,
      level: s.level,
      day: s.day,
      sanAvg: sanCount ? sanSum / sanCount : s.san,
      sanMin,
      sanCollapses,
      bloodMoons: s._bloodMoons || 0,
      prefixDrops: s._prefixDrops,
      rarityDrops: s._rarityDrops,
      actionsAfterDay20,
      scrapCappedRatio: totalPhases ? scrapCappedPhases / totalPhases : 0,
      firstScrapCapDay
    };
  }
}

function summarize(strategy, faction) {
  let deaths = 0, reached = 0, levelSum = 0, sanAvgSum = 0, sanMinSum = 0, sanCollapseSum = 0, bloodMoonSum = 0;
  const prefixCounts = {};
  const rarityCounts = {};
  let gatherAfter20 = 0, totalAfter20 = 0;
  let scrapCappedSum = 0, firstCapDaySum = 0, firstCapCount = 0;
  for (let i = 0; i < RUNS; i++) {
    const r = simulateOneRun(strategy, faction);
    if (r.dead) deaths++;
    if (r.reachedTarget) reached++;
    levelSum += r.level;
    sanAvgSum += r.sanAvg;
    sanMinSum += r.sanMin;
    sanCollapseSum += r.sanCollapses;
    bloodMoonSum += r.bloodMoons;
    r.prefixDrops.forEach(p => { prefixCounts[p] = (prefixCounts[p] || 0) + 1; });
    r.rarityDrops.forEach(rr => { rarityCounts[rr] = (rarityCounts[rr] || 0) + 1; });
    gatherAfter20 += r.actionsAfterDay20.gather;
    totalAfter20 += r.actionsAfterDay20.total;
    scrapCappedSum += r.scrapCappedRatio;
    if (r.firstScrapCapDay !== null) { firstCapDaySum += r.firstScrapCapDay; firstCapCount++; }
  }
  return {
    faction, strategy,
    deathRate: ((deaths / RUNS) * 100).toFixed(0) + "%",
    reachedTier3: ((reached / RUNS) * 100).toFixed(0) + "%",
    avgLevel: (levelSum / RUNS).toFixed(1),
    sanAvg: (sanAvgSum / RUNS).toFixed(1),
    sanMin: (sanMinSum / RUNS).toFixed(1),
    // 2026-09-28新增：每輪平均遇到幾次血月夜、平均精神崩潰幾次(SAN歸零)——崩潰次數越高代表這個流派/策略對SAN系統越吃緊
    bloodMoonsPerRun: (bloodMoonSum / RUNS).toFixed(1),
    sanCollapsesPerRun: (sanCollapseSum / RUNS).toFixed(2),
    gatherRatioAfterDay20: totalAfter20 ? ((gatherAfter20 / totalAfter20) * 100).toFixed(0) + "%" : "n/a",
    scrapCappedRatio: ((scrapCappedSum / RUNS) * 100).toFixed(0) + "%",
    firstScrapCapDay: firstCapCount ? (firstCapDaySum / firstCapCount).toFixed(1) : "n/a",
    rarityCounts,
    prefixCounts
  };
}

function summarizeCompare(label, strategy, opts) {
  let deaths = 0, levelSum = 0;
  for (let i = 0; i < RUNS; i++) {
    const r = simulateOneRun(strategy, null, opts);
    if (r.dead) deaths++;
    levelSum += r.level;
  }
  return { label, deathRate: ((deaths / RUNS) * 100).toFixed(0) + "%", avgLevel: (levelSum / RUNS).toFixed(1) };
}

console.log(`模擬 ${RUNS} 輪，每輪最多 ${MAX_STEPS} 步，終止條件：等級達${TARGET_LEVEL}(tier3)或步數上限\n`);

console.log("=== 5主流派 × 3策略 交叉測試 ===");
L.FACTION_IDS.forEach(faction => {
  ["cautious", "balanced", "aggressive"].forEach(strategy => {
    console.log(summarize(strategy, faction));
  });
});

console.log("\n=== 有/無同伴對照（balanced）===");
console.log(summarizeCompare("無同伴", "balanced", {}));
console.log(summarizeCompare("有同伴(雷恩警戒)", "balanced", { withCompanion: true }));

console.log("\n=== 單人 vs. wedding_ring雙效對照（balanced）===");
console.log(summarizeCompare("無wedding_ring", "balanced", {}));
console.log(summarizeCompare("wedding_ring雙效啟用", "balanced", { weddingRing: true }));
