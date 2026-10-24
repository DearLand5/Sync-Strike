// Проверка разметки частей трека (intro/build/drop/break/outro) на синтезированных треках с ИЗВЕСТНОЙ структурой
// (Node, без браузера). Запуск: node tools/sections-test.js [44100|48000] [фильтр по имени]
// Метрики: ошибка границ (мс и в долях), доля границ на сильной доле / на начале 4-тактовой фразы,
// точность kind по времени, лишние/пропущенные границы, момент события «section» в часах (RhythmClock).
// ANALYZER=<путь> подменяет 04_analyzer.js, CLOCK=<путь> — 05_clock.js, ARENA=<путь> — 09_arena.js (сравнение «до/после»).
// Арена: прогон ArenaRenderer.updateVariants с состоянием из часов — задержка веса дропа и «хвост» нарастания.
const fs = require("fs"), vm = require("vm"), path = require("path");
const SR = Number(process.argv[2]) || 44100, FILTER = process.argv[3] || "";
const ctx = { console, performance, setTimeout, Math, Float32Array, Float64Array, Int32Array, Uint8Array, Uint32Array, Promise, document: { createElement: () => ({ getContext: () => ({}) }) }, window: {}, navigator: {} };
vm.createContext(ctx);
const src = f => path.join(__dirname, "../src/js", f);
for (const f of ["00_util.js", "04_analyzer.js", "05_clock.js", "09_arena.js"]) {
  const p = f === "04_analyzer.js" && process.env.ANALYZER ? process.env.ANALYZER : f === "05_clock.js" && process.env.CLOCK ? process.env.CLOCK : f === "09_arena.js" && process.env.ARENA ? process.env.ARENA : src(f);
  vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: f });
}
const TAU = Math.PI * 2;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ---- синтез ---- */
function render(dur, events, pads, opts = {}) {
  const n = Math.ceil(dur * SR), out = new Float32Array(n), rnd = rng(opts.seed || 5);
  const noise = new Float32Array(SR); for (let i = 0; i < SR; i++) noise[i] = rnd() * 2 - 1;
  const add = (t0, len, fn) => { const s0 = Math.floor(t0 * SR), L = Math.floor(len * SR); for (let i = 0; i < L && s0 + i < n; i++) if (s0 + i >= 0) out[s0 + i] += fn(i / SR, i); };
  for (const e of events) {
    const v = e.v == null ? 1 : e.v;
    if (e.k === "kick") { let ph = 0; add(e.t, 0.34, (t, i) => { ph += TAU * (46 + 95 * Math.exp(-t * 30)) / SR; return (Math.sin(ph) * Math.exp(-t * 8) * 0.85 + (i < 60 ? noise[i] * 0.25 * (1 - i / 60) : 0)) * v; }); }
    else if (e.k === "snare") { let prev = 0; add(e.t, 0.22, (t, i) => { const x = noise[(i * 3) % SR], hp = x - prev; prev = x; return (hp * Math.exp(-t * 16) * 0.32 + Math.sin(TAU * 188 * t) * Math.exp(-t * 22) * 0.35) * v; }); }
    else if (e.k === "hat") { let prev = 0; add(e.t, 0.05, (t, i) => { const x = noise[(i * 7 + 1000) % SR], hp = x - prev; prev = x; return hp * Math.exp(-t * 70) * 0.5 * v; }); }
    else if (e.k === "bass") add(e.t, e.d || 0.3, t => { const w = TAU * e.f * t; return (Math.sin(w) + 0.5 * Math.sin(2 * w)) * Math.min(1, t * 200) * Math.exp(-t * 5) * 0.22 * v; });
    else if (e.k === "stab") add(e.t, e.d || 0.25, t => { let s = 0; for (const f of e.f) s += Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 2.01 * t) + 0.3 * Math.sin(TAU * f * 3.02 * t); return s * Math.min(1, t * 300) * Math.exp(-t * 7) * 0.07 * v; });
    else if (e.k === "riser") { let prev = 0; add(e.t, e.d, (t, i) => { const x = noise[(i * 5 + 77) % SR], hp = x - prev * 0.6; prev = x; const u = t / e.d; return hp * u * u * 0.22 * v; }); }
  }
  for (const p of pads) add(p.t, p.d, t => { const env = Math.min(1, t / 0.6) * Math.min(1, (p.d - t) / 0.5); let s = 0; for (const f of p.f) s += Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2.005 * t); return s * env * (p.v0 + (p.v1 - p.v0) * t / p.d); });
  if (opts.noise) for (let i = 0; i < n; i++) out[i] += (rnd() * 2 - 1) * opts.noise;
  if (opts.gain) for (let i = 0; i < n; i++) out[i] *= opts.gain(i / SR);
  if (opts.loud) for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i] * opts.loud) * 0.9;
  return out;
}
const CH = [[220, 261.6, 329.6], [174.6, 220, 261.6], [130.8, 164.8, 196], [196, 246.9, 293.7]];
const ROOT = [55, 43.65, 65.4, 49];

