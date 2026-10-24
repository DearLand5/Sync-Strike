// Режиссёр (части трека → эффекты арены) в игровом цикле: node tools/director-test.js [outDir]
// Проверяет, что часы получают правильные части и события при: старте демо, повторе часов по карте (в т.ч. при темпе 125%),
// перемотке, зацикливании трека в «Волнах», практике, автосохранении и «Продолжить», библиотеке (перезапуск игры),
// и что эффекты арены (kw дропа/брейка, нарастание) включаются в нужных частях.
// Трек для библиотеки — синтезированный WAV с известной структурой (интро → дроп → брейк → дроп).
const { chromium } = require(process.env.PW || "playwright");
const path = require("path"), fs = require("fs"), os = require("os");
const out = process.argv[2] || path.join(__dirname, "../.shots");
fs.mkdirSync(out, { recursive: true });

/** WAV 22050 Гц: 124 BPM; интро (хэты) → дроп (бочка, снейр, бас) → брейк (пэд) → дроп. */
function structuredWav(bpm = 124) {
  const sr = 22050, per = 60 / bpm, plan = [[8, "intro"], [16, "drop"], [8, "break"], [16, "drop"]];
  const bars = plan.reduce((a, p) => a + p[0], 0), dur = 0.3 + bars * 4 * per + 2, n = Math.round(dur * sr);
  const f = new Float32Array(n), rnd = (() => { let a = 7; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
  const add = (t0, len, fn) => { const s0 = Math.floor(t0 * sr), L = Math.floor(len * sr); for (let i = 0; i < L && s0 + i < n; i++) f[s0 + i] += fn(i / sr, i); };
  let bar = 0;
  for (const [count, kind] of plan) for (let b = 0; b < count; b++, bar++) {
    const tb = 0.3 + bar * 4 * per;
    add(tb, 4 * per, t => (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 277 * t)) * 0.03 * Math.min(1, t / 0.5) * (kind === "break" ? 1.6 : 1));
    for (let q = 0; q < 4; q++) {
      const t = tb + q * per;
      if (kind !== "break") add(t + per / 2, 0.05, tt => (rnd() * 2 - 1) * Math.exp(-tt * 70) * (kind === "drop" ? 0.35 : 0.2));
      if (kind === "drop") {
        add(t, 0.3, tt => Math.sin(2 * Math.PI * (46 + 95 * Math.exp(-tt * 30)) * tt) * Math.exp(-tt * 8) * 0.8);
        if (q === 1 || q === 3) add(t, 0.18, tt => ((rnd() * 2 - 1) * 0.3 + Math.sin(2 * Math.PI * 188 * tt) * 0.3) * Math.exp(-tt * 18));
        add(t + per / 2, per * 0.45, tt => Math.sin(2 * Math.PI * 55 * tt) * Math.exp(-tt * 5) * 0.25);
      }
    }
  }
  const data = Buffer.alloc(44 + n * 2);
  data.write("RIFF", 0); data.writeUInt32LE(36 + n * 2, 4); data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(sr, 24); data.writeUInt32LE(sr * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write("data", 36); data.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, f[i])) * 30000), 44 + i * 2);
  return data;
}

