// 純邏輯函式（無DOM依賴），供 game.js 與測試共用

(function (root) {
  const isNode = typeof module !== "undefined" && module.exports;
  const data = isNode ? require("./data.js") : root;
  const { ITEMS, ENEMIES, EVENTS, LOCATIONS, AWAKENING_TRAITS, SKILLS_TREE, FACTION_IDS, PREFIX_POOL } = data;
  const story = isNode ? require("./story.js") : root;
  const { MILESTONE_EVENTS } = story;

  const ACTION_POINTS_PER_PHASE = 2;

  // ---------- 體力系統（SA第23節，v0.7/v0.8） ----------
  const RESOURCE_DROP_KEYS = ["scrap", "medicine", "ammo", "food", "water"]; // SA 34 / TODO #18第0步④：LOCATIONS/dropTable掉落這些id時走state.resources而非inventory

  const STAMINA_BASE = 6; // SA 33.3：5→6，緩解每回合能量不足

  // staminaMax = 5 + (level-1)
  function staminaMaxForLevel(level) {
    return STAMINA_BASE + (level - 1);
  }

  // 各行動的體力消耗（探索遠距離每3級降1點，最低1）
  const ACTION_STAMINA_COSTS = {
    gather: 1,
    explore_near: 2,
    explore_far: 3,
    reinforce: 1,
    convert: 1
  };

  // v1.7 #19-4 / #29-6：跨Tier遠征（目的地實際高於玩家當前Tier，且開局3天後）額外+1體力
  // 修正：原本以levelCap/3粗略換算locTier，導致學校/公園等Lv1日常地點誤判為跨Tier而多扣1點體力
  function actionStaminaCost(state, actionType, loc) {
    if (actionType === "explore_far") {
      const discount = Math.floor((state.level - 1) / 3);
      let cost = Math.max(1, ACTION_STAMINA_COSTS.explore_far - discount);
      if (loc && getLocationOverpower(state, loc).highDanger) cost += 1;
      return cost;
    }
    return ACTION_STAMINA_COSTS[actionType] ?? 1;
  }

  // 消耗體力執行行動；若體力不足仍執行（過勞/硬撐，第23.2節）：
  // HP-3、資源獲得減半（呼叫端依resourceMultiplier處理）、提高遭遇率(encounterBonus)
  const OVERDRAW_HP_PENALTY = 3;
  const OVERDRAW_RESOURCE_MULTIPLIER = 0.5;
  const OVERDRAW_ENCOUNTER_BONUS = 0.15;

  // 25.2 總量管制：staminaMax額外加成來源（生存樹3階+1、覺醒"耐力者"+1...）合計上限+3
  const STAMINA_BONUS_CAP = 3;

  function staminaBonusFromSources(state) {
    let bonus = 0;
    if (state.awakening && state.awakening.staminaMaxBonus) bonus += state.awakening.staminaMaxBonus;
    bonus += state.itemStaminaBonus || 0;
    return Math.min(bonus, STAMINA_BONUS_CAP);
  }

  // 25.3：取得玩家在某流派已解鎖的階數（0~4），未鎖定該流派則為0
  function factionTier(state, faction) {
    if (!state.skills || state.skills.faction !== faction) return 0;
    return state.skills.tier || 0;
  }

  // 含技能樹/覺醒加成的實際體力上限
  function staminaMax(state) {
    return staminaMaxForLevel(state.level) + staminaBonusFromSources(state);
  }

  // 生存樹1階：過勞HP懲罰-1（最低0）；覺醒"冷靜"：懲罰固定為-1
  function overdrawHpPenalty(state) {
    if (state.awakening && state.awakening.id === "calm") return 1;
    if (factionTier(state, "mind") >= 3 && state.san < 40) return 0; // 25.3 心靈晶格T3：SAN<40時免疫過勞HP懲罰
    return OVERDRAW_HP_PENALTY;
  }

  // #26-4：過勞連續發生時代價遞增（-1再-2再-3...），硬撐風險逐次升高；恢復餘力後重置
  function spendStamina(state, actionType, loc, rng = Math.random) {
    let cost = actionStaminaCost(state, actionType, loc);
    // v110：舒適度≥3，每日首次探索/採集體力消耗-1（最低1）
    // v115：舒適度≥10「夢幻小窩」，每日第二次探索/採集體力消耗也-1
    if (["gather", "explore_near", "explore_far"].includes(actionType)) {
      const comfort = getComfortLevel(state);
      if (!state.flags) state.flags = {};
      if (comfort >= 3 && state.flags.comfortDiscountDay !== state.day) {
        cost = Math.max(1, cost - 1);
        state.flags.comfortDiscountDay = state.day;
      } else if (comfort >= 10 && state.flags.comfortDiscountDay2 !== state.day) {
        cost = Math.max(1, cost - 1);
        state.flags.comfortDiscountDay2 = state.day;
      }
    }
    // A.3：黑市手搖式發電機——強化據點/物資轉換時20%機率不消耗體力
    if ((actionType === "reinforce" || actionType === "convert") && cost > 0) {
      const noCostChance = sumFurnitureEffect(state, "noStaminaCostChance");
      if (noCostChance > 0 && rng() < noCostChance) {
        state.overdrawStreak = 0;
        return { cost: 0, overdraw: false, resourceMultiplier: 1, encounterBonus: 0 };
      }
    }
    if (state.stamina >= cost) {
      state.stamina -= cost;
      state.overdrawStreak = 0;
      return { cost, overdraw: false, resourceMultiplier: 1, encounterBonus: 0 };
    }
    state.stamina = 0;
    state.overdrawStreak = (state.overdrawStreak || 0) + 1;
    const penalty = overdrawHpPenalty(state) * state.overdrawStreak;
    if (penalty > 0) applyEffect(state, { hp: -penalty });
    return { cost, overdraw: true, resourceMultiplier: OVERDRAW_RESOURCE_MULTIPLIER, encounterBonus: OVERDRAW_ENCOUNTER_BONUS, streak: state.overdrawStreak };
  }

  // 休息時的額外HP回復（生存樹5階：staminaMax×2；覺醒"痊癒體質"+5；同伴指派"照護"+5）
  function restHealAmount(state) {
    let heal = 0;
    if (factionTier(state, "ocean") >= 4) heal += Math.round(state.hpMax * 0.05); // 25.3 洋流寄生T4：完美水解
    if (state.awakening && state.awakening.id === "recovery") heal += 5;
    if (state.companion && state.companionTask === "care") heal += 5;
    if (state.companions && state.companions["艾莉"] === "care") heal += 5;
    if (getComfortLevel(state) >= 6) heal += 5; // v110：舒適度≥6「安樂窩」休息HP額外+5
    return heal;
  }

  // 28.1：命名同伴系統（雷恩/艾莉/阿卡）
  const COMPANION_TASKS = {
    "雷恩": ["guard"],
    "艾莉": ["gather", "care"],
    "阿卡": ["blast"]
  };

  // 招募同伴：locked -> standby（不影響已在執行任務中的同伴）
  function recruitCompanion(state, name) {
    if (!state.companions) state.companions = { "雷恩": "locked", "艾莉": "locked", "阿卡": "locked" };
    if (state.companions[name] === "locked") state.companions[name] = "standby";
    return state;
  }

  // 阿卡需指揮核心(command)達Lv3才解鎖，於每次階段推進時檢查
  function refreshCompanionUnlocks(state) {
    if (!state.companions) state.companions = { "雷恩": "locked", "艾莉": "locked", "阿卡": "locked" };
    if (state.companions["阿卡"] === "locked" && state.facilities && state.facilities.command >= 3) {
      state.companions["阿卡"] = "standby";
    }
    return state;
  }

  // 指派同伴任務：name需已招募(非locked)，task須為該同伴可執行任務之一
  function dispatchCompanion(state, name, task) {
    if (!state.companions || state.companions[name] === "locked") {
      return { ok: false, reason: "locked" };
    }
    if (task !== "standby" && !(COMPANION_TASKS[name] || []).includes(task)) {
      return { ok: false, reason: "invalid_task" };
    }
    state.companions[name] = task;
    return { ok: true };
  }

  // 是否有同伴被指派至某任務（合併舊版單一companion欄位以維持相容）
  function companionAssigned(state, task) {
    if (state.companion && state.companionTask === task) return true;
    return !!(state.companions && Object.values(state.companions).includes(task));
  }

  function defaultState() {
    return {
      day: 1,
      phase: "day",
      playerName: "旅人", // 29.1
      appearance: "char_1", // #22-1：像素小屋角色造型(assets/characters/*.svg)
      unlockedAppearances: ["char_1"], // #29-3：已解鎖造型清單，開局造型固定，需透過鏡子家具切換
      roomFloor: "wood", // #27：安全屋地板樣式，可透過商城/探索獲得後切換
      unlockedFloors: ["wood"], // #29-1b：已解鎖地板樣式清單，開局僅木地板，其餘需透過「地板樣品券」解鎖
      homePos: null, // #27：人物在安全屋畫布中的位置(可拖曳移動)，null=預設站位
      actionPoints: ACTION_POINTS_PER_PHASE,
      stamina: staminaMaxForLevel(1),
      staminaMax: staminaMaxForLevel(1),
      hp: 100, hpMax: 100,
      san: 100, sanMax: 100, // 25.2
      resources: { food: 12, water: 8, medicine: 2, ammo: 5, scrap: 10 }, // 32.8：開局初始資源
      resourceCaps: { food: 50, water: 50, medicine: 10, ammo: 30, scrap: 99 }, // 32.8
      inventory: [],
      weaponInstances: [], // 16.3b/27.1：rare以上裝備實體
      stats: { atk: 3, def: 0 },
      level: 1,
      exp: 0,
      expToNext: 100, // 32.8
      equipment: { weapon: "scrap_chainsaw", armor: "ceramic_vest", accessory: null }, // 32.8：開局即裝備初始武器/護甲
      baseDefense: 0,
      baseRaidChance: 0.12,
      facilities: { command: 0, greenhouse: 0, workshop: 0, radar: 0 }, // 22.2
      bonusDefense: 0, // 22.2：事件/道具給予的舊式baseDefense加成，疊加於facilities.command*2之上
      baseSlots: { wall: null, table: null, floor: "furn_sleeping_bag", wall2: null, table2: null, floor2: null }, // 27.2陳列格；#31：初始小屋僅一張睡袋+人物；v112每槽位開放第二格
      overdrawStreak: 0, // #26-4：連續過勞次數，HP懲罰隨次數遞增，恢復餘力後重置
      seenEvents: [], // #22-3：已記錄過的事件id清單，首次遭遇給予「日記新頁」小獎勵與收納感
      companion: false,
      companionTask: "gather",
      companions: { "雷恩": "locked", "艾莉": "locked", "阿卡": "locked" }, // 28.1
      prologueDone: false,
      sandboxEnded: false,
      milestonesShown: [],
      flags: {},
      log: [],
      awakening: null,
      skillPoints: 0,
      skills: { faction: null, tier: 0 }, // 25.3：五大流派，faction為覺醒鎖定的主流派id，tier為已解鎖T1~T4階數
      upcomingThreat: null,
      currency: { embers: 150 }, // 32.8
      itemUseCount: {},
      itemStaminaBonus: 0,
      reinforceDiscount: 0,
      durability: {}, // 27.3 C：裝備耐久度(0-100)，key為itemId，僅追蹤已裝備過的武器/護甲
      // 29節 Peeps雙人同居
      sharedFridge: { food: 0, water: 0, specialItem: null, note: null },
      whiteboardMessage: "便條：歡迎來到安全屋。探索時請注意體力分配。", // 32.8
      spouseState: { hasLinked: false, weddingRingActive: false, lastSyncTimestamp: null, spouseName: null },
      dailyMood: null,
      dailyMoodDay: null,
      statusEffects: [] // 27.4：戰鬥/階段內暫時狀態效果
    };
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // 29.1：同伴台詞[PlayerName]標籤替換為配偶姓名（單機未連結時回退顯示"對方"）
  function replacePlayerNameTag(text, state) {
    const name = (state.spouseState && state.spouseState.spouseName) || "對方";
    return text.replace(/\[PlayerName\]/g, name);
  }

  // 29.3a：每日心情簽到，當天首次簽到san+3，每日僅可一次
  function dailyMoodCheckin(state, mood) {
    if (state.dailyMoodDay === state.day) return { ok: false, reason: "already_checked" };
    state.dailyMood = mood;
    state.dailyMoodDay = state.day;
    state.san = clamp(state.san + 3, 0, getEffectiveSanMax(state));
    return { ok: true };
  }

  // 29.2：將自己的food/water存入共享冰箱緩衝格（單機下僅作個人儲存，不可取出他人物資）
  // V2.0第6項：可附帶一張暖心便條(note)，留給提取冰箱的對方看
  function depositToFridge(state, food, water, note) {
    food = Math.min(food, state.resources.food);
    water = Math.min(water, state.resources.water);
    if (food <= 0 && water <= 0) return { ok: false, reason: "nothing_to_deposit" };
    state.resources.food -= food;
    state.resources.water -= water;
    state.sharedFridge.food += food;
    state.sharedFridge.water += water;
    if (note) state.sharedFridge.note = note;
    return { ok: true, food, water };
  }

  // V2.0第6項：提取共享冰箱——取走全部food/water並回復SAN+30，附帶的便條會一併顯示後清除
  function withdrawFromFridge(state) {
    const { food, water, note } = state.sharedFridge;
    if (food <= 0 && water <= 0) return { ok: false, reason: "empty" };
    const foodCap = getResourceCap(state, "food");
    const waterCap = getResourceCap(state, "water");
    state.resources.food = clamp(state.resources.food + food, 0, foodCap);
    state.resources.water = clamp(state.resources.water + water, 0, waterCap);
    state.san = clamp(state.san + 30, 0, getEffectiveSanMax(state));
    state.sharedFridge.food = 0;
    state.sharedFridge.water = 0;
    state.sharedFridge.note = null;
    return { ok: true, food, water, note: note || null };
  }

  // 29.2/29.3a：產生QR同步碼，包含白板留言/姓名/結婚戒指裝備狀態/冰箱物資/共同進度資訊
  function generateSyncCode(state) {
    const acc = getEquipRef(state, state.equipment && state.equipment.accessory);
    const weddingRingEquipped = !!(acc && acc.item && acc.item.id === "wedding_ring");
    const facilitiesTotal = state.facilities ? (state.facilities.command + state.facilities.greenhouse + state.facilities.workshop + state.facilities.radar) : 0;
    const payload = {
      playerName: state.playerName,
      whiteboardMessage: state.whiteboardMessage,
      sharedFridge: { food: state.sharedFridge.food, water: state.sharedFridge.water },
      weddingRingEquipped,
      dailyMood: state.dailyMood,
      day: state.day,
      progress: { facilitiesTotal, bossesDefeated: (state.bossesDefeated || 0) }
    };
    const json = JSON.stringify(payload);
    return typeof btoa === "function" ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, "utf8").toString("base64");
  }

  // 29.2/29.3a：套用對方的QR同步碼——更新白板/配偶姓名/結婚戒指雙效/冰箱物資提取/共同進度與同步時間
  function applySyncCode(state, code) {
    let payload;
    try {
      const json = typeof atob === "function" ? decodeURIComponent(escape(atob(code))) : Buffer.from(code, "base64").toString("utf8");
      payload = JSON.parse(json);
    } catch (e) {
      return { ok: false, reason: "invalid_code" };
    }
    state.spouseState.hasLinked = true;
    state.spouseState.spouseName = payload.playerName || state.spouseState.spouseName;
    state.spouseState.lastSyncTimestamp = state.day;
    state.whiteboardMessage = replacePlayerNameTag(payload.whiteboardMessage || "", state);
    const acc = getEquipRef(state, state.equipment && state.equipment.accessory);
    const ownWeddingRingEquipped = !!(acc && acc.item && acc.item.id === "wedding_ring");
    state.spouseState.weddingRingActive = ownWeddingRingEquipped && !!payload.weddingRingEquipped;
    const extractedFood = payload.sharedFridge ? payload.sharedFridge.food || 0 : 0;
    const extractedWater = payload.sharedFridge ? payload.sharedFridge.water || 0 : 0;
    state.resources.food += extractedFood;
    state.resources.water += extractedWater;
    const facilitiesTotal = state.facilities ? (state.facilities.command + state.facilities.greenhouse + state.facilities.workshop + state.facilities.radar) : 0;
    state.spouseState.jointProgress = {
      mine: facilitiesTotal + (state.bossesDefeated || 0),
      theirs: payload.progress ? (payload.progress.facilitiesTotal || 0) + (payload.progress.bossesDefeated || 0) : 0
    };
    state.spouseState.spouseMood = payload.dailyMood || null;
    return { ok: true, extractedFood, extractedWater };
  }

  // A.3：取得資源上限（基礎resourceCaps + 同居紀念相片牆等家具的resourceCapBonus，僅spouseState.hasLinked時生效）
  function getResourceCap(state, key) {
    const base = state.resourceCaps[key] ?? 99;
    if (state.spouseState && state.spouseState.hasLinked) {
      return base + sumFurnitureEffect(state, "resourceCapBonus");
    }
    return base;
  }

  function applyEffect(state, effect) {
    if (!effect) return state;
    if (effect.hp) {
      state.hp = clamp(state.hp + effect.hp, 0, getEffectiveHpMax(state));
    }
    if (effect.resources) {
      for (const key in effect.resources) {
        const cap = getResourceCap(state, key);
        state.resources[key] = clamp((state.resources[key] || 0) + effect.resources[key], 0, cap);
      }
    }
    if (effect.baseDefense) {
      // 22.2：baseDefense主要來源改為facilities.command*2；事件/道具的舊式加成記錄於bonusDefense並疊加
      state.bonusDefense = Math.max(0, (state.bonusDefense || 0) + effect.baseDefense);
      syncBaseDefense(state);
    }
    if (effect.equipment_pool) {
      const itemId = effect.equipment_pool[Math.floor(Math.random() * effect.equipment_pool.length)];
      // #21補完：rare以上裝備走instantiateEquipment生成前綴/耐久；common/uncommon維持原樣回傳baseItemId
      const result = instantiateEquipment(state, itemId, Math.random);
      if (typeof result === "string" && result.startsWith("inst_")) {
        state.lastGainedItemId = result;
      } else {
        const existing = state.inventory.find(i => i.itemId === itemId);
        if (existing) existing.qty += 1;
        else state.inventory.push({ itemId, qty: 1 });
        state.lastGainedItemId = itemId;
      }
    }
    if (effect.companion) {
      state.companion = true;
      recruitCompanion(state, "雷恩");
    }
    if (effect.setFlag) {
      if (!state.flags) state.flags = {};
      state.flags[effect.setFlag] = state.day;
    }
    // 25.3商城：餘燼幣／技能點補充；25.4道具：素質加成／體力恢復／強化據點折扣
    if (effect.embers) {
      state.currency.embers = Math.max(0, (state.currency.embers || 0) + effect.embers);
    }
    if (effect.skillPoint) {
      state.skillPoints = Math.max(0, (state.skillPoints || 0) + effect.skillPoint);
    }
    if (effect.furniture) {
      for (const itemId of effect.furniture) {
        const existing = state.inventory.find(i => i.itemId === itemId);
        if (existing) existing.qty += 1;
        else state.inventory.push({ itemId, qty: 1 });
        state.lastGainedItemId = itemId;
      }
    }
    if (effect.stamina) {
      state.stamina = clamp(state.stamina + effect.stamina, 0, state.staminaMax);
    }
    if (effect.san) {
      state.san = clamp(state.san + effect.san, 0, getEffectiveSanMax(state));
    }
    if (effect.exp) {
      gainExp(state, effect.exp);
    }
    if (effect.reinforceDiscount) {
      state.reinforceDiscount = (state.reinforceDiscount || 0) + effect.reinforceDiscount;
    }
    if (effect.statBoost) {
      const sb = effect.statBoost;
      if (sb.atk) state.stats.atk += sb.atk;
      if (sb.def) state.stats.def += sb.def;
      if (sb.hpMax) {
        state.hpMax += sb.hpMax;
        state.hp = clamp(state.hp + sb.hpMax, 0, state.hpMax);
      }
      if (sb.staminaMax) {
        state.itemStaminaBonus = (state.itemStaminaBonus || 0) + sb.staminaMax;
        const newMax = staminaMax(state);
        state.stamina += (newMax - state.staminaMax);
        state.staminaMax = newMax;
      }
    }
    // #29-1b：道具/事件解鎖新地板樣式（"random"從尚未解鎖的樣式中隨機抽一個），供睡袋家具切換
    if (effect.unlockFloor) {
      if (!state.unlockedFloors) state.unlockedFloors = ["wood"];
      let fid = effect.unlockFloor;
      if (fid === "random") {
        const locked = ["tile", "rug"].filter(f => !state.unlockedFloors.includes(f));
        fid = locked.length ? locked[Math.floor(Math.random() * locked.length)] : null;
      }
      if (fid && !state.unlockedFloors.includes(fid)) {
        state.unlockedFloors.push(fid);
        state.lastUnlockedFloor = fid;
      } else {
        state.lastUnlockedFloor = null;
      }
    }
    // #29-2：道具/事件解鎖新造型（"random"從尚未解鎖的造型中隨機抽一個），供鏡子家具切換
    if (effect.unlockAppearance) {
      if (!state.unlockedAppearances) state.unlockedAppearances = ["char_1"];
      let id = effect.unlockAppearance;
      if (id === "random") {
        const locked = ["char_2", "char_3", "char_4"].filter(c => !state.unlockedAppearances.includes(c));
        id = locked.length ? locked[Math.floor(Math.random() * locked.length)] : null;
      }
      if (id && !state.unlockedAppearances.includes(id)) {
        state.unlockedAppearances.push(id);
        state.lastUnlockedAppearance = id;
      } else {
        state.lastUnlockedAppearance = null;
      }
    }
    return state;
  }

  // 25.4：使用消耗品（檢查useLimitPerGame，套用useEffect並從背包扣除）
  function useItem(state, itemId) {
    const item = ITEMS[itemId];
    if (!item || !item.useEffect) return { ok: false, reason: "not_usable" };
    const slot = state.inventory.find(i => i.itemId === itemId && i.qty > 0);
    if (!slot) return { ok: false, reason: "not_owned" };
    if (item.useLimitPerGame) {
      const used = state.itemUseCount[itemId] || 0;
      if (used >= item.useLimitPerGame) return { ok: false, reason: "limit_reached" };
      state.itemUseCount[itemId] = used + 1;
    }
    slot.qty -= 1;
    if (slot.qty <= 0) {
      state.inventory = state.inventory.filter(i => i !== slot);
    }
    applyEffect(state, item.useEffect);
    return { ok: true };
  }

  function pickWeighted(list, rng = Math.random) {
    const total = list.reduce((s, e) => s + e.weight, 0);
    let r = rng() * total;
    for (const e of list) {
      if (r < e.weight) return e;
      r -= e.weight;
    }
    return list[list.length - 1];
  }

  function pickEvent(state, rng = Math.random) {
    const pool = EVENTS.filter(e =>
      e.minDay <= state.day &&
      (e.maxDay === null || e.maxDay === undefined || state.day <= e.maxDay) &&
      e.phase.includes(state.phase) &&
      (!e.condition || e.condition(state))
    );
    // 依玩家當下狀態（HP/資源/等級/夥伴等）動態調整事件權重，讓同情境產生不同結果
    const adjusted = pool.map(e => ({
      ...e,
      weight: Math.max(0, e.weight + (e.weightModifier ? e.weightModifier(state) : 0))
    }));
    return pickWeighted(adjusted, rng);
  }

  // 階段結束的被動消耗，回傳是否死亡
  // 27.2：有同伴時food/water消耗各+1
  function applyPhaseDecay(state, rng = Math.random) {
    tickStatusEffects(state); // 27.4
    const base = state.companion ? 2 : 1;
    const extraWater = getAccessoryEffect(state, "extraWaterDecay"); // 27.1：洋流寄生蛭，每階段水消耗額外+1
    // v117：巨型地脈藤蔓標本(furn_vines)——已陳列時，每階段50%機率水消耗-1（最低0）
    let waterDecay = base + extraWater;
    if (state.baseSlots && Object.values(state.baseSlots).includes("furn_vines") && rng() < 0.5) {
      waterDecay = Math.max(0, waterDecay - 1);
    }
    applyEffect(state, { resources: { food: -base, water: -waterDecay } });
    if (state.resources.food <= 0 || state.resources.water <= 0) {
      let penalty = -5;
      if (factionTier(state, "ocean") >= 3) penalty = Math.round(penalty * 0.7); // 25.3 洋流寄生T3：環境負面傷害-30%
      applyEffect(state, { hp: penalty });
    }
    return state.hp <= 0;
  }

  // 一個phase內每完成一次行動，若食物與飲水都還有餘裕，被動恢復少量HP
  // （緩解戰鬥/趕路造成的HP耗損；ACTION_POINTS_PER_PHASE提高後，每次行動都檢查一次以維持原本的回復頻率）
  function applyActionRegen(state) {
    if (state.resources.food > 0 && state.resources.water > 0) {
      applyEffect(state, { hp: 1 });
    }
  }

  // 推進到下一個 phase/day
  function advancePhase(state, rng = Math.random) {
    if (state.phase === "day") {
      state.phase = "night";
    } else {
      state.phase = "day";
      state.day += 1;
      // A.3：同居紀念相片牆——已連結配偶時，每日清晨資源上限全項+2
      if (state.spouseState && state.spouseState.hasLinked) {
        const capBonus = sumFurnitureEffect(state, "resourceCapBonus");
        if (capBonus > 0) {
          for (const key in state.resourceCaps) state.resourceCaps[key] += capBonus;
        }
      }
    }
    state.actionPoints = ACTION_POINTS_PER_PHASE;
    state.staminaMax = staminaMax(state);
    state.stamina = state.staminaMax;
    refreshCompanionUnlocks(state);
    // v117：蓋亞靈能生態溫室(furn_greenhouse)——已陳列時，每次晝夜切換產出食物1~2
    if (state.baseSlots && Object.values(state.baseSlots).includes("furn_greenhouse")) {
      applyEffect(state, { resources: { food: rng() < 0.5 ? 1 : 2 } });
    }
    // 22.2：生態溫室被動產出（不消耗AP/體力）：Lv1每階段+1食物，Lv2再+1飲水
    const greenhouseLv = (state.facilities && state.facilities.greenhouse) || 0;
    if (greenhouseLv >= 1) applyEffect(state, { resources: { food: 1 } });
    if (greenhouseLv >= 2) applyEffect(state, { resources: { water: 1 } });
    // 25.3 蓋亞血脈T1：每階段自動回復HP上限3%
    if (factionTier(state, "gaia") >= 1 && state.hp > 0) {
      applyEffect(state, { hp: Math.round(state.hpMax * 0.03) });
    }
    // 28.1：艾莉指派為「採集」時，每階段自動執行一次採集（不消耗玩家體力）
    if (companionAssigned(state, "gather")) {
      applyEffect(state, { resources: gatherYield(rng, state) });
    }
    // 27.2：返回據點(每階段結算)時，舊筆記本等家具回SAN（資料驅動 effects.returnSanBonus）
    const returnSanBonus = sumFurnitureEffect(state, "returnSanBonus");
    if (returnSanBonus > 0) {
      state.san = clamp(state.san + returnSanBonus, 0, getEffectiveSanMax(state));
    }
    checkUpcomingThreat(state, rng);
    return state;
  }

  // ---------- 血月狂潮排程（V2.0：取代26.3軟性預告，改為剛性7~10天週期） ----------
  // 3天倒數準備期；血月夜當天觸發決戰(isThreatDue)，結算後clearUpcomingThreat，下個phase即重新排程下一輪
  const THREAT_LEAD_DAYS = 3;
  const BLOOD_MOON_CYCLE_MIN = 7;
  const BLOOD_MOON_CYCLE_MAX = 10;

  function checkUpcomingThreat(state, rng = Math.random) {
    if (state.upcomingThreat) return;
    const cycle = BLOOD_MOON_CYCLE_MIN + Math.floor(rng() * (BLOOD_MOON_CYCLE_MAX - BLOOD_MOON_CYCLE_MIN + 1));
    state.upcomingThreat = { day: state.day + cycle, scheduledOn: state.day };
  }

  function isThreatDue(state) {
    return !!(state.upcomingThreat && state.day >= state.upcomingThreat.day);
  }

  function clearUpcomingThreat(state) {
    state.upcomingThreat = null;
  }

  // ---------- 血月狂潮：第一階段自動防禦對沖（V2.0 §2.2） ----------
  // baseDefense(=指揮中心Lv*2+bonusDefense)越高，自動防禦減傷率越高，上限70%（沙袋/槓塔擋下大半雜兵）
  // defenseRatio>=0.5時視為「擋下整波雜兵」，決戰僅需面對精英Boss波次
  function resolveBloodMoonDefense(state) {
    const baseDefense = state.baseDefense || 0;
    const defenseRatio = Math.min(0.7, baseDefense / 30);
    const wavesBlocked = defenseRatio >= 0.5 ? 1 : 0;
    return { baseDefense, defenseRatio, wavesBlocked };
  }

  // ---------- 血月狂潮：戰後狂歡結算（V2.0 §2.3） ----------
  // 首次擊退血月狂潮時，插旗flags.bloodmoon_breach_1，解鎖淹沒的靈能地鐵站(loc_sunken_subway)等提前遠征點
  function bloodMoonRewards(state) {
    const reward = { embers: 40, skillPoint: 1 };
    applyEffect(state, reward);
    state.bloodMoonWins = (state.bloodMoonWins || 0) + 1;
    let unlockedLocation = null;
    if (state.bloodMoonWins === 1 && !state.flags.bloodmoon_breach_1) {
      state.flags.bloodmoon_breach_1 = true;
      unlockedLocation = "loc_sunken_subway";
    }
    return { ...reward, unlockedLocation };
  }

  // ---------- V2.0 §1.2：Tier0~3行政區插旗 ----------
  // 每次擊退血月狂潮(bloodMoonWins達1~4)，額外觸發一場分級Boss戰；
  // 取勝後插旗flags.tier{N}_liberated並掉落流派神裝，作為內政科技/神裝的長線解鎖
  // V2.0第8項：分級行政區插旗文案優先靈能化(靈能暴動殘留/地脈活化/石英粉塵低語)
  const TIER_ZONES = [
    { tier: 0, name: "近郊封鎖線", flag: "tier0_liberated", bossEnemyId: "enemy_walker_brute", extraTier: 2, reward: { equipment_pool: ["gaia_skin"] }, psychicNote: "殘留的靈能暴動餘波仍在巷弄間打轉，扭曲的咆哮聲此起彼落" },
    { tier: 1, name: "工業自動化區", flag: "tier1_liberated", bossEnemyId: "enemy_cyborg_nemesis", extraTier: 1, reward: { equipment_pool: ["mind_mirror"] }, psychicNote: "地脈活化使廢棄產線詭異地自行運轉，金屬摩擦聲混著低頻嗡鳴" },
    { tier: 2, name: "地下中繼指揮所", flag: "tier2_liberated", bossEnemyId: "enemy_cyborg_nemesis", extraTier: 2, reward: { equipment_pool: ["mind_greatsword"] }, psychicNote: "石英粉塵在通風管道裡低聲呢喃，彷彿在訴說無人聽懂的指令" },
    { tier: 3, name: "母體核心", flag: "tier3_liberated", bossEnemyId: "enemy_cyborg_nemesis", extraTier: 3, reward: { equipment_pool: ["cyber_suit"] }, psychicNote: "靈能暴動的源頭就在眼前——空氣本身彷彿都在脈動" },
  ];

  // 依bloodMoonWins回傳本次應插旗的Tier區（若該Tier已插旗或bloodMoonWins>4則回傳null）
  function getTierZoneForBloodMoonWin(state) {
    const idx = (state.bloodMoonWins || 0) - 1;
    if (idx < 0 || idx >= TIER_ZONES.length) return null;
    const zone = TIER_ZONES[idx];
    if (state.flags[zone.flag]) return null;
    return zone;
  }

  function battleDamage(attackerAtk, defenderDef) {
    return Math.max(1, attackerAtk - defenderDef);
  }

  // 計算裝備+技能樹加成後的實際戰鬥屬性（24.4戰鬥樹1/2/4階）
  // 25.3：裝備+五大流派加成後的實際戰鬥屬性
  function getEffectiveStats(state) {
    const weaponId = state.equipment && state.equipment.weapon;
    const armorId = state.equipment && state.equipment.armor;
    const weaponRef = getEquipRef(state, weaponId);
    const armorRef = getEquipRef(state, armorId);
    let atkBonus = (weaponRef && weaponRef.stats && weaponRef.stats.atk) || 0;
    let armorDefBonus = (armorRef && armorRef.stats && armorRef.stats.def) || 0;
    const weaponDefBonus = (weaponRef && weaponRef.stats && weaponRef.stats.def) || 0;
    // 27.1：【完美的】前綴已於實例化時計入stats，【沉重的】前綴對防具+2def於實例化時計入
    // 27.3 C：裝備耐久度為0時，該裝備的屬性加成減半
    if (weaponId && getDurability(state, weaponId) <= 0) atkBonus = Math.floor(atkBonus / 2);
    if (armorId && getDurability(state, armorId) <= 0) armorDefBonus = Math.floor(armorDefBonus / 2);
    // 遠程武器(ranged)：彈藥(ammo)耗盡時攻擊力加成減半
    if (weaponRef && weaponRef.item && weaponRef.item.ranged && (state.resources.ammo || 0) <= 0) {
      atkBonus = Math.floor(atkBonus / 2);
    }
    const defBonus = weaponDefBonus + armorDefBonus;
    // v120：兄弟會戰術軍旗(furn_flag)等statusEffects型atk加成
    const atkBuff = (state.statusEffects || []).reduce((s, e) => s + (e.type === "atkBuff" ? e.value : 0), 0);
    let atk = state.stats.atk + atkBonus + atkBuff;
    let def = state.stats.def + defBonus;
    const cyber = factionTier(state, "cyber");
    if (cyber >= 1) def += 2; // 廢鐵裝甲
    if (cyber >= 2) atk += 1; // 合金外骨骼
    if (cyber >= 4) atk = Math.round(atk * 1.3); // 舊世機神·超載
    if (factionTier(state, "ocean") >= 2) atk += 3; // 酸蝕體液（敵防-3等效）
    if (factionTier(state, "aero") >= 2) atk += 1; // 25.3 大氣幽魂T2：音波干擾，簡化追加攻擊+1
    if (factionTier(state, "aero") >= 3) def += 2; // 25.3 大氣幽魂T3：真空屏障，簡化追加防禦+2
    const mind = factionTier(state, "mind");
    if (mind >= 1) def += Math.floor((state.san || 0) / 20); // 水晶稜鏡
    if (mind >= 2) def += 1; // 認知偏折
    return { atk, def };
  }

  // 25.3：流派相關的暴擊機率/倍率
  function getCritChance(state) {
    let c = 0;
    if (factionTier(state, "aero") >= 1) c += 0.05; // 靜電外殼
    if (factionTier(state, "gaia") >= 3 && state.san < 40) c += 0.15; // 捕食者基因
    // 29.3：失落的結婚戒指，雙方QR互掃確認後暴擊率永久+15%
    const acc = getEquipRef(state, state.equipment && state.equipment.accessory);
    if (acc && acc.item && acc.item.id === "wedding_ring" && state.spouseState && state.spouseState.weddingRingActive) c += 0.15;
    return c;
  }
  // 27.1：遠程武器每次攻擊消耗1彈藥(ammo)；非遠程武器或彈藥已耗盡時不消耗
  function consumeAmmoForAttack(state) {
    const weaponRef = getEquipRef(state, state.equipment && state.equipment.weapon);
    if (!weaponRef || !weaponRef.item || !weaponRef.item.ranged) return;
    if ((state.resources.ammo || 0) > 0) state.resources.ammo -= 1;
  }

  // ---------- 27.4 狀態效果系統(statusEffects) ----------
  function addStatusEffect(state, type, value, duration, source) {
    state.statusEffects.push({ id: `${type}_${Date.now()}_${Math.random()}`, type, value, duration, source });
  }

  // 每階段結束時遞減duration，duration<=0則移除
  function tickStatusEffects(state) {
    state.statusEffects = state.statusEffects.filter(e => {
      e.duration -= 1;
      return e.duration > 0;
    });
  }

  // cyber_suit(27.1)：受到傷害時20%機率將本次傷害的50%轉化為shield，下次受傷優先扣shield
  function maybeGenerateShield(state, dmgTaken, rng = Math.random) {
    const armor = getEquipRef(state, state.equipment && state.equipment.armor);
    if (armor && armor.item && armor.item.id === "cyber_suit" && dmgTaken > 0 && rng() < 0.2) {
      addStatusEffect(state, "shield", Math.floor(dmgTaken * 0.5), 99, "cyber_suit");
    }
  }

  // 套用shield吸收傷害，回傳扣除shield後實際應扣HP的傷害量
  function absorbShield(state, dmg) {
    let remaining = dmg;
    for (const e of state.statusEffects) {
      if (e.type !== "shield" || remaining <= 0) continue;
      const absorbed = Math.min(e.value, remaining);
      e.value -= absorbed;
      remaining -= absorbed;
    }
    state.statusEffects = state.statusEffects.filter(e => e.type !== "shield" || e.value > 0);
    return remaining;
  }

  // ocean_mace(27.1)：25%機率使敵人附加1回合stun（由呼叫端標記在enemy物件上）
  function maybeStunEnemy(state, rng = Math.random) {
    const weapon = getEquipRef(state, state.equipment && state.equipment.weapon);
    return !!(weapon && weapon.item && weapon.item.id === "ocean_mace" && rng() < 0.25);
  }

  // corrosive前綴/ocean_pistol(27.1)：每次攻擊使敵方防禦-1，疊加上限-5（由呼叫端記錄在enemy物件的_defShred上）
  function getDefShredPerHit(state) {
    const weapon = getEquipRef(state, state.equipment && state.equipment.weapon);
    if (!weapon) return 0;
    if (weapon.item && weapon.item.id === "ocean_pistol") return 1;
    if (weapon.prefix && weapon.prefix.id === "corrosive") return 1;
    return 0;
  }

  function applyDefShred(enemyObj, state) {
    const shred = getDefShredPerHit(state);
    if (shred <= 0) return;
    enemyObj._defShred = Math.min(5, (enemyObj._defShred || 0) + shred);
  }

  function getShreddedDef(enemyObj) {
    return Math.max(0, (enemyObj.def || 0) - (enemyObj._defShred || 0));
  }

  const CRIT_MULTIPLIER = 1.5;
  function getCritMultiplier(state) {
    const weapon = getEquipRef(state, state.equipment && state.equipment.weapon);
    if (weapon && weapon.effects && weapon.effects.critMultiplierOverride) return weapon.effects.critMultiplierOverride; // 重力晶格巨劍：暴擊200%
    return factionTier(state, "aero") >= 4 ? 2.0 : CRIT_MULTIPLIER; // 雷磁風暴翼
  }

  // 25.3 蓋亞血脈T2：攻擊附帶15%吸血；27.1：活化荊棘刺鞭(+15%)與【飢渴的】前綴(+5%)疊加
  function getLifestealRatio(state) {
    let ratio = factionTier(state, "gaia") >= 2 ? 0.15 : 0;
    const weapon = getEquipRef(state, state.equipment && state.equipment.weapon);
    if (weapon) {
      if (weapon.effects && weapon.effects.lifestealBonus) ratio += weapon.effects.lifestealBonus;
      if (weapon.prefix && weapon.prefix.effect && weapon.prefix.effect.lifestealBonus) ratio += weapon.prefix.effect.lifestealBonus;
    }
    return ratio;
  }

  // 25.3 洋流寄生T1：物理閃避率+5%；27.1：重水防護夾克(+5%)
  function getDodgeChance(state) {
    let chance = factionTier(state, "ocean") >= 1 ? 0.05 : 0;
    if (factionTier(state, "aero") >= 1) chance += 0.03; // 25.3 大氣幽魂T1：靜電外殼，簡化追加閃避+3%
    const armor = getEquipRef(state, state.equipment && state.equipment.armor);
    if (armor && armor.effects && armor.effects.dodgeBonus) chance += armor.effects.dodgeBonus;
    return chance;
  }

  // 27.1：取得已裝備飾品的effects欄位指定數值（如sanMaxBonus/hpMaxBonus/merchantDiscount）
  function getAccessoryEffect(state, key) {
    const acc = getEquipRef(state, state.equipment && state.equipment.accessory);
    if (acc && acc.effects && typeof acc.effects[key] === "number") return acc.effects[key];
    return 0;
  }

  // 27.1：取得當前裝備加成後的sanMax上限（基礎sanMax + 飾品sanMaxBonus + 防具前綴"止水之"sanMaxBonus）
  function getEffectiveSanMax(state) {
    let bonus = getAccessoryEffect(state, "sanMaxBonus");
    const armor = getEquipRef(state, state.equipment && state.equipment.armor);
    if (armor && armor.prefix && armor.prefix.effect && armor.prefix.effect.sanMaxBonus) bonus += armor.prefix.effect.sanMaxBonus;
    return state.sanMax + bonus;
  }

  // 27.1：取得當前裝備加成後的hpMax上限（基礎hpMax + 飾品hpMaxBonus，如洋流寄生蛭+10）
  function getEffectiveHpMax(state) {
    return state.hpMax + getAccessoryEffect(state, "hpMaxBonus");
  }

  // 25.3 鋼鐵活化T4：無視敵方50%防禦；27.1：高頻次聲波刃無視全部防禦
  function getIgnoreDefRatio(state) {
    const weapon = getEquipRef(state, state.equipment && state.equipment.weapon);
    if (weapon && weapon.effects && weapon.effects.ignoreDefBonus) return 1;
    return factionTier(state, "cyber") >= 4 ? 0.5 : 0;
  }

  // 25.3 鋼鐵活化T3：對factionTag=cyber的敵人傷害+50%
  function getFactionDamageMultiplier(state, enemy) {
    return (factionTier(state, "cyber") >= 3 && enemy && enemy.factionTag === "cyber") ? 1.5 : 1;
  }

  // 27.5：cyber_hammer對機械系敵人(enemy.mechanical)傷害+100%（與其他傷害乘數採乘法疊加，35.4）
  function getMechanicalDamageMultiplier(state, enemy) {
    const weapon = getEquipRef(state, state.equipment && state.equipment.weapon);
    return (weapon && weapon.item && weapon.item.id === "cyber_hammer" && enemy && enemy.mechanical) ? 2 : 1;
  }

  // #20-6：終局Boss流派對沖——enemy_cyborg_nemesis對玩家已鎖定的主流派(tier>=1)傷害抵抗20%（與其他傷害乘數採乘法疊加，35.4）
  function getBossFactionCounterMult(state, enemy) {
    if (!enemy || enemy.id !== "enemy_cyborg_nemesis") return 1;
    return (state.skills && state.skills.faction && state.skills.tier >= 1) ? 0.8 : 1;
  }

  // 25.3 心靈晶格T4：戰鬥受到傷害-25%；27.1：深淵黑血外皮+15%（兩者加總）
  function getBattleDamageReductionRatio(state) {
    let ratio = factionTier(state, "mind") >= 4 ? 0.25 : 0;
    const armor = getEquipRef(state, state.equipment && state.equipment.armor);
    if (armor && armor.effects && armor.effects.battleDamageReductionBonus) ratio += armor.effects.battleDamageReductionBonus;
    return ratio;
  }

  // 25.3 蓋亞血脈T4：每局1次，致命傷免死並回復50%HP
  function gaiaCheatDeath(state) {
    if (factionTier(state, "gaia") >= 4 && !state.flags.gaiaReviveUsed) {
      state.flags.gaiaReviveUsed = true;
      state.hp = Math.max(1, Math.round(state.hpMax * 0.5));
      return true;
    }
    return false;
  }

  const LEVEL_UP_HP_BONUS = 10;
  const LEVEL_UP_ATK_BONUS = 1;

  // 取得經驗值，可能連續升級；回傳升級次數
  function gainExp(state, amount) {
    state.exp += amount;
    let levelUps = 0;
    while (state.exp >= state.expToNext) {
      state.exp -= state.expToNext;
      state.level += 1;
      state.expToNext = Math.floor(state.expToNext * 1.5);
      state.hpMax += LEVEL_UP_HP_BONUS;
      state.stats.atk += LEVEL_UP_ATK_BONUS;
      state.hp = state.hpMax; // 升級時HP全滿
      if (state.level === 2 && !state.awakening) {
        triggerAwakening(state);
        state.hp = state.hpMax; // 強韌體質可能提升hpMax，再次回滿
      }
      state.skillPoints = (state.skillPoints || 0) + 1; // 24.4：等級2起每升一級得1技能點（含1->2這次）
      const newStaminaMax = staminaMax(state);
      state.stamina += (newStaminaMax - state.staminaMax); // 立即反映體力上限提升（24.1升級回饋）
      state.staminaMax = newStaminaMax;
      levelUps += 1;
    }
    return levelUps;
  }

  // 採集獲得量：食物/飲水 1~2（避免0造成連續虧損），廢料 0~2
  // state可選：探索樹1/5階提升採集量、5階10%機率「意外發現」+1廢料
  function gatherYield(rng = Math.random, state = null) {
    return {
      food: 1 + Math.floor(rng() * 2),
      water: 1 + Math.floor(rng() * 2),
      scrap: Math.floor(rng() * 3)
    };
  }

  // #21-2追加：物資轉換(SA 23節)——消耗囤積的廢料換取當下更需要的補給，作為cautious策略後期的廢料出口
  const CONVERT_SCRAP_COST = 10;
  function convertScrap(state, rng = Math.random) {
    state.resources.scrap -= CONVERT_SCRAP_COST;
    const roll = rng();
    if (roll < 0.45) return { food: 3 };
    if (roll < 0.9) return { water: 3 };
    return { medicine: 1 };
  }

  // 遠距地點的路程成本（去回各消耗一些食物/飲水）
  const FAR_TRAVEL_COST = { food: 1, water: 1 };

  // 從地點清單隨機抽出 count 個（不重複），讓每輪可選地點不同
  function pickLocations(locations, count, rng = Math.random) {
    const pool = [...locations];
    const picked = [];
    while (pool.length > 0 && picked.length < count) {
      const idx = Math.floor(rng() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }
    return picked;
  }

  // 解析地點探索結果：可能遭遇敵人，也可能拾獲戰利品
  // state可選：第15天起，威脅升級，較高機率遇到清單中較強的敵人（陣列尾端）
  function resolveLocation(location, rng = Math.random, state = null) {
    if (rng() < location.encounterChance) {
      const ids = location.encounterEnemyIds;
      let enemyId;
      if (state && state.day >= 15 && ids.length > 1 && rng() < 0.5) {
        enemyId = ids[ids.length - 1];
      } else {
        enemyId = ids[Math.floor(rng() * ids.length)];
      }
      return { type: "battle", enemyId };
    }
    const drop = pickWeighted(location.lootTable, rng);
    return { type: "loot", itemId: drop.itemId, qty: drop.qty };
  }

  // 套用短篇序章「第一晚」的結局效果到state（MVP4，沙盒模式開局加成/懲罰）
  function applyPrologueEnding(state, endingId) {
    if (!state.flags) state.flags = {};
    state.flags[endingId] = true;
    if (endingId === "companion") {
      state.companion = true;
      recruitCompanion(state, "雷恩");
      state.baseDefense += 1;
      state.inventory.push({ itemId: "bandage", qty: 1 });
    } else if (endingId === "weak") {
      state.hpMax = Math.max(50, state.hpMax - 10);
      state.hp = Math.min(state.hp, Math.floor(state.hpMax * 0.5));
    }
    state.prologueDone = true;
    return state;
  }

  // 里程碑事件：特定天數第一次到達時觸發的一次性特殊事件，優先於一般隨機事件
  function getMilestoneEvent(state) {
    return MILESTONE_EVENTS.find(e =>
      e.day === state.day && !state.milestonesShown.includes(e.id)
    ) || null;
  }

  // 22.1：長期目標 = 四大設備(22.2)全數達Lv3 ＋ 擊敗終域(tier3)分級Boss（取代原SANDBOX_GOAL_DAY/day180判定）
  function longTermGoalMet(state) {
    const f = state.facilities || {};
    const allMaxed = ["command", "greenhouse", "workshop", "radar"].every(k => (f[k] || 0) >= 3);
    return allMaxed && !!(state.flags && state.flags.finalBossDefeated);
  }

  // 達成長期目標後的最終總結評價：依四大設備總等級＋已擊敗的分級Boss數量分級
  function evaluateSandboxEnding(state) {
    const f = state.facilities || {};
    const facilitiesSum = ["command", "greenhouse", "workshop", "radar"].reduce((s, k) => s + (f[k] || 0), 0);
    const bossesDefeated = (state.flags && state.flags.bossesDefeated) || 0;
    const score = facilitiesSum + bossesDefeated * 3;
    if (score >= 20) return "stronghold";
    if (state.hp >= state.hpMax * 0.5) return "survivor";
    return "barely";
  }

  const REINFORCE_COST = 5; // 強化據點消耗廢料（基礎值，實際請用reinforceCost）

  // 據點樹2階：強化據點成本-1（最低3）
  function reinforceCost(state) {
    let cost = REINFORCE_COST;
    if (state && state.reinforceDiscount) cost -= state.reinforceDiscount;
    return Math.max(3, cost);
  }

  // 25.4「強化藍圖」：消耗一次性的據點強化折扣
  function consumeReinforceDiscount(state) {
    state.reinforceDiscount = 0;
  }

  // 據點樹1/5階：夜襲機率-0.02／再-0.03(累計-0.05)；同伴指派「警戒」時-0.30
  function raidChance(state) {
    let chance = state.baseRaidChance - state.baseDefense * 0.03;
    if (state.facilities && state.facilities.command >= 3) chance -= 0.03; // 22.2：指揮核心Lv3再降低夜襲機率
    if (factionTier(state, "aero") >= 2) chance -= 0.05; // 25.3 大氣幽魂T2：音波干擾
    if (state.companion && state.companionTask === "guard") chance -= 0.3;
    if (state.companions && state.companions["雷恩"] === "guard") chance -= 0.3;
    if (state.companions && state.companions["阿卡"] === "blast") chance -= 0.1; // 28.1：阿卡爆破手額外威嚇
    chance += getFurnitureRaidChanceDelta(state); // 27.2：重力晶簇掛鏡(家具)-5%
    chance += getAccessoryEffect(state, "raidChanceDelta"); // 27.1：重力晶簇掛鏡(飾品)-5%
    return Math.max(0.02, chance);
  }

  // 22.2：baseDefense = facilities.command*2（相容別名）+ bonusDefense（事件/道具的舊式加成）+ 27.2家具防禦加成
  function syncBaseDefense(state) {
    const commandLv = (state.facilities && state.facilities.command) || 0;
    state.baseDefense = commandLv * 2 + (state.bonusDefense || 0) + getFurnitureDefBonus(state);
    return state.baseDefense;
  }

  // ---------- 27.2 家具池：陳列格(baseSlots.wall/table/floor)放置與效果 ----------
  function placeFurniture(state, itemId) {
    const item = ITEMS[itemId];
    if (!item || item.type !== "furniture") return { ok: false, reason: "invalid_item" };
    const entry = state.inventory.find(i => i.itemId === itemId);
    if (!entry || entry.qty <= 0) return { ok: false, reason: "not_in_inventory" };
    if (!state.baseSlots) state.baseSlots = { wall: null, table: null, floor: null, wall2: null, table2: null, floor2: null };
    const base = item.slot;
    const alt = base + "2";
    // v112：每種槽位開放第二格，已有第一格時優先放第二格(空)，否則覆蓋第一格
    let slot = base;
    if (state.baseSlots[base] && !state.baseSlots[alt]) slot = alt;
    const prev = state.baseSlots[slot];
    entry.qty -= 1;
    if (entry.qty <= 0) state.inventory.splice(state.inventory.indexOf(entry), 1);
    if (prev) {
      const prevEntry = state.inventory.find(i => i.itemId === prev);
      if (prevEntry) prevEntry.qty += 1;
      else state.inventory.push({ itemId: prev, qty: 1 });
    }
    state.baseSlots[slot] = itemId;
    syncBaseDefense(state);
    return { ok: true, slot, replaced: prev };
  }

  // 通用：加總所有已陳列家具(wall/table/floor)中某個effects欄位的數值
  function sumFurnitureEffect(state, key) {
    if (!state.baseSlots) return 0;
    let total = 0;
    for (const slot of ["wall", "wall2", "table", "table2", "floor", "floor2"]) {
      const itemId = state.baseSlots[slot];
      const item = itemId && ITEMS[itemId];
      if (item && item.effects && typeof item.effects[key] === "number") {
        total += item.effects[key];
      }
    }
    return total;
  }

  // v110：舒適度系統——已陳列家具依稀有度加總，回饋探索/採集/休息
  const RARITY_COMFORT = { common: 1, rare: 2, epic: 3, legendary: 3 };
  function getComfortLevel(state) {
    if (!state.baseSlots) return 0;
    let total = 0;
    for (const slot of ["wall", "wall2", "table", "table2", "floor", "floor2"]) {
      const item = ITEMS[state.baseSlots[slot]];
      if (item) total += RARITY_COMFORT[item.rarity] || 0;
    }
    return total;
  }
  function getComfortLabel(level) {
    if (level >= 10) return "夢幻小窩";
    if (level >= 6) return "安樂窩";
    if (level >= 3) return "溫馨";
    return "簡陋";
  }

  // 牆面家具防禦加成（資料驅動：ITEMS[id].effects.defBonus，槓塔+25/軍旗+5/白板+5）
  function getFurnitureDefBonus(state) {
    return sumFurnitureEffect(state, "defBonus");
  }

  // 家具夜襲機率調整（資料驅動：ITEMS[id].effects.raidChanceDelta，重力晶簇掛鏡-0.05）
  function getFurnitureRaidChanceDelta(state) {
    return sumFurnitureEffect(state, "raidChanceDelta");
  }

  // 22.2：強化四大設備其中一項（command/greenhouse/workshop/radar），各0~3級
  // command達Lv2時resourceCaps全數+10（一次性，於跨越該級時觸發）
  function reinforceFacility(state, key) {
    if (!FACILITY_KEYS.includes(key)) return { ok: false, reason: "invalid_facility" };
    if (!state.facilities) state.facilities = { command: 0, greenhouse: 0, workshop: 0, radar: 0 };
    const current = state.facilities[key] || 0;
    if (current >= 3) return { ok: false, reason: "maxed" };
    const cost = reinforceCost(state);
    if (state.resources.scrap < cost) return { ok: false, reason: "insufficient_scrap" };
    state.resources.scrap -= cost;
    state.facilities[key] = current + 1;
    if (key === "command") {
      syncBaseDefense(state);
      if (state.facilities.command === 2) {
        for (const r of ["food", "water", "medicine", "ammo", "scrap"]) {
          if (state.resourceCaps[r] !== undefined) state.resourceCaps[r] += 10;
        }
      }
    }
    refreshCompanionUnlocks(state);
    return { ok: true, key, newLevel: state.facilities[key] };
  }

  const FACILITY_KEYS = ["command", "greenhouse", "workshop", "radar"];

  // 22.2：休息時SAN回復量；生態溫室Lv3時回復效率+50%
  function restSanRegen(state) {
    let regen = 10;
    if (state.facilities && state.facilities.greenhouse >= 3) regen = Math.round(regen * 1.5);
    regen += sumFurnitureEffect(state, "restSanBonus"); // 27.2：發光霓虹水母燈等資料驅動加成
    if (getComfortLevel(state) >= 6) regen += 5; // v110：舒適度≥6「安樂窩」休息SAN額外+5
    return regen;
  }

  // 28.2：沙發互動 - SAN回滿，hpMax暫時+10(1天)，附帶同伴互動文案
  function loungeInteract(state, companionName) {
    if (!state.baseSlots || state.baseSlots.floor !== "furn_sofa") return { ok: false, reason: "no_sofa" };
    const hpMaxBonus = sumFurnitureEffect(state, "loungeHpMaxBonus") || 10;
    state.san = getEffectiveSanMax(state);
    state.hpMax += hpMaxBonus;
    state.hp = Math.min(state.hp + hpMaxBonus, state.hpMax);
    if (!state.flags) state.flags = {};
    state.flags.sofaBonusExpire = (state.day || 0) + 1;
    const lines = {
      "雷恩": "雷恩靠在沙發另一端，沉默地把毯子搭到你身上。",
      "艾莉": "艾莉蜷在你旁邊，小聲哼著不成調的歌。",
      "阿卡": "阿卡笨拙地坐下，沙發發出一聲抗議般的悶響，逗你笑了。"
    };
    const text = (companionName && lines[companionName]) || "你陷進沙發裡，緊繃的神經終於鬆懈下來。";
    return { ok: true, text };
  }

  // v110：收音機互動——每日一次，SAN+3
  function radioInteract(state) {
    if (!state.baseSlots || (state.baseSlots.table !== "furn_radio" && state.baseSlots.table2 !== "furn_radio")) return { ok: false, reason: "no_radio" };
    if (!state.flags) state.flags = {};
    if (state.flags.radioUsedDay === state.day) return { ok: false, reason: "already_used" };
    state.flags.radioUsedDay = state.day;
    state.san = clamp(state.san + 3, 0, getEffectiveSanMax(state));
    return { ok: true, text: "老舊的收音機沙沙地播放著前世代的音樂，你靠著牆聽了一會，心情平靜了一些。（SAN+3）" };
  }

  // v110：孵化巢互動——每日一次，10%機率掉落稀有金屬廢料
  function eggNestInteract(state, rng = Math.random) {
    if (!state.baseSlots || (state.baseSlots.table !== "furn_egg_nest" && state.baseSlots.table2 !== "furn_egg_nest")) return { ok: false, reason: "no_nest" };
    if (!state.flags) state.flags = {};
    if (state.flags.eggNestCheckedDay === state.day) return { ok: false, reason: "already_used" };
    state.flags.eggNestCheckedDay = state.day;
    if (rng() < 0.1) {
      state.resources.scrap = Math.min((state.resources.scrap || 0) + 2, state.resourceCaps.scrap);
      return { ok: true, found: true, text: "孵化巢裡的怪物今天似乎吐出了一些金屬碎渣。（廢料+2）" };
    }
    return { ok: true, found: false, text: "孵化巢裡的怪物只是發出咕噜聲，今天沒有什麼收穫。" };
  }

  // ---------- 27.1：裝備實體化(weaponInstances)＋前綴詞 ----------
  function isInstanceRef(ref) {
    return typeof ref === "string" && ref.startsWith("inst_");
  }
  function getInstance(state, ref) {
    if (!isInstanceRef(ref) || !state.weaponInstances) return null;
    return state.weaponInstances.find(i => i.id === ref) || null;
  }
  // 解析裝備欄位參考值(itemId或inst_id)，回傳{item, inst, stats, prefix, rarity}
  function getEquipRef(state, ref) {
    if (!ref) return null;
    const inst = getInstance(state, ref);
    if (inst) {
      return { item: ITEMS[inst.baseItemId], inst, stats: inst.stats, prefix: inst.prefix, rarity: inst.rarity, effects: inst.baseEffects };
    }
    const item = ITEMS[ref];
    if (!item) return null;
    return { item, inst: null, stats: item.stats, prefix: null, rarity: item.rarity, effects: item.effects };
  }
  // #16：像素圖示產生器——依id字串雜湊出8x8對稱像素圖（與29節Peeps像素相片視覺呼應），無需個別美術資源即可全站擴充
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }
  const PIXEL_PALETTES = {
    weapon: ["#2c333a", "#9aa5ad", "#c0392b"],
    armor: ["#2c333a", "#5a7a9a", "#8fb3d9"],
    accessory: ["#2c333a", "#b8973f", "#f0d878"],
    consumable: ["#2c333a", "#5a9a5e", "#8fd998"],
    material: ["#2c333a", "#8a7a6a", "#cbb89a"],
    furniture: ["#2c333a", "#9a7a5a", "#d9b88f"],
    enemy: ["#3a2c3a", "#9a5a8f", "#d98fc9"],
    location: ["#2c3a30", "#5a8f6a", "#8fd9a3"],
    facility: ["#2c333a", "#b8973f", "#8fb3d9"],
    empty: ["#262b30", "#3a4248", "#3a4248"],
    default: ["#2c333a", "#9aa5ad", "#c9cfd6"]
  };
  // #22-1：角色像素圖——固定人形版型(髮/膚/衣/褲)，依seed雜湊挑選配色組合，與一般物品的隨機網格區隔
  const PLAYER_HAIR = ["#3a2c20", "#6b4a2e", "#1c1c1c", "#8f5a3a", "#4a3a2c"];
  const PLAYER_SKIN = ["#d9b38f", "#c9966f", "#e8c9a3", "#b3805a"];
  const PLAYER_CLOTHES = ["#5a7a9a", "#5a9a5e", "#9a5a8f", "#b8973f", "#c0392b", "#9aa5ad"];
  function playerSvg(seed) {
    const h = hashStr(String(seed));
    const hair = PLAYER_HAIR[h % PLAYER_HAIR.length];
    const skin = PLAYER_SKIN[(h >> 3) % PLAYER_SKIN.length];
    const clothes = PLAYER_CLOTHES[(h >> 6) % PLAYER_CLOTHES.length];
    const pants = "#2c333a";
    const size = 8;
    let rects = "";
    function px(x, y, color) { rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`; }
    // 髮
    for (let x = 2; x <= 5; x++) px(x, 0, hair);
    // 臉
    for (let x = 2; x <= 5; x++) px(x, 1, skin);
    for (let x = 2; x <= 5; x++) px(x, 2, skin);
    // 身體/衣服
    for (let y = 3; y <= 5; y++) for (let x = 1; x <= 6; x++) px(x, y, clothes);
    // 腿
    for (let y = 6; y <= 7; y++) for (let x = 2; x <= 5; x++) px(x, y, pants);
    return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" fill="#20262b"/>${rects}</svg>`;
  }
  function pixelIconSvg(seed, category) {
    if (category === "player") return playerSvg(seed);
    const palette = PIXEL_PALETTES[category] || PIXEL_PALETTES.default;
    const size = 8, half = size / 2;
    const h = hashStr(String(seed));
    const h2 = hashStr(String(seed) + "#color");
    const mode = h % 4; // 4種版型，降低同類別圖示彼此雷同感
    let rects = "";
    function px(x, y, color) {
      rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/><rect x="${size - 1 - x}" y="${y}" width="1" height="1" fill="${color}"/>`;
    }
    function colorAt(idx) {
      return ((h2 >> (idx % 32)) & 1) ? palette[1] : palette[2];
    }
    if (mode === 0) {
      // 對稱亂點
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < half; x++) {
          const idx = y * half + x;
          if ((h >> (idx % 32)) & 1) px(x, y, colorAt(idx));
        }
      }
    } else if (mode === 1) {
      // 外框 + 內部斜紋
      for (let x = 0; x < size; x++) { px(x, 0, palette[1]); px(x, size - 1, palette[1]); }
      for (let y = 0; y < size; y++) { if (y < half) px(0, y, palette[1]); }
      for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < half; x++) {
          const idx = y * half + x;
          if ((h >> (idx % 32)) & 1) px(x, y, colorAt(idx));
        }
      }
    } else if (mode === 2) {
      // 十字/菱形核心
      const cx = half - 1, cy = size / 2 - 1;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < half; x++) {
          const dist = Math.abs(x - cx) + Math.abs(y - cy);
          const idx = y * half + x;
          const on = dist <= 1 || ((h >> (idx % 32)) & 1 && dist === 3);
          if (on) px(x, y, colorAt(idx));
        }
      }
    } else {
      // 同心方框
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < half; x++) {
          const ring = Math.min(x, y, size - 1 - y);
          const idx = y * half + x;
          if (ring % 2 === ((h >> 3) & 1)) px(x, y, colorAt(idx));
        }
      }
    }
    return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" fill="${palette[0]}"/>${rects}</svg>`;
  }

  // 將prefix的statBonus/defBonus套用到stats上（修改傳入物件）
  function applyPrefixStats(stats, item, prefix) {
    if (prefix && prefix.effect && prefix.effect.statBonus) {
      const key = item.type === "armor" ? "def" : "atk";
      if (stats[key] !== undefined) stats[key] += prefix.effect.statBonus;
    }
    if (prefix && prefix.effect && prefix.effect.defBonus && stats.def !== undefined) {
      stats.def += prefix.effect.defBonus;
    }
  }

  // rare以上掉落時，依32.3數值區間隨機浮動並可疊加PREFIX_POOL前綴，實例化為weaponInstances；common/uncommon直接回傳baseItemId供放入inventory
  function instantiateEquipment(state, baseItemId, rng = Math.random) {
    const item = ITEMS[baseItemId];
    if (!item) return null;
    if (item.rarity === "common" || item.rarity === "uncommon") return baseItemId;
    if (!state.weaponInstances) state.weaponInstances = [];
    let prefix = null;
    const rarityOrder = ["common", "uncommon", "rare", "epic", "legendary"];
    if (item.rarity === "legendary") {
      prefix = rng() <= 0.5 ? PREFIX_POOL.find(p => p.id === "perfect") : PREFIX_POOL.find(p => p.id === "prefix_immortal");
    } else if (rng() < 0.4) {
      const candidates = PREFIX_POOL.filter(p =>
        (p.type === item.type || p.type === "any") &&
        rarityOrder.indexOf(item.rarity) >= rarityOrder.indexOf(p.minRarity) &&
        p.id !== "perfect"
      );
      if (candidates.length) prefix = candidates[Math.floor(rng() * candidates.length)];
    }
    const lockMax = !!(prefix && prefix.effect && prefix.effect.lockMaxStats);
    const stats = {};
    if (item.stats) {
      for (const k in item.stats) {
        const variance = item.stats[k] * 0.1;
        stats[k] = lockMax ? Math.round(item.stats[k] + variance) : Math.max(1, Math.round(item.stats[k] + (rng() * 2 - 1) * variance));
      }
    }
    const baseStats = { ...stats };
    applyPrefixStats(stats, item, prefix);
    const name = prefix ? `【${prefix.name}】${item.name}` : item.name;
    const instId = "inst_" + Math.random().toString(36).slice(2, 10);
    state.weaponInstances.push({ id: instId, baseItemId, name, rarity: item.rarity, durability: DURABILITY_MAX, stats, baseStats, prefix: prefix || null, baseEffects: item.effects || null });
    return instId;
  }

  // ---------- 27.3 C：大師重鍛（裝備耐久度） ----------
  const DURABILITY_MAX = 100;
  const DURABILITY_LOSS_PER_BATTLE = 5;
  const REPAIR_COST = { embers: 10 };

  // 未記錄過的裝備視為滿耐久；inst_開頭的裝備實體耐久存於weaponInstances各自的durability欄位
  function getDurability(state, ref) {
    const inst = getInstance(state, ref);
    if (inst) return inst.durability;
    if (!ref || !state.durability || !(ref in state.durability)) return DURABILITY_MAX;
    return state.durability[ref];
  }

  // 每次戰鬥後，當前裝備的武器/護甲耐久各-5（最低0）
  function decayEquippedDurability(state) {
    if (!state.durability) state.durability = {};
    [state.equipment && state.equipment.weapon, state.equipment && state.equipment.armor].forEach((ref) => {
      if (!ref) return;
      const inst = getInstance(state, ref);
      if (inst) {
        let loss = DURABILITY_LOSS_PER_BATTLE;
        if (inst.prefix && inst.prefix.effect && inst.prefix.effect.durabilityDecayMult) loss *= inst.prefix.effect.durabilityDecayMult;
        inst.durability = Math.max(0, inst.durability - loss);
        return;
      }
      const cur = getDurability(state, ref);
      state.durability[ref] = Math.max(0, cur - DURABILITY_LOSS_PER_BATTLE);
    });
  }

  // 重鍛：花費💎將指定裝備耐久度回滿；外骨骼重組工作台(workshop facility)Lv1+時消耗-20%
  function repairCost(state) {
    let cost = REPAIR_COST.embers;
    if (state.facilities && state.facilities.workshop >= 1) cost = Math.round(cost * 0.8);
    // v121：外骨骼重組工作台(furn_bench)——重鍛消耗再-20%
    if (state.baseSlots && Object.values(state.baseSlots).includes("furn_bench")) cost = Math.round(cost * 0.8);
    const discount = getAccessoryEffect(state, "merchantDiscount"); // 27.1：黑市VIP徽章-10%
    if (discount) cost = Math.round(cost * (1 - discount));
    return cost;
  }
  function repairEquipment(state, ref) {
    const cost = repairCost(state);
    if (state.currency.embers < cost) return { ok: false, reason: "insufficient_embers" };
    if (getDurability(state, ref) >= DURABILITY_MAX) return { ok: false, reason: "already_full" };
    applyEffect(state, { embers: -cost });
    const inst = getInstance(state, ref);
    if (inst) {
      inst.durability = DURABILITY_MAX;
    } else {
      if (!state.durability) state.durability = {};
      state.durability[ref] = DURABILITY_MAX;
    }
    return { ok: true, cost };
  }

  // #20-3：前綴重抽 — 花費💎為rare/epic裝備重抽PREFIX_POOL前綴（legendary固定"完美的"，不可重抽）
  const REFORGE_PREFIX_COST = { embers: 25 };
  function reforgePrefixCost(state) {
    let cost = REFORGE_PREFIX_COST.embers;
    if (state.facilities && state.facilities.workshop >= 1) cost = Math.round(cost * 0.8);
    const discount = getAccessoryEffect(state, "merchantDiscount");
    if (discount) cost = Math.round(cost * (1 - discount));
    return cost;
  }
  function reforgePrefix(state, ref, rng = Math.random) {
    const inst = getInstance(state, ref);
    if (!inst) return { ok: false, reason: "not_instance" };
    if (inst.rarity === "legendary") return { ok: false, reason: "legendary_fixed" };
    const cost = reforgePrefixCost(state);
    if (state.currency.embers < cost) return { ok: false, reason: "insufficient_embers" };
    applyEffect(state, { embers: -cost });
    const item = ITEMS[inst.baseItemId];
    const baseStats = inst.baseStats || { ...inst.stats };
    const rarityOrder = ["common", "uncommon", "rare", "epic", "legendary"];
    const candidates = PREFIX_POOL.filter(p =>
      (p.type === item.type || p.type === "any") &&
      rarityOrder.indexOf(inst.rarity) >= rarityOrder.indexOf(p.minRarity) &&
      p.id !== "perfect"
    );
    const prefix = candidates.length ? candidates[Math.floor(rng() * candidates.length)] : null;
    const stats = { ...baseStats };
    applyPrefixStats(stats, item, prefix);
    inst.stats = stats;
    inst.baseStats = baseStats;
    inst.prefix = prefix || null;
    inst.name = prefix ? `【${prefix.name}】${item.name}` : item.name;
    return { ok: true, cost, prefix };
  }

  // ---------- 27.3 A：模擬課金商城（扭蛋） ----------
  const GACHA_COST = { embers: 20 };
  const GACHA_RARITY_WEIGHTS = { common: 50, uncommon: 25, rare: 15, epic: 8, legendary: 2 };
  function rollGacha(rng = Math.random) {
    const pool = Object.values(ITEMS).filter(i => i.type === "weapon" || i.type === "armor" || i.type === "accessory" || i.type === "furniture");
    const weighted = pool.map(i => ({ id: i.id, weight: GACHA_RARITY_WEIGHTS[i.rarity] || 1 }));
    const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
    let r = rng() * totalWeight;
    for (const w of weighted) {
      if (r < w.weight) return w.id;
      r -= w.weight;
    }
    return weighted[weighted.length - 1].id;
  }
  function gachaCost(state) {
    let cost = GACHA_COST.embers;
    if (state.merchantDiscount) cost = Math.round(cost * (1 - state.merchantDiscount));
    const discount = getAccessoryEffect(state, "merchantDiscount"); // 27.1：黑市VIP徽章-10%
    if (discount) cost = Math.round(cost * (1 - discount));
    return cost;
  }

  // ---------- 覺醒（24.3） ----------
  function triggerAwakening(state, rng = Math.random) {
    const trait = AWAKENING_TRAITS[Math.floor(rng() * AWAKENING_TRAITS.length)];
    state.awakening = trait;
    if (trait.hpMaxBonus) state.hpMax += trait.hpMaxBonus;
    if (!state.skills) state.skills = { faction: null, tier: 0 };
    if (!state.skills.faction) {
      state.skills.faction = FACTION_IDS[Math.floor(rng() * FACTION_IDS.length)];
    }
    applyEffect(state, { embers: 20 });
    return trait;
  }

  // ---------- 技能樹（25.3：五大流派，覺醒鎖定主流派後線性解鎖T1~T4） ----------
  function spendSkillPoint(state) {
    if (!state.skills || !state.skills.faction) return false;
    if ((state.skillPoints || 0) <= 0) return false;
    const tiers = SKILLS_TREE[state.skills.faction].tiers;
    if ((state.skills.tier || 0) >= tiers.length) return false;
    state.skills.tier = (state.skills.tier || 0) + 1;
    state.skillPoints -= 1;
    return true;
  }

  // ---------- 敵人分級（26.1：由等級驅動，4個tier組0-3，第3組為終域） ----------
  function enemyTier(state) {
    return Math.min(3, Math.floor((state.level - 1) / 3));
  }

  const TIER_PREFIXES = ["", "變異的", "兇暴的", "深淵級的"];

  // v1.7 #19試點：依loc.levelCap換算地點Tier，回傳雙向輾壓資訊
  // 向上挑戰：玩家tier落後地點tier一階以上 -> 敵人數值×1.5並標示高危
  // 向下輾壓：玩家等級超過levelCap -> 不再給予exp；超過levelCap一個Tier以上 -> 玩家傷害×1.5
  function getLocationOverpower(state, loc) {
    if (!loc || loc.levelCap == null) return { enemyMult: 1, dmgMult: 1, expLocked: false, highDanger: false };
    const locTier = Math.min(3, Math.floor(loc.levelCap / 3));
    const playerTier = enemyTier(state);
    // #29-7：開局前3天為日常地點(學校/公園/倉庫等)的新手保護期，不判定為「實力差距過大」
    const highDanger = locTier - playerTier >= 1 && state.day > 3;
    const expLocked = state.level > loc.levelCap;
    const dmgMult = playerTier - locTier >= 1 ? 1.5 : 1;
    return { enemyMult: highDanger ? 1.5 : 1, dmgMult, expLocked, highDanger };
  }

  // opts.extraTier：26.3短期威脅預告觸發時額外升一級
  // opts.isNightRaid：據點樹3階對夜襲敵人初始HP-20%
  function getScaledEnemy(enemyId, state, opts = {}) {
    const { extraTier = 0, isNightRaid = false, enemyMult = 1 } = opts;
    const enemyData = ENEMIES[enemyId];
    const tier = enemyTier(state) + extraTier;
    const scaling = enemyData.scaling || { hpPerTier: 0, atkPerTier: 0 };
    let hp = enemyData.hp + scaling.hpPerTier * tier;
    let atk = enemyData.atk + scaling.atkPerTier * tier;
    if (isNightRaid && state.facilities && state.facilities.command >= 2) {
      hp = Math.max(1, Math.round(hp * 0.8)); // 22.2：指揮中心Lv2起，夜襲敵人初始HP-20%
    }
    if (enemyMult !== 1) { // v1.7 #19：向上挑戰，地點Tier領先玩家一階以上
      hp = Math.round(hp * enemyMult);
      atk = Math.round(atk * enemyMult);
    }
    let name = enemyData.name;
    if (tier > 0) {
      name = TIER_PREFIXES[Math.min(tier, TIER_PREFIXES.length - 1)] + enemyData.name;
    }
    return { ...enemyData, name, hp, atk, tier };
  }

  const api = {
    defaultState, clamp, applyEffect, useItem, pickWeighted, pickEvent, RESOURCE_DROP_KEYS,
    applyPhaseDecay, applyActionRegen, advancePhase, battleDamage, raidChance, reinforceCost, consumeReinforceDiscount, REINFORCE_COST, gatherYield, convertScrap, CONVERT_SCRAP_COST,
    ACTION_POINTS_PER_PHASE,
    staminaMaxForLevel, staminaMax, staminaBonusFromSources, STAMINA_BONUS_CAP,
    actionStaminaCost, spendStamina, ACTION_STAMINA_COSTS, overdrawHpPenalty, restHealAmount,
    OVERDRAW_HP_PENALTY, OVERDRAW_RESOURCE_MULTIPLIER, OVERDRAW_ENCOUNTER_BONUS,
    resolveLocation, pickLocations, FAR_TRAVEL_COST,
    getDurability, decayEquippedDurability, repairCost, repairEquipment, DURABILITY_MAX, DURABILITY_LOSS_PER_BATTLE,
    reforgePrefixCost, reforgePrefix,
    rollGacha, gachaCost, GACHA_COST,
    getEffectiveStats, getCritChance, CRIT_MULTIPLIER, getCritMultiplier, consumeAmmoForAttack,
    addStatusEffect, tickStatusEffects, maybeGenerateShield, absorbShield, maybeStunEnemy,
    applyDefShred, getShreddedDef, getDefShredPerHit,
    getLifestealRatio, getDodgeChance, getIgnoreDefRatio, getFactionDamageMultiplier, getMechanicalDamageMultiplier, getBossFactionCounterMult,
    getBattleDamageReductionRatio, gaiaCheatDeath, factionTier,
    instantiateEquipment, getEquipRef, getInstance, isInstanceRef, pixelIconSvg,
    getAccessoryEffect, getEffectiveSanMax, getEffectiveHpMax, getResourceCap, PREFIX_POOL,
    gainExp, LEVEL_UP_HP_BONUS, LEVEL_UP_ATK_BONUS, applyPrologueEnding,
    COMPANION_TASKS, recruitCompanion, refreshCompanionUnlocks, dispatchCompanion, companionAssigned,
    FACILITY_KEYS, syncBaseDefense, reinforceFacility, restSanRegen,
    placeFurniture, getFurnitureDefBonus, getFurnitureRaidChanceDelta, loungeInteract, sumFurnitureEffect,
    getComfortLevel, getComfortLabel, radioInteract, eggNestInteract,
    longTermGoalMet, evaluateSandboxEnding, getMilestoneEvent, MILESTONE_EVENTS,
    triggerAwakening, spendSkillPoint, enemyTier, getScaledEnemy, TIER_PREFIXES, getLocationOverpower,
    checkUpcomingThreat, isThreatDue, clearUpcomingThreat, THREAT_LEAD_DAYS, BLOOD_MOON_CYCLE_MIN, BLOOD_MOON_CYCLE_MAX,
    resolveBloodMoonDefense, bloodMoonRewards, TIER_ZONES, getTierZoneForBloodMoonWin,
    ITEMS, ENEMIES, EVENTS, LOCATIONS, AWAKENING_TRAITS, SKILLS_TREE, FACTION_IDS,
    replacePlayerNameTag, dailyMoodCheckin, depositToFridge, withdrawFromFridge, generateSyncCode, applySyncCode,
    _applyEffect: applyEffect, _pickEvent: pickEvent, _pickWeighted: pickWeighted
  };

  if (isNode) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== "undefined" ? window : globalThis);
