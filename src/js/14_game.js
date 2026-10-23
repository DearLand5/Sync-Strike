/* =====================================================================
   Game — главный цикл и связывание систем.
   ===================================================================== */
const DIFFS = {
  easy:   { hp: 0.85, dmg: 0.6,  cd: 1.25, wind: 1.15, extra: -1, playerDmg: 1.15 },
  normal: { hp: 1,    dmg: 1,    cd: 1,    wind: 1,    extra: 0,  playerDmg: 1 },
  hard:   { hp: 1.2,  dmg: 1.35, cd: 0.85, wind: 0.85, extra: 1,  playerDmg: 0.95 },
};
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
    this.clock = new RhythmClock(this.settings);
    this.input = new InputManager(this.canvas, this.settings);
    this.input.onPause = () => (this.state === "battle" ? this.pause() : this.state === "paused" && this.ui.screen === "pause" ? this.resume() : null);
    this.fx = new ParticleSystem(700);
    this.camera = new Camera();
    this.arena = new ArenaRenderer();
    this.player = new Player(this.settings.v.skin);
    this.enemies = [];
    this.combat = new CombatSystem(this);
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
    this.hurtFlash = 0; this.endT = 0; this.endWin = false;
    this.fps = 60; this._ft = 16; this._slowFrames = 0; this.autoLow = false;
    this.effQuality = "high";
    this.loading = false;
    this.strongBeatNow = false;
    this.ui = new UIManager(this);

    this.audio.on("ended", () => this.onTrackEnded());
    const onResize = () => { this.resize(); this.checkOrientation(); };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", () => setTimeout(onResize, 250));
    if (window.visualViewport) window.visualViewport.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", () => this.onVisibility());
    window.addEventListener("pagehide", () => { if (this.state === "battle") this.pause(); });
    this.settings.on("change", k => {
      if (k === "difficulty") this.diff = DIFFS[this.settings.v.difficulty];
      if (k === "latencyMs") this.clock.reset(this.audio.songTime());
    });

    this.applyQuality();
    this.ui.show("menu");
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
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.cssW = Math.max(1, r.width); this.cssH = Math.max(1, r.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.effQuality === "low" ? 1.25 : 2);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.tileDpr = this.effQuality === "low" ? 1 : Math.min(this.dpr, 1.5);
    this.input.touch.resize(this.cssW, this.cssH);
  }
  isTouchDevice() { return this.input.usingTouch || (window.matchMedia && matchMedia("(pointer: coarse)").matches); }
  checkOrientation() {
    const portrait = this.cssH > this.cssW * 1.05;
    const need = portrait && this.isTouchDevice() && (this.state === "battle" || this.state === "paused" || this.state === "editor");
    $("rotate").hidden = !need;
    if (need && this.state === "battle") this.pause();
  }
  requestFullscreen() {
    if (!this.settings.v.fullscreen) return;
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
    if (document.hidden) {
      if (this.state === "battle") this.pause();
      else if (this.audio.playing) { this.audio.pause(); this._menuPausedByHide = true; }
      this.audio.suspend();
    } else this.audio.resume();
  }

  /* ---------- треки ---------- */
  async loadFile(file) {
    if (this.loading) return;
    this.audio.unlock();
    if (file.size > 80 * 1024 * 1024) { this.ui.toast("Файл больше 80 МБ: выберите трек поменьше"); return; }
    this.loading = true;
    const card = $("analysis-card");
    const prog = (k, label) => { $("analysis-bar").style.width = Math.round(k * 100) + "%"; $("analysis-pct").textContent = Math.round(k * 100) + "%"; if (label) $("analysis-label").textContent = label; };
    card.hidden = false; prog(0, "Чтение файла");
    try {
      const ab = file.arrayBuffer ? await file.arrayBuffer() : await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsArrayBuffer(file); });
      prog(0.02, "Декодирование");
      const buffer = await this.audio.decode(ab);
      if (!buffer || buffer.duration < 5) throw new Error("short");
      const map = await this.analyzer.analyze(buffer, (k, l) => prog(0.05 + k * 0.95, l));
      const name = file.name.replace(/\.[^.]+$/, "");
      this.setTrack(buffer, map, { name, key: file.name + "|" + file.size, isDemo: false });
      this.ui.toast(`Готово: ${map.bpm.toFixed(1)} BPM, режим «${MODE_LABEL[map.mode]}», анализ за ${(map.ms / 1000).toFixed(1)} с`);
    } catch (e) {
      console.warn(e);
      this.ui.toast(e && e.message === "short" ? "Трек слишком короткий (меньше 5 секунд)" : "Не удалось открыть файл. Проверьте, что это MP3 и он не повреждён.", 4000);
    } finally {
      card.hidden = true;
      this.loading = false;
      if (this.ui.screen === "music") this.ui.refreshMusic();
    }
  }

  async loadDemo() {
    if (this.loading) return;
    this.audio.unlock();
    this.audio.ensure();
    if (this._demo) { this.setTrack(this._demo.buffer, this._demo.map, this._demo.meta); if (this.ui.screen === "music") this.ui.refreshMusic(); return; }
    this.loading = true;
    const card = $("analysis-card");
    card.hidden = false;
    $("analysis-label").textContent = "Синтез демо-трека";
    try {
      await yieldToUI();
      const buffer = DemoTrack.generate(this.audio.ctx);
      const map = await this.analyzer.analyze(buffer, (k, l) => { $("analysis-bar").style.width = Math.round(k * 100) + "%"; $("analysis-pct").textContent = Math.round(k * 100) + "%"; $("analysis-label").textContent = l; });
      this._demo = { buffer, map, meta: { name: DemoTrack.name, key: "demo", isDemo: true } };
      this.setTrack(buffer, map, this._demo.meta);
    } finally {
      card.hidden = true;
      this.loading = false;
      if (this.ui.screen === "music") this.ui.refreshMusic();
    }
  }

  setTrack(buffer, map, meta) {
    this.audio.setTrack(buffer, meta);
    this.clock.setMap(map);
    const saved = Store.get("theme." + meta.key, "auto");
    this.track = { buffer, map, meta, themeId: saved, changed: true };
    this.applyTrackTheme();
    this.ui.refreshMenu();
  }
  resolveTheme() {
    const t = this.track;
    if (!t) return "city";
    if (t.themeId && t.themeId !== "auto") return t.themeId;
    return rankThemes(t.map.features)[0].theme.id;
  }
  applyTrackTheme() { this.arena.setTheme(this.resolveTheme()); }
  setTrackTheme(id) {
    if (!this.track) return;
    this.track.themeId = id;
    Store.set("theme." + this.track.meta.key, id);
    this.applyTrackTheme();
  }

  /* ---------- бой ---------- */
  async startBattle(mode) {
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
    this.player.reset(WORLD.w / 2);
    this.player.dodgeCount = 0;
    this.enemies = [];
    this.combat.reset();
    this.director.reset();
    this.waves.reset(mode);
    this.fx.clear();
    this.afterimages = [];
    this.camera.x = this.player.x; this.camera.trauma = 0;
    this.hitstopT = 0; this.slowT = 0; this.hurtFlash = 0; this.endT = 0;
    this.battleActive = true;
    this.state = "battle";
    this.input.active = true; this.input.clear();
    this.ui.hideAll();
    $("btn-pause").hidden = false;
    this.track.changed = false;
    this.applyTrackTheme();
    this.audio.play(0);
    this.clock.reset(0);
    this.checkOrientation();
  }

  pause() {
    if (this.state !== "battle") return;
    this.state = "paused";
    this.audio.pause();
    this.input.active = false; this.input.clear();
    $("btn-pause").hidden = true;
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
    this.slowmo(0.8, 0.35);
  }
  onVictory() {
    if (this.endT > 0) return;
    this.player.action = null;
    this.player.setState("victory");
    this.waves.done = true;
    this.sfx("victory");
    this.endT = 2.6; this.endWin = true;
    this.slowmo(0.6, 0.4);
    this.camera.kick(0.04);
  }
  onTrackEnded() {
    if (!this.battleActive) { if (this.ui.screen === "music") this.ui.refreshPlayer(); return; }
    if (this.mode === "track" && this.player.alive && this.endT <= 0) { this.onVictory(); return; }
    if (this.state === "battle" && this.endT <= 0) { this.audio.play(0); this.clock.reset(0); }
  }

  finishBattle() {
    const c = this.combat, R = c.ratings;
    const total = RATING_ORDER.reduce((a, k) => a + R[k], 0);
    const acc = total ? (R.perfect + R.good * 0.8 + (R.early + R.late) * 0.5 + R.miss * 0.2) / total : 0;
    const win = this.endWin;
    let grade = acc >= 0.85 && c.damageTaken < 35 ? "S" : acc >= 0.7 ? "A" : acc >= 0.5 ? "B" : "C";
    if (!win && (grade === "S" || grade === "A")) grade = "B";
    const key = "best." + (this.track ? this.track.meta.key : "demo") + "." + this.mode;
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
    const sub = (this.track ? this.track.meta.name : "") + " · " + MODE_NAMES[this.mode] + (record ? " · новый рекорд!" : "");
    this.state = "results";
    this.battleActive = false;
    this.input.active = false; this.input.clear();
    $("btn-pause").hidden = true;
    if (!win) this.audio.pause();
    this.ui.showResults(win, { grade, sub, rows });
  }

  /* ---------- эффекты времени ---------- */
  hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); }
  slowmo(dur, scale) { this.slowT = dur; this.slowDur = dur; this.slowScale = scale; this.sfx("slowmo"); }
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
      if (this.ui.screen === "music") { this._mt = (this._mt || 0) + dtReal; if (this._mt > 0.25) { this._mt = 0; this.ui.refreshPlayer(); } }
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
    // стоп-кадр и замедление
    let scale = 1;
    if (this.hitstopT > 0) { this.hitstopT -= dtReal; scale = 0; }
    else if (this.slowT > 0) {
      this.slowT -= dtReal;
      const k = this.slowT / this.slowDur;
      scale = k < 0.25 ? lerp(1, this.slowScale, k / 0.25) : this.slowScale;
    }
    const dt = dtReal * scale;
    this.strongBeatNow = this.clock.events.some(e => e.type === "strongBeat");
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 8) {
      p.update(STEP, this);
      for (const e of this.enemies) e.update(STEP, this);
      this.combat.update(STEP);
      this.strongBeatNow = false;
      this.acc -= STEP; steps++;
    }
    if (steps >= 8) this.acc = 0;
    this.enemies = this.enemies.filter(e => !e.dead);
    this.waves.update(dt);
    this.fx.update(dt);
    this._aiT -= dt;
    if (p.state === "dodge") this.addAfterimage(p);
    for (const a of this.afterimages) a.life -= dt;
    this.afterimages = this.afterimages.filter(a => a.life > 0);
    this.hurtFlash = Math.max(0, this.hurtFlash - dtReal * 2.5);

    // музыка в мире: толчок камеры на сильных долях, кольцо под ногами
    for (const ev of this.clock.events) {
      if (ev.type === "strongBeat") {
        this.camera.kick(0.006 * this.clock.intensitySmooth);
        this.fx.shockwave(p.x, p.groundY, p.skin.accent, 60 + 40 * this.clock.intensitySmooth);
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

  musicState(dt) {
    const c = this.clock;
    return {
      pulse: c.pulse, strong: c.strongPulse, low: c.bands.low, mid: c.bands.mid, high: c.bands.high,
      intensity: c.intensitySmooth, beat: Math.max(0, c.idx), beatF: Math.max(0, c.idx) + c.phase, phase: c.phase,
      time: performance.now() / 1000, level: c.level,
      sectionEvent: c.events.some(e => e.type === "section"),
      strongEvent: c.events.some(e => e.type === "strongBeat"),
    };
  }

  render(dt) {
    const ctx = this.ctx, w = this.cssW, h = this.cssH;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    const cam = this.camera;
    const zs = this.viewScale() * cam.zoom;
    const floorY = h / 2 + (0 - cam.y) * zs + cam.oy;
    const v = { w, h, floorY, camX: cam.x, scale: zs };
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
    for (const e of this.enemies) CharacterRenderer.draw(ctx, e);
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
      if (e.hp >= e.maxHp && e !== tgt) continue;
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
