// Режиссёр на НАСТОЯЩЕЙ музыке (Node, без браузера; PNG-карты — через Playwright).
// Запуск: node tools/real-sections.js [опции] <папка|файл> [...]
//   опции:  --sr=44100|48000   частота декодирования (по умолчанию 44100)
//           --png=<папка>      нарисовать карту трека (огибающая энергии, низы, потоки, части, сильные доли, разметка)
//                              нужен Playwright: PW=$(npm root -g)/playwright
//           --truth=<json>     ручная разметка (по умолчанию tools/real-sections.json)
//           --cache=<папка>    кэш анализа: полный анализ (STFT) делается один раз, дальше --reuse пересчитывает только
//                              части трека (buildSections) на сохранённых признаках — для быстрой настройки Режиссёра
//           --prefix=p         префикс имён PNG (по умолчанию map_)
//           --reuse            взять анализ из кэша, если есть (иначе анализ и запись в кэш)
//           --jobs=N           параллельные процессы (по умолчанию 3)
//           --max=сек          обрезать трек (по умолчанию целиком)
//           --compact          таблица одной строкой на трек (вместо console.table)
//           --quiet            только итоговая таблица
// ANALYZER=, CLOCK=, ARENA= подменяют 04/05/09 (сравнение «до/после»), как в sections-test.js.
// Музыку в репозиторий не кладём: файлы берём из любой папки (archive.org, incompetech.com — лицензии см. CLAUDE.md).
// Разметка — tools/real-sections.json: { "<имя файла без расширения>": { structured, genre, sections: [[сек, kind], ...] } };
// kind истины: intro, build, drop, break, outro, groove (ровная часть без событий).
// Печатает по каждому треку: BPM, части (start, kind, уровень, интенсивность), доли времени по kind, «молчит» (структурный трек без ни одной части
// build/drop/climax/break) и «мало эффектов» (эффекты арены включены меньше 15% боя), а при наличии разметки — точность kind по времени,
// лишние/пропущенные границы, найденные дропы/брейки/нарастания, охват и точность эффектов арены против разметки (kw drop/climax/break ≥ 0.5,
// buildW ≥ 0.3), время в нарастании/брейке на ровных треках («дёрганье»). Часы и арена прогоняются те же, что в игре (RhythmClock + updateVariants).
// Типовой цикл настройки: один раз `--cache=…` (анализ ~8 с на трек), дальше правки 04_analyzer.js и `--cache=… --reuse` (секунды).
const fs = require("fs"), vm = require("vm"), path = require("path"), cp = require("child_process");

const args = process.argv.slice(2);
const opt = {}; const inputs = [];
for (const a of args) { const m = /^--([a-z]+)(?:=(.*))?$/.exec(a); if (m) opt[m[1]] = m[2] === undefined ? true : m[2]; else inputs.push(a); }
const SR = Number(opt.sr) || 44100;
const TRUTH_FILE = opt.truth || path.join(__dirname, "real-sections.json");
const CACHE = opt.cache || "";
const stemOf = f => path.basename(f).replace(/\.[^.]+$/, "");
const hotKinds = ["drop", "climax"], eventKinds = ["drop", "climax", "break", "build"];
const COMPAT = { intro: ["intro", "calm"], build: ["build"], drop: ["drop", "climax"], break: ["break", "calm"], outro: ["outro", "calm"], groove: ["groove", "calm"] };
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };

/* ---------- контекст с модулями игры ---------- */
function makeCtx() {
  const ctx = { console, performance, setTimeout, Math, Float32Array, Float64Array, Int32Array, Uint8Array, Uint32Array, Promise, document: { createElement: () => ({ getContext: () => ({}) }) }, window: {}, navigator: {} };
  vm.createContext(ctx);
  const src = f => path.join(__dirname, "../src/js", f);
  for (const f of ["00_util.js", "04_analyzer.js", "05_clock.js", "09_arena.js"]) {
    const p = f === "04_analyzer.js" && process.env.ANALYZER ? process.env.ANALYZER : f === "05_clock.js" && process.env.CLOCK ? process.env.CLOCK : f === "09_arena.js" && process.env.ARENA ? process.env.ARENA : src(f);
    vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: f });
  }
  vm.runInContext(`class FakeBuffer { constructor(n, sr){ this.numberOfChannels=1; this.length=n; this.sampleRate=sr; this.duration=n/sr; this._d=new Float32Array(n); } getChannelData(){ return this._d; } }
    var __cap = null; { const __o = buildSections; buildSections = function (a) { __cap = a; return __o(a); }; }`, ctx);
  return ctx;
}

