// Проверка добиваний, вариантов атак/уклонов, частей трека и поворота экрана: node tools/features-test.js [outDir]
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
const out = process.argv[2] || path.join(__dirname, "../.shots");
require("fs").mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1100, height: 560 } });
  page.on("pageerror", e => errors.push(e.message + "\n" + e.stack));
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__game.startBattle("waves"));
  await page.waitForFunction(() => window.__game.state === "battle", null, { timeout: 60000 });
  console.log("hp:", await page.evaluate(() => [window.__game.player.maxHp, ...["easy", "normal", "hard"].map(d => Math.round(130 * DIFFS_REF[d].playerHp))]));
  // добивания всех видов
  for (const [kind, atk] of [["blade", "slash1"], ["gunner", "shot"], ["swift", "rise"], ["brute", "slash1"]]) {
    const r = await page.evaluate(async ([kind, atk]) => {
      const g = window.__game; g.waves.queue = []; g.waves.between = 999; g.enemies = []; g.combat.lastTdT = -9;
      g.player.reset(600); g.player.hp = 100;
      const e = g.waves.spawn(kind); e.x = atk === "shot" ? 800 : 630; e.state = "think"; e.hp = 1;
      const act = { def: ATTACKS_REF[atk], name: atk, judge: { rating: "perfect", strong: true }, power: 1, hit: new Set() };
      g.combat._applyHit(e, act, 1, e.x, e.centerY);
      const kindTd = g.combat.td && g.combat.td.kind;
      await new Promise(r => setTimeout(r, 700));
      return { kind, td: kindTd, lb: +g.letterbox.toFixed(2), zoom: +g.camera.zoom.toFixed(2) };
    }, [kind, atk]);
    await page.screenshot({ path: `${out}/td-${r.td}.png` });
    await page.waitForTimeout(1600);
    const after = await page.evaluate(() => [window.__game.combat.td, window.__game.player.state, window.__game.enemies.filter(e => e.alive).length, window.__game.combat.takedowns]);
    console.log("takedown", JSON.stringify(r), "after:", JSON.stringify(after.slice(1)), after[0] ? "STUCK" : "ok");
  }
  // уклоны
  for (const [mx, air] of [[1, false], [0, false], [1, true]]) {
    const t = await page.evaluate(([mx, air]) => {
      const g = window.__game; g.player.reset(600); if (air) { g.player.y = -80; g.player.onGround = false; }
      g.input.moveX = mx; g.input.poll = () => {}; g.input.moveX = mx;
      g.player.tryDodge(g); return g.player.dodgeType;
    }, [mx, air]);
    await page.waitForTimeout(110);
    await page.screenshot({ path: `${out}/dodge-${t}.png` });
    console.log("dodge:", t);
    await page.waitForTimeout(400);
  }
  // части трека и дроп
  await page.evaluate(() => { const g = window.__game; delete g.input.poll; g.audio.seek(7.0); });
  await page.waitForTimeout(3000);
  console.log("section:", await page.evaluate(() => [window.__game.clock.kind, window.__game.sectionTitle, window.__game.arena.kw.drop.toFixed(2)]));
  await page.screenshot({ path: `${out}/sec-drop.png` });
  await page.evaluate(() => window.__game.audio.seek(57.5));
  await page.waitForTimeout(3500);
  console.log("section:", await page.evaluate(() => [window.__game.clock.kind, window.__game.sectionTitle, window.__game.arena.kw.break.toFixed(2)]));
  await page.screenshot({ path: `${out}/sec-break.png` });
  // портретный телефон → интерфейс в горизонтали
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const m = await ctx2.newPage();
  m.on("pageerror", e => errors.push("mobile: " + e.message));
  await m.goto("file://" + path.join(__dirname, "../index.html"));
  await m.waitForTimeout(500);
  console.log("portrait:", await m.evaluate(() => [window.__game.input.rotated, window.__game.cssW, window.__game.cssH]));
  await m.screenshot({ path: `${out}/portrait-menu.png` });
  await m.evaluate(() => window.__game.startBattle("waves"));
  await m.waitForFunction(() => window.__game.state === "battle", null, { timeout: 60000 });
  await m.evaluate(() => { window.__game.input.usingTouch = true; });
  await m.waitForTimeout(1500);
  // касание кнопки атаки: её координаты в повёрнутой системе → экранные
  const btn = await m.evaluate(() => { const b = window.__game.input.touch.btn.attack; return { x: window.innerWidth - b.y, y: b.x }; });
  const before = await m.evaluate(() => Object.values(window.__game.combat.ratings).reduce((a, b) => a + b, 0));
  await m.touchscreen.tap(btn.x, btn.y);
  await m.waitForTimeout(300);
  const after = await m.evaluate(() => Object.values(window.__game.combat.ratings).reduce((a, b) => a + b, 0));
  console.log("rotated attack tap registered:", after > before);
  await m.screenshot({ path: `${out}/portrait-battle.png` });
  await browser.close();
  console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no errors");
})();
