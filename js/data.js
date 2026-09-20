// 資料定義（內嵌為JS物件，避免file://下fetch JSON的CORS問題）

// v167：EVENTS的condition需要判斷「某家具是否已陳列」，但data.js被logic.js require()，
// 不能反過來呼叫logic.js的hasFurniturePlaced()（會造成循環依賴，Node環境下require會拿到尚未
// 執行完的空module.exports）。故在此就地複製一份最小邏輯，僅依賴state本身、不依賴其他檔案
function isFurniturePlacedInData(state, itemId) {
  if (state.baseSlots && (state.baseSlots.wall === itemId || state.baseSlots.wall2 === itemId)) return true;
  return !!(state.placedFurniture && state.placedFurniture.some(f => f.itemId === itemId));
}
// 同上理由就地複製：計算目前總共擺放了幾件家具(牆面2格+free-form陣列)，供任務/成就的數量門檻條件使用
function countPlacedFurnitureInData(state) {
  let count = (state.placedFurniture || []).length;
  if (state.baseSlots) {
    if (state.baseSlots.wall) count += 1;
    if (state.baseSlots.wall2) count += 1;
  }
  return count;
}
// 同上理由就地複製：解析裝備欄位目前裝著的ITEMS定義(含rarity/factionTag等完整屬性)。
// state.equipment.X存的可能是原始itemId(一般/不常見品質)，也可能是"inst_xxxx"實例參考(稀有以上，
// 鍛造/詞綴會產生實例)，不能直接用ITEMS[state.equipment.X]查表，否則稀有以上裝備會查到undefined
// (見code review：ach_legendary_equip/ach_full_factions都曾經因此誤判)。不需要logic.js的getEquipRef()
// 回傳的完整屬性/詞綴細節，只需要底板道具的ITEMS定義即可
function resolveEquippedItemInData(state, slot) {
  const ref = state.equipment && state.equipment[slot];
  if (!ref) return null;
  if (typeof ref === "string" && ref.startsWith("inst_") && state.weaponInstances) {
    const inst = state.weaponInstances.find(i => i.id === ref);
    return inst ? ITEMS[inst.baseItemId] : null;
  }
  return ITEMS[ref] || null;
}
// 判斷某裝備欄位目前是否裝著指定baseItemId的道具，基於resolveEquippedItemInData
function isEquippedInData(state, slot, itemId) {
  const item = resolveEquippedItemInData(state, slot);
  return !!(item && item.id === itemId);
}
// 同伴劇情線共用判斷：18個evt_arc_*(6位同伴各3階)+6個evt_epilogue_*事件的condition都要判斷
// 「該同伴是否已招募」跟「距上一階完成flag是否已過N天」，原本18處各自重複同一段boilerplate，
// 收斂成共用函式(見code review)
function companionRecruited(state, name) {
  return !!(state.companions && state.companions[name] && state.companions[name] !== "locked");
}
function daysSinceFlagAtLeast(state, flag, days) {
  return !!(state.flags && state.flags[flag] && state.day - state.flags[flag] >= days);
}
// repeatable:"manual"+targetRange的程序化支線委託共用判斷：q.counterField目前累計值是否達到
// q.id+"_target"(每輪重抽的動態目標，見checkQuestsAndAchievements)，尚未重抽過(第一輪)時退回q.counterTarget
function repeatQuestReady(state, q) {
  return (state.questFlags[q.counterField] || 0) >= (state.questFlags[q.id + "_target"] || q.counterTarget);
}

const ITEMS = {
  // 武器
  knife_01: { id: "knife_01", name: "生鏽小刀", type: "weapon", icon: "🔪", stats: { atk: 2 }, rarity: "common" },
  pipe_01: { id: "pipe_01", name: "鋼管", type: "weapon", icon: "🔧", stats: { atk: 3 }, rarity: "common" },
  bat_01: { id: "bat_01", name: "球棒", type: "weapon", icon: "🏏", stats: { atk: 4 }, rarity: "uncommon" },
  machete_01: { id: "machete_01", name: "開山刀", type: "weapon", icon: "🔪", stats: { atk: 6 }, rarity: "rare" },
  pistol_01: { id: "pistol_01", name: "手槍", type: "weapon", icon: "🔫", stats: { atk: 8 }, rarity: "epic", ranged: true, desc: "遠程武器：戰鬥中每次攻擊消耗1🔋彈藥；彈藥耗盡時攻擊力加成減半" },
  // 2026-07-01新增：早期常見武器補充，降低前期只有5把武器可選的單調感
  crowbar_01: { id: "crowbar_01", name: "生鏽撬棍", type: "weapon", icon: "🔨", stats: { atk: 5 }, rarity: "uncommon" },
  nail_bat_01: { id: "nail_bat_01", name: "釘刺球棒", type: "weapon", icon: "🏏", stats: { atk: 7 }, rarity: "rare", effects: { lifestealBonus: 0.05 }, desc: "球棒外層釘滿鐵釘，攻擊額外+5%吸血" },
  // 防具
  jacket_01: { id: "jacket_01", name: "厚外套", type: "armor", icon: "🧥", stats: { def: 1 }, rarity: "common" },
  vest_01: { id: "vest_01", name: "防彈背心", type: "armor", icon: "🦺", stats: { def: 3 }, rarity: "rare" },
  // 2026-07-01新增：早期常見防具補充
  leather_coat_01: { id: "leather_coat_01", name: "磨舊皮革大衣", type: "armor", icon: "🧥", stats: { def: 2 }, rarity: "common" },
  riot_shield_vest: { id: "riot_shield_vest", name: "防暴盾牌背心", type: "armor", icon: "🛡️", stats: { def: 2 }, rarity: "uncommon", effects: { battleDamageReductionBonus: 0.05 }, desc: "厚重的防暴裝備，物理傷害減免+5%" },
  // 消耗品
  food_can: { id: "food_can", name: "罐頭食品", type: "consumable", icon: "🥫", useEffect: { resources: { food: 3 } }, rarity: "common" },
  water_bottle: { id: "water_bottle", name: "瓶裝水", type: "consumable", icon: "💧", useEffect: { resources: { water: 3 } }, rarity: "common" },
  bandage: { id: "bandage", name: "繃帶", type: "consumable", icon: "🩹", useEffect: { resources: { medicine: 1 } }, rarity: "common" },
  // 材料
  scrap: { id: "scrap", name: "廢料", type: "material", icon: "🔩", rarity: "common" },
  mutant_berry_extract: { id: "mutant_berry_extract", name: "變異漿果精華", type: "material", icon: "🧪", rarity: "rare", desc: "從變異漿果榨取的濃縮精華，加工區原料（配方待加工區系統設計）" },

  // 種子（農場區，2026-07-02，見規格文件/農場區_設計規格.md）
  seed_potato: { id: "seed_potato", name: "馬鈴薯種子", type: "seed", icon: "🥔", rarity: "common", shopPrice: { embers: 8 }, cropId: "crop_potato" },
  seed_greens: { id: "seed_greens", name: "野菜種子", type: "seed", icon: "🥬", rarity: "common", shopPrice: { embers: 6 }, cropId: "crop_greens" },
  seed_mutant_berry: { id: "seed_mutant_berry", name: "變異漿果種子", type: "seed", icon: "🫐", rarity: "rare", cropId: "crop_mutant_berry" }, // 不上架商城，只從loc_farmstead掉落

  // 動物（養殖區，2026-07-02，見規格文件/養殖區_設計規格.md）
  chick_token: { id: "chick_token", name: "雛雞", type: "animal", icon: "🐣", rarity: "common", shopPrice: { embers: 10 }, speciesId: "species_chicken" },
  lamb_token: { id: "lamb_token", name: "小羊羔", type: "animal", icon: "🐑", rarity: "common", shopPrice: { embers: 14 }, speciesId: "species_sheep" },
  mutant_hen_token: { id: "mutant_hen_token", name: "變異母雞", type: "animal", icon: "🐔", rarity: "rare", speciesId: "species_mutant_hen" }, // 不上架商城，只從loc_farmstead掉落
  egg: { id: "egg", name: "蛋", type: "material", icon: "🥚", rarity: "common", desc: "可食用，也是加工區原料" },
  wool: { id: "wool", name: "羊毛", type: "material", icon: "🧶", rarity: "common", desc: "加工區原料" },
  mutant_egg_essence: { id: "mutant_egg_essence", name: "變異蛋精華", type: "material", icon: "🧪", rarity: "rare", desc: "從變異母雞取得的濃縮精華，加工區原料（配方待加工區系統設計）" },
  // 25.3/25.4 商城道具
  energy_drink: { id: "energy_drink", name: "機能飲料", type: "consumable", icon: "🥤", useEffect: { stamina: 2 }, rarity: "uncommon", shopPrice: { embers: 8 }, desc: "立即恢復體力+2（不超過上限）" },
  serum_atk: { id: "serum_atk", name: "素質強化劑·力量", type: "consumable", icon: "💉", useEffect: { statBoost: { atk: 1 } }, useLimitPerGame: 3, rarity: "rare", shopPrice: { embers: 30 }, desc: "永久攻擊力+1" },
  serum_stamina: { id: "serum_stamina", name: "素質強化劑·耐力", type: "consumable", icon: "💉", useEffect: { statBoost: { staminaMax: 1 } }, useLimitPerGame: 3, rarity: "rare", shopPrice: { embers: 30 }, desc: "永久體力上限+1" },
  serum_vit: { id: "serum_vit", name: "素質強化劑·體質", type: "consumable", icon: "💉", useEffect: { statBoost: { hpMax: 5 } }, useLimitPerGame: 3, rarity: "rare", shopPrice: { embers: 30 }, desc: "永久HP上限+5" },
  reinforce_blueprint: { id: "reinforce_blueprint", name: "強化藍圖", type: "consumable", icon: "📜", useEffect: { reinforceDiscount: 2 }, useLimitPerGame: 1, rarity: "uncommon", shopPrice: { embers: 15 }, desc: "下次強化據點所需廢料-2（一次性）" },
  awaken_crystal: { id: "awaken_crystal", name: "覺醒結晶", type: "consumable", icon: "💠", useEffect: { skillPoint: 1 }, rarity: "epic", shopPrice: { embers: 50 }, desc: "立即獲得技能點+1" },
  appearance_token: { id: "appearance_token", name: "風格交換券", type: "consumable", icon: "🎟️", useEffect: { unlockAppearance: "random" }, useLimitPerGame: 3, rarity: "rare", shopPrice: { embers: 25 }, desc: "隨機解鎖一款新造型，可於鏡子前切換（每款僅需解鎖一次）" },
  floor_sample: { id: "floor_sample", name: "地板樣品券", type: "consumable", icon: "🧵", useEffect: { unlockFloor: "random" }, useLimitPerGame: 2, rarity: "uncommon", shopPrice: { embers: 18 }, desc: "隨機解鎖一款新地板樣式，可於睡袋前切換（每款僅需解鎖一次）" },

  // 27.2 家具池：type="furniture"，slot="wall"|"table"|"floor"|"rug"。2026-06-26起：wall類陳列於
  // state.baseSlots(固定2格)，其餘(table/floor/rug)改為state.placedFurniture(free-form擺放，無上限)
  furn_photo_frame: { id: "furn_photo_frame", name: "時空相片展示壁框", type: "furniture", icon: "🖼️", slot: "wall", rarity: "rare", factionTag: "none", desc: "陳設用家具，呼應29.2「相片裂縫任務」（該任務系統尚未實作，目前僅為裝飾）" },
  furn_fridge: { id: "furn_fridge", name: "Peeps物資共享大冰箱", type: "furniture", icon: "🧊", slot: "floor", rarity: "rare", factionTag: "none", desc: "陳設用家具，呼應29.2聯機共用冰箱功能（該功能不論是否擺放本家具皆可使用）" },
  furn_turret: { id: "furn_turret", name: "電磁防禦自動槍塔", type: "furniture", icon: "🗼", slot: "wall", rarity: "epic", factionTag: "none", desc: "防禦+25，夜襲開局對全體電擊30", effects: { defBonus: 25 } },
  furn_flag: { id: "furn_flag", name: "兄弟會戰術軍旗", type: "furniture", icon: "🚩", slot: "wall", rarity: "common", factionTag: "none", desc: "防禦+5，探索初始atk+2", effects: { defBonus: 5 } },
  furn_vines: { id: "furn_vines", name: "巨型地脈藤蔓標本", type: "furniture", icon: "🌿", slot: "wall", rarity: "rare", factionTag: "none", desc: "每日水消耗有機率-1" },
  furn_mirror: { id: "furn_mirror", name: "重力晶簇掛鏡", type: "furniture", icon: "🪞", slot: "wall", rarity: "epic", factionTag: "none", desc: "夜襲機率-5%（與27.1同名飾品效果分開計算，可疊加）", effects: { raidChanceDelta: -0.05 } },
  furn_whiteboard: { id: "furn_whiteboard", name: "共享留言白板", type: "furniture", icon: "📋", slot: "wall", rarity: "common", factionTag: "none", desc: "防禦+5（單機版僅留文案陳設）", effects: { defBonus: 5 } },
  furn_jelly_lamp: { id: "furn_jelly_lamp", name: "發光霓虹水母燈", type: "furniture", icon: "🪼", slot: "table", rarity: "rare", factionTag: "none", desc: "休息時SAN額外+15", effects: { restSanBonus: 15 } },
  furn_radio: { id: "furn_radio", name: "流浪商人的收音機", type: "furniture", icon: "📻", slot: "table", rarity: "rare", factionTag: "none", desc: "探索遭遇「流浪商人」事件機率+15%" },
  furn_diary: { id: "furn_diary", name: "舊時代破舊筆記本", type: "furniture", icon: "📓", slot: "table", rarity: "common", factionTag: "none", desc: "每次返回據點自動回SAN+10", effects: { returnSanBonus: 10 } },
  // A.3：規劃中家具x4
  furn_sandbags: { id: "furn_sandbags", name: "改裝防禦沙袋", type: "furniture", icon: "🧱", slot: "floor", rarity: "common", factionTag: "none", desc: "防禦+3", effects: { defBonus: 3 } },
  furn_dreamcatcher: { id: "furn_dreamcatcher", name: "靈能捕夢網", type: "furniture", icon: "🕸️", slot: "wall", rarity: "rare", factionTag: "none", desc: "夜襲發生時，戰鬥開始前先回復SAN+5", effects: { raidSanBonus: 5 } },
  furn_generator: { id: "furn_generator", name: "黑市手搖式發電機", type: "furniture", icon: "🔌", slot: "floor", rarity: "epic", factionTag: "none", desc: "強化據點/物資轉換時20%機率不消耗體力", effects: { noStaminaCostChance: 0.2 } },
  furn_couple_wall: { id: "furn_couple_wall", name: "同居紀念相片牆", type: "furniture", icon: "💑", slot: "wall", rarity: "epic", factionTag: "none", desc: "已連結配偶時，每日清晨資源上限全項+2", effects: { resourceCapBonus: 2 } },
  furn_egg_nest: { id: "furn_egg_nest", name: "突變生物孵化巢", type: "furniture", icon: "🥚", slot: "table", rarity: "rare", factionTag: "none", desc: "每日10%機率掉落稀有金屬廢料" },
  furn_greenhouse: { id: "furn_greenhouse", name: "蓋亞靈能生態溫室", type: "furniture", icon: "🪴", slot: "floor", rarity: "epic", factionTag: "none", desc: "晝夜切換時產出食物×1~2" },
  furn_bench: { id: "furn_bench", name: "外骨骼重組工作台", type: "furniture", icon: "🛠️", slot: "floor", rarity: "rare", factionTag: "none", desc: "重鍛(27.3)消耗💎再-20%" },
  furn_sofa: { id: "furn_sofa", name: "舒適的生態皮沙發", type: "furniture", icon: "🛋️", slot: "floor", rarity: "rare", factionTag: "none", desc: "解鎖28.2沙發互動；休息時hpMax暫時+10（持續1天）", effects: { loungeHpMaxBonus: 10 } },
  furn_sleeping_bag: { id: "furn_sleeping_bag", name: "破舊睡袋", type: "furniture", icon: "🛏️", slot: "floor", rarity: "common", factionTag: "none", desc: "點擊可更換安全屋地板樣式" },
  furn_appearance_mirror: { id: "furn_appearance_mirror", name: "造型穿衣鏡", type: "furniture", icon: "🪞", slot: "wall", rarity: "common", factionTag: "none", shopPrice: { embers: 20 }, desc: "點擊可更換已解鎖的造型" },
  furn_potted_plant: { id: "furn_potted_plant", name: "倖存的小盆栽", type: "furniture", icon: "🪴", slot: "table", rarity: "common", factionTag: "none", shopPrice: { embers: 12 }, desc: "每次返回據點自動回SAN+5", effects: { returnSanBonus: 5 } },
  furn_toolbox: { id: "furn_toolbox", name: "上鎖的工具箱", type: "furniture", icon: "🧰", slot: "floor", rarity: "common", factionTag: "none", shopPrice: { embers: 15 }, desc: "防禦+3", effects: { defBonus: 3 } },

  // v160：地毯類(獨立rug槽位，鋪在地板下層，不佔用floor陳列格)
  // 噪音系統(2026-07-04)：原本純裝飾，現在額外接上noiseDampRatio(製造/搜刮/戰鬥累積的噪音按比例折抵)
  rug_plain: { id: "rug_plain", name: "簡約棉質地墊", type: "furniture", icon: "🟫", slot: "rug", rarity: "common", factionTag: "none", shopPrice: { embers: 8 }, desc: "鋪在地板上提升小屋氛圍，隔音-5%噪音累積", effects: { noiseDampRatio: 0.05 } },
  rug_woven: { id: "rug_woven", name: "編織暖色地毯", type: "furniture", icon: "🟧", slot: "rug", rarity: "rare", factionTag: "none", shopPrice: { embers: 14 }, desc: "鋪在地板上提升小屋氛圍，隔音-10%噪音累積", effects: { noiseDampRatio: 0.1 } },
  rug_round: { id: "rug_round", name: "圓形毛絨地毯", type: "furniture", icon: "🔵", slot: "rug", rarity: "epic", factionTag: "none", shopPrice: { embers: 22 }, desc: "鋪在地板上提升小屋氛圍，隔音-15%噪音累積", effects: { noiseDampRatio: 0.15 } },

  // 加工區(2026-07-04)：探索限定配方相關道具，見規格文件/加工區_設計規格.md
  blueprint_mutant_lamp: { id: "blueprint_mutant_lamp", name: "變異孢子提燈圖紙", type: "blueprint", icon: "📜", rarity: "rare", desc: "加工區專屬配方圖紙，持有即可在加工站製作對應家具（不會被消耗）" },
  furn_mutant_lamp: { id: "furn_mutant_lamp", name: "變異孢子提燈", type: "furniture", icon: "🏮", slot: "table", rarity: "epic", factionTag: "none", desc: "探索限定家具，柔光有助於放鬆，休息SAN回復+5", effects: { restSanBonus: 5 } },

  // 庭院裝飾區(2026-07-05)：見規格文件/庭院裝飾區_設計規格.md，經濟迴圈的花錢出口，不是新產出節點
  yard_lantern: { id: "yard_lantern", name: "庭院石燈籠", type: "yard_decor", icon: "🏮", rarity: "common", shopPrice: { embers: 10 }, desc: "純裝飾，點亮庭院的夜晚氛圍" },
  yard_scarecrow: { id: "yard_scarecrow", name: "稻草人", type: "yard_decor", icon: "🎃", rarity: "rare", shopPrice: { embers: 16 }, desc: "純裝飾，帶點復古的田園風情" },
  yard_windchime: { id: "yard_windchime", name: "銅製風鈴", type: "yard_decor", icon: "🎐", rarity: "rare", shopPrice: { embers: 16 }, desc: "微風吹動時清脆作響，但風鈴聲也會傳得比較遠，噪音累積+5%", effects: { noiseGenRatio: 0.05 } },
  yard_flower_bed: { id: "yard_flower_bed", name: "野花花圃", type: "yard_decor", icon: "🌼", rarity: "epic", shopPrice: { embers: 24 }, desc: "五顏六色的野花，讓庭院看起來生機盎然，休息時額外回SAN+3", effects: { returnSanBonus: 3 } },
  yard_gaia_totem: { id: "yard_gaia_totem", name: "蓋亞靈能圖騰", type: "yard_decor", icon: "🗿", rarity: "epic", desc: "探索限定裝飾，蓋亞流派的靈能圖騰，庭院裡的作物似乎生長得更好些", effects: { cropGrowthBonusPhases: 1 } },

  // 27.1/32.3 裝備池：28項武器(10)/防具(8)/飾品(8)，rare以上掉落時實例化為weaponInstances並可疊加前綴詞(PREFIX_POOL)
  // 武器(10)
  scrap_chainsaw: { id: "scrap_chainsaw", name: "工兵改裝電鋸", type: "weapon", icon: "⚙️", stats: { atk: 2 }, rarity: "common", factionTag: "none", desc: "初始武器" },
  military_shovel: { id: "military_shovel", name: "舊世軍用軍鏟", type: "weapon", icon: "🥄", stats: { atk: 3 }, rarity: "common", factionTag: "none", desc: "防禦時護盾+2（未接入防禦判定，文案保留）" },
  gaia_whip: { id: "gaia_whip", name: "活化荊棘刺鞭", type: "weapon", icon: "🌱", stats: { atk: 5 }, rarity: "rare", factionTag: "gaia", desc: "攻擊額外15%吸血（與蓋亞血脈T2分開計算）", effects: { lifestealBonus: 0.15 } },
  ocean_pistol: { id: "ocean_pistol", name: "酸水噴射短槍", type: "weapon", icon: "🔫", stats: { atk: 4 }, rarity: "rare", factionTag: "ocean", ranged: true, desc: "每擊敵方防禦-1，上限-5（27.4 defShred）；遠程武器：每次攻擊消耗1🔋彈藥，耗盡時攻擊力加成減半" },
  aero_crossbow: { id: "aero_crossbow", name: "大氣靈能重弩", type: "weapon", icon: "🏹", stats: { atk: 5 }, rarity: "rare", factionTag: "aero", ranged: true, desc: "先手率10%：每次攻擊有機率搶先造成一次額外傷害；遠程武器：每次攻擊消耗1🔋彈藥，耗盡時攻擊力加成減半" },
  aero_dagger: { id: "aero_dagger", name: "高頻次聲波刃", type: "weapon", icon: "🔪", stats: { atk: 8 }, rarity: "epic", factionTag: "aero", desc: "攻擊無視敵方防禦", effects: { ignoreDefBonus: 1 } },
  cyber_hammer: { id: "cyber_hammer", name: "電磁改裝重錘", type: "weapon", icon: "🔨", stats: { atk: 9 }, rarity: "epic", factionTag: "cyber", desc: "對機械系敵人傷害+100%" },
  ocean_mace: { id: "ocean_mace", name: "水銀液態流星錘", type: "weapon", icon: "⚒️", stats: { atk: 7 }, rarity: "epic", factionTag: "ocean", desc: "25%機率使敵暈眩1回合（27.4 stun）" },
  mind_fork: { id: "mind_fork", name: "神經干擾音叉", type: "weapon", icon: "🍴", stats: { atk: 3 }, rarity: "epic", factionTag: "mind", desc: "神經干擾：每擊使敵方攻擊力-1，疊加上限-5（27.4 atkShred，呼應原「扣AP」設定）" },
  mind_greatsword: { id: "mind_greatsword", name: "重力晶格巨劍", type: "weapon", icon: "🗡️", stats: { atk: 14 }, rarity: "legendary", factionTag: "mind", desc: "閃避歸零但暴擊倍率200%", effects: { critMultiplierOverride: 2.0 } },
  // 2026-07-01新增：各流派裝備補充，蓋亞原本只有1把武器明顯偏少，順便補齊其餘流派
  gaia_spore_dart: { id: "gaia_spore_dart", name: "孢子噴射匕首", type: "weapon", icon: "🍄", stats: { atk: 4 }, rarity: "uncommon", factionTag: "gaia", desc: "刃口塗滿活化孢子，攻擊額外+5%吸血（與活化荊棘刺鞭分開計算）", effects: { lifestealBonus: 0.05 } },
  ocean_harpoon: { id: "ocean_harpoon", name: "深海倒鉤魚叉", type: "weapon", icon: "🔱", stats: { atk: 10 }, rarity: "epic", factionTag: "ocean", desc: "深海生物的獠牙倒鉤，撕裂傷口讓你額外回復+8%生命", effects: { lifestealBonus: 0.08 } },
  cyber_drone_arm: { id: "cyber_drone_arm", name: "無人機協同義肢", type: "weapon", icon: "🦿", stats: { atk: 12 }, rarity: "legendary", factionTag: "cyber", desc: "內建輔助瞄準系統，暴擊倍率180%", effects: { critMultiplierOverride: 1.8 } },
  // 防具(8)
  scrap_plating: { id: "scrap_plating", name: "廢棄鐵皮外殼", type: "armor", icon: "🛡️", stats: { def: 1 }, rarity: "common", factionTag: "none", desc: "" },
  ceramic_vest: { id: "ceramic_vest", name: "陶瓷防彈插板", type: "armor", icon: "🦺", stats: { def: 2 }, rarity: "common", factionTag: "none", desc: "免疫流血（27.4 bleedImmune）／初始護甲", effects: { bleedImmune: true } },
  gaia_armor: { id: "gaia_armor", name: "苔蘚幾何外殼", type: "armor", icon: "🌿", stats: { def: 3 }, rarity: "rare", factionTag: "gaia", desc: "探索遭遇戰每回合回HP+2（不含血月/據點防衛戰）" },
  ocean_jacket: { id: "ocean_jacket", name: "重水防護夾克", type: "armor", icon: "🧥", stats: { def: 2 }, rarity: "rare", factionTag: "ocean", desc: "閃避率+5%", effects: { dodgeBonus: 0.05 } },
  aero_cloak: { id: "aero_cloak", name: "氣流避彈防風衣", type: "armor", icon: "🧥", stats: { def: 1 }, rarity: "rare", factionTag: "aero", desc: "遠程/爆炸傷害-20%（未接入傷害類型判定，文案保留）" },
  cyber_suit: { id: "cyber_suit", name: "金屬活化液壓甲", type: "armor", icon: "🦾", stats: { def: 5 }, rarity: "epic", factionTag: "cyber", desc: "20%機率將受傷轉為護盾（27.4 shield）" },
  mind_robe: { id: "mind_robe", name: "晶格折射風衣", type: "armor", icon: "👘", stats: { def: 4 }, rarity: "epic", factionTag: "mind", desc: "SAN損失-30%（任何來源，不限戰鬥）", effects: { sanLossReductionBonus: 0.3 } },
  gaia_skin: { id: "gaia_skin", name: "深淵黑血外皮", type: "armor", icon: "🩸", stats: { def: 7 }, rarity: "legendary", factionTag: "gaia", desc: "物理傷害減免+15%，但探索每回合-1SAN", effects: { battleDamageReductionBonus: 0.15 } },
  // 飾品(8，不加攻防，僅effects/文案)
  aero_pouch: { id: "aero_pouch", name: "大氣隨身風向儀", type: "accessory", icon: "🎒", rarity: "common", factionTag: "aero", desc: "陷阱事件觸發機率-30%" },
  merchant_token: { id: "merchant_token", name: "黑市VIP徽章", type: "accessory", icon: "🎫", rarity: "common", factionTag: "none", desc: "商城/重鍛價格-10%", effects: { merchantDiscount: 0.1 } },
  mind_eye: { id: "mind_eye", name: "澄澈石英眼眸", type: "accessory", icon: "👁️", rarity: "rare", factionTag: "mind", desc: "sanMax+20，佩戴時能看穿幻覺類事件的真相", effects: { sanMaxBonus: 20 } },
  ocean_leech: { id: "ocean_leech", name: "洋流寄生蛭", type: "accessory", icon: "🪱", rarity: "rare", factionTag: "ocean", desc: "hpMax+10，但每階段水消耗+1", effects: { hpMaxBonus: 10, extraWaterDecay: 1 } },
  tesla_battery: { id: "tesla_battery", name: "高壓儲能電容", type: "accessory", icon: "🔋", rarity: "rare", factionTag: "cyber", desc: "流派主動技能30%額外觸發（未接入主動技能機制，文案保留）" },
  cyber_pendant: { id: "cyber_pendant", name: "內燃機核心吊墜", type: "accessory", icon: "📿", rarity: "epic", factionTag: "cyber", desc: "戰鬥首回合必定觸發一次額外攻擊" },
  mind_mirror: { id: "mind_mirror", name: "重力晶簇掛鏡", type: "accessory", icon: "🪞", rarity: "legendary", factionTag: "mind", desc: "夜襲機率-5%且sanMax+10", effects: { raidChanceDelta: -0.05, sanMaxBonus: 10 } },
  wedding_ring: { id: "wedding_ring", name: "失落的結婚戒指", type: "accessory", icon: "💍", rarity: "epic", factionTag: "none", desc: "單人裝備：sanMax+10；雙人QR互掃確認後雙方暴擊率永久+15%（29.3，留待#9）", effects: { sanMaxBonus: 10 } },
  // 2026-07-01新增：蓋亞原本沒有任何飾品，補上一件；順便補齊大氣/心靈流派各一件飾品
  gaia_seed_pouch: { id: "gaia_seed_pouch", name: "活化種子囊", type: "accessory", icon: "🌾", rarity: "rare", factionTag: "gaia", desc: "隨身攜帶尚未發芽的活化種子，hpMax+8（傳說能在末日裡種出些什麼）", effects: { hpMaxBonus: 8 } },
  aero_barometer: { id: "aero_barometer", name: "大氣氣壓感測儀", type: "accessory", icon: "🌀", rarity: "uncommon", factionTag: "aero", desc: "提前預警氣壓異常，夜襲機率-3%", effects: { raidChanceDelta: -0.03 } },
  mind_lens: { id: "mind_lens", name: "折射透鏡單片眼鏡", type: "accessory", icon: "🕶️", rarity: "rare", factionTag: "mind", desc: "扭曲光線的透鏡片，sanMax+15", effects: { sanMaxBonus: 15 } }
};

// 農場區(2026-07-02，見規格文件/農場區_設計規格.md)：作物資料表，種子ITEMS的cropId對應到這裡。
// phasesToMature/stages/yield皆為草案數值，待試玩調整
const CROPS = {
  crop_potato: { id: "crop_potato", name: "馬鈴薯", phasesToMature: 4, stages: 3,
    yield: { resources: { food: 3 } } },
  crop_greens: { id: "crop_greens", name: "野菜", phasesToMature: 2, stages: 2,
    yield: { resources: { food: 2 } } },
  crop_mutant_berry: { id: "crop_mutant_berry", name: "變異漿果", phasesToMature: 6, stages: 3,
    yield: { resources: { food: 2 }, bonusItemId: "mutant_berry_extract" } },
};

// 養殖區(2026-07-02，見規格文件/養殖區_設計規格.md，2026-07-03改版V2星露谷式)：物種資料表，
// 動物ITEMS的speciesId對應到這裡。跟作物不同，動物是持久資產、收成後不會消失，producePhases是
// 「距離上次收成」的循環週期（雞快產出但要更頻繁回來收，羊慢產出但可以放著不管，取捨仍在）。
// V2移除了satietyDecayPerPhase(會衰減的飽食度)，好感度(happiness)改成只漲不跌，只影響品質暴擊機率
const SPECIES = {
  species_chicken: { id: "species_chicken", name: "雞", producePhases: 2,
    yield: { itemId: "egg", qty: 1 } },
  species_sheep: { id: "species_sheep", name: "羊", producePhases: 4,
    yield: { itemId: "wool", qty: 1 } },
  species_mutant_hen: { id: "species_mutant_hen", name: "變異母雞", producePhases: 3,
    yield: { itemId: "egg", qty: 1 }, bonusItemId: "mutant_egg_essence" },
};

// 27.1：前綴詞池(5)，rare以上裝備掉落時隨機附加並實例化為weaponInstances
const PREFIX_POOL = [
  { id: "hungry", name: "飢渴的", type: "weapon", minRarity: "rare", effect: { lifestealBonus: 0.05 }, desc: "武器額外+5%吸血" },
  { id: "corrosive", name: "腐蝕的", type: "weapon", minRarity: "rare", effect: { corrosiveStack: 1 }, desc: "每次攻擊額外使敵防-1，上限-5（27.4 defShred）" },
  { id: "heavy", name: "沉重的", type: "armor", minRarity: "rare", effect: { defBonus: 2, staminaCostBonus: 1 }, desc: "防具額外def+2，但體力消耗+1" },
  { id: "resonant", name: "共鳴的", type: "accessory", minRarity: "epic", effect: { skillBonusRatio: 0.1 }, desc: "流派暴擊率/吸血/閃避加成額外+10%" },
  { id: "perfect", name: "完美的", type: "any", minRarity: "legendary", effect: { statBonus: 1 }, desc: "該裝備基礎數值額外+1(atk或def)" },
  // v1.5內容擴充：前綴詞x5
  { id: "prefix_animated", name: "活化的", type: "weapon", minRarity: "rare", effect: { statBonus: 1, winStaminaChance: 0.15 }, desc: "武器額外+1攻擊；戰鬥勝利時有15%機率回復體力+1" },
  { id: "prefix_still_water", name: "止水之", type: "armor", minRarity: "rare", effect: { sanMaxBonus: 10 }, desc: "防具額外提供SAN上限+10" },
  { id: "prefix_overloaded", name: "過載的", type: "weapon", minRarity: "epic", effect: { statBonus: 5, durabilityDecayMult: 2 }, desc: "武器額外+5攻擊，但耐久消耗速度x2" },
  { id: "prefix_crystal_resonance", name: "晶格共鳴", type: "accessory", minRarity: "epic", effect: { skillBonusRatio: 0.15 }, desc: "流派暴擊率/吸血/閃避加成額外+15%" },
  { id: "prefix_immortal", name: "不滅的", type: "any", minRarity: "legendary", effect: { durabilityDecayMult: 0.5, lockMaxStats: true }, desc: "耐久消耗速度減半；基礎數值鎖定為浮動區間最大值" }
];

const ENEMIES = {
  enemy_walker_weak: {
    id: "enemy_walker_weak", name: "蹣跚的感染者", icon: "🧟",
    hp: 15, atk: 3, def: 0, expReward: 10,
    scaling: { hpPerTier: 13, atkPerTier: 3 }, // 26.1：tier上限改為3（終域），tier3: hp54 atk12（同舊版tier8數值）
    dropTable: [
      { itemId: "scrap", qty: 1, weight: 60 },
      { itemId: "bandage", qty: 1, weight: 20 }
    ]
  },
  enemy_walker_armed: {
    id: "enemy_walker_armed", name: "持械的感染者", icon: "🧟‍♂️",
    hp: 25, atk: 6, def: 1, expReward: 20,
    scaling: { hpPerTier: 21, atkPerTier: 3 }, // 26.1：tier上限改為3（終域），tier3: hp88 atk15（同舊版tier8數值）
    dropTable: [
      { itemId: "scrap", qty: 2, weight: 45 },
      { itemId: "pipe_01", qty: 1, weight: 15 },
      { itemId: "knife_01", qty: 1, weight: 15 },
      { itemId: "bandage", qty: 1, weight: 25 }
    ]
  },
  enemy_walker_brute: {
    id: "enemy_walker_brute", name: "巨型感染者", icon: "🧟‍♀️",
    hp: 40, atk: 9, def: 2, expReward: 35,
    scaling: { hpPerTier: 32, atkPerTier: 3 }, // 26.1：tier上限改為3（終域），tier3: hp136 atk18（同舊版tier8數值，v0.9校正後）
    dropTable: [
      { itemId: "scrap", qty: 3, weight: 35 },
      { itemId: "machete_01", qty: 1, weight: 10 },
      { itemId: "vest_01", qty: 1, weight: 10 },
      { itemId: "bandage", qty: 2, weight: 45 }
    ]
  },
  // v1.6三部曲Tier2 Boss：沿用26.1 getScaledEnemy縮放，tier指定起始強度
  enemy_cyborg_nemesis: {
    id: "enemy_cyborg_nemesis", name: "改造軍團指揮官", icon: "🦾",
    hp: 60, atk: 10, def: 3, expReward: 60, mechanical: true,
    scaling: { hpPerTier: 32, atkPerTier: 3 },
    dropTable: [
      { itemId: "scrap", qty: 5, weight: 20 },
      { itemId: "cyber_hammer", qty: 1, weight: 15 },
      { itemId: "cyber_suit", qty: 1, weight: 15 },
      { itemId: "cyber_pendant", qty: 1, weight: 15 },
      { itemId: "medicine", qty: 2, weight: 35 }
    ]
  },
  // 無限模式後期內容(2026-07-05)：「深淵擴散」戰的招牌敵人，刻意跟enemy_cyborg_nemesis做出數值取捨差異——
  // 高攻低防的玻璃大炮型態(vs指揮官的攻防均衡型)，且不是mechanical(不吃cyber_hammer的機械傷害加成)，
  // 也不在getBossFactionCounterMult的特判名單裡(玩家的流派傷害加成在這裡不會被削弱)，兩隻Boss打法真正不同
  enemy_abyss_herald: {
    id: "enemy_abyss_herald", name: "深淵先驅", icon: "👁️",
    hp: 70, atk: 14, def: 1, expReward: 80,
    scaling: { hpPerTier: 30, atkPerTier: 4 },
    dropTable: [
      { itemId: "scrap", qty: 6, weight: 25 },
      { itemId: "medicine", qty: 2, weight: 30 },
      { itemId: "mind_lens", qty: 1, weight: 10 },
      { itemId: "aero_barometer", qty: 1, weight: 10 }
    ]
  }
};