/** Декодирование ffmpeg → Float32Array (моно, SR). */
function decode(file) {
  const a = ["-v", "error", "-i", file, "-ac", "1", "-ar", String(SR)];
  if (opt.max) a.push("-t", String(opt.max));
  a.push("-f", "f32le", "pipe:1");
  const r = cp.spawnSync("ffmpeg", a, { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error("ffmpeg: " + String(r.stderr).slice(0, 200));
  const b = r.stdout;
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length - (b.length % 4)));
}

const toArr = v => (ArrayBuffer.isView(v) ? Array.from(v) : v);
const unArr = v => Float32Array.from(v);

/** Анализ одного файла → { map, secArgs } (с кэшем). */
async function analyzeFile(ctx, file) {
  const stem = stemOf(file), cpath = CACHE ? path.join(CACHE, `${stem}.${SR}.json`) : "";
  if (opt.reuse && cpath && fs.existsSync(cpath)) {
    const c = JSON.parse(fs.readFileSync(cpath, "utf8"));
    const sa = c.secArgs, N = 1024, H = 256, factor = Math.max(1, Math.round(SR / 22050)), sr = SR / factor, ONSET_BIAS = 0.004, frames = sa.frames;
    const a = {
      beats: Float64Array.from(sa.beats), strong: Uint8Array.from(sa.strong), duration: sa.duration, envFps: sa.envFps,
      energy: unArr(sa.energy), bl: unArr(sa.bl), bm: unArr(sa.bm), bh: unArr(sa.bh), fL: unArr(sa.fL), fM: unArr(sa.fM), fH: unArr(sa.fH), pL: unArr(sa.pL), pM: unArr(sa.pM), pH: unArr(sa.pH), confidence: c.map.confidence,
      frameOf: t => Math.min(frames - 1, Math.max(0, Math.round(((t - ONSET_BIAS) * sr - N / 2) / H))),
    };
    ctx.__a = a;
    const sections = vm.runInContext("buildSections(__a)", ctx);
    const m = c.map;
    const map = {
      duration: m.duration, bpm: m.bpm, period: m.period, confidence: m.confidence, mode: m.mode, stability: m.stability,
      beats: Float64Array.from(m.beats), strength: unArr(m.strength), strong: Uint8Array.from(m.strong), envFps: m.envFps,
      energy: unArr(m.energy), low: unArr(m.low), mid: unArr(m.mid), high: unArr(m.high), sections,
      onsets: { low: m.onsets.low, mid: m.onsets.mid, high: m.onsets.high }, features: m.features, tempoStable: m.tempoStable,
    };
    return { map, secArgs: a };
  }
  const pcm = decode(file);
  ctx.__d = pcm; ctx.__sr = SR;
  const map = await vm.runInContext(`(async()=>{ const b = new FakeBuffer(__d.length, __sr); b._d.set(__d); return await new RhythmAnalyzer().analyze(b); })()`, ctx);
  const a = vm.runInContext("__cap", ctx);
  if (cpath) {
    fs.mkdirSync(CACHE, { recursive: true });
    const frames = a.fL.length;
    const sa = { frames, beats: toArr(a.beats), strong: toArr(a.strong), duration: a.duration, envFps: a.envFps, energy: toArr(a.energy), bl: toArr(a.bl), bm: toArr(a.bm), bh: toArr(a.bh), fL: toArr(a.fL), fM: toArr(a.fM), fH: toArr(a.fH), pL: toArr(a.pL), pM: toArr(a.pM), pH: toArr(a.pH) };
    const m = { duration: map.duration, bpm: map.bpm, period: map.period, confidence: map.confidence, mode: map.mode, stability: map.stability, beats: toArr(map.beats), strength: toArr(map.strength), strong: toArr(map.strong), envFps: map.envFps, energy: toArr(map.energy), low: toArr(map.low), mid: toArr(map.mid), high: toArr(map.high), onsets: map.onsets, features: map.features, tempoStable: map.tempoStable };
    fs.writeFileSync(cpath, JSON.stringify({ secArgs: sa, map: m }));
  }
  return { map, secArgs: a };
}

