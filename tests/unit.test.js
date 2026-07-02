// 單元測試：核心邏輯函式
// 執行方式：node tests/unit.test.js

const assert = require("assert");
const L = require("../js/logic.js");

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`PASS: ${name}`); }
  catch (e) { fail++; console.log(`FAIL: ${name} -> ${e.message}`); }
}

test("clamp 限制上下界", () => {
  assert.strictEqual(L.clamp(150, 0, 100), 100);
  assert.strictEqual(L.clamp(-5, 0, 100), 0);
  assert.strictEqual(L.clamp(50, 0, 100), 50);
});

test("applyEffect: hp變化會被限制在0~hpMax", () => {
  const s = L.defaultState();
  L.applyEffect(s, { hp: 9999 });
  assert.strictEqual(s.hp, s.hpMax);
  L.applyEffect(s, { hp: -9999 });
  assert.strictEqual(s.hp, 0);
});

test("applyEffect: resources變化會被限制在0~cap", () => {
  const s = L.defaultState();
  L.applyEffect(s, { resources: { food: 9999 } });
  assert.strictEqual(s.resources.food, s.resourceCaps.food);
  L.applyEffect(s, { resources: { food: -9999 } });
  assert.strictEqual(s.resources.food, 0);
});

test("applyPhaseDecay: 正常情況下每階段消耗1食物1飲水", () => {
  const s = L.defaultState();
  const food0 = s.resources.food, water0 = s.resources.water;
  const died = L.applyPhaseDecay(s);
  assert.strictEqual(s.resources.food, food0 - 1);
  assert.strictEqual(s.resources.water, water0 - 1);
  assert.strictEqual(died, false);
});

test("applyPhaseDecay: 食物或飲水歸零時額外扣HP", () => {
  const s = L.defaultState();
  s.resources.food = 1; // 扣完變0 -> 觸發額外HP扣減
  const hp0 = s.hp;
  L.applyPhaseDecay(s);
  assert.strictEqual(s.resources.food, 0);
  assert.strictEqual(s.hp, hp0 - 5);
});

test("applyPhaseDecay: HP歸零時回傳died=true", () => {
  const s = L.defaultState();
  s.hp = 3;
  s.resources.food = 0; s.resources.water = 0; // 必定觸發-5 hp
  const died = L.applyPhaseDecay(s);
  assert.strictEqual(died, true);
  assert.strictEqual(s.hp, 0);
});

test("advancePhase: day -> night -> 隔天day，天數+1", () => {
  const s = L.defaultState();
  assert.strictEqual(s.phase, "day");
  assert.strictEqual(s.day, 1);
  L.advancePhase(s);
  assert.strictEqual(s.phase, "night");
  assert.strictEqual(s.day, 1);
  L.advancePhase(s);
  assert.strictEqual(s.phase, "day");
  assert.strictEqual(s.day, 2);
});

test("battleDamage: 至少造成1點傷害（即使防禦力高於攻擊力）", () => {
  assert.strictEqual(L.battleDamage(3, 0), 3);
  assert.strictEqual(L.battleDamage(2, 5), 1);
});

test("pickWeighted: 權重為0的選項在rng=0時不會被選中（除非全部為0）", () => {
  const list = [{ id: "a", weight: 0 }, { id: "b", weight: 10 }];
  const picked = L.pickWeighted(list, () => 0);
  assert.strictEqual(picked.id, "b");
});

test("pickEvent: 第1天白天只會抽到 phase 含 'day' 的事件", () => {
  const s = L.defaultState(); // day:1, phase: "day"
  for (let i = 0; i < 50; i++) {
    const evt = L.pickEvent(s, Math.random);
    assert.ok(evt.phase.includes("day"), `事件 ${evt.id} 不應在白天出現`);
  }
});

test("pickEvent: 夜晚只會抽到 phase 含 'night' 的事件", () => {
  const s = L.defaultState();
  s.phase = "night";
  for (let i = 0; i < 50; i++) {
    const evt = L.pickEvent(s, Math.random);
    assert.ok(evt.phase.includes("night"), `事件 ${evt.id} 不應在夜晚出現`);
  }
});

test("pickEvent: condition不成立的事件不會被抽到（無夥伴時不會出現夥伴守夜事件）", () => {
  const s = L.defaultState();
  s.phase = "night";
  s.companion = false;
  for (let i = 0; i < 50; i++) {
    const evt = L.pickEvent(s, Math.random);
    assert.notStrictEqual(evt.id, "evt_companion_watch");
  }
});

test("pickEvent: condition成立時才有機會抽到專屬事件（有夥伴時可抽到夥伴守夜事件）", () => {
  const s = L.defaultState();
  s.phase = "night";
  s.companion = true;
  const ids = new Set();
  for (let i = 0; i < 200; i++) {
    ids.add(L.pickEvent(s, Math.random).id);
  }
  assert.ok(ids.has("evt_companion_watch"), "有夥伴時，跑200次應至少抽到一次夥伴守夜事件");
});

test("pickEvent: 等級不足時不會抽到持械感染者事件，等級足夠時可能抽到", () => {
  const sLow = L.defaultState();
  sLow.phase = "night";
  sLow.level = 1;
  for (let i = 0; i < 50; i++) {
    assert.notStrictEqual(L.pickEvent(sLow, Math.random).id, "evt_infected_encounter_armed");
  }

  const sHigh = L.defaultState();
  sHigh.phase = "night";
  sHigh.level = 3;
  const ids = new Set();
  for (let i = 0; i < 200; i++) {
    ids.add(L.pickEvent(sHigh, Math.random).id);
  }
  assert.ok(ids.has("evt_infected_encounter_armed"));
});

test("pickEvent: 食物水量低時才會抽到緊急補給事件", () => {
  const sFull = L.defaultState();
  for (let i = 0; i < 50; i++) {
    assert.notStrictEqual(L.pickEvent(sFull, Math.random).id, "evt_supply_drop");
  }

  const sLow = L.defaultState();
  sLow.resources.food = 1;
  sLow.resources.water = 1;
  const ids = new Set();
  for (let i = 0; i < 200; i++) {
    ids.add(L.pickEvent(sLow, Math.random).id);
  }
  assert.ok(ids.has("evt_supply_drop"));
});

test("raidChance: baseDefense越高，夜襲機率越低，但有下限0.02", () => {
  const s = L.defaultState();
  const c0 = L.raidChance(s);
  s.baseDefense = 10;
  const c1 = L.raidChance(s);
  assert.ok(c1 < c0);
  assert.ok(c1 >= 0.02);
});

test("REINFORCE_COST 為正數", () => {
  assert.ok(L.REINFORCE_COST > 0);
});

test("evaluateSandboxEnding: 四設備皆滿+多次擊敗Boss -> stronghold（26.1：取代day180判定）", () => {
  const s = L.defaultState();
  s.facilities = { command: 3, greenhouse: 3, workshop: 3, radar: 3 };
  s.flags.bossesDefeated = 4;
  assert.strictEqual(L.evaluateSandboxEnding(s), "stronghold");
});

test("evaluateSandboxEnding: 設備等級偏低但HP過半 -> survivor", () => {
  const s = L.defaultState();
  s.facilities = { command: 1, greenhouse: 0, workshop: 0, radar: 0 };
  s.hp = s.hpMax;
  assert.strictEqual(L.evaluateSandboxEnding(s), "survivor");
});

test("evaluateSandboxEnding: 設備等級偏低且HP過低 -> barely", () => {
  const s = L.defaultState();
  s.facilities = { command: 0, greenhouse: 0, workshop: 0, radar: 0 };
  s.hp = Math.floor(s.hpMax * 0.3);
  assert.strictEqual(L.evaluateSandboxEnding(s), "barely");
});

