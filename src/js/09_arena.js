/* =====================================================================
   ArenaRenderer — арены, которые реагируют на музыку.
   Статичные слои параллакса пререндерятся в offscreen-канвасы (тайлы),
   музыкальные элементы рисуются каждый кадр поверх.
   Подбор арены — по признакам сигнала трека (не по жанру).
   ===================================================================== */

/* ---------- помощники рисования тайлов ---------- */
function wrapDraw(w, x, width, fn) { fn(x); if (x + width > w) fn(x - w); if (x < 0) fn(x + w); }

function paintSkyline(c, w, h, rng, o) {
  let x = rng() * 40;
  while (x < w) {
    const bw = lerp(o.minW, o.maxW, rng()), bh = lerp(o.minH, o.maxH, Math.pow(rng(), 1.3));
    wrapDraw(w, x, bw, xx => {
      c.fillStyle = o.color;
      c.fillRect(xx, h - bh, bw, bh);
      if (o.roof && rng() < 0.35) { c.fillRect(xx + bw * 0.3, h - bh - 8, bw * 0.4, 8); }
      if (o.antenna && rng() < 0.4) { c.fillRect(xx + bw * 0.5, h - bh - 26, 2, 26); }
      if (o.windows) {
        for (let wy = h - bh + 6; wy < h - 6; wy += 7) for (let wx = xx + 4; wx < xx + bw - 4; wx += 6) {
          if (rng() < o.windows.p) { c.fillStyle = rng() < 0.5 ? o.windows.a : o.windows.b; c.fillRect(wx, wy, 2.5, 3); }
        }
      }
    });
    x += bw + lerp(o.gapMin || 2, o.gapMax || 14, rng());
  }
}
function paintMountains(c, w, h, rng, color, amp, base) {
  c.fillStyle = color; c.beginPath(); c.moveTo(0, h);
  const pts = 14;
  const ys = []; for (let i = 0; i <= pts; i++) ys.push(h - base - rng() * amp);
  ys[pts] = ys[0];
  for (let i = 0; i <= pts; i++) c.lineTo((i / pts) * w, ys[i]);
  c.lineTo(w, h); c.closePath(); c.fill();
}

