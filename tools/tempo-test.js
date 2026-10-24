// Темп трека (растяжение времени), правка долей, сохранение: node tools/tempo-test.js [outDir]
// Демо-трек и синтезированный WAV (через <input type=file>, как в library-test).
const { chromium } = require(process.env.PW || "playwright");
const path = require("path"), fs = require("fs"), os = require("os");
const out = process.argv[2] || path.join(__dirname, "../.shots");
fs.mkdirSync(out, { recursive: true });

function wav(seconds, bpm) {
  const sr = 22050, n = Math.round(seconds * sr), data = Buffer.alloc(44 + n * 2);
  data.write("RIFF", 0); data.writeUInt32LE(36 + n * 2, 4); data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(sr, 24); data.writeUInt32LE(sr * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write("data", 36); data.writeUInt32LE(n * 2, 40);
  const per = 60 / bpm;
  for (let i = 0; i < n; i++) {
    const t = i / sr, ph = t % per, k = Math.floor(t / per) % 4;
    let v = ph < 0.12 ? Math.sin(2 * Math.PI * (k === 0 ? 55 : 80) * ph) * Math.exp(-ph * 30) * 0.8 : 0;
    v += Math.sin(2 * Math.PI * 220 * t) * 0.05;
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32000), 44 + i * 2);
  }
  return data;
}

