// 範例批次(通過驗證)：一個單發事件、一組因果鏈(起點+回饋)、一個基地連動事件
const BATCH = [
  {
    id: "evt_sample_rooftop_kite", title: "屋頂上的風箏",
    minDay: 25, maxDay: null, phase: ["day"], weight: 5,
    text: "你在一棟大樓的屋頂上發現一隻用塑膠袋和電線做成的風箏，線軸還握在一具早已風乾的手裡。風一吹，風箏微微晃動，像想再飛一次。",
    options: [
      { label: "放它飛起來", effect: { san: 4, exp: 3 }, resultText: "風箏搖搖晃晃地升上灰色的天空。你握著線軸站了很久，直到手臂發痠。" },
      { label: "把線軸收走", effect: { resources: { scrap: 2 } }, resultText: "電線和塑膠還能派上用場。你朝那隻手輕輕點了點頭，才轉身離開。" },
    ],
  },
  {
    id: "evt_sample_lost_dog_help", title: "找不到家的狗",
    minDay: 20, maxDay: null, phase: ["day"], weight: 5,
    text: "一隻項圈上掛著名牌的小狗縮在牆角發抖。名牌上刻著一個地址，離這裡不遠。",
    options: [
      { label: "抱牠去名牌上的地址", effect: { hp: -2, exp: 4, setFlag: "sample_dog_escorted" }, resultText: "地址是一間空屋。你把牠放在門口，牠嗅了嗅門墊，尾巴輕輕搖了一下。" },
      { label: "餵牠一點水就離開", requiresResource: { water: 1 }, effect: { resources: { water: -1 }, san: 2 }, resultText: "牠舔完水，抬頭看了你一眼，然後轉身鑽進了縫隙裡。" },
    ],
  },
  {
    id: "evt_sample_lost_dog_return", title: "門口的訪客",
    minDay: 1, maxDay: null, phase: ["day", "night"], weight: 8,
    condition: (state) => daysSinceFlagAtLeast(state, "sample_dog_escorted", 3) && !(state.flags && state.flags.sample_dog_return_done),
    text: "據點門口傳來輕輕的抓門聲。你打開門，是幾天前那隻小狗。牠嘴裡叼著一個被咬得皺巴巴的小包，放在你腳邊，然後歪著頭看你。",
    options: [
      { label: "摸摸牠，收下小包", effect: { resources: { food: 2, medicine: 1 }, san: 4, setFlag: "sample_dog_return_done" }, resultText: "小包裡是幾樣不知從哪撿來的東西。牠在你腳邊繞了一圈，才心滿意足地跑走。" },
      { label: "先給牠一點水喝", requiresResource: { water: 1 }, effect: { resources: { water: -1, scrap: 2 }, san: 5, setFlag: "sample_dog_return_done" }, resultText: "牠喝得很急，喝完舔了舔你的手。臨走前，牠把小包留了下來。" },
    ],
  },
  {
    id: "evt_sample_workshop_apprentice", title: "工坊的新學徒",
    minDay: 30, maxDay: null, phase: ["day"], weight: 5,
    condition: (state) => workshopStations(state) >= 2 && !(state.flags && state.flags.sample_apprentice_done),
    text: "一個年輕人站在你的工坊門口，好奇地打量著牆上的工具。他說他以前是機修學徒，想看看能不能幫上忙。",
    options: [
      { label: "讓他試試手，看他能做什麼", effect: { resources: { scrap: 3 }, exp: 5, setFlag: "sample_apprentice_done" }, resultText: "他花了一下午把兩件壞掉的工具修好了。你多了一個可以聊機械的人。" },
      { label: "請他改天再來", effect: { san: 1, setFlag: "sample_apprentice_done" }, resultText: "他有點失望地點點頭，走之前還是幫你把散落的螺絲收進了盒子。" },
    ],
  },
];
