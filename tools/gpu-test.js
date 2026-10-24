// Восстановление после сброса GPU: фон (внеэкранные тайлы) должен перерисоваться. node tools/gpu-test.js [outDir]
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
const out = process.argv[2] || path.join(__dirname, "../.shots");
require("fs").mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 560 } });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__game.settings.set("quality", "low"); window.__game.startBattle("waves"); });
  await page.waitForFunction(() => window.__game.state === "battle", null, { timeout: 60000 });
  if (process.env.THEME) await page.evaluate(t => window.__game.arena.setTheme(t), process.env.THEME);   // арена по id: THEME=orbit node tools/gpu-test.js
  await page.waitForTimeout(500);
  // сколько непрозрачных пикселей в тайлах фона (0 — фон стёрт)
  const filled = () => page.evaluate(() => window.__game.arena.tiles.map(t => {
    const c = t.cv.getContext("2d"), d = c.getImageData(0, 0, t.cv.width, t.cv.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 64) if (d[i] > 0) n++; return n;
  }).reduce((a, b) => a + b, 0));
  const res = {};
  res.initial = await filled();
  const wipe = () => page.evaluate(() => { for (const t of window.__game.arena.tiles) t.cv.width = t.cv.width; });
  // 1) событие сброса основного холста
  await wipe();
  await page.evaluate(() => window.__game.canvas.dispatchEvent(new Event("contextlost")));
  await page.waitForTimeout(300);
  res.skippedWhileLost = await page.evaluate(() => window.__game.gpuLost);
  await page.evaluate(() => window.__game.canvas.dispatchEvent(new Event("contextrestored")));
  await page.waitForTimeout(300);
  res.afterMainRestore = await filled();
  // 2) событие восстановления на холсте фона
  await wipe();
  await page.evaluate(() => window.__game.arena.tiles[0].cv.dispatchEvent(new Event("contextrestored")));
  await page.waitForTimeout(300);
  res.afterTileRestore = await filled();
  // 3) событий нет, потерю видит только периодическая проверка isContextLost
  await wipe();
  await page.evaluate(() => { const c = window.__game.arena.tiles[0].ctx; c.isContextLost = () => true; });
  await page.waitForTimeout(900);
  res.afterPeriodicCheck = await filled();
  res.gpuResets = await page.evaluate(() => window.__game.gpuResets);
  await page.screenshot({ path: out + "/gpu-recovered.png" });
  console.log(JSON.stringify(res));
  const ok = res.initial > 0 && [res.afterMainRestore, res.afterTileRestore, res.afterPeriodicCheck].every(v => v >= res.initial * 0.9) && res.skippedWhileLost;
  console.log(ok ? "background recovers after GPU reset: OK" : "FAIL");
  await browser.close();
  console.log(errors.length ? "ERRORS: " + errors.join("; ") : "no errors");
})();
