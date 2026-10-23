// Частота эффектов времени в плотном бою: доля замедления, входы в замедление, стоп-кадры.
// node tools/timefx-test.js [seconds] [difficulty]
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
const secs = +(process.argv[2] || 90), diff = process.argv[3] || "normal";
(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 560 } });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  await page.evaluate(diff => {
    const g = window.__game;
    g.settings.set("difficulty", diff);
    const M = window.__tfx = { total: 0, slow: 0, stop: 0, enters: [], inSlow: false };
    const orig = g.updateTimeScale.bind(g);
    g.updateTimeScale = dt => {
      const s = orig(dt);
      M.total += dt;
      if (s === 0) M.stop += dt;
      const slowNow = g.timeScale < 0.9;
      if (slowNow) M.slow += dt;
      if (slowNow && !M.inSlow) M.enters.push(M.total);
      M.inSlow = slowNow;
      return s;
    };
    g.startBattle("waves").then(() => {
      const inp = g.input; let nextAttack = 0, lastBeat = -1;
      setInterval(() => {
        if (g.state !== "battle") return;
        // плотный бой: на арене всегда 6 врагов, игрок неуязвим (меряем только эффекты)
        g.player.hp = g.player.maxHp;
        g.waves.between = 999; g.waves.queue = [];
        if (g.enemies.filter(e => e.alive).length < 6) g.waves.spawn(["blade", "swift", "gunner", "blade", "brute"][Math.floor(Math.random() * 5)]);
        const p = g.player; let tgt = null, bd = 1e9;
        for (const e of g.enemies) if (e.targetable) { const d = Math.abs(e.x - p.x); if (d < bd) { bd = d; tgt = e; } }
        inp.keys.delete("KeyA"); inp.keys.delete("KeyD");
        if (tgt && Math.abs(tgt.x - p.x) > 60) inp.keys.add(tgt.x > p.x ? "KeyD" : "KeyA");
        for (const e of g.enemies) if (e.state === "windup" && e.windDur - e.windT < 0.12 && Math.abs(e.x - p.x) < 150) { inp.push("dodge"); break; }
        if (nextAttack && g.songNow >= nextAttack) { inp.push("attack"); nextAttack = 0; }
        if (g.clock.idx !== lastBeat && !nextAttack) { lastBeat = g.clock.idx; nextAttack = g.clock.nextBeat; }
      }, 16);
    });
  }, diff);
  await page.waitForTimeout(secs * 1000);
  const r = await page.evaluate(() => {
    const M = window.__tfx, g = window.__game;
    let minGap = 99; for (let i = 1; i < M.enters.length; i++) minGap = Math.min(minGap, M.enters[i] - M.enters[i - 1]);
    return { seconds: +M.total.toFixed(1), slowShare: Math.round(100 * M.slow / M.total) + "%", slowEntersPerMin: +(M.enters.length / M.total * 60).toFixed(1), minGapSec: +minGap.toFixed(2), hitstopMsPerSec: Math.round(1000 * M.stop / M.total), kills: g.combat.kills, takedowns: g.combat.takedowns };
  });
  console.log(JSON.stringify(r));
  await browser.close();
  console.log(errors.length ? "ERRORS: " + errors.join("; ") : "no errors");
})();
