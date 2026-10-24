/* =====================================================================
   ArenaRenderer — арены, которые реагируют на музыку.
   Статичные слои параллакса пререндерятся в offscreen-канвасы (тайлы),
   музыкальные элементы рисуются каждый кадр поверх.
   Подбор арены — по признакам сигнала трека (не по жанру).

   Принципы декора (чтобы ничего не висело в воздухе):
   - всё, что висит или стоит (гирлянды, фонари, вывески, провода, лампы, цепи, кроны), крепится к опоре
     (мачта, столб, крыша, стена, балка, колонна), а опора рисуется В ТОМ ЖЕ слое параллакса;
   - анимированная часть слоя рисуется хуком слоя `dyn` сразу после его тайла, с тем же сдвигом `off`,
     по якорям `A`, которые записала `paint` (координаты тайла) — опора и подвес не разъезжаются
     и закрываются ближними слоями правильно;
   - ряды зданий строит `layoutRow` ровно на ширину тайла: ничего не обрезается краем, шов бесшовный;
   - у тайла справа запас TILE_PAD (копия начала) — при дробном сдвиге между тайлами нет просвета.
   ===================================================================== */

/* ---------- помощники рисования тайлов ---------- */
const TILE_PAD = 2;
function wrapDraw(w, x, width, fn) { fn(x); if (x + width > w) fn(x - w); if (x < 0) fn(x + w); }
/** Ряд объектов слева направо ровно на ширину тайла (хвост — пустой промежуток у шва): [{x, w}]. */
function layoutRow(w, rng, minW, maxW, gMin, gMax) {
  const row = []; let x = 0;
  while (x < w - minW) { const bw = lerp(minW, maxW, rng()); row.push({ x, w: bw }); x += bw + lerp(gMin, gMax, rng()); }
  const k = w / x;
  for (const b of row) { b.x *= k; b.w *= k; }
  return row;
}
/** Y экрана для координаты слоя (низ тайла стоит на полу). */
function layerY(v, y) { return v.floorY - (v.tileH - y); }
/** Провисающий провод между двумя точками опоры (парабола, sag — провис в середине). */
function wire(c, x0, y0, x1, y1, sag) {
  c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + 2 * sag, x1, y1); c.stroke();
}
/** Точка на проводе (то же, что wire): для бусин гирлянды. */
function wirePt(x0, y0, x1, y1, sag, t) { return [lerp(x0, x1, t), lerp(y0, y1, t) + 4 * sag * t * (1 - t)]; }
/** Сетка окон; рисунок зависит только от seed (копии на шве одинаковы). */
function drawWindows(c, x, y, w, hh, o, seed) {
  const r = mulberry32(seed), my = o.my == null ? 6 : o.my, mb = o.mb == null ? 8 : o.mb;
  for (let wy = y + my; wy < y + hh - mb; wy += o.sy) {
    for (let wx = x + o.mx; wx + o.ww <= x + w - o.mx + 0.01; wx += o.sx) {
      const q = r(), p = r();
      if (q < o.p) { c.fillStyle = p < 0.5 ? o.a : o.b; c.fillRect(wx, wy, o.ww, o.wh); }
    }
  }
}
/** Остроконечная арка (готика): x,y — левый верх, w — ширина, hh — полная высота. */
function archPath(c, x, y, w, hh) {
  c.beginPath(); c.moveTo(x, y + hh); c.lineTo(x, y + w * 0.8);
  c.quadraticCurveTo(x, y + w * 0.18, x + w / 2, y);
  c.quadraticCurveTo(x + w, y + w * 0.18, x + w, y + w * 0.8);
  c.lineTo(x + w, y + hh); c.closePath();
}
function paintMountains(c, w, h, rng, color, amp, base, rim) {
  const pts = 14, ys = []; for (let i = 0; i <= pts; i++) ys.push(h - base - rng() * amp);
  ys[pts] = ys[0];
  c.fillStyle = color; c.beginPath(); c.moveTo(0, h);
  for (let i = 0; i <= pts; i++) c.lineTo((i / pts) * w, ys[i]);
  c.lineTo(w, h); c.closePath(); c.fill();
  if (rim) {      // контровой свет по гребню
    c.strokeStyle = rim; c.lineWidth = 1.2; c.beginPath();
    for (let i = 0; i <= pts; i++) c.lineTo((i / pts) * w, ys[i] + 0.6);
    c.stroke();
  }
}
/** Водонапорный бак на опорах: стоит на крыше roofY. */
function paintTank(c, x, roofY, tw) {
  c.fillRect(x + 2, roofY - 12, 2, 12); c.fillRect(x + tw - 4, roofY - 12, 2, 12);
  c.fillRect(x, roofY - 24, tw, 12);
  c.beginPath(); c.moveTo(x - 1, roofY - 24); c.lineTo(x + tw / 2, roofY - 31); c.lineTo(x + tw + 1, roofY - 24); c.fill();
}
/** Мачта с перекладинами: стоит на крыше roofY. */
function paintMast(c, mx, roofY, mh) {
  c.fillRect(mx, roofY - mh, 2, mh);
  c.fillRect(mx - 5, roofY - mh * 0.8, 12, 1.5); c.fillRect(mx - 3, roofY - mh * 0.6, 8, 1.5);
}

/* ---------- темы ---------- */
/* Слой: { f — параллакс, haze — туман у основания (атмосферная перспектива), refl — отражение в полу,
           paint(c, w, h, rng, A) — один раз в тайл, якоря пишет в A, dyn(c, v, m, pal, R, off, A) — каждый кадр }. */