// 覺醒特質（24.3）：首次升級(1->2)隨機獲得一項永久被動
const AWAKENING_TRAITS = [
  { id: "night_vision", name: "夜視", desc: "夜晚的戰鬥事件遭遇率 -15%", text: "你發現黑暗中的輪廓變得清晰起來——你的雙眼正在適應這個世界的暗面。" },
  { id: "tough_body", name: "強韌體質", desc: "HP上限 +15", hpMaxBonus: 15, text: "一陣灼熱感從胸口擴散到四肢，你感覺自己的身體正變得更加強韌。" },
  { id: "calm", name: "冷靜", desc: "過勞時的HP懲罰由-3降為-1", text: "心跳聲在耳邊放慢了下來，恐慌不再輕易擾亂你的判斷。" },
  { id: "intuition", name: "直覺", desc: "戰鬥掉落非廢料物品的權重 +20%", text: "你開始能「感覺」到哪裡藏著有用的東西，像是第六感覺醒了一樣。" },
  { id: "endurance", name: "耐力者", desc: "體力上限 +1", staminaMaxBonus: 1, text: "長途跋涉後，你的呼吸依然平穩——身體正在學會節省力氣。" },
  { id: "recovery", name: "痊癒體質", desc: "休息時HP額外回復 +5", text: "傷口癒合的速度快得不可思議，你能感覺到體內某種東西在加速修復。" }
];

// 25.3 五大流派技能樹：覺醒時隨機鎖定1個主流派，T1~T4依序解鎖（線性）
const SKILLS_TREE = {
  gaia: {
    name: "蓋亞血脈",
    role: "恢復/荒野反殺",
    tiers: [
      { name: "葉綠素晶格", desc: "每階段自動回復HP上限3%（被動）" },
      { name: "血藤鞭笞", desc: "攻擊附帶15%吸血（主動效果簡化為被動）" },
      { name: "捕食者基因", desc: "SAN低於40時暴擊率+15%（被動）" },
      { name: "萬物復甦", desc: "每局1次，致命傷免死並回復50%HP（傳奇）" }
    ]
  },
  cyber: {
    name: "鋼鐵活化",
    role: "重裝/壓制",
    tiers: [
      { name: "廢鐵裝甲", desc: "防禦+2（簡化為永久護盾值）" },
      { name: "合金外骨骼", desc: "攻擊+1，免疫減速debuff" },
      { name: "電磁暴衝", desc: "對機械系敵人傷害+50%（被動）" },
      { name: "舊世機神·超載", desc: "攻擊力+30%且無視敵方50%防禦（傳奇，簡化為永久生效）" }
    ]
  },
  ocean: {
    name: "洋流寄生",
    role: "閃避/控場",
    tiers: [
      { name: "細胞液化", desc: "物理閃避率+5%（被動）" },
      { name: "酸蝕體液", desc: "敵方防禦-3（簡化為攻擊力+3，主動效果常駐）" },
      { name: "深海重壓", desc: "環境負面傷害（資源歸零HP懲罰）-30%（被動）" },
      { name: "完美水解", desc: "休息時額外回復5%HP上限，免疫流血（傳奇）" }
    ]
  },
  aero: {
    name: "大氣幽魂",
    role: "遠程/反擊",
    tiers: [
      { name: "靜電外殼", desc: "暴擊率+5%（簡化自受遠程攻擊暈眩敵人）" },
      { name: "音波干擾", desc: "夜襲機率-0.05（簡化自全場敵人命中率-15%）" },
      { name: "真空屏障", desc: "免疫遠程流彈額外傷害（被動，flavor）" },
      { name: "雷磁風暴翼", desc: "暴擊倍率提升至2.0倍（傳奇，簡化自閃避反擊雷擊）" }
    ]
  },
  mind: {
    name: "心靈晶格",
    role: "護盾/精神",
    tiers: [
      { name: "水晶稜鏡", desc: "防禦+floor(當前SAN/20)（被動護盾）" },
      { name: "認知偏折", desc: "防禦+1（簡化自扣除目標1點AP）" },
      { name: "思維晶化", desc: "SAN低於40時免疫過勞HP懲罰（被動）" },
      { name: "折射領域", desc: "戰鬥受到傷害-25%（傳奇，簡化自3回合全隊減傷）" }
    ]
  }
};
const FACTION_IDS = ["gaia", "cyber", "ocean", "aero", "mind"];

// 2026-07-04 V3多同伴後勤系統：統一登記表，取代原本state.companion(布林，僅雷恩專用)+
// COMPANION_TASKS(散落在logic.js的3人硬編碼)兩套並存的舊架構。recruitCompanion/dispatchCompanion/
// refreshCompanionUnlocks/companionAssigned(logic.js)都改成遍歷這份清單，之後再新增同伴只需要
// 在這裡加一筆設定，不用再去改散落各處的硬編碼判斷式。
// tasks：可指派的任務清單(不含隱含的"standby"待命)
// taskEffects：{任務名: {效果key: 數值}}，由getCompanionTaskEffect()(logic.js)通用讀取加總，
//   單一同伴同時只能執行一項任務，效果彼此獨立、不互斥
// unlockCondition：解鎖條件，達成後refreshCompanionUnlocks()會自動把該同伴從locked轉為standby
//   （雷恩走劇情事件直接recruitCompanion()解鎖，這裡的unlockCondition固定回傳false，不受自動解鎖影響）
// pos：小屋畫面固定站位(gx,gy)，同伴一律採用不會走動的固定立繪(呼應V3統一渲染，見game.js)
const COMPANIONS_REGISTRY = {
  "雷恩": {
    name: "雷恩", role: "前哨守衛", icon: "🛡️",
    tasks: ["guard"],
    taskEffects: { guard: { raidChanceDelta: -0.3 } },
    unlockCondition: (state) => false, // 走劇情事件(序章/evt_stranger_returns)直接recruitCompanion()解鎖
    pos: { gx: 6, gy: 2 }, color: "#8a9099",
  },
  "艾莉": {
    name: "艾莉", role: "留守生產", icon: "🌿",
    tasks: ["gather", "care"],
    taskEffects: { gather: { autoGather: 1 }, care: { restHealBonus: 5 } },
    // 2026-07-04修正：艾莉原本完全沒有解鎖路徑(recruitCompanion從未被呼叫過，永久卡在locked)，
    // 依V3設計改綁溫室Lv3自動解鎖，理由：她的招牌任務是「採集/照護」，跟溫室(食物生產)主題一致
    unlockCondition: (state) => !!(state.facilities && state.facilities.greenhouse >= 3),
    pos: { gx: 1, gy: 2 }, color: "#6fae73",
  },
  "阿卡": {
    name: "阿卡", role: "血月防禦強化", icon: "💥",
    tasks: ["blast"],
    // 2026-07-04：原本「blast」只有降低夜襲機率，新增血月狂潮戰時防禦加成(呼應V3設計「戰時血月防禦強化」)，
    // 兩個效果並存(平時嚇阻+戰時加固)，不是取代關係
    taskEffects: { blast: { raidChanceDelta: -0.1, bloodMoonDefenseBonus: 0.1 } },
    unlockCondition: (state) => !!(state.facilities && state.facilities.command >= 3),
    pos: { gx: 8, gy: 2 }, color: "#c0392b",
  },
  "老周": {
    name: "老周", role: "製作維修", icon: "🔧",
    tasks: ["craft"],
    taskEffects: { craft: { reforgeDiscountRatio: 0.2 } },
    unlockCondition: (state) => !!(state.flags && state.flags.laozhou_recruited),
    pos: { gx: 3, gy: 4 }, color: "#c9a24b",
  },
  "小雨": {
    name: "小雨", role: "基地後勤", icon: "📦",
    tasks: ["base"],
    taskEffects: { base: { reinforceDiscountRatio: 0.15 } },
    unlockCondition: (state) => !!(state.flags && state.flags.xiaoyu_recruited),
    pos: { gx: 6, gy: 4 }, color: "#5a8ac9",
  },
  "阿海": {
    name: "阿海", role: "隨行遠征加成", icon: "🎒",
    tasks: ["expedition"],
    taskEffects: { expedition: { gatherYieldBonusRatio: 0.2 } },
    unlockCondition: (state) => !!(state.flags && state.flags.ahai_recruited),
    pos: { gx: 1, gy: 4 }, color: "#4bb3a6",
  },
};

// 地點清單（MVP2：地圖探索）。distance: "near"=當輪可直接往返；"far"=需額外消耗1食物+1飲水的「路程成本」
const LOCATIONS = [
  {
    id: "loc_residential", name: "住宅區", icon: "🏠", riskLevel: 1, distance: "near", unlockDay: 1, levelCap: 4,
    anomalyTextPool: [
      "牆壁的壁紙下透出淡淡的螢光紋路，像是建築物有了呼吸。電視機自行開啟，播放著雜訊與細碎低語。",
      "客廳的相框一字排開，每張照片裡的人臉都被一層薄薄的螢光霧氣覆蓋，看不清五官。",
      "廚房水龍頭滴著水，落地時卻沒有聲音，只留下一圈圈逐漸擴散的螢光漣漪。",
      "兒童房的玩具在無人碰觸下自己緩緩轉動，發條聲斷斷續續，像是在等待誰回家。",
      "樓梯扶手上覆著一層極細的石英粉塵，你的手一碰上去，指尖就傳來一陣輕微的刺麻感。"
    ],
    anomalyTextPoolLate: ["曾經令人不安的螢光紋路如今已經淡去大半，這片住宅區彷彿正在緩緩找回原本的平靜。", "你注意到有人在附近留下了簡單的路標，看來這一帶已經有其他倖存者開始活動。", "電視機的雜訊畫面不知何時已經停止，取而代之的是一片死寂——不知該慶幸還是不安。", "牆角的螢光鏽斑幾乎完全褪盡，這座住宅區正一點一點地脫離異變的陰影。", "你在信箱裡發現了一張陌生的字條，寫著簡短的問候——這座城市，似乎真的在慢慢復甦。"],
    lootTable: [
      { itemId: "food_can", qty: 1, weight: 30 },
      { itemId: "water_bottle", qty: 1, weight: 30 },
      { itemId: "scrap", qty: 1, weight: 25 },
      { itemId: "jacket_01", qty: 1, weight: 10 },
      { itemId: "knife_01", qty: 1, weight: 5 }
    ],
    encounterChance: 0.10,
    encounterEnemyIds: ["enemy_walker_weak"]
  },
  {
    id: "loc_park", name: "公園", icon: "🌳", riskLevel: 1, distance: "near", unlockDay: 1, levelCap: 4,
    anomalyTextPool: [
      "枯死的樹根泛著螢光，沿著步道蜿蜒生長。風中傳來細碎的呢喃，像是無數聲音重疊在一起。",
      "生鏽的鞦韆自顧自地前後搖晃，鏈條摩擦聲規律得不像是風造成的。",
      "池塘表面結著一層詭異的薄膜，倒映出的天空顏色跟頭頂上的完全不同。",
      "草地上踩出一圈完美的圓形焦痕，中心插著一根不知從何而來的螢光枯枝。",
      "涼亭的柱子上纏繞著發光的藤蔓，隨著你的靠近微微收縮，像是察覺到了什麼。"
    ],
    anomalyTextPoolLate: ["枯死的樹根不再泛著詭異的光，反而抽出了幾片嫩綠的新芽，倔強地宣告著這裡還沒有真正死去。", "風中那些細碎的呢喃漸漸消散，取而代之的是久違的鳥鳴聲，斷斷續續地在枝頭響起。", "步道旁的長椅上，不知何時多了一束用鐵絲纏成的野花，看得出是有人刻意留下的。", "你注意到有孩子的腳印印在鬆軟的泥土上——這座公園，似乎又開始有人願意帶著孩子來走走了。", "曾經扭曲的樹影漸漸恢復成原本該有的形狀，午後的陽光透過稀疏的枝葉，灑下平靜的光斑。"],
    lootTable: [
      { itemId: "water_bottle", qty: 1, weight: 35 },
      { itemId: "scrap", qty: 1, weight: 35 },
      { itemId: "bandage", qty: 1, weight: 20 },
      { itemId: "pipe_01", qty: 1, weight: 10 }
    ],
    encounterChance: 0.10,
    encounterEnemyIds: ["enemy_walker_weak"]
  },
  {
    id: "loc_gas_station", name: "加油站", icon: "⛽", riskLevel: 2, distance: "near", unlockDay: 1, levelCap: 7,
    anomalyTextPool: [
      "油槽的指示燈詭異地閃爍著綠光，地面滲出的油漬竟微微蠕動，彷彿有生命般朝你的方向靠近。",
      "收銀台後的監視器螢幕不斷重播同一段畫面，畫面裡空無一人，時間戳卻在飛速跳動。",
      "加油機的螢幕顯示著不存在的金額，數字持續攀升，喇叭裡傳出斷斷續續的計價聲。",
      "輪胎堆疊成一座詭異的高塔，最頂端的那顆還在緩緩滾動，卻沒有任何東西推動它。",
      "空氣裡瀰漫著揮發油混著臭氧的氣味，遠處某個角落傳來規律的滴答聲，像是計時器。"
    ],
    anomalyTextPoolLate: ["油槽的指示燈不再詭異地閃爍，穩定地亮著一盞黃燈——像是終於等到有人重新接上了電源。", "地面的油漬早已凝固乾涸，不再有任何蠕動的跡象，踩上去只是普通的一灘髒污。", "你發現收銀台後貼著一張手寫公告：「暫停營業，物資請自取，勿浪費」，字跡工整。", "加油機的螢幕不再顯示亂碼，只是安靜地暗著，像一台單純故障的機器，不再讓人毛骨悚然。", "遮雨棚下堆著幾個整理過的空油桶，顯然有人定期會來這裡巡視、清理。"],
    lootTable: [
      { itemId: "scrap", qty: 2, weight: 45 },
      { itemId: "water_bottle", qty: 1, weight: 25 },
      { itemId: "bandage", qty: 1, weight: 20 },
      { itemId: "pipe_01", qty: 1, weight: 10 }
    ],
    encounterChance: 0.20,
    encounterEnemyIds: ["enemy_walker_weak"]
  },
  {
    id: "loc_store", name: "便利商店", icon: "🏪", riskLevel: 2, distance: "near", unlockDay: 1, levelCap: 7,
    anomalyTextPool: [
      "貨架上的商品標籤全被細小的螢光符文覆蓋，冷凍櫃裡傳出規律的心跳聲，卻找不到任何生物。",
      "收銀機的抽屜自己彈開又關上，裡頭的零錢隨著某種節奏輕輕震動作響。",
      "過期的報紙攤在櫃台上，頭版標題的字跡正緩慢地扭曲重組，變成你看不懂的符號。",
      "自動門對著空無一人的走道反覆開闔，感應器的紅光在昏暗中一閃一閃。",
      "貨架深處傳來包裝袋窸窣的聲響，走近一看卻只剩下滿地散落、還微微發燙的包裝紙。"
    ],
    anomalyTextPoolLate: ["貨架上的螢光符文已經淡得幾乎看不見，商品標籤重新變回普通的印刷字體。", "冷凍櫃裡那陣規律的心跳聲終於停止了，只剩下壓縮機運轉的、平凡無奇的嗡嗡聲。", "你發現貨架被重新整理過一輪，過期商品被集中堆在角落，顯然有人定期會來巡視。", "收銀台上擺著一本簡陋的交換帳本，記錄著這附近倖存者以物易物的往來。", "破碎的落地窗被木板釘得整整齊齊，門口甚至擺了一塊「歡迎自取，請留下需要的紀錄」的牌子。"],
    lootTable: [
      { itemId: "food_can", qty: 1, weight: 35 },
      { itemId: "water_bottle", qty: 1, weight: 35 },
      { itemId: "bandage", qty: 1, weight: 20 },
      { itemId: "jacket_01", qty: 1, weight: 10 }
    ],
    encounterChance: 0.25,
    encounterEnemyIds: ["enemy_walker_weak"]
  },
  {
    id: "loc_school", name: "學校", icon: "🏫", riskLevel: 2, distance: "far", unlockDay: 1, levelCap: 7,
    anomalyTextPool: [
      "教室黑板上寫滿了無人能解的符文公式，課桌椅排列成詭異的同心圓，彷彿曾有什麼在此集會。",
      "走廊盡頭的廣播喇叭斷斷續續放送著早已停辦的朝會口令，聲音因潮濕而扭曲變調。",
      "置物櫃一排排自動開啟又關上，裡頭的課本書頁全被螢光墨跡填滿，寫著看不懂的字。",
      "操場中央的旗杆頂端纏著一團發光的絲線，隨風擺動時發出細微如耳語的聲響。",
      "音樂教室的鋼琴無人彈奏卻自己發出斷續的音符，琴鍵上覆著一層淡淡的螢光指印。"
    ],
    anomalyTextPoolLate: ["黑板上的符文公式已經被擦去大半，取而代之的是幾行用粉筆寫下的、稚嫩的塗鴉。", "教室裡的課桌椅被重新排成尋常的行列，那種令人不安的同心圓早已不復存在。", "你在走廊盡頭發現幾幅重新掛起的兒童畫作，色彩鮮豔，看得出是最近才貼上去的。", "操場上的雜草被修剪過一輪，隱約能看出曾經跑道的痕跡，像是有人試著找回一點日常。", "圖書室的窗戶被小心地清理乾淨，陽光難得能完整地灑進這座曾經令人不安的校園。"],
    lootTable: [
      { itemId: "food_can", qty: 2, weight: 30 },
      { itemId: "bandage", qty: 1, weight: 30 },
      { itemId: "scrap", qty: 2, weight: 25 },
      { itemId: "bat_01", qty: 1, weight: 15 }
    ],
    encounterChance: 0.30,
    encounterEnemyIds: ["enemy_walker_weak"]
  },
  {
    id: "loc_hospital", name: "醫院藥局", icon: "🏥", riskLevel: 3, distance: "far", unlockDay: 1, levelCap: 10,
    anomalyTextPool: [
      "病歷櫃裡的紙張全被發光的石英粉塵覆蓋，每翻動一頁，耳邊就傳來一句破碎的呢喃。",
      "病床的心電監護儀螢幕還亮著，顯示著早已不可能存在的心跳曲線，規律地起伏。",
      "藥局的架子上，藥瓶標籤全被侵蝕成模糊的螢光斑點，瓶身卻異常地乾淨完整。",
      "走廊盡頭的手術燈無故亮起又熄滅，地板上拖著一道尚未乾涸的螢光痕跡。",
      "太平間的抽屜一格格微微震動，金屬碰撞聲在寂靜的走廊裡格外清晰刺耳。"
    ],
    anomalyTextPoolLate: ["病歷櫃上的石英粉塵已經被拂去大半，翻動紙頁時，耳邊那些破碎的呢喃聲也跟著消失了。", "藥局的貨架被重新分類擺放，過期藥品跟堪用藥品分開放置，顯然有人接手整理過。", "你在櫃檯發現一份手寫的用藥須知，字跡認真，看得出寫的人希望幫助後來的人。", "走廊盡頭的警示燈已經徹底熄滅，取而代之的是幾盞用電池供電的簡易照明燈。", "候診區的椅子被擦拭得乾乾淨淨，一旁甚至擺著一小盆綠色植物，透著一絲久違的生活感。"],
    lootTable: [
      { itemId: "bandage", qty: 2, weight: 40 },
      { itemId: "bandage", qty: 1, weight: 30 },
      { itemId: "scrap", qty: 2, weight: 20 },
      { itemId: "vest_01", qty: 1, weight: 10 }
    ],
    encounterChance: 0.35,
    encounterEnemyIds: ["enemy_walker_weak", "enemy_walker_armed"]
  },
  {
    id: "loc_factory", name: "廢棄工廠", icon: "🏭", riskLevel: 3, distance: "far", unlockDay: 1, levelCap: 10,
    anomalyTextPool: [
      "斷電的生產線上，機械臂仍規律地揮動著，金屬表面爬滿發光的菌絲紋路，彷彿被某種意識重新啟動。",
      "輸送帶無聲地緩緩轉動，上頭載著早已鏽蝕的零件，每一件都覆著一層薄薄的螢光鏽斑。",
      "高聳的儲料倉頂端傳來規律的金屬敲擊聲，像是有什麼東西正一下一下地想敲開出口。",
      "控制室的儀表板全數失靈，指針卻同步指向同一個方向，隨著某種頻率微微顫動。",
      "廠房深處的通風管道傳出低沉的嗡鳴，管壁縫隙滲出的螢光霧氣正緩緩往外擴散。"
    ],
    anomalyTextPoolLate: ["生產線上的機械臂終於停止了那陣詭異的自主揮動，靜靜地懸在半空，像是終於斷了電。", "金屬表面的發光菌絲紋路已經乾枯剝落，露出底下原本鏽蝕但平凡的鋼鐵本色。", "你發現廠房一角被清理出一塊空地，堆著幾件半成品，顯然有人試著重啟部分產線。", "廠房裡的空氣不再瀰漫著那股說不出的異樣氣味，只剩下鐵鏽與機油混雜的尋常味道。", "牆上貼著一張新的公告，寫著簡單的分工表——這座廢棄工廠，似乎正在被人重新利用。"],
    lootTable: [
      { itemId: "scrap", qty: 3, weight: 40 },
      { itemId: "pipe_01", qty: 1, weight: 20 },
      { itemId: "knife_01", qty: 1, weight: 15 },
      { itemId: "bandage", qty: 1, weight: 25 }
    ],
    encounterChance: 0.40,
    encounterEnemyIds: ["enemy_walker_weak", "enemy_walker_armed"]
  },
  {
    id: "loc_warehouse", name: "倉庫", icon: "🏚️", riskLevel: 4, distance: "far", unlockDay: 1, levelCap: 13,
    anomalyTextPool: [
      "貨架在黑暗中投下不該存在的影子，木箱縫隙滲出螢光綠霧氣，緩緩在地面匯聚成奇異的圖形。",
      "成堆的貨箱被人整齊地排成一道迷宮般的通道，盡頭卻只有一面滲著螢光水漬的牆。",
      "生鏽的起重機吊臂無風自動，鐵鍊碰撞的聲響在挑高的倉庫裡迴盪，久久不散。",
      "角落堆疊的紙箱裡傳出細微的窸窣聲，你靠近時聲音倏地停止，彷彿在刻意屏息。",
      "天花板的燈管一排排接連熄滅又亮起，光影交錯間，貨架的陰影似乎微微移動了位置。"
    ],
    anomalyTextPoolLate: ["貨架投下的影子恢復成該有的形狀，不再有那些扭曲詭異的輪廓潛伏在角落。", "木箱縫隙滲出的螢光綠霧氣已經徹底散去，倉庫裡只剩下灰塵飄浮在光束中的尋常景象。", "你發現貨架被重新整理過，物資依類別分區堆放，還貼上了簡單的標籤。", "倉庫深處多了一盞用發電機供電的燈，雖然昏暗，但足以驅散曾經的死寂與壓迫感。", "地面上的奇異圖形已經被清掃乾淨，只留下一些拖拉重物留下的、再普通不過的痕跡。"],
    lootTable: [
      { itemId: "scrap", qty: 3, weight: 35 },
      { itemId: "bat_01", qty: 1, weight: 20 },
      { itemId: "machete_01", qty: 1, weight: 10 },
      { itemId: "vest_01", qty: 1, weight: 10 },
      { itemId: "bandage", qty: 2, weight: 25 }
    ],
    encounterChance: 0.45,
    encounterEnemyIds: ["enemy_walker_armed", "enemy_walker_brute"]
  },
  {
    id: "loc_military", name: "軍警設施", icon: "🪖", riskLevel: 4, distance: "far", unlockDay: 1, levelCap: 13,
    anomalyTextPool: [
      "軍用終端機的螢幕無故亮起，顯示著無法辨識的座標與倒數，警報燈光泛著不祥的暗紅色。",
      "鐵絲網外圍的警戒燈規律閃爍，掃描光束掠過地面時，能看見一層極淡的螢光殘留反光。",
      "彈藥庫的重型門扉半掩著，門縫裡滲出的冷氣混著一絲若有似無、規律起伏的機械運轉聲。",
      "監控室的螢幕牆全數轉為雜訊畫面，唯獨一格仍顯示著早已無人的走廊，畫面卻在緩緩位移。",
      "廢棄的裝甲車殘骸旁散落著扭曲的金屬碎片，表面泛著一層詭異的暗紅色螢光紋路。"
    ],
    anomalyTextPoolLate: ["軍用終端機的螢幕終於顯示出正常的待機畫面，不再跳出那些無法辨識的座標與倒數。", "警報燈的暗紅色光芒漸漸轉為平穩的待機藍光，這座設施似乎終於安靜了下來。", "你發現武器庫的門被重新上鎖，門上貼著一張手寫的清點清單，顯然有組織接管了這裡。", "走廊裡的緊急照明恢復了正常的白光，不再是那種讓人心裡發毛的閃爍紅光。", "指揮室的地圖牆上，多了幾面代表「已收復」的旗幟標記，看得出這裡正被重新利用。"],
    lootTable: [
      { itemId: "machete_01", qty: 1, weight: 15 },
      { itemId: "pistol_01", qty: 1, weight: 5 },
      { itemId: "scrap", qty: 3, weight: 40 },
      { itemId: "bandage", qty: 2, weight: 40 }
    ],
    encounterChance: 0.50,
    encounterEnemyIds: ["enemy_walker_armed", "enemy_walker_brute"]
  },
  {
    id: "loc_camp", name: "倖存者營地", icon: "⛺", riskLevel: 1, distance: "near", unlockDay: 10, levelCap: 4,
    anomalyTextPool: [
      "篝火的火光泛著詭異的螢光綠，倖存者們的低語聲中，偶爾夾雜著幾句不屬於人類語言的字句。",
      "帳篷外掛著幾串風鈴般的金屬零件，隨風輕響，聲音卻在你靠近時忽然整齊地安靜下來。",
      "有人在木板上刻下密密麻麻的正字記號，數到最後一排卻戛然而止，留下一道深深的刀痕。",
      "曬衣繩上晾著的衣物在無風時輕輕晃動，其中一件的袖口沾著一小片乾涸的螢光粉塵。",
      "營地邊界插著一圈簡陋的警戒旗，旗面圖案是手繪的符號，隱約與地脈異變的紋路相似。"
    ],
    anomalyTextPoolLate: ["篝火的火光已經恢復成溫暖的橘紅色，不再泛著那種令人不安的螢光綠。", "倖存者們的交談聲重新變得清晰可辨，那些不屬於人類語言的字句已經徹底消失。", "你注意到營地邊緣多搭了幾頂帳篷，看來願意來這裡落腳的倖存者又更多了一些。", "篝火旁掛著曬乾的衣物，飄著淡淡的煙燻味——這種再平凡不過的生活氣息，久違地回來了。", "有人在營地入口立了一塊木牌，寫著「歡迎迷路的人」，字跡雖然歪斜，卻透著溫暖。"],
    lootTable: [
      { itemId: "food_can", qty: 1, weight: 30 },
      { itemId: "water_bottle", qty: 1, weight: 30 },
      { itemId: "bandage", qty: 1, weight: 25 },
      { itemId: "scrap", qty: 2, weight: 15 }
    ],
    encounterChance: 0.05,
    encounterEnemyIds: ["enemy_walker_weak"]
  },
  {
    id: "loc_ruins_lab", name: "舊世研究所遺址", icon: "🧪", riskLevel: 5, distance: "far", unlockDay: 20, levelCap: 13,
    anomalyTextPool: [
      "實驗艙內殘留的培養液仍在發光循環，牆上監視器反覆播放著早已停止運作的研究員最後身影。",
      "走廊牆面的警示燈規律地明滅，廣播系統斷續播放著一段聽不清楚的倒數指令。",
      "培養皿裡的樣本早已乾涸，卻仍隱隱透出脈動般的螢光，彷彿某種節律尚未停止。",
      "資料室的檔案櫃全數敞開，紙張散落一地，每一頁邊緣都燒著一圈焦黑的螢光痕跡。",
      "地下樓層的電梯門反覆開闔，樓層顯示器停留在一個不存在的負樓層數字上。"
    ],
    anomalyTextPoolLate: ["實驗艙裡的培養液已經徹底沉澱，不再發光循環，安靜得像一座真正廢棄的設施。", "牆上的監視器一台接一台熄滅了，那些反覆播放的畫面終於停止，只剩下一片黑屏。", "你發現有人在研究所入口貼了封條，寫著「危險已解除，僅供記錄，勿擅動」。", "走廊裡瀰漫的消毒水氣味已經淡去，取而代之的是塵封已久的、單純的霉味。", "某間辦公室的桌上，多了一份手寫的調查報告，似乎有人試著釐清這裡曾經發生過什麼。"],
    lootTable: [
      { itemId: "scrap", qty: 4, weight: 30 },
      { itemId: "ocean_pistol", qty: 1, weight: 8 },
      { itemId: "aero_crossbow", qty: 1, weight: 8 },
      { itemId: "cyber_suit", qty: 1, weight: 6 },
      { itemId: "ocean_mace", qty: 1, weight: 6 },
      { itemId: "bandage", qty: 2, weight: 20 }
    ],
    encounterChance: 0.55,
    encounterEnemyIds: ["enemy_walker_brute", "enemy_walker_armed"]
  },
  // v1.6新增遠征地點（SA 34 / v1.6四）
  {
    id: "loc_sunken_subway", name: "淹沒的靈能地鐵站", icon: "🚇", riskLevel: 4, distance: "far", unlockDay: 20, unlockFlag: "bloodmoon_breach_1", levelCap: 13,
    anomalyTextPool: [
      "長滿發光地脈菌絲的列車靜止在軌道上。空氣中瀰漫著高濃度的發光石英粉塵，隱約能聽到無數人在耳邊低語。",
      "月台的電子看板持續跳動著早已停駛的班次資訊，積水中倒映的燈光顏色詭異地扭曲著。",
      "隧道深處傳來規律的金屬摩擦聲，像是列車仍在行駛，但軌道上什麼也沒有。",
      "剪票口的閘門一開一闔，卻沒有任何人通過，感應燈規律地亮起又熄滅。",
      "積水沒過腳踝，水面下隱約可見一層蠕動的螢光菌絲，正緩緩朝你所站的方向蔓延。"
    ],
    anomalyTextPoolLate: ["列車車廂上的發光菌絲已經大片剝落，露出底下鏽蝕卻不再詭異的車體本色。", "空氣中的石英粉塵濃度明顯降低，那些低語聲逐漸模糊，最終消散在寂靜之中。", "你發現月台邊緣被人用繩索圍了起來，掛著簡易的警示牌，提醒後來者積水深淺。", "積水的顏色從詭異的螢光漸漸轉回渾濁的黃褐色，雖然依舊不宜久留，卻不再滲人。", "隧道深處隱約傳來規律的抽水聲——似乎有人正嘗試著，一點一點把這裡的水排乾。"],
    lootTable: [
      { itemId: "mind_greatsword", qty: 1, weight: 5 },
      { itemId: "mind_eye", qty: 1, weight: 40 },
      { itemId: "scrap", qty: 3, weight: 55 }
    ],
    encounterChance: 0.55,
    encounterEnemyIds: ["enemy_walker_brute", "enemy_walker_armed"]
  },
  {
    id: "loc_cyber_factory", name: "舊世重工業自動化機廠", icon: "🏭", riskLevel: 4, distance: "far", unlockDay: 20, levelCap: 13,
    anomalyTextPool: [
      "巨大的機械手臂在斷電的情況下依然在瘋狂揮舞，與活化組織融合成扭曲的鋼鐵巨怪，散發著暗紅色的微光。",
      "生產線深處傳來規律的液壓聲，管線接口處滲出的暗紅色液體正緩緩沿著鋼架往下滴落。",
      "巨型齒輪組無聲地空轉著，齒縫間卡著早已風化的有機組織殘骸，隨轉動微微顫動。",
      "控制中樞的主螢幕反覆重播一段扭曲的啟動程序，語音合成器發出斷斷續續的雜訊。",
      "廠房頂端懸吊的鋼纜隨著某種頻率規律擺盪，纜線接點處爆出細碎的暗紅色電光。"
    ],
    anomalyTextPoolLate: ["那些瘋狂揮舞的機械手臂終於靜止下來，融合的活化組織也逐漸乾枯剝落，只剩鋼鐵骨架。", "暗紅色的微光已經徹底熄滅，廠房裡只剩下斷電後該有的、徹底的黑暗與寂靜。", "你發現有人在控制室重新接上了一小段電路，幾盞指示燈規律地亮著，不再瘋狂閃爍。", "地面上凝固的暗色殘留物被沖刷過一輪，雖然痕跡仍在，卻不再散發那股不祥的氣息。", "廠房外牆多了一行噴漆字跡：「已清理，安全通行」——看來這裡已經有人來清過場了。"],
    lootTable: [
      { itemId: "cyber_hammer", qty: 1, weight: 15 },
      { itemId: "scrap", qty: 4, weight: 55 },
      { itemId: "scrap_plating", qty: 1, weight: 30 }
    ],
    encounterChance: 0.60,
    encounterEnemyIds: ["enemy_walker_armed", "enemy_walker_brute"]
  },
  {
    id: "loc_flooded_hospital", name: "洋流寄生積水醫院", icon: "🏥", riskLevel: 3, distance: "far", unlockDay: 15, levelCap: 10,
    anomalyTextPool: [
      "地下水滲出帶有強烈金屬味的酸性積水，醫院的病床和牆壁長滿了滑膩的深海寄生蛭。",
      "積水中漂浮著早已泡發的病歷紙張，字跡暈染成一片模糊的青綠色斑塊。",
      "天花板持續滴落帶著鹹味的水珠，水痕蔓延處的牆面爬滿細小、微微蠕動的寄生蟲卵。",
      "病房的窗簾早已被泡爛，透過破洞能看見外頭積水中緩緩游動的模糊黑影。",
      "護理站的呼叫鈴一盞盞亮起又熄滅，積水倒映的燈光裡似乎藏著什麼在窺視你。"
    ],
    anomalyTextPoolLate: ["地下水的金屬味已經淡了許多，積水也不再帶著那股灼人的酸性氣息。", "病床與牆壁上的深海寄生蛭已經大片枯萎脫落，只留下一層乾涸的黏液痕跡。", "你發現走廊盡頭堆著幾具抽水設備，顯然有人正試著把這座醫院的積水一點一點排乾。", "水面不再滲出詭異的光澤，只剩下渾濁卻平凡的死水，踩下去也不再有黏膩的觸感。", "某間病房的門上貼著「已清理」的字條，看得出有人一間一間地在整頓這座醫院。"],
    lootTable: [
      { itemId: "ocean_mace", qty: 1, weight: 15 },
      { itemId: "medicine", qty: 2, weight: 50 },
      { itemId: "scrap", qty: 2, weight: 35 }
    ],
    encounterChance: 0.50,
    encounterEnemyIds: ["enemy_walker_armed", "enemy_walker_weak"]
  },
  {
    id: "loc_aero_broadcasting", name: "大氣高頻廣播電塔", icon: "📡", riskLevel: 3, distance: "far", unlockDay: 15, levelCap: 10,
    anomalyTextPool: [
      "低壓濃霧伴隨劇烈的靜電風暴，電塔周圍的廢棄車輛和鐵皮竟如同失去重力般在空中緩慢懸浮。",
      "電塔基座的控制面板持續發出高頻嗶聲，指針在錶盤上瘋狂繞圈，卻沒有任何規律可循。",
      "空氣中漂浮著細小的金屬碎屑，它們並非墜落，而是緩緩朝電塔頂端匯聚而去。",
      "廣播天線傳來陣陣靜電雜音，偶爾夾雜著清晰得不自然的人聲片段，聽不出內容。",
      "腳下的地面傳來輕微的震動，抬頭一看，頭頂的雲層正以不自然的速度緩緩旋轉。"
    ],
    anomalyTextPoolLate: ["那些懸浮在半空的車輛殘骸已經緩緩落回地面，重力似乎終於找回了該有的秩序。", "濃霧與靜電風暴明顯減弱，電塔周圍的空氣難得地恢復了平靜，只剩微弱的電流聲。", "你發現電塔基座被重新接上了纜線，儀表板上的指針規律地擺動著，不再瘋狂亂跳。", "天空的雲層不再翻湧扭曲，偶爾甚至能看見幾縷難得的陽光穿透下來。", "電塔控制室的門上貼著一張手寫紙條：「訊號已穩定，勿隨意觸碰設備」。"],
    lootTable: [
      { itemId: "aero_crossbow", qty: 1, weight: 15 },
      { itemId: "ammo", qty: 5, weight: 50 },
      { itemId: "scrap", qty: 2, weight: 35 }
    ],
    encounterChance: 0.50,
    encounterEnemyIds: ["enemy_walker_armed", "enemy_walker_weak"]
  },
  // 2026-07-01新增：6個新地點，補足近距離早期地點的稀缺(原本近距離只有住宅區/公園/加油站/便利商店)，
  // 並補上蓋亞流派專屬地點(原本蓋亞裝備完全沒有對應掉落地點)，以及ruins_lab以外的終局地點變化
  {
    id: "loc_parking_garage", name: "廢棄立體停車場", icon: "🅿️", riskLevel: 2, distance: "near", unlockDay: 1, levelCap: 7,
    anomalyTextPool: [
      "層層疊起的停車格空空蕩蕩，只剩幾輛鏽蝕的車殼，車窗上凝結的水氣勾勒出詭異的螺旋紋路。",
      "電梯井傳來規律的鋼纜摩擦聲，樓層顯示燈在無人按動下一層層往上跳動，卻始終沒有電梯抵達。",
      "地下樓層的排水溝渠泛著微弱螢光，緩緩流動的積水裡，隱約能看見反射出不屬於這裡的光影。",
      "收費機的螢幕反覆閃現同一組車牌號碼，喇叭裡傳出斷斷續續的提示音，卻辨識不出語意。",
      "牆面的方向指標箭頭全數指向同一個方向——通往地下最深的樓層，油漆邊緣還滲著淡淡螢光。"
    ],
    anomalyTextPoolLate: ["車窗上凝結的水氣不再勾勒出詭異的螺旋紋路，只剩下普通霧氣該有的模糊水痕。", "你發現有幾輛車殼被清理過，車內雜物被整齊地搬到一旁，顯然有人來這裡翻找過。", "樓層之間的指示牌被重新擦拭乾淨，雖然褪色，卻讓人不再有迷失方向的不安感。", "停車場深處多了幾個用粉筆畫的標記，像是有人在規劃著把這裡當成臨時的中繼站。", "空蕩的停車格裡，陽光罕見地能直射到底層，驅散了大半原本揮之不去的陰暗感。"],
    lootTable: [
      { itemId: "scrap", qty: 2, weight: 35 },
      { itemId: "crowbar_01", qty: 1, weight: 15 },
      { itemId: "bandage", qty: 1, weight: 25 },
      { itemId: "water_bottle", qty: 1, weight: 25 }
    ],
    encounterChance: 0.25,
    encounterEnemyIds: ["enemy_walker_weak", "enemy_walker_armed"]
  },
  {
    id: "loc_flea_market", name: "黑市跳蚤市場", icon: "🏮", riskLevel: 1, distance: "near", unlockDay: 3, levelCap: 4,
    anomalyTextPool: [
      "攤位上的商品雜亂堆疊，價格標籤全用不明符號書寫，攤主早已不知去向，只留下滿地雜貨。",
      "布棚頂端垂掛的燈籠無風自轉，光線忽明忽暗地投射在攤位上，映出一地扭曲晃動的影子。",
      "秤台上的砝碼自己緩緩移動，指針停在一個誰也沒放上東西的空盤上，數字卻持續跳動。",
      "空氣中混雜著香料與鐵鏽的氣味，攤位間的走道異常安靜，只剩風吹動布幔的窸窣聲。",
      "角落一張折疊桌上擺著整齊的交易紀錄本，最後一頁的字跡愈寫愈潦草，戛然而止。"
    ],
    anomalyTextPoolLate: ["攤位上的標籤重新換成了看得懂的手寫價格，不再是那些不明符號。", "你發現原本消失的攤主似乎回來了——至少有幾個攤位重新掛上了「營業中」的牌子。", "雜亂堆疊的商品被重新分類擺放，甚至有了簡易的貨架，像個真正的市集。", "空氣裡少了那股說不清的詭異氣息，取而代之的是煙燻食物與舊物混雜的、熱鬧的氣味。", "你聽見討價還價的聲音此起彼落——這座黑市，似乎正慢慢找回它原本該有的喧囂。"],
    lootTable: [
      { itemId: "scrap", qty: 2, weight: 30 },
      { itemId: "food_can", qty: 1, weight: 30 },
      { itemId: "merchant_token", qty: 1, weight: 8 },
      { itemId: "water_bottle", qty: 1, weight: 32 }
    ],
    encounterChance: 0.10,
    encounterEnemyIds: ["enemy_walker_weak"]
  },
  {
    id: "loc_farmstead", name: "廢棄農莊", icon: "🌾", riskLevel: 2, distance: "far", unlockDay: 5, levelCap: 7,
    anomalyTextPool: [
      "穀倉裡堆積的乾草泛著淡淡螢光，倉頂破洞灑下的光束中，浮塵緩緩懸浮，彷彿失去了重力。",
      "田埂間的作物早已枯死，唯獨幾株頑強地存活下來，葉片邊緣透著不自然的翠綠光澤。",
      "生鏽的風車扇葉無風自轉，吱呀聲規律得像是某種計時裝置，久久沒有停下的跡象。",
      "水井深處傳來低沉的回聲，探頭往下看時，水面竟隱約倒映著與頭頂不同的天色。",
      "曬穀場上散落著半成型的稻草人，其中一個的姿勢與其他幾個明顯不同，像是曾經動過。"
    ],
    anomalyTextPoolLate: ["穀倉裡的乾草不再泛著那層淡淡螢光，浮塵也乖乖地隨著光束緩緩落下，不再失重懸浮。", "你發現穀倉一角被重新整理過，堆著幾綑捆好的乾草，顯然有人開始在這裡打理農務。", "破損的倉頂被簡單地用鐵皮修補起來，不再任由風雨灌入。", "農莊外圍的雜草地裡，冒出了幾株看起來像是刻意種下的作物，長勢意外地不錯。", "你聞到一股淡淡的柴火與泥土氣息——這座廢棄農莊，似乎又重新有了生活的痕跡。"],
    lootTable: [
      { itemId: "food_can", qty: 2, weight: 35 },
      { itemId: "gaia_spore_dart", qty: 1, weight: 10 },
      { itemId: "scrap", qty: 2, weight: 30 },
      { itemId: "water_bottle", qty: 1, weight: 25 },
      { itemId: "seed_mutant_berry", qty: 1, weight: 8 }, // 農場區(2026-07-02)：稀有種子，比照gaia_spore_dart的權重量級
      { itemId: "mutant_hen_token", qty: 1, weight: 8 } // 養殖區(2026-07-02)：稀有動物，同一權重量級
    ],
    encounterChance: 0.30,
    encounterEnemyIds: ["enemy_walker_weak", "enemy_walker_armed"]
  },
  {
    id: "loc_greenhouse_ruins", name: "蓋亞靈能溫室遺跡", icon: "🪴", riskLevel: 3, distance: "far", unlockDay: 8, levelCap: 10,
    anomalyTextPool: [
      "破碎的玻璃穹頂下，藤蔓早已攀滿整座溫室骨架，葉脈間流動著肉眼可見的螢光汁液。",
      "灌溉系統的水管仍規律地滴水，落地處的青苔以肉眼可見的速度緩緩擴張蔓延。",
      "培育架上的植株互相纏繞成一張巨大的網，中心處隱約傳出類似心跳般的搏動聲。",
      "空氣濕熱得不尋常，混雜著植物腐敗與甜膩花香的氣味，讓人分不清是生機還是危險。",
      "溫室深處的地面裂開一道縫隙，根系從裂縫中探出，正緩緩朝著溫熱的方向蠕動延伸。"
    ],
    anomalyTextPoolLate: ["藤蔓不再瘋狂蔓延，反而呈現出一種井然有序的生長姿態，彷彿被什麼力量溫柔地馴服了。", "溫室深處的搏動聲變得平緩而規律，像是心跳終於找回了正常的節奏。", "你注意到有人開始在這裡整理出一小塊真正的菜圃，混在原本的異變植物之間。", "空氣中植物腐敗與甜膩花香的氣味淡了許多，取而代之的是一股清新的泥土氣息。", "破碎的玻璃穹頂下，陽光難得能完整地灑落進來，不再全被藤蔓遮蔽。"],
    lootTable: [
      { itemId: "gaia_whip", qty: 1, weight: 10 },
      { itemId: "gaia_armor", qty: 1, weight: 10 },
      { itemId: "gaia_seed_pouch", qty: 1, weight: 8 },
      { itemId: "blueprint_mutant_lamp", qty: 1, weight: 8 },
      { itemId: "yard_gaia_totem", qty: 1, weight: 8 },
      { itemId: "scrap", qty: 2, weight: 40 },
      { itemId: "food_can", qty: 1, weight: 32 }
    ],
    encounterChance: 0.35,
    encounterEnemyIds: ["enemy_walker_armed", "enemy_walker_weak"]
  },
  {
    id: "loc_church", name: "傾頹的教堂", icon: "⛪", riskLevel: 3, distance: "far", unlockDay: 12, levelCap: 10,
    anomalyTextPool: [
      "彩繪玻璃大半碎裂，殘存的碎片仍持續折射出不屬於任何光源的螢光色斑，灑落一地。",
      "管風琴無人彈奏卻自行發出低沉的和聲，音符斷斷續續，像是被什麼東西哽住了喉嚨。",
      "祭壇上的燭火早已熄滅，燭芯卻仍冒著一縷若有似無的青煙，久久不曾真正散去。",
      "長椅整齊地排列著，唯獨最前排的一張微微傾斜，彷彿曾有什麼重物長時間壓在上頭。",
      "鐘樓的大鐘無人敲擊卻偶爾自鳴，聲音悶啞而扭曲，迴盪在空蕩的殿堂裡久久不散。"
    ],
    anomalyTextPoolLate: ["彩繪玻璃的螢光色斑不再刺眼，反而在陽光下折射出近乎溫柔的光暈。", "管風琴的低沉和聲已經停止，教堂裡難得地只剩下風聲穿過殿堂的聲音。", "你發現長椅上多了幾束新鮮的野花，顯然有人開始把這裡當成悼念的場所。", "鐘樓的大鐘依然偶爾自鳴，但聲音已經不再悶啞扭曲，反而透著一絲清亮。", "祭壇上的燭火不知何時被重新點燃，昏黃的光暈為這座殿堂添了幾分久違的溫度。"],
    lootTable: [
      { itemId: "mind_lens", qty: 1, weight: 10 },
      { itemId: "mind_fork", qty: 1, weight: 6 },
      { itemId: "bandage", qty: 2, weight: 35 },
      { itemId: "scrap", qty: 2, weight: 49 }
    ],
    encounterChance: 0.40,
    encounterEnemyIds: ["enemy_walker_armed", "enemy_walker_weak"]
  },
  {
    id: "loc_bunker", name: "深埋地下避難所", icon: "🚪", riskLevel: 5, distance: "far", unlockDay: 25, levelCap: 13,
    anomalyTextPool: [
      "厚重的氣密門半掩著，門後的長廊燈光規律地明滅，牆上的輻射警示標誌泛著暗紅微光。",
      "生活艙室裡的個人物品被整齊地留在原處，床鋪甚至還維持著被掀開的樣子，彷彿主人隨時會回來。",
      "中央控制室的主機仍在運轉，螢幕上跑著早已無人閱讀的日誌紀錄，數字持續累加。",
      "通風系統傳出低頻的嗡鳴，混雜著一絲若有似無的金屬敲擊聲，從更深處的樓層傳來。",
      "儲藏室的門上被人用尖銳物刻下密密麻麻的劃痕，一排排數到最後戛然而止，力道異常深。"
    ],
    anomalyTextPoolLate: ["曾經令人窒息的輻射警示燈已經熄滅大半，走廊裡的空氣也不再那麼壓抑。", "中央控制室的主機日誌停止了無意義的累加，螢幕上顯示著一行新的訊息：「系統已由外部接管」。", "你發現避難所深處多了幾個新的補給箱，顯然已經有其他組織開始整理這裡。", "通風系統的低頻嗡鳴變得規律而穩定，不再像過去那樣充滿威脅感。", "儲藏室門上的劃痕依舊，但旁邊多了一行新刻的字：「這裡安全了，謝謝你」。"],
    lootTable: [
      { itemId: "cyber_drone_arm", qty: 1, weight: 6 },
      { itemId: "ocean_harpoon", qty: 1, weight: 6 },
      { itemId: "aero_barometer", qty: 1, weight: 8 },
      { itemId: "scrap", qty: 4, weight: 45 },
      { itemId: "bandage", qty: 2, weight: 35 }
    ],
    encounterChance: 0.60,
    encounterEnemyIds: ["enemy_walker_brute", "enemy_walker_armed"]
  }
];

