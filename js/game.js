
// ========================================================
// TODO V3 後續更新：四大系統擴充
// ========================================================
// [TODO-DICE]  🎲 TRPG 技能擲骰
//   - state.skills: { strength, agility, perception } (1~10)
//   - skillRoll(skill, dc) → d20 + modifier vs DC
//   - 結果分 critical_success / success / fail / critical_fail
//   - 撬門、潛行、搜刮、高難度互動時觸發
//
// [TODO-INVENTORY] 🎒 背包負重 + 食物過期（Project Zomboid 式）
//   - state.inventory[] 取代純數字，格式 {id, qty, weight, expiresDay}
//   - state.carryCapacity 負重上限（家具可提升）
//   - 每日推進時執行腐敗檢查；停電後冰箱加速腐敗
//
// [TODO-NOISE] 🔴 噪音系統（7 Days to Die 式）
//   - state.noiseLevel 0~100
//   - 製造/搜刮/戰鬥產生噪音；隔音家具降噪
//   - 血月波數 = baseWaves + floor(noiseLevel / 20)
//   - UI：狀態列顯示噪音條，血月前顯示警告
//
// [TODO-COMPANIONS] 🌾 多同伴後勤（RimWorld 式）
//   - state.companions[] 陣列（現為單一 state.companion）
//   - 超過 6 人後自動整合為 logisticsPool，貢獻每日被動產出
//   - 任務指派 UI 擴充：守衛/搜刮/製作/基地
// ========================================================


const SAVE_KEY = "embers_diary_save_v1";

// defaultState/clamp/applyEffect/pickWeighted/pickEvent/applyPhaseDecay/advancePhase
let state = null;
let pendingBattle = null; // { enemy, hpLeft, onEnd }
// v181：終端機美學提案Phase3最後一項——副數據流(System Matrix Log)，戰鬥畫面右側/下方的快速技術戰報，
// 跟主敘事(renderBattle的message參數)是兩條並行的文字流，只保留最近8筆避免畫面塞爆
let battleSysLog = [];
function pushSysLog(text) {
  battleSysLog.push(text);
  if (battleSysLog.length > 8) battleSysLog.shift();
}
function sysLogHtml() {
  if (!battleSysLog.length) return "";
  return `<div class="sysLog">${battleSysLog.map(l => `<div class="sysLogLine">${l}</div>`).join("")}</div>`;
}

function saveGame() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}
const NESTED_STATE_FIELDS = ["resources", "resourceCaps", "equipment", "stats", "facilities", "skills", "spouseState", "sharedFridge", "baseSlots", "companions", "questFlags", "questProgress", "farm", "pens"];
// v167相容：v166以前的存檔把table/floor/rug類家具放在baseSlots的這些鍵裡，free-form改版後這些鍵已不再被
// 任何程式碼讀取——若不搬移，舊存檔讀進來的家具會「卡在baseSlots裡但形同消失」（不在room顯示、不算舒適度、
// 也回不去背包）。讀檔時偵測到就搬進placedFurniture，搬完即從baseSlots刪除，只需做這一次
const LEGACY_FURNITURE_SLOT_KEYS = ["table", "table2", "table3", "table4", "floor", "floor2", "floor3", "floor4", "floor5", "rug", "rug2"];
function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  const defaults = defaultState();
  const saved = JSON.parse(raw);
  const merged = { ...defaults, ...saved };
  for (const key of NESTED_STATE_FIELDS) {
    if (saved[key] && typeof saved[key] === "object") {
      merged[key] = { ...defaults[key], ...saved[key] };
    }
  }
  if (saved.baseSlots) {
    LEGACY_FURNITURE_SLOT_KEYS.forEach(key => {
      const itemId = saved.baseSlots[key];
      delete merged.baseSlots[key];
      if (!itemId) return;
      // furn_sleeping_bag已由defaultState()預先放好一份在placedFurniture，避免搬移後重複出現兩個睡袋
      if (itemId === "furn_sleeping_bag" && merged.placedFurniture.some(f => f.itemId === "furn_sleeping_bag")) return;
      const cell = findEmptyGridCell(merged);
      merged.placedFurniture.push({ itemId, gx: cell.gx, gy: cell.gy });
    });
  }
  // 農場區(2026-07-02)：上面NESTED_STATE_FIELDS的淺層合併只做到state.farm這一層，若之後FARM_PLOT_LAYOUT
  // 尾端新增地塊，舊存檔的saved.farm.plots會整包覆蓋掉defaults.farm.plots，新地塊的預設值就消失——這裡額外
  // 對plots做一次合併，讓舊存檔讀進來時自動補上新地塊的預設「未解鎖」狀態
  if (saved.farm && saved.farm.plots) {
    merged.farm.plots = { ...defaults.farm.plots, ...saved.farm.plots };
  }
  // 養殖區(2026-07-02)：同一種淺層合併的坑，比照farm的處理方式
  if (saved.pens && saved.pens.plots) {
    merged.pens.plots = { ...defaults.pens.plots, ...saved.pens.plots };
  }
  return merged;
}
function hasSave() {
  return !!localStorage.getItem(SAVE_KEY);
}

function applyEffect(effect) { return _applyEffect(state, effect); }
function pickEvent() { return _pickEvent(state); }
function pickWeighted(list) { return _pickWeighted(list); }

const screen = document.getElementById("screen");
const statusBar = document.getElementById("statusBar");

function bar(cls, icon, val, max, label, danger = false) {
  const pct = Math.max(0, Math.min(100, (val / max) * 100));
  const title = label ? ` title="${label} ${val}/${max}"` : "";
  const dangerCls = danger ? " status-danger" : "";
  return `<span class="statBar ${cls}${dangerCls}"${title}>${icon}<span class="barTrack"><span class="barFill" style="width:${pct}%"></span></span><span class="num">${val}</span></span>`;
}
function asciiBar(val, max, len = 8) {
  const filled = Math.round(Math.max(0, Math.min(len, (val / Math.max(1, max)) * len)));
  return "[" + "█".repeat(filled) + "░".repeat(len - filled) + "]";
}

// #23：頂部常駐狀態列(天數/晝夜/HP/體力)，其餘資源(食物/飲水/晶燼)收進展開面板
function renderStatusBar() {
  const isNight = state.phase !== "day";
  statusBar.classList.toggle("bloodMoonWarning", isBloodMoonWarning());
  statusBar.innerHTML = `
    <span class="dayBadge ${isNight ? "night" : "day"}" title="目前天數與晝夜狀態">${isNight ? "🌙" : "☀️"} 第${state.day}天${isNight ? "夜" : "日"}</span>
    ${bar("hp", "❤️", state.hp, state.hpMax, "生命值，HP歸零會死亡", state.hp <= state.hpMax * 0.25)}
    ${bar("stamina", "⚡", state.stamina, state.staminaMax, "體力，行動會消耗體力，耗盡時會強制過勞", state.stamina <= 0)}
    <button id="statusMoreBtn" class="iconBtn" title="更多狀態">⋯</button>
    <button id="statusHelpBtn" class="iconBtn" title="圖示說明">❓</button>
    <button id="invBtn" class="iconBtn">🎒</button>
    <button id="shopBtn" class="iconBtn">🏪</button>
  `;
  document.getElementById("invBtn").onclick = () => togglePanel("inventory", showInventory);
  document.getElementById("shopBtn").onclick = () => togglePanel("shop", () => showShop());
  document.getElementById("statusMoreBtn").onclick = toggleStatusExtra;
  document.getElementById("statusHelpBtn").onclick = showStatusHelp;
  // v125：HP/體力數字 count-up 動畫
  if (_prevHp !== null && _prevHp !== state.hp) {
    const hpNum = statusBar.querySelector(".statBar.hp .num");
    if (hpNum) animateNumber(hpNum, _prevHp, state.hp);
  }
  if (_prevStamina !== null && _prevStamina !== state.stamina) {
    const stNum = statusBar.querySelector(".statBar.stamina .num");
    if (stNum) animateNumber(stNum, _prevStamina, state.stamina);
  }
  _prevHp = state.hp; _prevStamina = state.stamina;
  renderStatusExtra();
}

// #34：圖示按鈕改用hover title顯示說明，避免畫面雜亂
const STATUS_HELP_TEXTS = [
  "☀️/🌙 目前是第幾天、白天或夜晚",
  "❤️ HP：歸零會死亡",
  "⚡ 體力：行動會消耗，耗盡會觸發過勞（HP下降、易遇敵）",
  "⭐ 等級：影響HP/體力等基礎數值上限",
  "🍎 食物：和飲水一樣，缺乏時會持續扣HP",
  "🔥 晶燼：用於強化據點與物資轉換",
  "📦 廢料：用於強化據點與製作",
  "🛡️ 防禦力：影響夜襲時的受損程度",
  "📖 日記：已觸發的事件/劇情紀錄",
  "🎒/🏪 背包/商店入口"
];
function showStatusHelp() {
  renderText(`<div class="subtitle">圖示說明</div><ul class="helpList">${STATUS_HELP_TEXTS.map(t => `<li>${t}</li>`).join("")}</ul>`);
  renderOptions([{ label: "返回", variant: "ghost", onClick: renderMain }]);
}

function renderStatusExtra() {
  const extra = document.getElementById("statusExtra");
  if (!extra) return;
  const r = state.resources;
  const c = state.resourceCaps || { food: 10, water: 10, scrap: 10 };
  const foodCap = getResourceCap(state, "food");
  const waterCap = getResourceCap(state, "water");
  extra.innerHTML = `
    <span class="dayBadge level" title="等級：影響HP/體力等基礎數值上限">⭐ Lv.${state.level}</span>
    ${bar("food", "🍎", r.food, foodCap, "食物：缺乏時持續扣HP", r.food <= 1)}
    ${bar("water", "💧", r.water, waterCap, "飲水：缺乏時持續扣HP", r.water <= 1)}
    <span class="dayBadge embers" title="晶燼：用於強化據點/物資轉換">🔥${state.currency.embers}</span>
    <button id="statusPeepsBtn" class="dayBadge" title="另一半QR同步：心情簽到/留言板/共用冰箱（只能連結一人）">💌 另一半</button>
    <button id="statusAchievementBtn" class="dayBadge" title="成就：${state.unlockedAchievements.length}個已解鎖">🏆 成就</button>
  `;
  const peepsBtn = document.getElementById("statusPeepsBtn");
  if (peepsBtn) peepsBtn.onclick = () => togglePanel("peeps", showPeepsPanel);
  const achievementBtn = document.getElementById("statusAchievementBtn");
  if (achievementBtn) achievementBtn.onclick = () => togglePanel("achievement", showAchievementPanel);
}

function toggleStatusExtra() {
  const extra = document.getElementById("statusExtra");
  if (extra) extra.classList.toggle("hidden");
}

// V2.0：血月狂潮倒數提示，詳見§6.3節
function threatWarningText() {
    if (isThreatDue(state)) return "\n📢 偵測到超大型靈能暴動！血月狂潮已籠罩此地，今夜必有一戰！";
  if (state.upcomingThreat) {
    const left = state.upcomingThreat.day - state.day;
    if (left > 0 && left <= THREAT_LEAD_DAYS) return `\n📢 偵測到超大型靈能暴動！血月狂潮將於${left}天後降臨！`;
  }
  return "";
}

// V2.0：倒數3天內，狀態列轉變為警示樣式(配合CSS動畫)
function isBloodMoonWarning() {
  if (isThreatDue(state)) return true;
  if (!state.upcomingThreat) return false;
  const left = state.upcomingThreat.day - state.day;
  return left > 0 && left <= THREAT_LEAD_DAYS;
}

// #26-2：事件結算統一加上隨機exp獎勵(effect本身沒設定時，補8~12隨機值)
function applyEventEffect(effect) {
  const eff = effect ? { ...effect } : {};
  if (!eff.exp) eff.exp = 8 + Math.floor(Math.random() * 5);
  applyEffect(eff);
  return eff;
}

// #26-2/26-4：過勞懲罰提示文案，隨機抽取
function overdrawFlavor(streak) {
  let text = "\n" + OVERDRAW_TEXTS[Math.floor(Math.random() * OVERDRAW_TEXTS.length)];
  if (streak && streak > 1) text += `（連續${streak}次過勞，HP損耗已累計${streak}）`;
  return text;
}

// ---------- 通用：效果格式化文字（食物/飲水/廢料等資源變化顯示）----------
const RESOURCE_ICONS = { food: "🍎", water: "💧", scrap: "📦", medicine: "💊" };
function formatEffect(effect) {
  if (!effect) return "";
  const parts = [];
  if (effect.hp) parts.push(`❤️${effect.hp > 0 ? "+" : ""}${effect.hp}`);
  if (effect.resources) {
    for (const k in effect.resources) {
      const v = effect.resources[k];
      if (!v) continue;
      const icon = RESOURCE_ICONS[k] || k;
      parts.push(`${icon}${v > 0 ? "+" : ""}${v}`);
    }
  }
  if (effect.baseDefense) parts.push(`🛡️${effect.baseDefense > 0 ? "+" : ""}${effect.baseDefense}`);
  if (effect.equipment_pool && state.lastGainedItemId) {
    if (typeof state.lastGainedItemId === "string" && state.lastGainedItemId.startsWith("inst_")) {
      const inst = getInstance(state, state.lastGainedItemId);
      if (inst) parts.push(`獲得 ${ITEMS[inst.baseItemId].icon} ${inst.name}`);
    } else {
      const item = ITEMS[state.lastGainedItemId];
      parts.push(`獲得 ${item.icon} ${item.name}`);
    }
  }
  if (effect.embers) parts.push(`🔥${effect.embers > 0 ? "+" : ""}${effect.embers}`);
  if (effect.skillPoint) parts.push(`⭐+${effect.skillPoint}`);
    if (effect.san) parts.push(`🧠SAN已恢復滿值`);
  if (effect.exp) parts.push(`✨經驗+${effect.exp}`);
  if (effect.furniture) {
    for (const itemId of effect.furniture) {
      const item = ITEMS[itemId];
      parts.push(`獲得 ${item.icon} ${item.name}`);
    }
  }
  if (effect.unlockAppearance) {
        parts.push(state.lastUnlockedAppearance ? `🎨 解鎖新造型！` : `🎨 造型已擁有，轉換為廢料`);
  }
  if (effect.unlockFloor) {
    parts.push(state.lastUnlockedFloor ? `🏠 解鎖新地板樣式！` : `🏠 樣式已擁有，轉換為廢料`);
  }
  return parts.length ? `\n${parts.join(" ")}` : "";
}

// #26-2：格式化效果文字內嵌版(資源/晶燼等)，用於單行顯示，例：❤️-8（不換行）
function formatEffectInline(effect) {
  const text = formatEffect(effect);
  return text ? text.replace(/^\n/, "").replace(/\n/g, " ") : "";
}

let _twFrame = null;
let _prevHp = null, _prevStamina = null;
function animateNumber(el, from, to, duration = 350) {
  const start = performance.now();
  const diff = to - from;
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    el.textContent = Math.round(from + diff * ease);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function renderText(text, opts = {}) {
  if (_twFrame) { cancelAnimationFrame(_twFrame); _twFrame = null; }
  const cls = ["storyCard"];
  if (opts.kind) cls.push(opts.kind);
  const el = document.createElement("div");
  el.className = cls.join(" ");
  screen.innerHTML = "";
  screen.appendChild(el);
  if (opts.kind === "event" && !text.includes("<")) {
    let i = 0;
    const step = () => {
      if (i <= text.length) { el.textContent = text.slice(0, i++) + (i <= text.length ? "█" : ""); _twFrame = requestAnimationFrame(step); }
      else { _twFrame = null; }
    };
    el.addEventListener("click", () => { if (_twFrame) { cancelAnimationFrame(_twFrame); _twFrame = null; el.textContent = text; } }, { once: true });
    _twFrame = requestAnimationFrame(step);
  } else {
    el.innerHTML = text;
  }
}

let turboInterval = null;
function clearTurbo() {
  if (turboInterval) { clearInterval(turboInterval); turboInterval = null; }
}

function renderOptions(options) {
  clearTurbo();
  const box = document.createElement("div");
  box.className = "optionBox";
  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "choiceBtn" + (opt.variant ? ` ${opt.variant}` : "") + (opt.disabled ? " disabled" : "");
    btn.innerHTML = opt.hint
      ? `<span>${opt.label}</span><span class="hint">${opt.hint}</span>`
      : opt.label;
    if (opt.turbo) {
      btn.classList.add("turbo");
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        clearTurbo();
        opt.onClick();
        turboInterval = setInterval(opt.onClick, 150);
      });
      ["pointerup", "pointerleave", "pointercancel"].forEach(ev => btn.addEventListener(ev, clearTurbo));
    } else {
      btn.onclick = opt.onClick;
    }
    box.appendChild(btn);
  });
  screen.appendChild(box);
}

// ---------- 同伴互動 ----------
const COMPANION_TASK_LABELS = { gather: "採集", guard: "守衛", care: "照護" };
const COMPANION_TASK_DESCS = {
    gather: "每階段自動執行一次採集，不消耗玩家體力",
    guard: "降低夜襲發生機率",
  care: "照護：休息時HP額外回復+5"
};
const COMPANION_TASK_LINES = {
    gather: ["（剛從附近採集回來，整理著戰利品）", "「附近的資源都被我清乾淨了。」", "「明天我再去看看其他地方。」"],
    guard: ["（警戒地注視著四周）", "「有什麼風聲都逃不過我的耳朵。」", "「夜襲？儘管來，我會守住這裡。」"],
  care: ["（仔細地幫你檢查傷口）", "「你要好好休息，別太勉強自己。」", "「我會一直在你身邊的。」"],
};
const COMPANION_TASK_ORDER = ["gather", "guard", "care"];

// #22-1：基地陳列格標籤(27.2牆面/桌面/地板slot)，Peeps風格命名
const BASE_SLOT_LABELS = { wall: "牆", table: "桌", floor: "地板" };
const CHARACTER_OPTIONS = [
    { id: "char_1", name: "短髮・藍衣" },
    { id: "char_2", name: "黑髮・綠衣" },
  { id: "char_3", name: "金髮・紫衣＋髮帶" },
  { id: "char_4", name: "白髮・紅衣＋墨鏡" },
];
// #25：溫室像素圖示，純CSS/SVG generative產出(無需額外圖檔)
function greenhouseSvg() {
  const glass = "#7ec8ff", glow = "#9ef08a", core = "#d6ffb8", base = "#444c54";
  const cells = {
    "2,1": glass, "3,1": glass, "4,1": glass, "5,1": glass,
    "1,2": glass, "6,2": glass, "1,3": glass, "6,3": glass, "1,4": glass, "6,4": glass,
    "3,2": glow, "4,2": glow, "3,3": core, "4,3": core, "3,4": glow, "4,4": glow,
    "2,5": base, "3,5": base, "4,5": base, "5,5": base,
    "1,6": base, "2,6": base, "5,6": base, "6,6": base,
  };
  let r = "";
  for (const k in cells) {
    const [x, y] = k.split(",").map(Number);
    r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${cells[k]}"/>`;
  }
  return `<svg viewBox="0 0 8 8" xmlns="http://www.w3.org/2000/svg">${r}</svg>`;
}

function cellsSvg(cells) {
  let r = "";
  for (const k in cells) {
    const [x, y] = k.split(",").map(Number);
    r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${cells[k]}"/>`;
  }
  return `<svg viewBox="0 0 8 8" xmlns="http://www.w3.org/2000/svg">${r}</svg>`;
}
const LOCATION_ICON_SVGS = {
  loc_school: () => cellsSvg({
    "0,0": "#5a3a20", "1,0": "#5a3a20", "2,0": "#5a3a20", "3,0": "#5a3a20", "4,0": "#5a3a20", "5,0": "#5a3a20", "6,0": "#5a3a20", "7,0": "#5a3a20",
    "0,1": "#5a3a20", "1,1": "#1c2a22", "2,1": "#1c2a22", "3,1": "#1c2a22", "4,1": "#1c2a22", "5,1": "#1c2a22", "6,1": "#1c2a22", "7,1": "#5a3a20",
    "0,2": "#5a3a20", "1,2": "#1c2a22", "2,2": "#d8d8d0", "3,2": "#d8d8d0", "4,2": "#1c2a22", "5,2": "#1c2a22", "6,2": "#1c2a22", "7,2": "#5a3a20",
    "0,3": "#5a3a20", "1,3": "#1c2a22", "2,3": "#1c2a22", "3,3": "#1c2a22", "4,3": "#1c2a22", "5,3": "#d8d8d0", "6,3": "#1c2a22", "7,3": "#5a3a20",
    "0,4": "#5a3a20", "1,4": "#1c2a22", "2,4": "#1c2a22", "3,4": "#d8d8d0", "4,4": "#d8d8d0", "5,4": "#1c2a22", "6,4": "#1c2a22", "7,4": "#5a3a20",
    "0,5": "#5a3a20", "1,5": "#1c2a22", "2,5": "#1c2a22", "3,5": "#1c2a22", "4,5": "#1c2a22", "5,5": "#1c2a22", "6,5": "#1c2a22", "7,5": "#5a3a20",
    "0,6": "#5a3a20", "1,6": "#1c2a22", "2,6": "#1c2a22", "3,6": "#1c2a22", "4,6": "#1c2a22", "5,6": "#1c2a22", "6,6": "#1c2a22", "7,6": "#5a3a20",
    "0,7": "#5a3a20", "1,7": "#5a3a20", "2,7": "#5a3a20", "3,7": "#5a3a20", "4,7": "#5a3a20", "5,7": "#5a3a20", "6,7": "#5a3a20", "7,7": "#5a3a20",
  }),
  loc_park: () => cellsSvg({
    "1,0": "#6a5a4a", "6,1": "#6a5a4a", "1,1": "#6a5a4a", "2,2": "#6a5a4a", "5,2": "#6a5a4a", "6,2": "#6a5a4a",
    "2,3": "#6a5a4a", "1,3": "#6a5a4a", "6,3": "#6a5a4a",
    "1,4": "#7a6a55", "6,4": "#7a6a55",
    "1,5": "#5a4a3a", "2,5": "#5a4a3a", "3,5": "#5a4a3a", "4,5": "#5a4a3a", "5,5": "#5a4a3a", "6,5": "#5a4a3a",
    "1,6": "#4a3a2c", "6,6": "#4a3a2c", "1,7": "#4a3a2c", "6,7": "#4a3a2c",
    "3,6": "#4a3a2c", "4,6": "#4a3a2c", "3,7": "#4a3a2c", "4,7": "#4a3a2c",
  }),
  loc_warehouse: () => cellsSvg({
    "0,0": "#3a4248", "1,0": "#3a4248", "2,0": "#3a4248", "3,0": "#3a4248", "4,0": "#3a4248", "5,0": "#3a4248", "6,0": "#3a4248", "7,0": "#3a4248",
    "0,1": "#4a5258", "1,1": "#4a5258", "2,1": "#4a5258", "3,1": "#4a5258", "4,1": "#4a5258", "5,1": "#4a5258", "6,1": "#4a5258", "7,1": "#4a5258",
    "0,2": "#3a4248", "1,2": "#3a4248", "2,2": "#3a4248", "3,2": "#3a4248", "4,2": "#3a4248", "5,2": "#3a4248", "6,2": "#3a4248", "7,2": "#3a4248",
    "0,3": "#c0392b", "1,3": "#c0392b", "2,3": "#3a4248", "3,3": "#3a4248", "4,3": "#c0392b", "5,3": "#c0392b", "6,3": "#3a4248", "7,3": "#3a4248",
    "0,4": "#4a5258", "1,4": "#4a5258", "2,4": "#4a5258", "3,4": "#4a5258", "4,4": "#4a5258", "5,4": "#4a5258", "6,4": "#4a5258", "7,4": "#4a5258",
    "0,5": "#3a4248", "1,5": "#3a4248", "2,5": "#3a4248", "3,5": "#3a4248", "4,5": "#3a4248", "5,5": "#3a4248", "6,5": "#3a4248", "7,5": "#3a4248",
    "0,6": "#4a5258", "1,6": "#4a5258", "2,6": "#4a5258", "3,6": "#4a5258", "4,6": "#4a5258", "5,6": "#4a5258", "6,6": "#4a5258", "7,6": "#4a5258",
    "0,7": "#23282c", "1,7": "#23282c", "2,7": "#23282c", "3,7": "#23282c", "4,7": "#23282c", "5,7": "#23282c", "6,7": "#23282c", "7,7": "#23282c",
  }),
};
function locationIconSvg(loc) {
  const fn = LOCATION_ICON_SVGS[loc.id];
  return fn ? fn() : pixelIconSvg(loc.id, "location");
}

