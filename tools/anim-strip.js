// Раскадровка героя в бою: node tools/anim-strip.js [файл.png] [оружие ближнего] [кадров] [шаг мс]
// Бот бьётся, каждые N мс вырезается область вокруг героя (×2) — лист для проверки анимаций глазами.
const { chromium } = require(process.env.PW || "playwright");
const path = require("path"), fs = require("fs");
const out = process.argv[2] || path.join(__dirname, "../.shots/anim-strip.png");
const melee = process.argv[3] || "dagger", n = +(process.argv[4] || 24), step = +(process.argv[5] || 120);
fs.mkdirSync(path.dirname(out), { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 560 } });
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  await page.evaluate(m => { const g = window.__game; g.settings.v.meleeWeapon = m; g.settings.v.slowmoMode = "off"; g.startBattle("waves"); }, melee);
  await page.waitForFunction(() => window.__game.state === "battle", null, { timeout: 60000 });
  await page.evaluate(() => {
    const g = window.__game, inp = g.input; let lb = -1, k = 0;
    setInterval(() => {
      if (g.state !== "battle") return;
      const p = g.player; p.hp = p.maxHp;
      let t = null, bd = 1e9; for (const e of g.enemies) if (e.targetable) { const d = Math.abs(e.x - p.x); if (d < bd) { bd = d; t = e; } }
      inp.keys.delete("KeyA"); inp.keys.delete("KeyD");
      if (t && Math.abs(t.x - p.x) > 45) inp.keys.add(t.x > p.x ? "KeyD" : "KeyA");
      if (++k % 70 === 0 && p.onGround) inp.push("jump");
      for (const e of g.enemies) if (e.state === "windup" && e.windDur - e.windT < 0.12 && Math.abs(e.x - p.x) < 150) { inp.push("dodge"); break; }
      if (g.clock.nextBeat - g.songNow < 0.03 && g.clock.idx !== lb) { lb = g.clock.idx; inp.push("attack"); }
    }, 16);
  });
  await page.waitForTimeout(4000);
  const shots = [];
  for (let i = 0; i < n; i++) {
    const r = await page.evaluate(() => { const g = window.__game, p = g.player, v = g._v; return { x: v.playerX, y: v.floorY - (0 - p.y) * v.scale, st: p.state + (p.action ? ":" + p.action.name : "") }; });
    const W = 170, H = 150;
    const clip = { x: Math.max(0, Math.min(1100 - W, r.x - W / 2)), y: Math.max(0, Math.min(560 - H, r.y - H + 25)), width: W, height: H };
    shots.push({ b: await page.screenshot({ clip }), st: r.st });
    await page.waitForTimeout(step);
  }
  // склейка в браузере
  const cols = 6;
  const url = await page.evaluate(async ([imgs, cols]) => {
    const W = 170, H = 150, cv = document.createElement("canvas"); cv.width = cols * W; cv.height = Math.ceil(imgs.length / cols) * H;
    const c = cv.getContext("2d");
    for (let i = 0; i < imgs.length; i++) {
      const im = new Image(); im.src = "data:image/png;base64," + imgs[i].b; await im.decode();
      c.drawImage(im, (i % cols) * W, Math.floor(i / cols) * H);
      c.fillStyle = "#fff"; c.font = "10px sans-serif"; c.fillText(i + " " + imgs[i].st, (i % cols) * W + 3, Math.floor(i / cols) * H + 11);
    }
    return cv.toDataURL("image/png");
  }, [shots.map(s => ({ b: s.b.toString("base64"), st: s.st })), cols]);
  fs.writeFileSync(out, Buffer.from(url.split(",")[1], "base64"));
  console.log("->", out);
  await browser.close();
})();