const EVENTS = [
  {
    id: "evt_quiet_day", title: "平靜的時刻",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 30,
    text: "今天沒有發生什麼大事。陽光（或月光）斜斜地照進據點，空氣中懸浮的細塵泛著一絲若有若無的螢光，緩緩飄著。你靠著牆坐了一會兒，聽著自己的呼吸聲——在這個世界，「無聊」反而是種奢侈。",
    textPool: [
      "今天沒有發生什麼大事。陽光（或月光）斜斜地照進據點，空氣中懸浮的細塵泛著一絲若有若無的螢光，緩緩飄著。你靠著牆坐了一會兒，聽著自己的呼吸聲——在這個世界，「無聊」反而是種奢侈。",
      "你花了一整段時間整理背包，把每件物品按用途重新排列。遠處傳來地脈活化特有的低頻嗡鳴，規律得幾乎像背景音樂——意外地讓緊繃的神經鬆了下來，至少今天，一切都在自己的掌控之中。",
      "遠處偶爾傳來幾聲不知名的聲響，混著一絲說不清楚的細碎呢喃，但都沒有靠近。你坐在角落，望著牆上斑駁的痕跡發呆，腦中一片空白，時間就這樣靜靜地流過。",
      "你翻出隨身攜帶的小刀，慢慢地磨著早已生鏽的刀刃。金屬摩擦的聲音規律而單調，像是某種儀式，讓你暫時忘記外頭那個會自己發光的世界。",
      "難得的好天氣。你找了個能曬到光的角落坐下，閉上眼睛，感受久違的溫暖灑在臉上——連空氣裡那層淡淡的石英粉塵味，此刻聞起來都不算討厭。這樣的片刻，你想盡量多留一會兒。",
      "你檢查了一遍隨身物資，又把破損的衣物縫補了幾針。動作不快，但每完成一件小事，心裡就踏實一分，外頭那些扭曲的雜音，暫時都被你關在門外。",
      "整個白天（或夜晚）安靜得有些不真實。你坐在原地，聽著風穿過縫隙的聲音，偶爾夾雜一絲分不清是不是幻聽的低語，思緒漫無目的地飄著，沒有特別想到什麼。",
      "你靠在牆邊，慢慢嚼著一小塊乾糧，細細品味著這份難得的寧靜。在這個世界裡，能安穩地吃完一餐、不被任何詭異的動靜打斷，已經是值得感激的事。"
    ],
    options: []
  },
  {
    id: "evt_noise_outside", title: "窗外的聲響",
    minDay: 1, maxDay: null, phase: ["night"], weight: 15,
    text: "窗外突然傳來「咚——咚——」的拖行聲，混雜著一陣低頻嗡鳴，像是某種扭曲的呻吟，一步一步，似乎正朝著據點的方向逼近。你的心跳聲在寂靜中顯得格外清楚。",
    textPool: [
      "窗外突然傳來「咚——咚——」的拖行聲，混雜著一陣低頻嗡鳴，像是某種扭曲的呻吟，一步一步，似乎正朝著據點的方向逼近。你的心跳聲在寂靜中顯得格外清楚。",
      "一陣低沉的呻吟聲從牆外傳來，斷斷續續，尾音帶著一絲不屬於人類的顫音，伴隨著某種重物被拖過地面的悶響。你屏住呼吸，豎起耳朵分辨聲音的方向。",
      "遠處傳來一聲玻璃碎裂的聲響，緊接著是雜亂的腳步聲，由遠而近，又似乎在某處停了下來。寂靜中，每一個聲響都被放大數倍，連帶著一絲說不出的靜電感爬上後頸。",
      "屋頂傳來輕微的「喀、喀」聲，像是有什麼東西正緩慢地爬過鐵皮，爪痕劃過的地方隱約留下一道轉瞬即逝的螢光。你抬頭盯著天花板，動也不敢動。",
      "門外傳來一陣若有似無的低語聲，分不清是風聲還是真的有什麼在說話——那聲音的節奏太規律了，不像自然的風。你的後頸瞬間泛起一陣寒意。"
    ],
    options: [
      { label: "屏息躲藏", resultText: "你貼著牆壁，盡量放慢呼吸。拖行聲在門外停留了片刻，接著緩緩遠去——你直到聲音完全消失後，才敢吐出那口氣。" },
      { label: "悄悄查看", effect: { resources: { scrap: 1 }, setFlag: "noise_investigated" }, resultText: "你輕輕拉開窗簾一角——原來只是一塊被風吹倒、拖行在地上的招牌，邊角還沾著一絲螢光粉塵。你鬆了口氣，順手把附近散落的金屬零件撿了回來。但拉開窗簾的瞬間，你似乎瞥見巷口有個人影一閃而過……" }
    ]
  },
  {
    id: "evt_found_supplies", title: "意外的發現",
    minDay: 1, maxDay: null, phase: ["day"], weight: 20,
    // 據點防禦越低（越缺乏準備），越容易發現額外補給，緩解前期壓力
    weightModifier: (state) => Math.max(0, (3 - state.baseDefense) * 3),
    textPool: ["在據點角落一堆雜物底下，你發現了一個被遺忘已久、還沒被翻動過的背包，表面積了一層薄薄的灰塵，混著幾粒會反光的細小石英顆粒——看起來已經放在這裡好一陣子了。", "你在櫃子深處摸到一個被雜物掩埋的鐵盒，打開時鉸鏈發出刺耳的鏽蝕聲，裡頭的東西倒是意外地保存完好。", "一塊鬆動的地板底下，藏著一個不起眼的木箱，邊緣還殘留著一圈淡淡的螢光粉塵。", "你翻開一堆早已泛黃的舊報紙，底下壓著一個誰都沒注意過的帆布袋，沉甸甸的。", "牆角堆疊的雜物崩塌了一角，露出裡頭一個塵封已久、卻完好無損的收納箱。"],
    options: [
      { label: "打開查看", effect: { resources: { food: 2, water: 1 }, exp: 3 }, resultText: "拉開拉鍊的瞬間，裡頭傳出罐頭碰撞的聲響——幾罐還沒過期的食物，加上一瓶密封完好的水。在這種日子裡，這已經算是一筆不小的收穫。" }
    ]
  },
  {
    id: "evt_supply_drop", title: "緊急補給",
    minDay: 1, maxDay: null, phase: ["day"], weight: 15,
    // 食物或飲水快見底時才會出現
    condition: (state) => state.resources.food <= 2 || state.resources.water <= 2,
    textPool: ["正當你開始擔心存糧見底的時候，路邊一個褪色的軍用補給箱吸引了你的注意——箱子側面印著模糊的救援單位標誌，邊角還燒著一圈淡淡的螢光焦痕，掀開蓋子，裡面竟然還剩下一些沒被搜刮走的物資。", "就在你幾乎要放棄的時候，一台墜毀的補給空投箱出現在視線邊緣，降落傘還纏繞在殘骸上。", "你在廢棄崗哨裡翻出一箱沒被領走的配給物資，箱蓋上的日期已經模糊得認不出來。", "一輛翻覆的補給車半埋在瓦礫堆裡，車廂縫隙間還能看見幾件沒被搜刮走的物資。", "你循著一絲若有似無的食物氣味找去，發現一處臨時儲藏點，運氣不錯地還沒被人發現。"],
    options: [
      { label: "拿走補給", effect: { resources: { food: 2, water: 2 } }, resultText: "你迅速把食物和飲水塞進背包，緊繃的肩膀總算放鬆了一些——至少，接下來幾天不用餓肚子了。" }
    ]
  },
  {
    id: "evt_infected_encounter", title: "感染者出現",
    minDay: 1, maxDay: null, phase: ["night"], weight: 12,
    textPool: ["一道踉蹌的身影從巷口的陰影中竄出，發出低沉而沙啞的呻吟——是一名感染者，渾濁的雙眼深處透著一絲不自然的螢光，步伐雖然蹣跚，卻正一步步逼近。", "破碎的玻璃在腳下發出清脆的聲響，一名感染者聞聲轉頭，拖著僵硬的步伐朝你逼近。", "你才剛轉過牆角，一道渾身沾滿螢光泥漬的身影就從陰影裡撲了出來。", "遠處傳來一聲沙啞的低吼，你回頭一看，一名感染者正搖搖晃晃地朝你的方向走來。", "感染者從堆積如山的垃圾堆裡爬起，渾濁的雙眼死死鎖定了你的位置。"],
    options: [
      { label: "戰鬥", battle: "enemy_walker_weak" },
      { label: "逃跑", effect: { resources: { food: -1 } }, resultText: "你轉身就跑，背包在奔跑中不斷晃動，一些食物從縫隙中掉了出來。等你確定甩開對方後，才發現自己已經滿身是汗。" }
    ]
  },
  {
    id: "evt_infected_encounter_armed", title: "持械感染者出現",
    minDay: 1, maxDay: null, phase: ["night"], weight: 10,
    // 等級較高的玩家才會遇到較強的變種
    condition: (state) => state.level >= 3,
    textPool: ["黑暗中，一名感染者緩緩走出——牠的手裡竟還緊緊攥著一根生鏽的鐵管，關節因為長期僵硬而以詭異的角度晃動著，皮膚下隱約能看見一條條發光的紋路在脈動。比起一般感染者，牠的氣息明顯更加危險。", "一陣金屬拖行聲由遠而近，一名手持破損鋼管的感染者從陰影中現身，步伐比一般個體更加沉穩。", "你注意到牠手裡緊握的不只是普通武器——那截生鏽的鐵條在牠皮膚下的螢光紋路映照下，顯得格外猙獰。", "這名感染者的動作比同類更協調，手裡那根鐵管顯然不是隨手撿的，牠似乎還記得怎麼使用武器。", "黑暗中傳來規律的金屬敲擊聲，一名持械的感染者正沿著牆邊緩緩逼近。"],
    options: [
      { label: "戰鬥", battle: "enemy_walker_armed" },
      { label: "逃跑", effect: { resources: { food: -1 } }, resultText: "你不敢戀戰，立刻拔腿沿著小巷狂奔。鐵管刮過牆面的聲響在身後迴盪，你直到拐過好幾個轉角才敢放慢腳步，途中弄丟了一些食物。" }
    ]
  },
  {
    id: "evt_companion_watch", title: "夥伴的提醒",
    minDay: 1, maxDay: null, phase: ["night"], weight: 15,
    // 只有「並肩同行」結局（有夥伴）才會觸發
    condition: (state) => !!state.companion,
    textPool: ["「今晚我來守夜吧，你先休息。」夥伴拍了拍你的肩膀，把毯子披到你身上。藉著微弱的燭光，她開始整理白天收集回來的雜物，動作熟練又安靜。", "「你今天看起來特別累。」夥伴把手邊的活兒放下，示意你先去休息，自己則接手了剩下的雜務。", "夥伴悄悄把最後一塊乾糧留在你枕邊，自己則裹著毯子，靠著牆守著這一夜。", "「放心睡吧，有我在。」夥伴輕聲說，隨手把你踢掉的毯子重新蓋好。", "你迷迷糊糊醒來一次，看見夥伴仍坐在原地望著門口，便又安心地閉上了眼睛。"],
    options: [
      { label: "謝謝她，安心睡下", endsPhase: true, effect: { resources: { scrap: 1 }, exp: 3, hp: 10, san: 5 }, resultText: "你閉上眼，很快就沉沉睡去——這是這幾天來睡得最安穩的一次。醒來時，她已經把廢料分類整齊，遞到你手上。「多虧妳。」你由衷地說。" }
    ]
  },
  {
    id: "evt_rain", title: "下雨了",
    minDay: 1, maxDay: null, phase: ["day"], weight: 10,
    textPool: ["天空毫無預警地暗了下來，豆大的雨滴開始敲打在屋頂與廢棄車輛上，匯聚成一片白噪音，雨水落地時偶爾濺起一閃即逝的微光。對現在的你來說，這場雨不是麻煩，而是一份意外的禮物。", "細雨無聲地飄落，很快就在地面積成一層薄薄的水窪，你趕緊把容器一一擺到屋簷下。", "一場來得又急又猛的驟雨突然降下，雨水順著破損的屋頂縫隙滴落，你趕緊找容器接住。", "天空飄起濛濛細雨，雖然不大，但積少成多，也是一筆划算的額外收穫。", "雷聲滾滾，緊接著是傾盆大雨，你手忙腳亂地把所有能用的桶子都搬了出來。"],
    options: [
      { label: "收集雨水", effect: { resources: { water: 2 }, exp: 3 }, resultText: "你迅速把所有能用的容器擺到屋簷下，看著雨水一點一滴匯聚起來。雨勢持續了好一陣子，等你把容器收回來時，飲水量明顯多了不少。" }
    ]
  },
  {
    id: "evt_injury", title: "受傷",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 8,
    // aero_pouch(大氣隨身風向儀)：陷阱事件觸發機率-30%，本事件是遊戲裡「不可迴避的環境傷害」代表事件，故接上此效果
    // （aero_pouch是common飾品不會被實例化附前綴，直接比對itemId即可，跟evt_mirage_hall的mind_eye判定同一種簡化寫法）
    weightModifier: (state) => (state.equipment && state.equipment.accessory === "aero_pouch") ? -Math.round(8 * 0.3) : 0,
    text: "在翻找雜物時，一塊藏在暗處、邊緣沾著螢光鏽斑的鐵片劃過你的手臂，刺痛感瞬間竄上來。你低頭一看，傷口雖不深，但血已經滲了出來，在這種環境下，傷口感染的風險不容小覷。",
    textPool: [
      "在翻找雜物時，一塊藏在暗處、邊緣鏽蝕的鐵片劃過你的手臂，刺痛感瞬間竄上來。你低頭一看，傷口雖不深，但血已經滲了出來，在這種環境下，傷口感染的風險不容小覷。",
      "搬動一塊倒塌的木板時，腳下一滑，膝蓋重重撞在堅硬的地面上。一陣鈍痛從腿部蔓延開來，你勉強站起身，發現傷口處已經腫了起來。",
      "黑暗中你不慎踩到一塊碎玻璃，尖銳的痛感瞬間穿透腳底。脫下鞋子查看，傷口不算大，但持續滲著血，走起路來一跛一跛的。",
      "你伸手去拉一個卡住的櫃子，沒注意到邊緣有一根外露的釘子，手掌被劃出一道傷口。血珠很快滲了出來，刺痛感讓你倒吸一口涼氣。",
      "搬運物資時不小心扭傷了腳踝，一陣劇痛襲來，你只能咬牙撐著牆壁慢慢站穩。接下來的行動，恐怕都得小心翼翼了。"
    ],
    options: [
      { label: "用醫療品包紮", requiresResource: { medicine: 1 }, effect: { resources: { medicine: -1 }, hp: -5 }, resultText: "你咬牙清理傷口，纏上紗布。藥效讓刺痛感緩和不少，雖然還是有點痛，但至少不必擔心傷口惡化。" },
      { label: "忍痛繼續", effect: { hp: -10 }, resultText: "你隨手扯了塊布稍微按住傷口，繼續手邊的工作。但傷口持續隱隱作痛，血止不太住，一整天下來你感到一陣陣虛弱襲來。" }
    ]
  },
  // 17.4：就近探索事件池補充低機率裝備掉落，呼應33節「探索=裝備管道」原則
  {
    id: "evt_scrap_pile_gear", title: "雜物堆裡的傢俬",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 5,
    textPool: ["在一堆鏽蝕的金屬廢料與破布之間，一件還算堪用的裝備泛著一絲不易察覺的微光吸引了你的注意——雖然不是什麼精良貨，但對現在的你來說已經足夠。", "你在一堆廢棄零件裡翻找，意外摸到一件保存還算完整的裝備，雖然舊，但堪用。", "廢料堆的最底層卡著一件裝備，表面沾滿泥漬，擦拭乾淨後看起來還能繼續使用。", "你踢開幾塊碎鐵板，底下露出一件被人遺漏的裝備，品相普通但足夠應急。", "雜物堆裡露出一角熟悉的材質，你挖了半天，總算把整件裝備完整地拖了出來。"],
    options: [
      { label: "拿走", effect: { equipment_pool: ["knife_01", "pipe_01", "jacket_01", "scrap_plating", "military_shovel"], exp: 3 }, resultText: "你把它擦拭乾淨，收進背包——這趟出來總算沒有白跑一場。" }
    ]
  },
  {
    id: "evt_scavenger_trade", title: "流浪商人",
    minDay: 3, maxDay: null, phase: ["day"], weight: 12,
    condition: (state) => state.resources.scrap >= 3,
    textPool: ["一陣吱嘎作響的輪子聲由遠而近，一個衣著破舊、推著改裝手推車的男人出現在視線中。車上掛滿瓶瓶罐罐與零件，幾圈銅線纏在其間微微發光。他朝你咧嘴一笑，露出缺角的牙齒：「廢料換物資，要不要？童叟無欺。」", "一個戴著防毒面具的商人牽著一台改裝手推車緩緩靠近，車斗上掛滿了叮叮噹噹的雜貨。", "「稀客啊。」熟悉的流浪商人推著他那台吱嘎作響的手推車出現，笑容一如既往地帶著幾分狡黠。", "遠處傳來金屬碰撞的聲響，是那個流浪商人又推著滿載雜物的推車經過這一帶。", "一個身形佝僂的商人朝你招了招手，車上的貨物在陽光下閃著混雜的光澤，看起來來路不明卻很實用。"],
    options: [
      { label: "用廢料交換物資", effect: { resources: { scrap: -3, food: 2, water: 2 } }, resultText: "你拿出一些廢料遞給他，他熟練地秤了秤重量，從車上翻出幾罐食物和水交給你。「這年頭，活下去最重要。」他咧嘴一笑，推著車繼續前行，很快消失在街角。" },
      { label: "婉拒，目送他離開", resultText: "你搖搖頭。商人聳聳肩，似乎早已習慣這種反應，「隨你。」他推著吱嘎作響的車子，慢慢消失在街道盡頭，留下一陣若有似無的金屬碰撞聲，和一絲說不清的螢光餘暈。" }
    ]
  },
  {
    id: "evt_old_memory", title: "舊照片",
    minDay: 1, maxDay: null, phase: ["night"], weight: 10,
    textPool: ["整理背包夾層時，一張泛黃的相片悄悄滑落到你的腳邊。你彎腰撿起——是末日爆發前某個平凡的午後，陽光灑在餐桌上，照片裡的人都笑得那麼自然，彷彿明天理所當然會到來。\n\n你盯著照片看了很久，喉頭一陣發緊，許多畫面在腦海中無聲地閃過。", "你在一本舊書裡發現了一張夾著的相片，畫面裡是某次再平凡不過的家庭聚餐，每個人都笑得毫無防備。", "整理雜物時，一張相片從口袋深處掉了出來——是你早已記不清何時拍下的一張自拍，背景是一片再普通不過的街景。", "你無意間翻到那張相片，畫面已經有些褪色，但照片裡的笑容依然清晰得讓人恍惚。", "那張夾在筆記本裡的相片又被你翻了出來，你看著看著，忍不住把它重新收好，貼身放著。"],
    options: [
      { label: "把照片收好，繼續前進", resultText: "你深吸一口氣，小心地把照片放回最內層的夾層，用手按了按，像是在確認它不會再次掉出來。「還不是放棄的時候。」你低聲對自己說，重新揹起背包。" }
    ]
  },
  {
    id: "evt_storm_warning", title: "風暴警報",
    minDay: 1, maxDay: null, phase: ["day"], weight: 10,
    condition: (state) => state.baseDefense < 3,
    weightModifier: (state) => (3 - state.baseDefense) * 2,
    textPool: ["遠方的天空逐漸被厚重的烏雲吞沒，悶雷聲一陣接著一陣，越來越近，每次閃光過後空氣裡都殘留一絲焦糊般的靜電味。風開始呼嘯著掠過據點外圍那些臨時搭建的圍欄與木板——以目前的防禦狀況，這場風暴恐怕撐不住。", "天邊翻湧著詭異的紫黑色雲層，遠遠就能聽見雷聲夾雜著某種不自然的嗡鳴，一場風暴正在醞釀。", "氣壓驟然下降，你的據點外圍傳來木板被強風拍打的聲響，看樣子今晚不會太平靜。", "烏雲以肉眼可見的速度吞沒天際，你趕緊檢查一遍圍欄，希望這次的防禦能撐過去。", "風向忽然轉變，帶著一股不祥的濕冷氣息——經驗告訴你，一場惡劣的風暴即將降臨。"],
    options: [
      { label: "趕緊加固據點", effect: { resources: { scrap: -2 }, baseDefense: 1 }, resultText: "你抓起手邊的廢料和工具，趕在風暴來臨前加固了幾處最脆弱的結構。當第一陣強風掃過時，圍欄劇烈搖晃卻沒有倒下——這次，你們撐住了。" },
      { label: "躲進地下室硬撐", endsPhase: true, restless: true, effect: { hp: -5 }, resultText: "你選擇先躲起來，把加固工程留到明天。風暴在外頭怒吼了大半天，不時傳來木板被掀飛、東西倒塌的巨響。等你走出來時天色已暗，據點多處受損，你縮在潮濕的地下室裡渾身痠痛。" }
    ]
  },
  {
    id: "evt_alone_reflection", title: "深夜的思緒",
    minDay: 5, maxDay: null, phase: ["night"], weight: 8,
    // 序章結局為「孤身一人」時，偶爾會回想起第一晚的選擇
    condition: (state) => !!(state.flags && state.flags.alone),
    textPool: ["夜深人靜時，思緒總是特別容易飄遠。你又想起了第一晚——那扇你沒有打開、或者打開後又關上的門。如果當時做了不同的決定，現在會不會有人陪你說話、陪你分擔這份寂靜？\n\n窗外的風聲呼呼作響，你獨自坐在黑暗裡，那個念頭來得快，去得也快。", "你盯著天花板發呆，腦海裡反覆浮現那些「如果當初」的念頭，最後只是嘆了口氣，翻身繼續睡。", "寂靜的夜裡，你忍不住想，如果身邊有個人可以說話，今晚會不會不一樣——但這個念頭很快又被你壓了下去。", "你獨自坐在黑暗中，聽著自己的呼吸聲，偶爾會想，這樣的日子還要過多久，但沒有答案。", "夜太安靜了，安靜到你能聽見自己的心跳——你閉上眼，試著不去想那些沒有答案的問題。"],
    options: [
      { label: "繼續守夜", resultText: "你搖搖頭，把這份雜念壓下，重新把注意力拉回眼前的夜晚。一個人也好——至少，沒有人需要你來保護，也沒有人會讓你失望。" }
    ]
  },
  {
    id: "evt_stranger_returns", title: "巷口的身影",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 0,
    // 接續「窗外的聲響→悄悄查看」：1~3天後若尚未處理過，巷口的人影會再次出現
    condition: (state) => !!(state.flags && state.flags.noise_investigated && !state.flags.stranger_event_done
      && state.day - state.flags.noise_investigated >= 1 && state.day - state.flags.noise_investigated <= 3),
    weightModifier: (state) => (state.flags && state.flags.noise_investigated && !state.flags.stranger_event_done) ? 45 : 0,
    text: "一陣急促的腳步聲由遠而近，接著是重物倒地的悶響——你衝到門邊，看見一個渾身是血的年輕人正趴在據點門口，手裡死死抓著一把獵刀，背後的巷子裡傳來追逐的咆哮聲，越來越近。\n\n「拜託……讓我進去……」他的聲音嘶啞而急切，眼神裡是赤裸裸的求生欲望。你只有幾秒鐘可以決定。",
    options: [
      {
        label: "拉他進來，一起擋住門！",
        roll: {
          chance: 0.65,
          success: {
            effect: { companion: true, resources: { medicine: -1 }, setFlag: "stranger_event_done" },
            resultText: "你一把抓住他的手腕將他拽進門內，兩人合力頂住門板。追趕的咆哮聲在門外撞了幾下，逐漸遠去。年輕人癱坐在地上大口喘氣，你替他簡單包紮了傷口。「謝了……欠你一條命。」從今以後，他會留下來和你並肩作戰。"
          },
          fail: {
            effect: { setFlag: "stranger_event_done" },
            battle: "enemy_walker_armed",
            resultText: "你伸手將他拉進門內的瞬間，一隻手臂猛地破門而入，一把生鏽的鐵管狠狠揮了過來——追上來的不只是普通感染者，而是一個全副武裝的瘋子！年輕人連滾帶爬地躲到角落，你只能獨自迎戰。"
          }
        }
      },
      {
        label: "鎖上門，假裝沒聽見",
        effect: { resources: { scrap: 1 }, hp: -3, setFlag: "stranger_event_done" },
        resultText: "你的手伸向門閂，卻在最後一刻停住——你深吸一口氣，還是把門閂死死扣上。外頭的呼救聲、腳步聲、撞擊聲混雜成一片，接著是一陣令人牙酸的寂靜。\n\n你靠著門板滑坐到地上，胃裡一陣翻攪，久久無法平復。等你終於鼓起勇氣打開門，門口只剩一把沾血的獵刀，旁邊散落著幾塊廢料。"
      }
    ]
  },
  {
    id: "evt_desperate_gamble", title: "最後一搏",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 0,
    // HP瀕危時觸發的高張力抉擇，提供翻盤機會
    condition: (state) => state.hp <= 25,
    weightModifier: (state) => state.hp <= 25 ? 60 : 0,
    text: "視線開始發黑，每一次呼吸都像在拉扯著什麼東西。你靠著牆緩緩滑坐下來，意識到自己撐不了太久了。\n\n透過破窗，你瞥見街對面那間藥局的招牌還亮著一盞應急燈——那裡或許還有藥品，但那也是感染者活動最頻繁的區域之一。\n\n血液裡的腎上腺素瞬間竄起，你的手不自覺地握緊了武器。賭一把，還是繼續硬撐？",
    options: [
      {
        label: "豁出去，衝向藥局！",
        roll: {
          chance: 0.5,
          success: {
            effect: { resources: { medicine: 2 }, hp: 5 },
            resultText: "你咬緊牙關狂奔過街，撞開藥局的門，一把抓起架上殘留的醫療用品塞進懷裡！回程的路上你幾乎是連滾帶爬，但懷裡那幾包藥品的重量，讓你覺得這一切都值得。"
          },
          fail: {
            battle: "enemy_walker_weak",
            resultText: "你才衝出去沒幾步，黑暗中就竄出一道蹣跚的身影擋住去路——你已經沒有退路，只能拼死一戰！"
          }
        }
      },
      {
        label: "原地穩住呼吸，撐過去",
        effect: { hp: 8, resources: { food: -1, water: -1 } },
        resultText: "你閉上眼，強迫自己緩慢而深長地呼吸，一下、一下，直到心跳聲不再震耳欲聾。當你再次睜開眼時，視線總算恢復了清晰——雖然飢渴難耐，但至少，你又撐過了一關。"
      }
    ]
  },
  {
    id: "evt_radio_broadcast", title: "雜訊中的聲音",
    minDay: 2, maxDay: null, phase: ["night"], weight: 9,
    textPool: ["你無意間轉開一台老舊的收音機，刺耳的雜訊裡夾著一絲規律嗡鳴，接著突然冒出一段斷斷續續的人聲：「……如果聽得到……北邊的訊號塔……我們還在……」訊息很快又被雜訊淹沒，無論怎麼轉動旋鈕都找不回來了。\n\n你盯著收音機，久久無法移開視線——這是這幾天來，第一次確定這座城市裡不是只有你和那些東西。", "收音機忽然自己跳了頻，斷斷續續傳出一段陌生的呼叫代號，你屏息聽了許久，訊號卻再也沒有出現過。", "你調整天線角度時，意外截獲一段模糊的對話片段——兩個陌生的聲音正在交換某個座標，很快又被雜訊蓋過。", "收音機的指示燈忽明忽暗，夾雜著雜訊傳來一句破碎的求救，你努力想聽清楚，但訊號轉瞬即逝。", "深夜裡，收音機無預警地自己發出聲響，一段陌生的廣播詞反覆播放著同一句話，聽不出來源。"],
    options: [
      { label: "把頻率記下來", effect: { setFlag: "radio_lead" }, resultText: "你找了張紙，把聽到的頻率與關鍵字仔細寫下來，小心收進口袋。北邊……訊號塔……或許哪天用得上。雖然渺茫，但這是個方向，足夠讓你在黑暗中多一點盼頭。" },
      { label: "關掉收音機，留著電池", effect: { resources: { scrap: 1 } }, resultText: "你關掉收音機，拆下還有電的電池收好。希望是奢侈品，活下去才是現在的優先事項——你這樣告訴自己，但那段聲音還是在腦海裡迴盪了很久。" }
    ]
  },
  {
    id: "evt_stray_dog", title: "瘦弱的狗",
    minDay: 1, maxDay: null, phase: ["day"], weight: 8,
    textPool: ["一隻瘦骨嶙峋的狗從瓦礫堆後探出頭，警戒地盯著你，尾巴卻又忍不住輕輕搖了兩下。牠的毛髮髒亂打結，肋骨清晰可見，明顯餓了很久——但那雙眼睛裡，還殘留著一絲對人類的信任。", "一隻黑白花色的狗遠遠望著你，遲遲不敢靠近，尾巴卻誠實地搖個不停。", "廢墟角落窩著一隻瘦弱的狗，看到你經過只是抬頭看了一眼，沒有要逃跑的意思。", "你注意到牆角有雙眼睛在盯著你——是隻餓壞了的狗，警戒又渴望地觀察著你的一舉一動。", "一隻流浪狗小心翼翼地跟在你身後幾步遠，既想靠近，又不敢真的走上前。"],
    options: [
      { label: "分牠一點食物", requiresResource: { food: 1 }, effect: { resources: { food: -1 }, setFlag: "stray_dog_fed" }, resultText: "你蹲下身，把一小塊食物放在地上慢慢推過去。牠遲疑了一下，小心翼翼地叼起食物狼吞虎嚥。吃完後，牠抬頭看了你很久，然後安靜地跟在你身後幾步——或許，牠決定把你當成同伴了。" },
      { label: "保持距離，繼續前進", resultText: "你不敢冒險，畢竟誰也不知道牠是否帶有什麼疾病。你緩緩後退，牠也沒有追上來，只是站在原地目送你離開，那雙眼神讓你心裡有點不是滋味。" }
    ]
  },
  {
    id: "evt_collapsing_floor", title: "腳下的異響",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 8,
    textPool: ["「喀啦——」一聲，腳下的地板突然傳來令人牙酸的爆裂聲，木板瞬間下陷了一截！你下意識地僵在原地，能感覺到整個地面正微微震動，裂縫深處透出一絲幽幽螢光，灰塵簌簌落下。再往前一步，可能就會徹底塌陷。", "腳下傳來一陣不祥的吱呀聲，地板以肉眼可見的幅度微微下陷，裂縫裡滲出一絲詭異的光。", "你才踏上這層樓，天花板就簌簌掉下灰塵，整棟建築彷彿隨時會塌陷。", "一聲悶響從樓下傳來，你腳邊的地磚跟著震動了一下，裂痕正緩緩向外蔓延。", "木造樓梯在你踩上去的瞬間發出令人心驚的呻吟聲，你趕緊放輕腳步，小心翼翼地退回原地。"],
    options: [
      {
        label: "賭一把，衝過去",
        roll: {
          chance: 0.55,
          success: {
            effect: { resources: { scrap: 2 } },
            resultText: "你深吸一口氣，幾個大步衝過搖搖欲墜的地板，在它徹底塌陷前驚險地跳到了堅固的地面上！回頭一看，原本站立的地方已經出現一個大洞，洞口邊緣還露出底下的金屬零件——你伸手探下去撿了一些。"
          },
          fail: {
            effect: { hp: -8 },
            resultText: "你才踏出一步，腳下的地板就整個碎裂崩塌！你重重摔落到下層的瓦礫堆中，渾身傳來陣陣劇痛。你掙扎著爬起來，確認骨頭還算完整，但全身都是擦傷與淤青。"
          }
        }
      },
      { label: "原路退回，放棄這條路", resultText: "你緩緩後退，每一步都放得極輕。直到退回安全的地面，你才聽見身後傳來一聲悶響——那塊地板終究還是塌了。你拍了拍胸口，慶幸自己沒有冒險。" }
    ]
  },
  {
    id: "evt_black_market", title: "黑市交易",
    minDay: 7, maxDay: null, phase: ["night"], weight: 8,
    condition: (state) => state.resources.scrap >= 5,
    textPool: ["巷子深處透出一點微弱的燈光，混著一絲不屬於電燈泡的冷色螢光，幾個人影圍著一張鋪滿貨物的木板低聲交談，看到你靠近也沒有驅趕的意思。\n\n其中一人朝你抬了抬下巴，露出意味不明的笑容：「想交易？這裡什麼都有，只要你出得起價。」木板上擺著幾件來路不明、卻保養得相當不錯的裝備。", "你循著壓低的交談聲拐進一條窄巷，幾個人正圍著一堆貨物討價還價，見你靠近也不以為意。", "巷弄深處架著一盞泛著冷光的提燈，幾名交易者警惕地打量著你，示意你可以上前看看貨。", "你在廢棄地下道發現一處臨時交易點，攤位上堆滿了來路不明的物資，價格看起來不便宜。", "一群人圍聚在昏暗的角落，低聲交換著情報與貨物，注意到你後，其中一人朝你比了個手勢。"],
    options: [
      { label: "用廢料換一件裝備", effect: { resources: { scrap: -5 }, equipment_pool: ["pistol_01", "vest_01", "machete_01"] }, resultText: "你遞出廢料，對方不發一語地清點，隨即從木板底下抽出一件用布包好的裝備塞進你手裡。「東西很乾淨，別問來源。」他低聲說完，轉身便和同夥隱入巷子深處的陰影中。" },
      { label: "謝絕，盡快離開", resultText: "你搖搖頭，禮貌地後退幾步。對方也不在意，只是聳聳肩繼續和同夥低聲交談。你加快腳步離開這條巷子——這種地方，待得越久，風險越高。" }
    ]
  },
  {
    id: "evt_fever", title: "突如其來的發燒",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 7,
    textPool: ["你忽然感到一陣寒意從背脊竄上，緊接著是一波又一波的燥熱。額頭滾燙，視線開始模糊，眼前甚至浮現幾道轉瞬即逝的光斑，四肢也變得沉重無力——是發燒了。在這種環境下，任何一點小毛病都可能演變成大麻煩。", "喉嚨一陣刺痛，緊接著全身開始發冷，你這才驚覺自己已經燒了起來。", "你勉強站起身，卻感到一陣天旋地轉，額頭滾燙得嚇人——身體終於撐不住了。", "咳嗽了一整天後，你終於承認自己病倒了，四肢痠軟得連拿東西都很吃力。", "一陣突如其來的暈眩襲來，你扶著牆勉強站穩，額頭已經滲出一層冷汗。"],
    options: [
      { label: "服用藥品退燒", requiresResource: { medicine: 1 }, effect: { resources: { medicine: -1 }, hp: -3 }, resultText: "你翻出僅剩的藥品服下，靠著牆閉目休息了一陣子。藥效漸漸發揮作用，燒總算退了一些，雖然身體還是有點虛軟，但至少不再持續惡化。" },
      { label: "硬撐過去", effect: { hp: -8 }, resultText: "你沒有藥可用，只能裹緊外套，蜷縮著等待這陣難受過去。一整天下來，你渾身發冷又發燙，幾乎無法集中精神，等到燒總算退去時，整個人已經虛脫得不成樣子。" }
    ]
  },
  {
    id: "evt_survivor_note", title: "另一名倖存者的字條",
    minDay: 1, maxDay: null, phase: ["day"], weight: 8,
    condition: (state) => !state.flags || !state.flags.family_lead,
    textPool: ["牆角的桌上壓著一張用鉛筆寫得歪歪扭扭的字條，墨跡已經有些暈開：「如果你看到這個——我們往南邊的橋去了，那裡聽說比較安全。如果你是__（後面的字跡被水暈開，看不清楚），請等等我們，我們會回來找你。」\n\n字條的角落，畫著一個小小的、孩子氣的笑臉。你盯著那張字條，心裡某個角落被輕輕觸動了一下。", "你在門板上發現一行潦草的粉筆字：「這裡沒東西了，往東邊試試。」筆跡看起來是最近才留下的。", "一張被壓在石頭下的紙條寫著簡短的警告：「這棟樓不安全，繞路走。」你收起紙條，決定聽從這個陌生人的忠告。", "牆上貼著一張手繪的簡易地圖，標註著幾處可能有補給的地點，署名只有一個模糊的縮寫。", "你在櫃檯後發現一本翻爛的筆記本，裡頭記錄著某個陌生人的生存心得，字跡工整得讓人意外。"],
    options: [
      { label: "把字條收好", effect: { setFlag: "family_lead" }, resultText: "你小心地把字條摺好，放進貼身的口袋裡。南邊的橋……或許這座城市裡，還有人在等著與誰重逢。你重新揹起背包，腳步似乎比剛才稍微輕快了一些。" }
    ]
  },
  {
    id: "evt_aircraft_pass", title: "天空中的引擎聲",
    minDay: 8, maxDay: null, phase: ["day"], weight: 6,
    textPool: ["一陣低沉而規律的轟鳴聲由遠而近，你猛地抬頭——天空中，一架直升機正沿著城市邊緣飛行，機身在陽光下反射出一閃而過的光芒。\n\n它離得很遠，幾乎不可能注意到地面上的你，但這是這麼多天以來，你第一次看見「人類仍在運作的東西」。", "遠方傳來螺旋槳的轟鳴聲，你抬頭望去，一架飛機正劃過天際，很快消失在雲層之後。", "一陣引擎聲由遠而近又漸漸遠去，你望著天空，直到聲音完全消失才收回視線。", "你聽見高空傳來規律的轟鳴，抬頭卻只看見一道白色的凝結尾跡，緩緩散開。", "遠處傳來螺旋槳的聲響，你站在原地聽了許久，直到那個聲音徹底融進風裡。"],
    options: [
      { label: "用力揮手、大聲呼喊", effect: { hp: -1 }, resultText: "你衝到空地上，拼命揮舞手臂、扯著嗓子大喊，直到聲音沙啞。直升機的航線絲毫沒有改變，很快消失在遠方的雲層裡。你站在原地喘著氣，喉嚨又乾又痛，但心裡某種東西，似乎被重新點燃了一點。" },
      { label: "默默目送它離開，繼續手邊的事", effect: { resources: { scrap: 1 } }, resultText: "你停下手邊的動作，靜靜望著那架直升機劃過天際，直到它變成一個小黑點消失不見。你深吸一口氣，重新拾起工具——不管那架直升機去了哪裡，眼前的生活還是得一步一步過下去。" }
    ]
  },
  {
    id: "evt_dog_returns", title: "熟悉的腳步聲",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 0,
    // 接續「瘦弱的狗」：餵食後1~4天，牠會回來並留下
    condition: (state) => !!(state.flags && state.flags.stray_dog_fed && !state.flags.dog_companion
      && state.day - state.flags.stray_dog_fed >= 1 && state.day - state.flags.stray_dog_fed <= 4),
    weightModifier: (state) => (state.flags && state.flags.stray_dog_fed && !state.flags.dog_companion) ? 35 : 0,
    text: "一陣輕巧的腳步聲在門外停下，接著是熟悉的、帶著點試探的嗚咽聲——是那隻狗，牠竟然找到了據點的位置，叼著一隻不知道從哪抓來的老鼠，放在你腳邊，搖著尾巴抬頭看你，像是在邀功。",
    options: [
      {
        label: "讓牠留下來吧",
        effect: { baseDefense: 1, setFlag: "dog_companion" },
        resultText: "你蹲下身，輕輕摸了摸牠的頭。牠興奮地蹭了蹭你的手掌，然後熟門熟路地在門邊找了個角落趴下——從今以後，牠會在這裡守著，稍有風吹草動就會發出警告。據點似乎也因為牠的存在，多了一份安心感。"
      }
    ]
  },
  {
    id: "evt_radio_tower_journey", title: "北邊的訊號塔",
    minDay: 1, maxDay: null, phase: ["day"], weight: 0,
    // 接續「雜訊中的聲音」：3~7天後，是否要前往北邊訊號塔的重大抉擇
    condition: (state) => !!(state.flags && state.flags.radio_lead && !state.flags.radio_journey_done
      && state.day - state.flags.radio_lead >= 3 && state.day - state.flags.radio_lead <= 7),
    weightModifier: (state) => (state.flags && state.flags.radio_lead && !state.flags.radio_journey_done) ? 35 : 0,
    text: "你又一次摸到口袋裡那張寫著頻率的紙條，邊緣已經被摩挲得有些發皺。北邊的訊號塔——從地圖上看，至少要走上大半天，沿途狀況完全未知。但那段斷斷續續的人聲，始終在你腦中揮之不去。\n\n是時候做個決定了：賭上時間與風險前往一探究竟，還是把這份念想暫時收進心底？",
    options: [
      {
        label: "出發前往訊號塔",
        roll: {
          chance: 0.6,
          success: {
            effect: { resources: { food: 3, water: 3, medicine: 1 }, baseDefense: 1, setFlag: "radio_journey_done" },
            resultText: "經過大半天的跋涉，你終於找到了那座訊號塔——塔下是一個小型的補給據點，早已人去樓空，但留下的物資意外地豐富。你把能帶的都帶上，並順手用剩下的材料加固了塔基的防禦結構，作為日後的中繼站。\n\n雖然沒有見到人，但至少證明了：這份訊號背後，曾經真實存在著努力求生的人。"
          },
          fail: {
            battle: "enemy_walker_armed",
            effect: { setFlag: "radio_journey_done" },
            resultText: "你沿著訊號方向走了大半天，正當訊號塔的輪廓出現在地平線上時，一陣沉重的腳步聲從廢棄車陣後傳來——一個體型異常巨大的身影緩緩站起，擋住了你唯一的去路。已經沒有回頭路了。"
          }
        }
      },
      {
        label: "暫時放下，先顧好眼前",
        effect: { setFlag: "radio_journey_done" },
        resultText: "你把紙條重新摺好，放回最深的口袋裡。現在的你，還沒有足夠的餘裕去賭上一趟未知的旅程。「總有一天。」你對自己說，把注意力拉回據點周遭——眼前的生存，才是最迫切的事。"
      }
    ]
  },
  {
    id: "evt_family_search_journey", title: "南橋的方向",
    minDay: 1, maxDay: null, phase: ["day"], weight: 0,
    // 接續「另一名倖存者的字條」：3~8天後，是否前往南橋尋找線索
    condition: (state) => !!(state.flags && state.flags.family_lead && !state.flags.family_search_done
      && state.day - state.flags.family_lead >= 3 && state.day - state.flags.family_lead <= 8),
    weightModifier: (state) => (state.flags && state.flags.family_lead && !state.flags.family_search_done) ? 35 : 0,
    text: "那張字條你已經反覆看過無數次了，紙張都快被體溫焐軟。南邊的橋——字條上的字跡雖然模糊，但那個小小的笑臉一直印在你腦海裡。你站在據點門口，望向南方的天際線，心裡那股衝動越來越強烈。\n\n去確認一下，還是繼續守著現在擁有的一切？",
    options: [
      {
        label: "前往南橋一探究竟",
        roll: {
          chance: 0.5,
          success: {
            effect: { hp: 10, setFlag: "family_search_done" },
            resultText: "橋頭果然留有生活過的痕跡——燒過的營火堆、排列整齊的空罐頭、牆上用粉筆畫的箭頭，指向更南方。雖然沒有找到人，但這些痕跡證明了字條所言不假，那群人確實活著、並且持續移動著。\n\n你站在橋上吹了很久的風，心裡那塊一直懸著的石頭，終於落下了一些。"
          },
          fail: {
            battle: "enemy_walker_weak",
            effect: { setFlag: "family_search_done" },
            resultText: "你沿著河岸朝南橋前進，途中經過一片陰暗的地下道。腳步聲在通道裡迴盪——還沒走到一半，前方就傳來金屬拖行的聲響，一個熟悉的危險身影擋住了去路。"
          }
        }
      },
      {
        label: "暫時按下這份念頭",
        effect: { resources: { scrap: 1 }, setFlag: "family_search_done" },
        resultText: "你深吸一口氣，把字條收回口袋。「不急於一時。」你告訴自己，轉身回到據點繼續手邊的工作——但那個小小的笑臉，還是時不時浮現在你腦海裡。"
      }
    ]
  },
  {
    id: "evt_dusty_attic", title: "閣樓的灰塵",
    minDay: 1, maxDay: null, phase: ["day"], weight: 6,
    textPool: ["你爬上吱呀作響的樓梯，閣樓裡堆滿了積灰的紙箱與舊家具，光線從破損的天窗斜斜灑下，空氣中漂浮著細小的塵埃，其中幾粒在光束裡閃著不該有的微光。", "閣樓的木地板每踩一步都發出令人不安的呻吟聲，堆積如山的雜物間，你發現了一個上鎖的箱子。", "你推開閣樓的門，一股陳舊的氣味撲面而來，角落幾件舊家具上覆著一層泛光的灰塵。", "狹窄的閣樓裡幾乎堆滿了雜物，你小心翼翼地穿梭其中，避免碰倒任何搖搖欲墜的箱子。", "天窗透進的光線照亮了閣樓一角，塵埃在光束中緩緩飄浮，其中幾粒顯得格外明亮。"],
    options: [
      { label: "仔細翻找紙箱", effect: { resources: { scrap: 2 } }, resultText: "你一箱一箱翻過，大多是發黃的舊文件，但底層藏著幾件還能用的金屬零件，你小心收進背包。" },
      { label: "只是看看就好", effect: {}, resultText: "你站在門口看了一會兒，這些屬於別人的回憶讓你不忍心翻動，最後還是輕輕帶上了門。" }
    ]
  },
  {
    id: "evt_strange_smell", title: "空氣中的焦味",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 5,
    textPool: ["一股淡淡的焦味隨風飄來，混著一絲說不出的金屬腥氣，似乎是不遠處有東西在悶燒。你停下腳步，鼻子皺了皺，試著判斷方向。", "空氣裡飄著一股說不清楚的焦味，混雜著金屬跟其他你分辨不出的氣味，讓人本能地提高警覺。", "一陣刺鼻的氣味突然竄入鼻腔，你皺著眉試圖辨認來源，卻怎麼也找不到明確的方向。", "風向轉變的瞬間，帶來一股腐敗與燒灼混雜的怪味，你加快了腳步想遠離這一帶。", "你停下腳步，鼻尖捕捉到一絲不對勁的氣味，直覺告訴你最好繞道而行。"],
    options: [
      { label: "循著味道過去看看", effect: { resources: { scrap: 1 }, hp: -2 }, resultText: "靠近後你發現是一堆悶燒的電線堆，刺鼻的濃煙嗆得你直咳嗽，但你還是從旁邊扯下幾段還能用的電纜。" },
      { label: "繞道而行", effect: {}, resultText: "不確定的危險不值得冒險，你選擇繞了一段遠路，避開那股令人不安的氣味。" }
    ]
  },
  {
    id: "evt_old_radio_song", title: "走音的旋律",
    minDay: 1, maxDay: null, phase: ["night"], weight: 5,
    textPool: ["不知道從哪戶人家傳來的，一台老舊收音機正播著走音的懷舊歌曲，斷斷續續，卻意外地讓人安心。", "不知從哪扇破窗傳來斷斷續續的旋律，收音機的雜訊裡夾著一首你依稀記得的老歌。", "你循著微弱的音樂聲找去，一台蒙塵的收音機正播放著早已過時卻莫名熟悉的曲子。", "街角某戶人家的窗台上，一台老收音機兀自播著懷舊金曲，音質雖差，卻讓人捨不得走開。", "一段熟悉的旋律隨風飄來，你停下腳步聽了好一會兒，才發現自己不知不覺跟著哼了起來。"],
    options: [
      { label: "靜靜聽完這首歌", effect: { hp: 2 }, resultText: "你靠著牆坐下，閉上眼聽完整首歌。旋律雖然破碎，卻讓緊繃了一整天的神經難得放鬆下來。" }
    ]
  },
  {
    id: "evt_neighbor_knock", title: "敲門的陌生人",
    minDay: 2, maxDay: null, phase: ["day"], weight: 5,
    textPool: ["據點的門被輕輕敲響三下。你透過門縫看到一個瘦弱的身影，懷裡抱著一個鐵罐，怯生生地望著這裡。", "據點的門被輕輕敲了兩下，門外站著一個侷促不安的身影，懷裡緊抱著僅有的一點家當。", "你聽見門外傳來怯生生的敲門聲，開門後只見一個瘦弱的身影猶豫著要不要開口。", "一陣細碎的敲門聲響起，你透過窗縫看見一個陌生人徘徊在外頭，似乎鼓不起勇氣敲得更大聲。", "深夜裡突然響起的敲門聲讓你心頭一緊，開門後卻只是一個同樣在尋找棲身之處的倖存者。"],
    options: [
      { label: "用一份食物換取對方的鐵罐", effect: { resources: { food: -1, water: 2 } }, resultText: "對方接過食物，連聲道謝後把鐵罐塞進你手裡——裡面裝著乾淨的飲用水，雖然不多，但在此刻彌足珍貴。" },
      { label: "不開門，假裝沒人在", effect: {}, resultText: "你屏住呼吸，靜靜等待腳步聲遠去。在這個世道，輕易開門終究還是太冒險了。" }
    ]
  },
  {
    id: "evt_tool_found", title: "工具箱",
    minDay: 1, maxDay: null, phase: ["day"], weight: 6,
    textPool: ["在一輛拋錨已久的貨車底下，你發現了一個半埋在泥土裡的工具箱，鎖頭早已鏽蝕損壞，縫隙間還卡著幾粒會反光的細小石英顆粒。", "你在廢棄修車廠的角落發現一個沾滿油污的工具箱，鎖扣早已鬆脫。", "一個工具箱被壓在倒塌的貨架底下，你費了點力氣才把它拖出來，裡頭的工具意外完整。", "你翻找廢棄卡車的駕駛座時，在座椅底下摸到一個小型工具箱。", "車庫深處的工作台底下，藏著一個蒙塵已久卻保存良好的工具箱。"],
    options: [
      { label: "撬開工具箱", effect: { resources: { scrap: 3 } }, resultText: "裡面雖然沒有完整的工具，但塞滿了各種螺絲、金屬片與電線——對你來說，這些零件比完整的工具更實用。" }
    ]
  },
  {
    id: "evt_garden_attempt", title: "陽台上的綠意",
    minDay: 3, maxDay: null, phase: ["day"], weight: 5,
    textPool: ["你注意到隔壁陽台上，有人在末日來臨前種下的幾株蔬菜，竟頑強地活了下來，葉片邊緣泛著一絲若有似無的螢光，在風中搖曳生長。", "隔壁陽台的花盆裡，幾株番茄意外撐過了漫長的荒廢期，葉片邊緣泛著一絲淡淡螢光，果實顆顆飽滿。", "你發現一處無人整理的小菜圃，作物長得比記憶中更加茂盛，藤蔓間隱約有微光流轉。", "陽台角落幾株半枯的植物竟然還在開花，花瓣上覆著一層極淡的螢光粉塵，看起來出奇地有生命力。", "你注意到院子裡一小片雜草叢中，混著幾株明顯是刻意栽種過的蔬菜，長勢好得不太尋常。"],
    options: [
      { label: "摘採可食用的部分", effect: { resources: { food: 2 } }, resultText: "你小心翼翼地摘下幾片還算新鮮的葉菜，雖然賣相不佳，但確實是難得的新鮮食物來源。" },
      { label: "留著讓它繼續生長", effect: { resources: { food: 1 } }, resultText: "你只摘了一點點，把大部分留下——也許過幾天再來，這裡會長出更多。" }
    ]
  },
  {
    id: "evt_cold_night_wind", title: "刺骨的夜風",
    minDay: 1, maxDay: null, phase: ["night"], weight: 5,
    weightModifier: (state) => state.baseDefense < 2 ? 5 : 0,
    textPool: ["夜裡的風從牆壁的縫隙鑽進來，帶著刺骨的寒意，隱約還夾雜著一絲低頻的嗡鳴。你裹緊身上僅有的衣物，牙齒不自覺地打顫。", "寒風從窗框的縫隙鑽了進來，你把僅有的毯子裹得更緊，聽著風聲夾雜的低鳴，久久無法入睡。", "夜裡的溫度驟降，牆壁縫隙灌進來的風帶著刺骨寒意，你蜷縮在角落，牙齒不住打顫。", "一陣強風吹得窗戶咯咯作響，你把身上能穿的衣物全套上了，仍舊擋不住那股滲入骨子裡的寒意。", "呼嘯的夜風裹挾著細碎的沙塵拍打窗戶，你把火堆撥得更旺一些，才勉強驅散這份寒冷。"],
    options: [
      { label: "用備用材料堵住縫隙", effect: { resources: { scrap: -1 }, baseDefense: 1 }, resultText: "你摸黑找出幾塊木板和破布，把最大的縫隙堵了起來。雖然簡陋，但至少今晚不會再被風吹得睡不著了。" },
      { label: "硬撐過去", endsPhase: true, restless: true, effect: { hp: -2 }, resultText: "你蜷縮在角落，把所有能裹的東西都裹在身上。一夜無眠，醒來時渾身僵硬痠痛。" }
    ]
  },
  {
    id: "evt_photo_album", title: "相本",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 5,
    textPool: ["你在抽屜深處翻到一本相本，裡面是某個家庭的合照——生日派對、海邊旅行、畢業典禮，每一張都笑得燦爛。", "你在櫃子深處翻出一本相本，裡頭夾著幾張泛黃的合照，每張都定格著再普通不過的日常瞬間。", "一本厚重的相本靜靜躺在書架上，翻開後，滿滿都是某個家庭出遊、慶生的溫馨畫面。", "你無意間發現一疊散落的照片，畫面裡的人笑得毫無防備，彷彿末日從未降臨過。", "相本的內頁已經有些黏連，你小心翼翼地翻著，每一張照片都是一段再也回不去的日常。"],
    options: [
      { label: "翻完整本相本", effect: { hp: 1 }, resultText: "你一頁一頁翻完，看著這些素不相識卻無比真實的笑容，心裡某個角落悄悄被填補了一些。你把相本放回原處，輕輕闔上抽屜。" },
      { label: "不忍心看，闔上放回原處", effect: {}, resultText: "你只看了一眼封面，就把相本闔上放回原處——有些東西，還是不要看比較好。" }
    ]
  },
  {
    id: "evt_distant_gunshot", title: "遠方的槍聲",
    minDay: 4, maxDay: null, phase: ["day", "night"], weight: 5,
    weightModifier: (state) => state.day >= 10 ? 3 : 0,
    textPool: ["一聲悶響從遠處傳來，緊接著是第二聲、第三聲——是槍聲，尾音卻拖著一絲不自然的回響，距離不算近，但也絕對不算遠。你的心跳瞬間加快。", "遠處傳來一聲清脆的槍響，緊接著又是幾聲，你立刻壓低身形，警覺地觀察四周動靜。", "一連串槍聲從幾條街外傳來，聽起來像是有人陷入了苦戰，你猶豫著要不要靠近查看。", "悶悶的槍響劃破寂靜，你數了數聲響的間隔，判斷對方距離不算太近，但仍不敢掉以輕心。", "槍聲接連響起，隨後歸於死寂，你握緊武器，靜靜等待了好一陣子才敢繼續前進。"],
    options: [
      { label: "提高警覺，加緊手邊的工作", effect: { baseDefense: 1, resources: { scrap: -1 } }, resultText: "你不敢放鬆，立刻檢查了一遍據點的每個角落，順手把幾處薄弱的防禦補強了一些。槍聲漸漸停了，但那股緊張感久久未散。" },
      { label: "趴低身子，等待平靜", effect: { hp: -1 }, resultText: "你立刻趴低身子，屏住呼吸數著心跳。過了好一陣子，槍聲才終於停止，你才敢重新站起身，後背早已被冷汗浸濕。" }
    ]
  },
  {
    id: "evt_morning_fog", title: "濃霧的早晨",
    minDay: 1, maxDay: null, phase: ["day"], weight: 6,
    textPool: ["推開門，外頭一片濃霧瀰漫，能見度不到十步，霧氣深處隱約有微光流轉，世界彷彿被吞沒在一片灰白之中，連聲音都被悶住了。", "清晨的霧氣濃得化不開，你伸手幾乎看不見指尖，只能憑著記憶摸索前進。", "整座城市籠罩在一片乳白色的濃霧裡，遠處的建築輪廓變得模糊而扭曲。", "你推開門，撲面而來的是一片濃得不太自然的霧氣，帶著一絲若有似無的涼意。", "霧氣厚重得幾乎能用手觸摸，你放慢腳步，小心翼翼地辨認著周遭的動靜。"],
    options: [
      { label: "趁著濃霧掩護外出", effect: { resources: { scrap: 1 }, hp: -1 }, resultText: "霧氣讓你幾乎看不清路，你小心翼翼摸索著前進，雖然多花了不少力氣，但也因為視線受阻意外撿到一些被忽略的雜物。" },
      { label: "等霧散了再說", effect: {}, resultText: "你決定不冒這個險，留在據點裡整理裝備，靜靜等待霧氣散去。" }
    ]
  },
  {
    id: "evt_childrens_drawing", title: "牆上的塗鴉",
    minDay: 1, maxDay: null, phase: ["day"], weight: 5,
    textPool: ["經過一面牆時，你注意到上面有一幅用蠟筆畫的塗鴉——一個太陽、一棟房子、幾個牽著手的小人，旁邊歪歪扭扭寫著一個名字。", "牆上一幅蠟筆塗鴉還留著鮮豔的色彩，畫的是一家人手牽著手站在陽光下。", "你在教室的黑板旁發現一張被貼得很仔細的畫，畫裡的太陽笑得比誰都燦爛。", "走廊牆面上，幾幅孩子的畫作依然完好，稚嫩的筆觸畫著再簡單不過的幸福日常。", "你在一張被翻倒的桌子底下發現一幅畫，畫的是一隻笑臉貓咪，角落簽著一個歪扭的名字。"],
    options: [
      { label: "駐足看了一會兒", effect: { hp: 1 }, resultText: "你站在塗鴉前看了好一會兒，想像著畫下這幅畫的孩子曾經有過的、再平凡不過的一天。不知為何，這讓你覺得自己也該努力撐下去。" }
    ]
  },
  {
    id: "evt_leaking_pipe", title: "漏水的水管",
    minDay: 1, maxDay: null, phase: ["day"], weight: 6,
    textPool: ["牆角一根老舊水管正滴滴答答地漏著水，地上已經積出一小灘水漬，水面上漂著一層極淡的螢光油膜，但水質看起來還算清澈。", "你循著滴水聲找到一根鏽蝕的水管，接口處正緩緩滲出水來，水質看起來還算乾淨。", "天花板的裂縫裡持續滴著水，你在下方擺了個容器，很快就接了小半桶。", "牆壁夾層裡傳來規律的滴水聲，你循聲找到破損的管線，順手收集起漏出的水。", "一根外露的水管接口鬆脫，水正一滴一滴地落在地上，你趕緊拿容器接住。"],
    options: [
      { label: "用容器接水", effect: { resources: { water: 2 } }, resultText: "你找出空容器接在漏水處下方，雖然要花點時間，但慢慢積攢下來，也是一筆不無小補的水源。" },
      { label: "嘗試修補水管", effect: { resources: { scrap: -1 }, baseDefense: 0 }, resultText: "你用隨身的工具和布條把漏水處纏緊，水管總算不再滴水——雖然解決不了根本問題，但至少不再浪費了。" }
    ]
  },
  {
    id: "evt_stray_cat", title: "屋簷下的貓",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 5,
    textPool: ["屋簷下蜷縮著一隻瘦弱的橘貓，看到你靠近也只是抬眼瞄了一下，懶洋洋地沒有要逃跑的意思，似乎已經習慣了人類的存在。", "一隻花色斑駁的貓咪蹲在窗台上，看你經過只是慢悠悠地眨了眨眼，絲毫沒有防備的意思。", "屋簷角落窩著一隻毛髮蓬亂的貓，見你靠近，慵懶地伸了個懶腰，又繼續打起盹來。", "你在巷口遇見一隻獨眼貓，牠謹慎地打量你片刻，隨即若無其事地繼續舔起爪子。", "一隻瘦小的貓咪跟在你身後幾步遠，若即若離，像是在觀察你是否值得信任。"],
    options: [
      { label: "分牠一點食物", effect: { resources: { food: -1 }, hp: 1 }, resultText: "貓咪小心翼翼地嗅了嗅，確認沒有危險後便大口吃了起來。看著牠滿足的樣子，你心裡也跟著放鬆了一些。" },
      { label: "拍拍牠就離開", effect: {}, resultText: "你蹲下身輕輕摸了摸牠的頭，貓咪瞇起眼享受了片刻，便又繼續牠的瞌睡。" }
    ]
  },
  {
    id: "evt_jammed_lock", title: "卡住的保險箱",
    minDay: 2, maxDay: null, phase: ["day"], weight: 5,
    textPool: ["辦公室角落有個小型保險箱，門把已經鏽死，箱體接縫處滲出一絲若有似無的螢光粉塵，但看起來並沒有被人動過的痕跡。", "保險箱的鎖頭鏽死得完全轉不動，你嘗試了幾種方法，最後靠蠻力才勉強撬開一條縫。", "一個小型保管箱靜靜擺在角落，鎖芯已經卡死，你花了不少力氣才把它弄開。", "你在櫃檯底下發現一個上鎖的鐵盒，看起來許久沒被人動過，撬開後裡頭意外地整齊。", "那個保險箱的密碼轉盤早已鏽蝕，你只能用蠻力硬是把它撬開，過程比想像中費勁。"],
    options: [
      { label: "用工具硬撬開", effect: { resources: { scrap: 2 }, hp: -1 }, resultText: "你費了好大力氣才把鏽死的鉸鏈撬開，雖然手被刮傷了一道，但裡面確實藏著一些值錢的零件與五金。" },
      { label: "太費力了，放棄", effect: {}, resultText: "看了看自己僅有的工具，你判斷不值得花這麼多力氣，便轉身離開了。" }
    ]
  },
  {
    id: "evt_thunderstorm", title: "雷陣雨",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 6,
    textPool: ["天色毫無預警地暗了下來，豆大的雨點砸在鐵皮屋頂上，每道閃電劈下時都拖著一絲不該存在的螢綠尾光，轟隆的雷聲一聲接著一聲，整個世界彷彿都在震動。", "雷聲毫無預警地炸開，緊接著暴雨傾盆而下，閃電劃過天際時拖著一抹詭異的色澤。", "天空被厚重的烏雲徹底吞沒，雷電交加中，你能感覺到空氣裡瀰漫著一股電流的氣味。", "一道閃電劈下，短暫照亮了整片天空，雷聲緊接著轟然炸響，震得窗戶嗡嗡作響。", "暴雨毫無徵兆地降下，雨滴打在鐵皮屋頂上噼啪作響，你趕緊確認門窗都關緊了。"],
    options: [
      { label: "出去收集雨水", effect: { resources: { water: 3 }, hp: -1 }, resultText: "你冒著雨把所有空容器擺到屋外，豆大的雨滴打得你睜不開眼，但收穫的雨水足以讓你安心好一陣子。" },
      { label: "待在屋內等雨停", effect: {}, resultText: "你縮在屋內，聽著雨聲打在屋頂上，雷聲一次比一次近，你只希望這場雨不要造成太大的破壞。" }
    ]
  },
  {
    id: "evt_locked_door", title: "上鎖的房間",
    minDay: 1, maxDay: null, phase: ["day"], weight: 5,
    textPool: ["走廊盡頭有一扇房門緊閉著，門縫下透出一絲不太尋常的螢光，門把上掛著一把銅鎖，看起來不算太牢固。", "走廊盡頭那扇門緊閉著，門把上鎖著一把老舊的掛鎖，看起來不算太難對付。", "一扇房門被反鎖著，門縫底下透出一絲微光，你試著轉了轉門把，紋絲不動。", "你注意到這扇門的鎖比其他房間都要新，顯然屋主生前對這裡格外重視。", "那扇緊閉的門後隱約傳來細微的聲響，你握緊工具，準備把鎖撬開一探究竟。"],
    options: [
      { label: "撞開房門", effect: { resources: { scrap: 1, medicine: 1 }, hp: -3 }, resultText: "你後退幾步，用力撞向房門，肩膀傳來一陣劇痛，門鎖應聲斷裂。房內是個小型儲藏室，留有一些零件和藥品。" },
      { label: "尊重隱私，不去打擾", effect: {}, resultText: "上鎖的房間或許代表著某人不希望被打擾的東西，你選擇尊重這份界線，轉身離開。" }
    ]
  },
  {
    id: "evt_campfire_stranger", title: "遠方的營火",
    minDay: 3, maxDay: null, phase: ["night"], weight: 5,
    textPool: ["遠遠地，你看見一處空地上燃著一小堆營火，火光搖曳，隱約能看到一兩個人影圍坐在旁邊，似乎也是倖存者。", "你遠遠看見空地上升起一堆篝火，幾道身影圍坐在旁邊，火光在他們臉上明明滅滅。", "一小簇火光在夜色中格外顯眼，你猶豫著要不要靠近那群同樣在艱難求生的陌生人。", "空地上，幾個倖存者正圍著營火低聲交談，見你靠近，其中一人朝你點了點頭示意。", "你循著火光的方向走去，一群人正分享著手邊僅有的食物，氣氛出乎意料地和睦。"],
    options: [
      { label: "保持距離，靜靜觀察", effect: { resources: { scrap: 1 } }, resultText: "你躲在暗處觀察了好一會兒，那些人似乎只是普通的倖存者，正在低聲交談、烤著什麼東西。你沒有靠近，只是悄悄記下了這個位置，便轉身回到據點，順手撿了路上的廢料。" },
      { label: "不予理會，回到據點", effect: {}, resultText: "在這個年代，主動接觸陌生人風險太高。你壓低身形，繞開那團火光，回到自己的據點。" }
    ]
  },
  {
    id: "evt_broken_radio_message", title: "斷續的求救訊號",
    minDay: 1, maxDay: null, phase: ["night"], weight: 5,
    textPool: ["你隨身攜帶的小型收音機突然發出刺耳的雜訊，夾雜一陣規律到不自然的嗡鳴，接著傳來一段斷斷續續、幾乎聽不清的人聲：「……如果有人聽到……請……回應……」", "收音機忽然發出刺耳雜訊，緊接著傳來一段斷斷續續的呼救聲，訊號很快又消失無蹤。", "你調整天線試圖抓住訊號，收音機裡傳出模糊的求救詞句，聽不清具體內容。", "一陣規律的滴答聲混著雜訊從收音機傳出，像是某種摩斯密碼，你努力想解讀卻徒勞無功。", "收音機忽然自己切換了頻道，傳出一段陌生的廣播詞，內容支離破碎，卻透著一絲不安。"],
    options: [
      { label: "對著收音機回應", effect: { hp: -1 }, resultText: "你按下通話鍵，對著話筒說了幾句話。但無論你怎麼呼叫，對方都沒有再回應，只剩下持續的雜訊聲。你關掉收音機，心裡有些悵然。" },
      { label: "默默把收音機收好", effect: {}, resultText: "你聽著那段斷續的聲音，最終還是沒有按下通話鍵——你不確定自己是否準備好面對另一個聲音背後的故事。" }
    ]
  },
  {
    id: "evt_overgrown_park", title: "荒蕪的遊樂場",
    minDay: 1, maxDay: null, phase: ["day"], weight: 5,
    textPool: ["你經過一座兒童遊樂場，鞦韆隨風輕輕搖晃發出吱呀聲，溜滑梯上爬滿了藤蔓，葉片邊緣泛著淡淡螢光，沙坑裡長出了雜草。", "昔日熱鬧的遊樂場如今雜草叢生，鞦韆隨風輕輕晃動，發出令人心裡發毛的吱呀聲。", "你穿過長滿藤蔓的公園，滑梯早已鏽蝕變形，沙坑裡冒出一叢叢不知名的野草。", "兒童遊樂設施大半被藤蔓吞沒，只剩幾根鏽跡斑斑的鐵架突兀地立在雜草間。", "你在雜草叢生的空地上找到一座荒廢已久的公園，蹺蹺板孤零零地半掩在草叢裡。"],
    options: [
      { label: "在鞦韆上坐一會兒", effect: { hp: 2 }, resultText: "你坐上鞦韆，輕輕晃動著。微風吹過，藤蔓沙沙作響，這片刻的寧靜讓你緊繃的神經難得鬆弛下來。" },
      { label: "翻找器材室", effect: { resources: { scrap: 1 } }, resultText: "遊樂場旁的器材室半掩著門，裡面堆著一些維護用的工具，你撿走了幾樣還能用的零件。" }
    ]
  },
  {
    id: "evt_medicine_cabinet", title: "藥櫃",
    minDay: 1, maxDay: null, phase: ["day"], weight: 6,
    weightModifier: (state) => state.resources.medicine <= 1 ? 4 : 0,
    textPool: ["浴室裡的藥櫃半開著，裡面散落著幾個藥瓶，大部分標籤都已經模糊不清、邊緣泛著一絲詭異的螢光，但其中一兩瓶看起來還算完整。", "你打開這間公寓的藥櫃，裡頭大多是過期的成藥，但角落還藏著一兩瓶密封完好的藥品。", "浴室鏡子後的小櫃子裡整齊排列著幾罐藥瓶，標籤雖然褪色，內容物看起來還能使用。", "你在急救箱底層翻出幾瓶藥品，包裝上覆著薄薄一層灰塵，但看起來保存得還算不錯。", "廚房抽屜深處放著一個小藥盒，裡面的藥品雖然凌亂，但大多還在有效期限內。"],
    options: [
      { label: "仔細檢查每一瓶", effect: { resources: { medicine: 1 } }, resultText: "你一瓶一瓶檢查標籤與保存期限，確認其中一瓶止痛藥還能使用，小心地收進醫療包。" },
      { label: "不確定的藥不要亂拿", effect: {}, resultText: "過期或來路不明的藥物可能比疾病本身更危險，你考慮再三，最終還是沒有拿走任何東西。" }
    ]
  },
  {
    id: "evt_burnt_building", title: "焦黑的建築",
    minDay: 1, maxDay: null, phase: ["day"], weight: 5,
    textPool: ["眼前這棟建築的外牆被燻得焦黑，窗戶全數碎裂，焦痕邊緣泛著一絲詭異的螢光，顯然曾經發生過不只是火災那麼單純的事，但結構看起來還算穩固。", "這棟建築的外牆被燒得焦黑，窗框全數變形，但走進去查看，主體結構意外還算穩固。", "你站在一棟燒毀的樓房前，空氣裡還殘留著淡淡的焦味，內部大概率藏著沒被搜刮完的東西。", "焦黑的牆面爬滿裂痕，你小心翼翼地踏進這棟殘破的建築，留意每一步是否安全。", "一場大火幾乎吞噬了整棟建築，唯獨頂樓幾間房間僥倖逃過，看起來還值得一探。"],
    options: [
      { label: "進去地下室碰碰運氣", effect: { resources: { scrap: 2, food: 1 } }, resultText: "地面樓層幾乎被燒成廢墟，但地下室因為遠離火源，意外保存了一些罐頭與建材，你盡可能多帶了一些。" },
      { label: "太危險了，不進去", effect: {}, resultText: "焦黑的結構隨時可能倒塌，你站在外面看了一會兒，最終還是決定不冒這個險。" }
    ]
  },
  {
    id: "evt_night_patrol_lights", title: "遠方的探照燈",
    minDay: 5, maxDay: null, phase: ["night"], weight: 5,
    weightModifier: (state) => state.day >= 12 ? 3 : 0,
    textPool: ["遠處的天際線上，一道泛著冷色螢光的光束緩緩掃過天空，規律地來回移動——像是某種巡邏的探照燈，但你不確定那是誰在巡邏，又是為了什麼。", "遠方天際線上，一道光束規律地來回掃動，你盯著看了許久，猜不透那究竟是誰在巡邏。", "夜色中，一束冷光緩緩劃過遠方的建築群，像是某種你看不懂的信號。", "你注意到那道探照燈光每隔固定時間就會掃過同一個方向，似乎在標記著什麼。", "遠處的光束忽然停頓了幾秒，彷彿正對著某個方向，你下意識地屏住了呼吸。"],
    options: [
      { label: "熄滅手邊的光源，靜觀其變", effect: {}, resultText: "你立刻吹熄手邊的蠟燭，蹲低身子，看著那道光束緩緩掃過又遠離。直到光束完全消失，你才敢重新點起燈火。" },
      { label: "趁機加緊修補據點", effect: { resources: { scrap: -1 }, baseDefense: 1 }, resultText: "既然外頭的人或物似乎暫時不會靠近這裡，你把握時間加緊修補了據點的防禦，希望能應付未知的威脅。" }
    ]
  },
  {
    id: "evt_shared_meal_memory", title: "餐桌前的回憶",
    minDay: 1, maxDay: null, phase: ["night"], weight: 5,
    weightModifier: (state) => state.companion ? 4 : 0,
    textPool: ["夜深了，你和同伴分著手邊僅有的食物，誰都沒有說話，只有咀嚼的聲音在安靜的據點裡格外清晰。", "你和夥伴分著僅剩的乾糧，誰都沒多說什麼，安靜的咀嚼聲反而讓人格外安心。", "簡單的一餐，你們卻吃得格外認真，彷彿在珍惜每一口得來不易的食物。", "夥伴把自己那份多分了一點給你，你們相視一笑，什麼都不用說。", "圍坐在小小的火堆旁，你們分食著今天的收穫，這份平凡的溫暖此刻顯得格外珍貴。"],
    options: [
      { label: "聊聊各自過去的生活", effect: { hp: 2 }, resultText: "你們有一搭沒一搭地聊著末日前的瑣事——最愛吃的食物、最喜歡的季節。平凡的話題，卻讓彼此都感到一絲久違的溫暖。" },
      { label: "安靜地吃完這一餐", effect: { resources: { food: -1 }, hp: 1 }, resultText: "誰都沒有開口，但這份沉默並不尷尬，反而像是一種彼此都明白、不需言說的陪伴。" }
    ]
  },
  {
    id: "evt_distant_explosion", title: "遠方的爆炸聲",
    minDay: 6, maxDay: null, phase: ["day", "night"], weight: 5,
    weightModifier: (state) => state.day >= 15 ? 3 : 0,
    textPool: ["一聲巨大的轟鳴聲從城市另一端傳來，緊接著是一股泛著淡綠色澤的黑煙緩緩升起，劃破原本灰濛濛的天空。整座城市似乎又少了一個角落。", "遠處一聲巨響震得地面微微搖晃，一柱濃煙隨即竄上灰濛濛的天空。", "城市另一端傳來劇烈的爆炸聲，你抬頭望去，只看見一片詭異的黑煙緩緩擴散。", "一陣悶雷般的轟鳴從遠方傳來，緊接著是短暫的寂靜，讓人更加不安。", "你感覺到地面傳來一陣震動，緊接著遠方升起一團暗綠色的煙霧，久久不散。"],
    options: [
      { label: "默默記下這個方向，避開那裡", effect: {}, resultText: "你站在原地看著那股黑煙，在心裡的地圖上又劃掉了一個區域。能避開的危險，就不要主動靠近。" },
      { label: "繼續手邊的事，不去多想", effect: { resources: { scrap: 1 } }, resultText: "這樣的聲音已經不是第一次聽到了。你深吸一口氣，把注意力拉回手邊的工作——活下去，才是現在唯一重要的事。" }
    ]
  },
  {
    id: "evt_sunset_view", title: "天台上的夕陽",
    minDay: 1, maxDay: null, phase: ["day"], weight: 5,
    textPool: ["你爬上一棟建築的天台透透氣，正巧趕上夕陽西下。橘紅色的餘暉灑滿整座殘破的城市，竟有種說不出的壯麗。", "你爬上天台，正巧趕上落日，橘紅色的餘暉灑滿殘破的街道，竟顯得格外溫柔。", "夕陽緩緩沉入地平線，把整座城市的輪廓染成一片暖橘色，你難得看得出神。", "站在高處俯瞰，落日餘暉中的城市即使殘破，依然美得讓人捨不得移開視線。", "你找了個安靜的角落坐下，看著太陽一點一點沉下去，心情也跟著平靜了不少。"],
    options: [
      { label: "靜靜看完整個日落", effect: { hp: 2 }, resultText: "你在天台邊緣坐下，看著太陽一點一點沉入地平線。即使世界已經面目全非，這份美麗似乎從未真正消失，你的心情也跟著平靜了不少。" },
      { label: "趁著光線勘查附近環境", effect: { resources: { scrap: 1 } }, resultText: "你利用最後的天光，仔細觀察了周遭的地形與建築分布，並順手撿走了天台上幾片還能用的金屬板。" }
    ]
  },
  {
    id: "evt_old_world_cache", title: "封存的舊世儲物櫃",
    minDay: 15, maxDay: null, phase: ["day"], weight: 5,
    textPool: ["在一條久未有人踏足的走廊盡頭，一列金屬儲物櫃整齊地排列著，大多已經鏽蝕變形，但其中一個的鎖頭看起來還很新，表面還殘留著一圈防護用的螢光符文——似乎曾有人試圖保護裡面的東西。", "走廊盡頭一排儲物櫃大多鏽蝕變形，唯獨一個鎖頭完好，似乎曾被人刻意保護過。", "你發現一個保存異常完好的儲物櫃，表面的鎖具明顯經過特別加固。", "這排儲物櫃裡，只有一個角落的看起來被人費心維護過，鎖頭幾乎沒有鏽蝕痕跡。", "你注意到其中一個櫃子的鎖比其他都更新，顯然裡頭裝著對某人而言很重要的東西。"],
    options: [
      { label: "撬開這個鎖頭", effect: { resources: { scrap: -2 }, equipment_pool: ["ocean_pistol", "aero_crossbow", "ocean_mace", "cyber_suit"] }, resultText: "你花了一番力氣才撬開鎖頭，櫃子裡是用油布仔細包裹的裝備——保存狀況出乎意料地好。" },
      { label: "不去打擾，繼續往前", effect: {}, resultText: "你看了那個鎖頭一眼，最終還是沒有伸手。有些東西，或許曾經對某人很重要。" }
    ]
  },
  {
    id: "evt_long_road_silence", title: "長路上的沉默",
    minDay: 18, maxDay: null, phase: ["day", "night"], weight: 5,
    weightModifier: (state) => state.day >= 25 ? 2 : 0,
    textPool: ["走了這麼久，城市的輪廓早已和記憶中的樣子相去甚遠。你停下腳步，回頭望了一眼來時的路——那段路上，曾經發生過太多事。", "走了這麼遠的路，你回頭望了一眼，那些曾經發生過的事，如今都已經模糊得像一場夢。", "這條路你已經走過太多次，每次經過，總會想起第一次踏上這裡時的自己。", "沉默地走著，你忽然意識到，自己好像很久沒有像現在這樣，單純地放空思考了。", "腳步聲在寂靜的街道上格外清晰，你一邊走，一邊回想著這一路走來的種種。"],
    options: [
      { label: "繼續走下去", effect: { san: 3 }, resultText: "你深吸一口氣，重新調整呼吸的節奏。不管前方是什麼，至少你還在往前走，這件事本身就有意義。" },
      { label: "原地休息一下，整理裝備", effect: { resources: { scrap: 1 }, hp: 2 }, resultText: "你找了個還算安全的角落坐下，把裝備一件件檢查、整理。這份規律的動作讓心情也跟著沉穩下來。" }
    ]
  },
  // ---- v1.6內容擴充（SA 34 / v1.6內容擴充提案_詳細規格.html）----
  {
    id: "evt_cleanup_streets", title: "向下輾壓：清掃街道",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 4,
    condition: (state) => state.level >= 7,
    weightModifier: (state) => state.level >= 7 ? 40 : 0,
    textPool: ["你再次回到這片你早已走過無數次的街道。幾隻曾經讓你陷入苦戰的蹣跚感染者咆哮著撲過來，但在你如今的覺醒威壓面前，牠們微弱的骨骼甚至開始顫抖。", "你再度踏上這條早已熟悉的街道。曾經讓你狼狽逃竄的感染者群，如今在你的威壓下甚至不敢真正靠近。", "這片街區的感染者依然徘徊著，但牠們渾濁的雙眼裡明顯多了一絲畏懼——牠們認得你身上的氣息。", "你信步走過這片曾經的鬼門關，零星的感染者見狀紛紛退避三舍，彷彿本能地感知到你已今非昔比。", "熟悉的咆哮聲再次響起，但這次連最凶猛的個體都只是虛張聲勢，很快就夾著尾巴退開了。"],
    options: [
      { label: "發動異能瞬間蒸發牠們", battle: "enemy_walker_weak", battleBonus: { resources: { scrap: 5, food: 3 }, embers: 5 }, resultText: "你只是隨手一揮，牠們就化作了一陣灰燼。" },
      { label: "如同散步般搬空附近的貨架", effect: { resources: { food: 4, water: 4 } }, resultText: "你像逛街一樣，把貨架上的東西一件件丟進背包，毫無壓力。" }
    ]
  },
  {
    id: "evt_clean_convenience", title: "便利商店的異能風暴",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 3,
    condition: (state) => state.level >= 7,
    weightModifier: (state) => state.level >= 7 ? 30 : 0,
    textPool: ["你再次踏入這家便利商店。幾隻曾經讓你差點喪命的蹣跚感染者向你撲來。你冷笑一聲，覺醒的威壓瞬間將牠們震退在地，不敢再上前。", "你再次走進這間便利商店，那些曾讓你手忙腳亂的感染者，如今在你的威壓前只是虛張聲勢地咆哮幾聲。", "貨架間游蕩的感染者一嗅到你的氣息，竟主動讓開了一條路——牠們顯然還記得上次的教訓。", "你踏進這熟悉的空間，昔日的威脅如今看起來格外渺小，幾隻感染者甚至縮到了角落。", "便利商店裡的感染者依舊徘徊著，但沒有一隻敢真正靠近你半步。"],
    options: [
      { label: "如同散步般搬空貨架", effect: { resources: { food: 4, water: 4, scrap: 5 } }, resultText: "你輕鬆地把貨架掃空，這對如今的你來說毫無難度。" }
    ]
  },
  {
    id: "evt_hospital_harvest", title: "洋流寄生的枯萎",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 3,
    condition: (state) => state.level >= 7,
    weightModifier: (state) => state.level >= 7 ? 30 : 0,
    textPool: ["醫院走廊的酸性積水對現在的你來說只是普通的雨水。那些特化變種怪在你的威壓下甚至縮在牆角發抖。", "醫院走廊的酸液積水對現在的你而言不過是尋常雨水，那些特化變種怪甚至不敢直視你的雙眼。", "你重新走進這座醫院，曾經棘手的特化個體如今只是遠遠地發出低吼，不敢輕舉妄動。", "空氣中彌漫的腐蝕氣味已經傷不了你分毫，醫院深處的變種怪在你逼近時紛紛退避。", "你踏過曾讓你九死一生的走廊，那些特化變種怪這次卻選擇了夾著尾巴躲進陰影裡。"],
    options: [
      { label: "強取豪奪醫療庫", effect: { resources: { medicine: 3 }, embers: 15 }, resultText: "你大搖大擺地走進藥品庫，把能拿的都掃進背包。" }
    ]
  },
  {
    id: "evt_epic_loot_discover", title: "廢墟深處的共鳴",
    minDay: 15, maxDay: null, phase: ["day", "night"], weight: 4,
    textPool: ["你在坍塌的地下庫房深處發現了一個密封的軍用合金箱，表面還殘留著微弱的能量波動。", "你在坍塌的倉庫深處發現一個保存完好的合金箱，表面偶爾閃過一絲微弱的能量波動。", "廢棄設施底層，一具塵封已久的儲物櫃靜靜躺著，鎖具比周遭的一切都要先進得多。", "你撬開一處隱蔽的地下夾層，裡頭的箱子外殼冰涼，表面隱約有能量流動的痕跡。", "瓦礫深處露出一角金屬光澤，挖掘後發現是一個保存異常良好的軍規儲物箱。"],
    options: [
      {
        label: "嘗試用異能強行破壞",
        roll: {
          chance: 0.3,
          success: { resultText: "箱子爆裂開來！裡面是一件保存完好的高階裝備。", effect: { equipment_pool: ["cyber_suit", "aero_dagger", "mind_robe"], embers: 20 } },
          fail: { resultText: "防禦機制觸發，強烈電擊襲來！", effect: { hp: -25 } }
        }
      },
      {
        label: "使用黑市代幣賄賂解鎖系統",
        condition: (state) => state.inventory.some(i => i.itemId === "merchant_token"),
        effect: { equipment_pool: ["ocean_mace", "aero_crossbow", "cyber_hammer", "mind_fork"] },
        resultText: "你出示了黑市的代幣，系統發出綠光，箱蓋緩緩開啟。"
      }
    ]
  },
  {
    id: "evt_gambler_dial", title: "命運的改裝老虎機",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 2,
    textPool: ["你在廢墟中發現一台插著軍用電池、螢幕閃爍的改裝老虎機。\n\n上面漆著一行字：「投入廢料，贏取覺醒結晶。」", "一台老虎機半埋在瓦礫堆裡，螢幕上跑著雜訊般的燈光，投幣孔卻詭異地泛著微光。", "你在廢墟裡發現一台還通著電的改裝老虎機，機身上潦草地刻著「投入廢料，贏取覺醒結晶」。", "角落擺著一台外殼斑駁的老虎機，拉桿早已鏽蝕，螢幕卻依然固執地閃爍著誘人的圖案。", "你踢到一台傾倒的老虎機，機身晃了晃後竟自己亮了起來，彷彿在邀請你賭上一把。"],
    options: [
      {
        label: "投入5個廢料賭一把",
        requiresResource: { scrap: 5 },
        roll: {
          chance: 0.35,
          success: { resultText: "機台瘋狂閃爍，吐出一枚覺醒結晶！", effect: { resources: { scrap: -5 }, skillPoint: 1 } },
          fail: { resultText: "機器漏電，你被電得手麻，廢料也打了水漂。", effect: { resources: { scrap: -5 }, hp: -15 } }
        }
      },
      { label: "直接暴力拆解", effect: { resources: { scrap: 3 } }, resultText: "你三兩下拆了機殼，扯出裡面值錢的零件。" }
    ]
  },
  {
    id: "evt_blood_altar", title: "異變的深淵黑血祭壇",
    minDay: 1, maxDay: null, phase: ["night"], weight: 2,
    textPool: ["一具巨大的變異生物屍體靠在牆角，牠的傷口流出柏油般的黑血，卻散發著強烈的靈能波動。\n\n你的覺醒核心正在瘋狂鳴叫。", "一具龐大的異變生物屍體癱在牆角，傷口滲出的黑色液體帶著強烈的靈能波動，讓你的覺醒核心隱隱作痛。", "你在陰暗的角落發現一具巨大的屍骸，牠體內殘留的靈能餘波依然強烈得讓你頭皮發麻。", "空氣中瀰漫著一股濃烈的靈能氣息，循著氣味找去，只見一具尚未完全冷卻的變異生物屍體。", "你的覺醒核心毫無預警地劇烈鳴動，循著這股牽引走去，發現了一具滲著黑血的巨大屍體。"],
    options: [
      { label: "飲下異變黑血", effect: { hp: -15, san: -40, statBoost: { hpMax: 5 } }, resultText: "一股灼熱感從喉頭直衝腦門，你感覺身體正在被重塑——但精神也隨之劇烈震盪。" },
      { label: "用酒精淨化火化", effect: { embers: 15 }, resultText: "你謹慎地將屍體焚毀，並從殘骸的反應中領悟到一些覺醒相關的知識。" }
    ]
  },
  {
    id: "evt_mirage_hall", title: "窒息的石英幻覺",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 0,
    condition: (state) => state.san < 50,
    weightModifier: (state) => state.san < 50 ? 8 : 0,
    text: "空氣中的石英粉塵突然凝聚成你舊時代家人的模樣。\n\n他們向你招手，但你很清楚，牠們的皮囊下是無數蠕動的發光菌絲。",
    options: [
      {
        label: "閉上眼硬闖過去",
        roll: {
          chance: 0.7,
          success: { resultText: "你緊閉雙眼，咬牙衝過那片幻象，腦中卻閃過一絲清明。", effect: { san: 5 } },
          fail: { resultText: "幻象的呢喃鑿入你的意識，你陷入了短暫的混亂。", effect: { san: -20 } }
        }
      },
      {
        label: "裝備澄澈石英眼眸",
        condition: (state) => isEquippedInData(state, "accessory", "mind_eye"),
        effect: { embers: 20 },
        resultText: "透過石英眼眸，你看穿了幻覺的本質——只是粉塵與回憶的殘影。你在廢墟中順手撿到一些晶燼。"
      }
    ]
  },
  {
    id: "evt_wandering_chef", title: "黑市末日廚師",
    minDay: 1, maxDay: null, phase: ["day"], weight: 6,
    condition: (state) => (state.resources.food || 0) >= 3,
    textPool: ["一個穿著防護衣、推著改裝餐車的怪人攔住你：「嘿，旅人！拿3份生罐頭給我，我幫你調配成能活化細胞的『超能亂燉』！」", "一輛掛滿廚具的餐車突兀地停在路邊，操作者裹著全罩式防護服，操著怪異腔調招呼你試試他的「新式配方」。", "你被一陣詭異的香氣吸引過去，一個戴著防毒面具、腰間掛滿調味罐的男人正得意地攪拌鍋裡冒著螢光泡泡的濃湯。", "「試試看嘛，保證吃了精神百倍！」一個推著改裝餐車的怪人纏著你不放，鍋裡的內容物顏色詭異得讓人卻步。", "巷口飄來陣陣油煙味，一個戴著廚師帽的改造人正對著空氣自言自語，一邊往鍋裡加入來路不明的螢光粉末。"],
    options: [
      { label: "交出物資烹飪", effect: { resources: { food: -3 }, equipment_pool: ["energy_drink"] }, resultText: "他三兩下變出一罐冒著詭異藍光的飲料塞給你。" },
      { label: "拒絕並離開", effect: {}, resultText: "你搖搖頭，繼續往前走。" }
    ]
  },
  {
    id: "evt_failed_exp_01", title: "逃亡的實驗體",
    minDay: 5, maxDay: 7, phase: ["day", "night"], weight: 6,
    condition: (state) => !state.flags || (!state.flags.saved_cyborg && !state.flags.betrayed_cyborg),
    textPool: ["一個身上插著實驗導管、皮膚已經高度「鋼鐵活化」異變的改造人倒在路邊，後面傳來大批感染者的咆哮聲。他向你遞出一個加密硬碟。", "一名渾身插滿導管的實驗體倒臥在瓦礫堆裡，皮膚下的機械紋路仍微微發光，他用盡最後力氣把一個加密裝置塞進你手裡。", "你聽見微弱的電流聲，循聲找到一具尚有氣息的改造人，他嘴唇顫抖著吐出幾個破碎的代號，隨即徹底斷氣。", "一具半機械化的軀體卡在坍塌的管線間，殘存的義肢還在無意義地抽搐，胸口別著一枚陌生的識別證。", "你循著金屬摩擦聲找到一名奄奄一息的實驗體，他的義眼閃爍幾下後徹底熄滅，手裡緊攥著的硬碟卻還溫熱。"],
    options: [
      { label: "背起他一起逃", battle: "enemy_walker_armed", battleBonus: { setFlag: "saved_cyborg" }, resultText: "你拉起他的手臂架在肩上，轉身就跑，身後傳來追逐的咆哮聲。" },
      { label: "拿走硬碟，把他推向喪屍", effect: { setFlag: "betrayed_cyborg", embers: 50 }, resultText: "你迅速抽走硬碟，將他推向逼近的感染者群，趁亂逃離。" }
    ]
  },
  {
    id: "evt_cyborg_revenge", title: "鋼鐵活化的鋼鐵洪流",
    minDay: 1, maxDay: null, phase: ["night"], weight: 0,
    condition: (state) => state.flags && state.flags.saved_cyborg && (state.day - state.flags.saved_cyborg) >= 5 && !state.flags.cyborg_revenge_done,
    weightModifier: (state) => (state.flags && state.flags.saved_cyborg && (state.day - state.flags.saved_cyborg) >= 5 && !state.flags.cyborg_revenge_done) ? 45 : 0,
    text: "夜晚，安全屋的警報突然嗡嗡作響！那位被你救下的改造人帶著改裝的外骨骼工作台敲開了你的門。",
    options: [
      { label: "歡迎老朋友", effect: { equipment_pool: ["cyber_pendant"], furniture: ["furn_bench"], setFlag: "cyborg_revenge_done" }, resultText: "他將硬碟交給你解密，並留下了一張外骨骼重組工作台的圖紙——你的據點又添了一件實用設施。" }
    ]
  },
  {
    // 2026-07-04新增：evt_failed_exp_01是day5~7的窄天數窗口(weight僅6，並非保證觸發)，加上「拯救」分支
    // (saved_cyborg)完全不會走到betrayed_cyborg/cyborg_nemesis_done，導致ach_cyborg_nemesis跟
    // ach_betrayal_path這兩個成就在「錯過窗口」或「選了拯救」的情況下永久拿不到——使用者明確表示不希望
    // 成就需要開新檔重來才能補上，要求「這次有這問題，下次換一個類似的出現，但只剩下另一個選擇」。
    // 這裡不重寫拯救分支已經定案的劇情(改造人已經留下來當朋友、送了工作台，不該走回頭路又要背叛同一個人)，
    // 而是讓「這座城市不只做過一次這種實驗」——另一名處境相同的實驗體再次出現，但這次沒有拯救的餘裕，
    // 只有唯一一條路可走。之後接續的cyborg_nemesis_done判定式是通用的(只認betrayed_cyborg旗標值，不管
    // 是哪個事件設的)，所以這裡只需要設旗標，既有的evt_cyborg_nemesis會自動接手後續的機械巨怪決戰
    id: "evt_second_augmented", title: "似曾相識的實驗體",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 0,
    condition: (state) => !!(state.flags && !state.flags.betrayed_cyborg && !state.flags.cyborg_nemesis_done
      && state.day >= 20 && (!state.flags.saved_cyborg || state.flags.cyborg_revenge_done)),
    weightModifier: (state) => (state.flags && !state.flags.betrayed_cyborg && !state.flags.cyborg_nemesis_done
      && state.day >= 20 && (!state.flags.saved_cyborg || state.flags.cyborg_revenge_done)) ? 40 : 0,
    text: "又一次，你撞見一具插著實驗導管的身影——這座城市顯然不只做過一次這種實驗。他傷勢比記憶中那次更重，手裡死死攥著硬碟，追兵的咆哮已近在咫尺，這次你沒有猶豫的餘裕。",
    options: [
      { label: "拿走硬碟，趁亂逃離", effect: { setFlag: "betrayed_cyborg", embers: 50 }, resultText: "你抽走他手裡的硬碟，趁著混亂轉身離開，身後的咆哮聲很快將他吞沒。" }
    ]
  },
  {
    id: "evt_cyborg_nemesis", title: "索命的機械巨怪",
    minDay: 1, maxDay: null, phase: ["night"], weight: 0,
    condition: (state) => state.flags && state.flags.betrayed_cyborg && (state.day - state.flags.betrayed_cyborg) >= 5 && !state.flags.cyborg_nemesis_done,
    weightModifier: (state) => (state.flags && state.flags.betrayed_cyborg && (state.day - state.flags.betrayed_cyborg) >= 5 && !state.flags.cyborg_nemesis_done) ? 45 : 0,
    text: "大門被暴蠻力轟開！那個被你出賣的改造人如今已被病毒完全吞噬，半個身體融入了重型機械，化身為「鋼鐵湮滅者」前來索命！",
    options: [
      { label: "迎戰", battle: "enemy_cyborg_nemesis", battleBonus: { embers: 60, equipment_pool: ["cyber_suit"], setFlag: "cyborg_nemesis_done" }, resultText: "你深吸一口氣，迎向了這場無法迴避的決戰。" },
      { label: "死守據點硬撐過去", endsPhase: true, restless: true, effect: { hp: -30, setFlag: "cyborg_nemesis_done" }, resultText: "你死守在據點裡，巨怪的重拳一次次砸在防禦工事上。你渾身是傷，但終究撐到了天亮——牠似乎暫時退去了。" }
    ]
  },
  // ---------- 2026-07-04 V3多同伴後勤系統：老周/小雨/阿海招募事件 ----------
  // 三人皆走「一次性遭遇事件，選擇邀請即設定對應flags，供COMPANIONS_REGISTRY的unlockCondition讀取」
  // 的簡單模式，跟雷恩(序章/evt_stranger_returns)、艾莉/阿卡(設施等級自動解鎖)是三種不同但各自合理的
  // 招募管道，不強求統一成同一套機制
  {
    id: "evt_recruit_laozhou", title: "巷口的修理鋪",
    minDay: 15, maxDay: null, phase: ["day"], weight: 6,
    condition: (state) => !(state.flags && state.flags.laozhou_recruited),
    text: "巷口傳來規律的敲打聲，一個滿手油污的老頭正蹲著修理一台報廢的收音機。「爛掉的東西，很多時候只是沒人願意花時間修。」你們攀談幾句，他似乎對你的據點頗感興趣。",
    options: [
      { label: "邀請他到據點常駐", effect: { setFlag: "laozhou_recruited", resources: { scrap: -5 } }, resultText: "他收拾起工具，跟著你回到據點。「工作台借我用用，我會讓你的裝備煥然一新的。」老周咧嘴一笑，露出缺了角的牙。" },
      { label: "道謝後離開", effect: { scrap: 2 }, resultText: "你婉拒了他的好意，他倒也不介意，隨手塞給你幾件零件當作臨別禮。" }
    ]
  },
  {
    id: "evt_recruit_xiaoyu", title: "清點物資的少女",
    minDay: 20, maxDay: null, phase: ["day"], weight: 6,
    condition: (state) => !(state.flags && state.flags.xiaoyu_recruited),
    text: "你在臨時避難所遇見一個正仔細清點物資的年輕女孩，筆記本上密密麻麻寫滿消耗速度與存量預估。「囤積不難，難的是知道何時該省、何時該用。」她抬頭看了你一眼。",
    options: [
      { label: "邀請她加入據點", effect: { setFlag: "xiaoyu_recruited", resources: { food: -2, water: -2 } }, resultText: "小雨點點頭，收拾好她那本寫滿數字的筆記本跟著你走。「以後強化據點的開銷，交給我來想辦法。」" },
      { label: "只是閒聊幾句便道別", effect: { exp: 5 }, resultText: "你們聊了聊末日後的生存心得，雖然沒有進一步發展，這段對話還是讓你學到了一些東西。" }
    ]
  },
  {
    id: "evt_recruit_ahai", title: "熟悉地圖的旅人",
    minDay: 10, maxDay: null, phase: ["day"], weight: 6,
    condition: (state) => !(state.flags && state.flags.ahai_recruited),
    text: "一個背著超載背包的男人對著手繪地圖喃喃自語，標滿密密麻麻的符號。「這條路危險，那條有東西——每一寸我都用命換過經驗。」他注意到你也在探索，露出感興趣的表情。",
    options: [
      { label: "邀請他隨行遠征", effect: { setFlag: "ahai_recruited" }, resultText: "阿海將地圖捲起收好。「跟緊點，我知道哪裡值得挖，哪裡最好繞道。」從今以後，他會在你外出時提供額外的收穫。" },
      { label: "只是交換一下情報", effect: { exp: 5 }, resultText: "你們交換了彼此知道的地點情報，雖然他沒有留下，這些消息想必之後會派上用場。" }
    ]
  },
  // ---------- 2026-07-05 同伴劇情線：6同伴各3階段，見規格文件「同伴劇情線_設計規格.md」 ----------
  // 每階段沿用evt_second_augmented同一種condition/flags鏈式模式，不使用weight:0+weightModifier
  // （不需要「一定要優先觸發」的急迫感，維持跟一般事件同池競爭的weight:6即可，反正只看flag不看機率窗口，
  // 不會有錯過就永久拿不到的問題）。setFlag存的是「哪一天設定的」，第2/3階用「距上一階至少10天」做相對門檻。
  {
    id: "evt_arc_laozhou_1", title: "深夜的工作台",
    minDay: 20, maxDay: null, phase: ["night"], weight: 6,
    condition: (state) => companionRecruited(state, "老周") && !(state.flags && state.flags["老周_arc1"]),
    text: "深夜，你路過老周的工作台，發現他還沒睡——正低頭擺弄著一台老舊的收音機，工具散了一桌。見你靠近，他手忙腳亂地想把東西藏起來，隨口說著「隨便修修，打發時間」，語氣卻有些不自然。",
    options: [
      { label: "沒有多問，先回去休息", effect: { setFlag: "老周_arc1" }, resultText: "你識趣地沒有追問，只是那台缺了個零件的收音機，看起來莫名眼熟——你一時想不起在哪見過。" }
    ]
  },
  {
    id: "evt_arc_laozhou_2", title: "缺角的收音機",
    minDay: 1, maxDay: null, phase: ["night"], weight: 6,
    condition: (state) => daysSinceFlagAtLeast(state, "老周_arc1", 10) && !(state.flags && state.flags["老周_arc2"]),
    text: "你終於想起來——那台老周深夜偷偷修的收音機，跟他當初蹲在巷口修理、最後被你邀請入伙的那台報廢收音機，是同一台。你趁著他去打水，多看了兩眼，才發現機身內側刻著一行褪色的名字縮寫，不是老周自己的。",
    options: [
      { label: "問他這台收音機的來歷", effect: { setFlag: "老周_arc2" }, resultText: "老周沉默了很久，才低聲說那是他女兒的。訊號塔倒下那晚，她說要出去找爸爸最後留的頻率，就再也沒回來——這台收音機，是她留給老周唯一的東西。" }
    ]
  },
  {
    id: "evt_arc_laozhou_3", title: "沙啞的老歌",
    minDay: 1, maxDay: null, phase: ["night"], weight: 6,
    condition: (state) => daysSinceFlagAtLeast(state, "老周_arc2", 10) && !(state.flags && state.flags["老周_arc_done"]),
    text: "老周喊住你，說收音機終於修好了。他把它擺在工作台正中央，轉開開關——先是一陣刺耳的雜訊，接著，一段沙啞卻辨得出旋律的老歌斷斷續續地流洩出來。他的眼眶有些發紅，卻笑著說「她以前最愛聽這首」。",
    options: [
      { label: "陪他把這首歌聽完", effect: { setFlag: "老周_arc_done" }, resultText: "你在他身邊坐下，什麼都沒說，只是陪他把這首斷續的老歌聽到最後。老周輕輕拍了拍收音機，像是道別，又像是終於放下。「往後裝備維修，算你優惠一點。」他嗓音有些啞，卻少了平時的滄桑。" }
    ]
  },
  {
    id: "evt_arc_leien_1", title: "異常緊繃的守夜",
    minDay: 20, maxDay: null, phase: ["night"], weight: 6,
    condition: (state) => companionRecruited(state, "雷恩") && !(state.flags && state.flags["雷恩_arc1"]),
    text: "輪到雷恩守夜的那晚，你發現他比平常更加緊繃——聽到一點風吹草動就猛地轉身，握著武器的手指節發白。你問他怎麼了，他只是搖搖頭，說「習慣了，多留意總沒有壞處」，語氣裡卻藏著一絲你從沒見過的不安。",
    options: [
      { label: "不勉強追問，先讓他休息", effect: { setFlag: "雷恩_arc1" }, resultText: "你沒有繼續追問，只是那份反常的警覺，讓你開始留意起雷恩過去甚少提起的事。" }
    ]
  },
  {
    id: "evt_arc_leien_2", title: "沒能守住的那次",
    minDay: 1, maxDay: null, phase: ["night"], weight: 6,
    condition: (state) => daysSinceFlagAtLeast(state, "雷恩_arc1", 10) && !(state.flags && state.flags["雷恩_arc2"]),
    text: "一次閒聊時，雷恩難得鬆口，說起自己曾經也是某個小據點的守衛——直到一個平靜的夜裡，他判斷失誤，讓一群掠奪者摸了進來。「我沒能守住任何人。」他盯著手裡的武器，聲音很輕，「從那之後，我不敢再掉以輕心。」",
    options: [
      { label: "告訴他，這裡不一樣", effect: { setFlag: "雷恩_arc2" }, resultText: "雷恩沒有回應，只是深深看了你一眼，像是把這句話收進了心裡某個角落。" }
    ]
  },
  {
    id: "evt_arc_leien_3", title: "卸下防備的血月夜",
    minDay: 1, maxDay: null, phase: ["night"], weight: 6,
    condition: (state) => daysSinceFlagAtLeast(state, "雷恩_arc2", 10) && !(state.flags && state.flags["雷恩_arc_done"]),
    text: "又一個血月夜過去，據點的圍欄依然完好無損。雷恩坐在哨位上，罕見地卸下了一貫的緊繃，任由武器靠在腳邊。「這次，總算守住了。」他輕聲說，像是說給自己聽，也像是說給那個他沒能守住的人聽。",
    options: [
      { label: "在他身邊坐下", effect: { setFlag: "雷恩_arc_done" }, resultText: "你在他身邊坐下，一起望著漸漸亮起的天色。雷恩難得露出一絲近乎輕鬆的神情：「有你在，這次守住的機率，好像又更高了一點。」" }
    ]
  },
  {
    id: "evt_arc_aili_1", title: "溫室角落的小盆栽",
    minDay: 20, maxDay: null, phase: ["day"], weight: 6,
    condition: (state) => companionRecruited(state, "艾莉") && !(state.flags && state.flags["艾莉_arc1"]),
    text: "整理溫室時，你注意到角落擺著一株跟作物完全無關的小盆栽，明顯被細心呵護過——葉片修剪得整整齊齊，土壤濕度也控制得剛剛好。艾莉看見你在看，臉上閃過一絲慌張，隨口說「順手種的，別在意」。",
    options: [
      { label: "沒有追問，繼續手邊的事", effect: { setFlag: "艾莉_arc1" }, resultText: "你沒有多問，只是那盆植物明顯不屬於溫室原本的作物清單，讓你多留了個心眼。" }
    ]
  },
  {
    id: "evt_arc_aili_2", title: "帶著思念的種子",
    minDay: 1, maxDay: null, phase: ["day"], weight: 6,
    condition: (state) => daysSinceFlagAtLeast(state, "艾莉_arc1", 10) && !(state.flags && state.flags["艾莉_arc2"]),
    text: "你找了個機會，隨口問起那株小盆栽的來歷。艾莉沉默了一下，才輕聲說，那是她從家裡帶出來的最後一點東西——「城市淪陷那天，我只來得及抓一把種子。種下的每一株，都像是還留著一點『家』的樣子。」",
    options: [
      { label: "靜靜聽她說完", effect: { setFlag: "艾莉_arc2" }, resultText: "你沒有說什麼安慰的話，只是靜靜聽她把話說完。艾莉抹了抹眼角，笑了笑，繼續回頭照料她的溫室。" }
    ]
  },
  {
    id: "evt_arc_aili_3", title: "終於開花",
    minDay: 1, maxDay: null, phase: ["day"], weight: 6,
    condition: (state) => daysSinceFlagAtLeast(state, "艾莉_arc2", 10) && !(state.flags && state.flags["艾莉_arc_done"]),
    text: "那株小盆栽，終於開出一朵不起眼卻鮮豔的小花。艾莉蹲在花前看了很久，才小心翼翼摘下幾顆種子，走過來遞到你手上。「分你一點——也許你的庭院，也能有個地方留住點什麼。」",
    options: [
      { label: "收下這份心意", effect: { setFlag: "艾莉_arc_done" }, resultText: "你鄭重地收下那幾顆種子。艾莉的笑容裡少了幾分小心翼翼，多了一份久違的踏實。「往後你們的休息，我會顧得更仔細一點。」" }
    ]
  },
  {
    id: "evt_arc_aka_1", title: "血月夜前的沉默",
    minDay: 20, maxDay: null, phase: ["day"], weight: 6,
    condition: (state) => companionRecruited(state, "阿卡") && !(state.flags && state.flags["阿卡_arc1"]),
    text: "又一次血月將至，阿卡卻反常地異常沉默，一個人站在防禦工事前檢查了一遍又一遍，眼神飄向很遠的地方，像是想起了什麼不願觸碰的事。",
    options: [
      { label: "先不打擾他", effect: { setFlag: "阿卡_arc1" }, resultText: "你沒有出聲，只是那種近乎執著的沉默，讓你隱約察覺阿卡跟血月之間，或許藏著比你以為的更深的過去。" }
    ]
  },
  {
    id: "evt_arc_aka_2", title: "親手了結的那次",
    minDay: 1, maxDay: null, phase: ["day"], weight: 6,
    condition: (state) => daysSinceFlagAtLeast(state, "阿卡_arc1", 10) && !(state.flags && state.flags["阿卡_arc2"]),
    text: "撐過那場血月後，阿卡難得主動開口，說起自己曾經有個親近的人被感染——「變成那樣之後，能做的只剩一件事。」他頓了頓，聲音很平靜，卻透著壓抑許久的沉重，「是我親手了結的。」",
    options: [
      { label: "沒有評判，只是陪著他", effect: { setFlag: "阿卡_arc2" }, resultText: "你沒有說任何評判的話，只是安靜地陪在他身邊。阿卡看了你一眼，像是鬆了口氣——這件事，他已經一個人扛了很久。" }
    ]
  },
  {
    id: "evt_arc_aka_3", title: "無需言語的理解",
    minDay: 1, maxDay: null, phase: ["night"], weight: 6,
    condition: (state) => daysSinceFlagAtLeast(state, "阿卡_arc2", 10) && !(state.flags && state.flags["阿卡_arc_done"]),
    text: "又一場血月狂潮過去，據點再次撐了下來。阿卡站在硝煙未散的防禦工事前，罕見地卸下了慣有的緊繃神情，朝你點了點頭——那個動作裡，有種無需言語就能懂的東西。",
    options: [
      { label: "回以同樣的點頭", effect: { setFlag: "阿卡_arc_done" }, resultText: "你回以同樣的點頭。從這天起，阿卡在血月夜裡的防禦部署，似乎又更沉穩了幾分。" }
    ]
  },
  {
    id: "evt_arc_xiaoyu_1", title: "帳本裡的另一頁",
    minDay: 20, maxDay: null, phase: ["day"], weight: 6,
    condition: (state) => companionRecruited(state, "小雨") && !(state.flags && state.flags["小雨_arc1"]),
    text: "你無意間瞄到小雨的帳本，除了密密麻麻的物資紀錄，角落還有一頁反覆塗改、寫著日期跟一個名字的筆跡。她發現你在看，迅速把帳本闔上，只說了句「習慣，別在意」。",
    options: [
      { label: "沒有追問", effect: { setFlag: "小雨_arc1" }, resultText: "你沒有多問，只是那個反覆出現的名字，跟其他頁面工整的物資紀錄格格不入，讓你有些好奇。" }
    ]
  },
  {
    id: "evt_arc_xiaoyu_2", title: "失散的人",
    minDay: 1, maxDay: null, phase: ["day"], weight: 6,
    condition: (state) => daysSinceFlagAtLeast(state, "小雨_arc1", 10) && !(state.flags && state.flags["小雨_arc2"]),
    text: "聊起帳本裡那個名字，小雨終於鬆口——那是她失散的家人，城市淪陷那天走散，再也沒能聯繫上。「我一直在記著各地傳回來的消息，哪怕只是隻字片語。」她的聲音很輕，「說不定哪天，能拼湊出他的下落。」",
    options: [
      { label: "答應幫她留意消息", effect: { setFlag: "小雨_arc2" }, resultText: "小雨愣了一下，隨即露出一個有些勉強卻真心的笑容。「謝謝你。」她把帳本重新收好，像是把這份牽掛，暫時交給了你一起扛。" }
    ]
  },
  {
    id: "evt_arc_xiaoyu_3", title: "得到消息",
    minDay: 1, maxDay: null, phase: ["day"], weight: 6,
    condition: (state) => daysSinceFlagAtLeast(state, "小雨_arc2", 10) && !(state.flags && state.flags["小雨_arc_done"]),
    text: "一次探索歸來，你帶回了一則輾轉聽來的消息——關於小雨一直在找的那個人。你把消息告訴她，她盯著那張字條看了很久很久，眼眶泛紅，卻先深深吸了一口氣。",
    options: [
      { label: "把消息完整地告訴她", effect: { setFlag: "小雨_arc_done" }, resultText: "無論消息是好是壞，小雨最終還是輕輕點了頭，把那頁反覆塗改的紀錄，仔細地闔上收好。「謝謝你，陪我把這件事，做了個了結。」她的眼神，似乎也因此篤定了一些。" }
    ]
  },
  {
    id: "evt_arc_ahai_1", title: "刻意繞開的路線",
    minDay: 20, maxDay: null, phase: ["day"], weight: 6,
    condition: (state) => companionRecruited(state, "阿海") && !(state.flags && state.flags["阿海_arc1"]),
    text: "規劃遠征路線時，你發現阿海那張畫滿符號的地圖上，有一塊區域被刻意留白——沒有任何標記，甚至連危險提示都沒有。你隨口提起，他立刻收起地圖，語氣少見地生硬：「那裡，不用去。」",
    options: [
      { label: "沒有勉強他", effect: { setFlag: "阿海_arc1" }, resultText: "你沒有再多說什麼，只是那片刻意留白的地圖角落，跟阿海平時鉅細靡遺的標註方式截然不同，讓你隱約猜到那裡藏著什麼。" }
    ]
  },
  {
    id: "evt_arc_ahai_2", title: "他無法承受的事",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 6,
    condition: (state) => daysSinceFlagAtLeast(state, "阿海_arc1", 10) && !(state.flags && state.flags["阿海_arc2"]),
    text: "一次夜談，阿海終於說起那片留白的地方——深埋地下避難所，曾經是他帶隊撤離的地點。「我以為那裡最安全。」他的聲音很低，「結果，是我這輩子帶過最多人進去，卻帶最少人出來的一次。」",
    options: [
      { label: "沒有催促，只是聽他說完", effect: { setFlag: "阿海_arc2" }, resultText: "你沒有催促，只是靜靜聽他把那段記憶說完。阿海苦笑了一下，把地圖上那片留白，第一次補上了一個小小的記號。" }
    ]
  },
  {
    id: "evt_arc_ahai_3", title: "一起去面對",
    minDay: 1, maxDay: null, phase: ["day"], weight: 6,
    condition: (state) => daysSinceFlagAtLeast(state, "阿海_arc2", 10) && !(state.flags && state.flags["阿海_arc_done"]),
    text: "阿海主動提起，想再去一次那座深埋地下避難所——不是為了忘記，而是想親眼確認，那裡如今變成了什麼樣子。「這次，陪我一起去嗎？」",
    options: [
      { label: "陪他走這一趟", effect: { setFlag: "阿海_arc_done" }, resultText: "你們並肩走進那座塵封已久的地下避難所。斷裂的管線、鏽蝕的門，一如阿海記憶中那樣沉重——但這一次，他不是一個人面對。走出來時，他罕見地舒了一口氣：「往後帶你去哪，我都能更放心一點。」" }
    ]
  },
  // ---------- 2026-07-06 同伴劇情線後日談：6同伴各1則，30小時內容量審視延伸——劇情線本身正常節奏
  // day100內就會全部完結(見TODO「30小時內容量審視」)，這裡不是新劇情線，是低頻率的關係加溫小品，
  // 讓劇情線完成後的同伴不會就此在敘事上銷聲匿跡。跟劇情線三階段不同，這裡是「循環事件」不是「一次性連鎖」，
  // 只要條件成立就會持續留在事件池被抽到，weight:5比照其他低頻率flavor事件的量級
  {
    id: "evt_epilogue_laozhou", title: "工作台旁的哼唱",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 5,
    condition: (state) => companionRecruited(state, "老周") && !!(state.flags && state.flags["老周_arc_done"]),
    text: "你路過老周的工作台，他一邊修理著手裡的裝備，一邊跟著收音機裡放的老歌哼唱，聲音沙啞卻放鬆。見你經過，他也不覺得不好意思，反而笑著多哼了兩句。",
    options: [
      { label: "陪他聽完這段旋律", effect: { san: 5 }, resultText: "你在一旁多站了一會兒，聽著那段熟悉的旋律，心裡也跟著鬆快了些。" }
    ]
  },
  {
    id: "evt_epilogue_leien", title: "難得放鬆的哨位",
    minDay: 1, maxDay: null, phase: ["night"], weight: 5,
    condition: (state) => companionRecruited(state, "雷恩") && !!(state.flags && state.flags["雷恩_arc_done"]),
    text: "輪到雷恩守夜時，你發現他難得地卸下了一貫的緊繃神情，靠著牆隨口跟你聊起最近據點的瑣事，語氣裡少了過去的警戒感。",
    options: [
      { label: "陪他聊了幾句", effect: { san: 5 }, resultText: "簡單的閒聊沒有什麼重點，但這份輕鬆的氣氛，本身就是一種難得的安穩。" }
    ]
  },
  {
    id: "evt_epilogue_aili", title: "多開了幾朵花",
    minDay: 1, maxDay: null, phase: ["day"], weight: 5,
    condition: (state) => companionRecruited(state, "艾莉") && !!(state.flags && state.flags["艾莉_arc_done"]),
    text: "溫室角落，那株曾經只有一朵花的小盆栽，如今已經開得更加茂盛。艾莉蹲在一旁仔細照料著，看見你過來，笑著指了指其中一朵：「這朵最漂亮，你看。」",
    options: [
      { label: "認真欣賞了一下", effect: { san: 5 }, resultText: "你順著她指的方向看去，那朵花確實開得格外精神——像是這段日子裡，某種說不清的東西也跟著慢慢長回來了。" }
    ]
  },
  {
    id: "evt_epilogue_aka", title: "血月後的沉默陪伴",
    minDay: 1, maxDay: null, phase: ["night"], weight: 5,
    condition: (state) => companionRecruited(state, "阿卡") && !!(state.flags && state.flags["阿卡_arc_done"]),
    text: "又一次血月夜過去，阿卡沒有像過去那樣獨自沉默地離開，而是在你身邊坐了下來，兩人誰都沒說話，只是靜靜看著天色一點一點亮起來。",
    options: [
      { label: "陪他一起看著天亮", effect: { san: 5 }, resultText: "不需要言語，這份並肩撐過血月夜的沉默，本身就已經足夠。" }
    ]
  },
  {
    id: "evt_epilogue_xiaoyu", title: "帳本上多了一頁",
    minDay: 1, maxDay: null, phase: ["day"], weight: 5,
    condition: (state) => companionRecruited(state, "小雨") && !!(state.flags && state.flags["小雨_arc_done"]),
    text: "小雨的帳本裡，那頁反覆塗改的紀錄旁，如今多了一頁工整的新內容——不再是尋人的線索，而是普通的據點瑣事。她注意到你在看，只是笑了笑，沒多解釋。",
    options: [
      { label: "沒有多問", effect: { san: 5 }, resultText: "有些事情不需要說破，你看得出來，她已經把那份牽掛，好好地放在心裡的一個角落了。" }
    ]
  },
  {
    id: "evt_epilogue_ahai", title: "主動規劃的路線",
    minDay: 1, maxDay: null, phase: ["day"], weight: 5,
    condition: (state) => companionRecruited(state, "阿海") && !!(state.flags && state.flags["阿海_arc_done"]),
    text: "規劃遠征路線時，阿海主動提起想去一趟以前刻意避開的區域——不是逃避，而是想確認那裡現在的樣子。他攤開地圖，語氣比以前更加從容。",
    options: [
      { label: "跟他一起研究路線", effect: { san: 5 }, resultText: "地圖上那片曾經空白的區域，如今已經被仔細標注——阿海翻過了那一頁，也帶著你一起往前走。" }
    ]
  },
  // ---------- 27.5 連鎖事件擴充：黑膠唱片 ----------
  {
    id: "evt_vinyl_found", title: "舊時代的黑膠唱片",
    minDay: 5, maxDay: 10, phase: ["day", "night"], weight: 6,
    textPool: ["在堆滿雜物的架子角落，你翻到一張封面斑駁的黑膠唱片，邊緣雖有磨損，但看起來還算完整。", "舊貨架的最底層，你翻出一張封套磨損但唱片本體完好的黑膠，摸起來還帶著一絲陳年灰塵的觸感。", "你在雜物堆裡發現一張唱片，封面已經褪色得認不出原本的圖案，但唱片本身意外沒有刮痕。", "一疊唱片被塞在櫃子最深處，大多已經碎裂，唯獨其中一張奇蹟似地完好無缺。", "你在櫃檯抽屜裡翻到一張用報紙仔細包好的唱片，看得出來曾經被人很珍惜地收藏著。"],
    condition: (state) => !(state.flags && state.flags.has_vinyl),
    options: [
      { label: "帶回據點珍藏", effect: { setFlag: "has_vinyl", resources: { scrap: 1 } }, resultText: "你小心地把唱片擦拭乾淨，用布包好放進背包——或許某天能找到能播放它的設備。" },
      { label: "當廢料砸碎", effect: { resources: { scrap: 3 } }, resultText: "你毫不猶豫地將唱片砸成碎片，回收其中殘留的稀有金屬塗層。" }
    ]
  },
  {
    id: "evt_music_night", title: "唱片之夜",
    minDay: 1, maxDay: null, phase: ["night"], weight: 12,
    condition: (state) => !!(state.flags && state.flags.has_vinyl && !state.flags.music_healed
      && state.day >= state.flags.has_vinyl + 3 && state.day <= state.flags.has_vinyl + 5
      && isFurniturePlacedInData(state, "furn_radio")),
    textPool: ["你將那張黑膠唱片放上收音機的唱盤，沙沙的雜訊過後，悠揚的旋律緩緩流出，填滿了據點的每個角落。", "你小心翼翼地擦去唱片上的灰塵，指針落下的瞬間，久違的旋律再次流淌進據點的每個角落。", "夜深了，你又忍不住把那張唱片放上唱盤，讓熟悉的音符暫時蓋過外頭的雜音。", "唱針劃過溝紋，帶著些許雜訊的旋律緩緩響起，你靠著牆，難得地什麼都不想。", "你把音量調得剛好，讓旋律安靜地陪著你，一邊整理著今天收穫的雜物。"],
    options: [
      { label: "靜靜聆聽", effect: { san: 999, setFlag: "music_healed" }, resultText: "你靜靜坐著，讓音樂洗去這些日子積累的疲憊與緊張。SAN值完全恢復。" },
      { label: "隨旋律活動身體", effect: { san: 999, stamina: 1, exp: 5, setFlag: "music_healed" }, resultText: "音樂讓你不自覺地舒展四肢，疲憊的身體重新找回了一些活力，連帶也讓你對周遭環境有了新的體悟。" }
    ]
  },
  // ---------- 27.5 連鎖事件擴充：溫室異常突變 ----------
  {
    id: "evt_strange_seed", title: "溫室的異常種子",
    minDay: 1, maxDay: null, phase: ["day"], weight: 6,
    condition: (state) => !!(state.facilities && state.facilities.greenhouse >= 1)
      && !(state.flags && (state.flags.seed_mutated_ocean || state.flags.seed_mutated_mind)),
    textPool: ["溫室角落不知何時冒出了一株從未見過的植株，葉片泛著詭異的光澤，似乎正緩緩蠕動著。", "溫室一角，一株你從未見過的植物悄悄破土而出，葉片邊緣泛著規律脈動的微光，彷彿在呼吸。", "你注意到花盆裡冒出一株形狀怪異的幼苗，莖部隱約傳來輕微的搏動感，像是有生命在裡頭跳動。", "一株攀著牆面生長的藤蔓不知何時多長出了一顆陌生的果實，表皮下的紋路緩緩游移，看起來不像是自然生長的結果。", "你蹲下身查看那株突兀出現的植物，葉片一碰就微微顫動，彷彿能感知到你的靠近。"],
    options: [
      { label: "灌溉洋流廢水", requiresResource: { water: 2 }, effect: { resources: { water: -2 }, setFlag: "seed_mutated_ocean" }, resultText: "你將一桶從洋流區帶回的廢水澆在植株根部。葉片瞬間泛起藍光，緩緩地向水源的方向舒展開來。" },
      { label: "靈能雷達照射", effect: { stamina: -1, setFlag: "seed_mutated_mind" }, resultText: "你將靈能雷達對準植株照射片刻。植株的葉脈開始浮現出細密的螢光紋路，彷彿與某種意識產生了共鳴。" }
    ]
  },
  {
    id: "evt_seed_harvest_ocean", title: "溫室的收穫",
    minDay: 1, maxDay: null, phase: ["day"], weight: 10,
    condition: (state) => !!(state.flags && state.flags.seed_mutated_ocean && !state.flags.seed_harvested
      && state.day >= state.flags.seed_mutated_ocean + 5),
    textPool: ["那株浸染了洋流廢水的植株終於結出果實——果殼裂開的瞬間，裡頭竟藏著一件濕潤而蠕動的奇特飾品。", "那株植物的果實終於成熟，你小心翼翼地剖開，裡頭滲出一股帶著鹹味的黏液，包裹著一件濕潤的飾品。", "果殼上滲出細密的水珠，你輕輕一掰，裡頭那件飾品正隨著某種微弱的潮汐節奏緩緩搏動。", "植株的藤蔓已經枯萎，但果實依然飽滿，剖開的瞬間，一股濃烈的海水氣味撲面而來。", "你等待已久的果實終於裂開，裡頭的飾品表面覆著一層薄薄的鹽晶，觸感異常冰涼。"],
    options: [
      { label: "取出飾品", effect: { equipment_pool: ["ocean_leech"], embers: 30, exp: 10, setFlag: "seed_harvested" }, resultText: "你小心地將飾品取出並佩戴於身，感覺到一股微涼的潮濕氣息附著在皮膚上。" }
    ]
  },
  {
    id: "evt_seed_harvest_mind", title: "溫室的收穫",
    minDay: 1, maxDay: null, phase: ["day"], weight: 10,
    condition: (state) => !!(state.flags && state.flags.seed_mutated_mind && !state.flags.seed_harvested
      && state.day >= state.flags.seed_mutated_mind + 5),
    textPool: ["那株經靈能雷達照射的植株終於結出果實——果殼裂開的瞬間，裡頭竟藏著一顆泛著螢光紋路的澄澈石英。", "果實裂開的瞬間，一陣細微的嗡鳴在你腦中響起，裡頭那顆石英正隨著某種節奏微微發光。", "你剖開那顆等待多時的果實，裡頭的石英觸手冰涼，卻隱約傳來一絲脈動般的震顫。", "果殼上爬滿了細小的螢光紋路，裂開後，裡頭那顆澄澈的石英彷彿正望著你。", "植株終於結出果實，你小心取出裡頭的石英，指尖傳來一陣說不清楚的熟悉感。"],
    options: [
      { label: "取出飾品", effect: { equipment_pool: ["mind_eye"], embers: 30, exp: 10, setFlag: "seed_harvested" }, resultText: "你小心地將飾品取出並佩戴於身，感覺到一陣細微的意識共鳴。" }
    ]
  },
  // #21-1(c)：連鎖事件死鎖軟性收尾——若radio_lead/family_lead/stray_dog_fed的時間窗已過卻未觸發後續，給予一條日常感慨文案並關閉旗標
  {
    id: "evt_radio_lead_missed", title: "漸漸淡去的念頭",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 0,
    condition: (state) => !!(state.flags && state.flags.radio_lead && !state.flags.radio_journey_done
      && state.day - state.flags.radio_lead > 7),
    weightModifier: (state) => (state.flags && state.flags.radio_lead && !state.flags.radio_journey_done
      && state.day - state.flags.radio_lead > 7) ? 20 : 0,
    text: "你摸了摸口袋，那張寫著頻率的紙條還在，但邊角已經磨得快看不清字了。北邊訊號塔的念頭，似乎被日復一日的瑣事漸漸沖淡了——或許下次有機會，再說吧。",
    options: [
      { label: "把紙條收進抽屜深處", effect: { setFlag: "radio_journey_done" }, resultText: "你把紙條疊好放進抽屜最底層，轉身繼續手邊的事。日子總要過下去。" }
    ]
  },
  {
    id: "evt_family_lead_missed", title: "南方的字條",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 0,
    condition: (state) => !!(state.flags && state.flags.family_lead && !state.flags.family_search_done
      && state.day - state.flags.family_lead > 8),
    weightModifier: (state) => (state.flags && state.flags.family_lead && !state.flags.family_search_done
      && state.day - state.flags.family_lead > 8) ? 20 : 0,
    text: "那張字條還夾在你的筆記本裡，小小的笑臉依舊朝著你。南橋的方向，這些日子一直沒能抽出空去——你望了一眼南方的天際線，輕輕嘆了口氣，把筆記本收好。",
    options: [
      { label: "繼續眼前的生活", effect: { setFlag: "family_search_done" }, resultText: "你收起筆記本，把注意力拉回據點的日常。心裡那份牽掛，暫時還是只能放著。" }
    ]
  },
  {
    // 2026-07-04修正：這裡原本會直接setFlag dog_companion=true，跟敘事「牠已經好幾天沒出現」互相矛盾——
    // 玩家會在狗明明沒有回來的分支拿到「不只是寵物：讓一隻流浪狗決定留下來陪你」的成就。
    // 改成只標記「這次錯過了」(dog_second_chance_at)，真正的companion флаг交給evt_dog_second_chance負責，
    // 呼應使用者要求「所有成就都要能完成，錯過後面還要有一次不用選、直接獲得的機會」
    id: "evt_dog_missed", title: "再也沒出現的腳步聲",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 0,
    condition: (state) => !!(state.flags && state.flags.stray_dog_fed && !state.flags.dog_companion && !state.flags.dog_second_chance_at
      && state.day - state.flags.stray_dog_fed > 4),
    weightModifier: (state) => (state.flags && state.flags.stray_dog_fed && !state.flags.dog_companion && !state.flags.dog_second_chance_at
      && state.day - state.flags.stray_dog_fed > 4) ? 20 : 0,
    text: "你想起那隻曾經來討過食物的狗，已經好幾天沒再見到牠的蹤影了。或許牠找到了別的去處，或許只是換了條路線——廢墟裡的生命，總是來來去去。",
    options: [
      { label: "繼續忙手邊的事", effect: { setFlag: "dog_second_chance_at" }, resultText: "你搖了搖頭，把這份小小的失落放下，重新投入眼前的工作。" }
    ]
  },
  {
    // 2026-07-04新增：guaranteed的第二次機會，時間到就自動觸發，只有一個「接受既定事實」的選項(不是真的抉擇)，
    // 確保餵過牠一次的玩家最終一定能拿到dog_companion，不會因為錯過第一次1~4天窗口就永久卡住
    id: "evt_dog_second_chance", title: "再次響起的腳步聲",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 0,
    condition: (state) => !!(state.flags && state.flags.dog_second_chance_at && !state.flags.dog_companion
      && state.day - state.flags.dog_second_chance_at >= 14),
    weightModifier: (state) => (state.flags && state.flags.dog_second_chance_at && !state.flags.dog_companion
      && state.day - state.flags.dog_second_chance_at >= 14) ? 40 : 0,
    text: "一陣熟悉又陌生的腳步聲在門外響起——你幾乎要認不出牠了，那隻早已被你以為走失的狗，正叼著一隻不知道從哪抓來的獵物，搖著尾巴站在門口。這一次，牠沒有再猶豫，逕自走進據點，熟門熟路地在角落找了個位置趴下。",
    options: [
      { label: "牠回來了", effect: { baseDefense: 1, setFlag: "dog_companion" }, resultText: "你蹲下身，輕輕摸了摸牠的頭。這一次，牠似乎打定主意不會再離開了——據點裡，多了一位不請自來的守衛。" }
    ]
  },
  // #32：居家/同伴/家具主題的循環事件——日常生活感的小品，每輪都可能再次抽到
  {
    id: "evt_home_chores", title: "據點的日常",
    minDay: 1, maxDay: null, phase: ["day"], weight: 8,
    text: "今天沒什麼特別的事，你花了點時間整理據點——把散落的工具歸位，檢查門窗是否還算牢靠。瑣碎，但這份規律本身就是一種安心。",
    textPool: [
      "今天沒什麼特別的事，你花了點時間整理據點——把散落的工具歸位，檢查門窗是否還算牢靠。瑣碎，但這份規律本身就是一種安心。",
      "你把這幾天累積的雜物攤開在地上，一件一件檢查、分類。窗外的天色不知不覺就這樣慢慢暗了下來。",
      "今天輪到你打掃。你一邊掃著地上的灰塵，一邊在心裡盤算著接下來幾天該怎麼安排——日子雖然艱難，但總得過下去。",
      "你檢查了一遍門窗的鎖扣與補強的木板，確認都還牢固，才稍微安心地回到屋裡。"
    ],
    options: [
      { label: "順手收拾", effect: { resources: { scrap: 1 } }, resultText: "你把角落裡堆積的雜物分類整理，意外翻出幾片還能用的金屬零件，順手收進了工具箱。" }
    ]
  },
  {
    id: "evt_companion_chat", title: "閒聊的片刻",
    minDay: 1, maxDay: null, phase: ["night"], weight: 10,
    condition: (state) => !!state.companion,
    text: "夜裡，你和她並排坐在據點門口，一邊望著遠處零星的火光，一邊隨口聊起末日前的瑣事——誰家樓下的早餐店、上學遲到的理由。荒謬又懷念。",
    textPool: [
      "夜裡，你和她並排坐在據點門口，一邊望著遠處零星的火光，一邊隨口聊起末日前的瑣事——誰家樓下的早餐店、上學遲到的理由。荒謬又懷念。",
      "她難得主動開口，問起你以前的工作、喜歡吃什麼。你想了想，發現自己已經有點記不清那些「正常」的日子是什麼感覺。",
      "兩人一時都沒說話，只是靜靜聽著遠方偶爾傳來的風聲。過了好一會兒，她才輕聲說：「還好，至少不是一個人。」",
      "她拿出一張不知從哪撿來的撲克牌，少了幾張也無所謂，兩人就用剩下的牌玩了幾輪簡單的遊戲，笑聲在據點裡顯得格外清晰。"
    ],
    options: [
      { label: "繼續聊下去", effect: { san: 5 }, resultText: "笑著聊到一半，你發現緊繃了一整天的肩膀，不知不覺放鬆了下來。" }
    ]
  },
  {
    id: "evt_find_plant", title: "窗台上的綠意",
    minDay: 1, maxDay: null, phase: ["day"], weight: 4,
    condition: (state) => !isFurniturePlacedInData(state, "furn_potted_plant")
      && !(state.inventory || []).some(i => i.itemId === "furn_potted_plant"),
    textPool: ["廢棄公寓的窗台上，一株不知名的小植物頑強地活了下來，葉脈間隱約流動著淡淡的螢光紋路，在裂縫透進的光線中微微搖晃。你猶豫了一下，最終把它連著盆一起帶走。", "窗台縫隙間探出一株纖細的植物，葉脈間流動的螢光紋路隨著微風輕輕搖曳。", "你在陽台角落發現一株倔強生長的小苗，葉片邊緣泛著淡淡的光澤，猶豫片刻後還是決定帶走。", "廢棄花架上，一株植物頑強地攀著殘破的支架生長，葉片間隱約透出微弱的螢光。", "你注意到牆縫裡冒出的嫩芽，葉脈間有一絲若有似無的光在流動，於是小心地連根挖起。"],
    options: [
      { label: "帶回據點", effect: { furniture: ["furn_potted_plant"] }, resultText: "你小心翼翼地把盆栽抱在懷裡，一路上格外留意，怕一個不小心就把它顛壞了。" }
    ]
  },
  {
    id: "evt_find_toolbox", title: "鎖住的工具箱",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 4,
    // 2026-06-26發現並修正：furn_toolbox的slot是"floor"，原本誤寫成檢查state.baseSlots.wall，永遠不會比對到，
    // 等於這個事件即使已擁有工具箱也會一直重複出現；改用isFurniturePlacedInData統一查詢後順帶修掉
    condition: (state) => !isFurniturePlacedInData(state, "furn_toolbox")
      && !(state.inventory || []).some(i => i.itemId === "furn_toolbox"),
    textPool: ["在工作間角落，你發現一個上了鎖的工具箱，鎖頭已經鏽蝕得差不多了，邊緣還沾著幾粒會反光的細小石英顆粒。費了點力氣撬開後，裡頭的工具雖舊，但保養得意外完好。", "你在儲藏室角落發現一個上鎖的工具箱，鎖芯早已鏽蝕，邊緣沾著幾點反光的石英顆粒。", "工作台底下藏著一個蒙塵的工具箱，費了點力氣撬開後，裡頭的工具保養得意外良好。", "你翻找出一個鏽跡斑斑的工具箱，表面覆著薄薄一層螢光鏽斑，鎖頭形同虛設。", "角落堆疊的雜物底下，一個工具箱靜靜躺著，撬開的瞬間揚起一陣夾著微光的灰塵。"],
    options: [
      { label: "整箱帶走", effect: { furniture: ["furn_toolbox"] }, resultText: "你把工具箱搬回據點，打算找個地方固定上牆——這些工具以後肯定派得上用場。" }
    ]
  },
  {
    id: "evt_furniture_admire", title: "小小的家",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 6,
    condition: (state) => !!(state.baseSlots && (state.baseSlots.wall || state.baseSlots.wall2)) || !!(state.placedFurniture && state.placedFurniture.length > 0),
    textPool: ["你環顧據點裡這些一點一滴添置起來的家具，雖然多半是從廢墟裡撿來、修補過的二手物，但擺在這裡，總算有了一點「家」的樣子。", "你環視據點裡每一件親手修補、拼湊起來的家具，雖然樣式不一，卻莫名地讓人感到安心。", "難得有空閒的午後，你擦拭著這些從廢墟裡一件件搬回來的家具，心裡有種說不出的滿足感。", "你坐在自己拼湊出來的椅子上，看著這個逐漸像個家的據點，忍不住笑了一下。", "你重新擺放了幾件家具的位置，看著煥然一新的據點，覺得這一切的辛苦都值得了。"],
    options: [
      { label: "稍作休息", effect: { embers: 2 }, resultText: "你靠著牆坐下，難得地什麼都不做，只是發了一會兒呆。（獲得🔥2）" }
    ]
  },
  // 2026-07-01新增：24個事件，補足「附近搜刮」的隨機事件池，降低多輪遊玩時的重複感
  {
    id: "evt_broken_vending", title: "故障的自動販賣機",
    minDay: 1, maxDay: null, phase: ["day"], weight: 10,
    textPool: ["巷口那台自動販賣機的螢幕仍詭異地閃爍著雜訊光點，商品早已被搜刮一空，唯獨最底層卡著一罐看起來還完整的飲料。", "一台傾倒在路邊的自動販賣機仍固執地亮著燈，玻璃早已破碎，但角落還卡著一件沒被拿走的商品。", "販賣機的投幣孔早已鏽死，螢幕卻仍規律地跳動著過期的廣告畫面，你繞到後方找到了維修孔。", "你經過一台歪斜的自動販賣機，機身上的螢光塗鴉早已褪色，但機器內部似乎還卡著東西。", "那台販賣機的補貨門微微鬆脫，你稍微用力一撬，裡頭滾出了一件遺留的商品。"],
    options: [
      {
        label: "用力搖晃機台",
        roll: {
          chance: 0.6,
          success: { effect: { resources: { water: 2 } }, resultText: "你用力搖晃機台，卡住的飲料總算掉了下來，罐身雖帶著一絲微光，喝起來卻沒什麼異狀。" },
          fail: { effect: { hp: -3 }, resultText: "機台突然傾倒，你被邊角狠狠撞了一下，那罐飲料也摔得四分五裂，只留下滿地狼藉。" }
        }
      },
      { label: "放棄，直接離開", resultText: "你看了看搖搖欲墜的機台，決定不冒這個險，轉身繼續往前走。" }
    ]
  },
  {
    id: "evt_abandoned_bicycle", title: "廢棄的腳踏車",
    minDay: 1, maxDay: null, phase: ["day"], weight: 10,
    textPool: ["巷弄深處倒著一輛生鏽的腳踏車，車架縫隙間積著一層淡淡的螢光鏽斑，輪胎早已扁掉，車籃裡卻還放著幾樣沒被翻動過的雜物。", "一輛腳踏車卡在倒塌的鐵皮圍籬裡，車輪早已變形，但掛在龍頭上的袋子似乎還沒被人翻過。", "你在雜草叢生的空地上發現一輛倒地已久的腳踏車，車架鏽蝕嚴重，車籃裡卻意外地乾淨。", "巷口斜靠著一輛缺了鏈條的腳踏車，座墊早已破損，但車尾架上還綁著一個沒拆開的包裹。", "一輛腳踏車半埋在碎石堆裡，你花了點力氣把它挖出來，順手翻了翻車籃裡剩下的東西。"],
    options: [
      { label: "翻找車籃", effect: { resources: { scrap: 2 } }, resultText: "你蹲下身翻了翻車籃，撿到幾件還能用的金屬零件，收進了背包。" }
    ]
  },
  {
    id: "evt_bookstore_relic", title: "書店裡的殘卷",
    minDay: 1, maxDay: null, phase: ["day"], weight: 8,
    textPool: ["傾頹的書店裡，大半書架已經倒塌，但角落一本書頁泛著螢光的精裝書意外地保存完好。", "倒塌的書架縫隙間，你發現一本封面燒焦大半的書，內頁邊緣卻詭異地泛著一絲微光。", "你在書堆裡翻出一本厚重的精裝書，書脊上沾著一層細小的螢光粉塵，內容卻意外地清晰可讀。", "角落一疊被水泡過的書籍裡，唯獨一本奇蹟似地毫髮無傷，書頁間隱約透出一絲奇異的光澤。", "你撥開散落一地的書本，底下壓著一本裝訂精美的舊書，封面上的燙金字體仍微微發亮。"],
    options: [
      { label: "翻閱這本書", effect: { exp: 5 }, resultText: "書頁裡記載著末日前的知識，你讀得入神，不知不覺又多懂了一些道理。" }
    ]
  },
  {
    id: "evt_glowing_puddle", title: "發光的水窪",
    minDay: 1, maxDay: null, phase: ["day"], weight: 8,
    textPool: ["路面凹陷處積著一灘泛著螢光的水窪，水面平靜無波，卻隱約透出一股不屬於這個世界的寒意。", "你在排水溝旁發現一灘不自然發光的積水，水面異常平靜，讓人本能地想繞道而行。", "路面裂縫裡積著一小灘泛著幽光的液體，你蹲下觀察了片刻，決定還是不要輕易觸碰。", "巷弄深處有一窪詭異的水漬，微光在水面下緩緩流動，像是有什麼東西正在裡頭遊走。", "你注意到牆角滲出的水漬泛著奇異的藍綠色光澤，空氣裡也帶著一絲說不出的涼意。"],
    options: [
      {
        label: "涉水撿起水窪中的反光物",
        roll: {
          chance: 0.5,
          success: { effect: { resources: { scrap: 2 }, exp: 3 }, resultText: "你伸手撈起水裡的反光物，是幾件被螢光浸透的金屬零件，狀況出乎意料地好。" },
          fail: { effect: { hp: -6 }, resultText: "手才碰到水面，一陣刺痛感瞬間竄上手臂，你趕緊縮手，皮膚上留下一道淡淡的灼痕。" }
        }
      },
      { label: "繞道而行", resultText: "你決定不冒險，繞了條遠路離開，那灘水窪在你身後靜靜地泛著微光。" }
    ]
  },
  {
    id: "evt_community_garden", title: "荒廢的社區菜園",
    minDay: 1, maxDay: null, phase: ["day"], weight: 9,
    textPool: ["社區中庭的小菜園早已荒廢多時，雜草叢生，但幾株耐旱的作物頑強地存活了下來，葉片邊緣泛著一圈極淡的螢光，結出的果實比記憶中更加飽滿。", "你在雜草蔓生的中庭裡發現一小片還算完整的菜圃，葉片上沾著細小的螢光露珠，長勢比想像中好。", "曾經的社區花園早已面目全非，唯獨角落幾株作物頑強地活著，泛著一層淡淡的異色光澤。", "你撥開及腰的雜草，意外找到一片還在結果的菜畦，果實表皮隱約透著一絲不自然的光。", "荒廢的花圃裡，藤蔓纏繞出奇異的圖案，中心那幾株作物看起來出乎意料地健康。"],
    options: [
      { label: "採收剩餘的作物", effect: { resources: { food: 2 } }, resultText: "你摘下幾顆還算新鮮的果實，心想著哪天或許該找個地方，自己也種點什麼。" }
    ]
  },
  {
    id: "evt_market_haggle", title: "黑市攤販的討價還價",
    minDay: 3, maxDay: null, phase: ["day"], weight: 8,
    textPool: ["一個獨眼的攤販在廢墟間擺了個小攤，攤位角落的提燈泛著不自然的螢光藍，他用警惕的眼神打量著你。「廢料換食物，要不要？」他壓低聲音問。", "一個裹著厚重斗篷的攤販在巷口擺了張折疊桌，貨品雜亂但種類不少，他朝你使了個眼色。", "你經過一個熟面孔的攤位，對方頭也不抬地說：「今天有新貨，要不要看看？」", "廢墟中央架著一個簡陋的貨攤，攤主警惕地盯著四周，見你靠近才稍微放鬆戒備。", "一名商販推著改裝過的手推車在街角叫賣，聲音壓得很低，像是怕引來不必要的注意。"],
    options: [
      { label: "用廢料交換", requiresResource: { scrap: 3 }, effect: { resources: { scrap: -3, food: 3 } }, resultText: "你遞出廢料，攤販俐落地清點過後，丟給你幾罐食物，一句話也沒多說就轉身收攤離開。" },
      { label: "婉拒離開", resultText: "你搖搖頭表示不需要，攤販也不勉強，只是聳聳肩繼續盯著往來的路人。" }
    ]
  },
  {
    id: "evt_solar_panel", title: "拾荒者的太陽能板",
    minDay: 2, maxDay: null, phase: ["day"], weight: 7,
    textPool: ["屋頂邊緣架著一塊傾斜的太陽能板，接線裸露在外，板面殘留的螢光鏽跡隨光線角度微微變化，但面板本身看起來還完好無損。", "你爬上鄰棟建築的屋頂，發現一塊還算完整的太陽能板半掩在雜物底下。", "廢棄倉庫的天窗旁架著一塊太陽能板，接線雖然老舊，但主體結構意外牢固。", "你在一堆拆解過的太陽能設備裡，找到一塊還沒被搜刮走的完整板材。", "屋頂角落的太陽能板已經蒙上厚厚一層灰，擦拭乾淨後，看起來還能繼續使用。"],
    options: [
      { label: "拆下面板", effect: { resources: { scrap: 3 } }, resultText: "你小心翼翼地拆下太陽能板，雖然費了不少功夫，但這塊材料絕對能派上用場。" }
    ]
  },
  {
    id: "evt_pigeon_flock", title: "屋簷下的異變鴿群",
    minDay: 1, maxDay: null, phase: ["day"], weight: 7,
    textPool: ["屋簷下棲息著一群羽毛泛著螢光斑點的鴿子，牠們對你的靠近毫不在意，咕咕叫著低頭啄食地上的碎屑。", "一群鴿子聚集在斷裂的電線上，羽毛在陽光下泛著奇異的光澤，咕咕叫聲此起彼落。", "你經過時驚起一群鴿子，牠們振翅飛起的瞬間，羽毛間隱約閃過一絲螢光。", "屋簷下的鴿群對你毫無防備，其中幾隻的眼神透著一絲不太屬於鳥類的專注。", "一群鴿子聚在廣場中央啄食，走近才發現牠們的羽色比記憶中的鴿子更加斑斕。"],
    options: [
      { label: "驅趕鴿群翻找地面", effect: { resources: { scrap: 1, food: 1 } }, resultText: "鴿群被你嚇得振翅飛散，地上散落著牠們啄剩的東西，你順手撿了一些能用的。" },
      { label: "安靜地看著牠們", effect: { san: 3 }, resultText: "你安靜地站在原地看著鴿群，牠們的存在莫名讓你感到一絲寬慰——至少還有生命在這裡延續著。" }
    ]
  },
  {
    id: "evt_kids_treasure_map", title: "孩子畫的藏寶圖",
    minDay: 5, maxDay: null, phase: ["day"], weight: 6,
    textPool: ["你在廢棄的兒童房裡撿到一張皺巴巴的手繪地圖，歪歪扭扭地標示著「寶藏」的位置，看起來像是孩子的塗鴉。", "你在一間廢棄兒童房的床底下發現一張畫著恐龍跟星星的藏寶圖，箭頭歪歪扭扭地指向某個方向。", "抽屜裡壓著一張蠟筆繪製的地圖，角落還寫著「不准偷看，這是我的秘密基地」。", "你翻出一張皺巴巴的紙，上面用鮮豔色彩畫著一條通往「寶藏」的路線，看起來是某個孩子的傑作。", "玩具箱底下藏著一張手繪地圖，畫風稚嫩卻異常認真，讓你不自覺地想順著它走一趟。"],
    options: [
      {
        label: "按圖索驥",
        roll: {
          chance: 0.45,
          success: { effect: { resources: { scrap: 3 }, exp: 5 }, resultText: "你半信半疑地按圖走到標示地點，牆角的鬆動磚塊後面，真的藏著一小罐零件！" },
          fail: { effect: { stamina: -1 }, resultText: "你找遍了地圖標示的角落，除了灰塵什麼也沒有——大概真的只是孩子的想像遊戲。" }
        }
      },
      { label: "當作紀念收起來", effect: { san: 2 }, resultText: "你把地圖仔細摺好收進背包，想著這孩子曾經懷抱過怎樣天真的夢。" }
    ]
  },
  {
    id: "evt_toolshed_find", title: "後院工具棚",
    minDay: 4, maxDay: null, phase: ["day"], weight: 5,
    textPool: ["後院一間東倒西歪的工具棚裡，堆滿了雜亂的五金用品，牆角滲出的螢光粉塵靜靜覆蓋在工具表面，其中一件看起來還能當武器用。", "後院工具棚的角落，你翻出一件蒙塵已久的工具，表面殘留的螢光粉塵在光線下微微閃爍。", "棚子深處堆疊的雜物間，一件工具靜靜躺著，邊緣泛著一絲不易察覺的微光。", "你推開吱呀作響的棚門，裡頭雜亂堆著各式工具，其中一件表面覆著薄薄一層螢光鏽跡。", "工具棚牆角的雜物堆裡，藏著一件保存意外良好的工具，觸感冰涼卻帶著微弱的光澤。"],
    options: [
      { label: "翻找工具棚", effect: { equipment_pool: ["crowbar_01"], exp: 3 }, resultText: "你翻出一根生鏽但堅固的撬棍，掂了掂重量，應付一般的威脅應該綽綽有餘。" }
    ]
  },
  {
    id: "evt_greenhouse_seed_gaia", title: "溫室的蓋亞種子",
    minDay: 6, maxDay: null, phase: ["day"], weight: 5,
    textPool: ["廢棄溫室的角落，一株攀滿藤蔓的植株結出了一顆會發出微光的種子囊，觸感異常溫熱。", "溫室深處，一株藤蔓結出的種子囊隨著你的靠近微微搏動，觸手溫熱得不像植物該有的溫度。", "你摘下那顆懸掛在藤蔓末端的種子囊，表面的紋路正緩緩流轉，像是有生命在裡頭呼吸。", "攀滿整面牆的藤蔓中央，垂著一顆泛著微光的種子囊，剖開前你能感覺到它的搏動。", "溫室角落新長出的種子囊觸感濕潤溫熱，你小心地摘下，指尖傳來一陣輕微的震顫。"],
    options: [
      { label: "摘下種子囊", effect: { equipment_pool: ["gaia_seed_pouch"], exp: 3 }, resultText: "你小心摘下種子囊貼身收好，隱約能感覺到裡頭似乎藏著某種蓬勃的生命力。" }
    ]
  },
  {
    id: "evt_flickering_streetlight", title: "忽明忽暗的路燈",
    minDay: 1, maxDay: null, phase: ["night"], weight: 8,
    textPool: ["窗外唯一一盞還亮著的路燈忽明忽暗地閃爍著，光影在牆上投下扭曲晃動的輪廓，看久了讓人心裡發毛。", "巷口那盞老舊路燈規律地閃爍著，每次熄滅前都會拖出一道詭異的殘影。", "窗外的路燈忽然閃了幾下，光線掃過牆面時，你彷彿看見什麼一閃而過的輪廓。", "唯一還亮著的燈泡發出嗡嗡的電流聲，光線忽強忽弱，把整條街照得斷斷續續。", "你盯著那盞閃爍的路燈看了許久，光影的節奏規律得不太像是單純的故障。"],
    options: [
      { label: "移開視線繼續休息", endsPhase: true, effect: { hp: 5 }, resultText: "你拉上窗簾，決定不再多看，很快便沉入了淺眠。" }
    ]
  },
  {
    id: "evt_distant_howl", title: "遠方的嚎叫",
    minDay: 1, maxDay: null, phase: ["night"], weight: 9,
    textPool: ["遠方傳來一聲拉長的嚎叫，尾音帶著一絲不屬於任何生物的顫音，久久回盪在空曠的街道上，接著便歸於死寂。", "一聲淒厲的嚎叫劃破夜空，尾音扭曲得不太自然，你屏息等待，卻沒有第二聲響起。", "遠處傳來斷斷續續的咆哮，聽起來不只一個聲源，交疊在一起格外令人不安。", "那聲嚎叫拖得很長，像是刻意在向某個方向示警，你握緊了手中的武器。", "空曠的街道盡頭傳來一陣低沉的哀鳴，久久沒有停歇，你決定繞道而行。"],
    options: [
      { label: "警戒地聽著動靜", resultText: "你屏息聽了許久，確認聲音沒有再靠近，才慢慢放鬆下來，但今晚恐怕很難真正安睡。" }
    ]
  },
  {
    id: "evt_power_surge", title: "詭異的電力突波",
    minDay: 1, maxDay: null, phase: ["night"], weight: 7,
    textPool: ["據點裡所有電器突然同時亮起又熄滅，一陣電流的焦味混著一絲若有似無的螢光殘影瞬間瀰漫開來，接著一切又恢復平靜。", "燈泡毫無預警地爆出一陣火花，整個據點瞬間陷入黑暗，隨後又恢復正常供電。", "你聽見牆內傳來一陣異常的電流聲，緊接著所有電器同時閃爍了幾下。", "插座冒出一縷輕煙，你連忙拔掉電源，檢查後卻發現線路完好無損。", "電燈忽然劇烈閃爍，伴隨著刺耳的嗡鳴，持續了幾秒後才恢復平靜。"],
    options: [
      { label: "檢查線路", effect: { resources: { scrap: 1 } }, resultText: "你檢查了一圈線路，沒發現明顯損壞，只在插座附近撿到一小塊燒焦的零件。" }
    ]
  },
  {
    id: "evt_shadow_on_wall", title: "牆上的影子",
    minDay: 1, maxDay: null, phase: ["night"], weight: 8,
    textPool: ["月光透過破窗投射進來，牆上竟出現一道不屬於任何家具的細長影子，隨著你的呼吸微微晃動。", "燭光搖曳間，牆上的影子似乎多了一道不該存在的輪廓，你盯著看了很久，才確定只是錯覺。", "你無意間瞥見牆角的陰影形狀有些奇怪，像是有什麼東西曾經站在那裡，久久不散。", "月光斜斜灑進屋內，家具的影子被拉得又長又扭曲，其中一道怎麼看都對不上任何物件。", "牆上的陰影隨著風吹過窗簾而微微晃動，你盯著看了一會兒，才發現自己屏住了呼吸。"],
    options: [
      {
        label: "鼓起勇氣查看",
        roll: {
          chance: 0.6,
          success: { effect: { san: 3 }, resultText: "你顫抖著靠近查看，原來只是掛在鉤子上的舊外套被風吹得晃動——虛驚一場，你鬆了口氣。" },
          fail: { endsPhase: true, restless: true, effect: { san: -5 }, resultText: "你越靠近，那道影子的形狀越發不對勁，你猛地後退，再也不敢直視那個角落，一夜難眠。" }
        }
      },
      { label: "假裝沒看見，蒙頭睡覺", endsPhase: true, effect: { san: -2, hp: 5 }, resultText: "你把毯子一路拉到頭頂，告訴自己那只是錯覺，但那道影子的殘像卻在腦海裡揮之不去。" },
      { label: "透過石英眼眸看穿真相", endsPhase: true, condition: (state) => isEquippedInData(state, "accessory", "mind_eye"), effect: { san: 3, hp: 5 }, resultText: "透過石英眼眸，那道影子瞬間顯出原形——只是掛鉤上舊外套投下的普通輪廓。你毫無波瀾地翻身睡去。" }
    ]
  },
  {
    id: "evt_insomnia", title: "難以入眠的夜",
    minDay: 1, maxDay: null, phase: ["night"], weight: 6,
    textPool: ["翻來覆去了大半夜，思緒像斷了線的收音機一樣雜亂無章，怎麼也無法真正安穩地睡著。", "你盯著天花板已經數不清多久，腦子裡塞滿了雜七雜八的念頭，怎麼也靜不下來。", "明明已經很累了，你卻毫無睡意，只能聽著窗外的風聲，一遍遍數著呼吸。", "翻了個身又翻了個身，睡意始終遙不可及，你乾脆坐起身，看著窗外發呆。", "你閉上眼卻怎麼也睡不著，腦海裡反覆播放著這幾天發生的事，像是停不下來的收音機。"],
    options: [
      { label: "起身做點雜事", effect: { resources: { scrap: 1 }, stamina: -1 }, resultText: "你乾脆起身整理雜物，雖然犧牲了一點體力，但至少比躺著發呆有意義。" },
      { label: "閉眼硬撐到天亮", endsPhase: true, restless: true, effect: { san: -3 }, resultText: "你閉著眼睛硬撐到天亮，雖然沒睡好，但至少撐過了這漫長的一夜。" }
    ]
  },
  {
    id: "evt_locked_room_sound", title: "鎖住房間裡的聲音",
    minDay: 3, maxDay: null, phase: ["night"], weight: 6,
    textPool: ["隔壁一間反鎖的房間裡，門縫底下滲出一絲極淡的螢光粉塵，隱約傳出規律的敲擊聲，一下、一下，像是有什麼東西正試圖從裡面出來。", "你經過一扇上鎖的房門，門內傳來規律的敲擊聲，一下接著一下，隔著門板都能感覺到那股不尋常的頻率。", "深夜裡，隔壁房間傳來窸窸窣窣的聲響，門縫底下滲出一絲極淡的光，你屏住呼吸靠近細聽。", "一陣悶悶的撞擊聲從封死的儲藏室傳出，你站在門外猶豫了很久，最終還是沒有推開它。", "那扇門後傳來的聲音時斷時續，像是有什麼東西正耐心地等著你打開它。"],
    options: [
      {
        label: "撬開房門查看",
        roll: {
          chance: 0.5,
          success: { effect: { resources: { scrap: 2 }, exp: 5 }, resultText: "你撬開門鎖，裡頭只是一台故障的排風扇規律地敲著牆面——你順手拆了幾個能用的零件。" },
          fail: { battle: "enemy_walker_weak", resultText: "門一打開，一道身影猛地竄了出來——原來真的有東西被困在裡面！" }
        }
      },
      { label: "不去招惹，離開這層樓", resultText: "你決定不去自找麻煩，敲擊聲在你走遠後依然規律地持續著。" }
    ]
  },
  {
    id: "evt_scrap_windfall", title: "意外的廢料堆",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 10,
    textPool: ["轉角處堆著一小堆沒人注意到的廢棄零件，表面覆著一層薄薄的螢光鏽跡，散落在瓦礫之間，看起來還算完整。", "你在一處倒塌的鐵皮屋簷下發現一堆散落的零件，堆疊得雜亂，但每一件看起來都還能用。", "瓦礫縫隙間卡著幾塊沒人注意到的金屬廢料，你花了點時間才把它們一一挖出來。", "轉角的排水溝旁堆積著一小堆廢棄零件，顯然是被前人遺漏的收穫。", "你踢到一個半埋在土裡的金屬箱，打開一看，裡頭裝的全是還能回收利用的零件。"],
    options: [
      { label: "收集起來", effect: { resources: { scrap: 2 } }, resultText: "你把散落的零件一一撿起，分類收進背包，又是一筆實用的收穫。" }
    ]
  },
  {
    id: "evt_quiet_hope", title: "一絲希望",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 8,
    textPool: ["你無意間看見牆縫裡冒出一株倔強的小草，在這片灰敗的廢墟中，綠意顯得格外刺眼又溫柔。", "廢棄花盆裡不知何時冒出了幾株嫩芽，你蹲下身看了許久，心裡浮現一絲說不出的柔軟。", "你在瓦礫堆的縫隙間發現一小簇野花，顏色鮮豔得與周遭的灰敗格格不入。", "路邊的裂縫裡，一株小樹苗頑強地向上生長，你忍不住多看了幾眼。", "你注意到窗台上的舊花盆裡竟冒出了新芽，在這片荒蕪之中，顯得格外珍貴。"],
    options: [
      { label: "駐足看了一會兒", effect: { san: 4 }, resultText: "你蹲下身看了好一會兒，心裡某個緊繃的角落，似乎也跟著鬆動了一些。" }
    ]
  },
  {
    id: "evt_faction_static_gaia", title: "血脈裡的低語",
    minDay: 5, maxDay: null, phase: ["day"], weight: 5,
    condition: (state) => !!(state.skills && state.skills.faction === "gaia"),
    textPool: ["血液裡彷彿有什麼東西正緩緩甦醒，你能隱約感覺到牆縫雜草的生長，像是與萬物產生了共鳴。", "你的血脈忽然傳來一陣暖流，彷彿感應到附近某株植物正在拚命生長。", "指尖無意間拂過牆縫的雜草，一股熟悉的共鳴感悄悄爬上心頭。", "你能隱約「聽見」腳下泥土裡種子破殼的聲音，這種感覺已經不再陌生。", "一陣輕微的搏動從體內傳來，像是與這座城市殘存的綠意產生了某種連結。"],
    options: [
      { label: "順著感覺伸手觸碰", effect: { resources: { food: 1 }, san: 2 }, resultText: "你伸手觸碰身旁的雜草，指尖傳來一陣溫熱的搏動感，隨後掌心多了一顆飽滿的野生果實。" }
    ]
  },
  {
    id: "evt_faction_static_ocean", title: "潮汐般的心跳",
    minDay: 5, maxDay: null, phase: ["night"], weight: 5,
    condition: (state) => !!(state.skills && state.skills.faction === "ocean"),
    textPool: ["你的心跳莫名與遠方的潮聲同步起伏，一陣涼意順著血管緩緩擴散，卻不覺得難受，反而格外平靜。", "你的血液彷彿隨著看不見的潮汐緩緩起伏，一股涼意順著血管擴散開來。", "指尖傳來一陣濕潤的錯覺，你能隱約「感覺」到遠方水流的方向。", "心跳忽然與某種規律的節奏同步，那節奏讓你想起了大海的呼吸。", "一陣涼意從體內深處泛起，你閉上眼，彷彿能聽見遙遠的浪聲。"],
    options: [
      { label: "跟隨這股韻律呼吸", effect: { hp: 5 }, resultText: "你跟著那股韻律緩慢呼吸，身體裡湧起一股奇異的恢復力，傷口似乎也癒合得快了一些。" }
    ]
  },
  {
    id: "evt_faction_static_aero", title: "風中的低語",
    minDay: 5, maxDay: null, phase: ["day"], weight: 5,
    condition: (state) => !!(state.skills && state.skills.faction === "aero"),
    textPool: ["風忽然從四面八方同時吹來，捲起滿地塵埃，你卻能隱約「聽見」風裡藏著的細碎訊息。", "風忽然從四面八方同時捲起，你卻能從中「聽見」某種細碎而規律的訊息。", "一陣氣壓變化讓你耳鳴了一下，隨即你能隱約感應到遠方風向的變化。", "你的皮膚忽然對空氣的流動變得異常敏感，彷彿能提前預知風向的轉變。", "塵埃在你四周無風自動，你能隱約「聽見」風裡藏著的某種低語。"],
    options: [
      { label: "閉眼聆聽風的訊息", effect: { exp: 5 }, resultText: "你閉眼專注聆聽，那些破碎的訊息漸漸拼湊出一點方向感，你若有所悟地睜開眼。" }
    ]
  },
  {
    id: "evt_faction_static_cyber", title: "訊號雜訊中的機械低語",
    minDay: 5, maxDay: null, phase: ["night"], weight: 5,
    condition: (state) => !!(state.skills && state.skills.faction === "cyber"),
    textPool: ["體內的機械義軀忽然傳來一陣細微的震動，混雜著只有你能聽懂的雜訊訊號，像是某種遙遠的呼喚。", "體內的機械義軀忽然傳來一陣規律的震動，像是在接收某種遙遠的訊號。", "你的義肢無預警地微微發燙，夾雜著只有你能解讀的雜訊般感應。", "一陣電流般的酥麻感從義軀深處竄起，你能隱約「聽見」某種機械的低鳴。", "你的視野邊緣忽然閃過一串無意義的數據流，隨即又恢復正常。"],
    options: [
      { label: "專注感受這股訊號", effect: { embers: 5, san: 2 }, resultText: "你閉上眼專注感受，那股訊號雖然模糊，卻讓你莫名安心——彷彿你並不是唯一的存在。" }
    ]
  },
  {
    id: "evt_faction_static_mind", title: "意識深處的回聲",
    minDay: 5, maxDay: null, phase: ["night"], weight: 5,
    condition: (state) => !!(state.skills && state.skills.faction === "mind"),
    textPool: ["闔眼的瞬間，無數破碎的思緒湧入腦海，像是別人的記憶片段，卻又混雜著說不出的熟悉感。", "闔眼的瞬間，一段陌生卻熟悉的記憶碎片毫無預警地閃過腦海。", "你忽然聽見了不屬於自己的思緒低語，像是有人隔著很遠的距離在說話。", "一陣暈眩襲來，無數破碎的畫面在腦中一閃而過，你花了好一會兒才回過神。", "你的意識深處忽然浮現一絲不屬於自己的情緒，很快又歸於平靜。"],
    options: [
      { label: "任由思緒流動", endsPhase: true, effect: { san: 5, hp: 5 }, resultText: "你不再抗拒，任由那些思緒自然流過，醒來時精神竟出奇地清明，彷彿卸下了什麼重擔。" }
    ]
  },
  {
    // 草稿1：據點日誌，依資源水位/同伴人數/Tier收復進度三個維度各抽一句拼接，
    // day30後才出現避免早期就談論「世界變化」這種需要進度support的內容
    id: "evt_outpost_log", title: "據點日誌",
    minDay: 30, maxDay: null, phase: ["day", "night"], weight: 4,
    textFn: (state) => {
      const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
      const RESOURCE_LINES = {
        abundant: [
          "你翻看了一下儲備清單，食物跟飲水都還算充裕，難得不用精打細算地過日子。",
          "倉儲堆得滿滿的，你甚至有餘裕分了一點給隔壁還在苦撐的倖存者。",
          "罐頭跟水桶疊得整整齊齊，看著這些存糧，心裡難得踏實了一些。",
          "你算了算，就算接下來幾天什麼都不做，日子也還過得去——這種安全感已經很久沒有過了。",
          "資源櫃滿到快關不上，你花了點時間重新整理，順手把過期風險高的食物挪到前面優先吃。",
          "難得的富足時刻。你甚至有心情煮了一頓比平常豐盛一點的飯。"
        ],
        normal: [
          "資源不多也不少，勉強維持著收支平衡，你已經習慣了這種不上不下的日子。",
          "你盤點了一下存糧，夠撐一陣子，但也不敢太鬆懈。",
          "日子過得緊湊但還算穩定，每天精算著要花多少、留多少。",
          "倉儲的水位不高不低，你決定明天還是該出門補一趟貨。",
          "普通的一天，資源沒有明顯增減，你靠著日復一日的節制撐著。",
          "你把僅剩的資源重新分配了一下，確保接下來幾天不會突然斷炊。"
        ],
        scarce: [
          "存糧見底，你盯著空蕩蕩的倉儲，心裡盤算著明天無論如何都得出門一趟。",
          "飢餓感隱隱作祟，你喝了口水安撫自己，告訴自己再撐一下就好。",
          "資源緊張到讓人心浮氣躁，你反覆檢查了好幾次倉儲，希望自己算錯了。",
          "這種時候，每一份食物都要精算到最後一口，浪費不起。",
          "你翻遍了據點每個角落，只找到幾罐快過期的存糧，勉強夠撐過今晚。",
          "空空如也的貨架讓人心慌，你告訴自己，明天一定要優先補給。"
        ]
      };
      const COMPANION_LINES = {
        alone: [
          "據點裡只有你一個人的腳步聲，安靜得有些不真實。",
          "你習慣了自言自語，至少這樣，屋子裡不會太安靜。",
          "一個人的日子久了，你反而練就了跟自己相處的本事。",
          "沒有人可以商量，所有決定都得自己扛，但你也漸漸不覺得孤單有多可怕了。",
          "你把今天發生的事寫進日記——反正也沒有人可以說。",
          "空蕩的據點裡，只有你的影子陪著你。"
        ],
        one: [
          "夥伴在一旁忙著手邊的事，偶爾抬頭跟你交換一個眼神，不需要多說什麼。",
          "有人陪著的日子，連空氣都好像沒那麼壓抑。",
          "你和夥伴分工把據點內外都整理了一遍，兩人合力總是比一個人快。",
          "夥伴哼著不成調的歌，你聽著聽著，嘴角也跟著揚了起來。",
          "你們一起吃了頓簡單的飯，話不多，但這份陪伴本身就很足夠。",
          "有人在，代表萬一出了什麼事，也不是只有自己能依靠。"
        ],
        many: [
          "據點裡難得熱鬧，幾個人各自忙著手邊分配到的工作，井然有序。",
          "你環顧四周，這座原本冷清的據點，如今總算有了「一群人」的樣子。",
          "分工之後效率高了不少，你甚至能抽出時間做點自己的事。",
          "晚餐時間，大家圍坐在一起，聊著今天各自遇到的瑣事，氣氛難得輕鬆。",
          "人多了，摩擦也多了，但你寧可多一點這種煩惱，也不想回到孤身一人的日子。",
          "看著眾人各司其職的樣子，你第一次覺得這裡真的像是一個「基地」，而不只是一個容身之處。"
        ]
      };
      const LIBERATION_LINES = [
        [
          "城市依然被淪陷區籠罩，你能做的，也只有守住自己這一方小小的據點。",
          "遠方偶爾傳來說不清楚的異響，提醒著你，外頭的世界還遠遠稱不上安全。",
          "收復失土對你來說還是太遙遠的目標，眼下能活著就已經竭盡全力。",
          "你望著窗外扭曲的天際線，那些淪陷的行政區依然亮著詭異的螢光。",
          "這座城市的傷口還沒有一處真正癒合，你只能先顧好自己腳下這片土地。",
          "你偶爾會想，這樣的日子還要持續多久，但沒有答案，只能繼續撐下去。"
        ],
        [
          "插上第一面旗幟的那份成就感還沒有褪去，你知道，這只是開始。",
          "收復的那個行政區傳來零星的消息——似乎開始有倖存者敢在那附近活動了。",
          "一小塊失土回到人類手中，你偶爾會想起插旗那一刻的心情。",
          "城市依然殘破，但至少有一個角落，你知道那裡不再是純粹的危險地帶。",
          "你聽說有人開始在收復區附近建立臨時據點，這座城市或許真的還有救。",
          "一面旗幟不算什麼，但你選擇相信，這是連鎖反應的起點。"
        ],
        [
          "兩處失土插旗之後，你開始聽到更多零星的倖存者消息，這座城市不再只有你一個人在努力。",
          "收復區之間似乎開始有人試著互通有無，一種微弱但真實的連結感正在成形。",
          "你偶爾能在收復區附近遇到願意交易的商販，比起以前，這已經是很大的進步。",
          "越來越多人開始談論「收復」這個詞，不再只是你一個人的執念。",
          "兩面旗幟，兩份希望，你開始敢想像這座城市徹底恢復的樣子。",
          "淪陷區的範圍明顯縮小了，你站在據點屋頂，能望見的安全區域也比以前更大。"
        ],
        [
          "大半座城市都已插上旗幟，你的據點名字開始被越來越多倖存者提起。",
          "母體核心近在咫尺，你能感覺到，最後的決戰已經不遠了。",
          "收復區逐漸連成一片，你甚至可以規劃一條相對安全的巡邏路線。",
          "這座城市正在你眼前，一點一點地變回原本的樣子。",
          "你偶爾會收到其他倖存者送來的物資或消息，這種被記得的感覺，很久沒有過了。",
          "只剩最後一塊淪陷區，你反而變得格外謹慎——不想在終點前功虧一簣。"
        ],
        [
          "母體核心也已插旗，這座城市，終於有一大部分真正回到了人類手中。",
          "你站在曾經最危險的行政區邊界，望著眼前重新亮起的燈火，一時說不出話來。",
          "收復戰打完了，但你知道，重建才剛要開始——這反而讓你有種奇異的踏實感。",
          "城市各處陸續傳來倖存者重新聚居的消息，你的據點，成了這一切的起點之一。",
          "你偶爾會想起最初獨自一人守著這座據點的日子，如今回頭看，恍如隔世。",
          "收復戰是結束了，但這座城市的故事，顯然還遠遠沒有寫完。"
        ]
      ];
      const resourceLevel = (state.resources.food >= 15 && state.resources.water >= 15) ? "abundant"
        : (state.resources.food <= 3 || state.resources.water <= 3) ? "scarce" : "normal";
      const companionCount = Object.values(state.companions || {}).filter((v) => v !== "locked").length;
      const companionLevel = companionCount === 0 ? "alone" : companionCount === 1 ? "one" : "many";
      const liberatedCount = ["tier0_liberated", "tier1_liberated", "tier2_liberated", "tier3_liberated"]
        .filter((f) => state.flags && state.flags[f]).length;
      return [pick(RESOURCE_LINES[resourceLevel]), pick(COMPANION_LINES[companionLevel]), pick(LIBERATION_LINES[liberatedCount])].join("\n\n");
    }
  },
  // TRPG擲骰系統：以下3個事件示範skillCheck機制(力量/敏捷/感知各一)，d20+屬性修正 vs DC，
  // 分critical_success/success/fail/critical_fail四級，用於撬鎖/潛行/搜刮等高難度互動
  {
    id: "evt_locked_safe", title: "生鏽的保險箱",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 7,
    text: "廢墟角落有一個鏽跡斑斑的保險箱，門閂卡得很死。你試著搬動，感覺硬拚說不定能行。",
    options: [
      {
        label: "用力撬開", skillCheck: {
          attribute: "strength", dc: 12,
          critical_success: { effect: { resources: { scrap: 8 }, embers: 5 }, resultText: "你一鼓作氣，鎖頭應聲斷裂，箱子裡的東西比想像中還豐盛！" },
          success: { effect: { resources: { scrap: 4 } }, resultText: "幾番使力後，鎖頭終於鬆脫，箱子裡還留著一些堪用的零件。" },
          fail: { effect: { stamina: -1 }, resultText: "你費了好大力氣，鎖頭卻紋風不動，只換來一身痠痛。" },
          critical_fail: { effect: { hp: -6 }, resultText: "手一滑，生鏽的鐵皮狠狠劃過你的手臂，痛得你倒抽一口氣。" }
        }
      },
      { label: "放棄，直接離開", effect: {}, resultText: "你決定不浪費力氣，轉身離開。" }
    ]
  },
  {
    id: "evt_stealth_bypass", title: "潛行繞過感染者群",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 7,
    text: "前方巷子裡聚集著一小群徘徊的感染者，你若想通過，得想辦法不驚動牠們。",
    options: [
      {
        label: "屏息潛行通過", skillCheck: {
          attribute: "agility", dc: 12,
          critical_success: { effect: { embers: 5 }, resultText: "你的腳步輕得像影子，感染者群渾然未覺，你毫髮無傷地穿了過去。" },
          success: { effect: {}, resultText: "你貼著牆邊小心移動，總算有驚無險地繞了過去。" },
          fail: { effect: { stamina: -1 }, resultText: "你踩到一塊碎玻璃，發出輕微聲響，只好緊張地繞遠路避開。" },
          critical_fail: { effect: {}, battle: "enemy_walker_weak", resultText: "你不小心踢翻了一個鐵罐，刺耳的聲響瞬間引來感染者的注意！" }
        }
      },
      { label: "正面清場", battle: "enemy_walker_weak" }
    ]
  },
  {
    id: "evt_hidden_stash", title: "若有似無的痕跡",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 7,
    text: "牆角一處不太自然的凹陷引起你的注意，像是刻意被掩藏過的痕跡。",
    options: [
      {
        label: "仔細搜索", skillCheck: {
          attribute: "perception", dc: 12,
          critical_success: { effect: { resources: { food: 4, water: 4, medicine: 1 } }, resultText: "你的直覺沒有錯，牆縫深處藏著一個完整的補給包，收穫豐碩！" },
          success: { effect: { resources: { food: 2, water: 2 } }, resultText: "你翻找片刻，找到幾件被藏起來的物資。" },
          fail: { effect: {}, resultText: "你找了半天，那處凹陷似乎只是自然形成的，什麼也沒有。" },
          critical_fail: { effect: { stamina: -1 }, resultText: "你伸手探進縫隙，被裡頭的碎玻璃劃破了手指。" }
        }
      },
      { label: "不予理會", effect: {}, resultText: "你決定不浪費時間，逕自離開。" }
    ]
  }
];

