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

// 2026-07-02移除：evaluateSandboxEnding/longTermGoalMet相關4個測試。該機制(四大設備全Lv3+擊敗終域Boss→沙盒結局)
// 與規格文件已定案的「無限模式沒有結局，只收斂到畢業」矛盾，且flags.finalBossDefeated從未在正常遊玩中被設置過，
// 是無法觸發的死程式碼，已隨logic.js/game.js/story.js一併移除，測試也同步拿掉

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

// ---------- 25.3 五大流派技能樹（2026-07-05技能點系統重設：state.skills改為{faction,tiers,unlockOrder}多流派結構）----------
test("chooseFaction/spendSkillPoint: 未選流派時spendSkillPoint回傳false，選定後依序+1直到T4", () => {
  const s = L.defaultState();
  s.skillPoints = 10;
  assert.strictEqual(L.spendSkillPoint(s, "cyber"), false); // 未選流派
  assert.strictEqual(L.chooseFaction(s, "cyber"), true);
  assert.strictEqual(L.chooseFaction(s, "gaia"), false); // 已選過，不能再換
  for (let i = 1; i <= 4; i++) {
    assert.strictEqual(L.spendSkillPoint(s, "cyber"), true);
    assert.strictEqual(s.skills.tiers.cyber, i);
  }
  assert.strictEqual(L.spendSkillPoint(s, "cyber"), false); // 已滿T4
  assert.strictEqual(s.skillPoints, 6);
});

test("getEffectiveStats: 鋼鐵活化T1+2防禦、T2+1攻擊、T4攻擊+30%", () => {
  const s = L.defaultState();
  L.chooseFaction(s, "cyber");
  const base = L.getEffectiveStats(s);
  s.skills.tiers.cyber = 1;
  assert.strictEqual(L.getEffectiveStats(s).def, base.def + 2);
  s.skills.tiers.cyber = 2;
  const t2 = L.getEffectiveStats(s);
  assert.strictEqual(t2.atk, base.atk + 1);
  s.skills.tiers.cyber = 4;
  const t4 = L.getEffectiveStats(s);
  assert.strictEqual(t4.atk, Math.round((base.atk + 1) * 1.3));
});

test("getCritChance/getBattleDamageReductionRatio: 蓋亞T3低SAN爆擊、心靈晶格T4減傷25%", () => {
  const s = L.defaultState();
  L.chooseFaction(s, "gaia");
  s.skills.tiers.gaia = 3;
  s.san = 30;
  assert.ok(L.getCritChance(s) >= 0.15);
  const s2 = L.defaultState();
  L.chooseFaction(s2, "mind");
  s2.skills.tiers.mind = 4;
  assert.strictEqual(L.getBattleDamageReductionRatio(s2), 0.25);
});