// #25：設施座標分布表(各設施固定顯示在小屋畫布的位置)(Room Canvas)
// 百分比座標對應畫布內位置，與牆/桌/地板等家具陳列格不衝突，Peeps風格俯視配置
const FACILITY_SPOTS = {
  greenhouse: { left: "18%", top: "50%" },   // 左側：靠近溫室格局
  command: { left: "84%", top: "26%" },      // 右上：指揮核心
  workshop: { left: "84%", top: "50%" },      // 右中：工作坊
  radar: { left: "84%", top: "74%" },         // 右下：雷達站
};
// #27：地板樣式選項表，點擊地板/探索門時可切換樣式
const FLOOR_STYLES = {
    wood: { name: "木紋地板", cls: "floor-wood" },
  tile: { name: "磁磚地板", cls: "floor-tile" },
  rug: { name: "地毯", cls: "floor-rug" },
};
// 2026-06-21（remove_bg_tool.py全部完成）：批次4怪物4隻全部完成，邊緣/alpha數值核對乾淨。
const ENEMY_ASSETS = {
  enemy_walker_weak: 1, enemy_walker_armed: 1, enemy_walker_brute: 1, enemy_cyborg_nemesis: 1,
};
// 2026-06-21：全部改用remove_bg_tool.py處理（HSV去背+INTER_NEAREST縮圖），逐項核對邊緣顏色非污染色才登記。
const ISO_ASSETS = {
  furn_dreamcatcher: 1, furn_sandbags: 1,
  furn_sleeping_bag: 1, furn_bench: 1, furn_sofa: 1, furn_radio: 1,
  furn_greenhouse: 1, furn_fridge: 1, furn_whiteboard: 1, furn_jelly_lamp: 1,
  furn_vines: 1, furn_toolbox: 1,
  furn_appearance_mirror: 1, furn_photo_frame: 1, furn_turret: 1, furn_flag: 1,
  furn_egg_nest: 1, furn_diary: 1, furn_potted_plant: 1, furn_mirror: 1, furn_generator: 1,
  rug_plain: 1, rug_woven: 1, rug_round: 1,
  furn_couple_wall: 1,
};
function isoIconHtml(itemId, fallbackCategory) {
  const src = resolveAsset("furniture", itemId);
  if (src) return `<img class="pixelImg isoImg" src="${src}" alt="${itemId}">`;
  return pixelIconSvg(itemId, fallbackCategory);
}
const ROOM_H_PX = 360, WALL_PX = 45, ICON_PX = 40;
const GRID_FLOOR_ROW_MIN = 0, GRID_FLOOR_ROW_MAX = 5;
const GRID_COL_MIN = 0, GRID_COL_MAX = 8;
const WALL_ICON_OFFSET = (WALL_PX - ICON_PX) / 2; // 2.5px
// 等距投影：gx每+1往右下偏移、gy每+1往左下偏移，畫面上呈現菱形地板，呼應assets/iso/*.png的等角視角
// left% = ISO_ORIGIN_LEFT + (gx-gy)*ISO_STEP_X；top px = WALL_PX + (gx+gy)*ISO_STEP_Y
// ISO_STEP_Y=17（而非更大的值）是為了讓最深的格子(gx+gy=13)+圖示高度仍落在牆面帶以內，
// 避免角色/家具視覺上「站到牆上」；CSS的.roomFloorDiamond clip-path四個角座標需與此同步換算
const ISO_ORIGIN_LEFT = 40, ISO_STEP_X = 7, ISO_STEP_Y = 17;
function gridPos(x, y) {
  return {
    left: (ISO_ORIGIN_LEFT + (x - y) * ISO_STEP_X).toFixed(1) + "%",
    top: (WALL_PX + (x + y) * ISO_STEP_Y) + "px"
  };
}
function labelCls(y) {
  return y === GRID_FLOOR_ROW_MAX ? " lbl-above" : "";
}
// depth取gx+gy（等距視角的前後深度），值越大代表越靠近畫面前方，疊在上層
function cellZ(depth, roleOffset) {
  return Math.max(0, depth) * 10 + 1 + (roleOffset || 0);
}
// 等距座標的反推：由left%/top px回推最接近的(gx,gy)整數格，供拖曳/點擊/路徑搜尋共用
function pixelToGrid(leftPct, topPx) {
  const diff = (leftPct - ISO_ORIGIN_LEFT) / ISO_STEP_X;
  const sum = (topPx - WALL_PX) / ISO_STEP_Y;
  let gx = Math.round((diff + sum) / 2);
  let gy = Math.round((sum - diff) / 2);
  gx = Math.max(GRID_COL_MIN, Math.min(GRID_COL_MAX, gx));
  gy = Math.max(GRID_FLOOR_ROW_MIN, Math.min(GRID_FLOOR_ROW_MAX, gy));
  return { gx, gy };
}
function posToGrid(pos) {
  return pixelToGrid(parseFloat(pos.left), parseFloat(pos.top));
}
function tileKey(gx, gy) { return gx + "," + gy; }
// v166：free-form佈置改版——table/floor/rug類家具不再有固定slot名稱/預設位置表，
// 改直接讀state.placedFurniture陣列裡每項自帶的gx/gy。excludeIndex可傳數字(排除佈置中正在拖曳的那一件)
// 或字串"companion"(排除同伴自己目前位置)，沿用原本excludeKey的呼叫慣例
function getOccupiedTileKeys(state, excludeIndex) {
  const occupied = new Set();
  if (state.companion && excludeIndex !== "companion") {
    const c = state.companionPos || gridPos(6, 2);
    const g = posToGrid(c);
    occupied.add(tileKey(g.gx, g.gy));
  }
  (state.placedFurniture || []).forEach((f, idx) => {
    if (idx === excludeIndex) return;
    occupied.add(tileKey(f.gx, f.gy));
  });
  return occupied;
}
function findReachablePos(start, target, occupied) {
  if (start.gx === target.gx && start.gy === target.gy) return null;
  const visited = new Set([tileKey(start.gx, start.gy)]);
  const parent = new Map();
  const queue = [start];
  let best = null, bestDist = Infinity;
  const buildPath = (node) => {
    const path = [];
    let cur = node;
    while (cur) {
      path.unshift({ gx: cur.gx, gy: cur.gy });
      cur = parent.get(tileKey(cur.gx, cur.gy));
    }
    return path;
  };
  while (queue.length) {
    const cur = queue.shift();
    if (cur.gx === target.gx && cur.gy === target.gy) return { gx: cur.gx, gy: cur.gy, path: buildPath(cur) };
    const d = Math.abs(cur.gx - target.gx) + Math.abs(cur.gy - target.gy);
    if (d < bestDist) { bestDist = d; best = cur; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.gx + dx, ny = cur.gy + dy;
      if (nx < GRID_COL_MIN || nx > GRID_COL_MAX || ny < GRID_FLOOR_ROW_MIN || ny > GRID_FLOOR_ROW_MAX) continue;
      const k = tileKey(nx, ny);
      if (visited.has(k) || occupied.has(k)) continue;
      visited.add(k);
      parent.set(k, cur);
      queue.push({ gx: nx, gy: ny });
    }
  }
  if (!best || (best.gx === start.gx && best.gy === start.gy)) return null;
  return { gx: best.gx, gy: best.gy, path: buildPath(best) };
}
function animateWalk(el, path, onStep) {
  el.classList.add("walking");
  let i = 0;
  const step = () => {
    if (i >= path.length) { el.classList.remove("walking"); return; }
    const { gx, gy } = path[i];
    const p = gridPos(gx, gy);
    el.style.left = p.left;
    el.style.top = p.top;
    el.style.zIndex = cellZ(gx + gy, onStep ? onStep.zRole : 4);
    const label = el.querySelector(".homeLabel");
    if (label) label.classList.toggle("lbl-above", gy === GRID_FLOOR_ROW_MAX);
    if (onStep && onStep.fn) onStep.fn(p, gx, gy, i === path.length - 1);
    i++;
    setTimeout(step, 220);
  };
  step();
}
function furnitureCellId(index) { return "homeFurn" + index + "Cell"; }
// v179：rare以上家具加一層淡微光，呼應使用者期望，common/uncommon維持原樣避免畫面太吵
function furnitureGlowClass(item) {
  if (!item || !item.rarity) return "";
  if (item.rarity === "rare") return " furn-glow-rare";
  if (item.rarity === "epic") return " furn-glow-epic";
  if (item.rarity === "legendary") return " furn-glow-legendary";
  return "";
}
// v166：free-form佈置改版——原本renderTableSlotCell/renderFloorSlotCell/renderRugSlotCell三個幾乎一樣的
// 渲染函式(分別對應table/floor/rug三種固定slot)收斂成一個，依item.slot做視覺樣式分支(prop-small桌墊/rugDeco鋪底)，
// 位置直接讀state.placedFurniture[index]的gx/gy(不再有固定預設位置表)
function renderPlacedFurnitureCell(state, index) {
  const placed = state.placedFurniture[index];
  const item = ITEMS[placed.itemId];
  if (!item) return ""; // 防禦：理論上不會發生的未知itemId
  const itemId = placed.itemId;
  const pos = gridPos(placed.gx, placed.gy);
  const row = placed.gy;
  const isTable = item.slot === "table";
  const isRug = item.slot === "rug";
  const used = (itemId === "furn_radio" && state.flags.radioUsedDay === state.day) || (itemId === "furn_egg_nest" && state.flags.eggNestCheckedDay === state.day);
  const hint = state.homePlacementMode ? "（佈置模式：點擊可拖曳移動）"
    : itemId === "furn_diary" ? "（點擊查看日記）"
    : itemId === "furn_radio" ? "（點擊聽廣播，每日限一次）"
    : itemId === "furn_egg_nest" ? "（點擊查看鳥蛋，每日限一次）"
    : itemId === "furn_sleeping_bag" ? "（點擊休息）"
    : "（點擊翻找）";
  const cls = "roomCell furniturePlaceable" + (isTable ? " prop-small" : "") + (isRug ? " rugDeco" : "") + labelCls(row) + (used ? " furn-used" : "") + furnitureGlowClass(item);
  const matHtml = isTable ? `<div class="propMat"></div>` : "";
  return `<div class="${cls}" id="${furnitureCellId(index)}" style="left:${pos.left};top:${pos.top};z-index:${cellZ(placed.gx + placed.gy, isRug ? -1 : 0)}" title="${item.name}${item.desc ? "：" + item.desc : ""}${hint}">${matHtml}<div class="icon">${isoIconHtml(itemId, "furniture")}</div><div class="homeLabel${labelCls(row)}">${used ? "今日已使用" : item.name}</div></div>`;
}
function homeSceneHtml(state) {
  const items = [];
  const defaultPos = gridPos(5, 5);
  const pos = state.homePos || { left: defaultPos.left, top: defaultPos.top };
  const pg = posToGrid(pos), pRow = pg.gy;
  items.push(`<div class="roomCell player" id="homePlayerCell" style="left:${pos.left};top:${pos.top};z-index:${cellZ(pg.gx + pg.gy, 4)}" title="拖曳可移動位置"><div class="icon">${characterSpriteHtml("character", state.appearance || "char_1", state.homeFacing || "front", "玩家")}</div><div class="homeLabel${labelCls(pRow)}">${state.playerName || "旅人"}</div></div>`);
  if (state.companion) {
    const task = COMPANION_TASK_LABELS[state.companionTask] || state.companionTask || "";
    // #22-2：同伴來源差異化文案，依劇情分支顯示不同描述
        const origin = state.flags && state.flags.companion ? "（在末日中與你相遇，選擇留在你身邊）" : "";
    const cPos = state.companionPos || gridPos(6, 2);
    const cg = posToGrid(cPos), cRow = cg.gy;
        items.push(`<div class="roomCell companion${state.companionTask ? ' task-active' : ''}" id="homeCompanionCell" style="left:${cPos.left};top:${cPos.top};z-index:${cellZ(cg.gx + cg.gy, 2)}" title="同伴：${state.companionName || "同伴"}（目前任務：${task}）${origin}"><div class="icon" style="position:relative">${state.companionTask ? '<span class="taskBadge">' + (COMPANION_TASK_LABELS[state.companionTask] || state.companionTask) + '</span>' : ''}${characterSpriteHtml("companion", "default", state.companionFacing || "front", "同伴")}</div><div class="homeLabel${labelCls(cRow)}">${state.companionName || "同伴"}${task ? `（${task}）` : ""}</div></div>`);
    // v122：同伴互動氣泡選單(7.6-C)，取代全螢幕文字流程
    if (companionBubbleOpen) {
      const cLeftPct = parseFloat(cPos.left) || 50;
      const cEdgeCls = cLeftPct <= 20 ? " edge-left" : cLeftPct >= 80 ? " edge-right" : "";
      items.push(`<div class="companionBubble${cEdgeCls}" style="left:${cPos.left};top:${cPos.top}">
        ${companionBubbleLine ? `<div class="bubbleLine">${companionBubbleLine}</div>` : ""}
        <div class="bubbleRow">
          <button class="bubbleBtn" id="companionBubbleChat" title="聊天">💬</button>
          <button class="bubbleBtn" id="companionBubbleAssign" title="指派（目前：${task}，點擊切換）">📋${task}</button>
          <button class="bubbleBtn" id="companionBubbleLove" title="互動（每日限一次）">❤️</button>
        </div>
            </div>`);
    }
  }
  // 小隊同伴（艾莉/阿卡）小屋視覺化，2026-06-20新增——已招募(非locked)且非雷恩(雷恩走state.companion那條既有路徑)時顯示為roomCell
  const SQUAD_POS = { "艾莉": gridPos(1, 2), "阿卡": gridPos(8, 2) };
  const SQUAD_COLOR = { "艾莉": "#6fae73", "阿卡": "#c0392b" };
  if (state.companions) {
    Object.keys(SQUAD_POS).forEach(sName => {
      const sStatus = state.companions[sName];
      if (!sStatus || sStatus === "locked") return;
      const sPos = SQUAD_POS[sName];
      const sg = posToGrid(sPos), sRow = sg.gy;
      const sTaskLabel = TASK_LABELS[sStatus] || sStatus;
      const sColor = SQUAD_COLOR[sName] || "#8a9099";
      items.push(`<div class="roomCell companion squadCompanion${sStatus !== "standby" ? " task-active" : ""}" id="squadCell_${sName}" style="left:${sPos.left};top:${sPos.top};z-index:${cellZ(sg.gx + sg.gy, 2)};--squadColor:${sColor}" title="${COMPANION_NAME_LABELS[sName] || sName}：${sTaskLabel}"><div class="icon" style="position:relative">${sStatus !== "standby" ? `<span class="taskBadge">${sTaskLabel}</span>` : ""}<img class="pixelImg" src="${resolveAsset("companion", "default")}" alt="${sName}"></div><div class="homeLabel${labelCls(sRow)}">${sName}（${sTaskLabel}）</div></div>`);
      if (squadBubbleOpen === sName) {
        const taskOptions = ["standby", ...(COMPANION_TASKS[sName] || [])];
        const nextTask = taskOptions[(taskOptions.indexOf(sStatus) + 1) % taskOptions.length];
        const sLeftPct = parseFloat(sPos.left) || 50;
        const edgeCls = sLeftPct <= 20 ? " edge-left" : sLeftPct >= 80 ? " edge-right" : "";
        items.push(`<div class="companionBubble${edgeCls}" style="left:${sPos.left};top:${sPos.top}">
          ${squadBubbleLine ? `<div class="bubbleLine">${squadBubbleLine}</div>` : ""}
          <div class="bubbleRow">
            <button class="bubbleBtn" id="squadBubbleChat_${sName}" title="聊天">💬</button>
            <button class="bubbleBtn" id="squadBubbleAssign_${sName}" title="指派：${TASK_LABELS[nextTask]}">📋${TASK_LABELS[nextTask]}</button>
          </div>
        </div>`);
      }
    });
  }

  // 不請自來的夥伴(流浪狗)小屋視覺化，2026-07-04新增——固定位置、原地搖擺動畫(不像人類同伴會走動指派任務)，
  // 呼應使用者反饋「這種夥伴應該要可以在小屋內、跟人物一樣可以互動」
  if (state.flags && state.flags.dog_companion) {
    const dPos = gridPos(2, 6);
    const dg = posToGrid(dPos), dRow = dg.gy;
    items.push(`<div class="roomCell dogCompanion" id="homeDogCell" style="left:${dPos.left};top:${dPos.top};z-index:${cellZ(dg.gx + dg.gy, 1)}" title="小狗（點擊互動）"><div class="icon idleSway">🐕</div><div class="homeLabel${labelCls(dRow)}">小狗</div></div>`);
    if (dogBubbleOpen) {
      const dLeftPct = parseFloat(dPos.left) || 50;
      const dEdgeCls = dLeftPct <= 20 ? " edge-left" : dLeftPct >= 80 ? " edge-right" : "";
      items.push(`<div class="companionBubble${dEdgeCls}" style="left:${dPos.left};top:${dPos.top}">
        ${dogBubbleLine ? `<div class="bubbleLine">${dogBubbleLine}</div>` : ""}
        <div class="bubbleRow">
          <button class="bubbleBtn" id="dogBubblePet" title="摸摸牠（每日限一次）">🐾</button>
        </div>
      </div>`);
    }
  }

  const wallItemId = state.baseSlots && state.baseSlots.wall;
  if (wallItemId) {
    const item = ITEMS[wallItemId];
    const isMirror = wallItemId === "furn_appearance_mirror";
    const wallCellId = isMirror ? "homeMirrorCell" : (wallItemId === "furn_couple_wall" ? "homeWallCell" : "");
    items.push(`<div class="roomCell wallDeco${isMirror ? " clickable" : wallItemId === "furn_couple_wall" ? " clickable" : ""}${furnitureGlowClass(item)}" id="${wallCellId}" style="left:78%;top:${WALL_ICON_OFFSET}px;z-index:${cellZ(0)}" title="${item.name}${item.desc ? "：" + item.desc : ""}"><div class="icon">${isoIconHtml(wallItemId, "furniture")}</div><div class="homeLabel">${item.name}</div></div>`);
  }
  const wall2ItemId = state.baseSlots && state.baseSlots.wall2;
  if (wall2ItemId) {
    const item2 = ITEMS[wall2ItemId];
    const isMirror2 = wall2ItemId === "furn_appearance_mirror";
    items.push(`<div class="roomCell wallDeco${isMirror2 ? " clickable" : ""}${furnitureGlowClass(item2)}" id="${isMirror2 ? "homeMirror2Cell" : "homeWall2Cell"}" style="left:22%;top:${WALL_ICON_OFFSET}px;z-index:${cellZ(0)}" title="${item2.name}${item2.desc ? "：" + item2.desc : ""}"><div class="icon">${isoIconHtml(wall2ItemId, "furniture")}</div><div class="homeLabel">${item2.name}</div></div>`);
  }
  // v166：free-form佈置——table/floor/rug類家具不再有固定slot名稱，直接遍歷state.placedFurniture陣列渲染
  (state.placedFurniture || []).forEach((placed, index) => {
    items.push(renderPlacedFurnitureCell(state, index));
  });
  const floorStyle = FLOOR_STYLES[state.roomFloor] || FLOOR_STYLES.wood;
  // V2.0：窗戶外觀依晝夜/血月狀態切換，呼應威脅倒數的視覺提示
  // v108：依state.phase(白天/夜晚)切換窗戶樣式，血月期間額外套用警示外觀
const windowCls = `homeWindow ${state.phase === "night" ? "is-night" : "is-day"}${isThreatDue(state) ? " is-bloodmoon" : ""}`;
  items.unshift(`<div class="wallBand wallBandTop"><div class="${windowCls}"><div class="homeWindowFrame"></div></div></div><div class="wallBand wallBandBottom"></div>`);
  // v164：點燈開關——純氛圍互動，跟state.phase的被動變暗濾鏡是兩件事，玩家可隨時主動關燈
  items.push(`<button class="lightSwitch${state.homeLightOff ? " is-off" : " is-on"}" id="homeLightSwitch" style="right:14px;top:${WALL_ICON_OFFSET}px;z-index:${cellZ(0) + 1}" title="${state.homeLightOff ? "點擊開燈" : "點擊關燈"}">${state.homeLightOff ? "🌑" : "💡"}</button>`);
  // 2026-07-02：門改為純CSS繪製（跟homeWindow同一套手法），不再用等角透視PNG貼進平面牆帶，避免黑邊/違和
  items.push(`<div class="roomCell doorCell doorExplore clickable" id="homeExploreDoorCell" style="left:50%;top:${WALL_ICON_OFFSET}px;z-index:${cellZ(0)}" title="探索門（點擊探索）"><div class="icon"><div class="doorSeam"></div></div><div class="homeLabel">探索</div></div>`);
  items.push(`<div class="roomCell doorCell doorGather clickable" id="homeGatherDoorCell" style="left:50%;top:${ROOM_H_PX - WALL_PX + WALL_ICON_OFFSET}px;z-index:${cellZ(GRID_FLOOR_ROW_MAX)}" title="採集門（點擊採集）"><div class="icon"><div class="doorSeam"></div></div><div class="homeLabel lbl-above">採集</div></div>`);
  // V2.0 7.6：Lv/晶燼/食物等資訊併入statusExtra，避免畫面重複顯示
  // v95：背包/商店面板入口統一改用頂部按鈕(invBtn/shopBtn)，避免重複
  // 2026-06-21：peepsBtn(👥)已移除，另一半QR同步面板改走「⋯」展開列的statusPeepsBtn(💌)，小屋頭像旁「+邀請隊友」改開showCompanionPanel(小隊夥伴)
  // 任務系統：低調的目標提示，不顯示「第N/M項」這種計數，只顯示「現在要做的這一件事」
  const activeMainQuest = state.questProgress.activeMain ? QUESTS[state.questProgress.activeMain] : null;
  const questTargetText = activeMainQuest ? `🎯 目前目標：${activeMainQuest.title}` : "🎯 主線已完成，支線等著你";
  const questTargetRow = `<div class="homePillRow"><button class="homePill" id="homeQuestTargetPill" title="${activeMainQuest ? activeMainQuest.desc : "點擊查看支線任務"}">${questTargetText}</button></div>`;
  const tabPills = `<div class="homePillRow homeTabPills" id="homeTabPillsRow">
    <button class="homePill homeTabBtn" id="homeTabSkill">⭐ 技能</button>
    <button class="homePill homeTabBtn${state.homePlacementMode ? " active" : ""}" id="homeTabPlacement">${state.homePlacementMode ? "結束佈置" : "🛋️ 佈置家具"}</button>
    <button class="homePill" id="homeComfortPill" title="居住舒適度">🛋️ 舒適 ${getComfortLevel(state)}（${getComfortLabel(getComfortLevel(state))}）</button>
    <button class="homePill homeTabBtn" id="homeTabYard">🌾 庭院</button>
    <button class="homePill homeTabBtn" id="homeTabPen">🐑 獸欄</button>
  </div>`;
const avatarRow = `<div class="homeAvatarRow">
    <div class="homeAvatar">
      <div class="homeAvatarImg"><img class="pixelImg" src="${resolveAsset("character", state.appearance || "char_1")}" alt="玩家"></div>
      <div class="homeAvatarName">${state.playerName || "旅人"}</div>
      <div class="homeAvatarBar"><div class="homeAvatarBarFill" style="width:${Math.max(0, Math.min(100, state.stamina / state.staminaMax * 100))}%"></div></div>
    </div>
    ${state.companion ? `<div class="homeAvatar">
      <div class="homeAvatarImg"><img class="pixelImg" src="${resolveAsset("companion", "default")}" alt="同伴"></div>
      <div class="homeAvatarName">${state.companionName || "同伴"}</div>
      <!-- v103：homeAvatarBar需要width:100%搭配相對定位的父層容器，才能正確顯示同伴體力條比例 -->
      <div class="homeAvatarTask">${COMPANION_TASK_LABELS[state.companionTask] || ""}</div>
    </div>` : `<button class="homeAvatarInvite" id="homeTabPeepsInvite" title="查看小隊夥伴招募狀態">+ 邀請隊友</button>`}
  </div>`;
  const nightCls = state.phase !== "day" ? " night" : "";
  const lightsOffCls = state.homeLightOff ? " lightsOff" : "";
  const windowGlow = state.homeLightOff ? `<div class="windowGlow"></div>` : "";
  return `<div class="homeScene">${avatarRow}${questTargetRow}${tabPills}<div class="roomCanvas ${floorStyle.cls}${state.homePlacementMode ? " placementMode" : ""}${nightCls}${lightsOffCls}" id="roomCanvas">${items.join("")}${windowGlow}</div></div>`;
}
function bindHomeTabPills() {
  const map = {
    homeTabSkill: () => togglePanel("skill", showSkillPanel),
    homeTabPeepsInvite: showCompanionPanel,
    homeComfortPill: () => togglePanel("comfort", showComfortDetail),
    homeQuestTargetPill: () => togglePanel("quest", () => showQuestPanel()),
    homeTabYard: renderYardScene,
    homeTabPen: renderPenScene
  };
  for (const id in map) {
    const el = document.getElementById(id);
    if (el) el.onclick = map[id];
  }
}