// ---------- 任務與成就系統（規格文件/任務與成就系統_設計規格.md）----------
// 主線：nextQuestId鏈式串接，永遠只有一個進行中的主線任務(state.questProgress.activeMain)
// 支線：平坦集合，category分collect/companion/explore三類，UI對應3個子分頁
// 注意：condition只「監看」現有flag/day/facilities等狀態，不主動改變遊戲邏輯
const QUESTS = {
  // ===== 主線（共7章，第7章=「畢業」非結局，因主迴圈是無限模式）=====
  main_01_wake_up: {
    id: "main_01_wake_up", type: "main", chapter: 1,
    title: "醒來", desc: "在末日中睜開眼，這是你重新開始的第一天。",
    condition: (state) => true,
    reward: { embers: 10 },
    nextQuestId: "main_02_settle_in",
  },
  main_02_settle_in: {
    id: "main_02_settle_in", type: "main", chapter: 2,
    title: "安頓下來", desc: "在安全屋擺上一件家具，讓這裡更像個家。",
    condition: (state) => countPlacedFurnitureInData(state) > 0,
    reward: { embers: 20 },
    nextQuestId: "main_03_not_alone",
  },
  main_03_not_alone: {
    id: "main_03_not_alone", type: "main", chapter: 3,
    title: "不再是一個人", desc: "招募至少2名隊員，組成你的隊伍。",
    condition: (state) => Object.values(state.companions).filter(v => v !== "locked").length >= 2,
    reward: { exp: 50 },
    nextQuestId: "main_04_storm_coming",
  },
  main_04_storm_coming: {
    id: "main_04_storm_coming", type: "main", chapter: 4,
    title: "風暴將至", desc: "感應到血月將臨的徵兆。",
    condition: (state) => !!(state.upcomingThreat && state.day >= state.upcomingThreat.day), // 等同isThreatDue(state)（logic.js:565），直接讀state避免跨檔案函式依賴順序風險
    reward: { embers: 20 },
    nextQuestId: "main_05_blood_moon_night",
  },
  main_05_blood_moon_night: {
    id: "main_05_blood_moon_night", type: "main", chapter: 5,
    title: "血月之夜", desc: "在第一次血月之夜中存活下來。",
    condition: (state) => (state.questFlags.bloodMoonSurvivedCount || 0) >= 1,
    reward: { embers: 50, exp: 50 },
    nextQuestId: "main_06_reclaim",
  },
  main_06_reclaim: {
    id: "main_06_reclaim", type: "main", chapter: 6,
    title: "收復失土", desc: "解放近郊封鎖線（Tier 0行政區）。",
    condition: (state) => !!(state.flags && state.flags.tier0_liberated),
    reward: { embers: 50 },
    nextQuestId: "main_07_graduation",
  },
  main_07_graduation: {
    id: "main_07_graduation", type: "main", chapter: 7,
    title: "活下去的日子", desc: "你已經站穩腳步，接下來的故事由你自己決定。",
    condition: (state) => true,
    reward: { embers: 30 },
    nextQuestId: null,
  },

  // ===== 支線·📦收集 =====
  side_collect_furnish_full: {
    id: "side_collect_furnish_full", type: "side", category: "collect",
    title: "把家填滿", desc: "牆面/桌面/地板的4個陳列格都擺上家具。",
    condition: (state) => countPlacedFurnitureInData(state) >= 4,
    reward: { embers: 30 },
  },
  side_collect_floors: {
    id: "side_collect_floors", type: "side", category: "collect",
    title: "換個樣子", desc: "解鎖3種不同的地板樣式。",
    condition: (state) => (state.unlockedFloors || []).length >= 3,
    reward: { scrap: 10 },
  },
  side_collect_vinyl: {
    id: "side_collect_vinyl", type: "side", category: "collect",
    title: "黑膠唱片之夜", desc: "找到一張黑膠唱片，並在收音機旁聽完一整晚的音樂。",
    condition: (state) => !!(state.flags && state.flags.music_healed),
    reward: { exp: 20 },
  },
  side_collect_factions: {
    id: "side_collect_factions", type: "side", category: "collect",
    title: "五行俱全", desc: "曾經擁有過5大派系（蓋亞/賽博/洋流/大氣/靈能）裝備各一件。",
    condition: (state) => {
      const owned = new Set([
        ...state.inventory.map(i => ITEMS[i.itemId] && ITEMS[i.itemId].factionTag),
        ...state.weaponInstances.map(w => ITEMS[w.baseItemId] && ITEMS[w.baseItemId].factionTag),
        ...Object.values(state.equipment).map(id => id && ITEMS[id] && ITEMS[id].factionTag),
      ].filter(Boolean));
      return FACTION_IDS.every(f => owned.has(f));
    },
    reward: { embers: 50 },
  },
  side_collect_facilities: {
    id: "side_collect_facilities", type: "side", category: "collect",
    title: "據點基礎建設", desc: "指揮中心/溫室/工坊/雷達站全部升到Lv1以上。",
    condition: (state) => ["command", "greenhouse", "workshop", "radar"].every(k => (state.facilities[k] || 0) >= 1),
    reward: { scrap: 20 },
  },
  side_collect_farm: {
    id: "side_collect_farm", type: "side", category: "collect",
    title: "開墾庭院", desc: "解鎖庭院的全部18塊農地。",
    condition: (state) => !!(state.farm && Object.values(state.farm.plots).every(p => p.unlocked)),
    reward: { embers: 30, exp: 30 }, // 2026-09-20農地擴成18格(全部解鎖共510廢料)，獎勵從廢料15拉高到跟成本相稱
  },
  side_collect_pens: {
    id: "side_collect_pens", type: "side", category: "collect",
    title: "擴建牧場", desc: "把牧場擴建到全部8個容量。",
    condition: (state) => !!(state.pens && Object.values(state.pens.plots).every(p => p.unlocked)),
    reward: { embers: 25, exp: 25 }, // 2026-09-20牧場容量4→8(全部擴建共196廢料)，獎勵從廢料15拉高到跟成本相稱
  },
  side_collect_workshop: {
    id: "side_collect_workshop", type: "side", category: "collect",
    title: "擴建加工間", desc: "解鎖加工間的全部3個加工站。",
    condition: (state) => !!(state.processing && Object.values(state.processing.stations).every(s => s.unlocked)),
    reward: { scrap: 15 },
  },

  // ===== 支線·👥隊員 =====
  side_companion_full_squad: {
    id: "side_companion_full_squad", type: "side", category: "companion",
    // 2026-07-04：V3同伴名冊從3人擴充到6人(COMPANIONS_REGISTRY)，「全員到齊」門檻同步從3改成6，
    // 否則招滿一半就會誤判「全員」，跟標題語意不符
    title: "全員到齊", desc: "招募完整的6人隊伍。",
    condition: (state) => Object.values(state.companions).filter(v => v !== "locked").length >= 6,
    reward: { embers: 50 },
  },
  side_companion_care: {
    id: "side_companion_care", type: "side", category: "companion", repeatable: "manual", resetField: "careCompletedCount", counterField: "careCompletedCount", counterTarget: 5,
    title: "彼此照顧", desc: "指派隊員執行「照護」任務並完成5次。",
    condition: (state) => (state.questFlags.careCompletedCount || 0) >= 5,
    reward: { exp: 30 },
  },
  side_companion_stray_dog: {
    id: "side_companion_stray_dog", type: "side", category: "companion",
    title: "不請自來的夥伴", desc: "餵食一隻流浪狗，看牠是否決定留下來。",
    condition: (state) => !!(state.flags && state.flags.dog_companion),
    reward: { exp: 15 },
  },
  side_companion_cyborg_choice: {
    id: "side_companion_cyborg_choice", type: "side", category: "companion",
    title: "改造人的抉擇", desc: "面對逃亡的改造實驗體，做出你的選擇——無論救他還是放棄他，後果都會找上門。",
    condition: (state) => !!(state.flags && (state.flags.cyborg_revenge_done || state.flags.cyborg_nemesis_done)),
    reward: { embers: 30 },
  },
  side_companion_stranger: {
    id: "side_companion_stranger", type: "side", category: "companion",
    title: "陌路相逢", desc: "在荒野中與一名陌生人相遇，無論結果如何，都記下這次相遇。",
    condition: (state) => !!(state.flags && state.flags.stranger_event_done),
    reward: { exp: 15 },
  },

  // ===== 支線·🧭探索 =====
  side_explore_seed: {
    id: "side_explore_seed", type: "side", category: "explore",
    title: "溫室的祕密", desc: "在溫室種出異變植株，並完成收穫。",
    condition: (state) => !!(state.flags && state.flags.seed_harvested),
    reward: { embers: 20 },
  },
  side_explore_camp: {
    id: "side_explore_camp", type: "side", category: "explore",
    title: "倖存者營地", desc: "活到第10天，解鎖倖存者營地。",
    condition: (state) => state.day >= 10,
    reward: { exp: 20 },
  },
  side_explore_daily_gather: {
    id: "side_explore_daily_gather", type: "side", category: "explore", repeatable: "day", counterField: "gatherTodayCount", counterTarget: 2,
    title: "今日份的努力", desc: "今天完成2次採集。",
    condition: (state) => (state.questFlags.gatherTodayCount || 0) >= 2,
    reward: { scrap: 5 },
  },
  side_explore_family: {
    id: "side_explore_family", type: "side", category: "explore",
    title: "南邊的橋", desc: "追查一張關於失散家人的字條線索，了結這份牽掛。",
    condition: (state) => !!(state.flags && state.flags.family_search_done),
    reward: { exp: 25 },
  },
  side_explore_radio_lead: {
    id: "side_explore_radio_lead", type: "side", category: "explore",
    title: "北邊的訊號塔", desc: "記下一段神祕電台頻率，動身前往訊號來源一探究竟。",
    condition: (state) => !!(state.flags && state.flags.radio_journey_done),
    reward: { scrap: 15 },
  },

  // ===== 支線·🔁循環委託（程序化支線目標，2026-07-06）=====
  // 比照既有side_companion_care的repeatable:"manual"模式，額外加targetRange讓每輪目標次數也隨機，
  // 不是每次都固定同一個數字——搭配獨立的counterField(不跟totalKills等成就用的累計計數共用)，
  // 完成後counterField歸零+重抽下一輪targetRange，理論上可以無限重複，讓「支線做完就沒了」不再成立。
  // condition用一般function而非箭頭函式：checkQuestsAndAchievements統一以q.condition(state)呼叫，
  // this會自動綁定成該quest物件本身，故能從this.id/this.counterField/this.counterTarget直接讀取，
  // 不用像原本那樣把"side_repeat_kills_target"這種目標key字面重複寫死一次(id改名時容易忘記同步改，見code review)
  side_repeat_kills: {
    id: "side_repeat_kills", type: "side", category: "explore", repeatable: "manual",
    resetField: "repeatKillCount", counterField: "repeatKillCount", counterTarget: 3, targetRange: [3, 8],
    title: "清剿委託", desc: "擊敗一定數量的敵人（每輪目標次數不固定）。",
    condition: function (state) { return repeatQuestReady(state, this); },
    reward: { exp: 20 },
  },
  side_repeat_bloodmoon: {
    id: "side_repeat_bloodmoon", type: "side", category: "explore", repeatable: "manual",
    resetField: "repeatBloodMoonCount", counterField: "repeatBloodMoonCount", counterTarget: 1, targetRange: [1, 3],
    title: "血月志願兵", desc: "撐過一定次數的血月狂潮（每輪目標次數不固定）。",
    condition: function (state) { return repeatQuestReady(state, this); },
    reward: { embers: 15 },
  },
  side_repeat_gather: {
    id: "side_repeat_gather", type: "side", category: "collect", repeatable: "manual",
    resetField: "repeatGatherCount", counterField: "repeatGatherCount", counterTarget: 4, targetRange: [4, 10],
    title: "囤積循環", desc: "累積完成一定次數的採集（每輪目標次數不固定）。",
    condition: function (state) { return repeatQuestReady(state, this); },
    reward: { scrap: 6 },
  },
  side_repeat_pen: {
    id: "side_repeat_pen", type: "side", category: "collect", repeatable: "manual",
    resetField: "repeatPenCareCount", counterField: "repeatPenCareCount", counterTarget: 4, targetRange: [4, 10],
    title: "牲畜的陪伴", desc: "累積餵食或互動一定次數（每輪目標次數不固定）。",
    condition: function (state) { return repeatQuestReady(state, this); },
    reward: { exp: 15 },
  },
};