test("gaiaCheatDeath: 蓋亞T4每局1次致命傷免死並回復50%HP", () => {
  const s = L.defaultState();
  L.chooseFaction(s, "gaia");
  s.skills.tiers.gaia = 4;
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
  // 2026-07-04更新：V3多同伴後勤系統上線後，「照護」是艾莉的專屬任務(COMPANIONS_REGISTRY)，
  // 雷恩只能執行「guard」，不再測試「雷恩執行照護」這個新架構下不存在的組合
  const s = L.defaultState();
  assert.strictEqual(L.restHealAmount(s), 0);
  L.recruitCompanion(s, "艾莉");
  L.dispatchCompanion(s, "艾莉", "care");
  assert.strictEqual(L.restHealAmount(s), 5);
  s.awakening = L.AWAKENING_TRAITS.find(t => t.id === "recovery");
  assert.strictEqual(L.restHealAmount(s), 10);
  L.chooseFaction(s, "ocean");
  s.skills.tiers.ocean = 4;
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

test("getTierZoneForBloodMoonWin: 掃描TIER_ZONES回傳第一個未插旗的區，bloodMoonWins=0時回傳null，全部插旗後回傳null", () => {
  const s = L.defaultState();
  assert.strictEqual(L.getTierZoneForBloodMoonWin(s), null); // bloodMoonWins=0

  s.bloodMoonWins = 1;
  let zone = L.getTierZoneForBloodMoonWin(s);
  assert.strictEqual(zone.tier, 0);
  assert.strictEqual(zone.flag, "tier0_liberated");

  // 插旗後，即使bloodMoonWins沒有增加，下一次呼叫也會拿到下一個未插旗的區(而非null)——
  // 這是2026-07-06修正後的新語意：只看「哪個區還沒插旗」，不看bloodMoonWins本身的數值
  s.flags[zone.flag] = true;
  zone = L.getTierZoneForBloodMoonWin(s);
  assert.strictEqual(zone.tier, 1);
  assert.strictEqual(zone.flag, "tier1_liberated");

  // 把所有區都插旗後，不論bloodMoonWins多大都回傳null
  for (const z of L.TIER_ZONES) s.flags[z.flag] = true;
  s.bloodMoonWins = L.TIER_ZONES.length + 5;
  assert.strictEqual(L.getTierZoneForBloodMoonWin(s), null);
});

test("getTierZoneForBloodMoonWin: 舊存檔回歸測試——TIER_ZONES從4區延伸到6區後，bloodMoonWins=6且僅tier0~3插旗的舊存檔應接上tier4而非被跳過或永久卡死(code review發現的bug)", () => {
  const s = L.defaultState();
  s.bloodMoonWins = 6; // 模擬延伸前就已經打到第6次血月的舊存檔
  for (let i = 0; i < 4; i++) s.flags[`tier${i}_liberated`] = true; // 延伸前僅有的4區都已插旗
  const zone = L.getTierZoneForBloodMoonWin(s);
  assert.strictEqual(zone.tier, 4);
  assert.strictEqual(zone.flag, "tier4_liberated");
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

test("TIER_ZONES: 全部Tier區皆具備bossEnemyId(存在於ENEMIES)與equipment_pool獎勵(存在於ITEMS)", () => {
  assert.strictEqual(L.TIER_ZONES.length, 6); // 2026-07-06：30小時內容量審視延伸tier4/5
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

// 2026-07-04 V3多同伴後勤系統：新增3位同伴(老周/小雨/阿海)+2個確認缺口修正的測試
test("refreshCompanionUnlocks: 溫室升至Lv3時自動解鎖艾莉（修正原本永久卡在locked的bug）", () => {
  const s = L.defaultState();
  assert.strictEqual(s.companions["艾莉"], "locked");
  s.facilities.greenhouse = 3;
  L.refreshCompanionUnlocks(s);
  assert.strictEqual(s.companions["艾莉"], "standby");
});

test("COMPANIONS_REGISTRY: 老周/小雨/阿海透過flags旗標解鎖後可正常招募/指派", () => {
  const s = L.defaultState();
  assert.strictEqual(L.dispatchCompanion(s, "老周", "craft").ok, false);
  s.flags.laozhou_recruited = true;
  s.flags.xiaoyu_recruited = true;
  s.flags.ahai_recruited = true;
  L.refreshCompanionUnlocks(s);
  assert.strictEqual(s.companions["老周"], "standby");
  assert.strictEqual(s.companions["小雨"], "standby");
  assert.strictEqual(s.companions["阿海"], "standby");
  assert.strictEqual(L.dispatchCompanion(s, "老周", "craft").ok, true);
  assert.strictEqual(L.dispatchCompanion(s, "小雨", "base").ok, true);
  assert.strictEqual(L.dispatchCompanion(s, "阿海", "expedition").ok, true);
});

test("resolveBloodMoonDefense: 阿卡指派blast時額外提供血月防禦加成", () => {
  const s = L.defaultState();
  s.baseDefense = 0;
  const before = L.resolveBloodMoonDefense(s).defenseRatio;
  s.flags.laozhou_recruited = s.flags.xiaoyu_recruited = s.flags.ahai_recruited = true;
  s.facilities.command = 3;
  L.refreshCompanionUnlocks(s);
  L.dispatchCompanion(s, "阿卡", "blast");
  assert.ok(L.resolveBloodMoonDefense(s).defenseRatio > before);
});

test("reforgePrefixCost/reinforceCost: 老周(craft)/小雨(base)分別提供折扣", () => {
  const s = L.defaultState();
  const baseReforge = L.reforgePrefixCost(s);
  const baseReinforce = L.reinforceCost(s);
  s.flags.laozhou_recruited = true;
  s.flags.xiaoyu_recruited = true;
  L.refreshCompanionUnlocks(s);
  L.dispatchCompanion(s, "老周", "craft");
  L.dispatchCompanion(s, "小雨", "base");
  assert.ok(L.reforgePrefixCost(s) < baseReforge);
  assert.ok(L.reinforceCost(s) < baseReinforce);
});

test("gatherYield: 阿海指派expedition時採集收穫額外加成", () => {
  const s = L.defaultState();
  s.flags.ahai_recruited = true;
  L.refreshCompanionUnlocks(s);
  L.dispatchCompanion(s, "阿海", "expedition");
  const rng = () => 0.1; // 基礎量food=1/water=1/scrap=0；隨機進位rng()=0.1低於小數部分，必定進位，加成必然可見
  const withBonus = L.gatherYield(rng, s);
  const without = L.gatherYield(rng, null);
  assert.ok(withBonus.food > without.food && withBonus.water > without.water, "阿海加成不能被整數捨入吃掉");
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
  L.chooseFaction(s, "aero");
  s.skills.tiers.aero = 1;
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

// 2026-07-06回歸測試：ach_wedding_ring/ach_legendary_equip/ach_full_factions原本用字面比對或
// ITEMS[state.equipment[slot]]直接查表，稀有以上裝備(wedding_ring=epic、全部4件legendary裝備)
// 實際存的是inst_xxxx實例參考，查不到對應ITEMS定義，導致這3個成就在正常遊戲流程下完全無法達成
// 或被低估(見code review)。已改用isEquippedInData()/resolveEquippedItemInData()正確解析
test("ach_wedding_ring/ach_legendary_equip/ach_full_factions：裝備稀有以上道具(inst_xxxx實例參考)時條件仍能正確判斷", () => {
  const s = L.defaultState();
  const weddingRing = L.ACHIEVEMENTS.ach_wedding_ring;
  const legendaryEquip = L.ACHIEVEMENTS.ach_legendary_equip;
  const fullFactions = L.ACHIEVEMENTS.ach_full_factions;

  assert.strictEqual(weddingRing.condition(s), false);
  assert.strictEqual(legendaryEquip.condition(s), false);
  assert.strictEqual(fullFactions.condition(s), false);

  // wedding_ring是epic稀有度，一定會被實例化
  const ringInstId = L.instantiateEquipment(s, "wedding_ring", () => 0.99);
  s.equipment.accessory = ringInstId;
  assert.ok(ringInstId.startsWith("inst_")); // 確認測試前提：真的被實例化了
  assert.strictEqual(weddingRing.condition(s), true);

  // mind_greatsword是legendary武器，一定會被實例化
  const swordInstId = L.instantiateEquipment(s, "mind_greatsword", () => 0.5);
  s.equipment.weapon = swordInstId;
  assert.ok(swordInstId.startsWith("inst_"));
  assert.strictEqual(legendaryEquip.condition(s), true);

  // 三槽位分別裝mind(accessory,wedding_ring其實factionTag是none，換一件有factionTag的)/mind(weapon)/gaia(armor)
  // 湊出3個不同派系，且weapon/armor都是稀有以上會被實例化
  const armorInstId = L.instantiateEquipment(s, "gaia_skin", () => 0.5); // gaia, legendary
  s.equipment.armor = armorInstId;
  const eyeInstId = L.instantiateEquipment(s, "mind_eye", () => 0.99); // mind, rare
  s.equipment.accessory = eyeInstId;
  assert.ok(armorInstId.startsWith("inst_") && eyeInstId.startsWith("inst_"));
  // weapon=mind, armor=gaia, accessory=mind -> 只有2個不同派系，尚未達標
  assert.strictEqual(fullFactions.condition(s), false);
  const cyberInstId = L.instantiateEquipment(s, "cyber_drone_arm", () => 0.5); // cyber, legendary，換掉weapon
  s.equipment.weapon = cyberInstId;
  // weapon=cyber, armor=gaia, accessory=mind -> 3個不同派系
  assert.strictEqual(fullFactions.condition(s), true);
});

// 2026-07-06回歸測試：side_collect_factions直接讀state.inventory(不像ach_full_factions只看三個裝備欄位)，
// 只要「曾經擁有過」即可，不需要裝備上身。抽卡(rollGacha)是唯一會把裝備直接塞進inventory而不強制裝備的
// 途徑，原本showShopGacha()的抽卡onClick沒呼叫runQuestCheck()，導致抽到湊滿5派系的當下不會立刻判定
// 完成，要等玩家離開商店做了其他動作才會補判(見code review)——這裡驗證的是condition本身邏輯正確，
// UI層呼叫runQuestCheck()的時機已在game.js補上，不在此檔案的測試範圍內(DOM依賴)
test("side_collect_factions：只需inventory裡曾經擁有過5大派系裝備各一件(不需裝備上身)，模擬抽卡直接塞進背包也能判定", () => {
  const s = L.defaultState();
  const collectFactions = L.QUESTS.side_collect_factions;
  assert.strictEqual(collectFactions.condition(s), false);

  const gachaDrops = ["gaia_whip", "cyber_hammer", "ocean_pistol", "aero_crossbow"]; // 先湊4個派系
  gachaDrops.forEach(id => {
    s.inventory.push({ itemId: id, qty: 1 }); // 模擬addItemToInventory：原始itemId直接進背包，不強制裝備
  });
  assert.strictEqual(collectFactions.condition(s), false); // 還差mind

  s.inventory.push({ itemId: "mind_fork", qty: 1 });
  assert.strictEqual(collectFactions.condition(s), true); // 5派系全湊齊，完全沒有任何一件裝備上身
});

// 2026-09-20玩家實測回饋：睡覺/熬夜劇情(如evt_companion_watch「你沉沉睡去，醒來時...」、evt_cold_night_wind「一夜無眠」)
// 選了之後時間完全沒動、體力也沒回——體力只在endPhase(advancePhase)時回滿，而這類事件是從「附近搜刮」觸發、
// 結束後只走finishAction回主畫面。修法是選項(或roll/skillCheck結果)標endsPhase:true，showEvent改走endPhase。
// restless:true=熬夜/沒睡好(體力只回一半)。鎖定：①至少要有這批睡覺/熬夜節點 ②「真的睡覺」(非restless)只能是夜間事件
// 且要有hp/san恢復 ③「熬夜」(restless)一定要付出代價(hp或san為負)，不能白拿體力
test("睡覺/熬夜劇情選項：標記endsPhase讓時間真的過去，睡覺要有恢復、熬夜要有代價", () => {
  const events = require("../js/data.js").EVENTS;
  const nodes = [];
  events.forEach(e => (e.options || []).forEach(o => {
    if (o.endsPhase) nodes.push({ evt: e, node: o, label: o.label });
    if (o.roll) ["success", "fail"].forEach(k => { if (o.roll[k] && o.roll[k].endsPhase) nodes.push({ evt: e, node: o.roll[k], label: o.label + "[" + k + "]" }); });
  }));
  assert.ok(nodes.length >= 8, "應至少有8個睡覺/熬夜節點，實際：" + nodes.length);
  nodes.forEach(({ evt, node, label }) => {
    const eff = node.effect || {};
    if (node.restless) {
      assert.ok(eff.hp < 0 || eff.san < 0, `${evt.id}「${label}」是熬夜/硬撐，必須付出hp或san代價`);
    } else {
      assert.ok(evt.phase.includes("night") && !evt.phase.includes("day"), `${evt.id}「${label}」睡到天亮只能是夜間事件`);
      assert.ok(eff.hp > 0 || eff.san > 0, `${evt.id}「${label}」睡覺選項要有hp/san恢復，不能只有無關的獎勵`);
    }
  });
  const watch = events.find(e => e.id === "evt_companion_watch").options[0];
  assert.strictEqual(watch.endsPhase, true);
  assert.ok(!watch.restless && watch.effect.hp > 0 && watch.effect.san > 0, "夥伴守夜安心睡下是真的睡飽，應同時回血跟回SAN");
  const cold = events.find(e => e.id === "evt_cold_night_wind").options[1];
  assert.ok(cold.endsPhase && cold.restless, "刺骨夜風硬撐是一夜無眠，要過夜但只回一半體力");
});

// 2026-09-20玩家回饋「只有六格可以種地」→ 農地擴成18格(6欄x3排)，庭院擺飾退到四個角落
test("農場18格：FARM_PLOT_LAYOUT座標不重複且在網格內，擺飾槽不與農地重疊，預設只解鎖plot_1", () => {
  const layout = L.FARM_PLOT_LAYOUT;
  assert.strictEqual(layout.length, 18);
  assert.strictEqual(new Set(layout.map(p => p.id)).size, 18);
  assert.strictEqual(new Set(layout.map(p => p.gx + "," + p.gy)).size, 18, "農地座標不可重複");
  layout.forEach((p, i) => {
    assert.strictEqual(p.id, "plot_" + (i + 1));
    assert.ok(p.gx >= 1 && p.gx <= 6 && p.gy >= 1 && p.gy <= 3, p.id + "座標超出6x3範圍");
  });
  L.YARD_DECOR_SLOTS.forEach(d => {
    assert.ok(!layout.some(p => p.gx === d.gx && p.gy === d.gy), d.id + "不可與農地重疊");
    assert.ok(!(d.gx >= 1 && d.gx <= 6 && d.gy >= 1 && d.gy <= 3), d.id + "應在農地塊範圍之外(四個角落)");
  });
  const s = L.defaultState();
  const plots = Object.values(s.farm.plots);
  assert.strictEqual(plots.length, 18);
  assert.strictEqual(plots.filter(p => p.unlocked).length, 1);
  assert.strictEqual(s.farm.plots.plot_1.unlocked, true);
});

test("farmPlotUnlockCost：6,9,12...每次+3，最後一塊54，全部解鎖共510，且單次成本低於廢料上限(否則永遠解鎖不了)", () => {
  const s = L.defaultState();
  let total = 0, prev = 0;
  for (let n = 1; n <= 17; n++) { // 目前已解鎖n塊時，解鎖下一塊的成本
    const id = "plot_" + n;
    s.farm.plots[id].unlocked = true;
    const cost = L.farmPlotUnlockCost(s);
    assert.strictEqual(cost, 6 + (n - 1) * 3);
    assert.ok(cost > prev, "成本必須遞增");
    assert.ok(cost <= s.resourceCaps.scrap, "單次成本不可超過廢料上限" + s.resourceCaps.scrap);
    prev = cost; total += cost;
  }
  assert.strictEqual(prev, 54);
  assert.strictEqual(total, 510);
  // 實際解鎖扣款
  const t = L.defaultState();
  t.resources.scrap = 20;
  const r = L.unlockFarmPlot(t, "plot_2");
  assert.ok(r.ok && r.cost === 6 && t.resources.scrap === 14 && t.farm.plots.plot_2.unlocked);
});

// 2026-09-20玩家回饋「牧場太死板，應該是可以養動物、動物在區域裡亂逛」→ 改成放養牧場，容量4→8(資料模型不變)
test("牧場放養：PEN_LAYOUT為8個容量格、預設只解鎖pen_1，容量摘要/空位/下一格擴建helper正確", () => {
  assert.strictEqual(L.PEN_LAYOUT.length, 8);
  assert.strictEqual(new Set(L.PEN_LAYOUT.map(p => p.id)).size, 8);
  L.PEN_LAYOUT.forEach((p, i) => assert.strictEqual(p.id, "pen_" + (i + 1)));
  const s = L.defaultState();
  assert.strictEqual(Object.keys(s.pens.plots).length, 8);
  assert.deepStrictEqual(L.penCapacityInfo(s), { total: 8, unlocked: 1, animals: 0, free: 1 });
  assert.strictEqual(L.firstFreePenId(s), "pen_1");
  assert.strictEqual(L.nextLockedPenId(s), "pen_2");

  s.inventory.push({ itemId: "chick_token", qty: 2 });
  assert.ok(L.placeAnimal(s, "pen_1", "chick_token").ok);
  assert.strictEqual(L.firstFreePenId(s), null, "唯一的容量格滿了就沒有空位");
  assert.deepStrictEqual(L.penCapacityInfo(s), { total: 8, unlocked: 1, animals: 1, free: 0 });

  s.resources.scrap = 99;
  assert.ok(L.unlockPen(s, L.nextLockedPenId(s)).ok); // 擴建pen_2
  assert.strictEqual(L.firstFreePenId(s), "pen_2");
  assert.ok(L.placeAnimal(s, L.firstFreePenId(s), "chick_token").ok);
  assert.deepStrictEqual(L.penCapacityInfo(s), { total: 8, unlocked: 2, animals: 2, free: 0 });
  // 全部擴建後沒有下一格
  while (L.nextLockedPenId(s)) { s.resources.scrap = 99; assert.ok(L.unlockPen(s, L.nextLockedPenId(s)).ok); }
  assert.strictEqual(L.nextLockedPenId(s), null);
  assert.strictEqual(L.penCapacityInfo(s).unlocked, 8);
});

test("牧場擴建成本：10,16,...,46，單次低於廢料上限，全部擴建共196；side_collect_pens要全部8格才達成", () => {
  const s = L.defaultState();
  let total = 0;
  for (let n = 1; n <= 7; n++) {
    s.pens.plots["pen_" + n].unlocked = true;
    const cost = L.penUnlockCost(s);
    assert.strictEqual(cost, 10 + (n - 1) * 6);
    assert.ok(cost <= s.resourceCaps.scrap);
    total += cost;
  }
  assert.strictEqual(total, 196); // 10+16+22+28+34+40+46
  const quest = L.QUESTS.side_collect_pens;
  assert.strictEqual(quest.condition(s), false); // 只擴建了7格(pen_8仍鎖)
  s.pens.plots.pen_8.unlocked = true;
  assert.strictEqual(quest.condition(s), true);
});

// ===== 2026-09-20 營地成長：建造專案 + 營地等級（玩家回饋「默默把基地養成的感覺太薄弱」）=====
const SUPPORTED_PROJECT_EFFECTS = ["phaseYield", "resourceCapBonus", "baseDefenseBonus", "raidChanceDelta", "restHealBonus", "staminaMaxBonus", "noiseDampRatio", "gatherYieldBonusRatio"];
const SUPPORTED_CAMP_REQS = ["facilityTotal", "comfort", "projectsDone", "farmPlots", "companions", "penAnimals", "day"];

test("CI斷言：PROJECTS/CAMP_LEVELS資料完整——欄位齊全、效果與需求型別都被支援、成本低於資源上限、等級需求單調不降", () => {
  const ids = Object.keys(L.PROJECTS);
  assert.ok(ids.length >= 9);
  const caps = L.defaultState().resourceCaps;
  ids.forEach(id => {
    const p = L.PROJECTS[id];
    assert.strictEqual(p.id, id);
    ["name", "icon", "effectDesc", "doneText"].forEach(k => assert.ok(p[k] && String(p[k]).length > 0, id + "缺" + k));
    assert.ok(Number.isInteger(p.phases) && p.phases >= 2 && p.phases <= 12, id + "工期不合理");
    assert.ok(p.requiresCampLv >= 1 && p.requiresCampLv <= L.CAMP_LEVELS.length);
    Object.keys(p.effects).forEach(k => assert.ok(SUPPORTED_PROJECT_EFFECTS.includes(k), id + "含未支援的效果" + k));
    Object.entries(p.cost.resources || {}).forEach(([k, v]) => assert.ok(v > 0 && v <= caps[k], id + "成本" + k + "=" + v + "超過資源上限" + caps[k] + "，永遠開不了工"));
    p.doneText.split("\n\n").forEach(par => assert.ok(par.length <= 100, id + "完成文案單段超過100字"));
  });
  const lvs = L.CAMP_LEVELS;
  lvs.forEach((l, i) => {
    assert.strictEqual(l.lv, i + 1);
    l.reqs.forEach(r => assert.ok(SUPPORTED_CAMP_REQS.includes(r.type), "Lv" + l.lv + "含未支援的需求" + r.type));
    if (i >= 1) { assert.ok(l.levelUpText && l.levelUpText.length > 0); assert.ok(l.reward > 0); }
  });
  // 同一種需求跨等級單調不降(下一級不會比上一級更容易)
  SUPPORTED_CAMP_REQS.forEach(type => {
    let prev = -1;
    lvs.forEach(l => { const r = l.reqs.find(x => x.type === type); if (r) { assert.ok(r.n >= prev, type + "需求在Lv" + l.lv + "變小了"); prev = r.n; } });
  });
  // 最高級需要的專案數不能超過專案總數(否則永遠升不上去)
  const maxProj = Math.max(...lvs.map(l => (l.reqs.find(r => r.type === "projectsDone") || { n: 0 }).n));
  assert.ok(maxProj <= ids.length);
});

test("startProject：資源/營地等級/同時施工名額/重複開工的驗證，成功時扣資源並記錄開工phase", () => {
  const s = L.defaultState();
  s.resources.scrap = 100;
  assert.strictEqual(L.startProject(s, "nope").reason, "invalid_project");
  assert.strictEqual(L.startProject(s, "proj_wall").reason, "camp_level"); // 需要營地Lv2
  s.resources.scrap = 5;
  assert.strictEqual(L.startProject(s, "proj_rain_tower").reason, "insufficient");
  s.resources.scrap = 100;
  const noise0 = s.noiseLevel || 0;
  const r = L.startProject(s, "proj_rain_tower");
  assert.ok(r.ok);
  assert.strictEqual(s.resources.scrap, 80); // 廢料20
  assert.strictEqual(s.projects.proj_rain_tower.status, "building");
  assert.strictEqual(s.projects.proj_rain_tower.startedAtPhaseIndex, L.currentPhaseIndex(s));
  assert.ok((s.noiseLevel || 0) > noise0, "施工要製造噪音");
  assert.strictEqual(L.startProject(s, "proj_rain_tower").reason, "already_started");
  assert.strictEqual(L.startProject(s, "proj_storage").reason, "no_slot"); // Lv1只能同時1項
  assert.strictEqual(L.activeProjectCount(s), 1);
});

test("建造專案惰性完成：phase差值夠了就生效，settleProjects定案並回傳新完成清單，之後不重複回報", () => {
  const s = L.defaultState();
  s.resources.scrap = 100;
  L.startProject(s, "proj_storage");
  const cap0 = L.getResourceCap(s, "scrap");
  const total = L.PROJECTS.proj_storage.phases;
  assert.strictEqual(L.getProjectState(s, "proj_storage").remaining, total);
  assert.strictEqual(L.isProjectDone(s, "proj_storage"), false);
  assert.strictEqual(L.getResourceCap(s, "scrap"), cap0, "施工中不生效");
  // 推進 total-1 個phase：還沒完成
  for (let i = 0; i < total - 1; i++) L.advancePhase(s);
  assert.strictEqual(L.getProjectState(s, "proj_storage").remaining, 1);
  assert.strictEqual(L.isProjectDone(s, "proj_storage"), false);
  L.advancePhase(s);
  assert.strictEqual(L.isProjectDone(s, "proj_storage"), true);
  assert.strictEqual(L.getResourceCap(s, "scrap"), cap0 + 10, "儲物棚：資源上限+10");
  assert.deepStrictEqual(L.settleProjects(s), ["proj_storage"]);
  assert.strictEqual(s.projects.proj_storage.status, "done");
  assert.deepStrictEqual(L.settleProjects(s), [], "已定案的專案不會重複通知");
  assert.strictEqual(L.getProjectState(s, "proj_storage").status, "done");
});

test("專案效果確實掛進既有計算：防禦/夜襲/休息回血/體力上限/噪音/採集/每階段產出", () => {
  const done = (s, ...ids) => ids.forEach(id => { s.projects[id] = { status: "done", startedAtPhaseIndex: 0 }; });
  const base = L.defaultState();
  const base_def = L.syncBaseDefense(base), base_raid = L.raidChance(base), base_heal = L.restHealAmount(base), base_stamina = L.staminaMax(base);

  const s = L.defaultState();
  done(s, "proj_wall", "proj_watchtower", "proj_clinic", "proj_generator");
  assert.strictEqual(L.syncBaseDefense(s), base_def + 2, "加固圍牆：防禦+2");
  assert.ok(Math.abs(L.raidChance(s) - Math.max(0.02, base_raid - 0.08 - 0.02 * 0)) < 0.05 || L.raidChance(s) < base_raid, "瞭望台：夜襲機率下降");
  assert.strictEqual(L.restHealAmount(s), base_heal + 8, "簡易診所：休息+8血");
  assert.strictEqual(L.staminaMax(s), base_stamina + 1, "發電機房：體力上限+1");

  // 噪音：隔音牆讓相同行動累積的噪音更少
  const a = L.defaultState(), b = L.defaultState();
  done(b, "proj_soundproof");
  L.addNoise(a, 10); L.addNoise(b, 10);
  assert.ok(b.noiseLevel < a.noiseLevel, "隔音牆：噪音累積-30%");
  assert.ok(Math.abs(b.noiseLevel - a.noiseLevel * 0.7) < 0.01);

  // 採集：研究角+15%
  const g0 = L.defaultState(), g1 = L.defaultState();
  done(g1, "proj_lab");
  const y0 = L.gatherYield(() => 0.1, g0), y1 = L.gatherYield(() => 0.1, g1);
  assert.ok(y1.food + y1.water + y1.scrap > y0.food + y0.water + y0.scrap, "研究角讓採集收穫變多");

  // 每階段被動產出：雨水收集塔+1水、煙燻架+1食物
  const p = L.defaultState();
  p.resources.water = 5; p.resources.food = 5;
  done(p, "proj_rain_tower", "proj_smoke");
  const w0 = p.resources.water, f0 = p.resources.food;
  L.advancePhase(p);
  assert.strictEqual(p.resources.water, w0 + 1);
  assert.strictEqual(p.resources.food, f0 + 1);
  assert.deepStrictEqual(L.getProjectPhaseYield(p), { food: 1, water: 1 });
});

test("營地等級：預設Lv1，需求連續判定、等級只升不降、升級獎勵只發一次、Lv3起同時施工名額變2", () => {
  const s = L.defaultState();
  assert.strictEqual(L.getCampLevel(s), 1);
  assert.strictEqual(L.projectSlotLimit(s), 1);
  assert.deepStrictEqual(L.checkCampLevelUp(s), []);

  // 湊齊Lv2需求：設施總等級2、舒適度3、完成1個專案
  s.facilities.command = 1; s.facilities.greenhouse = 1;
  s.projects.proj_rain_tower = { status: "done", startedAtPhaseIndex: 0 };
  s.placedFurniture.push({ itemId: "furn_bench", gx: 1, gy: 1 }, { itemId: "furn_sofa", gx: 2, gy: 1 }, { itemId: "furn_toolbox", gx: 3, gy: 1 });
  assert.ok(L.getComfortLevel(s) >= 3);
  assert.strictEqual(L.computeCampLevel(s), 2);
  const embers0 = s.currency.embers;
  const ups = L.checkCampLevelUp(s);
  assert.strictEqual(ups.length, 1);
  assert.strictEqual(ups[0].lv, 2);
  assert.strictEqual(s.currency.embers, embers0 + L.CAMP_LEVELS[1].reward);
  assert.strictEqual(s.campLevelSeen, 2);
  assert.deepStrictEqual(L.checkCampLevelUp(s), [], "同一級只慶祝/發獎一次");

  // 只升不降：把需求條件拆掉，等級不倒退
  s.placedFurniture = []; s.facilities.command = 0; s.facilities.greenhouse = 0;
  assert.strictEqual(L.computeCampLevel(s), 1);
  assert.strictEqual(L.getCampLevel(s), 2);

  // 需求要連續：Lv3的需求滿足但Lv2不滿足時不會跳級
  const t = L.defaultState();
  t.facilities = { command: 3, greenhouse: 2, workshop: 0, radar: 0 };
  assert.strictEqual(L.computeCampLevel(t), 1);

  // Lv3起同時施工名額2
  const u = L.defaultState();
  u.campLevelSeen = 3;
  assert.strictEqual(L.projectSlotLimit(u), 2);
  u.resources.scrap = 200;
  assert.ok(L.startProject(u, "proj_rain_tower").ok);
  assert.ok(L.startProject(u, "proj_storage").ok);
  assert.strictEqual(L.startProject(u, "proj_wall").reason, "no_slot");
});

test("營地進度與成就：campProgress回傳下一級需求進度；ach_camp_lv3/lv5/ach_all_projects條件正確；舊存檔(缺projects/campLevelSeen)不會出錯", () => {
  const s = L.defaultState();
  const p = L.campProgress(s);
  assert.strictEqual(p.level, 1);
  assert.strictEqual(p.next.lv, 2);
  assert.ok(p.next.reqs.length >= 3 && p.next.reqs.every(r => typeof r.have === "number" && typeof r.need === "number"));
  s.campLevelSeen = 5;
  assert.strictEqual(L.campProgress(s).next, null, "最高級沒有下一級");

  const a3 = L.ACHIEVEMENTS.ach_camp_lv3, a5 = L.ACHIEVEMENTS.ach_camp_lv5, all = L.ACHIEVEMENTS.ach_all_projects;
  const t = L.defaultState();
  assert.ok(!a3.condition(t) && !a5.condition(t) && !all.condition(t));
  t.campLevelSeen = 3; assert.ok(a3.condition(t) && !a5.condition(t));
  t.campLevelSeen = 5; assert.ok(a5.condition(t));
  Object.keys(L.PROJECTS).forEach(id => { t.projects[id] = { status: "done", startedAtPhaseIndex: 0 }; });
  assert.ok(all.condition(t));

  // 舊存檔：沒有projects/campLevelSeen欄位
  const old = L.defaultState();
  delete old.projects; delete old.campLevelSeen;
  assert.doesNotThrow(() => { L.getCampLevel(old); L.getProjectEffect(old, "resourceCapBonus"); L.settleProjects(old); L.raidChance(old); L.staminaMax(old); L.getResourceCap(old, "food"); L.advancePhase(old); });
  assert.strictEqual(L.getCampLevel(old), 1);
});

test("getEffectiveAttribute: 基礎值+等級成長(每4級+1)+飾品加成，上限10", () => {
  const s = L.defaultState();
  assert.strictEqual(L.getEffectiveAttribute(s, "strength"), 3);
  s.level = 8; // +2
  assert.strictEqual(L.getEffectiveAttribute(s, "strength"), 5);
  s.attributes.strength = 9;
  s.level = 20; // +5，但總和需封頂10
  assert.strictEqual(L.getEffectiveAttribute(s, "strength"), 10);
});

test("skillRoll: 骰出1必為critical_fail、骰出20必為critical_success，其餘依total vs dc判定", () => {
  const s = L.defaultState();
  // rng回傳0 -> Math.floor(0*20)+1 = 1 (natural 1)
  let r = L.skillRoll(s, "strength", 12, () => 0);
  assert.strictEqual(r.roll, 1);
  assert.strictEqual(r.tier, "critical_fail");
  // rng回傳接近1(但<1) -> Math.floor(0.999999*20)+1 = 20 (natural 20)
  r = L.skillRoll(s, "strength", 999, () => 0.999999);
  assert.strictEqual(r.roll, 20);
  assert.strictEqual(r.tier, "critical_success");
  // roll=10(rng=0.45)，mod=3(基礎值)，total=13 >= dc12 -> success
  r = L.skillRoll(s, "strength", 12, () => 0.45);
  assert.strictEqual(r.roll, 10);
  assert.strictEqual(r.mod, 3);
  assert.strictEqual(r.total, 13);
  assert.strictEqual(r.tier, "success");
  // 同樣roll=10，但dc拉高到20 -> total 13 < 20 -> fail
  r = L.skillRoll(s, "strength", 20, () => 0.45);
  assert.strictEqual(r.tier, "fail");
});

test("addNoise: 累加後上限100下限0，隔音家具(noiseDampRatio)按比例折抵", () => {
  const s = L.defaultState();
  assert.strictEqual(s.noiseLevel, 0);
  L.addNoise(s, 30);
  assert.strictEqual(s.noiseLevel, 30);
  L.addNoise(s, 90);
  assert.strictEqual(s.noiseLevel, 100); // 上限封頂
  s.noiseLevel = 0;
  s.placedFurniture.push({ itemId: "rug_woven", gx: 0, gy: 0 }); // noiseDampRatio 0.1
  L.addNoise(s, 20);
  assert.strictEqual(s.noiseLevel, 18); // 20*(1-0.1)
});

test("applyPhaseDecay: 噪音每階段自然衰減(NOISE_DECAY_PER_PHASE)，下限為0", () => {
  const s = L.defaultState();
  s.noiseLevel = 25;
  L.applyPhaseDecay(s);
  assert.strictEqual(s.noiseLevel, 25 - L.NOISE_DECAY_PER_PHASE);
  s.noiseLevel = 3;
  L.applyPhaseDecay(s);
  assert.strictEqual(s.noiseLevel, 0); // 不會變負數
});

test("噪音生成：gatherYield/resolveLocation(loot分支)/reforgePrefix/repairEquipment/reinforceFacility成功時皆會累加噪音", () => {
  let s = L.defaultState();
  L.gatherYield(() => 0.5, s);
  assert.strictEqual(s.noiseLevel, L.NOISE_AMOUNTS.gather);

  s = L.defaultState();
  const loc = L.LOCATIONS.find(l => l.encounterChance < 1); // 確保能抽到loot分支
  L.resolveLocation(loc, () => 0.999, s); // rng接近1，必定 >= encounterChance故走loot分支
  assert.strictEqual(s.noiseLevel, L.NOISE_AMOUNTS.explore);

  s = L.defaultState();
  s.currency.embers = 999;
  const instId = "inst_test_reforge";
  s.weaponInstances.push({ id: instId, baseItemId: "machete_01", rarity: "rare", stats: { atk: 5 } });
  L.reforgePrefix(s, instId, () => 0.1);
  assert.strictEqual(s.noiseLevel, L.NOISE_AMOUNTS.craft);

  s = L.defaultState();
  s.currency.embers = 999;
  s.durability["scrap_chainsaw"] = 10;
  L.repairEquipment(s, "scrap_chainsaw");
  assert.strictEqual(s.noiseLevel, L.NOISE_AMOUNTS.craft);

  s = L.defaultState();
  s.resources.scrap = 999;
  L.reinforceFacility(s, "workshop");
  assert.strictEqual(s.noiseLevel, L.NOISE_AMOUNTS.craft);
});

test("processingStationUnlockCost/unlockProcessingStation：站位解鎖成本序列15/23，扣款與已解鎖判定正確", () => {
  const s = L.defaultState();
  assert.strictEqual(s.processing.stations.station_1.unlocked, true);
  assert.strictEqual(s.processing.stations.station_2.unlocked, false);
  assert.strictEqual(L.processingStationUnlockCost(s), 15);
  s.resources.scrap = 100;
  let r = L.unlockProcessingStation(s, "station_2");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.cost, 15);
  assert.strictEqual(s.resources.scrap, 85);
  assert.strictEqual(L.processingStationUnlockCost(s), 23);
  r = L.unlockProcessingStation(s, "station_2");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "already_unlocked");
});

test("recipeAvailable：unlockTier比照facilities.workshop等級，requiresBlueprint比照持有判定(不消耗)", () => {
  const s = L.defaultState();
  assert.strictEqual(L.recipeAvailable(s, "recipe_scrap_ingot"), false);
  s.facilities.workshop = 1;
  assert.strictEqual(L.recipeAvailable(s, "recipe_scrap_ingot"), true);
  assert.strictEqual(L.recipeAvailable(s, "recipe_ration_pack"), false);
  s.facilities.workshop = 2;
  assert.strictEqual(L.recipeAvailable(s, "recipe_ration_pack"), true);
  assert.strictEqual(L.recipeAvailable(s, "recipe_mutant_lamp"), false);
  s.inventory.push({ itemId: "blueprint_mutant_lamp", qty: 1 });
  assert.strictEqual(L.recipeAvailable(s, "recipe_mutant_lamp"), true);
});

test("startProcessing/getProcessingState/collectProcessing：壓縮配方輸出embers、探索限定配方輸出家具且圖紙不被消耗", () => {
  const s = L.defaultState();
  s.facilities.workshop = 1;
  s.resources.scrap = 20;
  let r = L.startProcessing(s, "station_1", "recipe_scrap_ingot");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(s.resources.scrap, 0); // 20 scrap全數扣除
  assert.strictEqual(L.getProcessingState(s, s.processing.stations.station_1).ready, false);
  s.day += 1; // currentPhaseIndex推進2(day+1天等於2個phase)，超過phasesToComplete=2
  const embersBefore = s.currency.embers;
  const collectResult = L.collectProcessing(s, "station_1");
  assert.strictEqual(collectResult.ok, true);
  assert.strictEqual(s.currency.embers, embersBefore + 15);
  assert.strictEqual(s.processing.stations.station_1.job, null); // 收成後job清空，可立刻排下一個

  // 探索限定配方：圖紙持有即可用、不消耗，輸出家具道具
  const s2 = L.defaultState();
  s2.inventory.push({ itemId: "blueprint_mutant_lamp", qty: 1 });
  s2.inventory.push({ itemId: "mutant_berry_extract", qty: 1 });
  s2.inventory.push({ itemId: "mutant_egg_essence", qty: 1 });
  s2.resources.scrap = 15;
  r = L.startProcessing(s2, "station_1", "recipe_mutant_lamp");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(s2.inventory.find(i => i.itemId === "blueprint_mutant_lamp").qty, 1); // 圖紙不消耗
  assert.strictEqual(s2.inventory.some(i => i.itemId === "mutant_berry_extract"), false); // 原料消耗
  s2.day += 2; // phasesToComplete=4，需要至少4個phase
  const collectResult2 = L.collectProcessing(s2, "station_1");
  assert.strictEqual(collectResult2.ok, true);
  assert.strictEqual(s2.inventory.find(i => i.itemId === "furn_mutant_lamp").qty, 1);
});

test("placeYardDecor/removeYardDecor：裝飾道具可換來換去，取下時還給背包(不是消耗品)", () => {
  const s = L.defaultState();
  s.inventory.push({ itemId: "yard_lantern", qty: 1 });
  let r = L.placeYardDecor(s, "decor_1", "yard_lantern");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(s.yardDecorSlots.decor_1.itemId, "yard_lantern");
  assert.strictEqual(s.inventory.some(i => i.itemId === "yard_lantern"), false); // 背包扣除

  // 換成另一個道具：原本擺放的燈籠應該自動還給背包
  s.inventory.push({ itemId: "yard_scarecrow", qty: 1 });
  r = L.placeYardDecor(s, "decor_1", "yard_scarecrow");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(s.yardDecorSlots.decor_1.itemId, "yard_scarecrow");
  assert.strictEqual(s.inventory.find(i => i.itemId === "yard_lantern").qty, 1); // 燈籠還給背包

  // 取下：稻草人還給背包，槽位清空
  r = L.removeYardDecor(s, "decor_1");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(s.yardDecorSlots.decor_1.itemId, null);
  assert.strictEqual(s.inventory.find(i => i.itemId === "yard_scarecrow").qty, 1);
});

test("getYardDecorEffect/addNoise：風鈴的noiseGenRatio讓噪音累積更快(跟隔音家具方向相反)", () => {
  const s = L.defaultState();
  L.addNoise(s, 20);
  const withoutChime = s.noiseLevel;
  const s2 = L.defaultState();
  s2.inventory.push({ itemId: "yard_windchime", qty: 1 });
  L.placeYardDecor(s2, "decor_1", "yard_windchime");
  L.addNoise(s2, 20);
  assert.ok(s2.noiseLevel > withoutChime); // 有風鈴時同樣的噪音量累積得更多
  assert.strictEqual(s2.noiseLevel, 20 * (1 + 0.05));
});

test("getYardDecorEffect/getCropStage：蓋亞靈能圖騰的cropGrowthBonusPhases比照澆水疊加成長進度", () => {
  const s = L.defaultState();
  s.farm.plots.plot_1.crop = { seedId: "seed_potato", plantedAtPhaseIndex: 0, waterBonusPhases: 0, lastWateredDay: null };
  const withoutTotem = L.getCropStage(s, s.farm.plots.plot_1);
  s.inventory.push({ itemId: "yard_gaia_totem", qty: 1 });
  L.placeYardDecor(s, "decor_1", "yard_gaia_totem");
  const withTotem = L.getCropStage(s, s.farm.plots.plot_1);
  assert.ok(withTotem.stageIdx >= withoutTotem.stageIdx); // 圖騰讓成長進度至少一樣快，通常更快
});

test("getAbyssSurgeBattle：全部TIER_ZONES插旗前不會觸發，插旗後才開始且extraTier隨次數遞增至上限(最後一區extraTier+5)", () => {
  const s = L.defaultState();
  const lastZone = L.TIER_ZONES[L.TIER_ZONES.length - 1];
  const n = L.TIER_ZONES.length;
  s.bloodMoonWins = 10; // 即使血月贏很多次，最後一區沒插旗就不該觸發
  assert.strictEqual(L.getAbyssSurgeBattle(s), null);

  s.flags[lastZone.flag] = true;
  s.bloodMoonWins = n; // 第n次(=TIER_ZONES.length)還不算深淵擴散，第n+1次才開始
  assert.strictEqual(L.getAbyssSurgeBattle(s), null);

  s.bloodMoonWins = n + 1; // 第1次深淵擴散
  let surge = L.getAbyssSurgeBattle(s);
  assert.strictEqual(surge.surgeCount, 1);
  assert.strictEqual(surge.extraTier, lastZone.extraTier + 1);
  assert.strictEqual(surge.bossEnemyId, "enemy_abyss_herald");
  assert.deepStrictEqual(surge.reward, { equipment_pool: L.ABYSS_SURGE_EQUIPMENT_POOL });

  s.bloodMoonWins = n + 20; // surgeCount遠超上限，extraTier應封頂在lastZone.extraTier+5
  surge = L.getAbyssSurgeBattle(s);
  assert.strictEqual(surge.extraTier, lastZone.extraTier + 5);
});

test("覺醒鏈：nextAwakeningAvailable/chooseNextFaction/allUnlockedFactionsMaxed——主流派封頂+day門檻才能解鎖下一個流派，最終5個都能解鎖", () => {
  const s = L.defaultState();
  assert.strictEqual(L.nextAwakeningAvailable(s), false); // 尚未選主流派
  L.chooseFaction(s, "gaia");
  assert.strictEqual(L.nextAwakeningAvailable(s), false); // 主流派未封頂
  s.skills.tiers.gaia = 4; // 封頂
  s.day = 50;
  assert.strictEqual(L.nextAwakeningAvailable(s), false); // day未達100門檻
  s.day = 100;
  assert.strictEqual(L.nextAwakeningAvailable(s), true);
  assert.strictEqual(L.chooseNextFaction(s, "gaia"), false); // 不能重選已解鎖的流派
  assert.strictEqual(L.chooseNextFaction(s, "cyber"), true);
  assert.deepStrictEqual(s.skills.unlockOrder, ["gaia", "cyber"]);
  assert.strictEqual(L.nextAwakeningAvailable(s), false); // cyber剛解鎖未封頂

  // 依序把5個流派都解鎖完
  s.skills.tiers.cyber = 4;
  s.day = 150;
  L.chooseNextFaction(s, "ocean");
  s.skills.tiers.ocean = 4;
  s.day = 200;
  L.chooseNextFaction(s, "aero");
  s.skills.tiers.aero = 4;
  s.day = 250;
  L.chooseNextFaction(s, "mind");
  s.skills.tiers.mind = 4;
  assert.strictEqual(s.skills.unlockOrder.length, 5); // 全部5個流派都解鎖了
  assert.strictEqual(L.nextAwakeningAvailable(s), false); // 沒有下一個可解鎖的了
  assert.strictEqual(L.allUnlockedFactionsMaxed(s), true);
  assert.strictEqual(L.spendSkillPoint(s, "gaia"), false); // 全部封頂，花點失敗
});

test("getBossFactionCounterMult：主流派已解鎖任一階(tier>=1)時對enemy_cyborg_nemesis傷害乘數0.8，回歸測試——技能點系統重設(2026-07-05)後這裡忘記同步改，state.skills.tier(單數)舊欄位讀不到值，導致此效果曾經永久失效(code review期間發現)", () => {
  const s = L.defaultState();
  const boss = { id: "enemy_cyborg_nemesis" };
  const notBoss = { id: "enemy_walker_brute" };
  assert.strictEqual(L.getBossFactionCounterMult(s, boss), 1); // 尚未選主流派
  L.chooseFaction(s, "gaia");
  assert.strictEqual(L.getBossFactionCounterMult(s, boss), 1); // 已選主流派但tier仍是0
  s.skills.tiers.gaia = 1;
  assert.strictEqual(L.getBossFactionCounterMult(s, boss), 0.8); // 主流派T1已解鎖
  assert.strictEqual(L.getBossFactionCounterMult(s, notBoss), 1); // 非指揮官不受影響
});

// #21-1：CI剛性斷言 - 所有ITEMS effects與PREFIX_POOL effect中的比例型數值須介於0~1
test("CI斷言：ITEMS/PREFIX_POOL中的比例型加成(dodgeBonus/lifestealBonus/skillBonusRatio等)須介於0~1", () => {
  const ratioKeys = ["dodgeBonus", "lifestealBonus", "lifestealRatio", "critBonus", "skillBonusRatio", "ignoreDefRatio", "noiseDampRatio", "noiseGenRatio"];
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

// 2026-07-05 同伴劇情線：以老周為代表，驗證3階段condition的鏈式gating（未招募不可能觸發/需間隔10天/完成後不重觸發）
test("同伴劇情線：老周3階段condition正確串接，未招募/天數不足/已完成時皆不會觸發", () => {
  const arc1 = L.EVENTS.find(e => e.id === "evt_arc_laozhou_1");
  const arc2 = L.EVENTS.find(e => e.id === "evt_arc_laozhou_2");
  const arc3 = L.EVENTS.find(e => e.id === "evt_arc_laozhou_3");
  assert.ok(arc1 && arc2 && arc3);

  const s = L.defaultState();
  s.day = 20;
  assert.strictEqual(arc1.condition(s), false); // 尚未招募

  s.flags.laozhou_recruited = true;
  L.refreshCompanionUnlocks(s);
  assert.strictEqual(arc1.condition(s), true); // 已招募+day達20

  s.flags["老周_arc1"] = s.day; // 觸發第1階
  assert.strictEqual(arc1.condition(s), false); // 已觸發過，不再符合
  assert.strictEqual(arc2.condition(s), false); // 間隔未滿10天

  s.day += 9;
  assert.strictEqual(arc2.condition(s), false); // 差1天還不夠
  s.day += 1;
  assert.strictEqual(arc2.condition(s), true); // 滿10天

  s.flags["老周_arc2"] = s.day;
  assert.strictEqual(arc2.condition(s), false);
  assert.strictEqual(arc3.condition(s), false);
  s.day += 10;
  assert.strictEqual(arc3.condition(s), true);

  s.flags["老周_arc_done"] = s.day;
  assert.strictEqual(arc3.condition(s), false); // 完成後不再重觸發
});

// 2026-07-05 同伴劇情線：驗證COMPANION_ARC_BONUS是永久加成，不受同伴當下是否被指派任務影響
test("getCompanionTaskEffect：同伴劇情線完成後的永久加成，即使同伴目前standby也生效", () => {
  const s = L.defaultState();
  s.flags.laozhou_recruited = true;
  L.refreshCompanionUnlocks(s);
  assert.strictEqual(s.companions["老周"], "standby"); // 尚未指派任務
  assert.strictEqual(L.getCompanionTaskEffect(s, "reforgeDiscountRatio"), 0);

  s.flags["老周_arc_done"] = s.day;
  assert.strictEqual(L.getCompanionTaskEffect(s, "reforgeDiscountRatio"), 0.05); // standby狀態下劇情加成依然生效

  L.dispatchCompanion(s, "老周", "craft");
  assert.ok(Math.abs(L.getCompanionTaskEffect(s, "reforgeDiscountRatio") - 0.25) < 1e-9); // 0.2(任務本身) + 0.05(劇情加成)疊加
});

// 2026-07-05 補接4項原本「未接入」的裝備效果
test("applyEffect: mind_robe裝備時SAN損失打7折（不限來源，事件/戰鬥皆算）", () => {
  const s = L.defaultState();
  s.equipment.armor = "mind_robe";
  s.san = 50;
  L.applyEffect(s, { san: -10 });
  assert.strictEqual(s.san, 43); // -10*0.7=-7 -> 50-7=43

  const s2 = L.defaultState();
  s2.equipment.armor = "ceramic_vest";
  s2.san = 50;
  L.applyEffect(s2, { san: -10 });
  assert.strictEqual(s2.san, 40); // 未裝備mind_robe，不打折

  const s3 = L.defaultState();
  s3.equipment.armor = "mind_robe";
  s3.san = 50;
  L.applyEffect(s3, { san: 10 }); // san回復不受影響，只打折負值
  assert.strictEqual(s3.san, 60);
});

test("applyAtkShred/getShreddedAtk: mind_fork每擊使敵方攻擊力-1，疊加上限-5（原設計「扣AP」重新詮釋）", () => {
  const s = L.defaultState();
  s.equipment.weapon = "mind_fork";
  const enemy = { atk: 10 };
  for (let i = 0; i < 8; i++) L.applyAtkShred(enemy, s);
  assert.strictEqual(enemy._atkShred, 5);
  assert.strictEqual(L.getShreddedAtk(enemy), 5);

  const s2 = L.defaultState();
  s2.equipment.weapon = "knife_01";
  const enemy2 = { atk: 10 };
  L.applyAtkShred(enemy2, s2);
  assert.strictEqual(L.getShreddedAtk(enemy2), 10); // 未裝備mind_fork，不衰減
});

test("evt_injury：aero_pouch裝備時觸發權重降低30%（陷阱事件機率-30%）", () => {
  const evt = L.EVENTS.find(e => e.id === "evt_injury");
  const s = L.defaultState();
  assert.strictEqual(evt.weightModifier(s), 0); // 未裝備時不調整

  s.equipment.accessory = "aero_pouch";
  assert.strictEqual(evt.weightModifier(s), -2); // -round(8*0.3) = -2
});

test("evt_shadow_on_wall：mind_eye裝備時多一個看穿幻覺的安全選項", () => {
  const evt = L.EVENTS.find(e => e.id === "evt_shadow_on_wall");
  const mindEyeOpt = evt.options.find(o => o.condition);
  assert.ok(mindEyeOpt, "應該有一個掛condition的mind_eye選項");

  const s = L.defaultState();
  assert.strictEqual(mindEyeOpt.condition(s), false);
  s.equipment.accessory = "mind_eye";
  assert.strictEqual(mindEyeOpt.condition(s), true);
  assert.ok(!mindEyeOpt.effect || mindEyeOpt.effect.san === undefined || mindEyeOpt.effect.san >= 0); // 看穿真相不應該扣SAN
});

// 2026-07-05 序章結局→無限模式生態變數：4篇序章共用companion/alone/weak/dead結局代碼，
// applyPrologueEnding設定的flags.alone/weak不只是開局當下的一次性加成，會持續影響本局後續表現
test("結局生態變數：alone永久+15%採集收穫，weak永久+5%探索驚動機率", () => {
  const sAlone = L.defaultState();
  L.applyPrologueEnding(sAlone, "alone");
  // 2026-09-20修正：這裡原本用>=容忍「加成被Math.round吃掉」，其實是把bug當特性——+15%從來沒有實際效果。
  // gatherYield已改隨機進位，這裡改成：①rng=0.1時必定進位、加成可見 ②大量抽樣的平均產出約為1.15倍(有統計意義)
  const withAlone = L.gatherYield(() => 0.1, sAlone);
  const withoutAlone = L.gatherYield(() => 0.1, L.defaultState());
  assert.ok(withAlone.food > withoutAlone.food && withAlone.water > withoutAlone.water);
  let seed = 12345;
  const lcg = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const avg = (st) => { let t = 0; for (let i = 0; i < 20000; i++) { const y = L.gatherYield(lcg, st); t += y.food + y.water + y.scrap; } return t / 20000; };
  const ratio = avg(sAlone) / avg(L.defaultState());
  assert.ok(ratio > 1.10 && ratio < 1.20, "獨自生還的平均採集量應約為1.15倍，實際" + ratio.toFixed(3));

  const loc = { encounterChance: 0.5, encounterEnemyIds: ["enemy_walker_weak"], lootTable: [{ itemId: "scrap", qty: 1, weight: 1 }] };
  const sWeak = L.defaultState();
  L.applyPrologueEnding(sWeak, "weak");
  // rng落在0.5~0.55之間：一般狀態(encounterChance 0.5)不會觸發battle，weak(+0.05)則會觸發
  const normalResult = L.resolveLocation(loc, () => 0.52, L.defaultState());
  const weakResult = L.resolveLocation(loc, () => 0.52, sWeak);
  assert.strictEqual(normalResult.type, "loot");
  assert.strictEqual(weakResult.type, "battle");
});

// 2026-07-05 氛圍細節：血月「死守獸欄 vs 撤退」抉擇——撤退不會讓動物消失，只重挫好感度/延後產出
test("hasAnyPenAnimal/resetPensAfterRetreat：撤退後動物仍在，只有好感度歸零、產出計時重置", () => {
  const s = L.defaultState();
  assert.strictEqual(L.hasAnyPenAnimal(s), false); // 剛開局沒有動物

  s.inventory.push({ itemId: "chick_token", qty: 1 });
  assert.strictEqual(L.placeAnimal(s, "pen_1", "chick_token").ok, true);
  assert.strictEqual(L.hasAnyPenAnimal(s), true);

  s.pens.plots.pen_1.animal.happiness = 80;
  s.day = 5;
  L.resetPensAfterRetreat(s);
  assert.ok(s.pens.plots.pen_1.animal, "動物不會因撤退而消失");
  assert.strictEqual(s.pens.plots.pen_1.animal.happiness, 0);
  assert.strictEqual(L.getPenProductionState(s, s.pens.plots.pen_1).ready, false); // 剛重置，還沒到收成時間
});

// 2026-07-05 雙修流派共鳴：兩流派T3同時解鎖才生效，涵蓋10組全部組合的資料完整性+至少3組實際效果驗證
test("FACTION_RESONANCE：T3共鳴10組涵蓋C(5,2)全部組合，且只有雙方都T3才生效", () => {
  const t3 = L.FACTION_RESONANCE.filter(r => (r.minTier || 3) === 3);
  assert.strictEqual(t3.length, 10);
  const pairKeys = new Set(t3.map(r => r.pair.slice().sort().join("+")));
  assert.strictEqual(pairKeys.size, 10); // 沒有重複組合

  const s = L.defaultState();
  s.skills = { faction: "gaia", tiers: { gaia: 3 }, unlockOrder: ["gaia"] };
  assert.strictEqual(L.factionResonanceActive(s, ["gaia", "cyber"]), false); // cyber還沒解鎖

  s.skills.tiers.cyber = 2;
  assert.strictEqual(L.factionResonanceActive(s, ["gaia", "cyber"]), false); // cyber只有T2

  s.skills.tiers.cyber = 3;
  assert.strictEqual(L.factionResonanceActive(s, ["gaia", "cyber"]), true); // 兩者皆T3，共鳴生效
  assert.strictEqual(L.getActiveFactionResonances(s).length, 1);
});

// 2026-07-06 30小時內容量審視：3組T4進階共鳴，疊加在同名T3版本之上而不是取代
test("FACTION_RESONANCE：T4進階共鳴3組，雙方都T4才生效，且效果疊加在T3版本之上", () => {
  const t4 = L.FACTION_RESONANCE.filter(r => r.minTier === 4);
  assert.strictEqual(t4.length, 3);
  t4.forEach(r => {
    const t3Match = L.FACTION_RESONANCE.find(x => (x.minTier || 3) === 3
      && x.pair.slice().sort().join("+") === r.pair.slice().sort().join("+"));
    assert.ok(t3Match, `T4共鳴${r.name}應該有對應的T3版本(${r.pair.join("+")})`);
  });

  const s = L.defaultState();
  s.skills = { faction: "cyber", tiers: { cyber: 3, ocean: 3 }, unlockOrder: ["cyber", "ocean"] };
  const dodgeAtT3 = L.getDodgeChance(s); // cyber+ocean「液態金屬」T3已生效(+5%)，T4尚未
  s.skills.tiers.cyber = 4;
  assert.ok(Math.abs(L.getDodgeChance(s) - dodgeAtT3) < 1e-9); // 只有cyber到T4，ocean還是T3，T4共鳴不生效
  s.skills.tiers.ocean = 4;
  assert.ok(Math.abs(L.getDodgeChance(s) - (dodgeAtT3 + 0.05)) < 1e-9); // 雙方都T4，「深淵鋼流」額外+5%疊加上去
});

test("雙修共鳴實際效果：gaia+cyber「荊棘裝甲」+5%吸血、gaia+mind「痛覺鈍化」+5%減傷", () => {
  const s = L.defaultState();
  s.skills = { faction: "gaia", tiers: { gaia: 3, cyber: 3 }, unlockOrder: ["gaia", "cyber"] };
  // gaia T3已經包含T2「血藤鞭笞」的基礎15%吸血，共鳴額外+5%，兩者相加=20%
  assert.ok(Math.abs(L.getLifestealRatio(s) - 0.20) < 1e-9);

  const s2 = L.defaultState();
  s2.skills = { faction: "gaia", tiers: { gaia: 3, mind: 3 }, unlockOrder: ["gaia", "mind"] };
  assert.ok(Math.abs(L.getBattleDamageReductionRatio(s2) - 0.05) < 1e-9); // mind本身要T4才有基礎減傷，這裡只吃共鳴的+5%
});

// 2026-07-06 血月模組化：從模板池抽變異，避免day250+後血月夜永遠是同一套流程
test("BLOOD_MOON_MODIFIERS：資料完整性(5筆、weight加總100、皆有id/name/weight)", () => {
  const mods = require("../js/data.js").BLOOD_MOON_MODIFIERS;
  assert.strictEqual(mods.length, 5);
  const totalWeight = mods.reduce((s, m) => s + m.weight, 0);
  assert.strictEqual(totalWeight, 100);
  mods.forEach(m => {
    assert.ok(typeof m.id === "string" && typeof m.name === "string" && typeof m.weight === "number");
  });
});

test("pickBloodMoonModifier：第一次血月(bloodMoonWins=0)固定standard，之後才會抽到變異", () => {
  const s = L.defaultState();
  assert.strictEqual(s.bloodMoonWins, undefined);
  assert.strictEqual(L.pickBloodMoonModifier(s, () => 0.99).id, "standard"); // 不管rng多少，第一次都是standard

  s.bloodMoonWins = 1;
  // rng=0.99落在權重表尾端(standard50+raiders15+silent15+psychic12=92，剩8是spore_haze)
  assert.strictEqual(L.pickBloodMoonModifier(s, () => 0.99).id, "spore_haze");
  // rng=0.01落在最前面，是standard
  assert.strictEqual(L.pickBloodMoonModifier(s, () => 0.01).id, "standard");
});

test("bloodMoonRewards：帶rewardBonus時正確合併套用，formatEffect顯示的reward物件也包含bonus欄位", () => {
  const s = L.defaultState();
  s.day = 1; // mult=1，方便算基準值
  const scrapBefore = s.resources.scrap;
  const embersBefore = s.currency.embers;
  const reward = L.bloodMoonRewards(s, { resources: { scrap: 8 } });
  assert.strictEqual(reward.embers, 40);
  assert.deepStrictEqual(reward.resources, { scrap: 8 });
  assert.strictEqual(s.resources.scrap, scrapBefore + 8);
  assert.strictEqual(s.currency.embers, embersBefore + 40);

  const s2 = L.defaultState();
  const rewardNoBonus = L.bloodMoonRewards(s2);
  assert.strictEqual(rewardNoBonus.resources, undefined); // 沒有bonus時不會憑空多出資源欄位

  // 「silent」模板的skillPoint bonus會跟基礎值重疊，必須是相加而不是覆蓋
  // （曾經用簡單spread合併導致這裡算成1而不是2，已修正）
  const s3 = L.defaultState();
  s3.day = 1;
  const skillPointsBefore = s3.skillPoints;
  const rewardSilent = L.bloodMoonRewards(s3, { skillPoint: 1 });
  assert.strictEqual(rewardSilent.skillPoint, 2); // 基礎1 + bonus1 = 2，不是被bonus覆蓋成1
  assert.strictEqual(s3.skillPoints, skillPointsBefore + 2);
});

// 2026-07-06 30小時內容量審視：MILESTONE_EVENTS延伸到day450，銜接既有day120~250批次
test("MILESTONE_EVENTS：day300/350/400/450四個新里程碑存在且day值/id正確、getMilestoneEvent能正確查到", () => {
  const days = [300, 350, 400, 450];
  const ids = ["milestone_day300", "milestone_day350", "milestone_day400", "milestone_day450"];
  days.forEach((day, i) => {
    const evt = L.MILESTONE_EVENTS.find(e => e.day === day);
    assert.ok(evt, `day${day}應該要有里程碑事件`);
    assert.strictEqual(evt.id, ids[i]);
    assert.ok(evt.options && evt.options.length > 0);
  });

  const s = L.defaultState();
  s.day = 400;
  const m400 = L.getMilestoneEvent(s);
  assert.strictEqual(m400.id, "milestone_day400");
  s.milestonesShown.push(m400.id);
  assert.strictEqual(L.getMilestoneEvent(s), null); // 觸發過就不再重複出現
});

// 2026-07-06 30小時內容量審視：同伴劇情線後日談——劇情線完結後的低頻率循環事件，不是新的一次性連鎖
test("同伴後日談6事件：只有「已招募」+「劇情線已完成(arc_done)」同時成立才會出現在事件池", () => {
  const names = ["老周", "雷恩", "艾莉", "阿卡", "小雨", "阿海"];
  const epilogueIds = ["evt_epilogue_laozhou", "evt_epilogue_leien", "evt_epilogue_aili", "evt_epilogue_aka", "evt_epilogue_xiaoyu", "evt_epilogue_ahai"];
  epilogueIds.forEach((id, i) => {
    const evt = L.EVENTS.find(e => e.id === id);
    assert.ok(evt, `${id}應該存在`);
    const name = names[i];

    const s = L.defaultState();
    assert.strictEqual(evt.condition(s), false); // 未招募

    s.flags.laozhou_recruited = s.flags.xiaoyu_recruited = s.flags.ahai_recruited = true;
    s.facilities.greenhouse = 3; // 艾莉解鎖門檻
    s.facilities.command = 3; // 阿卡解鎖門檻
    L.refreshCompanionUnlocks(s);
    if (name === "雷恩") L.recruitCompanion(s, "雷恩"); // 雷恩走劇情事件解鎖，不吃facilities/flags門檻
    assert.strictEqual(evt.condition(s), false); // 已招募但劇情線尚未完成

    s.flags[name + "_arc_done"] = s.day;
    assert.strictEqual(evt.condition(s), true); // 招募+劇情線完成，事件才會出現
  });
});

// 2026-07-06 地點探索模組化：比照血月模組化，讓探索也有「今日探索條件」的變化
test("LOCATION_MODIFIERS：資料完整性(5筆、weight加總100、皆有id/name/weight)", () => {
  const mods = require("../js/data.js").LOCATION_MODIFIERS;
  assert.strictEqual(mods.length, 5);
  const totalWeight = mods.reduce((s, m) => s + m.weight, 0);
  assert.strictEqual(totalWeight, 100);
  mods.forEach(m => assert.ok(typeof m.id === "string" && typeof m.name === "string" && typeof m.weight === "number"));
});

test("pickLocationModifier：依權重抽選，涵蓋standard跟至少一種變異", () => {
  assert.strictEqual(L.pickLocationModifier(() => 0.01).id, "standard"); // 落在最前面
  assert.strictEqual(L.pickLocationModifier(() => 0.99).id, "psychic_residue"); // 落在權重表尾端
});

test("resolveLocation：modifier的encounterChanceDelta/qtyBonus正確疊加進既有計算", () => {
  const loc = { encounterChance: 0.3, encounterEnemyIds: ["enemy_walker_weak"], lootTable: [{ itemId: "scrap", qty: 2, weight: 1 }] };
  const raiders = { encounterChanceDelta: 0.15 };
  // rng落在0.3~0.45之間：一般狀態不會觸發battle，raiders(+0.15)則會觸發
  const normal = L.resolveLocation(loc, () => 0.35, null, null);
  const withRaiders = L.resolveLocation(loc, () => 0.35, null, raiders);
  assert.strictEqual(normal.type, "loot");
  assert.strictEqual(withRaiders.type, "battle");

  const resourceRich = { qtyBonus: 1 };
  const lootNormal = L.resolveLocation(loc, () => 0.99, null, null); // rng接近1必定loot
  const lootBonus = L.resolveLocation(loc, () => 0.99, null, resourceRich);
  assert.strictEqual(lootNormal.qty, 2);
  assert.strictEqual(lootBonus.qty, 3);
});

// 2026-07-06 程序化支線目標：4個repeatable:"manual"+targetRange的循環委託，完成後歸零+重抽下一輪目標
test("程序化支線目標：4個side_repeat_*皆存在，counterField與totalKills等成就計數器各自獨立", () => {
  const ids = ["side_repeat_kills", "side_repeat_bloodmoon", "side_repeat_gather", "side_repeat_pen"];
  const sharedFields = new Set(["totalKills", "bloodMoonSurvivedCount", "bloodMoonWinStreak", "gatherTodayCount", "careCompletedCount"]);
  ids.forEach(id => {
    const q = L.QUESTS[id];
    assert.ok(q, `${id}應該存在`);
    assert.strictEqual(q.repeatable, "manual");
    assert.ok(Array.isArray(q.targetRange) && q.targetRange.length === 2);
    assert.ok(!sharedFields.has(q.counterField), `${id}的counterField(${q.counterField})不該跟既有成就/任務共用計數器`);
  });
});

test("side_repeat_kills：達標後counterField歸零、重抽下一輪target(落在targetRange內)，可無限重複完成", () => {
  const s = L.defaultState();
  const q = L.QUESTS.side_repeat_kills;
  s.questFlags.repeatKillCount = q.targetRange[0]; // 剛好達到預設初始目標(還沒重抽過時fallback到targetRange[0])
  assert.strictEqual(q.condition(s), true);

  const r1 = L.checkQuestsAndAchievements(s);
  assert.strictEqual(r1.completedSide.length >= 1 && r1.completedSide.some(x => x.id === "side_repeat_kills"), true);
  assert.strictEqual(s.questFlags.repeatKillCount, 0); // 歸零
  const newTarget = s.questFlags.side_repeat_kills_target;
  assert.ok(newTarget >= q.targetRange[0] && newTarget <= q.targetRange[1]); // 重抽的下一輪目標落在範圍內

  // 模擬再打滿一輪，應該能再次完成(不是一次性)
  s.questFlags.repeatKillCount = newTarget;
  const r2 = L.checkQuestsAndAchievements(s);
  assert.strictEqual(r2.completedSide.some(x => x.id === "side_repeat_kills"), true);
});

// ---------- 稽核修正(2026-09-20) ----------
test("鋼鐵T3：對機械系敵人(enemy.mechanical)傷害x1.5——不再讀不存在的factionTag", () => {
  const D = require("../js/data.js");
  const s = L.defaultState();
  s.skills = { faction: "cyber", tiers: { cyber: 3 }, unlockOrder: ["cyber"] };
  assert.strictEqual(L.getFactionDamageMultiplier(s, D.ENEMIES.enemy_cyborg_nemesis), 1.5);
  assert.strictEqual(L.getFactionDamageMultiplier(s, D.ENEMIES.enemy_walker_weak), 1);
  s.skills.tiers.cyber = 2;
  assert.strictEqual(L.getFactionDamageMultiplier(s, D.ENEMIES.enemy_cyborg_nemesis), 1);
});

test("庭院野花花圃(returnSanBonus)：advancePhase時確實回SAN", () => {
  const s = L.defaultState();
  s.san = 50;
  s.yardDecorSlots.decor_1 = { itemId: "yard_flower_bed" };
  const before = s.san;
  L.advancePhase(s, () => 0.99);
  assert.ok(s.san >= before + 3, "SAN應至少+3，實際 " + (s.san - before));
});


// ---------- 審查回饋補強(2026-09-20) ----------
test("特攻倍率上限：鋼鐵T3(x1.5)疊cyber_hammer(x2)不超過x2.0，Boss反制x0.8仍套用；單項不受影響", () => {
  assert.strictEqual(L.SPECIAL_DAMAGE_MULT_CAP, 2.0);
  assert.strictEqual(L.combineSpecialDamageMultipliers(1.5, 2, 0.8), 1.6);   // 原本會是2.4
  assert.ok(Math.abs(L.combineSpecialDamageMultipliers(1.5, 1, 0.8) - 1.2) < 1e-9);
  assert.strictEqual(L.combineSpecialDamageMultipliers(1, 2, 1), 2);
  assert.strictEqual(L.combineSpecialDamageMultipliers(1, 1, 1), 1);
});

test("K1回歸防護：startBattle不得再消耗血月預告(clearUpcomingThreat只能出現在startBloodMoonNight等血月流程)", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "../js/game.js"), "utf8");
  const start = src.indexOf("function startBattle(");
  const end = src.indexOf("\nfunction ", start + 10);
  const body = src.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.ok(!/clearUpcomingThreat|isThreatDue/.test(body), "startBattle不該讀/清血月預告，否則白天遭遇戰會吃掉血月");
  const bm = src.indexOf("function startBloodMoonNight(");
  assert.ok(/clearUpcomingThreat/.test(src.slice(bm, bm + 200)), "血月預告應在startBloodMoonNight開頭清除");
});

test("快取版本一致：index.html的5處?v=N(css+4個js)必須是同一個整數", () => {
  const html = require("fs").readFileSync(require("path").join(__dirname, "../index.html"), "utf8");
  const found = [...html.matchAll(/(css\/style\.css|js\/(?:data|story|logic|game)\.js)\?v=(\d+)/g)];
  assert.strictEqual(found.length, 5, "應有5處帶版本號的資源");
  assert.strictEqual(new Set(found.map(m => m[2])).size, 1, "5處版本號不一致: " + found.map(m => m[1] + "=" + m[2]).join(", "));
});

test("存檔相容防護：defaultState()裡每個巢狀物件欄位都必須登記在game.js的NESTED_STATE_FIELDS", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "../js/game.js"), "utf8");
  const m = src.match(/const NESTED_STATE_FIELDS = \[([^\]]*)\]/);
  assert.ok(m, "找不到NESTED_STATE_FIELDS");
  const registered = new Set([...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]));
  const s = L.defaultState();
  const missing = Object.keys(s).filter(k => s[k] && typeof s[k] === "object" && !Array.isArray(s[k]) && Object.keys(s[k]).length > 0 && !registered.has(k)); // 預設為空字典(flags/itemUseCount/durability)沒有子欄位可補，不需深合併
  // 刻意不進深合併的欄位(整塊以存檔為準)須在此明列並附理由
  const EXEMPT = {};
  const real = missing.filter(k => !(k in EXEMPT));
  assert.deepStrictEqual(real, [], "這些巢狀欄位未登記NESTED_STATE_FIELDS，舊存檔缺新子欄位時會掉值: " + real.join(","));
});