/** Структура: sections = [{bars, kind, ...параметры}], bpm, t0. Возвращает буфер, доли и разметку. */
function song(sections, bpm, t0, opts = {}) {
  const P = 60 / bpm, ev = [], pads = [], truth = [];
  let bar = 0;
  for (const s of sections) {
    truth.push({ start: t0 + bar * 4 * P, end: t0 + (bar + s.bars) * 4 * P, kind: s.kind, soft: !!s.soft });
    for (let b = 0; b < s.bars; b++, bar++) {
      const u = b / s.bars, tb = t0 + bar * 4 * P, last = b === s.bars - 1;
      const vol = s.vol == null ? 1 : s.vol;
      const padV = s.pad || [0.04, 0.04];
      pads.push({ t: tb, d: 4 * P, f: CH[bar % 4], v0: padV[0] + (padV[1] - padV[0]) * u, v1: padV[0] + (padV[1] - padV[0]) * (b + 1) / s.bars });
      if (s.fillBars && s.fillBars.includes(b)) { // «фильл»: бочки нет, снейр-раскат
        for (let q = 0; q < 8; q++) ev.push({ k: "snare", t: tb + q * P / 2, v: 0.4 + q * 0.07 });
        continue;
      }
      for (let q = 0; q < 4; q++) {
        const t = tb + q * P;
        if (s.kick === "all" || (s.kick === "one" && q === 0)) ev.push({ k: "kick", t, v: (s.kv || 1) * vol });
        if (s.snare && (q === 1 || q === 3)) ev.push({ k: "snare", t, v: 0.7 * vol });
        if (s.hat) ev.push({ k: "hat", t: t + P / 2, v: s.hat * vol });
        if (s.alt && ((bar >> 2) & 1)) { ev.push({ k: "hat", t, v: 0.5 }); ev.push({ k: "stab", t: t + P * 0.5, f: CH[(bar + 1) % 4], d: P * 0.4, v: 0.8 }); }
        if (s.hat16) { ev.push({ k: "hat", t, v: 0.5 * s.hat16 * vol }); ev.push({ k: "hat", t: t + P * 0.75, v: 0.6 * s.hat16 * vol }); }
        if (s.bass) ev.push({ k: "bass", t: t + P / 2, f: ROOT[bar % 4] * (q === 2 ? 2 : 1), d: P * 0.45, v: vol });
        if (s.stab && (q === 0 || q === 2)) ev.push({ k: "stab", t: t + P * 0.5, f: CH[bar % 4], d: P * 0.7, v: s.stab });
      }
      if (s.roll && b >= s.bars - s.roll) { const r = (b - (s.bars - s.roll)) / s.roll, step = P / (2 + 2 * Math.round(r * 2)); for (let t = tb; t < tb + 4 * P - 1e-6; t += step) ev.push({ k: "snare", t, v: 0.35 + 0.4 * (r + (t - tb) / (4 * P) / s.roll) }); }
    }
    if (s.riser) ev.push({ k: "riser", t: t0 + (bar - s.bars) * 4 * P, d: s.bars * 4 * P, v: s.riser });
  }
  if (opts.jit) { // «человеческая» неровность: громкость каждого удара ±jit, громкость тактов ±gdB
    const r = rng(opts.seed || 9), bg = [];
    for (let b = 0; b < bar; b++) bg.push(Math.pow(10, (r() * 2 - 1) * (opts.gdB || 0) / 20));
    for (const e of ev) { const b = Math.max(0, Math.min(bar - 1, Math.floor((e.t - t0) / (4 * P)))); e.v = (e.v == null ? 1 : e.v) * (1 + opts.jit * (r() * 2 - 1)) * bg[b]; }
    for (const p of pads) { const b = Math.max(0, Math.min(bar - 1, Math.floor((p.t - t0) / (4 * P)))); p.v0 *= bg[b]; p.v1 *= bg[b]; }
  }
  const dur = t0 + bar * 4 * P + 2;
  const beats = []; for (let i = 0; i < bar * 4; i++) beats.push(t0 + i * P);
  return { buf: render(dur, ev, pads, opts), beats, truth, bpm, dur };
}