// 成就：4類「存活/戰鬥/收集/探索意外」，永久記錄(state.unlockedAchievements)，不因任務重置而消失
const ACHIEVEMENTS = {
  // ===== 🏕️存活 =====
  ach_survive_30: {
    id: "ach_survive_30", category: "survival",
    title: "三十天倖存者", desc: "存活滿30天。",
    condition: (state) => state.day >= 30,
    reward: { embers: 15 }, hidden: false,
  },
  ach_survive_60: {
    id: "ach_survive_60", category: "survival",
    title: "六十天倖存者", desc: "存活滿60天。",
    condition: (state) => state.day >= 60,
    reward: { embers: 25 }, hidden: false,
  },
  ach_blood_moon_streak3: {
    id: "ach_blood_moon_streak3", category: "survival",
    title: "百戰不殆", desc: "連續存活過3次血月之夜。",
    condition: (state) => (state.questFlags.bloodMoonWinStreak || 0) >= 3,
    reward: { embers: 20 }, hidden: false,
  },

  // ===== ⚔️戰鬥 =====
  ach_kills_50: {
    id: "ach_kills_50", category: "combat",
    title: "身經百戰", desc: "累計擊殺50名敵人。",
    condition: (state) => (state.questFlags.totalKills || 0) >= 50,
    reward: { exp: 20 }, hidden: false,
  },
  ach_cyborg_nemesis: {
    id: "ach_cyborg_nemesis", category: "combat",
    title: "鋼鐵的代價", desc: "擊敗鋼鐵湮滅者。",
    condition: (state) => !!(state.flags && state.flags.cyborg_nemesis_done),
    reward: { embers: 20 }, hidden: false,
  },
  ach_legendary_equip: {
    id: "ach_legendary_equip", category: "combat",
    title: "傳說在身", desc: "裝備過一件傳說（legendary）等級裝備。",
    // 2026-07-06修正：legendary裝備必定被實例化成inst_xxxx(見instantiateEquipment)，原本直接
    // ITEMS[state.equipment[slot]]查表永遠查到undefined，導致這個成就在正常遊戲流程下完全無法達成
    // (見code review)。改用resolveEquippedItemInData()正確解析實例參考
    condition: (state) => ["weapon", "armor", "accessory"].some(slot => {
      const item = resolveEquippedItemInData(state, slot);
      return item && item.rarity === "legendary";
    }),
    reward: { exp: 25 }, hidden: false,
  },

  // ===== 📦收集 =====
  ach_full_house: {
    id: "ach_full_house", category: "collect",
    title: "千變萬化", desc: "4個陳列格都擺上家具，且解鎖全部3種地板樣式。",
    condition: (state) => countPlacedFurnitureInData(state) >= 4 && (state.unlockedFloors || []).length >= 3,
    reward: { scrap: 15 }, hidden: false,
  },
  ach_farm_harvest: {
    id: "ach_farm_harvest", category: "collect",
    title: "第一次收成", desc: "在庭院收成一次作物。",
    condition: (state) => (state.questFlags && state.questFlags.farmHarvestCount) >= 1,
    reward: { embers: 10 }, hidden: false,
  },
  ach_pen_collect: {
    id: "ach_pen_collect", category: "collect",
    title: "第一份蛋（或毛）", desc: "在牧場收成一次動物產出。",
    condition: (state) => (state.questFlags && state.questFlags.penCollectCount) >= 1,
    reward: { embers: 10 }, hidden: false,
  },
  ach_workshop_craft: {
    id: "ach_workshop_craft", category: "collect",
    title: "第一份加工品", desc: "在加工間完成一次加工。",
    condition: (state) => (state.questFlags && state.questFlags.workshopCraftCount) >= 1,
    reward: { embers: 10 }, hidden: false,
  },
  ach_wedding_ring: {
    id: "ach_wedding_ring", category: "collect",
    title: "至死不渝", desc: "取得並裝備婚戒。",
    // 2026-07-06修正：wedding_ring是epic稀有度，會被實例化成inst_xxxx，原本字面比對
    // state.equipment.accessory === "wedding_ring"永遠是false，這個成就在正常遊戲流程下
    // 完全無法達成(見code review)。改用isEquippedInData()正確解析實例參考
    condition: (state) => isEquippedInData(state, "accessory", "wedding_ring"),
    reward: { embers: 20 }, hidden: false,
  },
  ach_camp_lv3: {
    id: "ach_camp_lv3", category: "survival",
    title: "站穩腳跟", desc: "營地升到3級「穩固據點」。",
    condition: (state) => (state.campLevelSeen || 1) >= 3,
    reward: { embers: 30 }, hidden: false,
  },
  ach_camp_lv5: {
    id: "ach_camp_lv5", category: "survival",
    title: "灰燼中的家", desc: "營地升到最高級「灰燼中的家」。",
    condition: (state) => (state.campLevelSeen || 1) >= 5,
    reward: { embers: 80, exp: 50 }, hidden: false,
  },
  ach_all_projects: {
    id: "ach_all_projects", category: "collect",
    title: "一磚一瓦", desc: "完成全部建造專案。",
    condition: (state) => !!state.projects && Object.keys(PROJECTS).every(id => state.projects[id] && state.projects[id].status === "done"),
    reward: { embers: 60 }, hidden: false,
  },
  ach_full_factions: {
    id: "ach_full_factions", category: "collect",
    title: "五行宗師", desc: "同時裝備5大派系裝備中的3個不同派系（武器/護甲/飾品三槽位）。",
    // 2026-07-06修正：原本ITEMS[state.equipment[slot]]查表對稀有以上裝備(inst_xxxx)永遠查到
    // undefined，玩家只要三槽位裡有任一件非common/uncommon裝備，就可能被低估派系數量甚至誤判
    // 未達成(見code review)。改用resolveEquippedItemInData()正確解析實例參考
    condition: (state) => new Set(["weapon", "armor", "accessory"].map(slot => {
      const item = resolveEquippedItemInData(state, slot);
      return item && item.factionTag;
    }).filter(Boolean)).size >= 3,
    reward: { exp: 20 }, hidden: false,
  },

  // ===== 🔍探索意外（hidden比例較高，保留驚喜感）=====
  ach_dog_companion: {
    id: "ach_dog_companion", category: "discovery",
    title: "不只是寵物", desc: "讓一隻流浪狗決定留下來陪你。",
    condition: (state) => !!(state.flags && state.flags.dog_companion),
    reward: { exp: 10 }, hidden: false,
  },
  ach_betrayal_path: {
    id: "ach_betrayal_path", category: "discovery", hidden: true,
    title: "沒有人是無辜的", desc: "選擇推改造人去送死，並親手終結他化身的怪物。",
    condition: (state) => !!(state.flags && state.flags.betrayed_cyborg && state.flags.cyborg_nemesis_done),
    reward: { embers: 15 },
  },
  ach_secret_rare_event: {
    id: "ach_secret_rare_event", category: "discovery", hidden: true,
    title: "命中那道微光", desc: "觸發一段極度罕見的隨機事件。",
    condition: (state) => (state.seenEvents || []).includes("evt_failed_exp_01"),
    reward: { embers: 15 },
  },
};