/* ---------- темы ---------- */
const THEMES = [
  {
    id: "city", name: "Неоновый город", desc: "электроника, средний и высокий темп",
    pal: { sky: ["#04050b", "#170b2c"], glow: "#ff2e88", neonA: "#3ef0ff", neonB: "#ff2e88", floor: "#07070d", edge: "#3ef0ff", fog: "#1a1030" },
    profile: { bpm: [120, 25], density: [3.5, 2.5], high: [0.18, 0.12], perc: [0.5, 0.25], loudness: [0.6, 0.35] },
    layers: [
      { f: 0.12, y: 0, paint(c, w, h, rng) { paintSkyline(c, w, h, rng, { minW: 26, maxW: 60, minH: h * 0.25, maxH: h * 0.6, color: "#0c0d1b", windows: { p: 0.08, a: "rgba(62,240,255,.25)", b: "rgba(255,46,136,.2)" } }); } },
      { f: 0.32, y: 0, paint(c, w, h, rng) { paintSkyline(c, w, h, rng, { minW: 40, maxW: 90, minH: h * 0.2, maxH: h * 0.5, color: "#07070e", roof: true, antenna: true, gapMin: 10, gapMax: 40, windows: { p: 0.05, a: "rgba(62,240,255,.45)", b: "rgba(255,177,59,.3)" } }); } },
    ],
    build(rng, tileW, h) {
      this.signs = [];
      for (let i = 0; i < 7; i++) this.signs.push({ x: rng() * tileW, y: h * lerp(0.66, 0.88, rng()), w: lerp(18, 46, rng()), hh: lerp(8, 16, rng()), c: rng() < 0.5 ? 0 : 1, v: rng() < 0.4 });
    },
    back(c, v, m, pal) {
      const mx = v.w * 0.72, my = v.floorY * 0.28, r = Math.min(v.w, v.h) * 0.07;
      const g = c.createRadialGradient(mx, my, r * 0.5, mx, my, r * 4);
      g.addColorStop(0, rgba("#ff2e88", 0.16 + 0.12 * m.strong)); g.addColorStop(1, "rgba(255,46,136,0)");
      c.fillStyle = g; c.fillRect(0, 0, v.w, v.floorY);
      c.fillStyle = rgba("#ffd6ec", 0.75); c.beginPath(); c.arc(mx, my, r, 0, TAU); c.fill();
      c.fillStyle = "rgba(4,5,11,.9)"; for (let i = 0; i < 4; i++) c.fillRect(mx - r, my + r * (0.1 + i * 0.22), r * 2, r * 0.07 * (i + 1));
    },
    mid(c, v, m, pal) {
      const off = v.layerOff(0.32);
      for (const s of this.signs) {
        const lit = (m.beat + Math.floor(s.x)) % 3 === 0 ? 1 : 0.35;
        const a = clamp((0.25 + 0.75 * lit * (0.5 + 0.5 * m.pulse)) * m.I, 0, 1);
        const col = s.c ? pal.neonB : pal.neonA;
        v.repeat(off, s.x, x => {
          const y = v.floorY - (v.tileH - s.y);
          c.strokeStyle = rgba(col, a); c.lineWidth = 1.5;
          if (s.v) { c.strokeRect(x, y - s.w, s.hh, s.w); for (let k = 4; k < s.w - 2; k += 6) c.fillStyle = rgba(col, a * 0.8), c.fillRect(x + 3, y - s.w + k, s.hh - 6, 2); }
          else { c.strokeRect(x, y, s.w, s.hh); c.fillStyle = rgba(col, a * 0.7); c.fillRect(x + 3, y + 3, (s.w - 6) * (0.4 + 0.6 * lit), s.hh - 6); }
        });
      }
    },
    front(c, v, m, pal, R) {
      // дождь — плотность растёт от верхних частот
      const n = Math.round((25 + m.high * 110 + m.I * 40) * R.amount);
      c.strokeStyle = rgba("#9fdcff", 0.18 + 0.12 * m.high); c.lineWidth = 1;
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (hash1(i) * v.w * 1.2 + m.time * 60 - v.camX * v.scale * 0.8) % (v.w * 1.2) - v.w * 0.1;
        const y = (hash1(i + 99) * v.h + m.time * (520 + hash1(i + 7) * 200)) % v.h;
        c.moveTo(x, y); c.lineTo(x - 3, y + 14);
      }
      c.stroke();
    },
  },
  {
    id: "void", name: "Цифровая бездна", desc: "агрессивная электроника, плотный бас",
    pal: { sky: ["#020207", "#0d0322"], glow: "#ff2e88", neonA: "#ff2e88", neonB: "#3ef0ff", floor: "#040309", edge: "#ff2e88", fog: "#1c0630" },
    profile: { bpm: [140, 25], density: [5, 2.2], low: [0.45, 0.2], loudness: [0.8, 0.25], dynamics: [0.3, 0.3] },
    layers: [],
    build(rng) { this.cubes = []; for (let i = 0; i < 7; i++) this.cubes.push({ x: rng(), y: lerp(0.15, 0.6, rng()), s: lerp(10, 30, rng()), sp: lerp(-1, 1, rng()) }); },
    back(c, v, m, pal) {
      const cx = v.w / 2 - v.camX * v.scale * 0.05, cy = v.floorY * 0.62;
      for (let i = 0; i < 6; i++) {
        const k = ((i + m.phase) / 6);
        const r = lerp(10, Math.max(v.w, v.h) * 0.75, k * k);
        c.strokeStyle = rgba(i % 2 ? pal.neonB : pal.neonA, (1 - k) * (0.25 + 0.35 * m.pulse) * m.I);
        c.lineWidth = 1 + 2 * (1 - k);
        c.beginPath();
        for (let j = 0; j <= 6; j++) { const a = j / 6 * TAU + m.time * 0.2 * (i % 2 ? 1 : -1); c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.55); }
        c.stroke();
      }
      for (const q of this.cubes) {
        const x = ((q.x * v.w * 1.5 - v.camX * v.scale * 0.15) % (v.w * 1.5) + v.w * 1.5) % (v.w * 1.5) - v.w * 0.25;
        const y = q.y * v.floorY + Math.sin(m.time + q.x * 9) * 8;
        const s = q.s * (1 + 0.25 * m.pulse), a = m.time * q.sp;
        c.strokeStyle = rgba(pal.neonB, 0.35 + 0.4 * m.strong); c.lineWidth = 1.2;
        c.beginPath();
        for (let j = 0; j < 4; j++) { const ang = a + j * Math.PI / 2; c.lineTo(x + Math.cos(ang) * s, y + Math.sin(ang) * s * 0.6); }
        c.closePath(); c.stroke();
        c.beginPath();
        for (let j = 0; j < 4; j++) { const ang = a + j * Math.PI / 2; c.lineTo(x + Math.cos(ang) * s, y + Math.sin(ang) * s * 0.6 - s); }
        c.closePath(); c.stroke();
      }
    },
    mid() {},
    floor(c, v, m, pal) {
      // перспективная сетка, сдвигается на каждую долю
      const hz = v.floorY, H = v.h;
      c.strokeStyle = rgba(pal.neonA, 0.18 + 0.25 * m.pulse * m.I); c.lineWidth = 1;
      c.beginPath();
      const ox = -(v.camX * v.scale) % 60;
      for (let i = -20; i <= 20; i++) { const x0 = v.w / 2 + i * 60 + ox; c.moveTo(x0, hz); c.lineTo(v.w / 2 + (x0 - v.w / 2) * 3.2, H); }
      for (let j = 0; j < 8; j++) { const z = (j + m.phase) / 8, y = hz + (H - hz) * z * z; c.moveTo(0, y); c.lineTo(v.w, y); }
      c.stroke();
    },
    front(c, v, m, pal, R) {
      if (R.flashes && m.strong > 0.85 && m.I > 0.6) { c.fillStyle = rgba(pal.neonA, 0.07 * m.strong); c.fillRect(0, 0, v.w, v.h); }
    },
  },
  {
    id: "foundry", name: "Литейный цех", desc: "рок и плотная середина спектра",
    pal: { sky: ["#070404", "#1f0d07"], glow: "#ff7a1a", neonA: "#ff7a1a", neonB: "#ff2d4a", floor: "#0a0605", edge: "#ff7a1a", fog: "#2a1208" },
    profile: { bpm: [130, 40], mid: [0.5, 0.18], perc: [0.5, 0.25], loudness: [0.7, 0.3], dynamics: [0.45, 0.3] },
    layers: [
      { f: 0.15, y: 0, paint(c, w, h, rng) {
        for (let x = rng() * 60; x < w; x += lerp(90, 180, rng())) {
          const cw = lerp(14, 26, rng()), ch = lerp(h * 0.4, h * 0.75, rng());
          wrapDraw(w, x, cw, xx => { c.fillStyle = "#120a08"; c.fillRect(xx, h - ch, cw, ch); c.fillRect(xx - 3, h - ch, cw + 6, 6); });
        }
        paintSkyline(c, w, h, rng, { minW: 50, maxW: 120, minH: h * 0.15, maxH: h * 0.3, color: "#0e0807", gapMin: 0, gapMax: 6 });
      } },
      { f: 0.4, y: 0, paint(c, w, h, rng) {
        c.strokeStyle = "#090505"; c.lineWidth = 5;
        const top = h * 0.3, bot = h * 0.45;
        c.beginPath(); c.moveTo(0, top); c.lineTo(w, top); c.moveTo(0, bot); c.lineTo(w, bot);
        for (let x = 0; x < w; x += 60) { c.moveTo(x, top); c.lineTo(x + 30, bot); c.lineTo(x + 60, top); }
        c.stroke();
        for (let x = 30; x < w; x += lerp(160, 260, rng())) { c.fillStyle = "#090505"; c.fillRect(x, bot, 10, h - bot); }
        // крюки крана
        c.lineWidth = 2;
        for (let x = 80; x < w; x += 300) { c.beginPath(); c.moveTo(x, bot); c.lineTo(x, bot + 60 + rng() * 40); c.stroke(); }
      } },
    ],
    build(rng, tileW, h) { this.furn = []; for (let i = 0; i < 4; i++) this.furn.push({ x: rng() * tileW, w: lerp(40, 80, rng()) }); },
    back(c, v, m, pal) {
      const g = c.createLinearGradient(0, v.floorY * 0.4, 0, v.floorY);
      g.addColorStop(0, "rgba(255,122,26,0)"); g.addColorStop(1, rgba("#ff7a1a", 0.12 + 0.18 * m.low * m.I));
      c.fillStyle = g; c.fillRect(0, 0, v.w, v.floorY);
    },
    mid(c, v, m, pal) {
      const off = v.layerOff(0.4);
      for (const f of this.furn) v.repeat(off, f.x, x => {
        const y = v.floorY;
        const glow = 0.35 + 0.65 * m.low;
        const g = c.createRadialGradient(x + f.w / 2, y, 4, x + f.w / 2, y, f.w * 1.6);
        g.addColorStop(0, rgba("#ffb13b", 0.5 * glow)); g.addColorStop(0.4, rgba("#ff7a1a", 0.25 * glow)); g.addColorStop(1, "rgba(255,122,26,0)");
        c.fillStyle = g; c.fillRect(x - f.w, y - f.w * 1.6, f.w * 3, f.w * 1.6);
        c.fillStyle = "#0b0605"; c.fillRect(x, y - f.w * 0.6, f.w, f.w * 0.6);
        c.fillStyle = rgba("#ffb13b", 0.6 * glow); c.fillRect(x + f.w * 0.2, y - f.w * 0.35, f.w * 0.6, f.w * 0.2);
      });
    },
    front(c, v, m, pal, R) {
      // искры с ферм на сильных долях
      if (m.strongEvent) for (let i = 0; i < Math.round(10 * R.amount); i++) R.amb.push({ x: rand(0, v.w), y: rand(0, v.floorY * 0.4), vx: rand(-40, 40), vy: rand(20, 120), life: rand(0.6, 1.4), c: rand() < 0.5 ? "#ffb13b" : "#ff7a1a" });
    },
  },
  {
    id: "moon", name: "Лунная крыша", desc: "спокойная музыка, мягкие ритмы",
    pal: { sky: ["#07080d", "#1b1a24"], glow: "#e8e2d6", neonA: "#3ef0ff", neonB: "#e8e2d6", floor: "#0a0a0e", edge: "#3ef0ff", fog: "#2a2a34" },
    profile: { loudness: [0.35, 0.3], density: [1.5, 1.6], bpm: [88, 30], dynamics: [0.6, 0.35] },
    layers: [
      { f: 0.1, y: 0, paint(c, w, h, rng) { paintSkyline(c, w, h, rng, { minW: 30, maxW: 70, minH: h * 0.12, maxH: h * 0.35, color: "#15151c", gapMin: 4, gapMax: 30 }); } },
      { f: 0.3, y: 0, paint(c, w, h, rng) {
        c.fillStyle = "#0c0c11";
        for (let x = 0; x < w; x += lerp(120, 220, rng())) {
          const rw = lerp(80, 160, rng()), rh = lerp(h * 0.12, h * 0.25, rng());
          wrapDraw(w, x, rw, xx => {
            c.beginPath(); c.moveTo(xx, h); c.lineTo(xx, h - rh); c.lineTo(xx + rw / 2, h - rh - 26); c.lineTo(xx + rw, h - rh); c.lineTo(xx + rw, h); c.fill();
            c.fillRect(xx + rw * 0.7, h - rh - 30, 8, 26);
          });
        }
      } },
    ],
    build(rng, tileW, h) { this.lamps = []; for (let i = 0; i < 5; i++) this.lamps.push({ x: rng() * tileW, y: h * lerp(0.55, 0.7, rng()), span: lerp(120, 220, rng()) }); },
    back(c, v, m, pal) {
      const mx = v.w * 0.62 - v.camX * v.scale * 0.03, my = v.floorY * 0.4, r = Math.min(v.w, v.h) * 0.22;
      const g = c.createRadialGradient(mx, my, r * 0.8, mx, my, r * 2.4);
      g.addColorStop(0, rgba("#e8e2d6", 0.1 + 0.08 * m.low)); g.addColorStop(1, "rgba(232,226,214,0)");
      c.fillStyle = g; c.fillRect(0, 0, v.w, v.floorY);
      c.fillStyle = rgba("#e8e2d6", 0.78 + 0.12 * m.low); c.beginPath(); c.arc(mx, my, r, 0, TAU); c.fill();
      c.fillStyle = "rgba(200,190,175,.25)";
      c.beginPath(); c.arc(mx - r * 0.3, my - r * 0.2, r * 0.18, 0, TAU); c.arc(mx + r * 0.25, my + r * 0.3, r * 0.12, 0, TAU); c.fill();
      // звёзды мерцают от верхов
      for (let i = 0; i < 40; i++) { c.fillStyle = rgba("#e8e2d6", 0.2 + 0.5 * hash1(i + Math.floor(m.time * 2 + i)) * m.high); c.fillRect(hash1(i) * v.w, hash1(i + 50) * v.floorY * 0.6, 1.5, 1.5); }
    },
    mid(c, v, m, pal) {
      const off = v.layerOff(0.3);
      for (let li = 0; li < this.lamps.length; li++) {
        const L = this.lamps[li];
        v.repeat(off, L.x, x => {
          const y = v.floorY - (v.tileH - L.y);
          c.strokeStyle = "rgba(10,10,14,.9)"; c.lineWidth = 1;
          c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + L.span / 2, y + 30, x + L.span, y); c.stroke();
          for (let k = 1; k < 8; k++) {
            const t = k / 8, bx = x + L.span * t, by = y + 60 * t * (1 - t);
            const lit = ((m.beat + k + li) % 8) / 8;
            c.fillStyle = rgba(k % 3 ? pal.neonA : "#ffb13b", (0.25 + 0.6 * (1 - lit) * m.pulse + 0.15) * m.I);
            c.beginPath(); c.arc(bx, by + 3, 2, 0, TAU); c.fill();
          }
        });
      }
    },
    front(c, v, m, pal) {
      // туман густеет с энергией
      for (let i = 0; i < 3; i++) {
        const x = ((m.time * (10 + i * 6) + i * 400 - v.camX * v.scale * (0.5 + i * 0.2)) % (v.w + 600)) - 300;
        const y = v.floorY - 20 + i * 18;
        const g = c.createRadialGradient(x, y, 10, x, y, 260);
        g.addColorStop(0, rgba("#9a98a6", 0.08 + 0.1 * m.I)); g.addColorStop(1, "rgba(154,152,166,0)");
        c.fillStyle = g; c.fillRect(x - 260, y - 140, 520, 280);
      }
    },
  },
  {
    id: "temple", name: "Храм в тумане", desc: "эмбиент и редкие события",
    pal: { sky: ["#0a0c10", "#1d2229"], glow: "#ff5fb0", neonA: "#ff5fb0", neonB: "#ffb13b", floor: "#0b0d10", edge: "#ff5fb0", fog: "#3a4048" },
    profile: { loudness: [0.25, 0.3], density: [0.9, 1.2], high: [0.08, 0.1], perc: [0.3, 0.25] },
    layers: [
      { f: 0.06, y: 0, paint(c, w, h, rng) { paintMountains(c, w, h, rng, "#20252d", h * 0.35, h * 0.25); } },
      { f: 0.16, y: 0, paint(c, w, h, rng) { paintMountains(c, w, h, rng, "#161a20", h * 0.25, h * 0.1); } },
      { f: 0.4, y: 0, paint(c, w, h, rng) {
        c.fillStyle = "#0b0d11";
        for (let x = 40; x < w; x += lerp(260, 380, rng())) {
          const gw = lerp(90, 130, rng()), gh = h * lerp(0.38, 0.5, rng());
          wrapDraw(w, x, gw, xx => {
            c.fillRect(xx + gw * 0.12, h - gh, 9, gh); c.fillRect(xx + gw * 0.88 - 9, h - gh, 9, gh);
            c.beginPath(); c.moveTo(xx - 14, h - gh - 4); c.quadraticCurveTo(xx + gw / 2, h - gh + 6, xx + gw + 14, h - gh - 4);
            c.lineTo(xx + gw + 12, h - gh + 6); c.quadraticCurveTo(xx + gw / 2, h - gh + 14, xx - 12, h - gh + 6); c.fill();
            c.fillRect(xx, h - gh + 18, gw, 6);
          });
        }
      } },
    ],
    build(rng, tileW, h) { this.lanterns = []; for (let i = 0; i < 6; i++) this.lanterns.push({ x: rng() * tileW, y: h * lerp(0.35, 0.6, rng()), len: lerp(20, 50, rng()) }); },
    back(c, v, m, pal) {
      const g = c.createRadialGradient(v.w * 0.5, v.floorY * 0.7, 10, v.w * 0.5, v.floorY * 0.7, v.w * 0.6);
      g.addColorStop(0, rgba("#ff5fb0", 0.06 + 0.08 * m.I)); g.addColorStop(1, "rgba(255,95,176,0)");
      c.fillStyle = g; c.fillRect(0, 0, v.w, v.floorY);
    },
    mid(c, v, m, pal) {
      const off = v.layerOff(0.4);
      for (const L of this.lanterns) v.repeat(off, L.x, x => {
        const top = v.floorY - v.tileH;
        const sw = Math.sin(m.beatF * Math.PI) * 0.12;   // качание в такт
        const lx = x + Math.sin(sw) * L.len, ly = top + L.y + Math.cos(sw) * L.len;
        c.strokeStyle = "rgba(10,12,16,.9)"; c.lineWidth = 1; c.beginPath(); c.moveTo(x, top + L.y); c.lineTo(lx, ly); c.stroke();
        const a = (0.4 + 0.5 * m.pulse) * m.I + 0.15;
        const g = c.createRadialGradient(lx, ly + 6, 1, lx, ly + 6, 26);
        g.addColorStop(0, rgba(pal.neonA, a * 0.6)); g.addColorStop(1, "rgba(255,95,176,0)");
        c.fillStyle = g; c.fillRect(lx - 26, ly - 20, 52, 52);
        c.fillStyle = rgba(pal.neonA, a); c.beginPath(); c.ellipse(lx, ly + 6, 4, 6, 0, 0, TAU); c.fill();
      });
    },
    front(c, v, m, pal, R) {
      // лепестки по верхним частотам
      if (rand() < (0.08 + m.high * 0.5) * R.amount) R.amb.push({ x: rand(0, v.w), y: -5, vx: rand(-20, 30), vy: rand(20, 45), life: 7, c: rand() < 0.7 ? "#ffc3e0" : "#e8e2d6", petal: true });
      const g = c.createLinearGradient(0, v.floorY - 80, 0, v.floorY + 20);
      g.addColorStop(0, "rgba(58,64,72,0)"); g.addColorStop(1, rgba("#3a4048", 0.3 + 0.15 * (1 - m.I)));
      c.fillStyle = g; c.fillRect(0, v.floorY - 80, v.w, 100);
    },
  },
  {
    id: "cathedral", name: "Собор лучей", desc: "кинематографичная музыка, нарастания",
    pal: { sky: ["#06060b", "#15131f"], glow: "#7a5cff", neonA: "#7a5cff", neonB: "#cfd8ff", floor: "#08080d", edge: "#7a5cff", fog: "#262338" },
    profile: { dynamics: [0.8, 0.25], energyVar: [0.6, 0.3], bpm: [95, 35], density: [1.8, 1.6] },
    layers: [
      { f: 0.1, y: 0, paint(c, w, h, rng) {
        for (let x = 0; x < w; x += 180) {
          wrapDraw(w, x, 160, xx => {
            c.fillStyle = "#100f18";
            c.beginPath(); c.moveTo(xx, h); c.lineTo(xx, h * 0.35); c.quadraticCurveTo(xx + 80, h * 0.02, xx + 160, h * 0.35); c.lineTo(xx + 160, h); c.closePath(); c.fill();
            c.fillStyle = "#06060b";
            c.beginPath(); c.moveTo(xx + 40, h); c.lineTo(xx + 40, h * 0.42); c.quadraticCurveTo(xx + 80, h * 0.2, xx + 120, h * 0.42); c.lineTo(xx + 120, h); c.closePath(); c.fill();
          });
        }
      } },
      { f: 0.3, y: 0, paint(c, w, h, rng) { c.fillStyle = "#0a0910"; for (let x = 20; x < w; x += 140) wrapDraw(w, x, 26, xx => { c.fillRect(xx, h * 0.2, 26, h * 0.8); c.fillRect(xx - 6, h * 0.2, 38, 10); }); } },
    ],
    build(rng, tileW) { this.rays = []; for (let i = 0; i < 4; i++) this.rays.push({ x: (i + 0.5) / 4 + rng() * 0.1, w: lerp(30, 70, rng()), ph: rng() * 6 }); },
    back(c, v, m, pal) {
      // витражные прорези
      const off = v.layerOff(0.1);
      for (let x0 = off - v.tileW; x0 < v.w; x0 += 180) {
        const top = v.floorY - v.tileH;
        c.fillStyle = rgba(pal.neonA, (0.2 + 0.4 * m.mid) * m.I + 0.1);
        c.fillRect(x0 + 76, top + v.tileH * 0.28, 8, v.tileH * 0.12);
      }
    },
    mid(c, v, m, pal) {
      c.save(); c.globalCompositeOperation = "lighter";
      for (const r of this.rays) {
        const x = r.x * v.w + Math.sin(m.time * 0.3 + r.ph) * 30;
        const a = (0.03 + 0.1 * m.I + 0.05 * m.strong);
        const g = c.createLinearGradient(x, 0, x + 120, v.floorY);
        g.addColorStop(0, rgba(pal.neonB, a)); g.addColorStop(1, "rgba(207,216,255,0)");
        c.fillStyle = g;
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x + r.w, 0); c.lineTo(x + r.w * 3 + 120, v.floorY); c.lineTo(x + 80, v.floorY); c.closePath(); c.fill();
      }
      c.restore();
    },
    front(c, v, m, pal, R) {
      if (rand() < 0.3 * R.amount) R.amb.push({ x: rand(0, v.w), y: rand(0, v.floorY), vx: rand(-6, 6), vy: rand(-8, 8), life: rand(2, 4), c: "#cfd8ff", mote: true });
    },
  },
];