// ---------- 農場區/獸欄 戶外場景（V2星露谷式，2026-07-03，見規格文件/農場區_設計規格.md/養殖區_設計規格.md） ----------
// 重用小屋室內同一套「點擊→走路→抵達」管線(findReachablePos/animateWalk/snapToGridFromClientXY)，
// 故沿用等角gx/gy網格與共用的GRID_COL_MAX/GRID_FLOOR_ROW_MAX邊界，不另建平面座標系統
let outdoorScene = null, outdoorPlayerPos = null, outdoorWalkLock = false;
function outdoorSpawnPos(scene) {
  return scene === "pen" ? gridPos(0, 2) : gridPos(0, 3);
}
function outdoorPlayerCellHtml(scene) {
  const pos = outdoorPlayerPos || outdoorSpawnPos(scene);
  const pg = posToGrid(pos);
  return `<div class="roomCell player" id="outdoorPlayerCell" style="left:${pos.left};top:${pos.top};z-index:${cellZ(pg.gx + pg.gy, 4)}"><div class="icon">${characterSpriteHtml("character", state.appearance || "char_1", state.homeFacing || "front", "玩家")}</div><div class="homeLabel">${state.playerName || "旅人"}</div></div>`;
}
// 點擊地塊/欄位不再直接跳選單，先讓玩家角色走過去，抵達後才開互動面板（呼應「星露谷式」要有實際走位互動）；
// 地塊本身視為不可站立的障礙物，findReachablePos找不到剛好落在目標格時，會自動退而求其次走到最近的可站格
function bindOutdoorWalk(canvas, scene, layout, onArrive) {
  canvas.onclick = (e) => {
    if (outdoorWalkLock) return;
    const el = document.getElementById("outdoorPlayerCell");
    if (!el) return;
    const snapped = snapToGridFromClientXY(canvas, e.clientX, e.clientY);
    const clickedGrid = posToGrid(snapped);
    const targetDef = layout.find(p => p.gx === clickedGrid.gx && p.gy === clickedGrid.gy);
    const occupied = new Set(layout.map(p => tileKey(p.gx, p.gy)));
    const start = posToGrid(outdoorPlayerPos || outdoorSpawnPos(scene));
    const dest = findReachablePos(start, clickedGrid, occupied);
    if (!dest) {
      if (targetDef && onArrive) onArrive(targetDef.id); // 已經站在旁邊，直接觸發互動
      return;
    }
    outdoorWalkLock = true;
    let prevG = start;
    animateWalk(el, dest.path, { zRole: 4, fn: (p, gx, gy, isLast) => {
      const facing = computeFacing(gx - prevG.gx, gy - prevG.gy);
      if (facing) { state.homeFacing = facing; applyFacingToCell(el, "character", state.appearance || "char_1", facing); }
      prevG = { gx, gy };
      outdoorPlayerPos = p;
      if (isLast) {
        outdoorWalkLock = false;
        if (targetDef && onArrive) onArrive(targetDef.id);
      }
    } });
  };
}
// 動作/收成成功時的粒子回饋：向上漂浮並淡出，比冷冰冰的文字結算更有回饋感。呼叫時機是renderXxxScene()之後，
// 確保目標格子的DOM已經重新畫出來
function spawnFloatParticle(cellId, emoji) {
  const cell = document.getElementById(cellId);
  if (!cell) return;
  const p = document.createElement("div");
  p.className = "floatParticle";
  p.textContent = emoji;
  cell.appendChild(p);
  setTimeout(() => p.remove(), 900);
}

// ---------- 農場區/庭院場景 ----------
const FARM_STAGE_ICONS = ["🌱", "🌿", "🌾"];
function yardPlotCellHtml(state, plotDef) {
  const plot = state.farm.plots[plotDef.id];
  const pos = gridPos(plotDef.gx, plotDef.gy);
  const z = cellZ(plotDef.gx + plotDef.gy);
  // V3(2026-07-04)：拿掉常駐文字牌(alwaysLabel)，狀態改由地塊本身視覺傳達，說明文字收進title/hover
  // 鎖頭圖示也拿掉(Gemini規格明確要求)，改用🥀(荒廢/未整地的意象)佔位，等美術素材到位再替換
  if (!plot.unlocked) {
    const cost = farmPlotUnlockCost(state);
    return `<div class="roomCell farmPlot locked" id="farmPlot_${plotDef.id}" style="left:${pos.left};top:${pos.top};z-index:${z}" title="解鎖地塊：${cost}📦"><div class="icon">🥀</div><div class="homeLabel">解鎖 ${cost}📦</div></div>`;
  }
  if (!plot.crop) {
    return `<div class="roomCell farmPlot empty" id="farmPlot_${plotDef.id}" style="left:${pos.left};top:${pos.top};z-index:${z}" title="點擊種植"><div class="icon">🟫</div><div class="homeLabel">空地（點種植）</div></div>`;
  }
  const stage = getCropStage(state, plot);
  const icon = stage.mature ? "✅" : (FARM_STAGE_ICONS[stage.stageIdx] || "🌱");
  const label = stage.mature ? `${stage.crop.name}（可收成）` : `${stage.crop.name} ${stage.stageIdx + 1}/${stage.crop.stages}`;
  const stateCls = stage.mature ? " mature" : " growing";
  return `<div class="roomCell farmPlot${stateCls}" id="farmPlot_${plotDef.id}" style="left:${pos.left};top:${pos.top};z-index:${z}" title="${label}"><div class="icon">${icon}</div><div class="homeLabel">${label}</div></div>`;
}
// 2026-07-03（使用者反饋「庭院應該更多些裝飾」）：純視覺、無互動的擺設，位置刻意避開FARM_PLOT_LAYOUT
// 的地塊座標，不佔用/不影響任何遊戲邏輯，只是讓庭院看起來不再只有光禿禿的地塊
const YARD_DECOR = [
  { gx: 0, gy: 0, icon: "🌻", label: "向日葵" },
  { gx: 6, gy: 0, icon: "🍂", label: "落葉堆" },
  { gx: 1, gy: 6, icon: "🌿", label: "野草" },
  { gx: 10, gy: 6, icon: "🦋", label: "蝴蝶" },
];
function yardDecorCellHtml(d) {
  const pos = gridPos(d.gx, d.gy);
  const z = cellZ(d.gx + d.gy);
  return `<div class="roomCell yardDecor" style="left:${pos.left};top:${pos.top};z-index:${z}"><div class="icon">${d.icon}</div><div class="homeLabel">${d.label}</div></div>`;
}
function yardSceneHtml(state) {
  if (outdoorScene !== "yard") { outdoorScene = "yard"; outdoorPlayerPos = null; }
  const items = YARD_DECOR.map(yardDecorCellHtml).concat(FARM_PLOT_LAYOUT.map(p => yardPlotCellHtml(state, p)));
  items.push(outdoorPlayerCellHtml("yard"));
  // 庭院是室外土地，不沿用state.roomFloor(小屋室內地板樣式)，改用專屬的ground-farmland紋理
  return `<div class="homeScene"><div class="homePillRow homeTabPills"><button class="homePill" id="yardBackBtn">← 返回小屋</button></div><div class="roomCanvas ground-farmland" id="yardCanvas">${items.join("")}</div></div>`;
}
function renderYardScene() {
  renderStatusBar();
  renderText(yardSceneHtml(state));
  const backBtn = document.getElementById("yardBackBtn");
  if (backBtn) backBtn.onclick = renderMain;
  const canvas = document.getElementById("yardCanvas");
  if (canvas) bindOutdoorWalk(canvas, "yard", FARM_PLOT_LAYOUT, showFarmPlotPanel);
}
function showPlantSeedPanel(plotId) {
  renderStatusBar();
  const seedEntries = (state.inventory || []).filter(i => { const item = ITEMS[i.itemId]; return item && item.type === "seed" && i.qty > 0; });
  renderText(`<div class="subtitle">選擇要種植的種子</div>${seedEntries.length ? "" : `<div class="hint">背包裡沒有種子，先去商城購買或探索取得。</div>`}`);
  const opts = seedEntries.map(i => {
    const item = ITEMS[i.itemId];
    return {
      label: `${item.icon} ${item.name}`,
      hint: `x${i.qty}`,
      onClick: () => {
        const result = plantSeed(state, plotId, i.itemId);
        if (result.ok) saveGame();
        renderYardScene();
      }
    };
  });
  opts.push({ label: "返回", variant: "ghost", onClick: renderYardScene });
  renderOptions(opts);
}
// 玩家走到地塊旁後才會呼叫這個面板；依地塊狀態分派到對應互動（解鎖/種植/澆水/收成）
function showFarmPlotPanel(plotId) {
  renderStatusBar();
  const plot = state.farm.plots[plotId];
  if (!plot.unlocked) {
    const cost = farmPlotUnlockCost(state);
    renderText(`<div class="subtitle">解鎖地塊</div><div class="hint">花費 ${cost}📦 開墾這塊地。</div>`);
    renderOptions([
      { label: `解鎖（${cost}📦）`, disabled: (state.resources.scrap || 0) < cost, onClick: () => {
        const result = unlockFarmPlot(state, plotId);
        if (result.ok) { runQuestCheck(); saveGame(); renderStatusBar(); }
        renderYardScene();
      } },
      { label: "返回", variant: "ghost", onClick: renderYardScene }
    ]);
    return;
  }
  if (!plot.crop) { showPlantSeedPanel(plotId); return; }
  const stage = getCropStage(state, plot);
  if (stage.mature) {
    renderText(`<div class="subtitle">${stage.crop.name}</div><div class="hint">可以收成了！</div>`);
    renderOptions([
      { label: "✅ 收成", onClick: () => {
        const result = harvestFarmPlot(state, plotId);
        if (result.ok) runQuestCheck();
        saveGame(); renderStatusBar();
        renderYardScene();
        if (result.ok) spawnFloatParticle(`farmPlot_${plotId}`, "✨");
      } },
      { label: "返回", variant: "ghost", onClick: renderYardScene }
    ]);
    return;
  }
  // V2星露谷式：澆水是「加速」不是「門檻」，不澆水一樣會慢慢長大（離線也會生長，見規格文件）
  const wateredToday = plot.crop.lastWateredDay === state.day;
  renderText(`<div class="subtitle">${stage.crop.name}</div><div class="hint">成長進度 ${stage.stageIdx + 1}/${stage.crop.stages}${wateredToday ? "\n今天已經澆過水了" : "\n離線也會慢慢長大，澆水可以加速"}</div>`);
  renderOptions([
    { label: wateredToday ? "💧 澆水（今天已澆過）" : "💧 澆水（加速生長）",
      disabled: wateredToday,
      onClick: () => {
        const result = waterPlot(state, plotId);
        if (result.ok) saveGame();
        renderStatusBar();
        renderYardScene();
        if (result.ok) spawnFloatParticle(`farmPlot_${plotId}`, "💧");
      } },
    { label: "返回", variant: "ghost", onClick: renderYardScene }
  ]);
}

// ---------- 養殖區/獸欄場景 ----------
const PEN_ANIMAL_ICONS = { species_chicken: "🐔", species_sheep: "🐑", species_mutant_hen: "🐔" };
let penWanderTimers = {};
// 動物是持久存在的資產，讓牠在欄位周圍隨機微幅移動（每次間隔跟位移量都隨機，不是固定循環的動畫），
// 回應「動物要能隨意動、不要寫死」的反饋。移動只改.icon的transform，不動外層.roomCell的left/top，
// 所以不會影響bindOutdoorWalk依據固定gx/gy判斷的互動點擊範圍
function startPenWander(penId) {
  if (penWanderTimers[penId]) clearInterval(penWanderTimers[penId]);
  penWanderTimers[penId] = setInterval(() => {
    const pen = state.pens.plots[penId];
    const cell = document.getElementById(`pen_${penId}`);
    if (!pen || !pen.animal || !cell || !document.body.contains(cell)) {
      clearInterval(penWanderTimers[penId]);
      delete penWanderTimers[penId];
      return;
    }
    const icon = cell.querySelector(".icon");
    if (!icon) return;
    const dx = (Math.random() * 24 - 12).toFixed(1);
    const dy = (Math.random() * 14 - 7).toFixed(1);
    icon.style.transform = `translate(${dx}px, ${dy}px)`;
  }, 1800 + Math.random() * 1600);
}
function penCellHtml(state, penDef) {
  const pen = state.pens.plots[penDef.id];
  const pos = gridPos(penDef.gx, penDef.gy);
  const z = cellZ(penDef.gx + penDef.gy);
  // V3(2026-07-04)：拿掉常駐文字牌，鎖頭圖示改用🔗(鐵鍊意象，呼應規格「破舊木板與鐵鍊鎖住」)佔位
  if (!pen.unlocked) {
    const cost = penUnlockCost(state);
    return `<div class="roomCell penCell locked" id="pen_${penDef.id}" style="left:${pos.left};top:${pos.top};z-index:${z}" title="解鎖欄位：${cost}📦"><div class="icon">🔗</div><div class="homeLabel">解鎖 ${cost}📦</div></div>`;
  }
  if (!pen.animal) {
    return `<div class="roomCell penCell empty" id="pen_${penDef.id}" style="left:${pos.left};top:${pos.top};z-index:${z}" title="點擊放入動物"><div class="icon">🐾</div><div class="homeLabel">空欄（點放入動物）</div></div>`;
  }
  const prod = getPenProductionState(state, pen);
  const icon = PEN_ANIMAL_ICONS[pen.animal.speciesId] || "🐾";
  const label = `${prod.species.name} 好感${pen.animal.happiness}${prod.ready ? "（可收成）" : ""}`;
  const stateCls = prod.ready ? " ready" : "";
  const fedToday = pen.animal.lastFedDay === state.day;
  // 食槽視覺：今天餵過=滿，還沒餵=空——不再是會衰減的飽食度，純粹當天有沒有餵的提示
  const troughCls = "penTrough" + (fedToday ? " fed" : "");
  return `<div class="roomCell penCell occupied${stateCls}" id="pen_${penDef.id}" style="left:${pos.left};top:${pos.top};z-index:${z}" title="${label}"><div class="${troughCls}"></div><div class="icon">${icon}</div><div class="homeLabel">${label}</div></div>`;
}
function penSceneHtml(state) {
  if (outdoorScene !== "pen") { outdoorScene = "pen"; outdoorPlayerPos = null; }
  const items = PEN_LAYOUT.map(p => penCellHtml(state, p));
  items.push(outdoorPlayerCellHtml("pen"));
  // 獸欄是室外圍欄，不沿用state.roomFloor，改用專屬的ground-pen紋理
  return `<div class="homeScene"><div class="homePillRow homeTabPills"><button class="homePill" id="penBackBtn">← 返回小屋</button></div><div class="roomCanvas ground-pen" id="penCanvas">${items.join("")}</div></div>`;
}
function renderPenScene() {
  renderStatusBar();
  renderText(penSceneHtml(state));
  const backBtn = document.getElementById("penBackBtn");
  if (backBtn) backBtn.onclick = renderMain;
  const canvas = document.getElementById("penCanvas");
  if (canvas) bindOutdoorWalk(canvas, "pen", PEN_LAYOUT, showPenPlotPanel);
  PEN_LAYOUT.forEach(p => {
    const pen = state.pens.plots[p.id];
    if (pen.unlocked && pen.animal) startPenWander(p.id);
  });
}
function showPlaceAnimalPanel(penId) {
  renderStatusBar();
  const animalEntries = (state.inventory || []).filter(i => { const item = ITEMS[i.itemId]; return item && item.type === "animal" && i.qty > 0; });
  renderText(`<div class="subtitle">選擇要放入的動物</div>${animalEntries.length ? "" : `<div class="hint">背包裡沒有動物，先去商城購買或探索取得。</div>`}`);
  const opts = animalEntries.map(i => {
    const item = ITEMS[i.itemId];
    return {
      label: `${item.icon} ${item.name}`,
      hint: `x${i.qty}`,
      onClick: () => {
        const result = placeAnimal(state, penId, i.itemId);
        if (result.ok) saveGame();
        renderPenScene();
      }
    };
  });
  opts.push({ label: "返回", variant: "ghost", onClick: renderPenScene });
  renderOptions(opts);
}
// 玩家走到欄位旁後才會呼叫這個面板；依欄位狀態分派到對應互動（解鎖/放入動物/餵食·互動·收成）
function showPenPlotPanel(penId) {
  const pen = state.pens.plots[penId];
  if (!pen.unlocked) {
    renderStatusBar();
    const cost = penUnlockCost(state);
    renderText(`<div class="subtitle">解鎖欄位</div><div class="hint">花費 ${cost}📦 建造這個欄位。</div>`);
    renderOptions([
      { label: `解鎖（${cost}📦）`, disabled: (state.resources.scrap || 0) < cost, onClick: () => {
        const result = unlockPen(state, penId);
        if (result.ok) { runQuestCheck(); saveGame(); renderStatusBar(); }
        renderPenScene();
      } },
      { label: "返回", variant: "ghost", onClick: renderPenScene }
    ]);
    return;
  }
  if (!pen.animal) { showPlaceAnimalPanel(penId); return; }
  showPenActionsPanel(penId);
}
// 養殖欄位同時有餵食/互動/收成三種操作，跟農場地塊「一格一狀態直接點」不同，改成點格子跳這個小面板選操作
function showPenActionsPanel(penId) {
  renderStatusBar();
  const pen = state.pens.plots[penId];
  if (!pen.animal) { renderPenScene(); return; }
  const prod = getPenProductionState(state, pen);
  const fedTodayDone = pen.animal.lastFedDay === state.day;
  const petTodayDone = pen.animal.lastPetDay === state.day;
  renderText(`<div class="subtitle">${prod.species.name}</div><div class="hint">好感度 ${pen.animal.happiness}/100（≥60時收成有機率雙倍產出）${prod.ready ? "\n可以收成了！" : `\n還差${prod.species.producePhases - (currentPhaseIndex(state) - pen.animal.lastCollectedAtPhaseIndex)}個階段`}</div>`);
  const opts = [];
  opts.push({
    label: fedTodayDone ? `🍖 餵食（今天已餵過）` : `🍖 餵食（消耗${FEED_COST}📦）`,
    disabled: fedTodayDone || (state.resources.food || 0) < FEED_COST,
    onClick: () => {
      const result = feedAnimal(state, penId);
      if (result.ok) saveGame();
      renderStatusBar();
      renderPenScene();
      if (result.ok) spawnFloatParticle(`pen_${penId}`, "🍖");
    }
  });
  opts.push({
    label: petTodayDone ? "🤍 互動（今天已互動過）" : "❤️ 互動",
    disabled: petTodayDone,
    onClick: () => {
      const result = petAnimal(state, penId);
      if (result.ok) saveGame();
      renderPenScene();
      if (result.ok) spawnFloatParticle(`pen_${penId}`, "💖");
    }
  });
  if (prod.ready) {
    opts.push({
      label: "✅ 收成",
      onClick: () => {
        const result = collectPen(state, penId);
        if (result.ok) runQuestCheck();
        saveGame();
        renderStatusBar();
        renderPenScene();
        if (result.ok) spawnFloatParticle(`pen_${penId}`, result.crit ? "🌟" : "✨");
      }
    });
  }
  opts.push({ label: "返回", variant: "ghost", onClick: renderPenScene });
  renderOptions(opts);
}