test("longTermGoalMet: 四設備皆Lv3且擊敗終域Boss才算達成（22.1，取代SANDBOX_GOAL_DAY）", () => {
  const s = L.defaultState();
  assert.strictEqual(L.longTermGoalMet(s), false);
  s.facilities = { command: 3, greenhouse: 3, workshop: 3, radar: 3 };
  assert.strictEqual(L.longTermGoalMet(s), false); // 尚未擊敗終域Boss
  s.flags.finalBossDefeated = true;
  assert.strictEqual(L.longTermGoalMet(s), true);
});

test("resolveLocation: rng < encounterChance 時回傳battle", () => {
  const loc = L.LOCATIONS[0];
  const r = L.resolveLocation(loc, () => 0);
  assert.strictEqual(r.type, "battle");
  assert.ok(loc.encounterEnemyIds.includes(r.enemyId));
});

test("getEffectiveStats: 裝備武器後攻擊力提升", () => {
  const s = L.defaultState();
  s.equipment.weapon = null;
  const before = L.getEffectiveStats(s).atk;
  s.equipment.weapon = "knife_01"; // atk+2
  const after = L.getEffectiveStats(s).atk;
  assert.strictEqual(after, before + L.ITEMS.knife_01.stats.atk);
});

test("consumeAmmoForAttack/getEffectiveStats: 27.1遠程武器消耗彈藥，耗盡後攻擊力加成減半", () => {
  const s = L.defaultState();
  s.equipment.weapon = "pistol_01";
  s.resources.ammo = 1;
  const fullAtk = L.getEffectiveStats(s).atk;
  L.consumeAmmoForAttack(s);
  assert.strictEqual(s.resources.ammo, 0);
  const halvedAtk = L.getEffectiveStats(s).atk;
  assert.strictEqual(halvedAtk, fullAtk - Math.ceil(L.ITEMS.pistol_01.stats.atk / 2));
  L.consumeAmmoForAttack(s);
  assert.strictEqual(s.resources.ammo, 0);

  const s2 = L.defaultState();
  s2.equipment.weapon = "knife_01";
  const before = s2.resources.ammo;
  L.consumeAmmoForAttack(s2);
  assert.strictEqual(s2.resources.ammo, before);
});

test("27.4 statusEffects: tickStatusEffects遞減並移除到期效果", () => {
  const s = L.defaultState();
  L.addStatusEffect(s, "shield", 5, 1, "test");
  assert.strictEqual(s.statusEffects.length, 1);
  L.tickStatusEffects(s);
  assert.strictEqual(s.statusEffects.length, 0);
});

test("27.4 absorbShield: shield優先吸收傷害，扣盡才扣HP", () => {
  const s = L.defaultState();
  L.addStatusEffect(s, "shield", 5, 99, "test");
  const remaining = L.absorbShield(s, 8);
  assert.strictEqual(remaining, 3);
  assert.strictEqual(s.statusEffects.length, 0);
});

test("27.4 maybeGenerateShield: cyber_suit裝備時20%機率轉化受傷為shield", () => {
  const s = L.defaultState();
  s.equipment.armor = "cyber_suit";
  L.maybeGenerateShield(s, 10, () => 0.1); // < 0.2 觸發
  assert.strictEqual(s.statusEffects.length, 1);
  assert.strictEqual(s.statusEffects[0].type, "shield");
  assert.strictEqual(s.statusEffects[0].value, 5);

  const s2 = L.defaultState();
  s2.equipment.armor = "cyber_suit";
  L.maybeGenerateShield(s2, 10, () => 0.9); // 不觸發
  assert.strictEqual(s2.statusEffects.length, 0);
});

test("27.4 maybeStunEnemy: ocean_mace裝備時25%機率使敵暈眩", () => {
  const s = L.defaultState();
  s.equipment.weapon = "ocean_mace";
  assert.strictEqual(L.maybeStunEnemy(s, () => 0.1), true);
  assert.strictEqual(L.maybeStunEnemy(s, () => 0.9), false);

  const s2 = L.defaultState();
  s2.equipment.weapon = "knife_01";
  assert.strictEqual(L.maybeStunEnemy(s2, () => 0.1), false);
});

test("27.4 applyDefShred/getShreddedDef: ocean_pistol/corrosive使敵防持續削減，上限-5", () => {
  const s = L.defaultState();
  s.equipment.weapon = "ocean_pistol";
  const enemy = { def: 10 };
  for (let i = 0; i < 8; i++) L.applyDefShred(enemy, s);
  assert.strictEqual(enemy._defShred, 5);
  assert.strictEqual(L.getShreddedDef(enemy), 5);

  const s2 = L.defaultState();
  s2.equipment.weapon = "knife_01";
  const enemy2 = { def: 10 };
  L.applyDefShred(enemy2, s2);
  assert.strictEqual(L.getShreddedDef(enemy2), 10);
});

test("gainExp: 經驗值不足時不升級", () => {
  const s = L.defaultState();
  const levelUps = L.gainExp(s, 1);
  assert.strictEqual(levelUps, 0);
  assert.strictEqual(s.level, 1);
  assert.strictEqual(s.exp, 1);
});

test("gainExp: 經驗值足夠時升級，HP上限與攻擊力提升、HP回滿", () => {
  const s = L.defaultState();
  const hpMaxBefore = s.hpMax, atkBefore = s.stats.atk, expToNextBefore = s.expToNext;
  s.hp = 1; // 升級前血量很低
  const levelUps = L.gainExp(s, expToNextBefore);
  assert.strictEqual(levelUps, 1);
  assert.strictEqual(s.level, 2);
  const awakeningHpBonus = (s.awakening && s.awakening.hpMaxBonus) || 0;
  assert.strictEqual(s.hpMax, hpMaxBefore + L.LEVEL_UP_HP_BONUS + awakeningHpBonus);
  assert.strictEqual(s.stats.atk, atkBefore + L.LEVEL_UP_ATK_BONUS);
  assert.strictEqual(s.hp, s.hpMax);
});

test("gainExp: 一次獲得大量經驗可連續升級多級", () => {
  const s = L.defaultState();
  const levelUps = L.gainExp(s, 1000);
  assert.ok(levelUps >= 2);
  assert.strictEqual(s.level, 1 + levelUps);
});

test("pickLocations: 回傳指定數量且不重複", () => {
  const picked = L.pickLocations(L.LOCATIONS, 3, Math.random);
  assert.strictEqual(picked.length, 3);
  const ids = picked.map(l => l.id);
  assert.strictEqual(new Set(ids).size, 3);
});

test("resolveLocation: rng >= encounterChance 時回傳loot", () => {
  const loc = L.LOCATIONS[0];
  const r = L.resolveLocation(loc, () => 0.999);
  assert.strictEqual(r.type, "loot");
  assert.ok(loc.lootTable.some(l => l.itemId === r.itemId));
});

test("getMilestoneEvent: 第10天且尚未顯示時回傳milestone_day10", () => {
  const s = L.defaultState();
  s.day = 10;
  const m = L.getMilestoneEvent(s);
  assert.strictEqual(m && m.id, "milestone_day10");
});

test("getMilestoneEvent: 已記錄於milestonesShown後不再回傳", () => {
  const s = L.defaultState();
  s.day = 10;
  s.milestonesShown.push("milestone_day10");
  assert.strictEqual(L.getMilestoneEvent(s), null);
});

test("getMilestoneEvent: 非里程碑天數回傳null", () => {
  const s = L.defaultState();
  s.day = 3; // 2026-07-02：day5新增了里程碑事件(milestone_day5)，改用確定不是里程碑的day3
  assert.strictEqual(L.getMilestoneEvent(s), null);
});

