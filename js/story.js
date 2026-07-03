// 短篇序章「第一晚」（MVP4）：分支劇情 + 多重結局，銜接沙盒模式開局

const PROLOGUE_SCENES = {
  intro: {
    text: "凌晨，刺耳的警報聲將你驚醒。電視機還亮著，新聞畫面一片雜訊，最後定格在跑馬燈：「請民眾留在室內，避免接觸不明傷患」。窗外傳來玻璃碎裂與奔跑的腳步聲。\n\n天亮前，你必須做出決定。",
    options: [
      { label: "鎖緊門窗，留守公寓", next: "stay_wait" },
      { label: "趁夜溜出去，前往便利商店補給", next: "go_market" }
    ]
  },
  stay_wait: {
    text: "你把家具堆到門後，熄了燈，靜靜等待天亮。\n\n突然——「碰、碰、碰」，有人在用力敲門，夾雜著虛弱的呼喊：「拜託...有人在嗎...」",
    options: [
      { label: "開門查看", next: "stay_neighbor_decide" },
      { label: "假裝家裡沒人", ending: "alone" }
    ]
  },
  stay_neighbor_decide: {
    text: "你打開一條門縫——是住在隔壁的鄰居，手臂上纏著染血的布條，看起來只是被割傷，並未被感染。她哀求著讓她進來躲一晚。",
    options: [
      { label: "讓她進來，一起撐過今晚", ending: "companion" },
      { label: "婉拒她，把門關上", ending: "alone" }
    ]
  },
  go_market: {
    text: "你揹起背包，沿著陰暗的巷子摸黑前進。轉角處，一個踉蹌的身影猛然轉過頭來——是一個感染者，正朝你撲來！",
    options: [
      { label: "迎面戰鬥", battle: "enemy_walker_weak" },
      { label: "拔腿逃跑", next: "go_flee" }
    ]
  },
  go_flee: {
    text: "你轉身就跑，感染者在身後緊追不捨，你在瓦礫堆間連滾帶爬...",
    options: [
      { label: "繼續", resolve: "flee" }
    ]
  }
};

// 結局文案（依據 finishPrologue() 判斷的結局代碼）
const PROLOGUE_ENDINGS = {
  companion: {
    title: "生還・並肩同行",
    text: "天亮後，騷動逐漸平息。你和鄰居互相包紮了傷口，決定一起在這座據點裡撐下去——多一個人，就多一份希望。\n\n（夥伴將協助據點防禦，據點防禦+1，並留下一些醫療物資）"
  },
  alone: {
    title: "生還・孤身一人",
    text: "天亮後，街道恢復了詭異的平靜。你獨自一人，望著滿目瘡痍的城市，知道從今以後，一切都得靠自己了。"
  },
  weak: {
    title: "生還・身負重傷",
    text: "你拖著受傷的身體回到據點，簡單包紮後昏睡了過去。傷勢還沒完全好——接下來的日子，你必須更加小心。\n\n（你的最大HP暫時降低，且初始HP較低）"
  },
  dead: {
    title: "第一晚...",
    text: "你倒在了冰冷的街道上，再也沒有起來。\n\n——故事在第一晚就結束了。"
  }
};