/* ---------- часы и арена на карте ---------- */
function simulate(ctx, map) {
  ctx.__m = map;
  return vm.runInContext(`(() => {
    const clock = new RhythmClock({ v: { sensitivity: 1 } });
    clock.setMap(__m);
    const A = Object.create(ArenaRenderer.prototype);
    A.kw = { intro: 0, build: 0, drop: 0, climax: 0, break: 0, calm: 0, groove: 1, outro: 0 };
    A.buildW = 0; A.dropFlash = 0; A.swap = 0; A.swapTarget = 0;
    const mm = { onsets: [] }, dt = 1 / 30, dur = __m.duration;
    let secEv = 0, fxOn = 0, fxN = 0, hotOn = 0, brOn = 0, buOn = 0;
    const codes = [];
    let fi = 0;
    for (let t = 0; t < dur; t += dt, fi++) {
      clock.update(t, dt, null, true);
      for (const e of clock.events) if (e.type === "section") secEv++;
      mm.kind = clock.kind; mm.trend = clock.trend; mm.timeToNext = clock.timeToNext; mm.dropIn = clock.dropIn; mm.buildProg = clock.buildProg; mm.sectionT = clock.sectionT;
      mm.sectionEvent = clock.events.some(e => e.type === "section");
      A.updateVariants(mm, dt);
      const hot = A.kw.drop + A.kw.climax, br = A.kw.break, bu = A.buildW;
      fxN++; if (hot >= 0.5 || br >= 0.5 || bu >= 0.3) fxOn++;
      if (hot >= 0.5) hotOn++; if (br >= 0.5) brOn++; if (bu >= 0.3) buOn++;
      if (fi % 3 === 0) codes.push(hot >= 0.5 ? 1 : br >= 0.5 ? 2 : bu >= 0.3 ? 3 : 0);
    }
    return { secEv, fx: fxOn / fxN, hot: hotOn / fxN, brk: brOn / fxN, bld: buOn / fxN, codes: codes.join("") };
  })()`, ctx);
}

/* ---------- метрики по разметке ---------- */
function truthSections(tr, dur) {
  return tr.sections.map(([t, kind, flag], i) => ({ start: t, kind, soft: flag === "soft", end: i + 1 < tr.sections.length ? tr.sections[i + 1][0] : dur }));
}
/** Допустим ли найденный kind для истинной части (soft — ещё и обычный groove; в groove годятся короткие intro/outro). */
function kindOk(ts, f, loose) {
  if ((COMPAT[ts.kind] || [ts.kind]).includes(f.kind)) return true;
  if (loose && ts.kind === "groove" && COMPAT.drop.includes(f.kind)) return true;   // трек без структуры: ровное «тело» после вступления может быть назван дропом
  if (ts.soft && COMPAT.groove.includes(f.kind)) return true;
  if ((ts.kind === "groove" || ts.soft) && (f.kind === "intro" || f.kind === "outro") && f.end - f.start <= 45) return true;
  return false;
}
function metrics(map, tr) {
  const T = truthSections(tr, map.duration), F = map.sections;
  const fb = F.slice(1).map(s => s.start);
  const hard = [], soft = [];
  for (let i = 1; i < T.length; i++) (T[i].soft || T[i - 1].soft ? soft : hard).push(T[i].start);
  const used = new Set(), errs = []; let miss = 0;
  for (const t of hard) {
    let bj = -1, bd = 4;
    fb.forEach((f, j) => { if (!used.has(j) && Math.abs(f - t) < bd) { bd = Math.abs(f - t); bj = j; } });
    if (bj < 0) miss++; else { used.add(bj); errs.push(Math.abs(fb[bj] - t)); }
  }
  let extra = 0;
  fb.forEach((f, j) => { if (!used.has(j) && !soft.some(s => Math.abs(s - f) < 4)) extra++; });
  let ok = 0, tot = 0;
  for (let t = 0.5; t < map.duration - 1; t += 0.25) {
    const ts = T.find(s => t >= s.start && t < s.end) || T[T.length - 1];
    const fs_ = F.find(s => t >= s.start && t < s.end) || F[F.length - 1];
    tot++; if (kindOk(ts, fs_, tr.structured === false)) ok++;
  }
  // попадания событий: у каждой истинной (не soft) части drop/break/build найденный kind в её основной части совместим
  const ev = { drop: [0, 0], break: [0, 0], build: [0, 0] };
  for (const s of T) if (ev[s.kind] && !s.soft) {
    const len = s.end - s.start, t0 = s.start + Math.min(2, len * 0.2), t1 = s.start + Math.min(len * 0.8, len - 0.5);
    let good = 0, n = 0;
    for (let t = t0; t < t1; t += 0.25) { const f = F.find(x => t >= x.start && t < x.end) || F[F.length - 1]; n++; if (COMPAT[s.kind].includes(f.kind)) good++; }
    ev[s.kind][1]++; if (n && good / n >= 0.5) ev[s.kind][0]++;
  }
  // «дёрганье» на треке без структуры: доля времени в нарастании/дропе/брейке
  let hot = 0;
  for (const s of F) if (tr.structured === false ? (s.kind === "break" || s.kind === "build") : eventKinds.includes(s.kind)) hot += (s.end - s.start) / map.duration;
  return { ok: ok / tot, extra, miss, errMed: median(errs), errMax: errs.length ? Math.max(...errs) : NaN, nF: fb.length, nT: hard.length, ev, evShare: hot };
}

