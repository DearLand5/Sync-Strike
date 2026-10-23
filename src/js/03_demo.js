/* =====================================================================
   DemoTrack — встроенный синтезированный трек. Нужен для обучения,
   для боя без загруженного файла и как эталон для проверки анализатора:
   положение каждой доли в нём известно точно.
   ===================================================================== */
const DemoTrack = {
  BPM: 116,
  OFFSET: 0.25,   // время первой доли, с
  name: "Демо — «Неоновая тень» (116 BPM)",

  /** Возвращает AudioBuffer. Секции: интро, разгон, дроп, брейк, дроп, финал. */
  generate(ctx) {
    const sr = ctx.sampleRate;
    const beat = 60 / this.BPM;
    const plan = [
      // [тактов, kick, snare, hats, bass, pad]
      [4, 0, 0, 1, 0, 1],
      [8, 1, 0, 1, 0, 1],
      [16, 1, 1, 2, 1, 0.6],
      [8, 0, 0, 1, 0, 1],
      [16, 1, 1, 2, 1, 0.6],
      [4, 1, 0, 1, 1, 1],
    ];
    const bars = plan.reduce((a, p) => a + p[0], 0);
    const total = this.OFFSET + bars * 4 * beat + 2.0;
    const n = Math.ceil(total * sr);
    const out = new Float32Array(n);
    const rnd = mulberry32(7);
    const noise = new Float32Array(sr);
    for (let i = 0; i < sr; i++) noise[i] = rnd() * 2 - 1;

    const addKick = t0 => {
      const s0 = Math.floor(t0 * sr), len = Math.floor(0.34 * sr);
      let ph = 0;
      for (let i = 0; i < len && s0 + i < n; i++) {
        const t = i / sr, f = 46 + 95 * Math.exp(-t * 30);
        ph += TAU * f / sr;
        out[s0 + i] += Math.sin(ph) * Math.exp(-t * 8) * 0.85 + (i < 60 ? noise[i] * 0.25 * (1 - i / 60) : 0);
      }
    };
    const addSnare = t0 => {
      const s0 = Math.floor(t0 * sr), len = Math.floor(0.22 * sr);
      let prev = 0;
      for (let i = 0; i < len && s0 + i < n; i++) {
        const t = i / sr, x = noise[(i * 3) % sr];
        const hp = x - prev; prev = x;
        out[s0 + i] += hp * Math.exp(-t * 16) * 0.32 + Math.sin(TAU * 188 * t) * Math.exp(-t * 22) * 0.35;
      }
    };
    const addHat = (t0, open, vol) => {
      const s0 = Math.floor(t0 * sr), len = Math.floor((open ? 0.2 : 0.05) * sr), k = open ? 14 : 70;
      let prev = 0;
      for (let i = 0; i < len && s0 + i < n; i++) {
        const t = i / sr, x = noise[(i * 7 + 1000) % sr];
        const hp = x - prev; prev = x;
        out[s0 + i] += hp * Math.exp(-t * k) * vol;
      }
    };
    const addBass = (t0, f, dur) => {
      const s0 = Math.floor(t0 * sr), len = Math.floor(dur * sr);
      for (let i = 0; i < len && s0 + i < n; i++) {
        const t = i / sr, env = Math.min(1, t * 200) * Math.exp(-t * 5);
        const w = TAU * f * t;
        out[s0 + i] += (Math.sin(w) + 0.5 * Math.sin(2 * w) + 0.25 * Math.sin(3 * w)) * env * 0.22;
      }
    };
    const addPad = (t0, freqs, dur, vol) => {
      const s0 = Math.floor(t0 * sr), len = Math.floor(dur * sr);
      for (let i = 0; i < len && s0 + i < n; i++) {
        const t = i / sr, env = Math.min(1, t / 0.4) * Math.min(1, (dur - t) / 0.3);
        let v = 0;
        for (const f of freqs) v += Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2.005 * t);
        out[s0 + i] += v * env * vol;
      }
    };

    // Am – F – C – G
    const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [130.8, 164.8, 196], [196, 246.9, 293.7]];
    const roots = [55, 43.65, 65.4, 49];
    let bar = 0;
    for (const [len, kick, snare, hats, bass, pad] of plan) {
      for (let b = 0; b < len; b++, bar++) {
        const tb = this.OFFSET + bar * 4 * beat;
        const ci = bar % 4;
        if (pad) addPad(tb, chords[ci], 4 * beat, 0.022 * pad);
        for (let q = 0; q < 4; q++) {
          const t = tb + q * beat;
          if (kick) addKick(t);
          if (snare && (q === 1 || q === 3)) addSnare(t);
          if (hats) {
            addHat(t + beat / 2, hats === 2 && q === 3, 0.16);
            if (hats === 2) { addHat(t, false, 0.08); addHat(t + beat * 0.75, false, 0.06); }
          }
          if (bass) addBass(t + beat / 2, roots[ci] * (q === 2 ? 2 : 1), beat * 0.45);
        }
      }
    }
    // мягкое ограничение
    for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i] * 1.1) * 0.85;
    const buf = ctx.createBuffer(2, n, sr);
    buf.getChannelData(0).set(out);
    buf.getChannelData(1).set(out);
    return buf;
  },

  /** Эталонные доли для проверки анализатора. */
  truthBeats() {
    const beat = 60 / this.BPM, res = [];
    for (let i = 0; i < 56 * 4; i++) res.push(this.OFFSET + i * beat);
    return res;
  }
};
