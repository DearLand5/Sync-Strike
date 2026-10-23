// Проверка экранов, арен, врагов и режимов: node tools/screens-test.js [outDir]
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
const out = process.argv[2] || path.join(__dirname, "../.shots");
require("fs").mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1100, height: 560 } });
  page.on("pageerror", e => errors.push("pageerror: " + e.message + "\n" + e.stack));
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text()); });
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__game.loadDemo());
  // экраны
  for (const s of ["music", "settings", "skins", "sync", "tutorial", "mode"]) {
    await page.evaluate(n => window.__game.ui.show(n), s);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/s-${s}.png` });
  }
  // редактор раскладки
  await page.evaluate(() => window.__game.openEditor());
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/s-editor.png` });
  await page.evaluate(() => window.__game.closeEditor());
  // все арены в бою с разными врагами
  await page.evaluate(() => window.__game.startBattle("waves"));
  await page.waitForTimeout(300);
  const themes = await page.evaluate(() => THEMES_IDS);
  for (const id of themes) {
    await page.evaluate(id => {
      const g = window.__game;
      g.arena.setTheme(id);
      g.enemies = [];
      for (const k of ["blade", "gunner", "swift", "brute"]) { const e = g.waves.spawn(k); e.x = 450 + g.enemies.length * 120; }
      g.waves.queue = []; g.waves.between = 99;
    }, id);
    // автоатака в долю 3 секунды
    for (let i = 0; i < 6; i++) {
      const t = await page.evaluate(() => { const g = window.__game; return g.clock.nextBeat - g.songNow; });
      await page.waitForTimeout(Math.max(0, t * 1000));
      await page.keyboard.press("KeyJ");
    }
    await page.screenshot({ path: `${out}/a-${id}.png` });
  }
  // пауза/продолжение
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  const paused = await page.evaluate(() => [window.__game.state, window.__game.audio.playing]);
  await page.click("#ps-resume"); await page.waitForTimeout(200);
  const resumed = await page.evaluate(() => [window.__game.state, window.__game.audio.playing]);
  console.log("pause:", paused, "resume:", resumed);
  // победа → экран итогов → ещё раз
  await page.evaluate(() => window.__game.onVictory());
  await page.waitForTimeout(3200);
  await page.screenshot({ path: `${out}/s-results.png` });
  const res = await page.evaluate(() => window.__game.state);
  await page.click("#res-again"); await page.waitForTimeout(500);
  const again = await page.evaluate(() => [window.__game.state, window.__game.enemies.length, window.__game.combat.score]);
  console.log("results:", res, "again:", again);
  // режим «до конца трека»: перематываем к концу
  await page.evaluate(() => window.__game.startBattle("track"));
  await page.waitForTimeout(400);
  await page.evaluate(() => { const g = window.__game; g.player.iframes = 999; g.audio.seek(g.audio.duration - 3); });
  await page.waitForTimeout(6500);
  console.log("track end:", await page.evaluate(() => [window.__game.state, window.__game.endWin]));
  // практика
  await page.evaluate(() => window.__game.startBattle("practice"));
  await page.waitForTimeout(400);
  await page.keyboard.down("KeyD"); await page.waitForTimeout(1600); await page.keyboard.up("KeyD");
  await page.keyboard.press("Space"); await page.waitForTimeout(150); await page.keyboard.press("Space");
  await page.waitForTimeout(900);
  console.log("practice step:", await page.evaluate(() => [window.__game.waves.step, window.__game.waves.practiceText]));
  await page.screenshot({ path: `${out}/s-practice.png` });
  // поражение
  await page.evaluate(() => window.__game.startBattle("waves"));
  await page.evaluate(() => { const g = window.__game; g.player.hp = 1; g.player.hurt(5, 0, g); });
  await page.waitForTimeout(2800);
  console.log("defeat:", await page.evaluate(() => [window.__game.state, document.getElementById("res-title").textContent]));
  await browser.close();
  console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no errors");
})();