/** Эффекты арены против разметки: охват — доля времени истинных drop/break/build, где включён нужный эффект; точность — доля
    времени с эффектом, которое лежит в истинной части того же рода (части soft не учитываются). */
function fxMatch(map, tr, codes) {
  const T = truthSections(tr, map.duration), want = { drop: 1, break: 2, build: 3 };
  let need = 0, got = 0, on = 0, right = 0;
  for (let i = 0; i < codes.length; i++) {
    const t = i / 10 * 1, ts = T.find(s => t >= s.start && t < s.end) || T[T.length - 1];
    if (ts.soft) continue;
    const exp = want[ts.kind] || 0, c = +codes[i];
    if (exp) { need++; if (c === exp) got++; }
    if (c) { on++; if (c === exp) right++; }
  }
  return { need, got, on, right };
}

function kindShares(map) {
  const sh = {};
  for (const s of map.sections) sh[s.kind] = (sh[s.kind] || 0) + (s.end - s.start) / map.duration;
  return sh;
}

/* ---------- рабочий процесс одного файла ---------- */
async function runOne(file) {
  const ctx = makeCtx();
  const t0 = Date.now();
  const { map, secArgs } = await analyzeFile(ctx, file);
  // признаки тактов для карты берём из текущего анализатора (src), даже если ANALYZER= подменён
  const bctx = process.env.ANALYZER ? (global.__bctx || (global.__bctx = (() => { const c = { console, performance, setTimeout, Math, Float32Array, Float64Array, Int32Array, Uint8Array, Uint32Array, Promise, document: { createElement: () => ({ getContext: () => ({}) }) }, window: {}, navigator: {} }; vm.createContext(c); for (const f of ["00_util.js", "04_analyzer.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/js", f), "utf8"), c, { filename: f }); return c; })())) : ctx;
  bctx.__a2 = secArgs;
  const bars = vm.runInContext("(() => { const b = sectionBars(__a2); return { edges: b.edges, B: b.B, raw: b.raw, I: b.I }; })()", bctx);
  const sim = simulate(ctx, map);
  const stem = stemOf(file);
  let truth = null;
  try { const all = JSON.parse(fs.readFileSync(TRUTH_FILE, "utf8")); truth = all[stem] || all[stem.replace(/^(mm|ia)_/, "")] || null; } catch (e) {}
  const met = truth ? metrics(map, truth) : null;
  if (met) met.fxm = fxMatch(map, truth, sim.codes);
  const shares = kindShares(map);
  const present = new Set(map.sections.map(s => s.kind));
  const silent = !eventKinds.some(k => present.has(k));   // нет ни одной части build/drop/climax/break
  const quiet = sim.fx < 0.15;                              // эффекты Режиссёра в арене включены меньше 15% боя
  return {
    file, stem, ms: Date.now() - t0, dur: map.duration, bpm: map.bpm, nBeats: map.beats.length,
    sections: map.sections.map(s => ({ start: s.start, end: s.end, kind: s.kind, level: s.level, energy: s.energy, drive: s.drive })),
    shares, silent, quiet, sim: { secEv: sim.secEv, fx: sim.fx, hot: sim.hot, brk: sim.brk, bld: sim.bld }, met, truth: truth ? { structured: truth.structured, genre: truth.genre, sections: truth.sections } : null,
    plot: { bars, dur: map.duration, strongT: Array.from(map.beats).filter((_, i) => map.strong[i]) },
  };
}

