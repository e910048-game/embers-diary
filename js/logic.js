// 純邏輯函式（無DOM依賴），供 game.js 與測試共用

(function (root) {
  const isNode = typeof module !== "undefined" && module.exports;
  const data = isNode ? require("./data.js") : root;
  const { LEVEL_UP_LINES, LORE_LOGS, RECAP_LINES, LOCATION_MEMORY_LINES, VISIT_MEMORY_LINES, COMPANION_THREAT_LINES, COMPANION_HOME_LINES, ITEMS, ENEMIES, EVENTS, LOCATIONS, AWAKENING_TRAITS, SKILLS_TREE, FACTION_IDS, PREFIX_POOL, QUESTS, ACHIEVEMENTS, CROPS, SPECIES, COMPANIONS_REGISTRY, BLOOD_MOON_MODIFIERS, LOCATION_MODIFIERS, PROJECTS, CAMP_LEVELS } = data;
  const story = isNode ? require("./story.js") : root;
  const { MILESTONE_EVENTS } = story;

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
      let cost = Math.max(1, ACTION_STAMINA_COSTS.explore_far - discount + getProjectEffect(state, "exploreFarCostDelta")); // 專案「改裝腳踏車」-1
      if (loc && getLocationOverpower(state, loc).highDanger) cost += 1;
      return cost;
    }
    if (actionType === "explore_near") return Math.max(1, ACTION_STAMINA_COSTS.explore_near + getProjectEffect(state, "exploreNearCostDelta")); // 專案「越野改裝車」-1
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

  // 25.3：取得玩家在某流派已解鎖的階數（0~4），未解鎖該流派則為0
  // 2026-07-05技能點系統重設：state.skills從單一{faction,tier}改成多流派{faction,tiers,unlockOrder}，
  // 呼叫端(getFactionDamageMultiplier/getMechanicalDamageMultiplier/getSkillBonusRatio等)完全不用改，
  // 直接吃到多流派的效果加總
  function factionTier(state, faction) {
    return (state.skills && state.skills.tiers && state.skills.tiers[faction]) || 0;
  }

  // 雙修流派共鳴（2026-07-05，見TODO「Gemini內容深化」）：兩流派T3同時解鎖時解鎖的隱藏複合被動，
  // C(5,2)=10組全數涵蓋，每組只給一個小額效果(疊加在既有比例效果上)，不追求精算平衡——
  // 長線玩家搭配不同的雙流派組合，才會在無限模式中後期持續有「新解鎖」而不只是數值灌滿的感覺
  const FACTION_RESONANCE = [
    { pair: ["gaia", "cyber"], name: "荊棘裝甲", desc: "攻擊額外+5%吸血", effect: { lifestealBonus: 0.05 } },
    { pair: ["gaia", "ocean"], name: "共生體液", desc: "休息回復額外+3", effect: { restHealBonus: 3 } },
    { pair: ["gaia", "aero"], name: "血肉風暴", desc: "暴擊率額外+5%", effect: { critBonus: 0.05 } },
    { pair: ["gaia", "mind"], name: "痛覺鈍化", desc: "戰鬥受到傷害額外-5%", effect: { battleDamageReductionBonus: 0.05 } },
    { pair: ["cyber", "ocean"], name: "液態金屬", desc: "物理閃避率額外+5%", effect: { dodgeBonus: 0.05 } },
    { pair: ["cyber", "aero"], name: "電磁裝甲", desc: "夜襲機率額外-0.05", effect: { raidChanceDelta: -0.05 } },
    { pair: ["cyber", "mind"], name: "意識裝甲", desc: "防禦額外+3", effect: { defBonus: 3 } },
    { pair: ["ocean", "aero"], name: "風暴亂流", desc: "暴擊率額外+5%", effect: { critBonus: 0.05 } },
    { pair: ["ocean", "mind"], name: "靜水映象", desc: "SAN上限額外+15", effect: { sanMaxBonus: 15 } },
    { pair: ["aero", "mind"], name: "風之思緒", desc: "流派比例加成額外放大+5%", effect: { skillBonusRatio: 0.05 } },
    // 30小時內容量審視(2026-07-06)：全部5流派點滿T4後，10組T3共鳴就沒有更高的目標了。
    // 挑3組最具代表性的組合加「兩流派都T4」的進階版，效果疊加在同名T3版本之上(同一個effectKey再加一次)，
    // 不是取代——給頂級玩家一個比T3更遠的靶，複用同一套minTier機制，沒有新增任何獨立的效果種類
    { pair: ["cyber", "ocean"], minTier: 4, name: "深淵鋼流", desc: "「液態金屬」進階：物理閃避率再額外+5%", effect: { dodgeBonus: 0.05 } },
    { pair: ["gaia", "mind"], minTier: 4, name: "血肉之壁", desc: "「痛覺鈍化」進階：戰鬥受到傷害再額外-5%", effect: { battleDamageReductionBonus: 0.05 } },
    { pair: ["aero", "mind"], minTier: 4, name: "群星共鳴", desc: "「風之思緒」進階：流派比例加成再額外放大+5%", effect: { skillBonusRatio: 0.05 } },
  ];

  function factionResonanceActive(state, pair, minTier = 3) {
    return factionTier(state, pair[0]) >= minTier && factionTier(state, pair[1]) >= minTier;
  }

  function getActiveFactionResonances(state) {
    return FACTION_RESONANCE.filter(r => factionResonanceActive(state, r.pair, r.minTier || 3));
  }

  function getFactionResonanceBonus(state, effectKey) {
    let total = 0;
    FACTION_RESONANCE.forEach(r => {
      if (factionResonanceActive(state, r.pair, r.minTier || 3) && typeof r.effect[effectKey] === "number") total += r.effect[effectKey];
    });
    return total;
  }

  // 含技能樹/覺醒加成的實際體力上限
  function staminaMax(state) {
    // 建造專案「發電機房」的體力上限+1獨立於STAMINA_BONUS_CAP之外(那個上限只管覺醒/道具來源)
    return staminaMaxForLevel(state.level) + staminaBonusFromSources(state) + getProjectEffect(state, "staminaMaxBonus");
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

  // 2026-07-04 V3多同伴後勤系統：COMPANIONS_REGISTRY(data.js)是唯一的同伴設定來源，
  // 以下函式全部改成遍歷登記表，不再硬編碼雷恩/艾莉/阿卡3個名字——之後新增同伴只需要在
  // COMPANIONS_REGISTRY加一筆設定，這裡完全不用再動
  const COMPANION_NAMES = Object.keys(COMPANIONS_REGISTRY);
  // 向下相容：COMPANION_TASKS沿用舊名稱匯出(部分UI程式碼可能還引用它)，但內容改成從登記表推導
  const COMPANION_TASKS = COMPANION_NAMES.reduce((acc, name) => {
    acc[name] = COMPANIONS_REGISTRY[name].tasks;
    return acc;
  }, {});

  function defaultCompanionsState() {
    return COMPANION_NAMES.reduce((acc, name) => { acc[name] = "locked"; return acc; }, {});
  }

  // 招募同伴：locked -> standby（不影響已在執行任務中的同伴）
  function recruitCompanion(state, name) {
    if (!state.companions) state.companions = defaultCompanionsState();
    if (state.companions[name] === "locked") state.companions[name] = "standby";
    return state;
  }

  // 依COMPANIONS_REGISTRY各自的unlockCondition，於每次階段推進時檢查是否該自動解鎖
  // （雷恩的unlockCondition固定為false，因為他走劇情事件直接recruitCompanion()解鎖，不受這裡影響）
  function refreshCompanionUnlocks(state) {
    if (!state.companions) state.companions = defaultCompanionsState();
    COMPANION_NAMES.forEach((name) => {
      const reg = COMPANIONS_REGISTRY[name];
      if (state.companions[name] === "locked" && reg.unlockCondition && reg.unlockCondition(state)) {
        state.companions[name] = "standby";
      }
    });
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

  // 是否有同伴被指派至某任務（合併舊版單一companion欄位以維持相容——舊存檔可能只有
  // state.companion/companionTask沒有走過統一登記表，保留雙路徑判斷避免舊存檔行為跑掉）
  function companionAssigned(state, task) {
    if (state.companion && state.companionTask === task) return true;
    return !!(state.companions && Object.values(state.companions).includes(task));
  }

  // 同伴劇情線完成後的小額永久加成，呼應該同伴的任務效果本身（不是憑空加數值），見規格文件「同伴劇情線_設計規格.md」
  const COMPANION_ARC_BONUS = {
    "雷恩": { raidChanceDelta: -0.05 },
    "艾莉": { restHealBonus: 2 },
    "阿卡": { bloodMoonDefenseBonus: 0.05 },
    "老周": { reforgeDiscountRatio: 0.05 },
    "小雨": { reinforceDiscountRatio: 0.05 },
    "阿海": { gatherYieldBonusRatio: 0.05 },
  };

  // 通用同伴任務效果加總器：掃描COMPANIONS_REGISTRY裡每個「非locked/非standby」的同伴，
  // 把該同伴目前執行任務對應的taskEffects[effectKey]數值加總回傳。取代原本散落在
  // restHealAmount/raidChance等函式裡的硬編碼「state.companions["艾莉"]==="care"」判斷式，
  // 之後新增同伴的被動效果只需要在COMPANIONS_REGISTRY設定taskEffects，不用再改這些函式本體
  function getCompanionTaskEffect(state, effectKey) {
    let total = 0;
    if (state.companions) {
      COMPANION_NAMES.forEach((name) => {
        const status = state.companions[name];
        if (!status || status === "locked" || status === "standby") return;
        const reg = COMPANIONS_REGISTRY[name];
        const eff = reg && reg.taskEffects && reg.taskEffects[status];
        if (eff && typeof eff[effectKey] === "number") total += eff[effectKey];
      });
    }
    // 舊存檔相容：state.companion/companionTask這條legacy路徑目前只可能對應雷恩，
    // 但雷恩已经统一透過state.companions["雷恩"]追蹤，這裡只在companions["雷恩"]還沒有實際指派狀態
    // (locked或不存在)時才補算legacy路徑，避免正常情況下(companions["雷恩"]已經是"guard")重複加總兩次
    const raenAlreadyTracked = !!(state.companions && state.companions["雷恩"] && state.companions["雷恩"] !== "locked");
    if (state.companion && state.companionTask && !raenAlreadyTracked) {
      const reg = COMPANIONS_REGISTRY["雷恩"];
      const eff = reg && reg.taskEffects && reg.taskEffects[state.companionTask];
      if (eff && typeof eff[effectKey] === "number") total += eff[effectKey];
    }
    // 2026-07-05 同伴劇情線：完成後的小額永久加成，不看目前是否被指派任務（呼應「永久」二字，
    // 也避免玩家把同伴切去standby時，辛苦解完的劇情獎勵無故消失）
    COMPANION_NAMES.forEach((name) => {
      if (state.flags && state.flags[name + "_arc_done"]) {
        const bonus = COMPANION_ARC_BONUS[name];
        if (bonus && typeof bonus[effectKey] === "number") total += bonus[effectKey];
      }
    });
    return total;
  }

  // 休息時的額外HP回復（生存樹5階：staminaMax×2；覺醒"痊癒體質"+5；同伴指派"照護"+5）
  function restHealAmount(state) {
    let heal = 0;
    if (factionTier(state, "ocean") >= 4) heal += Math.round(state.hpMax * 0.05); // 25.3 洋流寄生T4：完美水解
    if (state.awakening && state.awakening.id === "recovery") heal += 5;
    heal += getCompanionTaskEffect(state, "restHealBonus");
    if (getComfortLevel(state) >= 6) heal += 5; // v110：舒適度≥6「安樂窩」休息HP額外+5
    heal += getFactionResonanceBonus(state, "restHealBonus"); // 雙修共鳴：gaia+ocean「共生體液」
    heal += getProjectEffect(state, "restHealBonus"); // 建造專案「簡易診所」+8
    return heal;
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
      homeLightOff: false, // v164：玩家主動點燈開關，純氛圍互動，不影響日夜/體力等遊戲數值
      homePos: null, // #27：人物在安全屋畫布中的位置(可拖曳移動)，null=預設站位
      homeFacing: "front", // v179：角色4方向朝向，依移動方向更新("front"/"back"/"left"/"right")，無對應美術時自動退回原本單一張正面圖
      companionFacing: "front", // v179：同伴朝向，邏輯同上
      stamina: staminaMaxForLevel(1),
      staminaMax: staminaMaxForLevel(1),
      hp: 100, hpMax: 100,
      san: 100, sanMax: 100, // 25.2
      resources: { food: 12, water: 8, medicine: 2, ammo: 5, scrap: 10 }, // 32.8：開局初始資源
      resourceCaps: { food: 50, water: 50, medicine: 10, ammo: 30, scrap: 99 }, // 32.8
      inventory: [],
      weaponInstances: [], // 16.3b/27.1：rare以上裝備實體
      stats: { atk: 3, def: 0 },
      attributes: { strength: 3, agility: 3, perception: 3 }, // TRPG擲骰系統：撬鎖/潛行/搜刮等互動的d20檢定基礎值
      level: 1,
      exp: 0,
      expToNext: 100, // 32.8
      equipment: { weapon: "scrap_chainsaw", armor: "ceramic_vest", accessory: null }, // 32.8：開局即裝備初始武器/護甲
      baseDefense: 0,
      baseRaidChance: 0.12,
      noiseLevel: 0, // 噪音系統：0~100，製造/搜刮/戰鬥累加，每階段自然衰減，血月狂潮時每滿20點多一波敵人
      facilities: { command: 0, greenhouse: 0, workshop: 0, radar: 0 }, // 22.2
      farm: { plots: FARM_PLOT_LAYOUT.reduce((acc, p, idx) => { acc[p.id] = { unlocked: idx === 0, crop: null }; return acc; }, {}) }, // 農場區(2026-07-02)：僅第一塊地預設解鎖
      pendingLevelUp: null, // 升級回饋(2026-09-20)：{from,to}，回主畫面時顯示升級面板後清空
      loreFound: [], // 深淵日誌(2026-09-20)：已取得的LORE_LOGS id，依序掉落
      recap: {}, // 前情回顧(2026-09-20)：這個階段發生的事 {hpStart,wins,enemy,loc,gathers}，endPhase時消費並重置
      locationVisits: {}, // 回訪記憶(2026-09-20)：{locId: 造訪次數}，只影響文字
      projects: {}, // 營地成長(2026-09-20)：建造專案 {id: {status:"building"|"done", startedAtPhaseIndex}}，沒開工的專案不在這裡
      campLevelSeen: 1, // 營地等級「已慶祝過的最高級」，等級只升不降(見getCampLevel)，也用來偵測升級
      pens: { plots: PEN_LAYOUT.reduce((acc, p, idx) => { acc[p.id] = { unlocked: idx === 0, animal: null }; return acc; }, {}) }, // 養殖區(2026-07-02)：僅第一個欄位預設解鎖
      processing: { stations: WORKSHOP_STATION_LAYOUT.reduce((acc, s, idx) => { acc[s.id] = { unlocked: idx === 0, job: null }; return acc; }, {}) }, // 加工區(2026-07-04)：僅第一站預設解鎖
      yardDecorSlots: YARD_DECOR_SLOTS.reduce((acc, s) => { acc[s.id] = { itemId: null }; return acc; }, {}), // 庭院裝飾區(2026-07-05)：4個槽位皆不需解鎖，空槽時退回原本的野生擺設
      bonusDefense: 0, // 22.2：事件/道具給予的舊式baseDefense加成，疊加於facilities.command*2之上
      baseSlots: { wall: null, wall2: null }, // 27.2陳列格(僅牆面，固定2格——牆面是固定掛點，跟地板/桌面的free-form擺放邏輯不同，故保留)
      placedFurniture: [{ itemId: "furn_sleeping_bag", gx: 3, gy: 3 }], // v166：table/floor/rug改為free-form擺放，取代原本wall/table/floor/rug四類固定槓位制度；每項{itemId,gx,gy}，無容量上限(僅受9x6邏輯網格範圍限制)。#31：初始小屋僅一張睡袋+人物
      overdrawStreak: 0, // #26-4：連續過勞次數，HP懲罰隨次數遞增，恢復餘力後重置
      seenEvents: [], // #22-3：已記錄過的事件id清單，首次遭遇給予「日記新頁」小獎勵與收納感
      companion: false,
      companionTask: "gather",
      companions: defaultCompanionsState(), // 28.1，2026-07-04起改由COMPANIONS_REGISTRY統一驅動(目前6人)
      milestonesShown: [],
      lastCityReviewDay: null, // 草稿2：城市現況回顧上次觸發的day，day90後每20天觸發一次
      flags: {},
      log: [],
      awakening: null,
      skillPoints: 0,
      skills: { faction: null, tiers: {}, unlockOrder: [] }, // 25.3：五大流派。2026-07-05技能點系統重設：faction=第一個選的主流派(供UI參考)，tiers={流派id:已解鎖T1~T4階數}，unlockOrder=依序解鎖的流派清單，長期玩家最終可解鎖全部5個流派
      upcomingThreat: null,
      currency: { embers: 150 }, // 32.8
      itemUseCount: {},
      itemStaminaBonus: 0,
      reinforceDiscount: 0,
      durability: {}, // 27.3 C：裝備耐久度(0-100)，key為itemId，僅追蹤已裝備過的武器/護甲
      // 29節 Peeps雙人同居
      sharedFridge: { food: 0, water: 0, specialItem: null, note: null },
      whiteboardMessage: "便條：歡迎來到安全屋。探索時請注意體力分配。", // 32.8
      spouseState: { hasLinked: false, weddingRingActive: false, lastSyncTimestamp: null, spouseName: null, appliedCodes: [] }, // v180：appliedCodes防止同一張同步碼被重複套用
      dailyMood: null,
      dailyMoodDay: null,
      statusEffects: [], // 27.4：戰鬥/階段內暫時狀態效果
      // 任務與成就系統（規格文件/任務與成就系統_設計規格.md）
      questFlags: {}, // 任務系統專用計數器/中間狀態（如gatherTodayCount/careCompletedCount/totalKills），跟全局flags分開避免污染命名空間
      questProgress: { activeMain: "main_01_wake_up", completedMain: [], completedSide: [] },
      unlockedAchievements: []
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
    // v180新增：防止同一張同步碼被重複套用而重複領取冰箱物資(原本完全沒有防呆，貼上同一段文字可無限重複領取)
    if (!state.spouseState.appliedCodes) state.spouseState.appliedCodes = [];
    if (state.spouseState.appliedCodes.includes(code)) return { ok: false, reason: "duplicate_code" };
    state.spouseState.appliedCodes.push(code);
    if (state.spouseState.appliedCodes.length > 50) state.spouseState.appliedCodes.shift(); // 只保留最近50筆，避免存檔無限累積
    state.spouseState.hasLinked = true;
    state.spouseState.spouseName = payload.playerName || state.spouseState.spouseName;
    state.spouseState.lastSyncTimestamp = state.day;
    state.whiteboardMessage = replacePlayerNameTag(payload.whiteboardMessage || "", state);
    const acc = getEquipRef(state, state.equipment && state.equipment.accessory);
    const ownWeddingRingEquipped = !!(acc && acc.item && acc.item.id === "wedding_ring");
    state.spouseState.weddingRingActive = ownWeddingRingEquipped && !!payload.weddingRingEquipped;
    const extractedFood = payload.sharedFridge ? payload.sharedFridge.food || 0 : 0;
    const extractedWater = payload.sharedFridge ? payload.sharedFridge.water || 0 : 0;
    // v180修正：原本直接+=沒有上限，跟withdrawFromFridge(同樣是提取冰箱物資)的clamp邏輯不一致，
    // 不對稱天數同步時(對方存了很多)會讓資源衝破resourceCaps上限
    state.resources.food = clamp(state.resources.food + extractedFood, 0, getResourceCap(state, "food"));
    state.resources.water = clamp(state.resources.water + extractedWater, 0, getResourceCap(state, "water"));
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
    let cap = state.resourceCaps[key] ?? 99;
    if (state.spouseState && state.spouseState.hasLinked) cap += sumFurnitureEffect(state, "resourceCapBonus");
    return cap + getProjectEffect(state, "resourceCapBonus"); // 建造專案「儲物棚」
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
      let sanDelta = effect.san;
      if (sanDelta < 0) {
        // SAN損失減免比照armor.effects.xxx的既有加成登錄慣例(dodgeBonus/battleDamageReductionBonus等)，
        // 不限來源(事件/戰鬥皆算)，故直接掛在這個統一入口而非個別扣血點。目前只有mind_robe(晶格折射風衣)
        // 提供sanLossReductionBonus，改成讀effects欄位而非寫死比對item.id，往後其他裝備要疊加同效果不用再開特例(見code review)
        const armor = getEquipRef(state, state.equipment && state.equipment.armor);
        const reduction = (armor && armor.effects && armor.effects.sanLossReductionBonus) || 0;
        if (reduction > 0) sanDelta = Math.round(sanDelta * (1 - reduction));
      }
      state.san = clamp(state.san + sanDelta, 0, getEffectiveSanMax(state));
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

  // 血月模組化(2026-07-06)：第一次血月(bloodMoonWins尚為0)固定標準夜，讓玩家先熟悉基準流程，
  // 第二次起才開始抽變異，避免新手第一場血月就遇到不熟悉的敵人組成/文案
  function pickBloodMoonModifier(state, rng = Math.random) {
    if ((state.bloodMoonWins || 0) === 0) return BLOOD_MOON_MODIFIERS.find(m => m.id === "standard");
    return pickWeighted(BLOOD_MOON_MODIFIERS, rng);
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
  const NOISE_DECAY_PER_PHASE = 10;
  function applyPhaseDecay(state, rng = Math.random) {
    tickStatusEffects(state); // 27.4
    state.noiseLevel = clamp((state.noiseLevel || 0) - NOISE_DECAY_PER_PHASE, 0, 100); // 噪音系統：隨時間自然消散
    // 2026-07-04：只要有任一同伴已招募(非locked)就多消耗1份食物/飲水，不隨同伴人數疊加
    // (維持原本「有同伴在，開銷變大」的份量感，不因為多同伴後勤系統上線就變得更嚴苛)
    const hasAnyCompanion = !!state.companion || !!(state.companions && Object.values(state.companions).some((v) => v && v !== "locked"));
    const base = hasAnyCompanion ? 2 : 1;
    const extraWater = getAccessoryEffect(state, "extraWaterDecay"); // 27.1：洋流寄生蛭，每階段水消耗額外+1
    // v117：巨型地脈藤蔓標本(furn_vines)——已陳列時，每階段50%機率水消耗-1（最低0）
    let waterDecay = base + extraWater;
    if (hasFurniturePlaced(state, "furn_vines") && rng() < 0.5) {
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

  // 一個phase內每完成一次行動，若食物與飲水都還有餘裕，被動恢復少量HP（緩解戰鬥/趕路造成的HP耗損）
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
    state.staminaMax = staminaMax(state);
    state.stamina = state.staminaMax;
    refreshCompanionUnlocks(state);
    // v117：蓋亞靈能生態溫室(furn_greenhouse)——已陳列時，每次晝夜切換產出食物1~2
    if (hasFurniturePlaced(state, "furn_greenhouse")) {
      applyEffect(state, { resources: { food: rng() < 0.5 ? 1 : 2 } });
    }
    // 22.2：生態溫室被動產出（不消耗AP/體力）：Lv1每階段+1食物，Lv2再+1飲水
    const greenhouseLv = (state.facilities && state.facilities.greenhouse) || 0;
    if (greenhouseLv >= 1) applyEffect(state, { resources: { food: 1 } });
    if (greenhouseLv >= 2) applyEffect(state, { resources: { water: 1 } });
    // 營地成長：已完成的建造專案(雨水收集塔/煙燻架)每個晝夜的被動產出
    const projYield = getProjectPhaseYield(state);
    if (projYield.food || projYield.water) applyEffect(state, { resources: { food: projYield.food, water: projYield.water } });
    // 25.3 蓋亞血脈T1：每階段自動回復HP上限3%
    if (factionTier(state, "gaia") >= 1 && state.hp > 0) {
      applyEffect(state, { hp: Math.round(state.hpMax * 0.03) });
    }
    // 28.1：艾莉指派為「採集」時，每階段自動執行一次採集（不消耗玩家體力）
    if (companionAssigned(state, "gather")) {
      applyEffect(state, { resources: gatherYield(rng, state) });
    }
    // 27.2：返回據點(每階段結算)時，舊筆記本等家具回SAN（資料驅動 effects.returnSanBonus）
    const returnSanBonus = sumFurnitureEffect(state, "returnSanBonus") + (state.yardDecorSlots ? getYardDecorEffect(state, "returnSanBonus") : 0);
    if (returnSanBonus > 0) {
      state.san = clamp(state.san + returnSanBonus, 0, getEffectiveSanMax(state));
    }
    checkUpcomingThreat(state, rng);
    return state;
  }

  // ---------- 血月狂潮排程（V2.0：取代26.3軟性預告，改為剛性7~10天週期） ----------
  // 3天倒數準備期；血月夜當天觸發決戰(isThreatDue)，結算後clearUpcomingThreat，下個phase即重新排程下一輪
  const THREAT_LEAD_DAYS = 3;
  // 雷達站(2026-09-20)：每級血月預警提前1天、探索遭遇戰機率-3%(原本雷達完全沒效果，玩家實測回饋)
  function radarLevel(state) { return Math.max(0, Math.min(3, (state && state.facilities && state.facilities.radar) || 0)); }
  function threatLeadDays(state) { return THREAT_LEAD_DAYS + radarLevel(state); }
  function radarEncounterReduction(state) { return 0.03 * radarLevel(state); }
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
    // 2026-07-04：阿卡指派「blast」任務時，血月狂潮戰時額外提供防禦加成(見COMPANIONS_REGISTRY)，
    // 呼應V3設計「阿卡=戰時血月防禦強化」，跟他平時降低夜襲機率的效果並存、不互斥
    const defenseRatio = Math.min(0.7, baseDefense / 30 + getCompanionTaskEffect(state, "bloodMoonDefenseBonus"));
    const wavesBlocked = defenseRatio >= 0.5 ? 1 : 0;
    return { baseDefense, defenseRatio, wavesBlocked };
  }

  // 草稿5c(2026-07-04)：day50/day100依序提高血月獎勵倍率，呼應game.js的threatWarningText()
  // 同步升級的警示文案語氣——後期血月夜不只是文字上聽起來更嚴重，實際報酬也要跟著提高，
  // 不是打完四大設備之後就變得可有可無。倍率選擇跟文案的兩個門檻(day50/day100)對齊，
  // 「同步等比例提升」，day100+50%是原始草稿明訂的數字，day50+25%是合理的中間內插值
  function bloodMoonRewardMultiplier(state) {
    if (state.day >= 100) return 1.5;
    if (state.day >= 50) return 1.25;
    return 1;
  }

  // ---------- 血月狂潮：戰後狂歡結算（V2.0 §2.3） ----------
  // 首次擊退血月狂潮時，插旗flags.bloodmoon_breach_1，解鎖淹沒的靈能地鐵站(loc_sunken_subway)等提前遠征點
  // bonusEffect：血月模組化(2026-07-06)的模板`rewardBonus`(例如{resources:{scrap:8}}或{skillPoint:1})，
  // 跟基礎reward「相加」後一起套用/回傳(不是覆蓋)——embers/skillPoint兩者都可能跟基礎值重疊，
  // 若用簡單spread合併會讓bonus覆蓋掉基礎值而不是疊加，故逐欄位相加
  function bloodMoonRewards(state, bonusEffect) {
    const mult = bloodMoonRewardMultiplier(state);
    const reward = { embers: Math.round(40 * mult), skillPoint: Math.max(1, Math.round(1 * mult)) };
    if (bonusEffect) {
      if (typeof bonusEffect.embers === "number") reward.embers += bonusEffect.embers;
      if (typeof bonusEffect.skillPoint === "number") reward.skillPoint += bonusEffect.skillPoint;
      if (typeof bonusEffect.san === "number") reward.san = (reward.san || 0) + bonusEffect.san;
      if (bonusEffect.resources) reward.resources = { ...(reward.resources || {}), ...bonusEffect.resources };
    }
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
    // 30小時內容量審視(2026-07-06)：再加2個Tier區域，把「深淵擴散」無限迴圈的起點往後推——
    // bossEnemyId沿用tier1~3的既有做法(重用enemy_cyborg_nemesis、只調extraTier)，不新增敵人資料；
    // reward改用兩件現有但從未被任何reward pool用過的legendary/epic裝備(cyber_drone_arm/aero_dagger)，
    // 不新增裝備資料。敘事上定位成「母體核心之下還有更深的結構」，銜接後續深淵擴散的世界觀
    { tier: 4, name: "深層意識核心", flag: "tier4_liberated", bossEnemyId: "enemy_cyborg_nemesis", extraTier: 4, reward: { equipment_pool: ["cyber_drone_arm"] }, psychicNote: "你以為母體核心就是終點，但地脈深處還有更古老的震動——彷彿有什麼東西，一直藏在更深的地方" },
    { tier: 5, name: "起源裂隙", flag: "tier5_liberated", bossEnemyId: "enemy_cyborg_nemesis", extraTier: 5, reward: { equipment_pool: ["aero_dagger"] }, psychicNote: "空間本身開始扭曲，理智在這裡幾乎失去意義——這裡，才是一切靈能暴動真正的起源" },
  ];

  // 回傳TIER_ZONES裡「第一個還沒插旗」的區（全部插旗過則回傳null）。
  // 2026-07-06修正：原本用bloodMoonWins-1當位置索引直接查表，TIER_ZONES從4個延伸到6個後，
  // 任何bloodMoonWins已經超過舊長度(4)的存檔會直接跳過tier4、或整個超出範圍變成null，永久卡死
  // (詳見code review)。改成「掃過TIER_ZONES找第一個未插旗的」，不管實際血月贏過幾次、不管
  // TIER_ZONES之後又延伸幾次，都會自動接上正確的下一區，不需要另外寫存檔搬遷程式碼。
  // 附帶修正一個沒人發現過的舊bug：如果玩家在Tier區戰鬥裡選擇逃跑而沒有插旗成功，舊寫法會在
  // 下次血月勝利時直接跳到下一區(永久錯過這區)，新寫法則會重新提供這個還沒完成的區。
  function getTierZoneForBloodMoonWin(state) {
    if ((state.bloodMoonWins || 0) < 1) return null;
    return TIER_ZONES.find(z => !state.flags[z.flag]) || null;
  }

  // 無限模式後期內容(2026-07-05，見規格文件/無限模式後期內容_設計規格.md)：TIER_ZONES全數插旗後，
  // 血月狂潮的Tier戰內容原本就此打住(getTierZoneForBloodMoonWin永遠回傳null)——「深淵擴散」讓最後一區
  // 插旗後的每次血月勝利改觸發可重複的加碼戰，避免無限模式後期只剩數值放大的血月夜。
  // 2026-07-06：改用TIER_ZONES最後一筆(而非寫死tier3_liberated)判斷「是否已全數插旗」，
  // 這樣之後TIER_ZONES再延伸也不用回頭改這裡的判斷式
  const ABYSS_SURGE_EQUIPMENT_POOL = ["gaia_skin", "mind_mirror", "mind_greatsword", "cyber_suit", "cyber_drone_arm", "aero_dagger"];
  function getAbyssSurgeBattle(state) {
    const lastZone = TIER_ZONES[TIER_ZONES.length - 1];
    if (!(state.flags && state.flags[lastZone.flag])) return null;
    const surgeCount = (state.bloodMoonWins || 0) - TIER_ZONES.length;
    if (surgeCount < 1) return null;
    // 沿用最後一區的extraTier為基準往上疊，上限比最後一區extraTier多5，避免數值失控
    const extraTier = Math.min(lastZone.extraTier + 5, lastZone.extraTier + surgeCount);
    return { bossEnemyId: "enemy_abyss_herald", extraTier, surgeCount, reward: { equipment_pool: ABYSS_SURGE_EQUIPMENT_POOL } };
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
    def += getFactionResonanceBonus(state, "defBonus"); // 雙修共鳴：cyber+mind「意識裝甲」
    return { atk, def };
  }

  // 25.3：流派相關的暴擊機率/倍率
  function getCritChance(state) {
    let factionC = 0;
    if (factionTier(state, "aero") >= 1) factionC += 0.05; // 靜電外殼
    if (factionTier(state, "gaia") >= 3 && state.san < 40) factionC += 0.15; // 捕食者基因
    let c = factionC * (1 + getSkillBonusRatio(state)); // v182：【共鳴的】等前綴只放大流派加成部分
    // 29.3：失落的結婚戒指，雙方QR互掃確認後暴擊率永久+15%（非流派技能，不吃skillBonusRatio）
    const acc = getEquipRef(state, state.equipment && state.equipment.accessory);
    if (acc && acc.item && acc.item.id === "wedding_ring" && state.spouseState && state.spouseState.weddingRingActive) c += 0.15;
    c += getFactionResonanceBonus(state, "critBonus"); // 雙修共鳴：gaia+aero「血肉風暴」、ocean+aero「風暴亂流」
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

  // 削弱疊加共用機制：corrosive前綴/ocean_pistol(27.1)每擊使敵防-1，mind_fork(神經干擾音叉)每擊使敵攻-1，
  // 皆疊加上限-5、記錄在enemy物件的_XShred欄位上。兩者只有「觸發條件」跟「削的是def還是atk」不同，
  // 疊加/上限/讀取的計算邏輯完全一樣，故收斂成共用的_shredStat/_getShredded私有函式（見code review）
  function _shredStat(enemyObj, field, amount) {
    if (amount <= 0) return;
    enemyObj[field] = Math.min(5, (enemyObj[field] || 0) + amount);
  }
  function _getShredded(enemyObj, field, baseStat) {
    return Math.max(0, (baseStat || 0) - (enemyObj[field] || 0));
  }

  function getDefShredPerHit(state) {
    const weapon = getEquipRef(state, state.equipment && state.equipment.weapon);
    if (!weapon) return 0;
    if (weapon.item && weapon.item.id === "ocean_pistol") return 1;
    if (weapon.prefix && weapon.prefix.id === "corrosive") return 1;
    return 0;
  }

  function applyDefShred(enemyObj, state) {
    _shredStat(enemyObj, "_defShred", getDefShredPerHit(state));
  }

  function getShreddedDef(enemyObj) {
    return _getShredded(enemyObj, "_defShred", enemyObj.def);
  }

  // 把原設計「扣目標1AP」重新詮釋成「削弱敵方攻擊力」，不需要另建敵方AP機制
  function getAtkShredPerHit(state) {
    const weapon = getEquipRef(state, state.equipment && state.equipment.weapon);
    if (weapon && weapon.item && weapon.item.id === "mind_fork") return 1;
    return 0;
  }

  function applyAtkShred(enemyObj, state) {
    _shredStat(enemyObj, "_atkShred", getAtkShredPerHit(state));
  }

  function getShreddedAtk(enemyObj) {
    return _getShredded(enemyObj, "_atkShred", enemyObj.atk);
  }

  const CRIT_MULTIPLIER = 1.5;
  function getCritMultiplier(state) {
    const weapon = getEquipRef(state, state.equipment && state.equipment.weapon);
    if (weapon && weapon.effects && weapon.effects.critMultiplierOverride) return weapon.effects.critMultiplierOverride; // 重力晶格巨劍：暴擊200%
    return factionTier(state, "aero") >= 4 ? 2.0 : CRIT_MULTIPLIER; // 雷磁風暴翼
  }

  // v182：【共鳴的】/晶格共鳴前綴的skillBonusRatio——原本「未接入，文案保留」，現在接上：
  // 套用在「流派(25.3)帶來的比例型技能效果」上(暴擊率/吸血/閃避的流派加成部分)，不影響武器/防具本身的固定加成
  function getSkillBonusRatio(state) {
    let ratio = 0;
    const acc = getEquipRef(state, state.equipment && state.equipment.accessory);
    if (acc && acc.prefix && acc.prefix.effect && typeof acc.prefix.effect.skillBonusRatio === "number") ratio += acc.prefix.effect.skillBonusRatio;
    ratio += getFactionResonanceBonus(state, "skillBonusRatio"); // 雙修共鳴：aero+mind「風之思緒」
    return ratio;
  }

  // 25.3 蓋亞血脈T2：攻擊附帶15%吸血；27.1：活化荊棘刺鞭(+15%)與【飢渴的】前綴(+5%)疊加
  function getLifestealRatio(state) {
    let factionRatio = factionTier(state, "gaia") >= 2 ? 0.15 : 0;
    let ratio = factionRatio * (1 + getSkillBonusRatio(state));
    const weapon = getEquipRef(state, state.equipment && state.equipment.weapon);
    if (weapon) {
      if (weapon.effects && weapon.effects.lifestealBonus) ratio += weapon.effects.lifestealBonus;
      if (weapon.prefix && weapon.prefix.effect && weapon.prefix.effect.lifestealBonus) ratio += weapon.prefix.effect.lifestealBonus;
    }
    ratio += getFactionResonanceBonus(state, "lifestealBonus"); // 雙修共鳴：gaia+cyber「荊棘裝甲」
    return ratio;
  }

  // 25.3 洋流寄生T1：物理閃避率+5%；27.1：重水防護夾克(+5%)
  function getDodgeChance(state) {
    let factionChance = factionTier(state, "ocean") >= 1 ? 0.05 : 0;
    if (factionTier(state, "aero") >= 1) factionChance += 0.03; // 25.3 大氣幽魂T1：靜電外殼，簡化追加閃避+3%
    let chance = factionChance * (1 + getSkillBonusRatio(state));
    const armor = getEquipRef(state, state.equipment && state.equipment.armor);
    if (armor && armor.effects && armor.effects.dodgeBonus) chance += armor.effects.dodgeBonus;
    chance += getFactionResonanceBonus(state, "dodgeBonus"); // 雙修共鳴：cyber+ocean「液態金屬」
    return chance;
  }

  // 27.1：取得已裝備飾品的effects欄位指定數值（如sanMaxBonus/hpMaxBonus/merchantDiscount）
  function getAccessoryEffect(state, key) {
    const acc = getEquipRef(state, state.equipment && state.equipment.accessory);
    if (acc && acc.effects && typeof acc.effects[key] === "number") return acc.effects[key];
    return 0;
  }

  // TRPG擲骰系統：三維屬性(1~10)，用於撬鎖/潛行/搜刮等高難度互動的d20檢定
  const ATTRIBUTE_KEYS = ["strength", "agility", "perception"];

  // 屬性基礎值(state.attributes) + 等級成長(每4級+1) + 飾品加成(effects.strengthBonus等)，上限10
  function getEffectiveAttribute(state, key) {
    const base = (state.attributes && state.attributes[key]) || 0;
    const levelBonus = Math.floor((state.level || 1) / 4);
    const accBonus = getAccessoryEffect(state, key + "Bonus");
    return Math.min(10, base + levelBonus + accBonus);
  }

  // d20+屬性修正 vs DC，回傳{roll,mod,total,dc,tier}，tier分critical_success/success/fail/critical_fail四級
  // 骰出1永遠是critical_fail、骰出20永遠是critical_success（經典TRPG規則），其餘依total vs dc判定
  function skillRoll(state, key, dc, rng) {
    rng = rng || Math.random;
    const roll = Math.floor(rng() * 20) + 1;
    const mod = getEffectiveAttribute(state, key);
    const total = roll + mod;
    let tier;
    if (roll === 20) tier = "critical_success";
    else if (roll === 1) tier = "critical_fail";
    else tier = total >= dc ? "success" : "fail";
    return { roll, mod, total, dc, tier };
  }

  // 27.1：取得當前裝備加成後的sanMax上限（基礎sanMax + 飾品sanMaxBonus + 防具前綴"止水之"sanMaxBonus）
  function getEffectiveSanMax(state) {
    let bonus = getAccessoryEffect(state, "sanMaxBonus");
    const armor = getEquipRef(state, state.equipment && state.equipment.armor);
    if (armor && armor.prefix && armor.prefix.effect && armor.prefix.effect.sanMaxBonus) bonus += armor.prefix.effect.sanMaxBonus;
    bonus += getFactionResonanceBonus(state, "sanMaxBonus"); // 雙修共鳴：ocean+mind「靜水映象」
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

  // 25.3 鋼鐵活化T3：對機械系敵人(enemy.mechanical)傷害+50%（原讀不存在的factionTag，從未生效）
  function getFactionDamageMultiplier(state, enemy) {
    return (factionTier(state, "cyber") >= 3 && enemy && enemy.mechanical) ? 1.5 : 1;
  }

  // 27.5：cyber_hammer對機械系敵人(enemy.mechanical)傷害+100%（與其他傷害乘數採乘法疊加，35.4）
  function getMechanicalDamageMultiplier(state, enemy) {
    const weapon = getEquipRef(state, state.equipment && state.equipment.weapon);
    return (weapon && weapon.item && weapon.item.id === "cyber_hammer" && enemy && enemy.mechanical) ? 2 : 1;
  }

  // #20-6：終局Boss流派對沖——enemy_cyborg_nemesis對玩家已鎖定的主流派(tier>=1)傷害抵抗20%（與其他傷害乘數採乘法疊加，35.4）
  // 2026-07-06修正：技能點系統重設(2026-07-05)把單一{faction,tier}改成{faction,tiers,unlockOrder}後，
  // 這裡忘記同步改，state.skills.tier(單數)舊欄位永遠是undefined，導致這個減傷效果自2026-07-05後
  // 實際上一直失效(見code review期間順手發現、已用spawn_task記錄)。改用factionTier()讀state.skills.tiers[faction]
  function getBossFactionCounterMult(state, enemy) {
    if (!enemy || enemy.id !== "enemy_cyborg_nemesis") return 1;
    return (state.skills && state.skills.faction && factionTier(state, state.skills.faction) >= 1) ? 0.8 : 1;
  }

  // 特攻倍率(鋼鐵T3對機械系x1.5、cyber_hammer對機械系x2)相乘後上限x2.0，再乘Boss反制減益——
  // 避免兩者疊到x3把血月Boss秒殺(2026-09-20審查建議)；單獨一項(最大x2)不受影響
  const SPECIAL_DAMAGE_MULT_CAP = 2.0;
  function combineSpecialDamageMultipliers(factionMult, mechanicalMult, bossCounterMult) {
    return Math.min(SPECIAL_DAMAGE_MULT_CAP, factionMult * mechanicalMult) * bossCounterMult;
  }

  // 25.3 心靈晶格T4：戰鬥受到傷害-25%；27.1：深淵黑血外皮+15%（兩者加總）
  function getBattleDamageReductionRatio(state) {
    let ratio = factionTier(state, "mind") >= 4 ? 0.25 : 0;
    const armor = getEquipRef(state, state.equipment && state.equipment.armor);
    if (armor && armor.effects && armor.effects.battleDamageReductionBonus) ratio += armor.effects.battleDamageReductionBonus;
    ratio += getFactionResonanceBonus(state, "battleDamageReductionBonus"); // 雙修共鳴：gaia+mind「痛覺鈍化」
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
    const fromLevel = state.level;
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
    if (levelUps > 0) state.pendingLevelUp = { from: (state.pendingLevelUp && state.pendingLevelUp.from) || fromLevel, to: state.level };
    return levelUps;
  }

  // 採集獲得量：食物/飲水 1~2（避免0造成連續虧損），廢料 0~2
  // state可選：探索樹1/5階提升採集量、5階10%機率「意外發現」+1廢料
  function gatherYield(rng = Math.random, state = null) {
    const base = {
      food: 1 + Math.floor(rng() * 2),
      water: 1 + Math.floor(rng() * 2),
      scrap: Math.floor(rng() * 3)
    };
    // 2026-07-04：阿海指派「expedition」任務時，採集/遠征收穫額外加成(見COMPANIONS_REGISTRY)
    // 2026-07-05：序章「獨自生還(alone)」結局的生態變數——沒有同伴分擔，逼出更強的自力更生能力，永久+15%採集收穫
    let bonusRatio = state ? getCompanionTaskEffect(state, "gatherYieldBonusRatio") : 0;
    if (state && state.flags && state.flags.alone) bonusRatio += 0.15;
    if (state) bonusRatio += getProjectEffect(state, "gatherYieldBonusRatio"); // 建造專案「研究角」+15%
    if (bonusRatio) {
      // 2026-09-20修正：基礎採集量只有0~2的小整數，原本Math.round會把+15%整個吃掉(2*1.15=2.3→2、1*1.15→1)，
      // 導致序章「獨自生還」宣稱的「永久+15%採集收穫」、同伴阿海的採集加成從來沒有實際效果(平均產出跟沒加成一樣)。
      // 改成隨機進位：整數部分保底，小數部分當機率進1，期望值精確等於基礎值*(1+bonusRatio)
      Object.keys(base).forEach((k) => {
        const v = base[k] * (1 + bonusRatio);
        const whole = Math.floor(v);
        base[k] = whole + (rng() < v - whole ? 1 : 0);
      });
    }
    if (state) addNoise(state, NOISE_AMOUNTS.gather);
    return base;
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

  // 地點探索模組化(2026-07-06)：從LOCATION_MODIFIERS抽一種「今日探索條件」，比照pickBloodMoonModifier
  // 同一套手法，只是這裡不需要「第一次保留standard」的新手保護(探索從day1就是核心玩法，沒有需要
  // 先熟悉基準流程的問題)
  function pickLocationModifier(rng = Math.random) {
    return pickWeighted(LOCATION_MODIFIERS, rng);
  }

  // 解析地點探索結果：可能遭遇敵人，也可能拾獲戰利品
  // state可選：第15天起，威脅升級，較高機率遇到清單中較強的敵人（陣列尾端）
  // modifier可選：地點探索模組化(2026-07-06)的模板，只調整encounterChanceDelta/qtyBonus兩個既有數值
  function resolveLocation(location, rng = Math.random, state = null, modifier = null) {
    // 2026-07-05：序章「帶傷生還(weak)」結局的生態變數——傷勢未癒導致行動不夠俐落，探索時驚動怪物的機率永久+5%
    const encounterBonus = (state && state.flags && state.flags.weak) ? 0.05 : 0;
    const modifierEncounterDelta = (modifier && modifier.encounterChanceDelta) || 0;
    const radarDelta = state ? radarEncounterReduction(state) : 0;
    if (rng() < Math.max(0, location.encounterChance + encounterBonus + modifierEncounterDelta - radarDelta)) {
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
    if (state) addNoise(state, NOISE_AMOUNTS.explore); // 戰鬥的噪音由game.js的startBattle統一計算，這裡只算搜刮本身
    const qty = Math.max(1, drop.qty + ((modifier && modifier.qtyBonus) || 0));
    return { type: "loot", itemId: drop.itemId, qty };
  }

  // 套用短篇序章結局效果到state（MVP4，沙盒模式開局加成/懲罰；4篇序章共用同一套companion/alone/weak/dead結局代碼，
  // 故這裡的效果不分章節、只認結局代碼——2026-07-05起，這組flags也是「結局→無限模式生態變數」的機制入口，
  // state.flags.alone/weak在這裡設定後，會持續影響本局後續的採集/探索表現，不只是開局當下的一次性加成，
  // 見gatherYield()的自力更生加成、resolveLocation()的驚動機率debuff）
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
    return state;
  }

  // 里程碑事件：特定天數第一次到達時觸發的一次性特殊事件，優先於一般隨機事件
  function getMilestoneEvent(state) {
    return MILESTONE_EVENTS.find(e =>
      e.day === state.day && !state.milestonesShown.includes(e.id)
    ) || null;
  }

  // 2026-07-02移除：longTermGoalMet/evaluateSandboxEnding（原22.1「四大設備全Lv3＋擊敗終域Boss→沙盒結局」設計）。
  // 已被V2.0血月狂潮藍圖(規格文件/V2_血月狂潮_設計藍圖.md「核心轉變一覽」表)與任務系統規格(規格文件/任務與成就系統_設計規格.md
  // 「主線不收斂到結局，而是收斂到畢業」)明確取代，但程式碼一直沒清掉，導致沙盒/無限模式仍會被這組寫死的舊條件強制彈出結局畫面、
  // 提供「重新挑戰一次」清空存檔——跟兩份規格文件的決定矛盾。且`flags.finalBossDefeated`從未在任何實際遊戲流程中被設置過
  // (全域搜尋只有測試檔手動塞值)，代表這條件在正常遊玩中根本無法達成，是純粹的死程式碼。移除後「主線完成」的提示改由
  // 既有的畢業機制(runQuestCheck().graduated → showGraduationTransition())獨力負責，不需要新增任何東西。

  const REINFORCE_COST = 5; // 強化據點消耗廢料（基礎值，實際請用reinforceCost）

  // 據點樹2階：強化據點成本-1（最低3）
  function reinforceCost(state) {
    let cost = REINFORCE_COST;
    if (state && state.reinforceDiscount) cost -= state.reinforceDiscount;
    // 2026-07-04：小雨指派「base」任務時，強化據點額外打折(見COMPANIONS_REGISTRY)
    const companionDiscount = state ? getCompanionTaskEffect(state, "reinforceDiscountRatio") : 0;
    if (companionDiscount) cost = Math.round(cost * (1 - companionDiscount));
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
    chance += getCompanionTaskEffect(state, "raidChanceDelta"); // 雷恩(guard)-0.3、阿卡(blast)-0.1，見COMPANIONS_REGISTRY
    chance += getFurnitureRaidChanceDelta(state); // 27.2：重力晶簇掛鏡(家具)-5%
    chance += getAccessoryEffect(state, "raidChanceDelta"); // 27.1：重力晶簇掛鏡(飾品)-5%
    chance += getFactionResonanceBonus(state, "raidChanceDelta"); // 雙修共鳴：cyber+aero「電磁裝甲」
    chance += getProjectEffect(state, "raidChanceDelta"); // 建造專案「瞭望台」-8%
    return Math.max(0.02, chance);
  }

  // 22.2：baseDefense = facilities.command*2（相容別名）+ bonusDefense（事件/道具的舊式加成）+ 27.2家具防禦加成
  function syncBaseDefense(state) {
    const commandLv = (state.facilities && state.facilities.command) || 0;
    state.baseDefense = commandLv * 2 + (state.bonusDefense || 0) + getFurnitureDefBonus(state) + getProjectEffect(state, "baseDefenseBonus"); // 含建造專案「加固圍牆」+2
    return state.baseDefense;
  }

  // ---------- 27.2 家具池：陳列格放置與效果 ----------
  // v166：free-form佈置改版——wall維持固定2格(牆面是固定掛點)，table/floor/rug三類原本各自的固定槓位制度
  // 取消，改成state.placedFurniture陣列任意擺放於9x6邏輯網格上，無容量上限(僅受網格範圍限制，實務上不會撞到)
  const WALL_SLOT_NAMES = ["wall", "wall2"];
  // 與game.js的GRID_COL_MAX(8)/GRID_FLOOR_ROW_MAX(5)同步——純數字邏輯網格範圍，跟等距投影公式無關，
  // 刻意不跨檔案共用常數以維持logic.js對DOM/game.js零依賴
  const FURNITURE_GRID_COLS = 9, FURNITURE_GRID_ROWS = 6;
  function isGridCellOccupied(state, gx, gy) {
    return (state.placedFurniture || []).some(f => f.gx === gx && f.gy === gy);
  }
  function findEmptyGridCell(state) {
    for (let gy = 0; gy < FURNITURE_GRID_ROWS; gy++) {
      for (let gx = 0; gx < FURNITURE_GRID_COLS; gx++) {
        if (!isGridCellOccupied(state, gx, gy)) return { gx, gy };
      }
    }
    return { gx: 4, gy: 3 }; // 極端邊緣情況(54格全滿)，疊放在房間中心，不阻擋佈置流程
  }
  // 通用：取得目前已陳列的所有家具itemId(牆面2格+free-form陣列)，供存在性判定/效果加總共用
  function allPlacedFurnitureIds(state) {
    const ids = [];
    if (state.baseSlots) WALL_SLOT_NAMES.forEach(s => { if (state.baseSlots[s]) ids.push(state.baseSlots[s]); });
    (state.placedFurniture || []).forEach(f => ids.push(f.itemId));
    return ids;
  }
  function hasFurniturePlaced(state, itemId) {
    return allPlacedFurnitureIds(state).includes(itemId);
  }
  function placeFurniture(state, itemId) {
    const item = ITEMS[itemId];
    if (!item || item.type !== "furniture") return { ok: false, reason: "invalid_item" };
    const entry = state.inventory.find(i => i.itemId === itemId);
    if (!entry || entry.qty <= 0) return { ok: false, reason: "not_in_inventory" };
    if (!state.baseSlots) state.baseSlots = { wall: null, wall2: null };
    entry.qty -= 1;
    if (entry.qty <= 0) state.inventory.splice(state.inventory.indexOf(entry), 1);
    if (item.slot === "wall") {
      // 牆面維持固定2格制度：依序找空格放，兩格皆滿則覆蓋第一格(沿用原規則)
      let slot = WALL_SLOT_NAMES.find(s => !state.baseSlots[s]) || WALL_SLOT_NAMES[0];
      const prev = state.baseSlots[slot];
      if (prev) {
        const prevEntry = state.inventory.find(i => i.itemId === prev);
        if (prevEntry) prevEntry.qty += 1;
        else state.inventory.push({ itemId: prev, qty: 1 });
      }
      state.baseSlots[slot] = itemId;
      syncBaseDefense(state);
      return { ok: true, slot, replaced: prev };
    }
    // table/floor/rug：free-form找空格放進placedFurniture，無容量上限
    if (!state.placedFurniture) state.placedFurniture = [];
    const cell = findEmptyGridCell(state);
    state.placedFurniture.push({ itemId, gx: cell.gx, gy: cell.gy });
    syncBaseDefense(state);
    return { ok: true, replaced: null };
  }

  // 通用：加總所有已陳列家具(牆面+free-form)中某個effects欄位的數值
  function sumFurnitureEffect(state, key) {
    let total = 0;
    allPlacedFurnitureIds(state).forEach(itemId => {
      const item = ITEMS[itemId];
      if (item && item.effects && typeof item.effects[key] === "number") {
        total += item.effects[key];
      }
    });
    return total;
  }

  // 噪音系統：製造/搜刮/戰鬥各動作累加噪音，隔音家具(ITEMS[id].effects.noiseDampRatio，如地毯)按比例折抵
  // 累加量，血月狂潮時noiseLevel每滿20點多一波敵人(見game.js startBloodMoonNight)
  const NOISE_AMOUNTS = { gather: 4, explore: 6, craft: 5, battle: 8 };
  function addNoise(state, amount) {
    if (!state || !amount) return;
    const dampRatio = Math.min(0.6, sumFurnitureEffect(state, "noiseDampRatio") + getProjectEffect(state, "noiseDampRatio")); // 含建造專案「隔音牆」
    // 庭院裝飾區(2026-07-05)：風鈴等裝飾道具的noiseGenRatio是反向疊加(好看但更吵)，跟隔音的dampRatio相減
    const genRatio = state.yardDecorSlots ? getYardDecorEffect(state, "noiseGenRatio") : 0;
    state.noiseLevel = clamp((state.noiseLevel || 0) + amount * (1 - dampRatio + genRatio), 0, 100);
  }

  // v110：舒適度系統——已陳列家具依稀有度加總，回饋探索/採集/休息
  const RARITY_COMFORT = { common: 1, rare: 2, epic: 3, legendary: 3 };
  function getComfortLevel(state) {
    let total = 0;
    allPlacedFurnitureIds(state).forEach(itemId => {
      const item = ITEMS[itemId];
      if (item) total += RARITY_COMFORT[item.rarity] || 0;
    });
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
    addNoise(state, NOISE_AMOUNTS.craft);
    return { ok: true, key, newLevel: state.facilities[key] };
  }

  const FACILITY_KEYS = ["command", "greenhouse", "workshop", "radar"];

  // ---------- 農場區（2026-07-02，見規格文件/農場區_設計規格.md，2026-07-03改版V2星露谷式） ----------
  // 地塊固定佈局：gx/gy給game.js的等角走路系統(gridPos/animateWalk/findReachablePos)定位——
  // V1曾改用平面網格，但那套系統跟小屋室內的「點擊走過去互動」共用一套函式，繫死在等角投影上，
  // 無法直接套用平面座標。改回gx/gy，id列表也是defaultState()/驗證時的唯一依據，避免兩處各存一份地塊清單
  // 2026-07-04 V3修正（依Gemini規格 + 使用者確認「維持等角、緊貼但呈菱形交錯」）：
  // 之前(07-03)誤以為要解決重疊只能加大gx/gy間距，導致排列變成有空隙的鬆散散點。
  // 真正的根因是地塊的「視覺格子尺寸」跟gridPos()每1單位的實際像素跨距對不上——正確做法是
  // 讓地塊本身畫成邊長等於1單位跨距的菱形(見style.css的.roomCell.farmPlot尺寸)，這樣gx/gy緊鄰1格
  // (等角投影下自然呈菱形棋盤交錯，跟小屋室內地板菱形磁磚是同一種視覺)就會不多不少地圖磚式緊貼，
  // 不留空隙也不重疊。改回3欄x2排、相鄰緊貼的座標：
  // 2026-09-20玩家回饋「只有六格可以種地」：擴成6欄x3排=18格(gx 1..6 x gy 1..3)，row-major編號。
  // plot_1~plot_6沿用舊id(舊存檔已解鎖/已種下的作物不受影響，只是座標換到第一排)；等角座標
  // x+y落在2..9，畫布360px放得下，不需要動GRID_*邊界常數。舊存檔的補齊靠loadGame既有的plots合併。
  const FARM_PLOT_LAYOUT = Array.from({ length: 18 }, (_, i) => ({
    id: "plot_" + (i + 1),
    gx: 1 + (i % 6),
    gy: 1 + Math.floor(i / 6),
  }));

  // 沒有真實時鐘離線結算機制，用「第幾個天/夜階段」當生長時間軸，回合制推進即天然達成離線也會生長
  function currentPhaseIndex(state) {
    return state.day * 2 + (state.phase === "night" ? 1 : 0);
  }

  // 每塊地各自獨立解鎖，花費隨已解鎖地塊數遞增。plot_1從一開始就解鎖，故用(n-1)讓「第1次要花錢解鎖的地塊」
  // 成本從基礎值6起算(6,9,12,...,最後一塊54，全部解鎖共510廢料，遠低於resourceCaps.scrap=99的單次上限)。
  // 2026-09-20擴成18格時把遞增幅度從4降到3，避免最後幾格貴到離譜；順便成為廢料溢出的消耗出口
  function farmPlotUnlockCost(state) {
    const n = Object.values(state.farm.plots).filter(p => p.unlocked).length;
    return 6 + (n - 1) * 3;
  }

  function unlockFarmPlot(state, plotId) {
    const plot = state.farm.plots[plotId];
    if (!plot) return { ok: false, reason: "invalid_plot" };
    if (plot.unlocked) return { ok: false, reason: "already_unlocked" };
    const cost = farmPlotUnlockCost(state);
    if ((state.resources.scrap || 0) < cost) return { ok: false, reason: "insufficient_scrap" };
    state.resources.scrap -= cost;
    plot.unlocked = true;
    return { ok: true, cost };
  }

  function plantSeed(state, plotId, seedId) {
    const plot = state.farm.plots[plotId];
    if (!plot) return { ok: false, reason: "invalid_plot" };
    if (!plot.unlocked) return { ok: false, reason: "locked" };
    if (plot.crop) return { ok: false, reason: "occupied" };
    const seedItem = ITEMS[seedId];
    if (!seedItem || seedItem.type !== "seed") return { ok: false, reason: "invalid_seed" };
    const slot = state.inventory.find(i => i.itemId === seedId && i.qty > 0);
    if (!slot) return { ok: false, reason: "no_seed" };
    slot.qty -= 1;
    if (slot.qty <= 0) state.inventory = state.inventory.filter(i => i !== slot);
    plot.crop = { seedId, plantedAtPhaseIndex: currentPhaseIndex(state), waterBonusPhases: 0, lastWateredDay: null };
    return { ok: true };
  }

  // V2星露谷式(2026-07-03)：澆水是「加速」不是「門檻」——原始企劃明確要求「離線也會生長」，
  // 不澆水一樣會長(只是比較慢)，跟Gemini提案「不澆水就停滯」的每日照顧制是互斥的兩種哲學，
  // 使用者選了保留離線成長，所以澆水只疊加waterBonusPhases，不影響elapsed的基礎計算方式
  function waterPlot(state, plotId) {
    const plot = state.farm.plots[plotId];
    if (!plot) return { ok: false, reason: "invalid_plot" };
    if (!plot.crop) return { ok: false, reason: "empty" };
    if (plot.crop.lastWateredDay === state.day) return { ok: false, reason: "already_today" };
    plot.crop.waterBonusPhases = (plot.crop.waterBonusPhases || 0) + 1;
    plot.crop.lastWateredDay = state.day;
    return { ok: true };
  }

  // 惰性計算成長階段，不掛勾天/夜切換的tick——只要重新算一次跟種下時的phase差值即可，
  // 不用擔心離線期間漏算，也不用每塊地各自存「剩餘回合數」欄位。waterBonusPhases是澆水疊加的
  // 額外進度，即使完全不澆水，elapsed基礎值一樣會隨phase推進累積到成熟，只是比較慢
  function getCropStage(state, plot) {
    if (!plot.crop) return null;
    const seedItem = ITEMS[plot.crop.seedId];
    const crop = seedItem && CROPS[seedItem.cropId];
    if (!crop) return null;
    // 庭院裝飾區(2026-07-05)：蓋亞靈能圖騰等裝飾道具的cropGrowthBonusPhases是被動的一次性澆水加成，
    // 跟waterBonusPhases同一種疊加方式，差別是不用玩家每天手動澆水
    const decorBonus = state.yardDecorSlots ? getYardDecorEffect(state, "cropGrowthBonusPhases") : 0;
    const elapsed = currentPhaseIndex(state) - plot.crop.plantedAtPhaseIndex + (plot.crop.waterBonusPhases || 0) + decorBonus;
    const stageIdx = Math.min(crop.stages - 1, Math.floor(elapsed / (crop.phasesToMature / crop.stages)));
    return { stageIdx, mature: elapsed >= crop.phasesToMature, crop };
  }

  function harvestFarmPlot(state, plotId) {
    const plot = state.farm.plots[plotId];
    if (!plot || !plot.crop) return { ok: false, reason: "empty" };
    const stage = getCropStage(state, plot);
    if (!stage || !stage.mature) return { ok: false, reason: "not_mature" };
    const crop = stage.crop;
    if (crop.yield.resources) applyEffect(state, { resources: crop.yield.resources });
    if (crop.yield.bonusItemId) {
      const existing = state.inventory.find(i => i.itemId === crop.yield.bonusItemId);
      if (existing) existing.qty += 1;
      else state.inventory.push({ itemId: crop.yield.bonusItemId, qty: 1 });
    }
    plot.crop = null;
    state.questFlags.farmHarvestCount = (state.questFlags.farmHarvestCount || 0) + 1;
    return { ok: true, crop };
  }

  // ---------- 養殖區（2026-07-02，見規格文件/養殖區_設計規格.md，2026-07-04 V3改版） ----------
  // 2026-09-20玩家回饋「牧場太死板，應該是可以養動物、動物在區域裡亂逛」：改成放養牧場——
  // 「欄位」在概念上變成「牧場容量格」(一格養一隻)，不再是畫面上固定位置的格子，動物在整片場地自由走動
  // (見game.js的startRanchWander)，所以不再需要gx/gy座標。容量4→8，state.pens.plots資料結構完全不變
  // (餵食/撫摸/收成/好感度/血月撤退全部沿用)，舊存檔4格由loadGame既有的pens.plots合併補成8格
  const PEN_LAYOUT = Array.from({ length: 8 }, (_, i) => ({ id: "pen_" + (i + 1) }));

  const FEED_COST = 3; // 餵食消耗的food
  // 使用者明確表示「小屋活動要輕鬆寫意，不要有壓力」——澆水/餵食刻意不消耗體力，不跟探索/採集/強化據點
  // 那套會被體力預算卡住的生存經濟綁在一起，農場/獸欄是悠閒的附屬活動，不是要跟正事搶體力的行動

  // V2版重寫：取消會衰減的飽食度與「歸零時白跑一輪零產出」的懲罰，全面改成只漲不跌的好感度(happiness)，
  // 基本產出永遠保證拿到，好感度只決定「品質暴擊」機率——正向回饋取代生存壓力式懲罰
  // 跟作物的getCropStage同一種「用phase差值惰性推算」手法，差別是這裡算「距離上次收成」而非「距離種下」——
  // 動物是持久資產，收成後不會消失，可以無限循環產出下一輪
  function getPenProductionState(state, pen) {
    if (!pen.animal) return null;
    const species = SPECIES[pen.animal.speciesId];
    const elapsed = currentPhaseIndex(state) - pen.animal.lastCollectedAtPhaseIndex;
    return { ready: elapsed >= species.producePhases, species };
  }

  function penUnlockCost(state) {
    const n = Object.values(state.pens.plots).filter(p => p.unlocked).length;
    return 10 + (n - 1) * 6;
  }

  // 牧場容量摘要：total=總容量格數、unlocked=已擴建、animals=目前養了幾隻、free=還有幾個空位
  function penCapacityInfo(state) {
    const plots = Object.values(state.pens.plots);
    const unlocked = plots.filter(p => p.unlocked).length;
    const animals = plots.filter(p => p.unlocked && p.animal).length;
    return { total: plots.length, unlocked, animals, free: unlocked - animals };
  }
  // 放入動物時自動挑第一個空位(已擴建且沒有動物)；沒有空位回傳null
  function firstFreePenId(state) {
    const p = PEN_LAYOUT.find(d => { const pen = state.pens.plots[d.id]; return pen && pen.unlocked && !pen.animal; });
    return p ? p.id : null;
  }
  // 擴建牧場時下一個要解鎖的容量格；已全部擴建回傳null
  function nextLockedPenId(state) {
    const p = PEN_LAYOUT.find(d => { const pen = state.pens.plots[d.id]; return pen && !pen.unlocked; });
    return p ? p.id : null;
  }

  function unlockPen(state, penId) {
    const pen = state.pens.plots[penId];
    if (!pen) return { ok: false, reason: "invalid_pen" };
    if (pen.unlocked) return { ok: false, reason: "already_unlocked" };
    const cost = penUnlockCost(state);
    if ((state.resources.scrap || 0) < cost) return { ok: false, reason: "insufficient_scrap" };
    state.resources.scrap -= cost;
    pen.unlocked = true;
    return { ok: true, cost };
  }

  function placeAnimal(state, penId, animalItemId) {
    const pen = state.pens.plots[penId];
    if (!pen) return { ok: false, reason: "invalid_pen" };
    if (!pen.unlocked) return { ok: false, reason: "locked" };
    if (pen.animal) return { ok: false, reason: "occupied" };
    const animalItem = ITEMS[animalItemId];
    if (!animalItem || animalItem.type !== "animal") return { ok: false, reason: "invalid_animal" };
    const slot = state.inventory.find(i => i.itemId === animalItemId && i.qty > 0);
    if (!slot) return { ok: false, reason: "no_animal" };
    slot.qty -= 1;
    if (slot.qty <= 0) state.inventory = state.inventory.filter(i => i !== slot);
    pen.animal = { speciesId: animalItem.speciesId, happiness: 0, lastPetDay: null, lastFedDay: null, lastCollectedAtPhaseIndex: currentPhaseIndex(state) };
    return { ok: true };
  }

  // 餵食消耗food（農場收成的食物在這裡有明確去處），不消耗體力，每日限一次，+15好感度——比撫摸更花成本，也回饋更多
  function feedAnimal(state, penId) {
    const pen = state.pens.plots[penId];
    if (!pen || !pen.animal) return { ok: false, reason: "empty" };
    if (pen.animal.lastFedDay === state.day) return { ok: false, reason: "already_today" };
    if ((state.resources.food || 0) < FEED_COST) return { ok: false, reason: "insufficient_food" };
    state.resources.food -= FEED_COST;
    pen.animal.happiness = Math.min(100, pen.animal.happiness + 15);
    pen.animal.lastFedDay = state.day;
    return { ok: true };
  }

  // 血月「死守養殖區 vs 撤退」抉擇（2026-07-05氛圍細節）：是否至少一個獸欄有動物，決定要不要跳出這個抉擇
  function hasAnyPenAnimal(state) {
    return !!(state.pens && Object.values(state.pens.plots).some(p => p.animal));
  }

  // 撤退代價：好感度歸零+視同剛收成一次(下次產出要重新累計天數)，動物本身不會消失
  // （呼應V2既有定案「動物是持久資產不會消失」——這裡沿用同一條原則，撤退只是重挫進度，不是永久失去牲畜）
  function resetPensAfterRetreat(state) {
    if (!state.pens) return;
    const idx = currentPhaseIndex(state);
    Object.values(state.pens.plots).forEach(p => {
      if (!p.animal) return;
      p.animal.happiness = 0;
      p.animal.lastCollectedAtPhaseIndex = idx;
    });
  }

  // 撫摸免費、每日限一次+10好感度，比照companionBubbleLove的「每日一次小互動」手法
  function petAnimal(state, penId) {
    const pen = state.pens.plots[penId];
    if (!pen || !pen.animal) return { ok: false, reason: "empty" };
    if (pen.animal.lastPetDay === state.day) return { ok: false, reason: "already_today" };
    pen.animal.happiness = Math.min(100, pen.animal.happiness + 10);
    pen.animal.lastPetDay = state.day;
    return { ok: true };
  }

  function collectPen(state, penId, rng = Math.random) {
    const pen = state.pens.plots[penId];
    if (!pen || !pen.animal) return { ok: false, reason: "empty" };
    const prod = getPenProductionState(state, pen);
    if (!prod.ready) return { ok: false, reason: "not_ready" };
    const species = prod.species;
    const happiness = pen.animal.happiness;
    let qty = species.yield.qty; // 基本產出永遠保證拿到，不再有「白跑一輪」的懲罰
    let crit = false;
    if (happiness >= 60 && rng() < happiness / 100) { qty += species.yield.qty; crit = true; } // 品質暴擊：雙倍產出
    const existing = state.inventory.find(i => i.itemId === species.yield.itemId);
    if (existing) existing.qty += qty;
    else state.inventory.push({ itemId: species.yield.itemId, qty });
    if (species.bonusItemId) {
      const existingBonus = state.inventory.find(i => i.itemId === species.bonusItemId);
      if (existingBonus) existingBonus.qty += 1;
      else state.inventory.push({ itemId: species.bonusItemId, qty: 1 });
    }
    pen.animal.lastCollectedAtPhaseIndex = currentPhaseIndex(state); // 動物不清空，只重設收成計時，可無限循環
    state.questFlags.penCollectCount = (state.questFlags.penCollectCount || 0) + 1;
    return { ok: true, qty, crit, species };
  }

  // ---------- 加工區（2026-07-04，見規格文件/加工區_設計規格.md） ----------
  // 站位固定佈局：gx/gy給等角走路系統定位，理由跟FARM_PLOT_LAYOUT/PEN_LAYOUT一致
  const WORKSHOP_STATION_LAYOUT = [
    { id: "station_1", gx: 2, gy: 2 },
    { id: "station_2", gx: 3, gy: 2 },
    { id: "station_3", gx: 2, gy: 3 },
  ];

  // 兩大類配方：壓縮類(facilities.workshop等級解鎖，輸出embers——原草案輸出背包道具「賣給商人」，
  // 但這個專案的商店只有購買、沒有賣出機制，改成直接輸出embers，不用另建賣出子系統)；
  // 探索限定類(requiresBlueprint圖紙解鎖，圖紙持有即可用、不消耗，輸出探索限定家具)
  const RECIPES = {
    recipe_scrap_ingot: {
      id: "recipe_scrap_ingot", name: "廢料壓縮提煉",
      unlockTier: 1, // facilities.workshop >= 1
      inputs: { resources: { scrap: 20 } },
      output: { embers: 15 },
      phasesToComplete: 2,
    },
    recipe_ration_pack: {
      id: "recipe_ration_pack", name: "壓縮口糧回收",
      unlockTier: 2, // facilities.workshop >= 2
      inputs: { resources: { food: 10, water: 10 } },
      output: { embers: 12 },
      phasesToComplete: 2,
    },
    recipe_mutant_lamp: {
      id: "recipe_mutant_lamp", name: "變異孢子提燈",
      requiresBlueprint: "blueprint_mutant_lamp",
      inputs: { resources: { scrap: 15 }, items: { mutant_berry_extract: 1, mutant_egg_essence: 1 } },
      output: { itemId: "furn_mutant_lamp", qty: 1 },
      phasesToComplete: 4,
    },
  };

  // 配方可用性：unlockTier比照facilities等級，requiresBlueprint比照種子/動物token「持有即可用」，
  // 但blueprint是「知識」不是「材料」，不消耗，允許重複製作同一配方多次
  function recipeAvailable(state, recipeId) {
    const recipe = RECIPES[recipeId];
    if (!recipe) return false;
    if (recipe.unlockTier) return (state.facilities && state.facilities.workshop || 0) >= recipe.unlockTier;
    if (recipe.requiresBlueprint) return state.inventory.some(i => i.itemId === recipe.requiresBlueprint && i.qty > 0);
    return false;
  }

  // 站位是否有足夠材料開始這個配方(資源+背包道具皆須檢查)
  function canAffordRecipe(state, recipe) {
    if (recipe.inputs.resources) {
      for (const k in recipe.inputs.resources) {
        if ((state.resources[k] || 0) < recipe.inputs.resources[k]) return false;
      }
    }
    if (recipe.inputs.items) {
      for (const itemId in recipe.inputs.items) {
        const have = state.inventory.filter(i => i.itemId === itemId).reduce((sum, i) => sum + i.qty, 0);
        if (have < recipe.inputs.items[itemId]) return false;
      }
    }
    return true;
  }

  function processingStationUnlockCost(state) {
    const n = Object.values(state.processing.stations).filter(s => s.unlocked).length;
    return 15 + (n - 1) * 8;
  }

  function unlockProcessingStation(state, stationId) {
    const station = state.processing.stations[stationId];
    if (!station) return { ok: false, reason: "invalid_station" };
    if (station.unlocked) return { ok: false, reason: "already_unlocked" };
    const cost = processingStationUnlockCost(state);
    if ((state.resources.scrap || 0) < cost) return { ok: false, reason: "insufficient_scrap" };
    state.resources.scrap -= cost;
    station.unlocked = true;
    return { ok: true, cost };
  }

  function startProcessing(state, stationId, recipeId) {
    const station = state.processing.stations[stationId];
    if (!station) return { ok: false, reason: "invalid_station" };
    if (!station.unlocked) return { ok: false, reason: "locked" };
    if (station.job) return { ok: false, reason: "occupied" };
    const recipe = RECIPES[recipeId];
    if (!recipe) return { ok: false, reason: "invalid_recipe" };
    if (!recipeAvailable(state, recipeId)) return { ok: false, reason: "recipe_locked" };
    if (!canAffordRecipe(state, recipe)) return { ok: false, reason: "insufficient_materials" };
    if (recipe.inputs.resources) {
      for (const k in recipe.inputs.resources) state.resources[k] -= recipe.inputs.resources[k];
    }
    if (recipe.inputs.items) {
      for (const itemId in recipe.inputs.items) {
        let remaining = recipe.inputs.items[itemId];
        state.inventory.forEach(i => {
          if (i.itemId !== itemId || remaining <= 0) return;
          const take = Math.min(i.qty, remaining);
          i.qty -= take;
          remaining -= take;
        });
        state.inventory = state.inventory.filter(i => i.qty > 0);
      }
    }
    station.job = { recipeId, startedAtPhaseIndex: currentPhaseIndex(state) };
    return { ok: true };
  }

  // 跟getCropStage/getPenProductionState同一種phase差值惰性推算手法，離線/忘記回來都不會漏算
  function getProcessingState(state, station) {
    if (!station.job) return null;
    const recipe = RECIPES[station.job.recipeId];
    const elapsed = currentPhaseIndex(state) - station.job.startedAtPhaseIndex;
    return { ready: elapsed >= recipe.phasesToComplete, recipe, elapsed };
  }

  function collectProcessing(state, stationId) {
    const station = state.processing.stations[stationId];
    if (!station || !station.job) return { ok: false, reason: "empty" };
    const prod = getProcessingState(state, station);
    if (!prod.ready) return { ok: false, reason: "not_ready" };
    const recipe = prod.recipe;
    if (recipe.output.embers) applyEffect(state, { embers: recipe.output.embers });
    if (recipe.output.itemId) {
      const existing = state.inventory.find(i => i.itemId === recipe.output.itemId);
      if (existing) existing.qty += recipe.output.qty;
      else state.inventory.push({ itemId: recipe.output.itemId, qty: recipe.output.qty });
    }
    station.job = null;
    state.questFlags.workshopCraftCount = (state.questFlags.workshopCraftCount || 0) + 1;
    return { ok: true, recipe };
  }

  // ---------- 營地成長：建造專案 + 營地等級（2026-09-20，見規格文件/營地等級與建造專案_設計規格.md） ----------
  // 專案狀態存在state.projects[id]={status,startedAtPhaseIndex}；跟getCropStage/getProcessingState同一種「用phase差值惰性推算」，
  // 沒有per-tick更新：building的專案只要phase差值夠了就視為完成(效果立刻生效)，settleProjects負責把status定案並回傳新完成清單給UI通知
  function isProjectDone(state, id) {
    const proj = PROJECTS[id];
    const p = state.projects && state.projects[id];
    if (!proj || !p) return false;
    if (p.status === "done") return true;
    return currentPhaseIndex(state) - p.startedAtPhaseIndex >= proj.phases;
  }

  // 加總所有已完成專案的某個數值型效果(resourceCapBonus/baseDefenseBonus/raidChanceDelta/...)，掛進各既有計算函式
  function getProjectEffect(state, key) {
    if (!state || !state.projects) return 0;
    let total = 0;
    for (const id in PROJECTS) {
      if (!isProjectDone(state, id)) continue;
      const v = PROJECTS[id].effects[key];
      if (typeof v === "number") total += v;
    }
    return total;
  }

  // 每個晝夜的被動資源產出(雨水收集塔/煙燻架的phaseYield)，advancePhase呼叫
  function getProjectPhaseYield(state) {
    const total = { food: 0, water: 0 };
    if (!state || !state.projects) return total;
    for (const id in PROJECTS) {
      if (!isProjectDone(state, id)) continue;
      const y = PROJECTS[id].effects.phaseYield;
      if (y) for (const k in y) total[k] = (total[k] || 0) + y[k];
    }
    return total;
  }

  // 施工中(尚未完成)的專案數量，用來判斷同時施工名額
  function activeProjectCount(state) {
    if (!state.projects) return 0;
    return Object.keys(state.projects).filter(id => PROJECTS[id] && state.projects[id].status === "building" && !isProjectDone(state, id)).length;
  }
  function projectSlotLimit(state) {
    return 1 + (getCampLevel(state) >= 3 ? 1 : 0); // 營地Lv3起可同時動工兩項
  }

  function canAffordProject(state, proj) {
    const c = proj.cost || {};
    if (c.resources) for (const k in c.resources) if ((state.resources[k] || 0) < c.resources[k]) return false;
    if (c.embers && (state.currency.embers || 0) < c.embers) return false;
    return true;
  }

  // 專案的顯示狀態：done/building(含剩餘phase)/available/locked(營地等級不足)
  function getProjectState(state, id) {
    const proj = PROJECTS[id];
    if (isProjectDone(state, id)) return { status: "done", proj };
    const p = state.projects && state.projects[id];
    if (p && p.status === "building") {
      const elapsed = currentPhaseIndex(state) - p.startedAtPhaseIndex;
      return { status: "building", proj, elapsed, remaining: Math.max(0, proj.phases - elapsed) };
    }
    if (getCampLevel(state) < proj.requiresCampLv) return { status: "locked", proj };
    return { status: "available", proj };
  }

  function startProject(state, id) {
    const proj = PROJECTS[id];
    if (!proj) return { ok: false, reason: "invalid_project" };
    if (!state.projects) state.projects = {};
    if (state.projects[id]) return { ok: false, reason: "already_started" };
    if (getCampLevel(state) < proj.requiresCampLv) return { ok: false, reason: "camp_level" };
    if (activeProjectCount(state) >= projectSlotLimit(state)) return { ok: false, reason: "no_slot" };
    if (!canAffordProject(state, proj)) return { ok: false, reason: "insufficient" };
    const c = proj.cost || {};
    if (c.resources) for (const k in c.resources) state.resources[k] -= c.resources[k];
    if (c.embers) state.currency.embers -= c.embers;
    state.projects[id] = { status: "building", startedAtPhaseIndex: currentPhaseIndex(state) };
    addNoise(state, NOISE_AMOUNTS.craft); // 叮叮咚咚地施工，跟強化據點/重鍛同一級的噪音
    return { ok: true, proj };
  }

  // 把「phase差值已夠」的施工中專案定案成done，回傳新完成的id清單供UI顯示完成通知；
  // 完成時重算會被專案影響的儲存值(防禦、體力上限)
  function settleProjects(state) {
    const finished = [];
    if (!state.projects) return finished;
    for (const id in state.projects) {
      const p = state.projects[id];
      if (PROJECTS[id] && p.status === "building" && isProjectDone(state, id)) { p.status = "done"; finished.push(id); }
    }
    if (finished.length) {
      syncBaseDefense(state);
      state.staminaMax = staminaMax(state);
    }
    return finished;
  }

  // 營地等級需求：各type對應的目前數值
  function campRequirementValue(state, type) {
    switch (type) {
      case "facilityTotal": return FACILITY_KEYS.reduce((sum, k) => sum + ((state.facilities && state.facilities[k]) || 0), 0);
      case "comfort": return getComfortLevel(state);
      case "projectsDone": return Object.keys(PROJECTS).filter(id => isProjectDone(state, id)).length;
      case "farmPlots": return Object.values(state.farm.plots).filter(p => p.unlocked).length;
      case "companions": return Object.values(state.companions || {}).filter(v => v && v !== "locked").length;
      case "penAnimals": return penCapacityInfo(state).animals;
      case "day": return state.day;
      default: return 0;
    }
  }
  // 依需求清單「連續」判定：Lv.N的需求全部滿足才算到N，任一級不滿足就停(不會跳級)
  function computeCampLevel(state) {
    let lv = 1;
    for (let i = 1; i < CAMP_LEVELS.length; i++) {
      if (CAMP_LEVELS[i].reqs.every(r => campRequirementValue(state, r.type) >= r.n)) lv = CAMP_LEVELS[i].lv;
      else break;
    }
    return lv;
  }
  // 營地等級只升不降：取「已慶祝過的等級」與「目前算出的等級」較大者，玩家拆掉家具/賣掉東西不會讓辛苦養成的等級倒退
  function getCampLevel(state) {
    return Math.max(state.campLevelSeen || 1, computeCampLevel(state));
  }
  // 給營地面板用：目前等級、下一級的各項需求進度
  function campProgress(state) {
    const level = getCampLevel(state);
    const cur = CAMP_LEVELS[level - 1];
    const nextDef = CAMP_LEVELS[level] || null;
    const next = nextDef ? {
      lv: nextDef.lv, name: nextDef.name, reward: nextDef.reward || 0,
      reqs: nextDef.reqs.map(r => { const have = campRequirementValue(state, r.type); return { label: r.label, have, need: r.n, met: have >= r.n }; }),
    } : null;
    return { level, name: cur.name, desc: cur.desc, next, slotLimit: projectSlotLimit(state) };
  }
  // 偵測升級：算出的等級高於已慶祝過的，逐級發放晶燼獎勵並回傳通知清單(舊存檔第一次讀進來若已達標也會一次補發)
  function checkCampLevelUp(state) {
    const computed = computeCampLevel(state);
    const seen = state.campLevelSeen || 1;
    const ups = [];
    if (computed <= seen) return ups;
    for (let lv = seen + 1; lv <= computed; lv++) {
      const def = CAMP_LEVELS[lv - 1];
      if (def.reward) applyEffect(state, { embers: def.reward });
      ups.push({ lv, name: def.name, reward: def.reward || 0, text: def.levelUpText || "" });
    }
    state.campLevelSeen = computed;
    return ups;
  }

  // ---------- 庭院裝飾區（2026-07-05，見規格文件/庭院裝飾區_設計規格.md） ----------
  // 定位是經濟迴圈的「花錢出口」，不是新的生產節點：沿用既有YARD_DECOR的4個位置，
  // 從寫死擺設改成玩家可自選的裝飾槽，不新增場景/不新增生產流程
  // 2026-09-20玩家回饋「畫面一堆無用擺飾」：18塊農地占滿中央後，4個裝飾槽退到網格四個最外側角落
  // (農地塊 x=1..6,y=1..3 之外)，並在CSS縮小/半透明，不再搶版面；id不變，舊存檔已擺的裝飾保留
  const YARD_DECOR_SLOTS = [
    { id: "decor_1", gx: 0, gy: 0 },
    { id: "decor_2", gx: 8, gy: 0 },
    { id: "decor_3", gx: 0, gy: 5 },
    { id: "decor_4", gx: 8, gy: 5 },
  ];

  // 裝飾道具是可換來換去的耐久品(不是消耗品)，取下時要還給背包，不是憑空消失
  function placeYardDecor(state, slotId, itemId) {
    const slot = state.yardDecorSlots[slotId];
    if (!slot) return { ok: false, reason: "invalid_slot" };
    const item = ITEMS[itemId];
    if (!item || item.type !== "yard_decor") return { ok: false, reason: "invalid_item" };
    const invSlot = state.inventory.find(i => i.itemId === itemId && i.qty > 0);
    if (!invSlot) return { ok: false, reason: "not_in_inventory" };
    if (slot.itemId) {
      const existing = state.inventory.find(i => i.itemId === slot.itemId);
      if (existing) existing.qty += 1;
      else state.inventory.push({ itemId: slot.itemId, qty: 1 });
    }
    invSlot.qty -= 1;
    if (invSlot.qty <= 0) state.inventory = state.inventory.filter(i => i !== invSlot);
    slot.itemId = itemId;
    return { ok: true };
  }

  function removeYardDecor(state, slotId) {
    const slot = state.yardDecorSlots[slotId];
    if (!slot || !slot.itemId) return { ok: false, reason: "empty" };
    const existing = state.inventory.find(i => i.itemId === slot.itemId);
    if (existing) existing.qty += 1;
    else state.inventory.push({ itemId: slot.itemId, qty: 1 });
    slot.itemId = null;
    return { ok: true };
  }

  // 比照sumFurnitureEffect，加總所有已放置庭院裝飾道具的effects[key]（noiseGenRatio/cropGrowthBonusPhases等）
  function getYardDecorEffect(state, key) {
    let total = 0;
    Object.values(state.yardDecorSlots).forEach(slot => {
      const item = slot.itemId && ITEMS[slot.itemId];
      if (item && item.effects && typeof item.effects[key] === "number") total += item.effects[key];
    });
    return total;
  }

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
    if (!hasFurniturePlaced(state, "furn_sofa")) return { ok: false, reason: "no_sofa" };
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
    const text = getCompanionHomeLine(state, companionName) || (companionName && lines[companionName]) || "你陷進沙發裡，緊繃的神經終於鬆懈下來。";
    return { ok: true, text };
  }

  // ---- 敘事連續性(2026-09-20)：回訪記憶 / 同伴血月警語 / 同伴日常 ----
  function recordLocationVisit(state, locId) {
    if (!state.locationVisits) state.locationVisits = {};
    state.locationVisits[locId] = (state.locationVisits[locId] || 0) + 1;
    return state.locationVisits[locId];
  }
  // 回傳該造訪次數對應的「這裡你來過」迴響句；第1次或沒有對應門檻回空字串。rng可注入以便測試
  function getVisitMemoryLine(count, rng, locId) {
    if (!count || count < 2) return "";
    const specific = locId && LOCATION_MEMORY_LINES[locId];
    if (specific && (rng || Math.random)() < 0.5) return count >= 5 ? specific[5] : specific[2];
    const tiers = Object.keys(VISIT_MEMORY_LINES).map(Number).filter(t => t <= count).sort((a, b) => b - a);
    if (tiers.length === 0) return "";
    const pool = VISIT_MEMORY_LINES[tiers[0]];
    return pool[Math.floor((rng || Math.random)() * pool.length)];
  }
  // 前情回顧：記錄這個階段發生的事(win=擊倒敵人/loc=去過的地點/gather=採集)，endPhase時由buildRecapLine消費
  // 深淵日誌：依序發下一篇還沒拿到的，全部拿完回null(呼叫端不顯示)
  function grantNextLore(state) {
    if (!state.loreFound) state.loreFound = [];
    const next = LORE_LOGS.find(l => !state.loreFound.includes(l.id));
    if (!next) return null;
    state.loreFound.push(next.id);
    return next;
  }

  // 升級面板內容：回傳要顯示的行(敘事＋實際變強了什麼＋這一級帶來的新變化)。fromLevel=升級前等級
  function getLevelUpSummary(state, fromLevel) {
    const to = state.level, gained = to - fromLevel;
    const lines = [];
    const bracket = LEVEL_UP_LINES.find(b => to <= b.maxLevel) || LEVEL_UP_LINES[LEVEL_UP_LINES.length - 1];
    lines.push(bracket.lines[to % bracket.lines.length]);
    lines.push("❤️ HP上限 +" + (LEVEL_UP_HP_BONUS * gained) + "（現在 " + state.hpMax + "），已回滿");
    lines.push("⚔️ 攻擊 +" + (LEVEL_UP_ATK_BONUS * gained) + "（現在 " + state.stats.atk + "）");
    lines.push("⚡ 體力上限 +" + gained + "（現在 " + state.staminaMax + "）");
    const tierOf = lv => Math.min(3, Math.floor((lv - 1) / 3));
    if (tierOf(to) > tierOf(fromLevel)) lines.push("⚠️ 你的名聲傳開了——外頭的敵人也變得更強悍。");
    const farOf = lv => Math.max(1, ACTION_STAMINA_COSTS.explore_far - Math.floor((lv - 1) / 3));
    if (farOf(to) < farOf(fromLevel)) lines.push("🚙 你更熟悉遠途行軍了，遠征體力消耗降為 " + farOf(to) + "。");
    const capped = LOCATIONS.filter(l => l.levelCap >= fromLevel && l.levelCap < to);
    if (capped.length) lines.push("📉 " + capped.slice(0, 3).map(l => l.icon + l.name).join("、") + (capped.length > 3 ? "等" + capped.length + "處" : "") + "已學不到新東西了（經驗不再增加），該去更危險的地方。");
    if (state.skillPoints > 0) lines.push("⭐ 技能點：" + state.skillPoints + "（可在技能面板使用）");
    return lines;
  }

  function noteRecap(state, key, val) {
    if (!state.recap) state.recap = {};
    if (key === "win") { state.recap.wins = (state.recap.wins || 0) + 1; state.recap.enemy = val; }
    else if (key === "loc") state.recap.loc = val;
    else if (key === "gather") state.recap.gathers = (state.recap.gathers || 0) + 1;
  }
  function resetRecap(state) { state.recap = { hpStart: state.hp }; }
  // endedPhase：剛過完的階段("day"→入夜時顯示「今天…」，"night"→破曉時顯示「昨夜…」)。同一天同狀況結果穩定
  function buildRecapLine(state, endedPhase) {
    const r = state.recap || {};
    const lines = RECAP_LINES[endedPhase === "day" ? "day" : "night"];
    let cat = "quiet";
    if (typeof r.hpStart === "number" && r.hpStart - state.hp >= 20) cat = "hurt";
    else if ((r.wins || 0) >= 2) cat = "wins2";
    else if ((r.wins || 0) === 1) cat = "win1";
    else if (r.loc) cat = "loc";
    else if ((r.gathers || 0) > 0) cat = "gather";
    const pool = lines[cat];
    const line = pool[(state.day + (r.wins || 0)) % pool.length];
    return line.replace("{enemy}", r.enemy || "敵人").replace("{loc}", r.loc || "遠方");
  }

  function recruitedCompanionNames(state) {
    return Object.keys(state.companions || {}).filter(n => state.companions[n] && state.companions[n] !== "locked");
  }
  // 血月倒數期間(由呼叫端判斷)的同伴警語：依day輪替選人、選句，同一天重繪畫面結果穩定
  function getCompanionThreatLine(state) {
    const names = recruitedCompanionNames(state).filter(n => COMPANION_THREAT_LINES[n]);
    if (names.length === 0) return "";
    const name = names[state.day % names.length];
    const pool = COMPANION_THREAT_LINES[name];
    return name + "：" + pool[state.day % pool.length];
  }
  // 沙發/日常互動要找哪位同伴：個人線已解完(`${name}_arc_done`)者優先，其餘依day輪替；沒有同伴回null
  function pickHomeCompanion(state) {
    const names = recruitedCompanionNames(state);
    if (names.length === 0) return null;
    const settled = names.filter(n => state.flags && state.flags[n + "_arc_done"]);
    const pool = settled.length ? settled : names;
    return pool[state.day % pool.length];
  }
  function getCompanionHomeLine(state, name) {
    if (!name || !(state.flags && state.flags[name + "_arc_done"]) || !COMPANION_HOME_LINES[name]) return "";
    const pool = COMPANION_HOME_LINES[name];
    return pool[state.day % pool.length];
  }

  // v110：收音機互動——每日一次，SAN+3
  function radioInteract(state) {
    if (!hasFurniturePlaced(state, "furn_radio")) return { ok: false, reason: "no_radio" };
    if (!state.flags) state.flags = {};
    if (state.flags.radioUsedDay === state.day) return { ok: false, reason: "already_used" };
    state.flags.radioUsedDay = state.day;
    state.san = clamp(state.san + 3, 0, getEffectiveSanMax(state));
    return { ok: true, text: "老舊的收音機沙沙地播放著前世代的音樂，你靠著牆聽了一會，心情平靜了一些。（SAN+3）" };
  }

  // v110：孵化巢互動——每日一次，10%機率掉落稀有金屬廢料
  function eggNestInteract(state, rng = Math.random) {
    if (!hasFurniturePlaced(state, "furn_egg_nest")) return { ok: false, reason: "no_nest" };
    if (!state.flags) state.flags = {};
    if (state.flags.eggNestCheckedDay === state.day) return { ok: false, reason: "already_used" };
    state.flags.eggNestCheckedDay = state.day;
    if (rng() < 0.1) {
      state.resources.scrap = Math.min((state.resources.scrap || 0) + 2, state.resourceCaps.scrap);
      return { ok: true, found: true, text: "孵化巢裡的怪物今天似乎吐出了一些金屬碎渣。（廢料+2）" };
    }
    return { ok: true, found: false, text: "孵化巢裡的怪物只是發出咕噜聲，今天沒有什麼收穫。" };
  }

  // v166：家具彩蛋改用placedFurniture陣列索引定位(free-form佈置後不再有固定slot名稱)，
  // 參考Peeps「書架後面找到了東西」的隨手翻找互動，給目前完全沒有任何點擊回饋的純裝飾家具
  // (不含已有專屬互動的furn_diary/furn_radio/furn_egg_nest/furn_sleeping_bag)一個低成本的每日小回饋
  function furnitureEasterEggInteract(state, furnitureIndex, rng = Math.random) {
    const placed = state.placedFurniture && state.placedFurniture[furnitureIndex];
    if (!placed) return { ok: false, reason: "empty" };
    if (!state.flags) state.flags = {};
    if (!state.flags.easterEggDay) state.flags.easterEggDay = {};
    // 用itemId+座標組key而非陣列索引，避免日後若新增「移除家具」功能造成陣列重排時誤判
    const key = `${placed.itemId}_${placed.gx}_${placed.gy}`;
    if (state.flags.easterEggDay[key] === state.day) return { ok: false, reason: "already_used" };
    state.flags.easterEggDay[key] = state.day;
    const amount = 3 + Math.floor(rng() * 6); // 3~8
    state.currency.embers = (state.currency.embers || 0) + amount;
    const item = ITEMS[placed.itemId];
    return { ok: true, text: `你在${item ? item.name : "家具"}附近翻找，找到了一些散落的晶燼碎片！（晶燼+${amount}）` };
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
    if (hasFurniturePlaced(state, "furn_bench")) cost = Math.round(cost * 0.8);
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
    addNoise(state, NOISE_AMOUNTS.craft);
    return { ok: true, cost };
  }

  // #20-3：前綴重抽 — 花費💎為rare/epic裝備重抽PREFIX_POOL前綴（legendary固定"完美的"，不可重抽）
  const REFORGE_PREFIX_COST = { embers: 25 };
  function reforgePrefixCost(state) {
    let cost = REFORGE_PREFIX_COST.embers;
    if (state.facilities && state.facilities.workshop >= 1) cost = Math.round(cost * 0.8);
    const discount = getAccessoryEffect(state, "merchantDiscount");
    if (discount) cost = Math.round(cost * (1 - discount));
    // 2026-07-04：老周指派「craft」任務時，重鍛前綴額外打折(見COMPANIONS_REGISTRY)
    const companionDiscount = getCompanionTaskEffect(state, "reforgeDiscountRatio");
    if (companionDiscount) cost = Math.round(cost * (1 - companionDiscount));
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
    addNoise(state, NOISE_AMOUNTS.craft);
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
    const discount = getAccessoryEffect(state, "merchantDiscount"); // 27.1：黑市VIP徽章-10%
    if (discount) cost = Math.round(cost * (1 - discount));
    return cost;
  }

  // ---------- 覺醒（24.3） ----------
  // 2026-07-05技能點系統重設：移除自動隨機指派流派，改由玩家在技能面板手動選擇(見chooseFaction)，
  // 覺醒特質/hpMaxBonus/embers獎勵維持隨機無妨(次要小額加成，不影響玩法深度)
  function triggerAwakening(state, rng = Math.random) {
    const trait = AWAKENING_TRAITS[Math.floor(rng() * AWAKENING_TRAITS.length)];
    state.awakening = trait;
    if (trait.hpMaxBonus) state.hpMax += trait.hpMaxBonus;
    if (!state.skills) state.skills = { faction: null, tiers: {}, unlockOrder: [] };
    applyEffect(state, { embers: 20 });
    return trait;
  }

  // 玩家在技能面板手動選擇第一個(主)流派，一旦選定不能更換
  function chooseFaction(state, factionId) {
    if (!state.skills) state.skills = { faction: null, tiers: {}, unlockOrder: [] };
    if (state.skills.faction) return false;
    if (!FACTION_IDS.includes(factionId)) return false;
    state.skills.faction = factionId;
    state.skills.tiers = { [factionId]: 0 };
    state.skills.unlockOrder = [factionId];
    return true;
  }

  // ---------- 技能樹（25.3：五大流派。2026-07-05技能點系統重設：覺醒鏈，長期玩家最終可解鎖全部5個流派）----------
  // 索引=目前已解鎖流派數，null代表第1個流派覺醒當下即解鎖，不需要額外day門檻
  const AWAKENING_DAY_THRESHOLDS = [null, 100, 150, 200, 250];

  // 是否可以解鎖「下一個」流派：目前最後解鎖的流派已封頂 + day數達標 + 尚未解鎖滿5個
  function nextAwakeningAvailable(state) {
    if (!state.skills || !state.skills.faction) return false;
    const order = state.skills.unlockOrder || [];
    if (order.length >= FACTION_IDS.length) return false;
    const last = order[order.length - 1];
    const lastMaxed = (state.skills.tiers[last] || 0) >= SKILLS_TREE[last].tiers.length;
    if (!lastMaxed) return false;
    return state.day >= AWAKENING_DAY_THRESHOLDS[order.length];
  }

  function chooseNextFaction(state, factionId) {
    if (!nextAwakeningAvailable(state)) return false;
    if (state.skills.unlockOrder.includes(factionId) || !FACTION_IDS.includes(factionId)) return false;
    state.skills.tiers[factionId] = 0;
    state.skills.unlockOrder.push(factionId);
    return true;
  }

  // UI用：是否所有已解鎖流派都已封頂且沒有下一個可解鎖(判斷要不要顯示「兌換晶燼」選項)
  function allUnlockedFactionsMaxed(state) {
    if (!state.skills || !state.skills.unlockOrder || !state.skills.unlockOrder.length) return false;
    const allMaxed = state.skills.unlockOrder.every(f => (state.skills.tiers[f] || 0) >= SKILLS_TREE[f].tiers.length);
    return allMaxed && !nextAwakeningAvailable(state);
  }

  // 花技能點：指定要點哪個「已解鎖」流派，未封頂才會成功；全部流派都封頂時對任何factionId皆回傳false，
  // 交給既有的convertSkillPointToEmbers()兜底，不用額外判斷「全部封頂」的情況
  function spendSkillPoint(state, factionId) {
    if (!state.skills || !state.skills.unlockOrder || !state.skills.unlockOrder.includes(factionId)) return false;
    if ((state.skillPoints || 0) <= 0) return false;
    const cur = state.skills.tiers[factionId] || 0;
    if (cur >= SKILLS_TREE[factionId].tiers.length) return false;
    state.skills.tiers[factionId] = cur + 1;
    state.skillPoints -= 1;
    return true;
  }

  // 2026-07-04修正：確認缺口——技能樹T4封頂後spendSkillPoint()永遠回傳false，
  // 之後每次升級拿到的技能點完全沒有地方花，只會不斷累積但毫無用途。選擇「兌換成晶燼」
  // 這個較小工程量的方案(相對於延伸出T5+更高階效果)，讓封頂後的技能點依然有出路，
  // 兌換率比照成就的小額獎勵量級，不追求平衡精算，只求不讓數值變成廢資源
  const SKILL_POINT_EMBERS_VALUE = 8;
  function convertSkillPointToEmbers(state) {
    if ((state.skillPoints || 0) <= 0) return false;
    state.skillPoints -= 1;
    applyEffect(state, { embers: SKILL_POINT_EMBERS_VALUE });
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

  // ---------- 任務與成就系統（規格文件/任務與成就系統_設計規格.md）----------
  // reward用{embers,exp,scrap}簡寫，轉呼叫既有applyEffect，不重造數值套用邏輯
  function applyQuestReward(state, reward) {
    if (!reward) return;
    const effect = {};
    if (reward.embers) effect.embers = reward.embers;
    if (reward.exp) effect.exp = reward.exp;
    if (reward.scrap) effect.resources = { scrap: reward.scrap };
    applyEffect(state, effect);
  }

  // 仿照seenEvents的記錄方式，在finishAction/endPhase收尾時呼叫一次。
  // 只「監看」現有flag/day/facilities等狀態，達成條件就記錄+發獎，不主動改變遊戲邏輯。
  // 回傳本次新完成/解鎖的項目，供UI顯示toast/彈窗（不影響呼叫端既有流程）。
  function checkQuestsAndAchievements(state) {
    const result = { completedMain: null, completedSide: [], graduated: false, unlockedAchievements: [] };

    const main = state.questProgress.activeMain ? QUESTS[state.questProgress.activeMain] : null;
    if (main && main.condition(state)) {
      state.questProgress.completedMain.push(main.id);
      applyQuestReward(state, main.reward);
      state.questProgress.activeMain = main.nextQuestId || null;
      result.completedMain = main;
      if (!main.nextQuestId) result.graduated = true; // 第7章完成＝「畢業」，非遊戲結局
    }

    Object.values(QUESTS).forEach(q => {
      if (q.type !== "side") return;
      if (q.repeatable === "day") {
        const lastClaimKey = q.id + "_lastClaimDay";
        const lastClaim = state.questFlags[lastClaimKey];
        if (lastClaim === state.day) return; // 今天已經拿過
        if (q.condition(state)) {
          state.questFlags[lastClaimKey] = state.day;
          applyQuestReward(state, q.reward);
          result.completedSide.push(q);
        }
        return;
      }
      if (q.repeatable === "manual") {
        if (q.condition(state)) {
          applyQuestReward(state, q.reward);
          if (q.resetField) state.questFlags[q.resetField] = 0; // 達標後扣回計數器，讓玩家可以重新累積
          // 程序化支線目標(2026-07-06)：有targetRange的話，每次重置順便重新抽一個目標值，
          // 讓「這輪要做幾次」本身也帶點隨機，不是每次都完全一樣的固定次數
          if (q.targetRange) {
            const [min, max] = q.targetRange;
            state.questFlags[q.id + "_target"] = min + Math.floor(Math.random() * (max - min + 1));
          }
          result.completedSide.push(q);
        }
        return;
      }
      if (state.questProgress.completedSide.includes(q.id)) return;
      if (q.condition(state)) {
        state.questProgress.completedSide.push(q.id);
        applyQuestReward(state, q.reward);
        result.completedSide.push(q);
      }
    });

    Object.values(ACHIEVEMENTS).forEach(a => {
      if (state.unlockedAchievements.includes(a.id)) return;
      if (a.condition(state)) {
        state.unlockedAchievements.push(a.id);
        applyQuestReward(state, a.reward);
        result.unlockedAchievements.push(a);
      }
    });

    return result;
  }

  const api = {
    defaultState, clamp, applyEffect, useItem, pickWeighted, pickEvent, RESOURCE_DROP_KEYS,
    applyPhaseDecay, applyActionRegen, advancePhase, battleDamage, raidChance, reinforceCost, consumeReinforceDiscount, REINFORCE_COST, gatherYield, convertScrap, CONVERT_SCRAP_COST,
    staminaMaxForLevel, staminaMax, staminaBonusFromSources, STAMINA_BONUS_CAP,
    actionStaminaCost, spendStamina, ACTION_STAMINA_COSTS, overdrawHpPenalty, restHealAmount,
    OVERDRAW_HP_PENALTY, OVERDRAW_RESOURCE_MULTIPLIER, OVERDRAW_ENCOUNTER_BONUS,
    resolveLocation, pickLocations, FAR_TRAVEL_COST, pickLocationModifier,
    getDurability, decayEquippedDurability, repairCost, repairEquipment, DURABILITY_MAX, DURABILITY_LOSS_PER_BATTLE,
    reforgePrefixCost, reforgePrefix,
    rollGacha, gachaCost, GACHA_COST,
    getEffectiveStats, getCritChance, CRIT_MULTIPLIER, getCritMultiplier, consumeAmmoForAttack, getSkillBonusRatio,
    addStatusEffect, tickStatusEffects, maybeGenerateShield, absorbShield, maybeStunEnemy,
    applyDefShred, getShreddedDef, getDefShredPerHit,
    applyAtkShred, getShreddedAtk, getAtkShredPerHit,
    getLifestealRatio, getDodgeChance, getIgnoreDefRatio, recordLocationVisit, getVisitMemoryLine, grantNextLore, getLevelUpSummary, threatLeadDays, radarEncounterReduction, radarLevel, noteRecap, resetRecap, buildRecapLine, getCompanionThreatLine, pickHomeCompanion, getCompanionHomeLine, getFactionDamageMultiplier, getMechanicalDamageMultiplier, getBossFactionCounterMult, combineSpecialDamageMultipliers, SPECIAL_DAMAGE_MULT_CAP,
    getBattleDamageReductionRatio, gaiaCheatDeath, factionTier,
    FACTION_RESONANCE, factionResonanceActive, getActiveFactionResonances, getFactionResonanceBonus,
    instantiateEquipment, getEquipRef, getInstance, isInstanceRef, pixelIconSvg,
    getAccessoryEffect, getEffectiveSanMax, getEffectiveHpMax, getResourceCap, PREFIX_POOL,
    ATTRIBUTE_KEYS, getEffectiveAttribute, skillRoll,
    NOISE_AMOUNTS, NOISE_DECAY_PER_PHASE, addNoise,
    gainExp, LEVEL_UP_HP_BONUS, LEVEL_UP_ATK_BONUS, applyPrologueEnding,
    COMPANION_TASKS, COMPANION_NAMES, defaultCompanionsState, recruitCompanion, refreshCompanionUnlocks, dispatchCompanion, companionAssigned, getCompanionTaskEffect,
    FACILITY_KEYS, syncBaseDefense, reinforceFacility, restSanRegen,
    FARM_PLOT_LAYOUT, CROPS, currentPhaseIndex, farmPlotUnlockCost, unlockFarmPlot, plantSeed, waterPlot, getCropStage, harvestFarmPlot,
    PEN_LAYOUT, SPECIES, FEED_COST, getPenProductionState, penUnlockCost, penCapacityInfo, firstFreePenId, nextLockedPenId, unlockPen, placeAnimal, feedAnimal, petAnimal, collectPen,
    hasAnyPenAnimal, resetPensAfterRetreat,
    WORKSHOP_STATION_LAYOUT, RECIPES, recipeAvailable, canAffordRecipe, processingStationUnlockCost, unlockProcessingStation, startProcessing, getProcessingState, collectProcessing,
    PROJECTS, CAMP_LEVELS, isProjectDone, getProjectEffect, getProjectPhaseYield, activeProjectCount, projectSlotLimit, canAffordProject, getProjectState, startProject, settleProjects,
    campRequirementValue, computeCampLevel, getCampLevel, campProgress, checkCampLevelUp,
    YARD_DECOR_SLOTS, placeYardDecor, removeYardDecor, getYardDecorEffect,
    placeFurniture, getFurnitureDefBonus, getFurnitureRaidChanceDelta, loungeInteract, sumFurnitureEffect,
    hasFurniturePlaced, allPlacedFurnitureIds, findEmptyGridCell,
    getComfortLevel, getComfortLabel, radioInteract, eggNestInteract, furnitureEasterEggInteract,
    getMilestoneEvent, MILESTONE_EVENTS,
    triggerAwakening, chooseFaction, AWAKENING_DAY_THRESHOLDS, nextAwakeningAvailable, chooseNextFaction, allUnlockedFactionsMaxed,
    spendSkillPoint, convertSkillPointToEmbers, SKILL_POINT_EMBERS_VALUE, enemyTier, getScaledEnemy, TIER_PREFIXES, getLocationOverpower,
    checkUpcomingThreat, isThreatDue, clearUpcomingThreat, THREAT_LEAD_DAYS, BLOOD_MOON_CYCLE_MIN, BLOOD_MOON_CYCLE_MAX,
    resolveBloodMoonDefense, bloodMoonRewards, bloodMoonRewardMultiplier, pickBloodMoonModifier, TIER_ZONES, getTierZoneForBloodMoonWin,
    getAbyssSurgeBattle, ABYSS_SURGE_EQUIPMENT_POOL,
    ITEMS, ENEMIES, EVENTS, LOCATIONS, AWAKENING_TRAITS, SKILLS_TREE, FACTION_IDS,
    replacePlayerNameTag, dailyMoodCheckin, depositToFridge, withdrawFromFridge, generateSyncCode, applySyncCode,
    QUESTS, ACHIEVEMENTS, applyQuestReward, checkQuestsAndAchievements,
    _applyEffect: applyEffect, _pickEvent: pickEvent, _pickWeighted: pickWeighted
  };

  if (isNode) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== "undefined" ? window : globalThis);
