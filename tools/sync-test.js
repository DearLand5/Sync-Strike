// Автоподстройка задержки: эмулируем игрока со стабильным смещением относительно долей.
// Запуск: PW=$(npm root -g)/playwright node tools/sync-test.js [секунд на сценарий, по умолчанию 60]
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
const SEC = +process.argv[2] || 60;
(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on("pageerror", e => errors.push(e.message + "\n" + e.stack));
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__game.loadDemo());

  // сценарий: смещение игрока off (мс), равномерный разброс ±noise (мс), старт latencyMs, автоподстройка on/off
  async function run(name, off, noise, lat0, auto) {
    await page.evaluate(([off, noise, lat0, auto]) => {
      const g = window.__game;
      g.settings.v.latencyMs = lat0; g.settings.v.autoSync = auto; g.settings.v.assist = true;
      window.__sim = { off, noise, pressed: -1, log: [], lat: [], t0: performance.now(), n: 0 };
    }, [off, noise, lat0, auto]);
    await page.evaluate(() => window.__game.startBattle("practice"));
    await page.waitForFunction(() => window.__game.state === "battle", null, { timeout: 60000 });
    await page.evaluate(() => {
      const g = window.__game, s = window.__sim;
      s.timer = setInterval(() => {
        if (g.state !== "battle") return;
        g.player.hp = g.player.maxHp; g.enemies.forEach(e => (e.hp = 1e6));
        const beats = g.clock.map.beats, H = g.audio.heardPosition();
        // следующая доля: «человек» нажимает через off + шум после неё (по слышимому времени)
        const k = s.pressed + 1;
        if (k >= beats.length) return;
        if (s.nzk !== k) { s.nzk = k; s.nz = (Math.random() * 2 - 1) * s.noise / 1000; }
        if (H >= beats[k] + s.off / 1000 + s.nz) {
          s.pressed = k; s.n++;
          g.combat.onAttackPress(H - g.settings.v.latencyMs / 1000);
        }
        s.lat.push(g.settings.v.latencyMs);
      }, 10);
    });
    await page.waitForTimeout(SEC * 1000);
    const r = await page.evaluate(() => {
      const g = window.__game, s = window.__sim; clearInterval(s.timer);
      const all = g.sync.all, last = all.slice(-10).sort((a, b) => a - b);
      const med = last.length ? last[last.length >> 1] : NaN;
      const tail = s.lat.slice(-Math.floor(s.lat.length / 3));   // последняя треть боя
      return {
        lat: g.settings.v.latencyMs, med: +med.toFixed(1), n: all.length,
        range: Math.max(...tail) - Math.min(...tail), steps: s.lat.filter((v, i) => i && v !== s.lat[i - 1]).length,
      };
    });
    await page.evaluate(() => { const g = window.__game; g.state = "battle"; g.finishBattle(); });
    console.log(name, JSON.stringify(r));
    return r;
  }

  const fails = [];
  const chk = (c, m) => { if (!c) fails.push(m); };
  let r = await run("A: игрок +60 мс, разброс ±5", 60, 5, 0, true);
  chk(Math.abs(r.lat - 60) <= 16, "A: latencyMs должен сойтись к ≈ +60, получено " + r.lat);
  chk(Math.abs(r.med) < 15, "A: остаточная медиана |delta| < 15 мс, получено " + r.med);
  chk(r.range <= 16, "A: хвост не должен качаться (размах " + r.range + ")");
  r = await run("B: без смещения, разброс ±40", 0, 40, 0, true);
  chk(Math.abs(r.lat) <= 16, "B: latencyMs не должен уходить при разбросе, получено " + r.lat);
  chk(r.range <= 16, "B: не должно качаться (размах " + r.range + ")");
  r = await run("C: игрок -50 мс (раньше), старт +10", -50, 5, 10, true);
  chk(Math.abs(r.lat - (10 - 50)) <= 16, "C: latencyMs должен сойтись к ≈ -40, получено " + r.lat);
  r = await run("D: +60, автоподстройка выключена", 60, 5, 0, false);
  chk(r.lat === 0, "D: при выключенной автоподстройке latencyMs не меняется, получено " + r.lat);
  // итоги боя: подсказка при выключенной автоподстройке и большой ошибке
  const hint = await page.evaluate(() => ({ t: document.getElementById("res-hint").textContent, h: document.getElementById("res-hint").hidden }));
  chk(!hint.h && /Автоподстройк/.test(hint.t), "D: на итогах должна быть подсказка про калибровку");
  console.log("D: подсказка:", hint.t);
  // предел коррекции за бой: смещение +300 (за окном good — нажатия не засчитываются, latencyMs не должен уходить)
  r = await run("E: +300 (вне окна)", 300, 5, 0, true);
  chk(Math.abs(r.lat) <= 120, "E: коррекция за бой ограничена ±120, получено " + r.lat);

  console.log("errors:", errors.length ? errors : "none");
  console.log(fails.length ? "FAIL:\n" + fails.join("\n") : "OK");
  await browser.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