// 2026-07-02新增：短篇序章第二篇「斷電之夜」——與「第一晚」情境完全不同(辦公大樓斷電夜歸 vs 住家警報夜)，
// 但沿用同一套結局代碼(companion/alone/weak/dead)以重用finishPrologue()/applyPrologueEnding()既有機制，
// 只是文案依所屬章節分開，靠PROLOGUE_CHAPTERS登記表在game.js的startPrologue()隨機二選一
const PROLOGUE_SCENES_2 = {
  c2_intro: {
    text: "你還在加班到深夜的辦公大樓裡核對最後一份文件，天花板的燈管毫無預兆地全數熄滅——不只是這一層，你從窗戶望出去，整座城市的燈火正一片一片地暗下去。\n\n樓下傳來警報聲與玻璃碎裂的巨響，緊接著是壓抑不住的尖叫。",
    options: [
      { label: "走安全梯下樓，查看狀況", next: "c2_descend" },
      { label: "留在原地，把自己反鎖在辦公室裡", next: "c2_wait" }
    ]
  },
  c2_descend: {
    text: "你摸黑走下十幾層樓梯，途中經過一處坍塌的樓層，瓦礫堆下傳來微弱的呼救聲——是一名同樣還沒下班的同事，腿被壓在斷裂的鋼樑下動彈不得。",
    options: [
      { label: "留下來幫忙清開瓦礫", next: "c2_rescue" },
      { label: "不敢耽擱，直接繞道離開", ending: "alone" }
    ]
  },
  c2_rescue: {
    text: "你合力搬開壓在他腿上的鋼樑，他忍痛爬了出來，感激地看著你。「我們……一起想辦法出去吧？」他喘著氣問。",
    options: [
      { label: "點頭，一起想辦法離開", ending: "companion" },
      { label: "只是點頭示意，隨後自己先走", ending: "alone" }
    ]
  },
  c2_wait: {
    text: "你反鎖上門，靠在牆邊屏息等待。沒過多久，窗外傳來玻璃被敲碎的聲響——一道扭曲的身影正試圖爬進來，你已經沒有時間猶豫。",
    options: [
      { label: "迎面戰鬥", battle: "enemy_walker_weak" },
      { label: "翻窗逃往安全梯", resolve: "flee" }
    ]
  }
};
const PROLOGUE_ENDINGS_2 = {
  companion: {
    title: "生還・臨時盟友",
    text: "你們摸黑走完剩下的樓梯，在街上互相扶持著找到一處能暫時落腳的據點。素不相識的兩人，就這樣因為那一晚，成了彼此唯一的依靠。\n\n（夥伴將協助據點防禦，據點防禦+1，並留下一些醫療物資）"
  },
  alone: {
    title: "生還・獨自一人",
    text: "你獨自摸黑走完剩下的樓梯，走出大樓時，天邊已經泛起一絲慘白的晨光。整座城市陷入死寂，你知道，從今以後只能靠自己了。"
  },
  weak: {
    title: "生還・傷痕累累",
    text: "你狼狽地逃出大樓，渾身傷痕地回到一處臨時據點，簡單包紮後倒頭昏睡。這一夜的驚魂，讓你好一陣子都緩不過來。\n\n（你的最大HP暫時降低，且初始HP較低）"
  },
  dead: {
    title: "斷電之夜...",
    text: "你倒在了漆黑的樓梯間，再也沒有站起來。\n\n——故事在斷電的那一夜就結束了。"
  }
};

// 短篇章節登記表：startPrologue()從中隨機挑一篇，之後renderPrologueScene()/finishPrologue()都依此表查詢對應的scenes/endings，
// 不再直接寫死PROLOGUE_SCENES/PROLOGUE_ENDINGS——新增第三篇短篇時，只需要在此陣列多加一個項目，不需要再改game.js的邏輯
const PROLOGUE_CHAPTERS = [
  { id: "first_night", startScene: "intro", scenes: PROLOGUE_SCENES, endings: PROLOGUE_ENDINGS },
  { id: "blackout_night", startScene: "c2_intro", scenes: PROLOGUE_SCENES_2, endings: PROLOGUE_ENDINGS_2 }
];

