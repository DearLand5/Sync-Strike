// Стресс-тест анализатора ритма на «трудной» музыке (Node, без браузера).
// Синтезирует набор треков с известными долями и печатает таблицу точности.
// Запуск: node tools/stress-analyzer.js [44100|48000] [фильтр по имени]
const fs = require("fs"), vm = require("vm"), path = require("path");
const SR = Number(process.argv[2]) || 44100, FILTER = process.argv[3] || "";
const ctx = { console, performance, setTimeout, Math, Float32Array, Float64Array, Int32Array, Uint8Array, Uint32Array, Promise };
vm.createContext(ctx);
for (const f of ["00_util.js", "04_analyzer.js"]) vm.runInContext(fs.readFileSync(f === "04_analyzer.js" && process.env.ANALYZER ? process.env.ANALYZER : path.join(__dirname, "../src/js", f), "utf8"), ctx, { filename: f });
const TAU = Math.PI * 2;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ---- синтез: события (kick/snare/hat/bass) + пэды ---- */
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
  }
  for (const p of pads) add(p.t, p.d, t => { const env = Math.min(1, t / 0.6) * Math.min(1, (p.d - t) / 0.5); let s = 0; for (const f of p.f) s += Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2.005 * t); return s * env * (p.v || 0.05); });
  if (opts.noise) for (let i = 0; i < n; i++) out[i] += (rnd() * 2 - 1) * opts.noise;
  if (opts.loud) for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i] * opts.loud) * 0.9;
  return out;
}
const CH = [[220, 261.6, 329.6], [174.6, 220, 261.6], [130.8, 164.8, 196], [196, 246.9, 293.7]];
const ROOT = [55, 43.65, 65.4, 49];

/** Сетка долей по функции темпа bpmAt(t). */
function grid(t0, dur, bpmAt) { const b = []; let t = t0; while (t < dur - 0.5) { b.push(t); t += 60 / bpmAt(t); } return b; }

/** Раскладывает рисунок по долям; o.drums(t, i) — играют ли ударные на этой доле. */
function build(beats, o) {
  const ev = [], pads = [];
  for (let i = 0; i < beats.length; i++) {
    const t = beats[i], P = (beats[i + 1] || t + 0.5) - t, pos = i % 4, bar = Math.floor(i / 4);
    const on = o.drums(t, i);
    if (i % 16 === 0) pads.push({ t, d: P * 16, f: CH[(i / 16 | 0) % 4], v: o.padVol || 0.05 });
    if (on) o.pattern(ev, t, P, pos, i, o.swing || 0.5);
    if (o.bass && on && pos === 0) ev.push({ k: "bass", t, f: ROOT[bar % 4], d: P * 0.9 });
  }
  return { ev, pads };
}
const four = (ev, t, P, pos, i, sw) => { if (pos === 0 || pos === 2) ev.push({ k: "kick", t, v: pos ? 0.85 : 1 }); if (pos === 1 || pos === 3) ev.push({ k: "snare", t }); ev.push({ k: "hat", t: t + P * sw, v: 0.9 }); ev.push({ k: "hat", t, v: 0.5 }); };
const fourFloor = (ev, t, P, pos) => { ev.push({ k: "kick", t }); if (pos === 1 || pos === 3) ev.push({ k: "snare", t, v: 0.7 }); ev.push({ k: "hat", t: t + P * 0.5, v: 1 }); };
const synco = (ev, t, P, pos) => {
  if (pos === 0) ev.push({ k: "kick", t });
  if (pos === 1) { ev.push({ k: "snare", t }); ev.push({ k: "kick", t: t + P * 0.66, v: 0.9 }); }
  if (pos === 3) { ev.push({ k: "snare", t }); ev.push({ k: "kick", t: t - P * 0.5, v: 0.7 }); }
  ev.push({ k: "hat", t, v: 0.6 }); ev.push({ k: "hat", t: t + P * 0.66, v: 0.9 });
};
const dnb = (ev, t, P, pos, i) => {
  if (pos === 0) ev.push({ k: "kick", t }); if (pos === 1) ev.push({ k: "snare", t });
  if (pos === 2) { ev.push({ k: "kick", t, v: 0.9 }); ev.push({ k: "kick", t: t + P * 0.5, v: 0.6 }); } if (pos === 3) ev.push({ k: "snare", t });
  ev.push({ k: "hat", t: t + P * 0.5, v: 0.8 }); if (i % 2) ev.push({ k: "hat", t, v: 0.5 });
};
const dnb2 = (ev, t, P, pos, i) => { // бочка на «и» третьей доли, без бочки на самой доле — фаза неоднозначна
  if (pos === 0) ev.push({ k: "kick", t }); if (pos === 1) ev.push({ k: "snare", t });
  if (pos === 2) ev.push({ k: "kick", t: t + P * 0.5, v: 0.85 }); if (pos === 3) ev.push({ k: "snare", t });
  ev.push({ k: "hat", t: t + P * 0.5, v: 0.8 }); if (i % 2) ev.push({ k: "hat", t, v: 0.5 });
};
const always = () => true;
const TRACKS = [];
const track = (name, f) => TRACKS.push({ name, f });

