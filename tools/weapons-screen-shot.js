// Скриншоты экрана «Арсенал» (800×380 и 1100×560, обе вкладки) + главное меню 800×380 + кадры боя с оружием.
// node tools/weapons-screen-shot.js [outDir]
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
    if (w === 800) await page.screenshot({ path: `${out}/arsenal-menu-${w}x${h}.png` });
    await page.click('.menu-item[data-go="arsenal"]');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/arsenal-${w}x${h}-melee.png` });
    await page.click('.wpn[data-id="glaive"]');
    await page.click('#wpn-tabs button[data-slot="gun"]');
    await page.waitForTimeout(150);
    await page.click('.wpn[data-id="sawed"]');
    await page.screenshot({ path: `${out}/arsenal-${w}x${h}-gun.png` });
    const st = await page.evaluate(() => [window.__game.settings.v.meleeWeapon, window.__game.settings.v.gunWeapon,
      [...document.querySelectorAll('.wpn[aria-pressed="true"]')].map(b => b.dataset.id).join(",")]);
    console.log(w + "x" + h, "выбрано:", st.join(" | "));
    console.log(w + "x" + h, "горизонтальный перелёт:", await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
    await page.close();
  }
  // бой: по несколько кадров с оружием
  const page = await browser.newPage({ viewport: { width: 1100, height: 560 } });
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  await page.evaluate(() => { const g = window.__game; g.settings.set("difficulty", "easy"); });
  for (const [m, gn] of [["spear", "sawed"], ["kusari", "smg"], ["katana", "rail"], ["axe", "revolver"]]) {
    await page.evaluate(([m, gn]) => { const g = window.__game; g.settings.set("meleeWeapon", m); g.settings.set("gunWeapon", gn); g.startBattle("waves"); }, [m, gn]);
    await page.waitForFunction(() => window.__game.state === "battle", null, { timeout: 60000 });
    await page.evaluate(() => {
      const g = window.__game; g.enemies = [];
      for (const k of ["blade", "gunner", "brute"]) { const e = g.waves.spawn(k); e.x = g.player.x + 90 + g.enemies.length * 80; e.attackCD = 99; }
      g.waves.queue = []; g.waves.between = 99;
    });
    for (let i = 0; i < 3; i++) { await page.waitForTimeout(250); await page.keyboard.press("KeyJ"); await page.waitForTimeout(60); await page.screenshot({ path: `${out}/weapons-battle-${m}-${i}.png` }); }
    await page.evaluate(() => { const g = window.__game; g.toMenu(); });
  }
  console.log(errors.length ? "ОШИБКИ:\n" + errors.join("\n") : "без ошибок");
  await browser.close();
})();
