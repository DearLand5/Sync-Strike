// Профиль длинного боя: длинные кадры, перестройки тайлов, рост памяти. node tools/perf-test.js [seconds]
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
const secs = +(process.argv[2] || 60);
const skin = process.env.SKIN || "";   // SKIN=oni — прогон с другим скином
(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--enable-precise-memory-info", "--js-flags=--expose-gc"] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 560 } });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  await page.evaluate((skin) => {
    const g = window.__game, A = g.arena;
    window.__perf = { rebuilds: 0, frames: [], gradients: 0 };
    const orig = A.ensureTiles.bind(A);
    A.ensureTiles = (v, dpr) => { const k = A.key; orig(v, dpr); if (A.key !== k) window.__perf.rebuilds++; };
    const cg = CanvasRenderingContext2D.prototype.createRadialGradient, lg = CanvasRenderingContext2D.prototype.createLinearGradient;
    CanvasRenderingContext2D.prototype.createRadialGradient = function () { window.__perf.gradients++; return cg.apply(this, arguments); };
    CanvasRenderingContext2D.prototype.createLinearGradient = function () { window.__perf.gradients++; return lg.apply(this, arguments); };
    let last = performance.now();
    const tick = now => { window.__perf.frames.push(now - last); last = now; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    g.settings.set("difficulty", "easy");
    if (skin) { g.settings.set("skin", skin); g.player.setSkin(skin); }
    g.startBattle("waves").then(() => {
      const inp = g.input; let lastBeat = -1;
      setInterval(() => {
        if (g.state !== "battle") return;
        const p = g.player; let tgt = null, bd = 1e9;
        for (const e of g.enemies) if (e.targetable) { const d = Math.abs(e.x - p.x); if (d < bd) { bd = d; tgt = e; } }
        inp.keys.delete("KeyA"); inp.keys.delete("KeyD");
        if (tgt && Math.abs(tgt.x - p.x) > 60) inp.keys.add(tgt.x > p.x ? "KeyD" : "KeyA");
        if (Math.random() < 0.01) inp.push("jump");
        for (const e of g.enemies) if (e.state === "windup" && e.windDur - e.windT < 0.12 && Math.abs(e.x - p.x) < 150) { inp.push("dodge"); break; }
        const toBeat = g.clock.nextBeat - g.songNow;
        if (toBeat < 0.03 && g.clock.idx !== lastBeat) { lastBeat = g.clock.idx; inp.push("attack"); }
      }, 16);
    });
  }, skin);
  const t0 = Date.now();
  while (Date.now() - t0 < secs * 1000) {
    await page.waitForTimeout(10000);
    const s = await page.evaluate(() => {
      const P = window.__perf, f = P.frames; P.frames = [];
      const long = f.filter(x => x > 50).length, worst = Math.max(...f);
      const r = { fps: Math.round(1000 * f.length / f.reduce((a, b) => a + b, 0)), long50: long, worst: Math.round(worst), tileRebuilds: P.rebuilds, gradPerFrame: Math.round(P.gradients / f.length), heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1, rgbaCache: 0, particles: window.__game.fx.count, enemies: window.__game.enemies.length, proj: window.__game.combat.projectiles.length };
      P.rebuilds = 0; P.gradients = 0; return r;
    });
    console.log(JSON.stringify(s));
  }
  await browser.close();
  console.log(errors.length ? "ERRORS: " + errors.join("; ") : "no errors");
})();
