/* =====================================================================
   RhythmClock — единый музыкальный контроллер.
   Все игровые системы берут ритм отсюда: фазу, доли, окна точности,
   интенсивность, полосы спектра, события кадра.
   ===================================================================== */
const RATING = {
  perfect: { label: "PERFECT", mult: 1.5, score: 2.0, color: "#3ef0ff" },
  good:    { label: "GOOD",    mult: 1.2, score: 1.5, color: "#e8e2d6" },
  early:   { label: "EARLY",   mult: 1.0, score: 1.0, color: "#ffb13b" },
  late:    { label: "LATE",    mult: 1.0, score: 1.0, color: "#ffb13b" },
  miss:    { label: "MISS",    mult: 0.7, score: 0.5, color: "#ff2d4a" },
};
const MODE_LABEL = { precise: "Точный", adaptive: "Адаптивный", fallback: "Резервный" };

class RhythmClock {
  constructor(settings) {
    this.settings = settings;
    this.map = null;
    this.events = [];
    this.t = 0;
    this.idx = -1;
    this.correction = 0;      // сдвиг сетки (с), подстраивается по событиям
    this.phase = 0; this.period = 0.5; this.bpm = 120;
    this.prevBeat = 0; this.nextBeat = 0.5;
    this.pulse = 0; this.strongPulse = 0; this.halfPulse = 0;
    this.lastStrong = -10;
    this.strongNow = false;
    this.intensity = 0.4; this.intensitySmooth = 0.4;
    this.bands = { low: 0, mid: 0, high: 0 };
    this.sectionIdx = 0; this.section = null;
    this.level = "mid"; this.kind = "groove"; this.trend = 0; this.nextKind = null; this.timeToNext = 99;
    this.bassy = false; this.bright = false;
    this._ptr = { low: 0, mid: 0, high: 0 };
    this._lastT = 0;
  }

  get confidence() { return this.map ? this.map.confidence : 0; }
  get mode() { return this.map ? this.map.mode : "fallback"; }

  setMap(map) {
    this.map = map;
    this.correction = 0;
    this.reset(0);
  }