/** Подбор арен под признаки трека. Возвращает [{theme, score}] по убыванию. */
function rankThemes(features) {
  if (!features) return THEMES.map(t => ({ theme: t, score: 0.5 }));
  const res = THEMES.map(t => {
    let acc = 0, wsum = 0;
    for (const k in t.profile) {
      const [target, width] = t.profile[k];
      const f = features[k];
      if (f == null) continue;
      acc += Math.exp(-0.5 * Math.pow((f - target) / width, 2));
      wsum += 1;
    }
    return { theme: t, score: wsum ? acc / wsum : 0 };
  });
  res.sort((a, b) => b.score - a.score);
  return res;
}

class ArenaRenderer {
  constructor() {
    this.theme = THEMES[0];
    this.tiles = [];
    this.amb = [];
    this.key = "";
    this.sectionFlash = 0;
    this.levelMix = 0.5;      // 0 спокойно .. 1 интенсивно (плавно)
    // веса вариантов эффектов по характеру части трека (плавно смешиваются)
    this.kw = { intro: 0, build: 0, drop: 0, climax: 0, break: 0, calm: 0, groove: 1, outro: 0 };
    this.buildW = 0; this.dropFlash = 0; this.swap = 0; this.vfx = [];
  }
  setTheme(id) {
    const t = THEMES.find(x => x.id === id) || THEMES[0];
    if (t !== this.theme) { this.theme = t; this.key = ""; this.amb = []; }
  }

