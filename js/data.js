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

const ITEMS = {
  // 武器
  knife_01: { id: "knife_01", name: "生鏽小刀", type: "weapon", icon: "🔪", stats: { atk: 2 }, rarity: "common" },
  pipe_01: { id: "pipe_01", name: "鋼管", type: "weapon", icon: "🔧", stats: { atk: 3 }, rarity: "common" },
  bat_01: { id: "bat_01", name: "球棒", type: "weapon", icon: "🏏", stats: { atk: 4 }, rarity: "uncommon" },
  machete_01: { id: "machete_01", name: "開山刀", type: "weapon", icon: "🔪", stats: { atk: 6 }, rarity: "rare" },
  pistol_01: { id: "pistol_01", name: "手槍", type: "weapon", icon: "🔫", stats: { atk: 8 }, rarity: "epic", ranged: true, desc: "遠程武器：戰鬥中每次攻擊消耗1🔋彈藥；彈藥耗盡時攻擊力加成減半" },
  // 防具
  jacket_01: { id: "jacket_01", name: "厚外套", type: "armor", icon: "🧥", stats: { def: 1 }, rarity: "common" },
  vest_01: { id: "vest_01", name: "防彈背心", type: "armor", icon: "🦺", stats: { def: 3 }, rarity: "rare" },
  // 消耗品
  food_can: { id: "food_can", name: "罐頭食品", type: "consumable", icon: "🥫", useEffect: { resources: { food: 3 } }, rarity: "common" },
  water_bottle: { id: "water_bottle", name: "瓶裝水", type: "consumable", icon: "💧", useEffect: { resources: { water: 3 } }, rarity: "common" },
  bandage: { id: "bandage", name: "繃帶", type: "consumable", icon: "🩹", useEffect: { resources: { medicine: 1 } }, rarity: "common" },
  // 材料
  scrap: { id: "scrap", name: "廢料", type: "material", icon: "🔩", rarity: "common" },
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

  // v160：地毯類(獨立rug槽位，純裝飾鋪在地板下層，不佔用floor陳列格)
  rug_plain: { id: "rug_plain", name: "簡約棉質地墊", type: "furniture", icon: "🟫", slot: "rug", rarity: "common", factionTag: "none", shopPrice: { embers: 8 }, desc: "純裝飾，鋪在地板上提升小屋氛圍" },
  rug_woven: { id: "rug_woven", name: "編織暖色地毯", type: "furniture", icon: "🟧", slot: "rug", rarity: "rare", factionTag: "none", shopPrice: { embers: 14 }, desc: "純裝飾，鋪在地板上提升小屋氛圍" },
  rug_round: { id: "rug_round", name: "圓形毛絨地毯", type: "furniture", icon: "🔵", slot: "rug", rarity: "epic", factionTag: "none", shopPrice: { embers: 22 }, desc: "純裝飾，鋪在地板上提升小屋氛圍" },

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
  mind_fork: { id: "mind_fork", name: "神經干擾音叉", type: "weapon", icon: "🍴", stats: { atk: 3 }, rarity: "epic", factionTag: "mind", desc: "每擊扣目標1AP（未接入敵方AP機制，文案保留）" },
  mind_greatsword: { id: "mind_greatsword", name: "重力晶格巨劍", type: "weapon", icon: "🗡️", stats: { atk: 14 }, rarity: "legendary", factionTag: "mind", desc: "閃避歸零但暴擊倍率200%", effects: { critMultiplierOverride: 2.0 } },
  // 防具(8)
  scrap_plating: { id: "scrap_plating", name: "廢棄鐵皮外殼", type: "armor", icon: "🛡️", stats: { def: 1 }, rarity: "common", factionTag: "none", desc: "" },
  ceramic_vest: { id: "ceramic_vest", name: "陶瓷防彈插板", type: "armor", icon: "🦺", stats: { def: 2 }, rarity: "common", factionTag: "none", desc: "免疫流血（27.4 bleedImmune）／初始護甲", effects: { bleedImmune: true } },
  gaia_armor: { id: "gaia_armor", name: "苔蘚幾何外殼", type: "armor", icon: "🌿", stats: { def: 3 }, rarity: "rare", factionTag: "gaia", desc: "探索遭遇戰每回合回HP+2（不含血月/據點防衛戰）" },
  ocean_jacket: { id: "ocean_jacket", name: "重水防護夾克", type: "armor", icon: "🧥", stats: { def: 2 }, rarity: "rare", factionTag: "ocean", desc: "閃避率+5%", effects: { dodgeBonus: 0.05 } },
  aero_cloak: { id: "aero_cloak", name: "氣流避彈防風衣", type: "armor", icon: "🧥", stats: { def: 1 }, rarity: "rare", factionTag: "aero", desc: "遠程/爆炸傷害-20%（未接入傷害類型判定，文案保留）" },
  cyber_suit: { id: "cyber_suit", name: "金屬活化液壓甲", type: "armor", icon: "🦾", stats: { def: 5 }, rarity: "epic", factionTag: "cyber", desc: "20%機率將受傷轉為護盾（27.4 shield）" },
  mind_robe: { id: "mind_robe", name: "晶格折射風衣", type: "armor", icon: "👘", stats: { def: 4 }, rarity: "epic", factionTag: "mind", desc: "精神傷害/SAN損失-30%（未接入SAN傷害判定，文案保留）" },
  gaia_skin: { id: "gaia_skin", name: "深淵黑血外皮", type: "armor", icon: "🩸", stats: { def: 7 }, rarity: "legendary", factionTag: "gaia", desc: "物理傷害減免+15%，但探索每回合-1SAN", effects: { battleDamageReductionBonus: 0.15 } },
  // 飾品(8，不加攻防，僅effects/文案)
  aero_pouch: { id: "aero_pouch", name: "大氣隨身風向儀", type: "accessory", icon: "🎒", rarity: "common", factionTag: "aero", desc: "陷阱事件機率-30%（未接入陷阱事件，文案保留）" },
  merchant_token: { id: "merchant_token", name: "黑市VIP徽章", type: "accessory", icon: "🎫", rarity: "common", factionTag: "none", desc: "商城/重鍛價格-10%", effects: { merchantDiscount: 0.1 } },
  mind_eye: { id: "mind_eye", name: "澄澈石英眼眸", type: "accessory", icon: "👁️", rarity: "rare", factionTag: "mind", desc: "sanMax+20，免疫幻覺事件（未接入幻覺事件，文案保留）", effects: { sanMaxBonus: 20 } },
  ocean_leech: { id: "ocean_leech", name: "洋流寄生蛭", type: "accessory", icon: "🪱", rarity: "rare", factionTag: "ocean", desc: "hpMax+10，但每階段水消耗+1", effects: { hpMaxBonus: 10, extraWaterDecay: 1 } },
  tesla_battery: { id: "tesla_battery", name: "高壓儲能電容", type: "accessory", icon: "🔋", rarity: "rare", factionTag: "cyber", desc: "流派主動技能30%額外觸發（未接入主動技能機制，文案保留）" },
  cyber_pendant: { id: "cyber_pendant", name: "內燃機核心吊墜", type: "accessory", icon: "📿", rarity: "epic", factionTag: "cyber", desc: "戰鬥首回合必定觸發一次額外攻擊" },
  mind_mirror: { id: "mind_mirror", name: "重力晶簇掛鏡", type: "accessory", icon: "🪞", rarity: "legendary", factionTag: "mind", desc: "夜襲機率-5%且sanMax+10", effects: { raidChanceDelta: -0.05, sanMaxBonus: 10 } },
  wedding_ring: { id: "wedding_ring", name: "失落的結婚戒指", type: "accessory", icon: "💍", rarity: "epic", factionTag: "none", desc: "單人裝備：sanMax+10；雙人QR互掃確認後雙方暴擊率永久+15%（29.3，留待#9）", effects: { sanMaxBonus: 10 } }
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

// 地點清單（MVP2：地圖探索）。distance: "near"=當輪可直接往返；"far"=需額外消耗1食物+1飲水的「路程成本」
const LOCATIONS = [
  {
    id: "loc_residential", name: "住宅區", icon: "🏠", riskLevel: 1, distance: "near", unlockDay: 1, levelCap: 4,
    anomalyText: "牆壁的壁紙下透出淡淡的螢光紋路，像是建築物有了呼吸。電視機自行開啟，播放著雜訊與細碎低語。",
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
    anomalyText: "枯死的樹根泛著螢光，沿著步道蜿蜒生長。風中傳來細碎的呢喃，像是無數聲音重疊在一起。",
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
    anomalyText: "油槽的指示燈詭異地閃爍著綠光，地面滲出的油漬竟微微蠕動，彷彿有生命般朝你的方向靠近。",
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
    anomalyText: "貨架上的商品標籤全被細小的螢光符文覆蓋，冷凍櫃裡傳出規律的心跳聲，卻找不到任何生物。",
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
    anomalyText: "教室黑板上寫滿了無人能解的符文公式，課桌椅排列成詭異的同心圓，彷彿曾有什麼在此集會。",
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
    anomalyText: "病歷櫃裡的紙張全被發光的石英粉塵覆蓋，每翻動一頁，耳邊就傳來一句破碎的呢喃。",
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
    anomalyText: "斷電的生產線上，機械臂仍規律地揮動著，金屬表面爬滿發光的菌絲紋路，彷彿被某種意識重新啟動。",
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
    anomalyText: "貨架在黑暗中投下不該存在的影子，木箱縫隙滲出螢光綠霧氣，緩緩在地面匯聚成奇異的圖形。",
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
    anomalyText: "軍用終端機的螢幕無故亮起，顯示著無法辨識的座標與倒數，警報燈光泛著不祥的暗紅色。",
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
    anomalyText: "篝火的火光泛著詭異的螢光綠，倖存者們的低語聲中，偶爾夾雜著幾句不屬於人類語言的字句。",
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
    anomalyText: "實驗艙內殘留的培養液仍在發光循環，牆上監視器反覆播放著早已停止運作的研究員最後身影。",
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
    anomalyText: "長滿發光地脈菌絲的列車靜止在軌道上。空氣中瀰漫著高濃度的發光石英粉塵，隱約能聽到無數人在耳邊低語。",
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
    anomalyText: "巨大的機械手臂在斷電的情況下依然在瘋狂揮舞，與活化組織融合成扭曲的鋼鐵巨怪，散發著暗紅色的微光。",
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
    anomalyText: "地下水滲出帶有強烈金屬味的酸性積水，醫院的病床和牆壁長滿了滑膩的深海寄生蛭。",
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
    anomalyText: "低壓濃霧伴隨劇烈的靜電風暴，電塔周圍的廢棄車輛和鐵皮竟如同失去重力般在空中緩慢懸浮。",
    lootTable: [
      { itemId: "aero_crossbow", qty: 1, weight: 15 },
      { itemId: "ammo", qty: 5, weight: 50 },
      { itemId: "scrap", qty: 2, weight: 35 }
    ],
    encounterChance: 0.50,
    encounterEnemyIds: ["enemy_walker_armed", "enemy_walker_weak"]
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
    text: "在據點角落一堆雜物底下，你發現了一個被遺忘已久、還沒被翻動過的背包，表面積了一層薄薄的灰塵，混著幾粒會反光的細小石英顆粒——看起來已經放在這裡好一陣子了。",
    options: [
      { label: "打開查看", effect: { resources: { food: 2, water: 1 }, exp: 3 }, resultText: "拉開拉鍊的瞬間，裡頭傳出罐頭碰撞的聲響——幾罐還沒過期的食物，加上一瓶密封完好的水。在這種日子裡，這已經算是一筆不小的收穫。" }
    ]
  },
  {
    id: "evt_supply_drop", title: "緊急補給",
    minDay: 1, maxDay: null, phase: ["day"], weight: 15,
    // 食物或飲水快見底時才會出現
    condition: (state) => state.resources.food <= 2 || state.resources.water <= 2,
    text: "正當你開始擔心存糧見底的時候，路邊一個褪色的軍用補給箱吸引了你的注意——箱子側面印著模糊的救援單位標誌，邊角還燒著一圈淡淡的螢光焦痕，掀開蓋子，裡面竟然還剩下一些沒被搜刮走的物資。",
    options: [
      { label: "拿走補給", effect: { resources: { food: 2, water: 2 } }, resultText: "你迅速把食物和飲水塞進背包，緊繃的肩膀總算放鬆了一些——至少，接下來幾天不用餓肚子了。" }
    ]
  },
  {
    id: "evt_infected_encounter", title: "感染者出現",
    minDay: 1, maxDay: null, phase: ["night"], weight: 12,
    text: "一道踉蹌的身影從巷口的陰影中竄出，發出低沉而沙啞的呻吟——是一名感染者，渾濁的雙眼深處透著一絲不自然的螢光，步伐雖然蹣跚，卻正一步步逼近。",
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
    text: "黑暗中，一名感染者緩緩走出——牠的手裡竟還緊緊攥著一根生鏽的鐵管，關節因為長期僵硬而以詭異的角度晃動著，皮膚下隱約能看見一條條發光的紋路在脈動。比起一般感染者，牠的氣息明顯更加危險。",
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
    text: "「今晚我來守夜吧，你先休息。」夥伴拍了拍你的肩膀，把毯子披到你身上。藉著微弱的燭光，她開始整理白天收集回來的雜物，動作熟練又安靜。",
    options: [
      { label: "謝謝她", effect: { resources: { scrap: 1 }, exp: 3 }, resultText: "你閉上眼，很快就沉沉睡去——這是這幾天來睡得最安穩的一次。醒來時，她已經把廢料分類整齊，遞到你手上。「多虧妳。」你由衷地說。" }
    ]
  },
  {
    id: "evt_rain", title: "下雨了",
    minDay: 1, maxDay: null, phase: ["day"], weight: 10,
    text: "天空毫無預警地暗了下來，豆大的雨滴開始敲打在屋頂與廢棄車輛上，匯聚成一片白噪音，雨水落地時偶爾濺起一閃即逝的微光。對現在的你來說，這場雨不是麻煩，而是一份意外的禮物。",
    options: [
      { label: "收集雨水", effect: { resources: { water: 2 }, exp: 3 }, resultText: "你迅速把所有能用的容器擺到屋簷下，看著雨水一點一滴匯聚起來。雨勢持續了好一陣子，等你把容器收回來時，飲水量明顯多了不少。" }
    ]
  },
  {
    id: "evt_injury", title: "受傷",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 8,
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
    text: "在一堆鏽蝕的金屬廢料與破布之間，一件還算堪用的裝備泛著一絲不易察覺的微光吸引了你的注意——雖然不是什麼精良貨，但對現在的你來說已經足夠。",
    options: [
      { label: "拿走", effect: { equipment_pool: ["knife_01", "pipe_01", "jacket_01", "scrap_plating", "military_shovel"], exp: 3 }, resultText: "你把它擦拭乾淨，收進背包——這趟出來總算沒有白跑一場。" }
    ]
  },
  {
    id: "evt_scavenger_trade", title: "流浪商人",
    minDay: 3, maxDay: null, phase: ["day"], weight: 12,
    condition: (state) => state.resources.scrap >= 3,
    text: "一陣吱嘎作響的輪子聲由遠而近，一個衣著破舊、推著改裝手推車的男人出現在視線中。車上掛滿瓶瓶罐罐與零件，幾圈銅線纏在其間微微發光。他朝你咧嘴一笑，露出缺角的牙齒：「廢料換物資，要不要？童叟無欺。」",
    options: [
      { label: "用廢料交換物資", effect: { resources: { scrap: -3, food: 2, water: 2 } }, resultText: "你拿出一些廢料遞給他，他熟練地秤了秤重量，從車上翻出幾罐食物和水交給你。「這年頭，活下去最重要。」他咧嘴一笑，推著車繼續前行，很快消失在街角。" },
      { label: "婉拒，目送他離開", resultText: "你搖搖頭。商人聳聳肩，似乎早已習慣這種反應，「隨你。」他推著吱嘎作響的車子，慢慢消失在街道盡頭，留下一陣若有似無的金屬碰撞聲，和一絲說不清的螢光餘暈。" }
    ]
  },
  {
    id: "evt_old_memory", title: "舊照片",
    minDay: 1, maxDay: null, phase: ["night"], weight: 10,
    text: "整理背包夾層時，一張泛黃的相片悄悄滑落到你的腳邊。你彎腰撿起——是末日爆發前某個平凡的午後，陽光灑在餐桌上，照片裡的人都笑得那麼自然，彷彿明天理所當然會到來。\n\n你盯著照片看了很久，喉頭一陣發緊，許多畫面在腦海中無聲地閃過。",
    options: [
      { label: "把照片收好，繼續前進", resultText: "你深吸一口氣，小心地把照片放回最內層的夾層，用手按了按，像是在確認它不會再次掉出來。「還不是放棄的時候。」你低聲對自己說，重新揹起背包。" }
    ]
  },
  {
    id: "evt_storm_warning", title: "風暴警報",
    minDay: 1, maxDay: null, phase: ["day"], weight: 10,
    condition: (state) => state.baseDefense < 3,
    weightModifier: (state) => (3 - state.baseDefense) * 2,
    text: "遠方的天空逐漸被厚重的烏雲吞沒，悶雷聲一陣接著一陣，越來越近，每次閃光過後空氣裡都殘留一絲焦糊般的靜電味。風開始呼嘯著掠過據點外圍那些臨時搭建的圍欄與木板——以目前的防禦狀況，這場風暴恐怕撐不住。",
    options: [
      { label: "趕緊加固據點", effect: { resources: { scrap: -2 }, baseDefense: 1 }, resultText: "你抓起手邊的廢料和工具，趕在風暴來臨前加固了幾處最脆弱的結構。當第一陣強風掃過時，圍欄劇烈搖晃卻沒有倒下——這次，你們撐住了。" },
      { label: "躲進地下室硬撐", effect: { hp: -5 }, resultText: "你選擇先躲起來，把加固工程留到明天。整個夜晚，風暴在外頭怒吼，不時傳來木板被掀飛、東西倒塌的巨響。隔天清晨走出來時，據點多處受損，你也是一夜未眠，渾身痠痛。" }
    ]
  },
  {
    id: "evt_alone_reflection", title: "深夜的思緒",
    minDay: 5, maxDay: null, phase: ["night"], weight: 8,
    // 序章結局為「孤身一人」時，偶爾會回想起第一晚的選擇
    condition: (state) => !!(state.flags && state.flags.alone),
    text: "夜深人靜時，思緒總是特別容易飄遠。你又想起了第一晚——那扇你沒有打開、或者打開後又關上的門。如果當時做了不同的決定，現在會不會有人陪你說話、陪你分擔這份寂靜？\n\n窗外的風聲呼呼作響，你獨自坐在黑暗裡，那個念頭來得快，去得也快。",
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
        resultText: "你的手伸向門閂，卻在最後一刻停住——你深吸一口氣，還是把門閂死死扣上。外頭的呼救聲、腳步聲、撞擊聲混雜成一片，接著是一陣令人牙酸的寂靜。\n\n你靠著門板滑坐到地上，胃裡一陣翻攪，久久無法平復。隔天清晨，你在門口發現一把沾血的獵刀，旁邊散落著幾塊廢料。"
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
    text: "你無意間轉開一台老舊的收音機，刺耳的雜訊裡夾著一絲規律嗡鳴，接著突然冒出一段斷斷續續的人聲：「……如果聽得到……北邊的訊號塔……我們還在……」訊息很快又被雜訊淹沒，無論怎麼轉動旋鈕都找不回來了。\n\n你盯著收音機，久久無法移開視線——這是這幾天來，第一次確定這座城市裡不是只有你和那些東西。",
    options: [
      { label: "把頻率記下來", effect: { setFlag: "radio_lead" }, resultText: "你找了張紙，把聽到的頻率與關鍵字仔細寫下來，小心收進口袋。北邊……訊號塔……或許哪天用得上。雖然渺茫，但這是個方向，足夠讓你在黑暗中多一點盼頭。" },
      { label: "關掉收音機，留著電池", effect: { resources: { scrap: 1 } }, resultText: "你關掉收音機，拆下還有電的電池收好。希望是奢侈品，活下去才是現在的優先事項——你這樣告訴自己，但那段聲音還是在腦海裡迴盪了很久。" }
    ]
  },
  {
    id: "evt_stray_dog", title: "瘦弱的狗",
    minDay: 1, maxDay: null, phase: ["day"], weight: 8,
    text: "一隻瘦骨嶙峋的狗從瓦礫堆後探出頭，警戒地盯著你，尾巴卻又忍不住輕輕搖了兩下。牠的毛髮髒亂打結，肋骨清晰可見，明顯餓了很久——但那雙眼睛裡，還殘留著一絲對人類的信任。",
    options: [
      { label: "分牠一點食物", requiresResource: { food: 1 }, effect: { resources: { food: -1 }, setFlag: "stray_dog_fed" }, resultText: "你蹲下身，把一小塊食物放在地上慢慢推過去。牠遲疑了一下，小心翼翼地叼起食物狼吞虎嚥。吃完後，牠抬頭看了你很久，然後安靜地跟在你身後幾步——或許，牠決定把你當成同伴了。" },
      { label: "保持距離，繼續前進", resultText: "你不敢冒險，畢竟誰也不知道牠是否帶有什麼疾病。你緩緩後退，牠也沒有追上來，只是站在原地目送你離開，那雙眼神讓你心裡有點不是滋味。" }
    ]
  },
  {
    id: "evt_collapsing_floor", title: "腳下的異響",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 8,
    text: "「喀啦——」一聲，腳下的地板突然傳來令人牙酸的爆裂聲，木板瞬間下陷了一截！你下意識地僵在原地，能感覺到整個地面正微微震動，裂縫深處透出一絲幽幽螢光，灰塵簌簌落下。再往前一步，可能就會徹底塌陷。",
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
    text: "巷子深處透出一點微弱的燈光，混著一絲不屬於電燈泡的冷色螢光，幾個人影圍著一張鋪滿貨物的木板低聲交談，看到你靠近也沒有驅趕的意思。\n\n其中一人朝你抬了抬下巴，露出意味不明的笑容：「想交易？這裡什麼都有，只要你出得起價。」木板上擺著幾件來路不明、卻保養得相當不錯的裝備。",
    options: [
      { label: "用廢料換一件裝備", effect: { resources: { scrap: -5 }, equipment_pool: ["pistol_01", "vest_01", "machete_01"] }, resultText: "你遞出廢料，對方不發一語地清點，隨即從木板底下抽出一件用布包好的裝備塞進你手裡。「東西很乾淨，別問來源。」他低聲說完，轉身便和同夥隱入巷子深處的陰影中。" },
      { label: "謝絕，盡快離開", resultText: "你搖搖頭，禮貌地後退幾步。對方也不在意，只是聳聳肩繼續和同夥低聲交談。你加快腳步離開這條巷子——這種地方，待得越久，風險越高。" }
    ]
  },
  {
    id: "evt_fever", title: "突如其來的發燒",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 7,
    text: "你忽然感到一陣寒意從背脊竄上，緊接著是一波又一波的燥熱。額頭滾燙，視線開始模糊，眼前甚至浮現幾道轉瞬即逝的光斑，四肢也變得沉重無力——是發燒了。在這種環境下，任何一點小毛病都可能演變成大麻煩。",
    options: [
      { label: "服用藥品退燒", requiresResource: { medicine: 1 }, effect: { resources: { medicine: -1 }, hp: -3 }, resultText: "你翻出僅剩的藥品服下，靠著牆閉目休息了一陣子。藥效漸漸發揮作用，燒總算退了一些，雖然身體還是有點虛軟，但至少不再持續惡化。" },
      { label: "硬撐過去", effect: { hp: -8 }, resultText: "你沒有藥可用，只能裹緊外套，蜷縮著等待這陣難受過去。一整天下來，你渾身發冷又發燙，幾乎無法集中精神，等到燒總算退去時，整個人已經虛脫得不成樣子。" }
    ]
  },
  {
    id: "evt_survivor_note", title: "另一名倖存者的字條",
    minDay: 1, maxDay: null, phase: ["day"], weight: 8,
    condition: (state) => !state.flags || !state.flags.family_lead,
    text: "牆角的桌上壓著一張用鉛筆寫得歪歪扭扭的字條，墨跡已經有些暈開：「如果你看到這個——我們往南邊的橋去了，那裡聽說比較安全。如果你是__（後面的字跡被水暈開，看不清楚），請等等我們，我們會回來找你。」\n\n字條的角落，畫著一個小小的、孩子氣的笑臉。你盯著那張字條，心裡某個角落被輕輕觸動了一下。",
    options: [
      { label: "把字條收好", effect: { setFlag: "family_lead" }, resultText: "你小心地把字條摺好，放進貼身的口袋裡。南邊的橋……或許這座城市裡，還有人在等著與誰重逢。你重新揹起背包，腳步似乎比剛才稍微輕快了一些。" }
    ]
  },
  {
    id: "evt_aircraft_pass", title: "天空中的引擎聲",
    minDay: 8, maxDay: null, phase: ["day"], weight: 6,
    text: "一陣低沉而規律的轟鳴聲由遠而近，你猛地抬頭——天空中，一架直升機正沿著城市邊緣飛行，機身在陽光下反射出一閃而過的光芒。\n\n它離得很遠，幾乎不可能注意到地面上的你，但這是這麼多天以來，你第一次看見「人類仍在運作的東西」。",
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
    text: "你爬上吱呀作響的樓梯，閣樓裡堆滿了積灰的紙箱與舊家具，光線從破損的天窗斜斜灑下，空氣中漂浮著細小的塵埃，其中幾粒在光束裡閃著不該有的微光。",
    options: [
      { label: "仔細翻找紙箱", effect: { resources: { scrap: 2 } }, resultText: "你一箱一箱翻過，大多是發黃的舊文件，但底層藏著幾件還能用的金屬零件，你小心收進背包。" },
      { label: "只是看看就好", effect: {}, resultText: "你站在門口看了一會兒，這些屬於別人的回憶讓你不忍心翻動，最後還是輕輕帶上了門。" }
    ]
  },
  {
    id: "evt_strange_smell", title: "空氣中的焦味",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 5,
    text: "一股淡淡的焦味隨風飄來，混著一絲說不出的金屬腥氣，似乎是不遠處有東西在悶燒。你停下腳步，鼻子皺了皺，試著判斷方向。",
    options: [
      { label: "循著味道過去看看", effect: { resources: { scrap: 1 }, hp: -2 }, resultText: "靠近後你發現是一堆悶燒的電線堆，刺鼻的濃煙嗆得你直咳嗽，但你還是從旁邊扯下幾段還能用的電纜。" },
      { label: "繞道而行", effect: {}, resultText: "不確定的危險不值得冒險，你選擇繞了一段遠路，避開那股令人不安的氣味。" }
    ]
  },
  {
    id: "evt_old_radio_song", title: "走音的旋律",
    minDay: 1, maxDay: null, phase: ["night"], weight: 5,
    text: "不知道從哪戶人家傳來的，一台老舊收音機正播著走音的懷舊歌曲，斷斷續續，卻意外地讓人安心。",
    options: [
      { label: "靜靜聽完這首歌", effect: { hp: 2 }, resultText: "你靠著牆坐下，閉上眼聽完整首歌。旋律雖然破碎，卻讓緊繃了一整天的神經難得放鬆下來。" }
    ]
  },
  {
    id: "evt_neighbor_knock", title: "敲門的陌生人",
    minDay: 2, maxDay: null, phase: ["day"], weight: 5,
    text: "據點的門被輕輕敲響三下。你透過門縫看到一個瘦弱的身影，懷裡抱著一個鐵罐，怯生生地望著這裡。",
    options: [
      { label: "用一份食物換取對方的鐵罐", effect: { resources: { food: -1, water: 2 } }, resultText: "對方接過食物，連聲道謝後把鐵罐塞進你手裡——裡面裝著乾淨的飲用水，雖然不多，但在此刻彌足珍貴。" },
      { label: "不開門，假裝沒人在", effect: {}, resultText: "你屏住呼吸，靜靜等待腳步聲遠去。在這個世道，輕易開門終究還是太冒險了。" }
    ]
  },
  {
    id: "evt_tool_found", title: "工具箱",
    minDay: 1, maxDay: null, phase: ["day"], weight: 6,
    text: "在一輛拋錨已久的貨車底下，你發現了一個半埋在泥土裡的工具箱，鎖頭早已鏽蝕損壞，縫隙間還卡著幾粒會反光的細小石英顆粒。",
    options: [
      { label: "撬開工具箱", effect: { resources: { scrap: 3 } }, resultText: "裡面雖然沒有完整的工具，但塞滿了各種螺絲、金屬片與電線——對你來說，這些零件比完整的工具更實用。" }
    ]
  },
  {
    id: "evt_garden_attempt", title: "陽台上的綠意",
    minDay: 3, maxDay: null, phase: ["day"], weight: 5,
    text: "你注意到隔壁陽台上，有人在末日來臨前種下的幾株蔬菜，竟頑強地活了下來，葉片在風中搖曳。",
    options: [
      { label: "摘採可食用的部分", effect: { resources: { food: 2 } }, resultText: "你小心翼翼地摘下幾片還算新鮮的葉菜，雖然賣相不佳，但確實是難得的新鮮食物來源。" },
      { label: "留著讓它繼續生長", effect: { resources: { food: 1 } }, resultText: "你只摘了一點點，把大部分留下——也許過幾天再來，這裡會長出更多。" }
    ]
  },
  {
    id: "evt_cold_night_wind", title: "刺骨的夜風",
    minDay: 1, maxDay: null, phase: ["night"], weight: 5,
    weightModifier: (state) => state.baseDefense < 2 ? 5 : 0,
    text: "夜裡的風從牆壁的縫隙鑽進來，帶著刺骨的寒意，隱約還夾雜著一絲低頻的嗡鳴。你裹緊身上僅有的衣物，牙齒不自覺地打顫。",
    options: [
      { label: "用備用材料堵住縫隙", effect: { resources: { scrap: -1 }, baseDefense: 1 }, resultText: "你摸黑找出幾塊木板和破布，把最大的縫隙堵了起來。雖然簡陋，但至少今晚不會再被風吹得睡不著了。" },
      { label: "硬撐過去", effect: { hp: -2 }, resultText: "你蜷縮在角落，把所有能裹的東西都裹在身上。一夜無眠，醒來時渾身僵硬痠痛。" }
    ]
  },
  {
    id: "evt_photo_album", title: "相本",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 5,
    text: "你在抽屜深處翻到一本相本，裡面是某個家庭的合照——生日派對、海邊旅行、畢業典禮，每一張都笑得燦爛。",
    options: [
      { label: "翻完整本相本", effect: { hp: 1 }, resultText: "你一頁一頁翻完，看著這些素不相識卻無比真實的笑容，心裡某個角落悄悄被填補了一些。你把相本放回原處，輕輕闔上抽屜。" },
      { label: "不忍心看，闔上放回原處", effect: {}, resultText: "你只看了一眼封面，就把相本闔上放回原處——有些東西，還是不要看比較好。" }
    ]
  },
  {
    id: "evt_distant_gunshot", title: "遠方的槍聲",
    minDay: 4, maxDay: null, phase: ["day", "night"], weight: 5,
    weightModifier: (state) => state.day >= 10 ? 3 : 0,
    text: "一聲悶響從遠處傳來，緊接著是第二聲、第三聲——是槍聲，尾音卻拖著一絲不自然的回響，距離不算近，但也絕對不算遠。你的心跳瞬間加快。",
    options: [
      { label: "提高警覺，加緊手邊的工作", effect: { baseDefense: 1, resources: { scrap: -1 } }, resultText: "你不敢放鬆，立刻檢查了一遍據點的每個角落，順手把幾處薄弱的防禦補強了一些。槍聲漸漸停了，但那股緊張感久久未散。" },
      { label: "趴低身子，等待平靜", effect: { hp: -1 }, resultText: "你立刻趴低身子，屏住呼吸數著心跳。過了好一陣子，槍聲才終於停止，你才敢重新站起身，後背早已被冷汗浸濕。" }
    ]
  },
  {
    id: "evt_morning_fog", title: "濃霧的早晨",
    minDay: 1, maxDay: null, phase: ["day"], weight: 6,
    text: "推開門，外頭一片濃霧瀰漫，能見度不到十步，霧氣深處隱約有微光流轉，世界彷彿被吞沒在一片灰白之中，連聲音都被悶住了。",
    options: [
      { label: "趁著濃霧掩護外出", effect: { resources: { scrap: 1 }, hp: -1 }, resultText: "霧氣讓你幾乎看不清路，你小心翼翼摸索著前進，雖然多花了不少力氣，但也因為視線受阻意外撿到一些被忽略的雜物。" },
      { label: "等霧散了再說", effect: {}, resultText: "你決定不冒這個險，留在據點裡整理裝備，靜靜等待霧氣散去。" }
    ]
  },
  {
    id: "evt_childrens_drawing", title: "牆上的塗鴉",
    minDay: 1, maxDay: null, phase: ["day"], weight: 5,
    text: "經過一面牆時，你注意到上面有一幅用蠟筆畫的塗鴉——一個太陽、一棟房子、幾個牽著手的小人，旁邊歪歪扭扭寫著一個名字。",
    options: [
      { label: "駐足看了一會兒", effect: { hp: 1 }, resultText: "你站在塗鴉前看了好一會兒，想像著畫下這幅畫的孩子曾經有過的、再平凡不過的一天。不知為何，這讓你覺得自己也該努力撐下去。" }
    ]
  },
  {
    id: "evt_leaking_pipe", title: "漏水的水管",
    minDay: 1, maxDay: null, phase: ["day"], weight: 6,
    text: "牆角一根老舊水管正滴滴答答地漏著水，地上已經積出一小灘水漬，水面上漂著一層極淡的螢光油膜，但水質看起來還算清澈。",
    options: [
      { label: "用容器接水", effect: { resources: { water: 2 } }, resultText: "你找出空容器接在漏水處下方，雖然要花點時間，但慢慢積攢下來，也是一筆不無小補的水源。" },
      { label: "嘗試修補水管", effect: { resources: { scrap: -1 }, baseDefense: 0 }, resultText: "你用隨身的工具和布條把漏水處纏緊，水管總算不再滴水——雖然解決不了根本問題，但至少不再浪費了。" }
    ]
  },
  {
    id: "evt_stray_cat", title: "屋簷下的貓",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 5,
    text: "屋簷下蜷縮著一隻瘦弱的橘貓，看到你靠近也只是抬眼瞄了一下，懶洋洋地沒有要逃跑的意思，似乎已經習慣了人類的存在。",
    options: [
      { label: "分牠一點食物", effect: { resources: { food: -1 }, hp: 1 }, resultText: "貓咪小心翼翼地嗅了嗅，確認沒有危險後便大口吃了起來。看著牠滿足的樣子，你心裡也跟著放鬆了一些。" },
      { label: "拍拍牠就離開", effect: {}, resultText: "你蹲下身輕輕摸了摸牠的頭，貓咪瞇起眼享受了片刻，便又繼續牠的瞌睡。" }
    ]
  },
  {
    id: "evt_jammed_lock", title: "卡住的保險箱",
    minDay: 2, maxDay: null, phase: ["day"], weight: 5,
    text: "辦公室角落有個小型保險箱，門把已經鏽死，箱體接縫處滲出一絲若有似無的螢光粉塵，但看起來並沒有被人動過的痕跡。",
    options: [
      { label: "用工具硬撬開", effect: { resources: { scrap: 2 }, hp: -1 }, resultText: "你費了好大力氣才把鏽死的鉸鏈撬開，雖然手被刮傷了一道，但裡面確實藏著一些值錢的零件與五金。" },
      { label: "太費力了，放棄", effect: {}, resultText: "看了看自己僅有的工具，你判斷不值得花這麼多力氣，便轉身離開了。" }
    ]
  },
  {
    id: "evt_thunderstorm", title: "雷陣雨",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 6,
    text: "天色毫無預警地暗了下來，豆大的雨點砸在鐵皮屋頂上，每道閃電劈下時都拖著一絲不該存在的螢綠尾光，轟隆的雷聲一聲接著一聲，整個世界彷彿都在震動。",
    options: [
      { label: "出去收集雨水", effect: { resources: { water: 3 }, hp: -1 }, resultText: "你冒著雨把所有空容器擺到屋外，豆大的雨滴打得你睜不開眼，但收穫的雨水足以讓你安心好一陣子。" },
      { label: "待在屋內等雨停", effect: {}, resultText: "你縮在屋內，聽著雨聲打在屋頂上，雷聲一次比一次近，你只希望這場雨不要造成太大的破壞。" }
    ]
  },
  {
    id: "evt_locked_door", title: "上鎖的房間",
    minDay: 1, maxDay: null, phase: ["day"], weight: 5,
    text: "走廊盡頭有一扇房門緊閉著，門縫下透出一絲不太尋常的螢光，門把上掛著一把銅鎖，看起來不算太牢固。",
    options: [
      { label: "撞開房門", effect: { resources: { scrap: 1, medicine: 1 }, hp: -3 }, resultText: "你後退幾步，用力撞向房門，肩膀傳來一陣劇痛，門鎖應聲斷裂。房內是個小型儲藏室，留有一些零件和藥品。" },
      { label: "尊重隱私，不去打擾", effect: {}, resultText: "上鎖的房間或許代表著某人不希望被打擾的東西，你選擇尊重這份界線，轉身離開。" }
    ]
  },
  {
    id: "evt_campfire_stranger", title: "遠方的營火",
    minDay: 3, maxDay: null, phase: ["night"], weight: 5,
    text: "遠遠地，你看見一處空地上燃著一小堆營火，火光搖曳，隱約能看到一兩個人影圍坐在旁邊，似乎也是倖存者。",
    options: [
      { label: "保持距離，靜靜觀察", effect: { resources: { scrap: 1 } }, resultText: "你躲在暗處觀察了好一會兒，那些人似乎只是普通的倖存者，正在低聲交談、烤著什麼東西。你沒有靠近，只是悄悄記下了這個位置，便轉身回到據點，順手撿了路上的廢料。" },
      { label: "不予理會，回到據點", effect: {}, resultText: "在這個年代，主動接觸陌生人風險太高。你壓低身形，繞開那團火光，回到自己的據點。" }
    ]
  },
  {
    id: "evt_broken_radio_message", title: "斷續的求救訊號",
    minDay: 1, maxDay: null, phase: ["night"], weight: 5,
    text: "你隨身攜帶的小型收音機突然發出刺耳的雜訊，夾雜一陣規律到不自然的嗡鳴，接著傳來一段斷斷續續、幾乎聽不清的人聲：「……如果有人聽到……請……回應……」",
    options: [
      { label: "對著收音機回應", effect: { hp: -1 }, resultText: "你按下通話鍵，對著話筒說了幾句話。但無論你怎麼呼叫，對方都沒有再回應，只剩下持續的雜訊聲。你關掉收音機，心裡有些悵然。" },
      { label: "默默把收音機收好", effect: {}, resultText: "你聽著那段斷續的聲音，最終還是沒有按下通話鍵——你不確定自己是否準備好面對另一個聲音背後的故事。" }
    ]
  },
  {
    id: "evt_overgrown_park", title: "荒蕪的遊樂場",
    minDay: 1, maxDay: null, phase: ["day"], weight: 5,
    text: "你經過一座兒童遊樂場，鞦韆隨風輕輕搖晃發出吱呀聲，溜滑梯上爬滿了藤蔓，葉片邊緣泛著淡淡螢光，沙坑裡長出了雜草。",
    options: [
      { label: "在鞦韆上坐一會兒", effect: { hp: 2 }, resultText: "你坐上鞦韆，輕輕晃動著。微風吹過，藤蔓沙沙作響，這片刻的寧靜讓你緊繃的神經難得鬆弛下來。" },
      { label: "翻找器材室", effect: { resources: { scrap: 1 } }, resultText: "遊樂場旁的器材室半掩著門，裡面堆著一些維護用的工具，你撿走了幾樣還能用的零件。" }
    ]
  },
  {
    id: "evt_medicine_cabinet", title: "藥櫃",
    minDay: 1, maxDay: null, phase: ["day"], weight: 6,
    weightModifier: (state) => state.resources.medicine <= 1 ? 4 : 0,
    text: "浴室裡的藥櫃半開著，裡面散落著幾個藥瓶，大部分標籤都已經模糊不清、邊緣泛著一絲詭異的螢光，但其中一兩瓶看起來還算完整。",
    options: [
      { label: "仔細檢查每一瓶", effect: { resources: { medicine: 1 } }, resultText: "你一瓶一瓶檢查標籤與保存期限，確認其中一瓶止痛藥還能使用，小心地收進醫療包。" },
      { label: "不確定的藥不要亂拿", effect: {}, resultText: "過期或來路不明的藥物可能比疾病本身更危險，你考慮再三，最終還是沒有拿走任何東西。" }
    ]
  },
  {
    id: "evt_burnt_building", title: "焦黑的建築",
    minDay: 1, maxDay: null, phase: ["day"], weight: 5,
    text: "眼前這棟建築的外牆被燻得焦黑，窗戶全數碎裂，焦痕邊緣泛著一絲詭異的螢光，顯然曾經發生過不只是火災那麼單純的事，但結構看起來還算穩固。",
    options: [
      { label: "進去地下室碰碰運氣", effect: { resources: { scrap: 2, food: 1 } }, resultText: "地面樓層幾乎被燒成廢墟，但地下室因為遠離火源，意外保存了一些罐頭與建材，你盡可能多帶了一些。" },
      { label: "太危險了，不進去", effect: {}, resultText: "焦黑的結構隨時可能倒塌，你站在外面看了一會兒，最終還是決定不冒這個險。" }
    ]
  },
  {
    id: "evt_night_patrol_lights", title: "遠方的探照燈",
    minDay: 5, maxDay: null, phase: ["night"], weight: 5,
    weightModifier: (state) => state.day >= 12 ? 3 : 0,
    text: "遠處的天際線上，一道泛著冷色螢光的光束緩緩掃過天空，規律地來回移動——像是某種巡邏的探照燈，但你不確定那是誰在巡邏，又是為了什麼。",
    options: [
      { label: "熄滅手邊的光源，靜觀其變", effect: {}, resultText: "你立刻吹熄手邊的蠟燭，蹲低身子，看著那道光束緩緩掃過又遠離。直到光束完全消失，你才敢重新點起燈火。" },
      { label: "趁機加緊修補據點", effect: { resources: { scrap: -1 }, baseDefense: 1 }, resultText: "既然外頭的人或物似乎暫時不會靠近這裡，你把握時間加緊修補了據點的防禦，希望能應付未知的威脅。" }
    ]
  },
  {
    id: "evt_shared_meal_memory", title: "餐桌前的回憶",
    minDay: 1, maxDay: null, phase: ["night"], weight: 5,
    weightModifier: (state) => state.companion ? 4 : 0,
    text: "夜深了，你和同伴分著手邊僅有的食物，誰都沒有說話，只有咀嚼的聲音在安靜的據點裡格外清晰。",
    options: [
      { label: "聊聊各自過去的生活", effect: { hp: 2 }, resultText: "你們有一搭沒一搭地聊著末日前的瑣事——最愛吃的食物、最喜歡的季節。平凡的話題，卻讓彼此都感到一絲久違的溫暖。" },
      { label: "安靜地吃完這一餐", effect: { resources: { food: -1 }, hp: 1 }, resultText: "誰都沒有開口，但這份沉默並不尷尬，反而像是一種彼此都明白、不需言說的陪伴。" }
    ]
  },
  {
    id: "evt_distant_explosion", title: "遠方的爆炸聲",
    minDay: 6, maxDay: null, phase: ["day", "night"], weight: 5,
    weightModifier: (state) => state.day >= 15 ? 3 : 0,
    text: "一聲巨大的轟鳴聲從城市另一端傳來，緊接著是一股泛著淡綠色澤的黑煙緩緩升起，劃破原本灰濛濛的天空。整座城市似乎又少了一個角落。",
    options: [
      { label: "默默記下這個方向，避開那裡", effect: {}, resultText: "你站在原地看著那股黑煙，在心裡的地圖上又劃掉了一個區域。能避開的危險，就不要主動靠近。" },
      { label: "繼續手邊的事，不去多想", effect: { resources: { scrap: 1 } }, resultText: "這樣的聲音已經不是第一次聽到了。你深吸一口氣，把注意力拉回手邊的工作——活下去，才是現在唯一重要的事。" }
    ]
  },
  {
    id: "evt_sunset_view", title: "天台上的夕陽",
    minDay: 1, maxDay: null, phase: ["day"], weight: 5,
    text: "你爬上一棟建築的天台透透氣，正巧趕上夕陽西下。橘紅色的餘暉灑滿整座殘破的城市，竟有種說不出的壯麗。",
    options: [
      { label: "靜靜看完整個日落", effect: { hp: 2 }, resultText: "你在天台邊緣坐下，看著太陽一點一點沉入地平線。即使世界已經面目全非，這份美麗似乎從未真正消失，你的心情也跟著平靜了不少。" },
      { label: "趁著光線勘查附近環境", effect: { resources: { scrap: 1 } }, resultText: "你利用最後的天光，仔細觀察了周遭的地形與建築分布，並順手撿走了天台上幾片還能用的金屬板。" }
    ]
  },
  {
    id: "evt_old_world_cache", title: "封存的舊世儲物櫃",
    minDay: 15, maxDay: null, phase: ["day"], weight: 5,
    text: "在一條久未有人踏足的走廊盡頭，一列金屬儲物櫃整齊地排列著，大多已經鏽蝕變形，但其中一個的鎖頭看起來還很新，表面還殘留著一圈防護用的螢光符文——似乎曾有人試圖保護裡面的東西。",
    options: [
      { label: "撬開這個鎖頭", effect: { resources: { scrap: -2 }, equipment_pool: ["ocean_pistol", "aero_crossbow", "ocean_mace", "cyber_suit"] }, resultText: "你花了一番力氣才撬開鎖頭，櫃子裡是用油布仔細包裹的裝備——保存狀況出乎意料地好。" },
      { label: "不去打擾，繼續往前", effect: {}, resultText: "你看了那個鎖頭一眼，最終還是沒有伸手。有些東西，或許曾經對某人很重要。" }
    ]
  },
  {
    id: "evt_long_road_silence", title: "長路上的沉默",
    minDay: 18, maxDay: null, phase: ["day", "night"], weight: 5,
    weightModifier: (state) => state.day >= 25 ? 2 : 0,
    text: "走了這麼久，城市的輪廓早已和記憶中的樣子相去甚遠。你停下腳步，回頭望了一眼來時的路——那段路上，曾經發生過太多事。",
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
    text: "你再次回到這片你早已走過無數次的街道。幾隻曾經讓你陷入苦戰的蹣跚感染者咆哮著撲過來，但在你如今的覺醒威壓面前，牠們微弱的骨骼甚至開始顫抖。",
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
    text: "你再次踏入這家便利商店。幾隻曾經讓你差點喪命的蹣跚感染者向你撲來。你冷笑一聲，覺醒的威壓瞬間將牠們震退在地，不敢再上前。",
    options: [
      { label: "如同散步般搬空貨架", effect: { resources: { food: 4, water: 4, scrap: 5 } }, resultText: "你輕鬆地把貨架掃空，這對如今的你來說毫無難度。" }
    ]
  },
  {
    id: "evt_hospital_harvest", title: "洋流寄生的枯萎",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 3,
    condition: (state) => state.level >= 7,
    weightModifier: (state) => state.level >= 7 ? 30 : 0,
    text: "醫院走廊的酸性積水對現在的你來說只是普通的雨水。那些特化變種怪在你的威壓下甚至縮在牆角發抖。",
    options: [
      { label: "強取豪奪醫療庫", effect: { resources: { medicine: 3 }, embers: 15 }, resultText: "你大搖大擺地走進藥品庫，把能拿的都掃進背包。" }
    ]
  },
  {
    id: "evt_epic_loot_discover", title: "廢墟深處的共鳴",
    minDay: 15, maxDay: null, phase: ["day", "night"], weight: 4,
    text: "你在坍塌的地下庫房深處發現了一個密封的軍用合金箱，表面還殘留著微弱的能量波動。",
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
    text: "你在廢墟中發現一台插著軍用電池、螢幕閃爍的改裝老虎機。\n\n上面漆著一行字：「投入廢料，贏取覺醒結晶。」",
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
    text: "一具巨大的變異生物屍體靠在牆角，牠的傷口流出柏油般的黑血，卻散發著強烈的靈能波動。\n\n你的覺醒核心正在瘋狂鳴叫。",
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
        condition: (state) => state.equipment && state.equipment.accessory === "mind_eye",
        effect: { embers: 20 },
        resultText: "透過石英眼眸，你看穿了幻覺的本質——只是粉塵與回憶的殘影。你在廢墟中順手撿到一些晶燼。"
      }
    ]
  },
  {
    id: "evt_wandering_chef", title: "黑市末日廚師",
    minDay: 1, maxDay: null, phase: ["day"], weight: 6,
    condition: (state) => (state.resources.food || 0) >= 3,
    text: "一個穿著防護衣、推著改裝餐車的怪人攔住你：「嘿，旅人！拿3份生罐頭給我，我幫你調配成能活化細胞的『超能亂燉』！」",
    options: [
      { label: "交出物資烹飪", effect: { resources: { food: -3 }, equipment_pool: ["energy_drink"] }, resultText: "他三兩下變出一罐冒著詭異藍光的飲料塞給你。" },
      { label: "拒絕並離開", effect: {}, resultText: "你搖搖頭，繼續往前走。" }
    ]
  },
  {
    id: "evt_failed_exp_01", title: "逃亡的實驗體",
    minDay: 5, maxDay: 7, phase: ["day", "night"], weight: 6,
    condition: (state) => !state.flags || (!state.flags.saved_cyborg && !state.flags.betrayed_cyborg),
    text: "一個身上插著實驗導管、皮膚已經高度「鋼鐵活化」異變的改造人倒在路邊，後面傳來大批感染者的咆哮聲。他向你遞出一個加密硬碟。",
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
    id: "evt_cyborg_nemesis", title: "索命的機械巨怪",
    minDay: 1, maxDay: null, phase: ["night"], weight: 0,
    condition: (state) => state.flags && state.flags.betrayed_cyborg && (state.day - state.flags.betrayed_cyborg) >= 5 && !state.flags.cyborg_nemesis_done,
    weightModifier: (state) => (state.flags && state.flags.betrayed_cyborg && (state.day - state.flags.betrayed_cyborg) >= 5 && !state.flags.cyborg_nemesis_done) ? 45 : 0,
    text: "大門被暴蠻力轟開！那個被你出賣的改造人如今已被病毒完全吞噬，半個身體融入了重型機械，化身為「鋼鐵湮滅者」前來索命！",
    options: [
      { label: "迎戰", battle: "enemy_cyborg_nemesis", battleBonus: { embers: 60, equipment_pool: ["cyber_suit"], setFlag: "cyborg_nemesis_done" }, resultText: "你深吸一口氣，迎向了這場無法迴避的決戰。" },
      { label: "死守據點硬撐過去", effect: { hp: -30, setFlag: "cyborg_nemesis_done" }, resultText: "你死守在據點裡，巨怪的重拳一次次砸在防禦工事上。你渾身是傷，但終究撐到了天亮——牠似乎暫時退去了。" }
    ]
  },
  // ---------- 27.5 連鎖事件擴充：黑膠唱片 ----------
  {
    id: "evt_vinyl_found", title: "舊時代的黑膠唱片",
    minDay: 5, maxDay: 10, phase: ["day", "night"], weight: 6,
    text: "在堆滿雜物的架子角落，你翻到一張封面斑駁的黑膠唱片，邊緣雖有磨損，但看起來還算完整。",
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
    text: "你將那張黑膠唱片放上收音機的唱盤，沙沙的雜訊過後，悠揚的旋律緩緩流出，填滿了據點的每個角落。",
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
    text: "溫室角落不知何時冒出了一株從未見過的植株，葉片泛著詭異的光澤，似乎正緩緩蠕動著。",
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
    text: "那株浸染了洋流廢水的植株終於結出果實——果殼裂開的瞬間，裡頭竟藏著一件濕潤而蠕動的奇特飾品。",
    options: [
      { label: "取出飾品", effect: { equipment_pool: ["ocean_leech"], embers: 30, exp: 10, setFlag: "seed_harvested" }, resultText: "你小心地將飾品取出並佩戴於身，感覺到一股微涼的潮濕氣息附著在皮膚上。" }
    ]
  },
  {
    id: "evt_seed_harvest_mind", title: "溫室的收穫",
    minDay: 1, maxDay: null, phase: ["day"], weight: 10,
    condition: (state) => !!(state.flags && state.flags.seed_mutated_mind && !state.flags.seed_harvested
      && state.day >= state.flags.seed_mutated_mind + 5),
    text: "那株經靈能雷達照射的植株終於結出果實——果殼裂開的瞬間，裡頭竟藏著一顆泛著螢光紋路的澄澈石英。",
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
    id: "evt_dog_missed", title: "再也沒出現的腳步聲",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 0,
    condition: (state) => !!(state.flags && state.flags.stray_dog_fed && !state.flags.dog_companion
      && state.day - state.flags.stray_dog_fed > 4),
    weightModifier: (state) => (state.flags && state.flags.stray_dog_fed && !state.flags.dog_companion
      && state.day - state.flags.stray_dog_fed > 4) ? 20 : 0,
    text: "你想起那隻曾經來討過食物的狗，已經好幾天沒再見到牠的蹤影了。或許牠找到了別的去處，或許只是換了條路線——廢墟裡的生命，總是來來去去。",
    options: [
      { label: "繼續忙手邊的事", effect: { setFlag: "dog_companion" }, resultText: "你搖了搖頭，把這份小小的失落放下，重新投入眼前的工作。" }
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
    text: "廢棄公寓的窗台上，一株不知名的小植物頑強地活了下來，葉片在裂縫透進的光線中微微搖晃。你猶豫了一下，最終把它連著盆一起帶走。",
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
    text: "在工作間角落，你發現一個上了鎖的工具箱，鎖頭已經鏽蝕得差不多了，邊緣還沾著幾粒會反光的細小石英顆粒。費了點力氣撬開後，裡頭的工具雖舊，但保養得意外完好。",
    options: [
      { label: "整箱帶走", effect: { furniture: ["furn_toolbox"] }, resultText: "你把工具箱搬回據點，打算找個地方固定上牆——這些工具以後肯定派得上用場。" }
    ]
  },
  {
    id: "evt_furniture_admire", title: "小小的家",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 6,
    condition: (state) => !!(state.baseSlots && (state.baseSlots.wall || state.baseSlots.wall2)) || !!(state.placedFurniture && state.placedFurniture.length > 0),
    text: "你環顧據點裡這些一點一滴添置起來的家具，雖然多半是從廢墟裡撿來、修補過的二手物，但擺在這裡，總算有了一點「家」的樣子。",
    options: [
      { label: "稍作休息", effect: { embers: 2 }, resultText: "你靠著牆坐下，難得地什麼都不做，只是發了一會兒呆。（獲得🔥2）" }
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

  // ===== 支線·👥隊員 =====
  side_companion_full_squad: {
    id: "side_companion_full_squad", type: "side", category: "companion",
    title: "全員到齊", desc: "招募完整的3人隊伍。",
    condition: (state) => Object.values(state.companions).filter(v => v !== "locked").length >= 3,
    reward: { embers: 30 },
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
    condition: (state) => ["weapon", "armor", "accessory"].some(slot => {
      const id = state.equipment[slot];
      return id && ITEMS[id] && ITEMS[id].rarity === "legendary";
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
  ach_wedding_ring: {
    id: "ach_wedding_ring", category: "collect",
    title: "至死不渝", desc: "取得並裝備婚戒。",
    condition: (state) => !!(state.equipment.accessory === "wedding_ring"),
    reward: { embers: 20 }, hidden: false,
  },
  ach_full_factions: {
    id: "ach_full_factions", category: "collect",
    title: "五行宗師", desc: "同時裝備5大派系裝備中的3個不同派系（武器/護甲/飾品三槽位）。",
    condition: (state) => new Set(["weapon", "armor", "accessory"].map(slot => {
      const id = state.equipment[slot];
      return id && ITEMS[id] && ITEMS[id].factionTag;
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

if (typeof module !== "undefined") {
  module.exports = { ITEMS, ENEMIES, EVENTS, LOCATIONS, AWAKENING_TRAITS, SKILLS_TREE, FACTION_IDS, PREFIX_POOL, QUESTS, ACHIEVEMENTS };
} else {
  // 瀏覽器環境：top-level const 不會自動成為 window 屬性，需手動掛載
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
}