/* ---------- PNG-карта ---------- */
async function drawPngs(results, dir) {
  const { chromium } = require(process.env.PW || "playwright");
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 660 } });
  for (const r of results) {
    const data = await page.evaluate(({ r }) => {
      const W = 1400, Hh = 640, L = 46, R = 14, cv = document.createElement("canvas");
      cv.width = W; cv.height = Hh; const c = cv.getContext("2d");
      const P = r.plot, dur = P.dur, X = t => L + (W - L - R) * t / dur, bars = P.bars;
      const COL = { intro: "#4a6fa5", build: "#e0a030", drop: "#e0405a", climax: "#ff2d6a", break: "#3aa88a", outro: "#7a6aa8", calm: "#506070", groove: "#808890" };
      c.fillStyle = "#0d0e14"; c.fillRect(0, 0, W, Hh);
      c.font = "12px sans-serif"; c.fillStyle = "#e8e2d6";
      c.fillText(`${r.stem}   ${dur.toFixed(0)} с   ${r.bpm.toFixed(1)} BPM   тактов ${bars.B}   частей ${r.sections.length}${r.silent ? "   МОЛЧИТ" : r.quiet ? "   почти молчит" : ""}`, L, 16);
      const top1 = 28, h1 = 210, top2 = 252, h2 = 130, axisY = top2 + h2 + 14;
      // фон частей и сетка времени
      for (const s of r.sections) { c.fillStyle = (COL[s.kind] || "#888") + "26"; c.fillRect(X(s.start), top1, X(s.end) - X(s.start), top2 + h2 - top1); }
      const step = dur > 400 ? 60 : dur > 200 ? 30 : 15;
      c.strokeStyle = "#2a2d3a"; c.fillStyle = "#8a8e9c"; c.lineWidth = 1;
      for (let t = 0; t <= dur; t += step) { c.beginPath(); c.moveTo(X(t), top1); c.lineTo(X(t), top2 + h2); c.stroke(); c.fillText(`${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}`, X(t) - 10, axisY + 12); }
      // такты: линия по тактам (ступеньки)
      const stepLine = (arr, top, h, col, w) => {
        c.strokeStyle = col; c.lineWidth = w; c.beginPath();
        for (let k = 0; k < bars.B; k++) { const x0 = X(bars.edges[k]), x1 = X(bars.edges[k + 1]), y = top + h - h * Math.min(1.15, arr[k]); k ? c.lineTo(x0, y) : c.moveTo(x0, y); c.lineTo(x1, y); }
        c.stroke();
      };
      c.fillStyle = "#8a8e9c"; c.fillText("по тактам: 1 = максимум трека", 2, top1 + 10);
      stepLine(bars.raw.h, top1, h1, "#ffe08a", 1.2);
      if (bars.I) stepLine(bars.I, top1, h1, "#ff5fa0", 2.4);
      stepLine(bars.raw.l, top1, h1, "#4fd0ff", 1.6);
      stepLine(bars.raw.e, top1, h1, "#ffffff", 2.2);
      stepLine(bars.raw.kf, top2, h2, "#ff8cf0", 1.6);
      stepLine(bars.raw.mf, top2, h2, "#7be39a", 1.2);
      stepLine(bars.raw.hf, top2, h2, "#ff9a4a", 1.2);
      // линии «сильных долей» на оси
      c.strokeStyle = "#ffffff40";
      for (const t of P.strongT) { c.beginPath(); c.moveTo(X(t), axisY - 6); c.lineTo(X(t), axisY); c.stroke(); }
      const bar = (secs, y, label) => {
        c.fillStyle = "#8a8e9c"; c.fillText(label, 2, y + 16);
        for (const s of secs) {
          c.fillStyle = COL[s.kind] || "#888"; c.fillRect(X(s.start), y, Math.max(1, X(s.end) - X(s.start) - 1), 24);
          c.fillStyle = "#000"; if (X(s.end) - X(s.start) > 26) c.fillText(s.kind.slice(0, 2), X(s.start) + 3, y + 16);
        }
      };
      bar(r.sections, axisY + 22, "найд.");
      if (r.truth) { const T = r.truth.sections.map(([t, k], i) => ({ start: t, kind: k, end: i + 1 < r.truth.sections.length ? r.truth.sections[i + 1][0] : dur })); bar(T, axisY + 52, "истина"); }
      const ly = axisY + 90;
      const leg = [["#ffffff", "энергия"], ["#4fd0ff", "низы"], ["#ffe08a", "верха"], ["#ff5fa0", "интенсивность"], ["#ff8cf0", "поток бочки"], ["#7be39a", "поток середины"], ["#ff9a4a", "поток верхов"]];
      leg.forEach(([col, tx], i) => { c.fillStyle = col; c.fillRect(L + i * 130, ly, 14, 4); c.fillStyle = "#c8ccd8"; c.fillText(tx, L + i * 130 + 20, ly + 6); });
      let x = L; for (const k of Object.keys(COL)) { c.fillStyle = COL[k]; c.fillRect(x, ly + 18, 10, 10); c.fillStyle = "#c8ccd8"; c.fillText(k, x + 14, ly + 27); x += 80; }
      return cv.toDataURL("image/png");
    }, { r });
    fs.writeFileSync(path.join(dir, `${opt.prefix || "map_"}${r.stem}.png`), Buffer.from(data.split(",")[1], "base64"));
  }
  await browser.close();
}