  /** Пересобирает тайлы параллакса при смене размеров/темы/качества. */
  ensureTiles(v, dpr) {
    // Тайлы строятся под положение пола «в покое» (без прыжков, толчков и наезда камеры):
    // движение камеры только сдвигает готовую картинку. Раньше ключ включал текущий floorY,
    // и тайлы пересобирались сотни раз за бой — отсюда фризы.
    const restY = v.restFloorY != null ? v.restFloorY : v.floorY;
    const key = this.theme.id + "|" + Math.round(v.w) + "|" + Math.round(restY) + "|" + dpr;
    if (key === this.key) return;
    this.key = key;
    const tileW = Math.max(900, Math.ceil(v.w));
    const tileH = Math.max(50, Math.ceil(restY));
    this.tileW = tileW; this.tileH = tileH;
    const rng = mulberry32(this.theme.id.length * 977 + 13);
    this.tiles = this.theme.layers.map(L => {
      const cv = document.createElement("canvas");
      cv.width = Math.ceil(tileW * dpr); cv.height = Math.ceil(tileH * dpr);
      const c = cv.getContext("2d");
      c.scale(dpr, dpr);
      L.paint(c, tileW, tileH, rng);
      return { cv, f: L.f };
    });
    if (this.theme.build) this.theme.build(rng, tileW, tileH);
    this._vig = null;
  }