const TRACKS = [];
const track = (name, f) => TRACKS.push({ name, f });
const A = { kick: 0, hat: 0.7 };
track("EDM intro→build→drop→break→build→drop→outro", () => song([
  { bars: 8, kind: "intro", hat: 0.5, pad: [0.05, 0.05] },
  { bars: 8, kind: "build", kick: "one", kv: 0.8, snare: true, hat: 0.7, hat16: 1, roll: 3, riser: 1, pad: [0.05, 0.1] },
  { bars: 16, kind: "drop", kick: "all", snare: true, hat: 1, bass: true, stab: 1, pad: [0.05, 0.05] },
  { bars: 8, kind: "break", pad: [0.07, 0.07] },
  { bars: 8, kind: "build", kick: "one", kv: 0.8, snare: true, hat: 0.7, hat16: 1, roll: 3, riser: 1, pad: [0.05, 0.1] },
  { bars: 16, kind: "drop", kick: "all", snare: true, hat: 1, bass: true, stab: 1, pad: [0.05, 0.05] },
  { bars: 8, kind: "outro", kick: "all", hat: 0.6, kv: 0.8, pad: [0.05, 0.05] },
], 128, 0.3, { gain: t => 1 }));
track("EDM, 140 BPM, короткие фразы (4 такта)", () => song([
  { bars: 4, kind: "intro", hat: 0.5, pad: [0.05, 0.05] },
  { bars: 4, kind: "build", kick: "one", snare: true, hat: 0.7, hat16: 1, roll: 2, riser: 1, pad: [0.05, 0.1] },
  { bars: 8, kind: "drop", kick: "all", snare: true, hat: 1, bass: true, stab: 1 },
  { bars: 4, kind: "break", pad: [0.07, 0.07] },
  { bars: 4, kind: "build", kick: "one", snare: true, hat: 0.7, hat16: 1, roll: 2, riser: 1, pad: [0.05, 0.1] },
  { bars: 8, kind: "drop", kick: "all", snare: true, hat: 1, bass: true, stab: 1 },
  { bars: 4, kind: "outro", kick: "all", hat: 0.6, kv: 0.8 },
], 140, 0.5));
track("вариации внутри дропа (филлы, смена рисунка)", () => song([
  { bars: 8, kind: "intro", hat: 0.5, pad: [0.05, 0.05] },
  { bars: 8, kind: "build", kick: "one", kv: 0.8, snare: true, hat: 0.7, hat16: 1, roll: 3, riser: 1, pad: [0.05, 0.1] },
  { bars: 32, kind: "drop", kick: "all", snare: true, hat: 1, hat16: 0.8, bass: true, stab: 1, fillBars: [7, 15, 23, 31] },
  { bars: 8, kind: "break", pad: [0.07, 0.07] },
  { bars: 16, kind: "drop", kick: "all", snare: true, hat: 1, bass: true, stab: 1, fillBars: [7, 15] },
  { bars: 8, kind: "outro", kick: "all", hat: 0.6, kv: 0.8 },
], 130, 0.3));
track("EDM «живой»: разброс ударов ±30%, такты ±3 дБ", () => song([
  { bars: 8, kind: "intro", hat: 0.5, pad: [0.05, 0.05] },
  { bars: 8, kind: "build", kick: "one", kv: 0.8, snare: true, hat: 0.7, hat16: 1, roll: 3, riser: 1, pad: [0.05, 0.1] },
  { bars: 16, kind: "drop", kick: "all", snare: true, hat: 1, bass: true, stab: 1 },
  { bars: 8, kind: "break", pad: [0.07, 0.07] },
  { bars: 16, kind: "drop", kick: "all", snare: true, hat: 1, bass: true, stab: 1, fillBars: [15] },
  { bars: 8, kind: "outro", kick: "all", hat: 0.6, kv: 0.8 },
], 122, 0.3, { jit: 0.3, gdB: 3, seed: 21 }));
track("ровный грув «живой», без структуры", () => song([{ bars: 56, kind: "flat", kick: "all", snare: true, hat: 1, bass: true, pad: [0.05, 0.05], fillBars: [27] }], 120, 0.3, { jit: 0.35, gdB: 3, seed: 33 }));
track("ровный грув, рисунок меняется каждые 4 такта, ±5 дБ", () => song([{ bars: 56, kind: "flat", kick: "all", snare: true, hat: 0.8, bass: true, alt: true, pad: [0.05, 0.05], fillBars: [13, 41] }], 124, 0.3, { jit: 0.5, gdB: 5, seed: 44 }));
track("плавная динамика, без дропа", () => {
  const dur = 120, bars = Math.floor((dur - 3) / (4 * 60 / 118));
  return song([{ bars, kind: "smooth", soft: true, kick: "all", snare: true, hat: 0.9, bass: true, pad: [0.05, 0.05] }], 118, 0.3, { gain: t => 0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, t / dur)) });
});
track("сжатый трек без динамики", () => {
  const bars = Math.floor(117 / (4 * 60 / 124));
  return song([{ bars, kind: "flat", kick: "all", snare: true, hat: 1, bass: true, pad: [0.12, 0.12] }], 124, 0.3, { loud: 9, noise: 0.05 });
});
track("ложный провал: филлы на 1 такт", () => {
  // три такта-фильла (бочки нет) внутри ровного грува — это не брейк
  return song([{ bars: 60, kind: "flat", kick: "all", snare: true, hat: 1, bass: true, pad: [0.05, 0.05], fillBars: [11, 27, 43, 55] }], 126, 0.3);
});

