// #21-3：極端Build崩壞測試（強制配置playerState至理論最強/最弱Build，檢驗系統上下限）
// 執行方式：node tests/extreme_build.js

const L = require("../js/logic.js");

function calcAttackDamage(state, enemy, overpowerMult = 1) {
  const myStats = L.getEffectiveStats(state);
  const enemyDef = Math.round(L.getShreddedDef(enemy) * (1 - L.getIgnoreDefRatio(state)));
  let dmg = Math.max(1, myStats.atk - enemyDef);
  dmg = Math.round(dmg * L.getFactionDamageMultiplier(state, enemy) * L.getMechanicalDamageMultiplier(state, enemy) * L.getBossFactionCounterMult(state, enemy));
  if (overpowerMult !== 1) dmg = Math.round(dmg * overpowerMult);
  return dmg;
}

console.log("=== 「鋼鐵碾壓」測試：鋼鐵活化T4 + 滿級傳奇裝備 + 滿額商城戰力強化 ===");
{
  const state = L.defaultState();
  for (let i = 0; i < 9; i++) L.gainExp(state, 999); // 拉高等級
  state.skills = { faction: "cyber", tier: 4 };
  const instId = L.instantiateEquipment(state, "mind_greatsword", () => 0.99); // 傳奇武器
  state.equipment.weapon = instId;
  for (let i = 0; i < 3; i++) L.applyEffect(state, { statBoost: { atk: 1 } }); // 3瓶素質強化劑·力量

  ["enemy_walker_brute", "enemy_walker_armed"].forEach(enemyId => {
    const enemy = L.getScaledEnemy(enemyId, state);
    const dmg = calcAttackDamage(state, enemy);
    const hitsToKill = Math.ceil(enemy.hp / dmg);
    console.log(`${enemyId}(tier${enemy.tier}, hp${enemy.hp}) - 單擊傷害${dmg}, ${hitsToKill}擊擊殺, 玩家Lv${state.level}`);
  });

  // 向下輾壓(overpower)情境：高等級玩家進入低Tier地點
  const lowTierEnemy = L.getScaledEnemy("enemy_walker_weak", { level: 1 });
  const op = L.getLocationOverpower ? L.getLocationOverpower(state, { recommendedLevel: 1 }) : null;
  console.log("向下輾壓地點overpower:", op);
  if (op) {
    const dmg = calcAttackDamage(state, lowTierEnemy, op.dmgMult);
    console.log(`enemy_walker_weak(hp${lowTierEnemy.hp}) - 輾壓單擊傷害${dmg}, ${Math.ceil(lowTierEnemy.hp / dmg)}擊擊殺`);
  }
}

console.log("\n=== 「不死心靈晶格」測試：心靈晶格T3 + SAN恆0 ===");
{
  const state = L.defaultState();
  state.skills = { faction: "mind", tier: 3 };
  state.san = 0;
  const stats = L.getEffectiveStats(state);
  console.log(`SAN=0時，水晶稜鏡(T1)防禦加成 = floor(0/20) = ${Math.floor(state.san / 20)}（不是使用者預期的「10%晶格護盾」）`);
  console.log(`過勞HP懲罰(SAN<40時T3免疫): ${L.staminaPenaltyHp ? L.staminaPenaltyHp(state) : "N/A"}`);
  console.log(`effective def = ${stats.def}（base ${state.stats.def}）`);
  // 模擬30階段decay，檢查SAN=0下是否會持續掉血/死亡
  let died = false;
  for (let i = 0; i < 30; i++) {
    died = L.applyPhaseDecay(state);
    if (died) break;
  }
  console.log(`30階段後 hp=${state.hp}/${state.hpMax}, san=${state.san}, died=${died}`);
}