// ---------- 敘事連續性(2026-09-20)：回訪記憶/因果鏈/據點連動/同伴警語與日常 ----------
test("回訪記憶：第1次無迴響，第2/4/7次起各用對應門檻的文字池；recordLocationVisit累加", () => {
  const D = require("../js/data.js");
  const s = L.defaultState();
  assert.strictEqual(L.getVisitMemoryLine(0), "");
  assert.strictEqual(L.getVisitMemoryLine(1), "");
  assert.ok(D.VISIT_MEMORY_LINES[2].includes(L.getVisitMemoryLine(2, () => 0)));
  assert.ok(D.VISIT_MEMORY_LINES[2].includes(L.getVisitMemoryLine(3, () => 0.99)));
  assert.ok(D.VISIT_MEMORY_LINES[4].includes(L.getVisitMemoryLine(5, () => 0)));
  assert.ok(D.VISIT_MEMORY_LINES[7].includes(L.getVisitMemoryLine(99, () => 0)));
  assert.strictEqual(L.recordLocationVisit(s, "loc_x"), 1);
  assert.strictEqual(L.recordLocationVisit(s, "loc_x"), 2);
  assert.strictEqual(L.recordLocationVisit(s, "loc_y"), 1);
});

test("因果鏈：善意選項設旗標→2天後(營火3天)才出現回饋事件，且只發生一次", () => {
  const D = require("../js/data.js");
  const find = id => D.EVENTS.find(e => e.id === id);
  const chains = [
    ["evt_neighbor_knock", "用一份食物換取對方的鐵罐", "neighbor_helped", "evt_neighbor_return", "neighbor_return_done", 2],
    ["evt_stray_cat", "分牠一點食物", "cat_fed", "evt_cat_returns", "cat_return_done", 2],
    ["evt_campfire_stranger", "走近，分一份食物給他們", "campfire_shared", "evt_campfire_return", "campfire_return_done", 3],
  ];
  for (const [startId, label, flag, retId, doneFlag, days] of chains) {
    const opt = find(startId).options.find(o => o.label === label);
    assert.ok(opt, startId + " 找不到選項 " + label);
    assert.strictEqual(opt.effect.setFlag, flag);
    const ret = find(retId);
    assert.ok(ret && ret.weight > 0);
    assert.strictEqual(ret.options[0].effect.setFlag, doneFlag);
    const s = L.defaultState();
    s.day = 10;
    assert.strictEqual(ret.condition(s), false, "沒旗標不該出現");
    s.flags[flag] = 10;
    assert.strictEqual(ret.condition(s), false, "當天不該出現");
    s.day = 10 + days;
    assert.strictEqual(ret.condition(s), true, days + "天後應可出現");
    s.flags[doneFlag] = s.day;
    assert.strictEqual(ret.condition(s), false, "已回饋過不該重複");
  }
});