/* ---- метрики ---- */
const COMPAT = { intro: ["intro", "calm"], build: ["build"], drop: ["drop", "climax"], break: ["break", "calm"], outro: ["outro", "calm"], flat: ["groove", "calm"], smooth: ["groove", "calm", "build", "intro", "outro", "climax"] };
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
vm.runInContext(`class FakeBuffer { constructor(n, sr){ this.numberOfChannels=1; this.length=n; this.sampleRate=sr; this.duration=n/sr; this._d=new Float32Array(n); } getChannelData(){ return this._d; } }`, ctx);

/** События «section» из RhythmClock при воспроизведении карты. */
function clockRun(m, dur) {
  ctx.__m = m; ctx.__dur = dur;
  return vm.runInContext(`(() => {
    const clock = new RhythmClock({ v: { sensitivity: 1 } });
    clock.setMap(__m);
    const out = [], look = [];
    for (let t = 0; t < __dur; t += 1 / 60) {
      clock.update(t, 1 / 60, null, true);
      for (const e of clock.events) if (e.type === "section") out.push({ t, kind: e.kind, at: e.at });
      look.push([t, clock.kind, clock.nextKind, clock.timeToNext]);
    }
    return { events: out, look };
  })()`, ctx);
}

/** Веса эффектов арены (updateVariants) при проигрывании карты: время включения дропа и нарастания. */
function arenaRun(m, dur, drops, builds) {
  ctx.__m = m; ctx.__dur = dur; ctx.__drops = drops; ctx.__builds = builds;
  return vm.runInContext(`(() => {
    const clock = new RhythmClock({ v: { sensitivity: 1 } });
    clock.setMap(__m);
    const A = Object.create(ArenaRenderer.prototype);
    A.kw = { intro: 0, build: 0, drop: 0, climax: 0, break: 0, calm: 0, groove: 1, outro: 0 };
    A.buildW = 0; A.dropFlash = 0; A.swap = 0; A.swapTarget = 0;
    const mm = { onsets: [] }, dt = 1 / 60, rec = [];
    for (let t = 0; t < __dur; t += dt) {
      clock.update(t, dt, null, true);
      mm.kind = clock.kind; mm.trend = clock.trend; mm.timeToNext = clock.timeToNext;
      mm.dropIn = clock.dropIn; mm.buildProg = clock.buildProg;
      mm.sectionEvent = clock.events.some(e => e.type === "section");
      mm.dropSoon = (clock.nextKind === "drop" || clock.nextKind === "climax") && clock.timeToNext < 4 && clock.timeToNext > 0;
      A.updateVariants(mm, dt);
      rec.push([t, A.kw.drop + A.kw.climax, A.buildW, A.kw.break]);
    }
    const first = (t0, t1, f) => { for (const r of rec) if (r[0] >= t0 && r[0] < t1 && f(r)) return r[0]; return null; };
    const drop = __drops.map(s => { const x = first(s - 1, s + 6, r => r[1] >= 0.5); return x == null ? null : x - s; });
    const tail = __drops.map(s => { const r = rec.find(r => r[0] >= s + 0.25); return r ? r[2] : 0; });
    const build = __builds.map(s => { const x = first(s - 1, s + 8, r => r[2] >= 0.3); return x == null ? null : x - s; });
    let ups = 0, was = false;
    for (const r of rec) { const on = r[1] >= 0.5; if (on && !was) ups++; was = on; }
    return { drop, tail, build, ups };
  })()`, ctx);
}

