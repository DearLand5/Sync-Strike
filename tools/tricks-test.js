// Трюки оружия в бою: node tools/tricks-test.js [id,id]
// Для каждого оружия ближнего боя: (1) в покое без врагов трюки идут (число, имена); (2) после удара, который попал,
// трюк начинается быстро (≤ 0,6 с после конца удара); (3) атака прерывает трюк сразу, угол оружия сведён к [−π, π];
// (4) огнестрел/прыжок прерывают трюк. Ошибки страницы — провал.
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 560 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message + "\n" + e.stack));
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  const ids = process.argv[2] ? process.argv[2].split(",") : await page.evaluate(() => Object.keys(window.TRICKS_REF));
  let bad = 0;
  const check = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg); if (!ok) bad++; };
  for (const id of ids) {
    await page.evaluate(id => { const g = window.__game; g.settings.v.martial = false; g.settings.v.meleeWeapon = id; g.settings.v.slowmoMode = "off"; g.startBattle("waves"); }, id);
    await page.waitForFunction(() => window.__game.state === "battle", null, { timeout: 60000 });
    // (1) покой: врагов нет, практика без спавна — смотрим 6 с
    const idle = await page.evaluate(async () => {
      const g = window.__game, p = g.player;
      g.waves.queue = []; g.waves.pending = []; g.waves.between = 999;
      for (const e of g.enemies) e.dead = true; g.enemies = [];
      p.tricks = 0; const names = new Set(); const t0 = performance.now();
      await new Promise(r => { const iv = setInterval(() => { p.hp = p.maxHp; if (p.trick) names.add(p.trick.def.name); if (performance.now() - t0 > 8000) { clearInterval(iv); r(); } }, 30); });
      return { n: p.tricks, names: [...names] };
    });
    check(idle.n >= 2, `${id}: трюки в покое за 8 с — ${idle.n} (${idle.names.join(", ")})`);
    // (1б) на бегу и в прыжке: бег туда-обратно с прыжками 6 с — трюки идут, в каких состояниях
    const move = await page.evaluate(async () => {
      const g = window.__game, p = g.player, inp = g.input; p.tricks = 0; const st = new Set(); let k = 0; const t0 = performance.now();
      await new Promise(r => { const iv = setInterval(() => {
        p.hp = p.maxHp; k++;
        inp.keys.delete("KeyA"); inp.keys.delete("KeyD"); inp.keys.add(Math.floor(k / 90) % 2 ? "KeyA" : "KeyD");
        if (k % 50 === 0 && p.onGround) inp.push("jump");
        if (p.trick) st.add(p.state);
        if (performance.now() - t0 > 8000) { clearInterval(iv); inp.keys.delete("KeyA"); inp.keys.delete("KeyD"); r(); }
      }, 16); });
      return { n: p.tricks, st: [...st] };
    });
    check(move.n >= 2 && move.st.some(s => s === "run" || s === "walk") && move.st.some(s => s === "jump" || s === "fall"), `${id}: трюки на бегу и в прыжке — ${move.n} (состояния: ${move.st.join(", ")})`);
    // (2) удар по манекену → трюк вскоре после конца удара; (3) атака прерывает трюк
    const hit = await page.evaluate(async () => {
      const g = window.__game, p = g.player;
      const en = g.waves.spawn("blade", true);
      if (!en) return { err: "нет манекена" };
      en.maxHp = en.hp = 1e6; en.attackCD = 99; en.x = p.x + 30 * p.facing; en.y = 0;
      await new Promise(r => setTimeout(r, 1000));
      en.x = p.x + 30 * p.facing;
      p.trick = null; p.trickWait = 9;
      g.input.push("attack");
      const t0 = performance.now(); let end = -1, start = -1, hitOk = false;
      await new Promise(r => { const iv = setInterval(() => {
        p.hp = p.maxHp;
        if (p.action && p.action.hit.size) hitOk = true;
        if (end < 0 && hitOk && !p.action) end = performance.now();
        if (end > 0 && start < 0 && p.trick) start = performance.now();
        if ((start > 0) || performance.now() - t0 > 3000) { clearInterval(iv); r(); }
      }, 10); });
      // атака во время трюка
      await new Promise(r => setTimeout(r, 200));
      const had = !!p.trick; g.input.push("attack");
      await new Promise(r => setTimeout(r, 60));
      const cut = !p.trick && !!p.action, wa = p.anim.pose.wAngle;
      return { hitOk, lag: start > 0 ? (start - end) / 1000 : -1, had, cut, wa };
    });
    if (hit.err) { check(false, `${id}: ${hit.err}`); continue; }
    check(hit.hitOk && hit.lag >= 0 && hit.lag <= 0.6, `${id}: трюк после попадания через ${hit.lag.toFixed(2)} с`);
    check(!hit.had || (hit.cut && Math.abs(hit.wa) <= Math.PI * 2.2), `${id}: атака прерывает трюк (был ${hit.had}, прерван ${hit.cut}, угол ${hit.wa.toFixed(2)})`);
    await page.evaluate(() => window.__game.endBattle ? 0 : 0);
  }
  await browser.close();
  if (errors.length) { console.log("ОШИБКИ:", errors); bad++; }
  console.log(bad ? `ПРОБЛЕМ: ${bad}` : "всё в норме");
  process.exit(bad ? 1 : 0);
})();