const THEMES = [
  {
    id: "city", name: "Неоновый город", desc: "электроника, средний и высокий темп",
    pal: { sky: ["#04050b", "#170b2c"], glow: "#ff2e88", neonA: "#3ef0ff", neonB: "#ff2e88", floor: "#07070d", edge: "#3ef0ff", fog: "#1a1030" },
    profile: { bpm: [120, 25], density: [3.5, 2.5], high: [0.18, 0.12], perc: [0.5, 0.25], loudness: [0.6, 0.35] },
    fogA: 0.32,
    layers: [
      // дальние башни: светлее и холоднее, тонкий контровой свет на гранях
      { top: 0.84, f: 0.1, haze: 0.55, paint(c, w, h, rng, A) {
        for (const b of layoutRow(w, rng, 30, 64, 0, 8)) {
          const bh = lerp(h * 0.3, h * 0.66, Math.pow(rng(), 1.3)), top = h - bh, k = rng(), e = rng(), seed = (rng() * 1e9) | 0;
          c.fillStyle = "#151a38"; c.fillRect(b.x, top, b.w, bh);
          if (k < 0.3) c.fillRect(b.x + b.w * 0.18, top - 9, b.w * 0.64, 9);
          else if (k < 0.55) { c.beginPath(); c.moveTo(b.x + b.w * 0.5 - 3, top); c.lineTo(b.x + b.w * 0.5, top - bh * 0.18); c.lineTo(b.x + b.w * 0.5 + 3, top); c.fill(); }
          if (e < 0.3) { c.fillStyle = "rgba(62,240,255,.3)"; c.fillRect(b.x + b.w - 1.5, top + 2, 1.5, bh * 0.7); }
          drawWindows(c, b.x, top, b.w, bh, { sx: 7, sy: 9, mx: 4, ww: 2, wh: 3, p: 0.045, a: "rgba(62,240,255,.22)", b: "rgba(255,46,136,.18)" }, seed);
        }
      } },
      // средний план: крыши с баками, мачтами и кондиционерами; на мачтах — сигнальные огни (dyn)
      { top: 0.66, f: 0.24, haze: 0.22, refl: 0.14, paint(c, w, h, rng, A) {
        A.beacons = [];
        for (const b of layoutRow(w, rng, 44, 92, 2, 16)) {
          const bh = lerp(h * 0.2, h * 0.5, Math.pow(rng(), 1.2)), top = h - bh, roofY = top - 3, k = rng(), e = rng(), seed = (rng() * 1e9) | 0;
          c.fillStyle = "#0a0c1e"; c.fillRect(b.x, top, b.w, bh); c.fillRect(b.x - 1.5, roofY, b.w + 3, 3);
          if (k < 0.3) paintTank(c, b.x + b.w * 0.25, roofY, b.w * 0.3);
          else if (k < 0.6) { const mx = b.x + b.w * (0.3 + 0.4 * rng()); paintMast(c, mx, roofY, 30); A.beacons.push({ x: mx + 1, y: roofY - 30 }); }
          else { c.fillRect(b.x + b.w * 0.2, roofY - 6, 12, 6); c.fillRect(b.x + b.w * 0.55, roofY - 8, 16, 8); }
          if (e < 0.35) { c.fillStyle = "rgba(255,46,136,.22)"; c.fillRect(b.x + b.w - 1.5, top + 2, 1.5, bh * 0.6); }
          drawWindows(c, b.x, top, b.w, bh, { sx: 6, sy: 7, mx: 4, ww: 2.5, wh: 3, p: 0.09, a: "rgba(62,240,255,.4)", b: "rgba(255,177,59,.3)", mb: 22 }, seed);
        }
      }, dyn(c, v, m, pal, R, off, A) {
        // сигнальные огни на вершинах мачт: мигают раз в такт
        const a = (0.25 + 0.75 * m.pulse) * (m.beat % 2 ? 0.4 : 1);
        for (const B of A.beacons) v.repeat(off, B.x, x => {
          const y = layerY(v, B.y);
          c.fillStyle = rgba("#ff2e88", 0.12 * a); c.fillRect(x - 5, y - 5, 10, 10);
          c.fillStyle = rgba("#ff5fa8", 0.35 + 0.6 * a); c.fillRect(x - 1, y - 1, 2.5, 2.5);
        });
      } },
      // ближний план: тёмные дома с пожарными лестницами, вывесками на стенах, столбы с проводами и фонарями
      { top: 0.74, f: 0.42, paint(c, w, h, rng, A) {
        A.signs = []; A.lamps = [];
        for (const b of layoutRow(w, rng, 70, 150, 20, 52)) {
          const bh = lerp(h * 0.28, h * 0.54, Math.pow(rng(), 1.1)), top = h - bh;
          const k = rng(), kf = rng(), ks = rng(), seed = (rng() * 1e9) | 0;
          c.fillStyle = "#05060c"; c.fillRect(b.x, top, b.w, bh); c.fillRect(b.x - 2, top - 4, b.w + 4, 4);
          drawWindows(c, b.x, top, b.w, bh * 0.62, { sx: 8, sy: 10, mx: 6, ww: 3, wh: 4, p: 0.05, a: "rgba(62,240,255,.3)", b: "rgba(255,177,59,.25)" }, seed);
          if (kf < 0.45) {   // пожарная лестница: площадки и марши прикреплены к стене
            const x0 = b.x + b.w * 0.18, x1 = b.x + b.w * 0.78;
            c.strokeStyle = "#12162e"; c.lineWidth = 1.5; c.beginPath();
            for (let y = top + bh * 0.2, i = 0; i < 3 && y < h - 40; i++, y += 26) {
              c.moveTo(x0, y); c.lineTo(x1, y); c.moveTo(x0, y - 7); c.lineTo(x1, y - 7);
              for (let px = x0; px <= x1; px += 8) { c.moveTo(px, y); c.lineTo(px, y - 7); }
              if (i < 2) { c.moveTo(x1 - 3, y); c.lineTo(x1 - 22, y + 26); }
            }
            c.stroke();
          }
          if (ks < 0.55) {   // вывеска на стене (панель крепится к фасаду)
            if (ks < 0.28) { const sw = 11, sh = lerp(34, 64, rng()), sx = rng() < 0.5 ? b.x + 5 : b.x + b.w - 5 - sw, sy = top + bh * 0.14; A.signs.push({ x: sx, y: sy, w: sw, hh: sh, c: rng() < 0.5 ? 0 : 1, v: true }); }
            else { const sw = Math.min(b.w - 14, lerp(30, 52, rng())), sy = top + bh * 0.2; A.signs.push({ x: b.x + (b.w - sw) / 2, y: sy, w: sw, hh: 12, c: rng() < 0.5 ? 0 : 1, v: false }); }
          } else if (k < 0.3) {   // рекламный щит на крыше: две стойки от кровли до щита
            const bw = b.w * 0.6, bx = b.x + b.w * 0.2;
            c.fillStyle = "#0b0d1c"; c.fillRect(bx + 4, top - 12, 2, 8); c.fillRect(bx + bw - 6, top - 12, 2, 8);
            A.signs.push({ x: bx, y: top - 27, w: bw, hh: 15, c: rng() < 0.5 ? 0 : 1, v: false });
          }
        }
        for (const s of A.signs) { c.fillStyle = "#0d1022"; c.fillRect(s.x - 1, s.y - 1, s.w + 2, s.hh + 2); }
        // столбы стоят на земле; провода — между изоляторами соседних столбов (последний — к первому через шов)
        const N = Math.max(3, Math.round(w / 300)), xs = [], tops = [];
        for (let i = 0; i < N; i++) { xs.push((i + 0.5) * w / N + (rng() - 0.5) * 30); tops.push(h * lerp(0.5, 0.58, rng())); }
        for (let i = 0; i < N; i++) {
          const x = xs[i], pt = tops[i];
          c.fillStyle = "#090b18"; c.fillRect(x - 1.5, pt, 3, h - pt); c.fillRect(x - 9, pt + 4, 18, 2);
          c.fillRect(x - 8, pt + 1, 1.5, 3); c.fillRect(x + 6.5, pt + 1, 1.5, 3);
          if (i % 2 === 0) { c.fillRect(x, pt + 14, 22, 2); c.fillRect(x + 16, pt + 16, 10, 3); A.lamps.push({ x: x + 21, y: pt + 19 }); }
        }
        c.strokeStyle = "#0b0d1c"; c.lineWidth = 1.2;
        for (let i = 0; i < N; i++) {
          const j = (i + 1) % N, x1 = xs[j] + (j === 0 ? w : 0);
          for (const s of [-7.5, 7.5]) for (const dx of [0, -w]) wire(c, xs[i] + s + dx, tops[i] + 3, x1 + s + dx, tops[j] + 3, 9);
        }
      }, dyn(c, v, m, pal, R, off, A) {
        const nA = R.arena.neon(0), nB = R.arena.neon(1);
        for (let i = 0; i < A.signs.length; i++) {
          const s = A.signs[i], lit = (m.beat + i) % 3 === 0 ? 1 : 0.35;
          const a = clamp((0.25 + 0.75 * lit * (0.5 + 0.5 * m.pulse)) * m.I, 0, 1), col = s.c ? nB : nA;
          v.repeat(off, s.x, x => {
            const y = layerY(v, s.y);
            c.strokeStyle = rgba(col, a); c.lineWidth = 1.5; c.strokeRect(x + 0.5, y + 0.5, s.w - 1, s.hh - 1);
            c.fillStyle = rgba(col, a * 0.75);
            if (s.v) for (let k = 5; k < s.hh - 4; k += 6) c.fillRect(x + 2.5, y + k, s.w - 5, 2);
            else c.fillRect(x + 3, y + 3, (s.w - 6) * (0.4 + 0.6 * lit), s.hh - 6);
          });
        }
        // фонари на кронштейнах столбов: свет и конус вниз
        const la = (0.55 + 0.45 * m.pulse) * (0.6 + 0.4 * m.I);
        c.save(); c.globalCompositeOperation = "lighter";
        for (const L of A.lamps) v.repeat(off, L.x, x => {
          const y = layerY(v, L.y);
          const g = c.createRadialGradient(x, y + 2, 1, x, y + 2, 30);
          g.addColorStop(0, rgba(nA, 0.4 * la)); g.addColorStop(1, rgba(nA, 0));
          c.fillStyle = g; c.fillRect(x - 30, y - 28, 60, 60);
          c.fillStyle = rgba(nA, 0.07 * la); c.beginPath(); c.moveTo(x - 3, y + 2); c.lineTo(x + 3, y + 2); c.lineTo(x + 30, v.floorY); c.lineTo(x - 26, v.floorY); c.closePath(); c.fill();
          c.fillStyle = rgba("#ffffff", 0.5 * la); c.fillRect(x - 3, y, 6, 2);
        });
        c.restore();
      } },
    ],
    back(c, v, m, pal) {
      const mx = v.w * 0.72, my = v.floorY * 0.28, r = Math.min(v.w, v.h) * 0.07;
      const g = c.createRadialGradient(mx, my, r * 0.5, mx, my, r * 4);
      g.addColorStop(0, rgba("#ff2e88", 0.16 + 0.12 * m.strong)); g.addColorStop(1, "rgba(255,46,136,0)");
      c.fillStyle = g; c.fillRect(0, 0, v.w, v.floorY);
      // диск с ретро-прорезями: прорези обрезаны кругом (раньше торчали прямоугольниками)
      c.save(); c.beginPath(); c.arc(mx, my, r, 0, TAU); c.clip();
      c.fillStyle = rgba("#ffd6ec", 0.75); c.fillRect(mx - r, my - r, r * 2, r * 2);
      c.fillStyle = "rgba(4,5,11,.9)"; for (let i = 0; i < 4; i++) c.fillRect(mx - r, my + r * (0.1 + i * 0.22), r * 2, r * 0.07 * (i + 1));
      c.restore();
      const hg = c.createLinearGradient(0, v.floorY * 0.55, 0, v.floorY);
      hg.addColorStop(0, "rgba(255,46,136,0)"); hg.addColorStop(1, rgba("#ff2e88", 0.09 + 0.1 * m.I));
      c.fillStyle = hg; c.fillRect(0, v.floorY * 0.55, v.w, v.floorY * 0.45);
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
    hover: true,   // платформы парят на антигравитационных излучателях
    fogA: 0.25,
    layers: [
      // дальние монолиты данных: контурные грани, по ним бегут «пакеты»
      { top: 0.82, f: 0.1, haze: 0.45, paint(c, w, h, rng, A) {
        A.pillars = [];
        for (const b of layoutRow(w, rng, 14, 40, 24, 70)) {
          const bh = lerp(h * 0.25, h * 0.72, rng()), top = h - bh;
          c.fillStyle = "#0b0722"; c.fillRect(b.x, top, b.w, bh); c.fillRect(b.x - 2, top - 3, b.w + 4, 3);
          c.strokeStyle = "rgba(62,240,255,.24)"; c.lineWidth = 1; c.strokeRect(b.x + 0.5, top + 0.5, b.w - 1, bh);
          c.fillStyle = "rgba(62,240,255,.3)";
          for (let y = top + 8, i = 0; i < 4; i++, y += 5) c.fillRect(b.x + 3, y, (b.w - 6) * (0.35 + 0.6 * rng()), 1);
          A.pillars.push({ x: b.x, w: b.w, top });
        }
      }, dyn(c, v, m, pal, R, off, A) {
        for (let i = 0; i < A.pillars.length; i++) {
          const p = A.pillars[i], t = (m.time * 0.22 + hash1(i * 3 + 1)) % 1;
          v.repeat(off, p.x, x => {
            const yt = layerY(v, p.top) + 14, y = lerp(v.floorY - 12, yt, t);
            c.fillStyle = rgba(pal.neonB, (0.55 * Math.sin(t * Math.PI)) * (0.5 + 0.5 * m.I));
            c.fillRect(x + p.w / 2 - 1, y, 2, 10);
          });
        }
      } },
      // ближние плиты: неоновая кромка сверху (контровой свет)
      { top: 0.36, f: 0.26, refl: 0.16, paint(c, w, h, rng) {
        for (const b of layoutRow(w, rng, 50, 110, 8, 30)) {
          const bh = lerp(h * 0.08, h * 0.24, rng()), top = h - bh, k = rng();
          c.fillStyle = "#050310"; c.fillRect(b.x, top, b.w, bh);
          c.fillStyle = "rgba(255,46,136,.55)"; c.fillRect(b.x, top, b.w, 1.5);
          if (k < 0.4) { const ax = b.x + b.w * (0.2 + 0.6 * rng()); c.fillStyle = "#050310"; c.fillRect(ax, top - 16, 2, 16); c.fillStyle = "rgba(62,240,255,.7)"; c.fillRect(ax - 0.5, top - 18, 3, 2); }
        }
      } },
    ],
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
        // грани куба соединены рёбрами — это кристалл, а не два отдельных контура
        c.beginPath();
        for (let j = 0; j < 4; j++) { const ang = a + j * Math.PI / 2, px = x + Math.cos(ang) * s, py = y + Math.sin(ang) * s * 0.6; c.moveTo(px, py); c.lineTo(px, py - s); }
        c.stroke();
      }
      const hg = c.createLinearGradient(0, v.floorY - v.h * 0.25, 0, v.floorY);
      hg.addColorStop(0, rgba(pal.neonA, 0)); hg.addColorStop(1, rgba(pal.neonA, 0.1 + 0.12 * m.pulse * m.I));
      c.fillStyle = hg; c.fillRect(0, v.floorY - v.h * 0.25, v.w, v.h * 0.25);
    },
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
    fogA: 0.3,
    layers: [
      // дальние трубы: дым начинается от устья трубы, жар по ободу
      { f: 0.12, haze: 0.5, paint(c, w, h, rng) {
        for (const b of layoutRow(w, rng, 18, 30, 90, 200)) {
          const ch = lerp(h * 0.4, h * 0.72, rng()), top = h - ch, tw = b.w * 0.7, x0 = b.x + (b.w - tw) / 2;
          c.fillStyle = "#1b100d";
          c.beginPath(); c.moveTo(b.x, h); c.lineTo(x0, top); c.lineTo(x0 + tw, top); c.lineTo(b.x + b.w, h); c.closePath(); c.fill();
          c.fillRect(x0 - 2, top, tw + 4, 5);
          c.fillStyle = "rgba(255,122,26,.4)"; c.fillRect(x0 - 2, top, tw + 4, 1.5);
          for (let k = 0; k < 5; k++) {
            const r = 8 + k * 6, sx = b.x + b.w / 2 + k * 14, sy = top - 6 - k * 16;
            wrapDraw(w, sx - r, 2 * r, xx => { c.fillStyle = rgba("#3a2218", 0.17 - k * 0.028); c.beginPath(); c.arc(xx + r, sy, r, 0, TAU); c.fill(); });
          }
        }
      } },
      // цеха с пилообразными крышами; труба идёт на опорах, опоры в этом же слое
      { top: 0.5, f: 0.26, haze: 0.22, refl: 0.12, paint(c, w, h, rng) {
        c.fillStyle = "#0f0908";
        for (const b of layoutRow(w, rng, 70, 150, 0, 8)) {
          const hh = lerp(h * 0.16, h * 0.3, rng()), top = h - hh;
          c.fillRect(b.x, top, b.w, hh);
          for (let tx = b.x; tx < b.x + b.w - 1; tx += 22) {
            const tw = Math.min(22, b.x + b.w - tx);
            c.beginPath(); c.moveTo(tx, top); c.lineTo(tx, top - 12); c.lineTo(tx + tw, top); c.closePath(); c.fill();
          }
          if (rng() < 0.5) c.fillRect(b.x + b.w * 0.7, top - 28, 9, 28);
        }
        const py = h * 0.6, np = Math.round(w / 80), pw = w / np;
        for (let i = 0; i < np; i++) { c.fillRect(i * pw + pw / 2 - 2, py, 4, h - py); c.fillRect(i * pw + pw / 2 - 4, py - 6, 8, 12); }
        c.fillRect(0, py - 4, w, 8);
        c.fillStyle = "rgba(255,122,26,.22)"; c.fillRect(0, py - 4, w, 1);
      } },
      // рабочий план: ферма на колоннах, мостики с перилами между колоннами, печи с ковшом на цепи
      { top: 0.78, f: 0.42, paint(c, w, h, rng, A) {
        A.furn = []; A.hooks = [];
        const top = h * 0.28, bot = h * 0.42, N = Math.max(4, Math.round(w / 200)), cw = w / N;
        const np = Math.round(w / 56), pw = w / np;
        c.fillStyle = "#080505"; c.strokeStyle = "#080505"; c.lineCap = "butt";
        c.lineWidth = 5; c.beginPath(); c.moveTo(0, top); c.lineTo(w + TILE_PAD, top); c.moveTo(0, bot); c.lineTo(w + TILE_PAD, bot); c.stroke();
        c.lineWidth = 3; c.beginPath();
        for (let i = 0; i < np; i++) { c.moveTo(i * pw, top); c.lineTo(i * pw + pw / 2, bot); c.lineTo((i + 1) * pw, top); }
        c.stroke();
        const colX = i => (i + 0.5) * cw;
        for (let i = 0; i < N; i++) {
          for (const dx of [0, -w]) {
            const x = colX(i) + dx;
            c.fillRect(x - 6, bot, 12, h - bot); c.fillRect(x - 10, h - 5, 20, 5); c.fillRect(x - 9, bot - 2, 18, 6);
          }
        }
        for (let i = 0; i < N; i++) {
          const gx0 = colX(i) + 6, gx1 = colX(i + 1) - 6, cx = (colX(i) + colX(i + 1)) / 2;
          if (i % 2 === 0) {
            const fw = lerp(52, 70, rng()), fh = fw * 0.62, hy = h - fh;
            for (const dx of [0, -w]) {
              const x = cx + dx;
              c.fillStyle = "#150c08"; c.fillRect(x - fw / 2, hy, fw, fh);
              c.fillRect(x - fw / 2 - 3, hy - 3, fw + 6, 4);
              c.fillRect(x - 6, hy - 26, 12, 24); c.fillRect(x - 8, hy - 29, 16, 3);
              c.fillStyle = "rgba(255,122,26,.3)"; c.fillRect(x - fw / 2 - 3, hy - 3, fw + 6, 1.2); c.fillRect(x - 8, hy - 29, 16, 1.2);
              c.fillStyle = "#080505"; c.fillRect(x - 8, bot + 1, 16, 5);     // тележка на нижнем поясе
            }
            A.furn.push({ x: (cx - fw / 2 + w) % w, w: fw });
            A.hooks.push({ x: cx % w, y: bot + 6, len: (hy - 30) - (bot + 6) - 10 });
          } else {
            const yc = h * 0.64;
            for (const dx of [0, -w]) {
              c.fillStyle = "#080505"; c.strokeStyle = "#080505";
              c.fillRect(gx0 + dx, yc, gx1 - gx0, 3);
              c.fillRect(gx0 + dx, yc - 12, gx1 - gx0, 1.5);
              for (let px = gx0 + 4; px < gx1; px += 14) c.fillRect(px + dx, yc - 12, 1.5, 12);
              c.lineWidth = 2; c.beginPath();
              c.moveTo(gx0 + dx, yc + 22); c.lineTo(gx0 + 22 + dx, yc + 3); c.moveTo(gx1 + dx, yc + 22); c.lineTo(gx1 - 22 + dx, yc + 3);
              c.stroke();
            }
          }
        }
      }, dyn(c, v, m, pal, R, off, A) {
        const glow = 0.35 + 0.65 * m.low;
        for (const f of A.furn) v.repeat(off, f.x, x => {
          const y = v.floorY;
          const g = c.createRadialGradient(x + f.w / 2, y - f.w * 0.3, 4, x + f.w / 2, y - f.w * 0.3, f.w * 1.5);
          g.addColorStop(0, rgba("#ffb13b", 0.4 * glow)); g.addColorStop(0.4, rgba("#ff7a1a", 0.2 * glow)); g.addColorStop(1, "rgba(255,122,26,0)");
          c.fillStyle = g; c.fillRect(x - f.w, y - f.w * 1.8, f.w * 3, f.w * 1.8);
          c.fillStyle = rgba("#ffb13b", 0.7 * glow); c.fillRect(x + f.w * 0.2, y - f.w * 0.36, f.w * 0.6, f.w * 0.2);
          c.fillStyle = rgba("#ffd9a0", 0.5 * glow); c.fillRect(x + f.w * 0.3, y - f.w * 0.32, f.w * 0.4, f.w * 0.08);
        });
        // ковши на цепях висят на тележках нижнего пояса фермы и слегка качаются
        c.lineWidth = 1.5;
        for (let i = 0; i < A.hooks.length; i++) {
          const H = A.hooks[i];
          v.repeat(off, H.x, x => {
            const py = layerY(v, H.y), sw = Math.sin(m.time * 0.8 + i * 1.7) * 0.04 + Math.sin(m.beatF * Math.PI) * 0.01 * m.I;
            const ex = x + Math.sin(sw) * H.len, ey = py + Math.cos(sw) * H.len;
            c.strokeStyle = "#2e1b12"; c.beginPath(); c.moveTo(x, py); c.lineTo(ex, ey); c.stroke();
            c.fillStyle = "#1a0f0a";
            c.beginPath(); c.moveTo(ex - 8, ey); c.lineTo(ex + 8, ey); c.lineTo(ex + 6, ey + 12); c.lineTo(ex - 6, ey + 12); c.closePath(); c.fill();
            c.fillStyle = rgba("#ffb13b", 0.85 * glow); c.fillRect(ex - 7, ey, 14, 2);
          });
        }
      } },
    ],
    back(c, v, m, pal) {
      const g = c.createLinearGradient(0, v.floorY * 0.4, 0, v.floorY);
      g.addColorStop(0, "rgba(255,122,26,0)"); g.addColorStop(1, rgba("#ff7a1a", 0.12 + 0.18 * m.low * m.I));
      c.fillStyle = g; c.fillRect(0, 0, v.w, v.floorY);
    },
    front(c, v, m, pal, R) {
      // искры вылетают из труб печей на сильных долях и падают дугой
      if (m.strongEvent && this.A.furn && this.A.furn.length) {
        const off = v.layerOff(0.42);
        for (const f of this.A.furn) v.repeat(off, f.x, x => {
          const cx = x + f.w / 2;
          if (cx < 0 || cx > v.w) return;
          for (let i = 0; i < Math.round(7 * R.amount); i++) R.amb.push({ x: cx + rand(-4, 4), y: v.floorY - f.w * 0.62 - 28, vx: rand(-34, 34), vy: -rand(80, 210), life: rand(0.7, 1.5), c: rand() < 0.5 ? "#ffb13b" : "#ff7a1a" });
        });
      }
    },
  },
  {
    id: "moon", name: "Лунная крыша", desc: "спокойная музыка, мягкие ритмы",
    pal: { sky: ["#07080d", "#1b1a24"], glow: "#e8e2d6", neonA: "#3ef0ff", neonB: "#e8e2d6", floor: "#0a0a0e", edge: "#3ef0ff", fog: "#2a2a34" },
    profile: { loudness: [0.35, 0.3], density: [1.5, 1.6], bpm: [88, 30], dynamics: [0.6, 0.35] },
    fogA: 0.28,
    layers: [
      // дальние крыши: светлее и холоднее
      { top: 0.48, f: 0.08, haze: 0.5, paint(c, w, h, rng) {
        for (const b of layoutRow(w, rng, 30, 70, 4, 24)) {
          const bh = lerp(h * 0.1, h * 0.3, rng()), top = h - bh, k = rng();
          c.fillStyle = "#1c1e2c"; c.fillRect(b.x, top, b.w, bh);
          if (k < 0.45) { c.beginPath(); c.moveTo(b.x - 2, top); c.lineTo(b.x + b.w / 2, top - b.w * 0.3); c.lineTo(b.x + b.w + 2, top); c.fill(); }
          else if (k < 0.7) c.fillRect(b.x + b.w * 0.6, top - 12, 6, 12);
        }
      } },
      // средний план: дома со скатами, трубами и мансардными окнами
      { top: 0.5, f: 0.22, haze: 0.22, refl: 0.12, paint(c, w, h, rng) {
        for (const b of layoutRow(w, rng, 56, 110, 2, 14)) {
          const bh = lerp(h * 0.12, h * 0.28, rng()), top = h - bh, rise = lerp(18, 30, rng()), seed = (rng() * 1e9) | 0, k = rng();
          c.fillStyle = "#10111b"; c.fillRect(b.x, top, b.w, bh);
          c.beginPath(); c.moveTo(b.x - 3, top); c.lineTo(b.x + b.w / 2, top - rise); c.lineTo(b.x + b.w + 3, top); c.closePath(); c.fill();
          if (k < 0.6) { const cx = b.x + b.w * (k < 0.3 ? 0.22 : 0.74); c.fillRect(cx, top - rise * 0.75, 7, rise * 0.75 + 2); c.fillRect(cx - 1.5, top - rise * 0.75 - 3, 10, 3); }
          drawWindows(c, b.x, top, b.w, bh, { sx: 12, sy: 11, mx: 7, ww: 3, wh: 4, p: 0.1, a: "rgba(255,177,59,.4)", b: "rgba(255,177,59,.25)", mb: 14 }, seed);
        }
      } },
      // ближние крыши: трубы, антенны, баки, кот; на мачтах — гирлянды (мачты стоят на кровле)
      { top: 0.44, f: 0.42, paint(c, w, h, rng, A) {
        A.strings = [];
        const row = layoutRow(w, rng, 90, 200, 0, 12), catAt = (rng() * row.length) | 0, masts = [];
        for (let i = 0; i < row.length; i++) {
          const b = row[i], bh = lerp(h * 0.1, h * 0.19, rng()), top = h - bh, k = rng(), roofY = top - 3;
          c.fillStyle = "#08080d"; c.fillRect(b.x, top, b.w, bh); c.fillRect(b.x - 1.5, roofY, b.w + 3, 3);
          const mx0 = b.x + 10, mx1 = b.x + b.w - 11, mh0 = lerp(34, 46, rng()), mh1 = lerp(34, 46, rng());
          c.fillRect(mx0, roofY - mh0, 2, mh0); c.fillRect(mx1, roofY - mh1, 2, mh1);
          c.fillRect(mx0 - 1.5, roofY - mh0 - 2, 5, 2); c.fillRect(mx1 - 1.5, roofY - mh1 - 2, 5, 2);
          masts.push({ x0: mx0 + 1, y0: roofY - mh0, x1: mx1 + 1, y1: roofY - mh1 });
          const px = b.x + b.w * (0.3 + 0.35 * rng());
          if (k < 0.35) { c.fillRect(px, roofY - 14, 8, 14); c.fillRect(px - 1.5, roofY - 17, 11, 3); }
          else if (k < 0.65) paintMast(c, px, roofY, 20);
          else paintTank(c, px, roofY, 22);
          if (i === catAt) {      // кот сидит на коньке
            const cx = b.x + b.w * 0.5 + 24, cy = roofY;
            c.beginPath(); c.ellipse(cx, cy - 5, 5.5, 5, 0, 0, TAU); c.fill();
            c.beginPath(); c.arc(cx + 4, cy - 12, 3.4, 0, TAU); c.fill();
            c.beginPath(); c.moveTo(cx + 1.8, cy - 14); c.lineTo(cx + 2.4, cy - 18); c.lineTo(cx + 4.4, cy - 14.8); c.fill();
            c.beginPath(); c.moveTo(cx + 4.2, cy - 14.8); c.lineTo(cx + 6.4, cy - 18); c.lineTo(cx + 6.8, cy - 13.6); c.fill();
            c.strokeStyle = "#08080d"; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - 5, cy - 3); c.quadraticCurveTo(cx - 13, cy - 4, cx - 11, cy - 12); c.stroke();
          }
        }
        // гирлянды: на каждой кровле между её двумя мачтами и через щель к мачте соседней кровли
        c.strokeStyle = "#0a0a0e"; c.lineWidth = 1;
        for (let i = 0; i < row.length; i++) {
          const a = masts[i], nx = masts[(i + 1) % row.length], wrapped = i === row.length - 1;
          A.strings.push({ x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1, sag: (a.x1 - a.x0) * 0.07 });
          const gx = nx.x0 + (wrapped ? w : 0);
          if (gx - a.x1 < 60) A.strings.push({ x0: a.x1, y0: a.y1, x1: gx, y1: nx.y0, sag: Math.max(3, (gx - a.x1) * 0.12) });
        }
        for (const s of A.strings) for (const dx of [0, -w]) wire(c, s.x0 + dx, s.y0, s.x1 + dx, s.y1, s.sag);
      }, dyn(c, v, m, pal, R, off, A) {
        for (let li = 0; li < A.strings.length; li++) {
          const s = A.strings[li], n = Math.max(3, Math.round((s.x1 - s.x0) / 20));
          v.repeat(off, s.x0, x => {
            const y0 = layerY(v, s.y0), y1 = layerY(v, s.y1), dx = s.x1 - s.x0;
            for (let k = 1; k < n; k++) {
              const [bx, by] = wirePt(x, y0, x + dx, y1, s.sag, k / n);
              const lit = ((m.beat + k + li) % 8) / 8;
              c.fillStyle = rgba(k % 3 ? pal.neonA : "#ffb13b", (0.3 + 0.6 * (1 - lit) * m.pulse + 0.15) * m.I);
              c.beginPath(); c.arc(bx, by + 2.5, 2, 0, TAU); c.fill();
            }
          });
        }
      } },
    ],
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
    fogA: 0.42,
    layers: [
      { top: 0.64, f: 0.05, haze: 0.6, paint(c, w, h, rng) { paintMountains(c, w, h, rng, "#2a303a", h * 0.35, h * 0.25, "rgba(255,95,176,.16)"); } },
      { top: 0.4, f: 0.14, haze: 0.42, refl: 0.1, paint(c, w, h, rng) { paintMountains(c, w, h, rng, "#1a2028", h * 0.25, h * 0.1); } },
      // склон с пагодой и соснами; окна пагоды светятся (dyn)
      { top: 0.66, f: 0.26, haze: 0.2, paint(c, w, h, rng, A) {
        A.win = [];
        const col = "#10141a", px = w * (0.22 + 0.56 * rng());
        c.fillStyle = col; c.fillRect(px - 30, h - 8, 60, 8);
        let y = h - 8, tw = 40;
        for (let t = 0; t < 4; t++) {
          c.fillStyle = col; c.fillRect(px - tw / 2, y - 20, tw, 20);
          if (t < 3) A.win.push({ x: px - 3, y: y - 15, w: 6, hh: 8 });
          const L = px - tw / 2 - 16, R2 = px + tw / 2 + 16, yt = y - 24;
          c.beginPath(); c.moveTo(L, yt); c.quadraticCurveTo(px - tw * 0.3, y - 17, px, y - 17); c.quadraticCurveTo(px + tw * 0.3, y - 17, R2, yt);
          c.quadraticCurveTo(px + tw * 0.2, y - 25, px, y - 34); c.quadraticCurveTo(px - tw * 0.2, y - 25, L, yt); c.fill();
          y -= 26; tw *= 0.78;
        }
        c.fillRect(px - 1, y - 12, 2, 22); c.fillRect(px - 4, y - 4, 8, 1.5); c.fillRect(px - 3, y - 8, 6, 1.5);
        for (const b of layoutRow(w, rng, 16, 28, 20, 70)) {
          if (Math.abs(b.x + b.w / 2 - px) < 56) continue;
          const ph = lerp(h * 0.12, h * 0.22, rng()), cx = b.x + b.w / 2;
          c.fillRect(cx - 1.5, h - ph * 0.3, 3, ph * 0.3);
          for (let k = 0; k < 3; k++) { const yy = h - ph * (0.25 + k * 0.28), ww = b.w * (1 - k * 0.25); c.beginPath(); c.moveTo(cx - ww / 2, yy); c.lineTo(cx, yy - ph * 0.42); c.lineTo(cx + ww / 2, yy); c.fill(); }
        }
      }, dyn(c, v, m, pal, R, off, A) {
        const a = (0.35 + 0.35 * m.pulse) * (0.6 + 0.4 * m.I);
        for (const W of A.win) v.repeat(off, W.x, x => { c.fillStyle = rgba("#ffb13b", a); c.fillRect(x, layerY(v, W.y), W.w, W.hh); });
      } },
      // ближний план: тории с оберегами и фонарями на перекладине, каменные фонари, сакура
      { top: 0.66, f: 0.42, paint(c, w, h, rng, A) {
        A.lanterns = []; A.toro = []; A.crowns = [];
        const N = Math.max(3, Math.round(w / 330)), col = "#0b0d11";
        for (let i = 0; i < N; i++) {
          const sx = (i + 0.5) * w / N;
          if (i % 3 === 1) {      // сакура: ствол, ветви и крона — одно целое
            const th = h * 0.42, tx = sx, cx = tx + 10, cy = h - th * 0.82;
            c.strokeStyle = col; c.lineCap = "round"; c.lineWidth = 9; c.beginPath(); c.moveTo(tx, h); c.quadraticCurveTo(tx - 12, h - th * 0.35, cx, h - th * 0.6); c.stroke();
            c.lineWidth = 4; c.beginPath(); c.moveTo(cx, h - th * 0.55); c.quadraticCurveTo(cx - 20, h - th * 0.7, cx - 34, cy + 6); c.moveTo(cx, h - th * 0.55); c.quadraticCurveTo(cx + 22, h - th * 0.72, cx + 38, cy + 4); c.stroke();
            c.lineCap = "butt";
            c.fillStyle = "#0e0c14";
            for (const [dx, dy, r] of [[-30, 6, 24], [0, -6, 32], [32, 4, 26], [-12, 14, 22], [16, 16, 22]]) { c.beginPath(); c.arc(cx + dx, cy + dy, r, 0, TAU); c.fill(); }
            c.fillStyle = "rgba(255,95,176,.10)";
            for (const [dx, dy, r] of [[-32, 2, 12], [-2, -14, 14], [30, -4, 12]]) { c.beginPath(); c.arc(cx + dx, cy + dy, r, 0, TAU); c.fill(); }
            for (let k = 0; k < 26; k++) { const a = rng() * TAU, d = Math.sqrt(rng()) * 40; c.fillStyle = rgba("#ffc3e0", 0.18 + 0.25 * rng()); c.fillRect(cx + Math.cos(a) * d * 1.3, cy + Math.sin(a) * d * 0.8, 1.6, 1.6); }
            A.crowns.push({ x: cx, y: cy + 14, r: 38 });
            continue;
          }
          const gw = lerp(100, 130, rng()), gh = h * lerp(0.38, 0.5, rng()), gx = sx - gw / 2, topY = h - gh;
          c.fillStyle = col;
          c.fillRect(gx + gw * 0.12, topY, 9, gh); c.fillRect(gx + gw * 0.88 - 9, topY, 9, gh);
          c.beginPath(); c.moveTo(gx - 14, topY - 4); c.quadraticCurveTo(gx + gw / 2, topY + 6, gx + gw + 14, topY - 4);
          c.lineTo(gx + gw + 12, topY + 6); c.quadraticCurveTo(gx + gw / 2, topY + 14, gx - 12, topY + 6); c.fill();
          c.fillRect(gx + gw * 0.06, topY + 18, gw * 0.88, 6);
          // верёвка с оберегом — между столбами
          c.strokeStyle = "#1a1d24"; c.lineWidth = 2.2; wire(c, gx + gw * 0.12 + 9, topY + 27, gx + gw * 0.88 - 9, topY + 27, 7);
          // фонари висят на перекладине на цепях
          for (const t of [0.32, 0.68]) A.lanterns.push({ x: gx + gw * t, y: topY + 24, len: lerp(16, 28, rng()) });
          // каменный фонарь рядом с воротами, стоит на земле
          if (rng() < 0.7) {
            const lx = gx + gw + 36;
            c.fillStyle = col; c.fillRect(lx - 7, h - 6, 14, 6); c.fillRect(lx - 3, h - 22, 6, 16); c.fillRect(lx - 8, h - 36, 16, 14);
            c.beginPath(); c.moveTo(lx - 13, h - 36); c.lineTo(lx, h - 47); c.lineTo(lx + 13, h - 36); c.fill(); c.fillRect(lx - 1.5, h - 50, 3, 4);
            A.toro.push({ x: lx - 4, y: h - 33, w: 8, hh: 9 });
          }
        }
      }, dyn(c, v, m, pal, R, off, A) {
        const base = (0.4 + 0.5 * m.pulse) * m.I + 0.15;
        for (let i = 0; i < A.lanterns.length; i++) {
          const L = A.lanterns[i], sw = Math.sin(m.time * 1.3 + i * 1.9) * 0.07 + Math.sin(m.beatF * Math.PI) * 0.04 * m.I;
          v.repeat(off, L.x, x => {
            const ay = layerY(v, L.y), lx = x + Math.sin(sw) * L.len, ly = ay + Math.cos(sw) * L.len;
            c.strokeStyle = "#0b0d11"; c.lineWidth = 1; c.beginPath(); c.moveTo(x, ay); c.lineTo(lx, ly); c.stroke();
            const g = c.createRadialGradient(lx, ly + 6, 1, lx, ly + 6, 26);
            g.addColorStop(0, rgba(pal.neonA, base * 0.6)); g.addColorStop(1, "rgba(255,95,176,0)");
            c.fillStyle = g; c.fillRect(lx - 26, ly - 20, 52, 52);
            c.fillStyle = "#0b0d11"; c.fillRect(lx - 3, ly - 1, 6, 2);
            c.fillStyle = rgba(pal.neonA, base); c.beginPath(); c.ellipse(lx, ly + 6, 4, 6, 0, 0, TAU); c.fill();
          });
        }
        for (const T of A.toro) v.repeat(off, T.x, x => {
          const y = layerY(v, T.y);
          const g = c.createRadialGradient(x + T.w / 2, y + T.hh / 2, 1, x + T.w / 2, y + T.hh / 2, 22);
          g.addColorStop(0, rgba(pal.neonB, 0.28 * base)); g.addColorStop(1, "rgba(255,177,59,0)");
          c.fillStyle = g; c.fillRect(x - 18, y - 18, T.w + 36, T.hh + 36);
          c.fillStyle = rgba(pal.neonB, 0.55 + 0.3 * m.pulse); c.fillRect(x, y, T.w, T.hh);
        });
      } },
    ],
    back(c, v, m, pal) {
      const g = c.createRadialGradient(v.w * 0.5, v.floorY * 0.7, 10, v.w * 0.5, v.floorY * 0.7, v.w * 0.6);
      g.addColorStop(0, rgba("#ff5fb0", 0.06 + 0.08 * m.I)); g.addColorStop(1, "rgba(255,95,176,0)");
      c.fillStyle = g; c.fillRect(0, 0, v.w, v.floorY);
    },
    front(c, v, m, pal, R) {
      // лепестки слетают с крон сакуры (и немного — ветром сверху) по верхним частотам
      if (this.A.crowns && this.A.crowns.length && rand() < (0.12 + m.high * 0.6) * R.amount) {
        const cr = this.A.crowns[(rand() * this.A.crowns.length) | 0], off = v.layerOff(0.42);
        v.repeat(off, cr.x, x => {
          if (x < -20 || x > v.w + 20 || rand() < 0.5) return;
          R.amb.push({ x: x + rand(-cr.r, cr.r), y: v.floorY - (v.tileH - cr.y) + rand(-6, 14), vx: rand(-10, 30), vy: rand(14, 36), life: 7, c: rand() < 0.7 ? "#ffc3e0" : "#e8e2d6", petal: true });
        });
      }
      if (rand() < 0.02 * R.amount) R.amb.push({ x: rand(0, v.w), y: -5, vx: rand(-20, 30), vy: rand(20, 45), life: 7, c: "#ffc3e0", petal: true });
    },
  },
  {
    id: "cathedral", name: "Собор лучей", desc: "кинематографичная музыка, нарастания",
    pal: { sky: ["#06060b", "#15131f"], glow: "#7a5cff", neonA: "#7a5cff", neonB: "#cfd8ff", floor: "#08080d", edge: "#7a5cff", fog: "#262338" },
    profile: { dynamics: [0.8, 0.25], energyVar: [0.6, 0.3], bpm: [95, 35], density: [1.8, 1.6] },
    fogA: 0.36,
    layers: [
      // стена нефа: витражи (готические окна и розетки), трифорий; лучи падают из самих окон
      { f: 0.08, haze: 0.4, paint(c, w, h, rng, A) {
        A.glass = [];
        const wg = c.createLinearGradient(0, 0, 0, h);   // сверху стена тает — край тайла не виден при сдвиге камеры
        wg.addColorStop(0, "rgba(20,18,31,0)"); wg.addColorStop(0.2, "rgba(20,18,31,1)"); wg.addColorStop(1, "#14121f");
        c.fillStyle = wg; c.fillRect(0, 0, w + TILE_PAD, h);
        const NB = Math.max(4, Math.round(w / 190)), bw = w / NB;
        for (let i = 0; i < NB; i++) {
          const bx = i * bw, rose = i % 3 === 1;
          c.strokeStyle = "#242136"; c.lineWidth = 2;
          if (rose) {
            const r = h * 0.12, cx = bx + bw / 2, cy = h * 0.32;
            c.fillStyle = "#07060d"; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill(); c.stroke();
            A.glass.push({ x: cx - r, y: cy - r, w: r * 2, hh: r * 2, rose: true, cx, cy, r, c: i % 2, ray: false });
          } else {
            const ww = lerp(34, 44, rng()), wh = h * 0.44, wx = bx + (bw - ww) / 2, wy = h * 0.14;
            c.fillStyle = "#07060d"; archPath(c, wx, wy, ww, wh); c.fill(); c.stroke();
            A.glass.push({ x: wx, y: wy, w: ww, hh: wh, rose: false, c: i % 2, ray: i % 2 === 0 });
          }
          c.strokeStyle = "#1e1c2e"; c.lineWidth = 1.5;
          for (let k = 0; k < 3; k++) { archPath(c, bx + bw * 0.14 + k * bw * 0.26, h * 0.62, 14, 26); c.stroke(); }
        }
      }, dyn(c, v, m, pal, R, off, A) {
        const R2 = R.arena, a = (0.2 + 0.4 * m.mid) * m.I + 0.1;
        c.save(); c.globalCompositeOperation = "lighter";
        for (const G of A.glass) {
          if (!G.ray) continue;
          v.repeat(off, G.x, x => {
            const yb = layerY(v, G.y + G.hh * 0.8), s = 0.05 + 0.1 * m.I + 0.05 * m.strong;
            const g = c.createLinearGradient(x, yb, x + 70, v.floorY);
            g.addColorStop(0, rgba(R2.neon(G.c), s * (0.6 + 0.4 * m.mid))); g.addColorStop(1, rgba(R2.neon(G.c), 0));
            c.fillStyle = g; c.beginPath(); c.moveTo(x + 2, yb); c.lineTo(x + G.w - 2, yb); c.lineTo(x + G.w + 120, v.floorY); c.lineTo(x + 50, v.floorY); c.closePath(); c.fill();
          });
        }
        for (const G of A.glass) v.repeat(off, G.x, x => {
          const y = layerY(v, G.y);
          c.fillStyle = rgba(R2.neon(G.c), a * 0.8);
          if (G.rose) { c.beginPath(); c.arc(x + G.r, y + G.r, G.r - 1.5, 0, TAU); c.fill(); }
          else { archPath(c, x + 1.5, y + 1.5, G.w - 3, G.hh - 3); c.fill(); }
        });
        c.restore();
        // переплёты поверх света
        c.strokeStyle = "#0a0910"; c.lineWidth = 1.5;
        for (const G of A.glass) v.repeat(off, G.x, x => {
          const y = layerY(v, G.y); c.beginPath();
          if (G.rose) { for (let k = 0; k < 6; k++) { const an = k / 6 * Math.PI; c.moveTo(x + G.r + Math.cos(an) * G.r, y + G.r + Math.sin(an) * G.r); c.lineTo(x + G.r - Math.cos(an) * G.r, y + G.r - Math.sin(an) * G.r); } c.moveTo(x + G.r * 1.55, y + G.r); c.arc(x + G.r, y + G.r, G.r * 0.55, 0, TAU); }
          else { c.moveTo(x + G.w / 2, y + 2); c.lineTo(x + G.w / 2, y + G.hh); c.moveTo(x + 1, y + G.hh * 0.45); c.lineTo(x + G.w - 1, y + G.hh * 0.45); }
          c.stroke();
        });
      } },
      // аркада: колонны со стрельчатыми арками между капителями
      { f: 0.26, haze: 0.12, refl: 0.1, paint(c, w, h) {
        const NC = Math.max(4, Math.round(w / 150)), cw = w / NC, tc = h * 0.2;
        c.fillStyle = "#0b0a12"; c.strokeStyle = "#0b0a12"; c.lineWidth = 5; c.lineJoin = "round";
        for (let i = 0; i < NC; i++) {
          for (const dx of [0, -w]) {
            const x = (i + 0.5) * cw + dx;
            c.fillRect(x - 11, tc, 22, h - tc); c.fillRect(x - 16, h - 8, 32, 8); c.fillRect(x - 15, tc - 6, 30, 8);
            c.beginPath(); c.moveTo(x - 16, tc - 6); c.lineTo(x + 16, tc - 6); c.lineTo(x + 11, tc + 4); c.lineTo(x - 11, tc + 4); c.closePath(); c.fill();
            const x2 = x + cw;
            c.beginPath(); c.moveTo(x + 14, tc - 6); c.quadraticCurveTo(x + 14 + (cw - 28) * 0.05, tc - 52, (x + x2) / 2, tc - 56); c.quadraticCurveTo(x2 - 14 - (cw - 28) * 0.05, tc - 52, x2 - 14, tc - 6); c.stroke();
          }
        }
        c.lineJoin = "miter";
      } },
      // ближний план: тяжёлые колонны и подсвечники на полу (пламя — dyn)
      { f: 0.42, paint(c, w, h, rng, A) {
        A.flames = [];
        const NC = Math.max(2, Math.round(w / 340)), cw = w / NC, tc = h * 0.16;
        c.fillStyle = "#06060a"; c.strokeStyle = "#06060a";
        for (let i = 0; i < NC; i++) {
          const x = (i + 0.5) * cw;
          c.fillRect(x - 17, tc, 34, h - tc); c.fillRect(x - 24, h - 10, 48, 10); c.fillRect(x - 22, tc - 8, 44, 10);
          c.fillStyle = "#0c0b14"; for (const sx of [-6, 4]) c.fillRect(x + sx, tc + 14, 1.5, h - tc - 30); c.fillStyle = "#06060a";
          const sx = x + cw / 2;        // подсвечник посередине между колоннами
          c.fillRect(sx - 8, h - 4, 16, 4); c.fillRect(sx - 1.5, h - 60, 3, 56);
          c.lineWidth = 1.5; c.beginPath(); c.moveTo(sx - 14, h - 62); c.quadraticCurveTo(sx, h - 50, sx + 14, h - 62); c.stroke();
          for (const dx of [-14, 0, 14]) { const cy = dx === 0 ? h - 62 : h - 62; c.fillRect(sx + dx - 3, cy, 6, 2); c.fillRect(sx + dx - 1, cy - 6, 2, 6); A.flames.push({ x: sx + dx, y: h - 70 }); }
        }
      }, dyn(c, v, m, pal, R, off, A) {
        c.save(); c.globalCompositeOperation = "lighter";
        const fl = 0.7 + 0.3 * m.I;
        for (let i = 0; i < A.flames.length; i++) {
          const F = A.flames[i], j = 0.75 + 0.25 * Math.sin(m.time * 9 + i * 2.3);
          v.repeat(off, F.x, x => {
            const y = layerY(v, F.y);
            const g = c.createRadialGradient(x, y, 1, x, y, 18);
            g.addColorStop(0, rgba("#ffb13b", 0.28 * fl * j)); g.addColorStop(1, "rgba(255,177,59,0)");
            c.fillStyle = g; c.fillRect(x - 18, y - 18, 36, 36);
            c.fillStyle = rgba("#ffd9a0", 0.8 * j); c.beginPath(); c.ellipse(x, y + 2, 1.5, 3.2 * j, 0, 0, TAU); c.fill();
          });
        }
        c.restore();
      } },
    ],
    back(c, v, m, pal) {
      // свод: мягкий свет сверху, тянется к лучам витражей
      const g = c.createRadialGradient(v.w / 2, 0, 10, v.w / 2, 0, v.h * 0.9);
      g.addColorStop(0, rgba(pal.neonA, 0.08 + 0.1 * m.I)); g.addColorStop(1, rgba(pal.neonA, 0));
      c.fillStyle = g; c.fillRect(0, 0, v.w, v.floorY);
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
    this.releaseTiles();
    const th = this.theme, pal = th.pal;
    th.A = {};      // якоря опор декора (координаты тайла): пишет paint, читают dyn и front
    this.tiles = th.layers.map(L => {
      // слой с низким содержимым (top — доля высоты от пола) хранит только нижнюю часть: меньше памяти и заливки
      const ch = Math.min(tileH, Math.ceil(tileH * (L.top || 1)));
      // дальние слои и так размыты туманом — рисуем их в обычном разрешении (на HiDPI экономия в ~2 раза)
      const td = L.haze >= 0.4 ? Math.min(dpr, 1) : dpr;
      const cv = document.createElement("canvas");
      cv.width = Math.ceil((tileW + TILE_PAD) * td); cv.height = Math.ceil(ch * td);
      const c = cv.getContext("2d");
      c.scale(td, td); c.translate(0, ch - tileH);      // paint рисует в координатах полного тайла
      L.paint(c, tileW, tileH, rng, th.A);
      // атмосферная перспектива: основания дальних силуэтов тонут в тумане
      if (L.haze) {
        c.globalCompositeOperation = "source-atop";
        const g = c.createLinearGradient(0, 0, 0, tileH);
        g.addColorStop(0, rgba(pal.fog, 0)); g.addColorStop(1, rgba(pal.fog, L.haze));
        c.fillStyle = g; c.fillRect(0, 0, tileW + TILE_PAD, tileH);
        c.globalCompositeOperation = "source-over";
      }
      // запас справа — копия начала тайла: при дробном сдвиге между тайлами нет просвета
      c.drawImage(cv, 0, 0, TILE_PAD * td, cv.height, tileW, tileH - ch, TILE_PAD, ch);
      // после сброса GPU содержимое холста теряется — перерисовать при восстановлении
      cv.addEventListener("contextrestored", () => this.invalidate());
      return { cv, ctx: c, f: L.f, ch, dpr: td };
    });
    if (this.theme.build) this.theme.build(rng, tileW, tileH);
    this._vig = null;
  }

  /** Сбросить кэш фона: тайлы пересоберутся на следующем кадре. */
  invalidate() { this.key = ""; this._vig = null; }
  /** Освободить видеопамять старых тайлов сразу, не дожидаясь сборки мусора. */
  releaseTiles(list = this.tiles) {
    for (const t of list || []) { t.cv.width = 0; t.cv.height = 0; }
  }
  /**
   * Проверка после возможного сброса GPU (Android сбрасывает графический процесс браузера при нагреве
   * или нехватке видеопамяти): содержимое внеэкранных холстов стирается, а сами они рисуются только
   * один раз — фон терял здания/горы. Если контекст потерян или был потерян — пересобираем тайлы.
   */
  checkLost() {
    for (const t of this.tiles) if (t.ctx && t.ctx.isContextLost && t.ctx.isContextLost()) { this.invalidate(); return true; }
    return false;
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
    R.arena = this;
    th.back(ctx, v, m, pal, R);
    // слои от дальнего к ближнему; анимированная часть слоя (dyn) — сразу после его тайла, с тем же сдвигом
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i], L = th.layers[i], off = v.layerOff(t.f);
      for (let x = off; x < v.w; x += this.tileW) ctx.drawImage(t.cv, x, v.floorY - t.ch, this.tileW + TILE_PAD, t.ch);
      if (L.dyn) L.dyn(ctx, v, m, pal, R, off, th.A);
    }
    // туман у земли — за персонажами, чтобы силуэты читались
    const fh = Math.max(40, this.tileH * 0.2), fa = th.fogA == null ? 0.3 : th.fogA;
    const fg0 = ctx.createLinearGradient(0, v.floorY - fh, 0, v.floorY);
    fg0.addColorStop(0, rgba(pal.fog, 0)); fg0.addColorStop(1, rgba(pal.fog, fa * (0.8 + 0.2 * (1 - m.I))));
    ctx.fillStyle = fg0; ctx.fillRect(0, v.floorY - fh, v.w, fh + 1);
    if (th.mid) th.mid(ctx, v, m, pal, R);
    this.variantBack(ctx, v, m, R);
    // пол
    const fg = ctx.createLinearGradient(0, v.floorY, 0, v.h);
    fg.addColorStop(0, pal.floor); fg.addColorStop(1, "#000000");
    ctx.fillStyle = fg; ctx.fillRect(0, v.floorY, v.w, v.h - v.floorY);
    if (th.floor) th.floor(ctx, v, m, pal, R);
    if (R.amount >= 1) this.drawReflections(ctx, v, pal);
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

  /** Отражение нижней полосы слоёв (refl) в полу: тайл переворачивается и тает к низу. */
  drawReflections(ctx, v, pal) {
    const rh = Math.min(44, this.tileH * 0.16), th = this.theme;
    let any = false;
    for (let i = 0; i < this.tiles.length; i++) {
      const L = th.layers[i], t = this.tiles[i];
      if (!L.refl) continue;
      any = true;
      ctx.save(); ctx.globalAlpha = L.refl; ctx.translate(0, v.floorY); ctx.scale(1, -1);
      for (let x = v.layerOff(t.f); x < v.w; x += this.tileW) ctx.drawImage(t.cv, 0, t.cv.height - rh * t.dpr, t.cv.width, rh * t.dpr, x, -rh, this.tileW + TILE_PAD, rh);
      ctx.restore();
    }
    if (!any) return;
    const fc = mixHex(pal.floor, "#000000", clamp(rh / Math.max(1, v.h - v.floorY), 0, 1));
    const g = ctx.createLinearGradient(0, v.floorY, 0, v.floorY + rh);
    g.addColorStop(0, rgba(pal.floor, 0.2)); g.addColorStop(1, rgba(fc, 1));
    ctx.fillStyle = g; ctx.fillRect(0, v.floorY, v.w, rh);
  }

  /** Платформа в мировых координатах (ctx уже в мире): стоит на опорах, а в «бездне» парит на излучателях. */
  drawPlatform(ctx, x, y, w, m) {
    const pal = this.theme.pal, len = -(y + 9);
    if (this.theme.hover) {
      const g = ctx.createRadialGradient(x + w / 2, y + 10, 2, x + w / 2, y + 10, w * 0.55);
      g.addColorStop(0, rgba(pal.edge, 0.22 + 0.2 * m.pulse * m.I)); g.addColorStop(1, rgba(pal.edge, 0));
      ctx.fillStyle = g; ctx.fillRect(x - w * 0.1, y + 9, w * 1.2, 46);
      ctx.fillStyle = rgba(pal.edge, 0.7); ctx.fillRect(x + 14, y + 9, 12, 2); ctx.fillRect(x + w - 26, y + 9, 12, 2);
    } else if (len > 8) {
      ctx.fillStyle = "rgba(6,7,10,.8)";
      ctx.fillRect(x + 12, y + 9, 3, len); ctx.fillRect(x + w - 15, y + 9, 3, len);
      ctx.fillRect(x + 8, -2, 11, 2); ctx.fillRect(x + w - 19, -2, 11, 2);
      ctx.fillStyle = rgba(pal.edge, 0.22); ctx.fillRect(x + 12, y + 9, 1, len); ctx.fillRect(x + w - 15, y + 9, 1, len);
    }
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
    this.theme = theme; this.key = ""; this.tiles = [];     // живые тайлы игры не трогаем
    const v = { w, h, floorY: h * 0.78, camX: 300, scale: 1 };
    const m = { pulse: 0.6, strong: 0.5, low: 0.6, mid: 0.5, high: 0.5, I: 0.85, intensity: 0.7, beat: 3, beatF: 0.3, phase: 0.3, time: 2, level: "mid" };
    try { this.drawBack(c, v, m, { dpr: 1, dt: 0, amount: 0.4, amb: [], flashes: false }); }
    catch (e) { c.fillStyle = theme.pal.sky[1]; c.fillRect(0, 0, w, h); }
    this.releaseTiles();      // тайлы превью больше не нужны — освобождаем видеопамять сразу
    this.theme = saved; this.tiles = savedTiles; this.tileW = sw; this.tileH = sh;
    this.key = theme === saved ? "" : savedKey;   // состояние темы перестроено под превью
  }
}
