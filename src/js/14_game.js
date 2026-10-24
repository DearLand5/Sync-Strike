/* =====================================================================
   Game — главный цикл и связывание систем.
   ===================================================================== */
// Баланс сложностей. Все рычаги в одном месте:
//  hp/playerHp — множители HP врагов и героя (база героя 130); dmg — урон врагов; playerDmg — урон героя;
//  cd — паузы между атаками врага; wind — длина замаха (время на реакцию); bolt — скорость пуль стрелков;
//  hurtIF — неуязвимость после удара (с); perfectDodge — окно идеального уклона (с);
//  spawnGrace — пауза перед первой атакой нового врага (с); gap — множитель паузы между атаками разных врагов;
//  tokens(n)/ranged(n) — сколько врагов (и стрелков) может атаковать одновременно на волне n;
//  alive(n) — сколько врагов одновременно на арене; waveHeal — лечение между волнами (доля от макс. HP);
//  waveSize — доля врагов в каждом натиске волны (WAVES); eliteHp — множитель HP элитных врагов («+» в WAVES);
//  windBeats — добавка к числу долей замаха врага (тип задаёт базу; темп трека добавляет/убирает доли, см. Enemy._windBeats).
const DIFFS = {
  easy: {
    hp: 0.85, playerHp: 1.3, dmg: 0.5, playerDmg: 1.15, cd: 1.5, wind: 1.25, bolt: 0.85,
    hurtIF: 1.1, perfectDodge: 0.22, spawnGrace: 0.9, gap: 1.5, extra: -1,
    tokens: n => 1 + Math.floor(n / 5), ranged: n => 1, alive: n => 3 + Math.floor(n / 3), waveHeal: 0.25,
    waveSize: 0.7, eliteHp: 1.4, windBeats: 1,
  },
  normal: {
    hp: 1.1, playerHp: 1, dmg: 0.6, playerDmg: 1, cd: 1.2, wind: 1.07, bolt: 0.95,
    hurtIF: 0.85, perfectDodge: 0.18, spawnGrace: 0.55, gap: 1.15, extra: 0,
    tokens: n => 1 + Math.floor((n + 1) / 3), ranged: n => (n >= 4 ? 2 : 1), alive: n => 3 + Math.floor(n / 2), waveHeal: 0.35,
    waveSize: 0.8, eliteHp: 1.8, windBeats: 0,
  },
  hard: {
    hp: 1.2, playerHp: 0.85, dmg: 0.95, playerDmg: 0.95, cd: 0.9, wind: 0.88, bolt: 1.1,
    hurtIF: 0.7, perfectDodge: 0.15, spawnGrace: 0.35, gap: 1, extra: 1,
    tokens: n => Math.min(3, 2 + Math.floor(n / 3)), ranged: n => (n >= 3 ? 2 : 1), alive: n => 4 + Math.floor(n / 2), waveHeal: 0.25,
    waveSize: 0.9, eliteHp: 2, windBeats: 0,
  },
};
// Режимы замедлений (настройка «Замедления»): кулдаун после замедления (с), отдельно для зрелищных ударов,
// бюджет — максимальная доля замедленного времени за 8 с, stopScale — множитель стоп-кадров.
const SLOWMO_MODES = {
  normal: { gap: 1.6, flairGap: 2.8, budget: 0.3, stopScale: 1 },
  rare:   { gap: 2.5, flairGap: 4.0, budget: 0.2, stopScale: 0.85 },
  off:    { gap: 1e9, flairGap: 1e9, budget: 0, stopScale: 0.6 },
};
const SLOW_PRIORITY = { flair: 1, dodge: 2, takedown: 3, finale: 4 };
const SECTION_NAMES = { intro: "ИНТРО", build: "НАРАСТАНИЕ", drop: "ДРОП", climax: "КУЛЬМИНАЦИЯ", break: "БРЕЙК", calm: "ЗАТИШЬЕ", groove: "ГРУВ", outro: "ФИНАЛ" };
const MODE_NAMES = { waves: "Волны", track: "До конца трека", practice: "Практика" };
const STEP = 1 / 120;
const VIEW_H = 360;            // видимая высота мира в единицах

