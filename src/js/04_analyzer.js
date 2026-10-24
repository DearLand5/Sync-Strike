/* =====================================================================
   RhythmAnalyzer — анализ трека.
   1) Офлайн: STFT → спектральный поток по трём полосам → темп
      (автокорреляция с априорным весом) → доли (динамическое
      программирование) → сильные доли → энергия и секции → уверенность.
   2) Живой: спектр AnalyserNode для визуальной реакции и подстройки фазы.
   ===================================================================== */
class FFT {
  constructor(n) {
    this.n = n;
    this.rev = new Uint32Array(n);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cos = new Float32Array(n / 2);
    this.sin = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) { this.cos[i] = Math.cos(TAU * i / n); this.sin[i] = Math.sin(TAU * i / n); }
  }
  /** Прямое БПФ на месте. */
  transform(re, im) {
    const n = this.n, rev = this.rev;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = i + j, b = a + half;
          const c = this.cos[k], s = this.sin[k];
          const tre = re[b] * c + im[b] * s;
          const tim = -re[b] * s + im[b] * c;
          re[b] = re[a] - tre; im[b] = im[a] - tim;
          re[a] += tre; im[a] += tim;
        }
      }
    }
  }
}

const BANDS = { low: [30, 160], mid: [160, 2500], high: [2500, 11000] };
/** Эмпирическая поправка положения события относительно центра кадра (с).
    Подобрана по демо-треку с известными долями (tools/test-analyzer). */
const ONSET_BIAS = 0.004;

/* =====================================================================
   Режиссёр: части трека (анализ). Части задают эффекты арены (нарастание, дроп, брейк…).
   Сегментация по тактам (от сильных долей) методом оптимального разбиения:
   такт — вектор признаков (уровни в дБ по полосам относительно громкой части трека + плотность потока
   в трёх полосах), часть — участок с «постоянными» признаками. Цена границы выражена в единицах шума
   самого трека (шум — медиана разностей соседних тактов, не меньше нижней границы), поэтому на «живом»
   треке с неровностью и на чистом синтезированном порог один и тот же; границы тянутся к сетке фраз
   (кратно 8 / 4 тактам от общего смещения), минимум ~4 такта. После разбиения соседи, различие между
   которыми не заметно ни по одному признаку (меньше порога τ), сливаются. Затем каждая часть получает kind
   по «интенсивности» (уровни + плотность событий) относительно самого трека: скачок вверх — вход (дроп),
   вниз — брейк, нарастание — рост перед входом. Границы всегда лежат на сильных долях.
   ===================================================================== */
const SECTION_DIMS = [   // признак, вес в разбиении, нижняя граница шума σ, порог заметного различия τ
  ["e", 1.0, 0.07, 0.12], ["l", 0.9, 0.07, 0.15], ["m", 0.4, 0.09, 0.18], ["h", 0.5, 0.09, 0.18],
  ["kf", 0.8, 0.12, 0.22], ["mf", 0.4, 0.12, 0.22], ["hf", 0.5, 0.12, 0.22],
];
const SECTION_LAMBDA = 40;       // цена границы в единицах σ² (сумма взвешенных квадратов отклонений признаков по тактам)

/** Медианный фильтр радиуса r: убирает одиночные «выбросы» тактов (филлы, паузы, стоп-тайм) и сохраняет ступени. */
function medianFilter(arr, r) {
  const out = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const w = arr.slice(Math.max(0, i - r), Math.min(arr.length, i + r + 1)).sort((x, y) => x - y);
    out[i] = w[w.length >> 1];
  }
  return out;
}

/** Такты трека и их признаки (от сильных долей): границы тактов, уровни энергии/низов/середины/верхов (по мощности такта в дБ
    относительно p90 тактов трека, размах фиксирован) и плотность потока бочки/середины/верхов (относительно трека).
    Общая часть для buildSections и инструментов отладки. */
function sectionBars(a) {
  const { beats, strong, duration, envFps, energy, bl, fL, fM, fH, pL, pM, pH, frameOf } = a;
  const st = [];
  for (let i = 0; i < beats.length; i++) if (strong[i]) st.push(beats[i]);
  const gaps = [];
  for (let i = 1; i < st.length; i++) gaps.push(st[i] - st[i - 1]);
  const barLen = gaps.length ? median(gaps) : 2;
  /* границы тактов: начало трека, сильные доли, конец; неполные такты по краям сливаются с соседними */
  const edges = [0];
  for (const t of st) if (t > edges[edges.length - 1] + 0.6 * barLen) edges.push(t);
  if (edges.length > 1 && duration - edges[edges.length - 1] < 0.6 * barLen) edges.pop();
  edges.push(duration);
  let B = edges.length - 1;
  const Lmin = clamp(Math.ceil(7 / barLen), 2, 4);
  /* тишина в хвосте (после последнего звука) не должна влиять на последнюю часть — она просто в неё входит */
  const envMeanTail = k => { let s = 0, c = 0; for (let i = Math.floor(edges[k] * envFps); i < Math.min(energy.length, Math.ceil(edges[k + 1] * envFps)); i++) { s += energy[i] + bl[i]; c++; } return c ? s / c : 0; };
  while (B > 2 * Lmin && envMeanTail(B - 1) < 0.05) { edges.splice(B - 1, 1); B--; }
  edges[B] = duration;
  let lastLoud = energy.length - 1;
  while (lastLoud > 0 && energy[lastLoud] < 0.04 && bl[lastLoud] < 0.04) lastLoud--;
  const tLoud = (lastLoud + 1) / envFps;
  /* признаки тактов (окно последнего такта кончается там, где кончается звук) */
  const frMean = (arr, t0, t1) => { const i0 = frameOf(t0), i1 = Math.max(i0 + 1, frameOf(t1)); let s = 0; for (let i = i0; i < i1; i++) s += arr[i]; return s / (i1 - i0); };
  const raw = { e: [], l: [], m: [], h: [], kf: [], mf: [], hf: [] };
  const dbs = { e: [], l: [], m: [], h: [] };
  const db = v => 10 * Math.log10(v + 1e-12);   // мощность такта усредняем по мощности, затем в дБ: «качание» сайдчейна не размывает уровень
  for (let k = 0; k < B; k++) {
    const t0 = edges[k], t1 = Math.min(edges[k + 1], Math.max(tLoud, t0 + 1));
    const pl = frMean(pL, t0, t1), pm = frMean(pM, t0, t1), ph = frMean(pH, t0, t1);
    dbs.e.push(db(pl + pm + ph)); dbs.l.push(db(pl)); dbs.m.push(db(pm)); dbs.h.push(db(ph));
    raw.kf.push(frMean(fL, t0, t1)); raw.mf.push(frMean(fM, t0, t1)); raw.hf.push(frMean(fH, t0, t1));
  }
  /* уровни — в дБ относительно громкой части трека (p90 тактов), фиксированный размах: тихий такт = 0, громкий = 1 */
  for (const [key, span] of [["e", 15], ["l", 22], ["m", 18], ["h", 22]]) {
    const ref = percentile(dbs[key], 0.9);
    for (let k = 0; k < B; k++) raw[key].push(clamp(1 + (dbs[key][k] - ref) / span, 0, 1.15));
  }
  for (const key of ["kf", "mf", "hf"]) {   // потоки — относительно трека (p90 тактов, не меньше 1.5 среднего)
    const arr = raw[key], mean = arr.reduce((x, y) => x + y, 0) / B || 1e-6;
    const sc = Math.max(percentile(arr, 0.9), 1.5 * mean, 1e-6);
    for (let k = 0; k < B; k++) arr[k] = Math.min(1.3, arr[k] / sc);
  }
  const F = {};
  for (const [key] of SECTION_DIMS) F[key] = medianFilter(raw[key], 2);
  /* интенсивность такта = «бас» (уровни в дБ — абсолютные, + плотность бочки) + «воздух» (середина/верха и плотность событий —
     относительно диапазона самого трека; размах не уже 0.3, чтобы шум ровного трека не раздувался в «структуру») */
  const rel = key => { const lo = percentile(F[key], 0.1), hi = percentile(F[key], 0.9), r = Math.max(hi - lo, 0.3); return F[key].map(v => clamp((v - lo) / r, 0, 1)); };
  const rh = rel("h"), rhf = rel("hf"), rmf = rel("mf"), rkf = rel("kf");
  const I = new Array(B);
  for (let k = 0; k < B; k++) {
    const bass = 0.40 * F.e[k] + 0.35 * F.l[k] + 0.25 * rkf[k], air = 0.35 * rh[k] + 0.35 * rhf[k] + 0.30 * rmf[k];
    I[k] = 0.65 * bass + 0.35 * air;
  }
  return { edges, B, barLen, Lmin, raw, F, I, tLoud };
}