test("staminaMaxForLevel: level1=6, level5=10, level10=15", () => {
  assert.strictEqual(L.staminaMaxForLevel(1), 6);
  assert.strictEqual(L.staminaMaxForLevel(5), 10);
  assert.strictEqual(L.staminaMaxForLevel(10), 15);
});

test("defaultState: 初始stamina/staminaMax為6", () => {
  const s = L.defaultState();
  assert.strictEqual(s.stamina, 6);
  assert.strictEqual(s.staminaMax, 6);
});

test("actionStaminaCost: 採集1/近距探索2/遠距探索3(level1)/強化據點1", () => {
  const s = L.defaultState();
  assert.strictEqual(L.actionStaminaCost(s, "gather"), 1);
  assert.strictEqual(L.actionStaminaCost(s, "explore_near"), 2);
  assert.strictEqual(L.actionStaminaCost(s, "explore_far"), 3);
  assert.strictEqual(L.actionStaminaCost(s, "reinforce"), 1);
  assert.strictEqual(L.actionStaminaCost(s, "convert"), 1);
});

test("actionStaminaCost: 遠距探索每3級降1點，最低1", () => {
  const s = L.defaultState();
  s.level = 4; // floor(3/3)=1 -> 3-1=2
  assert.strictEqual(L.actionStaminaCost(s, "explore_far"), 2);
  s.level = 7; // floor(6/3)=2 -> 3-2=1
  assert.strictEqual(L.actionStaminaCost(s, "explore_far"), 1);
  s.level = 100; // 不會低於1
  assert.strictEqual(L.actionStaminaCost(s, "explore_far"), 1);
});

test("spendStamina: 體力足夠時正常扣除，不觸發過勞", () => {
  const s = L.defaultState();
  const result = L.spendStamina(s, "explore_near");
  assert.strictEqual(s.stamina, 4);
  assert.strictEqual(result.overdraw, false);
  assert.strictEqual(result.resourceMultiplier, 1);
});

test("spendStamina: 體力不足時觸發過勞 - HP-3、體力歸0、回傳減半倍率與遭遇加成", () => {
  const s = L.defaultState();
  s.stamina = 1;
  const hp0 = s.hp;
  const result = L.spendStamina(s, "explore_far"); // cost=3 > stamina=1
  assert.strictEqual(s.stamina, 0);
  assert.strictEqual(s.hp, hp0 - L.OVERDRAW_HP_PENALTY);
  assert.strictEqual(result.overdraw, true);
  assert.strictEqual(result.resourceMultiplier, 0.5);
  assert.strictEqual(result.encounterBonus, 0.15);
});

test("advancePhase: 重置stamina為staminaMax(依等級)", () => {
  const s = L.defaultState();
  s.stamina = 0;
  L.advancePhase(s);
  assert.strictEqual(s.stamina, s.staminaMax);
  assert.strictEqual(s.staminaMax, L.staminaMaxForLevel(s.level));
});

test("gainExp: 升級時staminaMax提升且當下stamina同步增加（24.1升級回饋）", () => {
  const s = L.defaultState();
  s.stamina = 5; // 滿體力時升級
  s.exp = s.expToNext - 1;
  // 固定awakening避免觸發triggerAwakening的隨機流派分配（某些流派會額外提升staminaMax，導致此測試flaky）
  s.awakening = { id: "test_fixed" };
  const staminaMaxBefore = L.staminaMaxForLevel(s.level);
  L.gainExp(s, 1); // 升級至level2
  assert.strictEqual(s.level, 2);
  assert.strictEqual(s.staminaMax, L.staminaMaxForLevel(2));
  assert.strictEqual(s.stamina, 5 + (L.staminaMaxForLevel(2) - staminaMaxBefore));
});

// ---------- 26.1 敵人分級（由等級驅動，取代原本以state.day計算）----------
test("enemyTier: tier = floor((level-1)/3)，上限為3（4個tier組）", () => {
  const s = L.defaultState();
  s.level = 1;
  assert.strictEqual(L.enemyTier(s), 0);
  s.level = 3;
  assert.strictEqual(L.enemyTier(s), 0);
  s.level = 4;
  assert.strictEqual(L.enemyTier(s), 1);
  s.level = 10;
  assert.strictEqual(L.enemyTier(s), 3);
  s.level = 100;
  assert.strictEqual(L.enemyTier(s), 3); // 超出tier3仍封頂於終域
});

test("getScaledEnemy: tier0時數值與名稱不變，tier1時hp/atk提升且名稱加前綴（26.1：tier由等級驅動）", () => {
  const s = L.defaultState();
  s.level = 1;
  const e0 = L.getScaledEnemy("enemy_walker_weak", s);
  assert.strictEqual(e0.hp, L.ENEMIES.enemy_walker_weak.hp);
  assert.strictEqual(e0.name, "蹣跚的感染者");

  s.level = 4; // tier1
  const scaling = L.ENEMIES.enemy_walker_weak.scaling;
  const e1 = L.getScaledEnemy("enemy_walker_weak", s);
  assert.strictEqual(e1.hp, L.ENEMIES.enemy_walker_weak.hp + scaling.hpPerTier);
  assert.strictEqual(e1.atk, L.ENEMIES.enemy_walker_weak.atk + scaling.atkPerTier);
  assert.strictEqual(e1.name, "變異的蹣跚的感染者");
});

test("getScaledEnemy: 指揮中心Lv2+夜襲時，敵人初始HP-20%", () => {
  const s = L.defaultState();
  s.facilities.command = 2;
  const e = L.getScaledEnemy("enemy_walker_weak", s, { isNightRaid: true });
  assert.strictEqual(e.hp, Math.round(L.ENEMIES.enemy_walker_weak.hp * 0.8));
});

// ---------- 24.3 覺醒 ----------
test("triggerAwakening: 隨機獲得AWAKENING_TRAITS其中一項，tough_body會提升hpMax", () => {
  const s = L.defaultState();
  const hpMax0 = s.hpMax;
  // 固定rng指向最後一項(recovery)
  const trait = L.triggerAwakening(s, () => 0.999);
  assert.strictEqual(s.awakening, trait);
  assert.ok(L.AWAKENING_TRAITS.includes(trait));

  const s2 = L.defaultState();
  const toughIdx = L.AWAKENING_TRAITS.findIndex(t => t.id === "tough_body");
  L.triggerAwakening(s2, () => toughIdx / L.AWAKENING_TRAITS.length);
  assert.strictEqual(s2.awakening.id, "tough_body");
  assert.strictEqual(s2.hpMax, hpMax0 + 15);
});

test("gainExp: level1->2時觸發覺醒並獲得1技能點", () => {
  const s = L.defaultState();
  s.exp = s.expToNext - 1;
  L.gainExp(s, 1);
  assert.strictEqual(s.level, 2);
  assert.ok(s.awakening !== null);
  assert.strictEqual(s.skillPoints, 1);
});

// ---------- 25.3 五大流派技能樹 ----------
test("spendSkillPoint: 未鎖定主流派或點數不足時回傳false，否則依序+1直到T4", () => {
  const s = L.defaultState();
  s.skillPoints = 10;
  assert.strictEqual(L.spendSkillPoint(s), false); // 未覺醒/未鎖定流派
  s.skills.faction = "cyber";
  for (let i = 1; i <= 4; i++) {
    assert.strictEqual(L.spendSkillPoint(s), true);
    assert.strictEqual(s.skills.tier, i);
  }
  assert.strictEqual(L.spendSkillPoint(s), false); // 已滿T4
  assert.strictEqual(s.skillPoints, 6);
});