// 里程碑事件：特定天數第一次到達時觸發的一次性特殊事件
// 2026-07-02：原本只有day10/day20兩個，長期沙盒遊玩(現有地點已排到day25、血月每7~10天一輪)中後期完全沒有劇情節點，
// 補上day5~day90共7個，讓長時間遊玩也能持續遇到敘事回饋，而不是day20後就再也沒有專屬內容
const MILESTONE_EVENTS = [
  {
    id: "milestone_day5", day: 5,
    title: "第一週的喘息",
    text: "撐過了最初的五天，你終於能在夜裡睡得稍微安穩一點。據點還很簡陋，但至少，你已經摸清楚了周圍幾條相對安全的路線。\n\n窗外的世界依然扭曲而危險，但你活下來了——這比任何時候都更值得記上一筆。",
    options: [
      { label: "在牆上刻下今天的日期", effect: { san: 5, exp: 5 }, resultText: "你用小刀在牆角刻下一道刻痕，這是第一道。看著它，心裡莫名踏實了一些。" }
    ]
  },
  {
    id: "milestone_day10", day: 10,
    title: "遠方的廣播",
    text: "你的收音機突然傳出一段斷斷續續的聲音：「...如果有人聽到...城市東邊...設立了避難所...請盡量...」訊號很快又被雜訊淹沒，但你還是把座標默默記了下來。\n\n至少現在你知道，外面還有其他人在努力撐著。循著訊號的方向，你似乎發現了一處「倖存者營地」的蹤跡——下次出發時，或許可以順道過去看看。",
    options: [
      { label: "把收音機收好，繼續整理據點", effect: { resources: { scrap: 2 }, embers: 10, exp: 10 }, resultText: "你順手整理了一下身邊的廢料，心情似乎也踏實了一些。（獲得🔥10）" }
    ]
  },
  {
    id: "milestone_day15", day: 15,
    title: "陌生的腳步聲",
    text: "半夜，你被一陣不屬於感染者的、刻意放輕的腳步聲驚醒。透過門縫，你瞥見一道人影快速掠過巷口，似乎在觀察著你的據點，隨後又迅速消失在黑暗中。\n\n那不是感染者的步態——那是「人」的謹慎。這座城市裡，顯然不是只有你一個人在盤算著怎麼活下去。",
    options: [
      { label: "加強戒備，暫且觀望", effect: { baseDefense: 1, exp: 8 }, resultText: "你把能堵住的縫隙都堵上，決定先按兵不動。至少，對方也還沒有真的動手。" }
    ]
  },
  {
    id: "milestone_day20", day: 20,
    title: "據點的抉擇",
    text: "你已經在這裡撐了二十天。望著日漸熟悉的據點，你思考著接下來該怎麼走——是該把多餘的時間花在加固防禦，還是趁現在多儲備一些物資？",
    options: [
      { label: "加固防禦工事", effect: { baseDefense: 1, embers: 10, exp: 20 }, resultText: "你花了一整天加固牆壁與柵欄，據點的防禦提升了。（獲得🔥10）" },
      { label: "儲備物資", effect: { resources: { food: 3, water: 3 }, embers: 10, exp: 20 }, resultText: "你把時間拿來整理倉儲，多囤積了一些食物與飲水。（獲得🔥10）" }
    ]
  },
  {
    id: "milestone_day30", day: 30,
    title: "一個月",
    text: "整整一個月了。你翻看隨身的記事本，上頭密密麻麻記著這段時間發生的大小事——有驚險，有收穫，也有幾次差點撐不下去的夜晚。\n\n回頭看，你已經不是當初那個手足無措的自己了。",
    options: [
      { label: "把記事本收好，繼續前進", effect: { embers: 15, exp: 15, san: 8 }, resultText: "你闔上記事本，深吸一口氣。一個月，只是開始，還有很長的路要走。（獲得🔥15）" }
    ]
  },
  {
    id: "milestone_day40", day: 40,
    title: "城市邊緣的目擊",
    text: "遠征時，你在城市邊緣的高處望見遠方一座建築頂端立著一面陌生的旗幟，隨風獵獵作響——不是你熟悉的任何一個勢力標誌，顏色與圖騰都透著一股說不出的違和感。\n\n這座城市顯然比你想像的更複雜，淪陷的行政區裡，或許不是只有怪物在活動。",
    options: [
      { label: "記下旗幟的位置", effect: { resources: { scrap: 2 }, exp: 12 }, resultText: "你把旗幟的大致方位標在隨身地圖上，日後或許用得上這條線索。" }
    ]
  },
  {
    id: "milestone_day55", day: 55,
    title: "牆上的刻痕",
    text: "你無意間數了數牆角那排日期刻痕，密密麻麻已經排了好幾行。曾經覺得遙不可及的「活下去」，如今回頭看，好像也沒有想像中那麼難以觸及——雖然每一天，都仍是實打實地撐過來的。",
    options: [
      { label: "靜靜看了一會兒", effect: { san: 10 }, resultText: "你伸手撫過那些刻痕，心裡湧起一股複雜的情緒——有疲憊，但更多的是一種安靜的驕傲。" }
    ]
  },
  {
    id: "milestone_day70", day: 70,
    title: "陌生的訊號源",
    text: "收音機再度捕捉到一段訊號，這次清晰了不少：「……母體核心的活動頻率持續上升……所有分區務必提高警戒……」訊息戛然而止，只留下一片死寂的雜訊。\n\n「母體核心」——這個詞讓你脊背發涼。看來，這座城市真正的核心威脅，還遠遠沒有現身。",
    options: [
      { label: "把訊息記下，繼續備戰", effect: { resources: { scrap: 3 }, embers: 10, exp: 15 }, resultText: "你把聽到的隻字片語仔細記下，心裡清楚，接下來的日子恐怕不會輕鬆。（獲得🔥10）" }
    ]
  },
  {
    id: "milestone_day90", day: 90,
    title: "三個月",
    text: "三個月了。你早已記不清這段時間裡自己到底戰鬥過多少次、又有多少次幾乎撐不下去。但據點依然立在這裡，你也依然站著——這件事本身，就足以說明一切。\n\n窗外的世界依舊危險，但你已經不再是當初那個只想著「活過今晚」的人了。",
    options: [
      { label: "望向窗外，深吸一口氣", effect: { embers: 20, skillPoint: 1, san: 10 }, resultText: "你靜靜望著窗外扭曲卻依然存在的世界，心裡第一次浮現一個念頭：或許，這座城市真的還有救。（獲得🔥20）" }
    ]
  }
];