// 草稿3：血月降臨開場白/獲勝結算開場輪替文案，取代原本寫死的單一字串
const BLOOD_MOON_INTRO_TEXTS = [
  "天色驟然轉為詭異的血紅色，遠方傳來低頻的嗡鳴——血月狂潮，如期而至。",
  "空氣中瀰漫的螢光粉塵驟然變得濃烈，天邊那輪血月冷冷俯視著這座城市。",
  "警報聲劃破寧靜，你抬頭望向天空——月亮正一點一點被血紅色侵染。",
  "地脈活化的震動從腳底傳來，你知道，屬於今晚的考驗已經無可迴避。",
  "遠方傳來此起彼落的咆哮，混雜著異變生物的嘶吼——血月的氣息已經瀰漫整座城市。",
  "你望著窗外，那輪血紅的月亮正緩緩爬上天際，今晚註定不會平靜。",
  "螢光紋路順著地面裂縫蔓延開來，像是整座城市都在為即將到來的狂潮做準備。",
  "低沉的嗡鳴聲從四面八方湧來，你握緊手中的武器——血月來了。",
  "空氣變得粘稠而壓抑，你能感覺到某種龐大的意識正在聚集，朝著這座據點而來。",
  "天邊的血月比以往更加刺眼，你知道，今晚的狂潮恐怕會比預期中更加猛烈。",
  "遠處建築的輪廓在血色月光下扭曲變形，異變生物的低吼聲越來越近。",
  "你深吸一口氣，看著那輪血月完全染紅天際——不管準備得夠不夠，戰鬥都要開始了。"
];
const BLOOD_MOON_VICTORY_TEXTS = [
  "最後一波攻勢終於被擊退，血月的紅光漸漸褪去，你靠著牆大口喘著氣。",
  "天邊的血月緩緩恢復成原本的銀白色，你知道，這一夜總算是撐過去了。",
  "異變生物的咆哮聲漸漸遠去，據點的警報也隨之解除——又是一次驚險的勝利。",
  "你環顧滿目瘡痍的據點，雖然狼狽，但每個人都還站著，這就足夠了。",
  "血月的氣息逐漸散去，你這才發現自己全身早已被冷汗浸濕。",
  "最後一隻異變生物倒下的瞬間，天邊的血色也開始褪去，黎明將至。",
  "你癱坐在地上，聽著據點外逐漸恢復的寂靜——這份寂靜，此刻聽起來格外美好。",
  "螢光粉塵漸漸沉澱，血月的威脅暫時解除，你和夥伴們相視一笑，卻笑得有些疲憊。",
  "據點的防禦工事雖然傷痕累累，但終究撐住了——你摸了摸牆面，像是在感謝它。",
  "天空一點一點找回原本的顏色，你知道，這座據點又活過了一次血月狂潮。",
  "你清點了一下彼此的傷勢，所幸都不算太重——比起上一次，這次的損失已經好很多了。",
  "血月的紅光徹底消散，取而代之的是熟悉的夜色，你終於敢放鬆緊繃了一整晚的肩膀。"
];