test("getEffectiveStats: 鋼鐵活化T1+2防禦、T2+1攻擊、T4攻擊+30%", () => {
  const s = L.defaultState();
  s.skills.faction = "cyber";
  const base = L.getEffectiveStats(s);
  s.skills.tier = 1;
  assert.strictEqual(L.getEffectiveStats(s).def, base.def + 2);
  s.skills.tier = 2;
  const t2 = L.getEffectiveStats(s);
  assert.strictEqual(t2.atk, base.atk + 1);
  s.skills.tier = 4;
  const t4 = L.getEffectiveStats(s);
  assert.strictEqual(t4.atk, Math.round((base.atk + 1) * 1.3));
});

test("getCritChance/getBattleDamageReductionRatio: 蓋亞T3低SAN爆擊、心靈晶格T4減傷25%", () => {
  const s = L.defaultState();
  s.skills.faction = "gaia";
  s.skills.tier = 3;
  s.san = 30;
  assert.ok(L.getCritChance(s) >= 0.15);
  const s2 = L.defaultState();
  s2.skills.faction = "mind";
  s2.skills.tier = 4;
  assert.strictEqual(L.getBattleDamageReductionRatio(s2), 0.25);
});

test("gaiaCheatDeath: 蓋亞T4每局1次致命傷免死並回復50%HP", () => {
  const s = L.defaultState();
  s.skills.faction = "gaia";
  s.skills.tier = 4;
  s.hp = 0;
  assert.strictEqual(L.gaiaCheatDeath(s), true);
  assert.strictEqual(s.hp, Math.round(s.hpMax * 0.5));
  s.hp = 0;
  assert.strictEqual(L.gaiaCheatDeath(s), false); // 每局僅1次
});

// ---------- 27 同伴系統 ----------
test("applyPhaseDecay: 有同伴時food/water消耗各+1", () => {
  const s = L.defaultState();
  const f0 = s.resources.food, w0 = s.resources.water;
  s.companion = true;
  L.applyPhaseDecay(s);
  assert.strictEqual(s.resources.food, f0 - 2);
  assert.strictEqual(s.resources.water, w0 - 2);
});

test("raidChance: 同伴指派「警戒」時降低0.30", () => {
  const s = L.defaultState();
  const c0 = L.raidChance(s);
  s.companion = true;
  s.companionTask = "guard";
  assert.ok(L.raidChance(s) < c0);
});

test("restHealAmount: 同伴指派「照護」時+5、覺醒痊癒體質+5、洋流寄生T4額外+5%hpMax", () => {
  const s = L.defaultState();
  assert.strictEqual(L.restHealAmount(s), 0);
  s.companion = true;
  s.companionTask = "care";
  assert.strictEqual(L.restHealAmount(s), 5);
  s.awakening = L.AWAKENING_TRAITS.find(t => t.id === "recovery");
  assert.strictEqual(L.restHealAmount(s), 10);
  s.skills.faction = "ocean";
  s.skills.tier = 4;
  assert.strictEqual(L.restHealAmount(s), 10 + Math.round(s.hpMax * 0.05));
});

// ---------- 26.3 短期威脅預告 ----------
test("checkUpcomingThreat: 剛性排程7~10天後血月爆發；isThreatDue/clearUpcomingThreat運作正常", () => {
  const s = L.defaultState();
  L.checkUpcomingThreat(s, () => 0); // rng=0 -> 最短週期(BLOOD_MOON_CYCLE_MIN天)
  assert.ok(s.upcomingThreat);
  assert.strictEqual(s.upcomingThreat.day, s.day + L.BLOOD_MOON_CYCLE_MIN);
  assert.strictEqual(L.isThreatDue(s), false);

  s.day += L.BLOOD_MOON_CYCLE_MIN;
  assert.strictEqual(L.isThreatDue(s), true);
  L.clearUpcomingThreat(s);
  assert.strictEqual(s.upcomingThreat, null);
});

test("checkUpcomingThreat: rng=0.99時排程週期為BLOOD_MOON_CYCLE_MAX天", () => {
  const s = L.defaultState();
  L.checkUpcomingThreat(s, () => 0.99);
  assert.strictEqual(s.upcomingThreat.day, s.day + L.BLOOD_MOON_CYCLE_MAX);
});

test("resolveBloodMoonDefense: baseDefense越高，defenseRatio越高，上限0.7且baseDefense>=15時擋下整波雜兵", () => {
  const s = L.defaultState();
  s.baseDefense = 0;
  assert.strictEqual(L.resolveBloodMoonDefense(s).defenseRatio, 0);
  assert.strictEqual(L.resolveBloodMoonDefense(s).wavesBlocked, 0);

  s.baseDefense = 15;
  const mid = L.resolveBloodMoonDefense(s);
  assert.strictEqual(mid.defenseRatio, 0.5);
  assert.strictEqual(mid.wavesBlocked, 1);

  s.baseDefense = 100;
  assert.strictEqual(L.resolveBloodMoonDefense(s).defenseRatio, 0.7); // 上限70%
});

test("bloodMoonRewards: 給予embers與skillPoint獎勵", () => {
  const s = L.defaultState();
  const embersBefore = s.currency.embers;
  const spBefore = s.skillPoints || 0;
  const reward = L.bloodMoonRewards(s);
  assert.strictEqual(s.currency.embers, embersBefore + reward.embers);
});

test("bloodMoonRewards: 首次獲勝插旗flags.bloodmoon_breach_1並回傳unlockedLocation，第二次不再重複解鎖", () => {
  const s = L.defaultState();
  const first = L.bloodMoonRewards(s);
  assert.strictEqual(first.unlockedLocation, "loc_sunken_subway");
  assert.strictEqual(s.flags.bloodmoon_breach_1, true);

  const second = L.bloodMoonRewards(s);
  assert.strictEqual(second.unlockedLocation, null);
  assert.strictEqual(s.bloodMoonWins, 2);
});

test("LOCATIONS: loc_sunken_subway具備unlockFlag=bloodmoon_breach_1（V2.0提前解鎖條件）", () => {
  const loc = L.LOCATIONS.find(l => l.id === "loc_sunken_subway");
  assert.strictEqual(loc.unlockFlag, "bloodmoon_breach_1");
});

test("getTierZoneForBloodMoonWin: 依bloodMoonWins依序回傳Tier0~3，已插旗者不重複，超過4次回傳null", () => {
  const s = L.defaultState();
  assert.strictEqual(L.getTierZoneForBloodMoonWin(s), null); // bloodMoonWins=0

  s.bloodMoonWins = 1;
  let zone = L.getTierZoneForBloodMoonWin(s);
  assert.strictEqual(zone.tier, 0);
  assert.strictEqual(zone.flag, "tier0_liberated");

  s.flags[zone.flag] = true;
  assert.strictEqual(L.getTierZoneForBloodMoonWin(s), null); // 已插旗

  s.bloodMoonWins = 4;
  zone = L.getTierZoneForBloodMoonWin(s);
  assert.strictEqual(zone.tier, 3);
  assert.strictEqual(zone.flag, "tier3_liberated");

  s.bloodMoonWins = 5;
  assert.strictEqual(L.getTierZoneForBloodMoonWin(s), null);
});