/* ---------- вывод ---------- */
const fmtT = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
function report(results) {
  for (const r of results) {
    if (!opt.quiet) {
      console.log(`\n== ${r.stem}  ${fmtT(r.dur)}  ${r.bpm.toFixed(1)} BPM  (${r.nBeats} долей, анализ ${(r.ms / 1000).toFixed(1)} с)${r.truth ? "  [" + r.truth.genre + (r.truth.structured ? ", структура" : ", без структуры") + "]" : ""}`);
      console.log("  части: " + r.sections.map(s => `${fmtT(s.start)} ${s.kind}/${s.level[0]} ${s.drive != null ? s.drive.toFixed(2) : s.energy.toFixed(2)}`).join("  |  "));
      if (r.truth) console.log("  истина: " + r.truth.sections.map(([t, k]) => `${fmtT(t)} ${k}`).join("  |  "));
    }
  }
  const rows = results.map(r => {
    const m = r.met, ev = m ? m.ev : null;
    const e = k => ev && ev[k][1] ? `${ev[k][0]}/${ev[k][1]}` : "-";
    return {
      "трек": r.stem.replace(/^(mm|ia)_/, "").slice(0, 34),
      "BPM": r.bpm.toFixed(0), "частей": r.sections.length,
      "kind-ы (доля времени)": Object.entries(r.shares).sort((a, b) => b[1] - a[1]).map(([k, v]) => k.slice(0, 2) + Math.round(v * 100)).join(" "),
      "молчит": r.truth && r.truth.structured === false ? "" : r.silent ? "ДА" : r.quiet ? "мало" : "",
      "эффекты %": (100 * r.sim.fx).toFixed(0),
      "kind %": m ? (100 * m.ok).toFixed(0) : "-",
      "лишн.": m ? m.extra : "-", "пропущ.": m ? m.miss : "-",
      "ош.с мед": m && typeof m.errMed === "number" ? m.errMed.toFixed(1) : "-",
      "дроп": e("drop"), "брейк": e("break"), "нараст.": e("build"), "событ.%": m ? (100 * m.evShare).toFixed(0) : "-",
    };
  });
  if (opt.compact) for (const r of rows) console.log(String(r["трек"]).padEnd(36), String(r["частей"]).padStart(2), "kind" + String(r["kind %"]).padStart(4), "лишн" + String(r["лишн."]).padStart(2), "проп" + String(r["пропущ."]).padStart(2), "дроп" + String(r["дроп"]).padStart(4), "брейк" + String(r["брейк"]).padStart(4), "нар" + String(r["нараст."]).padStart(4), "эфф" + String(r["эффекты %"]).padStart(4), String(r["kind-ы (доля времени)"]), r["молчит"] === "ДА" ? "МОЛЧИТ" : r["молчит"] ? "мало эффектов" : "");
  else console.table(rows);
  const withT = results.filter(r => r.met), str = results.filter(r => r.truth && r.truth.structured), amb = results.filter(r => r.truth && !r.truth.structured);
  const sum = f => withT.reduce((a, r) => a + f(r), 0);
  const evSum = k => str.reduce((a, r) => [a[0] + r.met.ev[k][0], a[1] + r.met.ev[k][1]], [0, 0]);
  console.log(`ИТОГО треков ${results.length}, с разметкой ${withT.length}; МОЛЧАЩИХ среди структурных (нет частей build/drop/climax/break): ${str.filter(r => r.silent).length}/${str.length} [${str.filter(r => r.silent).map(r => r.stem).join(", ")}]; ПОЧТИ МОЛЧАЩИХ (эффекты < 15% боя): ${str.filter(r => r.quiet).length} [${str.filter(r => r.quiet).map(r => r.stem).join(", ")}]`);
  if (withT.length) {
    const d = evSum("drop"), b = evSum("break"), u = evSum("build");
    console.log(`kind по времени (среднее): ${(100 * sum(r => r.met.ok) / withT.length).toFixed(1)}%; лишних границ ${sum(r => r.met.extra)}, пропущено ${sum(r => r.met.miss)} (из ${sum(r => r.met.nT)} истинных); ` +
      `дропы найдены ${d[0]}/${d[1]}, брейки ${b[0]}/${b[1]}, нарастания ${u[0]}/${u[1]}; доля боя с работающими эффектами (структурные): ${str.length ? (100 * str.reduce((a, r) => a + r.sim.fx, 0) / str.length).toFixed(0) : "-"}%`);
    const fm = str.reduce((a, r) => [a[0] + r.met.fxm.need, a[1] + r.met.fxm.got, a[2] + r.met.fxm.on, a[3] + r.met.fxm.right], [0, 0, 0, 0]);
    console.log(`эффекты арены против разметки (структурные): охват ${fm[0] ? (100 * fm[1] / fm[0]).toFixed(0) : "-"}% времени дропов/брейков/нарастаний, точность ${fm[2] ? (100 * fm[3] / fm[2]).toFixed(0) : "-"}% времени с эффектом`);
    if (amb.length) console.log(`без структуры (эмбиент/ровные, ${amb.length}): частей в среднем ${(amb.reduce((a, r) => a + r.sections.length, 0) / amb.length).toFixed(1)}, время в нарастании/дропе/брейке ${(100 * amb.reduce((a, r) => a + r.met.evShare, 0) / amb.length).toFixed(0)}%, эффекты в бою ${(100 * amb.reduce((a, r) => a + r.sim.fx, 0) / amb.length).toFixed(0)}% времени`);
  }
}