// v129：拖曳家具放開後磁吸對齊+鎖定按鈕，避免誤觸
// v166：free-form佈置——牆面仍固定2格(顯示「空」)，table/floor/rug改為只列出實際已擺放的項目(無固定格數可列)
function showComfortDetail() {
  renderStatusBar();
  const RARITY_COMFORT = { common: 1, rare: 2, epic: 3, legendary: 3 };
  const RARITY_LABEL = { common: "普通", rare: "稀有", epic: "史詩", legendary: "傳說" };
  const FURNITURE_SLOT_LABEL = { table: "桌面", floor: "地板", rug: "地毯" };
  let rows = "";
  let total = 0;
  ["wall", "wall2"].forEach(slot => {
    const itemId = state.baseSlots && state.baseSlots[slot];
    const item = ITEMS[itemId];
    if (item) {
      const pts = RARITY_COMFORT[item.rarity] || 0;
      total += pts;
      rows += `<div class="invRow"><span>牆面格：${item.icon} ${item.name}</span><span class="qty">${RARITY_LABEL[item.rarity]} +${pts}</span></div>`;
    } else {
      rows += `<div class="invRow"><span>牆面格</span><span class="qty" style="opacity:0.4">（空）</span></div>`;
    }
  });
  if (!(state.placedFurniture || []).length) {
    rows += `<div class="invRow"><span>地板/桌面/地毯</span><span class="qty" style="opacity:0.4">（尚未擺放任何家具）</span></div>`;
  }
  (state.placedFurniture || []).forEach(placed => {
    const item = ITEMS[placed.itemId];
    if (!item) return;
    const pts = RARITY_COMFORT[item.rarity] || 0;
    total += pts;
    const label = FURNITURE_SLOT_LABEL[item.slot] || "地板";
    rows += `<div class="invRow"><span>${label}：${item.icon} ${item.name}</span><span class="qty">${RARITY_LABEL[item.rarity]} +${pts}</span></div>`;
  });
  const level = getComfortLevel(state);
  const label = getComfortLabel(level);
  const effects = [
    level >= 3 ? "🏠 溫馨：探索/採集每日首次體力-1" : "未達溫馨門檻（Lv3），尚無探索/採集體力減免",
    level >= 6 ? "🏠 安樂窩：額外休息回HP+5、回SAN+5" : "未達安樂窩門檻（Lv6），尚無額外HP+5/SAN+5",
    level >= 10 ? "🏠 溫暖小窩：探索/採集體力消耗再-1" : "未達最高門檻（Lv10），尚無額外體力減免",
  ].join("\n");
  renderText(`<div class="subtitle">🏠 舒適度 ${level}（${label}）</div><div class="invList">${rows}</div>\n<div class="hint" style="white-space:pre-line;padding-top:8px">${effects}</div>`);
  renderOptions([{ label: "返回", variant: "ghost", onClick: renderMain }]);
}

// #27：地板樣式選擇面板 // #29-1b：地板樣式解鎖條件與展示
function showFloorPicker() {
  renderStatusBar();
  const unlocked = state.unlockedFloors || ["wood"];
  const cardsHtml = Object.entries(FLOOR_STYLES).map(([id, f]) => {
    const locked = !unlocked.includes(id);
    return `
    <div class="charCard floorCard${id === (state.roomFloor || "wood") ? " selected" : ""}${locked ? " locked" : ""}" data-id="${id}" ${locked ? 'data-locked="1"' : ""}>
      <div class="floorSwatch ${f.cls}"></div>
      <div class="homeLabel">${locked ? "??" : ""}${f.name}</div>
    </div>`;
  }).join("");
  renderText(`<div class="subtitle">選擇地板樣式（未解鎖的樣式需達成條件）</div><div class="charGrid">${cardsHtml}</div>`);
  document.querySelectorAll(".floorCard").forEach(el => {
    el.onclick = () => {
      if (el.dataset.locked) return;
      state.roomFloor = el.dataset.id;
      saveGame();
      renderMain();
    };
  });
  renderOptions([{ label: "返回", variant: "ghost", onClick: renderMain }]);
}

function snapToGridFromClientXY(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  let left = ((clientX - rect.left) / rect.width) * 100;
  let topPx = (clientY - rect.top) * (ROOM_H_PX / rect.height);
  left = Math.max(0, Math.min(100, left));
  topPx = Math.max(0, Math.min(ROOM_H_PX, topPx));
  const { gx, gy } = pixelToGrid(left, topPx);
  return gridPos(gx, gy);
}
let homeWalkLock = false;
function bindHomeCanvasMove(canvas) {
  canvas.onclick = (e) => {
    if (state.homePlacementMode || homeWalkLock) return;
    const el = document.getElementById("homePlayerCell");
    if (!el) return;
    const snapped = snapToGridFromClientXY(canvas, e.clientX, e.clientY);
    const occupied = getOccupiedTileKeys(state);
    const start = posToGrid(state.homePos || gridPos(5, 5));
    const target = posToGrid(snapped);
    const dest = findReachablePos(start, target, occupied);
    if (!dest) return;
    homeWalkLock = true;
    let prevG = start;
    animateWalk(el, dest.path, { zRole: 4, fn: (p, gx, gy, isLast) => {
      const facing = computeFacing(gx - prevG.gx, gy - prevG.gy);
      if (facing) { state.homeFacing = facing; applyFacingToCell(el, "character", state.appearance || "char_1", facing); }
      prevG = { gx, gy };
      state.homePos = p;
      if (isLast) { saveGame(); homeWalkLock = false; }
    } });
  };
}
function bindConfirmAction(el, action) {
  let timer = null;
  el.onclick = (e) => {
    e.stopPropagation();
    if (el.classList.contains("armed")) {
      clearTimeout(timer);
      el.classList.remove("armed");
      action();
      return;
    }
    el.classList.add("armed");
    timer = setTimeout(() => el.classList.remove("armed"), 2500);
  };
}
let companionWanderTimer = null;
function startCompanionWander() {
  if (companionWanderTimer) clearInterval(companionWanderTimer);
  if (!state.companion) return;
  companionWanderTimer = setInterval(() => {
    if (!state.companion || state.homePlacementMode) return;
    const el = document.getElementById("homeCompanionCell");
    if (!el || !document.body.contains(el)) { clearInterval(companionWanderTimer); companionWanderTimer = null; return; }
    const cur = posToGrid(state.companionPos || gridPos(6, 2));
    const occupied = getOccupiedTileKeys(state, "companion");
    const player = posToGrid(state.homePos || gridPos(5, 5));
    occupied.add(tileKey(player.gx, player.gy));
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => Math.random() - 0.5);
    for (const [dx, dy] of dirs) {
      const nx = cur.gx + dx, ny = cur.gy + dy;
      if (nx < GRID_COL_MIN || nx > GRID_COL_MAX || ny < GRID_FLOOR_ROW_MIN || ny > GRID_FLOOR_ROW_MAX) continue;
      if (occupied.has(tileKey(nx, ny))) continue;
      const np = gridPos(nx, ny);
      const facing = computeFacing(dx, dy);
      if (facing) { state.companionFacing = facing; applyFacingToCell(el, "companion", "default", facing); }
      state.companionPos = np;
      el.classList.add("walking");
      el.style.left = np.left;
      el.style.top = np.top;
      el.style.zIndex = cellZ(nx + ny, 2);
      const label = el.querySelector(".homeLabel");
      if (label) label.classList.toggle("lbl-above", ny === GRID_FLOOR_ROW_MAX);
      setTimeout(() => el.classList.remove("walking"), 260);
      saveGame();
      break;
    }
  }, 6000 + Math.random() * 4000);
}
// v166：free-form佈置——furnitureIndex對應state.placedFurniture的陣列索引，拖曳放開後直接寫回該項的gx/gy，
// 不再有「slot」字串/固定預設位置概念；點一下(非拖曳)睡袋仍保留切換地板樣式的彩蛋(原本綁在slot==="floor")
function bindFurnitureDrag(el, canvas, furnitureIndex) {
  let dragging = false, startX, startY;
  const onMove = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    let left = ((clientX - rect.left) / rect.width) * 100;
    let topPx = (clientY - rect.top) * (ROOM_H_PX / rect.height);
    left = Math.max(0, Math.min(100, left));
    topPx = Math.max(0, Math.min(ROOM_H_PX, topPx));
    el.style.left = left + "%";
    el.style.top = topPx + "px";
    return { left, topPx };
  };
  const start = (clientX, clientY) => { dragging = true; startX = clientX; startY = clientY; el.style.transition = "none"; };
  const end = (clientX, clientY) => {
    if (!dragging) return;
    dragging = false;
    el.style.transition = "";
    const placed = state.placedFurniture[furnitureIndex];
    if (placed && placed.itemId === "furn_sleeping_bag" && Math.abs(clientX - startX) < 4 && Math.abs(clientY - startY) < 4) {
      showFloorPicker();
      return;
    }
    const pos = onMove(clientX, clientY);
    const { gx, gy } = pixelToGrid(pos.left, pos.topPx);
    const playerG = posToGrid(state.homePos || gridPos(3, 3));
    const blocked = getOccupiedTileKeys(state, furnitureIndex).has(tileKey(gx, gy))
      || (gx === playerG.gx && gy === playerG.gy);
    const finalCell = blocked ? { gx: placed.gx, gy: placed.gy } : { gx, gy };
    const snapped = gridPos(finalCell.gx, finalCell.gy);
    el.style.left = snapped.left;
    el.style.top = snapped.top;
    const label = el.querySelector(".homeLabel");
    if (label) label.classList.toggle("lbl-above", finalCell.gy === GRID_FLOOR_ROW_MAX);
    placed.gx = finalCell.gx;
    placed.gy = finalCell.gy;
    saveGame();
  };
  el.onpointerdown = (e) => { e.stopPropagation(); start(e.clientX, e.clientY); el.setPointerCapture(e.pointerId); };
  el.onpointermove = (e) => { if (dragging) { e.stopPropagation(); onMove(e.clientX, e.clientY); } };
  el.onpointerup = (e) => { e.stopPropagation(); end(e.clientX, e.clientY); };
  el.onpointercancel = () => { dragging = false; el.style.transition = ""; };
}

function playerAnim(cls, callback) {
  const el = document.getElementById("homePlayerCell");
  if (!el) { callback(); return; }
  el.classList.add(cls);
  setTimeout(callback, cls === "anim-explore" ? 480 : 700);
}
// v164：關燈時在玩家頭上飄一個「💤」，純氛圍動畫，跟doRest()的休息結算完全無關
function showSleepZzz(playerCell) {
  if (!playerCell) return;
  const z = document.createElement("div");
  z.className = "sleepZzz";
  z.textContent = "💤";
  playerCell.appendChild(z);
  setTimeout(() => z.remove(), 1400);
}

// 2026-06-21（重大回退）：群組B(pistol_01/scrap_chainsaw/military_shovel/jacket_01)複查後
// 確認邊緣同樣殘留污染色（跟ISO_ASSETS同一個根因），已全部撤回，icons暫時清空。
// 新美術規格見美術文件/產圖規格/ART_主規格.md+ART_批次2/3，往後一律用remove_bg_tool.py處理。
// 2026-06-21（remove_bg_tool.py成功案例）：批次2群組A重畫完成，邊緣顏色核對乾淨。
const ICON_ASSETS = {
  knife_01: 1, pipe_01: 1, bat_01: 1, machete_01: 1,
  vest_01: 1, scrap_plating: 1, ceramic_vest: 1, gaia_whip: 1,
  gaia_armor: 1, ocean_pistol: 1, ocean_mace: 1, ocean_jacket: 1,
  aero_crossbow: 1, aero_dagger: 1, aero_cloak: 1, cyber_hammer: 1,
  cyber_suit: 1, mind_fork: 1, mind_greatsword: 1, mind_robe: 1,
  aero_pouch: 1, merchant_token: 1, mind_eye: 1, ocean_leech: 1,
  tesla_battery: 1, cyber_pendant: 1, mind_mirror: 1, wedding_ring: 1,
  food_can: 1, water_bottle: 1, bandage: 1, energy_drink: 1,
  serum_atk: 1, serum_stamina: 1, serum_vit: 1, reinforce_blueprint: 1,
  pistol_01: 1, scrap_chainsaw: 1, military_shovel: 1, jacket_01: 1,
  awaken_crystal: 1, appearance_token: 1, floor_sample: 1,
  gaia_skin: 1,
};
function itemIconHtml(itemId, type) {
  const src = resolveAsset("icon", itemId);
  if (src) return `<span class="icon inline"><img class="pixelImg" src="${src}" alt="${itemId}"></span>`;
  return `<span class="icon inline">${pixelIconSvg(itemId, type)}</span>`;
}

// ===== 素材管理系統（規格文件/素材管理系統_設計規格.md，2026-06-26開始實作第1~3階段）=====
// 統一資產解析機制，取代ISO_ASSETS/ENEMY_ASSETS/ICON_ASSETS各自一份幾乎相同的「存在才換圖」判斷邏輯，
// 並收斂玩家頭像(原本4處)/同伴頭像(原本3處)散落重複的硬編碼路徑。state為模組全域變數，
// condition函式需要依劇情/天數/血月狀態挑圖時可直接讀取，不必額外傳參。
const ASSET_CACHE_VERSION = 205; // 取代散落各處的?v=NNN字串，之後bump快取版號只需要改這一個數字
const ASSET_REGISTRY = {};
function registerAsset(category, id, file) {
  ASSET_REGISTRY[`${category}:${id}`] = [{ condition: () => true, file }];
}
function resolveAsset(category, id) {
  const variants = ASSET_REGISTRY[`${category}:${id}`];
  if (!variants) return null; // 沒註冊過，呼叫端自行fallback成pixelIconSvg
  const match = variants.find(v => v.condition());
  return match ? `${match.file}?v=${ASSET_CACHE_VERSION}` : null;
}
// 第1階段：現有ISO_ASSETS/ENEMY_ASSETS/ICON_ASSETS原樣併入，純重構不改變行為
Object.keys(ISO_ASSETS).forEach(id => registerAsset("furniture", id, `assets/iso/${id}.png`));
Object.keys(ENEMY_ASSETS).forEach(id => registerAsset("enemy", id, `assets/enemies/${id}.png`));
Object.keys(ICON_ASSETS).forEach(id => registerAsset("icon", id, `assets/icons/${id}.png`));
// 第2階段：玩家角色造型(CHARACTER_OPTIONS)+同伴頭像(目前所有隊員共用同一張圖)收斂進同一套機制
CHARACTER_OPTIONS.forEach(c => registerAsset("character", c.id, `assets/characters/${c.id}.png`));
registerAsset("companion", "default", "assets/characters/companion_default.png");

// v179：角色4方向朝向——只需要"back"(背面)+"side"(側面，left用CSS鏡像翻轉side圖即可，不用畫兩張)兩款額外圖，
// 比原本的單一正面圖額外多畫2張。2026-07-01：批次10~14美術已產出並登記於此，全4名玩家角色+同伴default都有back/side圖了。
const DIRECTIONAL_ASSETS = {
  "character:char_1": { back: 1, side: 1 },
  "character:char_2": { back: 1, side: 1 },
  "character:char_3": { back: 1, side: 1 },
  "character:char_4": { back: 1 }, // side暫時停用：char_4_side.png是誤裁切的頭部特寫(缺身體)，非真正側面行走圖，待補正式美術前先退回正面圖
  "companion:default": { back: 1, side: 1 },
};
Object.keys(DIRECTIONAL_ASSETS).forEach(key => {
  const [category, id] = key.split(":");
  Object.keys(DIRECTIONAL_ASSETS[key]).forEach(dir => registerAsset(category, `${id}_${dir}`, `assets/characters/${id}_${dir}.png`));
});
// facing: "front"(預設，正面，即原本唯一一張圖) / "back"(背面) / "left"/"right"(側面，"left"額外加CSS鏡像)
function computeFacing(dx, dy) {
  if (!dx && !dy) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "front" : "back";
}
function resolveCharacterFacingSrc(category, id, facing) {
  const dirKey = facing === "back" ? "back" : (facing === "left" || facing === "right") ? "side" : null;
  if (dirKey && DIRECTIONAL_ASSETS[`${category}:${id}`] && DIRECTIONAL_ASSETS[`${category}:${id}`][dirKey]) {
    const src = resolveAsset(category, `${id}_${dirKey}`);
    if (src) return src;
  }
  return resolveAsset(category, id);
}
function characterSpriteHtml(category, id, facing, altText) {
  const src = resolveCharacterFacingSrc(category, id, facing);
  const mirror = facing === "left" ? " facingMirror" : "";
  return `<img class="pixelImg${mirror}" src="${src}" alt="${altText}">`;
}
// 走路中途直接改img.src+鏡像class，不用整頁重render(跟animateWalk逐格動畫同一套效能考量)
function applyFacingToCell(el, category, id, facing) {
  const img = el.querySelector("img.pixelImg");
  if (!img) return;
  img.src = resolveCharacterFacingSrc(category, id, facing);
  img.classList.toggle("facingMirror", facing === "left");
}

function chooseStartAppearance() {
  statusBar.innerHTML = "";
  const cardsHtml = CHARACTER_OPTIONS.map(c => `
    <div class="charCard" data-id="${c.id}">
      <img class="pixelImg" src="${resolveAsset("character", c.id)}" alt="${c.name}">
      <div class="homeLabel">${c.name}</div>
        </div>`).join("");
  renderText(`<div class="subtitle">在末日來臨之前的最後一晚，你想以什麼樣的面貌活下去？選擇你的外觀造型：</div><div class="charGrid">${cardsHtml}</div>`, { kind: "event" });
  document.querySelectorAll(".charCard").forEach(el => {
    el.onclick = () => {
      state.appearance = el.dataset.id;
      state.unlockedAppearances = [el.dataset.id];
      startPrologue();
    };
  });
  renderOptions([]);
}

// #22-1：造型選擇面板，沿用既有CHARACTER_OPTIONS清單
// #29-3：造型解鎖判定（依unlockedAppearances清單，僅顯示已解鎖造型）
function showAppearancePicker() {
  renderStatusBar();
  const unlocked = state.unlockedAppearances || [state.appearance || "char_1"];
  const cardsHtml = CHARACTER_OPTIONS.filter(c => unlocked.includes(c.id)).map(c => `
    <div class="charCard${c.id === state.appearance ? " selected" : ""}" data-id="${c.id}">
      <img class="pixelImg" src="${resolveAsset("character", c.id)}" alt="${c.name}">
      <div class="homeLabel">${c.name}</div>
        </div>`).join("");
  // v93：選擇造型後立即套用並返回主畫面，無需額外確認步驟
  renderText(`<div class="subtitle">選擇造型（點擊套用）</div><div class="charGrid">${cardsHtml}</div>`);
  document.querySelectorAll(".charCard").forEach(el => {
    el.onclick = () => {
      state.appearance = el.dataset.id;
      saveGame();
      renderMain();
    };
  });
  renderOptions([
    { label: "返回", variant: "ghost", onClick: renderMain }
  ]);
}

let homeOpenPanel = null;
// 任務系統：finishAction/endPhase呼叫checkQuestsAndAchievements後的結果暫存，供renderMain消費顯示一次性通知，不寫入存檔
let pendingQuestNotice = null;
function runQuestCheck() {
  const result = checkQuestsAndAchievements(state);
  if (result.completedMain || result.completedSide.length || result.unlockedAchievements.length) {
    pendingQuestNotice = result;
  }
  return result;
}
let companionBubbleOpen = false;
let companionBubbleLine = null;
// 小隊同伴（艾莉/阿卡）小屋視覺化氣泡狀態，2026-06-20新增
let squadBubbleOpen = null;
let squadBubbleLine = null;
// 不請自來的夥伴(流浪狗)小屋視覺化氣泡狀態，2026-07-04新增——比照squadCompanion手法，
// 但狗沒有任務指派，氣泡選單只有「摸摸牠」一個按鈕
let dogBubbleOpen = false;
let dogBubbleLine = null;
function togglePanel(key, showFn) {
  if (homeOpenPanel === key) {
    homeOpenPanel = null;
    renderMain();
  } else {
    homeOpenPanel = key;
    showFn();
  }
}

// 任務/成就reward用{embers,exp,scrap}簡寫，轉成formatEffect認得的形狀，純顯示用不影響數值套用
function formatQuestReward(reward) {
  if (!reward) return "";
  const effect = {};
  if (reward.embers) effect.embers = reward.embers;
  if (reward.exp) effect.exp = reward.exp;
  if (reward.scrap) effect.resources = { scrap: reward.scrap };
  return formatEffect(effect);
}

