/* =====================================================================
   HUD — интерфейс боя на канвасе.
   UIManager — DOM-экраны меню, настройки, калибровка, итоги.
   ===================================================================== */
const MODE_COLOR = { precise: "#3ef0ff", adaptive: "#ffb13b", fallback: "#ff2d4a" };

class HUD {
  constructor(game) { this.game = game; this.ratingShow = 0; }

  draw(ctx, w, h, dt) {
    const g = this.game, p = g.player, cb = g.combat, clock = g.clock;
    const safe = g.input.touch.safe;
    const L = 14 + safe.l, T = 12 + safe.t, R = w - 14 - safe.r;
    const accent = p.skin.accent;
    ctx.save();
    ctx.textBaseline = "alphabetic";

    // --- здоровье игрока ---
    const bw = Math.min(200, w * 0.24);
    ctx.font = "500 11px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(232,226,214,.7)"; ctx.textAlign = "left";
    ctx.fillText("ИГРОК", L, T + 9);
    ctx.fillText(Math.ceil(p.hp) + "", L + bw - 18, T + 9);
    ctx.fillStyle = "rgba(232,226,214,.15)"; ctx.fillRect(L, T + 15, bw, 4);
    const hpK = p.hp / p.maxHp;
    ctx.fillStyle = hpK < 0.3 ? "#ff2d4a" : accent;
    ctx.fillRect(L, T + 15, bw * hpK, 4);
    ctx.fillStyle = "rgba(8,9,13,.9)";
    for (let i = 1; i < 10; i++) ctx.fillRect(L + bw * i / 10 - 0.5, T + 15, 1, 4);

    // --- волна / прогресс / счёт ---
    ctx.font = "300 13px 'Oswald', 'Arial Narrow', sans-serif";
    ctx.fillStyle = "rgba(232,226,214,.8)";
    let line2 = "";
    if (g.mode === "waves") line2 = "ВОЛНА " + Math.max(1, g.waves.wave) + "/" + WAVES.length;
    else if (g.mode === "track") line2 = "ДО ФИНАЛА " + fmtTime(Math.max(0, g.audio.duration - g.songNow));
    else line2 = "ПРАКТИКА";
    ctx.fillText(line2 + "   ·   ПОВЕРЖЕНО " + cb.kills, L, T + 38);
    ctx.font = "500 12px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(232,226,214,.55)";
    ctx.fillText(String(cb.score).padStart(6, "0"), L, T + 56);

    // --- трек и синхронизация (центр) ---
    const cx = w / 2;
    const tw = Math.min(260, w * 0.3);
    const name = g.track ? g.track.meta.name : "";
    ctx.textAlign = "center";
    ctx.font = "500 11px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(232,226,214,.75)";
    ctx.fillText(this._fit(ctx, name, tw), cx, T + 9);
    ctx.fillStyle = "rgba(232,226,214,.15)"; ctx.fillRect(cx - tw / 2, T + 15, tw, 2);
    const prog = g.audio.duration ? clamp(g.songNow / g.audio.duration, 0, 1) : 0;
    ctx.fillStyle = accent; ctx.fillRect(cx - tw / 2, T + 15, tw * prog, 2);
    const mcol = MODE_COLOR[clock.mode] || "#e8e2d6";
    ctx.fillStyle = mcol;
    ctx.beginPath(); ctx.arc(cx - tw / 2 + 4, T + 28, 3 + clock.pulse * 1.5, 0, TAU); ctx.fill();
    ctx.textAlign = "left"; ctx.fillStyle = "rgba(232,226,214,.6)";
    ctx.fillText(Math.round(clock.map ? clock.map.bpm : clock.bpm) + " BPM · " + (MODE_LABEL[clock.mode] || "") + " · " + Math.round(clock.confidence * 100) + "%", cx - tw / 2 + 12, T + 32);
    ctx.textAlign = "right";
    ctx.fillText(fmtTime(g.songNow), cx + tw / 2, T + 32);

    // --- подсказка практики ---
    if (g.mode === "practice" && g.waves.practiceText) {
      ctx.textAlign = "center";
      ctx.font = "400 15px 'IBM Plex Sans', sans-serif";
      const txt = g.waves.practiceText, tw2 = ctx.measureText(txt).width + 28;
      ctx.fillStyle = "rgba(8,9,13,.7)"; ctx.fillRect(cx - tw2 / 2, T + 44, tw2, 28);
      ctx.fillStyle = accent; ctx.fillRect(cx - tw2 / 2, T + 44, 3, 28);
      ctx.fillStyle = "#e8e2d6"; ctx.fillText(txt, cx, T + 63);
    }

    // --- комбо (справа, слева от кнопки паузы) ---
    const rx = R - 54;
    if (cb.combo > 1) {
      ctx.textAlign = "right";
      const pop = Math.max(0, cb.comboT - 2.7) * 3;
      ctx.font = `700 ${Math.round(40 + pop * 10)}px 'Oswald', 'Arial Narrow', sans-serif`;
      ctx.lineWidth = 1.5; ctx.strokeStyle = rgba("#e8e2d6", 0.75);
      ctx.strokeText(String(cb.combo), rx, T + 40);
      ctx.font = "300 12px 'Oswald', sans-serif"; ctx.fillStyle = "rgba(232,226,214,.75)";
      ctx.fillText("КОМБО" + (cb.chain > 2 ? "  ·  РИТМ ×" + (1 + Math.min(cb.chain, 10) * 0.1).toFixed(1) : ""), rx, T + 56);
    }
    if (cb.comboLabelT > 0) {
      ctx.textAlign = "right";
      ctx.globalAlpha = Math.min(1, cb.comboLabelT * 2);
      ctx.font = "500 16px 'Oswald', sans-serif"; ctx.fillStyle = accent;
      ctx.fillText(cb.comboLabel, rx, T + 76);
      ctx.globalAlpha = 1;
    }

    // --- индикатор доли (низ, центр) ---
    if (g.settings.v.beatGuide) this._beatGuide(ctx, cx, h - 30 - safe.b, accent);

    // --- баннер волны ---
    const W = g.waves;
    if (W.bannerT > 0) {
      const a = Math.min(1, W.bannerT * 1.5) * Math.min(1, (2.2 - W.bannerT) * 4);
      ctx.globalAlpha = a;
      ctx.textAlign = "center";
      ctx.font = "700 " + Math.round(Math.min(46, w * 0.06)) + "px 'Oswald', 'Arial Narrow', sans-serif";
      ctx.fillStyle = "#e8e2d6";
      ctx.fillText(W.banner, cx, h * 0.36);
      ctx.fillStyle = accent; ctx.fillRect(cx - 40, h * 0.36 + 10, 80, 2);
      ctx.globalAlpha = 1;
    }
    // --- красная вспышка урона ---
    if (g.hurtFlash > 0) {
      const vg = ctx.createRadialGradient(cx, h / 2, Math.min(w, h) * 0.3, cx, h / 2, Math.max(w, h) * 0.7);
      vg.addColorStop(0, "rgba(255,45,74,0)"); vg.addColorStop(1, rgba("#ff2d4a", 0.45 * g.hurtFlash));
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    }
    if (g.settings.v.showFps) {
      ctx.textAlign = "left"; ctx.font = "500 11px 'JetBrains Mono', monospace"; ctx.fillStyle = "#b6ff3b";
      ctx.fillText(Math.round(g.fps) + " FPS · " + g.effQuality + " · ч:" + g.fx.count, L, h - 10 - safe.b);
    }
    ctx.restore();
  }