// 2026-07-02移除：SANDBOX_ENDINGS/getSandboxEndingExtras（沙盒模式「長期目標結局」文案+個人化尾聲）。
// 這套文案是為了配合logic.js已移除的longTermGoalMet/evaluateSandboxEnding而寫的，該機制本身與規格文件
// 「無限模式沒有結局，只收斂到畢業」的決定矛盾且無法透過正常遊玩觸發，一併移除。若未來想在「畢業」(showGraduationTransition)
// 畫面加入依流派/夥伴/收復進度變化的個人化文字，這裡曾經寫過的FACTION_EPILOGUES/COMPANION_EPILOGUES/LIBERATION_EPILOGUES
// 素材可以參考git歷史(commit 2c2154c)重用，不需要重寫。

// #26-2：過勞(體力硬撐)敘事化文案——取代系統debug語氣「😩 你已經過於疲憊（過勞）...」
const OVERDRAW_TEXTS = [
  "雙腿像灌了鉛，每一步都比平常沉重許多。額頭滲出冷汗，視線邊緣微微發燙——你知道自己撐過頭了，這次的成果恐怕大打折扣。",
  "呼吸變得又急又淺，太陽穴一陣陣抽痛。你勉強完成了動作，但身體已經在發出警告，剛才的收穫看起來比預期少了一截。",
  "四肢沉重得不像自己的，手指甚至有點發抖。你硬是把該做的事做完，可惜狀態太差，能帶回去的東西也少了。",
  "一陣暈眩襲來，眼前的景象短暫模糊了一下。你靠著意志撐住，但這份疲憊顯然也讓這趟收穫縮水不少。"
];