/** Признаки тактов в компактном виде для карты (IndexedDB): только то, что нужно segmentBars. */
function packBars(b) {
  const r3 = arr => Array.from(arr, v => Math.round(v * 1000) / 1000);
  const raw = {}, F = {};
  for (const [key] of SECTION_DIMS) { raw[key] = r3(b.raw[key]); F[key] = r3(b.F[key]); }
  return { edges: r3(b.edges), B: b.B, barLen: b.barLen, Lmin: b.Lmin, tLoud: b.tLoud, raw, F, I: r3(b.I) };
}

function buildSections(a) { return segmentBars(a, sectionBars(a), 1); }

/** Разбиение по уже посчитанным тактам. mul — множитель цены границы (ручная «чувствительность» Режиссёра:
    > 1 — реже смены частей, < 1 — чаще). a нужны duration, envFps, energy, bl, bh, confidence. */
function segmentBars(a, bars, mul) {
  const { duration } = a;
  const { edges, B, Lmin, F } = bars;
  const single = () => finishSections(a, bars, [{ start: 0, end: duration, i0: 0, i1: B }]);
  /* ритма нет (эмбиент, свободный темп; уверенность < 0.4): сетка тактов условна, лазеры и «брейки» не к месту — одна спокойная часть */
  if (B < 2 * Lmin || B < 6 || (a.confidence != null && a.confidence < 0.4)) return single();
  /* ритм найден неуверенно (0.4–0.5: живая игра, плавающий темп): части нужны только при резких перепадах — цена границы ×3,
     различие частей ×2, вход и брейк только резкие; плавные «волны» громкости событиями не становятся */
  const weak = a.confidence != null && a.confidence < 0.5;

  /* шум признака — медиана модуля разности соседних тактов (на ступенях разность большая, но их мало) */
  const D = SECTION_DIMS.length;
  const S1 = SECTION_DIMS.map(() => new Float64Array(B + 1)), S2 = SECTION_DIMS.map(() => new Float64Array(B + 1));
  SECTION_DIMS.forEach(([key, w, floor], d) => {
    const diffs = [];
    for (let k = 0; k + 1 < B; k++) diffs.push(Math.abs(bars.raw[key][k + 1] - bars.raw[key][k]));
    const sigma = Math.max(floor, 1.5 * median(diffs)), g = Math.sqrt(w) / sigma;
    for (let k = 0; k < B; k++) { const x = F[key][k] * g; S1[d][k + 1] = S1[d][k] + x; S2[d][k + 1] = S2[d][k] + x * x; }
  });
  const cost = (i, j) => { let c = 0; const n = j - i; for (let d = 0; d < D; d++) { const s = S1[d][j] - S1[d][i]; c += S2[d][j] - S2[d][i] - s * s / n; } return c; };

  /* оптимальное разбиение; смещение фазы фраз перебираем (0..7) и берём лучшее */
  let best = null;
  for (let ph = 0; ph < 8; ph++) {
    const dp = new Float64Array(B + 1).fill(Infinity), from = new Int32Array(B + 1).fill(-1);
    dp[0] = 0;
    const pen = i => { if (i === 0) return 0; const r = ((i - ph) % 8 + 8) % 8; return SECTION_LAMBDA * mul * (weak ? 3 : 1) * (1 + (r === 0 ? 0 : r === 4 ? 0.19 : r % 2 === 0 ? 0.69 : 1.06)); };
    for (let j = Lmin; j <= B; j++) {
      if (j < B && B - j < Lmin) continue;
      for (let i = 0; i <= j - Lmin; i++) {
        if (dp[i] === Infinity || (i > 0 && i < Lmin)) continue;
        const v = dp[i] + cost(i, j) + pen(i);
        if (v < dp[j]) { dp[j] = v; from[j] = i; }
      }
    }
    if (dp[B] < Infinity && (!best || dp[B] < best.cost - 1e-9)) {
      const cuts = []; let j = B;
      while (j > 0) { const i = from[j]; cuts.push(i); j = i; }
      best = { cost: dp[B], cuts: cuts.reverse(), ph };
    }
  }
  if (!best) return single();
  let segs = [];
  for (let s = 0; s < best.cuts.length; s++) {
    const i = best.cuts[s], j = s + 1 < best.cuts.length ? best.cuts[s + 1] : B;
    segs.push({ start: i === 0 ? 0 : edges[i], end: j === B ? duration : edges[j], i0: i, i1: j });
  }
  /* слияние соседей, между которыми нет заметного различия ни по одному признаку (статистически значимая, но неслышная ступень) */
  const mean = (key, i0, i1) => { let s = 0; for (let k = i0; k < i1; k++) s += F[key][k]; return s / (i1 - i0); };
  const avgI = (x) => { let s = 0; for (let k = x.i0; k < x.i1; k++) s += bars.I[k]; return s / (x.i1 - x.i0); };
  const contrast = (x, y) => { let c = Math.abs(avgI(x) - avgI(y)) / 0.12; for (const [key, , , tau] of SECTION_DIMS) c = Math.max(c, Math.abs(mean(key, x.i0, x.i1) - mean(key, y.i0, y.i1)) / tau); return c; };
  for (;;) {
    let wi = -1, wc = (weak ? 2 : 1) * Math.sqrt(mul);
    for (let i = 0; i + 1 < segs.length; i++) { const c = contrast(segs[i], segs[i + 1]); if (c < wc) { wc = c; wi = i; } }
    if (wi < 0) break;
    segs.splice(wi, 2, { start: segs[wi].start, end: segs[wi + 1].end, i0: segs[wi].i0, i1: segs[wi + 1].i1 });
  }
  return finishSections(a, bars, segs);
}