test("depositToFridge: 可附帶note便條，withdrawFromFridge取走全部物資並回復SAN+30且清空便條", () => {
  const s = L.defaultState();
  s.resources.food = 5;
  s.resources.water = 5;
  s.san = 10;

  L.depositToFridge(s, 2, 3, "辛苦了，記得吃飯！");
  assert.strictEqual(s.sharedFridge.food, 2);
  assert.strictEqual(s.sharedFridge.water, 3);
  assert.strictEqual(s.sharedFridge.note, "辛苦了，記得吃飯！");

  const foodBefore = s.resources.food;
  const waterBefore = s.resources.water;
  const result = L.withdrawFromFridge(s);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.note, "辛苦了，記得吃飯！");
  assert.strictEqual(s.resources.food, foodBefore + 2);
  assert.strictEqual(s.resources.water, waterBefore + 3);
  assert.strictEqual(s.san, 40);
  assert.strictEqual(s.sharedFridge.food, 0);
  assert.strictEqual(s.sharedFridge.water, 0);
  assert.strictEqual(s.sharedFridge.note, null);
});

test("withdrawFromFridge: 冰箱空時回傳ok=false", () => {
  const s = L.defaultState();
  const result = L.withdrawFromFridge(s);
  assert.strictEqual(result.ok, false);
});

test("TIER_ZONES: 4個Tier區皆具備bossEnemyId(存在於ENEMIES)與equipment_pool獎勵(存在於ITEMS)", () => {
  assert.strictEqual(L.TIER_ZONES.length, 4);
  L.TIER_ZONES.forEach(zone => {
    assert.ok(L.ENEMIES[zone.bossEnemyId], `${zone.bossEnemyId}應存在於ENEMIES`);
    zone.reward.equipment_pool.forEach(itemId => {
      assert.ok(L.ITEMS[itemId], `${itemId}應存在於ITEMS`);
    });
    assert.ok(zone.psychicNote && zone.psychicNote.length > 0, `${zone.name}應有靈能化文案psychicNote(V2.0第8項)`);
  });
});

test("checkUpcomingThreat: 已有預告時不會重複排程", () => {
  const s = L.defaultState();
  s.upcomingThreat = { day: 99, scheduledOn: 1 };
  L.checkUpcomingThreat(s, () => 0);
  assert.strictEqual(s.upcomingThreat.day, 99);
});

// 25.3/25.4 商城/道具
test("applyEffect: embers/skillPoint/stamina/reinforceDiscount", () => {
  const s = L.defaultState();
  const before = s.currency.embers;
  L.applyEffect(s, { embers: 10 });
  assert.strictEqual(s.currency.embers, before + 10);
  L.applyEffect(s, { skillPoint: 1 });
  assert.strictEqual(s.skillPoints, 1);
  s.stamina = 1;
  L.applyEffect(s, { stamina: 2 });
  assert.strictEqual(s.stamina, 3);
  L.applyEffect(s, { stamina: 99 });
  assert.strictEqual(s.stamina, s.staminaMax); // 不超過上限
  L.applyEffect(s, { reinforceDiscount: 2 });
  assert.strictEqual(s.reinforceDiscount, 2);
});

test("applyEffect: statBoost atk/hpMax/staminaMax（含25.2上限）", () => {
  const s = L.defaultState();
  const baseAtk = s.stats.atk, baseHpMax = s.hpMax, baseMax = s.staminaMax;
  L.applyEffect(s, { statBoost: { atk: 1 } });
  assert.strictEqual(s.stats.atk, baseAtk + 1);
  L.applyEffect(s, { statBoost: { hpMax: 5 } });
  assert.strictEqual(s.hpMax, baseHpMax + 5);
  assert.strictEqual(s.hp, baseHpMax + 5); // 滿血同步提升
  L.applyEffect(s, { statBoost: { staminaMax: 1 } });
  assert.strictEqual(s.staminaMax, baseMax + 1);
  // 疊加超過cap時應被封頂在+3
  L.applyEffect(s, { statBoost: { staminaMax: 5 } });
  assert.strictEqual(s.staminaMax, L.staminaMaxForLevel(s.level) + L.STAMINA_BONUS_CAP);
});

test("reinforceCost: 強化藍圖一次性折扣", () => {
  const s = L.defaultState();
  const before = L.reinforceCost(s);
  L.applyEffect(s, { reinforceDiscount: 2 });
  assert.strictEqual(L.reinforceCost(s), Math.max(3, before - 2));
  L.consumeReinforceDiscount(s);
  assert.strictEqual(L.reinforceCost(s), before);
});

test("useItem: 機能飲料恢復體力，不超過上限", () => {
  const s = L.defaultState();
  s.inventory.push({ itemId: "energy_drink", qty: 1 });
  s.stamina = 1;
  const res = L.useItem(s, "energy_drink");
  assert.strictEqual(res.ok, true);
  assert.strictEqual(s.stamina, 3);
  assert.strictEqual(s.inventory.find(i => i.itemId === "energy_drink"), undefined);
});

test("useItem: 素質強化劑useLimitPerGame=3", () => {
  const s = L.defaultState();
  const baseAtk = s.stats.atk;
  for (let i = 0; i < 4; i++) s.inventory.push({ itemId: "serum_atk", qty: 1 });
  let usedOk = 0, usedFail = 0;
  for (let i = 0; i < 4; i++) {
    const r = L.useItem(s, "serum_atk");
    if (r.ok) usedOk++; else usedFail++;
  }
  assert.strictEqual(usedOk, 3);
  assert.strictEqual(usedFail, 1);
  assert.strictEqual(s.stats.atk, baseAtk + 3);
});

test("useItem: 覺醒結晶給予技能點", () => {
  const s = L.defaultState();
  s.inventory.push({ itemId: "awaken_crystal", qty: 1 });
  L.useItem(s, "awaken_crystal");
  assert.strictEqual(s.skillPoints, 1);
});

test("useItem: 不擁有的道具回傳not_owned", () => {
  const s = L.defaultState();
  const res = L.useItem(s, "energy_drink");
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, "not_owned");
});

// ---------- 28.1 同伴系統 ----------
test("recruitCompanion: locked->standby，不影響已執行任務的同伴", () => {
  const s = L.defaultState();
  L.recruitCompanion(s, "雷恩");
  assert.strictEqual(s.companions["雷恩"], "standby");
  s.companions["艾莉"] = "gather";
  L.recruitCompanion(s, "艾莉");
  assert.strictEqual(s.companions["艾莉"], "gather");
});

test("refreshCompanionUnlocks: 指揮核心Lv3時自動解鎖阿卡", () => {
  const s = L.defaultState();
  L.refreshCompanionUnlocks(s);
  assert.strictEqual(s.companions["阿卡"], "locked");
  s.facilities.command = 3;
  L.refreshCompanionUnlocks(s);
  assert.strictEqual(s.companions["阿卡"], "standby");
});

test("dispatchCompanion: locked同伴無法指派；任務需符合該同伴可執行清單", () => {
  const s = L.defaultState();
  assert.strictEqual(L.dispatchCompanion(s, "艾莉", "gather").ok, false);
  L.recruitCompanion(s, "艾莉");
  assert.strictEqual(L.dispatchCompanion(s, "艾莉", "guard").ok, false);
  assert.strictEqual(L.dispatchCompanion(s, "艾莉", "care").ok, true);
  assert.strictEqual(s.companions["艾莉"], "care");
});

test("companionAssigned: 偵測新版companions map與舊版companion+companionTask", () => {
  const s = L.defaultState();
  assert.strictEqual(L.companionAssigned(s, "guard"), false);
  L.recruitCompanion(s, "雷恩");
  L.dispatchCompanion(s, "雷恩", "guard");
  assert.strictEqual(L.companionAssigned(s, "guard"), true);

  const legacy = L.defaultState();
  legacy.companion = true;
  legacy.companionTask = "guard";
  assert.strictEqual(L.companionAssigned(legacy, "guard"), true);
});