// 血月模組化(2026-07-06)：讓每次血月從這個小型模板池抽一種變化，避免day250+後血月夜永遠是同一套流程。
// standard權重50%維持血月的經典既定印象是常態，其餘4種瓜分50%——不新增戰鬥機制，
// 只是換敵人組成(swapEnemyId)/加重指揮官(bossExtraTier)/換文案(introFlavor/victoryFlavor)/換獎勵(rewardBonus)，
// 詳見規格文件/血月模組化的討論(TODO_待辦事項.md「內容量審視」章節)
const BLOOD_MOON_MODIFIERS = [
  { id: "standard", name: "標準夜", weight: 50 },
  {
    id: "raiders", name: "掠奪者血月", weight: 15,
    introFlavor: "這次不是漫無目的的怪物——一群眼神瘋狂的掠奪者，正直撲你的糧倉而去。",
    victoryFlavor: "擊退了那群掠奪者後，你從他們留下的行囊裡翻出不少現成的補給。",
    swapEnemyId: "enemy_walker_armed",
    rewardBonus: { resources: { scrap: 8 } }
  },
  {
    id: "silent", name: "靜默血月", weight: 15,
    introFlavor: "今晚出奇地安靜，沒有雜亂的嘶吼——但那陣腳步聲，卻異常沉重而清晰。",
    victoryFlavor: "在死寂中撐過了這場硬仗，你精疲力盡地癱坐下來。",
    bossExtraTier: 1,
    rewardBonus: { skillPoint: 1 }
  },
  {
    id: "psychic_surge", name: "靈能亂流之夜", weight: 12,
    introFlavor: "空氣中瀰漫著一股躁動的靈能雜訊，讓人心浮氣躁卻又莫名亢奮。",
    victoryFlavor: "亂流散去的瞬間，你感覺到一股清晰的頓悟湧上心頭。",
    rewardBonus: { embers: 20 }
  },
  {
    id: "spore_haze", name: "孢子瀰漫之夜", weight: 8,
    introFlavor: "空氣中瀰漫著淡淡的孢子粉塵，吸入後隱約有種昏沉的錯覺感。",
    victoryFlavor: "撐過了這場孢子瀰漫的血月，你的肺裡似乎還殘留著一絲說不清的異樣感。",
    rewardBonus: { san: -5, resources: { medicine: 2 } }
  }
];