/** Характер частей (kind) по интенсивности относительно трека + слияние соседних одинаковых. */
function finishSections(a, bars, segs) {
  const { duration, envFps, energy, bl, bh } = a;
  const { I, F } = bars;
  const weak = a.confidence != null && a.confidence < 0.5, EDGE = weak ? 0.35 : 0.1;   // резкость границы, нужная для входа/брейка
  const secMean = (arr, t0, t1) => { let s = 0, c = 0; for (let i = Math.floor(t0 * envFps); i < Math.min(arr.length, Math.ceil(t1 * envFps)); i++) { s += arr[i]; c++; } return c ? s / c : 0; };
  const gLow = secMean(bl, 0, duration), gHigh = secMean(bh, 0, duration);
  const tLoud = bars.tLoud;
  const slopeOf = sc => { const e1 = Math.max(sc.start + 1, Math.min(sc.end, tLoud)), q = Math.min(4, (e1 - sc.start) * 0.25); return secMean(energy, e1 - q, e1) - secMean(energy, sc.start, sc.start + q); };
  const avg = (arr, i0, i1) => { let s = 0; for (let k = i0; k < i1; k++) s += arr[k]; return s / Math.max(1, i1 - i0); };
  segs.forEach(sc => {
    const e = secMean(energy, sc.start, Math.max(sc.start + 1, Math.min(sc.end, tLoud)));
    sc.energy = e; sc.level = e < 0.38 ? "calm" : e > 0.66 ? "intense" : "mid";
    sc.slope = slopeOf(sc);
    sc.bassy = secMean(bl, sc.start, sc.end) > gLow * 1.12;
    sc.bright = secMean(bh, sc.start, sc.end) > gHigh * 1.12;
    /* интенсивность части и её ход внутри (последняя треть минус первая) */
    const n = sc.i1 - sc.i0, th = Math.max(1, Math.floor(n / 3));
    sc.drive = avg(I, sc.i0, sc.i1); sc.low = avg(F.l, sc.i0, sc.i1);
    sc.rise = n >= 3 ? avg(I, sc.i1 - th, sc.i1) - avg(I, sc.i0, sc.i0 + th) : 0;
    /* резкость границы слева: изменение интенсивности (или баса) между 4 тактами до и 4 после — плавный подъём на ступеньки не режется на «дропы» */
    const k0 = sc.i0;
    sc.edge = k0 > 0 ? Math.max(avg(I, k0, k0 + 4) - avg(I, Math.max(0, k0 - 4), k0), 0.7 * (avg(F.l, k0, k0 + 4) - avg(F.l, Math.max(0, k0 - 4), k0))) : 0;
  });
  const n = segs.length;
  /* «громко» и «тихо» трека — взвешенные по длительности перцентили средних интенсивностей ЧАСТЕЙ (не тактов: шум тактов смещал бы порог) */
  const byDrive = segs.map(s => [s.drive, s.end - s.start]).sort((x, y) => x[0] - y[0]);
  const wq = q => { let acc = 0; const tot = byDrive.reduce((x, y) => x + y[1], 0); for (const [v, w] of byDrive) { acc += w; if (acc >= q * tot) return v; } return byDrive[byDrive.length - 1][0]; };
  const Ihi = wq(0.75), Ilo = wq(0.12), R = Math.max(Ihi - Ilo, 0.25);
  const isHot = sc => sc.drive >= Ihi - 0.22 * R;
  const Imax = Math.max(...segs.map(s => s.drive));
  const hotKind = k => k === "drop" || k === "climax";
  /* опорные уровни: самая тихая / самая громкая из частей за REF_WIN секунд до начала (ступенчатое нарастание считаем целиком) */
  const REF_WIN = 45;
  const refOf = (i, pick) => {
    let r = null;
    for (let j = i - 1; j >= 0; j--) {
      const o = Math.min(segs[j].end, segs[i].start) - Math.max(segs[j].start, segs[i].start - REF_WIN);
      if (o < 4 && j !== i - 1) { if (segs[j].end <= segs[i].start - REF_WIN) break; continue; }
      r = r == null ? segs[j].drive : pick(r, segs[j].drive);
    }
    return r == null ? segs[i].drive : r;
  };
  let hotSeen = false;
  segs.forEach((sc, i) => {
    const p = i ? segs[i - 1] : null, nx = i + 1 < n ? segs[i + 1] : null;
    const step = p ? sc.drive - p.drive : 0;
    const len = sc.end - sc.start, hot = isHot(sc);
    /* вход: громкая часть после негромкой — скачок интенсивности, ступень баса или ступенчатый подъём за последние 45 с */
    const enters = (q, pp, i2) => pp && q.edge >= EDGE && (
      (isHot(q) && (!isHot(pp) || q.low - pp.low >= 0.2) && (q.drive - pp.drive >= 0.08 || q.low - pp.low >= 0.2 || q.drive - refOf(i2, Math.min) >= 0.15)) ||
      (q.low - pp.low >= 0.3 && q.low >= 0.8 && q.drive >= 0.55));   // вступил бас — вход, даже если часть не «самая громкая» трека
    const nxEnter = nx ? enters(nx, sc, i + 1) : false;
    const nxBass = nx && isHot(nx) && nx.low - sc.low >= 0.2;                       // у следующей части вступил бас: эта — разгон
    let kind;
    if (n === 1) kind = sc.drive < 0.33 ? "calm" : "groove";
    else if (i === 0 && !hot && len <= Math.max(60, 0.3 * duration)) kind = "intro";
    else if (i === n - 1 && step <= -0.12 && len <= Math.max(35, 0.25 * duration)) kind = "outro";
    else if (p && !hot && step <= -0.1 && (sc.edge <= -EDGE || step <= -0.25) && refOf(i, Math.max) - sc.drive >= 0.18 && sc.drive <= 0.85 * refOf(i, Math.max) && (len <= 40 || sc.low < 0.6 || (step <= -0.2 && sc.edge <= -0.15))) kind = "break";
    else if ((nxBass && len <= 45) || (nxEnter && !hot && (len <= 45 || sc.rise >= 0.1))) kind = "build";   // перед входом: нарастание
    else if (enters(sc, p, i)) kind = hotSeen && sc.drive >= Imax - 0.03 ? "climax" : "drop";
    else if (p && hotKind(p.kind) && hot) kind = p.kind;                          // продолжение дропа не меняет эффект
    else kind = sc.drive < 0.33 ? "calm" : "groove";
    sc.kind = kind;
    if (hotKind(kind)) hotSeen = true;
  });
  /* слияние соседних частей одного характера и уровня (смена без смысла = дребезг эффектов) */
  const out = [];
  for (const sc of segs) {
    const p = out[out.length - 1];
    if (p && p.kind === sc.kind) {
      const w0 = p.end - p.start, w1 = sc.end - sc.start;
      p.energy = (p.energy * w0 + sc.energy * w1) / (w0 + w1);
      p.level = p.energy < 0.38 ? "calm" : p.energy > 0.66 ? "intense" : "mid";
      p.drive = (p.drive * w0 + sc.drive * w1) / (w0 + w1); p.low = (p.low * w0 + sc.low * w1) / (w0 + w1);
      p.end = sc.end; p.i1 = sc.i1; p.bassy = p.bassy || sc.bassy; p.bright = p.bright || sc.bright;
      p.slope = slopeOf(p);
    } else out.push(sc);
  }
  out.forEach((sc, i) => { sc.delta = i ? sc.energy - out[i - 1].energy : 0; delete sc.i0; delete sc.i1; delete sc.rise; delete sc.low; delete sc.edge; });
  return out;
}