  /** m — музыкальное состояние кадра, v — параметры вида. */
  drawBack(ctx, v, m, R) {
    const th = this.theme, pal = th.pal;
    this.ensureTiles(v, R.dpr);
    v.tileW = this.tileW; v.tileH = this.tileH;
    v.layerOff = f => { const o = -(v.camX * v.scale * f) % this.tileW; return o > 0 ? o - this.tileW : o; };
    v.repeat = (off, x, fn) => { for (let x0 = off; x0 < v.w + this.tileW; x0 += this.tileW) { const xx = x0 + x; if (xx > -300 && xx < v.w + 300) fn(xx); } };
    if (m.sectionEvent) this.sectionFlash = 1;
    this.sectionFlash = Math.max(0, this.sectionFlash - R.dt * 0.8);
    const target = m.level === "intense" ? 1 : m.level === "calm" ? 0 : 0.5;
    this.levelMix = damp(this.levelMix, target, 0.7, R.dt);
    m.I = clamp(0.45 + 0.55 * (m.intensity * 0.6 + this.levelMix * 0.4), 0, 1);
    this.updateVariants(m, R.dt);
    const kw = this.kw;
    m.I = clamp(m.I + 0.25 * (kw.drop + kw.climax) - 0.2 * (kw.break + kw.calm + kw.intro + kw.outro), 0.25, 1);

    // небо
    const g = ctx.createLinearGradient(0, 0, 0, v.floorY);
    g.addColorStop(0, pal.sky[0]);
    g.addColorStop(1, mixHex(pal.sky[1], pal.glow, 0.08 * this.levelMix + 0.06 * m.strong));
    ctx.fillStyle = g; ctx.fillRect(0, 0, v.w, v.floorY + 2);
    th.back(ctx, v, m, pal, R);
    for (const t of this.tiles) {
      const off = v.layerOff(t.f);
      for (let x = off; x < v.w; x += this.tileW) ctx.drawImage(t.cv, x, v.floorY - this.tileH, this.tileW, this.tileH);
    }
    th.mid(ctx, v, m, pal, R);
    this.variantBack(ctx, v, m, R);
    // пол
    const fg = ctx.createLinearGradient(0, v.floorY, 0, v.h);
    fg.addColorStop(0, pal.floor); fg.addColorStop(1, "#000000");
    ctx.fillStyle = fg; ctx.fillRect(0, v.floorY, v.w, v.h - v.floorY);
    if (th.floor) th.floor(ctx, v, m, pal, R);
    // отражение неона на полу
    const rg = ctx.createLinearGradient(0, v.floorY, 0, v.floorY + 40);
    rg.addColorStop(0, rgba(pal.edge, 0.12 + 0.18 * m.pulse * m.I)); rg.addColorStop(1, rgba(pal.edge, 0));
    ctx.fillStyle = rg; ctx.fillRect(0, v.floorY, v.w, 40);
    // кромка пола: пульс и бегущие метки долей
    ctx.fillStyle = rgba(pal.edge, 0.45 + 0.55 * m.pulse * m.I);
    ctx.fillRect(0, v.floorY - 1, v.w, 2);
    const step = 48, ox = -(v.camX * v.scale) % step;
    ctx.fillStyle = rgba(pal.edge, 0.25 + 0.5 * m.strong);
    for (let x = ox; x < v.w; x += step) ctx.fillRect(x, v.floorY + 6, 12, 1.5);
  }

