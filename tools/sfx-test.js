// Проверка встроенных звуков: декодирование всех сэмплов и вызов каждого звука в обоих режимах.
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message)); page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  const r = await page.evaluate(async () => {
    const g = window.__game; g.audio.unlock();
    const sfx = g.audio.sfx;
    const t0 = performance.now();
    while (Object.keys(sfx.samples).length < 25 && performance.now() - t0 < 8000) await new Promise(r => setTimeout(r, 100));
    const loaded = Object.fromEntries(Object.entries(sfx.samples).map(([k, v]) => [k, v.length]));
    const names = ["draw", "dash", "slash", "hit", "shot", "bulletHit", "enemyShot", "telegraph", "enemySwing", "jump", "land", "step", "hurt", "dodge", "spawn", "death", "slam", "perfect", "combo", "slowmo", "waveStart", "heal", "uiMove", "uiClick", "uiBack", "victory", "defeat"];
    const out = {};
    for (const mode of ["samples", "synth"]) {
      g.settings.v.sfxStyle = mode;
      let ok = 0;
      for (const n of names) { sfx._last = {}; sfx[n](1.3, true); ok++; await new Promise(r => setTimeout(r, 30)); }
      out[mode] = ok;
    }
    g.settings.v.sfxStyle = "samples";
    await new Promise(r => setTimeout(r, 1500));
    return { decodeMs: Math.round(performance.now() - t0), events: Object.keys(loaded).length, files: Object.values(loaded).reduce((a, b) => a + b, 0), calls: out, voicesLeft: sfx.voices };
  });
  console.log(JSON.stringify(r));
  await browser.close();
  console.log(errors.length ? "ERRORS: " + errors.join("; ") : "no errors");
})();
