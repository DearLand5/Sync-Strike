/* =====================================================================
   Tempo — темп трека и ручная правка найденных долей.
   Звук: офлайн-растяжение времени (WSOLA, тон сохраняется) или простая передискретизация
   (тон меняется, зато мгновенно). Пересчитывается один раз при смене темпа, порциями
   с отдачей управления интерфейсу.
   Карта ритма: исходный анализ не меняется; поверх него применяются правка долей (fix)
   и масштаб времени 1/rate — получается новая карта, которую видят часы и бой.
   tempo = { rate: 0.7–1.5, keep: сохранять тон, fix: { k, half, shift } }
     fix.k      — степень двойки: +1 «×2» (добавить доли посередине), −1 «÷2» (убрать каждую вторую)
     fix.half   — сдвиг сетки на пол-доли
     fix.shift  — тонкий сдвиг фазы в мс (в уже изменённом темпе, то есть как слышит игрок)
   ===================================================================== */
const TEMPO_MIN = 0.7, TEMPO_MAX = 1.5;

const Tempo = {
  DEFAULT: Object.freeze({ rate: 1, keep: true, fix: Object.freeze({ k: 0, half: false, shift: 0 }) }),

  /** Приводит произвольный объект (из хранилища) к корректному виду. */
  normalize(t) {
    const f = (t && t.fix) || {};
    return {
      rate: clamp(Math.round((+(t && t.rate) || 1) * 100) / 100, TEMPO_MIN, TEMPO_MAX),
      keep: !t || t.keep !== false,
      fix: { k: clamp(Math.round(+f.k || 0), -3, 3), half: !!f.half, shift: clamp(Math.round(+f.shift || 0), -400, 400) },
    };
  },
  isDefault(t) { t = Tempo.normalize(t); return t.rate === 1 && !t.fix.k && !t.fix.half && !t.fix.shift; },
  /** Одинаковый ли звук получится (растяжение зависит только от rate и keep). */
  sameSound(a, b) { a = Tempo.normalize(a); b = Tempo.normalize(b); return a.rate === b.rate && (a.rate === 1 || a.keep === b.keep); },
  same(a, b) { a = Tempo.normalize(a); b = Tempo.normalize(b); return Tempo.sameSound(a, b) && a.fix.k === b.fix.k && a.fix.half === b.fix.half && a.fix.shift === b.fix.shift; },
  /** Суффикс ключа рекорда: "" для оригинала, иначе "@125" / "@100x1h" (правка долей меняет бой). */
  tag(t) {
    t = Tempo.normalize(t);
    if (Tempo.isDefault(t) || (t.rate === 1 && !t.fix.k && !t.fix.half)) return "";
    return "@" + Math.round(t.rate * 100) + (t.fix.k ? "x" + t.fix.k : "") + (t.fix.half ? "h" : "");
  },
  /** Подпись для итогов. */
  label(t) {
    t = Tempo.normalize(t);
    const p = [];
    if (t.rate !== 1) p.push("темп " + Math.round(t.rate * 100) + "%");
    if (t.fix.k || t.fix.half) p.push("правка долей");
    return p.join(", ");
  },
  /** Для хранения: null, если всё по умолчанию. */
  pack(t) { return Tempo.isDefault(t) ? null : Tempo.normalize(t); },

  /* ---------------- правка долей ---------------- */

  /** Фаза (0..m−1), при которой «сильные» индексы чаще всего попадают на опорные сильные доли. */
  _phase(beats, refs, m, tol) {
    const score = new Array(m).fill(0);
    let j = 0;
    for (let i = 0; i < beats.length; i++) {
      while (j < refs.length && refs[j] < beats[i] - tol) j++;
      if (j < refs.length && Math.abs(refs[j] - beats[i]) <= tol) score[i % m]++;
    }
    let best = 0;
    for (let p = 1; p < m; p++) if (score[p] > score[best]) best = p;
    return best;
  },

  /** Доли и сильные доли после правки (в исходной шкале времени, до масштабирования). */
  fixBeats(map, fix) {
    let beats = Array.from(map.beats), str = Array.from(map.strength);
    const refs = [];
    for (let i = 0; i < beats.length; i++) if (map.strong[i]) refs.push(beats[i]);
    let strong = null;
    const restrong = () => {
      const P = beats.length > 1 ? (beats[beats.length - 1] - beats[0]) / (beats.length - 1) : map.period;
      const ph = Tempo._phase(beats, refs, 4, P * 0.3);
      strong = beats.map((_, i) => (i % 4 === ph ? 1 : 0));
    };
    if (fix.k > 0) {
      for (let n = 0; n < fix.k; n++) {
        const nb = [], ns = [];
        for (let i = 0; i < beats.length; i++) {
          nb.push(beats[i]); ns.push(str[i]);
          if (i + 1 < beats.length) { nb.push((beats[i] + beats[i + 1]) / 2); ns.push(str[i] * 0.55); }
        }
        beats = nb; str = ns;
      }
      restrong();
    } else if (fix.k < 0) {
      for (let n = 0; n < -fix.k; n++) {
        // оставляем ту чётность, на которую приходится больше сильных долей
        let sc = [0, 0];
        let j = 0;
        const P = beats.length > 1 ? (beats[beats.length - 1] - beats[0]) / (beats.length - 1) : map.period;
        for (let i = 0; i < beats.length; i++) {
          while (j < refs.length && refs[j] < beats[i] - P * 0.3) j++;
          if (j < refs.length && Math.abs(refs[j] - beats[i]) <= P * 0.3) sc[i & 1]++;
        }
        const par = sc[1] > sc[0] ? 1 : 0;
        beats = beats.filter((_, i) => (i & 1) === par);
        str = str.filter((_, i) => (i & 1) === par);
      }
      restrong();
    } else strong = Array.from(map.strong);
    if (fix.half && beats.length > 1) {
      const nb = [], ns = [], nst = [];
      for (let i = 0; i + 1 < beats.length; i++) { nb.push((beats[i] + beats[i + 1]) / 2); ns.push(str[i] * 0.8); nst.push(strong[i]); }
      beats = nb; str = ns; strong = nst;
    }
    return { beats: Float64Array.from(beats), strength: Float32Array.from(str), strong: Uint8Array.from(strong) };
  },

  /**
   * Карта для заданного темпа. base — исходный анализ (не меняется),
   * duration — длительность звука, который будет играть (растянутого буфера).
   */
  makeMap(base, tempo, duration) {
    tempo = Tempo.normalize(tempo);
    if (Tempo.isDefault(tempo)) return base;
    const r = tempo.rate, kt = 1 / r, f = tempo.fix;
    const fb = (f.k || f.half) ? Tempo.fixBeats(base, f) : { beats: base.beats, strength: base.strength, strong: base.strong };
    const dt = f.shift / 1000;
    const beats = new Float64Array(fb.beats.length);
    for (let i = 0; i < beats.length; i++) beats[i] = fb.beats[i] * kt + dt;
    const scaleOn = arr => { const o = new Float32Array(arr.length); for (let i = 0; i < arr.length; i += 2) { o[i] = arr[i] * kt; o[i + 1] = arr[i + 1]; } return o; };
    const onsets = {};
    for (const b of ["low", "mid", "high"]) {
      const src = base.onsets[b];
      onsets[b] = Array.isArray(src) ? src.map((v, i) => (i & 1 ? v : v * kt)) : scaleOn(src);
    }
    const mul = Math.pow(2, f.k);
    const m = Object.assign({}, base, {
      duration, beats, strength: fb.strength, strong: fb.strong, onsets,
      bpm: base.bpm * mul * r, period: base.period / mul * kt,
      envFps: base.envFps / kt,
      sections: base.sections.map(s => Object.assign({}, s, { start: s.start * kt, end: s.end * kt })),
      features: Object.assign({}, base.features, { bpm: base.bpm * mul * r, density: base.features.density * r }),
      baseBpm: base.bpm, rate: r,
    });
    return m;
  },

  /* ---------------- звук ---------------- */

  /** Простая передискретизация (тон меняется вместе с темпом), кубическая интерполяция. */
  async resample(ctx, buf, rate, onProgress) {
    const n = buf.length, outLen = Math.max(1, Math.round(n / rate)), ch = buf.numberOfChannels;
    const out = ctx.createBuffer(ch, outLen, buf.sampleRate);
    for (let c = 0; c < ch; c++) {
      const x = buf.getChannelData(c), y = out.getChannelData(c);
      for (let i = 0; i < outLen; i++) {
        const p = i * rate, i1 = Math.floor(p), f = p - i1;
        const a = x[i1 - 1 < 0 ? 0 : i1 - 1], b = x[i1] || 0, d = x[i1 + 1] || 0, e = x[i1 + 2] || 0;
        y[i] = b + 0.5 * f * (d - a + f * (2 * a - 5 * b + 4 * d - e + f * (3 * (b - d) + e - a)));
        if ((i & 0x3ffff) === 0 && i) { onProgress((c + i / outLen) / ch, "Смена темпа"); await yieldToUI(); }
      }
    }
    onProgress(1, "Смена темпа");
    return out;
  },

  /**
   * WSOLA: растяжение времени с сохранением тона. Окно ≈ 46 мс (перекрытие 50%, окно Ханна),
   * положение каждого окна подбирается нормированной корреляцией на прореженном моно-сигнале
   * (поиск ±10 мс), одинаково для всех каналов — стерео не «плывёт».
   * Музыкальное время сохраняется: начало окна k в исходнике ≈ k·Hs·rate с отклонением ≤ 10 мс.
   */
  async stretch(ctx, buf, rate, onProgress) {
    const sr = buf.sampleRate, n = buf.length, ch = buf.numberOfChannels;
    const N = 2 * Math.round(0.023 * sr), Hs = N / 2;
    const D = sr >= 32000 ? 4 : 2;                       // прореживание для поиска
    const tol = Math.round(0.006 * sr);
    const outLen = Math.max(N, Math.round(n / rate));
    const data = [];
    for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    // моно-ориентир, прореженный усреднением (заодно ФНЧ)
    const gl = Math.ceil(n / D);
    const guide = new Float32Array(gl + 8);
    for (let i = 0; i < gl; i++) {
      let s = 0;
      for (let c = 0; c < ch; c++) { const x = data[c]; for (let k = 0; k < D; k++) { const j = i * D + k; if (j < n) s += x[j]; } }
      guide[i] = s / (ch * D);
      if ((i & 0x7ffff) === 0 && i) { onProgress(0.1 * i / gl, "Растяжение времени"); await yieldToUI(); }
    }
    // префиксные суммы квадратов для нормировки
    const sq = new Float64Array(guide.length + 1);
    for (let i = 0; i < guide.length; i++) sq[i + 1] = sq[i] + guide[i] * guide[i];
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    const out = ctx.createBuffer(ch, outLen, sr);
    const outs = []; for (let c = 0; c < ch; c++) outs.push(out.getChannelData(c));
    const L = Hs / D | 0, searchD = Math.ceil(tol / D);
    const frames = Math.ceil((outLen + N) / Hs);
    let prevQ = 0, tStart = performance.now();
    for (let k = 0; k < frames; k++) {
      const o = k * Hs;
      const p = Math.round(o * rate);                    // «номинальное» начало окна в исходнике
      let q = p;
      if (k > 0) {
        // цель: продолжение предыдущего окна (его вторая половина)
        const tg = Math.round((prevQ + Hs) / D);
        const lo = Math.round((p - tol) / D), hi = Math.round((p + tol) / D);
        let bestS = -1e30, bestC = Math.round(p / D);
        let tgE = sq[Math.min(guide.length, tg + L)] - sq[Math.min(guide.length, Math.max(0, tg))];
        for (let c = Math.max(0, lo); c <= hi; c++) {
          if (c + L >= guide.length) break;
          let dot = 0;
          if (tg + L < guide.length && tg >= 0) for (let i = 0; i < L; i++) dot += guide[c + i] * guide[tg + i];
          const e = sq[c + L] - sq[c];
          // нормированная корреляция с лёгким предпочтением номинального положения
          const sc = dot / Math.sqrt(e * (tgE || 1) + 1e-9) - 0.0004 * Math.abs(c - p / D) / searchD;
          if (sc > bestS) { bestS = sc; bestC = c; }
        }
        // уточнение на полной частоте дискретизации вокруг найденного (±D)
        const base = bestC * D;
        let bestF = -1e30, bq = base;
        const tgF = prevQ + Hs, m0 = data[0];
        for (let d = -D; d <= D; d++) {
          const s0 = base + d;
          if (s0 < 0 || s0 + Hs >= n || tgF + Hs >= n) continue;
          let dot = 0, e = 1e-9;
          for (let i = 0; i < Hs; i += 3) { const a = m0[s0 + i]; dot += a * m0[tgF + i]; e += a * a; }
          const sc = dot / Math.sqrt(e);
          if (sc > bestF) { bestF = sc; bq = s0; }
        }
        q = bq;
      }
      prevQ = q;
      // наложение окна
      const i0 = Math.max(0, -o);                         // o ≥ 0 всегда
      const lim = Math.min(N, outLen - o, n - q);
      if (lim > 0 && q >= 0) {
        for (let c = 0; c < ch; c++) {
          const x = data[c], y = outs[c];
          if (k === 0) { const h = Math.min(lim, Hs); for (let i = 0; i < h; i++) y[i] += x[i]; for (let i = h; i < lim; i++) y[i] += x[i] * win[i]; }   // начало трека без «въезда»
          else for (let i = i0; i < lim; i++) y[o + i] += x[q + i] * win[i];
        }
      }
      if ((k & 63) === 0 && performance.now() - tStart > 40) {
        onProgress(0.1 + 0.9 * k / frames, "Растяжение времени");
        await yieldToUI(); tStart = performance.now();
      }
    }
    onProgress(1, "Растяжение времени");
    return out;
  },

  /** Звук нужного темпа. rate = 1 — исходный буфер без копии. */
  async makeBuffer(ctx, buf, tempo, onProgress = () => {}) {
    tempo = Tempo.normalize(tempo);
    if (tempo.rate === 1) return buf;
    return tempo.keep ? Tempo.stretch(ctx, buf, tempo.rate, onProgress) : Tempo.resample(ctx, buf, tempo.rate, onProgress);
  },
};
window.TEMPO_REF = Tempo;   // для тестов
