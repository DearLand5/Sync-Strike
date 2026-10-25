/* =====================================================================
   AudioManager — AudioContext, шины громкости, воспроизведение трека.
   Время трека всегда считается от аудиочасов, поэтому пауза и перемотка
   не накапливают рассинхронизацию.
   ===================================================================== */
class AudioManager extends Emitter {
  constructor(settings) {
    super();
    this.settings = settings;
    this.ctx = null;
    this.buffer = null;
    this.meta = null;          // { name, key, isDemo }
    this.source = null;
    this.playing = false;
    this.pausedAt = 0;
    this.startCtx = 0;
    this.startOffset = 0;
    this._lastHeard = 0;
    this.sfx = null;
    settings.on("change", k => { if (/Vol$/.test(k)) this.applyVolumes(); });
  }

  /** Создаёт контекст при первом действии пользователя. */
  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { this.ctx = new AC({ latencyHint: "interactive" }); }
    catch (e) { this.ctx = new AC(); }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.musicGain = c.createGain(); this.musicGain.connect(this.master);
    // эффекты идут через мягкий компрессор, чтобы пачка ударов не перегружала выход
    this.sfxComp = c.createDynamicsCompressor();
    this.sfxComp.threshold.value = -18; this.sfxComp.ratio.value = 4;
    this.sfxComp.attack.value = 0.003; this.sfxComp.release.value = 0.15;
    this.sfxComp.connect(this.master);
    this.sfxGain = c.createGain(); this.sfxGain.connect(this.sfxComp);
    this.uiGain = c.createGain(); this.uiGain.connect(this.master);
    // анализатор подключён до регулятора громкости — анализ не зависит от громкости
    this.analyser = c.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.35;
    this.applyVolumes();
    this.sfx = new SFX(this);
    return c;
  }

  /** Разблокировка звука на iOS/Android: вызывать внутри обработчика жеста. */
  unlock() {
    const c = this.ensure();
    if (!c) return;
    if (c.state !== "running") c.resume().catch(() => {});
    if (!this._unlocked) {
      this._unlocked = true;
      try {
        const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource();
        s.buffer = b; s.connect(c.destination); s.start(0);
      } catch (e) { /* ignore */ }
    }
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings.v, t = this.ctx.currentTime;
    this.musicGain.gain.setTargetAtTime(s.musicVol * s.musicVol, t, 0.02);
    this.sfxGain.gain.setTargetAtTime(s.sfxVol * s.sfxVol * 0.9, t, 0.02);
    this.uiGain.gain.setTargetAtTime(s.uiVol * s.uiVol * 0.8, t, 0.02);
  }

  /** decodeAudioData с поддержкой старого Safari (callback-форма). */
  decode(arrayBuffer) {
    const c = this.ensure();
    return new Promise((resolve, reject) => {
      let done = false;
      const ok = b => { if (!done) { done = true; resolve(b); } };
      const fail = e => { if (!done) { done = true; reject(e || new Error("decode failed")); } };
      try {
        const p = c.decodeAudioData(arrayBuffer, ok, fail);
        if (p && p.then) p.then(ok, fail);
      } catch (e) { fail(e); }
    });
  }

  setTrack(buffer, meta) {
    this.stopSource();
    this.playing = false;
    this.buffer = buffer;
    this.meta = meta;
    this.pausedAt = 0;
    this._lastHeard = 0;
    this.emit("track", meta);
  }

  get duration() { return this.buffer ? this.buffer.duration : 0; }

  play(at) {
    if (!this.buffer) return;
    const c = this.ensure();
    this.unlock();
    this.stopSource();
    const dur = this.buffer.duration;
    const offset = clamp(at == null ? this.pausedAt : at, 0, Math.max(0, dur - 0.02));
    const src = c.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.musicGain);
    src.connect(this.analyser);
    const when = c.currentTime + 0.04;
    src.start(when, offset);
    this.startCtx = when;
    this.startOffset = offset;
    this._lastHeard = offset;
    src.onended = () => {
      if (this.source !== src) return;           // остановлен вручную
      this.source = null;
      this.playing = false;
      this.pausedAt = 0;
      this.emit("ended");
    };
    this.source = src;
    this.playing = true;
    this.emit("play");
  }

  pause() {
    if (!this.playing) return;
    this.pausedAt = clamp(this.rawPosition(), 0, this.duration);
    this.stopSource();
    this.playing = false;
    this.emit("pause");
  }

  toggle() { this.playing ? this.pause() : this.play(); }

  seek(t) {
    const was = this.playing;
    this.pausedAt = clamp(t, 0, this.duration);
    this._lastHeard = this.pausedAt;
    if (was) this.play(this.pausedAt);
    this.emit("seek");
  }

  stopSource() {
    if (!this.source) return;
    const s = this.source;
    this.source = null;
    s.onended = null;
    try { s.stop(); } catch (e) { /* уже остановлен */ }
    try { s.disconnect(); } catch (e) { /* ignore */ }
  }

  /** Позиция, которую сейчас обрабатывает аудиограф (без задержки вывода). */
  rawPosition() {
    if (!this.playing || !this.ctx) return this.pausedAt;
    return this.startOffset + (this.ctx.currentTime - this.startCtx);
  }

  outputLatency() {
    const c = this.ctx;
    if (!c) return 0;
    const ol = typeof c.outputLatency === "number" ? c.outputLatency : 0;
    return ol > 0 ? ol : (c.baseLatency || 0);
  }

  /** Позиция трека, которую пользователь слышит прямо сейчас. */
  heardPosition() {
    if (!this.playing || !this.ctx) return this.pausedAt;
    const c = this.ctx;
    const fallback = c.currentTime - this.outputLatency();
    let ctxNow = fallback;
    if (c.getOutputTimestamp) {
      const ts = c.getOutputTimestamp();
      if (ts && ts.performanceTime > 0 && ts.contextTime > 0) {
        const est = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
        if (Math.abs(est - fallback) < 0.35) ctxNow = est;
      }
    }
    let pos = this.startOffset + (ctxNow - this.startCtx);
    // гасим мелкий дребезг часов: время не идёт назад меньше чем на 40 мс
    if (pos < this._lastHeard && this._lastHeard - pos < 0.04) pos = this._lastHeard;
    this._lastHeard = pos;
    return pos;
  }

  /** Музыкальное время для игровой логики: слышимая позиция минус калибровка. */
  songTime() { return this.heardPosition() - this.settings.v.latencyMs / 1000; }

  /** Время аудиоконтекста, когда звук, запущенный в нём, прозвучит вместе с музыкой в момент songT
   *  (звук эффекта смешивается с той же позицией трека — задержка вывода у обоих одна). null — «сейчас». */
  ctxTimeAt(songT) {
    if (!this.playing || !this.ctx) return null;
    const c = this.ctx;
    const t = this.startCtx + (songT + this.settings.v.latencyMs / 1000 - this.startOffset);
    return t > c.currentTime + 0.003 && t < c.currentTime + 0.5 ? t : null;
  }

  /** Перевод отметки времени события (performance.now) в музыкальное время. */
  songTimeAt(eventStamp) {
    const now = this.songTime();
    if (!this.playing || !eventStamp) return now;
    const ago = (performance.now() - eventStamp) / 1000;
    return now - clamp(ago, 0, 0.2);
  }

  suspend() { if (this.ctx && this.ctx.state === "running") this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state !== "running") this.ctx.resume().catch(() => {}); }
}