(async () => {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-tempo-"));
  const ctx = await chromium.launchPersistentContext(userDir, { viewport: { width: 1100, height: 560 }, args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  const url = "file://" + path.join(__dirname, "../index.html");
  const fails = [];
  const check = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg); if (!ok) fails.push(msg); };
  const idle = () => page.waitForFunction(() => !window.__game.loading, null, { timeout: 90000 });
  const rateIs = r => page.waitForFunction(r => window.__game.track && Math.abs(window.__game.track.tempo.rate - r) < 1e-6 && !window.__game.loading, r, { timeout: 90000 });
  const info = () => page.evaluate(() => { const t = window.__game.track; return { rate: t.tempo.rate, k: t.tempo.fix.k, bpm: t.map.bpm, dur: t.buffer.duration, baseDur: t.base.buffer.duration, baseBpm: t.base.map.bpm, beats: t.map.beats.length, strong: t.map.strong.reduce((a, b) => a + b, 0), read: document.getElementById("tp-read").textContent, st: document.getElementById("st-bpm").textContent }; });
  // кнопка правки → ждём применения (отложено на 450 мс) и конца обработки
  const press = async sel => { await page.click(sel); await page.waitForTimeout(700); await idle(); };

  await page.goto(url);
  await page.waitForFunction(() => window.__game && window.__game.library.ok !== undefined);
  await page.evaluate(() => window.__game.library.ready);
  await page.evaluate(() => window.__game.ui.show("music"));
  await page.click("#btn-demo");
  await page.waitForFunction(() => window.__game.track && !window.__game.loading, null, { timeout: 60000 });
  const s0 = await info();
  console.log("демо:", JSON.stringify(s0));

  // ---- время обработки 3-минутного трека (стерео 44,1 кГц) ----
  const perf = await page.evaluate(async () => {
    const g = window.__game, T = window.TEMPO_REF, c = g.audio.ensure(), src = g.track.base.buffer;
    const sr = 44100, n = 180 * sr, b = c.createBuffer(2, n, sr);
    const s0 = src.getChannelData(0), s1 = src.numberOfChannels > 1 ? src.getChannelData(1) : s0;
    const L = b.getChannelData(0), R = b.getChannelData(1);
    for (let i = 0; i < n; i++) { const j = Math.floor(i * src.sampleRate / sr) % s0.length; L[i] = s0[j]; R[i] = s1[(j + 40) % s1.length] * 0.9; }
    // отклик интерфейса: самая длинная пауза между тиками таймера
    let last = performance.now(), maxGap = 0;
    const iv = setInterval(() => { const t = performance.now(); maxGap = Math.max(maxGap, t - last); last = t; }, 10);
    const res = {};
    let t0 = performance.now(); let o = await T.stretch(c, b, 1.25, () => {}); res.stretchMs = performance.now() - t0; res.outDur = o.duration;
    res.maxGap = maxGap;
    t0 = performance.now(); o = await T.stretch(c, b, 0.8, () => {}); res.stretchSlowMs = performance.now() - t0;
    t0 = performance.now(); o = await T.resample(c, b, 1.25, () => {}); res.resampleMs = performance.now() - t0;
    clearInterval(iv);
    return res;
  });
  console.log("3 мин стерео 44,1 кГц:", JSON.stringify(perf));
  check(perf.stretchMs < 30000 && Math.abs(perf.outDur - 144) < 0.05, `растяжение 3 мин ×1,25: ${Math.round(perf.stretchMs)} мс, длина ${perf.outDur.toFixed(2)} с; ×0,8: ${Math.round(perf.stretchSlowMs)} мс; передискретизация ${Math.round(perf.resampleMs)} мс`);
  check(perf.maxGap < 250, `интерфейс не зависает: макс. пауза таймера ${Math.round(perf.maxGap)} мс`);

  // ---- темп 125% через интерфейс ----
  for (let i = 0; i < 5; i++) await page.click("#tp-plus");
  check((await page.textContent("#tp-rate-o")) === "125%", "ползунок показывает 125%");
  await page.waitForTimeout(700);
  await rateIs(1.25);
  await page.waitForTimeout(150);
  const s1 = await info();
  console.log("125%:", JSON.stringify(s1));
  check(Math.abs(s1.dur - s0.dur / 1.25) < 0.05, `длительность ${s0.dur.toFixed(2)} → ${s1.dur.toFixed(2)} с (≈ /1,25)`);
  check(Math.abs(s1.bpm - s0.bpm * 1.25) < 0.01 && Math.abs(s1.bpm - 145) < 0.6, `BPM карты ${s1.bpm.toFixed(1)} (≈145), на экране «${s1.st}»`);
  check(/116(\.\d)? → 145(\.\d)? BPM/.test(s1.read), `показ «${s1.read}»`);
  await page.screenshot({ path: `${out}/tempo-1100x560.png` });

  // ---- доли карты против реальных ударов в растянутом звуке ----
  const acc = await page.evaluate(() => {
    const t = window.__game.track;
    const onsets = (buf, beats) => {
      const x = buf.getChannelData(0), sr = buf.sampleRate, w = Math.round(0.004 * sr);
      const env = new Float32Array(x.length);
      let acc = 0;
      for (let i = 0; i < x.length; i++) { acc += Math.abs(x[i]); if (i >= w) acc -= Math.abs(x[i - w]); env[i] = acc / w; }
      const errs = [];
      for (let k = 2; k < beats.length - 2; k++) {
        const b = beats[k]; if (b < 0.2 || b > buf.duration - 0.2) continue;
        // начало удара: первая точка, где огибающая достигает 40% максимума в окне ±70 мс
        const a0 = Math.max(0, Math.round((b - 0.07) * sr)), a1 = Math.min(x.length - 1, Math.round((b + 0.07) * sr));
        let mx = 0; for (let i = a0; i < a1; i++) mx = Math.max(mx, env[i]);
        if (mx < 0.02) continue;
        let on = a0; for (let i = a0; i < a1; i++) if (env[i] >= mx * 0.4) { on = i; break; }
        errs.push(on / sr - b);
      }
      return errs;
    };
    const med = a => { const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
    const eb = onsets(t.base.buffer, t.base.map.beats), es = onsets(t.buffer, t.map.beats);
    const rel = es.map(e => Math.abs(e - med(eb))).sort((a, b) => a - b);     // относительно смещения анализатора на исходном звуке
    return { n: es.length, baseMed: med(eb), stretchMed: med(es), absMedBase: med(eb.map(Math.abs)), absMedStretch: med(es.map(Math.abs)), relMed: med(rel), p90: rel[Math.floor(rel.length * 0.9)] };
  });
  console.log("точность долей:", JSON.stringify(acc));
  check(acc.n > 40 && acc.absMedStretch < 0.015, `медиана |ошибки| доля ↔ удар в растянутом звуке ${(acc.absMedStretch * 1000).toFixed(1)} мс (на исходном ${(acc.absMedBase * 1000).toFixed(1)} мс), n=${acc.n}`);
  check(acc.relMed < 0.015, `медиана расхождения с исходником ${(acc.relMed * 1000).toFixed(1)} мс, p90 ${(acc.p90 * 1000).toFixed(1)} мс`);

  // ---- бой, автосохранение и «Продолжить» с темпом ----
  await page.evaluate(() => window.__game.startBattle("track"));
  await page.waitForTimeout(2600);
  await page.evaluate(() => window.__game.pause());
  const a = await page.evaluate(() => JSON.parse(localStorage.getItem("syncstrike.autosave")));
  check(a && a.tempo && a.tempo.rate === 1.25 && a.songPos > 1.5, `автосохранение хранит темп (${a && JSON.stringify(a.tempo)}, songPos ${a && a.songPos.toFixed(2)})`);
  await page.evaluate(() => window.__game.toMenu());
  await page.evaluate(() => window.__game.applyTempo({ rate: 1, keep: true, fix: { k: 0, half: false, shift: 0 } }));
  await rateIs(1);
  await page.click("#menu-continue");
  await page.waitForFunction(() => window.__game.state === "battle", null, { timeout: 60000 });
  await page.waitForTimeout(500);
  const cont = await page.evaluate(() => { const g = window.__game; return { rate: g.track.tempo.rate, song: g.songNow }; });
  check(cont.rate === 1.25 && Math.abs(cont.song - a.songPos) < 1.5, `«Продолжить» вернул темп 125% и позицию (${cont.song.toFixed(2)} с ≈ ${a.songPos.toFixed(2)} с)`);
  await page.evaluate(() => { const g = window.__game; g.pause(); g.toMenu(); g.ui.show("music"); });
  await page.waitForTimeout(200);

  // ---- ×2 / ÷2 / сдвиги ----
  await press("#fx-x2");
  const s2 = await info();
  check(Math.abs(s2.bpm - s1.bpm * 2) < 0.01 && s2.beats >= s1.beats * 2 - 2, `×2: ${s1.bpm.toFixed(1)} → ${s2.bpm.toFixed(1)} BPM, долей ${s1.beats} → ${s2.beats}, сильных ${s2.strong}`);
  check(Math.abs(s2.strong / s2.beats - 0.25) < 0.02, "после ×2 сильная доля каждая 4-я");
  await press("#fx-reset");
  await press("#fx-d2");
  const s3 = await info();
  check(Math.abs(s3.bpm - s1.bpm / 2) < 0.01 && Math.abs(s3.beats - s1.beats / 2) <= 2, `÷2: ${s3.bpm.toFixed(1)} BPM, долей ${s3.beats}`);
  await press("#fx-reset");
  const b0 = await page.evaluate(() => Array.from(window.__game.track.map.beats.slice(10, 13)));
  await page.click("#fx-half"); await press("#fx-p10");
  const b1 = await page.evaluate(() => Array.from(window.__game.track.map.beats.slice(10, 13)));
  const P = b0[1] - b0[0];
  check(Math.abs((b1[0] - b0[0]) - (P / 2 + 0.01)) < 0.002, `сдвиг ½ доли + 10 мс: ${((b1[0] - b0[0]) * 1000).toFixed(1)} мс (ожидалось ${(P / 2 * 1000 + 10).toFixed(1)})`);
  await press("#fx-reset");
  const b2 = await page.evaluate(() => Array.from(window.__game.track.map.beats.slice(10, 13)));
  check(Math.abs(b2[0] - b0[0]) < 1e-9, "«Сбросить» возвращает сетку");

  // ---- без сохранения тона ----
  await press("#tp-keep");
  const s4 = await info();
  check(Math.abs(s4.dur - s0.dur / 1.25) < 0.05, `без сохранения тона: длительность ${s4.dur.toFixed(2)} с`);
  await page.click("#tp-one"); await page.waitForTimeout(700); await rateIs(1);
  check(Math.abs((await info()).dur - s0.dur) < 0.01, "кнопка 1× вернула исходный темп");

  // ---- библиотека: темп и правка сохраняются, исходный анализ не перезаписан ----
  await page.setInputFiles("#file-input", { name: "Pulse.wav", mimeType: "audio/wav", buffer: wav(24, 120) });
  await page.waitForTimeout(150); await idle();
  const base = await info();
  await page.evaluate(() => window.__game.applyTempo({ rate: 0.8, keep: true, fix: { k: 1, half: false, shift: 20 } }));
  await rateIs(0.8);
  const lib1 = await page.evaluate(async () => { const g = window.__game, id = g.track.meta.libId, rec = await g.library.load(id); return { tempo: g.library.get(id).tempo, baseBpm: rec.map.bpm }; });
  check(lib1.tempo && lib1.tempo.rate === 0.8 && lib1.tempo.fix.k === 1 && Math.abs(lib1.baseBpm - base.baseBpm) < 1e-6, `в meta библиотеки: ${JSON.stringify(lib1.tempo)}; исходный BPM анализа не изменён (${lib1.baseBpm.toFixed(2)})`);
  const before = await info();
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.track && !window.__game.loading, null, { timeout: 60000 });
  await page.waitForTimeout(300);
  const after = await info();
  check(after.rate === 0.8 && after.k === 1 && Math.abs(after.bpm - before.bpm) < 0.01 && Math.abs(after.dur - before.dur) < 0.02, `после перезагрузки темп восстановлен: ${after.bpm.toFixed(1)} BPM (было ${before.bpm.toFixed(1)}), ${after.dur.toFixed(2)} с`);
  await page.evaluate(() => window.__game.ui.show("music"));
  await page.setInputFiles("#file-input", { name: "Pulse.wav", mimeType: "audio/wav", buffer: wav(24, 120) });
  await page.waitForTimeout(150); await idle();
  check((await info()).rate === 0.8, "повторный выбор файла сохраняет темп трека");
  // рекорды раздельны
  await page.evaluate(() => window.__game.startBattle("track"));
  await page.waitForTimeout(600);
  await page.evaluate(() => { const g = window.__game; g.combat.score = 777; g.endWin = true; g.finishBattle(); });
  const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes(".best.")));
  check(keys.some(k => /@80x1\./.test(k)), `рекорд сохранён отдельно для темпа (${keys.join(", ")})`);
  const sub = await page.evaluate(() => document.getElementById("res-sub").textContent);
  check(/темп 80%/.test(sub), `в итогах показан темп («${sub}»)`);

  // ---- скриншоты экрана «Музыка» ----
  await page.evaluate(() => window.__game.ui.show("music"));
  await page.setViewportSize({ width: 800, height: 380 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/tempo-800x380.png` });
  await page.evaluate(() => document.getElementById("tempo-card").scrollIntoView());
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}/tempo-800x380-card.png` });
  const ov = await page.evaluate(() => { const r = document.getElementById("tempo-card").getBoundingClientRect(); return { right: r.right, w: innerWidth, sw: document.getElementById("scr-music").scrollWidth }; });
  check(ov.right <= ov.w + 1 && ov.sw <= ov.w + 1, `карточка темпа не вылезает по ширине (${JSON.stringify(ov)})`);
  await page.setViewportSize({ width: 1100, height: 560 });
  await page.waitForTimeout(200);
  await page.evaluate(() => document.getElementById("tempo-card").scrollIntoView());
  await page.screenshot({ path: `${out}/tempo-1100x560-card.png` });

  check(errors.length === 0, "ошибок в консоли нет" + (errors.length ? ":\n" + errors.join("\n") : ""));
  await ctx.close();
  fs.rmSync(userDir, { recursive: true, force: true });
  console.log(fails.length ? `\n${fails.length} проверок не прошли` : "\nвсё прошло");
  process.exit(fails.length ? 1 : 0);
})();