function renderMain() {
  homeOpenPanel = null;
  renderStatusBar();
  const cost = reinforceCost(state);
  let extra = "";
  if (state.skillPoints > 0) {
        extra += `\n⭐ 你有 ${state.skillPoints} 點未使用的技能點！`;
  }
  // 任務系統：消費上一次finishAction/endPhase留下的完成通知，顯示一次後清空，不寫入存檔
  if (pendingQuestNotice) {
    const r = pendingQuestNotice;
    if (r.completedMain) extra += `\n🎯 主線完成：${r.completedMain.title}${formatQuestReward(r.completedMain.reward)}`;
    r.completedSide.forEach(q => { extra += `\n✅ 支線完成：${q.title}${formatQuestReward(q.reward)}`; });
    r.unlockedAchievements.forEach(a => { extra += `\n🏆 解鎖成就：${a.title}${formatQuestReward(a.reward)}`; });
    pendingQuestNotice = null;
  }
  // #23：徽章列表（廢料/防禦力/同伴任務等小圖示）
const badges = [`<span class="miniBadge">📦 ${state.resources.scrap}</span>`, `<span class="miniBadge">🛡️${state.baseDefense}</span>`];
  if (state.companion) badges.push(`<span class="miniBadge">👤 ${COMPANION_TASK_LABELS[state.companionTask] || state.companionTask}</span>`);
  // #28：設施等級徽章列表
  FACILITY_KEYS.forEach(key => {
    const lv = state.facilities[key] || 0;
    if (lv === 0) return;
        const icon = key === "greenhouse" ? "🪴" : key === "command" ? "🛡️" : key === "workshop" ? "🔧" : "📡";
    badges.push(`<span class="miniBadge" title="${FACILITY_LABELS[key]} Lv${lv}：${FACILITY_DESCS[key]}">${icon}Lv${lv}</span>`);
  });
  // #25：配偶/Peeps心情同步顯示
  const ss = state.spouseState || {};
  const moodSummary = state.dailyMoodDay === state.day ? `今日心情：${state.dailyMood}` : "今日尚未簽到心情";
  const heartTitle = ss.hasLinked
    ? `${moodSummary}、${ss.spouseName || "同伴"}已連結，相隔遙遠但心意相通` : "尚未與任何人連結";
  badges.push(`<span class="miniBadge heart${ss.hasLinked ? " linked" : ""}" title="${heartTitle}">${ss.hasLinked ? "💞" : "🤍"}</span>`);
  const facLine = `\n${badges.join(" ")}`;
  const peepsLine = "";
  let tipText = "";
  if (!state.flags.tip_main_shown) {
    state.flags.tip_main_shown = true;
        tipText = "\n\n💡 小提示：點擊角色頭像旁的圖示可以查看更多資訊";
  }
  // #34：首次進入小屋畫面的提示文字
  if (!state.flags.tip_home_shown) {
    state.flags.tip_home_shown = true;
        tipText += "\n\n💡 小提示：小屋裡的家具可以點擊互動，長按可拖曳調整位置";
  }
  // #22-4(b)：HP低於25%時警示文字
const lowHp = state.hp <= state.hpMax * 0.25;
    const lowHpWarning = lowHp ? "\n\n⚠️ 你的傷勢嚴重，請盡快休息或使用醫療物資！" : "";
  const HOME_IDLE = [
        "窗外的風聲呼嘯而過，提醒著你外面的世界已不再安全。",
        "牆上的時鐘滴答作響，是這個小屋裡少數還正常運作的東西。",
        "你聞到空氣裡淡淡的鐵鏽味，分不清是廢料還是別的什麼。",
        "遠方似乎傳來幾聲悶響，但很快又恢復平靜。",
        "桌上的雜物隨意堆放著，記錄著你這些日子的生存痕跡。",
        "你靜靜坐了一會兒，聽著自己的心跳聲。",
        "窗台上積了一層薄灰，已經很久沒人打掃了。",
        "偶爾能聽見遠處傳來的腳步聲，提醒你並不孤單，也並不安全。",
  ];
  const idleText = state.homePlacementMode
    ? "🛋️ 佈置模式中：拖曳家具調整位置，再次點擊「結束佈置」儲存"
    : HOME_IDLE[state.day % HOME_IDLE.length];
  renderText(`${homeSceneHtml(state)}${idleText}${facLine}${peepsLine}${extra}${threatWarningText()}${tipText}${lowHpWarning}`);
  const roomCanvas = document.getElementById("roomCanvas");
  if (roomCanvas) bindHomeCanvasMove(roomCanvas);
  startCompanionWander();
  bindHomeTabPills();
  const placementBtn = document.getElementById("homeTabPlacement");
  if (placementBtn) placementBtn.onclick = () => { state.homePlacementMode = !state.homePlacementMode; renderMain(); };
  // v164：點燈開關——純氛圍互動，不消耗體力/不推進天數，跟doRest()完全分開
  const lightSwitch = document.getElementById("homeLightSwitch");
  if (lightSwitch) lightSwitch.onclick = (e) => {
    e.stopPropagation();
    const turningOff = !state.homeLightOff;
    state.homeLightOff = turningOff;
    saveGame();
    renderMain();
    if (turningOff) showSleepZzz(document.getElementById("homePlayerCell"));
  };
  // v166：free-form佈置——原本table/floor/rug三段各自的綁定迴圈收斂成一個，依陣列索引綁定，
  // 不再有固定slot名稱；furn_sleeping_bag保留「點擊休息」的confirm-click模式，其餘專屬互動(日記/收音機/孵化巢)
  // 仍依itemId判斷，沒有專屬互動的家具一律落入「翻找彩蛋」(v165)
  (state.placedFurniture || []).forEach((placed, index) => {
    const cell = document.getElementById(furnitureCellId(index));
    if (!cell || !roomCanvas) return;
    if (state.homePlacementMode) {
      bindFurnitureDrag(cell, roomCanvas, index);
      return;
    }
    const itemId = placed.itemId;
    if (itemId === "furn_sleeping_bag") {
      bindConfirmAction(cell, () => playerAnim("anim-rest", doRest));
      return;
    }
    cell.onclick = (e) => {
      e.stopPropagation();
      if (itemId === "furn_diary") togglePanel("diary", showDiary);
      else if (itemId === "furn_radio") {
        const result = radioInteract(state);
        if (result.ok) { saveGame(); renderStatusBar(); renderText(result.text, { kind: "event" }); }
      } else if (itemId === "furn_egg_nest") {
        const result = eggNestInteract(state);
        if (result.ok) { saveGame(); renderStatusBar(); renderText(result.text, { kind: "event" }); }
      } else {
        const result = furnitureEasterEggInteract(state, index);
        if (result.ok) { saveGame(); renderStatusBar(); renderText(result.text, { kind: "event" }); }
      }
    };
  });
  const companionCell = document.getElementById("homeCompanionCell");
  if (companionCell) companionCell.onclick = (e) => {
    e.stopPropagation();
    companionBubbleOpen = !companionBubbleOpen;
    companionBubbleLine = null;
    renderMain();
  };
  const bubbleChat = document.getElementById("companionBubbleChat");
  if (bubbleChat) bubbleChat.onclick = (e) => {
    e.stopPropagation();
    const lines = COMPANION_TASK_LINES[state.companionTask] || ["（同伴靜靜地看著你，沒有說話）"];
    companionBubbleLine = lines[Math.floor(Math.random() * lines.length)];
    renderMain();
  };
  const bubbleAssign = document.getElementById("companionBubbleAssign");
  if (bubbleAssign) bubbleAssign.onclick = (e) => {
    e.stopPropagation();
    const idx = COMPANION_TASK_ORDER.indexOf(state.companionTask);
    state.companionTask = COMPANION_TASK_ORDER[(idx + 1) % COMPANION_TASK_ORDER.length];
        companionBubbleLine = `已指派為${COMPANION_TASK_LABELS[state.companionTask]}（${COMPANION_TASK_DESCS[state.companionTask]}）`;
    saveGame();
    renderMain();
  };
  const bubbleLove = document.getElementById("companionBubbleLove");
  if (bubbleLove) bubbleLove.onclick = (e) => {
    e.stopPropagation();
    if (state.flags.companionLoveDay === state.day) {
      companionBubbleLine = "今天已經互動過了，明天再來吧。";
    } else {
      state.flags.companionLoveDay = state.day;
      state.san = clamp(state.san + 2, 0, getEffectiveSanMax(state));
            companionBubbleLine = "同伴靠近你，安靜地待在你身邊，SAN+2。";
      saveGame();
      renderStatusBar();
    }
    renderMain();
  };
  // 小隊同伴（艾莉/阿卡）小屋視覺化點擊綁定，2026-06-20新增
  if (state.companions) {
    Object.keys(state.companions).forEach(sName => {
      if (sName === "雷恩") return;
      const sStatus = state.companions[sName];
      if (!sStatus || sStatus === "locked") return;
      const sCell = document.getElementById("squadCell_" + sName);
      if (sCell) sCell.onclick = (e) => {
        e.stopPropagation();
        squadBubbleOpen = squadBubbleOpen === sName ? null : sName;
        squadBubbleLine = null;
        renderMain();
      };
      const sChat = document.getElementById("squadBubbleChat_" + sName);
      if (sChat) sChat.onclick = (e) => {
        e.stopPropagation();
        const lines2 = SQUAD_CHAT_LINES[sName] || ["（沉默地看著你）"];
        squadBubbleLine = lines2[Math.floor(Math.random() * lines2.length)];
        renderMain();
      };
      const sAssign = document.getElementById("squadBubbleAssign_" + sName);
      if (sAssign) sAssign.onclick = (e) => {
        e.stopPropagation();
        const taskOptions = ["standby", ...(COMPANION_TASKS[sName] || [])];
        const cur = state.companions[sName];
        const next = taskOptions[(taskOptions.indexOf(cur) + 1) % taskOptions.length];
        dispatchCompanion(state, sName, next);
        squadBubbleLine = `已指派為${TASK_LABELS[next]}${TASK_DESCS[next] ? "（" + TASK_DESCS[next] + "）" : ""}`;
        saveGame();
        renderMain();
      };
    });
  }

  // 不請自來的夥伴(流浪狗)點擊綁定，2026-07-04新增
  const dogCell = document.getElementById("homeDogCell");
  if (dogCell) dogCell.onclick = (e) => {
    e.stopPropagation();
    dogBubbleOpen = !dogBubbleOpen;
    dogBubbleLine = null;
    renderMain();
  };
  const dogPetBtn = document.getElementById("dogBubblePet");
  if (dogPetBtn) dogPetBtn.onclick = (e) => {
    e.stopPropagation();
    if (state.flags.dogPetDay === state.day) {
      dogBubbleLine = "今天已經摸過牠了，牠滿足地趴在原地。";
    } else {
      state.flags.dogPetDay = state.day;
      state.san = clamp(state.san + 1, 0, getEffectiveSanMax(state));
      dogBubbleLine = "牠開心地蹭了蹭你的手，尾巴搖得飛快。SAN+1。";
      saveGame();
      renderStatusBar();
    }
    renderMain();
  };

  const coupleWallCell = document.getElementById("homeWallCell");
  if (coupleWallCell) coupleWallCell.onclick = (e) => {
    e.stopPropagation();
    const linked = state.spouseState && state.spouseState.hasLinked;
    const spouseName = (state.spouseState && state.spouseState.spouseName) || "同伴";
    const text = linked
      ? `你和${spouseName}一起看著這張同居紀念照，回想起許多溫暖的片段。\nSAN+2`
            : "這幅畫描繪著想像中與未來伴侶的同居生活，但你尚未與任何人連結（見29.2聯機功能）。\nSAN+2";
    renderText(text, { kind: "event" });
    renderOptions([{ label: "返回", variant: "ghost", onClick: renderMain }]);
  };
  // #29-3：造型解鎖判定相關鏡子點擊綁定(穿衣鏡/牆面鏡子)
  const mirrorCell = document.getElementById("homeMirrorCell");
  if (mirrorCell) mirrorCell.onclick = (e) => { e.stopPropagation(); showAppearancePicker(); };
  const mirror2Cell = document.getElementById("homeMirror2Cell");
  if (mirror2Cell) mirror2Cell.onclick = (e) => { e.stopPropagation(); showAppearancePicker(); };
  // V2.0：點擊家具/門等顯示提示文字，呼應v93調整造型互動方式
  const exploreDoorCell = document.getElementById("homeExploreDoorCell");
  if (exploreDoorCell) bindConfirmAction(exploreDoorCell, () => { if (!lowHp) playerAnim("anim-explore", showExploreChoice); });
  const gatherDoorCell = document.getElementById("homeGatherDoorCell");
  if (gatherDoorCell) bindConfirmAction(gatherDoorCell, () => { if (!lowHp) playerAnim("anim-gather", doGather); });
  // v94：長按顯示label，配合CSS .labelShow / :hover，讓觸控裝置也能看到家具名稱標籤
  document.querySelectorAll(".roomCanvas .roomCell").forEach(el => {
    el.addEventListener("click", () => {
      const wasShown = el.classList.contains("labelShow");
      document.querySelectorAll(".roomCanvas .roomCell.labelShow").forEach(c => c.classList.remove("labelShow"));
      if (!wasShown) el.classList.add("labelShow");
    });
  });
  if (roomCanvas && !roomCanvas._labelOutsideBound) {
    roomCanvas._labelOutsideBound = true;
    document.addEventListener("click", (e) => {
      if (e.target.closest && e.target.closest(".roomCell")) return;
      document.querySelectorAll(".roomCanvas .roomCell.labelShow").forEach(c => c.classList.remove("labelShow"));
    });
  }
  // v100：點擊空白處/其他家具會關閉目前顯示的label，避免多個家具標籤同時顯示互相干擾
  const opts = [
    ...(hasFurniturePlaced(state, "furn_sofa") ? [{ label: "🛋️ 沙發休息", onClick: showLounge }] : []),
    {
      label: "🛡️ 強化據點",
      hint: `：${cost}📦 / 體力-${actionStaminaCost(state, "reinforce")} / 強化據點：提升防禦力，抵擋夜襲傷害`,
      disabled: lowHp || state.resources.scrap < cost,
      onClick: doReinforce
    },
    {
      label: "🔄 物資轉換",
            hint: `：${CONVERT_SCRAP_COST}📦 / 體力-${actionStaminaCost(state, "convert")} / 將廢料轉換為其他資源`,
      disabled: lowHp || state.resources.scrap < CONVERT_SCRAP_COST,
      onClick: () => playerAnim("anim-gather", doConvert)
    },
  ];
  renderOptions(opts);
}

function showPeepsPanel() {
  renderStatusBar();
  const ss = state.spouseState || {};
  const moodLine = state.dailyMoodDay === state.day ? `今日心情：${state.dailyMood}` : "今日尚未簽到心情";
  // v180修正：lastSyncTimestamp存的是「同步當天的state.day絕對值」，不是「經過幾天」，
  // 原本直接顯示`${ss.lastSyncTimestamp}天前`會把絕對天數誤標成相對天數(例如第15天同步，會顯示「15天前」而非「今天」)
  const daysSinceSync = ss.hasLinked && ss.lastSyncTimestamp != null ? Math.max(0, state.day - ss.lastSyncTimestamp) : null;
  const syncGapNote = daysSinceSync !== null && daysSinceSync >= 10 ? `\n好久沒有${ss.spouseName || "對方"}的消息了，不知道最近過得好不好……` : "";
  const linkLine = ss.hasLinked
    ? `已連結：${ss.spouseName || "同伴"} ｜ 上次同步：${daysSinceSync === 0 ? "今天" : daysSinceSync + "天前"}${ss.spouseMood ? `\n${ss.spouseName}的心情：${ss.spouseMood}` : ""}${ss.jointProgress ? `\n共同進度：${ss.jointProgress.mine + ss.jointProgress.theirs}` : ""}${syncGapNote}` : "尚未與任何人連結，可在下方產生同步碼分享給對方";
  const hpPct = state.hp / state.hpMax;
  const stPct = state.stamina / state.staminaMax;
  const lowFood = (state.resources.food || 0) <= 1;
  const lowWater = (state.resources.water || 0) <= 1;
  const vitals = [
    { icon: "❤️", val: `${state.hp}/${state.hpMax}`, danger: hpPct <= 0.25 },
    { icon: "💧", val: state.resources.water ?? 0, danger: lowWater },
    { icon: "🍎", val: state.resources.food ?? 0, danger: lowFood },
    { icon: "💧", val: state.resources.water ?? 0, danger: lowWater },
  ].map(v => `<span class="${v.danger ? "peepDanger" : ""}">${v.icon}${v.val}</span>`).join(" ");
  const html = `<div class="subtitle">Peeps面板</div><div class="invList">
    <div class="invRow"><span>生命狀態</span><span class="qty">${vitals}</span></div>
    <div class="invRow"><span>玩家名稱</span><span class="qty">${state.playerName}</span></div>
    <div class="invRow"><span>今日心情</span><span class="qty">${moodLine}</span></div>
    <div class="invRow"><span>留言板</span><span class="qty">${state.whiteboardMessage || "（無留言）"}</span></div>
    <div class="invRow"><span>共用冰箱</span><span class="qty">🍎${state.sharedFridge.food}${asciiBar(state.sharedFridge.food,10,5)} 💧${state.sharedFridge.water}${asciiBar(state.sharedFridge.water,10,5)}</span></div>
    ${state.sharedFridge.note ? `<div class="invRow"><span>便條</span><span class="qty">${state.sharedFridge.note}</span></div>` : ""}
    <div class="invRow"><span>連結狀態</span><span class="qty">${linkLine}</span></div>
  </div>`;
  renderText(html);

  const opts = [];
  if (state.dailyMoodDay !== state.day) {
    ["😊", "😔", "😟", "😤", "❤️"].forEach(mood => {
      opts.push({
                label: `心情：${mood}（SAN+3）`,
        onClick: () => { dailyMoodCheckin(state, mood); saveGame(); showPeepsPanel(); }
      });
    });
  }
  opts.push({
    label: "✏️ 編輯留言板訊息",
    onClick: () => {
            const msg = prompt("請輸入留言板訊息：", state.whiteboardMessage || "");
      if (msg !== null) { state.whiteboardMessage = msg; saveGame(); }
      showPeepsPanel();
    }
  });
  opts.push({
    label: "📦 存入共用冰箱",
    disabled: state.resources.food <= 0 && state.resources.water <= 0,
    onClick: () => {
      const f = Math.min(1, state.resources.food);
      const w = Math.min(1, state.resources.water);
            const note = prompt("可留一段話給對方（選填）：", "");
      depositToFridge(state, f, w, note || null);
      saveGame();
      showPeepsPanel();
    }
  });
  opts.push({
        label: "🍽️ 提取共用冰箱（SAN+30）",
    disabled: state.sharedFridge.food <= 0 && state.sharedFridge.water <= 0,
    onClick: () => {
      const result = withdrawFromFridge(state);
      saveGame();
      if (result.ok) {
        showFridgeWithdrawTransition(result);
      } else {
        showPeepsPanel();
      }
    }
  });
  opts.push({
        label: "📤 產生同步碼",
    onClick: () => {
      const code = generateSyncCode(state);
            prompt("把這個同步碼分享給對方，讓他輸入到他的遊戲裡：", code);
      showPeepsPanel();
    }
  });
  opts.push({
        label: "📥 輸入對方的同步碼",
    onClick: () => {
            const code = prompt("請輸入對方提供的同步碼：", "");
      if (code) {
        const r = applySyncCode(state, code);
        if (r.ok) saveGame();
                else alert(r.reason === "duplicate_code" ? "這張同步碼已經套用過了，請向對方索取新的同步碼" : "同步碼無效");
      }
      showPeepsPanel();
    }
  });
  opts.push({ label: "🧑‍🤝‍🧑 小隊同伴管理", onClick: () => togglePanel("companions", showCompanionPanel) });
  opts.push({ label: "返回", variant: "ghost", onClick: renderMain });
  renderOptions(opts);
}

function addDiaryEntry() {
  const r = state.resources;
  const isNight = state.phase !== "day";
  const hpPct = state.hp / state.hpMax;
  const hpTag = hpPct <= 0.25 ? "🔴" : hpPct <= 0.55 ? "🟡" : "🟢";
  const foodTag = r.food <= 2 ? "⚠️" : "";
  const waterTag = r.water <= 2 ? "⚠️" : "";
  const entry = JSON.stringify({
    day: state.day - 1,
    phase: isNight ? "night" : "day",
    hp: `${hpTag}${state.hp}/${state.hpMax}`,
    food: `${foodTag}${r.food}`,
    water: `${waterTag}${r.water}`,
    defense: state.baseDefense,
    mood: state.mood || "",
    note: null
  });
  state.log.push(entry);
  if (state.log.length > 30) state.log.shift();
}

function showDiary() {
  renderStatusBar();
  if (!state.log.length) {
    renderText("還沒有任何記錄。", { kind: "event" });
    renderOptions([{ label: "返回", variant: "ghost", onClick: renderMain }]);
    return;
  }
  const entries = [...state.log].reverse().map(raw => {
    try {
      const e = JSON.parse(raw);
      const cls = e.phase === "night" ? "night-entry" : "day-entry";
      const icon = e.phase === "night" ? "🌙" : "☀️";
      const moodStr = e.mood ? ` · ${e.mood}` : "";
      const noteStr = e.note ? `<div style="margin-top:4px;color:#8a9099;font-size:12px">✏️ ${e.note}</div>` : "";
      return `<div class="diaryEntry ${cls}">
        <div class="diaryEntryDate">${icon} 第 ${e.day} 天${moodStr}</div>
        <div class="diaryEntryBody">❤️ ${e.hp} &nbsp; 🍎 ${e.food} &nbsp; 💧 ${e.water} &nbsp; 🛡️ ${e.defense}</div>
        ${noteStr}
      </div>`;
    } catch (_) {
      return `<div class="diaryEntry"><div class="diaryEntryBody">${raw}</div></div>`;
    }
  }).join("");
  renderText(`<div class="diaryPanel">${entries}</div>`);

  // Mood writing for today if no entry yet written today with a note
  const todayEntry = state.log.find(raw => { try { return JSON.parse(raw).day === state.day && JSON.parse(raw).note; } catch(_){return false;} });
  const opts = [];
  if (!todayEntry) {
    opts.push({ label: "✏️ 写下今日感受", onClick: () => showDiaryWrite() });
  }
  opts.push({ label: "返回", variant: "ghost", onClick: renderMain });
  renderOptions(opts);
}

function showDiaryWrite() {
  renderStatusBar();
  const moods = ["😊 安心", "😔 疲憊", "😨 擔心", "💪 今天没問題"];
  renderText("今天的心情怎麼樣？", { kind: "event" });
  renderOptions([
    ...moods.map(m => ({
      label: m,
      onClick: () => {
        const last = state.log[state.log.length - 1];
        if (last) {
          try {
            const e = JSON.parse(last);
            e.note = m;
            state.log[state.log.length - 1] = JSON.stringify(e);
          } catch(_) {
            state.log.push(JSON.stringify({ day: state.day, phase: state.phase, note: m }));
          }
        }
        saveGame();
        showDiary();
      }
    })),
    { label: "不寫了", variant: "ghost", onClick: showDiary }
  ]);
}

function applyFlagExploreBuff() {
  if (!Object.values(state.baseSlots || {}).includes("furn_flag")) return;
  if ((state.statusEffects || []).some(e => e.source === "furn_flag")) return;
  addStatusEffect(state, "atkBuff", 2, 1, "furn_flag");
}

function showExploreChoice() {
  applyFlagExploreBuff();
  renderStatusBar();
    renderText("你要往哪裡探索？", { kind: "event" });
  renderOptions([
    { label: "🔍 附近搜刮", hint: `體力-${actionStaminaCost(state, "explore_near")}`, onClick: doExplore },
        { label: "🚙 前往遠方地點", hint: `體力-${actionStaminaCost(state, "explore_far")}`, onClick: showLocationList },
    { label: "返回", variant: "ghost", onClick: renderMain },
  ]);
}

function doExplore() {
  const result = spendStamina(state, "explore_near");
  if (state.hp <= 0) { renderGameOver(); return; }
  const milestone = getMilestoneEvent(state);
  if (milestone) {
    state.milestonesShown.push(milestone.id);
    showEvent(milestone, () => finishAction(), result);
    return;
  }
  const cityReview = getCityReviewEvent(state);
  if (cityReview) {
    state.lastCityReviewDay = state.day;
    showEvent(cityReview, () => finishAction(), result);
    return;
  }
  const evt = pickEvent();
  showEvent(evt, () => finishAction(), result);
}

function showEvent(evt, onDone, staminaResult) {
  renderStatusBar();
  const text = evt.textFn
    ? evt.textFn(state)
    : evt.textPool
      ? evt.textPool[Math.floor(Math.random() * evt.textPool.length)]
      : evt.text;
  const overdrawText = staminaResult && staminaResult.overdraw ? overdrawFlavor(staminaResult.streak) : "";
  // #22-3：首次觸發事件額外給予獎勵晶燼（鼓勵探索新事件而非重複熟悉劇情）
  let firstText = "";
  if (evt.id) {
    if (!state.seenEvents) state.seenEvents = [];
    if (!state.seenEvents.includes(evt.id)) {
      state.seenEvents.push(evt.id);
      applyEffect({ embers: 2 });
            firstText = `

✨ 初次遇見此事件，額外獲得晶燼+2`;
    }
  }
  renderText(text + overdrawText + firstText, { kind: "event" });

  if (!evt.options || evt.options.length === 0) {
    renderOptions([{ label: "繼續", variant: "ghost", onClick: onDone }]);
    return;
  }

  const opts = evt.options.map(opt => {
    let lacking = false;
    let hint = "";
    if (opt.requiresResource) {
      for (const k in opt.requiresResource) {
        if ((state.resources[k] || 0) < opt.requiresResource[k]) lacking = true;
      }
      hint = lacking ? `??蝻箔?${RESOURCE_ICONS[Object.keys(opt.requiresResource)[0]] || ""}?抵?` : formatEffectInline(opt.effect);
    } else if (!opt.battle && !opt.roll) {
      hint = formatEffectInline(opt.effect);
    }
    return {
    label: opt.label,
    variant: opt.battle ? "danger" : undefined,
    hint: hint || undefined,
    disabled: lacking,
    onClick: () => {
      if (opt.requiresResource) {
        for (const k in opt.requiresResource) {
          if ((state.resources[k] || 0) < opt.requiresResource[k]) {
            renderText("資源不足，無法執行此選項。", { kind: "event" });
            renderOptions([{ label: "返回", variant: "ghost", onClick: () => showEvent(evt, onDone) }]);
            return;
          }
        }
      }
      if (opt.roll) {
        const outcome = Math.random() < opt.roll.chance ? opt.roll.success : opt.roll.fail;
        if (outcome.battle) {
          applyEffect(outcome.effect);
          renderText(outcome.resultText || "...", { kind: "event" });
          renderOptions([{ label: "繼續", variant: "ghost", onClick: () => startBattle(outcome.battle, onDone) }]);
          return;
        }
        const eff = applyEventEffect(outcome.effect);
        renderText((outcome.resultText || "...") + formatEffect(eff), { kind: "event" });
        renderOptions([{ label: "繼續", variant: "ghost", onClick: onDone }]);
        return;
      }
      if (opt.battle) {
        startBattle(opt.battle, onDone, false, { battleBonus: opt.battleBonus });
        return;
      }
      const eff = applyEventEffect(opt.effect);
      renderText((opt.resultText || "...") + formatEffect(eff), { kind: "event" });
      renderOptions([{ label: "繼續", variant: "ghost", onClick: onDone }]);
    }
  };});
  renderOptions(opts);
}