test("raidChance: 雷恩警戒/阿卡爆破會降低夜襲機率（受最低值0.02下限）", () => {
  const s = L.defaultState();
  s.baseDefense = 0; // 確保未強化時base夜襲機率較高，差異看得出來
  const base = L.raidChance(s);
  L.recruitCompanion(s, "雷恩");
  L.dispatchCompanion(s, "雷恩", "guard");
  assert.ok(L.raidChance(s) < base);
  assert.ok(L.raidChance(s) >= 0.02);
});

test("advancePhase: 艾莉指派採集時，每階段自動增加資源", () => {
  const s = L.defaultState();
  L.recruitCompanion(s, "艾莉");
  L.dispatchCompanion(s, "艾莉", "gather");
  const before = { ...s.resources };
  L.advancePhase(s, () => 0.99); // 避免威脅預告干擾
  assert.ok(s.resources.food > before.food);
  assert.ok(s.resources.water > before.water);
});

test("restHealAmount: 艾莉指派照護時+5", () => {
  const s = L.defaultState();
  L.recruitCompanion(s, "艾莉");
  L.dispatchCompanion(s, "艾莉", "care");
  assert.strictEqual(L.restHealAmount(s), 5);
});

test("reinforceFacility: 成功升級、達Lv3後不可再升級", () => {
  const s = L.defaultState();
  s.resources.scrap = 999;
  L.reinforceFacility(s, "workshop");
  assert.strictEqual(s.facilities.workshop, 1);
  L.reinforceFacility(s, "workshop");
  L.reinforceFacility(s, "workshop");
  assert.strictEqual(s.facilities.workshop, 3);
  L.reinforceFacility(s, "workshop");
  assert.strictEqual(s.facilities.workshop, 3);
});

test("reinforceFacility: 指揮中心升至Lv3時自動解鎖阿卡", () => {
  const s = L.defaultState();
  s.resources.scrap = 999;
  assert.strictEqual(s.companions["阿卡"], "locked");
  L.reinforceFacility(s, "command");
  L.reinforceFacility(s, "command");
  L.reinforceFacility(s, "command");
  assert.strictEqual(s.facilities.command, 3);
  assert.notStrictEqual(s.companions["阿卡"], "locked");
});

test("syncBaseDefense: baseDefense = 指揮中心*2 + bonusDefense", () => {
  const s = L.defaultState();
  s.resources.scrap = 999;
  s.bonusDefense = 1;
  L.reinforceFacility(s, "command");
  L.reinforceFacility(s, "command");
  assert.strictEqual(s.facilities.command, 2);
  assert.strictEqual(s.baseDefense, 2 * 2 + 1);
});

test("restSanRegen: 溫室Lv3時回復量+50%", () => {
  const s = L.defaultState();
  const base = L.restSanRegen(s);
  s.facilities.greenhouse = 3;
  assert.ok(L.restSanRegen(s) > base);
});

test("advancePhase: 溫室Lv1/Lv2提供每階段被動食物/飲水產出", () => {
  const s = L.defaultState();
  s.facilities.greenhouse = 2;
  const before = { ...s.resources };
  L.advancePhase(s, () => 0.99);
  assert.ok(s.resources.food > before.food);
  assert.ok(s.resources.water > before.water);
});

test("decayEquippedDurability/getDurability: 戰鬥後已裝備武器耐久-5，耐久0時攻擊力加成減半", () => {
  const s = L.defaultState();
  s.equipment.weapon = "pistol_01"; // atk8
  assert.strictEqual(L.getDurability(s, "pistol_01"), L.DURABILITY_MAX);
  for (let i = 0; i < 20; i++) L.decayEquippedDurability(s);
  assert.strictEqual(L.getDurability(s, "pistol_01"), 0);
  const atkAtZero = L.getEffectiveStats(s).atk;
  s.durability.pistol_01 = L.DURABILITY_MAX;
  const atkAtFull = L.getEffectiveStats(s).atk;
  assert.ok(atkAtZero < atkAtFull);
});

test("repairEquipment: 花費💎將耐久回滿；不足💎或已滿時失敗；工坊Lv1+折扣20%", () => {
  const s = L.defaultState();
  s.equipment.weapon = "pistol_01";
  s.durability.pistol_01 = 50;
  s.currency.embers = 5;
  assert.strictEqual(L.repairEquipment(s, "pistol_01").ok, false); // 💎不足
  s.currency.embers = 100;
  const fullCost = L.repairCost(s);
  const r = L.repairEquipment(s, "pistol_01");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(s.durability.pistol_01, L.DURABILITY_MAX);
  assert.strictEqual(s.currency.embers, 100 - fullCost);
  assert.strictEqual(L.repairEquipment(s, "pistol_01").ok, false); // 已滿
  s.facilities.workshop = 1;
  assert.ok(L.repairCost(s) < fullCost);
});

test("instantiateEquipment: common/uncommon不實例化；rare+實例化為weaponInstances並含前綴/耐久", () => {
  const s = L.defaultState();
  const commonRef = L.instantiateEquipment(s, "scrap_chainsaw", () => 0.5);
  assert.strictEqual(commonRef, "scrap_chainsaw");
  assert.strictEqual(s.weaponInstances.length, 0);

  const legendaryId = L.instantiateEquipment(s, "mind_greatsword", () => 0.5);
  assert.ok(L.isInstanceRef(legendaryId));
  const inst = L.getInstance(s, legendaryId);
  assert.strictEqual(inst.durability, L.DURABILITY_MAX);
  assert.ok(inst.prefix && inst.prefix.id === "perfect"); // legendary必含【完美的】
  assert.strictEqual(inst.stats.atk, 14 + 1); // 完美的+1atk

  const ref = L.getEquipRef(s, legendaryId);
  assert.strictEqual(ref.item.id, "mind_greatsword");
  assert.strictEqual(ref.stats.atk, inst.stats.atk);
});

test("getEffectiveStats/getCritMultiplier: 裝備weaponInstances後攻擊力提升且重力晶格巨劍暴擊倍率200%", () => {
  const s = L.defaultState();
  const before = L.getEffectiveStats(s).atk;
  const instId = L.instantiateEquipment(s, "mind_greatsword", () => 0.5);
  s.equipment.weapon = instId;
  const after = L.getEffectiveStats(s).atk;
  assert.ok(after > before);
  assert.strictEqual(L.getCritMultiplier(s), 2.0);
});

test("decayEquippedDurability/repairEquipment: weaponInstances的耐久度可正常損耗與重鍛", () => {
  const s = L.defaultState();
  const instId = L.instantiateEquipment(s, "gaia_whip", () => 0.99); // 強制無前綴
  s.equipment.weapon = instId;
  L.decayEquippedDurability(s);
  assert.strictEqual(L.getDurability(s, instId), L.DURABILITY_MAX - L.DURABILITY_LOSS_PER_BATTLE);
  s.currency.embers = 100;
  const r = L.repairEquipment(s, instId);
  assert.ok(r.ok);
  assert.strictEqual(L.getDurability(s, instId), L.DURABILITY_MAX);
});

test("getAccessoryEffect/getEffectiveSanMax/getEffectiveHpMax: 飾品effects加成正確套用", () => {
  const s = L.defaultState();
  assert.strictEqual(L.getEffectiveSanMax(s), s.sanMax);
  assert.strictEqual(L.getEffectiveHpMax(s), s.hpMax);
  s.equipment.accessory = "mind_eye"; // sanMax+20
  assert.strictEqual(L.getEffectiveSanMax(s), s.sanMax + 20);
  s.equipment.accessory = "ocean_leech"; // hpMax+10
  assert.strictEqual(L.getEffectiveHpMax(s), s.hpMax + 10);
});

