// Бот играет волны в реальном времени: node tools/bot-test.js [seconds]
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
const secs = +(process.argv[2] || 75);
(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 560 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message + "\n" + e.stack));
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__game.startBattle("waves"));
  await page.waitForFunction(() => window.__game.state === "battle", null, { timeout: 60000 });
  // бот внутри страницы: решения раз в кадр
  await page.evaluate(() => {
    const g = window.__game, inp = g.input;
    let lastBeat = -1;
    g.__bot = setInterval(() => {
      if (g.state !== "battle") return;
      const p = g.player;
      let tgt = null, bd = 1e9;
      for (const e of g.enemies) if (e.targetable) { const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y) * 0.5; if (d < bd) { bd = d; tgt = e; } }
      inp.keys.delete("KeyA"); inp.keys.delete("KeyD");
      if (tgt) {
        const dx = tgt.x - p.x;
        if (Math.abs(dx) > 60) inp.keys.add(dx > 0 ? "KeyD" : "KeyA");
        if (tgt.y < p.y - 60 && p.onGround && Math.random() < 0.05) inp.push("jump");
        // уклон от замаха рядом
        for (const e of g.enemies) if (e.state === "windup" && e.windDur - e.windT < 0.12 && Math.abs(e.x - p.x) < 150) { inp.push("dodge"); break; }
      }
      // атака на долю
      const toBeat = g.clock.nextBeat - g.songNow;
      if (toBeat < 0.03 && g.clock.idx !== lastBeat) { lastBeat = g.clock.idx; inp.push("attack"); }
    }, 16);
  });
  const t0 = Date.now();
  let log = [];
  while (Date.now() - t0 < secs * 1000) {
    await page.waitForTimeout(5000);
    const s = await page.evaluate(() => { const g = window.__game; return { t: g.songNow.toFixed(0), st: g.state, hp: Math.round(g.player.hp), wave: g.waves.wave, q: g.waves.queue.length, alive: g.enemies.filter(e => e.alive).map(e => e.kind[0] + ":" + e.state[0] + Math.round(e.x) + "/" + Math.round(e.y)).join(","), kills: g.combat.kills, combo: g.combat.maxCombo, fps: Math.round(g.fps), r: g.combat.ratings }; });
    log.push(JSON.stringify(s));
    if (s.st !== "battle") break;
  }
  console.log(log.join("\n"));
  await browser.close();
  console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no errors");
})();
