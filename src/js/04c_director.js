/* =====================================================================
   Режиссёр: ручная настройка частей трека (экран «Музыка», карточка «Режиссёр»).
   Режимы: auto — части из анализа (с чувствительностью: реже/чаще смены), manual — части,
   размеченные игроком, off — без эффектов по частям. Настройка хранится на трек
   (Store "dir.<ключ трека>") в ИСХОДНОМ времени трека и применяется к исходной карте
   до смены темпа: Director.apply(base) → Tempo.makeMap(...).
   ===================================================================== */
const DIR_KINDS = ["intro", "build", "drop", "climax", "break", "calm", "groove", "outro"];
const DIR_LABEL = { intro: "Вступление", build: "Нарастание", drop: "Дроп", climax: "Кульминация", break: "Брейк", calm: "Тихо", groove: "Ровно", outro: "Финал" };
const DIR_SHORT = { intro: "ВСТ", build: "НАР", drop: "ДРОП", climax: "КУЛЬМ", break: "БРЕЙК", calm: "ТИХО", groove: "РОВНО", outro: "ФИН" };
const DIR_COLOR = { intro: "#4a6aa8", build: "#d9a23a", drop: "#e0405a", climax: "#ff2e88", break: "#2fa58c", calm: "#4c5262", groove: "#737b88", outro: "#7a5ca8" };
const DIR_SENS = [2.4, 1.6, 1, 0.62, 0.38];   // множитель цены границы для чувствительности −2..+2 (−2 — реже смены)
const DIR_SENS_LABEL = ["реже всего", "реже", "как в анализе", "чаще", "чаще всего"];
const DIR_MIN_LEN = 0.5;                        // минимальная длина ручной части, с (границы двигаются без шага)