  /** Переустановка указателей после перемотки, повтора или смены трека. */
  reset(t) {
    const m = this.map;
    this._lastT = t;
    this.lastStrong = -10;
    if (!m) return;
    this.idx = lowerIndex(m.beats, t - this.correction);
    for (const b of ["low", "mid", "high"]) {
      const arr = m.onsets[b];
      let lo = 0, hi = arr.length / 2;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid * 2] < t) lo = mid + 1; else hi = mid; }
      this._ptr[b] = lo;
    }
    this.sectionIdx = Math.max(0, m.sections.findIndex(s => t >= s.start && t < s.end));
    this.section = m.sections[this.sectionIdx] || null;
  }

  /** Вызывается раз в кадр. t — музыкальное время (с), live — живой спектр. */
  update(t, dt, live, playing) {
    this.events.length = 0;
    const m = this.map;
    if (!m) { this._idle(dt); return; }
    // скачок времени (перемотка, повтор трека) — без выдачи пропущенных событий
    if (t < this._lastT - 0.25 || t > this._lastT + 1.0) this.reset(t);
    this._lastT = t;
    this.t = t;
    const beats = m.beats, nb = beats.length;
    const tc = t - this.correction;

    while (this.idx + 1 < nb && beats[this.idx + 1] <= tc) {
      this.idx++;
      const strong = !!m.strong[this.idx];
      const ev = { type: "beat", index: this.idx, strong, strength: m.strength[this.idx], time: beats[this.idx] + this.correction };
      this.events.push(ev);
      if (strong) { this.lastStrong = beats[this.idx]; this.events.push({ type: "strongBeat", index: this.idx, strength: ev.strength, time: ev.time }); }
    }
    const i = this.idx;
    const P0 = m.period;
    const prev = i >= 0 ? beats[i] : (nb ? beats[0] - P0 : 0);
    const next = i + 1 < nb ? beats[i + 1] : prev + (i > 0 ? beats[i] - beats[i - 1] : P0);
    this.prevBeat = prev + this.correction;
    this.nextBeat = next + this.correction;
    this.period = Math.max(0.2, next - prev);
    this.bpm = 60 / this.period;
    this.phase = clamp((tc - prev) / this.period, 0, 1);
    this.strongNow = i >= 0 && !!m.strong[i];
    const since = tc - prev;
    this.pulse = playing ? Math.exp(-Math.max(0, since) * 7) : this.pulse * Math.exp(-dt * 4);
    this.strongPulse = playing ? Math.exp(-Math.max(0, tc - this.lastStrong) * 4.5) : this.strongPulse * Math.exp(-dt * 4);
    const hp = (this.phase * 2) % 1;
    this.halfPulse = playing ? Math.exp(-hp * this.period * 0.5 * 9) : 0;

    // интенсивность и полосы: офлайн-огибающая + живой спектр
    const fi = clamp(t * m.envFps, 0, m.energy.length - 1);
    const i0 = Math.floor(fi), i1 = Math.min(m.energy.length - 1, i0 + 1), f = fi - i0;
    const off = arr => arr[i0] * (1 - f) + arr[i1] * f;
    const eOff = off(m.energy);
    this.intensity = playing ? clamp(eOff * 0.75 + (live ? live.energy : 0) * 0.25 + 0.08, 0, 1) : this.intensity;
    this.intensitySmooth = damp(this.intensitySmooth, this.intensity, 0.7, dt);
    if (playing && live) {
      this.bands.low = Math.max(live.low, off(m.low) * 0.6);
      this.bands.mid = Math.max(live.mid, off(m.mid) * 0.6);
      this.bands.high = Math.max(live.high, off(m.high) * 0.6);
    } else {
      this.bands.low = damp(this.bands.low, 0, 4, dt); this.bands.mid = damp(this.bands.mid, 0, 4, dt); this.bands.high = damp(this.bands.high, 0, 4, dt);
    }

    // секции
    const secs = m.sections;
    if (secs.length) {
      let si = this.sectionIdx;
      while (si + 1 < secs.length && t >= secs[si + 1].start) si++;
      if (si !== this.sectionIdx) {
        const prevLevel = this.section ? this.section.level : "mid";
        this.sectionIdx = si;
        this.section = secs[si];
        this.events.push({ type: "section", level: this.section.level, prevLevel, energy: this.section.energy, kind: this.section.kind });
      }
      this.level = this.section ? this.section.level : "mid";
      this.kind = this.section ? this.section.kind || "groove" : "groove";
      this.bassy = !!(this.section && this.section.bassy);
      this.bright = !!(this.section && this.section.bright);
      // взгляд вперёд: рост энергии в ближайшие 3 с и скорая смена части
      const ahead = clamp((t + 3) * m.envFps, 0, m.energy.length - 1);
      this.trend = clamp(m.energy[Math.floor(ahead)] - eOff, -1, 1);
      const nxt = secs[this.sectionIdx + 1];
      this.nextKind = nxt ? nxt.kind : null;
      this.timeToNext = nxt ? nxt.start - t : 99;
    }

    // события полос с порогом чувствительности
    const sens = clamp(this.settings.v.sensitivity, 0.5, 1.5);
    const thr = { low: 0.32 / sens, mid: 0.38 / sens, high: 0.42 / sens };
    const gain = { precise: 0, adaptive: 0.05, fallback: 0.12 }[m.mode];
    const limit = { precise: 0, adaptive: 0.05, fallback: 0.09 }[m.mode];
    for (const b of ["low", "mid", "high"]) {
      const arr = m.onsets[b];
      let p = this._ptr[b];
      while (p * 2 < arr.length && arr[p * 2] <= t) {
        const s = arr[p * 2 + 1];
        if (s > thr[b]) {
          this.events.push({ type: "onset", band: b, strength: clamp(s, 0, 1.5) / 1.5, time: arr[p * 2] });
          // подстройка фазы сетки к сильным событиям (адаптивный и резервный режимы)
          if (gain > 0 && b !== "high" && s > thr[b] * 1.3) {
            const ot = arr[p * 2];
            const j = lowerIndex(beats, ot - this.correction);
            let best = 1e9;
            for (let k = Math.max(0, j); k <= Math.min(nb - 1, j + 1); k++) {
              const e = ot - (beats[k] + this.correction);
              if (Math.abs(e) < Math.abs(best)) best = e;
            }
            if (Math.abs(best) < this.period * 0.2) this.correction = clamp(this.correction + best * gain, -limit, limit);
          }
        }
        p++;
      }
      this._ptr[b] = p;
    }
  }

  /** Меню без трека: мягкий пульс 100 BPM по системным часам. */
  _idle(dt) {
    const t = performance.now() / 1000, P = 0.6;
    const idx = Math.floor(t / P);
    if (idx !== this.idx) {
      this.idx = idx;
      this.events.push({ type: "beat", index: idx, strong: idx % 4 === 0, strength: 0.5, time: idx * P });
    }
    this.period = P; this.bpm = 100;
    this.phase = (t / P) % 1;
    this.pulse = Math.exp(-this.phase * P * 7) * 0.6;
    this.strongPulse = idx % 4 === 0 ? this.pulse : this.strongPulse * Math.exp(-dt * 4);
    this.intensity = this.intensitySmooth = damp(this.intensitySmooth, 0.35, 1, dt);
    this.bands.low = this.pulse * 0.5; this.bands.mid = 0.3; this.bands.high = 0.2;
  }

  /** Окна точности в секундах для текущего темпа. */
  windows(P) {
    const ws = clamp(this.settings.v.windowScale, 0.7, 1.5) * (this.mode === "fallback" ? 1.4 : this.mode === "adaptive" ? 1.15 : 1);
    return {
      perfect: clamp(0.11 * P, 0.045, 0.075) * ws,
      good: clamp(0.22 * P, 0.09, 0.15) * ws,
      ok: 0.38 * P,
    };
  }

  /** Оценка нажатия в момент t (музыкальное время). */
  judge(t) {
    const m = this.map;
    if (!m) return { rating: "good", delta: 0, strong: false, strength: 0.5, beatTime: t, timeToBeat: 0, index: -1 };
    const beats = m.beats, nb = beats.length;
    const tc = t - this.correction;
    const i = clamp(lowerIndex(beats, tc), 0, nb - 1);
    const cands = [];
    for (let k = Math.max(0, i - 1); k <= Math.min(nb - 1, i + 1); k++) cands.push({ t: beats[k], k, half: false });
    const P = i + 1 < nb ? beats[i + 1] - beats[i] : m.period;
    // при медленном темпе засчитываются и половинные доли
    if (60 / P < 90 && i + 1 < nb) cands.push({ t: (beats[i] + beats[i + 1]) / 2, k: i, half: true });
    let best = cands[0];
    for (const c of cands) if (Math.abs(tc - c.t) < Math.abs(tc - best.t)) best = c;
    const delta = tc - best.t;
    const Pe = best.half ? P / 2 : P;
    const w = this.windows(Pe);
    const ad = Math.abs(delta);
    const rating = ad <= w.perfect ? "perfect" : ad <= w.good ? "good" : ad <= w.ok ? (delta < 0 ? "early" : "late") : "miss";
    return {
      rating, delta, index: best.k, half: best.half,
      strong: !best.half && !!m.strong[best.k], strength: best.half ? 0.3 : m.strength[best.k],
      beatTime: best.t + this.correction, timeToBeat: best.t - tc, period: Pe,
    };
  }

  /** Время первой доли не раньше t + minGap (музыкальное время). */
  nextBeatAfter(t, minGap = 0) {
    const m = this.map;
    const target = t + minGap;
    if (!m) { const P = this.period; return Math.ceil(target / P) * P; }
    const beats = m.beats;
    const j = lowerIndex(beats, target - this.correction) + 1;
    if (j < beats.length) return beats[j] + this.correction;
    return target + (m.period - ((target - beats[beats.length - 1]) % m.period));
  }

  isStrongIndex(i) { return !!(this.map && this.map.strong[i]); }
}

