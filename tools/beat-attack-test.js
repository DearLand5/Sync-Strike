// Атаки врагов строго на долю: node tools/beat-attack-test.js [секунд на темп=30] [сложность=normal]
// Собирает моменты ударов врагов (game.strikeLog из Enemy._windup), меряет расстояние до ближайшей доли
// (цель: медиана < 10 мс, 95% < 25 мс вне замедлений) и число долей замаха по типам врагов и темпам.
// Темп демо-трека 116 BPM; остальные темпы — подменой карты долей в clock (музыка играет как есть).
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
const secs = +(process.argv[2] || 24);
const diff = process.argv[3] || "normal";
const TEMPOS = [116, 70, 160, 200];
(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message + "\n" + e.stack));
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  await page.evaluate(async d => {
    const g = window.__game;
    await g.loadDemo();
    g.settings.set("difficulty", d);
    await g.startBattle("waves");
    g.strikeLog = [];
    // игрок бессмертен и стоит на месте: враги атакуют сколько угодно
    setInterval(() => { const p = g.player; if (g.state === "battle" && p.alive) { p.hp = p.maxHp; } }, 100);
    // по одному врагу каждого типа всегда на арене (волна 1 даёт только клинков)
    setInterval(() => {
      if (g.state !== "battle") return;
      for (const k of ["blade", "gunner", "swift", "brute"]) if (!g.enemies.some(e => e.alive && e.kind === k)) g.waves.spawn(k);
    }, 1000);
  }, diff);
  await page.waitForFunction(() => window.__game.state === "battle", null, { timeout: 60000 });
  const med = a => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN;
  const q = (a, f) => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * f))] : NaN;
  const result = {};
  let bad = 0;
  for (const bpm of TEMPOS) {
    await page.evaluate(bpm => {
      const g = window.__game, c = g.clock, P = 60 / bpm;
      if (!window.__map0) window.__map0 = c.map;
      const m0 = window.__map0, n = Math.floor(900 / P);
      const beats = new Float64Array(n);
      for (let i = 0; i < n; i++) beats[i] = i * P;
      const strong = new Uint8Array(n), strength = new Float32Array(n);
      for (let i = 0; i < n; i++) { strong[i] = i % 4 === 0 ? 1 : 0; strength[i] = strong[i] ? 1 : 0.5; }
      if (bpm !== 116) c.map = Object.assign({}, m0, { beats, strong, strength, period: P });
      else c.map = m0;
      c.reset(g.songNow);
      g.strikeLog.length = 0;
    }, bpm);
    await page.waitForTimeout(3000);                 // переходный период: удары, назначенные по старой карте
    await page.evaluate(() => { window.__game.strikeLog.length = 0; });
    await page.waitForTimeout(secs * 1000);
    const log = await page.evaluate(() => {
      const g = window.__game, c = g.clock, b = c.map.beats, corr = c.correction;
      return g.strikeLog.map(s => {
        // расстояние до ближайшей доли (по карте с поправкой)
        let lo = 0, hi = b.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (b[mid] + corr <= s.t) lo = mid; else hi = mid; }
        const d = Math.min(Math.abs(s.t - (b[lo] + corr)), Math.abs(b[hi] + corr - s.t));
        return { kind: s.kind, d: d * 1000, beats: s.beats, dur: s.dur, slow: s.ts < 0.95 };
      });
    });
    const fast = log.filter(s => !s.slow), ds = fast.map(s => s.d);
    const kinds = {};
    for (const s of fast) { const k = kinds[s.kind] || (kinds[s.kind] = { n: 0, beats: {}, dur: 0 }); k.n++; k.beats[s.beats] = (k.beats[s.beats] || 0) + 1; k.dur += s.dur; }
    for (const k of Object.values(kinds)) k.dur = +(k.dur / k.n).toFixed(2);
    result[bpm] = { strikes: log.length, slowSkipped: log.length - fast.length, medMs: +med(ds).toFixed(1), p95Ms: +q(ds, 0.95).toFixed(1), maxMs: +Math.max(...ds, 0).toFixed(1), kinds };
    if (bpm === 116 && fast.length >= 5 && (med(ds) >= 10 || q(ds, 0.95) >= 25)) bad++;
    if (fast.length < 3) bad++;
  }
  console.log("сложность", diff);
  for (const bpm of TEMPOS) console.log(bpm + " BPM", JSON.stringify(result[bpm]));
  await browser.close();
  console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no errors");
  console.log(bad ? "FAIL: " + bad : "OK");
  process.exit(errors.length || bad ? 1 : 0);
})();
