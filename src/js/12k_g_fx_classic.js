/* =====================================================================
   Фирменные следы ударов и попаданий шести классических видов ближнего боя (по жалобе «в быстром бою оружие различается,
   но не сильно — сделай ярко и заметно»): registerWeaponFx из 12d_kits. Здесь только эффекты (след удара, попадание, высота
   звука попадания), урон/хитбоксы/тайминги не меняются. Всё в неоне игры: accent + белая сердцевина.
     dagger «Теневой кинжал» — короткие быстрые двойные росчерки крест-накрест, тени-полоски, высокий звонкий звук;
     spear  «Ночное копьё»   — длинный прямой прокол «в струну», волна на кончике, пробивающая линия насквозь;
     glaive «Лунная глефа»   — два встречных полумесяца (оба лезвия) и кольцо, на попадании — «лунный серп» вокруг цели;
     kusari «Цепной серп»    — звенящая дуга цепи со звеньями и грузом, щелчок на попадании (серебристые искры);
     katana «Багровая катана» — очень тонкий длинный разрез: сначала цвет клинка, через 0,06 с «проявляется» белой вспышкой; лепестки;
     axe    «Боевой топор»   — тяжёлая широкая тройная дуга, удар земли (волна, пыль, трещины), сильная тряска, глухой низкий звук.
   Отложенные части (разрез катаны проявляется, второй росчерк кинжала) идут через маленькую очередь UCQ без аллокаций:
   она обновляется из обёртки CombatSystem.update и сбрасывается в reset. В low (g.fx.low) — только основная линия/дуга.
   Все приёмы с def.martial (рукопашные) сюда не попадают — это решает weaponFxOf в 12d_kits.
   ===================================================================== */
{
  const PI = Math.PI, UC_WHITE = "#ffffff";

  /* ---------- очередь отложенных росчерков (без аллокаций в кадре) ---------- */
  const UCQ = [];
  for (let i = 0; i < 24; i++) UCQ.push({ on: false, t: 0, x1: 0, y1: 0, x2: 0, y2: 0, w: 1, life: 0.2, col: UC_WHITE, glow: 0 });
  function later(t, x1, y1, x2, y2, w, life, col, glow) {
    for (let i = 0; i < UCQ.length; i++) {
      const q = UCQ[i];
      if (q.on) continue;
      q.on = true; q.t = t; q.x1 = x1; q.y1 = y1; q.x2 = x2; q.y2 = y2; q.w = w; q.life = life; q.col = col; q.glow = glow;
      return;
    }
  }
  const ucTick = (g, dt) => {
    for (let i = 0; i < UCQ.length; i++) {
      const q = UCQ[i];
      if (!q.on) continue;
      q.t -= dt;
      if (q.t > 0) continue;
      q.on = false;
      g.fx.cut(q.x1, q.y1, q.x2, q.y2, q.col, q.w, q.life);
      if (q.glow > 0 && !g.fx.low) g.fx.glow((q.x1 + q.x2) / 2, (q.y1 + q.y2) / 2, 4, q.glow, UC_WHITE, 0.16, 0.5);
    }
  };
  {
    const up0 = CombatSystem.prototype.update;
    CombatSystem.prototype.update = function (dt) { up0.call(this, dt); ucTick(this.game, dt); };
    const rs0 = CombatSystem.prototype.reset;
    CombatSystem.prototype.reset = function () { rs0.call(this); for (let i = 0; i < UCQ.length; i++) UCQ[i].on = false; };
  }

  /* ---------- геометрия удара: концы дуги приёма в мире (в статический объект, без аллокаций) ---------- */
  const G = { cx: 0, cy: 0, r: 0, x0: 0, y0: 0, x1: 0, y1: 0, w0: 0, w1: 0 };
  function geom(p, act, sub, r) {
    const def = act.def, d = act.dir, arc = def.arc || [-2.3, 0.7];
    const [a0, a1] = sub % 2 && !def.spin ? [arc[1] - 2.2, arc[0] + 2.2] : arc;
    const wA = d > 0 ? PI / 2 - a0 : PI / 2 + a0, wB = d > 0 ? PI / 2 - a1 : PI / 2 + a1;
    G.cx = p.x + d * 6; G.cy = p.y - 20; G.r = r;
    G.x0 = G.cx + Math.cos(wA) * r; G.y0 = G.cy + Math.sin(wA) * r;
    G.x1 = G.cx + Math.cos(wB) * r; G.y1 = G.cy + Math.sin(wB) * r;
    // мировые углы дуги в порядке возрастания (как у общего следа)
    let w0 = d > 0 ? PI / 2 - (a0 - 0.4) : PI / 2 + (a0 - 0.4), w1 = wB;
    if (d < 0) { const t = w0; w0 = w1; w1 = t; }
    if (w1 < w0) w1 += TAU;
    G.w0 = w0; G.w1 = w1;
  }

  /* =====================================================================
     КИНЖАЛ: короткие быстрые двойные росчерки
     ===================================================================== */
  registerWeaponFx("dagger", {
    hitRate: 1.3,
    slash(g, p, act, sub) {
      const col = p.skin.accent, d = act.dir, def = act.def, fx = g.fx;
      geom(p, act, sub, 22 * (def.fxR || 1));
      const mx = (G.x0 + G.x1) / 2, my = (G.y0 + G.y1) / 2;
      if (def.spin) {
        // вихрь: три коротких радиальных росчерка и маленькое кольцо — «веер лезвий»
        fx.ring(G.cx, G.cy, 8, 36, col, 0.22, 2.4);
        for (let i = 0; i < 3; i++) {
          const a = (act.t * 9 + i * TAU / 3) + (d > 0 ? 0 : PI);
          fx.cut(G.cx + Math.cos(a) * 8, G.cy + Math.sin(a) * 8, G.cx + Math.cos(a) * 30, G.cy + Math.sin(a) * 30, i ? col : UC_WHITE, i ? 2.6 : 1.6, 0.13);
        }
        return true;
      }
      // два коротких росчерка крест-накрест: основной по хорде дуги и встречный чуть ниже, быстрее и тоньше
      fx.cut(G.x0 * 0.4 + mx * 0.6, G.y0 * 0.4 + my * 0.6, G.x1, G.y1, col, 3, 0.15);
      fx.cut(G.x0 * 0.4 + mx * 0.6 + d * 2, G.y0 * 0.4 + my * 0.6, G.x1, G.y1, UC_WHITE, 1.1, 0.11);
      later(0.035, G.x1 - d * 3, G.y0 * 0.3 + my * 0.7, mx - d * 8, G.y1 + (G.y1 > G.y0 ? -9 : 9), 2, 0.12, col, 0);
      if (!fx.low) {
        // тени-полоски за ударом: два тонких следа назад
        fx.line(G.x0, G.y0, G.x0 - d * 16, G.y0 + 2, col, 1.8, 0.1);
        fx.line(G.x0, G.y0 + 5, G.x0 - d * 11, G.y0 + 7, col, 1.2, 0.08);
      }
      return true;
    },
    thrust(g, p, act) {
      const col = p.skin.accent, d = act.dir, y = p.y - 19, fx = g.fx;
      const x0 = p.x + d * 6, x1 = p.x + d * (act.def.reach + 14);
      fx.cut(x0, y, x1, y, col, 3, 0.13);
      fx.cut(x0, y - 2, x1 - d * 4, y - 2, UC_WHITE, 1, 0.1);
      if (!fx.low) later(0.03, x0 + d * 6, y + 3, x1 + d * 3, y + 3, 1.6, 0.1, col, 0);
      return true;
    },
    hit(g, e, act, hx, hy, dirX) {
      const col = g.player.skin.accent, fx = g.fx;
      // маленький крестик-росчерк в точке попадания
      fx.cut(hx - 9, hy - 7, hx + 9, hy + 7, UC_WHITE, 1.6, 0.14);
      if (!fx.low) fx.cut(hx + 9, hy - 7, hx - 9, hy + 7, col, 1.6, 0.14);
    },
  });

  /* =====================================================================
     КОПЬЁ: длинный прямой прокол, волна на кончике, пробивающая линия
     ===================================================================== */
  registerWeaponFx("spear", {
    hitRate: 1,
    slash(g, p, act, sub) {
      const col = p.skin.accent, d = act.dir, def = act.def, nm = act.name, fx = g.fx;
      const x0 = p.x + d * 6, y = p.y - 20, L = def.reach + 32;
      if (def.spin) {
        // вращение древка: кольцо и две встречные линии — древко по диаметру
        const a = act.t * 14;
        fx.ring(x0, y, 10, def.reach + 10, col, 0.26, 3);
        for (let i = 0; i < 2; i++) {
          const s = i ? -1 : 1;
          fx.cut(x0, y, x0 + Math.cos(a) * L * 0.8 * s, y + Math.sin(a) * L * 0.8 * s, i ? col : UC_WHITE, i ? 3 : 1.6, 0.16);
        }
        return true;
      }
      // направление древка: подъёмный — вверх-вперёд, нижний укол (slash2) — под углом вниз, остальное — в струну
      const up = nm === "rise" ? -0.62 : 0, dn = nm === "slash2" ? 0.2 : 0;
      const ex = x0 + d * L * Math.cos(up), ey = y + L * (Math.sin(up) + dn);
      fx.line(x0, y, ex, ey, col, 4.2, 0.15);
      fx.cut(x0, y, ex + d * 22, ey + (up ? -14 : 0), UC_WHITE, 1.4, 0.18);
      fx.ring(ex, ey, 2, 17, UC_WHITE, 0.2, 2);
      if (!fx.low) {
        fx.line(x0 + d * 8, y - 4.5, x0 + d * L * 0.55, y - 4.5 + (ey - y) * 0.55, col, 1, 0.1);
        fx.line(x0 + d * 8, y + 4.5, x0 + d * L * 0.55, y + 4.5 + (ey - y) * 0.55, col, 1, 0.1);
        fx.sparks(ex, ey, 3, col, 240, Math.atan2(ey - y, ex - x0), 0.5, 0.2);
      }
      return true;
    },
    thrust(g, p, act) {
      const col = p.skin.accent, d = act.dir, y = p.y - 20, fx = g.fx;
      const x0 = p.x + d * 6, L = act.def.reach + 40;
      // длинная прямая струна: широкий неоновый след и тонкая белая линия, уходящая за кончик (пробивающая)
      fx.line(x0, y, x0 + d * L, y, col, 4.4, 0.16);
      fx.cut(x0, y, x0 + d * (L + 38), y, UC_WHITE, 1.4, 0.2);
      fx.ring(x0 + d * L, y, 2, 20, UC_WHITE, 0.22, 2.2);
      if (!fx.low) {
        fx.line(x0 + d * 10, y - 5, x0 + d * L * 0.6, y - 5, col, 1, 0.1);
        fx.line(x0 + d * 10, y + 5, x0 + d * L * 0.6, y + 5, col, 1, 0.1);
        fx.glow(x0 + d * L, y, 3, 18, col, 0.15, 0.55);
      }
      return true;
    },
    hit(g, e, act, hx, hy, dirX, perfect) {
      const col = g.player.skin.accent, fx = g.fx, p = g.player;
      // пробивающая линия насквозь: от героя через цель и дальше
      fx.cut(hx - dirX * 46, hy, hx + dirX * (perfect ? 78 : 58), hy, UC_WHITE, 1.6, 0.2);
      if (!fx.low) fx.sparks(hx + dirX * 12, hy, 5, col, 320, dirX > 0 ? 0 : PI, 0.35, 0.22);
    },
  });

  /* =====================================================================
     ГЛЕФА: два встречных полумесяца и кольцо
     ===================================================================== */
  registerWeaponFx("glaive", {
    hitRate: 0.92,
    slash(g, p, act, sub) {
      const col = p.skin.accent, def = act.def, fx = g.fx, fw = def.fxW || 1;
      geom(p, act, sub, (def.spin ? 34 : 26) * (def.fxR || 1));
      // передний полумесяц и ВСТРЕЧНЫЙ задний (оба лезвия): задний — с другой стороны оси, чуть меньше
      fx.slashArc(G.cx, G.cy, G.r, G.w0, G.w1, col, (act.empowered ? 10 : 7) * fw, 0.22);
      fx.slashArc(G.cx, G.cy, G.r - 5, G.w0, G.w1, UC_WHITE, 2.2, 0.13);
      fx.slashArc(G.cx, G.cy, G.r * 0.7, G.w0 + PI, G.w1 + PI, col, (act.empowered ? 7 : 5) * fw, 0.18);
      fx.slashArc(G.cx, G.cy, G.r * 0.7 - 4, G.w0 + PI, G.w1 + PI, UC_WHITE, 1.4, 0.1);
      if (!fx.low) {
        // сияние на концах лезвий и кольцо по оси вращения
        fx.glow(G.x1, G.y1, 3, 15, col, 0.14, 0.55);
        fx.ring(G.cx, G.cy, 6, def.spin ? 52 : 30, col, 0.28, def.spin ? 3.4 : 2);
      }
      return true;
    },
    thrust(g, p, act) {
      const col = p.skin.accent, d = act.dir, y = p.y - 20, fx = g.fx;
      const x0 = p.x + d * 6, L = act.def.reach + 14;
      // передний выпад и короткий обратный уход заднего лезвия
      fx.line(x0, y, x0 + d * L, y, col, 5, 0.16);
      fx.line(x0, y, x0 + d * L, y, UC_WHITE, 1.6, 0.11);
      fx.line(x0 - d * 4, y + 2, x0 - d * (L * 0.5), y + 2, col, 3.4, 0.13);
      fx.slashArc(x0 + d * L, y, 9, d > 0 ? -1.2 : PI - 1.2, d > 0 ? 1.2 : PI + 1.2, col, 3, 0.15);
      return true;
    },
    hit(g, e, act, hx, hy, dirX) {
      const col = g.player.skin.accent, fx = g.fx;
      // «лунный серп» вокруг цели: два встречных полумесяца и кольцо
      fx.slashArc(hx, hy, 13, dirX > 0 ? -1.9 : PI - 1.9, dirX > 0 ? 1.9 : PI + 1.9, col, 4, 0.2);
      if (!fx.low) {
        fx.slashArc(hx, hy, 13, dirX > 0 ? PI - 1.9 : -1.9, dirX > 0 ? PI + 1.9 : 1.9, UC_WHITE, 2, 0.16);
        fx.ring(hx, hy, 4, 28, col, 0.26, 2.4);
      }
    },
  });

  /* =====================================================================
     ЦЕПНОЙ СЕРП: звенящая дуга груза, щелчок
     ===================================================================== */
  const KU_COL = "#cdd5ec";
  registerWeaponFx("kusari", {
    hitRate: 1.12,
    slash(g, p, act, sub) {
      const col = p.skin.accent, def = act.def, fx = g.fx;
      geom(p, act, sub, (def.spin ? 34 : 26) * (def.fxR || 1));
      // тонкая серебристая дуга цепи + неоновая сердцевина
      fx.slashArc(G.cx, G.cy, G.r, G.w0, G.w1, KU_COL, 3.2, 0.2);
      fx.slashArc(G.cx, G.cy, G.r + 3, G.w0 + 0.15, G.w1, col, 1.6, 0.14);
      if (!fx.low) {
        // звенья по дуге (маленькие кольца) и груз на конце с блеском
        const n = 5;
        for (let i = 1; i <= n; i++) {
          const w = G.w0 + (G.w1 - G.w0) * (i / (n + 1));
          fx.ring(G.cx + Math.cos(w) * G.r, G.cy + Math.sin(w) * G.r, 1, 5.5, KU_COL, 0.12 + 0.02 * i, 1.4);
        }
        fx.glow(G.x1, G.y1, 3, 13, col, 0.16, 0.6);
      }
      fx.cut(G.cx, G.cy + 2, G.x1, G.y1, UC_WHITE, 1.6, 0.18);
      if (def.spin) fx.ring(G.cx, G.cy, 10, 52, col, 0.3, 2.6);
      return true;
    },
    thrust(g, p, act) {
      const col = p.skin.accent, d = act.dir, y = p.y - 20, fx = g.fx;
      const x0 = p.x + d * 6, L = act.def.reach + 16;
      // бросок груза по прямой: серебристая цепь со звеньями и вспышкой на грузе
      fx.line(x0, y, x0 + d * L, y, KU_COL, 2.6, 0.15);
      fx.cut(x0, y, x0 + d * L, y, UC_WHITE, 1.2, 0.17);
      if (!fx.low) {
        for (let i = 1; i <= 4; i++) fx.ring(x0 + d * L * i / 5, y, 1, 5, KU_COL, 0.12 + 0.02 * i, 1.4);
        fx.glow(x0 + d * L, y, 3, 16, col, 0.16, 0.6);
      }
      fx.ring(x0 + d * L, y, 2, 14, col, 0.2, 2);
      return true;
    },
    hit(g, e, act, hx, hy, dirX) {
      const col = g.player.skin.accent, fx = g.fx;
      // «щелчок» груза: резкое белое кольцо, короткая ломаная трещина и серебристые искры
      fx.ring(hx, hy, 2, 17, UC_WHITE, 0.14, 2.2);
      fx.cut(hx - 7, hy - 6, hx + 7, hy + 6, UC_WHITE, 1.4, 0.1);
      if (!fx.low) {
        fx.cut(hx + 7, hy - 6, hx - 7, hy + 6, KU_COL, 1.4, 0.1);
        fx.sparks(hx, hy, 6, KU_COL, 300, null, PI, 0.22);
        fx.glow(hx, hy, 3, 16, col, 0.12, 0.5);
      }
    },
  });

  /* =====================================================================
     КАТАНА: тонкий длинный разрез, который «проявляется», и лепестки
     ===================================================================== */
  registerWeaponFx("katana", {
    hitRate: 1.18,
    slash(g, p, act, sub) {
      const col = p.skin.accent, d = act.dir, def = act.def, fx = g.fx;
      geom(p, act, sub, 30 * (def.fxR || 1));
      if (def.spin) {
        // круговой разрез: тонкое кольцо, проявляющееся белым
        fx.ring(G.cx, G.cy, 14, 46, col, 0.26, 1.6);
        later(0.06, G.cx - 30, G.cy - 1, G.cx + 30, G.cy + 1, 1.2, 0.18, UC_WHITE, 36);
        return true;
      }
      // хорда дуги, продлённая за оба конца: ОЧЕНЬ тонкая длинная линия
      let dx = G.x1 - G.x0, dy = G.y1 - G.y0;
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const e = 16, ax = G.x0 - dx * e, ay = G.y0 - dy * e, bx = G.x1 + dx * (e + 12), by = G.y1 + dy * (e + 12);
      fx.cut(ax, ay, bx, by, col, 2.2, 0.34);
      // через 0,06 с разрез «проявляется»: белая нить и вспышка по линии
      later(0.06, ax, ay, bx, by, 1.1, 0.2, UC_WHITE, 30);
      if (!fx.low) fx.sparks(bx, by, 3, col, 220, Math.atan2(dy, dx * 1), 0.7, 0.2);
      return true;
    },
    thrust(g, p, act) {
      const col = p.skin.accent, d = act.dir, y = p.y - 20, fx = g.fx;
      const x0 = p.x + d * 6, L = act.def.reach + 22;
      fx.cut(x0, y, x0 + d * L, y, col, 1.8, 0.3);
      later(0.05, x0, y, x0 + d * (L + 8), y, 1, 0.16, UC_WHITE, 22);
      return true;
    },
    hit(g, e, act, hx, hy, dirX, perfect, killed) {
      const col = g.player.skin.accent, fx = g.fx;
      // нить разреза сквозь цель по диагонали вспыхивает белым с небольшой задержкой
      const sg = act.name === "slash2" ? -1 : 1;
      later(0.05, hx - 20, hy + sg * 18, hx + 20, hy - sg * 18, 1.3, 0.2, UC_WHITE, perfect ? 40 : 26);
      if (!fx.low) fx.shards(hx, hy, killed || perfect ? 5 : 3, col, 110);      // лепестки
    },
  });

  /* =====================================================================
     ТОПОР: тяжёлая широкая дуга, удар земли, глухой звук
     ===================================================================== */
  registerWeaponFx("axe", {
    hitRate: 0.7,
    slash(g, p, act, sub) {
      const col = p.skin.accent, d = act.dir, def = act.def, fx = g.fx, fw = def.fxW || 1;
      geom(p, act, sub, (def.spin ? 36 : 28) * (def.fxR || 1));
      const w = act.empowered ? 15 : 12;
      fx.slashArc(G.cx, G.cy, G.r, G.w0, G.w1, col, w * Math.min(fw, 1.4), 0.3);
      fx.slashArc(G.cx, G.cy, G.r - 7, G.w0 + 0.1, G.w1, UC_WHITE, 3, 0.16);
      fx.slashArc(G.cx, G.cy, G.r + 7, G.w0 - 0.1, G.w1, col, 4.5, 0.36);
      g.camera.shake(def.spin ? 0.16 : 0.1);
      if (p.onGround && !def.launch) {
        // удар в землю там, где лезвие заканчивает дугу: волна, пыль и трещины по полу
        const gx = G.cx + d * Math.min(def.reach * 0.85, 40), gy = p.y;
        if (!fx.low) {
          fx.shockwave(gx, gy, col, 70);
          fx.dust(gx, gy - 1, 4, "#4a4c58");
          fx.line(gx, gy - 0.5, gx + d * 26, gy - 1.5, UC_WHITE, 1.2, 0.2);
          fx.line(gx, gy - 0.5, gx - d * 9, gy - 2, col, 1, 0.16);
        }
      }
      if (def.spin) fx.ring(G.cx, G.cy, 12, 58, col, 0.34, 4);
      return true;
    },
    thrust(g, p, act) {
      const col = p.skin.accent, d = act.dir, y = p.y - 19, fx = g.fx;
      const x0 = p.x + d * 6, L = act.def.reach + 8;
      // таран обухом: короткая толстая линия и удар по воздуху
      fx.line(x0, y, x0 + d * L, y, col, 8, 0.2);
      fx.line(x0, y, x0 + d * L, y, UC_WHITE, 2, 0.12);
      g.camera.shake(0.1);
      if (!fx.low) fx.shockwave(x0 + d * L, p.y, col, 56);
      return true;
    },
    hit(g, e, act, hx, hy, dirX, perfect, killed) {
      const col = g.player.skin.accent, fx = g.fx;
      // тяжесть: сильная тряска, волна по полу под врагом, широкое свечение, крупные искры вниз
      g.camera.shake(killed ? 0.28 : perfect ? 0.22 : 0.16);
      fx.glow(hx, hy, 8, perfect ? 50 : 40, col, 0.2, 0.55);
      fx.sparks(hx, hy + 6, perfect ? 12 : 8, "#ffe2b0", 280, PI / 2, 1.9, 0.4);
      if (!fx.low) {
        fx.shockwave(e.x, e.y, col, perfect ? 120 : 90);
        fx.dust(e.x, e.y - 1, 3, "#4a4c58");
      }
    },
  });
}
