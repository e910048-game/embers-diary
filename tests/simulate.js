// 模擬試玩（25.1/26.1全面重寫）：不再以180天為單位，改為「直到達成tier3(等級10+，對應全部4個tier組)
// 或步數上限」為終止條件；5主流派×3種分配策略交叉測試；額外輸出SAN曲線、裝備前綴抽取分布、
// 有/無同伴對照、單人vs.wedding_ring雙效對照。
// 執行方式：node tests/simulate.js
//
// 註：26.2分級Boss尚未在ENEMIES資料中個別建模，本模擬以「達成tier3(level>=10)」近似代表
// 「全部4個tier組畢業」的終止條件。

const L = require("../js/logic.js");

const RUNS = 100;
const MAX_STEPS = 600; // 安全上限，避免單局跑不出tier3時無限迴圈
const TARGET_LEVEL = 10; // tier = floor((level-1)/3) >= 3

function gather(state) {
  L.applyEffect(state, { resources: L.gatherYield(Math.random, state) });
}

function rest(state) {
  if (state.phase === "night" && Math.random() < L.raidChance(state)) {
    runBattle(state, "enemy_walker_weak");
    return;
  }
  if (state.resources.food > 0 && state.resources.water > 0) {
    L.applyEffect(state, { hp: 15, resources: { food: -1, water: -1 } });
  }
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

// 戰鬥：依26.1 getScaledEnemy依玩家等級疊加敵人數值；勝利時依27.1掉落rare+裝備自動實例化
function runBattle(state, enemyId) {
  const scaled = L.getScaledEnemy(enemyId, state);
  let hpLeft = scaled.hp;
  while (hpLeft > 0 && state.hp > 0) {
    L.consumeAmmoForAttack(state);
    const myStats = L.getEffectiveStats(state);
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

  if (strategy === "cautious") {
    if (lowHp) return "rest";
    if (lowFood || lowWater) return "gather";
    if (state.resources.scrap >= L.reinforceCost(state) && facilitiesTotal(state) < 12) return "reinforce";
    return Math.random() < 0.3 ? "explore" : "gather";
  }
  if (strategy === "aggressive") {
    if (state.hp < state.hpMax * 0.2) return "rest";
    return "explore";
  }
  if (lowHp) return "rest";
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
  let sanSum = 0, sanCount = 0, sanMin = state.san;
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
    for (let ap = L.ACTION_POINTS_PER_PHASE; ap > 0; ap--) {
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

    // 主流派覺醒後，依模擬指定的faction覆寫隨機分配，並把所有技能點投入該流派
    if (state.awakening && state.skills && faction) {
      state.skills.faction = faction;
      while (L.spendSkillPoint(state)) { /* 投完所有技能點 */ }
    }

    // #21-2：廢料溢出曲線——記錄scrap觸頂(達resourceCaps.scrap)的階段數與首次觸頂的天數
    if (state.resources.scrap >= state.resourceCaps.scrap) {
      scrapCappedPhases++;
      if (firstScrapCapDay === null) firstScrapCapDay = state.day;
    }
    totalPhases++;

    const died = L.applyPhaseDecay(state);
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
      prefixDrops: s._prefixDrops,
      rarityDrops: s._rarityDrops,
      actionsAfterDay20,
      scrapCappedRatio: totalPhases ? scrapCappedPhases / totalPhases : 0,
      firstScrapCapDay
    };
  }
}

function summarize(strategy, faction) {
  let deaths = 0, reached = 0, levelSum = 0, sanAvgSum = 0, sanMinSum = 0;
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