/* ---------- main ---------- */
(async () => {
  if (opt.worker) { // дочерний процесс: один файл → JSON в stdout
    const r = await runOne(opt.worker);
    process.stdout.write("\u0001" + JSON.stringify(r) + "\u0002");
    return;
  }
  const files = [];
  for (const p of inputs) {
    if (fs.statSync(p).isDirectory()) for (const f of fs.readdirSync(p).sort()) { if (/\.(mp3|wav|ogg|flac|m4a|opus)$/i.test(f)) files.push(path.join(p, f)); }
    else files.push(p);
  }
  if (!files.length) { console.log("нет файлов: node tools/real-sections.js [опции] <папка|файлы>"); process.exit(1); }
  const jobs = Math.max(1, Number(opt.jobs) || 3), results = new Array(files.length);
  let next = 0;
  const passthru = Object.entries(opt).filter(([k]) => k !== "worker" && k !== "jobs" && k !== "png").map(([k, v]) => v === true ? `--${k}` : `--${k}=${v}`);
  const workers = Array.from({ length: Math.min(jobs, files.length) }, async () => {
    while (next < files.length) {
      const i = next++;
      await new Promise(res => {
        const ch = cp.spawn(process.execPath, [__filename, ...passthru, `--worker=${files[i]}`], { env: process.env, stdio: ["ignore", "pipe", "inherit"] });
        let out = "";
        ch.stdout.on("data", d => out += d);
        ch.on("close", () => { const a = out.indexOf("\u0001"), b = out.lastIndexOf("\u0002"); if (a >= 0 && b > a) results[i] = JSON.parse(out.slice(a + 1, b)); else console.error("сбой анализа:", files[i]); res(); });
      });
    }
  });
  await Promise.all(workers);
  const ok = results.filter(Boolean);
  report(ok);
  if (opt.png) { await drawPngs(ok, opt.png); console.log(`PNG-карты: ${path.resolve(opt.png)}/*.png`); }
})();