const RISK_LABELS = { 1: "雿?", 2: "銝?", 3: "擃?", 4: "璆菟?" };
const RISK_CLASS = { 1: "low", 2: "mid", 3: "high", 4: "extreme" };

const SEARCH_BEATS = {
  1: [
        "你在附近的廢墟裡翻找，找到了一些還算有用的東西。",
        "周圍很安靜，搜刮起來格外順手。",
    "角落堆滿雜物，仔細翻找後總有些收穫。"
  ],
  2: [
        "這裡似乎曾有人居住過，留下了一些痕跡。",
    "空氣中瀰漫著淡淡的腐朽氣味，但你還是找到了東西。",
    "遠方似乎傳來幾聲悶響，但很快又恢復平靜。"
  ],
  3: [
        "四周散落著破損的痕跡，看來這裡曾發生過激烈衝突。",
    "你小心翼翼地避開可疑的角落，專心搜刮。",
    "你聽見遠處傳來低沉的咆哮，加快腳步完成搜索。"
  ],
  4: [
        "這裡的一切都透露著不祥，但收穫往往也最豐厚。",
    "你聽見遠處傳來低沉的咆哮，加快腳步完成搜索。",
    "這裡的一切都透露著不祥，但收穫往往也最豐厚。"
  ]
};

// 依拾獲物品類別分類的戰利品描述文案池（2026-07-01擴充：每類2→6句，降低遠行探索的重複感）
const LOOT_FLAVOR_BY_TYPE = {
  weapon: [
    "在廢墟深處，你找到了一件武器。",
    "你撿到一把還能使用的武器。",
    "武器的握把還殘留著前任主人的痕跡，你稍微擦拭後試了試手感。",
    "你在一堆雜物底下摸到了冰冷的金屬觸感，拉出來一看，是件能派上用場的武器。",
    "這件武器看起來有些年頭了，但刃口依然堅硬，稍加保養應該還能用。",
    "你小心翼翼地取出這件武器，確認沒有陷阱後才放進背包。"
  ],
  armor: [
    "塵封已久的防具，拍掉灰塵後似乎還能用。",
    "一件還算完整的防具被你翻了出來。",
    "你試穿了一下這件防具，尺寸出乎意料地合身。",
    "防具表面雖然有些磨損，但關鍵部位的結構依然堅固。",
    "你在角落發現了這件被遺棄的防具，看起來還能撐過幾次戰鬥。",
    "拍掉厚厚一層灰後，這件防具的內裡竟然出奇地乾淨。"
  ],
  consumable_food: [
    "運氣不錯，挖到了沒有過期的食物。",
    "找到了一些保存尚可的食物。",
    "罐頭上的標籤雖然褪色，但封口完好，應該還能安心食用。",
    "你翻出了幾包真空包裝的乾糧，包裝完整得令人意外。",
    "儲藏櫃深處還藏著一些沒被翻動過的食物，算是意外之喜。",
    "食物的份量不多，但在這種時候，每一口都彌足珍貴。"
  ],
  consumable_water: [
    "你小心地收集起殘留的飲用水。",
    "瓶子裡還剩下一些乾淨的飲水。",
    "你找到了幾瓶密封完好的水，瓶身上的灰塵拍掉後依然清澈。",
    "水龍頭裡竟然還能擠出幾滴乾淨的水，你趕緊收集進水壺。",
    "儲水桶底部還剩下一些沉澱後的清水，勉強能喝。",
    "你撿到一瓶未開封的礦泉水，在這種日子裡簡直像是中獎。"
  ],
  consumable_medicine: [
    "找到了還能使用的醫療物資。",
    "一些醫療用品，雖然不多但能應急。",
    "藥箱裡的繃帶雖然有些過期，但緊急時刻還是能派上用場。",
    "你翻出了幾包消毒棉片跟藥品，包裝都還算完整。",
    "這些醫療用品被小心地收在防潮袋裡，狀況比想像中好。",
    "你在急救箱底層找到了一些被遺漏的藥品，及時補充了庫存。"
  ],
  material: [
    "撿到了不少可以回收利用的廢料。",
    "翻找出一些金屬零件，看起來還能用。",
    "你把散落一地的零件一一撿起，分類後估計還能派上用場。",
    "這堆廢棄材料雖然生鏽，但拆解後的部分零件依然完好。",
    "你在角落發現了一批堆積的金屬廢料，重量比想像中沉。",
    "這些回收材料雖然不起眼，但拿去加工說不定能派上大用場。"
  ]
};

const LOOT_TEXTS = [
    "你撿到一些零碎的物品，看起來還算實用。",
    "翻找一番後，總算有些收穫。",
    "你找到了一點額外的東西，收進了背包。",
  "雖然不起眼，但這東西或許用得上。"
];
// 2026-07-01擴充：每個地點從1句固定台詞→3句輪流，其餘11個原本沒有專屬台詞、共用同一句預設文案的地點也一併補齊
const ENCOUNTER_TEXTS = {
  loc_residential: [
    "突如其來的襲擊，你被迫展開戰鬥！",
    "衣櫃門猛然被撞開，一道扭曲的身影朝你撲了過來！",
    "樓梯間傳來一聲怒吼，感染者已經欺身而至，戰鬥無可避免！"
  ],
  loc_park: [
    "草叢後方竄出威脅，你不得不迎戰！",
    "枯樹後的陰影忽然動了起來，朝你逼近！",
    "一聲刺耳的嘶吼劃破寧靜，戰鬥就此展開！"
  ],
  loc_gas_station: [
    "油漬中竄出一道黑影，攻擊來得又急又快！",
    "加油機後方傳來低吼，你被迫拔出武器應戰！",
    "一團扭曲的身影從陰影中衝出，戰鬥瞬間爆發！"
  ],
  loc_store: [
    "貨架後方竄出了威脅，你必須應戰！",
    "冷凍櫃的門猛然彈開，裡頭的東西朝你撲來！",
    "貨架深處傳來玻璃碎裂聲，緊接著威脅撲面而來！"
  ],
  loc_school: [
    "教室門被猛力撞開，威脅近在眼前！",
    "走廊盡頭傳來奔跑聲，感染者已經衝到你面前！",
    "置物櫃裡竄出一道身影，戰鬥猝不及防地展開！"
  ],
  loc_hospital: [
    "病房深處傳來威脅的氣息，戰鬥無可避免！",
    "病床簾幕猛然被扯開，扭曲的身影直撲而來！",
    "走廊盡頭的腳步聲越來越近，你被迫拔劍應戰！"
  ],
  loc_factory: [
    "生產線後方傳出金屬碰撞聲，威脅已經逼近！",
    "機械臂陰影下竄出一道扭曲的身影，攻擊隨即而至！",
    "廠房深處爆出一聲怒吼，戰鬥毫無預警地開始！"
  ],
  loc_warehouse: [
    "貨箱堆疊的陰影裡竄出威脅，你來不及反應！",
    "起重機的陰影下傳來低吼，戰鬥瞬間爆發！",
    "一道身影從貨架縫隙中撲出，你被迫拔刀迎戰！"
  ],
  loc_military: [
    "軍事基地的防禦系統發現了你，戰鬥開始！",
    "警報聲驟然響起，全副武裝的威脅朝你逼近！",
    "鐵絲網後方竄出扭曲的身影，戰鬥一觸即發！"
  ],
  loc_camp: [
    "營地邊界突然騷動，威脅已經闖了進來！",
    "篝火旁的陰影忽然站起身，朝你發出低吼！",
    "帳篷後方傳來慘叫，感染者已經混進了營地！"
  ],
  loc_ruins_lab: [
    "實驗艙的艙門猛然彈開，扭曲的存在朝你逼近！",
    "監視器畫面驟然爆出雜訊，威脅隨之現身！",
    "走廊深處傳來玻璃碎裂的聲響，戰鬥毫無預警地展開！"
  ],
  loc_sunken_subway: [
    "積水中竄出一道身影，戰鬥在月台上瞬間爆發！",
    "車廂內傳來低沉的嘶吼，威脅已經欺身而至！",
    "隧道深處的黑暗中衝出扭曲的存在，你被迫應戰！"
  ],
  loc_cyber_factory: [
    "巨大的機械手臂猛然轉向，鎖定了你的位置！",
    "生產線深處傳來液壓聲，扭曲的鋼鐵巨怪已經逼近！",
    "齒輪組驟然加速運轉，威脅隨著警報聲一同降臨！"
  ],
  loc_flooded_hospital: [
    "積水中竄出滑膩的身影，攻擊猝不及防地到來！",
    "病床簾幕後傳出低吼，寄生的威脅已經現身！",
    "水面下的黑影驟然浮出，戰鬥瞬間展開！"
  ],
  loc_aero_broadcasting: [
    "懸浮的鐵皮驟然墜落，威脅隨之從霧中現身！",
    "靜電風暴中竄出扭曲的身影，戰鬥猝不及防！",
    "電塔基座傳來刺耳警鳴，威脅已經鎖定了你！"
  ],
  // 2026-07-01新增：對應新增的6個地點
  loc_parking_garage: [
    "車殼後方竄出一道身影，戰鬥在停車格間瞬間爆發！",
    "電梯井傳來重物墜落聲，威脅已經欺身而至！",
    "樓層陰影裡衝出扭曲的存在，你被迫拔出武器應戰！"
  ],
  loc_flea_market: [
    "布棚後方竄出威脅，攤位瞬間被撞得東倒西歪！",
    "貨堆深處傳來低吼，戰鬥猝不及防地展開！",
    "一道身影從燈籠陰影下撲出，你來不及反應！"
  ],
  loc_farmstead: [
    "穀倉深處竄出扭曲的身影，戰鬥在乾草堆間爆發！",
    "稻草人猛然轉頭朝你逼近，你被迫拔刀迎戰！",
    "風車後方傳來低吼，威脅已經欺身而至！"
  ],
  loc_greenhouse_ruins: [
    "藤蔓叢中竄出扭曲的身影，戰鬥瞬間展開！",
    "培育架後傳來低吼，威脅已經鎖定了你！",
    "根系猛然收緊纏繞，你被迫掙脫並拔劍應戰！"
  ],
  loc_church: [
    "長椅後方竄出威脅，戰鬥在殿堂裡瞬間爆發！",
    "鐘樓傳來刺耳鳴響，扭曲的身影隨之逼近！",
    "祭壇陰影中衝出扭曲的存在，你被迫應戰！"
  ],
  loc_bunker: [
    "氣密門後竄出全副武裝的威脅，戰鬥一觸即發！",
    "控制室警報驟然響起，扭曲的存在朝你逼近！",
    "通風管道深處傳來咆哮，威脅已經欺身而至！"
  ]
};

const LOCATIONS_PER_VISIT = 3;
const DISTANCE_LABELS = { near: "近距離", far: "遠距離（額外消耗食物/飲水1）" };

function showLocationList() {
  renderStatusBar();
    renderText("請選擇要前往的地點：", { kind: "event" });
  // V2.0：unlockFlag解鎖判定（與unlockDay任一滿足即可解鎖地點）
  const available = LOCATIONS.filter(l => state.day >= (l.unlockDay || 1) || (l.unlockFlag && state.flags && state.flags[l.unlockFlag]));
  const choices = pickLocations(available, LOCATIONS_PER_VISIT, Math.random);
  const opts = choices.map(loc => ({
    label: `<span class="icon inline" title="${loc.icon}">${locationIconSvg(loc)}</span> ${loc.name}`,
    hint: `風險：${RISK_LABELS[loc.riskLevel] || loc.riskLevel}｜${DISTANCE_LABELS[loc.distance]}${loc.distance === "far" ? `，體力-${actionStaminaCost(state, "explore_far", loc)}` : ""}${getLocationOverpower(state, loc).highDanger ? "｜⚠️ 此地點威脅等級超出你目前實力，請謹慎前往" : ""}`,
    variant: RISK_CLASS[loc.riskLevel] === "extreme" || RISK_CLASS[loc.riskLevel] === "high" ? "danger" : undefined,
    disabled: loc.distance === "far" && (state.resources.food < FAR_TRAVEL_COST.food || state.resources.water < FAR_TRAVEL_COST.water),
    onClick: () => {
      if (loc.distance === "far" && (state.resources.food < FAR_TRAVEL_COST.food || state.resources.water < FAR_TRAVEL_COST.water)) return;
      visitLocation(loc);
    }
  }));
  opts.push({ label: "返回", variant: "ghost", onClick: showExploreChoice });
  renderOptions(opts);
}

function visitLocation(loc) {
  const stResult = spendStamina(state, loc.distance === "far" ? "explore_far" : "explore_near", loc);
  if (state.hp <= 0) { renderGameOver(); return; }
  let travelText = stResult.overdraw ? overdrawFlavor(stResult.streak) : "";
  if (loc.distance === "far") {
    applyEffect({ resources: { food: -FAR_TRAVEL_COST.food, water: -FAR_TRAVEL_COST.water } });
    travelText += `
🚗 遠行消耗：${formatEffect({ resources: { food: -FAR_TRAVEL_COST.food, water: -FAR_TRAVEL_COST.water } })}`;
  }

  const result = resolveLocation(loc, Math.random, state);
  if (result.type === "battle") {
    renderStatusBar();
    const encounterPool = ENCOUNTER_TEXTS[loc.id];
    const encounterLine = encounterPool ? encounterPool[Math.floor(Math.random() * encounterPool.length)] : "未知的威脅突然出現，你被迫戰鬥！";
    renderText(`${encounterLine}${travelText}`, { kind: "battle" });
        renderOptions([{ label: "⚔️ 應戰", variant: "danger", onClick: () => startBattle(result.enemyId, () => finishAction(), false, { loc }) }]);
    return;
  }

let effectText = "";
  let lootFlavorPool;
  const qty = stResult.overdraw ? Math.max(1, Math.floor(result.qty * stResult.resourceMultiplier)) : result.qty;
  if (RESOURCE_DROP_KEYS.includes(result.itemId)) {
    applyEffect({ resources: { [result.itemId]: qty } });
    effectText = formatEffect({ resources: { [result.itemId]: qty } });
    lootFlavorPool = result.itemId === "scrap" ? LOOT_FLAVOR_BY_TYPE.material : (LOOT_FLAVOR_BY_TYPE["consumable_" + result.itemId] || LOOT_TEXTS);
  } else {
    addItemToInventory(result.itemId, qty);
    const item = ITEMS[result.itemId];
    effectText = `
獲得 ${item.icon} ${item.name} x${qty}`;
    if (item.type === "weapon") lootFlavorPool = LOOT_FLAVOR_BY_TYPE.weapon;
    else if (item.type === "armor") lootFlavorPool = LOOT_FLAVOR_BY_TYPE.armor;
    else if (item.useEffect && item.useEffect.resources) {
      const key = Object.keys(item.useEffect.resources)[0];
      lootFlavorPool = LOOT_FLAVOR_BY_TYPE["consumable_" + key] || LOOT_TEXTS;
    } else {
      lootFlavorPool = LOOT_TEXTS;
    }
  }
  renderStatusBar();
  const beats = SEARCH_BEATS[loc.riskLevel] || SEARCH_BEATS[1];
  const anomalyPool = loc.anomalyTextPool || (loc.anomalyText ? [loc.anomalyText] : null);
  const beat = anomalyPool ? anomalyPool[Math.floor(Math.random() * anomalyPool.length)] : beats[Math.floor(Math.random() * beats.length)];
  const flavor = lootFlavorPool[Math.floor(Math.random() * lootFlavorPool.length)];
  renderText(`你在${loc.icon}${loc.name}：${beat}

${flavor}${effectText}${travelText}`, { kind: "event" });
  renderOptions([{ label: "繼續", variant: "ghost", onClick: () => finishAction() }]);
}

function doConvert() {
  const result = spendStamina(state, "convert");
  if (state.hp <= 0) { renderGameOver(); return; }
  const gain = convertScrap(state, Math.random);
  applyEffect({ resources: { scrap: -CONVERT_SCRAP_COST, ...gain } });
  renderStatusBar();
    const flavor = "你將廢料分類整理，轉換成了可用的資源。";
  const overdrawText = result.overdraw ? overdrawFlavor(result.streak) : "";
  renderText(flavor + overdrawText + "\n\n" + formatEffect({ resources: gain }), { kind: "event" });
  renderOptions([{ label: "繼續", variant: "ghost", onClick: () => finishAction() }]);
}

const GATHER_TEXTS = [
    "你在附近仔細搜尋，採集到了一些補給品。",
    "周圍的環境提供了不少能用的資源。",
    "你花了點時間，但收穫還算不錯。",
    "這片區域的資源比想像中豐富。",
    "辛苦的採集總算有了回報。",
  "你把能用的東西都收集了起來。"
];
function doGather() {
  const result = spendStamina(state, "gather");
  if (state.hp <= 0) { renderGameOver(); return; }
  state.questFlags.gatherTodayCount = (state.questFlags.gatherTodayCount || 0) + 1; // 任務系統：side_explore_daily_gather計數
  const gain = gatherYield(Math.random, state);
  if (result.overdraw) {
    for (const k in gain) gain[k] = Math.floor(gain[k] * result.resourceMultiplier);
  }
  applyEffect({ resources: gain });
  renderStatusBar();
  const flavor = GATHER_TEXTS[Math.floor(Math.random() * GATHER_TEXTS.length)];
  const overdrawText = result.overdraw ? overdrawFlavor(result.streak) : "";
  renderText(flavor + overdrawText + "\n\n" + formatEffect({ resources: gain }), { kind: "event" });
  renderOptions([{ label: "繼續", variant: "ghost", onClick: () => finishAction() }]);
}

function showLounge() {
  renderStatusBar();
  const companionName = state.companions ? Object.keys(state.companions)[0] : null;
  const result = loungeInteract(state, companionName);
  saveGame();
    renderText(`🛋️ ${result.text}
SAN已恢復，休息品質提升+10`, { kind: "event" });
  renderOptions([{ label: "返回", variant: "ghost", onClick: renderMain }]);
}

function doRest() {
  if (state.phase === "night" && isThreatDue(state)) {
    startBloodMoonNight();
    return;
  }
  if (state.phase === "night" && Math.random() < raidChance(state)) {
    const raidSanBonus = sumFurnitureEffect(state, "raidSanBonus");
        let raidText = "夜裡突然傳來騷動，敵人摸進了據點！";
    if (raidSanBonus > 0) {
      state.san = clamp(state.san + raidSanBonus, 0, getEffectiveSanMax(state));
            raidText += `
🌿 家具的安撫效果讓你冷靜下來，SAN+${raidSanBonus}`;
    }
    const turretShock = Object.values(state.baseSlots || {}).includes("furn_turret") ? 30 : 0;
    if (turretShock > 0) {
            raidText += `
⚡ 自動槍塔率先開火，給予敵人重創-30`;
    }
    renderStatusBar();
    renderText(raidText, { kind: "battle" });
    renderOptions([{ label: "⚔️ 應戰", variant: "danger", onClick: () => {
      sessionStorage.setItem("embers_battle_snap", JSON.stringify({ stateSnap: JSON.stringify(state), enemyId: "enemy_walker_weak", turretShock }));
      startBattle("enemy_walker_weak", () => endPhase(), false, { isNightRaid: true });
      if (turretShock > 0) {
        pendingBattle.enemy.hpLeft = Math.max(1, pendingBattle.enemy.hpLeft - turretShock);
                renderBattle(`⚡ 槍塔的電擊讓敵人踉蹌了一下！`);
      }
    } }]);
    return;
  }

  if (state.resources.food <= 0 || state.resources.water <= 0) {
    renderStatusBar();
        renderText("沒有足夠的食物或飲水，無法好好休息。", { kind: "event" });
    renderOptions([{ label: "繼續", variant: "ghost", onClick: () => endPhase() }]);
    return;
  }
  const gain = { hp: 15 + restHealAmount(state), resources: { food: -1, water: -1 } };
  applyEffect(gain);
  state.san = clamp(state.san + restSanRegen(state), 0, getEffectiveSanMax(state));
  renderStatusBar();
    renderText("你躺下好好休息了一陣子。" + formatEffect(gain), { kind: "event" });
  renderOptions([{ label: "繼續", variant: "ghost", onClick: () => endPhase() }]);
}

function startBloodMoonNight() {
  clearUpcomingThreat(state);
  document.body.classList.add("blood-moon");
  showBloodMoonTransition(() => {
    const defense = resolveBloodMoonDefense(state);
    const pct = Math.round(defense.defenseRatio * 100);
    const blockText = defense.wavesBlocked > 0
      ? `🛡️ 你的防禦設施擋下了這波攻擊的大半，損失減輕了不少！`
      : `🛡️ 防禦力不足，僅能抵擋${pct}%的攻勢，準備迎戰吧！`;
    renderStatusBar();
    const introText = BLOOD_MOON_INTRO_TEXTS[Math.floor(Math.random() * BLOOD_MOON_INTRO_TEXTS.length)];
    renderText(`🌙 ${introText}
${blockText}`, { kind: "battle" });

    const waves = [];
    if (defense.wavesBlocked === 0) waves.push({ enemyId: "enemy_walker_brute", extraTier: 1 });
    waves.push({ enemyId: "enemy_cyborg_nemesis", extraTier: 1 });

        renderOptions([{ label: "⚔️ 迎戰", variant: "danger", onClick: () => runBloodMoonWave(waves, 0) }]);
  });
}

function runBloodMoonWave(waves, idx) {
  if (idx >= waves.length) {
    // 任務系統：main_05/ach_blood_moon_streak3計數（戰敗=死亡=新局重開，questFlags隨defaultState()重置，不需要額外的「戰敗歸零」邏輯）
    state.questFlags.bloodMoonSurvivedCount = (state.questFlags.bloodMoonSurvivedCount || 0) + 1;
    state.questFlags.bloodMoonWinStreak = (state.questFlags.bloodMoonWinStreak || 0) + 1;
    const reward = bloodMoonRewards(state);
    document.body.classList.remove("blood-moon");
    renderStatusBar();
    let unlockText = "";
    if (reward.unlockedLocation) {
      const loc = LOCATIONS.find(l => l.id === reward.unlockedLocation);
            unlockText = `

🔓 你在血月之夜的勝利解鎖了新的地點：${loc ? loc.icon + " " + loc.name : reward.unlockedLocation}，可以前往探索了！`;
    }
    const victoryText = BLOOD_MOON_VICTORY_TEXTS[Math.floor(Math.random() * BLOOD_MOON_VICTORY_TEXTS.length)];
    renderText(`🎉 ${victoryText}${formatEffect(reward)}${unlockText}`, { kind: "event" });

    const zone = getTierZoneForBloodMoonWin(state);
    if (zone) {
      renderOptions([{ label: "繼續", variant: "ghost", onClick: () => startTierZoneBattle(zone) }]);
    } else {
      renderOptions([{ label: "繼續", variant: "ghost", onClick: () => endPhase() }]);
    }
    return;
  }
  const w = waves[idx];
  startBattle(w.enemyId, () => runBloodMoonWave(waves, idx + 1), false, { extraTier: w.extraTier, bloodMoon: true });
}

function startTierZoneBattle(zone) {
  renderText(`🔓 偵測到行政區「${zone.name}」的防禦核心，擊敗指揮官即可徹底解放此區域
${zone.psychicNote}`, { kind: "event" });
    renderOptions([{ label: "⚔️ 開戰", variant: "danger", onClick: () => startBattle(zone.bossEnemyId, () => onTierZoneWon(zone), false, { extraTier: zone.extraTier }) }]);
}

