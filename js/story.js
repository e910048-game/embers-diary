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

// 里程碑事件：特定天數第一次到達時觸發的一次性特殊事件
const MILESTONE_EVENTS = [
  {
    id: "milestone_day10", day: 10,
    title: "遠方的廣播",
    text: "你的收音機突然傳出一段斷斷續續的聲音：「...如果有人聽到...城市東邊...設立了避難所...請盡量...」訊號很快又被雜訊淹沒，但你還是把座標默默記了下來。\n\n至少現在你知道，外面還有其他人在努力撐著。循著訊號的方向，你似乎發現了一處「倖存者營地」的蹤跡——下次出發時，或許可以順道過去看看。",
    options: [
      { label: "把收音機收好，繼續整理據點", effect: { resources: { scrap: 2 }, embers: 10, exp: 10 }, resultText: "你順手整理了一下身邊的廢料，心情似乎也踏實了一些。（獲得🔥10）" }
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
  }
];

// 沙盒模式長期目標結局（撐過 SANDBOX_GOAL_DAY 天後依狀態判定）
const SANDBOX_ENDINGS = {
  stronghold: {
    title: "據點・屹立不搖",
    text: "三十天過去了。你和夥伴把這座據點打造成了周圍少見的安全堡壘——高聳的防禦工事、充足的物資儲備，甚至開始有零星的倖存者前來投靠。\n\n在這片廢墟之中，你們守住了一個真正的「家」。"
  },
  survivor: {
    title: "倖存・繼續前行",
    text: "三十天過去了。日子過得不算輕鬆，但你一步一步撐了下來——據點還算穩固，物資勉強夠用，你依然活著。\n\n故事還沒結束，但至少，今天又是平安的一天。"
  },
  barely: {
    title: "倖存・搖搖欲墜",
    text: "三十天過去了。你拖著傷痕累累的身體，靠著最後一點意志撐到了今天。據點殘破，物資匱乏，隨時都可能崩潰。\n\n但你還活著——這已經是奇蹟了。"
  }
};

// #26-2：過勞(體力硬撐)敘事化文案——取代系統debug語氣「😩 你已經過於疲憊（過勞）...」
const OVERDRAW_TEXTS = [
  "雙腿像灌了鉛，每一步都比平常沉重許多。額頭滲出冷汗，視線邊緣微微發燙——你知道自己撐過頭了，這次的成果恐怕大打折扣。",
  "呼吸變得又急又淺，太陽穴一陣陣抽痛。你勉強完成了動作，但身體已經在發出警告，剛才的收穫看起來比預期少了一截。",
  "四肢沉重得不像自己的，手指甚至有點發抖。你硬是把該做的事做完，可惜狀態太差，能帶回去的東西也少了。",
  "一陣暈眩襲來，眼前的景象短暫模糊了一下。你靠著意志撐住，但這份疲憊顯然也讓這趟收穫縮水不少。"
];

if (typeof module !== "undefined") {
  module.exports = { PROLOGUE_SCENES, PROLOGUE_ENDINGS, SANDBOX_ENDINGS, MILESTONE_EVENTS, OVERDRAW_TEXTS };
} else {
  window.PROLOGUE_SCENES = PROLOGUE_SCENES;
  window.PROLOGUE_ENDINGS = PROLOGUE_ENDINGS;
  window.SANDBOX_ENDINGS = SANDBOX_ENDINGS;
  window.MILESTONE_EVENTS = MILESTONE_EVENTS;
}
