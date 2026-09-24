// 餘燼日記 Service Worker(2026-09-20)：第一次載入後把整個遊戲存進手機，之後斷網也能開，更新時不會卡在半途。
// ⚠️ 改 js/css 時，index.html 的 ?v=N 與這裡的 VERSION 必須一起 +1(單元測試會檢查一致)；assets/ 新增/刪除檔案要同步更新 ASSETS(單元測試會檢查)。
const VERSION = 270;
const CACHE = "embers-v" + VERSION;
const CORE = ["./", "index.html", "css/style.css?v=" + VERSION, "js/data.js?v=" + VERSION, "js/story.js?v=" + VERSION, "js/logic.js?v=" + VERSION, "js/game.js?v=" + VERSION];
const ASSETS = [
  "assets/characters/char_1.png",
  "assets/characters/char_1_back.png",
  "assets/characters/char_1_side.png",
  "assets/characters/char_2.png",
  "assets/characters/char_2_back.png",
  "assets/characters/char_2_side.png",
  "assets/characters/char_3.png",
  "assets/characters/char_3_back.png",
  "assets/characters/char_3_side.png",
  "assets/characters/char_4.png",
  "assets/characters/char_4_back.png",
  "assets/characters/char_4_side.png",
  "assets/characters/companion_default.png",
  "assets/characters/default_back.png",
  "assets/characters/default_side.png",
  "assets/characters/generate.js",
  "assets/enemies/enemy_cyborg_nemesis.png",
  "assets/enemies/enemy_walker_armed.png",
  "assets/enemies/enemy_walker_brute.png",
  "assets/enemies/enemy_walker_weak.png",
  "assets/icons/aero_barometer.png",
  "assets/icons/aero_cloak.png",
  "assets/icons/aero_crossbow.png",
  "assets/icons/aero_dagger.png",
  "assets/icons/aero_pouch.png",
  "assets/icons/appearance_token.png",
  "assets/icons/awaken_crystal.png",
  "assets/icons/bandage.png",
  "assets/icons/bat_01.png",
  "assets/icons/ceramic_vest.png",
  "assets/icons/chick_token.png",
  "assets/icons/crowbar_01.png",
  "assets/icons/cyber_drone_arm.png",
  "assets/icons/cyber_hammer.png",
  "assets/icons/cyber_pendant.png",
  "assets/icons/cyber_suit.png",
  "assets/icons/egg.png",
  "assets/icons/energy_drink.png",
  "assets/icons/floor_sample.png",
  "assets/icons/food_can.png",
  "assets/icons/gaia_armor.png",
  "assets/icons/gaia_seed_pouch.png",
  "assets/icons/gaia_skin.png",
  "assets/icons/gaia_spore_dart.png",
  "assets/icons/gaia_whip.png",
  "assets/icons/jacket_01.png",
  "assets/icons/knife_01.png",
  "assets/icons/lamb_token.png",
  "assets/icons/leather_coat_01.png",
  "assets/icons/machete_01.png",
  "assets/icons/merchant_token.png",
  "assets/icons/military_shovel.png",
  "assets/icons/mind_eye.png",
  "assets/icons/mind_fork.png",
  "assets/icons/mind_greatsword.png",
  "assets/icons/mind_lens.png",
  "assets/icons/mind_mirror.png",
  "assets/icons/mind_robe.png",
  "assets/icons/mutant_berry_extract.png",
  "assets/icons/mutant_egg_essence.png",
  "assets/icons/mutant_hen_token.png",
  "assets/icons/nail_bat_01.png",
  "assets/icons/ocean_harpoon.png",
  "assets/icons/ocean_jacket.png",
  "assets/icons/ocean_leech.png",
  "assets/icons/ocean_mace.png",
  "assets/icons/ocean_pistol.png",
  "assets/icons/pipe_01.png",
  "assets/icons/pistol_01.png",
  "assets/icons/reinforce_blueprint.png",
  "assets/icons/riot_shield_vest.png",
  "assets/icons/scrap.png",
  "assets/icons/scrap_chainsaw.png",
  "assets/icons/scrap_plating.png",
  "assets/icons/seed_greens.png",
  "assets/icons/seed_mutant_berry.png",
  "assets/icons/seed_potato.png",
  "assets/icons/serum_atk.png",
  "assets/icons/serum_stamina.png",
  "assets/icons/serum_vit.png",
  "assets/icons/tesla_battery.png",
  "assets/icons/vest_01.png",
  "assets/icons/water_bottle.png",
  "assets/icons/wedding_ring.png",
  "assets/icons/wool.png",
  "assets/iso/animal_chick.png",
  "assets/iso/animal_lamb.png",
  "assets/iso/animal_mutant_hen.png",
  "assets/iso/deco_bush.png",
  "assets/iso/deco_fence_post.png",
  "assets/iso/deco_rock_cluster.png",
  "assets/iso/deco_tree_small.png",
  "assets/iso/door_explore.png",
  "assets/iso/door_gather.png",
  "assets/iso/farm_plot_empty.png",
  "assets/iso/farm_plot_locked.png",
  "assets/iso/farm_stage_growing.png",
  "assets/iso/farm_stage_mature.png",
  "assets/iso/farm_stage_sprout.png",
  "assets/iso/furn_appearance_mirror.png",
  "assets/iso/furn_bench.png",
  "assets/iso/furn_couple_wall.png",
  "assets/iso/furn_diary.png",
  "assets/iso/furn_dreamcatcher.png",
  "assets/iso/furn_egg_nest.png",
  "assets/iso/furn_flag.png",
  "assets/iso/furn_fridge.png",
  "assets/iso/furn_generator.png",
  "assets/iso/furn_greenhouse.png",
  "assets/iso/furn_jelly_lamp.png",
  "assets/iso/furn_mirror.png",
  "assets/iso/furn_photo_frame.png",
  "assets/iso/furn_potted_plant.png",
  "assets/iso/furn_radio.png",
  "assets/iso/furn_sandbags.png",
  "assets/iso/furn_sleeping_bag.png",
  "assets/iso/furn_sofa.png",
  "assets/iso/furn_toolbox.png",
  "assets/iso/furn_turret.png",
  "assets/iso/furn_vines.png",
  "assets/iso/furn_whiteboard.png",
  "assets/iso/pen_empty.png",
  "assets/iso/pen_locked.png",
  "assets/iso/pen_trough_empty.png",
  "assets/iso/pen_trough_filled.png",
  "assets/iso/rug_plain.png",
  "assets/iso/rug_round.png",
  "assets/iso/rug_woven.png",
];

self.addEventListener("install", (e) => {
  // 任何一個檔案抓失敗就整個安裝失敗，舊版 Service Worker 維持運作(不會裝到半套)
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.concat(ASSETS))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.startsWith("embers-v")).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // 主頁：網路優先(有網路就拿最新版，最多等4秒)，失敗/沒網路退回快取，這樣更新一定會到、斷網也能開
  if (req.mode === "navigate") {
    e.respondWith(
      Promise.race([
        fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("index.html", copy)); return res; }),
        new Promise((_, reject) => setTimeout(reject, 4000)),
      ]).catch(() => caches.match("index.html").then((r) => r || caches.match("./")))
    );
    return;
  }
  // 其餘(js/css帶版本號、assets圖片)：快取優先；assets忽略?v=查詢字串
  const isAsset = url.pathname.includes("/assets/");
  e.respondWith(
    caches.match(req, { ignoreSearch: isAsset }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