// 地點探索模組化(2026-07-06)：比照血月模組化同一套手法，讓每次前往地點(近距離/遠距離皆適用)從這個
// 小型模板池抽一種「今日探索條件」，避免探索永遠是同一種節奏。只調整2個既有數值(encounterChanceDelta/qtyBonus)，
// 不新增機制——resolveLocation()直接吃這兩個欄位疊加進既有計算
const LOCATION_MODIFIERS = [
  { id: "standard", name: "如常的一趟", weight: 55 },
  {
    id: "raiders_nearby", name: "掠奪者出沒", weight: 15,
    flavor: "附近似乎有不只怪物在活動的跡象——某種更有目的性的威脅感，讓你不自覺提高警覺。",
    encounterChanceDelta: 0.15
  },
  {
    id: "resource_rich", name: "資源豐富的角落", weight: 15,
    flavor: "這一帶意外地被清理得比想像中乾淨，可用的物資似乎比平常更多。",
    qtyBonus: 1
  },
  {
    id: "unusually_quiet", name: "異常寧靜", weight: 10,
    flavor: "四周異常安靜，連平常盤據在附近的怪物都不見蹤影。",
    encounterChanceDelta: -0.1
  },
  {
    id: "psychic_residue", name: "螢光殘留波動", weight: 5,
    flavor: "空氣裡飄著細碎的螢光殘留，隱約帶著危險的氣息，卻也讓你的直覺格外敏銳。",
    encounterChanceDelta: 0.05, qtyBonus: 1
  }
];

// 無限模式後期內容(2026-07-05)：「深淵擴散」戰的開場/勝利文案，呼應「四大行政區收復後，
// 母體核心的殘餘勢力仍持續反撲」的世界觀延續，見規格文件/無限模式後期內容_設計規格.md
const ABYSS_SURGE_INTRO_TEXTS = [
  "四大行政區的旗幟都已插上，但地脈深處傳來的震動絲毫沒有平息——母體核心的殘餘勢力，正從裂縫中湧出。",
  "你以為收復行動已經告一段落，直到那道熟悉的血色再次染紅天際，這次帶著一股更原始的敵意。",
  "「深淵先驅」——你從未聽過這個稱呼，但此刻空氣中瀰漫的壓迫感，讓你明白這不是普通的血月夜。",
  "收復四大行政區的餘波還沒散去，一股更深沉的威脅已經從地底甦醒，朝著你的據點逼近。"
];
const ABYSS_SURGE_VICTORY_TEXTS = [
  "深淵先驅倒下的瞬間，地脈的震動也隨之平息——但你知道，這股力量遲早還會再度湧現。",
  "你靠著牆大口喘氣，這一戰比任何一次Tier區域的收復戰都更加驚險，但你撐了下來。",
  "殘餘的威脅暫時被壓制，你清點著滿身的傷痕，心裡清楚，深淵不會就此罷休。"
];

// ---------- 營地成長：建造專案 + 營地等級（2026-09-20，見規格文件/營地等級與建造專案_設計規格.md） ----------
// 玩家回饋「默默把自己基地養成的感覺太薄弱」：加上「花幾個晝夜慢慢蓋好」的大型建造專案，以及由設施/舒適度/專案/農牧/同伴
// 綜合算出的營地等級，等級提升時小屋畫面會跟著進化。建造沿用加工區的「記錄開始的phase、用phase差值惰性推算」手法，
// 效果用資料驅動的加成登錄表(effects)，由logic.js的getProjectEffect()單一聚合、掛進既有的各個計算函式。
// phases=耗時(每個晝或夜算1個phase，2個phase=1天)；cost.resources/embers是開工時一次扣除
const PROJECTS = {
  proj_rain_tower: {
    id: "proj_rain_tower", name: "雨水收集塔", icon: "🪣", requiresCampLv: 1, phases: 4,
    cost: { resources: { scrap: 20 } },
    effects: { phaseYield: { water: 1 } },
    effectDesc: "每個晝夜自動蓄水，飲水+1",
    doneText: "屋頂的接水槽總算接上了儲水桶。下過第一場雨之後，桶底已經積了一層清水——不用再為了乾淨的水走遠路。",
  },
  proj_storage: {
    id: "proj_storage", name: "儲物棚", icon: "📦", requiresCampLv: 1, phases: 4,
    cost: { resources: { scrap: 25 } },
    effects: { resourceCapBonus: 10 },
    effectDesc: "所有資源儲量上限+10",
    doneText: "用舊貨架和防水布搭起的儲物棚立了起來。以前塞不下的物資，現在終於有地方好好收著了。",
  },
  proj_smoke: {
    id: "proj_smoke", name: "煙燻架", icon: "🍖", requiresCampLv: 2, phases: 4,
    cost: { resources: { scrap: 20, food: 8 } },
    effects: { phaseYield: { food: 1 } },
    effectDesc: "每個晝夜自動處理保存食物，食物+1",
    doneText: "煙燻架冒出第一縷細煙。多出來的食材被仔細處理過，不再放到壞掉，每天都能多撐一點。",
  },
  proj_wall: {
    id: "proj_wall", name: "加固圍牆", icon: "🧱", requiresCampLv: 2, phases: 6,
    cost: { resources: { scrap: 35 } },
    effects: { baseDefenseBonus: 2 },
    effectDesc: "據點防禦+2",
    doneText: "最後一塊鐵皮釘上去的時候，你退後幾步看著整圈圍牆。它不好看，但今晚起，外頭的東西沒那麼容易闖進來了。",
  },
  proj_watchtower: {
    id: "proj_watchtower", name: "瞭望台", icon: "🔭", requiresCampLv: 2, phases: 6,
    cost: { resources: { scrap: 30, food: 5 } },
    effects: { raidChanceDelta: -0.08 },
    effectDesc: "夜襲機率-8%",
    doneText: "瞭望台架好了。站在上頭能看見更遠的街角，有什麼東西靠近，這次你會比牠們先發現。",
  },
  proj_clinic: {
    id: "proj_clinic", name: "簡易診所", icon: "🩺", requiresCampLv: 2, phases: 6,
    cost: { resources: { scrap: 25, medicine: 2 } },
    effects: { restHealBonus: 8 },
    effectDesc: "休息時額外回復HP+8",
    doneText: "角落多了一張鋪著乾淨床單的診療床，藥品也終於有了固定的擺放位置。從今以後，休息真的能把傷養好。",
  },
  proj_generator: {
    id: "proj_generator", name: "發電機房", icon: "⚡", requiresCampLv: 3, phases: 8,
    cost: { resources: { scrap: 45 } },
    effects: { staminaMaxBonus: 1 },
    effectDesc: "體力上限+1",
    doneText: "發電機終於在隔音的小房間裡穩定運轉。夜裡有了穩定的燈光，你比從前更有精神撐過一整天。",
  },
  proj_soundproof: {
    id: "proj_soundproof", name: "隔音牆", icon: "🔇", requiresCampLv: 3, phases: 6,
    cost: { resources: { scrap: 40 } },
    effects: { noiseDampRatio: 0.3 },
    effectDesc: "行動製造的噪音-30%",
    doneText: "外牆內襯了一層厚厚的舊棉被和吸音板。敲敲打打的聲音被悶在牆裡，遠處的東西聽不見了。",
  },
  proj_lab: {
    id: "proj_lab", name: "研究角", icon: "🔬", requiresCampLv: 4, phases: 8,
    cost: { resources: { scrap: 60 }, embers: 30 },
    effects: { gatherYieldBonusRatio: 0.15 },
    effectDesc: "採集收穫+15%",
    doneText: "工作檯上擺滿了拆解到一半的零件和手寫的筆記。你逐漸摸清了哪裡該翻、哪些東西值得留——採集的效率明顯不一樣了。",
  },
};

// 營地等級：每一級是「需求清單」，全部滿足才升級(連續判定)。req.type對應logic.js campRequirementValue()
// 門檻對照既有數值範圍：設施總等級最高12(4種x3級)、舒適度依家具稀有度加總(common1/rare2/epic3)、
// 舒適度效果門檻本來就是3/6/10。reward是升級時一次性給的晶燼，levelUpText是升級時主畫面的短文案
const CAMP_LEVELS = [
  { lv: 1, name: "殘破小屋", reqs: [], desc: "四面漏風的屋子，勉強擋得住雨。" },
  { lv: 2, name: "簡易營地", reward: 20,
    reqs: [{ type: "facilityTotal", n: 2, label: "設施總等級" }, { type: "comfort", n: 3, label: "舒適度" }, { type: "projectsDone", n: 1, label: "完成建造專案" }],
    desc: "屋子有了樣子，開始像個能住人的地方。",
    levelUpText: "你站在門口環顧四周——牆補過了，角落有了固定的東西，這裡不再只是「暫時躲一躲」的地方，而是一座簡易的營地。" },
  { lv: 3, name: "穩固據點", reward: 40,
    reqs: [{ type: "facilityTotal", n: 5, label: "設施總等級" }, { type: "comfort", n: 6, label: "舒適度" }, { type: "projectsDone", n: 3, label: "完成建造專案" }, { type: "farmPlots", n: 4, label: "開墾農地" }],
    desc: "有防禦、有存糧、有自己的小菜園，能同時進行兩項建設。",
    levelUpText: "夜裡的風聲不再讓你不安。圍牆、菜園、儲糧都有了著落——這裡已經是一處穩固的據點，你甚至有餘力同時動工兩項建設。" },
  { lv: 4, name: "小型聚落", reward: 80,
    reqs: [{ type: "facilityTotal", n: 8, label: "設施總等級" }, { type: "comfort", n: 10, label: "舒適度" }, { type: "projectsDone", n: 5, label: "完成建造專案" }, { type: "companions", n: 2, label: "同伴人數" }, { type: "penAnimals", n: 1, label: "牧場動物" }],
    desc: "同伴、牲畜、菜園，這裡漸漸有了人氣。",
    levelUpText: "有人在院子裡走動，有動物在圍欄裡悠閒地晃，燈火在夜裡一盞盞亮著。這裡不只是據點，已經開始像一個小小的聚落。" },
  { lv: 5, name: "灰燼中的家", reward: 150,
    reqs: [{ type: "facilityTotal", n: 11, label: "設施總等級" }, { type: "comfort", n: 14, label: "舒適度" }, { type: "projectsDone", n: 8, label: "完成建造專案" }, { type: "farmPlots", n: 10, label: "開墾農地" }, { type: "companions", n: 4, label: "同伴人數" }, { type: "day", n: 80, label: "生存天數" }],
    desc: "廢墟裡長出來的、真正屬於你們的家。",
    levelUpText: "你坐在院子裡，看著這一切：一磚一瓦都是自己和同伴親手搭起來的。世界依然是灰燼，但在這片灰燼裡，你們有了一個家。" },
];

if (typeof module !== "undefined") {
  module.exports = { PROJECTS, CAMP_LEVELS, ITEMS, ENEMIES, EVENTS, LOCATIONS, AWAKENING_TRAITS, SKILLS_TREE, FACTION_IDS, PREFIX_POOL, QUESTS, ACHIEVEMENTS, CROPS, SPECIES, BLOOD_MOON_INTRO_TEXTS, BLOOD_MOON_VICTORY_TEXTS, BLOOD_MOON_MODIFIERS, LOCATION_MODIFIERS, ABYSS_SURGE_INTRO_TEXTS, ABYSS_SURGE_VICTORY_TEXTS, COMPANIONS_REGISTRY };
} else {
  // 瀏覽器環境：top-level const 不會自動成為 window 屬性，需手動掛載
  window.PROJECTS = PROJECTS;
  window.CAMP_LEVELS = CAMP_LEVELS;
  window.ITEMS = ITEMS;
  window.ENEMIES = ENEMIES;
  window.EVENTS = EVENTS;
  window.LOCATIONS = LOCATIONS;
  window.AWAKENING_TRAITS = AWAKENING_TRAITS;
  window.SKILLS_TREE = SKILLS_TREE;
  window.FACTION_IDS = FACTION_IDS;
  window.PREFIX_POOL = PREFIX_POOL;
  window.QUESTS = QUESTS;
  window.ACHIEVEMENTS = ACHIEVEMENTS;
  window.CROPS = CROPS;
  window.SPECIES = SPECIES;
  window.BLOOD_MOON_INTRO_TEXTS = BLOOD_MOON_INTRO_TEXTS;
  window.BLOOD_MOON_VICTORY_TEXTS = BLOOD_MOON_VICTORY_TEXTS;
  window.BLOOD_MOON_MODIFIERS = BLOOD_MOON_MODIFIERS;
  window.LOCATION_MODIFIERS = LOCATION_MODIFIERS;
  window.ABYSS_SURGE_INTRO_TEXTS = ABYSS_SURGE_INTRO_TEXTS;
  window.ABYSS_SURGE_VICTORY_TEXTS = ABYSS_SURGE_VICTORY_TEXTS;
  window.COMPANIONS_REGISTRY = COMPANIONS_REGISTRY;
}
