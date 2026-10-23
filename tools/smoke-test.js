// Дымовой тест в headless Chromium: node tools/smoke-test.js [outDir]
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
const out = process.argv[2] || path.join(__dirname, "../.shots");
require("fs").mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(800);
  await page.screenshot({ path: out + "/01-menu.png" });
  await page.click("text=Загрузить музыку");
  await page.click("#btn-demo");
  await page.waitForFunction(() => window.__game.track && !window.__game.loading, null, { timeout: 60000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: out + "/02-music.png" });
  const info = await page.evaluate(() => { const m = window.__game.track.map; return { bpm: m.bpm, mode: m.mode, conf: m.confidence, ms: m.ms, theme: window.__game.arena.theme.id }; });
  console.log("demo map:", JSON.stringify(info));
  await page.click("#music-fight");
  await page.click("#btn-start");
  await page.waitForTimeout(1500);
  // бой: двигаемся, атакуем в ритм, прыгаем
  const kb = page.keyboard;
  for (let i = 0; i < 40; i++) {
    const t = await page.evaluate(() => { const g = window.__game; return g.clock.nextBeat - g.songNow; });
    await page.waitForTimeout(Math.max(0, t * 1000 - 10));
    if (i % 7 === 3) { await kb.down("KeyD"); await page.waitForTimeout(200); await kb.up("KeyD"); }
    if (i % 9 === 5) await kb.press("Space");
    if (i % 11 === 8) await kb.press("KeyK");
    await kb.press("KeyJ");
    if (i === 20) await page.screenshot({ path: out + "/03-battle.png" });
  }
  const st = await page.evaluate(() => { const g = window.__game, c = g.combat; return { state: g.state, hp: g.player.hp, score: c.score, kills: c.kills, ratings: c.ratings, enemies: g.enemies.length, wave: g.waves.wave, fps: Math.round(g.fps), song: g.songNow.toFixed(2) }; });
  console.log("battle:", JSON.stringify(st));
  await page.screenshot({ path: out + "/04-battle2.png" });
  await kb.press("Escape");
  await page.waitForTimeout(300);
  await page.screenshot({ path: out + "/05-pause.png" });
  // мобильный вид с сенсорными кнопками
  const ctx2 = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const m = await ctx2.newPage();
  m.on("pageerror", e => errors.push("mobile pageerror: " + e.message));
  await m.goto("file://" + path.join(__dirname, "../index.html"));
  await m.waitForTimeout(500);
  await m.screenshot({ path: out + "/06-mobile-menu.png" });
  await m.tap("text=В бой");
  await m.tap("#btn-start");
  await m.waitForFunction(() => window.__game.state === "battle", null, { timeout: 60000 });
  await m.evaluate(() => { window.__game.input.usingTouch = true; });
  await m.waitForTimeout(2500);
  await m.touchscreen.tap(760, 300);
  await m.waitForTimeout(400);
  await m.screenshot({ path: out + "/07-mobile-battle.png" });
  await browser.close();
  console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no errors");
})();