(async () => {
  const rows = [], agg = { n: 0, errs: [], strong: [0, 0], phrase: [0, 0], acc: [], extra: 0, miss: 0, dropEv: [], arDrop: [], arMiss: 0, arTail: [], arUps: 0 };
  for (const T of TRACKS) {
    if (FILTER && !T.name.includes(FILTER)) continue;
    const g = T.f();
    ctx.__d = g.buf; ctx.__sr = SR;
    const m = await vm.runInContext(`(async()=>{ const b = new FakeBuffer(__d.length, __sr); b._d.set(__d); return await new RhythmAnalyzer().analyze(b); })()`, ctx);
    const P = 60 / g.bpm, t0 = g.beats[0];
    const fb = m.sections.slice(1).map(s => s.start), tb = g.truth.slice(1).map(s => s.start);
    // сопоставление границ (окно 4 с)
    const used = new Set(), errs = [];
    let miss = 0;
    for (const t of tb) {
      let bj = -1, bd = 4;
      fb.forEach((f, j) => { if (!used.has(j) && Math.abs(f - t) < bd) { bd = Math.abs(f - t); bj = j; } });
      if (bj < 0) miss++; else { used.add(bj); errs.push(fb[bj] - t); }
    }
    const extra = g.truth.some(s => s.soft) ? 0 : fb.length - used.size;
    // привязка найденных границ к истинной сетке долей
    let onStrong = 0, onPhrase = 0;
    for (const f of fb) {
      const i = Math.round((f - t0) / P);
      if (Math.abs(f - (t0 + i * P)) < 0.05) { if (i % 4 === 0) onStrong++; if (i % 16 === 0) onPhrase++; }
    }
    // точность kind по времени (шаг 0.25 с)
    let ok = 0, tot = 0;
    for (let t = 0.5; t < g.dur - 2; t += 0.25) {
      const ts = g.truth.find(s => t >= s.start && t < s.end) || g.truth[g.truth.length - 1];
      const fs = m.sections.find(s => t >= s.start && t < s.end) || m.sections[m.sections.length - 1];
      tot++; if (COMPAT[ts.kind].includes(fs.kind)) ok++;
    }
    // часы: момент события дропа/кульминации и самая ранняя подсказка nextKind
    const ck = clockRun(m, g.dur);
    const dropEv = [];
    for (const s of g.truth) if (s.kind === "drop") {
      const e = ck.events.find(x => (x.kind === "drop" || x.kind === "climax") && Math.abs(x.t - s.start) < 4);
      if (e) dropEv.push(e.t - s.start);
    }
    const dropStarts = g.truth.filter(x => x.kind === "drop").map(x => x.start), buildStarts = g.truth.filter(x => x.kind === "build").map(x => x.start);
    const ar = dropStarts.length ? arenaRun(m, g.dur, dropStarts, buildStarts) : null;
    const abs = errs.map(Math.abs);
    const row = {
      "трек": T.name + ` (${SR})`,
      "границ": `${fb.length}/${tb.length}`,
      "лишних": extra, "пропущ.": miss,
      "ош.мс мед": abs.length ? (median(abs) * 1000).toFixed(0) : "-",
      "ош.мс макс": abs.length ? (Math.max(...abs) * 1000).toFixed(0) : "-",
      "ош.долей мед": abs.length ? (median(abs) / P).toFixed(2) : "-",
      "на сильн.": fb.length ? `${(100 * onStrong / fb.length).toFixed(0)}%` : "-",
      "на 4-такт.": fb.length ? `${(100 * onPhrase / fb.length).toFixed(0)}%` : "-",
      "kind %": (100 * ok / tot).toFixed(1),
      "дроп-событие мс": dropEv.length ? dropEv.map(x => (x * 1000).toFixed(0)).join("/") : "-",
      "арена: дроп≥0.5 мс": ar ? ar.drop.map(x => x == null ? "нет" : (x * 1000).toFixed(0)).join("/") : "-",
      "хвост нараст.": ar ? ar.tail.map(x => x.toFixed(2)).join("/") : "-",
      "kind-ы": m.sections.map(s => s.kind[0] + s.kind[1] + "@" + s.start.toFixed(0)).join(" "),
    };
    rows.push(row);
    agg.n++; agg.errs.push(...abs); if (!g.truth.some(x => x.soft)) { agg.strong[0] += onStrong; agg.strong[1] += fb.length; agg.phrase[0] += onPhrase; agg.phrase[1] += fb.length; }
    agg.acc.push(ok / tot); agg.extra += extra; agg.miss += miss; agg.dropEv.push(...dropEv); if (ar) { agg.arDrop.push(...ar.drop.filter(x => x != null)); agg.arMiss += ar.drop.filter(x => x == null).length; agg.arTail.push(...ar.tail); agg.arUps += ar.ups - dropStarts.length; }
  }
  console.log(`sampleRate ${SR}`);
  console.table(rows);
  console.log(`ИТОГО: kind ${(100 * agg.acc.reduce((a, b) => a + b, 0) / agg.acc.length).toFixed(1)}%, лишних границ ${agg.extra}, пропущено ${agg.miss}, ` +
    `ош. границы мед ${(median(agg.errs) * 1000).toFixed(0)} мс, на сильной ${agg.strong[0]}/${agg.strong[1]}, на 4-такт. фразе ${agg.phrase[0]}/${agg.phrase[1]}` +
    (agg.dropEv.length ? `, событие дропа в часах: мед ${(median(agg.dropEv) * 1000).toFixed(0)} мс` : ""));
  console.log(`АРЕНА: вес дропа ≥ 0.5 — мед ${(median(agg.arDrop) * 1000).toFixed(0)} мс после истинной 1-й доли дропа (не включился: ${agg.arMiss}), остаток нарастания через 0.25 с после дропа: макс ${Math.max(...agg.arTail).toFixed(2)}, лишних включений дропа: ${agg.arUps}`);
  console.log("kind-ы: in=intro bu=build dr=drop cl=climax br=break ou=outro ca=calm gr=groove; допустимо: drop≡climax, intro/outro/break≡calm для сравнения по времени");
})();