class Game {
  constructor() {
    this.canvas = $("game");
    this.ctx = this.canvas.getContext("2d", { alpha: false });
    this.settings = new Settings();
    this.audio = new AudioManager(this.settings);
    this.analyzer = new RhythmAnalyzer();
    this.library = new TrackLibrary();
    this.clock = new RhythmClock(this.settings);
    this.input = new InputManager(this.canvas, this.settings);
    this.input.onPause = () => (this.state === "battle" ? this.pause() : this.state === "paused" && this.ui.screen === "pause" ? this.resume() : null);
    this.fx = new ParticleSystem(700);
    this.camera = new Camera();
    this.arena = new ArenaRenderer();
    this.player = new Player(this.settings.v.skin);
    this.enemies = [];
    this.combat = new CombatSystem(this);
    this.sync = new AutoSync(this);
    this.director = new AttackDirector(this);
    this.waves = new WaveDirector(this);
    this.hud = new HUD(this);
    this.afterimages = [];
    this._aiT = 0;
    this.state = "menu";
    this.battleActive = false;
    this.mode = this.settings.v.mode;
    this.diff = DIFFS[this.settings.v.difficulty] || DIFFS.normal;
    this.track = null;
    this.songNow = 0;
    this.acc = 0; this.hitstopT = 0; this.slowT = 0; this.slowDur = 0; this.slowScale = 1;
    this.resetTimeFx();
    this.deferPose = false; this._m = { onsets: [] };
    this.hurtFlash = 0; this.endT = 0; this.endWin = false;
    this.letterbox = 0; this.letterboxTarget = 0; this.flashT = 0; this.takedownTitle = ""; this.takedownTitleT = 0;
    this.sectionTitle = ""; this.sectionTitleT = 0;
    this.fps = 60; this._ft = 16; this._slowFrames = 0; this.autoLow = false;
    this.effQuality = "high";
    this.loading = false;
    this.strongBeatNow = false;
    this.ui = new UIManager(this);

    this.audio.on("ended", () => this.onTrackEnded());
    // Сброс GPU (Android при нагреве/нехватке видеопамяти): основной холст браузер восстановит сам,
    // а фон, нарисованный один раз во внеэкранных холстах, нужно перерисовать.
    this.gpuLost = false; this.gpuResets = 0; this._lostCheckT = 0;
    this.canvas.addEventListener("contextlost", () => { this.gpuLost = true; this.gpuResets++; });
    this.canvas.addEventListener("contextrestored", () => { this.gpuLost = false; this.arena.invalidate(); });
    const onResize = () => { this.resize(); this.checkOrientation(); };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", () => setTimeout(onResize, 250));
    if (window.visualViewport) window.visualViewport.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", () => this.onVisibility());
    window.addEventListener("pagehide", () => { if (this.state === "battle") this.pause(); else if (this.state === "paused") this.autosave(); });
    this.settings.on("change", k => {
      if (k === "difficulty") this.diff = DIFFS[this.settings.v.difficulty];
      if (k === "latencyMs") this.clock.reset(this.audio.songTime());
      if (k === "forceLandscape") { this.resize(); this.checkOrientation(); }
    });

    this.applyQuality();
    this.ui.show("menu");
    this.restoreSession();
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  sfx(name, a, b) { const s = this.audio.sfx; if (s && s[name]) s[name](a, b); }

  /* ---------- качество и размеры ---------- */
  applyQuality() {
    const q = this.settings.v.quality;
    this.effQuality = q === "auto" ? (this.autoLow ? "low" : "high") : q;
    CharacterRenderer.quality = this.effQuality;
    this.fx.setQuality(this.effQuality);
    this.resize();
  }
  /** Горизонталь по умолчанию: если телефон держат вертикально, поворачиваем интерфейс на 90°. */
  applyRotation() {
    const app = $("app"), iw = window.innerWidth, ih = window.innerHeight;
    const rot = this.settings.v.forceLandscape && ih > iw * 1.05 && this.isTouchDevice();
    this.input.rotated = rot;
    app.classList.toggle("rot", rot);
    if (rot) { app.style.width = ih + "px"; app.style.height = iw + "px"; app.style.transform = `translate(${iw}px,0) rotate(90deg)`; }
    else { app.style.width = ""; app.style.height = ""; app.style.transform = ""; }
  }
  resize() {
    this.applyRotation();
    this.cssW = Math.max(1, this.canvas.clientWidth); this.cssH = Math.max(1, this.canvas.clientHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.effQuality === "low" ? 1.25 : 2);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.tileDpr = this.effQuality === "low" ? 1 : Math.min(this.dpr, 1.5);
    this.input.touch.resize(this.cssW, this.cssH);
  }
  isTouchDevice() { return this.input.usingTouch || (window.matchMedia && matchMedia("(pointer: coarse)").matches); }
  checkOrientation() {
    const portrait = this.cssH > this.cssW * 1.05 && !this.input.rotated;
    const need = portrait && this.isTouchDevice() && (this.state === "battle" || this.state === "paused" || this.state === "editor");
    $("rotate").hidden = !need;
    if (need && this.state === "battle") this.pause();
  }
  requestFullscreen(force = false) {
    if (!this.settings.v.fullscreen && !force) return;
    const el = document.documentElement;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (fn && !document.fullscreenElement && !document.webkitFullscreenElement) {
      try {
        const p = fn.call(el, { navigationUI: "hide" });
        const lock = () => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock("landscape").catch(() => {}); } catch (e) {} };
        if (p && p.then) p.then(lock).catch(() => {}); else lock();
      } catch (e) { /* не поддерживается (iPhone) */ }
    }
  }
  onVisibility() {
    if (!document.hidden) this.arena.checkLost();
    if (document.hidden) {
      if (this.state === "battle") this.pause();
      else if (this.audio.playing) { this.audio.pause(); this._menuPausedByHide = true; }
      this.audio.suspend();
    } else this.audio.resume();
  }

  /* ---------- треки ---------- */
  /** Индикатор анализа на экране «Музыка». */
  _progress(k, label) {
    $("analysis-bar").style.width = Math.round(k * 100) + "%"; $("analysis-pct").textContent = Math.round(k * 100) + "%";
    if (label) $("analysis-label").textContent = label;
  }
  async loadFile(file) {
    if (this.loading) return;
    this.audio.unlock();
    if (file.size > 80 * 1024 * 1024) { this.ui.toast("Файл больше 80 МБ: выберите трек поменьше"); return; }
    this.loading = true;
    const card = $("analysis-card");
    const prog = (k, label) => this._progress(k, label);
    card.hidden = false; prog(0, "Чтение файла");
    try {
      const ab = file.arrayBuffer ? await file.arrayBuffer() : await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsArrayBuffer(file); });
      const key = file.name + "|" + file.size;
      const name = file.name.replace(/\.[^.]+$/, "");
      await this.library.ready;
      // уже в библиотеке — берём сохранённый анализ
      const known = this.library.findByKey(key);
      const cached = known ? await this.library.load(known.id).catch(() => null) : null;
      prog(0.02, "Декодирование");
      const buffer = await this.audio.decode(ab.slice(0));   // decodeAudioData «забирает» буфер — нужна копия для библиотеки
      if (!buffer || buffer.duration < 5) throw new Error("short");
      const map = cached && cached.map ? cached.map : await this.analyzer.analyze(buffer, (k, l) => prog(0.05 + k * 0.95, l));
      const meta = { name, key, isDemo: false, libId: null };
      await this.prepareTrack(buffer, map, meta, known && known.tempo, prog);
      let note = "";
      if (this.library.ok) {
        prog(1, "Сохранение в библиотеку");
        try {
          const r = await this.library.add({ key, name }, ab, map, this._protectedIds());
          meta.libId = r.id;
          Store.set("lastTrack", r.id);
          if (r.evicted.length) note = ` · места мало, из библиотеки удалено: «${r.evicted.join("», «")}»`;
        } catch (e) { console.warn(e); note = " · не удалось сохранить в библиотеку (нет места)"; }
      }
      this.ui.toast(cached && cached.map
        ? `Трек уже был в библиотеке: ${map.bpm.toFixed(1)} BPM` + note
        : `Готово: ${map.bpm.toFixed(1)} BPM, режим «${MODE_LABEL[map.mode]}», анализ за ${(map.ms / 1000).toFixed(1)} с` + note, note ? 5000 : 2600);
    } catch (e) {
      console.warn(e);
      this.ui.toast(e && e.message === "short" ? "Трек слишком короткий (меньше 5 секунд)" : "Не удалось открыть файл. Проверьте, что это MP3 и он не повреждён.", 4000);
    } finally {
      card.hidden = true;
      this.loading = false;
      if (this.ui.screen === "music") this.ui.refreshMusic(); else if (this.ui.screen === "director") this.ui.refreshDirector();
      if (this.ui.screen === "library") this.ui.refreshLibrary();
    }
  }

  /** Треки, которые нельзя вытеснять из библиотеки: текущий и трек автосохранения. */
  _protectedIds() {
    const ids = [];
    if (this.track && this.track.meta.libId) ids.push(this.track.meta.libId);
    const a = this.getAutosave();
    if (a && a.libId) ids.push(a.libId);
    return ids;
  }

  /** Загрузка трека из библиотеки. quiet — без сообщений (восстановление при запуске). */
  async loadFromLibrary(id, quiet = false) {
    if (this.loading) return false;
    if (this.track && this.track.meta.libId === id) { this.library.touch(id); Store.set("lastTrack", id); return true; }
    this.loading = true;
    const card = $("analysis-card");
    card.hidden = false; this._progress(0, "Загрузка из библиотеки");
    try {
      const rec = await this.library.load(id);
      if (!rec) throw new Error("missing");
      const audioCopy = rec.map ? null : rec.audio.slice(0);
      const buffer = await this.audio.decode(rec.audio);
      let map = rec.map;
      if (!map) {
        // анализатор обновился — пересчитываем и сохраняем заново
        map = await this.analyzer.analyze(buffer, (k, l) => this._progress(0.05 + k * 0.95, l));
        this.library.updateMap(id, audioCopy, map).catch(e => console.warn(e));
      }
      await this.prepareTrack(buffer, map, { name: rec.meta.name, key: rec.meta.key, isDemo: false, libId: id }, rec.meta.tempo, (k, l) => this._progress(k, l));
      this.library.touch(id);
      Store.set("lastTrack", id);
      if (!quiet) this.ui.toast(`Трек «${rec.meta.name}» · ${this.track.map.bpm.toFixed(1)} BPM`);
      return true;
    } catch (e) {
      console.warn(e);
      if (!quiet) this.ui.toast("Не удалось открыть трек из библиотеки", 3500);
      return false;
    } finally {
      card.hidden = true;
      this.loading = false;
      if (this.ui.screen === "music") this.ui.refreshMusic(); else if (this.ui.screen === "director") this.ui.refreshDirector();
      if (this.ui.screen === "library") this.ui.refreshLibrary();
    }
  }

  async deleteTrack(id) {
    try { await this.library.remove(id); } catch (e) { console.warn(e); this.ui.toast("Не удалось удалить трек"); return; }
    if (Store.get("lastTrack", null) === id) Store.set("lastTrack", null);
    const a = this.getAutosave();
    if (a && a.libId === id) this.clearAutosave();
    // уже загруженный трек остаётся в памяти до выбора другого, но больше не связан с библиотекой
    if (this.track && this.track.meta.libId === id) this.track.meta.libId = null;
    this.ui.refreshMenu();
  }

  /** При запуске: открыть последний трек из библиотеки. */
  async restoreSession() {
    await this.library.ready;
    const id = Store.get("lastTrack", null);
    if (id && this.library.get(id) && !this.track) await this.loadFromLibrary(id, true);
    this.ui.refreshMenu();
  }

  async loadDemo() {
    if (this.loading) return;
    this.audio.unlock();
    this.audio.ensure();
    if (this._demo) {
      this.loading = true;
      try { await this.prepareTrack(this._demo.buffer, this._demo.map, this._demo.meta, Store.get("tempo.demo", null), (k, l) => this._progress(k, l)); }
      finally { $("analysis-card").hidden = true; this.loading = false; }
      if (this.ui.screen === "music") this.ui.refreshMusic(); else if (this.ui.screen === "director") this.ui.refreshDirector();
      return;
    }
    this.loading = true;
    const card = $("analysis-card");
    card.hidden = false;
    $("analysis-label").textContent = "Синтез демо-трека";
    try {
      await yieldToUI();
      const buffer = DemoTrack.generate(this.audio.ctx);
      const map = await this.analyzer.analyze(buffer, (k, l) => { $("analysis-bar").style.width = Math.round(k * 100) + "%"; $("analysis-pct").textContent = Math.round(k * 100) + "%"; $("analysis-label").textContent = l; });
      this._demo = { buffer, map, meta: { name: DemoTrack.name, key: "demo", isDemo: true } };
      await this.prepareTrack(buffer, map, this._demo.meta, Store.get("tempo.demo", null), (k, l) => this._progress(k, l));
    } finally {
      card.hidden = true;
      this.loading = false;
      if (this.ui.screen === "music") this.ui.refreshMusic(); else if (this.ui.screen === "director") this.ui.refreshDirector();
    }
  }

  /**
   * Ставит трек. buffer/map — то, что играет и видят часы (с учётом темпа);
   * base = { buffer, map, tempo } — исходный звук и анализ (в библиотеке хранится только он).
   */
  setTrack(buffer, map, meta, base) {
    this.audio.setTrack(buffer, meta);
    this.clock.setMap(map);
    const saved = Store.get("theme." + meta.key, "auto");
    this.track = {
      buffer, map, meta, themeId: saved, changed: true,
      base: base ? { buffer: base.buffer, map: base.map } : { buffer, map },
      tempo: Tempo.normalize(base && base.tempo),
      director: Director.normalize(base && base.director),   // ручная настройка Режиссёра (применена к map)
    };
    this.applyTrackTheme();
    this.ui.refreshMenu();
  }
  /** Загрузка с учётом сохранённого темпа: при rate ≠ 1 звук растягивается заново (в хранилище лежит оригинал). */
  async prepareTrack(buffer, map, meta, tempo, prog) {
    tempo = Tempo.normalize(tempo);
    let b = buffer;
    if (tempo.rate !== 1) { prog(0, "Смена темпа"); b = await Tempo.makeBuffer(this.audio.ensure(), buffer, tempo, prog); }
    const dir = Director.load(meta);
    this.setTrack(b, Tempo.makeMap(Director.apply(map, dir), tempo, b.duration), meta, { buffer, map, tempo, director: dir });
  }
  /** Сохраняет темп текущего трека (библиотека или Store для демо). */
  saveTempo() {
    const t = this.track;
    if (!t) return;
    const packed = Tempo.pack(t.tempo);
    if (t.meta.libId) this.library.setTempo(t.meta.libId, packed);
    else if (t.meta.isDemo) Store.set("tempo.demo", packed);
  }
  /**
   * Смена темпа/правки долей текущего трека. Звук пересчитывается только если изменились rate или «сохранять тон»;
   * правка долей — мгновенная. Во время обработки интерфейс живой (порции с yieldToUI).
   * Возвращает true, если темп применён.
   */
  async applyTempo(next, force = false) {
    const t = this.track;
    if (!t) return false;
    next = Tempo.normalize(next);
    if (this.loading) { this._tempoPending = next; return false; }
    if (this.battleActive && !force) return false;
    if (Tempo.same(next, t.tempo)) return true;
    this.loading = true;
    const card = $("analysis-card"), a = this.audio;
    try {
      const old = t.tempo, was = a.playing;
      const pos = was ? a.heardPosition() : a.pausedAt;
      let buffer = t.buffer;
      if (!Tempo.sameSound(next, old)) {
        if (was) a.pause();
        card.hidden = false; this._progress(0, "Смена темпа");
        buffer = await Tempo.makeBuffer(a.ensure(), t.base.buffer, next, (k, l) => this._progress(k, l));
      }
      const map = Tempo.makeMap(Director.apply(t.base.map, t.director), next, buffer.duration);
      const newPos = clamp(pos * old.rate / next.rate, 0, Math.max(0, buffer.duration - 0.05));
      if (buffer !== t.buffer) { a.setTrack(buffer, t.meta); a.pausedAt = newPos; }
      this.clock.setMap(map);
      t.buffer = buffer; t.map = map; t.tempo = next;
      this.saveTempo();
      if (was) a.play(newPos);
      this.ui.refreshMenu();
      return true;
    } catch (e) {
      console.warn(e);
      this.ui.toast("Не удалось изменить темп", 3000);
      return false;
    } finally {
      card.hidden = true;
      this.loading = false;
      if (this.ui.screen === "music") this.ui.refreshMusic(); else if (this.ui.screen === "director") this.ui.refreshDirector();
      const pend = this._tempoPending; this._tempoPending = null;
      if (pend && this.track === t && !Tempo.same(pend, t.tempo)) this.applyTempo(pend);
    }
  }
  /** Ручная настройка Режиссёра текущего трека: части пересчитываются мгновенно (звук и темп не трогаем). */
  applyDirector(next) {
    const t = this.track;
    if (!t || this.battleActive) return false;
    next = Director.normalize(next);
    t.director = next;
    Director.save(t.meta, next);
    t.map = Tempo.makeMap(Director.apply(t.base.map, next), t.tempo, t.buffer.duration);
    this.clock.setMap(t.map);
    return true;
  }
  resolveTheme() {
    const t = this.track;
    if (!t) return "city";
    if (t.themeId && t.themeId !== "auto") return t.themeId;
    return rankThemes(t.base.map.features)[0].theme.id;   // по исходному анализу: смена темпа не меняет арену
  }
  applyTrackTheme() { this.arena.setTheme(this.resolveTheme()); }
  setTrackTheme(id) {
    if (!this.track) return;
    this.track.themeId = id;
    Store.set("theme." + this.track.meta.key, id);
    this.applyTrackTheme();
  }

  /* ---------- автосохранение ----------
     «Волны» — контрольная точка в начале каждой волны; «До конца трека» — каждые 10 с и при паузе.
     Сохраняются очки и статистика, здоровье, волна и позиция трека; враги на арене не сохраняются. */
  getAutosave() { const a = Store.get("autosave", null); return a && a.v === 1 ? a : null; }
  clearAutosave() { Store.set("autosave", null); this.ui.refreshMenu(); }
  autosave() {
    if (!this.battleActive || !this.track || this.mode === "practice" || this.endT > 0 || !this.player.alive) return;
    const c = this.combat, m = this.track.meta, p = this.player;
    const wave = this.mode === "waves" ? Math.max(1, this.waves.wave) : 0;
    const snap = this.mode === "waves" && this._waveSnap && this._waveSnap.wave === wave ? this._waveSnap : null;
    const st = snap || {
      score: c.score, kills: c.kills, maxCombo: c.maxCombo, ratings: Object.assign({}, c.ratings),
      perfectDodges: c.perfectDodges, damageTaken: c.damageTaken, time: c.time, hp: p.hp / p.maxHp,
      songPos: clamp(this.audio.playing ? this.songNow : this.audio.pausedAt, 0, Math.max(0, this.audio.duration - 8)),
    };
    Store.set("autosave", Object.assign({
      v: 1, mode: this.mode, difficulty: this.settings.v.difficulty, wave,
      name: m.name, key: m.key, libId: m.libId || null, isDemo: !!m.isDemo, savedAt: Date.now(),
      tempo: Tempo.pack(this.track.tempo),      // songPos — во времени растянутого трека
    }, st));
  }
  /** Контрольная точка в начале волны (вызывает WaveDirector.startWave). */
  onWaveStart(n) {
    if (this.mode !== "waves") return;
    const c = this.combat, p = this.player;
    this._waveSnap = {
      wave: n, score: c.score, kills: c.kills, maxCombo: c.maxCombo, ratings: Object.assign({}, c.ratings),
      perfectDodges: c.perfectDodges, damageTaken: c.damageTaken, time: c.time, hp: p.hp / p.maxHp,
      songPos: clamp(this.songNow, 0, Math.max(0, this.audio.duration - 8)),
    };
    this.autosave();
  }
  /** «Продолжить» из меню: найти трек автосохранения и начать бой с сохранённого места. */
  async continueBattle() {
    const a = this.getAutosave();
    if (!a || this.loading) return;
    this.audio.unlock();
    this.requestFullscreen();
    let ok = this.track && this.track.meta.key === a.key;
    if (!ok && a.isDemo) { this.ui.show("music"); await this.loadDemo(); ok = true; }
    if (!ok && a.libId && this.library.get(a.libId)) { this.ui.show("music"); ok = await this.loadFromLibrary(a.libId); }
    if (!ok) { this.ui.toast("Трек сохранённого боя удалён из библиотеки"); this.clearAutosave(); return; }
    if (DIFFS[a.difficulty]) this.settings.set("difficulty", a.difficulty);
    // позиция сохранена в том темпе, в котором шёл бой
    if (this.track && !Tempo.same(this.track.tempo, a.tempo)) {
      this.ui.show("music");
      await this.applyTempo(a.tempo, true);
      if (!Tempo.same(this.track.tempo, a.tempo)) { this.ui.toast("Не удалось восстановить темп трека"); return; }
    }
    this.startBattle(a.mode, a);
  }

  /* ---------- бой ---------- */
  async startBattle(mode, resume = null) {
    this.audio.unlock();
    this.requestFullscreen();                  // только синхронно в обработчике жеста
    if (this.loading) return;
    if (!this.track) {
      this.ui.toast("Готовлю демо-трек…");
      this.ui.show("music");
      await this.loadDemo();
    }
    this.mode = mode;
    this.diff = DIFFS[this.settings.v.difficulty] || DIFFS.normal;
    this.player.setSkin(this.settings.v.skin);
    this.player.reset(WORLD.w / 2, this.diff.playerHp);
    this.player.dodgeCount = 0;
    this.letterbox = 0; this.letterboxTarget = 0; this.flashT = 0; this.takedownTitleT = 0;
    this.camera.release(); this.camera.fw = 0;
    this.enemies = [];
    this.combat.reset();
    this.sync.reset();
    this.director.reset();
    this.waves.reset(mode);
    this.fx.clear();
    this.afterimages = [];
    this.camera.x = this.player.x; this.camera.trauma = 0;
    this.hitstopT = 0; this.slowT = 0; this.hurtFlash = 0; this.endT = 0;
    this.resetTimeFx();
    this.battleActive = true;
    this.state = "battle";
    this.input.active = true; this.input.clear();
    this.ui.hideAll();
    $("btn-pause").hidden = false;
    this.track.changed = false;
    this.applyTrackTheme();
    this._waveSnap = null; this._saveT = 0;
    let at = 0;
    if (resume) {
      const c = this.combat;
      Object.assign(c, { score: resume.score, kills: resume.kills, maxCombo: resume.maxCombo, perfectDodges: resume.perfectDodges, damageTaken: resume.damageTaken, time: resume.time });
      Object.assign(c.ratings, resume.ratings);
      this.player.hp = clamp(Math.round(this.player.maxHp * resume.hp), 1, this.player.maxHp);
      if (mode === "waves") this.waves.wave = clamp(resume.wave, 1, WAVES.length) - 1;   // волна начнётся заново
      at = clamp(resume.songPos || 0, 0, Math.max(0, this.audio.duration - 8));
      this.ui.toast(mode === "waves" ? `Продолжение: волна ${resume.wave}` : `Продолжение с ${fmtTime(at)}`);
    } else if (mode !== "practice") this.clearAutosave();
    this.audio.play(at);
    this.clock.reset(at);
    this.checkOrientation();
  }

  pause() {
    if (this.state !== "battle") return;
    this.state = "paused";
    this.audio.pause();
    this.input.active = false; this.input.clear();
    $("btn-pause").hidden = true;
    this.autosave();
    $("pause-info").textContent = (this.track ? this.track.meta.name : "") + " · " + fmtTime(this.audio.pausedAt) + " · " + MODE_NAMES[this.mode];
    this.ui.show("pause");
    this.sfx("uiBack");
  }
  resume() {
    if (!this.battleActive) return;
    this.ui.hideAll();
    this.state = "battle";
    this.input.active = true; this.input.clear();
    $("btn-pause").hidden = false;
    $("rotate").hidden = true;
    this.applyTrackTheme();
    if (this.track && this.track.changed) { this.track.changed = false; this.audio.play(0); this.clock.reset(0); }
    else this.audio.play();
    this.requestFullscreen();
    this.checkOrientation();
  }
  returnToBattle() { this.resume(); }

  toMenu() {
    this.combat.td = null; this.player.scripted = false; this.camera.release(); this.letterboxTarget = 0;
    this.battleActive = false;
    this.state = "menu";
    this.audio.pause();
    this.input.active = false; this.input.clear();
    $("btn-pause").hidden = true;
    this.enemies = [];
    this.combat.projectiles.length = 0;
    this.player.reset(WORLD.w / 2);
    this.ui.show("menu");
    $("rotate").hidden = true;
  }

  onScreen(name) {
    if (name === "results") return;
    if (this.battleActive) { if (this.state === "battle") this.state = "paused"; }
    else this.state = "menu";
  }

  openEditor() {
    this.state = "editor";
    this.ui.hideAll();
    this.input.touch.editing = true;
    this.input.touch.releaseAll();
    $("editor-bar").hidden = false;
    this.ui.refreshEditor();
    this.checkOrientation();
  }
  closeEditor() {
    this.input.touch.editing = false;
    $("editor-bar").hidden = true;
    this.settings.save();
    this.state = this.battleActive ? "paused" : "menu";
    this.ui.show("settings");
    $("rotate").hidden = true;
  }

  onPlayerDead() {
    this.sfx("defeat");
    this.waves.done = true;
    this.endT = 1.8; this.endWin = false;
    this.slowmo(0.8, 0.35, "finale");
  }
  onVictory() {
    if (this.endT > 0) return;
    this.player.action = null;
    this.player.setState("victory");
    this.waves.done = true;
    this.sfx("victory");
    this.endT = 2.6; this.endWin = true;
    this.slowmo(0.6, 0.4, "finale");
    this.camera.kick(0.04);
  }
  onTrackEnded() {
    if (!this.battleActive) { if (this.ui.screen === "music" || this.ui.screen === "director") this.ui.refreshPlayer(); return; }
    if (this.mode === "track" && this.player.alive && this.endT <= 0) { this.onVictory(); return; }
    if (this.state === "battle" && this.endT <= 0) { this.audio.play(0); this.clock.reset(0); }
  }

  finishBattle() {
    if (this.mode !== "practice") this.clearAutosave();
    const c = this.combat, R = c.ratings;
    const total = RATING_ORDER.reduce((a, k) => a + R[k], 0);
    const acc = total ? (R.perfect + R.good * 0.8 + (R.early + R.late) * 0.5 + R.miss * 0.2) / total : 0;
    const win = this.endWin;
    let grade = acc >= 0.85 && c.damageTaken < 35 ? "S" : acc >= 0.7 ? "A" : acc >= 0.5 ? "B" : "C";
    if (!win && (grade === "S" || grade === "A")) grade = "B";
    const tag = this.track ? Tempo.tag(this.track.tempo) : "";   // отдельный рекорд для другого темпа / правки долей
    const key = "best." + (this.track ? this.track.meta.key : "demo") + tag + "." + this.mode;
    const best = Store.get(key, 0);
    const record = c.score > best && this.mode !== "practice";
    if (record) Store.set(key, c.score);
    const rows = [
      ["Очки", c.score.toLocaleString("ru-RU")],
      ["Повержено", c.kills],
      ["Макс. комбо", c.maxCombo],
      ["Точность ритма", Math.round(acc * 100) + "%"],
      ["Perfect", R.perfect], ["Good", R.good], ["Early / Late", R.early + " / " + R.late], ["Miss", R.miss],
      ["Идеальные уклоны", c.perfectDodges],
      ["Получено урона", Math.round(c.damageTaken)],
      ["Время боя", fmtTime(c.time)],
      ["Рекорд", (record ? c.score : best).toLocaleString("ru-RU")],
    ];
    const sy = this.sync.summary();
    if (sy) {
      const m = Math.round(sy.med);
      rows.splice(4, 0, ["Средняя ошибка", Math.abs(m) < 5 ? "в доле" : Math.abs(m) + " мс " + (m < 0 ? "раньше" : "позже")]);
    }
    const hint = sy && !this.settings.v.autoSync && Math.abs(sy.med) > 25
      ? `Вы бьёте в среднем на ${Math.abs(Math.round(sy.med))} мс ${sy.med < 0 ? "раньше" : "позже"} доли. Включите «Автоподстройку задержки» или откройте «Калибровку синхронизации» в настройках.` : "";
    const sub = (this.track ? this.track.meta.name : "") + " · " + MODE_NAMES[this.mode] + (tag ? " · " + Tempo.label(this.track.tempo) : "") + (record ? " · новый рекорд!" : "");
    this.state = "results";
    this.battleActive = false;
    this.input.active = false; this.input.clear();
    $("btn-pause").hidden = true;
    if (!win) this.audio.pause();
    this.ui.showResults(win, { grade, sub, rows, hint });
  }

  /* ---------- эффекты времени ----------
     Все замедления и стоп-кадры идут только через slowmo()/hitstop() — регулятор следит, чтобы
     в плотном бою они не накладывались и не съедали темп (раньше: 34% времени в замедлении). */
  get tfxMode() { return SLOWMO_MODES[this.settings.v.slowmoMode] || SLOWMO_MODES.rare; }
  resetTimeFx() {
    this.timeScale = 1; this.tsVel = 0; this.afterStop = 1;
    this.slowT = 0; this.slowScale = 1; this.slowPr = 0; this.hitstopT = 0;
    this.tfxClock = 0; this.slowEndAt = -99; this.lastStopAt = -99; this.stopChain = 0; this.lastStopLen = 0;
    this.slowBins = [0, 0, 0, 0, 0, 0, 0, 0]; this.slowBinT = 0;
  }
  /** Доля замедленного времени за последние 8 с. */
  slowShare() { let a = 0; for (const b of this.slowBins) a += b; return a / 8; }
  /**
   * Запрос замедления. priority: "flair" (зрелищный удар) < "dodge" < "takedown" < "finale".
   * Не продлевает уже идущее замедление; после замедления — кулдаун; общий бюджет на 8 с.
   * Возвращает true, если замедление действительно началось.
   */
  slowmo(dur, scale, priority = "flair") {
    const pr = SLOW_PRIORITY[priority] || 1, mode = this.tfxMode, ck = this.clock;
    // музыкальный контекст: на дропе/кульминации замедление чуть глубже (зрелищнее), в остальное время не меняется
    if (priority !== "takedown" && priority !== "finale" && (ck.kind === "drop" || ck.kind === "climax")) scale *= 0.9;
    // выход из замедления «дышит» с музыкой: длительность подтягивается так, чтобы плавный выход начался на ближайшей доле
    // (только вперёд на ≤ 0.3 с и назад на ≤ 0.06 с; сценарий добивания не укорачивается)
    if (priority !== "finale" && this.audio.playing && ck.map) {
      const now = this.songNow, b = ck.nextBeatAfter(now + dur - 0.06) - now;
      if (b <= dur + 0.3 && b >= dur - 0.06 && (priority !== "takedown" || b >= dur)) dur = b;
    }
    if (priority !== "finale") {
      if (this.slowT > 0) {
        if (pr <= this.slowPr) return false;
        this.slowScale = Math.min(this.slowScale, scale); this.slowT = Math.min(dur, Math.max(this.slowT, dur * 0.6)); this.slowPr = pr;
        return true;
      }
      // идеальный уклон — защитная награда: кулдаун не действует, только общий бюджет
      let gap = priority === "flair" ? mode.flairGap : priority === "dodge" ? 0 : mode.gap;
      if (priority === "flair" && (ck.kind === "drop" || ck.kind === "climax")) gap *= 0.85;
      if (this.tfxClock - this.slowEndAt < gap) return false;
      // бюджет считает и мягкий выход (~0.45 с с замедленным масштабом), не только удержание
      if (this.slowShare() + (dur + 0.45) / 8 > mode.budget) return false;
    }
    if (this.slowT <= 0) this.sfx("slowmo");
    this.slowScale = this.slowT > 0 ? Math.min(this.slowScale, scale) : scale;
    this.slowT = Math.max(this.slowT, dur); this.slowPr = Math.max(this.slowPr, pr);
    return true;
  }
  /** Стоп-кадр удара. В серии ударов (< 0.9 с между ними, т.е. удары подряд в такт) каждый следующий короче:
      ×1 → ×0.6 → ×0.36 … Одиночный удар остаётся весомым. */
  hitstop(t) {
    const since = this.tfxClock - this.lastStopAt;
    this.stopChain = since < 0.9 ? Math.min(this.stopChain + 1, 6) : 0;
    const d = t * this.tfxMode.stopScale * Math.pow(0.6, this.stopChain);
    if (d < 0.012) return;
    this.lastStopAt = this.tfxClock; this.lastStopLen = d;
    this.hitstopT = Math.max(this.hitstopT, d);
  }
  /**
   * Масштаб времени кадра. Масштаб — состояние с непрерывной скоростью: критически демпфированная пружина
   * к цели (замедление / 1). Вход быстрый (≈ 0.25 с), выход длинный и мягкий (≈ 0.65 с, ease-out): значение и его
   * скорость никогда не прыгают, даже если замедление прервали, наложили или оно закончилось на полпути.
   * Единственный разрыв — сам стоп-кадр; после него скорость плавно нарастает с 15% за ~0.12 с.
   */
  updateTimeScale(dtReal) {
    this.tfxClock += dtReal;
    if (this.slowT > 0) { this.slowT -= dtReal; if (this.slowT <= 0) { this.slowEndAt = this.tfxClock; this.slowPr = 0; } }
    const target = this.slowT > 0 ? this.slowScale : 1;
    const w = target < this.timeScale - 0.002 ? 17 : 7;       // частота пружины: вход / выход
    // подшаги: устойчиво и при длинных кадрах
    const n = Math.max(1, Math.ceil(dtReal / 0.008)), h = dtReal / n;
    for (let i = 0; i < n; i++) {
      const acc = w * w * (target - this.timeScale) - 2 * w * this.tsVel;
      this.tsVel += acc * h; this.timeScale += this.tsVel * h;
    }
    this.timeScale = clamp(this.timeScale, Math.min(target, this.slowScale || 1) * 0.9, 1);
    if (Math.abs(target - this.timeScale) < 0.002 && Math.abs(this.tsVel) < 0.01) { this.timeScale = target; this.tsVel = 0; }
    // учёт доли замедления по секундным корзинам
    this.slowBinT += dtReal;
    if (this.slowBinT >= 1) { this.slowBinT -= 1; this.slowBins.shift(); this.slowBins.push(0); }
    if (this.timeScale < 0.9) this.slowBins[7] += dtReal;
    if (this.hitstopT > 0) { this.hitstopT -= dtReal; this.afterStop = this.lastStopLen >= 0.03 ? 0 : 1; return 0; }
    if (this.afterStop < 0.12) { this.afterStop += dtReal; return this.timeScale * lerp(0.15, 1, easeOut(this.afterStop / 0.12)); }
    return this.timeScale;
  }
  /** Агрессивность врагов от музыки: <1 — чаще атакуют. */
  aggression() {
    const lv = this.clock.level, I = this.clock.intensitySmooth;
    return lv === "intense" ? 0.7 : lv === "calm" ? 1.3 : lerp(1.2, 0.8, I);
  }
  addAfterimage(ch) {
    if (this._aiT > 0 || this.afterimages.length > 14) return;
    this._aiT = 0.022;
    this.afterimages.push({
      kind: ch.kind, skin: ch.skin, variant: ch.variant || 0, x: ch.x, y: ch.y, facing: ch.facing, scale: ch.scale,
      anim: { pose: Object.assign({}, ch.anim.pose), cloak: ch.anim.cloak, squashT: 0, scarf: null },
      weapon: "none", life: 0.22, max: 0.22, eyeBoost: 0, flash: 0, alpha: 1,
    });
  }

  /* ---------- цикл ---------- */
  loop(now) {
    requestAnimationFrame(this.loop);
    // ограничение частоты кадров (настройка): на экранах 90/120 Гц снижает нагрузку на видеочип
    // накопитель времени: на 120 Гц «90» пропускает каждый 4-й кадр, «60» — каждый второй
    const cap = +this.settings.v.fpsCap || 0;
    const rafDt = now - (this._rafPrev || now); this._rafPrev = now;
    if (cap) {
      this._capAcc = Math.min((this._capAcc || 0) + rafDt, 2000 / cap);
      if (this._capAcc < 1000 / cap - 1) return;
      this._capAcc -= 1000 / cap;
    }
    const dtReal = clamp((now - this.last) / 1000, 0.001, 0.05);
    this.last = now;
    this._ft = lerp(this._ft, dtReal * 1000, 0.05);
    this.fps = 1000 / this._ft;
    try {
      this.songNow = this.audio.songTime();
      const live = this.analyzer.updateLive(this.audio, dtReal, this.settings.v.sensitivity);
      this.clock.update(this.songNow, dtReal, live, this.audio.playing);
      this.input.poll();
      if (this.state === "battle") { this.simulate(dtReal); this._autoQuality(dtReal); }
      else this.idle(dtReal);
      if (this.ui.screen === "sync") this.ui.tickSync();
      if (this.ui.screen === "director") this.ui.tickDirector();
      if (this.ui.screen === "music" || this.ui.screen === "director") { this._mt = (this._mt || 0) + dtReal; if (this._mt > 0.25) { this._mt = 0; this.ui.refreshPlayer(); } }
      this.render(dtReal);
    } catch (e) {
      console.error(e);
      if (!this._errShown) { this._errShown = true; this.ui.toast("Ошибка: " + e.message, 5000); }
    }
  }

  _autoQuality(dt) {
    if (this.settings.v.quality !== "auto" || this.autoLow) return;
    if (this._ft > 24) this._slowFrames += dt; else this._slowFrames = Math.max(0, this._slowFrames - dt * 0.5);
    if (this._slowFrames > 4) { this.autoLow = true; this.applyQuality(); this.ui.toast("Включены упрощённые эффекты для плавности"); }
  }

  /** Меню: персонаж стоит на арене, камера плавно гуляет. */
  idle(dt) {
    const p = this.player;
    if (!this.battleActive) {
      if (p.state !== "idle") p.setState("idle");
      p.x = WORLD.w / 2; p.y = 0; p.vx = 0; p.vy = 0; p.groundY = 0;
      p._pose(dt, this);
      const t = performance.now() / 1000;
      this.camera.update(dt, WORLD.w / 2 - 120 + Math.sin(t * 0.07) * 60, -108, WORLD.w, this.viewW(), 0);
      if (this.clock.events.some(e => e.type === "strongBeat")) this.fx.shockwave(p.x, 0, p.skin.accent, 70);
    }
    this.fx.update(dt * 0.6);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);
    if (this.state === "results" && this.player.state === "victory") p._pose(dt, this);
  }

  viewW() { return this.cssW / this.viewScale(); }
  viewScale() { return Math.min(this.cssH / VIEW_H, this.cssW / 560); }

  simulate(dtReal) {
    const p = this.player;
    // ввод → действия (время нажатия переводится в музыкальное)
    for (const ev of this.input.consume()) {
      if (ev.type === "attack") this.combat.onAttackPress(this.audio.songTimeAt(ev.stamp));
      else if (ev.type === "jump") p.pressJump();
      else if (ev.type === "dodge") p.tryDodge(this);
    }
    // стоп-кадр и плавное замедление
    const scale = this.updateTimeScale(dtReal);
    const dt = dtReal * scale;
    this.strongBeatNow = this.clock.events.some(e => e.type === "strongBeat");
    this.acc += dt;
    let steps = 0;
    this.deferPose = true;          // позы — один раз за кадр, после шагов физики
    while (this.acc >= STEP && steps < 8) {
      p.update(STEP, this);
      for (const e of this.enemies) e.update(STEP, this);
      this.combat.update(STEP);
      this.strongBeatNow = false;
      this.acc -= STEP; steps++;
    }
    if (steps >= 8) this.acc = 0;
    this.deferPose = false;
    p.flushPose(this);
    for (const e of this.enemies) e.flushPose(this);
    this.combat.updateTakedown(dtReal);
    compactInPlace(this.enemies, e => !e.dead);
    if (this.mode === "track" && (this._saveT += dtReal) >= 10) { this._saveT = 0; this.autosave(); }
    this.letterbox = damp(this.letterbox, this.letterboxTarget, 8, dtReal);
    this.flashT = Math.max(0, this.flashT - dtReal * 3);
    this.takedownTitleT = Math.max(0, this.takedownTitleT - dtReal);
    this.sectionTitleT = Math.max(0, this.sectionTitleT - dtReal);
    this.waves.update(dt);
    this.fx.update(dt);
    this._aiT -= dt;
    if (p.state === "dodge") this.addAfterimage(p);
    for (const a of this.afterimages) a.life -= dt;
    compactInPlace(this.afterimages, a => a.life > 0);
    this.hurtFlash = Math.max(0, this.hurtFlash - dtReal * 2.5);

    // музыка в мире: толчок камеры на сильных долях, кольцо под ногами, смена частей трека
    for (const ev of this.clock.events) {
      if (ev.type === "section" && SECTION_NAMES[ev.kind]) {
        this.sectionTitle = SECTION_NAMES[ev.kind]; this.sectionTitleT = 2;
        if (ev.kind === "drop" || ev.kind === "climax") { this.camera.kick(0.04); this.camera.shake(0.3); this.fx.shockwave(p.x, p.groundY, p.skin.accent, 220); }
      }
      if (ev.type === "strongBeat") {
        this.camera.kick(0.006 * this.clock.intensitySmooth);
        if (!this.combat.td) this.fx.shockwave(p.x, p.groundY, p.skin.accent, 60 + 40 * this.clock.intensitySmooth);   // без лишних колец во время добивания
      } else if (ev.type === "onset" && ev.band === "high" && ev.strength > 0.5 && this.effQuality === "high") {
        this.fx.spawn("dot", p.x + rand(-200, 200), rand(-220, -40), { vy: -20, life: 0.6, size: 1.6, color: this.arena.theme.pal.neonB, add: true });
      }
    }
    // камера
    const tx = p.x + p.facing * 30 + p.vx * 0.15;
    const ty = -108 + Math.min(0, p.y + 110) * 0.6;
    this.camera.update(dtReal, tx, ty, WORLD.w, this.viewW(), this.settings.v.shake);
    // конец боя
    if (this.endT > 0) { this.endT -= dtReal; if (this.endT <= 0) this.finishBattle(); }
  }

  /** Музыкальное состояние кадра для арены — один переиспользуемый объект без лишних аллокаций. */
  musicState(dt) {
    const c = this.clock, m = this._m;
    m.pulse = c.pulse; m.strong = c.strongPulse; m.low = c.bands.low; m.mid = c.bands.mid; m.high = c.bands.high;
    m.intensity = c.intensitySmooth; m.beat = Math.max(0, c.idx); m.beatF = m.beat + c.phase; m.phase = c.phase;
    m.time = performance.now() / 1000; m.level = c.level;
    m.sectionEvent = false; m.sectionKind = undefined; m.strongEvent = false;
    m.onsets.length = 0;
    for (const e of c.events) {
      if (e.type === "section") { m.sectionEvent = true; m.sectionKind = e.kind; }
      else if (e.type === "strongBeat") m.strongEvent = true;
      else if (e.type === "onset") m.onsets.push(e);
    }
    m.kind = c.kind; m.trend = c.trend; m.timeToNext = c.timeToNext; m.bassy = c.bassy; m.bright = c.bright;
    m.dropSoon = (c.nextKind === "drop" || c.nextKind === "climax") && c.timeToNext < 4 && c.timeToNext > 0;
    m.dropIn = c.dropIn; m.buildProg = c.buildProg; m.sectionProg = c.sectionProg; m.sectionT = c.sectionT;
    m.halfPulse = c.halfPulse;
    m.dirOff = !!(c.map && c.map.directorOff);   // Режиссёр выключен вручную — без эффектов по частям
    return m;
  }

  render(dt) {
    const ctx = this.ctx, w = this.cssW, h = this.cssH;
    if (this.gpuLost || (ctx.isContextLost && ctx.isContextLost())) return;   // во время сброса рисовать некуда
    this._lostCheckT += dt;
    if (this._lostCheckT > 0.5) {
      this._lostCheckT = 0;
      if (this.arena.checkLost()) this.gpuResets++;
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    const cam = this.camera;
    const zs = this.viewScale() * cam.zoom;
    const floorY = h / 2 + (0 - cam.y) * zs + cam.oy;
    const v = this._v || (this._v = {});
    v.w = w; v.h = h; v.floorY = floorY; v.camX = cam.x; v.scale = zs;
    v.playerX = (this.player.x - cam.x) * zs + w / 2 + cam.ox;
    v.restFloorY = h / 2 + 108 * this.viewScale();     // пол в покое — для стабильных тайлов фона
    const m = this.musicState(dt);
    const R = { dpr: this.tileDpr, dt, amount: this.effQuality === "low" ? 0.45 : 1, flashes: this.settings.v.flashes, amb: this.arena.amb };
    this.arena.drawBack(ctx, v, m, R);

    // ---- мир ----
    ctx.save();
    ctx.translate(w / 2 + cam.ox, h / 2 + cam.oy);
    ctx.rotate(cam.rot);
    ctx.scale(zs, zs);
    ctx.translate(-cam.x, -cam.y);
    for (const pl of WORLD.platforms) this.arena.drawPlatform(ctx, pl.x, pl.y, pl.w, m);
    this._drawWalls(ctx, m);
    const hq = this.effQuality === "high";
    for (const e of this.enemies) this._drawTelegraph(ctx, e);
    for (const e of this.enemies) this.combat.drawEnemy(ctx, e);
    for (const a of this.afterimages) {
      ctx.save(); ctx.globalAlpha = (a.life / a.max) * 0.45;
      CharacterRenderer.draw(ctx, a, { tint: a.skin ? a.skin.accent : "#ffffff" });
      ctx.restore();
    }
    const showPlayer = this.battleActive || this.state === "results" || this.state === "menu" || !this.ui.screen || this.ui.screen === "menu" || this.ui.screen === "skins";
    if (showPlayer) {
      const p = this.player;
      p.alpha = p.iframes > 0 && p.state === "hurt" ? (Math.floor(performance.now() / 60) % 2 ? 0.45 : 1) : 1;
      CharacterRenderer.draw(ctx, p);
    }
    this.combat.drawProjectiles(ctx, hq);
    this._drawEnemyBars(ctx);
    this.fx.draw(ctx, false);
    ctx.globalCompositeOperation = "lighter";
    this.fx.draw(ctx, true);
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();

    this.arena.drawFront(ctx, v, m, R);
    if (this.flashT > 0) { ctx.fillStyle = rgba("#ffffff", this.flashT * (this.settings.v.flashes ? 0.55 : 0.2)); ctx.fillRect(0, 0, w, h); }
    if (this.battleActive || this.state === "results") this.hud.draw(ctx, w, h, dt);
    if (this.input.showTouch && (this.state === "battle" || this.state === "editor")) this.input.touch.draw(ctx, this.clock, this.player.skin.accent);
  }

  _drawWalls(ctx, m) {
    const pal = this.arena.theme.pal;
    for (const x of [0, WORLD.w - WORLD.wall]) {
      ctx.fillStyle = "#040407";
      ctx.fillRect(x, -600, WORLD.wall, 620);
      ctx.fillStyle = rgba(pal.edge, 0.35 + 0.4 * m.pulse);
      ctx.fillRect(x === 0 ? WORLD.wall - 1 : x, -600, 1.2, 600);
    }
  }

  _drawTelegraph(ctx, e) {
    if (e.state !== "windup") return;
    const k = clamp(e.windT / e.windDur, 0, 1);
    const col = e.look.accent;
    if (e.kind === "gunner") {
      const hp = CharacterRenderer.handWorld(e, 14);
      ctx.save();
      ctx.setLineDash([6, 5]); ctx.lineDashOffset = -performance.now() / 20;
      ctx.strokeStyle = rgba(k > 0.78 ? "#ff2d4a" : col, 0.2 + 0.6 * k);
      ctx.lineWidth = k > 0.78 ? 1.6 : 1;
      ctx.beginPath(); ctx.moveTo(hp.x, hp.y); ctx.lineTo(e.aim.x, e.aim.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(e.aim.x, e.aim.y, 10 - k * 6, 0, TAU); ctx.stroke();
      ctx.restore();
    } else {
      // заполняющаяся дуга под ногами — сколько осталось до удара
      const reach = e.kind === "brute" ? 46 : e.kind === "swift" ? 110 : 30;
      ctx.fillStyle = rgba(col, 0.08 + 0.18 * k);
      const x0 = e.facing > 0 ? e.x : e.x - reach * k;
      ctx.fillRect(x0, e.y - 2, reach * k, 2);
      ctx.strokeStyle = rgba(col, 0.5 + 0.5 * k); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(e.x, e.y - e.h * e.scale - 10, 4, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
    }
  }

  _drawEnemyBars(ctx) {
    const tgt = this.combat.lastTarget;
    for (const e of this.enemies) {
      if (!e.alive || e.state === "spawn") continue;
      if (e.executed || (e.hp >= e.maxHp && e !== tgt)) continue;
      const bw = 24 * e.scale, x = e.x - bw / 2, y = e.y - e.h * e.scale - 18 * e.scale;
      ctx.fillStyle = "rgba(232,226,214,.18)"; ctx.fillRect(x, y, bw, 2);
      ctx.fillStyle = e.look.accent; ctx.fillRect(x, y, bw * clamp(e.hp / e.maxHp, 0, 1), 2);
      if (e === tgt) {
        ctx.fillStyle = "#e8e2d6";
        ctx.beginPath(); ctx.moveTo(e.x - 3, y - 6); ctx.lineTo(e.x + 3, y - 6); ctx.lineTo(e.x, y - 2.5); ctx.closePath(); ctx.fill();
      }
    }
  }
}

/* ---------- запуск ---------- */
window.addEventListener("load", () => {
  try { window.__game = new Game(); }
  catch (e) {
    console.error(e);
    document.body.insertAdjacentHTML("beforeend", '<p style="position:fixed;inset:auto 16px 16px;color:#ff2d4a;font-family:monospace">Не удалось запустить игру: ' + String(e.message).replace(/</g, "&lt;") + "</p>");
  }
});
window.DIFFS_REF = DIFFS; window.ATTACKS_REF = ATTACKS;
window.SKINS_REF = SKINS; window.AnimStateRef = AnimState; window.CharacterRendererRef = CharacterRenderer;