test("getLifestealRatio/getDodgeChance: 27.1武器/防具effects疊加蓋亞/洋流流派加成", () => {
  const s = L.defaultState();
  s.equipment.weapon = "gaia_whip"; // +15%吸血
  assert.ok(Math.abs(L.getLifestealRatio(s) - 0.15) < 1e-9);
  s.equipment.armor = "ocean_jacket"; // +5%閃避
  assert.ok(Math.abs(L.getDodgeChance(s) - 0.05) < 1e-9);
});

test("29.1/29.3a dailyMoodCheckin: 每日首次簽到san+3，重複簽到不再加成", () => {
  const s = L.defaultState();
  s.san = 50;
  const r1 = L.dailyMoodCheckin(s, "😊");
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(s.san, 53);
  assert.strictEqual(s.dailyMood, "😊");
  const r2 = L.dailyMoodCheckin(s, "😢");
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(s.san, 53);
});

test("29.2 depositToFridge: 存入冰箱會從resources扣除並累加sharedFridge", () => {
  const s = L.defaultState();
  s.resources.food = 5;
  s.resources.water = 3;
  const r = L.depositToFridge(s, 2, 5);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.food, 2);
  assert.strictEqual(r.water, 3); // 受限於現有water=3
  assert.strictEqual(s.resources.food, 3);
  assert.strictEqual(s.resources.water, 0);
  assert.strictEqual(s.sharedFridge.food, 2);
  assert.strictEqual(s.sharedFridge.water, 3);
});

test("29.2/29.3 generateSyncCode/applySyncCode: 雙人QR互掃後白板/冰箱/wedding_ring暴擊雙效正確套用", () => {
  const a = L.defaultState();
  a.playerName = "小明";
  a.whiteboardMessage = "[PlayerName]你好";
  a.resources.food = 4;
  a.sharedFridge.food = 2;
  a.equipment.accessory = "wedding_ring";
  const codeA = L.generateSyncCode(a);

  const b = L.defaultState();
  b.playerName = "小華";
  b.equipment.accessory = "wedding_ring";
  const r = L.applySyncCode(b, codeA);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(b.spouseState.hasLinked, true);
  assert.strictEqual(b.spouseState.spouseName, "小明");
  assert.strictEqual(b.whiteboardMessage, "小明你好");
  assert.strictEqual(r.extractedFood, 2); // 從對方sharedFridge提取
  assert.strictEqual(b.spouseState.weddingRingActive, true);
  assert.ok(Math.abs(L.getCritChance(b) - L.getCritChance(L.defaultState()) - 0.15) < 1e-9);
});

test("v180 applySyncCode: 同一張同步碼重複套用會被拒絕，不能重複領取冰箱物資(36.5防重複掃描)", () => {
  const a = L.defaultState();
  a.sharedFridge.food = 2;
  const codeA = L.generateSyncCode(a);
  const b = L.defaultState();
  const r1 = L.applySyncCode(b, codeA);
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r1.extractedFood, 2);
  const foodAfterFirst = b.resources.food;
  const r2 = L.applySyncCode(b, codeA);
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.reason, "duplicate_code");
  assert.strictEqual(b.resources.food, foodAfterFirst); // 第二次套用沒有再加一次
});

test("v180 applySyncCode: 提取對方冰箱物資會被resourceCaps封頂，不會像舊版一樣無上限累加(36.5不對稱天數同步)", () => {
  const a = L.defaultState();
  a.sharedFridge.food = 999; // 模擬對方囤了大量物資(不對稱天數情境)
  const codeA = L.generateSyncCode(a);
  const b = L.defaultState();
  const cap = L.getResourceCap(b, "food");
  L.applySyncCode(b, codeA);
  assert.ok(b.resources.food <= cap);
});

test("v182 getSkillBonusRatio：【共鳴的】前綴只放大流派加成部分，不影響裝備本身固定加成/wedding_ring等非流派來源", () => {
  const s = L.defaultState();
  // 手動建立一個帶【共鳴的】前綴的飾品實例，避開instantiateEquipment的隨機前綴抽選
  s.weaponInstances = [{ id: "inst_test_resonant", baseItemId: "merchant_token", name: "【共鳴的】黑市VIP徽章", rarity: "epic", durability: 100, stats: {}, prefix: { id: "resonant", effect: { skillBonusRatio: 0.1 } } }];
  s.equipment.accessory = "inst_test_resonant";
  assert.ok(Math.abs(L.getSkillBonusRatio(s) - 0.1) < 1e-9);

  // 暴擊率：aero T1流派加成0.05，套用+10%後應為0.055
  s.skills.faction = "aero";
  s.skills.tier = 1;
  const sNoAcc = { ...s, equipment: { ...s.equipment, accessory: null } };
  const baseAeroCrit = L.getCritChance(sNoAcc);
  const boostedCrit = L.getCritChance(s);
  assert.ok(baseAeroCrit > 0);
  assert.ok(Math.abs(boostedCrit - baseAeroCrit * 1.1) < 1e-9);
});

test("v182 gaia_armor/aero_crossbow：原本「未接入」的兩項裝備效果已接上(文案已更新，不再是純裝飾)", () => {
  const armorItem = require("../js/data.js").ITEMS.gaia_armor;
  const weaponItem = require("../js/data.js").ITEMS.aero_crossbow;
  assert.ok(!armorItem.desc.includes("未接入"));
  assert.ok(!weaponItem.desc.includes("未接入"));
});

test("placeFurniture/getFurnitureDefBonus: 陳列槓塔後baseDefense+25，v112每槽位開放第二格故第二件牆面家具改放wall2並疊加", () => {
  const s = L.defaultState();
  s.inventory.push({ itemId: "furn_turret", qty: 1 }, { itemId: "furn_flag", qty: 1 }, { itemId: "furn_mirror", qty: 1 });
  let r = L.placeFurniture(s, "furn_turret");
  assert.ok(r.ok);
  assert.strictEqual(s.baseSlots.wall, "furn_turret");
  assert.strictEqual(L.getFurnitureDefBonus(s), 25);
  assert.strictEqual(s.baseDefense, 25);
  r = L.placeFurniture(s, "furn_flag");
  assert.ok(r.ok);
  assert.strictEqual(r.slot, "wall2");
  assert.strictEqual(s.baseSlots.wall2, "furn_flag");
  assert.strictEqual(s.baseDefense, 30);
  // 兩格都滿後，第三件牆面家具改為覆蓋wall(第一格)
  r = L.placeFurniture(s, "furn_mirror");
  assert.ok(r.ok);
  assert.strictEqual(r.slot, "wall");
  assert.strictEqual(r.replaced, "furn_turret");
  assert.strictEqual(s.baseSlots.wall, "furn_mirror");
  const back = s.inventory.find(i => i.itemId === "furn_turret");
  assert.strictEqual(back.qty, 1);
});

test("raidChance: 重力晶簇掛鏡陳列時夜襲機率-0.05", () => {
  const s = L.defaultState();
  const before = L.raidChance(s);
  s.baseSlots.wall = "furn_mirror";
  assert.ok(L.raidChance(s) <= before - 0.05 + 1e-9);
});

test("restSanRegen: 發光霓虹水母燈陳列時SAN回復+15", () => {
  const s = L.defaultState();
  const before = L.restSanRegen(s);
  s.placedFurniture.push({ itemId: "furn_jelly_lamp", gx: 0, gy: 0 });
  assert.strictEqual(L.restSanRegen(s), before + 15);
});