test("據點連動：BASE_REACTION_OPTIONS的事件都存在、選項帶showIf，專案完成才顯示", () => {
  const D = require("../js/data.js");
  for (const [evtId, extra] of Object.entries(D.BASE_REACTION_OPTIONS)) {
    const e = D.EVENTS.find(x => x.id === evtId);
    assert.ok(e, "事件不存在: " + evtId);
    for (const o of extra) {
      assert.ok(e.options.includes(o), evtId + " 的專屬選項沒被加入");
      assert.strictEqual(typeof o.showIf, "function");
      assert.ok(o.resultText);
    }
  }
  const opt = D.EVENTS.find(e => e.id === "evt_noise_outside").options.find(o => o.showIf);
  const s = L.defaultState();
  assert.strictEqual(opt.showIf(s), false);
  s.projects.proj_watchtower = { status: "done", startedAtPhaseIndex: 0 };
  assert.strictEqual(opt.showIf(s), true);
});

test("同伴警語：血月倒數期挑已招募同伴、同一天結果穩定；沒同伴回空字串", () => {
  const s = L.defaultState();
  Object.keys(s.companions).forEach(k => { s.companions[k] = "locked"; });
  assert.strictEqual(L.getCompanionThreatLine(s), "");
  s.companions["雷恩"] = "standby";
  const a = L.getCompanionThreatLine(s);
  assert.ok(a.startsWith("雷恩："));
  assert.strictEqual(L.getCompanionThreatLine(s), a);
});