track("4/4 128 BPM", () => { const dur = 70, b = grid(0.3, dur, () => 128); const { ev, pads } = build(b, { drums: always, pattern: four, bass: true }); return { buf: render(dur, ev, pads), beats: b, bpm: 128 }; });
track("медленный 72", () => { const dur = 70, b = grid(0.4, dur, () => 72); const { ev, pads } = build(b, { drums: always, pattern: four, bass: true }); return { buf: render(dur, ev, pads), beats: b, bpm: 72 }; });
track("DnB 174", () => { const dur = 70, b = grid(0.2, dur, () => 174); const { ev, pads } = build(b, { drums: always, pattern: dnb, bass: true }); return { buf: render(dur, ev, pads), beats: b, bpm: 174 }; });
track("DnB 174 бочка на «и»", () => { const dur = 70, b = grid(0.2, dur, () => 174); const { ev, pads } = build(b, { drums: always, pattern: dnb2, bass: true }); return { buf: render(dur, ev, pads), beats: b, bpm: 174 }; });
track("синкопы+свинг 100", () => { const dur = 70, b = grid(0.3, dur, () => 100); const { ev, pads } = build(b, { drums: always, pattern: synco, bass: true, swing: 0.66 }); return { buf: render(dur, ev, pads), beats: b, bpm: 100 }; });
track("пэды 18 с, бит 120", () => { const dur = 80, st = 18, b = grid(0.3, dur, () => 120); const { ev, pads } = build(b, { drums: t => t >= st, pattern: four, bass: true }); return { buf: render(dur, ev, pads), beats: b, bpm: 120, mask: t => t >= st }; });
track("дрейф 118→124", () => { const dur = 90, b = grid(0.3, dur, t => 118 + 6 * Math.min(1, t / dur)); const r = rng(11); const j = b.map(t => t + (r() - 0.5) * 0.016); const { ev, pads } = build(j, { drums: always, pattern: four, bass: true }); return { buf: render(dur, ev, pads), beats: j, bpm: 121 }; });
track("смена темпа 100→140", () => { const dur = 80, b = grid(0.3, dur, t => t < 40 ? 100 : 140); const { ev, pads } = build(b, { drums: always, pattern: four, bass: true }); return { buf: render(dur, ev, pads), beats: b, bpm: 100, bpm2: 140 }; });
track("брейк 8 тактов", () => { const dur = 100, b = grid(0.3, dur, () => 126), s0 = 24, s1 = s0 + 60 / 126 * 32; const { ev, pads } = build(b, { drums: t => t < s0 || t >= s1, pattern: four, bass: true }); return { buf: render(dur, ev, pads), beats: b, bpm: 126, breakRange: [s0, s1] }; });
track("громкий мастеринг", () => { const dur = 70, b = grid(0.3, dur, () => 124); const { ev, pads } = build(b, { drums: always, pattern: fourFloor, bass: true, padVol: 0.12 }); return { buf: render(dur, ev, pads, { loud: 9, noise: 0.05 }), beats: b, bpm: 124 }; });

vm.runInContext(`class FakeBuffer { constructor(n, sr){ this.numberOfChannels=1; this.length=n; this.sampleRate=sr; this.duration=n/sr; this._d=new Float32Array(n); } getChannelData(){ return this._d; } }`, ctx);
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };

(async () => {
  const rows = []; let tot = 0;
  for (const T of TRACKS) {
    if (FILTER && !T.name.includes(FILTER)) continue;
    const g = T.f();
    ctx.__d = g.buf; ctx.__sr = SR;
    const m = await vm.runInContext(`(async()=>{ const b = new FakeBuffer(__d.length, __sr); b._d.set(__d); return await new RhythmAnalyzer().analyze(b); })()`, ctx);
    tot += m.ms;
    const found = Array.from(m.beats), mask = g.mask || (() => true);
    // октавное соответствие: сетка в 2 раза реже/чаще истинной, но в диапазоне 80–160 BPM — допустимый вариант
    const ratio0 = m.bpm / (g.bpm2 ? g.bpm2 : g.bpm), half = Math.abs(ratio0 - 0.5) < 0.05, dbl = Math.abs(ratio0 - 2) < 0.1;
    let tb = g.beats;
    if (dbl) { tb = []; for (let k = 0; k < g.beats.length; k++) { tb.push(g.beats[k]); if (k + 1 < g.beats.length) tb.push((g.beats[k] + g.beats[k + 1]) / 2); } }
    if (half) { const e = ph => { const a = g.beats.filter((_, k) => k % 2 === ph); return a.reduce((acc, t) => { let b = 1e9; for (const x of found) if (Math.abs(x - t) < b) b = Math.abs(x - t); return acc + b; }, 0) / a.length; }; const ph = e(0) <= e(1) ? 0 : 1; tb = g.beats.filter((_, k) => k % 2 === ph); }
    const octFlag = (half || dbl) ? ((m.bpm >= 80 && m.bpm <= 160) ? (half ? "/2*" : "x2*") : (half ? "/2!" : "x2!")) : "";
    const errOf = t => { let b = 1e9; const j = ctx.lowerIndex(m.beats, t); for (let k = Math.max(0, j - 2); k <= Math.min(found.length - 1, j + 2); k++) if (Math.abs(found[k] - t) < Math.abs(b)) b = found[k] - t; return Math.abs(b); };
    const sel = pred => tb.map((t, i) => ({ t, i })).filter(x => pred(x.t) && x.t > 1);
    const inBreak = t => g.breakRange && t >= g.breakRange[0] && t < g.breakRange[1];
    const evalSet = sel(t => mask(t) && !inBreak(t));
    const errs = evalSet.map(x => errOf(x.t));
    const pct = lim => 100 * errs.filter(e => e <= lim).length / errs.length;
    let brk = "-";
    if (g.breakRange) { const e = sel(inBreak).map(x => errOf(x.t)); brk = (100 * e.filter(v => v <= 0.06).length / e.length).toFixed(0) + "%"; }
    // сильные доли: найденная сильная доля должна лежать на истинной 1-й доле такта
    let sOk = 0, sN = 0;
    for (const x of evalSet) if (!(half || dbl) && x.i % 4 === 0) {
      const j = ctx.lowerIndex(m.beats, x.t - 0.06); let bk = -1, bd = 0.06;
      for (let k = Math.max(0, j - 1); k <= Math.min(found.length - 1, j + 2); k++) if (Math.abs(found[k] - x.t) < bd) { bd = Math.abs(found[k] - x.t); bk = k; }
      if (bk >= 0) { sN++; if (m.strong[bk]) sOk++; }
    }
    // медианный интервал найденных долей в окне оценки — реальный темп сетки
    const iv = []; for (let k = 1; k < found.length; k++) if (found[k] > 1 && mask(found[k])) iv.push(found[k] - found[k - 1]);
    const gridBpm = 60 / median(iv);
    const oct = r => octFlag || (Math.abs(r - 1) < 0.04 ? "ok" : "?");
    const trueBpm = g.bpm2 ? `${g.bpm}→${g.bpm2}` : String(g.bpm);
    rows.push({ "трек": T.name, "BPM": m.bpm.toFixed(1), "истина": trueBpm, "окт.": oct(m.bpm / g.bpm), "сетка": gridBpm.toFixed(1), "<=30мс": pct(0.03).toFixed(0) + "%", "<=60мс": pct(0.06).toFixed(0) + "%", "мед.мс": (median(errs) * 1000).toFixed(1), "брейк": brk, "сильн.": sN ? (100 * sOk / sN).toFixed(0) + "%" : "-", "долей": (found.length / tb.length).toFixed(2), "режим": m.mode, "мс": m.ms });
  }
  console.log(`sampleRate ${SR}`);
  console.table(rows);
  console.log("окт.: * — октавный вариант в диапазоне 80–160 BPM (допустимо, оценка по доле соответствующей сетки), ! — вне диапазона; смена темпа оценивается по ближайшей доле");
  console.log(`время анализа суммарно: ${tot} мс`);
})();