/* =====================================================================
   AutoSync — автоподстройка задержки по ударам игрока.
   delta из judge() = (музыкальное время нажатия) − (доля); songTime() = звук − latencyMs, поэтому
   устойчивое «позже на +X» лечится увеличением latencyMs на X (и наоборот). Берётся исходный delta
   нажатия (помощь ритму сдвигает только удар, а не отметку нажатия).
   ===================================================================== */
const SYNC_TUNE = {
  win: 24,         // сколько последних нажатий в выборке
  minN: 12,        // минимум нажатий для вывода
  dead: 12,        // мёртвая зона, мс: меньше — не трогаем
  maxSpread: 70,   // межквартильный разброс, мс: больше — игрок «плывёт», не подстраиваем
  step: 8,         // максимальный шаг за раз, мс
  gap: 2.5,          // не чаще раза в N секунд
  maxTotal: 120,   // предел суммарной коррекции за бой, мс
  toastGap: 20,    // тост не чаще раза в N секунд
};

class AutoSync {
  constructor(game) {
    this.game = game;
    this.reset();
  }
  reset() {
    this.buf = [];            // последние delta (мс) для статистики подстройки
    this.marks = [];          // для шкалы в HUD: {d (мс), t (время боя), lim (мс)}
    this.all = [];            // все засчитанные delta боя (для итогов), мс
    this.startMs = this.game.settings.v.latencyMs;
    this.lastAdj = -99; this.lastToast = -99;
  }
  /** Робастная оценка: усечённое среднее середины выборки (25–75%) и межквартильный разброс. */
  stats(a = this.buf) {
    const s = a.slice().sort((x, y) => x - y), n = s.length;
    if (!n) return { n: 0, mean: 0, spread: 0 };
    const lo = Math.floor(n * 0.25), hi = Math.max(lo + 1, Math.ceil(n * 0.75));
    let sum = 0; for (let i = lo; i < hi; i++) sum += s[i];
    return { n, mean: sum / (hi - lo), spread: s[Math.min(n - 1, Math.floor(n * 0.75))] - s[Math.floor(n * 0.25)] };
  }
  /** Нажатие атаки: j — результат judge(). */
  add(j) {
    const g = this.game;
    if (!j || j.index < 0 || !isFinite(j.delta)) return;
    const w = g.clock.windows(j.period || g.clock.period);
    const d = j.delta * 1000;
    this.marks.push({ d, t: g.combat.time, lim: w.good * 1000 });
    if (this.marks.length > 8) this.marks.shift();
    if (Math.abs(j.delta) >= w.good) return;      // промахи и «случайные» нажатия не учитываем
    this.buf.push(d); if (this.buf.length > SYNC_TUNE.win) this.buf.shift();
    this.all.push(d); if (this.all.length > 600) this.all.shift();
    this.tune();
  }
  tune() {
    const g = this.game, S = g.settings, T = SYNC_TUNE;
    if (!S.v.autoSync || g.state !== "battle" || this.buf.length < T.minN) return;
    const now = performance.now() / 1000;
    if (now - this.lastAdj < T.gap) return;
    const st = this.stats();
    if (st.spread > T.maxSpread || Math.abs(st.mean) <= Math.max(T.dead, 3 * st.spread / (1.35 * Math.sqrt(st.n)))) return;   // и не меньше трёх стандартных ошибок
    const cur = S.v.latencyMs;
    const room = st.mean > 0 ? this.startMs + T.maxTotal - cur : cur - (this.startMs - T.maxTotal);
    const step = Math.round(clamp(st.mean * 0.6, -T.step, T.step));
    const ms = Math.min(Math.abs(step), Math.max(0, room)) * Math.sign(step);
    if (!ms) return;
    this.lastAdj = now;
    // тихая запись: без clock.reset (songTime меняется всего на несколько мс)
    S.v.latencyMs = cur + ms; S.save();
    for (let i = 0; i < this.buf.length; i++) this.buf[i] -= ms;   // старые нажатия переведены в новую шкалу
    if (g.ui) g.ui.syncAll();
    if (now - this.lastToast >= T.toastGap) {
      this.lastToast = now;
      const tot = S.v.latencyMs - this.startMs;
      g.ui.toast(`Синхронизация подстроена: ${tot > 0 ? "+" : ""}${tot} мс`, 2200);
    }
  }
  /** Итог боя: медиана ошибки в мс (+ позже, − раньше) или null, если нажатий мало. */
  summary() {
    if (this.all.length < 8) return null;
    const s = this.all.slice().sort((x, y) => x - y);
    return { med: s[s.length >> 1], n: s.length, total: this.game.settings.v.latencyMs - this.startMs };
  }
}