class RhythmAnalyzer {
  constructor() {
    this.live = { low: 0, mid: 0, high: 0, energy: 0, flux: 0, onset: false, onsetStrength: 0 };
    this._liveBytes = null;
    this._livePrev = null;
    this._livePeak = { low: 0.2, mid: 0.2, high: 0.2 };
    this._fluxAvg = 0;
    this._lastLiveOnset = -1;
  }

  /* ------------------------------------------------------------------
     Офлайн-анализ. onProgress(доля 0..1, подпись).
     ------------------------------------------------------------------ */
  async analyze(buffer, onProgress = () => {}) {
    const t0 = performance.now();
    const sr0 = buffer.sampleRate;
    const factor = Math.max(1, Math.round(sr0 / 22050));
    const sr = sr0 / factor;
    const nCh = buffer.numberOfChannels;
    const chans = [];
    for (let c = 0; c < nCh; c++) chans.push(buffer.getChannelData(c));
    const n = Math.floor(buffer.length / factor);
    const mono = new Float32Array(n);
    const norm = 1 / (nCh * factor);
    onProgress(0.01, "Подготовка звука");
    for (let i = 0; i < n; i++) {
      let s = 0;
      const base = i * factor;
      for (let c = 0; c < nCh; c++) { const d = chans[c]; for (let k = 0; k < factor; k++) s += d[base + k]; }
      mono[i] = s * norm;
      if ((i & 0x7ffff) === 0 && i) { onProgress(0.01 + 0.04 * i / n, "Подготовка звука"); await yieldToUI(); }
    }

    /* ---- STFT и спектральный поток ---- */
    const N = 1024, H = 256;
    const frames = Math.max(8, Math.floor((n - N) / H) + 1);
    const fps = sr / H;
    const fft = new FFT(N);
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(TAU * i / (N - 1));
    const re = new Float32Array(N), im = new Float32Array(N);
    const binHz = sr / N, half = N / 2;
    const band = new Uint8Array(half);       // 0 — вне полос, 1 низ, 2 середина, 3 верх
    for (let k = 1; k < half; k++) {
      const f = k * binHz;
      band[k] = f >= BANDS.low[0] && f < BANDS.low[1] ? 1 : f < BANDS.mid[1] && f >= BANDS.mid[0] ? 2 : f >= BANDS.high[0] && f < BANDS.high[1] ? 3 : 0;
    }
    const eL = new Float32Array(frames), eM = new Float32Array(frames), eH = new Float32Array(frames);
    const fL = new Float32Array(frames), fM = new Float32Array(frames), fH = new Float32Array(frames);
    const rms = new Float32Array(frames), cent = new Float32Array(frames);
    let mL = 0, mM = 0, mH = 0;   // суммы амплитуд по полосам (для признаков)
    const prevLog = new Float32Array(half);
    // грубая «хрома»: 22 полосы 43–1980 Гц (ноты баса и аккордов) — для смены гармонии на первой доле такта
    const HZE = [43, 64, 86, 107, 129, 150, 172, 194, 215, 258, 301, 344, 408, 473, 559, 645, 753, 882, 1033, 1205, 1420, 1680, 1980];
    const NH = HZE.length - 1, harm = new Float32Array(frames * NH), hb = new Uint8Array(half).fill(255);
    for (let k = 1; k < half; k++) { const f = k * binHz; for (let b = 0; b < NH; b++) if (f >= HZE[b] && f < HZE[b + 1]) hb[k] = b; }
    for (let f = 0; f < frames; f++) {
      const off = f * H;
      let sq = 0;
      for (let i = 0; i < N; i++) { const x = off + i < n ? mono[off + i] : 0; re[i] = x * win[i]; im[i] = 0; sq += x * x; }
      rms[f] = Math.sqrt(sq / N);
      fft.transform(re, im);
      let el = 0, em = 0, eh = 0, fl = 0, fm = 0, fh = 0, cw = 0, cs = 0;
      for (let k = 1; k < half; k++) {
        const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
        const lg = Math.log1p(mag);
        const d = lg - prevLog[k];
        prevLog[k] = lg;
        const p = mag * mag;
        if (hb[k] < 255) harm[f * NH + hb[k]] += mag;
        cw += mag * k; cs += mag;
        switch (band[k]) {
          case 1: el += p; mL += mag; if (d > 0) fl += d; break;
          case 2: em += p; mM += mag; if (d > 0) fm += d; break;
          case 3: eh += p; mH += mag; if (d > 0) fh += d; break;
        }
      }
      eL[f] = el; eM[f] = em; eH[f] = eh;
      fL[f] = fl; fM[f] = fm; fH[f] = fh;
      cent[f] = cs > 0 ? (cw / cs) * binHz : 0;
      if ((f & 255) === 0) { onProgress(0.05 + 0.6 * f / frames, "Спектральный анализ"); await yieldToUI(); }
    }
    fL[0] = fM[0] = fH[0] = 0;
    // нормировка полос к своему 98-му перцентилю
    const nrm = arr => { const p = percentile(arr, 0.98, 2) || 1; for (let i = 0; i < arr.length; i++) arr[i] /= p; };
    nrm(fL); nrm(fM); nrm(fH);

    /* ---- огибающая событий ---- */
    const O = new Float32Array(frames);
    for (let i = 0; i < frames; i++) O[i] = 1.0 * fL[i] + 0.7 * fM[i] + 0.45 * fH[i];
    const W = Math.max(2, Math.round(0.25 * fps));
    const Od = new Float32Array(frames);
    {
      let acc = 0, cnt = 0;
      for (let i = 0; i < Math.min(frames, W); i++) { acc += O[i]; cnt++; }
      for (let i = 0; i < frames; i++) {
        const add = i + W, rem = i - W - 1;
        if (add < frames) { acc += O[add]; cnt++; }
        if (rem >= 0) { acc -= O[rem]; cnt--; }
        const v = O[i] - acc / cnt;
        Od[i] = v > 0 ? v : 0;
      }
    }
    onProgress(0.68, "Поиск темпа");
    await yieldToUI();

    /* ---- темп: автокорреляция ---- */
    const minL = 6, maxL = Math.ceil(4.2 * fps);
    const AC = new Float32Array(maxL + 2);
    for (let L = minL; L <= maxL && L < frames; L++) {
      let s = 0;
      for (let i = 0; i + L < frames; i++) s += Od[i] * Od[i + L];
      AC[L] = s / (frames - L);
    }
    const acAt = L => {
      if (L < minL || L >= maxL) return 0;
      const i = Math.floor(L), t = L - i;
      return AC[i] * (1 - t) + AC[i + 1] * t;
    };
    const tempoScore = bpm => {
      const L = 60 * fps / bpm;
      const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.85, 2));
      return (acAt(L) + 0.5 * acAt(2 * L) + 0.25 * acAt(L / 2) + 0.25 * acAt(3 * L) + 0.4 * acAt(4 * L)) * prior;
    };
    let bestBpm = 120, best = -1;
    const scores = [];
    for (let bpm = 60; bpm <= 200; bpm += 0.25) {
      const s = tempoScore(bpm);
      scores.push(s);
      if (s > best) { best = s; bestBpm = bpm; }
    }
    // уточнение
    for (let bpm = bestBpm - 0.25; bpm <= bestBpm + 0.25; bpm += 0.02) {
      const s = tempoScore(bpm);
      if (s > best) { best = s; bestBpm = bpm; }
    }
    const medScore = median(scores);
    const peakRatio = best > 0 ? (best - medScore) / best : 0;

    /* ---- кривая темпа: оценка в окнах 10 с (шаг 2,5 с) + Витерби по лог-темпу ----
       Окно даёт оценку на всей сетке 60–200 BPM; переход между состояниями штрафуется
       линейно по разнице октав (L1), поэтому плавный дрейф почти бесплатен, а резкая смена
       темпа проходит за 1–2 окна. Пустые (тихие) окна берут темп у соседей. */
    const GSTEP = 0.25, NS = scores.length;
    const gB = new Float32Array(NS), logG = new Float32Array(NS), priorG = new Float32Array(NS), gNorm = new Float32Array(NS);
    for (let j = 0; j < NS; j++) {
      gB[j] = 60 + j * GSTEP; logG[j] = Math.log2(gB[j]);
      priorG[j] = Math.exp(-0.5 * Math.pow(Math.log2(gB[j] / 120) / 0.85, 2));
      gNorm[j] = best > 0 ? scores[j] / best : 0;
    }
    const winF = Math.round(10 * fps), hopF = Math.round(2.5 * fps);
    let meanOdAll = 0;
    for (let i = 0; i < frames; i++) meanOdAll += Od[i];
    meanOdAll = meanOdAll / frames || 1e-6;
    const wins = [];
    {
      const lac = new Float32Array(maxL + 2);
      for (let s0 = 0; s0 < frames; s0 += hopF) {
        const s1 = Math.min(frames, s0 + winF), len = s1 - s0;
        if (len < winF * 0.6 && wins.length) break;
        const lim = Math.min(maxL, Math.floor(len * 0.75));
        let mo = 0;
        for (let i = s0; i < s1; i++) mo += Od[i];
        mo /= len;
        lac.fill(0);
        for (let L = minL; L <= lim; L++) {
          let s = 0;
          for (let i = s0; i + L < s1; i++) s += Od[i] * Od[i + L];
          lac[L] = s / (len - L);
        }
        const at = L => { if (L < minL || L >= lim) return 0; const i = Math.floor(L), t = L - i; return lac[i] * (1 - t) + lac[i + 1] * t; };
        const sc = new Float32Array(NS);
        let mx = 0;
        for (let j = 0; j < NS; j++) {
          const L = 60 * fps / gB[j];
          const v = (at(L) + 0.5 * at(2 * L) + 0.25 * at(L / 2) + 0.25 * at(3 * L) + 0.4 * at(4 * L)) * priorG[j];
          sc[j] = v; if (v > mx) mx = v;
        }
        const w = clamp(1.5 * mo / meanOdAll, 0, 1);
        for (let j = 0; j < NS; j++) sc[j] = (mx > 0 ? sc[j] / mx * w : 0) + 0.25 * gNorm[j];
        wins.push({ c: (s0 + s1) / 2, sc, w });
        if (wins.length % 16 === 0) await yieldToUI();
      }
    }
    let curveBpm = [];   // темп в центре каждого окна
    if (wins.length >= 2) {
      const LAM = 2.0;   // штраф за октаву смены темпа
      const K = wins.length;
      const srcs = [];
      let dp = Float32Array.from(wins[0].sc);
      for (let k = 1; k < K; k++) {
        const src = new Int32Array(NS), val = Float32Array.from(dp);
        for (let j = 0; j < NS; j++) src[j] = j;
        for (let j = 1; j < NS; j++) { const c = val[j - 1] - LAM * (logG[j] - logG[j - 1]); if (c > val[j]) { val[j] = c; src[j] = src[j - 1]; } }
        for (let j = NS - 2; j >= 0; j--) { const c = val[j + 1] - LAM * (logG[j + 1] - logG[j]); if (c > val[j]) { val[j] = c; src[j] = src[j + 1]; } }
        const sc = wins[k].sc;
        for (let j = 0; j < NS; j++) val[j] += sc[j];
        srcs.push(src); dp = val;
      }
      let st = 0;
      for (let j = 1; j < NS; j++) if (dp[j] > dp[st]) st = j;
      const path = new Int32Array(K);
      path[K - 1] = st;
      for (let k = K - 1; k >= 1; k--) { st = srcs[k - 1][st]; path[k - 1] = st; }
      curveBpm = Array.from(path, s => gB[s]);
    }
    // темп считается постоянным, если опорные окна не отклоняются от глобального более чем на 1,5%
    let tempoStable = true;
    for (let k = 0; k < curveBpm.length; k++) if (wins[k].w > 0.3 && Math.abs(curveBpm[k] / bestBpm - 1) > 0.015) tempoStable = false;
    const period = new Float32Array(frames);
    let cv = 0;
    if (tempoStable) {
      period.fill(60 * fps / bestBpm);
      const v = curveBpm.filter((_, k) => wins[k].w > 0.3);
      if (v.length > 1) {
        const mu = v.reduce((a, b) => a + b, 0) / v.length;
        cv = Math.sqrt(v.reduce((a, b) => a + (b - mu) * (b - mu), 0) / v.length) / mu;
      }
    } else {
      // глобальный темп — взвешенная медиана кривой; период по кадрам — линейная интерполяция между окнами
      const ws = curveBpm.map((b, k) => ({ b, w: wins[k].w + 0.05 })).sort((x, y) => x.b - y.b);
      let tot = 0, acc = 0;
      for (const x of ws) tot += x.w;
      for (const x of ws) { acc += x.w; if (acc >= tot / 2) { bestBpm = x.b; break; } }
      let j = 0;
      for (let i = 0; i < frames; i++) {
        while (j < wins.length - 2 && wins[j + 1].c < i) j++;
        const a = wins[j], b = wins[j + 1];
        const t = clamp((i - a.c) / (b.c - a.c), 0, 1);
        period[i] = 60 * fps / lerp(curveBpm[j], curveBpm[j + 1], t);
      }
      const v = curveBpm.filter((_, k) => wins[k].w > 0.3);
      const mu = v.length ? v.reduce((a, b) => a + b, 0) / v.length : bestBpm;
      cv = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mu) * (b - mu), 0) / v.length) / mu : 0;
    }
    const globalP = 60 * fps / bestBpm;
    const tempoCurve = wins.map((w, k) => ({ t: w.c * H / sr, bpm: curveBpm[k] || bestBpm }));
    onProgress(0.75, "Поиск долей");
    await yieldToUI();

    /* ---- доли: динамическое программирование ---- */
    let sd = 0, mean = 0;
    for (let i = 0; i < frames; i++) mean += Od[i];
    mean /= frames;
    for (let i = 0; i < frames; i++) sd += (Od[i] - mean) * (Od[i] - mean);
    sd = Math.sqrt(sd / frames) || 1;
    const local = new Float32Array(frames);
    for (let i = 0; i < frames; i++) local[i] = Od[i] / sd;
    const cum = new Float32Array(frames), back = new Int32Array(frames).fill(-1);
    const tight = 400;   // высокая «жёсткость» удерживает фазу в брейках без ударных
    for (let t = 0; t < frames; t++) {
      const P = period[t];
      const lo = Math.max(0, Math.round(t - 2 * P)), hi = Math.round(t - P / 2);
      let bv = -Infinity, bi = -1;
      for (let p = lo; p <= hi; p++) {
        const r = Math.log((t - p) / P);
        const v = cum[p] - tight * r * r;
        if (v > bv) { bv = v; bi = p; }
      }
      cum[t] = local[t] + (bi >= 0 ? bv : 0);
      back[t] = bi;
      if ((t & 4095) === 0) await yieldToUI();
    }
    // конец цепочки — лучший кадр в последнем периоде
    let end = frames - 1, ev = -Infinity;
    for (let t = Math.max(0, Math.floor(frames - globalP)); t < frames; t++) if (cum[t] > ev) { ev = cum[t]; end = t; }
    let beatFrames = [];
    for (let t = end; t >= 0; t = back[t]) { beatFrames.push(t); if (back[t] < 0) break; }
    beatFrames.reverse();

    const toTime = fr => (fr * H + N / 2) / sr + ONSET_BIAS;
    // уточнение по локальному максимуму с параболической интерполяцией
    const refine = fr => {
      let m = fr;
      for (let k = Math.max(1, fr - 2); k <= Math.min(frames - 2, fr + 2); k++) if (O[k] > O[m]) m = k;
      const a = O[m - 1] || 0, b = O[m], c = O[m + 1] || 0;
      const den = a - 2 * b + c;
      const off = den < 0 ? clamp(0.5 * (a - c) / den, -0.5, 0.5) : 0;
      return { frame: m + off, peak: b };
    };
    const p95 = percentile(O, 0.95, 2) || 1;
    const frameOf = t => clamp(Math.round(((t - ONSET_BIAS) * sr - N / 2) / H), 0, frames - 1);
    const measure = t => {
      const fr = frameOf(t);
      let lm = 0, mm = 0, pk = 0;
      for (let k = Math.max(0, fr - 2); k <= Math.min(frames - 1, fr + 2); k++) { lm = Math.max(lm, fL[k]); mm = Math.max(mm, fM[k]); pk = Math.max(pk, O[k]); }
      return { s: clamp(pk / p95, 0, 1.5) / 1.5, low: lm, mid: mm };
    };
    let beats = beatFrames.map(fr => toTime(refine(fr).frame));
    const P = 60 / bestBpm;
    const Pt = t => period[clamp(frameOf(t), 0, frames - 1)] * H / sr;   // период в момент t (при смене темпа не равен P)

    /* ---- удержание фазы ----
       В интро и брейках без бочки трекер может уйти на слабые доли
       (хэты на «и»). Отрезки без опорных ударов, сдвинутые на полдоли
       относительно соседних опор, перестраиваются по сетке опор. */
    let phaseFixes = 0;
    if (beats.length >= 16) {
      const lows = beats.map(t => measure(t).low);
      const thr = 0.5 * percentile(lows, 0.9);
      const anchor = lows.map(v => thr > 0.05 && v > thr);
      if (anchor.filter(Boolean).length > beats.length * 0.2) {
        const nb0 = beats.length, out = [];
        const localP = (from, to) => {
          const a = clamp(from, 0, nb0 - 1), b = clamp(to, 0, nb0 - 1);
          const Pa = Pt(beats[a]);
          if (b - a < 1) return Pa;
          const v = (beats[b] - beats[a]) / (b - a);
          return Math.abs(v - Pa) / Pa < 0.1 ? v : Pa;
        };
        let i = 0;
        while (i < nb0) {
          if (anchor[i]) { out.push(beats[i]); i++; continue; }
          let j = i;
          while (j < nb0 && !anchor[j]) j++;
          const hasStart = i > 0, hasEnd = j < nb0;
          if (j - i < 4 || (!hasStart && !hasEnd)) { for (let k = i; k < j; k++) out.push(beats[k]); i = j; continue; }
          const ref = hasStart ? beats[i - 1] : beats[j];
          const Pl = hasStart ? localP(i - 5, i - 1) : localP(j, j + 4);
          let cx = 0, cy = 0;
          for (let k = i; k < j; k++) { const ph = ((beats[k] - ref) / Pl) * TAU; cx += Math.cos(ph); cy += Math.sin(ph); }
          let mph = Math.atan2(cy, cx) / TAU; if (mph < 0) mph += 1;
          // при стабильном темпе отрезки без опор выравниваются по сетке опор всегда,
          // иначе только если они сдвинуты на полдоли
          if ((mph > 0.3 && mph < 0.7) || cv < 0.03) {
            phaseFixes++;
            if (hasStart && hasEnd) {
              const a = beats[i - 1], b = beats[j], cnt = Math.max(1, Math.round((b - a) / Pl)), st = (b - a) / cnt;
              for (let c = 1; c < cnt; c++) out.push(a + c * st);
            } else if (hasStart) {
              for (let t = beats[i - 1] + Pl; t < beats[j - 1] + Pl * 0.5; t += Pl) out.push(t);
            } else {
              const arr = [];
              for (let t = beats[j] - Pl; t > beats[i] - Pl * 0.5; t -= Pl) arr.unshift(t);
              out.push(...arr);
            }
          } else for (let k = i; k < j; k++) out.push(beats[k]);
          i = j;
        }
        beats = out;
      }
    }
    let strength = [], lowAt = [], midAt = [];
    const remeasure = () => {
      strength = []; lowAt = []; midAt = [];
      for (const t of beats) { const m = measure(t); strength.push(m.s); lowAt.push(m.low); midAt.push(m.mid); }
    };
    remeasure();

    /* ---- уверенность и режим ---- */
    const support = strength.length ? strength.filter(s => s > 0.22).length / strength.length : 0;
    const c1 = invLerp(0.25, 0.75, peakRatio);
    const c2 = invLerp(0.3, 0.85, support);
    const c3 = invLerp(0.1, 0.015, cv);
    const confidence = clamp(0.45 * c1 + 0.35 * c2 + 0.2 * c3, 0, 1);
    let mode = confidence >= 0.6 && cv < 0.035 ? "precise" : confidence >= 0.35 ? "adaptive" : "fallback";

    const duration = buffer.duration;
    if (mode === "fallback" || beats.length < 8) {
      // ровная сетка с фазой, лучше всего совпадающей с событиями
      mode = "fallback";
      let bestPh = 0, bestS = -1;
      for (let ph = 0; ph < P; ph += P / 48) {
        let sc = 0;
        for (let t = ph; t < duration; t += P) sc += O[frameOf(t)];
        if (sc > bestS) { bestS = sc; bestPh = ph; }
      }
      beats = [];
      for (let t = bestPh; t < duration; t += P) beats.push(t);
    } else {
      // достраиваем сетку назад к началу и вперёд к концу трека
      const pre = [];
      const Ps = Pt(beats[0]), Pe = Pt(beats[beats.length - 1]);
      let t = beats[0] - Ps;
      while (t > -Ps * 0.25) { pre.unshift(Math.max(0, t)); t -= Ps; }
      beats = pre.concat(beats);
      t = beats[beats.length - 1] + Pe;
      while (t < duration) { beats.push(t); t += Pe; }
    }
    remeasure();
    onProgress(0.86, "Сильные доли и секции");
    await yieldToUI();

    /* ---- энергия, полосы, границы секций ---- */
    const nb = beats.length;
    const DEC = 4, envFps = fps / DEC, envN = Math.ceil(frames / DEC);
    const dB = new Float32Array(frames);
    for (let i = 0; i < frames; i++) dB[i] = 10 * Math.log10(eL[i] + eM[i] + eH[i] + 1e-6);
    const smooth = (arr, w) => {
      const out = new Float32Array(arr.length);
      let acc = 0, cnt = 0;
      for (let i = 0; i < Math.min(arr.length, w); i++) { acc += arr[i]; cnt++; }
      for (let i = 0; i < arr.length; i++) {
        if (i + w < arr.length) { acc += arr[i + w]; cnt++; }
        if (i - w - 1 >= 0) { acc -= arr[i - w - 1]; cnt--; }
        out[i] = acc / cnt;
      }
      return out;
    };
    const dBs = smooth(dB, Math.round(0.6 * fps));
    const lo10 = percentile(dBs, 0.08, 3), hi97 = percentile(dBs, 0.97, 3);
    const energy = new Float32Array(envN), bl = new Float32Array(envN), bm = new Float32Array(envN), bh = new Float32Array(envN);
    const lgL = smooth(eL.map(v => Math.log1p(v)), 6), lgM = smooth(eM.map(v => Math.log1p(v)), 6), lgH = smooth(eH.map(v => Math.log1p(v)), 6);
    const pl = percentile(lgL, 0.97, 3) || 1, pm = percentile(lgM, 0.97, 3) || 1, ph2 = percentile(lgH, 0.97, 3) || 1;
    for (let i = 0; i < envN; i++) {
      const f = Math.min(frames - 1, i * DEC);
      energy[i] = invLerp(lo10, Math.max(hi97, lo10 + 6), dBs[f]);
      bl[i] = clamp(lgL[f] / pl, 0, 1); bm[i] = clamp(lgM[f] / pm, 0, 1); bh[i] = clamp(lgH[f] / ph2, 0, 1);
    }
    const eS = smooth(energy, Math.round(1.5 * envFps));
    const half3 = Math.round(3 * envFps);
    const novelty = new Float32Array(envN);
    for (let i = half3; i < envN - half3; i++) {
      let a = 0, b = 0;
      for (let k = 1; k <= half3; k++) { a += eS[i - k]; b += eS[i + k]; }
      novelty[i] = Math.abs(b - a) / half3;
    }
    // точная граница: самый резкий рост/спад энергии рядом с пиком новизны
    const boundIdx = [];
    let lastB = -1e9;
    for (let i = 1; i < envN - 1; i++) {
      if (novelty[i] > 0.14 && novelty[i] >= novelty[i - 1] && novelty[i] >= novelty[i + 1] && (i - lastB) / envFps >= 8) {
        // уточняем по несглаженной громкости: максимум разницы «после минус до» в окнах 0.25 с
        const c = i * DEC, w = Math.round(0.25 * fps);
        let bestJ = c, bestD = -1;
        for (let j = Math.max(w, c - Math.round(fps)); j < Math.min(frames - w, c + Math.round(fps)); j++) {
          let a = 0, b = 0;
          for (let k = 0; k < w; k++) { a += dB[j - 1 - k]; b += dB[j + k]; }
          const d = Math.abs(b - a);
          if (d > bestD) { bestD = d; bestJ = j; }
        }
        const t = toTime(bestJ);
        let bi = clamp(lowerIndex(beats, t), 0, nb - 1);
        if (bi + 1 < nb && Math.abs(beats[bi + 1] - t) < Math.abs(beats[bi] - t)) bi++;
        boundIdx.push(bi);
        lastB = i;
      }
    }

    /* ---- сильные доли: голосование фазы по модулю 4 ----
       Признак бочки (низ минус середина) + начала секций, которые
       почти всегда приходятся на первую долю такта. */
    let evMag = 0;
    const evid = beats.map((_, i) => { const v = lowAt[i] - 0.4 * midAt[i]; evMag += Math.abs(v); return v; });
    evMag = evMag / Math.max(1, nb) || 0.1;
    /* Смена гармонии: расстояние между усреднёнными нормированными спектрами «после доли» и «до доли».
       Аккорд или нота баса меняются обычно на первой доле такта — это спасает плоскую «четвёрку»
       и сильно сжатый мастеринг, где бочка одинакова на каждой доле. */
    const chromaAvg = (t0, t1, out) => {
      out.fill(0);
      const a = clamp(Math.round(((t0 - ONSET_BIAS) * sr - N / 2) / H), 0, frames - 1), b = clamp(Math.round(((t1 - ONSET_BIAS) * sr - N / 2) / H), a, frames - 1);
      for (let fr = a; fr <= b; fr++) {
        let sum = 0;
        for (let k = 0; k < NH; k++) sum += harm[fr * NH + k];
        if (sum > 1e-9) for (let k = 0; k < NH; k++) out[k] += harm[fr * NH + k] / sum;
      }
      let tot = 0;
      for (let k = 0; k < NH; k++) tot += out[k];
      if (tot > 0) for (let k = 0; k < NH; k++) out[k] /= tot;
    };
    const hv = new Float32Array(nb), ca = new Float32Array(NH), cb = new Float32Array(NH);
    let hMean = 0;
    for (let i = 1; i < nb; i++) {
      const Pi = period[clamp(frameOf(beats[i]), 0, frames - 1)] * H / sr;
      chromaAvg(beats[i] + 0.08 * Pi, beats[i] + 0.5 * Pi, ca);
      chromaAvg(beats[i] - 0.6 * Pi, beats[i] - 0.1 * Pi, cb);
      let d = 0;
      for (let k = 0; k < NH; k++) d += Math.abs(ca[k] - cb[k]);
      hv[i] = d; hMean += d;
    }
    hMean = hMean / Math.max(1, nb - 1) || 1;
    /* Сегменты с разным темпом (резкая смена) голосуют отдельно: после смены такты начинаются заново. */
    const segStart = [0];
    {
      let refP = period[clamp(frameOf(beats[0]), 0, frames - 1)];
      for (let i = 1; i < nb; i++) {
        const pi = period[clamp(frameOf(beats[i]), 0, frames - 1)];
        if (Math.abs(pi / refP - 1) > 0.08) { if (i - segStart[segStart.length - 1] >= 8) segStart.push(i); refP = pi; }
      }
    }
    const strong = new Uint8Array(nb);
    for (let s = 0; s < segStart.length; s++) {
      const a = segStart[s], b = s + 1 < segStart.length ? segStart[s + 1] : nb;
      const vote = [0, 0, 0, 0], hvote = [0, 0, 0, 0];
      for (let i = a; i < b; i++) { vote[(i - a) % 4] += evid[i]; hvote[(i - a) % 4] += (hv[i] / hMean - 1) * evMag * 0.8; }
      for (const bi of boundIdx) if (bi >= a && bi < b) vote[(bi - a) % 4] += evMag * 10;
      for (let p = 0; p < 4; p++) vote[p] += hvote[p];
      const gPhase = vote.indexOf(Math.max(...vote));
      for (let i = a; i < b; i++) strong[i] = (i - a) % 4 === gPhase ? 1 : 0;
    }

        /* ---- части трека: сегментация по тактам + характер (kind), см. buildSections ---- */
    const secBars = sectionBars({ beats, strong, duration, envFps, energy, bl, bm, bh, fL, fM, fH, pL: eL, pM: eM, pH: eH, confidence, frameOf });
    const sections = segmentBars({ duration, envFps, energy, bl, bh, confidence }, secBars, 1);

    /* ---- кандидаты событий по полосам (порог применяется во время игры) ---- */
    const onsets = { low: [], mid: [], high: [] };
    const pickBand = (arr, list) => {
      const w = Math.round(0.4 * fps);
      const avg = smooth(arr, w);
      for (let i = 2; i < frames - 2; i++) {
        const v = arr[i];
        if (v > arr[i - 1] && v >= arr[i + 1] && v > arr[i - 2] && v >= arr[i + 2]) {
          const s = v - avg[i] * 1.15;
          if (s > 0.08) list.push(toTime(i), s);
        }
      }
    };
    pickBand(fL, onsets.low); pickBand(fM, onsets.mid); pickBand(fH, onsets.high);

    /* ---- признаки трека для подбора арены ---- */
    const sL = mL, sM = mM, sH = mH, sAll = sL + sM + sH || 1;
    const rmsDb = [];
    for (let i = 0; i < frames; i += 2) if (rms[i] > 1e-4) rmsDb.push(20 * Math.log10(rms[i]));
    rmsDb.sort((a, b) => a - b);
    const q = p => rmsDb.length ? rmsDb[Math.floor(p * (rmsDb.length - 1))] : -60;
    let density = 0;
    for (let i = 1; i < onsets.mid.length; i += 2) if (onsets.mid[i] > 0.3) density++;
    for (let i = 1; i < onsets.low.length; i += 2) if (onsets.low[i] > 0.3) density++;
    let meanO = 0, meanOd = 0, meanC = 0;
    for (let i = 0; i < frames; i++) { meanO += O[i]; meanOd += Od[i]; meanC += cent[i]; }
    const features = {
      bpm: bestBpm,
      low: sL / sAll, mid: sM / sAll, high: sH / sAll,
      loudness: invLerp(-38, -8, q(0.6)),
      dynamics: invLerp(4, 26, q(0.95) - q(0.15)),
      density: density / duration,
      perc: meanO > 0 ? meanOd / meanO : 0,
      bright: (meanC / frames) / 4000,
      energyVar: sections.length > 1 ? Math.max(...sections.map(s => s.energy)) - Math.min(...sections.map(s => s.energy)) : 0,
    };
    /* без ритма (эмбиент) часть одна, но размах громкости по ходу трека всё же есть — для подбора арены берём его по 12-секундным окнам */
    if (sections.length === 1 && confidence < 0.5) {
      const w = Math.max(1, Math.round(12 * envFps)), means = [];
      for (let i = 0; i + w <= energy.length; i += w) { let a = 0; for (let k = i; k < i + w; k++) a += energy[k]; means.push(a / w); }
      if (means.length > 1) features.energyVar = Math.max(...means) - Math.min(...means);
    }

    onProgress(1, "Готово");
    return {
      duration, bpm: bestBpm, period: P, confidence, mode, stability: 1 - cv,
      beats: Float64Array.from(beats), strength: Float32Array.from(strength), strong,
      envFps, energy, low: bl, mid: bm, high: bh, sections, onsets, features,
      bars: packBars(secBars),   // признаки тактов — Режиссёр пересобирает части с другой чувствительностью без нового анализа
      ms: Math.round(performance.now() - t0), phaseFixes, tempoCurve, tempoStable,
    };
  }

  /* ------------------------------------------------------------------
     Живой анализ — вызывается каждый кадр, пока играет трек.
     ------------------------------------------------------------------ */
  updateLive(audio, dt, sensitivity) {
    const L = this.live;
    const an = audio.analyser;
    if (!an || !audio.playing) {
      L.low = damp(L.low, 0, 6, dt); L.mid = damp(L.mid, 0, 6, dt); L.high = damp(L.high, 0, 6, dt);
      L.energy = damp(L.energy, 0, 4, dt); L.onset = false;
      return L;
    }
    const bins = an.frequencyBinCount;
    if (!this._liveBytes || this._liveBytes.length !== bins) {
      this._liveBytes = new Uint8Array(bins); this._livePrev = new Uint8Array(bins);
      const hz = audio.ctx.sampleRate / an.fftSize;
      this._r = {};
      for (const k in BANDS) this._r[k] = [Math.max(1, Math.floor(BANDS[k][0] / hz)), Math.min(bins - 1, Math.ceil(BANDS[k][1] / hz))];
    }
    const cur = this._liveBytes, prev = this._livePrev;
    prev.set(cur);
    an.getByteFrequencyData(cur);
    const avg = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += cur[i]; return s / Math.max(1, b - a) / 255; };
    let flux = 0;
    const [la, lb] = this._r.low, [ma, mb] = this._r.mid;
    for (let i = la; i < mb; i++) { const d = cur[i] - prev[i]; if (d > 0) flux += i < lb ? d * 2 : d * 0.5; }
    flux /= (mb - la) * 255;
    const pk = this._livePeak;
    for (const k of ["low", "mid", "high"]) {
      const raw = avg(this._r[k][0], this._r[k][1]);
      pk[k] = Math.max(raw, pk[k] * Math.exp(-dt * 0.15), 0.08);
      const v = clamp(raw / pk[k], 0, 1);
      L[k] = v > L[k] ? damp(L[k], v, 30, dt) : damp(L[k], v, 8, dt);
    }
    L.energy = damp(L.energy, (L.low * 1.2 + L.mid + L.high * 0.6) / 2.8, 3, dt);
    this._fluxAvg = damp(this._fluxAvg, flux, 2.5, dt);
    const thr = this._fluxAvg * 1.5 + 0.012 / clamp(sensitivity, 0.5, 1.5);
    const now = performance.now();
    L.flux = flux;
    L.onset = false;
    if (flux > thr && now - this._lastLiveOnset > 110) {
      L.onset = true;
      L.onsetStrength = clamp((flux - thr) / (thr + 1e-6), 0, 1);
      this._lastLiveOnset = now;
    }
    return L;
  }
}