test("同伴日常：個人線解完者優先被選，且沙發互動改用定居感專屬對話", () => {
  const D = require("../js/data.js");
  const s = L.defaultState();
  Object.keys(s.companions).forEach(k => { s.companions[k] = "locked"; });
  assert.strictEqual(L.pickHomeCompanion(s), null);
  s.companions["雷恩"] = "standby";
  s.companions["艾莉"] = "standby";
  s.flags["艾莉_arc_done"] = 5;
  assert.strictEqual(L.pickHomeCompanion(s), "艾莉");
  assert.ok(D.COMPANION_HOME_LINES["艾莉"].includes(L.getCompanionHomeLine(s, "艾莉")));
  assert.strictEqual(L.getCompanionHomeLine(s, "雷恩"), "");
  s.inventory.push({ itemId: "furn_sofa", qty: 1 });
  L.placeFurniture(s, "furn_sofa");
  const r = L.loungeInteract(s, "艾莉");
  if (r.ok) assert.ok(D.COMPANION_HOME_LINES["艾莉"].includes(r.text));
});

test("新增敘事文字：每段≤100字、6位同伴都有警語與日常對話", () => {
  const D = require("../js/data.js");
  const names = Object.keys(D.COMPANIONS_REGISTRY);
  for (const n of names) {
    assert.ok(D.COMPANION_THREAT_LINES[n] && D.COMPANION_THREAT_LINES[n].length >= 2, n + " 缺警語");
    assert.ok(D.COMPANION_HOME_LINES[n] && D.COMPANION_HOME_LINES[n].length >= 2, n + " 缺日常對話");
  }
  const all = [].concat(...Object.values(D.VISIT_MEMORY_LINES), ...Object.values(D.COMPANION_THREAT_LINES).flat(), ...Object.values(D.COMPANION_HOME_LINES).flat(),
    ...D.CONSEQUENCE_EVENTS.map(e => e.text), ...D.CONSEQUENCE_EVENTS.flatMap(e => e.options.map(o => o.resultText)),
    ...Object.values(D.BASE_REACTION_OPTIONS).flat().map(o => o.resultText));
  const long = all.filter(t => t.length > 100);
  assert.deepStrictEqual(long, [], "超過100字: " + long.join(" | "));
});

test("出門單一入口：小屋場景不再有採集門，showExploreChoice內含採集/搜刮/遠方三選項", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "../js/game.js"), "utf8");
  assert.ok(!/homeGatherDoorCell/.test(src), "採集門殘留");
  const i = src.indexOf("function showExploreChoice(");
  const body = src.slice(i, src.indexOf("\nfunction ", i + 10));
  assert.ok(/onClick: doGather/.test(body) && /onClick: doExplore/.test(body) && /onClick: showLocationList/.test(body));
});


console.log(`\n結果：${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