const Director = {
  defaults() { return { mode: "auto", sens: 0, secs: null }; },

  normalize(d) {
    const o = this.defaults();
    if (!d || typeof d !== "object") return o;
    if (d.mode === "manual" || d.mode === "off") o.mode = d.mode;
    o.sens = clamp(Math.round(+d.sens || 0), -2, 2);
    if (Array.isArray(d.secs) && d.secs.length) {
      const secs = d.secs.filter(x => x && isFinite(x.s) && DIR_KINDS.includes(x.k)).map(x => ({ s: Math.max(0, +x.s), k: x.k })).sort((a, b) => a.s - b.s);
      if (secs.length) { secs[0].s = 0; o.secs = secs; }
    }
    if (o.mode === "manual" && !o.secs) o.mode = "auto";
    return o;
  },
  isDefault(d) { d = this.normalize(d); return d.mode === "auto" && d.sens === 0; },

  load(meta) { return this.normalize(meta ? Store.get("dir." + meta.key, null) : null); },
  save(meta, d) {
    if (!meta) return;
    d = this.normalize(d);
    // ручная разметка хранится и в режимах auto/off — чтобы переключение туда-обратно её не теряло
    Store.set("dir." + meta.key, d.mode === "auto" && d.sens === 0 && !d.secs ? null : d);
  },
  forget(meta) { if (meta) Store.set("dir." + meta.key, null); },

  /** Входные данные анализа частей из карты (без доступа к STFT). */
  _a(base) { return { duration: base.duration, envFps: base.envFps, energy: base.energy, bl: base.low, bh: base.high, confidence: base.confidence }; },

  /** Части «как в анализе» с выбранной чувствительностью. Старые карты без признаков тактов — только как есть. */
  autoSections(base, sens) {
    if (!sens || !base.bars || !base.bars.B) return base.sections;
    try { return segmentBars(this._a(base), base.bars, DIR_SENS[sens + 2]); }
    catch (e) { console.warn(e); return base.sections; }
  },

  /** Полные объекты частей из ручной разметки [{s, k}]: энергия/уровень/бас/верха — по огибающим карты. */
  fill(base, list) {
    const { envFps, energy, duration } = base, bl = base.low, bh = base.high;
    const mean = (arr, t0, t1) => { if (!arr) return 0; let s = 0, c = 0; for (let i = Math.floor(t0 * envFps); i < Math.min(arr.length, Math.ceil(t1 * envFps)); i++) { s += arr[i]; c++; } return c ? s / c : 0; };
    const gLow = mean(bl, 0, duration), gHigh = mean(bh, 0, duration);
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const start = i ? list[i].s : 0, end = i + 1 < list.length ? list[i + 1].s : duration;
      if (end - start < 0.05) continue;
      const e = mean(energy, start, end);
      const sc = { start, end, kind: list[i].k, energy: e, level: e < 0.38 ? "calm" : e > 0.66 ? "intense" : "mid", drive: e,
        bassy: mean(bl, start, end) > gLow * 1.12, bright: mean(bh, start, end) > gHigh * 1.12, slope: 0, manual: true };
      // уровень для агрессии врагов — по характеру части, а не только по громкости
      if (sc.kind === "drop" || sc.kind === "climax") sc.level = "intense";
      else if (sc.kind === "break" || sc.kind === "calm" || sc.kind === "intro" || sc.kind === "outro") sc.level = e > 0.66 ? "mid" : sc.level;
      out.push(sc);
    }
    out.forEach((sc, i) => { sc.delta = i ? sc.energy - out[i - 1].energy : 0; });
    return out;
  },

  /** Части, которые увидят часы и арена (в исходном времени трека). */
  sections(base, d) {
    d = this.normalize(d);
    if (d.mode === "off") return this.fill(base, [{ s: 0, k: "groove" }]);
    if (d.mode === "manual") return this.fill(base, d.secs);
    return this.autoSections(base, d.sens);
  },

  /** Карта с частями Режиссёра (base не меняется). По умолчанию — сам base. */
  apply(base, d) {
    d = this.normalize(d);
    if (!base || (d.mode === "auto" && d.sens === 0)) return base;
    return Object.assign({}, base, { sections: this.sections(base, d), directorOff: d.mode === "off" });
  },

  /** Ручная разметка из готовых частей. */
  toList(sections) { return sections.map((s, i) => ({ s: i ? Math.round(s.start * 1000) / 1000 : 0, k: s.kind || "groove" })); },

  /** Сетка привязки границ: массив времён (исходное время) для grid = beat | bar | bar4; free — null. */
  grid(base, grid) {
    if (grid === "free") return null;
    if (grid === "beat") return base.beats;
    const ed = base.bars && base.bars.edges && base.bars.edges.length > 2 ? base.bars.edges : null;
    let bars = ed;
    if (!bars) { bars = []; const b = base.beats, st = base.strong; for (let i = 0; i < b.length; i++) if (!st || st[i]) bars.push(b[i]); if (!bars.length) bars = [0]; }
    if (grid !== "bar4") return bars;
    // фразы по 4 такта: фаза — по началам частей анализа (они лежат на границах фраз), иначе от начала трека
    const votes = [0, 0, 0, 0];
    for (const sc of base.sections || []) {
      if (!sc.start) continue;
      let k = 0, bd = Infinity;
      for (let i = 0; i < bars.length; i++) { const d = Math.abs(bars[i] - sc.start); if (d < bd) { bd = d; k = i; } }
      votes[k % 4]++;
    }
    const ph = votes.indexOf(Math.max(...votes));
    const out = [0];
    for (let i = 0; i < bars.length; i++) if (i % 4 === ph && bars[i] > 0) out.push(bars[i]);
    return out;
  },
  /** Ближайшая точка сетки к t (без сетки — само t). */
  snap(base, t, grid = "bar") {
    const g = this.grid(base, grid);
    t = clamp(t, 0, base.duration);
    if (!g || !g.length) return t;
    let best = t, bd = Infinity;
    for (let i = 0; i < g.length; i++) { const d = Math.abs(g[i] - t); if (d < bd) { bd = d; best = g[i]; } }
    return best;
  },
  /** Точка сетки на n шагов вперёд/назад от t (без сетки — шаг в такт по темпу). */
  stepBar(base, t, n, grid = "bar") {
    const g = this.grid(base, grid === "free" ? "bar" : grid);
    if (!g || g.length < 2) { const bar = 4 * 60 / Math.max(40, base.bpm || 120); return clamp(t + n * bar, 0, base.duration); }
    let i = 0, bd = Infinity;
    for (let k = 0; k < g.length; k++) { const d = Math.abs(g[k] - t); if (d < bd) { bd = d; i = k; } }
    return g[clamp(i + n, 0, g.length - 1)];
  },

  /** Отметка «с этого места» (разметка на слух): часть характера k начинается в s. Возвращает индекс отмеченной части. */
  mark(list, s, k, duration) {
    let i = 0;
    while (i + 1 < list.length && list[i + 1].s <= s) i++;
    const end = i + 1 < list.length ? list[i + 1].s : duration;
    let at;
    if (s - list[i].s < DIR_MIN_LEN) { list[i].k = k; at = i; }                         // у самого начала части — меняем её
    else if (end - s < DIR_MIN_LEN && i + 1 < list.length) { list[i + 1].s = s; list[i + 1].k = k; at = i + 1; }   // у самого конца — сдвигаем следующую
    else { list.splice(i + 1, 0, { s, k }); at = i + 1; }
    return this.tidy(list, at);
  },
  /** Слить соседние части одного характера и слишком короткие; вернуть новый индекс части idx. */
  tidy(list, idx = 0) {
    list[0].s = 0;
    for (let i = 1; i < list.length; i++) {
      if (list[i].k === list[i - 1].k || list[i].s - list[i - 1].s < 0.05) {
        list.splice(i, 1);
        if (idx >= i) idx--;
        i--;
      }
    }
    return clamp(idx, 0, list.length - 1);
  },
};

/** Что делает часть на арене — подсказка в настройке Режиссёра. */
const DIR_DESC = {
  intro: "фон приглушён, без вспышек",
  build: "искры летят вверх, свечение растёт к следующему дропу",
  drop: "лазеры, строб, смена неоновых цветов, вспышка на первой доле",
  climax: "как дроп, но ярче, с искрами сверху",
  break: "фон обесцвечивается, прожектор на героя",
  calm: "фон приглушён",
  groove: "обычный фон без особых эффектов",
  outro: "фон приглушён, затихание",
};