  /** Платформа в мировых координатах (ctx уже в мире). */
  drawPlatform(ctx, x, y, w, m) {
    const pal = this.theme.pal;
    ctx.fillStyle = "#06070a";
    ctx.fillRect(x, y, w, 9);
    ctx.fillStyle = rgba(pal.edge, 0.55 + 0.45 * m.pulse * m.I);
    ctx.fillRect(x, y - 1, w, 1.6);
    ctx.fillStyle = rgba(pal.edge, 0.15);
    ctx.fillRect(x + 4, y + 9, w - 8, 1);
  }

  drawFront(ctx, v, m, R) {
    const th = this.theme, pal = th.pal;
    R.amb = this.amb;
    th.front(ctx, v, m, pal, R);
    // фоновые частицы темы (искры, лепестки, пылинки)
    const dt = R.dt;
    const amb = this.amb;
    for (let i = amb.length - 1; i >= 0; i--) {
      const a = amb[i];
      a.life -= dt;
      if (a.life <= 0 || a.y > v.h + 10) { amb.splice(i, 1); continue; }
      a.x += a.vx * dt + (a.petal ? Math.sin(m.time * 2 + i) * 20 * dt : 0); a.y += a.vy * dt;
      if (!a.petal && !a.mote) a.vy += 160 * dt;
      ctx.fillStyle = rgba(a.c, a.mote ? 0.25 + 0.35 * m.mid : Math.min(1, a.life));
      if (a.petal) { ctx.beginPath(); ctx.ellipse(a.x, a.y, 2.5, 1.3, m.time * 2 + i, 0, TAU); ctx.fill(); }
      else ctx.fillRect(a.x, a.y, a.mote ? 1.5 : 2, a.mote ? 1.5 : 2);
    }
    if (amb.length > 160) amb.splice(0, amb.length - 160);
    this.variantFront(ctx, v, m, R);
    // виньетка с пульсом
    if (!this._vig || this._vigW !== v.w || this._vigH !== v.h) {
      this._vigW = v.w; this._vigH = v.h;
      const vg = ctx.createRadialGradient(v.w / 2, v.h * 0.55, Math.min(v.w, v.h) * 0.35, v.w / 2, v.h * 0.55, Math.max(v.w, v.h) * 0.75);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.75)");
      this._vig = vg;
    }
    ctx.fillStyle = this._vig; ctx.fillRect(0, 0, v.w, v.h);
    // акцент сильной доли по краям экрана
    if (m.strong > 0.05) {
      ctx.fillStyle = rgba(pal.edge, 0.12 * m.strong * m.I);
      ctx.fillRect(0, 0, v.w, 3); ctx.fillRect(0, v.h - 3, v.w, 3);
    }
    // мягкая волна цвета при смене секции
    if (this.sectionFlash > 0) {
      const x = (1 - this.sectionFlash) * v.w * 1.4 - v.w * 0.2;
      const g = ctx.createLinearGradient(x - 160, 0, x + 160, 0);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, rgba(pal.glow, 0.14 * this.sectionFlash)); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(x - 160, 0, 320, v.h);
    }
  }

  /* ---------- варианты эффектов по частям трека ---------- */
  updateVariants(m, dt) {
    const kw = this.kw, kind = m.kind || "groove";
    for (const k in kw) kw[k] = damp(kw[k], k === kind ? 1 : 0, 1.4, dt);
    // нарастание: сама часть «build», рост энергии впереди или скорый дроп
    const soon = m.dropSoon ? clamp(1 - m.timeToNext / 4, 0, 1) : 0;
    this.buildW = damp(this.buildW, Math.max(kw.build, soon, clamp((m.trend || 0) * 2.2, 0, 1) * 0.7), 3, dt);
    if (m.sectionEvent && (m.sectionKind === "drop" || m.sectionKind === "climax")) { this.dropFlash = 1; this.swapTarget = this.swapTarget ? 0 : 1; }
    this.dropFlash = Math.max(0, this.dropFlash - dt * 1.4);
    this.swap = damp(this.swap, this.swapTarget || 0, 2, dt);
  }
  /** Неон с учётом перестановки цветов на дропах. */
  neon(i) {
    const p = this.theme.pal;
    return i ? mixHex(p.neonB, p.neonA, this.swap) : mixHex(p.neonA, p.neonB, this.swap);
  }

  variantBack(ctx, v, m, R) {
    const kw = this.kw;
    const hot = kw.drop + kw.climax;
    // лазеры из верхних углов — дроп и кульминация
    if (hot > 0.05) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const n = R.amount < 1 ? 2 : 4;
      for (let i = 0; i < n; i++) {
        const left = i % 2 === 0, ox = left ? 0 : v.w;
        const ang = (left ? 0.35 : Math.PI - 0.35) + Math.sin(m.beatF * Math.PI / 2 + i * 1.3) * 0.45 * (left ? 1 : -1);
        const len = Math.hypot(v.w, v.h);
        const a = hot * (0.1 + 0.18 * m.pulse);
        ctx.fillStyle = rgba(this.neon(i % 2), a);
        ctx.beginPath(); ctx.moveTo(ox, -4);
        ctx.lineTo(ox + Math.cos(ang - 0.012) * len, Math.sin(ang - 0.012) * len);
        ctx.lineTo(ox + Math.cos(ang + 0.012) * len, Math.sin(ang + 0.012) * len);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    // нарастание: свечение горизонта усиливается
    if (this.buildW > 0.05) {
      const g = ctx.createLinearGradient(0, v.floorY - v.h * 0.35, 0, v.floorY);
      g.addColorStop(0, rgba(this.neon(0), 0)); g.addColorStop(1, rgba(this.neon(0), 0.28 * this.buildW * (0.6 + 0.4 * (m.halfPulse || 0))));
      ctx.fillStyle = g; ctx.fillRect(0, v.floorY - v.h * 0.35, v.w, v.h * 0.35);
    }
    // брейк: прожектор на героя
    if (kw.break > 0.05 && v.playerX != null) {
      const g = ctx.createLinearGradient(0, 0, 0, v.floorY);
      g.addColorStop(0, rgba("#e8e2d6", 0.0)); g.addColorStop(1, rgba("#e8e2d6", 0.14 * kw.break));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(v.playerX - 20, 0); ctx.lineTo(v.playerX + 20, 0); ctx.lineTo(v.playerX + 70, v.floorY); ctx.lineTo(v.playerX - 70, v.floorY); ctx.closePath(); ctx.fill();
    }
  }

  variantFront(ctx, v, m, R) {
    const kw = this.kw, dt = R.dt, fx = this.vfx, amt = R.amount;
    const hot = kw.drop + kw.climax, calm = kw.calm + kw.intro + kw.outro;
    // --- рождение частиц ---
    if (this.buildW > 0.1 && rand() < this.buildW * 0.9 * amt) {
      fx.push({ t: "rise", x: rand(0, v.w), y: v.floorY + rand(0, 20), vx: 0, vy: -rand(150, 300) * (1 + this.buildW), life: 1.2, max: 1.2, c: this.neon(rand() < 0.5 ? 0 : 1) });
    }
    if (kw.climax > 0.2 && rand() < kw.climax * 0.7 * amt) fx.push({ t: "spark", x: rand(0, v.w), y: -5, vx: rand(-30, 30), vy: rand(120, 260), life: 1.6, max: 1.6, c: this.neon(rand() < 0.5 ? 0 : 1) });
    if (kw.break > 0.2 && rand() < kw.break * 0.35 * amt) fx.push({ t: "ash", x: rand(0, v.w), y: -5, vx: rand(-10, 10), vy: rand(15, 35), life: 6, max: 6, c: "#9a98a6" });
    if (calm > 0.3 && rand() < calm * 0.15 * amt) fx.push({ t: "mote", x: rand(0, v.w), y: rand(v.h * 0.2, v.floorY), vx: rand(-8, 8), vy: rand(-10, -2), life: 4, max: 4, c: this.theme.pal.neonA });
    // события полос: бас — волны по полу, верха — искры-звёздочки
    for (const ev of m.onsets || []) {
      if (ev.band === "low" && ev.strength > 0.35) fx.push({ t: "ripple", x: v.playerX != null ? v.playerX + rand(-120, 120) : v.w / 2, y: v.floorY, life: 0.7, max: 0.7, size: 30 + 80 * ev.strength * (m.bassy ? 1.6 : 1), c: this.neon(0) });
      if (ev.band === "high" && ev.strength > 0.4 && (m.bright || rand() < 0.4)) for (let k = 0; k < (m.bright ? 3 : 1); k++) fx.push({ t: "twinkle", x: rand(0, v.w), y: rand(0, v.floorY * 0.7), life: 0.45, max: 0.45, size: rand(2, 4.5), c: "#ffffff" });
    }
    if (fx.length > 160) fx.splice(0, fx.length - 160);
    // --- обновление и отрисовка ---
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.life -= dt;
      if (f.life <= 0) { fx.splice(i, 1); continue; }
      if (f.vx != null) { f.x += f.vx * dt; f.y += f.vy * dt; }
      if (f.t === "rise") f.vy *= 1 + dt * 1.5;
      const k = f.life / f.max;
      switch (f.t) {
        case "rise": ctx.strokeStyle = rgba(f.c, 0.5 * k); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x, f.y - f.vy * 0.06); ctx.stroke(); break;
        case "spark": ctx.fillStyle = rgba(f.c, 0.8 * k); ctx.fillRect(f.x, f.y, 2, 4); break;
        case "ash": ctx.fillStyle = rgba(f.c, 0.35 * Math.min(1, k * 3)); ctx.fillRect(f.x + Math.sin(f.life * 2) * 6, f.y, 2, 2); break;
        case "mote": ctx.fillStyle = rgba(f.c, 0.3 * Math.sin(k * Math.PI)); ctx.beginPath(); ctx.arc(f.x, f.y, 1.4, 0, TAU); ctx.fill(); break;
        case "ripple": {
          const r = f.size * (1 - k) + 6;
          ctx.strokeStyle = rgba(f.c, 0.5 * k); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(f.x, f.y + 2, r * 2, r * 0.18, 0, 0, TAU); ctx.stroke();
          break;
        }
        case "twinkle": {
          const r = f.size * Math.sin(k * Math.PI);
          ctx.strokeStyle = rgba(f.c, 0.8 * k); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(f.x - r, f.y); ctx.lineTo(f.x + r, f.y); ctx.moveTo(f.x, f.y - r); ctx.lineTo(f.x, f.y + r); ctx.stroke();
          break;
        }
      }
    }
    // нарастание: импульсы по краям экрана на половинных долях
    if (this.buildW > 0.1) {
      const a = this.buildW * (m.halfPulse || 0) * 0.3;
      const g1 = ctx.createLinearGradient(0, 0, 40, 0);
      g1.addColorStop(0, rgba(this.neon(0), a)); g1.addColorStop(1, rgba(this.neon(0), 0));
      ctx.fillStyle = g1; ctx.fillRect(0, 0, 40, v.h);
      const g2 = ctx.createLinearGradient(v.w, 0, v.w - 40, 0);
      g2.addColorStop(0, rgba(this.neon(1), a)); g2.addColorStop(1, rgba(this.neon(1), 0));
      ctx.fillStyle = g2; ctx.fillRect(v.w - 40, 0, 40, v.h);
    }
    // вход в дроп: вспышка и кольцо из центра
    if (this.dropFlash > 0) {
      const k = this.dropFlash;
      ctx.fillStyle = rgba(this.neon(0), (R.flashes ? 0.3 : 0.1) * k * k);
      ctx.fillRect(0, 0, v.w, v.h);
      ctx.strokeStyle = rgba("#ffffff", 0.6 * k); ctx.lineWidth = 3 * k;
      ctx.beginPath(); ctx.arc(v.w / 2, v.floorY * 0.6, (1 - k) * Math.max(v.w, v.h) * 0.8, 0, TAU); ctx.stroke();
    }
    // строб на сильных долях в дропе и кульминации
    if (R.flashes && hot > 0.4 && m.strong > 0.75) { ctx.fillStyle = rgba(this.neon(1), 0.08 * hot * m.strong); ctx.fillRect(0, 0, v.w, v.h); }
    ctx.restore();
    // спокойные части — приглушение; брейк — обесцвечивание
    if (calm > 0.05) { ctx.fillStyle = rgba("#05060a", 0.18 * calm); ctx.fillRect(0, 0, v.w, v.h); }
    if (kw.break > 0.05) {
      ctx.save(); ctx.globalCompositeOperation = "saturation";
      ctx.fillStyle = rgba("#808080", 0.75 * kw.break); ctx.fillRect(0, 0, v.w, v.h);
      ctx.restore();
    }
  }

  /** Маленькое превью для списка арен. */
  preview(canvas, theme) {
    const c = canvas.getContext("2d"), w = canvas.width, h = canvas.height;
    const saved = this.theme, savedKey = this.key, savedTiles = this.tiles, sw = this.tileW, sh = this.tileH;
    this.theme = theme; this.key = "";
    const v = { w, h, floorY: h * 0.78, camX: 300, scale: 1 };
    const m = { pulse: 0.6, strong: 0.5, low: 0.6, mid: 0.5, high: 0.5, I: 0.85, intensity: 0.7, beat: 3, beatF: 0.3, phase: 0.3, time: 2, level: "mid" };
    try { this.drawBack(c, v, m, { dpr: 1, dt: 0, amount: 0.4, amb: [], flashes: false }); }
    catch (e) { c.fillStyle = theme.pal.sky[1]; c.fillRect(0, 0, w, h); }
    this.theme = saved; this.tiles = savedTiles; this.tileW = sw; this.tileH = sh;
    this.key = theme === saved ? "" : savedKey;   // состояние темы перестроено под превью
  }
}
const THEMES_IDS = THEMES.map(t => t.id); window.THEMES_IDS = THEMES_IDS;