// 草稿2：day90後每20天觸發一次的「城市現況回顧」，取代已移除的沙盒結局(getSandboxEndingExtras)，
// 差異是這裡每個維度有3個變體會隨機輪替，且不是「結局」而是週期性里程碑，呼應「無限模式沒有結局」的定案
const CITY_REVIEW_FACTION = {
  gaia: [
    "這些日子以來，你體內流淌的蓋亞血脈早已與這片廢墟悄悄共生——牆縫裡冒出的雜草、院子裡頑強的作物，似乎都因你的存在而長得更好一些。",
    "你偶爾會在觸碰植物時感覺到一絲奇異的共鳴，彷彿這座城市殘存的綠意，正透過某種你說不清楚的方式與你對話。",
    "血脈裡的力量依然安靜地流淌著，你已經學會不去抗拒它，反而視為身體的一部分。"
  ],
  ocean: [
    "洋流帶來的力量始終潛伏在你的血液裡，每當夜深人靜，你仍能感覺到體內那股涼意隨著遠方看不見的潮汐微微起伏。",
    "你偶爾會夢見深海，醒來時分不清那是記憶還是血脈裡帶來的異象，但已經不再感到恐懼。",
    "那股潮濕而冰涼的力量依然守護著你，像一層看不見的鎧甲，貼著你的血管流動。"
  ],
  aero: [
    "你早已習慣風裡藏著的細碎訊息，那股大氣賦予的直覺，不知不覺間成了你判斷危險與機會的第六感。",
    "每當風向轉變，你總能比旁人早一步察覺到什麼——這份敏銳，如今已經是你生存的本能之一。",
    "你偶爾會站在高處，任風吹過全身，感受那股力量提醒你，這座城市依然在呼吸。"
  ],
  cyber: [
    "體內的機械義軀運轉得比誰都穩定，你偶爾會想起自己曾經是個純粹的人類，但如今這具身體，已經是撐過末日的證明。",
    "齒輪與電流的低鳴已經成了你熟悉的背景音，你不再去區分哪部分是「原本的你」，哪部分不是。",
    "這具改造過的身軀依然可靠地運作著，你偶爾會想，或許這就是這個時代生存下來該有的樣子。"
  ],
  mind: [
    "意識深處那些破碎又清晰的回聲從未停止過，你漸漸學會與它們共存——或許這正是你比其他倖存者多撐下來的原因。",
    "你偶爾能聽見別人聽不見的低語，一開始很不安，如今卻成了提前示警的能力。",
    "那些湧入腦海的破碎思緒依然存在，但你已經學會分辨哪些該聽、哪些該放下。"
  ]
};
const CITY_REVIEW_COMPANION = {
  alone: [
    "這一路你始終獨自走著。孤獨曾讓夜晚格外漫長，但也讓你學會了，一個人也能把日子過得踏實。",
    "沒有人分擔的日子並不輕鬆，但你早已練就了照顧自己的本事，這也是一種收穫。",
    "你偶爾會想像，如果當初做了不同的選擇，現在會不會不一樣——但轉念一想，這樣的自己，其實也不壞。"
  ],
  one: [
    "身旁的夥伴依然在，這一路上你們吵過、扶持過，如今回頭看，能撐到這裡，少不了彼此的那份陪伴。",
    "有人陪著走過這麼長的路，你早已分不清這份情感該叫依賴還是別的什麼，只知道少了對方會很不習慣。",
    "你們一起經歷了太多，如今任何一句抱怨都帶著熟悉的默契，這大概就是「夥伴」該有的樣子。"
  ],
  many: [
    "據點裡的人聲已經成了日常的一部分，你偶爾會想起最初孤身一人的日子，恍如隔世。",
    "這群人各自帶著不同的過去聚在一起，磨合的過程並不總是順利，但你從沒後悔把他們留下來。",
    "看著大家各司其職的樣子，你第一次覺得，自己守護的不只是一個據點，而是一群願意留下來的人。"
  ]
};
const CITY_REVIEW_LIBERATION = [
  [
    "外頭那些淪陷的行政區，你始終沒能力氣去收復，只能守著這一方小小的據點，盡量把日子過下去。",
    "收復失土對現在的你來說還太遙遠，眼下能守住自己的一方天地，已經耗盡了全力。",
    "城市的傷口依然遍布各處，你只能盡量不去想那些還在淪陷中的地方。"
  ],
  [
    "你陸續收復了一處淪陷的行政區，插上旗幟的那一刻，總算感覺到這座城市不再只是任人宰割的廢墟。",
    "第一面旗幟插下之後，你偶爾會刻意繞去那附近看看，確認一切依然安好。",
    "一處收復區不算多，但那份「事情正在變好」的感覺，足夠支撐你繼續走下去。"
  ],
  [
    "兩處收復區逐漸連成一種微弱的網絡，你開始感覺到自己不再是孤軍奮戰。",
    "越來越多倖存者聚集在收復區附近，你偶爾會想，這座城市或許真的還有救。",
    "兩面旗幟迎風飄揚，你站在據點屋頂，能眺望的安全範圍也比以前更遠了。"
  ],
  [
    "大半座城市的行政區都已經插上了你的旗幟，倖存者們口耳相傳著這個據點的名字——你已經不只是在「生存」，而是在「收復」。",
    "只剩最後一塊淪陷區，你反而變得格外謹慎，不想在終點前功虧一簣。",
    "這座城市正在你眼前，一點一點地變回原本的樣子，你偶爾會為此感到一陣鼻酸。"
  ],
  [
    "母體核心也被你踏平了。收復四個行政區的旗幟在風中獵獵作響，這座城市，終於有一部分真正回到了人類手中。",
    "你站在曾經最危險的行政區邊界，望著眼前重新亮起的燈火，一時說不出話來。",
    "收復戰打完了，但你知道，重建才剛要開始——這反而讓你有種奇異的踏實感。"
  ]
];

