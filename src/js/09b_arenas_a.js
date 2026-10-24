/* =====================================================================
   Арены, набор А: «Ливневые крыши», «Ночной экспресс», «Мираж», «Контейнерный порт».
   Добавляются в THEMES после базовых (09_arena.js), id собирает 09z_themes.js.
   Правила те же: всё подвесное крепится к опорам в том же слое (paint пишет якоря в A, dyn их читает),
   ряды объектов — layoutRow, статика — один раз в тайл, анимация — дешёвая (без градиентов в цикле).
   Всё в блоке { }: локальные имена не пересекаются с другими модулями арен.
   ===================================================================== */
{
  /** Мировая x → экран (для деталей пола, которые едут вместе с камерой). */
  const worldX = (v, X) => (X - v.camX) * v.scale + v.w / 2;
  /** Ферма между двумя вертикалями: зигзаг раскосов. */
  const lattice = (c, xl, xr, yTop, yBot, step) => {
    c.beginPath();
    let up = false;
    for (let y = yBot; y - step >= yTop - 0.01; y -= step, up = !up) {
      c.moveTo(up ? xr : xl, y); c.lineTo(up ? xl : xr, y - step);
    }
    c.stroke();
  }
  /** Звёзды (мерцают от верхов): n штук в верхней части неба. */
  const stars = (c, v, m, n, col, frac) => {
    for (let i = 0; i < n; i++) {
      const tw = 0.25 + 0.6 * hash1(i * 3 + Math.floor(m.time * 1.5 + i));
      c.fillStyle = rgba(col, (0.15 + 0.4 * m.high) * tw);
      c.fillRect(hash1(i + 11) * v.w, hash1(i + 71) * v.floorY * frac, 1.5, 1.5);
    }
  }
  /** Мигающий сигнальный огонь на вершине опоры. */
  const blink = (c, v, m, off, list, col, every) => {
    const a = (m.beat % every === 0 ? 0.35 + 0.65 * m.pulse : 0.12);
    for (const B of list) v.repeat(off, B.x, x => {
      const y = layerY(v, B.y);
      c.fillStyle = rgba(col, 0.12 * a); c.fillRect(x - 5, y - 5, 10, 10);
      c.fillStyle = rgba(col, 0.3 + 0.65 * a); c.fillRect(x - 1, y - 1, 2.5, 2.5);
    });
  }

  /* ---------- облака «Ливневых крыш» ---------- */
  // Три гряды (дальняя светлее и туманнее, ближняя темнее и крупнее). Гряда — ряд перекрывающихся кругов-«клубов»,
  // нарисованных тремя проходами: широкое мягкое гало → тонкое ядро. Все клубы одной гряды заливаются ОДНИМ путём
  // (объединение без наложения альфы — чистый силуэт). Подсветка кромок без градиентов: тот же путь, сдвинутый
  // вниз на пару пикселей неоном города (виден узкой полоской по нижней кромке) и вверх — отсветом луны.
  // Молния: вся гряда светлеет, а клубы возле удара — сильнее. Дрейф медленный, привязан к времени и параллаксу.
  const CLOUD_BANKS = [
    // y — высота центра (доля пола), th — толщина, r — радиусы (доли пола), col/a — цвет и плотность ядра, rim — подсветка снизу
    { y: 0.3, th: 0.09, sq: 0.4, r0: 0.05, r1: 0.1, n: 22, col: "#1b3050", a: 0.42, sp: 3.5, par: 0.02, rim: 0.25, up: 0.5 },
    { y: 0.2, th: 0.1, sq: 0.38, r0: 0.055, r1: 0.12, n: 24, col: "#0a1626", a: 0.6, sp: 7, par: 0.045, rim: 0.5, up: 0.35 },
    { y: 0.09, th: 0.1, sq: 0.36, r0: 0.065, r1: 0.14, n: 20, col: "#03060d", a: 0.8, sp: 12, par: 0.08, rim: 0.7, up: 0.15 },
  ];
  /** Клубы гряд: x в долях периода, y в долях толщины, радиус в долях [r0, r1] (с огибающей: середина толще). */
  const buildClouds = rng => CLOUD_BANKS.map(B => {
    const n = B.n, x = new Float32Array(n), y = new Float32Array(n), r = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.3 + 0.4 * rng()) / n, env = 0.5 + 0.5 * Math.sin(u * TAU * 2 + rng() * 0.8) * Math.sin(u * TAU * 3.1 + 1);
      x[i] = u; r[i] = lerp(B.r0, B.r1, Math.pow(rng(), 1.4) * (0.45 + 0.55 * env)); y[i] = (rng() - 0.5) * 2 * (0.4 + 0.6 * env);
    }
    return { x, y, r };
  });
  /** Один проход: объединённый путь всех видимых клубов гряды (масштаб радиуса k, сдвиг по y — dy, только клубы с |x−bx| < near). */
  const cloudPath = (c, B, G, P, off, F, k, dy, w, bx, near) => {
    c.beginPath();
    for (let i = 0; i < B.n; i++) {
      const ry = G.r[i] * F * B.sq, rx = G.r[i] * F * 2.3, cy = F * B.y + G.y[i] * F * B.th + dy;   // вытянутые «слоистые» клубы
      for (let xx = off + G.x[i] * P; xx < w + rx * 1.5; xx += P) {
        if (xx < -rx * 1.5 || (near > 0 && Math.abs(xx - bx) > near)) continue;
        c.moveTo(xx + rx * k, cy); c.ellipse(xx, cy, rx * k, ry * k, 0, 0, TAU);
      }
    }
  };
  const cloudWarm = { v: 0 };
  const drawClouds = (c, v, m, R, th, fl, bx, soft) => {
    const F = v.floorY, P = v.w + 720, cl = th.clouds, low = R.amount < 1;
    cloudWarm.v = damp(cloudWarm.v, 0.55 + 0.45 * m.I, 0.8, Math.min(R.dt || 0.016, 0.05));   // медленный отсвет города
    for (let b = 0; b < 3; b++) {
      const B = CLOUD_BANKS[b], G = cl[b];
      const off = -((m.time * B.sp + v.camX * v.scale * B.par) % P + P) % P;
      if (!low) { cloudPath(c, B, G, P, off, F, 1.3, 0, v.w, 0, 0); c.fillStyle = rgba(B.col, B.a * 0.2); c.fill(); }   // мягкий край: слой гало вокруг ядра
      if (b > 0 || fl > 0.05) {   // подсветка снизу неоном города (ядро закроет всё, кроме полоски у нижней кромки); дальняя гряда — только при молнии
        cloudPath(c, B, G, P, off, F, 1.0, 2.5 + 2 * b, v.w, 0, 0); c.fillStyle = rgba(R.arena.neon(b === 1 ? 1 : 0), 0.2 * B.rim * cloudWarm.v + 0.5 * fl * soft); c.fill();
      }
      cloudPath(c, B, G, P, off, F, 1.0, 0, v.w, 0, 0); c.fillStyle = rgba(B.col, B.a); c.fill();   // ядро
      if (fl > 0.02) {   // молния: гряда целиком чуть светлеет, клубы возле удара — сильнее
        cloudPath(c, B, G, P, off, F, 1.0, 0, v.w, 0, 0); c.fillStyle = rgba("#9cc8ff", 0.22 * fl * soft * (1 - 0.3 * b)); c.fill();
        cloudPath(c, B, G, P, off, F, 1.15, 0, v.w, bx, v.w * 0.22); c.fillStyle = rgba("#dcebff", 0.3 * fl * soft); c.fill();
      }
    }
  };

  /* ---------- состояние молний «Ливневых крыш» ---------- */
  const rainS = { fl: 0, bolt: null, prevDF: 0, cool: 0 };
  const newBolt = () => {
    const pts = [[0.2 + rand() * 0.6, -0.02]];
    let x = pts[0][0], y = -0.02;
    while (y < 0.62) { y += 0.06 + rand() * 0.07; x += (rand() - 0.5) * 0.07; pts.push([x, y]); }
    const k = 2 + ((rand() * 3) | 0), br = pts[k], b2 = [br];
    let bx = br[0], by = br[1];
    for (let i = 0; i < 3; i++) { by += 0.05 + rand() * 0.04; bx += (rand() < 0.5 ? -1 : 1) * 0.04; b2.push([bx, by]); }
    return [pts, b2];
  }

  /* ===================================================================
     1. ЛИВНЕВЫЕ КРЫШИ
     =================================================================== */
  THEMES.push({
    id: "rain", name: "Ливневые крыши", desc: "мрачный средний темп, много верхов, дождь и молнии на дропе",
    pal: { sky: ["#050b16", "#1a2b44"], glow: "#4aa8ff", neonA: "#43d6ff", neonB: "#ff4fa0", floor: "#05080e", edge: "#43d6ff", fog: "#15263a" },
    profile: { bpm: [98, 22], high: [0.32, 0.1], bright: [0.45, 0.14], dynamics: [0.5, 0.3], density: [3, 2.2] },
    fogA: 0.34,
    build(rng) { this.clouds = buildClouds(rng); },
    layers: [
      // дальние башни с антеннами; на антеннах — красные огни
      { top: 0.84, f: 0.07, haze: 0.55, paint(c, w, h, rng, A) {
        A.beacons = [];
        for (const b of layoutRow(w, rng, 34, 70, 0, 10)) {
          const bh = lerp(h * 0.28, h * 0.62, Math.pow(rng(), 1.2)), top = h - bh, k = rng(), seed = (rng() * 1e9) | 0;
          c.fillStyle = "#15233a"; c.fillRect(b.x, top, b.w, bh);
          if (k < 0.4) { const mx = b.x + b.w * (0.3 + 0.4 * rng()), mh = lerp(18, 34, rng()); c.fillRect(mx, top - mh, 2, mh); A.beacons.push({ x: mx + 1, y: top - mh }); }
          else if (k < 0.6) c.fillRect(b.x + b.w * 0.15, top - 8, b.w * 0.7, 8);
          drawWindows(c, b.x, top, b.w, bh, { sx: 7, sy: 9, mx: 4, ww: 2, wh: 3, p: 0.035, a: "rgba(67,214,255,.22)", b: "rgba(255,79,160,.16)" }, seed);
        }
      }, dyn(c, v, m, pal, R, off, A) { blink(c, v, m, off, A.beacons, "#ff4f5a", 2); } },
      // средний план: плоские кровли с баками и мачтами
      { top: 0.52, f: 0.22, haze: 0.22, refl: 0.12, paint(c, w, h, rng, A) {
        A.beacons = [];
        for (const b of layoutRow(w, rng, 52, 100, 2, 14)) {
          const bh = lerp(h * 0.16, h * 0.44, Math.pow(rng(), 1.15)), top = h - bh, roofY = top - 3, k = rng(), seed = (rng() * 1e9) | 0;
          c.fillStyle = "#0b1522"; c.fillRect(b.x, top, b.w, bh); c.fillRect(b.x - 1.5, roofY - 2, b.w + 3, 5);
          if (k < 0.3) paintTank(c, b.x + b.w * 0.25, roofY - 2, b.w * 0.3);
          else if (k < 0.6) { const mx = b.x + b.w * (0.3 + 0.4 * rng()); paintMast(c, mx, roofY - 2, 28); A.beacons.push({ x: mx + 1, y: roofY - 30 }); }
          else { c.fillRect(b.x + b.w * 0.2, roofY - 8, 14, 6); c.fillRect(b.x + b.w * 0.58, roofY - 10, 18, 8); }
          if (rng() < 0.3) { c.fillStyle = "rgba(67,214,255,.2)"; c.fillRect(b.x + b.w - 1.5, top + 2, 1.5, bh * 0.6); }
          drawWindows(c, b.x, top, b.w, bh, { sx: 6, sy: 8, mx: 4, ww: 2.5, wh: 3, p: 0.08, a: "rgba(255,177,59,.34)", b: "rgba(67,214,255,.3)", mb: 20 }, seed);
        }
      }, dyn(c, v, m, pal, R, off, A) { blink(c, v, m, off, A.beacons, "#ff4f5a", 4); } },
      // ближние кровли: парапет, вентиляция, антенны с проводами, неоновые щиты на стойках, водосточные трубы
      { top: 0.4, f: 0.45, paint(c, w, h, rng, A) {
        A.signs = []; A.drips = [];
        const row = layoutRow(w, rng, 110, 220, 0, 10), tops = [];
        for (let i = 0; i < row.length; i++) {
          const b = row[i], bh = lerp(h * 0.1, h * 0.22, rng()), top = h - bh, roofY = top - 3;
          c.fillStyle = "#04070c"; c.fillRect(b.x, top, b.w, bh); c.fillRect(b.x - 2, roofY - 4, b.w + 4, 7);
          c.fillStyle = "rgba(67,214,255,.14)"; c.fillRect(b.x - 2, roofY - 4, b.w + 4, 1);   // мокрая кромка парапета
          // водосточная труба по стене от кровли до низа, на конце колено
          const px = b.x + 9;
          c.fillStyle = "#0a0f17"; c.fillRect(px, roofY, 3, h - roofY - 12); c.fillRect(px, h - 13, 8, 3);
          A.drips.push({ x: px + 7, y: h - 11, k: i });
          // вентиляционные короба
          c.fillStyle = "#04070c";
          const vx = b.x + b.w * (0.25 + 0.1 * rng());
          c.fillRect(vx, roofY - 14, 16, 10); c.fillRect(vx + 3, roofY - 17, 10, 3);
          // телеантенна: мачта на кровле и три перекладины
          const mx = b.x + b.w * (0.58 + 0.2 * rng()), mh = lerp(30, 46, rng());
          c.fillRect(mx, roofY - 4 - mh, 2, mh);
          for (let j = 0; j < 3; j++) c.fillRect(mx - 7 + j * 2, roofY - 4 - mh + 3 + j * 6, 16 - j * 4, 1.5);
          tops.push({ x: mx + 1, y: roofY - 4 - mh + 2 });
          // неоновый щит на двух стойках, стоящих на кровле
          if (rng() < 0.55) {
            const sw = lerp(34, 58, rng()), sx = b.x + b.w * (0.5 - 0.5 * rng()) + 10, sy = roofY - 4 - 30;
            if (sx + sw < mx - 10 || sx > mx + 14) {
              c.fillStyle = "#0b111b"; c.fillRect(sx + 4, roofY - 8, 2, 8); c.fillRect(sx + sw - 6, roofY - 8, 2, 8);
              c.fillRect(sx - 1, sy - 1, sw + 2, 18);
              A.signs.push({ x: sx, y: sy, w: sw, hh: 16, c: rng() < 0.5 ? 0 : 1, k: A.signs.length });
            }
          }
        }
        // провода: от антенны к антенне соседней кровли (последняя — через шов к первой)
        c.strokeStyle = "#060a11"; c.lineWidth = 1;
        for (let i = 0; i < tops.length; i++) {
          const a = tops[i], nx = tops[(i + 1) % tops.length], gx = nx.x + (i === tops.length - 1 ? w : 0);
          if (gx - a.x > 330) continue;
          for (const dx of [0, -w]) wire(c, a.x + dx, a.y, gx + dx, nx.y, Math.max(4, (gx - a.x) * 0.07));
        }
      }, dyn(c, v, m, pal, R, off, A) {
        const nA = R.arena.neon(0), nB = R.arena.neon(1);
        for (const s of A.signs) {
          const flick = hash1(Math.floor(m.time * 12) + s.k * 7) < 0.1 ? 0.25 : 1;
          const lit = (m.beat + s.k) % 3 === 0 ? 1 : 0.4;
          const a = clamp((0.25 + 0.75 * lit * (0.5 + 0.5 * m.pulse)) * m.I * flick, 0, 1), col = s.c ? nB : nA;
          v.repeat(off, s.x, x => {
            const y = layerY(v, s.y);
            c.strokeStyle = rgba(col, a); c.lineWidth = 1.5; c.strokeRect(x + 0.5, y + 0.5, s.w - 1, s.hh - 1);
            c.fillStyle = rgba(col, a * 0.7); c.fillRect(x + 4, y + 4, (s.w - 8) * (0.4 + 0.6 * lit), s.hh - 8);
          });
        }
        // капли из колен труб: падают на пол и разбегаются кольцом
        c.fillStyle = "rgba(160,215,255,.7)";
        for (const d of A.drips) {
          const t = (m.time * 1.3 + hash1(d.k * 5) * 3) % 1;
          if (t > 0.8) continue;
          v.repeat(off, d.x, x => {
            const y = layerY(v, d.y) + t * 13;
            c.fillRect(x - 0.5, y, 1.2, 3);
          });
        }
      } },
    ],
    back(c, v, m, pal, R) {
      const S = rainS, kw = R.arena.kw, A = R.arena, dt = R.dt;
      // луна за тучами: размытое пятно и тёмные облачные полосы
      const mx = v.w * 0.7 - v.camX * v.scale * 0.02, my = v.floorY * 0.22;
      const g = c.createRadialGradient(mx, my, 6, mx, my, v.h * 0.45);
      g.addColorStop(0, rgba("#7fb0ff", 0.14 + 0.05 * m.low)); g.addColorStop(1, "rgba(127,176,255,0)");
      c.fillStyle = g; c.fillRect(0, 0, v.w, v.floorY);
      // облака рисуются ниже, после расчёта молнии (нужна её яркость и место удара)
      // --- молнии: сильный удар на входе в дроп, короткие вспышки на сильных долях кульминации и редко в обычном бою
      S.cool -= dt;
      const edge = A.dropFlash > S.prevDF + 0.4;
      S.prevDF = A.dropFlash;
      if (edge || (m.strongEvent && S.cool <= 0 && rand() < (kw.climax + kw.drop > 0.4 ? 0.6 : 0.07))) {
        S.fl = edge ? 1 : 0.7; S.bolt = newBolt(); S.cool = edge ? 3 : (kw.climax + kw.drop > 0.4 ? 1.8 : 7);
      }
      if (S.fl <= 0) drawClouds(c, v, m, R, this, 0, 0, 1);
      if (S.fl > 0) {
        S.fl = Math.max(0, S.fl - dt * 2.6);
        const k = S.fl * (0.65 + 0.35 * Math.sin(S.fl * 28)), soft = R.flashes ? 1 : 0.3;
        drawClouds(c, v, m, R, this, k, S.bolt ? S.bolt[0][0][0] * v.w : v.w * 0.5, soft);
        c.fillStyle = rgba("#9cc8ff", 0.3 * k * soft); c.fillRect(0, 0, v.w, v.floorY);
        if (S.bolt && S.fl > 0.25) {
          c.save(); c.globalCompositeOperation = "lighter"; c.lineJoin = "round";
          for (const pts of S.bolt) {
            c.beginPath();
            for (let i = 0; i < pts.length; i++) c[i ? "lineTo" : "moveTo"](pts[i][0] * v.w, pts[i][1] * v.floorY);
            c.strokeStyle = rgba("#6fa8ff", 0.35 * k * soft); c.lineWidth = 6; c.stroke();
            c.strokeStyle = rgba("#ffffff", 0.85 * k * soft); c.lineWidth = 1.6; c.stroke();
          }
          c.restore();
        }
      }
    },
    floor(c, v, m, pal) {
      // лужи на мокром полу: тонкие эллипсы, привязаны к миру, блестят в такт
      const hz = v.floorY, d = v.h - hz;
      for (let i = 0; i < 7; i++) {
        const x = worldX(v, (i - 3) * 230 + hash1(i + 3) * 120), wd = 60 + 70 * hash1(i + 9), y = hz + d * (0.18 + 0.5 * hash1(i + 20));
        if (x < -wd || x > v.w + wd) continue;
        c.fillStyle = rgba(pal.neonA, 0.05 + 0.07 * m.pulse * m.I);
        c.beginPath(); c.ellipse(x, y, wd, 3 + d * 0.025, 0, 0, TAU); c.fill();
        c.strokeStyle = rgba(pal.neonB, 0.06 + 0.1 * m.pulse * m.I); c.lineWidth = 1;
        c.beginPath(); c.ellipse(x, y, wd * (0.55 + 0.1 * Math.sin(m.time * 2 + i)), 1.6, 0, 0, TAU); c.stroke();
      }
    },
    front(c, v, m, pal, R) {
      // ливень: плотность от верхних частот; всплески на полу
      const n = Math.round((40 + m.high * 130 + m.I * 40) * R.amount);
      c.strokeStyle = rgba("#a8d8ff", 0.16 + 0.12 * m.high); c.lineWidth = 1; c.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (hash1(i) * v.w * 1.3 + m.time * 90 - v.camX * v.scale * 0.8) % (v.w * 1.3) - v.w * 0.15;
        const y = (hash1(i + 99) * v.h + m.time * (620 + hash1(i + 7) * 260)) % v.h, L = 10 + 10 * hash1(i + 3);
        c.moveTo(x, y); c.lineTo(x - L * 0.22, y + L);
      }
      c.stroke();
      c.strokeStyle = rgba("#a8d8ff", 0.2); c.beginPath();
      const ns = Math.round(12 * R.amount), d = v.h - v.floorY;
      for (let i = 0; i < ns; i++) {
        const ph = (m.time * 2.4 + hash1(i + 40) * 5) % 1, x = hash1(i + 41) * v.w, y = v.floorY + 4 + hash1(i + 42) * d * 0.5, r = 1 + ph * 7;
        c.moveTo(x + r, y); c.ellipse(x, y, r, r * 0.25, 0, 0, TAU);
      }
      c.stroke();
    },
  });

  /* ===================================================================
     2. НОЧНОЙ ЭКСПРЕСС: герой на крыше поезда, пейзаж летит мимо (drift слоёв)
     =================================================================== */
  const CAR = 760;      // длина вагона в мировых единицах
  THEMES.push({
    id: "express", name: "Ночной экспресс", desc: "ровный быстрый пульс, перкуссия и бас; на брейке поезд входит в туннель",
    pal: { sky: ["#02040a", "#0d1430"], glow: "#ffae42", neonA: "#ffae42", neonB: "#4fd8ff", floor: "#07080c", edge: "#ffae42", fog: "#101830" },
    profile: { bpm: [128, 18], perc: [0.65, 0.16], energyVar: [0.3, 0.2], loudness: [0.55, 0.22], low: [0.4, 0.14] },
    fogA: 0.26,
    layers: [
      // дальние холмы с огоньками посёлка у подножия
      { top: 0.5, f: 0.03, drift: 7, haze: 0.6, paint(c, w, h, rng, A) {
        paintMountains(c, w, h, rng, "#0b1226", h * 0.3, h * 0.1, null);
        for (const b of layoutRow(w, rng, 8, 20, 4, 30)) {
          const bh = lerp(5, 16, rng()), seed = (rng() * 1e9) | 0;
          c.fillStyle = "#080d1d"; c.fillRect(b.x, h - bh, b.w, bh);
          drawWindows(c, b.x, h - bh, b.w, bh, { sx: 4, sy: 4, mx: 1.5, ww: 1.5, wh: 1.5, p: 0.5, a: "rgba(255,174,66,.55)", b: "rgba(255,230,160,.4)", my: 1.5, mb: 1 }, seed);
        }
      } },
      // лес: ели и редкие дома с тёплым окном
      { top: 0.3, f: 0.05, drift: 55, haze: 0.3, paint(c, w, h, rng, A) {
        c.fillStyle = "#070b18";
        for (const b of layoutRow(w, rng, 14, 30, 0, 8)) {
          const th = lerp(h * 0.12, h * 0.26, rng());
          if (rng() < 0.12) {       // домик с окном
            c.fillRect(b.x, h - 14, b.w, 14); c.beginPath(); c.moveTo(b.x - 2, h - 14); c.lineTo(b.x + b.w / 2, h - 24); c.lineTo(b.x + b.w + 2, h - 14); c.fill();
            c.fillStyle = "rgba(255,174,66,.7)"; c.fillRect(b.x + b.w * 0.35, h - 10, 3, 4); c.fillStyle = "#070b18";
          } else {
            for (let j = 0; j < 4; j++) {
              const y1 = h - th * (j / 4), y0 = h - th * ((j + 1.35) / 4), hw = b.w * (0.5 - j * 0.09);
              c.beginPath(); c.moveTo(b.x + b.w / 2 - hw, y1); c.lineTo(b.x + b.w / 2, y0); c.lineTo(b.x + b.w / 2 + hw, y1); c.fill();
            }
            c.fillRect(b.x + b.w / 2 - 1, h - 4, 2, 4);
          }
        }
      } },
      // опоры ЛЭП: ферма от земли до траверс, провода — между траверсами соседних опор (через шов тоже)
      { top: 0.93, f: 0.04, drift: 170, haze: 0.1, paint(c, w, h, rng, A) {
        A.red = []; A.ins = [];
        const N = Math.max(2, Math.round(w / 430)), xs = [], hs = [];
        for (let i = 0; i < N; i++) { xs.push((i + 0.5) * w / N); hs.push(h * lerp(0.78, 0.84, rng())); }
        c.fillStyle = "#04060c"; c.strokeStyle = "#04060c";
        for (let i = 0; i < N; i++) {
          const x = xs[i], top = h - hs[i], bw = 34, tw = 5;
          c.lineWidth = 2.2; c.beginPath(); c.moveTo(x - bw, h); c.lineTo(x - tw, top + 24); c.moveTo(x + bw, h); c.lineTo(x + tw, top + 24); c.stroke();
          c.lineWidth = 1; lattice(c, x - 22, x + 22, top + 24 + (hs[i] - 24) * 0.45, h, 22);
          c.lineWidth = 1.2; lattice(c, x - 14, x + 14, top + 24 + (hs[i] - 24) * 0.15, top + 24 + (hs[i] - 24) * 0.45, 14);
          c.fillRect(x - tw, top, tw * 2, 26);
          c.fillRect(x - 3, top - 10, 6, 11);
          for (const [y, hw] of [[top + 8, 34], [top + 20, 26]]) { c.fillRect(x - hw, y, hw * 2, 2.2); A.ins.push({ x: x - hw, y: y + 2, s: -1 }, { x: x + hw, y: y + 2, s: 1 }); }
          A.red.push({ x, y: top - 10 });
        }
        c.strokeStyle = "#05070d"; c.lineWidth = 1.1;
        for (let i = 0; i < N; i++) {
          const j = (i + 1) % N, x1 = xs[j] + (j === 0 ? w : 0);
          for (const [yo, hw] of [[8, 34], [20, 26]]) for (const s of [-1, 1]) for (const dx of [0, -w])
            wire(c, xs[i] + s * hw + dx, h - hs[i] + yo + 2, x1 + s * hw + dx, h - hs[j] + yo + 2, 10);
        }
      }, dyn(c, v, m, pal, R, off, A) {
        blink(c, v, m, off, A.red, "#ff4f5a", 2);
        // изоляторы чуть светятся на сильной доле
        const a = 0.15 + 0.5 * m.strong * m.I;
        c.fillStyle = rgba("#bfe8ff", a);
        for (const I of A.ins) v.repeat(off, I.x, x => c.fillRect(x - 1, layerY(v, I.y), 2, 3));
      } },
      // контактная сеть: тонкие мачты с консолью, провод между консолями; летят очень быстро
      { top: 0.58, f: 0.05, drift: 520, paint(c, w, h, rng, A) {
        const N = Math.max(2, Math.round(w / 520)), cw = w / N, ay = h * 0.56;
        c.fillStyle = "#030409"; c.strokeStyle = "#030409";
        for (let i = 0; i < N; i++) {
          const x = (i + 0.5) * cw;
          c.fillRect(x - 2, h * 0.5, 4, h * 0.5); c.fillRect(x - 5, h - 8, 10, 8);
          c.lineWidth = 2; c.beginPath(); c.moveTo(x, ay + 14); c.lineTo(x + 30, ay + 4); c.stroke();
          c.fillRect(x - 3, ay + 12, 6, 2);
        }
        c.lineWidth = 1.2;
        for (let i = 0; i < N; i++) for (const dx of [0, -w]) wire(c, (i + 0.5) * cw + 30 + dx, ay + 4, (i + 1.5) * cw + 30 + dx, ay + 4, 3);
      } },
    ],
    back(c, v, m, pal) {
      // луна, звёзды
      const mx = v.w * 0.78 - v.camX * v.scale * 0.01, my = v.floorY * 0.2, r = Math.min(v.w, v.h) * 0.045;
      const g = c.createRadialGradient(mx, my, r * 0.6, mx, my, r * 6);
      g.addColorStop(0, rgba("#bcd4ff", 0.14)); g.addColorStop(1, "rgba(188,212,255,0)");
      c.fillStyle = g; c.fillRect(mx - r * 6, my - r * 6, r * 12, r * 12);
      c.fillStyle = rgba("#d8e4ff", 0.85); c.beginPath(); c.arc(mx, my, r, 0, TAU); c.fill();
      c.fillStyle = rgba(pal.sky[0], 0.9); c.beginPath(); c.arc(mx + r * 0.45, my - r * 0.2, r * 0.9, 0, TAU); c.fill();
      stars(c, v, m, 46, "#cfe0ff", 0.6);
    },
    // крыша вагона: люки на кровле (едут с камерой), в туннеле — тёмный свод и бегущие лампы на стене
    mid(c, v, m, pal, R) {
      const kw = R.arena.kw, tun = clamp(kw.break * 1.1 + kw.outro * 0.25, 0, 1);
      if (tun > 0.02) {
        const fy = v.floorY;
        c.fillStyle = rgba("#020308", 0.94 * tun); c.fillRect(0, 0, v.w, fy);
        const g = c.createLinearGradient(0, 0, 0, fy);
        g.addColorStop(0, rgba("#000000", 0.7 * tun)); g.addColorStop(0.45, "rgba(0,0,0,0)");
        c.fillStyle = g; c.fillRect(0, 0, v.w, fy);
        // рёбра свода и лампы бегут ровно на шаг за долю
        const sp = 170, sh = (m.beatF * sp) % sp, ly = fy * 0.52;
        c.fillStyle = rgba("#0b0e18", tun); for (let x = -sh; x < v.w + sp; x += sp) c.fillRect(x - 3, 0, 6, fy);
        c.strokeStyle = rgba("#1b2236", tun); c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, ly + 3); c.lineTo(v.w, ly + 3); c.stroke();   // кабель, на котором висят лампы
        c.save(); c.globalCompositeOperation = "lighter";
        for (let x = -sh + sp / 2; x < v.w + sp; x += sp) {
          const lg = c.createRadialGradient(x, ly, 2, x, ly, 46);
          lg.addColorStop(0, rgba(pal.neonA, 0.3 * tun * (0.6 + 0.4 * m.pulse))); lg.addColorStop(1, rgba(pal.neonA, 0));
          c.fillStyle = lg; c.fillRect(x - 46, ly - 46, 92, 92);
          c.fillStyle = rgba(pal.neonA, 0.9 * tun); c.fillRect(x - 7, ly - 2, 14, 4);
        }
        c.restore();
      }
      // вентиляционные люки и поручень на кровле
      const fy = v.floorY, s = v.scale;
      for (let k = Math.floor((v.camX - v.w / 2 / s) / CAR) - 1; k <= Math.ceil((v.camX + v.w / 2 / s) / CAR) + 1; k++) {
        const x = worldX(v, k * CAR + CAR * 0.5);
        c.fillStyle = "#04050a"; c.fillRect(x - 20 * s, fy - 7 * s, 40 * s, 7 * s); c.fillRect(x - 14 * s, fy - 10 * s, 28 * s, 3 * s);
        c.fillStyle = rgba(pal.neonA, 0.14); c.fillRect(x - 20 * s, fy - 7 * s, 40 * s, 1);
      }
    },
    // борт вагона под кромкой крыши: окна и стыки между вагонами
    floor(c, v, m, pal) {
      const hz = v.floorY, d = v.h - hz, s = v.scale, wy = hz + d * 0.2, wh = d * 0.34;
      const k0 = Math.floor((v.camX - v.w / 2 / s) / CAR) - 1, k1 = Math.ceil((v.camX + v.w / 2 / s) / CAR) + 1;
      for (let k = k0; k <= k1; k++) {
        const xj = worldX(v, k * CAR);
        // межвагонный стык: тёмный гофр
        c.fillStyle = "#020206"; c.fillRect(xj - 12 * s, hz, 24 * s, d);
        c.strokeStyle = "rgba(255,174,66,.12)"; c.lineWidth = 1; c.beginPath();
        for (let i = -2; i <= 2; i++) { c.moveTo(xj + i * 4 * s, hz + 2); c.lineTo(xj + i * 4 * s, hz + d); }
        c.stroke();
        for (let i = 0; i < 6; i++) {
          const x = worldX(v, k * CAR + 70 + i * 106);
          const lit = 0.16 + 0.1 * m.pulse * m.I + (((m.beat + i + k) & 3) === 0 ? 0.08 : 0);
          c.fillStyle = rgba(pal.neonA, lit); c.fillRect(x, wy, 62 * s, wh);
          c.fillStyle = "rgba(2,3,8,.55)"; c.fillRect(x + 30 * s, wy, 2 * s, wh);
        }
      }
    },
    front(c, v, m, pal, R) {
      // полосы скорости: короткие горизонтальные штрихи улетают влево
      const n = Math.round((7 + m.I * 10) * R.amount), fy = v.floorY;
      c.strokeStyle = rgba("#bcd4ff", 0.09 + 0.06 * m.I); c.lineWidth = 1; c.beginPath();
      for (let i = 0; i < n; i++) {
        const sp = 900 + 900 * hash1(i + 5), x = ((hash1(i) * v.w * 1.6 - m.time * sp) % (v.w * 1.6) + v.w * 1.6) % (v.w * 1.6) - v.w * 0.3, y = fy * (0.05 + 0.85 * hash1(i + 31));
        c.moveTo(x, y); c.lineTo(x + 50 + 70 * hash1(i + 17), y);
      }
      c.stroke();
    },
  });

  /* ===================================================================
     3. МИРАЖ: синтвейв-пустыня
     =================================================================== */
  THEMES.push({
    id: "mirage", name: "Мираж", desc: "тёплый синтвейв: большое солнце, сетка у горизонта, пустыня",
    pal: { sky: ["#12032e", "#4a0f5e"], glow: "#ff4fa8", neonA: "#ff4fa8", neonB: "#36e8ff", floor: "#0b0418", edge: "#ff4fa8", fog: "#3a1250" },
    profile: { bpm: [108, 16], bright: [0.22, 0.09], low: [0.42, 0.12], high: [0.17, 0.08], energyVar: [0.5, 0.25] },
    fogA: 0.3,
    layers: [
      // дальние горы с холодной кромкой
      { top: 0.5, f: 0.04, haze: 0.55, paint(c, w, h, rng) {
        paintMountains(c, w, h, rng, "#270b48", h * 0.34, h * 0.12, "rgba(54,232,255,.4)");
      } },
      // столовые горы со ступенями и лиловым контровым светом сверху
      { top: 0.4, f: 0.14, haze: 0.28, paint(c, w, h, rng) {
        for (const b of layoutRow(w, rng, 70, 150, 10, 70)) {
          const bh = lerp(h * 0.12, h * 0.34, rng()), top = h - bh, sl = lerp(10, 22, rng()), st = rng() < 0.5;
          c.fillStyle = "#170534"; c.beginPath();
          c.moveTo(b.x, h); c.lineTo(b.x + 4, top + (st ? bh * 0.35 : 0)); if (st) { c.lineTo(b.x + sl * 0.6, top + bh * 0.35); c.lineTo(b.x + sl * 0.6, top); }
          c.lineTo(b.x + b.w - sl, top); c.lineTo(b.x + b.w - sl * 0.2, top + bh * 0.4); c.lineTo(b.x + b.w, h); c.closePath(); c.fill();
          c.fillStyle = "rgba(255,79,168,.4)"; c.fillRect(b.x + sl * 0.6, top, b.w - sl * 1.6, 1.2);
        }
      } },
      // ближний план: кактусы и валуны, столбы дороги с проводами и изоляторами
      { top: 0.5, f: 0.38, paint(c, w, h, rng, A) {
        A.ins = []; A.spans = [];
        const N = Math.max(3, Math.round(w / 380)), cw = w / N, xs = [];
        const cactus = (x, ch, arms) => {
          c.lineCap = "round";
          for (const [dx, col] of [[-1.3, "rgba(255,79,168,.35)"], [0, "#0a021c"]]) {
            c.strokeStyle = col; c.lineWidth = 9; c.beginPath(); c.moveTo(x + dx, h); c.lineTo(x + dx, h - ch); c.stroke();
            c.lineWidth = 5.5;
            for (const a of arms) {
              const ay = h - ch * a.y, sx = x + dx, ex = sx + a.s * 15;
              c.beginPath(); c.moveTo(sx, ay); c.lineTo(ex, ay); c.lineTo(ex, ay - ch * a.up); c.stroke();
            }
          }
          c.lineCap = "butt";
        };
        for (let i = 0; i < N; i++) {
          const px = (i + 0.5) * cw; xs.push(px);
          // кактус между столбами
          const cx = px + cw * (0.3 + 0.2 * rng()), ch = lerp(34, 64, rng());
          cactus(cx, ch, [{ s: -1, y: lerp(0.3, 0.5, rng()), up: 0.28 }, { s: 1, y: lerp(0.45, 0.65, rng()), up: 0.22 }]);
          // валун
          if (rng() < 0.7) {
            const rx = px + cw * (0.05 + 0.15 * rng()), rw = lerp(16, 34, rng()), rh = rw * 0.5;
            c.fillStyle = "#0a021c"; c.beginPath(); c.moveTo(rx, h); c.lineTo(rx + rw * 0.1, h - rh * 0.8); c.lineTo(rx + rw * 0.45, h - rh); c.lineTo(rx + rw * 0.9, h - rh * 0.5); c.lineTo(rx + rw, h); c.closePath(); c.fill();
          }
          // кактус поменьше
          if (rng() < 0.5) cactus(px + cw * 0.8, lerp(20, 32, rng()), [{ s: 1, y: 0.5, up: 0.25 }]);
        }
        const ph = h * 0.44;      // высота столбов (низ — на земле), помещается в хранимую часть тайла
        c.fillStyle = "#090219";
        for (const x of xs) {
          c.fillRect(x - 1.8, h - ph, 3.6, ph);
          c.fillRect(x - 13, h - ph + 5, 26, 2.4); c.fillRect(x - 9, h - ph + 15, 18, 2);
          for (const dx of [-11, 0, 11]) { c.fillRect(x + dx - 0.8, h - ph + 2, 1.6, 4); A.ins.push({ x: x + dx, y: h - ph + 2 }); }
        }
        c.strokeStyle = "#0a031c"; c.lineWidth = 1.1;
        for (let i = 0; i < N; i++) {
          const j = (i + 1) % N, x1 = xs[j] + (j === 0 ? w : 0);
          for (const dx0 of [-11, 0, 11]) for (const dx of [0, -w]) wire(c, xs[i] + dx0 + dx, h - ph + 2, x1 + dx0 + dx, h - ph + 2, 11);
          A.spans.push({ x0: xs[i], x1, y: h - ph + 2, sag: 11 });
        }
      }, dyn(c, v, m, pal, R, off, A) {
        c.save(); c.globalCompositeOperation = "lighter";
        const a = 0.25 + 0.6 * m.pulse * m.I;
        for (const I of A.ins) v.repeat(off, I.x, x => { c.fillStyle = rgba(pal.neonA, 0.18 * a); c.fillRect(x - 3, layerY(v, I.y) - 3, 6, 6); c.fillStyle = rgba("#ffd0ea", 0.5 * a); c.fillRect(x - 0.8, layerY(v, I.y), 1.6, 2); });
        // огоньки бегут по среднему проводу
        for (let i = 0; i < A.spans.length; i++) {
          const S = A.spans[i], t = (m.time * 0.35 + i * 0.31) % 1;
          v.repeat(off, S.x0, x => {
            const [bx, by] = wirePt(x, layerY(v, S.y), x + (S.x1 - S.x0), layerY(v, S.y), S.sag, t);
            c.fillStyle = rgba(pal.neonB, 0.18); c.fillRect(bx - 4, by - 4, 8, 8); c.fillStyle = rgba("#d8fbff", 0.8); c.fillRect(bx - 1, by - 1, 2, 2);
          });
        }
        c.restore();
      } },
    ],
    back(c, v, m, pal, R) {
      const fy = v.floorY, r = Math.min(v.w * 0.3, fy * 0.5) * (1 + 0.012 * m.pulse);
      const sx = v.w * 0.5 - v.camX * v.scale * 0.015, sy = fy - r * 0.42;
      const hot = R.arena.kw.drop + R.arena.kw.climax;
      // ореол
      const g = c.createRadialGradient(sx, sy, r * 0.8, sx, sy, r * 2.4);
      g.addColorStop(0, rgba("#ff4fa8", 0.3 + 0.12 * m.low + 0.12 * hot)); g.addColorStop(1, "rgba(255,79,168,0)");
      c.fillStyle = g; c.fillRect(0, 0, v.w, fy);
      stars(c, v, m, 40, "#ffd6f0", 0.45);
      // диск с полосами: полосы ползут вниз и утолщаются; обрезаны кругом и горизонтом
      c.save(); c.beginPath(); c.rect(0, 0, v.w, fy); c.clip(); c.beginPath(); c.arc(sx, sy, r, 0, TAU); c.clip();
      const sg = c.createLinearGradient(0, sy - r, 0, sy + r);
      sg.addColorStop(0, "#ffe05a"); sg.addColorStop(0.5, "#ff7a3c"); sg.addColorStop(1, "#ff2f8e");
      c.fillStyle = sg; c.fillRect(sx - r, sy - r, r * 2, r * 2);
      const sp = r * 0.17, ph = (m.time * 0.07) % 1;
      c.fillStyle = "#1c0640";
      for (let i = -1; i < 8; i++) {
        const y = sy - r * 0.05 + (i + ph) * sp, k = clamp((y - sy) / r, 0, 1.3);
        if (y < sy - r * 0.05) continue;
        c.fillRect(sx - r, y, r * 2, sp * (0.1 + 0.5 * k));
      }
      c.restore();
    },
    // дрожащее марево над горизонтом
    mid(c, v, m, pal) {
      const fy = v.floorY, g = c.createLinearGradient(0, fy - 34, 0, fy);
      g.addColorStop(0, rgba(pal.neonA, 0)); g.addColorStop(1, rgba(pal.neonA, 0.1 + 0.08 * m.I));
      c.fillStyle = g; c.fillRect(0, fy - 34, v.w, 34);
      c.strokeStyle = rgba("#ffd0ea", 0.1 + 0.06 * m.high); c.lineWidth = 1; c.beginPath();
      for (let i = 0; i < 4; i++) {
        const y = fy - 5 - i * 7;
        for (let x = 0; x < v.w; x += 120) {
          const o = Math.sin(m.time * 1.4 + i * 1.7 + x * 0.013) * 14, xx = x + 20 + (i % 2) * 40;
          c.moveTo(xx + o, y); c.lineTo(xx + 46 + o, y);
        }
      }
      c.stroke();
    },
    // сетка: горизонтали бегут к зрителю по долям, лучи сходятся в горизонт
    floor(c, v, m, pal) {
      const hz = v.floorY, H = v.h, d = H - hz, a = 0.2 + 0.35 * m.pulse * m.I;
      const hg = c.createLinearGradient(0, hz, 0, hz + 22);
      hg.addColorStop(0, rgba(pal.neonB, 0.3 + 0.2 * m.I)); hg.addColorStop(1, rgba(pal.neonB, 0));
      c.fillStyle = hg; c.fillRect(0, hz, v.w, 22);
      c.lineWidth = 1;
      for (let j = 0; j < 9; j++) {
        const z = (j + m.phase) / 9, y = hz + d * z * z;
        c.strokeStyle = rgba(pal.neonA, a * (0.35 + 0.65 * z)); c.beginPath(); c.moveTo(0, y); c.lineTo(v.w, y); c.stroke();
      }
      c.strokeStyle = rgba(pal.neonB, a * 0.7); c.beginPath();
      const ox = -(v.camX * v.scale) % 70;
      for (let i = -22; i <= 22; i++) { const x0 = v.w / 2 + i * 70 + ox; c.moveTo(x0, hz); c.lineTo(v.w / 2 + (x0 - v.w / 2) * 3.4, H); }
      c.stroke();
    },
    front(c, v, m, pal, R) {
      if (rand() < 0.22 * R.amount) R.amb.push({ x: v.w + 10, y: rand(v.floorY * 0.35, v.floorY), vx: -rand(25, 70), vy: rand(-5, 5), life: 3.5, c: "#ff9ad0", mote: true });
    },
  });

  /* ===================================================================
     4. КОНТЕЙНЕРНЫЙ ПОРТ
     =================================================================== */
  const BOX = ["#2c2220", "#1c2c33", "#242a31", "#33201f", "#1f2e27", "#2d2a1f"];
  /** Контейнер: тело, гофр, торцевая рама. */
  const box = (c, x, y, w, hh, col, rng) => {
    c.fillStyle = col; c.fillRect(x, y, w, hh);
    c.fillStyle = "rgba(0,0,0,.28)";
    for (let px = x + 3; px < x + w - 2; px += 3) c.fillRect(px, y + 1, 1, hh - 2);
    c.fillStyle = "rgba(0,0,0,.4)"; c.fillRect(x, y, w, 1); c.fillRect(x, y + hh - 1, w, 1);
    if (rng() < 0.2) { c.fillStyle = rng() < 0.5 ? "rgba(255,154,60,.45)" : "rgba(56,216,255,.4)"; c.fillRect(x + 3, y + 3, w * 0.3, 1.6); }
  }
  THEMES.push({
    id: "port", name: "Контейнерный порт", desc: "тяжёлый медленный бас, индустриальный ритм; краны, штабеля и прожекторы",
    pal: { sky: ["#050a10", "#16222c"], glow: "#ff9a3c", neonA: "#ff9a3c", neonB: "#38d8ff", floor: "#080b0e", edge: "#38d8ff", fog: "#1b2a36" },
    profile: { bpm: [88, 20], low: [0.56, 0.12], mid: [0.28, 0.1], bright: [0.25, 0.1], density: [2.6, 1.5], loudness: [0.65, 0.22] },
    fogA: 0.32,
    layers: [
      // дальний план: вода гавани, корабль с палубным грузом, портальные краны на причале
      { top: 0.62, f: 0.06, haze: 0.55, paint(c, w, h, rng, A) {
        A.beacons = []; A.lights = [];
        const wt = h - 34;
        c.fillStyle = "#0a1822"; c.fillRect(0, wt, w, 34);
        c.fillStyle = "rgba(56,216,255,.12)"; c.fillRect(0, wt, w, 1);
        // причал (бетонная кромка) под кранами
        c.fillStyle = "#0c141b"; c.fillRect(0, wt - 5, w * 0.34, 5); c.fillRect(w * 0.7, wt - 5, w * 0.3, 5);
        // корабль: корпус стоит в воде (ватерлиния h-24), на палубе контейнеры и рубка
        const sx = w * 0.4, sl = Math.min(240, w * 0.24), dk = h - 56;
        c.fillStyle = "#0b1119";
        c.beginPath(); c.moveTo(sx, dk); c.lineTo(sx + sl + 16, dk); c.lineTo(sx + sl, h - 24); c.lineTo(sx + 14, h - 24); c.closePath(); c.fill();
        for (let i = 0, x = sx + 6; x < sx + sl * 0.66; i++, x += 15) for (let j = 0; j < 1 + (i % 3); j++) { c.fillStyle = BOX[(i + j) % BOX.length]; c.fillRect(x, dk - 9 * (j + 1), 14, 9); }
        c.fillStyle = "#0b1119"; c.fillRect(sx + sl * 0.72, dk - 34, sl * 0.2, 34); c.fillRect(sx + sl * 0.7, dk - 38, sl * 0.24, 4); c.fillRect(sx + sl * 0.78, dk - 48, 5, 10);
        for (let i = 0; i < 4; i++) { c.fillStyle = "rgba(255,154,60,.7)"; c.fillRect(sx + sl * 0.74 + i * 9, dk - 28, 4, 3); A.lights.push({ x: sx + sl * 0.74 + i * 9 + 2 }); }
        A.beacons.push({ x: sx + sl * 0.8 + 2, y: dk - 49 });
        // два портальных крана
        for (const cx of [w * 0.17, w * 0.82]) {
          const cb = wt - 5, ct = h * 0.44;
          c.fillStyle = "#0b1119"; c.strokeStyle = "#0b1119"; c.lineWidth = 2.2;
          c.beginPath(); c.moveTo(cx - 28, cb); c.lineTo(cx - 24, ct + 6); c.moveTo(cx + 28, cb); c.lineTo(cx + 24, ct + 6); c.stroke();
          c.lineWidth = 1; lattice(c, cx - 26, cx + 26, ct + 14, cb, 14);
          c.fillRect(cx - 40, ct + 4, 80, 6);                       // портал
          c.fillRect(cx - 100, ct + 5, 70, 3.5);                    // стрела над водой
          c.lineWidth = 1; c.beginPath(); c.moveTo(cx - 96, ct + 8); c.lineTo(cx - 20, ct - 14); c.lineTo(cx + 20, ct + 4); c.stroke();
          c.fillRect(cx - 5, ct - 14, 10, 18);
          A.beacons.push({ x: cx - 98, y: ct + 4 }, { x: cx, y: ct - 16 });
        }
      }, dyn(c, v, m, pal, R, off, A) {
        blink(c, v, m, off, A.beacons, "#ff4f5a", 2);
        // отражения окон рубки качаются на воде
        const a = 0.18 + 0.2 * m.I;
        for (const L of A.lights) v.repeat(off, L.x, x => {
          for (let k = 0; k < 3; k++) {
            c.fillStyle = rgba("#ff9a3c", a * (1 - k * 0.3));
            c.fillRect(x - 2 + Math.sin(m.time * 2.2 + k * 1.7 + L.x) * 2.5, layerY(v, v.tileH - 20 + k * 6), 4, 2);
          }
        });
      } },
      // средний план: штабеля контейнеров в 1–3 яруса; в зазорах видна вода
      { top: 0.4, f: 0.2, haze: 0.22, refl: 0.1, paint(c, w, h, rng, A) {
        for (const b of layoutRow(w, rng, 38, 56, 4, 64)) {
          const lv = 1 + ((rng() * 3) | 0), bh = 16;
          for (let j = 0; j < lv; j++) box(c, b.x, h - bh * (j + 1), b.w, bh, BOX[(rng() * BOX.length) | 0], rng);
          if (rng() < 0.3) { c.fillStyle = "rgba(56,216,255,.22)"; c.fillRect(b.x, h - bh * lv, b.w, 1); }
        }
      } },
      // ближний план: портальный кран над причалом (тележка с грузом на тросах) и мачта с прожекторами
      { top: 0.9, f: 0.4, paint(c, w, h, rng, A) {
        A.crane = null; A.fl = []; A.red = [];
        const x1 = w * 0.22, x2 = x1 + 250, yb = h * 0.2, xl = x1 - 130, xr = x2 + 40;
        c.fillStyle = "#04070a"; c.strokeStyle = "#04070a";
        for (const x of [x1, x2]) {
          c.lineWidth = 6; c.beginPath(); c.moveTo(x - 4, h); c.lineTo(x - 4, yb + 6); c.moveTo(x + 4, h); c.lineTo(x + 4, yb + 6); c.stroke();
          c.lineWidth = 1; lattice(c, x - 4, x + 4, yb + 10, h - 10, 12);
        }
        c.lineWidth = 1.2; c.beginPath(); c.moveTo(x1, h * 0.55); c.lineTo(x2, h * 0.38); c.moveTo(x1, h * 0.38); c.lineTo(x2, h * 0.55); c.stroke();
        c.fillRect(x1 - 8, h * 0.62, 16, 5); c.fillRect(x2 - 8, h * 0.62, 16, 5);
        c.fillRect(xl, yb, xr - xl, 7);                                 // балка тележки
        lattice(c, xl, xr, yb + 7, yb + 13, 6); c.fillRect(xl, yb + 13, xr - xl, 2);
        c.fillRect(x1 - 14, yb - 18, 34, 18); c.fillRect(x1 - 8, yb - 24, 12, 6);   // машинное отделение
        A.crane = { xl: xl + 14, xr: xr - 14, yb: yb + 15 };
        A.red.push({ x: x1 - 12, y: yb - 20 }, { x: xr, y: yb - 1 });
        // мачта прожекторов у воды справа
        const mx = w * 0.7, mh = h * 0.52;
        c.fillRect(mx - 2, h - mh, 4, mh); c.fillRect(mx - 7, h - 6, 14, 6);
        c.lineWidth = 1; lattice(c, mx - 5, mx + 5, h - mh + 6, h - 8, 12);
        c.fillRect(mx - 22, h - mh - 5, 44, 6);
        for (let i = 0; i < 4; i++) { c.fillStyle = "#10161d"; c.fillRect(mx - 19 + i * 11, h - mh - 12, 8, 7); A.fl.push({ x: mx - 15 + i * 11, y: h - mh - 8, i }); }
      }, dyn(c, v, m, pal, R, off, A) {
        const cr = A.crane, hot = R.arena.kw.drop + R.arena.kw.climax;
        blink(c, v, m, off, A.red, "#ff4f5a", 2);
        if (cr) {
          // тележка ходит вдоль балки, груз висит на двух тросах и чуть качается
          const sp = 0.22 + 0.5 * hot, t = 0.5 + 0.5 * Math.sin(m.time * sp), tx = lerp(cr.xl + 20, cr.xr - 30, t);
          const drop = 52 + 18 * Math.sin(m.time * sp * 1.3 + 1), sw = Math.sin(m.time * 1.2) * 2;
          v.repeat(off, tx, x => {
            const y = layerY(v, cr.yb);
            c.fillStyle = "#04070a"; c.fillRect(x - 8, y - 5, 16, 6);
            c.strokeStyle = "#0a1016"; c.lineWidth = 1; c.beginPath();
            c.moveTo(x - 7, y + 1); c.lineTo(x - 15 + sw, y + drop); c.moveTo(x + 7, y + 1); c.lineTo(x + 15 + sw, y + drop); c.stroke();
            c.fillStyle = "#2a1f1d"; c.fillRect(x - 18 + sw, y + drop, 36, 14);
            c.fillStyle = "rgba(0,0,0,.3)"; for (let px = x - 15 + sw; px < x + 16 + sw; px += 3) c.fillRect(px, y + drop + 1, 1, 12);
            c.fillStyle = rgba(pal.neonA, 0.15 + 0.3 * m.pulse * m.I); c.fillRect(x - 18 + sw, y + drop, 36, 1);
          });
        }
        // прожекторы: конусы вниз, качаются, в дропе и кульминации веером разъезжаются
        const fl = 0.55 + 0.45 * m.pulse, n = A.fl.length;
        c.save(); c.globalCompositeOperation = "lighter";
        for (const L of A.fl) v.repeat(off, L.x, x => {
          const y = layerY(v, L.y), ang = -0.35 + L.i * 0.1 + Math.sin(m.time * (0.7 + hot) + L.i * 1.2) * (0.1 + 0.18 * hot);
          const fx = x + Math.tan(ang) * (v.floorY - y), wd = 26 + 14 * L.i / n;
          c.fillStyle = rgba(pal.neonA, (0.045 + 0.04 * (m.I)) * fl);
          c.beginPath(); c.moveTo(x - 2, y); c.lineTo(x + 2, y); c.lineTo(fx + wd, v.floorY); c.lineTo(fx - wd, v.floorY); c.closePath(); c.fill();
          c.fillStyle = rgba(pal.neonA, 0.16 * fl); c.fillRect(x - 6, y - 6, 12, 12);
          c.fillStyle = rgba("#fff1d8", 0.7 * fl); c.fillRect(x - 2, y - 2, 4, 4);
        });
        c.restore();
      } },
    ],
    back(c, v, m, pal) {
      // натриевое зарево над портом и дымка, звёзды слабее обычного
      const fy = v.floorY, g = c.createLinearGradient(0, fy * 0.35, 0, fy);
      g.addColorStop(0, rgba(pal.neonA, 0)); g.addColorStop(1, rgba(pal.neonA, 0.1 + 0.06 * m.I));
      c.fillStyle = g; c.fillRect(0, fy * 0.35, v.w, fy * 0.65);
      stars(c, v, m, 26, "#c8dcff", 0.4);
      const mx = v.w * 0.22 - v.camX * v.scale * 0.02, my = fy * 0.2;
      const mr = Math.min(v.w, v.h) * 0.035, mg = c.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 3);
      mg.addColorStop(0, rgba("#e8eef8", 0.2)); mg.addColorStop(1, "rgba(232,238,248,0)");
      c.fillStyle = mg; c.fillRect(mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
    },
    // бетонный причал: швы плит и жёлтая разметка у кромки
    floor(c, v, m, pal) {
      const hz = v.floorY, d = v.h - hz, s = v.scale;
      c.strokeStyle = "rgba(255,255,255,.05)"; c.lineWidth = 1; c.beginPath();
      for (let k = Math.floor((v.camX - v.w / 2 / s) / 110) - 1; k <= Math.ceil((v.camX + v.w / 2 / s) / 110) + 1; k++) {
        const x = worldX(v, k * 110); c.moveTo(x, hz); c.lineTo(x + (x - v.w / 2) * 0.35, v.h);
      }
      c.stroke();
      c.fillStyle = rgba("#ffc83c", 0.3 + 0.2 * m.strong * m.I);
      const y = hz + d * 0.3, step = 36 * s;
      for (let x = -((v.camX * s) % (step * 2)); x < v.w; x += step * 2) c.fillRect(x, y, step, 2);
    },
    front(c, v, m, pal, R) {
      // низкая дымка вдоль воды
      for (let i = 0; i < 2; i++) {
        const x = ((m.time * (8 + i * 5) + i * 500 - v.camX * v.scale * (0.5 + i * 0.2)) % (v.w + 600)) - 300, y = v.floorY - 14 + i * 14;
        const g = c.createRadialGradient(x, y, 10, x, y, 230);
        g.addColorStop(0, rgba("#7f98a8", 0.07 + 0.07 * m.I)); g.addColorStop(1, "rgba(127,152,168,0)");
        c.fillStyle = g; c.fillRect(x - 230, y - 110, 460, 220);
      }
    },
  });
}
