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
    // кинематографичные полосы во время добивания
    if (g.letterbox > 0.01) {
      const bh = h * 0.1 * g.letterbox;
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, bh); ctx.fillRect(0, h - bh, w, bh);
      ctx.fillStyle = rgba(accent, 0.6 * g.letterbox);
      ctx.fillRect(0, bh - 1, w, 1); ctx.fillRect(0, h - bh, w, 1);
    }
    if (g.takedownTitleT > 0) {
      const k = g.takedownTitleT, a = Math.min(1, k * 2) * Math.min(1, (1.4 - k) * 6);
      ctx.globalAlpha = a; ctx.textAlign = "center";
      ctx.font = "700 " + Math.round(Math.min(40, w * 0.05)) + "px 'Oswald', 'Arial Narrow', sans-serif";
      const tx = w / 2 + (1 - a) * 30;
      ctx.fillStyle = "#ffffff"; ctx.fillText(g.takedownTitle, tx, h * 0.86);
      ctx.fillStyle = accent; ctx.fillRect(tx - 50, h * 0.86 + 8, 100, 2);
      ctx.globalAlpha = 1;
    }

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
    if (g.mode === "waves") {
      line2 = "ВОЛНА " + Math.max(1, g.waves.wave) + "/" + WAVES.length;
      if (g.waves.wave > 0 && g.waves.between <= 0 && !g.waves.done) line2 += "   ·   ВРАГОВ " + g.waves.remaining();
    }
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

    // --- часть трека: смена и предупреждение о дропе ---
    if (g.sectionTitleT > 0 && g.letterbox < 0.2) {
      const k = g.sectionTitleT, a = Math.min(1, k * 2) * Math.min(1, (2 - k) * 5);
      ctx.globalAlpha = a; ctx.textAlign = "center";
      ctx.font = "500 15px 'Oswald', 'Arial Narrow', sans-serif"; ctx.fillStyle = accent;
      ctx.fillText("— " + g.sectionTitle + " —", cx, T + 52);
      ctx.globalAlpha = 1;
    } else if ((clock.nextKind === "drop" || clock.nextKind === "climax") && clock.timeToNext < 4 && clock.timeToNext > 0.3 && g.mode !== "practice") {
      ctx.textAlign = "center"; ctx.font = "500 14px 'Oswald', sans-serif";
      ctx.globalAlpha = 0.5 + 0.5 * clock.pulse;
      ctx.fillStyle = "#ff2d4a"; ctx.fillText((clock.nextKind === "drop" ? "СКОРО ДРОП " : "КУЛЬМИНАЦИЯ ") + Math.ceil(clock.timeToNext), cx, T + 52);
      ctx.globalAlpha = 1;
    }

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
    if (g.settings.v.beatGuide) this._beatGuide(ctx, cx, h - 38 - safe.b, accent);

    // --- баннер волны ---
    const W = g.waves;
    if (W.bannerT > 0) {
      const a = Math.min(1, W.bannerT * 1.5) * Math.min(1, ((W.bannerDur || 2.2) - W.bannerT) * 4);
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
      ctx.fillText(Math.round(g.fps) + " FPS · " + g.effQuality + " · ч:" + g.fx.count + " · сбросы GPU: " + g.gpuResets, L, h - 10 - safe.b);
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
    // шкала точности «рано ↔ поздно»: центр — доля, отметки последних нажатий затухают
    const sy = y + 20, half = 88;
    ctx.fillStyle = "rgba(8,9,13,.45)"; ctx.fillRect(x - 92, y + 13, 184, 14);
    ctx.fillStyle = "rgba(232,226,214,.22)"; ctx.fillRect(x - half, sy - 0.5, half * 2, 1);
    ctx.fillStyle = rgba(accent, 0.7); ctx.fillRect(x - 1, sy - 5, 2, 10);
    const lim = this.game.sync.marks.length ? this.game.sync.marks[this.game.sync.marks.length - 1].lim : 120;
    for (const m of this.game.sync.marks) {
      const age2 = cb.time - m.t;
      if (age2 > 6) continue;
      const k = clamp(m.d / Math.max(60, lim * 1.6), -1, 1);
      ctx.globalAlpha = clamp(1 - age2 / 6, 0, 1) * 0.9;
      ctx.fillStyle = Math.abs(m.d) <= lim * 0.5 ? accent : "#e8e2d6";
      ctx.fillRect(x + k * (half - 2) - 1.5, sy - 4, 3, 8);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(232,226,214,.4)"; ctx.font = "500 8px 'Oswald', sans-serif";
    ctx.textAlign = "left"; ctx.fillText("РАНО", x - 90, sy + 3); ctx.textAlign = "right"; ctx.fillText("ПОЗДНО", x + 90, sy + 3);
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
    if (name === "library") { if (this.prevScreen !== "library") this.libReturn = this.prevScreen || "menu"; this.refreshLibrary(true); }
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
    const unlock = () => {
      g.audio.unlock();
      if (!this._lockTried && g.isTouchDevice() && S.v.forceLandscape) { this._lockTried = true; g.requestFullscreen(true); }
    };
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

    // ---- библиотека ----
    $("lib-file").addEventListener("change", e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (f) { this.show("music"); g.loadFile(f); }
    });
    $("lib-back").addEventListener("click", () => {
      this.sfx("uiBack");
      const to = this.libReturn && this.libReturn !== "library" ? this.libReturn : "menu";
      this.show(to === "pause" && !g.battleActive ? "menu" : to);
    });
    this.libSort = Store.get("libSort", "recent");
    $("lib-prev").addEventListener("click", () => this.libFlip(-1));
    $("lib-next").addEventListener("click", () => this.libFlip(1));
    $("lib-search").addEventListener("input", e => { this.libQuery = e.target.value; this.libPage = 0; this.refreshLibrary(); });
    document.querySelectorAll("#lib-sort [data-sort]").forEach(b => b.addEventListener("click", () => {
      this.sfx("uiClick");
      this.libSort = b.dataset.sort; Store.set("libSort", this.libSort);
      this.libPage = 0; this.refreshLibrary();
    }));
    window.addEventListener("keydown", e => {
      if (this.screen !== "library" || e.target === $("lib-search")) return;
      if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); this.libFlip(-1); }
      else if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); this.libFlip(1); }
    });
    // свайп по списку влево/вправо листает страницы
    let sw = null;
    const libList = $("lib-list");
    libList.addEventListener("pointerdown", e => { sw = { x: e.clientX, y: e.clientY }; });
    libList.addEventListener("pointerup", e => {
      if (!sw) return;
      let dx = e.clientX - sw.x, dy = e.clientY - sw.y;
      if ($("app").classList.contains("rot")) [dx, dy] = [dy, -dx];   // интерфейс повёрнут на 90°
      sw = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { this._libSwiped = true; this.libFlip(dx < 0 ? 1 : -1); }
    });
    // свайп не должен заодно выбрать трек под пальцем
    libList.addEventListener("click", e => { if (this._libSwiped) { this._libSwiped = false; e.stopPropagation(); e.preventDefault(); } }, true);
    libList.addEventListener("pointercancel", () => { sw = null; });
    window.addEventListener("resize", () => { if (this.screen === "library") this.refreshLibrary(); });
    $("menu-continue").addEventListener("click", () => { this.sfx("uiClick"); g.continueBattle(); });
    $("pl-play").addEventListener("click", () => { if (!g.audio.buffer) return; g.audio.toggle(); this.refreshPlayer(); });
    $("pl-restart").addEventListener("click", () => { if (!g.audio.buffer) return; g.audio.seek(0); if (!g.audio.playing) g.audio.play(0); this.refreshPlayer(); });
    const seek = $("pl-seek");
    seek.addEventListener("input", () => { this._seeking = true; $("pl-time").textContent = fmtTime(seek.value / 1000 * g.audio.duration) + " / " + fmtTime(g.audio.duration); });
    seek.addEventListener("change", () => { this._seeking = false; if (g.audio.buffer) g.audio.seek(seek.value / 1000 * g.audio.duration); });
    this.bindRange("pl-vol", "musicVol", v => v / 100, v => Math.round(v * 100), v => v + "%");
    this.bindTempo();
    this.bindDirector();
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
    this.bindCheck("set-land", "forceLandscape");
    this.bindCheck("set-fps", "showFps");
    this.bindCheck("set-assist", "assist");
    this.bindCheck("set-autosync", "autoSync");
    document.querySelectorAll("#seg-quality [data-q]").forEach(b => b.addEventListener("click", () => { S.set("quality", b.dataset.q); this.refreshSettings(); }));
    document.querySelectorAll("#seg-slowmo [data-s]").forEach(b => b.addEventListener("click", () => { S.set("slowmoMode", b.dataset.s); this.refreshSettings(); this.sfx("uiClick"); }));
    document.querySelectorAll("#seg-sfx [data-x]").forEach(b => b.addEventListener("click", () => { S.set("sfxStyle", b.dataset.x); this.refreshSettings(); this.sfx("hit"); }));
    document.querySelectorAll("#seg-fps [data-f]").forEach(b => b.addEventListener("click", () => { S.set("fpsCap", +b.dataset.f); this.refreshSettings(); this.sfx("uiClick"); }));
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
    const g = this.game, t = g.track;
    $("menu-track").textContent = t ? "Трек: " + t.meta.name + (t.map ? " · " + Math.round(t.map.bpm) + " BPM" : "") : "Трек не выбран: в бою зазвучит демо-трек";
    $("menu-dot").classList.toggle("ok", !!t);
    const a = g.getAutosave();
    const playable = a && (a.isDemo || (t && t.meta.key === a.key) || (a.libId && g.library.get(a.libId)));
    $("menu-continue").hidden = !playable;
    if (playable) $("menu-continue-sub").textContent = (a.mode === "waves" ? "волна " + a.wave : fmtTime(a.songPos)) + " · " + a.name;
  }

  /** Сколько строк библиотеки помещается на страницу (по высоте экрана, без учёта поворота). */
  _libPerPage() {
    const h = $("app").offsetHeight || window.innerHeight;
    return clamp(Math.floor((h - (h <= 520 ? 220 : 270)) / (h <= 520 ? 48 : 60)), 3, 8);
  }
  /** Список библиотеки: поиск, сортировка, страницы (◀ ▶, стрелки клавиатуры, свайп). toCurrent — открыть страницу текущего трека. */
  refreshLibrary(toCurrent = false) {
    const g = this.game, L = g.library, list = $("lib-list");
    list.innerHTML = "";
    const all = L.ok ? L.list() : [];
    $("lib-info").textContent = L.ok ? `${all.length} / ${L.maxTracks} · ${(L.totalBytes() / 1048576).toFixed(0)} из ${Math.round(L.maxBytes / 1048576)} МБ` : "недоступна";
    $("lib-empty").hidden = all.length > 0 || !L.ok;
    $("lib-note").textContent = L.ok
      ? "Треки хранятся только на этом устройстве. Когда место заканчивается, автоматически удаляется трек, который вы дольше всего не запускали."
      : "Этот браузер не даёт сохранять файлы (приватный режим или встроенный просмотр). Треки можно открывать, но библиотека не сохранится.";
    $("lib-tools").hidden = all.length < 2;
    const sort = this.libSort || "recent", q = (this.libQuery || "").trim().toLowerCase();
    document.querySelectorAll("#lib-sort [data-sort]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.sort === sort)));
    let items = q ? all.filter(m => m.name.toLowerCase().includes(q)) : all;
    if (sort === "name") items = items.slice().sort((a, b) => a.name.localeCompare(b.name, "ru"));
    else if (sort === "bpm") items = items.slice().sort((a, b) => a.bpm - b.bpm);
    const cur = g.track && g.track.meta.libId;
    const per = this._libPerPage(), pages = Math.max(1, Math.ceil(items.length / per));
    if (toCurrent) { const i = items.findIndex(m => m.id === cur); this.libPage = i >= 0 ? Math.floor(i / per) : 0; }
    this.libPage = clamp(this.libPage || 0, 0, pages - 1);
    this.libPages = pages;
    $("lib-pager").hidden = pages < 2;
    $("lib-page").textContent = `${this.libPage + 1} / ${pages}`;
    $("lib-prev").disabled = this.libPage === 0;
    $("lib-next").disabled = this.libPage >= pages - 1;
    if (q && !items.length) {
      const p = document.createElement("p"); p.className = "hint"; p.textContent = "Ничего не найдено";
      list.appendChild(p);
    }
    const start = this.libPage * per;
    items.slice(start, start + per).forEach((m, k) => {
      const row = document.createElement("div");
      row.className = "lib-row";
      row.setAttribute("aria-current", String(m.id === cur));
      const pick = async () => {
        this.sfx("uiClick");
        this.show("music");
        if (m.id !== cur) await g.loadFromLibrary(m.id);
      };
      // вся левая часть строки — тоже кнопка выбора (крупнее цель для пальца)
      const info = document.createElement("button");
      info.className = "info"; info.type = "button";
      const num = document.createElement("span"); num.className = "num"; num.textContent = start + k + 1;
      const txt = document.createElement("div");
      const nm = document.createElement("div"); nm.className = "nm"; nm.textContent = m.name;
      const best = Store.get("best." + m.key + ".waves", 0);
      const sub = document.createElement("span"); sub.className = "sub";
      sub.textContent = `${Math.round(m.bpm)} BPM · ${fmtTime(m.duration)} · ${(m.size / 1048576).toFixed(1)} МБ` + (best ? ` · рекорд ${best.toLocaleString("ru-RU")}` : "");
      txt.append(nm, sub);
      info.append(num, txt);
      info.addEventListener("click", pick);
      const play = document.createElement("button");
      play.className = "btn small" + (m.id === cur ? "" : " primary"); play.type = "button";
      play.textContent = m.id === cur ? "Выбран" : "Выбрать";
      play.addEventListener("click", pick);
      const del = document.createElement("button");
      del.className = "btn small del"; del.type = "button";
      del.textContent = "✕"; del.setAttribute("aria-label", "Удалить «" + m.name + "»");
      let armT = null;
      del.addEventListener("click", async () => {
        // удаление в два нажатия: первое — подтверждение
        if (!del.classList.contains("confirm")) {
          del.classList.add("confirm"); del.textContent = "Удалить?";
          armT = setTimeout(() => { del.classList.remove("confirm"); del.textContent = "✕"; }, 3000);
          this.sfx("uiMove");
          return;
        }
        clearTimeout(armT);
        this.sfx("uiBack");
        await g.deleteTrack(m.id);
        this.toast(`Удалено: «${m.name}»`);
        this.refreshLibrary();
      });
      row.append(info, play, del);
      list.appendChild(row);
    });
  }
  /** Листание библиотеки на d страниц. */
  libFlip(d) {
    const to = clamp((this.libPage || 0) + d, 0, (this.libPages || 1) - 1);
    if (to === this.libPage) return;
    this.libPage = to;
    this.sfx("uiMove");
    this.refreshLibrary();
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
    document.querySelectorAll("#seg-slowmo [data-s]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.s === this.game.settings.v.slowmoMode)));
    document.querySelectorAll("#seg-sfx [data-x]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.x === this.game.settings.v.sfxStyle)));
    document.querySelectorAll("#seg-fps [data-f]").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.f === (+this.game.settings.v.fpsCap || 0))));
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
    this.refreshTempo();
    this.refreshDirector();
    this.refreshPlayer();
    this.buildArenas();
    this.syncAll();
  }
  /* ---------- темп трека ---------- */
  bindTempo() {
    const g = this.game;
    // draft — то, что показано на экране; к треку применяется через паузу после последнего нажатия
    const edit = (fn, quiet) => {
      if (!g.track || g.battleActive) return;
      const d = Tempo.normalize(this._tempoDraft || g.track.tempo);
      fn(d);
      this._tempoDraft = Tempo.normalize(d);
      if (!quiet) this.sfx("uiClick");
      this.refreshTempo(true);
      clearTimeout(this._tpTimer);
      this._tpTimer = setTimeout(() => this.commitTempo(), 450);
    };
    const setRate = (pct, quiet) => edit(d => { d.rate = clamp(Math.round(pct) / 100, TEMPO_MIN, TEMPO_MAX); }, quiet);
    $("tp-rate").addEventListener("input", e => setRate(+e.target.value, true));
    $("tp-minus").addEventListener("click", () => setRate(Math.round(((this._tempoDraft || g.track.tempo).rate * 100 - 5) / 5) * 5));
    $("tp-plus").addEventListener("click", () => setRate(Math.round(((this._tempoDraft || g.track.tempo).rate * 100 + 5) / 5) * 5));
    $("tp-one").addEventListener("click", () => setRate(100));
    $("tp-keep").addEventListener("change", e => edit(d => { d.keep = e.target.checked; }));
    $("fx-x2").addEventListener("click", () => edit(d => { d.fix.k = Math.min(3, d.fix.k + 1); }));
    $("fx-d2").addEventListener("click", () => edit(d => { d.fix.k = Math.max(-3, d.fix.k - 1); }));
    $("fx-half").addEventListener("click", () => edit(d => { d.fix.half = !d.fix.half; }));
    $("fx-m10").addEventListener("click", () => edit(d => { d.fix.shift -= 10; }));
    $("fx-p10").addEventListener("click", () => edit(d => { d.fix.shift += 10; }));
    $("fx-reset").addEventListener("click", () => edit(d => { d.fix = { k: 0, half: false, shift: 0 }; }));
  }
  commitTempo() {
    clearTimeout(this._tpTimer);
    const d = this._tempoDraft;
    this._tempoDraft = null;
    if (d && this.game.track) this.game.applyTempo(d);
    else this.refreshTempo();
  }
  /** keepDraft — показывать выбранное, но ещё не применённое значение. */
  refreshTempo(keepDraft) {
    const g = this.game, t = g.track;
    const card = $("tempo-card");
    card.classList.toggle("busy", !t || g.battleActive);
    if (!keepDraft && !this._tempoDraft) this._tempoDraft = null;
    const d = Tempo.normalize(this._tempoDraft || (t && t.tempo));
    const pct = Math.round(d.rate * 100);
    $("tp-rate").value = pct; $("tp-rate-o").textContent = pct + "%";
    $("tp-keep").checked = d.keep;
    $("tp-keep-note").textContent = d.rate === 1 ? "" : d.keep ? "(обработка займёт пару секунд)" : "(тон меняется вместе с темпом)";
    const f = d.fix;
    const parts = [];
    if (f.k) parts.push(f.k > 0 ? "×" + Math.pow(2, f.k) : "÷" + Math.pow(2, -f.k));
    if (f.half) parts.push("сдвиг ½ доли");
    if (f.shift) parts.push((f.shift > 0 ? "+" : "") + f.shift + " мс");
    $("fx-info").textContent = parts.length ? parts.join(" · ") : "без правок";
    $("fx-reset").disabled = !parts.length;
    const fmt = v => String(Math.round(v * 10) / 10);
    if (t) {
      const base = t.base.map.bpm, fixed = base * Math.pow(2, f.k), fin = fixed * d.rate;
      $("tp-read").textContent = Math.abs(fin - base) < 0.05 ? fmt(base) + " BPM" : fmt(base) + " → " + fmt(fin) + " BPM";
    } else $("tp-read").textContent = "—";
    $("tp-minus").disabled = d.rate <= TEMPO_MIN + 0.001; $("tp-plus").disabled = d.rate >= TEMPO_MAX - 0.001;
  }

  /* ---------- Режиссёр: ручная настройка частей трека ---------- */
  bindDirector() {
    const g = this.game;
    const kinds = $("dir-kinds");
    for (const k of DIR_KINDS) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn small"; b.dataset.k = k; b.textContent = DIR_LABEL[k];
      b.style.setProperty("--k", DIR_COLOR[k]);
      b.addEventListener("click", () => this.dirEdit(list => { list[this._dirSel].k = k; }));
      kinds.appendChild(b);
    }
    $("dir-mode").querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      const t = g.track; if (!t) return;
      const d = Director.normalize(t.director);
      if (b.dataset.m === "manual" && !d.secs) d.secs = Director.toList(Director.autoSections(t.base.map, d.sens));
      d.mode = b.dataset.m;
      this.dirCommit(d);
      this.sfx("uiClick");
    }));
    const setSens = v => { const t = g.track; if (!t) return; const d = Director.normalize(t.director); d.sens = clamp(v, -2, 2); this.dirCommit(d); };
    $("dir-sens").addEventListener("input", e => setSens(+e.target.value));
    $("dir-sens-m").addEventListener("click", () => setSens(Director.normalize(g.track && g.track.director).sens - 1));
    $("dir-sens-p").addEventListener("click", () => setSens(Director.normalize(g.track && g.track.director).sens + 1));
    const sel = d => { const n = this._dirSecs().length; this._dirSel = clamp((this._dirSel || 0) + d, 0, Math.max(0, n - 1)); this.refreshDirector(); };
    $("dir-prev").addEventListener("click", () => sel(-1));
    $("dir-next").addEventListener("click", () => sel(1));
    const base = () => g.track.base.map;
    const moveStart = n => this.dirEdit(list => {
      const i = this._dirSel; if (i <= 0) return;
      const lo = list[i - 1].s + DIR_MIN_LEN, hi = (i + 1 < list.length ? list[i + 1].s : base().duration) - DIR_MIN_LEN;
      const v = Director.stepBar(base(), list[i].s, n);
      if (v >= lo && v <= hi) list[i].s = v;
    });
    $("dir-left").addEventListener("click", () => moveStart(-1));
    $("dir-right").addEventListener("click", () => moveStart(1));
    $("dir-split").addEventListener("click", () => this.dirEdit(list => {
      const i = this._dirSel, s0 = list[i].s, s1 = i + 1 < list.length ? list[i + 1].s : base().duration;
      const pos = this._dirPos();
      let at = pos > s0 + DIR_MIN_LEN && pos < s1 - DIR_MIN_LEN ? pos : (s0 + s1) / 2;
      at = Director.snap(base(), at);
      if (at - s0 < DIR_MIN_LEN || s1 - at < DIR_MIN_LEN) { this.toast("Часть слишком короткая, чтобы разрезать"); return; }
      list.splice(i + 1, 0, { s: at, k: list[i].k });
      this._dirSel = i + 1;
    }));
    $("dir-merge").addEventListener("click", () => this.dirEdit(list => {
      if (list.length < 2) return;
      const i = this._dirSel;
      if (i + 1 < list.length) list.splice(i + 1, 1);
      else { list.splice(i, 1); this._dirSel = i - 1; }   // последняя часть сливается с предыдущей
    }));
    $("dir-play").addEventListener("click", () => {
      const t = g.track; if (!t || !g.audio.buffer) return;
      const sc = this._dirSecs()[this._dirSel || 0]; if (!sc) return;
      const at = sc.start / t.tempo.rate;
      g.audio.unlock(); g.audio.seek(at); if (!g.audio.playing) g.audio.play(at);
      this.refreshPlayer();
    });
    $("dir-reset").addEventListener("click", () => {
      const t = g.track; if (!t) return;
      const d = Director.normalize(t.director);
      d.secs = Director.toList(Director.autoSections(t.base.map, d.sens)); d.mode = "manual";
      this._dirSel = 0;
      this.dirCommit(d);
    });
    // нажатие по карте: выбрать часть и перемотать трек в это место
    const cv = $("dir-map");
    cv.addEventListener("click", e => {
      const t = g.track; if (!t || !cv.clientWidth) return;
      const x = clamp(e.offsetX / cv.clientWidth, 0, 1), orig = x * t.base.map.duration;
      const secs = this._dirSecs();
      const i = secs.findIndex(sc => orig >= sc.start && orig < sc.end);
      if (i >= 0) this._dirSel = i;
      if (g.audio.buffer) {
        const at = clamp(orig / t.tempo.rate, 0, g.audio.duration - 0.05);
        if (g.audio.playing) g.audio.seek(at); else g.audio.pausedAt = at;
      }
      this.refreshDirector(); this.refreshPlayer();
    });
  }
  /** Части Режиссёра текущего трека в исходном времени (кэш до смены настройки). */
  _dirSecs() {
    const t = this.game.track;
    if (!t) return [];
    const key = JSON.stringify(t.director);
    if (!this._dirCache || this._dirCache.map !== t.base.map || this._dirCache.key !== key) {
      if (this._dirCache && this._dirCache.map !== t.base.map) this._dirSel = 0;   // другой трек — с первой части
      this._dirCache = { map: t.base.map, key, secs: Director.sections(t.base.map, t.director) };
    }
    return this._dirCache.secs;
  }
  /** Позиция трека в исходном времени. */
  _dirPos() {
    const g = this.game, t = g.track, a = g.audio;
    if (!t || !a.buffer) return 0;
    return clamp(a.heardPosition(), 0, a.duration) * t.tempo.rate;
  }
  /** Правка ручной разметки: f(list) меняет копию списка частей. */
  dirEdit(f) {
    const t = this.game.track; if (!t) return;
    const d = Director.normalize(t.director);
    if (d.mode !== "manual") return;
    const list = d.secs.map(x => ({ s: x.s, k: x.k }));
    this._dirSel = clamp(this._dirSel || 0, 0, list.length - 1);
    f(list);
    d.secs = list;
    this.dirCommit(d);
    this.sfx("uiClick");
  }
  dirCommit(d) {
    if (!this.game.applyDirector(d)) { this.toast("Режиссёра можно настроить вне боя"); return; }
    this.refreshDirector();
  }
  refreshDirector() {
    const g = this.game, t = g.track;
    $("dir-card").classList.toggle("busy", !t || g.battleActive);
    const d = Director.normalize(t && t.director);
    $("dir-mode").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.m === d.mode)));
    const hasBars = !!(t && t.base.map.bars && t.base.map.bars.B);
    $("dir-auto").hidden = d.mode !== "auto";
    $("dir-manual").hidden = d.mode !== "manual";
    $("dir-sens").value = d.sens; $("dir-sens").disabled = !hasBars;
    $("dir-sens-o").textContent = DIR_SENS_LABEL[d.sens + 2];
    $("dir-sens-m").disabled = !hasBars || d.sens <= -2; $("dir-sens-p").disabled = !hasBars || d.sens >= 2;
    const secs = this._dirSecs();
    this._dirSel = clamp(this._dirSel || 0, 0, Math.max(0, secs.length - 1));
    const cur = secs[this._dirSel];
    $("dir-kinds").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(!!cur && b.dataset.k === cur.kind)));
    const n = secs.length, i = this._dirSel;
    $("dir-prev").disabled = i <= 0; $("dir-next").disabled = i >= n - 1;
    $("dir-left").disabled = $("dir-right").disabled = i <= 0;
    $("dir-merge").disabled = n < 2;
    const rate = t ? t.tempo.rate : 1;
    if (!t) $("dir-info").textContent = "Трек не выбран";
    else if (d.mode === "off") $("dir-info").textContent = "Эффекты по частям трека выключены";
    else {
      const cnt = {}; for (const sc of secs) cnt[sc.kind] = (cnt[sc.kind] || 0) + 1;
      const sum = ["drop", "climax", "break", "build"].filter(k => cnt[k]).map(k => DIR_LABEL[k].toLowerCase() + " " + cnt[k]).join(" · ");
      $("dir-info").textContent = cur ? `Часть ${i + 1} из ${n}: ${DIR_LABEL[cur.kind]}, ${fmtTime(cur.start / rate)}–${fmtTime(cur.end / rate)}` + (sum ? "  |  " + sum : "") : "—";
    }
    $("dir-hint").textContent = d.mode === "manual"
      ? "Нажмите на карту, чтобы выбрать часть и перемотать трек. Выберите характер части; «Разрезать» делит её по текущей позиции трека (по границе такта)."
      : d.mode === "auto" ? (hasBars ? "Части найдены анализом. Если эффекты меняются слишком часто или пропускают дропы — сдвиньте «Смены частей» или разметьте вручную." : "Трек проанализирован старой версией: чувствительность недоступна, ручная разметка работает.")
      : "Арена не реагирует на дропы и брейки, только на ритм.";
    this.drawDirector();
  }
  /** Карта частей: полосы по характеру, огибающая громкости, выбранная часть и позиция трека. */
  drawDirector() {
    const cv = $("dir-map"), t = this.game.track;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    if (!t) return;
    const base = t.base.map, dur = base.duration || 1, d = Director.normalize(t.director);
    const secs = this._dirSecs(), X = v => v / dur * w;
    c.font = "600 10px " + getComputedStyle(document.body).fontFamily;
    c.textBaseline = "top";
    secs.forEach((sc, i) => {
      const x0 = X(sc.start), x1 = X(sc.end);
      c.fillStyle = d.mode === "off" ? "#2a2d38" : rgba(DIR_COLOR[sc.kind] || "#777777", 0.75);
      c.fillRect(x0, 0, Math.max(1, x1 - x0 - 1), h);
      if (x1 - x0 > 30 && d.mode !== "off") { c.fillStyle = "rgba(255,255,255,0.9)"; c.fillText(DIR_SHORT[sc.kind] || "", x0 + 4, 4); }
      if (i === this._dirSel && d.mode !== "off") { c.strokeStyle = "#ffffff"; c.lineWidth = 2; c.strokeRect(x0 + 1, 1, Math.max(2, x1 - x0 - 3), h - 2); }
    });
    // огибающая громкости
    const e = base.energy;
    if (e && e.length) {
      c.beginPath();
      const step = Math.max(1, Math.floor(e.length / w));
      for (let i = 0; i < e.length; i += step) { const x = i / e.length * w, y = h - 4 - e[i] * (h - 20); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
      c.strokeStyle = "rgba(255,255,255,0.55)"; c.lineWidth = 1; c.stroke();
    }
    // позиция трека
    const px = X(this._dirPos());
    c.fillStyle = "#3ef0ff"; c.fillRect(px - 1, 0, 2, h);
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
    if (this.screen === "music") this.drawDirector();
  }

  buildArenas() {
    const g = this.game, list = $("arena-list");
    const t = g.track;
    const ranked = rankThemes(t && t.base ? t.base.map.features : null);   // по исходному анализу, а не по изменённому темпу
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

  /** Экран «Облик»: карточки строятся и рисуются один раз; дальше — только фильтр по категории и выбор. */
  buildSkins() {
    const g = this.game, list = $("skin-list"), tabs = $("skin-cats");
    if (!this._skinCards) {
      this._skinCards = {};
      for (const id in SKINS) {
        const sk = SKINS[id];
        const b = document.createElement("button");
        b.className = "skin"; b.type = "button"; b.dataset.id = id; b.dataset.cat = sk.cat || "classic";
        // превью — картинка, а не canvas: содержимое canvas стирается при сбросе GPU (Android) и в фоне,
        // а карточки рисуются один раз — иконки «пропадали» через время
        const cv = document.createElement("img"); cv.alt = ""; cv.width = 200; cv.height = 200; cv.decoding = "async";
        const label = document.createElement("b"); label.textContent = sk.name;
        const sub = document.createElement("small"); sub.textContent = sk.from || "";
        b.append(cv, label, sub);
        this._drawSkin(cv, id);
        b.addEventListener("click", () => {
          g.settings.set("skin", id);
          g.player.setSkin(id);
          this._skinMark();
          this.sfx("uiClick");
        });
        b.addEventListener("pointerenter", () => this.sfx("uiMove"));
        list.appendChild(b);
        this._skinCards[id] = b;
      }
      const cats = [{ id: "all", name: "Все" }].concat(SKIN_CATS);
      for (const c of cats) {
        const n = c.id === "all" ? Object.keys(SKINS).length : Object.values(SKINS).filter(s => s.cat === c.id).length;
        if (!n) continue;
        const t = document.createElement("button");
        t.type = "button"; t.setAttribute("role", "tab"); t.dataset.cat = c.id;
        t.innerHTML = ""; t.append(c.name); const cnt = document.createElement("i"); cnt.textContent = n; t.append(cnt);
        t.addEventListener("click", () => { this._skinCat(c.id); this.sfx("uiMove"); });
        tabs.appendChild(t);
      }
    }
    // при входе открывается категория выбранного скина
    const cur = SKINS[g.settings.v.skin];
    this._skinCat(cur && cur.cat ? cur.cat : "all");
    this._skinMark();
    const sel = this._skinCards[g.settings.v.skin];
    if (sel && !sel.hidden && sel.scrollIntoView) sel.scrollIntoView({ block: "nearest" });
  }
  _skinCat(cat) {
    this.skinCat = cat;
    for (const id in this._skinCards) { const b = this._skinCards[id]; b.hidden = cat !== "all" && b.dataset.cat !== cat; }
    $("skin-cats").querySelectorAll("button").forEach(t => t.setAttribute("aria-selected", String(t.dataset.cat === cat)));
  }
  _skinMark() {
    const cur = this.game.settings.v.skin;
    for (const id in this._skinCards) this._skinCards[id].setAttribute("aria-pressed", String(id === cur));
  }
  _drawSkin(img, id) {
    const cv = this._skinCv || (this._skinCv = document.createElement("canvas"));
    cv.width = 200; cv.height = 200;                       // сброс холста перед каждым скином
    const c = cv.getContext("2d"), sk = SKINS[id];
    const gr = c.createLinearGradient(0, 0, 0, cv.height);
    gr.addColorStop(0, "#0d0e14"); gr.addColorStop(1, mixHex("#0d0e14", sk.accent, 0.15));
    c.fillStyle = gr; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = rgba(sk.accent, 0.6); c.fillRect(0, cv.height * 0.82, cv.width, 1.5);
    const ch = { kind: "player", skin: sk, x: cv.width / 2, y: cv.height * 0.82, facing: 1, scale: 3.4, anim: new AnimState(), scarfColor: null, weapon: "dagger", eyeBoost: 0.3, flash: 0, groundY: cv.height * 0.82, vx: 0, vy: 0 };
    Object.assign(ch.anim.pose, { armF: 0.5, elbowF: 0.5, lean: 0.05 });
    CharacterRenderer.draw(c, ch);
    try { img.src = cv.toDataURL("image/png"); } catch (e) { img.removeAttribute("src"); }
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
    const hn = $("res-hint");
    hn.textContent = stats.hint || ""; hn.hidden = !stats.hint;
    this.show("results");
  }
}