function onTierZoneWon(zone) {
  state.flags[zone.flag] = true;
  applyEffect(zone.reward);
  renderStatusBar();
  renderText(`🔓 「${zone.name}」已被你解放！
${formatEffect(zone.reward)}`, { kind: "event" });
  renderOptions([{ label: "繼續", variant: "ghost", onClick: () => endPhase() }]);
}

function showBloodMoonTransition(callback) {
  const overlay = document.createElement("div");
  overlay.className = "bloodMoonTransition";
  overlay.innerHTML = `
    <div class="line">📦 正在存取共用冰箱……</div>
    <div class="line">資料同步中…</div>
    <div class="line">SAN值穩定下降中</div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => {
    overlay.remove();
    callback();
  }, 2600);
}

function showFridgeWithdrawTransition(result) {
  const overlay = document.createElement("div");
  overlay.className = "bloodMoonTransition fridgeTransition";
  const lines = [`📦 你打開了共用冰箱`, `🍽️ 食物${result.food} 飲水${result.water}，SAN+30`];
    if (result.note) lines.push(`✉️ 便條：「${result.note}」`);
  overlay.innerHTML = lines.map(l => `<div class="line">${l}</div>`).join("");
  document.body.appendChild(overlay);
  setTimeout(() => {
    overlay.remove();
    showPeepsPanel();
  }, 2600);
}

// ---------- 設施標籤/敘述（22.2 設施強化）----------
const FACILITY_LABELS = {
  command: "🛡️ 指揮核心",
  greenhouse: "🪴 溫室",
  workshop: "🔧 工坊",
    radar: "📡 雷達站",
};
const FACILITY_DESCS = {
  command: "Lv1 解鎖指揮中心，Lv2 夜襲機率-20%，Lv3 解鎖阿卡（爆破手）同伴招募",
  greenhouse: "Lv1 每階段產出食物+1，Lv2 每階段產出飲水+1，Lv3 休息時SAN額外回復+50%",
    workshop: "降低裝備強化所需的廢料消耗",
    radar: "提升遠方地點的偵測範圍",
};
// D: 入夜/破曉過場動畫
function showNightTransition(callback) {
  const overlay = document.createElement("div");
  overlay.className = "phaseTransition nightTransition";
  overlay.innerHTML = `
    <div class="ptIcon">🌙</div>
    <div class="ptTitle">入　夜</div>
    <div class="ptSub">夜幕低垂，危機四伏</div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => { overlay.remove(); callback(); }, 2400);
}

function showDawnTransition(callback) {
  const overlay = document.createElement("div");
  overlay.className = "phaseTransition dawnTransition";
  overlay.innerHTML = `
    <div class="ptIcon">🌅</div>
    <div class="ptTitle">破　曉</div>
    <div class="ptSub">Day ${state.day} — 新的開始</div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => { overlay.remove(); callback(); }, 2400);
}

// 任務系統：主線第7章「畢業」收尾（非遊戲結局，是無限模式下的引導結束提示）
function showGraduationTransition(callback) {
  const overlay = document.createElement("div");
  overlay.className = "phaseTransition graduationTransition";
  overlay.innerHTML = `
    <div class="ptIcon">🎓</div>
    <div class="ptTitle">畢　業</div>
    <div class="ptSub">主線引導結束，之後請自由探索支線</div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => { overlay.remove(); callback(); }, 2400);
}

function doReinforce() {
  renderStatusBar();
  const cost = reinforceCost(state);
  const options = FACILITY_KEYS.map((key) => {
    const lv = state.facilities[key] || 0;
    const label = `${FACILITY_LABELS[key]} Lv${lv}${lv >= 3 ? "（已達最高等級）" : ` →Lv${lv + 1}`}`;
    return {
      label,
      hint: lv >= 3 ? "已達上限" : `：${cost}📦，${FACILITY_DESCS[key]}`,
      disabled: lv >= 3 || state.resources.scrap < cost,
      onClick: () => doReinforceFacility(key, cost),
    };
  });
  options.push({ label: "返回", variant: "ghost", onClick: () => finishAction() });
  renderText(`選擇要強化的設施，目前廢料：${state.resources.scrap}📦`, { kind: "event" });
  renderOptions(options);
}
function doReinforceFacility(key, cost) {
  if (state.resources.scrap < cost) {
        renderText(`廢料不足，強化需${cost}📦，目前只有${state.resources.scrap}📦`, { kind: "event" });
    renderOptions([{ label: "繼續", variant: "ghost", onClick: () => finishAction() }]);
    return;
  }
  const result = spendStamina(state, "reinforce");
  if (state.hp <= 0) { renderGameOver(); return; }
  applyEffect({ resources: { scrap: -cost } });
  if (state.reinforceDiscount) consumeReinforceDiscount(state);
  reinforceFacility(state, key);
  const overdrawText = result.overdraw ? overdrawFlavor(result.streak) : "";
  renderText(`你強化了${FACILITY_LABELS[key]}，現在是 Lv${state.facilities[key]}${overdrawText}`, { kind: "event" });
  renderOptions([{ label: "繼續", variant: "ghost", onClick: () => finishAction() }]);
}

function finishAction() {
  applyActionRegen(state);
  if (state.hp <= 0) {
    renderGameOver();
    return;
  }
  const qr = runQuestCheck();
  saveGame();
  if (qr.graduated) { showGraduationTransition(() => renderMain()); return; }
  renderMain();
}

function endPhase() {
  const died = applyPhaseDecay(state);
  if (died) {
    renderGameOver();
    return;
  }
  const prevDay = state.day;
  const prevPhase = state.phase;
  advancePhase(state);
  if (state.day !== prevDay) {
    addDiaryEntry();
    state.questFlags.gatherTodayCount = 0; // 任務系統：每日重置型支線計數器，跨日清零
  }
  // 2026-07-02移除：舊「四大設備全Lv3+擊敗終域Boss→沙盒結局」判斷(longTermGoalMet/renderSandboxEnding)，
  // 與規格文件已定案的「無限模式沒有結局，只收斂到畢業」矛盾，且該條件在正常遊玩中無法達成(finalBossDefeated從未被設置)，
  // 純屬死程式碼。「主線完成」的提示改由下面既有的畢業機制單獨負責，不需要新增任何東西。
  const qr = runQuestCheck();
  saveGame();
  if (qr.graduated) { showGraduationTransition(() => renderMain()); return; }
  // D: phase transition animation
  if (prevPhase === "day" && state.phase !== "day") {
    showNightTransition(() => renderMain());
  } else if (prevPhase !== "day" && state.phase === "day") {
    showDawnTransition(() => renderMain());
  } else {
    renderMain();
  }
}

function renderGameOver(isPrologue) {
  clearTurbo();
  document.body.classList.remove("blood-moon");
  if (isPrologue) {
    const ending = getActivePrologueChapter(state).endings.dead;
    screen.innerHTML = `<div class="storyCard gameover"><h1>${ending.title}</h1>${ending.text.replace(/\n/g, "<br>")}</div>`;
    const box = document.createElement("div");
    box.className = "optionBox";
    const btn = document.createElement("button");
    btn.className = "choiceBtn primary";
    btn.textContent = "重新開始";
    btn.onclick = () => {
      state = defaultState();
      startPrologue();
    };
    box.appendChild(btn);
    screen.appendChild(box);
    return;
  }
  screen.innerHTML = `<div class="storyCard gameover"><h1>你已死亡</h1>第${state.day}天，你的旅程在此結束……</div>`;
  const box = document.createElement("div");
  box.className = "optionBox";
  const btn = document.createElement("button");
  btn.className = "choiceBtn primary";
  btn.textContent = "重新挑戰";
  btn.onclick = () => {
    if (confirm("確定要放棄目前進度重新開始嗎？此動作無法復原。")) {
      localStorage.removeItem(SAVE_KEY);
      state = defaultState();
      startPrologue();
    }
  };
  box.appendChild(btn);
  screen.appendChild(box);
  statusBar.innerHTML = "";
  saveGame();
}

// ---------- 戰鬥 ----------
function startBattle(enemyId, onEnd, isPrologue, opts = {}) {
  battleSysLog = []; // v181：新戰鬥開始時清空上一場的副數據流紀錄
  const due = !isPrologue && isThreatDue(state);
  const { battleBonus, loc, bloodMoon, ...scaleOpts } = opts;
  const overpower = isPrologue ? null : getLocationOverpower(state, loc);
  const enemyData = isPrologue ? ENEMIES[enemyId] : getScaledEnemy(enemyId, state, { ...scaleOpts, extraTier: (scaleOpts.extraTier || 0) + (due ? 1 : 0), enemyMult: overpower ? overpower.enemyMult : 1 });
  if (due) clearUpcomingThreat(state);
  pendingBattle = {
    enemy: { ...enemyData, hpLeft: enemyData.hp },
    onEnd,
    isPrologue: !!isPrologue,
    battleBonus,
    overpower,
    bloodMoon: !!bloodMoon,
    loc: loc || null // v182：gaia_armor「荒野每回合回HP」判定用——有loc代表是探索遭遇戰，血月/據點防衛戰沒有loc
  };
  pushSysLog(`[ENCOUNTER] ${enemyData.id || enemyData.name} HP=${enemyData.hp} ATK=${enemyData.atk}`);
  renderBattle(`你遭遇了${enemyData.name}，戰鬥開始！`);
}

function renderBattle(message) {
  renderStatusBar();
  const b = pendingBattle;
  const pct = Math.max(0, (b.enemy.hpLeft / b.enemy.hp) * 100);
  const myStats = getEffectiveStats(state);
  const enemyDef = getShreddedDef(b.enemy);
  const enemySrc = resolveAsset("enemy", b.enemy.id);
  renderText(`
    <div class="enemyCard">
      <div class="icon" title="${b.enemy.icon}">${enemySrc ? `<img class="pixelImg enemyImg" src="${enemySrc}" alt="${b.enemy.name}">` : pixelIconSvg(b.enemy.id || b.enemy.name, "enemy")}</div>
      <div class="info">
        <div class="name">${b.enemy.name}</div>
        <div class="enemyHpTrack"><div class="enemyHpFill" style="width:${pct}%"></div></div>
        <div class="enemyHpText">HP ${Math.max(0, b.enemy.hpLeft)}/${b.enemy.hp}</div>
      </div>
    </div>
    <div class="vsCompare">
      <span class="vsSelf">⚔️你 ❤️${state.hp}/${state.hpMax} ⚔️${myStats.atk} 🛡️${myStats.def}</span>
      <span class="vsEnemy">${b.enemy.name} ⚔️${b.enemy.atk} 🛡️${enemyDef}</span>
    </div>
        ${message}${sysLogHtml()}`, { kind: "battle" });
  renderOptions([
        { label: "⚔️ 攻擊" + (b.bloodMoon ? "（長按連擊）" : ""), variant: "danger", onClick: battleAttack, turbo: !!b.bloodMoon },
    { label: "🏃 逃跑", variant: "ghost", onClick: battleFlee }
  ]);
}

function resolveEnemyHit(b, myStats) {
  if (b.enemy.stunned) {
    b.enemy.stunned = false;
    return { dmg: 0, dodged: false, stunned: true };
  }
  if (Math.random() < getDodgeChance(state)) return { dmg: 0, dodged: true };
  let dmg = Math.max(1, b.enemy.atk - myStats.def);
  dmg = Math.round(dmg * (1 - getBattleDamageReductionRatio(state)));
  return { dmg: Math.max(0, dmg), dodged: false };
}

function applyEnemyDamage(rawDmg) {
  maybeGenerateShield(state, rawDmg);
  const dmg = absorbShield(state, rawDmg);
  applyEffect({ hp: -dmg });
  if (state.hp <= 0 && gaiaCheatDeath(state)) {
        return `
🌿 蓋亞血脈守護著你，逃過了這次死劫！`;
  }
  return "";
}

function calcAttackDamage(b) {
  const myStats = getEffectiveStats(state);
  const enemyDef = Math.round(getShreddedDef(b.enemy) * (1 - getIgnoreDefRatio(state)));
  let dmg = Math.max(1, myStats.atk - enemyDef);
  let crit = false;
  if (Math.random() < getCritChance(state)) {
    dmg = Math.round(dmg * getCritMultiplier(state));
    crit = true;
  }
  dmg = Math.round(dmg * getFactionDamageMultiplier(state, b.enemy) * getMechanicalDamageMultiplier(state, b.enemy) * getBossFactionCounterMult(state, b.enemy));
  if (b.overpower && b.overpower.dmgMult !== 1) dmg = Math.round(dmg * b.overpower.dmgMult); // v1.7 #19：背水一戰傷害加成
  return { dmg, crit };
}

function battleAttack() {
  const b = pendingBattle;
  if (!b) { clearTurbo(); return; } // Turbo Click連擊時若戰鬥已結束，立即停止避免持續觸發
  b.turn = (b.turn || 0) + 1;
  consumeAmmoForAttack(state);
  let extraText = "";
  if (!b.firstRoundDone) {
    b.firstRoundDone = true;
    const acc = getEquipRef(state, state.equipment && state.equipment.accessory);
    if (acc && acc.item && acc.item.id === "cyber_pendant") {
      const extra = calcAttackDamage(b);
      b.enemy.hpLeft -= extra.dmg;
      extraText = `
🩸 你吸取了敵人的生命力，回復HP+${extra.dmg}`;
      if (b.enemy.hpLeft <= 0) b.enemy.hpLeft = 0;
    }
  }
  // v182：大氣靈能重弩(aero_crossbow)——先手率10%，每次攻擊有機率搶先造成一次額外傷害(原本「未接入先手判定」)
  const weaponRef = getEquipRef(state, state.equipment && state.equipment.weapon);
  if (weaponRef && weaponRef.item && weaponRef.item.id === "aero_crossbow" && b.enemy.hpLeft > 0 && Math.random() < 0.10) {
    const preempt = calcAttackDamage(b);
    b.enemy.hpLeft -= preempt.dmg;
    extraText += `
🏹 大氣靈能重弩搶得先機，額外造成${preempt.dmg}點傷害！`;
    if (b.enemy.hpLeft <= 0) b.enemy.hpLeft = 0;
  }
  const myStats = getEffectiveStats(state);
  const { dmg: dmgToEnemyCalc, crit } = calcAttackDamage(b);
  let dmgToEnemy = dmgToEnemyCalc;
    const critText = crit ? "💥爆擊！" : "";
  b.enemy.hpLeft -= dmgToEnemy;
  applyDefShred(b.enemy, state); // 27.4
  if (maybeStunEnemy(state)) b.enemy.stunned = true; // 27.4
  const lifesteal = Math.round(dmgToEnemy * getLifestealRatio(state));
  if (lifesteal > 0) applyEffect({ hp: lifesteal });
  pushSysLog(`[T${b.turn}] PLAYER_ATK dmg=${dmgToEnemy}${crit ? " crit=1" : ""} enemy.hp=${Math.max(0, b.enemy.hpLeft)}/${b.enemy.hp}`);

  if (b.enemy.hpLeft <= 0) {
    state.questFlags.totalKills = (state.questFlags.totalKills || 0) + 1; // 任務系統：ach_kills_50計數
let lootText = "";
    const drop = pickWeighted(b.enemy.dropTable);
    if (drop) {
      const dropItem = ITEMS[drop.itemId];
      if (RESOURCE_DROP_KEYS.includes(drop.itemId)) applyEffect({ resources: { [drop.itemId]: drop.qty } });
      if (!RESOURCE_DROP_KEYS.includes(drop.itemId)) {
        if (["weapon", "armor", "accessory"].includes(dropItem.type) && (dropItem.rarity === "rare" || dropItem.rarity === "epic" || dropItem.rarity === "legendary")) {
          const instId = instantiateEquipment(state, drop.itemId, Math.random);
          const inst = getInstance(state, instId);
          lootText = `
獲得 ${dropItem.icon} ${inst.name}，已加入背包`;
        } else {
          addItemToInventory(drop.itemId, drop.qty);
          lootText = `\n獲得 ${dropItem.icon} ${dropItem.name} x${drop.qty}`;
        }
      } else if (dropItem) {
        lootText = `\n獲得 ${dropItem.icon} ${dropItem.name} x${drop.qty}`;
      } else {
        lootText = formatEffect({ resources: { [drop.itemId]: drop.qty } });
      }
    }
    const hadAwakening = !!state.awakening;
    const expLocked = b.overpower && b.overpower.expLocked;
    const expGain = expLocked ? 0 : (b.enemy.expReward || 0);
    const levelUps = gainExp(state, expGain);
        let expText = expGain ? `\n✨經驗+${expGain}（${state.exp}/${state.expToNext}）` : (expLocked ? `\n等級已達上限，不再獲得經驗值` : "");
    if (levelUps > 0) {
            expText += `\n🎉 升級了！目前 Lv.${state.level}，HP上限+${LEVEL_UP_HP_BONUS * levelUps}，攻擊+${LEVEL_UP_ATK_BONUS * levelUps}（已自動回滿HP）`;
      expText += `\n⭐ 獲得技能點 x${levelUps}，可在技能面板中使用`;
      if (!hadAwakening && state.awakening) {
                expText += `\n\n💫 ${state.awakening.text}\n覺醒：${state.awakening.name} - ${state.awakening.desc}`;
      }
    }
    decayEquippedDurability(state);
    // v1.5：武器耐久歸零時攻擊力減半，提示玩家及時修復
    const equippedWeapon = getInstance(state, state.equipment && state.equipment.weapon);
    if (equippedWeapon && equippedWeapon.prefix && equippedWeapon.prefix.effect && equippedWeapon.prefix.effect.winStaminaChance && Math.random() < equippedWeapon.prefix.effect.winStaminaChance) {
      state.stamina = Math.min(staminaMax(state), state.stamina + 1);
      extraText += "\n⚡ 武器的躍動特性發揮作用，體力+1！";
    }
    let bonusText = "";
    if (b.battleBonus) {
      applyEffect(b.battleBonus);
      bonusText = formatEffect(b.battleBonus);
    }
    renderStatusBar();
    renderText(`${extraText ? extraText.trim() + "\n" : ""}你擊敗了${b.enemy.name}！${lootText}${expText}${bonusText}`, { kind: "event" });
    const onEnd = b.onEnd;
    pendingBattle = null;
    sessionStorage.removeItem("embers_battle_snap");
    renderOptions([{ label: "繼續", variant: "ghost", onClick: onEnd }]);
    return;
  }

  const hit = resolveEnemyHit(b, myStats);
  const reviveText = hit.dmg > 0 ? applyEnemyDamage(hit.dmg) : "";
  pushSysLog(`[T${b.turn}] ENEMY_ATK ${hit.stunned ? "stunned=1" : hit.dodged ? "dodged=1" : `dmg=${hit.dmg}`} player.hp=${Math.max(0, state.hp)}/${state.hpMax}`);

  if (state.hp <= 0) {
    const isPrologue = b.isPrologue;
    pendingBattle = null;
    sessionStorage.removeItem("embers_battle_snap");
    renderGameOver(isPrologue);
    return;
  }

    const lifestealText = lifesteal > 0 ? `（吸血+${lifesteal}）` : "";
    const counterText = hit.stunned ? "敵人被擊暈，無法反擊！" : hit.dodged ? "你閃避了敵人的攻擊！" : `敵人反擊，造成${hit.dmg}點傷害！`;
  // v182：苔蘚幾何外殼(gaia_armor)——探索遭遇戰(b.loc存在)每回合回HP+2(原本「未接入荒野回合制」)
  let gaiaArmorText = "";
  const armorRef = getEquipRef(state, state.equipment && state.equipment.armor);
  if (armorRef && armorRef.item && armorRef.item.id === "gaia_armor" && b.loc && state.hp > 0) {
    const healed = Math.min(2, state.hpMax - state.hp);
    if (healed > 0) {
      applyEffect({ hp: healed });
      gaiaArmorText = `
🌿 苔蘚幾何外殼汲取荒野生機，回復HP+${healed}`;
    }
  }
  renderBattle(`${extraText}${critText}你攻擊了${b.enemy.name}，造成${dmgToEnemy}點傷害${lifestealText}${counterText}${reviveText}${gaiaArmorText}`);
}

function battleFlee() {
  const b = pendingBattle;
  const myStats = getEffectiveStats(state);
  if (Math.random() < 0.5) {
    renderStatusBar();
        renderText("🏃 你趁機脫離了戰鬥，成功逃跑！", { kind: "event" });
    const onEnd = b.onEnd;
    pendingBattle = null;
    sessionStorage.removeItem("embers_battle_snap");
    renderOptions([{ label: "繼續", variant: "ghost", onClick: onEnd }]);
  } else {
    const hit = resolveEnemyHit(b, myStats);
    const reviveText = hit.dmg > 0 ? applyEnemyDamage(hit.dmg) : "";
    pushSysLog(`[FLEE_FAILED] ${hit.dodged ? "dodged=1" : `dmg=${hit.dmg}`} player.hp=${Math.max(0, state.hp)}/${state.hpMax}`);
    if (state.hp <= 0) {
      const isPrologue = b.isPrologue;
      pendingBattle = null;
      sessionStorage.removeItem("embers_battle_snap");
      renderGameOver(isPrologue);
      return;
    }
    const text = hit.dodged ? `😮 你閃過了${b.enemy.name}的攻擊！` : `😮 ${b.enemy.name}攻擊你，造成${hit.dmg}點傷害！`;
    renderBattle(`${text}${reviveText}`);
  }
}

// ---------- ?拙?甈?----------
function addItemToInventory(itemId, qty) {
  const existing = state.inventory.find(i => i.itemId === itemId);
  if (existing) existing.qty += qty;
  else state.inventory.push({ itemId, qty });
}