  _beatGuide(ctx, x, y, accent) {
    const c = this.game.clock, cb = this.game.combat;
    const ph = c.phase;
    // метки ближайших долей сходятся к центру
    ctx.fillStyle = "rgba(8,9,13,.45)";
    ctx.fillRect(x - 92, y - 13, 184, 26);
    for (let i = 0; i < 3; i++) {
      const off = (1 - ph + i) * 30;
      const a = 0.85 - i * 0.25;
      ctx.fillStyle = rgba(accent, a);
      ctx.fillRect(x - off - 1.5, y - 8, 3, 16);
      ctx.fillRect(x + off - 1.5, y - 8, 3, 16);
    }
    ctx.beginPath(); ctx.arc(x, y, 6 + (1 - ph) * 10, 0, TAU);
    ctx.strokeStyle = rgba("#e8e2d6", 0.3 + 0.5 * ph); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 4 + c.pulse * 3, 0, TAU);
    ctx.fillStyle = c.strongNow && c.pulse > 0.3 ? "#ff2d4a" : "#e8e2d6"; ctx.fill();
    // последняя оценка
    const age = cb.time - cb.lastRatingT;
    if (cb.lastRating && age < 0.9) {
      const R = RATING[cb.lastRating];
      ctx.globalAlpha = clamp(1.2 - age * 1.3, 0, 1);
      ctx.textAlign = "center"; ctx.font = "600 13px 'Oswald', sans-serif";
      ctx.fillStyle = R.color; ctx.fillText(R.label, x, y - 20);
      ctx.globalAlpha = 1;
    }
  }

  _fit(ctx, s, w) {
    if (ctx.measureText(s).width <= w) return s;
    while (s.length > 3 && ctx.measureText(s + "…").width > w) s = s.slice(0, -1);
    return s + "…";
  }
}

