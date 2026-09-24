// 故意寫錯的批次：驗證器必須擋下
[
  { id: "evt_bad_one", minDay: 5, phase: ["day"], weight: 5, text: "只有一個選項。", options: [{ label: "繼續", effect: { san: 1 }, resultText: "沒有選擇。" }] },
  { id: "evt_bad_effect", minDay: 5, phase: ["day"], weight: 5, text: "亂加效果。", options: [
    { label: "拿走", effect: { resources: { gold: 3 }, hp: 99, skillPoint: 5 }, resultText: "不存在的資源、爆表的數值、不允許的欄位。" },
    { label: "離開", effect: { equipment_pool: ["gaia_whip"] }, resultText: "傳說裝備不允許外部AI發放。" } ] },
  { id: "evt_found_supplies", minDay: 5, phase: ["morning"], weight: 50, text: "x".repeat(150), options: [
    { label: "a", effect: {}, resultText: "id重複、phase錯、weight爆、文字過長。", roll: { chance: 0.5 } },
    { label: "b", effect: {}, resultText: "ok" } ] },
]