test("loungeInteract: 沙發互動回滿SAN並暫時+10 hpMax", () => {
  const s = L.defaultState();
  s.san = 10;
  const hpMaxBefore = s.hpMax;
  assert.strictEqual(L.loungeInteract(s, null).ok, false);
  s.placedFurniture.push({ itemId: "furn_sofa", gx: 0, gy: 0 });
  const r = L.loungeInteract(s, "雷恩");
  assert.ok(r.ok);
  assert.strictEqual(s.san, s.sanMax);
  assert.strictEqual(s.hpMax, hpMaxBefore + 10);
});

test("rollGacha: 回傳的itemId必為武器/護甲/飾品/家具", () => {
  const id = L.rollGacha(() => 0.999);
  const item = L.ITEMS[id];
  assert.ok(["weapon", "armor", "accessory", "furniture"].includes(item.type));
});

// v166：free-form佈置——placeFurniture對table/floor/rug類不再受容量上限，自動找空格放入placedFurniture
test("placeFurniture: table/floor/rug類free-form放置，無容量上限，依itemId可同時擁有多件不同家具", () => {
  const s = L.defaultState(); // 已內建1件furn_sleeping_bag於placedFurniture
  s.inventory.push({ itemId: "furn_bench", qty: 1 }, { itemId: "rug_plain", qty: 1 }, { itemId: "furn_sofa", qty: 1 });
  const r1 = L.placeFurniture(s, "furn_bench");
  assert.ok(r1.ok);
  assert.strictEqual(r1.replaced, null);
  const r2 = L.placeFurniture(s, "rug_plain");
  assert.ok(r2.ok);
  const r3 = L.placeFurniture(s, "furn_sofa");
  assert.ok(r3.ok);
  // 4件家具(含預設睡袋)同時存在，彼此不覆蓋、座標不重疊
  assert.strictEqual(s.placedFurniture.length, 4);
  const ids = s.placedFurniture.map(f => f.itemId);
  assert.ok(ids.includes("furn_sleeping_bag") && ids.includes("furn_bench") && ids.includes("rug_plain") && ids.includes("furn_sofa"));
  const coordKeys = s.placedFurniture.map(f => f.gx + "," + f.gy);
  assert.strictEqual(new Set(coordKeys).size, coordKeys.length); // 座標皆不重疊
  assert.ok(L.hasFurniturePlaced(s, "furn_sofa"));
  assert.strictEqual(s.baseDefense, L.getFurnitureDefBonus(s)); // floor類家具也會觸發syncBaseDefense
});

// v166：家具彩蛋改用placedFurniture陣列索引——空索引不給、每日每件限一次、晶燼確實增加
test("furnitureEasterEggInteract: 空索引不給獎勵；同一天同一件只能翻找一次；晶燼增加3~8", () => {
  const s = L.defaultState();
  s.placedFurniture = [];
  const emptyResult = L.furnitureEasterEggInteract(s, 0);
  assert.strictEqual(emptyResult.ok, false);

  s.placedFurniture.push({ itemId: "furn_bench", gx: 1, gy: 1 });
  const before = s.currency.embers;
  const first = L.furnitureEasterEggInteract(s, 0, () => 0);
  assert.strictEqual(first.ok, true);
  assert.strictEqual(s.currency.embers, before + 3);

  const second = L.furnitureEasterEggInteract(s, 0, () => 0);
  assert.strictEqual(second.ok, false);
  assert.strictEqual(second.reason, "already_used");
  assert.strictEqual(s.currency.embers, before + 3); // 第二次未再加成

  // 不同家具互不影響
  s.placedFurniture.push({ itemId: "rug_plain", gx: 2, gy: 2 });
  const other = L.furnitureEasterEggInteract(s, 1, () => 0.999);
  assert.strictEqual(other.ok, true);
  assert.strictEqual(s.currency.embers, before + 3 + 8);
});

// v168：free-form改版後複查發現，main_02_settle_in/side_collect_furnish_full/ach_full_house三個
// 任務/成就條件原本寫`Object.values(state.baseSlots)...`，改版後baseSlots只剩wall/wall2，這三個條件
// 會永遠算不到table/floor/rug類家具。本測試鎖定data.js的condition直接讀placedFurniture後算對數量
test("任務/成就的家具數量門檻條件：擺放table/floor/rug類家具也要算進去(free-form改版後的回歸測試)", () => {
  const s = L.defaultState(); // 已內建1件furn_sleeping_bag於placedFurniture
  const settleIn = L.QUESTS.main_02_settle_in;
  const furnishFull = L.QUESTS.side_collect_furnish_full;
  const fullHouse = L.ACHIEVEMENTS.ach_full_house;

  assert.strictEqual(settleIn.condition(s), true); // 預設的睡袋就算一件家具，門檻"擺上一件"已達成
  assert.strictEqual(furnishFull.condition(s), false); // 只有1件，未達4件門檻
  assert.strictEqual(fullHouse.condition(s), false);

  s.placedFurniture.push(
    { itemId: "furn_bench", gx: 0, gy: 0 },
    { itemId: "rug_plain", gx: 1, gy: 0 },
    { itemId: "furn_sofa", gx: 2, gy: 0 }
  ); // 連同睡袋共4件
  assert.strictEqual(furnishFull.condition(s), true);
  assert.strictEqual(fullHouse.condition(s), false); // 還差「解鎖全部3種地板樣式」

  s.unlockedFloors = ["wood", "tile", "rug"];
  assert.strictEqual(fullHouse.condition(s), true);

  // 牆面家具也要計入總數(wall+wall2)
  const s2 = L.defaultState();
  s2.placedFurniture = [];
  s2.baseSlots.wall = "furn_turret";
  s2.baseSlots.wall2 = "furn_flag";
  assert.strictEqual(settleIn.condition(s2), true);
  assert.strictEqual(furnishFull.condition(s2), false); // 僅2件，未達4件
});

// #21-1：CI剛性斷言 - 所有ITEMS effects與PREFIX_POOL effect中的比例型數值須介於0~1
test("CI斷言：ITEMS/PREFIX_POOL中的比例型加成(dodgeBonus/lifestealBonus/skillBonusRatio等)須介於0~1", () => {
  const ratioKeys = ["dodgeBonus", "lifestealBonus", "lifestealRatio", "critBonus", "skillBonusRatio", "ignoreDefRatio"];
  Object.values(L.ITEMS).forEach(item => {
    if (!item.effects) return;
    ratioKeys.forEach(key => {
      if (item.effects[key] !== undefined) {
        assert.ok(item.effects[key] >= 0 && item.effects[key] <= 1, `${item.id}.effects.${key} = ${item.effects[key]} 應介於0~1`);
      }
    });
  });
  L.PREFIX_POOL.forEach(prefix => {
    if (!prefix.effect) return;
    ratioKeys.forEach(key => {
      if (prefix.effect[key] !== undefined) {
        assert.ok(prefix.effect[key] >= 0 && prefix.effect[key] <= 1, `prefix ${prefix.id}.effect.${key} = ${prefix.effect[key]} 應介於0~1`);
      }
    });
  });
});

// #21-1：CI剛性斷言 - 所有事件text/resultText以\n\n切割，每段中文字數不得超過100
test("CI斷言：EVENTS的text/resultText每段(以\\n\\n切割)字數不得超過100", () => {
  L.EVENTS.forEach(evt => {
    [evt.text].concat((evt.options || []).map(o => o.resultText)).forEach(t => {
      if (!t) return;
      t.split("\n\n").forEach(seg => {
        assert.ok(seg.length <= 100, `事件${evt.id}的段落超過100字(${seg.length}字): ${seg.slice(0, 30)}...`);
      });
    });
  });
});

console.log(`\n結果：${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