(async () => {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-dir-"));
  const ctx = await chromium.launchPersistentContext(userDir, { viewport: { width: 1100, height: 560 }, args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  const url = "file://" + path.join(__dirname, "../index.html");
  const fails = [];
  const check = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg); if (!ok) fails.push(msg); };
  const idle = () => page.waitForFunction(() => !window.__game.loading, null, { timeout: 90000 });
  // функции внутри страницы: kind части в момент t по карте; повтор часов по карте
  const helpers = () => page.evaluate(() => {
    window.__kindAt = (map, t) => { const s = map.sections.find(x => t >= x.start && t < x.end) || map.sections[map.sections.length - 1]; return s.kind; };
    window.__replay = map => {
      const C = window.__game.clock.constructor, c = new C({ v: { sensitivity: 1 } });
      c.setMap(map);
      const ev = [];
      for (let t = 0; t < map.duration; t += 1 / 60) { c.update(t, 1 / 60, null, true); for (const e of c.events) if (e.type === "section") ev.push({ t, time: e.time, kind: e.kind, prev: e.prevKind }); }
      return ev;
    };
    window.__fix = () => { const g = window.__game; g.player.maxHp = 1e6; g.player.hp = 1e6; g.waves.queue = []; g.waves.between = 999; g.enemies = []; };
  });
  const frames = n => page.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

  await page.goto(url);
  await page.waitForFunction(() => window.__game && window.__game.library.ok !== undefined);
  await page.evaluate(() => window.__game.library.ready);
  await helpers();

  /* ---- 1. демо: части найдены ---- */
  await page.evaluate(() => window.__game.startBattle("waves"));
  await page.waitForFunction(() => window.__game.state === "battle" && window.__game.track, null, { timeout: 60000 });
  await page.evaluate(() => window.__fix());
  const demo = await page.evaluate(() => { const m = window.__game.track.map; return { sec: m.sections.map(s => [s.kind, +s.start.toFixed(1), +s.end.toFixed(1)]), dur: m.duration }; });
  console.log("демо:", JSON.stringify(demo.sec));
  const kinds = new Set(demo.sec.map(s => s[0]));
  check(demo.sec.length >= 5 && kinds.has("intro") && kinds.has("build") && kinds.has("break") && (kinds.has("drop") || kinds.has("climax")), `демо: найдены intro/build/drop/break (${[...kinds].join(", ")})`);

  /* ---- 2. повтор часов по карте: число и время событий, при темпе 125% ---- */
  const rp = await page.evaluate(() => {
    const g = window.__game, m = g.track.map, T = window.TEMPO_REF;
    const evs = window.__replay(m);
    const tp = T.normalize({ rate: 1.25, keep: true, fix: { k: 0, half: false, shift: 0 } });
    const m2 = T.makeMap(g.track.base.map, tp, g.track.base.buffer.duration / 1.25);
    const ev2 = window.__replay(m2);
    const dev = (map, ev) => Math.max(...ev.map((e, i) => Math.abs(e.time - map.sections[i + 1].start)));
    return { n: m.sections.length, ne: evs.length, dev: dev(m, evs), n2: m2.sections.length, ne2: ev2.length, dev2: dev(m2, ev2), s1: m2.sections[1].start / m.sections[1].start, kindsOk: ev2.every((e, i) => e.kind === m2.sections[i + 1].kind) };
  });
  check(rp.ne === rp.n - 1 && rp.dev < 0.02, `часы: ${rp.ne} событий смены части на ${rp.n} частей, отклонение времени ${(rp.dev * 1000).toFixed(1)} мс`);
  check(rp.ne2 === rp.n2 - 1 && rp.dev2 < 0.02 && Math.abs(rp.s1 - 0.8) < 0.002 && rp.kindsOk, `темп 125%: ${rp.ne2}/${rp.n2 - 1} событий, границы ×0,8 (${rp.s1.toFixed(3)}), kind те же`);

  /* ---- 3. перемотка в бою: kind и эффекты арены ---- */
  for (const [t, want] of [[30, "hot"], [62, "break"], [4, "intro"], [12, "build"], [90, "hot"], [3, "intro"]]) {
    await page.evaluate(t => { window.__fix(); window.__game.audio.seek(t); }, t);
    await page.waitForTimeout(t === 12 ? 2200 : 1500);
    const r = await page.evaluate(([t, want]) => {
      const g = window.__game, k = g.clock.kind, a = g.arena, exp = window.__kindAt(g.track.map, g.songNow);
      return { k, exp, t: +g.songNow.toFixed(1), hot: a.kw.drop + a.kw.climax, br: a.kw.break, bw: a.buildW, st: g.state };
    }, [t, want]);
    const kindOk = r.k === r.exp, fxOk = want === "hot" ? r.hot >= 0.5 : want === "break" ? r.br >= 0.5 : want === "build" ? r.bw >= 0.3 : r.hot < 0.3 && r.br < 0.3;
    check(r.st === "battle" && kindOk && fxOk, `перемотка на ${t} с → kind ${r.k} (ожидается ${r.exp}), эффекты: дроп ${r.hot.toFixed(2)}, брейк ${r.br.toFixed(2)}, нарастание ${r.bw.toFixed(2)}`);
  }

  /* ---- 4. зацикливание трека в «Волнах» ---- */
  await page.evaluate(() => { window.__fix(); window.__game.audio.seek(window.__game.audio.duration - 1.0); });
  await page.waitForTimeout(3200);
  let r = await page.evaluate(() => { const g = window.__game; return { t: +g.songNow.toFixed(1), k: g.clock.kind, exp: window.__kindAt(g.track.map, g.songNow), idx: g.clock.sectionIdx, st: g.state, play: g.audio.playing }; });
  check(r.st === "battle" && r.play && r.t < 4 && r.k === r.exp, `после конца трека бой продолжается с начала: ${JSON.stringify(r)}`);
  await page.evaluate(() => { window.__fix(); window.__game.sectionTitle = ""; window.__game.audio.seek(7.5); });
  await page.waitForTimeout(2500);
  r = await page.evaluate(() => ({ title: window.__game.sectionTitle, k: window.__game.clock.kind, t: +window.__game.songNow.toFixed(1) }));
  check(r.title === "НАРАСТАНИЕ" && r.k === "build", `после цикла событие смены части приходит (${JSON.stringify(r)})`);

  /* ---- 5. автосохранение и «Продолжить» ---- */
  await page.evaluate(() => { const g = window.__game; g.endT = 0; g.mode = "track"; });
  await page.evaluate(() => { window.__fix(); window.__game.audio.seek(60); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const g = window.__game; g.autosave(); });
  const sv = await page.evaluate(() => { const a = window.__game.getAutosave(); return a && { mode: a.mode, pos: a.songPos }; });
  check(!!sv && sv.mode === "track" && sv.pos > 55, `автосохранение: ${JSON.stringify(sv)}`);
  await page.evaluate(() => { const g = window.__game; g.battleActive = false; g.state = "menu"; g.audio.pause(); g.ui.show("menu"); });
  await page.evaluate(() => window.__game.continueBattle());
  await page.waitForFunction(() => window.__game.state === "battle", null, { timeout: 20000 });
  await page.evaluate(() => window.__fix());
  await page.waitForTimeout(1200);
  r = await page.evaluate(() => { const g = window.__game, a = g.arena; return { t: +g.songNow.toFixed(1), k: g.clock.kind, exp: window.__kindAt(g.track.map, g.songNow), br: a.kw.break }; });
  check(r.t > 55 && r.k === r.exp && r.k === "break" && r.br >= 0.5, `«Продолжить» с 60 с: ${JSON.stringify(r)}`);

  /* ---- 6. практика ---- */
  await page.evaluate(() => { const g = window.__game; g.battleActive = false; g.state = "menu"; g.audio.pause(); });
  await page.evaluate(() => window.__game.startBattle("practice"));
  await page.waitForFunction(() => window.__game.state === "battle", null, { timeout: 20000 });
  await page.evaluate(() => { window.__fix(); window.__game.audio.seek(40); });
  await page.waitForTimeout(1500);
  r = await page.evaluate(() => { const g = window.__game, a = g.arena; return { k: g.clock.kind, exp: window.__kindAt(g.track.map, g.songNow), hot: a.kw.drop + a.kw.climax }; });
  check(r.k === r.exp && (r.k === "drop" || r.k === "climax") && r.hot >= 0.5, `практика: kind ${r.k}, вес дропа ${r.hot.toFixed(2)}`);
  await page.evaluate(() => { const g = window.__game; g.battleActive = false; g.state = "menu"; g.audio.pause(); g.ui.show("menu"); });

  /* ---- 7. библиотека: файл → анализ → перезапуск игры → части те же ---- */
  await page.evaluate(() => window.__game.ui.show("music"));
  await page.setInputFiles("#file-input", { name: "Structured.wav", mimeType: "audio/wav", buffer: structuredWav() });
  await page.waitForTimeout(200); await idle();
  const lib1 = await page.evaluate(() => { const g = window.__game, m = g.track.map; return { name: g.track.meta.name, lib: g.track.meta.libId, bpm: +m.bpm.toFixed(1), sec: m.sections.map(s => [s.kind, +s.start.toFixed(1)]) }; });
  console.log("WAV:", JSON.stringify(lib1));
  const k1 = new Set(lib1.sec.map(s => s[0]));
  check(lib1.name === "Structured" && !!lib1.lib && (k1.has("drop") || k1.has("climax")) && k1.has("break"), `синтез-трек: найдены дроп и брейк (${lib1.sec.map(s => s[0]).join(" ")})`);
  const t1 = lib1.sec.find(s => s[0] === "break");
  check(t1 && Math.abs(t1[1] - (0.3 + 24 * 4 * 60 / 124)) < 1.5, `граница брейка ${t1 && t1[1]} с (ожидается ≈ ${(0.3 + 24 * 4 * 60 / 124).toFixed(1)})`);
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.track && window.__game.track.meta.name === "Structured", null, { timeout: 30000 });
  await helpers();
  const lib2 = await page.evaluate(() => { const g = window.__game, m = g.track.map; return { sec: m.sections.map(s => [s.kind, +s.start.toFixed(1)]), same: g.clock.map === m, ver: (g.library.items.find(i => i.id === g.track.meta.libId) || {}).ver }; });
  check(JSON.stringify(lib2.sec) === JSON.stringify(lib1.sec) && lib2.same, `после перезапуска из библиотеки части те же, часы получили карту (ver ${lib2.ver})`);
  // часы на карте из библиотеки
  const rp3 = await page.evaluate(() => { const m = window.__game.track.map, ev = window.__replay(m); return { n: m.sections.length, ne: ev.length }; });
  check(rp3.ne === rp3.n - 1, `повтор часов на карте из библиотеки: ${rp3.ne} событий на ${rp3.n} частей`);

  console.log(errors.length ? "ОШИБКИ:\n" + errors.join("\n") : "no errors");
  if (errors.length) fails.push("ошибки страницы");
  await ctx.close();
  console.log(fails.length ? `ПРОВАЛЕНО: ${fails.length}` : "все проверки пройдены");
  process.exit(fails.length ? 1 : 0);
})();
