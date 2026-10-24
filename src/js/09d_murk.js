/* =====================================================================
   Арена «Морок» (id murk): монохромная тревожная пустота. Клубящийся дым вокруг светлого «окна»
   в центре, тёмные края, в дыму стоят и висят неясные тени с крошечными глазами, в воздухе — редкие пылинки.
   Добавляется в THEMES (09_arena); список id собирает 09z_themes.js.

   Устройство (чтобы ничего не стоило дорого и не дёргалось):
   - дым — три слоя параллакса: пятна рисуются в тайл один раз (paint), слои сами плывут (drift, px/с);
   - тени — якоря A.far/A.near, которые пишет paint дымовых слоёв; рисует dyn того же слоя с тем же сдвигом,
     поэтому тень едет вместе со своим слоем дыма. Тело — мягкие тёмные эллипсы, глаза — две точки;
   - светлое «окно», клубы вокруг него (mid), пол и пылинки (front) рисуются каждый кадр БЕЗ аллокаций:
     градиенты единичного радиуса создаются один раз на контекст и растягиваются преобразованием;
   - время движения тени/клубов — интеграл (x += dt·v), музыкальные входы сглажены damp: никаких t·sp с «живой» sp.
   Парение теней — часть стиля (как кристаллы в «Бездне»); без засечек и колец удара, чтобы не путать с врагами.
   ===================================================================== */
{
  /** Единичные радиальные градиенты на контекст (создаются один раз; растягиваются через translate/scale). */
  const UG = new WeakMap();
  const unitGrads = c => {
    let g = UG.get(c);
    if (g) return g;
    const mk = stops => { const q = c.createRadialGradient(0, 0, 0, 0, 0, 1); for (const [o, col] of stops) q.addColorStop(o, col); return q; };
    g = {
      L: mk([[0, "rgba(226,230,236,.5)"], [0.3, "rgba(206,211,218,.32)"], [0.65, "rgba(180,186,195,.1)"], [1, "rgba(170,176,186,0)"]]),   // светлый дым
      D: mk([[0, "rgba(0,0,0,.92)"], [0.5, "rgba(0,0,0,.55)"], [1, "rgba(0,0,0,0)"]]),                                                    // тёмная масса
      E: mk([[0, "rgba(0,0,0,0)"], [0.36, "rgba(0,0,0,0)"], [0.7, "rgba(0,0,0,.5)"], [1, "rgba(0,0,0,.93)"]]),                                      // тёмные края вокруг окна света
      W: mk([[0, "rgba(255,255,255,1)"], [0.22, "rgba(236,241,250,.4)"], [1, "rgba(236,241,250,0)"]]),                                    // свет глаза/пылинки
    };
    UG.set(c, g);
    return g;
  };
  /** Пятно: единичный градиент g, центр (x,y), полуоси rx/ry, прозрачность a. */
  const blot = (c, g, x, y, rx, ry, a) => {
    if (a <= 0.004) return;
    c.save(); c.globalAlpha = a; c.translate(x, y); c.scale(rx, ry); c.fillStyle = g; c.fillRect(-1, -1, 2, 2); c.restore();
  };
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /** Пятно в тайл с переносом через шов (дым бесшовный). rot — наклон «щупальца». */
  const tileBlob = (c, w, x, y, rx, ry, rot, stops) => {
    for (const dx of [0, -w, w]) {
      if (x + dx + rx < -2 || x + dx - rx > w + TILE_PAD + 2) continue;
      c.save(); c.translate(x + dx, y); c.rotate(rot); c.scale(rx, ry);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
      for (const [o, col] of stops) g.addColorStop(o, col);
      c.fillStyle = g; c.fillRect(-1, -1, 2, 2); c.restore();
    }
  };
  /** Обрезка по ширине тайла: дым полупрозрачный, а запас TILE_PAD арена дорисовывает копией начала — без обрезки на шве выходила двойная заливка (линия). */
  const clipTile = (c, w, h) => { c.save(); c.beginPath(); c.rect(0, -60, w, h + 120); c.clip(); };
  /** Конец рисования тайла. Запас TILE_PAD на шве накладывается на начало следующего тайла, и полупрозрачный дым
      в этих колонках удваивался (тонкая линия). Гасим альфу первых колонок вдвое: сумма двух слоёв даёт нужную плотность. */
  const endTile = (c, w, h) => {
    c.restore();
    c.save(); c.beginPath(); c.rect(0, -60, TILE_PAD, h + 120); c.clip();
    c.globalCompositeOperation = "destination-in"; c.fillStyle = "rgba(0,0,0,.5)"; c.fillRect(0, -60, TILE_PAD, h + 120);
    c.restore();
  };
  const SOFT_L = a => [[0, `rgba(205,210,218,${a})`], [0.55, `rgba(190,196,205,${a * 0.5})`], [1, "rgba(180,186,195,0)"]];
  const SOFT_D = a => [[0, `rgba(0,0,0,${a})`], [0.6, `rgba(0,0,0,${a * 0.75})`], [1, "rgba(0,0,0,0)"]];

  /** Рваное тёмное облако: россыпь пятен вокруг центра, вытянутая по горизонтали. */
  const darkCloud = (c, w, h, rng, cx, cy, size, a) => {
    const n = 6 + Math.floor(rng() * 5);
    for (let i = 0; i < n; i++) {
      const ang = rng() * TAU, d = Math.sqrt(rng()) * size;
      tileBlob(c, w, cx + Math.cos(ang) * d * 1.5, cy + Math.sin(ang) * d * 0.8, size * lerp(0.4, 0.9, rng()), size * lerp(0.28, 0.6, rng()), (rng() - 0.5) * 0.9, SOFT_D(a * lerp(0.6, 1, rng())));
    }
  };
  /** Светлый клубок дыма. */
  const lightCloud = (c, w, h, rng, cx, cy, size, a) => {
    const n = 5 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const ang = rng() * TAU, d = Math.sqrt(rng()) * size;
      tileBlob(c, w, cx + Math.cos(ang) * d * 1.6, cy + Math.sin(ang) * d * 0.7, size * lerp(0.5, 1, rng()), size * lerp(0.25, 0.5, rng()), (rng() - 0.5) * 0.5, SOFT_L(a * lerp(0.6, 1, rng())));
    }
  };

  /** Якоря теней слоя: часть стоит в дымке у горизонта (ноги в мгле), часть висит выше. rank — порядок появления. */
  const placeShadows = (list, w, h, rng, n, hMin, hMax, rank0) => {
    for (let i = 0; i < n; i++) {
      const H = lerp(hMin, hMax, rng()), stand = rng() < 0.55;
      list.push({
        x: (i + 0.15 + rng() * 0.7) * w / n, H,
        y: stand ? h - H * (0.42 + 0.1 * rng()) : h * lerp(0.18, 0.6, rng()) + H * 0.3,
        ph: rng() * TAU, T: lerp(5, 11, rng()), r: (rank0 + i / n + rng() * 0.12) % 1,   // rank — порог появления: чем меньше, тем раньше
        flip: rng() < 0.5 ? -1 : 1,
      });
    }
  };

  /** Рисует одну тень: тёмное тело (тающие эллипсы) и пара глаз. Всё через единичные градиенты, без аллокаций. */
  const drawShadow = (c, G, S, x, y, kH, body, eyeA, open, face, sway) => {
    const H = S.H * kH;
    const hx = x + sway * 0.5 + face * 0.02 * H, hy = y - 0.3 * H;
    if (body > 0.01) {
      blot(c, G.D, x + sway * 0.3, y - 0.13 * H, 0.23 * H, 0.09 * H, body * 0.85);            // плечи
      blot(c, G.D, x, y + 0.08 * H, 0.16 * H, 0.3 * H, body);                                 // туловище
      blot(c, G.D, hx, hy, 0.095 * H, 0.115 * H, body);                                       // голова
      blot(c, G.D, x - sway, y + 0.4 * H, 0.1 * H, 0.22 * H, body * 0.6);                    // шлейф тьмы вниз
      blot(c, G.D, x - 0.21 * H, y + 0.03 * H + sway * 0.2, 0.055 * H, 0.22 * H, body * 0.6); // руки — свисающие клочья
      blot(c, G.D, x + 0.21 * H, y + 0.03 * H - sway * 0.2, 0.055 * H, 0.22 * H, body * 0.55);
    }
    if (eyeA > 0.02 && open > 0.05) {
      const sep = 0.047 * H * (0.45 + 0.55 * Math.cos(face * 1.25)), ex = hx + face * 0.035 * H, s = H / 110;
      c.save(); c.globalCompositeOperation = "lighter";
      for (let k = -1; k <= 1; k += 2) {
        const px = ex + k * sep;
        blot(c, G.W, px, hy, 5.5 * s * (0.8 + 0.4 * eyeA), 4.2 * s * open, eyeA * 0.5);
        c.fillStyle = rgba("#f4f7ff", eyeA);
        c.fillRect(px - 0.9 * Math.max(s, 0.7), hy - 0.7 * open * Math.max(s, 0.7), 1.8 * Math.max(s, 0.7), 1.4 * open * Math.max(s, 0.7));
      }
      c.restore();
    }
  };

  /** Тени одного слоя (far/near) в dyn: появление/растворение, моргание, медленный поворот. */
  const drawShadowLayer = (c, v, m, R, off, list, kDepth) => {
    const th = THEMES_MURK, Q = th.Q, G = unitGrads(c), kH = v.tileH / 390 * kDepth;
    if (!Q) return;
    const reach = Math.max(v.w * 0.5, 1);
    for (let i = 0; i < list.length; i++) {
      const S = list[i];
      // появление: порог по рангу и собственное медленное «дыхание» видимости; в брейке почти нет
      const vis = clamp((Q.pres - S.r * 0.85) / 0.2, 0, 1);
      const nat = 0.5 + 0.5 * Math.sin(Q.sh * 0.17 + S.ph * 5);
      const V = vis * sstep(0.12, 0.5, nat);
      if (V < 0.02) continue;
      // моргание: цикл S.T секунд (время теней Q.sh), закрытые глаза недолго; в брейке замирают открытыми
      const u = ((Q.sh / S.T + S.ph / TAU) % 1 + 1) % 1;
      const blink = u > 0.74 && u < 0.8 ? Math.abs(u - 0.77) / 0.03 : 1;
      const open = lerp(blink, 1, Q.brk);
      const face = Math.sin(Q.sh * 0.21 * S.flip + S.ph * 3);       // -1..1: поворот головы
      const sway = Math.sin(Q.sh * 0.43 + S.ph * 2) * 0.03 * S.H * kH;
      v.repeat(off, S.x, x => {
        const y = layerY(v, S.y);
        const dc = Math.abs(x - Q.cx) / (Q.R * 1.15 + reach * 0.1);
        const att = 0.55 + 0.45 * sstep(0.1, 0.85, dc);                   // у светлого центра тени бледнее: не спорят с героем
        const body = 0.9 * V * att * (kDepth > 1 ? 1 : 0.8);
        const eyeA = clamp(V * 1.8, 0, 1) * (0.75 + 0.25 * att) * Q.eye * open;
        drawShadow(c, G, S, x, y, kH, body, eyeA, open, face, sway);
      });
    }
  };
  let THEMES_MURK = null;

  THEMES.push(
    {
      id: "murk", name: "Морок", desc: "тихая, тёмная и разреженная музыка: эмбиент, медленные ритмы",
      pal: { sky: ["#07080a", "#1c1e22"], glow: "#e6eaf0", neonA: "#b9c1cd", neonB: "#8d96a4", floor: "#0a0b0d", edge: "#8c939d", fog: "#25272c" },
      // узкий профиль: тёмный по тембру (низкий центроид), почти без ударных и верхов, негромкий; bpm/density не берём — у треков без бита они случайны.
      // Ритмичные и яркие треки дают у этого профиля ≈0 по bright и perc, поэтому базовые арены он не отбирает
      profile: { bright: [0.17, 0.06], perc: [0.18, 0.12], high: [0.07, 0.05], loudness: [0.45, 0.25] },
      fogA: 0.42,
      layers: [
        // 1) дальний дым: широкие светлые клубы (свет «окна» подпитывает их), рваные тёмные массы и маленькие бледные тени у горизонта
        { f: 0.08, drift: -5, haze: 0.4, paint(c, w, h, rng, A) {
          A.far = []; clipTile(c, w, h);
          for (let i = 0; i < 9; i++) lightCloud(c, w, h, rng, rng() * w, h * lerp(0.25, 0.85, rng()), h * lerp(0.18, 0.3, rng()), 0.12);
          for (let i = 0; i < 9; i++) darkCloud(c, w, h, rng, rng() * w, h * lerp(0.2, 0.85, rng()), h * lerp(0.14, 0.24, rng()), 0.4);
          placeShadows(A.far, w, h, rng, 5, h * 0.17, h * 0.26, 0); endTile(c, w, h);
        }, dyn(c, v, m, pal, R, off, A) { drawShadowLayer(c, v, m, R, off, A.far, 0.9); } },
        // 2) средний дым: полосы тумана над землёй и тени покрупнее
        { f: 0.22, drift: 13, paint(c, w, h, rng, A) {
          A.near = []; clipTile(c, w, h);
          for (let i = 0; i < 7; i++) lightCloud(c, w, h, rng, rng() * w, h * lerp(0.45, 0.95, rng()), h * lerp(0.1, 0.17, rng()), 0.1);
          for (let i = 0; i < 6; i++) darkCloud(c, w, h, rng, rng() * w, h * lerp(0.3, 0.92, rng()), h * lerp(0.12, 0.2, rng()), 0.38);
          placeShadows(A.near, w, h, rng, 4, h * 0.27, h * 0.38, 0.5); endTile(c, w, h);
        }, dyn(c, v, m, pal, R, off, A) { drawShadowLayer(c, v, m, R, off, A.near, 1.25); } },
        // 3) ближняя дымка у земли: тёмная, густая; за персонажами не мешает читаться
        { top: 0.5, f: 0.45, drift: -19, paint(c, w, h, rng) {
          clipTile(c, w, h);
          for (let i = 0; i < 8; i++) darkCloud(c, w, h, rng, rng() * w, h * lerp(0.78, 1.0, rng()), h * lerp(0.1, 0.17, rng()), 0.34);
          for (let i = 0; i < 5; i++) lightCloud(c, w, h, rng, rng() * w, h * lerp(0.84, 1.0, rng()), h * lerp(0.07, 0.12, rng()), 0.07);
          endTile(c, w, h);
        } },
      ],
      build(rng, tileW, tileH) {
        THEMES_MURK = this;
        // клубы вокруг светлого окна (экранные): орбиты с разной скоростью, часть тёмных
        this.puffs = [];
        for (let i = 0; i < 9; i++) this.puffs.push({ a: rng() * TAU, rho: lerp(0.25, 1.05, rng()), w: (rng() < 0.5 ? -1 : 1) * lerp(0.025, 0.08, rng()), rx: lerp(0.26, 0.44, rng()), ry: lerp(0.15, 0.26, rng()), dark: i % 3 === 0, al: lerp(0.5, 1, rng()) });
        // пылинки: нормированные координаты, глубина z, фаза мерцания
        this.dust = [];
        for (let i = 0; i < 64; i++) this.dust.push({ x: rng(), y: rng(), z: lerp(0.3, 1, rng()), ph: rng() * TAU, vx: lerp(-5, 5, rng()), s: rng() < 0.15 ? 2.2 : 1.4 });
        if (!this.Q) this.Q = { sh: 0, pres: 0.45, eye: 0.4, hot: 0, brk: 0, bld: 0, calm: 0, cx: 0, cy: 0, R: 300, spin: 1, pulse: 0, strong: 0, I: 0.7, moteUp: 0 };
      },
      /** Светлое «окно» вокруг героя/центра и состояние всей сцены (сглаженное). */
      back(c, v, m, pal, R) {
        const Q = this.Q, G = unitGrads(c), A = R.arena, kw = A.kw, dt = Math.min(R.dt || 0, 0.05);
        THEMES_MURK = this;
        const hotT = kw.drop + kw.climax, brkT = kw.break, calmT = kw.calm + kw.intro + kw.outro;
        Q.hot = damp(Q.hot, hotT, 3, dt); Q.brk = damp(Q.brk, brkT, 2.5, dt); Q.calm = damp(Q.calm, calmT, 2, dt);
        Q.bld = damp(Q.bld, A.buildW || 0, 2.2, dt); Q.I = damp(Q.I, m.I, 1.2, dt);
        Q.pulse = damp(Q.pulse, m.pulse || 0, 5, dt); Q.strong = damp(Q.strong, m.strong || 0, 3.5, dt);
        // число видимых теней и яркость глаз: на дропе больше и ярче, в брейке почти исчезают
        Q.pres = damp(Q.pres, clamp(0.42 + 0.5 * Q.hot + 0.15 * Q.bld - 0.3 * Q.brk, 0.05, 1), 1.2, dt);
        Q.eye = damp(Q.eye, 0.32 + 0.6 * Q.hot + 0.14 * Q.bld + 0.3 * Q.hot * Q.pulse - 0.08 * Q.calm, 2.5, dt);
        // общее время теней/клубов — интеграл: брейк замедляет почти до остановки без скачка фазы
        Q.spin = damp(Q.spin, (1 + 0.8 * Q.hot) * (1 - 0.88 * Q.brk), 1.5, dt);
        Q.sh += dt * Q.spin;
        // окно света: к игроку в брейке, уже и плотнее
        const px = v.playerX != null ? v.playerX : v.w / 2, k = Q.brk;
        const tx = lerp(lerp(v.w / 2, px, 0.2), px, k), ty = lerp(v.floorY * 0.62, v.floorY - 34 * (v.scale || 1), k);
        const tR = Math.max(v.w * 0.4, v.floorY * 0.85) * lerp(1, 0.4, k) * (1 - 0.1 * Q.bld) * (1 + 0.05 * Q.hot * Q.pulse);
        if (!Q.init) { Q.cx = tx; Q.cy = ty; Q.R = tR; Q.init = 1; }
        Q.cx = damp(Q.cx, tx, 3, dt); Q.cy = damp(Q.cy, ty, 3, dt); Q.R = damp(Q.R, tR, 2.6, dt);
        const amp = clamp(0.72 + 0.28 * Q.I - 0.1 * Q.calm + 0.18 * Q.bld + 0.1 * Q.hot, 0.4, 1);
        blot(c, G.L, Q.cx, Q.cy, Q.R, Q.R * 0.8, amp);
        if (k > 0.03) blot(c, G.L, px, v.floorY - 40 * (v.scale || 1), Q.R * 0.7, Q.R * 0.55, 0.55 * k);   // свет самого героя
        // дроп: белые вспышки света из центра — на входе (dropFlash) и на сильных долях
        const fl = A.dropFlash || 0, burst = 0.45 * fl * fl + 0.16 * Q.hot * Q.strong;
        if (burst > 0.01) {
          c.save(); c.globalCompositeOperation = "lighter";
          blot(c, G.L, Q.cx, Q.cy, Q.R * (1.15 + 0.4 * fl), Q.R * (0.95 + 0.3 * fl), clamp(burst, 0, 0.7));
          c.restore();
        }
      },
      /** Клубы вокруг окна поверх дальних слоёв (тени прячутся в них). */
      mid(c, v, m, pal, R) {
        const Q = this.Q, G = unitGrads(c), dt = Math.min(R.dt || 0, 0.05), n = R.amount < 1 ? 5 : this.puffs.length;
        const gather = 1 - 0.42 * Q.bld;     // нарастание: клубы стягиваются к центру и густеют
        for (let i = 0; i < n; i++) {
          const p = this.puffs[i];
          p.a += dt * p.w * Q.spin;
          const rr = p.rho * Q.R * gather;
          const x = Q.cx + Math.cos(p.a) * rr * 1.25, y = Q.cy + Math.sin(p.a) * rr * 0.5;
          const sz = Q.R * (1 - 0.15 * Q.bld);
          if (p.dark) blot(c, G.D, x, y, sz * p.rx * 0.9, sz * p.ry * 0.9, 0.2 * p.al * (1 - 0.5 * Q.brk));
          else blot(c, G.L, x, y, sz * p.rx, sz * p.ry, (0.2 + 0.28 * Q.bld) * p.al);
        }
        // тёмные края: чем уже окно света (брейк), тем плотнее тьма вокруг. Центр с нулевой прозрачностью не заливаем (экономия заливки).
        const rx = Q.R * 1.6, ry = Q.R * 1.3, x0 = Math.round(clamp(Q.cx - rx * 0.25, 0, v.w)), x1 = Math.round(clamp(Q.cx + rx * 0.25, 0, v.w)), y0 = Math.round(clamp(Q.cy - ry * 0.25, 0, v.h)), y1 = Math.round(clamp(Q.cy + ry * 0.25, 0, v.h));   // края целые пиксели — без шва между частями
        c.save(); c.translate(Q.cx, Q.cy); c.scale(rx, ry); c.fillStyle = G.E;
        const ux = -Q.cx / rx, uy = -Q.cy / ry, uw = v.w / rx;
        c.fillRect(ux, uy, uw, (y0 - 0) / ry);                                   // сверху
        c.fillRect(ux, (y1 - Q.cy) / ry, uw, (v.h - y1) / ry);                   // снизу
        c.fillRect(ux, (y0 - Q.cy) / ry, (x0 - 0) / rx, (y1 - y0) / ry);          // слева
        c.fillRect((x1 - Q.cx) / rx, (y0 - Q.cy) / ry, (v.w - x1) / rx, (y1 - y0) / ry);   // справа
        c.restore();
      },
      floor(c, v, m, pal, R) {
        const Q = this.Q, G = unitGrads(c), s = v.scale || 1, px = v.playerX != null ? v.playerX : v.w / 2;
        // свет героя на земле и низкие полосы мглы, которые едут с камерой
        blot(c, G.L, px, v.floorY + 6, 150 * s, 15 * s, 0.5 + 0.35 * Q.brk + 0.2 * Q.hot * Q.pulse);
        const step = 260, ox = -(v.camX * s * 0.9 + m.time * 5) % step;
        for (let x = ox - step; x < v.w + step; x += step) blot(c, G.L, x + 90, v.floorY + 4, 170, 11, 0.16 * (0.6 + 0.4 * Q.I));
      },
      front(c, v, m, pal, R) {
        const Q = this.Q, dt = Math.min(R.dt || 0, 0.05);
        if (!this.dust) return;
        // пылинки: движутся интегрированием (скорость вверх сглажена Q.bld), мерцают, ярче у светлого окна
        Q.moteUp = damp(Q.moteUp, 1 + 3.4 * Q.bld + 0.8 * Q.hot, 2, dt);
        const W = v.w * 1.2, Hh = v.floorY + 20, n = R.amount < 1 ? 32 : this.dust.length, cam = v.camX * (v.scale || 1);
        c.save(); c.globalCompositeOperation = "lighter";
        for (let i = 0; i < n; i++) {
          const d = this.dust[i];
          d.x += d.vx * dt / W + Math.sin(m.time * 0.3 + d.ph) * 0.0004 * dt;
          d.y -= (4 + 9 * d.z) * Q.moteUp * dt / Hh;
          if (d.y < -0.02) d.y += 1.04; if (d.y > 1.02) d.y -= 1.04;
          d.x -= Math.floor(d.x);
          const x = (((d.x * W - cam * 0.25 * d.z) % W) + W) % W - v.w * 0.1, y = d.y * Hh;
          const lit = 0.3 + 0.7 * (1 - sstep(0.2, 1.1, Math.hypot((x - Q.cx) / (Q.R * 1.2), (y - Q.cy) / (Q.R * 0.9))));
          const a = (0.2 + 0.35 * (0.5 + 0.5 * Math.sin(m.time * 1.3 + d.ph * 3))) * lit * (0.5 + 0.5 * d.z);
          c.fillStyle = rgba("#e8ecf4", a);
          c.fillRect(x, y, d.s * (0.7 + 0.5 * d.z), d.s * (0.7 + 0.5 * d.z));
        }
        c.restore();
      },
    }
  );
}
