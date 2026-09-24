// 內容驗證器：檢查「別的AI寫的事件」是否符合遊戲規格，通過才交給開發者併入 data.js
// 用法：node tests/validate_content.js <檔案路徑>
// 檔案內容可以是純陣列  [ {...}, {...} ]  或  const NAME = [ ... ];  ，事件格式見「規格文件/內容擴充需求單_給其他AI.md」
const fs = require("fs");
const path = require("path");
const D = require("../js/data.js");
const L = require("../js/logic.js");

const file = process.argv[2];
if (!file) { console.log("用法：node tests/validate_content.js <檔案路徑>"); process.exit(2); }
let text = fs.readFileSync(path.resolve(file), "utf8").trim();
text = text.split("\n").filter(l => !l.trim().startsWith("//")).join("\n").trim(); // 去掉整行註解
text = text.replace(/^(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*/, "").replace(/;\s*$/, "");

// 事件 condition / showIf 可以用的輔助函式(與 data.js 內同名同義)
const helpers = {
  daysSinceFlagAtLeast: (state, flag, days) => !!(state.flags && state.flags[flag] && state.day - state.flags[flag] >= days),
  companionRecruited: (state, name) => !!(state.companions && state.companions[name] && state.companions[name] !== "locked"),
  projectBuilt: (state, id) => !!(state.projects && state.projects[id] && state.projects[id].status === "done"),
  farmPlotsUnlocked: (s) => (s.farm && s.farm.plots) ? Object.values(s.farm.plots).filter(p => p.unlocked).length : 0,
  penAnimalCount: (s) => (s.pens && s.pens.plots) ? Object.values(s.pens.plots).filter(p => p.animal).length : 0,
  workshopStations: (s) => (s.processing && s.processing.stations) ? Object.values(s.processing.stations).filter(p => p.unlocked).length : 0,
};
let events;
try {
  events = new Function(...Object.keys(helpers), "return (" + text + ");")(...Object.values(helpers));
} catch (e) {
  console.log("❌ 無法解析檔案(語法錯誤)：" + e.message);
  process.exit(1);
}
if (!Array.isArray(events)) { console.log("❌ 檔案內容必須是事件陣列"); process.exit(1); }

const errors = [], warns = [];
const err = (id, m) => errors.push(`[${id}] ${m}`);
const warn = (id, m) => warns.push(`[${id}] ${m}`);

const RESOURCES = ["food", "water", "medicine", "ammo", "scrap"];
const ALLOWED_EFFECT_KEYS = ["hp", "san", "exp", "embers", "stamina", "baseDefense", "resources", "setFlag", "equipment_pool"];
const LIMITS = { hp: [-15, 15], san: [-10, 10], exp: [0, 10], embers: [0, 5], stamina: [-2, 2], baseDefense: [-1, 1] };
const existingIds = new Set(D.EVENTS.map(e => e.id));
const safeEquip = new Set(Object.values(D.ITEMS).filter(i => ["weapon", "armor", "accessory"].includes(i.type) && ["common", "uncommon"].includes(i.rarity)).map(i => i.id));
const seenIds = new Set();
const state0 = L.defaultState();

function checkText(id, where, t, max) {
  if (typeof t !== "string" || !t.trim()) { err(id, `${where} 缺少文字`); return; }
  t.split("\n").forEach(p => { if (p.length > max) err(id, `${where} 有一段超過${max}字(${p.length}字)：「${p.slice(0, 20)}…」`); });
}
function checkEffect(id, where, eff) {
  if (eff === undefined) return;
  if (typeof eff !== "object" || eff === null || Array.isArray(eff)) { err(id, `${where} effect必須是物件`); return; }
  for (const k of Object.keys(eff)) {
    if (!ALLOWED_EFFECT_KEYS.includes(k)) { err(id, `${where} 不允許的effect欄位「${k}」(允許：${ALLOWED_EFFECT_KEYS.join("/")})`); continue; }
    if (LIMITS[k]) {
      if (typeof eff[k] !== "number" || !Number.isFinite(eff[k])) err(id, `${where} ${k} 必須是數字`);
      else if (eff[k] < LIMITS[k][0] || eff[k] > LIMITS[k][1]) err(id, `${where} ${k}=${eff[k]} 超出允許範圍 ${LIMITS[k][0]}~${LIMITS[k][1]}`);
    }
  }
  if (eff.resources) {
    for (const r of Object.keys(eff.resources)) {
      if (!RESOURCES.includes(r)) err(id, `${where} 未知資源「${r}」(只有 ${RESOURCES.join("/")})`);
      else if (!Number.isInteger(eff.resources[r]) || Math.abs(eff.resources[r]) > 5) err(id, `${where} resources.${r}=${eff.resources[r]} 必須是整數且絕對值≤5`);
    }
  }
  if (eff.setFlag !== undefined && !/^[a-z][a-z0-9_]{2,40}$/.test(eff.setFlag)) err(id, `${where} setFlag「${eff.setFlag}」必須是小寫英文/數字/底線(3~41字)`);
  if (eff.equipment_pool) {
    if (!Array.isArray(eff.equipment_pool) || !eff.equipment_pool.length) err(id, `${where} equipment_pool必須是非空陣列`);
    else eff.equipment_pool.forEach(i => { if (!safeEquip.has(i)) err(id, `${where} equipment_pool含不允許的道具「${i}」(只能用common/uncommon裝備，見需求單清單)`); });
  }
}

events.forEach((e, idx) => {
  const id = (e && e.id) || `#${idx + 1}`;
  if (!e || typeof e !== "object") { err(id, "不是物件"); return; }
  if (!/^evt_[a-z][a-z0-9_]+$/.test(e.id || "")) err(id, "id必須是 evt_ 開頭的小寫英文/數字/底線");
  if (existingIds.has(e.id)) err(id, "id與現有事件重複");
  if (seenIds.has(e.id)) err(id, "id在本批內重複");
  seenIds.add(e.id);
  if (!Number.isInteger(e.minDay) || e.minDay < 1) err(id, "minDay必須是>=1的整數");
  if (e.maxDay !== null && e.maxDay !== undefined && (!Number.isInteger(e.maxDay) || e.maxDay < e.minDay)) err(id, "maxDay必須是null或>=minDay的整數");
  if (!Array.isArray(e.phase) || !e.phase.length || !e.phase.every(p => p === "day" || p === "night")) err(id, 'phase必須是 ["day"]、["night"] 或 ["day","night"]');
  if (typeof e.weight !== "number" || e.weight < 1 || e.weight > 12) err(id, "weight必須是1~12(一般4~8，稀有事件1~3)");
  if (e.title !== undefined) checkText(id, "title", e.title, 20);
  if (e.textPool) { if (!Array.isArray(e.textPool) || e.textPool.length < 2) err(id, "textPool至少2句"); else e.textPool.forEach((t, i) => checkText(id, `textPool[${i}]`, t, 100)); }
  else checkText(id, "text", e.text, 100);
  if (e.condition !== undefined) {
    if (typeof e.condition !== "function") err(id, "condition必須是函式 (state) => boolean");
    else { try { const r = e.condition(state0); if (typeof r !== "boolean" && r !== undefined) warn(id, "condition應回傳true/false"); } catch (x) { err(id, "condition執行出錯(用全新存檔測試)：" + x.message); } }
  }
  if (!Array.isArray(e.options) || e.options.length < 2 || e.options.length > 3) { err(id, "options必須有2~3個選項(不要只有1個，沒有選擇感)"); return; }
  const labels = new Set();
  e.options.forEach((o, i) => {
    const w = `選項${i + 1}`;
    if (typeof o.label !== "string" || !o.label.trim() || o.label.length > 18) err(id, `${w} label必須是1~18字`);
    if (labels.has(o.label)) err(id, `${w} label與同事件其他選項重複`);
    labels.add(o.label);
    checkText(id, `${w} resultText`, o.resultText, 100);
    checkEffect(id, w, o.effect);
    if (o.effect === undefined && !o.roll && !o.battle) warn(id, `${w} 沒有任何effect(純敘事選項可以，但整個事件別全是這種)`);
    if (o.showIf !== undefined) { if (typeof o.showIf !== "function") err(id, `${w} showIf必須是函式`); else { try { o.showIf(state0); } catch (x) { err(id, `${w} showIf執行出錯：` + x.message); } } }
    if (o.requiresResource) {
      for (const r of Object.keys(o.requiresResource)) if (!RESOURCES.includes(r)) err(id, `${w} requiresResource未知資源「${r}」`);
      if (o.effect && o.effect.resources) for (const r of Object.keys(o.requiresResource)) { if (!(o.effect.resources[r] <= -o.requiresResource[r])) warn(id, `${w} 要求${r}${o.requiresResource[r]}但effect沒有對應扣除`); }
    }
    ["roll", "skillCheck", "battle", "endsPhase", "restless"].forEach(k => { if (o[k] !== undefined) err(id, `${w} 不允許使用「${k}」欄位(外部AI只用 label/effect/resultText/requiresResource/showIf)`); });
    // 乾跑：效果套用到全新存檔不能出錯
    try { L.applyEffect(JSON.parse(JSON.stringify(state0)), o.effect); } catch (x) { err(id, `${w} effect套用出錯：` + x.message); }
  });
  // 因果鏈檢查：condition看的flag，在本批或現有資料裡必須有人設定
  // (只做提醒：讓開發者確認鏈的起點存在)
  const src = e.condition ? String(e.condition) : "";
  [...src.matchAll(/"([a-z][a-z0-9_]+)"/g)].forEach(m => {
    const f = m[1];
    const setsInBatch = events.some(x => (x.options || []).some(o => o.effect && o.effect.setFlag === f));
    const setsInGame = D.EVENTS.some(x => (x.options || []).some(o => (o.effect && o.effect.setFlag === f) || (o.roll && ((o.roll.success && o.roll.success.effect && o.roll.success.effect.setFlag === f) || (o.roll.fail && o.roll.fail.effect && o.roll.fail.effect.setFlag === f)))));
    if (!setsInBatch && !setsInGame && !["done"].includes(f) && !/^(evt|proj|loc|main|side)_/.test(f) && !L.FACILITY_KEYS.includes(f)) warn(id, `condition用到的旗標「${f}」沒有任何事件會設定它(鏈的起點在哪？)`);
  });
});

// 整批品質提醒
const allOpts = events.flatMap(e => e.options || []);
const chain = events.filter(e => e.condition && /daysSinceFlagAtLeast/.test(String(e.condition))).length;
console.log(`檢查 ${events.length} 個事件、${allOpts.length} 個選項：因果鏈事件 ${chain} 個，基地連動(showIf/條件) ${events.filter(e => e.condition && /(farm|pen|workshop|projectBuilt|facilities|campLevelSeen)/.test(String(e.condition))).length} 個`);
const single = events.filter(e => (e.options || []).length < 2).length;
if (single) console.log(`⚠️ ${single} 個事件選項少於2個`);
warns.forEach(w => console.log("⚠️ " + w));
errors.forEach(x => console.log("❌ " + x));
console.log(errors.length ? `\n結果：❌ ${errors.length} 個錯誤，請修正後重新驗證` : `\n結果：✅ 通過（${warns.length} 個提醒）`);
process.exit(errors.length ? 1 : 0);