/* =====================================================================
   SFX — синтезированные звуки. Каждый вызов создаёт короткоживущие узлы,
   которые сами отключаются по onended. Число голосов ограничено.
   ===================================================================== */
class SFX {
  constructor(audio) {
    this.audio = audio;
    this.ctx = audio.ctx;
    this.voices = 0;
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._last = {};
    this.when = null;          // время аудиоконтекста для звуков «в долю» (Game.sfxAt), иначе — сейчас
    this.samples = {};      // имя события → [AudioBuffer]
    this._lastIdx = {};
    this.loadSamples();
  }
  /** Декодирует встроенные записанные звуки (Kenney.nl, CC0) из SOUND_DATA. Пока не готовы — играет синтез. */
  async loadSamples() {
    if (typeof SOUND_DATA === "undefined") return;
    const decodeOne = async b64 => {
      try {
        const bin = atob(b64), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return await this.audio.decode(bytes.buffer);
      } catch (e) { return null; }          // битый файл — для события останется синтез
    };
    // все звуки декодируются параллельно
    await Promise.all(Object.keys(SOUND_DATA).map(async name => {
      const list = (await Promise.all(SOUND_DATA[name].map(decodeOne))).filter(Boolean);
      if (list.length) this.samples[name] = list;
    }));
  }
  get useSamples() { return this.audio.settings.v.sfxStyle !== "synth"; }
  /** Записанный звук события. Возвращает false, если сэмпла нет (тогда вызывающий играет синтез). */
  sample(name, o = {}) {
    if (!this.useSamples) return false;
    const list = this.samples[name];
    if (!list || !list.length) return false;
    if (!this.can()) return true;
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === this._lastIdx[name]) i = (i + 1) % list.length;   // без повтора подряд
    this._lastIdx[name] = i;
    const c = this.ctx, t = o.at != null ? o.at : (this.when != null ? this.when : c.currentTime) + (o.delay || 0);
    const src = c.createBufferSource(), g = c.createGain();
    src.buffer = list[i];
    src.playbackRate.value = (o.rate || 1) * this.v(o.vary == null ? 0.06 : o.vary);
    g.gain.value = o.vol == null ? 0.5 : o.vol;
    src.connect(g); g.connect(o.bus || this.bus);
    src.start(t);
    this._track(src, [src, g]);
    return true;
  }
  get bus() { return this.audio.sfxGain; }
  get ui() { return this.audio.uiGain; }
  can(limit = 28) { return this.ctx.state === "running" && this.voices < limit; }
  v(x = 0.08) { return 1 + (Math.random() * 2 - 1) * x; }
  /** не даём одному звуку звучать чаще, чем раз в minGap секунд */
  gate(name, minGap) {
    const t = this.ctx.currentTime;
    if (this._last[name] && t - this._last[name] < minGap) return false;
    this._last[name] = t;
    return true;
  }
  _track(src, nodes) {
    this.voices++;
    src.onended = () => { this.voices--; for (const n of nodes) { try { n.disconnect(); } catch (e) {} } };
  }
  _env(g, t, vol, a, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  tone(o) {
    if (!this.can()) return;
    const c = this.ctx, t = o.at != null ? o.at : (this.when != null ? this.when : c.currentTime) + (o.delay || 0);
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + o.dur);
    this._env(g, t, o.vol, o.a || 0.004, o.dur);
    const nodes = [osc, g];
    osc.connect(g);
    let last = g;
    if (o.lp) { const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = o.lp; g.connect(f); last = f; nodes.push(f); }
    last.connect(o.bus || this.bus);
    osc.start(t); osc.stop(t + o.dur + 0.03);
    this._track(osc, nodes);
  }
  noiseBurst(o) {
    if (!this.can()) return;
    const c = this.ctx, t = o.at != null ? o.at : (this.when != null ? this.when : c.currentTime) + (o.delay || 0);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise;
    f.type = o.ft || "bandpass";
    f.frequency.setValueAtTime(o.f || 1000, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    f.Q.value = o.q || 1;
    this._env(g, t, o.vol, o.a || 0.003, o.dur);
    src.connect(f); f.connect(g); g.connect(o.bus || this.bus);
    src.start(t, Math.random() * 0.5, o.dur + 0.05);
    this._track(src, [src, f, g]);
  }

  /* ---- боевые звуки: записанный звук, иначе синтез ---- */
  draw() { if (this.sample("draw", { vol: 0.3 })) return; const p = this.v(); this.noiseBurst({ ft: "highpass", f: 3000 * p, f2: 7000, dur: 0.16, vol: 0.18 }); this.tone({ type: "triangle", f: 1900 * p, f2: 2600, dur: 0.12, vol: 0.04 }); }
  dash() {
    if (!this.gate("dash", 0.05)) return;
    if (this.sample("dash", { vol: 0.28, rate: 1.1 })) return;
    const p = this.v(); this.noiseBurst({ f: 380 * p, f2: 2600 * p, dur: 0.22, vol: 0.32, q: 1.4 });
  }
  slash(power = 1) {
    if (this.sample("slash", { vol: 0.32 + 0.06 * power, rate: 1.15 - 0.1 * power, vary: 0.08 })) return;
    const p = this.v(0.1);
    this.noiseBurst({ f: 2200 * p, f2: 650, dur: 0.12 + power * 0.03, vol: 0.26, q: 1.6 });
    this.tone({ type: "sawtooth", f: 950 * p, f2: 280, dur: 0.07, vol: 0.035, lp: 3000 });
  }
  hit(strength = 1, perfect = false) {
    if (!this.gate("hit", 0.025)) return;
    const p = this.v();
    const heavy = strength > 1.1;
    if (this.sample(heavy ? "hitHeavy" : "hit", { vol: heavy ? 0.6 : 0.5 })) {
      this.tone({ f: 150 * p, f2: 45, dur: 0.14, vol: 0.22 * Math.min(1.3, strength) });     // низ для веса удара
    } else {
      this.tone({ f: 170 * p, f2: 50, dur: 0.16 + 0.06 * strength, vol: 0.45 * Math.min(1.3, strength) });
      this.noiseBurst({ ft: "lowpass", f: 2600, dur: 0.08, vol: 0.3 * strength });
      this.tone({ type: "square", f: 540 * p, f2: 260, dur: 0.05, vol: 0.06, lp: 2500 });
    }
    if (perfect) this.tone({ type: "triangle", f: 1760 * p, f2: 1320, dur: 0.22, vol: 0.06, delay: 0.01 });
  }
  shot(charged = false) {
    if (this.sample(charged ? "shotCharged" : "shot", { vol: charged ? 0.45 : 0.32 })) { this.tone({ f: 95, f2: 40, dur: 0.08, vol: charged ? 0.3 : 0.16 }); return; }
    const p = this.v();
    this.tone({ type: "square", f: (charged ? 900 : 1300) * p, f2: 170, dur: charged ? 0.2 : 0.11, vol: 0.12, lp: 4200 });
    this.noiseBurst({ f: 3200, dur: 0.06, vol: 0.22, q: 0.8 });
    this.tone({ f: 95, f2: 40, dur: 0.1, vol: charged ? 0.4 : 0.25 });
  }
  bulletHit() { if (!this.gate("bh", 0.03)) return; if (this.sample("bulletHit", { vol: 0.28, vary: 0.1 })) return; this.noiseBurst({ f: 2600 * this.v(), dur: 0.07, vol: 0.18 }); this.tone({ type: "triangle", f: 720, f2: 380, dur: 0.06, vol: 0.06 }); }
  enemyShot() { if (this.sample("enemyShot", { vol: 0.28, rate: 0.85 })) return; this.tone({ type: "sawtooth", f: 640 * this.v(), f2: 120, dur: 0.18, vol: 0.09, lp: 1800 }); this.noiseBurst({ f: 1500, dur: 0.07, vol: 0.14 }); }
  telegraph(high = false) {
    if (!this.gate("tel", 0.12)) return;
    if (this.sample("telegraph", { vol: 0.3, rate: high ? 0.8 : 1.15, vary: 0.02 })) return;
    this.tone({ f: high ? 1320 : 880, dur: 0.09, vol: 0.05 }); this.tone({ f: high ? 1760 : 1175, dur: 0.08, vol: 0.04, delay: 0.06 });
  }
  enemySwing() { if (this.sample("slash", { vol: 0.24, rate: 0.75 })) return; this.noiseBurst({ f: 900 * this.v(), f2: 300, dur: 0.14, vol: 0.18, q: 1.2 }); }
  jump(double = false) { const p = this.v(0.05); this.tone({ f: (double ? 420 : 300) * p, f2: (double ? 980 : 620) * p, dur: 0.1, vol: 0.1 }); if (double) this.noiseBurst({ ft: "highpass", f: 4000, dur: 0.1, vol: 0.08 }); }
  land(h = 1) { if (!this.gate("land", 0.08)) return; if (this.sample("land", { vol: 0.42 * h })) return; this.noiseBurst({ ft: "lowpass", f: 420, dur: 0.08, vol: 0.22 * h }); this.tone({ f: 120, f2: 60, dur: 0.07, vol: 0.12 * h }); }
  step() { if (!this.gate("step", 0.12)) return; if (this.sample("step", { vol: 0.16, vary: 0.12 })) return; this.noiseBurst({ ft: "lowpass", f: 700 * this.v(0.2), dur: 0.035, vol: 0.05 }); }
  hurt() {
    if (this.sample("hurt", { vol: 0.6 })) { this.tone({ type: "sawtooth", f: 300, f2: 90, dur: 0.22, vol: 0.1, lp: 1100 }); return; }
    this.tone({ type: "sawtooth", f: 320, f2: 85, dur: 0.26, vol: 0.18, lp: 1300 }); this.noiseBurst({ ft: "lowpass", f: 1500, dur: 0.14, vol: 0.22 });
  }
  dodge() { if (this.sample("dash", { vol: 0.2, rate: 1.4 })) return; this.noiseBurst({ ft: "highpass", f: 1400 * this.v(), f2: 4200, dur: 0.15, vol: 0.16 }); }
  spawn() { if (!this.gate("spawn", 0.1)) return; if (this.sample("spawn", { vol: 0.22 })) return; this.tone({ f: 180, f2: 900, dur: 0.45, vol: 0.06, a: 0.2 }); this.noiseBurst({ ft: "highpass", f: 800, f2: 5000, dur: 0.4, vol: 0.06, a: 0.25 }); }
  death() {
    if (this.sample("death", { vol: 0.4, vary: 0.1 })) { this.noiseBurst({ f: 1300, f2: 180, dur: 0.3, vol: 0.14 }); return; }
    this.noiseBurst({ f: 1300, f2: 180, dur: 0.38, vol: 0.26 });
    this.tone({ type: "triangle", f: 520 * this.v(), f2: 80, dur: 0.34, vol: 0.1 });
    for (let i = 0; i < 3; i++) this.tone({ f: rand(2200, 4200), dur: 0.08, vol: 0.03, delay: 0.04 + i * 0.05 });
  }
  slam() { if (this.sample("slam", { vol: 0.7, vary: 0.04 })) return; this.tone({ f: 95, f2: 32, dur: 0.5, vol: 0.55 }); this.noiseBurst({ ft: "lowpass", f: 800, f2: 200, dur: 0.4, vol: 0.38 }); }
  // Perfect и метроном остаются синтезированными: точная высота и тайминг важнее «живого» тембра
  perfect() { const b = 880 * this.v(0.02); this.tone({ type: "triangle", f: b, dur: 0.16, vol: 0.07 }); this.tone({ type: "triangle", f: b * 1.26, dur: 0.2, vol: 0.06, delay: 0.035 }); }
  /** Удар «в долю»: короткая плотная бочка под ударом/выстрелом — ставится ровно на долю музыки (Game.sfxAt). */
  beatHit(power = 1) {
    if (!this.gate("beatHit", 0.08)) return;
    const p = this.v(0.03);
    this.tone({ f: 150 * p, f2: 46, dur: 0.12, vol: 0.26 * power, a: 0.002 });
    this.noiseBurst({ ft: "highpass", f: 2400, dur: 0.025, vol: 0.07 * power });
  }
  combo(level) {
    if (this.sample("combo", { vol: 0.32, rate: 1 + 0.05 * clamp(level, 1, 5), vary: 0 })) return;
    const scale = [0, 3, 5, 7, 10, 12, 15];
    const n = clamp(level, 1, 5);
    for (let i = 0; i < n; i++) this.tone({ type: "triangle", f: 523 * Math.pow(2, scale[i] / 12), dur: 0.12, vol: 0.05, delay: i * 0.045 });
  }
  slowmo() { if (this.sample("slowmo", { vol: 0.3, vary: 0.03 })) return; this.tone({ f: 600, f2: 150, dur: 0.5, vol: 0.08, a: 0.02 }); this.noiseBurst({ ft: "lowpass", f: 1200, f2: 300, dur: 0.45, vol: 0.12 }); }
  waveStart() { if (this.sample("waveStart", { vol: 0.32, vary: 0 })) return; this.tone({ f: 110, f2: 220, dur: 0.7, vol: 0.12, a: 0.3 }); this.tone({ type: "triangle", f: 440, dur: 0.4, vol: 0.04, delay: 0.3 }); }
  heal() { if (this.sample("heal", { vol: 0.28, vary: 0 })) return; this.tone({ type: "triangle", f: 660, f2: 990, dur: 0.3, vol: 0.06 }); }

  /* ---- интерфейс ---- */
  uiMove()  { if (!this.gate("uim", 0.04)) return; if (this.sample("uiMove", { vol: 0.25, bus: this.ui })) return; this.tone({ f: 660, dur: 0.04, vol: 0.05, bus: this.ui }); }
  uiClick() { if (this.sample("uiClick", { vol: 0.4, bus: this.ui })) return; this.tone({ type: "triangle", f: 520, f2: 780, dur: 0.07, vol: 0.08, bus: this.ui }); }
  uiBack()  { if (this.sample("uiBack", { vol: 0.4, bus: this.ui })) return; this.tone({ type: "triangle", f: 600, f2: 380, dur: 0.07, vol: 0.07, bus: this.ui }); }
  victory() { if (this.sample("victory", { vol: 0.42, bus: this.ui, vary: 0 })) return; [0, 4, 7, 12, 16].forEach((s, i) => this.tone({ type: "triangle", f: 392 * Math.pow(2, s / 12), dur: 0.35, vol: 0.08, delay: i * 0.11, bus: this.ui })); }
  defeat()  { if (this.sample("defeat", { vol: 0.42, bus: this.ui, vary: 0 })) return; [0, -3, -7, -12].forEach((s, i) => this.tone({ type: "sawtooth", f: 330 * Math.pow(2, s / 12), dur: 0.4, vol: 0.06, lp: 1200, delay: i * 0.16, bus: this.ui })); }
  /** щелчок метронома на точное время аудиоконтекста */
  click(at, accent) { this.tone({ f: accent ? 1600 : 1050, dur: 0.035, vol: accent ? 0.35 : 0.22, at, bus: this.ui }); }
}
