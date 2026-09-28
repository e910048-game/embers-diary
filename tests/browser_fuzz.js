// 瀏覽器內「隨機自動玩家」(fuzz)：在真實遊戲畫面上隨機點按鈕/切畫面，找崩潰、卡死、數值異常
// 用法：先開啟遊戲頁面(例如 http://localhost:8080/)，再在頁面 console 或自動化工具執行：
//   const s = document.createElement("script"); s.src = "tests/browser_fuzz.js"; document.head.appendChild(s);
//   之後 await window.__runFuzz({ steps: 1500, god: true, warp: true })  →  回傳統計報告
// 選項：steps=步數；god=每步回滿血/資源(讓它能玩得更遠、涵蓋後期內容)；warp=偶爾快轉天數解鎖後期事件；seed=可重現的亂數種子
(function () {
  function makeRng(seed) { let a = seed >>> 0 || 123456789; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  window.__runFuzz = async function (opts = {}) {
    const steps = opts.steps || 1000, god = !!opts.god, warp = !!opts.warp;
    const rnd = makeRng(opts.seed || 20260925);
    const pick = arr => arr[Math.floor(rnd() * arr.length)];
    const report = { steps: 0, deaths: 0, maxDay: 0, maxLevel: 1, errors: [], invariant: [], stuck: 0, screens: {}, eventsSeen: 0, threadsDone: 0, sanLow: 0 };
    const onErr = e => { report.errors.push(String(e.message || e).slice(0, 120) + " @" + String(e.filename || "").split("/").pop() + ":" + (e.lineno || "?")); };
    window.addEventListener("error", onErr);
    const realRandom = Math.random; Math.random = rnd; // 讓遊戲內的隨機也可重現
    const confirmBak = window.confirm, promptBak = window.prompt;
    window.confirm = () => true; window.prompt = () => "測試員";
    try {
      // 進入一個可玩的存檔，跳過序章
      state = freshState(); state.playerName = "測試員"; state.appearance = state.appearance || "char_1";
      renderMain();
      const functions = ["showExploreChoice", "doRest", "doReinforce", "doConvert", "showInventory", "showQuestPanel", "showSkillPanel", "showShop", "showDiary", "showCampPanel", "showProjectsPanel", "showThreadBook", "showCompanionPanel"]
        .filter(n => typeof window[n] === "function" || (function () { try { return typeof eval(n) === "function"; } catch (_) { return false; } })());
      const call = n => { try { return eval(n + "()"); } catch (e) { report.errors.push("呼叫" + n + "失敗: " + e.message); } };
      let lastSig = "", sameCount = 0;
      const checkInvariants = () => {
        const bad = [];
        const num = (n, v) => { if (typeof v !== "number" || !Number.isFinite(v)) bad.push(n + "=" + v); };
        num("hp", state.hp); num("san", state.san); num("stamina", state.stamina); num("day", state.day); num("level", state.level); num("exp", state.exp);
        if (state.hp > getEffectiveHpMax(state) + 1) bad.push("hp超過上限 " + state.hp);
        if (state.san < 0 || state.san > getEffectiveSanMax(state) + 1) bad.push("san越界 " + state.san);
        if (state.stamina < 0 || state.stamina > state.staminaMax + 1) bad.push("stamina越界 " + state.stamina + "/" + state.staminaMax);
        for (const k of ["food", "water", "medicine", "ammo", "scrap"]) { const v = state.resources[k]; if (!(v >= 0) || v > getResourceCap(state, k)) bad.push("資源" + k + "越界 " + v); }
        if (!(state.currency.embers >= 0)) bad.push("晶燼為負 " + state.currency.embers);
        if (bad.length) report.invariant.push("第" + state.day + "天: " + bad.join("; "));
      };
      for (let i = 0; i < steps; i++) {
        report.steps++;
        if (god && state && state.hp > 0) { state.hp = getEffectiveHpMax(state); Object.keys(state.resources).forEach(k => { state.resources[k] = Math.max(state.resources[k], 5); }); if (state.stamina < 2) state.stamina = state.staminaMax; }
        if (warp && i > 0 && i % 60 === 0 && state.hp > 0) state.day += 7 + Math.floor(rnd() * 20);
        // 死亡畫面 → 重新挑戰(走序章)
        if (document.querySelector(".gameover")) {
          report.deaths++;
          const btn = [...document.querySelectorAll(".choiceBtn")].find(b => /重新/.test(b.innerText));
          if (btn) btn.click(); else { state = freshState(); renderMain(); }
          await sleep(5); continue;
        }
        // 過場動畫(入夜/破曉/升級面板)：點掉或略過
        const overlay = document.querySelector(".phaseTransition");
        if (overlay) { if (overlay.classList.contains("levelUpTransition")) overlay.click(); else await sleep(60); continue; }
        const btns = [...document.querySelectorAll("#screen .choiceBtn:not(.disabled)")];
        const atHome = !!document.getElementById("homePlayerCell");
        if (atHome || btns.length === 0) {
          // 小屋主畫面/沒有按鈕：隨機叫用一個功能畫面
          call(pick(functions));
        } else {
          pick(btns).click();
        }
        const sc = document.querySelector("#screen .storyCard"); if (sc && rnd() < 0.5) sc.click();
        await sleep(2);
        if (state && state.hp > 0) checkInvariants();
        if (state) { report.maxDay = Math.max(report.maxDay, state.day); report.maxLevel = Math.max(report.maxLevel, state.level); if (state.san < 50) report.sanLow++; }
        const sig = (document.getElementById("screen") || {}).innerText;
        const key = (sig || "").slice(0, 24).replace(/\s+/g, " ");
        report.screens[key] = (report.screens[key] || 0) + 1;
        if (sig === lastSig) { sameCount++; } else { sameCount = 0; lastSig = sig; }
        if (sameCount >= 25) { report.stuck++; sameCount = 0; try { renderMain(); } catch (e) { report.errors.push("卡死後renderMain失敗:" + e.message); } }
      }
      report.eventsSeen = (state.seenEvents || []).length;
      report.threadsDone = threadSummary(state).done;
      const s2 = {}; Object.entries(report.screens).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([k, v]) => { s2[k] = v; }); report.screens = s2;
      report.invariant = report.invariant.slice(0, 10); report.errors = [...new Set(report.errors)].slice(0, 15);
    } finally {
      window.removeEventListener("error", onErr); Math.random = realRandom; window.confirm = confirmBak; window.prompt = promptBak;
    }
    return report;
  };
})();