function showInventory() {
  renderStatusBar();
  if (state.inventory.length === 0 && (!state.weaponInstances || state.weaponInstances.length === 0)) {
        renderText("請選擇要裝備的物品。");
    renderOptions([{ label: "返回", variant: "ghost", onClick: renderMain }]);
    return;
  }
  const equippedWeapon = state.equipment.weapon;
  const equippedArmor = state.equipment.armor;
  const equippedAccessory = state.equipment.accessory;
  let html = `<div class="subtitle">背包</div><div class="invList">`;
  state.inventory.forEach(i => {
    const item = ITEMS[i.itemId];
    const isEquipped = (item.type === "weapon" && i.itemId === equippedWeapon) || (item.type === "armor" && i.itemId === equippedArmor) || (item.type === "accessory" && i.itemId === equippedAccessory);
        const equipped = isEquipped ? "（已裝備）" : "";
    const statsText = item.stats ? Object.entries(item.stats).map(([k, v]) => `${k}+${v}`).join(" ") : "";
    const titleText = [statsText, item.desc].filter(Boolean).join(" / ");
    const descText = item.type === "furniture" && item.desc ? `<div class="hint">${item.desc}</div>` : "";
    html += `<div class="invRow" title="${titleText}">${itemIconHtml(item.id, item.type)}<span>${item.name}${equipped}${descText}</span><span class="qty">x${i.qty}</span></div>`;
  });
  (state.weaponInstances || []).forEach(inst => {
    const isEquipped = inst.id === equippedWeapon || inst.id === equippedArmor || inst.id === equippedAccessory;
        const equipped = isEquipped ? "（已裝備）" : "";
    const baseItem = ITEMS[inst.baseItemId];
    const statsText = inst.stats ? Object.entries(inst.stats).map(([k, v]) => `${k}+${v}`).join(" ") : "";
    const titleText = [statsText, baseItem.desc].filter(Boolean).join(" / ");
    const fCls = baseItem.factionTag ? ` class="faction-${baseItem.factionTag}"` : "";
    html += `<div class="invRow" title="${titleText}">${itemIconHtml(inst.baseItemId, baseItem.type)}<span><span${fCls}>${inst.name}</span>${equipped}（耐久：${inst.durability}）</span><span class="qty">${inst.rarity}</span></div>`;
  });
  html += `</div>`;
  renderText(html);

  const opts = [];
  state.inventory.forEach(i => {
    const item = ITEMS[i.itemId];
    if (item.useEffect) {
      const limitReached = item.useLimitPerGame && (state.itemUseCount[item.id] || 0) >= item.useLimitPerGame;
      opts.push({
        label: `裝備 ${itemIconHtml(item.id, item.type)}${item.name}`,
        variant: "primary",
        disabled: limitReached,
        onClick: () => {
          useItem(state, i.itemId);
          saveGame();
          showInventory();
        }
      });
    }
    if (item.type === "weapon" && i.itemId !== equippedWeapon) {
      opts.push({
        label: `裝備 ${itemIconHtml(item.id, item.type)}${item.name}`,
        hint: `⚔️攻擊+${item.stats.atk}`,
        variant: "primary",
        onClick: () => {
          state.equipment.weapon = i.itemId;
          saveGame();
          showInventory();
        }
      });
    }
    if (item.type === "furniture" && !hasFurniturePlaced(state, i.itemId)) {
      opts.push({
        label: `?喳? ${itemIconHtml(item.id, item.type)}${item.name}`,
        hint: `(${item.slot}?? ${item.desc || ""}`,
        variant: "primary",
        onClick: () => {
          const result = placeFurniture(state, i.itemId);
          saveGame();
const replacedName = result.replaced && ITEMS[result.replaced] ? ITEMS[result.replaced].name : null;
                    renderText(`你裝備了${item.name}`, { kind: "event" });
          renderOptions([
            { label: "✨ 繼續裝備其他物品", variant: "primary", onClick: renderMain },
            { label: "返回背包", variant: "ghost", onClick: showInventory }
          ]);
        }
      });
    }
    if (item.type === "armor" && i.itemId !== equippedArmor) {
      opts.push({
        label: `裝備 ${itemIconHtml(item.id, item.type)}${item.name}`,
        hint: `🛡️防禦+${item.stats.def}`,
        variant: "primary",
        onClick: () => {
          state.equipment.armor = i.itemId;
          saveGame();
          showInventory();
        }
      });
    }
    if (item.type === "accessory" && i.itemId !== equippedAccessory) {
      opts.push({
        label: `裝備 ${itemIconHtml(item.id, item.type)}${item.name}`,
        hint: item.desc || "",
        variant: "primary",
        onClick: () => {
          state.equipment.accessory = i.itemId;
          saveGame();
          showInventory();
        }
      });
    }
  });
  (state.weaponInstances || []).forEach(inst => {
    const baseItem = ITEMS[inst.baseItemId];
    const slotKey = baseItem.type === "weapon" ? "weapon" : (baseItem.type === "armor" ? "armor" : "accessory");
    if (state.equipment[slotKey] === inst.id) return;
    opts.push({
      label: `裝備 ${itemIconHtml(inst.baseItemId, baseItem.type)}${inst.name}`,
      hint: inst.stats ? Object.entries(inst.stats).map(([k, v]) => `${k}+${v}`).join(" ") : (baseItem.desc || ""),
      variant: "primary",
      onClick: () => {
        state.equipment[slotKey] = inst.id;
        saveGame();
        showInventory();
      }
    });
  });
  opts.push({ label: "返回", variant: "ghost", onClick: renderMain });
  renderOptions(opts);
}

// ---------- 任務與成就系統UI（規格文件/任務與成就系統_設計規格.md §5）----------
const SIDE_CATEGORY_LABELS = { collect: "📦收集", companion: "👥隊員", explore: "🧭探索" };
let questPanelTab = "main"; // "main" | "side"
let questPanelSideCategory = "collect";

function showQuestPanel() {
  renderStatusBar();
  let html = `<div class="subtitle">任務</div><div class="hint" style="padding-bottom:6px">主線可以不做，支線隨時可以慢慢刷</div>`;
  if (questPanelTab === "main") {
    const mainChapters = Object.values(QUESTS).filter(q => q.type === "main").sort((a, b) => a.chapter - b.chapter);
    mainChapters.forEach(q => {
      const done = state.questProgress.completedMain.includes(q.id);
      const active = state.questProgress.activeMain === q.id;
      const icon = done ? "✅" : active ? "🎯" : "⬜";
      html += `<div class="invRow${done ? " furn-used" : ""}"><span>${icon} 第${q.chapter}章：${q.title}</span></div>`;
      if (active) html += `<div class="hint" style="padding:0 0 6px 0">${q.desc}</div>`;
    });
  } else {
    const cats = Object.keys(SIDE_CATEGORY_LABELS);
    const sideQuests = Object.values(QUESTS).filter(q => q.type === "side" && q.category === questPanelSideCategory);
    sideQuests.forEach(q => {
      const done = !q.repeatable && state.questProgress.completedSide.includes(q.id);
      let progressText = "";
      if (q.counterField) {
        const cur = Math.min(q.counterTarget, state.questFlags[q.counterField] || 0);
        progressText = ` <span class="qty">${cur}/${q.counterTarget}</span>`;
      }
      html += `<div class="invRow${done ? " furn-used" : ""}"><span>${done ? "✅" : q.repeatable ? "🔁" : "⬜"} ${q.title}</span>${progressText}</div>`;
      if (!done) html += `<div class="hint" style="padding:0 0 6px 0">${q.desc}</div>`;
    });
    if (!sideQuests.length) html += `<div class="hint">（目前沒有此分類的支線）</div>`;
  }
  renderText(html);

  const opts = [];
  opts.push({ label: questPanelTab === "main" ? "▸ 主線" : "主線", variant: questPanelTab === "main" ? "primary" : "ghost", onClick: () => { questPanelTab = "main"; showQuestPanel(); } });
  opts.push({ label: questPanelTab === "side" ? "▸ 支線" : "支線", variant: questPanelTab === "side" ? "primary" : "ghost", onClick: () => { questPanelTab = "side"; showQuestPanel(); } });
  if (questPanelTab === "side") {
    Object.keys(SIDE_CATEGORY_LABELS).forEach(cat => {
      opts.push({
        label: SIDE_CATEGORY_LABELS[cat],
        variant: questPanelSideCategory === cat ? "primary" : "ghost",
        onClick: () => { questPanelSideCategory = cat; showQuestPanel(); }
      });
    });
  }
  opts.push({ label: "返回", variant: "ghost", onClick: renderMain });
  renderOptions(opts);
}

const ACHIEVEMENT_CATEGORY_LABELS = { survival: "🏕️存活", combat: "⚔️戰鬥", collect: "📦收集", discovery: "🔍探索意外" };
let achievementPanelCategory = "survival";

function showAchievementPanel() {
  renderStatusBar();
  let html = `<div class="subtitle">成就</div>`;
  const list = Object.values(ACHIEVEMENTS).filter(a => a.category === achievementPanelCategory);
  list.forEach(a => {
    const unlocked = state.unlockedAchievements.includes(a.id);
    if (!unlocked && a.hidden) return; // 未解鎖的隱藏成就完全不顯示，不佔版面
    const cls = unlocked ? "" : " furn-used";
    html += `<div class="invRow${cls}"><span>${unlocked ? "🏆" : "❔"} ${a.title}</span></div>`;
    html += `<div class="hint" style="padding:0 0 6px 0">${a.desc}</div>`;
  });
  if (!list.some(a => state.unlockedAchievements.includes(a.id) || !a.hidden)) {
    html += `<div class="hint">（目前沒有此分類可顯示的成就）</div>`;
  }
  renderText(html);

  const opts = Object.keys(ACHIEVEMENT_CATEGORY_LABELS).map(cat => ({
    label: ACHIEVEMENT_CATEGORY_LABELS[cat],
    variant: achievementPanelCategory === cat ? "primary" : "ghost",
    onClick: () => { achievementPanelCategory = cat; showAchievementPanel(); }
  }));
  opts.push({ label: "返回", variant: "ghost", onClick: renderMain });
  renderOptions(opts);
}

function showSkillPanel() {
  renderStatusBar();
  const faction = state.skills && state.skills.faction;
  let html = `<div class="subtitle">你的技能點數：${state.skillPoints}</div>`;
  if (!faction) {
    html += `<div class="hint">使用技能點可提升角色能力，點擊下方選項使用</div>`;
  } else {
    const tree = SKILLS_TREE[faction];
    const cur = state.skills.tier || 0;
    html += `<div class="faction-${faction}"><div class="invRow"><span>技能樹：${tree.name}（${tree.role}）</span><span class="qty">${cur}/${tree.tiers.length}</span></div>`;
    tree.tiers.forEach((t, idx) => {
      const unlocked = idx < cur;
      html += `<div class="hint" style="padding:0 0 4px 0">${unlocked ? "🔓" : "🔒"} T${idx + 1} ${t.name}：${t.desc}</div>`;
    });
    html += `</div><div class="hint" style="padding:8px 0 0 0">使用技能點可永久提升角色能力</div>`;
  }
  renderText(html);

  const opts = [];
  if (faction) {
    const tree = SKILLS_TREE[faction];
    const cur = state.skills.tier || 0;
    if (cur < tree.tiers.length) {
      opts.push({
                label: `🎯 強化攻擊力`,
        hint: `T${cur + 1} ${tree.tiers[cur].name}`,
        disabled: state.skillPoints <= 0,
        onClick: () => {
          spendSkillPoint(state);
          saveGame();
          showSkillPanel();
        }
      });
    }
  }
  opts.push({ label: "返回", variant: "ghost", onClick: renderMain });
  renderOptions(opts);
}

function showShop(tab = "B") {
  if (tab === "A") return showShopGacha();
  if (tab === "C") return showShopRepair();
  return showShopConsumables();
}

function shopTabOptions(current) {
    const labels = { A: "🧪 A.消耗品", B: "🪑 B.家具佈置", C: "🔧 C.裝備強化" };
  return Object.keys(labels).map(t => ({
    label: labels[t] + (t === current ? "（目前選擇）" : ""),
    variant: t === current ? "primary" : "ghost",
    disabled: t === current,
    onClick: () => showShop(t)
  }));
}

function ownsFurniture(itemId) {
  if ((state.inventory || []).some(i => i.itemId === itemId && i.qty > 0)) return true;
  return hasFurniturePlaced(state, itemId);
}

function showShopConsumables(subTab = "consumable") {
  renderStatusBar();
  const allShopItems = Object.values(ITEMS).filter(i => i.shopPrice);
  const shopItems = allShopItems.filter(i => subTab === "furniture" ? i.type === "furniture" : i.type !== "furniture");
  let html = `<div class="subtitle">🛒 商店｜晶燼：${state.currency.embers}</div><div class="invList">`;
  shopItems.forEach(item => {
const owned = item.type === "furniture" && ownsFurniture(item.id);
        const limitText = item.useLimitPerGame ? `（限${item.useLimitPerGame}次，已使用${state.itemUseCount[item.id] || 0}次）` : owned ? "（已擁有）" : "";
    const descText = item.desc ? `<div class="hint">${item.desc}</div>` : "";
        html += `<div class="invRow" title="${item.name}${item.desc ? "：" + item.desc : ""}">${itemIconHtml(item.id, item.type)}<span>${item.name}${limitText}${descText}</span><span class="qty">🔥${item.shopPrice.embers}</span></div>`;
  });
  html += `</div>`;
  renderText(html);

  const opts = shopTabOptions("B");
  opts.push({
        label: subTab === "furniture" ? "🪑 查看家具" : "🛒 購買",
    variant: "ghost",
    onClick: () => showShopConsumables(subTab === "furniture" ? "consumable" : "furniture")
  });
  shopItems.forEach(item => {
    const limitReached = item.useLimitPerGame && (state.itemUseCount[item.id] || 0) >= item.useLimitPerGame;
    const owned = item.type === "furniture" && ownsFurniture(item.id);
    opts.push({
      label: `購買 ${itemIconHtml(item.id, item.type)}${item.name}`,
      hint: owned ? "已擁有，無法重複購買" : `🔥${item.shopPrice.embers}`,
      disabled: state.currency.embers < item.shopPrice.embers || limitReached || owned,
      onClick: () => {
        applyEffect({ embers: -item.shopPrice.embers });
        addItemToInventory(item.id, 1);
        saveGame();
        showShopConsumables(subTab);
      }
    });
  });
  opts.push({ label: "返回", variant: "ghost", onClick: renderMain });
  renderOptions(opts);
}

function showShopGacha() {
  renderStatusBar();
  const cost = gachaCost(state);
  renderText(`<div class="subtitle">🧪 A.消耗品｜晶燼：${state.currency.embers}</div><div class="hint">點擊購買消耗品，可用於恢復HP/SAN/體力，抽取裝備每次消耗${cost}晶燼</div>`);
  const opts = shopTabOptions("A");
  opts.push({
        label: "🎰 抽取裝備",
    hint: `🔥${cost}`,
    variant: "primary",
    disabled: state.currency.embers < cost,
    onClick: () => {
      applyEffect({ embers: -cost });
      const itemId = rollGacha();
      addItemToInventory(itemId, 1);
      const item = ITEMS[itemId];
      saveGame();
      renderText(`<div class="subtitle">🧪 A.消耗品｜晶燼：${state.currency.embers}</div>恭喜獲得：${item.icon}${item.name}（${item.rarity}）`);
      renderOptions([...shopTabOptions("A"), { label: "返回", variant: "ghost", onClick: renderMain }]);
    }
  });
  opts.push({ label: "返回", variant: "ghost", onClick: renderMain });
  renderOptions(opts);
}

function showShopRepair() {
  renderStatusBar();
  const cost = repairCost(state);
  const weaponId = state.equipment && state.equipment.weapon;
  const armorId = state.equipment && state.equipment.armor;
  let html = `<div class="subtitle">🔧 C.裝備強化｜晶燼：${state.currency.embers}</div><div class="invList">`;
  [weaponId, armorId].forEach(itemId => {
    if (!itemId) return;
    const ref = getEquipRef(state, itemId);
    const icon = ITEMS[ref.item.id].icon;
    const name = ref.inst ? ref.inst.name : ref.item.name;
    html += `<div class="invRow"><span class="icon">${icon}</span><span>${name}</span><span class="qty">耐久 ${getDurability(state, itemId)}/${DURABILITY_MAX}</span></div>`;
  });
  if (!weaponId && !armorId) html += `<div class="hint">尚未裝備任何武器/防具，無法修復</div>`;
  const reforgeCost = reforgePrefixCost(state);
  html += `</div><div class="hint">修復裝備需消耗${cost}晶燼，可恢復耐久至滿</div><div class="hint">重鍛費用${reforgeCost}晶燼，僅限rare/epic裝備可重新抽取詞綴，legendary裝備無法重鍛</div>`;
  renderText(html);

  const opts = shopTabOptions("C");
  [weaponId, armorId].forEach(itemId => {
    if (!itemId) return;
    const ref = getEquipRef(state, itemId);
    const icon = ITEMS[ref.item.id].icon;
    const name = ref.inst ? ref.inst.name : ref.item.name;
    const durability = getDurability(state, itemId);
    opts.push({
      label: `🔧 ${icon}${name}`,
            hint: `🔥${cost}，耐久${durability}/${DURABILITY_MAX}`,
      disabled: state.currency.embers < cost || durability >= DURABILITY_MAX,
      onClick: () => {
        repairEquipment(state, itemId);
        saveGame();
        showShop("C");
      }
    });
    if (ref.inst && ref.inst.rarity !== "legendary") {
      opts.push({
        label: `✨ 重鍛 ${icon}${name}`,
                                hint: `🔥${reforgeCost}，目前詞綴：${ref.inst.prefix ? ref.inst.prefix.name : "無"}`,
        disabled: state.currency.embers < reforgeCost,
        onClick: () => {
          const result = reforgePrefix(state, itemId);
          if (result.ok) {
            renderText(`重鍛完成！${result.prefix ? `獲得詞綴：${result.prefix.name} - ${result.prefix.desc}` : "未獲得詞綴，裝備保持原樣"}`, { kind: "event" });
          }
          saveGame();
          showShop("C");
        }
      });
    }
  });
  opts.push({ label: "返回", variant: "ghost", onClick: renderMain });
  renderOptions(opts);
}

const COMPANION_NAME_LABELS = { "雷恩": "🛡️ 雷恩（前哨守衛）", "艾莉": "🌿 艾莉（採集醫護）", "阿卡": "💣 阿卡（爆破手）" };
const SQUAD_CHAT_LINES = {
  "艾莉": ["（一邊整理藥草一邊跟你打招呼）", "「外面還安全嗎？」", "「我把採集到的東西分類好了。」"],
  "阿卡": ["（檢查著手邊的炸藥）", "「有什麼需要炸開的儘管說。」", "「守好據點是我的工作。」"]
};
const TASK_LABELS = { standby: "待命", gather: "採集", care: "照護", guard: "守衛", blast: "爆破警戒" };
const TASK_DESCS = {
    gather: "每階段自動執行一次採集，不消耗玩家體力",
    care: "休息時HP額外回復+5",
    guard: "降低夜襲發生機率",
  blast: "降低夜襲機率，效果比雷恩守衛更強"
};

function showCompanionPanel() {
  renderStatusBar();
  let html = `<div class="subtitle">小隊同伴</div><div class="invList">`;
  Object.keys(COMPANION_NAME_LABELS).forEach(name => {
    const status = (state.companions && state.companions[name]) || "locked";
    if (status === "locked") {
            const hint = name === "阿卡" ? "（指揮核心Lv3解鎖）" : "（尚未招募）";
      html += `<div class="invRow"><span>🔒 ${COMPANION_NAME_LABELS[name]}</span><span class="qty">${hint}</span></div>`;
    } else {
      html += `<div class="invRow"><span>${COMPANION_NAME_LABELS[name]}</span><span class="qty">目前：${TASK_LABELS[status] || status}</span></div>`;
    }
  });
  html += `</div>`;
  renderText(html);

  const opts = [];
  Object.keys(COMPANION_NAME_LABELS).forEach(name => {
    const status = (state.companions && state.companions[name]) || "locked";
    if (status === "locked") return;
    const tasks = ["standby", ...(COMPANION_TASKS[name] || [])];
    tasks.forEach(task => {
      opts.push({
        label: `${name} → ${TASK_LABELS[task]}${TASK_DESCS[task] ? "（" + TASK_DESCS[task] + "）" : ""}`,
        disabled: status === task,
        onClick: () => {
          dispatchCompanion(state, name, task);
          saveGame();
          showCompanionPanel();
        }
      });
    });
  });
  opts.push({ label: "返回", variant: "ghost", onClick: renderMain });
  renderOptions(opts);
}

function renderTitle() {
  statusBar.innerHTML = "";
  screen.innerHTML = `
    <div class="titleWrap">
      <div class="emberIcon">🔥</div>
      <h1>餘燼日記</h1>
      <p>末日中的微小溫暖記事</p>
    </div>
  `;
  const box = document.createElement("div");
  box.className = "optionBox";

  const battleSnapRaw = sessionStorage.getItem("embers_battle_snap");
  if (battleSnapRaw && hasSave()) {
    const resume = document.createElement("button");
    resume.className = "choiceBtn primary";
    resume.textContent = "▶️ 繼續冒險";
    resume.onclick = () => {
      try {
        const snap = JSON.parse(battleSnapRaw);
        state = JSON.parse(snap.stateSnap);
        const turretShock = snap.turretShock || 0;
        renderStatusBar();
                renderText("夜襲警報！自動槍塔正在交戰中……", { kind: "battle" });
        renderOptions([{ label: "⚔️ 應戰", variant: "danger", onClick: () => {
          startBattle("enemy_walker_weak", () => endPhase(), false, { isNightRaid: true });
          if (turretShock > 0) {
            pendingBattle.enemy.hpLeft = Math.max(1, pendingBattle.enemy.hpLeft - turretShock);
            renderBattle("⚡ 槍塔的電擊讓你免於一擊");
          }
        }}]);
      } catch (e) {
        sessionStorage.removeItem("embers_battle_snap");
        state = loadGame(); renderMain();
      }
    };
    box.appendChild(resume);
  }

  if (hasSave()) {
    const cont = document.createElement("button");
    cont.className = battleSnapRaw ? "choiceBtn ghost" : "choiceBtn primary";
    cont.textContent = "繼續旅程";
    cont.onclick = () => { state = loadGame(); renderMain(); };
    box.appendChild(cont);
  }

  const newGame = document.createElement("button");
  newGame.className = hasSave() ? "choiceBtn ghost" : "choiceBtn primary";
    newGame.textContent = hasSave() ? "⚠️ 開始新遊戲（將覆蓋進度）" : "開始新遊戲";
  newGame.onclick = () => {
        if (hasSave() && !confirm("確定要放棄目前進度開始新遊戲嗎？此動作無法復原。")) return;
    state = defaultState();
        const name = prompt("請輸入你的名字（將顯示在遊戲中）：", "旅人");
    if (name && name.trim()) state.playerName = name.trim();
    chooseStartAppearance();
  };
  box.appendChild(newGame);
  screen.appendChild(box);
}

// 2026-07-02：短篇序章新增第二篇「斷電之夜」，PROLOGUE_CHAPTERS(story.js)登記表隨機二選一，
// state.prologueChapter記錄選到哪篇，renderPrologueScene/finishPrologue/renderGameOver依此查對應章節的scenes/endings
function getActivePrologueChapter(state) {
  return PROLOGUE_CHAPTERS.find(c => c.id === state.prologueChapter) || PROLOGUE_CHAPTERS[0];
}
function startPrologue() {
  statusBar.innerHTML = "";
  const chapter = PROLOGUE_CHAPTERS[Math.floor(Math.random() * PROLOGUE_CHAPTERS.length)];
  state.prologueChapter = chapter.id;
  renderPrologueScene(chapter.startScene);
}

function renderPrologueScene(sceneId) {
  const scene = getActivePrologueChapter(state).scenes[sceneId];
  renderText(scene.text.replace(/\n/g, "<br>"), { kind: "event" });
  const opts = scene.options.map(opt => ({
    label: opt.label,
    variant: opt.battle ? "danger" : undefined,
    onClick: () => {
      if (opt.battle) {
        startBattle(opt.battle, () => afterPrologueCombat(), true);
        return;
      }
      if (opt.resolve === "flee") {
        resolvePrologueFlee();
        return;
      }
      if (opt.ending) {
        finishPrologue(opt.ending);
        return;
      }
      renderPrologueScene(opt.next);
    }
  }));
  renderOptions(opts);
}

function afterPrologueCombat() {
  finishPrologue(state.hp <= state.hpMax * 0.5 ? "weak" : "alone");
}

function resolvePrologueFlee() {
  const dmg = 5 + Math.floor(Math.random() * 16); // 5~20
  applyEffect({ hp: -dmg });
  if (state.hp <= 0) {
    renderGameOver(true);
    return;
  }
  afterPrologueCombat();
}

function finishPrologue(endingId) {
  const ending = getActivePrologueChapter(state).endings[endingId];

  applyPrologueEnding(state, endingId);
  saveGame();

  renderText(`<div class="subtitle">${ending.title}</div>${ending.text.replace(/\n/g, "<br>")}`, { kind: "event" });
  renderOptions([{ label: "繼續冒險", variant: "primary", onClick: renderMain }]);
}

renderTitle();

