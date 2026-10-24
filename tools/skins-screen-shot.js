// Скриншоты экрана «Облик» (800×380 и 1100×560, разные категории) + кадры боя с несколькими скинами.
// node tools/skins-screen-shot.js [outDir]
const { chromium } = require(process.env.PW || "playwright");
const path = require("path"), fs = require("fs");
const out = process.argv[2] || path.join(__dirname, "../.shots");
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const errors = [];
  for (const [w, h] of [[800, 380], [1100, 560]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto("file://" + path.join(__dirname, "../index.html"));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__game.loadDemo());
    await page.evaluate(() => window.__game.ui.show("skins"));
    await page.waitForTimeout(250);
    for (const cat of ["classic", "all", "scifi"]) {
      await page.click(`#skin-cats button[data-cat="${cat}"]`);
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${out}/skins-ui-${w}x${h}-${cat}.png` });
    }
    // выбор скина кликом
    await page.click(`#skin-cats button[data-cat="horror"]`);
    await page.click(`.skin[data-id="vampire"]`);
    const chosen = await page.evaluate(() => window.__game.settings.v.skin + "/" + window.__game.player.skinId);
    console.log(w + "x" + h, "выбран:", chosen);
    // экран не шире окна (нет горизонтальной прокрутки)
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(w + "x" + h, "горизонтальный перелёт:", over);
    await page.close();
  }
  // бой: три скина подряд
  const page = await browser.newPage({ viewport: { width: 1100, height: 560 } });
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__game.settings.set("difficulty", "easy"); });
  await page.evaluate(() => window.__game.startBattle("waves"));
  await page.waitForTimeout(500);
  const ids = ["corsair", "knight", "wizard", "oni", "astronaut", "cat"];
  for (const id of ids) {
    await page.evaluate(id => {
      const g = window.__game; g.settings.set("skin", id); g.player.setSkin(id);
      g.enemies = [];
      for (const k of ["blade", "gunner", "brute"]) { const e = g.waves.spawn(k); e.x = g.player.x + 110 + g.enemies.length * 90; }
      g.waves.queue = []; g.waves.between = 99;
    }, id);
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => { const g = window.__game; g.input.keys.add("KeyD"); });
      await page.waitForTimeout(160);
      await page.keyboard.press("KeyJ");
    }
    await page.evaluate(() => window.__game.input.keys.delete("KeyD"));
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${out}/skins-battle-${id}.png` });
  }
  console.log(errors.length ? "ОШИБКИ:\n" + errors.join("\n") : "без ошибок");
  await browser.close();
})();