function getCityReviewText(state) {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const faction = (state.skills && state.skills.faction) || "gaia";
  const companionCount = Object.values(state.companions || {}).filter((v) => v !== "locked").length;
  const companionLevel = companionCount === 0 ? "alone" : companionCount === 1 ? "one" : "many";
  const liberatedCount = ["tier0_liberated", "tier1_liberated", "tier2_liberated", "tier3_liberated"]
    .filter((f) => state.flags && state.flags[f]).length;
  return [
    pick(CITY_REVIEW_FACTION[faction] || CITY_REVIEW_FACTION.gaia),
    pick(CITY_REVIEW_COMPANION[companionLevel]),
    pick(CITY_REVIEW_LIBERATION[liberatedCount])
  ].join("\n\n");
}

// day90後每20天觸發一次；回傳null表示尚未到觸發時機
function getCityReviewEvent(state) {
  if (state.day <= 90) return null;
  const last = state.lastCityReviewDay || 90;
  if (state.day - last < 20) return null;
  return {
    id: "city_review",
    textFn: getCityReviewText
  };
}

if (typeof module !== "undefined") {
  module.exports = { PROLOGUE_SCENES, PROLOGUE_ENDINGS, PROLOGUE_SCENES_2, PROLOGUE_ENDINGS_2, PROLOGUE_CHAPTERS, MILESTONE_EVENTS, OVERDRAW_TEXTS, getCityReviewText, getCityReviewEvent };
} else {
  window.PROLOGUE_SCENES = PROLOGUE_SCENES;
  window.PROLOGUE_ENDINGS = PROLOGUE_ENDINGS;
  window.PROLOGUE_SCENES_2 = PROLOGUE_SCENES_2;
  window.PROLOGUE_ENDINGS_2 = PROLOGUE_ENDINGS_2;
  window.PROLOGUE_CHAPTERS = PROLOGUE_CHAPTERS;
  window.MILESTONE_EVENTS = MILESTONE_EVENTS;
  window.getCityReviewText = getCityReviewText;
  window.getCityReviewEvent = getCityReviewEvent;
}