/* =====================================================================
   UIManager
   ===================================================================== */
const $ = id => document.getElementById(id);

class UIManager {
  constructor(game) {
    this.game = game;
    this.screen = "menu";
    this.prevScreen = "menu";
    this.settingsReturn = "menu";
    this.syncReturn = "menu";
    this.taps = [];
    this._toastT = null;
    this._bind();
  }

  sfx(name) { const s = this.game.audio.sfx; if (s && s[name]) s[name](); }

  show(name) {
    const g = this.game;
    document.querySelectorAll(".screen").forEach(el => { el.hidden = el.id !== "scr-" + name; });
    this.prevScreen = this.screen;
    this.screen = name;
    if (name === "music") this.refreshMusic();
    if (name === "mode") this.refreshMode();
    if (name === "settings") this.refreshSettings();
    if (name === "sync") this.refreshSync();
    if (name === "skins") this.buildSkins();
    if (name === "menu") this.refreshMenu();
    const first = document.querySelector("#scr-" + name + " .menu-item, #scr-" + name + " .btn.primary");
    if (first && !("ontouchstart" in window)) setTimeout(() => first.focus({ preventScroll: true }), 30);
    g.onScreen(name);
  }
  hideAll() { document.querySelectorAll(".screen").forEach(el => (el.hidden = true)); this.screen = null; }

  toast(msg, ms = 2600) {
    const t = $("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove("show"), ms);
  }

  _bind() {
    const g = this.game, S = g.settings;
    // общий разблокиратор звука на первом жесте
    const unlock = () => g.audio.unlock();
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });

    document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => {
      const to = b.dataset.go;
      this.sfx(to === "menu" ? "uiBack" : "uiClick");
      if (to === "sync") this.syncReturn = this.screen;
      if (to === "settings") this.settingsReturn = this.screen;
      this.show(to);
    }));
    document.querySelectorAll(".menu-item, .btn, .arena, .skin").forEach(b => b.addEventListener("pointerenter", () => this.sfx("uiMove")));

    // ---- музыка ----
    $("file-input").addEventListener("change", e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (f) g.loadFile(f);
    });
    $("btn-demo").addEventListener("click", () => { this.sfx("uiClick"); g.loadDemo(); });
    $("pl-play").addEventListener("click", () => { if (!g.audio.buffer) return; g.audio.toggle(); this.refreshPlayer(); });
    $("pl-restart").addEventListener("click", () => { if (!g.audio.buffer) return; g.audio.seek(0); if (!g.audio.playing) g.audio.play(0); this.refreshPlayer(); });
    const seek = $("pl-seek");
    seek.addEventListener("input", () => { this._seeking = true; $("pl-time").textContent = fmtTime(seek.value / 1000 * g.audio.duration) + " / " + fmtTime(g.audio.duration); });
    seek.addEventListener("change", () => { this._seeking = false; if (g.audio.buffer) g.audio.seek(seek.value / 1000 * g.audio.duration); });
    this.bindRange("pl-vol", "musicVol", v => v / 100, v => Math.round(v * 100), v => v + "%");
    $("music-fight").addEventListener("click", () => {
      this.sfx("uiClick");
      if (g.battleActive) g.returnToBattle(); else this.show("mode");
    });

    // ---- режим ----
    document.querySelectorAll("#mode-list [data-mode]").forEach(b => b.addEventListener("click", () => {
      S.set("mode", b.dataset.mode); this.sfx("uiClick"); this.refreshMode();
    }));
    document.querySelectorAll("#diff-seg [data-diff]").forEach(b => b.addEventListener("click", () => {
      S.set("difficulty", b.dataset.diff); this.sfx("uiClick"); this.refreshMode();
    }));
    $("btn-start").addEventListener("click", () => { this.sfx("uiClick"); g.startBattle(S.v.mode); });
    $("btn-practice").addEventListener("click", () => { this.sfx("uiClick"); g.startBattle("practice"); });

    // ---- пауза ----
    $("btn-pause").addEventListener("click", () => g.pause());
    $("ps-resume").addEventListener("click", () => g.resume());
    $("ps-restart").addEventListener("click", () => g.startBattle(g.mode));
    $("ps-settings").addEventListener("click", () => { this.settingsReturn = "pause"; this.show("settings"); });
    $("ps-sync").addEventListener("click", () => { this.syncReturn = "pause"; this.show("sync"); });
    $("ps-music").addEventListener("click", () => this.show("music"));
    $("ps-menu").addEventListener("click", () => g.toMenu());

    // ---- итоги ----
    $("res-again").addEventListener("click", () => g.startBattle(g.mode));
    $("res-music").addEventListener("click", () => { g.battleActive = false; this.show("music"); });
    $("res-menu").addEventListener("click", () => g.toMenu());

    // ---- настройки ----
    document.querySelectorAll(".tabs [data-tab]").forEach(b => b.addEventListener("click", () => {
      document.querySelectorAll(".tabs [data-tab]").forEach(x => x.setAttribute("aria-selected", String(x === b)));
      document.querySelectorAll("[data-panel]").forEach(p => (p.hidden = p.dataset.panel !== b.dataset.tab));
      this.sfx("uiMove");
    }));
    this.bindRange("set-btn-scale", "btnScale", v => v / 100, v => Math.round(v * 100), v => v + "%");
    this.bindRange("set-btn-alpha", "btnAlpha", v => v / 100, v => Math.round(v * 100), v => v + "%");
    this.bindRange("set-vol-music", "musicVol", v => v / 100, v => Math.round(v * 100), v => v + "%");
    this.bindRange("set-vol-sfx", "sfxVol", v => v / 100, v => Math.round(v * 100), v => v + "%", () => this.sfx("hit"));
    this.bindRange("set-vol-ui", "uiVol", v => v / 100, v => Math.round(v * 100), v => v + "%", () => this.sfx("uiClick"));
    this.bindRange("set-shake", "shake", v => v / 100, v => Math.round(v * 100), v => v + "%");
    this.bindRange("set-latency", "latencyMs", v => +v, v => v, v => (v > 0 ? "+" : "") + v + " мс");
    this.bindRange("set-sens", "sensitivity", v => v / 100, v => Math.round(v * 100), v => v + "%");
    this.bindRange("set-window", "windowScale", v => v / 100, v => Math.round(v * 100), v => v + "%");
    this.bindCheck("set-joy-float", "joyFloat");
    this.bindCheck("set-touch-force", "touchForce");
    this.bindCheck("set-flash", "flashes");
    this.bindCheck("set-guide", "beatGuide");
    this.bindCheck("set-fs", "fullscreen");
    this.bindCheck("set-fps", "showFps");
    this.bindCheck("set-assist", "assist");
    document.querySelectorAll("#seg-quality [data-q]").forEach(b => b.addEventListener("click", () => { S.set("quality", b.dataset.q); this.refreshSettings(); }));
    $("settings-back").addEventListener("click", () => { this.sfx("uiBack"); this.show(this.settingsReturn === "pause" ? "pause" : "menu"); });
    $("btn-layout-reset").addEventListener("click", () => { S.resetLayout(); g.input.touch.layout(); this.toast("Раскладка сброшена"); });
    $("btn-editor").addEventListener("click", () => g.openEditor());
    $("ed-done").addEventListener("click", () => g.closeEditor());
    $("ed-reset").addEventListener("click", () => { S.resetLayout(); g.input.touch.layout(); this.refreshEditor(); });
    $("ed-size").addEventListener("input", e => {
      const sel = g.input.touch.selected;
      S.v.layout[sel].s = e.target.value / 100; S.save(); g.input.touch.layout();
      e.target.nextElementSibling.textContent = e.target.value + "%";
    });
    $("ed-alpha").addEventListener("input", e => {
      S.set("btnAlpha", e.target.value / 100);
      e.target.nextElementSibling.textContent = e.target.value + "%";
    });
    g.input.touch.onSelect = () => this.refreshEditor();
    S.on("change", k => { if (k === "btnScale" || k === "layout") g.input.touch.layout(); if (k === "quality") g.applyQuality(); });

    // ---- синхронизация ----
    $("sync-play").addEventListener("click", () => {
      if (!g.audio.buffer) { g.loadDemo().then(() => { g.audio.play(0); this.refreshSync(); }); return; }
      g.audio.toggle(); this.refreshSync();
    });
    $("sync-back").addEventListener("click", () => { this.sfx("uiBack"); this.show(this.syncReturn === "pause" ? "pause" : this.syncReturn || "menu"); });
    $("tap-pad").addEventListener("pointerdown", e => { e.preventDefault(); this.onTap(e.timeStamp); });
  }

  /** Привязка ползунка к настройке: toVal(input) → значение, toInput(value) → input, fmt → подпись. */
  bindRange(id, key, toVal, toInput, fmt, onChange) {
    const el = $(id), S = this.game.settings;
    const out = el.parentElement.querySelector("output");
    const sync = () => { el.value = toInput(S.v[key]); if (out) out.textContent = fmt(+el.value); };
    el.addEventListener("input", () => { S.set(key, toVal(+el.value)); if (out) out.textContent = fmt(+el.value); });
    if (onChange) el.addEventListener("change", onChange);
    (this._syncers || (this._syncers = [])).push(sync);
    sync();
  }
  bindCheck(id, key) {
    const el = $(id), S = this.game.settings;
    el.checked = !!S.v[key];
    el.addEventListener("change", () => S.set(key, el.checked));
    (this._syncers || (this._syncers = [])).push(() => { el.checked = !!S.v[key]; });
  }
  syncAll() { (this._syncers || []).forEach(f => f()); }

  /* ---------- обновление экранов ---------- */
  refreshMenu() {
    const t = this.game.track;
    $("menu-track").textContent = t ? "Трек: " + t.meta.name + (t.map ? " · " + Math.round(t.map.bpm) + " BPM" : "") : "Трек не выбран: в бою зазвучит демо-трек";
    $("menu-dot").classList.toggle("ok", !!t);
  }
  refreshMode() {
    const g = this.game, S = g.settings.v;
    document.querySelectorAll("#mode-list [data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === S.mode)));
    document.querySelectorAll("#diff-seg [data-diff]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.diff === S.difficulty)));
    $("mode-track").textContent = g.track ? g.track.meta.name : "Демо-трек";
    $("mode-dot").classList.toggle("ok", !!g.track);
  }
  refreshSettings() {
    this.syncAll();
    document.querySelectorAll("#seg-quality [data-q]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.q === this.game.settings.v.quality)));
  }

  refreshMusic() {
    const g = this.game, t = g.track;
    $("track-name").textContent = t ? t.meta.name : "Не выбран";
    const m = t && t.map;
    $("st-bpm").textContent = m ? m.bpm.toFixed(1) : "—";
    $("st-conf").textContent = m ? Math.round(m.confidence * 100) + "%" : "—";
    $("st-mode").textContent = m ? MODE_LABEL[m.mode] : "—";
    $("st-dur").textContent = m ? fmtTime(m.duration) : "—";
    $("music-fight").textContent = g.battleActive ? "Вернуться в бой" : "В бой";
    this.refreshPlayer();
    this.buildArenas();
    this.syncAll();
  }
  refreshPlayer() {
    const a = this.game.audio;
    $("pl-play").textContent = a.playing ? "❚❚" : "▶";
    $("pl-play").setAttribute("aria-label", a.playing ? "Пауза" : "Воспроизвести");
    if (!this._seeking) {
      const pos = a.buffer ? clamp(a.heardPosition(), 0, a.duration) : 0;
      $("pl-seek").value = a.duration ? Math.round(pos / a.duration * 1000) : 0;
      $("pl-time").textContent = fmtTime(pos) + " / " + fmtTime(a.duration);
    }
  }

  buildArenas() {
    const g = this.game, list = $("arena-list");
    const t = g.track;
    const ranked = rankThemes(t && t.map ? t.map.features : null);
    const best = ranked[0].theme.id;
    const chosen = t ? t.themeId : null;
    list.innerHTML = "";
    const mk = (id, title, sub, extra) => {
      const b = document.createElement("button");
      b.className = "arena"; b.type = "button";
      b.setAttribute("aria-pressed", String((chosen || "auto") === id));
      const cv = document.createElement("canvas"); cv.width = 380; cv.height = 166;
      const d = document.createElement("div");
      d.innerHTML = `<b></b><span></span>`;
      d.querySelector("b").textContent = title;
      d.querySelector("span").textContent = sub;
      if (extra) d.querySelector("span").classList.add("tag");
      b.append(cv, d);
      b.addEventListener("click", () => {
        if (!g.track) { this.toast("Сначала выберите трек или демо"); return; }
        g.setTrackTheme(id);
        list.querySelectorAll(".arena").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
        this.sfx("uiClick");
      });
      list.appendChild(b);
      return cv;
    };
    const autoTheme = ranked[0].theme;
    const autoCv = mk("auto", "Авто", t && t.map ? autoTheme.name : "по треку", true);
    g.arena.preview(autoCv, autoTheme);
    for (const r of ranked) {
      const pct = t && t.map ? Math.round(clamp(r.score, 0.02, 0.98) * 100) + "%" : r.theme.desc;
      const cv = mk(r.theme.id, r.theme.name, t && t.map ? (r.theme.id === best ? "★ " : "") + pct : pct, false);
      g.arena.preview(cv, r.theme);
    }
  }

  buildSkins() {
    const g = this.game, list = $("skin-list");
    list.innerHTML = "";
    for (const id in SKINS) {
      const sk = SKINS[id];
      const b = document.createElement("button");
      b.className = "skin"; b.type = "button";
      b.setAttribute("aria-pressed", String(g.settings.v.skin === id));
      const cv = document.createElement("canvas"); cv.width = 200; cv.height = 200;
      const label = document.createElement("b"); label.textContent = sk.name;
      b.append(cv, label);
      this._drawSkin(cv, id);
      b.addEventListener("click", () => {
        g.settings.set("skin", id);
        g.player.setSkin(id);
        list.querySelectorAll(".skin").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
        this.sfx("uiClick");
      });
      list.appendChild(b);
    }
  }
  _drawSkin(cv, id) {
    const c = cv.getContext("2d"), sk = SKINS[id];
    const gr = c.createLinearGradient(0, 0, 0, cv.height);
    gr.addColorStop(0, "#0d0e14"); gr.addColorStop(1, mixHex("#0d0e14", sk.accent, 0.15));
    c.fillStyle = gr; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = rgba(sk.accent, 0.6); c.fillRect(0, cv.height * 0.82, cv.width, 1.5);
    const ch = { kind: "player", skin: sk, x: cv.width / 2, y: cv.height * 0.82, facing: 1, scale: 3.4, anim: new AnimState(), scarfColor: null, weapon: "dagger", eyeBoost: 0.3, flash: 0, groundY: cv.height * 0.82, vx: 0, vy: 0 };
    Object.assign(ch.anim.pose, { armF: 0.5, elbowF: 0.5, lean: 0.05 });
    CharacterRenderer.draw(c, ch);
  }

  refreshSync() {
    const g = this.game;
    const m = g.track && g.track.map;
    $("sync-info").textContent = m ? `${m.bpm.toFixed(1)} BPM · ${MODE_LABEL[m.mode]} · уверенность ${Math.round(m.confidence * 100)}%` : "Трек не выбран: будет демо";
    $("sync-play").textContent = g.audio.playing ? "❚❚ Трек" : "▶ Трек";
    this.syncAll();
  }

  /** Тап-тест: медиана отклонения касаний от долей = задержка звука. */
  onTap(stamp) {
    const g = this.game, a = g.audio;
    if (!g.track || !g.track.map || !a.playing) { this.toast("Сначала включите трек кнопкой «▶ Трек»"); return; }
    const raw = a.heardPosition() - clamp((performance.now() - stamp) / 1000, 0, 0.2);
    const beats = g.track.map.beats;
    const i = lowerIndex(beats, raw);
    let best = 1e9;
    for (let k = Math.max(0, i); k <= Math.min(beats.length - 1, i + 1); k++) if (Math.abs(raw - beats[k]) < Math.abs(best)) best = raw - beats[k];
    this.taps.push(best);
    const orb = $("beat-orb").querySelector("b");
    orb.style.background = "#ff2e88"; setTimeout(() => (orb.style.background = ""), 90);
    const n = this.taps.length;
    if (n < 12) { $("tap-hint").textContent = `Касание ${n} из 12: ${Math.round(best * 1000)} мс от доли`; return; }
    const sorted = this.taps.slice().sort((x, y) => x - y);
    const med = sorted[6];
    const spread = sorted[9] - sorted[2];
    this.taps = [];
    if (spread > 0.16) { $("tap-hint").textContent = "Касания слишком разбросаны. Попробуйте ещё раз, ориентируясь на бочку."; return; }
    const ms = clamp(Math.round(med * 1000 / 5) * 5, -250, 250);
    g.settings.set("latencyMs", ms);
    this.syncAll();
    $("tap-hint").textContent = `Готово: задержка ${ms > 0 ? "+" : ""}${ms} мс. Разброс касаний ${Math.round(spread * 1000)} мс.`;
    this.sfx("uiClick");
  }

  /** Анимация экрана синхронизации — вызывается из игрового цикла. */
  tickSync() {
    const g = this.game, c = g.clock;
    const orb = $("beat-orb");
    orb.querySelector("i").style.opacity = String(c.pulse);
    orb.querySelector("i").style.transform = `scale(${1 + c.pulse * 0.25})`;
    orb.querySelector("i").style.borderColor = c.strongNow ? "#ff2e88" : "#3ef0ff";
    const L = g.analyzer.live;
    $("m-low").style.height = Math.round(c.bands.low * 100) + "%";
    $("m-mid").style.height = Math.round(c.bands.mid * 100) + "%";
    $("m-high").style.height = Math.round(c.bands.high * 100) + "%";
    $("m-en").style.height = Math.round(c.intensity * 100) + "%";
    // метроном: щелчки по аудиочасам на долях из карты
    const a = g.audio;
    if ($("sync-click").checked && a.playing && g.track && g.track.map && a.sfx) {
      const beats = g.track.map.beats, strong = g.track.map.strong;
      const posNow = a.rawPosition();
      if (this._clickIdx == null || this._clickPos == null || posNow < this._clickPos - 0.1) this._clickIdx = lowerIndex(beats, posNow) + 1;
      this._clickPos = posNow;
      while (this._clickIdx < beats.length && beats[this._clickIdx] < posNow + 0.25) {
        const at = a.startCtx + (beats[this._clickIdx] - a.startOffset);
        if (at > a.ctx.currentTime) a.sfx.click(at, !!strong[this._clickIdx]);
        this._clickIdx++;
      }
    } else this._clickIdx = null;
  }

  refreshEditor() {
    const g = this.game, sel = g.input.touch.selected;
    const names = { joy: "Джойстик", attack: "Атака", jump: "Прыжок", dodge: "Уклон" };
    $("ed-sel").textContent = "Выбрано: " + names[sel];
    const s = Math.round(g.settings.v.layout[sel].s * 100);
    $("ed-size").value = s; $("ed-size").nextElementSibling.textContent = s + "%";
    const a = Math.round(g.settings.v.btnAlpha * 100);
    $("ed-alpha").value = a; $("ed-alpha").nextElementSibling.textContent = a + "%";
  }

  showResults(win, stats) {
    $("res-title").textContent = win ? "Победа" : "Поражение";
    $("res-title").className = "title h2 res-title " + (win ? "win" : "lose");
    $("res-grade").textContent = stats.grade;
    $("res-grade").style.color = win ? "var(--cyan)" : "var(--red)";
    $("res-sub").textContent = stats.sub;
    const box = $("res-stats");
    box.innerHTML = "";
    for (const [k, v] of stats.rows) {
      const d = document.createElement("div"); d.className = "stat";
      const b = document.createElement("b"); b.textContent = v;
      const s = document.createElement("small"); s.textContent = k;
      d.append(b, s); box.appendChild(d);
    }
    this.show("results");
  }
}
