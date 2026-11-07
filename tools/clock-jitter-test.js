// Дрожание аудиочасов в бою: node tools/clock-jitter-test.js
// Имитирует «рваные» часы Android: getOutputTimestamp отдаёт contextTime, обновляемый блоками по 1024 сэмпла (~23 мс),
// с performanceTime = момент вызова (так ведут себя часть WebView). Печатает разброс songTime относительно ровной
// прямой (мс) и разброс шага кадра — для сырых часов (как без сглаживания) и для сглаженных (heardPosition).
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 560 } });
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__game.startBattle("practice"));
  await page.waitForFunction(() => window.__game.state === "battle", null, { timeout: 60000 });
  await page.waitForTimeout(800);
  let bad = 0;
  for (const coarse of [false, true]) {
    const r = await page.evaluate(async coarse => {
      const g = window.__game, a = g.audio, c = a.ctx;
      if (coarse) {
        const block = 1024 / c.sampleRate;
        c.getOutputTimestamp = () => ({ contextTime: Math.floor(c.currentTime / block) * block, performanceTime: performance.now() });
      }
      const xs = [];
      for (let i = 0; i < 360; i++) {
        await new Promise(r => requestAnimationFrame(r));
        const ts = c.getOutputTimestamp();
        const raw = a.startOffset + (ts.contextTime + (performance.now() - ts.performanceTime) / 1000 - a.startCtx);
        xs.push([performance.now() / 1000, a.heardPosition(), raw]);
      }
      xs.splice(0, 40);   // первые кадры после подмены часов — переходный процесс подстройки
      const fit = k => {
        const n = xs.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (const p of xs) { sx += p[0]; sy += p[k]; sxx += p[0] * p[0]; sxy += p[0] * p[k]; }
        const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a0 = (sy - b * sx) / n;
        const res = xs.map(p => (p[k] - (a0 + b * p[0])) * 1000);
        const st = []; for (let i = 1; i < n; i++) st.push(((xs[i][k] - xs[i - 1][k]) - (xs[i][0] - xs[i - 1][0])) * 1000);
        const sd = v => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
        return { sd: +sd(res).toFixed(2), max: +Math.max(...res.map(Math.abs)).toFixed(1), step: +sd(st).toFixed(2) };
      };
      return { raw: fit(2), smooth: fit(1) };
    }, coarse);
    console.log(`${coarse ? "рваные часы (Android)" : "обычные часы"}: сырые — разброс ${r.raw.sd} мс (макс ${r.raw.max}), шаг кадра ${r.raw.step} мс; сглаженные — разброс ${r.smooth.sd} мс (макс ${r.smooth.max}), шаг кадра ${r.smooth.step} мс`);
    if (r.smooth.sd > Math.max(1.5, r.raw.sd * 0.6) && coarse) { console.log("  !! сглаживание не помогает"); bad++; }
    if (r.smooth.max > 12) { console.log("  !! сглаженные часы уходят от ровной прямой"); bad++; }
  }
  await browser.close();
  console.log(bad ? `ПРОБЛЕМ: ${bad}` : "всё в норме");
  process.exit(bad ? 1 : 0);
})();
